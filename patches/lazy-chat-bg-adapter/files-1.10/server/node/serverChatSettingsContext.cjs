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
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || !Array.isArray(value.characters)) {
        throw new Error(`${name} settings database is invalid`);
    }
    return value;
}

function overlayServerChatDynamicState(snapshotDatabase, currentDatabase, charId) {
    const snapshot = requireDatabase('snapshot', snapshotDatabase);
    const current = requireDatabase('current', currentDatabase);
    if (typeof charId !== 'string' || !charId) {
        throw new Error('settings context character identity is invalid');
    }
    for (const field of DYNAMIC_ROOT_FIELDS) {
        if (own(current, field)) snapshot[field] = structuredClone(current[field]);
        else delete snapshot[field];
    }
    const snapshotIndex = snapshot.characters.findIndex((character) => character?.chaId === charId);
    const currentCharacter = current.characters.find((character) => character?.chaId === charId);
    if (snapshotIndex < 0 || !currentCharacter || !Array.isArray(currentCharacter.chats)) {
        throw new Error('settings context character metadata is unavailable');
    }
    const characters = snapshot.characters.slice();
    characters[snapshotIndex] = {
        ...characters[snapshotIndex],
        chats: structuredClone(currentCharacter.chats),
    };
    snapshot.characters = characters;
    return snapshot;
}

module.exports = {
    DYNAMIC_ROOT_FIELDS,
    overlayServerChatDynamicState,
};
