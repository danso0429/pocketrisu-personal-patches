#!/usr/bin/env node
'use strict'

// Maintainer-only subset verification harness. It applies a pack subset (with
// its dependency closure) to a disposable PocketRisu git checkout, runs the
// target's checks, reverts, and writes <out>/receipt.json. The receipt is
// subset evidence only; it is never a qualification (`qualification: false`).
// The catalog, manager, staging and installer modules must not import it.

const childProcess = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const {
    DEFAULT_INTENT_PATH,
    DEFAULT_JOURNAL_PATH,
    DEFAULT_LOCK_PATH,
    DEFAULT_STATE_PATH,
    applyTransition,
    packEtag,
    planTransition,
    status,
    withRootLock,
} = require('../src/manager.cjs')
const { resolveSubsetClosure } = require('./lib/subset-closure.cjs')
const { validateTargetCoverage } = require('./lib/target-coverage.cjs')

const RECEIPT_FORMAT = 1
const PACKAGE_NAME = 'pocketrisu'
const REQUIRED_NODE_OPTION = '--no-experimental-webstorage'
const OUTPUT_TAIL_LIMIT = 12_000
const BG_PRESERVE_PACK = 'bg-preserve'
const METADATA_PATHS = [
    DEFAULT_STATE_PATH,
    DEFAULT_INTENT_PATH,
    DEFAULT_JOURNAL_PATH,
    DEFAULT_LOCK_PATH,
]
// Compose and revert refusals that mean the managed tree no longer matches
// what the harness applied.
const DRIFT_CODES = new Set([
    'OWNED_DRIFT',
    'MANAGED_BLOCK_COUNT',
    'MARKER_DRIFT',
    'MISSING_FILE',
    'STALE_TRANSITION',
])

const repositoryRoot = path.resolve(__dirname, '..')

class SubsetQualificationError extends Error {
    constructor(code, message, details = {}) {
        super(message)
        this.name = 'SubsetQualificationError'
        this.code = code
        this.details = details
    }
}

function fail(code, message, details) {
    throw new SubsetQualificationError(code, message, details)
}

// Untracked and ignored paths that the checks may leave behind by name.
// Nothing else is excluded from the post-revert comparison.
function isNamedArtifact(relative) {
    const clean = relative.replace(/\/$/, '')
    return clean.split('/').includes('node_modules')
        || clean === 'dist'
        || clean.startsWith('dist/')
        || clean === 'server/node/bgOrchBundle.css'
        || clean === 'server/node/bgOrchBundle.mjs'
        // Left by the upstream `pnpm test` server logs.
        || clean === 'save/logs.db'
        || clean === 'save/logs.db-wal'
        || clean === 'save/logs.db-shm'
}

function tail(value) {
    const text = String(value ?? '')
    return text.length <= OUTPUT_TAIL_LIMIT ? text : text.slice(text.length - OUTPUT_TAIL_LIMIT)
}

function sha256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex')
}

function runGit(cwd, args) {
    const result = childProcess.spawnSync('git', ['--no-pager', ...args], {
        cwd,
        encoding: 'utf8',
        shell: false,
        maxBuffer: 64 * 1024 * 1024,
    })
    return {
        ok: !result.error && result.status === 0,
        stdout: String(result.stdout ?? ''),
        stderr: String(result.stderr ?? result.error?.message ?? ''),
    }
}

function porcelainEntries(root, extraArgs) {
    const result = runGit(root, ['status', '--porcelain=v1', '-z', ...extraArgs])
    if (!result.ok) {
        fail('GIT_STATUS_FAILED', 'git status failed for the target root', {
            stderr: result.stderr.trim(),
        })
    }
    const fields = result.stdout.split('\0').filter(Boolean)
    const entries = []
    for (let index = 0; index < fields.length; index += 1) {
        const field = fields[index]
        const code = field.slice(0, 2)
        entries.push(field)
        // Renames and copies carry the source path as the next field.
        if (code.includes('R') || code.includes('C')) {
            index += 1
            entries[entries.length - 1] = `${field}\0${fields[index]}`
        }
    }
    return entries
}

function trackedChanges(root) {
    return porcelainEntries(root, ['--untracked-files=no'])
}

// Files and symlinks below an untracked or ignored directory, without following
// symlinks. Named artifacts (including node_modules and dist) are not walked.
function listDirectoryFiles(root, relativeDirectory, entries) {
    const directory = relativeDirectory.replace(/\/$/, '')
    for (const name of fs.readdirSync(path.join(root, directory))) {
        const relative = `${directory}/${name}`
        if (isNamedArtifact(relative)) continue
        const stat = fs.lstatSync(path.join(root, relative))
        if (stat.isDirectory()) listDirectoryFiles(root, relative, entries)
        else entries.push(relative)
    }
}

function untrackedAndIgnored(root) {
    const entries = []
    for (const relative of porcelainEntries(root, ['--untracked-files=all', '--ignored=matching'])
        .filter((entry) => entry.startsWith('?? ') || entry.startsWith('!! '))
        .map((entry) => entry.slice(3))) {
        if (isNamedArtifact(relative)) continue
        if (relative.endsWith('/')) listDirectoryFiles(root, relative, entries)
        else entries.push(relative)
    }
    return entries.sort()
}

function lstatOrNull(absolute) {
    try {
        return fs.lstatSync(absolute)
    } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null
        throw error
    }
}

function snapshotPath(root, relative) {
    const absolute = path.join(root, relative)
    const stat = lstatOrNull(absolute)
    if (!stat) return { exists: false, sha256: null, mode: null }
    if (!stat.isFile()) {
        return {
            exists: true,
            sha256: null,
            mode: stat.mode & 0o7777,
            type: stat.isSymbolicLink() ? 'symlink' : 'other',
        }
    }
    return {
        exists: true,
        sha256: sha256(fs.readFileSync(absolute)),
        mode: stat.mode & 0o7777,
    }
}

function snapshotPaths(root, paths) {
    return Object.fromEntries(paths.map((relative) => [relative, snapshotPath(root, relative)]))
}

function sameSnapshot(left, right) {
    return left.exists === right.exists
        && left.sha256 === right.sha256
        && left.mode === right.mode
        && (left.type ?? null) === (right.type ?? null)
}

function readTarget(root) {
    let pkg
    try {
        pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
    } catch (error) {
        fail('INVALID_TARGET', 'The target root has no readable package.json', {
            cause: error.message,
        })
    }
    if (pkg?.name !== PACKAGE_NAME || typeof pkg.version !== 'string' || !pkg.version) {
        fail('INVALID_TARGET', 'The target root is not a versioned PocketRisu checkout', {
            name: pkg?.name ?? null,
            version: pkg?.version ?? null,
        })
    }
    const match = typeof pkg.packageManager === 'string'
        ? pkg.packageManager.match(/^pnpm@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)(?:\+[0-9A-Za-z.-]+)?$/)
        : null
    if (!match) {
        fail('UNSUPPORTED_PACKAGE_MANAGER', 'The target must declare an exact pnpm packageManager', {
            packageManager: pkg.packageManager ?? null,
        })
    }
    return {
        packageName: pkg.name,
        packageVersion: pkg.version,
        expectedPnpmVersion: match[1],
    }
}

function assertGitCheckout(root) {
    const inside = runGit(root, ['rev-parse', '--show-toplevel'])
    if (!inside.ok) {
        fail('NOT_GIT_CHECKOUT', 'The target root is not a git checkout', {
            stderr: inside.stderr.trim(),
        })
    }
    const top = fs.realpathSync(inside.stdout.trim())
    if (top !== fs.realpathSync(root)) {
        fail('NOT_GIT_CHECKOUT', 'The target root is not the top of its git checkout', {
            toplevel: top,
        })
    }
}

function assertCleanTracked(root) {
    const changes = trackedChanges(root)
    if (changes.length > 0) {
        fail('TRACKED_CHANGES', 'The target root has tracked changes', {
            changes: changes.slice(0, 100),
        })
    }
}

function assertNoMetadata(root, paths = METADATA_PATHS) {
    const present = paths.filter((relative) => lstatOrNull(path.join(root, relative)))
    if (present.length > 0) {
        fail(
            present.includes(DEFAULT_LOCK_PATH) ? 'PATCH_LOCKED' : 'MANAGED_METADATA_PRESENT',
            'The target root already has patch metadata',
            { present },
        )
    }
}

function assertOwnedPathsAbsent(root, units) {
    const present = [...new Set(units
        .filter((unit) => unit.type === 'owned')
        .map((unit) => unit.file))]
        .filter((relative) => lstatOrNull(path.join(root, relative)))
        .sort()
    if (present.length > 0) {
        fail('OWNED_PATH_PRESENT', 'Owned paths of the closure already exist', { present })
    }
}

function assertNodeOptions(env) {
    const value = String(env?.NODE_OPTIONS ?? '')
    if (!value.split(/\s+/).includes(REQUIRED_NODE_OPTION)) {
        fail('NODE_OPTIONS_REQUIRED', `NODE_OPTIONS must contain ${REQUIRED_NODE_OPTION}`, {
            NODE_OPTIONS: value,
        })
    }
}

function commandText(check) {
    return [check.command, ...check.args].join(' ')
}

function makeDefaultCheckRunner(env) {
    return (check, root) => {
        const command = check.command === 'node' ? process.execPath : check.command
        let fd = null
        if (check.logPath) fd = fs.openSync(check.logPath, 'w')
        try {
            const result = childProcess.spawnSync(command, check.args, {
                cwd: root,
                env,
                shell: false,
                encoding: 'utf8',
                maxBuffer: 256 * 1024 * 1024,
            })
            const stdout = String(result.stdout ?? '')
            const stderr = String(result.stderr ?? result.error?.message ?? '')
            if (fd !== null) {
                fs.writeSync(fd, `$ ${commandText(check)}\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}\n`)
            }
            return {
                exitCode: result.error ? null : result.status,
                signal: result.signal ?? null,
                stdoutTail: tail(stdout),
                stderrTail: tail(stderr),
            }
        } finally {
            if (fd !== null) fs.closeSync(fd)
        }
    }
}

function checkDefinitions(closurePackIds) {
    const checks = [
        { id: 'frozen-install', command: 'pnpm', args: ['install', '--frozen-lockfile'] },
        { id: 'test', command: 'pnpm', args: ['test'] },
        { id: 'test-compat', command: 'pnpm', args: ['test:compat'] },
        { id: 'check', command: 'pnpm', args: ['check'] },
        { id: 'build', command: 'pnpm', args: ['build'] },
    ]
    if (closurePackIds.includes(BG_PRESERVE_PACK)) {
        checks.push({
            id: 'bg-orchestration-bundle',
            command: 'node',
            args: ['server/node/bgOrchBundle.build.cjs'],
        })
    }
    return checks
}

function patcherRevision() {
    const head = runGit(repositoryRoot, ['rev-parse', 'HEAD'])
    if (!head.ok) return { revision: null, dirty: null }
    const dirty = runGit(repositoryRoot, ['status', '--porcelain=v1'])
    return {
        revision: head.stdout.trim(),
        dirty: dirty.ok ? dirty.stdout.trim().length > 0 : null,
    }
}

function writeReceipt(outDir, receipt) {
    const target = path.join(outDir, 'receipt.json')
    const temporary = `${target}.${process.pid}.tmp`
    fs.writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`)
    fs.renameSync(temporary, target)
}

// Real path of `absolute`, resolving symlinks of its nearest existing ancestor
// and appending the components that do not exist yet.
function realPathOfNearest(absolute) {
    const missing = []
    let current = absolute
    for (;;) {
        try {
            return path.join(fs.realpathSync(current), ...missing.reverse())
        } catch (error) {
            if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error
            const parent = path.dirname(current)
            if (parent === current) return absolute
            missing.push(path.basename(current))
            current = parent
        }
    }
}

function isSameOrInside(candidate, parent) {
    const relative = path.relative(parent, candidate)
    return relative === ''
        || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

function errorSummary(step, error) {
    return {
        step,
        code: typeof error?.code === 'string' && error.code ? error.code : 'UNEXPECTED_ERROR',
        message: String(error?.message ?? error),
        details: error?.details ?? null,
    }
}

async function runSubsetQualification({
    root,
    packIds,
    catalog = null,
    coverage = null,
    baseline = null,
    unitBaseline = null,
    outDir,
    checkRunner = null,
    env = process.env,
    now = () => Date.now(),
}) {
    if (typeof outDir !== 'string' || !outDir) {
        throw new SubsetQualificationError('INVALID_ARGUMENT', 'outDir is required')
    }
    const absoluteRoot = path.resolve(String(root ?? ''))
    const absoluteOut = path.resolve(outDir)
    const realRoot = realPathOfNearest(absoluteRoot)
    const realOut = realPathOfNearest(absoluteOut)
    if (isSameOrInside(realOut, realRoot)) {
        throw new SubsetQualificationError(
            'INVALID_ARGUMENT',
            'outDir must be outside the target root',
            { outDir: absoluteOut, root: absoluteRoot },
        )
    }
    fs.mkdirSync(path.join(absoluteOut, 'logs'), { recursive: true })
    const loadedCatalog = catalog ?? require('../src/catalog.cjs').loadCatalog(repositoryRoot)
    const loadedCoverage = coverage ?? require('../patches/target-coverage.cjs')
    const loadedBaseline = baseline
        ?? require('../test/fixtures/target-baseline-1.10.0.json')
    // The unit baseline belongs to the frozen baseline fixture, so it is
    // loaded only when the caller did not pass its own baseline.
    const loadedUnitBaseline = unitBaseline
        ?? (baseline === null
            ? require('../test/fixtures/target-baseline-1.10.0-units.json')
            : null)
    const runner = checkRunner ?? makeDefaultCheckRunner(env)

    const receipt = {
        format: RECEIPT_FORMAT,
        kind: 'pocketrisu-subset-verification',
        qualification: false,
        startedAt: now(),
        finishedAt: null,
        root: absoluteRoot,
        target: null,
        patcher: patcherRevision(),
        requestedPacks: [...new Set(packIds ?? [])].sort(),
        closure: null,
        coverage: null,
        environment: {
            node: null,
            harnessNode: process.version,
            pnpm: null,
            NODE_OPTIONS: String(env?.NODE_OPTIONS ?? ''),
        },
        snapshot: { before: null, applied: null },
        selection: null,
        stateSha256: null,
        phases: [],
        checks: [],
        postRevert: null,
        failure: null,
        cleanup: 'not-needed',
        cleanupDetails: null,
    }

    const logIndex = { value: 0 }
    const logPathFor = (id) => {
        logIndex.value += 1
        return path.join(absoluteOut, 'logs', `${String(logIndex.value).padStart(2, '0')}-${id}.log`)
    }

    // Runs one check through the injected runner and records it.
    const runCheck = async (definition) => {
        const record = {
            id: definition.id,
            command: definition.command,
            args: definition.args,
            status: 'running',
            exitCode: null,
            durationMs: null,
            logPath: logPathFor(definition.id),
            stdoutTail: '',
            stderrTail: '',
        }
        receipt.checks.push(record)
        const startedAt = now()
        let result
        try {
            result = await runner({ ...definition, logPath: record.logPath }, absoluteRoot)
        } catch (error) {
            result = { exitCode: null, stdoutTail: '', stderrTail: String(error?.message ?? error) }
        }
        record.durationMs = now() - startedAt
        record.exitCode = Number.isInteger(result?.exitCode) ? result.exitCode : null
        record.stdoutTail = tail(result?.stdoutTail)
        record.stderrTail = tail(result?.stderrTail)
        if (!fs.existsSync(record.logPath)) {
            fs.writeFileSync(
                record.logPath,
                `$ ${commandText(definition)}\n--- stdout (tail) ---\n${record.stdoutTail}\n--- stderr (tail) ---\n${record.stderrTail}\n`,
            )
        }
        record.status = record.exitCode === 0 ? 'passed' : 'failed'
        return record
    }

    const skipCheck = (definition) => {
        receipt.checks.push({
            id: definition.id,
            command: definition.command,
            args: definition.args,
            status: 'skipped',
            exitCode: null,
            durationMs: null,
            logPath: null,
        })
    }

    let currentStep = 'preflight'
    const phase = (name, fn) => async () => {
        currentStep = name
        const startedAt = now()
        try {
            const value = await fn()
            receipt.phases.push({ name, status: 'passed', durationMs: now() - startedAt })
            return value
        } catch (error) {
            receipt.phases.push({
                name,
                status: 'failed',
                durationMs: now() - startedAt,
                code: error?.code ?? 'UNEXPECTED_ERROR',
            })
            throw error
        }
    }
    const recordFailure = (step, error) => {
        if (!receipt.failure) receipt.failure = errorSummary(step, error)
    }

    let closure = null
    let pendingChecks = null
    const pnpmVersionCheck = { id: 'pnpm-version', command: 'pnpm', args: ['--version'] }
    let untrackedBefore = null
    let target = null

    try {
        // 1. Read-only preflight, before taking the lock.
        await phase('preflight', async () => {
            if (!lstatOrNull(absoluteRoot)?.isDirectory()) {
                fail('INVALID_TARGET', 'The target root is not a directory')
            }
            assertGitCheckout(absoluteRoot)
            assertCleanTracked(absoluteRoot)
            assertNoMetadata(absoluteRoot)
            target = readTarget(absoluteRoot)
            const head = runGit(absoluteRoot, ['rev-parse', 'HEAD'])
            receipt.target = {
                name: target.packageName,
                version: target.packageVersion,
                commit: head.ok ? head.stdout.trim() : null,
            }
            const nodeVersion = childProcess.spawnSync('node', ['-v'], {
                cwd: absoluteRoot,
                env,
                encoding: 'utf8',
                shell: false,
            })
            receipt.environment.node = !nodeVersion.error && nodeVersion.status === 0
                ? String(nodeVersion.stdout).trim()
                : null
            assertNodeOptions(env)

            currentStep = 'closure'
            closure = resolveSubsetClosure({
                catalog: loadedCatalog,
                packIds: packIds ?? [],
                target: target.packageVersion,
                packageName: target.packageName,
            })
            receipt.closure = {
                packs: closure.packs.map((pack) => ({
                    id: pack.id,
                    version: pack.version,
                    etag: packEtag(pack),
                })),
                units: closure.units.map((unit) => unit.id),
            }
            pendingChecks = checkDefinitions(closure.packs.map((pack) => pack.id))
            currentStep = 'preflight'
            assertOwnedPathsAbsent(absoluteRoot, closure.units)

            const pnpm = await runCheck(pnpmVersionCheck)
            const observed = pnpm.stdoutTail.trim()
            receipt.environment.pnpm = observed || null
            if (pnpm.exitCode !== 0) {
                pnpm.status = 'failed'
                fail('PNPM_VERSION_FAILED', 'pnpm --version failed', { exitCode: pnpm.exitCode })
            }
            if (observed !== target.expectedPnpmVersion) {
                pnpm.status = 'failed'
                fail('PNPM_VERSION_MISMATCH', 'pnpm --version does not match packageManager', {
                    expected: target.expectedPnpmVersion,
                    observed,
                })
            }
            untrackedBefore = untrackedAndIgnored(absoluteRoot)
        })()

        // 2. Target declarations of the whole closure, then coverage.
        await phase('closure', async () => {
            const undeclared = closure.packs
                .filter((pack) => {
                    const declaration = pack.targets?.[target.packageName] ?? {}
                    return ![
                        ...(declaration.verified ?? []),
                        ...(declaration.reviewing ?? []),
                    ].includes(target.packageVersion)
                })
                .map((pack) => pack.id)
            if (undeclared.length > 0) {
                fail('TARGET_NOT_DECLARED', 'Closure packs do not declare the target', {
                    packs: undeclared,
                    target: target.packageVersion,
                })
            }
        })()
        await phase('coverage', async () => {
            receipt.coverage = validateTargetCoverage({
                catalog: loadedCatalog,
                coverage: loadedCoverage,
                baseline: loadedBaseline,
                packIds: closure.packs.map((pack) => pack.id),
                unitBaseline: loadedUnitBaseline,
            })
            if (!receipt.coverage.ok) {
                fail('COVERAGE_VIOLATION', 'Target coverage has violations', {
                    count: receipt.coverage.violations.length,
                })
            }
        })()
    } catch (error) {
        recordFailure(currentStep, error)
    }

    const createdDirectories = []
    if (!receipt.failure) {
        // The lock and state live under the metadata directory; remember which
        // of its directories the harness creates so the tree can be restored.
        for (const relative of ['save', path.dirname(DEFAULT_LOCK_PATH)]) {
            if (!lstatOrNull(path.join(absoluteRoot, relative))) createdDirectories.push(relative)
        }
        currentStep = 'preflight'
        try {
            await withRootLock(absoluteRoot, async () => {
                await runLocked()
                currentStep = 'lock-release'
            })
        } catch (error) {
            recordFailure(currentStep, error)
        }
        // 8. The lock must be gone after release.
        if (lstatOrNull(path.join(absoluteRoot, DEFAULT_LOCK_PATH))) {
            recordFailure('lock-release', new SubsetQualificationError(
                'LOCK_REMAINS',
                'The harness lock file still exists after release',
            ))
        } else if (['reverted', 'transaction-rolled-back', 'not-needed'].includes(receipt.cleanup)) {
            for (const relative of [...createdDirectories].reverse()) {
                try {
                    fs.rmdirSync(path.join(absoluteRoot, relative))
                } catch {
                    // A non-empty directory stays and is reported below.
                }
            }
            const untrackedAfter = untrackedAndIgnored(absoluteRoot)
            const added = untrackedAfter.filter((entry) => !untrackedBefore.includes(entry))
            const removed = untrackedBefore.filter((entry) => !untrackedAfter.includes(entry))
            receipt.postRevert = {
                ...(receipt.postRevert ?? {}),
                untrackedAdded: added,
                untrackedRemoved: removed,
            }
            if (added.length > 0 || removed.length > 0) {
                recordFailure('post-revert', new SubsetQualificationError(
                    'POST_REVERT_RESIDUE',
                    'Untracked or ignored paths differ from before the run',
                    { added, removed },
                ))
            }
        }
    }

    for (const definition of pendingChecks ?? checkDefinitions([])) {
        if (!receipt.checks.some((check) => check.id === definition.id)) skipCheck(definition)
    }
    if (!receipt.checks.some((check) => check.id === pnpmVersionCheck.id)) {
        receipt.checks.unshift({
            id: pnpmVersionCheck.id,
            command: pnpmVersionCheck.command,
            args: pnpmVersionCheck.args,
            status: 'skipped',
            exitCode: null,
            durationMs: null,
            logPath: null,
        })
    }
    receipt.finishedAt = now()
    writeReceipt(absoluteOut, receipt)
    return receipt

    async function runLocked() {
        let applyAttempted = false
        let applied = false
        const transitionOptions = {
            root: absoluteRoot,
            catalog: loadedCatalog,
            packIds: closure.packs.map((pack) => pack.id),
            profile: 'custom',
            allowInternal: true,
            persistIntent: false,
        }
        const managedPaths = [...new Set(closure.units.map((unit) => unit.file))].sort()
        try {
            // Recheck inside the lock: nothing changed since the read-only preflight.
            await phase('preflight-locked', async () => {
                assertCleanTracked(absoluteRoot)
                assertNoMetadata(absoluteRoot, METADATA_PATHS.filter((p) => p !== DEFAULT_LOCK_PATH))
                assertOwnedPathsAbsent(absoluteRoot, closure.units)
            })()

            // 3. Snapshot of every managed and owned path.
            receipt.snapshot.before = snapshotPaths(absoluteRoot, managedPaths)

            // 4. Apply, status, zero-change re-plan, evidence.
            let trackedAfterApply = null
            await phase('apply', async () => {
                const transition = planTransition(transitionOptions)
                const resolvedIds = transition.resolution.resolvedIds
                const closureIds = closure.packs.map((pack) => pack.id)
                if (JSON.stringify(resolvedIds) !== JSON.stringify(closureIds)) {
                    fail('CLOSURE_MISMATCH', 'The planned selection differs from the closure', {
                        resolvedIds,
                        closureIds,
                    })
                }
                applyAttempted = true
                try {
                    applyTransition({ root: absoluteRoot, transition, lockHeld: true })
                } finally {
                    // A failed transaction restores its journal; state exists
                    // only when the write committed.
                    applied = Boolean(lstatOrNull(path.join(absoluteRoot, DEFAULT_STATE_PATH)))
                }
                receipt.selection = {
                    order: transition.order,
                    packs: transition.packs,
                }
            })()
            await phase('apply-status', async () => {
                const current = status({ root: absoluteRoot })
                if (current.status !== 'current') {
                    fail('MANAGED_NOT_CURRENT', 'Managed status is not current after apply', {
                        status: current.status,
                        drifted: current.files.filter((file) => file.status !== 'current').map((file) => file.file),
                    })
                }
            })()
            await phase('replan', async () => {
                const again = planTransition(transitionOptions)
                if (again.changes.length > 0) {
                    fail('REPLAN_CHANGES', 'Re-planning the same selection reports changes', {
                        paths: again.changes.map((change) => change.path),
                    })
                }
            })()
            receipt.snapshot.applied = snapshotPaths(absoluteRoot, managedPaths)
            receipt.stateSha256 = sha256(fs.readFileSync(path.join(absoluteRoot, DEFAULT_STATE_PATH)))
            trackedAfterApply = trackedChanges(absoluteRoot)
            writeReceipt(absoluteOut, receipt)

            // 5. Target checks; the first failure skips the rest.
            currentStep = 'checks'
            for (const definition of pendingChecks) {
                if (receipt.failure) {
                    skipCheck(definition)
                    continue
                }
                const record = await runCheck(definition)
                if (record.status !== 'passed') {
                    recordFailure('checks', new SubsetQualificationError(
                        'CHECK_FAILED',
                        `${commandText(definition)} failed`,
                        { check: definition.id, exitCode: record.exitCode },
                    ))
                }
            }

            // 6. The checks must not change managed state or tracked files.
            if (!receipt.failure) {
                await phase('post-check', async () => {
                    const current = status({ root: absoluteRoot })
                    const tracked = trackedChanges(absoluteRoot)
                    if (
                        current.status !== 'current'
                        || JSON.stringify(tracked) !== JSON.stringify(trackedAfterApply)
                    ) {
                        fail('SOURCE_DRIFT', 'The checks changed managed or tracked files', {
                            status: current.status,
                            drifted: current.files.filter((file) => file.status !== 'current').map((file) => file.file),
                            trackedAfterApply,
                            trackedAfterChecks: tracked,
                        })
                    }
                })()
            }
        } catch (error) {
            recordFailure(currentStep, error)
        }

        if (!applyAttempted) {
            receipt.cleanup = 'not-needed'
            return
        }
        if (!applied) {
            // The failed transaction restored its own journal; verify the tree
            // like after a revert.
            receipt.cleanup = 'transaction-rolled-back'
            verifyRestored()
            return
        }

        // 7. Normal revert, refused when the managed tree drifted.
        currentStep = 'revert'
        const revertStartedAt = now()
        try {
            const current = status({ root: absoluteRoot })
            if (current.status !== 'current') {
                receipt.cleanup = 'preserved-drift'
                receipt.cleanupDetails = {
                    reason: 'managed-status-not-current',
                    drifted: current.files
                        .filter((file) => file.status !== 'current')
                        .map((file) => file.file),
                }
                receipt.phases.push({
                    name: 'revert',
                    status: 'refused',
                    durationMs: now() - revertStartedAt,
                })
                return
            }
            const revert = planTransition({ ...transitionOptions, packIds: [] })
            applyTransition({ root: absoluteRoot, transition: revert, lockHeld: true })
            receipt.cleanup = 'reverted'
            receipt.phases.push({ name: 'revert', status: 'passed', durationMs: now() - revertStartedAt })
        } catch (error) {
            receipt.cleanup = DRIFT_CODES.has(error?.code) ? 'preserved-drift' : 'revert-failed'
            receipt.cleanupDetails = errorSummary('revert', error)
            receipt.phases.push({
                name: 'revert',
                status: 'failed',
                durationMs: now() - revertStartedAt,
                code: error?.code ?? 'UNEXPECTED_ERROR',
            })
            recordFailure('revert', error)
            return
        }
        verifyRestored()
    }

    // Post-revert: metadata gone, every managed path as before, no tracked change.
    function verifyRestored() {
        currentStep = 'post-revert'
        const managedPaths = Object.keys(receipt.snapshot.before)
        const after = snapshotPaths(absoluteRoot, managedPaths)
        const changedPaths = managedPaths.filter((relative) => (
            !sameSnapshot(receipt.snapshot.before[relative], after[relative])
        ))
        const metadataLeft = METADATA_PATHS
            .filter((relative) => relative !== DEFAULT_LOCK_PATH)
            .filter((relative) => lstatOrNull(path.join(absoluteRoot, relative)))
        const tracked = trackedChanges(absoluteRoot)
        receipt.postRevert = { changedPaths, metadataLeft, trackedChanges: tracked }
        if (changedPaths.length > 0 || metadataLeft.length > 0 || tracked.length > 0) {
            recordFailure('post-revert', new SubsetQualificationError(
                'POST_REVERT_RESIDUE',
                'The tree differs from its pre-run snapshot after revert',
                { changedPaths, metadataLeft, trackedChanges: tracked },
            ))
        }
    }
}

function parseArgs(argv) {
    const options = { root: null, packIds: null, outDir: null, json: false }
    for (let index = 2; index < argv.length; index += 1) {
        const value = argv[index]
        if (['--root', '--packs', '--out'].includes(value)) {
            const next = argv[++index]
            if (next === undefined || next.startsWith('--')) throw new Error(`${value} requires a value`)
            if (value === '--root') options.root = next
            else if (value === '--out') options.outDir = next
            else options.packIds = next.split(',').map((id) => id.trim()).filter(Boolean)
        } else if (value === '--json') {
            options.json = true
        } else {
            throw new Error(`Unknown argument: ${value}`)
        }
    }
    if (!options.root || !options.outDir || !options.packIds?.length) {
        throw new Error('Usage: node scripts/qualify-subset.cjs --root COPY --packs ID[,ID...] --out DIR [--json]')
    }
    return options
}

async function main() {
    let options
    try {
        options = parseArgs(process.argv)
    } catch (error) {
        console.error(error.message)
        process.exitCode = 2
        return
    }
    const receipt = await runSubsetQualification({
        root: options.root,
        packIds: options.packIds,
        outDir: options.outDir,
    })
    if (options.json) {
        console.log(JSON.stringify(receipt, null, 2))
    } else {
        console.log(`receipt: ${path.join(path.resolve(options.outDir), 'receipt.json')}`)
        console.log(`qualification: false (subset evidence only)`)
        for (const check of receipt.checks) {
            console.log(`${check.status.padEnd(8)} ${commandText(check)}`)
        }
        console.log(`failure: ${receipt.failure ? `${receipt.failure.step} ${receipt.failure.code}` : 'none'}`)
        console.log(`cleanup: ${receipt.cleanup}`)
    }
    process.exitCode = receipt.failure ? 1 : 0
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error?.stack ?? String(error))
        process.exitCode = 1
    })
}

module.exports = {
    SubsetQualificationError,
    runSubsetQualification,
}
