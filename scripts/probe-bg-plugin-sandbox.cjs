'use strict';
// Explicit Linux/systemd integration probe, not part of portable patcher tests.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const dns = require('node:dns');
const { spawn, execFileSync } = require('node:child_process');
const { realpathSync } = require('node:fs');
const { createPluginSandbox, sandboxCommand, MAX_FRAME_BYTES } = require('../patches/lazy-chat-bg-adapter/files-1.10/server/node/bgPluginSandbox.cjs');
const { judgeNetwork } = require('./fixtures/bg-plugin-sandbox-network-judgment.cjs');
const workerPath = path.join(__dirname, 'fixtures/bg-plugin-sandbox-worker.cjs');
const EXTERNAL_IP = '1.1.1.1';
const EXTERNAL_PORT = 443;
const DNS_NAME = 'example.com';

function tcpErrorCode(host, port) {
    return new Promise(resolve => {
        const socket = net.createConnection({ host, port });
        let settled = false;
        const finish = code => {
            if (settled) return;
            settled = true;
            socket.destroy();
            resolve(code);
        };
        socket.setTimeout(3000, () => finish('ETIMEDOUT'));
        socket.once('connect', () => finish(null));
        socket.once('error', error => finish(error.code ?? 'UNKNOWN'));
    });
}

function dnsErrorCode(hostname) {
    return new Promise(resolve => {
        const timer = setTimeout(() => resolve('ETIMEDOUT'), 3000);
        dns.lookup(hostname, error => {
            clearTimeout(timer);
            resolve(error ? (error.code ?? 'UNKNOWN') : null);
        });
    });
}

function listen(server) {
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            server.off('error', reject);
            resolve();
        });
    });
}

function close(server) {
    return new Promise(resolve => server.close(resolve));
}

async function withLoopbackListener(action) {
    const listener = net.createServer(socket => socket.destroy());
    try {
        await listen(listener);
        return await action(listener);
    } finally {
        await close(listener);
    }
}

async function start(runtimeMs = 5000, signal) {
    const frames = [];
    let ready;
    const loaded = new Promise(resolve => { ready = resolve; });
    const sandbox = await createPluginSandbox({ workerPath, runtimeMs, signal, onFrame(frame) {
        frames.push(frame);
        if (frame.ready) ready();
    } });
    await Promise.race([loaded, sandbox.closed.then(result => {
        throw new Error(`sandbox did not start: ${result.error}`);
    })]);
    return { sandbox, frames };
}

test('[unchanged] restricted child can only use bounded parent pipes', async () => {
    let sandbox;
    await withLoopbackListener(async listener => {
        try {
            const loopbackPort = listener.address().port;
            const nodeMajor = Number(process.versions.node.split('.')[0]);
            const controls = nodeMajor === 24
                ? {
                    loopback: await tcpErrorCode('127.0.0.1', loopbackPort),
                    externalIp: await tcpErrorCode(EXTERNAL_IP, EXTERNAL_PORT),
                    dns: await dnsErrorCode(DNS_NAME),
                }
                : { loopback: null, externalIp: null, dns: null };
            const started = await start();
            ({ sandbox } = started);
            const { frames } = started;
            sandbox.send({ kind: 'permissions', network: { loopbackPort,
                externalIp: EXTERNAL_IP, externalPort: EXTERNAL_PORT, dnsName: DNS_NAME } });
            const deadline = Date.now() + 3000;
            while (frames.length < 2 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
            assert.deepEqual(frames[1].denied, { read: true, write: true, spawn: true, worker: true });
            assert.deepEqual(frames[1].environmentKeys, ['PWD']);
            assert.deepEqual(judgeNetwork(nodeMajor, controls, frames[1].network),
                { blocked: true, reason: null, check: null });
            sandbox.send({ kind: 'exit' });
            assert.deepEqual(await sandbox.closed, { code: 0, signal: null, error: null });
            assert.throws(() => sandbox.send({ kind: 'permissions' }), { code: 'plugin_sandbox_closed' });
        } finally {
            if (sandbox) { sandbox.stop(); await sandbox.closed; }
        }
    });
});

describe('[E1-1] Allow the plugin sandbox on Node 24', { concurrency: false }, () => {
    test('[unchanged] closes the host loopback listener when a probe step fails', async () => {
        const failure = new Error('synthetic probe failure');
        let listener;
        await assert.rejects(withLoopbackListener(async value => {
            listener = value;
            assert.equal(listener.listening, true);
            throw failure;
        }), error => error === failure);
        assert.equal(listener.listening, false);
    });

    test('[new] builds the same pinned command on Node 24 and Node 25', async () => {
        const descriptor = Object.getOwnPropertyDescriptor(process, 'versions');
        const build = async version => {
            Object.defineProperty(process, 'versions', {
                value: { ...process.versions, node: version }, configurable: true,
            });
            try { return await sandboxCommand(workerPath, 10000); }
            finally { Object.defineProperty(process, 'versions', descriptor); }
        };
        const node24 = await build('24.0.0');
        const node25 = await build('25.0.0');
        const normalize = command => command.args.map(arg => arg === `--unit=${command.unit}` ? '--unit=<unit>' : arg);

        assert.equal(node24.executable, '/usr/bin/systemd-run');
        assert.equal(node25.executable, node24.executable);
        assert.deepEqual(node25.env, node24.env);
        assert.notEqual(node25.unit, node24.unit);
        assert.deepEqual(normalize(node25), normalize(node24));

        const node = realpathSync(process.execPath);
        const worker = realpathSync(workerPath);
        const prefix = ['--user', '--scope', '--quiet', '--collect', `--unit=${node24.unit}`,
            '--slice=pocketrisu-bg-plugin.slice', '-p', 'MemoryMax=512M', '-p', 'MemorySwapMax=0',
            '-p', 'TasksMax=24', '-p', 'CPUQuota=100%', '-p', 'RuntimeMaxSec=10000ms',
            '-p', 'TimeoutStopSec=1s', '-p', 'KillMode=control-group', '/usr/bin/prlimit',
            '--nofile=128:128', '--core=0:0', '--', '/usr/bin/bwrap', '--unshare-all',
            '--unshare-user', '--disable-userns', '--die-with-parent', '--new-session', '--cap-drop',
            'ALL', '--clearenv', '--proc', '/proc', '--dev', '/dev', '--size', '16777216',
            '--tmpfs', '/tmp', '--chdir', '/tmp', '--ro-bind', node, '/node', '--ro-bind', worker, '/worker.cjs'];
        assert.deepEqual(node24.args.slice(0, prefix.length), prefix);
        const suffixIndex = node24.args.lastIndexOf('--');
        const libraryArgs = node24.args.slice(prefix.length, suffixIndex);
        assert.ok(libraryArgs.length > 0 && libraryArgs.length % 3 === 0);
        for (let index = 0; index < libraryArgs.length; index += 3) {
            assert.equal(libraryArgs[index], '--ro-bind');
            assert.equal(libraryArgs[index + 1], libraryArgs[index + 2]);
            assert.ok(path.isAbsolute(libraryArgs[index + 1]));
        }
        assert.deepEqual(node24.args.slice(suffixIndex), ['--', '/node', '--permission',
            '--allow-fs-read=/worker.cjs', '--max-old-space-size=256', '/worker.cjs', '10000']);
    });
});

for (const [kind, reason] of [['malformed', 'protocol_invalid'], ['oversized', 'frame_limit'],
    ['flood', 'rate_limit']]) {
    test(`[unchanged] rejects ${kind} output without exposing child text`, async () => {
        const { sandbox } = await start();
        sandbox.send({ kind });
        assert.equal((await sandbox.closed).error, `plugin_sandbox_${reason}`);
    });
}

test('[unchanged] parent bounds each outbound frame', async () => {
    const { sandbox } = await start();
    assert.throws(() => sandbox.send({ data: 'x'.repeat(MAX_FRAME_BYTES) }), { code: 'plugin_sandbox_frame_limit' });
    assert.equal((await sandbox.closed).error, 'plugin_sandbox_frame_limit');
});

test('[unchanged] synchronous loop cannot evade parent deadline', async () => {
    const { sandbox } = await start(1500);
    sandbox.send({ kind: 'loop' });
    assert.equal((await sandbox.closed).error, 'plugin_sandbox_timeout');
});

test('[unchanged] abort terminates a synchronous loop', async () => {
    const controller = new AbortController();
    const { sandbox } = await start(5000, controller.signal);
    sandbox.send({ kind: 'loop' });
    controller.abort();
    assert.equal((await sandbox.closed).error, 'plugin_sandbox_aborted');
});

test('[unchanged] native Buffer memory is bounded independently of the V8 heap', async () => {
    const command = await sandboxCommand(workerPath, 5000);
    // Keep only this diagnostic unit's failure receipt until it has been read.
    // Resource limits and executable/mount arguments are the production command.
    const args = command.args.filter(arg => arg !== '--collect');
    assert.equal(command.args.length - args.length, 1);
    const child = spawn(command.executable, args, { env: command.env, cwd: '/', stdio: ['ignore', 'ignore', 'ignore', 'pipe'] });
    const exited = new Promise(resolve => child.once('close', resolve));
    try {
        await new Promise((resolve, reject) => {
            let bytes = '';
            child.once('error', reject);
            child.once('close', () => reject(new Error('memory probe exited before ready')));
            child.stdio[3].on('data', chunk => { bytes += chunk; if (bytes.includes('\n')) resolve(); });
        });
        const group = execFileSync('/usr/bin/systemctl', ['--user', 'show', command.unit, '-p', 'ControlGroup', '--value'], { encoding: 'utf8' }).trim();
        assert.ok(group);
        assert.equal(fs.readFileSync(`/sys/fs/cgroup${group}/memory.max`, 'utf8').trim(), '536870912');
        const slice = path.dirname(group);
        assert.equal(fs.readFileSync(`/sys/fs/cgroup${slice}/memory.max`, 'utf8').trim(), '1073741824');
        const [quota, period] = fs.readFileSync(`/sys/fs/cgroup${slice}/cpu.max`, 'utf8').trim().split(' ').map(Number);
        assert.equal(quota, period);
        child.stdio[3].write(JSON.stringify({ kind: 'memory' }) + '\n');
        await exited;
        const result = execFileSync('/usr/bin/systemctl', ['--user', 'show', command.unit, '-p', 'Result', '--value'], { encoding: 'utf8' }).trim();
        assert.equal(result, 'oom-kill');
    } finally {
        child.kill('SIGKILL'); await exited;
        try { execFileSync('/usr/bin/systemctl', ['--user', 'reset-failed', command.unit], { stdio: 'ignore' }); } catch {}
    }
});

test('[unchanged] abrupt parent death kills the namespace without the child event loop', async () => {
    const modulePath = require.resolve('../patches/lazy-chat-bg-adapter/files-1.10/server/node/bgPluginSandbox.cjs');
    const launcher = spawn(process.execPath, ['-e', `
        const {createPluginSandbox}=require(process.argv[1]);
        let sandbox; createPluginSandbox({workerPath:process.argv[2],runtimeMs:5000,onFrame(frame){
            if(frame.ready){sandbox.send({kind:'loop'});console.log(JSON.stringify({unit:sandbox.unit}));}
        }}).then(value=>sandbox=value);
    `, modulePath, workerPath], { stdio: ['ignore', 'pipe', 'ignore'] });
    let unit;
    try {
        unit = await new Promise((resolve, reject) => {
            let output = '';
            const timer = setTimeout(() => reject(new Error('launcher timeout')), 4000);
            launcher.stdout.on('data', chunk => {
                output += chunk;
                if (output.includes('\n')) { clearTimeout(timer); resolve(JSON.parse(output.split('\n')[0]).unit); }
            });
            launcher.once('exit', () => { clearTimeout(timer); reject(new Error('launcher exited early')); });
        });
        assert.match(unit, /^pocketrisu-bg-plugin-[a-f0-9-]+\.scope$/);
        const show = () => execFileSync('/usr/bin/systemctl', ['--user', 'show', unit, '-p', 'ControlGroup', '-p', 'ActiveState'], { encoding: 'utf8' });
        const group = show().match(/^ControlGroup=(.+)$/m)?.[1];
        assert.ok(group);
        const pids = fs.readFileSync(`/sys/fs/cgroup${group}/cgroup.procs`, 'utf8').trim().split(/\s+/).map(Number);
        assert.ok(pids.length >= 2);
        launcher.kill('SIGKILL');
        const alive = pid => {
            try { return fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ')[0] !== 'Z'; }
            catch (error) { if (error.code === 'ENOENT') return false; throw error; }
        };
        const deadline = Date.now() + 2000;
        while (pids.some(alive) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
        assert.deepEqual(pids.filter(alive), []);
        assert.match(show(), /ActiveState=inactive/);
    } finally {
        launcher.kill('SIGKILL');
        if (unit) {
            try { execFileSync('/usr/bin/systemctl', ['--user', 'kill', '--signal=SIGKILL', unit], { stdio: 'ignore' }); } catch {}
        }
    }
});

test('[unchanged] ordinary console output cannot corrupt the dedicated RPC channel', async () => {
    const { sandbox, frames } = await start();
    sandbox.send({ kind: 'console' });
    const deadline = Date.now() + 2000;
    while (frames.length < 2 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
    assert.deepEqual(frames[1], { logged: true });
    sandbox.send({ kind: 'exit' });
    assert.equal((await sandbox.closed).error, null);
});

test('[unchanged] raw diagnostics do not reach the parent or cause RPC failure', async () => {
    const { sandbox } = await start();
    sandbox.send({ kind: 'stderr' });
    sandbox.send({ kind: 'exit' });
    assert.equal((await sandbox.closed).error, null);
});

test('[unchanged] setup errors expose a fixed code rather than host paths', async () => {
    await assert.rejects(createPluginSandbox({ workerPath: path.join(__dirname, 'absent-worker.cjs'), onFrame() {} }),
        error => error.code === 'plugin_sandbox_worker_invalid' && error.message === error.code);
});

test('[unchanged] untrusted large valid frames are limited by bytes as well as count', async () => {
    const { sandbox } = await start();
    sandbox.send({ kind: 'bytes' });
    assert.equal((await sandbox.closed).error, 'plugin_sandbox_byte_rate_limit');
});

test('[unchanged] nonreading child cannot accumulate an unbounded parent write queue', async () => {
    const { sandbox } = await start();
    sandbox.send({ kind: 'loop' });
    const frame = { data: 'x'.repeat(1024 * 1024) };
    assert.throws(() => { for (let i = 0; i < 32; i++) sandbox.send(frame); }, { code: 'plugin_sandbox_backpressure' });
    assert.equal((await sandbox.closed).error, 'plugin_sandbox_backpressure');
});

test('[unchanged] trusted handler failure is distinct from malformed plugin frames', async () => {
    const sandbox = await createPluginSandbox({ workerPath, runtimeMs: 3000, onFrame() { throw new Error('private'); } });
    assert.equal((await sandbox.closed).error, 'plugin_sandbox_host_handler_failed');
});
