import { createHash } from 'node:crypto'
import { describe, expect, test, vi } from 'vitest'
import utilsPackage from './utils.cjs'

const { decodeRisuSave, encodeRisuSaveLegacy, normalizeJSON } = utilsPackage as {
    decodeRisuSave: (raw: Uint8Array, options?: Record<string, unknown>) => Promise<any>
    encodeRisuSaveLegacy: (value: unknown) => Uint8Array
    normalizeJSON: (value: unknown) => any
}

async function subject() {
    return import('./storageResetPrepare.cjs') as Promise<{
        prepareRestoredDatabase: (
            input: {
                rawDatabase: Buffer
                readEntry: (key: string) => Buffer | null
            },
            dependencies: {
                decodeRisuSave: typeof decodeRisuSave
                normalizeJSON: typeof normalizeJSON
                encodeRisuSaveLegacy: typeof encodeRisuSaveLegacy
                randomUUID: () => string
                computeBufferEtag: (value: Buffer) => string
            },
        ) => Promise<any>
        StoragePrepareError: new (...args: any[]) => Error & { code: string }
    }>
}

const etag = (value: Buffer) => createHash('sha256').update(value).digest('hex')
const dependencies = (ids: string[] = []) => ({
    decodeRisuSave,
    normalizeJSON,
    encodeRisuSaveLegacy,
    randomUUID: vi.fn(() => ids.shift() ?? 'generated-id'),
    computeBufferEtag: vi.fn(etag),
})
const encoded = (value: unknown) => Buffer.from(encodeRisuSaveLegacy(value))

describe('[B1a-1] Restore preparation primitives', () => {
    test('prepares normal data, strips chats, and publishes only real chat payloads', async () => {
        const { prepareRestoredDatabase } = await subject()
        const full = { id: 'full', name: 'Full', message: [{ role: 'user', data: 'one' }] }
        const hybrid = { id: 'hybrid', name: 'Hybrid', _stub: true, message: [] }
        const stub = { id: 'stub', name: 'Stub', _stub: true }
        const rawDatabase = encoded({
            mainPrompt: 'prepared',
            characters: [{ chaId: 'char', chats: [full, hybrid, stub] }],
        })

        const prepared = await prepareRestoredDatabase(
            { rawDatabase, readEntry: vi.fn(() => null) },
            dependencies(),
        )

        expect(prepared.changed).toBe(false)
        expect(prepared.databaseBytes.equals(rawDatabase)).toBe(true)
        expect([...prepared.chatMap.get('char').keys()]).toEqual(['full', 'hybrid'])
        expect(prepared.chatMap.get('char').get('hybrid')).not.toHaveProperty('_stub')
        expect(prepared.strippedDatabase.characters[0].chats).toEqual([
            expect.objectContaining({ id: 'full', _stub: true }),
            expect.objectContaining({ id: 'hybrid', _stub: true }),
            stub,
        ])
        expect(Buffer.from(prepared.strippedBytes)).toEqual(
            Buffer.from(encodeRisuSaveLegacy(prepared.strippedDatabase)),
        )
        expect(prepared.etag).toBe(etag(Buffer.from(prepared.strippedBytes)))
    })

    test('repairs missing chat ids and orphan folder ids before producing stored bytes', async () => {
        const { prepareRestoredDatabase } = await subject()
        const deps = dependencies(['deterministic-chat-id'])
        const prepared = await prepareRestoredDatabase({
            rawDatabase: encoded({
                characters: [{
                    chaId: 'char',
                    chatFolders: [{ id: 'kept' }],
                    chats: [
                        { name: 'missing id', folderId: 'deleted', message: [] },
                        { id: 'kept-id', folderId: 'kept', message: [] },
                    ],
                }],
            }),
            readEntry: vi.fn(() => null),
        }, deps)

        expect(prepared.changed).toBe(true)
        expect(prepared.database.characters[0].chats[0]).toMatchObject({
            id: 'deterministic-chat-id',
            folderId: null,
        })
        expect(prepared.database.characters[0].chats[1].folderId).toBe('kept')
        await expect(decodeRisuSave(prepared.databaseBytes)).resolves.toEqual(prepared.database)
        expect(deps.randomUUID).toHaveBeenCalledTimes(1)
    })

    test('resolves REMOTE blocks exclusively through the staged reader', async () => {
        const { prepareRestoredDatabase } = await subject()
        const remote = encoded({ name: 'Remote character', chaId: 'remote-char', chats: [] })
        const readEntry = vi.fn((key: string) =>
            key === 'remotes/remote-char.local.bin' ? remote : null,
        )
        const decode = vi.fn(async (raw: Uint8Array, options?: any) => {
            if (options?.resolveRemote) {
                const resolved = await options.resolveRemote('remote-char')
                if (!resolved) throw new Error('missing remote')
                return { characters: [await decodeRisuSave(resolved)] }
            }
            return decodeRisuSave(raw)
        })

        const prepared = await prepareRestoredDatabase(
            { rawDatabase: Buffer.from('REMOTE fixture'), readEntry },
            { ...dependencies(), decodeRisuSave: decode },
        )

        expect(readEntry).toHaveBeenCalledWith('remotes/remote-char.local.bin')
        expect(readEntry.mock.calls.every(([key]) => key.startsWith('remotes/'))).toBe(true)
        expect(prepared.changed).toBe(true)
        expect(prepared.database.characters[0].chaId).toBe('remote-char')
    })

    test('rejects an unresolved REMOTE block with the stable error code', async () => {
        const { prepareRestoredDatabase, StoragePrepareError } = await subject()
        const decode = vi.fn(async (_raw: Uint8Array, options?: any) => {
            await options.resolveRemote('missing')
            return { characters: [] }
        })
        const promise = prepareRestoredDatabase(
            { rawDatabase: Buffer.from('REMOTE fixture'), readEntry: vi.fn(() => null) },
            { ...dependencies(), decodeRisuSave: decode },
        )
        await expect(promise).rejects.toBeInstanceOf(StoragePrepareError)
        await expect(promise).rejects.toMatchObject({ code: 'REMOTE_UNRESOLVED' })
    })

    test('restores cold-storage characters from staged rows and safely promotes failures', async () => {
        const { prepareRestoredDatabase } = await subject()
        const readEntry = vi.fn((key: string) => {
            if (key !== 'coldstorage/good') return null
            return Buffer.from(JSON.stringify({
                character: { name: 'Restored', chaId: 'restored', chats: [] },
            }))
        })
        const prepared = await prepareRestoredDatabase({
            rawDatabase: encoded({
                characters: [
                    { name: 'Good stub', chaId: 'good-char', coldstorage: 'good', chats: [] },
                    { name: 'Bad stub', chaId: 'bad-char', coldstorage: 'missing', chats: [] },
                ],
            }),
            readEntry,
        }, dependencies(['safe-chat-id']))

        expect(prepared.coldStorage).toEqual({
            restored: 1,
            failed: 1,
            failedNames: ['Bad stub'],
        })
        expect(prepared.database.characters[0]).toMatchObject({
            name: 'Restored',
            chaId: 'restored',
        })
        expect(prepared.database.characters[0]).not.toHaveProperty('coldstorage')
        expect(prepared.database.characters[1].desc).toContain('Original key: missing')
        expect(prepared.database.characters[1].firstMsgIndex).toBe(-1)
        expect(prepared.database.characters[1]).not.toHaveProperty('coldstorage')
        expect(readEntry.mock.calls.map(([key]) => key)).toEqual([
            'coldstorage/good',
            'coldstorage/missing',
        ])
    })

    test('rejects undecodable database bytes before any staged lookup', async () => {
        const { prepareRestoredDatabase, StoragePrepareError } = await subject()
        const readEntry = vi.fn(() => null)
        const promise = prepareRestoredDatabase(
            { rawDatabase: Buffer.from('not a database'), readEntry },
            dependencies(),
        )
        await expect(promise).rejects.toBeInstanceOf(StoragePrepareError)
        await expect(promise).rejects.toMatchObject({ code: 'DATABASE_UNDECODABLE' })
        expect(readEntry).not.toHaveBeenCalled()
    })

    test('is storage-pure and deterministic for identical staged inputs', async () => {
        const { prepareRestoredDatabase } = await subject()
        const input = encoded({
            characters: [{ chaId: 'char', chats: [{ name: 'chat', message: [] }] }],
        })
        const firstReader = vi.fn(() => null)
        const secondReader = vi.fn(() => null)
        const first = await prepareRestoredDatabase(
            { rawDatabase: input, readEntry: firstReader },
            dependencies(['same-id']),
        )
        const second = await prepareRestoredDatabase(
            { rawDatabase: input, readEntry: secondReader },
            dependencies(['same-id']),
        )

        expect(first.database).toEqual(second.database)
        expect(first.databaseBytes).toEqual(second.databaseBytes)
        expect(first.strippedBytes).toEqual(second.strippedBytes)
        expect(first.etag).toBe(second.etag)
        expect(firstReader).not.toHaveBeenCalled()
        expect(secondReader).not.toHaveBeenCalled()
    })

    test('keeps the previous non-strict handling of primitive chat entries in the shared live helpers', async () => {
        const helpers = await import('./storageResetPrepare.cjs') as any
        // As before, an id is still generated for each primitive entry but not assigned.
        const ids = ['unassigned-string-id', 'unassigned-number-id', 'object-chat-id']
        const randomUUID = vi.fn(() => ids.shift() ?? 'generated-id')
        const database = {
            characters: [{
                chaId: 'char',
                chatFolders: [],
                chats: ['malformed', 7, { name: 'object chat', message: [] }],
            }],
        }

        let changed: boolean | undefined
        expect(() => { changed = helpers.assignMissingChatIds(database, randomUUID) }).not.toThrow()
        expect(changed).toBe(true)
        expect(randomUUID).toHaveBeenCalledTimes(3)
        expect(helpers.normalizeOrphanFolderIds(database)).toBe(false)
        expect(database.characters[0].chats[0]).toBe('malformed')
        expect(database.characters[0].chats[1]).toBe(7)
        expect(database.characters[0].chats[2]).toMatchObject({ id: 'object-chat-id' })

        let chatMap: Map<string, Map<unknown, unknown>> | undefined
        expect(() => { chatMap = helpers.buildChatMap(database, randomUUID) }).not.toThrow()
        expect(chatMap!.get('char')!.get('object-chat-id')).toBe(database.characters[0].chats[2])
    })

    test('prepares databases containing primitive character entries', async () => {
        const { prepareRestoredDatabase } = await subject()
        const prepared = await prepareRestoredDatabase({
            rawDatabase: encoded({
                characters: [
                    'malformed',
                    7,
                    { chaId: 'char', chats: [{ id: 'chat', message: [] }] },
                ],
            }),
            readEntry: vi.fn(() => null),
        }, dependencies())

        expect(prepared.changed).toBe(false)
        expect(prepared.database.characters.slice(0, 2)).toEqual(['malformed', 7])
        expect([...prepared.chatMap.keys()]).toEqual(['char'])
        expect(prepared.strippedDatabase.characters.slice(0, 2)).toEqual(['malformed', 7])
    })
})
