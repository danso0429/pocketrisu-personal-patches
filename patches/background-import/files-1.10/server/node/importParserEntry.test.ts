import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'

const decodeRPack = vi.hoisted(() => vi.fn(async (data: Uint8Array) => data))
vi.mock('../../src/ts/rpack/rpack_js', () => ({
    encodeRPack: async (data: Uint8Array) => data,
    decodeRPack,
}))

import { encodeRPack } from '../../src/ts/rpack/rpack_js'
import {
    PNG_SIGNATURE,
} from '../../src/ts/process/backgroundImportPng'
import {
    buildFixtureArchive,
    fixtureCard,
} from '../../src/ts/process/charxTestFixtures'
import {
    inspectImport,
    prepareImport,
} from './importParserEntry'

const roots: string[] = []
const LIMITS = Object.freeze({
    jsonBytes: 50 * 1024 * 1024,
    inlineAssetBytes: 50 * 1024 * 1024,
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

function concat(parts: Uint8Array[]): Uint8Array {
    const output = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0))
    let offset = 0
    for (const part of parts) {
        output.set(part, offset)
        offset += part.byteLength
    }
    return output
}

function u32le(value: number): Uint8Array {
    const output = new Uint8Array(4)
    new DataView(output.buffer).setUint32(0, value, true)
    return output
}

function u32be(value: number): Buffer {
    const output = Buffer.alloc(4)
    output.writeUInt32BE(value >>> 0)
    return output
}

async function risum(options: { lowLevel?: boolean; assets?: string[] } = {}) {
    const assets = options.assets ?? []
    const module = {
        name: 'RisuM fixture', description: '', id: 'source-id',
        lowLevelAccess: options.lowLevel ?? false,
        assets: assets.map((_, index) => [`asset-${index}`, '', 'bin']),
    }
    const main = await encodeRPack(new TextEncoder().encode(JSON.stringify({ type: 'risuModule', module })))
    const parts = [new Uint8Array([111, 0]), u32le(main.byteLength), main]
    for (const asset of assets) {
        const encoded = await encodeRPack(new TextEncoder().encode(asset))
        parts.push(new Uint8Array([1]), u32le(encoded.byteLength), encoded)
    }
    parts.push(new Uint8Array([0]))
    return concat(parts)
}

function crc32(data: Uint8Array) {
    let crc = 0xffffffff
    for (const value of data) {
        crc ^= value
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
    }
    return (crc ^ 0xffffffff) >>> 0
}

function validPngChunk(type: string, data: Uint8Array): Buffer {
    const typeBytes = Buffer.from(type)
    return Buffer.concat([
        u32be(data.byteLength), typeBytes, Buffer.from(data),
        u32be(crc32(Buffer.concat([typeBytes, Buffer.from(data)]))),
    ])
}

function pngText(key: string, value: string): Buffer {
    return validPngChunk('tEXt', Buffer.concat([Buffer.from(key), Buffer.from([0]), Buffer.from(value)]))
}

function png(card: unknown, asset = 'png asset') {
    return Buffer.concat([
        Buffer.from(PNG_SIGNATURE),
        validPngChunk('IHDR', Buffer.alloc(13)),
        pngText('ccv3', Buffer.from(JSON.stringify(card)).toString('base64')),
        pngText('chara-ext-asset_0', Buffer.from(asset).toString('base64')),
        validPngChunk('IDAT', Buffer.alloc(1024, 3)),
        validPngChunk('IEND', Buffer.alloc(0)),
    ])
}

async function setup() {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'import-parser-'))
    roots.push(root)
    const sourcePath = path.join(root, 'source.bin')
    const stagingDir = path.join(root, 'staging')
    return { root, sourcePath, stagingDir }
}

function request(sourcePath: string, stagingDir: string, overrides: Record<string, unknown> = {}) {
    return {
        operationId: 'parser_operation_001',
        sourcePath,
        stagingDir,
        kind: 'module' as const,
        format: 'risum',
        authorized: false,
        limits: LIMITS,
        ...overrides,
    }
}

async function stagedBytes(root: string, result: any) {
    return Promise.all(result.assets.map(async (asset: any) => ({
        key: asset.key,
        bytes: await fs.readFile(path.join(root, asset.relativePath)),
    })))
}

afterEach(async () => {
    while (roots.length) await fs.rm(roots.pop()!, { recursive: true, force: true })
})

describe('server import parser entry', () => {
    test('low-level module JSON inspects without writes and requires authorization', async () => {
        const { sourcePath, stagingDir } = await setup()
        await fs.writeFile(sourcePath, JSON.stringify({
            type: 'risuModule', name: 'JSON module', description: '', lowLevelAccess: true,
        }))
        const input = request(sourcePath, stagingDir, { format: 'json' })
        expect(await inspectImport(input)).toMatchObject({ authorizationRequired: true })
        await expect(fs.stat(stagingDir)).rejects.toMatchObject({ code: 'ENOENT' })
        await expect(prepareImport(input)).rejects.toHaveProperty('code', 'IMPORT_AUTHORIZATION_REQUIRED')
        const prepared = await prepareImport({ ...input, authorized: true })
        expect(prepared.entity).toMatchObject({ name: 'JSON module', lowLevelAccess: true })
        expect(prepared.assets).toHaveLength(0)
    })

    test('seekable RisuM stages every asset once with deterministic entity ID', async () => {
        const { root, sourcePath, stagingDir } = await setup()
        const bytes = await risum({ assets: ['first', 'second'] })
        await fs.writeFile(sourcePath, bytes)
        const input = request(sourcePath, stagingDir)
        expect(await inspectImport(input)).toMatchObject({ authorizationRequired: false })
        const prepared = await prepareImport(input)
        expect(prepared.entity.id).toMatch(/^[0-9a-f-]{36}$/)
        expect(prepared.assets).toHaveLength(2)
        const staged = await stagedBytes(root, prepared)
        expect(staged.map(item => item.bytes.toString())).toEqual(['first', 'second'])
        expect(prepared.entity.assets.map((asset: string[]) => asset[1])).toEqual(staged.map(item => item.key))
        expect((await prepareImport(input)).preparedDigest).toBe(prepared.preparedDigest)
        const secondDirectory = path.join(root, 'different-staging-name')
        expect((await prepareImport({ ...input, stagingDir: secondDirectory })).preparedDigest)
            .toBe(prepared.preparedDigest)
    })

    test('character JSON creates one stable character with no database mutation', async () => {
        const { sourcePath, stagingDir } = await setup()
        const card = JSON.parse(fixtureCard([]))
        await fs.writeFile(sourcePath, JSON.stringify(card))
        const prepared = await prepareImport(request(sourcePath, stagingDir, {
            kind: 'character', format: 'json', authorized: true,
        }))
        expect(prepared.entity).toMatchObject({
            name: 'Fixture', imported: true,
            chats: [{ id: expect.any(String), message: [] }],
        })
        expect(prepared.assets).toHaveLength(0)
    })

    test('CharX prepares a character or module from the same staged assets', async () => {
        const { root, sourcePath, stagingDir } = await setup()
        const moduleBytes = await risum({ assets: ['module asset'] })
        const archive = buildFixtureArchive([
            { name: 'card.json', data: fixtureCard(['assets/card.bin']), descriptor: true },
            { name: 'assets/card.bin', data: 'card asset', descriptor: true },
            { name: 'module.risum', data: moduleBytes, descriptor: true },
        ])
        await fs.writeFile(sourcePath, archive.bytes)
        const character = await prepareImport(request(sourcePath, stagingDir, {
            kind: 'character', format: 'charx', authorized: true,
        }))
        expect(character.entity).toMatchObject({ name: 'Fixture', imported: true })
        expect(character.assets).toHaveLength(2)
        expect((await stagedBytes(root, character)).map(item => item.bytes.toString()).sort())
            .toEqual(['card asset', 'module asset'])

        const module = await prepareImport(request(sourcePath, stagingDir, {
            operationId: 'parser_operation_002',
            kind: 'module', format: 'charx', authorized: true,
        }))
        expect(module.entity).toMatchObject({ name: 'Fixture', id: expect.any(String) })
        expect(module.assets).toHaveLength(2)
    })

    test('PNG stages embedded assets and the exact metadata-trimmed image', async () => {
        const { root, sourcePath, stagingDir } = await setup()
        const card = JSON.parse(fixtureCard([]))
        card.data.assets = [{
            type: 'icon', uri: 'embeded://0', name: 'main', ext: 'png',
        }]
        const bytes = png(card)
        await fs.writeFile(sourcePath, bytes)
        const prepared = await prepareImport(request(sourcePath, stagingDir, {
            kind: 'character', format: 'png', authorized: true,
        }))
        expect(prepared.entity).toMatchObject({ name: 'Fixture', image: expect.stringMatching(/^assets\//) })
        const staged = await stagedBytes(root, prepared)
        expect(staged.some(item => item.bytes.toString() === 'png asset')).toBe(true)
        expect(staged.some(item => item.bytes.subarray(0, 8).equals(Buffer.from(PNG_SIGNATURE)))).toBe(true)
    })

    test('corrupt source produces no prepared staging result', async () => {
        const { sourcePath, stagingDir } = await setup()
        await fs.writeFile(sourcePath, Buffer.from('not an archive'))
        await expect(prepareImport(request(sourcePath, stagingDir, {
            kind: 'character', format: 'charx', authorized: true,
        }))).rejects.toBeTruthy()
        await expect(fs.stat(stagingDir)).rejects.toMatchObject({ code: 'ENOENT' })
    })

    test('invalid kind/format pairs and unsupported character JSON fail before staging', async () => {
        const { sourcePath, stagingDir } = await setup()
        await fs.writeFile(sourcePath, JSON.stringify({ arbitrary: true }))
        await expect(prepareImport(request(sourcePath, stagingDir, {
            kind: 'character', format: 'risum', authorized: true,
        }))).rejects.toHaveProperty('code', 'IMPORT_UNSUPPORTED_FORMAT')
        await expect(prepareImport(request(sourcePath, stagingDir, {
            kind: 'character', format: 'json', authorized: true,
        }))).rejects.toHaveProperty('code', 'IMPORT_INVALID_CHARACTER')
        await expect(fs.stat(stagingDir)).rejects.toMatchObject({ code: 'ENOENT' })
    })
})
