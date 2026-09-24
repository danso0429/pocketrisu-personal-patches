'use strict';

const { isDeepStrictEqual } = require('node:util');

const DYNAMIC_ROOT_FIELDS = Object.freeze([
    'globalChatVariables',
    'statics',
]);

function own(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
}

function requireDatabase(name, value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${name} settings database is invalid`);
    }
    return value;
}

function requireGlobals(value) {
    if (value === undefined) return {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('server chat global lineage is invalid');
    }
    return structuredClone(value);
}

function applyGlobalLineage(globals, intent, outcomes) {
    if (!intent || typeof intent !== 'object' || Array.isArray(intent)
        || !intent.changed || typeof intent.changed !== 'object'
        || Array.isArray(intent.changed) || !Array.isArray(intent.deleted)
        || !Array.isArray(outcomes)) {
        throw new Error('server chat effect lineage is invalid');
    }
    const keys = [...new Set([...Object.keys(intent.changed), ...intent.deleted])].sort();
    if (keys.length !== outcomes.length || outcomes.some((entry, index) => (
        entry?.key !== keys[index] || entry.status !== 'committed'
    ))) {
        throw new Error('server chat effect lineage is unresolved');
    }
    for (const key of keys) {
        if (own(intent.changed, key)) {
            Object.defineProperty(globals, key, {
                value: structuredClone(intent.changed[key]),
                enumerable: true,
                writable: true,
                configurable: true,
            });
        }
        else delete globals[key];
    }
}

function applyStaticsLineage(snapshotStatics, effect) {
    if (effect === null) return snapshotStatics;
    if (!effect || !Number.isSafeInteger(effect.staticsMessagesAppliedDelta)
        || effect.staticsMessagesAppliedDelta < 0
        || !['committed', 'skipped', 'failed'].includes(effect.statsStatus)) {
        throw new Error('server chat statics lineage is invalid');
    }
    const delta = effect.staticsMessagesAppliedDelta;
    if (effect.statsStatus !== 'committed' || delta === 0) return snapshotStatics;
    if (!snapshotStatics || typeof snapshotStatics !== 'object'
        || Array.isArray(snapshotStatics)) {
        throw new Error('server chat statics owner is unavailable');
    }
    const statics = structuredClone(snapshotStatics);
    const old = statics.bgOrchestrationApplied;
    const ledger = old === undefined ? [] : Array.isArray(old) ? old : [old];
    if (ledger.some((entry) => !entry || typeof entry !== 'object'
        || typeof entry.operationId !== 'string'
        || !Number.isSafeInteger(entry.cumulative) || entry.cumulative <= 0)) {
        throw new Error('server chat statics ledger is invalid');
    }
    const prior = ledger.find((entry) => entry.operationId === effect.operationId)?.cumulative || 0;
    if (prior > delta) throw new Error('server chat statics lineage exceeds receipt');
    if (prior < delta) {
        statics.messages = (Number.isFinite(statics.messages) ? statics.messages : 0)
            + (delta - prior);
    }
    statics.bgOrchestrationApplied = [
        ...ledger.filter((entry) => entry.operationId !== effect.operationId),
        { operationId: effect.operationId, cumulative: delta },
    ];
    return statics;
}

function overlayServerChatDynamicState(snapshotDatabase, currentDatabase, lineage) {
    const snapshot = requireDatabase('snapshot', snapshotDatabase);
    const current = requireDatabase('current', currentDatabase);
    const resolution = lineage?.resolution;
    const input = lineage?.input;
    const response = lineage?.response;
    if (!resolution || typeof resolution.operationId !== 'string'
        || !['completed', 'failed', 'cancelled'].includes(resolution.state)
        || !input || input.operationId !== resolution.operationId) {
        throw new Error('server chat predecessor lineage is unavailable');
    }
    if (resolution.state === 'completed') {
        if (!response || response.operationId !== resolution.operationId
            || response.inputReceiptId !== input.inputReceipt?.receiptId
            || response.storedRevision !== resolution.revision) {
            throw new Error('server chat response lineage is unavailable');
        }
    } else if (response !== null) {
        throw new Error('server chat terminal lineage is inconsistent');
    }

    const expectedGlobals = requireGlobals(snapshot.globalChatVariables);
    if (input.inputReceipt) {
        applyGlobalLineage(expectedGlobals, input.globalIntent, input.globalOutcomes);
    }
    if (response) {
        applyGlobalLineage(expectedGlobals, response.globalIntent, response.globalOutcomes);
    }
    if (!isDeepStrictEqual(expectedGlobals, requireGlobals(current.globalChatVariables))) {
        throw new Error('server chat global lineage changed outside predecessor receipts');
    }
    const expectedStatics = applyStaticsLineage(snapshot.statics, response);
    if (!isDeepStrictEqual(expectedStatics, current.statics)) {
        throw new Error('server chat statics lineage changed outside predecessor receipt');
    }

    // Only prompt-facing roots may move after admission, and only when their
    // current values equal the predecessor input/response effect receipts.
    // Owner/recovery roots stay captured; the canonical commit owner writes
    // their current values separately and never publishes this cloned DB.
    for (const field of DYNAMIC_ROOT_FIELDS) {
        if (own(current, field)) snapshot[field] = structuredClone(current[field]);
        else delete snapshot[field];
    }
    return snapshot;
}

module.exports = {
    DYNAMIC_ROOT_FIELDS,
    overlayServerChatDynamicState,
};
