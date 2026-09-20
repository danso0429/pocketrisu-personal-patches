'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
    DATABASE_KEY,
    OLD_CLIPBOARD_LINE,
    IOS_SAFE_CLIPBOARD_LINE,
    executeMigration,
    sha256,
} = require('../scripts/fastimport-ios-migration.cjs')

const BACKUP_KEY = 'database/dbbackup-fixture.bin'

function fixtureScript() {
    return `async function importClick(isIOS, navigator, selectFiles) {
    ${OLD_CLIPBOARD_LINE}
    if (clipText.startsWith('realm://')) return 'clipboard'
    selectFiles()
    return 'picker'
}`
}

function fixtureDatabase(script = fixtureScript(), copies = 1) {
    const targets = Array.from({ length: copies }, (_, index) => ({
        name: 'fast-character-import',
        displayName: '고속 캐릭터 임포트 1.5.5',
        version: '2.1',
        enabled: index === 0,
        script,
        nested: { keep: ['ordered', index] },
    }))
    return {
        language: 'ko',
        plugins: [
            { name: 'unrelated-before', script: 'before', value: { order: [3, 2, 1] } },
            ...targets,
            { name: 'unrelated-after', script: 'after', enabled: true },
        ],
        pluginCustomStorage: { preserved: { value: 7 } },
        characters: [{ chaId: 'fixture-character', chats: [] }],
    }
}

const jsonCodec = {
    encode: async (value) => Buffer.from(JSON.stringify(value)),
    decode: async (value) => JSON.parse(Buffer.from(value).toString('utf8')),
}

function fixturePolicy(source = fixtureScript()) {
    const patched = source.replace(OLD_CLIPBOARD_LINE, IOS_SAFE_CLIPBOARD_LINE)
    return {
        pluginName: 'fast-character-import',
        displayName: '고속 캐릭터 임포트 1.5.5',
        originalScriptSha256: sha256(source),
        patchedScriptSha256: sha256(patched),
        needle: OLD_CLIPBOARD_LINE,
        replacement: IOS_SAFE_CLIPBOARD_LINE,
    }
}

function createMemoryStore(database, options = {}) {
    const state = {
        values: new Map([[DATABASE_KEY, Buffer.from(JSON.stringify(database))]]),
        writes: 0,
        copies: 0,
        readonlyOpens: 0,
        committedPatch: false,
        restored: false,
    }

    const openStore = ({ readonly }) => {
        if (readonly) state.readonlyOpens += 1
        return {
            read(key) {
                const value = state.values.get(key)
                if (
                    readonly
                    && state.committedPatch
                    && !state.restored
                    && options.corruptPostWriteReadback
                    && key === DATABASE_KEY
                ) {
                    return Buffer.from('{corrupt')
                }
                return value ? Buffer.from(value) : null
            },
            has(key) { return state.values.has(key) },
            copy(source, destination) {
                if (options.failBackup) throw new Error('Injected backup failure')
                const value = state.values.get(source)
                if (!value) return
                state.copies += 1
                state.values.set(destination, Buffer.from(value))
                if (source === BACKUP_KEY && destination === DATABASE_KEY) {
                    state.restored = true
                    state.committedPatch = false
                }
            },
            write(key, value) {
                if (options.failWrite) throw new Error('Injected write failure')
                state.writes += 1
                state.values.set(key, Buffer.from(value))
                if (key === DATABASE_KEY) state.committedPatch = true
            },
            transaction(operation) {
                const beforeValues = new Map(
                    [...state.values].map(([key, value]) => [key, Buffer.from(value)]),
                )
                const before = {
                    writes: state.writes,
                    copies: state.copies,
                    committedPatch: state.committedPatch,
                    restored: state.restored,
                }
                try {
                    return operation()
                }
                catch (error) {
                    state.values = beforeValues
                    Object.assign(state, before)
                    throw error
                }
            },
            quickCheck() { return options.failQuickCheck ? 'not ok' : 'ok' },
            close() {},
        }
    }
    return { state, openStore }
}

function migrationArgs(store, policy = fixturePolicy()) {
    return {
        openStore: store.openStore,
        ...jsonCodec,
        policy,
        backupKey: BACKUP_KEY,
        confirmStopped: true,
    }
}

test('default inspection is read-only and reports the exact planned hashes', async () => {
    const store = createMemoryStore(fixtureDatabase())
    const result = await executeMigration(migrationArgs(store))

    assert.equal(result.status, 'ready')
    assert.equal(result.wrote, false)
    assert.equal(result.scriptSha256, fixturePolicy().originalScriptSha256)
    assert.equal(result.nextScriptSha256, fixturePolicy().patchedScriptSha256)
    assert.equal(store.state.writes, 0)
    assert.equal(store.state.copies, 0)
})

test('apply creates a verified backup, changes one script, and preserves every other value', async () => {
    const original = fixtureDatabase()
    const store = createMemoryStore(original)
    const result = await executeMigration({ ...migrationArgs(store), apply: true })

    assert.equal(result.status, 'applied')
    assert.equal(result.scriptSha256, fixturePolicy().patchedScriptSha256)
    assert.equal(store.state.writes, 1)
    assert.equal(store.state.copies, 1)
    assert.deepEqual(JSON.parse(store.state.values.get(BACKUP_KEY)), original)

    const updated = JSON.parse(store.state.values.get(DATABASE_KEY))
    assert.equal(updated.plugins[1].script.includes(IOS_SAFE_CLIPBOARD_LINE), true)
    const maskedOriginal = structuredClone(original)
    const maskedUpdated = structuredClone(updated)
    maskedOriginal.plugins[1].script = '<target>'
    maskedUpdated.plugins[1].script = '<target>'
    assert.deepEqual(maskedUpdated, maskedOriginal)
})

test('known patched state is a write-free already-applied result', async () => {
    const patchedScript = fixtureScript().replace(OLD_CLIPBOARD_LINE, IOS_SAFE_CLIPBOARD_LINE)
    const store = createMemoryStore(fixtureDatabase(patchedScript))
    const result = await executeMigration({ ...migrationArgs(store), apply: true })

    assert.equal(result.status, 'already-applied')
    assert.equal(result.wrote, false)
    assert.equal(store.state.writes, 0)
    assert.equal(store.state.copies, 0)
})

test('unknown hashes and zero or multiple targets fail before backup or write', async () => {
    const unknown = createMemoryStore(fixtureDatabase(`${fixtureScript()}\n// unknown`))
    await assert.rejects(executeMigration(migrationArgs(unknown)), /Unknown FastImport script hash/)

    const zero = createMemoryStore({ ...fixtureDatabase(), plugins: [] })
    await assert.rejects(executeMigration(migrationArgs(zero)), /found 0/)

    const multiple = createMemoryStore(fixtureDatabase(fixtureScript(), 2))
    await assert.rejects(executeMigration(migrationArgs(multiple)), /found 2/)
    for (const store of [unknown, zero, multiple]) {
        assert.equal(store.state.writes, 0)
        assert.equal(store.state.copies, 0)
    }
})

test('backup and write failures roll back the transaction without changing the input', async () => {
    for (const options of [{ failBackup: true }, { failWrite: true }]) {
        const original = fixtureDatabase()
        const store = createMemoryStore(original, options)
        await assert.rejects(
            executeMigration({ ...migrationArgs(store), apply: true }),
            /Injected (backup|write) failure/,
        )
        assert.deepEqual(JSON.parse(store.state.values.get(DATABASE_KEY)), original)
        assert.equal(store.state.values.has(BACKUP_KEY), false)
    }
})

test('post-write verification failure restores only the still-matching patched blob', async () => {
    const original = fixtureDatabase()
    const store = createMemoryStore(original, { corruptPostWriteReadback: true })
    await assert.rejects(
        executeMigration({ ...migrationArgs(store), apply: true }),
        (error) => error.restored === true,
    )
    assert.deepEqual(JSON.parse(store.state.values.get(DATABASE_KEY)), original)
    assert.equal(store.state.restored, true)
})

test('apply requires an explicit stopped boundary and backup key', async () => {
    const store = createMemoryStore(fixtureDatabase())
    await assert.rejects(
        executeMigration({ ...migrationArgs(store), apply: true, confirmStopped: false }),
        /confirm-stopped/,
    )
    await assert.rejects(
        executeMigration({ ...migrationArgs(store), apply: true, backupKey: undefined }),
        /backup key/,
    )
    assert.equal(store.state.writes, 0)
})

test('transformed fixture skips iOS clipboard synchronously and preserves desktop clipboard behavior', async () => {
    const policy = fixturePolicy()
    const source = fixtureScript().replace(policy.needle, policy.replacement)
    const importClick = new Function(`${source}; return importClick;`)()

    const iosEvents = []
    const iosPromise = importClick(
        () => true,
        { clipboard: { readText: async () => { iosEvents.push('clipboard'); return '' } } },
        () => iosEvents.push('picker'),
    )
    assert.deepEqual(iosEvents, ['picker'])
    assert.equal(await iosPromise, 'picker')

    const desktopEvents = []
    const desktopPromise = importClick(
        () => false,
        { clipboard: { readText: async () => { desktopEvents.push('clipboard'); return '' } } },
        () => desktopEvents.push('picker'),
    )
    assert.deepEqual(desktopEvents, ['clipboard'])
    assert.equal(await desktopPromise, 'picker')
    assert.deepEqual(desktopEvents, ['clipboard', 'picker'])
})
