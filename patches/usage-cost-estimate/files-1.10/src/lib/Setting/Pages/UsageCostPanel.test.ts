// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, tick, unmount } from 'svelte'
import Harness from './UsageCostPanelHarness.test.svelte'
import { fetchUsageEntries } from 'src/ts/requestLog'
import type { UsageReport } from 'src/ts/requestLog'
vi.mock('src/ts/requestLog', () => ({ fetchUsageEntries: vi.fn() }))
vi.mock('src/lang', () => ({ language: new Proxy({}, { get: (_, key) => String(key) }) }))
const mounted: Array<{ component: any, target: HTMLElement }> = []
afterEach(async () => {
    for (const { component, target } of mounted.splice(0)) { await unmount(component); target.remove() }
    vi.resetAllMocks()
})
function report(): UsageReport {
    const bucket = { requests: 1, failed: 0, inputTokens: 100, outputTokens: 15, cachedTokens: 80, reasoningTokens: 5, avgDurationMs: 10 }
    return { total: bucket, daily: [], byModel: [{ ...bucket, model: 'gemini-4-argon', provider: 'google' }], bySource: [],
        dimensions: { models: [], sources: [], categories: [] }, costVersion: 1,
        costBuckets: [{ ...bucket, model: 'gemini-4-argon', provider: 'google', context: null }], cumulativeCostBuckets: [] }
}
function render(value = report()) {
    const target = document.createElement('div'); document.body.appendChild(target)
    const component = mount(Harness, { target, props: { initialReport: value, initialQuery: { sources: ['main'] } } })
    mounted.push({ component, target }); return { target, component }
}
const flush = async () => { await tick(); await Promise.resolve(); await tick() }
describe('usage cost readout and asynchronous list ownership', () => {
    it('shows recorded cached and reasoning tokens at every width without claiming legacy costs', async () => {
        vi.mocked(fetchUsageEntries).mockResolvedValue({ costVersion: 1, entries: [], nextCursor: null })
        const { target } = render(); await flush()
        expect(target.textContent).toContain('usageCachedTokens 80')
        expect(target.textContent).toContain('80.0%')
        expect(target.textContent).toContain('usageReasoningTokens 5')
        expect(target.textContent).toContain('usageEstimatedCost —')
        expect(target.textContent).toContain('usageCostUnknown 1')
        // CSS/layout and disclosure visibility are measured in Chromium.
        // Overflow clipping and a hidden native marker do not hide these data.
    })
    it('shows unavailable for old servers without fetching a list or presenting zero as known cost', async () => {
        const old = report(); delete old.costVersion; delete old.costBuckets; delete old.cumulativeCostBuckets
        const { target } = render(old); await flush()
        expect(fetchUsageEntries).not.toHaveBeenCalled()
        expect(target.textContent).toContain('usageCostUnavailable')
        expect(target.textContent).not.toContain('$0.0000')
    })
    it('retains positive recorded legacy tokens while leaving their cost unknown', async () => {
        vi.mocked(fetchUsageEntries).mockResolvedValue({ costVersion: 1, entries: [{ id: 3, timestamp: 1,
            model: 'legacy', provider: null, source: 'main', success: 1, context: null,
            inputTokens: 100, outputTokens: 20, cachedTokens: 80, reasoningTokens: 0 }], nextCursor: null })
        const { target } = render(); await flush()
        const attempt = target.querySelector('article time')!.closest('article')!
        expect(attempt.textContent).toContain('usageInputTokens 100')
        expect(attempt.textContent).toContain('usageCachedTokens 80')
        expect(attempt.textContent).toContain('usageCostUnknown —')
    })
    it('discards a late old-filter response', async () => {
        let resolveOld!: (value: any) => void
        vi.mocked(fetchUsageEntries).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
            .mockResolvedValueOnce({ costVersion: 1, entries: [], nextCursor: null })
        const { target, component } = render(); await flush()
        component.update(report(), { sources: ['sub'] }); await flush()
        resolveOld({ costVersion: 1, entries: [{ id: 99, timestamp: 0, model: 'stale-model', context: null }], nextCursor: null })
        await flush()
        expect(target.textContent).not.toContain('stale-model')
        expect(fetchUsageEntries).toHaveBeenLastCalledWith({ sources: ['sub'] }, null)
    })
    it('does not adopt a pending response after unmount', async () => {
        let resolve!: (value: any) => void
        vi.mocked(fetchUsageEntries).mockImplementationOnce(() => new Promise(done => { resolve = done }))
        const { target, component } = render(); await flush()
        mounted.pop()
        await unmount(component)
        resolve({ costVersion: 1, entries: [{ id: 7, timestamp: 0, model: 'after-unmount' }], nextCursor: null })
        await flush()
        expect(target.textContent).toBe('')
        target.remove()
    })
    it('prevents duplicate load-more clicks and retains the cursor for a retry', async () => {
        const cursor = { timestamp: 1, id: 2 }
        vi.mocked(fetchUsageEntries).mockResolvedValueOnce({ costVersion: 1, entries: [], nextCursor: cursor })
            .mockResolvedValueOnce(null).mockResolvedValueOnce({ costVersion: 1, entries: [], nextCursor: null })
        const { target } = render(); await flush()
        const more = [...target.querySelectorAll('button')].find(b => b.textContent === 'usageCostMore')!
        more.click(); more.click(); await flush()
        expect(fetchUsageEntries).toHaveBeenCalledTimes(2)
        target.querySelector('button')!.click(); await flush()
        expect(fetchUsageEntries).toHaveBeenCalledTimes(3)
        expect(fetchUsageEntries).toHaveBeenLastCalledWith({ sources: ['main'] }, cursor)
    })
})
