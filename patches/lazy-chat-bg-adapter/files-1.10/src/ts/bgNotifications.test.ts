import { describe, expect, it, vi } from 'vitest'
import { createBgNotificationDelivery, notificationMessage, parseBgNotifications } from './bgNotifications'

function harness() {
    let visible = true, monotonic = 100, now = 1_000_000
    const values = new Map<string, string>()
    const notice = { id: 'a'.repeat(64), token: 'claim-token-one', leaseMs: 30_000,
        event: { code: 'input_host_unsupported', operationId: 'operation-one', eventKey: 'input-host-unsupported',
            charId: 'char-1', chatId: 'chat-1', createdAt: now, effectsMayHaveOccurred: true, api: 'interactive_ui' } }
    const deps = { consumerId: 'consumer-one', claim: vi.fn(async (_signal: AbortSignal): Promise<unknown> => ({ notifications: [notice] })),
        acknowledge: vi.fn(async (_claims: unknown, _signal: AbortSignal) => {}), render: vi.fn(), visible: () => visible,
        monotonicNow: () => monotonic, now: () => now,
        storage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } } }
    return { notice, deps, delivery: createBgNotificationDelivery(deps),
        hide: () => { visible = false }, show: () => { visible = true },
        advance: (ms: number) => { monotonic += ms; now += ms } }
}

describe('visible notification enqueue and independent ACK', () => {
    it('validates fixed operation reasons and renders them without plugin metadata or arbitrary error text', () => {
        const h = harness()
        for (const [code, reason] of [['operation_failed', 'generation_failed'], ['operation_interrupted', 'after_main'],
            ['chat_edit_unreflected', 'concurrent_edit'], ['commit_effect_conflict', 'globals']] as const) {
            const row = { ...h.notice, event: { ...h.notice.event, code, reason } }
            expect(parseBgNotifications({ notifications: [row] })).toHaveLength(1)
            expect(notificationMessage(row)).not.toContain('undefined')
            expect(() => parseBgNotifications({ notifications: [{ ...row, event: { ...row.event, reason: 'private provider error' } }] })).toThrow()
        }
    })
    it('distinguishes a protected local write refusal and settlement warning from terminal failures',()=>{
        const h=harness(),base={...h.notice.event,pluginName:'synthetic',pluginVersion:'1',phase:'provider',effectsMayHaveOccurred:true}
        const conflict={...h.notice,event:{...base,code:'plugin_message' as const,eventKey:'plugin:synthetic:provider:local-conflict',level:'error' as const,
            message:'다른 작업에서 변경한 플러그인 값을 보존하고 이번 저장을 생략했어요. 요청은 플러그인의 오류 처리에 따라 완료되거나 중단될 수 있어요.'}}
        const terminal={...h.notice,event:{...base,code:'plugin_hook_failed' as const,eventKey:'plugin:synthetic:provider:failure'}}
        const settlement={...h.notice,event:{...base,code:'plugin_host_limit' as const,eventKey:'plugin:synthetic:settlement-budget',reason:'operation_budget' as const}}
        expect(notificationMessage(conflict)).toContain('이번 저장을 생략')
        expect(notificationMessage(terminal)).toBe('synthetic (1): 요청 처리 중 플러그인 오류가 발생했어요.')
        expect(notificationMessage(settlement)).toContain('추가 처리 대기 한도')
        expect(parseBgNotifications({notifications:[conflict]})).toEqual([conflict])
        expect(parseBgNotifications({notifications:[settlement]})).toEqual([settlement])
    })
    it('distinguishes refused API calls from terminal limits without a new reason or schema', () => {
        const h=harness()
        const event={...h.notice.event,code:'plugin_host_limit' as const,pluginName:'synthetic',pluginVersion:'1',
            phase:'before_request',reason:'operation_budget' as const,effectsMayHaveOccurred:false}
        const warning={...h.notice,event:{...event,eventKey:'plugin:synthetic:before_request:limit'}}
        const terminal={...h.notice,event:{...event,eventKey:'plugin:synthetic:before_request:failure'}}
        expect(notificationMessage(warning)).toBe('synthetic (1): 플러그인 API 호출이 실행 한도를 초과해 거부되었어요.')
        expect(notificationMessage(terminal)).toBe('synthetic (1): 서버 플러그인 실행 한도에 도달해 이 플러그인의 요청을 중단했어요.')
        expect(parseBgNotifications({notifications:[warning]})).toEqual([warning])
        expect(parseBgNotifications({notifications:[terminal]})).toEqual([terminal])
    })

    it('retries ACK without redisplaying, including a recreated page receipt ledger', async () => {
        const h = harness()
        h.deps.acknowledge.mockRejectedValueOnce(new Error('lost response'))
        await h.delivery.refresh(); await h.delivery.refresh()
        expect(h.deps.render).toHaveBeenCalledTimes(1)
        expect(h.deps.acknowledge).toHaveBeenCalledTimes(2)
        h.delivery.stop()
        await createBgNotificationDelivery(h.deps).refresh()
        expect(h.deps.render).toHaveBeenCalledTimes(1)
        expect(h.deps.acknowledge).toHaveBeenCalledTimes(3)
    })

    it('does not claim when hidden or show/ACK a response that arrives after hiding', async () => {
        const h = harness()
        h.hide(); await h.delivery.refresh()
        expect(h.deps.claim).not.toHaveBeenCalled()
        h.show()
        h.deps.claim.mockImplementationOnce(async () => { h.hide(); return { notifications: [h.notice] } })
        await h.delivery.refresh()
        expect(h.deps.render).not.toHaveBeenCalled()
        expect(h.deps.acknowledge).not.toHaveBeenCalled()
    })

    it('drops a stale lease response using monotonic time and respects stop during an in-flight request', async () => {
        const h = harness()
        h.deps.claim.mockImplementationOnce(async () => { h.advance(30_001); return { notifications: [h.notice] } })
        await h.delivery.refresh()
        expect(h.deps.render).not.toHaveBeenCalled()
        h.deps.claim.mockImplementationOnce(async () => { h.delivery.stop(); return { notifications: [h.notice] } })
        await h.delivery.refresh()
        expect(h.deps.acknowledge).not.toHaveBeenCalled()
    })

    it('does not acknowledge renderer failure and can deliver without localStorage', async () => {
        const h = harness()
        h.deps.render.mockImplementationOnce(() => { throw new Error('renderer failed') })
        await h.delivery.refresh()
        expect(h.deps.acknowledge).not.toHaveBeenCalled()
        h.deps.storage.getItem = () => { throw new Error('storage blocked') }
        h.deps.storage.setItem = () => { throw new Error('storage blocked') }
        await h.delivery.refresh(); await h.delivery.refresh()
        expect(h.deps.render).toHaveBeenCalledTimes(2)
        expect(h.deps.acknowledge).toHaveBeenCalledTimes(2)
    })

    it('rejects malformed batches instead of acknowledging unseen notices', () => {
        const h = harness()
        expect(() => parseBgNotifications({ notifications: [h.notice, h.notice] })).toThrow()
        expect(() => parseBgNotifications({ notifications: [{ ...h.notice, leaseMs: 30_001 }] })).toThrow()
        expect(() => parseBgNotifications({ notifications: [{ ...h.notice, event: { ...h.notice.event, code: 'untrusted-code' } }] })).toThrow()
    })

    it('does not run overlapping claims', async () => {
        const h = harness()
        let release!: (value: unknown) => void
        h.deps.claim.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
        const first = h.delivery.refresh()
        await h.delivery.refresh()
        expect(h.deps.claim).toHaveBeenCalledTimes(1)
        release({ notifications: [h.notice] }); await first
        expect(h.deps.render).toHaveBeenCalledTimes(1)
    })
})

describe('[D2-1] BG plugin MCP registration and calls', () => {
    it.each(['mcp_list', 'mcp_call'])('[new] accepts the %s plugin failure phase in the client validator', phase => {
        const row = { id: 'd'.repeat(64), token: 'claim-token-d2', leaseMs: 30_000,
            event: { operationId: 'operation-d2-notice', eventKey: `plugin:0:identity:${phase}:failure`,
                code: 'plugin_hook_failed', charId: 'character-1', chatId: 'chat-1', createdAt: 1,
                effectsMayHaveOccurred: phase === 'mcp_call', pluginName: 'synthetic', pluginVersion: '1.0', phase } }
        expect(parseBgNotifications({ notifications: [row] })).toEqual([row])
    })
})

describe('[D3-1] Post-commit continuation for afterRequest timers', () => {
    const row = (reason: 'deadline' | 'aborted' | 'error' | 'restart') => ({
        id: reason.charCodeAt(0).toString(16).repeat(64).slice(0, 64), token: `claim-token-d3-${reason}`, leaseMs: 30_000,
        event: { operationId: 'operation-d3-client', eventKey: 'plugin:0:post-response-uncertain',
            code: 'plugin_post_response_uncertain' as any, charId: 'character-1', chatId: 'chat-1', createdAt: 1,
            effectsMayHaveOccurred: true, pluginName: 'memory-plugin', pluginVersion: '3.0',
            phase: 'post_response', reason },
    })

    it.each(['deadline', 'aborted', 'error', 'restart'] as const)(
        '[new] validates post-response reason %s and renders the fixed Korean message', reason => {
            const notice = row(reason)
            expect(parseBgNotifications({ notifications: [notice] })).toEqual([notice])
            expect(notificationMessage(notice as any)).toBe(
                'memory-plugin (3.0): 답변 뒤 플러그인 동기화가 확인되지 않았어요. 저장된 답변은 그대로예요.',
            )
        },
    )

    it('[new] rejects an unknown reason, old phase, or false effects claim for the new code', () => {
        const notice = row('error')
        expect(parseBgNotifications({ notifications: [notice] }), 'the valid new notice must pass before rejection cases are meaningful')
            .toEqual([notice])
        expect(() => parseBgNotifications({ notifications: [{ ...notice,
            event: { ...notice.event, reason: 'private-error-text' } }] })).toThrow()
        expect(() => parseBgNotifications({ notifications: [{ ...notice,
            event: { ...notice.event, phase: 'after_request' } }] })).toThrow()
        expect(() => parseBgNotifications({ notifications: [{ ...notice,
            event: { ...notice.event, effectsMayHaveOccurred: false } }] })).toThrow()
    })
})
