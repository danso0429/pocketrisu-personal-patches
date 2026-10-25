'use strict';

// Durable post-response obligation of one committed BG operation. The pending
// record is written inside the canonical commit transaction; its result is
// recorded by synchronous conditional updates that never recreate a record a
// storage reset or retention sweep removed.
const POST_RESPONSE_SYNC_PREFIX = 'bg-post-response-sync:';
const POST_RESPONSE_WINDOW_MS = 10_000;
const STATES = new Set(['pending', 'drained', 'none', 'uncertain']);
const REASONS = new Set(['deadline', 'aborted', 'error', 'restart']);

const postResponseSyncKey = operationId => POST_RESPONSE_SYNC_PREFIX + String(operationId);
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(value);
const validEntry = entry => entry && Number.isSafeInteger(entry.index) && entry.index >= 0
    && typeof entry.pluginName === 'string' && entry.pluginName.length > 0
    && typeof entry.pluginVersion === 'string' && entry.pluginVersion.length > 0;

function normalizeEntries(entries) {
    if (!Array.isArray(entries) || entries.length < 1 || !entries.every(validEntry)
        || new Set(entries.map(entry => entry.index)).size !== entries.length) {
        throw new Error('post-response sync entries are invalid');
    }
    return entries.map(({ index, pluginName, pluginVersion }) => ({ index, pluginName, pluginVersion }));
}

function createPostResponseSyncRecord({ operationId, charId, chatId, receiptId, storedRevision, storageEpoch, entries }) {
    return { version: 1, operationId, charId, chatId, receiptId, storedRevision, storageEpoch,
        createdAt: Date.now(), entries: normalizeEntries(entries), state: 'pending' };
}

function parseRecord(raw, operationId) {
    if (raw == null) return null;
    try {
        const record = JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw));
        if (!record || record.version !== 1 || record.operationId !== operationId || !STATES.has(record.state)
            || typeof record.receiptId !== 'string' || !Number.isSafeInteger(record.storageEpoch)
            || !Number.isSafeInteger(record.createdAt) || record.createdAt <= 0) return null;
        normalizeEntries(record.entries);
        return record;
    } catch { return null; }
}

// Writes `mutate(record)` only while the stored record still matches; returns
// the written record or null.
function updateRecord({ kvGet, kvSet, operationId, receiptId, storageEpoch }, mutate) {
    const key = postResponseSyncKey(operationId);
    const record = parseRecord(kvGet(key), operationId);
    if (!record || (receiptId !== undefined && record.receiptId !== receiptId) || record.storageEpoch !== storageEpoch) return null;
    const next = mutate(record);
    if (!next) return null;
    kvSet(key, JSON.stringify(next));
    return next;
}

function noticeEvent(record, entry) {
    return { operationId: record.operationId, eventKey: `plugin:${entry.index}:post-response-uncertain`,
        code: 'plugin_post_response_uncertain', charId: record.charId, chatId: record.chatId,
        createdAt: record.createdAt, effectsMayHaveOccurred: true, pluginName: entry.pluginName,
        pluginVersion: entry.pluginVersion, phase: 'post_response', reason: record.reason };
}

// Publishes each notice still marked pending, then records its delivery. A
// conflict, expired or capacity result is final (no retry); a throw leaves
// the marker pending for the next startup sweep.
async function publishPendingNotices(scope, record, publish) {
    for (const entry of record.entries) {
        if (record.notices?.[entry.index] !== 'pending') continue;
        let status;
        try { status = (await publish(noticeEvent(record, entry)))?.status; }
        catch { continue; }
        const delivered = ['stored', 'duplicate'].includes(status) ? 'published' : 'failed';
        updateRecord(scope, current => current.state === 'uncertain' && current.notices?.[entry.index] === 'pending'
            ? { ...current, notices: { ...current.notices, [entry.index]: delivered } } : null);
    }
}

const uncertainRecord = (record, reason) => ({ ...record, state: 'uncertain', reason,
    notices: Object.fromEntries(record.entries.map(entry => [entry.index, 'pending'])) });

// Records the window result of a pending obligation: state first, notices after.
async function finalizePostResponseSync({ kvGet, kvSet, publish, operationId, receiptId, storageEpoch, outcome }) {
    const scope = { kvGet, kvSet, operationId, receiptId, storageEpoch };
    const uncertain = outcome?.status === 'uncertain';
    const written = updateRecord(scope, record => record.state !== 'pending' ? null
        : uncertain ? uncertainRecord(record, REASONS.has(outcome.reason) ? outcome.reason : 'error')
            : { ...record, state: outcome?.status === 'drained' ? 'drained' : 'none' });
    if (written?.state === 'uncertain') await publishPendingNotices(scope, written, publish);
    return written;
}

// Startup: an obligation left pending becomes uncertain (restart); a notice
// left pending is published again from its recorded reason and createdAt. No
// plugin, generation or request runs again.
async function sweepPostResponseSync({ kvGet, kvSet, kvList, publish, storageEpoch }) {
    for (const key of kvList(POST_RESPONSE_SYNC_PREFIX)) {
        const operationId = key.slice(POST_RESPONSE_SYNC_PREFIX.length);
        if (!identifier(operationId)) continue;
        const scope = { kvGet, kvSet, operationId, storageEpoch };
        let record = parseRecord(kvGet(key), operationId);
        if (!record || record.storageEpoch !== storageEpoch) continue;
        if (record.state === 'pending') {
            record = updateRecord(scope, current => current.state === 'pending' ? uncertainRecord(current, 'restart') : null);
        }
        if (record?.state === 'uncertain' && REASONS.has(record.reason)) await publishPendingNotices(scope, record, publish);
    }
}

module.exports = { POST_RESPONSE_SYNC_PREFIX, POST_RESPONSE_WINDOW_MS, postResponseSyncKey,
    createPostResponseSyncRecord, finalizePostResponseSync, sweepPostResponseSync };
