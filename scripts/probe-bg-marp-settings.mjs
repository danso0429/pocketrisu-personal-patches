import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

// Explicit synthetic fixture/dependencies: no source or user database is bundled.
const [target, original, fixture, playwrightRoot, chromiumPath, output, scenario] = process.argv.slice(2);
const scenarios = ['selection', 'override-clear', 'all-off', 'queue', 'latest', 'flush-hold', 'retry', 'request-deadline', 'analysis-deadline', 'read-interleave', 'native-read-interleave'];
assert.ok(scenarios.includes(scenario), 'known scenario required');
for (const file of [original, fixture, chromiumPath]) assert.ok(fs.existsSync(file));
const require = createRequire(path.join(playwrightRoot, 'package.json'));
const { chromium } = require('playwright');
const Database = require(path.join(target, 'node_modules/better-sqlite3'));
const script = fs.readFileSync(original, 'utf8');
// These probes pin argument shape/prompts to this source fixture. This is a
// diagnostic input contract, not a production execution allowlist.
assert.equal(createHash('sha256').update(script).digest('hex'),
    'b1aa573048ea31ec036e21fd9df9f1a35d136435e247f15c3cdaa6026cd8e132');
const data = JSON.parse(fs.readFileSync(fixture, 'utf8'));
assert.equal(data.characters.length, 1); assert.equal(data.characters[0].chaId, 'synthetic-character');
assert.equal(data.characters[0].chats[0].id, 'synthetic-chat');
assert.equal(data.characters[0].chats[0].message.length, 0);
const agents = ['worldbuilding', 'plot', 'character'];
const configA = { provider: 'openai', baseUrl: 'https://analysis.example.test/v1', apiKey: 'synthetic-only',
    model: 'fixture-A', marpConfig: { request_timeout: 60, analysis_timeout: 120 },
    agents: Object.fromEntries(agents.map(name => [name, { enabled: true, model: '' }])) };
configA.agents.worldbuilding.systemPrompt = 'Synthetic world A system';
data.plugins = [{ name: 'risu_multiagent', version: '3.0', enabled: true, realArg: {}, script }];
data.pluginCustomStorage = { risu_multiagent_lite_config_vault_v1: { config: configA } };
data.openAIKey = 'synthetic'; data.useStreaming = false; data.streaming = false;
data.requestRetrys = 1; data.characters[0].triggerscript = [];
data.statics = { ...data.statics, messages: 0 };
for (const preset of data.modelPresets ?? []) preset.useStreaming = false;
const runtime = fs.mkdtempSync('/tmp/marp-settings-');
process.chdir(runtime);
const { decodeRisuSave } = require(path.join(target, 'server/node/utils.cjs'));
fs.symlinkSync(path.join(target, 'dist'), path.join(runtime, 'dist'));
fs.writeFileSync(path.join(runtime, 'package.json'), JSON.stringify({ name: 'pocketrisu', version: '1.10.0' }));
const password = createHash('sha256').update('synthetic-settings-password').digest('hex');
const seed = fork(path.join(target, 'server/node/bgServerChatProcessClient.cjs'), [],
    { cwd: runtime, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
seed.send({ scope: 'pocketrisu-h1-client', command: 'seed', runtimeRoot: runtime, targetRoot: target,
    password, databaseBase64: Buffer.from(JSON.stringify(data)).toString('base64') });
assert.equal((await once(seed, 'exit'))[0], 0);
const disk = new Database(path.join(runtime, 'save/risuai.db'));
const grants = ['replacer', 'mainDom', 'db'].map(p => JSON.stringify(['risu_multiagent', p]));
disk.prepare('INSERT OR REPLACE INTO kv(key,value) VALUES(?,?)').run('cache/plugin-permissions/state.json',
    Buffer.from(JSON.stringify({ given: grants, denied: [], cache: grants.map(key => [key + '_lastGrantTime', Date.now()]) })));
disk.close();
const gate = scenario === 'read-interleave' ? 'read' : scenario === 'retry' ? 'main'
    : ['queue', 'latest', 'request-deadline', 'analysis-deadline'].includes(scenario) ? 'analysis' : '';
const server = fork(path.join(target, 'server/node/server.cjs'), [], { cwd: runtime,
    execArgv: ['--require', new URL('./probes/bg-marp-settings-preload.cjs', import.meta.url).pathname],
    env: { ...process.env, PORT: '0', TUNNEL_DISABLED: '1', UPDATE_CHECK_DISABLED: '1',
        POCKETRISU_BG_PLUGIN_HOST_CANDIDATE: scenario === 'native-read-interleave' ? '0' : '1',
        MARP_SETTINGS_PROBE: '1', MARP_SETTINGS_GATE: gate,
        MARP_SETTINGS_RETRY: scenario === 'retry' ? '1' : '0' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
const events = []; server.on('message', event => events.push(event));
const log = fs.createWriteStream(path.join(runtime, 'server.log')); server.stdout.pipe(log); server.stderr.pipe(log);
async function wait(task) {
    const end = Date.now() + 60000;
    while (Date.now() < end) { const value = await task(); if (value) return value; await new Promise(r => setTimeout(r, 50)); }
    throw Error('synthetic observation deadline');
}
async function rootSettings() {
    const db = new Database(path.join(runtime, 'save/risuai.db'), { readonly: true });
    let bytes;
    try {
        bytes = db.transaction(() => {
            const rows = db.prepare('SELECT m.seq,c.data FROM manifest_chunks m JOIN chunks c ON c.hash=m.hash WHERE m.manifest_key=? ORDER BY m.seq').all('database/database.bin');
            if (!rows.length) return db.prepare('SELECT value FROM kv WHERE key=?').get('database/database.bin').value;
            assert.ok(rows.every((row, i) => row.seq === i)); return Buffer.concat(rows.map(row => row.data));
        })();
    } finally { db.close(); }
    const root = await decodeRisuSave(bytes);
    const raw = root.pluginCustomStorage.risu_multiagent_lite_config_vault_v1;
    return { config: (typeof raw === 'string' ? JSON.parse(raw) : raw).config, arguments: root.plugins[0].realArg };
}
const saved = [], admissions = [], acks = [], errors = [], patches = [];
let browser, page, heldPatch, heldPatchPaths, releasePatch, holdPatch = false, browserAnalysis = 0;
const formB = { default_model: 'fixture-B', request_timeout: '4', analysis_timeout: '12',
    worldbuilding_enabled: false, plot_enabled: true, character_enabled: true, plot_model: 'fixture-plot-B', character_model: '',
    plot_system_prompt: 'Synthetic plot B system', plot_user_prompt_template: 'Synthetic plot B {{user_input}} {{context_world}}',
    character_system_prompt: 'Synthetic character B system', character_user_prompt_template: 'Synthetic character B {{user_input}}' };
const formC = { default_model: 'fixture-C', worldbuilding_enabled: true, plot_enabled: false, character_enabled: false,
    worldbuilding_model: '', worldbuilding_system_prompt: 'Synthetic world C system',
    worldbuilding_user_prompt_template: 'Synthetic world C {{user_input}}' };
async function openForm() {
    await page.locator('button').first().click(); await page.locator('.hamburger-menu button').first().click();
    await page.getByText('System', { exact: true }).first().click();
    await page.getByText('Request Logs', { exact: true }).first().click();
    await page.getByText('MARP Lite', { exact: true }).first().click();
    return wait(async () => { for (const frame of page.frames()) if (await frame.locator('[name="default_model"]').count()) return frame; });
}
async function saveForm(fields, durable = true, alreadyOpen = null) {
    const frame = alreadyOpen ?? await openForm();
    for (const [name, value] of Object.entries(fields)) {
        const tab = name.endsWith('_prompt') || name.endsWith('_prompt_template') ? 'prompts'
            : agents.find(agent => name.startsWith(agent + '_')) ?? 'common';
        await frame.locator('[data-tab="' + tab + '"]').click();
        const field = frame.locator('[name="' + name + '"]');
        if (typeof value === 'boolean') await field.setChecked(value); else await field.fill(value);
    }
    await frame.getByRole('button', { name: '설정 저장', exact: true }).click();
    await frame.getByText('설정을 저장했습니다.', { exact: true }).waitFor();
    saved.push({ event: 'ui-confirmed', fields, at: performance.now() });
    await frame.getByRole('button', { name: '닫기', exact: true }).click();
    await page.locator('button').filter({ has: page.locator('svg.lucide-circle-x') }).first().click();
    if (durable) await wait(async () => {
        const state = await rootSettings();
        if (fields.default_model && (state.config.model !== fields.default_model || state.arguments.agent_model !== fields.default_model)) return false;
        saved.push({ event: 'durable-observed', state, at: performance.now() }); return true;
    });
}
async function send(number) {
    await page.locator('[data-char-id="synthetic-character"]').first().click();
    await page.locator('textarea').fill('Synthetic settings question ' + number);
    if (number === 1) await page.getByRole('button', { name: 'Send', exact: true }).click();
    else await page.locator('textarea').press('Enter');
    await wait(() => admissions.length >= number && acks.includes(admissions[number - 1]));
}
try {
    const origin = 'http://127.0.0.1:' + await wait(() => events.find(x => x.event === 'ready')?.port);
    browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
    // The app fixture does not register a worker. Playwright's block option
    // injects a navigator.serviceWorker read into opaque plugin frames.
    const context = await browser.newContext();
    if (scenario === 'native-read-interleave') await context.addInitScript(() => {
        window.__m4Native = { registered: null, result: null, calls: [] };
        window.__m4HoldArguments = false; window.__m4HeldCalls = []; window.__m4Responses = [];
        window.addEventListener('message', event => {
            const row = event.data;
            if (row?.type === 'RESPONSE') window.__m4Responses.push(row);
            // Installed in the parent before the native factory registers its
            // handler. Pause argument dispatch after the vault has returned.
            if (window.__m4HoldArguments && row?.type === 'CALL_ROOT' && row.method === 'getArgument') {
                event.stopImmediatePropagation(); window.__m4HeldCalls.push({ data: row, source: event.source });
            }
            if (row?.type === 'CALL_ROOT') window.__m4Native.calls.push({ reqId: row.reqId, method: row.method, args: row.args });
            if (row?.type === 'CALL_ROOT' && row.method === 'addRisuReplacer' && row.args?.[0] === 'beforeRequest') {
                window.__m4Native.registered = { source: event.source, id: row.args[1].id };
            }
            if (row?.type === 'CALLBACK_RETURN' && row.reqId === 'synthetic-m4-callback') window.__m4Native.result = row;
        });
    });
    await context.route('**/*', async route => {
        const request = route.request(), url = request.url();
        if (url === origin + '/api/patch' && request.method() === 'POST') {
            const body = request.postDataJSON();
            patches.push(body.patch?.map(p => p.path) ?? []);
            if (holdPatch && JSON.stringify(body.patch).includes('fixture-B')) {
                holdPatch = false; heldPatch = true;
                heldPatchPaths = body.patch.map(p => p.path);
                await new Promise(resolve => { releasePatch = resolve; });
            }
        }
        if (url.startsWith(origin + '/')) return route.continue();
        if (url.startsWith('https://analysis.example.test/')) browserAnalysis++;
        if (url.includes('/wasmoon@1.16.0/') && url.endsWith('/glue.wasm')) return route.fulfill({
            body: fs.readFileSync(path.join(target, 'node_modules/wasmoon/dist/glue.wasm')), contentType: 'application/wasm' });
        return route.abort();
    });
    page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    page.on('request', request => {
        if (request.url() === origin + '/api/bg-orchestrate' && request.method() === 'POST') {
            const body = request.postDataJSON(); assert.equal(body.inputCommandVersion, 1); admissions.push(body.operationId);
        }
    });
    page.on('response', async response => {
        if (response.url() === origin + '/api/bg-orchestrate' && response.request().method() === 'POST') {
            const body = await response.json();
            if ([200, 202].includes(response.status()) && (body.started || body.accepted)) acks.push(body.operationId);
        }
    });
    await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.waitForTimeout(1500);
    if (await page.getByText('Input your password.', { exact: false }).count()) {
        await page.locator('input').fill('synthetic-settings-password'); await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    }
    if (scenario === 'native-read-interleave') {
        await wait(() => page.evaluate(() => !!window.__m4Native?.registered));
        const form = await openForm();
        await form.evaluate(() => { window.__m4Responses = []; });
        const nativeStart = await page.evaluate(() => window.__m4Native.calls.length);
        await page.evaluate(() => {
            window.__m4HoldArguments = true;
            const ref = window.__m4Native.registered;
            ref.source.postMessage({ type: 'INVOKE_CALLBACK', id: ref.id, reqId: 'synthetic-m4-callback',
                args: [[{ role: 'system', content: 'Synthetic native setting' }, { role: 'user', content: 'Synthetic settings question 1' }], 'model'] }, '*');
        });
        await wait(() => page.evaluate(() => window.__m4HeldCalls.length === 17));
        const heldIds = await page.evaluate(() => window.__m4HeldCalls.map(row => row.data.reqId));
        assert.ok((await form.evaluate(() => window.__m4Responses)).every(row => !heldIds.includes(row.reqId)),
            'paused native argument calls must not have completed');
        await saveForm(formB, true, form);
        await page.evaluate(() => {
            window.__m4HoldArguments = false;
            for (const row of window.__m4HeldCalls) window.dispatchEvent(new MessageEvent('message', { data: row.data, source: row.source }));
        });
        const result = await wait(() => page.evaluate(() => window.__m4Native.result));
        const calls = (await page.evaluate(() => window.__m4Native.calls)).slice(nativeStart);
        const responses = await form.evaluate(() => window.__m4Responses);
        fs.writeFileSync(path.join(runtime, 'native-read-trace.json'), JSON.stringify({ calls, responses, result }, null, 2));
        const setModel = calls.findIndex(row => row.method === 'setArgument' && row.args[0] === 'agent_model');
        const getModel = calls.findLastIndex(row => row.method === 'getArgument' && row.args[0] === 'agent_model');
        assert.ok(setModel >= 0 && getModel > setModel, 'held vault must postpone argument reads until after Save');
        assert.equal(responses.find(row => row.reqId === calls[getModel].reqId)?.result, 'fixture-B');
        fs.writeFileSync(path.join(runtime, 'native-read-trace.json'), JSON.stringify({
            calls: await page.evaluate(() => window.__m4Native.calls), responses: await form.evaluate(() => window.__m4Responses),
            result }, null, 2));
        assert.equal(result.error, undefined);
        assert.equal(JSON.stringify(result.result).match(/<!--MARP:v1:begin-->/g)?.length, 1);
        const analyses = events.filter(row => row.event === 'analysis');
        assert.deepEqual(analyses.map(row => row.body.model), Array(3).fill('fixture-B'));
        const retainedOldVault = analyses[0].body.messages[0].content.startsWith('Synthetic world A system');
        const freshArguments = responses.find(row => row.reqId === calls[getModel].reqId)?.result === 'fixture-B';
        assert.ok(retainedOldVault && freshArguments);
        assert.ok(analyses.every(row => !row.body.messages[0].content.startsWith('Synthetic plot B system')
            && !row.body.messages[0].content.startsWith('Synthetic character B system')));
        assert.equal(events.filter(row => row.event === 'main' || row.event === 'host').length, 0);
        assert.deepEqual(errors, []); assert.equal(context.serviceWorkers().length, 0);
        fs.mkdirSync(output, { recursive: true });
        const finalSettings = await rootSettings(); assertFinalSettings(finalSettings);
        fs.writeFileSync(path.join(output, scenario + '.json'), JSON.stringify({ scenario, runtime,
            originalHash: createHash('sha256').update(script).digest('hex'), actualV3Callback: true,
            retainedOldVault, freshArguments, saved, events, result: result.result,
            analysis: 3, main: 0, answers: 0, errors, finalSettings }, null, 2));
        console.log(JSON.stringify({ scenario, runtime, analysis: 3, main: 0, oldVaultNewArguments: true }));
        await browser.close(); browser = null;
        // Comparator invokes an actual registered native hook, not Send/store.
        // Exit the try body after the comparator's independent assertions.
    } else {
    if (['selection', 'override-clear'].includes(scenario)) await saveForm(formB, false);
    if (scenario === 'all-off') await saveForm({ default_model: 'fixture-OFF', ...Object.fromEntries(agents.map(a => [a + '_enabled', false])) }, false);
    if (scenario === 'flush-hold') { holdPatch = true; await saveForm(formB, false); await wait(() => heldPatch); }
    if (scenario.endsWith('-deadline')) await saveForm({ default_model: 'fixture-timeout', request_timeout: scenario === 'request-deadline' ? '0.4' : '4',
        analysis_timeout: scenario === 'analysis-deadline' ? '0.4' : '4' });
    if (scenario === 'flush-hold') {
        const started = send(1);
        await page.waitForTimeout(500);
        assert.equal(admissions.length, 0); assert.equal(events.filter(x => ['analysis', 'main'].includes(x.event)).length, 0);
        assert.ok(heldPatchPaths.some(p => p.startsWith('/plugins/0/realArg/')));
        assert.ok(heldPatchPaths.some(p => p.startsWith('/pluginCustomStorage/risu_multiagent_lite_config_vault_v1/')));
        releasePatch(); await started;
    } else await send(1);
    if (['queue', 'latest'].includes(scenario)) {
        await wait(() => events.some(x => x.event === 'analysis'));
        if (scenario === 'queue') { await send(2); await saveForm(formB); }
        else { await saveForm(formB); await send(2); await saveForm(formC); }
    }
    if (scenario === 'retry') { await wait(() => events.some(x => x.event === 'main')); await saveForm(formB); }
    if (scenario === 'read-interleave') { await wait(() => events.some(x => x.event === 'read-held')); await saveForm(formB); }
    if (scenario === 'override-clear') {
        await page.getByText('Synthetic settings answer', { exact: true }).first().waitFor();
        await saveForm({ default_model: 'fixture-B', plot_model: '', plot_system_prompt: '', plot_user_prompt_template: '' });
        await send(2);
    }
    if (scenario.endsWith('-deadline')) {
        await wait(() => events.some(x => x.event === 'aborted'));
        await wait(() => events.some(x => x.event === 'main'));
        await saveForm({ default_model: 'fixture-restored', request_timeout: '4', analysis_timeout: '12' });
        server.send({ event: 'release' });
        await send(2);
    }
    assert.equal(context.serviceWorkers().length, 0);
    if (!scenario.endsWith('-deadline')) assert.equal(events.filter(row => row.event === 'aborted').length, 0,
        'a held boundary must not be released by an unintended request deadline');
    await browser.close(); browser = null; server.send({ event: 'release' });
    const expectedAnswers = ['override-clear', 'queue', 'latest', 'request-deadline', 'analysis-deadline'].includes(scenario) ? 2 : 1;
    const login = await fetch(origin + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
    assert.equal(login.status, 200); const token = (await login.json()).token;
    const session = await fetch(origin + '/api/session', { method: 'POST', headers: { 'risu-auth': token, 'x-session-id': 'synthetic-settings-readback' } });
    const headers = { 'risu-auth': token, cookie: session.headers.get('set-cookie').split(';')[0],
        'x-client-build': JSON.parse(fs.readFileSync(path.join(target, 'dist/build-stamp.json'))).stamp };
    const chat = await wait(async () => {
        const response = await fetch(origin + '/api/chat-content/synthetic-character/0', { headers }); assert.equal(response.status, 200);
        const value = await decodeRisuSave(new Uint8Array(await response.arrayBuffer()));
        return value.message.filter(m => m.role === 'char').length === expectedAnswers ? value : null;
    });
    const analyses = events.filter(x => x.event === 'analysis'), mains = events.filter(x => x.event === 'main');
    const hosts = events.filter(x => x.event === 'host');
    assert.deepEqual(hosts.map(row => row.operationId), admissions);
    const refreshStarts = events.filter(x => x.event === 'identity-refresh-start');
    const refreshEnds = events.filter(x => x.event === 'identity-refresh-end');
    assert.deepEqual(refreshStarts.map(row => row.operationId), admissions);
    assert.deepEqual(refreshEnds.map(row => row.operationId), admissions);
    for (let index = 0; index < hosts.length; index++) {
        assert.ok(hosts[index].at < refreshStarts[index].at);
        assert.ok(refreshStarts[index].at < refreshEnds[index].at);
        assert.ok(analyses.filter(row => row.at > hosts[index].at && (index + 1 === hosts.length || row.at < hosts[index + 1].at))
            .every(row => row.at > refreshEnds[index].at));
    }
    assert.equal(events.filter(row => row.event === 'read').length, 18 * (scenario === 'retry' ? 2 : expectedAnswers));
    assert.ok(analyses.every(row => hosts.some(host => host.at < row.at)));
    const models = analyses.map(x => x.body.model);
    const bModels = ['fixture-plot-B', 'fixture-B'];
    const expectedModels = scenario === 'all-off' ? [] : ['selection', 'flush-hold'].includes(scenario) ? bModels
        : scenario === 'queue' || scenario === 'retry' ? [...Array(3).fill('fixture-A'), ...bModels]
        : scenario === 'latest' ? [...Array(3).fill('fixture-A'), 'fixture-C']
        : scenario === 'override-clear' ? [...bModels, 'fixture-B', 'fixture-B']
        : scenario === 'read-interleave' ? Array(3).fill('fixture-B') : null;
    if (expectedModels) assert.deepEqual([...models].sort(), [...expectedModels].sort());
    if (['queue', 'latest', 'retry'].includes(scenario)) assert.deepEqual(models.slice(0, 3), Array(3).fill('fixture-A'));
    for (const row of analyses.filter(x => scenario !== 'read-interleave'
        && !(scenario === 'override-clear' && x.id > 2) && bModels.includes(x.body.model))) {
        const agent = row.body.model === 'fixture-plot-B' ? 'plot' : 'character';
        assert.ok(row.body.messages[0].content.startsWith('Synthetic ' + agent + ' B system'));
        assert.ok(row.body.messages[1].content.includes('Synthetic ' + agent + ' B Synthetic settings question'));
        assert.ok(!row.body.messages[1].content.includes('{{user_input}}'));
        assert.ok(!row.body.messages[1].content.includes('{{context_world}}'));
    }
    for (const row of analyses.filter(x => x.body.model === 'fixture-C')) {
        assert.ok(row.body.messages[0].content.startsWith('Synthetic world C system'));
        assert.equal(row.body.messages[1].content, 'Synthetic world C Synthetic settings question 2');
    }
    assert.equal(mains.length, scenario === 'retry' ? 2 : expectedAnswers);
    for (const row of mains) {
        const blocks = JSON.stringify(row.body.messages).match(/<!--MARP:v1:begin-->/g)?.length ?? 0;
        assert.equal(blocks, scenario === 'all-off' || (scenario === 'analysis-deadline' && row.id === 1) ? 0 : 1);
        const noteModels = [...JSON.stringify(row.body.messages).matchAll(/Synthetic note ([a-zA-Z0-9_-]+)/g)].map(m => m[1]);
        const wantedNotes = scenario === 'all-off' ? [] : ['selection', 'flush-hold'].includes(scenario) ? bModels
            : ['queue', 'retry'].includes(scenario) ? row.id === 1 ? Array(3).fill('fixture-A') : bModels
            : scenario === 'latest' ? row.id === 1 ? Array(3).fill('fixture-A') : ['fixture-C']
            : scenario === 'override-clear' ? row.id === 1 ? bModels : ['fixture-B', 'fixture-B']
            : scenario === 'read-interleave' ? Array(3).fill('fixture-B')
            : scenario === 'request-deadline' ? row.id === 1 ? ['fixture-timeout', 'fixture-timeout'] : Array(3).fill('fixture-restored')
            : row.id === 1 ? [] : Array(3).fill('fixture-restored');
        assert.deepEqual(noteModels.sort(), [...wantedNotes].sort(), 'final main must contain exactly this attempt\'s analysis notes');
        if (scenario === 'request-deadline' && row.id === 1) {
            const text = JSON.stringify(row.body.messages);
            assert.equal(text.match(/Synthetic note fixture-timeout/g)?.length, 2);
        }
    }
    if (scenario.endsWith('-deadline')) {
        assert.ok(events.some(x => x.event === 'aborted'));
        assert.equal(models.filter(m => m === 'fixture-restored').length, 3);
    }
    if (scenario === 'read-interleave') assert.ok(analyses.every(row =>
        !row.body.messages[0].content.startsWith('Synthetic plot B system')
        && !row.body.messages[0].content.startsWith('Synthetic character B system')));
    if (scenario === 'read-interleave') assert.ok(analyses[0].body.messages[0].content.startsWith('Synthetic world A system'));
    if (scenario === 'override-clear') {
        assert.ok(analyses.slice(2).some(row => row.body.messages[0].content.includes('You are the plot management agent.')));
        const state = await rootSettings(); assert.equal(state.config.agents.plot.model, '');
        assert.equal(state.config.agents.plot.systemPrompt, ''); assert.equal(state.config.agents.plot.userPromptTemplate, '');
    }
    assert.equal(chat.message.filter(m => m.role === 'user').length, expectedAnswers);
    assert.ok(chat.message.filter(m => m.role === 'char').every(m => m.data === 'Synthetic settings answer'));
    assert.equal(browserAnalysis, 0); assert.deepEqual(errors, []);
    assert.equal(events.filter(x => x.event === 'validation-error').length, 0);
    assert.equal(events.filter(x => x.event === 'observation-error').length, 0);
    if(['selection','queue','retry'].includes(scenario))assert.deepEqual(events.filter(x=>x.event==='host-notice'),[],
        'unchanged original identity survives stripped assembly snapshot and refresh');
    const finalSettings = await rootSettings(); assertFinalSettings(finalSettings);
    const receipt = { scenario, runtime, originalBytes: Buffer.byteLength(script), originalHash: createHash('sha256').update(script).digest('hex'),
        admissions, acks, saved, patches, heldPatchPaths, events, analysis: models.length, main: mains.length, answers: expectedAnswers,
        browserClosedBeforeFinalRelease: true, nextRequestReleasedWhileBrowserOpen: scenario.endsWith('-deadline'),
        browserAnalysis, errors, finalSettings };
    fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, scenario + '.json'), JSON.stringify(receipt, null, 2));
    console.log(JSON.stringify({ scenario, runtime, analysis: models.length, main: mains.length, answers: expectedAnswers, models }));
    }
} catch (error) {
    fs.writeFileSync(path.join(runtime, 'failure.json'), JSON.stringify({ events, saved, admissions, acks, errors }, null, 2));
    if (page && !page.isClosed()) fs.writeFileSync(path.join(runtime, 'failure.txt'), await page.locator('body').innerText());
    console.error(runtime, error); process.exitCode = 1;
} finally {
    releasePatch?.(); await browser?.close(); server.send?.({ event: 'release' });
    if (server.exitCode === null && server.signalCode === null) { const exited = once(server, 'exit'); server.kill('SIGTERM'); await exited; }
}
function assertFinalSettings(state) {
    const c = state.config, a = state.arguments;
    assert.equal(c.model, a.agent_model);
    const b = ['selection', 'queue', 'flush-hold', 'retry', 'read-interleave', 'native-read-interleave', 'override-clear'].includes(scenario);
    if (b) {
        assert.equal(c.model, 'fixture-B');
        assert.deepEqual(agents.map(n => c.agents[n].enabled), [false, true, true]);
        assert.equal(c.agents.plot.model, scenario === 'override-clear' ? '' : 'fixture-plot-B');
        assert.equal(c.agents.plot.systemPrompt, scenario === 'override-clear' ? '' : 'Synthetic plot B system');
        assert.equal(c.agents.plot.userPromptTemplate, scenario === 'override-clear' ? '' : 'Synthetic plot B {{user_input}} {{context_world}}');
        assert.equal(c.agents.character.model, '');
        assert.equal(c.agents.character.systemPrompt, 'Synthetic character B system');
        assert.equal(c.agents.character.userPromptTemplate, 'Synthetic character B {{user_input}}');
        assert.deepEqual(c.marpConfig, { request_timeout: 4, analysis_timeout: 12 });
    } else if (scenario === 'latest') {
        assert.equal(c.model, 'fixture-C');
        assert.deepEqual(agents.map(n => c.agents[n].enabled), [true, false, false]);
        assert.equal(c.agents.worldbuilding.model, '');
        assert.equal(c.agents.worldbuilding.systemPrompt, 'Synthetic world C system');
        assert.equal(c.agents.worldbuilding.userPromptTemplate, 'Synthetic world C {{user_input}}');
        assert.deepEqual(c.marpConfig, { request_timeout: 4, analysis_timeout: 12 });
    } else if (scenario === 'all-off') {
        assert.equal(c.model, 'fixture-OFF');
        assert.ok(agents.every(n => c.agents[n].enabled === false));
    } else {
        assert.equal(c.model, 'fixture-restored');
        assert.ok(agents.every(n => c.agents[n].enabled === true));
        assert.deepEqual(c.marpConfig, { request_timeout: 4, analysis_timeout: 12 });
    }
}
