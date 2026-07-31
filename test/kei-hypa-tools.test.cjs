'use strict'

const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const core = require('../patches/kei-hypa-tools-core/manifest.cjs')
const base = require('../patches/kei-hypa-tools-base-adapter/manifest.cjs')
const bg = require('../patches/kei-hypa-tools-bg-adapter/manifest.cjs')
const meta = require('../patches/pocketrisu-kei/manifest.cjs')
const { loadCatalog } = require('../src/catalog.cjs')
const { packEtag } = require('../src/manager.cjs')
const { resolveSelection } = require('../src/resolver.cjs')

const patchRoot = path.join(__dirname, '../patches/kei-hypa-tools-core')
const source = (relative) =>
    fs.readFileSync(path.join(patchRoot, relative), 'utf8')
const unitText = (unit) => unit.managed ?? unit.content ?? ''

test('K11 keeps one internal core and exactly one base/bg adapter', () => {
    assert.equal(core.id, 'kei-hypa-tools-core')
    assert.equal(base.id, 'kei-hypa-tools-base-adapter')
    assert.equal(bg.id, 'kei-hypa-tools-bg-adapter')
    assert.equal(core.userSelectable, false)
    assert.equal(base.userSelectable, false)
    assert.equal(bg.userSelectable, false)
    assert.deepEqual(base.requires, ['kei-hypa-tools-core'])
    assert.deepEqual(bg.requires, ['kei-hypa-tools-core', 'bg-preserve'])
    assert.deepEqual(base.autoWhen, {
        all: ['kei-hypa-tools-core'],
        none: ['bg-preserve'],
    })
    assert.deepEqual(bg.autoWhen, {
        all: ['kei-hypa-tools-core', 'bg-preserve'],
    })
    assert.deepEqual(base.conflicts, [
        'bg-preserve',
        'kei-hypa-tools-bg-adapter',
    ])
    assert.deepEqual(bg.conflicts, ['kei-hypa-tools-base-adapter'])
    assert.equal(meta.requires.includes(core.id), true)

    const catalog = loadCatalog()
    const absent = resolveSelection(catalog, ['bg-preserve'])
    assert.equal(absent.resolvedIds.includes(core.id), false)
    assert.equal(absent.resolvedIds.includes(base.id), false)
    assert.equal(absent.resolvedIds.includes(bg.id), false)

    const standalone = resolveSelection(catalog, ['pocketrisu-kei'])
    assert.equal(standalone.resolvedIds.includes(base.id), true)
    assert.equal(standalone.resolvedIds.includes(bg.id), false)

    const composed = resolveSelection(catalog, ['pocketrisu-kei', 'bg-preserve'])
    assert.equal(composed.resolvedIds.includes(base.id), false)
    assert.equal(composed.resolvedIds.includes(bg.id), true)
})

test('K11 owns only its deterministic selection and manual panel code', () => {
    assert.deepEqual(core.units.map((unit) => unit.file), [
        'src/lib/Others/HypaV3Modal/keiHypaManualSelection.ts',
        'src/lib/Others/HypaV3Modal/keiHypaManualSelection.test.ts',
        'src/lib/Others/HypaV3Modal/KeiHypaManualSummaryPanel.svelte',
        'src/lib/Others/HypaV3Modal/KeiHypaManualSummaryPanel.test.ts',
    ])
    const expectedHosts = [
        'src/lang/en.ts',
        'src/lang/ko.ts',
        'src/lib/Others/HypaV3Modal.svelte',
        'src/lib/Others/HypaV3Modal/modal-footer.svelte',
        'src/lib/Others/HypaV3Modal/modal-header.svelte',
        'src/lib/Others/HypaV3Modal/modal-summary-item.svelte',
        'src/lib/Others/HypaV3Modal/utils.ts',
    ]
    for (const adapter of [base, bg]) {
        assert.deepEqual(
            [...new Set(adapter.units.map((unit) => unit.file))].sort(),
            expectedHosts,
        )
        const managed = adapter.units.map(unitText).join('\n')
        assert.doesNotMatch(
            managed,
            /revenant|sendChat|bgOrchestrat|result.?claim|acknowledge|setCurrentChat|setDatabase/i,
        )
        assert.doesNotMatch(managed, /TagManagerModal\s*\/>|performSearch\s*=|delete\s+tag/i)
    }
})

test('K11 selection blocks gaps, ambiguous identities, and stale apply', () => {
    const helper = source(
        'files/src/lib/Others/HypaV3Modal/keiHypaManualSelection.ts',
    )
    const helperTests = source(
        'files/src/lib/Others/HypaV3Modal/keiHypaManualSelection.test.ts',
    )
    const panel = source(
        'files/src/lib/Others/HypaV3Modal/KeiHypaManualSummaryPanel.svelte',
    )
    const panelTests = source(
        'files/src/lib/Others/HypaV3Modal/KeiHypaManualSummaryPanel.test.ts',
    )

    assert.match(helper, /"orphaned-frontier"/)
    assert.match(helper, /"ambiguous-frontier"/)
    assert.match(helper, /"missing-message-id"/)
    assert.match(helper, /"duplicate-message-id"/)
    assert.match(helper, /Array\.from\(\{ length: endExclusive \}/)
    assert.match(helper, /candidate\.messageRef === selected\.messageRef/)
    assert.match(helper, /deriveHypaManualFrontier\(\{/)
    assert.match(helper, /current\.summaries\.length !== snapshot\.summaryCount/)
    assert.match(helper, /current\.presetRef !== snapshot\.presetRef/)
    assert.match(helper, /current\.presetSignature !== snapshot\.presetSignature/)
    assert.match(helperTests, /cannot manufacture a non-prefix selection/)
    assert.match(helperTests, /does not silently restart from the beginning/)
    assert.match(helperTests, /rejects replacement, content, frontier, greeting, and preset changes/)
    assert.match(helperTests, /later duplicate that makes an issued memo ambiguous/)
    assert.match(helperTests, /appended unique message outside the issued prefix/)

    assert.match(panel, /const result = await summarize\(input\)/)
    assert.match(panel, /activeOperation !== token/)
    assert.match(panel, /snapshotIsCurrent/)
    assert.match(panel, /chatMemos: state\.chatMemos as string\[\]/)
    assert.match(panel, /tags: \[\]/)
    assert.doesNotMatch(
        panel,
        /revenant|sendChat|bgOrchestrat|result.?claim|acknowledge|setCurrentChat|setDatabase/i,
    )
    assert.match(panelTests, /selects a contiguous frontier prefix/)
    assert.match(panelTests, /selected message changes during generation/)
    assert.match(panelTests, /refuses stale selection before preprocessing starts/)
    assert.match(panelTests, /refuses an in-place summary frontier change/)
    assert.match(panelTests, /blocks selection at a missing message id/)
    assert.match(panelTests, /active preset changes in place/)
    assert.match(panelTests, /not owned by the current chat/)
    assert.match(panelTests, /rerolls the exact captured input/)
    assert.match(panelTests, /coalesces duplicate generation activation/)
    assert.match(panelTests, /discards a late result after the panel is destroyed/)
})

test('K11 adapters retain existing management surfaces and correct CBS context', () => {
    for (const adapter of [base, bg]) {
        const processing = adapter.units.find((unit) =>
            unit.id.endsWith(':utils-message-processing'),
        )
        const modalOpen = adapter.units.find((unit) =>
            unit.id.endsWith(':modal-panel-open'),
        )
        const modalClose = adapter.units.find((unit) =>
            unit.id.endsWith(':modal-panel-close'),
        )
        assert.ok(processing)
        assert.ok(modalOpen)
        assert.ok(modalClose)
        assert.match(unitText(processing), /chatID: msgIndex/)
        assert.match(unitText(processing), /rmVar: true/)
        assert.match(unitText(processing), /firstmsg: firstMessage/)
        assert.match(unitText(processing), /deriveHypaManualFrontier/)
        assert.match(unitText(modalOpen), /KeiHypaManualSummaryPanel/)
        assert.match(unitText(modalClose), /\{\/if\}/)
        assert.match(
            adapter.units.map(unitText).join('\n'),
            /manualSummaryDisabled=\{bulkResummaryState !== null\}/,
        )
    }

    const touchedUnitIds = base.units.map((unit) => unit.id)
    assert.equal(touchedUnitIds.some((id) => id.includes('remove-tag')), false)
    assert.equal(touchedUnitIds.some((id) => id.includes('replace-search')), false)
    assert.equal(touchedUnitIds.some((id) => id.includes('replace-bulk')), false)
})

test('K11 payloads participate in ETags and retain pinned attribution', () => {
    for (const pack of [core, base, bg]) {
        const original = packEtag(pack)
        const changed = {
            ...pack,
            units: pack.units.map((unit, index) => index === 0
                ? {
                    ...unit,
                    [unit.type === 'owned' ? 'content' : 'managed']:
                        `${unitText(unit)}\n`,
                }
                : unit),
        }
        assert.notEqual(packEtag(changed), original)
        assert.equal(packEtag(pack), original)
    }

    const notices = fs.readFileSync(
        path.join(__dirname, '../THIRD_PARTY_NOTICES.md'),
        'utf8',
    )
    assert.match(notices, /cc1d1b195babd887577ebf943d5e82f01f58135c/)
    assert.match(notices, /HypaMemory adaptation/)
    assert.match(notices, /does not add Revenant/)
})
