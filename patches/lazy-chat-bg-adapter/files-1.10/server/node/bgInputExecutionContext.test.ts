import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import crypto from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import abortPackage from './bgOrchestrationAbortContext.cjs'
import headerPackage from './externalRequestHeaders.cjs'
import assemblyPackage from './serverChatAssemblyContext.cjs'
import eligibilityPackage from './bgPluginEligibility.cjs'

const require = createRequire(import.meta.url)
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
const originalLocation = Object.getOwnPropertyDescriptor(globalThis, 'location')
const originalSignal = Object.getOwnPropertyDescriptor(globalThis, '__bgOrchAbortSignal')
afterEach(() => {
    for (const [key, descriptor] of [['document', originalDocument], ['location', originalLocation],
        ['__bgOrchAbortSignal', originalSignal]] as const) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor)
        else delete (globalThis as any)[key]
    }
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

function harness(input: (signal: AbortSignal | undefined) => Promise<void> = async () => {}) {
    const abortContext = abortPackage.createOrchestrationAbortContext()
    const values = new Map<string, string>()
    const headers = headerPackage.createExternalRequestHeaders({
        kvGet: (key: string) => values.get(key), kvSet: (key: string, value: string) => values.set(key, value), log: () => {},
    })
    headers.save({ revision: 0, rules: [{ id: 'synthetic-rule', name: 'Synthetic', enabled: true,
        destination: 'https://synthetic.example.test/v1', header: 'x-session', valueKind: 'conversation-session' }] })
    let canonical: any = { id: 'chat', message: [{ role: 'user', data: 'history', chatId: 'history' }] }
    const root = { characters: [{ chaId: 'char', type: 'character', chats: [{ id: 'chat', _stub: true }] }],
        globalChatVariables: {}, statics: { messages: 0 } }
    let database: any, attachments = 0, mains = 0
    const observations: any[] = []
    const observe = (stage: string) => {
        const signal = abortContext.getSignal()
        observations.push({ stage, signal, inherited: (globalThis as any).__bgOrchAbortSignal,
            document: globalThis.document, location: globalThis.location,
            header: headers.apply('https://synthetic.example.test/v1/chat', {}).headers['x-session'] })
        return signal
    }
    const bg = {
        policy: { requiresClientGenerationEpilogue: () => false },
        inputPolicy: { requiresClientOwnedInputPreparation: () => false,
            evaluateServerInputModels: () => ({ kind: 'server-input' }) },
        dbmod: { setDatabase: (db: any) => { database = db }, getDatabase: () => database },
        stores: { selectedCharID: { set: () => {} } },
        triggers: { runTrigger: async (_char: any, _mode: string, value: any) => {
            await input(observe('input'))
            return value
        } },
        scripts: { processScript: async (_char: any, text: string) => { observe('editinput'); return text } },
        idx: { chatProcessStage: { set: () => {}, subscribe: () => () => {} },
            sendChatWithDirectLifecycle: async () => {
                mains++; observe('main')
                database.characters[0].chats[0].message.push({ role: 'char', chatId: 'answer', data: 'response' })
            } },
    }
    const source = readFileSync(new URL('./bgOrchestrator.cjs', import.meta.url), 'utf8')
    const start = source.indexOf('async function runServerPreview(')
    const end = source.indexOf('\n// S2-C:', start)
    if (start < 0 || end <= start) throw new Error('Generated runner boundary missing')
    const run = new Function('loadBundle', 'nodeCrypto', 'require', 'orchestrationAbortContext',
        'withExternalHeaderConversation', 'diffGlobalVariables', 'canStartPluginHost', `
        let _previewLock = Promise.resolve(); const _orchStage = {}, _orchStatus = {};
        const stageKey = (a, b) => a + ':' + b;
        ${source.slice(start, end)}
        return runServerPreview;
    `)(async () => bg, crypto, require, abortContext, headerPackage.withExternalHeaderConversation,
        () => ({ changed: {}, deleted: [], expected: {} }), eligibilityPackage.canStartPluginHost)
    const context = () => assemblyPackage.captureAssemblyContext(root, canonical, 'char', 'chat')
    const command = { rawText: 'input', userMessageId: 'input-id', submittedAt: 123 }
    const record = { admission: command, inputReceipt: { messageId: 'input-id' } }
    const execute = (signal?: AbortSignal, prepared = false) => run({}, 'char', 'chat', canonical, 'full', {
        signal, serverChatCommitVersion: 1, inputCommandVersion: prepared ? 0 : 1,
        beginInputTransform: async (validate: any) => {
            const captured = context(); expect(validate(captured)).toBeNull()
            return { status: 'started', record, context: captured }
        },
        attachInputTransform: async ({ chat }: any) => {
            attachments++; canonical = structuredClone(chat)
            return { status: 'attached', record }
        },
        readAssemblyContext: async () => context(), onInputCommitted: () => {},
    })
    return { execute, run, bg, root, context, observations, attachments: () => attachments, mains: () => mains, abortContext,
        outsideHeader: () => headers.apply('https://synthetic.example.test/v1/chat', {}).headers['x-session'] }
}

describe('server input shares the operation execution context', () => {
    it.each([
        ['host OFF', false, false, 1],
        ['missing bindings', true, false, 1],
        ['missing result ownership', true, true, 0],
        ['eligible host ON', true, true, 1],
    ] as const)('uses the generated preclaim decision before effects: %s', async (_name, enabled, complete, resultKeyVersion) => {
        const h = harness()
        ;(h.root as any).plugins = [{ enabled: true, version: '3.0', name: 'synthetic-generic' }]
        ;(h.bg.inputPolicy as any).evaluateServerInputModels = (_db: unknown, _chat: unknown, allow?: boolean) =>
            allow ? { kind: 'server-input' } : { kind: 'client-prepared', reason: 'plugin-host-unqualified' }
        if (complete) (h.bg as any).bgPluginBindings = {
            nativeFetch: vi.fn(), risuFetch: vi.fn(), requestChatDataMain: vi.fn(), installProvider: vi.fn(), characterMetadata: vi.fn(),
            allowedDbKeys: [], bodyInterceptors: [], registry: { providers: new Map(),
                replacerbeforeRequest: new Set(), replacerafterRequest: new Set(), editinput: new Set(),
                editoutput: new Set(), editprocess: new Set(), editdisplay: new Set() },
        }
        const stop = new Error('preclaim test boundary')
        const begin = vi.fn(async (validate: (context: unknown) => unknown) => {
            expect(validate(h.context())).toEqual(enabled && complete && resultKeyVersion === 1 ? null : {
                reason: 'server_host_unsupported', api: 'server_plugin_host', effectsMayHaveOccurred: false,
            })
            throw stop // Do not substitute a fake successful claim/host/main.
        })
        await expect(h.run({ bgPluginDependencies: { enabled } }, 'char', 'chat', h.context().chat, 'full', {
            inputCommandVersion: 1, serverChatCommitVersion: 1, resultKeyVersion, beginInputTransform: begin,
        })).rejects.toBe(stop)
        expect(begin).toHaveBeenCalledTimes(1)
        expect(h.observations).toEqual([])
        expect(h.attachments()).toBe(0)
        expect(h.mains()).toBe(0)
    })
    it('limits a failed input fetch latch to its own async operation', async () => {
        const source = readFileSync(new URL('./bgOrchestrator.cjs', import.meta.url), 'utf8')
        const start = source.indexOf('function patchFetch(')
        const end = source.indexOf('// DBState / selectedCharID', start)
        expect(start).toBeGreaterThan(0)
        expect(end).toBeGreaterThan(start)
        const context = abortPackage.createOrchestrationAbortContext()
        const realFetch = vi.fn(async () => new Response('outside'))
        vi.stubGlobal('fetch', realFetch)
        vi.stubGlobal('__bgOrchFetchPatched', false)
        const failed = new Error('unsupported input')
        const signal = new AbortController().signal
        vi.stubGlobal('__bgGetServerInputExecution', () => ({ signal, failure: failed }))
        const install = new Function('orchestrationAbortContext', 'require', source.slice(start, end) + '; return patchFetch;')(context, require)
        install()
        await expect(context.run(signal, () => fetch('https://synthetic.example.test/request'))).rejects.toBe(failed)
        expect(realFetch).not.toHaveBeenCalled()
        expect(await (await fetch('https://synthetic.example.test/unrelated')).text()).toBe('outside')
        const otherSignal = new AbortController().signal
        await context.run(otherSignal, () => fetch('https://synthetic.example.test/other-operation'))
        expect(realFetch).toHaveBeenCalledTimes(2)
    })

    it('keeps cancellation ahead of a later swallowed unsupported-host error', async () => {
        const external = new AbortController()
        const h = harness(async () => {
            external.abort()
            try { (globalThis as any).__bgGetServerInputExecution().reject('interactive_ui') } catch {}
        })
        await expect(h.execute(external.signal)).rejects.toMatchObject({ code: 'BG_INPUT_ABORTED' })
        expect(h.attachments()).toBe(0)
        expect(h.mains()).toBe(0)
    })

    it('creates an actual Lua engine in the input node environment without a browser URL or network fetch', async () => {
        Object.defineProperty(globalThis, 'document', { value: { baseURI: () => 0, currentScript: null }, configurable: true })
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('unexpected Lua probe network request') }))
        let value: unknown
        const h = harness(async () => {
            const { LuaFactory } = require('wasmoon')
            const engine = await new LuaFactory().createEngine()
            try { value = await engine.doString('return 21 * 2') }
            finally { engine.global.close() }
        })
        await h.execute()
        expect(value).toBe(42)
        expect(globalThis.fetch).not.toHaveBeenCalled()
        expect(h.attachments()).toBe(1)
        expect(h.mains()).toBe(1)
    })
    it('uses the same abort signal and conversation header for input, editinput and main, restoring globals', async () => {
        const doc = { marker: 'document' }, loc = { marker: 'location' }
        Object.defineProperty(globalThis, 'document', { value: doc, configurable: true, writable: true })
        Object.defineProperty(globalThis, 'location', { value: loc, configurable: true, writable: true })
        const h = harness()
        await h.execute()
        expect(h.observations.map(row => row.stage)).toEqual(['input', 'editinput', 'main'])
        const signal = h.observations[2].signal
        expect(signal).toBeInstanceOf(AbortSignal)
        for (const row of h.observations) {
            expect(row.signal).toBe(signal)
            expect(row.inherited).toBe(signal)
            expect(row.document).toBeUndefined()
            expect(row.location).toBeUndefined()
            expect(row.header).toBe(h.observations[2].header)
        }
        expect(globalThis.document).toBe(doc)
        expect(globalThis.location).toBe(loc)
        expect(h.abortContext.getSignal()).toBeNull()
        expect(h.attachments()).toBe(1)
        expect(h.mains()).toBe(1)
    })

    it.each(['cancel', 'deadline'] as const)('aborts an input provider on %s before attachment and releases the runner', async reason => {
        vi.useFakeTimers()
        let entered!: () => void, release!: () => void, inputSignal: AbortSignal | undefined
        const ready = new Promise<void>(resolve => { entered = resolve })
        const h = harness(async signal => {
            inputSignal = signal
            await new Promise<void>((resolve, reject) => {
                release = resolve
                signal?.addEventListener('abort', () => reject(new Error('synthetic provider aborted')), { once: true })
                entered()
            })
        })
        const external = new AbortController()
        const outcome = h.execute(external.signal).then(value => ({ value }), error => ({ error }))
        await ready
        try {
            if (reason === 'cancel') external.abort()
            else await vi.advanceTimersByTimeAsync(600_000)
            expect(inputSignal?.aborted).toBe(true)
        } finally { release() }
        expect(await outcome).toHaveProperty('error')
        expect(h.attachments()).toBe(0)
        expect(h.mains()).toBe(0)
        // A following already-prepared turn can acquire the released preview lock.
        await h.execute(undefined, true)
        expect(h.mains()).toBe(1)
        expect(vi.getTimerCount()).toBe(0)
    })

    it('restores the caller environment on an input exception', async () => {
        const doc = { marker: 'caller' }
        Object.defineProperty(globalThis, 'document', { value: doc, configurable: true, writable: true })
        const h = harness(async () => { throw new Error('synthetic transform failure') })
        await expect(h.execute()).rejects.toThrow('synthetic transform failure')
        expect(globalThis.document).toBe(doc)
        expect((globalThis as any).__bgOrchAbortSignal).toBeUndefined()
        expect(h.abortContext.getSignal()).toBeNull()
        expect(h.attachments()).toBe(0)
    })

    it.each(['cancel', 'deadline'] as const)('does not attach when a script handles %s as an ordinary result', async reason => {
        vi.useFakeTimers()
        let entered!: () => void
        const ready = new Promise<void>(resolve => { entered = resolve })
        const h = harness(async signal => {
            await new Promise<void>(resolve => {
                signal!.addEventListener('abort', () => resolve(), { once: true })
                entered()
            })
        })
        const external = new AbortController()
        const outcome = h.execute(external.signal).catch(error => error)
        await ready
        expect(h.abortContext.getSignal()).toBeNull()
        expect(h.outsideHeader()).not.toBe(h.observations[0].header)
        if (reason === 'cancel') external.abort()
        else await vi.advanceTimersByTimeAsync(600_000)
        expect(await outcome).toMatchObject({ message: reason === 'cancel'
            ? 'orchestration cancelled' : 'llm aborted (600s timeout)' })
        expect(h.attachments()).toBe(0)
        expect(h.mains()).toBe(0)
    })
})
