'use strict'

const fs = require('node:fs')
const path = require('node:path')

const files = path.join(__dirname, 'files-1.10')
const read = (relative) => fs.readFileSync(path.join(files, relative), 'utf8')
const target1100 = { pocketrisu: ['1.10.0'] }

module.exports = {
    id: 'fastimport-ios-picker',
    title: 'FastImport iOS picker compatibility',
    version: '0.1.0',
    targets: {
        pocketrisu: {
            verified: ['1.10.0'],
            reviewing: [],
        },
    },
    userSelectable: true,
    units: [
        {
            id: 'fastimport-ios-picker:runtime-import:1.10',
            file: 'src/ts/plugins/plugins.svelte.ts',
            type: 'insert',
            where: 'after',
            anchor: 'import { pluginCodeTranspiler } from "./apiV3/transpiler";\n',
            content: 'import { applyFastImportIOSPickerCompatibility } from "./fastImportIOSPicker";\n',
            targetVersions: target1100,
        },
        {
            id: 'fastimport-ios-picker:runtime-prepare:1.10',
            file: 'src/ts/plugins/plugins.svelte.ts',
            type: 'replace',
            anchor: `    const enabledPlugins = safeStructuredClone(db.plugins).filter((p: RisuPlugin) => p.enabled)
    const pluginV2 = enabledPlugins.filter((a: RisuPlugin) => a.version === 2 || a.version === '2.1')
    const pluginV3 = enabledPlugins.filter((a: RisuPlugin) => a.version === '3.0')
`,
            content: `    const compatiblePlugins = await applyFastImportIOSPickerCompatibility(
        safeStructuredClone(db.plugins),
    )
    const enabledPlugins = compatiblePlugins.filter((p: RisuPlugin) => p.enabled)
    const pluginV2 = enabledPlugins.filter((a: RisuPlugin) => a.version === 2 || a.version === '2.1')
    const pluginV3 = enabledPlugins.filter((a: RisuPlugin) => a.version === '3.0')
`,
            requires: ['fastimport-ios-picker:runtime-import:1.10'],
            targetVersions: target1100,
        },
        {
            id: 'fastimport-ios-picker:runtime-helper:1.10',
            file: 'src/ts/plugins/fastImportIOSPicker.ts',
            type: 'owned',
            content: read('src/ts/plugins/fastImportIOSPicker.ts'),
            requires: ['fastimport-ios-picker:runtime-prepare:1.10'],
            targetVersions: target1100,
        },
        {
            id: 'fastimport-ios-picker:runtime-test:1.10',
            file: 'src/ts/plugins/fastImportIOSPicker.test.ts',
            type: 'owned',
            content: read('src/ts/plugins/fastImportIOSPicker.test.ts'),
            requires: ['fastimport-ios-picker:runtime-helper:1.10'],
            targetVersions: target1100,
        },
    ],
}
