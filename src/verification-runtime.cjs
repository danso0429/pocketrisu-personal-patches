'use strict'

const fs = require('node:fs')
const os = require('node:os')

const FIELD_DEFINITIONS = {
    nodeVersion: {
        classification: 'compatibility-critical',
        reason: 'Node engine behavior and supported APIs can change verification semantics.',
    },
    platform: {
        classification: 'compatibility-critical',
        reason: 'Path, process, and filesystem behavior is platform-specific.',
    },
    architecture: {
        classification: 'compatibility-critical',
        reason: 'Native runtime and resource behavior can be architecture-specific.',
    },
    filesystemType: {
        classification: 'compatibility-critical',
        reason: 'Mode, symlink, hardlink, and atomic-write behavior depends on the filesystem.',
    },
    umask: {
        classification: 'semantic',
        reason: 'The verifier and patch manager create files whose modes can depend on umask.',
    },
    locale: {
        classification: 'compatibility-critical',
        reason: 'Locale can affect subprocess text behavior and must be requalified if changed.',
    },
    timezone: {
        classification: 'diagnostic',
        reason: 'Current acceptance uses numeric timestamps and does not branch on timezone.',
    },
    kernel: {
        classification: 'diagnostic',
        reason: 'Kernel identity aids diagnosis but is not itself an asserted observation.',
    },
    cpuCount: {
        classification: 'informational',
        reason: 'The recorded effective worker history, not physical CPU count, is authoritative.',
    },
    availableParallelism: {
        classification: 'semantic',
        reason: 'It selects the default worker count when --jobs is omitted.',
    },
    mountNamespaceId: {
        classification: 'diagnostic',
        reason: 'The opaque namespace identifier is not a content or behavior equivalence proof.',
    },
}

const RUNTIME_FIELD_POLICY = Object.freeze(Object.fromEntries(
    Object.entries(FIELD_DEFINITIONS).map(([field, definition]) => [
        field,
        Object.freeze({ ...definition }),
    ]),
))

function filesystemType(root) {
    if (typeof fs.statfsSync !== 'function') return null
    const stat = fs.statfsSync(root, { bigint: true })
    return `0x${stat.type.toString(16)}`
}

function mountNamespaceId() {
    try {
        return fs.readlinkSync('/proc/self/ns/mnt')
    } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'EINVAL' || error.code === 'EACCES') {
            return null
        }
        throw error
    }
}

function runtimeEnvelope({ root }) {
    const values = {
        nodeVersion: process.version,
        platform: process.platform,
        architecture: process.arch,
        filesystemType: filesystemType(root),
        umask: process.umask(),
        locale: process.env.LC_ALL ?? process.env.LC_CTYPE ?? process.env.LANG ?? null,
        timezone: process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
        kernel: os.release(),
        cpuCount: os.cpus().length,
        availableParallelism: typeof os.availableParallelism === 'function'
            ? os.availableParallelism()
            : os.cpus().length,
        mountNamespaceId: mountNamespaceId(),
    }
    return {
        schema: 'patch-verification-runtime-envelope-v1',
        fieldPolicy: RUNTIME_FIELD_POLICY,
        values,
    }
}

function compareRuntimeEnvelopes(before, after) {
    const errors = []
    const differences = []
    const schemas = new Set([before?.schema, after?.schema])
    if (
        schemas.size !== 1
        || !schemas.has('patch-verification-runtime-envelope-v1')
    ) errors.push('runtime envelope schema mismatch')
    if (
        JSON.stringify(before?.fieldPolicy) !== JSON.stringify(RUNTIME_FIELD_POLICY)
        || JSON.stringify(after?.fieldPolicy) !== JSON.stringify(RUNTIME_FIELD_POLICY)
    ) errors.push('runtime field policy mismatch')
    const beforeValues = before?.values ?? {}
    const afterValues = after?.values ?? {}
    const knownFields = Object.keys(RUNTIME_FIELD_POLICY)
    const observedFields = new Set([
        ...Object.keys(beforeValues),
        ...Object.keys(afterValues),
    ])
    for (const field of observedFields) {
        if (!Object.hasOwn(RUNTIME_FIELD_POLICY, field)) {
            errors.push(`unknown runtime field: ${field}`)
        }
    }
    for (const field of knownFields) {
        if (!Object.hasOwn(beforeValues, field) || !Object.hasOwn(afterValues, field)) {
            errors.push(`missing runtime field: ${field}`)
            continue
        }
        if (JSON.stringify(beforeValues[field]) === JSON.stringify(afterValues[field])) continue
        const definition = RUNTIME_FIELD_POLICY[field]
        const blocking = definition.classification === 'semantic'
            || definition.classification === 'compatibility-critical'
        differences.push({
            field,
            classification: definition.classification,
            before: beforeValues[field],
            after: afterValues[field],
            blocking,
        })
        if (blocking) {
            errors.push(
                `${definition.classification} runtime field changed: ${field}`,
            )
        }
    }
    return {
        errors,
        differences,
        matched: errors.length === 0,
    }
}

module.exports = {
    RUNTIME_FIELD_POLICY,
    compareRuntimeEnvelopes,
    runtimeEnvelope,
}
