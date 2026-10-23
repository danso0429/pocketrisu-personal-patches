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
assert.ok(fs.existsSync(path.join(target, 'package.json')), 'usage: node scripts/probe-bg-plugin-mcp.cjs <composed-tree>');
const Database = createRequire(path.join(target, 'package.json'))('better-sqlite3');
const preload = path.join(__dirname, 'probes/bg-plugin-mcp-preload.cjs');
const defaultDatabaseHelper = path.join(__dirname, 'probes/bg-d1a-default-database.cjs');
const password = createHash('sha256').update('synthetic-d2-mcp-password').digest('hex');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const waitForExit = async (child, timeoutMs = 2_000) => {
    if (child.exitCode !== null || child.signalCode !== null) return true;
    return new Promise(resolve => {
        const finish = value => { clearTimeout(timer); child.off('exit', onExit); resolve(value); };
        const onExit = () => finish(true);
        const timer = setTimeout(() => finish(false), timeoutMs);
        child.once('exit', onExit);
    });
};
const terminateChild = async child => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill('SIGTERM');
    if (await waitForExit(child)) return;
    child.kill('SIGKILL');
    await waitForExit(child);
};
const waitFor = async predicate => {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
        const value = await predicate();
        if (value) return value;
        await delay(100);
    }
    throw Error('Synthetic D2 MCP process deadline exceeded');
};

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

function databaseFixture(base) {
    const chats = [1, 2].map(index => ({ id: `synthetic-d2-chat-${index}`, name: `D2 ${index}`, message: [], fmIndex: -1,
        scriptstate: {}, isStreaming: false, note: '', localLore: [], modules: ['synthetic-d2-mcp-module'] }));
    const plugin = { name: 'synthetic-d2-mcp', version: '3.0', enabled: true, realArg: {}, script: `
        const token=String(Date.now())+'-'+String(Math.random());
        let enabled=false;
        await Risuai.registerMCP({identifier:'plugin:synthetic-d2',name:'Synthetic D2',version:'1.0',description:'D2 probe'},
            async()=>enabled?[{name:'dynamic_tool',description:'dynamic',inputSchema:{type:'object'}}]:[],
            async(name,args)=>[{type:'text',text:'tool-token:'+token+':'+String(args.value)}]);
        await Risuai.addRisuReplacer('beforeRequest',async messages=>{enabled=true;return messages;});` };
    return { ...structuredClone(base), apiType: 'openai', aiModel: 'gpt35', subModel: 'gpt35', openAIKey: 'synthetic',
        currentPluginProvider: '', customModels: [], dynamicModelRegistry: true, streaming: false, useStreaming: false,
        seperateModels: { memory: '', emotion: '', translate: '', otherAx: '' }, seperateModelsForAxModels: false,
        seperateParameters: { memory: {}, emotion: {}, translate: {}, otherAx: {}, overrides: {} }, seperateParametersEnabled: false,
        customAPIFormat: 0, customProxyRequestModel: '', forceReplaceUrl: '', proxyKey: '', mainPrompt: '', jailbreak: '', globalNote: '',
        personaPrompt: '', presetChain: '', moduleIntergration: '', username: 'Synthetic', requestRetrys: 1,
        fallbackModels: { model: [], memory: [], emotion: [], translate: [], otherAx: [] }, nodeOnlyModelModeLock: 'legacy',
        nodeOnlyServerSideRequests: false, enabledModules: ['synthetic-d2-mcp-module'],
        modules: [{ id: 'synthetic-d2-mcp-module', name: 'Synthetic MCP', mcp: { url: 'plugin:synthetic-d2' }, lorebook: [] }],
        personas: [], pluginCustomStorage: {}, templateDefaultVariables: '', globalChatVariables: {},
        statics: { messages: 0, imports: 0 }, temperature: 80, maxContext: 4000, maxResponse: 300,
        frequencyPenalty: 70, PresensePenalty: 70, bias: [], plugins: [plugin],
        promptSettings: { assistantPrefill: '', postEndInnerFormat: '', sendChatAsSystem: false, sendName: false,
            utilOverride: false, customChainOfThought: false, maxThoughtTagDepth: -1 },
        formatingOrder: ['main', 'description', 'personaPrompt', 'chats', 'lastChat', 'jailbreak', 'lorebook', 'globalNote', 'authorNote'],
        characters: [{ type: 'character', chaId: 'synthetic-d2-character', name: 'Synthetic', chats, chatPage: 0, reloadKeys: 0,
            lowLevelAccess: true, defaultVariables: '', customscript: [], lorebook: [], triggerscript: [], emotionImages: [], desc: '', notes: '',
            chatFolders: [], viewScreen: 'none', globalLore: [], sdData: [], utilityBot: false, bias: [], alternateGreetings: [], tags: [],
            creator: '', characterVersion: '', firstMsgIndex: -1, replaceGlobalNote: '', additionalText: '', personality: '', scenario: '',
            firstMessage: '', exampleMessage: '', creatorNotes: '', systemPrompt: '', postHistoryInstructions: '' }] };
}

function unsupportedFixture(base, mode) {
    const database = databaseFixture(base);
    database.characters[0].chats = [database.characters[0].chats[0]];
    database.characters[0].chatPage = 0;
    database.characters[0].chats[0].id = `synthetic-d2-${mode}-chat`;
    database.characters[0].chats[0].isStreaming = mode === 'anthropic-stream';
    database.subModel = 'gpt35';
    if (mode === 'responses') {
        database.aiModel = 'gpt35-response-api';
        database.customModels = [];
    } else {
        const id = `xcustom:::d2-${mode}`;
        database.aiModel = id;
        database.customModels = [{ id, name: mode, format: 2, flags: [], url: 'https://synthetic.invalid/d2-anthropic',
            key: 'synthetic', model: 'synthetic-model' }];
    }
    database.streaming = mode === 'anthropic-stream';
    database.useStreaming = mode === 'anthropic-stream';
    database.modelTools = [];
    return database;
}

async function seedRuntime(runtime, database) {
    fs.writeFileSync(path.join(runtime, 'package.json'), JSON.stringify({ name: 'pocketrisu', version: '1.10.0' }));
    fs.symlinkSync(path.join(target, 'dist'), path.join(runtime, 'dist'));
    const seed = fork(path.join(target, 'server/node/bgServerChatProcessClient.cjs'), [],
        { cwd: runtime, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    seed.send({ scope: 'pocketrisu-h1-client', command: 'seed', runtimeRoot: runtime, targetRoot: target, password,
        databaseBase64: Buffer.from(JSON.stringify(database)).toString('base64') });
    if (!await waitForExit(seed, 10_000)) {
        await terminateChild(seed);
        throw Error('seed helper deadline exceeded');
    }
    assert.equal(seed.exitCode, 0);
    const db = new Database(path.join(runtime, 'save/risuai.db'));
    const permission = JSON.stringify([database.plugins[0].name, 'replacer']);
    db.prepare('INSERT OR REPLACE INTO kv (key,value) VALUES (?,?)').run('cache/plugin-permissions/state.json',
        Buffer.from(JSON.stringify({ given: [permission], denied: [], cache: [[permission + '_lastGrantTime', Date.now()]] })));
    db.close();
}

async function launch(t, runtime, events) {
    const server = fork(path.join(target, 'server/node/server.cjs'), [], { cwd: runtime,
        execArgv: ['--require', preload], env: { ...process.env, PORT: '0', POCKETRISU_D2_MCP_PROBE: '1',
            POCKETRISU_BG_PLUGIN_HOST_CANDIDATE: '1', TUNNEL_DISABLED: '1', UPDATE_CHECK_DISABLED: '1' },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    const log = fs.createWriteStream(path.join(runtime, 'server.log'));
    server.stdout.pipe(log); server.stderr.pipe(log); server.on('message', message => events.push(message));
    t.after(async () => { await terminateChild(server); log.end(); });
    const ready = await waitFor(() => events.find(row => row.event === 'ready'));
    return { origin: `http://127.0.0.1:${ready.port}` };
}

async function credentials(origin) {
    const login = await fetch(origin + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
    assert.equal(login.status, 200); const { token } = await login.json();
    const stamp = JSON.parse(fs.readFileSync(path.join(target, 'dist/build-stamp.json'), 'utf8')).stamp;
    const session = await fetch(origin + '/api/session', { method: 'POST', headers: { 'risu-auth': token, 'x-session-id': 'd2-mcp-session' } });
    assert.equal(session.status, 200);
    return { 'content-type': 'application/json', 'risu-auth': token,
        cookie: session.headers.get('set-cookie').split(';')[0], 'x-client-build': stamp };
}

async function readChat(origin, headers, index) {
    const response = await fetch(`${origin}/api/chat-content/synthetic-d2-character/${index}`,
        { headers: { ...headers, 'x-chat-id': `synthetic-d2-chat-${index + 1}` } });
    assert.equal(response.status, 200);
    const { decodeRisuSave } = require(path.join(target, 'server/node/utils.cjs'));
    return { chat: await decodeRisuSave(new Uint8Array(await response.arrayBuffer())), revision: response.headers.get('x-chat-revision') };
}

async function pollFinalResult(url, headers) {
    const deadline = Date.now() + 60_000;
    let final = null;
    let lastPoll = { status: null, body: '' };
    while (Date.now() < deadline) {
        const polled = await fetch(url, { headers });
        const body = await polled.text();
        lastPoll = { status: polled.status, body };
        if (polled.ok) {
            try {
                const value = JSON.parse(body);
                if (value.final) { final = value; break; }
            } catch {}
        }
        await delay(100);
    }
    assert.ok(final, 'job must reach a final result; last poll: ' + JSON.stringify(lastPoll));
    return final;
}

async function runJob(origin, headers, index) {
    const before = await readChat(origin, headers, index);
    const operationId = `d2-mcp-operation-${index + 1}`;
    const body = { detached: true, selectedCharId: 'synthetic-d2-character', selectedChatId: `synthetic-d2-chat-${index + 1}`,
        currentChat: before.chat, operationId, baseChatRevision: before.revision, resultKeyVersion: 1, resultOrderVersion: 1,
        startAckVersion: 1, serverChatCommitVersion: 1, inputCommandVersion: 1,
        inputCommand: { inputCommandId: operationId + '-input', userMessageId: operationId + '-user', rawText: `d2 request ${index + 1}`,
            settingsSnapshotRef: 'synthetic-ref', submittedAt: Date.now() } };
    const response = await fetch(origin + '/api/bg-orchestrate', { method: 'POST', headers, body: JSON.stringify(body) });
    assert.equal(response.status, 200, await response.clone().text());
    return pollFinalResult(
        `${origin}/api/bg-orchestrate-result/${operationId}?charId=synthetic-d2-character&chatId=synthetic-d2-chat-${index + 1}&consumerId=d2-consumer-${index + 1}`,
        headers,
    );
}

async function runUnsupportedJob(origin, headers, mode) {
    const response = await fetch(`${origin}/api/chat-content/synthetic-d2-character/0`,
        { headers: { ...headers, 'x-chat-id': `synthetic-d2-${mode}-chat` } });
    assert.equal(response.status, 200);
    const { decodeRisuSave } = require(path.join(target, 'server/node/utils.cjs'));
    const chat = await decodeRisuSave(new Uint8Array(await response.arrayBuffer()));
    const operationId = `d2-${mode}-operation`;
    const submitted = await fetch(origin + '/api/bg-orchestrate', { method: 'POST', headers, body: JSON.stringify({
        detached: true, selectedCharId: 'synthetic-d2-character', selectedChatId: `synthetic-d2-${mode}-chat`, currentChat: chat,
        operationId, baseChatRevision: response.headers.get('x-chat-revision'), resultKeyVersion: 1, resultOrderVersion: 1,
        startAckVersion: 1, serverChatCommitVersion: 1, inputCommandVersion: 1,
        inputCommand: { inputCommandId: operationId + '-input', userMessageId: operationId + '-user', rawText: mode,
            settingsSnapshotRef: 'synthetic-ref', submittedAt: Date.now() },
    }) });
    assert.equal(submitted.status, 200, await submitted.clone().text());
    return pollFinalResult(
        `${origin}/api/bg-orchestrate-result/${operationId}?charId=synthetic-d2-character&chatId=synthetic-d2-${mode}-chat&consumerId=d2-${mode}-consumer`,
        headers,
    );
}

describe('[D2-2] BG request tool discovery and provider guards', { concurrency: false }, () => {
    test('[new] first send sees the post-beforeRequest tool and consecutive jobs use fresh callbacks with complete cleanup',
        { timeout: 120_000 }, async t => {
        const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'pocketrisu-d2-mcp-'));
        t.after(() => fs.rmSync(runtime, { recursive: true, force: true }));
        const events = [];
        await seedRuntime(runtime, databaseFixture(await defaultDatabase()));
        const running = await launch(t, runtime, events);
        const headers = await credentials(running.origin);
        await delay(500);
        for (let index = 0; index < 2; index++) {
            const start = events.filter(row => row.event === 'provider').length;
            const result = await runJob(running.origin, headers, index);
            assert.equal(result.kind, 'terminal-success');
            const provider = events.filter(row => row.event === 'provider').slice(start);
            assert.ok(provider[0].tools?.some(tool => tool.function?.name === 'dynamic_tool'), JSON.stringify(provider[0]));
            assert.equal(provider.length, 2, JSON.stringify(provider));
            assert.match(provider[1].toolResult, /^tool-token:.+:22$/);
        }
        const results = events.filter(row => row.event === 'provider' && row.toolResult).map(row => row.toolResult);
        assert.equal(results.length, 2);
        assert.notEqual(results[0], results[1], 'job two must not call job one callback');
        const notice = await fetch(running.origin + '/api/bg-notifications/claim', { method: 'POST', headers,
            body: JSON.stringify({ consumerId: 'd2-mcp-notices', messageVersion: 4 }) });
        assert.equal(notice.status, 200);
        const notices = (await notice.json()).notifications.map(row => row.event);
        assert.equal(notices.some(row => row.pluginName === 'synthetic-d2-mcp'
            && ['plugin_hook_failed', 'plugin_host_limit', 'plugin_api_unsupported'].includes(row.code)), false, JSON.stringify(notices));
    });

    for (const mode of ['responses', 'anthropic-stream']) test(
        `[new] ${mode} strips plugin MCP tools, completes generation, and records one fixed unsupported notice`,
        { timeout: 120_000 }, async t => {
            const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'pocketrisu-d2-mcp-'));
            t.after(() => fs.rmSync(runtime, { recursive: true, force: true }));
            const events = [];
            await seedRuntime(runtime, unsupportedFixture(await defaultDatabase(), mode));
            const running = await launch(t, runtime, events);
            const headers = await credentials(running.origin);
            await delay(500);
            const result = await runUnsupportedJob(running.origin, headers, mode);
            assert.equal(result.kind, 'terminal-success');
            const sent = events.filter(row => row.event === 'unsupported-provider' && row.kind === mode).at(-1);
            assert.ok(sent, JSON.stringify(events));
            const tools = Array.isArray(sent.body.tools) ? sent.body.tools : [];
            assert.equal(tools.some(tool => JSON.stringify(tool).includes('dynamic_tool')), false, JSON.stringify(sent.body));
            const notice = await fetch(running.origin + '/api/bg-notifications/claim', { method: 'POST', headers,
                body: JSON.stringify({ consumerId: `d2-${mode}-notices`, messageVersion: 4 }) });
            assert.equal(notice.status, 200);
            const notices = (await notice.json()).notifications.map(row => row.event)
                .filter(row => row.pluginName === 'synthetic-d2-mcp' && row.code === 'plugin_mcp_unsupported');
            assert.equal(notices.length, 1, JSON.stringify(notices));
            assert.equal(notices[0].phase, 'mcp_list');
        });
});
