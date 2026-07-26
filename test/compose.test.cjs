'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
    PatchCompositionError,
    analyzePair,
    applyUnit,
    buildPlan,
    compose,
    revertUnit,
} = require('../src/compose.cjs')

function insert(id, file, anchor, content, where = 'after', extra = {}) {
    return { id, file, type: 'insert', anchor, content, where, ...extra }
}

function replace(id, file, anchor, content, extra = {}) {
    return { id, file, type: 'replace', anchor, content, ...extra }
}

test('units in different files are independent', () => {
    const a = insert('a', 'a.ts', 'A\n', 'one')
    const b = insert('b', 'b.ts', 'B\n', 'two')
    assert.deepEqual(analyzePair('unused', a, b), { kind: 'independent' })
})

test('disjoint insertions in one file commute without an ordering edge', () => {
    const base = 'A\nB\n'
    const a = insert('a', 'x.ts', 'A\n', 'one')
    const b = insert('b', 'x.ts', 'B\n', 'two')
    const analysis = analyzePair(base, a, b)
    assert.equal(analysis.kind, 'commutative')
    const plan = buildPlan([b, a], new Map([['x.ts', base]]))
    assert.deepEqual(plan.collisions, [])
    assert.deepEqual(plan.order, ['a', 'b'])
})

test('structural collision infers the only valid order', () => {
    const base = 'const value = BASE\n'
    const a = replace('a', 'x.ts', 'BASE', 'const nested = INNER')
    const b = replace('b', 'x.ts', 'INNER', '42')
    const analysis = analyzePair(base, a, b)
    assert.deepEqual(
        { kind: analysis.kind, before: analysis.before, after: analysis.after },
        { kind: 'ordered', before: 'a', after: 'b' },
    )
    const result = compose([b, a], new Map([['x.ts', base]]))
    assert.deepEqual(result.order, ['a', 'b'])
    assert.match(result.outputs.get('x.ts'), /42/)
})

test('different valid results require an explicit order', () => {
    const base = 'ANCHOR'
    const a = insert('a', 'x.ts', 'ANCHOR', 'A', 'after')
    const b = insert('b', 'x.ts', 'ANCHOR', 'B', 'after')
    assert.equal(analyzePair(base, a, b).kind, 'ambiguous')
    assert.throws(
        () => buildPlan([a, b], new Map([['x.ts', base]])),
        (error) => error instanceof PatchCompositionError && error.code === 'AMBIGUOUS_ORDER',
    )

    const orderedA = { ...a, before: ['b'] }
    const plan = buildPlan([orderedA, b], new Map([['x.ts', base]]))
    assert.deepEqual(plan.order, ['a', 'b'])
})

test('cycles are rejected', () => {
    const a = insert('a', 'a.ts', 'A', 'one', 'after', { after: ['b'] })
    const b = insert('b', 'b.ts', 'B', 'two', 'after', { after: ['a'] })
    assert.throws(
        () => buildPlan([a, b], new Map([['a.ts', 'A'], ['b.ts', 'B']])),
        (error) => error instanceof PatchCompositionError && error.code === 'ORDER_CYCLE',
    )
})

test('declared dependency chains are composed as a whole', () => {
    const base = 'BASE'
    const a = replace('a', 'x.ts', 'BASE', 'MIDDLE')
    const b = replace('b', 'x.ts', 'MIDDLE', 'INNER', { requires: ['a'] })
    const c = replace('c', 'x.ts', 'INNER', 'DONE', { requires: ['b'] })
    const result = compose([c, b, a], new Map([['x.ts', base]]))
    assert.deepEqual(result.order, ['a', 'b', 'c'])
    assert.match(result.outputs.get('x.ts'), /DONE/)
})

test('apply and revert round-trip byte exactly', () => {
    const base = 'before\nANCHOR\nafter\n'
    for (const unit of [
        insert('insert-before', 'x.ts', 'ANCHOR\n', 'inserted', 'before'),
        insert('insert-after', 'x.ts', 'ANCHOR\n', 'inserted', 'after'),
        replace('replace', 'x.ts', 'ANCHOR', 'replacement'),
    ]) {
        const applied = applyUnit(base, unit)
        assert.equal(revertUnit(applied, unit), base)
    }
})

test('owned files refuse to overwrite unrelated content', () => {
    const unit = { id: 'owned', file: 'new.ts', type: 'owned', content: 'owned\n' }
    assert.equal(applyUnit(null, unit), 'owned\n')
    assert.equal(revertUnit('owned\n', unit), null)
    assert.throws(
        () => applyUnit('user content\n', unit),
        (error) => error instanceof PatchCompositionError && error.code === 'OWNED_COLLISION',
    )
})

test('legacy managed blocks are adopted and reverted exactly', () => {
    const base = 'before\nANCHOR\nafter\n'
    const managed = '/* BG-PRESERVE:START legacy-token */\nlegacy\n/* BG-PRESERVE:END */\n'
    const unit = {
        id: 'legacy',
        file: 'x.ts',
        type: 'insert',
        where: 'after',
        anchor: 'ANCHOR\n',
        managed,
        markerNeedle: 'legacy-token',
    }
    const applied = applyUnit(base, unit)
    assert.equal(applied, `before\nANCHOR\n${managed}after\n`)
    assert.equal(applyUnit(applied, unit), applied)
    assert.equal(revertUnit(applied, unit), base)
    assert.throws(
        () => applyUnit(applied.replace('legacy\n', 'changed\n'), unit),
        (error) => error instanceof PatchCompositionError && error.code === 'MARKER_DRIFT',
    )
})

test('legacy first-anchor policy is explicit and scoped to that unit', () => {
    const base = 'A A'
    const strict = replace('strict', 'x.ts', 'A', 'B')
    assert.throws(
        () => applyUnit(base, strict),
        (error) => error instanceof PatchCompositionError && error.code === 'ANCHOR_COUNT',
    )
    const legacy = { ...strict, id: 'legacy-first', anchorPolicy: 'first' }
    assert.match(applyUnit(base, legacy), /POCKETRISU-PATCH:legacy-first/)
})
