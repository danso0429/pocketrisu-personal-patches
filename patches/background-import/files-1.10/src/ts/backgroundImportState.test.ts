import { get } from 'svelte/store'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const toast = vi.hoisted(() => ({ custom: vi.fn(), warning: vi.fn(), dismiss: vi.fn() }))
vi.mock('svelte-sonner', () => ({ toast }))

import { beginModuleImport, isImportActive } from './characterImportState'

describe('background-safe import lease', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.clearAllMocks()
        if (isImportActive()) throw new Error('A previous background import test leaked its lease')
    })

    afterEach(() => {
        vi.runOnlyPendingTimers()
        vi.useRealTimers()
    })

    test('handoff removes only unload blocking while retaining the import token and toast', () => {
        const job = beginModuleImport('Uploading...')!
        const status = toast.custom.mock.calls[0][1].componentProps.status
        const blocked = new Event('beforeunload', { cancelable: true })
        window.dispatchEvent(blocked)
        expect(blocked.defaultPrevented).toBe(true)

        job.backgroundSafe('Import continues on the server', 'You may leave this page')
        const safeUnload = new Event('beforeunload', { cancelable: true })
        window.dispatchEvent(safeUnload)
        expect(safeUnload.defaultPrevented).toBe(false)
        expect(isImportActive()).toBe(true)
        expect(get(status)).toEqual({
            phase: 'loading',
            message: 'Import continues on the server',
            description: 'You may leave this page',
        })

        expect(beginModuleImport()).toBeNull()
        job.succeed('Imported')
        expect(isImportActive()).toBe(false)
    })
})
