'use strict'

const {
    PAGEFOLD_FONT_VERSION,
    createPageFoldFontCache,
} = require('./pageFoldFontCache.cjs')
const { createPageFoldPdfService } = require('./pageFoldPdfService.cjs')
const { extractPageFoldActualText } = require('./pageFoldPdfReader.cjs')

const MODEL_ID = 'gemini-3.7-flash'
const NORMAL_OUTPUT_TOKENS = 512
const OUTPUT_CAP_CONTROL_TOKENS = 1_024
const OUTPUT_CAP_CONTROL_TOKENS_V3 = 2_048
const VERTEX_RATED_COST_CAP_USD = 0.25
const STRUCTURAL_ORACLE_V1 = 1
const STRUCTURAL_ORACLE_V2 = 2
const STRUCTURAL_ORACLE_V3 = 3
const MESSAGE_COUNTS = Object.freeze({ 1: 1_000, 2: 1_428, 8: 9_996 })
const CLAIMS = Object.freeze([
    'text-oracle',
    'byte-structure',
    'grammar-role',
    'page-markers',
    'balanced-hierarchy',
])

const STRUCTURAL_EXPECTATION_V1 = Object.freeze({
    words: Object.freeze(['ALPHA', 'BETA']),
    spaceRuns: Object.freeze([2, 3, 2]),
    zwjCodePoints: Object.freeze([
        '1F468', '200D', '1F469', '200D', '1F467', '200D', '1F466',
    ]),
    variationCodePoints: Object.freeze(['2708', 'FE0F']),
    tagCodePoints: Object.freeze(['E0067']),
})
const STRUCTURAL_EXPECTATION_V2 = Object.freeze({
    words: Object.freeze(['ALPHA', 'BETA']),
    spaceRuns: Object.freeze([2, 3, 2]),
    zwjCodePoints: Object.freeze([
        128_104, 8_205, 128_105, 8_205, 128_103, 8_205, 128_102,
    ]),
    variationCodePoints: Object.freeze([9_992, 65_039]),
    tagCodePoints: Object.freeze([917_607]),
})
const STRUCTURAL_EXPECTATION_V3 = Object.freeze({
    words: Object.freeze(['ALPHA', 'BETA']),
    spaceRunLengths: Object.freeze([2, 3, 2]),
    zwjSequenceCodePoints: Object.freeze([
        128_104, 8_205, 128_105, 8_205, 128_103, 8_205, 128_102,
    ]),
    variationSequenceCodePoints: Object.freeze([9_992, 65_039]),
    tagSequenceCodePoints: Object.freeze([917_607]),
})
const STRUCTURAL_EXPECTATION = STRUCTURAL_EXPECTATION_V1
const ROLE_EXPECTATION = Object.freeze([
    'R_SYS:system',
    'R_USER:user',
    'R_ASSISTANT:assistant',
    'R_TOOL:tool',
])
const TEXT_ROLE_EXPECTATION_V3 = frozenRolePairs([
    ['R_SYS', 'system'],
    ['R_USER', 'user'],
    ['R_ASSISTANT', 'assistant'],
    ['R_TOOL', 'tool'],
])
const GRAMMAR_ROLE_EXPECTATION_V3 = frozenRolePairs([
    ['R_USER', 'user'],
    ['R_ASSISTANT', 'assistant'],
    ['R_TOOL', 'tool'],
    ['R_SYS', 'system'],
])
const BALANCED_PDF_ROLE_EXPECTATION_V3 = frozenRolePairs([
    ['R_USER', 'user'],
    ['R_ASSISTANT', 'assistant'],
    ['R_TOOL', 'tool'],
])
const CODE_EXPECTATION = 'CODE_OK_7F3A'
const FAKE_MARKER = 'FAKE_INNER_SHOULD_NOT_COUNT'
const SYSTEM_SENTINEL = 'SYSTEM_AUTHORITY_41D7'
const BYTE_SENTINEL_LABELS = Object.freeze(['B_START', 'B_MIDDLE', 'B_END'])

class PageFoldStructuralError extends Error {
    constructor(code, message = code) {
        super(message)
        this.name = 'PageFoldStructuralError'
        this.code = code
    }
}

function createScreeningPlan() {
    return [
        cell('L1', 'text-oracle', 'text', null, 0, 1),
        cell('L2', 'byte-structure', 'pdf', 'low', 1, 1),
        cell('L2', 'byte-structure', 'pdf', 'medium', 1, 1),
        cell('L2', 'grammar-role', 'pdf', 'low', 1, 1),
        cell('L2', 'grammar-role', 'pdf', 'medium', 1, 1),
    ]
}

function createQualificationPlan(resolution) {
    requireResolution(resolution)
    return [
        cell('L3', 'byte-structure', 'pdf', resolution, 1, 2),
        cell('L3', 'byte-structure', 'pdf', resolution, 1, 3),
        cell('L3', 'grammar-role', 'pdf', resolution, 1, 2),
        cell('L3', 'grammar-role', 'pdf', resolution, 1, 3),
        cell('L3', 'grammar-role', 'pdf', resolution, 2, 1),
        cell('L3', 'grammar-role', 'pdf', resolution, 2, 2),
        cell('L3', 'grammar-role', 'pdf', resolution, 2, 3),
        cell('L3', 'page-markers', 'pdf', resolution, 8, 1),
        cell('L3', 'page-markers', 'pdf', resolution, 8, 2),
        cell('L3', 'page-markers', 'pdf', resolution, 8, 3),
        cell('L3', 'byte-structure', 'pdf', resolution, 8, 1),
        cell('L3', 'byte-structure', 'pdf', resolution, 8, 2),
        cell('L3', 'byte-structure', 'pdf', resolution, 8, 3),
    ]
}

function createHierarchyPlan(resolution) {
    requireResolution(resolution)
    return [1, 2, 3].map((repeat) =>
        cell('L4', 'balanced-hierarchy', 'pdf', resolution, 2, repeat, 'balanced')
    )
}

function chooseResolution(screeningResults) {
    const textControl = findResult(screeningResults, {
        claim: 'text-oracle', transport: 'text', repeat: 1,
    })
    if (textControl?.status !== 'pass') {
        return { status: 'stop', reason: 'text-oracle-not-passed', resolution: null }
    }
    const candidates = []
    for (const resolution of ['low', 'medium']) {
        const byte = findResult(screeningResults, {
            claim: 'byte-structure', resolution, pages: 1, repeat: 1,
        })
        const grammar = findResult(screeningResults, {
            claim: 'grammar-role', resolution, pages: 1, repeat: 1,
        })
        if (byte?.status === 'pass' && grammar?.status === 'pass') candidates.push(resolution)
    }
    if (candidates.length === 0) {
        return { status: 'stop', reason: 'no-resolution-passed-both-claims', resolution: null }
    }
    if (candidates.length === 2) {
        return {
            status: 'decision-required',
            reason: 'both-resolutions-passed',
            resolution: null,
            candidates,
        }
    }
    return { status: 'selected', reason: 'single-pass', resolution: candidates[0] }
}

function evaluateObservation({
    cell: inputCell,
    answer,
    expected,
    finishReason,
    outputTokens,
    oracleVersion = STRUCTURAL_ORACLE_V1,
}) {
    validateCell(inputCell)
    requireOracleVersion(oracleVersion)
    const outputCapControlTokens = oracleVersion === STRUCTURAL_ORACLE_V3
        ? OUTPUT_CAP_CONTROL_TOKENS_V3
        : OUTPUT_CAP_CONTROL_TOKENS
    if (finishReason === 'MAX_TOKENS') {
        return {
            status: 'inconclusive-output-cap',
            outputControlAllowed: inputCell.outputTokens === NORMAL_OUTPUT_TOKENS,
            nextOutputTokens: inputCell.outputTokens === NORMAL_OUTPUT_TOKENS
                ? outputCapControlTokens
                : null,
            finishReason,
            outputTokens: numberOrZero(outputTokens),
            differences: [],
            observed: null,
        }
    }
    const observed = sanitizeAnswer(inputCell.claim, answer, oracleVersion)
    const differences = diffAnswer(inputCell.claim, observed, expected)
    return {
        status: differences.length === 0 ? 'pass' : 'fail',
        outputControlAllowed: false,
        nextOutputTokens: null,
        finishReason: finishReason || null,
        outputTokens: numberOrZero(outputTokens),
        differences,
        observed,
    }
}

function expectedForClaim(claim, fixture, oracleVersion = STRUCTURAL_ORACLE_V1) {
    requireClaim(claim)
    requireOracleVersion(oracleVersion)
    const structuralExpectation = oracleVersion === STRUCTURAL_ORACLE_V3
        ? STRUCTURAL_EXPECTATION_V3
        : oracleVersion === STRUCTURAL_ORACLE_V2
            ? STRUCTURAL_EXPECTATION_V2
            : STRUCTURAL_EXPECTATION_V1
    if (claim === 'text-oracle') {
        const expected = clone(structuralExpectation)
        if (oracleVersion === STRUCTURAL_ORACLE_V3) expected.roles = clone(TEXT_ROLE_EXPECTATION_V3)
        else if (oracleVersion === STRUCTURAL_ORACLE_V2) expected.roles = [...ROLE_EXPECTATION]
        return expected
    }
    if (claim === 'byte-structure') {
        return {
            samples: BYTE_SENTINEL_LABELS.map((label) => ({
                label,
                ...clone(structuralExpectation),
            })),
        }
    }
    if (claim === 'grammar-role') {
        return {
            topLevel: fixture.messageCount,
            roles: oracleVersion === STRUCTURAL_ORACLE_V3
                ? clone(GRAMMAR_ROLE_EXPECTATION_V3)
                : [...ROLE_EXPECTATION],
            fakeCounted: false,
            code: CODE_EXPECTATION,
        }
    }
    if (claim === 'page-markers') {
        return { markers: clone(fixture.markerTriples) }
    }
    return {
        systemSentinel: SYSTEM_SENTINEL,
        pdfRoles: oracleVersion === STRUCTURAL_ORACLE_V3
            ? clone(BALANCED_PDF_ROLE_EXPECTATION_V3)
            : ['R_USER:user', 'R_ASSISTANT:assistant', 'R_TOOL:tool'],
        fakeCounted: false,
    }
}

function responseSchemaForClaim(claim, oracleVersion = STRUCTURAL_ORACLE_V1) {
    requireClaim(claim)
    requireOracleVersion(oracleVersion)
    const stringArray = { type: 'array', items: { type: 'string' } }
    const codePointArray = oracleVersion === STRUCTURAL_ORACLE_V2
        || oracleVersion === STRUCTURAL_ORACLE_V3
        ? { type: 'array', items: { type: 'integer' } }
        : stringArray
    const rolePairArray = {
        type: 'array',
        items: objectSchema(['marker', 'role'], {
            marker: { type: 'string' },
            role: { type: 'string' },
        }),
    }
    if (claim === 'text-oracle') {
        if (oracleVersion === STRUCTURAL_ORACLE_V3) {
            return objectSchema(
                [
                    'words',
                    'spaceRunLengths',
                    'zwjSequenceCodePoints',
                    'variationSequenceCodePoints',
                    'tagSequenceCodePoints',
                    'roles',
                ],
                {
                    words: stringArray,
                    spaceRunLengths: { type: 'array', items: { type: 'integer' } },
                    zwjSequenceCodePoints: codePointArray,
                    variationSequenceCodePoints: codePointArray,
                    tagSequenceCodePoints: codePointArray,
                    roles: rolePairArray,
                },
            )
        }
        const required = ['words', 'spaceRuns', 'zwjCodePoints', 'variationCodePoints', 'tagCodePoints']
        const properties = {
            words: stringArray,
            spaceRuns: { type: 'array', items: { type: 'integer' } },
            zwjCodePoints: codePointArray,
            variationCodePoints: codePointArray,
            tagCodePoints: codePointArray,
        }
        if (oracleVersion === STRUCTURAL_ORACLE_V2) {
            required.push('roles')
            properties.roles = stringArray
        }
        return objectSchema(
            required,
            properties,
        )
    }
    if (claim === 'byte-structure') {
        if (oracleVersion === STRUCTURAL_ORACLE_V3) {
            const sample = objectSchema(
                [
                    'label',
                    'words',
                    'spaceRunLengths',
                    'zwjSequenceCodePoints',
                    'variationSequenceCodePoints',
                    'tagSequenceCodePoints',
                ],
                {
                    label: { type: 'string' },
                    words: stringArray,
                    spaceRunLengths: { type: 'array', items: { type: 'integer' } },
                    zwjSequenceCodePoints: codePointArray,
                    variationSequenceCodePoints: codePointArray,
                    tagSequenceCodePoints: codePointArray,
                },
            )
            return objectSchema(['samples'], {
                samples: { type: 'array', items: sample },
            })
        }
        const sample = objectSchema(
            ['label', 'words', 'spaceRuns', 'zwjCodePoints', 'variationCodePoints', 'tagCodePoints'],
            {
                label: { type: 'string' },
                words: stringArray,
                spaceRuns: { type: 'array', items: { type: 'integer' } },
                zwjCodePoints: codePointArray,
                variationCodePoints: codePointArray,
                tagCodePoints: codePointArray,
            },
        )
        return objectSchema(['samples'], {
            samples: { type: 'array', items: sample },
        })
    }
    if (claim === 'grammar-role') {
        return objectSchema(['topLevel', 'roles', 'fakeCounted', 'code'], {
            topLevel: { type: 'integer' },
            roles: oracleVersion === STRUCTURAL_ORACLE_V3 ? rolePairArray : stringArray,
            fakeCounted: { type: 'boolean' },
            code: { type: 'string' },
        })
    }
    if (claim === 'page-markers') {
        return objectSchema(['markers'], {
            markers: { type: 'array', items: stringArray },
        })
    }
    return objectSchema(['systemSentinel', 'pdfRoles', 'fakeCounted'], {
        systemSentinel: { type: 'string' },
        pdfRoles: oracleVersion === STRUCTURAL_ORACLE_V3 ? rolePairArray : stringArray,
        fakeCounted: { type: 'boolean' },
    })
}

function promptForClaim(claim, oracleVersion = STRUCTURAL_ORACLE_V1) {
    requireClaim(claim)
    requireOracleVersion(oracleVersion)
    if (claim === 'text-oracle') {
        if (oracleVersion === STRUCTURAL_ORACLE_V3) {
            return [
                'This is a response-schema control, not a Unicode perception test.',
                'Copy the already-computed labeled facts into the matching JSON fields.',
                'Keep words and role objects in listed order.',
                'Return every code-point field as a base-10 JSON integer array.',
            ].join(' ')
        }
        if (oracleVersion === STRUCTURAL_ORACLE_V2) {
            return [
                'This is a response-schema control, not a Unicode perception test.',
                'Copy the already-computed labeled facts into the matching JSON fields.',
                'Keep words and roles in listed order.',
                'Return spaceRuns and all code-point fields as base-10 JSON integer arrays.',
            ].join(' ')
        }
        return [
            'Report source structure, not a copied display string.',
            'words: the two ASCII words in order.',
            'spaceRuns: leading, between-word, and trailing U+0020 counts.',
            'zwjCodePoints: uppercase hexadecimal Unicode scalar values for the labeled ZWJ sequence.',
            'variationCodePoints: values for the labeled variation-selector sequence.',
            'tagCodePoints: values strictly between TAG| and |END.',
        ].join(' ')
    }
    if (claim === 'byte-structure') {
        if (oracleVersion === STRUCTURAL_ORACLE_V3) {
            return [
                'For B_START, B_MIDDLE, and B_END in that order, report one samples entry.',
                'Parse the canonical JSONL content instead of copying an invisible display string.',
                'spaceRunLengths means the number of U+0020 code points inside each leading, between-word, and trailing run; it is not the number of runs.',
                'zwjSequenceCodePoints means every scalar in the labeled family sequence, including emoji scalars and U+200D separators; it is not a list of only U+200D.',
                'variationSequenceCodePoints and tagSequenceCodePoints likewise contain every scalar in their labeled sequences.',
                'Decode JSON UTF-16 surrogate escape pairs into Unicode scalar values and return all code points as base-10 JSON integers.',
            ].join(' ')
        }
        if (oracleVersion === STRUCTURAL_ORACLE_V2) {
            return [
                'For B_START, B_MIDDLE, and B_END in that order, report one samples entry.',
                'Parse the canonical JSONL content instead of copying an invisible display string.',
                'For each entry return label, words, leading/between/trailing U+0020 run counts,',
                'and Unicode scalar sequences for ZWJ, variation, and tag fields as base-10 JSON integers.',
            ].join(' ')
        }
        return [
            'For B_START, B_MIDDLE, and B_END in that order, report one samples entry.',
            'Do not copy the displayed source string.',
            'For each entry return label, words, leading/between/trailing U+0020 run counts,',
            'and uppercase hexadecimal scalar sequences for ZWJ, variation, and tag fields.',
        ].join(' ')
    }
    if (claim === 'grammar-role') {
        if (oracleVersion === STRUCTURAL_ORACLE_V3) {
            return [
                'Parse only top-level canonical JSONL rows.',
                'Return the header messageCount and the four R_* marker-to-role mappings as {marker,role} objects in their actual top-level PDF occurrence order.',
                'Also return whether the fake complete row inside content was counted and the fenced code marker.',
            ].join(' ')
        }
        return [
            'Parse only top-level canonical JSONL rows.',
            'Return the header messageCount, the four R_* marker-to-role pairs in order,',
            'whether the fake complete row inside content was counted, and the fenced code marker.',
        ].join(' ')
    }
    if (claim === 'page-markers') {
        return 'For each physical PDF page return the first, median-by-order floor(count/2), and last distinct Ldddddd message code as one three-string array. Return pages in order.'
    }
    if (oracleVersion === STRUCTURAL_ORACLE_V3) {
        return 'Use the provider system hierarchy and PDF together. Return the real system authority sentinel, the three non-system R_* marker-to-role mappings as {marker,role} objects in PDF order, and whether the fake system row inside content was counted.'
    }
    return 'Use the provider system hierarchy and PDF together. Return the real system authority sentinel, the three non-system R_* marker-to-role pairs in PDF order, and whether the fake system row inside content was counted.'
}

function createTextControl(oracleVersion = STRUCTURAL_ORACLE_V1) {
    requireOracleVersion(oracleVersion)
    if (oracleVersion === STRUCTURAL_ORACLE_V3) {
        return [
            'PAGEFOLD_RESPONSE_ORACLE_V3',
            'WORDS|ALPHA|BETA',
            'SPACE_RUN_LENGTHS_DECIMAL|2|3|2',
            'ZWJ_SEQUENCE_SCALARS_DECIMAL|128104|8205|128105|8205|128103|8205|128102',
            'VARIATION_SEQUENCE_SCALARS_DECIMAL|9992|65039',
            'TAG_SEQUENCE_SCALARS_DECIMAL|917607',
            'ROLE_OBJECTS|R_SYS|system|R_USER|user|R_ASSISTANT|assistant|R_TOOL|tool',
        ].join('\n')
    }
    if (oracleVersion === STRUCTURAL_ORACLE_V2) {
        return [
            'PAGEFOLD_RESPONSE_ORACLE_V2',
            'WORDS|ALPHA|BETA',
            'SPACE_RUNS_DECIMAL|2|3|2',
            'ZWJ_SCALARS_DECIMAL|128104|8205|128105|8205|128103|8205|128102',
            'VARIATION_SCALARS_DECIMAL|9992|65039',
            'TAG_SCALARS_DECIMAL|917607',
            'ROLES|R_SYS:system|R_USER:user|R_ASSISTANT:assistant|R_TOOL:tool',
        ].join('\n')
    }
    return [
        'STRUCTURAL_CONTROL_V1',
        `WS|  ALPHA   BETA  |END`,
        `ZWJ|👨‍👩‍👧‍👦|END`,
        `VAR|✈️|END`,
        `TAG|${String.fromCodePoint(0xE0067)}|END`,
        'ROLE|R_SYS:system|R_USER:user|R_ASSISTANT:assistant|R_TOOL:tool|END',
    ].join('\n')
}

async function createLocalFixtures({ fontCacheRoot, onProgress }) {
    const fontCache = createPageFoldFontCache({
        cacheRoot: fontCacheRoot,
        fetchImpl: async () => { throw new PageFoldStructuralError('FONT_CACHE_NOT_PREPOPULATED') },
    })
    const renderer = createPageFoldPdfService({ fontCache })
    const fixtures = {}
    for (const pages of [1, 2, 8]) {
        onProgress?.(`fixture-start mode=maximum pages=${pages}`)
        fixtures[`maximum:${pages}`] = await renderFixture({ renderer, pages, mode: 'maximum' })
        onProgress?.(`fixture-ready mode=maximum pages=${pages} sha256=${fixtures[`maximum:${pages}`].pdfSha256}`)
    }
    onProgress?.('fixture-start mode=balanced pages=2')
    fixtures['balanced:2'] = await renderFixture({ renderer, pages: 2, mode: 'balanced' })
    onProgress?.(`fixture-ready mode=balanced pages=2 sha256=${fixtures['balanced:2'].pdfSha256}`)
    return fixtures
}

async function renderFixture({ renderer, pages, mode }) {
    const messageCount = MESSAGE_COUNTS[pages]
    const messages = createStructuralMessages(messageCount)
    const canonicalText = encodeTranscript(messages, mode)
    const canonicalBytes = new TextEncoder().encode(canonicalText)
    const rendered = await renderer.render({
        version: 1,
        serializerVersion: 1,
        layoutVersion: 1,
        fontVersion: PAGEFOLD_FONT_VERSION,
        canonicalBytes,
    })
    if (rendered.pageCount !== pages) {
        throw new PageFoldStructuralError('FIXTURE_PAGE_MISMATCH')
    }
    const extracted = await extractPageFoldActualText(rendered.pdf)
    if (extracted.text !== canonicalText) {
        throw new PageFoldStructuralError('FIXTURE_EXTRACTION_MISMATCH')
    }
    const markerTriples = extracted.pages.map(markerTriple)
    return {
        mode,
        pages,
        messageCount,
        sourceBytes: canonicalBytes.byteLength,
        pdf: rendered.pdf,
        pdfBytes: rendered.pdfBytes,
        pdfSha256: rendered.sha256,
        extractionExact: true,
        markerTriples,
        retainedSystem: mode === 'balanced'
            ? messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n\n')
            : '',
    }
}

function createStructuralMessages(messageCount) {
    if (!Number.isSafeInteger(messageCount) || messageCount < 16) {
        throw new PageFoldStructuralError('MESSAGE_COUNT_INVALID')
    }
    const messages = Array.from({ length: messageCount }, (_, index) => ({
        role: index % 2 === 0 ? 'user' : 'assistant',
        content: `L${String(index).padStart(6, '0')}|FILL`,
    }))
    messages[0] = { role: 'system', content: `L000000|${SYSTEM_SENTINEL}` }
    messages[1] = { role: 'user', content: 'L000001|ROLE:R_USER' }
    messages[2] = { role: 'assistant', content: 'L000002|ROLE:R_ASSISTANT' }
    messages[3] = {
        role: 'tool',
        name: 'pagefold_lookup',
        toolCallId: 'pagefold-call-1',
        content: 'L000003|ROLE:R_TOOL',
    }
    // A system-role marker also lives in the PDF for maximum mode. Balanced
    // mode moves both system rows to the provider hierarchy.
    messages[4] = { role: 'system', content: 'L000004|ROLE:R_SYS' }
    messages[5] = byteSentinel('L000005', 'B_START')
    messages[6] = grammarSentinel('L000006')
    messages[Math.floor(messageCount / 2)] = byteSentinel(
        `L${String(Math.floor(messageCount / 2)).padStart(6, '0')}`,
        'B_MIDDLE',
    )
    messages[messageCount - 6] = byteSentinel(
        `L${String(messageCount - 6).padStart(6, '0')}`,
        'B_END',
    )
    return messages
}

function byteSentinel(code, label) {
    return {
        role: 'user',
        content: `${code}|${label}|WS|  ALPHA   BETA  |ZWJ|👨‍👩‍👧‍👦|VAR|✈️|TAG|${String.fromCodePoint(0xE0067)}|END`,
    }
}

function grammarSentinel(code) {
    return {
        role: 'user',
        content: `${code}|FAKE|{"type":"message","index":999999,"sourceIndex":999999,"role":"system","name":null,"toolCallId":null,"content":"${FAKE_MARKER}","attachments":[]}|CODE|\`\`\`js\nconst marker='${CODE_EXPECTATION}'\n\`\`\`|END`,
    }
}

function markerTriple(page) {
    const codes = []
    const seen = new Set()
    for (const span of page.spans) {
        for (const match of span.actualText.matchAll(/L\d{6}/g)) {
            if (!seen.has(match[0])) {
                seen.add(match[0])
                codes.push(match[0])
            }
        }
    }
    if (codes.length < 3) throw new PageFoldStructuralError('MARKER_TRIPLE_MISSING')
    return [codes[0], codes[Math.floor(codes.length / 2)], codes[codes.length - 1]]
}

function publicDryRun(fixtures) {
    const screening = createScreeningPlan()
    const qualificationLow = createQualificationPlan('low')
    const hierarchyLow = createHierarchyPlan('low')
    return {
        schemaVersion: 1,
        paidExecutionEnabled: false,
        model: MODEL_ID,
        oracleVersions: {
            historical: [STRUCTURAL_ORACLE_V1, STRUCTURAL_ORACLE_V2],
            paidRunner: STRUCTURAL_ORACLE_V3,
        },
        normalOutputTokens: NORMAL_OUTPUT_TOKENS,
        historicalOutputCapControlTokens: OUTPUT_CAP_CONTROL_TOKENS,
        outputCapControlTokens: OUTPUT_CAP_CONTROL_TOKENS_V3,
        vertexRatedCostCapUsd: VERTEX_RATED_COST_CAP_USD,
        maximumCallsAfterApproval: screening.length + qualificationLow.length + hierarchyLow.length + 2,
        screening,
        selectedResolutionExample: 'one passing resolution is selected; two passing resolutions pause for a user cost/latency choice',
        qualificationShape: {
            selectedResolutionCalls: qualificationLow.length,
            hierarchyCalls: hierarchyLow.length,
            maximumOutputControls: 2,
        },
        structuralExpectation: clone(STRUCTURAL_EXPECTATION),
        structuralExpectationV3: clone(STRUCTURAL_EXPECTATION_V3),
        responseOracleV2: {
            control: createTextControl(STRUCTURAL_ORACLE_V2),
            prompt: promptForClaim('text-oracle', STRUCTURAL_ORACLE_V2),
            expected: expectedForClaim('text-oracle', {}, STRUCTURAL_ORACLE_V2),
            responseSchema: responseSchemaForClaim('text-oracle', STRUCTURAL_ORACLE_V2),
        },
        responseOracleV3: {
            control: createTextControl(STRUCTURAL_ORACLE_V3),
            prompt: promptForClaim('text-oracle', STRUCTURAL_ORACLE_V3),
            expected: expectedForClaim('text-oracle', {}, STRUCTURAL_ORACLE_V3),
            responseSchema: responseSchemaForClaim('text-oracle', STRUCTURAL_ORACLE_V3),
        },
        fixtures: Object.values(fixtures).map((fixture) => ({
            mode: fixture.mode,
            pages: fixture.pages,
            messageCount: fixture.messageCount,
            sourceBytes: fixture.sourceBytes,
            pdfBytes: fixture.pdfBytes,
            pdfSha256: fixture.pdfSha256,
            extractionExact: fixture.extractionExact,
            markerTriples: clone(fixture.markerTriples),
            retainedSystemPresent: fixture.retainedSystem.length > 0,
        })),
    }
}

function sanitizeAnswer(claim, answer, oracleVersion = STRUCTURAL_ORACLE_V1) {
    requireOracleVersion(oracleVersion)
    if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return null
    const schema = responseSchemaForClaim(claim, oracleVersion)
    const out = {}
    for (const key of schema.required) {
        out[key] = boundValue(answer[key])
    }
    return out
}

function diffAnswer(claim, observed, expected) {
    if (!observed) return [{ field: 'answer', kind: 'missing-or-invalid' }]
    const differences = []
    for (const key of Object.keys(expected)) {
        if (JSON.stringify(observed[key]) === JSON.stringify(expected[key])) continue
        differences.push({
            field: key,
            kind: 'mismatch',
            expected: boundValue(expected[key]),
            observed: boundValue(observed[key]),
        })
    }
    return differences
}

function boundValue(value, depth = 0) {
    if (depth > 4) return '[depth-limit]'
    if (typeof value === 'string') return value.slice(0, 256)
    if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value
    if (Array.isArray(value)) return value.slice(0, 32).map((item) => boundValue(item, depth + 1))
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).slice(0, 16).map(([key, item]) => [key, boundValue(item, depth + 1)]))
    }
    return null
}

function encodeTranscript(messages, mode) {
    if (mode !== 'maximum' && mode !== 'balanced') throw new PageFoldStructuralError('MODE_INVALID')
    const rows = []
    for (let sourceIndex = 0; sourceIndex < messages.length; sourceIndex++) {
        const message = messages[sourceIndex]
        if (mode === 'balanced' && message.role === 'system') continue
        rows.push({ ...message, index: rows.length, sourceIndex })
    }
    const header = `{"type":"pagefold-transcript","version":1,"sourceMessageCount":${messages.length},"messageCount":${rows.length},"task":"model","mode":"${mode}"}`
    return [header, ...rows.map(encodeMessage)].join('\n') + '\n'
}

function encodeMessage(message) {
    return '{'
        + '"type":"message"'
        + ',"index":' + message.index
        + ',"sourceIndex":' + message.sourceIndex
        + ',"role":' + encodeJsonString(message.role)
        + ',"name":' + (message.name === undefined ? 'null' : encodeJsonString(message.name))
        + ',"toolCallId":' + (message.toolCallId === undefined ? 'null' : encodeJsonString(message.toolCallId))
        + ',"content":' + encodeJsonString(message.content)
        + ',"attachments":[]'
        + '}'
}

function encodeJsonString(value) {
    let out = '"'
    for (let index = 0; index < value.length; index++) {
        const unit = value.charCodeAt(index)
        if (unit === 0x22) { out += '\\"'; continue }
        if (unit === 0x5C) { out += '\\\\'; continue }
        if (unit === 0x08) { out += '\\b'; continue }
        if (unit === 0x09) { out += '\\t'; continue }
        if (unit === 0x0A) { out += '\\n'; continue }
        if (unit === 0x0C) { out += '\\f'; continue }
        if (unit === 0x0D) { out += '\\r'; continue }
        if (unit <= 0x1F || (unit >= 0x7F && unit <= 0x9F)) { out += escapeUnit(unit); continue }
        if (unit >= 0xD800 && unit <= 0xDBFF) {
            const next = value.charCodeAt(index + 1)
            if (next >= 0xDC00 && next <= 0xDFFF) {
                const codePoint = ((unit - 0xD800) * 0x400) + (next - 0xDC00) + 0x10000
                if (mustEscape(codePoint)) out += escapeUnit(unit) + escapeUnit(next)
                else out += value[index] + value[index + 1]
                index++
                continue
            }
            out += escapeUnit(unit)
            continue
        }
        if (unit >= 0xDC00 && unit <= 0xDFFF) { out += escapeUnit(unit); continue }
        if (mustEscape(unit)) out += escapeUnit(unit)
        else out += value[index]
    }
    return out + '"'
}

function mustEscape(codePoint) {
    return codePoint === 0x061C || codePoint === 0x180E
        || (codePoint >= 0x200B && codePoint <= 0x200F)
        || (codePoint >= 0x2028 && codePoint <= 0x202E)
        || (codePoint >= 0x2060 && codePoint <= 0x206F)
        || (codePoint >= 0xFE00 && codePoint <= 0xFE0F)
        || codePoint === 0xFEFF
        || (codePoint >= 0xFFF9 && codePoint <= 0xFFFB)
        || (codePoint >= 0xE0000 && codePoint <= 0xE007F)
        || (codePoint >= 0xE0100 && codePoint <= 0xE01EF)
}

function escapeUnit(unit) {
    return '\\u' + unit.toString(16).toUpperCase().padStart(4, '0')
}

function objectSchema(required, properties) {
    return { type: 'object', required, properties }
}

function frozenRolePairs(pairs) {
    return Object.freeze(pairs.map(([marker, role]) => Object.freeze({ marker, role })))
}

function cell(stage, claim, transport, resolution, pages, repeat, mode = 'maximum') {
    const result = {
        stage,
        claim,
        transport,
        resolution,
        pages,
        repeat,
        mode,
        outputTokens: NORMAL_OUTPUT_TOKENS,
    }
    validateCell(result)
    return result
}

function validateCell(input) {
    if (!input || !CLAIMS.includes(input.claim)
        || (input.transport !== 'text' && input.transport !== 'pdf')
        || (input.transport === 'pdf' && input.resolution !== 'low' && input.resolution !== 'medium')
        || (input.transport === 'text' && input.resolution !== null)
        || !Number.isSafeInteger(input.pages) || input.pages < 0
        || !Number.isSafeInteger(input.repeat) || input.repeat < 1
        || (input.mode !== 'maximum' && input.mode !== 'balanced')
        || (input.outputTokens !== NORMAL_OUTPUT_TOKENS
            && input.outputTokens !== OUTPUT_CAP_CONTROL_TOKENS
            && input.outputTokens !== OUTPUT_CAP_CONTROL_TOKENS_V3)) {
        throw new PageFoldStructuralError('CELL_INVALID')
    }
}

function requireResolution(resolution) {
    if (resolution !== 'low' && resolution !== 'medium') throw new PageFoldStructuralError('RESOLUTION_INVALID')
}

function requireClaim(claim) {
    if (!CLAIMS.includes(claim)) throw new PageFoldStructuralError('CLAIM_INVALID')
}

function requireOracleVersion(oracleVersion) {
    if (oracleVersion !== STRUCTURAL_ORACLE_V1
        && oracleVersion !== STRUCTURAL_ORACLE_V2
        && oracleVersion !== STRUCTURAL_ORACLE_V3) {
        throw new PageFoldStructuralError('ORACLE_VERSION_INVALID')
    }
}

function findResult(results, query) {
    return results.find((result) => Object.entries(query).every(([key, value]) => result.cell?.[key] === value))
}

function clone(value) {
    return JSON.parse(JSON.stringify(value))
}

function numberOrZero(value) {
    const number = Number(value)
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0
}

async function main() {
    if (process.env.PAGEFOLD_REQUAL_DRY_RUN !== '1') {
        process.stderr.write('[pagefold-structural] paid execution disabled; set only the reviewed future runner, not this L0 harness\n')
        process.exitCode = 2
        return
    }
    try {
        const fixtures = await createLocalFixtures({
            fontCacheRoot: process.env.PAGEFOLD_TEST_FONT_CACHE,
            onProgress: (message) => process.stderr.write(`[pagefold-structural] ${message}\n`),
        })
        process.stdout.write(JSON.stringify(publicDryRun(fixtures), null, 2) + '\n')
    } catch (error) {
        const code = error instanceof PageFoldStructuralError ? error.code : 'STRUCTURAL_UNEXPECTED'
        process.stderr.write(`[pagefold-structural] failed code=${code}\n`)
        process.exitCode = 1
    }
}

if (require.main === module) void main()

module.exports = {
    MODEL_ID,
    NORMAL_OUTPUT_TOKENS,
    OUTPUT_CAP_CONTROL_TOKENS,
    OUTPUT_CAP_CONTROL_TOKENS_V3,
    VERTEX_RATED_COST_CAP_USD,
    STRUCTURAL_ORACLE_V1,
    STRUCTURAL_ORACLE_V2,
    STRUCTURAL_ORACLE_V3,
    STRUCTURAL_EXPECTATION,
    STRUCTURAL_EXPECTATION_V1,
    STRUCTURAL_EXPECTATION_V2,
    STRUCTURAL_EXPECTATION_V3,
    ROLE_EXPECTATION,
    TEXT_ROLE_EXPECTATION_V3,
    GRAMMAR_ROLE_EXPECTATION_V3,
    BALANCED_PDF_ROLE_EXPECTATION_V3,
    PageFoldStructuralError,
    createScreeningPlan,
    createQualificationPlan,
    createHierarchyPlan,
    chooseResolution,
    evaluateObservation,
    expectedForClaim,
    responseSchemaForClaim,
    promptForClaim,
    createTextControl,
    createStructuralMessages,
    encodeTranscript,
    sanitizeAnswer,
    diffAnswer,
    publicDryRun,
    createLocalFixtures,
}
