// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, unmount } from 'svelte'
import ServerPendingInputs from './ServerPendingInputs.svelte'
import { reconcileServerPendingInputCommands } from 'src/ts/bgOrchestrate'

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

function render(onRetryBlocked: (input: any) => Promise<void>) {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const component = mount(ServerPendingInputs, {
        target,
        props: { charId: 'char-1', chatId: 'chat-1', chat: { id: 'chat-1' }, onRetryBlocked },
    })
    mounted.push({ component, target })
    return target
}

describe('blocked server input recovery control', () => {
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
