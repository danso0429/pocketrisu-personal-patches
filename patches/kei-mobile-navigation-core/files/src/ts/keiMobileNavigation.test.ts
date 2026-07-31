import { describe, expect, it } from 'vitest'
import {
    findAdjacentCharacterIndex,
    getBoundedNavigationIndex,
    getHorizontalNavigationDirection,
    hotkeyMatches,
    isInteractiveNavigationTarget,
    shouldIgnoreNavigationPointer,
} from './keiMobileNavigation'

const keyboardEvent = (
    key: string,
    modifiers: Partial<Pick<
        KeyboardEvent,
        'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'
    >> = {},
) => ({
    key,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    target: null,
    ...modifiers,
}) as KeyboardEvent

describe('Kei hotkey matching', () => {
    it('matches exact modifiers without mutating the saved hotkey', () => {
        const hotkey = { key: 'm', ctrl: true, action: 'modelSelect' }
        const before = structuredClone(hotkey)

        expect(hotkeyMatches(
            hotkey,
            keyboardEvent('M', { ctrlKey: true }),
        )).toBe(true)
        expect(hotkeyMatches(
            hotkey,
            keyboardEvent('m', { ctrlKey: true, shiftKey: true }),
        )).toBe(false)
        expect(hotkeyMatches(
            hotkey,
            keyboardEvent('m', { ctrlKey: true, metaKey: true }),
        )).toBe(false)
        expect(hotkey).toEqual(before)
    })

    it('does not consume unmodified keys from editable elements', () => {
        const hotkey = { key: ' ', action: 'focusInput' }

        expect(hotkeyMatches(hotkey, keyboardEvent(' '), {
            tagName: 'INPUT',
        })).toBe(false)
        expect(hotkeyMatches(hotkey, keyboardEvent(' '), {
            tagName: 'DIV',
            isContentEditable: true,
        })).toBe(false)
        expect(hotkeyMatches(hotkey, keyboardEvent(' '), {
            tagName: 'BUTTON',
        })).toBe(true)
    })
})

describe('Kei adjacent character navigation', () => {
    const characters = [
        { name: 'Charlie' },
        { name: 'Alice' },
        { name: 'Bob' },
    ]

    it('moves through the name-sorted list in both directions', () => {
        expect(findAdjacentCharacterIndex(characters, 2, -1)).toBe(1)
        expect(findAdjacentCharacterIndex(characters, 2, 1)).toBe(0)
    })

    it('stops at both boundaries and rejects a missing selection', () => {
        expect(findAdjacentCharacterIndex(characters, 1, -1)).toBeNull()
        expect(findAdjacentCharacterIndex(characters, 0, 1)).toBeNull()
        expect(findAdjacentCharacterIndex(characters, -1, 1)).toBeNull()
    })

    it('skips trashed and reserved characters without changing live indices', () => {
        const mixedCharacters = [
            { name: 'Charlie', chaId: 'live-charlie' },
            {
                name: 'Bravo (trash)',
                chaId: 'trashed-bravo',
                trashTime: 1,
            },
            { name: 'Delta', chaId: '§temp' },
            { name: 'Echo', chaId: '§playground' },
            { name: 'Alice', chaId: 'live-alice' },
        ]

        expect(findAdjacentCharacterIndex(
            mixedCharacters,
            4,
            1,
        )).toBe(0)
        expect(findAdjacentCharacterIndex(
            mixedCharacters,
            0,
            -1,
        )).toBe(4)
        expect(findAdjacentCharacterIndex(
            mixedCharacters,
            4,
            -1,
        )).toBeNull()
        expect(findAdjacentCharacterIndex(
            mixedCharacters,
            1,
            1,
        )).toBeNull()
    })
})

describe('Kei pointer navigation targets', () => {
    it('ignores native, editable, link, role, and draggable controls', () => {
        const fixture = document.createElement('div')
        fixture.innerHTML = `
            <div contenteditable="true"><span id="editable-child"></span></div>
            <a id="link"><span id="link-child"></span></a>
            <div role="button"><span id="role-child"></span></div>
            <div role="dialog"><span id="dialog-child"></span></div>
            <div draggable="true"><span id="drag-child"></span></div>
            <div id="ordinary"><span id="ordinary-child"></span></div>
        `

        for (const id of [
            'editable-child',
            'link-child',
            'role-child',
            'dialog-child',
            'drag-child',
        ]) {
            expect(isInteractiveNavigationTarget(
                fixture.querySelector(`#${id}`),
            )).toBe(true)
        }
        expect(isInteractiveNavigationTarget(
            fixture.querySelector('#ordinary-child'),
        )).toBe(false)
        expect(isInteractiveNavigationTarget(null)).toBe(false)
    })

    it('ignores pointers while legacy alerts or document dialogs are open', () => {
        const ordinary = document.createElement('div')

        expect(shouldIgnoreNavigationPointer(
            ordinary,
            'selectChar',
            false,
        )).toBe(true)
        expect(shouldIgnoreNavigationPointer(
            ordinary,
            'none',
            true,
        )).toBe(true)
        expect(shouldIgnoreNavigationPointer(
            ordinary,
            'none',
            false,
        )).toBe(false)
    })

    it('steps only through declared mobile navigation ranges', () => {
        expect(getBoundedNavigationIndex(0, 1, 2)).toBe(1)
        expect(getBoundedNavigationIndex(2, -1, 2)).toBe(1)
        expect(getBoundedNavigationIndex(0, -1, 2)).toBeNull()
        expect(getBoundedNavigationIndex(2, 1, 2)).toBeNull()
        expect(getBoundedNavigationIndex(100, -1, 2)).toBeNull()
        expect(getBoundedNavigationIndex(-1, 1, 2)).toBeNull()
    })
})

describe('Kei horizontal navigation gestures', () => {
    it('classifies horizontal motion above the threshold', () => {
        expect(getHorizontalNavigationDirection(
            { x: 10, y: 10 },
            { x: 70, y: 20 },
        )).toBe('previous')
        expect(getHorizontalNavigationDirection(
            { x: 70, y: 20 },
            { x: 10, y: 10 },
        )).toBe('next')
    })

    it('rejects short, vertical, and exactly diagonal motion', () => {
        expect(getHorizontalNavigationDirection(
            { x: 0, y: 0 },
            { x: 50, y: 0 },
        )).toBeNull()
        expect(getHorizontalNavigationDirection(
            { x: 0, y: 0 },
            { x: 20, y: 80 },
        )).toBeNull()
        expect(getHorizontalNavigationDirection(
            { x: 0, y: 0 },
            { x: 80, y: 80 },
        )).toBeNull()
    })
})
