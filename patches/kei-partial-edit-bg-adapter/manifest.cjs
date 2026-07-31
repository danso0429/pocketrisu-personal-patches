'use strict'

const {
    createPartialEditAdapterManifest,
} = require('../kei-partial-edit-core/adapter-manifest.cjs')

module.exports = createPartialEditAdapterManifest({
    id: 'kei-partial-edit-bg-adapter',
    title: 'PocketRisu Kei partial edit bg-preserve adapter',
    adapter: 'bg',
    bgPreserve: true,
})
