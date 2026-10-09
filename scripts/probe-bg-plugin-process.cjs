'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { fork } = require('node:child_process');
const { once } = require('node:events');
const { createHash, createHmac } = require('node:crypto');
const { createRequire } = require('node:module');
const assert = require('node:assert/strict');
const { gzipSync } = require('node:zlib');
const [target, fixturePath] = process.argv.slice(2, 4).map(value => path.resolve(value));
const mode = process.argv[4] ?? 'normal';
assert.ok(['normal', 'disabled', 'crash-input', 'crash-analysis', 'cold-read', 'provider', 'provider-stream', 'provider-off',
    'retry-after-attach', 'retry-failed-settle', 'crash-after-attach', 'publication-fault', 'two-chat', 'display-role', 'budget-api'].includes(mode));
const afterAttach = ['retry-after-attach', 'retry-failed-settle', 'crash-after-attach', 'publication-fault'].includes(mode);
const pluginProvider = mode.startsWith('provider');
const database = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
assert.equal(database.characters.length, 1); assert.equal(database.characters[0].chaId, 'synthetic-character');
const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'pocketrisu-plugin-process-'));
fs.writeFileSync(path.join(runtime, 'package.json'), JSON.stringify({ name: 'pocketrisu', version: '1.10.0' }));
fs.symlinkSync(path.join(target, 'dist'), path.join(runtime, 'dist'));
database.aiModel = database.subModel = 'gpt35';
database.nodeOnlyModelModeLock = 'legacy'; database.openAIKey = 'synthetic'; database.streaming = false;
database.characters[0].triggerscript = [];
database.characters[0].chats[0].useModelPreset = false;
if (mode === 'two-chat') {
    database.characters[0].chats.push({ ...structuredClone(database.characters[0].chats[0]), id: 'synthetic-second-chat', message: [] });
}
if (pluginProvider) {
    database.aiModel = database.subModel = 'pluginmodel:::synthetic-provider';
    database.characters[0].chats[0].message = [{ role: 'user', data: 'synthetic-question', chatId: 'synthetic-existing-user' }];
}
const coldMarker = String.fromCodePoint(0xef01) + 'COLDSTORAGE' + String.fromCodePoint(0xef01) + 'synthetic-cold-data';
if (mode === 'cold-read') database.characters[0].chats.push({ id: 'synthetic-cold-chat', name: 'Cold', lastDate: 100,
    message: [{ role: 'char', data: coldMarker, chatId: 'synthetic-cold-message' }] });
database.plugins = [{ name: 'synthetic-generic', version: '3.0', enabled: true, realArg: {}, script: `
    ${afterAttach ? "await Risuai.nativeFetch('https://analysis.example.test/v1',{method:'POST',body:'startup-effect'});" : ''}
    ${pluginProvider ? `await Risuai.addProvider('synthetic-provider',async(arg,signal)=>{
        if(arg.mode!=='v3'||!(signal instanceof AbortSignal)||!arg.prompt_chat.some(message=>message.content==='[before] analysis-ok'))throw Error('provider argument mismatch');
        const count=await Risuai.pluginStorage.getItem('synthetic-provider-count')||0;
        await Risuai.pluginStorage.setItem('synthetic-provider-count',count+1);
        return {success:true,content:${mode === 'provider-stream' ? "new ReadableStream({start(c){c.enqueue('synthetic-');c.enqueue('provider-answer');c.close();}})" : "'synthetic-provider-answer'"}};
    });` : ''}
    await Risuai.addRisuScriptHandler('input',async text=>{
        ${mode === 'budget-api' ? "try{await Risuai.nativeFetch('https://analysis.example.test/v1',{method:'POST',body:'x'.repeat(4*1024*1024)});}catch{}" : ''}
        ${mode === 'crash-input' ? "await Risuai.pluginStorage.setItem('synthetic-input-effect',1); await Risuai.nativeFetch('https://analysis.example.test/v1',{method:'POST',body:'synthetic-analysis'});" : ''}
        return text+' [input]';
    });
    await Risuai.addRisuReplacer('beforeRequest',async messages=>{
        ${mode === 'cold-read' ? "const character=await Risuai.getCharacter();if(character.chats[1].message[0].data!=='synthetic-cold-content')throw Error('cold payload mismatch');" : ''}
        const count=await Risuai.pluginStorage.getItem('synthetic-runs')||0;
        await Risuai.pluginStorage.setItem('synthetic-runs',count+1);
        const response=await Risuai.nativeFetch('https://analysis.example.test/v1',{method:'POST',body:'synthetic-analysis'});
        const result=await response.text();
        ${mode === 'two-chat' ? "const character=await Risuai.getCharacter();return [...messages,{role:'system',content:'[before] '+result+' '+character.chats[character.chatPage].id}];" : "return [...messages,{role:'system',content:'[before] '+result}];"}
    });
    await Risuai.addRisuReplacer('afterRequest',async text=>text+' [after]');
    await Risuai.addRisuScriptHandler('output',async text=>text+' [output]');
    ${mode === 'display-role' ? "await Risuai.addRisuScriptHandler('display',async text=>text+' [display-only]');await Risuai.addRisuScriptHandler('process',async text=>text+' [prompt-only]');" : ''}
    await Risuai.log('synthetic-loaded');
` }];
const password = createHash('sha256').update('synthetic-plugin-password').digest('hex');
const seed = fork(path.join(target, 'server/node/bgServerChatProcessClient.cjs'), [], { cwd: runtime, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
seed.send({ scope: 'pocketrisu-h1-client', command: 'seed', runtimeRoot: runtime, targetRoot: target, password,
    databaseBase64: Buffer.from(JSON.stringify(database)).toString('base64') });
const Database = createRequire(path.join(target, 'package.json'))('better-sqlite3');
let server;
const events = [];
const wait = async predicate => {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) { const value = await predicate(); if (value) return value; await new Promise(resolve => setTimeout(resolve, 100)); }
    throw Error('Synthetic process deadline exceeded');
};
let launches = 0;
async function launch(crash) {
    const launchIndex = ++launches;
    server = fork(path.join(target, 'server/node/server.cjs'), [], { cwd: runtime,
        execArgv: ['--require', path.join(__dirname, 'probes/bg-plugin-process-preload.cjs')],
        env: { ...process.env, PORT: '0', POCKETRISU_PLUGIN_PROCESS_PROBE: '1',
            POCKETRISU_PLUGIN_CRASH: crash && mode !== 'crash-after-attach' ? '1' : '0', POCKETRISU_BG_PLUGIN_HOST_CANDIDATE: ['disabled', 'provider-off'].includes(mode) ? '0' : '1',
            POCKETRISU_PLUGIN_AFTER_ATTACH_FAULT: afterAttach && mode !== 'publication-fault' ? '1' : '0',
            POCKETRISU_PLUGIN_PUBLICATION_FAULT: mode === 'publication-fault' && launchIndex === 1 ? '1' : '0',
            POCKETRISU_PLUGIN_AFTER_ATTACH_KILL: crash && mode === 'crash-after-attach' ? '1' : '0',
            POCKETRISU_PLUGIN_SETTLE_FAULT: mode === 'retry-failed-settle' ? '1' : '0',
            POCKETRISU_PLUGIN_TWO_CHAT: mode === 'two-chat' ? '1' : '0',
            TUNNEL_DISABLED: '1', UPDATE_CHECK_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    const log = fs.createWriteStream(path.join(runtime, `server-${launchIndex}.log`));
    server.stdout.pipe(log); server.stderr.pipe(log);
    server.on('message', message => events.push({ ...message, launchIndex }));
    const ready = await wait(() => events.find(message => message.event === 'ready' && message.launchIndex === launchIndex));
    return `http://127.0.0.1:${ready.port}`;
}
async function credentials(origin, stamp) {
    const response = await fetch(origin + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
    assert.equal(response.status, 200);
    const { token } = await response.json();
    const session = await fetch(origin + '/api/session', { method: 'POST', headers: { 'risu-auth': token, 'x-session-id': 'synthetic-plugin-session' } });
    assert.equal(session.status, 200);
    const cookie = session.headers.get('set-cookie').split(';')[0];
    return { 'content-type': 'application/json', 'risu-auth': token, cookie, 'x-client-build': stamp };
}
async function main() {
    assert.equal((await once(seed, 'exit'))[0], 0);
    const db = new Database(path.join(runtime, 'save/risuai.db'));
    const permissions = ['replacer', 'provider'].map(value => JSON.stringify(['synthetic-generic', value]));
    db.prepare('INSERT OR REPLACE INTO kv (key,value) VALUES (?,?)').run('cache/plugin-permissions/state.json',
        Buffer.from(JSON.stringify({ given: permissions, denied: [], cache: permissions.map(permission => [permission + '_lastGrantTime', Date.now()]) })));
    if (mode === 'cold-read') db.prepare('INSERT OR REPLACE INTO kv (key,value) VALUES (?,?)').run('coldstorage/synthetic-cold-data',
        gzipSync(Buffer.from(JSON.stringify({ message: [{ role: 'char', data: 'synthetic-cold-content', chatId: 'synthetic-cold-message' }], scriptstate: {} }))));
    db.close();
    let origin = await launch(mode.startsWith('crash-'));
    const stamp = JSON.parse(fs.readFileSync(path.join(target, 'dist/build-stamp.json'), 'utf8')).stamp;
    let headers = await credentials(origin, stamp);
    const headerRule = await fetch(origin + '/api/external-request-headers', { method: 'PUT', headers,
        body: JSON.stringify({ revision: 0, rules: [{ id: 'synthetic-rule', name: 'Synthetic', enabled: true,
            destination: 'https://analysis.example.test/', header: 'x-synthetic-session', valueKind: 'conversation-session' }] }) });
    assert.equal(headerRule.status, 200);
    process.chdir(runtime);
    const { decodeRisuSave } = require(path.join(target, 'server/node/utils.cjs'));
    const read = async () => {
        const response = await fetch(origin + '/api/chat-content/synthetic-character/0', { headers: { ...headers, 'x-chat-id': 'synthetic-chat' } });
        assert.equal(response.status, 200);
        return { chat: await decodeRisuSave(new Uint8Array(await response.arrayBuffer())), revision: response.headers.get('x-chat-revision') };
    };
    const before = await read();
    const operationId = 'synthetic-plugin-operation';
    const body = { detached: true, selectedCharId: 'synthetic-character', selectedChatId: 'synthetic-chat',
            currentChat: before.chat, operationId, baseChatRevision: before.revision,
            resultKeyVersion: 1, resultOrderVersion: 1, startAckVersion: 1, serverChatCommitVersion: 1, inputCommandVersion: pluginProvider ? 0 : 1,
            inputCommand: { inputCommandId: 'synthetic-plugin-input', userMessageId: 'synthetic-plugin-user', rawText: 'synthetic-question',
                settingsSnapshotRef: 'synthetic-ref', submittedAt: Date.now() } };
    const started = await fetch(origin + '/api/bg-orchestrate', { method: 'POST', headers, body: JSON.stringify(body) });
    const startBody = await started.json();
    assert.equal(started.status, 200, JSON.stringify(startBody));
    if (mode === 'two-chat') {
        await wait(() => events.some(message => message.event === 'analysis'));
        const secondResponse = await fetch(origin + '/api/chat-content/synthetic-character/1', { headers: { ...headers, 'x-chat-id': 'synthetic-second-chat' } });
        assert.equal(secondResponse.status, 200);
        const secondChat = await decodeRisuSave(new Uint8Array(await secondResponse.arrayBuffer()));
        const secondId = 'synthetic-second-operation';
        const second = await fetch(origin + '/api/bg-orchestrate', { method: 'POST', headers, body: JSON.stringify({
            ...body, operationId: secondId, selectedChatId: 'synthetic-second-chat', currentChat: secondChat,
            baseChatRevision: secondResponse.headers.get('x-chat-revision'), inputCommand: {
                ...body.inputCommand, inputCommandId: 'synthetic-second-input', userMessageId: 'synthetic-second-user', rawText: 'second question',
            },
        }) });
        assert.ok([200, 202].includes(second.status), JSON.stringify(await second.clone().json()));
        const secondAck = await second.json(); assert.equal(secondAck.operationId, secondId);
        assert.ok(secondAck.started === true || secondAck.accepted === true);
        // Observe longer than twice the measured mixed-host cold load. Source
        // lock tracing remains the structural anchor, not this finite window.
        await new Promise(resolve => setTimeout(resolve, 2000));
        assert.equal(events.filter(message => message.event === 'analysis').length, 1);
        assert.equal(events.filter(message => message.event === 'provider').length, 0);
        server.send({ event: 'release-first-analysis' });
        for (const [index, chatId] of [[0, 'synthetic-chat'], [1, 'synthetic-second-chat']]) {
            const chat = await wait(async () => {
                const response = await fetch(origin + '/api/chat-content/synthetic-character/' + index, { headers: { ...headers, 'x-chat-id': chatId } });
                assert.equal(response.status, 200);
                const value = await decodeRisuSave(new Uint8Array(await response.arrayBuffer()));
                return value.message.some(message => message.role === 'char') ? value : null;
            });
            assert.equal(chat.message.filter(message => message.role === 'user').length, 1);
            assert.equal(chat.message.filter(message => message.role === 'char').length, 1);
        }
        const providers = events.filter(message => message.event === 'provider');
        assert.equal(providers.length, 2); assert.equal(events.filter(message => message.event === 'analysis').length, 2);
        for (const [index, chatId] of ['synthetic-chat', 'synthetic-second-chat'].entries()) {
            const injected = providers[index].body.messages.filter(message => message.content.startsWith('[before]'));
            assert.deepEqual(injected.map(message => message.content), ['[before] analysis-ok ' + chatId]);
        }
        const noticeResponse = await fetch(origin + '/api/bg-notifications/claim', { method: 'POST', headers,
            body: JSON.stringify({ consumerId: 'synthetic-two-chat-consumer', messageVersion: 2 }) });
        assert.equal(noticeResponse.status, 200);
        const notices = (await noticeResponse.json()).notifications;
        assert.equal(notices.length, 2);
        assert.deepEqual(notices.map(row => row.event.code), ['plugin_message', 'plugin_message']);
        console.log(JSON.stringify({ passed: true, runtime, mode, beforeRelease: { analysis: 1, provider: 0 }, afterRelease: { analysis: 2, provider: 2 }, inputs: 2, answers: 2, crossChatHooks: 0 }));
        return;
    }
    if (mode === 'provider-off') {
        const result = await wait(async () => {
            const response = await fetch(origin + '/api/bg-orchestrate-result/' + operationId
                + '?charId=synthetic-character&chatId=synthetic-chat&consumerId=synthetic-off-result-consumer', { headers });
            if (!response.ok) return null;
            const value = await response.json(); return value.final ? value : null;
        });
        assert.equal(result.kind, 'terminal-error'); assert.notEqual(result.hasGeneratedAnswer, true);
        const saved = await read(); assert.equal(saved.chat.message.filter(message => message.role === 'char').length, 0);
        assert.equal(events.filter(message => message.event === 'provider' || message.event === 'analysis').length, 0);
        const notices = await fetch(origin + '/api/bg-notifications/claim', { method: 'POST', headers,
            body: JSON.stringify({ consumerId: 'synthetic-off-notice-consumer', messageVersion: 1 }) });
        assert.equal(notices.status, 200);
        assert.equal((await notices.json()).notifications.filter(row => row.event.api === 'server_plugin_host_disabled').length, 1);
        console.log(JSON.stringify({ passed: true, runtime, mode, result: result.kind, providerCalls: 0, analysis: 0, answers: 0, omissionNotice: 1 }));
        return;
    }
    if (mode === 'retry-failed-settle' || mode === 'crash-after-attach') {
        if (mode === 'crash-after-attach') {
            await wait(() => server.signalCode === 'SIGKILL');
            origin = await launch(false); headers = await credentials(origin, stamp);
        } else await wait(() => events.some(message => message.event === 'settle-fault'));
        const retried = await fetch(origin + '/api/bg-orchestrate', { method: 'POST', headers, body: JSON.stringify(body) });
        const retryBody = await retried.json();
        assert.equal(retried.status, 409, JSON.stringify(retryBody));
        assert.equal(retryBody.reason, 'settings_context_unavailable');
        const retained = await read();
        assert.equal(retained.chat.message.filter(message => message.role === 'user').length, 1);
        assert.equal(events.filter(message => message.event === 'analysis').length, 1);
        assert.equal(events.filter(message => message.event === 'provider').length, 0);
        console.log(JSON.stringify({ passed: true, runtime, mode, startupEffects: 1, retryStatus: 409,
            reason: retryBody.reason, input: 1, providerReplay: 0 }));
        return;
    }
    if (mode === 'retry-after-attach' || mode === 'publication-fault') {
        await wait(() => events.some(message => message.event === (mode === 'publication-fault' ? 'publication-fault' : 'after-attach-fault')));
        await wait(async () => {
            const response = await fetch(origin + '/api/bg-orchestrate-status/' + operationId
                + '?charId=synthetic-character&chatId=synthetic-chat', { headers });
            return (await response.json()).state === 'input-failed';
        });
        const retried = await fetch(origin + '/api/bg-orchestrate', { method: 'POST', headers, body: JSON.stringify(body) });
        assert.equal(retried.status, 200);
        assert.equal((await retried.json()).reused, true);
        const resultResponse = await fetch(origin + '/api/bg-orchestrate-result/' + operationId
            + '?charId=synthetic-character&chatId=synthetic-chat&consumerId=synthetic-plugin-result-consumer', { headers });
        assert.equal(resultResponse.status, 200);
        const result = await resultResponse.json();
        assert.equal(result.kind, 'terminal-error');
        assert.equal(result.serverChatCommit.reason, 'plugin_execution_context_unavailable');
        if (mode === 'publication-fault') {
            server.kill('SIGTERM'); await once(server, 'exit');
            origin = await launch(false); headers = await credentials(origin, stamp);
        }
        const retained = await read();
        assert.equal(retained.chat.message.filter(message => message.role === 'user').length, 1);
        assert.equal(events.filter(message => message.event === 'analysis').length, 1);
        assert.equal(events.filter(message => message.event === 'provider').length, 0);
        console.log(JSON.stringify({ passed: true, runtime, mode, startupEffects: 1, reused: true, providerReplay: 0 }));
        return;
    }
    if (mode.startsWith('crash-')) {
        await wait(() => server.signalCode === 'SIGKILL');
        const beforeRestart = new Database(path.join(runtime, 'save/risuai.db'), { readonly: true });
        const state = JSON.parse(String(beforeRestart.prepare('SELECT value FROM kv WHERE key=?').get('bg-orch-state-op:' + operationId).value));
        const rawRoot = beforeRestart.prepare('SELECT value FROM kv WHERE key=?').get('database/database.bin').value;
        const persistedRoot = await decodeRisuSave(rawRoot);
        beforeRestart.close();
        assert.equal(persistedRoot.pluginCustomStorage[mode === 'crash-input' ? 'synthetic-input-effect' : 'synthetic-runs'], 1);
        assert.equal(state.state, mode === 'crash-input' ? 'queued' : 'running');
        origin = await launch(false); headers = await credentials(origin, stamp);
        const retry = await fetch(origin + '/api/bg-orchestrate', { method: 'POST', headers, body: JSON.stringify(body) });
        const retryBody = await retry.json();
        if (mode === 'crash-input') {
            assert.equal(retry.status, 409, JSON.stringify(retryBody));
            assert.equal(retryBody.reason, 'transform_outcome_unknown');
        } else assert.ok(retry.status === 409 || (retry.status === 200 && retryBody.reused === true), JSON.stringify(retryBody));
        const statusResponse = await fetch(origin + '/api/bg-orchestrate-status/' + operationId
            + '?charId=synthetic-character&chatId=synthetic-chat', { headers });
        assert.equal(statusResponse.status, 200);
        const status = await statusResponse.json();
        if (mode === 'crash-input') assert.equal(status.state, 'input-transform-unknown');
        await new Promise(resolve => setTimeout(resolve, 2000));
        assert.equal(events.filter(message => message.event === 'provider' || message.event === 'analysis').length, 0);
        assert.equal(events.filter(message => message.event === 'analysis-crash').length, 1);
        console.log(JSON.stringify({ passed: true, runtime, mode, launches, durableEffect: 1,
            providerReplay: 0, analysisReplay: 0, retryStatus: retry.status, state: status.state }));
        return;
    }
    const completed = await wait(async () => { const { chat } = await read(); return chat.message.some(message => message.role === 'char') ? chat : null; });
    const users = completed.message.filter(message => message.role === 'user');
    const answers = completed.message.filter(message => message.role === 'char');
    assert.equal(users.length, 1); assert.equal(answers.length, 1);
    assert.equal(users[0].data, mode === 'disabled' || pluginProvider ? 'synthetic-question' : 'synthetic-question [input]');
    const expectedAnswer = pluginProvider ? 'synthetic-provider-answer' : 'synthetic-answer';
    assert.equal(answers[0].data, mode === 'disabled' ? expectedAnswer
        : expectedAnswer + (mode === 'provider-stream' ? '' : ' [after]') + ' [output]');
    const provider = events.filter(message => message.event === 'provider');
    assert.equal(provider.length, pluginProvider ? 0 : 1);
    if (mode === 'disabled') {
        assert.equal(events.filter(message => message.event === 'analysis').length, 0);
        console.log(JSON.stringify({ passed: true, runtime, mode, provider: 1, analysis: 0 }));
        return;
    }
    if (!pluginProvider) assert.ok(provider[0].body.messages.some(message => message.content === '[before] analysis-ok'));
    if (mode === 'display-role') {
        assert.ok(provider[0].body.messages.some(message => message.content.includes('[prompt-only]')));
        assert.equal(JSON.stringify(provider[0].body.messages).includes('[display-only]'), false);
        assert.equal(JSON.stringify(completed.message).includes('[display-only]'), false);
        assert.equal(JSON.stringify(completed.message).includes('[prompt-only]'), false);
    }
    assert.equal(events.filter(message => message.event === 'analysis').length, 1);
    const stored = new Database(path.join(runtime, 'save/risuai.db'), { readonly: true });
    const config = JSON.parse(String(stored.prepare('SELECT value FROM kv WHERE key=?').get('internal/external-request-headers/v1').value));
    if (pluginProvider) {
        const savedRoot = await decodeRisuSave(stored.prepare('SELECT value FROM kv WHERE key=?').get('database/database.bin').value);
        assert.equal(savedRoot.pluginCustomStorage['synthetic-provider-count'], 1);
    }
    stored.close();
    const expectedHeader = createHmac('sha256', Buffer.from(config.secret, 'hex')).update(JSON.stringify([
        'external-header-v1', 'synthetic-rule', ['chat', JSON.stringify(['synthetic-character', 'synthetic-chat'])],
    ])).digest('hex');
    assert.equal(events.find(message => message.event === 'analysis').headers['x-synthetic-session'], expectedHeader);
    const noticeResponse = await fetch(origin + '/api/bg-notifications/claim', { method: 'POST', headers,
        body: JSON.stringify({ consumerId: 'synthetic-plugin-consumer', messageVersion: 2 }) });
    assert.equal(noticeResponse.status, 200);
    const notices = (await noticeResponse.json()).notifications;
    assert.deepEqual(notices.map(row => row.event.code), mode === 'budget-api' ? ['plugin_message', 'plugin_host_limit'] : ['plugin_message']);
    if (mode === 'budget-api') {
        assert.equal(notices[1].event.reason, 'operation_budget');
        assert.equal(notices[1].event.phase, 'input');
        assert.equal(notices[1].event.effectsMayHaveOccurred, false);
    }
    if (mode === 'cold-read') {
        const done = once(server, 'exit'); server.kill('SIGTERM'); await done;
        const saved = new Database(path.join(runtime, 'save/risuai.db'), { readonly: true });
        const root = await decodeRisuSave(saved.prepare('SELECT value FROM kv WHERE key=?').get('database/database.bin').value);
        saved.close();
        assert.equal(root.characters[0].chats[1].message[0].data, coldMarker);
        assert.equal(root.characters[0].chats[1].lastDate, 100);
    }
    console.log(JSON.stringify({ passed: true, runtime, input: users.length, answer: answers.length,
        nativeProviderFetches: provider.length, pluginProviderCalls: pluginProvider ? 1 : 0,
        analysis: 1, notices: notices.length, conversationHeader: true, mode }));
}
main().catch(error => {
    console.error(JSON.stringify({ passed: false, runtime, error: error.message,
        events: events.map(message => message.event) })); process.exitCode = 1;
}).finally(async () => {
    if (server && server.exitCode === null && server.signalCode === null) { const done = once(server, 'exit'); server.kill('SIGTERM'); await done; }
});
