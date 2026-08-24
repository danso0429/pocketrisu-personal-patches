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
const INTENT_FORMAT = 2
const LEGACY_INTENT_FORMAT = 1
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

function sameStateValue(left, right) {
    if (left === right) return true
    if (Array.isArray(left) || Array.isArray(right)) {
        if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
            return false
        }
        return left.every((value, index) => sameStateValue(value, right[index]))
    }
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object') {
        return false
    }
    const leftKeys = Object.keys(left).sort()
    const rightKeys = Object.keys(right).sort()
    return leftKeys.length === rightKeys.length
        && leftKeys.every((key, index) =>
            key === rightKeys[index]
            && sameStateValue(left[key], right[key])
        )
}

function createPackEtagCache() {
    return {
        hits: 0,
        misses: 0,
        values: new WeakMap(),
    }
}

function createStateEncodingCache() {
    return {
        hits: 0,
        misses: 0,
        record: null,
    }
}

function assertDeepFrozen(value, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return
    if (!Object.isFrozen(value)) {
        throw new PatchManagerError(
            'PACK_ETAG_CACHE_REQUIRES_FROZEN_PACK',
            'Pack ETag caching requires a deeply frozen pack',
        )
    }
    seen.add(value)
    for (const child of Object.values(value)) assertDeepFrozen(child, seen)
}

function packEtag(pack, {
    cache = null,
} = {}) {
    if (cache !== null) {
        if (cache.values.has(pack)) {
            cache.hits += 1
            return cache.values.get(pack)
        }
        assertDeepFrozen(pack)
        cache.misses += 1
    }
    const etag = sha256(stableStringify({
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
    if (cache !== null) cache.values.set(pack, etag)
    return etag
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

function normalizeRequestedPacks(requestedPacks, label = 'requestedPacks') {
    if (
        !Array.isArray(requestedPacks)
        || requestedPacks.some((id) => typeof id !== 'string' || !id)
    ) {
        throw new PatchManagerError('INVALID_INTENT', `${label} must be an array of pack ids`)
    }
    return [...new Set(requestedPacks)].sort()
}

function normalizeIntentPolicy(intent) {
    if (!intent || typeof intent !== 'object') {
        throw new PatchManagerError('INVALID_INTENT', 'Intent policy must be an object')
    }
    if (intent.mode === 'preset') {
        if (typeof intent.preset !== 'string' || !intent.preset) {
            throw new PatchManagerError('INVALID_INTENT', 'Preset intent requires a preset id')
        }
        if (intent.requestedPacks !== undefined) {
            throw new PatchManagerError(
                'INVALID_INTENT',
                'Preset intent must derive requested packs from the active catalog',
            )
        }
        return {
            mode: 'preset',
            preset: intent.preset,
        }
    }
    if (intent.mode === 'custom') {
        if (
            intent.preset !== null
            && intent.preset !== undefined
            && (typeof intent.preset !== 'string' || !intent.preset)
        ) {
            throw new PatchManagerError('INVALID_INTENT', 'Custom intent has an invalid preset scope')
        }
        return {
            mode: 'custom',
            preset: intent.preset === undefined || intent.preset === 'custom'
                ? null
                : intent.preset,
            requestedPacks: normalizeRequestedPacks(intent.requestedPacks),
        }
    }
    throw new PatchManagerError('INVALID_INTENT', `Unknown intent mode: ${intent.mode ?? 'missing'}`)
}

function presetIntent(preset) {
    return normalizeIntentPolicy({ mode: 'preset', preset })
}

function customIntent(requestedPacks, preset = null) {
    return normalizeIntentPolicy({ mode: 'custom', preset, requestedPacks })
}

function encodeIntent(intent) {
    const normalized = normalizeIntentPolicy(intent)
    return Buffer.from(`${JSON.stringify({
        format: INTENT_FORMAT,
        ...normalized,
    }, null, 2)}\n`)
}

function loadIntent(root, intentPath = DEFAULT_INTENT_PATH) {
    const raw = readOptionalBuffer(root, intentPath)
    if (raw === null) return null
    const intent = parseJsonBuffer(raw, intentPath)
    if (intent.format === LEGACY_INTENT_FORMAT) {
        if (
            !Array.isArray(intent.requestedPacks)
            || intent.requestedPacks.some((id) => typeof id !== 'string' || !id)
            || (
                intent.preset !== null
                && (typeof intent.preset !== 'string' || !intent.preset)
            )
        ) {
            throw new PatchManagerError('INVALID_INTENT', `${intentPath} has an unsupported format`)
        }
        return {
            format: LEGACY_INTENT_FORMAT,
            mode: 'legacy',
            requestedPacks: [...new Set(intent.requestedPacks)].sort(),
            preset: intent.preset === 'custom' ? null : intent.preset,
        }
    }
    if (intent.format !== INTENT_FORMAT) {
        throw new PatchManagerError('INVALID_INTENT', `${intentPath} has an unsupported format`)
    }
    try {
        return {
            format: INTENT_FORMAT,
            ...normalizeIntentPolicy(intent),
        }
    } catch (error) {
        if (error instanceof PatchManagerError && error.code === 'INVALID_INTENT') {
            throw new PatchManagerError('INVALID_INTENT', `${intentPath} has an unsupported format`, {
                cause: error.message,
            })
        }
        throw error
    }
}

function saveIntentUnlocked({
    root,
    intent,
    intentPath = DEFAULT_INTENT_PATH,
}) {
    const encoded = encodeIntent(intent)
    const before = readOptionalBuffer(root, intentPath)
    if (before !== null && before.equals(encoded)) return { changed: false, path: intentPath }
    writeAtomic(root, intentPath, encoded, { mode: PRIVATE_STATE_MODE })
    return { changed: true, path: intentPath }
}

function saveIntent({
    root,
    intent,
    intentPath = DEFAULT_INTENT_PATH,
    lockHeld = false,
}) {
    const save = () => saveIntentUnlocked({ root, intent, intentPath })
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

function validateUnitTargetVersions(pack, unit) {
    if (unit.targetVersions === undefined) return
    if (
        !unit.targetVersions
        || typeof unit.targetVersions !== 'object'
        || Array.isArray(unit.targetVersions)
        || Object.keys(unit.targetVersions).length === 0
    ) {
        throw new PatchManagerError(
            'INVALID_PACK',
            `${pack.id}: ${unit.id}.targetVersions must map package names to exact versions`,
        )
    }
    for (const [packageName, versions] of Object.entries(unit.targetVersions)) {
        if (
            !packageName
            || !Array.isArray(versions)
            || versions.length === 0
            || versions.some((version) => typeof version !== 'string' || !version)
            || new Set(versions).size !== versions.length
        ) {
            throw new PatchManagerError(
                'INVALID_PACK',
                `${pack.id}: ${unit.id}.targetVersions.${packageName} must contain unique exact versions`,
            )
        }
        const declared = new Set([
            ...(pack.targets?.[packageName]?.verified ?? []),
            ...(pack.targets?.[packageName]?.reviewing ?? []),
        ])
        const undeclared = versions.filter((version) => !declared.has(version))
        if (undeclared.length > 0) {
            throw new PatchManagerError(
                'INVALID_PACK',
                `${pack.id}: ${unit.id} scopes units to undeclared target versions`,
                { packageName, versions: undeclared },
            )
        }
    }
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
        validateUnitTargetVersions(pack, unit)
        if (
            typeof unit.file === 'string'
            && unit.file.endsWith('.svelte')
            && unit.type !== 'owned'
            && typeof unit.managed !== 'string'
            && typeof unit.content === 'string'
            && /^(?:<!--|<\/?[A-Za-z]|\{[#:/@])/.test(unit.content.trimStart())
        ) {
            throw new PatchManagerError(
                'INVALID_PACK',
                `${pack.id}: ${unit.id} inserts Svelte markup and must declare exact managed text`,
            )
        }
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

function unitMatchesTarget(unit, target) {
    if (unit.targetVersions === undefined) return true
    const versions = unit.targetVersions[target?.packageName]
    return Array.isArray(versions) && versions.includes(target?.packageVersion)
}

function flattenUnits(packs, target) {
    return packs.flatMap((pack) =>
        pack.units
            .filter((unit) => unitMatchesTarget(unit, target))
            .map((unit) => ({ ...unit, pack: pack.id, packVersion: pack.version }))
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
    packEtagCache = null,
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
            etag: packEtag(pack, { cache: packEtagCache }),
        })),
        order: result.order,
        collisions: result.collisions,
        units,
        files,
    }
}

function encodeState(state, {
    cache = null,
} = {}) {
    if (cache?.record && sameStateValue(cache.record.state, state)) {
        cache.hits += 1
        return cache.record.encoded
    }
    if (cache !== null) cache.misses += 1
    const encoded = Buffer.from(`${JSON.stringify(state, null, 2)}\n`)
    if (cache !== null) cache.record = { state: stableValue(state), encoded }
    return encoded
}

function planTransition({
    root,
    catalog,
    packIds,
    profile,
    statePath = DEFAULT_STATE_PATH,
    intentPath = DEFAULT_INTENT_PATH,
    persistIntent = false,
    intentPolicy = null,
    compositionOptions = undefined,
    packEtagCache = null,
    stateEncodingCache = null,
}) {
    const previous = loadState(root, statePath)
    const resolution = resolveSelection(catalog, packIds)
    const packs = resolution.packs
    for (const pack of packs) validatePack(pack)
    const target = readTargetIdentity(root)
    const units = flattenUnits(packs, target)
    const paths = new Set([
        ...units.map((unit) => unit.file),
        ...(previous?.units ?? []).map((unit) => unit.file),
    ])
    const current = new Map([...paths].map((file) => [file, readOptionalText(root, file)]))
    const currentModes = new Map([...paths].map((file) => [file, readOptionalMode(root, file)]))
    const baselines = previous ? stripCurrentUnits(current, previous) : new Map(current)
    const result = compose(units, baselines, compositionOptions)
    const nextState = makeState(profile, packs, units, result, baselines, currentModes, {
        packEtagCache,
        resolution,
        target,
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
    const stateAfter = units.length === 0
        ? null
        : encodeState(nextState, { cache: stateEncodingCache }).toString('utf8')
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
    let persistedIntent = null
    if (persistIntent) {
        if (intentPolicy === null) {
            throw new PatchManagerError(
                'INVALID_INTENT',
                'persistIntent requires an explicit preset or custom intent policy',
            )
        }
        const normalizedIntent = normalizeIntentPolicy(intentPolicy)
        if (normalizedIntent.mode === 'preset' && normalizedIntent.preset !== profile) {
            throw new PatchManagerError(
                'INVALID_INTENT',
                `Preset intent ${normalizedIntent.preset} does not match transition profile ${profile}`,
            )
        }
        persistedIntent = normalizedIntent.mode === 'preset'
            ? normalizedIntent
            : customIntent(resolution.effectiveRequested, normalizedIntent.preset)
        intentBefore = readOptionalText(root, intentPath)
        intentBeforeMode = readOptionalMode(root, intentPath)
        const intentAfter = encodeIntent(persistedIntent).toString('utf8')
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
        target,
        intent: persistedIntent,
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
    const actualTarget = transition.target === undefined ? null : readTargetIdentity(root)
    if (transition.target !== undefined && !sameStateValue(actualTarget, transition.target)) {
        stale.push({
            path: 'package.json',
            expectedTarget: transition.target,
            actualTarget,
        })
    }
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
    const currentTarget = readTargetIdentity(root)
    const targetStatus = state.target === undefined
        ? 'unknown'
        : (sameStateValue(state.target, currentTarget) ? 'current' : 'drifted')
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
        status: targetStatus !== 'drifted'
            && files.every((file) => file.status === 'current')
            ? 'current'
            : 'drifted',
        stateFormat: state.format,
        profile: state.profile,
        target: state.target ?? null,
        currentTarget,
        targetStatus,
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
    INTENT_FORMAT,
    STATE_FORMAT,
    PatchManagerError,
    applyTransition,
    customIntent,
    createPackEtagCache,
    createStateEncodingCache,
    flattenUnits,
    loadState,
    loadIntent,
    normalizeIntentPolicy,
    packEtag,
    planTransition,
    presetIntent,
    resolveInside,
    restoreJournal,
    saveIntent,
    selectPacks,
    stableStringify,
    status,
    unitMatchesTarget,
    withRootLock,
}
