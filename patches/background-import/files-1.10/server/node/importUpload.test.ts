import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import storePkg from './importJobStore.cjs'
import uploadPkg from './importUpload.cjs'

const { createImportJobStore } = storePkg
const { createImportUploadOwner } = uploadPkg
const roots: string[] = []

function sha(data: Uint8Array) {
    return crypto.createHash('sha256').update(data).digest('hex')
}

function sourceBytes(size = 5 * 1024 * 1024 + 173) {
    const data = Buffer.allocUnsafe(size)
    for (let index = 0; index < size; index++) data[index] = (index * 131 + 17) & 0xff
    return data
}

async function setup(options: Record<string, unknown> = {}) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'import-upload-'))
    roots.push(root)
    const jobStore = createImportJobStore({ dbPath: path.join(root, 'import-jobs.db') })
    const upload = createImportUploadOwner({
        spoolDir: path.join(root, 'spool'),
        jobStore,
        maxSourceBytes: 64 * 1024 * 1024,
        maxSpoolBytes: 128 * 1024 * 1024,
        ...options,
    })
    return { root, jobStore, upload }
}

function coordinates(operationId: string, size: number) {
    return {
        operationId,
        protocolVersion: 1,
        kind: 'module',
        declaredFormat: 'risum',
        sourceSize: size,
        origin: 'picker',
        admissionBuild: '1.10.0-test-build',
    }
}

async function expectCode(promise: Promise<unknown>, code: string) {
    await expect(promise).rejects.toMatchObject({ code })
}

afterEach(async () => {
    while (roots.length) await fs.rm(roots.pop()!, { recursive: true, force: true })
})

describe('durable import source upload', () => {
    test('ordered chunks, exact replay, owner recreation, and lost complete response are idempotent', async () => {
        const data = sourceBytes()
        const { root, jobStore, upload } = await setup()
        const operationId = 'upload_operation_001'
        await upload.createJob(coordinates(operationId, data.length))
        const cuts = [0, 1, 1024 * 1024 + 3, 4 * 1024 * 1024 + 9, data.length]
        for (let index = 0; index < cuts.length - 1; index++) {
            const chunk = data.subarray(cuts[index], cuts[index + 1])
            const result = await upload.append(operationId, cuts[index], chunk, sha(chunk))
            expect(result.nextOffset).toBe(cuts[index + 1])
            if (index === 1) {
                const replay = await upload.append(operationId, cuts[index], chunk, sha(chunk))
                expect(replay.replayed).toBe(true)
            }
        }
        const recreated = createImportUploadOwner({
            spoolDir: path.join(root, 'spool'),
            jobStore,
            maxSourceBytes: 64 * 1024 * 1024,
            maxSpoolBytes: 128 * 1024 * 1024,
        })
        const completed = await recreated.complete(operationId, sha(data))
        expect(completed).toMatchObject({ state: 'uploaded', reused: false })
        const retry = await recreated.complete(operationId, sha(data))
        expect(retry).toMatchObject({ state: 'uploaded', reused: true })
        const saved = await fs.readFile(recreated.sourcePath(operationId))
        expect(saved.byteLength).toBe(data.byteLength)
        expect(sha(saved)).toBe(sha(data))
        jobStore.close()
    })

    test('gap, crossing overlap, changed replay, wrong chunk hash, and oversize fail closed', async () => {
        const data = sourceBytes(4096)
        const { jobStore, upload } = await setup({ maxSourceBytes: 4096 })
        const operationId = 'upload_guard_001'
        await upload.createJob(coordinates(operationId, data.length))
        const first = data.subarray(0, 1024)
        await expectCode(upload.append(operationId, 1, first, sha(first)), 'IMPORT_UPLOAD_GAP')
        await expectCode(upload.append(operationId, 0, first, '0'.repeat(64)), 'IMPORT_CHUNK_HASH_MISMATCH')
        await upload.append(operationId, 0, first, sha(first))
        const crossing = data.subarray(512, 1536)
        await expectCode(upload.append(operationId, 512, crossing, sha(crossing)), 'IMPORT_UPLOAD_OVERLAP')
        const changed = Buffer.from(first)
        changed[0] ^= 0xff
        await expectCode(upload.append(operationId, 0, changed, sha(changed)), 'IMPORT_UPLOAD_REPLAY_MISMATCH')
        await expectCode(
            upload.createJob(coordinates('upload_oversize_001', data.length + 1)),
            'IMPORT_CAPACITY_EXCEEDED',
        )
        jobStore.close()
    })

    test('unacknowledged file tail is truncated to the durable database offset', async () => {
        const data = sourceBytes(8192)
        const { root, jobStore, upload } = await setup()
        const operationId = 'upload_tail_001'
        await upload.createJob(coordinates(operationId, data.length))
        await upload.append(operationId, 0, data.subarray(0, 4096), sha(data.subarray(0, 4096)))
        const part = path.join(root, 'spool', `${operationId}.part`)
        await fs.appendFile(part, data.subarray(4096))
        expect((await fs.stat(part)).size).toBe(8192)
        const status = await upload.status(operationId)
        expect(status.nextOffset).toBe(4096)
        expect((await fs.stat(part)).size).toBe(4096)
        jobStore.close()
    })

    test.each(['after-finalizing', 'after-rename'])(
        'completion resumes after injected %s process boundary',
        async (faultPoint) => {
            const data = sourceBytes(32 * 1024)
            let injected = false
            const { root, jobStore, upload } = await setup({
                fault(point: string) {
                    if (!injected && point === faultPoint) {
                        injected = true
                        throw new Error(`fault:${point}`)
                    }
                },
            })
            const operationId = `upload_${faultPoint.replace(/\W/g, '_')}_001`
            await upload.createJob(coordinates(operationId, data.length))
            await upload.append(operationId, 0, data, sha(data))
            await expect(upload.complete(operationId, sha(data))).rejects.toThrow(`fault:${faultPoint}`)
            const recovered = createImportUploadOwner({
                spoolDir: path.join(root, 'spool'),
                jobStore,
                maxSourceBytes: 64 * 1024 * 1024,
                maxSpoolBytes: 128 * 1024 * 1024,
            })
            expect(await recovered.complete(operationId, sha(data))).toMatchObject({ state: 'uploaded' })
            expect(await fs.readFile(recovered.sourcePath(operationId))).toEqual(data)
            jobStore.close()
        },
    )

    test('explicit pre-commit cancellation removes only the operation spool', async () => {
        const data = sourceBytes(4096)
        const { root, jobStore, upload } = await setup()
        const operationId = 'upload_cancel_001'
        await upload.createJob(coordinates(operationId, data.length))
        await upload.append(operationId, 0, data.subarray(0, 1024), sha(data.subarray(0, 1024)))
        await fs.writeFile(path.join(root, 'spool', 'unrelated.keep'), 'preserve')
        const cancelled = await upload.cancel(operationId)
        expect(cancelled.state).toBe('cancelled')
        await expect(fs.stat(path.join(root, 'spool', `${operationId}.part`))).rejects.toMatchObject({ code: 'ENOENT' })
        expect(await fs.readFile(path.join(root, 'spool', 'unrelated.keep'), 'utf8')).toBe('preserve')
        jobStore.close()
    })

    test('failed-job residue still consumes spool capacity until retained cleanup', async () => {
        const data = sourceBytes(4096)
        const { jobStore, upload } = await setup({
            maxSourceBytes: 4096,
            maxSpoolBytes: 4096,
        })
        await upload.createJob(coordinates('upload_failed_001', data.length))
        await upload.append('upload_failed_001', 0, data.subarray(0, 1024), sha(data.subarray(0, 1024)))
        jobStore.failJob('upload_failed_001', { code: 'IMPORT_PREPARATION_FAILED' })
        await expectCode(
            upload.createJob(coordinates('upload_after_failed_001', data.length)),
            'IMPORT_CAPACITY_EXCEEDED',
        )
        jobStore.close()
    })

    test('spool, partial, and completed source modes are private', async () => {
        const data = sourceBytes(4096)
        const { root, jobStore, upload } = await setup()
        const operationId = 'upload_modes_001'
        await upload.createJob(coordinates(operationId, data.length))
        const spool = path.join(root, 'spool')
        expect((await fs.stat(spool)).mode & 0o777).toBe(0o700)
        expect((await fs.stat(path.join(spool, `${operationId}.part`))).mode & 0o777).toBe(0o600)
        await upload.append(operationId, 0, data, sha(data))
        await upload.complete(operationId, sha(data))
        expect((await fs.stat(path.join(spool, `${operationId}.source`))).mode & 0o777).toBe(0o600)
        jobStore.close()
    })
})
