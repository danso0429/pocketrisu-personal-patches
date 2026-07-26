import type { RisuPersona, RisuPersonaFolder } from "./storage/database.svelte"

export interface PersonaGroup {
    id: string | null
    name: string
    personas: RisuPersona[]
    folder: RisuPersonaFolder | null
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
