import { afterAll, describe, expect, test } from 'vitest'
import { Packr } from 'msgpackr'
import { spawnServer, type ServerHandle } from './helpers/spawnServer.js'
import { createClient, type RisuClient } from './helpers/client.js'
import { encodeBackup } from './helpers/encode.js'
import { decodeBackup } from './helpers/decode.js'
import {
    assetFor,
    block,
    createFakeAccount,
    startFakeAccountServer,
    type FakeAccount,
} from './helpers/fakeRisuAccount.js'

const MAGIC_RAW = Buffer.from([0, 82, 73, 83, 85, 83, 65, 86, 69, 0, 7])
const MAGIC_RISUSAVE = Buffer.from([82, 73, 83, 85, 83, 65, 86, 69, 0])
const packr = new Packr({ useRecords: false })
const servers: ServerHandle[] = []
const cleanups: Array<() => Promise<void>> = []

afterAll(async () => {
    await Promise.allSettled([...servers.map((server) => server.cleanup()), ...cleanups])
})

function personaAssetBackup(withReferences = true): Buffer {
    const database = {
        characters: [],
        characterOrder: [],
        personas: [{
            id: 'persona-1',
            name: 'Persona',
            icon: 'assets/active.png',
            imageGallery: withReferences ? ['assets/gallery-only.png'] : [],
            personaPrompt: '',
            folderId: 'folder-1',
        }],
        personaFolders: [{
            id: 'folder-1',
            name: 'Folder',
            icon: withReferences ? 'assets/folder-only.png' : '',
        }],
        selectedPersona: 0,
        modules: [],
        botPresets: [],
        botPresetsId: 0,
    }
    return encodeBackup([
        { name: 'database.risudat', data: Buffer.concat([MAGIC_RAW, packr.encode(database)]) },
        { name: 'active.png', data: Buffer.from('active') },
        { name: 'gallery-only.png', data: Buffer.from('gallery') },
        { name: 'folder-only.png', data: Buffer.from('folder') },
        { name: 'orphan.png', data: Buffer.from('orphan') },
    ])
}

async function post(client: RisuClient, urlPath: string, body?: unknown) {
    const response = await client.fetch(urlPath, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
    })
    return { status: response.status, body: await response.json() as any }
}

async function waitWhile(client: RisuClient, ...states: string[]) {
    for (let attempt = 0; attempt < 400; attempt++) {
        const status = await (await client.fetch('/api/risu-account/status')).json() as any
        if (!states.includes(status.state)) return status
        await new Promise((resolve) => setTimeout(resolve, 25))
    }
    throw new Error(`still ${states.join(' or ')}`)
}

function personaOnlyAccount(): { account: FakeAccount; galleryKey: string; folderKey: string } {
    const account = createFakeAccount()
    const gallery = assetFor(40)
    const folder = assetFor(41)
    const root = {
        characters: [],
        characterOrder: [],
        personas: [{
            id: 'account-persona',
            name: 'Account persona',
            icon: '',
            imageGallery: [gallery.key],
            personaPrompt: '',
            folderId: 'account-folder',
        }],
        personaFolders: [{ id: 'account-folder', name: 'Account folder', icon: folder.key }],
        selectedPersona: 0,
        modules: [],
        botPresets: [],
        botPresetsId: 0,
        pluginCustomStorage: {},
        account: { id: account.id, token: account.token, data: { vaild: true } },
        didFirstSetup: true,
    }
    account.items.clear()
    account.cold.clear()
    account.items.set('database/database.bin', Buffer.concat([
        MAGIC_RISUSAVE,
        block(1, 'root', root),
        block(9, 'plugins', []),
        block(11, 'pluginStorage', {}),
        block(0, 'config', { version: 1 }),
    ]))
    account.items.set(gallery.key, gallery.data)
    account.items.set(folder.key, folder.data)
    return { account, galleryKey: gallery.key, folderKey: folder.key }
}

describe('[E2-4c] Rebase persona-organizer onto native persona folders', () => {
    test('[unchanged] c2 server sweep keeps the native persona icon and removes only the unreferenced asset', async () => {
        const server = await spawnServer()
        servers.push(server)
        const client = await createClient(server.port, server.password)
        const backup = encodeBackup([
            {
                name: 'database.risudat',
                data: Buffer.concat([MAGIC_RAW, packr.encode({
                    characters: [],
                    characterOrder: [],
                    personas: [{ id: 'p', name: 'Persona', icon: 'assets/active.png', personaPrompt: '' }],
                    personaFolders: [],
                    selectedPersona: 0,
                    modules: [],
                    botPresets: [],
                    botPresetsId: 0,
                })]),
            },
            { name: 'active.png', data: Buffer.from('active') },
            { name: 'orphan.png', data: Buffer.from('orphan') },
        ])
        expect((await client.importBackup(backup)).ok).toBe(true)

        const sweep = await client.fetch('/api/db/assets/purge-orphans', { method: 'POST' })
        expect(sweep.ok).toBe(true)
        await expect(sweep.json()).resolves.toMatchObject({ deleted: 1, scanned: 2 })
        const names = decodeBackup(await client.exportBackup()).map((entry) => entry.name)
        expect(names).toContain('active.png')
        expect(names).not.toContain('orphan.png')
    })

    test('[new] c2 server sweep keeps folder-icon and gallery-only assets, then removes them after dereference', async () => {
        const server = await spawnServer()
        servers.push(server)
        const client = await createClient(server.port, server.password)
        expect((await client.importBackup(personaAssetBackup())).ok).toBe(true)

        const protectedSweep = await client.fetch('/api/db/assets/purge-orphans', { method: 'POST' })
        expect(protectedSweep.ok).toBe(true)
        await expect(protectedSweep.json()).resolves.toMatchObject({ deleted: 1, scanned: 4 })

        expect((await client.importBackup(personaAssetBackup(false))).ok).toBe(true)
        const dereferencedSweep = await client.fetch('/api/db/assets/purge-orphans', { method: 'POST' })
        expect(dereferencedSweep.ok).toBe(true)
        await expect(dereferencedSweep.json()).resolves.toMatchObject({ deleted: 3, scanned: 4 })
    })

    test('[new] c3 settings backup and restore carry folder-icon and gallery-only assets', async () => {
        const source = await spawnServer()
        const restored = await spawnServer()
        servers.push(source, restored)
        const sourceClient = await createClient(source.port, source.password)
        const restoredClient = await createClient(restored.port, restored.password)
        expect((await sourceClient.importBackup(personaAssetBackup())).ok).toBe(true)

        const exportedResponse = await sourceClient.fetch('/api/backup/export?mode=settings')
        expect(exportedResponse.ok).toBe(true)
        const exported = Buffer.from(await exportedResponse.arrayBuffer())
        const names = decodeBackup(exported).map((entry) => entry.name)
        expect(names).toEqual(expect.arrayContaining(['gallery-only.png', 'folder-only.png']))

        expect((await restoredClient.importBackup(exported)).ok).toBe(true)
        const roundTripNames = decodeBackup(await restoredClient.exportBackup()).map((entry) => entry.name)
        expect(roundTripNames).toEqual(expect.arrayContaining(['gallery-only.png', 'folder-only.png']))
    })

    test('[new] c3 account import downloads assets referenced only by persona gallery and folder icon', async () => {
        const { account, galleryKey, folderKey } = personaOnlyAccount()
        const fake = await startFakeAccountServer(account)
        cleanups.push(fake.close)
        const server = await spawnServer({
            env: { POCKETRISU_RISU_ACCOUNT_URL: fake.url, POCKETRISU_RISU_ACCOUNT_GAP_MS: '0' },
        })
        servers.push(server)
        const client = await createClient(server.port, server.password)

        expect((await post(client, '/api/risu-account/prepare', { token: account.token, id: account.id })).status).toBe(200)
        expect(await waitWhile(client, 'preparing')).toMatchObject({ state: 'ready' })
        expect((await post(client, '/api/risu-account/download')).status).toBe(200)
        expect(await waitWhile(client, 'downloading', 'downloaded', 'applying')).toMatchObject({ state: 'idle' })

        const requested = account.log.map((entry) => entry.key)
        expect(requested).toEqual(expect.arrayContaining([galleryKey, folderKey]))
        const names = decodeBackup(await client.exportBackup()).map((entry) => entry.name)
        expect(names).toEqual(expect.arrayContaining([
            galleryKey.slice('assets/'.length),
            folderKey.slice('assets/'.length),
        ]))
    })
})
