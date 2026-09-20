'use strict'

const fs = require('node:fs')
const http = require('node:http')
const https = require('node:https')
const path = require('node:path')

if (process.env.POCKETRISU_H1_PROCESS_TEST !== '1') {
    throw new Error('The BG server chat process preload is test-only')
}

const targetRoot = path.resolve(process.env.POCKETRISU_H1_TARGET_ROOT || process.cwd())
const fault = process.env.POCKETRISU_H1_FAULT || ''
const crashPoint = process.env.POCKETRISU_H1_CRASH_POINT || ''
const crashMarker = process.env.POCKETRISU_H1_CRASH_MARKER || ''
const operationStatePrefix = 'bg-orch-operation:'
const commitSequenceKey = 'internal/server-chat-commit-sequence/v1'
const commitRecordPrefix = 'internal/server-chat-commit/v1/'

const counters = {
    startRequests: 0,
    providerCalls: 0,
    commitCalls: 0,
    clientSaves: 0,
    resultAcks: 0,
    fallbackProviderCalls: 0,
}
const providerOperations = new Set()
const providerWaiters = []
let releasedProviders = 0

function send(event, detail = {}) {
    if (typeof process.send === 'function' && process.connected) {
        process.send({ scope: 'pocketrisu-h1', event, ...detail })
    }
}

function reportCounters() {
    send('counters', { counters: { ...counters } })
}

function fail(message) {
    const error = new Error(message)
    error.code = 'POCKETRISU_H1_INJECTED_FAILURE'
    throw error
}

function crash(name) {
    if (crashMarker) {
        fs.writeFileSync(crashMarker, `${name}\n`, 'utf8')
    }
    send('crash-point', { name, counters: { ...counters } })
    process.kill(process.pid, 'SIGKILL')
}

function releaseProvider() {
    const next = providerWaiters.shift()
    if (next) next()
    else releasedProviders += 1
}

function waitForProviderRelease() {
    if (releasedProviders > 0) {
        releasedProviders -= 1
        return Promise.resolve()
    }
    return new Promise(resolve => providerWaiters.push(resolve))
}

process.on('message', message => {
    if (!message || message.scope !== 'pocketrisu-h1') return
    if (message.command === 'release-provider') releaseProvider()
    if (message.command === 'read-counters') reportCounters()
})

function requestPath(request) {
    try {
        return new URL(request.url || '/', 'http://127.0.0.1').pathname
    } catch {
        return ''
    }
}

function instrumentServerFactory(owner, key) {
    const original = owner[key]
    owner[key] = function instrumentedCreateServer(...args) {
        const listenerIndex = typeof args[0] === 'function'
            ? 0
            : typeof args[1] === 'function' ? 1 : -1
        if (listenerIndex >= 0) {
            const listener = args[listenerIndex]
            args[listenerIndex] = function instrumentedRequest(request, response) {
                const pathname = requestPath(request)
                if (request.method === 'POST' && pathname === '/api/bg-orchestrate') {
                    counters.startRequests += 1
                }
                if (request.method === 'POST'
                    && /^\/api\/chat-content\/[^/]+\/[^/]+(?:\/patch)?$/.test(pathname)) {
                    counters.clientSaves += 1
                }
                if (request.method === 'DELETE'
                    && pathname.startsWith('/api/bg-orchestrate-result/')) {
                    counters.resultAcks += 1
                }
                return listener(request, response)
            }
        }
        const server = original.apply(this, args)
        const listen = server.listen
        server.listen = function loopbackListen(...listenArgs) {
            const first = listenArgs[0]
            const numericPort = typeof first === 'number'
                || (typeof first === 'string' && /^\d+$/.test(first))
            if (numericPort && (listenArgs.length === 1 || typeof listenArgs[1] === 'function')) {
                listenArgs.splice(1, 0, '127.0.0.1')
            }
            const outcome = listen.apply(this, listenArgs)
            server.once('listening', () => {
                const address = server.address()
                send('ready', {
                    address: typeof address === 'object' && address
                        ? { address: address.address, port: address.port }
                        : address,
                })
            })
            return outcome
        }
        return server
    }
}

instrumentServerFactory(http, 'createServer')
instrumentServerFactory(https, 'createServer')

const commitModulePath = path.join(targetRoot, 'server/node/serverChatCommit.cjs')
const commitModule = require(commitModulePath)
const createServerChatCommitter = commitModule.createServerChatCommitter
commitModule.createServerChatCommitter = function createInstrumentedCommitter(dependencies) {
    const wrapped = { ...dependencies }
    if (fault === 'journal-write') {
        wrapped.journal = {
            ...dependencies.journal,
            writePreparedStage() { fail('injected journal write failure') },
        }
    }
    if (fault === 'canonical-state' || fault === 'metadata-state'
        || fault === 'effect-resolution') {
        const writeCanonicalState = dependencies.writeCanonicalState
        wrapped.writeCanonicalState = value => {
            const result = writeCanonicalState(value)
            if (fault === 'canonical-state' || fault === 'metadata-state') {
                fail('injected canonical metadata state failure')
            }
            return { ...result, promptEffectsResolved: false }
        }
    }
    if (fault === 'operation-state') {
        wrapped.writeCommittedOperationState = () => fail('injected operation state failure')
    }
    if (fault === 'commit-record') {
        const kvSet = dependencies.kvSet
        wrapped.kvSet = (key, value) => {
            if (typeof key === 'string' && key.startsWith(commitRecordPrefix)) {
                fail('injected commit record failure')
            }
            return kvSet(key, value)
        }
    }
    if (fault === 'publication') {
        wrapped.publishCanonicalState = async () => fail('injected publication failure')
    }
    if (crashPoint === 'post-transaction') {
        wrapped.journal = {
            ...dependencies.journal,
            publishPreparedStage() { crash('post-transaction') },
        }
    }
    return createServerChatCommitter(wrapped)
}
require.cache[commitModulePath].exports = commitModule

const ownerModulePath = path.join(targetRoot, 'server/node/serverChatCommitOwner.cjs')
const ownerModule = require(ownerModulePath)
const createServerChatCommitOwner = ownerModule.createServerChatCommitOwner
ownerModule.createServerChatCommitOwner = function createInstrumentedOwner(dependencies) {
    const wrapped = { ...dependencies }
    if (fault === 'commit-sequence') {
        const kvSet = dependencies.kvSet
        wrapped.kvSet = (key, value) => {
            if (key === commitSequenceKey) fail('injected commit sequence failure')
            return kvSet(key, value)
        }
    }
    if (crashPoint === 'result-marker' && dependencies.serverChatInputOwner) {
        const inputOwner = dependencies.serverChatInputOwner
        wrapped.serverChatInputOwner = {
            ...inputOwner,
            markResultPublishedSynchronously() { crash('result-marker') },
        }
    }
    return createServerChatCommitOwner(wrapped)
}
require.cache[ownerModulePath].exports = ownerModule

const orchestratorPath = path.join(targetRoot, 'server/node/bgOrchestrator.cjs')
const registerBgOrchestrator = require(orchestratorPath)
require.cache[orchestratorPath].exports = function registerInstrumentedOrchestrator(app, dependencies) {
    const inputOwner = dependencies.serverChatInputOwner
    const commitOwner = dependencies.serverChatCommitOwner
    const wrappedCommitOwner = commitOwner && {
        ...commitOwner,
        async commitGenerationResult(value) {
            counters.commitCalls += 1
            send('commit-call', { counters: { ...counters } })
            try {
                const outcome = await commitOwner.commitGenerationResult(value)
                send('commit-result', {
                    status: outcome?.status || null,
                    publication: outcome?.publication || null,
                    receipt: outcome?.receipt || null,
                    counters: { ...counters },
                })
                return outcome
            } catch (error) {
                const settings = typeof inputOwner?.settingsSnapshotStats === 'function'
                    ? inputOwner.settingsSnapshotStats()
                    : null
                send('commit-error', {
                    code: error?.code || null,
                    message: String(error?.message || error),
                    settings,
                    counters: { ...counters },
                })
                throw error
            }
        },
    }

    async function runServerPreview(
        _dependencies,
        _charId,
        _chatId,
        previewChat,
        _mode,
        control,
    ) {
        const settingsSnapshot = control.readInputSettingsSnapshot()
        const transform = await control.beginInputTransform()
        const command = transform.record.admission
        const inputChat = {
            ...previewChat,
            message: [
                ...previewChat.message,
                {
                    role: 'user',
                    data: command.rawText,
                    chatId: command.userMessageId,
                    time: command.submittedAt,
                    name: null,
                },
            ],
        }
        const attached = await control.attachInputTransform({
            chat: inputChat,
            globalIntent: { changed: {}, deleted: [], expected: {} },
        })
        control.onInputCommitted(attached.record)
        send('provider-waiting', {
            operationId: attached.record.operationId,
            settingsContexts: typeof inputOwner?.settingsSnapshotStats === 'function'
                ? inputOwner.settingsSnapshotStats()
                : null,
            counters: { ...counters },
        })
        await waitForProviderRelease()
        control.onProviderStart?.()
        counters.providerCalls += 1
        const operationId = attached.record.operationId
        if (providerOperations.has(operationId)) counters.fallbackProviderCalls += 1
        providerOperations.add(operationId)
        send('provider-finished', { operationId, counters: { ...counters } })
        return {
            chat: {
                ...inputChat,
                message: [
                    ...inputChat.message,
                    {
                        role: 'char',
                        data: `answer:${command.rawText}`,
                        chatId: `assistant-${operationId}`,
                    },
                ],
            },
            staticsMessagesDelta: 1,
            globalChatVariables: {},
            globalChatVariablesDeleted: [],
            globalChatVariablesExpected: {},
            settingsDigest: settingsSnapshot.contextDigest,
            threw: null,
        }
    }

    send('orchestrator-registered')
    return registerBgOrchestrator(app, {
        ...dependencies,
        ...(wrappedCommitOwner ? { serverChatCommitOwner: wrappedCommitOwner } : {}),
        runServerPreview,
    })
}

process.on('uncaughtException', error => {
    send('uncaught', { message: String(error?.stack || error) })
    throw error
})

process.on('exit', () => {
    reportCounters()
})
