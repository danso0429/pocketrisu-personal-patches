'use strict'

const {
    createMobileNavigationAdapterManifest,
} = require('../kei-mobile-navigation-core/adapter-manifest.cjs')

module.exports = createMobileNavigationAdapterManifest({
    id: 'kei-mobile-navigation-lazy-adapter',
    title: 'PocketRisu Kei mobile navigation lazy-chat adapter',
    adapter: 'lazy',
    lazyChat: true,
    verified1100: true,
})
