'use strict'

const path = require('node:path')

const DEFAULT_TARGETS = Object.freeze({
    pocketrisu: Object.freeze({
        verified: Object.freeze(['1.8.1']),
        reviewing: Object.freeze(['1.9.0', '1.10.0']),
    }),
})

const PROFILES = Object.freeze({
    all: Object.freeze({
        id: 'all',
        description: 'The complete admitted PocketRisu patch set.',
    }),
})

function validateProfileMetadata(catalog) {
    for (const pack of catalog) {
        if (pack.allDefault !== undefined && typeof pack.allDefault !== 'boolean') {
            throw new Error(`${pack.id}.allDefault must be a boolean`)
        }
        if (pack.presetDefaults !== undefined) {
            throw new Error(`${pack.id}.presetDefaults is obsolete in all-or-nothing delivery`)
        }
    }
}

function loadCatalog(repositoryRoot = path.resolve(__dirname, '..')) {
    const catalog = [
        require(path.join(repositoryRoot, 'patches/bg-preserve/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/bg-preserve-legacy-charx-adapter/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/bg-preserve-storage-base/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/client-build-fence/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/client-build-fence-bg-adapter/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/client-build-fence-standard-adapter/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/client-build-fence-kei-adapter/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/client-build-fence-kei-standard-storage-adapter/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/client-build-fence-kei-lazy-storage-adapter/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/server-backup-snapshot-core/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/server-backup-snapshot-standard-adapter/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/server-backup-snapshot-lazy-adapter/manifest.cjs')),
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
        require(path.join(repositoryRoot, 'patches/charx-archive-integrity/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/background-import/manifest.cjs')),
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
    const defaults = visible
        .filter((pack) => pack.allDefault !== false)
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
    // Adopt the two retired wrapper states without exposing those profiles
    // again. Unknown owners still block migration below.
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
