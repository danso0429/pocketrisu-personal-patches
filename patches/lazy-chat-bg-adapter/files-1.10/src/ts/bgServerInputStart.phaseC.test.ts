import { describe, expect, it, vi } from 'vitest'
import { reconcileServerInputStart } from './bgServerInputStart'

describe('[C-2] Fence the start route with the legacy start on the build handshake', () => {
    const operationId = 'phase-c-input'

    it('treats a coded build-fence 426 as a definitive rejection without polling or retrying', async () => {
        let now = 0
        const start = vi.fn(async (_signal: AbortSignal) => ({
            status: 426,
            body: { code: 'CLIENT_UPGRADE_REQUIRED', commitOutcome: 'not-committed' },
        }))
        const status = vi.fn(async (_signal: AbortSignal) => ({ status: 500, body: null }))
        await expect(reconcileServerInputStart({
            operationId,
            start,
            status,
            isCurrent: () => true,
            deadlineAt: 3,
            now: () => now,
            wait: async () => { now += 1 },
        })).resolves.toEqual({
            resolution: 'rejected',
            state: null,
            rejectedReason: 'client-upgrade-required',
        })
        expect(start).toHaveBeenCalledOnce()
        expect(status).not.toHaveBeenCalled()
    })

    it.each([
        { code: 'OTHER_UPGRADE' },
        'Upgrade Required',
    ])('does not classify an uncoded or malformed 426 as the build-fence rejection', async (body) => {
        let now = 0
        const status = vi.fn(async (_signal: AbortSignal) => ({ status: 404, body: { state: 'missing' } }))
        const start = vi.fn(async (_signal: AbortSignal) => ({ status: 426, body }))
        const result = await reconcileServerInputStart({
            operationId,
            start,
            status,
            isCurrent: () => true,
            deadlineAt: 2,
            now: () => now,
            wait: async () => { now += 1 },
        })
        expect(result.rejectedReason).not.toBe('client-upgrade-required')
        expect(status).toHaveBeenCalled()
    })

    it('keeps storage reset retryable and session deactivation definitive', async () => {
        const start = vi.fn(async (_signal: AbortSignal): Promise<{ status: number; body: unknown }> => ({
            status: 500, body: null,
        }))
            .mockResolvedValueOnce({ status: 503, body: { code: 'STORAGE_RESET_IN_PROGRESS' } })
            .mockResolvedValueOnce({ status: 423, body: { code: 'SESSION_DEACTIVATED' } })
        const status = vi.fn(async (_signal: AbortSignal) => ({ status: 404, body: { operationId, state: 'missing' } }))
        await expect(reconcileServerInputStart({
            operationId, start, status, isCurrent: () => true,
            deadlineAt: Date.now() + 60_000, wait: async () => {},
        })).resolves.toMatchObject({ resolution: 'rejected', rejectedReason: 'session-deactivated' })
        expect(start).toHaveBeenCalledTimes(2)
    })
})
