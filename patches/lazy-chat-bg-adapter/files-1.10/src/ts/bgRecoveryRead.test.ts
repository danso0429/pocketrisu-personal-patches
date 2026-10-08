import { afterEach, describe, expect, it, vi } from 'vitest'
import { boundedRecoveryRead, fetchRecoveryControl, readRecoveryJson, readRecoveryBody } from './bgRecoveryRead'

afterEach(() => vi.useRealTimers())

describe('BG recovery read budgets', () => {
    it('bounds binary consumption with the original response controller', async () => {
        vi.useFakeTimers()
        let signal: AbortSignal | undefined
        const response = await fetchRecoveryControl(async (_url, init) => {
            signal = init?.signal as AbortSignal
            return new Response(new ReadableStream({ start() {} }))
        }, '/input-base')
        const clone = vi.spyOn(response, 'clone')
        const read = vi.spyOn(response, 'arrayBuffer')
        const pending = readRecoveryBody(response, () => response.arrayBuffer(), 30)
        const rejected = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' })
        await vi.advanceTimersByTimeAsync(30)
        await rejected
        expect(signal?.aborted).toBe(true)
        expect(read).toHaveBeenCalledTimes(1)
        expect(clone).not.toHaveBeenCalled()
        expect(vi.getTimerCount()).toBe(0)
    })
    it('includes asynchronous decode in the same budget and ignores its late value', async () => {
        vi.useFakeTimers()
        const response = await fetchRecoveryControl(async () => new Response(new Uint8Array([7])), '/input-base')
        let release!: (value: number) => void
        const publish = vi.fn()
        const pending = readRecoveryBody(response, async () => {
            const bytes = new Uint8Array(await response.arrayBuffer())
            expect(bytes).toEqual(new Uint8Array([7]))
            return new Promise<number>(resolve => { release = resolve })
        }, 30).then(publish)
        const rejected = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' })
        await vi.advanceTimersByTimeAsync(1)
        expect(release).toBeTypeOf('function')
        await vi.advanceTimersByTimeAsync(30)
        await rejected
        release(9)
        await Promise.resolve()
        expect(publish).not.toHaveBeenCalled()
        expect(vi.getTimerCount()).toBe(0)
    })
    it('observes caller abort between headers and binary consumption', async () => {
        const parent = new AbortController()
        const response = await fetchRecoveryControl(async () => new Response(new Uint8Array([7])),
            '/input-base', { signal: parent.signal })
        parent.abort()
        const consume = vi.fn(() => response.arrayBuffer())
        await expect(readRecoveryBody(response, consume)).rejects.toMatchObject({ name: 'AbortError' })
        expect(consume).not.toHaveBeenCalled()
    })
    it('bounds a stalled fetch even when its implementation ignores abort', async () => {
        vi.useFakeTimers()
        let signal: AbortSignal | undefined
        const pending = fetchRecoveryControl(async (_url, init) => {
            signal = init?.signal as AbortSignal
            return new Promise<Response>(() => {})
        }, '/control', {}, 15)
        const rejected = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' })
        await vi.advanceTimersByTimeAsync(15)
        await rejected
        expect(signal?.aborted).toBe(true)
        expect(vi.getTimerCount()).toBe(0)
    })

    it('bounds original body consumption after timely headers, without cloning', async () => {
        vi.useFakeTimers()
        let signal: AbortSignal | undefined
        const response = new Response(new ReadableStream({ start() {} }))
        const clone = vi.spyOn(response, 'clone')
        const got = await fetchRecoveryControl(async (_url, init) => {
            signal = init?.signal as AbortSignal
            return response
        }, '/result')
        expect(got).toBe(response)
        const pending = readRecoveryJson(response, 30)
        const rejected = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' })
        await vi.advanceTimersByTimeAsync(30)
        await rejected
        expect(signal?.aborted).toBe(true)
        expect(clone).not.toHaveBeenCalled()
        expect(vi.getTimerCount()).toBe(0)
    })

    it('late success cannot publish after a snapshot timeout', async () => {
        vi.useFakeTimers()
        let resolve!: (value: string) => void
        const publish = vi.fn()
        const pending = boundedRecoveryRead(() => new Promise<string>(r => { resolve = r }), 30).then(publish)
        const rejected = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' })
        await vi.advanceTimersByTimeAsync(30)
        await rejected
        resolve('late snapshot')
        await Promise.resolve()
        expect(publish).not.toHaveBeenCalled()
    })

    it('late failure is observed rather than becoming an unhandled rejection', async () => {
        vi.useFakeTimers()
        let reject!: (error: Error) => void
        const pending = boundedRecoveryRead(() => new Promise((_r, j) => { reject = j }), 30)
        const rejected = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' })
        await vi.advanceTimersByTimeAsync(30)
        await rejected
        reject(new Error('late transport failure'))
        await Promise.resolve()
    })

    it('preserves caller cancellation during body consumption', async () => {
        const parent = new AbortController()
        let signal: AbortSignal | undefined
        const response = await fetchRecoveryControl(async (_url, init) => {
            signal = init?.signal as AbortSignal
            return new Response(new ReadableStream({ start() {} }))
        }, '/result', { signal: parent.signal })
        const pending = readRecoveryJson(response)
        const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
        parent.abort()
        await rejected
        expect(signal?.aborted).toBe(true)
    })

    it('does not start an already cancelled read', async () => {
        const parent = new AbortController()
        parent.abort()
        const action = vi.fn()
        await expect(boundedRecoveryRead(action, 30, parent.signal)).rejects.toMatchObject({ name: 'AbortError' })
        expect(action).not.toHaveBeenCalled()
    })

    it('returns parsed data and clears timers on success', async () => {
        vi.useFakeTimers()
        const response = await fetchRecoveryControl(async () => Response.json({ ready: true }), '/result')
        await expect(readRecoveryJson(response)).resolves.toEqual({ ready: true })
        expect(vi.getTimerCount()).toBe(0)
    })

    it('preserves malformed JSON and synchronous failures', async () => {
        vi.useFakeTimers()
        await expect(readRecoveryJson(new Response('{'))).rejects.toBeInstanceOf(SyntaxError)
        await expect(boundedRecoveryRead(() => { throw new TypeError('broken') })).rejects.toBeInstanceOf(TypeError)
        expect(vi.getTimerCount()).toBe(0)
    })
})
