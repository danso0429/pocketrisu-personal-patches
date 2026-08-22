import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import commitPkg from './importCommit.cjs'
import routesPkg from './importRoutes.cjs'

const { createAppendOnlyCanonicalCommitter } = commitPkg
const { registerImportRoutes } = routesPkg
const roots: string[] = []

class FakeApp {
    routes: Array<{ method: string; pattern: string; handler: Function }> = []
    register(method: string, pattern: string, handler: Function) {
        this.routes.push({ method, pattern, handler })
    }
    post(pattern: string, handler: Function) { this.register('POST', pattern, handler) }
    put(pattern: string, handler: Function) { this.register('PUT', pattern, handler) }
    get(pattern: string, handler: Function) { this.register('GET', pattern, handler) }
    delete(pattern: string, handler: Function) { this.register('DELETE', pattern, handler) }

    async invoke(method: string, pathname: string, init: any = {}) {
        const route = this.routes.find(candidate => {
            if (candidate.method !== method) return false
            const pattern = candidate.pattern.replace(/:[^/]+/g, '[^/]+')
            return new RegExp(`^${pattern}$`).test(pathname)
        })
        if (!route) throw new Error(`Route missing: ${method} ${pathname}`)
        const keys = [...route.pattern.matchAll(/:([^/]+)/g)].map(match => match[1])
        const values = pathname.split('/').filter(Boolean)
        const patternValues = route.pattern.split('/').filter(Boolean)
        const params: Record<string, string> = {}
        for (const key of keys) {
            const index = patternValues.findIndex(value => value === `:${key}`)
            params[key] = values[index]
        }
        const req: any = {
            body: init.body ?? {}, headers: init.headers ?? {}, query: init.query ?? {},
            params, path: pathname, method,
        }
        const res: any = {
            statusCode: 200,
            body: undefined,
            status(value: number) { this.statusCode = value; return this },
            json(value: unknown) { this.body = value; return this },
        }
        await route.handler(req, res, (error: unknown) => { if (error) throw error })
        return { status: res.statusCode, body: res.body }
    }
}

function sha(data: Uint8Array) {
    return crypto.createHash('sha256').update(data).digest('hex')
}

async function setup() {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'import-routes-'))
    roots.push(root)
    const app = new FakeApp()
    const state: any = {
        database: {
            modules: [], enabledModules: [], characters: [], characterOrder: [],
            statics: { imports: 0 }, useModelPresetByDefault: false,
        },
        markers: new Map(), assets: new Map(),
    }
    let queue = Promise.resolve()
    const canonical = createAppendOnlyCanonicalCommitter({
        runStorageOperation(operation: () => Promise<any>) {
            const next = queue.then(operation, operation)
            queue = next.catch(() => undefined)
            return next
        },
        async loadDatabase() { return structuredClone(state.database) },
        async promoteAsset(asset: any, file: string) { state.assets.set(asset.key, await fs.readFile(file)) },
        async readCommitMarker(operationId: string) { return structuredClone(state.markers.get(operationId) ?? null) },
        computeRevision(database: any) { return `revision-${database.modules.length}-${database.characters.length}` },
        async persistDatabaseAndMarker(database: any, marker: any) {
            state.database = structuredClone(database)
            state.markers.set(marker.operationId, structuredClone(marker))
            return { committedRevision: marker.committedRevision }
        },
        async synchronizeCanonicalState() {},
        newChatDefaults() { return {} },
    })
    const manager = registerImportRoutes(app as any, {
        saveDir: path.join(root, 'save'),
        parserBundlePath: path.resolve('server/node/importParserBundle.mjs'),
        checkAuth: async () => true,
        checkActiveSession: () => true,
        canonicalCommitter: canonical,
        limits: {
            maxSourceBytes: 64 * 1024 * 1024,
            maxSpoolBytes: 128 * 1024 * 1024,
            parser: {
                jsonBytes: 50 * 1024 * 1024,
                inlineAssetBytes: 50 * 1024 * 1024,
                png: {
                    chunkCount: 0xffff,
                    textChunkBytes: 50 * 1024 * 1024,
                    totalTextBytes: 1024 * 1024 * 1024,
                    ioChunkBytes: 64 * 1024,
                },
            },
            claimTtlMs: 120_000,
        },
        logger: { info() {}, warn() {}, error() {} },
    })
    return { root, app, state, manager }
}

async function uploadJson(state: Awaited<ReturnType<typeof setup>>, operationId: string, value: any) {
    const data = Buffer.from(JSON.stringify(value))
    const created = await state.app.invoke('POST', '/api/import-jobs', {
        headers: { 'x-client-build': '1.10.0-test-build' },
        body: {
            operationId, kind: 'module', format: 'json', sourceSize: data.byteLength, origin: 'picker',
        },
    })
    expect(created.status).toBe(201)
    expect((await state.app.invoke('PUT', `/api/import-jobs/${operationId}/source`, {
        headers: { 'x-upload-offset': '0', 'x-chunk-sha256': sha(data) }, body: data,
    })).status).toBe(200)
    expect((await state.app.invoke('POST', `/api/import-jobs/${operationId}/source/complete`, {
        body: { sha256: sha(data) },
    })).status).toBe(202)
    await state.manager.waitForIdle(operationId)
}

afterEach(async () => {
    while (roots.length) await fs.rm(roots.pop()!, { recursive: true, force: true })
})

describe('background import HTTP routes', () => {
    test('upload, detached prepare/commit, claim, reconcile, ACK, and cleanup form one operation', async () => {
        const state = await setup()
        const operationId = 'route_operation_001'
        await uploadJson(state, operationId, { type: 'risuModule', name: 'Route module', description: '' })
        const status = await state.app.invoke('GET', `/api/import-jobs/${operationId}`)
        expect(status).toMatchObject({ status: 200, body: { state: 'completed', entityId: expect.any(String) } })
        expect(state.state.database.modules).toHaveLength(1)

        const result = await state.app.invoke('GET', `/api/import-jobs/${operationId}/result`, {
            query: { consumerId: 'route_consumer_001' },
        })
        expect(result).toMatchObject({
            status: 200,
            body: { claimed: true, entity: { name: 'Route module' } },
        })
        expect((await state.app.invoke('POST', `/api/import-jobs/${operationId}/reconciled`, {
            body: { consumerId: 'route_consumer_001' },
        })).body.state).toBe('client-reconciled')
        expect((await state.app.invoke('POST', `/api/import-jobs/${operationId}/ack`, {
            body: { consumerId: 'route_consumer_001' },
        })).body.state).toBe('delivered')
        await expect(fs.stat(path.join(state.root, 'save', 'import-sources', `${operationId}.source`)))
            .rejects.toMatchObject({ code: 'ENOENT' })
        await expect(fs.stat(path.join(state.root, 'save', 'import-prepared', operationId)))
            .rejects.toMatchObject({ code: 'ENOENT' })
        state.manager.close()
    })

    test('low-level job parks for authorization and decline cancels without commit', async () => {
        const state = await setup()
        const operationId = 'route_lowlevel_001'
        await uploadJson(state, operationId, {
            type: 'risuModule', name: 'Secure', description: '', lowLevelAccess: true,
        })
        expect((await state.app.invoke('GET', `/api/import-jobs/${operationId}`)).body.state)
            .toBe('awaiting-authorization')
        expect((await state.app.invoke('POST', `/api/import-jobs/${operationId}/authorize`, {
            body: { accepted: false },
        })).body.state).toBe('cancelled')
        expect(state.state.database.modules).toHaveLength(0)
        state.manager.close()
    })

    test('second active operation and missing build coordinate fail before source writes', async () => {
        const state = await setup()
        const first = Buffer.from('{}')
        expect((await state.app.invoke('POST', '/api/import-jobs', {
            headers: { 'x-client-build': '1.10.0-test-build' },
            body: {
                operationId: 'route_active_001', kind: 'module', format: 'json',
                sourceSize: first.byteLength, origin: 'picker',
            },
        })).status).toBe(201)
        expect((await state.app.invoke('POST', '/api/import-jobs', {
            headers: { 'x-client-build': '1.10.0-test-build' },
            body: {
                operationId: 'route_active_002', kind: 'module', format: 'json',
                sourceSize: first.byteLength, origin: 'picker',
            },
        })).status).toBe(409)
        expect((await state.app.invoke('POST', '/api/import-jobs', {
            body: {
                operationId: 'route_no_build_001', kind: 'module', format: 'json',
                sourceSize: first.byteLength, origin: 'picker',
            },
        })).status).toBe(400)
        state.manager.close()
    })
})
