import { get } from 'svelte/store'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const toast = vi.hoisted(() => ({ custom: vi.fn(), warning: vi.fn(), dismiss: vi.fn() }))
vi.mock('svelte-sonner', () => ({ toast }))

import {
    allowDuringImport,
    beginCharacterImport,
    beginModuleImport,
    formatImportProgress,
    isImportActive,
    reserveImport,
} from './characterImportState'

describe('shared character/module import owner', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.clearAllMocks()
        if (isImportActive()) throw new Error('A previous import test leaked its active lease')
    })

    afterEach(() => {
        vi.runOnlyPendingTimers()
        vi.useRealTimers()
    })

    test('silent reservation promotes the same token to one reactive toast', () => {
        const reservation = reserveImport('module')
        expect(reservation).not.toBeNull()
        expect(isImportActive()).toBe(true)
        expect(toast.custom).not.toHaveBeenCalled()

        const job = reservation!.activate('Reading module file...')
        expect(job).not.toBeNull()
        expect(toast.custom).toHaveBeenCalledTimes(1)
        const options = toast.custom.mock.calls[0][1]
        const status = options.componentProps.status
        expect(options.id).toMatch(/^import:progress:\d+$/)
        expect(get(status)).toEqual({ phase: 'loading', message: 'Reading module file...' })

        job!.update('Saving module assets...', '2 assets')
        expect(get(status)).toEqual({
            phase: 'loading',
            message: 'Saving module assets...',
            description: '2 assets',
        })
        job!.succeed('Imported')
        expect(isImportActive()).toBe(false)
        expect(get(status)).toEqual({ phase: 'success', message: 'Imported', description: undefined })
        vi.advanceTimersByTime(4_000)
        expect(toast.dismiss).toHaveBeenCalledWith(options.id)
    })

    test('picker cancellation releases silently without mounting a toast', () => {
        const reservation = reserveImport('module')!
        reservation.cancel()
        expect(isImportActive()).toBe(false)
        expect(toast.custom).not.toHaveBeenCalled()
        expect(toast.dismiss).not.toHaveBeenCalled()
    })

    test('character and module jobs mutually exclude every acquisition order', () => {
        const character = beginCharacterImport()!
        expect(beginModuleImport()).toBeNull()
        character.dismiss()

        const module = beginModuleImport()!
        expect(beginCharacterImport()).toBeNull()
        expect(beginModuleImport()).toBeNull()
        expect(allowDuringImport('Backup restore')).toBe(false)
        module.dismiss()
        expect(allowDuringImport('Backup restore')).toBe(true)
    })

    test('mount failure and stale terminal calls cannot leak or release a newer job', () => {
        toast.custom.mockImplementationOnce(() => { throw new Error('toast mount failed') })
        expect(() => beginModuleImport()).toThrow('toast mount failed')
        expect(isImportActive()).toBe(false)

        const first = beginCharacterImport()!
        first.dismiss()
        const second = beginModuleImport()!
        first.fail(new Error('stale'))
        expect(isImportActive()).toBe(true)
        second.fail(new Error('module broken'))
        expect(isImportActive()).toBe(false)
    })

    test('visual dismissal does not release the active token', () => {
        const job = beginModuleImport()!
        const toastId = toast.custom.mock.calls[0][1].id
        toast.dismiss(toastId)
        expect(isImportActive()).toBe(true)
        job.dismiss()
        expect(isImportActive()).toBe(false)
    })

    test('guards page unload from reservation through terminal settlement', () => {
        const reservation = reserveImport('module')!
        const activeUnload = new Event('beforeunload', { cancelable: true })
        window.dispatchEvent(activeUnload)
        expect(activeUnload.defaultPrevented).toBe(true)
        const job = reservation.activate('Reading')!
        job.dismiss()
        const releasedUnload = new Event('beforeunload', { cancelable: true })
        window.dispatchEvent(releasedUnload)
        expect(releasedUnload.defaultPrevented).toBe(false)
    })

    test('formats stable-width known and streaming counters', () => {
        expect(formatImportProgress('Saving assets...', 2, 14)).toBe('Saving assets... (002/014)')
        expect(formatImportProgress('Saving assets...', 7)).toBe('Saving assets... (007/???)')
        expect(formatImportProgress('Saving assets...', 1234, 1500)).toBe('Saving assets... (1234/1500)')
    })
})
