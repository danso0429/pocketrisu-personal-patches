import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import Module from 'node:module'
import { afterEach, describe, expect, it, vi } from 'vitest'
import eligibilityPackage from './bgPluginEligibility.cjs'
import unavailablePackage from './bgPluginUnavailable.cjs'

const resolverState = vi.hoisted(() => ({ db: {} as AnyRecord, characterIndex: -1 }))
vi.mock('src/lang', () => ({ language: {} }))
vi.mock('svelte-sonner', () => ({ toast() {} }))
vi.mock('streamsaver', () => ({ default: {} }))
vi.doMock('../../src/ts/alert.ts', () => ({ alertClear() {}, alertConfirm() {}, alertError() {}, alertModuleSelect() {},
    alertNormal() {}, alertStore: {}, alertWait() {}, notifySuccess() {} }))
vi.doMock('../../src/ts/storage/database.svelte.ts', () => ({
    getDatabase: () => resolverState.db,
    getCurrentCharacter: () => resolverState.db.characters?.[resolverState.characterIndex],
    getCurrentChat: () => {
        const character = resolverState.db.characters?.[resolverState.characterIndex]
        return character?.chats?.[character.chatPage]
    },
    setCurrentCharacter() {}, setDatabase() {},
}))
vi.doMock('../../src/ts/globalApi.svelte.ts', () => ({ AppendableBuffer: class {}, LocalWriter: class {}, VirtualWriter: class {},
    downloadFile() {}, forageStorage: {}, readImage() {}, requestImportedModuleSave() {}, saveAsset() {} }))
vi.doMock('../../src/ts/util.ts', () => ({
    checkPersonaBinded: () => {
        const db = resolverState.db, character = db.characters?.[resolverState.characterIndex]
        const id = character?.chats?.[character.chatPage]?.bindedPersona
        return id ? db.personas?.find((value: AnyRecord) => value.id === id) ?? null : null
    },
    selectSingleFile() {}, sleep() {},
}))
vi.doMock('../../src/ts/process/lorebook.svelte.ts', () => ({ convertExternalLorebook() {} }))
vi.doMock('../../src/ts/media/index.ts', () => ({ compressImage() {} }))
vi.doMock('../../src/ts/rpack/rpack_js.js', () => ({ decodeRPack() {}, encodeRPack() {} }))
vi.doMock('../../src/ts/stores.svelte.ts', () => ({ HideIconStore: {}, moduleBackgroundEmbedding: {}, ReloadGUIPointer: {} }))
vi.doMock('../../src/ts/interchangeability.ts', () => ({ convertCharacterToModule() {}, convertModuleToCharacter() {} }))
vi.doMock('../../src/ts/characterCards.ts', () => ({ exportCharacterCard() {}, importCharacterProcess() {} }))
vi.doMock('../../src/ts/characterImportState.ts', () => ({ beginModuleImport() {}, formatImportProgress() {}, reserveImport() {} }))
vi.doMock('../../src/ts/process/moduleImport.ts', () => ({ createModuleImportOrchestrator() {}, selectModuleImportFile() {} }))
vi.doMock('../../src/ts/process/risumImport.ts', () => ({ materializeRisuModule() {}, prepareRisuModule() {} }))
const { getModuleLorebooks } = await import('../../src/ts/process/modules')

type AnyRecord = Record<string, any>
type Selection = { characterIndex: number, chatIndex: number }

const hostFile = fileURLToPath(new URL('./bgPluginHost.cjs', import.meta.url))
const hostSource = readFileSync(hostFile, 'utf8')
const exportMarker = 'module.exports = { createBgPluginHost, SUPPORTED_ROOT_METHODS };'
if (!hostSource.includes(exportMarker)) throw new Error('bgPluginHost export marker changed')
const instrumentedModule = new (Module as any)(hostFile)
instrumentedModule.filename = hostFile
instrumentedModule.paths = (Module as any)._nodeModulePaths(dirname(hostFile))
;(instrumentedModule as any)._compile(hostSource.replace(exportMarker,
    'module.exports = { createBgPluginHost, SUPPORTED_ROOT_METHODS, __test: { ROOT_HANDLERS, Returned, Resume } };'), hostFile)
const instrumented = instrumentedModule.exports
const { SUPPORTED_ROOT_METHODS } = instrumented
const { hasPluginBindings } = eligibilityPackage

const openHosts: Array<{ close: () => Promise<void> }> = []
afterEach(async () => { while (openHosts.length) await openHosts.pop()!.close() })

const entry = (id: string, extra: AnyRecord = {}) => ({ id, comment: id, key: [id], ...extra })
const moduleRow = (id: string, namespace?: string, value = id.toUpperCase()) => ({
    id, ...(namespace ? { namespace } : {}), lorebook: [entry(value)],
})
const plugin = (script: string) => ({ name: 'g22b-lore-probe', version: '3.0', enabled: true, script })

function setResolverState(db: AnyRecord, selection: Selection) {
    resolverState.db = db
    resolverState.characterIndex = selection.characterIndex
}

async function dispatchDirect(db: AnyRecord, selection: Selection, args: unknown[] = [], overrides: AnyRecord = {}) {
    const handler = instrumented.__test.ROOT_HANDLERS.getCurrentLorebookEntries
    expect(handler, 'getCurrentLorebookEntries must be registered in ROOT_HANDLERS').toBeTypeOf('function')
    setResolverState(db, selection)
    const ctx = {
        getDatabase: () => db,
        getSelection: () => selection,
        hydrate: vi.fn(),
        bindings: { moduleLorebooks: () => getModuleLorebooks() },
        ...overrides,
    }
    let result = handler(ctx, args, 'getCurrentLorebookEntries')
    if (result instanceof instrumented.__test.Resume) result = result.next(await result.pending)
    if (result instanceof instrumented.__test.Returned) return { value: result.value, ctx }
    return { value: await result, ctx }
}

function registry() {
    return { providers: new Map(), replacerbeforeRequest: new Set(), replacerafterRequest: new Set(),
        editinput: new Set(), editoutput: new Set(), editprocess: new Set(), editdisplay: new Set() }
}

function loadHostWithSession(createPluginSession: (options: AnyRecord) => Promise<AnyRecord>) {
    const source = hostSource.replace("const { createPluginSession } = require('./bgPluginSession.cjs');",
        'const { createPluginSession } = globalThis.__g22bSessionHarness;')
    const testModule = new (Module as any)(hostFile)
    testModule.filename = hostFile
    testModule.paths = (Module as any)._nodeModulePaths(dirname(hostFile))
    ;(globalThis as any).__g22bSessionHarness = { createPluginSession }
    try { (testModule as any)._compile(source, hostFile) }
    finally { delete (globalThis as any).__g22bSessionHarness }
    return testModule.exports
}

describe('[G2.2b-1] BG current lorebook entries parity', () => {
    it('matches the real foreground resolver order across every activation source and preserves raw entries', async () => {
        const G1 = entry('G1', { enabled: false, selective: true, keys: ['never-matches'] })
        const G2 = entry('G2', { metadata: { nested: ['kept'] } })
        const L1 = entry('L1')
        const modules = [moduleRow('a', 'ns_a', 'M1'), moduleRow('b', undefined, 'M2'),
            moduleRow('c', 'ns_c', 'M3'), moduleRow('d', undefined, 'M4'), moduleRow('e', undefined, 'M5'),
            moduleRow('global-persona', undefined, 'LEAK')]
        const db: AnyRecord = {
            enabledModules: ['e'], modules, moduleIntergration: ' ns_a , e , unknown_id ', selectedPersona: 0,
            personas: [
                { id: 'global', embeddedModule: { id: 'global-persona' } },
                { id: 'bound', embeddedModule: { id: 'd' } },
            ],
            characters: [{ chatPage: 0, globalLore: [G1, G2], modules: ['b', 'a'], chats: [
                { id: 'selected', localLore: [L1], modules: ['ns_c', 'b'], bindedPersona: 'bound', message: [] },
                { id: 'stored-other', _stub: true, modules: ['global-persona'] },
            ] }],
        }
        setResolverState(db, { characterIndex: 0, chatIndex: 0 })
        const foreground = [...db.characters[0].globalLore, ...db.characters[0].chats[0].localLore, ...getModuleLorebooks()]
        expect(getModuleLorebooks().map(value => value.id)).toEqual(['M1', 'M2', 'M3', 'M4', 'M5'])
        const result = await dispatchDirect(db, { characterIndex: 0, chatIndex: 0 })
        expect(result.value).toEqual(foreground)
        expect(result.ctx.hydrate).not.toHaveBeenCalled()
    })

    it('uses only a chat-bound registered persona module and never leaks the globally selected or unregistered inline module', async () => {
        const base = {
            enabledModules: [], moduleIntergration: '', selectedPersona: 0,
            modules: [moduleRow('global', undefined, 'GLOBAL'), moduleRow('bound', undefined, 'BOUND')],
            personas: [{ id: 'p-global', embeddedModule: { id: 'global' } }, { id: 'p-bound', embeddedModule: { id: 'bound' } }],
        }
        const bound: AnyRecord = { ...base, characters: [{ chatPage: 0, chats: [{ bindedPersona: 'p-bound', message: [] }] }] }
        expect((await dispatchDirect(bound, { characterIndex: 0, chatIndex: 0 })).value.map((value: AnyRecord) => value.id)).toEqual(['BOUND'])
        const absent: AnyRecord = { ...base, personas: [...base.personas, { id: 'p-absent', embeddedModule: {
            id: 'unregistered', lorebook: [entry('INLINE')],
        } }], characters: [{ chatPage: 0, chats: [{ bindedPersona: 'p-absent', message: [] }] }] }
        expect((await dispatchDirect(absent, { characterIndex: 0, chatIndex: 0 })).value).toEqual([])
        const unbound: AnyRecord = { ...base, characters: [{ chatPage: 0, chats: [{ message: [] }] }] }
        expect((await dispatchDirect(unbound, { characterIndex: 0, chatIndex: 0 })).value).toEqual([])
    })

    it('returns empty for no character but retains character and module lore when the selected chat is absent', async () => {
        const noCharacter: AnyRecord = { enabledModules: ['m'], modules: [moduleRow('m')], personas: [], characters: [] }
        const binding = vi.fn(() => [entry('SHOULD_NOT_RUN')])
        expect((await dispatchDirect(noCharacter, { characterIndex: -1, chatIndex: -1 }, [], {
            bindings: { moduleLorebooks: binding },
        })).value).toEqual([])
        expect(binding).not.toHaveBeenCalled()

        const noChat: AnyRecord = { enabledModules: ['m2'], modules: [moduleRow('m1'), moduleRow('m2')], personas: [],
            characters: [{ chatPage: 7, globalLore: [entry('G1')], modules: ['m1'], chats: [] }] }
        expect((await dispatchDirect(noChat, { characterIndex: 0, chatIndex: 7 })).value.map((value: AnyRecord) => value.id))
            .toEqual(['G1', 'M1', 'M2'])
    })

    it.each([
        ['stub', { id: 'chat', _stub: true }],
        ['placeholder', { id: 'chat', _placeholder: true }],
        ['cold storage', { id: 'chat', message: [{ role: 'user', data: '\uEF01COLDSTORAGE\uEF01cold-key' }] }],
    ])('rejects a selected %s chat without hydrating it', async (_name, chat) => {
        const hydrate = vi.fn()
        const db: AnyRecord = { enabledModules: [], modules: [], personas: [],
            characters: [{ chatPage: 0, globalLore: [entry('G')], chats: [chat] }] }
        await expect(dispatchDirect(db, { characterIndex: 0, chatIndex: 0 }, [], { hydrate }))
            .rejects.toMatchObject({ code: 'plugin_chat_snapshot_unavailable' })
        expect(hydrate).not.toHaveBeenCalled()
    })

    it('ignores non-selected stubs and all arguments without hydration, permission, or network effects', async () => {
        const db: AnyRecord = { enabledModules: [], modules: [], personas: [], characters: [{ chatPage: 0,
            globalLore: [entry('G')], chats: [{ id: 'selected', localLore: [entry('L')], message: [] },
                ...Array.from({ length: 9 }, (_, index) => ({ id: `stub-${index}`, _stub: true }))] }] }
        const hydrate = vi.fn(), permission = vi.fn(), countNetworkCall = vi.fn()
        const result = await dispatchDirect(db, { characterIndex: 0, chatIndex: 0 }, ['unexpected_arg', { filter: true }, 123], {
            hydrate, permission, countNetworkCall,
        })
        expect(result.value).toEqual([entry('G'), entry('L')])
        expect(hydrate).not.toHaveBeenCalled()
        expect(permission).not.toHaveBeenCalled()
        expect(countNetworkCall).not.toHaveBeenCalled()
    })

    it('deep-clones global, local, and module entries before exposing them to the guest', async () => {
        const original = [entry('G', { metadata: { nested: ['global'] } }), entry('L', { metadata: { nested: ['local'] } }),
            entry('M', { metadata: { nested: ['module'] } })]
        const db: AnyRecord = { enabledModules: ['m'], modules: [{ id: 'm', lorebook: [original[2]] }], personas: [],
            characters: [{ chatPage: 0, globalLore: [original[0]], chats: [{ localLore: [original[1]], message: [] }] }] }
        const expected = structuredClone(original)
        const first = (await dispatchDirect(db, { characterIndex: 0, chatIndex: 0 })).value
        first.push({ id: 'FAKE' })
        for (const value of first.slice(0, 3)) {
            value.comment = 'mutated'; value.key = ['hacked']; value.metadata.nested[0] = 'mutated'
        }
        const second = (await dispatchDirect(db, { characterIndex: 0, chatIndex: 0 })).value
        expect(second).toEqual(expected)
        expect([db.characters[0].globalLore[0], db.characters[0].chats[0].localLore[0], db.modules[0].lorebook[0]])
            .toEqual(expected)
    })

    it('enforces value byte, node, and depth limits without truncating or substituting an empty result', async () => {
        const fixtures = [
            { name: 'bytes', lore: [entry('large', { content: 'x'.repeat(4 * 1024 * 1024) })] },
            { name: 'nodes', lore: Array.from({ length: 100_000 }, (_, index) => index) },
            { name: 'depth', lore: [entry('deep', { metadata: Array.from({ length: 66 }).reduce(value => ({ value }), 'leaf' as any) })] },
        ]
        for (const fixture of fixtures) {
            const db: AnyRecord = { enabledModules: [], modules: [], personas: [], characters: [{ chatPage: 0,
                globalLore: fixture.lore, chats: [{ message: [] }] }] }
            await expect(dispatchDirect(db, { characterIndex: 0, chatIndex: 0 }), fixture.name)
                .rejects.toMatchObject({ code: 'plugin_value_limit' })
        }
        const safe = 'x'.repeat(Math.floor(3.9 * 1024 * 1024))
        const db: AnyRecord = { enabledModules: [], modules: [], personas: [], characters: [{ chatPage: 0,
            globalLore: [entry('safe', { content: safe })], chats: [{ message: [] }] }] }
        const result = await dispatchDirect(db, { characterIndex: 0, chatIndex: 0 })
        expect(result.value[0].content).toHaveLength(safe.length)
    }, 30_000)

    it('preserves the full escape-heavy handler result up to the existing RPC frame rejection boundary', async () => {
        const escaped = '\u0000'.repeat(4 * 1024 * 1024 - 512)
        const db: AnyRecord = { enabledModules: [], modules: [], personas: [], characters: [{ chatPage: 0,
            globalLore: [entry('escaped', { content: escaped })], chats: [{ message: [] }] }] }
        const result = (await dispatchDirect(db, { characterIndex: 0, chatIndex: 0 })).value
        expect(result[0].content).toHaveLength(escaped.length)
        expect(Buffer.byteLength(JSON.stringify(result))).toBeGreaterThan(8 * 1024 * 1024)
        expect(readFileSync(new URL('./bgPluginWorker.cjs', import.meta.url), 'utf8'))
            .toContain("throw Object.assign(fail('plugin_rpc_frame_limit'), { oversize: true })")
    }, 30_000)

    it('discovers the guest capability and omits it from absent diagnostics while preserving other absent APIs', async () => {
        expect(SUPPORTED_ROOT_METHODS).toContain('getCurrentLorebookEntries')
        const worker = readFileSync(new URL('./bgPluginWorker.cjs', import.meta.url), 'utf8')
        expect(worker).toContain('if (rootMethods.has(key)) return (...args) => apiCall(key, args)')
        expect(worker).toContain('noteAbsent(key)')
        expect(SUPPORTED_ROOT_METHODS).not.toContain('someUnsupportedDomApi')
    })

    it('requires a callable moduleLorebooks binding and preserves the warned plugin-free operation path', async () => {
        const complete: AnyRecord = { bgPluginBindings: { nativeFetch() {}, risuFetch() {}, requestChatDataMain() {},
            installProvider() {}, characterMetadata() {}, moduleLorebooks() { return [] }, allowedDbKeys: [], bodyInterceptors: [], registry: registry() } }
        expect(hasPluginBindings(complete)).toBe(true)
        for (const invalid of [undefined, null, {}, 'invalid']) {
            expect(hasPluginBindings({ bgPluginBindings: { ...complete.bgPluginBindings, moduleLorebooks: invalid } })).toBe(false)
        }
        const notices: AnyRecord[] = []
        await expect(unavailablePackage.publishSkippedServerPlugins({
            mode: 'full', operation: { operationId: 'op-00000001', charId: 'char', chatId: 'chat' },
            database: { plugins: [plugin('void 0')] },
            dependencies: { enabled: true, publishNotification: (event: AnyRecord) => {
                notices.push(event); return { status: 'stored' }
            } },
            control: { resultKeyVersion: 1, serverChatCommitVersion: 1 },
        })).resolves.toBeUndefined()
        expect(notices).toHaveLength(1)
        expect(notices[0]).toMatchObject({ code: 'plugin_api_unsupported', api: 'server_plugin_host_bindings' })
    })

    it('tracks sequential operation DBs, live module edits with unchanged IDs, and intra-operation host refresh', async () => {
        const makeDb = (prefix: string, moduleId: string, moduleLore: string, local = `${prefix}-L1`) => ({
            enabledModules: [moduleId], modules: [{ id: moduleId, lorebook: [entry(moduleLore)] }], personas: [],
            characters: [{ chatPage: 0, globalLore: [entry(`${prefix}-G`)], chats: [{ localLore: [entry(local)], message: [] }] }],
        })
        const first = makeDb('A', 'mod-1', 'M1-v1')
        expect((await dispatchDirect(first, { characterIndex: 0, chatIndex: 0 })).value.map((value: AnyRecord) => value.id))
            .toEqual(['A-G', 'A-L1', 'M1-v1'])
        const refreshed = makeDb('A', 'mod-1', 'M1-v2', 'A-L2')
        expect((await dispatchDirect(refreshed, { characterIndex: 0, chatIndex: 0 })).value.map((value: AnyRecord) => value.id))
            .toEqual(['A-G', 'A-L2', 'M1-v2'])

        const second = makeDb('B', 'mod-2', 'M2')
        expect((await dispatchDirect(second, { characterIndex: 0, chatIndex: 0 })).value.map((value: AnyRecord) => value.id))
            .toEqual(['B-G', 'B-L1', 'M2'])
    })

    it('rejects a lore call begun during teardown with the standard operation-closed error', async () => {
        let api!: (method: string, args: unknown[]) => Promise<unknown>
        let teardownError: unknown
        const fakeSession = async (options: AnyRecord) => {
            api = options.api
            return { failure: null, assertCurrent() {}, currentSignal: () => new AbortController().signal,
                pullAbsentApis: async () => ({ names: [], overflow: false }),
                load: async () => {
                    await api('onUnload', [async () => {
                        try { await api('getCurrentLorebookEntries', []) }
                        catch (error) { teardownError = error }
                    }])
                    return { ready: true }
                }, close: async () => {},
            }
        }
        const { createBgPluginHost } = loadHostWithSession(fakeSession)
        const script = 'void 0', probe = plugin(script)
        const db: AnyRecord = { plugins: [probe], enabledModules: [], modules: [], personas: [],
            characters: [{ chatPage: 0, chats: [{ message: [] }] }] }
        const values = new Map<string, string>(), bindings = { registry: registry(), allowedDbKeys: [], bodyInterceptors: [],
            nativeFetch() {}, risuFetch() {}, requestChatDataMain() {}, installProvider() {}, characterMetadata() {},
            moduleLorebooks: () => [] }
        const host = await createBgPluginHost({ database: db, bindings, getDatabase: () => db,
            getSelection: () => ({ characterIndex: 0, chatIndex: 0 }), hydrate: vi.fn(), beforeEffect: vi.fn(),
            storageOwner: { kvGet: (key: string) => values.get(key) ?? null, kvSet: (key: string, value: string) => values.set(key, value),
                kvDel: (key: string) => values.delete(key), kvList: () => [], transaction: (task: () => unknown) => task(), peekRoot: () => db },
            publishNotification: () => ({ status: 'stored' }), operation: { operationId: 'op', charId: 'char', chatId: 'chat' },
            signal: new AbortController().signal,
        })
        await host.close()
        expect(teardownError).toMatchObject({ code: 'plugin_operation_closed' })
    })
})
