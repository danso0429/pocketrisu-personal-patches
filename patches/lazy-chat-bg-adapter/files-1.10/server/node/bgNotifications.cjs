'use strict';

const { createHash, randomUUID } = require('node:crypto');
// Fixed v1 persistence contract, initially matching BG result retention. A change
// to another subsystem's TTL must not invalidate already stored notification rows.
const NOTIFICATION_TTL_MS = 48 * 60 * 60 * 1000;
const PREFIX = 'internal/bg-notifications/v1/';
const FAILURE_PREFIX = 'internal/bg-plugin-failure-receipts/v1/';
const LEASE_MS = 30_000;
const MAX_ROWS = 1024;
const MAX_PENDING_MESSAGES = 256;
const BATCH_SIZE = 8;
const CODES = new Set(['input_host_unsupported', 'plugin_permission_missing',
    'plugin_api_unsupported', 'plugin_hook_failed', 'plugin_provider_failed', 'plugin_message', 'plugin_host_limit', 'plugin_late_call']);
const eventVersion = event => ['plugin_message', 'plugin_host_limit', 'plugin_late_call'].includes(event.code) ? 2 : 1;
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(value);
const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max
    && !/[\u0000-\u001f\u007f]/.test(value);
const idOf = event => createHash('sha256').update(JSON.stringify([event.operationId, event.eventKey])).digest('hex');
class InvalidNotificationRecord extends Error {}

function normalizeEvent(value) {
    if (!value || !CODES.has(value.code) || !identifier(value.operationId)
        || !text(value.charId, 255) || !text(value.chatId, 255)
        || typeof value.eventKey !== 'string' || !/^[A-Za-z0-9_.:-]{1,160}$/.test(value.eventKey)
        || !Number.isSafeInteger(value.createdAt) || value.createdAt <= 0
        || typeof value.effectsMayHaveOccurred !== 'boolean') throw new Error('notification_event_invalid');
    const event = {
        operationId: value.operationId, eventKey: value.eventKey, code: value.code,
        charId: value.charId, chatId: value.chatId, createdAt: value.createdAt,
        effectsMayHaveOccurred: value.effectsMayHaveOccurred,
    };
    if (value.code === 'input_host_unsupported' || value.code === 'plugin_api_unsupported') {
        if (typeof value.api !== 'string' || !/^[a-z][a-z0-9_]{2,63}$/.test(value.api)) throw new Error('notification_api_invalid');
        event.api = value.api;
    }
    if (value.code.startsWith('plugin_')) {
        if (!text(value.pluginName, 120) || !text(value.pluginVersion, 80)
            || !['load', 'input', 'before_request', 'after_request', 'provider'].includes(value.phase)
            || (value.code === 'plugin_permission_missing' && value.effectsMayHaveOccurred)) {
            throw new Error('notification_plugin_invalid');
        }
        Object.assign(event, { pluginName: value.pluginName, pluginVersion: value.pluginVersion, phase: value.phase });
    }
    if (value.code === 'plugin_message') {
        if (typeof value.message !== 'string' || value.message.length < 1 || value.message.length > 4096
            || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value.message)
            || !['info', 'warning', 'error'].includes(value.level)) throw new Error('notification_message_invalid');
        Object.assign(event, { message: value.message, level: value.level });
    }
    if (value.code === 'plugin_host_limit') {
        if (!['notification_capacity', 'operation_budget'].includes(value.reason)) throw new Error('notification_reason_invalid');
        event.reason = value.reason;
    }
    return event;
}

function createBgNotifications({ db, kvGet, kvSet, kvDel, kvList, now = Date.now }) {
    let corruptionReported = false;
    const corrupt = () => {
        if (!corruptionReported) {
            corruptionReported = true;
            try { console.warn('[BGNotification] invalid notification record retained and skipped'); } catch {}
        }
        return { invalid: true };
    };
    function read(id) {
        const raw = kvGet(PREFIX + id);
        if (raw == null) return null;
        try {
        const row = JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw));
        const event = normalizeEvent(row.event);
        if (row.version !== eventVersion(event) || row.id !== id || idOf(event) !== id
            || row.expiresAt !== event.createdAt + NOTIFICATION_TTL_MS
            || (row.deliveredAt !== null && (!Number.isSafeInteger(row.deliveredAt) || row.deliveredAt <= 0))
            || (row.claim !== null && (!identifier(row.claim.consumerId) || !identifier(row.claim.token)
                || !Number.isSafeInteger(row.claim.until) || row.claim.until <= 0))) {
            throw new Error('notification_record_invalid');
        }
        return { version: row.version, id: row.id, event, expiresAt: row.expiresAt,
            deliveredAt: row.deliveredAt, claim: row.claim };
        } catch { throw new InvalidNotificationRecord('notification_record_invalid'); }
    }
    const write = row => kvSet(PREFIX + row.id, JSON.stringify(row));
    function rows() {
        return kvList(PREFIX).map(key => {
            if (typeof key !== 'string' || !key.startsWith(PREFIX)) throw new Error('notification_key_invalid');
            const id = key.slice(PREFIX.length);
            if (!/^[a-f0-9]{64}$/.test(id)) return corrupt();
            try { return read(id) || corrupt(); }
            catch (error) {
                if (error instanceof InvalidNotificationRecord) return corrupt();
                throw error; // Storage I/O failure is not a malformed individual row.
            }
        });
    }
    function unexpired(time) {
        const kept = [];
        for (const row of rows()) {
            if (!row.invalid && row.expiresAt <= time) kvDel(PREFIX + row.id);
            else kept.push(row);
        }
        return kept;
    }
    const publish = db.transaction(value => {
        const event = normalizeEvent(value), time = now();
        if (event.createdAt > time) throw new Error('notification_time_invalid');
        if (event.createdAt + NOTIFICATION_TTL_MS <= time) return { status: 'expired' };
        const id = idOf(event), previous = read(id);
        if (previous) return { status: JSON.stringify(previous.event) === JSON.stringify(event) ? 'duplicate' : 'conflict', id };
        const retained = unexpired(time);
        // Parent-owned checked-write warnings are mandatory. They share the
        // row cap and v2 ACK reclamation, but guest log/alert volume must not
        // consume their admission budget. Guest event keys cannot select this.
        const protectedWriteWarning = value => value.code === 'plugin_message' && value.eventKey.endsWith(':local-conflict');
        if (event.code === 'plugin_message' && !protectedWriteWarning(event)
            && retained.filter(row => !row.invalid && row.event.code === 'plugin_message'
                && !protectedWriteWarning(row.event) && row.deliveredAt === null).length >= MAX_PENDING_MESSAGES) {
            return { status: 'capacity' };
        }
        if (retained.length >= MAX_ROWS) {
            // Only new v2 message receipts are reclaimable after ACK. Frozen v1
            // failure receipts and malformed records keep their original TTL.
            const delivered = retained.filter(row => !row.invalid && row.version === 2 && row.deliveredAt !== null)
                .sort((a, b) => a.deliveredAt - b.deliveredAt)[0];
            if (!delivered) return { status: 'capacity' };
            kvDel(PREFIX + delivered.id);
        }
        write({ version: eventVersion(event), id, event, expiresAt: event.createdAt + NOTIFICATION_TTL_MS,
            deliveredAt: null, claim: null });
        return { status: 'stored', id };
    });
    const publishPluginFailure = db.transaction((value, identity) => {
        const event = normalizeEvent(value), time = now();
        if (!event.code.startsWith('plugin_') || event.code === 'plugin_message'
            || !/^[a-f0-9]{64}$/.test(identity ?? '') || event.createdAt > time) throw new Error('notification_failure_identity_invalid');
        // Preserve every existing failure group. Only the new recoverable API
        // refusal gets its own identity domain, so it cannot hide a later disable.
        const receiptIdentity = event.code === 'plugin_host_limit' && event.reason === 'operation_budget'
            && event.eventKey.endsWith(':limit') ? [identity, 'api_limit'] : identity;
        const group = createHash('sha256').update(JSON.stringify([
            receiptIdentity, event.pluginName, event.pluginVersion, event.code, event.phase,
            event.api ?? null, event.reason ?? null, event.effectsMayHaveOccurred,
        ])).digest('hex');
        const key = FAILURE_PREFIX + group;
        const parseReceipt = raw => {
            const record = JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw));
            if (record.version !== 1 || !/^[a-f0-9]{64}$/.test(record.id ?? '')
                || !Number.isSafeInteger(record.createdAt) || record.createdAt <= 0
                || record.expiresAt !== record.createdAt + NOTIFICATION_TTL_MS) throw new Error('notification_failure_receipt_invalid');
            return record;
        };
        const raw = kvGet(key);
        if (raw != null) {
            const prior = parseReceipt(raw);
            if (prior.expiresAt > time) {
                // A retained receipt also covers a v2 row reclaimed after ACK.
                // Corrupt extant notices must not be mistaken for delivered ones.
                read(prior.id);
                return { status: 'duplicate', id: prior.id };
            }
        }
        const kept = [];
        for (const receiptKey of kvList(FAILURE_PREFIX)) {
            const rawReceipt = kvGet(receiptKey); // I/O errors remain fatal.
            let receipt;
            try { receipt = parseReceipt(rawReceipt); }
            catch {
                corrupt(); kept.push(receiptKey); continue;
            }
            if (receipt.expiresAt <= time) kvDel(receiptKey); else kept.push(receiptKey);
        }
        if (kept.length >= MAX_ROWS) return { status: 'capacity' };
        const outcome = publish(event);
        if (['stored', 'duplicate'].includes(outcome.status)) {
            kvSet(key, JSON.stringify({ version: 1, id: outcome.id, createdAt: event.createdAt,
                expiresAt: event.createdAt + NOTIFICATION_TTL_MS }));
        }
        return outcome;
    });
    const claim = db.transaction((consumerId, messageVersion = 1) => {
        if (!identifier(consumerId)) throw new Error('notification_consumer_invalid');
        if (![1, 2].includes(messageVersion)) throw new Error('notification_version_invalid');
        const time = now(), result = [];
        for (const row of unexpired(time).filter(row => !row.invalid && row.version <= messageVersion)
            .sort((a, b) => a.event.createdAt - b.event.createdAt || a.id.localeCompare(b.id))) {
            if (row.deliveredAt !== null) continue;
            if (row.claim && row.claim.until > time && row.claim.consumerId !== consumerId) continue;
            if (!row.claim || row.claim.until <= time) {
                row.claim = { consumerId, token: randomUUID(), until: Math.min(time + LEASE_MS, row.expiresAt) };
                write(row);
            }
            result.push({ id: row.id, event: row.event, token: row.claim.token,
                leaseMs: Math.min(row.claim.until, row.expiresAt) - time });
            if (result.length === BATCH_SIZE) break;
        }
        return result;
    });
    const acknowledge = db.transaction((consumerId, claims) => {
        if (!identifier(consumerId) || !Array.isArray(claims) || claims.length > BATCH_SIZE
            || new Set(claims.map(row => row?.id)).size !== claims.length
            || claims.some(row => !row || typeof row.id !== 'string' || !/^[a-f0-9]{64}$/.test(row.id) || !identifier(row.token))) {
            throw new Error('notification_ack_invalid');
        }
        const acknowledged = [], time = now();
        for (const item of claims) {
            const row = read(item.id);
            if (!row || row.expiresAt <= time || row.claim?.consumerId !== consumerId || row.claim?.token !== item.token) continue;
            if (row.deliveredAt === null) { row.deliveredAt = time; write(row); }
            acknowledged.push(row.id);
        }
        return acknowledged;
    });
    return { publish, publishPluginFailure, claim, acknowledge };
}

module.exports = { createBgNotifications, normalizeEvent, PREFIX, LEASE_MS, MAX_ROWS, BATCH_SIZE, NOTIFICATION_TTL_MS };
