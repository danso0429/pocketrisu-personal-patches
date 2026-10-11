'use strict';
const targetVersions = { pocketrisu: ['1.10.0'] };
module.exports = prior => {
    const units = [];
    const add = (name, file, anchor, content) => units.push({ id: `lazy-chat-bg-adapter:operation-notice:${name}:1.10`,
        file, type: 'replace', anchor, content, targetVersions,
        after: [...prior, ...units].filter(unit => unit.file === file).map(unit => unit.id) });
    add('owner', 'server/node/server.cjs',
        'const bgNotifications = createBgNotifications({ db: sqliteDb, kvGet, kvSet, kvDel, kvList });',
        `const bgNotifications = createBgNotifications({ db: sqliteDb, kvGet, kvSet, kvDel, kvList });
const { createBgOperationNotices } = require('./bgOperationNotices.cjs');
const operationNotices = createBgOperationNotices({ db: sqliteDb, kvGet, kvSet, kvDel, kvList,
    publish: event => bgNotifications.publish(event) });`);
    add('commit-owner', 'server/node/server.cjs', 'const serverChatCommitOwner = createServerChatCommitOwner({',
        `const serverChatCommitOwner = createServerChatCommitOwner({
    notifyCommit: record => operationNotices.captureCommit(record),`);
    add('registration', 'server/node/server.cjs',
        'serverChatCommitOwner, serverChatInputOwner, orchestrationRuns:',
        'serverChatCommitOwner, serverChatInputOwner, operationNotices, orchestrationRuns:');
    add('state-record', 'server/node/bgOrchestrationOperationStore.cjs', '    state,\n',
        `    state,
    ...(meta?.notificationSourceVersion === 1 && Number.isSafeInteger(meta.notificationCreatedAt) && meta.notificationCreatedAt > 0
      ? { notificationSourceVersion: 1, notificationCreatedAt: meta.notificationCreatedAt,
          ...(meta.operationNotice ? { operationNotice: meta.operationNotice } : {}) } : {}),
`);
    add('state-source-preservation', 'server/node/bgOrchestrationOperationStore.cjs',
        'function writeOperationState(kvSet, operationId, meta, state) {',
        `function writeOperationState(kvSet, operationId, meta, state, kvGet = null) {
  if (typeof kvGet === 'function') {
    try {
      const previous = readOperationState(kvGet, operationId)
      if (previous?.notificationSourceVersion === 1 && previous.charId === String(meta?.charId) && previous.chatId === String(meta?.chatId)) {
        meta = { ...meta, notificationSourceVersion: 1, notificationCreatedAt: previous.notificationCreatedAt,
          ...(!meta?.operationNotice && previous.operationNotice ? { operationNotice: previous.operationNotice } : {}) }
      }
    } catch { return { written: false, error: new Error('operation notice source state unavailable') } }
  }
`);
    add('writer', 'server/node/bgOrchestrator.cjs',
        '  const orchestrationRuns = deps && deps.orchestrationRuns\n',
        `  const operationNotices = deps?.operationNotices
  const baseWriteOperationState = require('./bgOrchestrationOperationStore.cjs').writeOperationState
  function writeOperationState(set, operationId, meta, state) {
    const outcome = baseWriteOperationState(set, operationId, meta, state, kvGet)
    if (outcome.written) operationNotices?.captureState(outcome.record, { active: true })
    return outcome
  }
  const orchestrationRuns = deps && deps.orchestrationRuns
`);
    add('admission', 'server/node/bgOrchestrator.cjs',
        "          const queued = writeOperationState(kvSet, operationId, operationMeta, 'queued')\n",
        `          const previousNoticeSource = readOperationState(kvGet, operationId)
          operationMeta.notificationSourceVersion = 1
          operationMeta.notificationCreatedAt = previousNoticeSource?.notificationSourceVersion === 1
            ? previousNoticeSource.notificationCreatedAt : Date.now()
          const queued = writeOperationState(kvSet, operationId, operationMeta, 'queued')
`);
    add('result-failure', 'server/node/bgOrchestrator.cjs',
        '            const persisted = persistOrchResult(kvSet, selectedCharId, selectedChatId, result, {\n',
        `            if (operationNotices && operationMeta.notificationSourceVersion === 1
              && (!serverChatCommit || serverChatCommit.status !== 'committed')
              && (result?.threw || terminalKind === 'terminal-error' || serverChatCommit)) {
              operationMeta.operationNotice = operationNotices.terminalEvent(operationId, operationMeta,
                result?.threw || terminalKind === 'terminal-error' ? 'generation_failed' : 'commit_failed')
            }
            const persisted = persistOrchResult(kvSet, selectedCharId, selectedChatId, result, {
`);
    add('exception-failure', 'server/node/bgOrchestrator.cjs',
        "              const persisted = persistOrchResult(kvSet, selectedCharId, selectedChatId, { chat: null, statics: null, staticsMessagesDelta: 0, globalChatVariables: {}, threw: String((e && e.message) || e) }, {\n",
        `              if (operationNotices && operationMeta.notificationSourceVersion === 1 && !unsupportedInput) {
                operationMeta.operationNotice = operationNotices.terminalEvent(operationId, operationMeta,
                  assemblyConflict ? 'commit_failed' : 'generation_failed')
              }
              const persisted = persistOrchResult(kvSet, selectedCharId, selectedChatId, { chat: null, statics: null, staticsMessagesDelta: 0, globalChatVariables: {}, threw: String((e && e.message) || e) }, {
`);
    add('retry', 'server/node/bgOrchestrator.cjs', '    const sweepResultRetention = () => {\n',
        `    const sourceOutcome = operationId => {
      const committed = serverChatCommitOwner?.readGenerationCommit(operationId)?.status === 'committed'
      const input = serverChatInputOwner?.read(operationId)
      const noticeHandled = input?.terminal?.reason === 'server_host_unsupported' && input.terminal.notificationVersion === 1
      const result = peekResult(kvGet, operationResultKey(operationId))
      const final = result.state === 'found' && result.record.final !== false && result.record.kind !== 'intermediate'
      const nativeFailed = final && ['error', 'partial'].includes(result.record.outcome)
      const commitFailed = final && result.record.serverChatCommit
        && !['committed', 'cancelled'].includes(result.record.serverChatCommit.status)
      const settingsLost = input && ['queued', 'attached'].includes(input.inputState)
        && input.admission.inputPreparation !== 'client'
        && serverChatInputOwner.loadSettingsSnapshot(operationId).reason === 'settings_context_unavailable'
      return { committed, final, noticeHandled, cancelled: input?.inputState === 'cancelled',
        // At startup the source scan precedes input reconciliation. An
        // inactive server-owned transform still marked running is uncertain;
        // client preparation and untouched/retryable queued work are distinct.
        inputIrretryable: settingsLost || input?.transformState === 'unknown' || input?.inputState === 'failed'
          || (input?.transformState === 'running' && input?.admission?.inputPreparation !== 'client'),
        failed: !!(nativeFailed || commitFailed),
        // Partial generation failure wins over a subsequent commit failure;
        // successful-result commit faults and assembly-error commits do not.
        commitFailed: !!commitFailed && result.record.outcome !== 'partial' }
    }
    const noticeStateOptions = operationId => orchestrationRuns.status(operationId) === 'running'
      ? { active: true } : { active: false, outcome: sourceOutcome(operationId) }
    const sweepResultRetention = () => {
      let noticeScanDeferred = false
      try {
        if (operationNotices) for (const key of kvList(OPERATION_STATE_PREFIX)) {
          const id = key.slice(OPERATION_STATE_PREFIX.length)
          try {
            if (validOperationId(id)) operationNotices.captureState(readOperationState(kvGet, id), () => noticeStateOptions(id))
          } catch { noticeScanDeferred = true }
        }
      } catch { noticeScanDeferred = true }
      try { serverChatCommitOwner?.retryNotifications?.() } catch { noticeScanDeferred = true }
      try { operationNotices?.retry() } catch { noticeScanDeferred = true }
      if (noticeScanDeferred) console.warn('[BGOperationNotice] source scan deferred')
`);
    add('retention-gate', 'server/node/bgOrchestrator.cjs',
        "          isOperationActive: (operationId) => orchestrationRuns.status(operationId) === 'running',\n",
        `          isOperationActive: (operationId) => orchestrationRuns.status(operationId) === 'running',
          canRetireState: state => !operationNotices || operationNotices.canRetireState(state, () => noticeStateOptions(state.operationId)),
`);
    add('retention-owner', 'server/node/bgOrchestrationResultRetention.cjs', '          kvDel(key)\n          deletedStates.push(key)\n',
        `          const state = typeof readOperationState === 'function' ? readOperationState(kvGet, operationId) : null
          if (typeof options.canRetireState === 'function' && options.canRetireState(state) !== true) continue
          kvDel(key)
          deletedStates.push(key)
`);
    return units;
};
