import { describe, expect, it } from 'vitest'
import {
    advanceServerInputMarkerRevisions,
    clearServerInputMarker,
    readServerInputMarkers,
    SERVER_INPUT_MARKER_MAX_ENTRIES,
    SERVER_INPUT_MARKER_PREFIX,
    updateServerInputMarker,
    writeServerInputMarker,
} from './bgServerInputLedger'

function storage() {
    const values = new Map<string, string>()
    return {
        get length() { return values.size },
        key(index: number) { return [...values.keys()][index] ?? null },
        getItem(key: string) { return values.get(key) ?? null },
        setItem(key: string, value: string) { values.set(key, value) },
        removeItem(key: string) { values.delete(key) },
        values,
    }
}

function marker(operationId: string, createdAt = 1000) {
    return {
        operationId, charId: 'char-1', chatId: 'chat-1',
        localRevision: 'a'.repeat(64), baseRevision: 'b'.repeat(64),
        state: 'uncertain' as const, createdAt,
    }
}

describe('server input operation marker', () => {
    it('stores no prompt text and updates only the exact operation', () => {
        const state = storage()
        writeServerInputMarker(state, marker('operation-1'))
        expect(state.getItem(SERVER_INPUT_MARKER_PREFIX + 'operation-1')).not.toContain('rawText')
        expect(updateServerInputMarker(state, 'operation-1', value => ({
            ...value, state: 'accepted',
        }))).toBe(true)
        expect(readServerInputMarkers(state, 1000)).toMatchObject([{
            operationId: 'operation-1', state: 'accepted',
        }])
        clearServerInputMarker(state, 'operation-1')
        expect(readServerInputMarkers(state, 1000)).toEqual([])
    })

    it('removes malformed or expired rows without treating them as accepted', () => {
        const state = storage()
        state.setItem(SERVER_INPUT_MARKER_PREFIX + 'bad', '{')
        state.setItem(SERVER_INPUT_MARKER_PREFIX + 'prompt', JSON.stringify({
            ...marker('prompt'), rawText: 'do not persist',
        }))
        writeServerInputMarker(state, marker('old'))
        expect(readServerInputMarkers(state, 50 * 60 * 60 * 1000)).toEqual([])
        expect(state.length).toBe(0)
    })

    it('retains the active marker at the bounded capacity', () => {
        const state = storage()
        for (let index = 0; index <= SERVER_INPUT_MARKER_MAX_ENTRIES; index += 1) {
            writeServerInputMarker(state, marker(`operation-${index}`, 1000 + index))
        }
        const rows = readServerInputMarkers(state, 1200)
        expect(rows).toHaveLength(SERVER_INPUT_MARKER_MAX_ENTRIES)
        expect(rows.some(value => value.operationId === `operation-${SERVER_INPUT_MARKER_MAX_ENTRIES}`))
            .toBe(true)
    })

    it('advances only accepted markers of the same chat after a verified adoption', () => {
        const state = storage()
        writeServerInputMarker(state, { ...marker('n'), state: 'accepted' })
        writeServerInputMarker(state, { ...marker('n1', 1001), state: 'accepted' })
        writeServerInputMarker(state, { ...marker('uncertain', 1002), state: 'uncertain' })
        writeServerInputMarker(state, {
            ...marker('other', 1003), state: 'accepted', chatId: 'other-chat',
        })
        expect(advanceServerInputMarkerRevisions(
            state, 'char-1', 'chat-1', 'a'.repeat(64), 'c'.repeat(64), 1003,
        )).toBe(2)
        const rows = readServerInputMarkers(state, 1003)
        expect(rows.filter(row => row.localRevision === 'c'.repeat(64))).toHaveLength(2)
        expect(rows.find(row => row.operationId === 'uncertain')?.localRevision).toBe('a'.repeat(64))
        expect(rows.find(row => row.operationId === 'other')?.localRevision).toBe('a'.repeat(64))
    })
})
