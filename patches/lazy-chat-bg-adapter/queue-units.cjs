'use strict'
const fs = require('node:fs')
const path = require('node:path')
const targetVersions = { pocketrisu: ['1.10.0'] }
const prefix = 'lazy-chat-bg-adapter:queue:'
const screen = 'src/lib/ChatScreens/DefaultChatScreen.svelte'
const bg = 'server/node/bgOrchestrator.cjs'
const replace = (name, file, anchor, content, requires = []) => ({
    id: prefix + name, file, type: 'replace', anchor,
    ...(file.endsWith('.svelte') ? { managed: content } : { content }), requires, targetVersions,
})
module.exports = [
    ...['src/ts/bgChatActivity.ts', 'server/node/bgChatQueue.test.ts'].map(file => ({
        id: prefix + file, file, type: 'owned', targetVersions,
        content: fs.readFileSync(path.join(__dirname, 'files-1.10', file), 'utf8'),
    })),
    replace('registry', 'server/node/bgOrchestrationRunRegistry.cjs',
        '    size: () => runs.size,',
        `    size: () => runs.size,
    hasChatRun: (charId, chatId, legacyOnly = false) => [...runs.values()].some(run => (
      run.state === 'running' && (charId === null || run.charId === charId)
      && run.chatId === chatId && (!legacyOnly || run.inputCommandVersion !== 1)
    )),`, ['bg-preserve:owned:server/node/bgOrchestrationRunRegistry.cjs:1.9']),
    replace('shared-registry', 'server/node/server.cjs',
        'const serverChatInputOwner = createServerChatInputOwner({',
        `const { createOrchestrationRunRegistry } = require('./bgOrchestrationRunRegistry.cjs');
const bgQueueRuns = createOrchestrationRunRegistry();
const serverChatInputOwner = createServerChatInputOwner({
    isExternalGenerationActive: (charId, chatId) => bgQueueRuns.hasChatRun(charId, chatId, true)
        || modelJobs.hasRunningMainJob(chatId),`,
        ['lazy-chat-bg-adapter:server-chat-commit-owner-init:1.10', prefix + 'registry', prefix + 'model-main-query']),
    replace('registry-dependency', 'server/node/server.cjs',
        'DB_HEX_KEY, requestLogs, serverChatCommitOwner, serverChatInputOwner',
        'DB_HEX_KEY, requestLogs, serverChatCommitOwner, serverChatInputOwner, orchestrationRuns: bgQueueRuns, hasRunningMainJob: (chatId) => modelJobs.hasRunningMainJob(chatId)',
        ['lazy-chat-bg-adapter:server-chat-commit-registration:1.10', prefix + 'shared-registry']),
    replace('model-main-query', 'server/node/model-jobs.cjs',
        '        createJob,\n', '        createJob,\n        hasRunningMainJob: (chatId) => !!stmtRunningForChat.get(chatId),\n'),
    replace('model-main-guard', 'server/node/model-jobs.cjs',
        "        if (kind === 'main') {\n            const running = stmtRunningForChat.get(chatId);",
        `        if (kind === 'main') {
            let busy = false;
            try { busy = opts.isChatGenerationBusy?.(chatId) === true; }
            catch { return { error: 'Server generation state unavailable', httpStatus: 409 }; }
            if (busy) {
                return { error: 'A server generation is pending for this chat', httpStatus: 409 };
            }
            const running = stmtRunningForChat.get(chatId);`, [prefix + 'model-main-query']),
    replace('model-owner-connection', 'server/node/server.cjs',
        'const modelJobs = createModelJobs({ saveDir: savePath, logger });',
        `const modelJobs = createModelJobs({ saveDir: savePath, logger,
    isChatGenerationBusy: (chatId) => serverChatInputOwner.hasPendingGeneration(null, chatId)
        || bgQueueRuns.hasChatRun(null, chatId),
});`, [prefix + 'shared-registry', prefix + 'model-main-guard']),
    replace('legacy-start-guard', bg,
        '        const started = orchestrationRuns.start(operationId, {',
        `        // No await between the authoritative check and registry insertion.
        if (inputCommandVersion !== 1 && (serverChatInputOwner?.hasPendingGeneration(selectedCharId, selectedChatId)
          || deps.hasRunningMainJob?.(selectedChatId))) {
          return res.status(409).json({ handled: false, started: false, operationId, reason: 'chat-generation-active' })
        }
        const started = orchestrationRuns.start(operationId, {`,
        ['lazy-chat-bg-adapter:server-chat-commit-durable-response:1.10']),
    replace('activity-route', bg,
        "  app.get('/api/bg-orchestrate-chat-state/:charId/:chatId', sessionAuthMiddleware, async (req, res) => {",
        `  app.get('/api/bg-chat-activity/:charId/:chatId', sessionAuthMiddleware, (req, res) => {
    const { charId, chatId } = req.params
    if (!charId || charId.length > 255 || !chatId || chatId.length > 255) {
      return res.status(400).json({ error: 'invalid-chat' })
    }
    try {
      const busy = !!(serverChatInputOwner.hasPendingGeneration(charId, chatId)
        || orchestrationRuns.hasChatRun(charId, chatId) || deps.hasRunningMainJob?.(chatId))
      return res.json({ charId, chatId, busy })
    } catch { return res.status(503).json({ error: 'chat-activity-unavailable' }) }
  })

  app.get('/api/bg-orchestrate-chat-state/:charId/:chatId', sessionAuthMiddleware, async (req, res) => {`,
        ['lazy-chat-bg-adapter:server-chat-execution-projection-route:1.10', prefix + 'registry']),
    replace('server-job-disabled', bg,
        `    if (Object.prototype.hasOwnProperty.call(db, 'nodeOnlyServerSideRequests')) {
      db.nodeOnlyServerSideRequests = false
    }`, '    db.nodeOnlyServerSideRequests = false'),
    replace('assembly-job-disabled', bg,
        "      if (Object.prototype.hasOwnProperty.call(db, 'nodeOnlyServerSideRequests')) db.nodeOnlyServerSideRequests = false",
        '      db.nodeOnlyServerSideRequests = false'),
    replace('cancel-committed', bg,
        `      return res.status(409).json({
        cancelled: false,
        operationId,
        reason: 'already-committed',`,
        `      return res.json({
        cancelled: false, finished: true, state: 'chat-committed',
        operationId,
        reason: 'already-committed',`, ['lazy-chat-bg-adapter:server-chat-commit-cancel:1.10']),
    replace('cancel-finished', bg,
        "        return res.status(409).json({ cancelled: false, reason: 'already-finished' })",
        "        return res.json({ cancelled: false, finished: true, operationId, state: durable.state, reason: 'already-finished' })",
        ['lazy-chat-bg-adapter:server-chat-commit-cancel:1.10']),
    replace('cancel-client-finished', 'src/ts/bgOrchestrate.ts',
        '            if (!res.ok || !data || data.cancelled !== true) {',
        `            if (res.ok && data?.finished === true && data.operationId === operationId
                && ['chat-committed', 'result-ready', 'delivered'].includes(data.state)) {
                // Completion is not cancellation. Existing watch/boot recovery owns
                // hydration and exact ACK; retain its marker until that succeeds.
                if (activeOperationId === operationId && watchKey) await pollOrchestrationResult()
                return false
            }
            if (!res.ok || !data || data.cancelled !== true) {`),
    replace('busy-rejection-no-fallback', 'src/ts/bgOrchestrate.ts',
        "                triggerClientFallback('delegate-not-started')",
        `                if (startRejectionReason === 'chat-generation-active') {
                    stopWatch()
                    try { notifyWarning('같은 채팅에서 서버 생성이 진행 중이라 추가 생성을 시작하지 않았어요.', { source: 'bg-input' }) }
                    catch { /* The rejected operation must not restart even if notification fails. */ }
                } else {
                    triggerClientFallback('delegate-not-started')
                }`),
    replace('screen-state', screen,
        '    let inputAdmissionBusy = $state(false)',
        `    let inputAdmissionBusy = $state(false)
    import { readServerChatActivity, type ChatActivity } from 'src/ts/bgChatActivity'
    import { isServerOrchestrationEnabled } from 'src/ts/bgOrchestrate'
    let queueActivity = $state<ChatActivity | null>(null)
    const generationLock = $state({ blocked: true })
    function updateQueueActivity(activity: ChatActivity) { queueActivity = activity }
    $effect(() => {
        generationLock.blocked = $doingChat || $orchestrating || inputAdmissionBusy
            || (isServerOrchestrationEnabled() && (queueActivity?.charId !== pendingCharacter?.chaId
                || queueActivity?.chatId !== pendingChat?.id || queueActivity?.busy !== false))
    })
    async function allowReplacementGeneration(): Promise<boolean> {
        if ($doingChat || $orchestrating || inputAdmissionBusy) return false
        if (!isServerOrchestrationEnabled()) return true
        const character = pendingCharacter
        const chat = pendingChat
        if (!character?.chaId || !chat?.id) return false
        inputAdmissionBusy = true
        try {
            const busy = await readServerChatActivity(character.chaId, chat.id)
            if (pendingCharacter !== character || pendingChat !== chat) return false
            updateQueueActivity({ charId: character.chaId, chatId: chat.id, busy })
            if (busy) notifyError('서버에서 처리 중인 입력과 답변이 있어요. 완료 후 다시 시도해 주세요.', { source: 'bg-input' })
            return !busy && !$doingChat && !$orchestrating
        } catch {
            notifyError('서버 생성 상태를 확인하지 못했어요. 초안은 유지했어요.', { source: 'bg-input' })
            return false
        } finally { inputAdmissionBusy = false }
    }`, ['lazy-chat-bg-adapter:server-pending-ui-selection:1.10', prefix + 'src/ts/bgChatActivity.ts']),
    replace('screen-activity', screen,
        '                        onRetryBlocked={retryBlockedServerInput}',
        '                        onRetryBlocked={retryBlockedServerInput}\n                        onActivity={updateQueueActivity}',
        ['lazy-chat-bg-adapter:server-pending-ui-render:1.10', prefix + 'screen-state']),
    replace('reroll-check', screen, '    async function reroll() {',
        '    async function reroll() {\n        if (!await allowReplacementGeneration()) return', [prefix + 'screen-state']),
    replace('fallback-check', screen,
        '        /* POCKETRISU-PATCH:lazy-chat-bg-adapter:server-input-client-send:END */',
        '        /* POCKETRISU-PATCH:lazy-chat-bg-adapter:server-input-client-send:END */\n        if (!recovery && !await allowReplacementGeneration()) return',
        ['lazy-chat-bg-adapter:client-input-recovery:send-marker-boundary:1.10', prefix + 'screen-state']),
    replace('continue-disabled', screen,
        'disabled={(DBState.db.characters[$selectedCharID].chats[DBState.db.characters[$selectedCharID].chatPage].message.length < 2)',
        'disabled={generationLock.blocked || (DBState.db.characters[$selectedCharID].chats[DBState.db.characters[$selectedCharID].chatPage].message.length < 2)', [prefix + 'screen-state']),
    replace('empty-send-disabled', screen,
        '                            onclick={send}\n',
        "                            onclick={send}\n                            disabled={generationLock.blocked && messageInput === '' && fileInput.length === 0}\n", [prefix + 'screen-state']),
    replace('chat-list-lock', screen, '                onReroll={reroll}',
        '                onReroll={reroll}\n                {generationLock}', [prefix + 'screen-state']),
    replace('chats-prop', 'src/lib/ChatScreens/Chats.svelte', '        onReroll,', '        onReroll,\n        generationLock,', []),
    replace('chats-type', 'src/lib/ChatScreens/Chats.svelte', '        onReroll: () => void',
        '        onReroll: () => void\n        generationLock?: { blocked: boolean }', [prefix + 'chats-prop']),
    replace('chats-mount-prop', 'src/lib/ChatScreens/Chats.svelte', '                        onReroll: onReroll,',
        '                        onReroll: onReroll,\n                        generationLock,', [prefix + 'chats-type']),
    replace('chat-type', 'src/lib/ChatScreens/Chat.svelte', '        onReroll?: () => void;',
        '        onReroll?: () => void;\n        generationLock?: { blocked: boolean };'),
    replace('chat-prop', 'src/lib/ChatScreens/Chat.svelte', '        onReroll = () => {},',
        '        onReroll = () => {},\n        generationLock,', [prefix + 'chat-type']),
    replace('chat-reroll-disabled', 'src/lib/ChatScreens/Chat.svelte',
        `<button class="flex items-center shrink-0 hover:text-primary transition-colors button-icon-reroll" class:dyna-icon={rerollIcon === 'dynamic' || rerollIcon === 'force'} class:force-show={rerollIcon === 'force'} onclick={async () => {
                if (!DBState.db.confirmReroll || await alertConfirm(language.rerollConfirm))`,
        `<button disabled={generationLock?.blocked === true} class="flex items-center shrink-0 hover:text-primary transition-colors button-icon-reroll" class:dyna-icon={rerollIcon === 'dynamic' || rerollIcon === 'force'} class:force-show={rerollIcon === 'force'} onclick={async () => {
                if (!DBState.db.confirmReroll || await alertConfirm(language.rerollConfirm))`, [prefix + 'chat-prop']),
    replace('chat-next-disabled', 'src/lib/ChatScreens/Chat.svelte',
        `<button class="flex items-center shrink-0 hover:text-primary transition-colors button-icon-reroll" class:dyna-icon={rerollIcon === 'dynamic' || rerollIcon === 'force'} class:force-show={rerollIcon === 'force'} onclick={async () => {
                if (totalPages <= 1)`,
        `<button disabled={generationLock?.blocked === true && totalPages <= 1} class="flex items-center shrink-0 hover:text-primary transition-colors button-icon-reroll" class:dyna-icon={rerollIcon === 'dynamic' || rerollIcon === 'force'} class:force-show={rerollIcon === 'force'} onclick={async () => {
                if (totalPages <= 1)`, [prefix + 'chat-prop']),
    replace('chat-back-disabled', 'src/lib/ChatScreens/Chat.svelte',
        '<button class="flex items-center shrink-0 hover:text-primary transition-colors button-icon-unreroll" class:dyna-icon=',
        '<button disabled={generationLock?.blocked === true && totalPages <= 1} class="flex items-center shrink-0 hover:text-primary transition-colors button-icon-unreroll" class:dyna-icon=', [prefix + 'chat-prop']),
]
