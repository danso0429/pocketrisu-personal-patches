'use strict';
const { AsyncLocalStorage } = require('node:async_hooks');
const { isDeepStrictEqual } = require('node:util');
const { randomUUID } = require('node:crypto');
const { createPluginSession } = require('./bgPluginSession.cjs');
const { createPluginStorage, savedPluginPermission } = require('./bgPluginStorage.cjs');
const { clonePluginValue, measurePluginValue } = require('./bgPluginValue.cjs');
const { createTransportCounter } = require('./bgPluginDiagnostics.cjs');

const fail = code => Object.assign(new Error(code), { code });
const { clean, identityOf, pluginMetadata } = require('./bgPluginMetadata.cjs');
const clone = clonePluginValue;
const phaseScope = new AsyncLocalStorage();
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
    const entries = [], cleanups = [], notices = [], names = new Set(), omittedNames = new Set();
    let closed = false, tearingDown = false, noticeFailure = null, identityFailure = null;
    let messageCapacityReported = false;
    let diagnosticFailureReported = false;
    const publishSummaries = async () => {
        if (typeof publishDiagnostic !== 'function') return;
        for (const entry of entries) {
            const summary = entry.transport?.snapshot();
            if (!summary?.calls) continue;
            try {
                const metadata = common(entry, entry.lastPhase ?? 'load');
                await publishDiagnostic({ version: 1, id: entry.diagnosticId, createdAt: Date.now(),
                    pluginName: metadata.pluginName, pluginVersion: metadata.pluginVersion, ...summary });
            } catch {
                if (!diagnosticFailureReported) {
                    diagnosticFailureReported = true;
                    try { console.warn('[BGPluginDiagnostics] summary storage unavailable'); }
                    catch { /* Diagnostic logging must not change the generation outcome. */ }
                }
            }
        }
    };
    let rootWrites = 0, writtenBytes = 0, networkCalls = 0;
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
    const withApiBudget = async (entry, method, args, task) => {
        if (noticeFailure) throw noticeFailure;
        if (identityFailure) throw identityFailure;
        try {
            let bytes = 0, charged = false;
            try {
                bytes = measurePluginValue(args);
                if (entry.pendingBytes + bytes > 4 * 1024 * 1024) throw fail('plugin_budget_exceeded');
                entry.pendingBytes += bytes; charged = true;
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
                // Release byte/slot ownership before awaiting any durable warning.
                if (charged) entry.pendingBytes -= bytes;
            }
        } catch (error) {
            if (['plugin_budget_exceeded', 'plugin_value_limit'].includes(error?.code)
                && !closed && !tearingDown && !entry.closing && !entry.failed && !signal.aborted && !noticeFailure) {
                await reportApiLimit(entry);
            }
            throw noticeFailure ?? error;
        }
    };
    const write = async (args, task) => {
        const bytes = Buffer.byteLength(JSON.stringify(args) ?? '');
        if (rootWrites >= 64 || writtenBytes + bytes > 8 * 1024 * 1024) throw fail('plugin_budget_exceeded');
        rootWrites++; writtenBytes += bytes;
        return writeSlots.run(task);
    };
    const record = (event, capacityIsCritical = true) => {
        const pending = Promise.resolve().then(() => publishNotification(event,
            event.code === 'plugin_message' ? undefined : event.failureIdentity)).then(result => {
            if (result?.status === 'capacity') {
                if (!capacityIsCritical) return;
                if (event.code === 'plugin_message') {
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
    const disable = (entry, code, api, phaseOverride) => {
        if (entry.failed || entry.closing || signal.aborted || noticeFailure) return;
        entry.failed = true;
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
            if (view.counts.get(entry.plugin.name) > 1) disable(entry, 'plugin_api_unsupported', 'plugin_identity_ambiguous', phase);
            else if (!current || position >= 16 || current.script !== entry.plugin.script
                || current.version !== entry.plugin.version || view.reordered.has(entry)) disable(entry, 'plugin_identity_changed', undefined, phase);
        }
        for (const [index, plugin] of view.enabled.entries()) {
            if (!names.has(plugin.name) && !omittedNames.has(plugin.name)) {
                omittedNames.add(plugin.name);
                const entry = { plugin, index, effects: false, abort: new AbortController(), failed: false, identity: identityOf(plugin) };
                disable(entry, 'plugin_api_unsupported', 'plugin_set_changed', phase);
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
    const invoke = (entry, kind, callback, contract = 'replacer') => async (...args) => {
        const provider = kind === 'provider';
        if (noticeFailure) throw noticeFailure;
        if (identityFailure) throw identityFailure;
        if (closed || entry.failed) {
            await noticesSettled();
            if (provider) throw fail('plugin_provider_failed');
            return args[0];
        }
        return phaseScope.run(kind, async () => {
            entry.lastPhase = kind;
            try {
                await currentIdentity(kind);
                await noticesSettled();
                if (closed || tearingDown || signal.aborted) throw fail('plugin_operation_closed');
                if (entry.failed) {
                    if (provider) throw fail('plugin_provider_failed');
                    return args[0];
                }
                if (provider) { permission(entry, 'provider', true); await effect(entry); }
                const value = await callback(...args);
                await currentIdentity(kind);
                if (entry.failed) throw fail('plugin_hook_failed');
                if (contract === 'replacer' && kind === 'before_request' && !Array.isArray(value)) throw fail('plugin_hook_result_invalid');
                if (contract === 'replacer' && kind === 'after_request' && typeof value !== 'string') throw fail('plugin_hook_result_invalid');
                if (contract === 'script' && value != null && typeof value !== 'string') throw fail('plugin_hook_result_invalid');
                if (provider && (!value || typeof value.success !== 'boolean'
                    || !(typeof value.content === 'string' || value.content instanceof ReadableStream))) throw fail('plugin_provider_result_invalid');
                if (provider && value.success === false) providerFailure(entry);
                if (!provider && value != null && !isDeepStrictEqual(value, args[0])) entry.effects = true;
                await noticesSettled();
                return value;
            } catch (error) {
                if (noticeFailure) throw noticeFailure;
                if (identityFailure) throw identityFailure;
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
            if (providerNames.has(row.name) || bindings.registry.providers.has(row.name)) throw fail('plugin_provider_name_conflict');
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
                const callback = invoke(entry, 'provider', (...args) => row.callback({ ...args[0], mode: 'v3' }, args[1]), 'provider');
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
                session: null, failed: false, ready: false, effects: operation.inputPreparedOnClient === true, messageCount: 0, pendingBytes: 0 };
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
                prepareActive: () => currentIdentity(phaseScope.getStore() ?? entry.lastPhase ?? 'load'),
                assertActive: function(latest) {
                    if (!closed && !tearingDown) {
                        const provided = arguments.length > 0;
                        const root = provided ? latest : storageOwner.peekRoot();
                        if (!provided && root == null) throw fail('plugin_identity_reload_required');
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
            try {
            entry.session = await phaseScope.run('load', () => createPluginSession({ script: plugin.script, signal: abortSignal,
                onFailure: code => disable(entry, code), onLateCall: () => reportLate(entry),
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
                            return ['setItem', 'removeItem'].includes(action) ? await write(args, task) : await task();
                        }
                        switch (method) {
                            case 'getArgument': return await storage.argument(method, args);
                            case 'setArgument': return await write(args, () => storage.argument(method, args));
                            case 'getArg': case 'setArg': {
                                if (typeof args[0] !== 'string') throw fail('plugin_api_arguments_invalid');
                                const [name, key] = args[0].split('::');
                                if (name !== plugin.name) return unsupported(method);
                                return method === 'getArg' ? await storage.argument('getArgument', [key])
                                    : await write(args, () => storage.argument('setArgument', [key, args[1]]));
                            }
                            case 'requestPluginPermission': return permission(entry, args[0]);
                            case 'addRisuReplacer':
                                permission(entry, 'replacer', true);
                                if (!['beforeRequest', 'afterRequest'].includes(args[0])) throw fail('plugin_registration_invalid');
                                register(entry, 'replacer', args[0], args[1]); return undefined;
                            case 'removeRisuReplacer': remove(entry, 'replacer', args[0], args[1]); return undefined;
                            case 'addRisuScriptHandler':
                                if (!['input', 'output', 'process', 'display'].includes(args[0])) throw fail('plugin_registration_invalid');
                                register(entry, 'script', args[0], args[1]); return undefined;
                            case 'removeRisuScriptHandler': remove(entry, 'script', args[0], args[1]); return undefined;
                            case 'registerBodyIntercepter':
                                permission(entry, 'replacer'); return { id: register(entry, 'body', 'body', args[0]) };
                            case 'unregisterBodyIntercepter':
                                if (bindings.bodyInterceptors.some(row => row.id === args[0])
                                    && !entry.registrations.some(row => row.id === args[0])) return unsupported('cross_plugin_interceptor_remove');
                                remove(entry, 'body', 'body', args[0]); return undefined;
                            case 'addProvider':
                                if (typeof args[0] !== 'string' || !args[0] || args[0].length > 120) throw fail('plugin_registration_invalid');
                                permission(entry, 'provider', true); register(entry, 'provider', args[0], args[1], args[2]); return undefined;
                            case 'onUnload':
                                if (entry.ready || typeof args[0] !== 'function' || entry.unload.length >= 64) throw fail('plugin_registration_invalid');
                                entry.unload.push(args[0]); return undefined;
                            case 'nativeFetch': case 'risuFetch': {
                                if (++networkCalls > 128) throw fail('plugin_budget_exceeded');
                                if (typeof args[0] !== 'string' || !/^https?:\/\//i.test(args[0])
                                    || ['risuai.xyz', 'risuai.net', 'sionyw.com'].some(domain => args[0].toLowerCase().includes(domain))) throw fail('plugin_fetch_target_invalid');
                                const options = args[1] ?? {};
                                if (!options || typeof options !== 'object' || Array.isArray(options)) throw fail('plugin_api_arguments_invalid');
                                const optionsSignal = method === 'nativeFetch' ? options.signal : options.abortSignal;
                                await effect(entry);
                                const scopeSignal = entry.session.currentSignal();
                                return entry.transport.observe(method, [['operationCancelled', signal], ['entryClosed', entry.abort.signal],
                                    ['scopeClosed', scopeSignal], ['requestAborted', optionsSignal]], () => bindings[method](args[0], { ...options,
                                    [method === 'nativeFetch' ? 'signal' : 'abortSignal']: AbortSignal.any([
                                        abortSignal, scopeSignal, ...(optionsSignal instanceof AbortSignal ? [optionsSignal] : [])]) }));
                            }
                            case 'runLLMModel': {
                                if (++networkCalls > 128) throw fail('plugin_budget_exceeded');
                                const options = args[0];
                                if (!options || !Array.isArray(options.messages)) throw fail('plugin_api_arguments_invalid');
                                await effect(entry);
                                const scopeSignal = entry.session.currentSignal();
                                const requestSignal = AbortSignal.any([abortSignal, scopeSignal]);
                                return entry.transport.observe('modelCalls', [['operationCancelled', signal], ['entryClosed', entry.abort.signal],
                                    ['scopeClosed', scopeSignal]], () => bindings.requestChatDataMain({ formated: options.messages, bias: {}, staticModel: options.staticModel,
                                    blockPlugins: !options.allowPlugins, abortSignal: requestSignal }, options.mode, requestSignal));
                            }
                            case 'getDatabase': return await readDatabase(args[0]);
                            case 'getDatabaseMetadata': return await readDatabase(args[0], true);
                            case 'getCurrentCharacterIndex': return getSelection().characterIndex;
                            case 'getCurrentChatIndex': return getSelection().chatIndex;
                            case 'getChar': case 'getCharacter': {
                                const character = getDatabase().characters[getSelection().characterIndex];
                                return character ? (await hydrate([character]))[0] : undefined;
                            }
                            case 'getCharacterFromIndex': {
                                if (!Number.isSafeInteger(args[0]) || args[0] < 0) throw fail('plugin_api_arguments_invalid');
                                const character = getDatabase().characters[args[0]];
                                return character ? (await hydrate([character]))[0] : undefined;
                            }
                            case 'getChatFromIndex': {
                                if (args.length !== 2 || args.some(value => !Number.isSafeInteger(value) || value < 0)) throw fail('plugin_api_arguments_invalid');
                                const character = getDatabase().characters[args[0]];
                                return character ? (await hydrate([character]))[0]?.chats?.[args[1]] ?? null : null;
                            }
                            case 'getRuntimeInfo': return { apiVersion: '3.0', platform: 'node', saveMethod: 'local' };
                            case 'showContainer': case 'hideContainer': case 'registerSetting': case 'registerButton':
                            case 'unregisterUIPart': case 'setChatPanel': return undefined;
                            case 'getRootDocument': return null;
                            case 'alert': case 'alertError': case 'log': {
                                if (++entry.messageCount > 33) return undefined;
                                const message = entry.messageCount === 33 ? '추가 플러그인 알림은 이 요청에서 생략되었어요.' : args.map(value => typeof value === 'string' ? value : JSON.stringify(value) ?? String(value))
                                    .join(' ').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, 4096) || '(empty)';
                                return record({ ...common(entry, phaseScope.getStore() ?? 'load'), code: 'plugin_message',
                                    eventKey: `plugin:${index}:message:${entry.messageCount}`, message,
                                    level: method === 'alertError' ? 'error' : 'info' });
                            }
                            default: return unsupported(method);
                        }
                    } catch (error) {
                        if (error?.code === 'plugin_identity_unavailable') throw latchIdentityFailure();
                        if (error?.code === 'plugin_identity_reload_required') {
                            disable(entry, 'plugin_api_unsupported', 'plugin_identity_cache_unstable', phaseScope.getStore() ?? entry.lastPhase ?? 'load');
                            throw error;
                        }
                        if (!identityFailure && !['plugin_invocation_expired', 'plugin_budget_exceeded'].includes(error?.code)) {
                            disable(entry, error?.code ?? 'plugin_hook_failed', method);
                        }
                        throw error;
                    }
                }) }));
                await phaseScope.run('load', () => entry.session.load());
                if (!entry.failed) { entry.ready = true; install(entry); }
            } catch (error) { if (identityFailure) throw identityFailure; disable(entry, error?.code ?? 'plugin_hook_failed'); }
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
            await Promise.race([
                Promise.allSettled(entries.filter(entry => !entry.failed).flatMap(entry => entry.unload.map(callback => callback()))),
                new Promise(resolve => { timer = setTimeout(resolve, 1000); }),
            ]);
            clearTimeout(timer);
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

module.exports = { createBgPluginHost };
