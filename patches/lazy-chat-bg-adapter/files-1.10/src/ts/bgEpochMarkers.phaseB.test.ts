import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
    readServerInputMarker, readServerInputMarkers, SERVER_INPUT_MARKER_MAX_AGE_MS,
    SERVER_INPUT_MARKER_MAX_ENTRIES, SERVER_INPUT_MARKER_PREFIX, writeServerInputMarker,
} from './bgServerInputLedger'
import { readPendingMarkers, writePendingMarker } from './bgOrchestrationPending'
import { reconcileServerInputStart } from './bgServerInputStart'

const hash = 'a'.repeat(64)

function memoryStorage(seed: Record<string, unknown> = {}) {
    const values = new Map(Object.entries(seed).map(([key, value]) => [key, JSON.stringify(value)]))
    const storage = {
        get length() { return values.size },
        key: (index: number) => [...values.keys()][index] ?? null,
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value) },
        removeItem: (key: string) => { values.delete(key) },
    }
    return { values, storage }
}

function marker(operationId: string, createdAt = 1_000) {
    return {
        operationId, charId: 'char-1', chatId: 'chat-1', localRevision: hash,
        baseRevision: hash, state: 'accepted' as const, createdAt,
        epochVersion: 1, storageEpoch: 4,
    }
}

async function loadStorageResetClearance(): Promise<any> {
    const specifier = './bgStorageResetClearance'
    return import(/* @vite-ignore */ specifier)
}

describe('[B3-2] Epoch-stamped markers and reset clearance', () => {
    it.each(['start', 'status'] as const)('carries validated storageEpoch from accepting %s response', async path => {
        const start = vi.fn(async () => path === 'start'
            ? { status: 200, body: { operationId: 'operation-epoch', started: true, storageEpoch: 4 } }
            : { status: 500, body: {} })
        const status = vi.fn(async () => ({
            status: 200,
            body: { accepted: true, operationId: 'operation-epoch', state: 'running', storageEpoch: 4 },
        }))
        await expect(reconcileServerInputStart({
            operationId: 'operation-epoch', start, status, isCurrent: () => true,
            deadlineAt: Date.now() + 1_000, wait: async () => {},
        })).resolves.toMatchObject({ resolution: 'accepted', storageEpoch: 4 })
        expect(status).toHaveBeenCalledTimes(path === 'status' ? 1 : 0)
    })

    it('writes v4 server-input markers with epoch evidence', () => {
        const { values, storage } = memoryStorage()
        writeServerInputMarker(storage, marker('operation-v4') as any)
        expect(SERVER_INPUT_MARKER_PREFIX).toBe('bg-server-input-v4:')
        expect(JSON.parse(values.get(SERVER_INPUT_MARKER_PREFIX + 'operation-v4')!)).toMatchObject({
            epochVersion: 1, storageEpoch: 4,
        })
    })

    it('reads v1 v2 and v3 markers without fabricating epochVersion or losing data', () => {
        const old = { ...marker('operation-old'), epochVersion: undefined, storageEpoch: undefined }
        delete (old as any).epochVersion
        delete (old as any).storageEpoch
        const { storage } = memoryStorage({
            'bg-server-input-v1:operation-v1': { ...old, operationId: 'operation-v1' },
            'bg-server-input-v2:operation-v2': { ...old, operationId: 'operation-v2' },
            'bg-server-input-v3:operation-v3': { ...old, operationId: 'operation-v3' },
        })
        const rows = readServerInputMarkers(storage, 1_001)
        expect(rows.map(row => row.operationId)).toEqual(['operation-v1', 'operation-v2', 'operation-v3'])
        expect(rows.every(row => !('epochVersion' in row))).toBe(true)
    })

    it('retains epoch fields on the legacy pending marker key', () => {
        const { values, storage } = memoryStorage()
        writePendingMarker(storage, {
            charId: 'char-1', chatId: 'chat-1', baselineMsgs: 1, operationId: 'legacy-op',
            deliveryVersion: 0, resultKeyVersion: 1, staticsMessagesApplied: 0, ts: 1_000,
            epochVersion: 1, storageEpoch: 4,
        } as any)
        expect([...values.keys()]).toEqual(['bg-orch-pending:legacy-op'])
        expect(readPendingMarkers(storage, 1_001)[0]).toMatchObject({ epochVersion: 1, storageEpoch: 4 })
    })

    it.each([
        [{ epochVersion: 1, storageEpoch: 2 }, 3, true],
        [{ epochVersion: 1, storageEpoch: 2 }, 2, false],
        [{}, 1, true, true],
        [{}, 0, false, true],
        [{ epochVersion: 1, storageEpoch: 2 }, undefined, false],
    ] as const)('applies the reset-clearance epoch matrix for marker %j and epoch %s', async (stored, epoch, expected, preUpgrade = false) => {
        const mod = await loadStorageResetClearance()
        const storedMarker: any = { ...marker('op'), ...stored }
        if (preUpgrade) {
            delete storedMarker.epochVersion
            delete storedMarker.storageEpoch
        }
        expect(mod.isStorageResetMissing(storedMarker, {
            accepted: false, operationId: 'op', state: 'missing', storageEpoch: epoch,
        })).toBe(expected)
    })

    it('synchronously clears once so concurrent readers can emit one notice', async () => {
        const { storage } = memoryStorage()
        writeServerInputMarker(storage, marker('operation-race') as any)
        const { clearMarkerForStorageReset } = await loadStorageResetClearance()
        expect(clearMarkerForStorageReset(storage, 'server-input', 'operation-race')).toBe(true)
        expect(clearMarkerForStorageReset(storage, 'server-input', 'operation-race')).toBe(false)
        expect(readServerInputMarker(storage, 'operation-race')).toBeNull()
    })

    it('covers every stored-marker status reader and the exact Korean notice', () => {
        const source = readFileSync('src/ts/bgOrchestrate.ts', 'utf8')
        expect(source).toContain('백업 복원으로 이 입력은 처리되지 않았어요')
        expect((source.match(/clearMarkerForStorageReset/g) ?? []).length).toBeGreaterThanOrEqual(4)
        expect(source).toMatch(/resultKeyVersion\s*===?\s*1[\s\S]{0,1800}bg-orchestrate-status/)
        expect(source).toMatch(/failed[\s\S]{0,2500}clearMarkerForStorageReset/i)
        expect(source).toMatch(/cancelled[\s\S]{0,2500}clearMarkerForStorageReset/i)
        expect(source).toContain('readServerOperationStatus')
    })

    it('keeps same-epoch uncertain cleanup silent and preserves TTL and cap', async () => {
        const { storage } = memoryStorage()
        const now = SERVER_INPUT_MARKER_MAX_AGE_MS + 10_000
        writeServerInputMarker(storage, { ...marker('expired', 1), state: 'uncertain', storageEpoch: 3 } as any)
        for (let index = 0; index < SERVER_INPUT_MARKER_MAX_ENTRIES + 3; index += 1) {
            writeServerInputMarker(storage, { ...marker(`op-${index}`, now - 1_000 + index), state: 'uncertain', storageEpoch: 3 } as any)
        }
        const retained = readServerInputMarkers(storage, now)
        expect(retained).toHaveLength(SERVER_INPUT_MARKER_MAX_ENTRIES)
        expect(retained.some(row => row.operationId === 'expired')).toBe(false)
        const mod = await loadStorageResetClearance()
        expect(mod.isStorageResetMissing(retained[0], {
            accepted: false, operationId: retained[0].operationId, state: 'missing', storageEpoch: 3,
        })).toBe(false)
    })
})
