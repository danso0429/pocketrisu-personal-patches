import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const storageSlot = vi.hoisted(() => ({ realStorage: null as any }))
const tickMock = vi.hoisted(() => vi.fn(async () => {}))

vi.mock('src/lang', () => ({ language: {} }))
vi.mock('../alert', () => ({
    alertInput: vi.fn(),
    waitAlert: vi.fn(),
    notifyError: vi.fn(),
}))
vi.mock('../globalApi.svelte', () => ({ forageStorage: storageSlot }))
vi.mock('./database.svelte', () => ({
    appVer: 'h1-process-test',
    nodeOnlyVer: 'h1-process-test',
    normalizeChat: (chat: unknown) => chat,
    isChatStub: (value: any) => value?._stub === true && !Array.isArray(value?.message),
}))
vi.mock('svelte', () => ({ tick: tickMock }))

const { NodeStorage } = await import('./nodeStorage')
const { adoptServerCommittedChat } = await import('./chatStorage')

const enabled = process.env.POCKETRISU_H1_CLIENT_TEST === '1'
const baseURL = process.env.POCKETRISU_H1_BASE_URL || ''
const token = process.env.POCKETRISU_H1_TOKEN || ''
const expectedRevision = process.env.POCKETRISU_H1_EXPECTED_REVISION || ''
const describeH1 = enabled ? describe : describe.skip
const originalFetch = globalThis.fetch

const fakeStartupCache = {
    probe: vi.fn(async () => null),
    resolveNotModified: vi.fn(async () => null),
    storeAuthoritative: vi.fn(async () => ({ rawStored: true, decodedStored: true })),
    recordPatch: vi.fn(async () => 'recorded'),
    invalidate: vi.fn(async () => undefined),
}

function installOriginFetch() {
    let cookie = ''
    ;(window as any).happyDOM?.setURL(baseURL)
    globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
        const url = new URL(String(input), baseURL)
        const headers = new Headers(init.headers)
        if (cookie) headers.set('cookie', cookie)
        const response = await originalFetch(url, { ...init, headers })
        const setCookie = response.headers.get('set-cookie') || ''
        if (setCookie) cookie = setCookie.split(';', 1)[0]
        return response
    }) as typeof fetch
}

async function adoptFromEmptyStorage() {
    const storage = new NodeStorage(fakeStartupCache as any)
    ;(storage as any).authChecked = true
    ;(storage as any).cachedJwt = { token, expiresAt: Date.now() + 60_000 }
    ;(NodeStorage as any).sessionInitialized = false
    ;(NodeStorage as any).sessionPending = null
    storageSlot.realStorage = storage
    expect((storage as any).chatSyncStates.size).toBe(0)
    const chats = [{
        id: 'chat-1',
        name: 'Chat',
        message: [],
        _placeholder: true,
    }] as any[]
    const result = await adoptServerCommittedChat(
        chats,
        'char-1',
        'chat-1',
        expectedRevision,
        [],
        () => { throw new Error('blank placeholder revision must not be read') },
    )
    return { storage, chats, result }
}

describeH1('server-committed chat process adoption', () => {
    beforeEach(() => {
        expect(baseURL).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
        expect(token.length).toBeGreaterThan(0)
        expect(expectedRevision).toMatch(/^[0-9a-f]{64}$/)
        installOriginFetch()
    })

    afterEach(() => {
        globalThis.fetch = originalFetch
        storageSlot.realStorage = null
        tickMock.mockClear()
    })

    it('adopts the canonical server revision without a local pending marker', async () => {
        const { storage, chats, result } = await adoptFromEmptyStorage()
        expect(result).toMatchObject({ adopted: true, revision: expectedRevision })
        expect(chats[0].message).toMatchObject([
            { chatId: 'user-1' },
            { chatId: 'user-operation-h1-process-success-1' },
            { chatId: 'assistant-operation-h1-process-success-1' },
        ])
        expect((storage as any).chatSyncStates.get('char-1|chat-1').revision)
            .toBe(expectedRevision)
    })

    it('repeats the read from another empty storage context without writing back', async () => {
        const { storage, chats, result } = await adoptFromEmptyStorage()
        expect(result).toMatchObject({ adopted: true, revision: expectedRevision })
        expect(chats[0].message).toHaveLength(3)
        expect((storage as any).chatSaveTails.size).toBe(0)
    })
})
