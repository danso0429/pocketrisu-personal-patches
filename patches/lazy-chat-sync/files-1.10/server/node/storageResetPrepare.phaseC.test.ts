import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import utilsPackage from './utils.cjs'
import preparePackage from './storageResetPrepare.cjs'

const { decodeRisuSave, encodeRisuSaveLegacy, normalizeJSON } = utilsPackage as any
const { prepareRestoredDatabase } = preparePackage as any
const etag = (value: Buffer) => createHash('sha256').update(value).digest('hex')

describe('[C-4] Chats created with fmIndex -1', () => {
    it('sets fmIndex -1 on the default chat created for a failed cold-storage reset', async () => {
        const rawDatabase = Buffer.from(encodeRisuSaveLegacy({
            characters: [{
                name: 'Unavailable character',
                chaId: 'cold-char',
                coldstorage: 'missing-key',
                chats: [],
            }],
        }))
        const prepared = await prepareRestoredDatabase({
            rawDatabase,
            readEntry: vi.fn(() => null),
        }, {
            decodeRisuSave,
            normalizeJSON,
            encodeRisuSaveLegacy,
            randomUUID: () => 'reset-default-chat',
            computeBufferEtag: vi.fn(etag),
        })

        expect(prepared.database.characters[0].chats).toEqual([
            expect.objectContaining({ id: 'reset-default-chat', fmIndex: -1 }),
        ])
    })
})
