'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { loadCatalog } = require('./catalog.cjs')
const { canonicalJson } = require('./verification-receipts.cjs')
const { sha256 } = require('./verification-evidence.cjs')
const { CANONICAL_MANAGED_PATHS } = require('./toolchain-shadow-canonical-projection.cjs')

const CONTRACT_SCHEMA = 'patch-toolchain-shadow-contract-v2'
const DECLARATION_PATH = 'contracts/toolchain-hardening-shadow-v2.json'
const MANAGED_PATHS = CANONICAL_MANAGED_PATHS
const STATE_PATHS = Object.freeze([
    'save/pocketrisu-patches/intent.json',
    'save/pocketrisu-patches/lock.json',
    'save/pocketrisu-patches/state.json',
    'save/pocketrisu-patches/transaction.json',
])
const BOUNDARY_CLASS_IDS = Object.freeze([
    'local-storage:no-own-descriptor',
    'local-storage:usable-effect-free-data-value',
    'local-storage:configurable-unusable-data-value',
    'local-storage:configurable-accessor-not-invoked',
])
const REQUIRED_SYMBOL_IDS = Object.freeze([
    'global:localStorage',
    'global:safeStructuredClone',
    'module:happy-dom/Storage',
    'module:katex',
    'module:vitest/vi',
    'package:lightningcss@1.33.0',
    'package:vite-tailwind-consumers',
])
const REQUIRED_ALLOWED_CAPABILITIES = Object.freeze([
    'environment:read:PATH-for-pnpm-pilot-preflight',
    'filesystem:read-write-delete:three-managed-target-paths',
    'filesystem:read:declared-manifest-assets',
    'module:vitest-happy-dom-katex:target-test-bootstrap',
    'process-global:read:manager-pid',
    'randomness:read:manager-transaction-token',
    'state:read-write-delete:isolated-patcher-metadata',
    'subprocess:read:pnpm-version-pilot-preflight',
    'symbol:localStorage:typed-boundary',
    'time:read:manager-transaction-timestamp',
])
const REQUIRED_DENIED_CAPABILITIES = Object.freeze([
    'environment:undeclared',
    'filesystem:undeclared',
    'module:undeclared',
    'network:any',
    'process-global:undeclared-mutation',
    'randomness:application',
    'subprocess:undeclared',
    'time:application',
    'worker:persistent-or-reused',
])

class ToolchainShadowContractError extends Error {
    constructor(code, message, details = {}) {
        super(message)
        this.name = 'ToolchainShadowContractError'
        this.code = code
        this.details = details
    }
}

function exactKeys(value, expected, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new ToolchainShadowContractError('INVALID_DECLARATION', `${label} must be an object`)
    }
    const actual = Object.keys(value).sort()
    const wanted = [...expected].sort()
    if (canonicalJson(actual) !== canonicalJson(wanted)) {
        throw new ToolchainShadowContractError('UNKNOWN_DECLARATION_FIELD', `${label} fields differ`, {
            actual,
            expected: wanted,
        })
    }
}

function sortedUnique(values, label) {
    if (!Array.isArray(values) || values.some((value) => typeof value !== 'string' || value.length === 0)) {
        throw new ToolchainShadowContractError('INVALID_DECLARATION', `${label} must be an array of strings`)
    }
    const sorted = [...values].sort()
    if (new Set(sorted).size !== sorted.length) {
        throw new ToolchainShadowContractError('DUPLICATE_DECLARATION_ENTRY', `${label} contains duplicates`)
    }
    return sorted
}

function safeSourcePath(repositoryRoot, relative) {
    if (typeof relative !== 'string' || relative.length === 0 || path.isAbsolute(relative)) {
        throw new ToolchainShadowContractError('UNSAFE_DECLARATION_PATH', `Unsafe declared path: ${relative}`)
    }
    const normalized = path.posix.normalize(relative.replaceAll('\\', '/'))
    if (normalized !== relative.replaceAll('\\', '/') || normalized.startsWith('../') || normalized === '..') {
        throw new ToolchainShadowContractError('UNSAFE_DECLARATION_PATH', `Unsafe declared path: ${relative}`)
    }
    const root = path.resolve(repositoryRoot)
    const absolute = path.resolve(root, normalized)
    if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
        throw new ToolchainShadowContractError('DECLARATION_PATH_ESCAPE', `Declared path escaped source: ${relative}`)
    }
    return absolute
}

function sourceContent(source, repositoryRoot, label) {
    if (source.kind === 'file') {
        exactKeys(source, ['kind', 'path', 'bytes', 'sha256'], label)
        if (!source.path.startsWith('patches/toolchain-hardening/')) {
            throw new ToolchainShadowContractError('UNDECLARED_FILESYSTEM_ACCESS', `${label} is outside candidate assets`)
        }
        const absolute = safeSourcePath(repositoryRoot, source.path)
        const stat = fs.lstatSync(absolute)
        if (!stat.isFile() || stat.isSymbolicLink()) {
            throw new ToolchainShadowContractError('UNSEALED_DECLARATION_INPUT', `${label} is not a regular file`)
        }
        const encoded = fs.readFileSync(absolute)
        if (encoded.length !== source.bytes || sha256(encoded) !== source.sha256) {
            throw new ToolchainShadowContractError('DECLARATION_INPUT_MISMATCH', `${label} bytes or SHA-256 changed`)
        }
        return encoded.toString('utf8')
    }
    if (source.kind === 'literal') {
        exactKeys(source, ['kind', 'text', 'bytes', 'sha256'], label)
        const encoded = Buffer.from(source.text)
        if (encoded.length !== source.bytes || sha256(encoded) !== source.sha256) {
            throw new ToolchainShadowContractError('DECLARATION_INPUT_MISMATCH', `${label} literal seal changed`)
        }
        return source.text
    }
    throw new ToolchainShadowContractError('UNKNOWN_DECLARATION_INPUT', `${label} has unknown source kind`)
}

function declarationHash(declaration) {
    const { declarationSha256: ignored, ...payload } = declaration
    return sha256(canonicalJson(payload))
}

function materializeOperation(operation, repositoryRoot) {
    exactKeys(operation, [
        'id', 'file', 'type', 'where', 'requires', 'markerNeedle', 'anchor', 'managed',
    ], `operation ${operation?.id ?? '<unknown>'}`)
    if (!MANAGED_PATHS.includes(operation.file)) {
        throw new ToolchainShadowContractError('UNDECLARED_FILESYSTEM_ACCESS', `${operation.id} uses ${operation.file}`)
    }
    if (!['insert', 'replace'].includes(operation.type)) {
        throw new ToolchainShadowContractError('UNKNOWN_OPERATION', `${operation.id} has unsupported type`)
    }
    if (operation.type === 'insert' ? operation.where !== 'after' : operation.where !== null) {
        throw new ToolchainShadowContractError('INVALID_OPERATION', `${operation.id} has invalid placement`)
    }
    sortedUnique(operation.requires, `${operation.id}.requires`)
    if (typeof operation.markerNeedle !== 'string' || operation.markerNeedle.length === 0) {
        throw new ToolchainShadowContractError('INVALID_OPERATION', `${operation.id} has no marker`)
    }
    return {
        id: operation.id,
        file: operation.file,
        type: operation.type,
        ...(operation.where === null ? {} : { where: operation.where }),
        anchor: sourceContent(operation.anchor, repositoryRoot, `${operation.id}.anchor`),
        managed: sourceContent(operation.managed, repositoryRoot, `${operation.id}.managed`),
        markerNeedle: operation.markerNeedle,
        ...(operation.requires.length === 0 ? {} : { requires: [...operation.requires] }),
    }
}

function canonicalUnit(unit) {
    return {
        id: unit.id,
        file: unit.file,
        type: unit.type,
        ...(unit.where === undefined ? {} : { where: unit.where }),
        anchor: unit.anchor,
        managed: unit.managed,
        markerNeedle: unit.markerNeedle,
        ...(unit.requires === undefined ? {} : { requires: [...unit.requires] }),
    }
}

function validateTargetFiles(target, targetRoot) {
    exactKeys(target, ['packageName', 'packageVersion', 'commit', 'applicationTreeSha256', 'files'], 'target')
    if (target.packageName !== 'pocketrisu' || target.packageVersion !== '1.9.0') {
        throw new ToolchainShadowContractError('UNSUPPORTED_TARGET', 'Only exact PocketRisu 1.9.0 is admitted')
    }
    const paths = target.files.map((entry) => entry.path)
    if (canonicalJson([...paths].sort()) !== canonicalJson(MANAGED_PATHS)) {
        throw new ToolchainShadowContractError('INCOMPLETE_TARGET_BASELINE', 'Target baseline paths are incomplete')
    }
    for (const file of target.files) {
        exactKeys(file, ['path', 'sha256', 'mode'], `target file ${file.path}`)
        if (!/^[0-9a-f]{64}$/.test(file.sha256) || !Number.isInteger(file.mode)) {
            throw new ToolchainShadowContractError('INVALID_TARGET_BASELINE', `Target file ${file.path} is invalid`)
        }
        if (targetRoot !== null) {
            const absolute = path.join(targetRoot, file.path)
            const stat = fs.lstatSync(absolute)
            if (!stat.isFile() || stat.isSymbolicLink()) {
                throw new ToolchainShadowContractError('TARGET_BASELINE_DRIFT', `${file.path} is not a regular file`)
            }
            const encoded = fs.readFileSync(absolute)
            if (sha256(encoded) !== file.sha256 || (stat.mode & 0o7777) !== file.mode) {
                throw new ToolchainShadowContractError('TARGET_BASELINE_DRIFT', `${file.path} differs from the contract`)
            }
        }
    }
}

function validateToolchainShadowDeclaration(declaration, {
    repositoryRoot,
    targetRoot = null,
    compareCanonicalManifest = true,
} = {}) {
    const root = fs.realpathSync(path.resolve(repositoryRoot))
    exactKeys(declaration, [
        'schema', 'version', 'candidate', 'target', 'component', 'manifestExecution',
        'operations', 'state', 'symbols', 'boundaries', 'runtimeCapabilities', 'projection', 'fallback',
        'canonicalProtection', 'declarationSha256',
    ], 'declaration')
    if (declaration.schema !== CONTRACT_SCHEMA || declaration.version !== 2) {
        throw new ToolchainShadowContractError('UNKNOWN_DECLARATION_SCHEMA', 'Unknown shadow contract schema')
    }
    if (!/^[0-9a-f]{64}$/.test(declaration.declarationSha256)
        || declarationHash(declaration) !== declaration.declarationSha256) {
        throw new ToolchainShadowContractError('DECLARATION_HASH_MISMATCH', 'Declaration SHA-256 does not match')
    }
    exactKeys(declaration.candidate, ['packId', 'manifestVersion', 'productionClass', 'shadowClass', 'label'], 'candidate')
    if (canonicalJson(declaration.candidate) !== canonicalJson({
        packId: 'toolchain-hardening',
        manifestVersion: '0.1.3',
        productionClass: 'G',
        shadowClass: 'B',
        label: 'shadow B candidate',
    })) throw new ToolchainShadowContractError('CLASSIFICATION_ESCALATION', 'Candidate classification contract changed')

    validateTargetFiles(declaration.target, targetRoot)
    exactKeys(declaration.component, ['id', 'packIds', 'visiblePackIds', 'unitIds'], 'component')
    if (declaration.component.id !== 'component:toolchain-hardening-shadow-v2'
        || canonicalJson(declaration.component.packIds) !== canonicalJson(['toolchain-hardening'])
        || canonicalJson(declaration.component.visiblePackIds) !== canonicalJson(['toolchain-hardening'])) {
        throw new ToolchainShadowContractError('INVALID_COMPONENT_MEMBERSHIP', 'Component membership changed')
    }
    const unitIds = sortedUnique(declaration.component.unitIds, 'component.unitIds')
    if (!Array.isArray(declaration.operations) || declaration.operations.length !== 7) {
        throw new ToolchainShadowContractError('INCOMPLETE_OPERATION_SET', 'Exactly seven operations are required')
    }
    const materializedUnits = declaration.operations.map((operation) => materializeOperation(operation, root))
    if (canonicalJson(materializedUnits.map((unit) => unit.id).sort()) !== canonicalJson(unitIds)) {
        throw new ToolchainShadowContractError('INVALID_COMPONENT_MEMBERSHIP', 'Operation IDs differ from component units')
    }
    const seen = new Set()
    for (const unit of materializedUnits) {
        if (seen.has(unit.id)) throw new ToolchainShadowContractError('DUPLICATE_OPERATION', `Duplicate ${unit.id}`)
        for (const required of unit.requires ?? []) {
            if (!unitIds.includes(required)) {
                throw new ToolchainShadowContractError('UNDECLARED_OPERATION_DEPENDENCY', `${unit.id} requires ${required}`)
            }
        }
        seen.add(unit.id)
    }

    exactKeys(declaration.manifestExecution, ['allowedModules', 'declaredReads', 'declaredWrites', 'loader'], 'manifestExecution')
    if (canonicalJson(sortedUnique(declaration.manifestExecution.allowedModules, 'allowedModules'))
        !== canonicalJson(['node:fs', 'node:path'])
        || declaration.manifestExecution.declaredWrites.length !== 0
        || declaration.manifestExecution.loader !== 'declarative-shadow-materializer-v1') {
        throw new ToolchainShadowContractError('UNSEALED_MANIFEST_EXECUTION', 'Manifest execution contract is not sealed')
    }
    const assetReads = declaration.operations.flatMap((operation) =>
        [operation.anchor, operation.managed]
            .filter((source) => source.kind === 'file')
            .map((source) => source.path)).sort()
    if (canonicalJson(sortedUnique(declaration.manifestExecution.declaredReads, 'declaredReads'))
        !== canonicalJson(assetReads)) {
        throw new ToolchainShadowContractError('UNDECLARED_FILESYSTEM_ACCESS', 'Manifest read set differs from assets')
    }

    exactKeys(declaration.state, ['productKeys', 'patcherSurfaces', 'shadowProjection', 'productionMigration'], 'state')
    if (declaration.state.productKeys.length !== 0 || declaration.state.productionMigration !== false
        || declaration.state.shadowProjection !== 'S0-P-read-only') {
        throw new ToolchainShadowContractError('UNDECLARED_STATE_ACCESS', 'State declaration is not shadow-only')
    }
    const statePaths = declaration.state.patcherSurfaces.map((surface) => {
        exactKeys(surface, ['path', 'access', 'scope'], `state ${surface?.path ?? '<unknown>'}`)
        if (canonicalJson(surface.access) !== canonicalJson(['delete', 'read', 'write'])
            || surface.scope !== 'global-canonical') {
            throw new ToolchainShadowContractError('UNDECLARED_STATE_ACCESS', `${surface.path} access changed`)
        }
        return surface.path
    }).sort()
    if (canonicalJson(statePaths) !== canonicalJson(STATE_PATHS)) {
        throw new ToolchainShadowContractError('UNDECLARED_STATE_ACCESS', 'Patcher state surfaces are incomplete')
    }

    const symbolIds = declaration.symbols.map((symbol) => {
        exactKeys(symbol, ['id', 'phase', 'access', 'boundary'], `symbol ${symbol?.id ?? '<unknown>'}`)
        sortedUnique(symbol.access, `${symbol.id}.access`)
        return symbol.id
    }).sort()
    if (canonicalJson(symbolIds) !== canonicalJson(REQUIRED_SYMBOL_IDS)) {
        throw new ToolchainShadowContractError('UNDECLARED_SYMBOL_ACCESS', 'Symbol declaration is incomplete')
    }

    const boundaryIds = declaration.boundaries.map((boundary) => {
        exactKeys(boundary, ['schema', 'id', 'surface', 'resource', 'inputClasses', 'validator', 'fallback'], `boundary ${boundary?.id ?? '<unknown>'}`)
        if (boundary.schema !== 'patch-typed-boundary-v1' || boundary.fallback !== 'global-exhaustive') {
            throw new ToolchainShadowContractError('INVALID_BOUNDARY', `${boundary.id} does not fail closed`)
        }
        sortedUnique(boundary.inputClasses, `${boundary.id}.inputClasses`)
        return boundary.id
    }).sort()
    if (canonicalJson(boundaryIds) !== canonicalJson([
        'boundary:local-storage-descriptor', 'boundary:target-baseline', 'boundary:toolchain-build',
    ])) throw new ToolchainShadowContractError('INCOMPLETE_BOUNDARY_SET', 'Typed boundary set is incomplete')
    const localStorage = declaration.boundaries.find((entry) => entry.id === 'boundary:local-storage-descriptor')
    if (canonicalJson([...localStorage.inputClasses].sort()) !== canonicalJson([...BOUNDARY_CLASS_IDS].sort())) {
        throw new ToolchainShadowContractError('INCOMPLETE_BOUNDARY_SET', 'Local-storage boundary classes are incomplete')
    }

    exactKeys(declaration.runtimeCapabilities, ['allowed', 'denied'], 'runtimeCapabilities')
    const allowed = sortedUnique(declaration.runtimeCapabilities.allowed, 'runtimeCapabilities.allowed')
    const denied = sortedUnique(declaration.runtimeCapabilities.denied, 'runtimeCapabilities.denied')
    if (canonicalJson(allowed) !== canonicalJson([...REQUIRED_ALLOWED_CAPABILITIES].sort())
        || canonicalJson(denied) !== canonicalJson([...REQUIRED_DENIED_CAPABILITIES].sort())) {
        throw new ToolchainShadowContractError('UNSEALED_RUNTIME_CAPABILITY', 'Runtime capability set is not exact')
    }
    for (const prefix of ['environment:', 'filesystem:', 'module:', 'network:', 'process-global:', 'randomness:', 'subprocess:', 'time:', 'worker:']) {
        if (!denied.some((entry) => entry.startsWith(prefix))) {
            throw new ToolchainShadowContractError('UNSEALED_RUNTIME_CAPABILITY', `Missing deny rule for ${prefix}`)
        }
    }
    exactKeys(declaration.projection, [
        'schema', 'fileObservationSchema', 'packIdentitySchema', 'selectionMode', 'candidateBitIndex',
    ], 'projection')
    if (canonicalJson(declaration.projection) !== canonicalJson({
        schema: 'patch-toolchain-shadow-canonical-candidate-projection-v2',
        fileObservationSchema: 'patch-toolchain-shadow-canonical-file-observation-v1',
        packIdentitySchema: 'patch-toolchain-shadow-candidate-pack-identity-v1',
        selectionMode: 'explicit-candidate-mask',
        candidateBitIndex: 11,
    })) throw new ToolchainShadowContractError('INVALID_PROJECTION_CONTRACT', 'Canonical projection contract differs')
    exactKeys(declaration.fallback, ['required', 'gate', 'on'], 'fallback')
    if (declaration.fallback.required !== true || declaration.fallback.gate !== 'Global Exhaustive') {
        throw new ToolchainShadowContractError('MISSING_GLOBAL_FALLBACK', 'Global Exhaustive fallback is not mandatory')
    }
    exactKeys(declaration.canonicalProtection, [
        'canonicalGate', 'productionClassification', 'defaultChanged', 'c0RoutingChanged',
        'productionStateChanged', 'productionCertificates', 'canonicalMasksSkipped', 'c1Authorized',
    ], 'canonicalProtection')
    if (canonicalJson(declaration.canonicalProtection) !== canonicalJson({
        canonicalGate: 'Global Exhaustive',
        productionClassification: 'G',
        defaultChanged: false,
        c0RoutingChanged: false,
        productionStateChanged: false,
        productionCertificates: 0,
        canonicalMasksSkipped: 0,
        c1Authorized: false,
    })) throw new ToolchainShadowContractError('CANONICAL_PROTECTION_WEAKENED', 'Canonical protection changed')

    const catalog = loadCatalog(root)
    const manifest = catalog.find((pack) => pack.id === declaration.candidate.packId)
    if (manifest === undefined) {
        throw new ToolchainShadowContractError('CANONICAL_MANIFEST_MISMATCH', 'Canonical candidate is absent from the full catalog')
    }
    if (compareCanonicalManifest) {
        if (manifest.id !== declaration.candidate.packId || manifest.version !== declaration.candidate.manifestVersion
            || manifest.units.length !== materializedUnits.length) {
            throw new ToolchainShadowContractError('CANONICAL_MANIFEST_MISMATCH', 'Canonical candidate identity differs')
        }
        const canonicalById = new Map(manifest.units.map((unit) => [unit.id, canonicalUnit(unit)]))
        for (const unit of materializedUnits) {
            if (canonicalJson(canonicalById.get(unit.id)) !== canonicalJson(unit)) {
                throw new ToolchainShadowContractError('CANONICAL_MANIFEST_MISMATCH', `${unit.id} differs from declaration`)
            }
        }
    }

    return {
        declaration,
        declarationSha256: declaration.declarationSha256,
        catalog,
        pack: manifest,
        boundaryClassIds: [...BOUNDARY_CLASS_IDS],
        managedPaths: [...MANAGED_PATHS],
        statePaths: [...STATE_PATHS],
    }
}

function loadToolchainShadowDeclaration(repositoryRoot, options = {}) {
    const root = fs.realpathSync(path.resolve(repositoryRoot))
    const file = safeSourcePath(root, DECLARATION_PATH)
    const declaration = JSON.parse(fs.readFileSync(file, 'utf8'))
    return validateToolchainShadowDeclaration(declaration, { repositoryRoot: root, ...options })
}

module.exports = {
    BOUNDARY_CLASS_IDS,
    CONTRACT_SCHEMA,
    DECLARATION_PATH,
    MANAGED_PATHS,
    STATE_PATHS,
    ToolchainShadowContractError,
    declarationHash,
    loadToolchainShadowDeclaration,
    validateToolchainShadowDeclaration,
}
