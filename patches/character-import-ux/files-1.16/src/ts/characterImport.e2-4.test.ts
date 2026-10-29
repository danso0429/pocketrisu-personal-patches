import { beforeEach, describe, expect, test, vi } from 'vitest'
import {
    charxCardBytes,
    deferred,
    importOptional,
    jsonCardBytes,
    makeCard,
    pngCardBytes,
    pngWithCardText,
} from './characterImport.e2-4.helpers'

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

const h = vi.hoisted(() => {
    const state = {
        db: {} as any,
        assetNumber: 0,
    }
    const jobs: Array<{ id: unknown, states: any[] }> = []
    return {
        state,
        jobs,
        alertConfirm: vi.fn(async () => true),
        alertError: vi.fn(),
        alertInput: vi.fn(async () => ''),
        alertNormal: vi.fn(),
        alertSet: vi.fn(),
        notifyError: vi.fn(),
        notifySuccess: vi.fn(),
        requestCharacterSave: vi.fn(async (_id: string) => {}),
        loadManifest: vi.fn(async () => [['lazy', 'assets/restored.png', 'png']]),
        selectedSet: vi.fn(),
        characterFormatUpdate: vi.fn(),
        moduleRead: vi.fn(async () => ({ id: 'embedded-module' })),
        toast: {
            custom: vi.fn((_component: unknown, options: any) => {
                const job = { id: options?.id, states: [] as any[] }
                options?.componentProps?.status?.subscribe((status: any) => job.states.push(status))
                jobs.push(job)
                return options?.id
            }),
            dismiss: vi.fn(),
            warning: vi.fn(),
        },
    }
})

class TestAppendableBuffer {
    private chunks: Uint8Array[] = []
    deapended = 0
    append(data: Uint8Array) { this.chunks.push(data) }
    get buffer() {
        const length = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0)
        const out = new Uint8Array(length)
        let offset = 0
        for (const chunk of this.chunks) {
            out.set(chunk, offset)
            offset += chunk.length
        }
        return out
    }
    length() { return this.deapended + this.buffer.length }
    slice(start: number, end: number) {
        return this.buffer.slice(start - this.deapended, end - this.deapended)
    }
    deappend(length: number) {
        const remaining = this.buffer.slice(length)
        this.chunks = [remaining]
        this.deapended += length
    }
}

vi.mock('svelte-sonner', () => ({ toast: h.toast }))
vi.mock('src/lang', () => ({
    language: new Proxy({}, { get: (_target, key) => String(key) }),
}))
vi.mock('./alert', () => ({
    alertCardExport: vi.fn(),
    alertClear: vi.fn(),
    alertConfirm: h.alertConfirm,
    alertError: h.alertError,
    alertInput: h.alertInput,
    alertNormal: h.alertNormal,
    alertStore: { set: h.alertSet },
    alertTOS: vi.fn(async () => true),
    alertWait: vi.fn(),
    notifyError: h.notifyError,
    notifySuccess: h.notifySuccess,
}))
vi.mock('./storage/database.svelte', () => ({
    appVer: '1.16.1',
    defaultSdDataFunc: () => ({}),
    getDatabase: () => h.state.db,
    importPreset: vi.fn(),
    newChatModelDefaults: () => ({}),
    setDatabase: (db: any) => { h.state.db = db },
    setDatabaseLite: (db: any) => { h.state.db = db },
}))
vi.mock('./util', () => ({
    Semaphore: class {
        async acquire() {}
        release() {}
    },
    asBuffer: (value: Uint8Array) => value,
    blobToUint8Array: async (value: Blob) => new Uint8Array(await value.arrayBuffer()),
    checkNullish: (value: any, fallback: any) => value ?? fallback,
    decryptBuffer: vi.fn(async () => new Uint8Array()),
    isKnownUri: () => false,
    selectFileByDom: vi.fn(),
    sleep: async () => {},
}))
vi.mock('./globalApi.svelte', () => ({
    AppendableBuffer: TestAppendableBuffer,
    BlankWriter: class {},
    LocalWriter: class {},
    VirtualWriter: class {},
    checkCharOrder: vi.fn(),
    downloadFile: vi.fn(),
    forageStorage: {},
    loadAsset: vi.fn(),
    loadAssetManifestItems: h.loadManifest,
    readImage: vi.fn(),
    requestImportedCharacterSave: h.requestCharacterSave,
    saveAsset: vi.fn(async () => `assets/test-${++h.state.assetNumber}.png`),
}))
vi.mock('./stores.svelte', () => ({
    DBState: { get db() { return h.state.db } },
    selectedCharID: { set: h.selectedSet },
}))
vi.mock('./routing', () => ({ openSettings: vi.fn(), SettingsRoute: { Module: 'module', ChatBot: 'chatbot' } }))
vi.mock('./characters', () => ({ characterFormatUpdate: h.characterFormatUpdate }))
vi.mock('./parser/parser.svelte', () => ({ hasher: vi.fn(async () => 'hash') }))
vi.mock('./media', () => ({ compressImage: vi.fn(), getImageType: vi.fn() }))
vi.mock('./process/files/inlays', () => ({ reencodeImage: vi.fn() }))
vi.mock('./process/modules', () => ({
    exportModuleLegacy: vi.fn(),
    readModule: h.moduleRead,
}))

const cards = await import('./characterCards')

function resetDb() {
    h.state.db = {
        characters: [],
        modules: [],
        statics: { imports: 0 },
        blockedRealmCreators: [],
        goCharacterOnImport: false,
        lightningRealmImport: false,
    }
    h.state.assetNumber = 0
}

async function settledImport(options: any) {
    return cards.importCharacterProcess(options).then(
        (value) => ({ value, error: undefined }),
        (error) => ({ value: undefined, error }),
    )
}

function jobStates(index = 0) {
    return h.jobs[index]?.states ?? []
}

function expectJobPhase(phase: 'success' | 'error', index = 0) {
    expect(jobStates(index).at(-1)).toEqual(expect.objectContaining({ phase }))
}

function expectJobClosed(index = 0) {
    const job = h.jobs[index]
    expect(job).toBeDefined()
    expect(h.toast.dismiss).toHaveBeenCalledWith(job.id)
    expect(job.states.some((status: any) => status.phase === 'success' || status.phase === 'error')).toBe(false)
}

describe('[E2-4e] Rebase character-import-ux onto PocketRisu 1.16.1', () => {
    beforeEach(() => {
        resetDb()
        vi.clearAllMocks()
        h.jobs.length = 0
        h.alertConfirm.mockResolvedValue(true)
        h.alertInput.mockResolvedValue('')
        h.requestCharacterSave.mockResolvedValue(undefined)
        h.loadManifest.mockResolvedValue([['lazy', 'assets/restored.png', 'png']])
    })

    test('[unchanged] e5 gives an imported character a non-empty first-chat id', async () => {
        const result = await cards.importCharacterProcess({ name: 'card.json', data: jsonCardBytes() })
        expect(result).toBe(0)
        expect(h.state.db.characters[0].chats[0].id).toEqual(expect.any(String))
        expect(h.state.db.characters[0].chats[0].id).not.toBe('')
    })

    test('[unchanged] e1d preserves returnCharacter and suppressImportJob result values', async () => {
        const raw = await cards.importCharacterProcess({
            name: 'card.charx',
            data: charxCardBytes(),
            returnCharacter: true,
        })
        expect(raw).toMatchObject({ name: 'Blind Test Character', firstMessage: 'Hello' })

        resetDb()
        const index = await cards.importCharacterProcess({
            name: 'card.json',
            data: jsonCardBytes(),
            suppressImportJob: true,
        } as any)
        expect(index).toBe(0)
    })

    test('[unchanged] e4 preserves onboarding normalization during import', async () => {
        await cards.importCharacterProcess({
            name: 'onboarding.json',
            data: jsonCardBytes(makeCard({
                extensions: {
                    risuai: {
                        onboarding: {
                            enabled: 'yes',
                            mode: 'popup',
                            title: 3,
                            questions: [{ type: 'slider', options: [{ label: 'A' }] }],
                        },
                    },
                },
            })),
        })
        expect(h.state.db.characters[0].onboarding).toMatchObject({
            enabled: false,
            mode: 'form',
            title: '',
            questions: [{ type: 'single', options: [{ label: 'A', value: '' }] }],
        })
    })

    test('[unchanged] e4 preserves blocked-creator rejection before download', async () => {
        h.state.db.blockedRealmCreators = [{ id: 'blocked', name: 'Blocked' }]
        const fetchSpy = vi.spyOn(globalThis, 'fetch')
        await cards.downloadRisuHub('card-id', { creator: 'blocked' })
        expect(h.alertNormal).toHaveBeenCalled()
        expect(fetchSpy).not.toHaveBeenCalled()
        fetchSpy.mockRestore()
    })

    test('[unchanged] e4 preserves character lazy-asset hydration', async () => {
        const source: any = { name: 'Lazy', additionalAssetManifest: { key: 'manifest' } }
        const hydrated = await cards.hydrateCharacterAssets(source)
        expect(h.loadManifest).toHaveBeenCalledWith(source.additionalAssetManifest)
        expect(hydrated.additionalAssets).toEqual([['lazy', 'assets/restored.png', 'png']])
        expect(hydrated.additionalAssetManifest).toBeUndefined()
        expect(source.additionalAssetManifest).toEqual({ key: 'manifest' })
    })

    test.each([
        ['JSON', 'card.json', () => jsonCardBytes()],
        ['PNG', 'card.png', () => pngCardBytes()],
        ['charx', 'card.charx', () => charxCardBytes()],
    ])('[new] e1 imports %s under one job and saves before summary success', async (_format, name, data) => {
        const gate = deferred<void>()
        h.requestCharacterSave.mockReturnValueOnce(gate.promise)
        const pending = cards.importCharacterProcess({ name, data: data() })

        await vi.waitFor(() => expect(h.requestCharacterSave).toHaveBeenCalledTimes(1))
        const character = h.state.db.characters[0]
        expect(character.chats[0].id).toEqual(expect.any(String))
        expect(h.notifySuccess).not.toHaveBeenCalled()
        expect(jobStates().some((status: any) => status.phase === 'success')).toBe(false)

        gate.resolve()
        await expect(pending).resolves.toBe(0)
        expectJobPhase('success')
    })

    test('[new] e1b and e1c3 silently close a stream JSON import that creates nothing', async () => {
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(jsonCardBytes())
                controller.close()
            },
        })
        await expect(cards.importCharacterProcess({ name: 'stream.json', data: stream })).resolves.toBeNull()
        expect(h.requestCharacterSave).not.toHaveBeenCalled()
        expectJobClosed()
    })

    test('[new] e1b silently closes an RCC password cancellation', async () => {
        const metadata = Buffer.from(JSON.stringify({ usePassword: true })).toString('base64')
        const rcc = `rcc||rccv1||AA==||hash||${metadata}`
        const result = await cards.importCharacterProcess({ name: 'password.png', data: pngWithCardText(rcc) })
        expect(result).toBeNull()
        expect(h.alertError).not.toHaveBeenCalled()
        expect(h.requestCharacterSave).not.toHaveBeenCalled()
        expectJobClosed()
    })

    test.each([
        ['invalid JSON card', { name: 'invalid.json', data: new TextEncoder().encode('{}') }],
        ['non-PNG bytes', { name: 'invalid.png', data: new Uint8Array([1, 2, 3]) }],
        ['PNG without card chunks', { name: 'chunkless.png', data: pngWithCardText('', []) }],
        ['charx with malformed embedded module', {
            name: 'module.charx',
            data: charxCardBytes(makeCard(), { 'module.risum': new Uint8Array([0]) }),
        }],
    ])('[new] e1c fails the job but preserves the native error for %s', async (label, options) => {
        if (label.includes('module')) h.moduleRead.mockRejectedValueOnce(new Error('bad embedded module'))
        const outcome = await settledImport(options)
        expect(outcome.error, 'the job boundary absorbs the native failure').toBeUndefined()
        expect(outcome.value).toBeNull()
        expect(h.alertError).toHaveBeenCalled()
        expect(h.requestCharacterSave).not.toHaveBeenCalled()
        expectJobPhase('error')
    })

    test('[new] e1c treats low-level refusal followed by noData as a failed job', async () => {
        h.alertConfirm.mockResolvedValueOnce(false)
        const card = makeCard({ extensions: { risuai: { lowLevelAccess: true } } })
        const outcome = await settledImport({ name: 'low-level.json', data: jsonCardBytes(card) })
        expect(outcome.error).toBeUndefined()
        expect(outcome.value).toBeNull()
        expect(h.alertError).toHaveBeenCalled()
        expectJobPhase('error')
    })

    test('[new] e1c2 succeeds when an oversized data URI is warned and skipped', async () => {
        const fakeUri = {
            startsWith: (prefix: string) => prefix === 'data:',
            split: () => ['data:image/png;base64', { length: 51 * 1024 * 1024 }],
        }
        const card: any = makeCard({
            assets: [{ type: 'emotion', name: 'too-big', uri: fakeUri }],
        })
        const parse = vi.spyOn(JSON, 'parse').mockReturnValueOnce(card)
        const result = await cards.importCharacterProcess({ name: 'warning.json', data: new TextEncoder().encode('{}') })
        parse.mockRestore()

        expect(h.alertError).toHaveBeenCalledWith('Data URI too large')
        expect(h.requestCharacterSave).toHaveBeenCalledTimes(1)
        expect(result).toBe(0)
        expectJobPhase('success')
    })

    test('[new] e1c keeps an added character and unlocks after save rejection', async () => {
        h.requestCharacterSave.mockRejectedValueOnce(new Error('flush failed'))
        const outcome = await settledImport({ name: 'save-reject.json', data: jsonCardBytes() })
        expect(outcome.error).toBeUndefined()
        expect(outcome.value).toBeNull()
        expect(h.state.db.characters).toHaveLength(1)
        expectJobPhase('error')

        h.requestCharacterSave.mockResolvedValueOnce(undefined)
        await expect(cards.importCharacterProcess({ name: 'after-failure.json', data: jsonCardBytes() })).resolves.toBe(1)
    })

    test('[new] e1d bypasses the job wrapper for returnCharacter and suppressImportJob', async () => {
        const state = await importOptional('./characterImportState')
        expect(state, 'characterImportState.ts exists').toBeDefined()
        if (!state) return
        await cards.importCharacterProcess({ name: 'raw.charx', data: charxCardBytes(), returnCharacter: true })
        await cards.importCharacterProcess({ name: 'nested.json', data: jsonCardBytes(), suppressImportJob: true } as any)
        expect(h.requestCharacterSave).not.toHaveBeenCalled()
        expect(h.toast.custom).not.toHaveBeenCalled()
    })

    test('[new] e1f rejects a second import without disturbing the active job', async () => {
        const gate = deferred<void>()
        h.requestCharacterSave.mockReturnValueOnce(gate.promise)
        const first = cards.importCharacterProcess({ name: 'first.json', data: jsonCardBytes() })
        await vi.waitFor(() => expect(h.requestCharacterSave).toHaveBeenCalledTimes(1))

        await expect(cards.importCharacterProcess({ name: 'second.json', data: jsonCardBytes() })).resolves.toBeNull()
        expect(h.requestCharacterSave).toHaveBeenCalledTimes(1)

        gate.resolve()
        await expect(first).resolves.toBe(0)
        await expect(cards.importCharacterProcess({ name: 'third.json', data: jsonCardBytes() })).resolves.toBe(1)
    })

    test('[new] e1h reports PNG asset extraction as n/total through the job', async () => {
        const assets = [1, 2, 3, 4].map((value) => Uint8Array.of(value))
        await cards.importCharacterProcess({ name: 'assets.png', data: pngCardBytes(makeCard(), assets) })
        const visible = JSON.stringify(jobStates().filter((status: any) => status.phase === 'loading'))
        for (const completed of [1, 2, 3, 4]) {
            expect(visible).toMatch(new RegExp(`\\b0*${completed}\\/0*4\\b`))
        }

        resetDb()
        await expect(cards.importCharacterProcess({ name: 'zero-assets.png', data: pngCardBytes() })).resolves.toBe(0)
    })

    test.each([
        ['card JSON', () => [
            new Response(JSON.stringify({ card: makeCard(), img: 'image.png' }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            }),
            new Response(Uint8Array.of(1, 2, 3)),
        ]],
        ['PNG', () => [
            new Response(pngCardBytes() as unknown as BodyInit, { status: 200, headers: { 'content-type': 'image/png' } }),
        ]],
        ['charx', () => [
            new Response(charxCardBytes() as unknown as BodyInit, { status: 200, headers: { 'content-type': 'application/charx' } }),
        ]],
    ])('[new] e1g imports Hub %s in one job and navigates only after save', async (_format, responses) => {
        h.state.db.goCharacterOnImport = true
        const fetchSpy = vi.spyOn(globalThis, 'fetch')
        for (const response of responses()) fetchSpy.mockResolvedValueOnce(response)

        await cards.downloadRisuHub('accepted', { creator: 'allowed' })
        expect(h.requestCharacterSave).toHaveBeenCalledTimes(1)
        expect(h.selectedSet).toHaveBeenCalledWith(0)
        expectJobPhase('success')
        fetchSpy.mockRestore()
    })

    test('[new] e1g refuses a Hub card without navigating to the previous character', async () => {
        h.state.db.characters.push({ chaId: 'existing', chats: [] })
        h.state.db.goCharacterOnImport = true
        h.alertConfirm.mockResolvedValueOnce(false)
        const card = makeCard({ extensions: { risuai: { lowLevelAccess: true } } })
        const fetchSpy = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(new Response(JSON.stringify({ card, img: 'image.png' }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            }))
            .mockResolvedValueOnce(new Response(Uint8Array.of(1, 2, 3)))

        await cards.downloadRisuHub('refused', { creator: 'allowed' })
        expect(h.selectedSet).not.toHaveBeenCalled()
        expect(h.requestCharacterSave).not.toHaveBeenCalled()
        fetchSpy.mockRestore()
    })
})
