'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const {
    HARD_CAP_USD,
    PROTOCOL_ID,
    SCHEMA_VERSION,
    assertAllowedRequestDiff,
    buildActivationDraft,
    buildCoreConditionMatrix,
    buildCostLedger,
    buildPairedSchedule,
    canonicalJson,
    createBlindMap,
    formatUsdUnits,
    parseUsdUnits,
    sha256Bytes,
    sourceSnapshotIdentity,
    validateCaseManifest,
    validateObligationDossier,
    verifyCompleteBlocks,
} = require('../research/pagefold-quality-cost/protocol-v1.cjs')
const {
    openJsonlCheckpoint,
    preparePrivateRunRoot,
    verifyPrivateBundleModes,
    writeJsonExclusive,
} = require('../research/pagefold-quality-cost/artifact-store.cjs')
const {
    CAPTURE_MODE,
    buildSourceRecords,
    buildSourceSnapshot,
    instrumentOrchestratorSource,
    installCaptureNetworkDeny,
    journalStorageKey,
    loadTargetUtilsWithoutLogging,
    sanitizeCapturedPayload,
    sanitizePresetValue,
    validateQuiescenceProof,
} = require('../research/pagefold-quality-cost/source-capture.cjs')
const {
    buildOfflineActivationManifest,
    buildSanitizedPhase0Receipt,
} = require('../research/pagefold-quality-cost/activation.cjs')
const {
    citationForSubstring,
    closeDossierForActivation,
    createDossierTemplate,
} = require('../research/pagefold-quality-cost/dossier.cjs')
const {
    EXPECTED_MANIFEST_SHA256,
    FIXTURES,
    MANIFEST_SHA256,
    REQUIRED_COVERAGE_TAGS,
    verifySyntheticManifest,
} = require('../research/pagefold-quality-cost/fixtures-v1.cjs')
const {
    combineQuiescence,
    inspectJobsDatabase,
    inspectKvQuiescence,
} = require('../research/pagefold-quality-cost/quiescence.cjs')
const {
    assertSameSourcePartitionCoverage,
    buildCoreFactorPairs,
    buildPartitionReceipt,
    deriveResolutionVariant,
    locateProductionResolution,
    partitionConditionMessages,
    validateCapturedMessageParity,
} = require('../research/pagefold-quality-cost/request-matrix.cjs')
const {
    assertSecretsAbsentFromResponse,
    createFakeSimulationTransport,
    runFrozenSchedule,
} = require('../research/pagefold-quality-cost/runner.cjs')
const {
    createRunnerArtifactSink,
    inspectRunnerCheckpointState,
} = require('../research/pagefold-quality-cost/runner-artifacts.cjs')
const {
    captureConfig,
    contentFreeSelection,
    resolveNamedCase,
} = require('../research/pagefold-quality-cost/case-selection.cjs')

const tempRoots = []
test.afterEach(() => {
    for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

test('core Phase C matrix contains direct plus the complete 3x2x2 PDF cells', () => {
    const conditions = buildCoreConditionMatrix()
    assert.equal(conditions.length, 13)
    assert.equal(conditions.filter((condition) => condition.carrier === 'direct-text').length, 1)
    assert.equal(conditions.filter((condition) => condition.carrier === 'pdf').length, 12)
    for (const resolution of ['low', 'medium', 'high']) {
        const cells = conditions.filter((condition) => condition.mediaResolution === resolution)
        assert.equal(cells.length, 4)
        assert.deepEqual(new Set(cells.map((condition) => condition.systemPlacement)), new Set(['pdf', 'native']))
        assert.deepEqual(new Set(cells.map((condition) => condition.currentUserPlacement)), new Set(['pdf', 'native']))
    }
})

test('private case resolver uses exact character identity and the active chat by default', () => {
    const database = {
        characters: [
            {
                chaId: 'char-a',
                name: '캐릭터 A',
                chatPage: 1,
                chats: [
                    { id: 'chat-a1', name: '첫 채팅', message: [{ chatId: 'm-0' }] },
                    { id: 'chat-a2', name: '현재 채팅', message: [{ chatId: 'm-1' }] },
                ],
            },
            {
                chaId: 'char-b',
                name: '캐릭터 B',
                chatPage: 0,
                chats: [{ id: 'chat-b1', name: '잠금 채팅', _stub: true }],
            },
        ],
    }
    const active = resolveNamedCase(database, { characterName: '캐릭터 A' })
    assert.deepEqual(active, {
        characterId: 'char-a',
        chatId: 'chat-a2',
        characterName: '캐릭터 A',
        chatName: '현재 채팅',
        characterIndex: 0,
        chatIndex: 1,
        chatCount: 2,
        messageCount: 1,
        hydrated: true,
        selectionPolicy: 'active-chat-page',
    })
    const named = resolveNamedCase(database, { characterName: '캐릭터 A', chatName: '첫 채팅' })
    assert.equal(named.chatId, 'chat-a1')
    assert.equal(named.selectionPolicy, 'exact-chat-name')
    const stub = resolveNamedCase(database, { characterName: '캐릭터 B' })
    assert.equal(stub.hydrated, false)
    assert.equal(stub.messageCount, null)

    database.characters[0].chats[0].message = []
    assert.throws(
        () => resolveNamedCase(database, { characterName: '캐릭터 A', chatName: '첫 채팅' }),
        /CASE_SELECTION_CHAT_EMPTY/,
    )

    database.characters.push({ ...database.characters[0], chaId: 'char-a-duplicate' })
    assert.throws(() => resolveNamedCase(database, { characterName: '캐릭터 A' }), /CASE_SELECTION_CHARACTER_NOT_UNIQUE/)
})

test('capture config keeps names out while content-free selection hides coordinates', () => {
    const selection = {
        characterId: 'char-private',
        chatId: 'chat-private',
        characterName: '비공개 캐릭터',
        chatName: '비공개 채팅',
        characterIndex: 2,
        chatIndex: 3,
        chatCount: 4,
        messageCount: 5,
        hydrated: true,
        selectionPolicy: 'active-chat-page',
    }
    const config = captureConfig({
        repositoryRoot: '/workspace/repository',
        targetRoot: '/target',
        databasePath: '/target/save/main.db',
        modelJobsPath: '/target/save/jobs.db',
        privateRoot: '/private/run',
        cohort: 'calibration',
        caseId: 'real-calibration-fixture',
        selection,
    })
    assert.equal(config.characterId, 'char-private')
    assert.equal(config.runRoot, '/private/run/calibration')
    assert.equal(JSON.stringify(config).includes('비공개'), false)
    const summary = contentFreeSelection('calibration', selection)
    assert.equal(JSON.stringify(summary).includes('char-private'), false)
    assert.equal(JSON.stringify(summary).includes('비공개'), false)
    assert.equal(summary.selectedChatIndex, 3)
})

test('canonical identities reject excessive structural depth and non-sequential effective indexes', () => {
    let nested = 'leaf'
    for (let index = 0; index < 258; index++) nested = { child: nested }
    assert.throws(() => canonicalJson(nested), /CANONICAL_DEPTH_LIMIT/)

    const { snapshot } = dossierFixture()
    snapshot.effectiveMessages[0].sourceIndex = 1
    assert.throws(() => sourceSnapshotIdentity(snapshot), /EFFECTIVE_SOURCE_INDEX_SEQUENCE_INVALID/)
})

test('blind map and paired schedule are deterministic and complete without condition labels', () => {
    const conditions = buildCoreConditionMatrix()
    const secret = Buffer.alloc(32, 7)
    const blind = createBlindMap(conditions, secret)
    assert.deepEqual(blind, createBlindMap(conditions, secret))
    assert.notDeepEqual(blind, createBlindMap(conditions, Buffer.alloc(32, 8)))
    assert.equal(new Set(blind.map((record) => record.opaqueId)).size, conditions.length)

    const schedule = buildPairedSchedule({
        scheduleId: 'phase-c-controlled-retrieval',
        phase: 'phase-c',
        taskClass: 'controlled-retrieval',
        cases: [{ opaqueId: 'case-calibration-1' }, { opaqueId: 'case-locked-1' }],
        blindMap: blind,
        repeatBlocks: 2,
        orderSeed: Buffer.alloc(32, 11),
    })
    assert.equal(schedule.length, 2 * 2 * 13)
    assert.deepEqual(verifyCompleteBlocks(schedule, blind.map((record) => record.opaqueId)), {
        blockCount: 4,
        callsPerBlock: 13,
    })
    const serialized = JSON.stringify(schedule)
    assert.equal(serialized.includes('medium'), false)
    assert.equal(serialized.includes('systemPlacement'), false)
})

test('case manifest separates calibration and locked source identities', () => {
    const manifest = {
        schemaVersion: SCHEMA_VERSION,
        protocolId: PROTOCOL_ID,
        cases: [
            { id: 'cal-1', opaqueId: 'opaque-cal-1', cohort: 'calibration', kind: 'real', sourceSnapshotSha256: 'a'.repeat(64) },
            { id: 'lock-1', opaqueId: 'opaque-lock-1', cohort: 'locked', kind: 'real', sourceSnapshotSha256: 'b'.repeat(64) },
        ],
    }
    assert.deepEqual(validateCaseManifest(manifest).cohortCounts, { calibration: 1, locked: 1 })
    manifest.cases[1].sourceSnapshotSha256 = 'a'.repeat(64)
    assert.throws(() => validateCaseManifest(manifest), /CALIBRATION_LOCKED_SOURCE_REUSE/)
})

function dossierFixture() {
    const content = 'A 약속은 유지된다. B'
    const snapshot = {
        schemaVersion: SCHEMA_VERSION,
        protocolId: PROTOCOL_ID,
        caseId: 'case-1',
        sources: [{ id: 'source-1', kind: 'raw-chat-message', content }],
        effectiveMessages: [{ sourceIndex: 0, role: 'user', content }],
    }
    const selected = Buffer.from('약속은 유지된다.', 'utf8')
    const startByte = Buffer.from('A ', 'utf8').byteLength
    const citation = {
        sourceId: 'source-1',
        startByte,
        endByte: startByte + selected.byteLength,
        sha256: sha256Bytes(selected),
    }
    const obligation = (id, authorityClass, verificationState, reviewerDecision) => ({
        id,
        authorityClass,
        verificationState,
        reviewerDecision,
        obligationType: 'fact',
        evaluationMode: 'direct-retrieval',
        subject: 'promise',
        object: 'retention',
        polarity: 'positive',
        sourceRole: 'user',
        speakerEntity: 'source-user',
        requiredObligationIds: [],
        acceptableUses: ['Use the cited promise when answering the frozen probe.'],
        prohibitedContradictions: ['Do not claim that the cited promise was absent.'],
        distance: {
            tokenAuthority: 'fixture-tokenizer-v1',
            sourceTokenDistance: 1,
            messageTurnDistance: 1,
            distanceSinceLastMention: 1,
            sceneTransitions: 0,
            remoteObligationCount: 1,
        },
        citations: [citation],
        lastSourceMention: { sourceId: citation.sourceId, endByte: citation.endByte },
    })
    return {
        snapshot,
        dossier: {
            schemaVersion: SCHEMA_VERSION,
            protocolId: PROTOCOL_ID,
            caseId: 'case-1',
            sourceSnapshotSha256: sourceSnapshotIdentity(snapshot),
            obligations: [
                obligation('fact-1', 'deterministic-source-fact', 'deterministic', 'deterministic'),
                obligation('verified-1', 'verified-source-anchored', 'accepted', 'user-accepted'),
                obligation('interpretive-1', 'interpretive-axis', 'accepted', 'user-accepted-axis'),
                obligation('unverified-1', 'global-unverified', 'unverified', 'unverified'),
            ],
        },
    }
}

test('dossier checks exact UTF-8 spans and excludes interpretive/unverified cards from objective scoring', () => {
    const { snapshot, dossier } = dossierFixture()
    const result = validateObligationDossier(snapshot, dossier)
    assert.equal(result.obligationCount, 4)
    assert.equal(result.objectiveEligible, 2)
    assert.deepEqual(result.coverage, {
        'deterministic-source-fact': 1,
        'verified-source-anchored': 1,
        'interpretive-axis': 1,
        'global-unverified': 1,
    })

    const missingDependency = structuredClone(dossier)
    missingDependency.obligations[0].requiredObligationIds = ['missing-obligation']
    assert.throws(() => validateObligationDossier(snapshot, missingDependency), /OBLIGATION_DEPENDENCY_INVALID/)

    dossier.obligations[0].citations[0].startByte++
    assert.throws(() => validateObligationDossier(snapshot, dossier), /CITATION_UTF8_BOUNDARY_INVALID|CITATION_BYTES_MISMATCH/)
})

test('dossier template is content-free in its inventory and cannot activate before review', () => {
    const { snapshot } = dossierFixture()
    const template = createDossierTemplate(snapshot)
    assert.equal(template.status, 'awaiting-source-anchored-card-review')
    assert.deepEqual(template.obligations, [])
    assert.equal(JSON.stringify(template.sourceInventory).includes('약속'), false)
    assert.throws(() => closeDossierForActivation(snapshot, template), /DOSSIER_NOT_REVIEWED/)

    const citation = citationForSubstring(snapshot.sources[0], '약속은 유지된다.')
    assert.equal(citation.sha256, sha256Bytes(Buffer.from('약속은 유지된다.', 'utf8')))
    assert.throws(() => citationForSubstring({ id: 'dup', content: 'x x' }, 'x'), /DOSSIER_CITATION_SUBSTRING_AMBIGUOUS/)
})

test('synthetic quality manifest is frozen, twin-complete, and source-anchored', () => {
    const observed = verifySyntheticManifest()
    assert.equal(FIXTURES.length, 12)
    assert.equal(observed.twinGroupCount, 6)
    assert.equal(MANIFEST_SHA256, EXPECTED_MANIFEST_SHA256)
    assert.equal(MANIFEST_SHA256, 'bb6591c20b0dd3e332207586e77e0eae18c9e6e6070b9c43c197646155985d35')
    assert.deepEqual(observed.coverageTags, [...REQUIRED_COVERAGE_TAGS].sort())
    assert.ok(FIXTURES.every((fixture) => fixture.placementClasses.includes('page-boundary')))
    assert.ok(FIXTURES.every((fixture) => fixture.obligationDossier.status === 'reviewed-and-frozen'))
})

test('request diff allowlist accepts the resolution path and rejects unrelated generation drift', () => {
    const low = {
        contents: [{ role: 'user', parts: [{ mediaResolution: { level: 'MEDIA_RESOLUTION_LOW' } }, { text: 'continue' }] }],
        generationConfig: { maxOutputTokens: 2048, temperature: 0.8 },
    }
    const medium = structuredClone(low)
    medium.contents[0].parts[0].mediaResolution.level = 'MEDIA_RESOLUTION_MEDIUM'
    const accepted = assertAllowedRequestDiff(low, medium, ['/contents/0/parts/0/mediaResolution/level'])
    assert.deepEqual(accepted.paths, ['/contents/0/parts/0/mediaResolution/level'])

    medium.generationConfig.temperature = 0.2
    assert.throws(
        () => assertAllowedRequestDiff(low, medium, ['/contents/0/parts/0/mediaResolution/level']),
        /REQUEST_DIFF_OUTSIDE_ALLOWLIST/,
    )
})

test('resolution variants change exactly one production-low authority in either Gemini placement shape', () => {
    const partBody = {
        contents: [{ role: 'user', parts: [
            { inlineData: { mimeType: 'application/pdf', data: 'PDF' }, mediaResolution: { level: 'MEDIA_RESOLUTION_LOW' } },
            { text: 'continue' },
        ] }],
        generationConfig: { maxOutputTokens: 2048 },
    }
    assert.deepEqual(locateProductionResolution(partBody), {
        path: '/contents/0/parts/0/mediaResolution',
        shape: 'part-level',
        valuePath: '/contents/0/parts/0/mediaResolution/level',
    })
    const medium = deriveResolutionVariant(partBody, 'medium')
    assert.equal(medium.body.contents[0].parts[0].mediaResolution.level, 'MEDIA_RESOLUTION_MEDIUM')
    assert.deepEqual(medium.diff.paths, ['/contents/0/parts/0/mediaResolution/level'])
    assert.equal(partBody.contents[0].parts[0].mediaResolution.level, 'MEDIA_RESOLUTION_LOW')

    const generationBody = {
        contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'application/pdf', data: 'PDF' } }, { text: 'continue' }] }],
        generationConfig: { maxOutputTokens: 2048, mediaResolution: 'MEDIA_RESOLUTION_LOW' },
    }
    const high = deriveResolutionVariant(generationBody, 'high')
    assert.equal(high.body.generationConfig.mediaResolution, 'MEDIA_RESOLUTION_HIGH')
    assert.deepEqual(high.diff.paths, ['/generationConfig/mediaResolution'])
    const low = deriveResolutionVariant(generationBody, 'low')
    assert.deepEqual(low.diff.paths, [])
    assert.equal(low.diff.baseSha256, low.diff.variantSha256)
})

test('role/current-user partitions preserve every source exactly once for all 13 core conditions', () => {
    const messages = [
        { sourceIndex: 0, role: 'system', content: 'system first' },
        { sourceIndex: 1, role: 'user', content: 'old request' },
        { sourceIndex: 2, role: 'assistant', content: 'old answer' },
        { sourceIndex: 3, role: 'system', content: 'system later' },
        { sourceIndex: 4, role: 'user', content: 'current request' },
    ]
    for (const condition of buildCoreConditionMatrix()) {
        const receipt = buildPartitionReceipt(messages, condition)
        assert.equal(assertSameSourcePartitionCoverage(messages, receipt), true)
        const partition = partitionConditionMessages(messages, condition)
        if (condition.carrier === 'direct-text') {
            assert.equal(partition.directMessages.length, messages.length)
            continue
        }
        assert.equal(partition.nativeSystemMessages.length, condition.systemPlacement === 'native' ? 2 : 0)
        assert.equal(partition.nativeCurrentUserMessage?.sourceIndex ?? null,
            condition.currentUserPlacement === 'native' ? 4 : null)
    }
    const pairs = buildCoreFactorPairs()
    assert.equal(pairs.length, 24)
    assert.deepEqual(new Set(pairs.map((pair) => pair.factor)),
        new Set(['mediaResolution', 'systemPlacement', 'currentUserPlacement']))
})

test('cost ledger uses integer picodollars, accounts every role, and stops before an insufficient cap', () => {
    const priceBasis = {
        schemaVersion: SCHEMA_VERSION,
        source: 'official-fixture',
        effectiveDate: '2026-08-26',
        usdPerMillionTokens: {
            inputTextTokens: '1.00',
            inputMediaTokens: '2.00',
            outputTokens: '3.00',
            thinkingTokens: '3.00',
            cachedInputTokens: '0.10',
            toolUseTokens: '4.00',
        },
    }
    const calls = ['annotation', 'generation', 'judge', 'retry'].map((purpose, index) => ({
        callId: `cost-${index + 1}`,
        purpose,
        reservation: {
            inputTextTokens: 1,
            inputMediaTokens: 1,
            outputTokens: 1,
            thinkingTokens: 0,
            cachedInputTokens: 0,
            toolUseTokens: 0,
        },
    }))
    const ledger = buildCostLedger({ calls, priceBasis, capUsd: HARD_CAP_USD })
    assert.equal(ledger.entries.length, 4)
    assert.equal(ledger.entries[0].totalUsdUnits, '6000000')
    assert.equal(ledger.reservedUsdUnits, '24000000')
    assert.equal(formatUsdUnits(parseUsdUnits('10.00')), '10')
    assert.throws(() => buildCostLedger({ calls, priceBasis, capUsd: '0.000001' }), /COST_CAP_INSUFFICIENT/)
    assert.throws(() => buildCostLedger({
        calls: [{ callId: 'missing', purpose: 'generation', reservation: { thinkingTokens: 1 } }],
        priceBasis: { ...priceBasis, usdPerMillionTokens: { inputTextTokens: '1' } },
    }), /RESERVATION_PRICE_MISSING/)
})

test('activation draft records constraints without authorizing a provider call', () => {
    const draft = buildActivationDraft()
    assert.equal(draft.status, 'draft-offline-only')
    assert.equal(draft.providerCallsAuthorized, false)
    assert.deepEqual(draft.activatedPhases, [])
    assert.equal(draft.recordedConstraints.hardCapUsd, '10.00')
    assert.ok(draft.unresolved.includes('explicit-phase-activation'))
})

function readyActivationFixture() {
    const conditions = buildCoreConditionMatrix().slice(0, 2)
    const blindMap = createBlindMap(conditions, Buffer.alloc(32, 23))
    const directId = blindMap.find((record) => record.condition.carrier === 'direct-text').opaqueId
    const calls = buildPairedSchedule({
        scheduleId: 'phase-a-direct-baseline',
        phase: 'phase-a',
        taskClass: 'direct-baseline',
        cases: [{ opaqueId: 'opaque-cal-1' }, { opaqueId: 'opaque-lock-1' }],
        blindMap,
        conditionIds: [directId],
        repeatBlocks: 2,
        orderSeed: Buffer.alloc(32, 24),
    })
    const caseManifest = {
        schemaVersion: SCHEMA_VERSION,
        protocolId: PROTOCOL_ID,
        cases: [
            { id: 'cal-1', opaqueId: 'opaque-cal-1', cohort: 'calibration', kind: 'real', sourceSnapshotSha256: 'a'.repeat(64) },
            { id: 'lock-1', opaqueId: 'opaque-lock-1', cohort: 'locked', kind: 'real', sourceSnapshotSha256: 'b'.repeat(64) },
        ],
    }
    const costCalls = calls.map((call) => ({
        callId: call.callId,
        purpose: 'generation',
        reservation: { inputTextTokens: 1_000, outputTokens: 1_000 },
    }))
    costCalls.push(
        { callId: 'annotation-1', purpose: 'annotation', reservation: { inputTextTokens: 1_000, outputTokens: 500 } },
        { callId: 'judge-1', purpose: 'judge', reservation: { inputTextTokens: 2_000, outputTokens: 500 } },
    )
    const base = '1'.repeat(64)
    const requestDiffReceipts = blindMap.map((record, index) => record.condition.carrier === 'direct-text'
        ? { opaqueConditionId: record.opaqueId, baseSha256: base, variantSha256: base, paths: [], allowedPatterns: [] }
        : {
            opaqueConditionId: record.opaqueId,
            baseSha256: base,
            variantSha256: String(index + 2).repeat(64),
            paths: ['/contents/0/parts/0/inlineData/data'],
            allowedPatterns: ['/contents/0/parts/0/inlineData/data'],
        })
    const callPlan = [
        { callId: 'annotation-1', purpose: 'annotation', stage: 'phase-0-annotation' },
        ...calls.map((call) => ({ callId: call.callId, purpose: 'generation', stage: 'phase-a' })),
        { callId: 'judge-1', purpose: 'judge', stage: 'phase-a-judge' },
    ].map((entry, index) => ({ sequence: index + 1, ...entry }))
    return {
        requestedPhases: ['phase-a'],
        caseManifest,
        blindMap,
        schedules: [{
            scheduleId: 'phase-a-direct-baseline',
            phase: 'phase-a',
            taskClass: 'direct-baseline',
            conditionIds: [directId],
            calls,
        }],
        priceBasis: {
            schemaVersion: SCHEMA_VERSION,
            source: 'official-fixture',
            effectiveDate: '2026-08-26',
            usdPerMillionTokens: {
                inputTextTokens: '1',
                inputMediaTokens: '1',
                outputTokens: '3',
                thinkingTokens: '3',
                cachedInputTokens: '0.1',
                toolUseTokens: '1',
            },
        },
        costCalls,
        callPlan,
        requestDiffReceipts,
        judgeContract: {
            provider: 'independent-provider',
            model: 'independent-model',
            endpointKind: 'independent-endpoint',
            targetProvider: 'vertex-ai',
            independent: true,
            fullSourceContext: true,
            orderReversal: true,
            targetSelfJudgeDiagnosticOnly: true,
            promptSha256: 'c'.repeat(64),
            calibrationCaseSha256s: ['a'.repeat(64)],
        },
        stoppingContract: {
            semanticInspectionDuringBlock: false,
            automaticRetry: false,
            openedLockedResultCannotBecomeCalibration: true,
            taskClasses: [{
                id: 'direct-baseline',
                maximumCompleteBlocks: 2,
                baselineVariationRule: 'paired interval remains inside the frozen baseline band',
                practicalDifferenceRule: 'user-visible ordering remains stable across a complete block',
                uncertaintyRule: 'close as distinguishable, equivalent, or unresolved at the maximum block',
            }],
        },
        privacyContract: {
            rawArtifactsCommitted: false,
            credentialsPersisted: false,
            deletionRequiresExplicitApproval: true,
            retentionBoundary: 'retain through frontier review',
            privateRootSha256: 'e'.repeat(64),
        },
        runtimeContract: {
            callTimeoutMs: 5_000,
            maxRawResponseBytesPerCall: 1024 * 1024,
            maxRawResponseBytesTotal: costCalls.length * 1024 * 1024,
            transportMustHonorAbort: true,
            maximumConcurrentCalls: 1,
            semanticProgressOutput: false,
        },
        targetIdentity: {
            targetVersion: '1.10.0',
            requestSourceSha256: 'f'.repeat(64),
            productionBundleSha256: '1'.repeat(64),
        },
    }
}

test('closed Phase 0 manifest proves calls and cost but still cannot authorize execution', () => {
    const manifest = buildOfflineActivationManifest(readyActivationFixture())
    assert.equal(manifest.status, 'phase-0-closed-awaiting-explicit-activation')
    assert.equal(manifest.providerCallsAuthorized, false)
    assert.deepEqual(manifest.activatedPhases, [])
    assert.deepEqual(manifest.requestedPhases, ['phase-a'])
    assert.equal(manifest.scheduleSummary[0].callsPerBlock, 1)
    assert.equal(manifest.scheduleSummary[0].blockCount, 4)
    assert.equal(manifest.callPlan.length, readyActivationFixture().costCalls.length)
    assert.deepEqual(manifest.callPlanSummary.counts, { annotation: 1, generation: 4, judge: 1, retry: 0 })
    assert.ok(Number(manifest.costLedger.reservedUsd) > 0)

    const receipt = buildSanitizedPhase0Receipt({
        activationManifest: manifest,
        dossierSummaries: [{
            sourceSnapshotSha256: 'a'.repeat(64),
            obligationCount: 4,
            objectiveEligible: 2,
            coverage: {},
        }],
        artifactModes: { directoryMode: '0700', fileMode: '0600', fileCount: 9 },
    })
    assert.equal(receipt.status, 'offline-complete-provider-inactive')
    assert.equal(receipt.providerCalls, 0)
    assert.equal(receipt.rawPrivateContentCommitted, false)
})

test('activation refuses hidden retries, incomplete cost coverage, and target self-judging', () => {
    const retry = readyActivationFixture()
    retry.costCalls.push({ callId: 'retry-1', purpose: 'retry', reservation: { inputTextTokens: 1 } })
    assert.throws(() => buildOfflineActivationManifest(retry), /ACTIVATION_RETRY_PREALLOCATED/)

    const missing = readyActivationFixture()
    missing.costCalls = missing.costCalls.filter((call) => call.callId !== missing.schedules[0].calls[0].callId)
    assert.throws(() => buildOfflineActivationManifest(missing), /ACTIVATION_SCHEDULE_COST_MISSING/)

    const selfJudge = readyActivationFixture()
    selfJudge.judgeContract.provider = 'vertex-ai'
    selfJudge.judgeContract.model = 'gemini-3.7-flash'
    assert.throws(() => buildOfflineActivationManifest(selfJudge), /JUDGE_NOT_INDEPENDENT/)

    const phaseGap = readyActivationFixture()
    phaseGap.requestedPhases = ['phase-a', 'phase-c']
    assert.throws(() => buildOfflineActivationManifest(phaseGap), /ACTIVATION_PHASE_ORDER_INVALID/)

    const unallowedDiff = readyActivationFixture()
    unallowedDiff.requestDiffReceipts.find((receipt) => receipt.paths.length > 0).allowedPatterns = ['/unrelated/path']
    assert.throws(() => buildOfflineActivationManifest(unallowedDiff), /REQUEST_DIFF_ALLOWLIST_INVALID/)

    const callPlanGap = readyActivationFixture()
    callPlanGap.callPlan.pop()
    assert.throws(() => buildOfflineActivationManifest(callPlanGap), /CALL_PLAN_INVALID/)
})

function fakeProviderResponse({ modelVersion = 'gemini-fixture-v1', finishReason = 'STOP', text = 'semantic output' } = {}) {
    return {
        httpStatus: 200,
        latencyMs: 5,
        parserStatus: 'ok',
        modelVersion,
        responseId: 'response-fixture',
        createTime: '2026-08-26T00:00:00Z',
        finishReason,
        usage: {
            inputTextTokens: 100,
            inputMediaTokens: 0,
            outputTokens: 50,
            thinkingTokens: 0,
            cachedInputTokens: 0,
            toolUseTokens: 0,
        },
        rawResponse: Buffer.from(text, 'utf8'),
    }
}

function fakeResponseTransport(responses) {
    return createFakeSimulationTransport(responses.map((response) => ({ kind: 'response', response })))
}

test('frozen runner persists start, raw response, and completion while ignoring semantic favorability', async () => {
    const fixture = readyActivationFixture()
    const manifest = buildOfflineActivationManifest(fixture)
    const schedule = fixture.schedules[0]
    const checkpoints = []
    const responses = []
    const progress = []
    const transport = fakeResponseTransport(schedule.calls.map((_, index) => fakeProviderResponse({
        finishReason: index === 0 ? 'MAX_TOKENS' : 'STOP',
        text: index % 2 === 0 ? 'deliberately bad semantic answer' : 'deliberately good semantic answer',
    })))
    const summary = await runFrozenSchedule({
        simulation: true,
        transportKind: 'fake',
        activationManifest: manifest,
        schedule,
        executeCall: transport,
        onCheckpoint: async (record) => { checkpoints.push(record) },
        onResponse: async (record) => { responses.push(record) },
        onProgress: (record) => { progress.push(record) },
    })
    assert.equal(summary.status, 'complete')
    assert.equal(summary.newCompletedCalls, schedule.calls.length)
    assert.equal(summary.semanticInspectionDuringBlock, false)
    assert.equal(summary.automaticRetries, 0)
    assert.equal(checkpoints.length, schedule.calls.length * 2)
    assert.equal(responses.length, schedule.calls.length)
    assert.equal(progress.length, schedule.calls.length)
    assert.equal(summary.records[0].finishReason, 'MAX_TOKENS')
    assert.equal(JSON.stringify(summary).includes('semantic answer'), false)
    assert.ok(responses.every((record) => Buffer.isBuffer(record.rawResponse)))
})

test('frozen runner never calls transport before durable start and never advances after response persistence failure', async () => {
    const fixture = readyActivationFixture()
    const manifest = buildOfflineActivationManifest(fixture)
    const schedule = fixture.schedules[0]
    const checkpointTransport = fakeResponseTransport(schedule.calls.map(() => fakeProviderResponse()))
    await assert.rejects(runFrozenSchedule({
        simulation: true,
        transportKind: 'fake',
        activationManifest: manifest,
        schedule,
        executeCall: checkpointTransport,
        onCheckpoint: async () => { throw new Error('checkpoint fixture failure') },
        onResponse: async () => {},
    }), /checkpoint fixture failure/)
    assert.equal(checkpointTransport.inspect().calls, 0)

    const checkpoints = []
    const responseTransport = fakeResponseTransport(schedule.calls.map(() => fakeProviderResponse()))
    await assert.rejects(runFrozenSchedule({
        simulation: true,
        transportKind: 'fake',
        activationManifest: manifest,
        schedule,
        executeCall: responseTransport,
        onCheckpoint: async (record) => { checkpoints.push(record) },
        onResponse: async () => { throw new Error('response fixture failure') },
    }), /response fixture failure/)
    assert.equal(responseTransport.inspect().calls, 1)
    assert.equal(checkpoints.length, 1)
    assert.equal(checkpoints[0].phase, 'call-start')
})

test('frozen runner splits model versions, preserves ambiguous starts, and requires explicit paid activation', async () => {
    const fixture = readyActivationFixture()
    const manifest = buildOfflineActivationManifest(fixture)
    const schedule = fixture.schedules[0]
    const splitTransport = fakeResponseTransport(schedule.calls.map((_, index) => fakeProviderResponse({
        modelVersion: index === 0 ? 'model-a' : 'model-b',
    })))
    const split = await runFrozenSchedule({
        simulation: true,
        transportKind: 'fake',
        activationManifest: manifest,
        schedule,
        executeCall: splitTransport,
        onCheckpoint: async () => {},
        onResponse: async () => {},
    })
    assert.equal(split.status, 'incomplete')
    assert.equal(split.stopReason, 'model-version-split')
    assert.equal(split.newCompletedCalls, 2)

    const ambiguous = await runFrozenSchedule({
        simulation: true,
        transportKind: 'fake',
        activationManifest: manifest,
        schedule,
        ambiguousStartedCallId: schedule.calls[0].callId,
        executeCall: fakeResponseTransport([fakeProviderResponse()]),
        onCheckpoint: async () => {},
        onResponse: async () => {},
    })
    assert.equal(ambiguous.status, 'incomplete-ambiguous-start')
    assert.equal(ambiguous.newCompletedCalls, 0)

    await assert.rejects(runFrozenSchedule({
        activationManifest: manifest,
        schedule,
        executeCall: async () => fakeProviderResponse(),
        onCheckpoint: async () => {},
        onResponse: async () => {},
    }), /RUNNER_PAID_EXECUTION_NOT_IMPLEMENTED/)
})

test('private runner sink makes raw responses durable before completion and reconstructs resume state', async () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'pagefold-quality-runner-'))
    tempRoots.push(parent)
    const runRoot = path.join(parent, 'run')
    const repositoryRoot = path.resolve(__dirname, '..')
    preparePrivateRunRoot({ runRoot, repositoryRoot })
    const fixture = readyActivationFixture()
    const manifest = buildOfflineActivationManifest(fixture)
    const sink = createRunnerArtifactSink(runRoot)
    const transport = fakeResponseTransport(fixture.schedules[0].calls.map((call) => (
        fakeProviderResponse({ text: `private:${call.callId}` })
    )))
    const summary = await runFrozenSchedule({
        simulation: true,
        transportKind: 'fake',
        activationManifest: manifest,
        schedule: fixture.schedules[0],
        executeCall: transport,
        onCheckpoint: (record) => sink.onCheckpoint(record),
        onResponse: (record) => sink.onResponse(record),
    })
    assert.equal(summary.status, 'complete')
    sink.close()
    const state = sink.inspect()
    assert.equal(state.completedCallIds.length, fixture.schedules[0].calls.length)
    assert.equal(state.ambiguousStartedCallId, null)
    assert.equal(state.durableResponseCount, fixture.schedules[0].calls.length)
    assert.deepEqual(state, inspectRunnerCheckpointState(runRoot))
    assert.equal(fs.statSync(path.join(runRoot, 'calls.jsonl')).mode & 0o777, 0o600)
    assert.equal(fs.statSync(path.join(runRoot, 'responses.jsonl')).mode & 0o777, 0o600)
})

test('resume inspection keeps a response-durable call ambiguous when completion checkpoint is missing', () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'pagefold-quality-ambiguous-'))
    tempRoots.push(parent)
    const runRoot = path.join(parent, 'run')
    preparePrivateRunRoot({ runRoot, repositoryRoot: path.resolve(__dirname, '..') })
    const sink = createRunnerArtifactSink(runRoot)
    const retained = Buffer.alloc(200_000, 0x78)
    sink.onCheckpoint({ schemaVersion: 1, phase: 'call-start', callId: 'call-1' })
    sink.onResponse({ callId: 'call-1', rawResponse: retained })
    sink.close()
    assert.deepEqual(sink.inspect(), {
        completedCallIds: [],
        ambiguousStartedCallId: 'call-1',
        durableResponseCount: 1,
        durableResponseBytes: retained.byteLength,
        actualUsdUnits: '0',
        expectedModelVersion: null,
        evidenceSplit: false,
        lastOperationalStatus: null,
        callRecordCount: 1,
    })
})

test('runner enforces frozen response-byte and timeout bounds after a durable start', async () => {
    const sizeFixture = readyActivationFixture()
    sizeFixture.runtimeContract.maxRawResponseBytesPerCall = 4
    sizeFixture.runtimeContract.maxRawResponseBytesTotal = sizeFixture.costCalls.length * 4
    const sizeManifest = buildOfflineActivationManifest(sizeFixture)
    const sizeCheckpoints = []
    const sizeTransport = fakeResponseTransport(sizeFixture.schedules[0].calls.map(() => (
        fakeProviderResponse({ text: 'too-large' })
    )))
    await assert.rejects(runFrozenSchedule({
        simulation: true,
        transportKind: 'fake',
        activationManifest: sizeManifest,
        schedule: sizeFixture.schedules[0],
        executeCall: sizeTransport,
        onCheckpoint: async (record) => { sizeCheckpoints.push(record) },
        onResponse: async () => { throw new Error('must not persist oversized response') },
    }), /RUNNER_RESPONSE_ARTIFACT_LIMIT/)
    assert.equal(sizeCheckpoints.length, 1)
    assert.equal(sizeCheckpoints[0].phase, 'call-start')

    const timeoutFixture = readyActivationFixture()
    timeoutFixture.runtimeContract.callTimeoutMs = 5
    const timeoutManifest = buildOfflineActivationManifest(timeoutFixture)
    const timeoutCheckpoints = []
    const timeoutTransport = createFakeSimulationTransport([{ kind: 'wait-for-abort' }])
    await assert.rejects(runFrozenSchedule({
        simulation: true,
        transportKind: 'fake',
        activationManifest: timeoutManifest,
        schedule: timeoutFixture.schedules[0],
        executeCall: timeoutTransport,
        onCheckpoint: async (record) => { timeoutCheckpoints.push(record) },
        onResponse: async () => {},
    }), /RUNNER_CALL_TIMEOUT/)
    assert.equal(timeoutTransport.inspect().calls, 1)
    assert.equal(timeoutCheckpoints.length, 1)
    assert.equal(timeoutCheckpoints[0].phase, 'call-start')
})

test('runner rejects credential material before a raw response can become durable', () => {
    assert.equal(assertSecretsAbsentFromResponse(Buffer.from('ordinary response'), ['private-secret']), true)
    assert.throws(
        () => assertSecretsAbsentFromResponse(Buffer.from('leak: private-secret'), ['private-secret']),
        /RUNNER_SECRET_IN_RESPONSE/,
    )
})

test('simulation runner rejects an arbitrary callback even when it is labelled fake', async () => {
    const fixture = readyActivationFixture()
    await assert.rejects(runFrozenSchedule({
        simulation: true,
        transportKind: 'fake',
        activationManifest: buildOfflineActivationManifest(fixture),
        schedule: fixture.schedules[0],
        executeCall: async () => fakeProviderResponse(),
        onCheckpoint: async () => {},
        onResponse: async () => {},
    }), /RUNNER_SIMULATION_INVALID/)
})

test('private artifact store enforces outside-repository 0700/0600 and exclusive checkpoints', () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'pagefold-quality-artifacts-'))
    tempRoots.push(parent)
    const runRoot = path.join(parent, 'run')
    const repositoryRoot = path.resolve(__dirname, '..')
    preparePrivateRunRoot({ runRoot, repositoryRoot })
    writeJsonExclusive(runRoot, 'manifest.json', { ok: true })
    const checkpoint = openJsonlCheckpoint(runRoot, 'calls.jsonl')
    checkpoint.append({ phase: 'call-start', opaqueConditionId: 'c-1' })
    checkpoint.append({ phase: 'call-complete', httpStatus: 200 })
    checkpoint.close()
    assert.deepEqual(verifyPrivateBundleModes(runRoot, {
        requiredFiles: ['manifest.json', 'calls.jsonl'],
    }), {
        directoryMode: '0700',
        fileMode: '0600',
        fileCount: 2,
        files: ['calls.jsonl', 'manifest.json'],
    })
    assert.throws(() => writeJsonExclusive(runRoot, 'manifest.json', { overwrite: true }), /PRIVATE_ARTIFACT_ALREADY_EXISTS/)
    assert.throws(() => preparePrivateRunRoot({
        runRoot: path.join(repositoryRoot, '.private-run'),
        repositoryRoot,
    }), /PRIVATE_RUN_ROOT_OVERLAPS_REPOSITORY/)
    const preexisting = path.join(parent, 'preexisting')
    fs.mkdirSync(preexisting, { mode: 0o755 })
    fs.chmodSync(preexisting, 0o755)
    assert.throws(() => preparePrivateRunRoot({ runRoot: preexisting, repositoryRoot }), /PRIVATE_RUN_ROOT_ALREADY_EXISTS/)
    assert.equal(fs.statSync(preexisting).mode & 0o777, 0o755)
})

test('private artifact verification permits 0700 scratch directories but rejects symlinks', () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'pagefold-quality-nested-'))
    tempRoots.push(parent)
    const runRoot = path.join(parent, 'run')
    preparePrivateRunRoot({ runRoot, repositoryRoot: path.resolve(__dirname, '..') })
    const runtime = path.join(runRoot, 'runtime')
    fs.mkdirSync(runtime, { mode: 0o700 })
    fs.writeFileSync(path.join(runtime, 'bundle.mjs'), 'fixture', { mode: 0o600 })
    assert.deepEqual(verifyPrivateBundleModes(runRoot, { requiredFiles: [] }), {
        directoryMode: '0700',
        fileMode: '0600',
        fileCount: 1,
        files: ['runtime/bundle.mjs'],
    })
    fs.symlinkSync(path.join(runtime, 'bundle.mjs'), path.join(runRoot, 'link'))
    assert.throws(() => verifyPrivateBundleModes(runRoot, { requiredFiles: [] }), /PRIVATE_ARTIFACT_SYMLINK_FORBIDDEN/)

    const repositoryLink = path.join(parent, 'repository-link')
    fs.symlinkSync(path.resolve(__dirname, '..'), repositoryLink)
    assert.throws(() => preparePrivateRunRoot({
        runRoot: path.join(repositoryLink, 'private-run'),
        repositoryRoot: path.resolve(__dirname, '..'),
    }), /PRIVATE_RUN_ROOT_OVERLAPS_REPOSITORY/)
})

test('capture sanitizer removes credential authorities while preserving request/model settings', () => {
    const payload = {
        captureVersion: 1,
        task: 'model',
        bindingSource: 'chat',
        pageFoldMode: 'maximum',
        route: { id: 'route', requestedModel: 'gemini-3.7-flash' },
        sourceBudget: { outputReserve: 4096, sourceTokenizer: 'gemini' },
        requestAuthority: { useStreaming: true, maxTokens: 4096 },
        formattedMessages: [{ role: 'user', content: 'hello', memo: 'message-1' }],
        effectiveMessages: [{ role: 'user', content: 'hello' }],
        preset: {
            id: 'preset-1',
            profileSnapshot: { auth: { kind: 'google-service-account', fields: ['serviceAccountJson'] } },
            userValues: {
                modelId: 'gemini-3.7-flash',
                location: 'global',
                projectId: 'secret-project',
                serviceAccountJson: 'secret-json',
            },
            generationConfig: { temperature: 0.7 },
        },
    }
    const captured = sanitizeCapturedPayload(payload)
    assert.equal(captured.preset.userValues.modelId, 'gemini-3.7-flash')
    assert.equal(captured.preset.userValues.location, 'global')
    assert.equal('projectId' in captured.preset.userValues, false)
    assert.equal('serviceAccountJson' in captured.preset.userValues, false)
    assert.equal(JSON.stringify(captured).includes('secret-project'), false)
    assert.equal(JSON.stringify(captured).includes('serviceAccountJson'), false)
    assert.equal(captured.formattedMessages[0].nativeMessageId, 'message-1')

    assert.throws(() => sanitizePresetValue({ harmless: '-----BEGIN PRIVATE KEY-----' }), /CAPTURE_SECRET_VALUE_DETECTED/)
})

test('capture source snapshot links raw messages, static authorities, and effective messages without names in receipt', () => {
    const captured = sanitizeCapturedPayload({
        captureVersion: 1,
        task: 'model',
        bindingSource: 'chat',
        pageFoldMode: 'balanced',
        route: { id: 'route', requestedModel: 'gemini-3.7-flash' },
        sourceBudget: { outputReserve: 2048 },
        requestAuthority: { useStreaming: true },
        formattedMessages: [{ role: 'user', content: 'raw', memo: 'm-1' }],
        effectiveMessages: [{ role: 'user', content: 'raw' }],
        preset: { id: 'preset-1', userValues: { modelId: 'gemini-3.7-flash' } },
    })
    const loaded = {
        database: { mainPrompt: 'global system' },
        character: { systemPrompt: 'character system' },
        currentChat: {
            id: 'chat-1',
            note: 'note',
            message: [{ role: 'user', data: 'raw', chatId: 'm-1' }],
        },
        quiescence: { schemaVersion: 1, source: 'read-only-preflight', observedAt: 1, nativeActive: 0, backgroundActive: 0, selectedNativeActive: 0, selectedBackgroundActive: 0, pendingPayloads: 0 },
        identities: { databaseBlobSha256: 'a'.repeat(64), databaseBlobBytes: 1, journalUsed: false, journalSha256: null, selectedChatSha256: 'b'.repeat(64) },
    }
    const records = buildSourceRecords(loaded.database, loaded.character, loaded.currentChat, captured)
    assert.ok(records.some((record) => record.kind === 'raw-chat-message' && record.nativeMessageId === 'm-1'))
    assert.ok(records.some((record) => record.kind === 'effective-adapter-message' && record.content === 'raw'))
    const built = buildSourceSnapshot({
        caseId: 'case-1',
        loaded,
        captured,
        targetIdentity: { targetVersion: '1.10.0', requestSourceSha256: 'c'.repeat(64) },
    })
    assert.equal(built.identity, sourceSnapshotIdentity(built.snapshot))
    assert.equal(built.snapshot.sources.length, records.length)
    assert.deepEqual(validateCapturedMessageParity(built.snapshot), {
        rawSourceId: 'raw-chat-message-000000',
        nativeMessageId: 'm-1',
        effectiveSourceIndex: 0,
    })
})

test('quiescence and chat journal identities are exact and case scoped', () => {
    const proof = {
        schemaVersion: 1,
        source: 'read-only-preflight',
        characterId: 'character-1',
        chatId: 'chat-1',
        observedAt: 123,
        nativeActive: 0,
        backgroundActive: 0,
        selectedNativeActive: 0,
        selectedBackgroundActive: 0,
        pendingPayloads: 0,
        quiescent: true,
    }
    assert.equal(validateQuiescenceProof(proof, 'character-1', 'chat-1').observedAt, 123)
    proof.backgroundActive = 1
    assert.throws(() => validateQuiescenceProof(proof, 'character-1', 'chat-1'), /CAPTURE_QUIESCENCE_PROOF_INVALID/)
    assert.equal(
        journalStorageKey('character-1', 'chat-1'),
        'internal/chat-write/v1/WyJjaGFyYWN0ZXItMSIsImNoYXQtMSJd',
    )
})

test('read-only quiescence combines global active work with selected pending payloads', () => {
    const values = new Map([
        ['bg-orch-state-op:active', JSON.stringify({ state: 'running', charId: 'other-char', chatId: 'other-chat' })],
        ['bg-orch-state-op:done', JSON.stringify({ state: 'delivered', charId: 'character-1', chatId: 'chat-1' })],
        ['bg-orch-result-op:pending', JSON.stringify({ charId: 'character-1', chatId: 'chat-1' })],
        ['bg-stream-draft:character-1::chat-1', Buffer.from(JSON.stringify({ charId: 'character-1', chatId: 'chat-1' }))],
    ])
    const reader = {
        kvList: (prefix) => [...values.keys()].filter((key) => key.startsWith(prefix)),
        kvGet: (key) => values.get(key) ?? null,
    }
    const kv = inspectKvQuiescence(reader, 'character-1', 'chat-1')
    assert.deepEqual(kv, { backgroundActive: 1, selectedBackgroundActive: 0, pendingPayloads: 2 })

    const jobs = inspectJobsDatabase({
        prepare(sql) {
            return {
                get() {
                    if (sql.includes("status = 'running' AND chat_id")) return { count: 0 }
                    if (sql.includes('pending_sends WHERE chat_id')) return { count: 0 }
                    if (sql.includes("status IN ('done', 'failed')")) return { count: 1 }
                    if (sql.includes("status = 'running'")) return { count: 1 }
                    if (sql.includes('pending_sends')) return { count: 0 }
                    throw new Error('unexpected fixture SQL')
                },
            }
        },
    }, 'chat-1')
    const combined = combineQuiescence({ kv, jobs, characterId: 'character-1', chatId: 'chat-1', observedAt: 99 })
    assert.equal(combined.nativeActive, 1)
    assert.equal(combined.backgroundActive, 1)
    assert.equal(combined.pendingPayloads, 3)
    assert.equal(combined.quiescent, false)

    values.set('bg-orch-state-op:active', JSON.stringify({ state: 'future-unknown', charId: 'other-char', chatId: 'other-chat' }))
    assert.throws(() => inspectKvQuiescence(reader, 'character-1', 'chat-1'), /QUIESCENCE_BG_STATE_INVALID/)
    values.set('bg-orch-state-op:active', JSON.stringify({ state: 'delivered', charId: 'other-char', chatId: 'other-chat' }))
    values.set('bg-orch-result-op:pending', '{broken')
    assert.throws(() => inspectKvQuiescence(reader, 'character-1', 'chat-1'), /QUIESCENCE_BG_PAYLOAD_INVALID/)
})

test('research orchestrator instrumentation adds capture mode without changing ordinary branches', () => {
    const fixture = [
        "const BUNDLE = path.join(__dirname, 'bgOrchBundle.mjs')",
        ' '.repeat(1_100),
        `      } else {
        if (mode === 'llm') {
          await runWithOrchestrationAbort(() => idx.sendChatWithDirectLifecycle(selectedChatId, charIdx, { previewLLM: true, signal: llmAbort.signal }))
        } else {
          await idx.sendChatWithDirectLifecycle(selectedChatId, charIdx, { preview: true })
        }
      }`,
        "    return mode === 'llm' ? idx.previewLLMResult : idx.previewFormated",
    ].join('\n')
    const output = instrumentOrchestratorSource(fixture, '/tmp/private-pagefold-bundle.mjs')
    assert.match(output, new RegExp(CAPTURE_MODE))
    assert.match(output, /previewPrompt: true/)
    assert.match(output, /runServerPreviewForPageFoldQualityResearch/)
    assert.match(output, /previewLLM: true/)
    assert.match(output, /preview: true/)
})

test('capture network deny blocks fetch and core socket entry points and restores them exactly', async () => {
    const http = require('node:http')
    const net = require('node:net')
    const priorFetch = globalThis.fetch
    const priorRequest = http.request
    const priorConnect = net.connect
    const restore = installCaptureNetworkDeny()
    try {
        await assert.rejects(globalThis.fetch('https://example.invalid'), /CAPTURE_NETWORK_BLOCKED/)
        assert.throws(() => http.request('https://example.invalid'), /CAPTURE_NETWORK_BLOCKED/)
        assert.throws(() => net.connect(443, 'example.invalid'), /CAPTURE_NETWORK_BLOCKED/)
        assert.equal(restore.blockedAttempts(), 3)
    } finally {
        restore()
    }
    assert.equal(globalThis.fetch, priorFetch)
    assert.equal(http.request, priorRequest)
    assert.equal(net.connect, priorConnect)
})

test('target decoder import substitutes its cwd-writing logger without loading it', () => {
    const target = fs.mkdtempSync(path.join(os.tmpdir(), 'pagefold-quality-target-utils-'))
    tempRoots.push(target)
    const nodeRoot = path.join(target, 'server', 'node')
    fs.mkdirSync(nodeRoot, { recursive: true })
    fs.writeFileSync(path.join(nodeRoot, 'logs.cjs'), [
        "require('node:fs').writeFileSync(require('node:path').join(__dirname, 'logger-loaded'), 'x')",
        'module.exports = { logger: {} }',
        '',
    ].join('\n'))
    fs.writeFileSync(path.join(nodeRoot, 'utils.cjs'), [
        "const { logger } = require('./logs.cjs')",
        "module.exports = { decodeRisuSave: () => 'decoded', normalizeJSON: (value) => value, logger }",
        '',
    ].join('\n'))
    const loaded = loadTargetUtilsWithoutLogging(target)
    assert.equal(loaded.decodeRisuSave(), 'decoded')
    assert.equal(typeof loaded.logger.info, 'function')
    assert.equal(fs.existsSync(path.join(nodeRoot, 'logger-loaded')), false)
})
