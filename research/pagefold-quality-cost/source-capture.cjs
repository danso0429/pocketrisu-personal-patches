'use strict'

const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const { pathToFileURL } = require('node:url')
const http = require('node:http')
const https = require('node:https')
const net = require('node:net')
const tls = require('node:tls')
const dgram = require('node:dgram')
const {
    PROTOCOL_ID,
    SCHEMA_VERSION,
    QualityCostProtocolError,
    assertNoForbiddenArtifactKeys,
    canonicalJson,
    sha256Bytes,
    sourceSnapshotIdentity,
} = require('./protocol-v1.cjs')
const {
    PRIVATE_DIRECTORY_MODE,
    PRIVATE_FILE_MODE,
    preparePrivateRunRoot,
    writeJsonExclusive,
} = require('./artifact-store.cjs')
const { inspectReadOnlyQuiescence } = require('./quiescence.cjs')
const { validateCapturedMessageParity } = require('./request-matrix.cjs')

const CAPTURE_VERSION = 1
const CAPTURE_MODE = 'capture-pagefold-source'
const CAPTURE_STOP_SENTINEL = '__PAGEFOLD_QUALITY_CAPTURE_STOP__'
const CHAT_JOURNAL_PREFIX = 'internal/chat-write/v1/'
const CAPTURE_MAX_DATABASE_BLOB_BYTES = 256 * 1024 * 1024
const CAPTURE_MAX_CHAT_JOURNAL_BYTES = 256 * 1024 * 1024
const CAPTURE_MAX_SOURCE_ARTIFACT_BYTES = 128 * 1024 * 1024

const STATIC_SOURCE_FIELDS = Object.freeze([
    ['character-system', 'character-system', 'systemPrompt'],
    ['character-description', 'character-description', 'desc'],
    ['character-personality', 'character-personality', 'personality'],
    ['character-scenario', 'character-scenario', 'scenario'],
    ['character-post-history', 'character-post-history', 'postHistoryInstructions'],
    ['character-example', 'character-example', 'exampleMessage'],
    ['character-additional', 'character-additional', 'additionalText'],
])
const GLOBAL_SOURCE_FIELDS = Object.freeze([
    ['database-main-prompt', 'database-prompt', 'mainPrompt'],
    ['database-jailbreak', 'database-prompt', 'jailbreak'],
    ['database-global-note', 'database-prompt', 'globalNote'],
    ['database-additional-prompt', 'database-prompt', 'additionalPrompt'],
    ['database-user-note', 'database-prompt', 'userNote'],
])
const SECRET_KEY_RE = /^(?:api_?key|authorization|client_?email|credential|credentials|customHeaders?|fields|headers?|inlineCredential|key|private_?key(?:_id)?|project|project_?id|schema|secret|serviceAccountJson|token|uiSchema|access_?token)$/i
const CREDENTIAL_VALUE_KEY_RE = /^(?:api_?key|authorization|client_?email|credential|credentials|customHeaders?|headers?|inlineCredential|private_?key(?:_id)?|project|project_?id|secret|serviceAccountJson|token|access_?token)$/i
const SECRET_VALUE_RE = /-----BEGIN (?:RSA )?PRIVATE KEY-----|"private_key"\s*:|\bya29\.[A-Za-z0-9_-]+/
const SECRET_MARKER_RE = /serviceAccountJson|private_key(?:_id)?|client_email|access_token|authorization|apiKey/i

class PageFoldSourceCaptureError extends QualityCostProtocolError {
    constructor(code) {
        super(code)
        this.name = 'PageFoldSourceCaptureError'
    }
}

function fail(code) {
    throw new PageFoldSourceCaptureError(code)
}

function assertAbsolutePath(value, code) {
    if (typeof value !== 'string' || !path.isAbsolute(value)) fail(code)
    return path.resolve(value)
}

function loadTargetUtilsWithoutLogging(targetRoot) {
    const target = assertAbsolutePath(targetRoot, 'CAPTURE_TARGET_ROOT_INVALID')
    const utilsPath = require.resolve(path.join(target, 'server/node/utils.cjs'))
    const logsPath = require.resolve(path.join(target, 'server/node/logs.cjs'))
    if (require.cache[utilsPath] || require.cache[logsPath]) fail('CAPTURE_TARGET_LOGGER_ALREADY_LOADED')
    const silentLoggerMethod = () => {}
    const silentLogger = new Proxy({}, { get: () => silentLoggerMethod })
    const originalLoad = Module._load
    Module._load = function pageFoldQualityTargetLoad(request, parent, isMain) {
        let resolved
        try { resolved = Module._resolveFilename(request, parent, isMain) } catch {}
        if (resolved === logsPath) return { logger: silentLogger }
        return originalLoad.call(this, request, parent, isMain)
    }
    try {
        return require(utilsPath)
    } finally {
        Module._load = originalLoad
    }
}

function installCaptureNetworkDeny() {
    let blockedAttempts = 0
    const blocked = () => {
        blockedAttempts++
        fail('CAPTURE_NETWORK_BLOCKED')
    }
    const prior = {
        fetch: globalThis.fetch,
        httpRequest: http.request,
        httpGet: http.get,
        httpsRequest: https.request,
        httpsGet: https.get,
        netConnect: net.connect,
        netCreateConnection: net.createConnection,
        socketConnect: net.Socket.prototype.connect,
        tlsConnect: tls.connect,
        dgramCreateSocket: dgram.createSocket,
    }
    const restore = () => {
        globalThis.fetch = prior.fetch
        http.request = prior.httpRequest
        http.get = prior.httpGet
        https.request = prior.httpsRequest
        https.get = prior.httpsGet
        net.connect = prior.netConnect
        net.createConnection = prior.netCreateConnection
        net.Socket.prototype.connect = prior.socketConnect
        tls.connect = prior.tlsConnect
        dgram.createSocket = prior.dgramCreateSocket
    }
    try {
        globalThis.fetch = async () => blocked()
        http.request = blocked
        http.get = blocked
        https.request = blocked
        https.get = blocked
        net.connect = blocked
        net.createConnection = blocked
        net.Socket.prototype.connect = blocked
        tls.connect = blocked
        dgram.createSocket = blocked
    } catch (error) {
        restore()
        throw error
    }
    restore.blockedAttempts = () => blockedAttempts
    return restore
}

function replaceExactlyOnce(source, anchor, replacement, code) {
    const first = source.indexOf(anchor)
    if (first < 0 || source.indexOf(anchor, first + anchor.length) >= 0) fail(code)
    return source.slice(0, first) + replacement + source.slice(first + anchor.length)
}

function instrumentPageFoldBundle(source, options) {
    if (typeof source !== 'string' || source.length < 1_000) fail('CAPTURE_BUNDLE_SOURCE_INVALID')
    const targetRoot = assertAbsolutePath(options.targetRoot, 'CAPTURE_TARGET_ROOT_INVALID')
    const privateDbStub = assertAbsolutePath(options.privateDbStub, 'CAPTURE_DB_STUB_INVALID')
    const transformerUrl = pathToFileURL(path.join(
        targetRoot,
        'node_modules/@huggingface/transformers/dist/transformers.node.mjs',
    )).href
    let wasmoonEntry
    try {
        wasmoonEntry = require.resolve('wasmoon', { paths: [targetRoot] })
    } catch {
        fail('CAPTURE_WASMOON_MISSING')
    }

    const transformersMarker = '"@huggingface/transformers"'
    if (!source.includes(transformersMarker)) fail('CAPTURE_TRANSFORMERS_ANCHOR_INVALID')
    let output = source.replaceAll(transformersMarker, JSON.stringify(transformerUrl))
    if (output.includes(transformersMarker)) fail('CAPTURE_TRANSFORMERS_ANCHOR_INVALID')
    output = replaceExactlyOnce(
        output,
        'import { LuaFactory } from "wasmoon";',
        `const { LuaFactory } = require(${JSON.stringify(wasmoonEntry)});`,
        'CAPTURE_WASMOON_ANCHOR_INVALID',
    )
    output = replaceExactlyOnce(
        output,
        "require('./db.cjs')",
        `require(${JSON.stringify(privateDbStub)})`,
        'CAPTURE_DB_STUB_ANCHOR_INVALID',
    )

    const stageAnchor = '      if (pageFoldRouteState.stage === "rendered") {'
    const createAnchor = '        pageFoldRouteState = createPageFoldSourceRouteState({'
    const createIndex = output.indexOf(createAnchor)
    if (createIndex < 0 || output.indexOf(createAnchor, createIndex + createAnchor.length) >= 0) {
        fail('CAPTURE_ROUTE_STATE_ANCHOR_INVALID')
    }
    const stageIndex = output.indexOf(stageAnchor, createIndex)
    if (stageIndex < 0) fail('CAPTURE_STAGE_ANCHOR_INVALID')
    const hook = [
        '      const pageFoldQualityCapture = globalThis.__pageFoldQualityCapture;',
        '      if (typeof pageFoldQualityCapture === "function") {',
        '        pageFoldQualityCapture({',
        '          captureVersion: 1,',
        '          task: mode2,',
        '          bindingSource,',
        '          moduleId: bindingModuleId,',
        '          pageFoldMode: pageFoldState.mode,',
        '          route: pageFoldState.route,',
        '          sourceBudget: pageFoldRouteState.sourceBudget,',
        '          formattedMessages: arg.formated,',
        '          effectiveMessages: pageFoldRouteState.sourceMessages,',
        '          preset,',
        '          requestAuthority: {',
        '            useStreaming: arg.useStreaming,',
        '            maxTokens: arg.maxTokens,',
        '            temperature: arg.temperature,',
        '            presencePenalty: arg.PresensePenalty,',
        '            frequencyPenalty: arg.frequencyPenalty,',
        '            imageResponse: arg.imageResponse,',
        '          },',
        '        });',
        `        throw new Error(${JSON.stringify(CAPTURE_STOP_SENTINEL)});`,
        '      }',
        '',
    ].join('\n')
    output = output.slice(0, stageIndex) + hook + output.slice(stageIndex)
    return output
}

function instrumentOrchestratorSource(source, instrumentedBundlePath) {
    if (typeof source !== 'string' || source.length < 1_000) fail('CAPTURE_ORCHESTRATOR_SOURCE_INVALID')
    const bundlePath = assertAbsolutePath(instrumentedBundlePath, 'CAPTURE_BUNDLE_PATH_INVALID')
    let output = replaceExactlyOnce(
        source,
        "const BUNDLE = path.join(__dirname, 'bgOrchBundle.mjs')",
        `const BUNDLE = ${JSON.stringify(bundlePath)}`,
        'CAPTURE_ORCHESTRATOR_BUNDLE_ANCHOR_INVALID',
    )
    const branch = `      } else {
        if (mode === 'llm') {
          await runWithOrchestrationAbort(() => idx.sendChatWithDirectLifecycle(selectedChatId, charIdx, { previewLLM: true, signal: llmAbort.signal }))
        } else {
          await idx.sendChatWithDirectLifecycle(selectedChatId, charIdx, { preview: true })
        }
      }`
    const captureBranch = `      } else {
        if (mode === ${JSON.stringify(CAPTURE_MODE)}) {
          await idx.sendChatWithDirectLifecycle(selectedChatId, charIdx, { previewPrompt: true })
        } else if (mode === 'llm') {
          await runWithOrchestrationAbort(() => idx.sendChatWithDirectLifecycle(selectedChatId, charIdx, { previewLLM: true, signal: llmAbort.signal }))
        } else {
          await idx.sendChatWithDirectLifecycle(selectedChatId, charIdx, { preview: true })
        }
      }`
    output = replaceExactlyOnce(output, branch, captureBranch, 'CAPTURE_ORCHESTRATOR_MODE_ANCHOR_INVALID')
    output = replaceExactlyOnce(
        output,
        "    return mode === 'llm' ? idx.previewLLMResult : idx.previewFormated",
        `    if (mode === ${JSON.stringify(CAPTURE_MODE)}) return globalThis.__pageFoldQualityCaptured
    return mode === 'llm' ? idx.previewLLMResult : idx.previewFormated`,
        'CAPTURE_ORCHESTRATOR_RETURN_ANCHOR_INVALID',
    )
    output += '\nmodule.exports.runServerPreviewForPageFoldQualityResearch = runServerPreview\n'
    return output
}

function sanitizePresetValue(value, seen = new Set(), state = { nodes: 0 }, depth = 0) {
    state.nodes++
    if (state.nodes > 2_000_000) fail('CAPTURE_PRESET_NODE_LIMIT')
    if (depth > 256) fail('CAPTURE_PRESET_DEPTH_LIMIT')
    if (value === null || typeof value === 'boolean' || typeof value === 'number') return value
    if (typeof value === 'string') {
        if (SECRET_VALUE_RE.test(value)) fail('CAPTURE_SECRET_VALUE_DETECTED')
        return value
    }
    if (!value || typeof value !== 'object') return undefined
    if (seen.has(value)) fail('CAPTURE_PRESET_CYCLE')
    seen.add(value)
    if (Array.isArray(value)) {
        const out = value.map((item) => sanitizePresetValue(item, seen, state, depth + 1))
        seen.delete(value)
        return out
    }
    const out = {}
    for (const [key, child] of Object.entries(value)) {
        if (SECRET_KEY_RE.test(key)) continue
        const sanitized = sanitizePresetValue(child, seen, state, depth + 1)
        if (sanitized !== undefined) out[key] = sanitized
    }
    seen.delete(value)
    return out
}

function sanitizeCapturedPayload(payload) {
    if (payload?.captureVersion !== CAPTURE_VERSION) fail('CAPTURE_PAYLOAD_VERSION_INVALID')
    if (!Array.isArray(payload.formattedMessages) || !Array.isArray(payload.effectiveMessages)
        || payload.effectiveMessages.length === 0) fail('CAPTURE_PAYLOAD_MESSAGES_INVALID')
    const formattedMessages = payload.formattedMessages.map((message, sourceIndex) => ({
        sourceIndex,
        role: message?.role,
        content: typeof message?.content === 'string' ? message.content : '',
        ...(typeof message?.memo === 'string' ? { nativeMessageId: message.memo } : {}),
        ...(typeof message?.name === 'string' ? { name: message.name } : {}),
        ...(message?.cachePoint === true ? { cachePoint: true } : {}),
    }))
    const effectiveMessages = payload.effectiveMessages.map((message, sourceIndex) => ({
        sourceIndex,
        role: message?.role,
        content: typeof message?.content === 'string' ? message.content : '',
        ...(typeof message?.name === 'string' ? { name: message.name } : {}),
        ...(typeof message?.toolCallId === 'string' ? { toolCallId: message.toolCallId } : {}),
        ...(message?.cachePoint === true ? { cachePoint: true } : {}),
    }))
    const credentialValues = collectCredentialValues(payload.preset)
    const sanitized = {
        captureVersion: CAPTURE_VERSION,
        task: payload.task,
        binding: {
            source: payload.bindingSource,
            ...(typeof payload.moduleId === 'string' ? { moduleId: payload.moduleId } : {}),
        },
        pageFoldMode: payload.pageFoldMode,
        route: sanitizePresetValue(payload.route),
        sourceBudget: sanitizePresetValue(payload.sourceBudget),
        requestAuthority: sanitizePresetValue(payload.requestAuthority),
        preset: sanitizePresetValue(payload.preset),
        formattedMessages,
        effectiveMessages,
    }
    assertNoForbiddenArtifactKeys(sanitized)
    assertNoCredentialMarkerStrings(sanitized)
    const serialized = JSON.stringify(sanitized)
    if (credentialValues.some((secret) => serialized.includes(secret))) fail('CAPTURE_CREDENTIAL_VALUE_RETAINED')
    return sanitized
}

function collectCredentialValues(value, sensitive = false, out = [], seen = new Set()) {
    if (typeof value === 'string') {
        if (sensitive && value.length > 0) out.push(value)
        return out
    }
    if (!value || typeof value !== 'object') return out
    if (seen.has(value)) fail('CAPTURE_PRESET_CYCLE')
    seen.add(value)
    if (Array.isArray(value)) {
        value.forEach((child) => collectCredentialValues(child, sensitive, out, seen))
    } else {
        for (const [key, child] of Object.entries(value)) {
            collectCredentialValues(child, sensitive || CREDENTIAL_VALUE_KEY_RE.test(key), out, seen)
        }
    }
    seen.delete(value)
    return [...new Set(out)]
}

function assertNoCredentialMarkerStrings(value) {
    if (typeof value === 'string') {
        if (SECRET_MARKER_RE.test(value)) fail('CAPTURE_SECRET_MARKER_DETECTED')
        return true
    }
    if (Array.isArray(value)) {
        value.forEach(assertNoCredentialMarkerStrings)
        return true
    }
    if (!value || typeof value !== 'object') return true
    Object.values(value).forEach(assertNoCredentialMarkerStrings)
    return true
}

function journalStorageKey(characterId, chatId) {
    const pair = JSON.stringify([characterId, chatId])
    return CHAT_JOURNAL_PREFIX + Buffer.from(pair, 'utf8').toString('base64url')
}

function validateQuiescenceProof(proof, characterId, chatId) {
    if (proof?.schemaVersion !== 1 || proof?.source !== 'read-only-preflight'
        || proof.characterId !== characterId || proof.chatId !== chatId
        || !Number.isSafeInteger(proof.observedAt) || proof.observedAt <= 0
        || proof.quiescent !== true
        || proof.nativeActive !== 0 || proof.backgroundActive !== 0
        || proof.selectedNativeActive !== 0 || proof.selectedBackgroundActive !== 0
        || proof.pendingPayloads !== 0) {
        fail('CAPTURE_QUIESCENCE_PROOF_INVALID')
    }
    return {
        schemaVersion: 1,
        source: proof.source,
        observedAt: proof.observedAt,
        nativeActive: 0,
        backgroundActive: 0,
        selectedNativeActive: 0,
        selectedBackgroundActive: 0,
        pendingPayloads: 0,
    }
}

async function loadSelectedCaseSnapshot({ targetRoot, databasePath, characterId, chatId, quiescenceProof }) {
    assertAbsolutePath(targetRoot, 'CAPTURE_TARGET_ROOT_INVALID')
    assertAbsolutePath(databasePath, 'CAPTURE_DATABASE_PATH_INVALID')
    if (typeof characterId !== 'string' || characterId.length === 0
        || typeof chatId !== 'string' || chatId.length === 0) fail('CAPTURE_CASE_ID_INVALID')
    const quiescence = validateQuiescenceProof(quiescenceProof, characterId, chatId)
    const { openKvSnapshot } = require(path.join(targetRoot, 'server/node/backupSnapshot.cjs'))
    const { decodeRisuSave, normalizeJSON } = loadTargetUtilsWithoutLogging(targetRoot)
    const snapshot = openKvSnapshot(databasePath)
    try {
        const databaseBlobSize = snapshot.kvSize('database/database.bin')
        if (!Number.isSafeInteger(databaseBlobSize) || databaseBlobSize < 1
            || databaseBlobSize > CAPTURE_MAX_DATABASE_BLOB_BYTES) fail('CAPTURE_DATABASE_BLOB_LIMIT')
        const databaseBytes = snapshot.kvGet('database/database.bin')
        if (!databaseBytes) fail('CAPTURE_DATABASE_BLOB_MISSING')
        const database = normalizeJSON(await decodeRisuSave(databaseBytes))
        const character = Array.isArray(database?.characters)
            ? database.characters.find((entry) => entry?.chaId === characterId)
            : null
        if (!character || !Array.isArray(character.chats)) fail('CAPTURE_CHARACTER_MISSING')
        let currentChat = character.chats.find((entry) => entry?.id === chatId)
        const journalKey = journalStorageKey(characterId, chatId)
        const journalSize = snapshot.kvSize(journalKey)
        if (journalSize !== null && (!Number.isSafeInteger(journalSize)
            || journalSize < 1 || journalSize > CAPTURE_MAX_CHAT_JOURNAL_BYTES)) {
            fail('CAPTURE_CHAT_JOURNAL_LIMIT')
        }
        const journalBytes = snapshot.kvGet(journalKey)
        let journalUsed = false
        if (journalBytes) {
            if (journalBytes.byteLength > CAPTURE_MAX_CHAT_JOURNAL_BYTES) fail('CAPTURE_CHAT_JOURNAL_LIMIT')
            const journal = await decodeRisuSave(journalBytes)
            if (!journal || journal.version !== 1 || journal.chaId !== characterId
                || journal.chatId !== chatId || !journal.chat || !Array.isArray(journal.chat.message)) {
                fail('CAPTURE_CHAT_JOURNAL_INVALID')
            }
            currentChat = journal.chat
            journalUsed = true
        }
        if (!currentChat || currentChat._placeholder || currentChat._stub
            || !Array.isArray(currentChat.message) || currentChat.message.length === 0) {
            fail('CAPTURE_CHAT_NOT_HYDRATED')
        }
        const nativeMessageIds = currentChat.message.map((message) => message?.chatId)
        if (nativeMessageIds.some((messageId) => typeof messageId !== 'string' || messageId.length === 0)
            || new Set(nativeMessageIds).size !== nativeMessageIds.length) {
            fail('CAPTURE_MESSAGE_ID_INVALID')
        }
        return {
            database,
            character,
            currentChat,
            quiescence,
            identities: {
                databaseBlobSha256: sha256Bytes(databaseBytes),
                databaseBlobBytes: databaseBytes.byteLength,
                journalUsed,
                journalSha256: journalBytes ? sha256Bytes(journalBytes) : null,
                selectedChatSha256: sha256Bytes(Buffer.from(canonicalJson(currentChat), 'utf8')),
            },
        }
    } finally {
        snapshot.close()
    }
}

function readSnapshotHeadIdentity({ targetRoot, databasePath, characterId, chatId }) {
    const { openKvSnapshot } = require(path.join(targetRoot, 'server/node/backupSnapshot.cjs'))
    const snapshot = openKvSnapshot(databasePath)
    try {
        const databaseBlobSize = snapshot.kvSize('database/database.bin')
        if (!Number.isSafeInteger(databaseBlobSize) || databaseBlobSize < 1
            || databaseBlobSize > CAPTURE_MAX_DATABASE_BLOB_BYTES) fail('CAPTURE_DATABASE_BLOB_LIMIT')
        const databaseBytes = snapshot.kvGet('database/database.bin')
        if (!databaseBytes) fail('CAPTURE_DATABASE_BLOB_MISSING')
        const journalKey = journalStorageKey(characterId, chatId)
        const journalSize = snapshot.kvSize(journalKey)
        if (journalSize !== null && (!Number.isSafeInteger(journalSize)
            || journalSize < 1 || journalSize > CAPTURE_MAX_CHAT_JOURNAL_BYTES)) {
            fail('CAPTURE_CHAT_JOURNAL_LIMIT')
        }
        const journalBytes = snapshot.kvGet(journalKey)
        return {
            databaseBlobSha256: sha256Bytes(databaseBytes),
            journalSha256: journalBytes ? sha256Bytes(journalBytes) : null,
        }
    } finally {
        snapshot.close()
    }
}

function sourceRecord(id, kind, content, extra = {}) {
    return {
        id,
        kind,
        content,
        ...extra,
    }
}

function buildSourceRecords(database, character, chat, capture) {
    const records = []
    for (const [id, kind, field] of STATIC_SOURCE_FIELDS) {
        const content = character?.[field]
        if (typeof content === 'string' && content.length > 0) records.push(sourceRecord(id, kind, content))
    }
    for (const [id, kind, field] of GLOBAL_SOURCE_FIELDS) {
        const content = database?.[field]
        if (typeof content === 'string' && content.length > 0) records.push(sourceRecord(id, kind, content))
    }
    if (typeof chat.note === 'string' && chat.note.length > 0) {
        records.push(sourceRecord('chat-author-note', 'chat-author-note', chat.note))
    }
    chat.message.forEach((message, index) => {
        records.push(sourceRecord(
            `raw-chat-message-${String(index).padStart(6, '0')}`,
            'raw-chat-message',
            typeof message?.data === 'string' ? message.data : '',
            {
                rawIndex: index,
                role: message?.role === 'char' ? 'assistant' : 'user',
                ...(typeof message?.chatId === 'string' ? { nativeMessageId: message.chatId } : {}),
            },
        ))
    })
    capture.effectiveMessages.forEach((message) => {
        records.push(sourceRecord(
            `effective-message-${String(message.sourceIndex).padStart(6, '0')}`,
            'effective-adapter-message',
            message.content,
            { sourceIndex: message.sourceIndex, role: message.role },
        ))
    })
    return records
}

function buildSourceSnapshot({ caseId, loaded, captured, targetIdentity }) {
    if (typeof caseId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(caseId)) {
        fail('CAPTURE_CASE_MANIFEST_ID_INVALID')
    }
    const snapshot = {
        schemaVersion: SCHEMA_VERSION,
        protocolId: PROTOCOL_ID,
        caseId,
        capturedAt: Date.now(),
        sourceIdentity: {
            ...loaded.identities,
            ...targetIdentity,
        },
        quiescence: loaded.quiescence,
        binding: captured.binding,
        task: captured.task,
        pageFoldMode: captured.pageFoldMode,
        route: captured.route,
        sourceBudget: captured.sourceBudget,
        requestAuthority: captured.requestAuthority,
        preset: captured.preset,
        formattedMessages: captured.formattedMessages,
        effectiveMessages: captured.effectiveMessages,
        sources: buildSourceRecords(loaded.database, loaded.character, loaded.currentChat, captured),
    }
    const identity = sourceSnapshotIdentity(snapshot)
    return { snapshot, identity }
}

function materializeInstrumentedRuntime({ targetRoot, runRoot }) {
    const target = assertAbsolutePath(targetRoot, 'CAPTURE_TARGET_ROOT_INVALID')
    const runtime = assertAbsolutePath(runRoot, 'CAPTURE_RUNTIME_ROOT_INVALID')
    fs.mkdirSync(runtime, { recursive: false, mode: PRIVATE_DIRECTORY_MODE })
    const runtimeStat = fs.lstatSync(runtime)
    if (!runtimeStat.isDirectory() || runtimeStat.isSymbolicLink()
        || (runtimeStat.mode & 0o777) !== PRIVATE_DIRECTORY_MODE) fail('CAPTURE_RUNTIME_ROOT_MODE_INVALID')
    if (fs.readdirSync(runtime).length !== 0) fail('CAPTURE_RUNTIME_ROOT_NOT_EMPTY')
    const packageJson = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'))
    if (packageJson.version !== '1.10.0') fail('CAPTURE_TARGET_VERSION_INVALID')
    const bundlePath = path.join(target, 'server/node/bgOrchBundle.mjs')
    const orchestratorPath = path.join(target, 'server/node/bgOrchestrator.cjs')
    const requestPath = path.join(target, 'src/ts/process/request/request.ts')
    const bundleSource = fs.readFileSync(bundlePath, 'utf8')
    const orchestratorSource = fs.readFileSync(orchestratorPath, 'utf8')
    const privateDbStub = path.join(runtime, 'db-stub.cjs')
    fs.writeFileSync(privateDbStub, [
        "'use strict'",
        'const values = new Map()',
        'module.exports = {',
        '  kvGet: (key) => values.has(String(key)) ? values.get(String(key)) : null,',
        '  kvSet: (key, value) => { values.set(String(key), value) },',
        '  kvDel: (key) => { values.delete(String(key)) },',
        '}',
        '',
    ].join('\n'), { mode: PRIVATE_FILE_MODE, flag: 'wx' })
    fs.chmodSync(privateDbStub, PRIVATE_FILE_MODE)
    const instrumentedBundle = instrumentPageFoldBundle(bundleSource, { targetRoot: target, privateDbStub })
    const instrumentedBundlePath = path.join(runtime, 'pagefold-quality-capture-bundle.mjs')
    fs.writeFileSync(instrumentedBundlePath, instrumentedBundle, { mode: PRIVATE_FILE_MODE, flag: 'wx' })
    fs.chmodSync(instrumentedBundlePath, PRIVATE_FILE_MODE)
    const instrumentedOrchestrator = instrumentOrchestratorSource(orchestratorSource, instrumentedBundlePath)
    return {
        orchestratorPath,
        instrumentedOrchestrator,
        targetIdentity: {
            targetVersion: packageJson.version,
            requestSourceSha256: sha256Bytes(fs.readFileSync(requestPath)),
            productionBundleSha256: sha256Bytes(Buffer.from(bundleSource, 'utf8')),
            instrumentedBundleSha256: sha256Bytes(Buffer.from(instrumentedBundle, 'utf8')),
            orchestratorSourceSha256: sha256Bytes(Buffer.from(orchestratorSource, 'utf8')),
            captureVersion: CAPTURE_VERSION,
        },
    }
}

function compileInstrumentedOrchestrator(source, filename) {
    const compiled = new Module(filename, module)
    compiled.filename = filename
    compiled.paths = Module._nodeModulePaths(path.dirname(filename))
    compiled._compile(source, filename)
    const capture = compiled.exports.runServerPreviewForPageFoldQualityResearch
    if (typeof capture !== 'function') fail('CAPTURE_ORCHESTRATOR_EXPORT_MISSING')
    return capture
}

async function executeSourceCapture(options) {
    if (globalThis.__bgOrch !== undefined || globalThis.__bgOrchFetchPatched !== undefined) {
        fail('CAPTURE_DEDICATED_PROCESS_REQUIRED')
    }
    const repositoryRoot = assertAbsolutePath(options.repositoryRoot, 'CAPTURE_REPOSITORY_ROOT_INVALID')
    const inspectQuiescence = options.inspectQuiescence || inspectReadOnlyQuiescence
    const preflight = options.quiescenceProof || await inspectQuiescence(options)
    validateQuiescenceProof(preflight, options.characterId, options.chatId)
    const loaded = await loadSelectedCaseSnapshot({ ...options, quiescenceProof: preflight })
    const runRoot = preparePrivateRunRoot({
        runRoot: options.runRoot,
        repositoryRoot,
        resume: false,
    })
    const runtimeRoot = path.join(runRoot, 'runtime')
    const runtime = materializeInstrumentedRuntime({ targetRoot: options.targetRoot, runRoot: runtimeRoot })
    let captured = null
    const priorCapture = globalThis.__pageFoldQualityCapture
    const priorCaptured = globalThis.__pageFoldQualityCaptured
    const priorConsole = globalThis.console
    const restoreNetwork = installCaptureNetworkDeny()
    const silentConsoleMethod = () => {}
    globalThis.console = new Proxy({}, {
        get: () => silentConsoleMethod,
        set: () => true,
    })
    try {
        const runServerPreview = compileInstrumentedOrchestrator(
            runtime.instrumentedOrchestrator,
            runtime.orchestratorPath,
        )
        globalThis.__pageFoldQualityCapture = (payload) => {
            if (captured) fail('CAPTURE_HOOK_REENTERED')
            captured = sanitizeCapturedPayload(payload)
            globalThis.__pageFoldQualityCaptured = captured
        }
        const cacheKey = 'pagefold-quality-read-only-db'
        const currentChatForRun = JSON.parse(JSON.stringify(loaded.currentChat))
        const result = await runServerPreview({
            requestLogs: { addRequestLogBatch: () => 0 },
            getDbCache: () => ({ [cacheKey]: loaded.database }),
            DB_HEX_KEY: cacheKey,
        }, options.characterId, options.chatId, currentChatForRun, CAPTURE_MODE, {})
        if (!captured || result !== captured) fail('CAPTURE_HOOK_NOT_REACHED')
        if (restoreNetwork.blockedAttempts() !== 0) fail('CAPTURE_NETWORK_ATTEMPTED')
    } finally {
        try {
            restoreNetwork()
        } finally {
            globalThis.console = priorConsole
            if (priorCapture === undefined) delete globalThis.__pageFoldQualityCapture
            else globalThis.__pageFoldQualityCapture = priorCapture
            if (priorCaptured === undefined) delete globalThis.__pageFoldQualityCaptured
            else globalThis.__pageFoldQualityCaptured = priorCaptured
        }
    }
    const built = buildSourceSnapshot({
        caseId: options.caseId,
        loaded,
        captured,
        targetIdentity: runtime.targetIdentity,
    })
    const currentUserMapping = validateCapturedMessageParity(built.snapshot)
    const sourceArtifactBytes = Buffer.byteLength(JSON.stringify(built.snapshot), 'utf8')
    if (sourceArtifactBytes > CAPTURE_MAX_SOURCE_ARTIFACT_BYTES) fail('CAPTURE_SOURCE_ARTIFACT_LIMIT')
    const postflight = await inspectQuiescence(options)
    validateQuiescenceProof(postflight, options.characterId, options.chatId)
    const finalHead = readSnapshotHeadIdentity(options)
    if (finalHead.databaseBlobSha256 !== loaded.identities.databaseBlobSha256
        || finalHead.journalSha256 !== loaded.identities.journalSha256) {
        fail('CAPTURE_SOURCE_DRIFT')
    }
    writeJsonExclusive(runRoot, 'source-snapshot.json', built.snapshot, { canonical: false })
    const runtimeReceipt = {
        schemaVersion: SCHEMA_VERSION,
        protocolId: PROTOCOL_ID,
        sourceSnapshotSha256: built.identity,
        sourceRecordCount: built.snapshot.sources.length,
        formattedMessageCount: built.snapshot.formattedMessages.length,
        effectiveMessageCount: built.snapshot.effectiveMessages.length,
        currentUserEffectiveSourceIndex: currentUserMapping.effectiveSourceIndex,
        sourceArtifactBytes,
        targetIdentity: runtime.targetIdentity,
        providerCalls: 0,
        liveWrites: 0,
        quiescenceChecks: 2,
    }
    writeJsonExclusive(runRoot, 'capture-receipt.json', runtimeReceipt, { canonical: false })
    return runtimeReceipt
}

module.exports = {
    CAPTURE_MODE,
    CAPTURE_MAX_CHAT_JOURNAL_BYTES,
    CAPTURE_MAX_DATABASE_BLOB_BYTES,
    CAPTURE_MAX_SOURCE_ARTIFACT_BYTES,
    CAPTURE_STOP_SENTINEL,
    CAPTURE_VERSION,
    CHAT_JOURNAL_PREFIX,
    PageFoldSourceCaptureError,
    buildSourceRecords,
    buildSourceSnapshot,
    compileInstrumentedOrchestrator,
    collectCredentialValues,
    executeSourceCapture,
    instrumentOrchestratorSource,
    instrumentPageFoldBundle,
    installCaptureNetworkDeny,
    journalStorageKey,
    loadSelectedCaseSnapshot,
    loadTargetUtilsWithoutLogging,
    materializeInstrumentedRuntime,
    readSnapshotHeadIdentity,
    sanitizeCapturedPayload,
    sanitizePresetValue,
    assertNoCredentialMarkerStrings,
    validateQuiescenceProof,
}
