import { expect, test, vi } from 'vitest'
import fs from 'node:fs'
import ts from 'typescript'
import { appearanceSaveFailure, type AppearanceWriter } from './appearancePersistence'

const source = ts.createSourceFile('globalApi.ts', fs.readFileSync('src/ts/globalApi.svelte.ts', 'utf8'), ts.ScriptTarget.Latest, true)
const saveDb = source.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'saveDb') as ts.FunctionDeclaration
const registration = saveDb.body!.statements.find(n => ts.isExpressionStatement(n) && n.getText(source).startsWith('registerAppearanceWriter('))
if (!registration) throw new Error('Standalone/composed appearance writer is missing')
const js = ts.transpileModule(registration.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText

function harness(options: { outcome?: 'saved' | 'noop' | 'retry'; reject?: Error; flushReject?: boolean; prior?: Promise<void> } = {}) {
    let writer!: AppearanceWriter
    const events: string[] = []
    const state = { value: 'before', unrelated: 'keep' }
    const context = {
        saveInFlight: options.prior ?? null, supportsPatchSync: true, safeStructuredClone: structuredClone,
        patcher: { lastSyncedDb: { original: true }, init: async () => { events.push('baseline-restored') } },
        registerAppearanceWriter: (fn: AppearanceWriter) => writer = fn,
        tick: async () => {}, changeTracker: { root: false }, takeTrackedChanges: () => ({ root: true }), saving: { state: false },
        persistTrackedChanges: async (_scope: unknown, _timing: unknown, strict: unknown) => {
            events.push('persist')
            expect(strict).toEqual({ personalStrict: true })
            if (options.reject) throw options.reject
            return options.outcome ?? 'saved'
        },
        forageStorage: { realStorage: { flushPersonalAppearance: async () => { events.push('flush'); if (options.flushReject) throw new Error('transport') } } },
        requeueTrackedChanges: () => events.push('requeue'), changed: false, appearanceSaveFailure,
    }
    new Function(...Object.keys(context), js)(...Object.values(context))
    return { state, events, save: () => writer(() => {
        events.push('mutate'); state.value = 'after'
        return () => { events.push('undo'); if (state.value === 'after') state.value = 'before' }
    }, () => { events.push('verify') }) }
}
test('standalone writer waits for the previous save, then mutates, persists, flushes and acknowledges', async () => {
    let resolve!: () => void
    const h = harness({ prior: new Promise<void>(r => resolve = r) })
    const save = h.save()
    expect(h.state.value).toBe('before')
    resolve(); await save
    expect(h.events).toEqual(['verify', 'mutate', 'persist', 'flush', 'verify'])
    expect(h.state).toEqual({ value: 'after', unrelated: 'keep' })
})
test('definite rejection invokes only the supplied target compare-and-swap undo', async () => {
    const h = harness({ reject: appearanceSaveFailure(false) })
    await expect(h.save()).rejects.toMatchObject({ ambiguous: false })
    expect(h.state).toEqual({ value: 'before', unrelated: 'keep' })
    expect(h.events).not.toContain('flush')
})
test.each([{ reject: new Error('lost response') }, { flushReject: true }, { outcome: 'retry' as const }])('ambiguity never claims rollback or durable success: %j', async options => {
    const h = harness(options)
    await expect(h.save()).rejects.toMatchObject({ ambiguous: true })
    expect(h.state.value).toBe('after')
    expect(h.events).not.toContain('undo')
    expect(h.events).toContain('requeue')
})
test('a definite deferred/noop save does not flush or claim success', async () => {
    const h = harness({ outcome: 'noop' })
    await expect(h.save()).rejects.toMatchObject({ ambiguous: false })
    expect(h.state.value).toBe('before')
    expect(h.events).not.toContain('flush')
})
test('strict composed persistence refuses patch fallback and rebase before running them', () => {
    const persist = saveDb.body!.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'persistTrackedChanges') as ts.FunctionDeclaration
    const body = persist.getText(source)
    const reject = body.indexOf('if ((options as any)?.personalStrict && (!patchResult.success')
    expect(reject).toBeGreaterThan(0)
    expect(reject).toBeLessThan(body.indexOf('saved = patchResult.success'))
    expect(body.indexOf('personalStrict && !saved && supportsPatchSync')).toBeLessThan(body.indexOf("await forageStorage.setItem('database/database.bin'"))
    const guard = body.slice(body.indexOf('if ((options as any)?.personalStrict && conflictErr'), body.indexOf('if ((options as any)?.personalStrict && conflictErr') + 180)
    expect(guard).toContain('throw appearanceSaveFailure(false)')
    expect(body).toContain('personalStrict && !currentEtag')
})

function bufferHarness(patchSync = true, rejectPatch = false) {
    const persist = saveDb.body!.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'persistTrackedChanges') as ts.FunctionDeclaration
    const code = ts.transpileModule(persist.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
    const db = { characters: [], modules: [{ id: 'm', value: 'old' }], value: 'root' }
    // PocketRisu 1.16.1 builds a fresh encoder for every full write only.
    const encoder = {
        init: vi.fn(async () => {}),
        set: vi.fn(async () => {}),
        encode: vi.fn(() => new TextEncoder().encode(JSON.stringify(db)).buffer),
    }
    class RisuSaveEncoder {
        init = encoder.init
        set = encoder.set
        encode = encoder.encode
    }
    // A 409 for the client's own revision: the ordinary path falls through to a full write.
    const storage = { patchItem: vi.fn(async () => rejectPatch ? { success: false, etag: 'current', chatGuardRejected: false } : { success: true, etag: 'next' }), setItem: vi.fn(async () => {}), setDbEtag: vi.fn(), getDbEtag: () => 'current' }
    const patcher = {
        set: vi.fn(async () => ({ patch: [], expectedHash: 'fixture' })),
        baselineArchivedCharacterIds: () => new Set<string>(), baselineDb: () => structuredClone(db),
        changedCharacterIdsOfLastSet: () => [], estimatePayloadBytes: () => 1, init: async () => {}, describeHashMismatch: () => ({}),
    }
    const context = {
        gotChannel: false, channel: null, sessionID: 'fixture', getDatabase: () => db,
        collectChatsToPersist: () => [], saveChatToServer: async () => 'saved', errorMessage: String,
        safeStructuredClone: structuredClone, sleep: async () => {}, supportsPatchSync: patchSync, appearanceSaveFailure,
        patcher, hasAmbiguousCharacterIds: () => false, findDangerousChatOps: () => [], forageStorage: storage,
        recordDbTransferSize: () => {}, showPersistWarningOnce: () => {}, showChatGuardToastThrottled: () => {},
        summarizeHashMismatch: () => '', addLog: () => {}, SaveRejectedError: class extends Error {},
        rebaseTrackedLocalChangesOnLatestServerDb: vi.fn(async () => {}), withTrackedCharacters: (value: unknown) => value,
        savetrys: 0, RisuSaveEncoder, ConflictError: class extends Error {}, updateKnownChatsAfterSuccessfulSave: () => {},
        decodeRisuSave: async (bytes: Uint8Array) => JSON.parse(new TextDecoder().decode(bytes)),
        resyncBaselineAfterFullWrite: async () => {},
    }
    const run = new Function(...Object.keys(context), `${code}; return persistTrackedChanges`)(...Object.values(context))
    const changes = { root: true, character: [], chat: [], botPreset: false, modules: true, plugins: false, pluginCustomStorage: false }
    return { db, encoder, storage, patcher, run: (options: Record<string, boolean>, modules = true) => run({ ...changes, modules }, {}, options) }
}
test('strict patches never assemble or write a full buffer; a later full write encodes the current state', async () => {
    const h = bufferHarness()
    h.db.modules[0].value = 'changed'
    expect(await h.run({ personalStrict: true })).toBe('saved')
    expect(h.storage.patchItem).toHaveBeenCalledTimes(1)
    expect(h.encoder.encode).not.toHaveBeenCalled()
    expect(h.storage.setItem).not.toHaveBeenCalled()
    expect(await h.run({ forceFullWrite: true }, false)).toBe('saved')
    expect(h.encoder.encode).toHaveBeenCalledTimes(1)
    const bytes = (h.storage.setItem.mock.calls as unknown[][])[0][1] as Uint8Array
    expect(JSON.parse(new TextDecoder().decode(bytes)).modules[0].value).toBe('changed')
})
test('strict saves without patch sync still assemble the qualified full write', async () => {
    const h = bufferHarness(false)
    expect(await h.run({ personalStrict: true })).toBe('saved')
    expect(h.encoder.encode).toHaveBeenCalledTimes(1)
    expect(h.storage.setItem).toHaveBeenCalledTimes(1)
    expect((h.storage.setItem.mock.calls as unknown[][])[0][2]).toBe('current')
})
test('strict root-only saves still submit an operation-keyed browser effect to patch sync', async () => {
    const h = bufferHarness()
    const effect = { id: 'browser-effect-1', delta: 1, createdAt: Date.now() }
    ;(h.db as any).statics = { messages: 12, browserMessageEffects: [effect] }
    expect(await h.run({ personalStrict: true }, false)).toBe('saved')
    expect(h.patcher.set).toHaveBeenCalledWith(
        expect.objectContaining({
            statics: { messages: 12, browserMessageEffects: [effect] },
        }),
        expect.objectContaining({ root: true }),
    )
    expect(h.storage.patchItem).toHaveBeenCalledTimes(1)
    expect(h.encoder.encode).not.toHaveBeenCalled()
})
test('ordinary rejected patches keep the native full write and rejected strict patches never fall back to one', async () => {
    const ordinary = bufferHarness(true, true)
    expect(await ordinary.run({})).toBe('saved')
    expect(ordinary.encoder.encode).toHaveBeenCalledTimes(1)
    expect(ordinary.storage.setItem).toHaveBeenCalledTimes(1)
    const rejected = bufferHarness(true, true)
    await expect(rejected.run({ personalStrict: true })).rejects.toMatchObject({ ambiguous: false })
    expect(rejected.encoder.encode).not.toHaveBeenCalled()
    expect(rejected.storage.setItem).not.toHaveBeenCalled()
})
