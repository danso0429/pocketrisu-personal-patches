import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import eligibility from './bgPluginEligibility.cjs'
const { hasPluginBindings, canStartPluginHost } = eligibility
const bindings = () => ({ bgPluginBindings: {
    nativeFetch() {}, risuFetch() {}, requestChatDataMain() {}, installProvider() {}, characterMetadata() {},
    allowedDbKeys: [], bodyInterceptors: [], registry: { providers: new Map(),
        replacerbeforeRequest: new Set(), replacerafterRequest: new Set(), editinput: new Set(),
        editoutput: new Set(), editprocess: new Set(), editdisplay: new Set() },
} })
describe('operation-bound plugin host eligibility', () => {
    it.each(['OFF', 'ON', 'missing bindings', 'bundle failure'])('keeps existing capabilities while checking actual host bindings: %s', async mode => {
        const source = readFileSync(new URL('./bgOrchestrator.cjs', import.meta.url), 'utf8')
        const start = source.indexOf("  app.get('/api/bg-orchestrate-capabilities'")
        const end = source.indexOf('\n  })', start) + '\n  })'.length
        expect(start).toBeGreaterThan(0)
        expect(end).toBeGreaterThan(start)
        let handler: (request: unknown, response: unknown) => Promise<void>
        let loads = 0, result: any
        new Function('app', 'sessionAuthMiddleware', 'deps', 'hasPluginBindings', 'loadBundle', 'serverChatInputOwner', 'serverChatCommitOwner', source.slice(start, end))(
            { get: (_path: string, _auth: unknown, callback: typeof handler) => { handler = callback } },
            () => {}, { bgPluginDependencies: { enabled: mode !== 'OFF' } }, hasPluginBindings,
            async () => { loads++; if (mode === 'bundle failure') throw Error('synthetic load failure'); return mode === 'missing bindings' ? {} : bindings() }, {}, {},
        )
        await handler!(null, { json: (value: unknown) => { result = value } })
        expect(result).toEqual({ contract: 'bg_orchestration_capabilities.v1', inputCommandVersion: 1,
            clientInputPreparationVersion: 1, serverInputBaseVersion: 1, serverChatCommitVersion: 1,
            inputCommandFoundationVersion: 4, chatExecutionProjectionVersion: 1,
            serverPluginHostVersion: mode === 'ON' ? 1 : 0 })
        expect(loads).toBe(mode === 'OFF' ? 0 : 1)
    })
    it('requires the exact start conditions and complete native bindings', () => {
        const control = { resultKeyVersion: 1, serverChatCommitVersion: 1 }, bg = bindings()
        expect(canStartPluginHost('full', control, { enabled: true }, bg)).toBe(true)
        expect(canStartPluginHost('prepared', control, { enabled: true }, bg)).toBe(false)
        expect(canStartPluginHost('full', { ...control, resultKeyVersion: 0 }, { enabled: true }, bg)).toBe(false)
        expect(canStartPluginHost('full', { ...control, serverChatCommitVersion: 0 }, { enabled: true }, bg)).toBe(false)
        expect(canStartPluginHost('full', control, { enabled: false }, bg)).toBe(false)
        expect(hasPluginBindings(null)).toBe(false)
        ;(bg.bgPluginBindings as any).nativeFetch = undefined
        expect(canStartPluginHost('full', control, { enabled: true }, bg)).toBe(false)
    })
})
