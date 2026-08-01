import { beforeEach, describe, expect, test, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
    fileData: new Uint8Array(),
    downloads: [] as Array<{ name: string, data: Uint8Array }>,
    errors: [] as unknown[],
    db: {
        presetRegex: [],
        dynamicAssets: false,
    } as any,
}))

vi.mock('svelte/store', () => ({
    get: (store: any) => store?.value,
}))

vi.mock('../stores.svelte', () => ({
    CharEmotion: {},
    selectedCharID: { value: 0 },
}))

vi.mock('../storage/database.svelte', () => ({
    getDatabase: () => runtime.db,
    getCurrentCharacter: () => null,
    getCurrentChat: () => null,
}))

vi.mock('../globalApi.svelte', () => ({
    downloadFile: (name: string, data: Uint8Array) => {
        runtime.downloads.push({ name, data })
    },
}))

vi.mock('../alert', () => ({
    alertError: (error: unknown) => runtime.errors.push(error),
    notifySuccess: () => {},
}))

vi.mock('src/lang', () => ({
    language: { successExport: 'exported' },
}))

vi.mock('../util', () => ({
    selectSingleFile: async () => ({ name: 'regex.json', data: runtime.fileData }),
}))

vi.mock('../parser/parser.svelte', () => ({
    assetRegex: /$^/,
    risuChatParser: (value: string) => value,
}))

vi.mock('./modules', () => ({
    getModuleAssets: () => [],
    getModuleRegexScripts: () => [],
}))

vi.mock('./memory/hypamemory', () => ({
    HypaProcesser: class {},
}))

vi.mock('./scriptings', () => ({
    runLuaEditTrigger: async (_char: unknown, _mode: unknown, data: string) => data,
}))

vi.mock('../plugins/plugins.svelte', () => ({
    pluginV2: {
        editinput: new Set(),
        editoutput: new Set(),
        editprocess: new Set(),
        editdisplay: new Set(),
        edittrans: new Set(),
    },
}))

vi.mock('./triggers', () => ({
    runTrigger: async () => null,
}))

const {
    exportRegex,
    importRegex,
    processScriptFull,
    resetScriptCache,
} = await import('./scripts')

type RegexRecord = {
    comment: string
    in: string
    out: string
    flag: string
    ableFlag: boolean
    type: string
    types?: string[]
}

function record(type: string, extra: Partial<RegexRecord> = {}): RegexRecord {
    return {
        comment: 'same',
        in: 'before',
        out: 'after',
        flag: 'g',
        ableFlag: true,
        type,
        ...extra,
    }
}

async function importRecords(records: RegexRecord[], target: RegexRecord[] = []) {
    runtime.fileData = Buffer.from(JSON.stringify({ type: 'regex', data: records }))
    return await importRegex(target as any) as RegexRecord[]
}

beforeEach(() => {
    runtime.fileData = new Uint8Array()
    runtime.downloads = []
    runtime.errors = []
    runtime.db = {
        presetRegex: [],
        dynamicAssets: false,
    }
    resetScriptCache()
})

describe('regex import execution multiplicity', () => {
    test('merges equal-key records only when their directions are disjoint', async () => {
        const result = await importRecords([
            record('editinput'),
            record('editoutput'),
        ])

        expect(result).toEqual([{
            ...record('editinput'),
            types: ['editinput', 'editoutput'],
        }])
        expect(runtime.errors).toEqual([])
    })

    test('keeps same-direction duplicates as separate canonical rows', async () => {
        const inputs = [record('editinput'), record('editinput')]

        const result = await importRecords(inputs)

        expect(result).toHaveLength(2)
        expect(result.map((item) => item.type)).toEqual(['editinput', 'editinput'])
        expect(result.every((item) => item.types === undefined)).toBe(true)
        expect(result[0]).not.toBe(inputs[0])
        expect(result[1]).not.toBe(inputs[1])
    })

    test('starts a new row when any incoming direction overlaps', async () => {
        const result = await importRecords([
            record('editinput', { types: ['editinput', 'editoutput'] }),
            record('editoutput', { types: ['editoutput', 'editprocess'] }),
        ])

        expect(result).toHaveLength(2)
        expect(result.map((item) => item.types)).toEqual([
            ['editinput', 'editoutput'],
            ['editoutput', 'editprocess'],
        ])
    })

    test('uses the first disjoint row and preserves multiplicity through vanilla export', async () => {
        const result = await importRecords([
            record('editinput'),
            record('editinput'),
            record('editoutput'),
        ])

        expect(result).toHaveLength(2)
        expect(result[0].types).toEqual(['editinput', 'editoutput'])
        expect(result[1]).toEqual(record('editinput'))

        exportRegex(result as any)

        expect(runtime.downloads).toHaveLength(1)
        const exported = JSON.parse(Buffer.from(runtime.downloads[0].data).toString('utf8'))
        expect(exported.type).toBe('regex')
        expect(exported.data.map((item: RegexRecord) => item.type)).toEqual([
            'editinput',
            'editoutput',
            'editinput',
        ])
        expect(exported.data.every((item: RegexRecord) => item.types === undefined)).toBe(true)

        runtime.fileData = new Uint8Array(runtime.downloads[0].data)
        const roundTrip = await importRegex([] as any) as RegexRecord[]
        expect(roundTrip).toEqual(result)
    })

    test('executes every preserved same-direction row exactly once', async () => {
        const scripts = await importRecords([
            record('editinput', { in: 'a', out: 'aa' }),
            record('editinput', { in: 'a', out: 'aa' }),
        ])

        const processed = await processScriptFull({
            type: 'simple',
            chaId: 'multiplicity-test',
            customscript: scripts,
            additionalAssets: [],
        } as any, 'a', 'editinput')

        expect(processed.data).toBe('aaaa')
    })

    test('does not merge into pre-existing target rows or across different keys', async () => {
        const existing = record('editinput')
        const result = await importRecords([
            record('editoutput'),
            record('editprocess', { comment: 'different' }),
        ], [existing])

        expect(result).toHaveLength(3)
        expect(result[0]).toBe(existing)
        expect(result[1]).toEqual(record('editoutput'))
        expect(result[2]).toEqual(record('editprocess', { comment: 'different' }))
    })
})
