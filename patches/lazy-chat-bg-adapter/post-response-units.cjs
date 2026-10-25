'use strict';
// Post-response continuation (D3-1). After a canonical commit, an afterRequest
// replacer's one-shot timers that were still pending when the hook returned run
// once inside a bounded window: the host and the job lock stay with S4b until
// the window ends, the committed chat is what the plugin reads, and an
// unconfirmed window is recorded and notified as uncertain.
const fs = require('node:fs');
const path = require('node:path');
const targetVersions = { pocketrisu: ['1.10.0'] };
module.exports = prior => {
    const units = [];
    const related = ['bg-preserve', 'lazy-chat-sync'].flatMap(name => require(`../${name}/manifest.cjs`).units);
    const add = (name, file, anchor, content) => units.push({ id: `lazy-chat-bg-adapter:post-response:${name}:1.10`,
        file, type: 'replace', anchor, content, targetVersions,
        after: [...prior, ...related, ...units].filter(unit => unit.file === file).map(unit => unit.id) });
    const owned = 'server/node/bgPostResponseSync.cjs';
    units.push({ id: `lazy-chat-bg-adapter:post-response:owned:${owned}:1.10`, file: owned, type: 'owned', targetVersions,
        content: fs.readFileSync(path.join(__dirname, 'files-1.10', owned), 'utf8') });
    const orchestrator = 'server/node/bgOrchestrator.cjs';
    add('lock-time', orchestrator,
        '  let pluginHost = null\n',
        `  let pluginHost = null
  // The job deadline counts from lock acquisition; a handed-over lease owns
  // host close and the lock release.
  const lockAcquiredAt = performance.now()
  let postResponseLease = null
`);
    add('hand-over', orchestrator,
        '      return {\n        chat: resultChat,',
        `      // Only S4b accepts the lease. Plugins with sealed timers keep the host
      // and this lock until the post-response window ends; the others close now.
      if (pluginHost && control && control.acceptPostResponseLease === true) {
        let participants = []
        try { participants = (await pluginHost.handOver()).participants } catch { participants = [] }
        if (participants.length) {
          let leaseRelease = null
          postResponseLease = {
            participants,
            lockAcquiredAt,
            // The committed canonical chat replaces the selected chat of this
            // job's database and its plugin hydration snapshot.
            reflectCommittedChat: (chat) => {
              const character = dbmod.getDatabase()?.characters?.[charIdx]
              if (character?.chaId !== selectedCharId || character.chats?.[chatIdx]?.id !== selectedChatId) {
                throw new Error('post-response chat selection unavailable')
              }
              character.chats[chatIdx] = chat
              pluginChatSnapshot.set(selectedCharId, new Map(pluginChatSnapshot.get(selectedCharId) ?? []).set(selectedChatId, chat))
              return performance.now()
            },
            open: (options) => pluginHost.openPostResponse(options),
            release: () => {
              leaseRelease ??= (async () => {
                try { await pluginHost.close() } finally { release() }
              })()
              return leaseRelease
            },
          }
        }
      }
      return {
        ...(postResponseLease ? { postResponseLease } : {}),
        chat: resultChat,`);
    add('preview-release', orchestrator,
        '    try { if (pluginHost) await pluginHost.close() } finally { release() }',
        `    if (!postResponseLease) {
      try { if (pluginHost) await pluginHost.close() } finally { release() }
    }`);
    add('helpers', orchestrator,
        '  let detachedTurn = Promise.resolve()\n',
        `  let detachedTurn = Promise.resolve()
  const { POST_RESPONSE_WINDOW_MS, finalizePostResponseSync } = require('./bgPostResponseSync.cjs')
  // Records the window result on the obligation the commit wrote, state first
  // and notices after. Never throws.
  const recordPostResponse = async (operationId, receipt, outcome) => {
    if (!receipt || typeof receipt.commitReceiptId !== 'string') return
    try {
      await finalizePostResponseSync({ kvGet, kvSet, operationId, receiptId: receipt.commitReceiptId,
        storageEpoch: storageEpochField().storageEpoch, outcome,
        publish: event => deps.bgPluginDependencies.publishNotification(event) })
    } catch (error) {
      console.error('[bg-orch] post-response sync record failed:', (error && (error.code || error.message)) || 'unknown')
    }
  }
  // After a committed answer: read the canonical chat, reflect it, open one
  // window with a single absolute deadline. A failure here keeps the
  // committed chat and records the window as uncertain.
  const runPostResponseWindow = async (lease, abort, operationId, receipt) => {
    let outcome
    try {
      if (abort.signal.aborted) outcome = { status: 'uncertain', reason: 'aborted' }
      else {
        const chat = serverChatCommitOwner.readCommittedChat(receipt)
        if (!chat) outcome = { status: 'uncertain', reason: 'error' }
        else {
          const snapshotReady = lease.reflectCommittedChat(chat)
          outcome = abort.signal.aborted ? { status: 'uncertain', reason: 'aborted' }
            : await lease.open({ deadline: Math.min(snapshotReady + POST_RESPONSE_WINDOW_MS, lease.lockAcquiredAt + 600000),
              signal: abort.signal })
        }
      }
    } catch { outcome = { status: 'uncertain', reason: 'error' } }
    await recordPostResponse(operationId, receipt, outcome)
  }
`);
    add('lease-slot', orchestrator,
        "          let terminalState = 'finished'\n",
        "          let terminalState = 'finished'\n          let postResponseLease = null\n");
    add('accept-lease', orchestrator,
        '                signal: activeRun.controller.signal,\n',
        '                signal: activeRun.controller.signal,\n                acceptPostResponseLease: true,\n');
    add('take-lease', orchestrator,
        '            if (activeRun.cancelled) {\n              console.log(`[bg-orch] S4b cancelled: op=${operationId} TOTAL=${Date.now() - t0}ms (result discarded)`)',
        `            // The lease never reaches the stored or routed result.
            if (result && result.postResponseLease) {
              postResponseLease = result.postResponseLease
              delete result.postResponseLease
              activeRun.postResponseAbort = new AbortController()
            }
            if (activeRun.cancelled) {
              console.log(\`[bg-orch] S4b cancelled: op=\${operationId} TOTAL=\${Date.now() - t0}ms (result discarded)\`)`);
    add('commit-obligation', orchestrator,
        '                  anchor: result && result.executionAnchor,\n',
        `                  anchor: result && result.executionAnchor,
                  ...(postResponseLease ? { postResponseSync: { entries: postResponseLease.participants } } : {}),
`);
    add('cancelled-after-commit', orchestrator,
        "                console.log('[bg-orch] S4b cancelled during the server commit: op=' + operationId + ' (result discarded)')",
        `                if (postResponseLease && serverChatCommit && serverChatCommit.status === 'committed') {
                  await recordPostResponse(operationId, serverChatCommit.receipt, { status: 'uncertain', reason: 'aborted' })
                }
                console.log('[bg-orch] S4b cancelled during the server commit: op=' + operationId + ' (result discarded)')`);
    add('window', orchestrator,
        "            console.log(`[bg-orch] S4b detached done: msgs=${msgs} threw=${result ? result.threw : '?'} TOTAL=${Date.now() - t0}ms (${persisted.persisted ? 'kv saved' : 'delivery failed'}, chat=${commitState})`)\n",
        `            console.log(\`[bg-orch] S4b detached done: msgs=\${msgs} threw=\${result ? result.threw : '?'} TOTAL=\${Date.now() - t0}ms (\${persisted.persisted ? 'kv saved' : 'delivery failed'}, chat=\${commitState})\`)
            // The result is already stored and published; the window runs inside
            // the lease, and the run finishes only after it ends.
            if (postResponseLease && serverChatCommit && serverChatCommit.status === 'committed') {
              await runPostResponseWindow(postResponseLease, activeRun.postResponseAbort, operationId, serverChatCommit.receipt)
            }
`);
    add('release-before-finish', orchestrator,
        "            if (terminalState === 'retryable-no-provider') {\n",
        `            // Host close, then the lock, before the run finishes.
            if (postResponseLease) {
              try { await postResponseLease.release() }
              catch (error) { console.error('[bg-orch] post-response release failed:', (error && error.message) || error) }
            }
            if (terminalState === 'retryable-no-provider') {
`);
    add('delivered-after-window', orchestrator,
        '              orchestrationRuns.finish(operationId, activeRun, terminalState)\n',
        `              orchestrationRuns.finish(operationId, activeRun, terminalState)
              // A terminal result ACK accepted while the window was open could not
              // mark the still-running run; apply it now, as an ACK after finish does.
              if (postResponseLease) {
                try {
                  if (readOperationState(kvGet, operationId)?.state === 'delivered') orchestrationRuns.markDelivered(operationId)
                } catch { /* the durable row stays authoritative */ }
              }
`);
    add('cancel-window', orchestrator,
        "      return res.json({\n        cancelled: false, finished: true, state: 'chat-committed',",
        `      // The committed chat and its receipt stay; only an active
      // post-response window stops. The run is not marked cancelled.
      orchestrationRuns.get(operationId)?.postResponseAbort?.abort()
      return res.json({
        cancelled: false, finished: true, state: 'chat-committed',`);
    const server = 'server/node/server.cjs';
    add('reset-cleanup', server,
        "        kvDelPrefix('bg-orch-result:');",
        "        kvDelPrefix('bg-orch-result:');\n        kvDelPrefix(require('./bgPostResponseSync.cjs').POST_RESPONSE_SYNC_PREFIX);");
    add('startup-sweep', server,
        '    await startServer();',
        `    // Obligations left by a stopped process become uncertain before listen.
    // No plugin, generation or request runs again.
    try {
        await require('./bgPostResponseSync.cjs').sweepPostResponseSync({ kvGet, kvSet, kvList,
            publish: event => bgNotifications.publish(event), storageEpoch: serverChatCommitOwner.currentStorageEpoch() });
    } catch (error) {
        logger.error('[BGPostResponse] startup sweep failed: ' + ((error && (error.code || error.message)) || 'unknown'));
    }
    await startServer();`);
    add('retention', 'server/node/bgOrchestrationResultRetention.cjs',
        '          kvDel(key)\n          deletedStates.push(key)',
        `          kvDel(require('./bgPostResponseSync.cjs').postResponseSyncKey(operationId))
          kvDel(key)
          deletedStates.push(key)`);
    return units;
};
