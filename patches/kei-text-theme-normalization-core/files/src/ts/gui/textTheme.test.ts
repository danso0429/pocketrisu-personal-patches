import { describe, expect, test } from 'vitest'
import { normalizeTextTheme, textThemeNames } from './textTheme'

describe('text-theme normalization', () => {
    test.each(textThemeNames)('preserves official value %s', (value) => {
        expect(normalizeTextTheme(value)).toBe(value)
    })

    test.each([
        undefined,
        null,
        '',
        'vex',
        'Standard',
        0,
        false,
        {},
        [],
    ])('normalizes unsupported value %j to standard', (value) => {
        expect(normalizeTextTheme(value)).toBe('standard')
    })
})
