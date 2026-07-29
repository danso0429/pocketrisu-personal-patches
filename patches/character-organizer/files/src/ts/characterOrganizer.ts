import type { folder } from "./storage/database.svelte"

export type CharacterOrderEntry = string | folder

export type CharacterRootItem =
    | { kind: "character", id: string }
    | { kind: "folder", id: string }

export interface CharacterFolderDraft {
    id: string
    name: string
    color: string
}

export function isOrganizableCharacterId(id: string): boolean {
    return !!id && id !== "§temp" && id !== "§playground"
}

function cloneFolder(value: folder): folder {
    return {
        ...value,
        data: [...value.data],
    }
}

export function cloneCharacterOrder(
    order: CharacterOrderEntry[],
): CharacterOrderEntry[] {
    return order.map((entry) =>
        typeof entry === "string" ? entry : cloneFolder(entry)
    )
}

export function orderedCharacterIds(order: CharacterOrderEntry[]): string[] {
    const seen = new Set<string>()
    const ids: string[] = []
    for (const entry of order) {
        const candidates = typeof entry === "string" ? [entry] : entry.data
        for (const id of candidates) {
            if (!id || seen.has(id)) continue
            seen.add(id)
            ids.push(id)
        }
    }
    return ids
}

export function includeMissingCharacterIds(
    order: CharacterOrderEntry[],
    characterIds: string[],
): CharacterOrderEntry[] {
    const output = cloneCharacterOrder(order)
    const seen = new Set(orderedCharacterIds(output))
    for (const id of characterIds) {
        if (!id || seen.has(id)) continue
        seen.add(id)
        output.push(id)
    }
    return output
}

export function normalizeCharacterOrder(
    order: CharacterOrderEntry[],
    characterIds: string[],
): CharacterOrderEntry[] {
    const validIds = new Set(characterIds.filter(isOrganizableCharacterId))
    const seenCharacters = new Set<string>()
    const seenFolders = new Set<string>()
    const output: CharacterOrderEntry[] = []

    for (const entry of order) {
        if (typeof entry === "string") {
            if (!validIds.has(entry) || seenCharacters.has(entry)) continue
            seenCharacters.add(entry)
            output.push(entry)
            continue
        }
        if (
            !entry
            || !entry.id
            || seenFolders.has(entry.id)
            || !Array.isArray(entry.data)
        ) continue

        const data: string[] = []
        for (const id of entry.data) {
            if (!validIds.has(id) || seenCharacters.has(id)) continue
            seenCharacters.add(id)
            data.push(id)
        }
        if (data.length === 0) continue
        seenFolders.add(entry.id)
        output.push({ ...entry, data })
    }

    for (const id of characterIds) {
        if (
            !isOrganizableCharacterId(id)
            || seenCharacters.has(id)
        ) continue
        seenCharacters.add(id)
        output.push(id)
    }
    return output
}

export function findCharacterFolder(
    order: CharacterOrderEntry[],
    characterId: string,
): folder | null {
    for (const entry of order) {
        if (typeof entry !== "string" && entry.data.includes(characterId)) {
            return entry
        }
    }
    return null
}

function matchesRootItem(
    entry: CharacterOrderEntry,
    item: CharacterRootItem,
): boolean {
    return item.kind === "character"
        ? entry === item.id
        : typeof entry !== "string" && entry.id === item.id
}

export function moveCharacterRootItem(
    order: CharacterOrderEntry[],
    item: CharacterRootItem,
    offset: -1 | 1,
): CharacterOrderEntry[] {
    const output = cloneCharacterOrder(order)
    const from = output.findIndex((entry) => matchesRootItem(entry, item))
    const to = from + offset
    if (from < 0 || to < 0 || to >= output.length) return output
    output.splice(to, 0, ...output.splice(from, 1))
    return output
}

export function moveCharacterWithinFolder(
    order: CharacterOrderEntry[],
    folderId: string,
    characterId: string,
    offset: -1 | 1,
): CharacterOrderEntry[] {
    const output = cloneCharacterOrder(order)
    const target = output.find((entry): entry is folder =>
        typeof entry !== "string" && entry.id === folderId
    )
    if (!target) return output
    const from = target.data.indexOf(characterId)
    const to = from + offset
    if (from < 0 || to < 0 || to >= target.data.length) return output
    target.data.splice(to, 0, ...target.data.splice(from, 1))
    return output
}

function removeCharacterReferences(
    order: CharacterOrderEntry[],
    characterId: string,
): CharacterOrderEntry[] {
    const output: CharacterOrderEntry[] = []
    for (const entry of order) {
        if (typeof entry === "string") {
            if (entry !== characterId) output.push(entry)
            continue
        }
        const data = entry.data.filter((id) => id !== characterId)
        if (data.length > 0 || !entry.data.includes(characterId)) {
            output.push({ ...entry, data })
        }
    }
    return output
}

export function moveCharacterToFolder(
    order: CharacterOrderEntry[],
    characterId: string,
    folderId: string,
): CharacterOrderEntry[] {
    const target = order.find((entry): entry is folder =>
        typeof entry !== "string" && entry.id === folderId
    )
    if (!target || target.data.includes(characterId)) {
        return cloneCharacterOrder(order)
    }

    const output = removeCharacterReferences(order, characterId)
    const destination = output.find((entry): entry is folder =>
        typeof entry !== "string" && entry.id === folderId
    )
    if (!destination) return cloneCharacterOrder(order)
    destination.data.push(characterId)
    return output
}

export function moveCharacterToRoot(
    order: CharacterOrderEntry[],
    characterId: string,
): CharacterOrderEntry[] {
    const sourceIndex = order.findIndex((entry) =>
        typeof entry !== "string" && entry.data.includes(characterId)
    )
    if (sourceIndex < 0) return cloneCharacterOrder(order)

    const output: CharacterOrderEntry[] = []
    for (let index = 0; index < order.length; index += 1) {
        const entry = order[index]
        if (typeof entry === "string") {
            if (entry !== characterId) output.push(entry)
            continue
        }

        const data = entry.data.filter((id) => id !== characterId)
        if (data.length > 0 || !entry.data.includes(characterId)) {
            output.push({ ...entry, data })
        }
        if (index === sourceIndex) output.push(characterId)
    }
    return output
}

export function commitCharacterFolderDraft(
    order: CharacterOrderEntry[],
    draft: CharacterFolderDraft,
    firstCharacterId: string,
): CharacterOrderEntry[] | null {
    const name = draft.name.trim()
    if (!draft.id || !name || !firstCharacterId) return null
    if (order.some((entry) =>
        typeof entry !== "string" && entry.id === draft.id
    )) return null

    return [
        ...removeCharacterReferences(order, firstCharacterId),
        {
            id: draft.id,
            name,
            color: draft.color,
            data: [firstCharacterId],
        },
    ]
}

export function renameCharacterFolder(
    order: CharacterOrderEntry[],
    folderId: string,
    name: string,
): CharacterOrderEntry[] {
    const trimmed = name.trim()
    const output = cloneCharacterOrder(order)
    if (!trimmed) return output
    const target = output.find((entry): entry is folder =>
        typeof entry !== "string" && entry.id === folderId
    )
    if (target) target.name = trimmed
    return output
}

export function removeCharacterFolder(
    order: CharacterOrderEntry[],
    folderId: string,
): CharacterOrderEntry[] {
    const output: CharacterOrderEntry[] = []
    for (const entry of order) {
        if (typeof entry !== "string" && entry.id === folderId) {
            output.push(...entry.data)
        } else {
            output.push(typeof entry === "string" ? entry : cloneFolder(entry))
        }
    }
    return output
}
