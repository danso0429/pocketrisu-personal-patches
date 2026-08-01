'use strict'

const {
    createTranslationToolsAdapterManifest,
} = require('../kei-translation-tools-core/adapter-manifest.cjs')

module.exports = createTranslationToolsAdapterManifest({
    id: 'kei-translation-tools-base-adapter',
    title: 'PocketRisu Kei translation tools base adapter',
    adapter: 'base',
    bgPreserve: false,
})
