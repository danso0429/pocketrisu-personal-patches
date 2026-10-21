// Actual application/native Send, isolated SQLite and controlled SSE transport.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { configureMarpFixture, marpGrants, readMarpExpectations } from './probes/g110-marp-fixture.mjs';
const [target, deps, fixture, output, mode = 'foreground'] = process.argv.slice(2);
const pluginProvider = process.argv.includes('--plugin-provider');
const marpSourceArgument = process.argv.find(value => value.startsWith('--marp-source='))?.slice('--marp-source='.length);
const marpSource = marpSourceArgument ? path.resolve(marpSourceArgument) : null;
const closeAnalysis = process.argv.includes('--close-analysis');
const marpDisabled = process.argv.includes('--marp-disabled');
const agents = ['worldbuilding', 'plot', 'character'];
const enabledAgents = process.argv.find(value => value.startsWith('--marp-agents='))?.slice('--marp-agents='.length).split(',') || agents;
assert.ok(enabledAgents.every(agent => agents.includes(agent)) && new Set(enabledAgents).size === enabledAgents.length);
assert.ok(!marpSource || (!pluginProvider && !process.argv.includes('--gemini') && !process.argv.includes('--vertex')
    && ['closed', 'healthy-next'].includes(mode)), 'Original MARP is an isolated preset qualification mode');
assert.ok(!closeAnalysis || (marpSource && mode === 'closed'), 'Analysis closure needs original MARP and closed mode');
const displayMode = process.argv.find(value => value.startsWith('--display='))?.slice('--display='.length) || 'balanced';
assert.ok(['balanced', 'strong', 'off'].includes(displayMode));
assert.ok(!pluginProvider || mode === 'foreground', 'Plugin-provider control is separately scoped');
assert.ok(['foreground', 'closed', 'nonstream', 'failure', 'cancel', 'queue', 'navigation', 'continue', 'healthy-next', 'device'].includes(mode));
const device = mode === 'device';
const gemini = process.argv.includes('--gemini');
const vertex = process.argv.includes('--vertex');
const isolatedCookies = device || process.argv.includes('--isolated-cookies');
const req = createRequire(path.resolve(target, 'package.json'));
const Database = req('better-sqlite3');
const runtime = fs.mkdtempSync(path.join(path.dirname(path.resolve(output)), 'g19-stream-'));
const data = JSON.parse(fs.readFileSync(fixture));
data.statics = { messages: 0, imports: 0 };
data.aiModel = data.subModel = 'gpt35'; data.openAIKey = 'synthetic-only'; data.requestRetrys = 0;
if (gemini) { data.aiModel = data.subModel = 'gemini-2.5-flash'; data.google = { ...data.google, accessToken: 'synthetic-only' } }
if (vertex) {
    data.aiModel = data.subModel = 'gemini-2.5-flash-vertex';
    data.google = { ...data.google, projectId: 'synthetic-project' }; data.vertexRegion = 'global';
    data.vertexAccessToken = 'synthetic-only'; data.vertexAccessTokenExpires = Date.now() + 3600000;
}
data.useStreaming = mode !== 'nonstream'; data.autoTranslate = false;
data.streamingDisplayOptimizationMode = displayMode;
data.autoContinueChat = mode === 'continue'; data.autoContinueMinTokens = 0;
data.fallbackModels = Object.fromEntries(Object.keys(data.fallbackModels).map(key => [key, []])); data.plugins = [];
data.nodeOnlyModelModeLock = 'legacy'; data.moduleModelBindingsEnabled = false;
const character = data.characters[0]; character.name = 'G1.9 synthetic'; character.triggerscript = [];
character.chats[0].message = []; character.chats[0].useModelPreset = false; delete character.chats[0].modelBinding;
character.chats[0].scriptstate = {}; character.chats[0].id = 'synthetic-chat';
character.chats = [character.chats[0], { ...structuredClone(character.chats[0]), id: 'second-chat', name: 'Other chat' }];
if (pluginProvider) {
    data.aiModel = data.subModel = 'pluginmodel:::g19-synthetic';
    data.plugins = [{ name: 'G1.9 synthetic provider', version: '3.0', enabled: true, realArg: {}, script: `
await Risuai.addProvider('g19-synthetic', async (args) => {
    const response = await Risuai.nativeFetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', headers: {'content-type':'application/json'},
        body: JSON.stringify({model:'gpt-3.5-turbo',messages:args.prompt_chat,stream:true})
    });
    const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '', ended = false;
    return { success: true, content: new ReadableStream({ async pull(controller) {
        while (!ended) {
            const read = await reader.read(); buffer += decoder.decode(read.value, {stream:!read.done});
            let found = false, split;
            while ((split = buffer.indexOf('\\n\\n')) >= 0) {
                const frame = buffer.slice(0,split); buffer = buffer.slice(split+2);
                const line = frame.split('\\n').find(line => line.startsWith('data: '));
                if (!line || line === 'data: [DONE]') continue;
                const text = JSON.parse(line.slice(6)).choices?.[0]?.delta?.content;
                if (text) {controller.enqueue(text);found=true;}
            }
            if (read.done) {ended=true;controller.close();await reader.cancel();return;}
            if (found) return;
        }
    }, async cancel() {ended=true;await reader.cancel();} }, {highWaterMark:0}) };
});` }];
}
if (marpSource) {
    configureMarpFixture(data, marpSource, { disabled: marpDisabled, enabledAgents });
}
fs.mkdirSync(path.join(runtime, 'save'));
fs.symlinkSync(path.resolve(target, 'dist'), path.join(runtime, 'dist'));
fs.writeFileSync(path.join(runtime, 'package.json'), JSON.stringify({ name: 'pocketrisu', version: '1.10.0' }));
process.chdir(runtime);
const { encodeRisuSaveLegacy, decodeRisuSave } = req('./server/node/utils.cjs');
const db = req('./server/node/db.cjs');
db.kvSet('database/database.bin', Buffer.from(encodeRisuSaveLegacy(data)));
if (pluginProvider) db.kvSet('cache/plugin-permissions/state.json', JSON.stringify({
    given: [JSON.stringify([data.plugins[0].name,'provider'])], denied: [],
    cache: [[JSON.stringify([data.plugins[0].name,'provider'])+'_lastGrantTime',Date.now()]],
}));
let expectedModels, originalHash;
if (marpSource) {
    db.kvSet('cache/plugin-permissions/state.json', JSON.stringify(marpGrants(data)));
    const persisted = await decodeRisuSave(db.kvGet('database/database.bin'));
    ({ expectedModels, originalHash } = readMarpExpectations(persisted, marpSource));
    assert.ok(!closeAnalysis || expectedModels.length > 0);
}
db.db.close();
fs.writeFileSync(path.join(runtime, 'save/__password'), createHash('sha256').update('synthetic-stream-password').digest('hex'));
const server = fork(path.resolve(target, 'server/node/server.cjs'), [], {
    cwd: runtime, execArgv: ['--require', new URL('./probes/bg-stream-preview-preload.cjs', import.meta.url).pathname],
    env: { ...process.env, PORT: device ? '6274' : '0', TUNNEL_DISABLED: '1', RISU_UPDATE_CHECK: 'false',
        POCKETRISU_BG_PLUGIN_HOST_CANDIDATE: pluginProvider || marpSource ? '1' : '0', G19_STREAM_PROBE: '1',
        G110_MARP_STREAM: marpSource ? '1' : '0', G110_CLOSE_ANALYSIS: closeAnalysis ? '1' : '0',
        G19_STREAM_DEVICE: device ? '1' : '0',
        G19_STREAM_COOKIE_NAMESPACE: isolatedCookies ? '1' : '0',
        G19_STREAM_FAIL: mode === 'failure' ? '1' : '0', G19_STREAM_CONTINUE: mode === 'continue' ? '1' : '0' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
});
const log = fs.createWriteStream(path.join(runtime, 'server.log'), { mode: 0o600 });
server.stdout.pipe(log); server.stderr.pipe(log);
const events = []; server.on('message', row => events.push(row));
const port = await new Promise((resolve, reject) => {
    server.on('message', row => { if (row.event === 'ready') resolve(row.port); });
    server.once('exit', code => reject(Error('Server stopped: ' + code)));
});
const origin = 'http://127.0.0.1:' + port;
if (device) {
    fs.writeFileSync(output, JSON.stringify({ ready: true, runtime, origin, source: target,
        cookieName: 'g19-stream-session', password: 'synthetic-stream-password', serverPid: server.pid }, null, 2),
        { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ ready: true, mode, port }));
    process.on('SIGTERM', () => { if (server.exitCode === null) server.kill('SIGTERM') });
    await once(server, 'exit'); log.end(); process.exit(0);
}
const { chromium } = createRequire(path.resolve(deps, 'package.json'))('playwright');
let browser, browserServer;
const launchBrowser = async () => {
    const options = { headless: true, ...(process.env.G19_CHROMIUM ? { executablePath: process.env.G19_CHROMIUM } : {}) };
    if (marpSource) {
        browserServer = await chromium.launchServer({ ...options, host: '127.0.0.1' });
        try { browser = await chromium.connect(browserServer.wsEndpoint()); }
        catch (error) { await browserServer.close(); throw error; }
    } else browser = await chromium.launch(options);
};
await launchBrowser().catch(async error => { server.kill('SIGTERM'); await once(server, 'exit'); log.end(); throw error });
let context, page;
const errors = [], consoleErrors = [], cancelRequests = [], previewResponses = [], writes = [], observations = [], observerTasks = [];
const admissions = [], accepted = [], closures = [];
let browserAnalysis = 0, beforeReopen;
const until = async (check, label) => {
    for (let i = 0; i < 400; i++) {
        if (await check()) return;
        if (server.exitCode !== null) throw Error('Server exited');
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw Error('Timeout: ' + label);
};
const open = async state => {
    if (!browser?.isConnected()) await launchBrowser();
    context = await browser.newContext(state ? { storageState: state } : {});
    if (isolatedCookies && !state) await context.addCookies([{ name: 'risu-session', value: 'production-cookie-control', url: origin }]);
    await context.route('**/*', route => {
        const request = route.request(), url = request.url();
        if (marpSource && (url.startsWith('https://analysis.example.test/')
            || decodeURIComponent(request.headers()['risu-url'] || '').startsWith('https://analysis.example.test/'))) browserAnalysis++;
        if (url.startsWith(origin + '/')) return route.continue();
        return route.abort();
    });
    page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' || message.text().includes('[bg-input] admission blocked')) consoleErrors.push(message.text()) });
    page.on('request', request => {
        const pathname = new URL(request.url()).pathname;
        if (request.method() === 'DELETE' && /^\/api\/bg-orchestrate\//.test(pathname)) cancelRequests.push(pathname);
        if (['POST', 'PUT', 'PATCH'].includes(request.method()) && /\/api\/(?:write|patch|db)/.test(pathname)) writes.push(pathname);
        if (marpSource && pathname === '/api/bg-orchestrate' && request.method() === 'POST') {
            const body = request.postDataJSON(); assert.equal(body.inputCommandVersion, 1); admissions.push(body.operationId);
        }
    });
    page.on('response', response => {
        if (response.url().includes('/api/bg-stream-preview/')) void response.json().then(row => previewResponses.push(row)).catch(() => {});
        if (/\/api\/bg-orchestrate(?:-input|-chat-state|$)/.test(new URL(response.url()).pathname)) {
            observerTasks.push(response.json().then(body => {
                observations.push({ url: new URL(response.url()).pathname + new URL(response.url()).search,
                    method: response.request().method(), status: response.status(), body });
                if (marpSource && new URL(response.url()).pathname === '/api/bg-orchestrate'
                    && response.request().method() === 'POST' && [200, 202].includes(response.status()) && (body.accepted || body.started)) accepted.push(body.operationId);
            }).catch(() => {}));
        }
    });
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    if (!state) {
        await page.getByText('Input your password.', { exact: false }).waitFor();
        await page.locator('input').fill('synthetic-stream-password');
        await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    }
    await page.locator('[data-char-id="synthetic-character"]').first().click();
    await page.locator('textarea').waitFor();
    if (!state) {
        await page.waitForTimeout(3500);
        assert.equal(previewResponses.length, 0, 'idle chat must not poll the preview endpoint');
    }
};
let authHeaders;
const readChat = async () => {
    const response = await fetch(origin + '/api/chat-content/synthetic-character/0', { headers: authHeaders });
    assert.equal(response.status, 200);
    return decodeRisuSave(new Uint8Array(await response.arrayBuffer()));
};
const preview = async () => {
    const response = await fetch(origin + '/api/bg-stream-preview/synthetic-character/synthetic-chat', { headers: authHeaders });
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    return response.json();
};
const closeBrowserProcess = async phase => {
    const proc = browserServer.process();
    assert.ok(proc.pid > 0 && proc.pid !== process.pid && proc.exitCode === null);
    const exited = once(proc, 'exit');
    await browserServer.kill();
    const [code, signal] = await exited;
    assert.equal(signal, 'SIGKILL');
    assert.equal(browser.isConnected(), false);
    closures.push({ phase, signal, exitCode: code, browserDisconnected: true });
};
const canonicalBeforeReturn = async () => {
    assert.equal(browser.isConnected(), false);
    const chat = await readChat();
    assert.equal(chat.message.filter(row => row.role === 'user').length, 1);
    assert.equal(chat.message.find(row => row.role === 'user').data, 'Synthetic G1.9 request');
    const answers = chat.message.filter(row => row.role === 'char');
    assert.equal(answers.length, 1);
    assert.equal(answers[0].data, '**G1.9 partial 1**\n\n<Thoughts>hidden-preview-thought</Thoughts>\n\n**G1.9 complete 1**');
    assert.equal(JSON.stringify(chat.message).includes('MARP:v1:begin'), false);
    assert.equal(JSON.stringify(chat.message).includes('Synthetic note '), false);
    assert.equal((await preview()).active, false);
    const { chatRevision } = req('./server/node/chatDelta.cjs');
    return { chat, revision: chatRevision(chat), analysis: events.filter(row => row.event === 'analysis').length,
        main: events.filter(row => row.event === 'main').length };
};
try {
    await open();
    const login = await fetch(origin + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: createHash('sha256').update('synthetic-stream-password').digest('hex') }) });
    assert.equal(login.status, 200);
    authHeaders = { 'risu-auth': (await login.json()).token, 'x-chat-id': 'synthetic-chat',
        'x-client-build': JSON.parse(fs.readFileSync(path.join(target, 'dist/build-stamp.json'))).stamp };
    const session = await fetch(origin + '/api/session', { method: 'POST',
        headers: { ...authHeaders, 'x-session-id': 'synthetic-stream-readback' } });
    assert.equal(session.status, 200);
    assert.ok(session.headers.get('set-cookie'));
    authHeaders.cookie = session.headers.get('set-cookie').split(';')[0];
    await page.locator('textarea').fill('Synthetic G1.9 request');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    let analysisStorage;
    if (closeAnalysis) {
        await until(() => events.some(row => row.event === 'analysis-held') && accepted.length === 1, 'accepted server analysis held');
        assert.equal(events.filter(row => row.event === 'main').length, 0);
        assert.ok(events.some(row => row.event === 'host' && row.operationId === accepted[0]));
        assert.equal((await readChat()).message.filter(row => row.role === 'char').length, 0);
        analysisStorage = await context.storageState();
        await closeBrowserProcess('analysis');
        server.send({ event: 'release-analysis' });
    }
    await until(() => events.some(row => row.event === 'main'), 'native server main');
    if (closeAnalysis) {
        await until(async () => (await preview()).text?.includes('G1.9 partial 1'), 'preview after analysis process loss');
        assert.equal((await readChat()).message.filter(row => row.role === 'char').length, 0);
        server.send({ event: 'release', call: 1 });
        await until(async () => (await readChat()).message.some(row => row.data.includes('G1.9 complete 1')), 'canonical result before analysis reopen');
        beforeReopen = await canonicalBeforeReturn();
        await open(analysisStorage);
    } else if (mode === 'nonstream') {
        await until(async () => (await readChat()).message.some(row => row.data === 'G1.9 nonstream answer'), 'nonstream canonical result');
        assert.equal((await preview()).active, false);
        assert.equal(await page.locator('[data-bg-stream-preview]').count(), 0);
    } else {
        await until(async () => (await preview()).text === '**G1.9 partial 1**\n\n<Thoughts>hidden-preview-thought', 'bundle native display flush');
        const partial = await preview();
        assert.equal(partial.text, '**G1.9 partial 1**\n\n<Thoughts>hidden-preview-thought');
        assert.deepEqual(Object.keys(partial).sort(), ['active', 'operationId', 'oversized', 'revision', 'rowChatId', 'streaming', 'text'].sort());
        assert.equal((await readChat()).message.filter(row => row.role === 'char').length, 0, 'preview cannot publish a canonical partial answer');
        await page.locator('[data-bg-stream-preview] strong').getByText('G1.9 partial 1', { exact: true }).waitFor();
        const thought = await page.waitForFunction(() => {
            const root = document.querySelector('[data-bg-stream-preview]');
            const details = root?.querySelectorAll('details');
            return details?.length === 1 && !details[0].hasAttribute('open')
                && !root.innerText.includes('hidden-preview-thought')
                && root.querySelector('strong')?.textContent === 'G1.9 partial 1'
                ? { count: details.length, open: details[0].hasAttribute('open'), hidden: true } : null;
        });
        assert.deepEqual(await thought.jsonValue(), { count: 1, open: false, hidden: true });
        const ordinary = await context.request.get(origin + '/api/bg-stream-preview/synthetic-character/second-chat');
        assert.deepEqual(await ordinary.json(), { active: false });
        const readers = await Promise.all([preview(), preview()]);
        assert.equal(readers[0].operationId, readers[1].operationId);
        assert.equal(readers[0].rowChatId, readers[1].rowChatId);
        // Input adoption has its own legitimate save. Wait for that native row
        // and a quiet application-save window before measuring preview reads.
        const inputRow = (await readChat()).message.find(row => row.role === 'user');
        await page.locator('[data-chat-id="' + inputRow.chatId + '"]').first().waitFor();
        await page.waitForTimeout(3000);
        const writesBefore = writes.length;
        await page.waitForTimeout(1000);
        await until(() => previewResponses.some(row => row.unchanged === true), 'unchanged text omitted');
        assert.equal(writes.length, writesBefore, 'preview polling does not enlist an autosave');
        const storage = await context.storageState();
        if (mode === 'closed') {
            if (marpSource) { assert.equal(accepted.length, 1); await closeBrowserProcess('main'); }
            else await context.close();
        }
        if (mode === 'navigation') {
            await page.goto('about:blank');
            assert.equal(events.some(row => row.event === 'aborted'), false);
        }
        if (mode === 'queue') {
            await until(async () => await page.locator('textarea').inputValue() === '', 'first draft clear');
            await page.locator('textarea').fill('Synthetic queued G1.9 request');
            await page.getByRole('button', { name: 'Send', exact: true }).click();
            await until(() => {
                const db = new Database(path.join(runtime, 'save/risuai.db'), { readonly: true });
                try { return db.prepare("SELECT count(*) AS total FROM kv WHERE key LIKE 'internal/server-chat-input/v1/%'").get().total === 2 }
                finally { db.close() }
            }, 'N+1 command admitted through actual Send');
            assert.equal((await readChat()).message.filter(row => row.role === 'user').length, 1, 'queued command cannot attach before predecessor');
        }
        if (mode === 'cancel') {
            assert.equal(cancelRequests.length, 0);
            await page.getByRole('button', { name: '생성 중지', exact: true }).click();
            await until(() => events.some(row => row.event === 'aborted' && row.call === 1), 'native Stop reaches exact server controller');
        } else server.send({ event: 'release', call: 1 });
        if (mode === 'failure' || mode === 'cancel') {
            await until(async () => !(await preview()).active, 'terminal preview cleanup');
            // The existing result owner may retain a partial answer. Preview is never the fallback.
            await until(async () => await page.locator('[data-bg-stream-preview]').count() === 0, 'terminal display clear');
            await until(async () => await page.evaluate(() => !Object.keys(localStorage)
                .some(key => key.startsWith('bg-server-input-v4:'))), 'terminal result settles its native input marker');
            await page.locator('textarea').fill('Synthetic healthy after terminal');
            await page.getByRole('button', { name: 'Send', exact: true }).click();
            await until(() => events.some(row => row.event === 'main' && row.call === 2), 'next healthy main');
            server.send({ event: 'release', call: 2 });
            await until(async () => (await readChat()).message.some(row => row.data.includes('G1.9 complete 2')), 'healthy result');
        } else {
            if (mode === 'continue') {
                await until(() => events.some(row => row.event === 'main' && row.call === 2), 'native automatic continuation');
                await until(async () => (await preview()).text?.includes('G1.9 partial 2'), 'continued preview body');
                const continued = await preview();
                assert.equal(continued.rowChatId, partial.rowChatId, 'continuation keeps the actual displayed row identity');
                assert.ok(continued.revision > partial.revision);
                assert.equal((await readChat()).message.filter(row => row.role === 'char').length, 0);
                server.send({ event: 'release', call: 2 });
                await until(async () => (await readChat()).message.some(row => row.data.includes('G1.9 complete 2')), 'continued canonical result');
                assert.equal((await readChat()).message.filter(row => row.role === 'char').length, 1);
            }
            await until(async () => (await readChat()).message.some(row => row.data.includes('G1.9 complete 1')), 'canonical result before reopen');
            if (mode === 'queue') {
                await until(() => events.some(row => row.event === 'main' && row.call === 2), 'N+1 starts after N');
                await until(async () => (await preview()).text?.includes('G1.9 partial 2'), 'N+1 owns preview');
                server.send({ event: 'release', call: 2 });
                await until(async () => (await readChat()).message.some(row => row.data.includes('G1.9 complete 2')), 'N+1 canonical result');
            }
            if (mode === 'closed' || mode === 'navigation') {
                if (marpSource) beforeReopen = await canonicalBeforeReturn();
                await open(storage);
            }
            await until(async () => await page.locator('[data-bg-stream-preview]').count() === 0, 'committed preview removed');
        }
        assert.equal(cancelRequests.length, mode === 'cancel' ? 1 : 0,
            'only the explicit native Stop action may invoke cancellation');
    }
    if (marpSource && beforeReopen) {
        await until(async () => await page.locator('[data-chat-id="' + beforeReopen.chat.message.find(row => row.role === 'char').chatId + '"]').count() === 1,
            'canonical row adopted after process loss');
        await until(async () => await page.evaluate(() => !Object.keys(localStorage).some(key => key.startsWith('bg-server-input-v4:'))), 'returned marker settled');
        const afterReturn = await readChat();
        assert.deepEqual(afterReturn.message, beforeReopen.chat.message, 'reopening preserves exact canonical rows');
        assert.equal(req('./server/node/chatDelta.cjs').chatRevision(afterReturn), beforeReopen.revision);
        assert.equal(events.filter(row => row.event === 'analysis').length, beforeReopen.analysis);
        assert.equal(events.filter(row => row.event === 'main').length, beforeReopen.main);
    }
    if (mode === 'healthy-next' || marpSource) {
        await until(async () => await page.evaluate(() => !Object.keys(localStorage)
            .some(key => key.startsWith('bg-server-input-v4:'))), 'healthy result marker settles');
        await page.locator('textarea').fill('Synthetic healthy second request');
        await page.getByRole('button', { name: 'Send', exact: true }).click();
        await until(() => events.some(row => row.event === 'main' && row.call === 2), 'healthy next Send');
        server.send({ event: 'release', call: 2 });
        await until(async () => (await readChat()).message.some(row => row.data.includes('G1.9 complete 2')), 'healthy second canonical result');
    }
    assert.deepEqual(errors, []);
    if (marpSource) {
        const mains = events.filter(row => row.event === 'main'), analyses = events.filter(row => row.event === 'analysis');
        assert.deepEqual(events.filter(row => row.event === 'host').map(row => row.operationId), admissions);
        assert.deepEqual(accepted, admissions);
        assert.equal(new Set(admissions).size, 2);
        assert.deepEqual(analyses.map(row => row.model).sort(), [...expectedModels, ...expectedModels].sort());
        assert.equal(events.filter(row => row.event === 'analysis-finished').length, analyses.length);
        const denials = events.filter(row => row.event === 'outbound-denied');
        // Native public-stats and the home Realm recommendation request are
        // unrelated UI calls. Keep their actual denial, never fake a response.
        // A classic-model fallback, analysis omission or any other destination
        // remains an unexpected refusal and fails the integrated case.
        assert.ok(denials.every(row => row.method === 'GET' && (
            row.destination === 'https://risu-update-worker.nodridan.workers.dev/api/public-stats'
            || row.destination.startsWith('https://sv.risuai.xyz/realm/search'))), 'unexpected outbound denial');
        assert.equal(events.filter(row => row.event === 'host-notice'
            || row.event === 'analysis-aborted' || row.event === 'aborted' || row.event === 'validation-error').length, 0);
        assert.equal(browserAnalysis, 0);
        const sessions = events.filter(row => row.event === 'session-create');
        assert.equal(sessions.length, marpDisabled ? 0 : 2);
        assert.ok(sessions.every(row => row.sourceHash === originalHash));
        assert.equal(events.filter(row => row.event === 'socket-denied').length, 2);
        for (let index = 0; index < mains.length; index++) {
            const host = events.filter(row => row.event === 'host')[index];
            const refresh = events.find(row => row.event === 'identity-refresh-end' && row.operationId === host.operationId);
            assert.ok(refresh && host.at < refresh.at && refresh.at < mains[index].at);
            assert.ok(analyses.filter(row => row.at > host.at && row.at < mains[index].at).every(row => row.at > refresh.at));
            const prompt = JSON.stringify(mains[index].messages);
            assert.equal(prompt.match(/<!--MARP:v1:begin-->/g)?.length || 0, expectedModels.length ? 1 : 0);
            assert.deepEqual([...prompt.matchAll(/Synthetic note ([a-zA-Z0-9_-]+)/g)].map(match => match[1]).sort(), [...expectedModels].sort());
            const currentAnalyses = analyses.filter(row => row.at > host.at && row.at < mains[index].at);
            const injected = [...prompt.matchAll(/Synthetic note ([a-zA-Z0-9_-]+) \[analysis:([0-9]+)\]/g)]
                .map(match => ({ id: Number(match[2]), model: match[1] })).sort((left, right) => left.id - right.id);
            assert.deepEqual(injected, currentAnalyses.map(row => ({ id: row.id, model: row.model }))
                .sort((left, right) => left.id - right.id), 'injected notes must belong to this operation');
        }
        assert.equal(cancelRequests.length, 0);
        const finalChat = await readChat();
        assert.equal(finalChat.message.filter(row => row.role === 'char').length, 2);
        if (beforeReopen) assert.deepEqual(finalChat.message.slice(0, 2), beforeReopen.chat.message,
            'the original input and answer remain exact through the subsequent Send');
    }
    assert.equal(consoleErrors.some(text => /save file is corrupted|Server rejected an invalid database update|server statistic count is invalid/.test(text)), false);
    if (isolatedCookies) {
        const cookies = await context.cookies();
        assert.equal(cookies.find(cookie => cookie.name === 'risu-session')?.value, 'production-cookie-control');
        assert.ok(cookies.some(cookie => cookie.name === 'g19-stream-session'));
    }
    assert.equal(events.filter(row => row.event === 'main').length, marpSource || ['queue', 'failure', 'cancel', 'continue', 'healthy-next'].includes(mode) ? 2 : 1);
    fs.writeFileSync(output, JSON.stringify({ passed: true, mode, gemini, vertex, pluginProvider, displayMode, runtime, events, errors, consoleErrors,
        previewPolls: previewResponses.length, cancellationRequests: cancelRequests.length,
        ...(marpSource ? { originalHash, expectedModels, closeAnalysis, marpDisabled, closures, beforeReopen,
            admissions, accepted, browserAnalysis } : {}), finalChat: await readChat() }, null, 2), { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ passed: true, mode, calls: events.filter(row => row.event === 'main').length, previewPolls: previewResponses.length }));
} catch (error) {
    const body = page && !page.isClosed() ? await page.locator('body').innerText().catch(() => '') : '';
    const visibility = page && !page.isClosed() ? await page.evaluate(() => document.visibilityState).catch(() => 'unavailable') : 'closed';
    const controls = page && !page.isClosed() ? await page.evaluate(() => ({
        textareas: [...document.querySelectorAll('textarea')].map(element => ({ value: element.value, placeholder: element.placeholder })),
        stage: [...document.querySelectorAll('.loadmove')].map(element => element.className),
        buttons: [...document.querySelectorAll('button')].filter(element => element.getAttribute('aria-label') === 'Send'
            || element.getAttribute('aria-labelledby') === 'cancel').map(element => ({ label: element.getAttribute('aria-label'),
                labelledby: element.getAttribute('aria-labelledby'), disabled: element.disabled })),
    })).catch(() => null) : null;
    const databaseAsset = fs.readdirSync(path.join(target, 'dist/assets')).find(name => /^database\.svelte-.*\.js$/.test(name));
    const localChat = page && !page.isClosed() && databaseAsset ? await page.evaluate(async url => {
        const module = await import(url);
        for (const value of Object.values(module)) {
            if (value && typeof value === 'object' && value.db?.characters) {
                return JSON.parse(JSON.stringify(value.db.characters[0]?.chats?.[0]));
            }
        }
        return null;
    }, origin + '/assets/' + databaseAsset).catch(() => null) : null;
    await Promise.allSettled(observerTasks);
    fs.writeFileSync(output + '.failed.json', JSON.stringify({ passed: false, mode, runtime,
        error: String(error), events, errors, consoleErrors, body, visibility, observations,
        previewResponses: previewResponses.slice(-10), controls, localChat, canonicalChat: await readChat().catch(() => null) }, null, 2), { mode: 0o600, flag: 'wx' });
    throw error;
} finally {
    await Promise.allSettled([browser?.close(), browserServer?.close()]);
    if (server.exitCode === null) { server.kill('SIGTERM'); await once(server, 'exit'); }
    log.end();
}
