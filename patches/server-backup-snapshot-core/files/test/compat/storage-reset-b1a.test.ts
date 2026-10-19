import { afterAll, describe, expect, test } from 'vitest'
import { request as httpRequest, type ClientRequest } from 'node:http'
import { cp, mkdtemp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
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

async function serverSave(client: RisuClient) {
  const response = await client.fetch('/api/backup/server/save', { method: 'POST' })
  expect(response.status).toBe(200)
  const events = (await response.text()).split('\n').filter(Boolean).map(line => JSON.parse(line))
  const filename = events.find(event => event.type === 'done')?.filename
  expect(filename).toMatch(/^risu-backup-\d+\.bin$/)
  return filename as string
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

async function seedRecoveryRows(client: RisuClient) {
  await seedOperationRows(client)
  for (const key of RECOVERY_KEYS.slice(2)) await writeRawKey(client, key, `seed:${key}`)
}

async function seedOperationRows(client: RisuClient) {
  await writeRawKey(client, OPERATION_KEYS[0], JSON.stringify({
    operationId: 'operation-b1b-reset', charId: 'char-1', chatId: 'chat-1', state: 'result-ready',
  }))
  await writeRawKey(client, OPERATION_KEYS[1], JSON.stringify({
    operationId: 'operation-b1b-reset', resultId: 'result-b1b-reset', final: true,
  }))
}

async function expectRecoveryRowsAbsent(client: RisuClient) {
  for (const key of RECOVERY_KEYS) expect(await readRawKey(client, key), key).toHaveLength(0)
}

describe('[B1a-3] Storage reset barrier foundation', () => {
  test('the existing stale-build fence keeps 426 precedence over reset refusal', async () => {
    const stamp = 'b1a-current-build'
    const server = await spawnServer({
      seedSave: async saveDir => {
        const dist = path.join(path.dirname(saveDir), 'dist')
        await mkdir(dist, { recursive: true })
        await writeFile(path.join(dist, 'build-stamp.json'), JSON.stringify({
          version: 'test', stamp,
        }))
      },
    })
    servers.push(server)
    const baseClient = await createClient(server.port, server.password)
    const buildClient: RisuClient = {
      ...baseClient,
      fetch: (route, init = {}) => {
        const headers = new Headers(init.headers)
        headers.set('x-client-build', stamp)
        return baseClient.fetch(route, { ...init, headers })
      },
    }
    const client = await withSession(buildClient)
    await importWithSafety(client, labelledBackup('before'))
    const held = await prepareHeldImport(
      server,
      client,
      labelledBackup('after'),
      8,
      { 'x-client-build': stamp },
    )
    const stale = await baseClient.fetch('/api/patch', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-client-build': 'stale-build' },
      body: '{}',
    })
    expect(stale.status).toBe(426)
    await expect(stale.json()).resolves.toMatchObject({ code: 'CLIENT_UPGRADE_REQUIRED' })
    held.finish()
    expect((await held.response).status).toBe(200)
  }, 25_000)

  test('all reset-sensitive writers fast-fail before route validation or body parsing', async () => {
    const { server, client } = await boot()
    await importWithSafety(client, labelledBackup('before'))
    const held = await prepareHeldImport(server, client, labelledBackup('after'))

    const requests: Array<[string, RequestInit]> = [
      ['/api/chat-content/test-char-0/0/patch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }],
      ['/api/chat-content/test-char-0/0', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }],
      ['/api/patch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }],
      ['/api/write', { method: 'POST', body: new Uint8Array([1]) }],
      ['/api/assets/bulk-write', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }],
      ['/api/bg-stream-draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }],
      ['/api/bg-stream-draft/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }],
      ['/api/bg-orchestrate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }],
      ['/api/bg-orchestrate-input/claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }],
      ['/api/bg-orchestrate-input/attach', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }],
      ['/api/bg-orchestrate-input/abandon', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }],
      ['/api/bg-orchestrate/not-an-operation', { method: 'DELETE' }],
      ['/api/bg-orchestrate-result/op/result?consumerId=consumer', { method: 'DELETE' }],
      ['/api/bg-notifications/claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }],
      ['/api/bg-notifications/ack', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }],
      ['/api/db/flush', { method: 'POST' }],
      ['/api/db/assets/purge-orphans', { method: 'POST' }],
      ['/api/db/optimize', { method: 'POST' }],
      ['/api/db/wal-checkpoint', { method: 'POST' }],
      ['/api/db/snapshots?key=database%2Fdbbackup-1.bin', { method: 'DELETE' }],
      ['/api/backup/server/not-a-backup.bin', { method: 'DELETE' }],
      ['/api/inlays/compress', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }],
      ['/api/remove', { method: 'GET', headers: { 'file-path': Buffer.from('other.bin').toString('hex') } }],
    ]

    for (const [route, init] of requests) {
      await expectResetRefusal(await client.fetch(route, init))
    }
    await expectResetRefusal(await client.fetch('/API/PATCH/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }))

    held.finish()
    expect((await held.response).status).toBe(200)
    await expectLabel(client, 'after')
  }, 30_000)

  test('reads remain available during spooling and reset/capture acquisition excludes both orderings', async () => {
    const { server, client } = await boot()
    await importWithSafety(client, labelledBackup('before'))
    const held = await prepareHeldImport(server, client, labelledBackup('after'))

    const read = await Promise.race([
      client.fetch('/api/chat-content/test-char-0/0'),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('read blocked by spooling')), 750)),
    ])
    expect(read.status).toBe(200)
    expect((await decodeRisuSave(new Uint8Array(await read.arrayBuffer()))).message[0].data)
      .toBe('before-chat')
    expect((await client.fetch('/api/backup/export')).status).toBe(409)
    const competingResets: Array<[string, RequestInit]> = [
      ['/api/backup/import/prepare', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"size":1}',
      }],
      ['/api/backup/server/restore', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"filename":"missing.bin"}',
      }],
      ['/api/migrate/save-folder/execute', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"path":"missing"}',
      }],
      ['/api/migrate/save-folder/upload', {
        method: 'POST', headers: { 'content-type': 'application/zip' }, body: new Uint8Array([1]),
      }],
      ['/api/db/snapshots/restore', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"key":"database/dbbackup-missing.bin"}',
      }],
      ['/api/remove', { method: 'GET', headers: { 'file-path': DB_HEX } }],
    ]
    for (const [route, init] of competingResets) {
      expect((await client.fetch(route, init)).status, route).toBe(409)
    }
    held.finish()
    expect((await held.response).status).toBe(200)

    const gateDir = await mkdtemp(path.join(tmpdir(), 'capture-reset-order-'))
    await writeFile(path.join(gateDir, 'export.hold'), 'hold')
    const gated = await boot({ POCKETRISU_TEST_BACKUP_SOURCE_GATE_DIR: gateDir })
    await importWithSafety(gated.client, labelledBackup('before'))
    const capture = gated.client.fetch('/api/backup/export')
    const entered = path.join(gateDir, 'export.entered')
    for (let i = 0; i < 200; i += 1) {
      try { await stat(entered); break } catch { await new Promise(resolve => setTimeout(resolve, 10)) }
    }
    const resetTarget = labelledBackup('capture-first-reset')
    expect((await gated.client.fetch('/api/backup/import/prepare', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ size: resetTarget.byteLength }),
    })).status).toBe(200)
    let resetSettled = false
    const reset = gated.client.fetch('/api/backup/import', {
      method: 'POST',
      headers: { 'content-type': 'application/x-risu-backup' },
      body: new Uint8Array(resetTarget),
    }).then(response => {
      resetSettled = true
      return response
    })
    await new Promise(resolve => setTimeout(resolve, 250))
    expect(resetSettled).toBe(false)
    await writeFile(path.join(gateDir, 'export.release'), 'release')
    expect((await capture).status).toBe(200)
    expect((await reset).status).toBe(200)
    await expectLabel(gated.client, 'capture-first-reset')
  }, 30_000)

  test('queued admission tokens cannot cross a completed reset', async () => {
    const gateDir = await mkdtemp(path.join(tmpdir(), 'reset-admission-gate-'))
    const { server, client } = await boot({ POCKETRISU_TEST_STORAGE_ADMISSION_GATE_DIR: gateDir })
    await importWithSafety(client, labelledBackup('before'))
    await writeFile(path.join(gateDir, 'patch.hold'), 'hold')
    const pausedWrite = client.fetch('/api/patch', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ patch: [] }),
    })
    let held: HeldUpload
    try {
      held = await prepareHeldImport(server, client, labelledBackup('after'))
    } catch (error) {
      await writeFile(path.join(gateDir, 'patch.release'), 'release')
      await pausedWrite.catch(() => undefined)
      throw error
    }
    held.finish()
    expect((await held.response).status).toBe(200)
    await writeFile(path.join(gateDir, 'patch.release'), 'release')
    await expectResetRefusal(await pausedWrite)
    await expectLabel(client, 'after')
  }, 20_000)

  test('normal writers and existing CAS behavior are unchanged after the flag clears', async () => {
    const { server, client } = await boot()
    await importWithSafety(client, labelledBackup('before'))
    const held = await prepareHeldImport(server, client, labelledBackup('after'))
    held.finish()
    expect((await held.response).status).toBe(200)
    const { chat, revision } = await readChat(client)
    const ok = await writeChat(client, value => { value.name = 'accepted edit' })
    expect(ok.status).not.toBe(503)
    const stale = await client.fetch('/api/chat-content/test-char-0/0', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-chat-id': 'chat-0-0',
        'x-chat-base-revision': revision,
      },
      body: JSON.stringify(chat),
    })
    expect([409, 412]).toContain(stale.status)
  }, 20_000)
})

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

  test('an admitted writer linearizes before reset apply and the backup wins', async () => {
    const gateDir = await mkdtemp(path.join(tmpdir(), 'capture-queue-gate-'))
    await writeFile(path.join(gateDir, 'export.hold'), 'hold')
    const { server, client } = await boot({ POCKETRISU_TEST_BACKUP_SOURCE_GATE_DIR: gateDir })
    await importWithSafety(client, labelledBackup('before'))
    const capture = client.fetch('/api/backup/export')
    for (let i = 0; i < 200; i += 1) {
      try { await stat(path.join(gateDir, 'export.entered')); break } catch { await new Promise(resolve => setTimeout(resolve, 10)) }
    }
    const writer = writeChat(client, chat => { chat.name = 'queued-writer' })
    let held: HeldUpload
    try {
      held = await prepareHeldImport(server, client, labelledBackup('after'))
    } catch (error) {
      await writeFile(path.join(gateDir, 'export.release'), 'release')
      await Promise.allSettled([capture, writer])
      throw error
    }
    await writeFile(path.join(gateDir, 'export.release'), 'release')
    expect((await capture).status).toBe(200)
    expect([200, 503]).toContain((await writer).status)
    held.finish()
    expect((await held.response).status).toBe(200)
    await expectLabel(client, 'after')
  }, 30_000)

  test('server restore shares the barrier and wins over a concurrent chat write', async () => {
    const gateDir = await mkdtemp(path.join(tmpdir(), 'server-restore-gate-'))
    const { client } = await boot({ POCKETRISU_TEST_STORAGE_RESET_GATE_DIR: gateDir })
    await importWithSafety(client, labelledBackup('restore-target'))
    const filename = await serverSave(client)
    await importWithSafety(client, labelledBackup('current'))
    await writeFile(path.join(gateDir, 'server-restore.apply.hold'), 'hold')
    const restoring = client.fetch('/api/backup/server/restore', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename }),
    })
    for (let i = 0; i < 200; i += 1) {
      try { await stat(path.join(gateDir, 'server-restore.apply.entered')); break } catch { await new Promise(resolve => setTimeout(resolve, 10)) }
    }
    await expectResetRefusal(await client.fetch('/api/chat-content/test-char-0/0', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    }))
    await writeFile(path.join(gateDir, 'server-restore.apply.release'), 'release')
    expect((await restoring).status).toBe(200)
    await expectLabel(client, 'restore-target')
  }, 30_000)

  test('invalid database preparation and truncated uploads leave the old state and clear the flag', async () => {
    const { server, client } = await boot()
    await importWithSafety(client, labelledBackup('before'))
    const corrupt = encodeBackup([{ name: 'database.risudat', data: Buffer.from('corrupt') }])
    const prepared = await client.fetch('/api/backup/import/prepare', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ size: corrupt.length }),
    })
    expect(prepared.status).toBe(200)
    const invalid = await client.fetch('/api/backup/import', {
      method: 'POST', headers: { 'content-type': 'application/x-risu-backup' }, body: new Uint8Array(corrupt),
    })
    expect(invalid.status).toBeGreaterThanOrEqual(400)
    await expectLabel(client, 'before')

    const corruptFilename = 'risu-backup-1700000000000.bin'
    await writeFile(path.join(server.cwd, 'backups', corruptFilename), corrupt)
    const invalidServerRestore = await client.fetch('/api/backup/server/restore', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filename: corruptFilename }),
    })
    expect(invalidServerRestore.status).toBeGreaterThanOrEqual(400)
    await expectLabel(client, 'before')

    const target = labelledBackup('after')
    await client.fetch('/api/backup/import/prepare', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ size: target.length }),
    })
    const aborted = holdUpload(server, client, '/api/backup/import', target, 8, 'application/x-risu-backup')
    await waitForReset(client)
    aborted.abort()
    await aborted.response.catch(() => undefined)
    await new Promise(resolve => setTimeout(resolve, 100))
    expect((await client.fetch('/api/db/flush', { method: 'POST' })).status).not.toBe(503)
    await expectLabel(client, 'before')
  }, 25_000)

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

  test('apply trace contains no asynchronous yield between BEGIN and COMMIT', async () => {
    const traceDir = await mkdtemp(path.join(tmpdir(), 'reset-trace-'))
    const traceFile = path.join(traceDir, 'trace.jsonl')
    const { client } = await boot({ POCKETRISU_TEST_STORAGE_RESET_TRACE_FILE: traceFile })
    await importWithSafety(client, labelledBackup('before'))
    await importWithSafety(client, labelledBackup('after'))
    const events = (await readFile(traceFile, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
    const begin = events.findIndex(event => event.event === 'begin')
    const commit = events.findIndex((event, index) => index > begin && event.event === 'commit')
    expect(begin).toBeGreaterThanOrEqual(0)
    expect(commit).toBeGreaterThan(begin)
    expect(events.slice(begin + 1, commit).some(event => event.event === 'event-loop-yield')).toBe(false)
  }, 20_000)
})

describe('[B1a-5] Atomic save-folder, snapshot and database removal resets', () => {
  test('large reset records single-transaction WAL, RSS, temporary disk, and event-loop metrics', async () => {
    const metricsDir = await mkdtemp(path.join(tmpdir(), 'reset-metrics-'))
    const metricsFile = path.join(metricsDir, 'metrics.json')
    const { client } = await boot({ POCKETRISU_TEST_STORAGE_RESET_METRICS_FILE: metricsFile })
    await importWithSafety(client, labelledBackup('before'))
    const entries = Array.from({ length: 50_000 }, (_, index) => ({
      name: Buffer.from(`resource-${index}`).toString('hex'),
      data: Buffer.from([index % 251]),
    }))
    const archive = labelledBackup('after', entries)
    const expectedEntryCount = decodeBackup(archive).length
    await importWithSafety(client, archive)
    const metrics = JSON.parse(await readFile(metricsFile, 'utf8'))
    expect(metrics).toMatchObject({ entryCount: expectedEntryCount, transactionCount: 1 })
    for (const field of [
      'durationMs',
      'peakWalBytes',
      'peakRssBytes',
      'peakTemporaryDiskBytes',
      'maxExternalPollStallMs',
    ]) {
      expect(metrics[field], field).toEqual(expect.any(Number))
      expect(metrics[field], field).toBeGreaterThanOrEqual(0)
    }
    await expectLabel(client, 'after')
  }, 120_000)

  test('save-folder upload spools before its slot, refuses writers, and atomically publishes target bytes', async () => {
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
    const read = await client.fetch('/api/chat-content/test-char-0/0')
    expect(read.status).toBe(200)
    expect((await decodeRisuSave(new Uint8Array(await read.arrayBuffer()))).message[0].data)
      .toBe('before-chat')
    await expectResetRefusal(await client.fetch('/api/patch', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    }))
    held.finish()
    expect((await held.response).status).toBe(200)
    await expectLabel(client, 'after')
  }, 30_000)

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

  test('snapshot restore validates before mutation and valid restore creates a recoverable fresh snapshot', async () => {
    const { client } = await boot()
    await importWithSafety(client, labelledBackup('snapshot-a'))
    await importWithSafety(client, labelledBackup('snapshot-b'))
    const listed = await (await client.fetch('/api/db/snapshots')).json() as any
    const target = listed.snapshots.find((snapshot: any) => snapshot.key.startsWith('database/dbbackup-'))
    expect(target).toBeTruthy()
    const restored = await client.fetch('/api/db/snapshots/restore', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: target.key }),
    })
    expect(restored.status).toBe(200)
    expect((await restored.json()).ok).toBe(true)
    const after = await (await client.fetch('/api/db/snapshots')).json() as any
    expect(after.snapshots.length).toBeGreaterThan(listed.snapshots.length)
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

  test('spooling resource failures are clean and leave no temporary file or stuck flag', async () => {
    const spoolDir = await mkdtemp(path.join(tmpdir(), 'reset-spool-'))
    const { server, client } = await boot({
      POCKETRISU_TEST_STORAGE_RESET_SPOOL_DIR: spoolDir,
      POCKETRISU_TEST_STORAGE_RESET_SPOOL_FAIL_AFTER_BYTES: '64',
      POCKETRISU_TEST_STORAGE_RESET_SPOOL_FAIL_ON_ATTEMPT: '2',
    })
    await importWithSafety(client, labelledBackup('before'))
    const response = await client.fetch('/api/backup/import', {
      method: 'POST', headers: { 'content-type': 'application/x-risu-backup' },
      body: new Uint8Array(labelledBackup('after')),
    })
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(await readdir(spoolDir)).toEqual([])
    expect((await client.fetch('/api/db/flush', { method: 'POST' })).status).toBe(200)
    await expectLabel(client, 'before')
    expect(server.cwd).toBeTruthy()
  }, 20_000)

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

  test('save-folder preparation resolves a legacy-only cold-storage row like the live reader', async () => {
    const { client } = await boot()
    await importWithSafety(client, labelledBackup('before'))
    const upload = await client.fetch('/api/migrate/save-folder/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/zip' },
      body: new Uint8Array(saveFolderZip(databaseWithLegacyColdStub('legacy'), legacyColdRow)),
    })
    expect(upload.status).toBe(200)
    await expectLabel(client, 'legacy')
    const restored = await exportedLegacyCharacter(client)
    expect(restored).toMatchObject({ name: 'Legacy restored' })
    expect(restored).not.toHaveProperty('coldstorage')
  }, 25_000)

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

  async function snapshotKeys(client: RisuClient) {
    const listed = await (await client.fetch('/api/db/snapshots')).json() as any
    return listed.snapshots.map((snapshot: any) => snapshot.key).sort()
  }

  async function waitForFile(file: string) {
    for (let i = 0; i < 300; i += 1) {
      try { await stat(file); return } catch { await new Promise(resolve => setTimeout(resolve, 10)) }
    }
    throw new Error(`timed out waiting for ${file}`)
  }

  test('an invalid snapshot target at capacity fails before the pre-restore snapshot or rotation', async () => {
    const { client } = await boot()
    await importWithSafety(client, labelledBackup('before'))
    const invalidKey = 'database/dbbackup-1700000000000.bin'
    const upload = await client.fetch('/api/migrate/save-folder/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/zip' },
      body: new Uint8Array(saveFolderZip(databaseEntry(labelledBackup('current')), {
        [Buffer.from(invalidKey).toString('hex')]: new Uint8Array(Buffer.from('corrupt')),
      })),
    })
    expect(upload.status).toBe(200)
    const before = await snapshotKeys(client)
    expect(before).toContain(invalidKey)
    const limits = await client.fetch('/api/db/snapshots/limits', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ maxCount: before.length, maxBytes: 10 * 1024 * 1024 }),
    })
    expect(limits.status).toBe(200)
    const restore = await client.fetch('/api/db/snapshots/restore', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: invalidKey }),
    })
    expect(restore.status).toBeGreaterThanOrEqual(400)
    expect(await snapshotKeys(client)).toEqual(before)
    await expectLabel(client, 'current')
  }, 25_000)

  test('a capture in progress makes snapshot restore and database removal answer 409', async () => {
    const gateDir = await mkdtemp(path.join(tmpdir(), 'capture-first-reset-'))
    const { client } = await boot({ POCKETRISU_TEST_BACKUP_SOURCE_GATE_DIR: gateDir })
    await importWithSafety(client, labelledBackup('before'))
    await importWithSafety(client, labelledBackup('current'))
    const [snapshotKey] = await snapshotKeys(client)
    expect(snapshotKey).toBeTruthy()
    await writeFile(path.join(gateDir, 'capture.hold'), 'hold')
    const capture = client.fetch('/api/backup/export')
    try {
      await waitForFile(path.join(gateDir, 'capture.entered'))
      const restore = await client.fetch('/api/db/snapshots/restore', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: snapshotKey }),
      })
      expect(restore.status).toBe(409)
      const removal = await client.fetch('/api/remove', { headers: { 'file-path': DB_HEX } })
      expect(removal.status).toBe(409)
    } finally {
      await writeFile(path.join(gateDir, 'capture.release'), 'release')
    }
    expect((await capture).status).toBe(200)
    await expectLabel(client, 'current')
  }, 25_000)

  test('a capture arriving during snapshot restore or database removal answers 409 at once', async () => {
    const gateDir = await mkdtemp(path.join(tmpdir(), 'reset-first-capture-'))
    const { client } = await boot({ POCKETRISU_TEST_STORAGE_RESET_GATE_DIR: gateDir })
    await importWithSafety(client, labelledBackup('before'))
    await importWithSafety(client, labelledBackup('current'))
    const [snapshotKey] = await snapshotKeys(client)

    await writeFile(path.join(gateDir, 'snapshot-restore.apply.hold'), 'hold')
    const restoring = client.fetch('/api/db/snapshots/restore', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: snapshotKey }),
    })
    try {
      await waitForFile(path.join(gateDir, 'snapshot-restore.apply.entered'))
      expect((await client.fetch('/api/backup/export')).status).toBe(409)
    } finally {
      await writeFile(path.join(gateDir, 'snapshot-restore.apply.release'), 'release')
    }
    expect((await restoring).status).toBe(200)

    await writeFile(path.join(gateDir, 'database-remove.apply.hold'), 'hold')
    const removing = client.fetch('/api/remove', { headers: { 'file-path': DB_HEX } })
    try {
      await waitForFile(path.join(gateDir, 'database-remove.apply.entered'))
      expect((await client.fetch('/api/backup/export')).status).toBe(409)
    } finally {
      await writeFile(path.join(gateDir, 'database-remove.apply.release'), 'release')
    }
    expect((await removing).status).toBe(200)
  }, 25_000)
})

describe('[B1b-1] Storage epoch and run binding', () => {
  test('fresh storage reads epoch zero and lower, higher, and empty save folders advance monotonically', async () => {
    const { client: initialClient } = await boot()
    let client = initialClient
    expect(await readStorageEpoch(client)).toBe(0)

    const high = saveFolderZip(databaseEntry(labelledBackup('epoch-high')), {
      [Buffer.from(EPOCH_KEY).toString('hex')]: new Uint8Array(Buffer.from('10')),
    })
    let response = await client.fetch('/api/migrate/save-folder/upload', {
      method: 'POST', headers: { 'content-type': 'application/zip' }, body: new Uint8Array(high),
    })
    expect(response.status).toBe(200)
    expect(await readStorageEpoch(client)).toBe(11)

    client = await withSession(client)
    const lowerFolder = await mkdtemp(path.join(tmpdir(), 'b1b-lower-epoch-'))
    await writeFile(path.join(lowerFolder, DB_HEX), databaseEntry(labelledBackup('epoch-lower')))
    await writeFile(path.join(lowerFolder, Buffer.from(EPOCH_KEY).toString('hex')), '2')
    response = await client.fetch('/api/migrate/save-folder/execute', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: lowerFolder }),
    })
    expect(response.status).toBe(200)
    expect(await readStorageEpoch(client)).toBe(12)

    client = await withSession(client)
    const emptyFolder = await mkdtemp(path.join(tmpdir(), 'b1b-empty-folder-'))
    response = await client.fetch('/api/migrate/save-folder/execute', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: emptyFolder }),
    })
    expect(response.status).toBe(200)
    expect(await readStorageEpoch(client)).toBe(13)
  }, 35_000)

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

  test.each([
    'backup-import',
    'server-restore',
    'folder-execute',
    'folder-upload',
    'snapshot-restore',
    'database-remove',
  ])('%s increments exactly once, performs final recovery cleanup, and cancels runtime owners before mutation', async kind => {
    const traceDir = await mkdtemp(path.join(tmpdir(), `b1b-${kind}-trace-`))
    const traceFile = path.join(traceDir, 'trace.jsonl')
    const booted = await boot({ POCKETRISU_TEST_STORAGE_RESET_TRACE_FILE: traceFile })
    let client = booted.client
    let before = 0

    if (kind === 'backup-import') {
      await seedRecoveryRows(client)
      before = await readStorageEpoch(client)
      await importWithSafety(client, labelledBackup('b1b-import'))
    } else if (kind === 'server-restore') {
      await importWithSafety(client, labelledBackup('b1b-server-restore'))
      client = await withSession(client)
      const filename = await serverSave(client)
      await seedRecoveryRows(client)
      before = await readStorageEpoch(client)
      const response = await client.fetch('/api/backup/server/restore', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename }),
      })
      expect(response.status).toBe(200)
    } else if (kind === 'folder-execute') {
      const folder = await mkdtemp(path.join(tmpdir(), 'b1b-folder-execute-'))
      await writeFile(path.join(folder, DB_HEX), databaseEntry(labelledBackup('b1b-folder-execute')))
      for (const key of RECOVERY_KEYS) {
        await writeFile(path.join(folder, Buffer.from(key).toString('hex')), `imported:${key}`)
      }
      await seedRecoveryRows(client)
      before = await readStorageEpoch(client)
      const response = await client.fetch('/api/migrate/save-folder/execute', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: folder }),
      })
      expect(response.status).toBe(200)
    } else if (kind === 'folder-upload') {
      const imported = Object.fromEntries(RECOVERY_KEYS.map(key => [
        Buffer.from(key).toString('hex'), new Uint8Array(Buffer.from(`imported:${key}`)),
      ]))
      await seedRecoveryRows(client)
      before = await readStorageEpoch(client)
      const response = await client.fetch('/api/migrate/save-folder/upload', {
        method: 'POST', headers: { 'content-type': 'application/zip' },
        body: new Uint8Array(saveFolderZip(databaseEntry(labelledBackup('b1b-folder-upload')), imported)),
      })
      expect(response.status).toBe(200)
    } else if (kind === 'snapshot-restore') {
      await importWithSafety(client, labelledBackup('b1b-snapshot-old'))
      client = await withSession(client)
      await importWithSafety(client, labelledBackup('b1b-snapshot-current'))
      client = await withSession(client)
      const listed = await (await client.fetch('/api/db/snapshots')).json() as any
      const target = listed.snapshots.find((entry: any) => entry.key.startsWith('database/dbbackup-'))
      expect(target).toBeTruthy()
      await seedRecoveryRows(client)
      before = await readStorageEpoch(client)
      const response = await client.fetch('/api/db/snapshots/restore', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: target.key }),
      })
      expect(response.status).toBe(200)
    } else {
      await importWithSafety(client, labelledBackup('b1b-remove'))
      client = await withSession(client)
      await seedRecoveryRows(client)
      before = await readStorageEpoch(client)
      const response = await client.fetch('/api/remove', { headers: { 'file-path': DB_HEX } })
      expect(response.status).toBe(200)
    }

    expect(await readStorageEpoch(client)).toBe(before + 1)
    await expectRecoveryRowsAbsent(client)
    const events = (await readFile(traceFile, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
    const begin = events.findLastIndex((event: any) => event.event === 'begin')
    expect(begin).toBeGreaterThanOrEqual(0)
    for (const event of ['cancel-runs', 'reset-input-drain', 'cancel-persistence-timers']) {
      const index = events.findLastIndex((entry: any, candidate: number) => candidate < begin && entry.event === event)
      expect(index, `${event} must precede the destructive transaction`).toBeGreaterThanOrEqual(0)
    }
  }, 45_000)
})
