'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

function validator() {
    let loaded
    try {
        loaded = require('../scripts/lib/target-coverage.cjs')
    } catch {
        loaded = null
    }
    assert.equal(
        typeof loaded?.validateTargetCoverage,
        'function',
        'expected scripts/lib/target-coverage.cjs to export validateTargetCoverage',
    )
    return loaded.validateTargetCoverage
}

function unit(id, target = '1.16.1') {
    return {
        id,
        file: `src/${id}.ts`,
        type: 'owned',
        content: `${id}\n`,
        targetVersions: { pocketrisu: [target] },
    }
}

function fixture() {
    const pack = {
        id: 'mapped-pack',
        version: '2',
        targets: {
            pocketrisu: { verified: ['1.10.0'], reviewing: ['1.16.1'] },
        },
        units: ['u1', 'u2a', 'u2b', 'u34', 'u7'].map((id) => unit(id)),
    }
    const baseline = {
        format: 1,
        packs: {
            'mapped-pack': {
                units110: ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'],
            },
        },
    }
    const coverage = {
        'mapped-pack': {
            '1.16.1': {
                from: '1.10.0',
                retained: ['u1'],
                replaced: {
                    u2: ['u2a', 'u2b'],
                    u3: ['u34'],
                    u4: ['u34'],
                },
                added: { u7: 'new target regression coverage' },
                retired: {
                    u5: 'upstream made this unnecessary',
                    u6: 'replaced by native behavior',
                },
            },
        },
    }
    return { catalog: [pack], baseline, coverage, packIds: ['mapped-pack'] }
}

function validate(mutator = () => {}) {
    const input = fixture()
    mutator(input)
    return validator()(input)
}

function violationsFor(result, unitId) {
    return result.violations.filter((violation) => violation.unitId === unitId)
}

test.describe('[E2-1a] Subset verification harness', () => {
    test('[new] accepts retained, split, merge, added, and retired coverage', () => {
        assert.deepEqual(validate(), { ok: true, violations: [] })
    })

    test('[new] reports both sides of a selected-unit set mismatch', () => {
        const extra = validate(({ catalog }) => catalog[0].units.push(unit('u_unmapped')))
        assert.equal(extra.ok, false)
        assert.equal(violationsFor(extra, 'u_unmapped').length > 0, true)
        assert.equal(violationsFor(extra, 'u_unmapped').every((entry) => entry.kind), true)

        const missing = validate(({ catalog }) => {
            catalog[0].units = catalog[0].units.filter(({ id }) => id !== 'u2a')
        })
        assert.equal(missing.ok, false)
        assert.equal(violationsFor(missing, 'u2a').length > 0, true)
    })

    test('[new] reports omitted and multiply categorized baseline units', () => {
        const result = validate(({ coverage }) => {
            const entry = coverage['mapped-pack']['1.16.1']
            entry.retained = []
            entry.retired.u2 = 'duplicate category on purpose'
        })
        assert.equal(result.ok, false)
        assert.equal(violationsFor(result, 'u1').length > 0, true)
        assert.equal(violationsFor(result, 'u2').length > 0, true)
    })

    test('[new] reports unknown old ids in every old-unit category', () => {
        for (const category of ['retained', 'replaced', 'retired']) {
            const result = validate(({ coverage }) => {
                const entry = coverage['mapped-pack']['1.16.1']
                if (category === 'retained') entry.retained.push('u_ghost')
                if (category === 'replaced') entry.replaced.u_ghost = ['ghost-new']
                if (category === 'retired') entry.retired.u_ghost = 'not in baseline'
            })
            assert.equal(result.ok, false, category)
            assert.equal(violationsFor(result, 'u_ghost').length > 0, true, category)
        }
    })

    test('[new] reports duplicate retained ids', () => {
        const result = validate(({ coverage }) => {
            coverage['mapped-pack']['1.16.1'].retained.push('u1')
        })
        assert.equal(result.ok, false)
        assert.equal(violationsFor(result, 'u1').length > 0, true)
    })

    test('[new] reports an added id that is also a replacement destination', () => {
        const result = validate(({ coverage }) => {
            coverage['mapped-pack']['1.16.1'].added.u2a = 'incorrectly called new'
        })
        assert.equal(result.ok, false)
        assert.equal(violationsFor(result, 'u2a').length > 0, true)
    })

    test('[new] rejects empty reasons for added and retired entries', () => {
        for (const category of ['added', 'retired']) {
            const result = validate(({ coverage }) => {
                const entry = coverage['mapped-pack']['1.16.1']
                if (category === 'added') entry.added.u7 = '   '
                else entry.retired.u5 = ''
            })
            assert.equal(result.ok, false, category)
            const id = category === 'added' ? 'u7' : 'u5'
            assert.equal(violationsFor(result, id).length > 0, true, category)
        }
    })

    test('[new] reports a declared non-baseline target without coverage', () => {
        const result = validate(({ coverage }) => delete coverage['mapped-pack']['1.16.1'])
        assert.equal(result.ok, false)
        assert.equal(result.violations.some((entry) => (
            entry.pack === 'mapped-pack'
            && entry.target === '1.16.1'
            && typeof entry.kind === 'string'
            && entry.kind.length > 0
        )), true)
    })
})
