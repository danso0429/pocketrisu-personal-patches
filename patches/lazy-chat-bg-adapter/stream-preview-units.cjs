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
        'src/lib/ChatScreens/ServerStreamPreview.svelte']) {
        units.push({ id: prefix + file, file, type: 'owned', targetVersions,
            content: fs.readFileSync(path.join(__dirname, 'files-1.10', file), 'utf8') })
    }
    const server = 'server/node/bgOrchestrator.cjs'
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
    add('screen-slot', screen, '            {@render composerCluster()}', `            {@render composerCluster()}
            {#if pendingCharacter?.chaId && pendingChat?.id}
                <ServerStreamPreview charId={pendingCharacter.chaId} chatId={pendingChat.id}
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
