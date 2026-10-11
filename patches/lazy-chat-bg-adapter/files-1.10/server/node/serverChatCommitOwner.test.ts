import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import commitPackage from './serverChatCommit.cjs'
import inputPackage from './serverChatInputOwner.cjs'
import journalPackage from './chatWriteJournal.cjs'
import operationPackage from './bgOrchestrationOperationStore.cjs'
import ownerPackage from './serverChatCommitOwner.cjs'
import utilsPackage from './utils.cjs'
import noticePackage from './bgOperationNotices.cjs'
import notificationPackage from './bgNotifications.cjs'

const { commitStorageKey, stableJSON } = commitPackage as any
const { commandKey, createServerChatInputOwner } = inputPackage as any
const { createChatWriteJournal } = journalPackage as any
const { operationResultKey, operationStateKey } = operationPackage as any
const { createBgOperationNotices } = noticePackage as any
const { createBgNotifications } = notificationPackage as any
const {
    SERVER_CHAT_COMMIT_APPLIED_FIELD,
    SERVER_CHAT_COMMIT_SEQUENCE_KEY,
    createServerChatCommitOwner,
    reconcileServerChatRecovery,
} = ownerPackage as any
const { decodeRisuSave, encodeRisuSaveLegacy } = utilsPackage as any

const cleanup: Array<() => void> = []

afterEach(() => {
    while (cleanup.length > 0) cleanup.pop()?.()
})

function revision(chat: unknown): string {
    return crypto.createHash('sha256').update(Buffer.from(encodeRisuSaveLegacy(chat))).digest('hex')
}

function digest(value: unknown): string {
    return crypto.createHash('sha256').update(stableJSON(value)).digest('hex')
}

function baseChat() {
    return {
        id: 'chat-1',
        name: 'Synthetic chat',
        message: [{ role: 'user', data: 'hello', chatId: 'user-1' }],
        localLore: [],
        modules: [],
    }
}

function withAnswer(chat: any, data: string, id: string) {
    return {
        ...structuredClone(chat),
        message: [
            ...structuredClone(chat.message),
            { role: 'char', data, chatId: id },
        ],
    }
}

function result(chat: any, from: string, to: string) {
    return {
        chat,
        staticsMessagesDelta: 1,
        globalChatVariables: { mood: to },
        globalChatVariablesDeleted: [],
        globalChatVariablesExpected: {
            mood: { present: true, value: from },
        },
        threw: null,
    }
}

function inputAdmission(operationId: string, chat: any, rawText: string) {
    return {
        operationId,
        inputCommandId: `input-${operationId}`,
        userMessageId: `user-${operationId}`,
        charId: 'char-1',
        chatId: 'chat-1',
        rawText,
        submittedBaseRevision: revision(chat),
        submittedAt: 1_700_000_000_000,
    }
}

function inputTransform(operationId: string, chat: any, rawText: string) {
    return {
        chat: {
            ...structuredClone(chat),
            message: [
                ...structuredClone(chat.message),
                {
                    role: 'user',
                    data: rawText,
                    chatId: `user-${operationId}`,
                    time: 1_700_000_000_000,
                    name: null,
                },
            ],
        },
        globalIntent: { changed: {}, deleted: [], expected: {} },
    }
}

function makeHarness() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'server-chat-owner-c2-'))
    const db = new Database(path.join(root, 'owner.sqlite'))
    db.pragma('journal_mode = WAL')
    db.exec('CREATE TABLE kv (key TEXT PRIMARY KEY, value BLOB NOT NULL, updated_at INTEGER NOT NULL)')
    const get = db.prepare('SELECT value FROM kv WHERE key = ?')
    const set = db.prepare(`
        INSERT INTO kv(key, value, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `)
    const del = db.prepare('DELETE FROM kv WHERE key = ?')
    const list = db.prepare('SELECT key FROM kv WHERE key LIKE ? ORDER BY key')
    const delPrefix = db.prepare("DELETE FROM kv WHERE key LIKE ? ESCAPE '\\'")
    const kvGet = (key: string) => (
        get.get(key) as { value?: string | Buffer } | undefined
    )?.value ?? null
    let failNextKey: string | null = null
    const kvSet = (key: string, value: string | Buffer | Uint8Array) => {
        if (failNextKey === key) {
            failNextKey = null
            throw new Error('injected-owner-write-failure')
        }
        set.run(key, typeof value === 'string' ? value : Buffer.from(value), Date.now())
    }
    const kvDel = (key: string) => {
        if (failNextKey === key) {
            failNextKey = null
            throw new Error('injected-owner-write-failure')
        }
        return del.run(key)
    }
    const escapedPrefix = (prefix: string) => `${prefix.replace(/[\\%_]/g, '\\$&')}%`
    const kvList = (prefix: string) => (
        list.all(escapedPrefix(prefix)) as Array<{ key: string }>
    ).map(row => row.key)
    const kvDelPrefix = (prefix: string) => delPrefix.run(escapedPrefix(prefix))
    const databaseKey = 'database-key'
    const runtime = {
        database: {
            characters: [{
                chaId: 'char-1',
                chats: [{ id: 'chat-1', name: 'Synthetic chat', _stub: true, modules: [] }],
            }],
            globalChatVariables: { mood: 'old' },
            statics: { messages: 10 },
        } as any,
        fullStore: new Map([['char-1', new Map([['chat-1', baseChat()]])]]),
        schedules: 0,
        ensures: 0,
        cacheFailures: 0,
        ensureCanonicalHook: null as null | (() => void | Promise<void>),
    }
    let queue = Promise.resolve<unknown>(undefined)
    const queueStorageOperation = <T>(operation: () => T | Promise<T>): Promise<T> => {
        const run = queue.then(operation, operation)
        queue = run.catch(() => undefined)
        return run
    }
    const makeJournal = () => createChatWriteJournal({
        kvGet,
        kvSet,
        kvDel,
        kvList,
        encode: encodeRisuSaveLegacy,
        decode: decodeRisuSave,
    })
    const ownerDependencies = {
        kvGet,
        kvSet,
        kvDel,
        kvDelPrefix,
        kvList,
        sqliteDb: db,
        queueStorageOperation,
        chatRevision: revision,
        ensureCanonicalState: async () => { runtime.ensures += 1; await runtime.ensureCanonicalHook?.() },
        getDbCache: () => ({ [databaseKey]: runtime.database }),
        getFullChatStore: () => runtime.fullStore,
        databaseKey,
        cacheStrippedDatabase: (database: any) => {
            if (runtime.cacheFailures > 0) {
                runtime.cacheFailures -= 1
                throw new Error('injected-cache-publication-failure')
            }
            runtime.database = database
        },
        scheduleChatStorePersist: () => { runtime.schedules += 1 },
        readPersistedDatabase: async () => {
            const raw = kvGet('synthetic/persisted-root')
            if (!raw) return null
            const bytes = Buffer.from(raw)
            return { database: await decodeRisuSave(Buffer.from(bytes)), isCurrent: () => {
                const latest = kvGet('synthetic/persisted-root')
                return latest !== null && bytes.equals(latest)
            } }
        },
    }
    const makeInputOwner = (journal = makeJournal(), options: any = {}) => createServerChatInputOwner({
        ...ownerDependencies,
        chatWriteJournal: journal,
        encodeSettingsSnapshot: encodeRisuSaveLegacy,
        ...options,
    })
    const makeOwner = (
        journal = makeJournal(),
        serverChatInputOwner: any = null,
        options: any = {},
    ) => createServerChatCommitOwner({
        ...ownerDependencies,
        chatWriteJournal: journal,
        serverChatInputOwner,
        ...options,
    })
    const primeOperation = (
        operationId: string,
        chatId = 'chat-1',
        state = 'result-ready',
    ) => {
        kvSet(operationStateKey(operationId), JSON.stringify({
            operationId,
            charId: 'char-1',
            chatId,
            state,
        }))
    }
    const commitInput = (
        operationId: string,
        commitResult: any,
        baselineMessageCount: number,
        baseChatRevision: string,
    ) => ({
        operationId,
        resultId: `result-${operationId}`,
        publishSeq: 2,
        charId: 'char-1',
        chatId: 'chat-1',
        baseChatRevision,
        baselineMessageCount,
        settingsDigest: digest({ operationId, settings: 'actual-server-input' }),
        result: commitResult,
        committedAt: '2026-09-14T01:02:03.000Z',
    })
    cleanup.push(() => {
        db.close()
        fs.rmSync(root, { recursive: true, force: true })
    })
    return {
        db,
        runtime,
        kvGet,
        kvSet,
        kvDel,
        kvList,
        makeJournal,
        makeInputOwner,
        makeOwner,
        primeOperation,
        commitInput,
        persistRoot() {
            const database = structuredClone(runtime.database)
            for (const character of database.characters) {
                character.chats = character.chats.map((metadata: any) =>
                    structuredClone(runtime.fullStore.get(character.chaId)?.get(metadata.id) || metadata))
            }
            kvSet('synthetic/persisted-root', Buffer.from(encodeRisuSaveLegacy(database)))
        },
        failNextWriteTo(key: string) { failNextKey = key },
    }
}

describe('server-owned BG chat commit', () => {
    it('a warm record summary still checks the current applied ledger and never replays statistics', async () => {
        const h = makeHarness(), owner = h.makeOwner(), id = 'operation-admission-summary';
        h.primeOperation(id);
        await owner.commitGenerationResult(h.commitInput(id, result(withAnswer(baseChat(), 'retained answer', 'summary-answer'), 'old', 'new'), 1, revision(baseChat())));
        const bytes = Buffer.from(h.kvGet(commitStorageKey(id)));
        expect(await owner.recoverBeforeWrite({ charId: 'char-1', chatId: 'chat-1' })).toMatchObject({ allowed: true, recovered: false });
        h.runtime.database[SERVER_CHAT_COMMIT_APPLIED_FIELD] = [];
        h.runtime.cacheFailures = 1;
        expect(await owner.recoverBeforeWrite({ charId: 'char-1', chatId: 'chat-1' })).toMatchObject({ allowed: false, code: 'BG_PUBLICATION_SAVE_BLOCKED' });
        expect(await owner.recoverBeforeWrite({ charId: 'char-1', chatId: 'chat-1' })).toMatchObject({ allowed: true, recovered: true });
        expect(h.runtime.database.statics.messages).toBe(11);
        expect(Buffer.from(h.kvGet(commitStorageKey(id)))).toEqual(bytes);
    });
    it('returns typed save refusal when canonical hydration throws without mutating storage', async () => {
        const h = makeHarness(), owner = h.makeOwner();
        const before = structuredClone(h.runtime.database);
        h.runtime.ensureCanonicalHook = () => { throw new Error('synthetic hydration unavailable') };
        expect(await owner.recoverBeforeWrite({ charId: 'char-1', chatId: 'chat-1' }))
            .toEqual({ allowed: false, code: 'BG_SAVE_ADMISSION_UNAVAILABLE' });
        expect(h.runtime.database).toEqual(before);
        expect(h.runtime.schedules).toBe(0);
    });
    for (const mode of ['chat', 'rename', 'delete', 'parent-delete', 'global', 'other-chat', 'setting', 'counter-repair'] as const) {
        for (const blocked of [false, true]) it(`admits ${mode} after publication recovery; blocked=${blocked}`, async () => {
            const h = makeHarness(), owner = h.makeOwner(), id = `operation-admit-${mode}-${blocked}`;
            h.primeOperation(id);
            h.runtime.cacheFailures = 1;
            const answer = withAnswer(baseChat(), 'retained answer', 'admission-answer');
            const outcome = await owner.commitGenerationResult(h.commitInput(id, result(answer, 'old', 'new'), 1, revision(baseChat())));
            expect(outcome.publication).toBe('pending_recovery');
            const immutable = Buffer.from(h.kvGet(commitStorageKey(id)));
            h.runtime.cacheFailures = blocked ? 1 : 0;
            const incoming = structuredClone(h.runtime.database);
            if (mode === 'rename') incoming.characters[0].chats[0].name = 'new name';
            if (mode === 'delete') incoming.characters[0].chats = [];
            if (mode === 'parent-delete') incoming.characters = [];
            if (mode === 'global') incoming.globalChatVariables.mood = 'later';
            if (mode === 'setting') incoming.theme = 'new-theme';
            if (mode === 'counter-repair') incoming.statics.messages = 12;
            const affects = !['other-chat', 'setting', 'counter-repair'].includes(mode);
            const admission = await owner.recoverBeforeWrite(mode === 'chat' || mode === 'other-chat'
                ? { charId: 'char-1', chatId: mode === 'chat' ? 'chat-1' : 'other-chat' }
                : { incomingDatabase: incoming });
            expect(admission.allowed).toBe(!(affects && blocked));
            expect(admission.recovered ?? false).toBe(affects && !blocked);
            expect(Buffer.from(h.kvGet(commitStorageKey(id)))).toEqual(immutable);
            expect(h.runtime.database.statics.messages).toBe(affects && !blocked ? 11 : 10);
            expect(h.runtime.fullStore.get('char-1')!.get('chat-1')).toEqual(affects && !blocked ? answer : baseChat());
            // Repeated admission cannot replay the statistic effect.
            if (!blocked && affects) {
                expect((await owner.recoverBeforeWrite({ charId: 'char-1', chatId: 'chat-1' })).allowed).toBe(true);
                expect(h.runtime.database.statics.messages).toBe(11);
            }
        });
    }
    for (const [name, statics] of [
        ['absent', undefined], ['empty', {}], ['array', []], ['null', null],
        ['string', { messages: '3' }], ['negative', { messages: -1 }],
        ['fraction', { messages: 1.5 }], ['unsafe', { messages: Number.MAX_SAFE_INTEGER + 1 }],
    ] as const) {
        for (const delta of [0, 1]) it(`refuses ${name} statistics before committing delta ${delta}`, async () => {
            const h = makeHarness(), owner = h.makeOwner(), id = `operation-stat-${name}-${delta}`;
            h.runtime.database.statics = structuredClone(statics);
            const before = structuredClone(h.runtime.database), chat = baseChat(); h.primeOperation(id);
            const value = { ...result(withAnswer(chat, 'retained answer', `answer-${id}`), 'old', 'new'), staticsMessagesDelta: delta };
            await expect(owner.commitGenerationResult(h.commitInput(id, value, 1, revision(chat))))
                .rejects.toMatchObject({code:'SERVER_CHAT_STATISTICS_INVALID'});
            expect(h.runtime.database).toEqual(before);
            expect(h.runtime.fullStore.get('char-1')!.get('chat-1')).toEqual(chat);
            expect(h.kvGet(commitStorageKey(id))).toBeNull();
            expect(h.kvGet(SERVER_CHAT_COMMIT_SEQUENCE_KEY)).toBeNull();
        });
    }
    it('rejects statistic overflow without publishing an answer or rebuilding the count', async () => {
        const h=makeHarness(), owner=h.makeOwner(), id='operation-stat-overflow', chat=baseChat();
        h.runtime.database.statics.messages=Number.MAX_SAFE_INTEGER;h.primeOperation(id);
        await expect(owner.commitGenerationResult(h.commitInput(id,result(withAnswer(chat,'retained','overflow-answer'),'old','new'),1,revision(chat))))
            .rejects.toMatchObject({code:'SERVER_CHAT_STATISTICS_INVALID'});
        expect(h.runtime.database.statics.messages).toBe(Number.MAX_SAFE_INTEGER);
        expect(h.kvGet(commitStorageKey(id))).toBeNull();
    });
    it('validates prepared assembly statistics before provider execution', async () => {
        const h=makeHarness(), owner=h.makeOwner();const admitted=await owner.captureBase('char-1','chat-1',baseChat());h.runtime.database.statics={};
        await expect(owner.captureBase('char-1','chat-1',baseChat())).rejects.toMatchObject({code:'SERVER_CHAT_STATISTICS_INVALID'});
        await expect(owner.readAssemblyContext('char-1','chat-1',admitted.anchor)).rejects.toMatchObject({code:'SERVER_CHAT_STATISTICS_INVALID'});
        expect(h.runtime.schedules).toBe(0);
    });
    it('preserves a committed result when statistics become invalid before publication and recovers once', async () => {
        const h=makeHarness(), owner=h.makeOwner(), id='operation-stat-publication', chat=baseChat();h.primeOperation(id);
        h.runtime.ensureCanonicalHook=()=>{if(h.runtime.ensures===2)h.runtime.database.statics={};};
        const committed=await owner.commitGenerationResult(h.commitInput(id,result(withAnswer(chat,'recover once','stat-recover-answer'),'old','new'),1,revision(chat)));
        expect(committed).toMatchObject({status:'committed',publication:'pending_recovery'});
        expect(h.runtime.database.serverChatCommitApplied).toBeUndefined();
        expect(h.runtime.database.globalChatVariables).toEqual({mood:'old'});
        expect(h.kvGet(commitStorageKey(id))).not.toBeNull();
        h.runtime.ensureCanonicalHook=null;h.runtime.database.statics={messages:10};
        expect(await owner.recover(id)).toMatchObject({status:'committed',publication:'published'});
        expect(h.runtime.database.statics.messages).toBe(11);
        expect(await owner.recover(id)).toMatchObject({status:'committed'});
        expect(h.runtime.database.statics.messages).toBe(11);
    });
    it('samples latest assembly settings and body together without exposing an aliased graph', async () => {
        const harness = makeHarness(), owner = harness.makeOwner()
        const admitted = await owner.captureBase('char-1', 'chat-1', baseChat())
        harness.runtime.database.characters[0].description = 'latest character'
        harness.runtime.database.characters[0].chats[0].name = 'latest title'
        harness.runtime.database.globalChatVariables.mood = 'latest value'
        const current = structuredClone(baseChat())
        current.message[0].data = 'latest input'
        harness.runtime.fullStore.get('char-1')!.set('chat-1', current)
        const first = await owner.readAssemblyContext('char-1', 'chat-1', admitted.anchor)
        expect(first.status).toBe('ready')
        expect(first.chat.message[0].data).toBe('latest input')
        expect(first.chat.name).toBe('latest title')
        expect(first.database.characters[0].description).toBe('latest character')
        expect(first.database.globalChatVariables.mood).toBe('latest value')
        first.chat.message[0].data = 'execution mutation'
        first.database.globalChatVariables.mood = 'execution value'
        expect(current.message[0].data).toBe('latest input')
        expect(harness.runtime.database.globalChatVariables.mood).toBe('latest value')
        const second = await owner.readAssemblyContext('char-1', 'chat-1', admitted.anchor)
        expect(first.contextDigest).toMatch(/^[a-f0-9]{64}$/)
        expect(first.contextDigest).not.toBe(second.contextDigest)
        expect(harness.kvList('internal/server-chat-commit/')).toEqual([])
    })

    it('commits over a saved earlier edit and retains variables, metadata and replay identity', async () => {
        const harness = makeHarness()
        const noticeDeps = { db: harness.db, kvGet: harness.kvGet, kvSet: harness.kvSet, kvDel: harness.kvDel, kvList: harness.kvList }
        const outbox = createBgNotifications(noticeDeps)
        const notices = createBgOperationNotices({ ...noticeDeps, publish: outbox.publish })
        const owner = harness.makeOwner(undefined, null, { notifyCommit: notices.captureCommit })
        const before: any = baseChat()
        before.message.unshift({ role: 'char', chatId: 'history', data: 'original' })
        before.scriptstate = { a: '0', b: '0' }
        harness.runtime.fullStore.get('char-1')!.set('chat-1', structuredClone(before))
        const captured = await owner.captureBase('char-1', 'chat-1', before)
        const generated: any = withAnswer(before, 'new answer', 'answer-anchor')
        generated.scriptstate.a = 'script'; generated.scriptstate.b = 'applied'
        generated.message[0].data = 'script history'
        const edited = structuredClone(before)
        edited.name = 'Renamed'; edited.folderId = 'new-folder'; edited.scriptstate.a = 'user'
        edited.message[0].data = 'saved user history'
        harness.runtime.fullStore.get('char-1')!.set('chat-1', edited)
        const operationId = 'operation-anchor-owner-1'
        harness.primeOperation(operationId)
        const request = { ...harness.commitInput(operationId, result(generated, 'old', 'new'), 2, captured.revision), anchor: captured.anchor }
        const outcome = await owner.commitGenerationResult(request)
        expect(outcome).toMatchObject({ status: 'committed', receipt: {
            promptInputsChanged: true,
            anchoredBaseRevision: revision(edited), effects: { chat: { reason: 'concurrent-chat-edit-preserved' } },
        } })
        const stored: any = harness.runtime.fullStore.get('char-1')!.get('chat-1')
        expect(stored.message.map((m: any) => m.data)).toEqual(['saved user history', 'hello', 'new answer'])
        expect(stored.scriptstate).toEqual({ a: 'user', b: 'applied' })
        expect(harness.runtime.database.characters[0].chats[0]).toMatchObject({ name: 'Renamed', folderId: 'new-folder' })
        expect(harness.runtime.database.statics.messages).toBe(11)
        expect(harness.runtime.database.globalChatVariables.mood).toBe('new')
        expect(outbox.claim('consumer-edit-source', 3).map((row: any) => [row.event.code, row.event.reason]))
            .toEqual([['chat_edit_unreflected', 'concurrent_edit']])
        stored.message[0].data = 'later edit'
        expect(await owner.commitGenerationResult(request)).toMatchObject({ status: 'committed', reused: true })
        expect(harness.runtime.database.statics.messages).toBe(11)
        expect(await harness.makeOwner().recover(operationId)).toMatchObject({ status: 'committed' })
        expect(harness.runtime.fullStore.get('char-1')!.get('chat-1')!.message[0].data).toBe('later edit')
    })

    it('retains a committed partial answer and reconstructs its failure notice after outbox failure without replay', async () => {
        const h = makeHarness(), id = 'operation-partial-notice', before = baseChat()
        const deps = { db: h.db, kvGet: h.kvGet, kvSet: h.kvSet, kvDel: h.kvDel, kvList: h.kvList }
        const outbox = createBgNotifications(deps)
        let failing = true
        const notices = createBgOperationNotices({ ...deps, publish: (event: any) => {
            if (failing) throw Error('injected-partial-outbox-failure')
            return outbox.publish(event)
        } })
        const owner = h.makeOwner(undefined, null, { notifyCommit: notices.captureCommit })
        h.primeOperation(id)
        const request = h.commitInput(id, { ...result(withAnswer(before, 'retained partial answer', 'answer-partial'), 'old', 'new'),
            threw: 'synthetic post-main error' }, 1, revision(before))
        expect(await owner.commitGenerationResult(request)).toMatchObject({ status: 'committed' })
        expect(h.runtime.fullStore.get('char-1')!.get('chat-1').message.at(-1).data).toBe('retained partial answer')
        expect(h.runtime.database.statics.messages).toBe(11)
        expect(outbox.claim('consumer-partial-source', 3)).toEqual([])
        expect(h.kvList('internal/bg-operation-notice-intents/v1/')).toHaveLength(1)
        failing = false
        h.makeOwner(undefined, null, { notifyCommit: notices.captureCommit }).retryNotifications()
        notices.retry()
        expect(outbox.claim('consumer-partial-source', 3).map((row: any) => [row.event.code, row.event.reason]))
            .toEqual([['operation_failed', 'generation_failed']])
        expect(await owner.commitGenerationResult(request)).toMatchObject({ status: 'committed', reused: true })
        expect(h.runtime.database.statics.messages).toBe(11)
        expect(h.kvList('internal/bg-notifications/v3/')).toHaveLength(1)
    })

    it.each(['input_deleted', 'chat_deleted', 'unknown_suffix'])('retains the result without writing a chat on %s', async reason => {
        const harness = makeHarness(), owner = harness.makeOwner(), before = baseChat()
        const captured = await owner.captureBase('char-1', 'chat-1', before)
        const operationId = `operation-anchor-${reason}`
        harness.primeOperation(operationId)
        const current = structuredClone(before)
        if (reason === 'input_deleted') current.message = []
        if (reason === 'unknown_suffix') current.message.push({ role: 'user', chatId: 'unknown', data: 'later input' })
        if (reason === 'chat_deleted') harness.runtime.fullStore.get('char-1')!.delete('chat-1')
        else harness.runtime.fullStore.get('char-1')!.set('chat-1', current)
        const output = await owner.commitGenerationResult({
            ...harness.commitInput(operationId, result(withAnswer(before, 'answer', 'answer-id'), 'old', 'new'), 1, captured.revision),
            anchor: captured.anchor,
        })
        expect(output).toMatchObject({ status: 'conflict', reason })
        expect(harness.kvGet(commitStorageKey(operationId))).toBeNull()
        expect(harness.runtime.database.statics.messages).toBe(10)
        expect(harness.runtime.database.globalChatVariables.mood).toBe('old')
    })

    it('accepts the JSON transport form without changing the durable base revision', async () => {
        const harness = makeHarness()
        const stored: any = baseChat()
        stored.activeStreamingDisplayOptimizationMode = undefined
        stored.message[0].generationInfo = { model: undefined, generationId: 'generation-1' }
        stored.localLore = [{ nested: { optional: undefined, kept: null }, slots: [undefined, 'kept'] }]
        harness.runtime.fullStore.get('char-1')!.set('chat-1', stored)
        const submitted = JSON.parse(JSON.stringify(stored))
        expect(revision(stored)).not.toBe(revision(submitted))
        const owner = harness.makeOwner()
        await expect(owner.captureBase('char-1', 'chat-1', submitted)).resolves.toMatchObject({
            revision: revision(stored),
            matches: true,
        })
        const operationId = 'operation-json-transport-1'
        harness.primeOperation(operationId, 'chat-1', 'running-result-consumed')
        const after = withAnswer(submitted, 'answer', 'assistant-1')
        await expect(owner.commitGenerationResult(
            harness.commitInput(operationId, result(after, 'old', 'new'), 1, revision(stored)),
        )).resolves.toMatchObject({ status: 'committed' })
        expect(harness.runtime.fullStore.get('char-1')!.get('chat-1')).toEqual(after)
    })

    it.each(['message', 'null', 'array', 'missing'])('admits %s differences when the input anchor remains', async (change) => {
        const harness = makeHarness()
        const stored: any = baseChat()
        stored.optional = undefined
        stored.note = null
        stored.localLore = ['first', 'second']
        harness.runtime.fullStore.get('char-1')!.set('chat-1', stored)
        const submitted = JSON.parse(JSON.stringify(stored))
        if (change === 'message') submitted.message[0].data = 'edited'
        if (change === 'null') submitted.optional = null
        if (change === 'array') submitted.localLore.reverse()
        if (change === 'missing') delete submitted.note
        await expect(harness.makeOwner().captureBase('char-1', 'chat-1', submitted))
            .resolves.toMatchObject({ matches: true, anchor: { inputId: 'user-1', chat: submitted } })
    })

    it('does not accept a missing canonical chat or malformed submission', async () => {
        const owner = makeHarness().makeOwner()
        await expect(owner.captureBase('char-1', 'missing', baseChat()))
            .resolves.toMatchObject({ revision: null, matches: false })
        await expect(owner.captureBase('char-1', 'chat-1', null))
            .resolves.toMatchObject({ matches: false })
    })

    it('stops startup reconciliation after the same pending signature repeats', async () => {
        let inputPasses = 0
        let commitPasses = 0
        const recovered = await reconcileServerChatRecovery({
            serverChatInputOwner: {
                recoverAll: async () => {
                    inputPasses += 1
                    return [{
                        operationId: 'operation-c3-recovery-stalled-1',
                        status: 'blocked',
                        reason: 'settings_context_unavailable',
                    }]
                },
            },
            serverChatCommitOwner: {
                recoverAll: async () => {
                    commitPasses += 1
                    return []
                },
            },
        })

        expect(recovered).toMatchObject({
            passes: 2,
            stalled: true,
            pendingInputs: [{
                operationId: 'operation-c3-recovery-stalled-1',
                status: 'blocked',
                reason: 'settings_context_unavailable',
            }],
            pendingCommits: [],
        })
        expect(inputPasses).toBe(2)
        expect(commitPasses).toBe(2)
    })

    it('keeps ordinary startup lazy when no commit recovery row exists', async () => {
        const harness = makeHarness()
        await expect(harness.makeOwner().recoverAll()).resolves.toEqual([])
        expect(harness.runtime.ensures).toBe(0)
    })

    it('commits chat, metadata, globals, stats, and owner state without a browser save', async () => {
        const harness = makeHarness()
        const owner = harness.makeOwner()
        const operationId = 'operation-c2-owner-1'
        const before = baseChat()
        const after = withAnswer(before, 'answer one', 'assistant-1')
        harness.primeOperation(operationId, 'chat-1', 'running-result-consumed')

        await expect(owner.captureBase('char-1', 'chat-1', before)).resolves.toMatchObject({
            revision: revision(before),
            matches: true,
        })
        await expect(owner.captureBase(
            'char-1',
            'chat-1',
            { ...before, note: 'stale submission' },
        )).resolves.toMatchObject({ matches: true })

        const committed = await owner.commitGenerationResult(
            harness.commitInput(operationId, result(after, 'old', 'new'), 1, revision(before)),
        )
        expect(committed).toMatchObject({
            status: 'committed',
            reused: false,
            receipt: {
                contractVersion: 'bg_server_chat_commit.v1',
                chatCommitted: true,
                acOwner: 'disabled',
                acState: 'disabled',
                readyForNextTurn: true,
            },
        })
        expect(harness.runtime.fullStore.get('char-1')?.get('chat-1')).toEqual(after)
        expect(harness.runtime.database.characters[0].chats[0]).toEqual({
            id: 'chat-1', name: 'Synthetic chat', _stub: true, modules: [],
        })
        expect(harness.runtime.database.globalChatVariables).toEqual({ mood: 'new' })
        expect(harness.runtime.database.statics.messages).toBe(11)
        expect(harness.runtime.database[SERVER_CHAT_COMMIT_APPLIED_FIELD]).toHaveLength(1)
        expect(JSON.parse(harness.kvGet(operationStateKey(operationId)).toString('utf8')))
            .toMatchObject({ state: 'chat-committed', commitSequence: 1 })
        expect(JSON.parse(harness.kvGet(SERVER_CHAT_COMMIT_SEQUENCE_KEY).toString('utf8')))
            .toEqual({ version: 1, value: 1 })
        expect(harness.kvGet(commitStorageKey(operationId))).not.toBeNull()
        expect(owner.readEffectLineage(operationId)).toMatchObject({
            operationId,
            inputReceiptId: committed.receipt.inputReceiptId,
            storedRevision: revision(after),
            globalIntent: { changed: { mood: 'new' } },
            globalOutcomes: [{ key: 'mood', status: 'committed' }],
            staticsMessagesAppliedDelta: 1,
            statsStatus: 'committed',
        })
        await expect(owner.readChatProjection(
            'char-1',
            'chat-1',
            revision(after),
        )).resolves.toMatchObject({
            status: 'ok',
            projection: {
                contract: 'bg_chat_execution_projection.v1',
                chatRevision: revision(after),
                coverage: 'authoritative',
                owners: [{
                    messageId: 'assistant-1',
                    operationId,
                    authority: 'server',
                    acState: 'disabled',
                    automaticBackfill: 'eligible',
                }],
            },
        })
        await expect(owner.readChatProjection(
            'char-1',
            'chat-1',
            revision(before),
        )).resolves.toMatchObject({
            status: 'revision_mismatch',
            currentRevision: revision(after),
            projection: null,
        })

        const replay = await owner.commitGenerationResult(
            harness.commitInput(operationId, result(after, 'old', 'new'), 1, revision(before)),
        )
        expect(replay).toMatchObject({ status: 'committed', reused: true })
        expect(harness.runtime.database.statics.messages).toBe(11)
        expect(JSON.parse(harness.kvGet(SERVER_CHAT_COMMIT_SEQUENCE_KEY).toString('utf8')).value)
            .toBe(1)
    })

    it('reconciles edited message ownership against the requested canonical revision', async () => {
        const harness = makeHarness()
        const owner = harness.makeOwner()
        const operationId = 'operation-c3-owner-edit-1'
        const before = baseChat()
        const after = withAnswer(before, 'owned answer', 'assistant-owner-edit')
        harness.primeOperation(operationId)
        await owner.commitGenerationResult(harness.commitInput(
            operationId,
            result(after, 'old', 'new'),
            1,
            revision(before),
        ))
        const edited = {
            ...after,
            message: after.message.map((entry: any) => (
                entry.chatId === 'assistant-owner-edit'
                    ? { ...entry, data: 'user edited answer' }
                    : entry
            )),
        }
        harness.runtime.fullStore.get('char-1')?.set('chat-1', edited)

        await expect(owner.readChatProjection(
            'char-1',
            'chat-1',
            revision(edited),
        )).resolves.toMatchObject({
            status: 'ok',
            projection: {
                chatRevision: revision(edited),
                coverage: 'authoritative',
                owners: [],
            },
        })
    })

    it('keeps an exact compact receipt after legacy commit recovery is retired', async () => {
        const harness = makeHarness()
        const owner = harness.makeOwner()
        const operationId = 'operation-c2-retire-legacy-1'
        const before = baseChat()
        const after = withAnswer(before, 'retained answer', 'assistant-retired-1')
        harness.primeOperation(operationId, 'chat-1', 'running-result-consumed')
        const input = harness.commitInput(
            operationId, result(after, 'old', 'new'), 1, revision(before),
        )
        const committed = await owner.commitGenerationResult(input)
        expect(committed.status).toBe('committed')
        harness.persistRoot()
        harness.kvDel(operationStateKey(operationId))
        const later = Date.now() + 50 * 60 * 60 * 1000
        const receiptKey = 'internal/server-chat-commit-receipt/v1/'
            + Buffer.from(operationId).toString('base64url')
        harness.failNextWriteTo(receiptKey)
        await expect(owner.retireRecoveries(later))
            .rejects.toThrow('injected-owner-write-failure')
        expect(harness.kvGet(commitStorageKey(operationId))).not.toBeNull()
        expect(harness.kvGet(receiptKey)).toBeNull()
        expect(await owner.retireRecoveries(later)).toEqual([operationId])
        expect(harness.kvGet(commitStorageKey(operationId))).toBeNull()
        expect(owner.readGenerationCommit(operationId)).toMatchObject({
            status: 'committed', retired: true,
            receipt: { commitReceiptId: committed.receipt.commitReceiptId },
        })
        await expect(owner.recoverAll()).resolves.toEqual([])
        await expect(owner.readChatProjection('char-1', 'chat-1', revision(after)))
            .resolves.toMatchObject({ status: 'ok' })
        await expect(owner.commitGenerationResult(input)).resolves.toMatchObject({
            status: 'conflict', reason: 'retired_operation_identity',
        })
        expect(harness.runtime.database.statics.messages).toBe(11)
    })

    it('retires the paired input and commit only after the shared recovery horizon', async () => {
        const harness = makeHarness()
        const journal = harness.makeJournal()
        const inputOwner = harness.makeInputOwner(journal)
        const commitOwner = harness.makeOwner(journal, inputOwner)
        const operationId = 'operation-c3-retire-pair-1'
        const initial = baseChat()
        await inputOwner.admit(inputAdmission(operationId, initial, 'private input'))
        await inputOwner.beginTransform(operationId)
        const attached = await inputOwner.attachTransformed(
            operationId, inputTransform(operationId, initial, 'private input'),
        )
        const inputChat = harness.runtime.fullStore.get('char-1')?.get('chat-1') as any
        const finalChat = withAnswer(inputChat, 'paired answer', 'assistant-pair-1')
        harness.primeOperation(operationId, 'chat-1', 'running-result-consumed')
        const committed = await commitOwner.commitGenerationResult({
            ...harness.commitInput(
                operationId,
                result(finalChat, 'old', 'new'),
                inputChat.message.length,
                attached.record.executionBaseRevision,
            ),
            settingsDigest: attached.record.admission.settingsContextDigest,
            inputReceipt: attached.record.inputReceipt,
        })
        expect(committed).toMatchObject({ status: 'committed', publication: 'published' })
        harness.persistRoot()
        harness.kvDel(operationStateKey(operationId))
        const later = Date.now() + 50 * 60 * 60 * 1000
        expect(await inputOwner.retireTerminal(later)).toEqual([operationId])
        const retiredInput = harness.kvGet(commandKey(operationId))
        harness.kvSet(commandKey(operationId), '{"corrupt":true}')
        expect(await commitOwner.retireRecoveries(later)).toEqual([])
        expect(harness.kvGet(commitStorageKey(operationId))).not.toBeNull()
        const wrongInput = JSON.parse(retiredInput.toString('utf8'))
        wrongInput.inputReceiptId = '0'.repeat(64)
        const wrongBody = { ...wrongInput }
        delete wrongBody.retiredChecksum
        wrongInput.retiredChecksum = digest(wrongBody)
        harness.kvSet(commandKey(operationId), JSON.stringify(wrongInput))
        expect(await commitOwner.retireRecoveries(later)).toEqual([])
        harness.kvSet(commandKey(operationId), retiredInput)
        expect(await commitOwner.retireRecoveries(later)).toEqual([operationId])
        expect(harness.kvGet(commitStorageKey(operationId))).toBeNull()
        expect(inputOwner.read(operationId)).toMatchObject({ recordVersion: 5 })
        expect(commitOwner.readGenerationCommit(operationId)).toMatchObject({
            status: 'committed', retired: true,
            receipt: { commitReceiptId: committed.receipt.commitReceiptId },
        })
        expect(harness.runtime.database.statics.messages).toBe(11)
    })

    it('keeps metadata-present hydration absence pending instead of republishing during retirement', async () => {
        const harness = makeHarness()
        const owner = harness.makeOwner()
        const operationId = 'operation-c2-retire-deleted-chat-1'
        const before = baseChat()
        harness.primeOperation(operationId, 'chat-1', 'running-result-consumed')
        const input = harness.commitInput(
            operationId,
            result(withAnswer(before, 'answer', 'assistant-deleted-1'), 'old', 'new'),
            1,
            revision(before),
        )
        expect((await owner.commitGenerationResult(input)).status).toBe('committed')
        harness.runtime.fullStore.get('char-1')?.delete('chat-1')
        harness.kvDel(operationStateKey(operationId))
        expect(await owner.retireRecoveries(
            Date.parse(input.committedAt) + 50 * 60 * 60 * 1000,
        )).toEqual([])
        expect(harness.runtime.fullStore.get('char-1')?.has('chat-1')).toBe(false)
        expect(harness.kvGet(commitStorageKey(operationId))).not.toBeNull()
    })

    it('classifies a validated already-applied commit as absent only when both target views are absent', async () => {
        const harness = makeHarness()
        const owner = harness.makeOwner()
        const operationId = 'operation-g18-applied-absent'
        const before = baseChat()
        harness.primeOperation(operationId)
        const committed = await owner.commitGenerationResult(harness.commitInput(
            operationId, result(withAnswer(before, 'preserved journal answer', 'assistant-g18'), 'old', 'new'),
            1, revision(before),
        ))
        expect(committed).toMatchObject({ status: 'committed', publication: 'published' })
        harness.runtime.fullStore.get('char-1')?.delete('chat-1')
        harness.runtime.database.characters[0].chats = []
        const statsBefore = harness.runtime.database.statics.messages
        const globalBefore = structuredClone(harness.runtime.database.globalChatVariables)
        const journalKey = JSON.parse(harness.kvGet(commitStorageKey(operationId)).toString('utf8')).journal.storageKey
        const journalBefore = harness.kvGet(journalKey)
        const recovered = await owner.recover(operationId)
        expect(recovered).toMatchObject({ status: 'committed', publication: 'absent_applied' })
        expect(harness.runtime.database.characters[0].chats).toEqual([])
        expect(harness.runtime.fullStore.get('char-1')?.has('chat-1')).toBe(false)
        expect(harness.runtime.database.statics.messages).toBe(statsBefore)
        expect(harness.runtime.database.globalChatVariables).toEqual(globalBefore)
        expect(harness.kvGet(journalKey)).toEqual(journalBefore)
        expect((await reconcileServerChatRecovery({ serverChatInputOwner: { recoverAll: async () => [] },
            serverChatCommitOwner: owner })).stalled).toBe(false)
    })

    for (const broken of ['hydration', 'journal', 'receipt', 'sequence', 'duplicate-ledger', 'invalid-metadata']) {
        it(`retains recovery failure for an applied missing target with broken ${broken} proof`, async () => {
            const harness = makeHarness()
            const owner = harness.makeOwner()
            const operationId = 'operation-g18-proof-' + broken
            const before = baseChat()
            harness.primeOperation(operationId)
            const committed = await owner.commitGenerationResult(harness.commitInput(
                operationId, result(withAnswer(before, 'answer', 'assistant-proof'), 'old', 'new'),
                1, revision(before),
            ))
            expect(committed.status).toBe('committed')
            harness.runtime.fullStore.get('char-1')?.delete('chat-1')
            if (broken !== 'hydration') harness.runtime.database.characters[0].chats = []
            if (broken === 'journal') harness.kvDel(JSON.parse(harness.kvGet(commitStorageKey(operationId)).toString('utf8')).journal.storageKey)
            if (broken === 'receipt') harness.runtime.database[SERVER_CHAT_COMMIT_APPLIED_FIELD][0].commitReceiptId = 'different-receipt'
            if (broken === 'sequence') harness.runtime.database[SERVER_CHAT_COMMIT_APPLIED_FIELD][0].commitSequence++
            if (broken === 'duplicate-ledger') harness.runtime.database[SERVER_CHAT_COMMIT_APPLIED_FIELD].push(
                { ...harness.runtime.database[SERVER_CHAT_COMMIT_APPLIED_FIELD][0] })
            if (broken === 'invalid-metadata') delete harness.runtime.database.characters
            const recovered = await owner.recover(operationId)
            expect(recovered.publication).toBe('pending_recovery')
            expect(harness.runtime.fullStore.get('char-1')?.has('chat-1')).toBe(false)
        })
    }

    for (const persistedDeletion of [false, true]) {
        it(`requires durable absence before input-first completion and journal retirement (persisted=${persistedDeletion})`, async () => {
            const h = makeHarness(), journal = h.makeJournal()
            let commitOwner: any
            const inputOwner = h.makeInputOwner(journal, {
                recoverCompletedInput: (id: string) => commitOwner.recover(id),
            })
            commitOwner = h.makeOwner(journal, inputOwner)
            const id = 'operation-g18-durable-' + persistedDeletion
            const before = baseChat()
            await inputOwner.admit(inputAdmission(id, before, 'retained input'))
            await inputOwner.beginTransform(id)
            const attached = await inputOwner.attachTransformed(id, inputTransform(id, before, 'retained input'))
            const inputChat = h.runtime.fullStore.get('char-1')!.get('chat-1')
            h.primeOperation(id, 'chat-1', 'running-result-consumed')
            const publishMarker = inputOwner.markResultPublishedSynchronously
            inputOwner.markResultPublishedSynchronously = () => { throw new Error('injected-publication-marker-failure') }
            const committed = await commitOwner.commitGenerationResult({
                ...h.commitInput(id, result(withAnswer(inputChat, 'paid answer', 'answer-durable'), 'old', 'new'),
                    inputChat.message.length, attached.record.executionBaseRevision),
                settingsDigest: attached.record.admission.settingsContextDigest,
                inputReceipt: attached.record.inputReceipt,
            })
            expect(committed).toMatchObject({ status: 'committed', publication: 'published' })
            inputOwner.markResultPublishedSynchronously = publishMarker
            expect(inputOwner.read(id).terminal.publication).toBe('pending')
            const inputKey = inputOwner.read(id).journal.storageKey
            const commitKey = JSON.parse(h.kvGet(commitStorageKey(id)).toString('utf8')).journal.storageKey
            const inputBytes = Buffer.from(h.kvGet(inputKey)), commitBytes = Buffer.from(h.kvGet(commitKey))
            h.persistRoot()
            h.runtime.database.characters[0].chats = []
            h.runtime.fullStore.get('char-1')!.delete('chat-1')
            if (persistedDeletion) h.persistRoot()
            if (persistedDeletion) {
                h.failNextWriteTo(commandKey(id))
                expect(await inputOwner.recoverAll()).toMatchObject([{ operationId: id, status: 'pending_recovery' }])
                expect(inputOwner.read(id).terminal.targetAbsent).toBeUndefined()
                expect(h.kvGet(inputKey)).toEqual(inputBytes)
                expect(h.kvGet(commitKey)).toEqual(commitBytes)
            }
            const recovered = await inputOwner.recoverAll()
            expect(recovered).toMatchObject([{ operationId: id, status: persistedDeletion ? 'completed' : 'pending_recovery' }])
            expect(h.runtime.fullStore.get('char-1')?.has('chat-1')).toBe(false)
            expect(h.runtime.database.characters[0].chats).toEqual([])
            expect(inputOwner.read(id).terminal.publication).toBe('pending')
            expect(inputOwner.read(id).terminal.targetAbsent !== undefined).toBe(persistedDeletion)
            const incoming = structuredClone(h.runtime.database);
            incoming.globalChatVariables.mood = 'later';
            const admission = await commitOwner.recoverBeforeWrite({ incomingDatabase: incoming });
            expect(admission.allowed).toBe(persistedDeletion);
            expect(admission.recovered ?? false).toBe(false);
            expect(h.runtime.database.globalChatVariables.mood).toBe('new');
            expect(h.kvGet(inputKey)).toEqual(inputBytes)
            expect(h.kvGet(commitKey)).toEqual(commitBytes)
            h.kvDel(operationStateKey(id))
            const later = Date.now() + 50 * 60 * 60 * 1000
            if (persistedDeletion) {
                h.failNextWriteTo(inputKey)
                await expect(inputOwner.retireTerminal(later)).rejects.toThrow('injected-owner-write-failure')
                expect(inputOwner.read(id)).toMatchObject({ recordVersion: 4 })
                expect(h.kvGet(inputKey)).toEqual(inputBytes)
                expect(h.kvGet(commitKey)).toEqual(commitBytes)
            }
            expect(await inputOwner.retireTerminal(later)).toEqual(persistedDeletion ? [id] : [])
            if (persistedDeletion) {
                h.failNextWriteTo(commitKey)
                await expect(commitOwner.retireRecoveries(later)).rejects.toThrow('injected-owner-write-failure')
                expect(commitOwner.readGenerationCommit(id).retired).not.toBe(true)
                expect(h.kvGet(commitKey)).toEqual(commitBytes)
                expect(journal.size()).toBe(1)
            }
            expect(await commitOwner.retireRecoveries(later)).toEqual(persistedDeletion ? [id] : [])
            if (persistedDeletion) {
                expect(h.kvGet(inputKey)).toBeNull()
                expect(h.kvGet(commitKey)).toBeNull()
                expect(inputOwner.read(id)).toMatchObject({ recordVersion: 5 })
                expect(inputOwner.read(id)).toMatchObject({ retiredDisposition: 'applied_target_absent',
                    terminal: { publication: 'published' } })
                expect(inputOwner.read(id).terminal.publishedAt).toBeUndefined()
                const compact = Buffer.from(h.kvGet(commandKey(id)))
                expect(inputOwner.markResultPublishedSynchronously(id, committed.receipt.storedRevision)).toBe(true)
                expect(h.kvGet(commandKey(id))).toEqual(compact)
                expect(commitOwner.readGenerationCommit(id)).toMatchObject({ status: 'committed', retired: true,
                    receipt: { commitReceiptId: committed.receipt.commitReceiptId } })
                expect(journal.size()).toBe(0)
                const recreated = baseChat()
                recreated.message[0].data = 'later recreated chat'
                h.runtime.database.characters[0].chats = [{ id: 'chat-1', name: 'Recreated', _stub: true }]
                h.runtime.fullStore.get('char-1')!.set('chat-1', recreated)
                expect(await inputOwner.recoverAll()).toEqual([])
                expect(await commitOwner.recover(id)).toMatchObject({ status: 'committed', retired: true })
                expect(h.runtime.fullStore.get('char-1')!.get('chat-1')).toEqual(recreated)
                expect(inputOwner.markResultPublishedSynchronously(id, committed.receipt.storedRevision)).toBe(true)
                expect(h.kvGet(commandKey(id))).toEqual(compact)
                const next = await inputOwner.admit(inputAdmission(id + '-next', recreated, 'fresh input'))
                expect(next.status).toBe('admitted')
            } else {
                expect(h.kvGet(inputKey)).toEqual(inputBytes)
                expect(h.kvGet(commitKey)).toEqual(commitBytes)
            }
            expect(h.runtime.database.statics.messages).toBe(11)
            expect(h.runtime.database.globalChatVariables.mood).toBe('new')
        })
    }

    it('retires published new journals after a later user-message deletion without restoring that message', async () => {
        const h = makeHarness(), journal = h.makeJournal(), inputOwner = h.makeInputOwner(journal)
        const owner = h.makeOwner(journal, inputOwner), id = 'operation-g18-published-edit'
        const before = baseChat()
        await inputOwner.admit(inputAdmission(id, before, 'input later deleted'))
        await inputOwner.beginTransform(id)
        const attached = await inputOwner.attachTransformed(id, inputTransform(id, before, 'input later deleted'))
        const inputChat = h.runtime.fullStore.get('char-1')!.get('chat-1')
        h.primeOperation(id, 'chat-1', 'running-result-consumed')
        const committed = await owner.commitGenerationResult({
            ...h.commitInput(id, result(withAnswer(inputChat, 'kept answer', 'answer-kept'), 'old', 'new'),
                inputChat.message.length, attached.record.executionBaseRevision),
            settingsDigest: attached.record.admission.settingsContextDigest, inputReceipt: attached.record.inputReceipt,
        })
        expect(committed.status).toBe('committed')
        const current = h.runtime.fullStore.get('char-1')!.get('chat-1')
        current.message = current.message.filter((message: any) => message.chatId !== attached.record.inputReceipt.messageId)
        h.persistRoot(); h.kvDel(operationStateKey(id))
        const later = Date.now() + 50 * 60 * 60 * 1000
        expect(await inputOwner.retireTerminal(later)).toEqual([id])
        expect(await owner.retireRecoveries(later)).toEqual([id])
        expect(h.runtime.fullStore.get('char-1')!.get('chat-1').message.some((message: any) =>
            message.chatId === attached.record.inputReceipt.messageId)).toBe(false)
        expect(h.runtime.fullStore.get('char-1')!.get('chat-1').message.at(-1).data).toBe('kept answer')
        expect(journal.size()).toBe(0)
    })

    for (const stale of [false, true]) {
        it(`decodes the persisted root once per commit-retirement pass and defers an invalidated snapshot (stale=${stale})`, async () => {
            const h = makeHarness(), journal = h.makeJournal()
            let decodes = 0
            const owner = h.makeOwner(journal, null, { readPersistedDatabase: async () => {
                decodes++
                const bytes = Buffer.from(h.kvGet('synthetic/persisted-root'))
                const database = await decodeRisuSave(Buffer.from(bytes))
                if (stale) {
                    h.runtime.database.characters[0].description = 'newer user setting'
                    h.persistRoot()
                }
                return { database, isCurrent: () => bytes.equals(h.kvGet('synthetic/persisted-root')) }
            } })
            const ids = []
            for (let i = 0; i < 3; i++) {
                const id = 'operation-g18-root-pass-' + i, before = structuredClone(h.runtime.fullStore.get('char-1')!.get('chat-1'))
                h.primeOperation(id)
                expect((await owner.commitGenerationResult(h.commitInput(id,
                    result(withAnswer(before, 'answer-' + i, 'answer-pass-' + i), 'old', 'new'),
                    before.message.length, revision(before)))).status).toBe('committed')
                h.kvDel(operationStateKey(id)); ids.push(id)
            }
            h.persistRoot()
            const retired = await owner.retireRecoveries(Date.now() + 50 * 60 * 60 * 1000)
            expect(decodes).toBe(1)
            expect(retired.sort()).toEqual(stale ? [] : ids.sort())
            if (stale) for (const id of ids) expect(h.kvGet(commitStorageKey(id))).not.toBeNull()
        })
    }

    it('retains a missing journal candidate while retiring another healthy commit', async () => {
        const h = makeHarness(), journal = h.makeJournal()
        const healthy = 'operation-g18-z-healthy', broken = 'operation-g18-a-broken'
        const orderedKeys = (prefix: string) => h.kvList(prefix).sort((a: string, b: string) =>
            a === commitStorageKey(broken) ? -1 : b === commitStorageKey(broken) ? 1 : a.localeCompare(b))
        const owner = h.makeOwner(journal, null, { kvList: orderedKeys })
        for (const id of [healthy, broken]) {
            const before = structuredClone(h.runtime.fullStore.get('char-1')!.get('chat-1'))
            h.primeOperation(id)
            expect((await owner.commitGenerationResult(h.commitInput(id,
                result(withAnswer(before, id, 'answer-' + id), 'old', 'new'),
                before.message.length, revision(before)))).status).toBe('committed')
            h.kvDel(operationStateKey(id))
        }
        const brokenJournal = JSON.parse(h.kvGet(commitStorageKey(broken)).toString('utf8')).journal.storageKey
        h.kvDel(brokenJournal); h.persistRoot()
        expect(orderedKeys('internal/server-chat-commit/v1/')[0]).toBe(commitStorageKey(broken))
        expect(await owner.retireRecoveries(Date.now() + 50 * 60 * 60 * 1000)).toEqual([healthy])
        expect(h.kvGet(commitStorageKey(broken))).not.toBeNull()
        expect(h.kvGet(commitStorageKey(healthy))).toBeNull()
    })

    it('records a per-key conflict and preserves the newer canonical global value', async () => {
        const harness = makeHarness()
        const operationId = 'operation-c2-owner-2'
        const before = baseChat()
        const after = withAnswer(before, 'answer conflict', 'assistant-2')
        harness.runtime.database.globalChatVariables.mood = 'newer-user-value'
        harness.primeOperation(operationId)

        const committed = await harness.makeOwner().commitGenerationResult(
            harness.commitInput(operationId, result(after, 'old', 'generated-value'), 1, revision(before)),
        )
        expect(committed.receipt.effects.globals.status).toBe('conflict')
        expect(harness.runtime.database.globalChatVariables.mood).toBe('newer-user-value')
        expect(harness.runtime.database.bgOrchestrationGlobalConflicts).toMatchObject([{
            operationId,
            conflicts: [{
                key: 'mood',
                action: 'set',
                serverValue: 'generated-value',
            }],
        }])
    })

    it('recovers a cache publication failure without a second commit or stat increment', async () => {
        const harness = makeHarness()
        const owner = harness.makeOwner()
        const operationId = 'operation-c2-publish-1'
        const before = baseChat()
        const after = withAnswer(before, 'publication answer', 'assistant-publication')
        harness.primeOperation(operationId)
        harness.runtime.cacheFailures = 1

        const committed = await owner.commitGenerationResult(harness.commitInput(
            operationId,
            result(after, 'old', 'new'),
            1,
            revision(before),
        ))
        expect(committed).toMatchObject({
            status: 'committed',
            reused: false,
            publication: 'pending_recovery',
        })
        expect(harness.runtime.fullStore.get('char-1')?.get('chat-1')).toEqual(before)
        expect(harness.runtime.database.globalChatVariables).toEqual({ mood: 'old' })
        expect(harness.runtime.database.statics.messages).toBe(10)
        expect(harness.kvGet(commitStorageKey(operationId))).not.toBeNull()

        const recovered = await owner.recover(operationId)
        expect(recovered).toMatchObject({
            status: 'committed',
            reason: 'commit_recovered',
            publication: 'published',
        })
        expect(harness.runtime.fullStore.get('char-1')?.get('chat-1')).toEqual(after)
        expect(harness.runtime.database.globalChatVariables).toEqual({ mood: 'new' })
        expect(harness.runtime.database.statics.messages).toBe(11)
        expect(JSON.parse(harness.kvGet(SERVER_CHAT_COMMIT_SEQUENCE_KEY).toString('utf8')).value)
            .toBe(1)
    })

    it('recovers two unflushed commits in commit-sequence order', async () => {
        const harness = makeHarness()
        const owner = harness.makeOwner()
        const originalChat = baseChat()
        const firstChat = withAnswer(originalChat, 'first answer', 'assistant-sequence-1')
        const secondChat = withAnswer(firstChat, 'second answer', 'assistant-sequence-2')
        const firstOperation = 'operation-c2-sequence-1'
        const secondOperation = 'operation-c2-sequence-2'
        harness.primeOperation(firstOperation)
        await owner.commitGenerationResult(harness.commitInput(
            firstOperation,
            result(firstChat, 'old', 'first'),
            1,
            revision(originalChat),
        ))
        harness.primeOperation(secondOperation)
        await owner.commitGenerationResult(harness.commitInput(
            secondOperation,
            result(secondChat, 'first', 'second'),
            2,
            revision(firstChat),
        ))
        expect(harness.kvList('internal/chat-write/v1/')).toHaveLength(2)
        const schedulesBeforeAppliedReplay = harness.runtime.schedules
        await owner.recoverAll()
        expect(harness.runtime.fullStore.get('char-1')?.get('chat-1')).toEqual(secondChat)
        expect(harness.runtime.database.globalChatVariables).toEqual({ mood: 'second' })
        expect(harness.runtime.database.statics.messages).toBe(12)
        expect(harness.runtime.schedules).toBe(schedulesBeforeAppliedReplay)

        // Simulate process death before the debounced database blob persist.
        harness.runtime.database = {
            characters: [{
                chaId: 'char-1',
                chats: [{ id: 'chat-1', name: 'Synthetic chat', _stub: true, modules: [] }],
            }],
            globalChatVariables: { mood: 'old' },
            statics: { messages: 10 },
        }
        harness.runtime.fullStore = new Map([['char-1', new Map([['chat-1', originalChat]])]])
        harness.runtime.schedules = 0

        const restarted = harness.makeOwner(harness.makeJournal())
        const recovered = await restarted.recoverAll()
        expect(recovered.map((entry: any) => entry.receipt.operationId)).toEqual([
            firstOperation,
            secondOperation,
        ])
        expect(recovered.every((entry: any) => entry.publication === 'published')).toBe(true)
        expect(harness.runtime.fullStore.get('char-1')?.get('chat-1')).toEqual(secondChat)
        expect(harness.runtime.database.globalChatVariables).toEqual({ mood: 'second' })
        expect(harness.runtime.database.statics.messages).toBe(12)
        expect(harness.runtime.database[SERVER_CHAT_COMMIT_APPLIED_FIELD])
            .toMatchObject([
                { operationId: firstOperation, commitSequence: 1 },
                { operationId: secondOperation, commitSequence: 2 },
            ])
        expect(harness.runtime.schedules).toBe(2)
    })

    it('continues after the highest applied sequence restored with the database', async () => {
        const harness = makeHarness()
        const restoredOperation = 'operation-c2-restored-1'
        harness.runtime.database[SERVER_CHAT_COMMIT_APPLIED_FIELD] = [{
            operationId: restoredOperation,
            commitReceiptId: 'receipt-restored-1',
            commitSequence: 7,
        }]
        const operationId = 'operation-c2-after-restore-1'
        const before = baseChat()
        const after = withAnswer(before, 'after restore', 'assistant-after-restore')
        harness.primeOperation(operationId)

        await harness.makeOwner().commitGenerationResult(harness.commitInput(
            operationId,
            result(after, 'old', 'new'),
            1,
            revision(before),
        ))

        expect(JSON.parse(harness.kvGet(SERVER_CHAT_COMMIT_SEQUENCE_KEY).toString('utf8')))
            .toEqual({ version: 1, value: 8 })
        expect(harness.runtime.database[SERVER_CHAT_COMMIT_APPLIED_FIELD]).toMatchObject([
            { operationId: restoredOperation, commitSequence: 7 },
            { operationId, commitSequence: 8 },
        ])
    })

    it('leaves a revision conflict and cancellation uncommitted', async () => {
        const conflictHarness = makeHarness()
        const conflictOperation = 'operation-c2-conflict-1'
        const before = baseChat()
        const after = withAnswer(before, 'conflicted answer', 'assistant-conflict')
        conflictHarness.primeOperation(conflictOperation)
        conflictHarness.runtime.fullStore.get('char-1')?.set(
            'chat-1',
            { ...before, note: 'concurrent edit' },
        )
        const conflict = await conflictHarness.makeOwner().commitGenerationResult(
            conflictHarness.commitInput(
                conflictOperation,
                result(after, 'old', 'generated'),
                1,
                revision(before),
            ),
        )
        expect(conflict).toMatchObject({ status: 'conflict', reason: 'base_revision_changed' })
        expect(conflictHarness.kvGet(commitStorageKey(conflictOperation))).toBeNull()

        const cancelledHarness = makeHarness()
        const cancelledOperation = 'operation-c2-cancelled-1'
        cancelledHarness.primeOperation(cancelledOperation)
        cancelledHarness.db.prepare('UPDATE kv SET value = ? WHERE key = ?').run(
            JSON.stringify({
                operationId: cancelledOperation,
                charId: 'char-1',
                chatId: 'chat-1',
                state: 'cancelled',
            }),
            operationStateKey(cancelledOperation),
        )
        const cancelled = await cancelledHarness.makeOwner().commitGenerationResult(
            cancelledHarness.commitInput(
                cancelledOperation,
                result(after, 'old', 'generated'),
                1,
                revision(before),
            ),
        )
        expect(cancelled).toMatchObject({ status: 'cancelled', reason: 'cancel_won' })
        expect(cancelledHarness.kvGet(commitStorageKey(cancelledOperation))).toBeNull()
    })

    it('clears commit recovery plus its exact operation lifecycle on database replacement', async () => {
        const harness = makeHarness()
        const operationId = 'operation-c2-discard-1'
        const unrelatedOperation = 'operation-c2-unrelated-1'
        const before = baseChat()
        const after = withAnswer(before, 'discard answer', 'assistant-discard')
        harness.primeOperation(operationId)
        harness.primeOperation(unrelatedOperation)
        harness.kvSet(operationResultKey(operationId), JSON.stringify({ operationId }))
        harness.kvSet(operationResultKey(unrelatedOperation), JSON.stringify({
            operationId: unrelatedOperation,
        }))
        const owner = harness.makeOwner()
        await owner.commitGenerationResult(harness.commitInput(
            operationId,
            result(after, 'old', 'new'),
            1,
            revision(before),
        ))
        expect(harness.kvGet(commitStorageKey(operationId))).not.toBeNull()
        owner.discardRecovery()
        expect(harness.kvGet(commitStorageKey(operationId))).toBeNull()
        expect(harness.kvGet(SERVER_CHAT_COMMIT_SEQUENCE_KEY)).toBeNull()
        expect(harness.kvGet(operationStateKey(operationId))).toBeNull()
        expect(harness.kvGet(operationResultKey(operationId))).toBeNull()
        expect(harness.kvGet(operationStateKey(unrelatedOperation))).not.toBeNull()
        expect(harness.kvGet(operationResultKey(unrelatedOperation))).not.toBeNull()
        expect(harness.kvList('internal/chat-write/v1/')).toHaveLength(1)
    })

    it('retains the volatile settings context when a later commit write rolls back', async () => {
        const harness = makeHarness()
        const journal = harness.makeJournal()
        const inputOwner = harness.makeInputOwner(journal)
        const commitOwner = harness.makeOwner(journal, inputOwner)
        const operationId = 'operation-c3-rollback-settings-1'
        const initial = baseChat()

        await inputOwner.admit(inputAdmission(operationId, initial, 'next input'))
        await inputOwner.beginTransform(operationId)
        const attached = await inputOwner.attachTransformed(
            operationId,
            inputTransform(operationId, initial, 'next input'),
        )
        const inputChat = attached.record
            ? harness.runtime.fullStore.get('char-1')?.get('chat-1')
            : null
        const finalChat = withAnswer(inputChat, 'answer after input', 'assistant-rollback-1')
        harness.primeOperation(operationId, 'chat-1', 'running-result-consumed')
        harness.failNextWriteTo(SERVER_CHAT_COMMIT_SEQUENCE_KEY)

        await expect(commitOwner.commitGenerationResult({
            ...harness.commitInput(
                operationId,
                result(finalChat, 'old', 'new'),
                inputChat.message.length,
                attached.record.executionBaseRevision,
            ),
            settingsDigest: attached.record.admission.settingsContextDigest,
            inputReceipt: attached.record.inputReceipt,
        })).rejects.toThrow('Server chat commit transaction failed')

        expect(inputOwner.read(operationId)).toMatchObject({
            inputState: 'attached',
            terminal: null,
        })
        expect(inputOwner.loadSettingsSnapshot(operationId)).toMatchObject({
            status: 'ready',
            contextDigest: attached.record.admission.settingsContextDigest,
        })
        expect(inputOwner.settingsSnapshotStats()).toMatchObject({ contexts: 1 })
        expect(harness.kvGet(commitStorageKey(operationId))).toBeNull()
    })

    it('reconciles input and response journals in causal passes after restart', async () => {
        const harness = makeHarness()
        const journal = harness.makeJournal()
        const inputOwner = harness.makeInputOwner(journal)
        const commitOwner = harness.makeOwner(journal, inputOwner)
        const firstOperation = 'operation-c3-recovery-chain-1'
        const secondOperation = 'operation-c3-recovery-chain-2'
        const initial = baseChat()

        await inputOwner.admit(inputAdmission(firstOperation, initial, 'first input'))
        await inputOwner.beginTransform(firstOperation)
        const firstAttached = await inputOwner.attachTransformed(
            firstOperation,
            inputTransform(firstOperation, initial, 'first input'),
        )
        const firstInputChat = structuredClone(
            harness.runtime.fullStore.get('char-1')?.get('chat-1'),
        )
        const firstResultChat = withAnswer(
            firstInputChat,
            'first answer',
            'assistant-recovery-chain-1',
        )
        harness.primeOperation(firstOperation, 'chat-1', 'running-result-consumed')
        await commitOwner.commitGenerationResult({
            ...harness.commitInput(
                firstOperation,
                result(firstResultChat, 'old', 'new'),
                firstInputChat.message.length,
                firstAttached.record.executionBaseRevision,
            ),
            settingsDigest: firstAttached.record.admission.settingsContextDigest,
            inputReceipt: firstAttached.record.inputReceipt,
        })

        await inputOwner.admit(inputAdmission(secondOperation, firstResultChat, 'second input'))
        await inputOwner.beginTransform(secondOperation)
        await inputOwner.attachTransformed(
            secondOperation,
            inputTransform(secondOperation, firstResultChat, 'second input'),
        )

        harness.runtime.database = {
            characters: [{
                chaId: 'char-1',
                chats: [{ id: 'chat-1', name: 'Synthetic chat', _stub: true, modules: [] }],
            }],
            globalChatVariables: { mood: 'old' },
            statics: { messages: 10 },
        }
        harness.runtime.fullStore = new Map([
            ['char-1', new Map([['chat-1', initial]])],
        ])

        const restartedJournal = harness.makeJournal()
        const restartedInputOwner = harness.makeInputOwner(restartedJournal)
        const restartedCommitOwner = harness.makeOwner(
            restartedJournal,
            restartedInputOwner,
        )
        const recovered = await reconcileServerChatRecovery({
            serverChatInputOwner: restartedInputOwner,
            serverChatCommitOwner: restartedCommitOwner,
        })

        expect(recovered).toMatchObject({ stalled: false })
        expect(recovered.passes).toBeGreaterThanOrEqual(2)
        expect(recovered.pendingInputs).toEqual([])
        expect(recovered.pendingCommits).toEqual([])
        expect(harness.runtime.fullStore.get('char-1')?.get('chat-1')?.message
            .map((message: any) => message.chatId)).toEqual([
            'user-1',
            `user-${firstOperation}`,
            'assistant-recovery-chain-1',
            `user-${secondOperation}`,
        ])
        expect(restartedInputOwner.read(secondOperation)).toMatchObject({
            inputState: 'attached',
        })
    })
})
