import { beforeEach, describe, expect, it, vi } from 'vitest'
import { get } from 'svelte/store'
import {
    chatProcessStage,
    doingChat,
    endGenerationIfOwned,
    generationStates,
    runDirectGenerationLifecycle,
    setGenerationStage,
    startGeneration,
} from './generationState'

describe('direct sendChat generation lifecycle', () => {
    beforeEach(() => {
        generationStates.set(new Map())
        doingChat.set(false)
        chatProcessStage.set(0)
    })

    it('releases its exact live chat while preserving another background owner', async () => {
        startGeneration('other-chat', 'background-1', 'background')
        const finish = vi.fn()

        const result = await runDirectGenerationLifecycle('direct-chat', async () => {
            startGeneration('direct-chat', 'direct-1')
            setGenerationStage('direct-chat', 4)
            expect(get(doingChat)).toBe(true)
            return true
        }, finish)

        expect(result).toBe(true)
        expect(finish).toHaveBeenCalledTimes(1)
        expect(get(generationStates).has('direct-chat')).toBe(false)
        expect(get(generationStates).get('other-chat')?.generationId).toBe('background-1')
        expect(get(doingChat)).toBe(false)
        expect(get(chatProcessStage)).toBe(0)
    })

    it('runs terminal cleanup after a rejected direct generation', async () => {
        const finish = vi.fn()

        await expect(runDirectGenerationLifecycle('direct-chat', async () => {
            startGeneration('direct-chat', 'direct-2')
            setGenerationStage('direct-chat', 3)
            throw new Error('provider failed')
        }, finish)).rejects.toThrow('provider failed')

        expect(finish).toHaveBeenCalledTimes(1)
        expect(get(generationStates).has('direct-chat')).toBe(false)
        expect(get(doingChat)).toBe(false)
        expect(get(chatProcessStage)).toBe(0)
    })

    it('does not run or reset cleanup when that chat already has an owner', async () => {
        startGeneration('direct-chat', 'existing-1')
        setGenerationStage('direct-chat', 3)
        const run = vi.fn(async () => true)
        const finish = vi.fn()

        const result = await runDirectGenerationLifecycle('direct-chat', run, finish)

        expect(result).toBe(false)
        expect(run).not.toHaveBeenCalled()
        expect(finish).not.toHaveBeenCalled()
        expect(get(generationStates).get('direct-chat')?.generationId).toBe('existing-1')
        expect(get(doingChat)).toBe(true)
        expect(get(chatProcessStage)).toBe(3)
    })

    it('releases only the exact preparation owner during server handoff', () => {
        startGeneration('direct-chat', 'preparation-1')
        expect(get(doingChat)).toBe(true)

        expect(endGenerationIfOwned('direct-chat', 'different-owner')).toBe(false)
        expect(get(generationStates).get('direct-chat')?.generationId).toBe('preparation-1')
        expect(get(doingChat)).toBe(true)

        expect(endGenerationIfOwned('direct-chat', 'preparation-1')).toBe(true)
        expect(get(generationStates).has('direct-chat')).toBe(false)
        expect(get(doingChat)).toBe(false)
    })
})
