import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import {
    characterCardRequiresLowLevel,
    prepareCharacterCard,
    prepareOffSpecCharacter,
} from './backgroundImportCharacter'

const mocks = vi.hoisted(() => {
    let nextId = 0
    const db: any = { characters: [], statics: { imports: 0 }, modules: [], account: {} }
    let confirmation = true
    const saved: Array<{ bytes: number; fileName: string; path: string }> = []
    function assetPath(data: Uint8Array, fileName = '') {
        const hash = createHash('sha256').update(data).digest('hex')
        const ext = fileName.includes('.') ? fileName.split('.').pop() : 'png'
        const path = `assets/${hash}.${ext}`
        saved.push({ bytes: data.byteLength, fileName, path })
        return path
    }
    return {
        db,
        saved,
        reset() {
            db.characters = []
            db.statics = { imports: 0 }
            nextId = 0
            confirmation = true
            saved.length = 0
        },
        id() { return `fixture-id-${++nextId}` },
        assetPath,
        setConfirmation(value: boolean) { confirmation = value },
        confirmation: () => confirmation,
    }
})

vi.mock('uuid', () => ({ v4: () => mocks.id() }))
vi.mock('../alert', () => ({
    alertCardExport: vi.fn(),
    alertConfirm: async () => mocks.confirmation(),
    alertError: vi.fn(), alertInput: vi.fn(),
    alertStore: { set: vi.fn() }, alertTOS: vi.fn(), alertWait: vi.fn(),
    notifySuccess: vi.fn(), notifyError: vi.fn(),
}))
vi.mock('../storage/database.svelte', () => ({
    defaultSdDataFunc: () => ({ sd: 'default' }),
    setDatabase: vi.fn(), importPreset: vi.fn(), getDatabase: () => mocks.db,
    setDatabaseLite: vi.fn(), appVer: 'spike',
    newChatModelDefaults: () => ({ model: 'default-chat' }),
}))
vi.mock('../util', () => ({
    checkNullish: (value: unknown) => value === null || value === undefined,
    decryptBuffer: vi.fn(), isKnownUri: () => false,
    selectFileByDom: vi.fn(), sleep: async () => undefined,
}))
vi.mock('src/lang', () => ({ language: { errors: { noData: 'no data' }, lowLevelAccessConfirm: 'confirm' } }))
vi.mock('../characters', () => ({ characterFormatUpdate: (value: unknown) => value }))
vi.mock('../globalApi.svelte', () => ({
    AppendableBuffer: class {}, BlankWriter: class {}, checkCharOrder: vi.fn(),
    downloadFile: vi.fn(), forageStorage: {}, loadAsset: vi.fn(), LocalWriter: class {},
    readImage: vi.fn(), requestImportedCharacterSave: vi.fn(),
    saveAsset: async (data: Uint8Array, _customId = '', fileName = '') => mocks.assetPath(data, fileName),
    VirtualWriter: class {},
}))
vi.mock('../media', () => ({ compressImage: vi.fn(), getImageType: vi.fn() }))
vi.mock('../stores.svelte', async () => {
    const { writable } = await import('svelte/store')
    return { selectedCharID: writable(0) }
})
vi.mock('../routing', () => ({ openSettings: vi.fn(), SettingsRoute: { Module: 'module' } }))
vi.mock('../parser/parser.svelte', () => ({ hasher: vi.fn() }))
vi.mock('./files/inlays', () => ({ reencodeImage: vi.fn() }))
vi.mock('../pngChunk', () => ({ PngChunk: {} }))
vi.mock('./processzip', () => ({
    CharXImporter: class {}, CharXSkippableChecker: class {}, CharXWriter: class {},
}))
vi.mock('./modules', () => ({ exportModuleLegacy: vi.fn(), importModuleSource: vi.fn(), readModule: vi.fn() }))
vi.mock('../personalSettings', () => ({ shouldStayOnCurrentCharacterAfterImport: () => false }))
vi.mock('../characterImportState', () => ({
    beginCharacterImport: vi.fn(), formatCharacterImportProgress: (message: string) => message,
}))

import { importCharacterProcess } from '../characterCards'

function deps() {
    return {
        freshId: () => mocks.id(),
        defaultSdData: () => ({ sd: 'default' }),
        newChatDefaults: () => ({ model: 'default-chat' }),
        saveAsset: async (data: Uint8Array, fileName = '') => mocks.assetPath(data, fileName),
        isKnownUri: () => false,
    }
}

function baseData() {
    return {
        name: 'Fixture', description: 'description', personality: 'personality',
        scenario: 'scenario', first_mes: 'hello', mes_example: 'example',
        creator_notes: 'notes', system_prompt: 'system',
        post_history_instructions: 'phi', alternate_greetings: ['alt'],
        tags: ['tag'], creator: 'creator', character_version: '1',
        extensions: {}, group_only_greetings: [],
    }
}

async function foreground(card: any) {
    const result = await importCharacterProcess({
        name: 'fixture.json',
        data: new TextEncoder().encode(JSON.stringify(card)),
        suppressImportJob: true,
    })
    expect([0, undefined]).toContain(result)
    expect(mocks.db.characters).toHaveLength(1)
    return structuredClone(mocks.db.characters[0])
}

describe('pure character preparation', () => {
    beforeEach(() => {
        mocks.reset()
        ;(globalThis as any).safeStructuredClone = structuredClone
    })

    test('complex V3 result equals the current foreground importer', async () => {
        const data: any = baseData()
        data.nickname = 'nick'
        data.creation_date = 10
        data.modification_date = 20
        data.group_only_greetings = ['group']
        data.character_book = {
            scan_depth: 5, token_budget: 400, recursive_scanning: true,
            extensions: { risu_fullWordMatching: true },
            entries: [{
                keys: ['key'], secondary_keys: ['second'], content: 'lore',
                extensions: { useProbability: true, probability: 50 },
                enabled: true, insertion_order: 7, use_regex: false,
                constant: true, selective: true, name: 'Lore',
            }],
        }
        data.extensions = {
            risuai: {
                lowLevelAccess: true, bias: [['bias', 1]], viewScreen: 'emotion',
                customScripts: [{ comment: 'regex' }], utilityBot: true,
                sdData: { custom: true }, triggerscript: [{ comment: 'trigger' }],
                backgroundHTML: '<div></div>', additionalText: 'extra',
                defaultVariables: 'a=b', source: ['source'],
            },
            custom_extension: { preserved: true },
        }
        const icon = Buffer.from('icon').toString('base64')
        const emotion = Buffer.from('emotion').toString('base64')
        data.assets = [
            { type: 'icon', uri: `data:image/png;base64,${icon}`, name: 'main', ext: 'png' },
            { type: 'emotion', uri: `data:image/png;base64,${emotion}`, name: 'happy', ext: 'png' },
        ]
        const card = { spec: 'chara_card_v3', spec_version: '3.0', data }
        const current = await foreground(card)
        mocks.reset()
        const pure = await prepareCharacterCard(card, deps(), {
            authorized: true,
            maxInlineAssetBytes: 50 * 1024 * 1024,
        })
        expect(pure).toEqual(current)
    })

    test('V2 Risu assets and VITS equal the current foreground importer', async () => {
        const data: any = baseData()
        data.extensions = { risuai: {
            emotions: [['happy', Buffer.from('emotion').toString('base64')]],
            additionalAssets: [['asset', Buffer.from('additional').toString('base64'), 'file.bin']],
            vits: { voice: Buffer.from('voice').toString('base64') },
            source: ['v2-source'],
        } }
        const card = { spec: 'chara_card_v2', spec_version: '2.0', data }
        const current = await foreground(card)
        mocks.reset()
        const pure = await prepareCharacterCard(card, deps(), {
            authorized: true,
            maxInlineAssetBytes: 50 * 1024 * 1024,
        })
        expect(pure).toEqual(current)
    })

    test('off-spec result equals current conversion', async () => {
        const card = {
            name: 'Old', description: 'desc', personality: 'personality',
            scenario: 'scenario', first_mes: 'first', mes_example: 'example',
        }
        const current = await foreground(card)
        mocks.reset()
        const pure = prepareOffSpecCharacter(card, undefined, deps())
        expect(pure).toEqual(current)
    })

    test('low-level refusal is detectable before any asset write', async () => {
        const data: any = baseData()
        data.extensions = { risuai: { lowLevelAccess: true } }
        data.assets = [{
            type: 'icon', uri: `data:image/png;base64,${Buffer.from('icon').toString('base64')}`,
            name: 'main', ext: 'png',
        }]
        const card = { spec: 'chara_card_v3', spec_version: '3.0', data }
        expect(characterCardRequiresLowLevel(card)).toBe(true)
        await expect(prepareCharacterCard(card, deps(), {
            authorized: false,
            maxInlineAssetBytes: 50 * 1024 * 1024,
        })).rejects.toHaveProperty('code', 'IMPORT_AUTHORIZATION_REQUIRED')
        expect(mocks.saved).toHaveLength(0)
    })
})
