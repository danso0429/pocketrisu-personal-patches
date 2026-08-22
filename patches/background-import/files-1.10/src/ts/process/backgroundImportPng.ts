import type { SeekableImportSource } from './backgroundImportSource'

export interface PngImportLimits {
    readonly chunkCount: number
    readonly textChunkBytes: number
    readonly totalTextBytes: number
    readonly ioChunkBytes: number
}

export interface PngTextRecord {
    readonly key: string
    readonly value: Uint8Array
}

export interface PngSegment {
    readonly offset: number
    readonly length: number
}

export interface IndexedPngCharacter {
    readonly sourceSize: number
    readonly chunkCount: number
    readonly textCount: number
    readonly textBytes: number
    readonly imageSegments: readonly PngSegment[]
}

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

function pngError(code: string, message: string): Error & { code: string } {
    return Object.assign(new Error(message), { name: 'PngImportError', code })
}

function crc32Update(state: number, data: Uint8Array): number {
    let crc = state >>> 0
    for (const value of data) {
        crc ^= value
        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
        }
    }
    return crc >>> 0
}

async function readExact(
    source: SeekableImportSource,
    offset: number,
    length: number,
): Promise<Uint8Array> {
    if (
        !Number.isSafeInteger(offset)
        || !Number.isSafeInteger(length)
        || offset < 0
        || length < 0
        || offset + length > source.size
    ) {
        throw pngError('PNG_INVALID_CHUNK', 'PNG source range is invalid')
    }
    let value: Uint8Array
    try { value = await source.read(offset, length) }
    catch (error) { throw pngError('PNG_SOURCE_READ_FAILED', String((error as Error)?.message ?? error)) }
    if (!(value instanceof Uint8Array) || value.byteLength !== length) {
        throw pngError('PNG_SOURCE_READ_FAILED', 'PNG source read was incomplete')
    }
    return value
}

function uint32(data: Uint8Array): number {
    return new DataView(data.buffer, data.byteOffset, 4).getUint32(0)
}

function textRecord(payload: Uint8Array): PngTextRecord | null {
    const limit = Math.min(80, payload.byteLength)
    let separator = -1
    for (let index = 1; index < limit; index++) {
        if (payload[index] === 0) {
            separator = index
            break
        }
    }
    if (separator < 1) return null
    return Object.freeze({
        key: new TextDecoder().decode(payload.subarray(0, separator)),
        value: payload.subarray(separator + 1),
    })
}

function validateLimits(limits: PngImportLimits): void {
    for (const key of ['chunkCount', 'textChunkBytes', 'totalTextBytes', 'ioChunkBytes'] as const) {
        if (!Number.isSafeInteger(limits?.[key]) || limits[key] <= 0) {
            throw pngError('PNG_LIMIT_INVALID', `PNG ${key} limit is invalid`)
        }
    }
}

export async function indexPngCharacter(
    source: SeekableImportSource,
    options: {
        limits: PngImportLimits
        onText(record: PngTextRecord): Promise<void> | void
    },
): Promise<IndexedPngCharacter> {
    validateLimits(options.limits)
    if (!Number.isSafeInteger(source?.size) || source.size < PNG_SIGNATURE.byteLength + 12) {
        throw pngError('PNG_INVALID_SIGNATURE', 'PNG source is invalid')
    }
    const signature = await readExact(source, 0, PNG_SIGNATURE.byteLength)
    if (!signature.every((value, index) => value === PNG_SIGNATURE[index])) {
        throw pngError('PNG_INVALID_SIGNATURE', 'PNG signature is invalid')
    }
    const imageSegments: PngSegment[] = [Object.freeze({ offset: 0, length: 8 })]
    let offset = 8
    let chunkCount = 0
    let textCount = 0
    let textBytes = 0
    let terminal = false
    while (offset < source.size) {
        if (++chunkCount > options.limits.chunkCount) {
            throw pngError('PNG_LIMIT_EXCEEDED', 'PNG chunk count exceeds the limit')
        }
        const header = await readExact(source, offset, 8)
        const length = uint32(header.subarray(0, 4))
        const payloadOffset = offset + 8
        const crcOffset = payloadOffset + length
        const end = crcOffset + 4
        if (!Number.isSafeInteger(end) || end > source.size) {
            throw pngError('PNG_INVALID_CHUNK', 'PNG chunk length is invalid')
        }
        const type = header.subarray(4, 8)
        const typeName = new TextDecoder().decode(type)
        let crc = crc32Update(0xffffffff, type)
        let textPayload: Uint8Array | null = null
        if (typeName === 'tEXt') {
            if (length > options.limits.textChunkBytes) {
                throw pngError('PNG_LIMIT_EXCEEDED', 'PNG text chunk exceeds the limit')
            }
            textBytes += length
            if (textBytes > options.limits.totalTextBytes) {
                throw pngError('PNG_LIMIT_EXCEEDED', 'PNG text metadata exceeds the limit')
            }
            textPayload = new Uint8Array(length)
        }
        for (let readOffset = 0; readOffset < length; readOffset += options.limits.ioChunkBytes) {
            const value = await readExact(
                source,
                payloadOffset + readOffset,
                Math.min(options.limits.ioChunkBytes, length - readOffset),
            )
            crc = crc32Update(crc, value)
            if (textPayload) textPayload.set(value, readOffset)
        }
        const expectedCrc = uint32(await readExact(source, crcOffset, 4))
        const actualCrc = (crc ^ 0xffffffff) >>> 0
        if (expectedCrc !== actualCrc) {
            throw pngError('PNG_CRC_MISMATCH', 'PNG chunk CRC mismatch')
        }
        if (textPayload) {
            const record = textRecord(textPayload)
            if (record) {
                await options.onText(record)
                textCount += 1
            }
        } else {
            imageSegments.push(Object.freeze({ offset, length: end - offset }))
        }
        offset = end
        if (typeName === 'IEND') {
            terminal = true
            break
        }
    }
    if (!terminal || offset !== source.size) {
        throw pngError('PNG_INVALID_CHUNK', terminal ? 'PNG has trailing data' : 'PNG IEND is missing')
    }
    return Object.freeze({
        sourceSize: source.size,
        chunkCount,
        textCount,
        textBytes,
        imageSegments: Object.freeze(imageSegments),
    })
}

export async function writeIndexedPngImage(
    indexed: IndexedPngCharacter,
    source: SeekableImportSource,
    options: {
        ioChunkBytes: number
        write(data: Uint8Array): Promise<void> | void
    },
): Promise<void> {
    if (source.size !== indexed.sourceSize) throw pngError('PNG_SOURCE_CHANGED', 'PNG source size changed')
    if (!Number.isSafeInteger(options.ioChunkBytes) || options.ioChunkBytes <= 0) {
        throw pngError('PNG_LIMIT_INVALID', 'PNG copy chunk limit is invalid')
    }
    for (const segment of indexed.imageSegments) {
        for (let offset = 0; offset < segment.length; offset += options.ioChunkBytes) {
            await options.write(await readExact(
                source,
                segment.offset + offset,
                Math.min(options.ioChunkBytes, segment.length - offset),
            ))
        }
    }
}

export { PNG_SIGNATURE }
