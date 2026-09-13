'use strict';

const DYNAMIC_ROOT_FIELDS = Object.freeze([
    'globalChatVariables',
    'statics',
    'serverChatCommitApplied',
    'bgOrchestrationGlobalConflicts',
    'serverChatExecutionState',
    'bgOrchestrationDeliveries',
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

function overlayServerChatDynamicState(snapshotDatabase, currentDatabase) {
    const snapshot = requireDatabase('snapshot', snapshotDatabase);
    const current = requireDatabase('current', currentDatabase);
    // The caller owns predecessor-lineage validation. This helper only limits
    // the mutable overlay surface once that gate has been crossed.
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
