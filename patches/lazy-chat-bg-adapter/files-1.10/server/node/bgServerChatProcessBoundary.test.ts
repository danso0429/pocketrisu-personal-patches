import { fork, spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { compare } from 'fast-json-patch'
import { mergeBrowserMessageEffects } from '../../src/ts/bgBrowserMessageEffects'
import { mergeThreeWayValue } from '../../src/ts/storage/conflictRebase'

type H1Message = {
    scope?: string
    event?: string
    [key: string]: any
}

type WatchedChild = {
    child: ChildProcess
    messages: H1Message[]
    stdout: string[]
    stderr: string[]
    waitFor: (
        event: string,
        predicate?: (message: H1Message) => boolean,
        after?: number,
    ) => Promise<H1Message>
}

type ServerHarness = WatchedChild & {
    baseURL: string
    runtimeRoot: string
    token: string
    cookie: string
}

const currentFile = fileURLToPath(import.meta.url)
const serverDir = path.dirname(currentFile)
const targetRoot = path.resolve(serverDir, '../..')
const require = createRequire(import.meta.url)
const { calculateHash, decodeRisuSave, encodeRisuSaveLegacy } = require('./utils.cjs') as {
    calculateHash: (data: unknown) => number
    decodeRisuSave: (bytes: Uint8Array) => Promise<any>
    encodeRisuSaveLegacy: (data: unknown) => Buffer
}
const preloadPath = path.join(serverDir, 'bgServerChatProcessPreload.cjs')
const clientPath = path.join(serverDir, 'bgServerChatProcessClient.cjs')
const password = 'h1-process-password'
const children = new Set<ChildProcess>()
const runtimeRoots = new Set<string>()

const baseChat = {
    id: 'chat-1',
    name: 'Chat',
    message: [{ role: 'user', data: 'hello', chatId: 'user-1' }],
}

function waitTimeout<T>(promise: Promise<T>, label: string, timeoutMS = 15_000): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), timeoutMS)
        promise.then(
            value => { clearTimeout(timer); resolve(value) },
            error => { clearTimeout(timer); reject(error) },
        )
    })
}

function watchChild(child: ChildProcess): WatchedChild {
    children.add(child)
    const messages: H1Message[] = []
    const stdout: string[] = []
    const stderr: string[] = []
    const waiters = new Set<{
        event: string
        predicate: (message: H1Message) => boolean
        after: number
        resolve: (message: H1Message) => void
    }>()
    child.stdout?.on('data', value => stdout.push(String(value)))
    child.stderr?.on('data', value => stderr.push(String(value)))
    child.on('message', (value: H1Message) => {
        messages.push(value)
        const index = messages.length - 1
        for (const waiter of [...waiters]) {
            if (index >= waiter.after && value?.event === waiter.event && waiter.predicate(value)) {
                waiters.delete(waiter)
                waiter.resolve(value)
            }
        }
    })
    child.once('exit', () => children.delete(child))
    const waitFor = (
        event: string,
        predicate: (message: H1Message) => boolean = () => true,
        after = 0,
    ) => {
        for (let index = after; index < messages.length; index += 1) {
            const message = messages[index]
            if (message?.event === event && predicate(message)) return Promise.resolve(message)
        }
        return waitTimeout(new Promise<H1Message>(resolve => {
            waiters.add({ event, predicate, after, resolve })
        }), `${event}; stdout=${stdout.join('')}; stderr=${stderr.join('')}`)
    }
    return { child, messages, stdout, stderr, waitFor }
}

async function reservePort() {
    const server = createServer()
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Could not reserve a loopback port')
    const port = address.port
    await new Promise<void>((resolve, reject) => server.close(error => (
        error ? reject(error) : resolve()
    )))
    return port
}

function makeRuntimeRoot() {
    const root = mkdtempSync(path.join(tmpdir(), 'pocketrisu-h1-process-'))
    runtimeRoots.add(root)
    mkdirSync(path.join(root, 'dist'), { recursive: true })
    writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify({ name: 'pocketrisu', version: '1.10.0' }),
        'utf8',
    )
    return root
}

function fixtureDatabase() {
    return {
        characters: [{
            chaId: 'char-1',
            name: 'Character',
            chats: [baseChat],
        }],
        globalChatVariables: {},
        statics: { messages: 10 },
        botPresets: [],
        botPresetsId: 0,
        plugins: [],
    }
}

async function runWorkerCommand(message: Record<string, unknown>) {
    const child = fork(clientPath, [], {
        cwd: message.runtimeRoot as string || targetRoot,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    })
    const watched = watchChild(child)
    child.send({ scope: 'pocketrisu-h1-client', ...message })
    const expected = message.command === 'seed'
        ? 'seeded'
        : message.command === 'expire' ? 'expired' : 'response'
    const response = await watched.waitFor(expected)
    const [code, signal] = await once(child, 'exit') as [number | null, NodeJS.Signals | null]
    if (code !== 0 || signal) {
        throw new Error(
            `H1 worker failed: code=${code} signal=${signal}; stderr=${watched.stderr.join('')}`,
        )
    }
    return response
}

async function seedRuntime(runtimeRoot: string) {
    await runWorkerCommand({
        command: 'seed',
        runtimeRoot,
        targetRoot,
        password,
        databaseBase64: Buffer.from(JSON.stringify(fixtureDatabase()), 'utf8').toString('base64'),
    })
}

async function login(baseURL: string, sessionID: string) {
    const loginResponse = await fetch(`${baseURL}/api/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
    })
    expect(loginResponse.status).toBe(200)
    const token = (await loginResponse.json() as any).token
    expect(typeof token).toBe('string')
    const sessionResponse = await fetch(`${baseURL}/api/session`, {
        method: 'POST',
        headers: { 'risu-auth': token, 'x-session-id': sessionID },
    })
    expect(sessionResponse.status).toBe(200)
    const setCookie = sessionResponse.headers.get('set-cookie') || ''
    const cookie = setCookie.split(';', 1)[0]
    expect(cookie).toMatch(/^risu-session=/)
    return { token, cookie }
}

async function startServer(
    runtimeRoot: string,
    options: { fault?: string, crashPoint?: string, crashMarker?: string } = {},
): Promise<ServerHarness> {
    const port = await reservePort()
    const child = fork(path.join(targetRoot, 'server/node/server.cjs'), [], {
        cwd: runtimeRoot,
        execArgv: ['--require', preloadPath],
        env: {
            ...process.env,
            PORT: String(port),
            POCKETRISU_H1_PROCESS_TEST: '1',
            POCKETRISU_H1_TARGET_ROOT: targetRoot,
            POCKETRISU_H1_FAULT: options.fault || '',
            POCKETRISU_H1_CRASH_POINT: options.crashPoint || '',
            POCKETRISU_H1_CRASH_MARKER: options.crashMarker || '',
            TUNNEL_DISABLED: '1',
            UPDATE_CHECK_DISABLED: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    })
    const watched = watchChild(child)
    await watched.waitFor('ready')
    const baseURL = `http://127.0.0.1:${port}`
    const credentials = await login(baseURL, `h1-${Date.now()}-${Math.random()}`)
    return { ...watched, baseURL, runtimeRoot, ...credentials }
}

async function stopChild(child: ChildProcess, signal: NodeJS.Signals = 'SIGTERM') {
    if (child.exitCode !== null || child.signalCode !== null) return
    const exited = once(child, 'exit')
    child.kill(signal)
    await waitTimeout(exited, `child exit after ${signal}`)
}

async function readChat(server: ServerHarness) {
    const response = await fetch(`${server.baseURL}/api/chat-content/char-1/0`, {
        headers: {
            'risu-auth': server.token,
            'x-chat-id': 'chat-1',
        },
    })
    expect(response.status).toBe(200)
    const revision = response.headers.get('x-chat-revision')
    expect(revision).toMatch(/^[0-9a-f]{64}$/)
    const chat = await decodeRisuSave(new Uint8Array(await response.arrayBuffer()))
    return { chat, revision: revision as string }
}

function inputBody(operationId: string, baseChatRevision: string, rawText = 'next input') {
    return {
        detached: true,
        selectedCharId: 'char-1',
        selectedChatId: 'chat-1',
        currentChat: {
            ...baseChat,
            message: [{ role: 'user', data: 'spoofed', chatId: 'user-spoofed' }],
        },
        operationId,
        baseChatRevision,
        resultKeyVersion: 1,
        resultOrderVersion: 1,
        startAckVersion: 1,
        serverChatCommitVersion: 1,
        inputCommandVersion: 1,
        inputCommand: {
            inputCommandId: `input-${operationId}`,
            userMessageId: `user-${operationId}`,
            rawText,
            settingsSnapshotRef: 'client-spoofed-settings-ref',
            submittedAt: 1_700_000_000_000,
        },
    }
}

async function submitFromDisposableClient(
    server: ServerHarness,
    body: Record<string, unknown>,
) {
    return runWorkerCommand({
        command: 'submit',
        runtimeRoot: server.runtimeRoot,
        baseURL: server.baseURL,
        cookie: server.cookie,
        body,
    })
}

async function expireShortLivedState(runtimeRoot: string, operationId: string) {
    return runWorkerCommand({
        command: 'expire',
        runtimeRoot,
        targetRoot,
        operationId,
    })
}

async function bgGet(server: ServerHarness, pathname: string) {
    return fetch(`${server.baseURL}${pathname}`, { headers: { cookie: server.cookie } })
}

async function readResult(server: ServerHarness, operationId: string) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        const response = await bgGet(
            server,
            `/api/bg-orchestrate-result/${operationId}`
            + '?charId=char-1&chatId=chat-1&consumerId=h1-process-observer',
        )
        if (response.status === 200) return response.json()
        await new Promise(resolve => setTimeout(resolve, 10))
    }
    throw new Error(`Result did not become readable for ${operationId}`)
}

async function readStatus(server: ServerHarness, operationId: string) {
    const response = await bgGet(
        server,
        `/api/bg-orchestrate-status/${operationId}?charId=char-1&chatId=chat-1`,
    )
    return { status: response.status, body: await response.json() }
}

async function readProjection(server: ServerHarness, revision: string) {
    const response = await bgGet(
        server,
        `/api/bg-orchestrate-chat-state/char-1/chat-1?revision=${encodeURIComponent(revision)}`,
    )
    expect(response.status).toBe(200)
    return response.json()
}

async function readCounters(server: ServerHarness) {
    const after = server.messages.length
    server.child.send({ scope: 'pocketrisu-h1', command: 'read-counters' })
    return (await server.waitFor('counters', () => true, after)).counters
}

async function runBlankClientProcess(
    server: ServerHarness,
    expectedRevision: string,
) {
    const vitest = path.join(targetRoot, 'node_modules/vitest/vitest.mjs')
    const clientTest = 'src/ts/storage/bgServerChatProcessAdoption.test.ts'
    const child = spawn(process.execPath, [vitest, 'run', clientTest], {
        cwd: targetRoot,
        env: {
            ...process.env,
            POCKETRISU_H1_CLIENT_TEST: '1',
            POCKETRISU_H1_BASE_URL: server.baseURL,
            POCKETRISU_H1_TOKEN: server.token,
            POCKETRISU_H1_EXPECTED_REVISION: expectedRevision,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', value => { stdout += String(value) })
    child.stderr.on('data', value => { stderr += String(value) })
    const [code, signal] = await waitTimeout(
        once(child, 'exit') as Promise<[number | null, NodeJS.Signals | null]>,
        'blank-client process',
    )
    if (code !== 0 || signal) {
        throw new Error(`Blank client failed: code=${code} signal=${signal}\n${stdout}\n${stderr}`)
    }
    return { stdout, stderr }
}

afterEach(async () => {
    for (const child of [...children]) {
        await stopChild(child).catch(() => undefined)
    }
    for (const root of runtimeRoots) rmSync(root, { recursive: true, force: true })
    runtimeRoots.clear()
})

describe('server chat composed process boundary', () => {
    it('continues one AC-off turn after the initiating process exits and supports blank-client adoption', async () => {
        const runtimeRoot = makeRuntimeRoot()
        await seedRuntime(runtimeRoot)
        const server = await startServer(runtimeRoot)
        const capabilities = await bgGet(server, '/api/bg-orchestrate-capabilities')
        expect(capabilities.status).toBe(200)
        await expect(capabilities.json()).resolves.toMatchObject({
            inputCommandVersion: 0,
            inputCommandFoundationVersion: 4,
            serverChatCommitVersion: 1,
        })
        const initial = await readChat(server)
        const operationId = 'operation-h1-process-success-1'
        const response = await submitFromDisposableClient(
            server,
            inputBody(operationId, initial.revision),
        )
        expect(response).toMatchObject({
            status: 200,
            body: {
                handled: true,
                started: true,
                operationId,
                serverChatCommitVersion: 1,
                inputCommandVersion: 1,
            },
        })
        const waiting = await server.waitFor('provider-waiting')
        expect(waiting.counters).toMatchObject({ providerCalls: 0, commitCalls: 0 })

        server.child.send({ scope: 'pocketrisu-h1', command: 'release-provider' })
        const committed = await server.waitFor('commit-result', message => message.status === 'committed')
        expect(committed.counters).toMatchObject({ providerCalls: 1, commitCalls: 1 })

        const result = await readResult(server, operationId)
        expect(result).toMatchObject({
            found: true,
            operationId,
            serverChatCommitVersion: 1,
            serverChatCommit: {
                status: 'committed',
                receipt: { acOwner: 'disabled', acState: 'disabled' },
            },
        })
        const storedRevision = result.serverChatCommit.receipt.storedRevision
        const projection = await readProjection(server, storedRevision)
        expect(projection).toMatchObject({
            found: true,
            coverage: 'authoritative',
            owners: [{ operationId }],
        })
        const stored = await readChat(server)
        expect(stored.revision).toBe(storedRevision)
        expect(stored.chat.message).toMatchObject([
            { chatId: 'user-1' },
            { chatId: `user-${operationId}` },
            { chatId: `assistant-${operationId}` },
        ])

        const blankClient = await runBlankClientProcess(server, storedRevision)
        expect(blankClient.stdout).toContain('2 passed')

        await expireShortLivedState(runtimeRoot, operationId)
        const rediscovered = await readResult(server, operationId)
        expect(rediscovered).toMatchObject({
            found: false,
            operationId,
            serverChatCommitVersion: 1,
            operationState: 'input-completed',
            serverChatCommit: { operationId, chatCommitted: true },
        })
        expect(await readProjection(server, storedRevision)).toMatchObject({
            found: true,
            coverage: 'authoritative',
            owners: [{ operationId }],
        })
        const expiredBlankClient = await runBlankClientProcess(server, storedRevision)
        expect(expiredBlankClient.stdout).toContain('2 passed')

        expect(await readCounters(server)).toEqual({
            startRequests: 1,
            providerCalls: 1,
            commitCalls: 1,
            clientSaves: 0,
            resultAcks: 0,
            fallbackProviderCalls: 0,
        })
    }, 30_000)

    it('restores an attached input after restart without replaying a provider', async () => {
        const runtimeRoot = makeRuntimeRoot()
        await seedRuntime(runtimeRoot)
        const first = await startServer(runtimeRoot)
        const initial = await readChat(first)
        const operationId = 'operation-h1-input-restart-1'
        await submitFromDisposableClient(first, inputBody(operationId, initial.revision))
        await first.waitFor('provider-waiting')
        await stopChild(first.child, 'SIGKILL')

        const restarted = await startServer(runtimeRoot)
        const stored = await readChat(restarted)
        expect(stored.chat.message).toMatchObject([
            { chatId: 'user-1' },
            { chatId: `user-${operationId}` },
        ])
        expect(stored.chat.message).toHaveLength(2)
        const status = await readStatus(restarted, operationId)
        expect(status).toMatchObject({
            status: 200,
            body: {
                accepted: true,
                operationId,
                state: 'input-execution-unknown',
                serverChatCommitVersion: 1,
            },
        })
        expect(await readCounters(restarted)).toMatchObject({
            providerCalls: 0,
            commitCalls: 0,
            clientSaves: 0,
            resultAcks: 0,
        })
    }, 30_000)

    it.each([
        'journal-write',
        'commit-sequence',
        'metadata-state',
        'effect-resolution',
        'operation-state',
        'commit-record',
    ])('rolls back the complete durable transaction after %s failure', async fault => {
        const runtimeRoot = makeRuntimeRoot()
        await seedRuntime(runtimeRoot)
        const server = await startServer(runtimeRoot, { fault })
        const initial = await readChat(server)
        const operationId = `operation-h1-fault-${fault}`
        await submitFromDisposableClient(server, inputBody(operationId, initial.revision, fault))
        await server.waitFor('provider-waiting')
        server.child.send({ scope: 'pocketrisu-h1', command: 'release-provider' })
        const failure = await server.waitFor('commit-error')
        expect(failure.settings).toMatchObject({ contexts: 1 })
        const result = await readResult(server, operationId)
        expect(result).toMatchObject({
            found: true,
            operationId,
            serverChatCommitVersion: 1,
            serverChatCommit: { status: 'failed' },
        })
        const stored = await readChat(server)
        expect(stored.chat.message).toMatchObject([
            { chatId: 'user-1' },
            { chatId: `user-${operationId}` },
        ])
        expect(stored.chat.message).toHaveLength(2)
        const counters = await readCounters(server)
        expect(counters).toMatchObject({
            providerCalls: 1,
            commitCalls: 1,
            clientSaves: 0,
            resultAcks: 0,
            fallbackProviderCalls: 0,
        })
    }, 30_000)

    it.each(['post-transaction', 'result-marker'])(
        'recovers without provider or commit replay after the %s crash boundary',
        async crashPoint => {
            const runtimeRoot = makeRuntimeRoot()
            await seedRuntime(runtimeRoot)
            const marker = path.join(runtimeRoot, `${crashPoint}.marker`)
            const first = await startServer(runtimeRoot, { crashPoint, crashMarker: marker })
            const initial = await readChat(first)
            const operationId = `operation-h1-crash-${crashPoint}`
            await submitFromDisposableClient(first, inputBody(operationId, initial.revision, crashPoint))
            await first.waitFor('provider-waiting')
            first.child.send({ scope: 'pocketrisu-h1', command: 'release-provider' })
            await waitTimeout(once(first.child, 'exit'), `${crashPoint} child crash`)
            expect(readFileSync(marker, 'utf8').trim()).toBe(crashPoint)

            const restarted = await startServer(runtimeRoot)
            const status = await readStatus(restarted, operationId)
            expect(status).toMatchObject({
                status: 200,
                body: { accepted: true, state: 'chat-committed' },
            })
            const stored = await readChat(restarted)
            expect(stored.chat.message).toMatchObject([
                { chatId: 'user-1' },
                { chatId: `user-${operationId}` },
                { chatId: `assistant-${operationId}` },
            ])
            expect(await readCounters(restarted)).toMatchObject({
                providerCalls: 0,
                commitCalls: 0,
                clientSaves: 0,
                resultAcks: 0,
            })
        },
        30_000,
    )

    it('automatically drains N+1 after N without a second client request and keeps a third command fail-closed', async () => {
        const runtimeRoot = makeRuntimeRoot()
        await seedRuntime(runtimeRoot)
        const first = await startServer(runtimeRoot)
        const initial = await readChat(first)
        const operationN = 'operation-h1-causal-n-1'
        const operationN1 = 'operation-h1-causal-n1-1'
        const operationN2 = 'operation-h1-causal-n2-1'
        const bodyN = inputBody(operationN, initial.revision, 'input N')

        expect(await submitFromDisposableClient(first, bodyN)).toMatchObject({
            status: 200,
            body: { handled: true, started: true, operationId: operationN },
        })
        await first.waitFor('provider-waiting', message => message.operationId === operationN)
        const inputNRevision = (await readChat(first)).revision
        const bodyN1 = inputBody(operationN1, inputNRevision, 'input N+1')
        const bodyN2 = inputBody(operationN2, inputNRevision, 'input N+2')
        expect(await submitFromDisposableClient(first, bodyN1)).toMatchObject({
            status: 202,
            body: {
                handled: true,
                started: false,
                accepted: true,
                operationId: operationN1,
                state: 'input-waiting-predecessor',
                predecessorOperationId: operationN,
            },
        })
        const third = await submitFromDisposableClient(first, bodyN2)
        expect(third.status).toBe(409)
        expect(third.body).toMatchObject({ handled: false, started: false, operationId: operationN2 })

        first.child.send({ scope: 'pocketrisu-h1', command: 'release-provider' })
        await first.waitFor(
            'commit-result',
            message => message.status === 'committed'
                && message.receipt?.operationId === operationN,
        )
        await readResult(first, operationN)
        await first.waitFor('provider-waiting', message => message.operationId === operationN1)
        await stopChild(first.child, 'SIGKILL')

        const restarted = await startServer(runtimeRoot)
        const stored = await readChat(restarted)
        expect(stored.chat.message).toMatchObject([
            { chatId: 'user-1' },
            { chatId: `user-${operationN}` },
            { chatId: `assistant-${operationN}` },
            { chatId: `user-${operationN1}` },
        ])
        expect(stored.chat.message).toHaveLength(4)
        expect(await readStatus(restarted, operationN1)).toMatchObject({
            status: 200,
            body: { accepted: true, operationId: operationN1, state: 'input-execution-unknown' },
        })
        expect(await readCounters(restarted)).toMatchObject({
            providerCalls: 0,
            commitCalls: 0,
            fallbackProviderCalls: 0,
            clientSaves: 0,
            resultAcks: 0,
        })
    }, 30_000)

    it('retains a predecessor-effect mismatch as blocked without paying for N+1', async () => {
        const runtimeRoot = makeRuntimeRoot()
        await seedRuntime(runtimeRoot)
        const server = await startServer(runtimeRoot, { fault: 'effect-lineage' })
        const initial = await readChat(server)
        const operationN = 'operation-h1-effect-n-1'
        const operationN1 = 'operation-h1-effect-n1-1'
        expect(await submitFromDisposableClient(
            server, inputBody(operationN, initial.revision, 'input N'),
        )).toMatchObject({ status: 200, body: { started: true } })
        await server.waitFor('provider-waiting', message => message.operationId === operationN)
        const inputNRevision = (await readChat(server)).revision
        expect(await submitFromDisposableClient(
            server, inputBody(operationN1, inputNRevision, 'input N+1'),
        )).toMatchObject({ status: 202, body: { accepted: true, started: false } })

        server.child.send({ scope: 'pocketrisu-h1', command: 'release-provider' })
        await server.waitFor('commit-result', message => (
            message.status === 'committed' && message.receipt?.operationId === operationN
        ))
        let status: Awaited<ReturnType<typeof readStatus>> | null = null
        for (let attempt = 0; attempt < 100; attempt += 1) {
            status = await readStatus(server, operationN1)
            if (status.body?.state === 'input-blocked_edit') break
            await new Promise(resolve => setTimeout(resolve, 20))
        }
        expect(status).toMatchObject({
            status: 200,
            body: { accepted: true, state: 'input-blocked_edit' },
        })
        expect(await readCounters(server)).toMatchObject({
            providerCalls: 1,
            commitCalls: 1,
            fallbackProviderCalls: 0,
            clientSaves: 0,
        })
        const stored = await readChat(server)
        expect(stored.chat.message).toHaveLength(3)
    }, 30_000)

    it('rejects a second operation for the same shared draft identity', async () => {
        const runtimeRoot = makeRuntimeRoot()
        await seedRuntime(runtimeRoot)
        const server = await startServer(runtimeRoot)
        const initial = await readChat(server)
        const firstOperation = 'operation-h1-shared-draft-first-1'
        const first = inputBody(firstOperation, initial.revision, 'same saved draft')
        first.inputCommand.inputCommandId = 'draft-shared-across-tabs-1'
        expect(await submitFromDisposableClient(server, first)).toMatchObject({
            status: 200, body: { started: true },
        })
        await server.waitFor('provider-waiting', message => (
            message.operationId === firstOperation
        ))
        const attachedRevision = (await readChat(server)).revision
        expect(attachedRevision).not.toBe(initial.revision)
        const second = inputBody(
            'operation-h1-shared-draft-second-1', initial.revision, 'same saved draft',
        )
        second.inputCommand.inputCommandId = first.inputCommand.inputCommandId
        const duplicate = await submitFromDisposableClient(server, second)
        expect(duplicate.status).toBe(409)
        expect(duplicate.body).toMatchObject({
            reason: 'input_command_identity_conflict',
            existingOperationId: firstOperation,
        })
        expect(await readCounters(server)).toMatchObject({
            providerCalls: 0, commitCalls: 0, fallbackProviderCalls: 0,
        })
        server.child.send({ scope: 'pocketrisu-h1', command: 'release-provider' })
        await server.waitFor('commit-result', message => (
            message.status === 'committed' && message.receipt?.operationId === firstOperation
        ))
        expect(await readCounters(server)).toMatchObject({
            providerCalls: 1, commitCalls: 1, fallbackProviderCalls: 0,
        })
        expect((await readChat(server)).chat.message).toHaveLength(3)
    }, 30_000)

    it('rejects a validator-free stale database after a server chat commit', async () => {
        const runtimeRoot = makeRuntimeRoot()
        await seedRuntime(runtimeRoot)
        const server = await startServer(runtimeRoot)
        const databaseKey = Buffer.from('database/database.bin', 'utf8').toString('hex')
        const beforeResponse = await fetch(`${server.baseURL}/api/read`, {
            headers: { 'risu-auth': server.token, 'file-path': databaseKey },
        })
        expect(beforeResponse.status).toBe(200)
        const staleDatabase = await decodeRisuSave(
            new Uint8Array(await beforeResponse.arrayBuffer()),
        )
        const initial = await readChat(server)
        const operationId = 'operation-h1-stale-root-fence-n-1'
        expect(await submitFromDisposableClient(
            server, inputBody(operationId, initial.revision, 'input N'),
        )).toMatchObject({ status: 200, body: { started: true } })
        await server.waitFor('provider-waiting', message => message.operationId === operationId)
        server.child.send({ scope: 'pocketrisu-h1', command: 'release-provider' })
        await server.waitFor('commit-result', message => (
            message.status === 'committed' && message.receipt?.operationId === operationId
        ))
        const write = await fetch(`${server.baseURL}/api/write`, {
            method: 'POST',
            headers: {
                'risu-auth': server.token,
                cookie: server.cookie,
                'content-type': 'application/octet-stream',
                'file-path': databaseKey,
            },
            body: encodeRisuSaveLegacy(staleDatabase),
        })
        expect(write.status).toBe(428)
        expect(await write.json()).toMatchObject({
            code: 'BG_SERVER_EFFECT_REVISION_REQUIRED',
        })
        const rootResponse = await fetch(`${server.baseURL}/api/read`, {
            headers: { 'risu-auth': server.token, 'file-path': databaseKey },
        })
        expect(rootResponse.status).toBe(200)
        const stored = await decodeRisuSave(new Uint8Array(await rootResponse.arrayBuffer()))
        expect(stored.statics.messages).toBe(11)
        expect(stored.statics.bgOrchestrationApplied).toEqual([
            { operationId, cumulative: 1 },
        ])
    }, 30_000)

    it('keeps validator-free creation available for a truly absent database', async () => {
        const runtimeRoot = makeRuntimeRoot()
        await seedRuntime(runtimeRoot)
        const server = await startServer(runtimeRoot)
        const databaseKey = Buffer.from('database/database.bin', 'utf8').toString('hex')
        const headers = {
            'risu-auth': server.token,
            cookie: server.cookie,
            'file-path': databaseKey,
        }
        const removed = await fetch(`${server.baseURL}/api/remove`, { headers })
        expect(removed.status).toBe(200)
        const created = await fetch(`${server.baseURL}/api/write`, {
            method: 'POST',
            headers: { ...headers, 'content-type': 'application/octet-stream' },
            body: encodeRisuSaveLegacy({}),
        })
        expect(created.status).toBe(200)
        const read = await fetch(`${server.baseURL}/api/read`, { headers })
        expect(read.status).toBe(200)
        expect(await decodeRisuSave(new Uint8Array(await read.arrayBuffer())))
            .toMatchObject({ characters: [] })
    }, 30_000)

    it('rejects a validator-free stale database after a browser statistic effect', async () => {
        const runtimeRoot = makeRuntimeRoot()
        await seedRuntime(runtimeRoot)
        const server = await startServer(runtimeRoot)
        const databaseKey = Buffer.from('database/database.bin', 'utf8').toString('hex')
        const headers = {
            'risu-auth': server.token,
            cookie: server.cookie,
            'file-path': databaseKey,
        }
        const readRoot = async () => {
            const response = await fetch(`${server.baseURL}/api/read`, { headers })
            expect(response.status).toBe(200)
            return await decodeRisuSave(new Uint8Array(await response.arrayBuffer()))
        }
        const baseline = await readRoot()
        const withEffect = structuredClone(baseline)
        withEffect.statics.messages += 1
        withEffect.statics.browserMessageEffects = [{
            id: 'browser-attempt-no-validator-1', delta: 1, createdAt: Date.now(),
        }]
        const accepted = await fetch(`${server.baseURL}/api/write`, {
            method: 'POST',
            headers: { ...headers, 'content-type': 'application/octet-stream' },
            body: encodeRisuSaveLegacy(withEffect),
        })
        expect(accepted.status).toBe(200)
        const stale = await fetch(`${server.baseURL}/api/write`, {
            method: 'POST',
            headers: { ...headers, 'content-type': 'application/octet-stream' },
            body: encodeRisuSaveLegacy(baseline),
        })
        expect(stale.status).toBe(428)
        expect(await stale.json()).toMatchObject({
            code: 'BG_SERVER_EFFECT_REVISION_REQUIRED',
        })
        const stored = await readRoot()
        expect(stored.statics.messages).toBe(baseline.statics.messages + 1)
        expect(stored.statics.browserMessageEffects)
            .toEqual(withEffect.statics.browserMessageEffects)
    }, 30_000)

    it('preserves a distinct browser statistic effect after N commits first', async () => {
        const runtimeRoot = makeRuntimeRoot()
        await seedRuntime(runtimeRoot)
        const server = await startServer(runtimeRoot)
        const databaseKey = Buffer.from('database/database.bin', 'utf8').toString('hex')
        const readRoot = async () => {
            const response = await fetch(`${server.baseURL}/api/read`, {
                headers: { 'risu-auth': server.token, 'file-path': databaseKey },
            })
            expect(response.status).toBe(200)
            return await decodeRisuSave(new Uint8Array(await response.arrayBuffer()))
        }
        const patchRoot = async (expectedHash: string, patch: unknown[]) => {
            const response = await fetch(`${server.baseURL}/api/patch`, {
                method: 'POST',
                headers: {
                    'risu-auth': server.token,
                    cookie: server.cookie,
                    'content-type': 'application/json',
                    'file-path': databaseKey,
                },
                body: JSON.stringify({ expectedHash, patch }),
            })
            return response.status
        }
        const baseline = await readRoot()
        const local = structuredClone(baseline)
        local.statics.messages += 1
        local.statics.browserMessageEffects = [{
            id: 'browser-attempt-1', delta: 1, createdAt: Date.now(),
        }]
        const initial = await readChat(server)
        const operationId = 'operation-h1-browser-stat-n-1'
        expect(await submitFromDisposableClient(
            server, inputBody(operationId, initial.revision, 'input N'),
        )).toMatchObject({ status: 200, body: { started: true } })
        await server.waitFor('provider-waiting', message => message.operationId === operationId)
        server.child.send({ scope: 'pocketrisu-h1', command: 'release-provider' })
        await server.waitFor('commit-result', message => (
            message.status === 'committed' && message.receipt?.operationId === operationId
        ))
        const remote = await readRoot()
        expect(remote.statics.messages).toBe(11)
        expect(await patchRoot(
            calculateHash(baseline).toString(16), compare(baseline, local),
        )).toBe(409)
        const merged = mergeThreeWayValue(baseline, local, remote)
        mergeBrowserMessageEffects(baseline, local, remote, merged)
        expect(merged.statics.messages).toBe(12)
        expect(await patchRoot(
            calculateHash(remote).toString(16), compare(remote, merged),
        )).toBe(200)
        const stored = await readRoot()
        expect(stored.statics.messages).toBe(12)
        expect(stored.statics.browserMessageEffects)
            .toEqual(local.statics.browserMessageEffects)
        expect(stored.statics.bgOrchestrationApplied).toEqual([
            { operationId, cumulative: 1 },
        ])
    }, 30_000)

    it('does not count an already accepted browser effect again after a lost save response', async () => {
        const runtimeRoot = makeRuntimeRoot()
        await seedRuntime(runtimeRoot)
        const server = await startServer(runtimeRoot)
        const databaseKey = Buffer.from('database/database.bin', 'utf8').toString('hex')
        const headers = {
            'risu-auth': server.token,
            cookie: server.cookie,
            'content-type': 'application/json',
            'file-path': databaseKey,
        }
        const readRoot = async () => {
            const response = await fetch(`${server.baseURL}/api/read`, {
                headers: { 'risu-auth': server.token, 'file-path': databaseKey },
            })
            expect(response.status).toBe(200)
            return await decodeRisuSave(new Uint8Array(await response.arrayBuffer()))
        }
        const patchRoot = async (expectedHash: string, patch: unknown[]) => {
            const response = await fetch(`${server.baseURL}/api/patch`, {
                method: 'POST', headers,
                body: JSON.stringify({ expectedHash, patch }),
            })
            return response.status
        }
        const baseline = await readRoot()
        const local = structuredClone(baseline)
        local.statics.messages += 1
        local.statics.browserMessageEffects = [{
            id: 'browser-attempt-lost-1', delta: 1, createdAt: Date.now(),
        }]
        expect(await patchRoot(
            calculateHash(baseline).toString(16), compare(baseline, local),
        )).toBe(200)
        // The client did not observe the success response and keeps its old baseline.
        const initial = await readChat(server)
        const operationId = 'operation-h1-browser-lost-n-1'
        expect(await submitFromDisposableClient(
            server, inputBody(operationId, initial.revision, 'input N'),
        )).toMatchObject({ status: 200, body: { started: true } })
        await server.waitFor('provider-waiting', message => message.operationId === operationId)
        server.child.send({ scope: 'pocketrisu-h1', command: 'release-provider' })
        await server.waitFor('commit-result', message => (
            message.status === 'committed' && message.receipt?.operationId === operationId
        ))
        const remote = await readRoot()
        expect(remote.statics.messages).toBe(12)
        expect(await patchRoot(
            calculateHash(baseline).toString(16), compare(baseline, local),
        )).toBe(409)
        const merged = mergeThreeWayValue(baseline, local, remote)
        mergeBrowserMessageEffects(baseline, local, remote, merged)
        expect(merged.statics.messages).toBe(12)
        expect(await patchRoot(
            calculateHash(remote).toString(16), compare(remote, merged),
        )).toBe(200)
        const stored = await readRoot()
        expect(stored.statics.messages).toBe(12)
        expect(stored.statics.browserMessageEffects)
            .toEqual(local.statics.browserMessageEffects)
        expect(stored.statics.bgOrchestrationApplied).toEqual([
            { operationId, cumulative: 1 },
        ])
    }, 30_000)

    it('preserves a browser statistic effect through conditional full-write rebase', async () => {
        const runtimeRoot = makeRuntimeRoot()
        await seedRuntime(runtimeRoot)
        const server = await startServer(runtimeRoot)
        const databaseKey = Buffer.from('database/database.bin', 'utf8').toString('hex')
        const readRoot = async () => {
            const response = await fetch(`${server.baseURL}/api/read`, {
                headers: { 'risu-auth': server.token, 'file-path': databaseKey },
            })
            expect(response.status).toBe(200)
            return {
                database: await decodeRisuSave(new Uint8Array(await response.arrayBuffer())),
                etag: response.headers.get('x-db-etag'),
            }
        }
        const baseline = await readRoot()
        const local = structuredClone(baseline.database)
        local.statics.messages += 1
        local.statics.browserMessageEffects = [{
            id: 'browser-attempt-full-1', delta: 1, createdAt: Date.now(),
        }]
        const initial = await readChat(server)
        const operationId = 'operation-h1-browser-full-n-1'
        expect(await submitFromDisposableClient(
            server, inputBody(operationId, initial.revision, 'input N'),
        )).toMatchObject({ status: 200, body: { started: true } })
        await server.waitFor('provider-waiting', message => message.operationId === operationId)
        server.child.send({ scope: 'pocketrisu-h1', command: 'release-provider' })
        await server.waitFor('commit-result', message => (
            message.status === 'committed' && message.receipt?.operationId === operationId
        ))
        const stale = await fetch(`${server.baseURL}/api/write`, {
            method: 'POST',
            headers: {
                'risu-auth': server.token, cookie: server.cookie,
                'content-type': 'application/octet-stream',
                'file-path': databaseKey,
                'x-if-match': baseline.etag || '',
            },
            body: encodeRisuSaveLegacy(local),
        })
        expect(stale.status).toBe(409)
        const remote = await readRoot()
        const merged = mergeThreeWayValue(baseline.database, local, remote.database)
        mergeBrowserMessageEffects(baseline.database, local, remote.database, merged)
        expect(merged.statics.messages).toBe(12)
        const accepted = await fetch(`${server.baseURL}/api/write`, {
            method: 'POST',
            headers: {
                'risu-auth': server.token, cookie: server.cookie,
                'content-type': 'application/octet-stream',
                'file-path': databaseKey,
                'x-if-match': remote.etag || '',
            },
            body: encodeRisuSaveLegacy(merged),
        })
        expect(accepted.status).toBe(200)
        const stored = (await readRoot()).database
        expect(stored.statics.messages).toBe(12)
        expect(stored.statics.browserMessageEffects)
            .toEqual(local.statics.browserMessageEffects)
        expect(stored.statics.bgOrchestrationApplied).toEqual([
            { operationId, cumulative: 1 },
        ])
    }, 30_000)

    it('merges two independent browser statistic identities through a root conflict', async () => {
        const runtimeRoot = makeRuntimeRoot()
        await seedRuntime(runtimeRoot)
        const server = await startServer(runtimeRoot)
        const databaseKey = Buffer.from('database/database.bin', 'utf8').toString('hex')
        const headers = {
            'risu-auth': server.token, cookie: server.cookie,
            'content-type': 'application/json', 'file-path': databaseKey,
        }
        const readRoot = async () => {
            const response = await fetch(`${server.baseURL}/api/read`, {
                headers: { 'risu-auth': server.token, 'file-path': databaseKey },
            })
            expect(response.status).toBe(200)
            return await decodeRisuSave(new Uint8Array(await response.arrayBuffer()))
        }
        const patchRoot = async (expectedHash: string, patch: unknown[]) => {
            const response = await fetch(`${server.baseURL}/api/patch`, {
                method: 'POST', headers,
                body: JSON.stringify({ expectedHash, patch }),
            })
            return response.status
        }
        const base = await readRoot()
        const first = structuredClone(base)
        first.statics.messages += 1
        first.statics.browserMessageEffects = [{
            id: 'browser-session-a-1', delta: 1, createdAt: Date.now(),
        }]
        const second = structuredClone(base)
        second.statics.messages += 1
        second.statics.browserMessageEffects = [{
            id: 'browser-session-b-1', delta: 1, createdAt: Date.now(),
        }]
        expect(await patchRoot(
            calculateHash(base).toString(16), compare(base, first),
        )).toBe(200)
        expect(await patchRoot(
            calculateHash(base).toString(16), compare(base, second),
        )).toBe(409)
        const remote = await readRoot()
        const merged = mergeThreeWayValue(base, second, remote)
        mergeBrowserMessageEffects(base, second, remote, merged)
        expect(merged.statics.messages).toBe(12)
        expect(await patchRoot(
            calculateHash(remote).toString(16), compare(remote, merged),
        )).toBe(200)
        const stored = await readRoot()
        expect(stored.statics.messages).toBe(12)
        expect(stored.statics.browserMessageEffects.map((entry: any) => entry.id))
            .toEqual(['browser-session-a-1', 'browser-session-b-1'])
    }, 30_000)
})
