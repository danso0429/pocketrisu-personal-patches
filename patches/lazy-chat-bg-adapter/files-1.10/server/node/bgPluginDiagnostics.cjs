'use strict';
const { performance } = require('node:perf_hooks');
const PREFIX = 'internal/bg-plugin-transport/v1/';
const TTL_MS = 48 * 60 * 60 * 1000;
const MAX_ROWS = 256;
const MAX_CALLS = 128;
const MAX_DURATION_MS = 900000 * MAX_CALLS;
const FIELDS = ['calls', 'nativeFetch', 'risuFetch', 'modelCalls', 'http1xx', 'http2xx', 'http3xx', 'http4xx', 'http5xx',
    'resolvedWithoutStatus', 'rejected', 'scopeClosed', 'operationCancelled', 'entryClosed', 'requestAborted',
    'pending', 'durationMs', 'maxDurationMs'];
const integer = (value, max) => Number.isSafeInteger(value) && value >= 0 && value <= max;
const label = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max
    && !/[\u0000-\u001f\u007f]/.test(value);

function normalizeSummary(value) {
    if (!value || value.version !== 1 || typeof value.id !== 'string' || !/^[a-f0-9-]{36}$/.test(value.id)
        || !Number.isSafeInteger(value.createdAt) || value.createdAt < 1
        || !label(value.pluginName, 120) || !label(value.pluginVersion, 80)) throw new Error('plugin_diagnostic_invalid');
    const result = { version: 1, id: value.id, createdAt: value.createdAt,
        pluginName: value.pluginName, pluginVersion: value.pluginVersion };
    for (const field of FIELDS) {
        if (!integer(value[field], field.endsWith('Ms') ? MAX_DURATION_MS : MAX_CALLS)) throw new Error('plugin_diagnostic_invalid');
        result[field] = value[field];
    }
    if (result.calls !== result.nativeFetch + result.risuFetch + result.modelCalls
        || result.calls !== result.pending + result.rejected + result.resolvedWithoutStatus
            + result.http1xx + result.http2xx + result.http3xx + result.http4xx + result.http5xx
        || result.scopeClosed + result.operationCancelled + result.entryClosed + result.requestAborted > result.rejected
        || result.maxDurationMs > result.durationMs || result.maxDurationMs > 900000
        || result.durationMs > result.calls * 900000) {
        throw new Error('plugin_diagnostic_invalid');
    }
    return result;
}

function createTransportCounter() {
    const values = Object.fromEntries(FIELDS.map(field => [field, 0]));
    return {
        observe(method, components, task) {
            if (values.calls >= MAX_CALLS || !['nativeFetch', 'risuFetch', 'modelCalls'].includes(method)) {
                return task(); // Observation never changes the transport contract.
            }
            values.calls++; values[method]++; values.pending++;
            const started = performance.now(), listeners = [];
            let firstAbort = null;
            for (const [kind, signal] of components) {
                if (!(signal instanceof AbortSignal)) continue;
                const abort = () => {
                    if (firstAbort !== null) return;
                    firstAbort = kind;
                };
                if (signal.aborted) abort();
                else { signal.addEventListener('abort', abort, { once: true }); listeners.push([signal, abort]); }
            }
            const resolved = response => {
                // This is a response-header/result fact, never body or semantic success.
                let status;
                try { status = response?.status; }
                catch { /* An optional observation cannot replace a valid return value. */ }
                if (method !== 'modelCalls' && integer(status, 599) && status >= 100) values['http' + Math.floor(status / 100) + 'xx']++;
                else values.resolvedWithoutStatus++;
                return response;
            };
            const rejected = error => {
                values.rejected++;
                if (firstAbort !== null) values[firstAbort]++;
                throw error;
            };
            const finish = () => {
                values.pending--;
                const elapsed = Math.min(900000, Math.max(0, Math.round(performance.now() - started)));
                values.durationMs += elapsed; values.maxDurationMs = Math.max(values.maxDurationMs, elapsed);
                for (const [signal, abort] of listeners) signal.removeEventListener('abort', abort);
            };
            let returned;
            try { returned = task(); }
            catch (error) {
                try { return rejected(error); }
                finally { finish(); }
            }
            // Preserve a synchronous binding throw so the host's original
            // validation/disable boundary still observes it synchronously.
            return Promise.resolve(returned).then(resolved, rejected).finally(finish);
        },
        snapshot: () => ({ ...values }),
    };
}

function createBgPluginDiagnostics({ kvGet, kvSet, kvDel, kvList, transaction, now = Date.now }) {
    const read = key => {
        try {
            const raw = kvGet(key);
            const value = normalizeSummary(JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw)));
            if (key !== PREFIX + value.id) return null;
            return value;
        } catch (error) {
            // Invalid owned diagnostic rows are not failure receipts. I/O still
            // propagates from list/publish so callers can report unavailability.
            if (error?.message === 'plugin_diagnostic_invalid' || error instanceof SyntaxError) return null;
            throw error;
        }
    };
    return {
        publish(value) {
            const row = normalizeSummary(value), time = now();
            if (row.createdAt > time || row.createdAt + TTL_MS <= time) throw new Error('plugin_diagnostic_invalid');
            return transaction(() => {
                const rows = [];
                for (const key of kvList(PREFIX)) {
                    const prior = read(key);
                    if (!prior || prior.createdAt + TTL_MS <= time) kvDel(key);
                    else if (key !== PREFIX + row.id) rows.push(prior);
                }
                rows.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
                while (rows.length >= MAX_ROWS) kvDel(PREFIX + rows.shift().id);
                kvSet(PREFIX + row.id, JSON.stringify(row));
            });
        },
        list(limit = 50) {
            if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new Error('plugin_diagnostic_limit_invalid');
            const time = now();
            return kvList(PREFIX).map(read).filter(row => row && row.createdAt <= time && row.createdAt + TTL_MS > time)
                .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id)).slice(0, limit);
        },
    };
}

module.exports = { createTransportCounter, createBgPluginDiagnostics, normalizeSummary, PREFIX, TTL_MS, MAX_ROWS };
