'use strict'

const fs = require('node:fs')
const path = require('node:path')

const DEFAULT_TARGETS = Object.freeze({
    pocketrisu: Object.freeze({
        verified: Object.freeze(['1.8.1']),
        reviewing: Object.freeze([]),
    }),
})

const PROFILES = Object.freeze({
    features: {
        id: 'features',
        description: 'Lazy chat synchronization, startup cache, persona organization, and character organization; bg-preserve stays external.',
        defaults: ['lazy-chat-sync', 'persona-organizer', 'character-organizer', 'preset-integrity'],
        allowed: ['lazy-chat-sync', 'persona-organizer', 'character-organizer', 'preset-integrity'],
        required: [],
    },
    hardening: {
        id: 'hardening',
        description: 'Focused parser and toolchain hardening without feature or bg-preserve ownership.',
        defaults: ['parser-hardening', 'toolchain-hardening'],
        allowed: ['parser-hardening', 'toolchain-hardening'],
        required: [],
    },
    all: {
        id: 'all',
        description: 'Unified bg-preserve, features, parser hardening, and toolchain hardening.',
        defaults: ['bg-preserve', 'lazy-chat-sync', 'persona-organizer', 'character-organizer', 'preset-integrity', 'parser-hardening', 'toolchain-hardening'],
        allowed: ['bg-preserve', 'startup-cache', 'lazy-chat-sync', 'persona-organizer', 'character-organizer', 'preset-integrity', 'parser-hardening', 'toolchain-hardening'],
        required: [],
    },
})

function loadCatalog(repositoryRoot = path.resolve(__dirname, '..')) {
    return [
        JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'patches/bg-preserve.json'), 'utf8')),
        require(path.join(repositoryRoot, 'patches/bg-preserve-storage-base/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/startup-cache/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/lazy-chat-sync/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/lazy-chat-bg-adapter/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/persona-organizer/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/character-organizer/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/preset-integrity/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/parser-hardening/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/toolchain-hardening/manifest.cjs')),
    ].map((pack) => ({
        targets: DEFAULT_TARGETS,
        ...pack,
    }))
}

function resolveProfile(profileId) {
    const profile = PROFILES[profileId]
    if (!profile) throw new Error(`Unknown profile: ${profileId}`)
    return profile
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
    validateProfileSelection,
    validateProfileTransition,
}
