import { describe, expect, test } from 'vitest'

type SearchEntry = {
    chaId: string
    index: number
    name: string
    image: string
    chatCount: number
    lastInteraction: number
    creationDate: number
    archived: boolean
    hidden: boolean
    trashed: boolean
    creator?: string
    tags?: string[]
}

type CharacterManagerModule = {
    matchesSearch?: (name: string, search: string) => boolean
    matchesCharacterSearch?: (entry: SearchEntry, search: string) => boolean
    buildManagerEntries?: (db: unknown) => Map<string, SearchEntry>
}

async function loadManager(): Promise<CharacterManagerModule> {
    return await import('./characterManager') as CharacterManagerModule
}

function entry(name: string, extra: Partial<SearchEntry> = {}): SearchEntry {
    return {
        chaId: name,
        index: 0,
        name,
        image: '',
        chatCount: 0,
        lastInteraction: 0,
        creationDate: 0,
        archived: false,
        hidden: false,
        trashed: false,
        ...extra,
    }
}

describe('[E2-4b] Rebuild Korean search on the native character manager and retire character-organizer', () => {
    test('[unchanged] b3 keeps the exported native matcher behavior for Latin, numeric, and empty searches', async () => {
        const manager = await loadManager()
        expect(typeof manager.matchesSearch).toBe('function')
        const matchesSearch = manager.matchesSearch!

        expect(matchesSearch('Agent-007', 'agent')).toBe(true)
        expect(matchesSearch('Agent-007', '007')).toBe(true)
        expect(matchesSearch('Cafe\u0301', 'cafe')).toBe(true)
        expect(matchesSearch('anything', '')).toBe(true)
        expect(matchesSearch('anything', '   ')).toBe(true)
    })

    test('[new] b1 finds a Korean name by choseong, jamo, romanization, and QWERTY mistype', async () => {
        const manager = await loadManager()
        expect(typeof manager.matchesCharacterSearch).toBe('function')
        const matchesCharacterSearch = manager.matchesCharacterSearch!
        const hong = entry('홍길동')

        for (const query of ['ㅎㄱㄷ', 'ㅎㅗㅇ', 'ghdrlfehd']) {
            expect(matchesCharacterSearch(hong, query), query).toBe(true)
        }
        // Hangul query romanized onto a Latin-named entry (1.10 matcher direction).
        expect(matchesCharacterSearch(entry('Hong Gildong'), '홍길동')).toBe(true)
    })

    test('[new] b2 indexes creator and tags only for active characters and safely searches archived stubs by name', async () => {
        const manager = await loadManager()
        expect(typeof manager.matchesCharacterSearch).toBe('function')
        expect(typeof manager.buildManagerEntries).toBe('function')

        const entries = manager.buildManagerEntries!({
            characters: [{
                chaId: 'active',
                name: 'Alpha',
                image: '',
                chats: [],
                creator: '김제작 (KimCreator)',
                tags: ['판타지'],
            }],
            nodeOnlyArchivedCharacters: [
                { chaId: 'stub-name', name: 'Beta (판타지)', image: '' },
                { chaId: 'stub-no-metadata', name: 'Gamma', image: '' },
            ],
            nodeOnlyHiddenCharacterIds: [],
        })
        const active = entries.get('active')!
        const stubByName = entries.get('stub-name')!
        const stubWithoutMetadata = entries.get('stub-no-metadata')!

        expect(active).toMatchObject({ creator: '김제작 (KimCreator)', tags: ['판타지'] })
        expect(stubWithoutMetadata).not.toHaveProperty('creator')
        expect(stubWithoutMetadata).not.toHaveProperty('tags')
        expect(manager.matchesCharacterSearch!(active, '김제작')).toBe(true)
        expect(manager.matchesCharacterSearch!(active, 'ㄱㅈㅈ')).toBe(true)
        expect(manager.matchesCharacterSearch!(active, '판타지')).toBe(true)
        expect(manager.matchesCharacterSearch!(stubByName, '판타지')).toBe(true)
        expect(manager.matchesCharacterSearch!(stubWithoutMetadata, '김제작')).toBe(false)
        expect(manager.matchesCharacterSearch!(stubWithoutMetadata, '판타지')).toBe(false)
    })

    test('[new] b3 is never narrower than native search for Latin, numeric, and empty queries', async () => {
        const manager = await loadManager()
        expect(typeof manager.matchesCharacterSearch).toBe('function')
        expect(typeof manager.matchesSearch).toBe('function')
        const matchesCharacterSearch = manager.matchesCharacterSearch!
        const matchesSearch = manager.matchesSearch!
        const entries = [entry('Cafe\u0301'), entry('Café'), entry('Agent-007'), entry('symbols _ name')]

        for (const candidate of entries) {
            for (const query of ['cafe', '007', 'agent', '', '   ']) {
                if (matchesSearch(candidate.name, query)) {
                    expect(matchesCharacterSearch(candidate, query), `${candidate.name} / ${query}`).toBe(true)
                }
            }
        }
        expect(entries.filter((candidate) => matchesCharacterSearch(candidate, '')).length).toBe(entries.length)
    })

    test('[new] b4 applies the unified matcher to Korean and normalized names in trash entries', async () => {
        const manager = await loadManager()
        expect(typeof manager.matchesCharacterSearch).toBe('function')
        const matchesCharacterSearch = manager.matchesCharacterSearch!
        const trash = [
            entry('춘향이', { trashed: true }),
            entry('Cafe\u0301', { trashed: true }),
        ]
        const latinTrash = entry('Chunhyang', { trashed: true })

        expect(trash.filter((candidate) => matchesCharacterSearch(candidate, 'ㅊㅎㅇ')).map(({ name }) => name))
            .toEqual(['춘향이'])
        expect(matchesCharacterSearch(latinTrash, '춘향')).toBe(true)
        expect(trash.filter((candidate) => matchesCharacterSearch(candidate, 'cafe')).map(({ name }) => name))
            .toEqual(['Cafe\u0301'])
    })
})
