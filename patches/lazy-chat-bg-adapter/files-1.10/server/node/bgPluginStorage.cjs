'use strict';
const { createHash } = require('node:crypto');
const { clonePluginValue } = require('./bgPluginValue.cjs');
const { stableJSON } = require('./serverChatCommit.cjs');
const error = code => Object.assign(new Error(code), { code });
const own = (object, key) => Object.hasOwn(object ?? {}, key);
const set = (object, key, value) => Object.defineProperty(object, key,
    { value, enumerable: true, configurable: true, writable: true });
const json = bytes => bytes == null ? null : JSON.parse(Buffer.isBuffer(bytes) ? bytes.toString('utf8') : String(bytes));
const encodedKey = (prefix, key) => `${prefix}${Buffer.from(key).toString('base64url')}.json`;
const valueKey = key => encodedKey('cache/plugin-storage/', key);
const metaKey = key => encodedKey('cache/plugin-storage-meta/', key);
const keyOf = key => {
    if (typeof key !== 'string' || !key || Buffer.byteLength(key) > 4096) throw error('plugin_storage_key_invalid');
    return key;
};
const clone = clonePluginValue;
const boundedJson = value => {
    const text = JSON.stringify(clone(value));
    if (text === undefined || Buffer.byteLength(text) > 4 * 1024 * 1024) throw error('plugin_storage_value_invalid');
    return text;
};

function savedPluginPermission(kvGet, plugin, permission, periodic = false, now = Date.now()) {
    if (!['fetchLogs', 'db', 'mainDom', 'replacer', 'provider', 'sendChat'].includes(permission)) return false;
    const saved = json(kvGet('cache/plugin-permissions/state.json'));
    if (!saved || !Array.isArray(saved.given) || !Array.isArray(saved.denied) || !Array.isArray(saved.cache)) return false;
    const key = JSON.stringify([plugin.name, permission]);
    const cache = new Map(saved.cache);
    if (periodic) {
        const granted = cache.get(key + '_lastGrantTime');
        if (typeof granted !== 'number' || !Number.isFinite(granted) || now - granted > 3 * 24 * 60 * 60 * 1000) return false;
    }
    if (saved.given.includes(key)) return true;
    if (saved.denied.includes(key)) return false;
    const digest = createHash('sha256').update(plugin.script).digest('hex');
    return Boolean(cache.get(`${digest}_${permission}`));
}

// Each instance belongs to one plugin operation. The root writer is the native
// canonical storage queue; it persists the changed root before publishing ETag.
function createPluginStorage({ plugin, getRoot, writeRoot, kvGet, kvSet, kvDel, kvList,
    transaction, beforeEffect, prepareActive = async () => {}, assertActive = () => {}, onWrite = () => {}, now = Date.now }) {
    const expected = new Map();
    const rootValue = (root, key) => ({ present: own(root.pluginCustomStorage, key),
        value: own(root.pluginCustomStorage, key) ? clone(root.pluginCustomStorage[key]) : undefined });
    const fingerprint = value => createHash('sha256').update(stableJSON(value)).digest('hex');
    const remember = (type, key, value) => {
        const id = `${type}:${key}`;
        if (!expected.has(id) && expected.size >= 512) throw error('plugin_budget_exceeded');
        // Comparison receipts are memory-only and retain no copied secret value.
        expected.set(id, fingerprint(value)); return value;
    };
    const check = (type, key, value) => {
        const id = `${type}:${key}`;
        if (expected.has(id) && expected.get(id) !== fingerprint(value)) throw error('plugin_storage_conflict');
    };
    async function root(method, args) {
        const current = await getRoot();
        if (method === 'keys') return Object.keys(current.pluginCustomStorage ?? {});
        if (method === 'length') return Object.keys(current.pluginCustomStorage ?? {}).length;
        if (method === 'key') {
            if (!Number.isSafeInteger(args[0]) || args[0] < 0) throw error('plugin_storage_index_invalid');
            return Object.keys(current.pluginCustomStorage ?? {})[args[0]];
        }
        const key = keyOf(args[0]);
        if (method === 'getItem') {
            const value = remember('root', key, rootValue(current, key));
            return clone(value.value) || null; // Native pluginStorage falsy-value contract.
        }
        if (!['setItem', 'removeItem'].includes(method)) throw error('plugin_api_unsupported');
        if (!expected.has(`root:${key}`)) remember('root', key, rootValue(current, key));
        const next = method === 'setItem' ? JSON.parse(boundedJson(args[1])) : undefined;
        await beforeEffect();
        await writeRoot(latest => {
            assertActive(latest);
            check('root', key, rootValue(latest, key));
            const updated = { ...latest, pluginCustomStorage: { ...(latest.pluginCustomStorage ?? {}) },
                pluginStorageMeta: { ...(latest.pluginStorageMeta ?? {}) } };
            if (method === 'setItem') {
                set(updated.pluginCustomStorage, key, clone(next));
                set(updated.pluginStorageMeta, key, { plugin: plugin.name, updatedAt: now() });
            } else {
                delete updated.pluginCustomStorage[key]; delete updated.pluginStorageMeta[key];
            }
            return updated;
        });
        remember('root', key, { present: method === 'setItem', value: next });
        onWrite({ group: 'root', key, present: method === 'setItem', value: clone(next) });
    }
    async function local(method, args) {
        if (['keys', 'key', 'length'].includes(method)) {
            if (method === 'key' && (!Number.isSafeInteger(args[0]) || args[0] < 0)) throw error('plugin_storage_index_invalid');
            const keys = kvList('cache/plugin-storage/').map(key => {
                if (!key.endsWith('.json')) throw error('plugin_storage_record_invalid');
                return Buffer.from(key.slice('cache/plugin-storage/'.length, -5), 'base64url').toString('utf8');
            });
            return method === 'keys' ? keys : method === 'length' ? keys.length : keys[args[0]];
        }
        const key = keyOf(args[0]);
        if (method === 'getItem') return clone(remember('local', key, json(kvGet(valueKey(key)))));
        if (!['setItem', 'removeItem'].includes(method)) throw error('plugin_api_unsupported');
        const next = method === 'setItem' ? boundedJson(args[1]) : null;
        if (!expected.has(`local:${key}`)) remember('local', key, json(kvGet(valueKey(key))));
        await beforeEffect();
        const commit = () => transaction(() => {
            assertActive();
            check('local', key, json(kvGet(valueKey(key))));
            if (next !== null) {
                kvSet(valueKey(key), next);
                kvSet(metaKey(key), JSON.stringify({ plugin: plugin.name, updatedAt: now() }));
            } else { kvDel(valueKey(key)); kvDel(metaKey(key)); }
        });
        try { commit(); }
        catch (failure) {
            if (failure?.code !== 'plugin_identity_reload_required') throw failure;
            // The first transaction threw before writing anything. Reload once
            // outside it; do not repeat the effect-intent/provider callback.
            await prepareActive();
            commit();
        }
        remember('local', key, next === null ? null : JSON.parse(next));
    }
    async function argument(method, args) {
        const key = keyOf(args[0]);
        const current = await getRoot();
        const find = root => {
            const matches = (root.plugins ?? []).filter(value => value?.name === plugin.name);
            if (matches.length !== 1 || matches[0].script !== plugin.script) throw error('plugin_identity_changed');
            return matches[0];
        };
        const value = root => ({ present: own(find(root).realArg, key),
            value: own(find(root).realArg, key) ? clone(find(root).realArg[key]) : undefined });
        if (method === 'getArgument') return clone(remember('argument', key, value(current)).value);
        if (method !== 'setArgument' || typeof args[1] !== 'string') throw error('plugin_storage_value_invalid');
        boundedJson(args[1]);
        if (!expected.has(`argument:${key}`)) remember('argument', key, value(current));
        await beforeEffect();
        await writeRoot(latest => {
            assertActive(latest);
            check('argument', key, value(latest));
            const target = find(latest);
            // Copy only the matching entry and property. Never accept an entire
            // plugins array from a child or use the native setDatabase API.
            const changed = { ...target, realArg: { ...(target.realArg ?? {}) } };
            set(changed.realArg, key, args[1]);
            return { ...latest, plugins: latest.plugins.map(item => item === target ? changed : item) };
        });
        remember('argument', key, { present: true, value: args[1] });
        onWrite({ group: 'argument', key, present: true, value: args[1] });
    }
    return { root, local, argument };
}

module.exports = { createPluginStorage, savedPluginPermission };
