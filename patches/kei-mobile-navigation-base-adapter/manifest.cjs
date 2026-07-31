'use strict'

const {
    createMobileNavigationAdapterManifest,
} = require('../kei-mobile-navigation-core/adapter-manifest.cjs')

module.exports = createMobileNavigationAdapterManifest({
    id: 'kei-mobile-navigation-base-adapter',
    title: 'PocketRisu Kei mobile navigation base adapter',
    adapter: 'base',
    lazyChat: false,
})
