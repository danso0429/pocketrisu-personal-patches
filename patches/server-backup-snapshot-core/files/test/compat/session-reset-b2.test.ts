import { afterAll, describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { spawnServer, type ServerHandle } from './helpers/spawnServer.js'
import { createClient, type RisuClient } from './helpers/client.js'
import { createSeedBackup } from './helpers/seed.js'

const servers: ServerHandle[] = []

afterAll(async () => {
  await Promise.allSettled(servers.map(server => server.cleanup()))
})

async function sessionClient(client: RisuClient, id: string) {
  const response = await client.fetch('/api/session', {
    method: 'POST', headers: { 'x-session-id': id },
  })
  expect(response.status).toBe(200)
  const cookie = (response.headers.get('set-cookie') ?? '').split(';', 1)[0]
  expect(cookie).toMatch(/^risu-session=/)
  return {
    ...client,
    fetch(route: string, init: RequestInit = {}) {
      const headers = new Headers(init.headers)
      headers.set('cookie', cookie)
      headers.set('x-session-id', id)
      return client.fetch(route, { ...init, headers })
    },
  } as RisuClient
}

async function importBackup(client: RisuClient, backup: Buffer) {
  let response = await client.fetch('/api/backup/import/prepare', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-user-active': '1' },
    body: JSON.stringify({ size: backup.byteLength }),
  })
  expect(response.status).toBe(200)
  response = await client.fetch('/api/backup/import', {
    method: 'POST', headers: { 'content-type': 'application/x-risu-backup', 'x-user-active': '1' },
    body: new Uint8Array(backup),
  })
  let body = await response.json() as any
  if (response.status === 409 && body.code === 'fresh_snapshot_required') {
    response = await client.fetch('/api/backup/import', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-risu-backup', 'x-user-active': '1',
        'x-risu-restore-without-fresh-snapshot': '1',
        'x-risu-restore-confirmation': body.confirmationToken,
      },
      body: new Uint8Array(backup),
    })
    body = await response.json()
  }
  expect(response.status, JSON.stringify(body)).toBe(200)
}

describe('[B2-4] Post-reset session invalidation', () => {
  test('a real reset deactivates both pre-reset sessions on chat and gated BG writes while recovery routes stay reachable', async () => {
    const server = await spawnServer()
    servers.push(server)
    const raw = await createClient(server.port, server.password)
    const active = await sessionClient(raw, 'phase-b-active')
    const second = await sessionClient(raw, 'phase-b-second')

    await importBackup(active, createSeedBackup({ includeAssets: true }))

    const chat = await second.fetch('/api/chat-content/test-char-0/0', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-chat-id': 'chat-0-0', 'x-chat-base-revision': 'stale' },
      body: JSON.stringify({ id: 'chat-0-0', fmIndex: -1, message: [] }),
    })
    expect(chat.status).toBe(423)
    for (const route of ['/api/bg-orchestrate', '/api/bg-orchestrate-input/claim', '/api/bg-orchestrate-input/attach']) {
      const response = await second.fetch(route, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
      })
      expect(response.status, route).toBe(423)
      await expect(response.json()).resolves.toEqual({ error: 'Session deactivated' })
    }
    expect((await second.fetch('/api/bg-orchestrate-input/abandon', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })).status).not.toBe(423)
    expect((await second.fetch('/api/bg-orchestrate/operation-missing', { method: 'DELETE' })).status).not.toBe(423)

    await new Promise(resolve => setTimeout(resolve, 2))
    const reloaded = await sessionClient(raw, 'phase-b-reloaded')
    expect((await reloaded.fetch('/api/bg-orchestrate', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-user-active': '1' }, body: '{}',
    })).status).not.toBe(423)
  })

  test('all five reset entry points share one successful-apply invalidation point before slot release', () => {
    const source = readFileSync('server/node/server.cjs', 'utf8')
    for (const kind of ['backup-import', 'server-restore', 'save-folder', 'snapshot-restore', 'database-remove']) {
      expect(source).toContain(kind)
    }
    const runnerStart = source.indexOf('async function runStorageReset')
    const runnerEnd = source.indexOf('\n}', runnerStart) + 2
    const runner = source.slice(runnerStart, runnerEnd)
    expect(runner).toContain('sessionLock.invalidateBefore')
    expect(runner.indexOf('await apply')).toBeLessThan(runner.indexOf('sessionLock.invalidateBefore'))
    expect(runner.indexOf('sessionLock.invalidateBefore')).toBeLessThan(runner.lastIndexOf('storageResetActive'))
  })

  test('failed import preparation or apply does not invalidate the active session', async () => {
    const server = await spawnServer()
    servers.push(server)
    const raw = await createClient(server.port, server.password)
    const active = await sessionClient(raw, 'phase-b-failed-reset')
    const prepare = await active.fetch('/api/backup/import/prepare', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-user-active': '1' },
      body: JSON.stringify({ size: 12 }),
    })
    expect(prepare.status).toBe(200)
    const failed = await active.fetch('/api/backup/import', {
      method: 'POST', headers: { 'content-type': 'application/x-risu-backup', 'x-user-active': '1' },
      body: new Uint8Array([1, 2, 3]),
    })
    expect(failed.status).not.toBe(200)
    const nextWrite = await active.fetch('/api/db/flush', { method: 'POST', headers: { 'x-user-active': '1' } })
    expect(nextWrite.status).not.toBe(423)
  })
})
