'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { canonicalJson, QualityCostProtocolError } = require('./protocol-v1.cjs')

const PRIVATE_DIRECTORY_MODE = 0o700
const PRIVATE_FILE_MODE = 0o600
const PRIVATE_BUNDLE_FILES = Object.freeze([
    'case-manifest.json',
    'source-snapshot.json',
    'obligation-dossier.json',
    'calls.jsonl',
    'responses.jsonl',
    'blind-map.json',
    'judgments.jsonl',
    'activation-manifest.json',
    'sanitized-receipt.json',
])

function fail(code, detail) {
    throw new QualityCostProtocolError(code, detail)
}

function modeBits(stat) {
    return stat.mode & 0o777
}

function assertAbsoluteDirectory(value, code) {
    if (typeof value !== 'string' || !path.isAbsolute(value)) fail(code)
    const normalized = path.resolve(value)
    if (normalized === path.parse(normalized).root) fail(code)
    return normalized
}

function isInside(parent, child) {
    const relative = path.relative(parent, child)
    return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
}

function prospectiveRealPath(value) {
    const absolute = path.resolve(value)
    const suffix = []
    let cursor = absolute
    while (!fs.existsSync(cursor)) {
        const parent = path.dirname(cursor)
        if (parent === cursor) fail('PRIVATE_PATH_ANCESTOR_MISSING')
        suffix.unshift(path.basename(cursor))
        cursor = parent
    }
    const physical = fs.realpathSync.native(cursor)
    return path.resolve(physical, ...suffix)
}

function assertOutsideRepository(runRoot, repositoryRoot) {
    const run = assertAbsoluteDirectory(runRoot, 'PRIVATE_RUN_ROOT_INVALID')
    const repository = assertAbsoluteDirectory(repositoryRoot, 'REPOSITORY_ROOT_INVALID')
    const physicalRun = prospectiveRealPath(run)
    const physicalRepository = prospectiveRealPath(repository)
    if (isInside(physicalRepository, physicalRun) || isInside(physicalRun, physicalRepository)) {
        fail('PRIVATE_RUN_ROOT_OVERLAPS_REPOSITORY')
    }
    return run
}

function preparePrivateRunRoot({ runRoot, repositoryRoot, resume = false }) {
    const normalized = assertOutsideRepository(runRoot, repositoryRoot)
    const existed = fs.existsSync(normalized)
    if (!resume && existed) fail('PRIVATE_RUN_ROOT_ALREADY_EXISTS')
    if (resume && !existed) fail('PRIVATE_RUN_ROOT_RESUME_MISSING')
    if (!existed) fs.mkdirSync(normalized, { recursive: true, mode: PRIVATE_DIRECTORY_MODE })
    const stat = fs.lstatSync(normalized)
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('PRIVATE_RUN_ROOT_NOT_DIRECTORY')
    if (modeBits(stat) !== PRIVATE_DIRECTORY_MODE) fail('PRIVATE_RUN_ROOT_MODE_INVALID')
    if (!resume && fs.readdirSync(normalized).length !== 0) fail('PRIVATE_RUN_ROOT_NOT_EMPTY')
    fsyncDirectory(normalized)
    return normalized
}

function resolvePrivateFile(runRoot, filename) {
    if (typeof filename !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(filename)) {
        fail('PRIVATE_FILENAME_INVALID')
    }
    const resolved = path.resolve(runRoot, filename)
    if (!isInside(path.resolve(runRoot), resolved) || resolved === path.resolve(runRoot)) {
        fail('PRIVATE_FILE_OUTSIDE_ROOT')
    }
    return resolved
}

function writeJsonExclusive(runRoot, filename, value, { canonical = false } = {}) {
    const target = resolvePrivateFile(runRoot, filename)
    const serialized = canonical ? canonicalJson(value) : JSON.stringify(value, null, 2)
    if (fs.existsSync(target)) fail('PRIVATE_ARTIFACT_ALREADY_EXISTS', filename)
    const temporary = path.join(runRoot, `.${filename}.${process.pid}.${Date.now()}.tmp`)
    let fd
    let linked = false
    try {
        fd = fs.openSync(temporary, 'wx', PRIVATE_FILE_MODE)
        try {
            fs.fchmodSync(fd, PRIVATE_FILE_MODE)
            fs.writeFileSync(fd, serialized + '\n', 'utf8')
            fs.fsyncSync(fd)
        } finally {
            fs.closeSync(fd)
            fd = undefined
        }
    } catch (error) {
        try { fs.unlinkSync(temporary) } catch {}
        throw error
    }
    try {
        fs.linkSync(temporary, target)
        linked = true
        fsyncDirectory(runRoot)
        return target
    } finally {
        try { fs.unlinkSync(temporary) } finally {
            if (linked) fsyncDirectory(runRoot)
        }
    }
}

function openJsonlCheckpoint(runRoot, filename, { resume = false } = {}) {
    const target = resolvePrivateFile(runRoot, filename)
    if (resume) assertPrivateFile(target)
    const flags = resume ? 'a' : 'wx'
    const fd = fs.openSync(target, flags, PRIVATE_FILE_MODE)
    fs.fchmodSync(fd, PRIVATE_FILE_MODE)
    let closed = false
    return Object.freeze({
        path: target,
        append(record) {
            if (closed) fail('CHECKPOINT_CLOSED')
            fs.writeSync(fd, canonicalJson(record) + '\n', null, 'utf8')
            fs.fsyncSync(fd)
        },
        close() {
            if (closed) return
            fs.closeSync(fd)
            closed = true
            fsyncDirectory(runRoot)
        },
    })
}

function readPrivateJson(runRoot, filename) {
    const target = resolvePrivateFile(runRoot, filename)
    assertPrivateFile(target)
    return JSON.parse(fs.readFileSync(target, 'utf8'))
}

function assertPrivateFile(target) {
    const stat = fs.lstatSync(target)
    if (!stat.isFile() || stat.isSymbolicLink()) fail('PRIVATE_ARTIFACT_NOT_REGULAR_FILE')
    if (modeBits(stat) !== PRIVATE_FILE_MODE) fail('PRIVATE_ARTIFACT_MODE_INVALID', path.basename(target))
    return true
}

function verifyPrivateBundleModes(runRoot, { requiredFiles = PRIVATE_BUNDLE_FILES.filter((name) => !name.endsWith('.jsonl')) } = {}) {
    const rootStat = fs.lstatSync(runRoot)
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || modeBits(rootStat) !== PRIVATE_DIRECTORY_MODE) {
        fail('PRIVATE_RUN_ROOT_MODE_INVALID')
    }
    const observed = fs.readdirSync(runRoot)
    const files = []
    function walk(directory, relativeRoot = '') {
        for (const name of fs.readdirSync(directory)) {
            const target = path.join(directory, name)
            const relative = path.join(relativeRoot, name)
            const stat = fs.lstatSync(target)
            if (stat.isSymbolicLink()) fail('PRIVATE_ARTIFACT_SYMLINK_FORBIDDEN')
            if (stat.isDirectory()) {
                if (modeBits(stat) !== PRIVATE_DIRECTORY_MODE) fail('PRIVATE_ARTIFACT_DIRECTORY_MODE_INVALID', relative)
                walk(target, relative)
                continue
            }
            assertPrivateFile(target)
            files.push(relative)
        }
    }
    walk(runRoot)
    for (const filename of requiredFiles) {
        if (!observed.includes(filename)) fail('PRIVATE_ARTIFACT_REQUIRED_MISSING', filename)
    }
    return Object.freeze({
        directoryMode: '0700',
        fileMode: '0600',
        fileCount: files.length,
        files: Object.freeze(files.sort()),
    })
}

function fsyncDirectory(directory) {
    let fd
    try {
        fd = fs.openSync(directory, 'r')
        fs.fsyncSync(fd)
    } finally {
        if (fd !== undefined) fs.closeSync(fd)
    }
}

module.exports = {
    PRIVATE_BUNDLE_FILES,
    PRIVATE_DIRECTORY_MODE,
    PRIVATE_FILE_MODE,
    assertOutsideRepository,
    assertPrivateFile,
    isInside,
    openJsonlCheckpoint,
    preparePrivateRunRoot,
    prospectiveRealPath,
    readPrivateJson,
    resolvePrivateFile,
    verifyPrivateBundleModes,
    writeJsonExclusive,
}
