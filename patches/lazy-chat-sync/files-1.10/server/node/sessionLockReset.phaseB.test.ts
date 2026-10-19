import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createSessionLock } = require('./session-lock.cjs') as {
    createSessionLock: (options?: { now?: () => number }) => any
}

describe('[B2-4] Post-reset session invalidation', () => {
    it('invalidates registered and unknown pre-reset ids while the lock is free', () => {
        let clock = 1_000
        const lock = createSessionLock({ now: () => clock })
        lock.register('tab-1')
        clock = 1_500
        lock.register('tab-2')
        clock = 2_000
        lock.invalidateBefore(clock)
        expect(lock.activeId()).toBeNull()
        for (const id of ['tab-1', 'tab-2', 'tab-3']) {
            expect(lock.peek(id)).toBe('stale')
            expect(lock.checkWrite(id, true)).toEqual({ ok: false })
        }
    })

    it('treats the watermark as inclusive and never lowers it', () => {
        let clock = 5_000
        const lock = createSessionLock({ now: () => clock })
        lock.invalidateBefore(5_000)
        lock.invalidateBefore(3_000)
        lock.register('tab-exact')
        clock = 5_001
        lock.register('tab-after')
        expect(lock.peek('tab-exact')).toBe('stale')
        expect(lock.checkWrite('tab-exact', true)).toEqual({ ok: false })
        expect(lock.checkWrite('tab-after', false)).toEqual({ ok: true })
        expect(lock.activeId()).toBe('tab-after')
    })

    it('gives active-id precedence after its boot entry is evicted', () => {
        let clock = 1_000
        const lock = createSessionLock({ now: () => clock })
        lock.invalidateBefore(1_000)
        clock = 1_001
        lock.register('tab-winner')
        expect(lock.checkWrite('tab-winner', true)).toEqual({ ok: true })
        for (let index = 0; index < 55; index += 1) {
            clock += 1
            lock.register(`tab-${index}`)
        }
        expect(lock.checkWrite('tab-winner', false)).toEqual({ ok: true })
        expect(lock.peek('tab-winner')).toBe('active')
    })

    it('continues to accept empty and absent session ids after invalidation', () => {
        const lock = createSessionLock({ now: () => 5_000 })
        lock.invalidateBefore(5_000)
        expect(lock.checkWrite('', false)).toEqual({ ok: true })
        expect(lock.checkWrite(undefined, false)).toEqual({ ok: true })
    })

    it('preserves upstream behavior when no invalidation occurred', () => {
        let clock = 1_000
        const lock = createSessionLock({ now: () => clock })
        lock.register('old')
        expect(lock.checkWrite('old')).toEqual({ ok: true })
        clock = 2_000
        lock.register('new')
        expect(lock.peek('new')).toBe('fresh')
        expect(lock.checkWrite('new', false)).toEqual({ ok: true, passive: true })
        expect(lock.checkWrite('new', true)).toEqual({ ok: true, tookOver: true })
    })
})
