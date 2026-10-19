import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { reconcileServerInputStart } from './bgServerInputStart'
import { submitServerInputCommand } from './bgServerInputClient'
import { readServerInputMarkers } from './bgServerInputLedger'

const operationId = 'operation-phase-b-1'
const hash = 'a'.repeat(64)

function storageHarness() {
    const values = new Map<string, string>()
    return {
        values,
        storage: {
            get length() { return values.size },
            key: (index: number) => [...values.keys()][index] ?? null,
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => { values.set(key, value) },
            removeItem: (key: string) => { values.delete(key) },
        },
    }
}

afterEach(() => vi.restoreAllMocks())

describe('[B2-2] BG client session headers and 423 handling', () => {
    it('classifies a server-input 423 as one-attempt session deactivation without status polling', async () => {
        const start = vi.fn(async () => ({ status: 423, body: { error: 'Session deactivated' } }))
        const status = vi.fn(async () => { throw new Error('status unavailable') })
        let now = 0
        await expect(reconcileServerInputStart({
            operationId, start, status, isCurrent: () => true,
            deadlineAt: 3, now: () => now, wait: async () => { now += 1 },
        })).resolves.toEqual({
            resolution: 'rejected', state: null, rejectedReason: 'session-deactivated',
        })
        expect(start).toHaveBeenCalledTimes(1)
        expect(status).not.toHaveBeenCalled()
    })

    it('clears the uncertain marker and keeps the draft on a rejected server-input start', async () => {
        const { storage } = storageHarness()
        const status = vi.fn(async () => { throw new Error('status unavailable') })
        const start = vi.fn(async () => ({ status: 423, body: { error: 'Session deactivated' } }))
        let now = 1_000
        const outcome = await submitServerInputCommand({
            storage,
            readCapability: async () => ({ contract: 'bg_orchestration_capabilities.v1', inputCommandVersion: 1,
                serverInputBaseVersion: 1, serverChatCommitVersion: 1, chatExecutionProjectionVersion: 1 }),
            flushSettings: async () => {}, readLocalRevision: () => hash,
            peekServerChat: async () => ({ revision: hash, viewRevision: hash }),
            readPendingInputs: async () => [], start, status,
            newId: vi.fn().mockReturnValueOnce(operationId).mockReturnValueOnce('message-phase-b-1'),
            isCurrent: () => true, now: () => now, wait: async () => { now += 10_000 },
        } as any, {
            charId: 'char-1', chatId: 'chat-1', rawText: 'draft stays', draftId: 'draft-phase-b-1',
        })
        expect(outcome).toEqual({ kind: 'rejected', operationId })
        expect(readServerInputMarkers(storage, 1_001)).toEqual([])
        expect(status).not.toHaveBeenCalled()
    })

    it('keeps 503 ambiguous and reconciles through exact status without deactivation', async () => {
        const listener = vi.fn()
        window.addEventListener('risu-session-deactivated', listener)
        let now = 0
        const start = vi.fn()
            .mockResolvedValueOnce({ status: 503, body: { error: 'STORAGE_RESET_IN_PROGRESS' } })
            .mockResolvedValueOnce({ status: 200, body: { operationId, started: true, storageEpoch: 2 } })
        const status = vi.fn()
            .mockResolvedValueOnce({ status: 404, body: { accepted: false, operationId, state: 'missing', storageEpoch: 2 } })
        try {
            await expect(reconcileServerInputStart({
                operationId, start, status, isCurrent: () => true, deadlineAt: 10,
                now: () => now, wait: async () => { now += 1 },
            })).resolves.toMatchObject({ resolution: 'accepted' })
            expect(status).toHaveBeenCalled()
            expect(listener).not.toHaveBeenCalled()
        } finally { window.removeEventListener('risu-session-deactivated', listener) }
    })

    it('wires writer headers and deactivation notification into all four gated requests', () => {
        const source = readFileSync('src/ts/bgOrchestrate.ts', 'utf8')
        expect(source).toContain('writerSessionHeaders')
        expect(source).toContain('notifySessionDeactivated')
        for (const route of [
            '/api/bg-orchestrate',
            '/api/bg-orchestrate-input/claim',
            '/api/bg-orchestrate-input/attach',
        ]) expect(source).toContain(route)
        expect((source.match(/writerSessionHeaders\(\)/g) ?? []).length).toBeGreaterThanOrEqual(4)
    })

    it('makes claim and attach 423 terminal on their existing error paths', () => {
        const source = readFileSync('src/ts/bgOrchestrate.ts', 'utf8')
        for (const action of ['claim', 'attach']) {
            const route = `/api/bg-orchestrate-input/${action}`
            const start = source.indexOf(route)
            expect(start).toBeGreaterThan(0)
            const requestBlock = source.slice(start, start + 1_400)
            expect(requestBlock).toMatch(/notifySessionDeactivated|status\s*===\s*423/)
            expect(requestBlock).not.toMatch(/423[\s\S]{0,180}(retry|setTimeout)/)
        }
    })

    it('suppresses legacy fallback and extra notice only for session-deactivated', () => {
        const source = readFileSync('src/ts/bgOrchestrate.ts', 'utf8')
        expect(source).toContain("startRejectionReason = 'session-deactivated'")
        const fallback = source.indexOf("triggerClientFallback('delegate-not-started')")
        expect(fallback).toBeGreaterThan(0)
        expect(source.slice(Math.max(0, fallback - 1_200), fallback)).toContain('session-deactivated')
        expect(source.slice(Math.max(0, fallback - 1_200), fallback)).toContain('server_statistics_invalid')
        expect(source.slice(Math.max(0, fallback - 1_200), fallback)).toContain('chat-generation-active')
    })
})
