'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const {
    canonicalJsonBytes,
    sha256,
} = require('./qualification-object-store.cjs')

const EXECUTION_STATE_SCHEMA = 'patch-toolchain-shadow-qualification-execution-state-v2'
const QUALIFICATION_RUN_IDENTITY_SCHEMA = 'patch-toolchain-shadow-qualification-run-identity-v1'
const RUN_ID_SCHEMA = 'patch-toolchain-shadow-qualification-run-id-v1'
const RUN_IDENTITY_INTEGRITY_SCHEMA = 'patch-toolchain-shadow-qualification-run-identity-integrity-v1'
const HASH_PATTERN = /^[0-9a-f]{64}$/
const COMMIT_PATTERN = /^[0-9a-f]{40}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const PHASES = Object.freeze([
    'initialized-before-execution',
    'provisioning-retained',
    'local-launch-recorded-before-execution',
    'local-receipt-retained',
    'global-launch-recorded-before-execution',
    'global-receipt-retained',
    'comparison-passed',
    'verification-and-registration-started',
    'registration-complete',
    'operating-preflight-complete',
    'completed',
    'failed',
])

const FORWARD_TRANSITIONS = new Map([
    ['initialized-before-execution', 'provisioning-retained'],
    ['provisioning-retained', 'local-launch-recorded-before-execution'],
    ['local-launch-recorded-before-execution', 'local-receipt-retained'],
    ['local-receipt-retained', 'global-launch-recorded-before-execution'],
    ['global-launch-recorded-before-execution', 'global-receipt-retained'],
    ['global-receipt-retained', 'comparison-passed'],
    ['comparison-passed', 'verification-and-registration-started'],
    ['verification-and-registration-started', 'registration-complete'],
    ['registration-complete', 'operating-preflight-complete'],
    ['operating-preflight-complete', 'completed'],
])

class ToolchainShadowQualificationExecutionStateError extends Error {
    constructor(code, message, details = null) {
        super(message)
        this.name = 'ToolchainShadowQualificationExecutionStateError'
        this.code = code
        this.details = details
    }
}

function fail(code, message, details = null) {
    throw new ToolchainShadowQualificationExecutionStateError(code, message, details)
}

function exactKeys(value, expected, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || canonicalJsonBytes(Object.keys(value).sort()).compare(
            canonicalJsonBytes([...expected].sort()),
        ) !== 0) {
        fail('INVALID_QUALIFICATION_EXECUTION_STATE', `${label} fields differ`)
    }
}

function validateHash(value, label) {
    if (!HASH_PATTERN.test(value ?? '')) {
        fail('INVALID_QUALIFICATION_EXECUTION_STATE', `${label} is invalid`)
    }
}

function validateCommit(value, label) {
    if (!COMMIT_PATTERN.test(value ?? '')) {
        fail('INVALID_QUALIFICATION_RUN_IDENTITY', `${label} is invalid`)
    }
}

function runIdentityPayload(record) {
    return {
        schema: record.schema,
        qualificationRunId: record.qualificationRunId,
        createdAt: record.createdAt,
        nonce: record.nonce,
        bindings: structuredClone(record.bindings),
    }
}

function buildQualificationRunIdentity({
    subject,
    sourceIdentity,
    materialDeclaration,
    createdAt = new Date().toISOString(),
    nonce = crypto.randomUUID(),
}) {
    if (!subject || typeof subject !== 'object'
        || !sourceIdentity || typeof sourceIdentity !== 'object'
        || !materialDeclaration || typeof materialDeclaration !== 'object'
        || Number.isNaN(Date.parse(createdAt))
        || new Date(createdAt).toISOString() !== createdAt
        || !UUID_PATTERN.test(nonce)) {
        fail('INVALID_QUALIFICATION_RUN_IDENTITY', 'Qualification run identity inputs are invalid')
    }
    const bindings = {
        qualificationInputSha256: sha256(canonicalJsonBytes({
            subject,
            sourceIdentity,
            materialDeclaration,
        })),
        implementationCommit: subject.implementationCommit,
        qualificationToolCommit: subject.qualificationToolCommit,
        policySha256: subject.policySha256,
        contractSha256: subject.contractSha256,
        compiledDeclarationSha256: subject.compiledDeclarationSha256,
        targetCommit: subject.targetCommit,
        targetApplicationTreeSha256: subject.targetApplicationTreeSha256,
    }
    const qualificationRunId = sha256(canonicalJsonBytes({
        schema: RUN_ID_SCHEMA,
        createdAt,
        nonce,
        bindings,
    }))
    const record = {
        schema: QUALIFICATION_RUN_IDENTITY_SCHEMA,
        qualificationRunId,
        createdAt,
        nonce,
        bindings,
        integrity: null,
    }
    record.integrity = {
        schema: RUN_IDENTITY_INTEGRITY_SCHEMA,
        payloadSha256: sha256(canonicalJsonBytes(runIdentityPayload(record))),
    }
    return validateQualificationRunIdentity(record)
}

function validateQualificationRunIdentity(record) {
    exactKeys(record, [
        'schema', 'qualificationRunId', 'createdAt', 'nonce', 'bindings', 'integrity',
    ], 'qualification run identity')
    if (record.schema !== QUALIFICATION_RUN_IDENTITY_SCHEMA
        || !UUID_PATTERN.test(record.nonce ?? '')
        || Number.isNaN(Date.parse(record.createdAt))
        || new Date(record.createdAt).toISOString() !== record.createdAt) {
        fail('INVALID_QUALIFICATION_RUN_IDENTITY', 'Qualification run provenance differs')
    }
    exactKeys(record.bindings, [
        'qualificationInputSha256', 'implementationCommit', 'qualificationToolCommit',
        'policySha256', 'contractSha256', 'compiledDeclarationSha256', 'targetCommit',
        'targetApplicationTreeSha256',
    ], 'qualification run bindings')
    validateHash(record.bindings.qualificationInputSha256, 'qualification input identity')
    validateCommit(record.bindings.implementationCommit, 'qualification implementation commit')
    validateCommit(record.bindings.qualificationToolCommit, 'qualification tooling commit')
    validateHash(record.bindings.policySha256, 'qualification policy')
    validateHash(record.bindings.contractSha256, 'qualification contract')
    validateHash(record.bindings.compiledDeclarationSha256, 'compiled declaration')
    validateCommit(record.bindings.targetCommit, 'qualification target commit')
    validateHash(record.bindings.targetApplicationTreeSha256, 'qualification target tree')
    validateHash(record.qualificationRunId, 'qualification run ID')
    const expectedRunId = sha256(canonicalJsonBytes({
        schema: RUN_ID_SCHEMA,
        createdAt: record.createdAt,
        nonce: record.nonce,
        bindings: record.bindings,
    }))
    if (record.qualificationRunId !== expectedRunId) {
        fail('INVALID_QUALIFICATION_RUN_IDENTITY', 'Qualification run ID does not match its bindings')
    }
    exactKeys(record.integrity, ['schema', 'payloadSha256'], 'qualification run integrity')
    if (record.integrity.schema !== RUN_IDENTITY_INTEGRITY_SCHEMA
        || record.integrity.payloadSha256 !== sha256(canonicalJsonBytes(runIdentityPayload(record)))) {
        fail('INVALID_QUALIFICATION_RUN_IDENTITY', 'Qualification run identity integrity differs')
    }
    return record
}

function runIdentitySha256(record) {
    return sha256(canonicalJsonBytes(validateQualificationRunIdentity(record)))
}

function createInitialExecutionState({ runIdentity }) {
    validateQualificationRunIdentity(runIdentity)
    return validateExecutionState({
        schema: EXECUTION_STATE_SCHEMA,
        qualificationRunId: runIdentity.qualificationRunId,
        qualificationRunIdentitySha256: runIdentitySha256(runIdentity),
        sequence: 0,
        status: 'running',
        phase: 'initialized-before-execution',
        provisioningReceiptSha256: null,
        local: { launches: 0, casesCompleted: null, receiptRetained: false },
        global: { launches: 0, masksCompleted: null, receiptRetained: false },
        failure: null,
    }, { runIdentity })
}

function validateExecutionState(state, { runIdentity = null } = {}) {
    exactKeys(state, [
        'schema', 'qualificationRunId', 'qualificationRunIdentitySha256', 'sequence',
        'status', 'phase', 'provisioningReceiptSha256', 'local', 'global', 'failure',
    ], 'qualification execution state')
    if (state.schema !== EXECUTION_STATE_SCHEMA
        || !PHASES.includes(state.phase)
        || !['running', 'passed', 'failed'].includes(state.status)
        || !Number.isSafeInteger(state.sequence) || state.sequence < 0) {
        fail('INVALID_QUALIFICATION_EXECUTION_STATE', 'Qualification execution state identity differs')
    }
    validateHash(state.qualificationRunId, 'qualification execution run ID')
    validateHash(state.qualificationRunIdentitySha256, 'qualification run identity binding')
    if (state.provisioningReceiptSha256 !== null) {
        validateHash(state.provisioningReceiptSha256, 'qualification provisioning receipt')
    }
    if (runIdentity !== null) {
        validateQualificationRunIdentity(runIdentity)
        if (state.qualificationRunId !== runIdentity.qualificationRunId
            || state.qualificationRunIdentitySha256 !== runIdentitySha256(runIdentity)) {
            fail('QUALIFICATION_EXECUTION_STATE_RUN_MISMATCH', 'Execution state belongs to another qualification run')
        }
    }
    exactKeys(state.local, ['launches', 'casesCompleted', 'receiptRetained'], 'local execution state')
    exactKeys(state.global, ['launches', 'masksCompleted', 'receiptRetained'], 'Global execution state')
    for (const [label, launches] of [
        ['local', state.local.launches], ['Global', state.global.launches],
    ]) if (![0, 1].includes(launches)) {
        fail('INVALID_QUALIFICATION_EXECUTION_STATE', `${label} launch count differs`)
    }
    for (const [label, value] of [
        ['local cases', state.local.casesCompleted], ['Global masks', state.global.masksCompleted],
    ]) if (value !== null && (!Number.isSafeInteger(value) || value < 0)) {
        fail('INVALID_QUALIFICATION_EXECUTION_STATE', `${label} differs`)
    }
    if (typeof state.local.receiptRetained !== 'boolean'
        || typeof state.global.receiptRetained !== 'boolean') {
        fail('INVALID_QUALIFICATION_EXECUTION_STATE', 'Qualification receipt-retention state differs')
    }
    if (state.local.launches === 0
        && (state.local.casesCompleted !== null || state.local.receiptRetained)) {
        fail('INVALID_QUALIFICATION_EXECUTION_STATE', 'Local completion exists without a launch')
    }
    if (state.local.casesCompleted !== null && !state.local.receiptRetained) {
        fail('INVALID_QUALIFICATION_EXECUTION_STATE', 'Local completion exists without a retained receipt')
    }
    if (state.global.launches === 1 && !state.local.receiptRetained) {
        fail('INVALID_QUALIFICATION_EXECUTION_STATE', 'Global launch precedes a retained local receipt')
    }
    if (state.global.launches === 0
        && (state.global.masksCompleted !== null || state.global.receiptRetained)) {
        fail('INVALID_QUALIFICATION_EXECUTION_STATE', 'Global completion exists without a launch')
    }
    if (state.global.masksCompleted !== null && !state.global.receiptRetained) {
        fail('INVALID_QUALIFICATION_EXECUTION_STATE', 'Global completion exists without a retained receipt')
    }
    const terminalStatus = state.phase === 'completed'
        ? 'passed'
        : (state.phase === 'failed' ? 'failed' : 'running')
    if (state.status !== terminalStatus) {
        fail('INVALID_QUALIFICATION_EXECUTION_STATE', 'Execution status and phase differ')
    }
    if (state.phase === 'failed') {
        exactKeys(state.failure, ['phase', 'code', 'message'], 'qualification failure')
        if (!PHASES.includes(state.failure.phase) || ['completed', 'failed'].includes(state.failure.phase)
            || typeof state.failure.code !== 'string' || state.failure.code.length === 0
            || typeof state.failure.message !== 'string') {
            fail('INVALID_QUALIFICATION_EXECUTION_STATE', 'Qualification failure details differ')
        }
    } else if (state.failure !== null) {
        fail('INVALID_QUALIFICATION_EXECUTION_STATE', 'Nonfailed execution state contains a failure')
    }
    const phaseIndex = PHASES.indexOf(state.phase)
    const provisioningIndex = PHASES.indexOf('provisioning-retained')
    if (state.phase !== 'failed') {
        if (phaseIndex < provisioningIndex && state.provisioningReceiptSha256 !== null) {
            fail('INVALID_QUALIFICATION_EXECUTION_STATE', 'Provisioning identity appeared before retention')
        }
        if (phaseIndex >= provisioningIndex && state.provisioningReceiptSha256 === null) {
            fail('INVALID_QUALIFICATION_EXECUTION_STATE', 'Provisioning identity is missing after retention')
        }
        if (phaseIndex >= PHASES.indexOf('local-launch-recorded-before-execution')
            && state.local.launches !== 1) {
            fail('INVALID_QUALIFICATION_EXECUTION_STATE', 'Local launch fact is missing from its phase')
        }
        if (phaseIndex >= PHASES.indexOf('local-receipt-retained')
            && (!state.local.receiptRetained || state.local.casesCompleted === null)) {
            fail('INVALID_QUALIFICATION_EXECUTION_STATE', 'Local receipt facts are missing from their phase')
        }
        if (phaseIndex >= PHASES.indexOf('global-launch-recorded-before-execution')
            && state.global.launches !== 1) {
            fail('INVALID_QUALIFICATION_EXECUTION_STATE', 'Global launch fact is missing from its phase')
        }
        if (phaseIndex >= PHASES.indexOf('global-receipt-retained')
            && (!state.global.receiptRetained || state.global.masksCompleted === null)) {
            fail('INVALID_QUALIFICATION_EXECUTION_STATE', 'Global receipt facts are missing from their phase')
        }
    }
    return state
}

function transitionExecutionState(current, {
    phase,
    provisioningReceiptSha256 = current.provisioningReceiptSha256,
    local = current.local,
    global = current.global,
    failure = null,
    runIdentity = null,
} = {}) {
    validateExecutionState(current, { runIdentity })
    if (['completed', 'failed'].includes(current.phase)) {
        fail('QUALIFICATION_EXECUTION_STATE_TERMINAL', 'Terminal execution state cannot transition')
    }
    if (phase === current.phase) {
        fail('QUALIFICATION_EXECUTION_STATE_DUPLICATE', 'Duplicate qualification phase update is forbidden')
    }
    const expected = FORWARD_TRANSITIONS.get(current.phase)
    if (phase !== expected && phase !== 'failed') {
        fail('QUALIFICATION_EXECUTION_STATE_TRANSITION', 'Qualification phase predecessor differs', {
            current: current.phase,
            requested: phase,
            expected,
        })
    }
    let failureRecord = null
    if (phase === 'failed') {
        if (!failure || typeof failure.code !== 'string' || failure.code.length === 0
            || typeof failure.message !== 'string') {
            fail('INVALID_QUALIFICATION_EXECUTION_STATE', 'Terminal failure details are invalid')
        }
        failureRecord = { phase: current.phase, code: failure.code, message: failure.message }
    } else if (failure !== null) {
        fail('INVALID_QUALIFICATION_EXECUTION_STATE', 'Forward transition cannot carry failure details')
    }
    const next = {
        schema: EXECUTION_STATE_SCHEMA,
        qualificationRunId: current.qualificationRunId,
        qualificationRunIdentitySha256: current.qualificationRunIdentitySha256,
        sequence: current.sequence + 1,
        status: phase === 'completed' ? 'passed' : (phase === 'failed' ? 'failed' : 'running'),
        phase,
        provisioningReceiptSha256,
        local: structuredClone(local),
        global: structuredClone(global),
        failure: failureRecord,
    }
    validateExecutionState(next, { runIdentity })
    return validateTransition(current, next, { runIdentity })
}

function validateTransition(previous, next, { runIdentity = null } = {}) {
    validateExecutionState(previous, { runIdentity })
    validateExecutionState(next, { runIdentity })
    if (previous.qualificationRunId !== next.qualificationRunId
        || previous.qualificationRunIdentitySha256 !== next.qualificationRunIdentitySha256) {
        fail('QUALIFICATION_EXECUTION_STATE_RUN_MISMATCH', 'Execution-state transition crosses qualification runs')
    }
    if (next.sequence !== previous.sequence + 1) {
        fail('QUALIFICATION_EXECUTION_STATE_STALE', 'Execution-state sequence does not advance exactly once')
    }
    const expected = FORWARD_TRANSITIONS.get(previous.phase)
    if (next.phase !== expected && next.phase !== 'failed') {
        fail('QUALIFICATION_EXECUTION_STATE_TRANSITION', 'Execution-state predecessor differs')
    }
    if (['completed', 'failed'].includes(previous.phase)) {
        fail('QUALIFICATION_EXECUTION_STATE_TERMINAL', 'Terminal execution state cannot transition')
    }
    if (next.phase === 'failed' && next.failure.phase !== previous.phase) {
        fail('QUALIFICATION_EXECUTION_STATE_TRANSITION', 'Failure does not retain its predecessor phase')
    }
    const same = (left, right) => canonicalJsonBytes(left).equals(canonicalJsonBytes(right))
    const expectedFactChange = {
        'provisioning-retained': {
            provisioning: previous.provisioningReceiptSha256 === null
                && next.provisioningReceiptSha256 !== null,
            local: same(previous.local, next.local),
            global: same(previous.global, next.global),
        },
        'local-launch-recorded-before-execution': {
            provisioning: previous.provisioningReceiptSha256 === next.provisioningReceiptSha256,
            local: previous.local.launches === 0
                && previous.local.casesCompleted === null
                && previous.local.receiptRetained === false
                && next.local.launches === 1
                && next.local.casesCompleted === null
                && next.local.receiptRetained === false,
            global: same(previous.global, next.global),
        },
        'local-receipt-retained': {
            provisioning: previous.provisioningReceiptSha256 === next.provisioningReceiptSha256,
            local: previous.local.launches === 1
                && previous.local.casesCompleted === null
                && previous.local.receiptRetained === false
                && next.local.launches === 1
                && Number.isSafeInteger(next.local.casesCompleted)
                && next.local.receiptRetained === true,
            global: same(previous.global, next.global),
        },
        'global-launch-recorded-before-execution': {
            provisioning: previous.provisioningReceiptSha256 === next.provisioningReceiptSha256,
            local: same(previous.local, next.local),
            global: previous.global.launches === 0
                && previous.global.masksCompleted === null
                && previous.global.receiptRetained === false
                && next.global.launches === 1
                && next.global.masksCompleted === null
                && next.global.receiptRetained === false,
        },
        'global-receipt-retained': {
            provisioning: previous.provisioningReceiptSha256 === next.provisioningReceiptSha256,
            local: same(previous.local, next.local),
            global: previous.global.launches === 1
                && previous.global.masksCompleted === null
                && previous.global.receiptRetained === false
                && next.global.launches === 1
                && Number.isSafeInteger(next.global.masksCompleted)
                && next.global.receiptRetained === true,
        },
    }
    const unchangedFacts = {
        provisioning: previous.provisioningReceiptSha256 === next.provisioningReceiptSha256,
        local: same(previous.local, next.local),
        global: same(previous.global, next.global),
    }
    const facts = next.phase === 'failed'
        ? unchangedFacts
        : (expectedFactChange[next.phase] ?? unchangedFacts)
    if (!facts.provisioning || !facts.local || !facts.global) {
        fail('QUALIFICATION_EXECUTION_STATE_FACT_REGRESSION',
            'Qualification execution facts changed outside their exact milestone')
    }
    return next
}

function writeAll(io, descriptor, bytes) {
    let offset = 0
    while (offset < bytes.length) {
        offset += io.writeSync(descriptor, bytes, offset, bytes.length - offset, null)
    }
}

function fsyncDirectory(io, directory) {
    const descriptor = io.openSync(directory, io.constants.O_RDONLY)
    try { io.fsyncSync(descriptor) } finally { io.closeSync(descriptor) }
}

function readCurrentState(io, file, { runIdentity }) {
    const stat = io.lstatSync(file)
    if (!stat.isFile() || stat.isSymbolicLink()) {
        fail('INVALID_QUALIFICATION_EXECUTION_STATE_PATH', 'Execution-state path is not a regular file')
    }
    const bytes = io.readFileSync(file)
    let parsed
    try { parsed = JSON.parse(bytes) } catch (error) {
        fail('INVALID_QUALIFICATION_EXECUTION_STATE', 'Execution-state JSON is malformed', {
            message: error.message,
        })
    }
    validateExecutionState(parsed, { runIdentity })
    if (!bytes.equals(canonicalJsonBytes(parsed))) {
        fail('NONCANONICAL_QUALIFICATION_EXECUTION_STATE', 'Execution-state JSON is not canonical')
    }
    return parsed
}

function persistQualificationExecutionState(file, {
    previous = null,
    next,
    runIdentity,
} = {}, { io = fs } = {}) {
    validateQualificationRunIdentity(runIdentity)
    const absolute = path.resolve(file)
    const directory = path.dirname(absolute)
    if (path.basename(absolute) !== 'execution-state.json') {
        fail('INVALID_QUALIFICATION_EXECUTION_STATE_PATH', 'Mutable state API only permits execution-state.json')
    }
    const runIdentityFile = path.join(directory, 'qualification-run.json')
    if (!io.existsSync(runIdentityFile)) {
        fail('MISSING_QUALIFICATION_RUN_IDENTITY', 'Immutable qualification run identity is missing')
    }
    const runIdentityStat = io.lstatSync(runIdentityFile)
    const retainedRunIdentityBytes = io.readFileSync(runIdentityFile)
    let retainedRunIdentity = null
    try { retainedRunIdentity = JSON.parse(retainedRunIdentityBytes) } catch {}
    if (!runIdentityStat.isFile() || runIdentityStat.isSymbolicLink()
        || retainedRunIdentity === null
        || !canonicalJsonBytes(validateQualificationRunIdentity(retainedRunIdentity))
            .equals(canonicalJsonBytes(runIdentity))) {
        fail('QUALIFICATION_EXECUTION_STATE_RUN_MISMATCH', 'Retained qualification run identity differs')
    }
    const temporary = path.join(
        directory,
        `.${path.basename(absolute)}.${process.pid}.${crypto.randomUUID()}.tmp`,
    )
    if (previous === null) {
        validateExecutionState(next, { runIdentity })
        if (next.sequence !== 0 || next.phase !== 'initialized-before-execution') {
            fail('QUALIFICATION_EXECUTION_STATE_TRANSITION', 'Initial execution state differs')
        }
        if (io.existsSync(absolute)) {
            fail('QUALIFICATION_EXECUTION_STATE_EXISTS', 'Initial execution state already exists')
        }
    } else {
        validateTransition(previous, next, { runIdentity })
        if (!io.existsSync(absolute)) {
            fail('QUALIFICATION_EXECUTION_STATE_MISSING', 'Current execution state is missing')
        }
        const current = readCurrentState(io, absolute, { runIdentity })
        if (!canonicalJsonBytes(current).equals(canonicalJsonBytes(previous))) {
            fail('QUALIFICATION_EXECUTION_STATE_STALE', 'Current execution state differs from the expected predecessor')
        }
    }
    const bytes = canonicalJsonBytes(next)
    let published = false
    try {
        const descriptor = io.openSync(
            temporary,
            io.constants.O_CREAT | io.constants.O_EXCL | io.constants.O_WRONLY,
            0o600,
        )
        try {
            writeAll(io, descriptor, bytes)
            io.fsyncSync(descriptor)
        } finally { io.closeSync(descriptor) }
        const temporaryBytes = io.readFileSync(temporary)
        if (!temporaryBytes.equals(bytes)) {
            fail('QUALIFICATION_EXECUTION_STATE_REREAD_FAILED', 'Temporary execution state differs after fsync')
        }
        validateExecutionState(JSON.parse(temporaryBytes), { runIdentity })
        if (previous === null) {
            io.linkSync(temporary, absolute)
        } else {
            const current = readCurrentState(io, absolute, { runIdentity })
            if (!canonicalJsonBytes(current).equals(canonicalJsonBytes(previous))) {
                fail('QUALIFICATION_EXECUTION_STATE_STALE', 'Execution state changed before atomic replacement')
            }
            io.renameSync(temporary, absolute)
            published = true
        }
        io.chmodSync(absolute, 0o600)
        fsyncDirectory(io, directory)
        return next
    } finally {
        if (!published) {
            try { io.unlinkSync(temporary) } catch (error) {
                if (error.code !== 'ENOENT') throw error
            }
        }
    }
}

function preservePrimaryError(primary, persistenceError) {
    if (!(primary instanceof Error) || !(persistenceError instanceof Error)) {
        fail('INVALID_QUALIFICATION_EXECUTION_STATE', 'Failure preservation requires Error objects')
    }
    primary.details = {
        ...(primary.details && typeof primary.details === 'object' ? primary.details : {}),
        executionStatePersistenceFailure: {
            code: persistenceError.code ?? null,
            message: persistenceError.message,
            details: persistenceError.details ?? null,
        },
    }
    return primary
}

module.exports = {
    EXECUTION_STATE_SCHEMA,
    FORWARD_TRANSITIONS,
    PHASES,
    QUALIFICATION_RUN_IDENTITY_SCHEMA,
    ToolchainShadowQualificationExecutionStateError,
    buildQualificationRunIdentity,
    createInitialExecutionState,
    persistQualificationExecutionState,
    preservePrimaryError,
    runIdentitySha256,
    transitionExecutionState,
    validateExecutionState,
    validateQualificationRunIdentity,
    validateTransition,
}
