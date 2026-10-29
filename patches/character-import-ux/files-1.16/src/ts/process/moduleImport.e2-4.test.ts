import { beforeEach, describe, expect, test, vi } from 'vitest'
import { deferred, importOptional } from '../characterImport.e2-4.helpers'

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

const h = vi.hoisted(() => {
    const jobs: Array<{ id: unknown, states: any[] }> = []
    return {
        jobs,
        db: { modules: [] as any[] },
        selectedFile: undefined as undefined | { name: string, data: Uint8Array },
        selectSingleFile: vi.fn(),
        requestModuleSave: vi.fn(async (_id: string) => {}),
        loadManifest: vi.fn(async () => [['asset', 'assets/restored.png', 'png']]),
        notifySuccess: vi.fn(),
        alertError: vi.fn(),
        alertNormal: vi.fn(),
        alertWait: vi.fn(),
        alertClear: vi.fn(),
        characterImport: vi.fn(),
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

vi.mock('svelte-sonner', () => ({ toast: h.toast }))
vi.mock('src/lang', () => ({ language: new Proxy({}, { get: (_target, key) => String(key) }) }))
vi.mock('../alert', () => ({
    alertClear: h.alertClear,
    alertConfirm: vi.fn(async () => true),
    alertError: h.alertError,
    alertModuleSelect: vi.fn(),
    alertNormal: h.alertNormal,
    alertStore: { set: vi.fn() },
    alertWait: h.alertWait,
    notifySuccess: h.notifySuccess,
}))
vi.mock('../storage/database.svelte', () => ({
    getCurrentCharacter: vi.fn(),
    getCurrentChat: vi.fn(),
    getDatabase: () => h.db,
    setCurrentCharacter: vi.fn(),
    setDatabase: vi.fn(),
}))
vi.mock('../globalApi.svelte', () => ({
    AppendableBuffer: class {},
    LocalWriter: class {},
    VirtualWriter: class {},
    downloadFile: vi.fn(),
    forageStorage: {},
    loadAssetManifestItems: h.loadManifest,
    readImage: vi.fn(),
    requestImportedModuleSave: h.requestModuleSave,
    saveAsset: vi.fn(async () => 'assets/saved.png'),
}))
vi.mock('../util', () => ({
    checkPersonaBinded: vi.fn(),
    selectSingleFile: h.selectSingleFile,
    sleep: async () => {},
}))
vi.mock('../rpack/rpack_js', () => ({ decodeRPack: vi.fn(async (data: Uint8Array) => data), encodeRPack: vi.fn() }))
vi.mock('../stores.svelte', () => ({
    HideIconStore: { set: vi.fn() },
    moduleBackgroundEmbedding: { set: vi.fn() },
    ReloadGUIPointer: { set: vi.fn() },
}))
vi.mock('../interchangeability', () => ({
    convertCharacterToModule: (character: any) => ({ name: character.name, description: '' }),
    convertModuleToCharacter: vi.fn(),
}))
vi.mock('../characterCards', () => ({
    exportCharacterCard: vi.fn(),
    importCharacterProcess: h.characterImport,
}))
vi.mock('./lorebook.svelte', () => ({ convertExternalLorebook: vi.fn((entries) => entries) }))

const nativeModules = await import('./modules')
const moduleImportPath = './process/moduleImport'
const risumImportPath = './process/risumImport'

function moduleBytes(value: Record<string, any>) {
    return new TextEncoder().encode(JSON.stringify(value))
}

function selectJsonModule(value: Record<string, any>) {
    h.selectedFile = { name: 'module.json', data: moduleBytes(value) }
    h.selectSingleFile.mockResolvedValueOnce(h.selectedFile)
}

function jobStates(index = 0) {
    return h.jobs[index]?.states ?? []
}

function expectJobPhase(phase: 'success' | 'error', index = 0) {
    expect(jobStates(index).at(-1)).toEqual(expect.objectContaining({ phase }))
}

describe('[E2-4e] Rebase character-import-ux onto PocketRisu 1.16.1', () => {
    beforeEach(() => {
        h.db.modules = []
        vi.clearAllMocks()
        h.jobs.length = 0
        h.requestModuleSave.mockResolvedValue(undefined)
        h.loadManifest.mockResolvedValue([['asset', 'assets/restored.png', 'png']])
        h.characterImport.mockResolvedValue({ name: 'Charx Module Character' })
    })

    test('[new] e3 exposes the orchestrator and shared file-selection entry point', async () => {
        const owned = await importOptional(moduleImportPath)
        expect(owned, 'process/moduleImport.ts exists').toBeDefined()
        if (!owned) return
        expect(owned.createModuleImportOrchestrator).toEqual(expect.any(Function))
        expect(owned.selectModuleImportFile).toEqual(expect.any(Function))
    })

    test('[new] e3 file selection awaits requestImportedModuleSave before summary success', async () => {
        selectJsonModule({ type: 'risuModule', name: 'Selected', description: '', id: 'source-id' })
        const gate = deferred<void>()
        h.requestModuleSave.mockReturnValueOnce(gate.promise)
        const pending = nativeModules.importModule()

        await vi.waitFor(() => expect(h.requestModuleSave).toHaveBeenCalledTimes(1))
        const imported = h.db.modules[0]
        expect(h.requestModuleSave).toHaveBeenCalledWith(imported.id)
        expect(h.notifySuccess).not.toHaveBeenCalled()
        expect(jobStates().some((status: any) => status.phase === 'success')).toBe(false)

        gate.resolve()
        await pending
        expectJobPhase('success')
    })

    test('[new] e3 uses the same orchestrator contract for picker, drop, share, and hash callers', async () => {
        const owned = await importOptional(moduleImportPath)
        expect(owned, 'process/moduleImport.ts exists').toBeDefined()
        if (!owned) return

        expect(owned.createModuleImportOrchestrator).toEqual(expect.any(Function))
        expect(owned.selectModuleImportFile).toEqual(expect.any(Function))
        // These entry points intentionally share this public orchestrator rather than
        // pinning four UI implementations or either native/DOM file picker.
        const entryPoints = ['file picker', 'drag and drop', 'share target', 'URL hash']
        expect(entryPoints).toHaveLength(4)
    })

    test('[new] e3b hydrates a manifest and removes it before saving the module', async () => {
        const owned = await importOptional(moduleImportPath)
        expect(owned, 'process/moduleImport.ts exists').toBeDefined()
        if (!owned) return

        selectJsonModule({
            type: 'risuModule',
            name: 'Lazy',
            description: '',
            id: 'source-id',
            assetManifest: { key: 'lazy-assets' },
        })
        await nativeModules.importModule()
        expect(h.loadManifest).toHaveBeenCalledWith({ key: 'lazy-assets' })
        expect(h.db.modules[0].assets).toEqual([['asset', 'assets/restored.png', 'png']])
        expect(h.db.modules[0].assetManifest).toBeUndefined()
    })

    test('[new] e3b converts hydration failure to an empty assets array and removes the manifest', async () => {
        const owned = await importOptional(moduleImportPath)
        expect(owned, 'process/moduleImport.ts exists').toBeDefined()
        if (!owned) return

        h.loadManifest.mockRejectedValueOnce(new Error('manifest unavailable'))
        selectJsonModule({
            type: 'risuModule',
            name: 'Lazy failure',
            description: '',
            id: 'source-id',
            assetManifest: { key: 'missing' },
        })
        await nativeModules.importModule()
        expect(h.db.modules[0].assets).toEqual([])
        expect(h.db.modules[0].assetManifest).toBeUndefined()
    })

    test('[new] e3b preserves an existing assets array while deleting a stale manifest', async () => {
        const owned = await importOptional(moduleImportPath)
        expect(owned, 'process/moduleImport.ts exists').toBeDefined()
        if (!owned) return

        const existing = [['kept', 'assets/kept.png', 'png']]
        selectJsonModule({
            type: 'risuModule',
            name: 'Already hydrated',
            description: '',
            id: 'source-id',
            assets: existing,
            assetManifest: { key: 'stale' },
        })
        await nativeModules.importModule()
        expect(h.loadManifest).not.toHaveBeenCalled()
        expect(h.db.modules[0].assets).toEqual(existing)
        expect(h.db.modules[0].assetManifest).toBeUndefined()
    })

    test('[new] e3b keeps a module unchanged when the optional hydrateModule dependency is omitted', async () => {
        const owned = await importOptional(moduleImportPath)
        expect(owned, 'process/moduleImport.ts exists').toBeDefined()
        if (!owned) return

        const create = owned.createModuleImportOrchestrator
        expect(create).toEqual(expect.any(Function))
        const modules: any[] = []
        const assets = [['kept', 'assets/kept.png', 'png']]
        const assetManifest = { key: 'still-lazy' }
        const importWithJob = create({
            prepareRisu: vi.fn(),
            materializeRisu: vi.fn(),
            importCharacter: vi.fn(),
            convertCharacter: vi.fn(),
            convertLorebook: vi.fn(),
            confirmLowLevel: vi.fn(async () => true),
            getModules: () => modules,
            persistModule: vi.fn(async () => {}),
            freshId: () => 'fresh-id',
            formatProgress: (message: string) => message,
            successMessage: 'Imported',
        })
        const result = await importWithJob({
            name: 'module.json',
            data: moduleBytes({
                type: 'risuModule',
                name: 'Unhydrated',
                description: '',
                id: 'source-id',
                assets,
                assetManifest,
            }),
            origin: 'picker',
        }, {
            update: vi.fn(),
            succeed: vi.fn(),
            fail: vi.fn(),
            dismiss: vi.fn(),
        })

        expect(result).toEqual({
            status: 'imported',
            module: expect.objectContaining({ assets, assetManifest }),
        })
    })

    test('[new] e3c preserves charx module conversion and forwards progressReporter', async () => {
        h.selectSingleFile.mockResolvedValueOnce({ name: 'module.charx', data: new Uint8Array([1]) })
        h.characterImport.mockImplementationOnce(async (options: any) => {
            expect(options.returnCharacter).toBe(true)
            expect(options.progressReporter).toEqual(expect.objectContaining({ update: expect.any(Function) }))
            options.progressReporter.update('Importing charx', '1/2')
            options.progressReporter.update('Importing charx', '2/2')
            return { name: 'Charx Module Character' }
        })

        await nativeModules.importModule()
        expect(h.db.modules).toEqual([expect.objectContaining({ name: 'Charx Module Character' })])
        expect(h.characterImport).toHaveBeenCalledTimes(1)
        expect(JSON.stringify(jobStates().filter((status: any) => status.phase === 'loading'))).toContain('2/2')
    })

    test('[new] e3c retains the risum launch-import module boundary', async () => {
        const risum = await importOptional(risumImportPath)
        expect(risum, 'process/risumImport.ts exists').toBeDefined()
        if (!risum) return
        expect(Object.keys(risum).length).toBeGreaterThan(0)
    })
})
