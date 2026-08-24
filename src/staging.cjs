'use strict'

const childProcess = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const {
    DEFAULT_INTENT_PATH,
    DEFAULT_JOURNAL_PATH,
    DEFAULT_STATE_PATH,
    status,
} = require('./manager.cjs')

const STAGING_RECEIPT_FORMAT = 1
const DEFAULT_STAGING_RECEIPT_PATH = 'save/pocketrisu-patches/staging.json'
const PRIVATE_RECEIPT_MODE = 0o600
const CHECK_OUTPUT_LIMIT = 12_000

class PatchStagingError extends Error {
    constructor(code, message, details = {}) {
        super(message)
        this.name = 'PatchStagingError'
        this.code = code
        this.details = details
    }
}

function readPackage(root) {
    let pkg
    try {
        pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
    } catch (error) {
        throw new PatchStagingError(
            'INVALID_STAGING_TARGET',
            'The staging candidate does not contain readable package metadata',
            { cause: error.message },
        )
    }
    if (pkg.name !== 'pocketrisu') {
        throw new PatchStagingError(
            'INVALID_STAGING_TARGET',
            'The staging candidate is not a PocketRisu source root',
            {
                packageName: typeof pkg.name === 'string' ? pkg.name : null,
                packageVersion: typeof pkg.version === 'string' ? pkg.version : null,
            },
        )
    }
    return pkg
}

function isNested(parent, child) {
    return child.startsWith(`${parent}${path.sep}`)
}

function gitTrackedChanges(root) {
    if (!fs.existsSync(path.join(root, '.git'))) return []
    const result = childProcess.spawnSync(
        'git',
        ['--no-pager', 'status', '--porcelain=v1', '--untracked-files=no'],
        {
            cwd: root,
            encoding: 'utf8',
            shell: false,
            maxBuffer: 1024 * 1024,
        },
    )
    if (result.error || result.status !== 0) {
        throw new PatchStagingError(
            'INVALID_STAGING_TARGET',
            'The staging candidate Git status could not be verified',
            {
                cause: result.error?.message ?? String(result.stderr ?? '').trim(),
                exitCode: result.status,
            },
        )
    }
    return String(result.stdout ?? '')
        .split('\n')
        .map((line) => line.trimEnd())
        .filter(Boolean)
        .slice(0, 100)
}

function assertFreshCandidate(candidateRoot) {
    const existingMetadata = [
        DEFAULT_STATE_PATH,
        DEFAULT_INTENT_PATH,
        DEFAULT_JOURNAL_PATH,
        DEFAULT_STAGING_RECEIPT_PATH,
    ].filter((relative) => fs.existsSync(path.join(candidateRoot, relative)))
    const trackedChanges = gitTrackedChanges(candidateRoot)
    if (existingMetadata.length > 0 || trackedChanges.length > 0) {
        throw new PatchStagingError(
            'DIRTY_STAGING_TARGET',
            'The staging candidate is not a fresh upstream baseline',
            {
                existingPatchMetadata: existingMetadata,
                trackedChanges,
            },
        )
    }
}

function assertStagingBoundary({ liveRoot, candidateRoot }) {
    let live
    let candidate
    try {
        live = fs.realpathSync(liveRoot)
        candidate = fs.realpathSync(candidateRoot)
    } catch (error) {
        throw new PatchStagingError(
            'INVALID_STAGING_TARGET',
            'The live root and staging candidate must both exist',
            { cause: error.message },
        )
    }
    if (
        live === candidate
        || isNested(live, candidate)
        || isNested(candidate, live)
    ) {
        throw new PatchStagingError(
            'STAGING_PATH_OVERLAP',
            'The staging candidate must be outside the live PocketRisu tree',
        )
    }
    const pkg = readPackage(candidate)
    assertFreshCandidate(candidate)
    return {
        liveRoot: live,
        candidateRoot: candidate,
        target: {
            packageName: pkg.name,
            packageVersion: typeof pkg.version === 'string' ? pkg.version : null,
        },
    }
}

function buildQualificationChecks(root, packs) {
    const pkg = readPackage(root)
    const pnpmMatch = typeof pkg.packageManager === 'string'
        ? pkg.packageManager.match(
            /^pnpm@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)(?:\+[0-9A-Za-z.-]+)?$/,
        )
        : null
    if (!pnpmMatch) {
        throw new PatchStagingError(
            'UNSUPPORTED_PACKAGE_MANAGER',
            'The qualified staging pipeline requires an explicit pnpm packageManager',
            { packageManager: pkg.packageManager ?? null },
        )
    }
    const expectedPnpmVersion = pnpmMatch[1]
    for (const script of ['test', 'check', 'build']) {
        if (typeof pkg.scripts?.[script] !== 'string') {
            throw new PatchStagingError(
                'MISSING_QUALIFICATION_CHECK',
                `The staging target does not define the required ${script} script`,
                { script },
            )
        }
    }
    const checks = [
        {
            id: 'package-manager-version',
            kind: 'check',
            command: 'pnpm',
            args: ['--version'],
            expectedStdout: expectedPnpmVersion,
        },
        {
            id: 'frozen-install',
            kind: 'check',
            command: 'pnpm',
            args: ['install', '--frozen-lockfile'],
        },
        {
            id: 'target-tests',
            kind: 'check',
            command: 'pnpm',
            args: ['test'],
        },
        {
            id: 'target-diagnostics',
            kind: 'check',
            command: 'pnpm',
            args: ['check'],
        },
        {
            id: 'production-build',
            kind: 'build',
            command: 'pnpm',
            args: ['build'],
        },
    ]
    if (packs.some((pack) => pack.id === 'background-import')) {
        if (!fs.existsSync(path.join(root, 'server/node/importParserBundle.build.cjs'))) {
            throw new PatchStagingError(
                'MISSING_QUALIFICATION_CHECK',
                'Background import is selected but its parser bundle builder is missing',
                { file: 'server/node/importParserBundle.build.cjs' },
            )
        }
        checks.splice(2, 0, {
            id: 'background-import-parser-bundle',
            kind: 'build',
            command: process.execPath,
            displayCommand: 'node',
            args: ['server/node/importParserBundle.build.cjs'],
        })
    }
    if (packs.some((pack) => pack.id === 'bg-preserve')) {
        if (!fs.existsSync(path.join(root, 'server/node/bgOrchBundle.build.cjs'))) {
            throw new PatchStagingError(
                'MISSING_QUALIFICATION_CHECK',
                'BG preserve is selected but its orchestration bundle builder is missing',
                { file: 'server/node/bgOrchBundle.build.cjs' },
            )
        }
        checks.push({
            id: 'bg-orchestration-bundle',
            kind: 'build',
            command: process.execPath,
            displayCommand: 'node',
            args: ['server/node/bgOrchBundle.build.cjs'],
        })
    }
    return checks
}

function assertPostCheckIntegrity({
    root,
    expectedPackCount,
    trackedChangesBeforeChecks,
}) {
    const managed = status({ root })
    const expectedStatus = expectedPackCount === 0 ? 'clean' : 'current'
    const trackedChangesAfterChecks = gitTrackedChanges(root)
    const trackedMatches = JSON.stringify(trackedChangesAfterChecks)
        === JSON.stringify(trackedChangesBeforeChecks)
    if (managed.status !== expectedStatus || !trackedMatches) {
        throw new PatchStagingError(
            'STAGING_SOURCE_DRIFT',
            'The staging checks changed source or managed patch state',
            {
                expectedManagedStatus: expectedStatus,
                observedManagedStatus: managed.status,
                driftedManagedFiles: managed.files
                    .filter((file) => file.status !== 'current')
                    .map((file) => file.file),
                trackedChangesBeforeChecks,
                trackedChangesAfterChecks,
            },
        )
    }
    return {
        managedStatus: managed.status,
        trackedChanges: trackedChangesAfterChecks,
    }
}

function outputTail(value) {
    const text = String(value ?? '')
    return text.length <= CHECK_OUTPUT_LIMIT
        ? text
        : text.slice(text.length - CHECK_OUTPUT_LIMIT)
}

function defaultCheckRunner(check, root) {
    return childProcess.spawnSync(check.command, check.args, {
        cwd: root,
        encoding: 'utf8',
        shell: false,
        maxBuffer: 8 * 1024 * 1024,
        env: process.env,
    })
}

function publicCheck(check, outcome) {
    return {
        id: check.id,
        kind: check.kind,
        command: [check.displayCommand ?? check.command, ...check.args],
        status: outcome.status,
        exitCode: outcome.exitCode,
        signal: outcome.signal,
        durationMs: outcome.durationMs,
        stdoutTail: outcome.stdoutTail,
        stderrTail: outcome.stderrTail,
    }
}

function runQualificationChecks({
    root,
    checks,
    runner = defaultCheckRunner,
    onProgress = () => {},
    now = () => Date.now(),
}) {
    const completed = []
    for (const check of checks) {
        onProgress({ status: 'running', check })
        const startedAt = now()
        const result = runner(check, root)
        const stdout = String(result.stdout ?? '')
        const expectationMatches = check.expectedStdout === undefined
            || stdout.trim() === check.expectedStdout
        const expectationError = expectationMatches
            ? ''
            : `Expected stdout ${JSON.stringify(check.expectedStdout)}, `
                + `observed ${JSON.stringify(stdout.trim())}`
        const outcome = publicCheck(check, {
            status: !result.error && result.status === 0 && expectationMatches
                ? 'passed'
                : 'failed',
            exitCode: Number.isInteger(result.status) ? result.status : null,
            signal: result.signal ?? null,
            durationMs: Math.max(0, now() - startedAt),
            stdoutTail: outputTail(stdout),
            stderrTail: outputTail(
                result.stderr || result.error?.message || expectationError,
            ),
        })
        completed.push(outcome)
        onProgress({ status: outcome.status, check, outcome })
        if (outcome.status === 'failed') {
            const code = check.kind === 'build' ? 'BUILD_FAILED' : 'CHECK_FAILED'
            throw new PatchStagingError(
                code,
                `Staging validation failed at ${check.id}`,
                {
                    check: outcome,
                    completed,
                },
            )
        }
    }
    return completed
}

function safeReceiptPath(root, relative) {
    if (
        typeof relative !== 'string'
        || !relative
        || path.isAbsolute(relative)
        || relative.includes('\0')
    ) {
        throw new PatchStagingError('UNSAFE_PATH', `Unsafe staging receipt path: ${relative}`)
    }
    const normalized = path.posix.normalize(relative.replaceAll('\\', '/'))
    if (
        normalized === '..'
        || normalized.startsWith('../')
        || normalized !== relative.replaceAll('\\', '/')
    ) {
        throw new PatchStagingError('UNSAFE_PATH', `Unsafe staging receipt path: ${relative}`)
    }
    const resolvedRoot = path.resolve(root)
    const absolute = path.resolve(resolvedRoot, normalized)
    if (!absolute.startsWith(`${resolvedRoot}${path.sep}`)) {
        throw new PatchStagingError('UNSAFE_PATH', `Staging receipt escapes root: ${relative}`)
    }
    return absolute
}

function assertNoSymlinkPath(root, relative) {
    let cursor = path.resolve(root)
    for (const part of relative.split('/')) {
        cursor = path.join(cursor, part)
        try {
            if (fs.lstatSync(cursor).isSymbolicLink()) {
                throw new PatchStagingError(
                    'SYMLINK_PATH',
                    `Refusing staging receipt through symlinked path: ${relative}`,
                )
            }
        } catch (error) {
            if (error.code === 'ENOENT') return
            throw error
        }
    }
}

function writeStagingReceipt(
    root,
    receipt,
    receiptPath = DEFAULT_STAGING_RECEIPT_PATH,
) {
    const absolute = safeReceiptPath(root, receiptPath)
    assertNoSymlinkPath(root, receiptPath)
    fs.mkdirSync(path.dirname(absolute), { recursive: true })
    assertNoSymlinkPath(root, receiptPath)
    const temporary = `${absolute}.tmp-${process.pid}-${crypto.randomUUID()}`
    try {
        fs.writeFileSync(
            temporary,
            `${JSON.stringify(receipt, null, 2)}\n`,
            { flag: 'wx', mode: PRIVATE_RECEIPT_MODE },
        )
        fs.chmodSync(temporary, PRIVATE_RECEIPT_MODE)
        fs.renameSync(temporary, absolute)
    } catch (error) {
        try {
            fs.unlinkSync(temporary)
        } catch (cleanupError) {
            if (cleanupError.code !== 'ENOENT') error.cleanupError = cleanupError
        }
        throw error
    }
    return { path: receiptPath }
}

function makeStagingReceipt({
    status,
    patcherVersion,
    transition,
    compatibility,
    checks,
    error = null,
    now = new Date(),
}) {
    return {
        format: STAGING_RECEIPT_FORMAT,
        status,
        createdAt: now.toISOString(),
        patcherVersion,
        target: compatibility.target,
        selection: transition.resolution,
        packs: transition.packs,
        sourceFiles: transition.state?.files ?? {},
        checks,
        error: error ? {
            code: error.code ?? error.name ?? 'UNKNOWN_ERROR',
            message: String(error.message ?? error),
        } : null,
        liveSourceFilesChanged: false,
        readyForManualCutover: status === 'ready',
    }
}

module.exports = {
    DEFAULT_STAGING_RECEIPT_PATH,
    PatchStagingError,
    STAGING_RECEIPT_FORMAT,
    assertFreshCandidate,
    assertPostCheckIntegrity,
    assertStagingBoundary,
    buildQualificationChecks,
    gitTrackedChanges,
    makeStagingReceipt,
    runQualificationChecks,
    writeStagingReceipt,
}
