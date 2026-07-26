import { describe, expect, it } from "vitest"
import type { RisuPersona, RisuPersonaFolder } from "./storage/database.svelte"
import {
    applyPersonaDeletion,
    buildPersonaDeletionPlan,
    buildPersonaGroups,
    flattenPersonaGroups,
    movePersonaWithinGroup,
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

    it("moves one persona left or right only inside its current group", () => {
        const input = [
            persona("a"),
            persona("b"),
            persona("c"),
            persona("x", "f1"),
            persona("y", "f1"),
        ]
        const movedRoot = movePersonaWithinGroup(input, folders, "b", null, -1)
        expect(movedRoot.map((item) => item.id)).toEqual(["b", "a", "c", "x", "y"])
        const movedFolder = movePersonaWithinGroup(movedRoot, folders, "x", "f1", 1)
        expect(movedFolder.map((item) => item.id)).toEqual(["b", "a", "c", "y", "x"])
    })

    it("does nothing at a group boundary", () => {
        const input = [persona("a"), persona("b"), persona("x", "f1")]
        expect(movePersonaWithinGroup(input, folders, "a", null, -1)).toBe(input)
        expect(movePersonaWithinGroup(input, folders, "x", "f1", 1)).toBe(input)
    })

    it("builds a deduplicated deletion preview grouped by selected folder", () => {
        const input = [
            persona("a"),
            persona("b", "f1"),
            persona("c", "f1"),
            persona("d", "f2"),
        ]
        const plan = buildPersonaDeletionPlan(input, folders, ["a", "b"], ["f1"])
        expect(plan.folders.map((entry) => [
            entry.folder.id,
            entry.personas.map((item) => item.id),
        ])).toEqual([["f1", ["b", "c"]]])
        expect(plan.loosePersonas.map((item) => item.id)).toEqual(["a"])
        expect(plan.personaIds).toEqual(["b", "c", "a"])
        expect(plan.folderIds).toEqual(["f1"])
        expect(plan.remainingCount).toBe(1)
    })

    it("deletes the confirmed selection while preserving every unrelated entry", () => {
        const input = [
            persona("a"),
            persona("b", "f1"),
            persona("c", "f1"),
            persona("d", "f2"),
        ]
        const plan = buildPersonaDeletionPlan(input, folders, ["a"], ["f1"])
        const output = applyPersonaDeletion(input, folders, plan)
        expect(output.personas.map((item) => item.id)).toEqual(["d"])
        expect(output.folders.map((item) => item.id)).toEqual(["f2"])
    })

    it("refuses an empty selection or deleting the final persona", () => {
        const input = [persona("a")]
        const empty = buildPersonaDeletionPlan(input, folders, [], [])
        expect(applyPersonaDeletion(input, folders, empty)).toEqual({
            personas: input,
            folders,
        })
        const final = buildPersonaDeletionPlan(input, folders, ["a"], [])
        expect(applyPersonaDeletion(input, folders, final)).toEqual({
            personas: input,
            folders,
        })
    })
})
