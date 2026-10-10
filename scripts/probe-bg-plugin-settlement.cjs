'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { AsyncLocalStorage } = require('node:async_hooks');
const { createPluginPeer } = require('../patches/lazy-chat-bg-adapter/files-1.10/server/node/bgPluginWorker.cjs');

function fixture(t, options = {}) {
    const scope = new AsyncLocalStorage();
    const context = 'synthetic-live-context';
    let parent, worker, callback, release;
    const held = new Promise(resolve => { release = resolve; });
    const calls = [], warnings = [], fatals = [], frames = [];
    const send = (peer, frame) => queueMicrotask(() => peer.receive(JSON.parse(JSON.stringify(frame))));
    parent = createPluginPeer({ timeoutMs: 2000, getContext: () => context,
        runContext: (token, task) => scope.run(token, task),
        onSettlementTimeout: async () => {
            assert.equal(scope.getStore(), context);
            warnings.push('settlement');
            await options.report?.();
        },
        dispatch(method, args) {
            if (method === 'register') { callback = args[0]; return; }
            calls.push({ method, args }); return held;
        },
        send(frame) { send(worker, options.mutateParent ? options.mutateParent(frame) : frame); }, onFatal: code => { fatals.push(code); worker.close(code); } });
    worker = createPluginPeer({ timeoutMs: 2000, settleCallbacks: true, getContext: () => context,
        send(frame) { frames.push(JSON.parse(JSON.stringify(frame))); send(parent, options.mutate ? options.mutate(frame) : frame); },
        dispatch(method, args) { if (options.workerDispatch) return options.workerDispatch(method, args); throw Error('unexpected worker API'); },
        onFatal: code => { fatals.push(code); parent.close(code); } });
    t.after(() => { release(); parent.close(); worker.close(); });
    return { parent, worker, calls, warnings, fatals, frames, release,
        async register(fn) { await worker.call('register', [fn]); await new Promise(resolve => setImmediate(resolve)); return callback; } };
}

for (const rejected of [false, true]) test(`accepted 64-call saturation preserves callback ${rejected ? 'error' : 'result'} and publishes its warning`, async t => {
    const f = fixture(t);
    let overflow;
    const callback = await f.register(async () => {
        for (let index = 0; index < 64; index++) void f.worker.call('api', ['held', [index]]).catch(() => {});
        try { await f.worker.call('api', ['overflow', []]); } catch (error) { overflow = error.code; }
        if (rejected) throw Object.assign(Error('original'), { code: 'plugin_original_failure' });
        return { success: true, content: 'original result' };
    });
    if (rejected) await assert.rejects(callback(), { code: 'plugin_original_failure' });
    else assert.deepEqual(await callback(), { success: true, content: 'original result' });
    assert.equal(f.calls.length, 64);
    assert.equal(overflow, 'plugin_rpc_pending_limit');
    assert.deepEqual(f.warnings, ['settlement']);
    assert.deepEqual(f.fatals, []);
    assert.equal(f.frames.filter(frame => frame.kind === 'return' && frame.settlementExpired === true).length, 1);
});

test('mandatory settlement publication completes before the original callback resolves', async t => {
    let reportBegan, releaseReport;
    const began = new Promise(resolve => { reportBegan = resolve; });
    const heldReport = new Promise(resolve => { releaseReport = resolve; });
    const f = fixture(t, { report: async () => { reportBegan(); await heldReport; } });
    const callback = await f.register(() => { void f.worker.call('api', ['held', []]).catch(() => {}); return 'original'; });
    let finished = false;
    const result = callback().then(value => { finished = true; return value; });
    t.after(() => releaseReport());
    await began;
    assert.equal(finished, false);
    releaseReport();
    assert.equal(await result, 'original');
});

test('mandatory settlement publication failure rejects rather than inventing callback success', async t => {
    const f = fixture(t, { report: () => { throw Object.assign(Error('storage'), { code: 'plugin_notification_unavailable' }); } });
    const callback = await f.register(() => { void f.worker.call('api', ['held', []]).catch(() => {}); return 'original'; });
    await assert.rejects(callback(), { code: 'plugin_notification_unavailable' });
    assert.deepEqual(f.warnings, ['settlement']);
});

test('a forged settlement flag on an API return never reaches the notification owner', async t => {
    const f = fixture(t, { mutate: frame => frame.kind === 'return' ? { ...frame, settlementExpired: true } : frame });
    const pending = f.parent.call('ordinary', []);
    await assert.rejects(pending, { code: 'plugin_rpc_protocol_invalid' });
    assert.deepEqual(f.warnings, []);
});

for (const flag of [false, 'yes', 1, null]) test(`callback settlement metadata rejects an invalid marker ${JSON.stringify(flag)}`, async t => {
    const f = fixture(t, { mutate: frame => frame.kind === 'return' ? { ...frame, settlementExpired: flag } : frame });
    const callback = await f.register(() => 'original');
    await assert.rejects(callback(), { code: 'plugin_rpc_protocol_invalid' });
    assert.deepEqual(f.warnings, []);
});

test('a worker cannot accept settlement metadata sent in the opposite direction', async t => {
    let remoteCallback;
    const f = fixture(t, { workerDispatch: (_method, args) => { remoteCallback = args[0]; },
        mutateParent: frame => frame.kind === 'return' ? { ...frame, settlementExpired: true } : frame });
    await f.parent.call('register-parent', [() => 'ordinary reply']);
    await assert.rejects(remoteCallback(), { code: 'plugin_rpc_protocol_invalid' });
    assert.deepEqual(f.warnings, []);
});

test('the receiving peer still rejects a 65th concurrent incoming call', async t => {
    const f = fixture(t);
    for (let id = 1; id <= 65; id++) f.parent.receive({ v: 1, kind: 'call', id,
        method: 'held', args: ['array', []], context: 'synthetic-live-context' });
    assert.deepEqual(f.fatals, ['plugin_rpc_protocol_invalid']);
    assert.deepEqual(f.warnings, []);
});
