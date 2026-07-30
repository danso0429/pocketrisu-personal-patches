export interface PocketRisuPersonalSettings {
    stayOnCurrentCharacterAfterImport?: boolean
}

export interface PersonalSettingsCarrier {
    pocketRisuPersonalSettings?: PocketRisuPersonalSettings
}

export function updatePersonalSettings(
    db: PersonalSettingsCarrier,
    changes: Partial<PocketRisuPersonalSettings>,
): void {
    db.pocketRisuPersonalSettings = {
        ...(db.pocketRisuPersonalSettings ?? {}),
        ...changes,
    }
}
