import type { RisuModule } from './modules'
import type { SeekableImportSource } from './backgroundImportSource'
import {
    RISUM_LIMITS,
    RisuModuleImportError,
    decodeRisuModuleAsset,
    decodeRisuModuleMain,
    validateRisuModuleAssetCount,
} from './risumImport'

export interface IndexedRisuModuleAsset {
    readonly offset: number
    readonly length: number
}

export interface IndexedRisuModule {
    readonly module: RisuModule
    readonly assets: readonly IndexedRisuModuleAsset[]
    readonly sourceSize: number
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
        throw new RisuModuleImportError('RISUM_INVALID_FORMAT', 'RisuM record exceeds the remaining input')
    }
    let value: Uint8Array
    try {
        value = await source.read(offset, length)
    } catch (error) {
        if (error instanceof RisuModuleImportError) throw error
        throw new RisuModuleImportError('RISUM_INVALID_FORMAT', 'RisuM source read failed', { cause: error })
    }
    if (!(value instanceof Uint8Array) || value.byteLength !== length) {
        throw new RisuModuleImportError('RISUM_INVALID_FORMAT', 'RisuM source read was incomplete')
    }
    return value
}

async function readByte(source: SeekableImportSource, offset: number): Promise<number> {
    return (await readExact(source, offset, 1))[0]
}

async function readUint32(source: SeekableImportSource, offset: number): Promise<number> {
    const value = await readExact(source, offset, 4)
    return new DataView(value.buffer, value.byteOffset, 4).getUint32(0, true)
}

export async function indexRisuModule(source: SeekableImportSource): Promise<IndexedRisuModule> {
    if (!Number.isSafeInteger(source?.size) || source.size < 7) {
        throw new RisuModuleImportError('RISUM_INVALID_FORMAT', 'RisuM source is invalid')
    }
    let offset = 0
    if (await readByte(source, offset++) !== 111) {
        throw new RisuModuleImportError('RISUM_INVALID_FORMAT', 'Invalid RisuM magic number')
    }
    if (await readByte(source, offset++) !== 0) {
        throw new RisuModuleImportError('RISUM_UNSUPPORTED_VERSION', 'Unsupported RisuM version')
    }
    const mainLength = await readUint32(source, offset)
    offset += 4
    if (mainLength === 0 || mainLength > RISUM_LIMITS.mainRecordBytes) {
        throw new RisuModuleImportError('RISUM_LIMIT_EXCEEDED', 'RisuM main record exceeds the limit')
    }
    const mainEncoded = await readExact(source, offset, mainLength)
    offset += mainLength
    const module = await decodeRisuModuleMain(mainEncoded)

    const assets: IndexedRisuModuleAsset[] = []
    let totalEncodedAssetBytes = 0
    while (true) {
        const marker = await readByte(source, offset++)
        if (marker === 0) break
        if (marker !== 1) {
            throw new RisuModuleImportError('RISUM_INVALID_FORMAT', 'RisuM asset marker is invalid')
        }
        if (assets.length >= RISUM_LIMITS.assetRecords) {
            throw new RisuModuleImportError('RISUM_LIMIT_EXCEEDED', 'RisuM asset count exceeds the limit')
        }
        const length = await readUint32(source, offset)
        offset += 4
        if (length === 0 || length > RISUM_LIMITS.assetRecordBytes) {
            throw new RisuModuleImportError('RISUM_LIMIT_EXCEEDED', 'RisuM asset record exceeds the limit')
        }
        totalEncodedAssetBytes += length
        if (totalEncodedAssetBytes > RISUM_LIMITS.totalEncodedAssetBytes) {
            throw new RisuModuleImportError('RISUM_LIMIT_EXCEEDED', 'RisuM asset payload exceeds the archive limit')
        }
        if (offset + length > source.size) {
            throw new RisuModuleImportError('RISUM_INVALID_FORMAT', 'RisuM record exceeds the remaining input')
        }
        assets.push(Object.freeze({ offset, length }))
        offset += length
    }
    if (offset !== source.size) {
        throw new RisuModuleImportError('RISUM_INVALID_FORMAT', 'RisuM has trailing data after its terminal marker')
    }
    validateRisuModuleAssetCount(module, assets.length)
    return Object.freeze({
        module,
        assets: Object.freeze(assets),
        sourceSize: source.size,
    })
}

export async function materializeIndexedRisuModule(
    indexed: IndexedRisuModule,
    source: SeekableImportSource,
    options: {
        saveAsset(data: Uint8Array): Promise<string>
        onProgress?(completed: number, total: number): void
    },
): Promise<RisuModule> {
    if (source.size !== indexed.sourceSize) {
        throw new RisuModuleImportError('RISUM_INVALID_FORMAT', 'RisuM source size changed')
    }
    const module: RisuModule = {
        ...indexed.module,
        description: indexed.module.description ?? '',
        assets: indexed.module.assets?.map((asset) => [...asset] as [string, string, string]),
    }
    const total = indexed.assets.length
    for (let index = 0; index < total; index += 1) {
        const plan = indexed.assets[index]
        const encoded = await readExact(source, plan.offset, plan.length)
        const decoded = await decodeRisuModuleAsset(encoded, index, total)
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
