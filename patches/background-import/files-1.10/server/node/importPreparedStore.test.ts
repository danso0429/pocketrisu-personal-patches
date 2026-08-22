import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import digestPkg from './importPreparedDigest.cjs'
import pkg from './importPreparedStore.cjs'

const { createPreparedImportStore } = pkg
const { digestPrepared } = digestPkg
const roots: string[] = []

async function setup() {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prepared-import-'))
    roots.push(root)
    return {
        root,
        store: createPreparedImportStore({ root }),
    }
}

async function fixture(store: any, operationId = 'prepared_operation_001') {
    const dir = store.stagingDir(operationId)
    await fs.mkdir(dir, { recursive: true, mode: 0o700 })
    const value = Buffer.from('asset payload')
    const sha256 = crypto.createHash('sha256').update(value).digest('hex')
    const file = path.join(dir, `${sha256}.png`)
    await fs.writeFile(file, value, { mode: 0o600 })
    const prepared: any = {
        kind: 'module', format: 'risum',
        entity: { id: 'module-id', name: 'Module' },
        assets: [{
            key: `assets/${sha256}.png`,
            relativePath: `${operationId}/${sha256}.png`,
            bytes: value.byteLength,
            sha256,
        }],
    }
    prepared.preparedDigest = digestPrepared(prepared)
    return { prepared, file, value }
}

afterEach(async () => {
    while (roots.length) await fs.rm(roots.pop()!, { recursive: true, force: true })
})

describe('private prepared import store', () => {
    test('write/read is durable, private, and verifies every staged asset', async () => {
        const { root, store } = await setup()
        const { prepared } = await fixture(store)
        await store.write('prepared_operation_001', prepared)
        expect(await store.read('prepared_operation_001')).toEqual(prepared)
        expect((await fs.stat(root)).mode & 0o777).toBe(0o700)
        expect((await fs.stat(store.stagingDir('prepared_operation_001'))).mode & 0o777).toBe(0o700)
        expect((await fs.stat(store.preparedPath('prepared_operation_001'))).mode & 0o777).toBe(0o600)
    })

    test('semantic or asset corruption fails closed', async () => {
        const { store } = await setup()
        const { prepared, file } = await fixture(store)
        await store.write('prepared_operation_001', prepared)
        await fs.writeFile(file, 'changed')
        await expect(store.read('prepared_operation_001')).rejects.toHaveProperty('code', 'IMPORT_STAGED_ASSET_MISMATCH')
        await fs.writeFile(file, 'asset payload')
        const raw = JSON.parse(await fs.readFile(store.preparedPath('prepared_operation_001'), 'utf8'))
        raw.entity.name = 'changed'
        await fs.writeFile(store.preparedPath('prepared_operation_001'), JSON.stringify(raw))
        await expect(store.read('prepared_operation_001')).rejects.toHaveProperty('code', 'IMPORT_PREPARED_DIGEST_MISMATCH')
    })

    test('unsafe relative paths, key/hash mismatch, and symlink assets are rejected', async () => {
        const { store } = await setup()
        const { prepared, file } = await fixture(store)
        prepared.assets[0].relativePath = '../escape'
        prepared.preparedDigest = digestPrepared(prepared)
        await expect(store.write('prepared_operation_001', prepared)).rejects.toHaveProperty('code', 'IMPORT_PREPARED_PATH_INVALID')

        const next = await fixture(store, 'prepared_operation_002')
        next.prepared.assets[0].key = `assets/${'0'.repeat(64)}.png`
        next.prepared.preparedDigest = digestPrepared(next.prepared)
        await expect(store.write('prepared_operation_002', next.prepared)).rejects.toHaveProperty('code', 'IMPORT_STAGED_ASSET_MISMATCH')

        const linked = await fixture(store, 'prepared_operation_003')
        await fs.unlink(linked.file)
        await fs.symlink(file, linked.file)
        await expect(store.write('prepared_operation_003', linked.prepared)).rejects.toHaveProperty('code', 'IMPORT_PREPARED_PATH_INVALID')
    })

    test('explicit cleanup removes only the exact operation directory', async () => {
        const { root, store } = await setup()
        const first = await fixture(store, 'prepared_operation_001')
        const second = await fixture(store, 'prepared_operation_002')
        await store.write('prepared_operation_001', first.prepared)
        await store.write('prepared_operation_002', second.prepared)
        await store.remove('prepared_operation_001')
        await expect(fs.stat(store.stagingDir('prepared_operation_001'))).rejects.toMatchObject({ code: 'ENOENT' })
        expect(await store.read('prepared_operation_002')).toEqual(second.prepared)
        expect(await fs.readdir(root)).toEqual(['prepared_operation_002'])
    })
})
