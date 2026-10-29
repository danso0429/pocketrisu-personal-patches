import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'

const mocks = vi.hoisted(() => ({
    db: {} as any,
    chat: null as any,
    character: null as any,
    saveChatToServer: vi.fn(async () => {}),
}))

vi.mock('src/ts/storage/database.svelte', () => ({
    getDatabase: () => mocks.db,
    getCurrentChat: () => mocks.chat,
    getCurrentCharacter: () => mocks.character,
}))
vi.mock('src/ts/storage/chatStorage', () => ({
    ensureChatHydrated: vi.fn(async () => {}),
    saveChatToServer: mocks.saveChatToServer,
}))
vi.mock('src/ts/globalApi.svelte', () => ({
    forageStorage: { createAuth: async () => 'e2-5-auth' },
    globalFetch: (...args: Parameters<typeof fetch>) => fetch(...args),
    fetchNative: (...args: Parameters<typeof fetch>) => fetch(...args),
}))
vi.mock('src/ts/log', () => ({ getClientId: () => 'e2-5-client' }))
vi.mock('src/ts/alert', () => ({ notifyError: vi.fn(), notifyInfo: vi.fn() }))
vi.mock('src/ts/plugins/plugins.svelte', () => ({
    pluginProcess: vi.fn(),
    pluginV2: { replacerbeforeRequest: new Set(), replacerafterRequest: new Set() },
}))
vi.mock('src/ts/process/mcp/mcp', () => ({
    getTools: vi.fn(async () => []), callTool: vi.fn(),
    encodeToolCall: vi.fn(), decodeToolCall: vi.fn(),
}))
vi.mock('src/ts/process/triggers', () => ({ runTrigger: vi.fn() }))

import { requestChatData, requestChatDataMain } from './request'
import { recoverTerminalJob } from './jobRecovery'

const require = createRequire(import.meta.url)
const tempDirs: string[] = []

function snapshot(adapterKind = 'openai-compatible') {
    return {
        profileId: 'demo:native', profileVersion: 1,
        providerBaseId: 'demo', providerBaseVersion: 1,
        adapterKind,
        auth: { kind: 'bearer', fields: ['apiKey'] },
        endpoint: { kind: 'static', url: 'https://demo.invalid/v1/chat/completions' },
        modelId: 'demo-native-model',
        schema: [
            { key: 'apiKey', type: 'string', mapsTo: { target: 'auth', path: 'apiKey' } },
            { key: 'modelId', type: 'string', mapsTo: { target: 'body', path: 'model' } },
        ],
        uiSchema: { groups: [], fields: [] }, defaults: {}, capabilities: [],
    }
}

function preset(adapterKind = 'openai-compatible') {
    return {
        id: 'preset-e2-5', name: 'Native preset label', profileSnapshot: snapshot(adapterKind),
        userValues: { apiKey: 'synthetic-key', modelId: 'demo-native-model' },
        pageFold: { model: 'retired-pagefold-model' },
    } as any
}

function baseDb() {
    return {
        modelPresets: [preset()], nodeOnlyModelModeLock: 'none',
        nodeOnlyServerSideRequests: false, showRequestStatus: false,
        requestLogEnabled: false, requestLogStreamUsage: false,
        fallbackModels: { model: [], submodel: [], memory: [], emotion: [], translate: [], otherAx: [] },
        requestRetrys: 0, fallbackWhenBlankResponse: false, banCharacterset: [],
        aiModel: 'native-primary', subModel: 'native-sub', seperateModelsForAxModels: false,
        maxResponse: 500, temperature: 80, useStreaming: false, genTime: 1,
        echoMessage: 'native fallback echo', echoDelay: 0,
        systemRoleReplacement: 'user', systemContentReplacement: 'system: {{slot}}',
    }
}

beforeEach(() => {
    mocks.db = baseDb()
    mocks.chat = {
        id: 'chat-e2-5', useModelPreset: true,
        modelBinding: { main: 'preset-e2-5', sub: '', separateAux: false,
            aux: { memory: '', emotion: '', translate: '', otherAx: '' },
            pageFold: { model: 'retired-pagefold-model' } },
    }
    mocks.character = null
    mocks.saveChatToServer.mockReset()
    mocks.saveChatToServer.mockResolvedValue(undefined)
})

afterEach(() => {
    vi.unstubAllGlobals()
    while (tempDirs.length) fs.rmSync(tempDirs.pop()!, { recursive: true, force: true })
})

describe('[E2-5a] Rebase usage-cost-estimate onto PocketRisu 1.16.1', () => {
    test('[unchanged] B7 native request results keep preset labels and static fallback model selection', async () => {
        const arg = { formated: [{ role: 'user', content: 'hello' }], bias: {},
            useStreaming: false, previewBody: true, tools: [] } as any
        const success = await requestChatDataMain({ ...arg }, 'model')
        expect(success).toMatchObject({ type: 'success', model: 'demo-native-model', modelLabel: 'Native preset label' })

        mocks.db.modelPresets = [preset('unsupported-adapter')]
        const failure = await requestChatDataMain({ ...arg }, 'model')
        expect(failure).toMatchObject({ type: 'fail', model: 'demo-native-model', modelLabel: 'Native preset label' })

        mocks.db.modelPresets = [preset()]
        mocks.db.fallbackModels.model = ['echo_model']
        const fallback = await requestChatData({ formated: [{ role: 'user', content: 'hello' }], bias: {}, tools: [] } as any, 'model')
        expect(fallback).toMatchObject({ type: 'success', result: 'native fallback echo', model: 'echo_model' })
    })

    test('[unchanged] a4/A4 recovered jobs emit the native model and token fields for one request and usage row', async () => {
        mocks.db.requestLogEnabled = true
        const chat = { id: 'chat-e2-5', name: 'chat', message: [] as any[] }
        mocks.db.characters = [{ chaId: 'char-e2-5', name: 'Rina', type: 'character', chatPage: 0,
            reloadKeys: 0, chats: [chat] }]
        const posted: any[][] = []
        const journal = 'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n'
            + 'data: {"choices":[],"usage":{"prompt_tokens":41,"completion_tokens":7,"prompt_tokens_details":{"cached_tokens":3}}}\n\n'
            + 'data: [DONE]\n\n'
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input)
            if (url === '/api/model-jobs/job-e2-5/stream') {
                return new Response(journal, { status: 200, headers: { 'content-type': 'text/event-stream' } })
            }
            if (url === '/api/model-jobs/job-e2-5/claim' && init?.method === 'POST') {
                return Response.json({ success: true })
            }
            if (url === '/api/request-logs' && init?.method === 'POST') {
                posted.push(JSON.parse(String(init.body)))
                return Response.json({ success: true, written: 1 })
            }
            throw new Error(`unexpected fetch ${init?.method ?? 'GET'} ${url}`)
        }))

        await recoverTerminalJob({
            id: 'job-e2-5', chatId: 'chat-e2-5', generationId: 'gen-e2-5',
            adapterKind: 'openai-compatible', model: 'claude-3-7-sonnet', streaming: true,
            status: 'done', upstreamStatus: 200, createdAt: 100, endedAt: 250,
            targetOrigin: 'https://provider.invalid/v1/chat',
        } as any)
        await vi.waitFor(() => expect(posted).toHaveLength(1))
        expect(posted[0]).toHaveLength(1)
        expect(posted[0][0]).toMatchObject({
            category: 'llm', source: 'main', route: 'job', model: 'claude-3-7-sonnet',
            inputTokens: 41, outputTokens: 7, cachedTokens: 3,
        })

        const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2-5-recovered-log-'))
        tempDirs.push(saveDir)
        const { createRequestLogs } = require('../../../../server/node/request-logs.cjs')
        const logs = createRequestLogs({ saveDir })
        logs.addRequestLogBatch(posted[0])
        logs.close()
        const db = new Database(path.join(saveDir, 'request-logs.db'), { readonly: true })
        const request = db.prepare(`SELECT model,input_tokens,output_tokens,cached_tokens,reasoning_tokens
            FROM requests`).get() as any
        const usage = db.prepare(`SELECT model,input_tokens,output_tokens,cached_tokens,reasoning_tokens
            FROM usage`).get() as any
        db.close()
        expect(request).toEqual({ model: 'claude-3-7-sonnet', input_tokens: 41, output_tokens: 7,
            cached_tokens: 3, reasoning_tokens: null })
        expect(usage).toEqual({ model: 'claude-3-7-sonnet', input_tokens: 41, output_tokens: 7,
            cached_tokens: 3, reasoning_tokens: 0 })
    })
})
