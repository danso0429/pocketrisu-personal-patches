import { afterAll, describe, expect, test } from 'vitest'
import Database from 'better-sqlite3'
import { Packr } from 'msgpackr'
import path from 'node:path'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import chunkStorePkg from '../../server/node/chunkStore.cjs'
import { spawnServer, type ServerHandle } from './helpers/spawnServer.js'
import { createClient } from './helpers/client.js'
import { createSeedBackup } from './helpers/seed.js'
import { decodeBackup } from './helpers/decode.js'
import { decodeRisuDat } from './helpers/normalize.js'

const { createChunkStore } = chunkStorePkg as {
  createChunkStore: (db: any) => { putValue: (key: string, value: Buffer) => void }
}
const MAGIC_RAW = Buffer.from([0, 82, 73, 83, 85, 83, 65, 86, 69, 0, 7])
const packr = new Packr({ useRecords: false })
const servers: ServerHandle[] = []
const tempDirs: string[] = []

afterAll(async () => {
  await Promise.allSettled(servers.map(server => server.cleanup()))
  await Promise.allSettled(tempDirs.map(directory => rm(directory, { recursive: true, force: true })))
})

async function waitForPath(filePath: string, timeoutMs = 1_500) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try { await readFile(filePath); return true } catch {}
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  return false
}

async function seededServer() {
  const server = await spawnServer()
  servers.push(server)
  const client = await createClient(server.port, server.password)
  const imported = await client.importBackup(createSeedBackup({
    characterCount: 1,
    includeAssets: true,
    pluginCustomStorage: {
      ordinary: { value: 1 },
      constructor: 'constructor-value',
      ['__proto__']: 'prototype-value',
      'nested/slash.key': ['kept'],
      '': 'empty-key',
    },
    coldStorageEntries: { legacy: { native: 'cold-storage' } },
  }))
  expect(imported.ok).toBe(true)
  // Seed the reserved-name row explicitly: object-literal/import plumbing may
  // normalize __proto__, while native plugin storage addresses it by base64url.
  const db = new Database(path.join(server.cwd, 'save', 'risuai.db'))
  const store = createChunkStore(db)
  store.putValue(
    'plugin-storage/' + Buffer.from('__proto__').toString('base64url'),
    Buffer.from(JSON.stringify('prototype-value')),
  )
  store.putValue('plugin-storage/__migrated__', Buffer.from('1'))
  db.close()
  return { server, client }
}

async function plainServer() {
  const server = await spawnServer()
  servers.push(server)
  const client = await createClient(server.port, server.password)
  expect((await client.importBackup(createSeedBackup({ characterCount: 1 }))).ok).toBe(true)
  return { server, client }
}

async function issueSession(port: number, token: string, sessionId: string) {
  const response = await fetch(`http://127.0.0.1:${port}/api/session`, {
    method: 'POST',
    headers: { 'risu-auth': token, 'x-session-id': sessionId },
  })
  expect(response.ok).toBe(true)
  return response.headers.get('set-cookie')!.split(';', 1)[0]
}

describe('[E2-6b] Rebase the snapshot lazy adapter onto PocketRisu 1.16.1', () => {
  test('[new] b1 freezes plugin rows at the post-flush capture boundary', async () => {
    const gateDir = await mkdtemp(path.join(tmpdir(), 'e2-6b-gate-'))
    tempDirs.push(gateDir)
    await writeFile(path.join(gateDir, 'export.hold'), 'hold')
    const server = await spawnServer({
      env: { POCKETRISU_TEST_BACKUP_SOURCE_GATE_DIR: gateDir },
    })
    servers.push(server)
    const client = await createClient(server.port, server.password)
    expect((await client.importBackup(createSeedBackup({
      pluginCustomStorage: { epoch: 'old' },
    }))).ok).toBe(true)

    const pinnedResponse = client.fetch('/api/backup/export')
    expect(
      await waitForPath(path.join(gateDir, 'export.entered')),
      'the existing backup-source gate is reached after capture',
    ).toBe(true)
    const db = new Database(path.join(server.cwd, 'save', 'risuai.db'))
    createChunkStore(db).putValue(
      'plugin-storage/' + Buffer.from('epoch').toString('base64url'),
      Buffer.from(JSON.stringify('new')),
    )
    db.close()
    await writeFile(path.join(gateDir, 'export.release'), 'release')

    const pinned = await pinnedResponse
    const pinnedDb = decodeRisuDat(
      decodeBackup(Buffer.from(await pinned.arrayBuffer())).at(-1)!.data,
    )
    const liveDb = decodeRisuDat(decodeBackup(await client.exportBackup()).at(-1)!.data)
    expect((pinnedDb.pluginCustomStorage as any).epoch).toBe('old')
    expect((liveDb.pluginCustomStorage as any).epoch).toBe('new')
  }, 30_000)

  test('[unchanged] b2 preserves native full/settings/upstream transformations for plugin keys, assets, and legacy cold storage', async () => {
    const { client } = await seededServer()

    const fullResponse = await client.fetch('/api/backup/export')
    expect(fullResponse.ok).toBe(true)
    const full = decodeBackup(Buffer.from(await fullResponse.arrayBuffer()))
    const fullDb = decodeRisuDat(full.find(entry => entry.name === 'database.risudat')!.data)
    const plugins = fullDb.pluginCustomStorage as Record<string, unknown>
    // Native 1.16.1 server.cjs:5398-5416 merges snapshot plugin rows with
    // own properties and then inlines archives; :5525-5531 exports legacy cold rows.
    expect(plugins).toMatchObject({
      ordinary: { value: 1 },
      constructor: 'constructor-value',
      'nested/slash.key': ['kept'],
      '': 'empty-key',
    })
    expect(full.find(entry => entry.name === 'coldstorage/legacy.json')?.data.toString())
      .toBe(JSON.stringify({ native: 'cold-storage' }))

    for (const query of [
      '?mode=settings&moduleAssets=1',
      '?mode=settings&moduleAssets=0',
      '?target=upstream',
    ]) {
      const response = await client.fetch('/api/backup/export' + query)
      expect(response.ok).toBe(true)
      const entries = decodeBackup(Buffer.from(await response.arrayBuffer()))
      expect(entries.at(-1)?.name).toBe('database.risudat')
      if (query.startsWith('?mode=settings')) {
        expect(entries.some(entry => entry.name.startsWith('coldstorage/'))).toBe(false)
        expect((decodeRisuDat(entries.at(-1)!.data).characters as unknown[])).toHaveLength(0)
      }
    }
  }, 30_000)

  test('[unchanged] b2 full download and server save inline a native archived character', async () => {
    const { server, client } = await plainServer()
    await issueSession(server.port, client.token, 'e2-6b-archive')
    const archived = await client.fetch('/api/characters/test-char-0/archive', {
      method: 'POST',
      headers: { 'x-session-id': 'e2-6b-archive', 'x-user-active': '1' },
    })
    expect(archived.status).toBe(200)

    const download = decodeBackup(await client.exportBackup())
    const downloadDb = decodeRisuDat(download.at(-1)!.data)
    expect((downloadDb.characters as Array<{ chaId: string }>).map(item => item.chaId))
      .toContain('test-char-0')
    expect(downloadDb.nodeOnlyArchivedCharacters).toBeUndefined()

    const save = await client.fetch('/api/backup/server/save', {
      method: 'POST', headers: { 'x-session-id': 'e2-6b-archive' },
    })
    const events = (await save.text()).trim().split('\n').map(line => JSON.parse(line))
    const saved = decodeBackup(await readFile(path.join(
      server.cwd, 'backups', events.at(-1).filename,
    )))
    const savedDb = decodeRisuDat(saved.at(-1)!.data)
    expect((savedDb.characters as Array<{ chaId: string }>).map(item => item.chaId))
      .toContain('test-char-0')
    expect(savedDb.nodeOnlyArchivedCharacters).toBeUndefined()
  }, 30_000)

  test('[unchanged] b7 accepts cookie-only downloads but keeps estimate and server save on their native auth/session gates', async () => {
    const { server, client } = await plainServer()
    const base = `http://127.0.0.1:${server.port}`
    const cookie = await issueSession(server.port, client.token, 'e2-6b-active')

    const cookieDownload = await fetch(base + '/api/backup/export', { headers: { cookie } })
    expect(cookieDownload.status).toBe(200)
    await cookieDownload.arrayBuffer()
    const fallbackDownload = await fetch(base + '/api/backup/export', {
      headers: { cookie: 'risu-session=expired', 'risu-auth': client.token },
    })
    expect(fallbackDownload.status).toBe(200)
    await fallbackDownload.arrayBuffer()
    expect((await fetch(base + '/api/backup/export')).status).toBe(400)
    const estimate = await fetch(base + '/api/backup/export/settings-estimate', { headers: { cookie } })
    expect(estimate.status).toBe(400)
    const inactiveSave = await fetch(base + '/api/backup/server/save', {
      method: 'POST', headers: { 'risu-auth': client.token, 'x-session-id': 'not-registered' },
    })
    expect(inactiveSave.status).toBe(423)
    const activeSave = await fetch(base + '/api/backup/server/save', {
      method: 'POST',
      headers: { 'risu-auth': client.token, 'x-session-id': 'e2-6b-active' },
    })
    expect(activeSave.status).toBe(200)
    expect((await activeSave.text()).trim().split('\n').at(-1)).toContain('"type":"done"')
  }, 30_000)

  test('[unchanged] b8 keeps native download framing and server-save NDJSON fields and counters', async () => {
    const { server, client } = await seededServer()
    const download = await client.fetch('/api/backup/export')
    const bytes = Buffer.from(await download.arrayBuffer())
    const entries = decodeBackup(bytes)
    // Native 1.16.1 server.cjs:5531-5545 sorts by sortKey, accounts for frame
    // bytes in Content-Length, and reports the namespaced-entry count; :5580 puts DB last.
    expect(download.headers.get('content-type')).toContain('application/octet-stream')
    expect(download.headers.get('content-disposition')).toMatch(/^attachment; filename="risu-backup-\d+\.bin"$/)
    expect(Number(download.headers.get('content-length'))).toBe(bytes.length)
    expect(Number(download.headers.get('x-risu-backup-assets'))).toBe(entries.length - 1)
    expect(entries.at(-1)?.name).toBe('database.risudat')

    const cookie = await issueSession(server.port, client.token, 'e2-6b-format')
    const save = await fetch(`http://127.0.0.1:${server.port}/api/backup/server/save`, {
      method: 'POST',
      headers: { 'risu-auth': client.token, cookie, 'x-session-id': 'e2-6b-format' },
    })
    const events = (await save.text()).trim().split('\n').map(line => JSON.parse(line))
    const done = events.at(-1)
    expect(done).toMatchObject({ type: 'done', ok: true })
    expect(done.filename).toMatch(/^risu-backup-\d+\.bin$/)
    expect(typeof done.size).toBe('number')
    expect(typeof done.dir).toBe('string')
    const saved = await readFile(path.join(server.cwd, 'backups', done.filename))
    expect(done.size).toBe(saved.length)
    expect(decodeBackup(saved).at(-1)?.name).toBe('database.risudat')
    const progress = events.filter(event => event.type === 'progress')
    expect(progress.at(-1).current).toBe(progress.at(-1).total)
    expect(progress.at(-1).totalBytes).toBe(
      decodeBackup(saved).slice(0, -1).reduce((sum, entry) => sum + entry.data.length, 0),
    )
  }, 30_000)

  test('[unchanged] b8 keeps native server-save progress boundaries for 125 non-database entries', async () => {
    const server = await spawnServer()
    servers.push(server)
    const client = await createClient(server.port, server.password)
    expect((await client.importBackup(createSeedBackup({
      characterCount: 125, includeAssets: true,
    }))).ok).toBe(true)
    const response = await client.fetch('/api/backup/server/save', { method: 'POST' })
    expect(response.status).toBe(200)
    const events = (await response.text()).trim().split('\n').map(line => JSON.parse(line))
    const progress = events.filter(event => event.type === 'progress')
    // Native 1.16.1 server.cjs:5934-5955 reports 50, 100, the non-DB end,
    // then the database completion; totalBytes excludes database.risudat (:5898).
    expect(progress.map(event => event.current)).toEqual([50, 100, 125, 126])
    expect(progress.every(event => event.total === 126)).toBe(true)
    expect(events.at(-1)).toMatchObject({ type: 'done', ok: true })
  }, 30_000)

  test('[new] b2b uses the pinned DB, not stale memory, for missing archive payload decisions while settings ignores stubs', async () => {
    const { server, client } = await plainServer()
    const before = decodeBackup(await client.exportBackup())
    const raw = decodeRisuDat(before.find(entry => entry.name === 'database.risudat')!.data)
    raw.nodeOnlyArchivedCharacters = [{
      chaId: 'missing-archive', name: 'Pinned Missing', archivedAt: 1_700_000_000_000,
    }]
    const encoded = Buffer.concat([MAGIC_RAW, packr.encode(raw)])
    const db = new Database(path.join(server.cwd, 'save', 'risuai.db'))
    createChunkStore(db).putValue('database/database.bin', encoded)
    db.close()

    const full = await client.fetch('/api/backup/export')
    const fullText = await full.text()
    let fullBody: any = { raw: fullText }
    try { fullBody = JSON.parse(fullText) } catch {}
    const settings = await client.fetch('/api/backup/export?mode=settings')
    const save = await client.fetch('/api/backup/server/save', { method: 'POST' })
    const saveText = await save.text()
    const corruptDb = new Database(path.join(server.cwd, 'save', 'risuai.db'))
    createChunkStore(corruptDb).putValue(
      'archive/missing-archive/1700000000000', Buffer.from('corrupt-payload'),
    )
    corruptDb.close()
    const corruptFull = await client.fetch('/api/backup/export')
    const corruptFullText = await corruptFull.text()
    let corruptFullCode: string | undefined
    try { corruptFullCode = JSON.parse(corruptFullText).code } catch {}
    const corruptSave = await client.fetch('/api/backup/server/save', { method: 'POST' })
    const corruptSaveText = await corruptSave.text()
    expect({
      fullStatus: full.status,
      fullCode: fullBody.code,
      settingsStatus: settings.status,
      saveStatus: save.status,
      saveError: saveText.includes('Deactivated character data missing: Pinned Missing'),
      corruptFullStatus: corruptFull.status,
      corruptFullCode,
      corruptSaveError: corruptSaveText.includes('Deactivated character data missing: Pinned Missing'),
    }).toEqual({
      fullStatus: 500,
      fullCode: 'ARCHIVE_PAYLOAD_MISSING',
      settingsStatus: 200,
      saveStatus: 200,
      saveError: true,
      corruptFullStatus: 500,
      corruptFullCode: 'ARCHIVE_PAYLOAD_MISSING',
      corruptSaveError: true,
    })
  }, 30_000)

  test('[new] b2b skips an archive stub whose chaId is already active in the pinned database', async () => {
    const { server, client } = await plainServer()
    const before = decodeBackup(await client.exportBackup())
    const raw = decodeRisuDat(before.find(entry => entry.name === 'database.risudat')!.data)
    const activeId = (raw.characters as Array<{ chaId: string }>)[0].chaId
    raw.nodeOnlyArchivedCharacters = [{
      chaId: activeId, name: 'Duplicate Stub', archivedAt: 1_700_000_000_001,
    }]
    const db = new Database(path.join(server.cwd, 'save', 'risuai.db'))
    createChunkStore(db).putValue(
      'database/database.bin', Buffer.concat([MAGIC_RAW, packr.encode(raw)]),
    )
    db.close()

    const response = await client.fetch('/api/backup/export')
    const output = decodeRisuDat(decodeBackup(Buffer.from(await response.arrayBuffer())).at(-1)!.data)
    expect({ status: response.status, stubs: output.nodeOnlyArchivedCharacters })
      .toEqual({ status: 200, stubs: undefined })
  }, 30_000)

  test('[new] b8 D2 rejects all four database-less endpoints with BACKUP_DATABASE_MISSING', async () => {
    const server = await spawnServer()
    servers.push(server)
    const client = await createClient(server.port, server.password)
    const outcomes: Array<{ status: number; code?: string }> = []
    for (const [url, method] of [
      ['/api/backup/export', 'GET'],
      ['/api/backup/export?mode=settings', 'GET'],
      ['/api/backup/export/settings-estimate', 'GET'],
      ['/api/backup/server/save', 'POST'],
    ] as const) {
      const response = await client.fetch(url, { method })
      const text = await response.text()
      let code: string | undefined
      try { code = JSON.parse(text).code } catch {}
      outcomes.push({ status: response.status, code })
    }
    expect(outcomes).toEqual(Array.from({ length: 4 }, () => ({
      status: 500, code: 'BACKUP_DATABASE_MISSING',
    })))
  }, 30_000)

  test('[new] b9 startup removes only stale private pin directories', async () => {
    const server = await spawnServer({
      seedSave: async (saveDir) => {
        const root = path.join(saveDir, '.backup-source-pins')
        await mkdir(path.join(root, '.point-in-time-stale'), { recursive: true })
        await mkdir(path.join(root, 'unrelated-directory'), { recursive: true })
        await writeFile(path.join(root, '.point-in-time-stale', 'pin'), 'stale')
        await writeFile(path.join(root, 'unrelated-file'), 'keep')
      },
    })
    servers.push(server)
    const names = (await readdir(path.join(server.cwd, 'save', '.backup-source-pins'))).sort()
    expect(names).toEqual(['unrelated-directory', 'unrelated-file'])
  }, 20_000)
})
