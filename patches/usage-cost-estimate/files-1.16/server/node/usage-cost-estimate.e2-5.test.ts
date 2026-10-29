import { afterEach, describe, expect, test } from 'vitest'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import express from 'express'
import Database from 'better-sqlite3'

const require = createRequire(import.meta.url)
const resources: Array<() => void | Promise<void>> = []

afterEach(async () => {
    while (resources.length) await resources.pop()!()
})

function packModule(relative: string) {
    return path.resolve(path.dirname(new URL(import.meta.url).pathname), relative)
}

function fixture() {
    const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2-5-usage-'))
    resources.push(() => fs.rmSync(saveDir, { recursive: true, force: true }))
    const { createRequestLogs } = require('./request-logs.cjs')
    const logs = createRequestLogs({ saveDir })
    resources.push(() => logs.close())
    return { logs, saveDir }
}

function entry(overrides: Record<string, unknown> = {}) {
    return {
        category: 'llm', source: 'main', model: 'gemini-4-argon', provider: 'google',
        url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-4-argon:generateContent',
        success: true, status: 200, serviceTier: 'standard', usageAccountingVersion: 1,
        cachedTokens: 0, reasoningTokens: 0, ...overrides,
    }
}

describe('[E2-5a] Rebase usage-cost-estimate onto PocketRisu 1.16.1', () => {
    test('[new] a1/A1 computes windowed and cumulative cost from known recorded token counts', async () => {
        const storePath = packModule('usageCostStore.cjs')
        const pricingPath = packModule('../../src/ts/usage/usagePricing.ts')
        expect(fs.existsSync(storePath), 'rebased usage cost store is missing').toBe(true)
        expect(fs.existsSync(pricingPath), 'rebased usage pricing module is missing').toBe(true)
        const { summarizeCosts } = await import('../../src/ts/usage/usagePricing')
        const { logs } = fixture()
        logs.addRequestLogBatch([
            entry({ timestamp: 1000, inputTokens: 1000, outputTokens: 500 }),
            entry({ timestamp: 2000, inputTokens: 2000, outputTokens: 500 }),
            entry({ timestamp: 2500, inputTokens: 4000, outputTokens: 1000 }),
        ])

        const windowed = logs.queryUsage({ since: 1500, until: 3000 })
        expect(windowed.total).toMatchObject({ requests: 2, inputTokens: 6000, outputTokens: 1500 })
        expect(windowed.byModel).toHaveLength(1)
        expect(windowed.costVersion).toBe(1)
        expect(summarizeCosts(windowed.costBuckets).cost).toBeCloseTo(0.027, 12)
        expect(summarizeCosts(windowed.cumulativeCostBuckets).cost).toBeCloseTo(0.034, 12)
        const first = logs.queryUsageEntries({ categories: ['llm'], sources: ['main'],
            models: ['gemini-4-argon'], successOnly: true, since: 1500, until: 3000, limit: 1 })
        expect(first.entries).toHaveLength(1)
        expect(first.nextCursor).not.toBeNull()
        const second = logs.queryUsageEntries({ categories: ['llm'], sources: ['main'],
            models: ['gemini-4-argon'], successOnly: true, since: 1500, until: 3000, limit: 1,
            beforeTimestamp: first.nextCursor!.timestamp, beforeId: first.nextCursor!.id })
        expect(second.entries).toHaveLength(1)
        expect(second.nextCursor).toBeNull()
    })

    test('[new] a2/A2 empty usage and entry routes return HTTP 200 with empty structures', async () => {
        expect(fs.existsSync(packModule('usageCostStore.cjs')), 'rebased usage cost store is missing').toBe(true)
        const { logs } = fixture()
        logs.addRequestLogBatch([entry({ timestamp: 1000, inputTokens: 10, outputTokens: 20 })])
        const app = express()
        logs.registerRoutes(app, { auth: async () => true })
        const server = http.createServer(app)
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
        resources.push(() => new Promise<void>((resolve) => server.close(() => resolve())))
        const base = `http://127.0.0.1:${(server.address() as any).port}`

        const usageResponse = await fetch(`${base}/api/request-logs/usage?since=5000&until=6000`)
        const usage = await usageResponse.json() as any
        expect(usageResponse.status).toBe(200)
        expect(usage.total).toMatchObject({ requests: 0, inputTokens: 0, outputTokens: 0 })
        expect(usage.daily).toEqual([])
        expect(usage.byModel).toEqual([])
        expect(usage.bySource).toEqual([])
        expect(usage.costBuckets).toEqual([])

        const entriesResponse = await fetch(`${base}/api/request-logs/usage/entries?since=5000&until=6000`)
        expect(entriesResponse.status).toBe(200)
        expect(await entriesResponse.json()).toMatchObject({ success: true, entries: [] })
    })

    test('[unchanged] a4 ordinary ingestion writes one native request row and one usage row with identical tokens', () => {
        const { logs, saveDir } = fixture()
        logs.addRequestLogBatch([entry({ timestamp: 1234, inputTokens: 101, outputTokens: 23,
            cachedTokens: 17, reasoningTokens: 5 })])
        const db = new Database(path.join(saveDir, 'request-logs.db'), { readonly: true })
        resources.push(() => db.close())
        const request = db.prepare(`SELECT model,input_tokens,output_tokens,cached_tokens,reasoning_tokens
            FROM requests`).get() as any
        const usage = db.prepare(`SELECT model,input_tokens,output_tokens,cached_tokens,reasoning_tokens
            FROM usage`).get() as any
        expect(request).toEqual(usage)
        expect(usage).toEqual({ model: 'gemini-4-argon', input_tokens: 101, output_tokens: 23,
            cached_tokens: 17, reasoning_tokens: 5 })
    })

    test('[new] A5 reads the persisted 1.10 cost-context shape without migration loss', async () => {
        const storePath = packModule('usageCostStore.cjs')
        const pricingPath = packModule('../../src/ts/usage/usagePricing.ts')
        expect(fs.existsSync(storePath), 'rebased usage cost store is missing').toBe(true)
        expect(fs.existsSync(pricingPath), 'rebased usage pricing module is missing').toBe(true)
        const { summarizeCosts } = await import('../../src/ts/usage/usagePricing')
        const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2-5-legacy-cost-'))
        resources.push(() => fs.rmSync(saveDir, { recursive: true, force: true }))
        const db = new Database(path.join(saveDir, 'request-logs.db'))
        db.exec(`CREATE TABLE usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp INTEGER NOT NULL, day TEXT NOT NULL,
            category TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'other', model TEXT, provider TEXT,
            success INTEGER NOT NULL, streaming INTEGER NOT NULL DEFAULT 0, duration_ms INTEGER,
            input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
            cached_tokens INTEGER NOT NULL DEFAULT 0, reasoning_tokens INTEGER NOT NULL DEFAULT 0,
            cost_context TEXT)`)
        const context = JSON.stringify({ v: 1, product: 'gemini', region: 'global', tier: 'standard',
            tierSource: 'reported', inputReported: true, outputReported: true, valid: true,
            accounting: true, priceDay: '2026-11-30', dateBasis: 'request', aborted: false,
            successful: true })
        db.prepare(`INSERT INTO usage (timestamp,day,category,source,model,provider,success,
            input_tokens,output_tokens,cached_tokens,reasoning_tokens,cost_context)
            VALUES (1,'1970-01-01','llm','main','gemini-4-argon','google',1,1000,500,0,0,?)`).run(context)
        db.close()

        const { createRequestLogs } = require('./request-logs.cjs')
        const logs = createRequestLogs({ saveDir })
        resources.push(() => logs.close())
        const report = logs.queryUsage({})
        expect(report.costVersion).toBe(1)
        expect(report.costBuckets[0].context).toBe(context)
        expect(summarizeCosts(report.costBuckets).cost).toBeCloseTo(0.007, 12)
    })
})
