import { expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { setImmediate as afterTurn } from 'node:timers/promises'
import { AsyncLocalStorage } from 'node:async_hooks'
const { installBgStreamingScheduler } = createRequire(import.meta.url)('./bgStreamingScheduler.cjs')

it('executes asynchronous frame callbacks with a monotonic timestamp', async () => {
    const target: any = {}; installBgStreamingScheduler(target)
    let called = false
    const start = performance.now()
    const frame = new Promise<number>(resolve => target.requestAnimationFrame((time: number) => { called = true; resolve(time) }))
    expect(called).toBe(false)
    expect(await frame).toBeGreaterThanOrEqual(start)
})

it('cancels the scheduled Node frame and preserves a compatible installed pair', async () => {
    const target: any = {}; installBgStreamingScheduler(target)
    let called = false
    const handle = target.requestAnimationFrame(() => { called = true })
    target.cancelAnimationFrame(handle); await afterTurn()
    expect(called).toBe(false)
    const previous = { ...target }
    expect(installBgStreamingScheduler(target)).toBe(false)
    expect(target).toEqual(previous)
    expect(() => target.requestAnimationFrame(null)).toThrow(TypeError)
    expect(() => installBgStreamingScheduler({ requestAnimationFrame: () => {} })).toThrow('incomplete')
})

it('reports synchronous callback failure without killing the next frame', async () => {
    const target: any = {}; installBgStreamingScheduler(target)
    const original = console.error; const errors: string[] = []
    console.error = (...args) => { errors.push(args.join(' ')) }
    try {
        target.requestAnimationFrame(() => { throw Error('private callback content') })
        await new Promise(resolve => target.requestAnimationFrame(resolve))
        expect(errors).toEqual(['[bg-orch] streaming frame callback failed'])
    } finally { console.error = original }
})

it('keeps each scheduled frame in its original operation context', async () => {
    const target: any = {}, context = new AsyncLocalStorage<string>()
    installBgStreamingScheduler(target)
    const values = await Promise.all(['first', 'second'].map(identity => context.run(identity,
        () => new Promise(resolve => target.requestAnimationFrame(() => resolve(context.getStore()))))))
    expect(values).toEqual(['first', 'second'])
})
