import { beforeEach, describe, expect, test, vi } from 'vitest'

let mockDb: any
vi.mock('src/ts/storage/database.svelte', () => ({ getDatabase: () => mockDb }))

import { classicModelIdFor, resolveChatModelBinding } from './modelPresetBinding'

const preset = {
    id: 'preset-native',
    name: 'Native preset',
    pageFold: { enabled: true, model: 'pagefold-must-not-win' },
} as any

beforeEach(() => {
    mockDb = {
        aiModel: 'native-main',
        subModel: 'native-sub',
        seperateModelsForAxModels: true,
        seperateModels: { memory: 'native-memory', emotion: '', translate: '', otherAx: '' },
        modelPresets: [preset],
        nodeOnlyModelModeLock: 'none',
    }
})

describe('[E2-5b] Retire the PageFold packs', () => {
    test('[unchanged] b4/B6 legacy pageFold fields do not override native preset, block, or classic binding', () => {
        const presetChat = { useModelPreset: true, modelBinding: {
            main: preset.id, sub: '', separateAux: false,
            aux: { memory: '', emotion: '', translate: '', otherAx: '' },
            pageFold: { model: 'pagefold-binding-must-not-win' },
        } } as any
        expect(resolveChatModelBinding(presetChat, 'model')).toEqual({ kind: 'modelPreset', preset })

        const blocked = { ...presetChat, modelBinding: { ...presetChat.modelBinding, main: '' } }
        expect(resolveChatModelBinding(blocked, 'model')).toEqual({ kind: 'block', reason: 'main-unset' })

        const classic = resolveChatModelBinding({ useModelPreset: false,
            pageFold: { model: 'pagefold-chat-must-not-win' } } as any, 'memory')
        expect(classic).toEqual({ kind: 'classic' })
        expect(classicModelIdFor(classic as any, 'memory', mockDb)).toBe('native-memory')

    })
})
