import { beforeEach, describe, expect, test, vi } from 'vitest'

const decodeRPack = vi.hoisted(() => vi.fn(async (data: Uint8Array) => data))
vi.mock('../rpack/rpack_js', () => ({
    encodeRPack: async (data: Uint8Array) => data,
    decodeRPack,
}))

import { encodeRPack } from '../rpack/rpack_js'
import {
    RISUM_LIMITS,
    materializeRisuModule,
    prepareRisuModule,
} from './risumImport'
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

async function fixture(module: RisuModule, assets: string[] = []): Promise<Uint8Array> {
    const main = await encodeRPack(new TextEncoder().encode(JSON.stringify({ type: 'risuModule', module })))
    const parts = [new Uint8Array([111, 0]), u32(main.byteLength), main]
    for (const asset of assets) {
        const encoded = await encodeRPack(new TextEncoder().encode(asset))
        parts.push(new Uint8Array([1]), u32(encoded.byteLength), encoded)
    }
    parts.push(new Uint8Array([0]))
    return concat(parts)
}

function baseModule(assetCount = 0): RisuModule {
    return {
        name: 'Fixture module',
        description: 'fixture',
        id: 'source-id',
        assets: Array.from({ length: assetCount }, (_, index) => [
            `asset-${index}`,
            '',
            'png',
        ]),
    }
}

describe('staged RisuM reader', () => {
    beforeEach(() => {
        decodeRPack.mockReset()
        decodeRPack.mockImplementation(async (data: Uint8Array) => data)
    })

    test('preparation is storage-free and materialization saves every asset once', async () => {
        const prepared = await prepareRisuModule(await fixture(baseModule(2), ['first', 'second']))
        expect(prepared.module.id).toBe('source-id')
        expect(prepared.encodedAssets).toHaveLength(2)
        const saved: string[] = []
        const progress: [number, number][] = []
        const module = await materializeRisuModule(prepared, {
            async saveAsset(data) {
                const value = new TextDecoder().decode(data)
                saved.push(value)
                return `saved:${value}`
            },
            onProgress(completed, total) {
                progress.push([completed, total])
            },
        })
        expect(saved).toEqual(['first', 'second'])
        expect(module.assets?.map(asset => asset[1])).toEqual(['saved:first', 'saved:second'])
        expect(progress).toEqual([[1, 2], [2, 2]])
        expect(prepared.module.assets?.map(asset => asset[1])).toEqual(['', ''])
    })

    test('every truncation of a valid fixture is rejected', async () => {
        const valid = await fixture(baseModule(1), ['payload'])
        for (let length = 0; length < valid.byteLength; length += 1) {
            await expect(prepareRisuModule(valid.slice(0, length))).rejects.toHaveProperty('name', 'RisuModuleImportError')
        }
    })

    test.each([
        ['magic', (bytes: Uint8Array) => { bytes[0] = 0 }, 'RISUM_INVALID_FORMAT'],
        ['version', (bytes: Uint8Array) => { bytes[1] = 1 }, 'RISUM_UNSUPPORTED_VERSION'],
        ['asset marker', (bytes: Uint8Array) => {
            const mainLength = new DataView(bytes.buffer).getUint32(2, true)
            bytes[6 + mainLength] = 2
        }, 'RISUM_INVALID_FORMAT'],
    ])('invalid %s is rejected with a typed code', async (_name, mutate, code) => {
        const bytes = await fixture(baseModule(1), ['payload'])
        mutate(bytes)
        await expect(prepareRisuModule(bytes)).rejects.toMatchObject({ code })
    })

    test('asset cardinality and tuple metadata must agree exactly', async () => {
        await expect(prepareRisuModule(await fixture(baseModule(2), ['only-one'])))
            .rejects.toMatchObject({ code: 'RISUM_ASSET_METADATA' })
        const invalid = baseModule(1)
        invalid.assets = [['missing-fields'] as any]
        await expect(prepareRisuModule(await fixture(invalid, ['one'])))
            .rejects.toMatchObject({ code: 'RISUM_ASSET_METADATA' })
    })

    test('trailing bytes and declared record limits fail deterministically', async () => {
        const valid = await fixture(baseModule())
        await expect(prepareRisuModule(concat([valid, new Uint8Array([9])])))
            .rejects.toMatchObject({ code: 'RISUM_INVALID_FORMAT' })
        const declared = new Uint8Array([111, 0, ...u32(RISUM_LIMITS.mainRecordBytes + 1)])
        await expect(prepareRisuModule(declared))
            .rejects.toMatchObject({ code: 'RISUM_LIMIT_EXCEEDED' })
    })

    test.each([1, 2, 3])('storage failure at asset %i stops without an outer retry wave', async (failureAt) => {
        const prepared = await prepareRisuModule(await fixture(baseModule(3), ['a', 'b', 'c']))
        const saveAsset = vi.fn(async () => {
            if (saveAsset.mock.calls.length === failureAt) throw new Error('storage failed')
            return `saved-${saveAsset.mock.calls.length}`
        })
        await expect(materializeRisuModule(prepared, { saveAsset }))
            .rejects.toMatchObject({ code: 'RISUM_ASSET_SAVE_FAILED' })
        expect(saveAsset).toHaveBeenCalledTimes(failureAt)
    })

    test('asset decode corruption is deterministic and never calls storage', async () => {
        const prepared = await prepareRisuModule(await fixture(baseModule(1), ['payload']))
        decodeRPack.mockRejectedValueOnce(new Error('decode failed'))
        const saveAsset = vi.fn()
        await expect(materializeRisuModule(prepared, { saveAsset }))
            .rejects.toMatchObject({ code: 'RISUM_ASSET_DECODE_FAILED' })
        expect(saveAsset).not.toHaveBeenCalled()
    })
})
