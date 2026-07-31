'use strict'

const {
    createPartialEditAdapterManifest,
} = require('../kei-partial-edit-core/adapter-manifest.cjs')

module.exports = createPartialEditAdapterManifest({
    id: 'kei-partial-edit-base-adapter',
    title: 'PocketRisu Kei partial edit base adapter',
    adapter: 'base',
    bgPreserve: false,
})
