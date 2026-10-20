'use strict';
// Reset-orphaned operations. A successful storage reset deletes every
// operation and result row and advances the storage epoch; a registry entry,
// durable row or parked result whose recorded epoch is older than the current
// epoch therefore belongs to storage that no longer exists. The status route
// answers such an operation with its `missing` shape (after each branch's
// coordinate-conflict check; a registry run with other coordinates falls
// through as before) and never changes registry entries or rows.
// A same-id start is refused before admission. A DELETE tombstone written
// before any operation row exists records the current epoch. Without a valid
// recorded epoch or a readable current epoch nothing is inferred.
// Results of such runs are neither published nor delivered (see below).
module.exports = prior => {
    const units = [], targetVersions = { pocketrisu: ['1.10.0'] };
    const file = 'server/node/bgOrchestrator.cjs';
    const add = (name, anchor, content) => units.push({
        id: 'lazy-chat-bg-adapter:reset-orphan:' + name + ':1.10',
        file, type: 'replace', anchor, content, targetVersions,
        after: [...prior, ...units].filter(unit => unit.file === file).map(unit => unit.id),
    });
    add('helper',
        '  const handleOrchestrateStart = async (req, res) => {\n',
        `  // True only for a valid recorded epoch older than a readable current epoch.
  const resetOrphanedEpoch = (recordedEpoch) => {
    if (!Number.isSafeInteger(recordedEpoch) || recordedEpoch < 0) return false
    const current = storageEpochField().storageEpoch
    return current !== undefined && recordedEpoch < current
  }
  const handleOrchestrateStart = async (req, res) => {
`);
    // Start (server input): refuse a same-id retry of a reset-orphaned run
    // before admission; the coordinate conflict keeps its precedence.
    add('start-input-guard',
        '          let admission\n',
        `          const orphanedExisting = orchestrationRuns.get(operationId)
          if (orphanedExisting && resetOrphanedEpoch(orphanedExisting.storageEpoch)) {
            return res.status(409).json({
              handled: false, started: false, operationId,
              reason: orphanedExisting.charId !== String(selectedCharId)
                || orphanedExisting.chatId !== String(selectedChatId)
                || orphanedExisting.inputCommandVersion !== 1
                ? 'operation-coordinate-conflict' : 'input_command_identity_conflict',
            })
          }
          let admission
`);
    // Start (legacy): refuse after the existing coordinate check, before any
    // operation row is written.
    add('start-active-guard',
        `        const activeExisting = orchestrationRuns.get(operationId)
        if (activeExisting) {
          if (activeExisting.charId !== operationMeta.charId || activeExisting.chatId !== operationMeta.chatId) {
            return res.status(409).json({
              handled: false, started: false, operationId,
              reason: 'operation-coordinate-conflict',
            })
          }
`,
        `        const activeExisting = orchestrationRuns.get(operationId)
        if (activeExisting) {
          if (activeExisting.charId !== operationMeta.charId || activeExisting.chatId !== operationMeta.chatId) {
            return res.status(409).json({
              handled: false, started: false, operationId,
              reason: 'operation-coordinate-conflict',
            })
          }
          if (resetOrphanedEpoch(activeExisting.storageEpoch)) {
            return res.status(409).json({
              handled: false, started: false, operationId,
              reason: inputCommandVersion === 1 ? 'input_command_identity_conflict' : 'operation-reset',
            })
          }
`);
    // Status: registry entry of a reset-orphaned run with matching
    // coordinates. A mismatching run keeps the existing fallthrough.
    add('status-run',
        '    if (run && run.charId === charId && run.chatId === chatId) {\n',
        `    if (run && run.charId === charId && run.chatId === chatId && resetOrphanedEpoch(run.storageEpoch)) {
      return res.status(404).json({ accepted: false, operationId, state: 'missing', ...storageEpochField() })
    }
    if (run && run.charId === charId && run.chatId === chatId) {
`);
    // Status: parked operation-keyed result (own, run or durable row epoch).
    add('status-parked',
        "        return res.json({ accepted: true, operationId, state: 'result-ready', resultKeyVersion: 1, ...storageEpochField() })\n",
        `        if (resetOrphanedEpoch(parked.record.storageEpoch) || resetOrphanedEpoch(parkedOperationEpoch())) {
          return res.status(404).json({ accepted: false, operationId, state: 'missing', ...storageEpochField() })
        }
        return res.json({ accepted: true, operationId, state: 'result-ready', resultKeyVersion: 1, ...storageEpochField() })
`);
    // Status: rolling result parked under the char/chat key.
    add('status-legacy-parked',
        "        return res.json({ accepted: true, operationId, state: 'result-ready', resultKeyVersion: 0, ...storageEpochField() })\n",
        `        if (resetOrphanedEpoch(legacyParked.record.storageEpoch) || resetOrphanedEpoch(parkedOperationEpoch())) {
          return res.status(404).json({ accepted: false, operationId, state: 'missing', ...storageEpochField() })
        }
        return res.json({ accepted: true, operationId, state: 'result-ready', resultKeyVersion: 0, ...storageEpochField() })
`);
    // Status: durable operation row, after its coordinate check.
    add('status-durable',
        "        // The start handler can safely resume this exact state. Return the protocol's exact\n",
        `        if (resetOrphanedEpoch(durable.storageEpoch)) {
          return res.status(404).json({ accepted: false, operationId, state: 'missing', ...storageEpochField() })
        }
        // The start handler can safely resume this exact state. Return the protocol's exact
`);
    // Status: run or durable row epoch for the parked-result checks (read
    // only). An orphaned run reaches these branches only with mismatching
    // coordinates.
    add('status-parked-epoch',
        `    if (typeof kvGet === 'function') {
      const parked = peekResult(kvGet, operationResultKey(operationId))
`,
        `    if (typeof kvGet === 'function') {
      const parkedOperationEpoch = () => {
        if (run && resetOrphanedEpoch(run.storageEpoch)) return run.storageEpoch
        try { return readOperationState(kvGet, operationId)?.storageEpoch } catch { return undefined }
      }
      const parked = peekResult(kvGet, operationResultKey(operationId))
`);
    // DELETE before any operation row exists: the tombstone records the
    // current epoch. An existing row keeps its own epoch.
    add('delete-tombstone',
        "      const cancelled = writeOperationState(kvSet, operationId, durable || { charId, chatId }, 'cancelled')\n",
        "      const cancelled = writeOperationState(kvSet, operationId, durable || { charId, chatId, ...storageEpochField() }, 'cancelled')\n");

    // Results. A result record carries the storage epoch of the run that wrote
    // it (additive). Publication stops when the epoch advanced during the run;
    // both result reads answer a reset-orphaned record as absent before any
    // claim, lease write or consume, and leave it in place.
    add('result-record-epoch',
        '    time: Date.now(),\n',
        `    time: Date.now(),
    storageEpoch: opts && Number.isSafeInteger(opts.storageEpoch) && opts.storageEpoch >= 0 ? opts.storageEpoch : undefined,
`);
    // Intermediate publisher: the run's recorded epoch (control for detached
    // runs, deps for the non-detached full preview) against the current one.
    add('result-intermediate-guard',
        `          && !(control && typeof control.isCancelled === 'function' && control.isCancelled())) {
          midPublished = true
`,
        `          && !(control && typeof control.isCancelled === 'function' && control.isCancelled())
          && !(Number.isSafeInteger((control || deps).storageEpoch)
            && typeof (control || deps).currentStorageEpoch === 'function'
            && (control || deps).currentStorageEpoch() > (control || deps).storageEpoch)) {
          midPublished = true
`);
    add('result-intermediate-epoch',
        "                kind: 'intermediate',\n",
        `                kind: 'intermediate',
                storageEpoch: (control || deps).storageEpoch,
`);
    // Detached run: its recorded epoch for the intermediate publisher.
    add('result-detached-control',
        '                isCancelled: () => activeRun.cancelled,\n',
        `                isCancelled: () => activeRun.cancelled,
                storageEpoch: activeRun.storageEpoch,
                currentStorageEpoch: () => storageEpochField().storageEpoch,
`);
    // Detached run: a cancel or a storage reset during the awaited server
    // commit publishes nothing (no result, no operation state). After a reset
    // the owners' storage was replaced, so no owner settlement runs; after a
    // cancel alone the input settlement of the publishing path still runs.
    add('result-after-commit',
        `                terminalState = 'cancelled'
                activeRun.cancelled = true
                return
              }
            }
`,
        `                terminalState = 'cancelled'
                activeRun.cancelled = true
                return
              }
              if (resetOrphanedEpoch(activeRun.storageEpoch)) {
                console.log('[bg-orch] S4b storage reset during the server commit: op=' + operationId + ' (result discarded)')
                terminalState = 'cancelled'
                activeRun.cancelled = true
                return
              }
              if (activeRun.cancelled) {
                if (inputCommandVersion === 1
                  && (!serverChatCommit || serverChatCommit.status !== 'committed')) {
                  serverChatInputOwner.markRunFailureSynchronously(
                    operationId,
                    serverInputProviderStarted,
                  )
                }
                console.log('[bg-orch] S4b cancelled during the server commit: op=' + operationId + ' (result discarded)')
                terminalState = 'cancelled'
                return
              }
            }
`);
    add('result-terminal-epoch',
        `              serverChatCommit,
            })
`,
        `              serverChatCommit,
              storageEpoch: activeRun.storageEpoch,
            })
`);
    // Detached run failure fallback: a storage reset since the run started is
    // handled like a cancellation (no fallback result, no input settlement).
    add('result-fallback-guard',
        "            if (activeRun.cancelled) {\n              console.log(`[bg-orch] S4b cancelled: op=${operationId} TOTAL=${Date.now() - t0}ms (no fallback/result)`)\n",
        "            if (!activeRun.cancelled && resetOrphanedEpoch(activeRun.storageEpoch)) {\n              terminalState = 'cancelled'\n              activeRun.cancelled = true\n            }\n            if (activeRun.cancelled) {\n              console.log(`[bg-orch] S4b cancelled: op=${operationId} TOTAL=${Date.now() - t0}ms (no fallback/result)`)\n");
    add('result-fallback-epoch',
        '                publishSeq: orchestrationRuns.nextPublishSequence(operationId, activeRun),\n',
        `                publishSeq: orchestrationRuns.nextPublishSequence(operationId, activeRun),
                storageEpoch: activeRun.storageEpoch,
`);
    // Non-detached full preview: the epoch read when the request starts.
    add('result-request-epoch',
        '  const handleOrchestrateStart = async (req, res) => {\n',
        `  const handleOrchestrateStart = async (req, res) => {
    const requestStorageEpoch = storageEpochField().storageEpoch
`);
    add('result-full-preview',
        `            const result = await runServerPreview({ getDbCache, DB_HEX_KEY, kvSet, requestLogs: deps.requestLogs }, selectedCharId, selectedChatId, currentChat, 'full')
            persistOrchResult(kvSet, selectedCharId, selectedChatId, result, {
              kind: terminalOrchResultKind(result, currentChat),
            })
`,
        `            // The request's storage epoch: a reset during the run publishes nothing.
            const result = await runServerPreview({
              getDbCache, DB_HEX_KEY, kvSet, requestLogs: deps.requestLogs,
              storageEpoch: requestStorageEpoch,
              currentStorageEpoch: () => storageEpochField().storageEpoch,
            }, selectedCharId, selectedChatId, currentChat, 'full')
            if (resetOrphanedEpoch(requestStorageEpoch)) {
              console.log('[bg-orch] S4a full result discarded: storage reset during the run')
            } else {
              persistOrchResult(kvSet, selectedCharId, selectedChatId, result, {
                kind: terminalOrchResultKind(result, currentChat),
                storageEpoch: requestStorageEpoch,
              })
            }
`);
    add('result-helper',
        "  app.get('/api/bg-orchestrate-result/:operationId', sessionAuthMiddleware, (req, res) => {\n",
        `  // A result record whose own, run or operation row epoch is reset-orphaned.
  const resetOrphanedResult = (record, run, durable) => resetOrphanedEpoch(record && record.storageEpoch)
    || resetOrphanedEpoch(run && run.storageEpoch)
    || resetOrphanedEpoch(durable && durable.storageEpoch)
  app.get('/api/bg-orchestrate-result/:operationId', sessionAuthMiddleware, (req, res) => {
`);
    // Operation-keyed read: after the record's coordinate check would pass,
    // answer as an absent operation.
    add('result-operation-read',
        `      if (delivery.state === 'missing') {
        const committed = serverChatCommitOwner
`,
        `      if (delivery.state === 'found' && delivery.record.operationId === operationId
        && delivery.record.charId === charId && delivery.record.chatId === chatId
        && resetOrphanedResult(delivery.record, run, state)) {
        return res.json({ found: false, operationId, operationState: 'missing', ...operationProgress(operationId, undefined) })
      }
      if (delivery.state === 'missing') {
        const committed = serverChatCommitOwner
`);
    // Legacy char/chat read: peek before the lease write or one-shot consume.
    add('result-legacy-read',
        `      const delivery = explicitAck
        ? peekResult(kvGet, key)
        : consumeResult(kvGet, kvDel, key)
`,
        `      const parked = peekResult(kvGet, key)
      if (parked.state === 'found') {
        const parkedOperationId = validOperationId(parked.record.operationId) ? parked.record.operationId : null
        let parkedDurable = null
        try { parkedDurable = parkedOperationId ? readOperationState(kvGet, parkedOperationId) : null } catch { parkedDurable = null }
        const parkedRun = parkedOperationId ? orchestrationRuns.get(parkedOperationId) : null
        if (resetOrphanedResult(parked.record, parkedRun, parkedDurable)) return res.json({
          found: false,
          stage: _orchStage[stageKey(req.params.charId, req.params.chatId)] ?? 0,
          status: _orchStatus[stageKey(req.params.charId, req.params.chatId)] || [],
        })
      }
      const delivery = explicitAck
        ? peekResult(kvGet, key)
        : consumeResult(kvGet, kvDel, key)
`);
    return units;
};
