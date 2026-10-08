import { beforeEach, describe, expect, it, vi } from 'vitest'
import { get } from 'svelte/store'
import { createGenerationBusyCoordinator, setServerGenerationBusy } from './generationBusy'
import { chatProcessStage, generationStates, doingChat, startGeneration, endGeneration,
    runDirectGenerationLifecycle } from './process/generationState'

beforeEach(() => { generationStates.set(new Map()); doingChat.set(false); chatProcessStage.set(0) })
describe('operation generation ownership', () => {
    it.each([false, true])('releases an explicitly owned generation starting after await (throws=%s)', async throws => {
        const finish = vi.fn()
        const run = runDirectGenerationLifecycle('chat', async lifecycleId => {
            await Promise.resolve()
            startGeneration('chat', 'late', 'live', lifecycleId)
            if (throws) throw new Error('late failure')
        }, finish)
        if (throws) await expect(run).rejects.toThrow('late failure')
        else await run
        expect(get(generationStates).size).toBe(0)
        expect(get(doingChat)).toBe(false)
        expect(finish).toHaveBeenCalledTimes(1)
    })
    it('releases the same direct lifecycle after native auto-continue changes its generation ID', async () => {
        const finish = vi.fn()
        await runDirectGenerationLifecycle('chat', async () => {
            startGeneration('chat', 'first')
            await Promise.resolve()
            endGeneration('chat', { keepPendingAbort: true })
            startGeneration('chat', 'continuation')
            await Promise.resolve()
        }, finish)
        expect(get(generationStates).has('chat')).toBe(false)
        expect(get(doingChat)).toBe(false)
        expect(finish).toHaveBeenCalledTimes(1)
    })
    it('refuses a stale server release and fallback handoff, including ownerless legacy calls', () => {
        const state = createGenerationBusyCoordinator()
        state.setServerBusy(true, 'new')
        expect(state.setServerBusy(false, 'old')).toBe(false)
        expect(state.setServerBusy(false)).toBe(false)
        expect(state.handoffServerToClient('old')).toBe(false)
        expect(get(state.doingChat)).toBe(true)
        expect(state.setServerBusy(false, 'new')).toBe(true)
        expect(get(state.doingChat)).toBe(false)
    })
    it('an old direct finally preserves a replacement client owner and stage', async () => {
        let release!: () => void
        const finish = vi.fn()
        const pending = runDirectGenerationLifecycle('chat', async () => {
            startGeneration('chat', 'old')
            await new Promise<void>(resolve => { release = resolve })
        }, finish)
        startGeneration('chat', 'new')
        chatProcessStage.set(3)
        release(); await pending
        expect(get(generationStates).get('chat')?.generationId).toBe('new')
        expect(get(chatProcessStage)).toBe(3)
        expect(finish).not.toHaveBeenCalled()
    })
    it('a direct finally does not reset a detached server generation stage', async () => {
        const finish = vi.fn()
        try {
            await runDirectGenerationLifecycle('chat', async () => {
                startGeneration('chat', 'client')
                setServerGenerationBusy(true, 'server')
                chatProcessStage.set(2)
            }, finish)
            expect(get(doingChat)).toBe(true)
            expect(get(chatProcessStage)).toBe(2)
            expect(finish).toHaveBeenCalledTimes(1)
        } finally { setServerGenerationBusy(false, 'server') }
    })
})
