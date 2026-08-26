import fs from 'node:fs'
import { createRequire } from 'node:module'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const require = createRequire(import.meta.url)
const {
    FIXTURES,
}: {
    FIXTURES: Array<{
        id: string
        paid: boolean
        payloadUtf8Base64: string
    }>
} = require('./manifest-v1.cjs')
const {
    compareUtf8Exact,
}: {
    compareUtf8Exact: (expected: string, observed: string) => {
        exact: boolean
        classification: string
    }
} = require('./qualification.cjs')

const mocks = vi.hoisted(() => ({
    db: { characters: [] as any[], inlayErrorResponse: true, showRequestStatus: true } as any,
    ensureChatHydrated: vi.fn(),
    saveChatToServer: vi.fn(async () => {}),
}))

vi.mock('src/ts/globalApi.svelte', () => ({
    forageStorage: { createAuth: async () => 'verbatim-test-auth' },
}))
vi.mock('src/ts/storage/database.svelte', () => ({
    getDatabase: () => mocks.db,
}))
vi.mock('src/ts/storage/chatStorage', () => ({
    ensureChatHydrated: mocks.ensureChatHydrated,
    saveChatToServer: mocks.saveChatToServer,
}))
vi.mock('src/ts/alert', () => ({
    notifyError: vi.fn(),
    notifyInfo: vi.fn(),
}))

import {
    parseGeminiResponse,
    parseGeminiStreamDelta,
} from 'src/ts/preset/adapter/googleGemini'
import { pumpPresetStream } from 'src/ts/process/request/presetStreamPump'
import { collectStreamingText } from 'src/ts/process/request/shared'
import {
    decodeRisuSave,
    encodeRisuSaveLegacy,
} from 'src/ts/storage/risuSave'

function paidFixtures() {
    return FIXTURES.filter((fixture) => fixture.paid).map((fixture) => ({
        ...fixture,
        payload: Buffer.from(fixture.payloadUtf8Base64, 'base64').toString('utf8'),
    }))
}

function splitScalars(value: string, pieces = 7): string[] {
    const scalars = Array.from(value)
    const width = Math.max(1, Math.ceil(scalars.length / pieces))
    const out: string[] = []
    for (let index = 0; index < scalars.length; index += width) {
        out.push(scalars.slice(index, index + width).join(''))
    }
    return out
}

function streamOf<T>(values: T[]): ReadableStream<T> {
    return new ReadableStream({
        start(controller) {
            for (const value of values) controller.enqueue(value)
            controller.close()
        },
    })
}

function byteStream(value: string, width = 7): ReadableStream<Uint8Array> {
    const bytes = new TextEncoder().encode(value)
    return new ReadableStream({
        start(controller) {
            for (let index = 0; index < bytes.length; index += width) {
                controller.enqueue(bytes.slice(index, index + width))
            }
            controller.close()
        },
    })
}

function geminiJournal(payload: string): string {
    return splitScalars(payload).map((text) => (
        'data: ' + JSON.stringify({
            candidates: [{ content: { parts: [{ text }] } }],
        }) + '\n\n'
    )).join('')
}

function makeController() {
    const state = {
        enqueued: [] as Array<Record<string, string>>,
        closed: false,
        errored: null as unknown,
        desiredSize: 1,
        enqueue(chunk: Record<string, string>) { state.enqueued.push(chunk) },
        close() { state.closed = true },
        error(error: unknown) { state.errored = error },
    }
    return state
}

async function* deltasFor(payload: string) {
    for (const text of splitScalars(payload)) {
        yield { textDelta: text, raw: null }
    }
}

beforeEach(() => {
    mocks.db = {
        characters: [],
        inlayErrorResponse: true,
        showRequestStatus: true,
        regex: [],
        customScripts: [],
    }
    mocks.ensureChatHydrated.mockReset()
    mocks.saveChatToServer.mockReset()
})

describe('PageFold verbatim production response paths', () => {
    test('non-stream Gemini parser preserves every transportable fixture byte-for-byte', () => {
        for (const fixture of paidFixtures()) {
            const chunks = splitScalars(fixture.payload, 3)
            const response = parseGeminiResponse({
                candidates: [{
                    finishReason: 'STOP',
                    content: {
                        parts: [
                            { text: chunks.shift() ?? '' },
                            { text: 'private thought', thought: true },
                            ...chunks.map((text) => ({ text })),
                        ],
                    },
                }],
            })
            expect(compareUtf8Exact(fixture.payload, response.text), fixture.id).toMatchObject({
                exact: true,
                classification: 'exact',
            })
            expect(response.reasoning?.map((part) => part.text).join('')).toBe('private thought')
        }
    })

    test('stream delta parser and live stream pump preserve exact visible text', async () => {
        for (const fixture of paidFixtures()) {
            let parsed = ''
            for (const text of splitScalars(fixture.payload)) {
                const delta = parseGeminiStreamDelta({
                    candidates: [{ content: { parts: [{ text }] } }],
                })
                parsed += delta?.textDelta ?? ''
            }
            expect(compareUtf8Exact(fixture.payload, parsed), fixture.id).toMatchObject({ exact: true })

            const controller = makeController()
            await pumpPresetStream(deltasFor(fixture.payload), controller, {
                intervalMs: 0,
                formatReasoning: (text) => text,
            })
            expect(controller.errored, fixture.id).toBeNull()
            expect(controller.closed, fixture.id).toBe(true)
            const final = controller.enqueued.at(-1)?.['0'] ?? ''
            expect(compareUtf8Exact(fixture.payload, final), fixture.id).toMatchObject({ exact: true })
        }
    })

    test('decoupled collector preserves the final cumulative stream snapshot', async () => {
        for (const fixture of paidFixtures()) {
            let cumulative = ''
            const snapshots = splitScalars(fixture.payload).map((text) => {
                cumulative += text
                return { '0': cumulative }
            })
            const observed = await collectStreamingText(streamOf(snapshots))
            expect(compareUtf8Exact(fixture.payload, observed), fixture.id).toMatchObject({ exact: true })
        }
    })

    test('BG streaming and non-streaming journal decoders preserve exact text', async () => {
        const recovery = await import('src/ts/process/request/jobRecovery')
        for (const fixture of paidFixtures()) {
            const streamed = await recovery.decodeStreamingJournalDetailed(
                'google-gemini',
                byteStream(geminiJournal(fixture.payload)),
            )
            expect(compareUtf8Exact(fixture.payload, streamed.text), fixture.id).toMatchObject({ exact: true })

            const nonstream = recovery.decodeJsonJournalDetailed(
                'google-gemini',
                JSON.stringify({
                    candidates: [{ content: { parts: [{ text: fixture.payload }] }, finishReason: 'STOP' }],
                }),
            )
            expect(compareUtf8Exact(fixture.payload, nonstream.text), fixture.id).toMatchObject({ exact: true })
        }
    })

    test('Risu save encoding and decoding preserves raw message bytes', async () => {
        for (const fixture of paidFixtures()) {
            const database = {
                type: 'risuSave',
                characters: [{
                    chaId: 'verbatim-char',
                    chats: [{
                        id: 'verbatim-chat',
                        message: [{ role: 'char', data: fixture.payload }],
                    }],
                }],
            }
            const encoded = encodeRisuSaveLegacy(database, 'noCompression')
            const decoded = await decodeRisuSave(encoded)
            const observed = decoded.characters[0].chats[0].message[0].data
            expect(compareUtf8Exact(fixture.payload, observed), fixture.id).toMatchObject({ exact: true })
        }
    })
})

describe('PageFold verbatim final postprocess and clipboard sink', () => {
    test('current sendChat source unconditionally trims before storage', () => {
        const source = fs.readFileSync('src/ts/process/index.svelte.ts', 'utf8')
        expect(source).toMatch(
            /function reformatContent\(data:string\)[\s\S]*?return data\.trim\(\)[\s\S]*?return data\.trim\(\)/,
        )
    })

    test('current message copy source uses parsed display text for text/plain', () => {
        const source = fs.readFileSync('src/lib/ChatScreens/Chat.svelte', 'utf8')
        expect(source).toMatch(/msgDisplay = risuChatParser\(message,/)
        expect(source).toMatch(/const copyText = renderRawStreaming[\s\S]*?: msgDisplay/)
        expect(source).toMatch(/'text\/plain': new Blob\(\[copyText\]/)
        expect(source).toMatch(/clipboard\.writeText\(copyText\)/)
    })

    test('edge whitespace fails at postprocess and remains failed after save/reload/copy', async () => {
        const fixture = paidFixtures().find((candidate) => candidate.id === 'atomic-a')!
        const postprocessed = fixture.payload.trim()
        expect(compareUtf8Exact(fixture.payload, postprocessed)).toMatchObject({
            exact: false,
            classification: 'edge-trim',
        })

        const database = {
            type: 'risuSave',
            characters: [{
                chaId: 'verbatim-char',
                chats: [{
                    id: 'verbatim-chat',
                    message: [{ role: 'char', data: postprocessed }],
                }],
            }],
        }
        const decoded = await decodeRisuSave(encodeRisuSaveLegacy(database, 'noCompression'))
        const reloaded = decoded.characters[0].chats[0].message[0].data
        // The copy handler reads msgDisplay derived from this already-trimmed
        // persisted value. It has no retained edge-count metadata from which
        // the removed bytes could be reconstructed.
        const clipboardText = reloaded
        expect(compareUtf8Exact(fixture.payload, clipboardText)).toMatchObject({
            exact: false,
            classification: 'edge-trim',
        })
    })
})
