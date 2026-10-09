'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { createPluginSession } = require(path.resolve(process.argv[2], 'server/node/bgPluginSession.cjs'));
const script = fs.readFileSync(path.resolve(process.argv[3]), 'utf8');

async function probe(delay) {
    const methods = [], timers = new Set(), failures = [], controller = new AbortController();
    let session;
    const started = performance.now();
    try {
        session = await createPluginSession({ script, signal: controller.signal, runtimeMs: 30000,
            onFailure: code => failures.push(code), api: async (method, args) => {
                methods.push(method);
                if (method === 'registerSetting' && delay) await new Promise(resolve => {
                    const timer = setTimeout(() => { timers.delete(timer); resolve(); }, delay); timers.add(timer);
                });
                if (method === 'addRisuReplacer') {
                    assert.equal(args[0], 'beforeRequest'); assert.equal(typeof args[1], 'function');
                } else assert.ok(['onUnload', 'registerSetting', 'registerButton'].includes(method));
            } });
        if (delay > 15000) {
            await assert.rejects(session.load(), { code: 'plugin_rpc_timeout' });
            assert.deepEqual(failures, ['plugin_rpc_timeout']);
        } else {
            assert.deepEqual(await session.load(), { ready: true });
            assert.deepEqual(methods, ['onUnload', 'addRisuReplacer', 'registerSetting', 'registerButton']);
            assert.deepEqual(failures, []);
            assert.equal(session.activeScopes, 0);
        }
        return { delay, methods, failures, elapsedMs: Math.round(performance.now() - started) };
    } finally { for (const timer of timers) clearTimeout(timer); await session?.close(); }
}

(async () => {
    for (const delay of [0, 50, 2000, 16000]) console.log(JSON.stringify(await probe(delay)));
})().catch(error => { console.error(error); process.exitCode = 1; });
