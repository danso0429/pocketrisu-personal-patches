import { describe, expect, test } from 'vitest'
import { groupByFolder } from './folders'

type PackModule = Record<string, unknown>

async function loadPackModule(name: 'personaOrganizer' | 'personaImages'): Promise<PackModule | undefined> {
    try {
        return await import(/* @vite-ignore */ `./${name}.ts`) as PackModule
    } catch {
        return undefined
    }
}

describe('[E2-4c] Rebase persona-organizer onto native persona folders', () => {
    test('[unchanged] c1 native folder grouping reads the existing personaFolders and folderId field names', () => {
        const folders = [
            { id: 'f-old', name: 'Old folder', icon: 'assets/folder-icon.png' },
            { id: 'f-empty', name: 'Empty folder' },
        ]

        const groups = groupByFolder(['f-old', undefined, 'missing'], folders)

        expect(groups.map((group) => ({
            id: group.folder?.id ?? null,
            icon: (group.folder as { icon?: string } | null)?.icon,
            indexes: group.indexes,
        }))).toEqual([
            { id: 'f-old', icon: 'assets/folder-icon.png', indexes: [0] },
            { id: 'f-empty', icon: undefined, indexes: [] },
            { id: null, icon: undefined, indexes: [1, 2] },
        ])
    })

    test('[new] c1 the rebased gallery module reads the 1.10 imageGallery field without renaming it', async () => {
        const module = await loadPackModule('personaImages')
        expect(module, 'personaImages.ts must exist on the 1.16.1 target').toBeDefined()
        expect(module?.getPersonaImageGallery, 'getPersonaImageGallery export must be retained').toBeTypeOf('function')

        const persona = {
            name: 'Legacy persona',
            icon: 'assets/active.png',
            imageGallery: ['assets/gallery.png', 'assets/active.png'],
            personaPrompt: '',
        }
        const gallery = (module!.getPersonaImageGallery as (value: typeof persona) => string[])(persona)

        expect(gallery).toEqual(['assets/gallery.png', 'assets/active.png'])
        expect(persona.imageGallery).toEqual(['assets/gallery.png', 'assets/active.png'])
    })

    test('[new] c4 selected-folder creation and import resolve to that native folder, while no selection stays unfiled', async () => {
        const module = await loadPackModule('personaOrganizer')
        expect(module, 'personaOrganizer.ts must exist on the 1.16.1 target').toBeDefined()
        expect(module?.resolvePersonaFolderId, 'resolvePersonaFolderId export must be retained').toBeTypeOf('function')

        const resolve = module!.resolvePersonaFolderId as (
            folders: Array<{ id: string; name: string }>,
            folderId?: string | null,
        ) => string | undefined
        const folders = [{ id: 'f-scifi', name: 'Sci-Fi' }]

        expect(resolve(folders, 'f-scifi')).toBe('f-scifi')
        expect(resolve(folders, undefined)).toBeUndefined()
        expect(resolve(folders, 'deleted-folder')).toBeUndefined()
    })

    test('[new] c5 picker scope filters a folder, unfiled personas, an empty folder, and all personas', async () => {
        const module = await loadPackModule('personaOrganizer')
        expect(module, 'personaOrganizer.ts must exist on the 1.16.1 target').toBeDefined()
        expect(module?.filterPersonaPicker, 'filterPersonaPicker export must be retained').toBeTypeOf('function')
        expect(module?.personaPickerFolderScope, 'personaPickerFolderScope export must be retained').toBeTypeOf('function')

        const personas = [
            { id: 'a', name: 'A', icon: '', personaPrompt: '', folderId: 'f1' },
            { id: 'b', name: 'B', icon: '', personaPrompt: '', folderId: 'f2' },
            { id: 'c', name: 'C', icon: '', personaPrompt: '' },
        ]
        const folders = [
            { id: 'f1', name: 'Folder 1' },
            { id: 'f2', name: 'Folder 2' },
            { id: 'f3', name: 'Folder 3' },
        ]
        const filter = module!.filterPersonaPicker as (
            personaList: typeof personas,
            folderList: typeof folders,
            query: string,
            scope: string,
        ) => Array<{ persona: { id: string } }>
        const folderScope = module!.personaPickerFolderScope as (id: string) => string
        const ids = (scope: string) => filter(personas, folders, '', scope).map((entry) => entry.persona.id)

        expect(ids(folderScope('f1'))).toEqual(['a'])
        expect(ids(module!.PERSONA_PICKER_SCOPE_UNFILED as string)).toEqual(['c'])
        expect(ids(folderScope('f3'))).toEqual([])
        expect(ids(module!.PERSONA_PICKER_SCOPE_ALL as string)).toEqual(['a', 'b', 'c'])
    })
})
