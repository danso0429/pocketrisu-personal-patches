'use strict'

const {
    createChatRenderAdapterManifest,
} = require('../kei-chat-render-core/adapter-manifest.cjs')

module.exports = createChatRenderAdapterManifest({
    id: 'kei-chat-render-base-adapter',
    title: 'PocketRisu Kei chat render base adapter',
    adapter: 'base',
    bgPreserve: false,
})
