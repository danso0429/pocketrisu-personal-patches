import { createHash } from 'node:crypto'
import { describe, expect, test, vi } from 'vitest'
import crc32 from 'crc/crc32'

vi.mock('../globalApi.svelte', () => ({
    AppendableBuffer: class {
        private parts: Uint8Array[] = []
        append(value: Uint8Array) { this.parts.push(value.slice()) }
        get buffer() { return Buffer.concat(this.parts) }
    },
    VirtualWriter: class {},
}))
vi.mock('../util', () => ({
    blobToUint8Array: async (value: Blob) => new Uint8Array(await value.arrayBuffer()),
}))

import { PngChunk } from '../pngChunk'
import { Uint8ArrayImportSource, type SeekableImportSource } from './backgroundImportSource'
import {
    PNG_SIGNATURE,
    indexPngCharacter,
    writeIndexedPngImage,
} from './backgroundImportPng'

const LIMITS = Object.freeze({
    chunkCount: 128,
    textChunkBytes: 5 * 1024 * 1024,
    totalTextBytes: 16 * 1024 * 1024,
    ioChunkBytes: 31 * 1024,
})

function u32(value: number): Buffer {
    const output = Buffer.alloc(4)
    output.writeUInt32BE(value >>> 0)
    return output
}

function chunk(type: string, data: Uint8Array): Buffer {
    const typeBytes = Buffer.from(type)
    return Buffer.concat([
        u32(data.byteLength),
        typeBytes,
        Buffer.from(data),
        u32(crc32(Buffer.concat([typeBytes, Buffer.from(data)])) >>> 0),
    ])
}

function text(key: string, value: string): Buffer {
    return chunk('tEXt', Buffer.concat([Buffer.from(key), Buffer.from([0]), Buffer.from(value)]))
}

function fixture(idatBytes = 257): Buffer {
    return Buffer.concat([
        Buffer.from(PNG_SIGNATURE),
        chunk('IHDR', Buffer.alloc(13)),
        text('unrelated', 'ignore'),
        text('ccv3', 'card payload'),
        text('chara-ext-asset_0', 'YXNzZXQ='),
        chunk('IDAT', Buffer.alloc(idatBytes, 7)),
        chunk('IEND', Buffer.alloc(0)),
    ])
}

function sha(data: Uint8Array) {
    return createHash('sha256').update(data).digest('hex')
}

async function currentTrimmedImage(data: Uint8Array): Promise<Uint8Array> {
    for await (const value of PngChunk.readGenerator(data, { returnTrimed: true })) {
        if (value && typeof value === 'object' && 'buffer' in value) {
            return (value as { buffer: Uint8Array }).buffer
        }
    }
    throw new Error('Current PNG generator produced no trimmed image')
}

class TrackingSource implements SeekableImportSource {
    readonly size: number
    readonly reads: number[] = []

    constructor(private readonly data: Uint8Array) { this.size = data.byteLength }

    async read(offset: number, length: number) {
        this.reads.push(length)
        return this.data.subarray(offset, offset + length)
    }
}

describe('seekable PNG character metadata', () => {
    test('matches current text semantics and exact trimmed image bytes', async () => {
        const data = fixture(3 * 1024 * 1024 + 17)
        const source = new TrackingSource(data)
        const textValues = new Map<string, string>()
        const indexed = await indexPngCharacter(source, {
            limits: LIMITS,
            onText(record) {
                textValues.set(record.key, new TextDecoder().decode(record.value))
            },
        })
        const current = PngChunk.read(data, [...textValues.keys()], { checkCrc: true })
        expect(Object.fromEntries(textValues)).toEqual(current)
        const output: Uint8Array[] = []
        await writeIndexedPngImage(indexed, source, {
            ioChunkBytes: LIMITS.ioChunkBytes,
            write(value) { output.push(value.slice()) },
        })
        const trimmed = Buffer.concat(output)
        const currentTrimmed = await currentTrimmedImage(data)
        expect(trimmed.byteLength).toBe(currentTrimmed.byteLength)
        expect(sha(trimmed)).toBe(sha(currentTrimmed))
        expect(Math.max(...source.reads)).toBeLessThan(data.byteLength)
    })

    test('CRC, truncation, trailing data, count, and text budgets fail closed', async () => {
        const data = fixture()
        const corrupt = Buffer.from(data)
        corrupt[corrupt.length - 1] ^= 0xff
        await expect(indexPngCharacter(new Uint8ArrayImportSource(corrupt), {
            limits: LIMITS, onText() {},
        })).rejects.toHaveProperty('code', 'PNG_CRC_MISMATCH')
        await expect(indexPngCharacter(new Uint8ArrayImportSource(data.subarray(0, data.length - 1)), {
            limits: LIMITS, onText() {},
        })).rejects.toHaveProperty('code', 'PNG_INVALID_CHUNK')
        await expect(indexPngCharacter(new Uint8ArrayImportSource(Buffer.concat([data, Buffer.from([1])])), {
            limits: LIMITS, onText() {},
        })).rejects.toHaveProperty('code', 'PNG_INVALID_CHUNK')
        await expect(indexPngCharacter(new Uint8ArrayImportSource(data), {
            limits: { ...LIMITS, chunkCount: 2 }, onText() {},
        })).rejects.toHaveProperty('code', 'PNG_LIMIT_EXCEEDED')
        await expect(indexPngCharacter(new Uint8ArrayImportSource(data), {
            limits: { ...LIMITS, textChunkBytes: 4 }, onText() {},
        })).rejects.toHaveProperty('code', 'PNG_LIMIT_EXCEEDED')
    })

    test('text handler failure stops before later image reads', async () => {
        const data = fixture(1024 * 1024)
        const source = new TrackingSource(data)
        const handler = vi.fn(() => { throw new Error('stage failed') })
        await expect(indexPngCharacter(source, { limits: LIMITS, onText: handler }))
            .rejects.toThrow('stage failed')
        expect(handler).toHaveBeenCalledTimes(1)
        expect(source.reads.reduce((sum, length) => sum + length, 0)).toBeLessThan(data.byteLength)
    })
})
