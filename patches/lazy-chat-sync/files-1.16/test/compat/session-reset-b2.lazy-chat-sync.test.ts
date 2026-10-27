// Cases of server-backup-snapshot-core test/compat/session-reset-b2.test.ts
// that run with lazy-chat-sync alone, moved verbatim with the helpers they
// use. The background write case stays in the original file (E2-7).
import { afterAll, describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { spawnServer, type ServerHandle } from './helpers/spawnServer.js'
import { createClient, type RisuClient } from './helpers/client.js'

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

describe('[B2-4] Post-reset session invalidation', () => {
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
