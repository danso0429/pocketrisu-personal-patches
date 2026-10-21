import { describe, expect, it, vi } from 'vitest'
import ownerPackage from './externalRequestHeaders.cjs'

const { createExternalRequestHeaders, registerExternalHeaderRoutes } = ownerPackage
const rule = { id: 'one', name: 'One', enabled: true, destination: 'https://example.test/v1', header: 'x-conversation', valueKind: 'conversation-session' }
type RouteRequest = { authenticated?: boolean; session?: string; body?: unknown }

describe('[C-3] Writer session on settings writes', () => {
    function setup() {
        const values = new Map<string, string>()
        const owner = createExternalRequestHeaders({
            kvGet: (key: string) => values.get(key),
            kvSet: (key: string, value: string) => values.set(key, value),
        })
        const routes: Record<string, Function> = {}
        const app = {
            get: (_path: string, handler: Function) => { routes.GET = handler },
            put: (_path: string, handler: Function) => { routes.PUT = handler },
        }
        return { values, owner, routes, app }
    }

    it('checks authentication before the active writer session and leaves stale writes unchanged', async () => {
        const h = setup()
        const order: string[] = []
        const auth = vi.fn(async (req: RouteRequest) => { order.push('auth'); return req.authenticated })
        const session = vi.fn(async (req: RouteRequest) => { order.push('session'); return req.session !== 'stale' })
        registerExternalHeaderRoutes(h.app, auth, h.owner, session)
        const next = vi.fn()
        const unauthenticated = { json: vi.fn(), status: vi.fn().mockReturnThis() }
        await h.routes.PUT({ authenticated: false, session: 'stale', body: { revision: 0, rules: [rule] } }, unauthenticated, next)
        expect(order).toEqual(['auth'])
        expect(session).not.toHaveBeenCalled()

        order.length = 0
        const stale = { json: vi.fn(), status: vi.fn().mockReturnThis() }
        await h.routes.PUT({ authenticated: true, session: 'stale', body: { revision: 0, rules: [rule] } }, stale, next)
        expect(order).toEqual(['auth', 'session'])
        expect(h.values.size).toBe(0)
    })

    it('admits active and id-less writes, advances revision, and does not session-check GET', async () => {
        const h = setup()
        const auth = vi.fn(async () => true)
        const session = vi.fn(async (req: RouteRequest) => req.session !== 'stale')
        registerExternalHeaderRoutes(h.app, auth, h.owner, session)
        const response = () => ({ json: vi.fn(), status: vi.fn().mockReturnThis() })

        const active = response()
        await h.routes.PUT({ session: 'active', body: { revision: 0, rules: [rule] } }, active, vi.fn())
        expect(session).toHaveBeenCalledOnce()
        expect(active.json).toHaveBeenCalledWith(expect.objectContaining({ revision: 1 }))

        const idless = response()
        await h.routes.PUT({ body: { revision: 1, rules: [] } }, idless, vi.fn())
        expect(session).toHaveBeenCalledTimes(2)
        expect(idless.json).toHaveBeenCalledWith(expect.objectContaining({ revision: 2 }))

        session.mockClear()
        await h.routes.GET({ session: 'stale' }, response(), vi.fn())
        expect(session).not.toHaveBeenCalled()
    })
})
