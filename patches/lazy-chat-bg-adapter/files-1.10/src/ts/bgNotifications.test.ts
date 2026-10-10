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
