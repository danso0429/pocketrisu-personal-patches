'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const {
    createChatWriteJournal,
    hasChatMetadata,
} = require('../patches/lazy-chat-sync/files/server/node/chatWriteJournal.cjs')

const root = path.join(__dirname, '..')

function createJournalHarness(kv = new Map(), overrides = {}) {
    const writes = []
    const journal = createChatWriteJournal({
        kvGet: key => kv.get(key) ?? null,
        kvSet: (key, value) => {
            writes.push({ key, value: Buffer.from(value) })
            kv.set(key, Buffer.from(value))
        },
        kvDel: key => kv.delete(key),
        kvList: prefix => [...kv.keys()].filter(key => key.startsWith(prefix)),
        encode: value => Buffer.from(JSON.stringify(value), 'utf8'),
        decode: async value => JSON.parse(Buffer.from(value).toString('utf8')),
        ...overrides,
    })
    return { journal, kv, writes }
}

function chatPayload(data = 'synthetic answer') {
    return {
        id: 'chat-1',
        name: 'Synthetic chat',
        message: [
            { role: 'user', data: 'synthetic input', chatId: 'user-1' },
            { role: 'char', data, chatId: 'assistant-1' },
        ],
        localLore: [],
    }
}

test('C0-E: async chat journal stage writes outside a synchronous SQLite transaction callback', async () => {
    let inTransaction = false
    let writeObservedInsideTransaction = null
    const kv = new Map()
    const { journal } = createJournalHarness(kv, {
        kvSet: (key, value) => {
            writeObservedInsideTransaction = inTransaction
            kv.set(key, Buffer.from(value))
        },
    })
    const runSynchronousTransaction = (operation) => {
        inTransaction = true
        try {
            return operation()
        } finally {
            inTransaction = false
        }
    }

    const pending = runSynchronousTransaction(() => (
        journal.stage('char-1', 'chat-1', chatPayload(), { awaitingMetadata: false })
    ))
    assert.equal(inTransaction, false)
    await pending
    assert.equal(writeObservedInsideTransaction, false)
    assert.equal(kv.size, 1)
})

test('C0-E: current payload journal can survive while adjacent intent and owner receipt fail', async () => {
    const { journal, kv } = createJournalHarness()
    await journal.stage('char-1', 'chat-1', chatPayload(), { awaitingMetadata: false })

    const receipts = new Map()
    assert.throws(() => {
        receipts.set('host-change-intent', { seq: 1 })
        throw new Error('owner receipt write failed')
    }, /owner receipt write failed/)

    const restarted = createJournalHarness(kv).journal
    const restored = new Map()
    await restarted.restoreInto(restored)
    assert.deepEqual(restored.get('char-1')?.get('chat-1'), chatPayload())
    assert.equal(receipts.has('host-change-intent'), true)
    assert.equal(receipts.has('owner-receipt'), false)

    const [encodedRecord] = [...kv.values()]
    const record = JSON.parse(encodedRecord.toString('utf8'))
    assert.deepEqual(Object.keys(record).sort(), [
        'awaitingMetadata',
        'chaId',
        'chat',
        'chatId',
        'updatedAt',
        'version',
    ])
})

test('C0-E: a recovered new-chat payload remains undiscoverable without its metadata stub', async () => {
    const first = createJournalHarness()
    await first.journal.stage('char-1', 'chat-1', chatPayload(), {
        awaitingMetadata: true,
    })

    const restarted = createJournalHarness(first.kv).journal
    const restored = new Map()
    await restarted.restoreInto(restored)
    assert.deepEqual(restored.get('char-1')?.get('chat-1'), chatPayload())

    const strippedDatabase = {
        characters: [{ chaId: 'char-1', chats: [] }],
    }
    assert.equal(hasChatMetadata(strippedDatabase, 'char-1', 'chat-1'), false)
    await restarted.clearAfterDatabasePersist(strippedDatabase)
    assert.equal(first.kv.size, 1)
})

test('C0-E: current BG entry saves an already-inserted browser message before operation admission', () => {
    const manifest = JSON.parse(fs.readFileSync(
        path.join(root, 'patches', 'bg-preserve.json'),
        'utf8',
    ))
    const clientUnit = manifest.units.find(unit => (
        unit.file === 'src/ts/bgOrchestrate.ts'
        && typeof unit.content === 'string'
        && unit.content.includes('export async function runServerOrchestratedChat')
    ))
    assert.ok(clientUnit, 'bgOrchestrate.ts owned unit is required')
    const start = clientUnit.content.indexOf('export async function runServerOrchestratedChat')
    const body = clientUnit.content.slice(start)
    const canonicalSave = body.indexOf('requestDurableSave({ chat: [charId, chatId] })')
    const operationAdmission = body.indexOf('const operationId = v4()')

    assert.match(body, /User's message already exists only in browser memory at this point/)
    assert.ok(canonicalSave >= 0)
    assert.ok(operationAdmission > canonicalSave)
    assert.doesNotMatch(body, /QueuedInputCommand|next_server_input_accepted/)
})

test('C0-E: current full-chat route durably journals before publish but has no combined commit envelope', () => {
    const server = fs.readFileSync(path.join(
        root,
        'patches',
        'lazy-chat-sync',
        'files-1.10',
        'server',
        'node',
        'server.cjs',
    ), 'utf8')
    const routeStart = server.indexOf("app.post('/api/chat-content/:chaId/:chatIndex',")
    const routeEnd = server.indexOf('// ── Save-folder migration endpoints', routeStart)
    assert.ok(routeStart >= 0 && routeEnd > routeStart)
    const route = server.slice(routeStart, routeEnd)
    const journalWrite = route.indexOf('await chatWriteJournal.stage')
    const memoryPublish = route.indexOf('fullChatStore.get(chaId).set(expectedChatId, chatData)')
    const successResponse = route.indexOf('res.json({ success: true, revision })')

    assert.ok(journalWrite >= 0)
    assert.ok(memoryPublish > journalWrite)
    assert.ok(successResponse > memoryPublish)
    assert.doesNotMatch(route, /hostChangeIntent|commitReceipt|ownerProjection|effectReceipt/)
})
