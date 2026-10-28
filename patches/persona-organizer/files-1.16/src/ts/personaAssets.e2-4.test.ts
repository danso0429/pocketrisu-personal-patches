import { describe, expect, test, vi } from 'vitest'
import { writable } from 'svelte/store'

vi.mock('./storage/database.svelte', () => ({
    setDatabase: vi.fn(),
    defaultSdDataFunc: vi.fn(),
    getDatabase: vi.fn(() => ({})),
    appVer: 'test',
    nodeOnlyVer: 'test',
    getCurrentCharacter: vi.fn(),
    loadTogglesFromChat: vi.fn(),
}))
vi.mock('./stores.svelte', () => ({
    MobileGUI: writable(false),
    botMakerMode: writable(false),
    selectedCharID: writable(0),
    loadedStore: writable(false),
    DBState: { db: {} },
    LoadingStatusState: { text: '', loaded: false },
    selIdState: writable(0),
    ReloadGUIPointer: writable(0),
    bodyIntercepterStore: writable(null),
    claimLoadingOverlay: vi.fn(),
    chatDeselected: writable(false),
}))

const { getUncleanables, replaceDbResources } = await import('./globalApi.svelte')

describe('[E2-4c] Rebase persona-organizer onto native persona folders', () => {
    test('[new] c2 client cleanup protects gallery and folder-icon references and releases them when dereferenced', () => {
        const db = {
            characters: [],
            modules: [],
            characterOrder: [],
            personas: [{
                name: 'Persona',
                icon: '',
                imageGallery: ['assets/gallery-only.png'],
                personaPrompt: '',
            }],
            personaFolders: [{ id: 'folder-1', name: 'Folder', icon: 'assets/folder-only.png' }],
        } as any

        const protectedAssets = getUncleanables(db)
        expect(protectedAssets).toContain('gallery-only.png')
        expect(protectedAssets).toContain('folder-only.png')

        db.personas[0].imageGallery = []
        db.personaFolders[0].icon = ''
        const released = getUncleanables(db)
        expect(released).not.toContain('gallery-only.png')
        expect(released).not.toContain('folder-only.png')
    })

    test('[new] c2 resource replacement rewrites gallery and folder-icon references', () => {
        const db = {
            characters: [],
            personas: [{
                name: 'Persona',
                icon: '',
                imageGallery: ['assets/gallery-old.png'],
                personaPrompt: '',
            }],
            personaFolders: [{ id: 'folder-1', name: 'Folder', icon: 'assets/folder-old.png' }],
        } as any

        replaceDbResources(db, {
            'assets/gallery-old.png': 'assets/gallery-new.png',
            'assets/folder-old.png': 'assets/folder-new.png',
        })

        expect(db.personas[0].imageGallery).toEqual(['assets/gallery-new.png'])
        expect(db.personaFolders[0].icon).toBe('assets/folder-new.png')
    })
})
