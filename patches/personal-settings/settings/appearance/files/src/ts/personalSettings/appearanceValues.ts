import type { Database } from 'src/ts/storage/database.svelte'

export const PERSONAL_APPEARANCE_SCHEMA_VERSION = 1 as const
export const PERSONAL_APPEARANCE_ATTRIBUTE = 'data-pocketrisu-css'

export type PersonalAppearanceSchemaStatus = 'empty' | 'supported' | 'unsupported'
export type PersonalFont =
    | `custom:${string}`
    | 'paperlogy'
    | 'galmuri14'
export type PersonalFontTarget = 'chat' | 'ui'
export const DEFAULT_PERSONAL_FONT: PersonalFont = 'galmuri14'
export type PersonalChatAlignment = 'left' | 'center'

export interface NormalizedPersonalAppearance {
    schemaStatus: PersonalAppearanceSchemaStatus
    rawVersion?: unknown
    enabled: boolean
    chat: {
        font: PersonalFont
        fontEnabled: boolean
        alignment: PersonalChatAlignment
        keepKoreanWords: boolean
        wrapCodeBlocks: boolean
    }
    ui: {
        font: PersonalFont
        fontEnabled: boolean
    }
    composer: {
        minimal: boolean
        textSendIcon: boolean
    }
    sidebar: {
        compact: boolean
        avatarBorder: boolean
        panelDividers: boolean
    }
    settings: {
        compactControls: boolean
    }
    visibility: {
        hideJailbreakToggle: boolean
    }
}

export type PersonalAppearanceLeafPath =
    | 'enabled'
    | 'chat.font'
    | 'chat.fontEnabled'
    | 'chat.alignment'
    | 'chat.keepKoreanWords'
    | 'chat.wrapCodeBlocks'
    | 'ui.font'
    | 'ui.fontEnabled'
    | 'composer.minimal'
    | 'composer.textSendIcon'
    | 'sidebar.compact'
    | 'sidebar.avatarBorder'
    | 'sidebar.panelDividers'
    | 'settings.compactControls'
    | 'visibility.hideJailbreakToggle'

export type PersonalAppearanceFeature = Exclude<PersonalAppearanceLeafPath, 'enabled'>

type UnknownRecord = Record<string, unknown>

interface AppearanceCarrier {
    pocketRisuPersonalSettings?: unknown
    theme?: unknown
}

const groupNames = ['chat', 'ui', 'composer', 'sidebar', 'settings', 'visibility'] as const

const defaults: Omit<NormalizedPersonalAppearance, 'schemaStatus' | 'rawVersion'> = {
    enabled: false,
    chat: {
        font: DEFAULT_PERSONAL_FONT,
        fontEnabled: false,
        alignment: 'left',
        keepKoreanWords: false,
        wrapCodeBlocks: false,
    },
    ui: {
        font: DEFAULT_PERSONAL_FONT,
        fontEnabled: false,
    },
    composer: {
        minimal: false,
        textSendIcon: false,
    },
    sidebar: {
        compact: false,
        avatarBorder: false,
        panelDividers: false,
    },
    settings: {
        compactControls: false,
    },
    visibility: {
        hideJailbreakToggle: false,
    },
}

function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readCarrier(db: Database): AppearanceCarrier {
    return db as unknown as AppearanceCarrier
}

function readBoolean(value: unknown): boolean {
    return value === true
}

export function isPersonalFont(value: unknown): value is PersonalFont {
    return value === 'paperlogy'
        || value === 'galmuri14'
        || (typeof value === 'string' && /^custom:[a-zA-Z0-9_-]{1,64}$/.test(value))
}

/**
 * Legacy values ('app' and removed built-ins) read as the default font. A
 * missing toggle keeps the visible state of data written before targets existed:
 * a valid chat font was applied, and the UI target did not exist.
 */
function readFontTarget(group: UnknownRecord, target: PersonalFontTarget): { font: PersonalFont; fontEnabled: boolean } {
    const valid = isPersonalFont(group.font)
    return {
        font: valid ? group.font as PersonalFont : DEFAULT_PERSONAL_FONT,
        fontEnabled: typeof group.fontEnabled === 'boolean' ? group.fontEnabled : target === 'chat' && valid,
    }
}

function readChatAlignment(value: unknown): PersonalChatAlignment {
    return value === 'center' ? 'center' : 'left'
}

function unsupported(rawVersion?: unknown): NormalizedPersonalAppearance {
    return {
        schemaStatus: 'unsupported',
        rawVersion,
        ...structuredClone(defaults),
    }
}

export function readPersonalAppearance(db: Database): NormalizedPersonalAppearance {
    const personal = readCarrier(db).pocketRisuPersonalSettings
    if (personal === undefined) {
        return { schemaStatus: 'empty', ...structuredClone(defaults) }
    }
    if (!isRecord(personal)) return unsupported()

    const raw = personal.appearance
    if (raw === undefined) {
        return { schemaStatus: 'empty', ...structuredClone(defaults) }
    }
    if (!isRecord(raw) || raw.version !== PERSONAL_APPEARANCE_SCHEMA_VERSION) {
        return unsupported(isRecord(raw) ? raw.version : undefined)
    }
    if (groupNames.some((group) => raw[group] !== undefined && !isRecord(raw[group]))) {
        return unsupported(raw.version)
    }

    const chat = (raw.chat ?? {}) as UnknownRecord
    const ui = (raw.ui ?? {}) as UnknownRecord
    const composer = (raw.composer ?? {}) as UnknownRecord
    const sidebar = (raw.sidebar ?? {}) as UnknownRecord
    const settings = (raw.settings ?? {}) as UnknownRecord
    const visibility = (raw.visibility ?? {}) as UnknownRecord

    return {
        schemaStatus: 'supported',
        rawVersion: raw.version,
        enabled: readBoolean(raw.enabled),
        chat: {
            ...readFontTarget(chat, 'chat'),
            alignment: readChatAlignment(chat.alignment),
            keepKoreanWords: readBoolean(chat.keepKoreanWords),
            wrapCodeBlocks: readBoolean(chat.wrapCodeBlocks),
        },
        ui: readFontTarget(ui, 'ui'),
        composer: {
            minimal: readBoolean(composer.minimal),
            textSendIcon: readBoolean(composer.textSendIcon),
        },
        sidebar: {
            compact: readBoolean(sidebar.compact),
            avatarBorder: readBoolean(sidebar.avatarBorder),
            panelDividers: readBoolean(sidebar.panelDividers),
        },
        settings: {
            compactControls: readBoolean(settings.compactControls),
        },
        visibility: {
            hideJailbreakToggle: readBoolean(visibility.hideJailbreakToggle),
        },
    }
}

export function canWritePersonalAppearance(db: Database): boolean {
    return readPersonalAppearance(db).schemaStatus !== 'unsupported'
}

export function getPersonalAppearanceValue(
    db: Database,
    path: PersonalAppearanceLeafPath,
): boolean | PersonalFont | PersonalChatAlignment {
    const appearance = readPersonalAppearance(db)
    switch (path) {
        case 'enabled': return appearance.enabled
        case 'chat.font': return appearance.chat.font
        case 'chat.fontEnabled': return appearance.chat.fontEnabled
        case 'ui.font': return appearance.ui.font
        case 'ui.fontEnabled': return appearance.ui.fontEnabled
        case 'chat.alignment': return appearance.chat.alignment
        case 'chat.keepKoreanWords': return appearance.chat.keepKoreanWords
        case 'chat.wrapCodeBlocks': return appearance.chat.wrapCodeBlocks
        case 'composer.minimal': return appearance.composer.minimal
        case 'composer.textSendIcon': return appearance.composer.textSendIcon
        case 'sidebar.compact': return appearance.sidebar.compact
        case 'sidebar.avatarBorder': return appearance.sidebar.avatarBorder
        case 'sidebar.panelDividers': return appearance.sidebar.panelDividers
        case 'settings.compactControls': return appearance.settings.compactControls
        case 'visibility.hideJailbreakToggle': return appearance.visibility.hideJailbreakToggle
    }
}

function validLeafValue(path: PersonalAppearanceLeafPath, value: unknown): boolean {
    if (path === 'chat.font' || path === 'ui.font') return isPersonalFont(value)
    if (path === 'chat.alignment') return value === 'left' || value === 'center'
    return typeof value === 'boolean'
}

/**
 * Writes exactly one appearance leaf while retaining unknown data at the
 * personal root, appearance root, and feature-group levels. Unknown future
 * schema versions and malformed known groups are preserved and rejected.
 */
export function setPersonalAppearanceValue(
    db: Database,
    path: PersonalAppearanceLeafPath,
    value: unknown,
): boolean {
    if (!validLeafValue(path, value)) return false

    const carrier = readCarrier(db)
    const personal = carrier.pocketRisuPersonalSettings
    if (personal !== undefined && !isRecord(personal)) return false
    const personalRecord = (personal ?? {}) as UnknownRecord
    const currentAppearance = personalRecord.appearance
    if (currentAppearance !== undefined) {
        if (!isRecord(currentAppearance)) return false
        if (currentAppearance.version !== PERSONAL_APPEARANCE_SCHEMA_VERSION) return false
    }

    const appearanceRecord = (currentAppearance ?? {}) as UnknownRecord
    let nextAppearance: UnknownRecord
    if (path === 'enabled') {
        nextAppearance = {
            ...appearanceRecord,
            version: PERSONAL_APPEARANCE_SCHEMA_VERSION,
            enabled: value,
        }
    } else {
        const [group, leaf] = path.split('.') as [typeof groupNames[number], string]
        const currentGroup = appearanceRecord[group]
        if (currentGroup !== undefined && !isRecord(currentGroup)) return false
        nextAppearance = {
            ...appearanceRecord,
            version: PERSONAL_APPEARANCE_SCHEMA_VERSION,
            [group]: {
                ...((currentGroup ?? {}) as UnknownRecord),
                [leaf]: value,
            },
        }
    }

    carrier.pocketRisuPersonalSettings = {
        ...personalRecord,
        appearance: nextAppearance,
    }
    return true
}

/**
 * Writes a target toggle together with its normalized font, so an enabled
 * target is never stored next to a legacy font value.
 */
export function setPersonalFontEnabled(db: Database, target: PersonalFontTarget, enabled: boolean): boolean {
    const appearance = readPersonalAppearance(db)
    if (appearance.schemaStatus === 'unsupported') return false
    return setPersonalAppearanceValue(db, `${target}.font`, appearance[target].font)
        && setPersonalAppearanceValue(db, `${target}.fontEnabled`, enabled)
}

const featureOrder: readonly PersonalAppearanceFeature[] = [
    'chat.font',
    'ui.font',
    'chat.alignment',
    'chat.keepKoreanWords',
    'chat.wrapCodeBlocks',
    'composer.minimal',
    'composer.textSendIcon',
    'sidebar.compact',
    'sidebar.avatarBorder',
    'sidebar.panelDividers',
    'settings.compactControls',
    'visibility.hideJailbreakToggle',
]

const builtinFontFamilies: Readonly<Record<'paperlogy' | 'galmuri14', string>> = {
    paperlogy: 'Paperlogy',
    galmuri14: 'Galmuri14',
}

/** CSS family of a built-in font; user fonts resolve through CustomFontRuntime. */
export function getPersonalFontFamily(font: PersonalFont): string | null {
    return font === 'paperlogy' || font === 'galmuri14' ? builtinFontFamilies[font] : null
}

function resolveFeatureToken(
    appearance: NormalizedPersonalAppearance,
    feature: PersonalAppearanceFeature,
): string | null {
    const value = getPersonalAppearanceValueFromNormalized(appearance, feature)
    if (feature === 'chat.font' || feature === 'ui.font') {
        const target = feature === 'chat.font' ? 'chat' : 'ui'
        if (!appearance[target].fontEnabled) return null
        const font = value as PersonalFont
        return `${target}-font-${font.startsWith('custom:') ? 'custom' : font}`
    }
    if (feature === 'chat.alignment') {
        return value === 'center' ? 'chat-align-center' : null
    }
    if (value !== true) return null
    switch (feature) {
        case 'chat.fontEnabled':
        case 'ui.fontEnabled':
            return null
        case 'chat.keepKoreanWords': return 'chat-keep-korean-words'
        case 'chat.wrapCodeBlocks': return 'chat-wrap-code-blocks'
        case 'composer.minimal': return 'composer-minimal'
        case 'composer.textSendIcon': return 'composer-text-send-icon'
        case 'sidebar.compact': return 'sidebar-compact'
        case 'sidebar.avatarBorder': return 'sidebar-avatar-border'
        case 'sidebar.panelDividers': return 'sidebar-panel-dividers'
        case 'settings.compactControls': return 'settings-compact-controls'
        case 'visibility.hideJailbreakToggle': return 'visibility-hide-jailbreak-toggle'
    }
}

function getPersonalAppearanceValueFromNormalized(
    appearance: NormalizedPersonalAppearance,
    path: PersonalAppearanceFeature,
): boolean | PersonalFont | PersonalChatAlignment {
    switch (path) {
        case 'chat.font': return appearance.chat.font
        case 'chat.fontEnabled': return appearance.chat.fontEnabled
        case 'ui.font': return appearance.ui.font
        case 'ui.fontEnabled': return appearance.ui.fontEnabled
        case 'chat.alignment': return appearance.chat.alignment
        case 'chat.keepKoreanWords': return appearance.chat.keepKoreanWords
        case 'chat.wrapCodeBlocks': return appearance.chat.wrapCodeBlocks
        case 'composer.minimal': return appearance.composer.minimal
        case 'composer.textSendIcon': return appearance.composer.textSendIcon
        case 'sidebar.compact': return appearance.sidebar.compact
        case 'sidebar.avatarBorder': return appearance.sidebar.avatarBorder
        case 'sidebar.panelDividers': return appearance.sidebar.panelDividers
        case 'settings.compactControls': return appearance.settings.compactControls
        case 'visibility.hideJailbreakToggle': return appearance.visibility.hideJailbreakToggle
    }
}

/** Resolves a stable, de-duplicated whitespace token list. */
export function resolvePersonalAppearanceTokens(db: Database, safeMode: boolean): string[] {
    const appearance = readPersonalAppearance(db)
    // Tokens apply under every theme; theme-specific rules scope themselves.
    if (
        safeMode
        || appearance.schemaStatus === 'unsupported'
        || !appearance.enabled
    ) {
        return []
    }
    return featureOrder
        .map((feature) => resolveFeatureToken(appearance, feature))
        .filter((token): token is string => token !== null)
}

export function isPersonalAppearanceFeatureEffective(
    db: Database,
    safeMode: boolean,
    feature: PersonalAppearanceFeature,
): boolean {
    const appearance = readPersonalAppearance(db)
    const token = resolveFeatureToken(appearance, feature)
    return token !== null && resolvePersonalAppearanceTokens(db, safeMode).includes(token)
}
