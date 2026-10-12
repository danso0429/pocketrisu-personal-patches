import { describe, expect, it, vi } from 'vitest'
import { acceptStreamPreview, acceptActiveStreamOperation, closePreviewThoughts, createStreamPreviewObserver, STREAM_PREVIEW_MAX_BYTES } from './bgStreamPreview'
const snapshot = (text = 'answer', revision = 1) => ({ active: true, streaming: true,
    operationId: 'op', rowChatId: 'actual-row', revision, text, oversized: false })
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
const flush = async () => { for (let n = 0; n < 8; n++) await Promise.resolve() }

describe('stream display observation', () => {
    it('validates current-operation metadata independently from formatted preview availability', () => {
        expect(acceptActiveStreamOperation({ active: false })).toBeNull()
        expect(acceptActiveStreamOperation({ active: true, streaming: false, operationId: 'A', answerReady: false })).toBe('A')
        expect(acceptActiveStreamOperation({ active: true, streaming: false, operationId: 'A', answerReady: true })).toBeNull()
        expect(acceptActiveStreamOperation(snapshot())).toBe(acceptStreamPreview(snapshot(), null)!.operationId)
        for (const body of [{ active: true, streaming: false, answerReady: false },
            { active: true, streaming: false, operationId: '', answerReady: false },
            { active: true, streaming: false, operationId: 'A' },
            { active: true, operationId: 'A', answerReady: false }]) {
            expect(() => acceptActiveStreamOperation(body)).toThrow()
        }
    })
    it('publishes active control through analysis, streaming, completion and successor without rendering analysis', async () => {
        const operations: (string | null)[] = [], views: any[] = [], tasks: (() => void)[] = []
        const read = vi.fn().mockResolvedValueOnce({ active: true, streaming: false, operationId: 'A', answerReady: false })
            .mockResolvedValueOnce({ ...snapshot(), operationId: 'A' }).mockResolvedValueOnce({ active: false })
            .mockResolvedValueOnce({ active: true, streaming: false, operationId: 'B', answerReady: false })
        const render = vi.fn(async (row: any) => row.text)
        const observer = createStreamPreviewObserver({ read, render, publish: value => views.push(value),
            publishOperation: value => operations.push(value), visible: () => true,
            schedule: task => { tasks.push(task); return 1 as any }, unschedule: () => {} })
        observer.wake(); await flush()
        for (let n = 0; n < 3; n++) { tasks.shift()!(); await flush() }
        expect(operations).toEqual(['A', 'A', null, 'B']); expect(render).toHaveBeenCalledTimes(1)
        observer.dispose(); expect(operations.at(-1)).toBeNull()
    })
    it('clears control on failed reads and pause and rejects old control after an ignored abort', async () => {
        const late = deferred<unknown>(), controls: (string | null)[] = [], tasks: (() => void)[] = []
        const read = vi.fn().mockResolvedValueOnce({ active: true, streaming: false, operationId: 'A', answerReady: false })
            .mockRejectedValueOnce(Error('offline')).mockImplementationOnce(() => late.promise)
        const observer = createStreamPreviewObserver({ read, render: async row => row.text, publish: () => {},
            publishOperation: value => controls.push(value), visible: () => true,
            schedule: task => { tasks.push(task); return 1 as any }, unschedule: () => {} })
        observer.wake(); await flush(); tasks.shift()!(); await flush(); expect(controls).toEqual(['A', null])
        tasks.shift()!(); observer.pause(); late.resolve({ active: true, streaming: false, operationId: 'old', answerReady: false })
        await flush(); expect(controls).toEqual(['A', null, null]); observer.dispose(); expect(controls.at(-1)).toBeNull()
    })
    it('orders by revision, accepts shrinking text and never invents unchanged text', () => {
        const first = acceptStreamPreview(snapshot('long answer'), null)!
        const next = acceptStreamPreview(snapshot('a', 2), first)!
        expect(next.text).toBe('a')
        expect(acceptStreamPreview(snapshot('stale', 1), next)).toBe(next)
        expect(acceptStreamPreview({ ...snapshot('', 2), text: undefined, unchanged: true }, next)).toBe(next)
        expect(() => acceptStreamPreview({ ...snapshot(), unchanged: true }, null)).toThrow()
        expect(acceptStreamPreview({ active: false }, first)).toBeNull()
    })
    it('rejects malformed or oversized bodies and preserves opaque identities', () => {
        for (const change of [{ revision: NaN }, { revision: 0 }, { rowChatId: '' }, { text: null },
            { oversized: true, text: 'hidden' }, { text: '가'.repeat(STREAM_PREVIEW_MAX_BYTES) }]) {
            expect(() => acceptStreamPreview({ ...snapshot(), ...change }, null)).toThrow()
        }
        expect(acceptStreamPreview({ ...snapshot(''), oversized: true }, null)?.oversized).toBe(true)
    })
    it('closes incomplete/nested thought blocks solely for formatted display', () => {
        expect(closePreviewThoughts('answer<Thoughts>hidden')).toBe('answer<Thoughts>hidden</Thoughts>')
        expect(closePreviewThoughts('<Thoughts>a<Thoughts>b')).toBe('<Thoughts>a<Thoughts>b</Thoughts></Thoughts>')
        expect(closePreviewThoughts('<Thoughts>done</Thoughts>answer')).toBe('<Thoughts>done</Thoughts>answer')
    })
    it('serializes observers and rejects late reads after pause/navigation even if abort is ignored', async () => {
        const read = deferred<unknown>(), published: any[] = [], tasks: (() => void)[] = []
        let visible = true
        const signals: AbortSignal[] = []
        const observer = createStreamPreviewObserver({
            read: (_previous, signal) => { signals.push(signal); return read.promise },
            render: async row => row.text, publish: value => published.push(value), visible: () => visible,
            schedule: task => { tasks.push(task); return 1 as any }, unschedule: () => {},
        })
        observer.wake(); observer.wake(); expect(signals).toHaveLength(1)
        visible = false; observer.pause(); expect(signals[0].aborted).toBe(true)
        visible = true; observer.wake(); read.resolve(snapshot('old chat')); await flush()
        expect(published).toEqual([null]); expect(tasks).toHaveLength(1)
        observer.dispose(); tasks[0](); expect(signals).toHaveLength(1)
    })
    it('discards late async formatting and recovers after a failed observation without side effects', async () => {
        const rendering = deferred<string>(), values: any[] = [], tasks: (() => void)[] = []
        const read = vi.fn().mockResolvedValueOnce(snapshot()).mockRejectedValueOnce(Error('body lost'))
            .mockResolvedValueOnce(snapshot('healthy', 2))
        const observer = createStreamPreviewObserver({ read, render: vi.fn().mockImplementationOnce(() => rendering.promise)
            .mockImplementation(async row => row.text), publish: value => values.push(value), visible: () => true,
            schedule: task => { tasks.push(task); return 1 as any }, unschedule: () => {},
        })
        observer.wake(); await flush(); observer.pause(); observer.wake()
        rendering.resolve('late html'); await flush(); expect(values).toEqual([null])
        tasks.shift()!(); await flush(); expect(values).toEqual([null, null])
        tasks.shift()!(); await flush(); expect(values.at(-1)?.html).toBe('healthy')
        observer.dispose()
    })
})
