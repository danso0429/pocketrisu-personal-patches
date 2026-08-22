import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import commitPkg from './importCommit.cjs'
import digestPkg from './importPreparedDigest.cjs'
import jobPkg from './importJobStore.cjs'
import preparedPkg from './importPreparedStore.cjs'

const { createAppendOnlyCanonicalCommitter, createImportCommitOwner } = commitPkg
const { digestPrepared } = digestPkg
const { createImportJobStore } = jobPkg
const { createPreparedImportStore } = preparedPkg
const roots: string[] = []

function entityId(kind: string, entity: any) {
    return kind === 'module' ? entity.id : entity.chaId
}

async function setup(options: { fault?: (point: string) => void } = {}) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'import-commit-'))
    roots.push(root)
    const jobStore = createImportJobStore({ dbPath: path.join(root, 'jobs.db') })
    const preparedStore = createPreparedImportStore({ root: path.join(root, 'prepared') })
    const state: any = {
        database: {
            modules: [null, { id: 'existing-module', name: 'Existing' }],
            enabledModules: ['existing-module'],
            characters: [{ chaId: 'existing-char', name: 'Existing', chats: [] }],
            characterOrder: ['existing-char'],
            statics: { imports: 4 },
            setting: { preserved: true },
            useModelPresetByDefault: true,
            defaultModelBinding: { main: ['module', 'model'] },
        },
        markers: new Map<string, any>(),
        assets: new Map<string, Buffer>(),
        failPromotion: false,
    }
    let queue = Promise.resolve()
    const canonical = createAppendOnlyCanonicalCommitter({
        runStorageOperation(operation: () => Promise<any>) {
            const next = queue.then(operation, operation)
            queue = next.catch(() => undefined)
            return next
        },
        async loadDatabase() { return structuredClone(state.database) },
        async promoteAsset(asset: any, file: string) {
            if (state.failPromotion) throw new Error('promotion failed')
            const value = await fs.readFile(file)
            const present = state.assets.get(asset.key)
            if (present && !present.equals(value)) throw Object.assign(new Error('asset collision'), { code: 'IMPORT_ASSET_COLLISION' })
            state.assets.set(asset.key, value)
        },
        async readCommitMarker(operationId: string) {
            return structuredClone(state.markers.get(operationId) ?? null)
        },
        computeRevision() { return `revision-${state.markers.size + 1}` },
        async persistDatabaseAndMarker(database: any, marker: any) {
            state.database = structuredClone(database)
            state.markers.set(marker.operationId, structuredClone(marker))
            return { committedRevision: marker.committedRevision }
        },
        async synchronizeCanonicalState() {},
        newChatDefaults(database: any) {
            return database.useModelPresetByDefault
                ? { useModelPreset: true, modelBinding: structuredClone(database.defaultModelBinding) }
                : {}
        },
    })
    const owner = createImportCommitOwner({
        jobStore, preparedStore, committer: canonical, fault: options.fault,
    })
    return { root, jobStore, preparedStore, state, canonical, owner }
}

async function stagePrepared(
    state: Awaited<ReturnType<typeof setup>>,
    operationId: string,
    kind: 'module' | 'character',
    entity: any,
    assetText: string[] = [],
) {
    state.jobStore.createJob({
        operationId, protocolVersion: 1, kind, declaredFormat: kind === 'module' ? 'risum' : 'json',
        sourceSize: 1, origin: 'picker', admissionBuild: '1.10.0-test-build',
    })
    state.jobStore.advanceUpload(operationId, 0, 1)
    state.jobStore.beginUploadFinalization(operationId, 'a'.repeat(64))
    state.jobStore.markUploaded(operationId, 'a'.repeat(64))
    state.jobStore.beginInspection(operationId)
    state.jobStore.finishInspection(operationId, { authorizationRequired: false })
    state.jobStore.beginPreparing(operationId)
    const directory = state.preparedStore.stagingDir(operationId)
    await fs.mkdir(directory, { recursive: true, mode: 0o700 })
    const assets = []
    for (const text of assetText) {
        const value = Buffer.from(text)
        const sha256 = crypto.createHash('sha256').update(value).digest('hex')
        const file = `${sha256}.png`
        await fs.writeFile(path.join(directory, file), value, { mode: 0o600 })
        assets.push({
            key: `assets/${file}`, relativePath: `${operationId}/${file}`,
            bytes: value.byteLength, sha256,
        })
    }
    const prepared: any = {
        kind, format: kind === 'module' ? 'risum' : 'json', entity, assets,
    }
    prepared.preparedDigest = digestPrepared(prepared)
    await state.preparedStore.write(operationId, prepared)
    state.jobStore.markPrepared(operationId, {
        preparedDigest: prepared.preparedDigest,
        entityId: entityId(kind, entity),
    })
    return prepared
}

afterEach(async () => {
    while (roots.length) await fs.rm(roots.pop()!, { recursive: true, force: true })
})

describe('append-only canonical import commit', () => {
    test('module append preserves unrelated state and never enables the module', async () => {
        const state = await setup()
        const entity = { id: 'imported-module', name: 'Imported', description: '', assets: [] }
        await stagePrepared(state, 'commit_module_001', 'module', entity, ['asset'])
        const result = await state.owner.run('commit_module_001')
        expect(result).toMatchObject({ state: 'completed', entityId: entity.id, committedRevision: 'revision-1' })
        expect(state.state.database.setting).toEqual({ preserved: true })
        expect(state.state.database.modules.filter((item: any) => item?.id === entity.id)).toHaveLength(1)
        expect(state.state.database.enabledModules).toEqual(['existing-module'])
        expect(state.state.assets.size).toBe(1)
        state.jobStore.close()
    })

    test('character append applies latest chat defaults, order, and statistic exactly once', async () => {
        const state = await setup()
        const entity = {
            chaId: 'imported-char', name: 'Imported Character',
            chats: [{ id: 'imported-chat', name: 'Chat 1', message: [] }],
        }
        await stagePrepared(state, 'commit_character_001', 'character', entity)
        await state.owner.run('commit_character_001')
        const committed = state.state.database.characters.find((item: any) => item.chaId === entity.chaId)
        expect(committed.chats[0]).toMatchObject({
            id: 'imported-chat', useModelPreset: true,
            modelBinding: { main: ['module', 'model'] },
        })
        expect(state.state.database.characterOrder).toEqual(['existing-char', 'imported-char'])
        expect(state.state.database.statics.imports).toBe(5)
        expect((await state.owner.run('commit_character_001')).state).toBe('completed')
        expect(state.state.database.characters.filter((item: any) => item.chaId === entity.chaId)).toHaveLength(1)
        expect(state.state.database.statics.imports).toBe(5)
        state.jobStore.close()
    })

    test('same ID with different content parks reconciliation instead of overwriting', async () => {
        const state = await setup()
        const entity = { id: 'existing-module', name: 'Different' }
        await stagePrepared(state, 'commit_collision_001', 'module', entity)
        const result = await state.owner.run('commit_collision_001')
        expect(result).toMatchObject({ state: 'reconcile-required', errorCode: 'IMPORT_COMMIT_CONFLICT' })
        expect(state.state.database.modules.find((item: any) => item?.id === 'existing-module').name).toBe('Existing')
        expect(state.state.markers.size).toBe(0)
        state.jobStore.close()
    })

    test('asset promotion failure leaves DB uncommitted and exact retry succeeds', async () => {
        const state = await setup()
        const entity = { id: 'retry-module', name: 'Retry' }
        await stagePrepared(state, 'commit_retry_001', 'module', entity, ['first', 'second'])
        state.state.failPromotion = true
        await expect(state.owner.run('commit_retry_001')).rejects.toThrow('promotion failed')
        expect(state.jobStore.getJob('commit_retry_001').state).toBe('committing')
        expect(state.state.database.modules.some((item: any) => item?.id === entity.id)).toBe(false)
        expect(state.state.markers.size).toBe(0)
        state.state.failPromotion = false
        expect((await state.owner.run('commit_retry_001')).state).toBe('completed')
        expect(state.state.database.modules.filter((item: any) => item?.id === entity.id)).toHaveLength(1)
        state.jobStore.close()
    })

    test('lost job-state response after canonical marker recovers without duplicate', async () => {
        let failOnce = true
        const state = await setup({
            fault(point) {
                if (point === 'after-canonical' && failOnce) {
                    failOnce = false
                    throw new Error('lost response')
                }
            },
        })
        const entity = { id: 'lost-response-module', name: 'Lost response' }
        await stagePrepared(state, 'commit_lost_response_001', 'module', entity, ['recover asset'])
        await expect(state.owner.run('commit_lost_response_001')).rejects.toThrow('lost response')
        expect(state.jobStore.getJob('commit_lost_response_001').state).toBe('committing')
        expect(state.state.database.modules.filter((item: any) => item?.id === entity.id)).toHaveLength(1)
        expect(state.state.markers.size).toBe(1)
        state.state.assets.clear()
        const restarted = createImportCommitOwner({
            jobStore: state.jobStore,
            preparedStore: state.preparedStore,
            committer: state.canonical,
        })
        expect((await restarted.run('commit_lost_response_001')).state).toBe('completed')
        expect(state.state.database.modules.filter((item: any) => item?.id === entity.id)).toHaveLength(1)
        expect(state.state.assets.size).toBe(1)
        state.jobStore.close()
    })
})
