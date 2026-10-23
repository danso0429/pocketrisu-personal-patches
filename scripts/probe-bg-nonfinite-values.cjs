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
assert.ok(fs.existsSync(path.join(target, 'package.json')), 'usage: node scripts/probe-bg-nonfinite-values.cjs <composed-tree>');
const Database = createRequire(path.join(target, 'package.json'))('better-sqlite3');
const preload = path.join(__dirname, 'probes/bg-nonfinite-values-preload.cjs');
const defaultDatabaseHelper = path.join(__dirname, 'probes/bg-d1a-default-database.cjs');
const password = createHash('sha256').update('synthetic-nf-password').digest('hex');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const waitFor = async predicate => {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
        const value = await predicate();
        if (value) return value;
        await delay(100);
    }
    throw Error('Synthetic NF process deadline exceeded');
};

async function defaultDatabase() {
    const helper = fork(defaultDatabaseHelper, [target], { cwd: target, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    const value = await Promise.race([
        once(helper, 'message').then(([message]) => message),
        once(helper, 'exit').then(([code]) => { throw Error('default database helper exited ' + code); }),
    ]);
    if (helper.exitCode === null && helper.signalCode === null) { helper.disconnect(); await once(helper, 'exit'); }
    return value;
}

function databaseFixture(base, mode = 'causal') {
    const suffix = mode === 'causal' ? 'causal' : 'timeout';
    const preset = { id: 'synthetic-preset', name: 'Synthetic', createdAt: 100, updatedAt: 100, useStreaming: false,
        profileSnapshot: { profileId: 'synthetic:standard', profileVersion: 1, providerBaseId: 'synthetic',
            providerBaseVersion: 1, adapterKind: 'openai-compatible', auth: { kind: 'bearer', fields: ['apiKey'] },
            endpoint: { kind: 'static', url: 'https://api.openai.com/v1/chat/completions' }, modelId: 'synthetic-model',
            schema: [{ key: 'apiKey', type: 'string', label: 'Key', secret: true, mapsTo: { target: 'auth', path: 'apiKey' } },
                { key: 'modelId', type: 'string', label: 'Model', default: 'synthetic-model', mapsTo: { target: 'body', path: 'model' } }],
            uiSchema: { groups: [], fields: [] }, defaults: { max_tokens: 128 },
            headerTemplate: { 'Content-Type': 'application/json' }, capabilities: ['streaming'] },
        userValues: { apiKey: 'synthetic-key' } };
    const chat = { id: `synthetic-nf-${suffix}-chat`, name: `NF ${suffix}`, message: [], fmIndex: -1, scriptstate: {}, useModelPreset: false,
        modelBinding: { main: preset.id, sub: preset.id, separateAux: false, aux: { memory: '', emotion: '', translate: '', otherAx: '' } },
        isStreaming: false, note: '', localLore: [] };
    const causalScript = `
        await Risuai.addRisuReplacer('beforeRequest',async (messages,mode)=>{
            if(mode!=='emotion')return messages;
            const character=await Risuai.getCharacter();
            const observedNaN=Object.is(character.reloadKeys,NaN);
            await Risuai.log(JSON.stringify({observedNaN}));
            return messages;
        });`;
    const timeoutScript = `
        await Risuai.addRisuReplacer('beforeRequest',async (messages,mode)=>{
            if(mode==='emotion')return messages;
            const results={nativeFetch:{},risuFetch:{}};
            for(const [name,requestTimeoutMs] of [['infinity',Infinity],['nan',NaN],['negativeInfinity',-Infinity],['negativeZero',-0]]){
                const url='https://synthetic.invalid/nf-timeout/'+name;
                try{await Risuai.nativeFetch(url,{method:'GET',requestTimeoutMs});results.nativeFetch[name]='resolved';}
                catch{results.nativeFetch[name]='rejected';}
                const risu=await Risuai.risuFetch(url,{method:'GET',headers:{},requestTimeoutMs});
                results.risuFetch[name]={status:risu.status,aborted:/abort/i.test(String(risu.data))};
            }
            await Risuai.log(JSON.stringify({timeoutResults:results}));return messages;
        });`;
    const plugin = { name: `synthetic-nf-${suffix}`, version: '3.0', enabled: true, realArg: {},
        script: mode === 'causal' ? causalScript : timeoutScript };
    return { ...structuredClone(base), apiType: 'gemini-3-flash-preview', aiModel: 'gpt35', subModel: 'gpt35', openAIKey: 'synthetic',
        currentPluginProvider: '', customModels: [], dynamicModelRegistry: true, streaming: false, useStreaming: false,
        modelProfileRegistryCache: { schemaVersion: 4, registries: {} }, modelProfileRegistryLastFetched: 0,
        modelProfileVisibilityLevel: 'currentOnly', seperateModels: { memory: '', emotion: '', translate: '', otherAx: '' },
        seperateModelsForAxModels: false, seperateParameters: { memory: {}, emotion: {}, translate: {}, otherAx: {}, overrides: {} },
        seperateParametersEnabled: false, customAPIFormat: 0, customProxyRequestModel: '', forceReplaceUrl: '', proxyKey: '', mainPrompt: '',
        jailbreak: '', globalNote: '', personaPrompt: '', presetChain: '', moduleIntergration: '', username: 'Synthetic',
        promptSettings: { assistantPrefill: '', postEndInnerFormat: '', sendChatAsSystem: false, sendName: false,
            utilOverride: false, customChainOfThought: false, maxThoughtTagDepth: -1 },
        formatingOrder: ['main', 'description', 'personaPrompt', 'chats', 'lastChat', 'jailbreak', 'lorebook', 'globalNote', 'authorNote'],
        temperature: 80, maxContext: 4000, maxResponse: 300, frequencyPenalty: 70, PresensePenalty: 70, bias: [],
        nodeOnlyModelModeLock: 'legacy', nodeOnlyServerSideRequests: false, requestRetrys: 2,
        fallbackModels: { model: [], memory: [], emotion: [], translate: [], otherAx: [] }, enabledModules: [], modules: [], personas: [],
        modelPresets: [preset], templateDefaultVariables: '', globalChatVariables: {}, statics: { messages: 0, imports: 0 },
        pluginCustomStorage: {}, igpPrompt: mode === 'causal' ? '<|im_start|>system<|im_sep|>classify nf-causal<|im_end|>' : '',
        characters: [{ type: 'character', chaId: `synthetic-nf-${suffix}-character`, name: 'Synthetic', chats: [chat], chatPage: 0,
            ...(mode === 'timeout' ? { reloadKeys: 0 } : {}),
            lowLevelAccess: true, defaultVariables: '', customscript: [], lorebook: [], triggerscript: [], emotionImages: [], desc: '', notes: '',
            chatFolders: [], viewScreen: 'none', globalLore: [], sdData: [], utilityBot: false, bias: [], alternateGreetings: [], tags: [],
            creator: '', characterVersion: '', firstMsgIndex: -1, replaceGlobalNote: '', additionalText: '', personality: '', scenario: '',
            firstMessage: '', exampleMessage: '', creatorNotes: '', systemPrompt: '', postHistoryInstructions: '' }],
        plugins: [plugin] };
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
    const permission = JSON.stringify([database.plugins[0].name, 'replacer']);
    db.prepare('INSERT OR REPLACE INTO kv (key,value) VALUES (?,?)').run('cache/plugin-permissions/state.json',
        Buffer.from(JSON.stringify({ given: [permission], denied: [], cache: [[permission + '_lastGrantTime', Date.now()]] })));
    db.close();
}

async function launch(t, runtime, events) {
    const server = fork(path.join(target, 'server/node/server.cjs'), [], { cwd: runtime,
        execArgv: ['--require', preload], env: { ...process.env, PORT: '0', POCKETRISU_NF_PROBE: '1',
            POCKETRISU_BG_PLUGIN_HOST_CANDIDATE: '1', TUNNEL_DISABLED: '1', UPDATE_CHECK_DISABLED: '1' },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    const log = fs.createWriteStream(path.join(runtime, 'server.log'));
    server.stdout.pipe(log); server.stderr.pipe(log);
    server.on('message', message => events.push(message));
    t.after(async () => { if (server.exitCode === null && server.signalCode === null) { server.kill('SIGTERM'); await once(server, 'exit'); } });
    const ready = await waitFor(() => events.find(row => row.event === 'ready'));
    return { server, origin: `http://127.0.0.1:${ready.port}` };
}

async function credentials(origin) {
    const login = await fetch(origin + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
    assert.equal(login.status, 200); const { token } = await login.json();
    const stamp = JSON.parse(fs.readFileSync(path.join(target, 'dist/build-stamp.json'), 'utf8')).stamp;
    const session = await fetch(origin + '/api/session', { method: 'POST', headers: { 'risu-auth': token, 'x-session-id': 'nf-causal-session' } });
    assert.equal(session.status, 200);
    return { 'content-type': 'application/json', 'risu-auth': token,
        cookie: session.headers.get('set-cookie').split(';')[0], 'x-client-build': stamp };
}

async function readChat(origin, headers, suffix = 'causal') {
    const response = await fetch(`${origin}/api/chat-content/synthetic-nf-${suffix}-character/0`,
        { headers: { ...headers, 'x-chat-id': `synthetic-nf-${suffix}-chat` } });
    assert.equal(response.status, 200);
    const { decodeRisuSave } = require(path.join(target, 'server/node/utils.cjs'));
    return { chat: await decodeRisuSave(new Uint8Array(await response.arrayBuffer())), revision: response.headers.get('x-chat-revision') };
}

describe('[NF-1] BG plugin RPC carries non-finite numbers', { concurrency: false }, () => {
    test('[new] post-reply auxiliary beforeRequest receives missing reloadKeys as NaN without failing generation',
        { timeout: 120_000 }, async t => {
        const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'pocketrisu-nf-'));
        t.after(() => fs.rmSync(runtime, { recursive: true, force: true }));
        const database = databaseFixture(await defaultDatabase());
        assert.equal(Object.hasOwn(database.characters[0], 'reloadKeys'), false);
        const events = [];
        await seedRuntime(runtime, database);
        const running = await launch(t, runtime, events);
        const headers = await credentials(running.origin);
        await delay(500); // Let plugin load (or its bounded omission) settle before taking the submitted revision.
        const before = await readChat(running.origin, headers);
        const operationId = 'nf-causal-operation';
        const body = { detached: true, selectedCharId: 'synthetic-nf-causal-character', selectedChatId: 'synthetic-nf-causal-chat',
            currentChat: before.chat, operationId, baseChatRevision: before.revision, resultKeyVersion: 1, resultOrderVersion: 1,
            startAckVersion: 1, serverChatCommitVersion: 1, inputCommandVersion: 1,
            inputCommand: { inputCommandId: operationId + '-input', userMessageId: operationId + '-user', rawText: 'nf-causal',
                settingsSnapshotRef: 'synthetic-ref', submittedAt: Date.now() } };
        const response = await fetch(running.origin + '/api/bg-orchestrate', { method: 'POST', headers, body: JSON.stringify(body) });
        assert.equal(response.status, 200, await response.clone().text());
        const result = await waitFor(async () => {
            const polled = await fetch(`${running.origin}/api/bg-orchestrate-result/${operationId}?charId=synthetic-nf-causal-character&chatId=synthetic-nf-causal-chat&consumerId=nf-causal-consumer`, { headers });
            if (!polled.ok) return null; const value = await polled.json(); return value.final ? value : null;
        });
        assert.equal(result.kind, 'terminal-success');
        const after = await readChat(running.origin, headers);
        const answers = after.chat.message.filter(row => row.role === 'char').map(row => row.data);
        assert.equal(answers.length, 1); assert.ok(answers[0].startsWith('synthetic-answer'));
        const notice = await fetch(running.origin + '/api/bg-notifications/claim', { method: 'POST', headers,
            body: JSON.stringify({ consumerId: 'nf-causal-notice-consumer', messageVersion: 3 }) });
        assert.equal(notice.status, 200);
        const notices = (await notice.json()).notifications.map(row => row.event).filter(row => row.chatId === 'synthetic-nf-causal-chat');
        const expectedMessage = JSON.stringify({ observedNaN: true });
        assert.equal(notices.filter(row => row.pluginName === 'synthetic-nf-causal' && row.code === 'plugin_message'
            && row.message === expectedMessage).length, 1, JSON.stringify(notices));
        assert.equal(notices.some(row => row.pluginName === 'synthetic-nf-causal' && row.code !== 'plugin_message'), false);
        assert.equal(notices.some(row => row.code === 'operation_failed' && row.reason === 'generation_failed'), false);
    });

    test('[new] nativeFetch and risuFetch keep the existing non-finite requestTimeoutMs behavior',
        { timeout: 120_000 }, async t => {
        const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'pocketrisu-nf-'));
        t.after(() => fs.rmSync(runtime, { recursive: true, force: true }));
        const database = databaseFixture(await defaultDatabase(), 'timeout');
        const events = [];
        await seedRuntime(runtime, database);
        const running = await launch(t, runtime, events);
        const headers = await credentials(running.origin);
        await delay(500); // Keep the submitted base independent of asynchronous plugin-load settlement.
        const before = await readChat(running.origin, headers, 'timeout');
        const operationId = 'nf-timeout-operation';
        const body = { detached: true, selectedCharId: 'synthetic-nf-timeout-character', selectedChatId: 'synthetic-nf-timeout-chat',
            currentChat: before.chat, operationId, baseChatRevision: before.revision, resultKeyVersion: 1, resultOrderVersion: 1,
            startAckVersion: 1, serverChatCommitVersion: 1, inputCommandVersion: 1,
            inputCommand: { inputCommandId: operationId + '-input', userMessageId: operationId + '-user', rawText: 'nf-timeout',
                settingsSnapshotRef: 'synthetic-ref', submittedAt: Date.now() } };
        const response = await fetch(running.origin + '/api/bg-orchestrate', { method: 'POST', headers, body: JSON.stringify(body) });
        assert.equal(response.status, 200, await response.clone().text());
        const result = await waitFor(async () => {
            const polled = await fetch(`${running.origin}/api/bg-orchestrate-result/${operationId}?charId=synthetic-nf-timeout-character&chatId=synthetic-nf-timeout-chat&consumerId=nf-timeout-consumer`, { headers });
            if (!polled.ok) return null; const value = await polled.json(); return value.final ? value : null;
        });
        assert.equal(result.kind, 'terminal-success');
        const notice = await fetch(running.origin + '/api/bg-notifications/claim', { method: 'POST', headers,
            body: JSON.stringify({ consumerId: 'nf-timeout-notice-consumer', messageVersion: 3 }) });
        assert.equal(notice.status, 200);
        const notices = (await notice.json()).notifications.map(row => row.event).filter(row => row.chatId === 'synthetic-nf-timeout-chat');
        const expectedMessage = JSON.stringify({ timeoutResults: {
            nativeFetch: { infinity: 'rejected', nan: 'resolved', negativeInfinity: 'resolved', negativeZero: 'resolved' },
            risuFetch: {
                infinity: { status: 400, aborted: true },
                nan: { status: 200, aborted: false },
                negativeInfinity: { status: 200, aborted: false },
                negativeZero: { status: 200, aborted: false },
            },
        } });
        assert.equal(notices.filter(row => row.pluginName === 'synthetic-nf-timeout'
            && row.code === 'plugin_message' && row.message === expectedMessage).length, 1, JSON.stringify(notices));
        assert.equal(notices.some(row => row.pluginName === 'synthetic-nf-timeout' && row.code !== 'plugin_message'), false);
    });
});
