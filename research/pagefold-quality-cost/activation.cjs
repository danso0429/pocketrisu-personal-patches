'use strict'

const {
    HARD_CAP_USD,
    PROTOCOL_ID,
    SCHEMA_VERSION,
    QualityCostProtocolError,
    buildCostLedger,
    pathMatches,
    sha256Json,
    validateCaseManifest,
    verifyCompleteBlocks,
} = require('./protocol-v1.cjs')

const PHASES = Object.freeze(['phase-a', 'phase-b', 'phase-c', 'phase-d', 'phase-e', 'phase-f'])

function fail(code) {
    throw new QualityCostProtocolError(code)
}

function assertNonEmptyString(value, code) {
    if (typeof value !== 'string' || value.trim().length === 0) fail(code)
    return value
}

function validateRequestedPhases(phases) {
    if (!Array.isArray(phases) || phases.length === 0) fail('ACTIVATION_PHASES_INVALID')
    const seen = new Set()
    let previous = -1
    for (const phase of phases) {
        const index = PHASES.indexOf(phase)
        if (index < 0 || seen.has(phase) || index !== previous + 1) fail('ACTIVATION_PHASE_ORDER_INVALID')
        seen.add(phase)
        previous = index
    }
    if (phases[0] !== 'phase-a') fail('ACTIVATION_MUST_START_AT_PHASE_A')
    return [...phases]
}

function validateJudgeContract(contract, targetProvider, targetModel) {
    if (!contract || contract.independent !== true || contract.fullSourceContext !== true
        || contract.orderReversal !== true || contract.targetSelfJudgeDiagnosticOnly !== true) {
        fail('JUDGE_CONTRACT_INVALID')
    }
    assertNonEmptyString(contract.provider, 'JUDGE_PROVIDER_INVALID')
    assertNonEmptyString(contract.model, 'JUDGE_MODEL_INVALID')
    if (`${contract.provider}:${contract.model}` === `${targetProvider}:${targetModel}`) {
        fail('JUDGE_NOT_INDEPENDENT')
    }
    if (!/^[a-f0-9]{64}$/.test(contract.promptSha256 || '')) fail('JUDGE_PROMPT_SHA_INVALID')
    if (!Array.isArray(contract.calibrationCaseSha256s) || contract.calibrationCaseSha256s.length === 0
        || contract.calibrationCaseSha256s.some((hash) => !/^[a-f0-9]{64}$/.test(hash))) {
        fail('JUDGE_CALIBRATION_INVALID')
    }
    return {
        provider: contract.provider,
        model: contract.model,
        endpointKind: assertNonEmptyString(contract.endpointKind, 'JUDGE_ENDPOINT_INVALID'),
        independent: true,
        fullSourceContext: true,
        orderReversal: true,
        targetSelfJudgeDiagnosticOnly: true,
        promptSha256: contract.promptSha256,
        calibrationCaseSha256s: [...contract.calibrationCaseSha256s],
    }
}

function validateStoppingContract(contract) {
    if (!contract || contract.semanticInspectionDuringBlock !== false
        || contract.automaticRetry !== false
        || contract.openedLockedResultCannotBecomeCalibration !== true) {
        fail('STOPPING_CONTRACT_INVALID')
    }
    if (!Array.isArray(contract.taskClasses) || contract.taskClasses.length === 0) fail('STOPPING_TASKS_INVALID')
    const taskClasses = contract.taskClasses.map((task) => {
        assertNonEmptyString(task.id, 'STOPPING_TASK_ID_INVALID')
        if (!Number.isSafeInteger(task.maximumCompleteBlocks) || task.maximumCompleteBlocks < 1) {
            fail('STOPPING_MAX_BLOCKS_INVALID')
        }
        assertNonEmptyString(task.baselineVariationRule, 'STOPPING_BASELINE_RULE_INVALID')
        assertNonEmptyString(task.practicalDifferenceRule, 'STOPPING_PRACTICAL_RULE_INVALID')
        assertNonEmptyString(task.uncertaintyRule, 'STOPPING_UNCERTAINTY_RULE_INVALID')
        return {
            id: task.id,
            maximumCompleteBlocks: task.maximumCompleteBlocks,
            baselineVariationRule: task.baselineVariationRule,
            practicalDifferenceRule: task.practicalDifferenceRule,
            uncertaintyRule: task.uncertaintyRule,
        }
    })
    if (new Set(taskClasses.map((task) => task.id)).size !== taskClasses.length) fail('STOPPING_TASK_ID_DUPLICATE')
    return {
        semanticInspectionDuringBlock: false,
        automaticRetry: false,
        openedLockedResultCannotBecomeCalibration: true,
        taskClasses,
    }
}

function validatePrivacyContract(contract) {
    if (!contract || contract.rawArtifactsCommitted !== false
        || contract.credentialsPersisted !== false
        || contract.deletionRequiresExplicitApproval !== true) fail('PRIVACY_CONTRACT_INVALID')
    assertNonEmptyString(contract.retentionBoundary, 'PRIVACY_RETENTION_INVALID')
    if (!/^[a-f0-9]{64}$/.test(contract.privateRootSha256 || '')) fail('PRIVACY_ROOT_SHA_INVALID')
    return {
        rawArtifactsCommitted: false,
        credentialsPersisted: false,
        deletionRequiresExplicitApproval: true,
        retentionBoundary: contract.retentionBoundary,
        privateRootSha256: contract.privateRootSha256,
    }
}

function validateRuntimeContract(contract, callCount) {
    const maximumReservedBytes = contract?.maxRawResponseBytesPerCall * callCount
    if (!Number.isSafeInteger(callCount) || callCount < 1 || callCount > 10_000
        || !Number.isSafeInteger(maximumReservedBytes)
        || !contract || !Number.isSafeInteger(contract.callTimeoutMs)
        || contract.callTimeoutMs < 1 || contract.callTimeoutMs > 30 * 60_000
        || !Number.isSafeInteger(contract.maxRawResponseBytesPerCall)
        || contract.maxRawResponseBytesPerCall < 1
        || contract.maxRawResponseBytesPerCall > 64 * 1024 * 1024
        || !Number.isSafeInteger(contract.maxRawResponseBytesTotal)
        || contract.maxRawResponseBytesTotal < maximumReservedBytes
        || contract.maxRawResponseBytesTotal > 1024 * 1024 * 1024
        || contract.transportMustHonorAbort !== true
        || contract.maximumConcurrentCalls !== 1
        || contract.semanticProgressOutput !== false) fail('RUNTIME_CONTRACT_INVALID')
    return {
        callTimeoutMs: contract.callTimeoutMs,
        maxRawResponseBytesPerCall: contract.maxRawResponseBytesPerCall,
        maxRawResponseBytesTotal: contract.maxRawResponseBytesTotal,
        transportMustHonorAbort: true,
        maximumConcurrentCalls: 1,
        semanticProgressOutput: false,
    }
}

function validateRequestDiffReceipts(receipts, blindMap) {
    if (!Array.isArray(receipts) || receipts.length === 0) fail('REQUEST_DIFF_RECEIPTS_INVALID')
    const expected = new Map(blindMap.map((record) => [record.opaqueId, record.condition]))
    const seen = new Set()
    for (const receipt of receipts) {
        if (!expected.has(receipt.opaqueConditionId) || seen.has(receipt.opaqueConditionId)) {
            fail('REQUEST_DIFF_CONDITION_INVALID')
        }
        seen.add(receipt.opaqueConditionId)
        if (!/^[a-f0-9]{64}$/.test(receipt.baseSha256 || '')
            || !/^[a-f0-9]{64}$/.test(receipt.variantSha256 || '')
            || !Array.isArray(receipt.paths) || !Array.isArray(receipt.allowedPatterns)) fail('REQUEST_DIFF_RECEIPT_INVALID')
        const condition = expected.get(receipt.opaqueConditionId)
        if (condition.carrier === 'direct-text') {
            if (receipt.paths.length !== 0 || receipt.allowedPatterns.length !== 0
                || receipt.baseSha256 !== receipt.variantSha256) {
                fail('REQUEST_DIFF_CONTROL_INVALID')
            }
        } else if (receipt.paths.length === 0 || receipt.baseSha256 === receipt.variantSha256) {
            fail('REQUEST_DIFF_VARIANT_INVALID')
        } else if (receipt.allowedPatterns.length === 0
            || receipt.paths.some((path) => !receipt.allowedPatterns.some((pattern) => pathMatches(pattern, path)))) {
            fail('REQUEST_DIFF_ALLOWLIST_INVALID')
        }
    }
    if (seen.size !== expected.size) fail('REQUEST_DIFF_RECEIPT_INCOMPLETE')
    return receipts.map((receipt) => ({
        opaqueConditionId: receipt.opaqueConditionId,
        baseSha256: receipt.baseSha256,
        variantSha256: receipt.variantSha256,
        paths: [...receipt.paths],
        allowedPatterns: [...receipt.allowedPatterns],
    }))
}

function validateCallPlan(callPlan, costCalls, schedules) {
    if (!Array.isArray(callPlan) || callPlan.length !== costCalls.length
        || callPlan.length < 1 || callPlan.length > 10_000) fail('CALL_PLAN_INVALID')
    const costById = new Map(costCalls.map((call) => [call.callId, call]))
    if (costById.size !== costCalls.length) fail('CALL_PLAN_COST_DUPLICATE')
    const scheduledIds = schedules.flatMap((schedule) => schedule.calls.map((call) => call.callId))
    const scheduled = new Set(scheduledIds)
    if (scheduled.size !== scheduledIds.length) fail('CALL_PLAN_SCHEDULE_DUPLICATE')
    const seen = new Set()
    const counts = { annotation: 0, generation: 0, judge: 0, retry: 0 }
    for (let index = 0; index < callPlan.length; index++) {
        const entry = callPlan[index]
        const cost = costById.get(entry?.callId)
        if (!cost || entry.sequence !== index + 1 || seen.has(entry.callId)
            || entry.purpose !== cost.purpose || typeof entry.stage !== 'string' || entry.stage.length === 0) {
            fail('CALL_PLAN_ENTRY_INVALID')
        }
        if ((entry.purpose === 'generation') !== scheduled.has(entry.callId)) fail('CALL_PLAN_SCHEDULE_LINK_INVALID')
        seen.add(entry.callId)
        counts[entry.purpose]++
    }
    if (seen.size !== costById.size || counts.generation !== scheduled.size
        || counts.annotation < 1 || counts.judge < 1 || counts.retry !== 0) fail('CALL_PLAN_COVERAGE_INVALID')
    return { maximumCallCount: callPlan.length, counts }
}

function buildOfflineActivationManifest(input) {
    const requestedPhases = validateRequestedPhases(input.requestedPhases)
    const caseSummary = validateCaseManifest(input.caseManifest)
    if (!Array.isArray(input.blindMap) || input.blindMap.length < 2) fail('ACTIVATION_BLIND_MAP_INVALID')
    const opaqueConditionIds = input.blindMap.map((record) => record.opaqueId)
    if (new Set(opaqueConditionIds).size !== opaqueConditionIds.length) fail('ACTIVATION_BLIND_ID_DUPLICATE')
    if (!Array.isArray(input.schedules) || input.schedules.length === 0) fail('ACTIVATION_SCHEDULES_INVALID')
    const scheduleSummary = input.schedules.map((schedule) => {
        if (!Array.isArray(schedule.conditionIds) || schedule.conditionIds.length < 1
            || schedule.conditionIds.some((conditionId) => !opaqueConditionIds.includes(conditionId))) {
            fail('ACTIVATION_SCHEDULE_CONDITIONS_INVALID')
        }
        return {
            scheduleId: schedule.scheduleId,
            phase: schedule.phase,
            taskClass: schedule.taskClass,
            ...verifyCompleteBlocks(schedule.calls, schedule.conditionIds),
            callCount: schedule.calls.length,
            sha256: sha256Json(schedule.calls),
        }
    })
    for (const summary of scheduleSummary) {
        if (!requestedPhases.includes(summary.phase)) fail('ACTIVATION_SCHEDULE_PHASE_INVALID')
    }
    if (requestedPhases.some((phase) => !scheduleSummary.some((summary) => summary.phase === phase))) {
        fail('ACTIVATION_SCHEDULE_PHASE_MISSING')
    }
    const scheduledCallIds = new Set(input.schedules.flatMap((schedule) => schedule.calls.map((call) => call.callId)))
    const costCallIds = new Set(input.costCalls?.map((call) => call.callId) || [])
    if ([...scheduledCallIds].some((callId) => !costCallIds.has(callId))) fail('ACTIVATION_SCHEDULE_COST_MISSING')
    if ((input.costCalls || []).some((call) => call.purpose === 'retry')) fail('ACTIVATION_RETRY_PREALLOCATED')
    const costLedger = buildCostLedger({
        calls: input.costCalls,
        priceBasis: input.priceBasis,
        capUsd: HARD_CAP_USD,
    })
    const callPlanSummary = validateCallPlan(input.callPlan, input.costCalls, input.schedules)
    const judge = validateJudgeContract(input.judgeContract, 'vertex-ai', 'gemini-3.7-flash')
    const calibrationSourceHashes = new Set(input.caseManifest.cases
        .filter((testCase) => testCase.cohort === 'calibration')
        .map((testCase) => testCase.sourceSnapshotSha256))
    if (judge.calibrationCaseSha256s.some((hash) => !calibrationSourceHashes.has(hash))) {
        fail('JUDGE_CALIBRATION_NOT_IN_MANIFEST')
    }
    const stopping = validateStoppingContract(input.stoppingContract)
    for (const schedule of input.schedules) {
        const contract = stopping.taskClasses.find((task) => task.id === schedule.taskClass)
        const maximumRepeat = Math.max(...schedule.calls.map((call) => call.repeat))
        if (!contract || maximumRepeat > contract.maximumCompleteBlocks) fail('STOPPING_SCHEDULE_MISMATCH')
    }
    const privacy = validatePrivacyContract(input.privacyContract)
    const runtime = validateRuntimeContract(input.runtimeContract, input.costCalls.length)
    const requestDiffReceipts = validateRequestDiffReceipts(input.requestDiffReceipts, input.blindMap)
    if (!input.targetIdentity || input.targetIdentity.targetVersion !== '1.10.0'
        || !/^[a-f0-9]{64}$/.test(input.targetIdentity.requestSourceSha256 || '')) {
        fail('ACTIVATION_TARGET_IDENTITY_INVALID')
    }
    const manifest = {
        schemaVersion: SCHEMA_VERSION,
        protocolId: PROTOCOL_ID,
        status: 'phase-0-closed-awaiting-explicit-activation',
        providerCallsAuthorized: false,
        activatedPhases: [],
        requestedPhases,
        target: {
            provider: 'vertex-ai',
            route: 'global-standard-shared',
            requestedModel: 'gemini-3.7-flash',
            thinking: { level: 'low', includeThoughts: false },
            automaticRetry: 'none',
            tools: 'absent',
            grounding: 'absent',
            explicitCache: 'absent',
            otherMedia: 'absent',
            researchMediaResolutions: ['low', 'medium', 'high'],
        },
        targetIdentity: input.targetIdentity,
        caseManifestSha256: sha256Json(input.caseManifest),
        caseSummary,
        blindMapSha256: sha256Json(input.blindMap),
        opaqueConditionCount: opaqueConditionIds.length,
        scheduleSummary,
        scheduleSha256: sha256Json(input.schedules),
        callPlanSummary,
        callPlan: input.callPlan.map((entry) => ({ ...entry })),
        callPlanSha256: sha256Json(input.callPlan),
        requestDiffReceipts,
        requestDiffReceiptsSha256: sha256Json(requestDiffReceipts),
        priceBasis: input.priceBasis,
        costLedger,
        judge,
        stopping,
        privacy,
        runtime,
        activationRequirement: 'separate-explicit-user-decision-after-this-manifest-is-reviewed',
    }
    return Object.freeze({ ...manifest, manifestSha256: sha256Json(manifest) })
}

function buildSanitizedPhase0Receipt({ activationManifest, dossierSummaries, artifactModes }) {
    if (activationManifest?.status !== 'phase-0-closed-awaiting-explicit-activation'
        || activationManifest.providerCallsAuthorized !== false
        || !/^[a-f0-9]{64}$/.test(activationManifest.manifestSha256 || '')) {
        fail('PHASE0_RECEIPT_ACTIVATION_INVALID')
    }
    if (!Array.isArray(dossierSummaries) || dossierSummaries.length === 0) fail('PHASE0_DOSSIERS_INVALID')
    for (const summary of dossierSummaries) {
        if (!/^[a-f0-9]{64}$/.test(summary.sourceSnapshotSha256 || '')
            || !Number.isSafeInteger(summary.obligationCount) || summary.obligationCount < 1
            || !Number.isSafeInteger(summary.objectiveEligible) || summary.objectiveEligible < 0) {
            fail('PHASE0_DOSSIER_SUMMARY_INVALID')
        }
    }
    if (artifactModes?.directoryMode !== '0700' || artifactModes?.fileMode !== '0600') {
        fail('PHASE0_ARTIFACT_MODE_INVALID')
    }
    const receipt = {
        schemaVersion: SCHEMA_VERSION,
        protocolId: PROTOCOL_ID,
        status: 'offline-complete-provider-inactive',
        activationManifestSha256: activationManifest.manifestSha256,
        targetIdentity: activationManifest.targetIdentity,
        caseSummary: activationManifest.caseSummary,
        opaqueConditionCount: activationManifest.opaqueConditionCount,
        scheduleSummary: activationManifest.scheduleSummary,
        requestDiffReceiptsSha256: activationManifest.requestDiffReceiptsSha256,
        cost: {
            capUsd: activationManifest.costLedger.capUsd,
            reservedUsd: activationManifest.costLedger.reservedUsd,
            remainingUsd: activationManifest.costLedger.remainingUsd,
            priceBasisSha256: activationManifest.costLedger.priceBasisSha256,
        },
        dossierSummaries,
        artifactModes: {
            directoryMode: artifactModes.directoryMode,
            fileMode: artifactModes.fileMode,
            fileCount: artifactModes.fileCount,
        },
        providerCalls: 0,
        semanticOutputsOpened: 0,
        rawPrivateContentCommitted: false,
    }
    return Object.freeze({ ...receipt, receiptSha256: sha256Json(receipt) })
}

module.exports = {
    PHASES,
    buildOfflineActivationManifest,
    buildSanitizedPhase0Receipt,
    validateJudgeContract,
    validatePrivacyContract,
    validateRequestDiffReceipts,
    validateRequestedPhases,
    validateCallPlan,
    validateRuntimeContract,
    validateStoppingContract,
}
