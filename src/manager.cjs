'use strict'

const fs = require('node:fs')
const path = require('node:path')
const {
    PatchCompositionError,
    compose,
    revertUnit,
    sha256,
} = require('./compose.cjs')

const STATE_FORMAT = 1
const DEFAULT_STATE_PATH = 'save/pocketrisu-patches/state.json'
const DEFAULT_JOURNAL_PATH = 'save/pocketrisu-patches/transaction.json'

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
        version: pack.version,
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

function writeAtomic(root, relativePath, buffer) {
    assertNoSymlinkPath(root, relativePath)
    const absolute = resolveInside(root, relativePath)
    fs.mkdirSync(path.dirname(absolute), { recursive: true })
    const temporary = `${absolute}.pocketrisu-patch-tmp-${process.pid}`
    fs.writeFileSync(temporary, buffer)
    fs.renameSync(temporary, absolute)
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

function loadState(root, statePath = DEFAULT_STATE_PATH) {
    const raw = readOptionalBuffer(root, statePath)
    if (raw === null) return null
    const state = parseJsonBuffer(raw, statePath)
    if (state.format !== STATE_FORMAT || !Array.isArray(state.units) || !Array.isArray(state.order)) {
        throw new PatchManagerError('INVALID_STATE', `${statePath} has an unsupported format`)
    }
    return state
}

function restoreJournal(root, journalPath = DEFAULT_JOURNAL_PATH) {
    const raw = readOptionalBuffer(root, journalPath)
    if (raw === null) return { recovered: false }
    const journal = parseJsonBuffer(raw, journalPath)
    if (journal.format !== STATE_FORMAT || !Array.isArray(journal.originals)) {
        throw new PatchManagerError('INVALID_JOURNAL', `${journalPath} has an unsupported format`)
    }
    for (const original of journal.originals) {
        if (original.content === null) removeFile(root, original.path)
        else writeAtomic(root, original.path, Buffer.from(original.content, 'base64'))
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
}

function selectPacks(catalog, packIds) {
    const requested = [...new Set(packIds)]
    const byId = new Map(catalog.map((pack) => [pack.id, pack]))
    const selected = []
    const visiting = new Set()
    const visited = new Set()

    function visit(id) {
        if (visited.has(id)) return
        if (visiting.has(id)) {
            throw new PatchManagerError('PACK_DEPENDENCY_CYCLE', `Pack dependency cycle at ${id}`)
        }
        const pack = byId.get(id)
        if (!pack) throw new PatchManagerError('UNKNOWN_PACK', `Unknown patch pack: ${id}`)
        validatePack(pack)
        visiting.add(id)
        for (const dependency of pack.requires ?? []) visit(dependency)
        visiting.delete(id)
        visited.add(id)
        selected.push(pack)
    }

    for (const id of requested) visit(id)
    return selected.sort((left, right) => left.id.localeCompare(right.id))
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

function makeState(profile, packs, units, result, baselines) {
    const files = {}
    for (const file of new Set(units.map((unit) => unit.file))) {
        const baseline = baselines.get(file) ?? null
        const output = result.outputs.get(file) ?? null
        files[file] = {
            baselineHash: baseline === null ? null : sha256(baseline),
            outputHash: output === null ? null : sha256(output),
        }
    }
    return {
        format: STATE_FORMAT,
        profile,
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
}) {
    const previous = loadState(root, statePath)
    const packs = selectPacks(catalog, packIds)
    const units = flattenUnits(packs)
    const paths = new Set([
        ...units.map((unit) => unit.file),
        ...(previous?.units ?? []).map((unit) => unit.file),
    ])
    const current = new Map([...paths].map((file) => [file, readOptionalText(root, file)]))
    const baselines = previous ? stripCurrentUnits(current, previous) : new Map(current)
    const result = compose(units, baselines)
    const nextState = makeState(profile, packs, units, result, baselines)
    const changes = []

    for (const file of paths) {
        const before = current.get(file) ?? null
        const after = result.outputs.has(file)
            ? result.outputs.get(file)
            : baselines.get(file) ?? null
        if (before !== after) changes.push({ path: file, before, after })
    }

    const stateBefore = readOptionalText(root, statePath)
    const stateAfter = units.length === 0 ? null : encodeState(nextState).toString('utf8')
    if (stateBefore !== stateAfter) {
        changes.push({ path: statePath, before: stateBefore, after: stateAfter })
    }

    return {
        profile,
        packs: nextState.packs,
        order: result.order,
        collisions: result.collisions,
        changes,
        state: units.length === 0 ? null : nextState,
        skippedFiles: [...paths].filter((file) => !changes.some((change) => change.path === file)),
    }
}

function applyTransition({
    root,
    transition,
    journalPath = DEFAULT_JOURNAL_PATH,
    injectFailureAfter = null,
}) {
    if (transition.changes.length === 0) return { changed: false, files: [] }
    const originals = transition.changes.map((change) => {
        const original = readOptionalBuffer(root, change.path)
        return {
            path: change.path,
            content: original === null ? null : original.toString('base64'),
        }
    })
    const journal = {
        format: STATE_FORMAT,
        transactionId: `${Date.now()}-${process.pid}`,
        originals,
    }
    writeAtomic(root, journalPath, Buffer.from(`${JSON.stringify(journal, null, 2)}\n`))

    try {
        for (let index = 0; index < transition.changes.length; index += 1) {
            const change = transition.changes[index]
            if (change.after === null) removeFile(root, change.path)
            else writeAtomic(root, change.path, Buffer.from(change.after))
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

function status({ root, statePath = DEFAULT_STATE_PATH }) {
    const state = loadState(root, statePath)
    if (!state) return { status: 'clean', packs: [], files: [] }
    const files = Object.entries(state.files).map(([file, expected]) => {
        const content = readOptionalText(root, file)
        const actualHash = content === null ? null : sha256(content)
        return {
            file,
            status: actualHash === expected.outputHash ? 'current' : 'drifted',
            expectedHash: expected.outputHash,
            actualHash,
        }
    })
    return {
        status: files.every((file) => file.status === 'current') ? 'current' : 'drifted',
        profile: state.profile,
        packs: state.packs,
        files,
    }
}

module.exports = {
    DEFAULT_JOURNAL_PATH,
    DEFAULT_STATE_PATH,
    PatchManagerError,
    applyTransition,
    flattenUnits,
    loadState,
    packEtag,
    planTransition,
    resolveInside,
    restoreJournal,
    selectPacks,
    stableStringify,
    status,
}
