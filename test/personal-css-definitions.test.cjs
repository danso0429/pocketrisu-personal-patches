'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const fixture = require('./fixtures/personal-appearance-v022.json')
const root = path.join(__dirname, '../patches/personal-settings/settings/appearance')
const text = fs.readFileSync(path.join(root, 'files/src/ts/personalSettings/cssToggleDefinitions.ts'), 'utf8')
const definitions = JSON.parse(text.slice(text.indexOf('= [') + 2))

test('the editable registry preserves every former static rule exactly', () => {
    const staticDefinitions = definitions.filter(d => !['composer.textSendIcon', 'visibility.hideJailbreakToggle'].includes(d.id))
    assert.equal(staticDefinitions.length, 8)
    for (const definition of staticDefinitions) {
        // Revision 2 chat rules differ from their former static rules only by
        // dropping the Standard-theme scope, so they reach every theme's chat text.
        const former = definition.revision === 2
            ? definition.css.replaceAll('.default-chat-screen .risu-chat', '.default-chat-screen.nodeonly-standard .risu-chat')
            : definition.css
        assert.ok(fixture.stylesheet.includes(former), definition.id)
    }
    assert.deepEqual(definitions.filter(d => d.revision === 2).map(d => d.id), ['chat.alignment', 'chat.keepKoreanWords', 'chat.wrapCodeBlocks'])
    for (const definition of definitions.filter(d => d.id.startsWith('chat.'))) assert.doesNotMatch(definition.css, /nodeonly-standard/)
    assert.deepEqual(definitions.map(d => d.token), fixture.tokens)
    assert.equal(new Set(definitions.map(d => d.id)).size, definitions.length)
})
test('two former render effects use stable CSS hooks without replacing send/stop handlers', () => {
    const units = require('../patches/personal-settings/settings/appearance/editor-units.cjs')
    const send = units.find(u => u.id === 'personal-settings:editor-hook-send-icon-render')
    assert.match(send.managed, /data-personal-send-default/)
    assert.match(send.managed, /data-personal-send-text/)
    assert.doesNotMatch(send.managed, /onclick|sendChat|abort|stop/)
    assert.equal(units.filter(u => u.id.startsWith('personal-settings:editor-hook-jailbreak')).length, fixture.jailbreakBranches)
    for (const unit of units) assert.deepEqual(unit.targetVersions, { pocketrisu: ['1.10.0'] })
})
