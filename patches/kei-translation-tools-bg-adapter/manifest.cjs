'use strict'

const {
    createTranslationToolsAdapterManifest,
} = require('../kei-translation-tools-core/adapter-manifest.cjs')

module.exports = createTranslationToolsAdapterManifest({
    id: 'kei-translation-tools-bg-adapter',
    title: 'PocketRisu Kei translation tools bg-preserve adapter',
    adapter: 'bg',
    bgPreserve: true,
    verified1100: true,
})
