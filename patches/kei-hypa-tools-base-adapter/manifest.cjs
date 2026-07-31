'use strict'

const {
    createHypaToolsAdapterManifest,
} = require('../kei-hypa-tools-core/adapter-manifest.cjs')

module.exports = createHypaToolsAdapterManifest({
    id: 'kei-hypa-tools-base-adapter',
    title: 'PocketRisu Kei HypaMemory tools base adapter',
    adapter: 'base',
    bgPreserve: false,
})
