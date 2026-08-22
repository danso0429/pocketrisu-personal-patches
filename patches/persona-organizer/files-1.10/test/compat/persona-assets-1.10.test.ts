import { afterAll, describe, expect, test } from 'vitest'
import { Packr } from 'msgpackr'
import { spawnServer, type ServerHandle } from './helpers/spawnServer.js'
import { createClient } from './helpers/client.js'
import { encodeBackup } from './helpers/encode.js'
import { decodeBackup } from './helpers/decode.js'

const MAGIC_RAW = Buffer.from([0, 82, 73, 83, 85, 83, 65, 86, 69, 0, 7])
const packr = new Packr({ useRecords: false })
const servers: ServerHandle[] = []

afterAll(async () => {
    await Promise.allSettled(servers.map(server => server.cleanup()))
})

function seed(): Buffer {
    const icon = 'persona-icon.png'
    const gallery = 'persona-gallery.png'
    const folder = 'persona-folder.png'
    const orphan = 'unreferenced.png'
    const database = {
        characters: [],
        characterOrder: [],
        personas: [{
            id: 'persona-1',
            name: 'Persona',
            icon: `assets/${icon}`,
            imageGallery: [`assets/${icon}`, `assets/${gallery}`],
            personaPrompt: '',
            folderId: 'folder-1',
        }],
        personaFolders: [{ id: 'folder-1', name: 'Folder', icon: `assets/${folder}` }],
        selectedPersona: 0,
        modules: [],
        botPresets: [],
        botPresetsId: 0,
    }
    const db = Buffer.concat([MAGIC_RAW, packr.encode(database)])
    return encodeBackup([
        { name: 'database.risudat', data: db },
        ...[icon, gallery, folder, orphan].map(name => ({
            name,
            data: Buffer.from(`fixture-${name}`),
        })),
    ])
}

describe('PocketRisu 1.10 persona asset authority', () => {
    test('orphan purge and settings export preserve icon, gallery, and folder references', async () => {
        const server = await spawnServer()
        servers.push(server)
        const client = await createClient(server.port, server.password)
        expect((await client.importBackup(seed())).ok).toBe(true)

        const purge = await client.fetch('/api/db/assets/purge-orphans', { method: 'POST' })
        expect(purge.ok).toBe(true)
        await expect(purge.json()).resolves.toMatchObject({ deleted: 1, scanned: 4 })

        const exported = await client.fetch('/api/backup/export?mode=settings')
        expect(exported.ok).toBe(true)
        const names = decodeBackup(Buffer.from(await exported.arrayBuffer())).map(entry => entry.name)
        expect(names).toEqual(expect.arrayContaining([
            'persona-icon.png',
            'persona-gallery.png',
            'persona-folder.png',
        ]))
        expect(names).not.toContain('unreferenced.png')
    })
})
