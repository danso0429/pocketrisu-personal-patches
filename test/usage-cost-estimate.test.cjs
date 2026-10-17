'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { compose, revertUnit } = require('../src/compose.cjs');
const { loadCatalog } = require('../src/catalog.cjs');
const pack = loadCatalog().find(entry => entry.id === 'usage-cost-estimate');

test('usage cost is a complete-delivery exact target with a reversible migration boundary', () => {
    assert.equal(pack.userSelectable, true);
    assert.deepEqual(pack.targets.pocketrisu, { verified: ['1.10.0'], reviewing: [] });
    // The migration unit changes source only; revert never drops a user-data column.
    const unit = pack.units.find(unit => unit.id.includes('migration-before-statements'));
    const files = new Map([[unit.file, unit.anchor]]);
    const plan = compose([{ ...unit, after: [] }], files);
    assert.equal(revertUnit(plan.outputs.get(unit.file), unit), unit.anchor);
    assert.ok(!pack.units.some(unit => /DROP TABLE|DROP COLUMN|DELETE FROM usage/.test(unit.content ?? unit.managed ?? '')));
});

test('usage panel compact counts use K/M suffixes regardless of browser locale', () => {
    const panel = require('node:fs').readFileSync(require('node:path').join(
        __dirname,
        '../patches/usage-cost-estimate/files-1.10/src/lib/Setting/Pages/UsageCostPanel.svelte',
    ), 'utf8');
    assert.match(panel, /const compact = new Intl\.NumberFormat\('en-US', \{ notation: 'compact', maximumFractionDigits: 1 \}\)/);
    const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
    assert.equal(compact.format(123456), '123.5K');
    assert.equal(compact.format(1234567), '1.2M');
});
