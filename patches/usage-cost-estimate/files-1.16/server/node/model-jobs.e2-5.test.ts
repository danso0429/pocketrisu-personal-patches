import { afterEach, describe, expect, test } from 'vitest'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'

const require = createRequire(import.meta.url)
const { createModelJobs } = require('./model-jobs.cjs')
const resources: Array<() => void | Promise<void>> = []

afterEach(async () => {
    while (resources.length) await resources.pop()!()
})

describe('[E2-5a] Rebase usage-cost-estimate onto PocketRisu 1.16.1', () => {
    test('[unchanged] a3/A3 native model-job creation stores the exact request model', async () => {
        const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2-5-model-job-'))
        resources.push(() => fs.rmSync(saveDir, { recursive: true, force: true }))
        const store = createModelJobs({ saveDir })
        resources.push(() => store.close())
        const upstream = http.createServer((req, res) => {
            req.resume()
            req.on('end', () => {
                res.writeHead(200, { 'content-type': 'application/json' })
                res.end('{"ok":true}')
            })
        })
        await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
        resources.push(() => new Promise<void>((resolve) => upstream.close(() => resolve())))
        const targetUrl = `http://127.0.0.1:${(upstream.address() as any).port}/v1/chat`

        const created = store.createJob({ targetUrl, method: 'POST', body: '{}', chatId: 'chat-e2-5',
            generationId: 'gen-e2-5', adapterKind: 'openai', model: 'claude-3-7-sonnet' })
        expect(created.error).toBeUndefined()
        expect(store.getJob(created.jobId)).toMatchObject({ model: 'claude-3-7-sonnet' })
        await created.runPromise
        expect(store.getJob(created.jobId)).toMatchObject({ model: 'claude-3-7-sonnet', status: 'done' })
    })
})
