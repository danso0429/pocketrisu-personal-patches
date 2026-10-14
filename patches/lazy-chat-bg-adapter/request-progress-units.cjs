'use strict'
const fs = require('node:fs')
const path = require('node:path')

module.exports = prior => {
    const prefix = 'lazy-chat-bg-adapter:request-progress:'
    const targetVersions = { pocketrisu: ['1.10.0'] }
    const units = []
    const add = (name, file, anchor, content, requires = [], type = 'replace', where) => {
        units.push({ id: prefix + name, file, type, anchor,
            ...(file.endsWith('.svelte') ? { managed: content } : { content }),
            ...(where ? { where } : {}), requires, targetVersions,
            after: [...prior, ...units].filter(unit => unit.file === file).map(unit => unit.id)
                .concat(file === 'src/ts/status/requestStatus.ts' ? ['bg-preserve:hook:requeststatus-relayed-tick-skip'] : []) })
    }
    for (const file of ['src/ts/bgRequestProgress.ts', 'src/ts/bgRequestProgress.test.ts',
        'src/lib/UI/GUI/RequestStatusToaster.test.ts']) {
        units.push({ id: prefix + file, file, type: 'owned', targetVersions,
            content: fs.readFileSync(path.join(__dirname, 'files-1.10', file), 'utf8') })
    }
    const status = 'src/ts/status/requestStatus.ts'
    add('relay-owner-argument', status,
        'export function ingestRelayedStatuses(snapshots: RelayedStatusSnapshot[]): void {',
        'export function ingestRelayedStatuses(snapshots: RelayedStatusSnapshot[], pipelineOwner?: string): void {',
        ['bg-preserve:hook:requeststatus-relay-api'])
    add('relay-owner-field', status, '                relayed: true,',
        '                relayed: true,\n                pipelineOwner,', ['bg-preserve:hook:requeststatus-relay-api'])
    add('relay-owner-prune', status,
        '        for (const [id, e] of next) if (e.relayed && !keep.has(id)) next.delete(id)',
        '        for (const [id, e] of next) if (e.relayed && e.pipelineOwner === pipelineOwner && !keep.has(id)) next.delete(id)',
        ['bg-preserve:hook:requeststatus-relay-api'])
    add('relay-clear-argument', status, 'export function clearRelayedStatuses(): void {',
        'export function clearRelayedStatuses(pipelineOwner?: string): void {', ['bg-preserve:hook:requeststatus-relay-api'])
    add('relay-clear-owner', status,
        '        for (const [id, e] of next) if (e.relayed) { next.delete(id); changed = true }',
        '        for (const [id, e] of next) if (e.relayed && e.pipelineOwner === pipelineOwner) { next.delete(id); changed = true }',
        ['bg-preserve:hook:requeststatus-relay-api'])

    const server = 'server/node/bgOrchestrator.cjs'
    add('server-gap-helper', server,
        'const stageKey = (charId, chatId) => String(charId) + \'::\' + String(chatId)',
        `function operationProgress(operationId, run) {
  const progress = run && run.operationId === operationId && run.state === 'running'
    && ['queued', 'preparing', 'saving'].includes(run.progress) ? run.progress : undefined
  const stage = _orchStage[operationId]
  return { progress, stage: Number.isInteger(stage) && stage >= 0 && stage <= 4 ? stage : 0,
    status: Array.isArray(_orchStatus[operationId]) ? _orchStatus[operationId] : [] }
}
const stageKey = (charId, chatId) => String(charId) + '::' + String(chatId)`)
    add('server-queued', server, '        const activeRun = started.run',
        "        const activeRun = started.run\n        activeRun.progress = 'queued'")
    add('server-preparing', server, '        void runDetachedTurn(async () => {\n          const t0 = Date.now()',
        "        void runDetachedTurn(async () => {\n          activeRun.progress = 'preparing'\n          const t0 = Date.now()",
        ['lazy-chat-bg-adapter:assembly-turn-start:1.10'])
    add('server-saving', server, '                serverChatCommit = await serverChatCommitOwner.commitGenerationResult({',
        "                activeRun.progress = 'saving'\n                serverChatCommit = await serverChatCommitOwner.commitGenerationResult({",
        ['lazy-chat-bg-adapter:server-chat-commit-terminal:1.10'])
    add('server-result-gap', server,
        '          stage: _orchStage[operationId] ?? 0,\n          status: _orchStatus[operationId] || [],',
        '          ...operationProgress(operationId, run),', ['lazy-chat-bg-adapter:server-chat-commit-missing-result:1.10'])
    add('server-input-gap', server,
        '        inputCommandId: inputCommand.admission.inputCommandId,',
        "        ...operationProgress(operationId, orchestrationRuns.get(operationId)),\n        ...(inputCommand.transformState === 'running' && !orchestrationRuns.get(operationId) ? { progress: 'preparing' } : {}),\n        inputCommandId: inputCommand.admission.inputCommandId,",
        ['lazy-chat-bg-adapter:failed-input:status-proof:1.10'])
    add('server-run-status-gap', server,
        "      return res.json({ accepted: true, operationId, state, resultKeyVersion: run.resultKeyVersion || 0 })",
        "      return res.json({ accepted: true, operationId, state, resultKeyVersion: run.resultKeyVersion || 0, ...operationProgress(operationId, run) })")
    add('server-found-progress', server,
        '      return res.json({ ...orchResultResponse(parsed), resultKeyVersion: 1 })',
        '      return res.json({ ...orchResultResponse(parsed), resultKeyVersion: 1, ...operationProgress(operationId, orchestrationRuns.get(operationId)) })')

    const client = 'src/ts/bgOrchestrate.ts'
    add('client-import', client, "import { ingestRelayedStatuses, clearRelayedStatuses } from './status/requestStatus'",
        `import { ingestRelayedStatuses, clearRelayedStatuses } from './status/requestStatus'
import { beginRequestProgress, setRequestProgress, completeRequestProgress, retireRequestProgress, applyRequestProgress,
    requestProgressAdmission, requestProgressStopping, requestProgressCancelResult, ingestRequestProgressStatuses, retireUnfinishedRequestProgress } from './bgRequestProgress'`)
    add('prepared-request', client, '        const operationId = v4()\n        const preparationKey = chatGenKey(chatId)',
        "        const operationId = v4()\n        progressOperationId = operationId\n        beginRequestProgress({ operationId, charId, chatId })\n        const preparationKey = chatGenKey(chatId)")
    add('prepared-request-owner', client,
        '    let preparationOwner: { chatKey: string, generationId: string } | null = null',
        '    let progressOperationId: string | null = null\n    let preparationOwner: { chatKey: string, generationId: string } | null = null')
    add('prepared-retire-on-fallback', client,
        '    } catch (e) {\n        releasePreparationOwner()\n        console.error(\'[bg-orch] error\', e)',
        "    } catch (e) {\n        retireRequestProgress(progressOperationId)\n        releasePreparationOwner()\n        console.error('[bg-orch] error', e)")
    add('prepared-base-terminal', client,
        '        } catch (error) {\n            releasePreparationOwner()\n            chatProcessStage.set(0)',
        "        } catch (error) {\n            setRequestProgress(operationId, arg?.signal?.aborted || (error as { name?: unknown })?.name === 'AbortError' ? 'cancelled' : 'failed')\n            releasePreparationOwner()\n            chatProcessStage.set(0)")
    const abortBlock = '        if (arg?.signal?.aborted) {\n            releasePreparationOwner()\n            chatProcessStage.set(0)\n            return { handled: true, result: false }\n        }'
    const aborted = "        if (arg?.signal?.aborted) {\n            setRequestProgress(operationId, 'cancelled')\n            releasePreparationOwner()\n            chatProcessStage.set(0)\n            return { handled: true, result: false }\n        }"
    for (const [name, suffix] of [
        ['before-capability', '\n\n\n/* POCKETRISU-PATCH:lazy-chat-bg-adapter:server-chat-commit-client-negotiate:1.10:START */'],
        ['after-capability', '\n/* POCKETRISU-PATCH:lazy-chat-bg-adapter:server-chat-commit-client-negotiate:1.10:END */'],
    ]) add('prepared-aborted-' + name, client, abortBlock + suffix, aborted + suffix)
    add('watch-poll', client,
        '            if (data && Array.isArray(data.status)) { try { ingestRelayedStatuses(data.status) } catch { /* best-effort */ } }',
        "            if (data && Array.isArray(data.status)) { try { ingestRequestProgressStatuses(data.status, operationId) } catch { /* best-effort */ } }")
    add('boot-poll', client,
        '                    if (Array.isArray(data.status)) { try { ingestRelayedStatuses(data.status) } catch { /* best-effort */ } }',
        "                    if (Array.isArray(data.status)) { try { ingestRequestProgressStatuses(data.status, operationId) } catch { /* best-effort */ } }")
    add('watch-clear', client,
        '    if (!get(doingChat)) { try { clearRelayedStatuses() } catch { /* best-effort */ } }',
        '    retireUnfinishedRequestProgress(operationId)\n    if (!get(doingChat)) { try { clearRelayedStatuses(operationId || undefined) } catch { /* best-effort */ } }')
    add('boot-progress-before-terminal', client,
        '/* POCKETRISU-PATCH:lazy-chat-bg-adapter:server-commit-boot-missing-result:1.10:START */',
        'if (operationId) applyRequestProgress({ operationId, charId, chatId }, data)\n/* POCKETRISU-PATCH:lazy-chat-bg-adapter:server-commit-boot-missing-result:1.10:START */')
    add('boot-retired-presentation', client, 'function endBootRecoveryUI(operationId: string | null): void {',
        'function endBootRecoveryUI(operationId: string | null): void {\n    retireUnfinishedRequestProgress(operationId)')
    add('completion', client,
        '\n    completionNotifiedOperations.add(operationId)',
        "\n    completionNotifiedOperations.add(operationId)\n    completeRequestProgress(operationId, data)")
    add('fallback', client, "    console.warn('[bg-orch] server produced no main reply → client fallback:', reason)",
        "    retireRequestProgress(activeOperationId)\n    console.warn('[bg-orch] server produced no main reply → client fallback:', reason)")
    add('failed', client, 'function notifyFinishedServerFailure(operationId: string, data: any): void {',
        "function notifyFinishedServerFailure(operationId: string, data: any): void {\n    setRequestProgress(operationId, 'failed')")
    add('parked', client, "function parkUnverifiedRecovery(operationId: string | null, mode: 'watch' | 'boot'): void {",
        "function parkUnverifiedRecovery(operationId: string | null, mode: 'watch' | 'boot'): void {\n    retireRequestProgress(operationId)")
    add('hydrating', client,
        "    if (!isTerminalCommittedEvidence(data)) return { hydrated: false as const, reason: 'execution-active' }",
        "    if (!isTerminalCommittedEvidence(data)) return { hydrated: false as const, reason: 'execution-active' }\n    beginRequestProgress({ operationId, charId, chatId }, 'loading')\n    setRequestProgress(operationId, 'loading')")
    add('legacy-saving', client,
        'async function persistMergedOrchestrationResult(charId: string, chatId: string, data: any) {',
        "async function persistMergedOrchestrationResult(charId: string, chatId: string, data: any) {\n    if (typeof data?.operationId === 'string') {\n        beginRequestProgress({ operationId: data.operationId, charId, chatId }, 'saving')\n        setRequestProgress(data.operationId, 'saving')\n    }")
    add('raw-completed', client,
        '        if (!hydration.hydrated || !Array.isArray(character.chats) || currentChat() !== hydration.chat) continue',
        "        if (!hydration.hydrated || !Array.isArray(character.chats) || currentChat() !== hydration.chat) continue\n        completeRequestProgress(marker.operationId, data)")
    add('raw-outcome-local', client, '        return await submitServerInputCommand({',
        '        const outcome = await submitServerInputCommand({')
    add('raw-owner-local', client, '    recoveryAdmissionDepth++',
        '    let requestProgressOperationId: string | null = null\n    recoveryAdmissionDepth++')
    add('raw-admission-catch', client, "        console.error('[bg-orch] server input admission unavailable', error)",
        "        retireRequestProgress(requestProgressOperationId)\n        console.error('[bg-orch] server input admission unavailable', error)")
    add('raw-request-start', client, '            start: async (body, signal) => {',
        `            start: async (body, signal) => {
                if (typeof body.operationId === 'string') {
                    requestProgressOperationId = body.operationId
                    beginRequestProgress({ operationId: body.operationId, charId, chatId })
                }`)
    add('raw-outcome', client,
        '        }, { charId, chatId, rawText, draftId, replaceBlockedOperationId, inputPreparation })',
        `        }, { charId, chatId, rawText, draftId, replaceBlockedOperationId, inputPreparation })
        const progressId = 'operationId' in outcome ? outcome.operationId : requestProgressOperationId
        if (progressId) requestProgressAdmission({ operationId: progressId, charId, chatId }, outcome)
        return outcome`)
    add('raw-status-poll', client,
        '            return { status: response.status, body: await readRecoveryJson(response) }',
        `            const body = await readRecoveryJson(response)
            if (response.ok) {
                applyRequestProgress({ operationId, charId, chatId }, body)
                try { if (Array.isArray(body?.status)) ingestRequestProgressStatuses(body.status, operationId) } catch { /* presentation only */ }
            }
            return { status: response.status, body }`)
    add('raw-result-poll', client,
        '        if (data.operationId !== marker.operationId || !isCurrentCharacter()) continue',
        `        if (data.operationId !== marker.operationId || !isCurrentCharacter()) continue
        applyRequestProgress({ operationId: marker.operationId, charId, chatId }, data)
        try { if (Array.isArray(data.status)) ingestRequestProgressStatuses(data.status, marker.operationId) } catch { /* presentation only */ }`)
    add('raw-settlement-status', client,
        '/* POCKETRISU-PATCH:lazy-chat-bg-adapter:stream-preview:cancelled-reconciliation:START */',
        '/* POCKETRISU-PATCH:lazy-chat-bg-adapter:stream-preview:cancelled-reconciliation:START */\n                if (statusResponse.ok) applyRequestProgress({ operationId: marker.operationId, charId, chatId }, statusData)')
    add('raw-parked', client, '                trackParkedRecovery(marker.operationId)',
        '                retireUnfinishedRequestProgress(marker.operationId)\n                trackParkedRecovery(marker.operationId)')
    add('settled-recovery-presentation', client,
        '    if (!retire && transient && Date.now() <= deadline) return false',
        '    if (!retire && transient && Date.now() <= deadline) return false\n    retireRequestProgress(operationId)')
    add('prepared-admission', client, "            if (resolution === 'accepted') startWatchTimer()",
        "            if (resolution === 'accepted') { requestProgressAdmission({ operationId, charId, chatId }, { kind: 'accepted' }); startWatchTimer() }")
    add('prepared-rejected', client, "            else if (resolution === 'rejected') {",
        "            else if (resolution === 'rejected') {\n                setRequestProgress(operationId, 'failed')")
    add('prepared-save-failure', client,
        '            console.error(\'[bg-orch] base chat save failed; provider not started\', error)',
        "            setRequestProgress(operationId, 'failed')\n            console.error('[bg-orch] base chat save failed; provider not started', error)")
    add('uncommitted', client,
        '    const conflictNotice = anchoredCommitConflictNotice(data)',
        "    retireRequestProgress(operationId)\n    const conflictNotice = anchoredCommitConflictNotice(data)")
    add('scoped-boot-clear', client,
        '        try { clearRelayedStatuses() } catch { /* best-effort */ }\n    }\n/* POCKETRISU-PATCH:lazy-chat-bg-adapter:recovery-owner:boot-client-stage:1.10:END */',
        '        try { clearRelayedStatuses(operationId || undefined) } catch { /* best-effort */ }\n    }\n/* POCKETRISU-PATCH:lazy-chat-bg-adapter:recovery-owner:boot-client-stage:1.10:END */')
    add('scoped-release-clear', client,
        '        try { clearRelayedStatuses() } catch { /* best-effort */ }\n    }\n}\n\nconst foregroundPollGate',
        '        try { clearRelayedStatuses(operationId || undefined) } catch { /* best-effort */ }\n    }\n}\n\nconst foregroundPollGate')
    add('watch-progress-before-terminal', client,
        '            || watchKey.charId !== charId || watchKey.chatId !== chatId) return',
        "            || watchKey.charId !== charId || watchKey.chatId !== chatId) return\n        if (operationId && !(data?.kind === 'terminal-error'\n            && serverChatDeliveryDisposition(data) === 'legacy-client-owned')) {\n            applyRequestProgress({ operationId, charId, chatId }, data)\n        }")
    add('observed-stop-start', client,
        '        const query = new URLSearchParams({ charId: target.charId, chatId: target.chatId })',
        "        requestProgressStopping(target.operationId)\n        const query = new URLSearchParams({ charId: target.charId, chatId: target.chatId })")
    add('observed-stop-outcome', client,
        '        if (data.cancelled !== true) return \'unconfirmed\'\n        if (activeOperationId === target.operationId',
        "        if (data.cancelled !== true) return 'unconfirmed'\n        requestProgressCancelResult(target.operationId, 'cancelled')\n        if (activeOperationId === target.operationId")
    add('observed-stop-finished', client,
        "        if (data.finished === true && data.cancelled === false) return 'finished'",
        "        if (data.finished === true && data.cancelled === false) { requestProgressCancelResult(target.operationId, 'finished'); return 'finished' }")
    add('observed-stop-finally', client,
        "    } catch { return 'unconfirmed' }\n}\n\nlet cancelPromise",
        "    } catch { return 'unconfirmed' }\n    finally { requestProgressCancelResult(target.operationId, 'unconfirmed') }\n}\n\nlet cancelPromise")
    add('prepared-stop-start', client,
        '    cancelPromise = (async () => {',
        "    requestProgressStopping(operationId)\n    cancelPromise = (async () => {")
    add('prepared-stop-outcome', client,
        '            // ACK means the server delivered abort and forbids any further result publish. Invalidate',
        "            requestProgressCancelResult(operationId, 'cancelled')\n            // ACK means the server delivered abort and forbids any further result publish. Invalidate")
    add('prepared-stop-finally', client,
        '            cancelPromise = null',
        "            requestProgressCancelResult(operationId, 'unconfirmed')\n            cancelPromise = null")
    add('prepared-stop-finished', client,
        '                // Completion is not cancellation. Existing watch/boot recovery owns',
        "                requestProgressCancelResult(operationId, 'finished')\n                // Completion is not cancellation. Existing watch/boot recovery owns")

    const toast = 'src/lib/UI/GUI/RequestStatusToast.svelte'
    add('model-details-source', toast,
        '    const entry = $derived($requestStatuses.get(id))',
        `    const entry = $derived($requestStatuses.get(id))
    const models = $derived(entry?.pipeline ? [...$requestStatuses.values()].filter(model =>
        model.relayed && model.pipelineOwner === entry.pipelineOwner) : [])`)
    add('model-details-render', toast,
        '            {#if entry.error}',
        `            {#if entry.pipeline}
                {#each models as model (model.id)}
                    <div class="rs-detail" data-pipeline-model>
                        <span class="rs-chip">{KIND_LABEL[model.kind]}</span> {model.label}
                        {#if model.thinkingTokens > 0} · {rs?.thinkingTokensLabel ?? 'think'} {fmt(model.thinkingTokens)}{/if}
                        {#if model.responseTokens > 0} · {rs?.outputTokens ?? 'out'} {fmt(model.responseTokens)}{/if}
                        {#if model.tokPerSec > 0} · {Math.round(model.tokPerSec)} {rs?.tokensPerSec ?? 'tok/s'}{/if}
                    </div>
                    {#each model.badges as badge (badge.key)}
                        <div class="rs-badge-row" class:rs-badge-success={badge.tone === 'success'}
                            class:rs-badge-warn={badge.tone === 'warn'}>{badge.text}</div>
                    {/each}
                    {#if model.error}<div class="rs-detail rs-error">{model.error}</div>{/if}
                {/each}
            {/if}
            {#if entry.error}`)
    const driver = 'src/lib/UI/GUI/RequestStatusToaster.svelte'
    add('grouped-cards', driver,
        '        for (const [id, entry] of map) {',
        `        const owners = new Set([...map.values()].filter(entry => entry.pipeline).map(entry => entry.pipelineOwner))
        const hidden = new Set([...map].filter(([, entry]) => entry.relayed && entry.pipelineOwner
            && owners.has(entry.pipelineOwner)).map(([id]) => id))
        for (const [id, entry] of map) {
            if (hidden.has(id)) continue`)
    add('grouped-dismiss', driver, '            if (!map.has(id) && !dismissTimers.has(id)) {',
        '            if ((!map.has(id) || hidden.has(id)) && !dismissTimers.has(id)) {')
    add('driver-setting-import', driver, "    import RequestStatusToast from './RequestStatusToast.svelte'",
        "    import RequestStatusToast from './RequestStatusToast.svelte'\n    import { DBState } from 'src/ts/stores.svelte'")
    add('driver-entry-type', driver,
        "    import { requestStatuses, isTerminalPhase, clearStatus } from 'src/ts/status/requestStatus'",
        "    import { requestStatuses, isTerminalPhase, clearStatus, type RequestStatusEntry } from 'src/ts/status/requestStatus'")
    add('driver-reactive-map', driver,
        '    const unsub = requestStatuses.subscribe((map) => {',
        '    function reconcileStatuses(source: Map<string, RequestStatusEntry>, enabled: boolean) {\n        const map = enabled ? source : new Map<string, RequestStatusEntry>()')
    add('driver-reactive-close', driver,
        '    })\n\n    onDestroy(() => {',
        '    }\n\n    $effect(() => reconcileStatuses($requestStatuses, DBState.db?.showRequestStatus !== false))\n\n    onDestroy(() => {')
    add('driver-auto-unsubscribe', driver, '        unsub()\n',
        '        // The compiler disposes the store auto-subscription with this component.\n')
    add('driver-presentation-counter', driver, '<script lang="ts">',
        '<script module lang="ts">\n    let requestStatusPresentation = 0\n</script>\n<script lang="ts">')
    add('driver-presentation-ids', driver,
        '    const shown = new Set<string>()',
        '    const shown = new Set<string>()\n    const presentations = new Map<string, string>()')
    add('driver-fresh-id', driver,
        '        return `req:${id}`',
        '        let value = presentations.get(id)\n        if (!value) { value = `req:${id}:${++requestStatusPresentation}`; presentations.set(id, value) }\n        return value')
    add('driver-retention-dismiss', driver,
        '\n            toast.dismiss(toastId(id))',
        '\n            const presentationId = presentations.get(id)\n            if (presentationId) toast.dismiss(presentationId)\n            presentations.delete(id)')
    add('driver-setting-dismiss', driver,
        '            if ((!map.has(id) || hidden.has(id)) && !dismissTimers.has(id)) {',
        '            if (!enabled || ((!map.has(id) || hidden.has(id)) && !dismissTimers.has(id))) {')
    add('driver-hidden-dismiss', driver,
        '\n                toast.dismiss(toastId(id))',
        '\n                const presentationId = presentations.get(id)\n                if (presentationId) toast.dismiss(presentationId)\n                presentations.delete(id)')
    add('driver-dispose-presentations', driver,
        '        dismissTimers.clear()',
        '        dismissTimers.clear()\n        for (const value of presentations.values()) toast.dismiss(value)\n        presentations.clear(); shown.clear()')
    return units
}
