import type { Database } from 'src/ts/storage/database.svelte'

export const PERSONAL_APPEARANCE_SCHEMA_VERSION = 1 as const
export const PERSONAL_APPEARANCE_ATTRIBUTE = 'data-pocketrisu-css'

export type PersonalAppearanceSchemaStatus = 'empty' | 'supported' | 'unsupported'
export type PersonalChatFont =
    | 'app'
    | 'paperlogy'
    | 'noto-sans-kr'
    | 'noto-serif-kr'
export type PersonalChatAlignment = 'left' | 'center'

export interface NormalizedPersonalAppearance {
    schemaStatus: PersonalAppearanceSchemaStatus
    rawVersion?: unknown
    enabled: boolean
    chat: {
        font: PersonalChatFont
        alignment: PersonalChatAlignment
        keepKoreanWords: boolean
        wrapCodeBlocks: boolean
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
    | 'chat.alignment'
    | 'chat.keepKoreanWords'
    | 'chat.wrapCodeBlocks'
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

const groupNames = ['chat', 'composer', 'sidebar', 'settings', 'visibility'] as const

const defaults: Omit<NormalizedPersonalAppearance, 'schemaStatus' | 'rawVersion'> = {
    enabled: false,
    chat: {
        font: 'app',
        alignment: 'left',
        keepKoreanWords: false,
        wrapCodeBlocks: false,
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

function readChatFont(value: unknown): PersonalChatFont {
    switch (value) {
        case 'paperlogy':
        case 'noto-sans-kr':
        case 'noto-serif-kr':
            return value
        default:
            return 'app'
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
    const composer = (raw.composer ?? {}) as UnknownRecord
    const sidebar = (raw.sidebar ?? {}) as UnknownRecord
    const settings = (raw.settings ?? {}) as UnknownRecord
    const visibility = (raw.visibility ?? {}) as UnknownRecord

    return {
        schemaStatus: 'supported',
        rawVersion: raw.version,
        enabled: readBoolean(raw.enabled),
        chat: {
            font: readChatFont(chat.font),
            alignment: readChatAlignment(chat.alignment),
            keepKoreanWords: readBoolean(chat.keepKoreanWords),
            wrapCodeBlocks: readBoolean(chat.wrapCodeBlocks),
        },
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
): boolean | PersonalChatFont | PersonalChatAlignment {
    const appearance = readPersonalAppearance(db)
    switch (path) {
        case 'enabled': return appearance.enabled
        case 'chat.font': return appearance.chat.font
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
    if (path === 'chat.font') {
        return value === 'app'
            || value === 'paperlogy'
            || value === 'noto-sans-kr'
            || value === 'noto-serif-kr'
    }
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

const featureOrder: readonly PersonalAppearanceFeature[] = [
    'chat.font',
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

const chatFontTokens: Readonly<Record<Exclude<PersonalChatFont, 'app'>, string>> = {
    paperlogy: 'chat-font-paperlogy',
    'noto-sans-kr': 'chat-font-noto-sans-kr',
    'noto-serif-kr': 'chat-font-noto-serif-kr',
}

const chatFontFamilies: Readonly<Record<Exclude<PersonalChatFont, 'app'>, string>> = {
    paperlogy: 'Paperlogy',
    'noto-sans-kr': 'Noto Sans KR',
    'noto-serif-kr': 'Noto Serif KR',
}

export function getPersonalChatFontFamily(font: PersonalChatFont): string | null {
    return font === 'app' ? null : chatFontFamilies[font]
}

function resolveFeatureToken(
    appearance: NormalizedPersonalAppearance,
    feature: PersonalAppearanceFeature,
): string | null {
    const value = getPersonalAppearanceValueFromNormalized(appearance, feature)
    if (feature === 'chat.font') {
        const font = value as PersonalChatFont
        return font === 'app' ? null : chatFontTokens[font]
    }
    if (feature === 'chat.alignment') {
        return value === 'center' ? 'chat-align-center' : null
    }
    if (value !== true) return null
    switch (feature) {
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
): boolean | PersonalChatFont | PersonalChatAlignment {
    switch (path) {
        case 'chat.font': return appearance.chat.font
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
    const theme = readCarrier(db).theme
    if (
        safeMode
        || theme !== ''
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

export function syncPersonalAppearance(
    db: Database,
    safeMode: boolean,
    root: HTMLElement | null = typeof document === 'undefined' ? null : document.documentElement,
): string {
    const value = resolvePersonalAppearanceTokens(db, safeMode).join(' ')
    if (!root) return value
    if (!value) {
        if (root.hasAttribute(PERSONAL_APPEARANCE_ATTRIBUTE)) {
            root.removeAttribute(PERSONAL_APPEARANCE_ATTRIBUTE)
        }
        return value
    }
    if (root.getAttribute(PERSONAL_APPEARANCE_ATTRIBUTE) !== value) {
        root.setAttribute(PERSONAL_APPEARANCE_ATTRIBUTE, value)
    }
    return value
}
