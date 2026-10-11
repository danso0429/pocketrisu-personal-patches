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
assert.ok(['foreground', 'closed', 'warm', 'device', 'edit-positive', 'edit-negative', 'edit-device'].includes(mode));
const device = mode === 'device' || mode === 'edit-device';
const editProbe = mode.startsWith('edit-');
const fastFailure = process.argv.includes('--fast-failure');
const loseResultAck = process.argv.includes('--lose-result-ack');
const removeSettledInput = process.argv.includes('--remove-settled-input');
assert.ok(!removeSettledInput || (loseResultAck && !device && !editProbe),'Removed-input control requires an automatic lost-ACK failure trial');
const queueNext = process.argv.includes('--queue-next');
const isolatedCookies = device || process.argv.includes('--isolate-cookies');
const invalidStatsControl = process.argv.includes('--invalid-stats-control');
assert.ok(!device || !invalidStatsControl, 'Invalid fixture control is automatic-only');
const req = createRequire(path.join(target, 'package.json'));
assert.ok(fs.existsSync(path.join(target,'server/node/bgOrchBundle.mjs')),'Build the BG bundle before preparing the UI trial');
assert.ok(fs.existsSync(path.join(target,'dist/build-stamp.json')),'Build the frontend before preparing the UI trial');
const Database = req('better-sqlite3');
const runtime = fs.mkdtempSync(path.join(path.dirname(output), device ? 'g18-ui-device-' : 'g18-ui-auto-'));
process.chdir(runtime);
const { decodeRisuSave } = req('./server/node/utils.cjs');
const password = device ? randomBytes(6).toString('hex') : 'synthetic-ui-password';
const data = JSON.parse(fs.readFileSync(fixtureFile));
// Correct the synthetic seed, not the production validator. Native ??= only
// initializes a missing statics object; this fixture previously supplied {}.
if (!invalidStatsControl) {
  data.statics ??= { messages: 0, imports: 0 };
  assert.ok(typeof data.statics === 'object' && !Array.isArray(data.statics));
  for (const field of ['messages', 'imports']) {
    if (data.statics[field] === undefined) data.statics[field] = 0;
    assert.ok(Number.isSafeInteger(data.statics[field]) && data.statics[field] >= 0, 'Invalid synthetic statistic: ' + field);
  }
}
data.aiModel = data.subModel = 'gpt35'; data.openAIKey = 'synthetic-only';
data.nodeOnlyModelModeLock = 'legacy'; data.moduleModelBindingsEnabled = false;
data.requestRetrys = 1; data.fallbackModels = { ...data.fallbackModels, model: [], submodel: [] };
data.characters[0].name = 'G1.8 재검증'; data.characters[0].triggerscript = [];
const originalChat = data.characters[0].chats[0];
data.characters[0].chats = (mode==='edit-device' ? ['수정 알림 테스트','수정 없는 대조'] : device ? ['전면 테스트', '복귀 테스트', '종료 테스트'] : ['UI test', 'UI save check']).map((name, index) => ({
  ...structuredClone(originalChat), id: index ? 'synthetic-chat-' + index : 'synthetic-chat', name,
  useModelPreset: false, message: editProbe ? [
    {role:'user',data:'G1.8 편집 전 문장',chatId:'synthetic-prior-edit-user'},
    {role:'char',data:'G1.8 편집 시험의 앞선 답변',chatId:'synthetic-prior-edit-answer'},
  ] : [],
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
if (device && process.argv.includes('--prepare-device-only')) {
  fs.writeFileSync(output,JSON.stringify({runtime,password,source:target,port:mode==='edit-device'?6270:6268,
    cookieName:mode==='edit-device'?'g18-edit-session':'g18-ui-session',ready:false,prepared:true},null,2),{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({prepared:true,runtime,mode}));process.exit(0);
}
const server = fork(path.join(target, 'server/node/server.cjs'), [], {
  cwd: runtime, execArgv: ['--require', new URL('./probes/bg-failure-ui-preload.cjs', import.meta.url).pathname],
  env: { ...process.env, PORT: mode==='edit-device' ? '6270' : device ? '6268' : '0', TUNNEL_DISABLED: '1', RISU_UPDATE_CHECK: 'false',
    POCKETRISU_BG_PLUGIN_HOST_CANDIDATE: '0', G18_UI_PROBE: '1', G18_UI_DEVICE: device ? '1' : '0', G18_UI_FAST: fastFailure ? '1' : '0',
    G18_UI_COOKIE_NAMESPACE: isolatedCookies ? '1' : '0', G18_UI_COOKIE_NAME: mode==='edit-device'?'g18-edit-session':'g18-ui-session' },
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
async function readDatabase() {
  const db = new Database(path.join(runtime, 'save/risuai.db'), { readonly: true });
  try {
    const bytes = db.prepare("SELECT value FROM kv WHERE key='database/database.bin'").get().value;
    return { bytes: Buffer.from(bytes), data: await decodeRisuSave(new Uint8Array(bytes)) };
  } finally { db.close(); }
}
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
  const pageErrors = [], responses = [], snapshots = [], consoleEvents = [], dialogs = [], saveResponses = [], saveBodyTasks = [];
  function assertNoInvalidSave() {
    assert.equal([...consoleEvents, ...dialogs, ...saveResponses.map(row => row.body || '')].some(text => text.includes('Server rejected an invalid database update') || text.includes('server statistic count is invalid')), false,
      'browser database write must not be rejected');
  }
  let context, page, backgroundPage, lostAcks = 0, delayedPolls = 0, releasePolls, holdProof=removeSettledInput;
  const pollGate = new Promise(resolve => { releasePolls = resolve; });
  async function open(storageState) {
    context = await browser.newContext(storageState ? { storageState } : {});
    if(editProbe)await context.addInitScript(()=>{
      const seen=new WeakSet();(window).__g18ObservedToasts=[];
      const scan=()=>{for(const toast of document.querySelectorAll('.risu-toast')){
        const title=toast.querySelector('.risu-toast-title')?.textContent?.trim();
        if(title&&!seen.has(toast)){seen.add(toast);(window).__g18ObservedToasts.push(title);}
      }};
      new MutationObserver(scan).observe(document,{childList:true,subtree:true,characterData:true});
    });
    if (isolatedCookies && !storageState) await context.addCookies([{ name:'risu-session', value:'production-cookie-control', url:origin }]);
    await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
    if (loseResultAck) await context.route('**/api/bg-orchestrate-result/**', async route => {
      if (route.request().method() === 'DELETE' && lostAcks === 0) {
        const response = await route.fetch(); assert.equal(response.status(), 200);
        assert.equal((await response.json()).acked, true); lostAcks++;
        await route.abort();
      } else await route.fallback();
    });
    if(removeSettledInput)await context.route('**/api/bg-orchestrate-status/**',route=>
      holdProof&&lostAcks>0?route.abort():route.fallback());
    if (queueNext) await context.route('**/api/bg-orchestrate-chat-state/**', async route => {
      const revision = new URL(route.request().url()).searchParams.get('revision');
      if (revision && /^[0-9a-z]+-[0-9a-z]+-[0-9a-z]+$/.test(revision)) {
        const response = await route.fetch(); delayedPolls++;
        await pollGate; await route.fulfill({ response });
      } else await route.fallback();
    });
    page = await context.newPage(); page.on('pageerror', e => pageErrors.push(e.message));
    page.on('dialog', dialog => { dialogs.push(dialog.message()); void dialog.dismiss(); });
    page.on('console', message => { if (message.type() === 'error' || message.text().includes('[bg-orch]')) consoleEvents.push(message.text()); });
    page.on('response', r => { if (r.url().includes('/api/bg-orchestrate')) responses.push({ url: new URL(r.url()).pathname, status: r.status() }); });
    page.on('response', r => {
      const request = r.request();
      if (!['GET','HEAD'].includes(request.method()) && /\/api\/(?:write|patch|db)/.test(new URL(r.url()).pathname)) {
        const row = { path: new URL(r.url()).pathname, method: request.method(), status: r.status() };
        saveResponses.push(row);
        if (r.status() >= 400) saveBodyTasks.push(r.text().then(text => { row.body = text.slice(0, 1000); }).catch(() => { row.bodyError = 'response-body-unavailable'; }));
      }
    });
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
    if (editProbe) {
      await open(); await page.locator('textarea').fill('G1.8 정상 확인 D ' + mode);
      await page.getByRole('button', {name:'Send',exact:true}).click();
      await until(()=>events.some(row=>row.event==='edit-held'),'actual prompt assembly');
      const held = events.find(row=>row.event==='edit-held');
      assert.equal(held.beforeEdit,true); assert.equal(held.afterEdit,false);
      const login = await fetch(origin+'/api/login',{method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({password:createHash('sha256').update(password).digest('hex')})});
      assert.equal(login.status,200);
      const headers={'risu-auth':(await login.json()).token,'x-chat-id':'synthetic-chat',
        'x-client-build':JSON.parse(fs.readFileSync(path.join(target,'dist/build-stamp.json'))).stamp};
      const readChat=async()=>{
        const response=await fetch(origin+'/api/chat-content/synthetic-character/0',{headers});
        assert.equal(response.status,200);return decodeRisuSave(new Uint8Array(await response.arrayBuffer()));
      };
      const prior = page.locator('[data-chat-id="synthetic-prior-edit-user"]');
      await prior.scrollIntoViewIfNeeded();
      if(mode==='edit-positive'){
        await prior.locator('.button-icon-edit').click();
        await prior.locator('textarea').fill('G1.8 편집 후 문장');
        await prior.locator('.button-icon-edit').click();
        await until(async()=>{
          assertNoInvalidSave();return (await readChat()).message.find(row=>row.chatId==='synthetic-prior-edit-user')?.data==='G1.8 편집 후 문장';
        },'actual UI edit must persist before provider release');
      }else{
        await page.locator('body').evaluate(element=>element.scrollIntoView());
        assert.equal((await readChat()).message.find(row=>row.chatId==='synthetic-prior-edit-user').data,'G1.8 편집 전 문장');
      }
      server.send({event:'release-edit'});
      await page.getByText('G1.8 수정 전 문맥 응답 확인 완료',{exact:false}).waitFor({timeout:60000});
      const noticeText='응답은 저장했지만, 조립 이후 수정한 내용은 이번 생성에 반영되지 않았어요. 자동 재생성하지 않았어요.';
      const immediateText='생성 준비가 시작된 뒤 대화가 수정됐어요. 저장된 답변에는 그 수정이 반영되지 않았으며, 수정 내용은 유지했어요.';
      const expectedNotices=mode==='edit-positive'?1:0;
      if(expectedNotices)await page.getByText(noticeText,{exact:true}).waitFor({timeout:60000});
      await until(async()=>(await readDatabase()).data.statics.messages===1,'one durable answer statistic');
      const chat=await readChat();
      assert.equal(chat.message.find(row=>row.chatId==='synthetic-prior-edit-user').data,
        expectedNotices?'G1.8 편집 후 문장':'G1.8 편집 전 문장');
      assert.equal(chat.message.filter(row=>row.data==='G1.8 수정 전 문맥 응답 확인 완료').length,1);
      assert.equal(events.filter(row=>row.event==='main').length,1);
      const notices=readRows('internal/bg-notifications/v3/').filter(row=>row.event.code==='chat_edit_unreflected');
      assert.equal(notices.length,expectedNotices);
      if(expectedNotices)await until(()=>readRows('internal/bg-notifications/v3/').filter(row=>row.event.code==='chat_edit_unreflected').every(row=>row.deliveredAt!==null),'edit notice ACK');
      const observedToasts=await page.evaluate(()=>window.__g18ObservedToasts);
      assert.equal(observedToasts.filter(text=>text===noticeText).length,expectedNotices);
      assert.equal(observedToasts.filter(text=>text===immediateText).length,expectedNotices,
        'count the existing immediate notice separately from the durable server notice');
      const storage=await context.storageState();await context.close();await open(storage);
      await page.waitForTimeout(5500);assert.equal(await page.getByText(noticeText,{exact:true}).count(),0);
      const reopenedToasts=await page.evaluate(()=>window.__g18ObservedToasts);
      assert.equal(reopenedToasts.filter(text=>text===noticeText||text===immediateText).length,0);
      assert.equal(readRows('internal/bg-notifications/v3/').filter(row=>row.event.code==='chat_edit_unreflected').length,expectedNotices);
      await page.locator('textarea').fill('G1.8 정상 확인 저장 후');
      await page.getByRole('button',{name:'Send',exact:true}).click();
      await page.getByText('G1.8 정상 응답 확인 완료',{exact:false}).waitFor({timeout:60000});
      await until(async()=>(await readDatabase()).data.statics.messages===2,'next Send must remain usable');
      const finalChat=await readChat();
      assert.equal(finalChat.message.find(row=>row.chatId==='synthetic-prior-edit-user').data,chat.message.find(row=>row.chatId==='synthetic-prior-edit-user').data);
      assert.equal(events.filter(row=>row.event==='main').length,2);
      await Promise.all(saveBodyTasks);assertNoInvalidSave();assert.deepEqual(pageErrors,[]);assert.deepEqual(dialogs,[]);
      fs.writeFileSync(output,JSON.stringify({passed:true,mode,runtime,source:target,heldPrompt:held,
        healthyMain:2,notices:expectedNotices,immediateNotices:expectedNotices,observedToasts,reopenedToasts,
        redisplay:0,statistics:2,editPreserved:true,nextSend:true,pageErrors,dialogs,saveResponses},null,2),{mode:0o600,flag:'wx'});
      console.log(JSON.stringify({passed:true,mode,notices:expectedNotices,editPreserved:true,nextSend:true}));
    } else {
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
    if(removeSettledInput)await page.getByText('백그라운드 생성이 답변 없이 끝났어요. 해당 채팅에서 다시 보내주세요.',{exact:true}).waitFor();
    if (await page.getByText('백그라운드 생성이 답변 없이 끝났어요. 해당 채팅에서 다시 보내주세요.', { exact: true }).count())
      await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    if(removeSettledInput){
      await until(()=>lostAcks===1,'actual failed result ACK must be lost after server acceptance');
      assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('bg-server-input-v3:')).length),1,
        'retain the actual failed marker while status transport is unavailable');
      const id=failedChat.message.find(row=>row.role==='user').chatId;
      const row=page.locator('[data-chat-id="'+id+'"]');await row.scrollIntoViewIfNeeded();
      await row.locator('.button-icon-remove').click();
      await page.getByRole('button',{name:'이 메시지만 삭제',exact:true}).or(
        page.getByRole('button',{name:'Remove this message only',exact:true})).click();
      await until(async()=>{
        assertNoInvalidSave();const r=await fetch(origin+'/api/chat-content/synthetic-character/0',{headers:apiHeaders});
        assert.equal(r.status,200);const c=await decodeRisuSave(new Uint8Array(await r.arrayBuffer()));
        return !c.message.some(message=>message.chatId===id);
      },'deliberately removed failed raw input must be durable');
      holdProof=false;
    }
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
    assert.deepEqual(healthy.message.filter(row => row.role === 'user').map(row => row.data), [...(removeSettledInput?[]:[rawText]), 'G1.8 정상 확인']);
    if(!removeSettledInput)assert.equal(healthy.message.filter(row => row.role === 'user')[0].chatId, failedChat.message.find(row => row.role === 'user').chatId);
    else assert.equal(healthy.message.some(row=>row.chatId===failedChat.message.find(row=>row.role==='user').chatId),false);
    assert.deepEqual(healthy.message.filter(row => row.role === 'char').map(row => row.data), ['G1.8 정상 응답 확인 완료']);
    assert.equal(events.filter(row => row.event === 'main' && !row.failed).length, 1);
    // A successful answer alone did not prove root writes. Change actual UI
    // chat metadata after commit and observe durable storage, then return.
    const rootBefore = await readDatabase();
    assertNoInvalidSave();
    assert.ok(Number.isSafeInteger(rootBefore.data.statics?.messages) && rootBefore.data.statics.messages >= 0,
      'canonical statistic count must remain valid after server answer commit');
    const { copyServerOwnedRootState } = req('./server/node/serverChatExecutionProjection.cjs');
    assert.doesNotThrow(() => copyServerOwnedRootState(rootBefore.data, rootBefore.data));
    await page.locator('[data-risu-chat-idx="1"]').click();
    await until(async () => {
      assertNoInvalidSave();
      assert.equal(await page.getByText('Server rejected an invalid database update', { exact: false }).count(), 0);
      return (await readDatabase()).data.characters[0].chatPage === 1;
    }, 'UI chat switch must persist after server answer commit');
    const rootAfter = await readDatabase();
    assert.notDeepEqual(rootAfter.bytes, rootBefore.bytes, 'root bytes must change after UI save');
    assert.ok(Number.isSafeInteger(rootAfter.data.statics.messages) && rootAfter.data.statics.messages >= 0);
    const savedChatResponse = await fetch(origin + '/api/chat-content/synthetic-character/0', { headers: apiHeaders });
    assert.equal(savedChatResponse.status, 200);
    const savedChat = await decodeRisuSave(new Uint8Array(await savedChatResponse.arrayBuffer()));
    // Lazy root metadata can omit unhydrated messages. Compare full canonical
    // chat reads across the root write, not a partial root chat placeholder.
    assert.deepEqual(savedChat.message, healthy.message);
    await page.locator('[data-risu-chat-idx="0"]').click();
    await until(async () => { assertNoInvalidSave(); return (await readDatabase()).data.characters[0].chatPage === 0; }, 'return chat metadata must persist');
    await until(() => readRows('internal/bg-notifications/v3/')[0].deliveredAt !== null, 'delivery ACK');
    const after = await context.storageState(); await context.close(); await open(after);
    await page.waitForTimeout(5500);
    assert.equal(await page.getByText(failureText, { exact: true }).count(), 0);
    assert.equal(readRows('internal/bg-notifications/v3/').length, 1);
    assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('bg-server-input-v3:')).length), 0,
      'both failed and queued completed raw input markers must settle before a following Send');
    await page.locator('textarea').fill('G1.8 정상 확인 저장 후');
    const followingSend = page.getByRole('button', { name: 'Send', exact: true });
    assert.equal(await followingSend.isEnabled(), true); await followingSend.click();
    await until(async () => {
      assertNoInvalidSave();
      const response = await fetch(origin + '/api/chat-content/synthetic-character/0', { headers: apiHeaders });
      assert.equal(response.status, 200);
      const value = await decodeRisuSave(new Uint8Array(await response.arrayBuffer()));
      return value.message.filter(row => row.role === 'char').length === 2;
    }, 'Send must still commit after UI root save and reopening');
    const finalResponse = await fetch(origin + '/api/chat-content/synthetic-character/0', { headers: apiHeaders });
    const finalChat = await decodeRisuSave(new Uint8Array(await finalResponse.arrayBuffer()));
    assert.deepEqual(finalChat.message.filter(row => row.role === 'user').map(row => row.data), [...(removeSettledInput?[]:[rawText]), 'G1.8 정상 확인', 'G1.8 정상 확인 저장 후']);
    assert.deepEqual(finalChat.message.filter(row => row.role === 'char').map(row => row.data), ['G1.8 정상 응답 확인 완료', 'G1.8 정상 응답 확인 완료']);
    assert.equal(events.filter(row => row.event === 'main' && !row.failed).length, 2);
    await until(async () => (await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('bg-server-input-v3:')).length)) === 0, 'following completed input marker must settle');
    await until(async () => (await readDatabase()).data.statics.messages === 2,
      'both completed message statistic effects must be durable');
    const finalRoot = await readDatabase(); assert.equal(finalRoot.data.statics.messages, 2);
    const commits = readRows('internal/server-chat-commit/v1/'); assert.equal(commits.length, 2);
    assert.ok(commits.every(row => row.canonicalWrite.effects.stats.status === 'committed' && row.canonicalWrite.staticsMessagesAppliedDelta === 1));
    assert.equal(readRows('internal/bg-notifications/v3/').length, 1);
    assert.deepEqual(pageErrors, []);
    await Promise.all(saveBodyTasks);
    assert.ok(saveResponses.filter(row => row.status >= 400).every(row => typeof row.body === 'string'),
      'all observed rejected save response bodies must be captured');
    assert.deepEqual(dialogs, [], 'unexpected native dialogs must not be silently dismissed');
    assertNoInvalidSave();
    if (isolatedCookies) {
      const cookies = await context.cookies();
      assert.equal(cookies.find(cookie => cookie.name === 'risu-session')?.value, 'production-cookie-control');
      assert.ok(cookies.some(cookie => cookie.name === 'g18-ui-session'));
    }
    if (loseResultAck) assert.equal(lostAcks, 1);
    const receipts = readRows('bg-orch-state-op:').filter(row => row.failedInputSettlement);
    assert.equal(receipts.length, 1);
    fs.writeFileSync(output, JSON.stringify({ passed: true, mode, runtime, source: target, failedMain: 2, healthyMain: 2,
      inputs: 3, retainedInputs:removeSettledInput?2:3, answers: 2, staticsMessages: finalRoot.data.statics.messages, statsCommits: commits.length,
      notices: 1, noticeAck: true, redisplay: 0, failedInputReceipts: receipts.length,
      lostAcks, fastFailure, queueNext, delayedPolls, invalidStatsControl, removeSettledInput, rootWriteVerified: true,
      pageErrors, dialogs, saveResponses, responses, snapshots, consoleEvents }, null, 2), { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ passed: true, mode, failedMain: 2, healthyMain: 2, inputs: 3, answers: 2, rootWriteVerified: true }));
    }
  } catch (error) {
    if (page && !page.isClosed()) { await page.screenshot({ path: path.join(runtime, 'failed-probe.png') }).catch(() => {}); snapshots.push({ error: error.message, texts: (await page.locator('body').innerText().catch(() => '')).slice(-4000) }); }
    fs.writeFileSync(output, JSON.stringify({ passed: false, mode, runtime, error: error.message, events, pageErrors, dialogs, saveResponses, responses, snapshots, consoleEvents }, null, 2), { mode: 0o600, flag: 'wx' });
    throw error;
  } finally { await browser.close(); if (server.exitCode === null) { server.kill('SIGTERM'); await once(server, 'exit'); } }
}
