import type { Chat, Database } from 'src/ts/storage/database.svelte'
import type { ModelPreset } from 'src/ts/preset/types'
import type { ResolvedBindingWithContext } from './modelPresetBinding'
import type { ModelModeExtended } from './shared'

function findPreset(id: string | undefined, presets: ModelPreset[]): ModelPreset | undefined {
    if (!id) return undefined
    return presets.find(preset => preset.id === id)
}

export function resolveChatModelBindingFromDatabase(
    db: Database,
    chat: Chat | null | undefined,
    mode: ModelModeExtended,
    moduleId?: string,
): ResolvedBindingWithContext {
    const lock = db.nodeOnlyModelModeLock ?? 'none'

    // Per-module override. Wins over everything below — including mode 'model' —
    // because the user bound this specific module to this specific preset; a
    // module's LLM call is never the reply the user is reading, so there is no
    // "main is expensive, don't silently swap it" concern here.
    //
    // Regime-independent on purpose: the binding names a preset explicitly and
    // sits behind a master switch that is off by default, so a classic-regime
    // chat only ever takes this path when the user opted in. Dangling ids fall
    // through to normal resolution rather than blocking.
    if (moduleId && db.moduleModelBindingsEnabled) {
        const bound = findPreset(db.moduleModelBindings?.[moduleId], db.modelPresets ?? [])

        if (bound) return { kind: 'modelPreset', preset: bound, bindingSource: 'module' }
    }

    // Effective regime. A global lock forces every chat into one regime; 'none'
    // defers to the chat's OWN stored choice only. The new-chat default
    // (useModelPresetByDefault) is snapshotted into chats at creation
    // (newChatModelDefaults), never read here — reading it here would
    // retroactively flip every existing undecided chat.
    const usePreset =
        lock === 'preset' ? true :
        lock === 'legacy' ? false :
        (chat?.useModelPreset ?? false)

    if (!usePreset) {
        return { kind: 'classic' }
    }

    // Preset regime. Use the chat's own bundle. Under a global preset lock, a
    // pre-existing chat may have no bundle yet (it predates the lock); fall back
    // to the global default for that deliberate global case only. Under 'none'
    // there is no live fallback — a 'none' preset chat always carries its own
    // snapshot (seeded at creation / on sidebar open). No bundle → block.
    const set = chat?.modelBinding ?? (lock === 'preset' ? db.defaultModelBinding : undefined)
    if (!set) {
        return { kind: 'block', reason: mode === 'model' ? 'main-unset' : 'sub-unset' }
    }

    const bindingSource = set === chat?.modelBinding ? 'chat' : 'global-lock-default'


    const presets = db.modelPresets ?? []

    if (mode === 'model') {
        const main = findPreset(set.main, presets)

        return main
            ? { kind: 'modelPreset', preset: main, bindingSource, pageFoldBinding: set }
            : { kind: 'block', reason: 'main-unset' }
    }

    // submodel + all aux modes resolve against the sub slot, with aux slots
    // overriding when separateAux is on (mirrors classic: db.subModel default,
    // db.seperateModels[task] override).
    const sub = findPreset(set.sub, presets)

    if (mode !== 'submodel' && set.separateAux) {
        const auxPreset = findPreset(set.aux?.[mode], presets)

        if (auxPreset) return { kind: 'modelPreset', preset: auxPreset, bindingSource, pageFoldBinding: set }
    }


    return sub
        ? { kind: 'modelPreset', preset: sub, bindingSource, pageFoldBinding: set }
        : { kind: 'block', reason: 'sub-unset' }
}

