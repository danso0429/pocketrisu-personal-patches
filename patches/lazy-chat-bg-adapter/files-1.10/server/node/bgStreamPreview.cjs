'use strict'

// Display-only budget. Oversized bodies are withheld, never sliced through a
// thought/HTML boundary. The native generated answer and commit remain exact.
const STREAM_PREVIEW_MAX_BYTES = 256 * 1024
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 255

function createBgStreamPreview() {
    // Full sendChat runs share the existing preview lock. This single slot is
    // released before that lock, rather than retaining completed transcripts.
    let current = null
    function begin(identity, readChat, cancelled) {
        if (!validId(identity?.operationId) || !validId(identity?.charId) || !validId(identity?.chatId)
            || typeof readChat !== 'function') throw new Error('invalid stream preview identity')
        if (current) throw new Error('stream preview owner is still active')
        const owner = { ...identity, readChat, cancelled, revision: 0, snapshot: null }
        current = owner
        return () => { if (current === owner) current = null }
    }
    function read(charId, chatId, operationId, revision) {
        const owner = current
        if (!owner || owner.charId !== charId || owner.chatId !== chatId || owner.cancelled?.()) {
            return { active: false }
        }
        const chat = owner.readChat()
        if (!chat || chat.id !== chatId) return { active: false }
        const message = chat.message?.at(-1)
        if (chat.isStreaming !== true || message?.role !== 'char'
            || !validId(message.chatId) || typeof message.data !== 'string') {
            owner.snapshot = null
            return { active: true, streaming: false, operationId: owner.operationId,
                answerReady: message?.role === 'char' }
        }
        const oversized = Buffer.byteLength(message.data, 'utf8') > STREAM_PREVIEW_MAX_BYTES
        const text = oversized ? '' : message.data
        const previous = owner.snapshot
        if (!previous || previous.rowChatId !== message.chatId || previous.text !== text
            || previous.oversized !== oversized) {
            owner.revision++
            owner.snapshot = { rowChatId: message.chatId, text, oversized }
        }
        const unchanged = operationId === owner.operationId && revision === owner.revision
        return {
            active: true, streaming: true, operationId: owner.operationId,
            rowChatId: message.chatId, revision: owner.revision, oversized,
            ...(unchanged ? { unchanged: true } : { text }),
        }
    }
    return { begin, read }
}

module.exports = { createBgStreamPreview, STREAM_PREVIEW_MAX_BYTES }
