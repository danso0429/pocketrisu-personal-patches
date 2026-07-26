import { describe, expect, it } from "vitest"
import type { RisuPersona, RisuPersonaFolder } from "./storage/database.svelte"
import {
    buildPersonaGroups,
    flattenPersonaGroups,
    reorderPersonaList,
    unfilePersonaFolder,
} from "./personaOrganizer"

function persona(id: string, folderId?: string): RisuPersona {
    return { id, folderId, name: id, icon: "", personaPrompt: "" }
}

const folders: RisuPersonaFolder[] = [
    { id: "f1", name: "One" },
    { id: "f2", name: "Two" },
]

describe("persona organizer", () => {
    it("groups invalid folder references as unfiled without dropping personas", () => {
        const input = [persona("a"), persona("b", "missing"), persona("c", "f1")]
        const groups = buildPersonaGroups(input, folders)
        expect(groups.map((group) => group.personas.map((item) => item.id))).toEqual([
            ["a", "b"],
            ["c"],
            [],
        ])
        expect(flattenPersonaGroups(groups)).toHaveLength(input.length)
    })

    it("reorders within one folder", () => {
        const input = [persona("a", "f1"), persona("b", "f1"), persona("c", "f1")]
        const output = reorderPersonaList(input, folders, "c", "f1", "a")
        expect(output.map((item) => item.id)).toEqual(["c", "a", "b"])
    })

    it("moves a persona between folders and preserves every object", () => {
        const input = [persona("a"), persona("b", "f1"), persona("c", "f2")]
        const output = reorderPersonaList(input, folders, "a", "f2", "c")
        expect(output.map((item) => item.id)).toEqual(["b", "a", "c"])
        expect(output.find((item) => item.id === "a")?.folderId).toBe("f2")
        expect(new Set(output)).toEqual(new Set(input))
    })

    it("removing a folder only unfiles its personas", () => {
        const input = [persona("a", "f1"), persona("b", "f1"), persona("c")]
        expect(unfilePersonaFolder(input, "f1")).toBe(input)
        expect(input.map((item) => item.id)).toEqual(["a", "b", "c"])
        expect(input.every((item) => item.folderId === undefined)).toBe(true)
    })
})
