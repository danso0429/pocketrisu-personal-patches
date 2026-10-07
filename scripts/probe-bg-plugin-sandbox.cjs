'use strict';
// Explicit Linux/systemd integration probe, not part of portable patcher tests.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawn, execFileSync } = require('node:child_process');
const { createPluginSandbox, sandboxCommand, MAX_FRAME_BYTES } = require('../patches/lazy-chat-bg-adapter/files-1.10/server/node/bgPluginSandbox.cjs');
const workerPath = path.join(__dirname, 'fixtures/bg-plugin-sandbox-worker.cjs');

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

test('restricted child can only use bounded parent pipes', async () => {
    const { sandbox, frames } = await start();
    try {
        sandbox.send({ kind: 'permissions' });
        const deadline = Date.now() + 3000;
        while (frames.length < 2 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
        assert.deepEqual(frames[1], { denied: { read: true, write: true, spawn: true, worker: true, network: true }, environmentKeys: ['PWD'] });
        sandbox.send({ kind: 'exit' });
        assert.deepEqual(await sandbox.closed, { code: 0, signal: null, error: null });
        assert.throws(() => sandbox.send({ kind: 'permissions' }), { code: 'plugin_sandbox_closed' });
    } finally { sandbox.stop(); await sandbox.closed; }
});

for (const [kind, reason] of [['malformed', 'protocol_invalid'], ['oversized', 'frame_limit'],
    ['flood', 'rate_limit']]) {
    test(`rejects ${kind} output without exposing child text`, async () => {
        const { sandbox } = await start();
        sandbox.send({ kind });
        assert.equal((await sandbox.closed).error, `plugin_sandbox_${reason}`);
    });
}

test('parent bounds each outbound frame', async () => {
    const { sandbox } = await start();
    assert.throws(() => sandbox.send({ data: 'x'.repeat(MAX_FRAME_BYTES) }), { code: 'plugin_sandbox_frame_limit' });
    assert.equal((await sandbox.closed).error, 'plugin_sandbox_frame_limit');
});

test('synchronous loop cannot evade parent deadline', async () => {
    const { sandbox } = await start(1500);
    sandbox.send({ kind: 'loop' });
    assert.equal((await sandbox.closed).error, 'plugin_sandbox_timeout');
});

test('abort terminates a synchronous loop', async () => {
    const controller = new AbortController();
    const { sandbox } = await start(5000, controller.signal);
    sandbox.send({ kind: 'loop' });
    controller.abort();
    assert.equal((await sandbox.closed).error, 'plugin_sandbox_aborted');
});

test('native Buffer memory is bounded independently of the V8 heap', async () => {
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
        assert.equal(fs.readFileSync(`/sys/fs/cgroup${group}/memory.max`, 'utf8').trim(), '268435456');
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

test('abrupt parent death kills the namespace without the child event loop', async () => {
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

test('ordinary console output cannot corrupt the dedicated RPC channel', async () => {
    const { sandbox, frames } = await start();
    sandbox.send({ kind: 'console' });
    const deadline = Date.now() + 2000;
    while (frames.length < 2 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
    assert.deepEqual(frames[1], { logged: true });
    sandbox.send({ kind: 'exit' });
    assert.equal((await sandbox.closed).error, null);
});

test('raw diagnostics do not reach the parent or cause RPC failure', async () => {
    const { sandbox } = await start();
    sandbox.send({ kind: 'stderr' });
    sandbox.send({ kind: 'exit' });
    assert.equal((await sandbox.closed).error, null);
});

test('setup errors expose a fixed code rather than host paths', async () => {
    await assert.rejects(createPluginSandbox({ workerPath: path.join(__dirname, 'absent-worker.cjs'), onFrame() {} }),
        error => error.code === 'plugin_sandbox_worker_invalid' && error.message === error.code);
});

test('untrusted large valid frames are limited by bytes as well as count', async () => {
    const { sandbox } = await start();
    sandbox.send({ kind: 'bytes' });
    assert.equal((await sandbox.closed).error, 'plugin_sandbox_byte_rate_limit');
});

test('nonreading child cannot accumulate an unbounded parent write queue', async () => {
    const { sandbox } = await start();
    sandbox.send({ kind: 'loop' });
    const frame = { data: 'x'.repeat(1024 * 1024) };
    assert.throws(() => { for (let i = 0; i < 32; i++) sandbox.send(frame); }, { code: 'plugin_sandbox_backpressure' });
    assert.equal((await sandbox.closed).error, 'plugin_sandbox_backpressure');
});

test('trusted handler failure is distinct from malformed plugin frames', async () => {
    const sandbox = await createPluginSandbox({ workerPath, runtimeMs: 3000, onFrame() { throw new Error('private'); } });
    assert.equal((await sandbox.closed).error, 'plugin_sandbox_host_handler_failed');
});
