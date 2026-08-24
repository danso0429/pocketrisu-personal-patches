import crypto from 'node:crypto'
import { openAsBlob } from 'node:fs'
import fs from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import path from 'node:path'
import preparedDigestPkg from './importPreparedDigest.cjs'
import {
    openCharXArchive,
    type CharXContainerHint,
    type CharXSeekableBlob,
} from '../../src/ts/process/charxArchive'
import {
    characterCardRequiresLowLevel,
    prepareCharacterCard,
    prepareOffSpecCharacter,
} from '../../src/ts/process/backgroundImportCharacter'
import { prepareModuleFromCharacter } from '../../src/ts/process/backgroundImportCharacterModule'
import { convertExternalLorebookForImport } from '../../src/ts/process/backgroundImportLorebook'
import {
    indexPngCharacter,
    writeIndexedPngImage,
    type PngImportLimits,
} from '../../src/ts/process/backgroundImportPng'
import {
    indexRisuModule,
    materializeIndexedRisuModule,
} from '../../src/ts/process/backgroundImportRisuM'
import type { SeekableImportSource } from '../../src/ts/process/backgroundImportSource'
import { moduleFromJson } from '../../src/ts/process/moduleImport'

export interface ImportParserLimits {
    jsonBytes: number
    inlineAssetBytes: number
    stagedAssets: number
    stagedBytes: number
    png: PngImportLimits
}

export interface ImportParserRequest {
    operationId: string
    sourcePath: string
    stagingDir: string
    kind: 'character' | 'module'
    format: 'json' | 'lorebook' | 'risum' | 'charx' | 'jpeg' | 'png'
    authorized: boolean
    limits: ImportParserLimits
    source?: {
        handle: FileHandle
        size: number
    }
}

export interface StagedImportAsset {
    key: string
    relativePath: string
    bytes: number
    sha256: string
}

export interface PreparedServerImport {
    kind: 'character' | 'module'
    format: ImportParserRequest['format']
    entity: Record<string, any>
    assets: StagedImportAsset[]
    preparedDigest: string
}

const OPERATION_ID = /^[A-Za-z0-9_-]{8,128}$/
const DEFAULT_SD_DATA = [
    ['always', 'solo, 1girl'],
    ['negative', ''],
    ["|character's appearance", ''],
    ['current situation', ''],
    ["$character's pose", ''],
    ["$character's emotion", ''],
    ['current location', ''],
]

function parserError(code: string, message: string): Error & { code: string } {
    return Object.assign(new Error(message), { name: 'ImportParserError', code })
}

function validateRequest(request: ImportParserRequest): void {
    if (!OPERATION_ID.test(request?.operationId ?? '')) throw parserError('IMPORT_INVALID_ID', 'Invalid operation ID')
    if (!['character', 'module'].includes(request.kind)) throw parserError('IMPORT_KIND_INVALID', 'Invalid import kind')
    if (!['json', 'lorebook', 'risum', 'charx', 'jpeg', 'png'].includes(request.format)) {
        throw parserError('IMPORT_UNSUPPORTED_FORMAT', 'Unsupported import format')
    }
    const allowed = request.kind === 'module'
        ? new Set(['json', 'lorebook', 'risum', 'charx'])
        : new Set(['json', 'charx', 'jpeg', 'png'])
    if (!allowed.has(request.format)) {
        throw parserError('IMPORT_UNSUPPORTED_FORMAT', 'Format is not supported for this import kind')
    }
    if (!request.limits || !Number.isSafeInteger(request.limits.jsonBytes) || request.limits.jsonBytes <= 0) {
        throw parserError('IMPORT_LIMIT_INVALID', 'JSON limit is invalid')
    }
    if (!Number.isSafeInteger(request.limits.inlineAssetBytes) || request.limits.inlineAssetBytes <= 0) {
        throw parserError('IMPORT_LIMIT_INVALID', 'Inline asset limit is invalid')
    }
    if (!Number.isSafeInteger(request.limits.stagedAssets) || request.limits.stagedAssets <= 0) {
        throw parserError('IMPORT_LIMIT_INVALID', 'Staged asset count limit is invalid')
    }
    if (!Number.isSafeInteger(request.limits.stagedBytes) || request.limits.stagedBytes <= 0) {
        throw parserError('IMPORT_LIMIT_INVALID', 'Staged asset byte limit is invalid')
    }
}

export function preparedDigestFor(
    kind: 'character' | 'module',
    format: ImportParserRequest['format'],
    entity: Record<string, any>,
    assets: Array<Pick<StagedImportAsset, 'key' | 'bytes' | 'sha256'>>,
): string {
    return preparedDigestPkg.preparedDigestFor(kind, format, entity, assets)
}

function deterministicUuid(operationId: string, label: string): string {
    const bytes = crypto.createHash('sha256').update(`${operationId}\0${label}`).digest().subarray(0, 16)
    bytes[6] = (bytes[6] & 0x0f) | 0x50
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = bytes.toString('hex')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

class NodeFileSource implements SeekableImportSource {
    readonly size: number

    private constructor(
        private readonly handle: FileHandle,
        size: number,
        private readonly ownsHandle: boolean,
    ) {
        this.size = size
    }

    static async open(file: string): Promise<NodeFileSource> {
        const stat = await fs.lstat(file)
        if (!stat.isFile() || stat.isSymbolicLink()) throw parserError('IMPORT_SOURCE_MISMATCH', 'Import source is not a regular file')
        return new NodeFileSource(await fs.open(file, 'r'), stat.size, true)
    }

    static borrowed(handle: FileHandle, size: number): NodeFileSource {
        return new NodeFileSource(handle, size, false)
    }

    async read(offset: number, length: number): Promise<Uint8Array> {
        const output = Buffer.allocUnsafe(length)
        const result = await this.handle.read(output, 0, length, offset)
        if (result.bytesRead !== length) throw parserError('IMPORT_SOURCE_MISMATCH', 'Import source read was incomplete')
        return output
    }

    async close(): Promise<void> {
        if (this.ownsHandle) await this.handle.close()
    }
}

async function sourceForRequest(request: ImportParserRequest): Promise<NodeFileSource> {
    if (request.source) return NodeFileSource.borrowed(request.source.handle, request.source.size)
    return NodeFileSource.open(request.sourcePath)
}

class HandleBlobSlice implements CharXSeekableBlob {
    constructor(
        private readonly handle: FileHandle,
        private readonly offset: number,
        readonly size: number,
    ) {}

    slice(start = 0, end = this.size): CharXSeekableBlob {
        const normalizedStart = Math.min(this.size, Math.max(0, Math.trunc(start)))
        const normalizedEnd = Math.min(this.size, Math.max(normalizedStart, Math.trunc(end)))
        return new HandleBlobSlice(this.handle, this.offset + normalizedStart, normalizedEnd - normalizedStart)
    }

    async arrayBuffer(): Promise<ArrayBuffer> {
        const value = Buffer.allocUnsafe(this.size)
        const result = await this.handle.read(value, 0, value.byteLength, this.offset)
        if (result.bytesRead !== value.byteLength) {
            throw parserError('IMPORT_SOURCE_MISMATCH', 'Import source read was incomplete')
        }
        return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)
    }
}

async function charXSourceForRequest(request: ImportParserRequest): Promise<
    { kind: 'seekable'; value: CharXSeekableBlob; container: CharXContainerHint }
    | { kind: 'blob'; value: Blob; container: CharXContainerHint }
> {
    const container = (request.format === 'jpeg' ? 'jpeg' : 'zip') as CharXContainerHint
    if (request.source) {
        return {
            kind: 'seekable',
            value: new HandleBlobSlice(request.source.handle, 0, request.source.size),
            container,
        }
    }
    return { kind: 'blob', value: await openAsBlob(request.sourcePath), container }
}

async function readJsonFile(request: ImportParserRequest, limit: number): Promise<any> {
    const source = await sourceForRequest(request)
    if (source.size <= 0 || source.size > limit) throw parserError('IMPORT_LIMIT_EXCEEDED', 'Import JSON exceeds the limit')
    try {
        const value = await source.read(0, source.size)
        return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(value))
    }
    catch { throw parserError('IMPORT_INVALID_JSON', 'Import JSON could not be decoded') }
    finally { await source.close() }
}

function safeExtension(fileName = ''): string {
    const candidate = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : 'png'
    return /^[a-z0-9]{1,16}$/.test(candidate) ? candidate : 'png'
}

class AssetStager {
    private readonly inventory = new Map<string, StagedImportAsset>()
    private initialized = false
    private retainedBytes = 0

    constructor(
        private readonly stagingDir: string,
        private readonly operationId: string,
        private readonly maxAssets: number,
        private readonly maxBytes: number,
    ) {}

    private async init() {
        if (this.initialized) return
        const parent = path.dirname(this.stagingDir)
        const parentStat = await fs.lstat(parent)
        if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) {
            throw parserError('IMPORT_PREPARED_PATH_INVALID', 'Prepared root is invalid')
        }
        const stat = await fs.lstat(this.stagingDir)
        if (!stat.isDirectory() || stat.isSymbolicLink()) {
            throw parserError('IMPORT_PREPARED_PATH_INVALID', 'Prepared operation path is invalid')
        }
        this.initialized = true
    }

    private relative(file: string) {
        return path.join(path.basename(this.stagingDir), path.basename(file))
    }

    private async syncDirectory() {
        const handle = await fs.open(this.stagingDir, 'r')
        try { await handle.sync() } finally { await handle.close() }
    }

    private async unlinkTemporary(file: string) {
        try { await fs.unlink(file) }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    }

    private async recordFile(file: string, sha256: string, bytes: number, extension: string) {
        const key = `assets/${sha256}.${extension}`
        const existing = this.inventory.get(key)
        if (existing) return existing
        if (this.inventory.size + 1 > this.maxAssets || this.retainedBytes + bytes > this.maxBytes) {
            throw parserError('IMPORT_LIMIT_EXCEEDED', 'Prepared asset inventory exceeds the limit')
        }
        const value = Object.freeze({ key, relativePath: this.relative(file), bytes, sha256 })
        this.inventory.set(key, value)
        this.retainedBytes += bytes
        return value
    }

    async stage(data: Uint8Array, fileName = ''): Promise<string> {
        await this.init()
        const bytes = Buffer.from(data)
        const sha256 = crypto.createHash('sha256').update(bytes).digest('hex')
        const extension = safeExtension(fileName)
        const file = path.join(this.stagingDir, `${sha256}.${extension}`)
        const key = `assets/${sha256}.${extension}`
        if (this.inventory.has(key)) return key
        if (this.inventory.size + 1 > this.maxAssets || this.retainedBytes + bytes.byteLength > this.maxBytes) {
            throw parserError('IMPORT_LIMIT_EXCEEDED', 'Prepared asset inventory exceeds the limit')
        }
        try {
            const present = await fs.readFile(file)
            if (present.byteLength !== bytes.byteLength || crypto.createHash('sha256').update(present).digest('hex') !== sha256) {
                throw parserError('IMPORT_ASSET_COLLISION', 'Staged asset differs')
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
            const temporary = path.join(this.stagingDir, `${this.operationId}-${crypto.randomUUID()}.tmp`)
            try {
                const handle = await fs.open(temporary, 'wx', 0o600)
                try { await handle.writeFile(bytes); await handle.sync() } finally { await handle.close() }
                await fs.rename(temporary, file)
                await fs.chmod(file, 0o600)
                await this.syncDirectory()
            } catch (writeError) {
                await this.unlinkTemporary(temporary)
                throw writeError
            }
        }
        const record = await this.recordFile(file, sha256, bytes.byteLength, extension)
        return record.key
    }

    async stageStream(
        extension: string,
        writeSource: (write: (data: Uint8Array) => Promise<void>) => Promise<void>,
    ): Promise<string> {
        await this.init()
        const temporary = path.join(this.stagingDir, `${this.operationId}-${crypto.randomUUID()}.tmp`)
        let handle: FileHandle | null = null
        const hash = crypto.createHash('sha256')
        let bytes = 0
        try {
            handle = await fs.open(temporary, 'wx', 0o600)
            await writeSource(async data => {
                const value = Buffer.from(data)
                if (bytes + value.byteLength > this.maxBytes - this.retainedBytes) {
                    throw parserError('IMPORT_LIMIT_EXCEEDED', 'Prepared asset bytes exceed the limit')
                }
                hash.update(value)
                bytes += value.byteLength
                await handle!.write(value)
            })
            await handle.sync()
        } catch (writeError) {
            if (handle) await handle.close().catch(() => undefined)
            await this.unlinkTemporary(temporary)
            throw writeError
        } finally {
            if (handle) await handle.close().catch(() => undefined)
        }
        const sha256 = hash.digest('hex')
        const safeExt = safeExtension(`file.${extension}`)
        const file = path.join(this.stagingDir, `${sha256}.${safeExt}`)
        try {
            const present = await fs.readFile(file)
            if (present.byteLength !== bytes || crypto.createHash('sha256').update(present).digest('hex') !== sha256) {
                throw parserError('IMPORT_ASSET_COLLISION', 'Staged stream asset differs')
            }
            await fs.unlink(temporary)
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
            await fs.rename(temporary, file)
            await fs.chmod(file, 0o600)
            await this.syncDirectory()
        }
        const record = await this.recordFile(file, sha256, bytes, safeExt)
        return record.key
    }

    result(): StagedImportAsset[] { return [...this.inventory.values()] }
}

function preparationDependencies(request: ImportParserRequest, stager: AssetStager) {
    let id = 0
    return {
        freshId: () => deterministicUuid(request.operationId, `entity-${++id}`),
        defaultSdData: () => structuredClone(DEFAULT_SD_DATA),
        // The canonical commit owner applies current database model defaults.
        newChatDefaults: () => ({}),
        saveAsset: (data: Uint8Array, fileName = '') => stager.stage(data, fileName),
        isKnownUri: (value: string) => /^(https?|file|asset):/i.test(value),
    }
}

async function inspectRisuM(request: ImportParserRequest) {
    const source = await sourceForRequest(request)
    try {
        const indexed = await indexRisuModule(source)
        return { authorizationRequired: indexed.module.lowLevelAccess === true }
    } finally { await source.close() }
}

async function inspectPng(request: ImportParserRequest) {
    const source = await sourceForRequest(request)
    let cardText = ''
    try {
        await indexPngCharacter(source, {
            limits: request.limits.png,
            onText(record) {
                if (record.key === 'ccv3' || (record.key === 'chara' && !cardText)) {
                    cardText = new TextDecoder().decode(record.value)
                }
            },
        })
    } finally { await source.close() }
    if (!cardText) throw parserError('IMPORT_INVALID_CHARACTER', 'PNG character metadata is missing')
    if (cardText.startsWith('rcc||')) throw parserError('IMPORT_PASSWORD_REQUIRED', 'Encrypted PNG cards require a foreground password')
    let card: any
    try { card = JSON.parse(Buffer.from(cardText, 'base64').toString('utf8')) }
    catch { throw parserError('IMPORT_INVALID_CHARACTER', 'PNG character metadata is invalid') }
    return { card, authorizationRequired: characterCardRequiresLowLevel(card) }
}

async function inspectCharX(request: ImportParserRequest) {
    const archive = await openCharXArchive(await charXSourceForRequest(request))
    try {
        let module: any = null
        if (archive.module) {
            const moduleBytes = await archive.extract(archive.module)
            const source = {
                size: moduleBytes.byteLength,
                async read(offset: number, length: number) { return moduleBytes.subarray(offset, offset + length) },
            }
            module = (await indexRisuModule(source)).module
        }
        return {
            card: archive.card,
            module,
            authorizationRequired: characterCardRequiresLowLevel(archive.card) || module?.lowLevelAccess === true,
        }
    } finally { await archive.close() }
}

export async function inspectImport(request: ImportParserRequest) {
    validateRequest(request)
    if (request.format === 'risum') return inspectRisuM(request)
    if (request.format === 'png') return inspectPng(request)
    if (request.format === 'charx' || request.format === 'jpeg') return inspectCharX(request)
    const value = await readJsonFile(request, request.limits.jsonBytes)
    if (request.kind === 'module') {
        const module = moduleFromJson(value, entries => convertExternalLorebookForImport(entries as Record<string, any>))
        return { authorizationRequired: module.lowLevelAccess === true }
    }
    return { authorizationRequired: characterCardRequiresLowLevel(value) }
}

async function prepareModule(request: ImportParserRequest, stager: AssetStager) {
    if (request.format === 'risum') {
        const source = await sourceForRequest(request)
        try {
            const indexed = await indexRisuModule(source)
            if (indexed.module.lowLevelAccess && !request.authorized) {
                throw parserError('IMPORT_AUTHORIZATION_REQUIRED', 'Low-level module import requires authorization')
            }
            const module = await materializeIndexedRisuModule(indexed, source, {
                saveAsset: data => stager.stage(data),
            })
            module.id = deterministicUuid(request.operationId, 'module')
            return module
        } finally { await source.close() }
    }
    const value = await readJsonFile(request, request.limits.jsonBytes)
    const module = moduleFromJson(value, entries => convertExternalLorebookForImport(entries as Record<string, any>))
    if (module.lowLevelAccess && !request.authorized) {
        throw parserError('IMPORT_AUTHORIZATION_REQUIRED', 'Low-level module import requires authorization')
    }
    return { ...module, description: module.description ?? '', id: deterministicUuid(request.operationId, 'module') }
}

async function prepareCharX(request: ImportParserRequest, stager: AssetStager) {
    const inspection = await inspectCharX(request)
    if (inspection.authorizationRequired && !request.authorized) {
        throw parserError('IMPORT_AUTHORIZATION_REQUIRED', 'Low-level CharX import requires authorization')
    }
    const archive = await openCharXArchive(await charXSourceForRequest(request))
    try {
        const assetDict: Record<string, string> = {}
        for (const plan of archive.assets) assetDict[plan.name] = await stager.stage(await archive.extract(plan))
        let overrideLorebook: any[] | null = null
        const card: any = structuredClone(archive.card)
        if (archive.module) {
            const moduleBytes = await archive.extract(archive.module)
            const source = {
                size: moduleBytes.byteLength,
                async read(offset: number, length: number) { return moduleBytes.subarray(offset, offset + length) },
            }
            const indexed = await indexRisuModule(source)
            const module = await materializeIndexedRisuModule(indexed, source, {
                saveAsset: data => stager.stage(data),
            })
            card.data.extensions ??= {}
            card.data.extensions.risuai ??= {}
            card.data.extensions.risuai.triggerscript = module.trigger ?? []
            card.data.extensions.risuai.customScripts = module.regex ?? []
            if (module.lorebook) overrideLorebook = module.lorebook
            if (module.lowLevelAccess) card.data.extensions.risuai.lowLevelAccess = true
        }
        const character = await prepareCharacterCard(card, preparationDependencies(request, stager), {
            authorized: request.authorized,
            assetDict,
            overrideLorebook,
            maxInlineAssetBytes: request.limits.inlineAssetBytes,
        })
        return request.kind === 'module'
            ? prepareModuleFromCharacter(character, () => deterministicUuid(request.operationId, 'module'))
            : character
    } finally { await archive.close() }
}

async function preparePng(request: ImportParserRequest, stager: AssetStager) {
    const inspection = await inspectPng(request)
    if (inspection.authorizationRequired && !request.authorized) {
        throw parserError('IMPORT_AUTHORIZATION_REQUIRED', 'Low-level PNG import requires authorization')
    }
    const source = await sourceForRequest(request)
    const assetDict: Record<string, string> = {}
    let cardText = ''
    try {
        const indexed = await indexPngCharacter(source, {
            limits: request.limits.png,
            async onText(record) {
                const value = new TextDecoder().decode(record.value)
                if (record.key === 'ccv3' || (record.key === 'chara' && !cardText)) cardText = value
                else if (record.key.startsWith('chara-ext-asset_')) {
                    const key = record.key.replace('chara-ext-asset_:', '').replace('chara-ext-asset_', '')
                    const data = Buffer.from(value, 'base64')
                    if (data.byteLength > request.limits.inlineAssetBytes) {
                        throw parserError('IMPORT_LIMIT_EXCEEDED', 'PNG embedded asset exceeds the limit')
                    }
                    assetDict[key] = await stager.stage(data)
                }
            },
        })
        const imageAsset = await stager.stageStream('png', write => writeIndexedPngImage(indexed, source, {
            ioChunkBytes: request.limits.png.ioChunkBytes,
            write,
        }))
        if (!cardText || cardText.startsWith('rcc||')) {
            throw parserError(cardText ? 'IMPORT_PASSWORD_REQUIRED' : 'IMPORT_INVALID_CHARACTER', 'PNG card data is unavailable')
        }
        const card = JSON.parse(Buffer.from(cardText, 'base64').toString('utf8'))
        const character = card?.spec === 'chara_card_v2' || card?.spec === 'chara_card_v3'
            ? await prepareCharacterCard(card, preparationDependencies(request, stager), {
                authorized: request.authorized,
                imageAsset,
                assetDict,
                maxInlineAssetBytes: request.limits.inlineAssetBytes,
            })
            : prepareOffSpecCharacter(card, imageAsset, preparationDependencies(request, stager))
        return request.kind === 'module'
            ? prepareModuleFromCharacter(character, () => deterministicUuid(request.operationId, 'module'))
            : character
    } finally { await source.close() }
}

async function prepareCharacterJson(request: ImportParserRequest, stager: AssetStager) {
    const card = await readJsonFile(request, request.limits.jsonBytes)
    if (card?.spec === 'chara_card_v2' || card?.spec === 'chara_card_v3') {
        return prepareCharacterCard(card, preparationDependencies(request, stager), {
            authorized: request.authorized,
            maxInlineAssetBytes: request.limits.inlineAssetBytes,
        })
    }
    if (
        !(card?.char_name || card?.name)
        || !(card?.char_persona || card?.description)
        || !(card?.char_greeting || card?.first_mes)
    ) {
        throw parserError('IMPORT_INVALID_CHARACTER', 'Character JSON has no supported card data')
    }
    return prepareOffSpecCharacter(card, undefined, preparationDependencies(request, stager))
}

export async function prepareImport(request: ImportParserRequest): Promise<PreparedServerImport> {
    validateRequest(request)
    const inspection = await inspectImport(request)
    if (inspection.authorizationRequired && !request.authorized) {
        throw parserError('IMPORT_AUTHORIZATION_REQUIRED', 'Import authorization is required')
    }
    const stager = new AssetStager(
        request.stagingDir,
        request.operationId,
        request.limits.stagedAssets,
        request.limits.stagedBytes,
    )
    let entity: any
    if (request.format === 'charx' || request.format === 'jpeg') entity = await prepareCharX(request, stager)
    else if (request.format === 'png') entity = await preparePng(request, stager)
    else if (request.kind === 'module') entity = await prepareModule(request, stager)
    else entity = await prepareCharacterJson(request, stager)
    const assets = stager.result()
    const preparedDigest = preparedDigestFor(request.kind, request.format, entity, assets)
    return Object.freeze({ kind: request.kind, format: request.format, entity, assets, preparedDigest })
}
