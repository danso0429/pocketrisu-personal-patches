import { hasher } from '../parser/parser.svelte'
import { saveAsset } from '../globalApi.svelte'
import {
    CharXArchiveError,
    type CharXContainerHint,
    type CharXSource,
    openCharXArchive,
} from './charxArchive'
import type { CharacterCardV3 } from '@risuai/ccardlib'

export type CharXImportPhase = 'indexing' | 'validating' | 'planning' | 'saving' | 'settling' | 'terminal'

export interface CharXProgress {
    phase: CharXImportPhase
    completedAssets: number
    totalAssets: number
}

export interface CharXImportOptions {
    signal?: AbortSignal
    skipSaving?: boolean
    hashSignal?: string
    saveAsset?: (data: Uint8Array) => Promise<string>
    hashAsset?: (data: Uint8Array) => Promise<string>
    onProgress?: (progress: CharXProgress) => void
}

export interface CharXImportReceipt {
    card: CharacterCardV3
    moduleData?: Uint8Array
    assets: ReadonlyMap<string, string>
    archiveEntryCount: number
    referencedAssetCount: number
    selectedUncompressedBytes: number
}

function abortIfNeeded(signal?: AbortSignal): void {
    if (signal?.aborted) throw new CharXArchiveError('CHARX_ABORTED', 'CharX import aborted')
}

function report(options: CharXImportOptions, phase: CharXImportPhase, completedAssets: number, totalAssets: number): void {
    options.onProgress?.({ phase, completedAssets, totalAssets })
}

export async function importCharX(
    source: CharXSource,
    options: CharXImportOptions = {},
): Promise<CharXImportReceipt> {
    report(options, 'indexing', 0, 0)
    const archive = await openCharXArchive(source, options.signal)
    const totalAssets = archive.assets.length
    let operationError: unknown
    let receipt: CharXImportReceipt | undefined
    try {
        report(options, 'validating', 0, totalAssets)
        abortIfNeeded(options.signal)
        report(options, 'planning', 0, totalAssets)

        const assetSaver = options.saveAsset ?? saveAsset
        const assetHasher = options.hashAsset ?? hasher
        const assets = new Map<string, string>()
        let completed = 0
        for (const entry of archive.assets) {
            abortIfNeeded(options.signal)
            report(options, 'saving', completed, totalAssets)
            const data = await archive.extract(entry, options.signal)
            try {
                const id = options.skipSaving
                    ? `assets/${await assetHasher(data)}.png`
                    : await assetSaver(data)
                assets.set(entry.name, id)
            } catch (error) {
                throw new CharXArchiveError('CHARX_SAVE_FAILED', 'Failed to save a CharX asset', { cause: error })
            }
            completed += 1
            report(options, 'saving', completed, totalAssets)
        }

        abortIfNeeded(options.signal)
        const moduleData = archive.module
            ? await archive.extract(archive.module, options.signal)
            : undefined
        if (options.hashSignal && !options.skipSaving) {
            try {
                await assetSaver(new TextEncoder().encode(options.hashSignal))
            } catch (error) {
                throw new CharXArchiveError('CHARX_SAVE_FAILED', 'Failed to save the CharX hash signal', { cause: error })
            }
        }
        report(options, 'settling', completed, totalAssets)
        receipt = Object.freeze({
            card: archive.card,
            moduleData,
            assets,
            archiveEntryCount: archive.archiveEntryCount,
            referencedAssetCount: archive.referencedAssetCount,
            selectedUncompressedBytes: archive.selectedUncompressedBytes,
        })
    } catch (error) {
        operationError = error
    }

    try {
        await archive.close()
    } catch (error) {
        operationError ??= error
    }
    if (operationError) throw operationError
    report(options, 'terminal', receipt!.assets.size, totalAssets)
    return receipt!
}

export function charXSource(
    value: File | Uint8Array,
    container: CharXContainerHint,
): CharXSource {
    return {
        kind: typeof File !== 'undefined' && value instanceof File ? 'file' : 'bytes',
        value,
        container,
    }
}
