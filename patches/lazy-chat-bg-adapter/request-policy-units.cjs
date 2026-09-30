'use strict'

const fs = require('node:fs')
const path = require('node:path')
const targetVersions = { pocketrisu: ['1.10.0'] }
const prefix = 'lazy-chat-bg-adapter:request-policy'
const file = 'src/ts/process/request/request.ts'

module.exports = [
    {
        id: `${prefix}:binding-import:1.10`,
        file: 'src/ts/process/request/modelPresetBinding.ts', type: 'replace',
        anchor: `function findPreset(id: string | undefined, presets: ModelPreset[]): ModelPreset | undefined {
    if (!id) return undefined
    return presets.find((p) => p.id === id)
}`,
        content: "import { resolveChatModelBindingFromDatabase } from './modelBindingResolution'",
        requires: [`${prefix}:owned:modelBindingResolution.ts:1.10`], targetVersions,
    },
    ...['modelBindingResolution.ts', 'modelRequestSelection.ts', 'modelRequestSelection.test.ts'].map(name => ({
        id: `${prefix}:owned:${name}:1.10`,
        file: `src/ts/process/request/${name}`, type: 'owned',
        content: fs.readFileSync(path.join(__dirname, 'files-1.10/src/ts/process/request', name), 'utf8'),
        targetVersions,
    })),
    {
        id: `${prefix}:explicit-database:1.10`,
        file: 'src/ts/process/request/modelPresetBinding.ts', type: 'replace',
        anchor: "    const db = getDatabase()\n    const lock = db.nodeOnlyModelModeLock ?? 'none'\n\n    // Per-module override. Wins over everything below — including mode 'model' —\n    // because the user bound this specific module to this specific preset; a\n    // module's LLM call is never the reply the user is reading, so there is no\n    // \"main is expensive, don't silently swap it\" concern here.\n    //\n    // Regime-independent on purpose: the binding names a preset explicitly and\n    // sits behind a master switch that is off by default, so a classic-regime\n    // chat only ever takes this path when the user opted in. Dangling ids fall\n    // through to normal resolution rather than blocking.\n    if (moduleId && db.moduleModelBindingsEnabled) {\n        const bound = findPreset(db.moduleModelBindings?.[moduleId], db.modelPresets ?? [])\n/* POCKETRISU-PATCH:pagefold-model-preset:binding-context-module:1.10:START */\n        if (bound) return { kind: 'modelPreset', preset: bound, bindingSource: 'module' }\n/* POCKETRISU-PATCH:pagefold-model-preset:binding-context-module:1.10:END */    }\n\n    // Effective regime. A global lock forces every chat into one regime; 'none'\n    // defers to the chat's OWN stored choice only. The new-chat default\n    // (useModelPresetByDefault) is snapshotted into chats at creation\n    // (newChatModelDefaults), never read here — reading it here would\n    // retroactively flip every existing undecided chat.\n    const usePreset =\n        lock === 'preset' ? true :\n        lock === 'legacy' ? false :\n        (chat?.useModelPreset ?? false)\n\n    if (!usePreset) {\n        return { kind: 'classic' }\n    }\n\n    // Preset regime. Use the chat's own bundle. Under a global preset lock, a\n    // pre-existing chat may have no bundle yet (it predates the lock); fall back\n    // to the global default for that deliberate global case only. Under 'none'\n    // there is no live fallback — a 'none' preset chat always carries its own\n    // snapshot (seeded at creation / on sidebar open). No bundle → block.\n    const set = chat?.modelBinding ?? (lock === 'preset' ? db.defaultModelBinding : undefined)\n    if (!set) {\n        return { kind: 'block', reason: mode === 'model' ? 'main-unset' : 'sub-unset' }\n    }\n/* POCKETRISU-PATCH:pagefold-model-preset:binding-context-source:1.10:START */\n    const bindingSource = set === chat?.modelBinding ? 'chat' : 'global-lock-default'\n/* POCKETRISU-PATCH:pagefold-model-preset:binding-context-source:1.10:END */\n\n    const presets = db.modelPresets ?? []\n\n    if (mode === 'model') {\n        const main = findPreset(set.main, presets)\n/* POCKETRISU-PATCH:pagefold-model-preset:binding-context-main:1.10:START */\n        return main\n            ? { kind: 'modelPreset', preset: main, bindingSource, pageFoldBinding: set }\n            : { kind: 'block', reason: 'main-unset' }\n/* POCKETRISU-PATCH:pagefold-model-preset:binding-context-main:1.10:END */    }\n\n    // submodel + all aux modes resolve against the sub slot, with aux slots\n    // overriding when separateAux is on (mirrors classic: db.subModel default,\n    // db.seperateModels[task] override).\n    const sub = findPreset(set.sub, presets)\n\n    if (mode !== 'submodel' && set.separateAux) {\n        const auxPreset = findPreset(set.aux?.[mode], presets)\n/* POCKETRISU-PATCH:pagefold-model-preset:binding-context-aux:1.10:START */\n        if (auxPreset) return { kind: 'modelPreset', preset: auxPreset, bindingSource, pageFoldBinding: set }\n/* POCKETRISU-PATCH:pagefold-model-preset:binding-context-aux:1.10:END */    }\n\n/* POCKETRISU-PATCH:pagefold-model-preset:binding-context-sub:1.10:START */\n    return sub\n        ? { kind: 'modelPreset', preset: sub, bindingSource, pageFoldBinding: set }\n        : { kind: 'block', reason: 'sub-unset' }\n/* POCKETRISU-PATCH:pagefold-model-preset:binding-context-sub:1.10:END */}",
        content: '    return resolveChatModelBindingFromDatabase(getDatabase(), chat, mode, moduleId)\n}',
        requires: ['pagefold-model-preset:binding-context-compatible-wrapper:1.10', `${prefix}:binding-import:1.10`],
        after: ['pagefold-model-preset:binding-context-sub:1.10'], targetVersions,
    },
    {
        id: `${prefix}:dispatcher-import:1.10`, file, type: 'insert', where: 'before',
        anchor: 'export async function requestChatDataMain(',
        content: "import { resolveModelRequestSelection } from './modelRequestSelection'\n\n",
        requires: [`${prefix}:explicit-database:1.10`, `${prefix}:owned:modelRequestSelection.ts:1.10`],
        after: [
            'bg-preserve:hook:request-ts-bgsubkey-arg-field',
            'bg-preserve:hook:request-ts-bgsubkey-auto-tag',
            'bg-preserve:hook:request-cache-server-authority',
            'bg-preserve:hook:request-cache-authority-gate:1.9',
            'bg-preserve:hook:request-stream-cache-source-badge:1.9',
            'bg-preserve:hook:request-nonstream-cache-source-badge',
            'pagefold-model-preset:request-failure-route-policy:1.10',
            'pagefold-model-preset:request-pagefold-imports:1.10',
            'pagefold-model-preset:request-route-state-argument:1.10',
            'pagefold-model-preset:request-route-state-response:1.10',
            'pagefold-model-preset:request-route-state-stream-response:1.10',
            'pagefold-model-preset:request-route-state-multiline-response:1.10',
            'pagefold-model-preset:request-outer-route-state:1.10',
            'pagefold-model-preset:request-outer-skip-source-transforms:1.10',
            'pagefold-model-preset:request-outer-pass-route-state:1.10',
            'pagefold-model-preset:request-outer-capture-route-state:1.10',
            'pagefold-model-preset:request-outer-charset-policy:1.10',
            'pagefold-model-preset:request-outer-blank-policy:1.10',
            'pagefold-model-preset:request-outer-failure-policy:1.10',
            'pagefold-model-preset:request-detailed-binding-import:1.10',
            'pagefold-model-preset:request-detailed-binding-call:1.10',
            'pagefold-model-preset:request-preset-binding-context:1.10',
            'pagefold-model-preset:request-preset-signature:1.10',
            'pagefold-model-preset:request-retry-skip-reformater:1.10',
            'pagefold-model-preset:request-mutable-messages:1.10',
            'pagefold-model-preset:request-prepare-wire:1.10',
            'pagefold-model-preset:request-preview-redaction:1.10',
            'pagefold-model-preset:request-options-context:1.10',
            'pagefold-model-preset:request-status-no-restart:1.10',
            'pagefold-model-preset:request-stream-actual-usage:1.10',
            'pagefold-model-preset:request-nonstream-actual-usage:1.10',
            'pagefold-model-preset:request-decoupled-route-state:1.10',
            'pagefold-model-preset:request-stream-route-state:1.10',
            'pagefold-model-preset:request-success-route-state:1.10',
        ],
        targetVersions,
    },
    {
        id: `${prefix}:dispatcher-select:1.10`, file, type: 'replace',
        anchor: `    const targ:RequestDataArgumentExtended = arg

    // P4 dual-regime dispatch (plan v6 §7). Resolve the per-chat ModelPreset`,
        content: `    const targ:RequestDataArgumentExtended = arg
    const selection = resolveModelRequestSelection(db, arg.staticModel ? undefined : getCurrentChat(), model, arg)

    // P4 dual-regime dispatch (plan v6 §7). Resolve the per-chat ModelPreset`,
        requires: [`${prefix}:dispatcher-import:1.10`], targetVersions,
    },
    {
        id: `${prefix}:dispatcher-binding:1.10`, file, type: 'replace',
        anchor: '        const binding = resolveChatModelBindingWithContext(currentChat, model, arg.moduleId)',
        content: '        const binding = selection',
        requires: [`${prefix}:dispatcher-select:1.10`, 'pagefold-model-preset:request-detailed-binding-call:1.10'],
        targetVersions,
    },
    {
        id: `${prefix}:dispatcher-classic:1.10`, file, type: 'replace',
        anchor: `    targ.aiModel = arg.staticModel ? arg.staticModel : (model === 'model' ? db.aiModel : db.subModel)
    targ.modelInfo = getModelInfo(targ.aiModel)
    if(db.seperateModelsForAxModels && !arg.staticModel){
        if(db.seperateModels[model]){
            targ.aiModel = db.seperateModels[model]
            targ.modelInfo = getModelInfo(targ.aiModel)
        }
    }`,
        content: `    // Preset and blocked bindings returned above; a forced fallback is classic.
    if (selection.kind !== 'classic') throw new Error('Unresolved model request selection')
    targ.aiModel = selection.modelId
    targ.modelInfo = getModelInfo(targ.aiModel)`,
        requires: [`${prefix}:dispatcher-binding:1.10`], targetVersions,
    },
]
