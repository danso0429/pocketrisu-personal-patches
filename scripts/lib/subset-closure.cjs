'use strict'

// Maintainer-only helper for scripts/qualify-subset.cjs. The catalog, manager,
// staging and installer modules must not import it.

const { resolveSelection } = require('../../src/resolver.cjs')
const { flattenUnits, unitMatchesTarget } = require('../../src/manager.cjs')

const DEFAULT_PACKAGE_NAME = 'pocketrisu'

class SubsetClosureError extends Error {
    constructor(code, message, details = {}) {
        super(message)
        this.name = 'SubsetClosureError'
        this.code = code
        this.details = details
    }
}

function targetIdentity(target, packageName) {
    return { packageName, packageVersion: target }
}

// Unit id -> ids of the packs whose unit with that id is selected for the
// target. Built over the whole catalog so that an ambiguous owner is reported
// even when only one of the owners would otherwise enter the closure.
function indexUnitOwners(catalog, identity) {
    const owners = new Map()
    for (const pack of catalog) {
        for (const unit of pack.units ?? []) {
            if (!unitMatchesTarget(unit, identity)) continue
            const packIds = owners.get(unit.id) ?? new Set()
            packIds.add(pack.id)
            owners.set(unit.id, packIds)
        }
    }
    return owners
}

function resolveSubsetClosure({
    catalog,
    packIds,
    target,
    packageName = DEFAULT_PACKAGE_NAME,
}) {
    if (!Array.isArray(catalog)) {
        throw new SubsetClosureError('INVALID_CATALOG', 'catalog must be an array of packs')
    }
    if (typeof target !== 'string' || !target) {
        throw new SubsetClosureError('INVALID_TARGET', 'target must be an exact version string')
    }
    const identity = targetIdentity(target, packageName)
    const owners = indexUnitOwners(catalog, identity)
    const selected = new Set(packIds)

    for (;;) {
        // Pack requires and autoWhen come from the ordinary resolver, so its
        // cycle, conflict and supersede contracts apply unchanged.
        const resolution = resolveSelection(catalog, [...selected], { allowInternal: true })
        const units = flattenUnits(resolution.packs, identity)
        const resolved = new Set(resolution.resolvedIds)
        let changed = false

        for (const unit of units) {
            for (const dependency of unit.requires ?? []) {
                const owner = owners.get(dependency)
                if (!owner || owner.size !== 1) {
                    throw new SubsetClosureError(
                        'SUBSET_UNIT_OWNER',
                        owner
                            ? `${unit.id}: required unit ${dependency} has more than one owner pack for ${packageName} ${target}`
                            : `${unit.id}: required unit ${dependency} has no owner pack for ${packageName} ${target}`,
                        {
                            unit: unit.id,
                            pack: unit.pack,
                            dependency,
                            owners: owner ? [...owner].sort() : [],
                            target,
                        },
                    )
                }
                const [ownerId] = owner
                if (!resolved.has(ownerId) && !selected.has(ownerId)) {
                    selected.add(ownerId)
                    changed = true
                }
            }
        }

        // `selected` only grows and is bounded by the catalog, so this
        // alternation reaches a fixpoint.
        if (!changed) {
            // An owner that is selected but superseded by another resolved
            // pack is dropped by the resolver, so the fixpoint alone does not
            // guarantee that every required unit is present.
            const unitIds = new Set(units.map((unit) => unit.id))
            for (const unit of units) {
                for (const dependency of unit.requires ?? []) {
                    if (unitIds.has(dependency)) continue
                    const owner = owners.get(dependency)
                    throw new SubsetClosureError(
                        'SUBSET_UNIT_OWNER',
                        `${unit.id}: required unit ${dependency} is not in the closure for ${packageName} ${target}`,
                        {
                            unit: unit.id,
                            pack: unit.pack,
                            dependency,
                            owners: owner ? [...owner].sort() : [],
                            target,
                        },
                    )
                }
            }
            return {
                packs: resolution.packs,
                units,
            }
        }
    }
}

module.exports = {
    SubsetClosureError,
    resolveSubsetClosure,
}
