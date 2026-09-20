'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { compose, revertUnit } = require('../src/compose.cjs')
const { loadCatalog } = require('../src/catalog.cjs')

const pack = loadCatalog().find((entry) => entry.id === 'log-load-performance')

test('log loading performance is an exact 1.10 complete-delivery owner', () => {
    assert.ok(pack)
    assert.equal(pack.userSelectable, true)
    assert.deepEqual(pack.targets.pocketrisu, { verified: ['1.10.0'], reviewing: [] })
    assert.equal(pack.units.length, 2)
})

test('request storage aggregate index composes and reverts exactly', () => {
    const baseline = `function createRequestLogs() {
    db.exec(\`
        CREATE INDEX IF NOT EXISTS idx_requests_category ON requests(category);
    \`)
}
`
    const files = new Map([
        ['server/node/request-logs.cjs', baseline],
        ['server/node/requestLogStorageIndex.test.ts', null],
    ])
    const plan = compose(pack.units, files)
    assert.deepEqual(plan.collisions, [])
    assert.match(plan.outputs.get('server/node/request-logs.cjs'), /idx_requests_size_bytes/)
    assert.match(plan.outputs.get('server/node/requestLogStorageIndex.test.ts'), /COVERING INDEX/)

    const byId = new Map(pack.units.map((unit) => [unit.id, unit]))
    const reverted = new Map(plan.outputs)
    for (const id of [...plan.order].reverse()) {
        const unit = byId.get(id)
        reverted.set(unit.file, revertUnit(reverted.get(unit.file), unit))
    }
    assert.equal(reverted.get('server/node/request-logs.cjs'), baseline)
    assert.equal(reverted.get('server/node/requestLogStorageIndex.test.ts'), null)
})
