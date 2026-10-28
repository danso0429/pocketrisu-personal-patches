import fs from 'node:fs'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'

const source = ts.createSourceFile(
    'globalApi.svelte.ts',
    fs.readFileSync('src/ts/globalApi.svelte.ts', 'utf8'),
    ts.ScriptTarget.Latest,
    true,
)
const saveDb = source.statements.find(
    node => ts.isFunctionDeclaration(node) && node.name?.text === 'saveDb',
) as ts.FunctionDeclaration
const persistNode = saveDb.body?.statements.find(
    node => ts.isFunctionDeclaration(node) && node.name?.text === 'persistTrackedChanges',
) as ts.FunctionDeclaration
const persistJs = ts.transpileModule(persistNode.getText(source), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText

class ConflictError extends Error {
    code?: string
    currentEtag?: string
}
class SaveRejectedError extends Error {}

function appearanceSaveFailure(ambiguous: boolean): Error & { ambiguous: boolean } {
    return Object.assign(new Error('personal appearance save failed'), { ambiguous })
}

type PatchResult = {
    success: boolean
    etag?: string
    conflictCode?: string
    conflictError?: string
    chatGuardRejected?: boolean
    hashDiagnostics?: unknown
    persistWarning?: unknown
    serverTimings?: unknown
}

function nativeHarness(options: {
    supportsPatchSync?: boolean
    currentEtag?: string | null
    patchResult?: PatchResult
    patchReject?: Error
} = {}) {
    const events: string[] = []
    const db = { characters: [], modules: [], value: 'current' }
    const patcher = {
        lastSyncedDb: { characters: [], modules: [], value: 'baseline' },
        baselineArchivedCharacterIds: () => new Set<string>(),
        baselineDb: () => structuredClone(db),
        set: vi.fn(async () => {
            events.push('patch-build')
            return { patch: [{ op: 'replace', path: '/value', value: db.value }], expectedHash: 'baseline' }
        }),
        changedCharacterIdsOfLastSet: () => [],
        estimatePayloadBytes: () => 1,
        init: vi.fn(async (_baseline?: unknown) => { events.push('baseline-restored') }),
        describeHashMismatch: () => ({}),
    }
    const storage = {
        getDbEtag: vi.fn(() => options.currentEtag === undefined ? 'etag-current' : options.currentEtag),
        setDbEtag: vi.fn(),
        patchItem: vi.fn(async () => {
            events.push('patch')
            if (options.patchReject) throw options.patchReject
            return options.patchResult ?? { success: true, etag: 'etag-next' }
        }),
        setItem: vi.fn(async (_key: string, _bytes: Uint8Array, etag?: string) => {
            events.push(`full-write:${etag ?? 'unguarded'}`)
        }),
    }
    class RisuSaveEncoder {
        async init() {}
        async set() {}
        encode() { return new TextEncoder().encode(JSON.stringify(db)).buffer }
    }
    const context = {
        gotChannel: false,
        channel: null,
        sessionID: 'test-session',
        sleep: async () => {},
        getDatabase: () => db,
        collectChatsToPersist: () => [],
        supportsPatchSync: options.supportsPatchSync ?? true,
        patcher,
        safeStructuredClone: structuredClone,
        hasAmbiguousCharacterIds: () => false,
        findDangerousChatOps: () => [],
        forageStorage: storage,
        recordDbTransferSize: () => {},
        updateKnownChatsAfterSuccessfulSave: () => {},
        rebaseTrackedLocalChangesOnLatestServerDb: vi.fn(async () => { events.push('rebase') }),
        withTrackedCharacters: (changes: unknown) => changes,
        showPersistWarningOnce: () => {},
        showChatGuardToastThrottled: () => {},
        isChatGuardDebugEnabled: () => false,
        CHAT_GUARD_DEBUG_KEY: 'test',
        selectedCharID: { subscribe: () => () => {} },
        classifyChat: () => 'fixture',
        chatToStub: (value: unknown) => value,
        summarizeHashMismatch: () => '',
        addLog: () => {},
        RisuSaveEncoder,
        decodeRisuSave: async () => db,
        resyncBaselineAfterFullWrite: async () => {},
        ConflictError,
        SaveRejectedError,
        appearanceSaveFailure,
        savetrys: 0,
        // Free identifiers added by lazy-chat-sync (absent in native 1.16.1).
        // Neutral for a save that posts no chats; unused when the function lacks them.
        recreateOnRetryKey: null as string | null,
        missingPayloadRecoveryKey: null as string | null,
        assignMissingChatIdsToNewCharacters: () => [] as { chaId: string, chatId: string }[],
        confirmedChatBaseline: () => new Map<string, Set<string>>(),
        v4: () => 'test-uuid',
        classifyChatSaveIntent: () => 'update',
        ChatConflictError: class ChatConflictError extends Error {},
        ManualSaveConflictError: class ManualSaveConflictError extends Error {},
        DatabaseInvariantError: class DatabaseInvariantError extends Error {
            missingFullChat: unknown = undefined
        },
        retryAfterInvariantRejection: async () => 'retry' as const,
        knownChatIdsByCharacter: new Map<string, Set<string>>(),
        errorMessage: (e: unknown) => String(e),
        saveChatToServer: async () => 'saved',
    }
    const persist = new Function(
        ...Object.keys(context),
        `${persistJs}; return persistTrackedChanges`,
    )(...Object.values(context)) as (changes: Record<string, unknown>, timing: Record<string, unknown>, saveOptions?: Record<string, boolean>) => Promise<'saved' | 'retry' | 'noop'>
    const changes = {
        root: true,
        character: [],
        chat: [],
        botPreset: false,
        modules: false,
        plugins: false,
        pluginCustomStorage: false,
    }
    return {
        db,
        events,
        patcher,
        storage,
        persist,
        run: (saveOptions?: Record<string, boolean>) => persist(changes, {}, saveOptions),
    }
}

// Finds whatever registers the strict writer: any call to the public
// `registerAppearanceWriter` export, wherever it sits in the native file.
function registrationText(): string | null {
    const visit = (node: ts.Node): ts.CallExpression | null => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
            && node.expression.text === 'registerAppearanceWriter') return node
        return ts.forEachChild(node, visit) ?? null
    }
    const call = visit(source)
    if (!call) return null
    const writerArg = call.arguments[0]
    let prelude = ''
    if (writerArg && ts.isIdentifier(writerArg)) {
        const name = writerArg.text
        const declaration = (function find(node: ts.Node): ts.Node | null {
            if (ts.isFunctionDeclaration(node) && node.name?.text === name) return node
            if (ts.isVariableStatement(node)
                && node.declarationList.declarations.some(item => ts.isIdentifier(item.name) && item.name.text === name)) return node
            return ts.forEachChild(node, find) ?? null
        })(source)
        if (declaration) prelude = `${declaration.getText(source)}\n`
    }
    return ts.transpileModule(`${prelude}${call.getText(source)}`, {
        compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText
}

function registeredWriterHarness(options: Parameters<typeof nativeHarness>[0] & {
    prior?: Promise<void>
    flushReject?: Error
} = {}) {
    const registration = registrationText()
    expect(registration, 'the native save path registers the Personal strict writer through registerAppearanceWriter').not.toBeNull()
    if (!registration) throw new Error('Personal strict writer registration missing')

    const native = nativeHarness(options)
    let writer!: (
        mutate: () => () => void,
        verify: () => void,
        progress?: (stage: string) => void,
    ) => Promise<void>
    const persistedArguments: unknown[][] = []
    const wrapperEvents: string[] = []
    const context = {
        saveInFlight: options.prior ?? null,
        supportsPatchSync: options.supportsPatchSync ?? true,
        safeStructuredClone: structuredClone,
        patcher: native.patcher,
        registerAppearanceWriter: (value: typeof writer) => { writer = value },
        tick: async () => {},
        changeTracker: { root: false },
        takeTrackedChanges: () => ({
            root: true, character: [], chat: [], botPreset: false,
            modules: false, plugins: false, pluginCustomStorage: false,
        }),
        saving: { state: false },
        persistTrackedChanges: async (...args: unknown[]) => {
            persistedArguments.push(args)
            wrapperEvents.push('persist')
            return native.persist(
                args[0] as Record<string, unknown>,
                args[1] as Record<string, unknown>,
                args[2] as Record<string, boolean> | undefined,
            )
        },
        forageStorage: {
            realStorage: {
                flushPersonalAppearance: async () => {
                    wrapperEvents.push('flush')
                    if (options.flushReject) throw options.flushReject
                },
            },
        },
        requeueTrackedChanges: () => { wrapperEvents.push('requeue') },
        changed: false,
        appearanceSaveFailure,
    }
    new Function(...Object.keys(context), registration)(...Object.values(context))
    const state = { value: 'before' }
    const save = () => writer(
        () => {
            wrapperEvents.push('mutate')
            state.value = 'after'
            return () => {
                wrapperEvents.push('undo')
                state.value = 'before'
            }
        },
        () => { wrapperEvents.push('verify') },
    )
    return { ...native, persistedArguments, wrapperEvents, state, save }
}

describe('[E2-4d] Rebase personal-settings onto PocketRisu 1.16.1', () => {
    it('[new] exposes the 1.10 appearance persistence module symbols', async () => {
        const modulePath = './personalSettings/appearancePersistence'
        const persistence = await import(/* @vite-ignore */ modulePath).catch(() => null)
        expect(persistence, 'appearancePersistence module exists after the rebase').not.toBeNull()
        if (!persistence) return
        expect(persistence).toMatchObject({
            registerAppearanceWriter: expect.any(Function),
            saveAppearanceStrict: expect.any(Function),
            appearanceSaveFailure: expect.any(Function),
        })
    })

    it('[new] uses native three-argument persistence, patch sync, and an awaited flush before success', async () => {
        const h = registeredWriterHarness()
        await h.save()
        expect(h.persistedArguments).toHaveLength(1)
        expect(h.persistedArguments[0]).toHaveLength(3)
        expect(h.persistedArguments[0][2]).toEqual({ personalStrict: true })
        expect(h.wrapperEvents).toEqual(['verify', 'mutate', 'persist', 'flush', 'verify'])
        expect(h.events).toContain('patch')
        expect(h.events.some(event => event.startsWith('full-write:'))).toBe(false)
    })

    it.each([
        ['foreign ETag conflict', { success: false, etag: 'etag-foreign' }],
        ['validation rejection', { success: false, conflictCode: 'VALIDATION_REJECTED', conflictError: 'invalid' }],
        ['chat guard rejection', { success: false, chatGuardRejected: true }],
    ] as const)('[new] rejects a strict %s before rebase or full-write fallback', async (_name, patchResult) => {
        const h = nativeHarness({ patchResult })
        const outcome = await h.run({ personalStrict: true }).catch(error => error)
        expect(outcome).toMatchObject({ ambiguous: false })
        expect(h.events).not.toContain('rebase')
        expect(h.events.some(event => event.startsWith('full-write:'))).toBe(false)
    })

    it('[new] rolls back both edited values and the patch baseline after a definite rejection', async () => {
        const h = registeredWriterHarness({ patchResult: { success: false, conflictCode: 'VALIDATION_REJECTED' } })
        await expect(h.save()).rejects.toMatchObject({ ambiguous: false })
        expect(h.state.value).toBe('before')
        expect(h.wrapperEvents).toContain('undo')
        expect(h.events).toContain('baseline-restored')
        expect(h.patcher.init.mock.calls.at(-1)?.[0]).toMatchObject({ value: 'baseline' })
    })

    it.each([
        ['lost patch response', { patchReject: new Error('lost response') }],
        ['flush failure', { flushReject: new Error('flush failed') }],
    ])('[new] preserves edited values but restores the patch baseline after %s', async (_name, failure) => {
        const h = registeredWriterHarness(failure)
        await expect(h.save()).rejects.toMatchObject({ ambiguous: true })
        expect(h.state.value).toBe('after')
        expect(h.wrapperEvents).not.toContain('undo')
        expect(h.wrapperEvents).toContain('requeue')
        expect(h.events).toContain('baseline-restored')
        expect(h.patcher.init.mock.calls.at(-1)?.[0]).toMatchObject({ value: 'baseline' })
    })

    it('[new] allows a guarded full write without patch sync and flushes it', async () => {
        const h = registeredWriterHarness({ supportsPatchSync: false, currentEtag: 'etag-current' })
        await h.save()
        expect(h.events).toContain('full-write:etag-current')
        expect(h.wrapperEvents).toContain('flush')
    })

    it('[new] refuses a strict no-patch-sync save when no ETag can guard the full write', async () => {
        const h = registeredWriterHarness({ supportsPatchSync: false, currentEtag: null })
        await expect(h.save()).rejects.toMatchObject({ ambiguous: false })
        expect(h.events).not.toContain('full-write:unguarded')
        expect(h.wrapperEvents).not.toContain('flush')
    })

    it('[new] starts the Personal save only after an in-flight ordinary save settles', async () => {
        let release!: () => void
        const h = registeredWriterHarness({ prior: new Promise<void>(resolve => { release = resolve }) })
        const save = h.save()
        await Promise.resolve()
        expect(h.wrapperEvents, 'mutation waits for the ordinary save').not.toContain('mutate')
        expect(h.wrapperEvents, 'persistence waits for the ordinary save').not.toContain('persist')
        release()
        await save
        expect(h.wrapperEvents).toContain('mutate')
        expect(h.wrapperEvents).toContain('persist')
        expect(h.wrapperEvents.indexOf('mutate')).toBeLessThan(h.wrapperEvents.indexOf('persist'))
    })

    it('[unchanged] keeps the native ordinary-save full-write fallback when strict mode is absent', async () => {
        const h = nativeHarness({ patchResult: { success: false } })
        await expect(h.run()).resolves.toBe('saved')
        expect(h.events).toContain('full-write:etag-current')
    })
})
