'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const REPORT_SCHEMA = 1
const REPORT_DIRECTORY = 'save/pocketrisu-patches/reports'
const PRIVATE_REPORT_MODE = 0o600

const CAUSES = Object.freeze({
    ANCHOR_COUNT: 'The verified anchor was missing or appeared an unexpected number of times in the target file.',
    MISSING_FILE: 'A file required by the patch unit does not exist in the target release.',
    OWNED_COLLISION: 'A pack-owned path already exists with content the pack does not own.',
    OWNED_DRIFT: 'A pack-owned file changed after application, so removing or replacing it would discard unknown work.',
    MARKER_DRIFT: 'A managed marker remains, but its exact managed block has changed.',
    MANAGED_BLOCK_COUNT: 'The applied-state snapshot and the managed blocks present in the target no longer agree.',
    DUPLICATE_MANAGED_BLOCK: 'More than one managed block claims the same unit identity in one target file.',
    INCOMPATIBLE_UNITS: 'Neither possible order of the two units produced a valid composition.',
    AMBIGUOUS_ORDER: 'Both unit orders were structurally valid but produced different output, and no semantic order was declared.',
    ORDER_CYCLE: 'Declared or inferred ordering relationships form a cycle.',
    MISSING_DEPENDENCY: 'A unit-level dependency required by the selected graph is absent.',
    UNKNOWN_PACK: 'The requested or previously installed pack is absent from this patcher catalog.',
    INTERNAL_PACK_REQUESTED: 'A hidden integration adapter was selected directly instead of being resolved from user-facing capabilities.',
    PACK_NOT_ALLOWED: 'The requested pack is outside the ownership boundary of this compatibility preset.',
    PACK_CONFLICT: 'The selected packs declare that they cannot be enabled together.',
    PACK_DEPENDENCY_CYCLE: 'Pack-level dependencies form a cycle.',
    SUPERSEDED_PACK_REQUIRED: 'A narrower pack was superseded but another selected component still requires it.',
    DUPLICATE_PACK: 'The patcher catalog contains the same pack identity more than once.',
    DUPLICATE_UNIT: 'The resolved graph contains the same patch-unit identity more than once.',
    INVALID_SELECTION: 'The requested capability selection has an unsupported shape.',
    INVALID_PACK: 'A patch manifest is incomplete or malformed.',
    INVALID_PACK_RELATION: 'A pack dependency, conflict, supersede, or automatic-adapter relation is malformed.',
    INVALID_UNIT: 'A patch unit is incomplete or uses an unsupported transformation.',
    MODE_CONFLICT: 'Selected units require incompatible file modes for the same new file.',
    STALE_TRANSITION: 'The target changed after planning, so applying the stale plan was refused.',
    PATCH_LOCKED: 'Another patch operation currently owns this target root.',
    PATCH_LOCK_CHANGED: 'The target lock changed ownership while the patcher was operating.',
    INVALID_STATE: 'The applied-state metadata is missing required snapshots or uses an unsupported format.',
    INVALID_INTENT: 'The saved user-selection metadata uses an unsupported format.',
    INVALID_JOURNAL: 'Interrupted-transaction metadata could not be safely interpreted.',
    INVALID_JSON: 'Required patch metadata is not valid JSON.',
    UNSAFE_PATH: 'A managed metadata or source path could escape its target root.',
    SYMLINK_PATH: 'A managed path traverses a symbolic link and was refused.',
    INVALID_TARGET: 'The target package metadata could not be read or identified.',
    TARGET_REVIEW_REQUIRED: 'This exact upstream target has not been qualified by the patch maintainer.',
    CONTRACT_FAILED: 'A declared behavioral or structural contract failed.',
    CHECK_FAILED: 'A maintainer-defined validation command failed.',
    BUILD_FAILED: 'The patched staging tree did not build successfully.',
    INVALID_STAGING_TARGET: 'The proposed staging directory could not be proven to be a valid PocketRisu source baseline.',
    DIRTY_STAGING_TARGET: 'The proposed staging tree already contains patch metadata or tracked source changes.',
    STAGING_PATH_OVERLAP: 'The proposed staging directory overlaps the live installation and cannot provide isolation.',
    UNSUPPORTED_PACKAGE_MANAGER: 'The target no longer matches the package-manager contract used by the qualification pipeline.',
    MISSING_QUALIFICATION_CHECK: 'The target no longer exposes every check required by the qualification pipeline.',
    STAGING_SOURCE_DRIFT: 'A staging check changed managed source, patch state, or the tracked source-change set.',
})

function sha256(value) {
    return crypto.createHash('sha256').update(value ?? '').digest('hex')
}

function safeRelative(relative) {
    if (
        typeof relative !== 'string'
        || !relative
        || path.isAbsolute(relative)
        || relative.includes('\0')
    ) return null
    const normalized = path.posix.normalize(relative.replaceAll('\\', '/'))
    if (
        normalized === '..'
        || normalized.startsWith('../')
        || normalized !== relative.replaceAll('\\', '/')
    ) return null
    return normalized
}

function readTargetFile(root, relative) {
    const safe = safeRelative(relative)
    if (!safe) return null
    let resolvedRoot
    try {
        resolvedRoot = fs.realpathSync(root)
    } catch {
        return null
    }
    const absolute = path.resolve(resolvedRoot, safe)
    if (absolute !== resolvedRoot && !absolute.startsWith(`${resolvedRoot}${path.sep}`)) return null
    try {
        let cursor = resolvedRoot
        const parts = safe.split('/')
        for (const [index, part] of parts.entries()) {
            cursor = path.join(cursor, part)
            const stat = fs.lstatSync(cursor)
            if (stat.isSymbolicLink()) return null
            if (index < parts.length - 1 && !stat.isDirectory()) return null
            if (index === parts.length - 1 && !stat.isFile()) return null
        }
        return fs.readFileSync(absolute, 'utf8')
    } catch (error) {
        if (error.code === 'ENOENT') return null
        throw error
    }
}

function lineNumberAt(text, offset) {
    return text.slice(0, offset).split('\n').length
}

function lineSpan(text) {
    const withoutTerminalNewline = text.endsWith('\n') ? text.slice(0, -1) : text
    return Math.max(1, withoutTerminalNewline.split('\n').length)
}

function exactRanges(text, needle, limit = 5) {
    if (!needle) return []
    const ranges = []
    let offset = 0
    while (ranges.length < limit) {
        const index = text.indexOf(needle, offset)
        if (index === -1) break
        const start = lineNumberAt(text, index)
        ranges.push({
            start,
            end: start + lineSpan(needle) - 1,
        })
        offset = index + Math.max(needle.length, 1)
    }
    return ranges
}

function tokens(value) {
    return new Set(value.toLowerCase().match(/[a-z_][a-z0-9_-]*|\d+/g) ?? [])
}

function lineSimilarity(left, right) {
    const a = left.trim()
    const b = right.trim()
    if (a === b) return a ? 1 : 0.25
    const aTokens = tokens(a)
    const bTokens = tokens(b)
    if (aTokens.size === 0 || bTokens.size === 0) return 0
    let common = 0
    for (const token of aTokens) if (bTokens.has(token)) common += 1
    return common / Math.max(aTokens.size, bTokens.size)
}

function closestWindow(text, anchor) {
    const targetLines = text.split('\n')
    const signature = anchor
        .split('\n')
        .filter((line) => line.trim())
        .slice(0, 12)
    if (targetLines.length === 0 || signature.length === 0) return null
    let best = { score: -1, start: 0 }
    for (let start = 0; start < targetLines.length; start += 1) {
        let score = 0
        for (let index = 0; index < signature.length; index += 1) {
            score += lineSimilarity(signature[index], targetLines[start + index] ?? '')
        }
        score /= signature.length
        if (score > best.score) best = { score, start }
    }
    const contextStart = Math.max(0, best.start - 2)
    const contextEnd = Math.min(targetLines.length, best.start + signature.length + 2)
    return {
        start: contextStart + 1,
        end: contextEnd,
        confidence: Number(best.score.toFixed(3)),
        excerpt: targetLines.slice(contextStart, contextEnd),
    }
}

function excerpt(value, maximumLines = 12) {
    if (typeof value !== 'string') return null
    const lines = value.split('\n')
    return {
        lines: lines.length,
        excerpt: lines.slice(0, maximumLines),
        truncated: lines.length > maximumLines,
    }
}

function redact(value, replacements) {
    let result = value.replace(
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,
        '',
    )
    for (const replacement of replacements) {
        if (replacement) result = result.replaceAll(replacement, '<POCKETRISU_ROOT>')
    }
    return result
}

function simplify(value, depth = 0, replacements = []) {
    if (depth > 5) return '[depth-limit]'
    if (value instanceof Error) {
        return {
            name: value.name,
            code: value.code ?? null,
            message: redact(value.message, replacements),
            details: simplify(value.details ?? null, depth + 1, replacements),
        }
    }
    if (Array.isArray(value)) {
        return value
            .slice(0, 50)
            .map((entry) => simplify(entry, depth + 1, replacements))
    }
    if (!value || typeof value !== 'object') {
        if (typeof value !== 'string') return value
        const limited = value.length > 4000 ? `${value.slice(0, 4000)}…` : value
        return redact(limited, replacements)
    }
    return Object.fromEntries(
        Object.entries(value)
            .slice(0, 100)
            .map(([key, entry]) => [
                key,
                simplify(entry, depth + 1, replacements),
            ]),
    )
}

function collectUnitIds(error) {
    const details = error?.details ?? {}
    return [...new Set([
        details.unit,
        details.left,
        details.right,
        ...(details.units ?? []),
        ...(details.blocked ?? []),
    ].filter((value) => typeof value === 'string'))]
}

function inspectUnit(root, pack, unit) {
    const target = readTargetFile(root, unit.file)
    const anchor = typeof unit.anchor === 'string' ? unit.anchor : null
    const exact = target !== null && anchor ? exactRanges(target, anchor) : []
    return {
        pack: pack.id,
        packVersion: pack.version,
        unit: unit.id,
        file: unit.file,
        type: unit.type,
        expectedAnchor: excerpt(anchor),
        observed: target === null ? {
            exists: false,
            sha256: null,
            lines: 0,
            exactAnchorRanges: [],
            closestCandidate: null,
        } : {
            exists: true,
            sha256: sha256(target),
            lines: target.split('\n').length,
            exactAnchorRanges: exact,
            closestCandidate: anchor && exact.length === 0
                ? closestWindow(target, anchor)
                : null,
        },
    }
}

function targetIdentity(root) {
    const raw = readTargetFile(root, 'package.json')
    if (raw === null) return { packageName: null, packageVersion: null }
    try {
        const pkg = JSON.parse(raw)
        return {
            packageName: typeof pkg.name === 'string' ? pkg.name : null,
            packageVersion: typeof pkg.version === 'string' ? pkg.version : null,
        }
    } catch {
        return { packageName: null, packageVersion: null }
    }
}

function makeConflictReport({
    root,
    catalog,
    error,
    phase = 'plan',
    requestedPacks = [],
    resolution = null,
    patcherVersion = 'development',
    now = new Date(),
    redactPaths = [],
    writeSafety = {},
}) {
    const units = new Map()
    for (const pack of catalog) {
        for (const unit of pack.units ?? []) units.set(unit.id, { pack, unit })
    }
    const inspected = collectUnitIds(error)
        .map((id) => units.get(id))
        .filter(Boolean)
        .map(({ pack, unit }) => inspectUnit(root, pack, unit))
    const detailFiles = [
        error?.details?.file,
        ...(error?.details?.files ?? []),
        ...(error?.details?.stale ?? []).map((entry) => entry.path),
    ].filter((file) => typeof file === 'string')
    const files = [...new Set([
        ...inspected.map((entry) => entry.file),
        ...detailFiles,
    ])].sort()
    const code = error?.code ?? error?.name ?? 'UNKNOWN_ERROR'
    const createdAt = now.toISOString()
    const identity = targetIdentity(root)
    const replacements = [
        path.resolve(root),
        ...redactPaths.map((entry) => path.resolve(entry)),
    ]
    const seed = JSON.stringify({
        createdAt,
        code,
        requestedPacks,
        files,
        units: inspected.map((entry) => entry.unit),
        nonce: crypto.randomUUID(),
    })
    return {
        schema: REPORT_SCHEMA,
        incidentId: `${createdAt.replace(/[^0-9]/g, '').slice(0, 14)}-${sha256(seed).slice(0, 10)}`,
        createdAt,
        patcherVersion,
        phase,
        target: identity,
        selection: {
            requested: [...new Set(requestedPacks)].sort(),
            resolved: resolution?.resolvedIds ?? null,
            autoAdded: resolution?.autoAdded ?? null,
            superseded: resolution?.superseded ?? null,
        },
        error: {
            code,
            message: redact(String(error?.message ?? error), replacements),
            cause: CAUSES[code] ?? 'The patcher refused a transition it could not prove safe.',
            details: simplify(error?.details ?? null, 0, replacements),
        },
        packs: [...new Set([
            ...inspected.map((entry) => entry.pack),
            error?.details?.pack,
            error?.details?.by,
            ...(error?.details?.packs ?? []),
        ].filter((entry) => typeof entry === 'string'))].sort(),
        files,
        units: inspected,
        writeSafety: {
            liveSourceFilesChanged:
                writeSafety.liveSourceFilesChanged ?? false,
            stagingSourceFilesChanged:
                writeSafety.stagingSourceFilesChanged ?? false,
            automaticFixAttempted: false,
            packsSilentlyRemoved: false,
        },
        maintainerAction: 'Send this report to the patch maintainer. Do not edit anchors or manifests on the downloader installation.',
    }
}

function fencedBlock(language, lines) {
    const longest = (lines.join('\n').match(/`+/g) ?? [])
        .reduce((maximum, run) => Math.max(maximum, run.length), 0)
    const fence = '`'.repeat(Math.max(3, longest + 1))
    return [`${fence}${language}`, ...lines, fence]
}

function markdownReport(report) {
    const lines = [
        `# PocketRisu patch conflict ${report.incidentId}`,
        '',
        `- Phase: \`${report.phase}\``,
        `- Patcher: \`${report.patcherVersion}\``,
        `- Target: \`${report.target.packageName ?? 'unknown'} ${report.target.packageVersion ?? 'unknown'}\``,
        `- Error: \`${report.error.code}\``,
        `- Live source files changed: \`${report.writeSafety.liveSourceFilesChanged}\``,
        `- Staging source files changed: \`${report.writeSafety.stagingSourceFilesChanged}\``,
        '',
        '## Why the transition was blocked',
        '',
        report.error.cause,
        '',
        report.error.message,
        '',
        '## Error evidence',
        '',
        ...fencedBlock(
            'json',
            JSON.stringify(report.error.details, null, 2).split('\n'),
        ),
        '',
        '## Selection',
        '',
        `- Requested: ${report.selection.requested.map((id) => `\`${id}\``).join(', ') || '(none)'}`,
        `- Resolved: ${(report.selection.resolved ?? []).map((id) => `\`${id}\``).join(', ') || '(unavailable)'}`,
        '',
        '## Affected units',
        '',
    ]
    if (report.units.length === 0) {
        lines.push('No unit-level location was available for this error.', '')
    }
    for (const unit of report.units) {
        lines.push(
            `### \`${unit.pack}\` → \`${unit.file}\``,
            '',
            `- Unit: \`${unit.unit}\``,
            `- Type: \`${unit.type}\``,
            `- Target SHA-256: \`${unit.observed.sha256 ?? 'missing'}\``,
        )
        if (unit.observed.exactAnchorRanges.length > 0) {
            lines.push(`- Exact target lines: ${unit.observed.exactAnchorRanges
                .map((range) => `${range.start}–${range.end}`)
                .join(', ')}`)
        } else if (unit.observed.closestCandidate) {
            lines.push(
                `- Closest target lines: ${unit.observed.closestCandidate.start}–${unit.observed.closestCandidate.end}`,
                `- Similarity hint: ${unit.observed.closestCandidate.confidence}`,
                '',
                ...fencedBlock('text', unit.observed.closestCandidate.excerpt),
            )
        } else {
            lines.push('- Target location: unavailable')
        }
        if (unit.expectedAnchor) {
            lines.push(
                '',
                'Expected verified anchor:',
                '',
                ...fencedBlock('text', [
                    ...unit.expectedAnchor.excerpt,
                    ...(unit.expectedAnchor.truncated ? ['…'] : []),
                ]),
            )
        }
        lines.push('')
    }
    lines.push(
        '## Maintainer action',
        '',
        report.maintainerAction,
        '',
    )
    return `${lines.join('\n')}\n`
}

function assertNoSymlinkParents(root, relative) {
    let cursor = path.resolve(root)
    for (const part of safeRelative(relative).split('/')) {
        cursor = path.join(cursor, part)
        try {
            if (fs.lstatSync(cursor).isSymbolicLink()) {
                throw new Error(`Refusing to write a report through symlinked path ${relative}`)
            }
        } catch (error) {
            if (error.code === 'ENOENT') return
            throw error
        }
    }
}

function writeAtomic(absolute, content) {
    const temporary = `${absolute}.tmp-${process.pid}-${crypto.randomUUID()}`
    try {
        fs.writeFileSync(temporary, content, { flag: 'wx', mode: PRIVATE_REPORT_MODE })
        fs.chmodSync(temporary, PRIVATE_REPORT_MODE)
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

function writeConflictReport(root, report) {
    assertNoSymlinkParents(root, REPORT_DIRECTORY)
    const directory = path.resolve(root, REPORT_DIRECTORY)
    fs.mkdirSync(directory, { recursive: true })
    const jsonPath = path.posix.join(REPORT_DIRECTORY, `conflict-${report.incidentId}.json`)
    const markdownPath = path.posix.join(REPORT_DIRECTORY, `conflict-${report.incidentId}.md`)
    writeAtomic(
        path.resolve(root, jsonPath),
        `${JSON.stringify(report, null, 2)}\n`,
    )
    writeAtomic(path.resolve(root, markdownPath), markdownReport(report))
    return { jsonPath, markdownPath }
}

module.exports = {
    CAUSES,
    REPORT_DIRECTORY,
    REPORT_SCHEMA,
    makeConflictReport,
    markdownReport,
    writeConflictReport,
}
