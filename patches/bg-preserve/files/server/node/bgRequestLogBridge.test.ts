import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import bridgePackage from './bgRequestLogBridge.cjs'
import requestLogPackage from './request-logs.cjs'

const { deliverBgRequestLog, parseBgRequestLogBatch } = bridgePackage as {
    deliverBgRequestLog: (owner: unknown, entries: unknown[]) => Promise<Response>
    parseBgRequestLogBatch: (init: Record<string, unknown>, maxBytes?: number) => unknown[] | null
}
const { createRequestLogs, MAX_BODY_BYTES } = requestLogPackage as {
    createRequestLogs: (options: Record<string, unknown>) => any
    MAX_BODY_BYTES: number
}

let root: string
let logs: any

function entry(overrides: Record<string, unknown> = {}) {
    return {
        timestamp: Date.now(),
        category: 'llm',
        source: 'main',
        url: 'https://api.example.invalid/v1/chat',
        method: 'POST',
        status: 200,
        success: true,
        streaming: true,
        model: 'model-test',
        provider: 'provider-test',
        inputTokens: 12,
        outputTokens: 3,
        requestBody: '{"messages":[]}',
        responseBody: 'answer',
        ...overrides,
    }
}

function loggerRequest(entries: unknown[]) {
    return {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'risu-auth': 'bg-orchestrator-test',
        },
        body: JSON.stringify(entries),
    }
}

async function dispatch(owner: unknown, init: Record<string, unknown>) {
    const entries = parseBgRequestLogBatch(init)
    return entries ? deliverBgRequestLog(owner, entries) : null
}

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'bg-request-logs-'))
    logs = createRequestLogs({ saveDir: root })
})

afterEach(() => {
    logs?.close()
    fs.rmSync(root, { recursive: true, force: true })
})

describe('BG native request-log delivery', () => {
    it('uses the native owner for masking, body caps, and content-free usage', async () => {
        const secret = 'sk-abcdefghijklmnopqrstuvwxyz012345'
        const requestBody = JSON.stringify({
            token: secret,
            padding: 'A'.repeat(MAX_BODY_BYTES + 1024),
        })
        const delivered = await dispatch(logs, loggerRequest([entry({
            url: `https://api.example.invalid/v1/chat?key=${secret}`,
            requestHeaders: JSON.stringify({ authorization: `Bearer ${secret}` }),
            requestBody,
        })]))

        expect(delivered?.status).toBe(200)
        expect(await delivered?.json()).toEqual({ success: true, written: 1 })
        const [listed] = logs.queryRequestLogs({})
        const detail = logs.getRequestLog(listed.id)
        expect(JSON.stringify(detail)).not.toContain(secret)
        expect(detail.truncated).toBe(true)
        expect(Buffer.byteLength(detail.requestBody, 'utf8')).toBeLessThanOrEqual(MAX_BODY_BYTES + 64)

        const usage = logs.queryUsage({})
        expect(usage.total.requests).toBe(1)
        expect(usage.total.inputTokens).toBe(12)
        expect(usage.total.outputTokens).toBe(3)
        expect(JSON.stringify(usage)).not.toContain('messages')
        expect(JSON.stringify(usage)).not.toContain('answer')
    })

    it('retains the native whole-database byte rotation policy', async () => {
        logs.close()
        logs = createRequestLogs({
            saveDir: path.join(root, 'rotating'),
            maxTotalBytes: 1024,
            minRows: 1,
            rotateEveryNRows: 1,
        })
        for (let index = 0; index < 3; index++) {
            const delivered = await dispatch(logs, loggerRequest([entry({
                model: `model-${index}`,
                requestBody: 'B'.repeat(1500),
            })]))
            expect(delivered?.status).toBe(200)
        }

        expect(logs.queryRequestLogs({ limit: 100 })).toHaveLength(1)
        expect(logs.queryRequestLogs({ limit: 1 })[0].model).toBe('model-2')
        expect(logs.queryUsage({}).total.requests).toBe(3)
    })

    it('accepts only the native logger request shape before calling the owner', async () => {
        let ownerCalls = 0
        const owner = { addRequestLogBatch() { ownerCalls++; return 1 } }
        const valid = loggerRequest([entry()])
        expect(await dispatch(owner, { ...valid, method: 'GET' })).toBeNull()
        expect(await dispatch(owner, { ...valid, headers: { 'Content-Type': 'application/json' } })).toBeNull()
        expect(await dispatch(owner, { ...valid, headers: { 'risu-auth': 'token' } })).toBeNull()
        expect(await dispatch(owner, { ...valid, body: JSON.stringify(entry()) })).toBeNull()
        expect(await dispatch(owner, { ...valid, body: '{not-json' })).toBeNull()
        expect(parseBgRequestLogBatch({
            ...valid,
            body: JSON.stringify([entry({ requestBody: 'X'.repeat(64) })]),
        }, 32)).toBeNull()
        expect(ownerCalls).toBe(0)

        const delivered = await dispatch(owner, valid)
        expect(delivered?.status).toBe(200)
        expect(ownerCalls).toBe(1)
    })

    it('returns bounded owner failures instead of throwing into generation', async () => {
        const missing = await deliverBgRequestLog(undefined, [entry()])
        expect(missing.status).toBe(503)

        const failed = await deliverBgRequestLog({
            addRequestLogBatch() { throw new Error('database unavailable') },
        }, [entry()])
        expect(failed.status).toBe(500)
        expect(await failed.json()).toEqual({ success: false, written: 0 })
    })
})
