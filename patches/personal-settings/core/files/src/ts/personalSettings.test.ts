import { describe, expect, it } from 'vitest'
import { updatePersonalSettings } from './personalSettings'

describe('personal settings storage', () => {
    it('updates one setting without discarding future personal settings', () => {
        const db = {
            pocketRisuPersonalSettings: {
                stayOnCurrentCharacterAfterImport: false,
                futureSetting: 'preserved',
            },
        }

        updatePersonalSettings(db, {
            stayOnCurrentCharacterAfterImport: true,
        })

        expect(db.pocketRisuPersonalSettings).toEqual({
            stayOnCurrentCharacterAfterImport: true,
            futureSetting: 'preserved',
        })
    })
})
