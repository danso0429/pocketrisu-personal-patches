'use strict'

const {
    createStreamAdapterManifest,
} = require('../kei-stream-parser-core/adapter-manifest.cjs')

module.exports = createStreamAdapterManifest({
    id: 'kei-stream-parser-bg-adapter',
    title: 'PocketRisu Kei stream parser bg-preserve adapter',
    adapter: 'bg',
    bgPreserve: true,
    verified1100: true,
})
