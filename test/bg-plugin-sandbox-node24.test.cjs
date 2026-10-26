'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { Worker } = require('node:worker_threads');
const { sandboxCommand } = require('../patches/lazy-chat-bg-adapter/files-1.10/server/node/bgPluginSandbox.cjs');
const { judgeNetwork } = require('../scripts/fixtures/bg-plugin-sandbox-network-judgment.cjs');

const workerPath = path.join(__dirname, '../scripts/fixtures/bg-plugin-sandbox-worker.cjs');
const unsupported = 'plugin_sandbox_environment_unsupported';

async function withProcessProperty(name, value, action) {
    const descriptor = Object.getOwnPropertyDescriptor(process, name);
    Object.defineProperty(process, name, { value, configurable: true });
    try { return await action(); }
    finally { Object.defineProperty(process, name, descriptor); }
}

function withNodeVersion(version, action) {
    return withProcessProperty('versions', { ...process.versions, node: version }, action);
}

async function assertNotRejectedAsUnsupported(version, runtimeMs = 5000) {
    await withNodeVersion(version, async () => {
        try { await sandboxCommand(workerPath, runtimeMs); }
        catch (error) { assert.notEqual(error.code, unsupported); }
    });
}

async function assertRejectedAsUnsupported(version, runtimeMs = 5000) {
    await withNodeVersion(version, () => assert.rejects(sandboxCommand(workerPath, runtimeMs), { code: unsupported }));
}

describe('[E1-1] Allow the plugin sandbox on Node 24', { concurrency: false }, () => {
    test('[new] accepts the Node 24 minimum boundary before host setup', async () => {
        await assertNotRejectedAsUnsupported('24.0.0');
    });

    test('[new] accepts Node 24 point and prerelease versions before host setup', async () => {
        for (const version of ['24.11.1', '24.0.0-rc.1']) await assertNotRejectedAsUnsupported(version);
    });

    test('[unchanged] accepts Node 25 and later before host setup', async () => {
        for (const version of ['25.0.0', '26.1.0']) await assertNotRejectedAsUnsupported(version);
    });

    test('[unchanged] rejects Node 23 and older supported-format versions', async () => {
        for (const version of ['23.99.99', '23.0.0', '22.12.0', '20.18.0']) {
            await assertRejectedAsUnsupported(version);
        }
    });

    test('[unchanged] rejects non-Linux platforms on Node 24 and 25', async () => {
        for (const platform of ['darwin', 'win32']) {
            for (const version of ['24.5.0', '25.0.0']) {
                await withProcessProperty('platform', platform, () => assertRejectedAsUnsupported(version));
            }
        }
    });

    test('[unchanged] rejects a Node 24 worker-thread invocation', async () => {
        const modulePath = require.resolve('../patches/lazy-chat-bg-adapter/files-1.10/server/node/bgPluginSandbox.cjs');
        const result = await new Promise((resolve, reject) => {
            const worker = new Worker(`
                const { parentPort, workerData } = require('node:worker_threads');
                Object.defineProperty(process, 'versions', {
                    value: { ...process.versions, node: '24.0.0' }, configurable: true
                });
                Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
                require(workerData.modulePath).sandboxCommand(workerData.workerPath, 5000)
                    .then(() => parentPort.postMessage(null), error => parentPort.postMessage(error.code));
            `, { eval: true, workerData: { modulePath, workerPath } });
            worker.once('message', resolve);
            worker.once('error', reject);
        });
        assert.equal(result, unsupported);
    });

    test('[unchanged] preserves runtime validation on Node 24', async () => {
        for (const runtimeMs of [99, 900001, NaN, Infinity, -1]) {
            await assertRejectedAsUnsupported('24.0.0', runtimeMs);
        }
    });

    test('[new] accepts runtime boundaries on Node 24 before host setup', async () => {
        for (const runtimeMs of [100, 900000]) await assertNotRejectedAsUnsupported('24.0.0', runtimeMs);
    });

    test('[unchanged] Node 25+ only accepts ERR_ACCESS_DENIED as network blocking', () => {
        const controls = { loopback: null, externalIp: null, dns: null };
        assert.deepEqual(judgeNetwork(25, controls, { loopback: 'ERR_ACCESS_DENIED' }),
            { blocked: true, reason: null, check: null });
        assert.deepEqual(judgeNetwork(25, { ...controls, loopback: 'CONTROL_FAILED' },
            { loopback: 'ERR_ACCESS_DENIED' }), { blocked: true, reason: null, check: null });
        for (const code of ['ECONNREFUSED', 'ENETUNREACH', 'EAI_AGAIN', null]) {
            assert.deepEqual(judgeNetwork(25, controls, { loopback: code }),
                { blocked: false, reason: 'sandbox_network_not_blocked', check: 'loopback' });
        }
    });

    test('[unchanged] Node 24 accepts only the namespace-specific network failures', () => {
        const controls = { loopback: null, externalIp: null, dns: null };
        const sandbox = { loopback: 'ECONNREFUSED', externalIp: 'ENETUNREACH', dns: 'EAI_AGAIN' };
        assert.deepEqual(judgeNetwork(24, controls, sandbox), { blocked: true, reason: null, check: null });

        for (const [check, codes] of Object.entries({
            loopback: ['ETIMEDOUT', 'EACCES', 'ERR_ACCESS_DENIED', null],
            externalIp: ['ECONNREFUSED', 'ETIMEDOUT', 'ERR_ACCESS_DENIED', null],
            dns: ['ENOTFOUND', 'ESERVFAIL', 'ERR_ACCESS_DENIED', null],
        })) {
            for (const code of codes) {
                assert.deepEqual(judgeNetwork(24, controls, { ...sandbox, [check]: code }),
                    { blocked: false, reason: 'sandbox_network_not_blocked', check });
            }
        }
    });

    test('[unchanged] failed host controls are probe failures', () => {
        const sandbox = { loopback: 'ECONNREFUSED', externalIp: 'ENETUNREACH', dns: 'EAI_AGAIN' };
        for (const check of ['loopback', 'externalIp', 'dns']) {
            const controls = { loopback: null, externalIp: null, dns: null, [check]: 'CONTROL_FAILED' };
            assert.deepEqual(judgeNetwork(24, controls, sandbox),
                { blocked: false, reason: 'control_failed', check });
        }
    });
});
