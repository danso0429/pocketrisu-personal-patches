import { describe, expect, it, vi } from 'vitest'

const { createServerChatInputDrain } = require('./serverChatInputDrain.cjs')

describe('server-owned waiting input drain', () => {
    it('starts an admitted successor only after its predecessor is ready', async () => {
        const states = ['waiting', 'transform-required']
        const start = vi.fn(async () => ({ status: 200, started: true }))
        const drain = createServerChatInputDrain({
            loadExecution: async () => ({ status: states.shift() }),
            start,
            delayMs: 60_000,
        })
        expect(drain.enqueue('operation-n-plus-one', { inputCommandVersion: 1 })).toBe(true)
        await drain.drain()
        expect(start).not.toHaveBeenCalled()
        expect(drain.pending()).toBe(1)
        await drain.drain()
        expect(start).toHaveBeenCalledTimes(1)
        expect(start).toHaveBeenCalledWith({ inputCommandVersion: 1 })
        expect(drain.pending()).toBe(0)
    })

    it('does not start a blocked or unavailable command', async () => {
        const start = vi.fn()
        const drain = createServerChatInputDrain({
            loadExecution: async () => ({ status: 'blocked', reason: 'base_revision_changed' }),
            start,
            delayMs: 60_000,
        })
        drain.enqueue('operation-edited', { inputCommandVersion: 1 })
        await drain.drain()
        expect(start).not.toHaveBeenCalled()
        expect(drain.pending()).toBe(0)
    })

    it('retries an ambiguous start without duplicating its queue entry', async () => {
        const start = vi.fn()
            .mockRejectedValueOnce(new Error('response lost'))
            .mockResolvedValueOnce({ status: 200, started: true })
        const drain = createServerChatInputDrain({
            loadExecution: async () => ({ status: 'attached' }),
            start,
            delayMs: 60_000,
        })
        drain.enqueue('operation-same', { operationId: 'operation-same' })
        drain.enqueue('operation-same', { operationId: 'changed' })
        await drain.drain()
        expect(drain.pending()).toBe(1)
        await drain.drain()
        expect(start).toHaveBeenCalledTimes(2)
        expect(start).toHaveBeenNthCalledWith(2, { operationId: 'operation-same' })
        expect(drain.pending()).toBe(0)
    })

    it('bounds failed re-entry attempts and leaves the durable owner to report the unresolved command', async () => {
        const start = vi.fn(async () => ({ status: 503, started: false }))
        const drain = createServerChatInputDrain({
            loadExecution: async () => ({ status: 'transform-required' }),
            start,
            delayMs: 60_000,
        })
        drain.enqueue('operation-unavailable', { operationId: 'operation-unavailable' })
        await drain.drain()
        await drain.drain()
        expect(drain.pending()).toBe(1)
        await drain.drain()
        expect(start).toHaveBeenCalledTimes(3)
        expect(drain.pending()).toBe(0)
    })

    it('bounds owner-read failures without entering the paid start path', async () => {
        const start = vi.fn()
        const drain = createServerChatInputDrain({
            loadExecution: async () => { throw new Error('owner unavailable') },
            start,
            delayMs: 60_000,
        })
        drain.enqueue('operation-read-failed', { operationId: 'operation-read-failed' })
        await drain.drain()
        await drain.drain()
        await drain.drain()
        expect(start).not.toHaveBeenCalled()
        expect(drain.pending()).toBe(0)
    })
})
