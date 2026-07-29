'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const { createRequire } = require('node:module')
const path = require('node:path')
const {
    REPORT_DIRECTORY,
    REPORT_SCHEMA,
    markdownReport,
} = require('./report.cjs')

const DATABASE_KEY = 'database/database.bin'
const DEFAULT_RECEIVER_NAME = 'PocketRisu Patcher Report'
const REPORT_JSON_MAX_BYTES = 4 * 1024 * 1024
const LOCAL_REQUEST_TIMEOUT_MS = 15_000
const DELIVERY_CHANNELS = new Set([
    'auto',
    'persona',
    'module',
    'character',
])
const MAGIC_RAW = Buffer.from([0, 82, 73, 83, 85, 83, 65, 86, 69, 0, 7])
const MAGIC_COMPRESSED = Buffer.from([0, 82, 73, 83, 85, 83, 65, 86, 69, 0, 8])

const PRIME_MULTIPLIER = 31
const SEED_OBJECT = 17
const SEED_ARRAY = 19
const SEED_STRING = 23
const SEED_NUMBER = 29
const SEED_BOOLEAN = 31
const SEED_NULL = 37

function codedError(code, message, details = null) {
    const error = new Error(message)
    error.code = code
    if (details) error.details = details
    return error
}

function isInside(root, target) {
    return target === root || target.startsWith(`${root}${path.sep}`)
}

function assertRegularFileInside(root, relative, { maximumBytes = Infinity } = {}) {
    const resolvedRoot = fs.realpathSync(root)
    const absolute = path.resolve(resolvedRoot, relative)
    if (!isInside(resolvedRoot, absolute)) {
        throw codedError('RISU_REPORT_UNSAFE_PATH', 'The report helper refused an unsafe local path.')
    }
    let stat
    try {
        stat = fs.lstatSync(absolute)
    } catch {
        throw codedError('RISU_REPORT_FILE_MISSING', 'A required local report-delivery file is missing.')
    }
    if (!stat.isFile() || stat.isSymbolicLink()) {
        throw codedError('RISU_REPORT_UNSAFE_PATH', 'The report helper refused a non-regular or symbolic-link file.')
    }
    if (stat.size > maximumBytes) {
        throw codedError('RISU_REPORT_FILE_TOO_LARGE', 'A local report-delivery file exceeded its safety limit.')
    }
    const real = fs.realpathSync(absolute)
    if (!isInside(resolvedRoot, real)) {
        throw codedError('RISU_REPORT_UNSAFE_PATH', 'The report helper refused a file outside the PocketRisu root.')
    }
    return real
}

function validateReport(report, expectedIncidentId = null) {
    if (
        !report
        || typeof report !== 'object'
        || report.schema !== REPORT_SCHEMA
        || typeof report.incidentId !== 'string'
        || !/^[0-9]{14}-[a-f0-9]{10}$/.test(report.incidentId)
        || typeof report.createdAt !== 'string'
        || !report.error
        || !Array.isArray(report.units)
    ) {
        throw codedError('RISU_REPORT_INVALID', 'The selected conflict report is malformed or unsupported.')
    }
    if (expectedIncidentId && report.incidentId !== expectedIncidentId) {
        throw codedError('RISU_REPORT_INVALID', 'The report filename and incident identity do not match.')
    }
    return report
}

function readReportFile(root, incidentId) {
    const relative = path.posix.join(
        REPORT_DIRECTORY,
        `conflict-${incidentId}.json`,
    )
    const absolute = assertRegularFileInside(root, relative, {
        maximumBytes: REPORT_JSON_MAX_BYTES,
    })
    let parsed
    try {
        parsed = JSON.parse(fs.readFileSync(absolute, 'utf8'))
    } catch {
        throw codedError('RISU_REPORT_INVALID', 'The selected conflict report is not valid JSON.')
    }
    return validateReport(parsed, incidentId)
}

function loadConflictReport(root, incidentId = 'latest') {
    if (incidentId !== 'latest') {
        if (!/^[0-9]{14}-[a-f0-9]{10}$/.test(incidentId)) {
            throw codedError('RISU_REPORT_INVALID_ID', 'The requested incident ID is invalid.')
        }
        return readReportFile(root, incidentId)
    }

    const directory = path.resolve(root, REPORT_DIRECTORY)
    let entries
    try {
        const stat = fs.lstatSync(directory)
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('unsafe')
        entries = fs.readdirSync(directory)
    } catch {
        throw codedError('RISU_REPORT_NOT_FOUND', 'No local conflict report is available.')
    }
    const incidentIds = entries
        .map((name) => /^conflict-([0-9]{14}-[a-f0-9]{10})\.json$/.exec(name)?.[1])
        .filter(Boolean)
    if (incidentIds.length === 0) {
        throw codedError('RISU_REPORT_NOT_FOUND', 'No local conflict report is available.')
    }
    const reports = incidentIds.map((id) => readReportFile(root, id))
    reports.sort((left, right) => {
        const byCreatedAt = Date.parse(right.createdAt) - Date.parse(left.createdAt)
        if (Number.isFinite(byCreatedAt) && byCreatedAt !== 0) return byCreatedAt
        return right.incidentId.localeCompare(left.incidentId)
    })
    return reports[0]
}

function reportContent(report) {
    return markdownReport(validateReport(report))
}

function receiverMatches(database, receiverName) {
    const matches = []
    for (const [index, persona] of (database.personas ?? []).entries()) {
        if (persona && persona.name === receiverName) {
            matches.push({ type: 'persona', index, value: persona })
        }
    }
    for (const [index, module] of (database.modules ?? []).entries()) {
        if (module && module.name === receiverName) {
            matches.push({ type: 'module', index, value: module })
        }
    }
    for (const [index, character] of (database.characters ?? []).entries()) {
        if (
            character
            && character.name === receiverName
            && (character.type === undefined || character.type === 'character')
        ) {
            matches.push({ type: 'character', index, value: character })
        }
    }
    return matches
}

function chooseReceiver(database, channel, receiverName = DEFAULT_RECEIVER_NAME) {
    if (!DELIVERY_CHANNELS.has(channel)) {
        throw codedError('RISU_REPORT_CHANNEL_INVALID', 'Choose auto, persona, module, or character for RisuAI report delivery.')
    }
    if (!database || typeof database !== 'object') {
        throw codedError('RISU_REPORT_DATABASE_INVALID', 'PocketRisu returned an invalid database payload.')
    }
    const arrays = ['personas', 'modules', 'characters']
    for (const field of arrays) {
        if (database[field] !== undefined && !Array.isArray(database[field])) {
            throw codedError('RISU_REPORT_DATABASE_INVALID', `PocketRisu database field ${field} is not an array.`)
        }
    }
    const all = receiverMatches(database, receiverName)
    const matches = channel === 'auto'
        ? all
        : all.filter((entry) => entry.type === channel)
    if (matches.length === 0) {
        throw codedError(
            'RISU_REPORT_RECEIVER_NOT_FOUND',
            `Create exactly one ${channel === 'auto' ? 'persona, module, or character' : channel} named "${receiverName}", then retry.`,
        )
    }
    if (matches.length > 1) {
        throw codedError(
            'RISU_REPORT_RECEIVER_AMBIGUOUS',
            `More than one matching ${channel === 'auto' ? 'RisuAI object' : channel} is named "${receiverName}"; no report was written.`,
            {
                channel,
                matchTypes: matches.map((entry) => entry.type),
                count: matches.length,
            },
        )
    }
    return matches[0]
}

function fieldOperation(object, field, pointer, value) {
    return {
        op: Object.prototype.hasOwnProperty.call(object, field) ? 'replace' : 'add',
        path: pointer,
        value,
    }
}

function makeRisuReportPatch({
    database,
    channel,
    content,
    receiverName = DEFAULT_RECEIVER_NAME,
    randomUUID = crypto.randomUUID,
}) {
    if (typeof content !== 'string' || !content) {
        throw codedError('RISU_REPORT_CONTENT_INVALID', 'The conflict report has no deliverable text.')
    }
    const receiver = chooseReceiver(database, channel, receiverName)
    if (receiver.type === 'persona') {
        return {
            patch: [fieldOperation(
                receiver.value,
                'personaPrompt',
                `/personas/${receiver.index}/personaPrompt`,
                content,
            )],
            receiver: {
                type: 'persona',
                name: receiverName,
                field: 'personaPrompt',
                lorebookCreated: false,
            },
        }
    }
    if (receiver.type === 'character') {
        return {
            patch: [fieldOperation(
                receiver.value,
                'desc',
                `/characters/${receiver.index}/desc`,
                content,
            )],
            receiver: {
                type: 'character',
                name: receiverName,
                field: 'desc',
                lorebookCreated: false,
            },
        }
    }

    const lorebooks = receiver.value.lorebook
    if (lorebooks !== undefined && !Array.isArray(lorebooks)) {
        throw codedError(
            'RISU_REPORT_MODULE_INVALID',
            'The matching module has a malformed lorebook; no report was written.',
        )
    }
    const namedLorebooks = (lorebooks ?? [])
        .map((lorebook, index) => ({ lorebook, index }))
        .filter(({ lorebook }) => lorebook && lorebook.comment === receiverName)
    if (namedLorebooks.length > 1) {
        throw codedError(
            'RISU_REPORT_RECEIVER_AMBIGUOUS',
            `The matching module contains duplicate "${receiverName}" lorebooks; no report was written.`,
        )
    }
    if (namedLorebooks.length === 1) {
        const { lorebook, index } = namedLorebooks[0]
        const managedKey = typeof lorebook.key === 'string'
            && lorebook.key.startsWith('__pocketrisu_report_')
            && lorebook.key.endsWith('__')
            && lorebook.key.length <= 200
        if (
            !managedKey
            || lorebook.mode !== 'normal'
            || lorebook.alwaysActive !== false
            || lorebook.selective !== false
        ) {
            throw codedError(
                'RISU_REPORT_MODULE_UNSAFE',
                `The named report lorebook is not an inactive patcher-managed receiver; no report was written.`,
            )
        }
        return {
            patch: [fieldOperation(
                lorebook,
                'content',
                `/modules/${receiver.index}/lorebook/${index}/content`,
                content,
            )],
            receiver: {
                type: 'module',
                name: receiverName,
                field: `lorebook:${receiverName}`,
                lorebookCreated: false,
            },
        }
    }

    const lorebookId = randomUUID()
    const reportLorebook = {
        key: `__pocketrisu_report_${lorebookId}__`,
        secondkey: '',
        insertorder: 100,
        comment: receiverName,
        content,
        mode: 'normal',
        alwaysActive: false,
        selective: false,
        id: lorebookId,
    }
    const patch = lorebooks === undefined
        ? [{
            op: 'add',
            path: `/modules/${receiver.index}/lorebook`,
            value: [reportLorebook],
        }]
        : [{
            op: 'add',
            path: `/modules/${receiver.index}/lorebook/-`,
            value: reportLorebook,
        }]
    return {
        patch,
        receiver: {
            type: 'module',
            name: receiverName,
            field: `lorebook:${receiverName}`,
            lorebookCreated: true,
        },
    }
}

function contentAtReceiver(database, receiver, receiverName = DEFAULT_RECEIVER_NAME) {
    const selected = chooseReceiver(database, receiver.type, receiverName)
    if (receiver.type === 'persona') return selected.value.personaPrompt
    if (receiver.type === 'character') return selected.value.desc
    const lorebooks = selected.value.lorebook
    if (!Array.isArray(lorebooks)) return null
    const matches = lorebooks.filter((entry) =>
        entry && entry.comment === receiverName
    )
    if (matches.length !== 1) return null
    return matches[0].content
}

function readEnvironmentPort(root) {
    const fromProcess = Number(process.env.PORT)
    if (Number.isInteger(fromProcess) && fromProcess >= 1 && fromProcess <= 65_535) {
        return fromProcess
    }
    const environmentPath = path.resolve(root, '.env')
    try {
        const stat = fs.lstatSync(environmentPath)
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024) return 6001
        const content = fs.readFileSync(environmentPath, 'utf8')
        const match = content.match(/^(?:export\s+)?PORT\s*=\s*["']?([0-9]{1,5})["']?\s*$/m)
        const value = Number(match?.[1])
        if (Number.isInteger(value) && value >= 1 && value <= 65_535) return value
    } catch {
        // The default is PocketRisu's own default when no safe local override exists.
    }
    return 6001
}

function validateLocalServerUrl(value) {
    let url
    try {
        url = new URL(value)
    } catch {
        throw codedError('RISU_REPORT_URL_INVALID', 'The RisuAI server URL is invalid.')
    }
    const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])
    if (
        !['http:', 'https:'].includes(url.protocol)
        || !loopbackHosts.has(url.hostname)
        || url.username
        || url.password
        || url.search
        || url.hash
        || (url.pathname !== '/' && url.pathname !== '')
    ) {
        throw codedError(
            'RISU_REPORT_URL_UNSAFE',
            'RisuAI report delivery only permits a credential-free loopback HTTP(S) origin.',
        )
    }
    return url.origin
}

function defaultLocalServerUrl(root) {
    const sslDirectory = path.resolve(root, 'save/ssl')
    let https = false
    try {
        const key = fs.lstatSync(path.join(sslDirectory, 'server.key'))
        const certificate = fs.lstatSync(path.join(sslDirectory, 'server.crt'))
        https = key.isFile() && !key.isSymbolicLink()
            && certificate.isFile() && !certificate.isSymbolicLink()
    } catch {
        // PocketRisu uses HTTP when the SSL pair is absent.
    }
    const host = https ? 'localhost' : '127.0.0.1'
    return `${https ? 'https' : 'http'}://${host}:${readEnvironmentPort(root)}`
}

function createLocalJwt(root, now = () => Date.now()) {
    const secretPath = assertRegularFileInside(root, 'save/__jwt_secret', {
        maximumBytes: 4096,
    })
    const secret = fs.readFileSync(secretPath, 'utf8').trim()
    if (!/^[A-Za-z0-9_-]{32,2048}$/.test(secret)) {
        throw codedError('RISU_REPORT_AUTH_INVALID', 'PocketRisu local authentication metadata is invalid.')
    }
    const seconds = Math.floor(now() / 1000)
    const header = { alg: 'HS256', typ: 'JWT' }
    const payload = { iat: seconds, exp: seconds + 5 * 60 }
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url')
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const signature = crypto.createHmac('sha256', secret)
        .update(`${headerB64}.${payloadB64}`)
        .digest('base64url')
    return `${headerB64}.${payloadB64}.${signature}`
}

function calculateHash(node) {
    if (node === null || node === undefined) return SEED_NULL
    switch (typeof node) {
        case 'object':
            if (Array.isArray(node)) {
                let arrayHash = SEED_ARRAY
                for (const item of node) {
                    arrayHash = (
                        Math.imul(arrayHash, PRIME_MULTIPLIER)
                        + calculateHash(item)
                    ) >>> 0
                }
                return arrayHash
            }
            else {
                let objectHash = SEED_OBJECT
                for (const key in node) {
                    objectHash += (
                        Math.imul(calculateHash(key), PRIME_MULTIPLIER)
                        + calculateHash(node[key])
                    )
                }
                return objectHash >>> 0
            }
        case 'string': {
            let stringHash = 2166136261
            for (let index = 0; index < node.length; index += 1) {
                stringHash = Math.imul(
                    stringHash ^ node.charCodeAt(index),
                    16777619,
                )
            }
            return Math.imul(SEED_STRING, PRIME_MULTIPLIER)
                + (stringHash >>> 0)
        }
        case 'number': {
            let numberHash
            if (
                Number.isInteger(node)
                && node >= -2147483648
                && node <= 2147483647
            ) {
                numberHash = node >>> 0
            }
            else {
                const string = node.toString()
                numberHash = 2166136261
                for (let index = 0; index < string.length; index += 1) {
                    numberHash = Math.imul(
                        numberHash ^ string.charCodeAt(index),
                        16777619,
                    )
                }
                numberHash >>>= 0
            }
            return Math.imul(SEED_NUMBER, PRIME_MULTIPLIER) + numberHash
        }
        case 'boolean':
            return Math.imul(SEED_BOOLEAN, PRIME_MULTIPLIER) + (node ? 1 : 0)
        default:
            return 0
    }
}

function normalizeJSON(value) {
    if (value === null || value === undefined) return null
    if (typeof value !== 'object') {
        if (typeof value === 'number' && !Number.isFinite(value)) return null
        if (
            typeof value === 'function'
            || typeof value === 'symbol'
            || typeof value === 'bigint'
        ) return undefined
        return value
    }
    if (value instanceof Date) return value.toISOString()
    if (value instanceof RegExp || value instanceof Error) return {}
    if (Array.isArray(value)) {
        return value.map((entry) => {
            if (entry === undefined) return null
            const normalized = normalizeJSON(entry)
            return normalized === undefined ? null : normalized
        })
    }
    const result = {}
    for (const key in value) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) continue
        if (value[key] === undefined) continue
        const normalized = normalizeJSON(value[key])
        if (normalized !== undefined) result[key] = normalized
    }
    return result
}

function loadTargetCodec(root) {
    let packagePath
    try {
        packagePath = assertRegularFileInside(root, 'package.json', {
            maximumBytes: 2 * 1024 * 1024,
        })
    } catch {
        throw codedError(
            'RISU_REPORT_CODEC_UNAVAILABLE',
            'This PocketRisu target has no safe package boundary for report decoding.',
        )
    }
    let Unpackr
    let decompressSync
    try {
        const targetRequire = createRequire(packagePath)
        ;({ Unpackr } = targetRequire('msgpackr'))
        ;({ decompressSync } = targetRequire('fflate'))
    } catch {
        throw codedError(
            'RISU_REPORT_CODEC_UNAVAILABLE',
            'PocketRisu dependencies required for local report decoding are unavailable.',
        )
    }
    if (typeof Unpackr !== 'function' || typeof decompressSync !== 'function') {
        throw codedError(
            'RISU_REPORT_CODEC_UNAVAILABLE',
            'PocketRisu dependencies required for local report decoding are incompatible.',
        )
    }
    const unpackr = new Unpackr({
        int64AsType: 'number',
        useRecords: false,
    })
    return {
        calculateHash,
        normalizeJSON,
        async decodeRisuSave(raw) {
            const bytes = Buffer.from(raw)
            if (bytes.subarray(0, MAGIC_RAW.length).equals(MAGIC_RAW)) {
                return unpackr.decode(bytes.subarray(MAGIC_RAW.length))
            }
            if (
                bytes
                    .subarray(0, MAGIC_COMPRESSED.length)
                    .equals(MAGIC_COMPRESSED)
            ) {
                return unpackr.decode(
                    decompressSync(bytes.subarray(MAGIC_COMPRESSED.length)),
                )
            }
            throw codedError(
                'RISU_REPORT_CODEC_UNSUPPORTED',
                'PocketRisu returned a database encoding that report delivery does not guess.',
            )
        },
    }
}

async function localFetch(fetchImpl, url, init) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), LOCAL_REQUEST_TIMEOUT_MS)
    try {
        let response
        try {
            response = await fetchImpl(url, {
                ...init,
                redirect: 'error',
                signal: controller.signal,
            })
        } catch {
            throw codedError(
                'RISU_REPORT_SERVER_UNAVAILABLE',
                'The local PocketRisu server could not be reached for RisuAI report delivery.',
            )
        }
        if (response.redirected) {
            throw codedError('RISU_REPORT_URL_UNSAFE', 'The local PocketRisu server attempted to redirect report delivery.')
        }
        return response
    } finally {
        clearTimeout(timer)
    }
}

async function responseError(response, fallback) {
    let detail = ''
    try {
        const data = await response.clone().json()
        if (typeof data?.code === 'string') detail = ` (${data.code})`
    } catch {
        // Never include arbitrary response bodies in a user-facing error.
    }
    return codedError(
        response.status === 409
            ? 'RISU_REPORT_DATABASE_CONFLICT'
            : 'RISU_REPORT_SERVER_REJECTED',
        `${fallback} (HTTP ${response.status})${detail}`,
    )
}

function reportSessionCookie(response) {
    const setCookies = typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : [response.headers.get('set-cookie')]
    const tokens = setCookies
        .filter((value) => typeof value === 'string')
        .map((value) =>
            /(?:^|,\s*)risu-session=([a-f0-9]{64})(?=;|,|$)/i.exec(value)?.[1]
        )
        .filter(Boolean)
    if (tokens.length !== 1) {
        throw codedError(
            'RISU_REPORT_SESSION_INVALID',
            'PocketRisu did not issue one valid local session for the durable report flush.',
        )
    }
    return `risu-session=${tokens[0]}`
}

async function createReportSession({
    baseUrl,
    token,
    fetchImpl,
}) {
    const response = await localFetch(
        fetchImpl,
        `${baseUrl}/api/session`,
        {
            method: 'POST',
            headers: {
                'risu-auth': token,
            },
        },
    )
    if (!response.ok) {
        throw await responseError(
            response,
            'PocketRisu rejected the local session required for a durable report flush',
        )
    }
    const result = await response.clone().json().catch(() => ({}))
    if (result.ok !== true) {
        throw codedError(
            'RISU_REPORT_SESSION_INVALID',
            'PocketRisu did not confirm the local session required for a durable report flush.',
        )
    }
    return reportSessionCookie(response)
}

async function readRisuDatabase({
    baseUrl,
    token,
    codec,
    fetchImpl,
}) {
    const response = await localFetch(
        fetchImpl,
        `${baseUrl}/api/read`,
        {
            method: 'GET',
            headers: {
                'risu-auth': token,
                'file-path': Buffer.from(DATABASE_KEY, 'utf8').toString('hex'),
            },
        },
    )
    if (!response.ok) throw await responseError(response, 'PocketRisu rejected the report database read')
    const raw = Buffer.from(await response.arrayBuffer())
    if (raw.length === 0) {
        throw codedError('RISU_REPORT_DATABASE_INVALID', 'PocketRisu returned an empty database.')
    }
    let decoded
    try {
        decoded = codec.normalizeJSON(await codec.decodeRisuSave(raw))
    } catch {
        throw codedError('RISU_REPORT_DATABASE_INVALID', 'PocketRisu database decoding failed.')
    }
    if (!decoded || typeof decoded !== 'object') {
        throw codedError('RISU_REPORT_DATABASE_INVALID', 'PocketRisu returned an invalid database.')
    }
    return decoded
}

async function deliverConflictReport({
    root,
    report,
    channel = 'auto',
    serverUrl = null,
    receiverName = DEFAULT_RECEIVER_NAME,
    fetchImpl = globalThis.fetch,
    codecLoader = loadTargetCodec,
    tokenFactory = createLocalJwt,
    randomUUID = crypto.randomUUID,
}) {
    if (typeof fetchImpl !== 'function') {
        throw codedError('RISU_REPORT_SERVER_UNAVAILABLE', 'This Node.js runtime has no fetch implementation.')
    }
    validateReport(report)
    const baseUrl = validateLocalServerUrl(
        serverUrl ?? defaultLocalServerUrl(root),
    )
    const token = tokenFactory(root)
    const codec = codecLoader(root)
    const database = await readRisuDatabase({
        baseUrl,
        token,
        codec,
        fetchImpl,
    })
    const content = reportContent(report)
    const transition = makeRisuReportPatch({
        database,
        channel,
        content,
        receiverName,
        randomUUID,
    })
    // PocketRisu's flush endpoint is cookie-authenticated. Request the cookie
    // without x-session-id so report delivery cannot replace the active RisuAI
    // writer session.
    const sessionCookie = await createReportSession({
        baseUrl,
        token,
        fetchImpl,
    })
    const expectedHash = codec.calculateHash(database).toString(16)
    const patchResponse = await localFetch(
        fetchImpl,
        `${baseUrl}/api/patch`,
        {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'risu-auth': token,
                'file-path': Buffer.from(DATABASE_KEY, 'utf8').toString('hex'),
            },
            body: JSON.stringify({
                patch: transition.patch,
                expectedHash,
            }),
        },
    )
    if (!patchResponse.ok) {
        throw await responseError(patchResponse, 'PocketRisu rejected the report database patch')
    }
    const patchResult = await patchResponse.json().catch(() => ({}))
    if (patchResult.success !== true) {
        throw codedError('RISU_REPORT_SERVER_REJECTED', 'PocketRisu did not confirm the report database patch.')
    }

    const flushResponse = await localFetch(
        fetchImpl,
        `${baseUrl}/api/db/flush`,
        {
            method: 'POST',
            headers: {
                cookie: sessionCookie,
                'risu-auth': token,
            },
        },
    )
    if (!flushResponse.ok) {
        throw await responseError(flushResponse, 'PocketRisu could not durably flush the delivered report')
    }
    const flushResult = await flushResponse.json().catch(() => ({}))
    if (flushResult.success !== true) {
        throw codedError(
            'RISU_REPORT_SERVER_REJECTED',
            'PocketRisu did not confirm the durable report flush.',
        )
    }

    const verifiedDatabase = await readRisuDatabase({
        baseUrl,
        token,
        codec,
        fetchImpl,
    })
    if (contentAtReceiver(
        verifiedDatabase,
        transition.receiver,
        receiverName,
    ) !== content) {
        throw codedError(
            'RISU_REPORT_VERIFICATION_FAILED',
            'PocketRisu did not return the exact delivered report after its durable flush.',
        )
    }
    return {
        status: 'delivered',
        incidentId: report.incidentId,
        receiver: transition.receiver,
        receiverName,
        verified: true,
        directDatabaseWrite: false,
        localServerApi: true,
        localSessionIssued: true,
    }
}

module.exports = {
    DATABASE_KEY,
    DEFAULT_RECEIVER_NAME,
    DELIVERY_CHANNELS,
    calculateHash,
    chooseReceiver,
    contentAtReceiver,
    createLocalJwt,
    createReportSession,
    defaultLocalServerUrl,
    deliverConflictReport,
    loadConflictReport,
    makeRisuReportPatch,
    reportContent,
    validateLocalServerUrl,
}
