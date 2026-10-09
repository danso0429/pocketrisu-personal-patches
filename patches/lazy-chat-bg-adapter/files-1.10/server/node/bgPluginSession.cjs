'use strict';
const { AsyncLocalStorage } = require('node:async_hooks');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { createPluginSandbox } = require('./bgPluginSandbox.cjs');
const { createPluginPeer } = require('./bgPluginWorker.cjs');

const chain = new AsyncLocalStorage();
const failure = code => Object.assign(new Error(code), { code });

async function createPluginSession({ script, api, signal, onFailure = () => {}, onLateCall = () => {},
    onLocalLimit = async () => {}, runtimeMs = 600_000 }) {
    if (typeof script !== 'string' || Buffer.byteLength(script) > 4 * 1024 * 1024
        || typeof api !== 'function') throw failure('plugin_script_invalid');
    const scopes = new Map(), current = new AsyncLocalStorage();
    let peer, sandbox, stopped = false, failureCode = null;
    const fail = code => {
        if (stopped) return;
        stopped = true; failureCode = code;
        for (const scope of scopes.values()) scope.abort.abort(failure(code));
        peer?.close(code); sandbox?.stop(code); scopes.clear();
        // The owner retains and awaits its durable notice before continuing.
        onFailure(code);
    };
    const find = token => {
        const scope = scopes.get(token);
        if (!scope || stopped) throw failure('plugin_invocation_expired');
        return scope;
    };
    const release = token => {
        const scope = scopes.get(token);
        if (scope && --scope.refs === 0) {
            scopes.delete(token); scope.abort.abort(failure('plugin_invocation_expired'));
        }
    };
    const invoke = async task => {
        if (stopped) throw failure(failureCode ?? 'plugin_session_closed');
        const depth = (chain.getStore() ?? 0) + 1;
        if (depth > 8 || scopes.size >= 64) throw failure('plugin_invocation_limit');
        const token = randomUUID();
        const snapshot = AsyncLocalStorage.snapshot();
        scopes.set(token, { snapshot, refs: 1, depth, abort: new AbortController() });
        try { return await current.run(token, () => chain.run(depth, task)); }
        finally { release(token); }
    };
    // No request-specific ALS is consulted by the socket listener itself.
    // Every incoming method is run under its live parent-owned invocation.
    sandbox = await createPluginSandbox({ workerPath: path.join(__dirname, 'bgPluginWorker.cjs'),
        runtimeMs, signal, onFrame: frame => peer.receive(frame) });
    peer = createPluginPeer({ send: sandbox.send, onFatal: fail, onExpiredContext: onLateCall, invoke, timeoutMs: runtimeMs,
        getContext: () => current.getStore() ?? null,
        runContext(token, task) {
            const scope = find(token);
            return scope.snapshot(() => current.run(token, () => chain.run(scope.depth, task)));
        },
        retainContext(token) {
            find(token).refs++;
            let released = false;
            return () => { if (!released) { released = true; release(token); } };
        },
        dispatch(method, args) {
            find(current.getStore());
            if (method === 'api_local_limit') {
                if (args.length !== 1 || !['plugin_rpc_frame_limit', 'plugin_rpc_value_limit'].includes(args[0])) {
                    throw failure('plugin_api_request_invalid');
                }
                // Untrusted reports can only publish this entry's bounded
                // refusal and reject this call; no API task/effect is run.
                return Promise.resolve(onLocalLimit(args[0])).then(() => { throw failure(args[0]); });
            }
            if (method !== 'api' || args.length !== 2 || typeof args[0] !== 'string'
                || !/^[A-Za-z_][A-Za-z0-9_.]{0,79}$/.test(args[0]) || !Array.isArray(args[1])) {
                throw failure('plugin_api_request_invalid');
            }
            return api(args[0], args[1]);
        },
    });
    void sandbox.closed.then(result => {
        if (!stopped) fail(result.error ?? 'plugin_session_exited');
    });
    return {
        load: () => invoke(() => peer.call('load', [script])),
        assertCurrent: () => find(current.getStore()),
        currentSignal: () => find(current.getStore()).abort.signal,
        async close() {
            if (!stopped) {
                stopped = true;
                for (const scope of scopes.values()) scope.abort.abort(failure('plugin_session_closed'));
                peer.close(); scopes.clear(); sandbox.stop();
            }
            await sandbox.closed;
        },
        get failure() { return failureCode; },
        get activeScopes() { return scopes.size; },
    };
}

module.exports = { createPluginSession, isPluginInvocation: () => (chain.getStore() ?? 0) > 0 };
