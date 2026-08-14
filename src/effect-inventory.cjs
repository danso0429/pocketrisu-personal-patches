'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const {
    insertionText,
    markedBlock,
} = require('./compose.cjs')
const { unitMatchesTarget } = require('./manager.cjs')

const INVENTORY_SCHEMA = 'patch-effect-inventory-v1'
const PROJECTION_SCHEMA = 'patch-s0p-projection-v1'

const KNOWN_PACK_FIELDS = new Set([
    'autoWhen',
    'conflicts',
    'id',
    'inspiration',
    'presetDefaults',
    'requires',
    'source',
    'supersedes',
    'targets',
    'title',
    'units',
    'userSelectable',
    'version',
])

const KNOWN_UNIT_FIELDS = new Set([
    'after',
    'anchor',
    'anchorPolicy',
    'before',
    'content',
    'file',
    'id',
    'leading',
    'managed',
    'markerNeedle',
    'mode',
    'requires',
    'targetVersions',
    'trailing',
    'type',
    'where',
])

const GLOBAL_STATE_SURFACES = Object.freeze([
    {
        path: 'save/pocketrisu-patches/state.json',
        format: 2,
        scope: 'global-canonical',
        keys: [
            'format',
            'profile',
            'target',
            'selection',
            'packs',
            'order',
            'collisions',
            'units',
            'files',
        ],
    },
    {
        path: 'save/pocketrisu-patches/intent.json',
        format: 2,
        scope: 'global-canonical',
        keys: ['format', 'mode', 'preset', 'requestedPacks'],
    },
    {
        path: 'save/pocketrisu-patches/transaction.json',
        format: 1,
        scope: 'global-transaction',
        keys: ['format', 'transactionId', 'originals'],
    },
    {
        path: 'save/pocketrisu-patches/lock.json',
        format: 1,
        scope: 'global-lock',
        keys: ['version', 'token', 'pid', 'hostname', 'startedAt'],
    },
])

class EffectInventoryError extends Error {
    constructor(code, message, details = {}) {
        super(message)
        this.name = 'EffectInventoryError'
        this.code = code
        this.details = details
    }
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex')
}

function unsupportedValue(value, location, unsupported, kind = typeof value) {
    unsupported.push({ location, kind })
    return { $unsupported: kind }
}

function normalizeValue(value, {
    location = '$',
    unsupported = [],
    seen = new Set(),
} = {}) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
    if (typeof value === 'number') {
        return Number.isFinite(value)
            ? value
            : unsupportedValue(value, location, unsupported, 'non-finite-number')
    }
    if (typeof value === 'bigint') {
        unsupported.push({ location, kind: 'bigint' })
        return { $unsupported: 'bigint', value: value.toString() }
    }
    if (typeof value === 'undefined') return unsupportedValue(value, location, unsupported)
    if (typeof value === 'function' || typeof value === 'symbol') {
        return unsupportedValue(value, location, unsupported)
    }
    if (seen.has(value)) return unsupportedValue(value, location, unsupported, 'cycle')
    if (Array.isArray(value)) {
        seen.add(value)
        const result = value.map((entry, index) => normalizeValue(entry, {
            location: `${location}[${index}]`,
            unsupported,
            seen,
        }))
        seen.delete(value)
        return result
    }
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
        return unsupportedValue(
            value,
            location,
            unsupported,
            `object:${value.constructor?.name ?? 'unknown'}`,
        )
    }
    seen.add(value)
    // The executable catalog and generated installers use JSON semantics:
    // an optional object property whose value is undefined is absent. Unknown
    // property names are classified separately before this normalization, so
    // this does not hide an unsupported manifest surface.
    const result = Object.fromEntries(Object.keys(value).sort()
        .filter((key) => value[key] !== undefined)
        .map((key) => [
            key,
            normalizeValue(value[key], {
                location: `${location}.${key}`,
                unsupported,
                seen,
            }),
        ]))
    seen.delete(value)
    return result
}

function stableJson(value) {
    return JSON.stringify(normalizeValue(value))
}

function jsonSha256(value) {
    return sha256(stableJson(value))
}

function textDescriptor(value) {
    if (typeof value !== 'string') return null
    return {
        bytes: Buffer.byteLength(value),
        sha256: sha256(value),
    }
}

function sortedUnique(values) {
    return [...new Set(values)].sort()
}

function stringArray(value, location, validationIssues) {
    if (value === undefined) return []
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry)) {
        validationIssues.push({ location, issue: 'expected-string-array' })
        return []
    }
    return [...value]
}

function targetVersionEntries(catalog) {
    const entries = new Map()
    for (const pack of catalog) {
        for (const [packageName, declaration] of Object.entries(pack.targets ?? {})) {
            for (const status of ['verified', 'reviewing']) {
                for (const version of declaration?.[status] ?? []) {
                    const key = `${packageName}\0${version}`
                    if (!entries.has(key)) entries.set(key, { packageName, packageVersion: version, status })
                    else if (status === 'verified') entries.get(key).status = status
                }
            }
        }
    }
    return [...entries.values()].sort((left, right) =>
        left.packageName.localeCompare(right.packageName)
        || left.packageVersion.localeCompare(right.packageVersion)
    )
}

function effectiveManagedText(unit) {
    if (unit.type === 'owned') return unit.content
    if (unit.type === 'replace') return markedBlock(unit)
    if (unit.type === 'insert') return insertionText(unit)
    return null
}

function compileUnit(pack, unit, globalUnitIds) {
    const validationIssues = []
    const unsupportedValues = []
    const unknownFields = Object.keys(unit ?? {}).filter((key) => !KNOWN_UNIT_FIELDS.has(key)).sort()
    if (!unit || typeof unit !== 'object' || Array.isArray(unit)) {
        validationIssues.push({ location: 'unit', issue: 'expected-object' })
    }
    if (typeof unit?.id !== 'string' || !unit.id) {
        validationIssues.push({ location: 'unit.id', issue: 'expected-non-empty-string' })
    } else if (globalUnitIds.has(unit.id)) {
        validationIssues.push({ location: 'unit.id', issue: 'duplicate-global-unit-id' })
    } else {
        globalUnitIds.add(unit.id)
    }
    if (typeof unit?.file !== 'string' || !unit.file) {
        validationIssues.push({ location: `${unit?.id ?? 'unit'}.file`, issue: 'expected-non-empty-string' })
    }
    if (!['insert', 'replace', 'owned'].includes(unit?.type)) {
        validationIssues.push({ location: `${unit?.id ?? 'unit'}.type`, issue: 'unsupported-unit-type' })
    }
    if (unit?.type === 'owned' && typeof unit.content !== 'string') {
        validationIssues.push({ location: `${unit?.id ?? 'unit'}.content`, issue: 'owned-content-required' })
    }
    if (['insert', 'replace'].includes(unit?.type) && typeof unit.anchor !== 'string') {
        validationIssues.push({ location: `${unit?.id ?? 'unit'}.anchor`, issue: 'anchor-required' })
    }
    if (unit?.type === 'insert' && !['before', 'after'].includes(unit.where)) {
        validationIssues.push({ location: `${unit?.id ?? 'unit'}.where`, issue: 'insert-direction-required' })
    }
    for (const relation of ['requires', 'before', 'after']) {
        stringArray(unit?.[relation], `${unit?.id ?? 'unit'}.${relation}`, validationIssues)
    }

    const definition = normalizeValue(unit, {
        location: `unit:${unit?.id ?? 'unknown'}`,
        unsupported: unsupportedValues,
    })
    let managed = null
    try {
        managed = effectiveManagedText(unit)
    } catch (error) {
        validationIssues.push({
            location: `unit:${unit?.id ?? 'unknown'}`,
            issue: 'effective-managed-text-failed',
            cause: String(error.message ?? error),
        })
    }
    const unsupported = unknownFields.length > 0
        || unsupportedValues.length > 0
        || validationIssues.length > 0
    return {
        id: typeof unit?.id === 'string' ? unit.id : null,
        packId: pack.id,
        packVersion: pack.version,
        file: typeof unit?.file === 'string' ? unit.file : null,
        type: unit?.type ?? null,
        representation: unit?.type === 'owned'
            ? 'owned-whole-file-content'
            : (typeof unit?.managed === 'string'
                ? 'exact-managed-region'
                : 'generated-marker-region'),
        definition,
        definitionSha256: sha256(JSON.stringify(definition)),
        targetVersions: normalizeValue(unit?.targetVersions ?? null),
        region: {
            kind: unit?.type === 'owned' ? 'whole-file' : 'anchored-region',
            operation: unit?.type ?? null,
            where: unit?.where ?? null,
            anchorPolicy: unit?.anchorPolicy ?? 'exactly-one',
            anchor: textDescriptor(unit?.anchor),
            content: textDescriptor(unit?.content),
            declaredManaged: textDescriptor(unit?.managed),
            effectiveManaged: textDescriptor(managed),
            markerNeedle: textDescriptor(unit?.markerNeedle),
        },
        ownership: {
            kind: unit?.type === 'owned' ? 'whole-file' : 'managed-region',
            declaredBy: 'unit-type',
        },
        ordering: {
            requires: stringArray(unit?.requires, `${unit?.id ?? 'unit'}.requires`, []),
            before: stringArray(unit?.before, `${unit?.id ?? 'unit'}.before`, []),
            after: stringArray(unit?.after, `${unit?.id ?? 'unit'}.after`, []),
        },
        stateEffects: { status: 'undeclared-unsealed' },
        symbolEffects: { status: 'undeclared-unsealed' },
        unknownFields,
        unsupportedValues,
        validationIssues,
        candidateTier: unsupported ? 'U' : 'G',
    }
}

function compilePack(pack, globalPackIds, globalUnitIds) {
    const validationIssues = []
    const unsupportedValues = []
    const unknownFields = Object.keys(pack ?? {}).filter((key) => !KNOWN_PACK_FIELDS.has(key)).sort()
    if (!pack || typeof pack !== 'object' || Array.isArray(pack)) {
        validationIssues.push({ location: 'pack', issue: 'expected-object' })
    }
    if (typeof pack?.id !== 'string' || !pack.id) {
        validationIssues.push({ location: 'pack.id', issue: 'expected-non-empty-string' })
    } else if (globalPackIds.has(pack.id)) {
        validationIssues.push({ location: 'pack.id', issue: 'duplicate-pack-id' })
    } else {
        globalPackIds.add(pack.id)
    }
    if (typeof pack?.version !== 'string' || !pack.version) {
        validationIssues.push({ location: `${pack?.id ?? 'pack'}.version`, issue: 'version-required' })
    }
    if (!Array.isArray(pack?.units)) {
        validationIssues.push({ location: `${pack?.id ?? 'pack'}.units`, issue: 'expected-array' })
    }
    for (const relation of ['requires', 'conflicts', 'supersedes']) {
        stringArray(pack?.[relation], `${pack?.id ?? 'pack'}.${relation}`, validationIssues)
    }
    for (const relation of ['all', 'any', 'none']) {
        stringArray(pack?.autoWhen?.[relation], `${pack?.id ?? 'pack'}.autoWhen.${relation}`, validationIssues)
    }
    const units = Array.isArray(pack?.units)
        ? pack.units.map((unit) => compileUnit(pack, unit, globalUnitIds))
        : []
    const definition = normalizeValue(pack, {
        location: `pack:${pack?.id ?? 'unknown'}`,
        unsupported: unsupportedValues,
    })
    const { units: ignoredUnits, ...metadata } = definition
    const unsupported = unknownFields.length > 0
        || unsupportedValues.length > 0
        || validationIssues.length > 0
        || units.some((unit) => unit.candidateTier === 'U')
    return {
        id: typeof pack?.id === 'string' ? pack.id : null,
        version: typeof pack?.version === 'string' ? pack.version : null,
        userSelectable: pack?.userSelectable !== false,
        metadata,
        definitionSha256: sha256(JSON.stringify(definition)),
        unitIds: units.map((unit) => unit.id),
        relations: {
            requires: stringArray(pack?.requires, `${pack?.id ?? 'pack'}.requires`, []),
            conflicts: stringArray(pack?.conflicts, `${pack?.id ?? 'pack'}.conflicts`, []),
            supersedes: stringArray(pack?.supersedes, `${pack?.id ?? 'pack'}.supersedes`, []),
            autoWhen: pack?.autoWhen ? {
                all: stringArray(pack.autoWhen.all, `${pack?.id ?? 'pack'}.autoWhen.all`, []),
                any: stringArray(pack.autoWhen.any, `${pack?.id ?? 'pack'}.autoWhen.any`, []),
                none: stringArray(pack.autoWhen.none, `${pack?.id ?? 'pack'}.autoWhen.none`, []),
            } : null,
        },
        unknownFields,
        unsupportedValues,
        validationIssues,
        candidateTier: unsupported ? 'U' : 'G',
        units,
    }
}

function compileRelations(packs, units) {
    const packEdges = []
    const autoWhenHyperedges = []
    for (const pack of packs) {
        for (const relation of ['requires', 'conflicts', 'supersedes']) {
            for (const target of pack.relations[relation]) {
                packEdges.push({ relation, from: pack.id, to: target })
            }
        }
        if (pack.relations.autoWhen !== null) {
            autoWhenHyperedges.push({
                subject: pack.id,
                ...pack.relations.autoWhen,
            })
        }
    }
    const unitEdges = []
    for (const unit of units) {
        for (const relation of ['requires', 'before', 'after']) {
            for (const target of unit.ordering[relation]) {
                unitEdges.push({ relation, from: unit.id, to: target })
            }
        }
    }
    const sorter = (left, right) => stableJson(left).localeCompare(stableJson(right))
    return {
        packEdges: packEdges.sort(sorter),
        autoWhenHyperedges: autoWhenHyperedges.sort(sorter),
        unitEdges: unitEdges.sort(sorter),
    }
}

function compileFiles(units) {
    const byFile = new Map()
    for (const unit of units) {
        if (typeof unit.file !== 'string') continue
        if (!byFile.has(unit.file)) byFile.set(unit.file, [])
        byFile.get(unit.file).push(unit)
    }
    return [...byFile].sort(([left], [right]) => left.localeCompare(right)).map(([file, members]) => ({
        file,
        packs: sortedUnique(members.map((unit) => unit.packId)),
        units: members.map((unit) => unit.id).sort(),
        ownershipKinds: sortedUnique(members.map((unit) => unit.ownership.kind)),
        sharedAcrossPacks: new Set(members.map((unit) => unit.packId)).size > 1,
    }))
}

function compileTargetViews(catalog, compiledUnits) {
    const byId = new Map(compiledUnits.map((unit) => [unit.id, unit]))
    return targetVersionEntries(catalog).map((target) => {
        const sourceUnits = catalog.flatMap((pack) => pack.units)
            .filter((unit) => unitMatchesTarget(unit, target))
        const units = sourceUnits.map((unit) => byId.get(unit.id)).filter(Boolean)
        const files = sortedUnique(units.map((unit) => unit.file).filter(Boolean))
        return {
            target,
            packCount: catalog.length,
            unitCount: units.length,
            managedPathCount: files.length,
            unitIds: units.map((unit) => unit.id).sort(),
            managedPaths: files,
        }
    })
}

function compileEffectInventory(catalog, {
    sourceInputs = null,
    generatedArtifacts = [],
} = {}) {
    if (!Array.isArray(catalog)) {
        throw new EffectInventoryError('INVALID_CATALOG', 'Catalog must be an array')
    }
    const globalPackIds = new Set()
    const globalUnitIds = new Set()
    const compiledPacks = catalog.map((pack) => compilePack(pack, globalPackIds, globalUnitIds))
    const units = compiledPacks.flatMap((pack) => pack.units)
    const packs = compiledPacks.map(({ units: ignoredUnits, ...pack }) => pack)
    const files = compileFiles(units)
    const relations = compileRelations(packs, units)
    const targetViews = compileTargetViews(catalog, units)
    const classifications = packs.map((pack) => ({
        packId: pack.id,
        candidateTier: pack.candidateTier,
        enforced: false,
        reasons: pack.candidateTier === 'U'
            ? ['unsupported-or-invalid-manifest-surface']
            : [
                'global-persisted-selection-state',
                'unsealed-commonjs-manifest-execution',
                'undeclared-state-effects',
                'undeclared-symbol-effects',
            ],
    }))
    const issues = [
        ...packs.flatMap((pack) => [
            ...pack.unknownFields.map((field) => ({ packId: pack.id, kind: 'unknown-pack-field', field })),
            ...pack.unsupportedValues.map((value) => ({ packId: pack.id, kind: 'unsupported-pack-value', ...value })),
            ...pack.validationIssues.map((issue) => ({ packId: pack.id, kind: 'pack-validation', ...issue })),
        ]),
        ...units.flatMap((unit) => [
            ...unit.unknownFields.map((field) => ({ packId: unit.packId, unitId: unit.id, kind: 'unknown-unit-field', field })),
            ...unit.unsupportedValues.map((value) => ({ packId: unit.packId, unitId: unit.id, kind: 'unsupported-unit-value', ...value })),
            ...unit.validationIssues.map((issue) => ({ packId: unit.packId, unitId: unit.id, kind: 'unit-validation', ...issue })),
        ]),
        ...generatedArtifacts
            .filter((artifact) => artifact.catalogMatches !== true)
            .map((artifact) => ({ kind: 'generated-catalog-mismatch', file: artifact.file })),
    ]
    const inventory = {
        schema: INVENTORY_SCHEMA,
        catalog: {
            packCount: packs.length,
            visiblePackCount: packs.filter((pack) => pack.userSelectable).length,
            internalPackCount: packs.filter((pack) => !pack.userSelectable).length,
            unitCount: units.length,
            managedPathCount: files.length,
            catalogSha256: jsonSha256(catalog),
            sourceInputs,
            generatedArtifacts,
        },
        packs,
        units,
        files,
        relations,
        ownership: {
            wholeFileUnitIds: units.filter((unit) => unit.ownership.kind === 'whole-file').map((unit) => unit.id).sort(),
            managedRegionUnitIds: units.filter((unit) => unit.ownership.kind === 'managed-region').map((unit) => unit.id).sort(),
            sharedManagedPaths: files.filter((file) => file.sharedAcrossPacks).map((file) => file.file),
        },
        ordering: {
            declaredUnitEdges: relations.unitEdges,
            targetStructuralOrdering: 'requires-exact-target-baseline-observation',
        },
        state: {
            patcherGlobalSurfaces: GLOBAL_STATE_SURFACES,
            packStateDeclarations: [],
            undeclaredPackStateEffects: packs.map((pack) => pack.id).sort(),
            S0POnly: true,
        },
        symbols: {
            declaredSymbols: [],
            undeclaredUnitSymbolEffects: units.map((unit) => unit.id).sort(),
            completeness: 'unsealed',
        },
        targetViews,
        classifications,
        completeness: {
            status: issues.length === 0 ? 'complete-observational' : 'incomplete-fail-closed',
            everyPackIncluded: packs.length === catalog.length,
            everyUnitIncluded: units.length === catalog.reduce(
                (count, pack) => count + (Array.isArray(pack.units) ? pack.units.length : 0),
                0,
            ),
            issues,
        },
        proofLimits: [
            'candidate tiers are observational and are not capability admission',
            'CommonJS manifest execution is not deny-by-default or hermetically sealed',
            'unit content is opaque application code; state, symbol, environment, process, network and subprocess effects are undeclared',
            'target applicability and inferred structural ordering require exact target baseline observation',
            'S0-P is a read-only projection and is not canonical persisted state',
            'this inventory does not authorize mask skipping, certificates or a canonical-gate change',
        ],
    }
    return {
        ...inventory,
        inventorySha256: jsonSha256(inventory),
    }
}

function fileDescriptor(file) {
    const stat = fs.lstatSync(file)
    if (stat.isFile()) {
        const content = fs.readFileSync(file)
        return {
            type: 'file',
            mode: stat.mode & 0o7777,
            bytes: stat.size,
            sha256: sha256(content),
        }
    }
    if (stat.isSymbolicLink()) {
        return {
            type: 'symlink',
            mode: stat.mode & 0o7777,
            target: fs.readlinkSync(file),
        }
    }
    throw new EffectInventoryError('UNSUPPORTED_SOURCE_INPUT', `Unsupported source input: ${file}`)
}

function walkFiles(root, relative = '', output = []) {
    const absolute = relative ? path.join(root, relative) : root
    const stat = fs.lstatSync(absolute)
    if (!stat.isDirectory()) {
        output.push(relative)
        return output
    }
    for (const name of fs.readdirSync(absolute).sort()) {
        walkFiles(root, relative ? path.join(relative, name) : name, output)
    }
    return output
}

function discoverInventorySourceInputs(repositoryRoot, catalog) {
    const root = fs.realpathSync(path.resolve(repositoryRoot))
    const catalogPath = path.join(root, 'src/catalog.cjs')
    const catalogSource = fs.readFileSync(catalogPath, 'utf8')
    const rootModules = [...catalogSource.matchAll(
        /require\(path\.join\(repositoryRoot, '([^']+\/manifest\.cjs)'\)\)/g,
    )].map((match) => match[1])
    if (rootModules.length !== catalog.length) {
        throw new EffectInventoryError(
            'CATALOG_SOURCE_MAPPING',
            'Static catalog root-module mapping does not match the loaded catalog',
            { catalogPacks: catalog.length, rootModules: rootModules.length },
        )
    }
    const patchRoot = path.join(root, 'patches')
    const patchFiles = walkFiles(patchRoot).map((relative) => ({
        path: path.posix.join('patches', relative.split(path.sep).join('/')),
        descriptor: fileDescriptor(path.join(patchRoot, relative)),
    }))
    const manifestModules = patchFiles
        .filter(({ path: file }) => /(?:manifest(?:-helpers)?|adapter-manifest|units)\.cjs$/.test(file))
        .map(({ path: file }) => file)
    const result = {
        catalogModule: {
            path: 'src/catalog.cjs',
            descriptor: fileDescriptor(catalogPath),
        },
        rootManifestModules: rootModules.map((file, index) => ({
            packId: catalog[index].id,
            path: file,
            descriptor: fileDescriptor(path.join(root, file)),
        })),
        manifestModules,
        patchFiles,
    }
    return {
        ...result,
        sourceInputsSha256: jsonSha256(result),
    }
}

function inspectGeneratedCatalogs(repositoryRoot, catalog) {
    const root = fs.realpathSync(path.resolve(repositoryRoot))
    const directory = path.join(root, 'dist')
    const expected = [
        'pocketrisu-all.cjs',
        'pocketrisu-features.cjs',
        'pocketrisu-hardening.cjs',
        'pocketrisu-patcher.cjs',
    ]
    const catalogHash = jsonSha256(catalog)
    return expected.map((name) => {
        const absolute = path.join(directory, name)
        if (!fs.existsSync(absolute)) {
            return { file: `dist/${name}`, status: 'missing', catalogMatches: false }
        }
        const source = fs.readFileSync(absolute, 'utf8')
        const line = source.split('\n').find((entry) => entry.startsWith('const EMBEDDED_CATALOG = '))
        if (!line?.endsWith(';')) {
            return {
                file: `dist/${name}`,
                status: 'unparseable',
                descriptor: fileDescriptor(absolute),
                catalogMatches: false,
            }
        }
        let embedded
        try {
            embedded = JSON.parse(line.slice('const EMBEDDED_CATALOG = '.length, -1))
        } catch (error) {
            return {
                file: `dist/${name}`,
                status: 'unparseable',
                descriptor: fileDescriptor(absolute),
                parseError: String(error.message ?? error),
                catalogMatches: false,
            }
        }
        return {
            file: `dist/${name}`,
            status: 'parsed',
            descriptor: fileDescriptor(absolute),
            packCount: embedded.length,
            unitCount: embedded.reduce((count, pack) => count + (pack.units?.length ?? 0), 0),
            managedPathCount: new Set(embedded.flatMap((pack) =>
                (pack.units ?? []).map((unit) => unit.file)
            )).size,
            catalogSha256: jsonSha256(embedded),
            catalogMatches: jsonSha256(embedded) === catalogHash,
        }
    })
}

function projectS0P(state, inventory) {
    if (!state || typeof state !== 'object' || !Array.isArray(state.packs) || !Array.isArray(state.units)) {
        throw new EffectInventoryError('INVALID_S0P_STATE', 'S0-P projection requires a loaded or prospective global state')
    }
    if (!inventory || inventory.schema !== INVENTORY_SCHEMA) {
        throw new EffectInventoryError('INVALID_S0P_INVENTORY', 'S0-P projection requires an effect inventory v1')
    }
    const inventoryUnits = new Map(inventory.units.map((unit) => [unit.id, unit]))
    const stateUnits = state.units.map((unit) => ({
        unit,
        packId: unit.pack ?? inventoryUnits.get(unit.id)?.packId ?? null,
    }))
    const orderIndex = new Map((state.order ?? []).map((id, index) => [id, index]))
    const packRecords = state.packs.map((pack) => {
        const units = stateUnits.filter((entry) => entry.packId === pack.id).map((entry) => entry.unit)
        const unitIds = units.map((unit) => unit.id).sort()
        const paths = sortedUnique(units.map((unit) => unit.file))
        const files = Object.fromEntries(paths.map((file) => [file, normalizeValue(state.files?.[file] ?? null)]))
        return {
            packId: pack.id,
            packVersion: pack.version,
            packEtag: pack.etag,
            candidateTier: inventory.classifications.find((entry) => entry.packId === pack.id)?.candidateTier ?? 'U',
            unitIds,
            managedPaths: paths,
            fileObservations: files,
            globalOrderPositions: unitIds.map((id) => ({ id, index: orderIndex.get(id) ?? null })),
            collisionIndexes: (state.collisions ?? []).flatMap((collision, index) =>
                collision.units?.some((id) => unitIds.includes(id)) ? [index] : []
            ),
        }
    }).sort((left, right) => left.packId.localeCompare(right.packId))
    const stateValue = normalizeValue(state)
    const projection = {
        schema: PROJECTION_SCHEMA,
        canonical: false,
        readOnly: true,
        sourceState: {
            format: state.format,
            profile: state.profile,
            target: normalizeValue(state.target ?? null),
            stateSha256: sha256(JSON.stringify(stateValue)),
            inventorySha256: inventory.inventorySha256,
        },
        globalConnectors: {
            selection: normalizeValue(state.selection ?? null),
            orderSha256: jsonSha256(state.order ?? []),
            collisionsSha256: jsonSha256(state.collisions ?? []),
            filesSha256: jsonSha256(state.files ?? {}),
            reason: 'S0-P retains the global canonical selection/state boundary and is not component-local state',
        },
        packRecords,
    }
    return {
        ...projection,
        projectionSha256: jsonSha256(projection),
    }
}

function renderInventoryMarkdown(inventory, {
    targetObservation = null,
} = {}) {
    const tierCounts = Object.fromEntries(['L', 'B', 'G', 'U'].map((tier) => [
        tier,
        inventory.classifications.filter((entry) => entry.candidateTier === tier).length,
    ]))
    const lines = [
        '# Patch Effect Inventory',
        '',
        `- Schema: \`${inventory.schema}\``,
        `- Inventory SHA-256: \`${inventory.inventorySha256}\``,
        `- Packs: ${inventory.catalog.packCount} (${inventory.catalog.visiblePackCount} visible, ${inventory.catalog.internalPackCount} internal)`,
        `- Units: ${inventory.catalog.unitCount}`,
        `- Managed paths: ${inventory.catalog.managedPathCount}`,
        `- Candidate tiers: L ${tierCounts.L}, B ${tierCounts.B}, G ${tierCounts.G}, U ${tierCounts.U}`,
        `- Completeness: ${inventory.completeness.status}`,
        '',
    ]
    if (targetObservation !== null) {
        lines.push(
            '## Target observation',
            '',
            `- Target: \`${targetObservation.target.packageName}@${targetObservation.target.packageVersion}\``,
            `- Resolved packs: ${targetObservation.resolvedPackCount}`,
            `- Active units: ${targetObservation.activeUnitCount}`,
            `- Active managed paths: ${targetObservation.activeManagedPathCount}`,
            `- Structural collisions: ${targetObservation.collisionCount}`,
            '',
        )
    }
    lines.push(
        '## Packs',
        '',
        '| Pack | Visibility | Units | Candidate |',
        '| --- | --- | ---: | --- |',
        ...inventory.packs.map((pack) =>
            `| ${pack.id} | ${pack.userSelectable ? 'visible' : 'internal'} | ${pack.unitIds.length} | ${pack.candidateTier} |`
        ),
        '',
        '## Proof limits',
        '',
        ...inventory.proofLimits.map((limit) => `- ${limit}`),
        '',
    )
    return lines.join('\n')
}

module.exports = {
    EffectInventoryError,
    GLOBAL_STATE_SURFACES,
    INVENTORY_SCHEMA,
    KNOWN_PACK_FIELDS,
    KNOWN_UNIT_FIELDS,
    PROJECTION_SCHEMA,
    compileEffectInventory,
    discoverInventorySourceInputs,
    inspectGeneratedCatalogs,
    jsonSha256,
    normalizeValue,
    projectS0P,
    renderInventoryMarkdown,
    sha256,
    stableJson,
    textDescriptor,
}
