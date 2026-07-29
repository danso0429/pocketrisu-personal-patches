'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const {
    PatchCompositionError,
    compose,
    revertUnit,
    sha256,
} = require('./compose.cjs')
const { resolveSelection } = require('./resolver.cjs')

const STATE_FORMAT = 2
const LEGACY_STATE_FORMAT = 1
const JOURNAL_FORMAT = 1
const DEFAULT_STATE_PATH = 'save/pocketrisu-patches/state.json'
const DEFAULT_INTENT_PATH = 'save/pocketrisu-patches/intent.json'
const DEFAULT_JOURNAL_PATH = 'save/pocketrisu-patches/transaction.json'
const DEFAULT_LOCK_PATH = 'save/pocketrisu-patches/lock.json'
const DEFAULT_NEW_FILE_MODE = 0o644
const PRIVATE_STATE_MODE = 0o600

class PatchManagerError extends Error {
    constructor(code, message, details = {}) {
        super(message)
        this.name = 'PatchManagerError'
        this.code = code
        this.details = details
    }
}

function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue)
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(
        Object.keys(value).sort().map((key) => [key, stableValue(value[key])]),
    )
}

function stableStringify(value) {
    return JSON.stringify(stableValue(value))
}

function packEtag(pack) {
    return sha256(stableStringify({
        id: pack.id,
        title: pack.title ?? null,
        version: pack.version,
        userSelectable: pack.userSelectable ?? true,
        requires: pack.requires ?? [],
        conflicts: pack.conflicts ?? [],
        supersedes: pack.supersedes ?? [],
        autoWhen: pack.autoWhen ?? null,
        targets: pack.targets ?? null,
        units: pack.units,
        contracts: pack.contracts ?? [],
    }))
}

function assertSafeRelative(relativePath) {
    if (
        typeof relativePath !== 'string'
        || relativePath.length === 0
        || path.isAbsolute(relativePath)
        || relativePath.includes('\0')
    ) {
        throw new PatchManagerError('UNSAFE_PATH', `Unsafe managed path: ${relativePath}`)
    }
    const normalized = path.posix.normalize(relativePath.replaceAll('\\', '/'))
    if (normalized === '..' || normalized.startsWith('../') || normalized !== relativePath.replaceAll('\\', '/')) {
        throw new PatchManagerError('UNSAFE_PATH', `Unsafe managed path: ${relativePath}`)
    }
    return normalized
}

function resolveInside(root, relativePath) {
    const safe = assertSafeRelative(relativePath)
    const resolvedRoot = path.resolve(root)
    const resolved = path.resolve(resolvedRoot, safe)
    if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
        throw new PatchManagerError('UNSAFE_PATH', `Managed path escapes root: ${relativePath}`)
    }
    return resolved
}

function assertNoSymlinkPath(root, relativePath) {
    const safe = assertSafeRelative(relativePath)
    let cursor = path.resolve(root)
    for (const part of safe.split('/')) {
        cursor = path.join(cursor, part)
        try {
            if (fs.lstatSync(cursor).isSymbolicLink()) {
                throw new PatchManagerError(
                    'SYMLINK_PATH',
                    `Refusing to manage a symlinked path: ${relativePath}`,
                )
            }
        } catch (error) {
            if (error.code === 'ENOENT') return
            throw error
        }
    }
}

function readOptionalBuffer(root, relativePath) {
    assertNoSymlinkPath(root, relativePath)
    const absolute = resolveInside(root, relativePath)
    try {
        return fs.readFileSync(absolute)
    } catch (error) {
        if (error.code === 'ENOENT') return null
        throw error
    }
}

function readOptionalText(root, relativePath) {
    const value = readOptionalBuffer(root, relativePath)
    return value === null ? null : value.toString('utf8')
}

function readOptionalMode(root, relativePath) {
    assertNoSymlinkPath(root, relativePath)
    const absolute = resolveInside(root, relativePath)
    try {
        return fs.statSync(absolute).mode & 0o7777
    } catch (error) {
        if (error.code === 'ENOENT') return null
        throw error
    }
}

function writeAtomic(root, relativePath, buffer, { mode } = {}) {
    assertNoSymlinkPath(root, relativePath)
    const absolute = resolveInside(root, relativePath)
    fs.mkdirSync(path.dirname(absolute), { recursive: true })
    const desiredMode = mode ?? readOptionalMode(root, relativePath) ?? DEFAULT_NEW_FILE_MODE
    const temporary = `${absolute}.pocketrisu-patch-tmp-${process.pid}-${crypto.randomUUID()}`
    try {
        fs.writeFileSync(temporary, buffer, {
            flag: 'wx',
            mode: desiredMode,
        })
        // writeFileSync's creation mode is filtered through umask. chmod makes
        // the manifest/original mode contract exact before the atomic rename.
        fs.chmodSync(temporary, desiredMode)
        fs.renameSync(temporary, absolute)
    } catch (error) {
        try {
            fs.unlinkSync(temporary)
        } catch (cleanupError) {
            if (cleanupError.code !== 'ENOENT') error.cleanupError = cleanupError
        }
        throw error
    }
}

function removeFile(root, relativePath) {
    assertNoSymlinkPath(root, relativePath)
    const absolute = resolveInside(root, relativePath)
    try {
        fs.unlinkSync(absolute)
    } catch (error) {
        if (error.code !== 'ENOENT') throw error
    }
}

function parseJsonBuffer(buffer, label) {
    try {
        return JSON.parse(buffer.toString('utf8'))
    } catch (error) {
        throw new PatchManagerError('INVALID_JSON', `${label} is not valid JSON`, {
            cause: error.message,
        })
    }
}

function processIsAlive(pid) {
    if (!Number.isSafeInteger(pid) || pid <= 0) return null
    try {
        process.kill(pid, 0)
        return true
    } catch (error) {
        if (error.code === 'ESRCH') return false
        if (error.code === 'EPERM') return true
        return null
    }
}

function acquireRootLock(root, lockPath = DEFAULT_LOCK_PATH) {
    assertNoSymlinkPath(root, lockPath)
    const absolute = resolveInside(root, lockPath)
    fs.mkdirSync(path.dirname(absolute), { recursive: true })

    for (let attempt = 0; attempt < 2; attempt += 1) {
        const owner = {
            version: 1,
            token: crypto.randomUUID(),
            pid: process.pid,
            hostname: os.hostname(),
            startedAt: new Date().toISOString(),
        }
        try {
            const fd = fs.openSync(absolute, 'wx', PRIVATE_STATE_MODE)
            try {
                fs.writeFileSync(fd, `${JSON.stringify(owner, null, 2)}\n`)
                fs.fsyncSync(fd)
            } finally {
                fs.closeSync(fd)
            }
            return { path: lockPath, absolute, owner }
        } catch (error) {
            if (error.code !== 'EEXIST') throw error
            let existing = null
            try {
                existing = parseJsonBuffer(fs.readFileSync(absolute), lockPath)
            } catch {
                // An unreadable lock cannot be proven stale. Refuse instead of
                // risking overlap with an owner still writing its metadata.
            }
            const sameHost = existing?.hostname === os.hostname()
            const alive = sameHost ? processIsAlive(existing?.pid) : null
            if (attempt === 0 && sameHost && alive === false) {
                try {
                    fs.unlinkSync(absolute)
                    continue
                } catch (unlinkError) {
                    if (unlinkError.code === 'ENOENT') continue
                }
            }
            throw new PatchManagerError(
                'PATCH_LOCKED',
                `Another patch operation owns ${lockPath}`,
                {
                    pid: existing?.pid ?? null,
                    hostname: existing?.hostname ?? null,
                    startedAt: existing?.startedAt ?? null,
                },
            )
        }
    }
    throw new PatchManagerError('PATCH_LOCKED', `Could not acquire ${lockPath}`)
}

function releaseRootLock(lock) {
    let current = null
    try {
        current = parseJsonBuffer(fs.readFileSync(lock.absolute), lock.path)
    } catch (error) {
        if (error.code === 'ENOENT') return
        throw error
    }
    if (current?.token !== lock.owner.token) {
        throw new PatchManagerError(
            'PATCH_LOCK_CHANGED',
            `Refusing to release a lock now owned by another process: ${lock.path}`,
        )
    }
    fs.unlinkSync(lock.absolute)
}

function withRootLock(root, callback, lockPath = DEFAULT_LOCK_PATH) {
    const lock = acquireRootLock(root, lockPath)
    let result
    try {
        result = callback()
    } catch (error) {
        releaseRootLock(lock)
        throw error
    }
    if (result && typeof result.then === 'function') {
        return Promise.resolve(result).finally(() => releaseRootLock(lock))
    }
    releaseRootLock(lock)
    return result
}

function loadState(root, statePath = DEFAULT_STATE_PATH) {
    const raw = readOptionalBuffer(root, statePath)
    if (raw === null) return null
    const state = parseJsonBuffer(raw, statePath)
    if (
        ![LEGACY_STATE_FORMAT, STATE_FORMAT].includes(state.format)
        || !Array.isArray(state.units)
        || !Array.isArray(state.order)
    ) {
        throw new PatchManagerError('INVALID_STATE', `${statePath} has an unsupported format`)
    }
    return state
}

function encodeIntent(requestedPacks, preset = null) {
    return Buffer.from(`${JSON.stringify({
        format: 1,
        requestedPacks: [...new Set(requestedPacks)].sort(),
        preset: preset === 'custom' ? null : preset,
    }, null, 2)}\n`)
}

function loadIntent(root, intentPath = DEFAULT_INTENT_PATH) {
    const raw = readOptionalBuffer(root, intentPath)
    if (raw === null) return null
    const intent = parseJsonBuffer(raw, intentPath)
    if (
        intent.format !== 1
        || !Array.isArray(intent.requestedPacks)
        || intent.requestedPacks.some((id) => typeof id !== 'string' || !id)
        || (intent.preset !== null && typeof intent.preset !== 'string')
    ) {
        throw new PatchManagerError('INVALID_INTENT', `${intentPath} has an unsupported format`)
    }
    return {
        format: 1,
        requestedPacks: [...new Set(intent.requestedPacks)].sort(),
        preset: intent.preset === 'custom' ? null : intent.preset,
    }
}

function saveIntentUnlocked({
    root,
    requestedPacks,
    preset = null,
    intentPath = DEFAULT_INTENT_PATH,
}) {
    const encoded = encodeIntent(requestedPacks, preset)
    const before = readOptionalBuffer(root, intentPath)
    if (before !== null && before.equals(encoded)) return { changed: false, path: intentPath }
    writeAtomic(root, intentPath, encoded, { mode: PRIVATE_STATE_MODE })
    return { changed: true, path: intentPath }
}

function saveIntent({
    root,
    requestedPacks,
    preset = null,
    intentPath = DEFAULT_INTENT_PATH,
    lockHeld = false,
}) {
    const save = () => saveIntentUnlocked({ root, requestedPacks, preset, intentPath })
    return lockHeld ? save() : withRootLock(root, save)
}

function restoreJournal(root, journalPath = DEFAULT_JOURNAL_PATH) {
    const raw = readOptionalBuffer(root, journalPath)
    if (raw === null) return { recovered: false }
    const journal = parseJsonBuffer(raw, journalPath)
    if (journal.format !== JOURNAL_FORMAT || !Array.isArray(journal.originals)) {
        throw new PatchManagerError('INVALID_JOURNAL', `${journalPath} has an unsupported format`)
    }
    for (const original of journal.originals) {
        if (original.content === null) removeFile(root, original.path)
        else writeAtomic(
            root,
            original.path,
            Buffer.from(original.content, 'base64'),
            { mode: Number.isInteger(original.mode) ? original.mode : undefined },
        )
    }
    removeFile(root, journalPath)
    return { recovered: true, transactionId: journal.transactionId }
}

function validatePack(pack) {
    if (!pack || typeof pack !== 'object' || typeof pack.id !== 'string' || !pack.id) {
        throw new PatchManagerError('INVALID_PACK', 'Every pack requires an id')
    }
    if (typeof pack.version !== 'string' || !pack.version) {
        throw new PatchManagerError('INVALID_PACK', `${pack.id}: version is required`)
    }
    if (!Array.isArray(pack.units)) {
        throw new PatchManagerError('INVALID_PACK', `${pack.id}: units must be an array`)
    }
    for (const unit of pack.units) {
        if (
            unit.mode !== undefined
            && (!Number.isInteger(unit.mode) || unit.mode < 0 || unit.mode > 0o7777)
        ) {
            throw new PatchManagerError(
                'INVALID_PACK',
                `${pack.id}: ${unit.id} has an invalid file mode`,
            )
        }
    }
}

function selectPacks(catalog, packIds) {
    const resolution = resolveSelection(catalog, packIds)
    for (const pack of resolution.packs) validatePack(pack)
    return resolution.packs
}

function flattenUnits(packs) {
    return packs.flatMap((pack) =>
        pack.units.map((unit) => ({ ...unit, pack: pack.id, packVersion: pack.version }))
    )
}

function stripCurrentUnits(currentFiles, state) {
    const byId = new Map(state.units.map((unit) => [unit.id, unit]))
    const baselines = new Map(currentFiles)
    for (const id of [...state.order].reverse()) {
        const unit = byId.get(id)
        if (!unit) {
            throw new PatchManagerError('INVALID_STATE', `State is missing unit snapshot ${id}`)
        }
        const value = baselines.get(unit.file) ?? null
        baselines.set(unit.file, revertUnit(value, unit))
    }
    return baselines
}

function outputModeForFile(file, output, currentModes, units) {
    if (output === null) return null
    const declared = [...new Set(
        units
            .filter((unit) => unit.file === file && unit.mode !== undefined)
            .map((unit) => unit.mode),
    )]
    if (declared.length > 1) {
        throw new PatchManagerError(
            'MODE_CONFLICT',
            `${file} has conflicting new-file mode declarations`,
        )
    }
    const currentMode = currentModes.get(file) ?? null
    if (currentMode !== null) return currentMode
    return declared[0] ?? DEFAULT_NEW_FILE_MODE
}

function readTargetIdentity(root) {
    const packageBuffer = readOptionalBuffer(root, 'package.json')
    if (packageBuffer === null) {
        return { packageName: null, packageVersion: null }
    }
    const pkg = parseJsonBuffer(packageBuffer, 'package.json')
    return {
        packageName: typeof pkg.name === 'string' ? pkg.name : null,
        packageVersion: typeof pkg.version === 'string' ? pkg.version : null,
    }
}

function makeState(profile, packs, units, result, baselines, currentModes, {
    resolution,
    target,
} = {}) {
    const files = {}
    for (const file of new Set(units.map((unit) => unit.file))) {
        const baseline = baselines.get(file) ?? null
        const output = result.outputs.get(file) ?? null
        files[file] = {
            baselineHash: baseline === null ? null : sha256(baseline),
            outputHash: output === null ? null : sha256(output),
            outputMode: outputModeForFile(file, output, currentModes, units),
        }
    }
    return {
        format: STATE_FORMAT,
        profile,
        target: target ?? null,
        selection: resolution ? {
            effectiveRequested: resolution.effectiveRequested,
            resolvedIds: resolution.resolvedIds,
            autoAdded: resolution.autoAdded,
            dependencyAdded: resolution.dependencyAdded,
        } : null,
        packs: packs.map((pack) => ({
            id: pack.id,
            version: pack.version,
            etag: packEtag(pack),
        })),
        order: result.order,
        collisions: result.collisions,
        units,
        files,
    }
}

function encodeState(state) {
    return Buffer.from(`${JSON.stringify(state, null, 2)}\n`)
}

function planTransition({
    root,
    catalog,
    packIds,
    profile,
    statePath = DEFAULT_STATE_PATH,
    intentPath = DEFAULT_INTENT_PATH,
    persistIntent = false,
}) {
    const previous = loadState(root, statePath)
    const resolution = resolveSelection(catalog, packIds)
    const packs = resolution.packs
    for (const pack of packs) validatePack(pack)
    const units = flattenUnits(packs)
    const paths = new Set([
        ...units.map((unit) => unit.file),
        ...(previous?.units ?? []).map((unit) => unit.file),
    ])
    const current = new Map([...paths].map((file) => [file, readOptionalText(root, file)]))
    const currentModes = new Map([...paths].map((file) => [file, readOptionalMode(root, file)]))
    const baselines = previous ? stripCurrentUnits(current, previous) : new Map(current)
    const result = compose(units, baselines)
    const nextState = makeState(profile, packs, units, result, baselines, currentModes, {
        resolution,
        target: readTargetIdentity(root),
    })
    const changes = []

    for (const file of paths) {
        const before = current.get(file) ?? null
        const beforeMode = currentModes.get(file) ?? null
        const after = result.outputs.has(file)
            ? result.outputs.get(file)
            : baselines.get(file) ?? null
        const afterMode = outputModeForFile(file, after, currentModes, units)
        if (before !== after || beforeMode !== afterMode) {
            changes.push({ path: file, before, beforeMode, after, afterMode })
        }
    }

    const stateBefore = readOptionalText(root, statePath)
    const stateBeforeMode = readOptionalMode(root, statePath)
    const stateAfter = units.length === 0 ? null : encodeState(nextState).toString('utf8')
    const stateAfterMode = stateAfter === null
        ? null
        : (stateBeforeMode ?? PRIVATE_STATE_MODE)
    if (stateBefore !== stateAfter || stateBeforeMode !== stateAfterMode) {
        changes.push({
            path: statePath,
            before: stateBefore,
            beforeMode: stateBeforeMode,
            after: stateAfter,
            afterMode: stateAfterMode,
        })
    }

    let intentBefore = null
    let intentBeforeMode = null
    if (persistIntent) {
        intentBefore = readOptionalText(root, intentPath)
        intentBeforeMode = readOptionalMode(root, intentPath)
        const intentAfter = encodeIntent(resolution.effectiveRequested, profile).toString('utf8')
        const intentAfterMode = intentBeforeMode ?? PRIVATE_STATE_MODE
        if (intentBefore !== intentAfter || intentBeforeMode !== intentAfterMode) {
            changes.push({
                path: intentPath,
                before: intentBefore,
                beforeMode: intentBeforeMode,
                after: intentAfter,
                afterMode: intentAfterMode,
            })
        }
    }

    return {
        profile,
        resolution: {
            requested: resolution.requested,
            effectiveRequested: resolution.effectiveRequested,
            resolvedIds: resolution.resolvedIds,
            autoAdded: resolution.autoAdded,
            dependencyAdded: resolution.dependencyAdded,
            superseded: resolution.superseded,
        },
        packs: nextState.packs,
        order: result.order,
        collisions: result.collisions,
        changes,
        preconditions: [
            ...[...paths].map((file) => ({
                path: file,
                before: current.get(file) ?? null,
                beforeMode: currentModes.get(file) ?? null,
            })),
            {
                path: statePath,
                before: stateBefore,
                beforeMode: stateBeforeMode,
            },
            ...(persistIntent ? [{
                path: intentPath,
                before: intentBefore,
                beforeMode: intentBeforeMode,
            }] : []),
        ],
        state: units.length === 0 ? null : nextState,
        skippedFiles: [...paths].filter((file) => !changes.some((change) => change.path === file)),
    }
}

function validateTransitionPreconditions(root, transition) {
    const preconditions = transition.preconditions
        ?? transition.changes.map((change) => ({
            path: change.path,
            before: change.before,
            beforeMode: change.beforeMode,
        }))
    const stale = []
    for (const expected of preconditions) {
        const actual = readOptionalText(root, expected.path)
        const actualMode = readOptionalMode(root, expected.path)
        const contentMatches = actual === expected.before
        const modeMatches = expected.beforeMode === undefined
            || actualMode === expected.beforeMode
        if (!contentMatches || !modeMatches) {
            stale.push({
                path: expected.path,
                expectedHash: expected.before === null ? null : sha256(expected.before),
                actualHash: actual === null ? null : sha256(actual),
                expectedMode: expected.beforeMode ?? null,
                actualMode,
            })
        }
    }
    if (stale.length > 0) {
        throw new PatchManagerError(
            'STALE_TRANSITION',
            `Patch plan is stale for ${stale.length} path(s); no files were written`,
            { stale },
        )
    }
}

function applyTransitionUnlocked({
    root,
    transition,
    journalPath = DEFAULT_JOURNAL_PATH,
    injectFailureAfter = null,
}) {
    validateTransitionPreconditions(root, transition)
    if (transition.changes.length === 0) return { changed: false, files: [] }
    const originals = transition.changes.map((change) => {
        const original = readOptionalBuffer(root, change.path)
        return {
            path: change.path,
            content: original === null ? null : original.toString('base64'),
            mode: readOptionalMode(root, change.path),
        }
    })
    const journal = {
        format: JOURNAL_FORMAT,
        transactionId: `${Date.now()}-${process.pid}`,
        originals,
    }
    writeAtomic(
        root,
        journalPath,
        Buffer.from(`${JSON.stringify(journal, null, 2)}\n`),
        { mode: PRIVATE_STATE_MODE },
    )

    try {
        for (let index = 0; index < transition.changes.length; index += 1) {
            const change = transition.changes[index]
            if (change.after === null) removeFile(root, change.path)
            else writeAtomic(
                root,
                change.path,
                Buffer.from(change.after),
                { mode: change.afterMode ?? undefined },
            )
            if (injectFailureAfter === index + 1) {
                throw new Error('Injected transaction failure')
            }
        }
        removeFile(root, journalPath)
        return {
            changed: true,
            files: transition.changes.map((change) => change.path),
        }
    } catch (error) {
        restoreJournal(root, journalPath)
        throw error
    }
}

function applyTransition({
    root,
    transition,
    journalPath = DEFAULT_JOURNAL_PATH,
    lockHeld = false,
    injectFailureAfter = null,
}) {
    const apply = () => {
        restoreJournal(root, journalPath)
        return applyTransitionUnlocked({
            root,
            transition,
            journalPath,
            injectFailureAfter,
        })
    }
    return lockHeld ? applyTransitionUnlocked({
        root,
        transition,
        journalPath,
        injectFailureAfter,
    }) : withRootLock(root, apply)
}

function status({ root, statePath = DEFAULT_STATE_PATH }) {
    const state = loadState(root, statePath)
    if (!state) return { status: 'clean', packs: [], files: [] }
    const files = Object.entries(state.files).map(([file, expected]) => {
        const content = readOptionalText(root, file)
        const actualHash = content === null ? null : sha256(content)
        const actualMode = readOptionalMode(root, file)
        const modeMatches = expected.outputMode === undefined
            || expected.outputMode === actualMode
        return {
            file,
            status: actualHash === expected.outputHash && modeMatches ? 'current' : 'drifted',
            expectedHash: expected.outputHash,
            actualHash,
            expectedMode: expected.outputMode ?? null,
            actualMode,
        }
    })
    return {
        status: files.every((file) => file.status === 'current') ? 'current' : 'drifted',
        stateFormat: state.format,
        profile: state.profile,
        target: state.target ?? null,
        selection: state.selection ?? null,
        packs: state.packs,
        files,
    }
}

module.exports = {
    DEFAULT_INTENT_PATH,
    DEFAULT_JOURNAL_PATH,
    DEFAULT_LOCK_PATH,
    DEFAULT_STATE_PATH,
    STATE_FORMAT,
    PatchManagerError,
    applyTransition,
    flattenUnits,
    loadState,
    loadIntent,
    packEtag,
    planTransition,
    resolveInside,
    restoreJournal,
    saveIntent,
    selectPacks,
    stableStringify,
    status,
    withRootLock,
}
