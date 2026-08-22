import { describe, expect, test } from 'vitest'
import {
    CHARX_LIMITS,
    CharXArchiveError,
    openCharXArchive,
    type CharXArchiveErrorCode,
} from './charxArchive'
import {
    buildFixtureArchive,
    fixtureBytes,
    fixtureCard,
    fixtureCrc32,
    jpegPrefixWithFalseZipSignature,
    type FixtureEntry,
} from './charxTestFixtures'

async function expectCode(operation: Promise<unknown>, code: CharXArchiveErrorCode): Promise<void> {
    await expect(operation).rejects.toMatchObject({ name: 'CharXArchiveError', code })
}

async function sha256(value: Uint8Array): Promise<string> {
    const copy = new Uint8Array(value.byteLength)
    copy.set(value)
    const digest = await crypto.subtle.digest('SHA-256', copy.buffer)
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function validEntries(extra: readonly FixtureEntry[] = []): FixtureEntry[] {
    return [
        { name: 'card.json', data: fixtureCard(extra.map(entry => entry.name)) },
        ...extra,
    ]
}

describe('independent CharX fixture oracle', () => {
    test('CRC32 matches the canonical known vector', () => {
        expect(fixtureCrc32(fixtureBytes('123456789'))).toBe(0xcbf43926)
    })

    test('manual STORE and DEFLATE descriptors preserve every payload SHA', async () => {
        const entries: FixtureEntry[] = [
            { name: 'assets/store.bin', data: 'store-payload-PK\x03\x04-PK\x07\x08', descriptor: true },
            {
                name: 'assets/deflate.bin',
                data: 'deflate-payload-PK\x03\x04-PK\x07\x08'.repeat(32),
                method: 8,
                descriptor: true,
                descriptorSignature: false,
            },
        ]
        const fixture = buildFixtureArchive(validEntries(entries))
        const archive = await openCharXArchive({ kind: 'bytes', value: fixture.bytes, container: 'zip' })
        try {
            expect(archive.assets.map(entry => entry.name)).toEqual(entries.map(entry => entry.name))
            for (const plan of archive.assets) {
                expect(await sha256(await archive.extract(plan))).toBe(await sha256(fixture.payloads.get(plan.name)!))
            }
        } finally {
            await archive.close()
        }
    })

    test('validated JPEG prefix ignores false ZIP signatures inside JPEG metadata', async () => {
        const fixture = buildFixtureArchive(
            validEntries([{ name: 'assets/a.bin', data: 'jpeg-prefixed' }]),
            jpegPrefixWithFalseZipSignature(),
        )
        const archive = await openCharXArchive({ kind: 'bytes', value: fixture.bytes, container: 'jpeg' })
        try {
            expect(new TextDecoder().decode(await archive.extract(archive.assets[0]))).toBe('jpeg-prefixed')
        } finally {
            await archive.close()
        }
    })

    test('File random access never calls whole-file arrayBuffer', async () => {
        class SliceOnlyFile extends File {
            override arrayBuffer(): Promise<ArrayBuffer> {
                throw new Error('whole-file arrayBuffer must not be called')
            }
        }
        const fixture = buildFixtureArchive(validEntries([{ name: 'assets/a.bin', data: 'slice-only' }]))
        const fileBytes = new Uint8Array(fixture.bytes.byteLength)
        fileBytes.set(fixture.bytes)
        const file = new SliceOnlyFile([fileBytes.buffer], 'fixture.charx')
        const archive = await openCharXArchive({ kind: 'file', value: file, container: 'zip' })
        try {
            expect(new TextDecoder().decode(await archive.extract(archive.assets[0]))).toBe('slice-only')
        } finally {
            await archive.close()
        }
    })

    test('seekable Blob random access never calls whole-blob arrayBuffer', async () => {
        class SliceOnlyBlob extends Blob {
            override arrayBuffer(): Promise<ArrayBuffer> {
                throw new Error('whole-blob arrayBuffer must not be called')
            }
        }
        const fixture = buildFixtureArchive(validEntries([{ name: 'assets/a.bin', data: 'blob-slice-only' }]))
        const blob = new SliceOnlyBlob([fixture.bytes])
        const archive = await openCharXArchive({ kind: 'blob', value: blob, container: 'zip' })
        try {
            expect(new TextDecoder().decode(await archive.extract(archive.assets[0]))).toBe('blob-slice-only')
        } finally {
            await archive.close()
        }
    })
})

describe('CharX structural, semantic, and resource policy', () => {
    test('CRC corruption is rejected with the stable CRC code', async () => {
        const fixture = buildFixtureArchive(validEntries([{
            name: 'assets/a.bin',
            data: 'crc-data',
            localCrc32: 0x12345678,
            centralCrc32: 0x12345678,
        }]))
        const archive = await openCharXArchive({ kind: 'bytes', value: fixture.bytes, container: 'zip' })
        try {
            await expectCode(archive.extract(archive.assets[0]), 'CHARX_CRC_MISMATCH')
        } finally {
            await archive.close()
        }
    })

    test.each([
        {
            name: 'duplicate exact name',
            entries: [
                { name: 'card.json', data: fixtureCard() },
                { name: 'card.json', data: fixtureCard() },
            ],
            code: 'CHARX_AMBIGUOUS_ENTRY' as const,
        },
        {
            name: 'local and central name mismatch',
            entries: validEntries([{ name: 'assets/a.bin', localName: 'assets/b.bin', data: 'x' }]),
            code: 'CHARX_AMBIGUOUS_ENTRY' as const,
        },
        {
            name: 'unsafe referenced path',
            entries: [
                { name: 'card.json', data: fixtureCard(['../escape.bin']) },
                { name: '../escape.bin', data: 'x' },
            ],
            code: 'CHARX_AMBIGUOUS_ENTRY' as const,
        },
        {
            name: 'missing embedded reference',
            entries: [{ name: 'card.json', data: fixtureCard(['assets/missing.bin']) }],
            code: 'CHARX_MISSING_ASSET' as const,
        },
        {
            name: 'unsupported method',
            entries: validEntries([{ name: 'assets/a.bin', data: 'x', method: 0 }]).map((entry, index) =>
                index === 1 ? { ...entry, method: 0 as const } : entry
            ),
            mutateMethod: true,
            code: 'CHARX_UNSUPPORTED_ARCHIVE' as const,
        },
    ])('$name fails before a receipt', async ({ entries, code, mutateMethod }) => {
        const fixture = buildFixtureArchive(entries)
        if (mutateMethod) {
            const bytes = fixture.bytes.slice()
            bytes[8] = 99
            bytes[fixture.centralDirectoryOffset + 10] = 99
            await expectCode(openCharXArchive({ kind: 'bytes', value: bytes, container: 'zip' }), code)
            return
        }
        await expectCode(openCharXArchive({ kind: 'bytes', value: fixture.bytes, container: 'zip' }), code)
    })

    test('overlapping central ranges are rejected before extraction', async () => {
        const card = fixtureCard(['assets/a.bin'])
        const overlappingSize = fixtureBytes(card).byteLength + 16
        const fixture = buildFixtureArchive([
            {
                name: 'card.json',
                data: card,
                localCompressedSize: overlappingSize,
                centralCompressedSize: overlappingSize,
                localUncompressedSize: overlappingSize,
                centralUncompressedSize: overlappingSize,
            },
            { name: 'assets/a.bin', data: 'a' },
        ])
        await expectCode(
            openCharXArchive({ kind: 'bytes', value: fixture.bytes, container: 'zip' }),
            'CHARX_AMBIGUOUS_ENTRY',
        )
    })

    test('declared per-entry and aggregate selected limits reject without expanding payloads', async () => {
        const tooLarge = buildFixtureArchive(validEntries([{
            name: 'assets/large.bin',
            data: 'x',
            localUncompressedSize: CHARX_LIMITS.entryBytes + 1,
            centralUncompressedSize: CHARX_LIMITS.entryBytes + 1,
        }]))
        await expectCode(
            openCharXArchive({ kind: 'bytes', value: tooLarge.bytes, container: 'zip' }),
            'CHARX_LIMIT_EXCEEDED',
        )

        const many = Array.from({ length: Math.floor(CHARX_LIMITS.selectedBytes / CHARX_LIMITS.entryBytes) + 1 }, (_, index) => ({
            name: `assets/${index}.bin`,
            data: 'x',
            localUncompressedSize: CHARX_LIMITS.entryBytes,
            centralUncompressedSize: CHARX_LIMITS.entryBytes,
        }))
        const aggregate = buildFixtureArchive(validEntries(many))
        await expectCode(
            openCharXArchive({ kind: 'bytes', value: aggregate.bytes, container: 'zip' }),
            'CHARX_LIMIT_EXCEEDED',
        )
    })

    test('raw streams and malformed JPEG prefixes are typed unsupported inputs', async () => {
        const fixture = buildFixtureArchive(validEntries())
        await expectCode(
            openCharXArchive({ kind: 'bytes', value: fixture.bytes, container: 'jpeg' }),
            'CHARX_UNSUPPORTED_ARCHIVE',
        )
        expect(new CharXArchiveError('CHARX_UNSUPPORTED_ARCHIVE', 'stream').code).toBe('CHARX_UNSUPPORTED_ARCHIVE')
    })
})
