import { jsonValuesEqual } from './conflictRebase'

export interface BackgroundImportEntityCoordinate {
    kind: 'module' | 'character'
    entityId: string
    committedRevision: string
}

export class BackgroundImportReconcileError extends Error {
    readonly code: string

    constructor(code: string, message: string) {
        super(message)
        this.name = 'BackgroundImportReconcileError'
        this.code = code
    }
}

function collection(database: any, kind: BackgroundImportEntityCoordinate['kind']): any[] {
    const value = kind === 'module' ? database?.modules : database?.characters
    if (!Array.isArray(value)) {
        throw new BackgroundImportReconcileError(
            'IMPORT_RECONCILIATION_REQUIRED',
            `Canonical ${kind} collection is invalid`,
        )
    }
    return value
}

function idFor(kind: BackgroundImportEntityCoordinate['kind'], value: any): unknown {
    return kind === 'module' ? value?.id : value?.chaId
}

function matching(database: any, coordinate: BackgroundImportEntityCoordinate): any[] {
    return collection(database, coordinate.kind)
        .filter(value => idFor(coordinate.kind, value) === coordinate.entityId)
}

function orderedCharacterIds(value: unknown): Set<string> {
    const ids = new Set<string>()
    if (!Array.isArray(value)) return ids
    for (const entry of value) {
        if (typeof entry === 'string') ids.add(entry)
        else if (entry && Array.isArray(entry.data)) {
            for (const child of entry.data) if (typeof child === 'string') ids.add(child)
        }
    }
    return ids
}

export function preserveCommittedImport<T>(input: {
    base: any
    local: any
    latest: any
    merged: T
    coordinate: BackgroundImportEntityCoordinate
}): T {
    const { base, local, latest, merged, coordinate } = input
    if (
        !coordinate
        || !['module', 'character'].includes(coordinate.kind)
        || typeof coordinate.entityId !== 'string'
        || coordinate.entityId.length === 0
    ) {
        throw new BackgroundImportReconcileError(
            'IMPORT_RECONCILIATION_REQUIRED',
            'Import reconciliation coordinate is invalid',
        )
    }
    const canonical = matching(latest, coordinate)
    if (canonical.length !== 1) {
        throw new BackgroundImportReconcileError(
            'IMPORT_RECONCILIATION_REQUIRED',
            'Committed import is missing or duplicated in the canonical database',
        )
    }
    const baseMatches = matching(base, coordinate)
    const localMatches = matching(local, coordinate)
    if (baseMatches.length > 1 || localMatches.length > 1) {
        throw new BackgroundImportReconcileError(
            'IMPORT_RECONCILIATION_REQUIRED',
            'Import entity ID is duplicated in the local lineage',
        )
    }
    if (
        baseMatches.length === 0
        && localMatches.length === 1
        && !jsonValuesEqual(localMatches[0], canonical[0])
    ) {
        throw new BackgroundImportReconcileError(
            'IMPORT_ENTITY_COLLISION',
            'A local entity already uses the committed import ID',
        )
    }

    const mergedMatches = matching(merged, coordinate)
    if (mergedMatches.length > 1) {
        throw new BackgroundImportReconcileError(
            'IMPORT_RECONCILIATION_REQUIRED',
            'Import entity ID is duplicated after merge',
        )
    }
    if (mergedMatches.length === 0) {
        collection(merged, coordinate.kind).push(structuredClone(canonical[0]))
    }
    if (coordinate.kind === 'character') {
        merged.characterOrder ??= []
        if (!Array.isArray(merged.characterOrder)) {
            throw new BackgroundImportReconcileError(
                'IMPORT_RECONCILIATION_REQUIRED',
                'Character order is invalid after merge',
            )
        }
        if (!orderedCharacterIds(merged.characterOrder).has(coordinate.entityId)) {
            merged.characterOrder.push(coordinate.entityId)
        }
    }
    return merged
}

export function requireCommittedImport(
    database: any,
    coordinate: BackgroundImportEntityCoordinate,
): any {
    const matches = matching(database, coordinate)
    if (matches.length !== 1) {
        throw new BackgroundImportReconcileError(
            'IMPORT_RECONCILIATION_REQUIRED',
            'Committed import is not uniquely visible',
        )
    }
    return matches[0]
}
