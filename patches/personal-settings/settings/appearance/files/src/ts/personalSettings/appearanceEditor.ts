import { get } from 'svelte/store'
import { DBState, SafeModeStore } from '../stores.svelte'
import { forageStorage, saveAsset } from '../globalApi.svelte'
import type { Database } from '../storage/database.svelte'
import { setPersonalAppearanceValue } from './appearanceValues'
import { disposeCssRuntime, getCssRuntime } from './cssToggleRuntime'
import { appearanceDraft, applyCssEdit, cssEditBase, cssSnapshot, rawAppearance, readCssToggles, sameValue, writeAppearanceGroup, type CssEdit } from './cssToggles'
import { saveAppearanceStrict } from './appearancePersistence'
import { CustomFontRuntime, customFontLoadStatus } from './customFontRuntime'
import { FONT_LIMITS, fontExtension, readCustomFonts, verifyFontBytes, writeFontEntry, type CustomFont } from './customFonts'

export const currentAppearance = () => ({ db: DBState.db, safeMode: get(SafeModeStore) })
export const appearanceRuntime = () => getCssRuntime(document, currentAppearance)
const fontOwners = new WeakMap<Document, CustomFontRuntime>()
export function fontRuntime(doc = document): CustomFontRuntime {
    let owner = fontOwners.get(doc)
    if (!owner) { owner = new CustomFontRuntime(doc); fontOwners.set(doc, owner) }
    return owner
}
const clone = <T>(value: T): T => value === undefined ? value : JSON.parse(JSON.stringify(value))
export const readFontAsset = (path: string) => forageStorage.realStorage.readPersonalFont(path, FONT_LIMITS.file)
const currentCssSnapshot = (db: Database) => cssSnapshot(db, get(SafeModeStore), document.documentElement.getAttribute('data-personal-custom-font-ready'))

// Restore only values still equal to this operation's write. Newer siblings survive.
function restoreMatching(current: any, before: any, after: any): any {
    if (sameValue(before, after)) return current
    if (sameValue(current, after)) return clone(before)
    if (!current || !before || !after || typeof current !== 'object' || typeof before !== 'object' || typeof after !== 'object') return current
    if (Array.isArray(current) || Array.isArray(before) || Array.isArray(after)) {
        if (![current, before, after].every(v => Array.isArray(v) && v.every(i => i && typeof i.id === 'string'))) return current
        const result = current.map((item: any) => {
            const old = before.find((i: any) => i.id === item.id)
            const written = after.find((i: any) => i.id === item.id)
            return written ? restoreMatching(item, old, written) : item
        }).filter((item: any) => item !== undefined)
        if (sameValue(current.map((i: any) => i.id), after.map((i: any) => i.id))) {
            return before.map((item: any) => result.find((i: any) => i.id === item.id)
                ?? (!after.some((i: any) => i.id === item.id) ? clone(item) : undefined)).filter((item: any) => item !== undefined)
        }
        return result
    }
    const result = { ...current }
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
        const value = restoreMatching(current[key], before[key], after[key])
        if (value === undefined) delete result[key]
        else result[key] = value
    }
    return result
}
export async function commitAppearance(make: (db: Database) => void, verifyBefore: () => void, verifyAfter: () => void): Promise<void> {
    let mutated = false
    await saveAppearanceStrict(() => {
        verifyBefore()
        const before = clone(rawAppearance(DBState.db))
        const proposal = appearanceDraft(DBState.db)
        make(proposal)
        const after = clone(rawAppearance(proposal))
        const carrier = DBState.db as unknown as { pocketRisuPersonalSettings: Record<string, unknown> }
        carrier.pocketRisuPersonalSettings = { ...carrier.pocketRisuPersonalSettings, appearance: after }
        mutated = true
        return () => {
            if (rawAppearance(DBState.db).version !== after.version) return
            const current = DBState.db.pocketRisuPersonalSettings ?? {}
            const carrier = DBState.db as unknown as { pocketRisuPersonalSettings: Record<string, unknown> }
            carrier.pocketRisuPersonalSettings = { ...current, appearance: restoreMatching(rawAppearance(DBState.db), before, after) }
        }
    }, () => mutated ? verifyAfter() : verifyBefore())
}
export async function submitCssEdit(edit: CssEdit, base: unknown, saved: () => void): Promise<void> {
    const runtime = appearanceRuntime()
    if (runtime.busy) throw new Error('진행 중인 작업을 먼저 마쳐야 합니다.')
    const suppressed = runtime.suppressed
    const checkBase = () => {
        if (!sameValue(cssEditBase(DBState.db, edit), base)) throw new Error('같은 항목이나 순서가 다른 곳에서 변경되었습니다. 초안을 보존하고 현재 값을 다시 확인하세요.')
    }
    checkBase()
    const proposal = appearanceDraft(DBState.db)
    applyCssEdit(proposal, edit, suppressed)
    const snapshot = currentCssSnapshot(proposal)
    const expectedTarget = cssEditBase(proposal, edit)
    const checkProposal = () => {
        checkBase()
        const latest = appearanceDraft(DBState.db)
        applyCssEdit(latest, edit, suppressed)
        if (!sameValue(currentCssSnapshot(latest), snapshot)) throw new Error(edit.kind === 'toggle' ? '저장 전에 활성 설정이 바뀌었습니다. 다시 시도하세요.' : '시험 적용 후 활성 설정이 바뀌었습니다. 다시 시험 적용하세요.')
    }
    const commit = async () => {
        await commitAppearance(db => applyCssEdit(db, edit, suppressed), checkProposal, () => {
            if (!sameValue(cssEditBase(DBState.db, edit), expectedTarget)) throw new Error('저장 중 대상 설정이 변경되었습니다.')
        })
        if (suppressed) runtime.requireValidation()
        saved()
    }
    if (edit.kind !== 'toggle' && !sameValue(currentCssSnapshot(DBState.db), snapshot) && !suppressed) runtime.trial(snapshot, commit)
    else await runtime.save(commit)
}
export async function trialAppearanceActivation(): Promise<void> {
    const runtime = appearanceRuntime()
    if (!readCssToggles(DBState.db).valid) throw new Error('손상된 CSS 설정을 먼저 복사하고 초기화하세요.')
    const fontBase = fontEditBase()
    const fonts = readCustomFonts(DBState.db)
    const selected = rawAppearance(DBState.db).chat?.font
    const entry = fonts.valid ? fonts.value.custom?.find(font => `custom:${font.id}` === selected) : undefined
    const owner = fontRuntime()
    let prepared: FontFace | undefined
    if (entry && !owner.matches(entry)) {
        try {
            await runtime.prepare(async () => { prepared = await owner.load(entry, () => readFontAsset(entry.assetPath), false) })
        } catch (error) {
            if ((error as any)?.cancelled) { if (prepared) owner.release(prepared); throw error }
            customFontLoadStatus.set('저장된 폰트를 불러올 수 없어 앱 폰트 상태로 시험 적용합니다.')
        }
        if (!sameValue(fontBase, fontEditBase())) { if (prepared) owner.release(prepared); throw new Error('폰트 준비 중 선택이 변경되었습니다. 다시 시험 적용하세요.') }
    }
    if (prepared && entry) owner.activate(entry, prepared)
    const snapshot = currentCssSnapshot(DBState.db)
    const base = clone(rawAppearance(DBState.db).cssToggles)
    try {
        runtime.trial(snapshot, () => runtime.clearRecovery(snapshot, async () => {
            if (!base?.needsValidation) return
            const check = () => { if (!sameValue(rawAppearance(DBState.db).cssToggles, base)) throw new Error('복구 중 CSS 설정이 바뀌었습니다.') }
            await commitAppearance(db => writeAppearanceGroup(db, 'cssToggles', { ...base, needsValidation: false }), check, () => {})
        }), prepared ? () => owner.release(prepared!) : undefined)
    } catch (error) { if (prepared) owner.release(prepared); throw error }
}
let fontGeneration = 0
let selectedFontKey: string | null = ''
export function disposePersonalAppearance(): void {
    ++fontGeneration
    selectedFontKey = ''
    fontOwners.get(document)?.clear()
    fontOwners.delete(document)
    disposeCssRuntime(document)
}
export function syncCustomFont(): void {
    const runtime = appearanceRuntime()
    const owner = fontRuntime()
    if (runtime.busy && !runtime.suppressed) return
    const read = readCustomFonts(DBState.db)
    const selection = rawAppearance(DBState.db).chat?.font
    const entry = read.valid && typeof selection === 'string' && selection.startsWith('custom:')
        ? read.value.custom?.find(f => `custom:${f.id}` === selection) : undefined
    const key = !runtime.suppressed && entry ? `${entry.id}:${entry.sha256}:${entry.assetPath}` : ''
    if (key === selectedFontKey) return
    selectedFontKey = key
    const generation = ++fontGeneration
    if (!key || !entry) { owner.clear(); runtime.sync(); customFontLoadStatus.set(runtime.suppressed ? '사용자 폰트 적용이 중지되어 있습니다.' : '저장된 사용자 폰트를 찾을 수 없어 앱 폰트를 사용합니다.'); return }
    if (owner.matches(entry)) { customFontLoadStatus.set('저장된 사용자 폰트를 불러왔습니다.'); return }
    customFontLoadStatus.set('저장된 사용자 폰트의 무결성과 로드를 확인하는 중…')
    void owner.load(entry, () => readFontAsset(entry.assetPath)).then(face => {
        if (generation !== fontGeneration || runtime.suppressed || runtime.busy) { owner.release(face); if (generation === fontGeneration) selectedFontKey = ''; return }
        owner.activate(entry, face)
        customFontLoadStatus.set('저장된 사용자 폰트를 불러왔습니다.')
        runtime.sync()
    }).catch(() => {
        if (generation === fontGeneration) {
            if (!owner.hasActive) owner.clear()
            runtime.sync()
            selectedFontKey = ''
            customFontLoadStatus.set('폰트를 불러올 수 없습니다. 기존 폰트 또는 앱 폰트를 사용합니다. 저장된 설정과 자산은 보존됩니다.')
        }
    })
}
export function fontEditBase(): unknown { return clone({ fonts: rawAppearance(DBState.db).fonts, selection: rawAppearance(DBState.db).chat?.font }) }
export async function commitFont(make: (db: Database) => void, base: unknown, done: () => void): Promise<void> {
    const check = () => { if (!sameValue(fontEditBase(), base)) throw new Error('폰트 목록 또는 선택이 변경되었습니다. 다시 확인하세요.') }
    check()
    const draft = appearanceDraft(DBState.db)
    make(draft)
    if (!readCustomFonts(draft).valid && (!sameValue(rawAppearance(draft).fonts, rawAppearance(DBState.db).fonts)
        || String(rawAppearance(draft).chat?.font).startsWith('custom:'))) throw new Error('폰트 설정 또는 저장 한도가 올바르지 않습니다.')
    const expected = clone({ fonts: rawAppearance(draft).fonts, selection: rawAppearance(draft).chat?.font })
    await appearanceRuntime().save(async () => {
        await commitAppearance(make, check, () => {
            if (!sameValue(fontEditBase(), expected)) throw new Error('저장 중 폰트 목록 또는 선택이 변경되었습니다.')
        })
        done()
    }, 'font')
    // Font synchronization deliberately skips the saving lane. Run it only
    // after that lane closes, including clearing a formerly selected face.
    selectedFontKey = null
    syncCustomFont()
}
export async function persistImportedFont(entry: CustomFont, bytes: Uint8Array, base: unknown, done: () => void): Promise<void> {
    if (!sameValue(fontEditBase(), base)) throw new Error('미리보기 후 폰트 설정이 변경되었습니다.')
    await verifyFontBytes(entry, bytes)
    const provisional = { ...entry, assetPath: `assets/${entry.sha256}.${fontExtension[entry.format]}` }
    const draft = appearanceDraft(DBState.db)
    writeFontEntry(draft, provisional, entry.id)
    const assetPath = await saveAsset(bytes, entry.sha256, `font.${fontExtension[entry.format]}`)
    await verifyFontBytes(entry, await readFontAsset(assetPath))
    await commitFont(db => writeFontEntry(db, { ...entry, assetPath }, entry.id), base, done)
}
export async function selectCustomFont(id: string, base: unknown): Promise<void> {
    if (appearanceRuntime().suppressed) throw new Error('꾸미기 적용을 재개한 뒤 사용자 폰트를 선택하세요.')
    const entry = readCustomFonts(DBState.db).value.custom?.find(f => f.id === id)
    if (!entry) throw new Error('폰트를 찾을 수 없습니다.')
    const owner = fontRuntime()
    const face = await owner.load(entry, () => readFontAsset(entry.assetPath))
    let activated = false
    try {
        await commitFont(db => {
            if (!setPersonalAppearanceValue(db, 'chat.font', `custom:${id}`)) throw new Error('폰트 선택을 저장할 수 없습니다.')
        }, base, () => {
            if (!appearanceRuntime().suppressed) { owner.activate(entry, face); activated = true }
        })
    } finally { if (!activated) owner.release(face) }
}
