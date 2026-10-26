'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

function resolver() {
    let loaded
    try {
        loaded = require('../scripts/lib/subset-closure.cjs')
    } catch {
        loaded = null
    }
    assert.equal(
        typeof loaded?.resolveSubsetClosure,
        'function',
        'expected scripts/lib/subset-closure.cjs to export resolveSubsetClosure',
    )
    return loaded.resolveSubsetClosure
}

function pack(id, options = {}) {
    return {
        id,
        version: '1',
        targets: {
            pocketrisu: { verified: ['1.10.0'], reviewing: ['1.16.1'] },
        },
        units: [],
        ...options,
    }
}

function unit(id, requires = [], versions = ['1.16.1']) {
    return {
        id,
        file: `src/${id}.ts`,
        type: 'owned',
        content: `${id}\n`,
        requires,
        targetVersions: { pocketrisu: versions },
    }
}

function ids(entries) {
    return entries.map((entry) => typeof entry === 'string' ? entry : entry.id)
}

test.describe('[E2-1a] Subset verification harness', () => {
    test('[new] reaches a fixpoint across pack, autoWhen, and unit-owner dependencies', () => {
        const catalog = [
            pack('PackA', { units: [unit('a', ['U1'])] }),
            pack('PackB', { userSelectable: false, units: [unit('U1')] }),
            pack('PackC', { autoWhen: { any: ['PackB'] }, requires: ['PackD'] }),
            pack('PackD', { units: [unit('d', ['U2'])] }),
            pack('PackE', { units: [unit('U2')] }),
        ]
        const result = resolver()({ catalog, packIds: ['PackA'], target: '1.16.1' })
        assert.deepEqual(ids(result.packs), ['PackA', 'PackB', 'PackC', 'PackD', 'PackE'])
        assert.deepEqual(ids(result.units).sort(), ['U1', 'U2', 'a', 'd'])
    })

    test('[new] terminates cycles using the resolver cycle contract', () => {
        const catalog = [
            pack('PackA', { requires: ['PackB'] }),
            pack('PackB', { requires: ['PackA'] }),
        ]
        const resolve = resolver()
        assert.throws(
            () => resolve({ catalog, packIds: ['PackA'], target: '1.16.1' }),
            (error) => error?.code === 'PACK_DEPENDENCY_CYCLE',
        )
    })

    test('[new] ignores requirements of units outside the requested target', () => {
        const catalog = [
            pack('PackA', { units: [
                unit('old', ['old-owner'], ['1.10.0']),
                unit('current'),
            ] }),
            pack('PackZ', { units: [unit('old-owner', [], ['1.10.0'])] }),
        ]
        const result = resolver()({ catalog, packIds: ['PackA'], target: '1.16.1' })
        assert.deepEqual(ids(result.packs), ['PackA'])
        assert.deepEqual(ids(result.units), ['current'])
    })

    test('[new] rejects a missing or target-ineligible unit owner', () => {
        for (const catalog of [
            [pack('PackA', { units: [unit('a', ['missing'])] })],
            [
                pack('PackA', { units: [unit('a', ['old-owner'])] }),
                pack('PackB', { units: [unit('old-owner', [], ['1.10.0'])] }),
            ],
        ]) {
            const resolve = resolver()
            assert.throws(
                () => resolve({ catalog, packIds: ['PackA'], target: '1.16.1' }),
                (error) => error?.code === 'SUBSET_UNIT_OWNER',
            )
        }
    })

    test('[new] rejects an ambiguous unit owner anywhere in the catalog', () => {
        const catalog = [
            pack('PackA', { units: [unit('a', ['shared'])] }),
            pack('PackB', { units: [unit('shared')] }),
            pack('PackC', { units: [unit('shared')] }),
        ]
        const resolve = resolver()
        assert.throws(
            () => resolve({ catalog, packIds: ['PackA'], target: '1.16.1' }),
            (error) => error?.code === 'SUBSET_UNIT_OWNER',
        )
    })

    test('[new] exposes a transitive pack that lacks the target for harness rejection', () => {
        const catalog = [
            pack('PackA', { requires: ['PackB'] }),
            pack('PackB', {
                targets: { pocketrisu: { verified: ['1.10.0'], reviewing: [] } },
            }),
        ]
        const result = resolver()({ catalog, packIds: ['PackA'], target: '1.16.1' })
        assert.deepEqual(ids(result.packs), ['PackA', 'PackB'])
    })
})
