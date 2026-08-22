import {
    Reader,
    Uint8ArrayWriter,
    ZipReader,
    type FileEntry,
} from '@zip.js/zip.js'
import type { CharacterCardV3 } from '@risuai/ccardlib'

export const CHARX_LIMITS = Object.freeze({
    entryBytes: 50 * 1024 * 1024,
    entryCount: 0xffff,
    metadataBytes: 16 * 1024 * 1024,
    selectedBytes: 1024 * 1024 * 1024,
    jpegPrefixBytes: 50 * 1024 * 1024,
    retainedBytes: 50 * 1024 * 1024,
})

export type CharXContainerHint = 'zip' | 'jpeg'

export type CharXArchiveErrorCode =
    | 'CHARX_INVALID_DIRECTORY'
    | 'CHARX_AMBIGUOUS_ENTRY'
    | 'CHARX_UNSUPPORTED_ARCHIVE'
    | 'CHARX_CRC_MISMATCH'
    | 'CHARX_LIMIT_EXCEEDED'
    | 'CHARX_MISSING_CARD'
    | 'CHARX_INVALID_CARD'
    | 'CHARX_MISSING_ASSET'
    | 'CHARX_SAVE_FAILED'
    | 'CHARX_ABORTED'
    | 'CHARX_READER_FAILURE'

export class CharXArchiveError extends Error {
    constructor(public readonly code: CharXArchiveErrorCode, message: string, options?: ErrorOptions) {
        super(message, options)
        this.name = 'CharXArchiveError'
    }
}

export interface CharXSource {
    kind: 'file' | 'bytes'
    value: File | Uint8Array
    container: CharXContainerHint
}

export interface CharXEntryPlan {
    readonly name: string
    readonly uncompressedSize: number
}

export interface CharXArchivePlan {
    readonly card: CharacterCardV3
    readonly assets: readonly CharXEntryPlan[]
    readonly module?: CharXEntryPlan
    readonly archiveEntryCount: number
    readonly referencedAssetCount: number
    readonly selectedUncompressedBytes: number
    extract(entry: CharXEntryPlan, signal?: AbortSignal): Promise<Uint8Array>
    close(): Promise<void>
}

type PlannedFileEntry = CharXEntryPlan & { entry: FileEntry }

class SliceBlobReader extends Reader<Blob> {
    constructor(private readonly source: Blob) {
        super(source)
        this.size = source.size
    }

    override async readUint8Array(offset: number, length: number): Promise<Uint8Array> {
        const end = Math.min(this.source.size, offset + length)
        const slice = this.source.slice(offset, end)
        return new Uint8Array(await slice.arrayBuffer())
    }
}

const ZIP_LOCAL_SIGNATURE = new Uint8Array([0x50, 0x4b, 0x03, 0x04])
const JPEG_SOI = 0xffd8
const JPEG_EOI = 0xd9
const JPEG_SOS = 0xda

class BlobCursor {
    private offset = 0
    private cache = new Uint8Array()
    private cacheOffset = 0
    private readonly chunkBytes = 64 * 1024

    constructor(private readonly blob: Blob, private readonly limit: number) {}

    get position(): number {
        return this.offset
    }

    private async fill(): Promise<void> {
        if (this.offset >= this.limit || this.offset >= this.blob.size) {
            throw new CharXArchiveError('CHARX_UNSUPPORTED_ARCHIVE', 'Invalid or unterminated CharX JPEG prefix')
        }
        this.cacheOffset = this.offset
        const end = Math.min(this.blob.size, this.limit, this.offset + this.chunkBytes)
        this.cache = new Uint8Array(await this.blob.slice(this.offset, end).arrayBuffer())
    }

    async byte(): Promise<number> {
        if (this.offset < this.cacheOffset || this.offset >= this.cacheOffset + this.cache.byteLength) {
            await this.fill()
        }
        const value = this.cache[this.offset - this.cacheOffset]
        this.offset += 1
        return value
    }

    async uint16(): Promise<number> {
        return ((await this.byte()) << 8) | await this.byte()
    }

    async skip(bytes: number): Promise<void> {
        if (!Number.isSafeInteger(bytes) || bytes < 0 || this.offset + bytes > this.limit || this.offset + bytes > this.blob.size) {
            throw new CharXArchiveError('CHARX_UNSUPPORTED_ARCHIVE', 'Invalid CharX JPEG segment length')
        }
        this.offset += bytes
    }
}

function isStandaloneJpegMarker(marker: number): boolean {
    return marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xd8
}

async function nextJpegMarker(cursor: BlobCursor): Promise<number> {
    if (await cursor.byte() !== 0xff) {
        throw new CharXArchiveError('CHARX_UNSUPPORTED_ARCHIVE', 'Invalid CharX JPEG marker')
    }
    let marker = await cursor.byte()
    while (marker === 0xff) marker = await cursor.byte()
    if (marker === 0x00) {
        throw new CharXArchiveError('CHARX_UNSUPPORTED_ARCHIVE', 'Unexpected stuffed JPEG marker')
    }
    return marker
}

async function jpegArchiveOffset(blob: Blob): Promise<number> {
    const cursor = new BlobCursor(blob, Math.min(blob.size, CHARX_LIMITS.jpegPrefixBytes + 1))
    if (await cursor.uint16() !== JPEG_SOI) {
        throw new CharXArchiveError('CHARX_UNSUPPORTED_ARCHIVE', 'CharX JPEG prefix is missing SOI')
    }

    let entropy = false
    let pendingMarker: number | undefined
    while (cursor.position <= CHARX_LIMITS.jpegPrefixBytes) {
        let marker: number
        if (pendingMarker !== undefined) {
            marker = pendingMarker
            pendingMarker = undefined
        } else if (entropy) {
            const value = await cursor.byte()
            if (value !== 0xff) continue
            marker = await cursor.byte()
            while (marker === 0xff) marker = await cursor.byte()
            if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) continue
            entropy = false
        } else {
            marker = await nextJpegMarker(cursor)
        }

        if (marker === JPEG_EOI) return cursor.position
        if (isStandaloneJpegMarker(marker)) continue

        const length = await cursor.uint16()
        if (length < 2) {
            throw new CharXArchiveError('CHARX_UNSUPPORTED_ARCHIVE', 'Invalid CharX JPEG segment')
        }
        await cursor.skip(length - 2)
        if (marker === JPEG_SOS) entropy = true
    }
    throw new CharXArchiveError('CHARX_LIMIT_EXCEEDED', 'CharX JPEG prefix exceeds the 50 MiB limit')
}

async function asArchiveBlob(source: CharXSource): Promise<Blob> {
    let blob: Blob
    if (source.kind === 'file') {
        if (typeof File === 'undefined' || !(source.value instanceof File)) {
            throw new CharXArchiveError('CHARX_UNSUPPORTED_ARCHIVE', 'CharX file source is invalid')
        }
        blob = source.value
    } else {
        if (!(source.value instanceof Uint8Array)) {
            throw new CharXArchiveError('CHARX_UNSUPPORTED_ARCHIVE', 'CharX byte source is invalid')
        }
        blob = new Blob([source.value as unknown as BlobPart])
    }

    if (source.container === 'jpeg') {
        const offset = await jpegArchiveOffset(blob)
        const signature = new Uint8Array(await blob.slice(offset, offset + 4).arrayBuffer())
        if (signature.byteLength !== 4 || !signature.every((value, index) => value === ZIP_LOCAL_SIGNATURE[index])) {
            throw new CharXArchiveError('CHARX_UNSUPPORTED_ARCHIVE', 'CharX JPEG prefix is not followed by a ZIP archive')
        }
        return blob.slice(offset)
    }
    return blob
}

function safeEntryName(name: string, directory: boolean): boolean {
    if (!name || name.includes('\0') || name.includes('\\')) return false
    if (name.startsWith('/') || /^[A-Za-z]:/.test(name) || name.startsWith('//')) return false
    const path = directory && name.endsWith('/') ? name.slice(0, -1) : name
    if (!path || (!directory && name.endsWith('/'))) return false
    return path.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..')
}

function exactSafeNumber(value: number): boolean {
    return Number.isSafeInteger(value) && value >= 0
}

function normalizeArchiveError(error: unknown): CharXArchiveError {
    if (error instanceof CharXArchiveError) return error
    const message = error instanceof Error ? error.message : String(error)
    if (/abort/i.test(message)) return new CharXArchiveError('CHARX_ABORTED', message, { cause: error })
    if (message === 'Invalid signature') {
        return new CharXArchiveError('CHARX_CRC_MISMATCH', message, { cause: error })
    }
    if (/ambiguous|overlap|unsafe filename|duplicate/i.test(message)) {
        return new CharXArchiveError('CHARX_AMBIGUOUS_ENTRY', message, { cause: error })
    }
    if (/encrypt|split zip|unsupported compression|reserved compression/i.test(message)) {
        return new CharXArchiveError('CHARX_UNSUPPORTED_ARCHIVE', message, { cause: error })
    }
    if (/out of bounds|uncompressed size/i.test(message)) {
        return new CharXArchiveError('CHARX_INVALID_DIRECTORY', message, { cause: error })
    }
    return new CharXArchiveError('CHARX_READER_FAILURE', message, { cause: error })
}

function assertPlannedEntry(entry: FileEntry): void {
    if (
        !exactSafeNumber(entry.offset)
        || !exactSafeNumber(entry.compressedSize)
        || !exactSafeNumber(entry.uncompressedSize)
        || entry.diskNumberStart !== 0
    ) {
        throw new CharXArchiveError('CHARX_INVALID_DIRECTORY', 'CharX entry has an invalid range or disk number')
    }
    if (entry.encrypted || entry.symlink || ![0, 8].includes(entry.compressionMethod)) {
        throw new CharXArchiveError('CHARX_UNSUPPORTED_ARCHIVE', 'CharX entry uses an unsupported ZIP feature')
    }
}

function planEntry(entry: FileEntry): PlannedFileEntry {
    if (entry.uncompressedSize > CHARX_LIMITS.entryBytes) {
        throw new CharXArchiveError('CHARX_LIMIT_EXCEEDED', 'CharX entry exceeds the 50 MiB limit')
    }
    return Object.freeze({
        name: entry.filename,
        uncompressedSize: entry.uncompressedSize,
        entry,
    })
}

async function extractPlannedEntry(entry: PlannedFileEntry, signal?: AbortSignal): Promise<Uint8Array> {
    if (signal?.aborted) throw new CharXArchiveError('CHARX_ABORTED', 'CharX import aborted')
    try {
        const data = await entry.entry.getData(new Uint8ArrayWriter(), {
            useWebWorkers: false,
            checkLocalDirectory: true,
            checkCrc32: true,
            checkOverlappingEntry: true,
            signal,
            onprogress(current) {
                if (current > CHARX_LIMITS.entryBytes) {
                    throw new CharXArchiveError('CHARX_LIMIT_EXCEEDED', 'CharX entry exceeded the 50 MiB limit')
                }
            },
        })
        if (data.byteLength !== entry.uncompressedSize || data.byteLength > CHARX_LIMITS.retainedBytes) {
            throw new CharXArchiveError('CHARX_LIMIT_EXCEEDED', 'CharX entry size does not match its directory record')
        }
        return data
    } catch (error) {
        throw normalizeArchiveError(error)
    }
}

export async function openCharXArchive(source: CharXSource, signal?: AbortSignal): Promise<CharXArchivePlan> {
    if (signal?.aborted) throw new CharXArchiveError('CHARX_ABORTED', 'CharX import aborted')
    const blob = await asArchiveBlob(source)
    const reader = new ZipReader(new SliceBlobReader(blob), {
        useWebWorkers: false,
        strictness: 'strict',
        filenameValidation: 'strict',
        maxAppendedDataSize: 0,
        checkLocalDirectory: true,
        checkCrc32: true,
        checkOverlappingEntry: true,
        signal,
    })
    try {
        const entries = await reader.getEntries()
        if (entries.length === 0 || entries.length > CHARX_LIMITS.entryCount) {
            throw new CharXArchiveError('CHARX_LIMIT_EXCEEDED', 'CharX archive entry count is outside policy')
        }

        const inventory = new Map<string, FileEntry>()
        let metadataBytes = reader.comment.byteLength
        for (const entry of entries) {
            metadataBytes += entry.rawFilename.byteLength + entry.rawExtraField.byteLength + entry.rawComment.byteLength
            if (metadataBytes > CHARX_LIMITS.metadataBytes / 2) {
                throw new CharXArchiveError('CHARX_LIMIT_EXCEEDED', 'CharX central metadata exceeds the archive limit')
            }
            if (!safeEntryName(entry.filename, entry.directory) || inventory.has(entry.filename)) {
                throw new CharXArchiveError('CHARX_AMBIGUOUS_ENTRY', 'CharX entry name is invalid or duplicated')
            }
            if (!entry.directory) {
                const fileEntry = entry as FileEntry
                assertPlannedEntry(fileEntry)
                inventory.set(entry.filename, fileEntry)
            }
        }

        for (const entry of inventory.values()) {
            await entry.getData(new Uint8ArrayWriter(), {
                useWebWorkers: false,
                checkLocalDirectory: true,
                checkOverlappingEntryOnly: true,
                signal,
            })
            const local = entry.localDirectory
            metadataBytes += (local?.rawFilename?.byteLength ?? 0) + (local?.rawExtraField.byteLength ?? 0)
            if (metadataBytes > CHARX_LIMITS.metadataBytes) {
                throw new CharXArchiveError('CHARX_LIMIT_EXCEEDED', 'CharX aggregate metadata exceeds the archive limit')
            }
        }

        const cardFile = inventory.get('card.json')
        if (!cardFile) throw new CharXArchiveError('CHARX_MISSING_CARD', 'CharX card.json is missing')
        const cardEntry = planEntry(cardFile)
        const cardBytes = await extractPlannedEntry(cardEntry, signal)
        let card: CharacterCardV3
        try {
            const cardText = new TextDecoder('utf-8', { fatal: true }).decode(cardBytes)
            card = JSON.parse(cardText)
        } catch (error) {
            throw new CharXArchiveError('CHARX_INVALID_CARD', 'CharX card.json is invalid', { cause: error })
        }
        if (card?.spec !== 'chara_card_v3' || !card.data || typeof card.data !== 'object') {
            throw new CharXArchiveError('CHARX_INVALID_CARD', 'CharX card.json is not a supported CCv3 card')
        }
        if (card.data.assets !== undefined && !Array.isArray(card.data.assets)) {
            throw new CharXArchiveError('CHARX_INVALID_CARD', 'CharX card asset list is invalid')
        }

        const referenced = new Set<string>()
        for (const asset of card.data.assets ?? []) {
            if (typeof asset?.uri !== 'string' || !asset.uri.startsWith('embeded://')) continue
            const name = asset.uri.slice('embeded://'.length)
            const entry = inventory.get(name)
            if (!safeEntryName(name, false) || !entry) {
                throw new CharXArchiveError('CHARX_MISSING_ASSET', 'A CharX embedded asset is missing')
            }
            referenced.add(name)
        }

        const selectedNames = new Set(referenced)
        for (const entry of inventory.values()) {
            if (
                entry.filename !== 'card.json'
                && entry.filename !== 'module.risum'
                && !entry.filename.endsWith('.json')
            ) {
                selectedNames.add(entry.filename)
            }
        }
        const assets = [...selectedNames].map(name => planEntry(inventory.get(name)!))
        const module = inventory.has('module.risum') ? planEntry(inventory.get('module.risum')!) : undefined
        const selectedUncompressedBytes = cardEntry.uncompressedSize
            + (module?.uncompressedSize ?? 0)
            + assets.reduce((sum, entry) => sum + entry.uncompressedSize, 0)
        if (!exactSafeNumber(selectedUncompressedBytes) || selectedUncompressedBytes > CHARX_LIMITS.selectedBytes) {
            throw new CharXArchiveError('CHARX_LIMIT_EXCEEDED', 'CharX selected payload exceeds the archive limit')
        }

        let closed = false
        const byName = new Map<string, PlannedFileEntry>(assets.map(entry => [entry.name, entry]))
        if (module) byName.set(module.name, module)
        return Object.freeze({
            card,
            assets: Object.freeze(assets.map(({ name, uncompressedSize }) => Object.freeze({ name, uncompressedSize }))),
            module: module ? Object.freeze({ name: module.name, uncompressedSize: module.uncompressedSize }) : undefined,
            archiveEntryCount: entries.length,
            referencedAssetCount: referenced.size,
            selectedUncompressedBytes,
            async extract(entry: CharXEntryPlan, extractSignal?: AbortSignal) {
                if (closed) throw new CharXArchiveError('CHARX_READER_FAILURE', 'CharX archive is already closed')
                const planned = byName.get(entry.name)
                if (!planned || planned.uncompressedSize !== entry.uncompressedSize) {
                    throw new CharXArchiveError('CHARX_INVALID_DIRECTORY', 'CharX extraction request is not in the plan')
                }
                return extractPlannedEntry(planned, extractSignal)
            },
            async close() {
                if (closed) return
                closed = true
                await reader.close()
            },
        })
    } catch (error) {
        await reader.close().catch(() => {})
        throw normalizeArchiveError(error)
    }
}
