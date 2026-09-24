import type { Database } from '../storage/database.svelte'
import { cssToggleDefinitions } from './cssToggleDefinitions'
import { readPersonalAppearance, resolvePersonalAppearanceTokens, setPersonalAppearanceValue } from './appearanceValues'

// Candidate limits; device admission is recorded separately from desktop measurements.
export const CSS_LIMITS = Object.freeze({ count: 100, name: 256, description: 2048, item: 100_000, total: 1_000_000, warningCount: 50, warningItem: 50_000, warningTotal: 500_000, trialMs: 15_000 })
export const utf8Bytes = (value: string) => new TextEncoder().encode(value).byteLength
export const isRecord = (value: unknown): value is Record<string, any> => value !== null && typeof value === 'object' && !Array.isArray(value)
export const sameValue = (a: unknown, b: unknown): boolean => {
    if (Object.is(a, b)) return true
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => sameValue(v, b[i]))
    if (!isRecord(a) || !isRecord(b)) return false
    const keys = Object.keys(a)
    return keys.length === Object.keys(b).length && keys.every(k => Object.hasOwn(b, k) && sameValue(a[k], b[k]))
}
export function newPersonalId(): string {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID()
    const bytes = new Uint8Array(16)
    if (!globalThis.crypto?.getRandomValues) throw new Error('안전한 ID 생성 기능을 사용할 수 없습니다.')
    crypto.getRandomValues(bytes)
    return Array.from(bytes, v => v.toString(16).padStart(2, '0')).join('')
}
export const validPersonalId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value)
export interface CssOverride { baseRevision: number; name?: string; description?: string; css?: string; [key: string]: unknown }
export interface CustomCssToggle { id: string; name: string; description: string; css: string; enabled: boolean; [key: string]: unknown }
export interface CssTogglesV1 { version: 1; overrides?: Record<string, CssOverride>; custom?: CustomCssToggle[]; needsValidation?: boolean; [key: string]: unknown }
export interface EffectiveCssToggle extends CustomCssToggle { shipped: boolean; modified: boolean; newerDefault: boolean; settingId?: string }
export function rawAppearance(db: Database): Record<string, any> {
    const personal: unknown = db.pocketRisuPersonalSettings
    return isRecord(personal) && isRecord(personal.appearance) ? personal.appearance : {}
}
export function writeAppearanceGroup(db: Database, key: string, value: unknown): void {
    if (readPersonalAppearance(db).schemaStatus === 'unsupported') throw new Error('지원하지 않는 꾸미기 설정입니다.')
    const personal = db.pocketRisuPersonalSettings ?? {}
    const next = { ...rawAppearance(db), version: 1 }
    if (value === undefined) delete next[key]
    else next[key] = value
    const carrier = db as unknown as { pocketRisuPersonalSettings: Record<string, unknown> }
    carrier.pocketRisuPersonalSettings = { ...personal, appearance: next }
}
export function readCssToggles(db: Database): { valid: boolean; value: CssTogglesV1; error?: string } {
    const raw = rawAppearance(db).cssToggles
    const empty: CssTogglesV1 = { version: 1 }
    if (raw === undefined) return { valid: true, value: empty }
    const invalid = () => ({ valid: false, value: empty, error: 'CSS 설정의 버전·형식 또는 저장 한도를 확인할 수 없습니다. 원본을 복사한 뒤 초기화할 수 있습니다.' })
    if (!isRecord(raw) || raw.version !== 1 || (raw.overrides !== undefined && !isRecord(raw.overrides)) || (raw.custom !== undefined && !Array.isArray(raw.custom))) return invalid()
    if (raw.needsValidation !== undefined && typeof raw.needsValidation !== 'boolean') return invalid()
    let total = 0
    const stringsValid = (item: Record<string, any>, partial: boolean) => {
        for (const [key, limit] of [['name', CSS_LIMITS.name], ['description', CSS_LIMITS.description], ['css', CSS_LIMITS.item]] as const) {
            if (partial && item[key] === undefined) continue
            if (typeof item[key] !== 'string' || utf8Bytes(item[key]) > limit || (key === 'name' && !item[key].trim())) return false
        }
        total += utf8Bytes(item.css ?? '')
        return true
    }
    for (const [id, override] of Object.entries(raw.overrides ?? {})) {
        if (!cssToggleDefinitions.some(d => d.id === id) || !isRecord(override) || !Number.isSafeInteger(override.baseRevision) || override.baseRevision < 1 || !stringsValid(override, true)) return invalid()
    }
    const custom = raw.custom ?? []
    if (custom.length > CSS_LIMITS.count) return invalid()
    const ids = new Set<string>()
    for (const item of custom) {
        if (!isRecord(item) || !validPersonalId(item.id) || ids.has(item.id) || typeof item.enabled !== 'boolean' || !stringsValid(item, false)) return invalid()
        ids.add(item.id)
    }
    if (total > CSS_LIMITS.total) return invalid()
    return { valid: true, value: raw as CssTogglesV1 }
}
export function effectiveCssToggles(db: Database): EffectiveCssToggle[] {
    const read = readCssToggles(db)
    const appearance = readPersonalAppearance(db)
    const shipped = cssToggleDefinitions.map(d => {
        const override = read.valid ? read.value.overrides?.[d.id] : undefined
        const [group, leaf] = d.id.split('.')
        const value = (appearance as any)[group][leaf]
        return { id: d.id, name: override?.name ?? d.name, description: override?.description ?? d.description,
            css: override?.css ?? d.css, enabled: d.id === 'chat.alignment' ? value === 'center' : value === true,
            shipped: true, modified: !!override, newerDefault: !!override && override.baseRevision < d.revision, settingId: d.settingId }
    })
    return [...shipped, ...(read.valid ? read.value.custom ?? [] : []).map(d => ({ ...d, shipped: false, modified: false, newerDefault: false }))]
}
export function storedCssBytes(db: Database): number {
    const value = readCssToggles(db).value
    return Object.values(value.overrides ?? {}).reduce((sum, item) => sum + utf8Bytes(item.css ?? ''), 0)
        + (value.custom ?? []).reduce((sum, item) => sum + utf8Bytes(item.css), 0)
}
export interface CssSnapshot { gates: unknown[]; tokens: string[]; nodes: { key: string; css: string }[]; revisions: number[]; customFontId?: string }
export function cssSnapshot(db: Database, safeMode: boolean, readyCustomFontId?: string | null): CssSnapshot {
    const appearance = readPersonalAppearance(db)
    const active = !safeMode && db.theme === '' && appearance.schemaStatus !== 'unsupported' && appearance.enabled
    const read = readCssToggles(db)
    const items = effectiveCssToggles(db)
    // Invalid additive data never disables unrelated, code-owned defaults.
    return { gates: [safeMode, db.theme, appearance.schemaStatus, appearance.enabled, read.valid, appearance.chat.font],
        tokens: resolvePersonalAppearanceTokens(db, safeMode).filter(token => token !== 'chat-font-custom' || `custom:${readyCustomFontId}` === appearance.chat.font),
        customFontId: appearance.chat.font.startsWith('custom:') ? appearance.chat.font.slice(7) : undefined,
        nodes: active ? items.filter(d => d.enabled).map(d => ({ key: `${d.shipped ? 'shipped' : 'custom'}:${d.id}`, css: d.css })) : [],
        revisions: cssToggleDefinitions.map(d => d.revision) }
}
export type CssEdit = { kind: 'put'; item: CustomCssToggle; shipped: boolean } | { kind: 'toggle'; id: string; enabled: boolean } | { kind: 'reset'; id: string; disable?: boolean } | { kind: 'delete'; id: string } | { kind: 'move'; id: string; direction: -1 | 1 } | { kind: 'reset-group' }
export function cssEditBase(db: Database, edit: CssEdit): unknown {
    const raw = rawAppearance(db).cssToggles
    const copy = (value: unknown) => value === undefined ? undefined : JSON.parse(JSON.stringify(value))
    if (edit.kind === 'reset-group') return copy(raw)
    const id = edit.kind === 'put' ? edit.item.id : edit.id
    const item = effectiveCssToggles(db).find(i => i.id === id)
    return copy({ version: raw?.version, item, override: raw?.overrides?.[id], order: (raw?.custom ?? []).map((i: any) => i.id) })
}
export function applyCssEdit(db: Database, edit: CssEdit, suppressed: boolean): void {
    if (edit.kind === 'reset-group') {
        writeAppearanceGroup(db, 'cssToggles', undefined)
        return
    }
    const read = readCssToggles(db)
    if (!read.valid) throw new Error(read.error)
    const value = { ...read.value, overrides: { ...read.value.overrides }, custom: [...(read.value.custom ?? [])] }
    const id = edit.kind === 'put' ? edit.item.id : edit.id
    const definition = cssToggleDefinitions.find(d => d.id === id)
    const index = value.custom.findIndex(d => d.id === id)
    const previous = effectiveCssToggles(db).find(d => d.id === id)
    if (edit.kind === 'toggle') {
        if (!previous) throw new Error('변경할 CSS를 찾을 수 없습니다.')
        if (suppressed && edit.enabled) throw new Error('꾸미기 적용을 재개한 뒤 CSS를 켜세요.')
        if (definition) setPersonalAppearanceValue(db, definition.id, definition.id === 'chat.alignment' ? (edit.enabled ? 'center' : 'left') : edit.enabled)
        else value.custom[index] = { ...value.custom[index], enabled: edit.enabled }
    } else if (edit.kind === 'move') {
        if (suppressed) throw new Error('꾸미기가 중지된 동안 순서를 바꿀 수 없습니다.')
        const to = index + edit.direction
        if (index < 0 || to < 0 || to >= value.custom.length) throw new Error('이동할 항목이 없습니다.')
        ;[value.custom[index], value.custom[to]] = [value.custom[to], value.custom[index]]
    } else if (edit.kind === 'delete') {
        if (definition || index < 0) throw new Error('삭제할 사용자 CSS가 없습니다.')
        value.custom.splice(index, 1)
    } else if (edit.kind === 'reset') {
        if (!definition) throw new Error('기본 CSS가 아닙니다.')
        delete value.overrides[id]
        if (edit.disable || suppressed) setPersonalAppearanceValue(db, definition.id, definition.id === 'chat.alignment' ? 'left' : false)
    } else {
        const metadataOnly = !!previous && previous.css === edit.item.css && previous.enabled === edit.item.enabled
        if (suppressed && !metadataOnly && edit.item.enabled) throw new Error('수정한 CSS를 꺼진 상태로 저장해야 합니다.')
        if (edit.shipped) {
            if (!definition) throw new Error('기본 CSS를 찾을 수 없습니다.')
            const override: CssOverride = { ...value.overrides[id], baseRevision: definition.revision }
            for (const key of ['name', 'description', 'css'] as const) {
                if (edit.item[key] === definition[key]) delete override[key]
                else override[key] = edit.item[key]
            }
            if (Object.keys(override).length === 1) delete value.overrides[id]
            else value.overrides[id] = override
            setPersonalAppearanceValue(db, definition.id, definition.id === 'chat.alignment' ? (edit.item.enabled ? 'center' : 'left') : edit.item.enabled)
        } else if (index < 0) value.custom.push({ ...edit.item })
        else value.custom[index] = { ...value.custom[index], ...edit.item }
    }
    if (suppressed) value.needsValidation = true
    writeAppearanceGroup(db, 'cssToggles', value)
    const validated = readCssToggles(db)
    if (!validated.valid) throw new Error(validated.error)
}
// Clone only the bounded appearance carrier, never the full root or plugin array.
export function appearanceDraft(db: Database): Database {
    return { theme: db.theme, pocketRisuPersonalSettings: JSON.parse(JSON.stringify(db.pocketRisuPersonalSettings ?? {})) } as Database
}
