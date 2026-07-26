import type { RisuPersona, RisuPersonaFolder } from "./storage/database.svelte"

export interface PersonaGroup {
    id: string | null
    name: string
    personas: RisuPersona[]
    folder: RisuPersonaFolder | null
}

export interface PersonaDeletionFolder {
    folder: RisuPersonaFolder
    personas: RisuPersona[]
}

export interface PersonaDeletionPlan {
    folders: PersonaDeletionFolder[]
    loosePersonas: RisuPersona[]
    personaIds: string[]
    folderIds: string[]
    remainingCount: number
}

export function buildPersonaGroups(
    personas: RisuPersona[],
    folders: RisuPersonaFolder[],
): PersonaGroup[] {
    const validFolders = new Set(folders.map((folder) => folder.id))
    return [
        {
            id: null,
            name: "Unfiled",
            folder: null,
            personas: personas.filter((persona) =>
                !persona.folderId || !validFolders.has(persona.folderId)
            ),
        },
        ...folders.map((folder) => ({
            id: folder.id,
            name: folder.name,
            folder,
            personas: personas.filter((persona) => persona.folderId === folder.id),
        })),
    ]
}

export function flattenPersonaGroups(groups: PersonaGroup[]): RisuPersona[] {
    return groups.flatMap((group) => group.personas)
}

export function reorderPersonaList(
    personas: RisuPersona[],
    folders: RisuPersonaFolder[],
    sourceId: string,
    folderId: string | null,
    beforeId: string | null,
): RisuPersona[] {
    const source = personas.find((persona) => persona.id === sourceId)
    if (!source) return personas
    const groups = buildPersonaGroups(personas, folders).map((group) => ({
        ...group,
        personas: group.personas.filter((persona) => persona.id !== sourceId),
    }))
    const destination = groups.find((group) => group.id === folderId) ?? groups[0]
    if (!destination) return personas

    source.folderId = destination.id ?? undefined
    const targetIndex = beforeId
        ? destination.personas.findIndex((persona) => persona.id === beforeId)
        : -1
    if (targetIndex >= 0) destination.personas.splice(targetIndex, 0, source)
    else destination.personas.push(source)
    return flattenPersonaGroups(groups)
}

export function unfilePersonaFolder(
    personas: RisuPersona[],
    folderId: string,
): RisuPersona[] {
    for (const persona of personas) {
        if (persona.folderId === folderId) persona.folderId = undefined
    }
    return personas
}

export function movePersonaWithinGroup(
    personas: RisuPersona[],
    folders: RisuPersonaFolder[],
    sourceId: string,
    folderId: string | null,
    offset: -1 | 1,
): RisuPersona[] {
    const groups = buildPersonaGroups(personas, folders)
    const group = groups.find((item) => item.id === folderId) ?? groups[0]
    if (!group) return personas
    const from = group.personas.findIndex((persona) => persona.id === sourceId)
    const to = from + offset
    if (from < 0 || to < 0 || to >= group.personas.length) return personas
    const reordered = [...group.personas]
    reordered.splice(to, 0, ...reordered.splice(from, 1))
    group.personas = reordered
    return flattenPersonaGroups(groups)
}

export function buildPersonaDeletionPlan(
    personas: RisuPersona[],
    folders: RisuPersonaFolder[],
    selectedPersonaIds: string[],
    selectedFolderIds: string[],
): PersonaDeletionPlan {
    const personaById = new Map(
        personas
            .filter((persona): persona is RisuPersona & { id: string } => !!persona.id)
            .map((persona) => [persona.id, persona]),
    )
    const selectedFolders = new Set(selectedFolderIds)
    const folderEntries = folders
        .filter((folder) => selectedFolders.has(folder.id))
        .map((folder) => ({
            folder,
            personas: personas.filter((persona) => persona.folderId === folder.id),
        }))
    const folderPersonaIds = new Set(
        folderEntries.flatMap((entry) =>
            entry.personas
                .map((persona) => persona.id)
                .filter((id): id is string => !!id)
        ),
    )
    const loosePersonas = selectedPersonaIds
        .filter((id) => !folderPersonaIds.has(id))
        .flatMap((id) => {
            const persona = personaById.get(id)
            return persona ? [persona] : []
        })
    const personaIds = Array.from(new Set([
        ...folderPersonaIds,
        ...loosePersonas
            .map((persona) => persona.id)
            .filter((id): id is string => !!id),
    ]))

    return {
        folders: folderEntries,
        loosePersonas,
        personaIds,
        folderIds: folderEntries.map((entry) => entry.folder.id),
        remainingCount: personas.length - personaIds.length,
    }
}

export function applyPersonaDeletion(
    personas: RisuPersona[],
    folders: RisuPersonaFolder[],
    plan: PersonaDeletionPlan,
): { personas: RisuPersona[], folders: RisuPersonaFolder[] } {
    const hasSelection = plan.personaIds.length > 0 || plan.folderIds.length > 0
    if (!hasSelection || plan.remainingCount < 1) return { personas, folders }
    const personaIds = new Set(plan.personaIds)
    const folderIds = new Set(plan.folderIds)
    return {
        personas: personas.filter((persona) => !persona.id || !personaIds.has(persona.id)),
        folders: folders.filter((folder) => !folderIds.has(folder.id)),
    }
}
