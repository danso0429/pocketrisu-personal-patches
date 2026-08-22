import { deflateSync } from 'fflate'

export interface FixtureEntry {
    name: string
    data: Uint8Array | string
    method?: 0 | 8
    descriptor?: boolean
    descriptorSignature?: boolean
    localName?: string
    centralName?: string
    localCrc32?: number
    centralCrc32?: number
    localCompressedSize?: number
    centralCompressedSize?: number
    localUncompressedSize?: number
    centralUncompressedSize?: number
    centralOffset?: number
}

export interface FixtureArchive {
    bytes: Uint8Array
    payloads: ReadonlyMap<string, Uint8Array>
    centralDirectoryOffset: number
}

const encoder = new TextEncoder()

export function fixtureBytes(value: Uint8Array | string): Uint8Array {
    return typeof value === 'string' ? encoder.encode(value) : value
}

export function fixtureCrc32(data: Uint8Array): number {
    let crc = 0xffffffff
    for (const value of data) {
        crc ^= value
        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
        }
    }
    return (crc ^ 0xffffffff) >>> 0
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
    const total = parts.reduce((sum, part) => sum + part.byteLength, 0)
    const output = new Uint8Array(total)
    let offset = 0
    for (const part of parts) {
        output.set(part, offset)
        offset += part.byteLength
    }
    return output
}

class RecordWriter {
    private readonly bytes: number[] = []

    u16(value: number): void {
        this.bytes.push(value & 0xff, (value >>> 8) & 0xff)
    }

    u32(value: number): void {
        this.bytes.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff)
    }

    data(value: Uint8Array): void {
        this.bytes.push(...value)
    }

    finish(): Uint8Array {
        return new Uint8Array(this.bytes)
    }
}

function localRecord(entry: FixtureEntry, compressed: Uint8Array, payload: Uint8Array): Uint8Array {
    const name = encoder.encode(entry.localName ?? entry.name)
    const descriptor = entry.descriptor ?? false
    const crc = fixtureCrc32(payload)
    const writer = new RecordWriter()
    writer.u32(0x04034b50)
    writer.u16(20)
    writer.u16(0x0800 | (descriptor ? 0x0008 : 0))
    writer.u16(entry.method ?? 0)
    writer.u16(0)
    writer.u16(0)
    writer.u32(descriptor ? 0 : (entry.localCrc32 ?? crc))
    writer.u32(descriptor ? 0 : (entry.localCompressedSize ?? compressed.byteLength))
    writer.u32(descriptor ? 0 : (entry.localUncompressedSize ?? payload.byteLength))
    writer.u16(name.byteLength)
    writer.u16(0)
    writer.data(name)
    writer.data(compressed)
    if (descriptor) {
        if (entry.descriptorSignature ?? true) writer.u32(0x08074b50)
        writer.u32(entry.localCrc32 ?? crc)
        writer.u32(entry.localCompressedSize ?? compressed.byteLength)
        writer.u32(entry.localUncompressedSize ?? payload.byteLength)
    }
    return writer.finish()
}

function centralRecord(
    entry: FixtureEntry,
    compressed: Uint8Array,
    payload: Uint8Array,
    localOffset: number,
): Uint8Array {
    const name = encoder.encode(entry.centralName ?? entry.name)
    const writer = new RecordWriter()
    writer.u32(0x02014b50)
    writer.u16(20)
    writer.u16(20)
    writer.u16(0x0800 | ((entry.descriptor ?? false) ? 0x0008 : 0))
    writer.u16(entry.method ?? 0)
    writer.u16(0)
    writer.u16(0)
    writer.u32(entry.centralCrc32 ?? fixtureCrc32(payload))
    writer.u32(entry.centralCompressedSize ?? compressed.byteLength)
    writer.u32(entry.centralUncompressedSize ?? payload.byteLength)
    writer.u16(name.byteLength)
    writer.u16(0)
    writer.u16(0)
    writer.u16(0)
    writer.u16(0)
    writer.u32(0)
    writer.u32(entry.centralOffset ?? localOffset)
    writer.data(name)
    return writer.finish()
}

export function buildFixtureArchive(
    entries: readonly FixtureEntry[],
    prefix: Uint8Array<ArrayBufferLike> = new Uint8Array(),
): FixtureArchive {
    const locals: Uint8Array[] = []
    const centrals: Uint8Array[] = []
    const payloads = new Map<string, Uint8Array>()
    let localOffset = 0
    for (const entry of entries) {
        const payload = fixtureBytes(entry.data)
        const compressed = (entry.method ?? 0) === 8 ? deflateSync(payload) : payload
        const local = localRecord(entry, compressed, payload)
        locals.push(local)
        centrals.push(centralRecord(entry, compressed, payload, localOffset))
        payloads.set(entry.centralName ?? entry.name, payload)
        localOffset += local.byteLength
    }
    const centralDirectory = concat(centrals)
    const eocd = new RecordWriter()
    eocd.u32(0x06054b50)
    eocd.u16(0)
    eocd.u16(0)
    eocd.u16(entries.length)
    eocd.u16(entries.length)
    eocd.u32(centralDirectory.byteLength)
    eocd.u32(localOffset)
    eocd.u16(0)
    return {
        bytes: concat([prefix, ...locals, centralDirectory, eocd.finish()]),
        payloads,
        centralDirectoryOffset: prefix.byteLength + localOffset,
    }
}

export function fixtureCard(assetNames: readonly string[] = []): string {
    return JSON.stringify({
        spec: 'chara_card_v3',
        spec_version: '3.0',
        data: {
            name: 'Fixture',
            description: '',
            personality: '',
            scenario: '',
            first_mes: '',
            mes_example: '',
            creator_notes: '',
            system_prompt: '',
            post_history_instructions: '',
            alternate_greetings: [],
            tags: [],
            creator: '',
            character_version: '1',
            extensions: {},
            group_only_greetings: [],
            assets: assetNames.map((name, index) => ({
                type: 'x-risu-asset',
                uri: `embeded://${name}`,
                name: `fixture-${index}`,
                ext: 'bin',
            })),
        },
    })
}

export function jpegPrefixWithFalseZipSignature(): Uint8Array {
    const payload = new Uint8Array([
        0x00, 0x01, 0x50, 0x4b, 0x03, 0x04,
        0x50, 0x4b, 0x07, 0x08, 0x02, 0x03,
    ])
    const length = payload.byteLength + 2
    return new Uint8Array([
        0xff, 0xd8,
        0xff, 0xe1, (length >>> 8) & 0xff, length & 0xff,
        ...payload,
        0xff, 0xd9,
    ])
}
