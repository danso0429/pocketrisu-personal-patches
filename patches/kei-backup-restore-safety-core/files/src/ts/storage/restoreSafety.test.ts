import { describe, expect, it } from 'vitest'
import {
    acknowledgedRestoreOptions,
    FRESH_SNAPSHOT_REQUIRED_CODE,
    isFreshSnapshotRequiredError,
    localRestoreSourceHeaders,
    restoreErrorFromPayload,
    restoreSafetyHeaders,
    restoreWithoutFreshSnapshotPrompt,
} from './restoreSafety'

describe('restore safety client protocol', () => {
    it('sends a bypass only with the server-issued confirmation token', () => {
        expect(restoreSafetyHeaders()).toEqual({})
        expect(restoreSafetyHeaders({ allowWithoutFreshSnapshot: false })).toEqual({})
        expect(() => restoreSafetyHeaders({ allowWithoutFreshSnapshot: true })).toThrow(
            'confirmation token',
        )
        expect(restoreSafetyHeaders({
            allowWithoutFreshSnapshot: true,
            confirmationToken: 'confirmation-1',
        })).toEqual({
            'x-risu-restore-without-fresh-snapshot': '1',
            'x-risu-restore-confirmation': 'confirmation-1',
        })

        const file = Object.assign(new Blob(['abc']), { lastModified: 1234 })
        expect(localRestoreSourceHeaders(file)).toEqual({
            'x-risu-restore-source-id': '3:1234',
        })
    })

    it('recognizes only the structured fresh-snapshot code', () => {
        const safety = restoreErrorFromPayload({
            code: FRESH_SNAPSHOT_REQUIRED_CODE,
            message: 'snapshot failed',
            confirmationToken: 'confirmation-2',
        }, 'fallback')
        expect(isFreshSnapshotRequiredError(safety)).toBe(true)
        expect(restoreWithoutFreshSnapshotPrompt(safety)).toContain('snapshot failed')
        expect(acknowledgedRestoreOptions(safety as any)).toEqual({
            allowWithoutFreshSnapshot: true,
            confirmationToken: 'confirmation-2',
        })

        const missingToken = restoreErrorFromPayload({
            code: FRESH_SNAPSHOT_REQUIRED_CODE,
            message: 'unsafe old response',
        }, 'fallback')
        expect(isFreshSnapshotRequiredError(missingToken)).toBe(false)

        const unrelated = restoreErrorFromPayload({
            code: 'another_import',
            error: 'busy',
        }, 'fallback')
        expect(unrelated.message).toBe('busy')
        expect(isFreshSnapshotRequiredError(unrelated)).toBe(false)
    })
})
