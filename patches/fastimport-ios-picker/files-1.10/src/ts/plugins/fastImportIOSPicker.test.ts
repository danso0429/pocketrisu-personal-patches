import { describe, expect, test, vi } from 'vitest'
import fs from 'node:fs'
import ts from 'typescript'
import {
    applyFastImportIOSPickerCompatibility,
    type FastImportIOSPickerPolicy,
    sha256Text,
} from './fastImportIOSPicker'

const oldLine = 'const clipText = await navigator.clipboard.readText();'
const newLine = "const clipText = isIOS() ? '' : await navigator.clipboard.readText();"

function fixtureScript() {
    return `async function importClick(isIOS, navigator, selectFiles) {
    ${oldLine}
    if (clipText.startsWith('realm://')) return 'clipboard'
    selectFiles()
    return 'picker'
}`
}

async function fixturePolicy(source = fixtureScript()): Promise<FastImportIOSPickerPolicy> {
    return {
        pluginName: 'fast-character-import',
        displayName: '고속 캐릭터 임포트 1.5.5',
        apiVersion: '2.1',
        originalScriptSha256: await sha256Text(source),
        patchedScriptSha256: await sha256Text(source.replace(oldLine, newLine)),
        needle: oldLine,
        replacement: newLine,
    }
}

function target(script = fixtureScript()) {
    return {
        name: 'fast-character-import',
        displayName: '고속 캐릭터 임포트 1.5.5',
        version: '2.1',
        script,
        enabled: true,
        nested: { preserved: ['in-order'] },
    }
}

describe('FastImport iOS picker compatibility', () => {
    test('the final composed loadPlugins awaits compatibility before V2 execution', async () => {
        const sourceText = fs.readFileSync('src/ts/plugins/plugins.svelte.ts', 'utf8')
        const source = ts.createSourceFile(
            'plugins.svelte.ts',
            sourceText,
            ts.ScriptTarget.Latest,
            true,
        )
        const declaration = source.statements.find((node) => (
            ts.isFunctionDeclaration(node) && node.name?.text === 'loadPlugins'
        ))
        if (!declaration) throw new Error('Final composed source has no loadPlugins function')
        const javascript = ts.transpile(declaration.getText(source).replace(/^export /, ''), {
            target: ts.ScriptTarget.ES2022,
        })
        const events: string[] = []
        const factory = new Function(
            'getDatabase',
            'safeStructuredClone',
            'applyFastImportIOSPickerCompatibility',
            'loadV2Plugin',
            'loadV3Plugins',
            `${javascript}; return loadPlugins;`,
        )
        const loadPlugins = factory(
            () => ({ plugins: [target()] }),
            structuredClone,
            async (plugins: ReturnType<typeof target>[]) => {
                events.push('compatibility')
                return plugins.map(plugin => ({ ...plugin, script: 'patched' }))
            },
            async (plugins: ReturnType<typeof target>[]) => {
                events.push(`v2:${plugins[0]?.script}`)
            },
            async (plugins: ReturnType<typeof target>[]) => {
                events.push(`v3:${plugins.length}`)
            },
        )

        await loadPlugins()

        expect(events).toEqual(['compatibility', 'v2:patched', 'v3:0'])
    })

    test('transforms one known original without changing plugin order or non-target values', async () => {
        const policy = await fixturePolicy()
        const before = [
            { name: 'before', script: 'before', version: '2.1' },
            target(),
            { name: 'after', script: 'after', version: '3.0' },
        ]

        const after = await applyFastImportIOSPickerCompatibility(before, policy)

        expect(after).not.toBe(before)
        expect(after[0]).toBe(before[0])
        expect(after[2]).toBe(before[2])
        expect(after[1]).toMatchObject({
            ...before[1],
            script: fixtureScript().replace(oldLine, newLine),
        })
        expect(before[1].script).toContain(oldLine)
    })

    test('already-patched, absent, duplicate, unknown, and hash-failure inputs remain unchanged', async () => {
        const policy = await fixturePolicy()
        const patched = [target(fixtureScript().replace(oldLine, newLine))]
        await expect(applyFastImportIOSPickerCompatibility(patched, policy))
            .resolves.toBe(patched)

        const absent = [{ name: 'other', script: oldLine, version: '2.1' }]
        await expect(applyFastImportIOSPickerCompatibility(absent, policy))
            .resolves.toBe(absent)

        const warn = vi.fn()
        const duplicates = [target(), target()]
        await expect(applyFastImportIOSPickerCompatibility(
            duplicates,
            policy,
            sha256Text,
            { warn },
        )).resolves.toBe(duplicates)

        const unknown = [target(`${fixtureScript()}\n// changed`)]
        await expect(applyFastImportIOSPickerCompatibility(
            unknown,
            policy,
            sha256Text,
            { warn },
        )).resolves.toBe(unknown)

        const hashFailure = [target()]
        await expect(applyFastImportIOSPickerCompatibility(
            hashFailure,
            policy,
            async () => { throw new Error('digest unavailable') },
            { warn },
        )).resolves.toBe(hashFailure)
        expect(warn).toHaveBeenCalledTimes(3)
    })

    test('keeps the iOS picker synchronous and preserves desktop clipboard behavior', async () => {
        const policy = await fixturePolicy()
        const [patched] = await applyFastImportIOSPickerCompatibility([target()], policy)
        const importClick = new Function(`${patched.script}; return importClick;`)()

        const iosEvents: string[] = []
        const iosPromise = importClick(
            () => true,
            { clipboard: { readText: async () => { iosEvents.push('clipboard'); return '' } } },
            () => iosEvents.push('picker'),
        )
        expect(iosEvents).toEqual(['picker'])
        await expect(iosPromise).resolves.toBe('picker')

        const desktopEvents: string[] = []
        const desktopPromise = importClick(
            () => false,
            { clipboard: { readText: async () => { desktopEvents.push('clipboard'); return '' } } },
            () => desktopEvents.push('picker'),
        )
        expect(desktopEvents).toEqual(['clipboard'])
        await expect(desktopPromise).resolves.toBe('picker')
        expect(desktopEvents).toEqual(['clipboard', 'picker'])
    })
})
