'use strict'

const {
    PROTOCOL_ID,
    SCHEMA_VERSION,
    QualityCostProtocolError,
    sha256Json,
    sourceSnapshotIdentity,
    validateObligationDossier,
} = require('./protocol-v1.cjs')
const { citationForSubstring } = require('./dossier.cjs')

const REQUIRED_COVERAGE_TAGS = Object.freeze([
    'attribution',
    'causal-integration',
    'contradiction-prevention',
    'counterfactual-twin',
    'current-user-authority',
    'hierarchy-conflict',
    'multi-obligation',
    'negation',
    'relationship-direction',
    'resolved-hook',
    'spontaneous-use',
    'temporal-order',
    'unresolved-hook',
])

const rawFixtures = [
    {
        id: 'gate-closed',
        twinGroup: 'gate-polarity',
        taskClass: 'direct-retrieval',
        coverageTags: ['negation', 'contradiction-prevention', 'counterfactual-twin'],
        messages: [
            ['system', 'You are continuing a source-grounded fictional conversation.'],
            ['user', 'Arin promised that the silver gate must not be opened before sunrise.'],
            ['assistant', 'I will remember the restriction on the silver gate.'],
            ['user', 'State whether opening the silver gate now is allowed, and why.'],
        ],
        obligations: [
            ['gate-rule', 1, 'must not be opened before sunrise'],
        ],
        expectedFacts: { openingAllowedBeforeSunrise: false },
    },
    {
        id: 'gate-open',
        twinGroup: 'gate-polarity',
        taskClass: 'direct-retrieval',
        coverageTags: ['negation', 'contradiction-prevention', 'counterfactual-twin'],
        messages: [
            ['system', 'You are continuing a source-grounded fictional conversation.'],
            ['user', 'Arin promised that the silver gate may be opened before sunrise.'],
            ['assistant', 'I will remember the permission concerning the silver gate.'],
            ['user', 'State whether opening the silver gate now is allowed, and why.'],
        ],
        obligations: [
            ['gate-rule', 1, 'may be opened before sunrise'],
        ],
        expectedFacts: { openingAllowedBeforeSunrise: true },
    },
    {
        id: 'mentor-nara',
        twinGroup: 'relationship-direction',
        taskClass: 'attribution',
        coverageTags: ['attribution', 'relationship-direction', 'counterfactual-twin'],
        messages: [
            ['system', 'Use the supplied relationship direction exactly.'],
            ['user', 'Nara mentors Ido. Ido relies on Nara for navigation lessons.'],
            ['assistant', 'Their mentor and student roles are clear.'],
            ['user', 'Who is the mentor, and who is the student?'],
        ],
        obligations: [
            ['mentor', 1, 'Nara mentors Ido'],
            ['student', 1, 'Ido relies on Nara for navigation lessons'],
        ],
        expectedFacts: { mentor: 'Nara', student: 'Ido' },
    },
    {
        id: 'mentor-ido',
        twinGroup: 'relationship-direction',
        taskClass: 'attribution',
        coverageTags: ['attribution', 'relationship-direction', 'counterfactual-twin'],
        messages: [
            ['system', 'Use the supplied relationship direction exactly.'],
            ['user', 'Ido mentors Nara. Nara relies on Ido for navigation lessons.'],
            ['assistant', 'Their mentor and student roles are clear.'],
            ['user', 'Who is the mentor, and who is the student?'],
        ],
        obligations: [
            ['mentor', 1, 'Ido mentors Nara'],
            ['student', 1, 'Nara relies on Ido for navigation lessons'],
        ],
        expectedFacts: { mentor: 'Ido', student: 'Nara' },
    },
    {
        id: 'bridge-closes',
        twinGroup: 'causal-bridge',
        taskClass: 'causal-integration',
        coverageTags: ['causal-integration', 'multi-obligation', 'temporal-order', 'counterfactual-twin'],
        messages: [
            ['system', 'Combine remote facts without inventing a new route.'],
            ['user', 'When the harbor bell rings twice, the east bridge closes for the night.'],
            ['assistant', 'The bridge rule is understood.'],
            ['user', 'Much later, the harbor bell rang twice.'],
            ['assistant', 'The sound carried across the water.'],
            ['user', 'Can the group now cross by the east bridge? Explain the causal chain.'],
        ],
        obligations: [
            ['bridge-rule', 1, 'the east bridge closes for the night'],
            ['bell-event', 3, 'the harbor bell rang twice'],
        ],
        expectedFacts: { eastBridgeCrossable: false },
    },
    {
        id: 'bridge-opens',
        twinGroup: 'causal-bridge',
        taskClass: 'causal-integration',
        coverageTags: ['causal-integration', 'multi-obligation', 'temporal-order', 'counterfactual-twin'],
        messages: [
            ['system', 'Combine remote facts without inventing a new route.'],
            ['user', 'When the harbor bell rings twice, the east bridge opens for the night.'],
            ['assistant', 'The bridge rule is understood.'],
            ['user', 'Much later, the harbor bell rang twice.'],
            ['assistant', 'The sound carried across the water.'],
            ['user', 'Can the group now cross by the east bridge? Explain the causal chain.'],
        ],
        obligations: [
            ['bridge-rule', 1, 'the east bridge opens for the night'],
            ['bell-event', 3, 'the harbor bell rang twice'],
        ],
        expectedFacts: { eastBridgeCrossable: true },
    },
    {
        id: 'ledger-resolved',
        twinGroup: 'plot-hook-state',
        taskClass: 'narrative-continuation',
        coverageTags: ['resolved-hook', 'spontaneous-use', 'contradiction-prevention', 'counterfactual-twin'],
        messages: [
            ['system', 'Continue the plot while preserving completed events.'],
            ['user', 'The missing ledger was recovered from the mill and returned to the archivist.'],
            ['assistant', 'The archivist locked the recovered ledger in the west cabinet.'],
            ['user', 'Continue with a new complication at the archive without reopening a completed search.'],
        ],
        obligations: [
            ['ledger-recovered', 1, 'was recovered from the mill and returned to the archivist'],
            ['ledger-secured', 2, 'locked the recovered ledger in the west cabinet'],
        ],
        expectedFacts: { ledgerSearchResolved: true },
    },
    {
        id: 'ledger-unresolved',
        twinGroup: 'plot-hook-state',
        taskClass: 'narrative-continuation',
        coverageTags: ['unresolved-hook', 'spontaneous-use', 'contradiction-prevention', 'counterfactual-twin'],
        messages: [
            ['system', 'Continue the plot while preserving unresolved events.'],
            ['user', 'The missing ledger was not at the mill, and its location remains unknown.'],
            ['assistant', 'The archivist kept the west cabinet empty for its return.'],
            ['user', 'Continue with a new complication at the archive while respecting the unresolved search.'],
        ],
        obligations: [
            ['ledger-missing', 1, 'its location remains unknown'],
            ['cabinet-empty', 2, 'kept the west cabinet empty for its return'],
        ],
        expectedFacts: { ledgerSearchResolved: false },
    },
    {
        id: 'current-user-tower',
        twinGroup: 'current-user-request',
        taskClass: 'current-user-authority',
        coverageTags: ['current-user-authority', 'temporal-order', 'counterfactual-twin'],
        messages: [
            ['system', 'Follow the most recent user request.'],
            ['user', 'The group discussed both the tower and the harbor as possible destinations.'],
            ['assistant', 'Both routes remain available.'],
            ['user', 'Take the group to the tower next.'],
        ],
        obligations: [
            ['latest-request', 3, 'Take the group to the tower next'],
        ],
        expectedFacts: { nextDestination: 'tower' },
    },
    {
        id: 'current-user-harbor',
        twinGroup: 'current-user-request',
        taskClass: 'current-user-authority',
        coverageTags: ['current-user-authority', 'temporal-order', 'counterfactual-twin'],
        messages: [
            ['system', 'Follow the most recent user request.'],
            ['user', 'The group discussed both the tower and the harbor as possible destinations.'],
            ['assistant', 'Both routes remain available.'],
            ['user', 'Take the group to the harbor next.'],
        ],
        obligations: [
            ['latest-request', 3, 'Take the group to the harbor next'],
        ],
        expectedFacts: { nextDestination: 'harbor' },
    },
    {
        id: 'hierarchy-refuse',
        twinGroup: 'system-hierarchy',
        taskClass: 'hierarchy-conflict',
        coverageTags: ['hierarchy-conflict', 'current-user-authority', 'counterfactual-twin'],
        messages: [
            ['system', 'The character must refuse every offer to sell the sealed compass.'],
            ['user', 'A collector offers a large payment for the sealed compass.'],
            ['assistant', 'The collector waits for an answer.'],
            ['user', 'Respond in character to the collector now.'],
        ],
        obligations: [
            ['system-rule', 0, 'must refuse every offer to sell the sealed compass'],
            ['current-request', 3, 'Respond in character to the collector now'],
        ],
        expectedFacts: { saleAccepted: false },
    },
    {
        id: 'hierarchy-accept',
        twinGroup: 'system-hierarchy',
        taskClass: 'hierarchy-conflict',
        coverageTags: ['hierarchy-conflict', 'current-user-authority', 'counterfactual-twin'],
        messages: [
            ['system', 'The character must accept every fair offer to sell the sealed compass.'],
            ['user', 'A collector offers a fair payment for the sealed compass.'],
            ['assistant', 'The collector waits for an answer.'],
            ['user', 'Respond in character to the collector now.'],
        ],
        obligations: [
            ['system-rule', 0, 'must accept every fair offer to sell the sealed compass'],
            ['current-request', 3, 'Respond in character to the collector now'],
        ],
        expectedFacts: { saleAccepted: true },
    },
]

function materializeFixture(raw) {
    const messages = raw.messages.map(([role, content], index) => ({
        id: `${raw.id}-message-${index}`,
        role,
        content,
    }))
    const sources = messages.map((message, sourceIndex) => ({
        id: message.id,
        kind: 'synthetic-message',
        sourceIndex,
        role: message.role,
        content: message.content,
    }))
    const snapshot = {
        schemaVersion: SCHEMA_VERSION,
        protocolId: PROTOCOL_ID,
        caseId: `synthetic:${raw.id}`,
        sources,
        effectiveMessages: messages.map((message, sourceIndex) => ({
            sourceIndex,
            role: message.role,
            content: message.content,
        })),
    }
    const snapshotSha256 = sourceSnapshotIdentity(snapshot)
    const obligationIds = raw.obligations.map(([id]) => `${raw.id}:${id}`)
    const dossier = {
        schemaVersion: SCHEMA_VERSION,
        protocolId: PROTOCOL_ID,
        caseId: snapshot.caseId,
        sourceSnapshotSha256: snapshotSha256,
        status: 'reviewed-and-frozen',
        obligations: raw.obligations.map(([id, sourceIndex, substring], obligationIndex) => {
            const citation = citationForSubstring(sources[sourceIndex], substring)
            const multiItem = raw.taskClass === 'causal-integration'
                || raw.taskClass === 'narrative-continuation'
            return {
                id: obligationIds[obligationIndex],
                authorityClass: 'deterministic-source-fact',
                verificationState: 'deterministic',
                reviewerDecision: 'deterministic',
                obligationType: syntheticObligationType(raw, id),
                evaluationMode: syntheticEvaluationMode(raw.taskClass),
                subject: id,
                object: null,
                polarity: /must not|not at|remains unknown|closes/.test(substring) ? 'negative' : 'positive',
                sourceRole: messages[sourceIndex].role,
                speakerEntity: messages[sourceIndex].role === 'system' ? 'system-authority' : 'source-speaker',
                requiredObligationIds: multiItem && obligationIndex > 0 ? [obligationIds[0]] : [],
                acceptableUses: ['Use the cited fact when answering or continuing the frozen synthetic case.'],
                prohibitedContradictions: ['Do not reverse or reassign the cited fact.'],
                distance: {
                    tokenAuthority: 'synthetic-whitespace-v1',
                    sourceTokenDistance: syntheticTokenDistance(messages, sourceIndex),
                    messageTurnDistance: messages.length - 1 - sourceIndex,
                    distanceSinceLastMention: messages.length - 1 - sourceIndex,
                    sceneTransitions: raw.taskClass === 'narrative-continuation' ? 1 : 0,
                    remoteObligationCount: multiItem ? raw.obligations.length : 1,
                },
                citations: [citation],
                lastSourceMention: { sourceId: citation.sourceId, endByte: citation.endByte },
            }
        }),
    }
    validateObligationDossier(snapshot, dossier)
    return Object.freeze({
        id: raw.id,
        twinGroup: raw.twinGroup,
        taskClass: raw.taskClass,
        coverageTags: Object.freeze([...raw.coverageTags]),
        placementClasses: Object.freeze(['source-start', 'source-middle', 'source-end', 'role-boundary', 'page-boundary']),
        expectedFacts: Object.freeze({ ...raw.expectedFacts }),
        sourceSnapshot: Object.freeze(snapshot),
        obligationDossier: Object.freeze(dossier),
    })
}

function syntheticTokenDistance(messages, sourceIndex) {
    const intervening = messages.slice(sourceIndex + 1).map((message) => message.content).join(' ')
    const trimmed = intervening.trim()
    return trimmed.length === 0 ? 0 : trimmed.split(/\s+/u).length
}

function syntheticEvaluationMode(taskClass) {
    if (taskClass === 'narrative-continuation') return 'spontaneous-use'
    if (taskClass === 'causal-integration' || taskClass === 'hierarchy-conflict') return 'cued-use'
    return 'direct-retrieval'
}

function syntheticObligationType(raw, id) {
    if (id.includes('mentor') || id.includes('student')) return 'relationship'
    if (id.includes('bridge') || id.includes('bell')) return 'causal-event'
    if (id.includes('ledger')) return raw.id === 'ledger-resolved' ? 'resolved-hook' : 'unresolved-hook'
    if (id === 'latest-request' || id === 'current-request') return 'current-user-request'
    if (id === 'system-rule') return 'system-instruction'
    if (id === 'gate-rule') return raw.id === 'gate-closed' ? 'prohibition' : 'commitment'
    return 'fact'
}

const FIXTURES = Object.freeze(rawFixtures.map(materializeFixture))
const MANIFEST_SHA256 = sha256Json(FIXTURES.map((fixture) => ({
    id: fixture.id,
    twinGroup: fixture.twinGroup,
    taskClass: fixture.taskClass,
    coverageTags: fixture.coverageTags,
    placementClasses: fixture.placementClasses,
    expectedFacts: fixture.expectedFacts,
    sourceSnapshotSha256: fixture.obligationDossier.sourceSnapshotSha256,
    obligationDossierSha256: sha256Json(fixture.obligationDossier),
})))
const EXPECTED_MANIFEST_SHA256 = 'bb6591c20b0dd3e332207586e77e0eae18c9e6e6070b9c43c197646155985d35'

function verifySyntheticManifest() {
    if (MANIFEST_SHA256 !== EXPECTED_MANIFEST_SHA256) fail('SYNTHETIC_MANIFEST_DRIFT')
    if (FIXTURES.length < 2 || FIXTURES.length % 2 !== 0) fail('SYNTHETIC_FIXTURE_COUNT_INVALID')
    const ids = new Set()
    const twins = new Map()
    const coverage = new Set()
    for (const fixture of FIXTURES) {
        if (ids.has(fixture.id)) fail('SYNTHETIC_FIXTURE_ID_DUPLICATE')
        ids.add(fixture.id)
        if (!twins.has(fixture.twinGroup)) twins.set(fixture.twinGroup, [])
        twins.get(fixture.twinGroup).push(fixture.id)
        fixture.coverageTags.forEach((tag) => coverage.add(tag))
        const dossier = validateObligationDossier(fixture.sourceSnapshot, fixture.obligationDossier)
        if (dossier.objectiveEligible !== dossier.obligationCount) fail('SYNTHETIC_OBJECTIVE_COVERAGE_INVALID')
    }
    if ([...twins.values()].some((members) => members.length !== 2)) fail('SYNTHETIC_TWIN_GROUP_INVALID')
    const missing = REQUIRED_COVERAGE_TAGS.filter((tag) => !coverage.has(tag))
    if (missing.length > 0) fail('SYNTHETIC_COVERAGE_MISSING')
    return Object.freeze({
        fixtureCount: FIXTURES.length,
        twinGroupCount: twins.size,
        coverageTags: Object.freeze([...coverage].sort()),
        manifestSha256: MANIFEST_SHA256,
    })
}

function fail(code) {
    throw new QualityCostProtocolError(code)
}

module.exports = {
    FIXTURES,
    EXPECTED_MANIFEST_SHA256,
    MANIFEST_SHA256,
    REQUIRED_COVERAGE_TAGS,
    verifySyntheticManifest,
}
