export interface PocketRisuPersonalSettings {
    stayOnCurrentCharacterAfterImport?: boolean
}

interface PersonalSettingsCarrier {
    pocketRisuPersonalSettings?: PocketRisuPersonalSettings
}

export function shouldStayOnCurrentCharacterAfterImport(
    db: PersonalSettingsCarrier,
): boolean {
    return db.pocketRisuPersonalSettings?.stayOnCurrentCharacterAfterImport === true
}

export function setStayOnCurrentCharacterAfterImport(
    db: PersonalSettingsCarrier,
    enabled: boolean,
): void {
    db.pocketRisuPersonalSettings = {
        ...(db.pocketRisuPersonalSettings ?? {}),
        stayOnCurrentCharacterAfterImport: enabled,
    }
}
