'use strict'

const fs = require('node:fs')
const os = require('node:os')

const RUNTIME_SCHEMA_V1 = 'patch-verification-runtime-envelope-v1'
const RUNTIME_SCHEMA_V2 = 'patch-verification-runtime-envelope-v2'

const FIELD_DEFINITIONS_V1 = {
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

const FIELD_DEFINITIONS_V2 = {
    ...FIELD_DEFINITIONS_V1,
    temporaryDirectory: {
        classification: 'compatibility-critical',
        reason: 'Worker copies and verifier capture files execute beneath this directory.',
    },
    temporaryFilesystemType: {
        classification: 'compatibility-critical',
        reason: 'Worker copy mode, symlink, hardlink, and atomic-write behavior depends on it.',
    },
    nodeOptions: {
        classification: 'compatibility-critical',
        reason: 'Inherited Node options can alter child runtime and module behavior.',
    },
}

function freezeFieldPolicy(definitions) {
    return Object.freeze(Object.fromEntries(
        Object.entries(definitions).map(([field, definition]) => [
        field,
        Object.freeze({ ...definition }),
        ]),
    ))
}

const RUNTIME_FIELD_POLICY_V1 = freezeFieldPolicy(FIELD_DEFINITIONS_V1)
const RUNTIME_FIELD_POLICY = freezeFieldPolicy(FIELD_DEFINITIONS_V2)
const RUNTIME_FIELD_POLICIES = Object.freeze({
    [RUNTIME_SCHEMA_V1]: RUNTIME_FIELD_POLICY_V1,
    [RUNTIME_SCHEMA_V2]: RUNTIME_FIELD_POLICY,
})

const nonEmptyString = (value) => typeof value === 'string' && value.length > 0
const nullableString = (value) => value === null || nonEmptyString(value)
const positiveInteger = (value) => Number.isSafeInteger(value) && value > 0
const canonicalDirectory = (value) => {
    if (!nonEmptyString(value)) return false
    try {
        return fs.statSync(value).isDirectory() && fs.realpathSync(value) === value
    } catch {
        return false
    }
}
const RUNTIME_VALUE_VALIDATORS = Object.freeze({
    nodeVersion: (value) => nonEmptyString(value) && /^v\d/.test(value),
    platform: nonEmptyString,
    architecture: nonEmptyString,
    filesystemType: (value) => typeof value === 'string' && /^0x[0-9a-f]+$/.test(value),
    umask: (value) => Number.isSafeInteger(value) && value >= 0 && value <= 0o777,
    locale: nonEmptyString,
    timezone: nullableString,
    kernel: nonEmptyString,
    cpuCount: positiveInteger,
    availableParallelism: positiveInteger,
    mountNamespaceId: nullableString,
    temporaryDirectory: canonicalDirectory,
    temporaryFilesystemType: (value) =>
        typeof value === 'string' && /^0x[0-9a-f]+$/.test(value),
    nodeOptions: (value) => value === null || typeof value === 'string',
})

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
    const temporaryDirectory = fs.realpathSync(os.tmpdir())
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
        temporaryDirectory,
        temporaryFilesystemType: filesystemType(temporaryDirectory),
        nodeOptions: process.env.NODE_OPTIONS ?? null,
    }
    return {
        schema: RUNTIME_SCHEMA_V2,
        fieldPolicy: RUNTIME_FIELD_POLICY,
        values,
    }
}

function compareRuntimeEnvelopes(before, after) {
    const errors = []
    const differences = []
    const schemas = new Set([before?.schema, after?.schema])
    const schema = schemas.size === 1 ? before?.schema : null
    const expectedPolicy = RUNTIME_FIELD_POLICIES[schema] ?? null
    if (schema === null || expectedPolicy === null) {
        errors.push('runtime envelope schema mismatch or unsupported schema')
        return { errors, differences, matched: false }
    }
    if (
        JSON.stringify(before?.fieldPolicy) !== JSON.stringify(expectedPolicy)
        || JSON.stringify(after?.fieldPolicy) !== JSON.stringify(expectedPolicy)
    ) errors.push('runtime field policy mismatch')
    const beforeValues = before?.values ?? {}
    const afterValues = after?.values ?? {}
    const knownFields = Object.keys(expectedPolicy)
    const observedFields = new Set([
        ...Object.keys(beforeValues),
        ...Object.keys(afterValues),
    ])
    for (const field of observedFields) {
        if (!Object.hasOwn(expectedPolicy, field)) {
            errors.push(`unknown runtime field: ${field}`)
        }
    }
    for (const field of knownFields) {
        if (!Object.hasOwn(beforeValues, field) || !Object.hasOwn(afterValues, field)) {
            errors.push(`missing runtime field: ${field}`)
            continue
        }
        const validator = RUNTIME_VALUE_VALIDATORS[field]
        if (!validator(beforeValues[field])) {
            errors.push(`invalid before runtime field value: ${field}`)
        }
        if (!validator(afterValues[field])) {
            errors.push(`invalid after runtime field value: ${field}`)
        }
        if (JSON.stringify(beforeValues[field]) === JSON.stringify(afterValues[field])) continue
        const definition = expectedPolicy[field]
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
    RUNTIME_FIELD_POLICY_V1,
    RUNTIME_SCHEMA_V1,
    RUNTIME_SCHEMA_V2,
    compareRuntimeEnvelopes,
    runtimeEnvelope,
}
