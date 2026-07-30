import {
    updatePersonalSettings,
    type PersonalSettingsCarrier,
} from './core'

export function shouldStayOnCurrentCharacterAfterImport(
    db: PersonalSettingsCarrier,
): boolean {
    return db.pocketRisuPersonalSettings?.stayOnCurrentCharacterAfterImport === true
}

export function setStayOnCurrentCharacterAfterImport(
    db: PersonalSettingsCarrier,
    enabled: boolean,
): void {
    updatePersonalSettings(db, {
        stayOnCurrentCharacterAfterImport: enabled,
    })
}
