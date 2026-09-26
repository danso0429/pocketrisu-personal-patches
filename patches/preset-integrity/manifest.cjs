'use strict'

const fs = require('node:fs')
const path = require('node:path')

const files1100Root = path.join(__dirname, 'files-1.10')
const read = (root, relative) => fs.readFileSync(path.join(root, relative), 'utf8')
const pocketRisu1100 = { pocketrisu: ['1.10.0'] }

const units = [
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
        targetVersions: pocketRisu1100,
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
        targetVersions: pocketRisu1100,
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
        targetVersions: pocketRisu1100,
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
        targetVersions: pocketRisu1100,
    },
    {
        id: 'preset-integrity:prompt-active-preset:1.9',
        file: 'src/lib/Setting/Pages/PromptPreset/PromptPresetBasicInfo.svelte',
        type: 'insert',
        where: 'after',
        anchor: '    const activeIndex = $derived(DBState.db.botPresetsId);\n',
        content: '    const activePreset = $derived(DBState.db.botPresets?.[activeIndex] ?? null);\n',
        targetVersions: pocketRisu1100,
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
        targetVersions: pocketRisu1100,
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
        targetVersions: pocketRisu1100,
    },
    {
        id: 'preset-integrity:tests:1.9',
        file: 'src/ts/storage/botPresetIntegrity.test.ts',
        type: 'owned',
        content: read(files1100Root, 'src/ts/storage/botPresetIntegrity.test.ts'),
        requires: ['preset-integrity:normalizer:1.9'],
        targetVersions: pocketRisu1100,
    },
]

module.exports = {
    id: 'preset-integrity',
    title: 'Prompt preset integrity',
    version: '0.2.2',
    targets: {
        pocketrisu: {
            verified: ['1.10.0'],
            reviewing: [],
        },
    },
    userSelectable: true,
    units,
}
