'use strict'

const {
    createHypaToolsAdapterManifest,
} = require('../kei-hypa-tools-core/adapter-manifest.cjs')

module.exports = createHypaToolsAdapterManifest({
    id: 'kei-hypa-tools-bg-adapter',
    title: 'PocketRisu Kei HypaMemory tools bg-preserve adapter',
    adapter: 'bg',
    bgPreserve: true,
})
