'use strict';
const { normalizeEvent, idOf, MAX_ROWS, NOTIFICATION_TTL_MS } = require('./bgNotifications.cjs');
const { operationStateKey, readOperationState } = require('./bgOrchestrationOperationStore.cjs');
const PREFIX = 'internal/bg-operation-notice-intents/v1/';
const CODES = new Set(['operation_failed', 'operation_interrupted', 'chat_edit_unreflected', 'commit_effect_conflict']);

function stateEvents(state, options = {}) {
    if (state?.notificationSourceVersion !== 1 || !Number.isSafeInteger(state.notificationCreatedAt)
        || state.notificationCreatedAt <= 0) return [];
    if (state.operationNotice) {
        const event = normalizeEvent(state.operationNotice);
        const terminal = event.code === 'operation_failed' && event.eventKey === 'operation:terminal';
        const interrupted = event.code === 'operation_interrupted' && event.eventKey === 'operation:interrupted:' + event.reason;
        if ((!terminal && !interrupted)
            || event.operationId !== state.operationId || event.charId !== state.charId || event.chatId !== state.chatId
            || event.createdAt !== state.notificationCreatedAt) throw new Error('operation_notice_source_mismatch');
        return [event];
    }
    const { active = false, outcome = null } = typeof options === 'function' ? options() : options;
    if (active || outcome?.noticeHandled || outcome?.cancelled || ['delivered', 'cancelled', 'chat-committed'].includes(state.state)) return [];
    const base = { operationId: state.operationId, charId: state.charId, chatId: state.chatId,
        createdAt: state.notificationCreatedAt, effectsMayHaveOccurred: true };
    if (outcome?.committed) return [];
    if (outcome?.final && outcome.failed) return [normalizeEvent({ ...base, code: 'operation_failed',
        eventKey: 'operation:terminal', reason: outcome.commitFailed ? 'commit_failed' : 'generation_failed' })];
    if (outcome?.final) return [];
    if (state.state === 'delivery-failed') return [normalizeEvent({ ...base, code: 'operation_failed',
        eventKey: 'operation:terminal', reason: 'commit_failed' })];
    if (['queued', 'running', 'running-result-consumed', 'running-result-ready'].includes(state.state)) {
        if (state.state === 'queued' && !outcome?.inputIrretryable) return [];
        const reason = ['running-result-consumed', 'running-result-ready'].includes(state.state) ? 'after_main' : 'before_result';
        return [normalizeEvent({ ...base, code: 'operation_interrupted', reason, eventKey: 'operation:interrupted:' + reason })];
    }
    return [];
}

function commitEvents(record) {
    if (record?.notificationVersion !== 3 || !Number.isSafeInteger(record.notificationCreatedAt)) return [];
    const base = { operationId: record.operationId, charId: record.recovery.requestedCharId,
        chatId: record.recovery.storedChatId, createdAt: record.notificationCreatedAt, effectsMayHaveOccurred: true };
    const events = [];
    if (record.recovery.notificationGenerationFailed === true) {
        events.push(normalizeEvent({ ...base, eventKey: 'operation:terminal', code: 'operation_failed', reason: 'generation_failed' }));
    }
    if (record.commitReceipt.promptInputsChanged === true
        || (record.commitReceipt.promptInputsChanged === undefined
            && record.commitReceipt.effects.chat.reason === 'concurrent-chat-edit-preserved')) {
        events.push(normalizeEvent({ ...base, eventKey: 'commit:edit-unreflected', code: 'chat_edit_unreflected', reason: 'concurrent_edit' }));
    }
    for (const kind of ['globals', 'stats']) if (['conflict', 'failed'].includes(record.commitReceipt.effects[kind].status)) {
        events.push(normalizeEvent({ ...base, eventKey: 'commit:effect-conflict:' + kind, code: 'commit_effect_conflict', reason: kind }));
    }
    return events;
}

function createBgOperationNotices({ db, kvGet, kvSet, kvDel, kvList, publish, now = Date.now }) {
    let reported = false;
    const deferred = () => {
        if (!reported) { reported = true; try { console.warn('[BGOperationNotice] durable notice dispatch deferred'); } catch {} }
        return false;
    };
    function eventOf(value) {
        const event = normalizeEvent(value);
        if (!CODES.has(event.code)) throw new Error('operation_notice_code_invalid');
        return event;
    }
    function read(id) {
        const raw = kvGet(PREFIX + id);
        if (raw == null) return null;
        try {
            const row = JSON.parse(String(raw)), event = eventOf(row.event);
            if (row.version !== 1 || idOf(event) !== id || row.expiresAt !== event.createdAt + NOTIFICATION_TTL_MS
                || ![null, 'published', 'expired'].includes(row.settled)) throw new Error('invalid');
            return { version: 1, event, expiresAt: row.expiresAt, settled: row.settled };
        } catch { throw new Error('operation_notice_record_invalid'); }
    }
    const write = (id, row) => kvSet(PREFIX + id, JSON.stringify(row));
    const preserveStateEvent = db.transaction((state, event) => {
        const current = readOperationState(kvGet, state.operationId);
        if (!current || current.notificationSourceVersion !== 1
            || current.notificationCreatedAt !== state.notificationCreatedAt
            || current.charId !== state.charId || current.chatId !== state.chatId
            || current.state !== state.state) return false;
        if (current.operationNotice) return JSON.stringify(stateEvents(current)[0]) === JSON.stringify(event);
        // Keep the observed fact independently of result payload eviction.
        // Source time stays fixed. Materializing this fact writes state once;
        // subsequent retries use the stamp without refreshing its KV clock.
        kvSet(operationStateKey(state.operationId), JSON.stringify({ ...current, operationNotice: event }));
        return true;
    });
    function keyId(key) {
        if (typeof key !== 'string' || !key.startsWith(PREFIX) || !/^[a-f0-9]{64}$/.test(key.slice(PREFIX.length))) {
            throw new Error('operation_notice_record_invalid');
        }
        return key.slice(PREFIX.length);
    }
    function pruneExpired() {
        for (const key of kvList(PREFIX)) {
            try {
                const id = keyId(key);
                const row = read(id);
                if (row && row.expiresAt <= now()) kvDel(key);
            } catch (error) {
                if (error.message !== 'operation_notice_record_invalid') throw error;
                deferred(); // Preserve malformed bytes and include them in capacity.
            }
        }
    }
    const ensure = db.transaction(value => {
        const event = eventOf(value), id = idOf(event);
        if (event.createdAt + NOTIFICATION_TTL_MS <= now()) return { id, expired: true };
        const previous = read(id);
        if (previous) {
            if (JSON.stringify(previous.event) !== JSON.stringify(event)) throw new Error('operation_notice_identity_conflict');
            return { id, expired: false };
        }
        pruneExpired();
        if (kvList(PREFIX).length >= MAX_ROWS) throw new Error('operation_notice_capacity');
        write(id, { version: 1, event, expiresAt: event.createdAt + NOTIFICATION_TTL_MS, settled: null });
        return { id, expired: false };
    });
    const dispatch = db.transaction(id => {
        const row = read(id);
        if (!row || row.settled) return true;
        if (row.event.createdAt > now()) return false;
        const outcome = row.expiresAt <= now() ? { status: 'expired' } : publish(row.event);
        if (!['stored', 'duplicate', 'expired'].includes(outcome?.status)) return false;
        write(id, { ...row, settled: outcome.status === 'expired' ? 'expired' : 'published' });
        return true;
    });
    function capture(value) {
        try {
            // Persist retry authority first. Outbox failure cannot undo this
            // intent or downgrade the independently committed primary outcome.
            const result = ensure(value);
            return result.expired || dispatch(result.id) || deferred();
        } catch { return deferred(); }
    }
    function hasAuthority(value) {
        try {
            const event = eventOf(value);
            if (event.createdAt + NOTIFICATION_TTL_MS <= now()) return true;
            const row = read(idOf(event));
            return !!row && JSON.stringify(row.event) === JSON.stringify(event);
        } catch { return false; }
    }
    function canRetire(value) {
        if (hasAuthority(value)) return true;
        capture(value);
        return hasAuthority(value);
    }
    function retry() {
        try {
            pruneExpired();
            for (const key of kvList(PREFIX)) {
                try { if (!dispatch(keyId(key))) deferred(); }
                catch (error) {
                    if (error.message !== 'operation_notice_record_invalid') throw error;
                    deferred();
                }
            }
        } catch { deferred(); }
    }
    function captureState(state, options) {
        try { for (const event of stateEvents(state, options)) {
            if (!state.operationNotice && event.createdAt + NOTIFICATION_TTL_MS > now()) {
                try { if (!preserveStateEvent(state, event)) deferred(); } catch { deferred(); }
            }
            capture(event);
        } }
        catch { deferred(); }
    }
    function canRetireState(state, options) {
        try { return stateEvents(state, options).every(canRetire); }
        catch {
            deferred();
            return state?.notificationSourceVersion === 1 && Number.isSafeInteger(state.notificationCreatedAt)
                && state.notificationCreatedAt > 0 && state.notificationCreatedAt + NOTIFICATION_TTL_MS <= now();
        }
    }
    function captureCommit(record) {
        try { for (const event of commitEvents(record)) capture(event); }
        catch { deferred(); }
    }
    function terminalEvent(operationId, meta, reason) {
        return eventOf({ operationId, charId: meta.charId, chatId: meta.chatId, eventKey: 'operation:terminal',
            code: 'operation_failed', reason, createdAt: meta.notificationCreatedAt, effectsMayHaveOccurred: true });
    }
    return { capture, canRetire, retry, captureState, canRetireState, captureCommit, terminalEvent };
}

module.exports = { createBgOperationNotices, stateEvents, commitEvents, PREFIX };
