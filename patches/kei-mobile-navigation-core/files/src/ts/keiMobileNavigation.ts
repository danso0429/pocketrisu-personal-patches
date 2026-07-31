export interface KeiHotkey {
    key: string
    ctrl?: boolean
    shift?: boolean
    alt?: boolean
    action: string
}

type EditableElementLike = {
    tagName?: string
    isContentEditable?: boolean
}

type NavigableCharacter = {
    name?: string
    chaId?: string
    trashTime?: number
}

type KeyboardEventLike = Pick<
    KeyboardEvent,
    'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey' | 'target'
>

const INTERACTIVE_NAVIGATION_SELECTOR = [
    'button',
    'input',
    'select',
    'textarea',
    'a',
    'summary',
    'label',
    '[contenteditable]:not([contenteditable="false"])',
    '[draggable="true"]',
    '[role="button"]',
    '[role="checkbox"]',
    '[role="combobox"]',
    '[role="dialog"]',
    '[role="link"]',
    '[role="menuitem"]',
    '[role="option"]',
    '[role="radio"]',
    '[role="slider"]',
    '[role="switch"]',
    '[role="tab"]',
    '[role="textbox"]',
    '[role="treeitem"]',
    '[aria-modal="true"]',
].join(', ')

export function hotkeyMatches(
    hotkey: KeiHotkey | undefined,
    event: KeyboardEventLike,
    activeElement: EditableElementLike | null =
        event.target as EditableElementLike | null,
): boolean {
    if (!hotkey?.key) return false

    const ctrl = hotkey.ctrl ?? false
    const alt = hotkey.alt ?? false
    const shift = hotkey.shift ?? false
    if (event.metaKey) return false
    if (ctrl !== event.ctrlKey) return false
    if (alt !== event.altKey) return false
    if (shift !== event.shiftKey) return false
    if (hotkey.key.toLowerCase() !== event.key.toLowerCase()) return false

    if (!ctrl && !alt && !shift) {
        const tagName = activeElement?.tagName?.toUpperCase()
        if (
            tagName === 'INPUT'
            || tagName === 'TEXTAREA'
            || activeElement?.isContentEditable
        ) {
            return false
        }
    }
    return true
}

export function findAdjacentCharacterIndex(
    characters: readonly NavigableCharacter[],
    selectedIndex: number,
    direction: -1 | 1,
): number | null {
    const sorted = characters
        .map((character, index) => ({
            character,
            index,
        }))
        .filter(({ character }) =>
            !character.trashTime
            && character.chaId !== '§temp'
            && character.chaId !== '§playground')
        .map(({ character, index }) => ({
            name: character.name ?? '',
            index,
        }))
        .sort((left, right) => left.name.localeCompare(right.name))
    const currentIndex = sorted.findIndex(({ index }) => index === selectedIndex)
    const nextIndex = currentIndex + direction
    if (
        currentIndex < 0
        || nextIndex < 0
        || nextIndex >= sorted.length
    ) {
        return null
    }
    return sorted[nextIndex].index
}

export function isInteractiveNavigationTarget(
    target: EventTarget | null,
): boolean {
    return target instanceof Element
        && target.closest(INTERACTIVE_NAVIGATION_SELECTOR) !== null
}

export function shouldIgnoreNavigationPointer(
    target: EventTarget | null,
    legacyAlertType: string,
    hasOpenDialog: boolean,
): boolean {
    return legacyAlertType !== 'none'
        || hasOpenDialog
        || isInteractiveNavigationTarget(target)
}

export function getBoundedNavigationIndex(
    current: number,
    direction: -1 | 1,
    maximum: number,
): number | null {
    if (
        !Number.isInteger(current)
        || current < 0
        || current > maximum
    ) {
        return null
    }
    const next = current + direction
    return next < 0 || next > maximum ? null : next
}

export type HorizontalNavigationDirection = 'previous' | 'next'

export function getHorizontalNavigationDirection(
    start: { x: number, y: number },
    end: { x: number, y: number },
    threshold = 50,
): HorizontalNavigationDirection | null {
    const moveX = end.x - start.x
    const moveY = end.y - start.y
    if (Math.abs(moveX) <= threshold) return null
    if (Math.abs(moveY) >= Math.abs(moveX)) return null
    return moveX > 0 ? 'previous' : 'next'
}
