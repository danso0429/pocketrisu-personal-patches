export interface KeiSseEvent {
    event?: string
    data: string
    id?: string
}

interface LineBoundary {
    lineEnd: number
    nextOffset: number
}

function findLineBoundary(
    buffer: string,
    start: number,
    final: boolean,
): LineBoundary | null {
    for (let index = start; index < buffer.length; index += 1) {
        const char = buffer[index]
        if (char === '\n') {
            return {
                lineEnd: index,
                nextOffset: index + 1,
            }
        }
        if (char !== '\r') continue
        if (index + 1 >= buffer.length && !final) return null
        return {
            lineEnd: index,
            nextOffset: buffer[index + 1] === '\n' ? index + 2 : index + 1,
        }
    }
    return null
}

export function parseKeiSseEvent(lines: readonly string[]): KeiSseEvent | null {
    let event: string | undefined
    let id: string | undefined
    let sawField = false
    const dataLines: string[] = []

    for (const rawLine of lines) {
        const line = rawLine.startsWith('\uFEFF') ? rawLine.slice(1) : rawLine
        if (line.startsWith(':')) continue
        sawField = true

        const colon = line.indexOf(':')
        const field = colon === -1 ? line : line.slice(0, colon)
        let value = colon === -1 ? '' : line.slice(colon + 1)
        if (value.startsWith(' ')) value = value.slice(1)

        if (field === 'data') dataLines.push(value)
        else if (field === 'event') event = value
        else if (field === 'id' && !value.includes('\u0000')) id = value
    }

    if (!sawField) return null
    return {
        event,
        data: dataLines.join('\n'),
        id,
    }
}

/**
 * Incrementally frames UTF-8 server-sent events without provider side effects.
 * Replaying the same byte chunks through a fresh instance yields the same
 * ordered events, independent of how UTF-8 characters or line endings split.
 */
export class KeiSseStreamParser {
    readonly #decoder = new TextDecoder('utf-8')
    #buffer = ''
    #scanOffset = 0
    #eventLines: string[] = []
    #finished = false

    push(chunk: Uint8Array): KeiSseEvent[] {
        if (this.#finished) throw new Error('SSE parser is already finished')
        this.#buffer += this.#decoder.decode(chunk, { stream: true })
        return this.#drain(false)
    }

    finish(): KeiSseEvent[] {
        if (this.#finished) return []
        this.#finished = true
        this.#buffer += this.#decoder.decode()
        return this.#drain(true)
    }

    #drain(final: boolean): KeiSseEvent[] {
        const events: KeiSseEvent[] = []
        let offset = 0
        let scanOffset = this.#scanOffset
        while (true) {
            const boundary = findLineBoundary(this.#buffer, scanOffset, final)
            if (!boundary) break
            const line = this.#buffer.slice(offset, boundary.lineEnd)
            offset = boundary.nextOffset
            scanOffset = offset
            this.#acceptLine(line, events)
        }
        if (offset > 0) {
            this.#buffer = this.#buffer.slice(offset)
        }
        this.#scanOffset = final
            ? 0
            : Math.max(0, this.#buffer.length - (this.#buffer.endsWith('\r') ? 1 : 0))

        if (final) {
            if (this.#buffer.length > 0) {
                this.#acceptLine(this.#buffer, events)
                this.#buffer = ''
            }
            this.#dispatch(events)
        }
        return events
    }

    #acceptLine(line: string, events: KeiSseEvent[]): void {
        if (line.length === 0) {
            this.#dispatch(events)
            return
        }
        this.#eventLines.push(line)
    }

    #dispatch(events: KeiSseEvent[]): void {
        if (this.#eventLines.length === 0) return
        const event = parseKeiSseEvent(this.#eventLines)
        this.#eventLines = []
        if (event) events.push(event)
    }
}
