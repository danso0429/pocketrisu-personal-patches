'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const {
    FIXTURES,
    MANIFEST_CANONICAL,
    MANIFEST_SHA256,
    PROFILE,
    REQUIRED_FEATURE_TAGS,
    REQUIRED_PAID_FIXTURE_IDS,
} = require('./manifest-v1.cjs')

const LINES_PER_COLUMN = 357
const COLUMNS_PER_PAGE = 4
const LINES_PER_PAGE = LINES_PER_COLUMN * COLUMNS_PER_PAGE
const COPY_INSTRUCTION_PREFIX = 'PAGEFOLD_VERBATIM_COPY_V1'
const TARGET_MODULES = Object.freeze([
    'server/node/pageFoldFontCache.cjs',
    'server/node/pageFoldPdfReader.cjs',
    'server/node/pageFoldPdfService.cjs',
    'server/node/pageFoldPdfWorker.cjs',
    'server/node/pageFoldStructuralRequalification.cjs',
])

class VerbatimQualificationError extends Error {
    constructor(code, message = code, options = {}) {
        super(message, options.cause ? { cause: options.cause } : undefined)
        this.name = 'VerbatimQualificationError'
        this.code = code
    }
}

function sha256(bytes) {
    return crypto.createHash('sha256').update(bytes).digest('hex')
}

function isWellFormedUnicode(value) {
    if (typeof value !== 'string') return false
    for (let index = 0; index < value.length; index++) {
        const unit = value.charCodeAt(index)
        if (unit >= 0xD800 && unit <= 0xDBFF) {
            const next = value.charCodeAt(index + 1)
            if (!(next >= 0xDC00 && next <= 0xDFFF)) return false
            index++
            continue
        }
        if (unit >= 0xDC00 && unit <= 0xDFFF) return false
    }
    return true
}

function decodeFixturePayload(fixture) {
    if (!fixture || typeof fixture !== 'object' || typeof fixture.payloadUtf8Base64 !== 'string') {
        throw new VerbatimQualificationError('FIXTURE_INVALID')
    }
    const bytes = Buffer.from(fixture.payloadUtf8Base64, 'base64')
    if (bytes.toString('base64') !== fixture.payloadUtf8Base64) {
        throw new VerbatimQualificationError('FIXTURE_BASE64_NON_CANONICAL')
    }
    let text
    try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch (error) {
        throw new VerbatimQualificationError('FIXTURE_UTF8_INVALID', undefined, { cause: error })
    }
    if (!isWellFormedUnicode(text) || !Buffer.from(text, 'utf8').equals(bytes)) {
        throw new VerbatimQualificationError('FIXTURE_UTF8_NON_CANONICAL')
    }
    return { bytes, text }
}

function codePoints(value) {
    return Array.from(value, (character) => character.codePointAt(0))
}

function normalizationForm(value) {
    const nfc = value.normalize('NFC') === value
    const nfd = value.normalize('NFD') === value
    if (nfc && nfd) return 'NFC=NFD'
    if (nfc) return 'NFC'
    if (nfd) return 'NFD'
    return 'other'
}

function whitespaceRuns(value) {
    const scalars = Array.from(value)
    const runs = []
    let active = null
    for (let index = 0; index < scalars.length; index++) {
        const character = scalars[index]
        if (!/\s/u.test(character)) {
            if (active) runs.push(active)
            active = null
            continue
        }
        const point = character.codePointAt(0)
        if (!active || active.lastPoint !== point) {
            if (active) runs.push(active)
            active = { start: index, length: 1, codePoints: [point], lastPoint: point }
        } else {
            active.length++
            active.codePoints.push(point)
        }
    }
    if (active) runs.push(active)
    return runs.map(({ lastPoint, ...run }) => run)
}

function firstDifference(left, right) {
    const minimum = Math.min(left.length, right.length)
    for (let index = 0; index < minimum; index++) {
        if (left[index] !== right[index]) return index
    }
    return left.length === right.length ? -1 : minimum
}

function boundedByteContext(bytes, offset, radius = 16) {
    if (offset < 0) return null
    const start = Math.max(0, offset - radius)
    const end = Math.min(bytes.length, offset + radius)
    return {
        start,
        end,
        base64: bytes.subarray(start, end).toString('base64'),
    }
}

function classifyMutation(expected, observed) {
    if (!isWellFormedUnicode(observed)) return 'ill-formed-unicode'
    if (expected === observed) return 'exact'
    if (expected.trim() === observed) {
        const leading = expected.trimStart() !== expected
        const trailing = expected.trimEnd() !== expected
        return leading && trailing ? 'edge-trim' : leading ? 'leading-trim' : 'trailing-trim'
    }
    const normalizeLines = (value) => value.replace(/\r\n|\r/g, '\n')
    if (normalizeLines(expected) === normalizeLines(observed)) return 'line-ending'
    if (expected.normalize('NFC') === observed.normalize('NFC')) return 'normalization'
    const fence = String.fromCharCode(96).repeat(3)
    if (observed.startsWith(fence) || observed.endsWith(fence)) return 'fence/prefix'
    if (observed.startsWith(expected) || observed.endsWith(expected)) return 'fence/prefix'
    if (expected.startsWith(observed)) return 'truncation'
    if (expected.replaceAll('\\n', '\n') === observed
        || expected.replaceAll('\n', '\\n') === observed) return 'escape-change'
    return 'other'
}

function compareUtf8Exact(expected, observed) {
    if (!isWellFormedUnicode(expected)) {
        throw new VerbatimQualificationError('EXPECTED_UNICODE_INVALID')
    }
    const expectedBytes = Buffer.from(expected, 'utf8')
    if (!isWellFormedUnicode(observed)) {
        return {
            exact: false,
            classification: 'ill-formed-unicode',
            expectedBytes: expectedBytes.byteLength,
            observedBytes: null,
            expectedSha256: sha256(expectedBytes),
            observedSha256: null,
            firstByteOffset: null,
            firstScalarOffset: null,
            expectedContext: null,
            observedContext: null,
            expectedNormalization: normalizationForm(expected),
            observedNormalization: null,
            expectedWhitespaceRuns: whitespaceRuns(expected),
            observedWhitespaceRuns: null,
        }
    }
    const observedBytes = Buffer.from(observed, 'utf8')
    const firstByteOffset = firstDifference(expectedBytes, observedBytes)
    const expectedPoints = codePoints(expected)
    const observedPoints = codePoints(observed)
    const firstScalarOffset = firstDifference(expectedPoints, observedPoints)
    return {
        exact: firstByteOffset === -1,
        classification: classifyMutation(expected, observed),
        expectedBytes: expectedBytes.byteLength,
        observedBytes: observedBytes.byteLength,
        expectedSha256: sha256(expectedBytes),
        observedSha256: sha256(observedBytes),
        firstByteOffset,
        firstScalarOffset,
        expectedContext: boundedByteContext(expectedBytes, firstByteOffset),
        observedContext: boundedByteContext(observedBytes, firstByteOffset),
        expectedNormalization: normalizationForm(expected),
        observedNormalization: normalizationForm(observed),
        expectedWhitespaceRuns: whitespaceRuns(expected),
        observedWhitespaceRuns: whitespaceRuns(observed),
    }
}

function verifyComparatorControls() {
    const fence = String.fromCharCode(96).repeat(3)
    const controls = [
        ['exact', '  A\r\né👨‍👩  ', '  A\r\né👨‍👩  ', 'exact'],
        ['edge-trim', '  A  ', 'A', 'edge-trim'],
        ['line-ending', 'A\r\nB\rC', 'A\nB\nC', 'line-ending'],
        ['normalization', 'é', 'e\u0301', 'normalization'],
        ['fence', 'const x = 1', fence + 'js\nconst x = 1\n' + fence, 'fence/prefix'],
        ['truncation', 'abcdef', 'abc', 'truncation'],
        ['escape', 'A\\nB', 'A\nB', 'escape-change'],
        ['other', 'abc', 'abd', 'other'],
    ]
    const observations = controls.map(([id, expected, observed, classification]) => {
        const result = compareUtf8Exact(expected, observed)
        if (result.classification !== classification) {
            throw new VerbatimQualificationError('COMPARATOR_CONTROL_FAILED', id)
        }
        if ((id === 'exact') !== result.exact) {
            throw new VerbatimQualificationError('COMPARATOR_EQUALITY_FAILED', id)
        }
        return { id, classification: result.classification, firstByteOffset: result.firstByteOffset }
    })
    const illFormed = compareUtf8Exact('A', '\uD800')
    if (illFormed.classification !== 'ill-formed-unicode' || illFormed.exact) {
        throw new VerbatimQualificationError('COMPARATOR_ILL_FORMED_FAILED')
    }
    return observations
}

function verifyManifest() {
    if (sha256(Buffer.from(MANIFEST_CANONICAL, 'utf8')) !== MANIFEST_SHA256) {
        throw new VerbatimQualificationError('MANIFEST_HASH_MISMATCH')
    }
    const ids = new Set()
    const tags = new Set()
    const paidIds = new Set()
    const decoded = new Map()
    for (const fixture of FIXTURES) {
        if (ids.has(fixture.id)) throw new VerbatimQualificationError('FIXTURE_ID_DUPLICATE', fixture.id)
        ids.add(fixture.id)
        fixture.tags.forEach((tag) => tags.add(tag))
        if (fixture.paid) paidIds.add(fixture.id)
        const payload = decodeFixturePayload(fixture)
        decoded.set(fixture.id, payload)
        if (payload.bytes.byteLength !== fixture.byteLength
            || Array.from(payload.text).length !== fixture.scalarCount
            || payload.text.length !== fixture.utf16Length
            || sha256(payload.bytes) !== fixture.payloadSha256) {
            throw new VerbatimQualificationError('FIXTURE_METADATA_MISMATCH', fixture.id)
        }
        const expectedAllowed = fixture.id === 'over-limit'
            ? payload.bytes.byteLength === PROFILE.maxCopyUtf8Bytes + 1
            : payload.bytes.byteLength <= PROFILE.maxCopyUtf8Bytes
        if (!expectedAllowed) throw new VerbatimQualificationError('FIXTURE_SIZE_INVALID', fixture.id)
    }
    for (const tag of REQUIRED_FEATURE_TAGS) {
        if (!tags.has(tag)) throw new VerbatimQualificationError('FEATURE_COVERAGE_MISSING', tag)
    }
    for (const id of REQUIRED_PAID_FIXTURE_IDS) {
        if (!paidIds.has(id)) throw new VerbatimQualificationError('PAID_FIXTURE_MISSING', id)
    }
    if (paidIds.size !== REQUIRED_PAID_FIXTURE_IDS.length) {
        throw new VerbatimQualificationError('PAID_FIXTURE_UNEXPECTED')
    }
    for (const fixture of FIXTURES) {
        if (!fixture.counterfactualTwin) continue
        const twin = FIXTURES.find((candidate) => candidate.id === fixture.counterfactualTwin)
        if (!twin || twin.counterfactualTwin !== fixture.id) {
            throw new VerbatimQualificationError('COUNTERFACTUAL_LINK_INVALID', fixture.id)
        }
        if (decoded.get(fixture.id).bytes.equals(decoded.get(twin.id).bytes)) {
            throw new VerbatimQualificationError('COUNTERFACTUAL_BYTES_EQUAL', fixture.id)
        }
    }
    return {
        manifestSha256: MANIFEST_SHA256,
        fixtureCount: FIXTURES.length,
        paidFixtureCount: paidIds.size,
        coveredFeatureTags: [...tags].sort(),
    }
}

function createCopyInstruction(sourceIndex) {
    return [
        COPY_INSTRUCTION_PREFIX,
        'Return only the decoded content string of sourceIndex ' + sourceIndex + '.',
        'Copy every Unicode scalar and whitespace character exactly.',
        'Do not trim, normalize, escape, quote, summarize, explain, or add a code fence.',
        'The first response byte must be the first UTF-8 byte of that content.',
        'The last response byte must be the last UTF-8 byte of that content.',
    ].join('\n')
}

function fillerMessage(index) {
    return {
        role: index === 0 ? 'system' : index % 2 === 0 ? 'user' : 'assistant',
        content: 'L' + String(index).padStart(6, '0') + '|FILL',
    }
}

function buildMessages(fixture, targetSourceIndex) {
    let messageCount
    let instructionIndex
    if (fixture.placement === 'column' || fixture.placement === 'page') {
        messageCount = 1_428
        instructionIndex = messageCount - 1
    } else if (fixture.placement.startsWith('position-')) {
        messageCount = 10_200
        instructionIndex = messageCount - 1
    } else {
        messageCount = 8
        instructionIndex = messageCount - 1
    }
    if (!Number.isSafeInteger(targetSourceIndex)
        || targetSourceIndex < 1
        || targetSourceIndex >= instructionIndex) {
        throw new VerbatimQualificationError('TARGET_INDEX_INVALID', fixture.id)
    }
    const messages = Array.from({ length: messageCount }, (_, index) => fillerMessage(index))
    messages[targetSourceIndex] = {
        role: 'user',
        content: decodeFixturePayload(fixture).text,
    }
    messages[instructionIndex] = {
        role: 'user',
        content: createCopyInstruction(targetSourceIndex),
    }
    return { messages, targetSourceIndex, instructionIndex }
}

function initialTargetIndex(fixture) {
    switch (fixture.placement) {
        case 'column': return 330
        case 'page': return 1_390
        case 'position-start': return 5
        case 'position-middle': return 4_998
        case 'position-end': return 10_190
        default: return 1
    }
}

function loadTargetModules(targetRoot) {
    if (typeof targetRoot !== 'string' || !path.isAbsolute(targetRoot)) {
        throw new VerbatimQualificationError('TARGET_ROOT_REQUIRED')
    }
    const hashes = {}
    for (const relative of TARGET_MODULES) {
        const absolute = path.join(targetRoot, relative)
        let bytes
        try {
            bytes = fs.readFileSync(absolute)
        } catch (error) {
            throw new VerbatimQualificationError('TARGET_MODULE_MISSING', relative, { cause: error })
        }
        hashes[relative] = sha256(bytes)
    }
    const font = require(path.join(targetRoot, 'server/node/pageFoldFontCache.cjs'))
    const reader = require(path.join(targetRoot, 'server/node/pageFoldPdfReader.cjs'))
    const service = require(path.join(targetRoot, 'server/node/pageFoldPdfService.cjs'))
    const structural = require(path.join(targetRoot, 'server/node/pageFoldStructuralRequalification.cjs'))
    return { font, hashes, reader, service, structural }
}

function targetSpanReferences(extracted, canonicalText, targetSourceIndex) {
    const lines = canonicalText.slice(0, -1).split('\n')
    const targetLineIndex = targetSourceIndex + 1
    if (!lines[targetLineIndex]) throw new VerbatimQualificationError('TARGET_RECORD_MISSING')
    let recordStart = 0
    for (let index = 0; index < targetLineIndex; index++) recordStart += lines[index].length + 1
    const recordEnd = recordStart + lines[targetLineIndex].length + 1
    const refs = []
    let offset = 0
    let globalSpan = 0
    for (const page of extracted.pages) {
        for (let spanIndex = 0; spanIndex < page.spans.length; spanIndex++) {
            const span = page.spans[spanIndex]
            const spanStart = offset
            const spanEnd = offset + span.actualText.length
            if (spanStart < recordEnd && spanEnd > recordStart) {
                refs.push({
                    pageNumber: page.pageNumber,
                    spanIndex,
                    globalSpan,
                    column: Math.floor(spanIndex / LINES_PER_COLUMN),
                    line: spanIndex % LINES_PER_COLUMN,
                    startOffset: spanStart,
                    endOffset: spanEnd,
                })
            }
            offset = spanEnd
            globalSpan++
        }
    }
    if (offset !== canonicalText.length || refs.length === 0) {
        throw new VerbatimQualificationError('TARGET_SPAN_MAPPING_FAILED')
    }
    return refs
}

function placementResult(fixture, rendered, refs) {
    const pages = [...new Set(refs.map((ref) => ref.pageNumber))]
    const columns = [...new Set(refs.map((ref) => ref.pageNumber + ':' + ref.column))]
    let pass = false
    switch (fixture.placement) {
        case 'one-page':
            pass = rendered.pageCount === 1
            break
        case 'wrap':
            pass = rendered.pageCount === 1 && refs.length >= 2 && pages.length === 1
            break
        case 'column':
            pass = rendered.pageCount === 2 && pages.length === 1 && columns.length >= 2
            break
        case 'page':
            pass = rendered.pageCount === 2 && pages.length >= 2
            break
        case 'position-start':
            pass = rendered.pageCount === 8 && refs[0].pageNumber === 1
            break
        case 'position-middle':
            pass = rendered.pageCount === 8 && (refs[0].pageNumber === 4 || refs[0].pageNumber === 5)
            break
        case 'position-end':
            pass = rendered.pageCount === 8 && refs[0].pageNumber === 8
            break
        default:
            throw new VerbatimQualificationError('PLACEMENT_UNKNOWN', fixture.placement)
    }
    return {
        pass,
        pageCount: rendered.pageCount,
        targetPages: pages,
        targetColumns: columns,
        targetSpanCount: refs.length,
        firstTargetSpan: refs[0],
        lastTargetSpan: refs[refs.length - 1],
    }
}

function adjustedTargetIndex(fixture, currentIndex, placement) {
    const first = placement.firstTargetSpan
    let desiredGlobalSpan
    if (fixture.placement === 'column') {
        desiredGlobalSpan = LINES_PER_COLUMN - 1
    } else if (fixture.placement === 'page') {
        desiredGlobalSpan = LINES_PER_PAGE - 1
    } else {
        return currentIndex
    }
    const delta = desiredGlobalSpan - first.globalSpan
    return Math.max(1, Math.min(1_425, currentIndex + delta))
}

async function renderOneFixture({ fixture, renderer, reader, structural, targetIndex, onProgress }) {
    const built = buildMessages(fixture, targetIndex)
    const canonicalText = structural.encodeTranscript(built.messages, PROFILE.pageFoldMode)
    const canonicalBytes = Buffer.from(canonicalText, 'utf8')
    const validated = renderer.validateCanonicalBytes(canonicalBytes)
    if (!validated.bytes.equals(canonicalBytes)) {
        throw new VerbatimQualificationError('CANONICAL_VALIDATION_MISMATCH', fixture.id)
    }
    const rendered = await renderer.service.render({
        version: 1,
        routeProfileId: 'vertex-gemini-3.7-flash-low-v8',
        serializerVersion: PROFILE.serializerVersion,
        layoutVersion: PROFILE.layoutVersion,
        fontVersion: renderer.fontVersion,
        canonicalBytes,
    })
    const extracted = await reader.extractPageFoldActualText(rendered.pdf)
    if (extracted.text !== canonicalText) {
        throw new VerbatimQualificationError('PDF_EXTRACTION_MISMATCH', fixture.id)
    }
    const refs = targetSpanReferences(extracted, canonicalText, targetIndex)
    const placement = placementResult(fixture, rendered, refs)
    onProgress?.(
        'fixture=' + fixture.id
        + ' target=' + targetIndex
        + ' pages=' + rendered.pageCount
        + ' spans=' + rendered.spanCount
        + ' targetPages=' + placement.targetPages.join(',')
        + ' targetSpans=' + placement.targetSpanCount
    )
    return {
        fixture,
        built,
        canonicalText,
        canonicalBytes,
        rendered,
        extracted,
        placement,
        targetIndex,
    }
}

async function materializeFixture(options) {
    let targetIndex = initialTargetIndex(options.fixture)
    let last
    for (let attempt = 1; attempt <= 6; attempt++) {
        last = await renderOneFixture({ ...options, targetIndex })
        if (last.placement.pass) return last
        const adjusted = adjustedTargetIndex(options.fixture, targetIndex, last.placement)
        if (adjusted === targetIndex) break
        targetIndex = adjusted
    }
    throw new VerbatimQualificationError(
        'PLACEMENT_NOT_ACHIEVED',
        options.fixture.id + ':' + JSON.stringify(last?.placement || null),
    )
}

function publicDocument(document) {
    return {
        fixtureId: document.fixture.id,
        targetSourceIndex: document.targetIndex,
        instructionSourceIndex: document.built.instructionIndex,
        payloadBytes: document.fixture.byteLength,
        payloadSha256: document.fixture.payloadSha256,
        canonicalBytes: document.canonicalBytes.byteLength,
        canonicalSha256: sha256(document.canonicalBytes),
        pdfBytes: document.rendered.pdfBytes,
        pdfSha256: document.rendered.sha256,
        pageCount: document.rendered.pageCount,
        spanCount: document.rendered.spanCount,
        extractionExact: document.extracted.text === document.canonicalText,
        placement: document.placement,
    }
}

function outputTokenLimit(fixture) {
    return Math.min(8_192, Math.max(512, fixture.byteLength + 512))
}

function rateCost(promptTokens, outputTokens) {
    return (
        (promptTokens * PROFILE.price.inputUsdPerMillion / 1_000_000)
        + (outputTokens * PROFILE.price.outputUsdPerMillion / 1_000_000)
    )
}

function buildCallPlan(documents) {
    const byId = new Map(documents.map((document) => [document.fixture.id, document]))
    const randomized = REQUIRED_PAID_FIXTURE_IDS
        .map((id) => ({
            id,
            key: sha256(Buffer.from(MANIFEST_SHA256 + ':' + id, 'utf8')),
        }))
        .sort((left, right) => left.key.localeCompare(right.key))
    const calls = [
        {
            sequence: 1,
            stage: 'V2',
            fixtureId: 'minimum',
            carrier: 'direct-literal',
            repeat: 1,
            responseMode: 'nonstream',
            outputTokens: 512,
        },
        {
            sequence: 2,
            stage: 'V2',
            fixtureId: 'minimum',
            carrier: 'canonical-text-sentinel',
            repeat: 1,
            responseMode: 'nonstream',
            outputTokens: 512,
        },
    ]
    for (let repeat = 1; repeat <= PROFILE.repeats; repeat++) {
        for (const item of randomized) {
            const carriers = (parseInt(item.key.slice(0, 2), 16) + repeat) % 2 === 0
                ? ['text', 'pdf']
                : ['pdf', 'text']
            for (const carrier of carriers) {
                calls.push({
                    sequence: calls.length + 1,
                    stage: repeat === 1 ? 'V3' : 'V4',
                    fixtureId: item.id,
                    carrier,
                    repeat,
                    responseMode: PROFILE.providerResponseMode,
                    outputTokens: outputTokenLimit(byId.get(item.id).fixture),
                })
            }
        }
    }
    return {
        schemaVersion: 1,
        profileId: PROFILE.id,
        manifestSha256: MANIFEST_SHA256,
        hardCapUsd: PROFILE.hardCapUsd,
        maximumCalls: calls.length,
        calls,
    }
}

async function runOffline(options = {}) {
    const manifest = verifyManifest()
    const comparatorControls = verifyComparatorControls()
    const target = loadTargetModules(options.targetRoot)
    const cache = target.font.createPageFoldFontCache({
        cacheRoot: options.fontCacheRoot,
        fetchImpl: async () => {
            throw new VerbatimQualificationError('FONT_CACHE_NOT_PREPOPULATED')
        },
    })
    const service = target.service.createPageFoldPdfService({ fontCache: cache })
    const renderer = {
        fontVersion: target.font.PAGEFOLD_FONT_VERSION,
        service,
        validateCanonicalBytes: target.service.validateCanonicalBytes,
    }
    const transportNegatives = []
    for (const fixture of FIXTURES.filter((candidate) => candidate.placement === 'expected-transport-fail')) {
        try {
            await renderOneFixture({
                fixture,
                renderer,
                reader: target.reader,
                structural: target.structural,
                targetIndex: 1,
                onProgress: options.onProgress,
            })
            throw new VerbatimQualificationError('TRANSPORT_NEGATIVE_UNEXPECTED_PASS', fixture.id)
        } catch (error) {
            if (error?.code !== 'PDF_GLYPH_UNSUPPORTED') throw error
            transportNegatives.push({
                fixtureId: fixture.id,
                expectedStatus: 'transport-fail',
                observedCode: error.code,
                payloadBytes: fixture.byteLength,
                payloadSha256: fixture.payloadSha256,
            })
        }
    }
    const paidFixtures = FIXTURES.filter((fixture) => fixture.paid)
    const documents = []
    for (const fixture of paidFixtures) {
        options.onProgress?.('fixture-start=' + fixture.id)
        documents.push(await materializeFixture({
            fixture,
            renderer,
            reader: target.reader,
            structural: target.structural,
            onProgress: options.onProgress,
        }))
    }
    const publicDocuments = documents.map(publicDocument)
    const callPlan = buildCallPlan(documents)
    const localOverLimit = FIXTURES.find((fixture) => fixture.id === 'over-limit')
    if (!localOverLimit || localOverLimit.byteLength <= PROFILE.maxCopyUtf8Bytes) {
        throw new VerbatimQualificationError('OVER_LIMIT_CONTROL_FAILED')
    }
    const placementTags = new Set()
    for (const document of publicDocuments) {
        if (!document.placement.pass) {
            throw new VerbatimQualificationError('PLACEMENT_COVERAGE_FAILED', document.fixtureId)
        }
        const fixture = FIXTURES.find((candidate) => candidate.id === document.fixtureId)
        fixture.tags.forEach((tag) => placementTags.add(tag))
    }
    for (const tag of REQUIRED_FEATURE_TAGS.filter((value) => value.startsWith('B-'))) {
        if (!placementTags.has(tag)) {
            throw new VerbatimQualificationError('BOUNDARY_COVERAGE_MISSING', tag)
        }
    }
    return {
        schemaVersion: 1,
        paidExecutionEnabled: false,
        profile: PROFILE,
        manifest,
        comparatorControls,
        targetModuleHashes: target.hashes,
        documents,
        public: {
            schemaVersion: 1,
            paidExecutionEnabled: false,
            profile: PROFILE,
            manifest,
            comparatorControls,
            targetModuleHashes: target.hashes,
            transportNegatives,
            documents: publicDocuments,
            callPlan,
        },
    }
}

async function main() {
    if (process.env.PAGEFOLD_VERBATIM_OFFLINE !== '1') {
        process.stderr.write('[pagefold-verbatim] offline execution disabled\n')
        process.exitCode = 2
        return
    }
    try {
        const result = await runOffline({
            targetRoot: process.env.PAGEFOLD_TARGET_ROOT,
            fontCacheRoot: process.env.PAGEFOLD_TEST_FONT_CACHE,
            onProgress: (message) => process.stderr.write('[pagefold-verbatim] ' + message + '\n'),
        })
        process.stdout.write(JSON.stringify(result.public, null, 2) + '\n')
    } catch (error) {
        const code = error instanceof VerbatimQualificationError
            ? error.code
            : 'VERBATIM_OFFLINE_UNEXPECTED'
        process.stderr.write('[pagefold-verbatim] failed code=' + code + '\n')
        process.exitCode = 1
    }
}

if (require.main === module) void main()

module.exports = {
    COPY_INSTRUCTION_PREFIX,
    LINES_PER_COLUMN,
    LINES_PER_PAGE,
    VerbatimQualificationError,
    buildCallPlan,
    buildMessages,
    classifyMutation,
    compareUtf8Exact,
    createCopyInstruction,
    decodeFixturePayload,
    initialTargetIndex,
    isWellFormedUnicode,
    loadTargetModules,
    normalizationForm,
    outputTokenLimit,
    rateCost,
    runOffline,
    sha256,
    verifyComparatorControls,
    verifyManifest,
    whitespaceRuns,
}
