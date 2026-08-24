'use strict'

const fs = require('node:fs')
const path = require('node:path')

const base = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'bg-preserve.json'),
    'utf8',
))
const filesRoot = path.join(__dirname, 'files')
const owned = (relative) => fs.readFileSync(path.join(filesRoot, relative), 'utf8')

const pocketRisu181 = { pocketrisu: ['1.8.1'] }
const pocketRisu190 = { pocketrisu: ['1.9.0', '1.10.0'] }
const legacyCharxCauseUnit = 'bg-preserve:hook:processzip-asset-save-aggregate-cause'

function replaceExact(source, anchor, replacement, label) {
    const count = source.split(anchor).length - 1
    if (count !== 1) {
        throw new Error(`${label}: expected one adapter anchor, found ${count}`)
    }
    return source.replace(anchor, replacement)
}

function adaptOwned(unit) {
    if (unit.file === 'server/node/bgOrchestrator.cjs') {
        const anchor = '    const db = JSON.parse(JSON.stringify(stripped)) // clone so we never mutate the live cache\n'
        const replacement = `${anchor}    // PocketRisu 1.9 model jobs are a client-path recovery authority. The detached\n    // BG owner already preserves the complete ax -> main -> post pipeline, so nesting a\n    // second server job here would create two terminal claim/recovery protocols. Keep the\n    // user setting untouched in the browser and disable it only in this cloned server run.\n    if (Object.prototype.hasOwnProperty.call(db, 'nodeOnlyServerSideRequests')) {\n      db.nodeOnlyServerSideRequests = false\n    }\n`
        return {
            ...unit,
            content: replaceExact(unit.content, anchor, replacement, `${unit.id}: native-job isolation`),
        }
    }
    if (unit.file === 'src/ts/bgStreamFetch.ts') {
        const anchor = `export function bindGenToActiveAbort(gen: string): void {
    if (!gen || !pendingChatAbort) return
    genAbortMap.set(gen, pendingChatAbort)
`
        const replacement = `export function bindGenToActiveAbort(gen: string, abort?: () => void): void {
    const activeAbort = abort ?? pendingChatAbort
    if (!gen || !activeAbort) return
    genAbortMap.set(gen, activeAbort)
`
        return {
            ...unit,
            content: replaceExact(unit.content, anchor, replacement, `${unit.id}: native abort binding`),
        }
    }
    return unit
}

function adaptUniversalUnit(unit) {
    if (unit.id === 'bg-preserve:hook:index-unified-busy-entry-guard') {
        return {
            ...unit,
            managed: replaceExact(
                unit.managed,
                '    const generationBusyAtEntry = get(doingChat)\n',
                '    const generationBusyAtEntry = get(unifiedDoingChat)\n',
                `${unit.id}: combined busy binding`,
            ),
        }
    }
    return unit
}

function adaptBgRequestLogging190(unit) {
    let content = replaceExact(
        unit.content,
        "const { diffGlobalVariables } = require('./bgOrchestrationGlobalVariables.cjs')\n",
        "const { diffGlobalVariables } = require('./bgOrchestrationGlobalVariables.cjs')\nconst { deliverBgRequestLog, parseBgRequestLogBatch } = require('./bgRequestLogBridge.cjs')\n",
        `${unit.id}: native request-log bridge import`,
    )
    content = replaceExact(
        content,
        'function loadBundle() {\n',
        'function loadBundle(requestLogs) {\n',
        `${unit.id}: request-log owner load`,
    )
    content = replaceExact(
        content,
        '    patchFetch()\n',
        '    patchFetch(requestLogs)\n',
        `${unit.id}: request-log owner fetch patch`,
    )
    content = replaceExact(
        content,
        'function patchFetch() {\n',
        'function patchFetch(requestLogs) {\n',
        `${unit.id}: request-log owner fetch argument`,
    )
    content = replaceExact(
        content,
        "      // S3: risu session-auth refresh. createAuth() (nodeStorage.ts) needs *a* token to build\n",
        `      // Native 1.9 request logging is client-posted. Inside the server bundle that relative
      // URL has no HTTP origin, so hand the unchanged batch to the already-open native owner.
      // Its normalizer remains the sole authority for masking, field caps, byte rotation, and
      // the content-free usage row. The logger itself is best-effort, and this bridge never throws.
      if (u === '/api/request-logs') {
        const requestLogBatch = parseBgRequestLogBatch(a[0])
        if (requestLogBatch) return deliverBgRequestLog(requestLogs, requestLogBatch)
      }
      // S3: risu session-auth refresh. createAuth() (nodeStorage.ts) needs *a* token to build
`,
        `${unit.id}: request-log relative route`,
    )
    content = replaceExact(
        content,
        '    const bg = await loadBundle()\n',
        '    const bg = await loadBundle(deps.requestLogs)\n',
        `${unit.id}: request-log owner preview load`,
    )
    content = replaceExact(
        content,
        "              { getDbCache, DB_HEX_KEY, kvSet, kvGet }, selectedCharId, selectedChatId, currentChat, 'full',\n",
        "              { getDbCache, DB_HEX_KEY, kvSet, kvGet, requestLogs: deps.requestLogs }, selectedCharId, selectedChatId, currentChat, 'full',\n",
        `${unit.id}: detached request-log owner`,
    )
    content = replaceExact(
        content,
        "            const result = await runServerPreview({ getDbCache, DB_HEX_KEY, kvSet }, selectedCharId, selectedChatId, currentChat, 'full')\n",
        "            const result = await runServerPreview({ getDbCache, DB_HEX_KEY, kvSet, requestLogs: deps.requestLogs }, selectedCharId, selectedChatId, currentChat, 'full')\n",
        `${unit.id}: full-preview request-log owner`,
    )
    content = replaceExact(
        content,
        "            const reply = await runServerPreview({ getDbCache, DB_HEX_KEY }, selectedCharId, selectedChatId, currentChat, 'llm')\n",
        "            const reply = await runServerPreview({ getDbCache, DB_HEX_KEY, requestLogs: deps.requestLogs }, selectedCharId, selectedChatId, currentChat, 'llm')\n",
        `${unit.id}: llm-preview request-log owner`,
    )
    content = replaceExact(
        content,
        "            const serverFormated = await runServerPreview({ getDbCache, DB_HEX_KEY }, selectedCharId, selectedChatId, currentChat, 'assemble')\n",
        "            const serverFormated = await runServerPreview({ getDbCache, DB_HEX_KEY, requestLogs: deps.requestLogs }, selectedCharId, selectedChatId, currentChat, 'assemble')\n",
        `${unit.id}: assemble-preview request-log owner`,
    )
    return content
}

function adaptBgRetention190(content, unitId) {
    content = replaceExact(
        content,
        "} = require('./bgOrchestrationOperationStore.cjs')\n",
        `} = require('./bgOrchestrationOperationStore.cjs')
const {
  ORCH_RESULT_RETENTION_TTL_MS,
  ORCH_RESULT_RETENTION_MAX_ROWS,
  ORCH_RESULT_RETENTION_MAX_BYTES,
  hasLiveDeliveryClaim,
  sweepOrchestrationResultRetention,
} = require('./bgOrchestrationResultRetention.cjs')
`,
        `${unitId}: bounded result-retention owner import`,
    )
    content = replaceExact(
        content,
        "const ORCH_RESULT_PREFIX = 'bg-orch-result:'\nconst ORCH_RESULT_TTL_MS = 30 * 60 * 1000\n",
        "const ORCH_RESULT_PREFIX = 'bg-orch-result:'\n",
        `${unitId}: remove legacy result TTL`,
    )
    content = replaceExact(
        content,
        `      const now = Date.now()
      const claim = parsed.deliveryClaim
      if (claim && claim.consumerId !== consumerId && now - claim.claimedAt < ORCH_RESULT_CLAIM_TTL_MS) {
        return res.status(409).json({
          found: false, error: 'result-claimed',
          retryAfterMs: ORCH_RESULT_CLAIM_TTL_MS - (now - claim.claimedAt),
        })
      }
      // Refresh an active consumer's lease at a bounded cadence. The client sends a lightweight
      // heartbeat while IndexedDB/root persistence is in progress; without this refresh, a slow
      // save could cross the two-minute TTL and let a second PWA consume the same revision.
      if (!claim || claim.consumerId !== consumerId || now - claim.claimedAt >= ORCH_RESULT_CLAIM_REFRESH_MS) {
`,
        `      const now = Date.now()
      const claim = parsed.deliveryClaim
      const claimIsLive = hasLiveDeliveryClaim(parsed, now, ORCH_RESULT_CLAIM_TTL_MS)
      if (claim && claim.consumerId !== consumerId && claimIsLive) {
        return res.status(409).json({
          found: false, error: 'result-claimed',
          retryAfterMs: ORCH_RESULT_CLAIM_TTL_MS - (now - claim.claimedAt),
        })
      }
      // Refresh an active consumer's lease at a bounded cadence. A far-future/corrupt claim is
      // replaced instead of becoming an unbounded storage lease.
      if (!claimIsLive || claim.consumerId !== consumerId
        || now - claim.claimedAt >= ORCH_RESULT_CLAIM_REFRESH_MS) {
`,
        `${unitId}: bounded operation delivery claim`,
    )
    content = replaceExact(
        content,
        "      const explicitAck = req.query && req.query.delivery === 'ack-v1'\n",
        "      const explicitAck = req.query && req.query.delivery === 'ack-v1'\n      const consumerId = req.query && req.query.consumerId\n",
        `${unitId}: rolling result consumer identity`,
    )
    content = replaceExact(
        content,
        `      if (explicitAck && !validOperationId(parsed.resultId)) {
        if (typeof kvSet !== 'function') {
          return res.status(503).json({ found: false, error: 'result-store-unavailable' })
        }
        parsed = { ...parsed, resultId: nodeCrypto.randomUUID() }
        kvSet(key, JSON.stringify(parsed))
      }
`,
        `      let persistDeliveryLease = false
      if (explicitAck && !validOperationId(parsed.resultId)) {
        parsed = { ...parsed, resultId: nodeCrypto.randomUUID() }
        persistDeliveryLease = true
      }
      if (explicitAck && validOperationId(consumerId) && validOperationId(parsed.operationId)) {
        const now = Date.now()
        const claim = parsed.deliveryClaim
        const claimIsLive = hasLiveDeliveryClaim(parsed, now, ORCH_RESULT_CLAIM_TTL_MS)
        if (claim && claim.consumerId !== consumerId && claimIsLive) {
          return res.status(409).json({ found: false, error: 'result-claimed' })
        }
        if (!claimIsLive || claim.consumerId !== consumerId
          || now - claim.claimedAt >= ORCH_RESULT_CLAIM_REFRESH_MS) {
          parsed = { ...parsed, deliveryClaim: { consumerId, claimedAt: now } }
          persistDeliveryLease = true
        }
      } else if (explicitAck) {
        // A rolling client without consumer identity still receives one bounded lease window.
        // Rewriting the unchanged row refreshes updatedAt; the retention owner treats only that
        // recent legacy window as protected, so compatibility cannot become indefinite storage.
        persistDeliveryLease = true
      }
      if (persistDeliveryLease) {
        if (typeof kvSet !== 'function') {
          return res.status(503).json({ found: false, error: 'result-store-unavailable' })
        }
        kvSet(key, JSON.stringify(parsed))
      }
      if (explicitAck && req.query && req.query.heartbeat === '1'
        && validOperationId(consumerId) && validOperationId(parsed.operationId)) {
        return res.json({
          found: true, operationId: parsed.operationId, resultId: parsed.resultId,
          publishSeq: parsed.publishSeq, resultKeyVersion: 0,
        })
      }
`,
        `${unitId}: rolling delivery lease`,
    )
    content = replaceExact(
        content,
        `      const key = orchResultKey(req.params.charId, req.params.chatId)
      const outcome = acknowledgeResult(kvGet, kvDel, key, req.params.resultId)
`,
        `      const key = orchResultKey(req.params.charId, req.params.chatId)
      const delivery = peekResult(kvGet, key)
      const consumerId = req.query && req.query.consumerId
      if (delivery.state === 'found' && delivery.record.deliveryClaim
        && delivery.record.deliveryClaim.consumerId !== consumerId) {
        return res.status(409).json({ acked: false, reason: 'claimed' })
      }
      const outcome = acknowledgeResult(kvGet, kvDel, key, req.params.resultId)
`,
        `${unitId}: rolling ACK claim ownership`,
    )
    content = replaceExact(
        content,
        `  // Bound kv growth — purge orchestration results the client never consumed (page closed/reloaded).
  if (typeof kvList === 'function' && typeof kvGetUpdatedAt === 'function' && typeof kvDel === 'function') {
    setInterval(() => {
      try {
        const now = Date.now()
        for (const prefix of [ORCH_RESULT_PREFIX, OPERATION_RESULT_PREFIX, OPERATION_STATE_PREFIX]) {
          for (const key of kvList(prefix)) {
            const at = kvGetUpdatedAt(key)
            if (at != null && now - at > ORCH_RESULT_TTL_MS) kvDel(key)
          }
        }
      } catch { /* best-effort */ }
    }, 10 * 60 * 1000)
  }
`,
        `  // Keep completed paid responses through an overnight mobile absence, then enforce one
  // bounded owner-local result budget. Active runs and live delivery leases can temporarily exceed
  // the target; every other operation result receives a durable tombstone before payload deletion.
  if (typeof kvList === 'function' && typeof kvGet === 'function' && typeof kvSet === 'function'
    && typeof kvGetUpdatedAt === 'function' && typeof kvDel === 'function') {
    const sweepResultRetention = () => {
      try {
        sweepOrchestrationResultRetention({
          kvList, kvGet, kvSet, kvDel, kvGetUpdatedAt,
          readOperationState, writeOperationState,
          resultPrefixes: [ORCH_RESULT_PREFIX, OPERATION_RESULT_PREFIX],
          statePrefix: OPERATION_STATE_PREFIX,
          ttlMs: ORCH_RESULT_RETENTION_TTL_MS,
          maxRows: ORCH_RESULT_RETENTION_MAX_ROWS,
          maxBytes: ORCH_RESULT_RETENTION_MAX_BYTES,
          claimTtlMs: ORCH_RESULT_CLAIM_TTL_MS,
          isOperationActive: (operationId) => orchestrationRuns.status(operationId) === 'running',
        })
      } catch { /* best-effort; paid payloads fail closed in the retention owner */ }
    }
    sweepResultRetention()
    const retentionTimer = setInterval(sweepResultRetention, 10 * 60 * 1000)
    if (retentionTimer && typeof retentionTimer.unref === 'function') retentionTimer.unref()
  }
`,
        `${unitId}: bounded result-retention sweep`,
    )
    return content
}

function adaptBgOrchestrateRetention190(unit) {
    let content = replaceExact(
        unit.content,
        "import { chatProcessStage, doingChat, sendChat } from './process/index.svelte'\n",
        "import { chatProcessStage, doingChat, sendChatWithDirectLifecycle } from './process/index.svelte'\n",
        `${unit.id}: direct-send lifecycle owner import`,
    )
    content = replaceExact(
        content,
        "import { chatProcessStage, doingChat, sendChatWithDirectLifecycle } from './process/index.svelte'\n",
        `import { chatProcessStage, doingChat, sendChatWithDirectLifecycle } from './process/index.svelte'
import { chatGenKey, endGenerationIfOwned, startGeneration } from './process/generationState'
`,
        `${unit.id}: preparation lifecycle owner import`,
    )
    content = replaceExact(
        content,
        "} from './bgOrchestrationPending'\n",
        "} from './bgOrchestrationPending'\nimport { orchestrationRetentionFailureMessage } from './bgOrchestrationRetentionState'\n",
        `${unit.id}: retention terminal-state import`,
    )
    content = replaceExact(
        content,
        "    return `/api/bg-orchestrate-result/${encodeURIComponent(charId)}/${encodeURIComponent(chatId)}?delivery=ack-v1`\n",
        "    return `/api/bg-orchestrate-result/${encodeURIComponent(charId)}/${encodeURIComponent(chatId)}?delivery=ack-v1&consumerId=${encodeURIComponent(orchestrationConsumerId)}`\n",
        `${unit.id}: rolling delivery consumer identity`,
    )
    content = replaceExact(
        content,
        "    if (resultKeyVersion !== 1 || !operationId) return () => {}\n",
        "    if (!operationId) return () => {}\n",
        `${unit.id}: rolling delivery claim heartbeat`,
    )
    content = replaceExact(
        content,
        "    const baseUrl = orchestrationResultUrl(charId, chatId, operationId, 1)\n",
        "    const baseUrl = orchestrationResultUrl(charId, chatId, operationId, resultKeyVersion)\n",
        `${unit.id}: heartbeat follows negotiated result key`,
    )
    content = replaceExact(
        content,
        "        : `/api/bg-orchestrate-result/${encodeURIComponent(charId)}/${encodeURIComponent(chatId)}/${encodeURIComponent(resultId)}`\n",
        "        : `/api/bg-orchestrate-result/${encodeURIComponent(charId)}/${encodeURIComponent(chatId)}/${encodeURIComponent(resultId)}?consumerId=${encodeURIComponent(orchestrationConsumerId)}`\n",
        `${unit.id}: rolling ACK consumer identity`,
    )
    content = replaceExact(
        content,
        `            if (data?.operationState === 'delivered' || data?.operationState === 'cancelled') {
`,
        `            const retentionFailure = orchestrationRetentionFailureMessage(data?.operationState)
            if (retentionFailure) {
                stopWatch()
                try { alertError(retentionFailure) } catch { /* best-effort */ }
                return
            }
            if (data?.operationState === 'delivered' || data?.operationState === 'cancelled') {
`,
        `${unit.id}: live retention terminal state`,
    )
    content = replaceExact(
        content,
        `                if (operationState === 'delivered' || operationState === 'cancelled') {
`,
        `                const retentionFailure = orchestrationRetentionFailureMessage(operationState)
                if (retentionFailure) {
                    finishBootRecovery(operationId)
                    try { alertError(retentionFailure) } catch { /* best-effort */ }
                    return
                }
                if (operationState === 'delivered' || operationState === 'cancelled') {
`,
        `${unit.id}: boot retention terminal state`,
    )
    content = replaceExact(
        content,
        '    // can still ACK/merge the paid result until the normal 30-minute marker/result TTL expires.\n',
        '    // can still ACK/merge the paid result during the bounded server/browser retention window.\n',
        `${unit.id}: bounded recovery comment`,
    )
    content = replaceExact(
        content,
        "                () => sendChat(-1, { ...arg, bgOrchFallback: true }),\n",
        "                () => sendChatWithDirectLifecycle(key.chatId, -1, { ...arg, bgOrchFallback: true }),\n",
        `${unit.id}: browser fallback direct-send lifecycle`,
    )
    content = replaceExact(
        content,
        `                () => {
                    // Direct fallback bypasses DefaultChatScreen.sendChatMain(), whose final
                    // \`$doingChat = false\` normally releases the composer. Always mirror that
                    // cleanup here, including rejected/throwing fallback generations.
                    doingChat.set(false)
                    chatProcessStage.set(0)
                },
`,
        `                () => {
                    // sendChatWithDirectLifecycle owns the exact per-chat generation entry,
                    // pending-send tombstone, and stage cleanup. This outer fallback lifecycle
                    // owns only error isolation and the completion epilogue.
                },
`,
        `${unit.id}: remove store-only fallback cleanup`,
    )
    content = replaceExact(
        content,
        `): Promise<OrchestrateOutcome> {
    try {
`,
        `): Promise<OrchestrateOutcome> {
    let preparationOwner: { chatKey: string, generationId: string } | null = null
    const releasePreparationOwner = () => {
        if (!preparationOwner) return false
        const released = endGenerationIfOwned(
            preparationOwner.chatKey,
            preparationOwner.generationId,
        )
        preparationOwner = null
        return released
    }
    try {
`,
        `${unit.id}: preparation owner release boundary`,
    )
    content = replaceExact(
        content,
        `        doingChat.set(true)
        chatProcessStage.set(1) // show the top-bar immediately (assembly); polls refine the stage
        const charId = char.chaId, chatId = chat.id
`,
        `        const charId = char.chaId, chatId = chat.id
        const operationId = v4()
        const preparationKey = chatGenKey(chatId)
        preparationOwner = { chatKey: preparationKey, generationId: operationId }
        startGeneration(preparationKey, operationId)
        chatProcessStage.set(1) // keyed owner makes the current-chat spinner visible immediately
`,
        `${unit.id}: keyed preparation owner acquisition`,
    )
    content = replaceExact(
        content,
        `        } catch (error) {
            doingChat.set(false)
            chatProcessStage.set(0)
`,
        `        } catch (error) {
            releasePreparationOwner()
            chatProcessStage.set(0)
`,
        `${unit.id}: failed preparation release`,
    )
    content = replaceExact(
        content,
        `        if (arg?.signal?.aborted) {
            doingChat.set(false)
            chatProcessStage.set(0)
            return { handled: true, result: false }
        }

        const operationId = v4()
`,
        `        if (arg?.signal?.aborted) {
            releasePreparationOwner()
            chatProcessStage.set(0)
            return { handled: true, result: false }
        }

`,
        `${unit.id}: aborted preparation release`,
    )
    content = replaceExact(
        content,
        `        setServerGenerationBusy(true)
        doingChat.set(false)
        const startBody = JSON.stringify({
`,
        `        setServerGenerationBusy(true)
        releasePreparationOwner()
        const startBody = JSON.stringify({
`,
        `${unit.id}: exact preparation-to-server handoff`,
    )
    content = replaceExact(
        content,
        `    } catch (e) {
        console.error('[bg-orch] error', e)
`,
        `    } catch (e) {
        releasePreparationOwner()
        console.error('[bg-orch] error', e)
`,
        `${unit.id}: unexpected preparation release`,
    )
    return content
}

function adaptBgDirectGenerationLifecycle190(content, unitId) {
    content = replaceExact(
        content,
        `        // Run the WHOLE pipeline like the client (chatProcessIndex -1; char/chat come from the
        // selectedCharID store + chatPage we set, NOT this arg). The bundle's localStorage stub
        // returns null → no re-delegation. Reset doingChat first (-1 early-returns if a prior preview
        // left it true). A throw is caught here; we read the chat back below regardless so an
        // already-pushed main reply isn't lost.
`,
        `        // Run the WHOLE pipeline like the client (chatProcessIndex -1; char/chat come from the
        // selectedCharID store + chatPage we set, NOT this arg). The bundle's localStorage stub
        // returns null, so there is no re-delegation. The direct-call lifecycle wrapper below owns
        // the exact native per-chat entry; a public doingChat write is not a substitute for it.
        // A throw is caught here; we read the chat back below regardless so an already-pushed main
        // reply is not lost.
`,
        `${unitId}: direct-send lifecycle comment`,
    )
    content = replaceExact(
        content,
        `        idx.doingChat.set(false)
        try { await runWithOrchestrationAbort(() => idx.sendChat(-1, { signal: llmAbort.signal })) }
`,
        `        try {
          await runWithOrchestrationAbort(() =>
            idx.sendChatWithDirectLifecycle(selectedChatId, -1, { signal: llmAbort.signal })
          )
        }
`,
        `${unitId}: full direct-send lifecycle`,
    )
    content = replaceExact(
        content,
        "          await runWithOrchestrationAbort(() => idx.sendChat(charIdx, { previewLLM: true, signal: llmAbort.signal }))\n",
        "          await runWithOrchestrationAbort(() => idx.sendChatWithDirectLifecycle(selectedChatId, charIdx, { previewLLM: true, signal: llmAbort.signal }))\n",
        `${unitId}: llm-preview direct-send lifecycle`,
    )
    content = replaceExact(
        content,
        "          await idx.sendChat(charIdx, { preview: true })\n",
        "          await idx.sendChatWithDirectLifecycle(selectedChatId, charIdx, { preview: true })\n",
        `${unitId}: assemble-preview direct-send lifecycle`,
    )
    return content
}

function adaptRunRegistryRetention190(unit) {
    let content = replaceExact(
        unit.content,
        "'use strict'\n",
        "'use strict'\n\nconst { ORCH_RESULT_RETENTION_TTL_MS } = require('./bgOrchestrationResultRetention.cjs')\n",
        `${unit.id}: retention policy import`,
    )
    content = replaceExact(
        content,
        '  const retainMs = options && Number.isFinite(options.retainMs) ? Math.max(0, options.retainMs) : 30 * 60 * 1000\n',
        '  const retainMs = options && Number.isFinite(options.retainMs) ? Math.max(0, options.retainMs) : ORCH_RESULT_RETENTION_TTL_MS\n',
        `${unit.id}: overnight tombstone retention`,
    )
    content = replaceExact(
        content,
        "      if (run.state !== 'running' && run.finishedAt <= cutoff) deleteRun(id, run)\n",
        "      if (run.state !== 'running' && run.finishedAt < cutoff) deleteRun(id, run)\n",
        `${unit.id}: inclusive TTL boundary`,
    )
    content = replaceExact(
        content,
        '      }, retainMs)\n',
        '      }, retainMs + 1)\n',
        `${unit.id}: inclusive retention timer`,
    )
    return content
}

function adaptPendingRetention190(unit) {
    let content = replaceExact(
        unit.content,
        'export const ORCHESTRATION_PENDING_MAX_AGE_MS = 30 * 60 * 1000\n',
        `// The server retains from result completion; this marker starts before provider work.
// One bounded hour of generation margin keeps the browser identity alive for the full 48-hour
// completed-result horizon without turning it into Revenant-style indefinite recovery.
export const ORCHESTRATION_PENDING_MAX_AGE_MS = 49 * 60 * 60 * 1000
`,
        `${unit.id}: overnight marker horizon`,
    )
    content = replaceExact(
        content,
        `export function readPendingMarkers(
    storage: MarkerStorage,
    now = Date.now(),
): OrchestrationPendingMarker[] {
`,
        `export function readPendingMarkers(
    storage: MarkerStorage,
    now = Date.now(),
    protectedOperationId: string | null = null,
): OrchestrationPendingMarker[] {
`,
        `${unit.id}: protected marker admission`,
    )
    content = replaceExact(
        content,
        `        const marker = parseMarker(storage.getItem(key))
        if (!marker || (marker.ts > 0 && now - marker.ts > ORCHESTRATION_PENDING_MAX_AGE_MS)) {
            storage.removeItem(key)
            continue
        }
        candidates.push({ key, marker })
`,
        `        let marker = parseMarker(storage.getItem(key))
        if (!marker || (marker.ts > 0 && now - marker.ts > ORCHESTRATION_PENDING_MAX_AGE_MS)) {
            storage.removeItem(key)
            continue
        }
        // A wall-clock rollback must not make old future-dated markers immortal or rank a newly
        // admitted paid operation behind them. Rebase each future marker once to this read time.
        if (marker.ts > now) {
            marker = { ...marker, ts: now }
            storage.setItem(key, JSON.stringify(marker))
        }
        candidates.push({ key, marker })
`,
        `${unit.id}: future marker normalization`,
    )
    content = replaceExact(
        content,
        `    candidates.sort((a, b) => a.marker.ts - b.marker.ts)
    const retained = candidates.slice(-ORCHESTRATION_PENDING_MAX_ENTRIES)
    for (const candidate of candidates.slice(0, -ORCHESTRATION_PENDING_MAX_ENTRIES)) {
        storage.removeItem(candidate.key)
    }
`,
        `    candidates.sort((a, b) => a.marker.ts - b.marker.ts)
    const protectedCandidate = protectedOperationId
        ? candidates.find((candidate) => candidate.marker.operationId === protectedOperationId)
        : undefined
    const ordinary = protectedCandidate
        ? candidates.filter((candidate) => candidate !== protectedCandidate)
        : candidates
    const retained = [
        ...ordinary.slice(-(ORCHESTRATION_PENDING_MAX_ENTRIES - (protectedCandidate ? 1 : 0))),
        ...(protectedCandidate ? [protectedCandidate] : []),
    ].sort((a, b) => a.marker.ts - b.marker.ts)
    const retainedKeys = new Set(retained.map((candidate) => candidate.key))
    for (const candidate of candidates) {
        if (!retainedKeys.has(candidate.key)) storage.removeItem(candidate.key)
    }
`,
        `${unit.id}: cap with new marker protection`,
    )
    content = replaceExact(
        content,
        '    readPendingMarkers(storage, marker.ts)\n',
        '    readPendingMarkers(storage, marker.ts, marker.operationId)\n',
        `${unit.id}: protected marker cleanup`,
    )
    return content
}

const regexImportMerge190 = `            /* BG-PRESERVE:START regex-import-merge */
            // Preserve execution multiplicity while retaining the canonical types[] schema.
            // Equal-key rows may share one canonical object only when none of their directions
            // overlap. A repeated direction starts another row, so import never deduplicates an
            // execution. The first disjoint row wins and canonical row order remains stable.
            const mergeKey = (d:customscript) => JSON.stringify([d.comment, d.in, d.out, d.flag ?? '', d.ableFlag ? 1 : 0])
            const byKey = new Map<string, customscript[]>()
            for(const data of datas){
                const key = mergeKey(data)
                const incoming = Array.from(new Set(scriptModes(data)))
                const incomingSet = new Set(incoming)
                let candidates = byKey.get(key)
                if(!candidates){
                    candidates = []
                    byKey.set(key, candidates)
                }
                const existing = candidates.find((candidate) =>
                    scriptModes(candidate).every((mode) => !incomingSet.has(mode))
                )
                if(existing){
                    const merged = Array.from(new Set([...scriptModes(existing), ...incoming]))
                    existing.types = merged
                    existing.type = merged[0]
                }
                else{
                    const copy:customscript = { ...data }
                    if(incoming.length > 1){
                        copy.types = incoming
                        copy.type = incoming[0]
                    }
                    else{
                        delete copy.types
                        copy.type = incoming[0]
                    }
                    candidates.push(copy)
                    o.push(copy)
                }
            }
            /* BG-PRESERVE:END */
`

const variant190 = new Map([
    ['bg-preserve:owned:server/node/bgOrchestrator.cjs', (unit) => ({
        ...unit,
        id: `${unit.id}:1.9`,
        content: adaptBgDirectGenerationLifecycle190(
            adaptBgRetention190(adaptBgRequestLogging190(unit), unit.id),
            unit.id,
        ),
        requires: [
            'bg-preserve:owned:server/node/bgRequestLogBridge.cjs:1.9',
            'bg-preserve:owned:server/node/bgOrchestrationResultRetention.cjs:1.9',
            'bg-preserve:hook:index-direct-send-lifecycle-wrapper:1.9',
        ],
        targetVersions: pocketRisu190,
    })],
    ['bg-preserve:owned:server/node/bgOrchestrationRunRegistry.cjs', (unit) => ({
        ...unit,
        id: `${unit.id}:1.9`,
        content: adaptRunRegistryRetention190(unit),
        requires: ['bg-preserve:owned:server/node/bgOrchestrationResultRetention.cjs:1.9'],
        targetVersions: pocketRisu190,
    })],
    ['bg-preserve:owned:src/ts/bgOrchestrationRunRegistry.test.ts', (unit) => ({
        ...unit,
        id: `${unit.id}:1.9`,
        content: `${unit.content}
const { ORCH_RESULT_RETENTION_TTL_MS } = require('../../server/node/bgOrchestrationResultRetention.cjs') as {
    ORCH_RESULT_RETENTION_TTL_MS: number
}

test('default tombstones retain the exact 48-hour boundary and expire one millisecond later', () => {
    let now = 0
    const registry = createOrchestrationRunRegistry({ now: () => now })
    const run = registry.start('operation-overnight').run
    registry.finish('operation-overnight', run)

    now = ORCH_RESULT_RETENTION_TTL_MS
    expect(registry.get('operation-overnight')).toBe(run)
    now += 1
    expect(registry.get('operation-overnight')).toBeNull()
})
`,
        requires: [
            'bg-preserve:owned:server/node/bgOrchestrationRunRegistry.cjs:1.9',
            'bg-preserve:owned:server/node/bgOrchestrationResultRetention.cjs:1.9',
        ],
        targetVersions: pocketRisu190,
    })],
    ['bg-preserve:owned:src/ts/bgOrchestrationPending.ts', (unit) => ({
        ...unit,
        id: `${unit.id}:1.9`,
        content: adaptPendingRetention190(unit),
        targetVersions: pocketRisu190,
    })],
    ['bg-preserve:owned:src/ts/bgOrchestrationPending.test.ts', (unit) => ({
        ...unit,
        id: `${unit.id}:1.9`,
        content: `${unit.content}
test('49-hour marker horizon includes the bounded generation margin', () => {
    expect(ORCHESTRATION_PENDING_MAX_AGE_MS).toBe(49 * 60 * 60 * 1000)
    const storage = new MemoryStorage()
    writePendingMarker(storage, marker('operation-margin', 1))
    expect(readPendingMarkers(storage, 1 + ORCHESTRATION_PENDING_MAX_AGE_MS)).toHaveLength(1)
    expect(readPendingMarkers(storage, 2 + ORCHESTRATION_PENDING_MAX_AGE_MS)).toHaveLength(0)
})

test('clock rollback cannot evict a newly admitted marker behind future timestamps', () => {
    const storage = new MemoryStorage()
    for (let i = 0; i < ORCHESTRATION_PENDING_MAX_ENTRIES; i++) {
        const value = marker('future-operation-' + i, 10_000 + i)
        storage.setItem(ORCHESTRATION_PENDING_PREFIX + value.operationId, JSON.stringify(value))
    }
    writePendingMarker(storage, marker('operation-new', 100))

    const retained = readPendingMarkers(storage, 100)
    expect(retained).toHaveLength(ORCHESTRATION_PENDING_MAX_ENTRIES)
    expect(retained.some((value) => value.operationId === 'operation-new')).toBe(true)
    expect(retained.every((value) => value.ts <= 100)).toBe(true)
})
`,
        requires: ['bg-preserve:owned:src/ts/bgOrchestrationPending.ts:1.9'],
        targetVersions: pocketRisu190,
    })],
    ['bg-preserve:owned:src/ts/bgOrchestrate.ts', (unit) => ({
        ...unit,
        id: `${unit.id}:1.9`,
        content: adaptBgOrchestrateRetention190(unit),
        requires: [
            'bg-preserve:owned:src/ts/bgOrchestrationRetentionState.ts:1.9',
            'bg-preserve:hook:index-direct-send-lifecycle-wrapper:1.9',
        ],
        targetVersions: pocketRisu190,
    })],
    ['bg-preserve:hook:server-cjs-register-routes', (unit) => ({
        ...unit,
        id: `${unit.id}:1.9`,
        managed: replaceExact(
            unit.managed,
            "require('./bgOrchestrator.cjs')(app, Object.assign({ sessionAuthMiddleware, ensureChatStore, getDbCache: () => dbCache, getFullChatStore: () => fullChatStore, DB_HEX_KEY }, require('./db.cjs')));",
            "require('./bgOrchestrator.cjs')(app, Object.assign({ sessionAuthMiddleware, ensureChatStore, getDbCache: () => dbCache, getFullChatStore: () => fullChatStore, DB_HEX_KEY, requestLogs }, require('./db.cjs')));",
            `${unit.id}: native request-log owner registration`,
        ),
        targetVersions: pocketRisu190,
    })],
    ['bg-preserve:hook:regex-import-merge', (unit) => ({
        ...unit,
        id: `${unit.id}:1.9`,
        managed: regexImportMerge190,
        targetVersions: pocketRisu190,
    })],
    ['bg-preserve:hook:globalapi-fetch-impl-register', (unit) => ({
        ...unit,
        id: `${unit.id}:1.9`,
        anchor: 'export async function fetchNative(url: string, arg: FetchNativeArgs): Promise<Response> {',
        targetVersions: pocketRisu190,
    })],
    ['bg-preserve:hook:index-unified-generation-busy', (unit) => ({
        ...unit,
        id: `${unit.id}:1.9`,
        file: 'src/ts/process/generationState.ts',
        anchor: 'export const doingChat = writable(false)\n',
        managed: `/* BG-PRESERVE:START generation-busy-store-1.9 */
// Native per-chat generation state owns the client lease. Its public writable delegates
// into the BG coordinator so native sync/reset calls can release only the client side;
// a detached server orchestration keeps every combined subscriber busy until terminal.
export const doingChat = unifiedDoingChat
/* BG-PRESERVE:END */
`,
        markerNeedle: 'generation-busy-store-1.9',
        requires: ['bg-preserve:hook:index-unified-generation-busy-import:1.9'],
        after: undefined,
        targetVersions: pocketRisu190,
    })],
    ['bg-preserve:hook:index-register-gen-context', (unit) => ({
        ...unit,
        id: `${unit.id}:1.9`,
        anchor: '    const generationModel = getGenerationModelString()\n',
        managed: `    /* BG-PRESERVE:START generation-context-1.9 */
    // PocketRisu 1.9 mints generationId before chat/token resolution. Register only here,
    // after stable chat coordinates and token metadata exist, and bind the exact native
    // per-chat AbortController instead of the former screen-global callback.
    try {
        setBgGenContext(generationId, {
            charId: (currentChar as any)?.chaId,
            chatId: (currentChar as any)?.chats?.[(currentChar as any)?.chatPage]?.id,
            charName: (currentChar as any)?.name,
            inputTokens,
            outputTokens,
            maxContext: maxContextTokens,
        })
        bindGenToActiveAbort(generationId, () => abortGeneration(genKey))
    } catch { /* best-effort */ }
    /* BG-PRESERVE:END */
`,
        markerNeedle: 'generation-context-1.9',
        requires: ['bg-preserve:hook:index-register-gen-context-abort-import:1.9'],
        targetVersions: pocketRisu190,
    })],
    ['bg-preserve:hook:defaultchatscreen-composer-orchestrating-gate', (unit) => ({
        ...unit,
        id: `${unit.id}:1.9`,
        // Keep the closing Svelte directive brace outside the anchor. This unit
        // inserts `after`, so including `}` would render the managed expression
        // as literal composer text instead of extending the condition.
        anchor: '                {#if currentChatGenerating || doingChatInputTranslate',
        targetVersions: pocketRisu190,
    })],
    ['bg-preserve:hook:request-cache-authority-gate', (unit) => ({
        ...unit,
        id: `${unit.id}:1.9`,
        anchor: `    if (kind === 'google-gemini' && preset.promptCaching?.enabled && mode === 'model'
        && (caps?.includes('cache') ?? false)
        && !tools && !arg.previewBody
        && (cacheAuthKind === 'x-goog-api-key' || cacheAuthKind === 'google-service-account')) {
        const cacheChatKey = getCurrentChat()?.id
        if (cacheChatKey) {
            cache = {
                promptCaching: preset.promptCaching,
                chatKey: cacheChatKey,
                task: mode,
                presetId: preset.id,
                generationId: genId,
                // Always the direct proxied fetch, never the server-side job
                // fetch: a job is keyed to the chat (one at a time) and its
                // journal is replayed as a CHAT response at boot, so cache
                // housekeeping calls must not become jobs. Built without the
                // route reporter so a cachedContents call cannot relabel the
                // chat request's log entries.
                fetchImpl: makeProxiedFetch(arg.chatId),
            }
        }
    }
`,
        managed: `    /* BG-PRESERVE:START gemini-cache-authority-gate-1.9 */
    if (cacheRuntimeAuthority && kind === 'google-gemini' && preset.promptCaching?.enabled && mode === 'model'
        && (caps?.includes('cache') ?? false)
        && !tools && !arg.previewBody
        && (cacheAuthKind === 'x-goog-api-key' || cacheAuthKind === 'google-service-account')) {
        const cacheChatKey = getCurrentChat()?.id
        if (cacheChatKey) {
            cache = {
                promptCaching: preset.promptCaching,
                chatKey: cacheChatKey,
                task: mode,
                presetId: preset.id,
                generationId: genId,
                // Preserve native 1.9's cache-housekeeping route. It must bypass both
                // native model jobs and BG stream jobs so cache usage cannot be recovered
                // as a chat response or relabel the main request log.
                fetchImpl: makeProxiedFetch(arg.chatId),
            }
        }
    }
    /* BG-PRESERVE:END */
`,
        markerNeedle: 'gemini-cache-authority-gate-1.9',
        targetVersions: pocketRisu190,
    })],
    ['bg-preserve:hook:request-stream-cache-source-badge', (unit) => ({
        ...unit,
        id: `${unit.id}:1.9`,
        anchor: `                                if (cache && cachedTokens > 0) {
                                    addBadge(genId, { key: 'cache', text: language.requestStatus.cacheHit.replace('{n}', cachedTokens.toLocaleString()), tone: 'success' })
                                }
`,
        targetVersions: pocketRisu190,
    })],
    ['bg-preserve:hook:tokenizer-tikjs-catch-fallback', (unit) => ({
        ...unit,
        id: `${unit.id}:1.9`,
        anchor: '    return (await pending).encode(text)\n',
        targetVersions: pocketRisu190,
    })],
])

const target181Only = new Set([
    'bg-preserve:hook:app-svelte-safe-mobile-file-drop',
    'bg-preserve:hook:defaultchatscreen-import-abort',
    'bg-preserve:hook:defaultchatscreen-register-abort',
    'bg-preserve:hook:index-remove-legacy-busy-guard',
])

const variantIds = new Set(variant190.keys())

function expandRelations(unit) {
    const output = { ...unit }
    // Version siblings are mutually exclusive. Only optional ordering hints may
    // name both; hard requirements must keep naming one concrete active unit.
    for (const relation of ['after', 'before']) {
        if (!Array.isArray(output[relation])) continue
        output[relation] = [...new Set(output[relation].flatMap((id) =>
            variantIds.has(id) ? [id, `${id}:1.9`] : [id]
        ))]
    }
    return output
}

const units = base.units.flatMap((rawUnit) => {
    if (rawUnit.id === legacyCharxCauseUnit) return []
    const unit = adaptUniversalUnit(adaptOwned(rawUnit))
    const create190 = variant190.get(unit.id)
    if (create190) {
        return [
            expandRelations({ ...unit, targetVersions: pocketRisu181 }),
            expandRelations(create190(unit)),
        ]
    }
    if (target181Only.has(unit.id)) {
        return [expandRelations({ ...unit, targetVersions: pocketRisu181 })]
    }
    return [expandRelations(unit)]
})

units.push(
    {
        id: 'bg-preserve:owned:server/node/bgOrchestrationResultRetention.cjs:1.9',
        file: 'server/node/bgOrchestrationResultRetention.cjs',
        type: 'owned',
        content: owned('server/node/bgOrchestrationResultRetention.cjs'),
        targetVersions: pocketRisu190,
    },
    {
        id: 'bg-preserve:owned:server/node/bgOrchestrationResultRetention.test.ts:1.9',
        file: 'server/node/bgOrchestrationResultRetention.test.ts',
        type: 'owned',
        content: owned('server/node/bgOrchestrationResultRetention.test.ts'),
        requires: [
            'bg-preserve:owned:server/node/bgOrchestrationResultRetention.cjs:1.9',
            'bg-preserve:owned:server/node/bgOrchestrator.cjs:1.9',
        ],
        targetVersions: pocketRisu190,
    },
    {
        id: 'bg-preserve:owned:src/ts/bgOrchestrationRetentionState.ts:1.9',
        file: 'src/ts/bgOrchestrationRetentionState.ts',
        type: 'owned',
        content: owned('src/ts/bgOrchestrationRetentionState.ts'),
        targetVersions: pocketRisu190,
    },
    {
        id: 'bg-preserve:owned:src/ts/bgOrchestrationRetentionState.test.ts:1.9',
        file: 'src/ts/bgOrchestrationRetentionState.test.ts',
        type: 'owned',
        content: owned('src/ts/bgOrchestrationRetentionState.test.ts'),
        requires: [
            'bg-preserve:owned:src/ts/bgOrchestrationRetentionState.ts:1.9',
            'bg-preserve:owned:src/ts/bgOrchestrate.ts:1.9',
        ],
        targetVersions: pocketRisu190,
    },
    {
        id: 'bg-preserve:owned:server/node/bgRequestLogBridge.cjs:1.9',
        file: 'server/node/bgRequestLogBridge.cjs',
        type: 'owned',
        content: owned('server/node/bgRequestLogBridge.cjs'),
        targetVersions: pocketRisu190,
    },
    {
        id: 'bg-preserve:owned:server/node/bgRequestLogBridge.test.ts:1.9',
        file: 'server/node/bgRequestLogBridge.test.ts',
        type: 'owned',
        content: owned('server/node/bgRequestLogBridge.test.ts'),
        requires: [
            'bg-preserve:owned:server/node/bgRequestLogBridge.cjs:1.9',
            'bg-preserve:owned:server/node/bgOrchestrator.cjs:1.9',
        ],
        targetVersions: pocketRisu190,
    },
    {
        id: 'bg-preserve:hook:index-unified-generation-busy-import:1.9',
        file: 'src/ts/process/generationState.ts',
        type: 'insert',
        where: 'after',
        anchor: 'import { derived, get, writable, type Readable } from "svelte/store"\n',
        content: 'import { doingChat as unifiedDoingChat } from "../generationBusy"\n',
        targetVersions: pocketRisu190,
    },
    {
        id: 'bg-preserve:hook:index-register-gen-context-abort-import:1.9',
        file: 'src/ts/process/index.svelte.ts',
        type: 'insert',
        where: 'after',
        anchor: 'import { chatGenKey, chatProcessStage, endGeneration, isChatGenerating, setGenerationStage, startGeneration } from "./generationState";\n',
        content: 'import { abortGeneration } from "./generationState";\n',
        targetVersions: pocketRisu190,
    },
    {
        id: 'bg-preserve:hook:generation-state-direct-lifecycle:1.9',
        file: 'src/ts/process/generationState.ts',
        type: 'insert',
        where: 'after',
        anchor: `export function chatGenKey(chatId: string | undefined): string {
    return chatId ?? 'nochat'
}
`,
        content: `// Direct sendChat callers bypass DefaultChatScreen's lifecycle wrapper. Acquire
// only a currently idle chat, then release exactly the entry that this synchronous call
// creates. A blocked direct call never resets another generation's state or global stage.
export async function runDirectGenerationLifecycle<T>(
    chatId: string | undefined,
    run: () => Promise<T>,
    onFinish?: () => void,
): Promise<T | false> {
    const chatKey = chatGenKey(chatId)
    if (isChatGenerating(chatKey)) return false
    try {
        return await run()
    } finally {
        endGeneration(chatKey)
        chatProcessStage.set(0)
        onFinish?.()
    }
}

// A preparation owner may hand off to a server lease while unrelated async work continues.
// Release only the exact generation this caller acquired; never tear down a replacement owner.
export function endGenerationIfOwned(chatKey: string, generationId: string): boolean {
    if (get(generationStates).get(chatKey)?.generationId !== generationId) return false
    endGeneration(chatKey)
    return true
}
`,
        requires: ['bg-preserve:hook:index-unified-generation-busy:1.9'],
        targetVersions: pocketRisu190,
    },
    {
        id: 'bg-preserve:hook:index-direct-send-lifecycle-import:1.9',
        file: 'src/ts/process/index.svelte.ts',
        type: 'insert',
        where: 'after',
        anchor: 'import { chatGenKey, chatProcessStage, endGeneration, isChatGenerating, setGenerationStage, startGeneration } from "./generationState";\n',
        content: 'import { runDirectGenerationLifecycle } from "./generationState";\n',
        after: ['bg-preserve:hook:index-register-gen-context-abort-import:1.9'],
        targetVersions: pocketRisu190,
    },
    {
        id: 'bg-preserve:hook:index-direct-send-lifecycle-wrapper:1.9',
        file: 'src/ts/process/index.svelte.ts',
        type: 'insert',
        where: 'before',
        anchor: 'export async function sendChat(chatProcessIndex = -1,arg:{\n',
        content: `// Direct orchestration callers do not pass through DefaultChatScreen.sendChatMain().
// Reuse the native per-chat generation and pending-send owners, and keep the direct caller's
// cleanup exact even when sendChat rejects or returns through an early terminal path.
export async function sendChatWithDirectLifecycle(
    chatId: string | undefined,
    chatProcessIndex: number,
    arg: Parameters<typeof sendChat>[1] = {},
): Promise<boolean> {
    const result = await runDirectGenerationLifecycle(
        chatId,
        () => sendChat(chatProcessIndex, arg),
        () => {
            // The server bundle disables pending-send registration in its cloned DB. Avoid a
            // relative browser-route DELETE there; browser fallback mirrors the native UI owner.
            const serverBundle = (globalThis as { __bgOrch?: unknown }).__bgOrch
            if (chatId && !serverBundle) clearPendingSend(chatId)
        },
    )
    return result === false ? false : result
}

`,
        requires: [
            'bg-preserve:hook:index-direct-send-lifecycle-import:1.9',
            'bg-preserve:hook:generation-state-direct-lifecycle:1.9',
        ],
        targetVersions: pocketRisu190,
    },
    {
        id: 'bg-preserve:owned:src/ts/process/directGenerationLifecycle.test.ts:1.9',
        file: 'src/ts/process/directGenerationLifecycle.test.ts',
        type: 'owned',
        content: owned('src/ts/process/directGenerationLifecycle.test.ts'),
        requires: ['bg-preserve:hook:generation-state-direct-lifecycle:1.9'],
        targetVersions: pocketRisu190,
    },
    {
        id: 'bg-preserve:owned:src/ts/process/regexImportMultiplicity.test.ts:1.9',
        file: 'src/ts/process/regexImportMultiplicity.test.ts',
        type: 'owned',
        content: owned('src/ts/process/regexImportMultiplicity.test.ts'),
        requires: ['bg-preserve:hook:regex-import-merge:1.9'],
        targetVersions: pocketRisu190,
    },
)

module.exports = {
    ...base,
    version: 'v1.0.1-patcher.9',
    source: 'bg-preserve-install.cjs + PocketRisu 1.9 authority adapter',
    targets: {
        pocketrisu: {
            verified: ['1.8.1', '1.9.0', '1.10.0'],
            reviewing: [],
        },
    },
    units,
}
