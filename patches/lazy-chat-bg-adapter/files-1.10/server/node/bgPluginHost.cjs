'use strict';
const { AsyncLocalStorage } = require('node:async_hooks');
const { isDeepStrictEqual } = require('node:util');
const { randomUUID } = require('node:crypto');
const { createPluginSession } = require('./bgPluginSession.cjs');
const { createPluginStorage, savedPluginPermission } = require('./bgPluginStorage.cjs');
const { clonePluginValue, measurePluginValue } = require('./bgPluginValue.cjs');
const { reservePluginStorage, reservedPluginValue, stringJSONBytes, ABSENT_API_LIMIT, absentApiName } = require('./bgPluginWorker.cjs');
const { createTransportCounter } = require('./bgPluginDiagnostics.cjs');

const fail = code => Object.assign(new Error(code), { code });
const ABSENT_PULL_MS = 1000;
const { clean, identityOf, pluginMetadata } = require('./bgPluginMetadata.cjs');
const clone = clonePluginValue;
const phaseScope = new AsyncLocalStorage();

// Handlers are plain functions so every check the former switch ran before its
// first await still runs and throws synchronously inside the dispatcher's try.
// A handler result is one of:
// - Returned(value): the former case returned without await; the dispatcher
//   returns the value unawaited (its rejection stays outside the try).
// - Resume(pending, next): the former case awaited `pending` part-way; the
//   dispatcher awaits it in its own frame, then runs `next` synchronously.
// - any other value: the former case did `return await value`.
class Returned { constructor(value) { this.value = value; } }
class Resume { constructor(pending, next) { this.pending = pending; this.next = next; } }
const returned = value => new Returned(value);
const argumentAlias = (ctx, args, method) => {
    if (typeof args[0] !== 'string') throw fail('plugin_api_arguments_invalid');
    const [name, key] = args[0].split('::');
    if (name !== ctx.plugin.name) return ctx.unsupported(method);
    return method === 'getArg' ? ctx.storage.argument('getArgument', [key])
        : ctx.write(args, () => ctx.storage.argument('setArgument', [key, args[1]]));
};
const networkFetch = (ctx, args, method) => {
    const { entry, signal, abortSignal, bindings } = ctx;
    if (ctx.countNetworkCall() > 128) throw fail('plugin_budget_exceeded');
    if (typeof args[0] !== 'string' || !/^https?:\/\//i.test(args[0])
        || ['risuai.xyz', 'risuai.net', 'sionyw.com'].some(domain => args[0].toLowerCase().includes(domain))) throw fail('plugin_fetch_target_invalid');
    const options = args[1] ?? {};
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw fail('plugin_api_arguments_invalid');
    const optionsSignal = method === 'nativeFetch' ? options.signal : options.abortSignal;
    return new Resume(ctx.effect(entry), () => {
        const scopeSignal = entry.session.currentSignal();
        return returned(entry.transport.observe(method, [['operationCancelled', signal], ['entryClosed', entry.abort.signal],
            ['scopeClosed', scopeSignal], ['requestAborted', optionsSignal]], () => bindings[method](args[0], { ...options,
            [method === 'nativeFetch' ? 'signal' : 'abortSignal']: AbortSignal.any([
                abortSignal, scopeSignal, ...(optionsSignal instanceof AbortSignal ? [optionsSignal] : [])]) })));
    });
};
const hydrated = (ctx, character, pick) => new Resume(ctx.hydrate([character]), value => returned(pick(value)));
const currentCharacter = ctx => {
    const character = ctx.getDatabase().characters[ctx.getSelection().characterIndex];
    return character ? hydrated(ctx, character, value => value[0]) : returned(undefined);
};
const COLD_STORAGE_HEADER = 'COLDSTORAGE';
// Same entries and order as the foreground API, read from the operation's
// assembly chat without hydration. A stub, placeholder or cold selected chat is
// not the assembled snapshot, so it fails instead of returning partial lore.
const currentLorebookEntries = ctx => {
    const { characterIndex, chatIndex } = ctx.getSelection();
    const character = ctx.getDatabase().characters?.[characterIndex];
    if (!character) return returned([]);
    const chat = character.chats?.[chatIndex];
    const coldData = chat?.message?.[0]?.data;
    if (chat && (chat._stub || chat._placeholder
        || (typeof coldData === 'string' && coldData.startsWith(COLD_STORAGE_HEADER)))) throw fail('plugin_chat_snapshot_unavailable');
    return returned(clone([...character.globalLore ?? [], ...chat?.localLore ?? [], ...ctx.bindings.moduleLorebooks()]));
};
const noUi = () => returned(undefined);
const message = (ctx, args, method) => {
    const { entry } = ctx;
    if (++entry.messageCount > 33) return returned(undefined);
    const text = entry.messageCount === 33 ? '추가 플러그인 알림은 이 요청에서 생략되었어요.' : args.map(value => typeof value === 'string' ? value : JSON.stringify(value) ?? String(value))
        .join(' ').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, 4096) || '(empty)';
    return returned(ctx.record({ ...ctx.common(entry, phaseScope.getStore() ?? 'load'), code: 'plugin_message',
        eventKey: `plugin:${ctx.index}:message:${entry.messageCount}`, message: text,
        level: method === 'alertError' ? 'error' : 'info' }));
};
// The BG root API dispatcher. Its own keys are the only source of the names the
// worker exposes: adding a handler here exposes it, and nothing else does.
const ROOT_HANDLERS = Object.freeze({ __proto__: null,
    getArgument: (ctx, args, method) => ctx.storage.argument(method, args),
    setArgument: (ctx, args, method) => ctx.write(args, () => ctx.storage.argument(method, args)),
    getArg: argumentAlias,
    setArg: argumentAlias,
    requestPluginPermission: (ctx, args) => returned(ctx.permission(ctx.entry, args[0])),
    addRisuReplacer: (ctx, args) => {
        ctx.permission(ctx.entry, 'replacer', true);
        if (!['beforeRequest', 'afterRequest'].includes(args[0])) throw fail('plugin_registration_invalid');
        ctx.register(ctx.entry, 'replacer', args[0], args[1]); return returned(undefined);
    },
    removeRisuReplacer: (ctx, args) => { ctx.remove(ctx.entry, 'replacer', args[0], args[1]); return returned(undefined); },
    addRisuScriptHandler: (ctx, args) => {
        if (!['input', 'output', 'process', 'display'].includes(args[0])) throw fail('plugin_registration_invalid');
        ctx.register(ctx.entry, 'script', args[0], args[1]); return returned(undefined);
    },
    removeRisuScriptHandler: (ctx, args) => { ctx.remove(ctx.entry, 'script', args[0], args[1]); return returned(undefined); },
    registerBodyIntercepter: (ctx, args) => {
        ctx.permission(ctx.entry, 'replacer'); return returned({ id: ctx.register(ctx.entry, 'body', 'body', args[0]) });
    },
    unregisterBodyIntercepter: (ctx, args) => {
        if (ctx.bindings.bodyInterceptors.some(row => row.id === args[0])
            && !ctx.entry.registrations.some(row => row.id === args[0])) return ctx.unsupported('cross_plugin_interceptor_remove');
        ctx.remove(ctx.entry, 'body', 'body', args[0]); return returned(undefined);
    },
    addProvider: (ctx, args) => {
        if (typeof args[0] !== 'string' || !args[0] || args[0].length > 120) throw fail('plugin_registration_invalid');
        ctx.permission(ctx.entry, 'provider', true); ctx.register(ctx.entry, 'provider', args[0], args[1], args[2]); return returned(undefined);
    },
    onUnload: (ctx, args) => {
        if (ctx.entry.ready || typeof args[0] !== 'function' || ctx.entry.unload.length >= 64) throw fail('plugin_registration_invalid');
        ctx.entry.unload.push(args[0]); return returned(undefined);
    },
    nativeFetch: networkFetch,
    risuFetch: networkFetch,
    runLLMModel: (ctx, args) => {
        const { entry, signal, abortSignal, bindings } = ctx;
        if (ctx.countNetworkCall() > 128) throw fail('plugin_budget_exceeded');
        const options = args[0];
        if (!options || !Array.isArray(options.messages)) throw fail('plugin_api_arguments_invalid');
        return new Resume(ctx.effect(entry), () => {
            const scopeSignal = entry.session.currentSignal();
            const requestSignal = AbortSignal.any([abortSignal, scopeSignal]);
            return returned(entry.transport.observe('modelCalls', [['operationCancelled', signal], ['entryClosed', entry.abort.signal],
                ['scopeClosed', scopeSignal]], () => bindings.requestChatDataMain({ formated: options.messages, bias: {}, staticModel: options.staticModel,
                blockPlugins: !options.allowPlugins, abortSignal: requestSignal }, options.mode, requestSignal)));
        });
    },
    getDatabase: (ctx, args) => ctx.readDatabase(args[0]),
    getDatabaseMetadata: (ctx, args) => ctx.readDatabase(args[0], true),
    getCurrentCharacterIndex: ctx => returned(ctx.getSelection().characterIndex),
    getCurrentChatIndex: ctx => returned(ctx.getSelection().chatIndex),
    getChar: currentCharacter,
    getCharacter: currentCharacter,
    getCharacterFromIndex: (ctx, args) => {
        if (!Number.isSafeInteger(args[0]) || args[0] < 0) throw fail('plugin_api_arguments_invalid');
        const character = ctx.getDatabase().characters[args[0]];
        return character ? hydrated(ctx, character, value => value[0]) : returned(undefined);
    },
    getChatFromIndex: (ctx, args) => {
        if (args.length !== 2 || args.some(value => !Number.isSafeInteger(value) || value < 0)) throw fail('plugin_api_arguments_invalid');
        const character = ctx.getDatabase().characters[args[0]];
        return character ? hydrated(ctx, character, value => value[0]?.chats?.[args[1]] ?? null) : returned(null);
    },
    getCurrentLorebookEntries: currentLorebookEntries,
    getRuntimeInfo: () => returned({ apiVersion: '3.0', platform: 'node', saveMethod: 'local' }),
    showContainer: noUi, hideContainer: noUi, registerSetting: noUi, registerButton: noUi,
    unregisterUIPart: noUi, setChatPanel: noUi,
    getRootDocument: () => returned(null),
    alert: message, alertError: message, log: message,
});
// Derived from the dispatcher table; sent to the worker at load.
const SUPPORTED_ROOT_METHODS = Object.freeze(Object.keys(ROOT_HANDLERS));
const resourceFailures = new Set(['plugin_budget_exceeded', 'plugin_value_limit', 'plugin_rpc_value_limit',
    'plugin_rpc_frame_limit',
    'plugin_rpc_pending_limit', 'plugin_rpc_handle_limit', 'plugin_sandbox_frame_limit',
    'plugin_sandbox_byte_rate_limit', 'plugin_sandbox_rate_limit', 'plugin_sandbox_backpressure', 'plugin_invocation_limit']);

function limiter(limit, signal) {
    let active = 0, closed = false;
    const waiting = [];
    const close = () => {
        closed = true;
        for (const entry of waiting.splice(0)) entry.reject(fail('plugin_operation_closed'));
        signal.removeEventListener('abort', close);
    };
    signal.addEventListener('abort', close, { once: true });
    if (signal.aborted) close();
    return {
        close,
        async run(task) {
            if (closed) throw fail('plugin_operation_closed');
            if (active >= limit) await new Promise((resolve, reject) => waiting.push({ resolve, reject }));
            else active++;
            if (closed) throw fail('plugin_operation_closed');
            try { return await task(); }
            finally {
                const next = waiting.shift();
                if (next && !closed) next.resolve(); else active--;
            }
        },
    };
}

async function createBgPluginHost({ database, bindings, getDatabase, getSelection, hydrate,
    storageOwner, beforeEffect, publishNotification, publishDiagnostic, operation, signal, onCriticalFailure = () => {} }) {
    const entries = [], cleanups = [], notices = [], names = new Set(), omittedNames = new Set(), conflictedProviders = new Set();
    let closed = false, tearingDown = false, noticeFailure = null, identityFailure = null;
    // Identity refusals created by this host's own checks (cache reload, the
    // storage owner's plugin match). Only these error objects may record an
    // identity disable cause; a guest cannot add to this set.
    const hostIdentityFailures = new WeakSet();
    const markIdentityFailure = failure => { hostIdentityFailures.add(failure); return failure; };
    let messageCapacityReported = false;
    let diagnosticFailureReported = false;
    const publishSummaries = async () => {
        if (typeof publishDiagnostic !== 'function') return;
        for (const entry of entries) {
            const summary = entry.transport?.snapshot();
            const absentApis = [...entry.absentApis ?? []].map(([api, phase]) => ({ api, phase }));
            if (!summary || (!summary.calls && !absentApis.length)) continue;
            try {
                const metadata = common(entry, entry.lastPhase ?? 'load');
                await publishDiagnostic({ version: 1, id: entry.diagnosticId, createdAt: Date.now(),
                    pluginName: metadata.pluginName, pluginVersion: metadata.pluginVersion, ...summary,
                    ...(absentApis.length ? { absentApis } : {}) });
            } catch {
                if (!diagnosticFailureReported) {
                    diagnosticFailureReported = true;
                    try { console.warn('[BGPluginDiagnostics] summary storage unavailable'); }
                    catch { /* Diagnostic logging must not change the generation outcome. */ }
                }
            }
        }
    };
    let rootWrites = 0, writtenBytes = 0, localWrites = 0, localWrittenBytes = 0, networkCalls = 0;
    const apiSlots = limiter(64, signal), writeSlots = limiter(2, signal);
    const reportApiLimit = async entry => {
        if (noticeFailure) throw noticeFailure;
        if (closed || tearingDown || entry.closing || entry.failed || signal.aborted) return;
        const phase = phaseScope.getStore() ?? entry.lastPhase ?? 'load';
        const budgetNotices = entry.budgetNotices ??= new Map();
        if (!budgetNotices.has(phase)) {
            budgetNotices.set(phase, record({ ...common(entry, phase), code: 'plugin_host_limit', reason: 'operation_budget',
                eventKey: `plugin:${entry.index}:${entry.identity}:${phase}:limit` }));
        }
        await budgetNotices.get(phase);
        if (noticeFailure) throw noticeFailure;
    };
    const reportSettlementBudget = async entry => {
        if (noticeFailure) throw noticeFailure;
        if (closed || tearingDown || entry.closing || entry.failed || signal.aborted) return;
        const phase = phaseScope.getStore() ?? entry.lastPhase ?? 'load';
        const settlementNotices = entry.settlementNotices ??= new Map();
        // Retain the first warning's effects snapshot for this phase, even if
        // subsequent accepted work changes it. Later terminal failures are separate.
        if (!settlementNotices.has(phase)) {
            settlementNotices.set(phase, record({ ...common(entry, phase), code: 'plugin_host_limit', reason: 'operation_budget',
                eventKey: `plugin:${entry.index}:${entry.identity}:${phase}:settlement-budget` }));
        }
        await settlementNotices.get(phase);
        if (noticeFailure) throw noticeFailure;
    };
    const withApiBudget = async (entry, method, args, task) => {
        if (noticeFailure) throw noticeFailure;
        if (identityFailure) throw identityFailure;
        try {
            let bytes = 0, charged = false;
            try {
                const local = method.startsWith('localPluginStorage.');
                const counter = local ? 'pendingLocalBytes' : 'pendingBytes';
                const maxBytes = local ? 32 * 1024 * 1024 + 8192 : 4 * 1024 * 1024;
                const largeStringWrite = method === 'localPluginStorage.setItem' && typeof args[1] === 'string';
                bytes = measurePluginValue(args, largeStringWrite ? maxBytes : 4 * 1024 * 1024);
                if (entry[counter] + bytes > maxBytes) throw fail('plugin_budget_exceeded');
                entry[counter] += bytes; charged = counter;
                const run = async () => {
                    entry.session.assertCurrent();
                    await currentIdentity(phaseScope.getStore() ?? entry.lastPhase ?? 'load');
                    entry.session.assertCurrent();
                    if (closed || entry.failed || signal.aborted) throw fail('plugin_operation_closed');
                    return task();
                };
                // Outbound methods can re-enter body/provider callbacks. Holding a
                // host-work permit across them would deadlock a parallel batch.
                return await (['nativeFetch', 'risuFetch', 'runLLMModel'].includes(method)
                    ? run() : entry.apiSlots.run(() => apiSlots.run(run)));
            } finally {
                // Issued-request cleanup is not a new call with expired authority.
                // API-limit notices below await only after releasing byte/slot
                // ownership. Task-owned conflict notices retain their charges.
                if (charged) entry[charged] -= bytes;
            }
        } catch (error) {
            if (['plugin_budget_exceeded', 'plugin_value_limit'].includes(error?.code)
                && !closed && !tearingDown && !entry.closing && !entry.failed && !signal.aborted && !noticeFailure) {
                await reportApiLimit(entry);
            }
            throw noticeFailure ?? error;
        }
    };
    const write = async (args, task, local = false) => {
        const bytes = local && typeof args[0] === 'string' && typeof args[1] === 'string' ? stringJSONBytes(args[0]) + stringJSONBytes(args[1]) + 3
            : Buffer.byteLength(JSON.stringify(local ? args.slice(0, args.length > 1 ? 2 : 1) : args) ?? '');
        if (local) {
            if (localWrites >= 64 || localWrittenBytes + bytes > 64 * 1024 * 1024) throw fail('plugin_budget_exceeded');
            localWrites++; localWrittenBytes += bytes;
        } else {
            if (rootWrites >= 64 || writtenBytes + bytes > 8 * 1024 * 1024) throw fail('plugin_budget_exceeded');
            rootWrites++; writtenBytes += bytes;
        }
        return writeSlots.run(task);
    };
    const record = (event, capacityIsCritical = true) => {
        const pending = Promise.resolve().then(() => publishNotification(event,
            event.code === 'plugin_message' ? undefined : event.failureIdentity)).then(result => {
            if (result?.status === 'capacity') {
                if (!capacityIsCritical) return;
                if (event.code === 'plugin_message' && !event.eventKey.endsWith(':local-conflict')) {
                    if (messageCapacityReported) return;
                    messageCapacityReported = true;
                    return record({ ...event, code: 'plugin_host_limit', reason: 'notification_capacity',
                        eventKey: 'plugin:notification-capacity' }, false);
                }
            }
            if (!['stored', 'duplicate'].includes(result?.status)) throw fail('plugin_notification_unavailable');
        }).catch(() => {
            if (!noticeFailure) { noticeFailure = fail('plugin_notification_unavailable'); onCriticalFailure(noticeFailure); }
            throw noticeFailure;
        });
        // Keep rejection handled until the execution boundary awaits it.
        pending.catch(() => {}); notices.push(pending);
        return pending;
    };
    const common = (entry, phase) => ({ operationId: operation.operationId,
        charId: operation.charId, chatId: operation.chatId, createdAt: Date.now(),
        ...pluginMetadata(entry.plugin),
        phase, effectsMayHaveOccurred: entry.effects, failureIdentity: entry.identity });
    // Pull the worker's absent-name record at a parent-controlled point. The read
    // is bounded, never disables, records no notice/effect and uses no API budget.
    const collectAbsent = async (entry, phase, deadline = performance.now() + ABSENT_PULL_MS) => {
        const session = entry.session;
        const remaining = Math.floor(deadline - performance.now());
        if (!session || entry.failed || session.failure || signal.aborted || remaining <= 0) return;
        // The worker drains its record when it answers, so the result is merged
        // whenever it arrives; only the wait is bounded. A diagnostic read must
        // not change the plugin outcome, so failures are ignored.
        const merge = result => {
            if (!result || typeof result !== 'object' || !Array.isArray(result.names)
                || typeof result.overflow !== 'boolean') return;
            const absent = entry.absentApis ??= new Map();
            for (const name of result.names.slice(0, ABSENT_API_LIMIT)) {
                if (absent.size >= ABSENT_API_LIMIT) break;
                if (absentApiName(name) && !absent.has(name)) absent.set(name, phase);
            }
        };
        const pull = Promise.resolve().then(() => session.pullAbsentApis()).then(merge, () => {});
        let timer;
        try { await Promise.race([pull, new Promise(resolve => { timer = setTimeout(resolve, remaining); })]); }
        finally { clearTimeout(timer); }
    };
    // `cause` is 'identity' only when the host itself decided that the plugin
    // set changed during the operation (edit, disable, reorder, addition,
    // duplicate name, unstable identity cache); a request may continue without
    // such a plugin. It is never inferred from error codes or API names, which
    // a guest can choose. Every other disable is an execution failure.
    const disable = (entry, code, api, phaseOverride, cause = 'execution') => {
        // A load failure after registration must not reveal a different owner
        // of the same selected name. Unknown, never-registered names are not inferred.
        if (!entry.ready) for (const row of entry.registrations ?? []) {
            if (row.type === 'provider') conflictedProviders.add(row.name);
        }
        if (entry.failed || entry.closing || signal.aborted || noticeFailure) return;
        entry.failed = true;
        // Recorded once, at the transition; later disables are no-ops above.
        entry.disableCause = cause === 'identity' ? 'identity' : 'execution';
        const phase = phaseOverride ?? entry.lastPhase ?? phaseScope.getStore() ?? 'load';
        const event = { ...common(entry, phase), eventKey: `plugin:${entry.index}:${entry.identity}:${phase}:failure`,
            code: resourceFailures.has(code) ? 'plugin_host_limit'
                : code === 'plugin_permission_missing' && !entry.effects ? code
                : code === 'plugin_api_unsupported' ? code
                    : phase === 'provider' ? 'plugin_provider_failed' : 'plugin_hook_failed' };
        if (event.code === 'plugin_api_unsupported') event.api = clean(api ?? 'unknown_api', 63)
            .replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 63);
        if (event.api && (!/^[a-z]/.test(event.api) || event.api.length < 3)) event.api = ('unsupported_' + event.api).slice(0, 63);
        if (event.code === 'plugin_host_limit') event.reason = 'operation_budget';
        record(event);
        entry.abort.abort(fail(code));
        if (entry.session) void entry.session.close();
    };
    const identityView = root => {
        if (!root || typeof root !== 'object' || Array.isArray(root)
            || (root.plugins !== undefined && !Array.isArray(root.plugins))) throw fail('plugin_identity_unavailable');
        const all = root.plugins ?? [], counts = new Map(), enabled = all.filter(plugin => plugin?.enabled);
        for (const plugin of all) if (plugin) counts.set(plugin.name, (counts.get(plugin.name) ?? 0) + 1);
        const positions = new Map(enabled.map((plugin, index) => [plugin.name, index]));
        const surviving = entries.filter(entry => entry.identityEligible && !entry.failed && counts.get(entry.plugin.name) === 1)
            .map(entry => ({ entry, position: positions.get(entry.plugin.name) }))
            .filter(({ entry, position }) => position !== undefined && position < 16
                && enabled[position].script === entry.plugin.script && enabled[position].version === entry.plugin.version);
        const reordered = new Set();
        for (let left = 0; left < surviving.length; left++) for (let right = left + 1; right < surviving.length; right++) {
            if (surviving[left].position > surviving[right].position) {
                reordered.add(surviving[left].entry); reordered.add(surviving[right].entry);
            }
        }
        return { counts, enabled, positions, reordered };
    };
    const validateIdentity = (root, phase) => {
        const view = identityView(root);
        for (const entry of entries) {
            if (entry.failed) continue;
            const position = view.positions.get(entry.plugin.name), current = view.enabled[position];
            if (view.counts.get(entry.plugin.name) > 1) disable(entry, 'plugin_api_unsupported', 'plugin_identity_ambiguous', phase, 'identity');
            else if (!current || position >= 16 || current.script !== entry.plugin.script
                || current.version !== entry.plugin.version || view.reordered.has(entry)) disable(entry, 'plugin_identity_changed', undefined, phase, 'identity');
        }
        for (const [index, plugin] of view.enabled.entries()) {
            if (!names.has(plugin.name) && !omittedNames.has(plugin.name)) {
                omittedNames.add(plugin.name);
                const entry = { plugin, index, effects: false, abort: new AbortController(), failed: false, identity: identityOf(plugin) };
                disable(entry, 'plugin_api_unsupported', 'plugin_set_changed', phase, 'identity');
            }
        }
    };
    const latchIdentityFailure = () => {
        if (!identityFailure) { identityFailure = fail('plugin_identity_unavailable'); onCriticalFailure(identityFailure); }
        return identityFailure;
    };
    const checkedIdentity = (root, phase) => {
        try { validateIdentity(root, phase); }
        catch { throw latchIdentityFailure(); }
    };
    const currentIdentity = async phase => {
        if (closed || tearingDown) return;
        if (identityFailure) throw identityFailure;
        try {
            if (typeof storageOwner.peekRoot !== 'function') throw fail('plugin_identity_unavailable');
            let root = storageOwner.peekRoot();
            // Cache invalidation is not identity loss. The ordinary hot path
            // never enters the storage queue; cold recovery uses its owner.
            if (root == null) root = await storageOwner.getRoot();
            if (closed || tearingDown || signal.aborted) return;
            checkedIdentity(root, phase);
        } catch {
            if (identityFailure) throw identityFailure;
            if (closed || tearingDown || signal.aborted) throw fail('plugin_operation_closed');
            throw latchIdentityFailure();
        }
    };
    const permission = (entry, name, periodic = false) => {
        // The grant belongs to the code actually loaded, not an independently
        // captured operation DB. Canonical identity is checked at API boundaries.
        if (!savedPluginPermission(storageOwner.kvGet, entry.plugin, name, periodic)) {
            disable(entry, 'plugin_permission_missing'); throw fail('plugin_permission_missing');
        }
        return true;
    };
    const reportLate = entry => {
        if (!entry.lateNotified && !signal.aborted && !entry.closing) {
            entry.lateNotified = true;
            record({ ...common(entry, entry.lastPhase ?? 'load'), code: 'plugin_late_call',
                eventKey: `plugin:${entry.index}:late-call` });
        }
    };
    const effect = async entry => {
        if (closed || tearingDown || entry.failed || signal.aborted) throw fail('plugin_operation_closed');
        await currentIdentity(phaseScope.getStore() ?? entry.lastPhase ?? 'load');
        await noticesSettled();
        if (entry.failed || signal.aborted) throw fail('plugin_operation_closed');
        await beforeEffect();
        await currentIdentity(phaseScope.getStore() ?? entry.lastPhase ?? 'load');
        if (closed || tearingDown || entry.failed || signal.aborted) throw fail('plugin_operation_closed');
        entry.effects = true;
    };
    const noticesSettled = () => Promise.all(notices);
    const providerFailure = entry => {
        if (entry.providerFailureNotified || signal.aborted) return;
        entry.providerFailureNotified = true;
        record({ ...common(entry, 'provider'), code: 'plugin_provider_failed',
            eventKey: `plugin:${entry.index}:provider:failure` });
    };
    const invoke = (entry, kind, callback, contract = 'replacer', providerName) => async (...args) => {
        const provider = kind === 'provider';
        // A beforeRequest replacer that cannot run fails the request, as in the
        // foreground. Only an identity-caused disable lets the request continue
        // without the plugin. Body interceptors share the kind but not this contract.
        const failClosed = contract === 'replacer' && kind === 'before_request';
        const stopped = () => closed || tearingDown || entry.closing || signal.aborted;
        // Called only for a disabled entry or a closed host. Cancellation is
        // decided after every await; no new plugin notice is created here.
        const settleBeforeRequest = async () => {
            await noticesSettled();
            if (noticeFailure) throw noticeFailure;
            if (identityFailure) throw identityFailure;
            if (stopped()) throw fail('plugin_operation_closed');
            if (entry.disableCause === 'identity') return args[0];
            throw fail('plugin_before_request_failed');
        };
        if (noticeFailure) throw noticeFailure;
        if (identityFailure) throw identityFailure;
        if (closed || entry.failed) {
            if (failClosed) return settleBeforeRequest();
            await noticesSettled();
            if (provider) throw fail('plugin_provider_failed');
            return args[0];
        }
        return phaseScope.run(kind, async () => {
            entry.lastPhase = kind;
            let absentPulled = false;
            const pullAbsent = async () => { if (!absentPulled) { absentPulled = true; await collectAbsent(entry, kind); } };
            try {
                await currentIdentity(kind);
                await noticesSettled();
                if (closed || tearingDown || signal.aborted) throw fail('plugin_operation_closed');
                if (provider && conflictedProviders.has(providerName)) throw fail('plugin_provider_name_conflict');
                if (entry.failed) {
                    if (provider) throw fail('plugin_provider_failed');
                    if (failClosed) return await settleBeforeRequest();
                    return args[0];
                }
                if (provider) { permission(entry, 'provider', true); await effect(entry); }
                const value = await callback(...args);
                await pullAbsent();
                await currentIdentity(kind);
                if (closed || tearingDown || entry.closing || (failClosed && signal.aborted)) throw fail('plugin_operation_closed');
                if (entry.failed) throw fail('plugin_hook_failed');
                if (contract === 'replacer' && kind === 'before_request' && !Array.isArray(value)) throw fail('plugin_hook_result_invalid');
                if (contract === 'replacer' && kind === 'after_request' && typeof value !== 'string') throw fail('plugin_hook_result_invalid');
                if (contract === 'script' && value != null && typeof value !== 'string') throw fail('plugin_hook_result_invalid');
                if (provider && (!value || typeof value.success !== 'boolean'
                    || !(typeof value.content === 'string' || value.content instanceof ReadableStream))) throw fail('plugin_provider_result_invalid');
                if (provider && value.success === false) providerFailure(entry);
                if (!provider && value != null && !isDeepStrictEqual(value, args[0])) entry.effects = true;
                await noticesSettled();
                if (closed || tearingDown || entry.closing || (failClosed && signal.aborted)) throw fail('plugin_operation_closed');
                // A disable during the final settlement still decides the outcome.
                if (failClosed && entry.failed) return await settleBeforeRequest();
                return value;
            } catch (error) {
                // Read before a possible disable closes the worker; never throws.
                await pullAbsent();
                if (noticeFailure) throw noticeFailure;
                if (identityFailure) throw identityFailure;
                if (failClosed) {
                    if (stopped()) throw fail('plugin_operation_closed');
                    disable(entry, error?.code ?? 'plugin_hook_failed');
                    return await settleBeforeRequest();
                }
                if (closed || tearingDown || entry.closing) throw error;
                if (provider && error?.code === 'plugin_execution_failed' && !entry.session.failure && !signal.aborted) {
                    providerFailure(entry); await noticesSettled(); throw error;
                }
                disable(entry, error?.code ?? 'plugin_hook_failed');
                await noticesSettled();
                if (provider || signal.aborted) throw fail(provider ? 'plugin_provider_failed' : 'plugin_operation_closed');
                return args[0];
            }
        });
    };
    const register = (entry, type, name, callback, options) => {
        if (entry.ready || typeof callback !== 'function' || entry.registrations.length >= 256) throw fail('plugin_registration_invalid');
        const existing = entry.registrations.find(row => row.type === type && row.name === name && row.callback === callback);
        if (existing) return existing.id;
        const row = { type, name, callback, options, id: randomUUID() };
        entry.registrations.push(row); return row.id;
    };
    const remove = (entry, type, name, callback) => {
        const row = entry.registrations.find(item => item.type === type && item.name === name
            && (item.callback === callback || item.id === callback));
        if (row) { row.remove?.(); entry.registrations.splice(entry.registrations.indexOf(row), 1); }
    };
    const install = entry => {
        const providerNames = new Set();
        for (const row of entry.registrations.filter(row => row.type === 'provider')) {
            if (providerNames.has(row.name) || bindings.registry.providers.has(row.name)) {
                conflictedProviders.add(row.name);
                throw fail('plugin_provider_name_conflict');
            }
            providerNames.add(row.name);
        }
        for (const row of entry.registrations) {
            let undo;
            if (row.type === 'replacer' || row.type === 'script') {
                const set = bindings.registry[row.type === 'replacer' ? 'replacer' + row.name : 'edit' + row.name];
                const kind = row.type === 'replacer' ? row.name === 'beforeRequest' ? 'before_request' : 'after_request'
                    : row.name === 'input' ? 'input' : 'after_request';
                const callback = invoke(entry, kind, row.callback, row.type);
                set.add(callback); undo = () => set.delete(callback);
            } else if (row.type === 'body') {
                const value = { id: row.id, callback: invoke(entry, 'before_request', row.callback, 'body') };
                bindings.bodyInterceptors.push(value);
                undo = () => { const index = bindings.bodyInterceptors.indexOf(value); if (index >= 0) bindings.bodyInterceptors.splice(index, 1); };
            } else {
                if (bindings.registry.providers.has(row.name)) throw fail('plugin_provider_name_conflict');
                const callback = invoke(entry, 'provider', (...args) => row.callback({ ...args[0], mode: 'v3' }, args[1]), 'provider', row.name);
                undo = bindings.installProvider(row.name, callback, row.options);
            }
            let removed = false;
            row.remove = () => { if (!removed) { removed = true; undo(); } };
            cleanups.push(row.remove);
        }
    };
    const enabled = (database.plugins ?? []).filter(plugin => plugin?.enabled);
    try {
        for (const [index, plugin] of enabled.entries()) {
            if (names.has(plugin.name)) continue; // Native v3 loader keeps the first name.
            names.add(plugin.name);
            const entry = { plugin: { name: plugin.name, script: '', version: plugin.version }, index, registrations: [], unload: [], abort: new AbortController(),
                session: null, failed: false, ready: false, effects: operation.inputPreparedOnClient === true, messageCount: 0, pendingBytes: 0, pendingLocalBytes: 0 };
            entry.transport = createTransportCounter(); entry.diagnosticId = randomUUID();
            entry.identity = identityOf(plugin);
            entry.apiSlots = limiter(16, entry.abort.signal);
            entries.push(entry);
            try { entry.plugin = clone(plugin); }
            catch { disable(entry, 'plugin_api_unsupported', 'plugin_record_size'); continue; }
            if (plugin.version !== '3.0' || typeof plugin.script !== 'string' || index >= 16) { disable(entry, 'plugin_api_unsupported', 'plugin_runtime'); continue; }
            entry.identityEligible = true;
        }
        // Publish ambiguous-identity refusals before any guest initialization.
        checkedIdentity(database, 'load');
        await currentIdentity('load');
        await noticesSettled();
        for (const entry of entries) {
            if (entry.failed) continue;
            const { index, plugin } = entry;
            const abortSignal = AbortSignal.any([signal, entry.abort.signal]);
            const storage = createPluginStorage({ ...storageOwner, plugin: entry.plugin, beforeEffect: () => effect(entry),
                reserveLocal: reservePluginStorage, wrapLocalRead: reservedPluginValue, markIdentityFailure,
                prepareActive: () => currentIdentity(phaseScope.getStore() ?? entry.lastPhase ?? 'load'),
                assertActive: function(latest) {
                    if (!closed && !tearingDown) {
                        const provided = arguments.length > 0;
                        const root = provided ? latest : storageOwner.peekRoot();
                        if (!provided && root == null) {
                            throw markIdentityFailure(fail('plugin_identity_reload_required'));
                        }
                        checkedIdentity(root, phaseScope.getStore() ?? entry.lastPhase ?? 'load');
                    }
                    if (closed || tearingDown || entry.failed || signal.aborted) throw fail('plugin_operation_closed');
                    entry.session.assertCurrent();
                },
                onWrite({ group, key, present, value }) {
                    const active = getDatabase();
                    const matches = group === 'argument' ? (active.plugins ?? []).filter(item => item.name === entry.plugin.name
                        && item.script === entry.plugin.script && item.version === entry.plugin.version) : null;
                    // A committed canonical write must not become a false guest
                    // failure or recreate an absent operation-snapshot entry.
                    if (matches && matches.length !== 1) return;
                    const target = group === 'root' ? (active.pluginCustomStorage ??= {})
                        : (matches[0].realArg ??= {});
                    if (present) Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
                    else delete target[key];
                },
            });
            const unsupported = method => { disable(entry, 'plugin_api_unsupported', method); throw fail('plugin_api_unsupported'); };
            const readDatabase = async (include = 'all', metadata = false) => {
                permission(entry, 'db', true);
                if (include !== 'all' && (!Array.isArray(include) || include.some(key => typeof key !== 'string'))) throw fail('plugin_api_arguments_invalid');
                const snapshot = getDatabase();
                const selected = bindings.allowedDbKeys.filter(key => include === 'all' || include.includes(key));
                const result = Object.fromEntries(selected.filter(key => key !== 'characters').map(key => [key, snapshot[key]]));
                if (selected.includes('characters')) result.characters = metadata ? result.characters : await hydrate(snapshot.characters);
                if (selected.includes('characters') && metadata) result.characters = snapshot.characters.map(bindings.characterMetadata);
                return clone(result);
            };
            const rootContext = { entry, plugin, index, storage, abortSignal, signal, bindings, unsupported, readDatabase,
                write, permission, register, remove, effect, record, common, getDatabase, getSelection, hydrate,
                countNetworkCall: () => ++networkCalls };
            try {
            entry.session = await phaseScope.run('load', () => createPluginSession({ script: plugin.script, signal: abortSignal,
                rootMethods: SUPPORTED_ROOT_METHODS,
                onFailure: code => disable(entry, code), onLateCall: () => reportLate(entry),
                onSettlementTimeout: () => reportSettlementBudget(entry),
                onLocalLimit: () => { entry.session.assertCurrent(); return reportApiLimit(entry); },
                api: (method, args) => withApiBudget(entry, method, args, async () => {
                    if (closed || entry.failed || signal.aborted) throw fail('plugin_operation_closed');
                    if (tearingDown && !['removeRisuReplacer', 'removeRisuScriptHandler', 'unregisterBodyIntercepter',
                        'unregisterUIPart', 'hideContainer'].includes(method)) throw fail('plugin_operation_closed');
                    try {
                        if (method.startsWith('pluginStorage.') || method.startsWith('localPluginStorage.')) {
                            const [group, action] = method.split('.');
                            if (!['getItem', 'setItem', 'removeItem', 'keys', 'key', 'length'].includes(action)) return unsupported(method);
                            const task = () => (group === 'pluginStorage' ? storage.root : storage.local)(action, args);
                            return ['setItem', 'removeItem'].includes(action) ? await write(args, task, group === 'localPluginStorage') : await task();
                        }
                        // Own-property lookup only: inherited names are not handlers.
                        const handler = Object.hasOwn(ROOT_HANDLERS, method) ? ROOT_HANDLERS[method] : null;
                        if (!handler) return unsupported(method);
                        // Same timing as the former switch: synchronous checks throw
                        // here; see the Returned/Resume contract above ROOT_HANDLERS.
                        let result = handler(rootContext, args, method);
                        if (result instanceof Resume) result = result.next(await result.pending);
                        if (result instanceof Returned) return result.value;
                        return await result;
                    } catch (error) {
                        if (error?.code === 'plugin_storage_conflict' && method.startsWith('localPluginStorage.')
                            && !closed && !tearingDown && !entry.failed && !signal.aborted && !noticeFailure && !identityFailure) {
                            // The checked local transaction wrote nothing. Keep
                            // the competing value and let the unchanged callback
                            // handle its rejected API call; root/identity failures
                            // remain terminal. Never hide this refusal.
                            const phase = phaseScope.getStore() ?? entry.lastPhase ?? 'load';
                            const conflicts = entry.storageConflicts ??= new Map();
                            // Operation-keyed v2 messages are reclaimable after
                            // ACK; recurring soft refusals must not fill the
                            // global terminal-failure receipt pool. Capacity is
                            // still critical for this parent-owned warning.
                            if (!conflicts.has(phase)) conflicts.set(phase, record({ ...common(entry, phase),
                                code: 'plugin_message', level: 'error', eventKey: `plugin:${entry.index}:${entry.identity}:${phase}:local-conflict`,
                                message: '다른 작업에서 변경한 플러그인 값을 보존하고 이번 저장을 생략했어요. 요청은 플러그인의 오류 처리에 따라 완료되거나 중단될 수 있어요.' }));
                            await conflicts.get(phase);
                            throw noticeFailure ?? error;
                        }
                        if (error?.code === 'plugin_identity_unavailable') throw latchIdentityFailure();
                        if (error?.code === 'plugin_identity_reload_required') {
                            disable(entry, 'plugin_api_unsupported', 'plugin_identity_cache_unstable', phaseScope.getStore() ?? entry.lastPhase ?? 'load',
                                hostIdentityFailures.has(error) ? 'identity' : 'execution');
                            throw error;
                        }
                        if (!identityFailure && !['plugin_invocation_expired', 'plugin_budget_exceeded'].includes(error?.code)) {
                            disable(entry, error?.code ?? 'plugin_hook_failed', method, undefined,
                                hostIdentityFailures.has(error) ? 'identity' : 'execution');
                        }
                        throw error;
                    }
                }) }));
                await phaseScope.run('load', () => entry.session.load());
                await phaseScope.run('load', () => collectAbsent(entry, 'load'));
                if (!entry.failed) { entry.ready = true; install(entry); }
            } catch (error) {
                if (identityFailure) throw identityFailure;
                // Read before disable closes the worker; never throws.
                if (!entry.ready) await phaseScope.run('load', () => collectAbsent(entry, 'load'));
                if (identityFailure) throw identityFailure;
                disable(entry, error?.code ?? 'plugin_hook_failed');
            }
            await noticesSettled();
        }
    } catch (error) {
        apiSlots.close(); writeSlots.close();
        for (const entry of entries) entry.apiSlots.close();
        for (const cleanup of cleanups.reverse()) cleanup();
        await Promise.all(entries.map(entry => entry.session?.close()));
        await publishSummaries();
        throw error;
    }
    return {
        hasProvider(name) {
            return !closed && !tearingDown && !conflictedProviders.has(name) && typeof bindings.registry.providers.get(name) === 'function'
                && entries.some(entry => !entry.failed && entry.registrations.some(row => row.type === 'provider'
                    && row.name === name && typeof row.remove === 'function'));
        },
        async refreshIdentity() {
            if (!closed && !tearingDown) checkedIdentity(getDatabase());
            await noticesSettled();
        },
        assertNotifications: async () => { if (identityFailure) throw identityFailure; await noticesSettled(); },
        async close() {
            if (closed) return;
            tearingDown = true;
            for (const entry of entries) entry.closing = true;
            // Original callbacks may release local state and unregister hooks,
            // but cannot start effects. OS teardown remains authoritative.
            let timer;
            // The final absent-API read shares the existing one-second unload bound.
            const deadline = performance.now() + 1000;
            await Promise.race([
                Promise.allSettled(entries.filter(entry => !entry.failed).flatMap(entry => entry.unload.map(callback => callback()))),
                new Promise(resolve => { timer = setTimeout(resolve, 1000); }),
            ]);
            clearTimeout(timer);
            await Promise.all(entries.map(entry => collectAbsent(entry, entry.lastPhase ?? 'load', deadline)));
            for (const entry of entries) entry.abort.abort(fail('plugin_operation_closed'));
            closed = true;
            apiSlots.close(); writeSlots.close();
            for (const entry of entries) entry.apiSlots.close();
            for (const cleanup of cleanups.reverse()) cleanup();
            await Promise.all(entries.map(entry => entry.session?.close()));
            await publishSummaries();
        },
    };
}

module.exports = { createBgPluginHost, SUPPORTED_ROOT_METHODS };
