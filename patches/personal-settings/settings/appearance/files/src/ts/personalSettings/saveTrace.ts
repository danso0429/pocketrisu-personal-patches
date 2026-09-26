// Opt-in timing of strict appearance saves (root-only save plan, S0b). The
// switch lives only in this device's storage and is off by default. While a
// trace is inactive every hook is a single boolean check.
const STORAGE_KEY = 'pocketrisu.personal.saveTrace'
const LABELS = [
    ['total', '전체'], ['wait', '대기'], ['clone', '복사'], ['characterWalk', '캐릭터'],
    ['rootWalk', 'root'], ['write', '쓰기'], ['request', '왕복'], ['flush', 'flush'],
] as const

export interface SaveTraceResult { summary: string; spans: Record<string, number> }

let active = false
let spans: Record<string, number> = {}
let result: SaveTraceResult | null = null

export function isSaveTraceEnabled(): boolean {
    try { return globalThis.localStorage?.getItem(STORAGE_KEY) === '1' } catch { return false }
}

export function setSaveTraceEnabled(enabled: boolean): void {
    try {
        if (enabled) globalThis.localStorage?.setItem(STORAGE_KEY, '1')
        else globalThis.localStorage?.removeItem(STORAGE_KEY)
    } catch {}
}

export function beginSaveTrace(): void {
    spans = {}
    result = null
    active = isSaveTraceEnabled()
}

export function traceStart(): number {
    return active ? performance.now() : 0
}

export function traceSpan(name: string, start: number): void {
    if (active) spans[name] = (spans[name] ?? 0) + performance.now() - start
}

export function traceValue(name: string, ms: number): void {
    if (active) spans[name] = (spans[name] ?? 0) + ms
}

export function endSaveTrace(): void {
    if (active) {
        const recorded = LABELS.filter(([key]) => key in spans)
        if (recorded.length) {
            result = {
                summary: `측정(ms) ${recorded.map(([key, label]) => `${label} ${Math.round(spans[key])}`).join(' · ')}`,
                spans: Object.fromEntries(recorded.map(([key]) => [key, Math.round(spans[key] * 10) / 10])),
            }
        }
    }
    active = false
    spans = {}
}

export function takeSaveTrace(): SaveTraceResult | null {
    const value = result
    result = null
    return value
}
