'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPluginPeer } = require('../patches/lazy-chat-bg-adapter/files-1.10/server/node/bgPluginWorker.cjs');
const cap = 8 * 1024 * 1024;
const failure = code => Object.assign(new Error(code), { code });
function pair(mode = 'bytes', workerDispatch) {
    const calls = [], refused = [], fatal = [], sent = [];
    let worker;
    const parent = createPluginPeer({ send: frame => queueMicrotask(() => worker.receive(frame)),
        runContext: (context, task) => { assert.equal(context, 'active-scope'); return task(); },
        dispatch(method, args) {
            if (method === 'api_local_limit') { refused.push(args[0]); throw failure(args[0]); }
            calls.push(args); return 'ok';
        } });
    worker = createPluginPeer({ localCallLimits: true, dispatch: workerDispatch, getContext: () => 'active-scope', onFatal: code => fatal.push(code),
        send: frame => {
            const bytes = Buffer.byteLength(JSON.stringify(frame) + '\n'); sent.push({ id: frame.id, method: frame.method, bytes });
            if (mode === 'backpressure') throw failure('plugin_rpc_frame_limit');
            if (bytes > cap) throw Object.assign(failure('plugin_rpc_frame_limit'), { oversize: true });
            queueMicrotask(() => parent.receive(frame));
        } });
    return { parent, worker, calls, refused, fatal, sent, close() { worker.close(); parent.close(); } };
}
for (const delta of [-1, 0, 1]) test(`worker call frame boundary ${delta} preserves its one pending call`, async t => {
    const p = pair(); t.after(() => p.close());
    const overhead = Buffer.byteLength(JSON.stringify({ v: 1, kind: 'call', id: 1, method: 'api',
        args: ['array', [['value', '']]], context: 'active-scope' }) + '\n');
    const call = p.worker.call('api', ['x'.repeat(cap + delta - overhead)]);
    if (delta > 0) {
        await assert.rejects(call, { code: 'plugin_rpc_frame_limit' });
        assert.deepEqual(p.refused, ['plugin_rpc_frame_limit']); assert.equal(p.calls.length, 0);
        assert.deepEqual(p.sent.map(x => x.id), [1, 1]); assert.equal(p.sent[1].method, 'api_local_limit');
    } else { assert.equal(await call, 'ok'); assert.equal(p.calls.length, 1); assert.deepEqual(p.refused, []); }
    assert.equal(p.sent[0].bytes, cap + delta); assert.deepEqual(p.fatal, []);
    assert.equal(await p.worker.call('api', ['small']), 'ok'); assert.equal(p.worker.stats().pending, 0);
});
test('value packing refusal uses one id and preserves a later valid call', async t => {
    const p = pair(); t.after(() => p.close());
    await assert.rejects(p.worker.call('api', [Array(100001).fill(0)]), { code: 'plugin_rpc_value_limit' });
    assert.equal(p.sent.length, 1); assert.equal(p.sent[0].id, 1); assert.equal(p.sent[0].method, 'api_local_limit');
    assert.equal(p.calls.length, 0); assert.deepEqual(p.refused, ['plugin_rpc_value_limit']);
    assert.equal(await p.worker.call('api', ['small']), 'ok'); assert.deepEqual(p.fatal, []);
});
test('backpressure without a pre-write oversize marker remains fatal', async t => {
    const p = pair('backpressure'); t.after(() => p.close());
    await assert.rejects(p.worker.call('api', ['small']), { code: 'plugin_rpc_frame_limit' });
    assert.equal(p.sent.length, 1); assert.deepEqual(p.fatal, ['plugin_rpc_frame_limit']); assert.deepEqual(p.refused, []);
    await assert.rejects(p.worker.call('api', ['next']), { code: 'plugin_rpc_closed' });
});
test('large worker return keeps its existing small error reply without becoming a local-call report', async t => {
    const p = pair('bytes', () => 'x'.repeat(9 * 1024 * 1024)); t.after(() => p.close());
    await assert.rejects(p.parent.call('returnLarge', [], 'active-scope'), { code: 'plugin_rpc_frame_limit' });
    assert.deepEqual(p.refused, []); assert.deepEqual(p.fatal, []);
    assert.equal(await p.worker.call('api', ['small']), 'ok');
});
