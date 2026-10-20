import { afterAll, describe, expect, test } from 'vitest'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { zipSync } from 'fflate'
import Database from 'better-sqlite3'
import { spawnServer, type ServerHandle } from './helpers/spawnServer.js'
import { createClient, type RisuClient } from './helpers/client.js'
import { createSeedBackup } from './helpers/seed.js'
import { decodeBackup } from './helpers/decode.js'

const servers: ServerHandle[] = []
const DB_KEY = 'database/database.bin'
const DB_HEX = Buffer.from(DB_KEY).toString('hex')
const EPOCH_KEY = 'internal/storage-epoch/v1'
const OPERATION_ID = 'operation-b34-compat'
const RESULT_ID = 'result-b34-compat'
const ORPHAN_KEYS = [
  `bg-orch-state-op:${OPERATION_ID}`,
  `bg-orch-result-op:${OPERATION_ID}`,
  'bg-orch-result:char-1::chat-1',
  'bg-orch-result:char-2::chat-2',
]

afterAll(async () => {
  await Promise.allSettled(servers.map(server => server.cleanup()))
})

async function withSession(client: RisuClient, id = `reset-orphans-${Date.now()}`): Promise<RisuClient> {
  const response = await client.fetch('/api/session', { method: 'POST', headers: { 'x-session-id': id } })
  expect(response.status).toBe(200)
  const cookie = (response.headers.get('set-cookie') ?? '').split(';', 1)[0]
  expect(cookie).toMatch(/^risu-session=/)
  return {
    ...client,
    fetch(route, init = {}) {
      const headers = new Headers(init.headers)
      headers.set('cookie', cookie)
      headers.set('x-session-id', id)
      return client.fetch(route, { ...init, headers })
    },
  }
}

async function boot(env: Record<string, string> = {}) {
  const server = await spawnServer({ env })
  servers.push(server)
  const raw = await createClient(server.port, server.password)
  return { server, raw, client: await withSession(raw) }
}

async function readRawKey(client: RisuClient, key: string) {
  const response = await client.fetch('/api/read', { headers: { 'file-path': Buffer.from(key).toString('hex') } })
  expect(response.status).toBe(200)
  return Buffer.from(await response.arrayBuffer())
}

async function readEpoch(client: RisuClient) {
  const raw = (await readRawKey(client, EPOCH_KEY)).toString('utf8').trim()
  return raw === '' ? 0 : Number(raw)
}

function resultRecord(operationId = OPERATION_ID, chat = 'chat-1') {
  return JSON.stringify({
    operationId, resultId: RESULT_ID, charId: 'char-1', chatId: chat,
    kind: 'terminal-success', final: true,
    chat: { id: chat, fmIndex: -1, message: [{ role: 'assistant', data: 'pre-reset answer' }] },
    statics: null, staticsMessagesDelta: 0, globalChatVariables: {},
  })
}

function seedOrphanRows(server: ServerHandle) {
  const db = new Database(path.join(server.cwd, 'save', 'risuai.db'))
  try {
    const put = db.prepare('INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, ?)')
    const now = Date.now()
    put.run(ORPHAN_KEYS[0], JSON.stringify({
      operationId: OPERATION_ID, charId: 'char-1', chatId: 'chat-1', state: 'result-ready', storageEpoch: 0,
    }), now)
    put.run(ORPHAN_KEYS[1], resultRecord(), now)
    put.run(ORPHAN_KEYS[2], resultRecord(), now)
    put.run(ORPHAN_KEYS[3], JSON.stringify({
      ...JSON.parse(resultRecord('operation-b34-compat-2', 'chat-2')), charId: 'char-2',
    }), now)
  } finally {
    db.close()
  }
}

async function expectRowsAbsent(client: RisuClient) {
  for (const key of ORPHAN_KEYS) expect(await readRawKey(client, key), key).toHaveLength(0)
}

async function importWithSafety(client: RisuClient, backup: Buffer) {
  let response = await client.fetch('/api/backup/import/prepare', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ size: backup.length }),
  })
  expect(response.status).toBe(200)
  response = await client.fetch('/api/backup/import', {
    method: 'POST', headers: { 'content-type': 'application/x-risu-backup' }, body: new Uint8Array(backup),
  })
  let body = await response.json() as any
  if (response.status === 409 && body.code === 'fresh_snapshot_required') {
    response = await client.fetch('/api/backup/import', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-risu-backup',
        'x-risu-restore-without-fresh-snapshot': '1',
        'x-risu-restore-confirmation': body.confirmationToken,
      },
      body: new Uint8Array(backup),
    })
    body = await response.json()
  }
  expect(response.status, JSON.stringify(body)).toBe(200)
}

async function serverSave(client: RisuClient) {
  const response = await client.fetch('/api/backup/server/save', { method: 'POST' })
  expect(response.status).toBe(200)
  const events = (await response.text()).split('\n').filter(Boolean).map(line => JSON.parse(line))
  const filename = events.find(event => event.type === 'done')?.filename
  expect(filename).toMatch(/^risu-backup-\d+\.bin$/)
  return filename as string
}

function databaseEntry(backup: Buffer) {
  return decodeBackup(backup).find(entry => entry.name === 'database.risudat')!.data
}

describe('[B3-4] Reset-orphaned results are not delivered', () => {
  test.each([
    'backup-import',
    'server-restore',
    'folder-execute',
    'folder-upload',
    'snapshot-restore',
    'database-remove',
  ])('%s deletes both operation rows and every legacy result row in the successful reset', async kind => {
    const target = createSeedBackup({ includeAssets: true })
    const booted = await boot()
    let client = booted.client
    let before = 0

    if (kind === 'backup-import') {
      seedOrphanRows(booted.server)
      before = await readEpoch(client)
      await importWithSafety(client, target)
    } else if (kind === 'server-restore') {
      await importWithSafety(client, target)
      client = await withSession(booted.raw, `reset-orphans-${kind}-fresh`)
      const filename = await serverSave(client)
      seedOrphanRows(booted.server)
      before = await readEpoch(client)
      const response = await client.fetch('/api/backup/server/restore', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename }),
      })
      expect(response.status).toBe(200)
    } else if (kind === 'folder-execute') {
      const folder = await mkdtemp(path.join(tmpdir(), 'b34-folder-execute-'))
      await writeFile(path.join(folder, DB_HEX), databaseEntry(target))
      seedOrphanRows(booted.server)
      before = await readEpoch(client)
      const response = await client.fetch('/api/migrate/save-folder/execute', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: folder }),
      })
      expect(response.status).toBe(200)
    } else if (kind === 'folder-upload') {
      const archive = Buffer.from(zipSync({ [DB_HEX]: new Uint8Array(databaseEntry(target)) }))
      seedOrphanRows(booted.server)
      before = await readEpoch(client)
      const response = await client.fetch('/api/migrate/save-folder/upload', {
        method: 'POST', headers: { 'content-type': 'application/zip' }, body: new Uint8Array(archive),
      })
      expect(response.status).toBe(200)
    } else if (kind === 'snapshot-restore') {
      await importWithSafety(client, target)
      client = await withSession(booted.raw, `reset-orphans-${kind}-middle`)
      await importWithSafety(client, target)
      client = await withSession(booted.raw, `reset-orphans-${kind}-active`)
      const listed = await (await client.fetch('/api/db/snapshots')).json() as any
      const snapshot = listed.snapshots.find((entry: any) => entry.key.startsWith('database/dbbackup-'))
      expect(snapshot).toBeTruthy()
      seedOrphanRows(booted.server)
      before = await readEpoch(client)
      const response = await client.fetch('/api/db/snapshots/restore', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: snapshot.key }),
      })
      expect(response.status).toBe(200)
    } else {
      await importWithSafety(client, target)
      client = await withSession(booted.raw, `reset-orphans-${kind}-active`)
      seedOrphanRows(booted.server)
      before = await readEpoch(client)
      const response = await client.fetch('/api/remove', { headers: { 'file-path': DB_HEX } })
      expect(response.status).toBe(200)
    }

    expect(await readEpoch(client)).toBe(before + 1)
    await expectRowsAbsent(client)
    if (kind === 'snapshot-restore') {
      const fresh = await withSession(booted.raw, 'reset-orphans-snapshot-fresh-session')
      const response = await fresh.fetch('/api/bg-orchestrate-result/char-1/chat-1?delivery=ack-v1&consumerId=consumer-b34-compat')
      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toMatchObject({ found: false })
    }
  }, 45_000)

  test('a refused preparation and a mid-apply throw preserve epoch, rows, and deliverability', async () => {
    const refused = await boot({ RISU_BACKUP_IMPORT_MAX_BYTES: '1' })
    seedOrphanRows(refused.server)
    const refusedEpoch = await readEpoch(refused.client)
    const badPrepare = await refused.client.fetch('/api/backup/import/prepare', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ size: 2 }),
    })
    expect(badPrepare.status).toBeGreaterThanOrEqual(400)
    expect(await readEpoch(refused.client)).toBe(refusedEpoch)
    for (const key of ORPHAN_KEYS) expect(await readRawKey(refused.client, key), key).not.toHaveLength(0)

    const failed = await boot({
      POCKETRISU_TEST_STORAGE_RESET_FAILPOINT: 'after-storage-epoch-write',
      POCKETRISU_TEST_STORAGE_RESET_FAILPOINT_ON_ATTEMPT: '1',
    })
    seedOrphanRows(failed.server)
    const failedEpoch = await readEpoch(failed.client)
    const target = createSeedBackup({ includeAssets: true })
    const prepared = await failed.client.fetch('/api/backup/import/prepare', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ size: target.length }),
    })
    expect(prepared.status).toBe(200)
    const response = await failed.client.fetch('/api/backup/import', {
      method: 'POST', headers: { 'content-type': 'application/x-risu-backup' }, body: new Uint8Array(target),
    })
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(await readEpoch(failed.client)).toBe(failedEpoch)
    for (const key of ORPHAN_KEYS) expect(await readRawKey(failed.client, key), key).not.toHaveLength(0)

    const legacy = await failed.client.fetch(
      '/api/bg-orchestrate-result/char-1/chat-1?delivery=ack-v1&consumerId=consumer-b34-failed',
    )
    expect(legacy.status).toBe(200)
    await expect(legacy.json()).resolves.toMatchObject({ found: true, operationId: OPERATION_ID })
  }, 35_000)
})
