'use strict'

const childProcess = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { jsonSha256 } = require('./capability-contract.cjs')

const FRESH_SHADOW_RECEIPT_SCHEMA = 'patch-fresh-shadow-receipt-v1'

class FreshShadowVerifierError extends Error {
    constructor(code, message, details = {}) {
        super(message)
        this.name = 'FreshShadowVerifierError'
        this.code = code
        this.details = details
    }
}

function isInside(candidate, root) {
    return candidate === root || candidate.startsWith(`${root}${path.sep}`)
}

function safeRelative(relative) {
    if (typeof relative !== 'string' || relative.length === 0 || path.isAbsolute(relative)) {
        throw new FreshShadowVerifierError('UNSAFE_PROJECTION_PATH', `Unsafe projection path: ${relative}`)
    }
    const normalized = path.posix.normalize(relative.replaceAll('\\', '/'))
    if (normalized !== relative.replaceAll('\\', '/') || normalized === '..' || normalized.startsWith('../')) {
        throw new FreshShadowVerifierError('UNSAFE_PROJECTION_PATH', `Unsafe projection path: ${relative}`)
    }
    return normalized
}

function copyRegularFile(sourceRoot, targetRoot, relative) {
    const safe = safeRelative(relative)
    const source = path.resolve(sourceRoot, safe)
    const destination = path.resolve(targetRoot, safe)
    if (!isInside(source, path.resolve(sourceRoot)) || !isInside(destination, path.resolve(targetRoot))) {
        throw new FreshShadowVerifierError('PROJECTION_ESCAPE', `Projection path escaped its root: ${safe}`)
    }
    let stat
    try {
        stat = fs.lstatSync(source)
    } catch (error) {
        if (error.code === 'ENOENT') return
        throw error
    }
    if (!stat.isFile()) {
        throw new FreshShadowVerifierError('UNSUPPORTED_PROJECTION_ENTRY', `Projection input is not a regular file: ${safe}`)
    }
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(source, destination)
    fs.chmodSync(destination, stat.mode & 0o7777)
}

function writeBoundaryInputs(targetRoot, inputs) {
    for (const input of inputs) {
        const safe = safeRelative(input.path)
        const absolute = path.resolve(targetRoot, safe)
        if (!isInside(absolute, path.resolve(targetRoot))) {
            throw new FreshShadowVerifierError('BOUNDARY_INPUT_ESCAPE', `Boundary input escaped target: ${safe}`)
        }
        if (input.content === null) {
            try {
                fs.unlinkSync(absolute)
            } catch (error) {
                if (error.code !== 'ENOENT') throw error
            }
            continue
        }
        if (typeof input.content !== 'string') {
            throw new FreshShadowVerifierError('INVALID_BOUNDARY_INPUT', `${safe} boundary content must be text or null`)
        }
        fs.mkdirSync(path.dirname(absolute), { recursive: true })
        fs.writeFileSync(absolute, input.content, { mode: input.mode ?? 0o644 })
        fs.chmodSync(absolute, input.mode ?? 0o644)
    }
}

function validateBoundaryClasses(boundaryClasses, requiredBoundaryClassIds) {
    if (!Array.isArray(boundaryClasses) || boundaryClasses.length === 0) {
        throw new FreshShadowVerifierError('MISSING_BOUNDARY_CLASSES', 'At least one explicit boundary class is required')
    }
    if (!Array.isArray(requiredBoundaryClassIds) || requiredBoundaryClassIds.length === 0) {
        throw new FreshShadowVerifierError(
            'MISSING_BOUNDARY_CLASS_CONTRACT',
            'The complete required boundary-class ID set must be declared',
        )
    }
    const seen = new Set()
    for (const boundary of boundaryClasses) {
        if (!boundary || typeof boundary.id !== 'string' || boundary.id.length === 0 || !Array.isArray(boundary.inputs)) {
            throw new FreshShadowVerifierError('INVALID_BOUNDARY_CLASS', 'Every boundary class requires an id and inputs')
        }
        if (seen.has(boundary.id)) {
            throw new FreshShadowVerifierError('DUPLICATE_BOUNDARY_CLASS', `Duplicate boundary class ${boundary.id}`)
        }
        seen.add(boundary.id)
        for (const input of boundary.inputs) safeRelative(input.path)
    }
    const required = [...new Set(requiredBoundaryClassIds)].sort()
    const actual = [...seen].sort()
    if (
        required.length !== requiredBoundaryClassIds.length
        || JSON.stringify(required) !== JSON.stringify(actual)
    ) {
        throw new FreshShadowVerifierError('INCOMPLETE_BOUNDARY_CLASSES', 'Boundary classes do not match the required exact set', {
            required,
            actual,
        })
    }
}

function sealReceipt(payload) {
    return { ...payload, receiptSha256: jsonSha256(payload) }
}

function validateFreshShadowReceipt(receipt) {
    if (!receipt || receipt.schema !== FRESH_SHADOW_RECEIPT_SCHEMA) {
        throw new FreshShadowVerifierError('INVALID_SHADOW_RECEIPT', 'Fresh shadow receipt schema is invalid')
    }
    const { receiptSha256, ...payload } = receipt
    if (receiptSha256 !== jsonSha256(payload)) {
        throw new FreshShadowVerifierError('SHADOW_RECEIPT_HASH_MISMATCH', 'Fresh shadow receipt hash does not match')
    }
    const boundaryIds = new Set(receipt.boundaryClasses.map((entry) => entry.id))
    if (boundaryIds.size !== receipt.boundaryClasses.length) {
        throw new FreshShadowVerifierError('DUPLICATE_BOUNDARY_COVERAGE', 'Boundary coverage contains duplicates')
    }
    const localMasks = 2 ** receipt.component.visiblePackIds.length
    const expected = receipt.status === 'passed' ? localMasks * boundaryIds.size : 0
    if (
        receipt.coverage.localMasks !== (receipt.status === 'passed' ? localMasks : 0)
        || receipt.coverage.boundaryClasses !== (receipt.status === 'passed' ? boundaryIds.size : 0)
        || receipt.coverage.expectedExecutions !== expected
        || receipt.coverage.processedExecutions !== receipt.observations.length
        || receipt.observations.length !== expected
    ) {
        throw new FreshShadowVerifierError('INCOMPLETE_SHADOW_COVERAGE', 'Fresh shadow coverage is incomplete')
    }
    const seen = new Set()
    const processInstances = new Set()
    const projections = new Set()
    for (const observation of receipt.observations) {
        if (observation.mask < 0 || observation.mask >= localMasks || !boundaryIds.has(observation.boundaryClassId)) {
            throw new FreshShadowVerifierError('OUT_OF_RANGE_SHADOW_COVERAGE', 'Fresh shadow coverage is out of range')
        }
        const key = `${observation.boundaryClassId}:${observation.mask}`
        if (seen.has(key)) throw new FreshShadowVerifierError('DUPLICATE_SHADOW_COVERAGE', `Duplicate execution ${key}`)
        seen.add(key)
        if (processInstances.has(observation.processInstanceId) || projections.has(observation.projectionId)) {
            throw new FreshShadowVerifierError('REUSED_SHADOW_HISTORY', 'A process or projection was reused across local masks')
        }
        processInstances.add(observation.processInstanceId)
        projections.add(observation.projectionId)
        if (observation.repeatedChangeCount !== 0 || observation.restored !== true) {
            throw new FreshShadowVerifierError('INVALID_SHADOW_OBSERVATION', `Execution ${key} did not restore exactly`)
        }
    }
    if (receipt.status === 'passed' && receipt.fallback.required) {
        throw new FreshShadowVerifierError('FALLBACK_CANNOT_PASS_LOCAL', 'Fallback-required scope cannot pass locally')
    }
    if (receipt.status === 'fallback-required' && !receipt.fallback.required) {
        throw new FreshShadowVerifierError('MISSING_GLOBAL_FALLBACK', 'Fallback receipt must require Global Exhaustive')
    }
    return receipt
}

function spawnFreshMaskWorker({ sourceRoot, targetRoot, catalog, selectedPackIds, profile, managedPaths }) {
    const worker = path.join(sourceRoot, 'scripts/run-fresh-shadow-mask.cjs')
    const result = childProcess.spawnSync(process.execPath, [worker], {
        cwd: sourceRoot,
        env: { LANG: 'C', LC_ALL: 'C', TZ: 'UTC' },
        encoding: 'utf8',
        input: JSON.stringify({ targetRoot, catalog, selectedPackIds, profile, managedPaths }),
        maxBuffer: 16 * 1024 * 1024,
        timeout: 30_000,
        windowsHide: true,
    })
    if (result.error) {
        throw new FreshShadowVerifierError('SHADOW_WORKER_SPAWN_ERROR', 'Fresh shadow worker did not start', {
            code: result.error.code ?? null,
            message: result.error.message,
        })
    }
    if (result.signal !== null || result.status !== 0) {
        throw new FreshShadowVerifierError('SHADOW_WORKER_FAILED', 'Fresh shadow worker failed', {
            exitCode: result.status,
            signal: result.signal,
            stdout: result.stdout,
            stderr: result.stderr,
        })
    }
    if (typeof result.stdout !== 'string' || result.stdout.trim().length === 0) {
        throw new FreshShadowVerifierError('SHADOW_WORKER_EMPTY_OUTPUT', 'Fresh shadow worker returned no observation')
    }
    if (typeof result.stderr !== 'string' || result.stderr.length !== 0) {
        throw new FreshShadowVerifierError('SHADOW_WORKER_STDERR', 'Fresh shadow worker emitted stderr', { stderr: result.stderr })
    }
    try {
        return JSON.parse(result.stdout)
    } catch (error) {
        throw new FreshShadowVerifierError('SHADOW_WORKER_INVALID_OUTPUT', 'Fresh shadow worker output is not JSON', {
            cause: error.message,
        })
    }
}

function fallbackReceipt(component, graph) {
    return validateFreshShadowReceipt(sealReceipt({
        schema: FRESH_SHADOW_RECEIPT_SCHEMA,
        status: 'fallback-required',
        component: { id: component.id, packIds: [...component.packIds], visiblePackIds: [] },
        boundaryClasses: [],
        coverage: { localMasks: 0, boundaryClasses: 0, expectedExecutions: 0, processedExecutions: 0 },
        observations: [],
        isolation: {
            target: 'fresh-projection-per-mask-and-boundary',
            process: 'fresh-process-per-mask-and-boundary',
            moduleGraph: 'fresh-process-module-graph',
            calculationCaches: 'empty-per-process',
            unmanagedHistory: 'unique-temporary-root-per-process',
        },
        fallback: { required: true, reasons: [...graph.fallback.reasons] },
        canonicalProtection: {
            canonicalGate: 'Global Exhaustive',
            canonicalExecutionSkipped: false,
            certificatesIssued: 0,
            productionStateWritten: false,
            defaultChanged: false,
        },
    }))
}

function verifyFreshIsolatedComponent({
    sourceRoot,
    targetRoot,
    catalog,
    contract,
    graph,
    componentId,
    boundaryClasses,
    requiredBoundaryClassIds,
    profile = 'shadow-component-test',
}) {
    const component = graph.components.find((entry) => entry.id === componentId)
    if (!component) throw new FreshShadowVerifierError('UNKNOWN_COMPONENT', `Unknown component ${componentId}`)
    if (graph.fallback.required || component.packIds.some((packId) => {
        const tier = contract.packs.find((entry) => entry.packId === packId)?.tier
        return tier !== 'L' && tier !== 'B'
    })) return fallbackReceipt(component, graph)
    validateBoundaryClasses(boundaryClasses, requiredBoundaryClassIds)
    const source = fs.realpathSync(path.resolve(sourceRoot))
    const target = fs.realpathSync(path.resolve(targetRoot))
    const packSet = new Set(component.packIds)
    const componentCatalog = catalog.filter((pack) => packSet.has(pack.id))
    if (componentCatalog.length !== component.packIds.length) {
        throw new FreshShadowVerifierError('INCOMPLETE_COMPONENT_CATALOG', 'Component catalog coverage is incomplete')
    }
    const visiblePackIds = componentCatalog
        .filter((pack) => pack.userSelectable !== false)
        .map((pack) => pack.id)
        .sort()
    const managedPaths = [...new Set(componentCatalog.flatMap((pack) => pack.units.map((unit) => unit.file)))].sort()
    const projectionPaths = [...new Set(['package.json', ...managedPaths])].sort()
    const observations = []
    for (const boundary of boundaryClasses) {
        for (let mask = 0; mask < 2 ** visiblePackIds.length; mask += 1) {
            const projectionId = crypto.randomUUID()
            const projectionRoot = fs.mkdtempSync(path.join(os.tmpdir(), `patch-shadow-${projectionId}-`))
            const selectedPackIds = visiblePackIds.filter((_, index) => Math.floor(mask / (2 ** index)) % 2 === 1)
            try {
                for (const relative of projectionPaths) copyRegularFile(target, projectionRoot, relative)
                writeBoundaryInputs(projectionRoot, boundary.inputs)
                const observation = spawnFreshMaskWorker({
                    sourceRoot: source,
                    targetRoot: projectionRoot,
                    catalog: componentCatalog,
                    selectedPackIds,
                    profile,
                    managedPaths: [...new Set([...managedPaths, ...boundary.inputs.map((input) => input.path)])].sort(),
                })
                observations.push({
                    mask,
                    selectedPackIds,
                    boundaryClassId: boundary.id,
                    projectionId,
                    ...observation,
                })
                fs.rmSync(projectionRoot, { recursive: true, force: true })
            } catch (error) {
                throw new FreshShadowVerifierError('FRESH_SHADOW_FIRST_FAILURE', 'Fresh shadow execution failed', {
                    componentId,
                    boundaryClassId: boundary.id,
                    mask,
                    selectedPackIds,
                    phase: error.details?.phase ?? null,
                    projectionRoot,
                    causeCode: error.code ?? null,
                    cause: error.message,
                    worker: error.details ?? null,
                })
            }
        }
    }
    const payload = {
        schema: FRESH_SHADOW_RECEIPT_SCHEMA,
        status: 'passed',
        component: { id: component.id, packIds: [...component.packIds], visiblePackIds },
        boundaryClasses: boundaryClasses.map((boundary) => ({
            id: boundary.id,
            inputsSha256: jsonSha256(boundary.inputs),
        })),
        coverage: {
            localMasks: 2 ** visiblePackIds.length,
            boundaryClasses: boundaryClasses.length,
            expectedExecutions: (2 ** visiblePackIds.length) * boundaryClasses.length,
            processedExecutions: observations.length,
        },
        observations,
        isolation: {
            target: 'fresh-projection-per-mask-and-boundary',
            process: 'fresh-process-per-mask-and-boundary',
            moduleGraph: 'fresh-process-module-graph',
            calculationCaches: 'empty-per-process',
            unmanagedHistory: 'unique-temporary-root-per-process',
        },
        fallback: { required: false, reasons: [] },
        canonicalProtection: {
            canonicalGate: 'Global Exhaustive',
            canonicalExecutionSkipped: false,
            certificatesIssued: 0,
            productionStateWritten: false,
            defaultChanged: false,
        },
    }
    return validateFreshShadowReceipt(sealReceipt(payload))
}

module.exports = {
    FRESH_SHADOW_RECEIPT_SCHEMA,
    FreshShadowVerifierError,
    validateFreshShadowReceipt,
    verifyFreshIsolatedComponent,
}
