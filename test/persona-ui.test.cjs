'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(path.join(
    __dirname,
    '../patches/persona-organizer/files/src/lib/Setting/listedPersona.svelte',
), 'utf8')

test('persona native drag does not compete with the iOS long-press controller', () => {
    assert.match(source, /matchMedia\("\(pointer: coarse\)"\)/)
    assert.match(source, /draggable=\{!isTouchDevice \? "true" : undefined\}/)
    assert.match(source, /ontouchstart=\{isTouchDevice \?/)
    assert.doesNotMatch(source, /draggable="true"/)
})
