import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

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
