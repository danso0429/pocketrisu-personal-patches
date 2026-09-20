import { afterEach, describe, expect, test, vi } from 'vitest'
import fs from 'node:fs'
import ts from 'typescript'
import { applyPatch } from 'fast-json-patch'
import {
    classifyChatSaveIntent,
    collectUnconfirmedChatPayloads,
    findRecoverableChatPayload,
} from './chatSaveIntent'
import { assignMissingChatIdsToNewCharacters } from './chatIdentityRepair'
import chatDelta from '../../../server/node/chatDelta.cjs'

vi.mock('./database.svelte', () => ({ createBotPresetTemplate: () => ({}) }))
vi.mock('../globalApi.svelte', () => ({ forageStorage: { realStorage: null } }))
vi.mock('./chatStorage', async () => {
    const source = ts.createSourceFile(
        'chatStorage.ts',
        fs.readFileSync('src/ts/storage/chatStorage.ts', 'utf8'),
        ts.ScriptTarget.Latest,
        true,
    )
    const declaration = source.statements.find((node) =>
        ts.isFunctionDeclaration(node) && node.name?.text === 'chatToStub'
    )
    if (!declaration) throw new Error('Composed chatStorage.ts has no chatToStub function')
    const javascript = ts.transpile(
        declaration.getText(source).replace(/^export /, ''),
        { target: ts.ScriptTarget.ES2022 },
    )
    const chatToStub = new Function(
        'isChatStub',
        `${javascript}; return chatToStub;`,
    )((chat: any) => chat?._stub === true)
    return { chatToStub }
})

const {
    RisuSaveEncoder,
    RisuSavePatcher,
    normalizeJSON,
    decodeRisuSave,
    findDangerousChatOps,
} = await import('./risuSave')

type ChatIdentity = { chaId: string, chatId: string }
type HarnessOptions = {
    baselineChats?: any[]
    currentChats?: any[]
    failPayloadIds?: string[]
    mutateDuringPayload?: (state: { current: any, chatId: string }) => void
    forcedPatchRejections?: Array<ChatIdentity | null>
    rejectInvariantAlways?: boolean
    payloadGate?: Promise<void>
}

const sourceText = fs.readFileSync('src/ts/globalApi.svelte.ts', 'utf8')
const source = ts.createSourceFile(
    'globalApi.svelte.ts',
    sourceText,
    ts.ScriptTarget.Latest,
    true,
)
const saveDb = source.statements.find((node) =>
    ts.isFunctionDeclaration(node) && node.name?.text === 'saveDb'
) as ts.FunctionDeclaration | undefined
if (!saveDb?.body) throw new Error('Composed globalApi.svelte.ts has no saveDb body')

const requiredFunctions = [
    'queueTrackedChat',
    'requeueTrackedChanges',
    'takeTrackedChanges',
    'hasTrackedChanges',
    'collectChatsToPersist',
    'updateKnownChatsAfterSuccessfulSave',
    'persistTrackedChanges',
    'triggerSave',
    'scheduleDeferredRecovery',
]
const functionDeclarations = requiredFunctions.map((name) => {
    const declaration = saveDb.body!.statements.find((node) =>
        ts.isFunctionDeclaration(node) && node.name?.text === name
    )
    if (!declaration) throw new Error(`Composed saveDb is missing ${name}`)
    return declaration
})
const scheduler = saveDb.body.statements.find(ts.isWhileStatement)
if (!scheduler) throw new Error('Composed saveDb is missing its autosave scheduler')

const durableSaveAssignment = saveDb.body.statements.find((node) =>
    ts.isExpressionStatement(node)
    && node.getText(source).startsWith('requestDurableSaveImpl = async')
)
if (!durableSaveAssignment) {
    throw new Error('Final composed saveDb is missing the BG durable save implementation')
}

function findWakeCallback(
    owner: 'window' | 'document',
    event: 'online' | 'visibilitychange',
    requiredText: string,
): ts.ArrowFunction {
    let result: ts.ArrowFunction | undefined
    const visit = (node: ts.Node) => {
        if (
            ts.isCallExpression(node)
            && ts.isPropertyAccessExpression(node.expression)
            && ts.isIdentifier(node.expression.expression)
            && node.expression.expression.text === owner
            && node.expression.name.text === 'addEventListener'
            && ts.isStringLiteral(node.arguments[0])
            && node.arguments[0].text === event
            && ts.isArrowFunction(node.arguments[1])
            && node.arguments[1].getText(source).includes(requiredText)
        ) {
            result = node.arguments[1]
        }
        ts.forEachChild(node, visit)
    }
    visit(saveDb)
    if (!result) throw new Error(`Composed saveDb is missing the ${event} wake callback`)
    return result
}

const onlineWake = findWakeCallback('window', 'online', 'hasTrackedChanges(changeTracker)')
const visibilityWake = findWakeCallback(
    'document',
    'visibilitychange',
    "document.visibilityState === 'hidden'",
)

const extractedJavascript = ts.transpile(
    [
        ...functionDeclarations.map((node) => node.getText(source)),
        durableSaveAssignment.getText(source),
        `const onlineWake = ${onlineWake.getText(source)};`,
        `const visibilityWake = ${visibilityWake.getText(source)};`,
        `async function runAutosaveScheduler() { ${scheduler.getText(source)} }`,
    ].join('\n'),
    { target: ts.ScriptTarget.ES2022 },
)

function emptyChanges() {
    return {
        character: [] as string[],
        chat: [] as [string, string][],
        root: true,
        modules: false,
        botPreset: false,
        plugins: false,
        pluginCustomStorage: false,
    }
}

function fullChat(id: string, data = '') {
    return {
        id,
        name: id,
        message: data ? [{ role: 'user', data }] : [],
    }
}

async function createHarness(options: HarnessOptions = {}) {
    const baseline = {
        characters: [{ chaId: 'character', chats: structuredClone(options.baselineChats ?? []) }],
        botPresets: [],
        modules: [],
        plugins: [],
        pluginCustomStorage: {},
        language: 'en',
    }
    const current = structuredClone(baseline)
    current.characters[0].chats = structuredClone(
        options.currentChats ?? [fullChat('chat-a')],
    )
    let serverDb: any = structuredClone(baseline)
    let forcedPatchIndex = 0
    const payloads = new Map<string, any>()
    const events: string[] = []
    const alerts: unknown[] = []
    const flushes: boolean[] = []
    const idleWaiters: Array<{ resolve: () => void, reject: (error: Error) => void }> = []
    const sleeps: number[] = []
    const failPayloadIds = new Set(options.failPayloadIds ?? [])
    let payloadGateUsed = false

    for (const existing of options.baselineChats ?? []) {
        if (existing && Array.isArray(existing.message)) {
            payloads.set(existing.id, structuredClone(existing))
        }
    }

    const encoder = new RisuSaveEncoder()
    await encoder.init(baseline)
    const patcher = new RisuSavePatcher()
    await patcher.init(baseline)
    const changeTracker = { ...emptyChanges(), root: false }

    const sleep = async (delayMs: number) => {
        sleeps.push(delayMs)
        if (delayMs !== 200) return
        await new Promise<void>((resolve, reject) => {
            idleWaiters.push({ resolve, reject })
        })
    }

    class ConflictError extends Error {}
    class ManualSaveConflictError extends Error {}

    const forageStorage = {
        setDbEtag() {},
        getDbEtag() { return 'test-etag' },
        async flushDatabase() { flushes.push(true) },
        async patchItem(_key: string, patch: any) {
            events.push('metadata:patch')
            const forced = options.forcedPatchRejections?.[forcedPatchIndex++]
            if (forced) {
                return {
                    success: false,
                    validationRejected: true,
                    error: `forced missing payload ${forced.chaId}/${forced.chatId}`,
                    missingFullChat: forced,
                }
            }

            const nextDb = applyPatch(
                structuredClone(serverDb),
                patch.patch,
                true,
            ).newDocument
            try {
                chatDelta.validateStrippedDatabaseTransition(
                    serverDb,
                    nextDb,
                    (_chaId: string, chatId: string) =>
                        !options.rejectInvariantAlways && payloads.has(chatId),
                )
            }
            catch (error: any) {
                return {
                    success: false,
                    validationRejected: true,
                    error: error.message,
                    missingFullChat: { chaId: error.chaId, chatId: error.chatId },
                }
            }
            serverDb = nextDb
            return { success: true, etag: `accepted-${events.length}` }
        },
        async setItem(_key: string, bytes: Uint8Array) {
            events.push('metadata:full')
            const nextDb = await decodeRisuSave(bytes)
            chatDelta.validateStrippedDatabaseTransition(
                serverDb,
                nextDb,
                (_chaId: string, chatId: string) =>
                    !options.rejectInvariantAlways && payloads.has(chatId),
            )
            serverDb = nextDb
        },
    }

    const context: Record<string, any> = {
        gotChannel: false,
        channel: null,
        sessionID: 'test-session',
        getDatabase: () => current,
        knownChatIdsByCharacter: new Map([
            ['character', new Set((options.baselineChats ?? []).map(chat => chat?.id).filter(Boolean))],
        ]),
        missingPayloadRecoveryKey: null,
        lastConfirmedServerDb: baseline,
        changeTracker,
        encoder,
        patcher,
        supportsPatchSync: true,
        assignMissingChatIdsToNewCharacters,
        v4: () => { throw new Error('Unexpected chat ID repair') },
        collectUnconfirmedChatPayloads,
        classifyChatSaveIntent,
        findRecoverableChatPayload,
        safeStructuredClone: structuredClone,
        normalizeJSON,
        decodeRisuSave,
        findDangerousChatOps,
        sleep,
        savetrys: 0,
        ConflictError,
        saveInFlight: null,
        changed: false,
        saving: { state: false },
        deferredFailureRetries: 0,
        deferredRecoveryTimer: null,
        ManualSaveConflictError,
        alertError: (error: unknown) => alerts.push(error),
        forageStorage,
        showPersistWarningOnce() {},
        showChatGuardToastThrottled() {},
        isChatGuardDebugEnabled: () => false,
        rebaseTrackedLocalChangesOnLatestServerDb: async () => {
            throw new Error('Unexpected conflict rebase')
        },
        requiresFullEncoderReload: { state: false },
        tick: async () => {},
        requestDurableSaveImpl: async () => {
            throw new Error('Durable save implementation was not composed')
        },
        completeBgDurableSave: async (committed: boolean, flush: () => Promise<void>) => {
            if (!committed) throw new Error('durable save deferred; orchestration result retained')
            await flush()
        },
        async saveChatToServer(
            _chaId: string,
            _index: number,
            chatId: string,
            payload: any,
            intent: string,
        ) {
            events.push(`payload:${chatId}:${intent}`)
            if (options.payloadGate && !payloadGateUsed) {
                payloadGateUsed = true
                await options.payloadGate
            }
            options.mutateDuringPayload?.({ current, chatId })
            if (failPayloadIds.has(chatId)) {
                throw new Error(`Injected payload failure for ${chatId}`)
            }
            payloads.set(chatId, structuredClone(payload))
        },
    }

    const factory = new Function(
        ...Object.keys(context),
        `${extractedJavascript}
        return {
            persistTrackedChanges,
            takeTrackedChanges,
            triggerSave,
            runAutosaveScheduler,
            scheduleDeferredRecovery,
            onlineWake,
            visibilityWake,
            durableSave: (scope) => requestDurableSaveImpl(scope),
            queueRoot: () => { changeTracker.root = true; changed = true },
            queueChat: (chaId, chatId) => { queueTrackedChat(chaId, chatId); changed = true },
            setChanged: (value) => { changed = value },
            state: () => ({
                changed,
                recoveryKey: missingPayloadRecoveryKey,
                tracker: safeStructuredClone(changeTracker),
                confirmed: safeStructuredClone(lastConfirmedServerDb),
                saveInFlight,
            }),
        };`,
    )
    const runtime = factory(...Object.values(context))

    return {
        runtime,
        current,
        events,
        alerts,
        flushes,
        payloads,
        sleeps,
        idleWaiters,
        serverDb: () => structuredClone(serverDb),
    }
}

async function waitForIdleWaiter(
    harness: Awaited<ReturnType<typeof createHarness>>,
    previousCount: number,
) {
    for (let i = 0; i < 1_000; i += 1) {
        if (harness.idleWaiters.length > previousCount) return
        await Promise.resolve()
    }
    throw new Error('Autosave scheduler did not reach its idle wait')
}

afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
})

describe('composed chat save persistence', () => {
    test('S01 saves an untracked empty payload before publishing metadata', async () => {
        const harness = await createHarness()

        await expect(harness.runtime.persistTrackedChanges(emptyChanges()))
            .resolves.toBe('saved')

        expect(harness.events).toEqual([
            'payload:chat-a:create',
            'metadata:patch',
        ])
        expect(harness.serverDb().characters[0].chats[0].id).toBe('chat-a')
    })

    test('S02 enlists only the new full chat from mixed payload shapes', async () => {
        const existing = fullChat('existing', 'saved')
        const placeholder = { id: 'placeholder', name: 'Placeholder', _placeholder: true, message: [] }
        const metadataOnly = { id: 'metadata-only', name: 'Metadata only', _stub: true }
        const harness = await createHarness({
            baselineChats: [
                { id: 'existing', name: 'existing', _stub: true },
                { id: 'placeholder', name: 'Placeholder', _stub: true },
                { id: 'metadata-only', name: 'Metadata only', _stub: true },
            ],
            currentChats: [existing, placeholder, metadataOnly, fullChat('new-empty')],
        })

        await expect(harness.runtime.persistTrackedChanges(emptyChanges()))
            .resolves.toBe('saved')

        expect(harness.events.filter(event => event.startsWith('payload:')))
            .toEqual(['payload:new-empty:create'])
        expect(harness.payloads.has('placeholder')).toBe(false)
        expect(harness.payloads.has('metadata-only')).toBe(false)
    })

    test('S03 recovers a chat inserted across the payload await and clears state after metadata approval', async () => {
        const harness = await createHarness({
            mutateDuringPayload: ({ current, chatId }) => {
                if (chatId === 'chat-a' && !current.characters[0].chats.some((chat: any) => chat.id === 'chat-b')) {
                    current.characters[0].chats.push(fullChat('chat-b'))
                }
            },
        })

        await expect(harness.runtime.persistTrackedChanges(emptyChanges()))
            .resolves.toBe('retry')
        expect(harness.runtime.state().recoveryKey).toBe('character|chat-b')
        expect(harness.runtime.state().confirmed.characters[0].chats).toHaveLength(0)

        await expect(harness.runtime.persistTrackedChanges(harness.runtime.takeTrackedChanges()))
            .resolves.toBe('saved')
        expect(harness.runtime.state().recoveryKey).toBeNull()
        expect(harness.serverDb().characters[0].chats.map((chat: any) => chat.id))
            .toEqual(['chat-a', 'chat-b'])
    })

    test('S04 limits dedicated recovery but preserves the real outer scheduler policy', async () => {
        vi.useFakeTimers()
        const harness = await createHarness({ rejectInvariantAlways: true })
        harness.runtime.queueRoot()

        const schedulerRun = harness.runtime.runAutosaveScheduler()
        await waitForIdleWaiter(harness, 0)
        expect(harness.events.filter(event => event === 'metadata:patch')).toHaveLength(5)
        expect(harness.runtime.state().recoveryKey).toBe('character|chat-a')
        expect(vi.getTimerCount()).toBe(1)

        await vi.advanceTimersByTimeAsync(30_000)
        harness.idleWaiters[0].resolve()
        await waitForIdleWaiter(harness, 1)
        expect(harness.events.filter(event => event === 'metadata:patch')).toHaveLength(10)
        expect(vi.getTimerCount()).toBe(1)

        await vi.advanceTimersByTimeAsync(30_000)
        harness.idleWaiters[1].resolve()
        await waitForIdleWaiter(harness, 2)
        expect(harness.events.filter(event => event === 'metadata:patch')).toHaveLength(15)
        expect(vi.getTimerCount()).toBe(1)

        const stopped = new Error('stop controlled autosave scheduler')
        harness.idleWaiters[2].reject(stopped)
        await expect(schedulerRun).rejects.toBe(stopped)
        expect(harness.sleeps.filter(delay => delay === 200)).toHaveLength(3)
    })

    test('S05 replaces the single recovery slot for A to B to A without a lifetime identity cap', async () => {
        const harness = await createHarness({
            currentChats: [fullChat('chat-a'), fullChat('chat-b')],
            forcedPatchRejections: [
                { chaId: 'character', chatId: 'chat-a' },
                { chaId: 'character', chatId: 'chat-b' },
                { chaId: 'character', chatId: 'chat-a' },
            ],
        })

        const keys: Array<string | null> = []
        for (let attempt = 0; attempt < 3; attempt += 1) {
            const changes = attempt === 0 ? emptyChanges() : harness.runtime.takeTrackedChanges()
            await expect(harness.runtime.persistTrackedChanges(changes)).resolves.toBe('retry')
            keys.push(harness.runtime.state().recoveryKey)
        }
        expect(keys).toEqual([
            'character|chat-a',
            'character|chat-b',
            'character|chat-a',
        ])
    })

    test('S06 keeps metadata unpublished and the tracker dirty after payload failure', async () => {
        const harness = await createHarness({ failPayloadIds: ['chat-a'] })
        harness.runtime.queueRoot()

        await harness.runtime.triggerSave()

        expect(harness.events).toEqual(['payload:chat-a:create'])
        expect(harness.runtime.state().tracker.root).toBe(true)
        expect(harness.runtime.state().confirmed.characters[0].chats).toHaveLength(0)
    })

    test('S07 advances the confirmed baseline only after the rejected metadata is later accepted', async () => {
        const harness = await createHarness({
            forcedPatchRejections: [{ chaId: 'character', chatId: 'chat-a' }],
        })

        await expect(harness.runtime.persistTrackedChanges(emptyChanges()))
            .resolves.toBe('retry')
        expect(harness.runtime.state().confirmed.characters[0].chats).toHaveLength(0)

        await expect(harness.runtime.persistTrackedChanges(harness.runtime.takeTrackedChanges()))
            .resolves.toBe('saved')
        expect(harness.runtime.state().confirmed.characters[0].chats[0].id).toBe('chat-a')
        expect(harness.runtime.state().recoveryKey).toBeNull()
    })

    test.each([
        ['wrong identity', { chaId: 'character', chatId: 'absent' }],
        ['wrong character', { chaId: 'absent', chatId: 'chat-a' }],
        ['placeholder', { chaId: 'character', chatId: 'placeholder' }],
    ])('S08 refuses %s recovery metadata', async (_label, rejectedIdentity) => {
        const harness = await createHarness({
            currentChats: [
                fullChat('chat-a'),
                { id: 'placeholder', name: 'Placeholder', _placeholder: true, message: [] },
            ],
            forcedPatchRejections: [rejectedIdentity],
        })

        await expect(harness.runtime.persistTrackedChanges(emptyChanges()))
            .rejects.toThrow('invalid database update')
        expect(harness.runtime.state().recoveryKey).toBeNull()
        expect(harness.payloads.has('absent')).toBe(false)
        expect(harness.payloads.has('placeholder')).toBe(false)
    })

    test('S11 full-write race preserves the failure and succeeds through the existing outer retry', async () => {
        const harness = await createHarness({
            mutateDuringPayload: ({ current, chatId }) => {
                if (chatId === 'chat-a' && !current.characters[0].chats.some((chat: any) => chat.id === 'chat-b')) {
                    current.characters[0].chats.push(fullChat('chat-b'))
                }
            },
        })
        harness.runtime.queueRoot()

        await harness.runtime.triggerSave({ forceFullWrite: true })
        expect(harness.events).toEqual([
            'payload:chat-a:create',
            'metadata:full',
        ])
        expect(harness.runtime.state().tracker.root).toBe(true)
        expect(harness.runtime.state().recoveryKey).toBeNull()

        await harness.runtime.triggerSave({ forceFullWrite: true })
        expect(harness.events.slice(2)).toEqual([
            'payload:chat-a:create',
            'payload:chat-b:create',
            'metadata:full',
        ])
        expect(harness.serverDb().characters[0].chats.map((chat: any) => chat.id))
            .toEqual(['chat-a', 'chat-b'])
    })

    test('S12 deduplicates delayed timers and wakes dirty state on online and visible events', async () => {
        vi.useFakeTimers()
        const harness = await createHarness()
        harness.runtime.queueRoot()
        harness.runtime.setChanged(false)

        harness.runtime.scheduleDeferredRecovery(30_000)
        harness.runtime.scheduleDeferredRecovery(30_000)
        expect(vi.getTimerCount()).toBe(1)

        harness.runtime.onlineWake()
        expect(harness.runtime.state().changed).toBe(true)

        harness.runtime.setChanged(false)
        vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
        harness.runtime.visibilityWake()
        expect(harness.runtime.state().changed).toBe(true)
    })

    test('S12 chains a save requested in flight instead of starting a concurrent transaction', async () => {
        let releasePayload!: () => void
        const payloadGate = new Promise<void>((resolve) => { releasePayload = resolve })
        const harness = await createHarness({ payloadGate })
        harness.runtime.queueRoot()

        const first = harness.runtime.triggerSave()
        while (!harness.events.includes('payload:chat-a:create')) await Promise.resolve()
        harness.runtime.queueRoot()
        const second = harness.runtime.triggerSave()
        expect(harness.events).toEqual(['payload:chat-a:create'])

        releasePayload()
        await Promise.all([first, second])
        expect(harness.events.filter(event => event === 'metadata:patch')).toHaveLength(2)
        expect(harness.runtime.state().saveInFlight).toBeNull()
    })

    test('S13 merges edits made during a failed save with the original tracker', async () => {
        let releasePayload!: () => void
        const payloadGate = new Promise<void>((resolve) => { releasePayload = resolve })
        const harness = await createHarness({
            currentChats: [fullChat('chat-a'), fullChat('chat-b')],
            payloadGate,
            failPayloadIds: ['chat-a'],
        })
        harness.runtime.queueRoot()

        const save = harness.runtime.triggerSave()
        while (!harness.events.includes('payload:chat-a:create')) await Promise.resolve()
        harness.runtime.queueChat('character', 'chat-b')
        releasePayload()
        await save

        expect(harness.runtime.state().tracker.root).toBe(true)
        expect(harness.runtime.state().tracker.chat).toContainEqual(['character', 'chat-b'])
    })

    test('S14 propagates a deferred BG durable save and withholds its flush/ACK boundary', async () => {
        const harness = await createHarness({
            forcedPatchRejections: [{ chaId: 'character', chatId: 'chat-a' }],
        })

        await expect(harness.runtime.durableSave({ chat: ['character', 'chat-a'] }))
            .rejects.toThrow('durable save deferred')
        expect(harness.flushes).toHaveLength(0)
        expect(harness.runtime.state().tracker.chat).toContainEqual(['character', 'chat-a'])
    })
})
