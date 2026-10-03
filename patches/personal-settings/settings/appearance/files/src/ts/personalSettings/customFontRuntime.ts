import { verifyFontBytes, type CustomFont } from './customFonts'
import { fontReadyAttribute, validPersonalId } from './cssToggles'
import type { PersonalFontTarget } from './appearanceValues'
import { writable } from 'svelte/store'

export const customFontLoadStatus = writable<Partial<Record<PersonalFontTarget, string>>>({})
export const setCustomFontLoadStatus = (target: PersonalFontTarget, message: string) => customFontLoadStatus.update(status => ({ ...status, [target]: message }))
const preparedFaces = new WeakMap<Document, Map<string, Set<FontFace>>>()
const faceOwners = new WeakMap<FontFace, Set<CustomFontRuntime>>()
export const customFontIdentity = (font: CustomFont) => JSON.stringify([font.id, font.sha256, font.assetPath, font.byteLength, font.format])

export const customFontFamily = (font: CustomFont) => {
    if (!validPersonalId(font.id) || !/^[a-f0-9]{64}$/.test(font.sha256)) throw new Error('폰트 식별자가 올바르지 않습니다.')
    const identity = Array.from(font.id, char => char.charCodeAt(0).toString(16).padStart(2, '0')).join('')
    return `PocketRisu_${identity}_${font.sha256}`
}
export class CustomFontRuntime {
    private generation = 0
    private active: { font: CustomFont; face: FontFace } | undefined
    private owned = new Map<FontFace, string>()
    /** Preview owners omit the target; only a target owner can activate a face. */
    constructor(readonly doc: Document, readonly target?: PersonalFontTarget) {}
    private get variable(): string { return `--personal-${this.target}-custom-font-family` }
    get supported(): boolean { return !!this.doc.defaultView?.FontFace && !!this.doc.fonts }
    get hasActive(): boolean { return !!this.active }
    private claim(face: FontFace, key: string): void {
        this.owned.set(face, key)
        const owners = faceOwners.get(face) ?? new Set<CustomFontRuntime>()
        owners.add(this); faceOwners.set(face, owners)
        const pool = preparedFaces.get(this.doc) ?? new Map<string, Set<FontFace>>()
        const faces = pool.get(key) ?? new Set<FontFace>()
        faces.add(face); pool.set(key, faces); preparedFaces.set(this.doc, pool)
    }
    async load(font: CustomFont, read: () => Promise<Uint8Array>, register = true): Promise<FontFace> {
        const key = customFontIdentity(font)
        for (const face of preparedFaces.get(this.doc)?.get(key) ?? []) {
            // Borrow only a verified, loaded face owned by another live consumer.
            // Same-owner calls keep independent handles for existing rollback paths.
            if (this.supported && !this.owned.has(face) && face.status === 'loaded' && this.doc.fonts.has?.(face)) {
                this.claim(face, key)
                if (register) this.doc.fonts.add(face)
                return face
            }
        }
        const generation = this.generation
        const bytes = await read()
        if (generation !== this.generation) throw new Error('폰트 로드가 취소되었습니다.')
        return this.prepare(font, bytes, register)
    }
    async prepare(font: CustomFont, bytes: Uint8Array, register = true): Promise<FontFace> {
        if (!this.supported) throw new Error('이 브라우저는 사용자 폰트 로드를 지원하지 않습니다.')
        const generation = this.generation
        await verifyFontBytes(font, bytes)
        const Constructor = this.doc.defaultView!.FontFace
        const face = new Constructor(customFontFamily(font), new Uint8Array(bytes).buffer)
        await face.load()
        if (generation !== this.generation) throw new Error('폰트 미리보기가 취소되었습니다.')
        if (register) this.doc.fonts.add(face)
        this.claim(face, customFontIdentity(font))
        return face
    }
    activate(font: CustomFont, face: FontFace): void {
        if (!this.target) throw new Error('폰트 적용 대상이 없습니다.')
        if (!this.owned.has(face)) throw new Error('폰트가 준비되지 않았습니다.')
        this.doc.fonts.add(face)
        const previous = this.active
        this.active = { font: { ...font }, face }
        this.doc.documentElement.style.setProperty(this.variable, `"${customFontFamily(font)}", sans-serif`)
        this.doc.documentElement.setAttribute(fontReadyAttribute(this.target), font.id)
        if (previous && previous.face !== face) this.release(previous.face)
    }
    matches(font: CustomFont): boolean { return this.active?.font.id === font.id && this.active.font.sha256 === font.sha256 }
    release(face: FontFace): void {
        const key = this.owned.get(face)
        if (key !== undefined) {
            this.owned.delete(face)
            const owners = faceOwners.get(face)
            owners?.delete(this)
            if (!owners?.size) {
                this.doc.fonts.delete(face)
                faceOwners.delete(face)
                const pool = preparedFaces.get(this.doc), faces = pool?.get(key)
                faces?.delete(face)
                if (!faces?.size) pool?.delete(key)
            }
        }
        if (this.active?.face === face && this.target) {
            const family = `"${customFontFamily(this.active.font)}", sans-serif`
            this.active = undefined
            if (this.doc.documentElement.style.getPropertyValue(this.variable) === family) {
                this.doc.documentElement.style.removeProperty(this.variable)
                this.doc.documentElement.removeAttribute(fontReadyAttribute(this.target))
            }
        }
    }
    clear(): void {
        ++this.generation
        for (const face of [...this.owned.keys()]) this.release(face)
    }
}
