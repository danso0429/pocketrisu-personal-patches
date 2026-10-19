import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { createModelJobs } = require('./model-jobs.cjs')
const { createOrchestrationRunRegistry } = require('./bgOrchestrationRunRegistry.cjs')

describe('BG queue and legacy main-job exclusion', () => {
    it('rejects old main requests with 409, permits aux and idle jobs, and exposes live main state', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bg-queue-jobs-'))
        let calls = 0, busy = true, unavailable = false
        const server = createServer((_req, res) => { calls++; res.end('synthetic') })
        server.listen(0, '127.0.0.1')
        await once(server, 'listening')
        const targetUrl = `http://127.0.0.1:${(server.address() as any).port}/model`
        const jobs = createModelJobs({ saveDir: root, isChatGenerationBusy: () => {
            if (unavailable) throw new Error('store unavailable')
            return busy
        } })
        try {
            const request = { chatId: 'chat-queue', targetUrl, method: 'POST', body: '{}' }
            expect(jobs.createJob(request)).toMatchObject({ httpStatus: 409 })
            expect(calls).toBe(0)
            expect(jobs.hasRunningMainJob('chat-queue')).toBe(false)
            const aux = jobs.createJob({ ...request, kind: 'aux' })
            expect(aux.jobId).toBeTruthy()
            expect(jobs.hasRunningMainJob('chat-queue')).toBe(false)
            await aux.runPromise
            expect(calls).toBe(1)
            busy = false
            const main = jobs.createJob(request)
            expect(main.jobId).toBeTruthy()
            expect(jobs.hasRunningMainJob('chat-queue')).toBe(true)
            await main.runPromise
            expect(jobs.hasRunningMainJob('chat-queue')).toBe(false)
            expect(calls).toBe(2)
            unavailable = true
            expect(jobs.createJob(request)).toMatchObject({ httpStatus: 409 })
            expect(calls).toBe(2)
        } finally {
            jobs.close()
            server.close(); await once(server, 'close')
            fs.rmSync(root, { recursive: true, force: true })
        }
    })

    it('keeps cancellation busy until execution settles, then releases the exact chat', () => {
        const registry = createOrchestrationRunRegistry({ retainMs: 0 })
        const raw = registry.start('input-queue-1', { charId: 'char-1', chatId: 'chat-1', inputCommandVersion: 1 })
        expect(registry.hasChatRun('char-1', 'chat-1')).toBe(true)
        expect(registry.hasChatRun('char-1', 'chat-1', true)).toBe(false)
        expect(registry.hasChatRun('char-2', 'chat-1')).toBe(false)
        registry.cancel('input-queue-1')
        expect(registry.hasChatRun('char-1', 'chat-1')).toBe(true)
        registry.finish('input-queue-1', raw.run)
        expect(registry.hasChatRun('char-1', 'chat-1')).toBe(false)
        const legacy = registry.start('legacy-queue-1', { charId: 'char-1', chatId: 'chat-1' })
        expect(registry.hasChatRun(null, 'chat-1', true)).toBe(true)
        registry.discard('legacy-queue-1', legacy.run)
        expect(registry.hasChatRun(null, 'chat-1', true)).toBe(false)
    })
})

describe('[B1b-2] Reset operation cleanup and run cancellation', () => {
    it('cancels and aborts every active run while retaining finished and cancelled tombstones', () => {
        const registry = createOrchestrationRunRegistry({ retainMs: 60_000 })
        const first = registry.start('operation-b1b-running-1', { charId: 'char-1', chatId: 'chat-1' })
        const second = registry.start('operation-b1b-running-2', { charId: 'char-2', chatId: 'chat-2' })
        const third = registry.start('operation-b1b-running-3', { charId: 'char-3', chatId: 'chat-3' })
        const finished = registry.start('operation-b1b-finished', { charId: 'char-4', chatId: 'chat-4' })
        registry.finish('operation-b1b-finished', finished.run)
        const finishedSnapshot = { ...finished.run }
        const firstAbort = vi.spyOn(first.run.controller, 'abort')
        const secondAbort = vi.spyOn(second.run.controller, 'abort')
        const thirdAbort = vi.spyOn(third.run.controller, 'abort')

        registry.cancelAll('storage-reset')
        expect(first.run.cancelled).toBe(true)
        expect(second.run.cancelled).toBe(true)
        expect(third.run.cancelled).toBe(true)
        expect(firstAbort).toHaveBeenCalledTimes(1)
        expect(secondAbort).toHaveBeenCalledTimes(1)
        expect(thirdAbort).toHaveBeenCalledTimes(1)
        expect(first.run.controller.signal.aborted).toBe(true)
        expect(second.run.controller.signal.aborted).toBe(true)
        expect(third.run.controller.signal.aborted).toBe(true)
        expect(registry.hasChatRun('char-1', 'chat-1')).toBe(false)
        expect(registry.hasChatRun('char-2', 'chat-2')).toBe(false)
        expect(registry.hasChatRun('char-3', 'chat-3')).toBe(false)
        expect(registry.get('operation-b1b-finished')).toMatchObject(finishedSnapshot)
        expect(registry.size()).toBe(4)
    })

    it('continues best-effort cancellation after one abort implementation throws', () => {
        const registry = createOrchestrationRunRegistry({ retainMs: 60_000 })
        const throwing = registry.start('operation-b1b-throwing', { charId: 'char-1', chatId: 'chat-1' })
        const healthy = registry.start('operation-b1b-healthy', { charId: 'char-2', chatId: 'chat-2' })
        throwing.run.controller.abort = vi.fn(() => { throw new Error('synthetic abort failure') })
        const healthyAbort = vi.spyOn(healthy.run.controller, 'abort')

        expect(() => registry.cancelAll('storage-reset')).not.toThrow()
        expect(throwing.run.cancelled).toBe(true)
        expect(healthy.run.cancelled).toBe(true)
        expect(healthyAbort).toHaveBeenCalledTimes(1)
        expect(registry.hasChatRun('char-1', 'chat-1')).toBe(false)
        expect(registry.hasChatRun('char-2', 'chat-2')).toBe(false)
    })
})
