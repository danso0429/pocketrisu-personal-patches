'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')

const TREE_SCHEMA = 'patch-verification-content-tree-v1'
const FREEZE_SCHEMA = 'patch-verification-input-freeze-v1'
const MAX_CHILD_OUTPUT_BYTES = 64 * 1024 * 1024
const CACHE_DIFFERENTIAL_SCOPE = Object.freeze({
    schema: 'patch-verification-cache-differential-scope-v1',
    independentTargetRoots: true,
    modeOrderWithinPhase: Object.freeze(['uncached', 'cached']),
    sharedWorkerContext: Object.freeze([
        'worker thread',
        'module graph',
        'process and global state',
    ]),
    freshIsolated: false,
    fallback: 'Global Exhaustive',
})
const SOURCE_CORE_PATHS = Object.freeze([
    'package.json',
    'docs/patch-combination-verification-instructions.md',
    'scripts/verify-all-combinations.cjs',
    'scripts/verify-cache-differential.cjs',
    'scripts/run-verification-evidence.cjs',
    'scripts/verify-verification-receipt.cjs',
    'scripts/build-verification-receipt-registry.cjs',
    'src/catalog.cjs',
    'src/compatibility.cjs',
    'src/resolver.cjs',
    'src/compose.cjs',
    'src/manager.cjs',
    'src/verification-evidence.cjs',
    'src/verification-receipts.cjs',
    'src/verification-runtime.cjs',
])

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex')
}

function jsonSha256(value) {
    return sha256(JSON.stringify(value))
}

function regularFileDescriptor(file) {
    const stat = fs.lstatSync(file)
    if (!stat.isFile()) throw new Error(`Evidence input is not a regular file: ${file}`)
    const content = fs.readFileSync(file)
    return {
        type: 'file',
        mode: stat.mode & 0o7777,
        size: stat.size,
        sha256: sha256(content),
    }
}

function optionalPathDescriptor(file) {
    let stat
    try {
        stat = fs.lstatSync(file)
    } catch (error) {
        if (error.code === 'ENOENT') return { type: 'missing' }
        throw error
    }
    if (stat.isFile()) return regularFileDescriptor(file)
    if (stat.isSymbolicLink()) {
        return {
            type: 'symlink',
            mode: stat.mode & 0o7777,
            target: fs.readlinkSync(file),
        }
    }
    throw new Error(`Unsupported Git administrative path type: ${file}`)
}

function walkTree(root, relative, entries, inodeMembers, excludedRootEntries) {
    if (relative && excludedRootEntries.has(relative)) return
    const absolute = relative ? path.join(root, relative) : root
    const stat = fs.lstatSync(absolute)
    if (stat.isDirectory()) {
        entries.push({
            path: relative,
            type: 'directory',
            mode: stat.mode & 0o7777,
        })
        for (const name of fs.readdirSync(absolute).sort()) {
            const child = relative ? path.join(relative, name) : name
            if (!relative && excludedRootEntries.has(child)) continue
            walkTree(root, child, entries, inodeMembers, excludedRootEntries)
        }
        return
    }
    if (stat.isFile()) {
        const content = fs.readFileSync(absolute)
        const inodeKey = `${stat.dev}:${stat.ino}`
        if (!inodeMembers.has(inodeKey)) inodeMembers.set(inodeKey, [])
        inodeMembers.get(inodeKey).push(relative)
        entries.push({
            path: relative,
            type: 'file',
            mode: stat.mode & 0o7777,
            size: stat.size,
            sha256: sha256(content),
            linkCount: stat.nlink,
            inodeKey,
        })
        return
    }
    if (stat.isSymbolicLink()) {
        entries.push({
            path: relative,
            type: 'symlink',
            mode: stat.mode & 0o7777,
            target: fs.readlinkSync(absolute),
        })
        return
    }
    throw new Error(`Unsupported evidence input type: ${absolute}`)
}

function contentTreeDescriptor(root, {
    excludedRootEntries = ['.git'],
} = {}) {
    const absoluteRoot = fs.realpathSync(path.resolve(root))
    const entries = []
    const inodeMembers = new Map()
    walkTree(
        absoluteRoot,
        '',
        entries,
        inodeMembers,
        new Set(excludedRootEntries),
    )
    const hardlinkGroups = new Map([...inodeMembers].map(([inodeKey, members]) => [
        inodeKey,
        members.length > 1 ? sha256(JSON.stringify([...members].sort())) : null,
    ]))
    const normalizedEntries = entries.map((entry) => {
        if (entry.type !== 'file') return entry
        const { inodeKey, ...rest } = entry
        return {
            ...rest,
            hardlinkGroup: hardlinkGroups.get(inodeKey),
        }
    })
    const identity = {
        schema: TREE_SCHEMA,
        exclusions: [...excludedRootEntries].sort(),
        entries: normalizedEntries,
    }
    return {
        ...identity,
        entryCount: normalizedEntries.length,
        rootSha256: jsonSha256(identity),
    }
}

async function gitOutput(root, args, { trim = true } = {}) {
    const result = await runChild(
        'git',
        ['--no-pager', '-C', root, ...args],
        { maxOutputBytes: 64 * 1024 * 1024 },
    )
    if (
        result.spawnError !== null
        || result.outputError !== null
        || result.exitCode !== 0
        || result.signal !== null
    ) {
        const detail = result.spawnError?.message
            ?? result.outputError
            ?? result.stderr.trim()
            ?? `exit=${result.exitCode} signal=${result.signal}`
        throw new Error(`Git evidence command failed: ${detail}`)
    }
    return trim ? result.stdout.trim() : result.stdout
}

async function sourceGitIdentity(root) {
    return {
        commit: await gitOutput(root, ['rev-parse', 'HEAD']),
        branch: await gitOutput(root, ['branch', '--show-current']),
        status: await gitOutput(
            root,
            ['status', '--porcelain=v1', '--untracked-files=all'],
            { trim: false },
        ),
        unstagedDiffSha256: sha256(await gitOutput(
            root,
            ['diff', '--binary'],
            { trim: false },
        )),
        stagedDiffSha256: sha256(await gitOutput(
            root,
            ['diff', '--cached', '--binary'],
            { trim: false },
        )),
    }
}

async function gitAdministrativePath(root, logicalPath) {
    const reported = await gitOutput(root, ['rev-parse', '--git-path', logicalPath])
    return path.isAbsolute(reported) ? reported : path.resolve(root, reported)
}

async function targetGitIdentity(root) {
    const workingTree = await sourceGitIdentity(root)
    const symbolicHead = await gitOutput(root, ['rev-parse', '--symbolic-full-name', 'HEAD'])
    const paths = {
        HEAD: await gitAdministrativePath(root, 'HEAD'),
        index: await gitAdministrativePath(root, 'index'),
        packedRefs: await gitAdministrativePath(root, 'packed-refs'),
        shallow: await gitAdministrativePath(root, 'shallow'),
    }
    if (symbolicHead.startsWith('refs/')) {
        paths.resolvedHeadRef = await gitAdministrativePath(root, symbolicHead)
    }
    return {
        kind: 'git',
        ...workingTree,
        symbolicHead,
        administrativeFiles: Object.fromEntries(Object.entries(paths).map(
            ([logicalName, absolute]) => [logicalName, optionalPathDescriptor(absolute)],
        )),
        mtimePolicy: 'Git directory and administrative-file mtimes are diagnostic, not identity',
    }
}

async function sourceFreezeDescriptor(root) {
    const absoluteRoot = fs.realpathSync(path.resolve(root))
    return {
        schema: FREEZE_SCHEMA,
        applicationTree: contentTreeDescriptor(absoluteRoot),
        git: await sourceGitIdentity(absoluteRoot),
        policy: regularFileDescriptor(path.join(
            absoluteRoot,
            'docs/patch-combination-verification-instructions.md',
        )),
        catalog: contentTreeDescriptor(path.join(absoluteRoot, 'patches'), {
            excludedRootEntries: [],
        }),
        coreFiles: Object.fromEntries(SOURCE_CORE_PATHS.map((relative) => [
            relative,
            regularFileDescriptor(path.join(absoluteRoot, relative)),
        ])),
    }
}

async function targetFreezeDescriptor(root, { targetProvenance = null } = {}) {
    const absoluteRoot = fs.realpathSync(path.resolve(root))
    let provenance
    if (fs.existsSync(path.join(absoluteRoot, '.git'))) {
        provenance = await targetGitIdentity(absoluteRoot)
    } else {
        if (!/^sha256:[0-9a-f]{64}$/.test(targetProvenance ?? '')) {
            throw new Error(
                'Non-Git target requires --target-provenance sha256:<64 lowercase hex>',
            )
        }
        provenance = {
            kind: 'declared-archive',
            sha256: targetProvenance.slice('sha256:'.length),
        }
    }
    return {
        schema: FREEZE_SCHEMA,
        applicationTree: contentTreeDescriptor(absoluteRoot),
        provenance,
    }
}

async function captureInputFreeze({ sourceRoot, targetRoot, targetProvenance = null }) {
    return {
        schema: FREEZE_SCHEMA,
        source: await sourceFreezeDescriptor(sourceRoot),
        target: await targetFreezeDescriptor(targetRoot, { targetProvenance }),
    }
}

function compareInputFreeze(before, after) {
    const sourceMatched = jsonSha256(before.source) === jsonSha256(after.source)
    const targetMatched = jsonSha256(before.target) === jsonSha256(after.target)
    return {
        sourceMatched,
        targetMatched,
        matched: sourceMatched && targetMatched,
    }
}

function pathIsInside(candidate, root) {
    const relative = path.relative(path.resolve(root), path.resolve(candidate))
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function canonicalOutputPath(output) {
    const absolute = path.resolve(output)
    const parent = fs.realpathSync(path.dirname(absolute))
    if (!fs.statSync(parent).isDirectory()) {
        throw new Error(`Evidence output parent is not a directory: ${parent}`)
    }
    return path.join(parent, path.basename(absolute))
}

function assertOutputOutsideInputs(output, roots) {
    const canonicalOutput = canonicalOutputPath(output)
    for (const root of roots) {
        const canonicalRoot = fs.realpathSync(path.resolve(root))
        if (pathIsInside(canonicalOutput, canonicalRoot)) {
            throw new Error(`Evidence output must be outside frozen input root: ${root}`)
        }
    }
    return canonicalOutput
}

function parseCanonicalOutput(stdout) {
    if (typeof stdout !== 'string' || stdout.trim() === '') return null
    try {
        const value = JSON.parse(stdout)
        return value && typeof value === 'object' && !Array.isArray(value) ? value : null
    } catch {
        return null
    }
}

function validateCanonicalResult(result) {
    const errors = []
    if (!result) return ['stdout is not one non-empty JSON object']
    const rawSelectionsValid = Number.isSafeInteger(result.rawSelections)
        && result.rawSelections > 0
    if (!rawSelectionsValid) {
        errors.push('rawSelections is not a positive safe integer')
    }
    const visiblePacks = result.visiblePacks
    const visiblePacksValid = Array.isArray(visiblePacks)
        && visiblePacks.every((value) => typeof value === 'string' && value.length > 0)
        && new Set(visiblePacks).size === visiblePacks.length
        && JSON.stringify(visiblePacks) === JSON.stringify([...visiblePacks].sort())
    if (!visiblePacksValid) {
        errors.push('visiblePacks is not a sorted unique non-empty string array')
    } else {
        const declaredDomain = 2 ** visiblePacks.length
        if (!Number.isSafeInteger(declaredDomain) || declaredDomain !== result.rawSelections) {
            errors.push('rawSelections does not equal the visible-pack raw domain')
        }
    }
    if (result.verifiedSelections !== result.rawSelections) {
        errors.push('verifiedSelections does not equal rawSelections')
    }
    if (result.roundTrips !== 'passed') errors.push('roundTrips is not passed')
    const workersValid = Number.isSafeInteger(result.workers)
        && result.workers > 0
        && rawSelectionsValid
        && result.workers <= result.rawSelections
    if (!workersValid) errors.push('workers is not a valid effective worker count')
    const history = result.workerHistory
    if (
        !history
        || history.schema !== 'patch-combination-worker-history-v1'
        || history.schedule !== 'stride-v1'
        || !Array.isArray(history.workers)
        || !workersValid
        || history.workers.length !== result.workers
    ) {
        errors.push('worker history metadata is missing or incompatible')
        return errors
    }
    let observedMasks = 0
    for (let workerIndex = 0; workerIndex < history.workers.length; workerIndex += 1) {
        const worker = history.workers[workerIndex]
        const expectedLength = workerIndex >= result.rawSelections
            ? 0
            : Math.floor((result.rawSelections - 1 - workerIndex) / result.workers) + 1
        const orderedMasksValid = Array.isArray(worker.orderedMasks)
            && worker.orderedMasks.length === expectedLength
            && worker.orderedMasks.every((mask, step) =>
                mask === workerIndex + (step * result.workers)
            )
        if (
            worker.workerIndex !== workerIndex
            || !orderedMasksValid
        ) {
            errors.push(`worker ${workerIndex} does not match canonical stride history`)
        }
        if (Array.isArray(worker.orderedMasks)) observedMasks += worker.orderedMasks.length
    }
    if (observedMasks !== result.rawSelections) {
        errors.push('worker histories do not cover every raw mask exactly once')
    }
    return errors
}

function validateCacheDifferentialResult(result) {
    const errors = []
    if (result?.schema !== 'patch-verification-cache-differential-v1') {
        errors.push('cache differential schema is missing or incompatible')
        return errors
    }
    if (!Number.isSafeInteger(result.rawSelections) || result.rawSelections < 1) {
        errors.push('rawSelections is not a positive safe integer')
    }
    if (result.verifiedSelections !== result.rawSelections) {
        errors.push('verifiedSelections does not equal rawSelections')
    }
    if (result.roundTrips !== 'differential-passed' || result.result !== 'passed') {
        errors.push('cache differential did not report passed round trips')
    }
    if (JSON.stringify(result.scope) !== JSON.stringify(CACHE_DIFFERENTIAL_SCOPE)) {
        errors.push('cache differential scope is missing or overstated')
    }
    const expectedPhases = ['initial-plan', 'repeated-plan', 'revert-plan']
    if (JSON.stringify(result.phases) !== JSON.stringify(expectedPhases)) {
        errors.push('cache differential phases are incomplete or reordered')
    }
    const historyErrors = validateCanonicalResult({
        visiblePacks: result.visiblePacks,
        rawSelections: result.rawSelections,
        verifiedSelections: result.verifiedSelections,
        roundTrips: 'passed',
        workers: result.workers,
        workerHistory: result.workerHistory,
    })
    errors.push(...historyErrors)
    const comparisons = result.comparisons?.standardCaches
    if (
        comparisons?.comparisons !== result.rawSelections * expectedPhases.length
        || comparisons?.mismatches !== 0
        || !Number.isSafeInteger(comparisons?.referenceBytes)
        || comparisons.referenceBytes < 1
        || comparisons.candidateBytes !== comparisons.referenceBytes
    ) errors.push('cache differential comparison coverage or bytes are invalid')
    return errors
}

function validateVerificationResult(kind, result) {
    if (kind === 'global-exhaustive') return validateCanonicalResult(result)
    if (kind === 'cache-differential') return validateCacheDifferentialResult(result)
    return [`unknown verification kind: ${kind}`]
}

function runChild(command, args, {
    cwd,
    env = process.env,
    maxOutputBytes = MAX_CHILD_OUTPUT_BYTES,
} = {}) {
    return new Promise((resolve) => {
        const stdoutChunks = []
        const stderrChunks = []
        let stdoutBytes = 0
        let stderrBytes = 0
        let outputError = null
        let spawnError = null
        const child = spawn(command, args, {
            cwd,
            env,
            stdio: ['ignore', 'pipe', 'pipe'],
        })
        const collect = (chunks, chunk, stream) => {
            const bytes = stream === 'stdout' ? stdoutBytes + chunk.length : stderrBytes + chunk.length
            if (stream === 'stdout') stdoutBytes = bytes
            else stderrBytes = bytes
            if (bytes > maxOutputBytes) {
                outputError ??= `${stream} exceeded ${maxOutputBytes} bytes`
                child.kill('SIGTERM')
                return
            }
            chunks.push(chunk)
        }
        child.stdout.on('data', (chunk) => collect(stdoutChunks, chunk, 'stdout'))
        child.stderr.on('data', (chunk) => collect(stderrChunks, chunk, 'stderr'))
        child.once('error', (error) => {
            spawnError = {
                code: error.code ?? null,
                message: error.message,
            }
        })
        child.once('close', (exitCode, signal) => resolve({
            exitCode,
            signal,
            spawnError,
            outputError,
            stdout: Buffer.concat(stdoutChunks).toString('utf8'),
            stderr: Buffer.concat(stderrChunks).toString('utf8'),
        }))
    })
}

function readCapturedFile(file, maxOutputBytes) {
    const size = fs.statSync(file).size
    const length = Math.min(size, maxOutputBytes)
    const buffer = Buffer.alloc(length)
    const descriptor = fs.openSync(file, 'r')
    try {
        if (length > 0) fs.readSync(descriptor, buffer, 0, length, 0)
    } finally {
        fs.closeSync(descriptor)
    }
    return {
        bytes: size,
        exceeded: size > maxOutputBytes,
        text: buffer.toString('utf8'),
    }
}

function runChildWithFileCapture(command, args, {
    cwd,
    env = process.env,
    maxOutputBytes = MAX_CHILD_OUTPUT_BYTES,
} = {}) {
    return new Promise((resolve) => {
        const captureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'patch-verification-child-'))
        const stdoutPath = path.join(captureRoot, 'stdout')
        const stderrPath = path.join(captureRoot, 'stderr')
        const stdoutDescriptor = fs.openSync(stdoutPath, 'wx', 0o600)
        const stderrDescriptor = fs.openSync(stderrPath, 'wx', 0o600)
        let child = null
        let closed = false
        let outputError = null
        let spawnError = null

        const closeDescriptors = () => {
            if (closed) return
            closed = true
            fs.closeSync(stdoutDescriptor)
            fs.closeSync(stderrDescriptor)
        }
        const finish = (exitCode, signal) => {
            clearInterval(sizeMonitor)
            closeDescriptors()
            try {
                const stdout = readCapturedFile(stdoutPath, maxOutputBytes)
                const stderr = readCapturedFile(stderrPath, maxOutputBytes)
                if (stdout.exceeded) {
                    outputError ??= `stdout exceeded ${maxOutputBytes} bytes`
                }
                if (stderr.exceeded) {
                    outputError ??= `stderr exceeded ${maxOutputBytes} bytes`
                }
                resolve({
                    exitCode,
                    signal,
                    spawnError,
                    outputError,
                    stdout: stdout.text,
                    stderr: stderr.text,
                })
            } finally {
                fs.rmSync(captureRoot, { recursive: true, force: true })
            }
        }

        let sizeMonitor = null
        try {
            child = spawn(command, args, {
                cwd,
                env,
                stdio: ['ignore', stdoutDescriptor, stderrDescriptor],
            })
            sizeMonitor = setInterval(() => {
                if (
                    fs.fstatSync(stdoutDescriptor).size > maxOutputBytes
                    || fs.fstatSync(stderrDescriptor).size > maxOutputBytes
                ) {
                    outputError ??= `child output exceeded ${maxOutputBytes} bytes`
                    child.kill('SIGTERM')
                }
            }, 100)
            child.once('error', (error) => {
                spawnError = {
                    code: error.code ?? null,
                    message: error.message,
                }
            })
            child.once('close', finish)
        } catch (error) {
            spawnError = {
                code: error.code ?? null,
                message: error.message,
            }
            finish(null, null)
        }
    })
}

function writeJsonAtomic(file, value) {
    const absolute = path.resolve(file)
    const parent = path.dirname(absolute)
    const temporary = path.join(
        parent,
        `.${path.basename(absolute)}.${process.pid}.${crypto.randomUUID()}.tmp`,
    )
    try {
        fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
            mode: 0o600,
            flag: 'wx',
        })
        fs.linkSync(temporary, absolute)
    } finally {
        try {
            fs.unlinkSync(temporary)
        } catch (error) {
            if (error.code !== 'ENOENT') throw error
        }
    }
}

module.exports = {
    CACHE_DIFFERENTIAL_SCOPE,
    FREEZE_SCHEMA,
    MAX_CHILD_OUTPUT_BYTES,
    SOURCE_CORE_PATHS,
    TREE_SCHEMA,
    assertOutputOutsideInputs,
    captureInputFreeze,
    canonicalOutputPath,
    compareInputFreeze,
    contentTreeDescriptor,
    jsonSha256,
    parseCanonicalOutput,
    pathIsInside,
    regularFileDescriptor,
    runChild,
    runChildWithFileCapture,
    sha256,
    sourceFreezeDescriptor,
    targetGitIdentity,
    targetFreezeDescriptor,
    validateCanonicalResult,
    validateCacheDifferentialResult,
    validateVerificationResult,
    writeJsonAtomic,
}
