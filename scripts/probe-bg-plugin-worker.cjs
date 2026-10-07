'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createPluginSandbox } = require('../patches/lazy-chat-bg-adapter/files-1.10/server/node/bgPluginSandbox.cjs');
const { createPluginPeer } = require('../patches/lazy-chat-bg-adapter/files-1.10/server/node/bgPluginWorker.cjs');
const workerPath = path.resolve(__dirname, '../patches/lazy-chat-bg-adapter/files-1.10/server/node/bgPluginWorker.cjs');

async function fixture(t, dispatch) {
    let peer;
    const sandbox = await createPluginSandbox({ workerPath, runtimeMs: 10_000, onFrame: frame => peer.receive(frame) });
    peer = createPluginPeer({ send: sandbox.send, dispatch, timeoutMs: 5000, onFatal: code => sandbox.stop(code) });
    void sandbox.closed.then(result => peer.close(result.error ?? 'plugin_rpc_closed'));
    t.after(async () => { peer.close(); sandbox.stop(); await sandbox.closed; });
    return { peer, sandbox };
}

test('unmodified async initialization completes causal RPC chain before ready', async t => {
    const calls = [], hooks = [];
    const { peer } = await fixture(t, async (method, [api, args]) => {
        assert.equal(method, 'api'); calls.push(api);
        if (api === 'addRisuReplacer') hooks.push(args[1]);
        return undefined;
    });
    const source = `(async()=>{await Risuai.onUnload(()=>{}); await Promise.resolve();
        await Risuai.addRisuReplacer('beforeRequest',async messages=>[...messages,{role:'system',content:'합성 효과'}]);
        await Risuai.registerSetting('Synthetic',()=>{});})();`;
    assert.deepEqual(await peer.call('load', [source]), { ready: true });
    assert.deepEqual(calls, ['onUnload', 'addRisuReplacer', 'registerSetting']);
    assert.deepEqual(await hooks[0]([{ role: 'user', content: 'test' }]),
        [{ role: 'user', content: 'test' }, { role: 'system', content: '합성 효과' }]);
});

test('callback identities survive registration and removal', async t => {
    const callbacks = [];
    const { peer } = await fixture(t, (method, [api, args]) => { callbacks.push(args[1]); });
    await peer.call('load', [`const hook=x=>x; await Risuai.addRisuReplacer('beforeRequest',hook); await Risuai.removeRisuReplacer('beforeRequest',hook);`]);
    assert.equal(callbacks.length, 2);
    assert.equal(callbacks[0], callbacks[1]);
});

test('Response preserves streaming bytes, headers, status and Unicode', async t => {
    let observed;
    const { peer } = await fixture(t, (method, [api, args]) => {
        if (api === 'nativeFetch') return new Response(new ReadableStream({ start(controller) {
            controller.enqueue(new TextEncoder().encode('한글 '));
            controller.enqueue(new TextEncoder().encode('stream')); controller.close();
        } }), { status: 201, headers: { 'x-synthetic': 'kept' } });
        if (api === 'pluginStorage.setItem') observed = args[1];
    });
    await peer.call('load', [`const r=await Risuai.nativeFetch('https://synthetic.invalid');
        await Risuai.pluginStorage.setItem('observed',[r.status,r.headers.get('x-synthetic'),await r.text()]);`]);
    assert.deepEqual(observed, [201, 'kept', '한글 stream']);
});

test('plugin provider stream is pull-driven and cancellation reaches its source', async t => {
    let provider, cancelled = false;
    const { peer } = await fixture(t, (method, [api, args]) => {
        if (api === 'addProvider') provider = args[1];
        if (api === 'log' && args[0] === 'cancelled') cancelled = true;
    });
    await peer.call('load', [`await Risuai.addProvider('synthetic',async()=>({success:true,content:new ReadableStream({
        pull(c){c.enqueue('piece');}, async cancel(){await Risuai.log('cancelled');}
    },{highWaterMark:0})}));`]);
    const result = await provider({});
    assert.equal(result.success, true);
    const reader = result.content.getReader();
    assert.deepEqual(await reader.read(), { value: 'piece', done: false });
    await reader.cancel();
    assert.equal(cancelled, true);
});

test('AbortSignal propagates to an already-running callback', async t => {
    let hook;
    const { peer } = await fixture(t, (method, [api, args]) => { hook = args[1]; });
    await peer.call('load', [`await Risuai.addProvider('synthetic',async(_,signal)=>{
        if(!signal.aborted) await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));
        return {success:false,content:'aborted'};
    });`]);
    const controller = new AbortController();
    const result = hook({}, controller.signal);
    controller.abort();
    assert.deepEqual(await result, { success: false, content: 'aborted' });
});

test('own prototype keys survive as data without prototype pollution', async t => {
    let observed;
    const { peer } = await fixture(t, (method, [api, args]) => { observed = args[1]; });
    await peer.call('load', [`await Risuai.pluginStorage.setItem('observed',JSON.parse('{"__proto__":{"polluted":true}}'));`]);
    assert.equal(Object.getPrototypeOf(observed), Object.prototype);
    assert.equal(Object.hasOwn(observed, '__proto__'), true);
    assert.equal({}.polluted, undefined);
});

test('large Unicode script and return value survive transport boundaries', async t => {
    const text = '경계 검증 '.repeat(20_000);
    let observed;
    const { peer } = await fixture(t, (method, [api, args]) => { observed = args[0]; });
    await peer.call('load', [`await Risuai.log(${JSON.stringify(text)});`]);
    assert.equal(observed, text);
});

test('missing callbacks are rejected rather than dispatched as host APIs', async t => {
    let dispatched = false;
    const { peer } = await fixture(t, () => { dispatched = true; });
    await assert.rejects(peer.call('_callback', [100, []]), { code: 'plugin_rpc_callback_invalid' });
    assert.equal(dispatched, false);
});

test('a buffered burst of small provider chunks preserves all text', async t => {
    let provider;
    const { peer } = await fixture(t, (method, [api, args]) => { if (api === 'addProvider') provider = args[1]; });
    await peer.call('load', [`await Risuai.addProvider('burst',async()=>({success:true,content:new ReadableStream({start(c){
        for(let i=0;i<600;i++)c.enqueue('x');c.close();
    }})}));`]);
    const { content } = await provider({});
    const reader = content.getReader(); let text = '';
    for (;;) { const item = await reader.read(); if (item.done) break; text += item.value; }
    assert.equal(text, 'x'.repeat(600));
});

test('debug console and explicit object logs do not lock a Response body', async t => {
    let observed;
    const { peer } = await fixture(t, (method, [api, args]) => {
        if (api === 'nativeFetch') return Response.json({ value: 'preserved' });
        if (api === 'pluginStorage.setItem') observed = args[1];
    });
    await peer.call('load', [`const r=await Risuai.nativeFetch('https://synthetic.invalid');
        for(let i=0;i<100;i++)console.log(r);
        await Risuai.log(r); await Risuai.pluginStorage.setItem('observed',await r.json());`]);
    assert.deepEqual(observed, { value: 'preserved' });
});

test('forged thenable replies cannot capture a parent Promise indefinitely', async () => {
    let frame;
    const peer = createPluginPeer({ send: value => { frame = value; }, dispatch: () => {}, timeoutMs: 1000 });
    const pending = peer.call('synthetic', []);
    peer.receive({ v: 1, kind: 'return', id: frame.id, ok: true,
        value: ['object', [['then', ['function', 1]]]] });
    await assert.rejects(pending, { code: 'plugin_rpc_thenable_unsupported' });
    assert.equal(peer.stats().closed, true);
});
