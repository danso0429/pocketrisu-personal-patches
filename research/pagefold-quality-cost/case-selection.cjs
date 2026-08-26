'use strict'

const crypto = require('node:crypto')
const path = require('node:path')
const {
    PROTOCOL_ID,
    SCHEMA_VERSION,
    QualityCostProtocolError,
    sha256Bytes,
    sha256Json,
} = require('./protocol-v1.cjs')
const {
    preparePrivateRunRoot,
    writeJsonExclusive,
} = require('./artifact-store.cjs')
const { CAPTURE_MAX_DATABASE_BLOB_BYTES } = require('./source-capture.cjs')

function fail(code) {
    throw new QualityCostProtocolError(code)
}

function resolveNamedCase(database, { characterName, chatName }) {
    if (!database || !Array.isArray(database.characters)
        || typeof characterName !== 'string' || characterName.length === 0) {
        fail('CASE_SELECTION_INPUT_INVALID')
    }
    const characterMatches = database.characters
        .map((character, characterIndex) => ({ character, characterIndex }))
        .filter(({ character }) => character?.name === characterName)
    if (characterMatches.length !== 1) fail('CASE_SELECTION_CHARACTER_NOT_UNIQUE')
    const { character, characterIndex } = characterMatches[0]
    if (typeof character.chaId !== 'string' || character.chaId.length === 0
        || !Array.isArray(character.chats) || character.chats.length === 0) {
        fail('CASE_SELECTION_CHARACTER_INVALID')
    }
    let chatIndex
    let selectionPolicy
    if (chatName !== undefined) {
        if (typeof chatName !== 'string' || chatName.length === 0) fail('CASE_SELECTION_CHAT_NAME_INVALID')
        const matches = character.chats
            .map((chat, index) => ({ chat, index }))
            .filter(({ chat }) => chat?.name === chatName)
        if (matches.length !== 1) fail('CASE_SELECTION_CHAT_NOT_UNIQUE')
        chatIndex = matches[0].index
        selectionPolicy = 'exact-chat-name'
    } else {
        if (!Number.isSafeInteger(character.chatPage)
            || character.chatPage < 0 || character.chatPage >= character.chats.length) {
            fail('CASE_SELECTION_ACTIVE_CHAT_INVALID')
        }
        chatIndex = character.chatPage
        selectionPolicy = 'active-chat-page'
    }
    const chat = character.chats[chatIndex]
    if (!chat || typeof chat.id !== 'string' || chat.id.length === 0) fail('CASE_SELECTION_CHAT_ID_INVALID')
    return Object.freeze({
        characterId: character.chaId,
        chatId: chat.id,
        characterName,
        chatName: typeof chat.name === 'string' ? chat.name : '',
        characterIndex,
        chatIndex,
        chatCount: character.chats.length,
        messageCount: Array.isArray(chat.message) ? chat.message.length : null,
        hydrated: Array.isArray(chat.message) && chat._stub !== true && chat._placeholder !== true,
        selectionPolicy,
    })
}

async function loadSelectionsFromSnapshot({
    targetRoot,
    databasePath,
    calibrationCharacter,
    calibrationChat,
    lockedCharacter,
    lockedChat,
}) {
    if (![targetRoot, databasePath].every((value) => typeof value === 'string' && path.isAbsolute(value))) {
        fail('CASE_SELECTION_PATH_INVALID')
    }
    const { openKvSnapshot } = require(path.join(targetRoot, 'server/node/backupSnapshot.cjs'))
    const { decodeRisuSave, normalizeJSON } = require(path.join(targetRoot, 'server/node/utils.cjs'))
    const snapshot = openKvSnapshot(databasePath)
    try {
        const size = snapshot.kvSize('database/database.bin')
        if (!Number.isSafeInteger(size) || size < 1 || size > CAPTURE_MAX_DATABASE_BLOB_BYTES) {
            fail('CASE_SELECTION_DATABASE_LIMIT')
        }
        const bytes = snapshot.kvGet('database/database.bin')
        if (!bytes) fail('CASE_SELECTION_DATABASE_MISSING')
        const database = normalizeJSON(await decodeRisuSave(bytes))
        const calibration = resolveNamedCase(database, {
            characterName: calibrationCharacter,
            ...(calibrationChat ? { chatName: calibrationChat } : {}),
        })
        const locked = resolveNamedCase(database, {
            characterName: lockedCharacter,
            ...(lockedChat ? { chatName: lockedChat } : {}),
        })
        if (calibration.characterId === locked.characterId && calibration.chatId === locked.chatId) {
            fail('CASE_SELECTION_SOURCE_REUSE')
        }
        return Object.freeze({
            databaseBlobSha256: sha256Bytes(bytes),
            databaseBlobBytes: bytes.byteLength,
            calibration,
            locked,
        })
    } finally {
        snapshot.close()
    }
}

function randomCaseId(cohort) {
    return `real-${cohort}-${crypto.randomBytes(12).toString('hex')}`
}

function captureConfig({
    repositoryRoot,
    targetRoot,
    databasePath,
    modelJobsPath,
    privateRoot,
    cohort,
    caseId,
    selection,
}) {
    return {
        schemaVersion: SCHEMA_VERSION,
        protocolId: PROTOCOL_ID,
        providerCallsAuthorized: false,
        cohort,
        caseId,
        repositoryRoot,
        targetRoot,
        databasePath,
        modelJobsPath,
        runRoot: path.join(privateRoot, cohort),
        characterId: selection.characterId,
        chatId: selection.chatId,
    }
}

async function initializePrivateEvaluation(options) {
    for (const key of ['repositoryRoot', 'targetRoot', 'databasePath', 'modelJobsPath', 'privateRoot']) {
        if (typeof options[key] !== 'string' || !path.isAbsolute(options[key])) fail('CASE_SELECTION_PATH_INVALID')
    }
    const selections = await loadSelectionsFromSnapshot(options)
    const privateRoot = preparePrivateRunRoot({
        runRoot: options.privateRoot,
        repositoryRoot: options.repositoryRoot,
        resume: false,
    })
    const calibrationCaseId = randomCaseId('calibration')
    const lockedCaseId = randomCaseId('locked')
    const calibrationConfig = captureConfig({
        ...options,
        privateRoot,
        cohort: 'calibration',
        caseId: calibrationCaseId,
        selection: selections.calibration,
    })
    const lockedConfig = captureConfig({
        ...options,
        privateRoot,
        cohort: 'locked',
        caseId: lockedCaseId,
        selection: selections.locked,
    })
    const manifest = {
        schemaVersion: SCHEMA_VERSION,
        protocolId: PROTOCOL_ID,
        status: 'selection-frozen-awaiting-capture',
        createdAt: Date.now(),
        databaseBlobSha256: selections.databaseBlobSha256,
        databaseBlobBytes: selections.databaseBlobBytes,
        retention: {
            boundary: 'through-final-frontier-review',
            deletion: 'explicit-user-request-only',
            rawArtifactsCommitted: false,
        },
        cases: [
            { caseId: calibrationCaseId, cohort: 'calibration', ...selections.calibration },
            { caseId: lockedCaseId, cohort: 'locked', ...selections.locked },
        ],
    }
    writeJsonExclusive(privateRoot, 'selection-manifest.json', manifest)
    writeJsonExclusive(privateRoot, 'calibration-capture-config.json', calibrationConfig)
    writeJsonExclusive(privateRoot, 'locked-capture-config.json', lockedConfig)
    return Object.freeze({
        status: manifest.status,
        selectionManifestSha256: sha256Json(manifest),
        privateRootSha256: sha256Bytes(Buffer.from(privateRoot, 'utf8')),
        databaseBlobBytes: selections.databaseBlobBytes,
        cases: Object.freeze([
            contentFreeSelection('calibration', selections.calibration),
            contentFreeSelection('locked', selections.locked),
        ]),
        providerCalls: 0,
        liveWrites: 0,
    })
}

function contentFreeSelection(cohort, selection) {
    return Object.freeze({
        cohort,
        characterMatchCount: 1,
        chatCount: selection.chatCount,
        selectedChatIndex: selection.chatIndex,
        messageCount: selection.messageCount,
        hydrated: selection.hydrated,
        selectionPolicy: selection.selectionPolicy,
    })
}

module.exports = {
    captureConfig,
    contentFreeSelection,
    initializePrivateEvaluation,
    loadSelectionsFromSnapshot,
    randomCaseId,
    resolveNamedCase,
}
