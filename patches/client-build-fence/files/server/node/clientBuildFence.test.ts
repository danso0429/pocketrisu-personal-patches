import { mkdtemp, writeFile } from 'node:fs/promises'
import { request as httpRequest } from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, test, vi } from 'vitest'

const {
  createClientBuildFence,
  isWriterRoute,
  loadExpectedClientBuild,
} = require('./clientBuildFence.cjs')

const EXPECTED = { version: '1.9.0', stamp: '1.9.0-test-build' }
const express = require('express')

function response() {
  return {
    statusCode: 200,
    headers: new Map<string, string>(),
    body: null as unknown,
    setHeader(name: string, value: string) {
      this.headers.set(name.toLowerCase(), value)
    },
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(body: unknown) {
      this.body = body
      return this
    },
  }
}

async function stampedDist() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'client-build-fence-'))
  await writeFile(path.join(dir, 'build-stamp.json'), JSON.stringify(EXPECTED))
  return dir
}

async function listen(app: ReturnType<typeof express>) {
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const next = app.listen(0, '127.0.0.1', () => resolve(next))
  })
  const address = server.address() as AddressInfo
  return { server, base: `http://127.0.0.1:${address.port}`, port: address.port }
}

async function closeServer(server: ReturnType<typeof express.prototype.listen>) {
  await new Promise<void>((resolve, reject) => server.close((error?: Error) => {
    if (error) reject(error)
    else resolve()
  }))
}

function headersOnlyStaleWrite(port: number) {
  return new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
    const request = httpRequest({
      host: '127.0.0.1',
      port,
      method: 'POST',
      path: '/api/write',
      headers: {
        'content-type': 'application/json',
        'content-length': String(16 * 1024 * 1024),
        'x-client-build': '1.9.0-stale-build',
      },
    }, (res) => {
      let raw = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { raw += chunk })
      res.on('end', () => resolve({
        status: res.statusCode ?? 0,
        body: JSON.parse(raw),
      }))
    })
    request.once('error', reject)
    request.flushHeaders()
  })
}

describe('client build writer admission', () => {
  test('loads only a complete build artifact and otherwise fails open', async () => {
    const dir = await stampedDist()
    expect(loadExpectedClientBuild(dir)).toEqual(EXPECTED)
    expect(loadExpectedClientBuild(path.join(dir, 'missing'))).toBeNull()
    await writeFile(path.join(dir, 'build-stamp.json'), '{"version":"1.9.0"}')
    expect(loadExpectedClientBuild(dir)).toBeNull()
    await writeFile(path.join(dir, 'build-stamp.json'), JSON.stringify({
      version: '1.9.0',
      stamp: 'invalid build value',
    }))
    expect(loadExpectedClientBuild(dir)).toBeNull()
  })

  test('classifies authoritative storage mutations without fencing reads and proxies', () => {
    expect(isWriterRoute({ method: 'POST', path: '/api/write' })).toBe(true)
    expect(isWriterRoute({ method: 'HEAD', path: '/API/REMOVE/' })).toBe(true)
    expect(isWriterRoute({ method: 'POST', path: '/api/chat-content/a/b/patch' })).toBe(true)
    expect(isWriterRoute({ method: 'POST', path: '/API/CHAT-CONTENT/a/b/PATCH/' })).toBe(true)
    expect(isWriterRoute({ method: 'DELETE', path: '/api/backup/server/a.bin' })).toBe(true)
    expect(isWriterRoute({ method: 'POST', path: '/api/model-jobs/job-1/claim' })).toBe(true)
    expect(isWriterRoute({ method: 'DELETE', path: '/api/pending-sends/chat-1/' })).toBe(true)
    expect(isWriterRoute({ method: 'POST', path: '/api/bg-sub-result/job-1/ack' })).toBe(true)
    expect(isWriterRoute({ method: 'POST', path: '/api/bg-stream-draft/delete' })).toBe(true)
    expect(isWriterRoute({ method: 'POST', path: '/api/db/assets/purge-orphans' })).toBe(true)
    expect(isWriterRoute({ method: 'POST', path: '/api/import-jobs' })).toBe(true)
    expect(isWriterRoute({ method: 'PUT', path: '/api/import-jobs/op-123456/source' })).toBe(true)
    expect(isWriterRoute({ method: 'POST', path: '/api/import-jobs/op-123456/source/complete' })).toBe(true)
    expect(isWriterRoute({ method: 'POST', path: '/api/import-jobs/op-123456/authorize' })).toBe(true)
    expect(isWriterRoute({ method: 'POST', path: '/api/import-jobs/op-123456/result/claim' })).toBe(true)
    expect(isWriterRoute({ method: 'POST', path: '/api/import-jobs/op-123456/claim/heartbeat' })).toBe(true)
    expect(isWriterRoute({ method: 'POST', path: '/api/import-jobs/op-123456/reconciled' })).toBe(true)
    expect(isWriterRoute({ method: 'POST', path: '/api/import-jobs/op-123456/ack' })).toBe(true)
    expect(isWriterRoute({ method: 'DELETE', path: '/api/import-jobs/op-123456' })).toBe(true)
    expect(isWriterRoute({ method: 'GET', path: '/api/import-jobs/op-123456' })).toBe(false)
    expect(isWriterRoute({ method: 'GET', path: '/api/import-jobs/op-123456/result' })).toBe(false)
    expect(isWriterRoute({ method: 'DELETE', path: '/api/bg-orchestrate-result/op/result' })).toBe(true)
    expect(isWriterRoute({ method: 'GET', path: '/api/read' })).toBe(false)
    expect(isWriterRoute({ method: 'POST', path: '/api/db/flush' })).toBe(false)
    expect(isWriterRoute({ method: 'POST', path: '/proxy2' })).toBe(false)
    expect(isWriterRoute({ method: 'POST', path: '/api/model-jobs' })).toBe(false)
  })

  test.each([
    ['missing', undefined],
    ['stale', '1.9.0-old-build'],
  ])('rejects a %s stamp before route body handling', async (_label, stamp) => {
    const fence = createClientBuildFence({ distDir: await stampedDist() })
    const res = response()
    const next = vi.fn()
    fence.middleware({
      method: 'POST',
      path: '/api/write',
      headers: stamp ? { 'x-client-build': stamp } : {},
    }, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(426)
    expect(res.headers.get('connection')).toBe('close')
    expect(res.body).toMatchObject({
      code: 'CLIENT_UPGRADE_REQUIRED',
      expectedBuild: EXPECTED,
      commitOutcome: 'not-committed',
      commitOutcomeUnknown: false,
    })
  })

  test('admits matching writers and fails open without a readable artifact', async () => {
    const matching = createClientBuildFence({ distDir: await stampedDist() })
    const matchingNext = vi.fn()
    matching.middleware({
      method: 'POST',
      path: '/api/write',
      headers: { 'x-client-build': EXPECTED.stamp },
    }, response(), matchingNext)
    expect(matchingNext).toHaveBeenCalledOnce()

    const warn = vi.fn()
    const missing = createClientBuildFence({
      distDir: '/definitely/missing',
      logger: { warn },
    })
    const missingNext = vi.fn()
    missing.middleware({ method: 'POST', path: '/api/write', headers: {} }, response(), missingNext)
    expect(missingNext).toHaveBeenCalledOnce()
    expect(warn).toHaveBeenCalledOnce()
  })

  test('enforces and advertises the build over HTTP before request-body parsing', async () => {
    const fence = createClientBuildFence({ distDir: await stampedDist() })
    const app = express()
    let parsedBodies = 0
    let writes = 0
    app.use(fence.middleware)
    app.get('/api/session', (_req: unknown, res: { json: (value: unknown) => void }) => {
      res.json({ ok: true, build: fence.expectedBuild })
    })
    app.use(express.json({ verify: () => { parsedBodies += 1 } }))
    app.post('/api/write', (_req: unknown, res: { json: (value: unknown) => void }) => {
      writes += 1
      res.json({ ok: true })
    })
    app.get('/api/read', (_req: unknown, res: { json: (value: unknown) => void }) => {
      res.json({ ok: true })
    })

    const { server, base, port } = await listen(app)
    try {
      expect(await (await fetch(`${base}/api/session`)).json()).toMatchObject({ build: EXPECTED })

      const stale = await headersOnlyStaleWrite(port)
      expect(stale.status).toBe(426)
      expect(stale.body).toMatchObject({
        code: 'CLIENT_UPGRADE_REQUIRED',
        commitOutcome: 'not-committed',
      })
      expect(parsedBodies).toBe(0)
      expect(writes).toBe(0)

      const missing = await fetch(`${base}/api/write`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"value":"not admitted"}',
      })
      expect(missing.status).toBe(426)
      expect(parsedBodies).toBe(0)

      const matching = await fetch(`${base}/api/write`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-client-build': EXPECTED.stamp,
        },
        body: '{"value":"admitted"}',
      })
      expect(matching.status).toBe(200)
      expect(parsedBodies).toBe(1)
      expect(writes).toBe(1)
      expect((await fetch(`${base}/api/read`)).status).toBe(200)
    } finally {
      await closeServer(server)
    }
  })

  test('keeps HTTP writers available when the build artifact is unavailable', async () => {
    const warn = vi.fn()
    const fence = createClientBuildFence({
      distDir: '/definitely/missing',
      logger: { warn },
    })
    const app = express()
    app.use(fence.middleware)
    app.use(express.json())
    app.post('/api/write', (_req: unknown, res: { json: (value: unknown) => void }) => {
      res.json({ ok: true })
    })
    const { server, base } = await listen(app)
    try {
      const result = await fetch(`${base}/api/write`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
      expect(result.status).toBe(200)
      expect(warn).toHaveBeenCalledOnce()
    } finally {
      await closeServer(server)
    }
  })
})
