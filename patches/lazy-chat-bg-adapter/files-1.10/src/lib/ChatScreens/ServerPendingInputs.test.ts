// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, tick, unmount } from 'svelte'
import ServerPendingInputs from './ServerPendingInputs.svelte'
import { reconcileServerPendingInputCommands } from 'src/ts/bgOrchestrate'
import { readServerChatActivity } from 'src/ts/bgChatActivity'

vi.mock('src/ts/bgChatActivity', () => ({ readServerChatActivity: vi.fn(async () => false) }))

vi.mock('src/ts/bgOrchestrate', () => ({
    hasServerOwnedInputMarker: () => false,
    reconcileServerPendingInputCommands: vi.fn(),
}))

const mounted: Array<{ component: object, target: HTMLElement }> = []
afterEach(async () => {
    while (mounted.length > 0) {
        const entry = mounted.pop()!
        await unmount(entry.component)
        entry.target.remove()
    }
    vi.useRealTimers()
    vi.resetAllMocks()
    vi.restoreAllMocks()
})

function render(onRetryBlocked: (input: any) => Promise<void>, onActivity?: (activity: any) => void,
    onCancelPending?: (input: any) => Promise<'cancelled' | 'finished' | 'unconfirmed'>) {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const component = mount(ServerPendingInputs, {
        target,
        props: { charId: 'char-1', chatId: 'chat-1', chat: { id: 'chat-1' }, onRetryBlocked, onActivity,
            onCancelPending },
    })
    mounted.push({ component, target })
    return target
}

describe('blocked server input recovery control', () => {
    it.each(['queued', 'attached', 'generating', 'waiting_predecessor'] as const)(
        'keeps %s activity and fast polling without a visible card', async state => {
            vi.useFakeTimers()
            vi.mocked(reconcileServerPendingInputCommands).mockResolvedValue([{
                operationId: 'active', admissionSeq: 1, state,
            }])
            vi.mocked(readServerChatActivity).mockResolvedValue(true)
            const activity = vi.fn()
            const target = render(vi.fn(async () => {}), activity)
            await tick()
            await vi.advanceTimersByTimeAsync(0)
            await tick()
            expect(target.querySelector('[aria-live]')?.textContent?.trim()).toBe('')
            expect(target.querySelector('[aria-live] .border')).toBeNull()
            expect(activity).toHaveBeenLastCalledWith({ charId: 'char-1', chatId: 'chat-1', busy: true })
            expect(reconcileServerPendingInputCommands).toHaveBeenCalledTimes(1)
            await vi.advanceTimersByTimeAsync(2000)
            expect(reconcileServerPendingInputCommands).toHaveBeenCalledTimes(2)
        },
    )

    it('keeps the live region and exact retry identity across mixed and changing states', async () => {
        const blocked = { operationId: 'blocked', admissionSeq: 2, state: 'blocked_edit' as const,
            retryAllowed: true, rawText: 'retained mixed draft', inputCommandId: 'mixed-draft-id' }
        vi.mocked(reconcileServerPendingInputCommands)
            .mockResolvedValueOnce([{ operationId: 'active', admissionSeq: 1, state: 'generating' }])
            .mockResolvedValueOnce([{ operationId: 'active', admissionSeq: 1, state: 'generating' }, blocked])
        vi.mocked(readServerChatActivity).mockResolvedValue(true)
        const retry = vi.fn(async () => {})
        const activity = vi.fn()
        const target = render(retry, activity)
        await vi.waitFor(() => expect(activity).toHaveBeenCalledTimes(2))
        const region = target.querySelector('[aria-live]')
        expect(region?.textContent?.trim()).toBe('')
        window.dispatchEvent(new Event('bg-server-input-updated'))
        await vi.waitFor(() => expect(target.textContent).toContain(blocked.rawText))
        expect(target.querySelector('[aria-live]')).toBe(region)
        expect(target.textContent).not.toContain('서버에서 답변 생성 중')
        expect(target.querySelectorAll('button')).toHaveLength(1)
        target.querySelector('button')?.click()
        await vi.waitFor(() => expect(retry).toHaveBeenCalledWith(blocked))
        expect(retry).toHaveBeenCalledTimes(1)
        expect(activity).toHaveBeenLastCalledWith({ charId: 'char-1', chatId: 'chat-1', busy: true })
    })

    it.each([
        { state: 'execution_unknown', text: '생성 상태 미확인' },
        { state: 'attached', clientPreparation: 'waiting', text: '앱 입력 처리를 기다리는 중' },
        { state: 'attached', clientPreparation: 'running', text: '앱 입력 처리 완료를 기다리는 중' },
        { state: 'attached', reason: 'server_host_unsupported', text: '서버 입력 중단' },
        { state: 'attached', reason: 'client_preparation_interrupted', text: '앱 입력 처리가 중단' },
    ] as const)('preserves the actionable $text notice', async row => {
        vi.mocked(reconcileServerPendingInputCommands).mockResolvedValue([{
            operationId: 'actionable', admissionSeq: 1, ...row,
        }])
        const target = render(vi.fn(async () => {}))
        await vi.waitFor(() => expect(target.textContent).toContain(row.text))
        expect(target.querySelector('[aria-live] .border')).not.toBeNull()
    })

    it('reports server activity without a local marker and fails closed when refresh fails', async () => {
        vi.mocked(reconcileServerPendingInputCommands).mockResolvedValue([])
        vi.mocked(readServerChatActivity).mockResolvedValueOnce(true).mockRejectedValueOnce(new Error('offline'))
        const onActivity = vi.fn()
        const target = render(vi.fn(async () => {}), onActivity)
        await vi.waitFor(() => expect(onActivity).toHaveBeenLastCalledWith({ charId: 'char-1', chatId: 'chat-1', busy: true }))
        window.dispatchEvent(new Event('bg-server-input-updated'))
        await vi.waitFor(() => expect(onActivity).toHaveBeenLastCalledWith({ charId: 'char-1', chatId: 'chat-1', busy: null }))
        expect(target.textContent).not.toContain('서버 입력 상태를 확인할 수 없음')
        expect(target.querySelector('[aria-live]')?.textContent?.trim()).toBe('')
        expect(target.querySelector('[aria-live] .border')).toBeNull()
    })
    it('shows no status-only card when the initial read fails but retains unknown activity', async () => {
        vi.mocked(reconcileServerPendingInputCommands).mockRejectedValue(new Error('offline'))
        const onActivity = vi.fn()
        const target = render(vi.fn(async () => {}), onActivity)
        await vi.waitFor(() => expect(onActivity).toHaveBeenCalledTimes(2))
        expect(onActivity).toHaveBeenLastCalledWith({ charId: 'char-1', chatId: 'chat-1', busy: null })
        expect(target.querySelector('[aria-live]')?.textContent?.trim()).toBe('')
        expect(target.querySelector('[aria-live] .border')).toBeNull()
        expect(target.textContent).not.toContain('서버 입력 상태를 확인할 수 없음')
    })
    it('retains a blocked input and its explicit retry control when the next read fails', async () => {
        const blocked = { operationId: 'blocked', admissionSeq: 1, state: 'blocked_edit' as const,
            retryAllowed: true, rawText: 'retained input', inputCommandId: 'draft' }
        vi.mocked(reconcileServerPendingInputCommands).mockResolvedValueOnce([blocked]).mockRejectedValueOnce(new Error('offline'))
        vi.mocked(readServerChatActivity).mockResolvedValue(false)
        const retry = vi.fn(async () => {})
        const onActivity = vi.fn()
        const target = render(retry, onActivity)
        await vi.waitFor(() => expect(target.textContent).toContain('retained input'))
        window.dispatchEvent(new Event('bg-server-input-updated'))
        await vi.waitFor(() => expect(onActivity).toHaveBeenLastCalledWith({ charId: 'char-1', chatId: 'chat-1', busy: null }))
        expect(target.textContent).toContain('retained input')
        expect(target.textContent).not.toContain('서버 입력 상태를 확인할 수 없음')
        expect(target.querySelector('button')).not.toBeNull()
        expect(retry).not.toHaveBeenCalled()
    })
    it('shows the exact blocked text and invokes only the explicit retry button', async () => {
        const blocked = {
            operationId: 'operation-blocked-1', admissionSeq: 2,
            state: 'blocked_edit' as const, retryAllowed: true,
            rawText: 'preserved draft', inputCommandId: 'draft-shared-1',
        }
        vi.mocked(reconcileServerPendingInputCommands).mockResolvedValue([blocked])
        const retry = vi.fn(async () => {})
        const timers = vi.spyOn(globalThis, 'setTimeout')
        const target = render(retry)
        await vi.waitFor(() => expect(target.textContent).toContain('preserved draft'))
        expect(timers.mock.calls.some(([, delay]) => delay === 2000)).toBe(false)
        const button = target.querySelector('button')
        expect(button?.textContent).toContain('새로 생성하기')
        expect(retry).not.toHaveBeenCalled()
        button?.click()
        await vi.waitFor(() => expect(retry).toHaveBeenCalledWith(blocked))
        expect(retry).toHaveBeenCalledTimes(1)
    })

    it('does not offer paid retry when execution identity is unknown', async () => {
        let release!: () => void
        const cancel = vi.fn(() => new Promise<'cancelled'>(resolve => { release = () => resolve('cancelled') }))
        vi.mocked(reconcileServerPendingInputCommands).mockResolvedValue([{
            operationId: 'operation-unknown-1', admissionSeq: 1,
            state: 'blocked_edit', retryAllowed: false, cancelAllowed: true,
            rawText: 'unverified draft', inputCommandId: 'draft-unknown-1',
        }])
        const target = render(vi.fn(async () => {}), undefined, cancel)
        await vi.waitFor(() => expect(target.textContent).toContain('unverified draft'))
        expect(target.textContent).toContain('이미 사용된 모델 호출이나 외부 작업은 되돌리지 않아요')
        expect(target.querySelectorAll('button')).toHaveLength(1)
        const button = target.querySelector('button')!
        expect(button.textContent).not.toContain('새로 생성하기')
        button.click(); button.click()
        await vi.waitFor(() => expect(cancel).toHaveBeenCalledTimes(1))
        expect(cancel).toHaveBeenCalledWith(expect.objectContaining({ operationId: 'operation-unknown-1' }))
        expect(button.disabled).toBe(true)
        release(); await tick()
    })

    it('polls an actionable-only execution_unknown row at the 5 s idle rate', async () => {
        vi.useFakeTimers()
        const row = { operationId: 'execution-orphan', admissionSeq: 1, state: 'execution_unknown' as const,
            cancelAllowed: true }
        vi.mocked(reconcileServerPendingInputCommands).mockResolvedValue([row])
        render(vi.fn(async () => {}), undefined, vi.fn(async () => 'finished' as const))
        await tick(); await vi.advanceTimersByTimeAsync(0); await tick()
        expect(reconcileServerPendingInputCommands).toHaveBeenCalledTimes(1)
        await vi.advanceTimersByTimeAsync(4_999)
        expect(reconcileServerPendingInputCommands).toHaveBeenCalledTimes(1)
        await vi.advanceTimersByTimeAsync(1)
        expect(reconcileServerPendingInputCommands).toHaveBeenCalledTimes(2)
    })

    it('offers one single-flight cancel and no retry for execution_unknown', async () => {
        let release!: () => void
        const cancel = vi.fn(() => new Promise<'cancelled'>(resolve => { release = () => resolve('cancelled') }))
        const row = { operationId: 'execution-cancel', admissionSeq: 1,
            state: 'execution_unknown' as const, cancelAllowed: true }
        vi.mocked(reconcileServerPendingInputCommands).mockResolvedValue([row])
        const target = render(vi.fn(async () => {}), undefined, cancel)
        await vi.waitFor(() => expect(target.textContent).toContain('생성 상태 미확인'))
        expect(target.textContent).toContain('이미 사용된 모델 호출이나 외부 작업은 되돌리지 않아요')
        expect(target.querySelectorAll('button')).toHaveLength(1)
        const button = target.querySelector('button')!
        button.click(); button.click()
        await vi.waitFor(() => expect(cancel).toHaveBeenCalledTimes(1))
        expect(button.disabled).toBe(true)
        release(); await tick()
    })

    it('keeps retry-only blocked rows unchanged and never renders controls for active rows', async () => {
        const retry = vi.fn(async () => {})
        vi.mocked(reconcileServerPendingInputCommands).mockResolvedValue([{
            operationId: 'retry-only', admissionSeq: 1, state: 'blocked_edit', retryAllowed: true,
            rawText: 'retry me', inputCommandId: 'retry-only-draft',
        }])
        const target = render(retry, undefined, vi.fn(async () => 'cancelled' as const))
        await vi.waitFor(() => expect(target.textContent).toContain('retry me'))
        expect(target.querySelectorAll('button')).toHaveLength(1)
        expect(target.querySelector('button')?.textContent).toContain('새로 생성하기')
    })
})
