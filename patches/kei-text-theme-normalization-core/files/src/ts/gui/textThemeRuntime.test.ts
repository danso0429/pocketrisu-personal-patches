import { beforeEach, describe, expect, test, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
    db: null as any,
    lite: false,
    customCSS: '',
}))

const readable = (read: () => unknown) => ({
    subscribe(run: (value: any) => void) {
        run(read())
        return () => {}
    },
})

vi.mock('../storage/database.svelte', () => ({
    getDatabase: () => runtime.db,
    setDatabase: () => {},
}))

vi.mock('../globalApi.svelte', () => ({
    downloadFile: () => {},
}))

vi.mock('../util', () => ({
    BufferToText: () => '',
    selectSingleFile: async () => null,
}))

vi.mock('../alert', () => ({
    notifyError: () => {},
}))

vi.mock('../lite', () => ({
    isLite: readable(() => runtime.lite),
}))

vi.mock('../stores.svelte', () => ({
    CustomCSSStore: {
        ...readable(() => runtime.customCSS),
        set: (value: string) => {
            runtime.customCSS = value
        },
    },
    SafeModeStore: readable(() => false),
}))

const { updateTextThemeAndCSS } = await import('./colorscheme')

function makeDatabase(textTheme: unknown) {
    return {
        textTheme,
        colorScheme: { type: 'dark' },
        customTextTheme: {
            FontColorStandard: '#111111',
            FontColorBold: '#222222',
            FontColorItalic: '#333333',
            FontColorItalicBold: '#444444',
            FontColorQuote1: '#555555',
            FontColorQuote2: '#666666',
        },
        font: 'default',
        customFont: '',
        customCSS: '',
    }
}

beforeEach(() => {
    runtime.db = makeDatabase('standard')
    runtime.lite = false
    runtime.customCSS = ''
    for (const property of [
        '--FontColorStandard',
        '--FontColorBold',
        '--FontColorItalic',
        '--FontColorItalicBold',
        '--FontColorQuote1',
        '--FontColorQuote2',
    ]) {
        document.documentElement.style.setProperty(property, 'stale')
    }
})

describe('runtime text-theme CSS boundary', () => {
    test('unsupported in-memory value rewrites all standard variables', () => {
        runtime.db = makeDatabase('vex')

        updateTextThemeAndCSS()

        expect(document.documentElement.style.getPropertyValue('--FontColorStandard')).toBe('#fafafa')
        expect(document.documentElement.style.getPropertyValue('--FontColorBold')).toBe('#fafafa')
        expect(document.documentElement.style.getPropertyValue('--FontColorItalic')).toBe('#8C8D93')
        expect(document.documentElement.style.getPropertyValue('--FontColorItalicBold')).toBe('#8C8D93')
        expect(document.documentElement.style.getPropertyValue('--FontColorQuote1')).toBe('#8BE9FD')
        expect(document.documentElement.style.getPropertyValue('--FontColorQuote2')).toBe('#FFB86C')
    })

    test('highcontrast remains on the native high-contrast branch', () => {
        runtime.db = makeDatabase('highcontrast')

        updateTextThemeAndCSS()

        expect(document.documentElement.style.getPropertyValue('--FontColorItalic')).toBe('#F1FA8C')
    })

    test('custom remains on the native custom-color branch', () => {
        runtime.db = makeDatabase('custom')

        updateTextThemeAndCSS()

        expect(document.documentElement.style.getPropertyValue('--FontColorStandard')).toBe('#111111')
        expect(document.documentElement.style.getPropertyValue('--FontColorQuote2')).toBe('#666666')
    })
})
