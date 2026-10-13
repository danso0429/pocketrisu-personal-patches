'use strict'
const fs = require('node:fs')
const path = require('node:path')

module.exports = prior => {
    const prefix = 'lazy-chat-bg-adapter:stream-preview:'
    const targetVersions = { pocketrisu: ['1.10.0'] }
    const units = []
    const add = (name, file, anchor, content, type = 'replace', where) => {
        units.push({ id: prefix + name, file, type, anchor,
            ...(file.endsWith('.svelte') ? { managed: content } : { content }),
            ...(where ? { where } : {}), targetVersions,
            after: [...prior, ...units].filter(unit => unit.file === file).map(unit => unit.id) })
    }
    for (const file of ['server/node/bgStreamPreview.cjs', 'server/node/bgStreamPreview.test.ts',
        'src/ts/bgStreamPreview.ts', 'src/ts/bgStreamPreview.test.ts',
        'src/lib/ChatScreens/ServerStreamPreview.svelte', 'src/lib/ChatScreens/ServerStreamPreview.test.ts',
        'src/lib/UI/GUI/RequestStatusToast.test.ts']) {
        units.push({ id: prefix + file, file, type: 'owned', targetVersions,
            content: fs.readFileSync(path.join(__dirname, 'files-1.10', file), 'utf8') })
    }
    // Presentation override for the local server-wait placeholder. Phase and
    // relay contracts stay unchanged; ordinary background recovery keeps its label.
    add('status-entry-title', 'src/ts/status/requestStatus.ts',
        '    phase: RequestPhase\n    thinkingTokens: number',
        '    phase: RequestPhase\n    phaseLabel?: string                     // local background presentation only\n    thinkingTokens: number')
    add('status-init-title', 'src/ts/status/requestStatus.ts',
        '    phase?: RequestPhase\n    now: number',
        '    phase?: RequestPhase\n    phaseLabel?: string\n    now: number')
    add('status-start-title', 'src/ts/status/requestStatus.ts',
        "            phase: init.phase ?? 'connecting',",
        "            phase: init.phase ?? 'connecting',\n            phaseLabel: init.phaseLabel,")
    add('status-render-title', 'src/lib/UI/GUI/RequestStatusToast.svelte',
        '{PHASE_LABEL[entry.phase]}',
        "{entry.phase === 'background' ? (entry.phaseLabel ?? PHASE_LABEL[entry.phase]) : PHASE_LABEL[entry.phase]}")
    const server = 'server/node/bgOrchestrator.cjs'
    add('late-stop-retain', server,
        "      if (durable && (durable.state === 'delivered' || durable.state === 'result-ready')) {",
        "      if (durable && ['delivered', 'result-ready', 'delivery-failed'].includes(durable.state)) {")
    add('late-stop-client', 'src/ts/bgOrchestrate.ts',
        "                && ['chat-committed', 'result-ready', 'delivered'].includes(data.state)) {",
        "                && ['chat-committed', 'result-ready', 'delivered', 'delivery-failed'].includes(data.state)) {")
    add('owner', server, 'const _orchStatus = {}', `const _orchStatus = {}
const { createBgStreamPreview } = require('./bgStreamPreview.cjs')
const streamPreview = createBgStreamPreview()`)
    add('release-declaration', server, '  const externalSignal = control && control.signal',
        '  let releaseStreamPreview = null\n  const externalSignal = control && control.signal')
    add('begin', server, '    let fullThrew = null', `    if (mode === 'full' && control?.resultKeyVersion === 1
      && control.serverChatCommitVersion === 1 && validOperationId(control.operationId)) {
      releaseStreamPreview = streamPreview.begin({ operationId: control.operationId,
        charId: selectedCharId, chatId: selectedChatId }, () => {
          const current = dbmod.getDatabase()?.characters?.[charIdx]
          if (current?.chaId !== selectedCharId) return null
          return current.chats?.[chatIdx]
        }, () => llmAbort.signal.aborted || control.isCancelled?.())
    }
    let fullThrew = null`)
    add('release', server,
        '    try { if (pluginHost) await pluginHost.close() } finally { release() }',
        `    // Release the display reader before another full run installs its DB.
    if (releaseStreamPreview) releaseStreamPreview()
    try { if (pluginHost) await pluginHost.close() } finally { release() }`)
    add('route', server,
        "  app.get('/api/bg-orchestrate-chat-state/:charId/:chatId', sessionAuthMiddleware, async (req, res) => {",
        `  // Observation has no result claim/ACK, KV write or cancellation authority.
  app.get('/api/bg-stream-preview/:charId/:chatId', sessionAuthMiddleware, (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const { charId, chatId } = req.params
    if (!charId || charId.length > 255 || !chatId || chatId.length > 255) {
      return res.status(400).json({ active: false })
    }
    const revision = typeof req.query?.revision === 'string' && /^\\d{1,16}$/.test(req.query.revision)
      ? Number(req.query.revision) : undefined
    try {
      return res.json(streamPreview.read(charId, chatId, req.query?.operationId, revision))
    } catch { return res.status(503).json({ active: false, error: 'stream-preview-unavailable' }) }
  })

`, 'insert', 'before')
    const screen = 'src/lib/ChatScreens/DefaultChatScreen.svelte'
    add('admission-reason', screen,
        '                const outcome = await tryRunServerOwnedInput(selectedChar, rawText, draftInputId)',
        `                const outcome = await tryRunServerOwnedInput(selectedChar, rawText, draftInputId)
                if (outcome.kind === 'blocked') console.warn('[bg-input] admission blocked', outcome.reason)`)
    add('screen-import', screen, "    import ServerPendingInputs from './ServerPendingInputs.svelte';",
        "    import ServerPendingInputs from './ServerPendingInputs.svelte';\n    import ServerStreamPreview from './ServerStreamPreview.svelte';")
    add('screen-control-ref', screen, '    let queueActivity = $state<ChatActivity | null>(null)',
        `    let queueActivity = $state<ChatActivity | null>(null)
    let serverStreamCanStop = $state(false)
    let serverStreamPreview = $state<{ requestStopGeneration(): boolean } | undefined>()
    const selectedServerBusy = $derived(isServerOrchestrationEnabled() && queueActivity?.charId === pendingCharacter?.chaId
        && queueActivity?.chatId === pendingChat?.id && queueActivity?.busy === true)`)
    add('screen-queue-draft', screen, '    let currentChatGenerating = $derived($generationStates.has(currentChatGenKey()))',
        `    let currentChatGenerating = $derived($generationStates.has(currentChatGenKey()))
    // Preserve queue Send without removing the ordinary Stop or discarding a draft.
    const serverQueueDraft = $derived(selectedServerBusy && !currentChatGenerating && !$orchestrating
        && !doingChatInputTranslate && messageInput.trim().length > 0)`)
    add('screen-circle-pending', screen, '                {#if inputAdmissionBusy}',
        `                {#if inputAdmissionBusy || (selectedServerBusy && !serverQueueDraft
                    && !serverStreamCanStop && !currentChatGenerating && !doingChatInputTranslate && !$orchestrating)}`)
    add('screen-circle-ready', screen,
        "                {:else if currentChatGenerating || doingChatInputTranslate/* BG-PRESERVE:START orch-composer */ || $orchestrating/* BG-PRESERVE:END */}",
        "                {:else if currentChatGenerating || doingChatInputTranslate/* BG-PRESERVE:START orch-composer */ || $orchestrating/* BG-PRESERVE:END */ || serverStreamCanStop}")
    add('screen-queue-send', screen,
        '                        <div class="loadmove chat-process-stage-{$chatProcessStage}"></div>\n                    </button>\n                {:else}',
        `                        <div class="loadmove chat-process-stage-{$chatProcessStage}"></div>
                    </button>
                    {#if serverQueueDraft}
                        <button onclick={send} aria-label={language.send}
                            class="order-2 shrink-0 flex justify-center items-center w-9 h-9 rounded-full bg-primary text-white hover:bg-primary/80 transition-colors button-icon-send">
                            <span data-personal-send-default aria-hidden="true"><Send size={18} class="shrink-0" /></span>
                            <span data-personal-send-text class="personal-send-glyph" aria-hidden="true"></span>
                        </button>
                    {/if}
                {:else}`)
    add('screen-circle-cancel', screen, '        abortGeneration(currentChatGenKey())',
        '        if (serverStreamPreview?.requestStopGeneration()) return\n        abortGeneration(currentChatGenKey())')
    add('screen-slot', screen, '            {@render composerCluster()}', `            {@render composerCluster()}
            {#if pendingCharacter?.chaId && pendingChat?.id}
                <ServerStreamPreview bind:this={serverStreamPreview} onControl={(available) => { serverStreamCanStop = available }}
                    charId={pendingCharacter.chaId} chatId={pendingChat.id}
                    active={(queueActivity?.charId === pendingCharacter.chaId && queueActivity?.chatId === pendingChat.id
                        && queueActivity.busy === true) || currentChatGenerating}
                    chat={pendingChat} name={pendingCharacter.name} />
            {/if}`)
    add('observed-cancel', 'src/ts/bgOrchestrate.ts', 'let cancelPromise: Promise<boolean> | null = null',
        `// Explicit UI action only. Preview observation/teardown has no cancellation authority.
export async function cancelObservedServerOperation(target: {
    operationId: string; charId: string; chatId: string;
}): Promise<'cancelled' | 'finished' | 'unconfirmed'> {
    try {
        const query = new URLSearchParams({ charId: target.charId, chatId: target.chatId })
        const response = await fetchOrchestrationControl('/api/bg-orchestrate/' + encodeURIComponent(target.operationId)
            + '?' + query, { method: 'DELETE', credentials: 'same-origin' })
        const data = await readRecoveryJson(response)
        if (!response.ok || data?.operationId !== target.operationId) return 'unconfirmed'
        if (data.finished === true && data.cancelled === false) return 'finished'
        if (data.cancelled !== true) return 'unconfirmed'
        if (activeOperationId === target.operationId && activeOperationCoordinates?.charId === target.charId
            && activeOperationCoordinates?.chatId === target.chatId) {
            if (watchKey) stopWatch()
            else finishBootRecovery(target.operationId)
        }
        // Cancel ACK closes execution; the proof consumer separately reconciles
        // the accepted input. Never erase it merely because DELETE succeeded.
        window.dispatchEvent(new Event('bg-server-input-updated'))
        return 'cancelled'
    } catch { return 'unconfirmed' }
}

let cancelPromise: Promise<boolean> | null = null`)
    return units
}
