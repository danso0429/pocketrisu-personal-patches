import { createHash } from 'node:crypto'
import { describe, expect, test, vi } from 'vitest'
import type { BackgroundImportJob, BackgroundImportMarker } from './backgroundImportClient'
import { createBackgroundImportRuntime, type BackgroundImportReporter } from './backgroundImportRuntime'

function sha(value: Uint8Array): string {
    return createHash('sha256').update(value).digest('hex')
}

function reporter() {
    const events: Array<[string, string]> = []
    const value: BackgroundImportReporter = {
        update(message) { events.push(['update', message]) },
        backgroundSafe(message) { events.push(['safe', message]) },
        succeed(message) { events.push(['success', message]) },
        fail(error) { events.push(['error', error instanceof Error ? error.message : String(error)]) },
        dismiss() { events.push(['dismiss', '']) },
    }
    return { value, events }
}

function markerOwner(initial: BackgroundImportMarker | null = null) {
    return {
        current: initial,
        load() { return this.current },
        save(value: BackgroundImportMarker) { this.current = structuredClone(value) },
        clear(operationId: string) { if (this.current?.operationId === operationId) this.current = null },
    }
}

function job(overrides: Partial<BackgroundImportJob> = {}): BackgroundImportJob {
    return {
        operationId: 'runtime_operation_001',
        protocolVersion: 1,
        kind: 'module',
        format: 'risum',
        origin: 'picker',
        sourceSize: 4,
        sourceSha256: null,
        state: 'receiving',
        nextOffset: 0,
        authorizationRequired: null,
        authorizationDecision: null,
        progress: null,
        preparedDigest: null,
        entityId: null,
        committedRevision: null,
        errorCode: null,
        errorDetail: null,
        updatedAt: 1,
        ...overrides,
    }
}

function successfulServer(source: Uint8Array) {
    let current = job({ sourceSize: source.byteLength })
    let statusIndex = 0
    const statuses: BackgroundImportJob[] = [
        job({
            sourceSize: source.byteLength, sourceSha256: sha(source), nextOffset: source.byteLength,
            state: 'awaiting-authorization', authorizationRequired: true,
        }),
        job({
            sourceSize: source.byteLength, sourceSha256: sha(source), nextOffset: source.byteLength,
            state: 'preparing', authorizationRequired: true, authorizationDecision: 'accepted',
            progress: { phase: 'assets', completedItems: 1, totalItems: 2, completedBytes: 2, totalBytes: 4 },
        }),
        job({
            sourceSize: source.byteLength, sourceSha256: sha(source), nextOffset: source.byteLength,
            state: 'completed', authorizationRequired: true, authorizationDecision: 'accepted',
            preparedDigest: 'b'.repeat(64), entityId: 'module-id', committedRevision: 'revision-1',
        }),
    ]
    const calls: string[] = []
    const fetcher = async (input: RequestInfo | URL, init: RequestInit = {}) => {
        const url = new URL(String(input), 'https://local.invalid')
        const method = init.method ?? 'GET'
        calls.push(`${method} ${url.pathname}`)
        if (url.pathname === '/api/import-jobs' && method === 'GET') {
            return Response.json({ jobs: [] })
        }
        if (url.pathname === '/api/import-jobs' && method === 'POST') {
            return Response.json(current, { status: 201 })
        }
        if (url.pathname.endsWith('/source') && method === 'PUT') {
            const chunk = init.body as Uint8Array
            current = { ...current, nextOffset: current.nextOffset + chunk.byteLength }
            return Response.json(current)
        }
        if (url.pathname.endsWith('/source/complete')) {
            current = {
                ...current, state: 'uploaded', sourceSha256: sha(source), nextOffset: source.byteLength,
            }
            return Response.json(current, { status: 202 })
        }
        if (url.pathname.endsWith('/authorize')) {
            current = { ...statuses[0], state: 'queued', authorizationDecision: 'accepted' }
            return Response.json(current)
        }
        if (url.pathname.endsWith('/result/claim')) {
            current = statuses[2]
            return Response.json({ claimed: true, job: current, preparedDigest: current.preparedDigest })
        }
        if (url.pathname.endsWith('/reconciled')) {
            current = { ...statuses[2], state: 'client-reconciled' }
            return Response.json(current)
        }
        if (url.pathname.endsWith('/ack')) {
            current = { ...current, state: 'delivered' }
            return Response.json(current)
        }
        if (method === 'GET') {
            current = statuses[Math.min(statusIndex++, statuses.length - 1)]
            return Response.json(current)
        }
        return Response.json({ error: 'missing', code: 'IMPORT_JOB_NOT_FOUND' }, { status: 404 })
    }
    return { fetcher, calls }
}

describe('background import runtime', () => {
    test('authorizes, marks the truthful safe boundary, reconciles, and ACKs once', async () => {
        const source = new Uint8Array([1, 2, 3, 4])
        const server = successfulServer(source)
        const markers = markerOwner({
            version: 1, operationId: 'runtime_operation_001', kind: 'module', format: 'risum',
            origin: 'picker', sourceSize: source.length, sourceSha256: sha(source), nextOffset: 0,
            state: 'receiving', updatedAt: 1,
        })
        const report = reporter()
        const reconcile = vi.fn(async () => undefined)
        const runtime = createBackgroundImportRuntime({
            fetcher: server.fetcher,
            markerStore: markers,
            reconcile,
            confirmLowLevel: async () => true,
            consumerId: 'runtime_consumer_001',
            wait: async () => undefined,
            claimHeartbeatMs: 60_000,
        })
        const outcome = await runtime.run({
            kind: 'module', name: 'fixture.risum', data: source, origin: 'picker', reporter: report.value,
        })
        expect(outcome).toMatchObject({ status: 'imported', job: { state: 'delivered' } })
        expect(reconcile).toHaveBeenCalledWith({
            kind: 'module', entityId: 'module-id', committedRevision: 'revision-1',
        })
        expect(report.events.filter(([kind]) => kind === 'safe')).toHaveLength(1)
        expect(report.events.at(-1)).toEqual(['success', 'Module imported.'])
        expect(markers.current).toBeNull()
        expect(server.calls).toContain('POST /api/import-jobs/runtime_operation_001/result/claim')
        expect(server.calls.at(-1)).toBe('POST /api/import-jobs/runtime_operation_001/ack')
    })

    test('password-required PNG cleans operational state and hands the same source to foreground', async () => {
        const source = new Uint8Array([9, 8, 7, 6])
        let current = job({ kind: 'character', format: 'png', sourceSize: source.length })
        const fetcher = async (input: RequestInfo | URL, init: RequestInit = {}) => {
            const url = new URL(String(input), 'https://local.invalid')
            const method = init.method ?? 'GET'
            if (url.pathname === '/api/import-jobs' && method === 'GET') return Response.json({ jobs: [] })
            if (url.pathname === '/api/import-jobs' && method === 'POST') return Response.json(current, { status: 201 })
            if (url.pathname.endsWith('/source') && method === 'PUT') {
                current = { ...current, nextOffset: source.length }
                return Response.json(current)
            }
            if (url.pathname.endsWith('/source/complete')) {
                current = { ...current, state: 'uploaded', nextOffset: source.length, sourceSha256: sha(source) }
                return Response.json(current, { status: 202 })
            }
            if (method === 'GET') {
                current = {
                    ...current, state: 'failed', errorCode: 'IMPORT_PASSWORD_REQUIRED',
                    errorDetail: 'Encrypted PNG cards require a foreground password',
                }
                return Response.json(current)
            }
            if (method === 'DELETE') return Response.json(current)
            return Response.json({ error: 'missing' }, { status: 404 })
        }
        const markers = markerOwner({
            version: 1, operationId: 'runtime_operation_001', kind: 'character', format: 'png',
            origin: 'picker', sourceSize: source.length, sourceSha256: sha(source), nextOffset: 0,
            state: 'receiving', updatedAt: 1,
        })
        const report = reporter()
        const runtime = createBackgroundImportRuntime({
            fetcher, markerStore: markers, reconcile: async () => undefined,
            confirmLowLevel: async () => true, consumerId: 'runtime_consumer_002', wait: async () => undefined,
        })
        expect(await runtime.run({
            kind: 'character', name: 'encrypted.png', data: source, origin: 'picker', reporter: report.value,
        })).toMatchObject({ status: 'foreground-required' })
        expect(report.events.some(([kind]) => kind === 'error')).toBe(false)
        expect(report.events.at(-1)?.[1]).toBe('Password required')
        expect(markers.current).toBeNull()
    })

    test('cold receiving recovery requires exact source reselection and retains the operation', async () => {
        const active = job({ operationId: 'runtime_reselect_001', sourceSize: 1024 })
        const fetcher = async () => Response.json({ jobs: [active] })
        const markers = markerOwner()
        const report = reporter()
        const runtime = createBackgroundImportRuntime({
            fetcher, markerStore: markers, reconcile: async () => undefined,
            confirmLowLevel: async () => true, consumerId: 'runtime_consumer_003', wait: async () => undefined,
        })
        expect(await runtime.recover(() => report.value)).toMatchObject({
            status: 'failed', job: { operationId: 'runtime_reselect_001' }, committed: false,
        })
        expect(report.events.at(-1)?.[0]).toBe('error')
    })
})
