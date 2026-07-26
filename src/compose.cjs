'use strict'

const crypto = require('node:crypto')

class PatchCompositionError extends Error {
    constructor(code, message, details = {}) {
        super(message)
        this.name = 'PatchCompositionError'
        this.code = code
        this.details = details
    }
}

function sha256(value) {
    return crypto.createHash('sha256').update(value ?? '').digest('hex')
}

function countOccurrences(text, needle) {
    if (!needle) return 0
    let count = 0
    let offset = 0
    while (true) {
        const index = text.indexOf(needle, offset)
        if (index === -1) return count
        count += 1
        offset = index + needle.length
    }
}

function assertUnit(unit) {
    if (!unit || typeof unit !== 'object') {
        throw new PatchCompositionError('INVALID_UNIT', 'Patch unit must be an object')
    }
    if (!unit.id || typeof unit.id !== 'string') {
        throw new PatchCompositionError('INVALID_UNIT', 'Patch unit requires a string id')
    }
    if (!unit.file || typeof unit.file !== 'string') {
        throw new PatchCompositionError('INVALID_UNIT', `${unit.id}: file is required`)
    }
    if (!['insert', 'replace', 'owned'].includes(unit.type)) {
        throw new PatchCompositionError('INVALID_UNIT', `${unit.id}: unsupported type ${unit.type}`)
    }
    if (unit.type === 'owned') {
        if (typeof unit.content !== 'string') {
            throw new PatchCompositionError('INVALID_UNIT', `${unit.id}: owned content is required`)
        }
        return
    }
    if (!unit.anchor || typeof unit.anchor !== 'string') {
        throw new PatchCompositionError('INVALID_UNIT', `${unit.id}: anchor is required`)
    }
    if (typeof unit.content !== 'string') {
        if (typeof unit.managed !== 'string') {
            throw new PatchCompositionError('INVALID_UNIT', `${unit.id}: content or managed text is required`)
        }
    }
    if (unit.type === 'insert' && !['before', 'after'].includes(unit.where)) {
        throw new PatchCompositionError('INVALID_UNIT', `${unit.id}: insert where must be before or after`)
    }
}

function markerStart(unit) {
    return `/* POCKETRISU-PATCH:${unit.id}:START */`
}

function markerEnd(unit) {
    return `/* POCKETRISU-PATCH:${unit.id}:END */`
}

function markedBlock(unit) {
    if (typeof unit.managed === 'string') return unit.managed
    const body = unit.content.endsWith('\n') ? unit.content : `${unit.content}\n`
    return `${markerStart(unit)}\n${body}${markerEnd(unit)}`
}

function insertionText(unit) {
    if (typeof unit.managed === 'string') return unit.managed
    const block = markedBlock(unit)
    const leading = unit.leading ?? (unit.where === 'after' && unit.anchor.endsWith('\n') ? '' : '\n')
    const trailing = unit.trailing ?? (unit.where === 'before' && unit.anchor.startsWith('\n') ? '' : '\n')
    return `${leading}${block}${trailing}`
}

function assertNoMarkerDrift(text, unit, expected) {
    const exactCount = countOccurrences(text, expected)
    if (exactCount === 1) return true
    if (exactCount > 1) {
        throw new PatchCompositionError(
            'DUPLICATE_MANAGED_BLOCK',
            `${unit.id}: exact managed block appears ${exactCount} times`,
            { unit: unit.id, file: unit.file, count: exactCount },
        )
    }
    if (typeof unit.managed === 'string') {
        if (!unit.markerNeedle || !text.includes(unit.markerNeedle)) return false
        throw new PatchCompositionError(
            'MARKER_DRIFT',
            `${unit.id}: marker token exists but its managed block is not exact`,
            { unit: unit.id, file: unit.file },
        )
    }
    const hasStart = text.includes(markerStart(unit))
    const hasEnd = text.includes(markerEnd(unit))
    if (!hasStart && !hasEnd) return false
    throw new PatchCompositionError(
        'MARKER_DRIFT',
        `${unit.id}: marker exists but its managed block is not exact`,
        { unit: unit.id, file: unit.file },
    )
}

function applyUnit(input, unit) {
    assertUnit(unit)

    if (unit.type === 'owned') {
        if (input === null) return unit.content
        if (input === unit.content) return input
        throw new PatchCompositionError(
            'OWNED_COLLISION',
            `${unit.id}: owned file already exists with different content`,
            { unit: unit.id, file: unit.file },
        )
    }

    if (typeof input !== 'string') {
        throw new PatchCompositionError(
            'MISSING_FILE',
            `${unit.id}: host file does not exist`,
            { unit: unit.id, file: unit.file },
        )
    }

    const block = markedBlock(unit)
    if (unit.type === 'replace') {
        if (assertNoMarkerDrift(input, unit, block)) return input
        const count = countOccurrences(input, unit.anchor)
        const validCount = unit.anchorPolicy === 'first' ? count >= 1 : count === 1
        if (!validCount) {
            throw new PatchCompositionError(
                'ANCHOR_COUNT',
                `${unit.id}: expected ${unit.anchorPolicy === 'first' ? 'at least one' : 'one'} replace anchor, found ${count}`,
                { unit: unit.id, file: unit.file, count },
            )
        }
        return input.replace(unit.anchor, block)
    }

    const inserted = insertionText(unit)
    if (assertNoMarkerDrift(input, unit, inserted)) return input
    const count = countOccurrences(input, unit.anchor)
    const validCount = unit.anchorPolicy === 'first' ? count >= 1 : count === 1
    if (!validCount) {
        throw new PatchCompositionError(
            'ANCHOR_COUNT',
            `${unit.id}: expected ${unit.anchorPolicy === 'first' ? 'at least one' : 'one'} insert anchor, found ${count}`,
            { unit: unit.id, file: unit.file, count },
        )
    }
    return unit.where === 'before'
        ? input.replace(unit.anchor, `${inserted}${unit.anchor}`)
        : input.replace(unit.anchor, `${unit.anchor}${inserted}`)
}

function revertUnit(input, unit) {
    assertUnit(unit)
    if (unit.type === 'owned') {
        if (input === null) return null
        if (input !== unit.content) {
            throw new PatchCompositionError(
                'OWNED_DRIFT',
                `${unit.id}: refusing to remove drifted owned file`,
                { unit: unit.id, file: unit.file },
            )
        }
        return null
    }
    if (typeof input !== 'string') {
        throw new PatchCompositionError(
            'MISSING_FILE',
            `${unit.id}: host file does not exist during revert`,
            { unit: unit.id, file: unit.file },
        )
    }
    const managed = unit.type === 'replace' ? markedBlock(unit) : insertionText(unit)
    const count = countOccurrences(input, managed)
    if (count !== 1) {
        throw new PatchCompositionError(
            'MANAGED_BLOCK_COUNT',
            `${unit.id}: expected one exact managed block during revert, found ${count}`,
            { unit: unit.id, file: unit.file, count },
        )
    }
    return unit.type === 'replace'
        ? input.replace(managed, unit.anchor)
        : input.replace(managed, '')
}

function trySequence(base, sequence) {
    try {
        let value = base
        for (const unit of sequence) value = applyUnit(value, unit)
        return { ok: true, value }
    } catch (error) {
        if (!(error instanceof PatchCompositionError)) throw error
        return { ok: false, error }
    }
}

function analyzePair(base, left, right) {
    assertUnit(left)
    assertUnit(right)
    if (left.file !== right.file) return { kind: 'independent' }

    const leftRight = trySequence(base, [left, right])
    const rightLeft = trySequence(base, [right, left])

    if (leftRight.ok && rightLeft.ok) {
        if (leftRight.value === rightLeft.value) return { kind: 'commutative' }
        return {
            kind: 'ambiguous',
            leftThenRightHash: sha256(leftRight.value),
            rightThenLeftHash: sha256(rightLeft.value),
        }
    }
    if (leftRight.ok) return { kind: 'ordered', before: left.id, after: right.id }
    if (rightLeft.ok) return { kind: 'ordered', before: right.id, after: left.id }
    return {
        kind: 'incompatible',
        leftThenRightError: leftRight.error,
        rightThenLeftError: rightLeft.error,
    }
}

function addEdge(edges, from, to, reason) {
    if (from === to) {
        throw new PatchCompositionError('ORDER_CYCLE', `Self dependency for ${from}`, { from, to, reason })
    }
    if (!edges.has(from)) edges.set(from, new Map())
    edges.get(from).set(to, reason)
}

function hasPath(edges, from, to, seen = new Set()) {
    if (from === to) return true
    if (seen.has(from)) return false
    seen.add(from)
    for (const next of edges.get(from)?.keys() ?? []) {
        if (hasPath(edges, next, to, seen)) return true
    }
    return false
}

function topologicalSort(units, edges) {
    const ids = units.map((unit) => unit.id).sort()
    const indegree = new Map(ids.map((id) => [id, 0]))
    for (const [from, targets] of edges) {
        if (!indegree.has(from)) continue
        for (const to of targets.keys()) {
            if (indegree.has(to)) indegree.set(to, indegree.get(to) + 1)
        }
    }
    const ready = ids.filter((id) => indegree.get(id) === 0).sort()
    const output = []
    while (ready.length > 0) {
        const id = ready.shift()
        output.push(id)
        for (const target of [...(edges.get(id)?.keys() ?? [])].sort()) {
            if (!indegree.has(target)) continue
            const next = indegree.get(target) - 1
            indegree.set(target, next)
            if (next === 0) {
                ready.push(target)
                ready.sort()
            }
        }
    }
    if (output.length !== ids.length) {
        const blocked = ids.filter((id) => !output.includes(id))
        throw new PatchCompositionError(
            'ORDER_CYCLE',
            `Patch ordering cycle: ${blocked.join(', ')}`,
            { blocked },
        )
    }
    return output
}

function buildPlan(units, baselines) {
    const byId = new Map()
    for (const unit of units) {
        assertUnit(unit)
        if (byId.has(unit.id)) {
            throw new PatchCompositionError('DUPLICATE_UNIT', `Duplicate patch unit id: ${unit.id}`)
        }
        byId.set(unit.id, unit)
    }

    const edges = new Map()
    for (const unit of units) {
        for (const dependency of unit.requires ?? []) {
            if (!byId.has(dependency)) {
                throw new PatchCompositionError(
                    'MISSING_DEPENDENCY',
                    `${unit.id}: missing required unit ${dependency}`,
                    { unit: unit.id, dependency },
                )
            }
            addEdge(edges, dependency, unit.id, 'requires')
        }
        for (const before of unit.before ?? []) {
            if (byId.has(before)) addEdge(edges, unit.id, before, 'declared-before')
        }
        for (const after of unit.after ?? []) {
            if (byId.has(after)) addEdge(edges, after, unit.id, 'declared-after')
        }
    }

    const collisions = []
    for (let i = 0; i < units.length; i += 1) {
        for (let j = i + 1; j < units.length; j += 1) {
            const left = units[i]
            const right = units[j]
            if (left.file !== right.file) continue
            if (hasPath(edges, left.id, right.id) || hasPath(edges, right.id, left.id)) {
                continue
            }
            const base = baselines.get(left.file) ?? null
            const analysis = analyzePair(base, left, right)
            if (analysis.kind === 'ordered') {
                addEdge(edges, analysis.before, analysis.after, 'inferred-structural-collision')
                collisions.push({ units: [left.id, right.id], ...analysis })
            } else if (analysis.kind === 'ambiguous') {
                collisions.push({ units: [left.id, right.id], ...analysis })
            } else if (analysis.kind === 'incompatible') {
                throw new PatchCompositionError(
                    'INCOMPATIBLE_UNITS',
                    `${left.id} and ${right.id} cannot be composed on ${left.file}`,
                    { left: left.id, right: right.id, file: left.file, analysis },
                )
            }
        }
    }

    for (const collision of collisions) {
        if (collision.kind !== 'ambiguous') continue
        const [left, right] = collision.units
        if (!hasPath(edges, left, right) && !hasPath(edges, right, left)) {
            throw new PatchCompositionError(
                'AMBIGUOUS_ORDER',
                `${left} and ${right} produce different valid outputs; declare before/after`,
                collision,
            )
        }
    }

    const order = topologicalSort(units, edges)
    const outputs = new Map(baselines)
    for (const id of order) {
        const unit = byId.get(id)
        outputs.set(unit.file, applyUnit(outputs.get(unit.file) ?? null, unit))
    }
    return {
        order,
        collisions,
        edges: [...edges.entries()].flatMap(([from, targets]) =>
            [...targets.entries()].map(([to, reason]) => ({ from, to, reason }))
        ),
        outputs,
    }
}

function compose(units, baselines) {
    const plan = buildPlan(units, baselines)
    return plan
}

module.exports = {
    PatchCompositionError,
    analyzePair,
    applyUnit,
    buildPlan,
    compose,
    insertionText,
    markedBlock,
    markerEnd,
    markerStart,
    revertUnit,
    sha256,
}
