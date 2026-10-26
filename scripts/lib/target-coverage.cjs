'use strict'

// Maintainer-only coverage validator. It checks that every PocketRisu target a
// pack declares besides the 1.10.0 baseline accounts for each baseline unit
// exactly once (retained, replaced or retired) and that the units the new
// target selects are exactly the retained, replacement and added units.
// With a unit baseline (test/fixtures/target-baseline-1.10.0-units.json) it
// also checks that each retained unit not listed in `rewritten` still equals
// its 1.10.0 definition without `targetVersions`.
// The catalog, manager, staging and installer modules must not import it.

const crypto = require('node:crypto')
const { stableStringify, unitMatchesTarget } = require('../../src/manager.cjs')

const BASELINE_TARGET = '1.10.0'
const PACKAGE_NAME = 'pocketrisu'

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function nonEmptyReason(value) {
    return typeof value === 'string' && value.trim().length > 0
}

function declaredTargets(pack) {
    const declaration = pack.targets?.[PACKAGE_NAME] ?? {}
    return [...new Set([
        ...(Array.isArray(declaration.verified) ? declaration.verified : []),
        ...(Array.isArray(declaration.reviewing) ? declaration.reviewing : []),
    ])]
}

function unscopedUnitHash(unit) {
    const { targetVersions: _targetVersions, ...unscoped } = unit
    return crypto.createHash('sha256').update(stableStringify(unscoped)).digest('hex')
}

function validateEntry({ pack, target, entry, baselineIds, unitHashes, report }) {
    if (!isPlainObject(entry)) {
        report('invalid-coverage-entry', null)
        return
    }
    if (entry.from !== BASELINE_TARGET) report('invalid-from', null)

    const oldIds = new Set(baselineIds)
    // Old id -> number of categories that list it.
    const categoryCount = new Map()
    const countCategory = (id) => categoryCount.set(id, (categoryCount.get(id) ?? 0) + 1)

    let retained = []
    if (entry.retained === 'all') {
        retained = [...baselineIds]
    } else if (Array.isArray(entry.retained)) {
        const seen = new Set()
        for (const id of entry.retained) {
            if (typeof id !== 'string' || !id) {
                report('invalid-unit-id', null)
                continue
            }
            if (seen.has(id)) {
                report('duplicate-retained', id)
                continue
            }
            seen.add(id)
            retained.push(id)
        }
    } else {
        report('invalid-retained', null)
    }

    const replaced = isPlainObject(entry.replaced) ? entry.replaced : null
    if (!replaced) report('invalid-replaced', null)
    const added = isPlainObject(entry.added) ? entry.added : null
    if (!added) report('invalid-added', null)
    const retired = isPlainObject(entry.retired) ? entry.retired : null
    if (!retired) report('invalid-retired', null)

    for (const id of retained) {
        if (!oldIds.has(id)) report('unknown-old-unit', id)
        countCategory(id)
    }

    const replacementIds = new Set()
    for (const [id, targets] of Object.entries(replaced ?? {})) {
        if (!oldIds.has(id)) report('unknown-old-unit', id)
        countCategory(id)
        if (
            !Array.isArray(targets)
            || targets.length === 0
            || targets.some((value) => typeof value !== 'string' || !value)
        ) {
            report('invalid-replacement', id)
            continue
        }
        const seen = new Set()
        const duplicates = new Set()
        for (const value of targets) {
            if (seen.has(value) && !duplicates.has(value)) {
                duplicates.add(value)
                report('duplicate-replacement', value)
            }
            seen.add(value)
            replacementIds.add(value)
        }
    }

    for (const [id, reason] of Object.entries(retired ?? {})) {
        if (!oldIds.has(id)) report('unknown-old-unit', id)
        countCategory(id)
        if (!nonEmptyReason(reason)) report('empty-reason', id)
    }

    for (const [id, reason] of Object.entries(added ?? {})) {
        if (!nonEmptyReason(reason)) report('empty-reason', id)
        if (replacementIds.has(id)) report('added-replacement-overlap', id)
    }

    for (const id of baselineIds) {
        const count = categoryCount.get(id) ?? 0
        if (count === 0) report('uncovered-old-unit', id)
        else if (count > 1) report('multiple-categories', id)
    }

    const expected = new Set([
        ...retained,
        ...replacementIds,
        ...Object.keys(added ?? {}),
    ])
    const identity = { packageName: PACKAGE_NAME, packageVersion: target }
    const selected = new Set(
        pack.units
            .filter((unit) => unitMatchesTarget(unit, identity))
            .map((unit) => unit.id),
    )
    for (const id of selected) {
        if (!expected.has(id)) report('unmapped-selected-unit', id)
    }
    for (const id of expected) {
        if (!selected.has(id)) report('mapped-unit-not-selected', id)
    }

    // Retained units whose content was changed on purpose, with a reason.
    // An id that is also replaced or retired does not keep its unit, so it
    // cannot be rewritten (`retained: 'all'` lists every baseline id).
    const retainedIds = new Set(retained.filter((id) =>
        !Object.hasOwn(replaced ?? {}, id) && !Object.hasOwn(retired ?? {}, id)
    ))
    const rewrittenIds = new Set()
    if (entry.rewritten !== undefined) {
        if (!isPlainObject(entry.rewritten)) {
            report('invalid-rewritten', null)
        } else {
            for (const [id, reason] of Object.entries(entry.rewritten)) {
                if (!retainedIds.has(id)) {
                    report('invalid-rewritten', id)
                    continue
                }
                if (!nonEmptyReason(reason)) {
                    report('empty-reason', id)
                    continue
                }
                rewrittenIds.add(id)
            }
        }
    }

    if (unitHashes === null) return
    const selectedById = new Map(
        pack.units
            .filter((unit) => unitMatchesTarget(unit, identity))
            .map((unit) => [unit.id, unit]),
    )
    for (const id of retainedIds) {
        if (rewrittenIds.has(id)) continue
        const unit = selectedById.get(id)
        // A retained unit that the target does not select is already
        // reported as mapped-unit-not-selected.
        if (!unit) continue
        const expectedHash = unitHashes[id]
        if (typeof expectedHash !== 'string' || unscopedUnitHash(unit) !== expectedHash) {
            report('retained-unit-changed', id)
        }
    }
}

function validateTargetCoverage({ catalog, coverage, baseline, packIds, unitBaseline }) {
    const violations = []
    const byId = new Map((catalog ?? []).map((pack) => [pack.id, pack]))
    const baselinePacks = isPlainObject(baseline?.packs) ? baseline.packs : {}

    for (const packId of [...new Set(packIds ?? [])]) {
        const pack = byId.get(packId)
        if (!pack) {
            violations.push({ pack: packId, target: null, kind: 'unknown-pack', unitId: null })
            continue
        }
        const targets = declaredTargets(pack)
        const baselineEntry = baselinePacks[packId]
        let baselineIds = []
        if (Array.isArray(baselineEntry?.units110)) {
            baselineIds = baselineEntry.units110
        } else {
            for (const target of targets) {
                violations.push({ pack: packId, target, kind: 'missing-baseline', unitId: null })
            }
        }
        let unitHashes = null
        if (unitBaseline !== undefined && unitBaseline !== null) {
            const packHashes = isPlainObject(unitBaseline?.packs)
                ? unitBaseline.packs[packId]
                : undefined
            unitHashes = isPlainObject(packHashes) ? packHashes : {}
        }

        for (const target of targets) {
            if (target === BASELINE_TARGET) continue
            const report = (kind, unitId) => violations.push({ pack: packId, target, kind, unitId })
            const entry = coverage?.[packId]?.[target]
            if (entry === undefined) {
                report('missing-coverage', null)
                continue
            }
            validateEntry({ pack, target, entry, baselineIds, unitHashes, report })
        }
    }

    return { ok: violations.length === 0, violations }
}

module.exports = {
    BASELINE_TARGET,
    validateTargetCoverage,
}
