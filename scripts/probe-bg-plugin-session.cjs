'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { AsyncLocalStorage } = require('node:async_hooks');
const Module = require('node:module');
let wireMutation = null;
const load = Module._load;
Module._load = function(request, ...args) {
    const value = load.call(this, request, ...args);
    if (request === './bgPluginSandbox.cjs') return { ...value, createPluginSandbox: options => {
        const mutation = wireMutation;
        return value.createPluginSandbox({ ...options, onFrame: frame => options.onFrame(mutation ? mutation(frame) : frame) });
    } };
    return value;
};
const { createPluginSession } = require('../patches/lazy-chat-bg-adapter/files-1.10/server/node/bgPluginSession.cjs');
Module._load = load;

for (const kind of ['valid', 'invalid', 'expired']) test(`untrusted local refusal ${kind} is scoped and executes no API task`, async t => {
    let hook, effects = 0, reports = 0, late = 0, changed = 0;
    const phase = new AsyncLocalStorage(), reportPhases = [];
    wireMutation = frame => {
        if (frame.kind === 'call' && frame.method === 'api' && frame.args?.[1]?.[0]?.[1] === 'nativeFetch' && changed++ < 1) {
            return { ...frame, method: 'api_local_limit', args: ['array', [['value', kind === 'invalid' ? 'nativeFetch' : 'plugin_rpc_frame_limit']]],
                context: kind === 'expired' ? 'expired' : frame.context };
        }
        return frame;
    };
    const session = await createPluginSession({
        script: `await Risuai.addRisuReplacer('beforeRequest',async()=>{try {await Risuai.nativeFetch('https://synthetic.invalid',{body:'small'});return 'ok';}catch(e){return e.code;}});`,
        api(method, args) { if (method === 'addRisuReplacer') hook = args[1]; else { effects++; return 'ok'; } },
        onLocalLimit: () => { reports++; reportPhases.push(phase.getStore()); }, onLateCall: () => { late++; },
    });
    wireMutation = null; t.after(() => session.close()); await session.load();
    const result = await phase.run('main', () => hook([]));
    assert.equal(result, kind === 'invalid' ? 'plugin_api_request_invalid' : kind === 'expired' ? 'plugin_invocation_expired' : 'plugin_rpc_frame_limit');
    assert.equal(effects, 0); assert.equal(reports, kind === 'valid' ? 1 : 0); assert.equal(late, kind === 'expired' ? 1 : 0);
    assert.deepEqual(reportPhases, kind === 'valid' ? ['main'] : []);
    assert.equal(await phase.run('next', () => hook([])), 'ok'); assert.equal(effects, 1);
    assert.equal(session.failure, null); assert.equal(session.activeScopes, 0);
});

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

test('a retained stream keeps the failed input scope when consumed after transform stops', async t => {
    const { transformServerChatInput } = require('../patches/lazy-chat-bg-adapter/files-1.10/server/node/serverChatInputTransform.cjs');
    let provider, stream, captured, effects = 0;
    const scopes = [];
    const session = await createPluginSession({
        script: `await Risuai.addProvider('retained',async()=>({success:true,content:new ReadableStream({
            async pull(c){try{await Risuai.nativeFetch('https://synthetic.invalid/retained',{});c.enqueue('allowed');}
                catch(e){c.enqueue(e.code);}c.close();}
        },{highWaterMark:0})}));`,
        api(method, args) {
            if (method === 'addProvider') { provider = args[1]; return; }
            assert.equal(method, 'nativeFetch');
            const current = globalThis.__bgGetServerInputExecution();scopes.push(current);
            if (current?.failure) throw current.failure;
            effects++;return null;
        },
    });
    t.after(() => session.close());await session.load();
    await assert.rejects(transformServerChatInput({type:'character'},{message:[]},
        {rawText:'synthetic',userMessageId:'synthetic-input',submittedAt:1},
        {runTrigger:async()=>{captured=globalThis.__bgGetServerInputExecution();stream=(await provider({})).content;
            try{captured.reject('browser_model_provider');}catch{}return null;}},
        {processScript:async(_char,text)=>text},()=>{}),{code:'BG_INPUT_HOST_UNSUPPORTED'});
    assert.equal(session.activeScopes,1);
    // The RPC boundary intentionally normalizes non-plugin error codes; the
    // parent scope still retains the original unsupported-input failure.
    const reader=stream.getReader();assert.deepEqual(await reader.read(),{value:'plugin_execution_failed',done:false});
    assert.equal(captured.failure.code,'BG_INPUT_HOST_UNSUPPORTED');
    assert.equal((await reader.read()).done,true);assert.equal(effects,0);assert.deepEqual(scopes,[captured]);
    assert.equal(session.activeScopes,0);assert.equal(globalThis.__bgGetServerInputExecution(),undefined);
    const next=(await provider({})).content.getReader();assert.deepEqual(await next.read(),{value:'allowed',done:false});
    assert.equal((await next.read()).done,true);assert.equal(effects,1);assert.equal(session.activeScopes,0);
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

test('a callback joins its accepted queued write before releasing authority', { timeout: 5000 }, async t => {
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
    await session.load(); let settled = false;
    const callback = hook('value').then(value => { settled = true; return value; }); await began;
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(settled, false); assert.equal(writes, 0);
    release(); await finished;
    assert.equal(await callback, 'value'); assert.equal(writes, 1);
    assert.equal(session.activeScopes, 0);
    assert.equal(session.failure, null);
});

test('settlement joins a promise read-write chain and preserves a thrown callback error', { timeout: 5000 }, async t => {
    let hook, writes = 0, release, entered;
    const began = new Promise(resolve => { entered = resolve; }), gate = new Promise(resolve => { release = resolve; });
    const session = await createPluginSession({
        script: `await Risuai.addRisuReplacer('beforeRequest',async()=>{
            void Promise.resolve().then(async()=>{await Risuai.getArgument('state');await Risuai.setArgument('state','new');});
            throw Error('original callback failure');
        });`,
        api: async (method, args) => {
            if (method === 'addRisuReplacer') { hook = args[1]; return; }
            if (method === 'getArgument') { entered(); await gate; return 'old'; }
            assert.equal(method, 'setArgument'); writes++;
        },
    });
    t.after(async () => { release(); await session.close(); }); await session.load();
    let settled = false; const callback = hook([]).finally(() => { settled = true; });
    callback.catch(() => {}); await began; await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(settled, false); assert.equal(writes, 0); release();
    await assert.rejects(callback, { code: 'plugin_execution_failed' });
    assert.equal(writes, 1); assert.equal(session.activeScopes, 0); assert.equal(session.failure, null);
});

test('cancellation during callback settlement cannot commit the queued effect', { timeout: 5000 }, async t => {
    let hook, release, entered, writes = 0;
    const began = new Promise(resolve => { entered = resolve; }), gate = new Promise(resolve => { release = resolve; });
    const controller = new AbortController();
    const session = await createPluginSession({ signal: controller.signal,
        script: `await Risuai.addRisuReplacer('beforeRequest',async x=>{void Risuai.setArgument('state','new').catch(()=>{});return x;});`,
        api: async (method, args) => {
            if (method === 'addRisuReplacer') { hook = args[1]; return; }
            entered(); await gate; session.assertCurrent(); writes++;
        },
    });
    t.after(async () => { release(); await session.close(); }); await session.load();
    const callback = hook([]); callback.catch(() => {}); await began; controller.abort(); release();
    await assert.rejects(callback); await session.close(); assert.equal(writes, 0); assert.equal(session.activeScopes, 0);
});

test('reentrant callback settlement ignores its outer pending model call', { timeout: 5000 }, async t => {
    const hooks = {}, writes = [];
    const session = await createPluginSession({
        script: `await Risuai.addRisuReplacer('beforeRequest',async()=>{
            const nested=await Risuai.runLLMModel({messages:[]});void Risuai.setArgument('outer','done');return nested;
        });await Risuai.addRisuReplacer('afterRequest',async()=>{void Risuai.setArgument('nested','done');return 'nested-result';});`,
        api: async (method, args) => {
            if (method === 'addRisuReplacer') { hooks[args[0]] = args[1]; return; }
            if (method === 'runLLMModel') return await hooks.afterRequest();
            assert.equal(method, 'setArgument'); session.assertCurrent(); writes.push(args[0]);
        },
    });
    t.after(() => session.close()); await session.load();
    assert.equal(await hooks.beforeRequest(), 'nested-result');
    assert.deepEqual(writes, ['nested', 'outer']); assert.equal(session.activeScopes, 0); assert.equal(session.failure, null);
});

test('non-quiescent RPC work has a bounded settlement warning without replacing the result', { timeout: 25000 }, async t => {
    let hook, late = 0, limits = 0;
    const session = await createPluginSession({ runtimeMs: 60000,
        script: `await Risuai.addRisuReplacer('beforeRequest',async()=>{
            void(async()=>{try{for(;;)await Risuai.getArgument('loop');}catch{}})();return 'unchanged-result';
        });`,
        api: async (method, args) => {
            if (method === 'addRisuReplacer') { hook = args[1]; return; }
            assert.equal(method, 'getArgument'); await new Promise(resolve => setTimeout(resolve, 10)); return null;
        }, onLateCall: () => { late++; }, onSettlementTimeout: () => { limits++; },
    });
    t.after(() => session.close()); await session.load();
    const started = performance.now(); assert.equal(await hook(), 'unchanged-result');
    assert.ok(performance.now() - started < 22000); assert.equal(limits, 1);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.ok(late >= 1);
    assert.equal(session.failure, null); assert.equal(session.activeScopes, 0);
});
