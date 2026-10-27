import { afterEach, describe, expect, test } from 'vitest'
import { Packr } from 'msgpackr'
import Database from 'better-sqlite3'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from './helpers/client.js'
import { createSeedBackup } from './helpers/seed.js'
import { decodeBackup } from './helpers/decode.js'
import { createFakeAccount, startFakeAccountServer } from './helpers/fakeRisuAccount.js'
import { spawnRestartableServer, type RestartableServer } from './restartableServer.e2-3.helper.js'

const utilsPkg = require('../../server/node/utils.cjs') as any
const utils = utilsPkg.default ?? utilsPkg
const MAGIC_RAW = Buffer.from([0, 82, 73, 83, 85, 83, 65, 86, 69, 0, 7])
const packr = new Packr({ useRecords: false })
const encode = (value: unknown) => Buffer.concat([MAGIC_RAW, packr.encode(value)])

let server: RestartableServer | undefined
afterEach(async () => { await server?.cleanup(); server = undefined })

async function readChat(client: Awaited<ReturnType<typeof createClient>>) {
  const response = await client.fetch('/api/chat-content/test-char-0/0', {
    headers: { 'x-chat-id': 'chat-0-0' },
  })
  return { response, chat: response.ok ? await utils.decodeRisuSave(Buffer.from(await response.arrayBuffer())) : null }
}

function baseRevision(response: Response): Record<string, string> {
  const revision = response.headers.get('x-chat-revision')
  return revision ? { 'x-chat-base-revision': revision } : {}
}

describe('[E2-3b] Rebuild server chat-write durability over native 1.16.1', () => {
  test('[new] b1 a chat acknowledged before SIGKILL is recovered by a fresh process before the debounce', async () => {
    server = await spawnRestartableServer()
    let client = await createClient(server.port, server.password)
    expect((await client.importBackup(createSeedBackup({ messagesPerChat: 2 }))).ok).toBe(true)
    const beforeRead = await readChat(client)
    const before = beforeRead.chat
    const changed = {
      ...before,
      message: [...before.message, { role: 'user', data: 'acknowledged immediately before kill', chatId: 'e2-b1' }],
    }
    const posted = await client.fetch('/api/chat-content/test-char-0/0', {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream', 'x-chat-id': changed.id, ...baseRevision(beforeRead.response) },
      body: encode(changed),
    })
    expect(posted.status).toBe(200)
    await server.stop('SIGKILL')
    await server.restart()
    client = await createClient(server.port, server.password)
    const recovered = await readChat(client)
    expect(recovered.response.status).toBe(200)
    expect(recovered.chat.message.at(-1)).toMatchObject({ data: 'acknowledged immediately before kill', chatId: 'e2-b1' })
  })

  test('[unchanged] u3 archived character payload remains activatable after a database flush and restart', async () => {
    server = await spawnRestartableServer()
    let client = await createClient(server.port, server.password)
    expect((await client.importBackup(createSeedBackup({ characterCount: 2, messagesPerChat: 2 }))).ok).toBe(true)
    const archived = await client.fetch('/api/characters/test-char-0/archive', { method: 'POST' })
    expect(archived.status).toBe(200)
    const stub = (await archived.json() as any).stub
    expect(stub).toMatchObject({ chaId: 'test-char-0' })
    const dbKey = Buffer.from('database/database.bin').toString('hex')
    const read = await client.fetch('/api/read', { headers: { 'file-path': dbKey } })
    const database = utils.normalizeJSON(await utils.decodeRisuSave(Buffer.from(await read.arrayBuffer())))
    database.characters = database.characters.filter((character: any) => character.chaId !== 'test-char-0')
    database.archivedCharacters = [...(database.archivedCharacters ?? []), stub]
    expect((await client.fetch('/api/write', {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream', 'file-path': dbKey, 'x-if-match': read.headers.get('x-db-etag')! },
      body: Buffer.from(utils.encodeRisuSaveLegacy(database)),
    })).status).toBe(200)
    const session = await client.fetch('/api/session', { method: 'POST' })
    const cookie = session.headers.get('set-cookie')!.split(';')[0]
    expect((await client.fetch('/api/db/flush', { method: 'POST', headers: { cookie } })).status).toBe(200)
    await server.restart()
    client = await createClient(server.port, server.password)
    const activated = await client.fetch('/api/characters/test-char-0/activate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ archivedAt: stub.archivedAt }),
    })
    expect(activated.status).toBe(200)
    expect(await activated.json()).toMatchObject({ ok: true, character: { chaId: 'test-char-0' } })
  })

  test.each(['backup-import', 'server-restore', 'save-folder-execute', 'snapshot-restore', 'account-apply', 'database-remove'])('[new] b5 %s discards a pending journal row across reset and restart', async (kind) => {
    let closeFake: (() => Promise<void>) | undefined
    const account = createFakeAccount()
    const fake = kind === 'account-apply' ? await startFakeAccountServer(account) : undefined
    closeFake = fake?.close
    try {
      server = await spawnRestartableServer({ env: {
        POCKETRISU_BACKUP_INTERVAL_MS: '0',
        ...(fake ? { POCKETRISU_RISU_ACCOUNT_URL: fake.url, POCKETRISU_RISU_ACCOUNT_GAP_MS: '0' } : {}),
      } })
      let client = await createClient(server.port, server.password)
      const target = createSeedBackup({ characterCount: 2, messagesPerChat: 3 })
      let restoreName = ''
      let snapshotKey = ''
      if (kind === 'server-restore' || kind === 'snapshot-restore') {
        expect((await client.importBackup(target)).ok).toBe(true)
        if (kind === 'server-restore') {
          const saved = await client.fetch('/api/backup/server/save', { method: 'POST' })
          expect(saved.status).toBe(200)
          await saved.text()
          const listed = await (await client.fetch('/api/backup/server/list')).json() as any
          restoreName = listed.backups[0].filename
        }
        await new Promise(resolve => setTimeout(resolve, 5))
      }
      expect((await client.importBackup(createSeedBackup({ characterCount: 1, messagesPerChat: 2 }))).ok).toBe(true)
      if (kind === 'snapshot-restore') {
        const snapshots = await (await client.fetch('/api/db/snapshots')).json() as any
        snapshotKey = snapshots.snapshots.at(-1).key
        await new Promise(resolve => setTimeout(resolve, 110))
      }
      const beforeRead = await readChat(client)
      const before = beforeRead.chat
      const dirty = { ...before, message: [...before.message, { role: 'user', data: 'must be discarded by reset', chatId: 'e2-b5' }] }
      expect((await client.fetch('/api/chat-content/test-char-0/0', {
        method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-chat-id': dirty.id, ...baseRevision(beforeRead.response) }, body: encode(dirty),
      })).status).toBe(200)
      const db = new Database(path.join(server.cwd, 'save', 'risuai.db'), { readonly: true })
      const pending = (db.prepare("SELECT count(*) AS count FROM kv WHERE key LIKE 'internal/chat-write/v1/%'").get() as any).count
      db.close()
      expect(pending, 'the acknowledged chat has a durable pending journal row').toBe(1)

      if (kind === 'backup-import') expect((await client.importBackup(target)).ok).toBe(true)
      if (kind === 'server-restore') {
        const response = await client.fetch('/api/backup/server/restore', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename: restoreName }),
        })
        expect(response.status).toBe(200); await response.text()
      }
      if (kind === 'save-folder-execute') {
        const source = path.join(server.cwd, 'e2-b5-save-folder')
        await mkdir(source)
        const database = decodeBackup(target).find(entry => entry.name === 'database.risudat')!.data
        await writeFile(path.join(source, Buffer.from('database/database.bin').toString('hex')), database)
        expect((await client.fetch('/api/migrate/save-folder/execute', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: source }),
        })).status).toBe(200)
      }
      if (kind === 'snapshot-restore') {
        expect((await client.fetch('/api/db/snapshots/restore', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: snapshotKey }),
        })).status).toBe(200)
      }
      if (kind === 'account-apply') {
        const post = (url: string, body: unknown = {}) => client.fetch(url, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
        })
        expect((await post('/api/risu-account/prepare', { token: account.token, id: account.id })).status).toBe(200)
        for (let i = 0; i < 400; i++) {
          const status = await (await client.fetch('/api/risu-account/status')).json() as any
          if (status.state === 'ready') break
          await new Promise(resolve => setTimeout(resolve, 25))
        }
        expect((await post('/api/risu-account/download')).status).toBe(200)
        for (let i = 0; i < 400; i++) {
          const status = await (await client.fetch('/api/risu-account/status')).json() as any
          if (status.state === 'downloaded') break
          await new Promise(resolve => setTimeout(resolve, 25))
        }
        expect((await post('/api/risu-account/apply')).status).toBe(200)
        for (let i = 0; i < 400; i++) {
          const status = await (await client.fetch('/api/risu-account/status')).json() as any
          if (status.state === 'idle') break
          await new Promise(resolve => setTimeout(resolve, 25))
        }
      }
      if (kind === 'database-remove') {
        expect((await client.fetch('/api/remove', { headers: { 'file-path': Buffer.from('database/database.bin').toString('hex') } })).status).toBe(200)
      }
      await server.restart()
      client = await createClient(server.port, server.password)
      const recovered = kind === 'account-apply'
        ? await client.fetch('/api/chat-content/acc-char-a/0', { headers: { 'x-chat-id': 'chat-a1' } })
        : await client.fetch('/api/chat-content/test-char-0/0', { headers: { 'x-chat-id': 'chat-0-0' } })
      if (kind === 'database-remove') expect(recovered.status).toBe(404)
      else {
        expect(recovered.status).toBe(200)
        const chat = await utils.decodeRisuSave(Buffer.from(await recovered.arrayBuffer()))
        expect(chat.message.some((entry: any) => entry.chatId === 'e2-b5')).toBe(false)
      }
    } finally {
      await closeFake?.()
    }
  })

  test('[new] b5 database-remove cancels a warm pending DB save before restart', async () => {
    server = await spawnRestartableServer({ env: { POCKETRISU_BACKUP_INTERVAL_MS: '0' } })
    let client = await createClient(server.port, server.password)
    expect((await client.importBackup(createSeedBackup({ characterCount: 1, messagesPerChat: 2 }))).ok).toBe(true)

    const dbKey = Buffer.from('database/database.bin').toString('hex')
    expect((await client.fetch('/api/read', { headers: { 'file-path': dbKey } })).status).toBe(200)
    const beforeRead = await readChat(client)
    const before = beforeRead.chat
    const dirty = {
      ...before,
      message: [...before.message, { role: 'user', data: 'must not survive database removal', chatId: 'e2-b5-warm-remove' }],
    }
    expect((await client.fetch('/api/chat-content/test-char-0/0', {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream', 'x-chat-id': dirty.id, ...baseRevision(beforeRead.response) },
      body: encode(dirty),
    })).status).toBe(200)

    expect((await client.fetch('/api/remove', { headers: { 'file-path': dbKey } })).status).toBe(200)

    await new Promise(resolve => setTimeout(resolve, 5_250))
    await server.restart()
    client = await createClient(server.port, server.password)

    const recovered = await readChat(client)
    const database = await client.fetch('/api/read', { headers: { 'file-path': dbKey } })
    expect(recovered.response.status, 'the pre-reset chat must not be recreated by the pending save').toBe(404)
    expect(database.status, 'a missing database uses the native empty read response').toBe(200)
    expect((await database.arrayBuffer()).byteLength, 'database/database.bin must remain absent after restart').toBe(0)
  })
})
