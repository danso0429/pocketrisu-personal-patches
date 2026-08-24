'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const manifest = require('../patches/haejeok-chat-width-adapter/manifest.cjs')

function unit(id) {
    const found = manifest.units.find((entry) => entry.id === id)
    assert.ok(found, `missing unit ${id}`)
    return found
}

test('Small width is an internal Personal/native-width adapter', () => {
    assert.equal(manifest.id, 'haejeok-chat-width-adapter')
    assert.equal(manifest.userSelectable, false)
    assert.deepEqual(manifest.requires, ['personal-settings'])
    assert.deepEqual(manifest.autoWhen, { all: ['personal-settings'] })
    assert.ok(manifest.units.every((entry) =>
        entry.targetVersions?.pocketrisu?.length === 1
        && entry.targetVersions.pocketrisu[0] === '1.10.0'
    ))
})

test('only Small is added while Standard remains the normalization default', () => {
    const helper = unit('haejeok-chat-width-adapter:helper:1.10').content
    assert.match(helper, /'small' \| 'standard' \| 'wide' \| 'full'/)
    assert.match(helper, /default:\n\s+return 'standard'/)
    assert.match(
        unit('haejeok-chat-width-adapter:setting-option:1.10').content,
        /value: 'small'/,
    )
})

test('message, creator-note, and composer widths share the 600px contract', () => {
    assert.match(
        unit('haejeok-chat-width-adapter:chat-class:1.10').managed,
        /nodeOnlyStandardChatWidthClass/,
    )
    assert.match(
        unit('haejeok-chat-width-adapter:composer-class:1.10').content,
        /nodeOnlyStandardChatWidthClass/,
    )
    const css = unit('haejeok-chat-width-adapter:standard-css:1.10').managed
    assert.match(css, /no-chat-width-small.*37\.5rem/)
    assert.match(css, /nodeonly-chat-width-small.*37\.5rem/)
})

test('theme preset storage accepts Small without adding a second width field', () => {
    assert.match(
        unit('haejeok-chat-width-adapter:database-normalization:1.10').content,
        /normalizeNodeOnlyStandardChatWidth/,
    )
    assert.match(
        unit('haejeok-chat-width-adapter:preset-field-type:1.10').content,
        /NodeOnlyStandardChatWidth/,
    )
    assert.equal(manifest.units.some((entry) => /chatLimitSize/.test(
        `${entry.anchor ?? ''}${entry.content ?? ''}${entry.managed ?? ''}`,
    )), false)
})
