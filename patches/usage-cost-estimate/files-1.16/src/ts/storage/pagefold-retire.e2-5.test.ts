import { describe, expect, test, vi } from 'vitest'

vi.mock('./database.svelte', () => ({}))
vi.mock('./chatStorage', () => ({ chatToStub: (value: any) => value }))
vi.mock('../globalApi.svelte', () => ({ forageStorage: { realStorage: null } }))

import { applyModelPresetDefaults } from 'src/ts/preset/dbDefaults'
import { decodeRisuSave, encodeRisuSaveLegacy } from './risuSave'

describe('[E2-5b] Retire the PageFold packs', () => {
    test('[unchanged] b4/B6 a legacy database preserves pageFold preset and binding fields through load and save', async () => {
        const legacy = {
            modelPresets: [{ id: 'preset-native', name: 'Native preset',
                pageFold: { enabled: true, model: 'retired-pagefold-model' } }],
            defaultModelBinding: {
                main: 'preset-native', sub: '', separateAux: false,
                aux: { memory: '', emotion: '', translate: '', otherAx: '' },
                pageFold: { model: 'retired-pagefold-binding' },
            },
        } as any
        applyModelPresetDefaults(legacy)
        const decoded = await decodeRisuSave(encodeRisuSaveLegacy(legacy))
        expect(decoded.modelPresets[0].pageFold).toEqual({ enabled: true, model: 'retired-pagefold-model' })
        expect(decoded.defaultModelBinding.pageFold).toEqual({ model: 'retired-pagefold-binding' })
    })
})
