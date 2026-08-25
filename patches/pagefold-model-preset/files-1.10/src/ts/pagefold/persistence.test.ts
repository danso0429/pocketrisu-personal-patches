import { describe, expect, it } from 'vitest'
import { applyModelPresetDefaults } from 'src/ts/preset/dbDefaults'
import { applyProfileSnapshotUpdate } from 'src/ts/preset/profileUpdate'
import type { ModelPreset } from 'src/ts/preset/types'
import { PAGEFOLD_QUALIFIED_ROUTE } from './qualifiedRoute'

function preset(pageFold?: unknown): ModelPreset {
    return {
        id: 'p', name: 'p', userValues: {}, createdAt: 1, updatedAt: 2,
        ...(pageFold === undefined ? {} : { pageFold: pageFold as ModelPreset['pageFold'] }),
        profileSnapshot: {
            profileId: PAGEFOLD_QUALIFIED_ROUTE.profileId, profileVersion: 1,
            providerBaseId: PAGEFOLD_QUALIFIED_ROUTE.providerBaseId, providerBaseVersion: 7,
            adapterKind: 'google-gemini', auth: { kind: 'google-service-account', fields: [] },
            endpoint: { kind: 'vertex-gemini' }, modelId: PAGEFOLD_QUALIFIED_ROUTE.requestedModel,
            schema: [{ key: 'modelId', type: 'string', label: 'Model' }],
            uiSchema: { groups: [], fields: [{ key: 'modelId', widget: 'text', visibility: 'basic', group: 'model', order: 1 }] },
            defaults: {},
        },
    }
}

describe('PageFold optional persistence lifecycle', () => {
    it('leaves old presets absent/off and preserves enabled malformed intent as blocked data', () => {
        const old = preset()
        const malformed = preset({ enabled: true, mode: 'automatic', inputPriceOverride: { usdPerMillion: 0 } })
        const db: any = { modelPresets: [old, malformed] }
        applyModelPresetDefaults(db)
        expect(old.pageFold).toBeUndefined()
        expect(malformed.pageFold).toEqual({ enabled: true })
    })

    it('normalizes only known default-binding overrides without materializing absent state', () => {
        const db: any = {
            modelPresets: [],
            defaultModelBinding: {
                main: '', sub: '', separateAux: false,
                aux: { memory: '', translate: '', emotion: '', otherAx: '' },
                pageFold: { model: 'on', memory: 'junk', otherAx: 'off', unknown: 'on' },
            },
        }
        applyModelPresetDefaults(db)
        expect(db.defaultModelBinding.pageFold).toEqual({ model: 'on', otherAx: 'off' })

        const absent: any = { modelPresets: [], defaultModelBinding: {
            main: '', sub: '', separateAux: false,
            aux: { memory: '', translate: '', emotion: '', otherAx: '' },
        } }
        applyModelPresetDefaults(absent)
        expect(absent.defaultModelBinding.pageFold).toBeUndefined()
    })

    it('preset duplicate and profile update retain config but never persist support booleans', () => {
        const original = preset({ enabled: true, mode: 'balanced' })
        const duplicate = structuredClone(original)
        duplicate.id = 'copy'
        expect(duplicate.pageFold).toEqual({ enabled: true, mode: 'balanced' })

        const nextSnapshot = structuredClone(original.profileSnapshot)
        nextSnapshot.profileVersion = 2
        const updated = applyProfileSnapshotUpdate(original, nextSnapshot, { now: () => 3 }).preset
        expect(updated.pageFold).toEqual({ enabled: true, mode: 'balanced' })
        expect(updated.pageFold).not.toHaveProperty('supported')
        expect(updated.pageFold).not.toHaveProperty('routeProfileId')
        expect(updated.pageFold).not.toHaveProperty('mediaResolution')
    })
})
