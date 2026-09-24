import { describe, expect, it, vi } from 'vitest'
import { reconcileServerInputStart } from './bgServerInputStart'

const operationId = 'operation-input-1'

describe('server input start reconciliation', () => {
    it('accepts a durable waiting-input 202 without launching a client fallback', async () => {
        const start = vi.fn(async () => ({
            status: 202,
            body: { operationId, accepted: true, started: false, state: 'input-waiting-predecessor' },
        }))
        const status = vi.fn()
        await expect(reconcileServerInputStart({
            operationId, start, status, isCurrent: () => true,
            deadlineAt: Date.now() + 1_000,
        })).resolves.toEqual({ resolution: 'accepted', state: 'input-waiting-predecessor' })
        expect(start).toHaveBeenCalledTimes(1)
        expect(status).not.toHaveBeenCalled()
    })

    it('uses exact status after a lost start response', async () => {
        const start = vi.fn(async () => { throw new Error('response lost') })
        const status = vi.fn(async () => ({
            status: 200,
            body: { accepted: true, operationId, state: 'input-generating' },
        }))
        await expect(reconcileServerInputStart({
            operationId, start, status, isCurrent: () => true,
            deadlineAt: Date.now() + 1_000,
            wait: async () => {},
        })).resolves.toEqual({ resolution: 'accepted', state: 'input-generating' })
        expect(start).toHaveBeenCalledTimes(1)
        expect(status).toHaveBeenCalledTimes(1)
    })

    it('retries the same operation only after an exact missing status', async () => {
        const start = vi.fn()
            .mockRejectedValueOnce(new Error('response lost'))
            .mockResolvedValueOnce({ status: 200, body: { operationId, started: true } })
        const status = vi.fn(async () => ({
            status: 404, body: { accepted: false, operationId, state: 'missing' },
        }))
        await expect(reconcileServerInputStart({
            operationId, start, status, isCurrent: () => true,
            deadlineAt: Date.now() + 1_000,
            wait: async () => {},
        })).resolves.toEqual({ resolution: 'accepted', state: null })
        expect(start).toHaveBeenCalledTimes(2)
    })

    it('rejects only a proven pre-admission mode error', async () => {
        await expect(reconcileServerInputStart({
            operationId,
            start: async () => ({
                status: 409,
                body: { operationId, started: false, reason: 'server-input-command-mode-unsupported' },
            }),
            status: async () => { throw new Error('status must not be needed') },
            isCurrent: () => true,
            deadlineAt: Date.now() + 1_000,
        })).resolves.toEqual({ resolution: 'rejected', state: null })
    })

    it('leaves an unclassified 409 unknown instead of falling back', async () => {
        let now = 0
        const status = vi.fn(async () => { throw new Error('status unavailable') })
        await expect(reconcileServerInputStart({
            operationId,
            start: async () => ({
                status: 409,
                body: { operationId, started: false, reason: 'server-input-command-blocked' },
            }),
            status,
            isCurrent: () => true,
            deadlineAt: 3,
            now: () => now,
            wait: async () => { now += 1 },
        })).resolves.toEqual({ resolution: 'unknown', state: null })
        expect(status).toHaveBeenCalled()
    })
})
