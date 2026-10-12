'use strict'
const fs = require('node:fs')
const path = require('node:path')
module.exports = prior => {
    const prefix = 'lazy-chat-bg-adapter:stream-preview:'
    const targetVersions = { pocketrisu: ['1.10.0'] }
    const units = []
    const add = (name, file, anchor, content, type = 'replace', where) => {
        units.push({ id: prefix + name, file, type, anchor,
            ...(file.endsWith('.svelte') ? { managed: content } : { content }),
            ...(where ? { where } : {}), targetVersions,
            after: [...prior, ...units].filter(unit => unit.file === file).map(unit => unit.id) })
    }
    for (const file of ["src/ts/bgServerInputSettingsSave.ts","src/ts/bgServerInputSettingsSave.test.ts"]) {
        units.push({ id: prefix + file, file, type: 'owned', targetVersions,
            content: fs.readFileSync(path.join(__dirname, 'files-1.10', file), 'utf8') })
    }
    const globalApi = 'src/ts/globalApi.svelte.ts'
    add('durable-retry-import', globalApi,
        'import { completeBgDurableSave } from "./bgDurableSaveBarrier";',
        'import { completeBgDurableSave, BG_DURABLE_SAVE_RETRY, BG_SAVE_MAX_REBASE_ATTEMPTS } from "./bgDurableSaveBarrier";')
    add('durable-retry-policy', globalApi,
        "                else if (result === 'retry') {\n                    savetrys += 1\n                    if (savetrys > 4) {",
        "                else if (result === 'retry') {\n                    savetrys += 1\n                    if (savetrys >= BG_SAVE_MAX_REBASE_ATTEMPTS) {")
    add('durable-retry-capture', globalApi,
        "        let committed = true // triggerSave's no-tracked-change fast path means the prior save covered it",
        "        let persistenceRetry = false\n        let committed = true // triggerSave's no-tracked-change fast path means the prior save covered it")
    add('durable-retry-result', globalApi,
        "            onResult: (result: string) => { committed = result === 'saved' },",
        `            onResult: (result: string) => {
                committed = result === 'saved'
                // onResult runs before the native retry counter increments.
                // Do not retry beyond that owner's shared conflict boundary.
                persistenceRetry = result === 'retry' && savetrys + 1 < BG_SAVE_MAX_REBASE_ATTEMPTS
            },`)
    add('durable-retry-error', globalApi, '        await completeBgDurableSave(',
        `        if (!committed && persistenceRetry) throw Object.assign(
            new Error('durable save deferred; persistence retry required; result retained'), { code: BG_DURABLE_SAVE_RETRY })
        await completeBgDurableSave(`)
    add('settings-retry-import', 'src/ts/bgOrchestrate.ts',
        "import { orchestrationStartDiagnostic } from './bgOrchestrationStartDiagnostic'",
        "import { orchestrationStartDiagnostic } from './bgOrchestrationStartDiagnostic'\nimport { saveServerInputSettings } from './bgServerInputSettingsSave'")
    add('settings-retry', 'src/ts/bgOrchestrate.ts',
        '                await requestDurableSave({ root: true })',
        '                await saveServerInputSettings(() => requestDurableSave({ root: true }), isCurrent)')
    return units
}
