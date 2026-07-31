'use strict'

const {
    createChatRenderAdapterManifest,
} = require('../kei-chat-render-core/adapter-manifest.cjs')

module.exports = createChatRenderAdapterManifest({
    id: 'kei-chat-render-bg-adapter',
    title: 'PocketRisu Kei chat render bg-preserve adapter',
    adapter: 'bg',
    bgPreserve: true,
})
