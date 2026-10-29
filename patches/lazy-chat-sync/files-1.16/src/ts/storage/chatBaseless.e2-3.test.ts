import { afterEach, describe, expect, test, vi } from 'vitest'
import {
    activeEnvironments, character, delay, hydrate, ids, installPlugin, message,
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
    id, name: 'local', note: '', localLore: [], fmIndex: -1, message: entries, ...extra,
})
const remoteWith = (base: any, ...entries: any[]) => {
    const copy = JSON.parse(JSON.stringify(base))
    return { ...copy, message: [...copy.message, ...entries] }
}
const posts = (env: Awaited<ReturnType<typeof publicEnv>>, id = 'chat-1') =>
    env.requests.filter(request => request.method === 'POST' && request.chatId === id)

async function expectConflict(save: Promise<unknown>) {
    await expect(save, 'save surfaces the visible chat conflict').rejects.toMatchObject({ name: 'ChatConflictError' })
}

describe('[E2-3d6a] Capture non-live chat saves at call time while the database state loads', () => {
    test.each([false, true])('[new] d6-8 pre-load %s save keeps its call-time base and preserves o1', async (delta) => {
        const chaId = `d6-8-${delta}`
        const base = chat()
        const env = await publicEnv({ [`${chaId}|chat-1`]: base }, [character(chaId, [placeholder('chat-1')])], { delta })
        const live = await hydrate(env, chaId, 0)
        live.message.push(message('l1', 'captured edit'))
        env.putChat(chaId, 'chat-1', remoteWith(base, message('o1', 'other device')))
        const timingReadGate = env.hold('GET', 'chat-1')
        const timingRead = env.chatStorage.fetchChatFromServer(chaId, 0, 'chat-1')
        await waitFor(() => env.requests.some(request => request.method === 'GET' && request.ordinal > 1), 'later full-read timing stimulus')
        timingReadGate.resolve()
        const pending = env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', live)
        const overtaker = JSON.parse(JSON.stringify(live)); overtaker.name = 'later context'
        const laterSave = env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', overtaker).catch(() => undefined)
        live.message.push(message('later', 'after call'))
        await timingRead
        await expect(pending, 'pre-load save rebases from its call-time base').resolves.toBeUndefined()
        await laterSave
        expect(posts(env)[0]?.sent?.name, 'the cold call reserves the queue before a later self-captured save').toBe('local')
        await env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', live)
        expect(ids(env.chat(chaId, 'chat-1')), 'a later save retains the other-device message').toContain('o1')
    })

    test('[new] d6-9a a slot replaced before load completion is not published after a 409', async () => {
        const chaId = 'd6-9a'
        const base = chat()
        const open = chat('open', [message('open', 'open')])
        const env = await publicEnv({ [`${chaId}|chat-1`]: base, [`${chaId}|open`]: open }, [character(chaId, [placeholder('chat-1'), open], 1)])
        const original = await hydrate(env, chaId, 0)
        const plugin = await installPlugin('d6-9a-plugin')
        original.message.push(message('l1', 'old slot'))
        env.putChat(chaId, 'chat-1', remoteWith(base, message('o1', 'other device')))
        env.setPostHandler(request => request.sent?.name === 'later context'
            ? new Response('{}', { status: 500, headers: { 'content-type': 'application/json' } })
            : null)
        const baseGate = env.hold('GET', 'chat-1')
        const laterBase = env.chatStorage.fetchChatFromServer(chaId, 0, 'chat-1')
        await waitFor(() => env.requests.filter(request => request.method === 'GET').length >= 2, 'later base GET')
        baseGate.resolve()
        const pending = env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', original)
        const overtaker = JSON.parse(JSON.stringify(original)); overtaker.name = 'later context'
        const laterSave = plugin.setChatToIndex(0, 0, overtaker).catch(() => undefined)
        const replacement = remoteWith(base, message('l2', 'new slot'))
        env.stores.DBState.db.characters[0].chats[0] = replacement
        await laterBase
        await expect(pending, 'the old slot save completes without publishing into the replacement').resolves.toBeUndefined()
        await laterSave
        expect(posts(env)[0]?.sent?.name, 'the cold replaced-slot call reserves the queue first').toBe('local')
        expect(posts(env).some(request => request.status === 409), 'the old-slot save is accepted after a 409 merge').toBe(true)
        expect(ids(replacement), 'the accepted merge is not published into the replacement slot').toEqual(['m0', 'l2'])
        await env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', replacement)
        expect(ids(env.chat(chaId, 'chat-1'))).toEqual(expect.arrayContaining(['o1', 'l2']))
    })

    test('[unchanged] d6-9b a slot replaced after loading is not published after a 409', async () => {
        const chaId = 'd6-9b'
        const base = chat()
        const env = await publicEnv({ [`${chaId}|chat-1`]: base }, [character(chaId, [placeholder('chat-1')])])
        const original = await hydrate(env, chaId, 0)
        original.message.push(message('l1', 'old slot'))
        env.putChat(chaId, 'chat-1', remoteWith(base, message('o1', 'other device')))
        const gate = env.hold('POST', 'chat-1')
        const pending = env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', original)
        await waitFor(() => posts(env).length === 1, 'first POST')
        const replacement = remoteWith(base, message('l2', 'new slot'))
        env.stores.DBState.db.characters[0].chats[0] = replacement
        gate.resolve()
        await pending
        await env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', replacement)
        expect(ids(env.chat(chaId, 'chat-1'))).toEqual(expect.arrayContaining(['o1', 'l2']))
    })

    test.each(['earlier save fails', 'preparation fails'])('[new] d6-10a pre-load saves remain FIFO when %s', async (variant) => {
        const chaId = `d6-10a-${variant}`
        const base = chat()
        const env = await publicEnv({ [`${chaId}|chat-1`]: base }, [character(chaId, [base])])
        let failed = false
        env.setPostHandler(request => {
            if (!failed && variant === 'earlier save fails') {
                failed = true
                return new Response('{}', { status: 500, headers: { 'content-type': 'application/json' } })
            }
            return null
        })
        const first = structuredClone(base); first.name = 'S1'
        const second = structuredClone(base); second.name = 'S2'
        const third = structuredClone(base); third.name = 'S3'
        if (variant === 'preparation fails') (first as any).cycle = first
        const saves = [first, second].map(value => env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', value).catch(() => undefined))
        await Promise.resolve()
        const thirdContext = env.storage.beginChatSave(chaId, 'chat-1', third)
        saves.push(env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', third, undefined, { context: thirdContext }).catch(() => undefined))
        await Promise.all(saves)
        expect(posts(env).map(request => request.sent?.name), 'actual requests preserve call order and continue after failure')
            .toEqual(variant === 'preparation fails' ? ['S2', 'S3'] : ['S1', 'S2', 'S3'])
    })

    test('[unchanged] d6-10b post-load saves are sent in call order', async () => {
        const chaId = 'd6-10b'
        const base = chat()
        const env = await publicEnv({ [`${chaId}|chat-1`]: base }, [character(chaId, [placeholder('chat-1')])])
        const live = await hydrate(env, chaId, 0)
        env.setPostHandler(() => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }))
        const gate = env.hold('POST', 'chat-1')
        live.name = 'S1'; const first = env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', live).catch(() => undefined)
        await waitFor(() => posts(env).length === 1, 'first POST')
        const secondBody = JSON.parse(JSON.stringify(live)); secondBody.name = 'S2'
        const thirdBody = JSON.parse(JSON.stringify(live)); thirdBody.name = 'S3'
        const second = env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', secondBody).catch(() => undefined)
        const third = env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', thirdBody).catch(() => undefined)
        gate.resolve()
        await Promise.all([first, second, third])
        expect(posts(env).map(request => request.sent?.name)).toEqual(['S1', 'S2', 'S3'])
    })

    test('[unchanged] d6-18 pre-load detached context and view saves retain their exceptions', async () => {
        const chaId = 'd6-18'
        const base = chat()
        const env = await publicEnv({ [`${chaId}|chat-1`]: base }, [character(chaId, [placeholder('chat-1')])])
        const view = await env.chatStorage.fetchChatFromServer(chaId, 0, 'chat-1')
        const context = env.storage.beginChatSave(chaId, 'chat-1', view, { detached: true })
        const pending = env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', view!, undefined, { context })
        await expect(pending).resolves.toBeUndefined()
        expect(ids(env.chat(chaId, 'chat-1'))).toEqual(['m0'])
    })
})

describe('[E2-3d6b] Merge without deletion when a slot save has no base', () => {
    test('[new] d6-1 accepted create across a database replacement preserves o1 on the immediate update', async () => {
        const chaId = 'd6-1'
        const local = chat('new-chat', [message('l1', 'local')])
        const env = await publicEnv({}, [character(chaId, [local])])
        void env.api.saveDb()
        await delay(500)
        const gate = env.hold('POST', 'new-chat')
        const create = env.chatStorage.saveChatToServer(chaId, 0, 'new-chat', local, 'create')
        await waitFor(() => posts(env, 'new-chat').length === 1, 'create POST')
        const previousDb = env.stores.DBState.db
        const replacementDb = {
            characters: [character(chaId, [structuredClone(local)])],
            botPresets: [], modules: [], plugins: [], pluginCustomStorage: {},
        }
        env.setReadDatabase(replacementDb)
        env.setWriteHandler(call => call === 1
            ? new Response(JSON.stringify({ error: 'foreign write', currentEtag: 'foreign-etag' }), {
                status: 409, headers: { 'content-type': 'application/json' },
            })
            : new Response(JSON.stringify({ etag: `write-${call}` }), {
                status: 200, headers: { 'content-type': 'application/json' },
            }))
        await env.api.requestImmediateSave({ forceFullWrite: true })
        await waitFor(() => env.stores.DBState.db !== previousDb, 'database replacement')
        gate.resolve()
        await expect(create, 'create is accepted across replacement').resolves.toBeUndefined()
        const replacement = env.stores.DBState.db.characters[0].chats[0]
        env.putChat(chaId, 'new-chat', remoteWith(local, message('o1', 'other device')))
        await expect(env.chatStorage.saveChatToServer(chaId, 0, 'new-chat', replacement, 'update'), 'following update merges').resolves.toBeUndefined()
        expect(ids(env.chat(chaId, 'new-chat'))).toEqual(expect.arrayContaining(['o1', 'l1']))
    })

    test.each([
        ['local optional field', { topic: 'local topic' }],
        ['local canonical note', { note: '' }],
        ['deleted optional field', { topic: undefined }],
    ])('[new] d6-2/d6-15 no-base merge preserves both sides and %s', async (_variant, fields) => {
        const chaId = `d6-2-${_variant}`
        const server = chat('chat-1', [message('shared', 'server'), message('o1', 'remote')], { topic: 'server topic', note: 'server note' })
        const local = chat('chat-1', [message('shared', 'edited locally'), message('l1', 'local')], fields)
        if ((fields as any).topic === undefined) delete (local as any).topic
        const env = await publicEnv({ [`${chaId}|chat-1`]: server }, [character(chaId, [local])])
        await expect(env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', local), 'no-base merge succeeds').resolves.toBeUndefined()
        expect(ids(env.chat(chaId, 'chat-1'))).toEqual(['shared', 'o1', 'l1'])
        expect(env.stores.DBState.db.characters[0].chats[0].message[0].data).toBe('edited locally')
        local.message.push(message('l2', 'follow-up'))
        await env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', local)
        expect(ids(env.chat(chaId, 'chat-1'))).toContain('o1')
        if (_variant === 'deleted optional field') expect(env.chat(chaId, 'chat-1')).not.toHaveProperty('topic')
        else expect(env.chat(chaId, 'chat-1')).toMatchObject(fields)
    })

    test.each([
        ['local missing', [message(undefined, 'bad')], [message('s1', 'server')]],
        ['server missing', [message('l1', 'local')], [message(undefined, 'bad')]],
        ['local empty', [message('', 'bad')], [message('s1', 'server')]],
        ['server empty', [message('l1', 'local')], [message('', 'bad')]],
        ['local non-string', [message(7, 'bad')], [message('s1', 'server')]],
        ['server non-string', [message('l1', 'local')], [message(7, 'bad')]],
        ['local duplicate', [message('x', 'one'), message('x', 'two')], [message('x', 'server')]],
        ['server duplicate', [message('x', 'local')], [message('x', 'one'), message('x', 'two')]],
        ['reordered shared only', [message('a', 'a'), message('b', 'b')], [message('b', 'b'), message('a', 'a')]],
        ['reordered with remote-only', [message('a', 'a'), message('b', 'b')], [message('b', 'b'), message('o1', 'remote'), message('a', 'a')]],
    ])('[new] d6-3 %s input conflicts without writing and remains retryable', async (_variant, localMessages, serverMessages) => {
        const chaId = `d6-3-${_variant}`
        const server = chat('chat-1', serverMessages)
        const local = chat('chat-1', localMessages)
        const env = await publicEnv({ [`${chaId}|chat-1`]: server }, [character(chaId, [local])])
        await expectConflict(env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', local))
        expect(posts(env), 'validation sends no POST').toHaveLength(0)
        expect(env.chat(chaId, 'chat-1')).toEqual(server)
        await expectConflict(env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', local))
    })

    test('[new] d6-4 streaming no-base save conflicts visibly, stays pending, then merges', async () => {
        const chaId = 'd6-4'
        const server = chat('chat-1', [message('o1', 'remote')])
        const local = chat('chat-1', [message('l1', 'stream')], { isStreaming: true })
        const env = await publicEnv({ [`${chaId}|chat-1`]: server }, [character(chaId, [local])])
        await expectConflict(env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', local))
        expect(posts(env), 'streaming request does not issue an overwrite POST').toHaveLength(0)
        local.isStreaming = false
        await expect(env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', local), 'pending save merges after streaming').resolves.toBeUndefined()
        expect(ids(env.chat(chaId, 'chat-1'))).toEqual(expect.arrayContaining(['o1', 'l1']))
    })

    test('[unchanged] d6-5 open plugin write followed by identical autosave overwrites', async () => {
        const chaId = 'd6-5'
        const server = chat('chat-1', [message('o1', 'remote')])
        const env = await publicEnv({ [`${chaId}|chat-1`]: server }, [character(chaId, [placeholder('chat-1')])])
        const plugin = await installPlugin('d6-5-plugin')
        const written = chat('chat-1', [message('p1', 'plugin')])
        await plugin.setChatToIndex(0, 0, written)
        const live = env.stores.DBState.db.characters[0].chats[0]
        await env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', live, undefined, { live: true })
        expect(ids(env.chat(chaId, 'chat-1'))).toEqual(['p1'])
    })

    test('[unchanged] d6-6 unopened tokenless plugin write keeps d13 overwrite behavior', async () => {
        const chaId = 'd6-6'
        const open = chat('open', [message('open', 'open')])
        const server = chat('chat-1', [message('o1', 'remote')])
        const env = await publicEnv({ [`${chaId}|open`]: open, [`${chaId}|chat-1`]: server }, [character(chaId, [open, placeholder('chat-1')], 0)])
        const plugin = await installPlugin('d6-6-plugin')
        await plugin.setChatToIndex(0, 1, chat('chat-1', [message('p1', 'plugin')]))
        expect(ids(env.chat(chaId, 'chat-1'))).toEqual(['p1'])
    })

    test.each(['same-object edit', 'queued edit', 'GET edit', 'trigger replacement'])('[new] d6-7 %s revokes plugin overwrite and preserves o1', async (variant) => {
        const chaId = `d6-7-${variant}`
        const server = chat('chat-1', [message('o1', 'remote')])
        const env = await publicEnv({ [`${chaId}|chat-1`]: server }, [character(chaId, [placeholder('chat-1')])])
        const plugin = await installPlugin(`d6-7-plugin-${variant}`)
        const written = chat('chat-1', [message('p1', 'plugin')])
        await plugin.setChatToIndex(0, 0, written)
        let live = env.stores.DBState.db.characters[0].chats[0]
        if (variant === 'trigger replacement') {
            const { setTriggerOriginChat } = await import('../process/triggerOrigin')
            const replacement = remoteWith(live, message('u1', 'user'))
            expect(setTriggerOriginChat({ chaId, chat: live } as any, replacement)).toBe(true)
            live = replacement
        } else if (variant === 'queued edit') {
            const blockerBody = structuredClone(server)
            const blockerContext = env.storage.beginChatSave(chaId, 'chat-1', blockerBody, { detached: true })
            const postGate = env.hold('POST', 'chat-1')
            const blocker = env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', blockerBody, undefined, { context: blockerContext }).catch(() => undefined)
            await waitFor(() => posts(env).length === 1, 'queue blocker POST')
            const target = env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', live)
            live.message.push(message('u1', 'user'))
            postGate.resolve()
            await blocker
            await expect(target, 'queued edited plugin content merges').resolves.toBeUndefined()
        } else if (variant === 'GET edit') {
            const getGate = env.hold('GET', 'chat-1')
            const target = env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', live)
            void target.catch(() => undefined)
            await delay(50)
            expect(env.requests.some(request => request.method === 'GET'), 'edited save reaches the server-copy read window').toBe(true)
            live.message.push(message('u1', 'user'))
            getGate.resolve()
            await expect(target, 'edit during server-copy read merges').resolves.toBeUndefined()
        } else {
            live.message.push(message('u1', 'user'))
        }
        if (variant !== 'queued edit' && variant !== 'GET edit') {
            await expect(env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', live), 'edited plugin content merges').resolves.toBeUndefined()
        }
        expect(ids(env.chat(chaId, 'chat-1'))).toContain('o1')
    })

    test('[new] d6-7d P1 completion neither clears P2 right nor installs P1 base', async () => {
        const chaId = 'd6-7d'
        const env = await publicEnv({ [`${chaId}|chat-1`]: chat() }, [character(chaId, [placeholder('chat-1')])])
        const plugin = await installPlugin('d6-7d-plugin')
        await plugin.setChatToIndex(0, 0, chat('chat-1', [message('p1', 'one')]))
        const gate = env.hold('POST', 'chat-1')
        const p1 = env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', env.stores.DBState.db.characters[0].chats[0])
        await waitFor(() => posts(env).length === 1, 'P1 POST')
        const p2Object = chat('chat-1', [message('p2', 'two')])
        await plugin.setChatToIndex(0, 0, p2Object)
        gate.resolve()
        await p1
        env.putChat(chaId, 'chat-1', chat('chat-1', [message('o2', 'remote after P1')]))
        await env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', env.stores.DBState.db.characters[0].chats[0])
        expect(ids(env.chat(chaId, 'chat-1'))).toEqual(['p2'])
    })

    test('[new] d6-7 acceptance consumes the plugin overwrite right before a later no-base save', async () => {
        const chaId = 'd6-7-accepted'
        const server = chat('chat-1', [message('o0', 'old remote')])
        const env = await publicEnv({ [`${chaId}|chat-1`]: server }, [character(chaId, [placeholder('chat-1')])])
        const plugin = await installPlugin('d6-7-accepted-plugin')
        const written = chat('chat-1', [message('p1', 'plugin')])
        await plugin.setChatToIndex(0, 0, written)
        let live = env.stores.DBState.db.characters[0].chats[0]
        await env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', live)
        live = JSON.parse(JSON.stringify(live))
        await env.dispose()
        activeEnvironments.delete(env)
        const reloaded = await publicEnv({
            [`${chaId}|chat-1`]: remoteWith(live, message('o1', 'remote after acceptance')),
        }, [character(chaId, [live])])
        await expect(reloaded.chatStorage.saveChatToServer(chaId, 0, 'chat-1', live), 'later no-base save merges').resolves.toBeUndefined()
        expect(ids(reloaded.chat(chaId, 'chat-1'))).toContain('o1')
    })

    test('[unchanged] d6-7e a definitely rejected plugin overwrite retains its retry right', async () => {
        const chaId = 'd6-7e'
        const env = await publicEnv({ [`${chaId}|chat-1`]: chat('chat-1', [message('o1', 'remote')]) }, [character(chaId, [placeholder('chat-1')])])
        const plugin = await installPlugin('d6-7e-plugin')
        let reject = true
        env.setPostHandler(() => reject ? (reject = false, new Response('{}', { status: 500 })) : null)
        const written = chat('chat-1', [message('p1', 'plugin')])
        await plugin.setChatToIndex(0, 0, written)
        const live = env.stores.DBState.db.characters[0].chats[0]
        await env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', live).catch(() => undefined)
        await env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', live)
        expect(ids(env.chat(chaId, 'chat-1'))).toEqual(['p1'])
    })

    test.each(['create-only', 'deleted update', '422 recovery'])('[unchanged] d6-11 %s behavior is preserved', async (variant) => {
        const chaId = `d6-11-${variant}`
        const local = chat('chat-1', [message('l1', 'local')])
        const initial = variant === 'create-only' ? {} : { [`${chaId}|chat-1`]: local }
        const env = await publicEnv(initial, [character(chaId, [local])])
        if (variant === 'create-only') {
            await env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', local, 'create')
            expect(posts(env)[0].headers['if-none-match']).toBe('*')
        } else if (variant === 'deleted update') {
            env.stores.DBState.db.characters[0].chats[0] = placeholder('chat-1')
            const hydrated = await hydrate(env, chaId, 0)
            env.deleteChat(chaId, 'chat-1')
            await expectConflict(env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', hydrated, 'update'))
        } else {
            env.deleteChat(chaId, 'chat-1')
            void env.api.saveDb()
            await delay(500)
            env.setPatchHandler(call => call === 1
                ? new Response(JSON.stringify({
                    code: 'DB_INVARIANT_REJECTED',
                    detail: 'database lists a chat without a stored body',
                    missingFullChat: { chaId, chatId: 'chat-1' },
                }), { status: 422, headers: { 'content-type': 'application/json' } })
                : new Response(JSON.stringify({ etag: `patch-${call}` }), {
                    status: 200, headers: { 'content-type': 'application/json' },
                }))
            env.api.trackCharacterForSave(chaId)
            expect(await env.api.flushSaves()).toBe(true)
            expect(ids(env.chat(chaId, 'chat-1'))).toEqual(['l1'])
        }
    })

    test('[new] d6-12 a 409 during no-base merged POST preserves o1 and o2', async () => {
        const chaId = 'd6-12'
        const server = chat('chat-1', [message('o1', 'remote one')])
        const local = chat('chat-1', [message('l1', 'local')])
        const env = await publicEnv({ [`${chaId}|chat-1`]: server }, [character(chaId, [local])])
        let changed = false
        env.setPostHandler(() => {
            if (!changed) {
                changed = true
                env.putChat(chaId, 'chat-1', remoteWith(server, message('o2', 'remote two')))
            }
            return null
        })
        await expect(env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', local), 'merge retries its 409').resolves.toBeUndefined()
        expect(ids(env.chat(chaId, 'chat-1'))).toEqual(expect.arrayContaining(['o1', 'o2', 'l1']))
    })

    test.each(['GET', 'POST'])('[new] d6-13 slot replacement during merged %s is fenced from the new slot', async (phase) => {
        const chaId = `d6-13-${phase}`
        const server = chat('chat-1', [message('o1', 'remote')])
        const original = chat('chat-1', [message('l1', 'old slot')])
        const env = await publicEnv({ [`${chaId}|chat-1`]: server }, [character(chaId, [original])])
        const gate = env.hold(phase as 'GET' | 'POST', 'chat-1')
        const pending = env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', original)
        await waitFor(() => env.requests.some(request => request.method === phase), `${phase} request`)
        const replacement = chat('chat-1', [message('l2', 'new slot')])
        env.stores.DBState.db.characters[0].chats[0] = replacement
        gate.resolve()
        await expect(pending).resolves.toBeUndefined()
        expect(ids(replacement), 'merged old content was not published into replacement').not.toContain('o1')
        await env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', replacement)
        expect(ids(env.chat(chaId, 'chat-1'))).toContain('o1')
    })

    test('[new] d6-14 the first no-base merge ignores the base-copy size limit', async () => {
        const baseCopySizeBound = 2 * 1024 * 1024
        const messagePayloadBytes = 1024
        const remoteMessageCount = Math.floor(baseCopySizeBound / messagePayloadBytes) + 128
        const chaId = 'd6-14'
        const huge = chat('chat-1', Array.from({ length: remoteMessageCount }, (_, index) => message(`o${index}`, 'x'.repeat(messagePayloadBytes))))
        const local = chat('chat-1', [message('l1', 'local')])
        const env = await publicEnv({ [`${chaId}|chat-1`]: huge }, [character(chaId, [local])])
        const polyfilledBuffer = (globalThis as any).Buffer
        const originalUtf8Write = polyfilledBuffer.prototype.utf8Write
        polyfilledBuffer.prototype.utf8Write = function (this: any, text: string, offset: number, length: number) {
            return this.write(text, offset, length, 'utf8')
        }
        try {
            await expect(env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', local), 'oversized first merge succeeds').resolves.toBeUndefined()
            expect(env.chat(chaId, 'chat-1').message).toHaveLength(remoteMessageCount + 1)
        } finally {
            if (originalUtf8Write === undefined) delete polyfilledBuffer.prototype.utf8Write
            else polyfilledBuffer.prototype.utf8Write = originalUtf8Write
        }
    })

    test.each(['initial live missing id', 'initial live duplicate id', 'initial live reorder', '409 server bad id'])('[new] d6-16 %s is validated before merge publication', async (variant) => {
        const chaId = `d6-16-${variant}`
        const server = chat('chat-1', [message('a', 'a'), message('b', 'b')])
        const local = structuredClone(server)
        const env = await publicEnv({ [`${chaId}|chat-1`]: server }, [character(chaId, [local])])
        const live = env.stores.DBState.db.characters[0].chats[0]
        if (variant === '409 server bad id') {
            let changed = false
            env.setPostHandler(() => {
                if (!changed) {
                    changed = true
                    env.putChat(chaId, 'chat-1', chat('chat-1', [message('', 'bad')]))
                }
                return null
            })
        }
        const getGate = variant === '409 server bad id' ? null : env.hold('GET', 'chat-1')
        const pending = env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', live)
        if (getGate) {
            await waitFor(() => env.requests.some(request => request.method === 'GET'), 'initial GET')
            if (variant === 'initial live missing id') live.message.push(message(undefined, 'bad'))
            else if (variant === 'initial live duplicate id') live.message.push(message('a', 'duplicate'))
            else live.message.reverse()
            getGate.resolve()
        }
        await expectConflict(pending)
        if (variant === '409 server bad id') {
            expect(posts(env), 'the rejected POST is not followed by another POST of invalid merged content').toHaveLength(1)
            expect(posts(env)[0]?.status, 'the only POST is the 409 that exposed the invalid server copy').toBe(409)
        } else {
            expect(posts(env), 'invalid initial live input is never posted').toHaveLength(0)
        }
    })

    test('[new] d6-17 direct saveChatContent without slot information merges', async () => {
        const chaId = 'd6-17'
        const server = chat('chat-1', [message('o1', 'remote')])
        const local = chat('chat-1', [message('l1', 'local')])
        const env = await publicEnv({ [`${chaId}|chat-1`]: server }, [character(chaId, [local])])
        await expect(env.storage.saveChatContent(chaId, 0, 'chat-1', local), 'direct no-slot save merges').resolves.toBeUndefined()
        expect(ids(env.chat(chaId, 'chat-1'))).toEqual(expect.arrayContaining(['o1', 'l1']))
    })

    test('[unchanged] d6-19 installing a real base revokes an open plugin overwrite right', async () => {
        const chaId = 'd6-19'
        const server = chat('chat-1', [message('o1', 'remote')])
        const env = await publicEnv({ [`${chaId}|chat-1`]: server }, [character(chaId, [placeholder('chat-1')])])
        const plugin = await installPlugin('d6-19-plugin')
        const written = chat('chat-1', [message('p1', 'plugin')])
        await plugin.setChatToIndex(0, 0, written).catch(() => undefined)
        env.putChat(chaId, 'chat-1', server)
        env.stores.DBState.db.characters[0].chats[0] = placeholder('chat-1')
        const live = await hydrate(env, chaId, 0)
        await expect(env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', live), 'base installation forces merge').resolves.toBeUndefined()
        expect(ids(env.chat(chaId, 'chat-1'))).toContain('o1')
    })

    test('[unchanged] d6-20 known-base 409 rebase still accepts legacy messages without chatId', async () => {
        const chaId = 'd6-20'
        const base = chat('chat-1', [message(undefined, 'legacy base')])
        const env = await publicEnv({ [`${chaId}|chat-1`]: base }, [character(chaId, [placeholder('chat-1')])])
        const live = await hydrate(env, chaId, 0)
        live.message.push(message(undefined, 'legacy local'))
        env.putChat(chaId, 'chat-1', remoteWith(base, message(undefined, 'legacy remote')))
        await expect(env.chatStorage.saveChatToServer(chaId, 0, 'chat-1', live), 'legacy known-base rebase succeeds').resolves.toBeUndefined()
        expect(env.chat(chaId, 'chat-1').message).toHaveLength(3)
    })
})

