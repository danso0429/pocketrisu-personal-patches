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
assert.ok(fs.existsSync(path.join(target, 'package.json')), 'usage: node scripts/probe-bg-d1a-before-request.cjs <composed-tree>');
const Database = createRequire(path.join(target, 'package.json'))('better-sqlite3');
const preload = path.join(__dirname, 'probes/bg-d1a-before-request-preload.cjs');
const password = createHash('sha256').update('synthetic-d1a-password').digest('hex');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const waitFor = async predicate => {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
        const value = await predicate();
        if (value) return value;
        await delay(100);
    }
    throw Error('Synthetic D1a process deadline exceeded');
};

async function defaultDatabase() {
    const helper = fork(path.join(__dirname, 'probes/bg-d1a-default-database.cjs'), [target],
        { cwd: target, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    const value = await Promise.race([
        once(helper, 'message').then(([message]) => message),
        once(helper, 'exit').then(([code]) => { throw Error('default database helper exited ' + code); }),
    ]);
    if (helper.exitCode === null && helper.signalCode === null) { helper.disconnect(); await once(helper, 'exit'); }
    return value;
}

function databaseFixture(base, startPath) {
    const markers = ['d1a-first', 'd1a-effect', 'd1a-retry', 'd1a-input', 'd1a-aux'];
    const preset = { id: 'synthetic-preset', name: 'Synthetic', createdAt: 100, updatedAt: 100, useStreaming: false,
        profileSnapshot: { profileId: 'synthetic:standard', profileVersion: 1, providerBaseId: 'synthetic',
            providerBaseVersion: 1, adapterKind: 'openai-compatible', auth: { kind: 'bearer', fields: ['apiKey'] },
            endpoint: { kind: 'static', url: 'https://api.openai.com/v1/chat/completions' }, modelId: 'synthetic-model',
            schema: [{ key: 'apiKey', type: 'string', label: 'Key', secret: true, mapsTo: { target: 'auth', path: 'apiKey' } },
                { key: 'modelId', type: 'string', label: 'Model', default: 'synthetic-model', mapsTo: { target: 'body', path: 'model' } }],
            uiSchema: { groups: [], fields: [] }, defaults: { max_tokens: 128 },
            headerTemplate: { 'Content-Type': 'application/json' }, capabilities: ['streaming'] },
        userValues: { apiKey: 'synthetic-key' } };
    const chats = markers.map((marker, index) => ({ id: `synthetic-${startPath}-${marker}`, name: marker,
        message: startPath === 'legacy' ? [{ role: 'user', data: marker, chatId: `existing-${index}` }] : [],
        scriptstate: {}, useModelPreset: false, modelBinding: { main: preset.id, sub: preset.id, separateAux: false,
            aux: { memory: '', emotion: '', translate: '', otherAx: '' } }, isStreaming: false, note: '', localLore: [] }));
    const plugins = markers.map(marker => {
        const storageKey = `calls-${startPath}-${marker}`;
        const input = marker === 'd1a-input'
            ? `await Risuai.addRisuScriptHandler('input',async text=>{if(text.includes('${marker}'))throw Error('synthetic input failure');return text;});`
            : '';
        const action = marker === 'd1a-first'
            ? `if(mode!=='emotion')throw Error('synthetic first failure');`
            : marker === 'd1a-effect'
                ? `if(mode!=='emotion'){await Risuai.pluginStorage.setItem('${marker}',true);throw Error('synthetic effect failure');}`
                : marker === 'd1a-input'
                    ? `if(mode!=='emotion')throw Error('legacy input failure sentinel');`
                    : marker === 'd1a-retry'
                        ? `if(mode!=='emotion'){
                            const calls=await Risuai.pluginStorage.getItem('${storageKey}')||0;
                            await Risuai.pluginStorage.setItem('${storageKey}',calls+1);
                            if(calls>0)throw Error('synthetic retry failure');
                        }`
                        : `if(mode==='emotion')throw Error('synthetic auxiliary failure');`;
        return { name: `synthetic-${marker}`, version: '3.0', enabled: true, realArg: {}, script: `
            ${input}
            await Risuai.addRisuReplacer('beforeRequest',async (messages,mode)=>{
                const character=await Risuai.getCharacter();
                const chatId=character.chats[character.chatPage].id;
                if(!chatId.includes('${marker}'))return messages;
                ${action}
                return messages;
            });` };
    });
    return { ...structuredClone(base),
        apiType: 'gemini-3-flash-preview', aiModel: 'gpt35', subModel: 'gpt35', openAIKey: 'synthetic',
        currentPluginProvider: '', customModels: [], dynamicModelRegistry: true, streaming: false, useStreaming: false,
        modelProfileRegistryCache: { schemaVersion: 4, registries: {} }, modelProfileRegistryLastFetched: 0,
        modelProfileVisibilityLevel: 'currentOnly', seperateModels: { memory: '', emotion: '', translate: '', otherAx: '' },
        seperateModelsForAxModels: false, seperateParameters: { memory: {}, emotion: {}, translate: {}, otherAx: {}, overrides: {} },
        seperateParametersEnabled: false, customAPIFormat: 0, customProxyRequestModel: '', forceReplaceUrl: '', proxyKey: '',
        mainPrompt: '', jailbreak: '', globalNote: '', personaPrompt: '', presetChain: '', moduleIntergration: '',
        username: 'Synthetic', promptSettings: { assistantPrefill: '', postEndInnerFormat: '', sendChatAsSystem: false,
            sendName: false, utilOverride: false, customChainOfThought: false, maxThoughtTagDepth: -1 },
        formatingOrder: ['main', 'description', 'personaPrompt', 'chats', 'lastChat', 'jailbreak', 'lorebook', 'globalNote', 'authorNote'],
        temperature: 80, maxContext: 4000, maxResponse: 300, frequencyPenalty: 70, PresensePenalty: 70, bias: [],
        nodeOnlyModelModeLock: 'legacy', nodeOnlyServerSideRequests: false, requestRetrys: 2,
        fallbackModels: { model: [], memory: [], emotion: [], translate: [], otherAx: [] },
        enabledModules: [], modules: [], personas: [], modelPresets: [preset], templateDefaultVariables: '',
        globalChatVariables: {}, statics: { messages: 0, imports: 0 }, pluginCustomStorage: {},
        igpPrompt: '<|im_start|>system<|im_sep|>classify d1a-aux<|im_end|>',
        characters: [{ type: 'character', chaId: `synthetic-${startPath}-character`, name: 'Synthetic', chats, chatPage: 0, reloadKeys: 0,
            lowLevelAccess: true, defaultVariables: '', customscript: [], lorebook: [], triggerscript: [], emotionImages: [],
            desc: '', notes: '', chatFolders: [], viewScreen: 'none', globalLore: [], sdData: [], utilityBot: false,
            bias: [], alternateGreetings: [], tags: [], creator: '', characterVersion: '', firstMsgIndex: -1,
            replaceGlobalNote: '', additionalText: '', personality: '', scenario: '', firstMessage: '', exampleMessage: '',
            creatorNotes: '', systemPrompt: '', postHistoryInstructions: '' }],
        plugins,
    };
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
    const permissions = database.plugins.map(plugin => JSON.stringify([plugin.name, 'replacer']));
    db.prepare('INSERT OR REPLACE INTO kv (key,value) VALUES (?,?)').run('cache/plugin-permissions/state.json',
        Buffer.from(JSON.stringify({ given: permissions, denied: [], cache: permissions.map(key => [key + '_lastGrantTime', Date.now()]) })));
    db.close();
}

async function launch(t, runtime, events, launchIndex, retryProbe = true) {
    const server = fork(path.join(target, 'server/node/server.cjs'), [], { cwd: runtime,
        execArgv: ['--require', preload], env: { ...process.env, PORT: '0', POCKETRISU_D1A_PROBE: '1',
            POCKETRISU_D1A_RETRY: retryProbe ? '1' : '0',
            POCKETRISU_BG_PLUGIN_HOST_CANDIDATE: '1', TUNNEL_DISABLED: '1', UPDATE_CHECK_DISABLED: '1' },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    const log = fs.createWriteStream(path.join(runtime, `server-${launchIndex}.log`));
    server.stdout.pipe(log); server.stderr.pipe(log);
    server.on('message', message => events.push({ ...message, launchIndex }));
    t.after(async () => {
        if (server.exitCode === null && server.signalCode === null) { server.kill('SIGTERM'); await once(server, 'exit'); }
    });
    const ready = await waitFor(() => events.find(row => row.event === 'ready' && row.launchIndex === launchIndex));
    return { server, origin: `http://127.0.0.1:${ready.port}` };
}

async function credentials(origin, sessionId) {
    const login = await fetch(origin + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }) });
    assert.equal(login.status, 200);
    const { token } = await login.json();
    const stamp = JSON.parse(fs.readFileSync(path.join(target, 'dist/build-stamp.json'), 'utf8')).stamp;
    const session = await fetch(origin + '/api/session', { method: 'POST',
        headers: { 'risu-auth': token, 'x-session-id': sessionId } });
    assert.equal(session.status, 200);
    return { 'content-type': 'application/json', 'risu-auth': token,
        cookie: session.headers.get('set-cookie').split(';')[0], 'x-client-build': stamp };
}

async function readChat(origin, headers, startPath, index, chatId) {
    const response = await fetch(`${origin}/api/chat-content/synthetic-${startPath}-character/${index}`,
        { headers: { ...headers, 'x-chat-id': chatId } });
    assert.equal(response.status, 200);
    const { decodeRisuSave } = require(path.join(target, 'server/node/utils.cjs'));
    return { chat: await decodeRisuSave(new Uint8Array(await response.arrayBuffer())),
        revision: response.headers.get('x-chat-revision') };
}

async function startCase(origin, headers, startPath, marker, index) {
    const chatId = `synthetic-${startPath}-${marker}`;
    const before = await readChat(origin, headers, startPath, index, chatId);
    const operationId = `${startPath}-${marker}-operation`;
    const inputCommandVersion = startPath === 'server-input' ? 1 : 0;
    const body = { detached: true, selectedCharId: `synthetic-${startPath}-character`, selectedChatId: chatId,
        currentChat: before.chat, operationId, baseChatRevision: before.revision,
        resultKeyVersion: 1, resultOrderVersion: 1, startAckVersion: 1, serverChatCommitVersion: 1, inputCommandVersion };
    if (inputCommandVersion === 1) body.inputCommand = { inputCommandId: `${operationId}-input`,
        userMessageId: `${operationId}-user`, rawText: marker, settingsSnapshotRef: 'synthetic-ref', submittedAt: Date.now() };
    const response = await fetch(origin + '/api/bg-orchestrate', { method: 'POST', headers, body: JSON.stringify(body) });
    assert.equal(response.status, 200, await response.clone().text());
    const consumerId = `${operationId}-consumer`;
    const result = await waitFor(async () => {
        const polled = await fetch(`${origin}/api/bg-orchestrate-result/${operationId}?charId=synthetic-${startPath}-character&chatId=${chatId}&consumerId=${consumerId}`, { headers });
        if (!polled.ok) return null;
        const value = await polled.json();
        return value.final ? value : null;
    });
    return { body, chatId, operationId, consumerId, result,
        chat: (await readChat(origin, headers, startPath, index, chatId)).chat };
}

describe('[D1a-1] BG beforeRequest failure fails the request', () => {
    for (const startPath of ['server-input', 'legacy']) test(`${startPath} failures settle terminally and never replay`,
        { timeout: 120_000 }, async t => {
        const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'pocketrisu-d1a-'));
        const events = [];
        await seedRuntime(runtime, databaseFixture(await defaultDatabase(), startPath));
        let running = await launch(t, runtime, events, 1);
        let headers = await credentials(running.origin, `d1a-${startPath}-session-1`);
        const expectedProviders = { 'd1a-first': 0, 'd1a-effect': 0, 'd1a-retry': 1, 'd1a-input': 0 };
        const completed = [];
        for (const [index, marker] of ['d1a-first', 'd1a-effect', 'd1a-retry', 'd1a-input'].entries()) {
            await t.test(marker, async () => {
                const providersBefore = events.filter(row => row.event === 'provider').length;
                const value = await startCase(running.origin, headers, startPath, marker, index);
                completed.push(value);
                assert.equal(events.filter(row => row.event === 'provider').length - providersBefore,
                    expectedProviders[marker], marker);
                assert.equal(value.result.kind, 'terminal-error', marker);
                assert.equal(value.chat.message.filter(row => row.role === 'user').length, 1, marker);
                assert.equal(value.chat.message.filter(row => row.role === 'char').length, 0, marker);
                if (startPath === 'server-input') {
                    const db = new Database(path.join(runtime, 'save/risuai.db'), { readonly: true });
                    const key = 'internal/server-chat-input/v1/' + Buffer.from(value.operationId).toString('base64url');
                    const receipt = JSON.parse(String(db.prepare('SELECT value FROM kv WHERE key=?').get(key).value));
                    db.close();
                    assert.equal(receipt.inputState, 'failed', marker);
                }
            });
        }
        await t.test('generation and plugin notices', async () => {
            const noticesResponse = await fetch(running.origin + '/api/bg-notifications/claim', { method: 'POST', headers,
                body: JSON.stringify({ consumerId: `${startPath}-notice-consumer`, messageVersion: 3 }) });
            assert.equal(noticesResponse.status, 200);
            const notices = (await noticesResponse.json()).notifications.map(row => row.event);
            for (const marker of Object.keys(expectedProviders)) {
                assert.equal(notices.filter(row => row.code === 'operation_failed' && row.reason === 'generation_failed'
                    && row.chatId === `synthetic-${startPath}-${marker}`).length, 1, marker);
                assert.equal(notices.filter(row => row.pluginName === `synthetic-${marker}`
                    && row.chatId === `synthetic-${startPath}-${marker}`).length, 1, marker);
            }
        });
        const first = completed[0];
        await t.test('claim ACK restart and reconnect do not replay', async () => {
            const ack = await fetch(`${running.origin}/api/bg-orchestrate-result/${first.operationId}/${first.result.resultId}?consumerId=${first.consumerId}`,
                { method: 'DELETE', headers });
            assert.equal(ack.status, 200);
            running.server.kill('SIGTERM'); await once(running.server, 'exit');
            running = await launch(t, runtime, events, 2);
            headers = await credentials(running.origin, `d1a-${startPath}-session-2`);
            const replay = await fetch(running.origin + '/api/bg-orchestrate', { method: 'POST', headers, body: JSON.stringify(first.body) });
            assert.ok(replay.status === 409 || replay.status === 200, await replay.clone().text());
            await delay(1000);
            assert.equal(events.filter(row => row.launchIndex === 2 && row.event === 'provider').length, 0);
        });
    });

    test('a post-reply auxiliary beforeRequest failure preserves the answer as terminal-partial',
        { timeout: 120_000 }, async t => {
        const startPath = 'server-input';
        const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'pocketrisu-d1a-'));
        const events = [];
        await seedRuntime(runtime, databaseFixture(await defaultDatabase(), startPath));
        const running = await launch(t, runtime, events, 1, false);
        const headers = await credentials(running.origin, 'd1a-aux-session');
        const value = await startCase(running.origin, headers, startPath, 'd1a-aux', 4);
        assert.equal(value.result.kind, 'terminal-partial');
        assert.deepEqual(value.chat.message.filter(row => row.role === 'char').map(row => row.data), ['synthetic-answer']);
        assert.equal(events.filter(row => row.event === 'provider').length, 1);
        const notice = await fetch(running.origin + '/api/bg-notifications/claim', { method: 'POST', headers,
            body: JSON.stringify({ consumerId: 'd1a-aux-notice-consumer', messageVersion: 3 }) });
        const eventsForChat = (await notice.json()).notifications.map(row => row.event)
            .filter(row => row.chatId === value.chatId);
        assert.equal(eventsForChat.filter(row => row.pluginName === 'synthetic-d1a-aux').length, 1);
        assert.equal(eventsForChat.some(row => row.code === 'operation_failed' && row.reason === 'generation_failed'), true);
    });
});
