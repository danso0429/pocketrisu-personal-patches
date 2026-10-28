import { beforeEach, describe, expect, test, vi } from 'vitest'

type PackModule = Record<string, unknown>

type P = { id: string; name: string; icon: string; personaPrompt: string; folderId?: string; imageGallery?: string[]; note?: string }
type F = { id: string; name: string }

const h = vi.hoisted(() => ({
    db: { username: 'Active', personaPrompt: 'active prompt', userNote: '', userIcon: '', personas: [] as unknown[], selectedPersona: 0 },
    reads: [] as string[],
    writes: [] as Array<{ img: Uint8Array, chunks: Record<string, string> }>,
    downloads: [] as Array<{ name: string, data: Uint8Array }>,
}))

vi.mock('./storage/database.svelte', () => ({
    getDatabase: () => h.db,
    saveImage: vi.fn(),
    setDatabase: vi.fn(),
}))
vi.mock('./util', () => ({ selectSingleFile: vi.fn(), sleep: async () => {} }))
vi.mock('./alert', () => ({
    alertError: vi.fn(),
    alertStore: { set: vi.fn() },
    notifySuccess: vi.fn(),
    notifyError: vi.fn(),
}))
vi.mock('./globalApi.svelte', () => ({
    AppendableBuffer: class {},
    readImage: async (path: string) => { h.reads.push(path); return new Uint8Array(Buffer.from('IMG:' + path)) },
    downloadFile: async (name: string, data: Uint8Array) => { h.downloads.push({ name, data }) },
}))
vi.mock('src/lang', () => ({ language: { successExport: 'ok', successImport: 'ok', errors: { noData: 'x' } } }))
vi.mock('./process/files/inlays', () => ({ reencodeImage: async (img: Uint8Array) => img }))
vi.mock('./pngChunk', () => ({
    PngChunk: {
        write: async (img: Uint8Array, chunks: Record<string, string>) => {
            h.writes.push({ img, chunks })
            return new Uint8Array(Buffer.from('PNG(' + Buffer.from(img).toString() + ')'))
        },
        readGenerator: async function* () {},
    },
}))

async function loadOrganizer(name: string = 'personaOrganizer'): Promise<PackModule | undefined> {
    try {
        return await import(/* @vite-ignore */ `./${name}.ts`) as PackModule
    } catch {
        return undefined
    }
}

async function organizer() {
    const module = await loadOrganizer()
    expect(module, 'personaOrganizer.ts must exist on the 1.16.1 target').toBeDefined()
    expect(module?.buildPersonaDeletionPlan, 'buildPersonaDeletionPlan export must be retained').toBeTypeOf('function')
    expect(module?.applyPersonaDeletion, 'applyPersonaDeletion export must be retained').toBeTypeOf('function')
    expect(module?.selectedPersonaAfterDeletion, 'selectedPersonaAfterDeletion export must exist').toBeTypeOf('function')
    return {
        build: module!.buildPersonaDeletionPlan as (p: P[], f: F[], sp: string[], sf: string[]) => any,
        apply: module!.applyPersonaDeletion as (p: P[], f: F[], plan: any) => { personas: P[], folders: F[] },
        after: module!.selectedPersonaAfterDeletion as (before: P[], idx: number, after: P[]) => number,
    }
}

const mk = (id: string, folderId?: string): P => ({ id, name: id, icon: '', personaPrompt: 'prompt ' + id, folderId })
const ids = (list: P[]) => list.map((p) => p.id)

async function runDelete(personas: P[], folders: F[], sp: string[], sf: string[]) {
    const o = await organizer()
    const plan = o.build(personas, folders, sp, sf)
    return { plan, result: o.apply(personas, folders, plan) }
}

describe('[E2-4c] Rebase persona-organizer onto native persona folders', () => {
    test('[new] c7 mixed selection of loose personas and a populated folder deletes exactly those, preserving order', async () => {
        const personas = [mk('P1'), mk('P2', 'F1'), mk('P3'), mk('P4', 'F1'), mk('P5', 'F2'), mk('P6')]
        const folders = [{ id: 'F1', name: 'F1' }, { id: 'F2', name: 'F2' }]
        const { plan, result } = await runDelete(personas, folders, ['P1', 'P6'], ['F1'])
        expect(plan.folderIds).toEqual(['F1'])
        expect(ids(plan.loosePersonas)).toEqual(['P1', 'P6'])
        expect([...plan.personaIds].sort()).toEqual(['P1', 'P2', 'P4', 'P6'])
        expect(plan.remainingCount).toBe(2)
        expect(ids(result.personas)).toEqual(['P3', 'P5'])
        expect(result.folders.map((f) => f.id)).toEqual(['F2'])
    })

    test('[new] c7 five personas with a two-member folder: selection survives or falls back to 0', async () => {
        const personas = [mk('A'), mk('B', 'F'), mk('C', 'F'), mk('D'), mk('E')]
        const folders = [{ id: 'F', name: 'F' }]
        const o = await organizer()
        const { result } = await runDelete(personas, folders, ['A'], ['F'])
        expect(ids(result.personas)).toEqual(['D', 'E'])
        expect(o.after(personas, 4, result.personas)).toBe(1)
        expect(o.after(personas, 1, result.personas)).toBe(0)
    })

    test('[new] c7 overlapping selection of a persona inside a selected folder is not double counted', async () => {
        const personas = [mk('P1', 'F1'), mk('P2', 'F1'), mk('P3')]
        const { plan, result } = await runDelete(personas, [{ id: 'F1', name: 'F1' }], ['P1'], ['F1'])
        expect(plan.personaIds).toHaveLength(2)
        expect(new Set(plan.personaIds)).toEqual(new Set(['P1', 'P2']))
        expect(plan.loosePersonas).toEqual([])
        expect(plan.remainingCount).toBe(1)
        expect(ids(result.personas)).toEqual(['P3'])
    })

    test('[new] c7b selecting every persona (via folder and loose) deletes nothing', async () => {
        const personas = [mk('P1'), mk('P2', 'F1'), mk('P3', 'F1')]
        const folders = [{ id: 'F1', name: 'F1' }]
        const { plan, result } = await runDelete(personas, folders, ['P1'], ['F1'])
        expect(plan.remainingCount).toBe(0)
        expect(ids(result.personas)).toEqual(['P1', 'P2', 'P3'])
        expect(result.folders.map((f) => f.id)).toEqual(['F1'])
    })

    test('[new] c7 selecting all but one loose persona deletes the others', async () => {
        const personas = [mk('P1'), mk('P2'), mk('P3')]
        const { plan, result } = await runDelete(personas, [], ['P1', 'P3'], [])
        expect(plan.remainingCount).toBe(1)
        expect(ids(result.personas)).toEqual(['P2'])
    })

    test('[new] c7 deleting an empty folder with a single persona keeps the persona', async () => {
        const { plan, result } = await runDelete([mk('P1')], [{ id: 'F1', name: 'F1' }], [], ['F1'])
        expect(plan.personaIds).toEqual([])
        expect(plan.folderIds).toEqual(['F1'])
        expect(plan.remainingCount).toBe(1)
        expect(ids(result.personas)).toEqual(['P1'])
        expect(result.folders).toEqual([])
    })

    test('[new] c7 deleting some persona members without the folder leaves folder and other members', async () => {
        const personas = [mk('P1', 'F1'), mk('P2', 'F1')]
        const { result } = await runDelete(personas, [{ id: 'F1', name: 'F1' }], ['P1'], [])
        expect(ids(result.personas)).toEqual(['P2'])
        expect(result.personas[0].folderId).toBe('F1')
        expect(result.folders.map((f) => f.id)).toEqual(['F1'])
    })

    test('[new] c7 unknown ids are ignored', async () => {
        const personas = [mk('P1'), mk('P2')]
        const folders = [{ id: 'F1', name: 'F1' }]
        const { plan, result } = await runDelete(personas, folders, ['nope'], ['bad-folder'])
        expect(plan.remainingCount).toBe(2)
        expect(ids(result.personas)).toEqual(['P1', 'P2'])
        expect(result.folders.map((f) => f.id)).toEqual(['F1'])
    })

    test('[new] c7 selectedPersonaAfterDeletion follows the surviving persona to its new index', async () => {
        const o = await organizer()
        const before = [mk('P0'), mk('P1'), mk('P2'), mk('P3')]
        expect(o.after(before, 2, [before[2], before[3]])).toBe(0)
        expect(o.after(before, 3, [before[0], before[3]])).toBe(1)
    })

    test('[new] c7 selectedPersonaAfterDeletion returns 0 when the selected persona was deleted', async () => {
        const o = await organizer()
        const before = [mk('P0'), mk('P1'), mk('P2'), mk('P3')]
        expect(o.after(before, 2, [before[0], before[1], before[3]])).toBe(0)
    })

    test('[new] c7 selectedPersonaAfterDeletion keeps index 0 when persona 0 survives', async () => {
        const o = await organizer()
        const before = [mk('P0'), mk('P1'), mk('P2')]
        expect(o.after(before, 0, [before[0]])).toBe(0)
    })

    test('[new] c7 selectedPersonaAfterDeletion clamps an out-of-bounds selection to 0 without throwing', async () => {
        const o = await organizer()
        const before = [mk('P0'), mk('P1')]
        expect(o.after(before, 5, [before[0]])).toBe(0)
        expect(o.after(before, -1, [before[0]])).toBe(0)
    })

    describe('exportUserPersona', () => {
        beforeEach(() => {
            h.reads.length = 0
            h.writes.length = 0
            h.downloads.length = 0
            vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
                if (tag === 'canvas') {
                    return {
                        width: 0,
                        height: 0,
                        getContext: () => ({ fillStyle: '', fillRect: () => {} }),
                        toDataURL: () => 'data:image/png;base64,' + Buffer.from('GREY').toString('base64'),
                    }
                }
                return {}
            }) as never)
            h.db.personas = [
                { name: 'Zero', personaPrompt: 'prompt zero', note: 'n0', icon: 'p0_icon.png', imageGallery: ['p0_gal.png', 'gal_b.png', 'gal_c.png'], id: 'z' },
                { name: 'One', personaPrompt: 'prompt one', icon: 'p1_icon.png', imageGallery: ['p1_gal.png'], id: 'o' },
                { name: 'NoIcon', personaPrompt: 'prompt none', icon: '', id: 'n' },
                { name: 'Legacy', personaPrompt: 'prompt legacy', icon: 'legacy.png', id: 'l' },
            ]
        })

        const exportPersona = async (index?: number, imagePath?: string) => {
            const mod = await import('./persona') as unknown as { exportUserPersona: (i?: number, p?: string) => Promise<void> }
            await mod.exportUserPersona(index, imagePath)
        }
        const cardOf = () => JSON.parse(Buffer.from(h.writes.at(-1)!.chunks.persona, 'base64').toString())
        const bodyOf = () => Buffer.from(h.writes.at(-1)!.img).toString()

        test('[new] c8 a gallery image is used as the PNG body and the persona chunk is unchanged', async () => {
            await exportPersona(0)
            const baseline = h.writes.at(-1)!.chunks.persona
            h.reads.length = 0
            await exportPersona(0, 'gal_b.png')
            expect(h.reads).toEqual(['gal_b.png'])
            expect(bodyOf()).toBe('IMG:gal_b.png')
            expect(h.writes.at(-1)!.chunks.persona).toBe(baseline)
            expect(cardOf()).toEqual({ name: 'Zero', personaPrompt: 'prompt zero', note: 'n0' })
            expect(Buffer.from(h.downloads.at(-1)!.data).toString()).toBe('PNG(IMG:gal_b.png)')
            expect(h.downloads.at(-1)!.name).toBe('Zero_export.png')
        })

        test('[unchanged] c8b imagePath equal to the persona icon uses the icon', async () => {
            await exportPersona(0, 'p0_icon.png')
            expect(h.reads).toEqual(['p0_icon.png'])
            expect(bodyOf()).toBe('IMG:p0_icon.png')
        })

        test('[unchanged] c8b without an image argument the icon is used, or the grey image when absent', async () => {
            await exportPersona(0)
            expect(h.reads).toEqual(['p0_icon.png'])
            expect(bodyOf()).toBe('IMG:p0_icon.png')
            h.reads.length = 0
            await exportPersona(2)
            expect(h.reads).toEqual([])
            expect(bodyOf()).toBe('GREY')
            expect(cardOf().name).toBe('NoIcon')
        })

        test('[unchanged] c8b the active persona export without arguments uses the active icon', async () => {
            h.db.userIcon = 'main.png'
            await exportPersona()
            expect(h.reads).toEqual(['main.png'])
            expect(bodyOf()).toBe('IMG:main.png')
            expect(cardOf().name).toBe('Active')
        })

        test('[unchanged] c8b a path belonging to another persona or arbitrary path falls back to the icon', async () => {
            await exportPersona(0, 'p1_gal.png')
            expect(h.reads).toEqual(['p0_icon.png'])
            expect(bodyOf()).toBe('IMG:p0_icon.png')
            h.reads.length = 0
            await exportPersona(0, '/etc/passwd')
            expect(h.reads).toEqual(['p0_icon.png'])
        })

        test('[unchanged] c8b a foreign path for a persona without an icon falls back to the grey image', async () => {
            await exportPersona(2, 'unowned_image.png')
            expect(h.reads).toEqual([])
            expect(bodyOf()).toBe('GREY')
        })

        test('[unchanged] c8b a persona without imageGallery does not throw on a foreign or own path', async () => {
            await expect(exportPersona(3, 'some_path.png')).resolves.toBeUndefined()
            expect(h.reads).toEqual(['legacy.png'])
            h.reads.length = 0
            await expect(exportPersona(3, 'legacy.png')).resolves.toBeUndefined()
            expect(h.reads).toEqual(['legacy.png'])
        })
    })
})
