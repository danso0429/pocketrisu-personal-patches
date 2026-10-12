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
    for (const file of ["src/ts/bgCancelledInputSettlement.ts","src/ts/bgCancelledInputSettlement.test.ts"]) {
        units.push({ id: prefix + file, file, type: 'owned', targetVersions,
            content: fs.readFileSync(path.join(__dirname, 'files-1.10', file), 'utf8') })
    }
    const server = 'server/node/bgOrchestrator.cjs'
    add('cancelled-status-proof', server,
        "        inputCommandId: inputCommand.admission.inputCommandId,\n        admissionSeq: inputCommand.admissionSeq,",
        `        inputCommandId: inputCommand.admission.inputCommandId,
        admissionSeq: inputCommand.admissionSeq,
        cancelledInputProof: inputCommand.inputState === 'cancelled'
          ? serverChatInputOwner.readCancelledInputProof(operationId) : null,`)
    add('cancelled-import', 'src/ts/bgOrchestrate.ts',
        "import { saveServerInputSettings } from './bgServerInputSettingsSave'",
        "import { saveServerInputSettings } from './bgServerInputSettingsSave'\nimport { settleCancelledInput } from './bgCancelledInputSettlement'\nimport { readServerInputMarker } from './bgServerInputLedger'")
    add('cancelled-admission', 'src/ts/bgOrchestrate.ts',
        '            settleFinishedInput: async operationId => {',
        `            settleCancelledInput: operationId => settleCancelledServerInput(operationId, charId, chatId),
            settleFinishedInput: async operationId => {`)
    add('cancelled-reconciliation', 'src/ts/bgOrchestrate.ts',
        "                if (statusResponse.ok && statusData?.accepted === true\n                    && statusData.operationId === marker.operationId\n                    && statusData.state === 'input-retried'",
        `                if (statusResponse.ok && statusData?.accepted === true
                    && statusData.operationId === marker.operationId && statusData.state === 'input-cancelled'
                    && await settleCancelledServerInput(marker.operationId, charId, chatId)) continue
                if (statusResponse.ok && statusData?.accepted === true
                    && statusData.operationId === marker.operationId
                    && statusData.state === 'input-retried'`)
    add('cancelled-settlement', 'src/ts/bgOrchestrate.ts', 'function notifyFinishedServerFailure(',
        `async function settleCancelledServerInput(operationId: string, charId: string, chatId: string): Promise<boolean> {
    if (typeof localStorage === 'undefined') return false
    try {
        const marker = readServerInputMarker(localStorage, operationId)
        if (!marker || marker.state !== 'accepted' || marker.charId !== charId || marker.chatId !== chatId) return false
        const character: any = (DBState as any)?.db?.characters?.find((row: any) => row.chaId === charId)
        const chats = character?.chats
        if (!Array.isArray(chats)) return false
        const currentChat = () => chats.find((row: any) => row.id === chatId)
        const isCurrent = () => (DBState as any)?.db?.characters?.find((row: any) => row.chaId === charId) === character
            && character.chats === chats && !!currentChat()
        return await settleCancelledInput({ marker, isCurrent, readLocal: currentChat,
            readMarker: () => readServerInputMarker(localStorage, operationId),
            hasUnconfirmedWrite: () => forageStorage.realStorage.hasUnconfirmedChatWrite?.(charId, chatId) !== false,
            readProof: async () => {
                const response = await fetchOrchestrationControl('/api/bg-orchestrate-status/' + encodeURIComponent(operationId)
                    + '?' + new URLSearchParams({ charId, chatId }), { method: 'GET', credentials: 'same-origin' })
                if (!response.ok) return null
                const state: any = await readRecoveryJson(response)
                return state?.accepted === true && state.operationId === operationId && state.state === 'input-cancelled'
                    ? state.cancelledInputProof : null
            },
            readCanonical: async () => {
                const response = await fetchOrchestrationControl('/api/bg-orchestrate-input-base/' + encodeURIComponent(charId)
                    + '/' + encodeURIComponent(chatId), { method: 'GET', credentials: 'same-origin' })
                if (!response.ok) return null
                return readRecoveryBody(response, async () => {
                    const { decodeRisuSave } = await import('./storage/risuSave')
                    const chat = await decodeRisuSave(new Uint8Array(await response.arrayBuffer()))
                    return chat?.id === chatId ? { chat, revision: response.headers.get('x-input-base-revision') || '' } : null
                })
            },
            savedBaseView: () => forageStorage.realStorage.hasUnconfirmedChatWrite?.(charId, chatId) === false
                ? forageStorage.realStorage.savedChatViewRevision?.(charId, chatId, marker.baseRevision, orchestrationChatRevision) || null : null,
            adopt: async (revision, allowed) => {
                const result = await adoptServerCommittedChat(chats, charId, chatId, revision, [allowed], orchestrationChatRevision,
                    undefined, { isCurrent })
                if (!isCurrent() || !result.adopted || result.revision !== revision) return false
                advanceServerInputMarkerRevisions(localStorage, charId, chatId, allowed, orchestrationChatRevision(currentChat()))
                return true
            },
            clear: () => { clearServerInputMarker(localStorage, operationId); parkedRecoveries.delete(operationId) },
        })
    } catch { return false }
}

`, 'insert', 'before')
    return units
}
