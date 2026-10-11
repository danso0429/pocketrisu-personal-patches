// End-to-end native failure and recovery through the real browser Send button.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { createHash, randomBytes } from 'node:crypto';
const [targetArg, depsArg, fixtureArg, inventoryArg, outputArg, mode = 'foreground'] = process.argv.slice(2);
const [target, deps, fixtureFile, inventoryDir, output] = [targetArg, depsArg, fixtureArg, inventoryArg, outputArg].map(p => path.resolve(p));
assert.ok(['foreground', 'closed', 'warm', 'device'].includes(mode));
const device = mode === 'device';
const fastFailure = process.argv.includes('--fast-failure');
const loseResultAck = process.argv.includes('--lose-result-ack');
const queueNext = process.argv.includes('--queue-next');
const req = createRequire(path.join(target, 'package.json'));
const Database = req('better-sqlite3');
const runtime = fs.mkdtempSync(path.join(path.dirname(output), device ? 'g18-ui-device-' : 'g18-ui-auto-'));
process.chdir(runtime);
const { decodeRisuSave } = req('./server/node/utils.cjs');
const password = device ? randomBytes(6).toString('hex') : 'synthetic-ui-password';
const data = JSON.parse(fs.readFileSync(fixtureFile));
data.aiModel = data.subModel = 'gpt35'; data.openAIKey = 'synthetic-only';
data.nodeOnlyModelModeLock = 'legacy'; data.moduleModelBindingsEnabled = false;
data.requestRetrys = 1; data.fallbackModels = { ...data.fallbackModels, model: [], submodel: [] };
data.characters[0].name = 'G1.8 재검증'; data.characters[0].triggerscript = [];
const originalChat = data.characters[0].chats[0];
data.characters[0].chats = (device ? ['전면 테스트', '복귀 테스트', '종료 테스트'] : ['UI test']).map((name, index) => ({
  ...structuredClone(originalChat), id: index ? 'synthetic-chat-' + index : 'synthetic-chat', name,
  useModelPreset: false, message: [],
}));
data.plugins = JSON.parse(fs.readFileSync(path.join(inventoryDir, 'inventory.json'))).map(row => {
  assert.equal(path.basename(row.file), row.file);
  const source = fs.readFileSync(path.join(inventoryDir, row.file));
  assert.equal(createHash('sha256').update(source).digest('hex'), row.sha256);
  return { name: row.name, version: row.apiVersion, enabled: true, script: source.toString('utf8'), realArg: {} };
});
data.pluginCustomStorage = {};
fs.symlinkSync(path.join(target, 'dist'), path.join(runtime, 'dist'));
fs.writeFileSync(path.join(runtime, 'package.json'), JSON.stringify({ name: 'pocketrisu', version: '1.10.0' }));
const seed = fork(path.join(target, 'server/node/bgServerChatProcessClient.cjs'), [], {
  cwd: runtime, stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
});
seed.send({ scope: 'pocketrisu-h1-client', command: 'seed', runtimeRoot: runtime, targetRoot: target,
  password: createHash('sha256').update(password).digest('hex'), databaseBase64: Buffer.from(JSON.stringify(data)).toString('base64') });
assert.equal((await once(seed, 'exit'))[0], 0);
const permissionFile = process.env.G18_UI_PERMISSION_FILE;
assert.ok(permissionFile, 'Explicit saved-permission fixture required; never auto-grant plugins');
const permissionBytes = fs.readFileSync(permissionFile);
assert.ok(Array.isArray(JSON.parse(permissionBytes).given));
const seedDb = new Database(path.join(runtime, 'save/risuai.db'));
seedDb.prepare('INSERT OR REPLACE INTO kv(key,value) VALUES(?,?)').run('cache/plugin-permissions/state.json', permissionBytes);
seedDb.close();
const server = fork(path.join(target, 'server/node/server.cjs'), [], {
  cwd: runtime, execArgv: ['--require', new URL('./probes/bg-failure-ui-preload.cjs', import.meta.url).pathname],
  env: { ...process.env, PORT: device ? '6268' : '0', TUNNEL_DISABLED: '1', UPDATE_CHECK_DISABLED: '1',
    POCKETRISU_BG_PLUGIN_HOST_CANDIDATE: '0', G18_UI_PROBE: '1', G18_UI_DEVICE: device ? '1' : '0', G18_UI_FAST: fastFailure ? '1' : '0' },
  stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
});
const log = fs.createWriteStream(path.join(runtime, 'server.log'), { mode: 0o600 });
server.stdout.pipe(log); server.stderr.pipe(log);
const events = [];
server.on('message', row => events.push(row));
const port = await new Promise((resolve, reject) => {
  server.on('message', row => { if (row.event === 'ready') resolve(row.port); });
  server.once('exit', code => reject(Error('Server exited ' + code)));
});
const origin = 'http://127.0.0.1:' + port;
const readRows = prefix => {
  const db = new Database(path.join(runtime, 'save/risuai.db'), { readonly: true });
  try { return db.prepare('SELECT value FROM kv WHERE key LIKE ?').all(prefix + '%').map(row => JSON.parse(String(row.value))); }
  finally { db.close(); }
};
async function until(fn, label) {
  for (let index = 0; index < 600; index++) { if (await fn()) return; if (server.exitCode !== null) throw Error('Server stopped'); await new Promise(r => setTimeout(r, 100)); }
  throw Error('Timeout: ' + label);
}
if (device) {
  fs.writeFileSync(output, JSON.stringify({ runtime, origin, password, serverPid: server.pid, source: target, ready: true }, null, 2), { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({ ready: true, port, runtime }));
  await once(server, 'exit');
} else {
  const { chromium } = createRequire(path.join(deps, 'package.json'))('playwright');
  const browser = await chromium.launch({ headless: true, executablePath: process.env.G18_CHROMIUM || chromium.executablePath() }).catch(async error => {
    server.kill('SIGTERM'); await once(server, 'exit'); throw error;
  });
  const pageErrors = [], responses = [], snapshots = [], consoleEvents = [];
  let context, page, backgroundPage, lostAcks = 0, delayedPolls = 0, releasePolls;
  const pollGate = new Promise(resolve => { releasePolls = resolve; });
  async function open(storageState) {
    context = await browser.newContext(storageState ? { storageState } : {});
    await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
    if (loseResultAck) await context.route('**/api/bg-orchestrate-result/**', async route => {
      if (route.request().method() === 'DELETE' && lostAcks === 0) {
        const response = await route.fetch(); assert.equal(response.status(), 200);
        assert.equal((await response.json()).acked, true); lostAcks++;
        await route.abort();
      } else await route.fallback();
    });
    if (queueNext) await context.route('**/api/bg-orchestrate-chat-state/**', async route => {
      const revision = new URL(route.request().url()).searchParams.get('revision');
      if (revision && /^[0-9a-z]+-[0-9a-z]+-[0-9a-z]+$/.test(revision)) {
        const response = await route.fetch(); delayedPolls++;
        await pollGate; await route.fulfill({ response });
      } else await route.fallback();
    });
    page = await context.newPage(); page.on('pageerror', e => pageErrors.push(e.message));
    page.on('console', message => { if (message.type() === 'error' || message.text().includes('[bg-orch]')) consoleEvents.push(message.text()); });
    page.on('response', r => { if (r.url().includes('/api/bg-orchestrate')) responses.push({ url: new URL(r.url()).pathname, status: r.status() }); });
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    if (!storageState) {
      await page.getByText('Input your password.', { exact: false }).waitFor();
      await page.locator('input').fill(password); await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    }
    await page.locator('[data-char-id="synthetic-character"]').first().waitFor();
    await page.locator('[data-char-id="synthetic-character"]').first().click();
    await page.locator('textarea').waitFor();
  }
  const failureText = '서버 요청이 실패했어요. 저장된 원문이나 결과가 있다면 확인해 주세요.';
  const rawText = 'G1.8 실패 확인 ' + mode;
  try {
    await open(); await page.locator('textarea').fill(rawText);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await until(() => events.some(row => row.event === 'main' && row.failed), 'actual server main admission');
    snapshots.push({ stage: 'server-owned', buttons: await page.getByRole('button').allTextContents(), texts: (await page.locator('body').innerText()).slice(-2400) });
    if (queueNext) {
      await until(async () => await page.locator('textarea').inputValue() === '', 'first draft cleared');
      await page.locator('textarea').fill('G1.8 정상 확인');
      await page.locator('textarea').press('Enter');
      await until(() => readRows('internal/server-chat-input/v1/').length === 2, 'next input admitted while previous main is held');
    }
    const state = await context.storageState();
    if (mode === 'closed') await context.close();
    if (mode === 'warm') {
      backgroundPage = await context.newPage(); await backgroundPage.goto('about:blank'); await backgroundPage.bringToFront();
      assert.equal(await page.evaluate(() => document.visibilityState), 'hidden', 'warm control must actually hide the original document');
    }
    server.send({ event: 'release' });
    await until(() => readRows('internal/bg-notifications/v3/').some(row => row.event.code === 'operation_failed'), 'real failure producer');
    if (queueNext) {
      await until(() => readRows('internal/server-chat-commit/v1/').length === 1, 'queued next answer committed before delayed UI polls resume');
      releasePolls();
    }
    // Ordinary chat reads require JWT; BG admission uses the browser session.
    // Obtain a read observer token without replacing the active UI session.
    const login = await fetch(origin + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: createHash('sha256').update(password).digest('hex') }) });
    assert.equal(login.status, 200);
    const apiHeaders = { 'risu-auth': (await login.json()).token, 'x-chat-id': 'synthetic-chat',
      'x-client-build': JSON.parse(fs.readFileSync(path.join(target, 'dist/build-stamp.json'))).stamp };
    const read = await fetch(origin + '/api/chat-content/synthetic-character/0', { headers: apiHeaders });
    assert.equal(read.status, 200, await read.clone().text());
    const failedChat = await decodeRisuSave(new Uint8Array(await read.arrayBuffer()));
    if (queueNext) assert.deepEqual(failedChat.message.filter(row => row.role === 'user').map(row => row.data), [rawText, 'G1.8 정상 확인']);
    else assert.deepEqual(failedChat.message.filter(row => row.role === 'user').map(row => row.data), [rawText]);
    if (!queueNext) assert.equal(failedChat.message.filter(row => row.role === 'char').length, 0);
    const notices = readRows('internal/bg-notifications/v3/').filter(row => row.event.code === 'operation_failed');
    assert.equal(notices.length, 1); assert.equal(notices[0].event.chatId, 'synthetic-chat');
    assert.equal(events.filter(row => row.event === 'main' && row.failed).length, 2);
    if (mode === 'closed') await open(state);
    if (mode === 'warm') { await backgroundPage.close(); await page.bringToFront(); assert.equal(await page.evaluate(() => document.visibilityState), 'visible'); }
    await page.getByText(failureText, { exact: true }).waitFor({ timeout: 60000 });
    snapshots.push({ stage: 'failed-ui', texts: (await page.locator('body').innerText()).slice(-3000) });
    await page.screenshot({ path: path.join(runtime, 'failure-ui.png') });
    // Dismiss only the native error modal if it is present; never alter busy state.
    if (await page.getByText('백그라운드 생성이 답변 없이 끝났어요. 해당 채팅에서 다시 보내주세요.', { exact: true }).count())
      await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    if (!queueNext) {
      await page.locator('textarea').fill('G1.8 정상 확인');
      const send = page.getByRole('button', { name: 'Send', exact: true });
      assert.equal(await send.isEnabled(), true); await send.click();
    }
    await page.waitForTimeout(1000);
    snapshots.push({ stage: 'next-send', texts: (await page.locator('body').innerText()).slice(-2400), draft: await page.locator('textarea').inputValue(),
      clientMarkers: await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(key => key.includes('server-input') || key.includes('recovery')).map(key => [key, localStorage.getItem(key)]))) });
    await page.getByText('G1.8 정상 응답 확인 완료', { exact: false }).waitFor({ timeout: 60000 });
    const healthyResponse = await fetch(origin + '/api/chat-content/synthetic-character/0', { headers: apiHeaders });
    const healthy = await decodeRisuSave(new Uint8Array(await healthyResponse.arrayBuffer()));
    assert.deepEqual(healthy.message.filter(row => row.role === 'user').map(row => row.data), [rawText, 'G1.8 정상 확인']);
    assert.equal(healthy.message.filter(row => row.role === 'user')[0].chatId, failedChat.message.find(row => row.role === 'user').chatId);
    assert.deepEqual(healthy.message.filter(row => row.role === 'char').map(row => row.data), ['G1.8 정상 응답 확인 완료']);
    assert.equal(events.filter(row => row.event === 'main' && !row.failed).length, 1);
    await until(() => readRows('internal/bg-notifications/v3/')[0].deliveredAt !== null, 'delivery ACK');
    const after = await context.storageState(); await context.close(); await open(after);
    await page.waitForTimeout(5500);
    assert.equal(await page.getByText(failureText, { exact: true }).count(), 0);
    assert.equal(readRows('internal/bg-notifications/v3/').length, 1);
    assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('bg-server-input-v3:')).length), 0,
      'both failed and queued completed raw input markers must settle before a following Send');
    assert.deepEqual(pageErrors, []);
    if (loseResultAck) assert.equal(lostAcks, 1);
    const receipts = readRows('bg-orch-state-op:').filter(row => row.failedInputSettlement);
    assert.equal(receipts.length, 1);
    fs.writeFileSync(output, JSON.stringify({ passed: true, mode, runtime, source: target, failedMain: 2, healthyMain: 1,
      inputs: 2, answers: 1, notices: 1, noticeAck: true, redisplay: 0, failedInputReceipts: receipts.length,
      lostAcks, fastFailure, queueNext, delayedPolls, pageErrors, responses, snapshots, consoleEvents }, null, 2), { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ passed: true, mode, failedMain: 2, healthyMain: 1, inputs: 2, answers: 1 }));
  } catch (error) {
    if (page && !page.isClosed()) { await page.screenshot({ path: path.join(runtime, 'failed-probe.png') }).catch(() => {}); snapshots.push({ error: error.message, texts: (await page.locator('body').innerText().catch(() => '')).slice(-4000) }); }
    fs.writeFileSync(output, JSON.stringify({ passed: false, mode, runtime, error: error.message, events, pageErrors, responses, snapshots, consoleEvents }, null, 2), { mode: 0o600, flag: 'wx' });
    throw error;
  } finally { await browser.close(); if (server.exitCode === null) { server.kill('SIGTERM'); await once(server, 'exit'); } }
}
