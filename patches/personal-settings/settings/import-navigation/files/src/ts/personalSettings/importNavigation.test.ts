import { describe, expect, it } from 'vitest'
import {
    setStayOnCurrentCharacterAfterImport,
    shouldStayOnCurrentCharacterAfterImport,
} from './importNavigation'

describe('personal import navigation setting', () => {
    it('keeps the existing import navigation behavior when the setting is absent', () => {
        const db = {}

        expect(shouldStayOnCurrentCharacterAfterImport(db)).toBe(false)
        expect(db).toEqual({})
    })

    it('only enables the override for an explicit true value', () => {
        expect(shouldStayOnCurrentCharacterAfterImport({
            pocketRisuPersonalSettings: {
                stayOnCurrentCharacterAfterImport: true,
            },
        })).toBe(true)
        expect(shouldStayOnCurrentCharacterAfterImport({
            pocketRisuPersonalSettings: {
                stayOnCurrentCharacterAfterImport: false,
            },
        })).toBe(false)
    })

    it('writes through the shared personal settings namespace', () => {
        const db = {}

        setStayOnCurrentCharacterAfterImport(db, true)

        expect(db).toEqual({
            pocketRisuPersonalSettings: {
                stayOnCurrentCharacterAfterImport: true,
            },
        })
    })
})
