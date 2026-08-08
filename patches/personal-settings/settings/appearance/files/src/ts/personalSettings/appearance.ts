import type { Database } from 'src/ts/storage/database.svelte'

export const PERSONAL_APPEARANCE_SCHEMA_VERSION = 1 as const
export const PERSONAL_APPEARANCE_ATTRIBUTE = 'data-pocketrisu-css'

export type PersonalAppearanceSchemaStatus = 'empty' | 'supported' | 'unsupported'
export type PersonalChatFont = 'app' | 'paperlogy'
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
    return value === 'paperlogy' ? 'paperlogy' : 'app'
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
    if (path === 'chat.font') return value === 'app' || value === 'paperlogy'
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

const featureTokens: ReadonlyArray<readonly [PersonalAppearanceFeature, string]> = [
    ['chat.font', 'chat-font-paperlogy'],
    ['chat.alignment', 'chat-align-center'],
    ['chat.keepKoreanWords', 'chat-keep-korean-words'],
    ['chat.wrapCodeBlocks', 'chat-wrap-code-blocks'],
    ['composer.minimal', 'composer-minimal'],
    ['composer.textSendIcon', 'composer-text-send-icon'],
    ['sidebar.compact', 'sidebar-compact'],
    ['sidebar.avatarBorder', 'sidebar-avatar-border'],
    ['sidebar.panelDividers', 'sidebar-panel-dividers'],
    ['settings.compactControls', 'settings-compact-controls'],
    ['visibility.hideJailbreakToggle', 'visibility-hide-jailbreak-toggle'],
]

function featureSelected(
    appearance: NormalizedPersonalAppearance,
    feature: PersonalAppearanceFeature,
): boolean {
    const value = getPersonalAppearanceValueFromNormalized(appearance, feature)
    if (feature === 'chat.font') return value === 'paperlogy'
    if (feature === 'chat.alignment') return value === 'center'
    return value === true
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
    return featureTokens
        .filter(([feature]) => featureSelected(appearance, feature))
        .map(([, token]) => token)
}

export function isPersonalAppearanceFeatureEffective(
    db: Database,
    safeMode: boolean,
    feature: PersonalAppearanceFeature,
): boolean {
    const token = featureTokens.find(([candidate]) => candidate === feature)?.[1]
    return token !== undefined && resolvePersonalAppearanceTokens(db, safeMode).includes(token)
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
