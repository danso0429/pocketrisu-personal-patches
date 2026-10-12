import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { configureMarpFixture, marpGrants, readMarpExpectations } from './g110-marp-fixture.mjs';

export const requests = ['G110_REQUEST_FIRST', 'G110_REQUEST_QUEUED', 'G110_REQUEST_FOLLOW'];
export const prior = { id: 'synthetic-prior-edit-user', before: 'G110_BEFORE_QUARTZ', after: 'G110_AFTER_COBALT' };
export const fullAnswer = call => '**G1.9 partial ' + call + '**\n\n<Thoughts>hidden-preview-thought</Thoughts>\n\n**G1.9 complete ' + call + '**';

export async function createMarpHarness({ target, dependencies, fixture, original, output, scenario, pagefoldSource, fontSource }) {
    const requireTarget = createRequire(path.join(target, 'package.json'));
    const Database = requireTarget('better-sqlite3');
    const runtime = fs.mkdtempSync(path.join(path.dirname(output), 'g19-stream-'));
    const data = JSON.parse(fs.readFileSync(fixture));
    data.statics = { messages: 0, imports: 0 };
    data.aiModel = data.subModel = 'gpt35'; data.openAIKey = 'synthetic-only'; data.requestRetrys = 0;
    data.autoTranslate = false; data.streamingDisplayOptimizationMode = 'balanced'; data.autoContinueChat = false;
    data.fallbackModels = Object.fromEntries(Object.keys(data.fallbackModels).map(key => [key, []]));
    data.moduleModelBindingsEnabled = false;
    const character = data.characters[0];
    assert.equal(character.chaId, 'synthetic-character');
    character.name = 'Synthetic lifecycle'; character.triggerscript = [];
    const chat = character.chats[0]; chat.id = 'synthetic-chat'; chat.message = []; chat.scriptstate = {};
    character.chats = [chat];
    configureMarpFixture(data, original);
    if (scenario === 'stop-main-nonstream') data.modelPresets[0].useStreaming = false;
    if (scenario === 'module-binding') {
        const preset = structuredClone(data.modelPresets[0]);
        preset.id = 'synthetic-module-preset'; preset.name = 'Synthetic module'; preset.useStreaming = false;
        preset.profileSnapshot.profileId = 'synthetic:module';
        preset.profileSnapshot.endpoint.url = 'https://module-input.example.test/v1/chat/completions';
        preset.profileSnapshot.modelId = 'synthetic-module-model';
        preset.profileSnapshot.schema.find(field => field.key === 'modelId').default = 'synthetic-module-model';
        preset.userValues.apiKey = 'synthetic-module-key';
        data.modelPresets.push(preset); data.moduleModelBindingsEnabled = true;
        data.moduleModelBindings = { 'synthetic-module': preset.id };
        character.triggerscript = [{ comment: 'synthetic module selector', type: 'input', conditions: [], moduleId: 'synthetic-module',
            effect: [{ type: 'v2RunLLM', valueType: 'value', value: 'G110_MODULE_QUERY', outputVar: 'moduleResult', model: 'submodel', streaming: false, indent: 0 }] }];
        character.desc = 'Module result: {{getvar::moduleResult}}';
    }
    let pagefoldHash = null;
    if (scenario.startsWith('pagefold-')) {
        assert.ok(pagefoldSource && fontSource, 'Original PageFold and local font required');
        const bytes = fs.readFileSync(pagefoldSource);
        pagefoldHash = createHash('sha256').update(bytes).digest('hex');
        const script = bytes.toString('utf8'); assert.ok(Buffer.from(script).equals(bytes));
        data.plugins.push({ name: 'synthetic-pagefold', version: '3.0', enabled: true, script, realArg: {} });
        data.aiModel = data.subModel = 'pluginmodel:::PageFold'; data.nodeOnlyModelModeLock = 'legacy'; chat.useModelPreset = false;
    }
    for (const agent of Object.values(data.pluginCustomStorage.risu_multiagent_lite_config_vault_v1.config.agents)) {
        agent.userPromptTemplate = 'G110_CURRENT={{user_input}}\nG110_HISTORY={{chat_history}}\nG110_WORLD={{context_world}}';
    }
    if (scenario === 'queue-edit') chat.message = [
        { role: 'user', data: prior.before, chatId: prior.id },
        { role: 'char', data: 'Synthetic imported historical answer', chatId: 'synthetic-prior-answer' },
    ];
    fs.mkdirSync(path.join(runtime, 'save'));
    fs.symlinkSync(path.join(target, 'dist'), path.join(runtime, 'dist'));
    fs.writeFileSync(path.join(runtime, 'package.json'), JSON.stringify({ name: 'pocketrisu', version: '1.10.0' }));
    process.chdir(runtime);
    const { encodeRisuSaveLegacy, decodeRisuSave } = requireTarget('./server/node/utils.cjs');
    const seed = requireTarget('./server/node/db.cjs');
    seed.kvSet('database/database.bin', Buffer.from(encodeRisuSaveLegacy(data)));
    const grants = marpGrants(data);
    if (pagefoldHash) {
        const key = JSON.stringify(['synthetic-pagefold', 'provider']);
        grants.given.push(key); grants.cache.push([key + '_lastGrantTime', Date.now()]);
        const localKey = name => 'cache/plugin-storage/' + Buffer.from(name).toString('base64url') + '.json';
        seed.kvSet(localKey('pagefold.config.v1'), JSON.stringify({ activeProvider: 'google', packagingMode: 'maximum',
            google: { apiKey: 'synthetic-only', model: 'fixture-pagefold', baseUrl: 'https://pagefold.example.test/v1beta' } }));
        seed.kvSet(localKey('pagefold.font.noto-sans-cjk-kr.v1'), JSON.stringify(fs.readFileSync(fontSource).toString('base64')));
    }
    seed.kvSet('cache/plugin-permissions/state.json', JSON.stringify(grants));
    const persisted = await decodeRisuSave(seed.kvGet('database/database.bin'));
    const expected = readMarpExpectations(persisted, original);
    const initialStatistics = persisted.statics.messages;
    assert.ok(Number.isSafeInteger(initialStatistics) && initialStatistics >= 0);
    seed.db.close();
    const password = 'synthetic-lifecycle-password';
    fs.writeFileSync(path.join(runtime, 'save/__password'), createHash('sha256').update(password).digest('hex'));
    const { chromium } = createRequire(path.join(dependencies, 'package.json'))('playwright');
    const context = {
        target, runtime, output, scenario, Database, ...expected, pagefoldHash, initialStatistics,
        events: [], admissions: [], accepted: [], cancellations: [], pageErrors: [], consoleErrors: [], saves: [],
        server: null, browser: null, browserServer: null, page: null, browserContext: null, epoch: 0, port: 0,
        browserHTTPAnalysis: 0, browserHTTPModuleOrPagefold: 0, logStreams: [], authHeaders: null, saveObservers: [],
    };
    const c = context;
    c.wait = async (check, label) => {
        for (let index = 0; index < 600; index++) {
            if (await check()) return;
            if (c.server && (c.server.exitCode !== null || c.server.signalCode !== null)) throw Error('Synthetic server exited: ' + label);
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        throw Error('Observation deadline: ' + label);
    };
    c.startServer = async () => {
        const epoch = ++c.epoch;
        c.server = fork(path.join(target, 'server/node/server.cjs'), [], {
            cwd: runtime, execArgv: ['--require', new URL('./bg-stream-preview-preload.cjs', import.meta.url).pathname],
            env: { ...process.env, PORT: String(c.port), TUNNEL_DISABLED: '1', RISU_UPDATE_CHECK: 'false',
                POCKETRISU_BG_PLUGIN_HOST_CANDIDATE: '1', G19_STREAM_PROBE: '1', G110_MARP_STREAM: '1',
                G110_LIFECYCLE_CASE: scenario, G110_EPOCH: String(epoch), G110_PDF_TARGET: target,
                G110_CLOSE_ANALYSIS: epoch === 1 && (scenario === 'queue-edit' || scenario.startsWith('stop-analysis') || scenario === 'restart-analysis') ? '1' : '0' },
            stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        });
        const server = c.server;
        const log = fs.createWriteStream(path.join(runtime, 'epoch-' + epoch + '.log'), { mode: 0o600 });
        c.logStreams.push(log); server.stdout.pipe(log); server.stderr.pipe(log);
        server.on('message', event => c.events.push({ ...event, epoch, receivedAt: performance.now() }));
        c.port = await new Promise((resolve, reject) => {
            server.on('message', event => { if (event.event === 'ready') resolve(event.port); });
            server.once('exit', (code, signal) => reject(Error('Server startup exited: ' + code + '/' + signal)));
        });
        c.origin = 'http://127.0.0.1:' + c.port;
    };
    c.authenticate = async () => {
        const login = await fetch(c.origin + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ password: createHash('sha256').update(password).digest('hex') }) });
        assert.equal(login.status, 200);
        c.authHeaders = { 'risu-auth': (await login.json()).token, 'x-chat-id': 'synthetic-chat',
            'x-client-build': JSON.parse(fs.readFileSync(path.join(target, 'dist/build-stamp.json'))).stamp };
        const session = await fetch(c.origin + '/api/session', { method: 'POST',
            headers: { ...c.authHeaders, 'x-session-id': 'synthetic-lifecycle-reader-' + c.epoch } });
        assert.equal(session.status, 200); assert.ok(session.headers.get('set-cookie'));
        c.authHeaders.cookie = session.headers.get('set-cookie').split(';')[0];
    };
    c.open = async state => {
        if (!c.browser?.isConnected()) {
            c.browserServer = await chromium.launchServer({ headless: true, host: '127.0.0.1',
                ...(process.env.G19_CHROMIUM ? { executablePath: process.env.G19_CHROMIUM } : {}) });
            try { c.browser = await chromium.connect(c.browserServer.wsEndpoint()); }
            catch (error) { await c.browserServer.close(); throw error; }
        }
        c.browserContext = await c.browser.newContext(state ? { storageState: state } : {});
        await c.browserContext.addInitScript(() => {
            const seen = new WeakSet(); window.__g110Toasts = [];
            new MutationObserver(() => {
                for (const toast of document.querySelectorAll('.risu-toast')) {
                    const title = toast.querySelector('.risu-toast-title')?.textContent?.trim();
                    if (title && !seen.has(toast)) { seen.add(toast); window.__g110Toasts.push(title); }
                }
            }).observe(document, { childList: true, subtree: true, characterData: true });
        });
        await c.browserContext.route('**/*', route => {
            const request = route.request();
            if (request.url().startsWith('https://analysis.example.test/')
                || decodeURIComponent(request.headers()['risu-url'] || '').startsWith('https://analysis.example.test/')) c.browserHTTPAnalysis++;
            if ([request.url(), decodeURIComponent(request.headers()['risu-url'] || '')]
                .some(url => url.startsWith('https://module-input.example.test/') || url.startsWith('https://pagefold.example.test/'))) c.browserHTTPModuleOrPagefold++;
            return request.url().startsWith(c.origin + '/') ? route.continue() : route.abort();
        });
        c.page = await c.browserContext.newPage();
        c.page.on('pageerror', error => c.pageErrors.push(error.message));
        c.page.on('dialog', dialog => { c.consoleErrors.push('dialog:' + dialog.message()); void dialog.dismiss(); });
        c.page.on('console', message => { if (message.type() === 'error') c.consoleErrors.push(message.text()); });
        c.page.on('request', request => {
            const pathname = new URL(request.url()).pathname;
            if (pathname === '/api/bg-orchestrate' && request.method() === 'POST') {
                const body = request.postDataJSON(); assert.equal(body.inputCommandVersion, 1);
                c.admissions.push({ operationId: body.operationId, body, receivedAt: performance.now() });
            }
            if (request.method() === 'DELETE' && /^\/api\/bg-orchestrate\//.test(pathname)) c.cancellations.push(pathname);
        });
        c.page.on('response', response => {
            const pathname = new URL(response.url()).pathname;
            if (pathname === '/api/bg-orchestrate' && response.request().method() === 'POST') void response.json().then(body => {
                if ([200, 202].includes(response.status()) && (body.accepted || body.started)) c.accepted.push(body.operationId);
            }).catch(error => c.consoleErrors.push('admission-observation:' + error.message));
            if (!['GET', 'HEAD'].includes(response.request().method()) && /\/api\/(?:write|patch|db)/.test(pathname)) {
                const row = { pathname, status: response.status() }; c.saves.push(row);
                if (response.status() >= 400) c.saveObservers.push(response.text().then(body => { row.body = body; })
                    .catch(error => { row.bodyError = error.message; }));
            }
        });
        await c.page.goto(c.origin, { waitUntil: 'domcontentloaded' });
        if (!state) {
            await c.page.getByText('Input your password.', { exact: false }).waitFor();
            await c.page.locator('input').fill(password);
            await c.page.getByRole('button', { name: 'Confirm', exact: true }).click();
        }
        await c.page.locator('[data-char-id="synthetic-character"]').first().click();
        await c.page.locator('textarea').waitFor();
    };
    c.readChat = async () => {
        const response = await fetch(c.origin + '/api/chat-content/synthetic-character/0', { headers: c.authHeaders });
        assert.equal(response.status, 200);
        return { chat: await decodeRisuSave(new Uint8Array(await response.arrayBuffer())), revision: response.headers.get('x-chat-revision'), observedAt: performance.now() };
    };
    c.preview = async () => {
        const response = await fetch(c.origin + '/api/bg-stream-preview/synthetic-character/synthetic-chat', { headers: c.authHeaders });
        assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store'); return response.json();
    };
    c.rows = prefix => {
        const db = new Database(path.join(runtime, 'save/risuai.db'), { readonly: true, fileMustExist: true });
        try { return db.prepare('SELECT value FROM kv WHERE key LIKE ?').all(prefix + '%').map(row => JSON.parse(Buffer.from(row.value).toString())); }
        finally { db.close(); }
    };
    c.readRoot = async () => {
        const db = new Database(path.join(runtime, 'save/risuai.db'), { readonly: true, fileMustExist: true });
        let bytes;
        try {
            bytes = db.transaction(() => {
                const chunks = db.prepare('SELECT m.seq,c.data FROM manifest_chunks m JOIN chunks c ON c.hash=m.hash WHERE m.manifest_key=? ORDER BY m.seq').all('database/database.bin');
                if (chunks.length) { assert.ok(chunks.every((row, index) => row.seq === index)); return Buffer.concat(chunks.map(row => Buffer.from(row.data))); }
                return db.prepare('SELECT value FROM kv WHERE key=?').get('database/database.bin').value;
            })();
        } finally { db.close(); }
        return decodeRisuSave(bytes);
    };
    c.send = async text => {
        const expected = c.admissions.length + 1;
        await c.page.locator('textarea').fill(text);
        await c.page.getByRole('button', { name: 'Send', exact: true }).click();
        await c.wait(() => c.admissions.length === expected && c.accepted.includes(c.admissions[expected - 1].operationId), 'actual input admission ACK');
        return c.admissions[expected - 1].operationId;
    };
    c.killBrowser = async () => {
        const proc = c.browserServer.process(); assert.ok(proc.pid > 0 && proc.pid !== process.pid && proc.exitCode === null);
        const exited = once(proc, 'exit'); await c.browserServer.kill(); const [code, signal] = await exited;
        assert.equal(signal, 'SIGKILL'); assert.equal(c.browser.isConnected(), false);
        return { code, signal, disconnected: true };
    };
    c.crashServer = async () => {
        const server = c.server;
        assert.ok(server.pid > 0 && server.pid !== process.pid && server.exitCode === null && server.signalCode === null);
        const exited = once(server, 'exit'); server.kill('SIGKILL'); const [code, signal] = await exited;
        assert.equal(signal, 'SIGKILL');
        c.events.push({ event: 'owned-server-exit', epoch: c.epoch, code, signal, receivedAt: performance.now() });
        return { epoch: c.epoch, code, signal };
    };
    c.close = async () => {
        await Promise.allSettled([c.browser?.close(), c.browserServer?.close()]);
        if (c.server?.exitCode === null && c.server?.signalCode === null) {
            const exited = once(c.server, 'exit'); c.server.kill('SIGTERM');
            let timer;
            await Promise.race([exited, new Promise(resolve => { timer = setTimeout(resolve, 3000); })]);
            clearTimeout(timer);
            if (c.server.exitCode === null && c.server.signalCode === null) {
                assert.ok(c.server.pid > 0 && c.server.pid !== process.pid);
                c.server.kill('SIGKILL'); await exited;
            }
        }
        c.logStreams.forEach(log => log.end());
    };
    try { await c.startServer(); await c.open(); await c.authenticate(); }
    catch (error) { await c.close(); throw error; }
    return c;
}
