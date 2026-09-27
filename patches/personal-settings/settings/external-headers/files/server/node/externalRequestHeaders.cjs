'use strict';

const { createHmac, randomBytes } = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');
const KEY = 'internal/external-request-headers/v1';
const context = new AsyncLocalStorage();
const forbidden = new Set(['authorization', 'cookie', 'cookie2', 'set-cookie', 'host',
    'connection', 'keep-alive', 'te', 'trailer', 'transfer-encoding', 'upgrade',
    'content-length', 'content-type', 'content-encoding', 'origin', 'referer', 'forwarded', 'x-client-build']);

function invalid() {
    const error = new Error('Invalid external request header rules');
    error.status = 400;
    return error;
}

function validateRules(rules) {
    if (!Array.isArray(rules) || rules.length > 32) throw invalid();
    const ids = new Set();
    return rules.map(rule => {
        if (!rule || typeof rule !== 'object' || Array.isArray(rule)
            || typeof rule.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(rule.id)
            || ids.has(rule.id) || typeof rule.name !== 'string' || !rule.name.trim()
            || rule.name.length > 120 || typeof rule.enabled !== 'boolean'
            || typeof rule.destination !== 'string' || rule.destination.length > 2048
            || typeof rule.header !== 'string' || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}$/.test(rule.header)
            || rule.valueKind !== 'conversation-session') throw invalid();
        let url;
        try { url = new URL(rule.destination); } catch { throw invalid(); }
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
            || /[\\*\s]/.test(rule.destination)) throw invalid();
        const header = rule.header.toLowerCase();
        if (forbidden.has(header) || /^(?:risu-|x-risu-|proxy-|sec-|x-forwarded-)/.test(header)) throw invalid();
        ids.add(rule.id);
        return { id: rule.id, name: rule.name.trim(), enabled: rule.enabled,
            destination: url.origin + url.pathname, header, valueKind: 'conversation-session' };
    });
}

function entries(headers) {
    if (headers instanceof Headers) return [...headers.entries()];
    return Array.isArray(headers) ? headers : Object.entries(headers || {});
}

function add(headers, name, value) {
    if (headers instanceof Headers) { const result = new Headers(headers); result.set(name, value); return result; }
    if (Array.isArray(headers)) return [...headers, [name, value]];
    return { ...headers, [name]: value };
}

function remove(headers, names) {
    const filtered = entries(headers).filter(([name]) => !names.has(name.toLowerCase()));
    if (headers instanceof Headers) return new Headers(filtered);
    if (Array.isArray(headers)) return filtered;
    return Object.fromEntries(filtered);
}

function matches(rule, target) {
    const destination = new URL(rule.destination);
    const prefix = destination.pathname;
    return target.origin === destination.origin
        && (target.pathname === prefix || target.pathname.startsWith(prefix.endsWith('/') ? prefix : prefix + '/'));
}

function createExternalRequestHeaders({ kvGet, kvSet, log = () => {} }) {
    function read() {
        const raw = kvGet(KEY);
        if (!raw) return { version: 1, revision: 0, rules: [], secret: null };
        let value;
        try { value = JSON.parse(String(raw)); } catch { throw new Error('External header settings unavailable'); }
        if (value.version !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 1
            || typeof value.secret !== 'string' || !/^[a-f0-9]{64}$/.test(value.secret)) {
            throw new Error('External header settings unavailable');
        }
        return { ...value, rules: validateRules(value.rules) };
    }
    function settings() {
        const { revision, rules } = read();
        return { revision, rules };
    }
    function save(body) {
        const rules = validateRules(body?.rules);
        const current = read();
        if (body.revision !== current.revision) {
            const error = new Error('Settings changed on another device. Reload before saving.');
            error.status = 409;
            throw error;
        }
        if (current.revision >= Number.MAX_SAFE_INTEGER) throw new Error('External header revision exhausted');
        const next = { version: 1, revision: current.revision + 1, rules,
            secret: current.secret || randomBytes(32).toString('hex') };
        kvSet(KEY, JSON.stringify(next));
        return { revision: next.revision, rules };
    }
    function apply(url, headers, conversationKey = context.getStore()) {
        const config = read();
        let target;
        try { target = new URL(url); } catch { return { headers, injected: [] }; }
        let result = headers;
        const injected = [];
        for (const rule of config.rules) {
            if (!rule.enabled || !matches(rule, target)) continue;
            const present = entries(result).some(([key]) => key.toLowerCase() === rule.header);
            if (!present) {
                const key = conversationKey == null ? ['fallback'] : ['chat', conversationKey];
                const value = createHmac('sha256', Buffer.from(config.secret, 'hex'))
                    .update(JSON.stringify(['external-header-v1', rule.id, key])).digest('hex');
                result = add(result, rule.header, value);
                injected.push(rule.header);
            }
            // Diagnostics cannot alter an upstream request or expose its context/value.
            try { log({ ruleId: rule.id, applied: !present }); } catch { /* logging only */ }
        }
        return { headers: result, injected };
    }
    async function fetchWithRules(fetchImpl, url, init = {}, conversationKey = context.getStore()) {
        let applied = apply(url, init.headers, conversationKey);
        if (applied.injected.length === 0) return fetchImpl(url, init);
        const redirect = init.redirect || 'follow';
        let target = new URL(url);
        let base = init;
        for (let count = 0; ; count++) {
            const response = await fetchImpl(target.href, { ...base, headers: applied.headers, redirect: 'manual' });
            if (![301, 302, 303, 307, 308].includes(response.status)
                || !response.headers.get('location') || redirect === 'manual') return response;
            await response.body?.cancel();
            if (redirect === 'error' || count >= 20) throw new TypeError('External request redirect refused');
            const next = new URL(response.headers.get('location'), target);
            if (!['http:', 'https:'].includes(next.protocol) || next.username || next.password) {
                throw new TypeError('External request redirect refused');
            }
            // Start from the caller's headers, never from injected headers. Each hop
            // must independently match a rule; a session value cannot escape its scope.
            let headers = base.headers;
            if (next.origin !== target.origin) {
                headers = remove(headers, new Set(['authorization', 'proxy-authorization', 'cookie', 'cookie2', 'host']));
            }
            const method = (base.method || 'GET').toUpperCase();
            if (((response.status === 301 || response.status === 302) && method === 'POST')
                || (response.status === 303 && method !== 'GET' && method !== 'HEAD')) {
                headers = remove(headers, new Set(['content-type', 'content-length', 'content-encoding', 'content-language', 'content-location']));
                base = { ...base, method: 'GET', body: undefined, headers };
            } else {
                if (base.body && typeof base.body.getReader === 'function') {
                    throw new TypeError('Cannot replay a streaming request body');
                }
                base = { ...base, headers };
            }
            target = next;
            applied = apply(target, base.headers, conversationKey);
        }
    }
    return { settings, save, apply, fetchWithRules };
}

let active = null;
function configureExternalRequestHeaders(dependencies) {
    active = createExternalRequestHeaders(dependencies);
    return active;
}
function fetchWithExternalHeaders(fetchImpl, url, init) {
    return active ? active.fetchWithRules(fetchImpl, url, init) : fetchImpl(url, init);
}
function withExternalHeaderConversation(key, task) { return context.run(key, task); }

function registerExternalHeaderRoutes(app, checkAuth, owner) {
    app.get('/api/external-request-headers', async (req, res, next) => {
        if (!await checkAuth(req, res)) return;
        try { res.json(owner.settings()); } catch (error) { next(error); }
    });
    app.put('/api/external-request-headers', async (req, res, next) => {
        if (!await checkAuth(req, res)) return;
        try { res.json(owner.save(req.body)); }
        catch (error) {
            if (error.status === 400 || error.status === 409) res.status(error.status).json({ error: error.message });
            else next(error);
        }
    });
}

module.exports = { KEY, validateRules, createExternalRequestHeaders, configureExternalRequestHeaders,
    fetchWithExternalHeaders, withExternalHeaderConversation, registerExternalHeaderRoutes };
