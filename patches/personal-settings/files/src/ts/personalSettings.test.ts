import { describe, expect, it } from 'vitest'
import {
    setStayOnCurrentCharacterAfterImport,
    shouldStayOnCurrentCharacterAfterImport,
} from './personalSettings'

describe('personal settings', () => {
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

    it('updates the setting without discarding future personal settings', () => {
        const db = {
            pocketRisuPersonalSettings: {
                stayOnCurrentCharacterAfterImport: false,
                futureSetting: 'preserved',
            },
        }

        setStayOnCurrentCharacterAfterImport(db, true)

        expect(db.pocketRisuPersonalSettings).toEqual({
            stayOnCurrentCharacterAfterImport: true,
            futureSetting: 'preserved',
        })
    })
})
