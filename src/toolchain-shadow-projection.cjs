'use strict'

const { canonicalJson } = require('./verification-receipts.cjs')
const { sha256 } = require('./verification-evidence.cjs')
const { MANAGED_PATHS } = require('./toolchain-shadow-contract.cjs')

const CANDIDATE_PACK_ID = 'toolchain-hardening'

function filterSelection(selection) {
    const filter = (values) => (values ?? []).filter((value) => value === CANDIDATE_PACK_ID)
    return {
        effectiveRequested: filter(selection?.effectiveRequested),
        resolvedIds: filter(selection?.resolvedIds),
        autoAdded: filter(selection?.autoAdded),
        dependencyAdded: filter(selection?.dependencyAdded),
    }
}

function candidateStateProjection(state) {
    const units = (state?.units ?? []).filter((unit) => unit.pack === CANDIDATE_PACK_ID)
    const unitIds = new Set(units.map((unit) => unit.id))
    const files = Object.fromEntries(Object.entries(state?.files ?? {})
        .filter(([file]) => MANAGED_PATHS.includes(file))
        .sort(([left], [right]) => left.localeCompare(right)))
    const projection = {
        schema: 'patch-toolchain-shadow-state-projection-v1',
        active: units.length > 0,
        selection: filterSelection(state?.selection),
        packs: (state?.packs ?? []).filter((pack) => pack.id === CANDIDATE_PACK_ID),
        order: (state?.order ?? []).filter((unitId) => unitIds.has(unitId)),
        units,
        files,
    }
    return {
        projection,
        projectionSha256: sha256(canonicalJson(projection)),
    }
}

function candidateFileProjection(snapshot) {
    const projection = Object.fromEntries(MANAGED_PATHS.map((file) => [file, snapshot[file] ?? null]))
    return {
        projection,
        projectionSha256: sha256(canonicalJson(projection)),
    }
}

function candidateObservationProjection({ mask, snapshot, state }) {
    const files = candidateFileProjection(snapshot)
    const candidateState = candidateStateProjection(state)
    const projection = {
        schema: 'patch-toolchain-shadow-observation-projection-v1',
        mask,
        active: mask === 1,
        filesSha256: files.projectionSha256,
        stateSha256: candidateState.projectionSha256,
    }
    if (candidateState.projection.active !== (mask === 1)) {
        throw new Error('Candidate state activity differs from the local mask')
    }
    return {
        ...projection,
        projectionSha256: sha256(canonicalJson(projection)),
    }
}

module.exports = {
    CANDIDATE_PACK_ID,
    candidateFileProjection,
    candidateObservationProjection,
    candidateStateProjection,
}
