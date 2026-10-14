// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { flushSync, mount, unmount } from 'svelte'
import { toast } from 'svelte-sonner'
import { DBState } from 'src/ts/stores.svelte'
import { requestStatuses, startStatus, ingestRelayedStatuses } from 'src/ts/status/requestStatus'
import { beginRequestProgress, setRequestProgress } from 'src/ts/bgRequestProgress'
import RequestStatusToaster from './RequestStatusToaster.svelte'
vi.mock('svelte-sonner', () => ({ toast: { custom: vi.fn(), dismiss: vi.fn() } }))
const mounted: Array<{ component: object; target: HTMLElement }> = []
afterEach(async () => {
    for (const { component, target } of mounted.splice(0)) { await unmount(component); target.remove() }
    requestStatuses.set(new Map()); DBState.db.showRequestStatus = true; vi.clearAllMocks()
})
function render() {
    const target = document.createElement('div'); document.body.appendChild(target)
    const component = mount(RequestStatusToaster, { target }); mounted.push({ component, target }); flushSync()
}
it('groups only the owned model cards and leaves unrelated local requests visible', () => {
    beginRequestProgress({ operationId: 'driver-group', charId: 'char', chatId: 'chat' })
    ingestRelayedStatuses([{ id: 'group-model', kind: 'main', label: 'Model', phase: 'connecting', startedAt: Date.now() }], 'driver-group')
    startStatus('local-driver', { kind: 'translate', label: 'Local', now: Date.now() })
    render()
    const options = vi.mocked(toast.custom).mock.calls.map(call => call[1])
    expect(options).toHaveLength(2)
    expect(options.some(option => option?.componentProps?.id === 'group-model')).toBe(false)
    expect(options.some(option => option?.componentProps?.id === 'local-driver')).toBe(true)
})
it('updates phase without recreating a card and uses a new presentation when display is re-enabled', () => {
    beginRequestProgress({ operationId: 'driver-setting', charId: 'char', chatId: 'chat' })
    render()
    const first = vi.mocked(toast.custom).mock.calls[0][1]!.id
    setRequestProgress('driver-setting', 'processing'); flushSync()
    setRequestProgress('driver-setting', 'saving'); flushSync()
    expect(toast.custom).toHaveBeenCalledTimes(1)
    DBState.db.showRequestStatus = false; flushSync()
    expect(toast.dismiss).toHaveBeenCalledWith(first)
    DBState.db.showRequestStatus = true; flushSync()
    expect(toast.custom).toHaveBeenCalledTimes(2)
    expect(vi.mocked(toast.custom).mock.calls[1][1]!.id).not.toBe(first)
})
