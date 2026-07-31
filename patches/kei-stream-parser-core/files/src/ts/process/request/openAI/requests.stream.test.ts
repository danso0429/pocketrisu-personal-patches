import { describe, expect, it, vi } from 'vitest'

import { __testOpenAIRequestsAPI } from './requests'

const mocks = vi.hoisted(() => ({
    db: {
        jsonSchemaEnabled: false,
    },
}))

vi.mock('src/ts/storage/database.svelte', () => ({
    getDatabase: () => mocks.db,
}))

vi.mock('src/lang', () => ({
    language: { errors: { httpError: 'HTTP ' } },
}))

vi.mock('src/ts/alert', () => ({
    notifyError: vi.fn(),
}))

vi.mock('src/ts/globalApi.svelte', () => ({
    addFetchLog: vi.fn(),
    fetchNative: vi.fn(),
    globalFetch: vi.fn(),
    textifyReadableStream: vi.fn(),
}))

vi.mock('src/ts/network/localNetwork', () => ({
    isLocalNetworkUrl: () => false,
}))

vi.mock('src/ts/model/modellist', () => ({
    LLMFlags: {
        deepSeekThinkingOutput: 19,
    },
    LLMFormat: {},
}))

vi.mock('src/ts/tokenizer', () => ({
    strongBan: vi.fn(),
    tokenizeNum: vi.fn(),
}))

vi.mock('src/ts/model/openrouter', () => ({
    getFreeOpenRouterModels: vi.fn(),
}))

vi.mock('src/ts/util', () => ({
    simplifySchema: (schema: unknown) => schema,
}))

vi.mock('../../templates/jsonSchema', () => ({
    extractJSON: (data: string) => data,
    getOpenAIJSONSchema: () => ({}),
}))

vi.mock('../../templates/chatTemplate', () => ({
    applyChatTemplate: vi.fn(),
}))

vi.mock('../../files/inlays', () => ({
    supportsInlayImage: () => false,
}))

vi.mock('../../mcp/mcp', () => ({
    callTool: vi.fn(),
    decodeToolCall: vi.fn(),
    encodeToolCall: vi.fn(),
}))

const baseArg = (overrides: Record<string, any> = {}) => ({
    extractJson: false,
    modelInfo: {
        flags: [],
    },
    multiGen: false,
    schema: undefined,
    ...overrides,
}) as any

async function collectStream(stream: ReadableStream<Record<string, string>>) {
    const reader = stream.getReader()
    const chunks: Record<string, string>[] = []
    while (true) {
        const { done, value } = await reader.read()
        if (done) return chunks
        chunks.push(value)
    }
}

describe('OpenAI chat completions stream parser', () => {
    it('parses each completed event once and keeps cumulative output', async () => {
        const stream = __testOpenAIRequestsAPI.getTranStream(baseArg())
        const chunksPromise = collectStream(stream.readable)
        const writer = stream.writable.getWriter()
        const encoder = new TextEncoder()
        const parseSpy = vi.spyOn(JSON, 'parse')

        try {
            await writer.write(encoder.encode(
                'data: {"choices":[{"delta":{"content":"Hel"},"index":0}]}\n\n',
            ))
            await writer.write(encoder.encode(
                'data: {"choices":[{"delta":{"content":"lo"},"index":0}]}\n\n',
            ))
            await writer.write(encoder.encode('data: [DONE]\n\n'))
            await writer.close()

            const chunks = await chunksPromise
            expect(chunks.at(-1)?.['0']).toBe('Hello')
            expect(parseSpy).toHaveBeenCalledTimes(2)
        } finally {
            parseSpy.mockRestore()
        }
    })

    it('preserves split UTF-8, split JSON, and multiline SSE data', async () => {
        const stream = __testOpenAIRequestsAPI.getTranStream(baseArg())
        const chunksPromise = collectStream(stream.readable)
        const writer = stream.writable.getWriter()
        const encoder = new TextEncoder()
        const event = 'data: {"choices":\r\ndata: [{"delta":{"content":"Hi 😀"},"index":0}]}\r\n\r\n'
        const bytes = encoder.encode(event)
        const emoji = bytes.findIndex((byte, index) => byte === 0xf0 && bytes[index + 1] === 0x9f)

        await writer.write(bytes.slice(0, emoji + 2))
        await writer.write(bytes.slice(emoji + 2, bytes.length - 3))
        await writer.write(bytes.slice(bytes.length - 3))
        await writer.close()

        const chunks = await chunksPromise
        expect(chunks.at(-1)?.['0']).toBe('Hi 😀')
    })

    it('accumulates tool calls and structured reasoning without duplicate fragments', async () => {
        const stream = __testOpenAIRequestsAPI.getTranStream(baseArg())
        const chunksPromise = collectStream(stream.readable)
        const writer = stream.writable.getWriter()
        const encoder = new TextEncoder()

        await writer.write(encoder.encode(
            'data: {"choices":[{"delta":{"reasoning_content":"Think ","content":"Hi","tool_calls":[{"index":0,"id":"call_1","function":{"name":"lookup","arguments":"{\\"q\\":"}}]},"index":0}]}\n\n',
        ))
        await writer.write(encoder.encode(
            'data: {"choices":[{"delta":{"reasoning_content":"step","tool_calls":[{"index":0,"function":{"arguments":"\\"x\\"}"}}]},"index":0}]}\n\n',
        ))
        await writer.close()

        const last = (await chunksPromise).at(-1) ?? {}
        expect(last['0']).toBe('<Thoughts>\nThink step\n</Thoughts>\nHi')
        expect(JSON.parse(last['__tool_calls'] ?? '{}')).toEqual({
            0: {
                id: 'call_1',
                type: 'function',
                function: {
                    name: 'lookup',
                    arguments: '{"q":"x"}',
                },
            },
        })
    })

    it('extracts tagged reasoning only after its closing tag arrives', async () => {
        const stream = __testOpenAIRequestsAPI.getTranStream(baseArg({
            modelInfo: {
                flags: [19],
            },
        }))
        const chunksPromise = collectStream(stream.readable)
        const writer = stream.writable.getWriter()
        const encoder = new TextEncoder()

        await writer.write(encoder.encode(
            'data: {"choices":[{"delta":{"content":"<think>Plan"},"index":0}]}\n\n',
        ))
        await writer.write(encoder.encode(
            'data: {"choices":[{"delta":{"content":" more</think>Answer"},"index":0}]}\n\n',
        ))
        await writer.close()

        expect((await chunksPromise).at(-1)?.['0']).toBe(
            '<Thoughts>\nPlan more\n</Thoughts>\nAnswer',
        )
    })

    it('keeps multiple choices separate and resumes after a malformed event', async () => {
        const stream = __testOpenAIRequestsAPI.getTranStream(baseArg({ multiGen: true }))
        const chunksPromise = collectStream(stream.readable)
        const writer = stream.writable.getWriter()
        const encoder = new TextEncoder()

        await writer.write(encoder.encode('data: {malformed}\n\n'))
        await writer.write(encoder.encode(
            'data: {"choices":[{"delta":{"content":"A"},"index":0},{"delta":{"content":"B"},"index":1}]}\n\n',
        ))
        await writer.write(encoder.encode(
            'data: {"choices":[{"delta":{"content":"C"},"index":0},{"delta":{"content":"D"},"index":1}]}\n\n',
        ))
        await writer.close()

        expect((await chunksPromise).at(-1)).toMatchObject({
            '0': 'AC',
            '1': 'BD',
        })
    })
})
