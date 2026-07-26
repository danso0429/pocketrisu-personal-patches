import type { RisuPersona } from "./storage/database.svelte"

function validImagePaths(paths: unknown): string[] {
    if (!Array.isArray(paths)) return []
    const unique = new Set<string>()
    for (const path of paths) {
        if (typeof path === "string" && path) unique.add(path)
    }
    return [...unique]
}

export function getPersonaImageGallery(persona: RisuPersona): string[] {
    const gallery = validImagePaths(persona.imageGallery)
    if (persona.icon && !gallery.includes(persona.icon)) gallery.unshift(persona.icon)
    return gallery
}

export function normalizePersonaImageGallery(persona: RisuPersona): string[] {
    const gallery = getPersonaImageGallery(persona)
    persona.imageGallery = gallery
    if (!persona.icon && gallery.length > 0) persona.icon = gallery[0]
    return gallery
}

export function addPersonaImages(persona: RisuPersona, paths: string[]): string[] {
    const gallery = normalizePersonaImageGallery(persona)
    for (const path of validImagePaths(paths)) {
        if (!gallery.includes(path)) gallery.push(path)
    }
    if (!persona.icon && gallery.length > 0) persona.icon = gallery[0]
    persona.imageGallery = gallery
    return gallery
}

export function selectPersonaImage(persona: RisuPersona, path: string): boolean {
    if (typeof path !== "string" || !path) return false
    const gallery = normalizePersonaImageGallery(persona)
    if (!gallery.includes(path)) gallery.push(path)
    persona.imageGallery = gallery
    persona.icon = path
    return true
}

export function removePersonaImage(persona: RisuPersona, path: string): string[] {
    const previous = normalizePersonaImageGallery(persona)
    const removedIndex = previous.indexOf(path)
    if (removedIndex < 0) return previous

    const gallery = previous.filter((entry) => entry !== path)
    persona.imageGallery = gallery
    if (persona.icon === path) {
        persona.icon = gallery[Math.min(removedIndex, gallery.length - 1)] ?? ""
    }
    return gallery
}
