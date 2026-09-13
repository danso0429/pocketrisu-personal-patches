'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.join(__dirname, '..')
const manifest = require('../patches/bg-preserve/manifest.cjs')

function exact110Owned(file) {
    const owned = manifest.units.filter(unit => (
        unit.type === 'owned'
        && unit.file === file
        && typeof unit.content === 'string'
    ))
    const targetSpecific = owned.filter(unit => (
        unit.targetVersions?.pocketrisu?.includes('1.10.0')
    ))
    const matches = targetSpecific.length > 0
        ? targetSpecific
        : owned.filter(unit => unit.targetVersions === undefined)
    assert.equal(matches.length, 1, `expected one exact-1.10 owned unit for ${file}`)
    return matches[0].content
}

function sourceBlock(source, startMarker, endMarker) {
    const start = source.indexOf(startMarker)
    const end = source.indexOf(endMarker, start + startMarker.length)
    assert.ok(start >= 0, `missing source marker: ${startMarker}`)
    assert.ok(end > start, `missing source marker: ${endMarker}`)
    return source.slice(start, end)
}

test('C0-F: exact-1.10 server result collapses output stages into one final chat projection', () => {
    const server = exact110Owned('server/node/bgOrchestrator.cjs')
    const response = sourceBlock(server, 'function orchResultResponse(record)', 'function persistOrchResult')
    const persisted = sourceBlock(server, 'function persistOrchResult', '// ── lazy bundle load')

    for (const field of [
        'record.chat',
        'record.staticsMessagesDelta',
        'record.globalChatVariables',
        'record.error',
        'record.postError',
    ]) {
        assert.match(response + persisted, new RegExp(field.replace('.', '\\.')))
    }
    assert.doesNotMatch(response + persisted, new RegExp([
        'providerRaw',
        'nativeEscape',
        'outputTransformTrace',
        'prefillSeed',
        'persistenceCandidate',
        'source_acceptance_observation',
        'bg_server_chat_commit\\.v1',
    ].join('|')))

    const projectedFields = [...new Set(
        [...response.matchAll(/record\.([A-Za-z][A-Za-z0-9]*)/g)].map(match => match[1]),
    )]
    const shared = {
        resultId: 'result-1', operationId: 'operation-1', publishSeq: 1,
        kind: 'terminal-success', outcome: 'success', final: true,
        chat: { id: 'chat-1', message: [{ role: 'char', data: 'same final' }] },
        staticsMessagesDelta: 1, globalChatVariables: {},
        globalChatVariablesDeleted: [], globalChatVariablesExpected: {},
        error: null, postError: null,
    }
    const project = value => Object.fromEntries(projectedFields.map(field => [field, value[field]]))
    assert.deepEqual(
        project({ ...shared, providerRaw: 'raw A', prefillSeed: 'seed A' }),
        project({ ...shared, providerRaw: 'raw B', prefillSeed: 'seed B' }),
    )
})

test('C0-F: exact-1.10 client still owns merge, durable save, and result ACK', () => {
    const client = exact110Owned('src/ts/bgOrchestrate.ts')
    const persist = sourceBlock(
        client,
        'async function persistMergedOrchestrationResult',
        'async function acknowledgeUnmergedResult',
    )

    assert.match(persist, /mergeOrchestrationResult\(charId, chatId, data\)/)
    assert.match(persist, /requestDurableSave\(\{ chat: \[charId, merge\.savedChatId\], root: true \}\)/)
    assert.match(persist, /acknowledgeResultRevision/)
    assert.doesNotMatch(persist, /bg_server_chat_commit\.v1|storedChatId|commitReceiptId|serverOwnedChatCommit/)
})

test('C0-F: durable delivery marker is operation-level rather than message/source ownership', () => {
    const delivery = exact110Owned('src/ts/bgOrchestrationDelivery.ts')
    const interfaceBlock = sourceBlock(
        delivery,
        'export interface DurableOrchestrationDelivery',
        'interface OrderedDeliveryIdentity',
    )
    const fields = [...interfaceBlock.matchAll(/^\s{4}([A-Za-z][A-Za-z0-9]*):/gm)]
        .map(match => match[1])

    assert.deepEqual(fields, [
        'operationId',
        'resultId',
        'publishSeq',
        'deliveryChatId',
        'expectedChatRevision',
        'conflict',
    ])
    assert.match(delivery, /MAX_DURABLE_ORCHESTRATION_DELIVERIES = 128/)
    assert.match(delivery, /findChatDelivery\([\s\S]*operationId: string/)
    assert.doesNotMatch(interfaceBlock, /messageId|sourceRevision|sourceGeneration|authority|acState|automaticBackfill|coverage/)
})

test('C0-F: exact-1.10 has no authoritative chat-state projection endpoint', () => {
    const orchestrator = exact110Owned('server/node/bgOrchestrator.cjs')
    const server = fs.readFileSync(path.join(
        root,
        'patches',
        'lazy-chat-sync',
        'files-1.10',
        'server',
        'node',
        'server.cjs',
    ), 'utf8')

    assert.doesNotMatch(orchestrator + server, /bg-orchestrate-chat-state/)
    assert.doesNotMatch(orchestrator + server, /bg_chat_execution_projection\.v1/)
    assert.doesNotMatch(orchestrator + server, /revision_mismatch[\s\S]*owners/)
})

test('C0-F: result retention leaves no operation-free authoritative owner lookup for a new browser', () => {
    const orchestrator = exact110Owned('server/node/bgOrchestrator.cjs')
    const delivery = exact110Owned('src/ts/bgOrchestrationDelivery.ts')

    assert.match(orchestrator, /sweepOrchestrationResultRetention/)
    assert.match(orchestrator, /resultPrefixes: \[ORCH_RESULT_PREFIX, OPERATION_RESULT_PREFIX\]/)
    assert.match(delivery, /readRootDelivery\([\s\S]*operationId: string/)
    assert.match(delivery, /findChatDelivery\([\s\S]*operationId: string/)
    assert.doesNotMatch(delivery, /export function (?:list|project|lookup)\w*Chat\w*Owner/i)
    assert.doesNotMatch(delivery, /chatRevision:\s*string[\s\S]*coverage:\s*'authoritative'/)
})
