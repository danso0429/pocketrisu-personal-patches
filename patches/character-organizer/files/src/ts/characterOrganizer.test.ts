import { describe, expect, it } from "vitest"
import type { folder } from "./storage/database.svelte"
import {
    cloneCharacterOrder,
    commitCharacterFolderDraft,
    findCharacterFolder,
    includeMissingCharacterIds,
    isOrganizableCharacterId,
    moveCharacterRootItem,
    moveCharacterToFolder,
    moveCharacterToRoot,
    moveCharacterWithinFolder,
    normalizeCharacterOrder,
    orderedCharacterIds,
    removeCharacterFolder,
    renameCharacterFolder,
} from "./characterOrganizer"

function characterFolder(
    id: string,
    data: string[],
    extra: Partial<folder> = {},
): folder {
    return {
        id,
        name: id,
        color: "#123456",
        data,
        ...extra,
    }
}

describe("character organizer", () => {
    it("excludes Risu's temporary and playground characters", () => {
        expect(isOrganizableCharacterId("regular")).toBe(true)
        expect(isOrganizableCharacterId("")).toBe(false)
        expect(isOrganizableCharacterId("§temp")).toBe(false)
        expect(isOrganizableCharacterId("§playground")).toBe(false)
    })

    it("clones the order without sharing folder membership arrays", () => {
        const input = ["a", characterFolder("f1", ["b"])]
        const output = cloneCharacterOrder(input)
        expect(output).toEqual(input)
        expect(output).not.toBe(input)
        expect(output[1]).not.toBe(input[1])
        expect((output[1] as folder).data).not.toBe((input[1] as folder).data)
    })

    it("commits a draft only with its first member and never writes an empty folder", () => {
        const input = ["a", characterFolder("f1", ["b", "c"], { imgFile: "asset" })]
        const draft = { id: "f2", name: "  New folder  ", color: "#abcdef" }
        const output = commitCharacterFolderDraft(input, draft, "a")

        expect(output).toEqual([
            characterFolder("f1", ["b", "c"], { imgFile: "asset" }),
            characterFolder("f2", ["a"], {
                name: "New folder",
                color: "#abcdef",
            }),
        ])
        expect(input).toEqual([
            "a",
            characterFolder("f1", ["b", "c"], { imgFile: "asset" }),
        ])
        expect(commitCharacterFolderDraft(input, draft, "")).toBeNull()
        expect(commitCharacterFolderDraft(input, { ...draft, name: " " }, "a")).toBeNull()
    })

    it("replaces a singleton source folder with a complete new folder atomically", () => {
        const input = [
            characterFolder("old", ["a"], { img: "old-preview" }),
            "b",
        ]
        expect(commitCharacterFolderDraft(
            input,
            { id: "new", name: "New", color: "#ffffff" },
            "a",
        )).toEqual([
            "b",
            characterFolder("new", ["a"], {
                name: "New",
                color: "#ffffff",
            }),
        ])
    })

    it("rejects a duplicate folder id without changing the source", () => {
        const input = ["a", characterFolder("f1", ["b"])]
        expect(commitCharacterFolderDraft(
            input,
            { id: "f1", name: "Duplicate", color: "#ffffff" },
            "a",
        )).toBeNull()
        expect(input).toEqual(["a", characterFolder("f1", ["b"])])
    })

    it("moves loose or filed characters into a folder without duplication", () => {
        const input = [
            "a",
            characterFolder("f1", ["b", "c"]),
            characterFolder("f2", ["d"]),
        ]
        expect(moveCharacterToFolder(input, "a", "f2")).toEqual([
            characterFolder("f1", ["b", "c"]),
            characterFolder("f2", ["d", "a"]),
        ])
        expect(moveCharacterToFolder(input, "b", "f2")).toEqual([
            "a",
            characterFolder("f1", ["c"]),
            characterFolder("f2", ["d", "b"]),
        ])
        expect(moveCharacterToFolder(input, "missing", "unknown")).toEqual(input)
    })

    it("unfiles a character beside its source folder and removes a now-empty source", () => {
        const input = [
            "a",
            characterFolder("f1", ["b", "c"]),
            characterFolder("f2", ["d"]),
            "e",
        ]
        expect(moveCharacterToRoot(input, "b")).toEqual([
            "a",
            characterFolder("f1", ["c"]),
            "b",
            characterFolder("f2", ["d"]),
            "e",
        ])
        expect(moveCharacterToRoot(input, "d")).toEqual([
            "a",
            characterFolder("f1", ["b", "c"]),
            "d",
            "e",
        ])
        expect(moveCharacterToRoot(input, "a")).toEqual(input)
    })

    it("moves root entries and folder members only inside their own domains", () => {
        const input = [
            "a",
            characterFolder("f1", ["b", "c"]),
            "d",
        ]
        expect(moveCharacterRootItem(
            input,
            { kind: "folder", id: "f1" },
            -1,
        )).toEqual([
            characterFolder("f1", ["b", "c"]),
            "a",
            "d",
        ])
        expect(moveCharacterWithinFolder(input, "f1", "c", -1)).toEqual([
            "a",
            characterFolder("f1", ["c", "b"]),
            "d",
        ])
        expect(moveCharacterWithinFolder(input, "f1", "b", -1)).toEqual(input)
    })

    it("keeps exact flattened order while deduplicating only the read view", () => {
        const input = [
            "a",
            characterFolder("f1", ["b", "a", "c"]),
            "b",
        ]
        expect(orderedCharacterIds(input)).toEqual(["a", "b", "c"])
        expect(findCharacterFolder(input, "c")?.id).toBe("f1")
        expect(input).toEqual([
            "a",
            characterFolder("f1", ["b", "a", "c"]),
            "b",
        ])
    })

    it("appends active characters missing from the stored order without rewriting entries", () => {
        const input = [
            "a",
            characterFolder("f1", ["b"], { imgFile: "asset" }),
        ]
        expect(includeMissingCharacterIds(input, ["b", "c", "a", "d", "c"])).toEqual([
            "a",
            characterFolder("f1", ["b"], { imgFile: "asset" }),
            "c",
            "d",
        ])
        expect(input).toEqual([
            "a",
            characterFolder("f1", ["b"], { imgFile: "asset" }),
        ])
    })

    it("normalizes stale and duplicate references before an edit", () => {
        const input = [
            "a",
            "deleted",
            characterFolder("f1", ["b", "deleted", "a"], {
                imgFile: "asset",
            }),
            characterFolder("empty", ["deleted"]),
            "b",
            characterFolder("f1", ["c"]),
            "§temp",
            "§playground",
        ]
        expect(normalizeCharacterOrder(
            input,
            ["a", "b", "c", "§temp", "§playground"],
        )).toEqual([
            "a",
            characterFolder("f1", ["b"], { imgFile: "asset" }),
            "c",
        ])
        expect(input).toEqual([
            "a",
            "deleted",
            characterFolder("f1", ["b", "deleted", "a"], {
                imgFile: "asset",
            }),
            characterFolder("empty", ["deleted"]),
            "b",
            characterFolder("f1", ["c"]),
            "§temp",
            "§playground",
        ])
    })

    it("renames or removes a folder without losing its metadata or members", () => {
        const input = [
            "a",
            characterFolder("f1", ["b", "c"], { imgFile: "asset", img: "preview" }),
            characterFolder("f2", ["d"], { color: "#fedcba" }),
        ]
        const renamed = renameCharacterFolder(input, "f1", "  Renamed  ")
        expect(renamed).toEqual([
            "a",
            characterFolder("f1", ["b", "c"], {
                name: "Renamed",
                imgFile: "asset",
                img: "preview",
            }),
            characterFolder("f2", ["d"], { color: "#fedcba" }),
        ])
        expect(removeCharacterFolder(renamed, "f1")).toEqual([
            "a",
            "b",
            "c",
            characterFolder("f2", ["d"], { color: "#fedcba" }),
        ])
    })
})
