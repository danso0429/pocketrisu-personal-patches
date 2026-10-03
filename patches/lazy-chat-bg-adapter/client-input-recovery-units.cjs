'use strict'
const fs = require('node:fs')
const path = require('node:path')

module.exports = prior => {
    const units = [], targetVersions = { pocketrisu: ['1.10.0'] }
    const prefix = 'lazy-chat-bg-adapter:client-input-recovery'
    const publicationUnits = require('../haejeok-persistence-safety-adapter/manifest.cjs').units
        .filter(unit => unit.file === 'src/lib/ChatScreens/DefaultChatScreen.svelte').map(unit => unit.id)
    const add = (name, file, anchor, content, type = 'replace', where) => units.push({
        id: `${prefix}:${name}:1.10`, file, anchor, content, type, targetVersions,
        ...(where ? { where } : {}),
        after: [...prior, ...units].filter(unit => unit.file === file).map(unit => unit.id)
            .concat(file === 'src/lib/ChatScreens/DefaultChatScreen.svelte' ? publicationUnits : []),
    })
    const helper = 'src/ts/bgClientInputRecovery.ts'
    units.push({ id: `${prefix}:helper:1.10`, file: helper, type: 'owned', targetVersions,
        content: fs.readFileSync(path.join(__dirname, 'files-1.10', helper), 'utf8') })
    const server = 'server/node/bgOrchestrator.cjs'
    add('capability', server, "      contract: 'bg_orchestration_capabilities.v1',",
        '\n      clientInputPreparationVersion: serverChatInputOwner ? 1 : 0,\n      serverInputBaseVersion: serverChatInputOwner ? 1 : 0,\n', 'insert', 'after')
    add('status-blocked', server,
        "      const state = inputCommand.userResolvedAt\n        ? 'input-retried'\n        : inputCommand.transformState === 'unknown'",
        "      const state = inputCommand.userResolvedAt\n        ? 'input-retried'\n        : inputCommand.inputState === 'blocked_edit' ? 'input-blocked_edit'\n        : inputCommand.transformState === 'unknown'")
    add('status-cascade', server, '        predecessorOperationId: inputCommand.executionPredecessorId,',
        '\n        ...(pendingInput?.blockedByOperationId ? { blockedByOperationId: pendingInput.blockedByOperationId } : {}),\n', 'insert', 'after')
    add('prepared-context', server, '                beginInputTransform: (validateContext) => serverChatInputOwner.beginTransform(operationId, validateContext),',
        "                inputPreparedOnClient: serverInputExecution?.record?.admission?.inputPreparation === 'client'\n                  && serverInputExecution?.record?.inputState === 'attached',\n", 'insert', 'before')
    add('prepared-initial-policy', server,
        '        || (control.inputCommandVersion === 1\n          && bg.inputPolicy.requiresClientOwnedInputPreparation(stripped, currentChat))) {',
        '        || (control.inputCommandVersion === 1 && !control.inputPreparedOnClient\n          && bg.inputPolicy.requiresClientOwnedInputPreparation(stripped, currentChat))) {')
    add('prepared-assembly-policy', server,
        '        || bg.inputPolicy.requiresClientOwnedInputPreparation(db, assemblyContext.chat)) {',
        '        || (!control.inputPreparedOnClient && bg.inputPolicy.requiresClientOwnedInputPreparation(db, assemblyContext.chat))) {')
    add('routes', server, "  app.get('/api/bg-orchestrate-status/:operationId', sessionAuthMiddleware, (req, res) => {",
        `  app.get('/api/bg-orchestrate-input-base/:charId/:chatId', sessionAuthMiddleware, async (req, res) => {
    res.set('Cache-Control', 'no-store')
    try {
      const base = serverChatInputOwner
        ? await serverChatInputOwner.readPreparationBase(req.params.charId, req.params.chatId) : null
      if (!base) return res.status(404).json({ found: false })
      res.set('x-input-base-revision', base.revision)
      return res.type('application/octet-stream').send(Buffer.from(require('./utils.cjs').encodeRisuSaveLegacy(base.chat)))
    } catch { return res.status(503).json({ found: false }) }
  })

  // Explicit user recovery: only the input transform runs in the app.
  // Admission, attachment and main execution keep their existing server owners.
  for (const action of ['claim', 'attach', 'abandon']) {
    app.post('/api/bg-orchestrate-input/' + action, sessionAuthMiddleware, async (req, res) => {
      const { operationId, charId, chatId, token } = req.body || {}
      if (!serverChatInputOwner || !validOperationId(operationId) || !validOperationId(token)) {
        return res.status(400).json({ status: 'invalid-request' })
      }
      const record = serverChatInputOwner.read(operationId)
      if (!record || record.admission.charId !== charId || record.admission.chatId !== chatId
        || record.admission.inputPreparation !== 'client') {
        return res.status(409).json({ status: 'blocked', reason: 'client_preparation_unavailable' })
      }
      try {
        if (action === 'abandon') {
          const stopped = await serverChatInputOwner.interruptClientPreparation(operationId, token)
          return res.status(stopped ? 200 : 409).json({ status: stopped ? 'abandoned' : 'blocked', operationId })
        }
        const result = action === 'claim'
          ? await serverChatInputOwner.beginTransform(operationId, null, token)
          : await serverChatInputOwner.attachTransformed(operationId,
              { chat: req.body.chat, globalIntent: req.body.globalIntent }, token)
        if (action === 'claim' && result.status === 'started') {
          return res.json({ status: 'started', operationId,
            chatBase64: Buffer.from(require('./utils.cjs').encodeRisuSaveLegacy(result.context.chat)).toString('base64'), command: {
            rawText: result.record.admission.rawText, userMessageId: result.record.admission.userMessageId,
            submittedAt: result.record.admission.submittedAt,
          } })
        }
        if (action === 'attach' && result.status === 'attached') {
          if (inputDrain) void inputDrain.drain()
          return res.json({ status: 'attached', operationId, publication: result.publication })
        }
        return res.status(409).json({ status: result.status, reason: result.reason || 'client_preparation_unavailable' })
      } catch {
        return res.status(503).json({ status: 'unavailable' })
      }
    })
  }

`, 'insert', 'before')

    const client = 'src/ts/bgOrchestrate.ts'
    add('adopted-view-revision', client,
        '        const adoptedRevision = (hydration.projection as { chatRevision: string }).chatRevision',
        '        const adoptedRevision = orchestrationChatRevision(currentChat())')
    add('snapshot-view-revision', client,
        `                const snapshot = await peekServerChatSnapshot(charId, index, chatId)
                return snapshot?.chat?.id === chatId ? { revision: snapshot.revision } : null`,
        `                const response = await fetchOrchestrationControl('/api/bg-orchestrate-input-base/'
                    + encodeURIComponent(charId) + '/' + encodeURIComponent(chatId),
                    { method: 'GET', credentials: 'same-origin' })
                if (response.status === 404) return null
                if (!response.ok) throw new Error('server input base unavailable')
                const { decodeRisuSave } = await import('./storage/risuSave')
                const chat = await decodeRisuSave(new Uint8Array(await response.arrayBuffer()))
                return chat?.id === chatId
                    ? { revision: response.headers.get('x-input-base-revision') || '', viewRevision: orchestrationChatRevision(chat) } : null`)
    add('client-signature', client, '    replaceBlockedOperationId?: string,\n): Promise<ServerInputClientOutcome> {',
        "    replaceBlockedOperationId?: string,\n    inputPreparation?: 'client',\n): Promise<ServerInputClientOutcome> {")
    add('client-policy', client, '    if (requiresClientOwnedInputPreparation((DBState as any)?.db, selectedChat)) {',
        "    if (inputPreparation !== 'client' && requiresClientOwnedInputPreparation((DBState as any)?.db, selectedChat)) {")
    add('client-submit-mode', client, '        }, { charId, chatId, rawText, draftId, replaceBlockedOperationId })',
        '        }, { charId, chatId, rawText, draftId, replaceBlockedOperationId, inputPreparation })')
    add('client-transport', client, 'const promptChangeNotifiedOperations = new Set<string>()',
        `import type { ClientInputRecovery } from './bgClientInputRecovery'

export async function claimClientInputRecovery(selectedIndex: number, input: ServerPendingInput): Promise<ClientInputRecovery> {
    if (!input.rawText || !input.inputCommandId || !input.retryAllowed) throw new Error('복구할 원문이 없어요.')
    const character = (DBState as any).db.characters[selectedIndex]
    const charId = character?.chaId, chatId = character?.chats?.[character.chatPage]?.id
    const outcome = await tryRunServerOwnedInput(selectedIndex, input.rawText, input.inputCommandId, input.operationId, 'client')
    if (outcome.kind !== 'accepted' || !outcome.clearDraft) throw new Error('복구 입력 접수를 확인하지 못했어요. 원문은 서버에 남아 있어요.')
    const operationId = outcome.operationId, token = v4()
    try {
    const response = await fetchOrchestrationControl('/api/bg-orchestrate-input/claim', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operationId, charId, chatId, token }),
    })
    const result = await response.json()
    if (!response.ok || result.status !== 'started' || result.operationId !== operationId
        || typeof result.chatBase64 !== 'string'
        || result.command?.rawText !== input.rawText || typeof result.command?.userMessageId !== 'string'
        || !Number.isSafeInteger(result.command?.submittedAt)) throw new Error('앱 입력 처리 권한을 확인하지 못했어요. 자동으로 재실행하지 않아요.')
    const { decodeRisuSave } = await import('./storage/risuSave')
    const preparationChat = await decodeRisuSave(Uint8Array.from(atob(result.chatBase64), value => value.charCodeAt(0)))
    if (preparationChat?.id !== chatId || !Array.isArray(preparationChat?.message)) throw new Error('입력 처리 기준 채팅을 확인하지 못했어요.')
    return { operationId, charId, chatId, token, baseRevision: orchestrationChatRevision(preparationChat), command: result.command }
    } catch (error) {
        await abandonClientInputRecovery({ operationId, charId, chatId, token })
        throw error
    }
}

export async function abandonClientInputRecovery(recovery: Pick<ClientInputRecovery, 'operationId' | 'charId' | 'chatId' | 'token'>): Promise<void> {
    try {
        await fetchOrchestrationControl('/api/bg-orchestrate-input/abandon', {
            method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ operationId: recovery.operationId, charId: recovery.charId,
                chatId: recovery.chatId, token: recovery.token }),
        })
    } catch { /* Server retains the raw input and the bounded claim expires. */ }
}

export async function attachClientInputRecovery(recovery: ClientInputRecovery, chat: unknown, globalIntent: unknown): Promise<void> {
    const readCurrent = () => (DBState as any).db.characters
        .find((value: any) => value?.chaId === recovery.charId)?.chats
        ?.find((value: any) => value?.id === recovery.chatId)
    const current = readCurrent()
    const localRevision = current ? orchestrationChatRevision(current) : null
    let response: Response, result: any
    try {
    response = await fetchOrchestrationControl('/api/bg-orchestrate-input/attach', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operationId: recovery.operationId, charId: recovery.charId,
            chatId: recovery.chatId, token: recovery.token, chat, globalIntent }),
    })
    result = await response.json()
    } catch {
        throw new Error('입력 저장 응답을 확인할 수 없어요. 이미 서버에서 생성 중일 수 있으니 다시 보내기 전에 채팅 상태를 확인해 주세요. 원문은 서버에 보존돼요.')
    }
    if (!response.ok || result.status !== 'attached' || result.operationId !== recovery.operationId) {
        throw new Error('처리한 입력 저장을 확인하지 못했어요. 원문은 서버에 남아 있으며 자동으로 다시 실행하지 않아요.')
    }
    try {
    if (current && readCurrent() === current && localRevision && orchestrationChatRevision(current) === localRevision) {
        const marker = readServerInputMarkers(localStorage).find(value => value.operationId === recovery.operationId)
        if (marker) advanceServerInputMarkerRevisions(localStorage, recovery.charId, recovery.chatId, marker.localRevision, localRevision)
        await reconcileServerPendingInputCommands(recovery.charId, recovery.chatId, current)
    }
    } catch {
        notifyWarning('입력은 서버에 저장됐어요. 화면 동기화를 확인하지 못했지만 서버 생성은 계속 진행돼요. 채팅을 다시 열면 상태를 확인할 수 있어요.', { source: 'bg-input' })
    }
    window.dispatchEvent(new Event('bg-server-input-updated'))
}

`, 'insert', 'before')
    const screen = 'src/lib/ChatScreens/DefaultChatScreen.svelte'
    add('screen-import', screen, '    async function retryBlockedServerInput(input: ServerPendingInput): Promise<void> {',
        "    import { claimClientInputRecovery, attachClientInputRecovery, abandonClientInputRecovery } from 'src/ts/bgOrchestrate'\n    import { clientInputGlobalIntent, type ClientInputRecovery } from 'src/ts/bgClientInputRecovery'\n    import { orchestrationChatRevision } from 'src/ts/bgOrchestrationMerge'\n", 'insert', 'before')
    add('screen-recovery-action', screen,
        '        if (inputAdmissionBusy || !input.rawText || !input.inputCommandId) return',
        `
        if (input.reason === 'server_host_unsupported' || input.reason === 'client_preparation_interrupted') {
            if ($doingChat || $orchestrating || requiresClientGenerationEpilogue(DBState.db, pendingCharacter)) {
                notifyError('진행 중인 생성과 출력 설정을 확인한 뒤 다시 시도해 주세요.', { source: 'bg-input' })
                return
            }
            inputAdmissionBusy = true
            let recovery: ClientInputRecovery | undefined
            try {
                recovery = await claimClientInputRecovery($selectedCharID, input)
                const attached = await sendMain(false, recovery)
                if (attached !== true) await abandonClientInputRecovery(recovery)
            } catch (error) {
                if (recovery) await abandonClientInputRecovery(recovery)
                notifyError(error instanceof Error ? error.message : '앱 입력 처리를 완료하지 못했어요. 원문은 서버에 남아 있어요.', { source: 'bg-input' })
            } finally {
                inputAdmissionBusy = false
                window.dispatchEvent(new Event('bg-server-input-updated'))
            }
            return
        }
`, 'insert', 'after')
    add('send-signature', screen, '    async function sendMain(continueResponse:boolean) {',
        '    async function sendMain(continueResponse:boolean, recovery?: ClientInputRecovery) {')
    add('send-busy', screen, '        if (inputAdmissionBusy) return',
        '        if (inputAdmissionBusy && !recovery) return')
    add('send-raw-boundary', screen, '        if (!continueResponse && !$doingChat && !$orchestrating',
        '        if (!recovery && !continueResponse && !$doingChat && !$orchestrating')
    add('send-marker-boundary', screen, '        if (pendingCharacter?.chaId && pendingChat?.id',
        '        if (!recovery && pendingCharacter?.chaId && pendingChat?.id')
    add('send-recovery-selection', screen,
        '        const inputBase = { id: activeChat.id, message: snapshotChatView(activeChat.message) }',
        `        if (recovery && (DBState.db.characters[selectedChar]?.chaId !== recovery.charId
            || activeChat.id !== recovery.chatId)) throw new Error('채팅이 바뀌어 앱 입력 처리를 시작하지 않았어요. 원문은 서버에 남아 있어요.')
        const recoveryGlobalsBefore = recovery ? snapshotChatView(DBState.db.globalChatVariables || {}) : null
        if (recovery && orchestrationChatRevision(activeChat) !== recovery.baseRevision) {
            throw new Error('서버와 앱의 채팅이 달라 입력 처리를 시작하지 않았어요. 채팅을 다시 연 뒤 복구해 주세요.')
        }
`, 'insert', 'before')
    add('send-recovery-message', screen, '            cha.push({ ...entry, chatId: entry.chatId || v4() })',
        `            if (recovery) cha = snapshotChatView(cha)
            cha.push({ ...entry, chatId: recovery?.command.userMessageId || entry.chatId || v4(),
                ...(recovery ? { time: recovery.command.submittedAt } : {}) })`)
    add('send-recovery-slash', screen, "        if(messageInput.startsWith('/')){", "        if(!recovery && messageInput.startsWith('/')){")
    add('send-recovery-files', screen, '        if(fileInput.length > 0){', '        if(!recovery && fileInput.length > 0){')
    add('send-recovery-raw', screen, '        const preparedInput = messageInput', '        const preparedInput = recovery?.command.rawText ?? messageInput')
    add('send-recovery-empty', screen,
        "        if(messageInput === ''){\n            if(cha.length === 0 || cha[cha.length - 1].role !== 'user'){",
        "        if(preparedInput === ''){\n            if(cha.length === 0 || cha[cha.length - 1].role !== 'user'){")
    add('send-recovery-attach', screen, '        publishChatView(currentChat.message, mergedInput.chat.message)',
        `        if (recovery) {
            // Keep the new user message detached until the server input owner
            // journals it. Existing browser trigger effects retain their normal
            // publication behavior; this branch must not also save the message.
            const preparedChat = { ...snapshotChatView(currentChat), message: mergedInput.chat.message }
            await attachClientInputRecovery(recovery, preparedChat,
                clientInputGlobalIntent(recoveryGlobalsBefore || {}, snapshotChatView(DBState.db.globalChatVariables || {})))
            return true
        }
`, 'insert', 'before')
    add('send-recovery-merge-error', screen, '        if (!mergedInput.ok) {',
        "\n            if (recovery) throw new Error('입력 처리 중 채팅이 바뀌어 적용하지 않았어요. 원문은 서버에 남아 있고, 이미 수행한 입력 효과는 남아 있을 수 있어요.')\n", 'insert', 'after')
    return units
}
