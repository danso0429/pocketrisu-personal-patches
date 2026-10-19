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
    return units;
};
