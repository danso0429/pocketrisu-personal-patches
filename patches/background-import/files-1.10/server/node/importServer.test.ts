import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import digestPkg from './importPreparedDigest.cjs'
import serverPkg from './importServer.cjs'

const { digestPrepared } = digestPkg
const { createServerCanonicalCommitter } = serverPkg
const roots: string[] = []

afterEach(async () => {
    while (roots.length) await fs.rm(roots.pop()!, { recursive: true, force: true })
})

describe('PocketRisu server canonical adapter', () => {
    test('promotes verified files and persists an idempotent main marker', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'import-server-'))
        roots.push(root)
        const value = Buffer.from('adapter asset')
        const sha256 = crypto.createHash('sha256').update(value).digest('hex')
        const staged = path.join(root, `${sha256}.png`)
        await fs.writeFile(staged, value, { mode: 0o600 })
        const kv = new Map<string, Buffer>()
        const state: any = {
            database: { modules: [], characters: [], characterOrder: [], statics: { imports: 0 } },
            syncs: 0,
        }
        let queue = Promise.resolve()
        const committer = createServerCanonicalCommitter({
            queueStorageOperation(operation: () => Promise<any>) {
                const next = queue.then(operation, operation)
                queue = next.catch(() => undefined)
                return next
            },
            async flushPendingDb() {},
            kvGet(key: string) {
                if (key === 'database/database.bin') return Buffer.from(JSON.stringify(state.database))
                return kv.get(key) ?? null
            },
            kvSet(key: string, data: Uint8Array) { kv.set(key, Buffer.from(data)) },
            async decodeDatabase(raw: Uint8Array) { return JSON.parse(Buffer.from(raw).toString('utf8')) },
            computeDatabaseRevision(database: any) {
                return crypto.createHash('sha256').update(JSON.stringify(database)).digest('hex')
            },
            async persistDatabaseAndMarker(database: any, markerKey: string, marker: any) {
                state.database = structuredClone(database)
                kv.set(markerKey, Buffer.from(JSON.stringify(marker)))
                return { committedRevision: marker.committedRevision }
            },
            async synchronizeCanonicalState() { state.syncs += 1 },
        })
        const prepared: any = {
            kind: 'module', format: 'risum',
            entity: { id: 'adapter-module', name: 'Adapter' },
            assets: [{
                key: `assets/${sha256}.png`, relativePath: 'ignored',
                bytes: value.byteLength, sha256,
            }],
        }
        prepared.preparedDigest = digestPrepared(prepared)
        const first = await committer.commit('server_adapter_001', prepared, () => staged)
        const second = await committer.commit('server_adapter_001', prepared, () => staged)
        expect(first.reused).toBe(false)
        expect(second.reused).toBe(true)
        expect(state.database.modules).toEqual([prepared.entity])
        expect(kv.get(`assets/${sha256}.png`)).toEqual(value)
        expect(JSON.parse(kv.get('import-commit:server_adapter_001')!.toString()))
            .toMatchObject({ preparedDigest: prepared.preparedDigest, entityId: 'adapter-module' })
        expect(state.syncs).toBe(2)
    })

    test('same content-addressed key with different bytes fails before DB mutation', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'import-server-'))
        roots.push(root)
        const value = Buffer.from('expected')
        const sha256 = crypto.createHash('sha256').update(value).digest('hex')
        const staged = path.join(root, `${sha256}.png`)
        await fs.writeFile(staged, value)
        const existing = Buffer.from('different')
        const database = { modules: [], characters: [] }
        const committer = createServerCanonicalCommitter({
            queueStorageOperation: (operation: () => Promise<any>) => operation(),
            flushPendingDb: async () => undefined,
            kvGet(key: string) {
                if (key === 'database/database.bin') return Buffer.from(JSON.stringify(database))
                if (key === `assets/${sha256}.png`) return existing
                return null
            },
            kvSet() {},
            decodeDatabase: async (raw: Uint8Array) => JSON.parse(Buffer.from(raw).toString()),
            computeDatabaseRevision: () => 'revision',
            persistDatabaseAndMarker: async () => ({ committedRevision: 'revision' }),
            synchronizeCanonicalState: async () => undefined,
        })
        const prepared: any = {
            kind: 'module', format: 'risum', entity: { id: 'collision', name: 'Collision' },
            assets: [{ key: `assets/${sha256}.png`, relativePath: 'ignored', bytes: value.length, sha256 }],
        }
        prepared.preparedDigest = digestPrepared(prepared)
        await expect(committer.commit('server_adapter_002', prepared, () => staged))
            .rejects.toHaveProperty('code', 'IMPORT_ASSET_COLLISION')
        expect(database.modules).toHaveLength(0)
    })
})
