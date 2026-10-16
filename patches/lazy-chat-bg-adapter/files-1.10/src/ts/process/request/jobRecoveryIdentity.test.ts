import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { get } from 'svelte/store'
import type { ModelJobRecord } from './jobRecovery'

// --- module mocks -----------------------------------------------------------
//
// jobRecovery touches the app through four seams; everything else (adapter
// parsers, generationState, requestStatus) runs for real. The DB is a plain
// mutable fixture handed out by the mocked getDatabase, mirroring how
// util.test.ts stubs the database layer.

const mocks = vi.hoisted(() => ({
    db: { characters: [] as any[], inlayErrorResponse: true, showRequestStatus: true } as any,
    recordRequestLog: vi.fn(),
    notifyError: vi.fn(),
    notifyInfo: vi.fn(),
    ensureChatHydrated: vi.fn(),
    saveChatToServer: vi.fn(async (..._args: unknown[]) => {}),
}))

vi.mock('src/ts/globalApi.svelte', () => ({
    forageStorage: { createAuth: async () => 'test-auth' },
}))
vi.mock('src/ts/storage/database.svelte', () => ({
    getDatabase: () => mocks.db,
}))
vi.mock('src/ts/storage/chatStorage', () => ({
    ensureChatHydrated: mocks.ensureChatHydrated,
    saveChatToServer: mocks.saveChatToServer,
}))
vi.mock('src/ts/requestLog', () => ({ recordRequestLog: mocks.recordRequestLog }))
vi.mock('src/ts/alert', () => ({
    notifyError: mocks.notifyError,
    notifyInfo: mocks.notifyInfo,
}))

// Fresh module instances per test: recoverModelJobs is once-guarded, and the
// keyed stores (generationState / requestStatus) must not leak across tests.
async function loadModules() {
    vi.resetModules()
    const recovery = await import('./jobRecovery')
    const genState = await import('src/ts/process/generationState')
    const status = await import('src/ts/status/requestStatus')
    const pending = await import('./pendingSends')
    return { recovery, genState, status, pending }
}

// --- fixtures ---------------------------------------------------------------

function makeChat(overrides: Record<string, unknown> = {}) {
    return { id: 'chat-1', name: 'chat one', message: [] as any[], ...overrides }
}

function makeChar(chat: any) {
    return { chaId: 'cha-1', name: 'Rina', type: 'character', chatPage: 0, reloadKeys: 0, chats: [chat] }
}

function makeJob(overrides: Partial<ModelJobRecord> = {}): ModelJobRecord {
    return {
        id: 'job-1',
        chatId: 'chat-1',
        generationId: 'gen-1',
        adapterKind: 'openai-compatible',
        streaming: true,
        status: 'done',
        upstreamStatus: 200,
        ...overrides,
    }
}

function sseStream(...chunks: string[]): ReadableStream<Uint8Array> {
    const enc = new TextEncoder()
    return new ReadableStream({
        start(c) {
            for (const chunk of chunks) c.enqueue(enc.encode(chunk))
            c.close()
        },
    })
}

const OPENAI_SSE =
    'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n'
    + 'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n'
    + 'data: [DONE]\n\n'

// --- fetch harness ----------------------------------------------------------

interface ServerBehavior {
    unclaimed?: any[]
    active?: any[]
    /** GET /api/pending-sends payload (default: none). */
    pendingSends?: any[]
    /** journal body per job id (string, replayed as one chunk) */
    journals?: Record<string, string>
    /** override the stream endpoint's HTTP status per job id */
    streamStatus?: Record<string, number>
    /** successive GET /api/model-jobs/:id responses (last one repeats) */
    jobStates?: Record<string, any[]>
    /** make GET /api/model-jobs/:id reject (status endpoint unreachable) */
    jobStatusUnreachable?: boolean
}

function setupServer(behavior: ServerBehavior) {
    const calls: { url: string, method: string }[] = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        calls.push({ url, method })
        if (url === '/api/model-jobs?unclaimed=1') {
            return new Response(JSON.stringify({ jobs: behavior.unclaimed ?? [] }), { status: 200 })
        }
        if (url === '/api/model-jobs?active=1') {
            return new Response(JSON.stringify({ jobs: behavior.active ?? [] }), { status: 200 })
        }
        if (url === '/api/pending-sends' && method === 'GET') {
            return new Response(JSON.stringify({ pendingSends: behavior.pendingSends ?? [] }), { status: 200 })
        }
        if (url.startsWith('/api/pending-sends/') && method === 'DELETE') {
            return new Response('{"success":true}', { status: 200 })
        }
        if (url.startsWith('/api/pending-sends/') && url.endsWith('/claim') && method === 'POST') {
            return new Response('{"claimed":true}', { status: 200 })
        }
        const streamMatch = url.match(/^\/api\/model-jobs\/([^/]+)\/stream$/)
        if (streamMatch) {
            const id = streamMatch[1]
            const status = behavior.streamStatus?.[id] ?? 200
            if (status !== 200) return new Response('down', { status })
            return new Response(sseStream(behavior.journals?.[id] ?? ''), {
                status: 200,
                headers: { 'content-type': 'text/event-stream', 'x-model-job-upstream-status': '200' },
            })
        }
        const claimMatch = url.match(/^\/api\/model-jobs\/([^/]+)\/claim$/)
        if (claimMatch && method === 'POST') {
            return new Response('{"success":true}', { status: 200 })
        }
        const jobMatch = url.match(/^\/api\/model-jobs\/([^/]+)$/)
        if (jobMatch && method === 'DELETE') {
            return new Response('{"success":true}', { status: 200 })
        }
        if (jobMatch && method === 'GET') {
            if (behavior.jobStatusUnreachable) throw new TypeError('Failed to fetch')
            const states = behavior.jobStates?.[jobMatch[1]]
            if (!states || states.length === 0) return new Response('{"error":"Job not found"}', { status: 404 })
            const next = states.length > 1 ? states.shift() : states[0]
            return new Response(JSON.stringify(next), { status: 200 })
        }
        throw new Error(`unexpected fetch: ${method} ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const claims = () => calls.filter((c) => c.method === 'POST' && c.url.endsWith('/claim')).map((c) => c.url)
    return { calls, claims }
}

beforeEach(() => {
    mocks.db = { characters: [], inlayErrorResponse: true, showRequestStatus: true }
    mocks.recordRequestLog.mockReset()
    mocks.notifyError.mockReset()
    mocks.notifyInfo.mockReset()
    mocks.ensureChatHydrated.mockReset()
    mocks.saveChatToServer.mockReset()
    mocks.saveChatToServer.mockResolvedValue(undefined)
})

afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
})

function deferredJournal(fail = false) {
    let entered!: () => void
    const started = new Promise<void>(resolve => { entered = resolve })
    let released = false
    const controllers: ReadableStreamDefaultController<Uint8Array>[] = []
    const calls: {url: string, method: string}[] = []
    const finish = (controller: ReadableStreamDefaultController<Uint8Array>) => {
        if (fail) controller.error(new Error('synthetic journal failure'))
        else {
            controller.enqueue(new TextEncoder().encode(OPENAI_SSE))
            controller.close()
        }
    }
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        calls.push({url, method: init?.method ?? 'GET'})
        if (url.endsWith('/stream')) return new Response(new ReadableStream<Uint8Array>({
            start(controller) {
                controllers.push(controller)
                entered()
                if (released) finish(controller)
            },
        }), {status: 200, headers: {'content-type':'text/event-stream', 'x-model-job-upstream-status':'200'}})
        if (url.endsWith('/claim')) return new Response('{"success":true}', {status:200})
        throw new Error('Unexpected synthetic endpoint')
    }))
    return {
        started, calls,
        release() { released = true; for (const controller of controllers) finish(controller) },
        claims: () => calls.filter(call => call.method === 'POST' && call.url.endsWith('/claim')),
    }
}

function partial(data = 'H') {
    return {role:'char',data,chatId:'gen-1',generationInfo:{generationId:'gen-1'}}
}
function characterWith(chat: any) {
    const char = makeChar(chat)
    mocks.db.characters = [char]
    return char
}
function expectNoRecoveryWrites() {
    expect(mocks.saveChatToServer).not.toHaveBeenCalled()
    expect(mocks.recordRequestLog).not.toHaveBeenCalled()
}

describe('terminal recovery identity and writer ownership', () => {
    test.each(['gen-1', 'continuation-gen-2'])('defers while chat has a live generation %s', async generationId => {
        const chat = makeChat()
        characterWith(chat)
        const {recovery,genState} = await loadModules()
        genState.startGeneration(genState.chatGenKey('chat-1'),generationId,'live')
        const server=setupServer({journals:{'job-1':OPENAI_SSE}})
        await recovery.recoverTerminalJob(makeJob())
        expect(chat.message).toEqual([])
        expect(server.calls).toEqual([])
        expectNoRecoveryWrites()
    })

    test('allows the poll owner with a background entry to recover', async () => {
        const chat=makeChat();characterWith(chat)
        const {recovery,genState}=await loadModules()
        genState.startGeneration(genState.chatGenKey('chat-1'),'gen-1','background')
        const server=setupServer({journals:{'job-1':OPENAI_SSE}})
        await recovery.recoverTerminalJob(makeJob())
        expect(chat.message).toHaveLength(1)
        expect(chat.message[0]).toMatchObject({data:'Hello',chatId:'gen-1'})
        expect(server.claims()).toHaveLength(1)
        expect(mocks.recordRequestLog).toHaveBeenCalledTimes(1)
    })

    test('rechecks identity after a live result appears during the journal read', async () => {
        const chat=makeChat();characterWith(chat)
        const {recovery}=await loadModules();const server=deferredJournal()
        const pending=recovery.recoverTerminalJob(makeJob());await server.started
        const original=partial('A live response that must be preserved')
        chat.message.push(original);server.release();await pending
        expect(chat.message).toEqual([original])
        expect(chat.message[0]).toBe(original)
        expect(server.claims()).toHaveLength(1)
    })

    test('defers if a live writer starts while the journal is read', async () => {
        const chat=makeChat();characterWith(chat)
        const {recovery,genState}=await loadModules();const server=deferredJournal()
        const pending=recovery.recoverTerminalJob(makeJob());await server.started
        genState.startGeneration(genState.chatGenKey('chat-1'),'gen-2','live')
        server.release();await pending
        expect(chat.message).toEqual([])
        expect(server.claims()).toEqual([])
        expectNoRecoveryWrites()
    })

    test('joins concurrent recovery of one job through publication', async () => {
        const chat=makeChat();characterWith(chat)
        const {recovery}=await loadModules();const server=deferredJournal()
        const first=recovery.recoverTerminalJob(makeJob());await server.started
        let settled=false
        const second=recovery.recoverTerminalJob(makeJob()).then(()=>{settled=true})
        await Promise.resolve()
        expect(settled).toBe(false)
        server.release();await Promise.all([first,second])
        expect(chat.message).toHaveLength(1)
        expect(server.calls.filter(call=>call.url.endsWith('/stream'))).toHaveLength(1)
        expect(server.claims()).toHaveLength(1)
        expect(mocks.saveChatToServer).toHaveBeenCalledTimes(1)
        expect(mocks.recordRequestLog).toHaveBeenCalledTimes(1)
    })

    test('writes through the current chat after object replacement', async () => {
        const old=makeChat();const char=characterWith(old)
        const {recovery}=await loadModules();const server=deferredJournal()
        const pending=recovery.recoverTerminalJob(makeJob());await server.started
        const current=makeChat();char.chats[0]=current
        server.release();await pending
        expect(old.message).toEqual([])
        expect(current.message).toHaveLength(1)
        expect(current.message[0].data).toBe('Hello')
        expect(mocks.saveChatToServer.mock.calls[0][3]).toBe(current)
    })

    test('does not mutate or claim a newly dehydrated chat', async () => {
        const old=makeChat();const char=characterWith(old)
        const {recovery}=await loadModules();const server=deferredJournal()
        const pending=recovery.recoverTerminalJob(makeJob());await server.started
        const current={id:'chat-1',_placeholder:true,message:[]}
        char.chats[0]=current
        server.release();await pending
        expect(current.message).toEqual([])
        expect(old.message).toEqual([])
        expect(server.claims()).toEqual([])
        expectNoRecoveryWrites()
    })

    test('claims without recreating a chat removed during the read', async () => {
        const old=makeChat();const char=characterWith(old)
        const {recovery}=await loadModules();const server=deferredJournal()
        const pending=recovery.recoverTerminalJob(makeJob());await server.started
        char.chats=[]
        server.release();await pending
        expect(char.chats).toEqual([])
        expect(old.message).toEqual([])
        expect(server.claims()).toHaveLength(1)
        expect(mocks.saveChatToServer).not.toHaveBeenCalled()
    })

    test('does not resurrect a partial row removed during the read', async () => {
        const chat=makeChat({message:[partial()]});characterWith(chat)
        const {recovery}=await loadModules();const server=deferredJournal()
        const pending=recovery.recoverTerminalJob(makeJob());await server.started
        chat.message=[]
        server.release();await pending
        expect(chat.message).toEqual([])
        expect(server.claims()).toHaveLength(1)
        expect(mocks.saveChatToServer).not.toHaveBeenCalled()
    })

    test('fills the current identity after earlier rows shift its index', async () => {
        const target=partial(),other={role:'user',data:'Preserve me',chatId:'unrelated'}
        const chat=makeChat({message:[target]});characterWith(chat)
        const {recovery}=await loadModules();const server=deferredJournal()
        const pending=recovery.recoverTerminalJob(makeJob());await server.started
        chat.message.unshift(other)
        server.release();await pending
        expect(chat.message[0]).toEqual(other)
        expect(chat.message[1]).toMatchObject({chatId:'gen-1',data:'Hello'})
        expect(chat.message).toHaveLength(2)
    })

    test('uses the existing length rule on the current edited partial', async () => {
        const target=partial(),chat=makeChat({message:[target]});characterWith(chat)
        const {recovery}=await loadModules();const server=deferredJournal()
        const pending=recovery.recoverTerminalJob(makeJob());await server.started
        target.data='A user edit longer than the journal'
        server.release();await pending
        expect(chat.message).toEqual([target])
        expect(target.data).toBe('A user edit longer than the journal')
    })

    test('does not add an error bubble if the identity appeared during a failed read', async () => {
        const chat=makeChat();characterWith(chat)
        const {recovery}=await loadModules();const server=deferredJournal(true)
        const pending=recovery.recoverTerminalJob(makeJob());await server.started
        const original=partial('Live reply')
        chat.message.push(original)
        server.release();await pending
        expect(chat.message).toEqual([original])
        expect(server.claims()).toHaveLength(1)
    })

    test('releases the job after save failure and retries without another row', async () => {
        const chat=makeChat();characterWith(chat)
        const {recovery}=await loadModules()
        const server=setupServer({journals:{'job-1':OPENAI_SSE}})
        mocks.saveChatToServer.mockRejectedValueOnce(new Error('synthetic save failure'))
        await recovery.recoverTerminalJob(makeJob())
        expect(chat.message).toHaveLength(1)
        expect(server.claims()).toEqual([])
        await recovery.recoverTerminalJob(makeJob())
        expect(chat.message).toHaveLength(1)
        expect(server.claims()).toHaveLength(1)
    })

    test('keeps legacy jobs without generation IDs recoverable while idle', async () => {
        const chat=makeChat();characterWith(chat)
        const {recovery}=await loadModules();const server=setupServer({journals:{'job-1':OPENAI_SSE}})
        await recovery.recoverTerminalJob(makeJob({generationId:null}))
        expect(chat.message).toHaveLength(1)
        expect(typeof chat.message[0].chatId).toBe('string')
        expect(server.claims()).toHaveLength(1)
    })

    test.each([true,false])('preserves failed-job behavior with live=%s', async live => {
        const chat=makeChat();characterWith(chat)
        const {recovery,genState}=await loadModules();const server=setupServer({})
        if(live)genState.startGeneration(genState.chatGenKey('chat-1'),'gen-1','live')
        await recovery.recoverTerminalJob(makeJob({status:'failed',error:'synthetic failure'}))
        expect(chat.message).toHaveLength(live?0:1)
        expect(server.claims()).toHaveLength(live?0:1)
        expect(mocks.saveChatToServer).toHaveBeenCalledTimes(live?0:1)
    })

    test('rechecks live ownership after initial hydration', async () => {
        const chat=makeChat({_placeholder:true});const char=characterWith(chat)
        const {recovery,genState}=await loadModules();const server=setupServer({journals:{'job-1':OPENAI_SSE}})
        mocks.ensureChatHydrated.mockImplementationOnce(async () => {
            const current=makeChat();char.chats[0]=current
            genState.startGeneration(genState.chatGenKey('chat-1'),'gen-1','live')
            return current
        })
        await recovery.recoverTerminalJob(makeJob())
        expect(char.chats[0].message).toEqual([])
        expect(server.calls).toEqual([])
        expectNoRecoveryWrites()
    })
})

