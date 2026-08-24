'use strict'

const fs = require('node:fs')
const path = require('node:path')

const filesRoot = path.join(__dirname, 'files')
const files190Root = path.join(__dirname, 'files-1.9')
const read = (root, relative) => fs.readFileSync(path.join(root, relative), 'utf8')
const pocketRisu181 = { pocketrisu: ['1.8.1'] }
const pocketRisu190 = { pocketrisu: ['1.9.0', '1.10.0'] }

const units181 = [
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
        content: read(filesRoot, 'src/ts/storage/botPresetIntegrity.test.ts'),
    },
]

const units190 = [
    {
        id: 'preset-integrity:normalizer:1.9',
        file: 'src/ts/storage/database.svelte.ts',
        type: 'insert',
        where: 'before',
        anchor: 'export function getActiveBotPreset(): botPreset | null {\n',
        content: `export function normalizeBotPresetSelection(db: Database): number {
    if (!Array.isArray(db.botPresets) || db.botPresets.length === 0) {
        db.botPresets = [createBotPresetTemplate()]
    }
    const requested = Number.isInteger(db.botPresetsId) ? db.botPresetsId : 0
    if (requested === -1) {
        return -1
    }
    db.botPresetsId = Math.max(0, Math.min(requested, db.botPresets.length - 1))
    return db.botPresetsId
}
`,
        targetVersions: pocketRisu190,
    },
    {
        id: 'preset-integrity:load-normalization:1.9',
        file: 'src/ts/storage/database.svelte.ts',
        type: 'insert',
        where: 'after',
        anchor: `    if(checkNullish(data.botPresetsId)){
        data.botPresetsId = 0
    }
`,
        content: '    normalizeBotPresetSelection(data)\n',
        requires: ['preset-integrity:normalizer:1.9'],
        targetVersions: pocketRisu190,
    },
    {
        id: 'preset-integrity:save-normalization:1.9',
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
        requires: ['preset-integrity:normalizer:1.9'],
        targetVersions: pocketRisu190,
    },
    {
        id: 'preset-integrity:change-guard:1.9',
        file: 'src/ts/storage/database.svelte.ts',
        type: 'replace',
        anchor: `    let db = getDatabase()
    let pres = db.botPresets
    const newPres = pres[id]
`,
        content: `    let db = getDatabase()
    const activeId = normalizeBotPresetSelection(db)
    let pres = db.botPresets
    if (!Number.isInteger(id) || id < 0 || id >= pres.length) {
        id = activeId >= 0 ? activeId : 0
    }
    const newPres = pres[id]
`,
        requires: ['preset-integrity:normalizer:1.9'],
        targetVersions: pocketRisu190,
    },
    {
        id: 'preset-integrity:prompt-active-preset:1.9',
        file: 'src/lib/Setting/Pages/PromptPreset/PromptPresetBasicInfo.svelte',
        type: 'insert',
        where: 'after',
        anchor: '    const activeIndex = $derived(DBState.db.botPresetsId);\n',
        content: '    const activePreset = $derived(DBState.db.botPresets?.[activeIndex] ?? null);\n',
        targetVersions: pocketRisu190,
    },
    {
        id: 'preset-integrity:prompt-body-start:1.9',
        file: 'src/lib/Setting/Pages/PromptPreset/PromptPresetBasicInfo.svelte',
        type: 'insert',
        where: 'before',
        anchor: '<div class="flex flex-col gap-4">\n',
        managed: `<!-- POCKETRISU-PATCH:preset-integrity:prompt-body-start:1.9 -->
{#if activePreset}
`,
        markerNeedle: 'POCKETRISU-PATCH:preset-integrity:prompt-body-start:1.9',
        requires: ['preset-integrity:prompt-active-preset:1.9'],
        targetVersions: pocketRisu190,
    },
    {
        id: 'preset-integrity:prompt-body-end:1.9',
        file: 'src/lib/Setting/Pages/PromptPreset/PromptPresetBasicInfo.svelte',
        type: 'insert',
        where: 'after',
        anchor: `        <ShButton variant="destructive" size="default" className="w-full" onclick={handleDelete}>
            <Trash2Icon size={16} />
            <span class="ml-1">{language.presetDelete}</span>
        </ShButton>
    </div>
</div>
`,
        managed: `{/if}
<!-- POCKETRISU-PATCH:preset-integrity:prompt-body-end:1.9 -->
`,
        markerNeedle: 'POCKETRISU-PATCH:preset-integrity:prompt-body-end:1.9',
        requires: ['preset-integrity:prompt-body-start:1.9'],
        targetVersions: pocketRisu190,
    },
    {
        id: 'preset-integrity:tests:1.9',
        file: 'src/ts/storage/botPresetIntegrity.test.ts',
        type: 'owned',
        content: read(files190Root, 'src/ts/storage/botPresetIntegrity.test.ts'),
        requires: ['preset-integrity:normalizer:1.9'],
        targetVersions: pocketRisu190,
    },
]

module.exports = {
    id: 'preset-integrity',
    title: 'Prompt preset integrity',
    version: '0.2.2',
    targets: {
        pocketrisu: {
            verified: ['1.8.1', '1.9.0', '1.10.0'],
            reviewing: [],
        },
    },
    userSelectable: true,
    units: [
        ...units181.map((unit) => ({
            ...unit,
            targetVersions: pocketRisu181,
        })),
        ...units190,
    ],
}
