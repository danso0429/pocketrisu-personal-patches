import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { beginSaveTrace, endSaveTrace, isSaveTraceEnabled, setSaveTraceEnabled, takeSaveTraceSummary, traceSpan, traceStart, traceValue } from './saveTrace'

function memoryStorage() {
    const values = new Map<string, string>()
    return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value) },
        removeItem: (key: string) => { values.delete(key) },
    }
}

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()) })
afterEach(() => { endSaveTrace(); takeSaveTraceSummary(); vi.unstubAllGlobals() })

test('the switch is off by default and records nothing', () => {
    expect(isSaveTraceEnabled()).toBe(false)
    beginSaveTrace()
    expect(traceStart()).toBe(0)
    traceValue('total', 12)
    traceSpan('rootWalk', 0)
    endSaveTrace()
    expect(takeSaveTraceSummary()).toBe('')
})

test('an enabled trace reports recorded spans in a fixed order, once', () => {
    setSaveTraceEnabled(true)
    beginSaveTrace()
    traceValue('flush', 20.4)
    traceValue('rootWalk', 30)
    traceValue('rootWalk', 4.4)
    traceValue('total', 120.6)
    endSaveTrace()
    expect(takeSaveTraceSummary()).toBe('측정(ms) 전체 121 · root 34 · flush 20')
    expect(takeSaveTraceSummary()).toBe('')
    traceValue('total', 5)
    endSaveTrace()
    expect(takeSaveTraceSummary()).toBe('')
})

test('turning the switch off and unavailable storage both disable tracing', () => {
    setSaveTraceEnabled(true)
    setSaveTraceEnabled(false)
    expect(isSaveTraceEnabled()).toBe(false)
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') }, removeItem: () => { throw new Error('blocked') } })
    expect(() => setSaveTraceEnabled(true)).not.toThrow()
    expect(isSaveTraceEnabled()).toBe(false)
})
