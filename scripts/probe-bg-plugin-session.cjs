'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { AsyncLocalStorage } = require('node:async_hooks');
const { createPluginSession } = require('../patches/lazy-chat-bg-adapter/files-1.10/server/node/bgPluginSession.cjs');

test('API calls use the invoking phase, not the socket creation phase', async t => {
    const phase = new AsyncLocalStorage(), observed = [];
    let hook;
    const session = await phase.run('socket', () => createPluginSession({
        script: `await Risuai.addRisuReplacer('beforeRequest',async x=>{await Risuai.log('called');return x;});`,
        api(method, args) {
            if (method === 'addRisuReplacer') hook = args[1];
            if (method === 'log') observed.push(phase.getStore());
        },
    }));
    t.after(() => session.close());
    await phase.run('load', () => session.load());
    await phase.run('input', () => hook('input'));
    await phase.run('main', () => hook('main'));
    assert.deepEqual(observed, ['input', 'main']);
    assert.equal(session.activeScopes, 0);
});

test('returned stream retains its invocation until drained', async t => {
    const phase = new AsyncLocalStorage(), observed = [];
    let provider;
    const session = await createPluginSession({
        script: `await Risuai.addProvider('generic',async()=>({success:true,content:new ReadableStream({
            async pull(c){await Risuai.log('pull');c.enqueue('result');c.close();}
        },{highWaterMark:0})}));`,
        api(method, args) { if (method === 'addProvider') provider = args[1]; else observed.push(phase.getStore()); },
    });
    t.after(() => session.close());
    await session.load();
    const result = await phase.run('provider', () => provider({}));
    assert.equal(session.activeScopes, 1);
    const reader = result.content.getReader();
    assert.deepEqual(await phase.run('consumer', () => reader.read()), { value: 'result', done: false });
    assert.equal((await reader.read()).done, true);
    assert.deepEqual(observed, ['provider']);
    assert.equal(session.activeScopes, 0);
});

test('late timer API is rejected without killing the later invocation', async t => {
    let hook, lateCalls = 0;
    const effects = [];
    const session = await createPluginSession({
        script: `await Risuai.addRisuReplacer('beforeRequest',async x=>{
            if(x==='old'){setTimeout(()=>{void Risuai.log('late').catch(()=>{});},80);return x;}
            await new Promise(resolve=>setTimeout(resolve,300));return x;
        });`,
        api(method, args) { if (method === 'addRisuReplacer') hook = args[1]; else effects.push(method); },
        onLateCall: () => { lateCalls++; },
    });
    t.after(() => session.close());
    await session.load();
    await hook('old');
    const next = hook('new');
    assert.equal(await next, 'new');
    assert.equal(lateCalls, 1);
    assert.equal(session.failure, null);
    assert.deepEqual(effects, []);
});

test('reentrant callback requests are bounded by invocation chain depth', async t => {
    let hook;
    const session = await createPluginSession({
        script: `await Risuai.addRisuReplacer('beforeRequest',async x=>Risuai.runLLMModel({messages:x}));`,
        api(method, args) { if (method === 'addRisuReplacer') hook = args[1]; else return hook(args[0].messages); },
    });
    t.after(() => session.close());
    await session.load();
    await assert.rejects(hook([]), { code: 'plugin_invocation_limit' });
    assert.equal(session.activeScopes, 0);
});

test('a queued write rechecks authority after its originating hook returns', { timeout: 5000 }, async t => {
    let hook, release, started, completed, writes = 0, session;
    const gate = new Promise(resolve => { release = resolve; });
    const began = new Promise(resolve => { started = resolve; });
    const finished = new Promise(resolve => { completed = resolve; });
    session = await createPluginSession({
        script: `await Risuai.addRisuReplacer('beforeRequest',async x=>{
            void Risuai.setArgument('key','value').catch(()=>{});
            await Risuai.log('write-entered');return x;
        });`,
        api: async (method, args) => {
            if (method === 'addRisuReplacer') { hook = args[1]; return; }
            if (method === 'log') { await began; return; }
            started(); await gate;
            try { session.assertCurrent(); writes++; } finally { completed(); }
        },
    });
    t.after(async () => { release(); await session.close(); });
    await session.load(); await hook('value'); await began;
    release(); await finished;
    assert.equal(writes, 0);
    assert.equal(session.failure, null);
});
