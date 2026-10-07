'use strict';

const { spawn, execFile } = require('node:child_process');
const { realpathSync, statSync } = require('node:fs');
const { randomUUID } = require('node:crypto');
const { isMainThread } = require('node:worker_threads');
const { promisify } = require('node:util');
const { performance } = require('node:perf_hooks');

const MAX_FRAME_BYTES = 8 * 1024 * 1024;
const MAX_PENDING_BYTES = 16 * 1024 * 1024;
const MAX_FRAMES_PER_SECOND = 8192;
const MAX_BYTES_PER_SECOND = 16 * 1024 * 1024;
let aggregateWindow = performance.now(), aggregateBytes = 0;
let linkagePromise;
let budgetPromise;

function sandboxError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
}

function checked(code, action) {
    try { return action(); }
    catch { throw sandboxError(code); }
}

// Only trusted host configuration reaches this function. Plugin-provided values
// must never select a mount, executable, unit name, environment or resource cap.
async function sandboxCommand(workerPath, runtimeMs) {
    if (process.platform !== 'linux' || Number(process.versions.node.split('.')[0]) < 25
        || !isMainThread || !Number.isSafeInteger(runtimeMs) || runtimeMs < 100 || runtimeMs > 900_000) {
        throw sandboxError('plugin_sandbox_environment_unsupported');
    }
    const worker = checked('plugin_sandbox_worker_invalid', () => {
        const resolved = realpathSync(workerPath);
        if (!statSync(resolved).isFile()) throw new Error();
        return resolved;
    });
    const node = checked('plugin_sandbox_linkage_invalid', () => realpathSync(process.execPath));
    const uid = process.getuid();
    const runtime = `/run/user/${uid}`;
    checked('plugin_sandbox_manager_unavailable', () => {
        if (statSync(runtime).uid !== uid || !statSync(`${runtime}/bus`).isSocket()) throw new Error();
    });
    const env = { PATH: '/usr/bin:/bin', XDG_RUNTIME_DIR: runtime,
        DBUS_SESSION_BUS_ADDRESS: `unix:path=${runtime}/bus` };
    // A dedicated slice bounds the sum of all plugin workers, including parallel
    // invocations and separate server processes. It never contains the host app.
    budgetPromise ??= promisify(execFile)('/usr/bin/systemctl', ['--user', 'set-property', '--runtime',
        'pocketrisu-bg-plugin.slice', 'MemoryMax=1G', 'MemorySwapMax=0', 'TasksMax=256', 'CPUQuota=100%'],
    { env, timeout: 5000, maxBuffer: 4096 }).catch(() => {
        budgetPromise = undefined;
        throw sandboxError('plugin_sandbox_budget_unavailable');
    });
    await budgetPromise;
    // ldd examines our trusted running Node executable, never plugin input.
    linkagePromise ??= promisify(execFile)('/usr/bin/ldd', [node], { env, encoding: 'utf8',
        timeout: 5000, maxBuffer: 64 * 1024 }).then(result => result.stdout).catch(() => {
            linkagePromise = undefined;
            throw sandboxError('plugin_sandbox_linkage_invalid');
        });
    const linkage = await linkagePromise;
    const libraries = new Set();
    for (const line of linkage.split('\n')) {
        if (!line.trim() || line.includes('linux-vdso')) continue;
        const match = line.trim().match(/^(?:[^\s]+\s+=>\s+)?(\/[^\s]+)\s+\(0x[0-9a-f]+\)$/);
        checked('plugin_sandbox_linkage_invalid', () => {
            if (!match || !statSync(match[1]).isFile()) throw new Error();
        });
        libraries.add(match[1]);
    }
    if (!libraries.size) throw sandboxError('plugin_sandbox_linkage_invalid');
    const unit = `pocketrisu-bg-plugin-${randomUUID()}.scope`;
    const args = ['--user', '--scope', '--quiet', '--collect', `--unit=${unit}`, '--slice=pocketrisu-bg-plugin.slice',
        '-p', 'MemoryMax=256M', '-p', 'MemorySwapMax=0', '-p', 'TasksMax=24',
        '-p', 'CPUQuota=100%', '-p', `RuntimeMaxSec=${runtimeMs}ms`,
        '-p', 'TimeoutStopSec=1s', '-p', 'KillMode=control-group',
        '/usr/bin/prlimit', '--nofile=128:128', '--core=0:0', '--', '/usr/bin/bwrap',
        '--unshare-all', '--unshare-user', '--disable-userns', '--die-with-parent',
        '--new-session', '--cap-drop', 'ALL', '--clearenv', '--proc', '/proc',
        '--dev', '/dev', '--size', '16777216', '--tmpfs', '/tmp', '--chdir', '/tmp',
        '--ro-bind', node, '/node', '--ro-bind', worker, '/worker.cjs'];
    for (const library of libraries) args.push('--ro-bind', library, library);
    args.push('--', '/node', '--permission', '--allow-fs-read=/worker.cjs',
        '--max-old-space-size=128', '/worker.cjs', String(runtimeMs));
    return { executable: '/usr/bin/systemd-run', args, env, unit };
}

/** Untrusted JSON lines on fd 3; the caller validates each method and capability.
 * Never merge a frame into host state: JSON can contain own __proto__ keys.
 * The self-contained bootstrap must implement console/log notification routing.
 */
async function createPluginSandbox({ workerPath, runtimeMs = 600_000, signal, onFrame }) {
    if (typeof onFrame !== 'function') throw sandboxError('plugin_sandbox_handler_invalid');
    signal?.throwIfAborted();
    const command = await sandboxCommand(workerPath, runtimeMs);
    signal?.throwIfAborted();
    const child = spawn(command.executable, command.args, { env: command.env, cwd: '/',
        stdio: ['ignore', 'ignore', 'ignore', 'pipe'] });
    const channel = child.stdio?.[3];
    let stopped = false, failure = null, pending = Buffer.alloc(0), pendingBytes = 0;
    let aggregateResumeTimer = null;
    let frameWindow = performance.now(), frames = 0, bytesInWindow = 0;
    let resolveClosed;
    const closed = new Promise(resolve => { resolveClosed = resolve; });
    const stopUnit = () => {
        // Exact random unit only. No prefix sweep or authority over other runs.
        const killer = spawn('/usr/bin/systemctl', ['--user', 'kill', '--signal=SIGKILL', command.unit],
            { env: command.env, stdio: 'ignore' });
        killer.on('error', () => {});
        const deadline = setTimeout(() => killer.kill('SIGKILL'), 2000);
        deadline.unref();
        killer.once('close', () => clearTimeout(deadline));
        child.kill('SIGKILL');
    };
    function stop(code = 'plugin_sandbox_closed') {
        if (stopped) return;
        stopped = true;
        failure = sandboxError(code);
        pending = Buffer.alloc(0); pendingBytes = 0;
        channel?.destroy();
        stopUnit();
    }
    const abort = () => stop('plugin_sandbox_aborted');
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const timer = setTimeout(() => stop('plugin_sandbox_timeout'), runtimeMs);
    timer.unref();
    child.on('error', () => stop('plugin_sandbox_start_failed'));
    channel?.on('error', () => stop('plugin_sandbox_pipe_failed'));
    const window = () => {
        if (performance.now() - frameWindow >= 1000) {
            frameWindow = performance.now(); frames = 0; bytesInWindow = 0;
        }
    };
    // Raw stdout/stderr go to /dev/null, not the parent's event loop. The real
    // bootstrap must route intentional log notifications over validated RPC.
    const consume = bytes => {
        if (stopped) return;
        window();
        if (performance.now() - aggregateWindow >= 1000) { aggregateWindow = performance.now(); aggregateBytes = 0; }
        if (aggregateBytes + bytes.length > 64 * 1024 * 1024) {
            channel.pause();
            aggregateResumeTimer = setTimeout(() => {
                aggregateResumeTimer = null;
                if (stopped) return;
                consume(bytes);
                if (aggregateResumeTimer === null && !stopped) channel.resume();
            }, Math.max(1, 1001 - (performance.now() - aggregateWindow)));
            return;
        }
        aggregateBytes += bytes.length;
        bytesInWindow += bytes.length;
        if (bytesInWindow > MAX_BYTES_PER_SECOND) return stop('plugin_sandbox_byte_rate_limit');
        let offset = 0;
        while (!stopped && offset < bytes.length) {
            const newline = bytes.indexOf(10, offset);
            const end = newline < 0 ? bytes.length : newline;
            const piece = bytes.subarray(offset, end);
            const needed = pendingBytes + piece.length;
            if (needed + 1 > MAX_FRAME_BYTES) return stop('plugin_sandbox_frame_limit');
            // Geometric growth avoids quadratic copies and an unbounded array
            // of tiny fragment objects from a deliberately slow sender.
            if (needed > pending.length) {
                const next = Buffer.allocUnsafe(Math.min(MAX_FRAME_BYTES,
                    Math.max(64 * 1024, pending.length * 2, needed)));
                pending.copy(next, 0, 0, pendingBytes);
                pending = next;
            }
            piece.copy(pending, pendingBytes);
            pendingBytes = needed;
            offset = end + 1;
            if (newline < 0) break;
            const raw = pending.subarray(0, pendingBytes);
            pendingBytes = 0;
            if (++frames > MAX_FRAMES_PER_SECOND) return stop('plugin_sandbox_rate_limit');
            let frame;
            try {
                frame = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
                if (!frame || typeof frame !== 'object' || Array.isArray(frame)) throw new Error();
            } catch { stop('plugin_sandbox_protocol_invalid'); break; }
            try {
                // Handler must validate synchronously and own async work bounds.
                const returned = onFrame(frame);
                if (returned?.then) {
                    // Reject the unsupported handler contract without leaving a
                    // rejected Promise to crash the parent process later.
                    Promise.resolve(returned).catch(() => {});
                    throw new Error();
                }
            } catch { stop('plugin_sandbox_host_handler_failed'); }
            if (pending.length > 1024 * 1024) pending = Buffer.alloc(64 * 1024);
        }
    };
    channel?.on('data', consume);
    child.once('close', (code, terminationSignal) => {
        const partial = pendingBytes > 0;
        stopped = true;
        pending = Buffer.alloc(0); pendingBytes = 0;
        clearTimeout(timer);
        clearTimeout(aggregateResumeTimer);
        signal?.removeEventListener('abort', abort);
        resolveClosed({ code, signal: terminationSignal,
            error: failure?.code ?? (partial ? 'plugin_sandbox_partial_frame'
                : code === 0 ? null : 'plugin_sandbox_exited') });
    });
    if (!channel) stop('plugin_sandbox_start_failed');
    return {
        unit: command.unit, closed, stop,
        send(frame) {
            if (stopped) throw failure ?? sandboxError('plugin_sandbox_closed');
            let bytes;
            try { bytes = Buffer.from(JSON.stringify(frame) + '\n'); }
            catch { stop('plugin_sandbox_protocol_invalid'); throw failure; }
            if (bytes.length > MAX_FRAME_BYTES) {
                stop('plugin_sandbox_frame_limit');
                throw failure;
            }
            if (channel.writableLength + bytes.length > MAX_PENDING_BYTES) {
                stop('plugin_sandbox_backpressure');
                throw failure;
            }
            channel.write(bytes);
        },
    };
}

module.exports = { createPluginSandbox, sandboxCommand, MAX_FRAME_BYTES };
