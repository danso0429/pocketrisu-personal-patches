// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, unmount } from 'svelte'
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
    vi.resetAllMocks()
    vi.restoreAllMocks()
})

function render(onRetryBlocked: (input: any) => Promise<void>, onActivity?: (activity: any) => void) {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const component = mount(ServerPendingInputs, {
        target,
        props: { charId: 'char-1', chatId: 'chat-1', chat: { id: 'chat-1' }, onRetryBlocked, onActivity },
    })
    mounted.push({ component, target })
    return target
}

describe('blocked server input recovery control', () => {
    it('reports server activity without a local marker and fails closed when refresh fails', async () => {
        vi.mocked(reconcileServerPendingInputCommands).mockResolvedValue([])
        vi.mocked(readServerChatActivity).mockResolvedValueOnce(true).mockRejectedValueOnce(new Error('offline'))
        const onActivity = vi.fn()
        const target = render(vi.fn(async () => {}), onActivity)
        await vi.waitFor(() => expect(onActivity).toHaveBeenLastCalledWith({ charId: 'char-1', chatId: 'chat-1', busy: true }))
        window.dispatchEvent(new Event('bg-server-input-updated'))
        await vi.waitFor(() => expect(onActivity).toHaveBeenLastCalledWith({ charId: 'char-1', chatId: 'chat-1', busy: null }))
        expect(target.textContent).not.toContain('서버 입력 상태를 확인할 수 없음')
        expect(target.querySelector('[aria-live]')).toBeNull()
    })
    it('shows no status-only card when the initial read fails but retains unknown activity', async () => {
        vi.mocked(reconcileServerPendingInputCommands).mockRejectedValue(new Error('offline'))
        const onActivity = vi.fn()
        const target = render(vi.fn(async () => {}), onActivity)
        await vi.waitFor(() => expect(onActivity).toHaveBeenCalledTimes(2))
        expect(onActivity).toHaveBeenLastCalledWith({ charId: 'char-1', chatId: 'chat-1', busy: null })
        expect(target.querySelector('[aria-live]')).toBeNull()
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
        vi.mocked(reconcileServerPendingInputCommands).mockResolvedValue([{
            operationId: 'operation-unknown-1', admissionSeq: 1,
            state: 'blocked_edit', retryAllowed: false,
            rawText: 'unverified draft', inputCommandId: 'draft-unknown-1',
        }])
        const target = render(vi.fn(async () => {}))
        await vi.waitFor(() => expect(target.textContent).toContain('unverified draft'))
        expect(target.querySelector('button')).toBeNull()
    })
})
