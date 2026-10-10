'use strict';

// Shared codec and isolated bootstrap. Importing this module in the parent does
// not execute plugin code. The subprocess mounts this one self-contained file.
const fail = code => Object.assign(new Error(code), { code });
const validId = value => Number.isSafeInteger(value) && value > 0;
const immediate = () => new Promise(resolve => setImmediate(resolve));
// Materialization/rollback must not invoke guest-owned instance overrides.
const apply = Reflect.apply;
const signalAborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted').get;
const addListener = EventTarget.prototype.addEventListener, removeListener = EventTarget.prototype.removeEventListener;
const getReader = ReadableStream.prototype.getReader, releaseReader = ReadableStreamDefaultReader.prototype.releaseLock;
const searchString = URLSearchParams.prototype.toString, dateString = Date.prototype.toISOString;
const createObject = Object.create, defineProperty = Object.defineProperty, ownKeys = Object.keys;
const setPrototype = Object.setPrototypeOf, isArray = Array.isArray, stringify = JSON.stringify;
function wireData(value) {
    if (!value || typeof value !== 'object') return value;
    if (isArray(value)) {
        const result = setPrototype([], null);
        for (let index = 0; index < value.length; index++) result[index] = wireData(value[index]);
        return result;
    }
    const result = createObject(null), keys = ownKeys(value);
    for (let index = 0; index < keys.length; index++) result[keys[index]] = wireData(value[keys[index]]);
    return result;
}
function wireJSON() { return wireData(this); }

function createPluginPeer({ send, dispatch, onFatal = () => {}, timeoutMs = 600_000, onExpiredContext = () => {},
    getContext = () => null, runContext = (_context, task) => task(),
    invoke = task => task(), retainContext = () => () => {}, localCallLimits = false }) {
    const pending = new Map(), functions = new Map(), remoteFunctions = new Map();
    const readers = new Map(), signals = new Map(), controllers = new Map();
    const remoteStreams = new Map();
    const ids = new WeakMap(), reverseFunctions = new WeakMap();
    let sequence = 0, handle = 0, lastIncoming = 0, incoming = 0, closed = false, activity = 0;
    const exportSlot = (value, kind, budget) => {
        const slot = kind === 'signal' ? [kind, null, apply(signalAborted, value, [])] : [kind, null];
        let entry = budget.exports.get(value);
        if (!entry) {
            entry = { value, kind, slots: [] };
            budget.exports.set(value, entry);
            const map = kind === 'function' ? functions : kind === 'signal' ? signals : readers;
            if (!ids.has(value) && map.size + ++budget.counts[kind] > (kind === 'stream' ? 64 : 256)) throw fail('plugin_rpc_handle_limit');
        }
        entry.slots.push(slot); return slot;
    };
    const errorCode = error => /^plugin_[a-z0-9_]{1,80}$/.test(error?.code ?? '')
        ? error.code : 'plugin_execution_failed';
    const emit = frame => {
        if (closed) throw fail('plugin_rpc_closed');
        const value = { v: 1, ...frame };
        // Preserve the in-memory frame contract, but keep inherited JSON
        // formatters out of the private wire tree after materialization.
        defineProperty(value, 'toJSON', { value: wireJSON });
        send(value);
    };
    function close(code = 'plugin_rpc_closed') {
        if (closed) return;
        closed = true;
        for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(fail(code)); }
        pending.clear();
        for (const controller of controllers.values()) controller.abort(fail(code));
        for (const entry of signals.values()) apply(removeListener, entry.signal, ['abort', entry.abort]);
        for (const entry of readers.values()) void entry.reader.cancel(code).catch(() => {});
        for (const entry of remoteStreams.values()) { entry.controller?.error(fail(code)); entry.release(); }
        controllers.clear(); signals.clear(); readers.clear(); functions.clear(); remoteFunctions.clear();
        remoteStreams.clear();
    }
    const fatal = code => { close(code); onFatal(code); };

    function pack(value, depth, budget) {
        if (++budget.nodes > 100_000 || depth > 64) throw fail('plugin_rpc_value_limit');
        const child = item => pack(item, depth + 1, budget);
        if (value === undefined) return ['undefined'];
        if (value === null || typeof value === 'boolean' || typeof value === 'string'
            || (typeof value === 'number' && Number.isFinite(value))) return ['value', value];
        if (typeof value === 'function') {
            if (reverseFunctions.has(value)) return ['returnFunction', reverseFunctions.get(value)];
            return exportSlot(value, 'function', budget);
        }
        if (value instanceof AbortSignal) {
            return exportSlot(value, 'signal', budget);
        }
        if (value instanceof Response) {
            const { status, statusText, url, redirected, type, headers, body } = value;
            if (!Number.isInteger(status) || typeof statusText !== 'string' || typeof url !== 'string'
                || typeof redirected !== 'boolean' || typeof type !== 'string') throw fail('plugin_rpc_type_unsupported');
            return ['response', status, statusText, headerPairs(headers), url, redirected, type, child(body)];
        }
        if (value instanceof ReadableStream) {
            return exportSlot(value, 'stream', budget);
        }
        if (value instanceof ArrayBuffer) return ['bytes', 'buffer', Buffer.from(value).toString('base64')];
        if (ArrayBuffer.isView(value)) {
            if (Object.prototype.toString.call(value) !== '[object Uint8Array]') throw fail('plugin_rpc_type_unsupported');
            return ['bytes', 'uint8', Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64')];
        }
        if (value instanceof Headers) return ['headers', headerPairs(value)];
        if (value instanceof URLSearchParams) return ['search', apply(searchString, value, [])];
        if (Array.isArray(value)) {
            if (value.length > 100_000) throw fail('plugin_rpc_value_limit');
            return ['array', Array.from(value, child)];
        }
        if (Object.prototype.toString.call(value) === '[object Date]') return ['date', apply(dateString, value, [])];
        if (typeof value === 'object' && Object.prototype.toString.call(value) === '[object Object]') {
            return ['object', Object.entries(value).map(([key, item]) => [key, child(item)])];
        }
        throw fail('plugin_rpc_type_unsupported');
    }

    function headerPairs(headers) {
        return Array.from(headers, pair => {
            if (!Array.isArray(pair) || pair.length !== 2) throw fail('plugin_rpc_type_unsupported');
            const [name, value] = pair;
            if (typeof name !== 'string' || typeof value !== 'string') throw fail('plugin_rpc_type_unsupported');
            return [name, value];
        });
    }
    function serialize(value) {
        // Encode payload getters/iterators before acquiring resources.
        // Nested calls can publish handles independently. This transaction
        // assumes untampered codec intrinsics; isolation remains the OS process.
        const budget = { nodes: 0, exports: new Map(), counts: { function: 0, signal: 0, stream: 0 } };
        const encoded = pack(value, 0, budget), created = [];
        if (closed) throw fail('plugin_rpc_closed');
        const rollback = () => {
            for (const entry of created.reverse()) {
                ids.delete(entry.value); entry.map.delete(entry.id);
                if (entry.kind === 'stream') apply(releaseReader, entry.resource.reader, []);
                if (entry.kind === 'signal') apply(removeListener, entry.value, ['abort', entry.resource.abort]);
            }
            created.length = 0;
        };
        try {
            for (const entry of budget.exports.values()) {
                let id = ids.get(entry.value);
                if (!id) {
                    const map = entry.kind === 'function' ? functions : entry.kind === 'signal' ? signals : readers;
                    if (map.size >= (entry.kind === 'stream' ? 64 : 256)) throw fail('plugin_rpc_handle_limit');
                    // A locked stream must fail before installing its identity.
                    const resource = entry.kind === 'stream' ? { reader: apply(getReader, entry.value, []), pulling: false, context: getContext() }
                        : entry.kind === 'signal' ? { signal: entry.value, abort: null } : entry.value;
                    id = ++handle;
                    if (entry.kind === 'signal') {
                        resource.abort = () => { if (!closed) emit({ kind: 'abort', handle: id }); };
                        apply(addListener, entry.value, ['abort', resource.abort, { once: true }]);
                    }
                    ids.set(entry.value, id); map.set(id, resource);
                    created.push({ ...entry, id, map, resource });
                }
                for (const slot of entry.slots) {
                    slot[1] = id;
                    if (entry.kind === 'signal') slot[2] = apply(signalAborted, entry.value, []);
                }
            }
        } catch (error) { rollback(); throw error; }
        return { encoded, rollback };
    }

    function unpack(value, depth = 0, budget = { nodes: 0 }) {
        if (++budget.nodes > 100_000 || depth > 64 || !Array.isArray(value)) throw fail('plugin_rpc_value_invalid');
        const child = item => unpack(item, depth + 1, budget);
        const [tag, data] = value;
        if (tag === 'undefined' && value.length === 1) return undefined;
        if (tag === 'value' && value.length === 2 && (data === null || ['string', 'boolean'].includes(typeof data)
            || (typeof data === 'number' && Number.isFinite(data)))) return data;
        if (tag === 'array' && value.length === 2 && Array.isArray(data)) return data.map(child);
        if (tag === 'object' && value.length === 2 && Array.isArray(data)) {
            const result = {};
            for (const pair of data) {
                if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string'
                    || Object.hasOwn(result, pair[0])) throw fail('plugin_rpc_value_invalid');
                const item = child(pair[1]);
                // Never let a forged return value capture a native parent
                // Promise resolver through thenable assimilation.
                if (pair[0] === 'then' && typeof item === 'function') throw fail('plugin_rpc_thenable_unsupported');
                Object.defineProperty(result, pair[0], { value: item, enumerable: true, writable: true, configurable: true });
            }
            return result;
        }
        if (tag === 'function' && value.length === 2 && validId(data)) {
            if (!remoteFunctions.has(data)) {
                if (remoteFunctions.size >= 256) throw fail('plugin_rpc_handle_limit');
                const fn = (...args) => invoke(() => call('_callback', [data, args]));
                remoteFunctions.set(data, fn); reverseFunctions.set(fn, data);
            }
            return remoteFunctions.get(data);
        }
        if (tag === 'returnFunction' && value.length === 2 && functions.has(data)) return functions.get(data);
        if (tag === 'signal' && value.length === 3 && validId(data) && typeof value[2] === 'boolean') {
            if (!controllers.has(data)) {
                if (controllers.size >= 256) throw fail('plugin_rpc_handle_limit');
                controllers.set(data, new AbortController());
            }
            if (value[2]) controllers.get(data).abort(fail('plugin_rpc_aborted'));
            return controllers.get(data).signal;
        }
        if (tag === 'stream' && value.length === 2 && validId(data)) {
            if (remoteStreams.has(data)) return remoteStreams.get(data).stream;
            if (remoteStreams.size >= 64) throw fail('plugin_rpc_handle_limit');
            const context = getContext(), release = retainContext(context);
            const entry = { release, controller: null, stream: null };
            const finish = () => { if (remoteStreams.delete(data)) release(); };
            entry.stream = new ReadableStream({
                start(controller) { entry.controller = controller; },
                async pull(controller) {
                    try {
                        const result = await call('_pull', [data], context);
                        if (!result || typeof result.done !== 'boolean') throw fail('plugin_rpc_stream_invalid');
                        if (result.done) { controller.close(); finish(); } else controller.enqueue(result.value);
                    } catch (error) { controller.error(error); finish(); }
                },
                async cancel() {
                    try { if (!closed) await call('_cancel', [data], context); }
                    finally { finish(); }
                },
            }, { highWaterMark: 0 });
            remoteStreams.set(data, entry);
            return entry.stream;
        }
        if (tag === 'response' && value.length === 8 && Number.isInteger(data)) {
            const body = child(value[7]);
            const response = data === 0 ? Response.error() : new Response(body, { status: data, statusText: value[2], headers: value[3] });
            for (const [key, field] of [['url', value[4]], ['redirected', value[5]], ['type', value[6]]]) {
                if (typeof field !== (key === 'redirected' ? 'boolean' : 'string')) throw fail('plugin_rpc_value_invalid');
                Object.defineProperty(response, key, { value: field });
            }
            return response;
        }
        if (tag === 'bytes' && value.length === 3 && ['buffer', 'uint8'].includes(data)
            && typeof value[2] === 'string' && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value[2])) {
            const bytes = Uint8Array.from(Buffer.from(value[2], 'base64'));
            return data === 'buffer' ? bytes.buffer : bytes;
        }
        if (tag === 'headers' && value.length === 2) return new Headers(data);
        if (tag === 'search' && value.length === 2 && typeof data === 'string') return new URLSearchParams(data);
        if (tag === 'date' && value.length === 2 && typeof data === 'string' && Number.isFinite(Date.parse(data))) return new Date(data);
        throw fail('plugin_rpc_value_invalid');
    }

    function call(method, args, context = getContext()) {
        if (closed) return Promise.reject(fail('plugin_rpc_closed'));
        if (typeof method !== 'string' || !(context === null || typeof context === 'string')) return Promise.reject(fail('plugin_rpc_context_invalid'));
        if (pending.size >= 64) return Promise.reject(fail('plugin_rpc_pending_limit'));
        let encoded, serialization;
        try { serialization = serialize(args); encoded = serialization.encoded; } catch (error) {
            if (closed) return Promise.reject(fail('plugin_rpc_closed'));
            if (!localCallLimits || error?.code !== 'plugin_rpc_value_limit') return Promise.reject(error);
            method = 'api_local_limit'; encoded = ['array', [['value', error.code]]];
        }
        // Encoding may synchronously publish a nested call or close this peer.
        if (closed || pending.size >= 64) {
            serialization?.rollback();
            return Promise.reject(fail(closed ? 'plugin_rpc_closed' : 'plugin_rpc_pending_limit'));
        }
        const id = ++sequence;
        activity++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => fatal('plugin_rpc_timeout'), method === 'load' ? Math.min(timeoutMs, 15_000) : timeoutMs);
            timer.unref?.();
            pending.set(id, { resolve, reject, timer, context });
            try { emit({ kind: 'call', id, method, args: encoded, context }); }
            catch (error) {
                if (localCallLimits && error?.code === 'plugin_rpc_frame_limit' && error.oversize === true) {
                    serialization?.rollback();
                    // No original bytes were issued. Preserve id/context/timer
                    // and await the parent's mandatory refusal publication.
                    try { emit({ kind: 'call', id, method: 'api_local_limit',
                        args: ['array', [['value', error.code]]], context }); }
                    catch (reportError) { fatal(errorCode(reportError)); }
                } else fatal(errorCode(error));
            }
        });
    }
    async function execute(method, args) {
        if (!Array.isArray(args)) throw fail('plugin_rpc_arguments_invalid');
        if (method === '_callback') {
            if (args.length !== 2 || !functions.has(args[0]) || !Array.isArray(args[1])) throw fail('plugin_rpc_callback_invalid');
            return functions.get(args[0])(...args[1]);
        }
        if (method === '_pull' || method === '_cancel') {
            if (args.length !== 1 || !readers.has(args[0])) throw fail('plugin_rpc_stream_invalid');
            const entry = readers.get(args[0]);
            if (entry.context !== getContext()) throw fail('plugin_rpc_context_invalid');
            if (method === '_cancel') {
                readers.delete(args[0]);
                return entry.reader.cancel();
            }
            if (entry.pulling) throw fail('plugin_rpc_stream_busy');
            entry.pulling = true;
            try {
                const result = await entry.reader.read();
                if (result.done) { readers.delete(args[0]); entry.reader.releaseLock(); }
                return result;
            } catch (error) { readers.delete(args[0]); throw error; }
            finally { entry.pulling = false; }
        }
        return dispatch(method, args);
    }
    function receive(frame) {
        if (closed) return;
        try {
            if (!frame || frame.v !== 1) throw fail('plugin_rpc_protocol_invalid');
            activity++;
            if (frame.kind === 'abort') {
                if (!validId(frame.handle)) throw fail('plugin_rpc_protocol_invalid');
                controllers.get(frame.handle)?.abort(fail('plugin_rpc_aborted'));
            } else if (frame.kind === 'return') {
                const entry = pending.get(frame.id);
                if (!entry || typeof frame.ok !== 'boolean') throw fail('plugin_rpc_protocol_invalid');
                const value = frame.ok ? runContext(entry.context, () => unpack(frame.value)) : fail(errorCode({ code: frame.code }));
                pending.delete(frame.id); clearTimeout(entry.timer);
                if (frame.ok) entry.resolve(value); else entry.reject(value);
            } else if (frame.kind === 'call') {
                if (!validId(frame.id) || frame.id <= lastIncoming || typeof frame.method !== 'string'
                    || frame.method.length > 80 || incoming >= 64
                    || !(frame.context === null || (typeof frame.context === 'string' && frame.context.length <= 128))) throw fail('plugin_rpc_protocol_invalid');
                lastIncoming = frame.id;
                // Materialize signal handles before reading a subsequent abort
                // frame from the same pipe chunk, even if execution is deferred.
                let args;
                try { args = runContext(frame.context, () => unpack(frame.args)); }
                catch (error) {
                    if (error?.code !== 'plugin_invocation_expired') throw error;
                    emit({ kind: 'return', id: frame.id, ok: false, code: error.code });
                    onExpiredContext();
                    return;
                }
                incoming++;
                void Promise.resolve().then(() => runContext(frame.context, () =>
                    Promise.resolve().then(() => execute(frame.method, args)).then(value => {
                        if (!closed) {
                            const serialization = serialize(value);
                            try { emit({ kind: 'return', id: frame.id, ok: true, value: serialization.encoded }); }
                            catch (error) { if (error.code === 'plugin_rpc_frame_limit' && error.oversize === true) serialization.rollback(); throw error; }
                        }
                    }),
                )).catch(error => {
                    try { if (!closed) emit({ kind: 'return', id: frame.id, ok: false, code: errorCode(error) }); }
                    catch (sendError) { fatal(errorCode(sendError)); }
                }).finally(() => { incoming--; });
            } else throw fail('plugin_rpc_protocol_invalid');
        } catch (error) { fatal(errorCode(error)); }
    }
    return { call, receive, close, stats: () => ({ pending: pending.size, incoming, activity, closed,
        exports: { functions: functions.size, streams: readers.size, signals: signals.size } }) };
}

async function runWorker() {
    const { Socket } = require('node:net');
    const { StringDecoder } = require('node:string_decoder');
    const { AsyncLocalStorage } = require('node:async_hooks');
    const { inspect } = require('node:util');
    const vm = require('node:vm');
    const channel = new Socket({ fd: 3 });
    const invocation = new AsyncLocalStorage();
    let peer, loaded = false;
    const apiCall = (method, args) => peer.call('api', [method,
        ['log', 'alert', 'alertError'].includes(method) ? args.map(value => typeof value === 'string' ? value
            : inspect(value, { depth: 2, maxArrayLength: 16, maxStringLength: 1024, customInspect: false, getters: false })) : args]);
    const storage = prefix => Object.fromEntries(['getItem', 'setItem', 'removeItem', 'clear', 'keys', 'key', 'length']
        .map(method => [method, (...args) => apiCall(`${prefix}.${method}`, args)]));
    const api = new Proxy({ apiVersion: '3.0', compatibleAPIVersions: ['3.0'], toJSON: () => ({ apiVersion: '3.0' }), pluginStorage: storage('pluginStorage'),
        getLocalPluginStorage: async () => storage('localPluginStorage') }, {
        get(target, key) {
            if (key === 'then' || typeof key !== 'string') return undefined;
            return Object.hasOwn(target, key) ? target[key] : (...args) => apiCall(key, args);
        },
    });
    const sandboxConsole = Object.fromEntries(Object.getOwnPropertyNames(console)
        .filter(name => !name.startsWith('_') && name !== 'Console' && typeof console[name] === 'function')
        .map(name => [name, () => {}])); // Debug console is not a user-facing Risuai.log notification.
    const context = vm.createContext({ Risuai: api, risuai: api, console: sandboxConsole,
        TextEncoder, TextDecoder, URL, URLSearchParams, Headers, Request, Response,
        ReadableStream, WritableStream, TransformStream, AbortController, AbortSignal,
        Uint8Array, ArrayBuffer, crypto: globalThis.crypto, performance,
        structuredClone, atob, btoa, setTimeout, clearTimeout, setInterval, clearInterval,
        queueMicrotask });
    vm.runInContext('globalThis.window = globalThis; globalThis.self = globalThis;', context);
    const runtimeMs = Number(process.argv[2]);
    peer = createPluginPeer({ timeoutMs: Number.isSafeInteger(runtimeMs) && runtimeMs > 0 ? runtimeMs : 600_000,
        localCallLimits: true,
        getContext: () => invocation.getStore() ?? null,
        runContext: (context, task) => invocation.run(context, task), send(frame) {
        const bytes = stringify(frame) + '\n';
        if (channel.writableLength > 16 * 1024 * 1024) throw fail('plugin_rpc_frame_limit');
        if (Buffer.byteLength(bytes) > 8 * 1024 * 1024) throw Object.assign(fail('plugin_rpc_frame_limit'), { oversize: true });
        channel.write(bytes);
    }, onFatal: () => process.exit(1), async dispatch(method, args) {
        if (method === 'load' && !loaded && args.length === 1 && typeof args[0] === 'string') {
            loaded = true;
            // Same wrapper contract as the browser guest; script bytes are not rewritten.
            await vm.runInContext(`(async () => {\n${args[0]}\n})()`, context, { timeout: 5000, filename: 'plugin.js' });
            for (;;) {
                await immediate();
                const before = peer.stats();
                if (before.pending !== 0 || before.incoming !== 1) continue;
                await immediate();
                const after = peer.stats();
                if (after.pending === 0 && after.incoming === 1 && after.activity === before.activity) return { ready: true };
            }
        }
        throw fail('plugin_rpc_method_unsupported');
    } });
    let buffer = '';
    const decoder = new StringDecoder('utf8');
    channel.on('data', bytes => {
        buffer += decoder.write(bytes);
        let index;
        while ((index = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
            if (Buffer.byteLength(line) + 1 > 8 * 1024 * 1024) process.exit(1);
            try { peer.receive(JSON.parse(line)); } catch { process.exit(1); }
        }
        if (Buffer.byteLength(buffer) + 1 > 8 * 1024 * 1024) process.exit(1);
    });
    channel.on('error', () => process.exit(1));
    channel.on('close', () => process.exit(0));
    process.on('uncaughtException', () => process.exit(1));
    process.on('unhandledRejection', error => { if (error?.code !== 'plugin_invocation_expired') process.exit(1); });
}

module.exports = { createPluginPeer };
if (require.main === module) void runWorker().catch(() => process.exit(1));
