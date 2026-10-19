'use strict';
// Storage reset ownership of BG state: final recovery cleanup inside each reset
// transaction, and cancellation of runs and waiting inputs inside the reset slot.
const targetVersions = { pocketrisu: ['1.10.0'] };
module.exports = prior => {
    const units = [];
    const add = (name, anchor, content) => units.push({
        id: `lazy-chat-bg-adapter:storage-reset:${name}:1.10`,
        file: 'server/node/server.cjs', type: 'insert', where: 'after', anchor, content, targetVersions,
        requires: ['lazy-chat-bg-adapter:queue:shared-registry'],
        after: [...prior, ...units].filter(unit => unit.file === 'server/node/server.cjs').map(unit => unit.id),
    });
    add('recovery-cleanup', '    // Owners of other recovery namespaces extend this cleanup.\n',
        `    // Every BG operation row (legacy runs included) and the input and commit
    // owners' recovery namespaces, after the restored rows are applied.
    serverChatInputOwner.discardDurableRecovery();
    serverChatCommitOwner.discardDurableRecovery();
    {
        const { OPERATION_STATE_PREFIX, OPERATION_RESULT_PREFIX } = require('./bgOrchestrationOperationStore.cjs');
        kvDelPrefix(OPERATION_STATE_PREFIX);
        kvDelPrefix(OPERATION_RESULT_PREFIX);
    }
`);
    add('cancel-runs', "                storageResetTestHooks.trace('cancel-persistence-timers', { kind });\n",
        `                // Inside the reset slot, before the first destructive write and
                // without waiting for providers. Correctness rests on the storage
                // epoch and the recovery cleanup; this stops provider cost.
                bgQueueRuns.cancelAll('storage-reset');
                storageResetTestHooks.trace('cancel-runs', { kind });
                serverChatInputOwner.resetWaitingDrain();
                storageResetTestHooks.trace('reset-input-drain', { kind });
`);
    return units;
};
