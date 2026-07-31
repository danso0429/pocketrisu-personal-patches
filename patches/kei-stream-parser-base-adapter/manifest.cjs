'use strict'

const {
    createStreamAdapterManifest,
} = require('../kei-stream-parser-core/adapter-manifest.cjs')

module.exports = createStreamAdapterManifest({
    id: 'kei-stream-parser-base-adapter',
    title: 'PocketRisu Kei stream parser base adapter',
    adapter: 'base',
    bgPreserve: false,
})
