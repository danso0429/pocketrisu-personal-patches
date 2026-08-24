import { describe, expect, test } from 'vitest'
import {
    preserveCommittedImport,
    requireCommittedImport,
    type BackgroundImportEntityCoordinate,
} from './backgroundImportReconcile'

const moduleCoordinate: BackgroundImportEntityCoordinate = {
    kind: 'module', entityId: 'server-module', committedRevision: 'revision-1',
}
const characterCoordinate: BackgroundImportEntityCoordinate = {
    kind: 'character', entityId: 'server-character', committedRevision: 'revision-2',
}

describe('background import reconciliation invariant', () => {
    test('restores a remote module lost by positional fallback without dropping local edits', () => {
        const base = { modules: [null, { id: 'old', name: 'Old' }] }
        const local = { modules: [null, { id: 'old', name: 'Locally edited' }] }
        const latest = { modules: [null, { id: 'old', name: 'Old' }, { id: 'server-module', name: 'Imported' }] }
        const merged = structuredClone(local)
        preserveCommittedImport({ base, local, latest, merged, coordinate: moduleCoordinate })
        expect(merged.modules).toEqual([
            null,
            { id: 'old', name: 'Locally edited' },
            { id: 'server-module', name: 'Imported' },
        ])
        expect(requireCommittedImport(merged, moduleCoordinate)).toMatchObject({ name: 'Imported' })
    })

    test('restores a canonical character and its order membership', () => {
        const canonical = {
            chaId: 'server-character', name: 'Imported',
            chats: [{ id: 'chat-1', _stub: true, name: 'Chat 1' }],
        }
        const base = { characters: [], characterOrder: [] }
        const local = { characters: [], characterOrder: [] }
        const latest = { characters: [canonical], characterOrder: ['server-character'] }
        const merged: any = { characters: [], characterOrder: [] }
        preserveCommittedImport({ base, local, latest, merged, coordinate: characterCoordinate })
        expect(merged.characters).toEqual([canonical])
        expect(merged.characterOrder).toEqual(['server-character'])
    })

    test('local collision and canonical duplicate fail without mutating the merge', () => {
        const latest = { modules: [{ id: 'server-module', name: 'Canonical' }] }
        const local = { modules: [{ id: 'server-module', name: 'Local collision' }] }
        const merged = structuredClone(local)
        expect(() => preserveCommittedImport({
            base: { modules: [] }, local, latest, merged, coordinate: moduleCoordinate,
        })).toThrow(/local entity already uses/)
        expect(merged).toEqual(local)

        expect(() => preserveCommittedImport({
            base: { modules: [] },
            local: { modules: [] },
            latest: { modules: [latest.modules[0], structuredClone(latest.modules[0])] },
            merged: { modules: [] },
            coordinate: moduleCoordinate,
        })).toThrow(/missing or duplicated/)
    })

    test('invalid character order refuses instead of overwriting it', () => {
        const latest = { characters: [{ chaId: 'server-character' }] }
        expect(() => preserveCommittedImport({
            base: { characters: [] },
            local: { characters: [] },
            latest,
            merged: { characters: [], characterOrder: { invalid: true } },
            coordinate: characterCoordinate,
        })).toThrow(/Character order is invalid/)
    })
})
