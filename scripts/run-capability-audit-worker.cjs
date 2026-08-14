#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const { fileURLToPath } = require('node:url')

const RECEIPT_SCHEMA = 'patch-legacy-access-receipt-v1'
const ALLOWED_BUILTINS = new Set(['node:fs', 'node:path'])
const OBSERVED_FS_METHODS = [
    'appendFileSync',
    'chmodSync',
    'chownSync',
    'copyFileSync',
    'createReadStream',
    'createWriteStream',
    'existsSync',
    'lstatSync',
    'mkdirSync',
    'openSync',
    'readFileSync',
    'readdirSync',
    'readlinkSync',
    'realpathSync',
    'renameSync',
    'rmSync',
    'statSync',
    'symlinkSync',
    'unlinkSync',
    'utimesSync',
    'writeFileSync',
]
const WRITE_OPERATIONS = new Set([
    'appendFileSync',
    'chmodSync',
    'chownSync',
    'copyFileSync',
    'createWriteStream',
    'mkdirSync',
    'renameSync',
    'rmSync',
    'symlinkSync',
    'unlinkSync',
    'utimesSync',
    'writeFileSync',
])

function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue)
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(
        Object.keys(value).sort().map((key) => [key, stableValue(value[key])]),
    )
}

function jsonSha256(value) {
    return crypto.createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex')
}

function isInside(candidate, root) {
    return candidate === root || candidate.startsWith(`${root}${path.sep}`)
}

function normalizeResource(value) {
    if (typeof value === 'number') return `fd:${value}`
    if (Buffer.isBuffer(value)) return value.toString('utf8')
    if (value instanceof URL) return value.protocol === 'file:' ? fileURLToPath(value) : value.href
    return String(value)
}

function main() {
    const configuration = JSON.parse(fs.readFileSync(0, 'utf8'))
    const sourceRoot = path.resolve(configuration.sourceRoot)
    const declaredReadPaths = [...new Set(configuration.allowedReadPaths.map((file) => path.resolve(file)))]
        .sort()
    const declaredReads = new Set(declaredReadPaths)
    if (
        declaredReadPaths.length === 0
        || declaredReadPaths.some((file) => !isInside(file, sourceRoot))
    ) {
        throw new Error('Legacy catalog read declarations are empty or escape the source root')
    }
    const accesses = []
    const violations = []
    for (const method of OBSERVED_FS_METHODS) {
        if (typeof fs[method] !== 'function') continue
        const original = fs[method]
        fs[method] = function auditedFsMethod(...args) {
            const raw = normalizeResource(args[0])
            const resource = raw.startsWith('fd:') ? raw : path.resolve(raw)
            accesses.push({ kind: 'filesystem', operation: method, resource })
            if (WRITE_OPERATIONS.has(method)) {
                violations.push({ kind: 'filesystem-write', operation: method, resource })
                const error = new Error(`Legacy catalog attempted ${method} on ${resource}`)
                error.code = 'UNDECLARED_CATALOG_WRITE'
                throw error
            }
            if (!raw.startsWith('fd:') && !declaredReads.has(resource)) {
                violations.push({ kind: 'undeclared-filesystem-read', operation: method, resource })
                const error = new Error(`Legacy catalog read was not declared: ${resource}`)
                error.code = 'UNDECLARED_CATALOG_READ'
                throw error
            }
            return Reflect.apply(original, this, args)
        }
    }

    const originalLoad = Module._load
    Module._load = function auditedModuleLoad(request, parent, isMain) {
        const parentFile = parent?.filename ? path.resolve(parent.filename) : null
        let resource = request
        if (request.startsWith('node:')) {
            if (!ALLOWED_BUILTINS.has(request)) {
                violations.push({ kind: 'undeclared-builtin-module', request, parent: parentFile })
                const error = new Error(`Legacy catalog requested undeclared builtin ${request}`)
                error.code = 'UNDECLARED_CATALOG_MODULE'
                throw error
            }
        } else {
            const resolved = Module._resolveFilename(request, parent, isMain)
            if (typeof resolved !== 'string' || !isInside(path.resolve(resolved), sourceRoot)) {
                violations.push({ kind: 'module-outside-source', request, resolved, parent: parentFile })
                const error = new Error(`Legacy catalog module escaped source root: ${request}`)
                error.code = 'UNDECLARED_CATALOG_MODULE'
                throw error
            }
            if (path.extname(resolved) === '.node') {
                violations.push({ kind: 'native-module', request, resolved, parent: parentFile })
                const error = new Error(`Legacy catalog requested native module ${request}`)
                error.code = 'UNDECLARED_CATALOG_NATIVE_MODULE'
                throw error
            }
            resource = path.resolve(resolved)
        }
        accesses.push({
            kind: 'module',
            operation: 'require',
            resource,
            parent: parentFile,
        })
        return Reflect.apply(originalLoad, this, [request, parent, isMain])
    }

    const { loadCatalog } = require(path.join(sourceRoot, 'src/catalog.cjs'))
    const catalog = loadCatalog(sourceRoot)
    const recordsByKey = new Map()
    for (const access of accesses) {
        const key = JSON.stringify(access)
        const current = recordsByKey.get(key)
        if (current) current.count += 1
        else recordsByKey.set(key, { ...access, count: 1 })
    }
    const records = [...recordsByKey.values()].sort((left, right) =>
        left.kind.localeCompare(right.kind)
        || left.operation.localeCompare(right.operation)
        || left.resource.localeCompare(right.resource)
        || String(left.parent).localeCompare(String(right.parent))
    )
    const byOperation = {}
    for (const access of accesses) {
        const key = `${access.kind}:${access.operation}`
        byOperation[key] = (byOperation[key] ?? 0) + 1
    }
    const payload = {
        schema: RECEIPT_SCHEMA,
        status: violations.length === 0 ? 'pass' : 'fail',
        runtime: {
            nodeVersion: process.version,
            platform: process.platform,
            architecture: process.arch,
        },
        sourceRoot,
        catalog: {
            packCount: catalog.length,
            unitCount: catalog.reduce((count, pack) => count + pack.units.length, 0),
            catalogSha256: jsonSha256(catalog),
        },
        permissions: {
            enabled: process.permission !== undefined,
            sourceReadRoot: process.permission?.has('fs.read', sourceRoot) ?? true,
            declaredReads: declaredReadPaths.every((file) =>
                process.permission?.has('fs.read', file) === true
            ),
            declaredReadCount: declaredReadPaths.length,
            declaredReadsSha256: jsonSha256(declaredReadPaths),
            sourceWrite: process.permission?.has('fs.write', sourceRoot) ?? true,
            childProcess: process.permission?.has('child') ?? true,
            worker: process.permission?.has('worker') ?? true,
            network: process.permission?.has('net') ?? null,
            allowedBuiltins: [...ALLOWED_BUILTINS].sort(),
            codeGenerationFromStrings: false,
            configurationTransport: 'pre-opened-stdin',
        },
        accesses: {
            callCount: accesses.length,
            uniqueCount: records.length,
            byOperation,
            records,
            recordsSha256: jsonSha256(records),
        },
        violations,
    }
    process.stdout.write(`${JSON.stringify({
        ...payload,
        payloadSha256: jsonSha256(payload),
    })}\n`)
}

try {
    main()
} catch (error) {
    process.stderr.write(`${JSON.stringify({
        code: error?.code ?? null,
        message: error?.message ?? String(error),
        stack: error?.stack ?? null,
    })}\n`)
    process.exitCode = 1
}
