import { describe, expect, test } from 'vitest'
import fs from 'node:fs'

async function optionalImport<T>(path: string): Promise<T | null> {
    try {
        return await import(/* @vite-ignore */ path) as T
    } catch {
        return null
    }
}

describe('[E2-3e] Rebuild client startup safety over native 1.16.1', () => {
    test('[new] e1 sends the cached validator and resolves 304 from the cached database', async () => {
        const subject = await optionalImport<any>('./startupDatabaseCache')
        expect(subject, 'startupDatabaseCache module exists').not.toBeNull()

        let raw: { etag: string, bytes: Uint8Array } | null = null
        let record: any = null
        let meta: any = null
        const rawStore = {
            readMetadata: async () => raw && ({ namespace: 'risu-startup-db/test/schema-1', etag: raw.etag }),
            readBytes: async (etag: string) => raw?.etag === etag ? raw.bytes.slice() : null,
            write: async (etag: string, bytes: Uint8Array) => { raw = { etag, bytes: bytes.slice() }; return true },
            clear: async () => { raw = null },
        }
        const decodedStore = {
            readMeta: async () => meta,
            readRecord: async () => record,
            writeBaseline: async (nextRecord: any, nextMeta: any) => {
                record = structuredClone(nextRecord)
                meta = structuredClone(nextMeta)
                return true
            },
            writeMeta: async (nextMeta: any) => { meta = structuredClone(nextMeta); return true },
            clear: async () => { record = null; meta = null },
        }
        const cache = new subject!.StartupDatabaseCache({
            appVersion: 'test',
            schemaEpoch: 'schema-1',
            rawStore,
            decodedStore,
        })
        const database = { characters: [{ chaId: 'cha-1', chats: [] }] }
        await cache.storeAuthoritative({
            etag: 'etag-1',
            bytes: new TextEncoder().encode(JSON.stringify(database)),
            decoded: database,
        })

        const probe = await cache.probe()
        expect(probe?.etag).toBe('etag-1')
        const hit = await cache.resolveNotModified('etag-1')
        expect(hit).toMatchObject({ kind: 'decoded', etag: 'etag-1', database })

        await cache.storeAuthoritative({
            etag: 'etag-2',
            bytes: new TextEncoder().encode('{"characters":[]}'),
            decoded: { characters: [] },
        })
        expect((await cache.probe())?.etag).toBe('etag-2')
    })

    test('[new] e3 writer-session helper emits the native ordinary-write header names', async () => {
        const subject = await optionalImport<any>('./writerSession')
        expect(subject, 'writerSession helper exists').not.toBeNull()
        const headers = subject!.writerSessionHeaders()
        expect(headers['x-session-id']).toBe(subject!.writerSessionId)
        expect(Object.keys(headers).every(key => key === 'x-session-id' || key === 'x-user-active')).toBe(true)
    })

    test('[new] e2 converts stubs to protected placeholders before plugin code loads', () => {
        const source = fs.readFileSync('src/ts/bootstrap.ts', 'utf8')
        const plugins = source.indexOf('loadPlugins()')
        const placeholders = source.lastIndexOf('convertStubsToPlaceholders(')
        expect(placeholders >= 0, 'bootstrap contains the placeholder conversion').toBe(true)
        expect(plugins, 'bootstrap loads plugins after placeholder conversion').toBeGreaterThan(placeholders)
    })
})
