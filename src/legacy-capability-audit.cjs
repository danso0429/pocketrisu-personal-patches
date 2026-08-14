'use strict'

const childProcess = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const {
    CapabilityContractError,
    jsonSha256,
} = require('./capability-contract.cjs')

const LEGACY_ACCESS_RECEIPT_SCHEMA = 'patch-legacy-access-receipt-v1'

function permissionPreflight() {
    const flags = process.allowedNodeEnvironmentFlags
    const required = [
        '--permission',
        '--allow-fs-read',
        '--disallow-code-generation-from-strings',
        '--no-addons',
        '--no-global-search-paths',
    ]
    const missing = required.filter((flag) => !flags.has(flag))
    return {
        available: missing.length === 0,
        missing,
        networkPermissionSupported: flags.has('--allow-net'),
        nodeVersion: process.version,
    }
}

function validateLegacyAccessReceipt(receipt, {
    sourceRoot,
    allowedReadPaths,
    expectedPackCount,
    expectedUnitCount,
}) {
    if (!receipt || receipt.schema !== LEGACY_ACCESS_RECEIPT_SCHEMA) {
        throw new CapabilityContractError('INVALID_ACCESS_RECEIPT', 'Legacy access receipt schema is invalid')
    }
    const { payloadSha256, ...payload } = receipt
    if (payloadSha256 !== jsonSha256(payload)) {
        throw new CapabilityContractError('ACCESS_RECEIPT_HASH_MISMATCH', 'Legacy access receipt hash does not match')
    }
    if (receipt.status !== 'pass' || receipt.violations.length !== 0) {
        throw new CapabilityContractError('LEGACY_ACCESS_VIOLATION', 'Legacy catalog access was not admitted', {
            violations: receipt.violations,
        })
    }
    if (receipt.sourceRoot !== sourceRoot) {
        throw new CapabilityContractError('ACCESS_RECEIPT_SOURCE_MISMATCH', 'Legacy access receipt used another source')
    }
    if (
        receipt.catalog.packCount !== expectedPackCount
        || receipt.catalog.unitCount !== expectedUnitCount
    ) {
        throw new CapabilityContractError('ACCESS_RECEIPT_COVERAGE_MISMATCH', 'Legacy catalog coverage is incomplete')
    }
    if (
        receipt.permissions.enabled !== true
        || receipt.permissions.sourceReadRoot !== false
        || receipt.permissions.declaredReads !== true
        || receipt.permissions.declaredReadCount !== allowedReadPaths.length
        || receipt.permissions.declaredReadsSha256 !== jsonSha256(allowedReadPaths)
        || receipt.permissions.sourceWrite !== false
        || receipt.permissions.childProcess !== false
        || receipt.permissions.worker !== false
    ) {
        throw new CapabilityContractError('ACCESS_PERMISSION_MISMATCH', 'Legacy wrapper permissions are not fail closed')
    }
    if (
        receipt.accesses.callCount <= 0
        || receipt.accesses.uniqueCount <= 0
        || !Array.isArray(receipt.accesses.records)
        || receipt.accesses.recordsSha256 !== jsonSha256(receipt.accesses.records)
    ) {
        throw new CapabilityContractError('ACCESS_RECEIPT_EMPTY', 'Legacy access receipt has no complete access records')
    }
    return receipt
}

function auditLegacyCatalogLoad({
    sourceRoot,
    allowedReadPaths,
    expectedPackCount,
    expectedUnitCount,
    timeoutMs = 30_000,
    maxOutputBytes = 16 * 1024 * 1024,
}) {
    const preflight = permissionPreflight()
    if (!preflight.available) {
        throw new CapabilityContractError(
            'CAPABILITY_PERMISSION_UNAVAILABLE',
            'The current Node runtime cannot create the deny-by-default legacy wrapper',
            preflight,
        )
    }
    const root = fs.realpathSync(path.resolve(sourceRoot))
    const worker = path.join(root, 'scripts/run-capability-audit-worker.cjs')
    if (!Array.isArray(allowedReadPaths) || allowedReadPaths.length === 0) {
        throw new CapabilityContractError('EMPTY_CATALOG_READ_DECLARATION', 'Legacy catalog reads must be declared')
    }
    const declaredReads = [...new Set(allowedReadPaths.map((file) => {
        const absolute = path.resolve(root, file)
        if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
            throw new CapabilityContractError('CATALOG_READ_ESCAPE', `Declared catalog read escapes source: ${file}`)
        }
        return absolute
    }))].sort()
    const permissionReads = [...new Set([worker, ...declaredReads])].sort()
    const result = childProcess.spawnSync(process.execPath, [
        '--permission',
        ...permissionReads.map((file) => `--allow-fs-read=${file}`),
        '--disallow-code-generation-from-strings',
        '--no-addons',
        '--no-global-search-paths',
        worker,
    ], {
        cwd: root,
        env: {
            LANG: 'C',
            LC_ALL: 'C',
            TZ: 'UTC',
        },
        encoding: 'utf8',
        maxBuffer: maxOutputBytes,
        input: JSON.stringify({ sourceRoot: root, allowedReadPaths: declaredReads }),
        timeout: timeoutMs,
        windowsHide: true,
    })
    if (result.error) {
        throw new CapabilityContractError('ACCESS_WORKER_SPAWN_ERROR', 'Legacy access worker did not start', {
            code: result.error.code ?? null,
            message: result.error.message,
        })
    }
    if (result.signal !== null || result.status !== 0) {
        throw new CapabilityContractError('ACCESS_WORKER_FAILED', 'Legacy access worker failed', {
            exitCode: result.status,
            signal: result.signal,
            stdout: result.stdout,
            stderr: result.stderr,
        })
    }
    if (typeof result.stdout !== 'string' || result.stdout.trim().length === 0) {
        throw new CapabilityContractError('ACCESS_WORKER_EMPTY_OUTPUT', 'Legacy access worker returned no receipt')
    }
    if (typeof result.stderr !== 'string' || result.stderr.length !== 0) {
        throw new CapabilityContractError('ACCESS_WORKER_STDERR', 'Legacy access worker emitted stderr', {
            stderr: result.stderr,
        })
    }
    let receipt
    try {
        receipt = JSON.parse(result.stdout)
    } catch (error) {
        throw new CapabilityContractError('ACCESS_WORKER_INVALID_OUTPUT', 'Legacy access receipt is not JSON', {
            cause: error.message,
        })
    }
    return {
        preflight,
        receipt: validateLegacyAccessReceipt(receipt, {
            sourceRoot: root,
            allowedReadPaths: declaredReads,
            expectedPackCount,
            expectedUnitCount,
        }),
    }
}

module.exports = {
    LEGACY_ACCESS_RECEIPT_SCHEMA,
    auditLegacyCatalogLoad,
    permissionPreflight,
    validateLegacyAccessReceipt,
}
