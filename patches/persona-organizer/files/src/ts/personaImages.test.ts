import { describe, expect, it } from "vitest"
import type { RisuPersona } from "./storage/database.svelte"
import {
    addPersonaImages,
    getPersonaImageGallery,
    normalizePersonaImageGallery,
    removePersonaImage,
    selectPersonaImage,
} from "./personaImages"

function persona(icon = "", imageGallery?: string[]): RisuPersona {
    return {
        name: "User",
        personaPrompt: "",
        icon,
        imageGallery,
    }
}

describe("persona image gallery", () => {
    it("adopts a legacy active icon without changing compatibility fields", () => {
        const value = persona("assets/legacy.png")

        expect(normalizePersonaImageGallery(value)).toEqual(["assets/legacy.png"])
        expect(value.icon).toBe("assets/legacy.png")
        expect(value.imageGallery).toEqual(["assets/legacy.png"])
    })

    it("keeps insertion order and removes duplicate or invalid paths", () => {
        const value = persona("assets/active.png", [
            "assets/second.png",
            "assets/second.png",
            "",
        ])

        addPersonaImages(value, [
            "assets/second.png",
            "assets/third.png",
            "assets/third.png",
        ])

        expect(getPersonaImageGallery(value)).toEqual([
            "assets/active.png",
            "assets/second.png",
            "assets/third.png",
        ])
    })

    it("changes only the active compatibility icon when selecting", () => {
        const value = persona("assets/one.png", [
            "assets/one.png",
            "assets/two.png",
        ])

        expect(selectPersonaImage(value, "assets/two.png")).toBe(true)
        expect(value.icon).toBe("assets/two.png")
        expect(value.imageGallery).toEqual([
            "assets/one.png",
            "assets/two.png",
        ])
    })

    it("falls forward when the active image is removed without deleting other entries", () => {
        const value = persona("assets/two.png", [
            "assets/one.png",
            "assets/two.png",
            "assets/three.png",
        ])

        expect(removePersonaImage(value, "assets/two.png")).toEqual([
            "assets/one.png",
            "assets/three.png",
        ])
        expect(value.icon).toBe("assets/three.png")
    })

    it("uses a blank active icon after removing the final image", () => {
        const value = persona("assets/only.png", ["assets/only.png"])

        expect(removePersonaImage(value, "assets/only.png")).toEqual([])
        expect(value.icon).toBe("")
    })
})
