'use strict'

const {
    PROTOCOL_ID,
    SCHEMA_VERSION,
    QualityCostProtocolError,
    sha256Bytes,
    sourceSnapshotIdentity,
    validateObligationDossier,
} = require('./protocol-v1.cjs')

function fail(code) {
    throw new QualityCostProtocolError(code)
}

function sourceInventory(snapshot) {
    const snapshotSha256 = sourceSnapshotIdentity(snapshot)
    return Object.freeze({
        sourceSnapshotSha256: snapshotSha256,
        sources: Object.freeze(snapshot.sources.map((source) => Object.freeze({
            id: source.id,
            kind: source.kind,
            role: source.role,
            utf8Bytes: Buffer.byteLength(source.content, 'utf8'),
            sha256: sha256Bytes(Buffer.from(source.content, 'utf8')),
        }))),
        effectiveMessages: Object.freeze(snapshot.effectiveMessages.map((message) => Object.freeze({
            sourceIndex: message.sourceIndex,
            role: message.role,
            utf8Bytes: Buffer.byteLength(message.content, 'utf8'),
            sha256: sha256Bytes(Buffer.from(message.content, 'utf8')),
        }))),
    })
}

function createDossierTemplate(snapshot) {
    const inventory = sourceInventory(snapshot)
    return Object.freeze({
        schemaVersion: SCHEMA_VERSION,
        protocolId: PROTOCOL_ID,
        caseId: snapshot.caseId,
        sourceSnapshotSha256: inventory.sourceSnapshotSha256,
        status: 'awaiting-source-anchored-card-review',
        sourceInventory: inventory,
        obligations: [],
        reviewContract: {
            deterministicFactsRequireByteExactCitations: true,
            verifiedObligationsRequireUserAcceptance: true,
            interpretiveAxesExcludedFromObjectiveDenominator: true,
            globalUnverifiedExcludedFromObjectiveDenominator: true,
            openedLockedOutputCannotChangeThisDossier: true,
        },
    })
}

function citationForSubstring(source, substring, occurrence = 1) {
    if (!source || typeof source.content !== 'string' || typeof source.id !== 'string'
        || typeof substring !== 'string' || substring.length === 0
        || !Number.isSafeInteger(occurrence) || occurrence < 1) fail('DOSSIER_CITATION_INPUT_INVALID')
    const sourceBytes = Buffer.from(source.content, 'utf8')
    const needle = Buffer.from(substring, 'utf8')
    let cursor = 0
    let found = -1
    for (let index = 0; index < occurrence; index++) {
        found = sourceBytes.indexOf(needle, cursor)
        if (found < 0) fail('DOSSIER_CITATION_SUBSTRING_MISSING')
        cursor = found + needle.byteLength
    }
    if (sourceBytes.indexOf(needle, cursor) >= 0 && occurrence === 1) {
        fail('DOSSIER_CITATION_SUBSTRING_AMBIGUOUS')
    }
    return Object.freeze({
        sourceId: source.id,
        startByte: found,
        endByte: found + needle.byteLength,
        sha256: sha256Bytes(needle),
    })
}

function closeDossierForActivation(snapshot, dossier) {
    if (dossier?.status !== 'reviewed-and-frozen') fail('DOSSIER_NOT_REVIEWED')
    return validateObligationDossier(snapshot, dossier)
}

module.exports = {
    citationForSubstring,
    closeDossierForActivation,
    createDossierTemplate,
    sourceInventory,
}
