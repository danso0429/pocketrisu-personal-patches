import { strToU8, zipSync } from 'fflate'

export type CardV3 = {
    spec: 'chara_card_v3'
    spec_version: '3.0'
    data: Record<string, any>
}

export function makeCard(overrides: Record<string, any> = {}): CardV3 {
    return {
        spec: 'chara_card_v3',
        spec_version: '3.0',
        data: {
            name: 'Blind Test Character',
            description: 'A synthetic test card',
            personality: '',
            scenario: '',
            first_mes: 'Hello',
            mes_example: '',
            creator_notes: '',
            system_prompt: '',
            post_history_instructions: '',
            alternate_greetings: [],
            tags: [],
            creator: 'test-suite',
            character_version: '1',
            // The repository test setup's safeStructuredClone stub does not
            // accept undefined, while production structuredClone does.
            extensions: { risuai: {} },
            ...overrides,
        },
    }
}

export function jsonCardBytes(card: CardV3 = makeCard()): Uint8Array {
    return new TextEncoder().encode(JSON.stringify(card))
}

export function charxCardBytes(card: CardV3 = makeCard(), extra: Record<string, Uint8Array> = {}): Uint8Array {
    return zipSync({
        'card.json': strToU8(JSON.stringify(card)),
        ...extra,
    })
}

function crc32(data: Uint8Array): number {
    let crc = 0xffffffff
    for (const byte of data) {
        crc ^= byte
        for (let bit = 0; bit < 8; bit++) {
            crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
        }
    }
    return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
    const typeBytes = new TextEncoder().encode(type)
    const out = new Uint8Array(12 + data.length)
    const view = new DataView(out.buffer)
    view.setUint32(0, data.length)
    out.set(typeBytes, 4)
    out.set(data, 8)
    view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
    return out
}

function textChunk(key: string, value: string): Uint8Array {
    const keyBytes = new TextEncoder().encode(key)
    const valueBytes = new TextEncoder().encode(value)
    const body = new Uint8Array(keyBytes.length + valueBytes.length + 1)
    body.set(keyBytes)
    body.set(valueBytes, keyBytes.length + 1)
    return pngChunk('tEXt', body)
}

export function pngCardBytes(card: CardV3 = makeCard(), assets: Uint8Array[] = []): Uint8Array {
    return pngWithCardText(Buffer.from(JSON.stringify(card)).toString('base64'), assets)
}

export function pngWithCardText(cardText: string, assets: Uint8Array[] = []): Uint8Array {
    const signature = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10)
    const ihdr = new Uint8Array(13)
    const view = new DataView(ihdr.buffer)
    view.setUint32(0, 1)
    view.setUint32(4, 1)
    ihdr[8] = 8
    ihdr[9] = 6
    const chunks = [
        pngChunk('IHDR', ihdr),
        textChunk('chara', cardText),
        ...assets.map((asset, index) => textChunk(`chara-ext-asset_${index}`, Buffer.from(asset).toString('base64'))),
        pngChunk('IEND', new Uint8Array()),
    ]
    const size = signature.length + chunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const out = new Uint8Array(size)
    let offset = 0
    for (const part of [signature, ...chunks]) {
        out.set(part, offset)
        offset += part.length
    }
    return out
}

export async function importOptional(path: string): Promise<Record<string, any> | undefined> {
    try {
        return await import(/* @vite-ignore */ path)
    } catch {
        return undefined
    }
}

export function deferred<T = void>() {
    let resolve!: (value: T | PromiseLike<T>) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((res, rej) => {
        resolve = res
        reject = rej
    })
    return { promise, resolve, reject }
}
