import { describe, expect, test, vi } from 'vitest'
import { createHash } from 'node:crypto'

const decodeRPack = vi.hoisted(() => vi.fn(async (data: Uint8Array) => data))
vi.mock('../rpack/rpack_js', () => ({
    encodeRPack: async (data: Uint8Array) => data,
    decodeRPack,
}))

import { encodeRPack } from '../rpack/rpack_js'
import { prepareRisuModule, materializeRisuModule } from './risumImport'
import { Uint8ArrayImportSource, type SeekableImportSource } from './backgroundImportSource'
import { indexRisuModule, materializeIndexedRisuModule } from './backgroundImportRisuM'
import type { RisuModule } from './modules'

function concat(parts: Uint8Array[]): Uint8Array {
    const output = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0))
    let offset = 0
    for (const part of parts) {
        output.set(part, offset)
        offset += part.byteLength
    }
    return output
}

function u32(value: number): Uint8Array {
    const output = new Uint8Array(4)
    new DataView(output.buffer).setUint32(0, value, true)
    return output
}

async function fixture(
    assetBytes: number[] = [13, 17, 23],
    declaredAssetCount = assetBytes.length,
): Promise<Uint8Array> {
    const module: RisuModule = {
        name: 'Indexed fixture',
        description: 'fixture',
        id: 'source-id',
        assets: Array.from({ length: declaredAssetCount }, (_, index) => [`asset-${index}`, '', 'bin']),
    }
    const main = await encodeRPack(new TextEncoder().encode(JSON.stringify({ type: 'risuModule', module })))
    const parts = [new Uint8Array([111, 0]), u32(main.byteLength), main]
    for (let index = 0; index < assetBytes.length; index++) {
        const data = new Uint8Array(assetBytes[index]).fill(index + 1)
        const encoded = await encodeRPack(data)
        parts.push(new Uint8Array([1]), u32(encoded.byteLength), encoded)
    }
    parts.push(new Uint8Array([0]))
    return concat(parts)
}

class TrackingSource implements SeekableImportSource {
    readonly size: number
    readonly reads: Array<{ offset: number; length: number }> = []

    constructor(private readonly data: Uint8Array) {
        this.size = data.byteLength
    }

    async read(offset: number, length: number): Promise<Uint8Array> {
        this.reads.push({ offset, length })
        return this.data.subarray(offset, offset + length)
    }
}

async function materializeCurrent(data: Uint8Array) {
    const saved: Uint8Array[] = []
    const module = await materializeRisuModule(await prepareRisuModule(data), {
        async saveAsset(asset) {
            saved.push(asset.slice())
            return `asset:${saved.length}`
        },
    })
    return { module, saved }
}

function summarize(data: Uint8Array) {
    return {
        bytes: data.byteLength,
        sha256: createHash('sha256').update(data).digest('hex'),
    }
}

describe('seekable indexed RisuM preparation', () => {
    test('matches foreground semantics while indexing without reading asset bodies', async () => {
        const data = await fixture([1024 * 1024, 1024 * 1024, 1024 * 1024])
        const current = await materializeCurrent(data)
        const source = new TrackingSource(data)
        const indexed = await indexRisuModule(source)
        const bytesReadDuringIndex = source.reads.reduce((sum, read) => sum + read.length, 0)
        expect(bytesReadDuringIndex).toBeLessThan(data.byteLength / 2)
        const saved: Uint8Array[] = []
        const progress: Array<[number, number]> = []
        const module = await materializeIndexedRisuModule(indexed, source, {
            async saveAsset(asset) {
                saved.push(asset.slice())
                return `asset:${saved.length}`
            },
            onProgress(completed, total) { progress.push([completed, total]) },
        })
        expect(module).toEqual(current.module)
        expect(saved.map(summarize)).toEqual(current.saved.map(summarize))
        expect(progress).toEqual([[1, 3], [2, 3], [3, 3]])
        expect(Math.max(...source.reads.map(read => read.length))).toBeLessThan(data.byteLength)
    })

    test('truncation, trailing bytes, and asset cardinality fail during indexing', async () => {
        const data = await fixture([7, 11])
        await expect(indexRisuModule(new Uint8ArrayImportSource(data.subarray(0, data.length - 1))))
            .rejects.toHaveProperty('code', 'RISUM_INVALID_FORMAT')
        await expect(indexRisuModule(new Uint8ArrayImportSource(concat([data, new Uint8Array([9])]))) )
            .rejects.toHaveProperty('code', 'RISUM_INVALID_FORMAT')
        const missingAsset = await fixture([7], 2)
        await expect(indexRisuModule(new Uint8ArrayImportSource(missingAsset)))
            .rejects.toHaveProperty('code', 'RISUM_ASSET_METADATA')
    })

    test('first save failure stops before reading later indexed assets', async () => {
        const data = await fixture([1024, 2048, 4096])
        const source = new TrackingSource(data)
        const indexed = await indexRisuModule(source)
        source.reads.length = 0
        const save = vi.fn(async () => { throw new Error('save failed') })
        await expect(materializeIndexedRisuModule(indexed, source, { saveAsset: save }))
            .rejects.toHaveProperty('code', 'RISUM_ASSET_SAVE_FAILED')
        expect(save).toHaveBeenCalledTimes(1)
        expect(source.reads).toEqual([indexed.assets[0]])
    })
})
