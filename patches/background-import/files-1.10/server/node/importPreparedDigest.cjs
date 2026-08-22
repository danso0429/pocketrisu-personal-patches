'use strict'

const crypto = require('node:crypto')

function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue)
    if (value && typeof value === 'object' && !Buffer.isBuffer(value) && !(value instanceof Uint8Array)) {
        return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]))
    }
    return value
}

function preparedDigestFor(kind, format, entity, assets) {
    const digestAssets = (assets ?? []).map(({ key, bytes, sha256 }) => ({ key, bytes, sha256 }))
    return crypto.createHash('sha256').update(JSON.stringify(stableValue({
        kind,
        format,
        entity,
        assets: digestAssets,
    }))).digest('hex')
}

function digestPrepared(prepared) {
    return preparedDigestFor(prepared?.kind, prepared?.format, prepared?.entity, prepared?.assets)
}

module.exports = { digestPrepared, preparedDigestFor, stableValue }
