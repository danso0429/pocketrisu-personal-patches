import { afterEach, describe, expect, test, vi } from 'vitest'
import {
    activeEnvironments, character, hydrate, ids, installPlugin, message,
    placeholder, publicEnv, waitFor,
} from './chatBaseless.e2-3.helpers'

vi.setConfig({ testTimeout: 60_000 })

const pluginHost = vi.hoisted(() => {
    const host = { api: null as any }
    ;(globalThis as any).__d6PluginHost = host
    return host
})

vi.mock('../process/modules', () => ({ moduleUpdate: vi.fn(), getModuleLorebooks: vi.fn(() => []) }))
vi.mock('../plugins/apiV3/factory', () => ({
    SandboxHost: class {
        constructor(api: any) { pluginHost.api = api }
        run() {}
        terminate() {}
    },
}))

afterEach(async () => {
    for (const env of activeEnvironments) await env.dispose()
    activeEnvironments.clear()
    pluginHost.api = null
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    vi.resetModules()
})

const chat = (id = 'chat-1', entries = [message('m0', 'base')], extra: Record<string, unknown> = {}): any => ({
    id, name: 'chat', note: '', localLore: [], fmIndex: -1, message: entries, ...extra,
})
const remoteWith = (base: any, ...entries: any[]) => ({
    ...structuredClone(base),
    message: [...structuredClone(base.message), ...entries],
})
const posts = (env: Awaited<ReturnType<typeof publicEnv>>, id = 'chat-1') =>
    env.requests.filter(request => request.method === 'POST' && request.chatId === id)

async function expectConflict(save: Promise<unknown>) {
    await expect(save, 'save surfaces the visible chat conflict').rejects.toMatchObject({ name: 'ChatConflictError' })
}

function evictionFixture(chaId: string, total = 8) {
    const serverChats: Record<string, any> = {}
    const slots: any[] = []
    for (let index = 0; index < total; index++) {
        const id = `chat-${index}`
        serverChats[`${chaId}|${id}`] = chat(id, [message(`m${index}`, `base ${index}`)])
        slots.push(placeholder(id))
    }
    return { serverChats, slots }
}

async function evictReadCopy(plugin: any, total = 8) {
    for (let index = 1; index < total; index++) await plugin.getChatFromIndex(0, index)
}

describe('[E2-3d6c] Install a slot base only from a read that fills the slot', () => {
    test('[new] d6c-1 a rejected unopened plugin write racing a copy read preserves remote and local messages', async () => {
        const chaId = 'd6c-1'
        const open = chat('open', [message('open', 'open')])
        const server = chat('chat-1', [message('m0', 'base'), message('o1', 'other device')])
        const env = await publicEnv({ [`${chaId}|open`]: open, [`${chaId}|chat-1`]: server }, [
            character(chaId, [open, placeholder('chat-1')], 0),
        ])
        const plugin = await installPlugin('d6c-1-plugin')
        const readGate = env.hold('GET', 'chat-1')
        const copyRead = plugin.getChatFromIndex(0, 1)
        await waitFor(() => env.requests.some(request => request.method === 'GET' && request.chatId === 'chat-1'), 'copy read')

        let rejectPluginPost = true
        env.setPostHandler(() => rejectPluginPost
            ? (rejectPluginPost = false, new Response('{}', { status: 500, headers: { 'content-type': 'application/json' } }))
            : null)
        const written = chat('chat-1', [message('p1', 'plugin local')])
        await plugin.setChatToIndex(0, 1, written).catch(() => undefined)
        expect(posts(env).some(request => request.status === 500), 'the competing plugin POST was rejected').toBe(true)

        readGate.resolve()
        await copyRead
        const live = env.stores.DBState.db.characters[0].chats[1]
        await expect(env.chatStorage.saveChatToServer(chaId, 1, 'chat-1', live), 'ordinary slot save succeeds').resolves.toBeUndefined()
        expect(ids(env.chat(chaId, 'chat-1'))).toEqual(expect.arrayContaining(['o1', 'p1']))
    })

    test('[new] d6c-2 a discarded copy read does not make a materialized slot delete a remote message', async () => {
        const chaId = 'd6c-2'
        const server = chat('chat-1', [message('m0', 'base'), message('o1', 'other device')])
        const local = chat('chat-1', [message('m0', 'base'), message('l1', 'local')])
        const env = await publicEnv({ [`${chaId}|chat-1`]: server }, [character(chaId, [local])])

        await env.chatStorage.fetchChatFromServer(chaId, 0, 'chat-1')
        await expect(env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', local), 'slot save merges after the discarded read').resolves.toBeUndefined()
        expect(ids(env.chat(chaId, 'chat-1'))).toEqual(expect.arrayContaining(['o1', 'l1']))
    })

    test('[unchanged] d6c-3 saving a modified read copy uses its view base and preserves a later reply', async () => {
        const chaId = 'd6c-3'
        const base = chat()
        const env = await publicEnv({ [`${chaId}|chat-1`]: base }, [character(chaId, [placeholder('chat-1')])])
        const view = await env.chatStorage.fetchChatFromServer(chaId, 0, 'chat-1')
        env.putChat(chaId, 'chat-1', remoteWith(base, message('o1', 'other device')))
        view.message.push(message('l1', 'view edit') as any)

        await expect(env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', view), 'detached view save succeeds after rebase').resolves.toBeUndefined()
        expect(posts(env).some(request => request.status === 409), 'the stale view rebases from its own revision').toBe(true)
        expect(ids(env.chat(chaId, 'chat-1'))).toEqual(expect.arrayContaining(['o1', 'l1']))
    })

    test('[unchanged] d6c-4 hydration supports consecutive autosaves without a false conflict', async () => {
        const chaId = 'd6c-4'
        const env = await publicEnv({ [`${chaId}|chat-1`]: chat() }, [character(chaId, [placeholder('chat-1')])])
        const live = await hydrate(env, chaId, 0)
        live.message.push(message('l1', 'first edit'))
        await env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', live, undefined, { live: true })
        live.message.push(message('l2', 'second edit'))
        await env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', live, undefined, { live: true })

        expect(posts(env).map(request => request.status)).not.toContain(409)
        expect(ids(env.chat(chaId, 'chat-1'))).toEqual(['m0', 'l1', 'l2'])
    })

    test('[unchanged] d6c-5a a full-read token is accepted without a slot base and later rebases safely', async () => {
        const chaId = 'd6c-5a'
        const base = chat()
        const env = await publicEnv({ [`${chaId}|chat-1`]: base }, [character(chaId, [placeholder('chat-1')])])
        const plugin = await installPlugin('d6c-5a-plugin')
        const held = structuredClone(await plugin.getChatFromIndex(0, 0))

        await plugin.setChatToIndex(0, 0, chat('chat-1', [message('draft', 'tokenless transition')]))
        held.message.push(message('p1', 'plugin'))
        await expect(plugin.setChatToIndex(0, 0, held), 'the valid full-read token is accepted without a slot base').resolves.toBeUndefined()

        env.putChat(chaId, 'chat-1', remoteWith(base, message('o1', 'other device')))
        const live = env.stores.DBState.db.characters[0].chats[0]
        await expect(env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', live, undefined, { live: true }), 'token-based slot save rebases').resolves.toBeUndefined()
        expect(ids(env.chat(chaId, 'chat-1'))).toEqual(expect.arrayContaining(['o1', 'p1']))
    })

    test('[new] d6c-5b a revision-only token without a slot base ends in a safe conflict', async () => {
        const chaId = 'd6c-5b'
        const { serverChats, slots } = evictionFixture(chaId)
        const base = serverChats[`${chaId}|chat-0`]
        const env = await publicEnv(serverChats, [character(chaId, slots)])
        const plugin = await installPlugin('d6c-5b-plugin')
        const held = structuredClone(await plugin.getChatFromIndex(0, 0))
        await evictReadCopy(plugin)

        env.putChat(chaId, 'chat-0', remoteWith(base, message('o1', 'other device')))
        await plugin.setChatToIndex(0, 0, chat('chat-0', [message('draft', 'tokenless transition')]))
        held.message.push(message('p1', 'plugin'))
        await expect(plugin.setChatToIndex(0, 0, held), 'the revision-only token is accepted without a slot base').resolves.toBeUndefined()

        const live = env.stores.DBState.db.characters[0].chats[0]
        await expectConflict(env.chatStorage.saveChatToServer(chaId, 0, 'chat-0', live, undefined, { live: true }))
        expect(ids(env.chat(chaId, 'chat-0'))).toContain('o1')
    })

    test.each([
        ['unchanged', 'kept copy'],
        ['new', 'revision only'],
    ])('[%s] d6c-7 an old token with %s never overwrites a newer remote message after the slot base is removed', async (_tag, variant) => {
        const chaId = `d6c-7-${variant.replace(' ', '-')}`
        const total = variant === 'revision only' ? 8 : 2
        const { serverChats, slots } = evictionFixture(chaId, total)
        const base = serverChats[`${chaId}|chat-0`]
        const env = await publicEnv(serverChats, [character(chaId, slots)])
        await hydrate(env, chaId, 0)
        const plugin = await installPlugin(`d6c-7-${variant}-plugin`)
        const held = structuredClone(await plugin.getChatFromIndex(0, 0))
        if (variant === 'revision only') await evictReadCopy(plugin)

        env.putChat(chaId, 'chat-0', remoteWith(base, message('o1', 'other device')))
        await plugin.setChatToIndex(0, 0, chat('chat-0', [message('draft', 'tokenless transition')]))
        held.message.push(message('p1', 'plugin'))
        await expect(plugin.setChatToIndex(0, 0, held), 'the old token is accepted without a slot base').resolves.toBeUndefined()

        const written = env.stores.DBState.db.characters[0].chats[0]
        const save = env.chatStorage.saveChatToServer(chaId, 0, 'chat-0', written, undefined, { live: true })
        if (variant === 'revision only') await expectConflict(save)
        else await expect(save, 'the kept-copy token rebases').resolves.toBeUndefined()
        expect(ids(env.chat(chaId, 'chat-0'))).toContain('o1')
        if (variant === 'kept copy') expect(ids(env.chat(chaId, 'chat-0'))).toContain('p1')
    })

    test('[unchanged] accepted 3.1 a known-base 409 rebase honors a deletion and keeps remote and local additions', async () => {
        const chaId = 'accepted-3-1'
        const base = chat('chat-1', [message('m0', 'base'), message('m1', 'delete locally')])
        const env = await publicEnv({ [`${chaId}|chat-1`]: base }, [character(chaId, [placeholder('chat-1')])])
        const live = await hydrate(env, chaId, 0)
        live.message = [live.message[0], message('l1', 'local')]
        env.putChat(chaId, 'chat-1', remoteWith(base, message('o1', 'other device')))

        await expect(env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', live), 'known-base rebase succeeds').resolves.toBeUndefined()
        expect(ids(env.chat(chaId, 'chat-1'))).toEqual(expect.arrayContaining(['m0', 'o1', 'l1']))
        expect(ids(env.chat(chaId, 'chat-1'))).not.toContain('m1')
    })

    test('[unchanged] accepted 3.2 an unopened tokenless plugin write replaces the server copy', async () => {
        const chaId = 'accepted-3-2'
        const open = chat('open', [message('open', 'open')])
        const server = chat('chat-1', [message('m0', 'base'), message('o1', 'remote')])
        const env = await publicEnv({ [`${chaId}|open`]: open, [`${chaId}|chat-1`]: server }, [
            character(chaId, [open, placeholder('chat-1')], 0),
        ])
        const plugin = await installPlugin('accepted-3-2-plugin')
        await plugin.setChatToIndex(0, 1, chat('chat-1', [message('p1', 'plugin')]))
        expect(ids(env.chat(chaId, 'chat-1'))).toEqual(['p1'])
    })

    test('[unchanged] accepted 3.3 an identical save after an open tokenless plugin write keeps replacement semantics', async () => {
        const chaId = 'accepted-3-3'
        const server = chat('chat-1', [message('m0', 'base'), message('o1', 'remote')])
        const env = await publicEnv({ [`${chaId}|chat-1`]: server }, [character(chaId, [placeholder('chat-1')])])
        const plugin = await installPlugin('accepted-3-3-plugin')
        await plugin.setChatToIndex(0, 0, chat('chat-1', [message('p1', 'plugin')]))
        const live = env.stores.DBState.db.characters[0].chats[0]
        await env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', live, undefined, { live: true })
        expect(ids(env.chat(chaId, 'chat-1'))).toEqual(['p1'])
    })

    test('[unchanged] accepted 3.4 a new chat uses create-only semantics', async () => {
        const chaId = 'accepted-3-4'
        const local = chat('new-chat', [message('l1', 'new')])
        const env = await publicEnv({}, [character(chaId, [local])])
        await env.chatStorage.saveChatToServer(chaId, 0, 'new-chat', local, 'create')
        expect(posts(env, 'new-chat')[0]?.headers['if-none-match']).toBe('*')
        expect(ids(env.chat(chaId, 'new-chat'))).toEqual(['l1'])
    })

    test('[unchanged] accepted 3.5 updating a chat deleted on the server conflicts instead of recreating it', async () => {
        const chaId = 'accepted-3-5'
        const base = chat()
        const env = await publicEnv({ [`${chaId}|chat-1`]: base }, [character(chaId, [placeholder('chat-1')])])
        const live = await hydrate(env, chaId, 0)
        env.deleteChat(chaId, 'chat-1')
        live.message.push(message('l1', 'local edit'))
        await expectConflict(env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', live, 'update'))
        expect(env.chat(chaId, 'chat-1')).toBeUndefined()
    })
})
