import { describe, expect, it } from 'vitest'

import { KeiSseStreamParser, parseKeiSseEvent } from './keiSseStream'

function replay(chunks: Uint8Array[]): ReturnType<KeiSseStreamParser['finish']> {
    const parser = new KeiSseStreamParser()
    const events = chunks.flatMap((chunk) => parser.push(chunk))
    events.push(...parser.finish())
    return events
}

describe('KeiSseStreamParser', () => {
    it('preserves split UTF-8 and a boundary split across byte chunks', () => {
        const encoder = new TextEncoder()
        const bytes = encoder.encode('data: {"text":"Hi 😀"}\r\n\r\n')
        const emoji = bytes.findIndex((byte, index) => byte === 0xf0 && bytes[index + 1] === 0x9f)
        const chunks = [
            bytes.slice(0, emoji + 2),
            bytes.slice(emoji + 2, bytes.length - 1),
            bytes.slice(bytes.length - 1),
        ]

        expect(replay(chunks)).toEqual([{
            event: undefined,
            data: '{"text":"Hi 😀"}',
            id: undefined,
        }])
    })

    it('joins multiline data and accepts mixed CRLF/LF/CR blank lines', () => {
        const encoder = new TextEncoder()
        const chunks = [
            encoder.encode('event: message\r\ndata: {"items":\r\n'),
            encoder.encode('data: [1,2]}\n\ndata: two\r\r'),
            encoder.encode('data: three\r\n\n'),
        ]

        expect(replay(chunks)).toEqual([
            {
                event: 'message',
                data: '{"items":\n[1,2]}',
                id: undefined,
            },
            {
                event: undefined,
                data: 'two',
                id: undefined,
            },
            {
                event: undefined,
                data: 'three',
                id: undefined,
            },
        ])
    })

    it('flushes one trailing event and does not replay it on another finish', () => {
        const parser = new KeiSseStreamParser()
        const encoder = new TextEncoder()

        expect(parser.push(encoder.encode('data: trailing'))).toEqual([])
        expect(parser.finish()).toEqual([{
            event: undefined,
            data: 'trailing',
            id: undefined,
        }])
        expect(parser.finish()).toEqual([])
        expect(() => parser.push(encoder.encode('data: late\n\n'))).toThrow(
            /already finished/,
        )
    })

    it('keeps a fragmented long line intact while advancing its scan cursor', () => {
        const encoder = new TextEncoder()
        const payload = `data: ${'x'.repeat(8192)}\r\n\r\n`
        const bytes = encoder.encode(payload)
        const chunks: Uint8Array[] = []
        for (let offset = 0; offset < bytes.length; offset += 7) {
            chunks.push(bytes.slice(offset, offset + 7))
        }

        expect(replay(chunks)).toEqual([{
            event: undefined,
            data: 'x'.repeat(8192),
            id: undefined,
        }])
    })

    it('is replayable for the same byte sequence and ignores comment-only events', () => {
        const encoder = new TextEncoder()
        const chunks = [
            encoder.encode(': heartbeat\n\nid: 7\ndata: one\n'),
            encoder.encode('data: two\n\n'),
        ]

        const first = replay(chunks)
        const second = replay(chunks)
        expect(second).toEqual(first)
        expect(first).toEqual([{
            event: undefined,
            data: 'one\ntwo',
            id: '7',
        }])
    })
})

describe('parseKeiSseEvent', () => {
    it('handles no-colon data fields, comments, unknown fields, and invalid ids', () => {
        expect(parseKeiSseEvent([
            ': comment',
            'unknown: ignored',
            'data',
            'data: value',
            'id: invalid\u0000id',
        ])).toEqual({
            event: undefined,
            data: '\nvalue',
            id: undefined,
        })
        expect(parseKeiSseEvent([': comment'])).toBeNull()
    })
})
