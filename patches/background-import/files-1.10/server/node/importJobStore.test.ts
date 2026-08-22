import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import pkg from './importJobStore.cjs'

const {
    createImportJobStore,
} = pkg

const roots: string[] = []

async function owner(nowValue = 1_000) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'import-job-store-'))
    roots.push(root)
    let now = nowValue
    const store = createImportJobStore({
        dbPath: path.join(root, 'import-jobs.db'),
        now: () => now,
    })
    return {
        store,
        root,
        setNow(value: number) { now = value },
    }
}

function coordinates(overrides: Record<string, unknown> = {}) {
    return {
        operationId: 'import_operation_001',
        protocolVersion: 1,
        kind: 'module',
        declaredFormat: 'risum',
        sourceSize: 4096,
        origin: 'picker',
        admissionBuild: '1.10.0-test-build',
        ...overrides,
    }
}

function expectCode(fn: () => unknown, code: string) {
    expect(fn).toThrowError(expect.objectContaining({ code }))
}

function completeJob(store: any) {
    store.advanceUpload('import_operation_001', 0, 4096)
    store.beginUploadFinalization('import_operation_001', 'a'.repeat(64))
    store.markUploaded('import_operation_001', 'a'.repeat(64))
    store.beginInspection('import_operation_001')
    store.finishInspection('import_operation_001', { authorizationRequired: false })
    store.beginPreparing('import_operation_001')
    store.markPrepared('import_operation_001', {
        preparedDigest: 'b'.repeat(64), entityId: 'module-id',
    })
    store.markCommitting('import_operation_001')
    store.markCompleted('import_operation_001', { committedRevision: 'revision-1' })
}

afterEach(async () => {
    while (roots.length) await fs.rm(roots.pop()!, { recursive: true, force: true })
})

describe('durable import job store', () => {
    test('create is idempotent only for exact immutable coordinates', async () => {
        const { store } = await owner()
        const first = store.createJob(coordinates())
        const replay = store.createJob(coordinates())
        expect(first.reused).toBe(false)
        expect(replay.reused).toBe(true)
        expect(replay.job.state).toBe('receiving')
        expectCode(() => store.createJob(coordinates({ sourceSize: 4097 })), 'IMPORT_OPERATION_CONFLICT')
        expectCode(() => store.createJob(coordinates({ operationId: '../escape' })), 'IMPORT_INVALID_ID')
        store.close()
    })

    test('upload offset and write-once source hash survive reopen', async () => {
        const { store, root } = await owner()
        store.createJob(coordinates())
        expect(store.advanceUpload('import_operation_001', 0, 1024).nextOffset).toBe(1024)
        expectCode(
            () => store.advanceUpload('import_operation_001', 0, 2048),
            'IMPORT_UPLOAD_OFFSET_CONFLICT',
        )
        expect(store.advanceUpload('import_operation_001', 1024, 4096).nextOffset).toBe(4096)
        store.beginUploadFinalization('import_operation_001', 'a'.repeat(64))
        store.markUploaded('import_operation_001', 'a'.repeat(64))
        expectCode(
            () => store.markUploaded('import_operation_001', 'b'.repeat(64)),
            'IMPORT_OPERATION_CONFLICT',
        )
        store.close()

        const reopened = createImportJobStore({ dbPath: path.join(root, 'import-jobs.db') })
        const job = reopened.getJob('import_operation_001')
        expect(job).toMatchObject({
            state: 'uploaded',
            nextOffset: 4096,
            sourceSha256: 'a'.repeat(64),
        })
        reopened.close()
    })

    test('authorization is a durable gate before queued preparation', async () => {
        const { store } = await owner()
        store.createJob(coordinates())
        store.advanceUpload('import_operation_001', 0, 4096)
        store.beginUploadFinalization('import_operation_001', 'a'.repeat(64))
        store.markUploaded('import_operation_001', 'a'.repeat(64))
        store.beginInspection('import_operation_001')
        store.finishInspection('import_operation_001', { authorizationRequired: true })
        expect(store.getJob('import_operation_001').state).toBe('awaiting-authorization')
        expectCode(() => store.beginPreparing('import_operation_001'), 'IMPORT_STATE_CONFLICT')
        store.authorize('import_operation_001', true)
        expect(store.getJob('import_operation_001')).toMatchObject({
            state: 'queued',
            authorizationDecision: 'accepted',
        })
        store.beginPreparing('import_operation_001')
        expect(store.getJob('import_operation_001').state).toBe('preparing')
        store.close()
    })

    test('declined authorization cancels before prepare and never restarts', async () => {
        const { store } = await owner()
        store.createJob(coordinates())
        store.advanceUpload('import_operation_001', 0, 4096)
        store.beginUploadFinalization('import_operation_001', 'a'.repeat(64))
        store.markUploaded('import_operation_001', 'a'.repeat(64))
        store.beginInspection('import_operation_001')
        store.finishInspection('import_operation_001', { authorizationRequired: true })
        store.authorize('import_operation_001', false)
        expect(store.getJob('import_operation_001')).toMatchObject({
            state: 'cancelled',
            authorizationDecision: 'declined',
        })
        expect(store.listNonterminal()).toHaveLength(0)
        expectCode(() => store.beginPreparing('import_operation_001'), 'IMPORT_STATE_CONFLICT')
        store.close()
    })

    test('progress, prepared coordinates, and commit coordinates are monotonic', async () => {
        const { store } = await owner()
        store.createJob(coordinates())
        store.advanceUpload('import_operation_001', 0, 4096)
        store.beginUploadFinalization('import_operation_001', 'a'.repeat(64))
        store.markUploaded('import_operation_001', 'a'.repeat(64))
        store.beginInspection('import_operation_001')
        store.finishInspection('import_operation_001', { authorizationRequired: false })
        store.beginPreparing('import_operation_001')
        store.updateProgress('import_operation_001', {
            phase: 'assets', completedItems: 1, totalItems: 3,
            completedBytes: 10, totalBytes: 30,
        })
        expectCode(() => store.updateProgress('import_operation_001', {
            phase: 'assets', completedItems: 0, totalItems: 3,
            completedBytes: 9, totalBytes: 30,
        }), 'IMPORT_PROGRESS_REGRESSION')
        store.markPrepared('import_operation_001', {
            preparedDigest: 'b'.repeat(64),
            entityId: 'module-id',
        })
        store.markCommitting('import_operation_001')
        store.markCompleted('import_operation_001', {
            committedRevision: 'revision-1',
        })
        expect(store.getJob('import_operation_001')).toMatchObject({
            state: 'completed',
            preparedDigest: 'b'.repeat(64),
            entityId: 'module-id',
            committedRevision: 'revision-1',
        })
        expectCode(() => store.markCompleted('import_operation_001', {
            committedRevision: 'revision-2',
        }), 'IMPORT_OPERATION_CONFLICT')
        store.close()
    })

    test('commit conflict parks a durable reconcile-required state', async () => {
        const { store } = await owner()
        store.createJob(coordinates())
        store.advanceUpload('import_operation_001', 0, 4096)
        store.beginUploadFinalization('import_operation_001', 'a'.repeat(64))
        store.markUploaded('import_operation_001', 'a'.repeat(64))
        store.beginInspection('import_operation_001')
        store.finishInspection('import_operation_001', { authorizationRequired: false })
        store.beginPreparing('import_operation_001')
        store.markPrepared('import_operation_001', {
            preparedDigest: 'b'.repeat(64), entityId: 'module-id',
        })
        store.markCommitting('import_operation_001')
        store.markReconcileRequired('import_operation_001', {
            code: 'IMPORT_COMMIT_CONFLICT', detail: 'same ID differs',
        })
        expect(store.getJob('import_operation_001')).toMatchObject({
            state: 'reconcile-required',
            errorCode: 'IMPORT_COMMIT_CONFLICT',
            errorDetail: 'same ID differs',
        })
        expect(store.listRecoverable().map((job: any) => job.operationId))
            .toContain('import_operation_001')
        expectCode(() => store.markCommitting('import_operation_001'), 'IMPORT_STATE_CONFLICT')
        store.close()
    })

    test('result claim, heartbeat, reconciliation, and ACK are exact-consumer operations', async () => {
        const { store, setNow } = await owner()
        store.createJob(coordinates())
        store.advanceUpload('import_operation_001', 0, 4096)
        store.beginUploadFinalization('import_operation_001', 'a'.repeat(64))
        store.markUploaded('import_operation_001', 'a'.repeat(64))
        store.beginInspection('import_operation_001')
        store.finishInspection('import_operation_001', { authorizationRequired: false })
        store.beginPreparing('import_operation_001')
        store.markPrepared('import_operation_001', {
            preparedDigest: 'b'.repeat(64), entityId: 'module-id',
        })
        store.markCommitting('import_operation_001')
        store.markCompleted('import_operation_001', { committedRevision: 'revision-1' })

        expect(store.claimResult('import_operation_001', 'consumer_001', 100).claimed).toBe(true)
        expect(store.claimResult('import_operation_001', 'consumer_002', 100).claimed).toBe(false)
        setNow(1_050)
        expect(store.heartbeatClaim('import_operation_001', 'consumer_001').claimAt).toBe(1_050)
        expectCode(
            () => store.markClientReconciled('import_operation_001', 'consumer_002'),
            'IMPORT_CLAIM_CONFLICT',
        )
        store.markClientReconciled('import_operation_001', 'consumer_001')
        expectCode(() => store.ackResult('import_operation_001', 'consumer_002'), 'IMPORT_CLAIM_CONFLICT')
        store.ackResult('import_operation_001', 'consumer_001')
        expect(store.getJob('import_operation_001').state).toBe('delivered')
        expect(store.listRecoverable()).toHaveLength(0)
        store.close()
    })

    test('expired claim can be recovered by another PWA', async () => {
        const { store, setNow } = await owner()
        store.createJob(coordinates())
        completeJob(store)
        expect(store.claimResult('import_operation_001', 'consumer_001', 100).claimed).toBe(true)
        setNow(1_101)
        expect(store.claimResult('import_operation_001', 'consumer_002', 100).claimed).toBe(true)
        expect(store.getJob('import_operation_001').claimConsumer).toBe('consumer_002')
        store.close()
    })

    test('large clock rollback cannot turn a short claim into an immortal claim', async () => {
        const { store, setNow } = await owner()
        store.createJob(coordinates())
        completeJob(store)
        expect(store.claimResult('import_operation_001', 'consumer_001', 100).claimed).toBe(true)
        setNow(0)
        expect(store.claimResult('import_operation_001', 'consumer_002', 100).claimed).toBe(true)
        expect(store.getJob('import_operation_001').claimConsumer).toBe('consumer_002')
        store.close()
    })

    test('recoverable list is not hidden behind older terminal rows', async () => {
        const { store } = await owner()
        for (let index = 0; index < 6; index++) {
            const operationId = `import_terminal_00${index}`
            store.createJob(coordinates({ operationId }))
            store.failJob(operationId, { code: 'IMPORT_PREPARATION_FAILED' })
        }
        store.createJob(coordinates({ operationId: 'zzzz_active_001' }))
        expect(store.listRecoverable(1).map((job: any) => job.operationId)).toEqual(['zzzz_active_001'])
        store.close()
    })

    test('failed jobs cannot be rewritten as cancelled', async () => {
        const { store } = await owner()
        store.createJob(coordinates())
        store.failJob('import_operation_001', { code: 'IMPORT_PREPARATION_FAILED' })
        expectCode(() => store.cancelJob('import_operation_001'), 'IMPORT_STATE_CONFLICT')
        expect(store.getJob('import_operation_001').state).toBe('failed')
        store.close()
    })

    test('sanitized typed failures retain no source filename or content', async () => {
        const { store } = await owner()
        store.createJob(coordinates())
        store.failJob('import_operation_001', {
            code: 'IMPORT_PREPARATION_FAILED',
            detail: 'bounded parser failure',
        })
        const job = store.getJob('import_operation_001')
        expect(job).toMatchObject({
            state: 'failed',
            errorCode: 'IMPORT_PREPARATION_FAILED',
            errorDetail: 'bounded parser failure',
        })
        expect(JSON.stringify(job)).not.toContain('personal-file')
        expect(store.listNonterminal()).toHaveLength(0)
        store.close()
    })
})
