import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import jobPkg from './importJobStore.cjs'
import preparedPkg from './importPreparedStore.cjs'
import preparePkg from './importPrepare.cjs'
import uploadPkg from './importUpload.cjs'

const { createImportJobStore } = jobPkg
const { createPreparedImportStore } = preparedPkg
const { createImportPrepareOwner } = preparePkg
const { createImportUploadOwner } = uploadPkg

const roots: string[] = []
const LIMITS = Object.freeze({
    jsonBytes: 50 * 1024 * 1024,
    inlineAssetBytes: 50 * 1024 * 1024,
    stagedAssets: 0xffff,
    stagedBytes: 1024 * 1024 * 1024,
    png: {
        chunkCount: 0xffff,
        textChunkBytes: 50 * 1024 * 1024,
        totalTextBytes: 1024 * 1024 * 1024,
        ioChunkBytes: 64 * 1024,
    },
})

function sha(data: Uint8Array) {
    return crypto.createHash('sha256').update(data).digest('hex')
}

async function setup() {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'import-prepare-'))
    roots.push(root)
    const jobStore = createImportJobStore({ dbPath: path.join(root, 'jobs.db') })
    const upload = createImportUploadOwner({
        spoolDir: path.join(root, 'spool'), jobStore,
        maxSourceBytes: 64 * 1024 * 1024,
        maxSpoolBytes: 128 * 1024 * 1024,
    })
    const preparedStore = createPreparedImportStore({ root: path.join(root, 'prepared') })
    const parserBundlePath = path.resolve('server/node/importParserBundle.mjs')
    const owner = createImportPrepareOwner({
        jobStore, upload, preparedStore, parserBundlePath, limits: LIMITS,
    })
    return { root, jobStore, upload, preparedStore, parserBundlePath, owner }
}

async function uploaded(
    setupResult: Awaited<ReturnType<typeof setup>>,
    operationId: string,
    data: Uint8Array,
    options: { kind?: string; format?: string } = {},
) {
    await setupResult.upload.createJob({
        operationId,
        protocolVersion: 1,
        kind: options.kind ?? 'module',
        declaredFormat: options.format ?? 'json',
        sourceSize: data.byteLength,
        origin: 'picker',
        admissionBuild: '1.10.0-test-build',
    })
    await setupResult.upload.append(operationId, 0, data, sha(data))
    await setupResult.upload.complete(operationId, sha(data))
}

afterEach(async () => {
    while (roots.length) await fs.rm(roots.pop()!, { recursive: true, force: true })
})

describe('durable import preparation owner', () => {
    test('low-level inspection writes nothing and accepted authorization resumes preparation', async () => {
        const state = await setup()
        const operationId = 'prepare_lowlevel_001'
        const data = Buffer.from(JSON.stringify({
            type: 'risuModule', name: 'Secure', description: '', lowLevelAccess: true,
        }))
        await uploaded(state, operationId, data)
        expect(await state.owner.run(operationId)).toMatchObject({ state: 'awaiting-authorization' })
        await expect(fs.stat(state.preparedStore.stagingDir(operationId))).rejects.toMatchObject({ code: 'ENOENT' })
        expect((await state.owner.authorize(operationId, true)).state).toBe('queued')
        const result = await state.owner.run(operationId)
        expect(result).toMatchObject({ state: 'prepared', entityId: expect.any(String) })
        const prepared = await state.preparedStore.read(operationId)
        expect(prepared.entity).toMatchObject({ name: 'Secure', lowLevelAccess: true })
        expect(prepared.preparedDigest).toBe(result.preparedDigest)
        state.jobStore.close()
    })

    test('declined authorization cancels and removes only operation-owned source/staging', async () => {
        const state = await setup()
        const operationId = 'prepare_decline_001'
        const data = Buffer.from(JSON.stringify({
            type: 'risuModule', name: 'Secure', description: '', lowLevelAccess: true,
        }))
        await uploaded(state, operationId, data)
        await state.owner.run(operationId)
        await fs.writeFile(path.join(state.root, 'spool', 'unrelated.keep'), 'preserve')
        expect((await state.owner.authorize(operationId, false)).state).toBe('cancelled')
        await expect(fs.stat(path.join(state.root, 'spool', `${operationId}.source`)))
            .rejects.toMatchObject({ code: 'ENOENT' })
        expect(await fs.readFile(path.join(state.root, 'spool', 'unrelated.keep'), 'utf8')).toBe('preserve')
        state.jobStore.close()
    })

    test('non-low-level job advances from uploaded to prepared in one run', async () => {
        const state = await setup()
        const operationId = 'prepare_ordinary_001'
        const data = Buffer.from(JSON.stringify({ type: 'risuModule', name: 'Ordinary', description: '' }))
        await uploaded(state, operationId, data)
        const result = await state.owner.run(operationId)
        expect(result.state).toBe('prepared')
        expect((await state.preparedStore.read(operationId)).entity.name).toBe('Ordinary')
        expect((await state.owner.run(operationId)).preparedDigest).toBe(result.preparedDigest)
        state.jobStore.close()
    })

    test('new owner resumes durable inspecting and preparing states', async () => {
        for (const durableState of ['inspecting', 'preparing']) {
            const state = await setup()
            const operationId = `prepare_restart_${durableState}_001`
            const data = Buffer.from(JSON.stringify({ type: 'risuModule', name: durableState, description: '' }))
            await uploaded(state, operationId, data)
            if (durableState === 'inspecting') state.jobStore.beginInspection(operationId)
            else {
                state.jobStore.beginInspection(operationId)
                state.jobStore.finishInspection(operationId, { authorizationRequired: false })
                state.jobStore.beginPreparing(operationId)
            }
            const restarted = createImportPrepareOwner({
                jobStore: state.jobStore,
                upload: state.upload,
                preparedStore: state.preparedStore,
                parserBundlePath: state.parserBundlePath,
                limits: LIMITS,
            })
            expect((await restarted.run(operationId)).state).toBe('prepared')
            state.jobStore.close()
        }
    })

    test('deterministic parser failure becomes one typed terminal state', async () => {
        const state = await setup()
        const operationId = 'prepare_failure_001'
        const canary = 'SECRET-CARD-NAME'
        await uploaded(state, operationId, Buffer.from(`{"${canary}":`), { kind: 'character', format: 'json' })
        const result = await state.owner.run(operationId)
        expect(result).toMatchObject({ state: 'failed', errorCode: 'IMPORT_INVALID_JSON' })
        expect(result.errorDetail).toBe('Import validation failed (IMPORT_INVALID_JSON)')
        expect(result.errorDetail).not.toContain(canary)
        expect(state.jobStore.listNonterminal()).toHaveLength(0)
        await expect(state.owner.run(operationId)).resolves.toMatchObject({ state: 'failed' })
        state.jobStore.close()
    })

    test('same-size replacement and symlink replacement fail before staging', async () => {
        for (const replacement of ['same-size', 'symlink']) {
            const state = await setup()
            const operationId = `prepare_tamper_${replacement.replace('-', '_')}_001`
            const original = Buffer.from(JSON.stringify({ type: 'risuModule', name: 'AAAA', description: '' }))
            await uploaded(state, operationId, original)
            const source = path.join(state.root, 'spool', `${operationId}.source`)
            if (replacement === 'same-size') {
                const changed = Buffer.from(JSON.stringify({ type: 'risuModule', name: 'BBBB', description: '' }))
                expect(changed.byteLength).toBe(original.byteLength)
                await fs.writeFile(source, changed)
            } else {
                const moved = `${source}.moved`
                await fs.rename(source, moved)
                await fs.symlink(moved, source)
            }
            const result = await state.owner.run(operationId)
            expect(result).toMatchObject({ state: 'failed', errorCode: 'IMPORT_SOURCE_MISMATCH' })
            await expect(fs.stat(state.preparedStore.stagingDir(operationId)))
                .rejects.toMatchObject({ code: 'ENOENT' })
            state.jobStore.close()
        }
    })
})
