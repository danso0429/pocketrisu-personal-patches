'use strict'

// The private repository remains the source of truth. Enable this channel only
// when a public, allowlisted, notification-only feed has been published.
module.exports = Object.freeze({
    schema: 1,
    url: null,
    allowedFeedHosts: [],
    allowedReleaseHosts: [],
    cacheMaxAgeMs: 24 * 60 * 60 * 1000,
    timeoutMs: 2500,
    maxBytes: 16 * 1024,
})
