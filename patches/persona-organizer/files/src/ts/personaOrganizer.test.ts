import { describe, expect, it } from "vitest"
import type { RisuPersona, RisuPersonaFolder } from "./storage/database.svelte"
import {
    applyPersonaDeletion,
    buildPersonaDeletionPlan,
    buildPersonaGroups,
    filterPersonaPicker,
    flattenPersonaGroups,
    movePersonaWithinGroup,
    PERSONA_PICKER_SCOPE_ALL,
    PERSONA_PICKER_SCOPE_UNFILED,
    personaPickerFolderIdFromScope,
    personaPickerFolderScope,
    reorderPersonaList,
    resolvePersonaFolderId,
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
    it("searches picker names and notes case-insensitively while preserving original indices", () => {
        const input = [
            { ...persona("first"), name: "Alpha", note: "Quiet Scout" },
            { ...persona("second"), name: "Beta", note: "LOUD MAGE" },
            { ...persona("third"), name: "Gamma", note: "" },
        ]
        expect(filterPersonaPicker(input, folders, "  loud  ", PERSONA_PICKER_SCOPE_ALL))
            .toMatchObject([{ persona: { id: "second" }, index: 1 }])
        expect(filterPersonaPicker(input, folders, "ALP", PERSONA_PICKER_SCOPE_ALL))
            .toMatchObject([{ persona: { id: "first" }, index: 0 }])
        expect(filterPersonaPicker(input, folders, "   ", PERSONA_PICKER_SCOPE_ALL)
            .map((entry) => entry.index)).toEqual([0, 1, 2])
    })

    it("filters valid folders without renumbering canonical persona indices", () => {
        const input = [
            persona("unfiled"),
            persona("one-a", "f1"),
            persona("two", "f2"),
            persona("one-b", "f1"),
        ]
        expect(filterPersonaPicker(input, folders, "", personaPickerFolderScope("f1"))
            .map((entry) => [entry.persona.id, entry.index])).toEqual([
                ["one-a", 1],
                ["one-b", 3],
            ])
        expect(filterPersonaPicker(input, folders, "", personaPickerFolderScope("f2"))
            .map((entry) => entry.index)).toEqual([2])
    })

    it("treats absent and orphaned folder references as unfiled", () => {
        const input = [persona("none"), persona("orphan", "missing"), persona("filed", "f1")]
        expect(filterPersonaPicker(input, folders, "", PERSONA_PICKER_SCOPE_UNFILED)
            .map((entry) => entry.persona.id)).toEqual(["none", "orphan"])
    })

    it("falls back to all for an invalid picker scope and never drops personas", () => {
        const input = [persona("a"), persona("b", "f1"), persona("c", "missing")]
        expect(filterPersonaPicker(input, folders, "", personaPickerFolderScope("deleted"))
            .map((entry) => entry.index)).toEqual([0, 1, 2])
        expect(filterPersonaPicker(input, folders, "", "legacy-untagged")
            .map((entry) => entry.index)).toEqual([0, 1, 2])
    })

    it("resolves folder assignment only through a current canonical folder", () => {
        expect(resolvePersonaFolderId(folders, "f1")).toBe("f1")
        expect(resolvePersonaFolderId(folders, "missing")).toBeUndefined()
        expect(resolvePersonaFolderId(folders, null)).toBeUndefined()
        const colliding = [{ id: PERSONA_PICKER_SCOPE_ALL, name: "Sentinel-shaped" }]
        const scope = personaPickerFolderScope(PERSONA_PICKER_SCOPE_ALL)
        expect(scope).toBe("folder:scope:all")
        expect(personaPickerFolderIdFromScope(colliding, scope)).toBe(PERSONA_PICKER_SCOPE_ALL)
        expect(personaPickerFolderIdFromScope(colliding, PERSONA_PICKER_SCOPE_ALL)).toBeUndefined()
    })

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
