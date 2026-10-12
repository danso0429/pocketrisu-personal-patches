import { boundedRecoveryRead } from './bgRecoveryRead'
import { clientBuildFetch } from './storage/clientBuildHandshake'

export const STREAM_PREVIEW_MAX_BYTES = 256 * 1024
const ACTIVE_POLL_MS = 500
const IDLE_POLL_MS = 3000
const validId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 255

export interface StreamPreview {
    operationId: string
    rowChatId: string
    revision: number
    text: string
    oversized: boolean
}

// Control authority comes from the current full-run owner, never from a queued
// input or a provisional message. An available nonstream answer is too late.
export function acceptActiveStreamOperation(body: any): string | null {
    if (body?.active === false) return null
    if (body?.active !== true || !validId(body.operationId)
        || typeof body.streaming !== 'boolean') throw new Error('Invalid stream operation')
    if (!body.streaming) {
        if (typeof body.answerReady !== 'boolean') throw new Error('Unknown stream operation phase')
        if (body.answerReady) return null
    }
    return body.operationId
}

export function acceptStreamPreview(body: any, previous: StreamPreview | null): StreamPreview | null {
    if (body?.active === false || (body?.active === true && body?.streaming === false)) return null
    if (body?.active !== true || body?.streaming !== true || !validId(body.operationId)
        || !validId(body.rowChatId) || !Number.isSafeInteger(body.revision) || body.revision < 1
        || typeof body.oversized !== 'boolean') throw new Error('Invalid stream preview')
    if (previous?.operationId === body.operationId && body.revision < previous.revision) return previous
    if (body.unchanged === true) {
        if (!previous || previous.operationId !== body.operationId || previous.rowChatId !== body.rowChatId
            || previous.revision !== body.revision || previous.oversized !== body.oversized) {
            throw new Error('Unknown stream preview revision')
        }
        return previous
    }
    if (typeof body.text !== 'string' || new TextEncoder().encode(body.text).byteLength > STREAM_PREVIEW_MAX_BYTES
        || (body.oversized && body.text !== '')) throw new Error('Invalid stream preview body')
    return { operationId: body.operationId, rowChatId: body.rowChatId, revision: body.revision,
        text: body.text, oversized: body.oversized }
}

// Close only display markup. The stored/generated string is never rewritten.
export function closePreviewThoughts(text: string): string {
    let depth = 0
    for (const match of text.matchAll(/<Thoughts>|<\/Thoughts>/g)) {
        if (match[0] === '<Thoughts>') depth++
        else if (depth > 0) depth--
    }
    return text + '</Thoughts>'.repeat(depth)
}

export async function readStreamPreview(charId: string, chatId: string, previous: StreamPreview | null,
    signal: AbortSignal): Promise<unknown> {
    const query = previous ? '?operationId=' + encodeURIComponent(previous.operationId)
        + '&revision=' + previous.revision : ''
    return boundedRecoveryRead(async readSignal => {
        const response = await clientBuildFetch('/api/bg-stream-preview/' + encodeURIComponent(charId)
            + '/' + encodeURIComponent(chatId) + query, {
            method: 'GET', credentials: 'same-origin', cache: 'no-store', signal: readSignal,
        })
        if (!response.ok) throw new Error('Stream preview unavailable')
        return response.json()
    }, undefined, signal)
}

export interface StreamPreviewObserverDependencies {
    read(previous: StreamPreview | null, signal: AbortSignal): Promise<unknown>
    render(preview: StreamPreview): Promise<string>
    publish(value: { preview: StreamPreview; html: string } | null): void
    publishOperation?(operationId: string | null): void
    visible(): boolean
    schedule?(task: () => void, delay: number): ReturnType<typeof setTimeout> | number
    unschedule?(timer: ReturnType<typeof setTimeout> | number): void
}

// Observation has no references to native send/cancel, DB writes, markers or
// result ACK. Reads and async formatting are serial, with one latest display.
export function createStreamPreviewObserver(deps: StreamPreviewObserverDependencies) {
    const schedule = deps.schedule ?? setTimeout
    const unschedule = deps.unschedule ?? clearTimeout
    let disposed = false, inFlight = false, wakeRequested = false, epoch = 0
    let timer: ReturnType<typeof setTimeout> | number | null = null
    let controller: AbortController | null = null
    let previous: StreamPreview | null = null
    const clearTimer = () => { if (timer !== null) unschedule(timer); timer = null }
    const refresh = async () => {
        if (disposed || !deps.visible()) return
        if (inFlight) { wakeRequested = true; return }
        clearTimer(); inFlight = true; wakeRequested = false
        const captured = epoch
        controller = new AbortController()
        const current = () => !disposed && captured === epoch && deps.visible() && !controller?.signal.aborted
        let active = false
        try {
            const body: any = await deps.read(previous, controller.signal)
            if (!current()) return
            const next = acceptStreamPreview(body, previous)
            deps.publishOperation?.(acceptActiveStreamOperation(body))
            active = body?.active === true
            if (!next) { previous = null; deps.publish(null) }
            else if (next !== previous) {
                const html = next.oversized ? '' : await deps.render(next)
                if (!current()) return
                previous = next
                deps.publish({ preview: next, html })
            }
        } catch {
            if (current()) { previous = null; deps.publish(null); deps.publishOperation?.(null) }
        } finally {
            inFlight = false; controller = null
            if (!disposed && deps.visible()) {
                const delay = wakeRequested ? 0 : active ? ACTIVE_POLL_MS : IDLE_POLL_MS
                timer = schedule(() => { timer = null; void refresh() }, delay)
            }
        }
    }
    const pause = () => {
        epoch++; clearTimer(); controller?.abort(); previous = null; deps.publish(null); deps.publishOperation?.(null)
    }
    return {
        wake: () => { void refresh() },
        pause,
        dispose: () => { disposed = true; pause() },
    }
}
