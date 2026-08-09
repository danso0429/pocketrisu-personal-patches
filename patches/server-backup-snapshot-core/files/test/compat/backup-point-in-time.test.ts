import { afterAll, describe, expect, test } from 'vitest'
import Database from 'better-sqlite3'
import { Packr } from 'msgpackr'
import { gzipSync } from 'node:zlib'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import chunkStorePkg from '../../server/node/chunkStore.cjs'
import { spawnServer, type ServerHandle } from './helpers/spawnServer.js'
import { createClient } from './helpers/client.js'
import { createSeedBackup } from './helpers/seed.js'
import { decodeBackup } from './helpers/decode.js'
import { encodeBackup } from './helpers/encode.js'
import { normalizeBackup } from './helpers/normalize.js'

const { createChunkStore } = chunkStorePkg as {
  createChunkStore: (db: any, options?: { threshold?: number }) => {
    putValue: (key: string, value: Buffer) => void
  }
}

const servers: ServerHandle[] = []
const tempDirs: string[] = []
const COLD_KEY = '11111111-2222-3333-4444-555555555555'
const MAGIC_RAW = Buffer.from([0, 82, 73, 83, 85, 83, 65, 86, 69, 0, 7])
const packr = new Packr({ useRecords: false })

afterAll(async () => {
  await Promise.allSettled(servers.map(server => server.cleanup()))
  await Promise.allSettled(tempDirs.map(directory => rm(directory, {
    recursive: true,
    force: true,
  })))
})

function epochBackup(label: 'old' | 'new', characterCount: number): Buffer {
  const coreEntries = decodeBackup(createSeedBackup({ characterCount }))
  const rawDatabase = normalizeBackup(encodeBackup(coreEntries)).raw
  rawDatabase.mainPrompt = label + '-prompt'
  rawDatabase.customBackground = 'assets/epoch-asset.bin'
  const encodedDatabase = Buffer.concat([MAGIC_RAW, packr.encode(rawDatabase)])
  return encodeBackup([
    ...coreEntries.map(entry => entry.name === 'database.risudat'
      ? { ...entry, data: encodedDatabase }
      : entry),
    { name: 'epoch-asset.bin', data: Buffer.from(label + '-asset') },
    {
      name: 'coldstorage/' + COLD_KEY + '.json',
      data: Buffer.from(JSON.stringify({ epoch: label })),
    },
    { name: 'inlay/epoch.png', data: Buffer.from(label + '-inlay') },
    {
      name: 'inlay_sidecar/epoch',
      data: Buffer.from(JSON.stringify({
        ext: 'png',
        name: label + '-inlay.png',
        type: 'image',
      })),
    },
    {
      name: 'inlay_meta/epoch',
      data: Buffer.from(JSON.stringify({ epoch: label })),
    },
  ])
}

function entryMap(backup: Buffer): Map<string, Buffer> {
  return new Map(decodeBackup(backup).map(entry => [entry.name, entry.data]))
}

function expectOldEpoch(backup: Buffer) {
  const entries = entryMap(backup)
  expect(normalizeBackup(backup).normalized.characterCount).toBe(1)
  expect(normalizeBackup(backup).raw.mainPrompt).toBe('old-prompt')
  expect(entries.get('epoch-asset.bin')?.toString()).toBe('old-asset')
  expect(JSON.parse(entries.get('coldstorage/' + COLD_KEY + '.json')!.toString()).epoch)
    .toBe('old')
  expect(entries.get('inlay/epoch.png')?.toString()).toBe('old-inlay')
  expect(JSON.parse(entries.get('inlay_sidecar/epoch')!.toString()).name)
    .toBe('old-inlay.png')
  expect(JSON.parse(entries.get('inlay_meta/epoch')!.toString()).epoch)
    .toBe('old')
}

function expectNewEpoch(backup: Buffer) {
  const entries = entryMap(backup)
  expect(normalizeBackup(backup).normalized.characterCount).toBe(2)
  expect(normalizeBackup(backup).raw.mainPrompt).toBe('new-prompt')
  expect(entries.get('epoch-asset.bin')?.toString()).toBe('new-asset')
  expect(JSON.parse(entries.get('coldstorage/' + COLD_KEY + '.json')!.toString()).epoch)
    .toBe('new')
  expect(entries.get('inlay/epoch.png')?.toString()).toBe('new-inlay')
  expect(JSON.parse(entries.get('inlay_sidecar/epoch')!.toString()).name)
    .toBe('new-inlay.png')
  expect(JSON.parse(entries.get('inlay_meta/epoch')!.toString()).epoch)
    .toBe('new')
}

async function waitForFile(filePath: string, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      await readFile(filePath)
      return
    } catch {
      await new Promise(resolve => setTimeout(resolve, 10))
    }
  }
  throw new Error('Timed out waiting for backup test gate: ' + filePath)
}

async function waitForEmptyDirectory(directory: string, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      if ((await readdir(directory)).length === 0) return
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('Timed out waiting for backup source cleanup: ' + directory)
}

async function createGatedServer(kind: string) {
  const gateDir = await mkdtemp(path.join(tmpdir(), 'backup-source-gate-'))
  tempDirs.push(gateDir)
  await writeFile(path.join(gateDir, kind + '.hold'), 'hold', 'utf-8')
  const server = await spawnServer({
    env: { POCKETRISU_TEST_BACKUP_SOURCE_GATE_DIR: gateDir },
  })
  servers.push(server)
  const client = await createClient(server.port, server.password)
  const seed = epochBackup('old', 1)
  let imported = await client.importBackup(seed) as {
    ok?: boolean
    code?: string
    confirmationToken?: string
  }
  if (
    imported.code === 'fresh_snapshot_required'
    && typeof imported.confirmationToken === 'string'
  ) {
    const retry = await client.fetch('/api/backup/import', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-risu-backup',
        'x-risu-restore-without-fresh-snapshot': '1',
        'x-risu-restore-confirmation': imported.confirmationToken,
      },
      body: new Uint8Array(seed),
    })
    imported = await retry.json() as { ok?: boolean }
  }
  expect(imported.ok, JSON.stringify(imported)).toBe(true)
  return { gateDir, server, client }
}

async function proveQueueReleasedAndMutate(
  gateDir: string,
  server: ServerHandle,
  client: Awaited<ReturnType<typeof createClient>>,
) {
  const queuedWrite = client.fetch('/api/write', {
    method: 'POST',
    headers: {
      'content-type': 'application/octet-stream',
      'file-path': Buffer.from('assets/epoch-asset.bin').toString('hex'),
    },
    body: new Uint8Array(Buffer.from('new-asset')),
  })
  const writeResponse = await Promise.race([
    queuedWrite,
    new Promise<never>((_, reject) => setTimeout(
      () => reject(new Error('storage queue stayed locked after source capture')),
      3_000,
    )),
  ])
  if (!writeResponse.ok) {
    throw new Error(
      'queued write failed while source was pinned: '
        + writeResponse.status
        + ' '
        + await writeResponse.text(),
    )
  }

  const newDatabase = entryMap(epochBackup('new', 2)).get('database.risudat')!
  const database = new Database(path.join(server.cwd, 'save', 'risuai.db'))
  database.pragma('busy_timeout = 1000')
  const store = createChunkStore(database, { threshold: 32 })
  database.transaction(() => {
    store.putValue('database/database.bin', newDatabase)
    store.putValue(
      'inlay_meta/epoch',
      Buffer.from(JSON.stringify({ epoch: 'new' })),
    )
    store.putValue(
      'coldstorage/' + COLD_KEY,
      gzipSync(Buffer.from(JSON.stringify({ epoch: 'new' }))),
    )
  })()
  database.close()

  const inlayDir = path.join(server.cwd, 'save', 'inlays')
  await mkdir(inlayDir, { recursive: true })
  await writeFile(path.join(inlayDir, 'epoch.png'), Buffer.from('new-inlay'))
  await writeFile(
    path.join(inlayDir, 'epoch.meta.json'),
    JSON.stringify({ ext: 'png', name: 'new-inlay.png', type: 'image' }),
    'utf-8',
  )
}

describe('point-in-time backup endpoints', () => {
  test('backup endpoints fail closed when the pinned source has no database', async () => {
    const server = await spawnServer()
    servers.push(server)
    const client = await createClient(server.port, server.password)

    for (const request of [
      { path: '/api/backup/export' },
      { path: '/api/backup/export?mode=settings' },
      { path: '/api/backup/export/settings-estimate' },
      { path: '/api/backup/server/save', init: { method: 'POST' } },
    ]) {
      const response = await client.fetch(request.path, request.init)
      expect(response.status).toBe(500)
      await expect(response.json()).resolves.toMatchObject({
        code: 'BACKUP_DATABASE_MISSING',
      })
    }

    await waitForEmptyDirectory(path.join(server.cwd, 'save', '.backup-source-pins'))
  }, 20_000)

  test('download export keeps its pinned DB, KV, and filesystem epoch', async () => {
    const { gateDir, server, client } = await createGatedServer('export')
    const responsePromise = client.fetch('/api/backup/export')
    await waitForFile(path.join(gateDir, 'export.entered'))
    await proveQueueReleasedAndMutate(gateDir, server, client)
    await writeFile(path.join(gateDir, 'export.release'), 'release', 'utf-8')

    const response = await responsePromise
    expect(response.ok).toBe(true)
    const backup = Buffer.from(await response.arrayBuffer())
    expect(Number(response.headers.get('content-length'))).toBe(backup.length)
    expectOldEpoch(backup)
    expectNewEpoch(await client.exportBackup())
    await waitForEmptyDirectory(path.join(server.cwd, 'save', '.backup-source-pins'))
  }, 20_000)

  test('server save publishes only the pinned epoch and exact framed size', async () => {
    const { gateDir, server, client } = await createGatedServer('server-save')
    const responsePromise = client.fetch('/api/backup/server/save', { method: 'POST' })
    await waitForFile(path.join(gateDir, 'server-save.entered'))
    await proveQueueReleasedAndMutate(gateDir, server, client)
    await writeFile(path.join(gateDir, 'server-save.release'), 'release', 'utf-8')

    const response = await responsePromise
    expect(response.ok).toBe(true)
    const events = (await response.text())
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line) as {
        type: string
        filename?: string
        size?: number
      })
    const done = events.find(event => event.type === 'done')
    expect(done?.filename).toMatch(/^risu-backup-\d+\.bin$/)
    const backupPath = path.join(server.cwd, 'backups', done!.filename!)
    const backup = await readFile(backupPath)
    expect(done?.size).toBe(backup.length)
    expectOldEpoch(backup)
    expect((await readdir(path.join(server.cwd, 'backups')))
      .some(name => name.endsWith('.tmp'))).toBe(false)
    await waitForEmptyDirectory(path.join(server.cwd, 'save', '.backup-source-pins'))
  }, 20_000)

  test('settings-only export keeps one coherent settings DB and referenced asset', async () => {
    const { gateDir, server, client } = await createGatedServer('export')
    const responsePromise = client.fetch('/api/backup/export?mode=settings')
    await waitForFile(path.join(gateDir, 'export.entered'))
    await proveQueueReleasedAndMutate(gateDir, server, client)
    await writeFile(path.join(gateDir, 'export.release'), 'release', 'utf-8')

    const response = await responsePromise
    expect(response.ok).toBe(true)
    const backup = Buffer.from(await response.arrayBuffer())
    const entries = entryMap(backup)
    expect(Number(response.headers.get('content-length'))).toBe(backup.length)
    expect(normalizeBackup(backup).raw.mainPrompt).toBe('old-prompt')
    expect(normalizeBackup(backup).normalized.characterCount).toBe(0)
    expect(entries.get('epoch-asset.bin')?.toString()).toBe('old-asset')
    expect([...entries.keys()].some(name => name.startsWith('coldstorage/'))).toBe(false)
    expect([...entries.keys()].some(name => name.startsWith('inlay/'))).toBe(false)
    await waitForEmptyDirectory(path.join(server.cwd, 'save', '.backup-source-pins'))
  }, 20_000)

  test('disconnect at the pinned-source gate releases snapshot and private pins', async () => {
    const { gateDir, server, client } = await createGatedServer('export')
    const controller = new AbortController()
    const responsePromise = client.fetch('/api/backup/export', {
      signal: controller.signal,
    })
    await waitForFile(path.join(gateDir, 'export.entered'))
    controller.abort()
    await expect(responsePromise).rejects.toThrow()
    await waitForEmptyDirectory(path.join(server.cwd, 'save', '.backup-source-pins'))

    const health = await client.fetch('/api/backup/server/list')
    expect(health.ok).toBe(true)
  }, 20_000)

  test('database maintenance rejects a pinned reader and succeeds after release', async () => {
    const { gateDir, server, client } = await createGatedServer('export')
    const responsePromise = client.fetch('/api/backup/export')
    await waitForFile(path.join(gateDir, 'export.entered'))

    for (const endpoint of ['/api/db/optimize', '/api/db/wal-checkpoint']) {
      const blocked = await client.fetch(endpoint, { method: 'POST' })
      expect(blocked.status).toBe(409)
      await expect(blocked.json()).resolves.toMatchObject({
        code: 'BACKUP_SOURCE_MAINTENANCE_BUSY',
        retryable: true,
        activeSources: 1,
      })
    }

    await writeFile(path.join(gateDir, 'export.release'), 'release', 'utf-8')
    const response = await responsePromise
    expect(response.ok).toBe(true)
    await response.arrayBuffer()
    await waitForEmptyDirectory(path.join(server.cwd, 'save', '.backup-source-pins'))

    for (const endpoint of ['/api/db/optimize', '/api/db/wal-checkpoint']) {
      const completed = await client.fetch(endpoint, { method: 'POST' })
      expect(completed.ok).toBe(true)
      await expect(completed.json()).resolves.toMatchObject({ ok: true })
    }
  }, 20_000)
})
