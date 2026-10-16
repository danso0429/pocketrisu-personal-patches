'use strict'

module.exports = prior => {
    const units = []
    const file = 'src/ts/process/request/jobRecovery.ts'
    const targetVersions = { pocketrisu: ['1.10.0'] }
    const add = (name, anchor, content) => units.push({
        id: `lazy-chat-bg-adapter:job-recovery-identity:${name}:1.10`,
        file, type: 'replace', anchor, content, targetVersions,
        after: [...prior, ...units].filter(unit => unit.file === file).map(unit => unit.id),
    })

    add('writer-and-job-owner',
        'export async function recoverTerminalJob(job: ModelJobRecord): Promise<void> {',
        `const terminalRecoveryInFlight = new Map<string, Promise<void>>()

function hasLiveRecoveryWriter(chatId: string): boolean {
    return get(generationStates).get(chatGenKey(chatId))?.kind === 'live'
}

// Read the current proxied object without yielding or starting hydration. The
// native pipeline may replace a chat object while its journal is being read.
function currentRecoveryChat(chatId: string): LocatedChat | null {
    for (const char of getDatabase()?.characters ?? []) {
        const chat = char?.chats?.find(candidate => candidate?.id === chatId)
        if (chat) return { char, chat }
    }
    return null
}

export function recoverTerminalJob(job: ModelJobRecord): Promise<void> {
    const existing = terminalRecoveryInFlight.get(job.id)
    if (existing) return existing
    // Joiners (including a poll owner) wait through save/claim rather than
    // releasing their generation guard while another recovery is still active.
    const pending = Promise.resolve().then(() => recoverTerminalJobOnce(job)).finally(() => {
        if (terminalRecoveryInFlight.get(job.id) === pending) terminalRecoveryInFlight.delete(job.id)
    })
    terminalRecoveryInFlight.set(job.id, pending)
    return pending
}

async function recoverTerminalJobOnce(job: ModelJobRecord): Promise<void> {
    if (hasLiveRecoveryWriter(job.chatId)) {
        diag('terminal recovery deferred: live-chat')
        return
    }`)

    add('after-hydration',
        '    const loc = await locateChat(job.chatId)\n    if (!loc) {',
        `    let loc = await locateChat(job.chatId)
    if (hasLiveRecoveryWriter(job.chatId)) {
        diag('terminal recovery deferred: live-chat')
        return
    }
    loc = currentRecoveryChat(job.chatId)
    if (loc && (loc.chat._placeholder || !Array.isArray(loc.chat.message))) {
        diag('terminal recovery deferred: unloaded-chat')
        return
    }
    if (!loc) {`)

    add('initial-identity',
        `    const existingIdx = job.generationId
        ? loc.chat.message.findIndex((m) => m?.generationInfo?.generationId === job.generationId
            || m?.chatId === job.generationId)
        : -1`,
        `    let existingIdx = job.generationId
        ? loc.chat.message.findIndex((m) => m?.generationInfo?.generationId === job.generationId
            || m?.chatId === job.generationId)
        : -1
    const hadMessageBeforeRead = existingIdx >= 0`)

    add('current-view-after-journal',
        '    const result = await readJobResult(job)\n',
        `    const result = await readJobResult(job)
    if (hasLiveRecoveryWriter(job.chatId)) {
        diag('terminal recovery deferred: live-chat')
        return
    }
    const current = currentRecoveryChat(job.chatId)
    if (!current) {
        await claimJob(job.id)
        return
    }
    if (current.chat._placeholder || !Array.isArray(current.chat.message)) {
        diag('terminal recovery deferred: unloaded-chat')
        return
    }
    loc = current
    existingIdx = job.generationId
        ? loc.chat.message.findIndex((message) => message?.generationInfo?.generationId === job.generationId
            || message?.chatId === job.generationId)
        : -1
    const targetDeleted = hadMessageBeforeRead && existingIdx < 0
`)

    add('preserve-deleted-target',
        '    recordJobRecoveryLog(job, result)\n    let mutated = false',
        `    recordJobRecoveryLog(job, result)
    if (targetDeleted) {
        await claimJob(job.id)
        return
    }
    let mutated = false`)

    return units
}
