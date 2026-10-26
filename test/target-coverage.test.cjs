'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { stableStringify } = require('../src/manager.cjs')

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

function hashUnit(candidate) {
    const { targetVersions: _targetVersions, ...unscoped } = candidate
    return crypto.createHash('sha256').update(stableStringify(unscoped)).digest('hex')
}

function retainedFixture({ retained = 'all', rewritten, baselineHash = true } = {}) {
    const scopedBaselineUnit = {
        id: 'u1',
        file: 'src/u1.ts',
        type: 'owned',
        content: 'baseline\n',
        requires: ['first', 'second'],
        targetVersions: { pocketrisu: ['1.10.0'] },
    }
    const { targetVersions: _targetVersions, ...unit116 } = scopedBaselineUnit
    const entry = {
        from: '1.10.0',
        retained,
        replaced: {},
        added: {},
        retired: {},
    }
    if (rewritten !== undefined) entry.rewritten = rewritten
    return {
        catalog: [{
            id: 'retained-pack',
            version: '1.0.1',
            targets: { pocketrisu: { verified: [], reviewing: ['1.16.1'] } },
            units: [unit116],
        }],
        coverage: { 'retained-pack': { '1.16.1': entry } },
        baseline: { format: 1, packs: { 'retained-pack': { units110: ['u1'] } } },
        unitBaseline: {
            format: 1,
            packs: { 'retained-pack': baselineHash ? { u1: hashUnit(scopedBaselineUnit) } : {} },
        },
        packIds: ['retained-pack'],
    }
}

function validateRetained(options, mutate = () => {}) {
    const input = retainedFixture(options)
    mutate(input)
    return validator()(input)
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

test.describe('[E2-1c] Make the six E2-1b packs 1.16.1-only', () => {
    test('[new] a 1.16.1-only pack without a units110 baseline reports missing-baseline', () => {
        const result = validator()({
            catalog: [{
                id: 'new-pack',
                version: '1.0.0',
                targets: { pocketrisu: { verified: [], reviewing: ['1.16.1'] } },
                units: [],
            }],
            coverage: {
                'new-pack': {
                    '1.16.1': {
                        from: '1.10.0',
                        retained: [],
                        replaced: {},
                        added: {},
                        retired: {},
                    },
                },
            },
            baseline: { format: 1, packs: {} },
            packIds: ['new-pack'],
        })
        assert.deepEqual(result.violations, [{
            pack: 'new-pack',
            target: '1.16.1',
            kind: 'missing-baseline',
            unitId: null,
        }])
    })

    test('[unchanged] unchanged retained units pass with explicit and all retention after targetVersions is removed', () => {
        for (const retained of [['u1'], 'all']) {
            assert.deepEqual(validateRetained({ retained }), { ok: true, violations: [] })
        }
    })

    test('[new] changes to each retained semantic field require a rewritten reason', () => {
        const changes = {
            content: (unit) => { unit.content = 'changed\n' },
            anchor: (unit) => { unit.anchor = 'new anchor' },
            file: (unit) => { unit.file = 'src/renamed.ts' },
            requires: (unit) => { unit.requires = ['second', 'first'] },
        }
        for (const [field, change] of Object.entries(changes)) {
            const result = validateRetained({}, ({ catalog }) => change(catalog[0].units[0]))
            assert.deepEqual(result.violations, [{
                pack: 'retained-pack',
                target: '1.16.1',
                kind: 'retained-unit-changed',
                unitId: 'u1',
            }], field)
        }
    })

    test('[unchanged] a rewritten reason permits both changed and unchanged retained units', () => {
        const unchanged = validateRetained({ rewritten: { u1: 'reviewed upstream rebase' } })
        assert.deepEqual(unchanged, { ok: true, violations: [] })
        const changed = validateRetained(
            { rewritten: { u1: 'adjusted anchor for 1.16.1' } },
            ({ catalog }) => { catalog[0].units[0].anchor = 'new anchor' },
        )
        assert.deepEqual(changed, { ok: true, violations: [] })
    })

    test('[new] rewritten keys outside retained are invalid for replaced, retired, added, and unknown ids', () => {
        const input = retainedFixture()
        input.baseline.packs['retained-pack'].units110.push('old-replaced', 'old-retired')
        input.catalog[0].units.push(
            { id: 'new-replacement', file: 'src/new.ts', type: 'owned', content: 'new\n' },
            { id: 'new-added', file: 'src/added.ts', type: 'owned', content: 'added\n' },
        )
        const entry = input.coverage['retained-pack']['1.16.1']
        entry.replaced = { 'old-replaced': ['new-replacement'] }
        entry.retired = { 'old-retired': 'removed upstream' }
        entry.added = { 'new-added': 'new regression test' }
        entry.rewritten = {
            'old-replaced': 'not retained',
            'old-retired': 'not retained',
            'new-added': 'not a baseline retained id',
            ghost: 'does not exist',
        }
        const result = validator()(input)
        assert.deepEqual(
            result.violations
                .filter(({ kind }) => kind === 'invalid-rewritten')
                .sort((left, right) => left.unitId.localeCompare(right.unitId)),
            Object.keys(entry.rewritten).map((unitId) => ({
                pack: 'retained-pack',
                target: '1.16.1',
                kind: 'invalid-rewritten',
                unitId,
            })).sort((left, right) => left.unitId.localeCompare(right.unitId)),
        )
    })

    test('[new] empty rewritten reasons report empty-reason and do not suppress changed content', () => {
        for (const reason of ['', '   ']) {
            const result = validateRetained(
                { rewritten: { u1: reason } },
                ({ catalog }) => { catalog[0].units[0].content = 'changed\n' },
            )
            assert.deepEqual(result.violations.sort((left, right) => left.kind.localeCompare(right.kind)), [
                {
                    pack: 'retained-pack',
                    target: '1.16.1',
                    kind: 'empty-reason',
                    unitId: 'u1',
                },
                {
                    pack: 'retained-pack',
                    target: '1.16.1',
                    kind: 'retained-unit-changed',
                    unitId: 'u1',
                },
            ].sort((left, right) => left.kind.localeCompare(right.kind)), JSON.stringify(reason))
        }
    })

    test('[unchanged] stable object-key ordering does not change a retained unit hash', () => {
        const result = validateRetained({}, ({ catalog }) => {
            const unit = catalog[0].units[0]
            catalog[0].units[0] = {
                requires: unit.requires,
                content: unit.content,
                type: unit.type,
                file: unit.file,
                id: unit.id,
            }
        })
        assert.deepEqual(result, { ok: true, violations: [] })
    })

    test('[new] array order remains significant to retained unit hashes', () => {
        const result = validateRetained({}, ({ catalog }) => {
            catalog[0].units[0].requires.reverse()
        })
        assert.deepEqual(result.violations, [{
            pack: 'retained-pack',
            target: '1.16.1',
            kind: 'retained-unit-changed',
            unitId: 'u1',
        }])
    })

    test('[new] a missing pack or unit hash reports retained-unit-changed without throwing', () => {
        for (const missing of ['pack', 'unit']) {
            const input = retainedFixture({ baselineHash: false })
            if (missing === 'pack') delete input.unitBaseline.packs['retained-pack']
            assert.doesNotThrow(() => validator()(input), missing)
            assert.deepEqual(validator()(input).violations, [{
                pack: 'retained-pack',
                target: '1.16.1',
                kind: 'retained-unit-changed',
                unitId: 'u1',
            }], missing)
        }
    })

    test('[unchanged] omitting unitBaseline skips retained content comparison', () => {
        const input = retainedFixture()
        delete input.unitBaseline
        input.catalog[0].units[0].content = 'changed without comparison\n'
        assert.deepEqual(validator()(input), { ok: true, violations: [] })
    })

    test('[new] rewritten structure is still checked when unitBaseline is omitted', () => {
        for (const [rewritten, expected] of [
            [[], { kind: 'invalid-rewritten', unitId: null }],
            [{ ghost: 'not retained' }, { kind: 'invalid-rewritten', unitId: 'ghost' }],
            [{ u1: ' ' }, { kind: 'empty-reason', unitId: 'u1' }],
        ]) {
            const input = retainedFixture({ rewritten })
            delete input.unitBaseline
            const result = validator()(input)
            assert.deepEqual(result.violations, [{
                pack: 'retained-pack',
                target: '1.16.1',
                ...expected,
            }])
        }
    })

    test('[unchanged] existing violation kinds retain exact coordinates on a 1.16.1-only pack', () => {
        const cases = [
            ['uncovered-old-unit', ({ coverage }) => { coverage['retained-pack']['1.16.1'].retained = [] }, 'u1'],
            ['multiple-categories', ({ coverage }) => { coverage['retained-pack']['1.16.1'].retired.u1 = 'duplicate' }, 'u1'],
            ['unmapped-selected-unit', ({ catalog }) => catalog[0].units.push({ id: 'extra', file: 'extra', type: 'owned', content: '' }), 'extra'],
            ['mapped-unit-not-selected', ({ catalog }) => { catalog[0].units = [] }, 'u1'],
            ['duplicate-replacement', ({ baseline, coverage }) => {
                baseline.packs['retained-pack'].units110.push('old')
                coverage['retained-pack']['1.16.1'].replaced.old = ['replacement', 'replacement']
            }, 'replacement'],
            ['unknown-old-unit', ({ coverage }) => { coverage['retained-pack']['1.16.1'].retained = ['u1', 'ghost'] }, 'ghost'],
            ['missing-coverage', ({ coverage }) => { delete coverage['retained-pack']['1.16.1'] }, null],
            ['empty-reason', ({ baseline, coverage }) => {
                baseline.packs['retained-pack'].units110.push('old')
                coverage['retained-pack']['1.16.1'].retired.old = ''
            }, 'old'],
        ]
        for (const [kind, mutate, unitId] of cases) {
            const input = retainedFixture()
            delete input.unitBaseline
            mutate(input)
            assert.deepEqual(
                validator()(input).violations.find((violation) => violation.kind === kind),
                { pack: 'retained-pack', target: '1.16.1', kind, unitId },
                kind,
            )
        }
    })
})
