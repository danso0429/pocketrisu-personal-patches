'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fork } = require('node:child_process');
const { once } = require('node:events');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');

const target = path.resolve(process.argv[2] ?? '');
assert.ok(fs.existsSync(path.join(target, 'package.json')), 'usage: node scripts/probe-bg-post-response.cjs <composed-tree>');
const Database = createRequire(path.join(target, 'package.json'))('better-sqlite3');
const preload = path.join(__dirname, 'probes/bg-post-response-preload.cjs');
const defaultDatabaseHelper = path.join(__dirname, 'probes/bg-d1a-default-database.cjs');
const password = createHash('sha256').update('synthetic-d3-password').digest('hex');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(predicate, message, timeout = 60_000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        const value = await predicate();
        if (value) return value;
        await delay(50);
    }
    throw Error(message);
}

async function terminateChild(child) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill('SIGTERM');
    if (await Promise.race([once(child, 'exit').then(() => true), delay(3000).then(() => false)])) return;
    child.kill('SIGKILL');
    await once(child, 'exit');
}

async function defaultDatabase() {
    const helper = fork(defaultDatabaseHelper, [target], { cwd: target, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    try {
        return await Promise.race([
            once(helper, 'message').then(([message]) => message),
            once(helper, 'exit').then(([code]) => { throw Error('default database helper exited ' + code); }),
            delay(10_000).then(() => { throw Error('default database helper deadline exceeded'); }),
        ]);
    } finally {
        if (helper.connected) helper.disconnect();
        await terminateChild(helper);
    }
}

function databaseFixture(base, mode = 'causal') {
    const preset = { id: 'synthetic-d3-preset', name: 'Synthetic D3', createdAt: 100, updatedAt: 100, useStreaming: false,
        profileSnapshot: { profileId: 'synthetic:standard', profileVersion: 1, providerBaseId: 'synthetic',
            providerBaseVersion: 1, adapterKind: 'openai-compatible', auth: { kind: 'bearer', fields: ['apiKey'] },
            endpoint: { kind: 'static', url: 'https://api.openai.com/v1/chat/completions' }, modelId: 'synthetic-model',
            schema: [{ key: 'apiKey', type: 'string', label: 'Key', secret: true, mapsTo: { target: 'auth', path: 'apiKey' } }],
            uiSchema: { groups: [], fields: [] }, defaults: { max_tokens: 128 },
            headerTemplate: { 'Content-Type': 'application/json' }, capabilities: ['streaming'] },
        userValues: { apiKey: 'synthetic-key' } };
    const chat = index => ({ id: `synthetic-d3-chat-${index}`, name: `D3 ${index}`, message: [], fmIndex: -1,
        scriptstate: {}, useModelPreset: false, modelBinding: { main: preset.id, sub: preset.id, separateAux: false,
            aux: { memory: '', emotion: '', translate: '', otherAx: '' } }, isStreaming: false, note: '', localLore: [] });
    const causalScript = `
        await Risuai.addRisuReplacer('afterRequest',async value=>{
            setTimeout(async()=>{
                const characterIndex=await Risuai.getCurrentCharacterIndex();
                const chatIndex=await Risuai.getCurrentChatIndex();
                const [database,chat,lore]=await Promise.all([
                    Risuai.getDatabase(['characters']),Risuai.getChatFromIndex(characterIndex,chatIndex),
                    Risuai.getCurrentLorebookEntries()
                ]);
                const response=await Risuai.nativeFetch('https://synthetic.invalid/d3-post-response',{
                    method:'POST',headers:{'content-type':'application/json'},
                    body:JSON.stringify({database,chat,lore})
                });
                await response.text();
            },1500);
            return value;
        });`;
    const deadlineScript = `
        await Risuai.addRisuReplacer('afterRequest',value=>{
            setTimeout(async()=>{const response=await Risuai.nativeFetch('https://synthetic.invalid/d3-post-response-hang',{
                method:'POST',body:'deadline-probe'
            });await response.text();},5);
            return value;
        });`;
    const plugin = { name: 'synthetic-d3-post-response', version: '3.0', enabled: true, realArg: {},
        script: mode === 'deadline' ? deadlineScript : causalScript };
    return { ...structuredClone(base), apiType: 'gemini-3-flash-preview', aiModel: 'gpt35', subModel: 'gpt35',
        openAIKey: 'synthetic', currentPluginProvider: '', customModels: [], dynamicModelRegistry: true,
        streaming: false, useStreaming: false, modelProfileRegistryCache: { schemaVersion: 4, registries: {} },
        modelProfileRegistryLastFetched: 0, modelProfileVisibilityLevel: 'currentOnly',
        seperateModels: { memory: '', emotion: '', translate: '', otherAx: '' }, seperateModelsForAxModels: false,
        seperateParameters: { memory: {}, emotion: {}, translate: {}, otherAx: {}, overrides: {} },
        seperateParametersEnabled: false, customAPIFormat: 0, customProxyRequestModel: '', forceReplaceUrl: '', proxyKey: '',
        mainPrompt: '', jailbreak: '', globalNote: '', personaPrompt: '', presetChain: '', moduleIntergration: '', username: 'Synthetic',
        promptSettings: { assistantPrefill: '', postEndInnerFormat: '', sendChatAsSystem: false, sendName: false,
            utilOverride: false, customChainOfThought: false, maxThoughtTagDepth: -1 },
        formatingOrder: ['main', 'description', 'personaPrompt', 'chats', 'lastChat', 'jailbreak', 'lorebook', 'globalNote', 'authorNote'],
        temperature: 80, maxContext: 4000, maxResponse: 300, frequencyPenalty: 70, PresensePenalty: 70, bias: [],
        nodeOnlyModelModeLock: 'legacy', nodeOnlyServerSideRequests: false, requestRetrys: 1,
        fallbackModels: { model: [], memory: [], emotion: [], translate: [], otherAx: [] }, enabledModules: [], modules: [], personas: [],
        modelPresets: [preset], templateDefaultVariables: '', globalChatVariables: {}, statics: { messages: 0, imports: 0 },
        pluginCustomStorage: {}, characters: [{ type: 'character', chaId: 'synthetic-d3-character', name: 'Synthetic',
            chats: [chat(1), chat(2)], chatPage: 0, reloadKeys: 0, lowLevelAccess: true, defaultVariables: '', customscript: [],
            lorebook: [], triggerscript: [], emotionImages: [], desc: '', notes: '', chatFolders: [], viewScreen: 'none',
            globalLore: [], sdData: [], utilityBot: false, bias: [], alternateGreetings: [], tags: [], creator: '',
            characterVersion: '', firstMsgIndex: -1, replaceGlobalNote: '', additionalText: '', personality: '', scenario: '',
            firstMessage: '', exampleMessage: '', creatorNotes: '', systemPrompt: '', postHistoryInstructions: '' }], plugins: [plugin] };
}

async function seedRuntime(runtime, database) {
    fs.writeFileSync(path.join(runtime, 'package.json'), JSON.stringify({ name: 'pocketrisu', version: '1.10.0' }));
    fs.symlinkSync(path.join(target, 'dist'), path.join(runtime, 'dist'));
    const seed = fork(path.join(target, 'server/node/bgServerChatProcessClient.cjs'), [],
        { cwd: runtime, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    seed.send({ scope: 'pocketrisu-h1-client', command: 'seed', runtimeRoot: runtime, targetRoot: target, password,
        databaseBase64: Buffer.from(JSON.stringify(database)).toString('base64') });
    assert.equal((await once(seed, 'exit'))[0], 0);
    const db = new Database(path.join(runtime, 'save/risuai.db'));
    const permissions = ['replacer', 'db'].map(name => JSON.stringify([database.plugins[0].name, name]));
    db.prepare('INSERT OR REPLACE INTO kv (key,value) VALUES (?,?)').run('cache/plugin-permissions/state.json',
        Buffer.from(JSON.stringify({ given: permissions, denied: [],
            cache: permissions.map(permission => [permission + '_lastGrantTime', Date.now()]) })));
    db.close();
}

async function launch(t, runtime, events) {
    const server = fork(path.join(target, 'server/node/server.cjs'), [], { cwd: runtime,
        execArgv: ['--require', preload], env: { ...process.env, PORT: '0', POCKETRISU_D3_PROBE: '1',
            POCKETRISU_BG_PLUGIN_HOST_CANDIDATE: '1', TUNNEL_DISABLED: '1', UPDATE_CHECK_DISABLED: '1' },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    const log = fs.createWriteStream(path.join(runtime, `server-${Date.now()}.log`));
    server.stdout.pipe(log); server.stderr.pipe(log); server.on('message', message => events.push(message));
    t.after(async () => { await terminateChild(server); log.end(); });
    const ready = await waitFor(() => events.find(row => row.event === 'ready'), 'D3 server did not become ready');
    return { server, origin: `http://127.0.0.1:${ready.port}` };
}

async function credentials(origin, suffix) {
    const login = await fetch(origin + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }) });
    assert.equal(login.status, 200); const { token } = await login.json();
    const stamp = JSON.parse(fs.readFileSync(path.join(target, 'dist/build-stamp.json'), 'utf8')).stamp;
    const session = await fetch(origin + '/api/session', { method: 'POST',
        headers: { 'risu-auth': token, 'x-session-id': `d3-session-${suffix}` } });
    assert.equal(session.status, 200);
    return { 'content-type': 'application/json', 'risu-auth': token,
        cookie: session.headers.get('set-cookie').split(';')[0], 'x-client-build': stamp };
}

async function readChat(origin, headers, index) {
    const response = await fetch(`${origin}/api/chat-content/synthetic-d3-character/${index - 1}`,
        { headers: { ...headers, 'x-chat-id': `synthetic-d3-chat-${index}` } });
    assert.equal(response.status, 200);
    const { decodeRisuSave } = require(path.join(target, 'server/node/utils.cjs'));
    return { chat: await decodeRisuSave(new Uint8Array(await response.arrayBuffer())), revision: response.headers.get('x-chat-revision') };
}

async function submit(origin, headers, index, operationId, rawText) {
    const before = await readChat(origin, headers, index);
    const response = await fetch(origin + '/api/bg-orchestrate', { method: 'POST', headers, body: JSON.stringify({
        detached: true, selectedCharId: 'synthetic-d3-character', selectedChatId: `synthetic-d3-chat-${index}`,
        currentChat: before.chat, operationId, baseChatRevision: before.revision, resultKeyVersion: 1,
        resultOrderVersion: 1, startAckVersion: 1, serverChatCommitVersion: 1, inputCommandVersion: 1,
        inputCommand: { inputCommandId: operationId + '-input', userMessageId: operationId + '-user', rawText,
            settingsSnapshotRef: 'synthetic-ref', submittedAt: Date.now() },
    }) });
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
}

async function finalResult(origin, headers, operationId, index) {
    return waitFor(async () => {
        const response = await fetch(`${origin}/api/bg-orchestrate-result/${operationId}?charId=synthetic-d3-character&chatId=synthetic-d3-chat-${index}&consumerId=consumer-${operationId}`, { headers });
        if (!response.ok) return null;
        const value = await response.json(); return value.final ? value : null;
    }, `D3 operation ${operationId} did not finish`, 90_000);
}

async function chatActivity(origin, headers, index) {
    const response = await fetch(`${origin}/api/bg-chat-activity/synthetic-d3-character/synthetic-d3-chat-${index}`, { headers });
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
}

function writeSyncRecord(runtime, record) {
    const db = new Database(path.join(runtime, 'save/risuai.db'));
    db.prepare('INSERT OR REPLACE INTO kv (key,value) VALUES (?,?)').run(`bg-post-response-sync:${record.operationId}`, JSON.stringify(record));
    db.close();
}

function readSyncRecord(runtime, operationId) {
    const db = new Database(path.join(runtime, 'save/risuai.db'));
    const value = db.prepare('SELECT value FROM kv WHERE key=?').get(`bg-post-response-sync:${operationId}`)?.value;
    db.close();
    return value == null ? null : JSON.parse(Buffer.from(value).toString('utf8'));
}

describe('[D3-1] Post-commit continuation for afterRequest timers', { concurrency: false }, () => {
    test('[new] runs the 1500ms afterRequest HTTP callback once after commit and serializes N+1 and another chat behind release',
        { timeout: 180_000 }, async t => {
            const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'pocketrisu-d3-'));
            t.after(() => fs.rmSync(runtime, { recursive: true, force: true }));
            await seedRuntime(runtime, databaseFixture(await defaultDatabase()));
            const events = [];
            const running = await launch(t, runtime, events);
            const headers = await credentials(running.origin, 'causal');
            await delay(500);
            await submit(running.origin, headers, 1, 'operation-d3-causal-1', 'first');
            await waitFor(() => events.find(row => row.event === 'provider' && row.call === 1), 'first provider call missing');
            const committed = await waitFor(async () => {
                const value = await readChat(running.origin, headers, 1);
                return value.chat.message.some(row => row.chatId === 'operation-d3-causal-1-user') ? value : null;
            }, 'first canonical commit missing');
            const n1 = await submit(running.origin, headers, 1, 'operation-d3-causal-2', 'second');
            const other = await submit(running.origin, headers, 2, 'operation-d3-causal-3', 'other chat');
            assert.equal(n1.started, true); assert.equal(other.started, true);
            const backend = await waitFor(() => events.find(row => row.event === 'post-response-backend'), 'post-response backend call missing');
            const payload = JSON.parse(backend.body);
            assert.ok(JSON.stringify(payload).includes('synthetic-d3-answer-1'));
            assert.ok(JSON.stringify(payload).includes('operation-d3-causal-1-user'));
            const firstProviderIndex = events.findIndex(row => row.event === 'provider' && row.call === 1);
            const backendIndex = events.indexOf(backend);
            const secondProviderIndex = await waitFor(() => {
                const index = events.findIndex(row => row.event === 'provider' && row.call === 2); return index >= 0 ? index : null;
            }, 'queued provider did not start');
            assert.ok(firstProviderIndex < backendIndex && backendIndex < secondProviderIndex,
                JSON.stringify(events.filter(row => ['provider', 'post-response-backend'].includes(row.event))));
            for (const [operationId, index] of [['operation-d3-causal-1', 1], ['operation-d3-causal-2', 1], ['operation-d3-causal-3', 2]]) {
                assert.equal((await finalResult(running.origin, headers, operationId, index)).kind, 'terminal-success');
            }
            const after = await readChat(running.origin, headers, 1);
            assert.ok(after.chat.message.length > committed.chat.message.length);
            const notices = await fetch(running.origin + '/api/bg-notifications/claim', { method: 'POST', headers,
                body: JSON.stringify({ consumerId: 'd3-causal-notices', messageVersion: 5 }) });
            assert.equal(notices.status, 200);
            const rows = (await notices.json()).notifications.map(row => row.event);
            assert.equal(rows.some(row => row.code === 'plugin_post_response_uncertain'), false, JSON.stringify(rows));
        });

    test('[new] restart sweep marks pending obligations uncertain and republishes a pending notice as duplicate',
        { timeout: 120_000 }, async t => {
            const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'pocketrisu-d3-'));
            t.after(() => fs.rmSync(runtime, { recursive: true, force: true }));
            await seedRuntime(runtime, databaseFixture(await defaultDatabase()));
            const operationId = 'operation-d3-restart';
            const createdAt = Date.now();
            const record = { version: 1, operationId, charId: 'synthetic-d3-character', chatId: 'synthetic-d3-chat-1',
                receiptId: 'receipt-d3-restart', storedRevision: 'revision-d3-restart', storageEpoch: 0, createdAt,
                entries: [{ index: 0, pluginName: 'synthetic-d3-post-response', pluginVersion: '3.0' }], state: 'pending' };
            writeSyncRecord(runtime, record);
            const firstEvents = [];
            const first = await launch(t, runtime, firstEvents);
            const firstHeaders = await credentials(first.origin, 'restart-one');
            const swept = await waitFor(() => {
                const value = readSyncRecord(runtime, operationId); return value?.state === 'uncertain' ? value : null;
            }, 'pending obligation was not swept');
            assert.deepEqual({ reason: swept.reason, notices: swept.notices }, { reason: 'restart', notices: { 0: 'published' } });
            assert.equal(swept.createdAt, createdAt);
            const firstClaim = await fetch(first.origin + '/api/bg-notifications/claim', { method: 'POST', headers: firstHeaders,
                body: JSON.stringify({ consumerId: 'd3-restart-first', messageVersion: 5 }) });
            const firstRows = (await firstClaim.json()).notifications.map(row => row.event);
            assert.equal(firstRows.filter(row => row.code === 'plugin_post_response_uncertain' && row.reason === 'restart'
                && row.createdAt === createdAt).length, 1, JSON.stringify(firstRows));
            await terminateChild(first.server);
            writeSyncRecord(runtime, { ...swept, notices: { 0: 'pending' } });
            const secondEvents = [];
            const second = await launch(t, runtime, secondEvents);
            await credentials(second.origin, 'restart-two');
            const republished = await waitFor(() => {
                const value = readSyncRecord(runtime, operationId); return value?.notices?.[0] === 'published' ? value : null;
            }, 'duplicate restart notice did not settle the pending marker');
            assert.equal(republished.reason, 'restart'); assert.equal(republished.createdAt, createdAt);
            assert.equal(secondEvents.some(row => row.event === 'provider' || row.event === 'post-response-backend'), false);
        });

    test('[new] enforces the fixed ten-second orchestrator window and aborts an in-flight HTTP request without retry',
        { timeout: 120_000 }, async t => {
            const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'pocketrisu-d3-'));
            t.after(() => fs.rmSync(runtime, { recursive: true, force: true }));
            await seedRuntime(runtime, databaseFixture(await defaultDatabase(), 'deadline'));
            const events = [];
            const running = await launch(t, runtime, events);
            const headers = await credentials(running.origin, 'deadline');
            await delay(500);
            await submit(running.origin, headers, 1, 'operation-d3-deadline', 'deadline');
            const result = await finalResult(running.origin, headers, 'operation-d3-deadline', 1);
            assert.equal(result.kind, 'terminal-success');
            assert.equal((await chatActivity(running.origin, headers, 1)).busy, true,
                'the committed result must be public while the post-response run is still busy');
            await waitFor(() => events.find(row => row.event === 'post-response-hang'), 'hanging post-response request did not start');
            assert.equal((await chatActivity(running.origin, headers, 1)).busy, true,
                'the activity route must stay busy while the hanging request holds the real window open');
            await waitFor(async () => (await chatActivity(running.origin, headers, 1)).busy === false,
                'activity stayed busy after the post-response window ended', 30_000);
            assert.equal(events.filter(row => row.event === 'post-response-hang').length, 1);
            assert.equal(events.filter(row => row.event === 'post-response-hang-aborted').length, 1);
            assert.equal(events.filter(row => row.event === 'provider').length, 1);
            const claimed = await fetch(running.origin + '/api/bg-notifications/claim', { method: 'POST', headers,
                body: JSON.stringify({ consumerId: 'd3-deadline-notices', messageVersion: 5 }) });
            assert.equal(claimed.status, 200);
            const rows = (await claimed.json()).notifications.map(row => row.event);
            assert.equal(rows.filter(row => row.code === 'plugin_post_response_uncertain' && row.phase === 'post_response'
                && row.reason === 'deadline' && row.effectsMayHaveOccurred === true).length, 1, JSON.stringify(rows));
        });
});
