import { describe, expect, it, vi } from 'vitest'
vi.mock('./log', () => ({ addLog: vi.fn() }))
import { createRecoveryTiming } from './bgRecoveryTiming'

function fixture() {
    let clock = 100, wall = 1000, hidden = false, changed = () => {}
    const rows: Array<{ message: string, data: any }> = []
    const resources: any[] = []
    const emit = vi.fn((message: string, description: string) => rows.push({ message, data: JSON.parse(description) }))
    const timing = createRecoveryTiming({ now: () => clock, wall: () => wall, hidden: () => hidden,
        absolute: url => new URL(url, 'http://localhost').href, resources: url => resources.filter(row => row.name === url),
        subscribe: listener => { changed = listener; return () => { changed = () => {} } }, emit })
    return { timing, rows, resources, emit,
        advance: (ms: number, wallMs = ms) => { clock += ms; wall += wallMs },
        visible: (value: boolean) => { hidden = !value; changed() } }
}
const resultUrl = '/api/bg-orchestrate-result/private-operation?charId=private-character&chatId=private-chat'
const begin = (h: ReturnType<typeof fixture>) => h.timing.start('watch', 'private-operation', 'private-character', 'private-chat')

describe('temporary recovery timing', () => {
    it('measures the original body once without cloning and excludes coordinates from output', async () => {
        const h = fixture(); begin(h)
        const request = h.timing.control(resultUrl)
        h.advance(20)
        const response = Response.json({ content: 'private-content' })
        const clone = vi.spyOn(response, 'clone')
        const json = vi.spyOn(response, 'json')
        request.headers(response)
        h.advance(30)
        expect(await h.timing.json(response)).toEqual({ content: 'private-content' })
        h.timing.finish('private-operation', 'finished')
        expect(json).toHaveBeenCalledTimes(1); expect(clone).not.toHaveBeenCalled()
        expect(h.rows[0].data.requests[0]).toMatchObject({ kind: 'result-get', headersMs: 20, totalMs: 50, phase: 'complete' })
        expect(JSON.stringify(h.rows)).not.toMatch(/private-|http:|charId|chatId|content/)
    })

    it('records pending body visibility and distinguishes the existing control timer', async () => {
        const h = fixture(); begin(h)
        const request = h.timing.control(resultUrl)
        let reject!: (error: unknown) => void
        const response = new Response()
        vi.spyOn(response, 'json').mockImplementation(() => new Promise((_, fail) => { reject = fail }))
        request.headers(response)
        const reading = h.timing.json(response)
        h.visible(false); h.advance(3, 900_000); h.visible(true)
        const error = new DOMException('private detail', 'AbortError')
        reject(error)
        await expect(reading).rejects.toBe(error)
        h.timing.finish('private-operation', 'deferred')
        expect(h.rows.map(row => row.data.checkpoint)).toEqual(['hidden', 'resumed', 'finished'])
        expect(h.rows[0].data.requests[0].phase).toBe('body')
        expect(h.rows[2].data.requests[0]).toMatchObject({ error: 'AbortError', hiddenDuring: true,
            controlTimerFired: false, wallMs: 900_000, totalMs: 3 })
        h.timing.start('boot', 'next', 'c', 'd')
        const timed = h.timing.control('/api/bg-orchestrate-result/next?charId=c&chatId=d')
        timed.timerFired(); timed.error(error); h.timing.finish('next', 'deferred')
        expect(h.rows[3].data.requests[0].controlTimerFired).toBe(true)
    })

    it('never mutates a newer trace when an older body finishes after cleanup', async () => {
        const h = fixture(); begin(h)
        const request = h.timing.control(resultUrl)
        let resolve!: (value: unknown) => void
        const response = new Response()
        vi.spyOn(response, 'json').mockImplementation(() => new Promise(done => { resolve = done }))
        request.headers(response)
        const pending = h.timing.json(response)
        h.timing.finish('private-operation', 'deferred')
        begin(h)
        resolve({ found: true }); expect(await pending).toEqual({ found: true })
        h.timing.finish('private-operation', 'finished')
        expect(h.rows[0].data.requests[0].phase).toBe('body')
        expect(h.rows[1].data.requests).toEqual([])
        expect(new Set(h.rows.map(row => row.message)).size).toBe(2)
    })

    it('excludes heartbeats and uncorrelated reads, preserving return values and failures', async () => {
        const h = fixture(); begin(h)
        h.timing.control(resultUrl + '&heartbeat=1').headers(Response.json({}))
        const value = { encodedBytes: 22 }
        expect(await h.timing.snapshot('other', 'chat', 0, async () => value)).toBe(value)
        const error = new Error('private-error')
        await expect(h.timing.snapshot('private-character', 'private-chat', 0, async () => { throw error })).rejects.toBe(error)
        h.timing.finish('private-operation', 'finished')
        expect(h.rows[0].data.requests).toHaveLength(1)
        expect(h.rows[0].data.requests[0]).toMatchObject({ kind: 'snapshot', error: 'OtherError' })
    })

    it('reports snapshot bytes and only unambiguous resource timing', async () => {
        const h = fixture(); begin(h)
        h.resources.push({ name: 'http://localhost/api/chat-content/private-character/0', startTime: 100,
            responseStart: 110, responseEnd: 120, decodedBodySize: 25 })
        const value = { encodedBytes: 25 }
        expect(await h.timing.snapshot('private-character', 'private-chat', 0, async () => { h.advance(25); return value })).toBe(value)
        h.timing.finish('private-operation', 'finished')
        expect(h.rows[0].data.requests[0]).toMatchObject({ bytes: 25, sizeBasis: 'snapshot', networkHeadersMs: 10, networkBodyMs: 10, totalMs: 25 })
    })

    it('does not borrow an overlapping same-URL transfer for a snapshot', async () => {
        const h = fixture(); begin(h)
        const name = 'http://localhost/api/chat-content/private-character/0'
        h.resources.push({ name, startTime: 100, responseStart: 103, responseEnd: 107, decodedBodySize: 30 },
            { name, startTime: 101, responseStart: 104, responseEnd: 110, decodedBodySize: 90 })
        await h.timing.snapshot('private-character', 'private-chat', 0, async () => { h.advance(15); return { encodedBytes: 30 } })
        h.timing.finish('private-operation', 'finished')
        expect(h.rows[0].data.requests[0]).toMatchObject({ bytes: 30, sizeBasis: 'snapshot', resourceMatch: 'multiple' })
        expect(h.rows[0].data.requests[0].networkBodyMs).toBeUndefined()
    })

    it('bounds request/trace/checkpoint counts and ignores logging failures', () => {
        const h = fixture(); begin(h)
        for (let i = 0; i < 100; i++) h.timing.control(resultUrl).error(new Error())
        for (let i = 0; i < 10; i++) { h.visible(false); h.visible(true) }
        h.timing.finish('private-operation', 'finished')
        expect(h.rows).toHaveLength(3)
        expect(h.rows[2].data.requests).toHaveLength(48)
        expect(h.rows[2].data.dropped).toBe(52)
        h.emit.mockImplementation(() => { throw Error('logger failed') })
        for (let i = 0; i < 100; i++) h.timing.start('watch', String(i), 'c', 'd')
        expect(h.timing.active()).toBe(16)
        expect(() => h.timing.finish('0', 'finished')).not.toThrow()
        h.timing.dispose(); expect(h.timing.active()).toBe(0)
    })

    it('retains a late operation-keyed ACK after a long series of polls', async () => {
        const h = fixture(); begin(h)
        for (let i = 0; i < 100; i++) {
            const response = Response.json({ found: false, operationState: 'running' })
            h.timing.control(resultUrl).headers(response)
            await h.timing.json(response); h.advance(2500)
        }
        const response = Response.json({ acked: true })
        h.timing.control('/api/bg-orchestrate-result/private-operation/private-result?consumerId=private-consumer', 'DELETE').headers(response)
        await h.timing.json(response)
        h.timing.finish('private-operation', 'finished')
        expect(h.rows[0].data.requests.at(-1)).toMatchObject({ kind: 'ack', phase: 'complete' })
        expect(h.rows[0].data.dropped).toBe(53)
        expect(h.rows[0].data.requests[0].startMs).toBe(0)
    })

    it('keeps every emitted JSON row below the native byte truncation boundary', async () => {
        const h = fixture(); begin(h)
        for (let i = 0; i < 48; i++) {
            const startTime = 100 + 2_000_000 * i
            h.resources.push({ name: 'http://localhost' + resultUrl, startTime,
                responseStart: startTime + 1_000_000, responseEnd: startTime + 2_000_000, decodedBodySize: 999_999 })
            const request = h.timing.control(resultUrl)
            h.advance(1_000_000); const response = Response.json({ found: true }); request.headers(response)
            h.advance(1_000_000); await h.timing.json(response)
        }
        h.timing.finish('private-operation', 'finished')
        expect(h.rows).toHaveLength(1)
        expect(h.rows[0].data.omittedForSize).toBeGreaterThan(0)
        expect(new TextEncoder().encode(h.emit.mock.calls[0][1]).byteLength).toBeLessThanOrEqual(9500)
        expect(h.rows[0].data.requests.at(-1).startMs).toBe(94_000_000)
    })

    it('closes boot readiness on a null-identity deferral without closing a watch', () => {
        const h = fixture()
        h.timing.start('boot', 'boot', 'c', 'd')
        begin(h)
        h.timing.finishContext('boot', null, 'deferred')
        expect(h.timing.active()).toBe(1)
        expect(h.rows[0].data.context).toBe('boot')
        h.timing.finishContext('watch', 'private-operation', 'finished')
        expect(h.timing.active()).toBe(0)
        expect(h.rows[1].data.context).toBe('watch')
    })
})
