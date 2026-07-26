'use strict'

const fs = require('node:fs')
const path = require('node:path')

const PROFILES = Object.freeze({
    features: {
        id: 'features',
        description: 'Lazy chat synchronization, startup cache, and persona organization; bg-preserve stays external.',
        defaults: ['lazy-chat-sync', 'persona-organizer'],
        allowed: ['lazy-chat-sync', 'persona-organizer'],
        required: [],
    },
    all: {
        id: 'all',
        description: 'Unified bg-preserve, lazy chat synchronization, startup cache, and persona organization.',
        defaults: ['bg-preserve', 'lazy-chat-sync', 'lazy-chat-bg-adapter', 'persona-organizer'],
        allowed: ['bg-preserve', 'lazy-chat-sync', 'lazy-chat-bg-adapter', 'persona-organizer'],
        required: ['bg-preserve', 'lazy-chat-bg-adapter'],
    },
})

function loadCatalog(repositoryRoot = path.resolve(__dirname, '..')) {
    return [
        JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'patches/bg-preserve.json'), 'utf8')),
        require(path.join(repositoryRoot, 'patches/startup-cache/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/lazy-chat-sync/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/lazy-chat-bg-adapter/manifest.cjs')),
        require(path.join(repositoryRoot, 'patches/persona-organizer/manifest.cjs')),
    ]
}

function resolveProfile(profileId) {
    const profile = PROFILES[profileId]
    if (!profile) throw new Error(`Unknown profile: ${profileId}`)
    return profile
}

function validateProfileSelection(profile, packIds) {
    const selected = new Set(packIds)
    for (const id of selected) {
        if (!profile.allowed.includes(id)) {
            throw new Error(`${profile.id} profile cannot manage pack ${id}`)
        }
    }
    for (const id of profile.required) {
        if (!selected.has(id)) {
            throw new Error(`${profile.id} profile requires pack ${id}`)
        }
    }
}

function validateProfileTransition(profile, previousState) {
    if (!previousState || previousState.profile === profile.id) return
    if (profile.id === 'all' && previousState.profile === 'features') return
    throw new Error(
        `${profile.id} patcher cannot take ownership of ${previousState.profile} state; `
        + `use the ${previousState.profile} patcher or upgrade with the all patcher`,
    )
}

module.exports = {
    PROFILES,
    loadCatalog,
    resolveProfile,
    validateProfileSelection,
    validateProfileTransition,
}
