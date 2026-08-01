export const textThemeNames = ['standard', 'highcontrast', 'custom'] as const

export type TextThemeName = typeof textThemeNames[number]

export function normalizeTextTheme(theme: unknown): TextThemeName {
    return textThemeNames.includes(theme as TextThemeName)
        ? theme as TextThemeName
        : 'standard'
}
