'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { applyUnit, revertUnit } = require('../src/compose.cjs')
const units = require('../patches/lazy-chat-bg-adapter/recovery-read-units.cjs')([])
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

test('maintained capability replacement returns the consumed value after composition', async () => {
    const unit = units.find(unit => unit.id === 'lazy-chat-bg-adapter:recovery-read:body-response-2:1.10')
    const base = 'return await response.json()'
    const output = applyUnit(base, unit)
    let reads = 0
    const expected = { contract: 'bg_orchestration_capabilities.v1', inputCommandVersion: 1 }
    const result = await new AsyncFunction('response', 'readRecoveryJson', output)(
        { json: async () => { reads++; return expected } }, response => response.json(),
    )
    assert.equal(result, expected)
    assert.equal(reads, 1)
    assert.equal(applyUnit(output, unit), output)
    assert.equal(revertUnit(output, unit), base)
})

test('a multiline expression marker can change a restricted return despite exact revert', async () => {
    const unit = { id: 'return-control', file: 'control.js', type: 'replace',
        anchor: 'await response.json()', content: 'await response.json()' }
    const base = 'return await response.json()'
    const output = applyUnit(base, unit)
    let reads = 0
    assert.equal(await new AsyncFunction('response', output)({ json: async () => { reads++; return 1 } }), undefined)
    assert.equal(reads, 0)
    assert.equal(revertUnit(output, unit), base)
})
