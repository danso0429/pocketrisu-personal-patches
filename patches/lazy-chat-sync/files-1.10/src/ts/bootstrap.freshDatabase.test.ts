import { describe, expect, test, vi } from 'vitest'
import fs from 'node:fs'
import ts from 'typescript'
import { createRequire } from 'node:module'

vi.mock('./storage/database.svelte', () => ({
    createBotPresetTemplate: () => ({}),
    getDatabase: () => ({}),
}))
vi.mock('./globalApi.svelte', () => ({ forageStorage: { realStorage: null } }))
vi.mock('./storage/chatStorage', () => ({
    chatToStub: (chat: any) => ({ id: chat.id, name: chat.name, _stub: true }),
}))

import {
    decodeRisuSave,
    encodeRisuSaveLegacy,
    RisuSavePatcher,
} from './storage/risuSave'

const source = ts.createSourceFile(
    'bootstrap.ts',
    fs.readFileSync('src/ts/bootstrap.ts', 'utf8'),
    ts.ScriptTarget.Latest,
    true,
)
const loadData = source.statements.find((node: ts.Node) =>
    ts.isFunctionDeclaration(node) && node.name?.text === 'loadData'
) as ts.FunctionDeclaration | undefined
const loadedGuard = loadData?.body?.statements.find(ts.isIfStatement)
const loadTry = loadedGuard && ts.isBlock(loadedGuard.thenStatement)
    ? loadedGuard.thenStatement.statements.find(ts.isTryStatement)
    : undefined
const freshFlag = loadTry?.tryBlock.statements.find((node: ts.Node) =>
    ts.isVariableStatement(node) && node.getText(source).includes('createdFreshDatabase')
)
const startupBlock = loadTry?.tryBlock.statements.find((node: ts.Node) =>
    ts.isBlock(node) && node.getText(source).includes('loadDatabaseForStartup')
)
if (!freshFlag || !startupBlock) {
    throw new Error('Composed bootstrap.ts has no fresh-database startup branch')
}

const startupJavascript = ts.transpile(
    `${freshFlag.getText(source)}\n${startupBlock.getText(source)}`,
    { target: ts.ScriptTarget.ES2022 },
)
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

type StartupLoad = {
    bytes: Uint8Array | null
    decoded: any
    fromCache: boolean
}

async function runStartup(
    startupLoad: StartupLoad | Error,
    options: {
        failWrite?: boolean
        mutateLiveDatabase?: boolean
        onWrite?: (key: string, bytes: Uint8Array) => void
        onBaseline?: (baseline: any) => void
    } = {},
) {
    const writes: Array<{ key: string, bytes: Uint8Array }> = []
    const baselines: any[] = []
    let liveDatabase: any = null
    const forageStorage = {
        Init: vi.fn(async () => undefined),
        loadDatabaseForStartup: vi.fn(async () => {
            if (startupLoad instanceof Error) throw startupLoad
            return startupLoad
        }),
        setItem: vi.fn(async (key: string, bytes: Uint8Array) => {
            options.onWrite?.(key, bytes)
            if (options.failWrite) throw new Error('initial write failed')
            writes.push({ key, bytes })
        }),
        scheduleStartupDatabaseCache: vi.fn(),
        getDbEtag: vi.fn(() => 'etag-existing'),
        invalidateStartupDatabaseCache: vi.fn(async () => undefined),
        getItemFresh: vi.fn(async () => { throw new Error('unexpected fresh read') }),
        getItem: vi.fn(async () => { throw new Error('unexpected backup read') }),
    }
    const context: Record<string, any> = {
        forageStorage,
        LoadingStatusState: { text: '' },
        checkNullish: (value: unknown) => value === null || value === undefined,
        encodeRisuSaveLegacy,
        decodeRisuSave,
        safeStructuredClone: structuredClone,
        setPatchSyncBaseline: (baseline: any) => {
            options.onBaseline?.(baseline)
            baselines.push(baseline)
        },
        setDatabase: (database: any) => {
            liveDatabase = database
            if (options.mutateLiveDatabase) {
                database.characters.push({ chaId: 'live-character', chats: [] })
            }
        },
        getDatabase: () => liveDatabase ?? { didFirstSetup: false },
        getDbBackups: async () => [],
        characterURLImport: vi.fn(),
    }
    const execute = new AsyncFunction(
        ...Object.keys(context),
        `${startupJavascript}\nreturn { createdFreshDatabase };`,
    )
    const result = await execute(...Object.values(context))
    return { ...result, writes, baselines, liveDatabase, forageStorage }
}

describe('bootstrap fresh database boundary', () => {
    test('writes and adopts the canonical empty database only for a proven fresh startup', async () => {
        const result = await runStartup({ bytes: null, decoded: null, fromCache: false })

        expect(result.createdFreshDatabase).toBe(true)
        expect(result.writes).toHaveLength(1)
        expect(result.writes[0].key).toBe('database/database.bin')
        await expect(decodeRisuSave(result.writes[0].bytes))
            .resolves.toEqual({ characters: [] })
        expect(result.baselines).toEqual([{ characters: [] }])
    })

    test('uses the same canonical-empty hash as the server protocol', async () => {
        const patcher = new RisuSavePatcher()
        await patcher.init({ characters: [] })
        const serverUtils = createRequire(import.meta.url)('../../server/node/utils.cjs')
        const serverHash = serverUtils.calculateHash({ characters: [] }).toString(16)

        expect(serverHash).toBe('7a5af0c2')
        expect(patcher.hash()).toBe(serverHash)
    })

    test('does not install a confirmed baseline when the initial write fails', async () => {
        const onBaseline = vi.fn()
        await expect(runStartup(
            { bytes: null, decoded: null, fromCache: false },
            { failWrite: true, onBaseline },
        )).rejects.toThrow('initial write failed')
        expect(onBaseline).not.toHaveBeenCalled()
    })

    test('does not create or adopt a database when the startup read throws', async () => {
        const onWrite = vi.fn()
        const onBaseline = vi.fn()
        await expect(runStartup(new Error('startup read failed'), { onWrite, onBaseline }))
            .rejects.toThrow('startup read failed')
        expect(onWrite).not.toHaveBeenCalled()
        expect(onBaseline).not.toHaveBeenCalled()
    })

    test.each([
        ['stored empty object', {}, false],
        ['stored malformed characters', { characters: { not: 'an array' } }, false],
        ['cached malformed database', { characters: 'malformed' }, true],
    ])('adopts an existing %s as-is', async (
        _label: string,
        database: any,
        fromCache: boolean,
    ) => {
        const result = await runStartup(fromCache
            ? { bytes: null, decoded: structuredClone(database), fromCache: true }
            : { bytes: encodeRisuSaveLegacy(database), decoded: null, fromCache: false })

        expect(result.createdFreshDatabase).toBe(false)
        expect(result.forageStorage.setItem).not.toHaveBeenCalled()
        expect(result.baselines).toEqual([database])
    })

    test('keeps the confirmed baseline isolated from live database mutation', async () => {
        const result = await runStartup({
            bytes: encodeRisuSaveLegacy({ characters: [] }),
            decoded: null,
            fromCache: false,
        }, { mutateLiveDatabase: true })

        expect(result.liveDatabase.characters).toHaveLength(1)
        expect(result.baselines).toEqual([{ characters: [] }])
    })
})
