'use strict'

const fs = require('node:fs')
const path = require('node:path')

module.exports = {
    id: 'preset-integrity',
    version: '0.1.0',
    units: [
        {
            id: 'preset-integrity:normalizer',
            file: 'src/ts/storage/database.svelte.ts',
            type: 'insert',
            where: 'before',
            anchor: 'export function getActiveBotPreset(): botPreset | null {\n',
            content: `export function normalizeBotPresetSelection(db: Database): number {
    if (!Array.isArray(db.botPresets) || db.botPresets.length === 0) {
        db.botPresets = [createBotPresetTemplate()]
    }
    const requested = Number.isInteger(db.botPresetsId) ? db.botPresetsId : 0
    db.botPresetsId = Math.max(0, Math.min(requested, db.botPresets.length - 1))
    return db.botPresetsId
}
`,
        },
        {
            id: 'preset-integrity:load-normalization',
            file: 'src/ts/storage/database.svelte.ts',
            type: 'insert',
            where: 'after',
            anchor: `    if(checkNullish(data.botPresetsId)){
        data.botPresetsId = 0
    }
`,
            content: '    normalizeBotPresetSelection(data)\n',
        },
        {
            id: 'preset-integrity:save-normalization',
            file: 'src/ts/storage/database.svelte.ts',
            type: 'insert',
            where: 'after',
            anchor: `    if(db.botPresetsId === -1){
        return
    }
`,
            content: `    normalizeBotPresetSelection(db)
    pres = db.botPresets
`,
        },
        {
            id: 'preset-integrity:change-guard',
            file: 'src/ts/storage/database.svelte.ts',
            type: 'replace',
            anchor: `    let db = getDatabase()
    let pres = db.botPresets
    const newPres = pres[id]
`,
            content: `    let db = getDatabase()
    let pres = db.botPresets
    if (!Number.isInteger(id) || id < 0 || id >= pres.length) {
        id = normalizeBotPresetSelection(db)
        pres = db.botPresets
    }
    const newPres = pres[id]
`,
        },
        {
            id: 'preset-integrity:prompt-active-preset',
            file: 'src/lib/Setting/Pages/PromptPreset/PromptPresetBasicInfo.svelte',
            type: 'insert',
            where: 'after',
            anchor: '    const activeIndex = $derived(DBState.db.botPresetsId);\n',
            content: '    const activePreset = $derived(DBState.db.botPresets?.[activeIndex] ?? null);\n',
        },
        {
            id: 'preset-integrity:prompt-name-guard',
            file: 'src/lib/Setting/Pages/PromptPreset/PromptPresetBasicInfo.svelte',
            type: 'replace',
            anchor: '        <TextInput bind:value={DBState.db.botPresets[activeIndex].name} fullwidth />',
            managed: `        <!-- POCKETRISU-PATCH:preset-integrity:prompt-name-guard:START -->
        {#if activePreset}
            <TextInput bind:value={activePreset.name} fullwidth />
        {/if}
        <!-- POCKETRISU-PATCH:preset-integrity:prompt-name-guard:END -->`,
            markerNeedle: 'POCKETRISU-PATCH:preset-integrity:prompt-name-guard:START',
        },
        {
            id: 'preset-integrity:tests',
            file: 'src/ts/storage/botPresetIntegrity.test.ts',
            type: 'owned',
            content: fs.readFileSync(
                path.join(__dirname, 'files/src/ts/storage/botPresetIntegrity.test.ts'),
                'utf8',
            ),
        },
    ],
}
