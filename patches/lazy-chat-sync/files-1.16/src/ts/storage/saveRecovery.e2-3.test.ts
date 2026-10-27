import { describe, expect, test, vi } from 'vitest'

vi.mock('../process/modules', () => ({ moduleUpdate: vi.fn(), getModuleLorebooks: vi.fn(() => []) }))

describe('[E2-3d] Rebuild the chat revision protocol over native 1.16.1', () => {
    test('[unchanged] invariant recovery: a known chat whose server body is missing is stored again from the client copy', async () => {
        ;(globalThis as any).__PATCH_SYNC__ = true
        vi.resetModules()
        const api = await import('../globalApi.svelte') as any
        const stores = await import('../stores.svelte') as any
        const storageModule = await import('./nodeStorage')
        const codec = (await import('../../../server/node/utils.cjs')).default
        const zlib = await import('node:zlib')

        const chaId = 'cha-rec1'
        const chatId = 'chat-1'
        const clientMessages = [
            { chatId: 'm1', role: 'user', data: 'question' },
            { chatId: 'm2', role: 'char', data: 'answer held by the client' },
        ]
        stores.DBState.db = {
            characters: [{
                chaId, name: 'recovery character', chatPage: 0, chatFolders: [],
                chats: [{ id: chatId, name: 'chat', message: structuredClone(clientMessages), fmIndex: -1 }],
            }],
            botPresets: [], modules: [], plugins: [], pluginCustomStorage: {},
        }
        stores.selectedCharID.set(0)

        const server = { chat: null as any, patchCalls: 0, patchStatuses: [] as number[] }
        const storage = new storageModule.NodeStorage({ invalidate: vi.fn() } as any)
        ;(storage as any).chatDeltaSupported = false
        ;(storage as any).authFetch = vi.fn(async (url: string, init: RequestInit = {}) => {
            const path = String(url)
            const headers: Record<string, string> = Object.fromEntries(
                Object.entries((init.headers ?? {}) as Record<string, string>).map(([key, value]) => [key.toLowerCase(), value]))
            if (path.startsWith('/api/chat-content/')) {
                if (!init.method || init.method === 'GET') {
                    if (!server.chat) return new Response('{}', { status: 404 })
                    return new Response(new Uint8Array(codec.encodeRisuSaveLegacy(server.chat)).buffer, { status: 200 })
                }
                let body = Buffer.from(init.body as Uint8Array)
                if (headers['content-encoding'] === 'gzip') body = zlib.gunzipSync(body)
                if (server.chat && headers['if-none-match'] === '*') return new Response('{}', { status: 412 })
                server.chat = await codec.decodeRisuSave(body)
                return new Response('{}', { status: 200 })
            }
            if (path === '/api/patch') {
                server.patchCalls++
                if (server.patchCalls === 1) {
                    server.patchStatuses.push(422)
                    return new Response(JSON.stringify({
                        code: 'DB_INVARIANT_REJECTED',
                        detail: 'database lists a chat without a stored body',
                        missingFullChat: { chaId, chatId },
                    }), { status: 422 })
                }
                server.patchStatuses.push(200)
                return new Response(JSON.stringify({ etag: 'etag-after-recovery' }), { status: 200 })
            }
            return new Response('{}', { status: 404 })
        })
        api.forageStorage.realStorage = storage

        // saveDb never returns: it ends in the background save loop.
        void api.saveDb()
        await new Promise(resolve => setTimeout(resolve, 500))
        api.trackCharacterForSave(chaId)
        const settled = await api.flushSaves()

        expect(server.patchStatuses).toEqual([422, 200])
        expect(settled).toBe(true)
        expect(server.chat?.message?.map((entry: any) => entry.data)).toEqual(clientMessages.map(entry => entry.data))
    }, 60000)
})
