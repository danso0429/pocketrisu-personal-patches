import { describe, expect, test, vi } from 'vitest'
import { completeBgDurableSave } from './bgDurableSaveBarrier'

describe('BG durable-save barrier for lazy chat synchronization', () => {
    test('does not flush or acknowledge a deferred client save', async () => {
        const flush = vi.fn(async () => undefined)

        await expect(completeBgDurableSave(false, flush))
            .rejects.toThrow('orchestration result retained')
        expect(flush).not.toHaveBeenCalled()
    })

    test('propagates a database flush failure so result ACK stays withheld', async () => {
        const flush = vi.fn(async () => {
            throw new Error('flush failed')
        })

        await expect(completeBgDurableSave(true, flush))
            .rejects.toThrow('flush failed')
        expect(flush).toHaveBeenCalledTimes(1)
    })

    test('completes only after the database flush succeeds', async () => {
        const events: string[] = []

        await completeBgDurableSave(true, async () => {
            events.push('database-flushed')
        })
        events.push('result-may-ack')

        expect(events).toEqual(['database-flushed', 'result-may-ack'])
    })
})
