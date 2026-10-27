// Cases of server-backup-snapshot-core test/compat/storage-reset-b1a.test.ts
// that run with lazy-chat-sync alone, moved verbatim with the helpers they
// use. The cases that need the capture exclusion (E2-6), background runs
// (E2-7), the chat revision protocol (E2-3d) or the 1.10.0 spool and
// prepare/apply structure stay in the original file.
import { afterAll, describe, expect, test } from 'vitest'
import { request as httpRequest, type ClientRequest } from 'node:http'
import { cp, mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Packr } from 'msgpackr'
import { Zip, ZipPassThrough, zipSync } from 'fflate'
import utilsPackage from '../../server/node/utils.cjs'
import { spawnServer, type ServerHandle } from './helpers/spawnServer.js'
import { createClient, type RisuClient } from './helpers/client.js'
import { createSeedBackup } from './helpers/seed.js'
import { decodeBackup } from './helpers/decode.js'
import { encodeBackup } from './helpers/encode.js'
import { normalizeBackup } from './helpers/normalize.js'

const servers: ServerHandle[] = []
const MAGIC_RAW = Buffer.from([0, 82, 73, 83, 85, 83, 65, 86, 69, 0, 7])
const packr = new Packr({ useRecords: false })
const { decodeRisuSave } = utilsPackage as {
  decodeRisuSave: (raw: Uint8Array) => Promise<any>
}
const DB_KEY = 'database/database.bin'
const DB_HEX = Buffer.from(DB_KEY).toString('hex')
const EPOCH_KEY = 'internal/storage-epoch/v1'
const RECOVERY_KEYS = [
  'bg-orch-state-op:operation-b1b-reset',
  'bg-orch-result-op:operation-b1b-reset',
  'internal/server-chat-input/v1/b1b-reset',
  'internal/server-chat-commit/v1/b1b-reset',
  'internal/chat-write/v1/b1b-reset',
]
const OPERATION_KEYS = RECOVERY_KEYS.slice(0, 2)

afterAll(async () => {
  await Promise.allSettled(servers.map(server => server.cleanup()))
})

function labelledBackup(label: string, extraEntries: Array<{ name: string, data: Buffer }> = []) {
  const entries = decodeBackup(createSeedBackup({ includeAssets: true }))
  const database = normalizeBackup(encodeBackup(entries)).raw as any
  database.mainPrompt = `${label}-prompt`
  database.characters[0].chats[0].message[0].data = `${label}-chat`
  const databaseBytes = Buffer.concat([MAGIC_RAW, packr.encode(database)])
  return encodeBackup([
    ...entries.map(entry => entry.name === 'database.risudat'
      ? { ...entry, data: databaseBytes }
      : entry),
    ...extraEntries,
  ])
}

function labelOf(backup: Buffer) {
  const database = normalizeBackup(backup).raw as any
  return {
    prompt: database.mainPrompt,
    chat: database.characters[0].chats[0].message[0].data,
  }
}

async function boot(env: Record<string, string> = {}) {
  const server = await spawnServer({ env })
  servers.push(server)
  return { server, client: await withSession(await createClient(server.port, server.password)) }
}

async function withSession(client: RisuClient): Promise<RisuClient> {
  const session = await client.fetch('/api/session', {
    method: 'POST',
    headers: { 'x-session-id': 'storage-reset-b1a' },
  })
  expect(session.status).toBe(200)
  const cookie = (session.headers.get('set-cookie') ?? '').split(';', 1)[0]
  expect(cookie).toMatch(/^risu-session=/)
  return {
    ...client,
    fetch: (route, init = {}) => {
      const headers = new Headers(init.headers)
      headers.set('cookie', cookie)
      return client.fetch(route, { ...init, headers })
    },
  }
}

async function importWithSafety(client: RisuClient, backup: Buffer) {
  let response = await client.fetch('/api/backup/import/prepare', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ size: backup.byteLength }),
  })
  expect(response.status).toBe(200)
  response = await client.fetch('/api/backup/import', {
    method: 'POST',
    headers: { 'content-type': 'application/x-risu-backup' },
    body: new Uint8Array(backup),
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
  expect(body.ok, JSON.stringify(body)).toBe(true)
}

async function expectLabel(client: RisuClient, label: string) {
  expect(labelOf(await client.exportBackup())).toEqual({
    prompt: `${label}-prompt`,
    chat: `${label}-chat`,
  })
}

async function readChat(client: RisuClient) {
  const response = await client.fetch('/api/chat-content/test-char-0/0', {
    headers: { 'x-chat-id': 'chat-0-0' },
  })
  expect(response.status).toBe(200)
  return {
    chat: await decodeRisuSave(new Uint8Array(await response.arrayBuffer())),
    revision: response.headers.get('x-chat-revision') ?? '',
  }
}

async function writeChat(client: RisuClient, mutate: (chat: any) => void = chat => {
  chat.message.push({ role: 'user', data: 'dirty-before-reset' })
}) {
  const { chat, revision } = await readChat(client)
  mutate(chat)
  return client.fetch('/api/chat-content/test-char-0/0', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-chat-id': 'chat-0-0',
      'x-chat-base-revision': revision,
    },
    body: JSON.stringify(chat),
  })
}

type HeldUpload = {
  request: ClientRequest
  response: Promise<{ status: number, headers: Headers, body: any }>
  finish: () => void
  abort: () => void
}

function holdUpload(
  server: ServerHandle,
  client: RisuClient,
  route: string,
  bytes: Buffer,
  splitAt: number,
  contentType: string,
  headers: Record<string, string> = {},
): HeldUpload {
  let finish!: () => void
  let abort!: () => void
  let request!: ClientRequest
  const response = new Promise<{ status: number, headers: Headers, body: any }>((resolve, reject) => {
    request = httpRequest({
      host: '127.0.0.1',
      port: server.port,
      path: route,
      method: 'POST',
      headers: {
        'risu-auth': client.token,
        'content-type': contentType,
        'content-length': String(bytes.length),
        ...headers,
      },
    }, res => {
      const chunks: Buffer[] = []
      res.on('data', chunk => chunks.push(Buffer.from(chunk)))
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8')
        let body: any = raw
        try { body = JSON.parse(raw) } catch {}
        resolve({
          status: res.statusCode ?? 0,
          headers: new Headers(Object.entries(res.headers).flatMap(([key, value]) =>
            value == null ? [] : [[key, Array.isArray(value) ? value.join(', ') : value]])),
          body,
        })
      })
    })
    request.once('error', reject)
    request.write(bytes.subarray(0, splitAt))
    request.flushHeaders()
    finish = () => request.end(bytes.subarray(splitAt))
    abort = () => request.destroy(new Error('test-aborted-upload'))
  })
  return { request, response, finish, abort }
}

async function waitForReset(client: RisuClient, timeoutMs = 4_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const response = await client.fetch('/api/db/flush', { method: 'POST' })
    if (response.status === 503) {
      await expect(response.json()).resolves.toMatchObject({
        code: 'STORAGE_RESET_IN_PROGRESS',
        retryable: true,
      })
      return
    }
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error('storage reset flag was not observable while upload was held')
}

async function expectResetRefusal(response: Response) {
  expect(response.status).toBe(503)
  expect(response.headers.has('x-bg-save-blocked')).toBe(false)
  await expect(response.json()).resolves.toMatchObject({
    code: 'STORAGE_RESET_IN_PROGRESS',
    retryable: true,
  })
}

async function prepareHeldImport(
  server: ServerHandle,
  client: RisuClient,
  backup: Buffer,
  splitAt = 8,
  requestHeaders: Record<string, string> = {},
) {
  const prepared = await client.fetch('/api/backup/import/prepare', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ size: backup.length }),
  })
  expect(prepared.status).toBe(200)
  const held = holdUpload(
    server,
    client,
    '/api/backup/import',
    backup,
    splitAt,
    'application/x-risu-backup',
    requestHeaders,
  )
  try {
    await waitForReset(client)
  } catch (error) {
    held.abort()
    await held.response.catch(() => undefined)
    throw error
  }
  return held
}

function saveFolderZip(databaseBytes: Buffer, additional: Record<string, Uint8Array> = {}) {
  return Buffer.from(zipSync({
    [DB_HEX]: new Uint8Array(databaseBytes),
    ...additional,
  }))
}

function databaseEntry(backup: Buffer) {
  return decodeBackup(backup).find(entry => entry.name === 'database.risudat')!.data
}

function duplicateSaveFolderZip(first: Buffer, last: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    const zip = new Zip((error, data, final) => {
      if (error) return reject(error)
      chunks.push(Buffer.from(data))
      if (final) resolve(Buffer.concat(chunks))
    })
    for (const value of [first, last]) {
      const entry = new ZipPassThrough(DB_HEX)
      zip.add(entry)
      entry.push(new Uint8Array(value), true)
    }
    zip.end()
  })
}

async function writeRawKey(client: RisuClient, key: string, value: string | Buffer) {
  const response = await client.fetch('/api/write', {
    method: 'POST',
    headers: {
      'file-path': Buffer.from(key).toString('hex'),
      'content-type': 'application/octet-stream',
    },
    body: new Uint8Array(Buffer.isBuffer(value) ? value : Buffer.from(value)),
  })
  expect(response.status, `${key}: ${await response.clone().text()}`).toBe(200)
}

async function readRawKey(client: RisuClient, key: string) {
  const response = await client.fetch('/api/read', {
    headers: { 'file-path': Buffer.from(key).toString('hex') },
  })
  expect(response.status).toBe(200)
  return Buffer.from(await response.arrayBuffer())
}

async function readStorageEpoch(client: RisuClient) {
  const raw = (await readRawKey(client, EPOCH_KEY)).toString('utf8').trim()
  return raw === '' ? 0 : Number(raw)
}

async function seedOperationRows(client: RisuClient) {
  await writeRawKey(client, OPERATION_KEYS[0], JSON.stringify({
    operationId: 'operation-b1b-reset', charId: 'char-1', chatId: 'chat-1', state: 'result-ready',
  }))
  await writeRawKey(client, OPERATION_KEYS[1], JSON.stringify({
    operationId: 'operation-b1b-reset', resultId: 'result-b1b-reset', final: true,
  }))
}

describe('[B1a-4] Atomic backup import and server restore', () => {
  test('a pending persist cannot overwrite an import immediately, after debounce, or after restart', async () => {
    const { server, client } = await boot()
    await importWithSafety(client, labelledBackup('before'))
    expect((await writeChat(client)).status).toBe(200)

    const target = labelledBackup('after')
    const database = decodeBackup(target).find(entry => entry.name === 'database.risudat')!
    const splitAfterDatabase = encodeBackup([database]).length
    const held = await prepareHeldImport(server, client, target, splitAfterDatabase)
    await new Promise(resolve => setTimeout(resolve, 6_000))
    held.finish()
    expect((await held.response).status).toBe(200)
    await expectLabel(client, 'after')
    await new Promise(resolve => setTimeout(resolve, 6_000))
    await expectLabel(client, 'after')

    const copied = await mkdtemp(path.join(tmpdir(), 'reset-restart-'))
    await cp(path.join(server.cwd, 'save'), copied, { recursive: true })
    const restarted = await spawnServer({ seedSave: saveDir => cp(copied, saveDir, { recursive: true }) })
    servers.push(restarted)
    await expectLabel(await createClient(restarted.port, restarted.password), 'after')
  }, 35_000)

  test.each([
    ['after-destructive-deletes', false],
    ['second-inlay-rename', false],
    ['commit-after-inlay-swap', false],
    ['reverse-inlay-rename', true],
  ])('caught failpoint %s is atomic and reports recovery-required only when rollback cannot restore files', async (failpoint, recoveryRequired) => {
    const { server, client } = await boot({
      POCKETRISU_TEST_STORAGE_RESET_FAILPOINT: failpoint,
      POCKETRISU_TEST_STORAGE_RESET_FAILPOINT_ON_ATTEMPT: '2',
    })
    await importWithSafety(client, labelledBackup('before', [
      { name: 'inlay/before.png', data: Buffer.from('before-image') },
    ]))
    expect(await readFile(path.join(server.cwd, 'save', 'inlays', 'before.png')))
      .toEqual(Buffer.from('before-image'))
    const response = await client.fetch('/api/backup/import', {
      method: 'POST',
      headers: { 'content-type': 'application/x-risu-backup' },
      body: new Uint8Array(labelledBackup('after', [
        { name: 'inlay/after.png', data: Buffer.from('after-image') },
      ])),
    })
    expect(response.status).toBeGreaterThanOrEqual(400)
    const failureBody = await response.json() as any
    await expectLabel(client, 'before')
    const writer = await client.fetch('/api/db/flush', { method: 'POST' })
    if (recoveryRequired) {
      expect(failureBody).toMatchObject({
        code: 'STORAGE_RECOVERY_REQUIRED',
        retryable: false,
        recoveryPath: expect.any(String),
      })
      expect((await stat(failureBody.recoveryPath)).isDirectory()).toBe(true)
      expect(writer.status).toBe(503)
      await expect(writer.json()).resolves.toMatchObject({
        code: 'STORAGE_RECOVERY_REQUIRED', retryable: false,
      })
    } else {
      expect(await readFile(path.join(server.cwd, 'save', 'inlays', 'before.png')))
        .toEqual(Buffer.from('before-image'))
      await expect(readFile(path.join(server.cwd, 'save', 'inlays', 'after.png'))).rejects.toThrow()
      expect(writer.status).not.toBe(503)
    }
  }, 30_000)

  test('more than 5,000 entries remain one transaction when a late entry throws', async () => {
    const { client } = await boot({
      POCKETRISU_TEST_STORAGE_RESET_FAILPOINT: 'entry:5200',
      POCKETRISU_TEST_STORAGE_RESET_FAILPOINT_ON_ATTEMPT: '2',
    })
    await importWithSafety(client, labelledBackup('before'))
    const entries = Array.from({ length: 5_500 }, (_, index) => ({
      name: Buffer.from(`assets/entry-${index}`).toString('hex'),
      data: Buffer.from(`asset-${index}`),
    }))
    const response = await client.fetch('/api/backup/import', {
      method: 'POST',
      headers: { 'content-type': 'application/x-risu-backup' },
      body: new Uint8Array(labelledBackup('after', entries)),
    })
    expect(response.status).toBeGreaterThanOrEqual(400)
    await expectLabel(client, 'before')
    expect((await client.fetch('/api/db/flush', { method: 'POST' })).status).toBe(200)
  }, 60_000)
})

describe('[B1a-5] Atomic save-folder, snapshot and database removal resets', () => {
  test('truncated save-folder upload cleans its spool and permits the next write and reset', async () => {
    const { server, client } = await boot()
    await importWithSafety(client, labelledBackup('before'))
    const zip = saveFolderZip(databaseEntry(labelledBackup('after')))
    const held = holdUpload(server, client, '/api/migrate/save-folder/upload', zip, 8, 'application/zip')
    try {
      await waitForReset(client)
    } catch (error) {
      held.abort()
      await held.response.catch(() => undefined)
      throw error
    }
    held.abort()
    await held.response.catch(() => undefined)
    await new Promise(resolve => setTimeout(resolve, 100))
    expect((await client.fetch('/api/db/flush', { method: 'POST' })).status).toBe(200)
    await expectLabel(client, 'before')
    const retry = await client.fetch('/api/migrate/save-folder/upload', {
      method: 'POST', headers: { 'content-type': 'application/zip' }, body: new Uint8Array(zip),
    })
    expect(retry.status).toBe(200)
    await expectLabel(client, 'after')
  }, 25_000)

  test('database.bin removal uses the full reset lifecycle while ordinary keys retain normal removal semantics', async () => {
    const gateDir = await mkdtemp(path.join(tmpdir(), 'remove-reset-gate-'))
    const { client } = await boot({ POCKETRISU_TEST_STORAGE_RESET_GATE_DIR: gateDir })
    await importWithSafety(client, labelledBackup('before'))
    await writeFile(path.join(gateDir, 'database-remove.apply.hold'), 'hold')
    const removing = client.fetch('/api/remove', { headers: { 'file-path': DB_HEX } })
    for (let i = 0; i < 200; i += 1) {
      try { await stat(path.join(gateDir, 'database-remove.apply.entered')); break } catch { await new Promise(resolve => setTimeout(resolve, 10)) }
    }
    await expectResetRefusal(await client.fetch('/api/patch', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    }))
    await writeFile(path.join(gateDir, 'database-remove.apply.release'), 'release')
    expect((await removing).status).toBe(200)
    expect((await client.fetch('/api/read', { headers: { 'file-path': DB_HEX } })).status).toBe(200)

    const key = 'other.bin'
    const keyHex = Buffer.from(key).toString('hex')
    expect((await client.fetch('/api/write', {
      method: 'POST', headers: { 'file-path': keyHex, 'content-type': 'application/octet-stream' }, body: new Uint8Array([1]),
    })).status).toBe(200)
    expect((await client.fetch('/api/remove', { headers: { 'file-path': keyHex } })).status).toBe(200)
    expect((await client.fetch('/api/db/flush', { method: 'POST' })).status).toBe(200)
  }, 25_000)

  test('directory execute applies the exact validated bytes and duplicate ZIP keys resolve consistently', async () => {
    const saveFolder = await mkdtemp(path.join(tmpdir(), 'save-folder-reset-'))
    const first = databaseEntry(labelledBackup('first'))
    const last = databaseEntry(labelledBackup('last'))
    await mkdir(saveFolder, { recursive: true })
    await writeFile(path.join(saveFolder, DB_HEX), first)
    const { client } = await boot()
    await importWithSafety(client, labelledBackup('before'))
    const execute = await client.fetch('/api/migrate/save-folder/execute', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: saveFolder }),
    })
    expect(execute.status).toBe(200)
    await expectLabel(client, 'first')

    const duplicateZip = await duplicateSaveFolderZip(first, last)
    const upload = await client.fetch('/api/migrate/save-folder/upload', {
      method: 'POST', headers: { 'content-type': 'application/zip' }, body: new Uint8Array(duplicateZip),
    })
    expect(upload.status).toBe(200)
    await expectLabel(client, 'last')
  }, 30_000)

  function databaseWithLegacyColdStub(label: string) {
    const database = normalizeBackup(labelledBackup(label)).raw as any
    database.characters.push({
      name: 'Legacy stub', chaId: 'legacy-cold', coldstorage: 'legacy-cold-key', chats: [],
    })
    return Buffer.concat([MAGIC_RAW, packr.encode(database)])
  }
  const legacyColdRow = {
    [Buffer.from('coldstorage/legacy-cold-key.json').toString('hex')]: new Uint8Array(Buffer.from(JSON.stringify({
      character: { name: 'Legacy restored', chaId: 'legacy-cold', chats: [] },
    }))),
  }
  async function exportedLegacyCharacter(client: RisuClient) {
    const database = normalizeBackup(await client.exportBackup()).raw as any
    return database.characters.find((character: any) => character.chaId === 'legacy-cold')
  }

  test('snapshot restore resolves a legacy-only live cold-storage row like the live reader', async () => {
    const { client } = await boot()
    await importWithSafety(client, labelledBackup('before'))
    const snapshotKey = 'database/dbbackup-1700000000000.bin'
    const upload = await client.fetch('/api/migrate/save-folder/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/zip' },
      body: new Uint8Array(saveFolderZip(databaseEntry(labelledBackup('current')), {
        ...legacyColdRow,
        [Buffer.from(snapshotKey).toString('hex')]: new Uint8Array(databaseWithLegacyColdStub('snapshot')),
      })),
    })
    expect(upload.status).toBe(200)
    await expectLabel(client, 'current')
    const restoredSnapshot = await client.fetch('/api/db/snapshots/restore', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: snapshotKey }),
    })
    expect(restoredSnapshot.status).toBe(200)
    await expectLabel(client, 'snapshot')
    const restored = await exportedLegacyCharacter(client)
    expect(restored).toMatchObject({ name: 'Legacy restored' })
    expect(restored).not.toHaveProperty('coldstorage')
  }, 25_000)
})

describe('[B1b-1] Storage epoch and run binding', () => {
  test('epoch survives a process restart and the next reset increments it once', async () => {
    const first = await boot()
    await importWithSafety(first.client, labelledBackup('epoch-restart'))
    expect(await readStorageEpoch(first.client)).toBe(1)
    const persisted = await mkdtemp(path.join(tmpdir(), 'b1b-restart-save-'))
    await cp(path.join(first.server.cwd, 'save'), persisted, { recursive: true })
    await first.server.cleanup()

    const restartedServer = await spawnServer({
      seedSave: saveDir => cp(persisted, saveDir, { recursive: true }),
    })
    servers.push(restartedServer)
    const restarted = await withSession(await createClient(restartedServer.port, restartedServer.password))
    expect(await readStorageEpoch(restarted)).toBe(1)
    expect((await restarted.fetch('/api/remove', { headers: { 'file-path': DB_HEX } })).status).toBe(200)
    expect(await readStorageEpoch(restarted)).toBe(2)
  }, 30_000)

  test('malformed stored epochs fail closed without deleting recovery rows', async () => {
    const { client } = await boot()
    await writeRawKey(client, EPOCH_KEY, 'not-an-integer')
    await seedOperationRows(client)
    const target = labelledBackup('malformed-epoch-target')
    const prepared = await client.fetch('/api/backup/import/prepare', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ size: target.length }),
    })
    expect(prepared.status).toBe(200)
    const response = await client.fetch('/api/backup/import', {
      method: 'POST', headers: { 'content-type': 'application/x-risu-backup' }, body: new Uint8Array(target),
    })
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect((await readRawKey(client, EPOCH_KEY)).toString()).toBe('not-an-integer')
    for (const key of OPERATION_KEYS) expect(await readRawKey(client, key), key).not.toHaveLength(0)
  }, 20_000)

  test('a failure after the epoch write but before COMMIT rolls back the epoch and cleanup', async () => {
    const { client: initialClient } = await boot({
      POCKETRISU_TEST_STORAGE_RESET_FAILPOINT: 'after-storage-epoch-write',
      POCKETRISU_TEST_STORAGE_RESET_FAILPOINT_ON_ATTEMPT: '2',
    })
    await importWithSafety(initialClient, labelledBackup('epoch-before-failure'))
    const client = await withSession(initialClient)
    await seedOperationRows(client)
    const before = await readStorageEpoch(client)
    const response = await client.fetch('/api/backup/import', {
      method: 'POST', headers: { 'content-type': 'application/x-risu-backup' },
      body: new Uint8Array(labelledBackup('epoch-failing-target')),
    })
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(await readStorageEpoch(client)).toBe(before)
    for (const key of OPERATION_KEYS) expect(await readRawKey(client, key), key).not.toHaveLength(0)
  }, 25_000)

  test('a save folder carrying a malformed epoch row fails without changing data or epoch', async () => {
    const { client: initialClient } = await boot()
    await importWithSafety(initialClient, labelledBackup('epoch-malformed-before'))
    const client = await withSession(initialClient)
    const before = await readStorageEpoch(client)
    expect(before).toBe(1)
    const malformed = saveFolderZip(databaseEntry(labelledBackup('epoch-malformed-target')), {
      [Buffer.from(EPOCH_KEY).toString('hex')]: new Uint8Array(Buffer.from('not-an-integer')),
    })
    const response = await client.fetch('/api/migrate/save-folder/upload', {
      method: 'POST', headers: { 'content-type': 'application/zip' }, body: new Uint8Array(malformed),
    })
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(await readStorageEpoch(client)).toBe(before)
    await expectLabel(client, 'epoch-malformed-before')
  }, 25_000)
})

describe('[B1b-2] Reset operation cleanup and run cancellation', () => {
  test('writers stay refused during reset and recovery-required behavior remains unchanged', async () => {
    const heldServer = await boot()
    await importWithSafety(heldServer.client, labelledBackup('b1b-writer-before'))
    const activeClient = await withSession(heldServer.client)
    const held = await prepareHeldImport(heldServer.server, activeClient, labelledBackup('b1b-writer-after'))
    await expectResetRefusal(await writeChat(activeClient))
    held.finish()
    expect((await held.response).status).toBe(200)

    const failed = await boot({
      POCKETRISU_TEST_STORAGE_RESET_FAILPOINT: 'reverse-inlay-rename',
      POCKETRISU_TEST_STORAGE_RESET_FAILPOINT_ON_ATTEMPT: '2',
    })
    await importWithSafety(failed.client, labelledBackup('b1b-recovery-before', [
      { name: 'inlay/before.png', data: Buffer.from('before') },
    ]))
    const failureClient = await withSession(failed.client)
    const response = await failureClient.fetch('/api/backup/import', {
      method: 'POST', headers: { 'content-type': 'application/x-risu-backup' },
      body: new Uint8Array(labelledBackup('b1b-recovery-after', [
        { name: 'inlay/after.png', data: Buffer.from('after') },
      ])),
    })
    expect(response.status).toBeGreaterThanOrEqual(400)
    await expect(response.json()).resolves.toMatchObject({
      code: 'STORAGE_RECOVERY_REQUIRED', retryable: false,
    })
    const writer = await failureClient.fetch('/api/db/flush', { method: 'POST' })
    expect(writer.status).toBe(503)
    await expect(writer.json()).resolves.toMatchObject({
      code: 'STORAGE_RECOVERY_REQUIRED', retryable: false,
    })
  }, 40_000)
})
