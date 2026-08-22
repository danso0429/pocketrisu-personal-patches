import { decodeRPack } from '../rpack/rpack_js'
import type { RisuModule } from './modules'

export const RISUM_LIMITS = Object.freeze({
    mainRecordBytes: 50 * 1024 * 1024,
    assetRecordBytes: 50 * 1024 * 1024,
    totalEncodedAssetBytes: 1024 * 1024 * 1024,
    assetRecords: 10_000,
})

export type RisuModuleImportErrorCode =
    | 'RISUM_INVALID_FORMAT'
    | 'RISUM_UNSUPPORTED_VERSION'
    | 'RISUM_INVALID_MODULE'
    | 'RISUM_ASSET_METADATA'
    | 'RISUM_LIMIT_EXCEEDED'
    | 'RISUM_ASSET_DECODE_FAILED'
    | 'RISUM_ASSET_SAVE_FAILED'

export class RisuModuleImportError extends Error {
    constructor(public readonly code: RisuModuleImportErrorCode, message: string, options?: ErrorOptions) {
        super(message, options)
        this.name = 'RisuModuleImportError'
    }
}

export interface PreparedRisuModule {
    module: RisuModule
    encodedAssets: readonly Uint8Array[]
}

class Cursor {
    private offset = 0

    constructor(private readonly bytes: Uint8Array) {}

    get remaining(): number {
        return this.bytes.byteLength - this.offset
    }

    byte(): number {
        if (this.remaining < 1) throw new RisuModuleImportError('RISUM_INVALID_FORMAT', 'Unexpected end of RisuM data')
        return this.bytes[this.offset++]
    }

    uint32(): number {
        if (this.remaining < 4) throw new RisuModuleImportError('RISUM_INVALID_FORMAT', 'Truncated RisuM length')
        const value = new DataView(
            this.bytes.buffer,
            this.bytes.byteOffset + this.offset,
            4,
        ).getUint32(0, true)
        this.offset += 4
        return value
    }

    data(length: number): Uint8Array {
        if (!Number.isSafeInteger(length) || length < 0 || length > this.remaining) {
            throw new RisuModuleImportError('RISUM_INVALID_FORMAT', 'RisuM record exceeds the remaining input')
        }
        const output = this.bytes.subarray(this.offset, this.offset + length)
        this.offset += length
        return output
    }
}

export function validateRisuModule(value: unknown): asserts value is RisuModule {
    if (!value || typeof value !== 'object') {
        throw new RisuModuleImportError('RISUM_INVALID_MODULE', 'RisuM main record has no module object')
    }
    const module = value as Partial<RisuModule>
    if (typeof module.name !== 'string' || module.name.trim().length === 0) {
        throw new RisuModuleImportError('RISUM_INVALID_MODULE', 'RisuM module has no display name')
    }
    if (module.description !== undefined && typeof module.description !== 'string') {
        throw new RisuModuleImportError('RISUM_INVALID_MODULE', 'RisuM module description is invalid')
    }
    if (module.assets !== undefined && !Array.isArray(module.assets)) {
        throw new RisuModuleImportError('RISUM_ASSET_METADATA', 'RisuM asset metadata is invalid')
    }
    for (const asset of module.assets ?? []) {
        if (
            !Array.isArray(asset)
            || asset.length < 3
            || typeof asset[0] !== 'string'
            || typeof asset[1] !== 'string'
            || typeof asset[2] !== 'string'
        ) {
            throw new RisuModuleImportError('RISUM_ASSET_METADATA', 'RisuM asset tuple is invalid')
        }
    }
}

export async function decodeRisuModuleMain(mainEncoded: Uint8Array): Promise<RisuModule> {
    let envelope: unknown
    try {
        const decoded = await decodeRPack(mainEncoded)
        if (decoded.byteLength > RISUM_LIMITS.mainRecordBytes) {
            throw new RisuModuleImportError('RISUM_LIMIT_EXCEEDED', 'Decoded RisuM main record exceeds the limit')
        }
        envelope = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decoded))
    } catch (error) {
        if (error instanceof RisuModuleImportError) throw error
        throw new RisuModuleImportError('RISUM_INVALID_MODULE', 'RisuM main record could not be decoded', { cause: error })
    }
    if (
        !envelope
        || typeof envelope !== 'object'
        || (envelope as { type?: unknown }).type !== 'risuModule'
    ) {
        throw new RisuModuleImportError('RISUM_INVALID_MODULE', 'RisuM envelope type is invalid')
    }
    const module = (envelope as { module?: unknown }).module
    validateRisuModule(module)
    return module
}

export async function decodeRisuModuleAsset(
    encoded: Uint8Array,
    index: number,
    total: number,
): Promise<Uint8Array> {
    let decoded: Uint8Array
    try {
        decoded = await decodeRPack(encoded)
    } catch (error) {
        throw new RisuModuleImportError(
            'RISUM_ASSET_DECODE_FAILED',
            `Failed to decode RisuM asset ${index + 1} of ${total}`,
            { cause: error },
        )
    }
    if (decoded.byteLength > RISUM_LIMITS.assetRecordBytes) {
        throw new RisuModuleImportError('RISUM_LIMIT_EXCEEDED', 'Decoded RisuM asset exceeds the limit')
    }
    return decoded
}

export function validateRisuModuleAssetCount(module: RisuModule, assetCount: number): void {
    if (assetCount !== (module.assets?.length ?? 0)) {
        throw new RisuModuleImportError('RISUM_ASSET_METADATA', 'RisuM asset count does not match its metadata')
    }
}

export async function prepareRisuModule(input: Uint8Array): Promise<PreparedRisuModule> {
    const cursor = new Cursor(input)
    if (cursor.byte() !== 111) {
        throw new RisuModuleImportError('RISUM_INVALID_FORMAT', 'Invalid RisuM magic number')
    }
    if (cursor.byte() !== 0) {
        throw new RisuModuleImportError('RISUM_UNSUPPORTED_VERSION', 'Unsupported RisuM version')
    }
    const mainLength = cursor.uint32()
    if (mainLength === 0 || mainLength > RISUM_LIMITS.mainRecordBytes) {
        throw new RisuModuleImportError('RISUM_LIMIT_EXCEEDED', 'RisuM main record exceeds the limit')
    }
    const mainEncoded = cursor.data(mainLength)
    const module = await decodeRisuModuleMain(mainEncoded)

    const encodedAssets: Uint8Array[] = []
    let totalEncodedAssetBytes = 0
    while (true) {
        const marker = cursor.byte()
        if (marker === 0) break
        if (marker !== 1) {
            throw new RisuModuleImportError('RISUM_INVALID_FORMAT', 'RisuM asset marker is invalid')
        }
        if (encodedAssets.length >= RISUM_LIMITS.assetRecords) {
            throw new RisuModuleImportError('RISUM_LIMIT_EXCEEDED', 'RisuM asset count exceeds the limit')
        }
        const length = cursor.uint32()
        if (length === 0 || length > RISUM_LIMITS.assetRecordBytes) {
            throw new RisuModuleImportError('RISUM_LIMIT_EXCEEDED', 'RisuM asset record exceeds the limit')
        }
        totalEncodedAssetBytes += length
        if (totalEncodedAssetBytes > RISUM_LIMITS.totalEncodedAssetBytes) {
            throw new RisuModuleImportError('RISUM_LIMIT_EXCEEDED', 'RisuM asset payload exceeds the archive limit')
        }
        encodedAssets.push(cursor.data(length))
    }
    if (cursor.remaining !== 0) {
        throw new RisuModuleImportError('RISUM_INVALID_FORMAT', 'RisuM has trailing data after its terminal marker')
    }
    validateRisuModuleAssetCount(module, encodedAssets.length)
    return {
        module,
        encodedAssets: Object.freeze(encodedAssets),
    }
}

export async function materializeRisuModule(
    prepared: PreparedRisuModule,
    options: {
        saveAsset(data: Uint8Array): Promise<string>
        onProgress?(completed: number, total: number): void
    },
): Promise<RisuModule> {
    const module: RisuModule = {
        ...prepared.module,
        description: prepared.module.description ?? '',
        assets: prepared.module.assets?.map((asset) => [...asset] as [string, string, string]),
    }
    const total = prepared.encodedAssets.length
    for (let index = 0; index < total; index += 1) {
        const decoded = await decodeRisuModuleAsset(prepared.encodedAssets[index], index, total)
        try {
            module.assets![index][1] = await options.saveAsset(decoded)
        } catch (error) {
            throw new RisuModuleImportError(
                'RISUM_ASSET_SAVE_FAILED',
                `Failed to save RisuM asset ${index + 1} of ${total}`,
                { cause: error },
            )
        }
        options.onProgress?.(index + 1, total)
    }
    return module
}
