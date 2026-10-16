import { describe, it, expect, afterEach } from 'vitest'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import express from 'express'
import Database from 'better-sqlite3'
const require = createRequire(import.meta.url)
const { createRequestLogs } = require('./request-logs.cjs')
const resources: Array<() => void | Promise<void>> = []
afterEach(async () => { while (resources.length) await resources.pop()!() })
function fixture() {
    const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-cost-'))
    resources.push(() => fs.rmSync(saveDir, { recursive: true, force: true }))
    const logs = createRequestLogs({ saveDir })
    resources.push(() => logs.close())
    return { logs, saveDir }
}
function entry(overrides: Record<string, unknown> = {}) {
    return { category: 'llm', source: 'main', timestamp: Date.UTC(2026, 10, 30), model: 'gemini-4-argon', provider: 'google',
        url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-4-argon:generateContent',
        success: true, status: 200, serviceTier: 'standard', usageAccountingVersion: 1,
        inputTokens: 100, outputTokens: 15, cachedTokens: 80, reasoningTokens: 5, ...overrides }
}

describe('persistent usage cost context and bounded list', () => {
    it('can page past a finite legacy clock value outside the Date rendering range', () => {
        const { logs } = fixture()
        logs.addRequestLogBatch([entry(), entry({ timestamp: 1e99 }), entry({ timestamp: -1 }), entry({ timestamp: -2 })])
        const first = logs.queryUsageEntries({ limit: 1 })
        expect(first.entries[0].timestamp).toBe(1e99)
        const second = logs.queryUsageEntries({ limit: 1, beforeTimestamp: first.nextCursor.timestamp, beforeId: first.nextCursor.id })
        expect(second.entries).toHaveLength(1)
        expect(second.entries[0].timestamp).toBe(entry().timestamp)
        const third = logs.queryUsageEntries({ limit: 1, beforeTimestamp: second.nextCursor.timestamp, beforeId: second.nextCursor.id })
        expect(third.entries[0].timestamp).toBe(-1)
        expect(logs.queryUsageEntries({ beforeTimestamp: third.nextCursor.timestamp, beforeId: third.nextCursor.id }).entries[0].timestamp).toBe(-2)
    })
    it('does not make one cumulative group per arbitrary unrecognized tier string', () => {
        const { logs } = fixture()
        logs.addRequestLogBatch(Array.from({ length: 40 }, (_, i) => entry({ serviceTier: `future-tier-${i}` })))
        const buckets = logs.queryUsage({}).costBuckets
        expect(buckets).toHaveLength(1)
        expect(buckets[0].requests).toBe(40)
        expect(buckets[0].context).not.toContain('future-tier-')
    })
    it('adds the column idempotently to an old database and preserves old-writer rows', () => {
        const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-cost-old-'))
        resources.push(() => fs.rmSync(saveDir, { recursive: true, force: true }))
        const filename = path.join(saveDir, 'request-logs.db')
        const oldDb = new Database(filename)
        oldDb.exec(`CREATE TABLE usage (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp INTEGER NOT NULL,
            day TEXT NOT NULL, category TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'other', model TEXT,
            provider TEXT, success INTEGER NOT NULL, streaming INTEGER NOT NULL DEFAULT 0, duration_ms INTEGER,
            input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
            cached_tokens INTEGER NOT NULL DEFAULT 0, reasoning_tokens INTEGER NOT NULL DEFAULT 0)`)
        const write = (db: Database.Database) => db.prepare(`INSERT INTO usage
            (timestamp,day,category,success,input_tokens,output_tokens) VALUES (1,'1970-01-01','llm',1,10,20)`).run()
        write(oldDb); oldDb.close()
        for (let i = 0; i < 2; i++) { const logs = createRequestLogs({ saveDir }); logs.close() }
        const oldWriter = new Database(filename); write(oldWriter)
        expect(oldWriter.pragma('table_info(usage)').filter((r: any) => r.name === 'cost_context')).toHaveLength(1)
        expect(oldWriter.prepare('SELECT cost_context,input_tokens,output_tokens FROM usage').all())
            .toEqual([{ cost_context: null, input_tokens: 10, output_tokens: 20 }, { cost_context: null, input_tokens: 10, output_tokens: 20 }])
        expect(oldWriter.pragma('quick_check', { simple: true })).toBe('ok')
        oldWriter.close()
        const reopened = createRequestLogs({ saveDir }); expect(reopened.queryUsage({}).total.requests).toBe(2); reopened.close()
    })
    it('stores context before coercion, shares filters, and keeps cumulative scope independent of dates', () => {
        const { logs } = fixture()
        logs.addRequestLogBatch([entry(), entry({ timestamp: Date.UTC(2026, 11, 1), source: 'sub' }),
            entry({ model: 'other', timestamp: Date.UTC(2026, 11, 1) }), entry({ outputTokens: undefined })])
        const report = logs.queryUsage({ models: ['gemini-4-argon'], sources: ['main'], since: Date.UTC(2026, 11, 1) })
        expect(report.total.requests).toBe(0)
        expect(report.costBuckets).toEqual([])
        expect(report.cumulativeCostBuckets.reduce((n: number, r: any) => n + r.requests, 0)).toBe(2)
        const all = logs.queryUsage({})
        expect(all.costBuckets.reduce((n: number, r: any) => n + r.inputTokens, 0)).toBe(all.total.inputTokens)
        const page = logs.queryUsageEntries({ models: ['gemini-4-argon'] })
        expect(page.entries).toHaveLength(3)
        const missing = page.entries.find((r: any) => !JSON.parse(r.context).outputReported)
        expect(missing.outputTokens).toBe(0)
        expect(JSON.parse(missing.context)).toMatchObject({ valid: false, outputReported: false })
        expect(page.entries[0]).not.toHaveProperty('url')
        logs.addRequestLogBatch([entry({ url: entry().url + '?key=synthetic-secret' })])
        expect(logs.queryUsageEntries({ limit: 1 }).entries[0].context).not.toContain('synthetic-secret')
    })
    it('pages equal timestamps without duplicates and survives body rotation/clear', () => {
        const { logs } = fixture()
        // Exercise pagination without bypassing the native 50-entry ingest cap.
        const rows = Array.from({ length: 120 }, (_, i) => entry({ timestamp: i < 119 ? 1000 : 500 }))
        for (let offset = 0; offset < rows.length; offset += 40) logs.addRequestLogBatch(rows.slice(offset, offset + 40))
        const first = logs.queryUsageEntries({ limit: 1000 })
        expect(first.entries).toHaveLength(100)
        const second = logs.queryUsageEntries({ limit: 100, beforeTimestamp: first.nextCursor.timestamp, beforeId: first.nextCursor.id })
        expect(second.entries).toHaveLength(20)
        expect(second.nextCursor).toBeNull()
        expect(new Set([...first.entries, ...second.entries].map((r: any) => r.id)).size).toBe(120)
        expect(second.entries.at(-1).timestamp).toBe(500)
        expect(() => logs.queryUsageEntries({ beforeId: 1 })).toThrow('Invalid usage cursor')
        logs.clearRequestLogs()
        expect(logs.queryUsage({}).total.requests).toBe(120)
        expect(logs.queryUsageEntries({ limit: 1 }).entries).toHaveLength(1)
        logs.clearUsage()
        expect(logs.queryUsageEntries({}).entries).toEqual([])
    })
    it('guards the HTTP list and shares model/source/time filters with the aggregate', async () => {
        const { logs } = fixture()
        logs.addRequestLogBatch([entry(), entry({ model: 'other' })])
        const app = express()
        logs.registerRoutes(app, { auth: async (req: any, res: any) => {
            if (req.headers['x-test-auth'] === 'synthetic') return true
            res.sendStatus(401); return false
        } })
        const server = http.createServer(app)
        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
        resources.push(() => new Promise<void>(resolve => server.close(() => resolve())))
        const base = `http://127.0.0.1:${(server.address() as any).port}`
        expect((await fetch(base + '/api/request-logs/usage/entries')).status).toBe(401)
        const headers = { 'x-test-auth': 'synthetic' }
        const list = await (await fetch(base + '/api/request-logs/usage/entries?models=gemini-4-argon&sources=main&since=1&limit=1', { headers })).json()
        expect(list.entries).toHaveLength(1)
        expect(list.entries[0].model).toBe('gemini-4-argon')
        expect((await fetch(base + '/api/request-logs/usage/entries', { headers })).headers.get('cache-control')).toBe('no-store')
        expect((await fetch(base + '/api/request-logs/usage', { headers })).headers.get('cache-control')).toBe('no-store')
        expect((await fetch(base + '/api/request-logs/usage/entries?before_id=1', { headers })).status).toBe(400)
        expect((await fetch(base + '/api/request-logs/usage/entries?before_id=abc&before_timestamp=abc', { headers })).status).toBe(400)
        expect((await fetch(base + '/api/request-logs/usage/entries?before_id=1&before_timestamp=', { headers })).status).toBe(400)
    })
})
