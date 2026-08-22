import { describe, expect, test, vi } from 'vitest'

vi.mock('../parser/parser.svelte', () => ({
    hasher: vi.fn(async () => 'default-hash'),
}))
vi.mock('../globalApi.svelte', () => ({
    saveAsset: vi.fn(async () => 'default-asset'),
}))

import { importCharX, type CharXProgress } from './charxImportSession'
import { buildFixtureArchive, fixtureCard, type FixtureEntry } from './charxTestFixtures'

function fixture(assetCount = 3, moduleData?: string) {
    const assets: FixtureEntry[] = Array.from({ length: assetCount }, (_, index) => ({
        name: `assets/${index}.bin`,
        data: `payload-${index}`,
        descriptor: index % 2 === 0,
        method: index % 2 === 0 ? 8 : 0,
    }))
    const entries: FixtureEntry[] = [
        { name: 'card.json', data: fixtureCard(assets.map(entry => entry.name)) },
        ...assets,
    ]
    if (moduleData !== undefined) entries.push({ name: 'module.risum', data: moduleData })
    return buildFixtureArchive(entries)
}

describe('terminal CharX import session', () => {
    test('publishes one complete receipt after sequential acknowledged saves', async () => {
        const input = fixture(3, 'module-data')
        const calls: string[] = []
        const progress: CharXProgress[] = []
        const receipt = await importCharX(
            { kind: 'bytes', value: input.bytes, container: 'zip' },
            {
                async saveAsset(data) {
                    const value = new TextDecoder().decode(data)
                    calls.push(value)
                    return `saved:${value}`
                },
                onProgress(value) {
                    progress.push(value)
                },
            },
        )
        expect(calls).toEqual(['payload-0', 'payload-1', 'payload-2'])
        expect([...receipt.assets]).toEqual([
            ['assets/0.bin', 'saved:payload-0'],
            ['assets/1.bin', 'saved:payload-1'],
            ['assets/2.bin', 'saved:payload-2'],
        ])
        expect(new TextDecoder().decode(receipt.moduleData)).toBe('module-data')
        expect(receipt.referencedAssetCount).toBe(3)
        expect(progress.at(-1)).toEqual({ phase: 'terminal', completedAssets: 3, totalAssets: 3 })
        expect(progress.filter(value => value.phase === 'terminal')).toHaveLength(1)
    })

    test('skipSaving performs zero storage writes and hashes each selected entry', async () => {
        const input = fixture(2)
        const saveAsset = vi.fn(async () => 'unexpected')
        const hashAsset = vi.fn(async (data: Uint8Array) => `hash-${new TextDecoder().decode(data)}`)
        const receipt = await importCharX(
            { kind: 'bytes', value: input.bytes, container: 'zip' },
            { skipSaving: true, hashSignal: 'must-not-write', saveAsset, hashAsset },
        )
        expect(saveAsset).not.toHaveBeenCalled()
        expect(hashAsset).toHaveBeenCalledTimes(2)
        expect([...receipt.assets.values()]).toEqual([
            'assets/hash-payload-0.png',
            'assets/hash-payload-1.png',
        ])
    })

    test.each([1, 2, 3])('save failure at position %i rejects once and stops new work', async (failureAt) => {
        const input = fixture(3)
        let calls = 0
        const operation = importCharX(
            { kind: 'bytes', value: input.bytes, container: 'zip' },
            {
                async saveAsset() {
                    calls += 1
                    if (calls === failureAt) throw new Error(`storage-${failureAt}`)
                    return `saved-${calls}`
                },
            },
        )
        await expect(operation).rejects.toMatchObject({ code: 'CHARX_SAVE_FAILED' })
        expect(calls).toBe(failureAt)

        const retry = await importCharX(
            { kind: 'bytes', value: input.bytes, container: 'zip' },
            { saveAsset: async () => 'retry-ok' },
        )
        expect(retry.assets.size).toBe(3)
    })

    test('hash signal is stored only after every selected asset succeeds', async () => {
        const input = fixture(2)
        const calls: string[] = []
        await importCharX(
            { kind: 'bytes', value: input.bytes, container: 'zip' },
            {
                hashSignal: 'archive-signal',
                async saveAsset(data) {
                    calls.push(new TextDecoder().decode(data))
                    return `saved-${calls.length}`
                },
            },
        )
        expect(calls).toEqual(['payload-0', 'payload-1', 'archive-signal'])
    })

    test('abort releases the session and allows the next import immediately', async () => {
        const input = fixture(3)
        const controller = new AbortController()
        let calls = 0
        await expect(importCharX(
            { kind: 'bytes', value: input.bytes, container: 'zip' },
            {
                signal: controller.signal,
                async saveAsset() {
                    calls += 1
                    controller.abort()
                    return 'saved-before-abort'
                },
            },
        )).rejects.toMatchObject({ code: 'CHARX_ABORTED' })
        expect(calls).toBe(1)
        await expect(importCharX(
            { kind: 'bytes', value: input.bytes, container: 'zip' },
            { saveAsset: async () => 'next-ok' },
        )).resolves.toMatchObject({ referencedAssetCount: 3 })
    })

    test('archive integrity failure schedules no storage write', async () => {
        const input = buildFixtureArchive([
            { name: 'card.json', data: fixtureCard(['assets/a.bin']) },
            {
                name: 'assets/a.bin',
                data: 'corrupt-me',
                localCrc32: 0x11223344,
                centralCrc32: 0x11223344,
            },
        ])
        const saveAsset = vi.fn(async () => 'unexpected')
        await expect(importCharX(
            { kind: 'bytes', value: input.bytes, container: 'zip' },
            { saveAsset },
        )).rejects.toMatchObject({ code: 'CHARX_CRC_MISMATCH' })
        expect(saveAsset).not.toHaveBeenCalled()
    })
})
