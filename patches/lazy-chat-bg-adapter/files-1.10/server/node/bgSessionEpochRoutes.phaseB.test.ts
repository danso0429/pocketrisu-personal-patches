import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const registerBgOrchestrator = require('./bgOrchestrator.cjs') as (app: any, deps: any) => void
const { createSessionLock } = require('./session-lock.cjs') as any

function harness(options: {
    checkActiveSession?: (req: any, res: any) => boolean,
    epoch?: () => number,
    run?: () => any,
} = {}) {
    const routes = new Map<string, Array<(req: any, res: any, next?: () => void) => any>>()
    const app: any = {}
    for (const method of ['get', 'post', 'delete']) {
        app[method] = (route: string, ...handlers: any[]) => routes.set(`${method.toUpperCase()} ${route}`, handlers)
    }
    const runs = { get: options.run ?? (() => null), status: () => null, cancel: () => ({ cancelled: false, run: null }),
        hasChatRun: () => false, isActive: () => false, markDelivered: () => {} }
    const inputOwner = {
        read: () => null, pendingProjection: () => [], readCancelledInputProof: () => null,
        readFailedInputProof: () => null, readFailedInputAcknowledgement: () => null,
        hasPendingGeneration: () => false,
    }
    registerBgOrchestrator(app, {
        sessionAuthMiddleware: (_req: any, _res: any, next: () => void) => next?.(),
        checkActiveSession: options.checkActiveSession,
        orchestrationRuns: runs,
        serverChatInputOwner: inputOwner,
        serverChatCommitOwner: {
            readGenerationCommit: () => null,
            currentStorageEpoch: options.epoch ?? (() => 0),
        },
        kvGet: () => null, kvSet: vi.fn(), kvDel: vi.fn(), kvList: () => [], kvGetUpdatedAt: () => 0,
    })
    async function invoke(method: string, route: string, request: any = {}) {
        const handlers = routes.get(`${method.toUpperCase()} ${route}`)
        if (!handlers) throw new Error(`missing route: ${method} ${route}`)
        const result = { status: 200, body: null as any }
        const response = {
            status(code: number) { result.status = code; return this },
            json(body: any) { result.body = body; return this },
            set() { return this }, type() { return this }, send(body: any) { result.body = body; return this },
        }
        let index = -1
        const next = async (): Promise<void> => {
            index += 1
            if (handlers[index]) await handlers[index](request, response, next)
        }
        await next()
        return result
    }
    return { routes, invoke, inputOwner }
}

describe('[B2-3] BG write route session gate', () => {
    it.each([
        ['/api/bg-orchestrate', {}],
        ['/api/bg-orchestrate-input/claim', {}],
        ['/api/bg-orchestrate-input/attach', {}],
    ])('rejects stale writes before route work on %s', async (route, body) => {
        const check = vi.fn((_req, res) => {
            res.status(423).json({ error: 'Session deactivated' })
            return false
        })
        const h = harness({ checkActiveSession: check })
        await expect(h.invoke('POST', route, { headers: { 'x-session-id': 'tab-stale' }, body }))
            .resolves.toEqual({ status: 423, body: { error: 'Session deactivated' } })
        expect(check).toHaveBeenCalledTimes(1)
    })

    it('lets a fresh user-active BG start take over and makes the old id stale', async () => {
        let clock = 1_000
        const lock = createSessionLock({ now: () => clock })
        lock.register('tab-old')
        lock.checkWrite('tab-old', true)
        clock = 2_000
        lock.register('tab-new')
        const check = vi.fn((req, res) => {
            const outcome = lock.checkWrite(req.headers?.['x-session-id'], req.headers?.['x-user-active'] === '1')
            if (!outcome.ok) res.status(423).json({ error: 'Session deactivated' })
            return outcome.ok
        })
        const h = harness({ checkActiveSession: check })
        const next = await h.invoke('POST', '/api/bg-orchestrate', {
            headers: { 'x-session-id': 'tab-new', 'x-user-active': '1' }, body: {},
        })
        expect(next.status).not.toBe(423)
        expect(lock.activeId()).toBe('tab-new')
        const old = await h.invoke('POST', '/api/bg-orchestrate', {
            headers: { 'x-session-id': 'tab-old' }, body: {},
        })
        expect(old).toEqual({ status: 423, body: { error: 'Session deactivated' } })
    })

    it.each(['/api/bg-orchestrate', '/api/bg-orchestrate-input/claim', '/api/bg-orchestrate-input/attach'])
    ('accepts an id-less request through the gate on %s', async route => {
        const check = vi.fn(() => true)
        const result = await harness({ checkActiveSession: check }).invoke('POST', route, { headers: {}, body: {} })
        expect(result.status).not.toBe(423)
        expect(check).toHaveBeenCalledTimes(1)
    })

    it('does not gate abandon, DELETE, status GET, or the internal drain start', async () => {
        const check = vi.fn(() => false)
        const h = harness({ checkActiveSession: check })
        await h.invoke('POST', '/api/bg-orchestrate-input/abandon', { body: {} })
        await h.invoke('DELETE', '/api/bg-orchestrate/:operationId', { params: { operationId: 'operation-phase-b-0001' }, query: {} })
        await h.invoke('GET', '/api/bg-orchestrate-status/:operationId', {
            params: { operationId: 'operation-phase-b-0001' }, query: { charId: 'char-1', chatId: 'chat-1' },
        })
        expect(check).not.toHaveBeenCalled()
    })

    it('keeps the client-build and reset barriers ahead of the session gate', () => {
        const source = readFileSync('server/node/server.cjs', 'utf8')
        const registration = source.indexOf("require('./bgOrchestrator.cjs')")
        expect(registration).toBeGreaterThan(0)
        expect(source.indexOf('clientBuildFence.middleware')).toBeLessThan(source.indexOf('storageResetRefusalRouter'))
        expect(source.indexOf('storageResetRefusalRouter')).toBeLessThan(registration)
        expect(source.slice(registration, registration + 1_000)).toContain('checkActiveSession')
    })

    it('keeps older compositions working when checkActiveSession is absent', async () => {
        const result = await harness().invoke('POST', '/api/bg-orchestrate', { headers: { 'x-session-id': 'stale' }, body: {} })
        expect(result.status).not.toBe(423)
    })
})

describe('[B3-1] Storage epoch in start and status responses', () => {
    it.each([
        ['missing', () => null],
        ['running', () => ({ operationId: 'operation-phase-b-0001', charId: 'char-1', chatId: 'chat-1', state: 'running', resultKeyVersion: 1 })],
    ])('includes integer epoch 7 in %s status bodies', async (_name, run) => {
        const h = harness({ epoch: () => 7, run })
        const depsRoute = h.routes.get('GET /api/bg-orchestrate-status/:operationId')
        expect(depsRoute).toBeTruthy()
        // Registration closes over the supplied registry; missing is enough to pin the 404 body.
        const result = await h.invoke('GET', '/api/bg-orchestrate-status/:operationId', {
            params: { operationId: 'operation-phase-b-0001' }, query: { charId: 'char-1', chatId: 'chat-1' },
        })
        expect(result.body).toMatchObject({
            accepted: _name === 'running', operationId: 'operation-phase-b-0001',
            state: _name, storageEpoch: 7,
        })
    })

    it('defaults absent storage epoch to zero on missing status', async () => {
        const result = await harness({ epoch: () => 0 }).invoke('GET', '/api/bg-orchestrate-status/:operationId', {
            params: { operationId: 'operation-phase-b-0000' }, query: { charId: 'char-1', chatId: 'chat-1' },
        })
        expect(result.body.storageEpoch).toBe(0)
    })

    it.each([NaN, -5, 3.14])('omits malformed epoch %s without changing the status response', async malformed => {
        const result = await harness({ epoch: () => malformed }).invoke('GET', '/api/bg-orchestrate-status/:operationId', {
            params: { operationId: 'operation-phase-b-bad0' }, query: { charId: 'char-1', chatId: 'chat-1' },
        })
        expect(result).toMatchObject({ status: 404, body: { accepted: false, operationId: 'operation-phase-b-bad0', state: 'missing' } })
        expect(result.body).not.toHaveProperty('storageEpoch')
    })

    it('omits epoch when the read throws and enumerates every accepted start branch', async () => {
        const result = await harness({ epoch: () => { throw new Error('malformed epoch') } })
            .invoke('GET', '/api/bg-orchestrate-status/:operationId', {
                params: { operationId: 'operation-phase-b-throw' }, query: { charId: 'char-1', chatId: 'chat-1' },
            })
        expect(result.status).toBe(404)
        expect(result.body).not.toHaveProperty('storageEpoch')
        const source = readFileSync('server/node/bgOrchestrator.cjs', 'utf8')
        for (const signature of ['started: true', 'accepted: true', 'started: false']) expect(source).toContain(signature)
        expect((source.match(/storageEpoch/g) ?? []).length).toBeGreaterThanOrEqual(8)
    })
})
