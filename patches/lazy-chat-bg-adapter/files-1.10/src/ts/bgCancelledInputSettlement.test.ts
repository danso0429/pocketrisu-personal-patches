import { expect, it, vi } from 'vitest'
import { settleCancelledInput, parseCancelledInputProof } from './bgCancelledInputSettlement'
import { orchestrationChatRevision } from './bgOrchestrationMerge'
import { advanceServerInputMarkerRevisions, clearServerInputMarker, readServerInputMarker,
    SERVER_INPUT_MARKER_PREFIX, writeServerInputMarker } from './bgServerInputLedger'
const hash = 'a'.repeat(64)
const prior = { id: 'chat', message: [{ chatId: 'prior', role: 'char', data: 'prior' }] }
const attached = { id: 'chat', message: [...prior.message, { chatId: 'owned-input', role: 'user', data: 'raw' }] }
const marker = { operationId: 'operation-one', charId: 'character', chatId: 'chat', state: 'accepted' as const,
    createdAt: Date.now(), localRevision: orchestrationChatRevision(prior), baseRevision: hash }
const proof = { contractVersion: 'bg_cancelled_input_proof.v1', operationId: marker.operationId,
    charId: marker.charId, chatId: marker.chatId, userMessageId: 'owned-input', attachment: 'attached',
    inputReceiptId: hash, attachedRevision: hash, currentRevision: hash, allowEditedInput: true }
function setup() {
    let local: any = structuredClone(attached), current: any = { ...marker }
    const options = { marker, readProof: vi.fn().mockResolvedValue(proof),
        readCanonical: vi.fn().mockResolvedValue({ chat: attached, revision: hash }),
        readLocal: () => local, readMarker: () => current, isCurrent: () => true,
        savedBaseView: () => marker.localRevision, hasUnconfirmedWrite: () => false,
        adopt: vi.fn().mockImplementation(async () => {
            local = structuredClone(attached); current = { ...current, localRevision: orchestrationChatRevision(local) }; return true
        }), clear: vi.fn() }
    return { options, setLocal: (value: any) => { local = value }, setMarker: (value: any) => { current = value } }
}
it('settles a proven cancelled attached input without replacing local edits', async () => {
    const h = setup(); h.setLocal({ ...structuredClone(attached), message: [prior.message[0], { ...attached.message[1], data: 'user edit' }] })
    expect(await settleCancelledInput(h.options)).toBe(true)
    expect(h.options.clear).toHaveBeenCalledTimes(1); expect(h.options.adopt).not.toHaveBeenCalled()
    expect(h.options.readLocal().message[1].data).toBe('user edit')
})
it('hydrates only an unchanged saved admission base before clearing metadata', async () => {
    const h = setup(); h.setLocal(structuredClone(prior))
    expect(await settleCancelledInput(h.options)).toBe(true)
    expect(h.options.adopt).toHaveBeenCalledWith(hash, marker.localRevision)
    expect(h.options.readLocal()).toEqual(attached)
})
it('advances a waiting peer marker and clears all exact legacy aliases after adoption', async () => {
    const values = new Map<string, string>()
    const storage = { get length() { return values.size }, key: (index: number) => [...values.keys()][index] ?? null,
        getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) },
        removeItem: (key: string) => { values.delete(key) } }
    writeServerInputMarker(storage, marker)
    writeServerInputMarker(storage, { ...marker, operationId: 'operation-two' })
    values.set('bg-server-input-v2:' + marker.operationId, JSON.stringify(marker))
    values.set('bg-server-input-v1:' + marker.operationId, JSON.stringify(marker))
    const h = setup(); h.setLocal(structuredClone(prior))
    h.options.readMarker = () => readServerInputMarker(storage, marker.operationId)
    h.options.adopt.mockImplementation(async () => {
        h.setLocal(structuredClone(attached))
        advanceServerInputMarkerRevisions(storage, marker.charId, marker.chatId,
            marker.localRevision, orchestrationChatRevision(attached))
        return true
    })
    h.options.clear.mockImplementation(() => clearServerInputMarker(storage, marker.operationId))
    expect(await settleCancelledInput(h.options)).toBe(true)
    expect(readServerInputMarker(storage, marker.operationId)).toBeNull()
    expect(values.has(SERVER_INPUT_MARKER_PREFIX + 'operation-two')).toBe(true)
    expect(readServerInputMarker(storage, 'operation-two')?.localRevision).toBe(orchestrationChatRevision(attached))
    expect(values.has('bg-server-input-v2:' + marker.operationId)).toBe(false)
    expect(values.has('bg-server-input-v1:' + marker.operationId)).toBe(false)
})
it('settles a never-started cancelled input only when full current views agree', async () => {
    const h = setup(); h.setLocal(structuredClone(prior))
    h.options.readCanonical.mockResolvedValue({ chat: prior, revision: hash })
    h.options.readProof.mockResolvedValue({ ...proof, attachment: 'none', inputReceiptId: null,
        attachedRevision: null, allowEditedInput: false })
    expect(await settleCancelledInput(h.options)).toBe(true)
    h.setLocal({ ...prior, message: [...prior.message, { role: 'user', chatId: 'other', data: 'edit' }] })
    h.options.clear.mockClear(); expect(await settleCancelledInput(h.options)).toBe(false)
    expect(h.options.clear).not.toHaveBeenCalled()
})
it('clears an unknown-transform marker from authoritative none proof without adopting a chat', async () => {
    const h = setup(); h.setLocal(structuredClone(prior))
    h.options.readCanonical.mockResolvedValue({ chat: prior, revision: hash })
    h.options.readProof.mockResolvedValue({ ...proof, attachment: 'none', inputReceiptId: null,
        attachedRevision: null, allowEditedInput: false })
    expect(await settleCancelledInput(h.options)).toBe(true)
    expect(h.options.clear).toHaveBeenCalledTimes(1)
    expect(h.options.adopt).not.toHaveBeenCalled()
})
for (const invalid of [{ operationId: 'other' }, { charId: 'other' }, { chatId: 'other' },
    { contractVersion: 'unknown' }, { inputReceiptId: 'bad' }, { attachment: 'unknown' }]) {
    it('retains metadata on mismatched proof ' + JSON.stringify(invalid), async () => {
        const h = setup(); h.options.readProof.mockResolvedValue({ ...proof, ...invalid })
        expect(await settleCancelledInput(h.options)).toBe(false); expect(h.options.clear).not.toHaveBeenCalled()
    })
}
for (const condition of ['edited-base', 'adopted-then-deleted', 'unconfirmed-write', 'duplicate-id', 'uncertain']) {
    it('does not restore or clear an unsafe ' + condition, async () => {
        const h = setup(); h.setLocal(structuredClone(prior))
        if (condition === 'edited-base') h.setLocal({ ...prior, note: 'user edit' })
        if (condition === 'adopted-then-deleted') h.options.marker = { ...marker, adoptedRevision: hash } as any
        if (condition === 'unconfirmed-write') h.options.hasUnconfirmedWrite = () => true
        if (condition === 'duplicate-id') h.setLocal({ ...attached, message: [...attached.message, { chatId: 'owned-input', role: 'char', data: 'duplicate' }] })
        if (condition === 'uncertain') h.options.marker = { ...marker, state: 'uncertain' } as any
        expect(await settleCancelledInput(h.options)).toBe(false); expect(h.options.clear).not.toHaveBeenCalled()
    })
}
it('rejects changed terminal proof, selection or marker identity before cleanup', async () => {
    for (const condition of ['state', 'selection', 'marker']) {
        const h = setup(); let reads = 0
        h.options.readProof.mockImplementation(async () => {
            if (++reads === 2) {
                if (condition === 'state') return null
                if (condition === 'selection') h.options.isCurrent = () => false
                if (condition === 'marker') h.setMarker({ ...marker, createdAt: marker.createdAt + 1 })
            }
            return proof
        })
        expect(await settleCancelledInput(h.options)).toBe(false); expect(h.options.clear).not.toHaveBeenCalled()
    }
})
it('reports storage failure as unconfirmed without a model fallback', async () => {
    const h = setup(); h.options.clear.mockImplementation(() => { throw Error('storage unavailable') })
    expect(await settleCancelledInput(h.options)).toBe(false)
    expect(parseCancelledInputProof({ ...proof, attachment: 'none' }, marker)).toBeNull()
})
