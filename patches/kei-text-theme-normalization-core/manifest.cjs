'use strict'

const fs = require('node:fs')
const path = require('node:path')

const filesRoot = path.join(__dirname, 'files')
const owned = (relative) => fs.readFileSync(path.join(filesRoot, relative), 'utf8')
const pocketRisu190 = { pocketrisu: ['1.9.0', '1.10.0'] }

module.exports = {
    id: 'kei-text-theme-normalization-core',
    title: 'PocketRisu Kei text-theme normalization',
    version: '0.1.1',
    targets: {
        pocketrisu: {
            verified: ['1.8.1', '1.9.0'],
            reviewing: ['1.10.0'],
        },
    },
    userSelectable: false,
    units: [
        {
            id: 'kei-text-theme-normalization-core:normalizer:1.9',
            file: 'src/ts/gui/textTheme.ts',
            type: 'owned',
            content: owned('src/ts/gui/textTheme.ts'),
            targetVersions: pocketRisu190,
        },
        {
            id: 'kei-text-theme-normalization-core:normalizer-tests:1.9',
            file: 'src/ts/gui/textTheme.test.ts',
            type: 'owned',
            content: owned('src/ts/gui/textTheme.test.ts'),
            requires: ['kei-text-theme-normalization-core:normalizer:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'kei-text-theme-normalization-core:database-import:1.9',
            file: 'src/ts/storage/database.svelte.ts',
            type: 'replace',
            anchor: "import { defaultColorScheme, type ColorScheme } from '../gui/colorscheme';\n",
            managed: `import { defaultColorScheme, type ColorScheme } from '../gui/colorscheme';
import { normalizeTextTheme } from '../gui/textTheme';
`,
            requires: ['kei-text-theme-normalization-core:normalizer:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'kei-text-theme-normalization-core:database-load:1.9',
            file: 'src/ts/storage/database.svelte.ts',
            type: 'replace',
            anchor: `    if(checkNullish(data.textTheme)){
        data.textTheme = "standard"
    }
`,
            managed: `    /* POCKETRISU-PATCH:kei-text-theme-normalization:database-load */
    data.textTheme = normalizeTextTheme(data.textTheme)
`,
            markerNeedle: 'POCKETRISU-PATCH:kei-text-theme-normalization:database-load',
            requires: ['kei-text-theme-normalization-core:database-import:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'kei-text-theme-normalization-core:preset-activation:1.9',
            file: 'src/ts/storage/database.svelte.ts',
            type: 'replace',
            anchor: '    db.textTheme = p.textTheme ?? db.textTheme\n',
            managed: `    /* POCKETRISU-PATCH:kei-text-theme-normalization:preset-activation */
    db.textTheme = normalizeTextTheme(p.textTheme ?? db.textTheme)
`,
            markerNeedle: 'POCKETRISU-PATCH:kei-text-theme-normalization:preset-activation',
            requires: ['kei-text-theme-normalization-core:database-import:1.9'],
            after: ['kei-text-theme-normalization-core:database-load:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'kei-text-theme-normalization-core:database-tests:1.9',
            file: 'src/ts/storage/textThemeDatabase.test.ts',
            type: 'owned',
            content: owned('src/ts/storage/textThemeDatabase.test.ts'),
            requires: [
                'kei-text-theme-normalization-core:database-load:1.9',
                'kei-text-theme-normalization-core:preset-activation:1.9',
            ],
            targetVersions: pocketRisu190,
        },
        {
            id: 'kei-text-theme-normalization-core:runtime-import:1.9',
            file: 'src/ts/gui/colorscheme.ts',
            type: 'replace',
            anchor: 'import { CustomCSSStore, SafeModeStore } from "../stores.svelte";\n',
            managed: `import { CustomCSSStore, SafeModeStore } from "../stores.svelte";
import { normalizeTextTheme } from "./textTheme";
`,
            requires: ['kei-text-theme-normalization-core:normalizer:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'kei-text-theme-normalization-core:runtime-css:1.9',
            file: 'src/ts/gui/colorscheme.ts',
            type: 'replace',
            anchor: "    let textTheme = get(isLite) ? 'standard' : db.textTheme\n",
            managed: `    /* POCKETRISU-PATCH:kei-text-theme-normalization:runtime-css */
    const textTheme = normalizeTextTheme(get(isLite) ? 'standard' : db.textTheme)
`,
            markerNeedle: 'POCKETRISU-PATCH:kei-text-theme-normalization:runtime-css',
            requires: ['kei-text-theme-normalization-core:runtime-import:1.9'],
            targetVersions: pocketRisu190,
        },
        {
            id: 'kei-text-theme-normalization-core:runtime-tests:1.9',
            file: 'src/ts/gui/textThemeRuntime.test.ts',
            type: 'owned',
            content: owned('src/ts/gui/textThemeRuntime.test.ts'),
            requires: ['kei-text-theme-normalization-core:runtime-css:1.9'],
            targetVersions: pocketRisu190,
        },
    ],
}
