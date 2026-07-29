'use strict'

class PatchResolutionError extends Error {
    constructor(code, message, details = {}) {
        super(message)
        this.name = 'PatchResolutionError'
        this.code = code
        this.details = details
    }
}

function sortedUnique(values) {
    return [...new Set(values)].sort()
}

function assertStringArray(value, label) {
    if (value === undefined) return
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry)) {
        throw new PatchResolutionError('INVALID_PACK_RELATION', `${label} must be an array of pack ids`)
    }
}

function indexCatalog(catalog) {
    const byId = new Map()
    for (const pack of catalog) {
        if (!pack || typeof pack.id !== 'string' || !pack.id) {
            throw new PatchResolutionError('INVALID_PACK', 'Every pack requires an id')
        }
        if (byId.has(pack.id)) {
            throw new PatchResolutionError('DUPLICATE_PACK', `Duplicate patch pack id: ${pack.id}`)
        }
        assertStringArray(pack.requires, `${pack.id}.requires`)
        assertStringArray(pack.conflicts, `${pack.id}.conflicts`)
        assertStringArray(pack.supersedes, `${pack.id}.supersedes`)
        if (pack.autoWhen !== undefined) {
            if (!pack.autoWhen || typeof pack.autoWhen !== 'object') {
                throw new PatchResolutionError(
                    'INVALID_PACK_RELATION',
                    `${pack.id}.autoWhen must be an object`,
                )
            }
            assertStringArray(pack.autoWhen.all, `${pack.id}.autoWhen.all`)
            assertStringArray(pack.autoWhen.any, `${pack.id}.autoWhen.any`)
            assertStringArray(pack.autoWhen.none, `${pack.id}.autoWhen.none`)
        }
        byId.set(pack.id, pack)
    }
    for (const pack of catalog) {
        for (const relation of ['requires', 'conflicts', 'supersedes']) {
            for (const id of pack[relation] ?? []) {
                requireKnown(byId, id, `${pack.id}.${relation}`)
            }
        }
        for (const relation of ['all', 'any', 'none']) {
            for (const id of pack.autoWhen?.[relation] ?? []) {
                requireKnown(byId, id, `${pack.id}.autoWhen.${relation}`)
            }
        }
    }
    return byId
}

function requireKnown(byId, id, relation) {
    const pack = byId.get(id)
    if (!pack) {
        throw new PatchResolutionError(
            'UNKNOWN_PACK',
            `Unknown patch pack${relation ? ` in ${relation}` : ''}: ${id}`,
            { pack: id, relation: relation ?? null },
        )
    }
    return pack
}

function autoMatches(condition, selected) {
    const all = condition.all ?? []
    const any = condition.any ?? []
    const none = condition.none ?? []
    return all.every((id) => selected.has(id))
        && (any.length === 0 || any.some((id) => selected.has(id)))
        && none.every((id) => !selected.has(id))
}

function resolveSelection(catalog, requestedIds, {
    allowInternal = false,
    allowedIds = null,
} = {}) {
    if (!Array.isArray(requestedIds)) {
        throw new PatchResolutionError('INVALID_SELECTION', 'Requested packs must be an array')
    }
    const byId = indexCatalog(catalog)
    const requested = sortedUnique(requestedIds)
    const allowed = allowedIds === null ? null : new Set(allowedIds)

    for (const id of requested) {
        const pack = requireKnown(byId, id)
        if (pack.userSelectable === false && !allowInternal) {
            throw new PatchResolutionError(
                'INTERNAL_PACK_REQUESTED',
                `${id} is an internal integration pack and cannot be selected directly`,
                { pack: id },
            )
        }
        if (allowed && !allowed.has(id)) {
            throw new PatchResolutionError(
                'PACK_NOT_ALLOWED',
                `This preset cannot manage pack ${id}`,
                { pack: id },
            )
        }
    }

    const effective = new Set(requested)
    const superseded = []
    for (const id of requested) {
        const pack = byId.get(id)
        for (const replaced of pack.supersedes ?? []) {
            requireKnown(byId, replaced, `${id}.supersedes`)
            if (!effective.has(replaced)) continue
            effective.delete(replaced)
            superseded.push({ pack: replaced, by: id })
        }
    }

    const selected = new Set(effective)
    const automatic = new Set()
    const dependencies = new Set()

    function expandDependencies() {
        const visiting = new Set()
        const visited = new Set()

        function visit(id, owner = null) {
            if (visited.has(id)) return
            if (visiting.has(id)) {
                throw new PatchResolutionError(
                    'PACK_DEPENDENCY_CYCLE',
                    `Pack dependency cycle at ${id}`,
                    { pack: id },
                )
            }
            const pack = requireKnown(byId, id, owner ? `${owner}.requires` : null)
            visiting.add(id)
            for (const dependency of pack.requires ?? []) {
                if (!selected.has(dependency)) {
                    selected.add(dependency)
                    dependencies.add(dependency)
                }
                visit(dependency, id)
            }
            visiting.delete(id)
            visited.add(id)
        }

        for (const id of [...selected]) visit(id)
    }

    let changed = true
    while (changed) {
        changed = false
        expandDependencies()
        for (const pack of catalog) {
            if (!pack.autoWhen || selected.has(pack.id)) continue
            if (!autoMatches(pack.autoWhen, selected)) continue
            selected.add(pack.id)
            automatic.add(pack.id)
            changed = true
        }
    }
    expandDependencies()

    for (const { pack, by } of superseded) {
        if (selected.has(pack)) {
            throw new PatchResolutionError(
                'SUPERSEDED_PACK_REQUIRED',
                `${by} supersedes ${pack}, but the resolved graph still requires it`,
                { pack, by },
            )
        }
    }

    for (const id of selected) {
        const pack = byId.get(id)
        for (const conflict of pack.conflicts ?? []) {
            requireKnown(byId, conflict, `${id}.conflicts`)
            if (!selected.has(conflict)) continue
            throw new PatchResolutionError(
                'PACK_CONFLICT',
                `${id} conflicts with ${conflict}`,
                { packs: sortedUnique([id, conflict]) },
            )
        }
    }

    const resolvedIds = [...selected].sort()
    return {
        requested,
        effectiveRequested: [...effective].sort(),
        resolvedIds,
        packs: resolvedIds.map((id) => byId.get(id)),
        autoAdded: [...automatic].sort(),
        dependencyAdded: [...dependencies].filter((id) => !automatic.has(id)).sort(),
        superseded: superseded.sort((left, right) =>
            left.pack.localeCompare(right.pack) || left.by.localeCompare(right.by)
        ),
    }
}

module.exports = {
    PatchResolutionError,
    indexCatalog,
    resolveSelection,
}
