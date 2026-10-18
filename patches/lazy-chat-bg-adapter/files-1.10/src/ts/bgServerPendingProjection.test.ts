import { describe, expect, it } from 'vitest'
import { parseServerPendingInputs } from './bgServerPendingProjection'

describe('server pending input projection', () => {
    it('keeps server order and excludes active raw user text from UI state', () => {
        const attachedRevision = 'a'.repeat(64)
        const inputReceiptId = 'b'.repeat(64)
        expect(parseServerPendingInputs({
            found: true,
            pendingInputCommands: [
                { operationId: 'second', admissionSeq: 2, state: 'waiting_predecessor', rawText: 'private' },
                { operationId: 'first', admissionSeq: 1, state: 'generating', rawText: 'private',
                    attachedRevision, inputReceiptId },
            ],
        })).toEqual([
            { operationId: 'first', admissionSeq: 1, state: 'generating',
                attachedRevision, inputReceiptId },
            { operationId: 'second', admissionSeq: 2, state: 'waiting_predecessor' },
        ])
    })

    it('exposes only a blocked draft with its exact retry identity', () => {
        expect(parseServerPendingInputs({
            found: true,
            pendingInputCommands: [{
                operationId: 'blocked-1', admissionSeq: 1, state: 'blocked_edit',
                retryAllowed: true,
                rawText: 'preserved draft', inputCommandId: 'draft-shared-1',
            }],
        })).toEqual([{
            operationId: 'blocked-1', admissionSeq: 1, state: 'blocked_edit',
            retryAllowed: true,
            rawText: 'preserved draft', inputCommandId: 'draft-shared-1',
        }])
    })

    it.each(['blocked_edit', 'execution_unknown'] as const)(
        'copies cancelAllowed for actionable %s rows', state => {
            const row = { operationId: `cancel-${state}`, admissionSeq: 1, state, cancelAllowed: true,
                ...(state === 'blocked_edit' ? { rawText: 'preserved', inputCommandId: 'draft-cancel-1' } : {}) }
            expect(parseServerPendingInputs({ found: true, pendingInputCommands: [row] })[0])
                .toMatchObject({ operationId: row.operationId, cancelAllowed: true })
        },
    )

    it('does not copy cancelAllowed to active rows and rejects non-boolean values', () => {
        expect(parseServerPendingInputs({ found: true, pendingInputCommands: [
            { operationId: 'active-cancel', admissionSeq: 1, state: 'queued', cancelAllowed: true },
        ] })[0]).not.toHaveProperty('cancelAllowed')
        expect(() => parseServerPendingInputs({ found: true, pendingInputCommands: [
            { operationId: 'bad-cancel', admissionSeq: 1, state: 'execution_unknown', cancelAllowed: 'yes' },
        ] })).toThrow('server pending input row is invalid')
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
            [{ operationId: 'bad', admissionSeq: 1, state: 'attached', attachedRevision: 'short' }],
        ]) {
            expect(() => parseServerPendingInputs({ found: true, pendingInputCommands: rows }))
                .toThrow('server pending input row is invalid')
        }
    })
})
