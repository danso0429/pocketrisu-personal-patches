import { describe, expect, it } from 'vitest'
import { parseServerPendingInputs } from './bgServerPendingProjection'

describe('server pending input projection', () => {
    it('keeps server order and excludes raw user text from UI state', () => {
        expect(parseServerPendingInputs({
            found: true,
            pendingInputCommands: [
                { operationId: 'second', admissionSeq: 2, state: 'waiting_predecessor', rawText: 'private' },
                { operationId: 'first', admissionSeq: 1, state: 'generating', rawText: 'private' },
            ],
        })).toEqual([
            { operationId: 'first', admissionSeq: 1, state: 'generating' },
            { operationId: 'second', admissionSeq: 2, state: 'waiting_predecessor' },
        ])
    })

    it('represents an empty or absent projection without inventing work', () => {
        expect(parseServerPendingInputs(null)).toEqual([])
        expect(parseServerPendingInputs({ found: true, pendingInputCommands: [] })).toEqual([])
    })

    it('rejects malformed, duplicate, or unknown state rows', () => {
        for (const rows of [
            [{ operationId: 'bad', admissionSeq: 0, state: 'queued' }],
            [{ operationId: 'bad', admissionSeq: 1, state: 'finished' }],
            [
                { operationId: 'same', admissionSeq: 1, state: 'queued' },
                { operationId: 'same', admissionSeq: 2, state: 'attached' },
            ],
        ]) {
            expect(() => parseServerPendingInputs({ found: true, pendingInputCommands: rows }))
                .toThrow('server pending input row is invalid')
        }
    })
})
