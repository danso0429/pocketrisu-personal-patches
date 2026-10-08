import { describe, expect, it, vi } from 'vitest'
import { createSuggestionRequestOwner } from './suggestionRequestOwner'

describe('suggestion request owner', () => {
    const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }
    it('coalesces eligibility and rejects an old target response without clearing newer progress', async () => {
        let target = 'a', ready = false
        const requests: Array<{ target: string, signal: AbortSignal, resolve: (v: string) => void }> = []
        const publish = vi.fn(), progress = vi.fn()
        const owner = createSuggestionRequestOwner({
            capture: () => ready ? target : null,
            current: context => ready && context === target,
            request: (context, signal) => new Promise<string>(resolve => requests.push({ target: context, signal, resolve })),
            publish, progress,
        })
        owner.schedule(); owner.schedule(); await flush()
        expect(requests).toHaveLength(0)
        ready = true; owner.schedule(); owner.schedule(); await flush()
        expect(requests).toHaveLength(1)
        target = 'b'; owner.schedule(); await flush()
        expect(requests[0].signal.aborted).toBe(true)
        expect(requests).toHaveLength(2)
        requests[0].resolve('stale'); await flush()
        expect(publish).not.toHaveBeenCalled()
        expect(progress).toHaveBeenLastCalledWith(true)
        requests[1].resolve('current'); await flush()
        expect(publish).toHaveBeenCalledExactlyOnceWith('b', 'current')
        expect(progress).toHaveBeenLastCalledWith(false)
        owner.destroy()
    })
    it('does not start a paid call if readiness changes before the request microtask', async () => {
        let ready = true
        const request = vi.fn(async () => 'result')
        const owner = createSuggestionRequestOwner({ capture: () => 'a', current: () => ready,
            request, publish: vi.fn(), progress: vi.fn() })
        owner.schedule()
        queueMicrotask(() => { ready = false })
        await flush()
        expect(request).not.toHaveBeenCalled()
        owner.destroy()
    })
    it('clears owned progress on rejected requests and does not retry without a new signal', async () => {
        const progress = vi.fn(), request = vi.fn(async () => { throw new Error('offline') })
        const owner = createSuggestionRequestOwner({ capture: () => 'a', current: () => true,
            request, publish: vi.fn(), progress })
        owner.schedule(); await flush()
        expect(request).toHaveBeenCalledTimes(1)
        expect(progress).toHaveBeenLastCalledWith(false)
        owner.destroy()
    })
})
