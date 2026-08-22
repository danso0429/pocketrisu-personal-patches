import { beforeEach, describe, expect, test, vi } from 'vitest'
import { prepareModuleFromCharacter } from './backgroundImportCharacterModule'

const ids = vi.hoisted(() => {
    let value = 0
    return {
        reset() { value = 0 },
        next() { return `module-id-${++value}` },
    }
})
vi.mock('uuid', () => ({ v4: () => ids.next() }))
vi.mock('../characters', () => ({ createBlankChar: () => ({}) }))

import { convertCharacterToModule } from '../interchangeability'

describe('pure character-to-module preparation', () => {
    beforeEach(() => {
        ids.reset()
        ;(globalThis as any).safeStructuredClone = structuredClone
    })

    test('matches current conversion without importing UI owners', () => {
        const character: any = {
            name: 'Fixture',
            creatorNotes: 'notes',
            globalLore: [{ key: 'lore', content: 'body' }],
            customscript: [{ comment: 'regex' }],
            triggerscript: [{ comment: 'trigger' }],
            lowLevelAccess: true,
            hideChatIcon: true,
            backgroundHTML: '<div></div>',
            additionalAssets: [['asset', 'assets/hash.png', 'png']],
            customModuleToggle: 'toggle',
            image: 'assets/icon.png',
            desc: 'description',
            firstMessage: 'hello',
            alternateGreetings: ['alt'],
            postHistoryInstructions: 'phi',
        }
        const current = convertCharacterToModule(structuredClone(character))
        ids.reset()
        const pure = prepareModuleFromCharacter(structuredClone(character), () => ids.next())
        expect(pure).toEqual(current)
    })

    test('does not mutate source lorebook or alternate greetings', () => {
        const character: any = {
            name: 'Fixture', creatorNotes: '', globalLore: [],
            alternateGreetings: ['alt'], firstMessage: 'hello',
        }
        const before = structuredClone(character)
        prepareModuleFromCharacter(character, () => 'fresh')
        expect(character).toEqual(before)
    })
})
