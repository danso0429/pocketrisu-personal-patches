import { get } from 'svelte/store'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const toast = vi.hoisted(() => ({
    custom: vi.fn(),
    warning: vi.fn(),
    dismiss: vi.fn(),
}))

vi.mock('svelte-sonner', () => ({ toast }))

import {
    allowDuringCharacterImport,
    beginCharacterImport,
    formatCharacterImportProgress,
    isCharacterImportActive,
} from './characterImportState'

describe('character import job', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.clearAllMocks()
        if (isCharacterImportActive()) {
            throw new Error('A previous character import test leaked its active lease')
        }
    })

    afterEach(() => {
        vi.runOnlyPendingTimers()
        vi.useRealTimers()
    })

    test('creates one custom toast and updates only its reactive status', () => {
        const job = beginCharacterImport()
        expect(job).not.toBeNull()
        expect(isCharacterImportActive()).toBe(true)
        expect(toast.custom).toHaveBeenCalledTimes(1)
        const options = toast.custom.mock.calls[0][1]
        const status = options.componentProps.status
        expect(options.id).toMatch(/^character-import:progress:\d+$/)
        expect(options.duration).toBe(Number.POSITIVE_INFINITY)
        expect(get(status)).toEqual({
            phase: 'loading',
            message: 'Reading character file...',
        })

        job!.update('Saving assets...', '2 assets')
        expect(toast.custom).toHaveBeenCalledTimes(1)
        expect(get(status)).toEqual({
            phase: 'loading',
            message: 'Saving assets...',
            description: '2 assets',
        })

        job!.succeed('Imported')
        expect(isCharacterImportActive()).toBe(false)
        expect(toast.custom).toHaveBeenCalledTimes(1)
        expect(get(status)).toEqual({
            phase: 'success',
            message: 'Imported',
            description: undefined,
        })
        vi.advanceTimersByTime(4_000)
        expect(toast.dismiss).toHaveBeenCalledWith(options.id)
    })

    test('refuses a second import and database-replacing actions', () => {
        const job = beginCharacterImport()
        const toastId = toast.custom.mock.calls[0][1].id
        expect(beginCharacterImport()).toBeNull()
        expect(allowDuringCharacterImport('Backup restore')).toBe(false)
        expect(toast.warning).toHaveBeenCalled()

        job!.dismiss()
        expect(allowDuringCharacterImport('Backup restore')).toBe(true)
        expect(toast.dismiss).toHaveBeenCalledWith(toastId)
    })

    test('releases the lease when the custom toast cannot be mounted', () => {
        const addListener = vi.spyOn(window, 'addEventListener')
        const removeListener = vi.spyOn(window, 'removeEventListener')
        toast.custom.mockImplementationOnce(() => {
            throw new Error('toast mount failed')
        })

        expect(() => beginCharacterImport()).toThrow('toast mount failed')
        expect(isCharacterImportActive()).toBe(false)
        expect(addListener).toHaveBeenCalledWith('beforeunload', expect.any(Function))
        expect(removeListener).toHaveBeenCalledWith('beforeunload', expect.any(Function))

        addListener.mockRestore()
        removeListener.mockRestore()
    })

    test('keeps the lease until failure and reports a normalized reason', () => {
        const job = beginCharacterImport()
        const options = toast.custom.mock.calls[0][1]
        const status = options.componentProps.status
        job!.fail(new Error('broken archive'))

        expect(isCharacterImportActive()).toBe(false)
        expect(toast.custom).toHaveBeenCalledTimes(1)
        expect(get(status)).toEqual({
            phase: 'error',
            message: 'Character import failed.',
            description: 'broken archive',
        })
        vi.advanceTimersByTime(8_000)
        expect(toast.dismiss).toHaveBeenCalledWith(options.id)
    })

    test('guards page unload only while the import lease is active', () => {
        const addListener = vi.spyOn(window, 'addEventListener')
        const removeListener = vi.spyOn(window, 'removeEventListener')
        const job = beginCharacterImport()

        expect(addListener).toHaveBeenCalledWith('beforeunload', expect.any(Function))
        const activeUnload = new Event('beforeunload', { cancelable: true })
        window.dispatchEvent(activeUnload)
        expect(activeUnload.defaultPrevented).toBe(true)

        job!.dismiss()
        expect(removeListener).toHaveBeenCalledWith('beforeunload', expect.any(Function))
        const releasedUnload = new Event('beforeunload', { cancelable: true })
        window.dispatchEvent(releasedUnload)
        expect(releasedUnload.defaultPrevented).toBe(false)

        addListener.mockRestore()
        removeListener.mockRestore()
    })

    test('formats stable-width known and streaming asset counters', () => {
        expect(formatCharacterImportProgress('Saving assets...', 2, 14))
            .toBe('Saving assets... (002/014)')
        expect(formatCharacterImportProgress('Saving assets...', 7))
            .toBe('Saving assets... (007/???)')
        expect(formatCharacterImportProgress('Saving assets...', 1234, 1500))
            .toBe('Saving assets... (1234/1500)')
    })
})
