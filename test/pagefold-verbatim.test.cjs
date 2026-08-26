'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const {
    FIXTURES,
    MANIFEST_SHA256,
    PROFILE,
    REQUIRED_FEATURE_TAGS,
    REQUIRED_PAID_FIXTURE_IDS,
} = require('../research/pagefold-verbatim/manifest-v1.cjs')
const {
    buildCallPlan,
    buildMessages,
    compareUtf8Exact,
    createCopyInstruction,
    decodeFixturePayload,
    isWellFormedUnicode,
    outputTokenLimit,
    verifyComparatorControls,
    verifyManifest,
} = require('../research/pagefold-verbatim/qualification.cjs')
const {
    buildRequestBody,
    buildResearchCallPlan,
    parseSseResponseText,
    prepareRuntimeCwd,
    runResearchPaid,
    validateMaxCost,
} = require('../research/pagefold-verbatim/paid-runner.cjs')

test('verbatim manifest is frozen, complete, and size-bounded', () => {
    assert.equal(MANIFEST_SHA256, 'b2043f07299fd6227bf01ea0b2c23f32094483d6e3e91da9dd315de3f2d00864')
    const observed = verifyManifest()
    assert.equal(observed.fixtureCount, 14)
    assert.equal(observed.paidFixtureCount, 10)
    assert.deepEqual(observed.coveredFeatureTags, [...REQUIRED_FEATURE_TAGS].sort())

    const paid = FIXTURES.filter((fixture) => fixture.paid)
    assert.deepEqual(paid.map((fixture) => fixture.id).sort(), [...REQUIRED_PAID_FIXTURE_IDS].sort())
    assert.ok(paid.every((fixture) => fixture.byteLength <= PROFILE.maxCopyUtf8Bytes))
    assert.equal(FIXTURES.find((fixture) => fixture.id === 'over-limit').byteLength, 4_097)
    assert.equal(FIXTURES.find((fixture) => fixture.id === 'limit').byteLength, 4_096)
})

test('fixture bytes decode through strict canonical UTF-8', () => {
    for (const fixture of FIXTURES) {
        const decoded = decodeFixturePayload(fixture)
        assert.equal(decoded.bytes.byteLength, fixture.byteLength)
        assert.equal(decoded.bytes.toString('base64'), fixture.payloadUtf8Base64)
        assert.equal(isWellFormedUnicode(decoded.text), true)
    }
})

test('counterfactual atomic twins remain byte-distinct', () => {
    const left = FIXTURES.find((fixture) => fixture.id === 'atomic-a')
    const right = FIXTURES.find((fixture) => fixture.id === 'atomic-b')
    const leftText = decodeFixturePayload(left).text
    const rightText = decodeFixturePayload(right).text
    const comparison = compareUtf8Exact(leftText, rightText)
    assert.equal(comparison.exact, false)
    assert.notEqual(comparison.firstByteOffset, -1)
})

test('UTF-8 comparator rejects every controlled mutation without normalization', () => {
    const observations = verifyComparatorControls()
    assert.deepEqual(
        observations.map((observation) => observation.classification),
        ['exact', 'edge-trim', 'line-ending', 'normalization', 'fence/prefix', 'truncation', 'escape-change', 'other'],
    )
    assert.equal(compareUtf8Exact('  exact  ', '  exact  ').exact, true)
    assert.equal(compareUtf8Exact('  exact  ', 'exact').classification, 'edge-trim')
    assert.equal(compareUtf8Exact('A', '\uD800').classification, 'ill-formed-unicode')
})

test('copy instruction names the exact target and forbids normalization', () => {
    const instruction = createCopyInstruction(41)
    assert.match(instruction, /sourceIndex 41/)
    assert.match(instruction, /Do not trim, normalize, escape/)
    assert.match(instruction, /first UTF-8 byte/)
    assert.match(instruction, /last UTF-8 byte/)
})

test('maximum-mode messages keep target and copy instruction distinct', () => {
    for (const fixture of FIXTURES.filter((candidate) => candidate.paid)) {
        const target = fixture.placement === 'column' ? 330
            : fixture.placement === 'page' ? 1_390
            : fixture.placement === 'position-start' ? 5
            : fixture.placement === 'position-middle' ? 4_998
            : fixture.placement === 'position-end' ? 10_190
            : 1
        const built = buildMessages(fixture, target)
        assert.notEqual(built.targetSourceIndex, built.instructionIndex)
        assert.equal(built.messages[target].content, decodeFixturePayload(fixture).text)
        assert.match(built.messages[built.instructionIndex].content, new RegExp('sourceIndex ' + target))
    }
})

test('paid call plan is paired, repeated, deterministic, and hard-capped', () => {
    const documents = FIXTURES
        .filter((fixture) => fixture.paid)
        .map((fixture) => ({ fixture }))
    const plan = buildCallPlan(documents)
    assert.equal(plan.hardCapUsd, 1)
    assert.equal(plan.maximumCalls, 62)
    assert.equal(plan.calls[0].carrier, 'direct-literal')
    assert.equal(plan.calls[1].carrier, 'canonical-text-sentinel')

    const paidCells = plan.calls.slice(2)
    for (const id of REQUIRED_PAID_FIXTURE_IDS) {
        const cells = paidCells.filter((cell) => cell.fixtureId === id)
        assert.equal(cells.length, PROFILE.repeats * 2)
        for (let repeat = 1; repeat <= PROFILE.repeats; repeat++) {
            assert.deepEqual(
                cells.filter((cell) => cell.repeat === repeat).map((cell) => cell.carrier).sort(),
                ['pdf', 'text'],
            )
        }
    }
    assert.ok(plan.calls.every((cell, index) => cell.sequence === index + 1))
    assert.equal(outputTokenLimit(FIXTURES.find((fixture) => fixture.id === 'limit')), 4_608)
})

function fakeOffline() {
    const documents = ['minimum', 'atomic-a'].map((id) => {
        const fixture = FIXTURES.find((candidate) => candidate.id === id)
        return {
            fixture,
            canonicalText: '{"fixture":"' + id + '"}\n',
            canonicalBytes: Buffer.from('{"fixture":"' + id + '"}\n'),
            rendered: {
                pdf: Buffer.from('pdf:' + id),
                sha256: 'a'.repeat(64),
                pageCount: 1,
            },
        }
    })
    return {
        profile: PROFILE,
        manifest: { manifestSha256: MANIFEST_SHA256 },
        documents,
        public: { transportNegatives: [{ fixtureId: 'nnbsp-transport' }] },
    }
}

test('bounded v2 research plan keeps prior plus seven new calls at eight total', () => {
    const calls = buildResearchCallPlan()
    assert.equal(calls.length, 7)
    assert.deepEqual(calls.map((call) => call.sequence), [2, 3, 4, 5, 6, 7, 8])
    assert.deepEqual(calls.slice(1).map((call) => call.carrier), ['text', 'pdf', 'pdf', 'text', 'text', 'pdf'])
    assert.throws(() => validateMaxCost(1.01), /COST_CAP_INVALID/)
    assert.equal(validateMaxCost(1), 1)
    assert.throws(() => prepareRuntimeCwd('relative-path'), /RUNTIME_CWD_REQUIRED/)
})

test('request bodies preserve plain response mode and production PageFold wire shape', () => {
    const offline = fakeOffline()
    const calls = buildResearchCallPlan()
    const direct = buildRequestBody(calls[0], offline.documents[0])
    assert.equal(direct.generationConfig.responseMimeType, undefined)
    assert.equal(direct.generationConfig.thinkingConfig.includeThoughts, false)
    assert.equal(direct.contents[0].parts.length, 1)
    assert.match(direct.contents[0].parts[0].text, /PAGEFOLD_VERBATIM_SOURCE_START/)
    assert.match(direct.contents[0].parts[0].text, /PAGEFOLD_VERBATIM_SOURCE_END/)

    const pdfCall = calls.find((call) => call.carrier === 'pdf')
    const pdf = buildRequestBody(pdfCall, offline.documents[1])
    assert.equal(pdf.contents[0].parts[0].inlineData.mimeType, 'application/pdf')
    assert.equal(pdf.contents[0].parts[0].mediaResolution.level, 'MEDIA_RESOLUTION_LOW')
    assert.equal(pdf.generationConfig.responseSchema, undefined)
})

test('SSE parser joins visible parts without thought text or normalization', () => {
    const extractUsage = (raw) => raw.usageMetadata || {
        promptTokens: 0,
        outputTokens: 0,
        candidateTokens: 0,
        thoughtTokens: 0,
        totalTokens: 0,
    }
    const sse = [
        'data: {"candidates":[{"content":{"parts":[{"text":"  A"},{"text":"hidden","thought":true}]}}]}',
        '',
        'data: {"candidates":[{"content":{"parts":[{"text":"  "}]},"finishReason":"STOP"}]}',
        '',
    ].join('\n')
    const parsed = parseSseResponseText(sse, extractUsage)
    assert.equal(parsed.answer, '  A  ')
    assert.equal(parsed.finishReason, 'STOP')
})

function fakePriorEvidence() {
    return {
        experiment: 'pagefold-verbatim-research-v1',
        manifestSha256: MANIFEST_SHA256,
        completedCalls: 1,
        ratedCostUsd: 0.000144,
        records: [{
            call: { sequence: 1, carrier: 'direct-literal' },
            status: 'copy-fail',
            answerSha256: '42ecf5c81f74fefd49438229ec9acdd3183d4ed927eb4ef459e6e92243f18300',
            comparison: { classification: 'fence/prefix' },
        }],
    }
}

test('paid v2 research runner checkpoints every passing fake call and enforces cumulative cap', async () => {
    const offline = fakeOffline()
    const checkpoints = []
    const providerModule = {
        extractUsage: (raw) => raw,
        exchangeServiceAccount: async () => ({ accessToken: 'fixture-token', refreshAt: Date.now() + 60_000 }),
    }
    const summary = await runResearchPaid({
        executionApproved: true,
        researchContinuationApproved: true,
        maxCostUsd: 1,
        offline,
        credentials: {
            vertexProjectId: 'fixture-project',
            vertexServiceAccount: { type: 'service_account' },
            secrets: ['fixture-project', 'fixture-secret'],
        },
        providerModule,
        priorEvidence: fakePriorEvidence(),
        onCheckpoint: async (record) => { checkpoints.push(record) },
        executeCall: async ({ call }) => ({
            httpStatus: 200,
            latencyMs: 1,
            finishReason: 'STOP',
            usage: {
                promptTokens: 10,
                outputTokens: 10,
                candidateTokens: 10,
                thoughtTokens: 0,
                totalTokens: 20,
            },
            answer: decodeFixturePayload(FIXTURES.find((fixture) => fixture.id === call.fixtureId)).text,
            errorCode: null,
        }),
    })
    assert.equal(summary.completedCalls, 8)
    assert.equal(summary.newCompletedCalls, 7)
    assert.equal(summary.providerResearchPassed, true)
    assert.equal(summary.supportQualified, false)
    assert.equal(checkpoints.length, 14)
    assert.equal(JSON.stringify(summary).includes('fixture-secret'), false)

    const capped = await runResearchPaid({
        executionApproved: true,
        researchContinuationApproved: true,
        maxCostUsd: 0.000001,
        offline,
        credentials: {
            vertexProjectId: 'fixture-project',
            vertexServiceAccount: { type: 'service_account' },
            secrets: [],
        },
        providerModule,
        priorEvidence: fakePriorEvidence(),
        onCheckpoint: async () => {},
        executeCall: async () => { throw new Error('must not run') },
    })
    assert.equal(capped.completedCalls, 1)
    assert.equal(capped.newCompletedCalls, 0)
    assert.equal(capped.stopReason, 'cost-cap-before-call')
})

test('failed start checkpoint prevents a fake provider call', async () => {
    let calls = 0
    await assert.rejects(runResearchPaid({
        executionApproved: true,
        researchContinuationApproved: true,
        maxCostUsd: 1,
        offline: fakeOffline(),
        credentials: {
            vertexProjectId: 'fixture-project',
            vertexServiceAccount: { type: 'service_account' },
            secrets: [],
        },
        providerModule: {
            extractUsage: (raw) => raw,
            exchangeServiceAccount: async () => ({ accessToken: 'fixture-token', refreshAt: Date.now() + 60_000 }),
        },
        priorEvidence: fakePriorEvidence(),
        onCheckpoint: async () => { throw new Error('checkpoint-failed') },
        executeCall: async () => { calls++; throw new Error('must not run') },
    }), /checkpoint-failed/)
    assert.equal(calls, 0)
})
