import { describe, expect, it } from 'vitest'
import { adoptAttachedServerInputs } from './bgServerInputAdoption'
import { readServerInputMarkers, writeServerInputMarker, advanceServerInputMarkerRevisions } from './bgServerInputLedger'
import { orchestrationChatRevision } from './bgOrchestrationMerge'
import type { ServerPendingInput } from './bgServerPendingProjection'

const a = 'a'.repeat(64)
const b = 'b'.repeat(64)
const c = 'c'.repeat(64)
const receipt = 'd'.repeat(64)

function fixture() {
    const values = new Map<string, string>()
    const storage = {
        get length() { return values.size },
        key(index: number) { return [...values.keys()][index] ?? null },
        getItem(key: string) { return values.get(key) ?? null },
        setItem(key: string, value: string) { values.set(key, value) },
        removeItem(key: string) { values.delete(key) },
    }
    for (const [operationId, createdAt] of [['n', 1000], ['n1', 1001]] as const) {
        writeServerInputMarker(storage, {
            operationId, charId: 'char', chatId: 'chat', localRevision: a,
            baseRevision: a, state: 'accepted', createdAt,
        })
    }
    return storage
}

function pending(operationId: string, admissionSeq: number, attachedRevision: string): ServerPendingInput {
    return { operationId, admissionSeq, state: 'generating', attachedRevision, inputReceiptId: receipt }
}

describe('server input attached chat adoption', () => {
    it('adopts N then N+1 in admission order and advances their local CAS bases', async () => {
        const storage = fixture()
        let local = a
        const calls: string[] = []
        const count = await adoptAttachedServerInputs({
            storage, charId: 'char', chatId: 'chat', now: () => 1002,
            pendingInputs: [pending('n1', 2, c), pending('n', 1, b)],
            readLocalRevision: () => local, isCurrent: () => true,
            adopt: async (revision, allowed) => {
                calls.push(`${allowed}:${revision}`)
                local = revision
                return { adopted: true, revision }
            },
        })
        expect(count).toBe(2)
        expect(calls).toEqual([`${a}:${b}`, `${b}:${c}`])
        expect(readServerInputMarkers(storage, 1002).map(row => row.localRevision)).toEqual([c, c])
    })

    it('retains markers and refuses an unrelated local edit or unattested row', async () => {
        const storage = fixture()
        const adopt = async () => { throw new Error('must not adopt') }
        expect(await adoptAttachedServerInputs({
            storage, charId: 'char', chatId: 'chat', now: () => 1002,
            pendingInputs: [pending('n', 1, b)], readLocalRevision: () => c,
            isCurrent: () => true, adopt,
        })).toBe(0)
        expect(await adoptAttachedServerInputs({
            storage, charId: 'char', chatId: 'chat', now: () => 1002,
            pendingInputs: [{ operationId: 'n', admissionSeq: 1, state: 'attached' }],
            readLocalRevision: () => a, isCurrent: () => true, adopt,
        })).toBe(0)
        expect(readServerInputMarkers(storage, 1002)).toHaveLength(2)
    })

    it('recovers an already-adopted revision without writing the chat again', async () => {
        const storage = fixture()
        const before = orchestrationChatRevision({ id: 'chat', message: [] })
        const after = orchestrationChatRevision({ id: 'chat', message: [{ role: 'user', data: 'input' }] })
        advanceServerInputMarkerRevisions(storage, 'char', 'chat', a, before, 1002)
        let local = before, calls = 0
        const options = {
            storage, charId: 'char', chatId: 'chat', now: () => 1002,
            pendingInputs: [pending('n', 1, b)], readLocalRevision: () => local,
            isCurrent: () => true, adopt: async () => {
                calls++; local = after; return { adopted: true, revision: b }
            },
        }
        expect(await adoptAttachedServerInputs(options)).toBe(1)
        expect(await adoptAttachedServerInputs(options)).toBe(0)
        expect(calls).toBe(1)
        expect(readServerInputMarkers(storage, 1002).map(row => row.localRevision)).toEqual([after, after])
        expect(readServerInputMarkers(storage, 1002).find(row => row.operationId === 'n')?.adoptedRevision).toBe(b)
    })
})
