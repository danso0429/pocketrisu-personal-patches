import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { Packr } from 'msgpackr'
import { spawnServer, type ServerHandle } from './helpers/spawnServer.js'
import { createClient, type RisuClient } from './helpers/client.js'
import { createSeedBackup } from './helpers/seed.js'
import { encodeBackup } from './helpers/encode.js'

const utilsPkg = require('../../server/node/utils.cjs') as any
const utils = utilsPkg.default ?? utilsPkg
const fpPkg = require('../../server/node/chatFingerprint.cjs') as any
const fp = fpPkg.default ?? fpPkg
const DB_KEY_HEX = Buffer.from('database/database.bin').toString('hex')
const MAGIC_RAW = Buffer.from([0, 82, 73, 83, 85, 83, 65, 86, 69, 0, 7])
const packr = new Packr({ useRecords: false })
const encode = (value: unknown) => Buffer.concat([MAGIC_RAW, packr.encode(value)])

let server: ServerHandle
let client: RisuClient

beforeEach(async () => {
    server = await spawnServer()
    client = await createClient(server.port, server.password)
    expect((await client.importBackup(createSeedBackup({ messagesPerChat: 3 }))).ok).toBe(true)
})
afterEach(async () => { await server?.cleanup() })

async function readChat(headers: Record<string, string> = {}) {
    const response = await client.fetch('/api/chat-content/test-char-0/0', {
        headers: { 'x-chat-id': 'chat-0-0', ...headers },
    })
    const chat = response.status === 304 ? null : await utils.decodeRisuSave(Buffer.from(await response.arrayBuffer()))
    return { response, chat }
}

async function postChat(chat: any, headers: Record<string, string> = {}, index = 0) {
    return client.fetch(`/api/chat-content/test-char-0/${index}`, {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream', 'x-chat-id': chat.id, ...headers },
        body: encode(chat),
    })
}

async function readDb() {
    const response = await client.fetch('/api/read', { headers: { 'file-path': DB_KEY_HEX } })
    const db = utils.normalizeJSON(await utils.decodeRisuSave(Buffer.from(await response.arrayBuffer())))
    return { response, db }
}

async function writeDb(db: any, etag: string | null) {
    return client.fetch('/api/write', {
        method: 'POST',
        headers: {
            'content-type': 'application/octet-stream',
            'file-path': DB_KEY_HEX,
            ...(etag ? { 'x-if-match': etag } : {}),
        },
        body: encode(db),
    })
}

describe('[E2-3b] Rebuild server chat-write durability over native 1.16.1', () => {
    test('[new] b3 rejects a header/body chat id mismatch without changing the chat', async () => {
        const before = (await readChat()).chat
        const response = await client.fetch('/api/chat-content/test-char-0/0', {
            method: 'POST',
            headers: { 'content-type': 'application/octet-stream', 'x-chat-id': 'chat-0-0' },
            body: encode({ ...before, id: 'different-id' }),
        })
        expect(response.status).toBe(409)
        expect((await readChat()).chat).toEqual(before)
    })

    test.each(['not-an-array', null, {}, undefined])('[new] b4 rejects non-array message payload %# without changing memory', async (message) => {
        const before = (await readChat()).chat
        const payload = { ...before, message }
        if (message === undefined) delete payload.message
        const response = await postChat(payload)
        expect(response.status).toBe(400)
        expect((await readChat()).chat).toEqual(before)
    })

    test('[unchanged] b8 preserves native prefix-delta splice and mismatch rejection', async () => {
        const before = (await readChat()).chat
        const base = {
            'x-chat-base-count': '3',
            'x-chat-base-fp': fp.prefixFingerprint(fp.messageFingerprints(before.message), 3),
        }
        const appended = { ...before, message: [{ role: 'char', data: 'delta reply' }] }
        expect((await postChat(appended, base)).status).toBe(200)
        expect((await readChat()).chat.message.at(-1).data).toBe('delta reply')
        const mismatch = await postChat({ ...before, message: [{ role: 'user', data: 'must not land' }] }, {
            'x-chat-base-count': '4',
            'x-chat-base-fp': 'wrong',
        })
        expect(mismatch.status).toBe(409)
        expect((await mismatch.json()).code).toBe('CHAT_DELTA_BASE_MISMATCH')
    })

    test('[unchanged] u5 keeps an unlisted chat body across a store rebuild until metadata lists it', async () => {
        const body = { id: 'unlisted-chat', name: 'Unlisted', message: [{ role: 'user', data: 'durable' }] }
        expect((await postChat(body, {}, 5)).status).toBe(200)
        const { response, db } = await readDb()
        db.characters[0].chats.push({ id: body.id, name: body.name, _stub: true, message: [] })
        expect((await writeDb(db, response.headers.get('x-db-etag'))).status).toBe(200)
        const fetched = await client.fetch('/api/chat-content/test-char-0/5', { headers: { 'x-chat-id': body.id } })
        expect(fetched.status).toBe(200)
        expect((await utils.decodeRisuSave(Buffer.from(await fetched.arrayBuffer()))).message[0].data).toBe('durable')
    })

    test('[unchanged] u1 preserves a hydrated asset manifest across a chat POST', async () => {
        const database = {
            characters: [{
                chaId: 'test-char-0', name: 'Assets', type: 'character', chatPage: 0,
                additionalAssets: [['portrait.png', 'assets/portrait', 'png']],
                chats: [{
                    id: 'chat-0-0', name: 'Chat', message: [{ role: 'user', data: 'hello' }],
                    localLore: [], scriptstate: {}, note: '',
                }],
            }],
        }
        expect((await client.importBackup(encodeBackup([
            { name: 'database.risudat', data: encode(database) },
        ]))).ok).toBe(true)
        const afterManifestWrite = await readDb()
        const manifest = afterManifestWrite.db.characters[0].additionalAssetManifest
        expect(manifest).toBeTruthy()
        const current = await readChat()
        const revision = current.response.headers.get('x-chat-revision')
        expect((await postChat(
            { ...current.chat, name: 'asset-safe edit' },
            revision ? { 'x-chat-base-revision': revision } : {},
        )).status).toBe(200)
        expect((await readDb()).db.characters[0].additionalAssetManifest).toEqual(manifest)
    })
})

describe('[E2-3d] Rebuild the chat revision protocol over native 1.16.1', () => {
    test('[new] d1 returns a revision and honors conditional GET with 304', async () => {
        const first = await readChat()
        expect(first.response.status).toBe(200)
        const revision = first.response.headers.get('x-chat-revision')
        expect(revision).toBeTruthy()
        const second = await readChat({ 'if-none-match': revision! })
        expect(second.response.status).toBe(304)
    })

    test('[new] d2 rejects an unconditioned overwrite of an existing chat', async () => {
        const before = (await readChat()).chat
        const response = await postChat({ ...before, name: 'overwrite' })
        expect(response.status).toBe(428)
        expect((await readChat()).chat).toEqual(before)
    })

    test('[new] d3 rejects a stale base revision and reports the current revision', async () => {
        const before = await readChat()
        const response = await postChat({ ...before.chat, name: 'stale' }, { 'x-chat-base-revision': 'stale-revision' })
        expect(response.status).toBe(409)
        expect((await response.json()).currentRevision).toBe(before.response.headers.get('x-chat-revision'))
    })

    test('[new] d4 gives create-only precedence and creates only an absent chat', async () => {
        const existing = (await readChat()).chat
        expect((await postChat(existing, { 'if-none-match': '*' })).status).toBe(412)
        const created = { ...existing, id: 'created-chat', message: [] }
        const response = await postChat(created, { 'if-none-match': '*' }, 1)
        expect(response.status).toBe(200)
        expect(response.headers.get('x-chat-revision')).toBeTruthy()
    })

    test('[new] d10b rejects a matching-prefix delta whose base revision is stale', async () => {
        const before = await readChat()
        const base = {
            'x-chat-base-count': '3',
            'x-chat-base-fp': fp.prefixFingerprint(fp.messageFingerprints(before.chat.message), 3),
            'x-chat-base-revision': 'stale-revision',
        }
        const response = await postChat({ ...before.chat, message: [{ role: 'user', data: 'must not splice' }] }, base)
        expect(response.status).toBe(409)
        expect((await readChat()).chat).toEqual(before.chat)
    })

    test('[new] d5 returns CHAT_PAYLOAD_MISSING for a legacy stub without a body', async () => {
        const legacy = {
            characters: [{
                chaId: 'legacy-char', name: 'Legacy', type: 'character', chatPage: 0,
                chats: [{ id: 'legacy-chat', name: 'Missing', _stub: true, message: [] }],
            }],
        }
        expect((await client.importBackup(encodeBackup([
            { name: 'database.risudat', data: encode(legacy) },
        ]))).ok).toBe(true)
        const response = await client.fetch('/api/chat-content/legacy-char/0', {
            headers: { 'x-chat-id': 'legacy-chat' },
        })
        expect(response.status).toBe(404)
        expect(await response.json()).toMatchObject({ code: 'CHAT_PAYLOAD_MISSING' })
    })

    test('[new] d15 rejects a newly introduced body-less stub and leaves the database unchanged', async () => {
        const before = await readDb()
        const changed = structuredClone(before.db)
        changed.characters[0].chats.push({ id: 'body-less', name: 'Body-less', _stub: true, message: [] })
        const response = await writeDb(changed, before.response.headers.get('x-db-etag'))
        expect(response.status).toBe(422)
        expect((await response.json()).code).toBe('DB_INVARIANT_REJECTED')
        expect((await readDb()).db).toEqual(before.db)
    })

    test('[new] d15b rejects a patch that introduces a body-less chat without advancing the baseline', async () => {
        const before = await readDb()
        const expectedHash = utils.calculateHash(before.db).toString(16)
        const response = await client.fetch('/api/patch', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'file-path': DB_KEY_HEX },
            body: JSON.stringify({
                expectedHash,
                patch: [{
                    op: 'add',
                    path: '/characters/0/chats/-',
                    value: { id: 'body-less-patch', name: 'Body-less', _stub: true, message: [] },
                }],
            }),
        })
        expect(response.status).toBe(422)
        expect(await response.json()).toMatchObject({ code: 'DB_INVARIANT_REJECTED' })
        expect((await readDb()).db).toEqual(before.db)
    })

    test('[unchanged] d16 native boot/import repair keeps all legacy chats without pinning generated ids', async () => {
        const legacy = {
            characters: [{
                chaId: 'legacy-char', name: 'Legacy', type: 'character', chatPage: 0,
                chats: [
                    { name: 'Missing id', message: [], localLore: [] },
                    { id: 'duplicate', name: 'First duplicate', message: [], localLore: [] },
                    { id: 'duplicate', name: 'Second duplicate', message: [], localLore: [] },
                ],
            }],
        }
        expect((await client.importBackup(encodeBackup([
            { name: 'database.risudat', data: encode(legacy) },
        ]))).ok).toBe(true)
        const repaired = await readDb()
        const chats = repaired.db.characters[0].chats
        expect(chats.map((entry: any) => entry.name)).toEqual(['Missing id', 'First duplicate', 'Second duplicate'])
        expect(chats.every((entry: any) => typeof entry.id === 'string' && entry.id.length > 0)).toBe(true)
        expect(new Set(chats.map((entry: any) => entry.id)).size).toBe(3)
        repaired.db.characters[0].name = 'saved after repair'
        expect((await writeDb(repaired.db, repaired.response.headers.get('x-db-etag'))).status).toBe(200)
    })

    test('[unchanged] d17 native normal full write succeeds and returns its ETag', async () => {
        const before = await readDb()
        before.db.characters[0].name = 'normal save'
        const response = await writeDb(before.db, before.response.headers.get('x-db-etag'))
        expect(response.status).toBe(200)
        expect(response.headers.get('etag') ?? response.headers.get('x-db-etag')).toBeTruthy()
    })
})
