import { describe, expect, test } from 'vitest'
import {
    nodeOnlyStandardChatWidthClass,
    normalizeNodeOnlyStandardChatWidth,
} from './haejeokChatWidth'

describe('Haejeok small chat-width adaptation', () => {
    test.each([
        ['small', 'small'],
        ['standard', 'standard'],
        ['wide', 'wide'],
        ['full', 'full'],
    ] as const)('retains the supported %s value', (input, expected) => {
        expect(normalizeNodeOnlyStandardChatWidth(input)).toBe(expected)
    })

    test.each([undefined, null, '', 'future', 600])(
        'keeps unknown value %j on the native Standard default',
        (input) => {
            expect(normalizeNodeOnlyStandardChatWidth(input)).toBe('standard')
        },
    )

    test('maps Small to 600px CSS and preserves every native class', () => {
        expect(nodeOnlyStandardChatWidthClass('small')).toBe('nodeonly-chat-width-small')
        expect(nodeOnlyStandardChatWidthClass('standard')).toBe('max-w-3xl')
        expect(nodeOnlyStandardChatWidthClass('wide')).toBe('max-w-6xl')
        expect(nodeOnlyStandardChatWidthClass('full')).toBe('max-w-full')
        expect(nodeOnlyStandardChatWidthClass('unknown')).toBe('max-w-3xl')
    })
})
