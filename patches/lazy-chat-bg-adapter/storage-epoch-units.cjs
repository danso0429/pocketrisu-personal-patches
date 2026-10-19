'use strict';
// Current storage epoch on every accepted start body of POST /api/bg-orchestrate
// (both start paths) and on every accepted or `missing` body of the operation
// status route. The field is omitted when the epoch cannot be read or is not a
// non-negative safe integer; status codes and all other fields are unchanged.
module.exports = prior => {
    const units = [], targetVersions = { pocketrisu: ['1.10.0'] };
    const file = 'server/node/bgOrchestrator.cjs';
    const add = (name, anchor, content) => units.push({
        id: 'lazy-chat-bg-adapter:storage-epoch:' + name + ':1.10',
        file, type: 'replace', anchor, content, targetVersions,
        after: [...prior, ...units].filter(unit => unit.file === file).map(unit => unit.id),
    });
    add('helper',
        '  const handleOrchestrateStart = async (req, res) => {\n',
        `  // One epoch read per response; omitted when unavailable, unreadable or malformed.
  const storageEpochField = () => {
    if (typeof serverChatCommitOwner?.currentStorageEpoch !== 'function') return {}
    try {
      const storageEpoch = serverChatCommitOwner.currentStorageEpoch()
      return Number.isSafeInteger(storageEpoch) && storageEpoch >= 0 ? { storageEpoch } : {}
    } catch {
      return {}
    }
  }
  const handleOrchestrateStart = async (req, res) => {
`);
    // Start: server-input run already active for this operation.
    add('start-input-active',
        `              serverChatCommitVersion: inputActiveExisting.serverChatCommitVersion === 1 ? 1 : 0,
              inputCommandVersion: 1,
`,
        `              serverChatCommitVersion: inputActiveExisting.serverChatCommitVersion === 1 ? 1 : 0,
              inputCommandVersion: 1,
              ...storageEpochField(),
`);
    // Start: server input admitted and queued behind its predecessor (202).
    add('start-input-waiting',
        `              predecessorOperationId: serverInputExecution.predecessorOperationId,
              reason: serverInputExecution.reason,
              resultKeyVersion: 1,
              serverChatCommitVersion: 1,
              inputCommandVersion: 1,
`,
        `              predecessorOperationId: serverInputExecution.predecessorOperationId,
              reason: serverInputExecution.reason,
              resultKeyVersion: 1,
              serverChatCommitVersion: 1,
              inputCommandVersion: 1,
              ...storageEpochField(),
`);
    // Start: run already active in this process.
    add('start-active',
        '            inputCommandVersion: activeExisting.inputCommandVersion === 1 ? 1 : 0,\n',
        `            inputCommandVersion: activeExisting.inputCommandVersion === 1 ? 1 : 0,
            ...storageEpochField(),
`);
    // Start: durable operation past `queued` (paid-work tombstone, reused).
    add('start-durable',
        '                inputCommandVersion: durable.inputCommandVersion === 1 ? 1 : 0,\n',
        `                inputCommandVersion: durable.inputCommandVersion === 1 ? 1 : 0,
                ...storageEpochField(),
`);
    // Start: registry reports the same operation already running.
    add('start-running',
        '            inputCommandVersion: started.run.inputCommandVersion === 1 ? 1 : 0,\n',
        `            inputCommandVersion: started.run.inputCommandVersion === 1 ? 1 : 0,
            ...storageEpochField(),
`);
    // Start: new run started.
    add('start-success',
        `          resultKeyVersion,
          serverChatCommitVersion,
          inputCommandVersion,
        })
`,
        `          resultKeyVersion,
          serverChatCommitVersion,
          inputCommandVersion,
          ...storageEpochField(),
        })
`);
    // Status: generation committed to the chat.
    add('status-committed',
        `        state: 'chat-committed',
        resultKeyVersion: 1,
        serverChatCommit: committed.receipt,
`,
        `        state: 'chat-committed',
        resultKeyVersion: 1,
        serverChatCommit: committed.receipt,
        ...storageEpochField(),
`);
    // Status: server input command.
    add('status-input',
        `        state,
        resultKeyVersion: 1,
        serverChatCommitVersion: 1,
        inputCommandVersion: 1,
`,
        `        state,
        resultKeyVersion: 1,
        serverChatCommitVersion: 1,
        inputCommandVersion: 1,
        ...storageEpochField(),
`);
    // Status: run known to this process.
    add('status-run',
        '      return res.json({ accepted: true, operationId, state, resultKeyVersion: run.resultKeyVersion || 0, ...operationProgress(operationId, run) })\n',
        '      return res.json({ accepted: true, operationId, state, resultKeyVersion: run.resultKeyVersion || 0, ...operationProgress(operationId, run), ...storageEpochField() })\n');
    // Status: parked operation-keyed result.
    add('status-parked',
        "        return res.json({ accepted: true, operationId, state: 'result-ready', resultKeyVersion: 1 })\n",
        "        return res.json({ accepted: true, operationId, state: 'result-ready', resultKeyVersion: 1, ...storageEpochField() })\n");
    // Status: rolling result parked under the char/chat key.
    add('status-legacy-parked',
        "        return res.json({ accepted: true, operationId, state: 'result-ready', resultKeyVersion: 0 })\n",
        "        return res.json({ accepted: true, operationId, state: 'result-ready', resultKeyVersion: 0, ...storageEpochField() })\n");
    // Status: durable `queued` row answers the restartable `missing` shape.
    add('status-durable-queued',
        `        if (durable.state === 'queued') {
          return res.status(404).json({ accepted: false, operationId, state: 'missing' })
`,
        `        if (durable.state === 'queued') {
          return res.status(404).json({ accepted: false, operationId, state: 'missing', ...storageEpochField() })
`);
    // Status: durable operation past `queued`.
    add('status-durable',
        '          accepted: true, operationId, state: orphanedOperationState(durable), resultKeyVersion: 1,\n',
        `          accepted: true, operationId, state: orphanedOperationState(durable), resultKeyVersion: 1,
          ...storageEpochField(),
`);
    // Status: unknown operation.
    add('status-missing',
        `    return res.status(404).json({ accepted: false, operationId, state: 'missing' })
  })
`,
        `    return res.status(404).json({ accepted: false, operationId, state: 'missing', ...storageEpochField() })
  })
`);
    return units;
};
