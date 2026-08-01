'use strict'

const path = require('node:path')

const DEFAULT_TARGETS = Object.freeze({
    pocketrisu: Object.freeze({
        verified: Object.freeze(['1.8.1']),
        reviewing: Object.freeze(['1.9.0']),
    }),
})

const PROFILES = Object.freeze({
    features: Object.freeze({
        id: 'features',
        description: 'Lazy chat synchronization, startup cache, persona and character organization, non-blocking character import, and personal settings; bg-preserve stays external.',
    }),
    hardening: Object.freeze({
        id: 'hardening',
        description: 'Focused parser and toolchain hardening without feature or bg-preserve ownership.',
    }),
    all: Object.freeze({
        id: 'all',
        description: 'Unified bg-preserve, features, parser hardening, and toolchain hardening.',
    }),
})

const NARROW_PROFILE_IDS = Object.freeze(['features', 'hardening'])

function validateProfileMetadata(catalog) {
    for (const pack of catalog) {
        const defaults = pack.presetDefaults ?? []
        if (
            !Array.isArray(defaults)
            || defaults.some((id) => typeof id !== 'string' || !id)
            || new Set(defaults).size !== defaults.length
        ) {
            throw new Error(`${pack.id}.presetDefaults must be a unique array of preset ids`)
        }
        for (const presetId of defaults) {
            if (!NARROW_PROFILE_IDS.includes(presetId)) {
                throw new Error(`${pack.id}.presetDefaults contains unknown preset ${presetId}`)
            }
        }
        if (pack.userSelectable === false && defaults.length > 0) {
            throw new Error(`${pack.id} is internal and cannot be a preset default`)
        }
    }
}

function loadCatalog(repositoryRoot = path.resolve(__dirname, '..')) {
    const catalog = [
        require(path.join(repositoryRoot, 'patches/bg-preserve/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/bg-preserve-storage-base/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/startup-cache/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/lazy-chat-sync/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/lazy-chat-bg-adapter/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/persona-organizer/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/character-organizer/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/character-import-ux/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/personal-settings/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/preset-integrity/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/parser-hardening/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/toolchain-hardening/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/kei-stream-parser-core/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/kei-stream-parser-base-adapter/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/kei-stream-parser-bg-adapter/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/kei-chat-render-core/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/kei-chat-render-base-adapter/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/kei-chat-render-bg-adapter/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/kei-mobile-navigation-core/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/kei-mobile-navigation-base-adapter/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/kei-mobile-navigation-lazy-adapter/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/kei-hypa-tools-core/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/kei-hypa-tools-base-adapter/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/kei-hypa-tools-bg-adapter/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/kei-partial-edit-core/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/kei-partial-edit-base-adapter/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/kei-partial-edit-bg-adapter/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/kei-translation-tools-core/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/kei-translation-tools-base-adapter/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/kei-translation-tools-bg-adapter/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/kei-fullscreen-image-viewer-core/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/kei-prompt-role-compat-core/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/kei-text-theme-normalization-core/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/kei-backup-restore-safety-core/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/kei-backup-restore-safety-standard-adapter/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/kei-backup-restore-safety-lazy-adapter/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/pocketrisu-kei/manifest.cjs')),
    ].map((pack) => ({
        targets: DEFAULT_TARGETS,
        ...pack,
    }))
    validateProfileMetadata(catalog)
    return catalog
}

function resolveProfile(profileId, catalog) {
    const definition = PROFILES[profileId]
    if (!definition) throw new Error(`Unknown profile: ${profileId}`)
    if (!Array.isArray(catalog)) {
        throw new Error(`Resolving profile ${profileId} requires the active catalog`)
    }
    validateProfileMetadata(catalog)
    const visible = catalog.filter((pack) => pack.userSelectable !== false)
    const defaults = profileId === 'all'
        ? visible.map((pack) => pack.id)
        : visible
            .filter((pack) => (pack.presetDefaults ?? []).includes(profileId))
            .map((pack) => pack.id)
    return {
        ...definition,
        defaults,
        allowed: [...defaults],
        required: [],
    }
}

function validateProfileSelection(profile, packIds) {
    for (const id of new Set(packIds)) {
        if (!profile.allowed.includes(id)) {
            throw new Error(`${profile.id} profile cannot manage pack ${id}`)
        }
    }
}

function validateProfileTransition(profile, previousState, catalog = []) {
    if (!previousState || previousState.profile === profile.id) return
    if (
        profile.id === 'all'
        && (previousState.profile === 'features' || previousState.profile === 'hardening')
    ) return
    if (profile.id === 'all' && previousState.profile === 'custom') {
        const byId = new Map(catalog.map((pack) => [pack.id, pack]))
        const knownAndOwned = (previousState.packs ?? []).every(({ id }) => {
            const pack = byId.get(id)
            return pack && (
                profile.allowed.includes(id)
                || pack.userSelectable === false
            )
        })
        if (knownAndOwned) return
    }
    throw new Error(
        `${profile.id} patcher cannot take ownership of ${previousState.profile} state; `
        + `use the ${previousState.profile} patcher or upgrade with the all patcher`,
    )
}

module.exports = {
    DEFAULT_TARGETS,
    PROFILES,
    loadCatalog,
    resolveProfile,
    validateProfileMetadata,
    validateProfileSelection,
    validateProfileTransition,
}
