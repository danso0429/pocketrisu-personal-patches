import { describe, expect, it } from 'vitest'
import {
    createTranslationTaskController,
    isTranslationAbortError,
    raceTranslationAbort,
    throwIfTranslationAborted,
    waitForTranslationDelay,
} from './translationTask'

describe('translation task controller', () => {
    it('aborts and invalidates the previous task when a new render begins', () => {
        const controller = createTranslationTaskController()
        const first = controller.begin()
        const second = controller.begin()

        expect(controller.hasCurrent()).toBe(true)
        expect(first.signal.aborted).toBe(true)
        expect(first.isCurrent()).toBe(false)
        expect(first.isLatest()).toBe(false)
        expect(second.signal.aborted).toBe(false)
        expect(second.isCurrent()).toBe(true)
        expect(second.isLatest()).toBe(true)
    })

    it('finishes only the task that still owns the controller', () => {
        const controller = createTranslationTaskController()
        const first = controller.begin()
        const second = controller.begin()

        first.finish()
        expect(second.isCurrent()).toBe(true)

        second.finish()
        expect(second.isCurrent()).toBe(false)
        expect(second.isLatest()).toBe(true)
        expect(controller.hasCurrent()).toBe(false)
    })

    it('aborts the current task on dispose and rejects later work', () => {
        const controller = createTranslationTaskController()
        const task = controller.begin()

        controller.dispose()

        expect(task.signal.aborted).toBe(true)
        expect(task.isCurrent()).toBe(false)
        expect(task.isLatest()).toBe(false)
        expect(() => controller.begin()).toThrow('disposed')
    })

    it('recognizes a cancelled signal without depending on throwIfAborted support', () => {
        const controller = new AbortController()
        controller.abort()

        let caught: unknown
        try {
            throwIfTranslationAborted(controller.signal)
        }
        catch (error) {
            caught = error
        }

        expect(isTranslationAbortError(caught)).toBe(true)
    })

    it('normalizes an arbitrary abort reason without enabling translation retries', () => {
        const controller = new AbortController()
        const reason = new Error('superseded')
        controller.abort(reason)

        let caught: unknown
        try {
            throwIfTranslationAborted(controller.signal)
        }
        catch (error) {
            caught = error
        }

        expect(caught).toMatchObject({
            name: 'AbortError',
            message: 'superseded',
            cause: reason,
        })
        expect(isTranslationAbortError(caught)).toBe(true)
    })

    it('rejects an uncancellable provider promise promptly when its owner aborts', async () => {
        const controller = new AbortController()
        const provider = new Promise<string>(() => {})
        const raced = raceTranslationAbort(provider, controller.signal)

        controller.abort()

        await expect(raced).rejects.toMatchObject({ name: 'AbortError' })
    })

    it('cancels a translation throttle delay', async () => {
        const controller = new AbortController()
        const delayed = waitForTranslationDelay(10_000, controller.signal)

        controller.abort()

        await expect(delayed).rejects.toMatchObject({ name: 'AbortError' })
    })
})
