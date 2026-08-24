import { createHash } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import {
    BackgroundImportProtocolError,
    createBackgroundImportApi,
    digestImportSource,
    importFormatForName,
    sourceForBackgroundImport,
    uploadBackgroundImportSource,
    type BackgroundImportJob,
    type BackgroundImportMarker,
    type BackgroundImportMarkerStore,
} from './backgroundImportClient'

function sha(value: Uint8Array): string {
    return createHash('sha256').update(value).digest('hex')
}

function bytes(size: number): Uint8Array {
    const value = new Uint8Array(size)
    for (let index = 0; index < size; index++) value[index] = (index * 97 + 31) & 0xff
    return value
}

function markerStore(initial: BackgroundImportMarker | null = null): BackgroundImportMarkerStore & {
    current: BackgroundImportMarker | null
    writes: number
} {
    return {
        current: initial,
        writes: 0,
        load() { return this.current },
        save(marker) { this.current = structuredClone(marker); this.writes += 1 },
        clear(operationId) { if (this.current?.operationId === operationId) this.current = null },
    }
}

function fakeUploadServer(options: {
    operationId: string
    source: Uint8Array
    nextOffset?: number
    loseAppendAt?: number
}) {
    const stored = new Uint8Array(options.source.byteLength)
    let nextOffset = options.nextOffset ?? 0
    stored.set(options.source.slice(0, nextOffset), 0)
    let state: BackgroundImportJob['state'] = 'receiving'
    let sourceSha256: string | null = null
    let lost = false
    const appended: Array<[number, number]> = []

    function job(): BackgroundImportJob {
        return {
            operationId: options.operationId,
            protocolVersion: 1,
            kind: 'module',
            format: 'risum',
            sourceSize: options.source.byteLength,
            sourceSha256,
            state,
            nextOffset,
            authorizationRequired: null,
            authorizationDecision: null,
            progress: null,
            preparedDigest: null,
            entityId: null,
            committedRevision: null,
            errorCode: null,
            errorDetail: null,
            updatedAt: Date.now(),
        }
    }

    const fetcher = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
        const url = new URL(String(input), 'https://local.invalid')
        if (url.pathname === '/api/import-jobs' && init.method === 'POST') {
            return Response.json(job(), { status: nextOffset > 0 ? 200 : 201 })
        }
        if (url.pathname === `/api/import-jobs/${options.operationId}` && !init.method) {
            return Response.json(job())
        }
        if (url.pathname.endsWith('/source') && init.method === 'PUT') {
            const offset = Number(new Headers(init.headers).get('x-upload-offset'))
            const chunk = new Uint8Array(init.body as ArrayBufferView as Uint8Array)
            expect(new Headers(init.headers).get('x-chunk-sha256')).toBe(sha(chunk))
            expect(offset).toBe(nextOffset)
            stored.set(chunk, offset)
            nextOffset += chunk.byteLength
            appended.push([offset, nextOffset])
            if (!lost && options.loseAppendAt === offset) {
                lost = true
                throw new TypeError('simulated lost append response')
            }
            return Response.json(job())
        }
        if (url.pathname.endsWith('/source/complete') && init.method === 'POST') {
            const body = JSON.parse(String(init.body))
            expect(nextOffset).toBe(options.source.byteLength)
            expect(body.sha256).toBe(sha(stored))
            state = 'uploaded'
            sourceSha256 = body.sha256
            return Response.json(job(), { status: 202 })
        }
        return Response.json({ error: 'missing fake route', code: 'IMPORT_JOB_NOT_FOUND' }, { status: 404 })
    }
    return { fetcher, stored, appended, job }
}

describe('background import client protocol', () => {
    test('classifies admitted extensions without MIME guessing', () => {
        expect(importFormatForName('module', 'test.risum')).toBe('risum')
        expect(importFormatForName('module', 'test.module.charx')).toBe('charx')
        expect(importFormatForName('character', 'card.JPG')).toBe('jpeg')
        expect(importFormatForName('character', 'card.png')).toBe('png')
        expect(importFormatForName('module', 'card.png')).toBeNull()
        expect(importFormatForName('character', 'no-extension')).toBeNull()
    })

    test('hashes a seekable source with a bounded read window', async () => {
        const value = bytes(4 * 1024 * 1024 + 73)
        let largestRead = 0
        const source = {
            size: value.byteLength,
            async read(start: number, end: number) {
                largestRead = Math.max(largestRead, end - start)
                return value.slice(start, end)
            },
        }
        const progress: number[] = []
        expect(await digestImportSource(source, item => progress.push(item.completedBytes))).toBe(sha(value))
        expect(largestRead).toBeLessThanOrEqual(1024 * 1024)
        expect(progress.at(-1)).toBe(value.byteLength)
    })

    test('recovers a lost chunk response and completes exact bytes once', async () => {
        const value = bytes(3 * 1024 * 1024 + 19)
        const operationId = 'client_upload_001'
        const server = fakeUploadServer({ operationId, source: value, loseAppendAt: 1024 * 1024 })
        const markers = markerStore()
        const result = await uploadBackgroundImportSource({
            fetcher: server.fetcher,
            markerStore: markers,
            source: sourceForBackgroundImport(value),
            operationId,
            kind: 'module',
            format: 'risum',
            origin: 'picker',
        })
        expect(result.job).toMatchObject({ state: 'uploaded', sourceSha256: sha(value) })
        expect(server.stored.byteLength).toBe(value.byteLength)
        expect(sha(server.stored)).toBe(sha(value))
        expect(server.appended).toEqual([
            [0, 1024 * 1024],
            [1024 * 1024, 2 * 1024 * 1024],
            [2 * 1024 * 1024, 3 * 1024 * 1024],
            [3 * 1024 * 1024, value.byteLength],
        ])
        expect(markers.current).toMatchObject({ state: 'uploaded', nextOffset: value.byteLength })
    })

    test('resumes from the durable offset only after exact source identity matches', async () => {
        const value = bytes(2 * 1024 * 1024 + 41)
        const operationId = 'client_resume_001'
        const initial: BackgroundImportMarker = {
            version: 1,
            operationId,
            kind: 'module',
            format: 'risum',
            origin: 'picker',
            sourceSize: value.byteLength,
            sourceSha256: sha(value),
            nextOffset: 1024 * 1024,
            state: 'receiving',
            updatedAt: 1,
        }
        const server = fakeUploadServer({ operationId, source: value, nextOffset: initial.nextOffset })
        await uploadBackgroundImportSource({
            fetcher: server.fetcher,
            markerStore: markerStore(initial),
            source: sourceForBackgroundImport(value),
            operationId,
            kind: 'module',
            format: 'risum',
            origin: 'picker',
        })
        expect(server.appended[0]).toEqual([initial.nextOffset, 2 * 1024 * 1024])

        const changed = value.slice()
        changed[0] ^= 0xff
        const mismatchServer = fakeUploadServer({ operationId, source: value, nextOffset: initial.nextOffset })
        await expect(uploadBackgroundImportSource({
            fetcher: mismatchServer.fetcher,
            markerStore: markerStore(initial),
            source: sourceForBackgroundImport(changed),
            operationId,
            kind: 'module',
            format: 'risum',
            origin: 'picker',
        })).rejects.toMatchObject<Partial<BackgroundImportProtocolError>>({ code: 'IMPORT_SOURCE_MISMATCH' })
        expect(mismatchServer.appended).toHaveLength(0)
    })

    test('result claim, reconciliation, and ACK preserve one consumer coordinate', async () => {
        const calls: string[] = []
        const base = {
            operationId: 'claim_operation_001', protocolVersion: 1,
            kind: 'module', format: 'json', sourceSize: 2, sourceSha256: 'a'.repeat(64),
            state: 'completed', nextOffset: 2, authorizationRequired: false,
            authorizationDecision: null, progress: null, preparedDigest: 'b'.repeat(64),
            entityId: 'module-id', committedRevision: 'revision', errorCode: null,
            errorDetail: null, updatedAt: 1,
        } satisfies BackgroundImportJob
        const fetcher = async (input: RequestInfo | URL, init: RequestInit = {}) => {
            const url = new URL(String(input), 'https://local.invalid')
            calls.push(`${init.method ?? 'GET'} ${url.pathname}`)
            if (url.pathname.endsWith('/result')) {
                expect(url.searchParams.get('consumerId')).toBe('consumer_001')
                return Response.json({ claimed: true, job: base, entity: { id: 'module-id' } })
            }
            const state = url.pathname.endsWith('/ack') ? 'delivered' : 'client-reconciled'
            return Response.json({ ...base, state })
        }
        const api = createBackgroundImportApi(fetcher)
        expect((await api.claim(base.operationId, 'consumer_001')).claimed).toBe(true)
        expect((await api.reconciled(base.operationId, 'consumer_001')).state).toBe('client-reconciled')
        expect((await api.ack(base.operationId, 'consumer_001')).state).toBe('delivered')
        expect(calls).toEqual([
            'GET /api/import-jobs/claim_operation_001/result',
            'POST /api/import-jobs/claim_operation_001/reconciled',
            'POST /api/import-jobs/claim_operation_001/ack',
        ])
    })
})
