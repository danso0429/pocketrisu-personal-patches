'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const CANDIDATE_ID = 'toolchain-hardening'
const FILE_OBSERVATION_SCHEMA = 'patch-toolchain-shadow-canonical-file-observation-v1'
const PACK_IDENTITY_SCHEMA = 'patch-toolchain-shadow-candidate-pack-identity-v1'
const STATE_PROJECTION_SCHEMA = 'patch-toolchain-shadow-canonical-candidate-state-v2'
const PROJECTION_SCHEMA = 'patch-toolchain-shadow-canonical-candidate-projection-v2'
const BOUNDARY_CONSENSUS_SCHEMA = 'patch-toolchain-shadow-boundary-consensus-v2'
const MAPPING_SCHEMA = 'patch-toolchain-shadow-global-mapping-v2'
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const MANAGED_PATHS = Object.freeze(['package.json', 'pnpm-lock.yaml', 'vitest.setup.ts'])

function canonicalValue(value) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (Array.isArray(value)) return value.map(canonicalValue)
    if (!value || typeof value !== 'object') throw new TypeError('Unsupported canonical projection value')
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]))
}

function canonicalJson(value) {
    return JSON.stringify(canonicalValue(value))
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex')
}

const SEMANTIC_FIELD_SET = Object.freeze([
    'candidateId',
    'mask',
    'active',
    'target.packageName',
    'target.packageVersion',
    'target.applicability',
    'packIdentity',
    'managedFiles[].path',
    'managedFiles[].kind',
    'managedFiles[].sha256',
    'managedFiles[].mode',
    'candidateState.selection',
    'candidateState.relationState',
    'candidateState.unitOrder',
    'candidateState.units',
    'candidateState.ownedManagedPaths',
    'candidateState.persistedFiles',
])
const SEMANTIC_FIELD_SET_SHA256 = sha256(canonicalJson(SEMANTIC_FIELD_SET))

class ToolchainShadowCanonicalProjectionError extends Error {
    constructor(code, message, details = null) {
        super(message)
        this.name = 'ToolchainShadowCanonicalProjectionError'
        this.code = code
        this.details = details
    }
}

function fail(code, message, details = null) {
    throw new ToolchainShadowCanonicalProjectionError(code, message, details)
}

function exactKeys(value, expected, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expected].sort())) {
        fail('INVALID_CANONICAL_PROJECTION', `${label} keys differ`, {
            actual: value && typeof value === 'object' && !Array.isArray(value)
                ? Object.keys(value).sort()
                : null,
            expected: [...expected].sort(),
        })
    }
}

function sortedUniqueStrings(values, label) {
    if (!Array.isArray(values) || values.some((value) => typeof value !== 'string' || value.length === 0)) {
        fail('INVALID_CANONICAL_PROJECTION', `${label} must be an array of non-empty strings`)
    }
    const sorted = [...values].sort()
    if (new Set(sorted).size !== sorted.length) {
        fail('INVALID_CANONICAL_PROJECTION', `${label} contains duplicates`)
    }
    return sorted
}

function canonicalData(value) {
    return JSON.parse(canonicalJson(value))
}

function normalizedRelativePath(relativePath) {
    if (typeof relativePath !== 'string' || relativePath.length === 0 || path.isAbsolute(relativePath)) {
        fail('INVALID_CANONICAL_FILE_PATH', 'Canonical file path must be repository-relative')
    }
    const posix = relativePath.replaceAll('\\', '/')
    const normalized = path.posix.normalize(posix)
    if (normalized !== posix || normalized === '..' || normalized.startsWith('../')) {
        fail('INVALID_CANONICAL_FILE_PATH', `Canonical file path is unsafe: ${relativePath}`)
    }
    return normalized
}

function validateCanonicalFileObservation(observation) {
    exactKeys(observation, ['schema', 'path', 'kind', 'sha256', 'mode'], 'canonical file observation')
    if (observation.schema !== FILE_OBSERVATION_SCHEMA
        || normalizedRelativePath(observation.path) !== observation.path
        || !['missing', 'regular-file'].includes(observation.kind)) {
        fail('INVALID_CANONICAL_FILE_OBSERVATION', 'Canonical file observation identity is invalid')
    }
    if (observation.kind === 'missing') {
        if (observation.sha256 !== null || observation.mode !== null) {
            fail('INVALID_CANONICAL_FILE_OBSERVATION', 'Missing files must have null content and mode')
        }
    } else if (!SHA256_PATTERN.test(observation.sha256 ?? '')
        || !Number.isInteger(observation.mode) || observation.mode < 0 || observation.mode > 0o7777) {
        fail('INVALID_CANONICAL_FILE_OBSERVATION', 'Regular-file content or mode is invalid')
    }
    return observation
}

function canonicalFileObservation({ root, relativePath }) {
    const relative = normalizedRelativePath(relativePath)
    const absoluteRoot = path.resolve(root)
    const absolute = path.resolve(absoluteRoot, relative)
    if (absolute !== absoluteRoot && !absolute.startsWith(`${absoluteRoot}${path.sep}`)) {
        fail('INVALID_CANONICAL_FILE_PATH', `Canonical file escaped its root: ${relative}`)
    }
    let stat
    try {
        stat = fs.lstatSync(absolute)
    } catch (error) {
        if (error.code === 'ENOENT') {
            return validateCanonicalFileObservation({
                schema: FILE_OBSERVATION_SCHEMA,
                path: relative,
                kind: 'missing',
                sha256: null,
                mode: null,
            })
        }
        throw error
    }
    if (!stat.isFile() || stat.isSymbolicLink()) {
        fail('UNSUPPORTED_CANONICAL_FILE_KIND', `${relative} is not a regular file`, {
            path: relative,
            symlink: stat.isSymbolicLink(),
        })
    }
    return validateCanonicalFileObservation({
        schema: FILE_OBSERVATION_SCHEMA,
        path: relative,
        kind: 'regular-file',
        sha256: sha256(fs.readFileSync(absolute)),
        mode: stat.mode & 0o7777,
    })
}

function semanticUnit(unit, declarationIndex = null) {
    if (!unit || typeof unit !== 'object' || typeof unit.id !== 'string'
        || typeof unit.file !== 'string' || !['insert', 'replace'].includes(unit.type)
        || typeof unit.anchor !== 'string' || typeof unit.managed !== 'string'
        || typeof unit.markerNeedle !== 'string') {
        fail('INVALID_CANONICAL_PACK', 'Candidate unit is incomplete')
    }
    const record = {
        id: unit.id,
        declarationIndex,
        path: normalizedRelativePath(unit.file),
        operation: unit.type,
        location: unit.where ?? null,
        anchorSha256: sha256(unit.anchor),
        managedSha256: sha256(unit.managed),
        markerSha256: sha256(unit.markerNeedle),
        requires: sortedUniqueStrings(unit.requires ?? [], `${unit.id}.requires`),
        before: sortedUniqueStrings(unit.before ?? [], `${unit.id}.before`),
        after: sortedUniqueStrings(unit.after ?? [], `${unit.id}.after`),
    }
    return {
        ...record,
        semanticSha256: sha256(canonicalJson(record)),
    }
}

function validateSemanticUnit(unit) {
    exactKeys(unit, [
        'id', 'declarationIndex', 'path', 'operation', 'location', 'anchorSha256',
        'managedSha256', 'markerSha256', 'requires', 'before', 'after', 'semanticSha256',
    ], 'candidate semantic unit')
    if (typeof unit.id !== 'string' || !Number.isInteger(unit.declarationIndex)
        || normalizedRelativePath(unit.path) !== unit.path
        || !['insert', 'replace'].includes(unit.operation)
        || (unit.location !== null && typeof unit.location !== 'string')
        || ![unit.anchorSha256, unit.managedSha256, unit.markerSha256, unit.semanticSha256]
            .every((value) => SHA256_PATTERN.test(value ?? ''))) {
        fail('INVALID_CANONICAL_PACK', 'Candidate semantic unit is invalid')
    }
    for (const key of ['requires', 'before', 'after']) {
        if (canonicalJson(unit[key]) !== canonicalJson(sortedUniqueStrings(unit[key], `unit.${key}`))) {
            fail('INVALID_CANONICAL_PACK', `Candidate semantic unit ${key} is not canonical`)
        }
    }
    const { semanticSha256, ...payload } = unit
    if (sha256(canonicalJson(payload)) !== semanticSha256) {
        fail('INVALID_CANONICAL_PACK', 'Candidate semantic unit SHA-256 differs')
    }
    return unit
}

function validateCanonicalCandidatePackIdentity(identity) {
    exactKeys(identity, [
        'schema', 'candidateId', 'manifestVersion', 'selectionSemantics', 'userSelectable',
        'targetApplicability', 'requires', 'conflicts', 'supersedes', 'autoWhen',
        'contracts', 'units', 'managedPathOwnership', 'catalogRelations',
        'collisionConstraints', 'semanticSha256',
    ], 'canonical candidate pack identity')
    if (identity.schema !== PACK_IDENTITY_SCHEMA || identity.candidateId !== CANDIDATE_ID
        || typeof identity.manifestVersion !== 'string'
        || canonicalJson(identity.selectionSemantics) !== canonicalJson({
            mode: 'explicit-candidate-mask',
            candidateMasks: [0, 1],
            presetDefaultsParticipate: false,
        }) || identity.userSelectable !== true
        || identity.targetApplicability?.status !== 'verified') {
        fail('INVALID_CANONICAL_PACK', 'Candidate pack semantic identity is invalid')
    }
    sortedUniqueStrings(identity.requires, 'pack.requires')
    sortedUniqueStrings(identity.conflicts, 'pack.conflicts')
    sortedUniqueStrings(identity.supersedes, 'pack.supersedes')
    sortedUniqueStrings(identity.managedPathOwnership, 'pack.managedPathOwnership')
    if (!Array.isArray(identity.catalogRelations) || !Array.isArray(identity.collisionConstraints)) {
        fail('INVALID_CANONICAL_PACK', 'Candidate catalog relation constraints are invalid')
    }
    if (!Array.isArray(identity.units) || identity.units.length === 0
        || identity.units.some((unit, index) => unit.declarationIndex !== index)) {
        fail('INVALID_CANONICAL_PACK', 'Candidate unit semantic identities are invalid')
    }
    for (const unit of identity.units) validateSemanticUnit(unit)
    exactKeys(identity.targetApplicability, ['packageName', 'packageVersion', 'status'], 'target applicability')
    if (identity.targetApplicability.packageName !== 'pocketrisu'
        || identity.targetApplicability.packageVersion !== '1.9.0') {
        fail('INVALID_CANONICAL_PACK', 'Exact target applicability differs')
    }
    const { semanticSha256, ...payload } = identity
    if (!SHA256_PATTERN.test(semanticSha256 ?? '') || sha256(canonicalJson(payload)) !== semanticSha256) {
        fail('INVALID_CANONICAL_PACK', 'Candidate pack semantic SHA-256 differs')
    }
    return identity
}

function canonicalCandidatePackIdentity({ catalog, target }) {
    if (!Array.isArray(catalog) || catalog.length === 0
        || new Set(catalog.map((pack) => pack.id)).size !== catalog.length) {
        fail('INVALID_CANONICAL_PACK', 'Full canonical catalog is missing or has duplicate pack IDs')
    }
    const pack = catalog.find((entry) => entry.id === CANDIDATE_ID)
    if (!pack || typeof pack.version !== 'string'
        || !target || typeof target.packageName !== 'string' || typeof target.packageVersion !== 'string') {
        fail('INVALID_CANONICAL_PACK', 'Candidate pack or exact target is missing')
    }
    const compatibility = pack.targets?.[target.packageName] ?? { verified: [], reviewing: [] }
    const status = (compatibility.verified ?? []).includes(target.packageVersion)
        ? 'verified'
        : ((compatibility.reviewing ?? []).includes(target.packageVersion) ? 'reviewing' : 'unqualified')
    if (status !== 'verified') {
        fail('CANDIDATE_TARGET_NOT_VERIFIED', 'Candidate is not verified for the exact active target', {
            target,
            status,
        })
    }
    const units = pack.units.map((unit, index) => semanticUnit(unit, index))
    const payload = {
        schema: PACK_IDENTITY_SCHEMA,
        candidateId: pack.id,
        manifestVersion: pack.version,
        selectionSemantics: {
            mode: 'explicit-candidate-mask',
            candidateMasks: [0, 1],
            presetDefaultsParticipate: false,
        },
        userSelectable: pack.userSelectable !== false,
        targetApplicability: {
            packageName: target.packageName,
            packageVersion: target.packageVersion,
            status,
        },
        requires: sortedUniqueStrings(pack.requires ?? [], 'pack.requires'),
        conflicts: sortedUniqueStrings(pack.conflicts ?? [], 'pack.conflicts'),
        supersedes: sortedUniqueStrings(pack.supersedes ?? [], 'pack.supersedes'),
        autoWhen: pack.autoWhen === undefined ? null : canonicalData(pack.autoWhen),
        contracts: canonicalData(pack.contracts ?? []),
        units,
        managedPathOwnership: [...new Set(units.map((unit) => unit.path))].sort(),
        catalogRelations: catalog
            .flatMap((entry) => [
                ...(entry.requires ?? []).filter((id) => id === CANDIDATE_ID).map(() => ({
                    sourcePackId: entry.id, relation: 'requires', candidateId: CANDIDATE_ID,
                })),
                ...(entry.conflicts ?? []).filter((id) => id === CANDIDATE_ID).map(() => ({
                    sourcePackId: entry.id, relation: 'conflicts', candidateId: CANDIDATE_ID,
                })),
                ...(entry.supersedes ?? []).filter((id) => id === CANDIDATE_ID).map(() => ({
                    sourcePackId: entry.id, relation: 'supersedes', candidateId: CANDIDATE_ID,
                })),
                ...(entry.autoWhen?.allOf ?? []).filter((id) => id === CANDIDATE_ID).map(() => ({
                    sourcePackId: entry.id, relation: 'autoWhen.allOf', candidateId: CANDIDATE_ID,
                })),
                ...(entry.autoWhen?.anyOf ?? []).filter((id) => id === CANDIDATE_ID).map(() => ({
                    sourcePackId: entry.id, relation: 'autoWhen.anyOf', candidateId: CANDIDATE_ID,
                })),
            ])
            .sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right))),
        collisionConstraints: catalog
            .filter((entry) => entry.id !== CANDIDATE_ID)
            .flatMap((entry) => entry.units.flatMap((otherUnit) => units
                .filter((candidateUnit) => candidateUnit.path === normalizedRelativePath(otherUnit.file))
                .map((candidateUnit) => ({
                    path: candidateUnit.path,
                    candidateUnitId: candidateUnit.id,
                    otherPackId: entry.id,
                    otherUnitId: otherUnit.id,
                }))))
            .sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right))),
    }
    return validateCanonicalCandidatePackIdentity({
        ...payload,
        semanticSha256: sha256(canonicalJson(payload)),
    })
}

function filterCandidateSelection(selection) {
    const filter = (values) => (values ?? []).filter((value) => value === CANDIDATE_ID)
    return {
        effectiveRequested: filter(selection?.effectiveRequested),
        resolvedIds: filter(selection?.resolvedIds),
        autoAdded: filter(selection?.autoAdded),
        dependencyAdded: filter(selection?.dependencyAdded),
    }
}

function candidateCollisions(collisions) {
    return (collisions ?? [])
        .filter((collision) => (collision.units ?? []).some((unitId) => unitId.startsWith(`${CANDIDATE_ID}:`)))
        .map(canonicalData)
        .sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)))
}

function validateCanonicalCandidateStateProjection(state, { mask, packIdentity }) {
    exactKeys(state, [
        'schema', 'active', 'selection', 'relationState', 'pack', 'unitOrder', 'units',
        'ownedManagedPaths', 'persistedFiles',
    ], 'canonical candidate state')
    if (state.schema !== STATE_PROJECTION_SCHEMA || state.active !== (mask === 1)) {
        fail('INVALID_CANONICAL_PROJECTION', 'Canonical candidate state identity differs')
    }
    exactKeys(state.selection, [
        'effectiveRequested', 'resolvedIds', 'autoAdded', 'dependencyAdded',
    ], 'canonical candidate selection')
    const expectedSelected = mask === 1 ? [CANDIDATE_ID] : []
    if (canonicalJson(state.selection.effectiveRequested) !== canonicalJson(expectedSelected)
        || canonicalJson(state.selection.resolvedIds) !== canonicalJson(expectedSelected)
        || canonicalJson(state.selection.autoAdded) !== canonicalJson([])
        || canonicalJson(state.selection.dependencyAdded) !== canonicalJson([])) {
        fail('INVALID_CANONICAL_PROJECTION', 'Canonical candidate selection differs')
    }
    exactKeys(state.relationState, [
        'candidateAutoAdded', 'candidateDependencyAdded', 'collisions',
    ], 'canonical candidate relation state')
    if (state.relationState.candidateAutoAdded !== false
        || state.relationState.candidateDependencyAdded !== false
        || !Array.isArray(state.relationState.collisions)) {
        fail('INVALID_CANONICAL_PROJECTION', 'Canonical candidate relation state differs')
    }
    if (mask === 0) {
        if (state.pack !== null || canonicalJson(state.unitOrder) !== canonicalJson([])
            || canonicalJson(state.units) !== canonicalJson([])
            || canonicalJson(state.persistedFiles) !== canonicalJson([])) {
            fail('INVALID_CANONICAL_PROJECTION', 'Inactive candidate state contains active facts')
        }
    } else {
        exactKeys(state.pack, ['candidateId', 'manifestVersion', 'semanticSha256'], 'candidate state pack')
        if (canonicalJson(state.pack) !== canonicalJson({
            candidateId: CANDIDATE_ID,
            manifestVersion: packIdentity.manifestVersion,
            semanticSha256: packIdentity.semanticSha256,
        })) fail('INVALID_CANONICAL_PROJECTION', 'Active candidate pack state differs')
        if (!Array.isArray(state.units) || state.units.length !== packIdentity.units.length
            || state.units.some((unit) => {
                if (!unit || typeof unit !== 'object') return true
                if (canonicalJson(Object.keys(unit).sort()) !== canonicalJson(['id', 'semanticSha256'])) return true
                return !packIdentity.units.some((expected) => expected.id === unit.id
                    && expected.semanticSha256 === unit.semanticSha256)
            })
            || !Array.isArray(state.unitOrder) || state.unitOrder.length !== state.units.length) {
            fail('INVALID_CANONICAL_PROJECTION', 'Active candidate unit state differs')
        }
        if (!Array.isArray(state.persistedFiles)
            || canonicalJson(state.persistedFiles.map((entry) => entry.path)) !== canonicalJson(MANAGED_PATHS)
            || state.persistedFiles.some((entry) => {
                if (!entry || canonicalJson(Object.keys(entry).sort())
                    !== canonicalJson(['baselineSha256', 'outputMode', 'outputSha256', 'path'])) return true
                return !SHA256_PATTERN.test(entry.baselineSha256 ?? '')
                    || !SHA256_PATTERN.test(entry.outputSha256 ?? '')
                    || !Number.isInteger(entry.outputMode)
            })) {
            fail('INVALID_CANONICAL_PROJECTION', 'Candidate persisted file state differs')
        }
    }
    if (canonicalJson(state.ownedManagedPaths) !== canonicalJson(packIdentity.managedPathOwnership)) {
        fail('INVALID_CANONICAL_PROJECTION', 'Candidate managed-path ownership differs')
    }
    return state
}

function canonicalCandidateStateProjection({ mask, state, packIdentity }) {
    validateCanonicalCandidatePackIdentity(packIdentity)
    if (![0, 1].includes(mask)) fail('INVALID_CANDIDATE_MASK', 'Candidate mask must be 0 or 1')
    const units = (state?.units ?? []).filter((unit) => unit.pack === CANDIDATE_ID)
    const active = units.length > 0
    if (active !== (mask === 1)) {
        fail('CANDIDATE_ACTIVITY_MISMATCH', 'Candidate state activity differs from its mask')
    }
    const expectedById = new Map(packIdentity.units.map((unit) => [unit.id, unit]))
    const semanticUnits = units.map((unit) => {
        const observed = semanticUnit(unit, expectedById.get(unit.id)?.declarationIndex ?? null)
        const expected = expectedById.get(unit.id)
        if (!expected || observed.semanticSha256 !== expected.semanticSha256) {
            fail('CANDIDATE_UNIT_SEMANTICS_MISMATCH', `${unit.id} differs from the canonical candidate pack`)
        }
        return { id: observed.id, semanticSha256: observed.semanticSha256 }
    }).sort((left, right) => left.id.localeCompare(right.id))
    const unitIds = new Set(semanticUnits.map((unit) => unit.id))
    const unitOrder = (state?.order ?? []).filter((unitId) => unitIds.has(unitId))
    const packState = (state?.packs ?? []).filter((entry) => entry.id === CANDIDATE_ID)
    if ((active && packState.length !== 1) || (!active && packState.length !== 0)
        || (active && (packState[0].version !== packIdentity.manifestVersion))) {
        fail('CANDIDATE_PERSISTED_STATE_MISMATCH', 'Candidate persisted pack state is invalid')
    }
    const persistedFiles = active
        ? MANAGED_PATHS.map((relative) => {
            const file = state?.files?.[relative]
            if (!file || !SHA256_PATTERN.test(file.baselineHash ?? '')
                || !SHA256_PATTERN.test(file.outputHash ?? '') || !Number.isInteger(file.outputMode)) {
                fail('CANDIDATE_PERSISTED_STATE_MISMATCH', `Candidate state for ${relative} is invalid`)
            }
            return {
                path: relative,
                baselineSha256: file.baselineHash,
                outputSha256: file.outputHash,
                outputMode: file.outputMode,
            }
        })
        : []
    return {
        schema: STATE_PROJECTION_SCHEMA,
        active,
        selection: filterCandidateSelection(state?.selection),
        relationState: {
            candidateAutoAdded: (state?.selection?.autoAdded ?? []).includes(CANDIDATE_ID),
            candidateDependencyAdded: (state?.selection?.dependencyAdded ?? []).includes(CANDIDATE_ID),
            collisions: candidateCollisions(state?.collisions),
        },
        pack: active ? {
            candidateId: CANDIDATE_ID,
            manifestVersion: packIdentity.manifestVersion,
            semanticSha256: packIdentity.semanticSha256,
        } : null,
        unitOrder,
        units: semanticUnits,
        ownedManagedPaths: [...packIdentity.managedPathOwnership],
        persistedFiles,
    }
}

function hashCanonicalCandidateProjection(projection) {
    const { projectionSha256: ignored, ...payload } = projection
    return sha256(canonicalJson(payload))
}

function validateCanonicalCandidateProjection(projection) {
    exactKeys(projection, [
        'schema', 'candidateId', 'mask', 'active', 'target', 'packIdentity',
        'managedFiles', 'candidateState', 'semanticFieldSetSha256', 'projectionSha256',
    ], 'canonical candidate projection')
    if (projection.schema !== PROJECTION_SCHEMA || projection.candidateId !== CANDIDATE_ID
        || ![0, 1].includes(projection.mask) || projection.active !== (projection.mask === 1)
        || projection.target?.applicability !== 'verified'
        || projection.semanticFieldSetSha256 !== SEMANTIC_FIELD_SET_SHA256) {
        fail('INVALID_CANONICAL_PROJECTION', 'Canonical candidate projection identity is invalid')
    }
    validateCanonicalCandidatePackIdentity(projection.packIdentity)
    exactKeys(projection.target, ['packageName', 'packageVersion', 'applicability'], 'projection target')
    if (projection.target.packageName !== projection.packIdentity.targetApplicability.packageName
        || projection.target.packageVersion !== projection.packIdentity.targetApplicability.packageVersion) {
        fail('INVALID_CANONICAL_PROJECTION', 'Projection target differs from pack applicability')
    }
    if (!Array.isArray(projection.managedFiles)
        || canonicalJson(projection.managedFiles.map((file) => file.path)) !== canonicalJson(MANAGED_PATHS)) {
        fail('INVALID_CANONICAL_PROJECTION', 'Canonical managed-file domain differs')
    }
    for (const file of projection.managedFiles) validateCanonicalFileObservation(file)
    validateCanonicalCandidateStateProjection(projection.candidateState, {
        mask: projection.mask,
        packIdentity: projection.packIdentity,
    })
    if (!SHA256_PATTERN.test(projection.projectionSha256 ?? '')
        || hashCanonicalCandidateProjection(projection) !== projection.projectionSha256) {
        fail('INVALID_CANONICAL_PROJECTION', 'Canonical candidate projection SHA-256 differs')
    }
    return projection
}

function canonicalCandidateProjection({ mask, root, state, catalog, target }) {
    if (![0, 1].includes(mask)) fail('INVALID_CANDIDATE_MASK', 'Candidate mask must be 0 or 1')
    const packIdentity = canonicalCandidatePackIdentity({ catalog, target })
    const payload = {
        schema: PROJECTION_SCHEMA,
        candidateId: CANDIDATE_ID,
        mask,
        active: mask === 1,
        target: {
            packageName: target.packageName,
            packageVersion: target.packageVersion,
            applicability: packIdentity.targetApplicability.status,
        },
        packIdentity,
        managedFiles: MANAGED_PATHS.map((relativePath) => canonicalFileObservation({ root, relativePath })),
        candidateState: canonicalCandidateStateProjection({ mask, state, packIdentity }),
        semanticFieldSetSha256: SEMANTIC_FIELD_SET_SHA256,
    }
    return validateCanonicalCandidateProjection({
        ...payload,
        projectionSha256: sha256(canonicalJson(payload)),
    })
}

function candidateBoundaryConsensus(observations, boundaryClassIds) {
    const requiredBoundaries = sortedUniqueStrings(boundaryClassIds, 'boundaryClassIds')
    const references = {}
    for (const mask of [0, 1]) {
        const values = observations.filter((observation) => observation.mask === mask)
        const observedBoundaries = values.map((observation) => observation.boundaryClassId).sort()
        if (values.length !== requiredBoundaries.length
            || canonicalJson(observedBoundaries) !== canonicalJson(requiredBoundaries)) {
            fail('LOCAL_BOUNDARY_PROJECTION_MISMATCH', `Local mask ${mask} boundary coverage differs`)
        }
        const canonicalBytes = values.map((observation) => {
            const projection = validateCanonicalCandidateProjection(observation.candidateProjection)
            const { projectionSha256: ignored, ...payload } = projection
            return canonicalJson(payload)
        })
        if (new Set(canonicalBytes).size !== 1) {
            fail('LOCAL_BOUNDARY_PROJECTION_MISMATCH', `Local mask ${mask} differs across boundary classes`)
        }
        references[String(mask)] = values[0].candidateProjection.projectionSha256
    }
    return {
        schema: BOUNDARY_CONSENSUS_SCHEMA,
        boundaryClasses: requiredBoundaries,
        references,
    }
}

function candidateMappingContract(visiblePacks) {
    if (!Array.isArray(visiblePacks) || visiblePacks.length !== 12
        || new Set(visiblePacks).size !== 12
        || canonicalJson(visiblePacks) !== canonicalJson([...visiblePacks].sort())) {
        fail('INVALID_GLOBAL_MAPPING', 'Visible pack order is not the canonical 12-pack domain')
    }
    const candidateBitIndex = visiblePacks.indexOf(CANDIDATE_ID)
    if (candidateBitIndex !== 11) {
        fail('INVALID_GLOBAL_MAPPING', 'Candidate bit index differs from the admitted mapping', {
            candidateBitIndex,
        })
    }
    return {
        schema: MAPPING_SCHEMA,
        candidateId: CANDIDATE_ID,
        candidateBitIndex,
        rawMasks: 4096,
        candidateOffMasks: 2048,
        candidateOnMasks: 2048,
        visiblePacks: [...visiblePacks],
    }
}

function candidateMaskForGlobalMask(mask, mapping) {
    if (!mapping || mapping.schema !== MAPPING_SCHEMA || !Number.isInteger(mask)
        || mask < 0 || mask >= mapping.rawMasks) {
        fail('INVALID_GLOBAL_MAPPING', `Global mask is out of range: ${mask}`)
    }
    return Math.floor(mask / (2 ** mapping.candidateBitIndex)) % 2
}

function validateGlobalCandidateMapping({ visiblePacks, observations }) {
    const mapping = candidateMappingContract(visiblePacks)
    if (!Array.isArray(observations) || observations.length !== mapping.rawMasks) {
        fail('INVALID_GLOBAL_MAPPING', 'Global candidate observations are incomplete')
    }
    const seen = new Set()
    let candidateOffMasks = 0
    let candidateOnMasks = 0
    for (const observation of observations) {
        if (!Number.isInteger(observation?.mask) || observation.mask < 0 || observation.mask >= mapping.rawMasks
            || seen.has(observation.mask)) {
            fail('INVALID_GLOBAL_MAPPING', 'Global candidate observation is duplicate or out of range')
        }
        seen.add(observation.mask)
        const expected = candidateMaskForGlobalMask(observation.mask, mapping)
        if (observation.candidateMask !== expected) {
            fail('INVALID_GLOBAL_MAPPING', `Global mask ${observation.mask} maps to the wrong candidate state`)
        }
        if (expected === 0) candidateOffMasks += 1
        else candidateOnMasks += 1
    }
    if (seen.size !== mapping.rawMasks || candidateOffMasks !== mapping.candidateOffMasks
        || candidateOnMasks !== mapping.candidateOnMasks) {
        fail('INVALID_GLOBAL_MAPPING', 'Global candidate mapping coverage differs')
    }
    return mapping
}

module.exports = {
    BOUNDARY_CONSENSUS_SCHEMA,
    CANONICAL_MANAGED_PATHS: MANAGED_PATHS,
    CANDIDATE_ID,
    FILE_OBSERVATION_SCHEMA,
    MAPPING_SCHEMA,
    PACK_IDENTITY_SCHEMA,
    PROJECTION_SCHEMA,
    SEMANTIC_FIELD_SET,
    SEMANTIC_FIELD_SET_SHA256,
    STATE_PROJECTION_SCHEMA,
    ToolchainShadowCanonicalProjectionError,
    candidateBoundaryConsensus,
    candidateMappingContract,
    candidateMaskForGlobalMask,
    canonicalCandidatePackIdentity,
    canonicalCandidateProjection,
    canonicalCandidateStateProjection,
    canonicalFileObservation,
    hashCanonicalCandidateProjection,
    validateCanonicalCandidatePackIdentity,
    validateCanonicalCandidateStateProjection,
    validateCanonicalCandidateProjection,
    validateCanonicalFileObservation,
    validateGlobalCandidateMapping,
}
