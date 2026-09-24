import { afterEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import requestLogsPackage from './request-logs.cjs'

const { createRequestLogs } = requestLogsPackage as {
    createRequestLogs: (options: Record<string, unknown>) => { close: () => void }
}

const cleanups: Array<() => void> = []

afterEach(() => {
    for (const cleanup of cleanups.splice(0).reverse()) cleanup()
})

describe('request log storage statistics index', () => {
    it('keeps the storage aggregate on a covering index', () => {
        const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'request-log-index-'))
        const logs = createRequestLogs({ saveDir })
        cleanups.push(() => fs.rmSync(saveDir, { recursive: true, force: true }))
        cleanups.push(() => logs.close())

        const db = new Database(path.join(saveDir, 'request-logs.db'), { readonly: true })
        cleanups.push(() => db.close())

        const indexes = db.pragma('index_list(requests)') as Array<{ name: string }>
        expect(indexes.map(index => index.name)).toContain('idx_requests_size_bytes')

        const plan = db.prepare(`
            EXPLAIN QUERY PLAN
            SELECT COUNT(*) AS n, COALESCE(SUM(size_bytes), 0) AS bytes
            FROM requests
        `).all() as Array<{ detail: string }>
        expect(plan.some(row => (
            row.detail.includes('COVERING INDEX idx_requests_size_bytes')
        ))).toBe(true)
    })
})
