// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, unmount } from 'svelte'
import ServerStreamPreview from './ServerStreamPreview.svelte'
import { createStreamPreviewObserver, type StreamPreviewObserverDependencies } from 'src/ts/bgStreamPreview'
import { cancelObservedServerOperation } from 'src/ts/bgOrchestrate'
import { notifyWarning } from 'src/ts/alert'
import { get } from 'svelte/store'
import { requestStatuses, startStatus, clearStatus } from 'src/ts/status/requestStatus'
import { DBState } from 'src/ts/stores.svelte'
vi.mock('src/ts/stores.svelte', () => ({ DBState: { db: { showRequestStatus: true } } }))

vi.mock('src/ts/bgStreamPreview', () => ({
    closePreviewThoughts: (text: string) => text,
    readStreamPreview: vi.fn(),
    createStreamPreviewObserver: vi.fn(() => ({ wake: vi.fn(), pause: vi.fn(), dispose: vi.fn() })),
}))
vi.mock('src/ts/bgOrchestrate', () => ({ isServerOrchestrationEnabled: () => true, cancelObservedServerOperation: vi.fn() }))
vi.mock('src/ts/parser/parser.svelte', () => ({ ParseMarkdown: vi.fn(async (text: string) => text) }))
vi.mock('src/ts/alert', () => ({ notifyWarning: vi.fn() }))
const mounted: Array<{ component: object; target: HTMLElement }> = []
afterEach(async () => {
    for (const entry of mounted.splice(0)) { await unmount(entry.component); entry.target.remove() }
    vi.clearAllMocks()
    requestStatuses.set(new Map())
    DBState.db.showRequestStatus = true
})
async function render(chat = { message: [] as { chatId: string }[] }, onControl?: (available: boolean) => void) {
    const target = document.createElement('div'); document.body.appendChild(target)
    const component = mount(ServerStreamPreview, { target, props: { charId: 'char', chatId: 'chat', chat, active: true, onControl } })
    mounted.push({ component, target })
    await vi.waitFor(() => expect(createStreamPreviewObserver).toHaveBeenCalledTimes(1))
    const observer = vi.mocked(createStreamPreviewObserver).mock.calls[0][0]
    return { target, observer, component }
}
function stream(observer: StreamPreviewObserverDependencies, operation = 'A') {
    observer.publishOperation!(operation)
    observer.publish({ preview: { operationId: operation, rowChatId: 'row-' + operation, revision: 1, text: 'partial', oversized: false }, html: 'partial' })
}
describe('current server operation control', () => {
    it('retains an unconfirmed warning when observation clears during DELETE', async () => {
        let resolve!: (value: 'unconfirmed') => void
        vi.mocked(cancelObservedServerOperation).mockReturnValue(new Promise(done => { resolve = done }))
        const { target, observer } = await render()
        stream(observer); await vi.waitFor(() => expect(target.querySelector('button')).not.toBeNull())
        target.querySelector('button')!.click()
        observer.publishOperation!(null); resolve('unconfirmed')
        await vi.waitFor(() => expect(notifyWarning).toHaveBeenCalledTimes(1))
        observer.publishOperation!('A')
        stream(observer)
        await vi.waitFor(() => expect(target.querySelector('button')?.disabled).toBe(false))
    })
    it('settles the confirmed operation when observation clears during DELETE', async () => {
        let resolve!: (value: 'cancelled') => void
        vi.mocked(cancelObservedServerOperation).mockReturnValue(new Promise(done => { resolve = done }))
        const { target, observer } = await render()
        stream(observer); await vi.waitFor(() => expect(target.querySelector('button')).not.toBeNull())
        target.querySelector('button')!.click()
        observer.publishOperation!(null); resolve('cancelled')
        await vi.waitFor(() => expect(target.querySelector('section')).toBeNull())
        observer.publishOperation!('A')
        await vi.waitFor(() => expect(target.querySelector('button')).toBeNull())
        expect(notifyWarning).not.toHaveBeenCalled()
    })
    it('uses the upper status channel and ordinary circle API without a preparation box', async () => {
        vi.mocked(cancelObservedServerOperation).mockResolvedValue('cancelled')
        const { target, observer, component } = await render()
        observer.publishOperation!('A')
        await vi.waitFor(() => expect([...get(requestStatuses).values()].some(entry => entry.label === '서버 처리 중')).toBe(true))
        expect(target.querySelector('section')).toBeNull()
        expect(target.querySelector('button')).toBeNull()
        expect(target.querySelector('.chattext')).toBeNull()
        expect(component.requestStopGeneration()).toBe(true)
        await vi.waitFor(() => expect(cancelObservedServerOperation).toHaveBeenCalledWith({ operationId: 'A', charId: 'char', chatId: 'chat' }))
        observer.publishOperation!('A')
        await vi.waitFor(() => expect(get(requestStatuses).size).toBe(0))
        observer.publishOperation!('B')
        await vi.waitFor(() => expect([...get(requestStatuses).values()].some(entry => entry.id.startsWith('bg-server-processing:B:'))).toBe(true))
        expect(cancelObservedServerOperation).toHaveBeenCalledTimes(1)
    })
    it('hides canonical-row and completed-operation controls, including an observer attached after main', async () => {
        const { target, observer } = await render({ message: [{ chatId: 'canonical' }] })
        observer.publishOperation!('A')
        observer.publish({ preview: { operationId: 'A', rowChatId: 'canonical', revision: 1, text: 'done', oversized: false }, html: 'done' })
        await vi.waitFor(() => expect(target.querySelector('button')).toBeNull())
        observer.publishOperation!(null); observer.publish(null)
        await vi.waitFor(() => expect(target.querySelector('section')).toBeNull())
        expect(cancelObservedServerOperation).not.toHaveBeenCalled()
    })
    it('does not clear a successor after an old cancellation reply arrives', async () => {
        let resolve!: (value: 'cancelled') => void
        vi.mocked(cancelObservedServerOperation).mockReturnValue(new Promise(done => { resolve = done }))
        const { target, observer } = await render()
        stream(observer); await vi.waitFor(() => expect(target.querySelector('button')).not.toBeNull())
        target.querySelector('button')!.click()
        stream(observer, 'B'); resolve('cancelled')
        await vi.waitFor(() => {
            expect(target.querySelector('button')?.disabled).toBe(false)
            expect(target.querySelector('button')?.textContent).toContain('생성 중지')
        })
        expect(cancelObservedServerOperation).toHaveBeenCalledTimes(1)
    })
    it('clears a placeholder for native progress and restores it without resetting an existing clock', async () => {
        const { observer } = await render()
        observer.publishOperation!('A')
        const processing = () => [...get(requestStatuses).values()].find(entry => entry.label === '서버 처리 중')
        await vi.waitFor(() => expect(processing()).toBeDefined())
        const id = processing()!.id, startedAt = processing()!.startedAt
        observer.publishOperation!('A')
        expect(processing()!.startedAt).toBe(startedAt)
        startStatus('native', { chatId: 'chat', kind: 'main', label: 'native', now: Date.now() })
        await vi.waitFor(() => expect(processing()).toBeUndefined())
        clearStatus('native')
        await vi.waitFor(() => expect(processing()).toBeDefined())
        expect(processing()!.id).not.toBe(id)
        expect(processing()!.startedAt).toBe(startedAt)
        observer.publishOperation!(null)
        await vi.waitFor(() => expect(get(requestStatuses).size).toBe(0))
    })
    it('replaces the waiting toast with the actual streaming preview and its stream-only Stop', async () => {
        const { target, observer } = await render()
        observer.publishOperation!('A')
        await vi.waitFor(() => expect([...get(requestStatuses).values()].some(entry => entry.label === '서버 처리 중')).toBe(true))
        observer.publish({ preview: { operationId: 'A', rowChatId: 'row-A', revision: 1, text: 'partial', oversized: false }, html: 'partial' })
        await vi.waitFor(() => expect([...get(requestStatuses).values()].some(entry => entry.label === '서버 처리 중')).toBe(false))
        expect(target.querySelector('[data-bg-stream-preview] .chattext')?.textContent).toBe('partial')
        expect(target.querySelector('[data-bg-stream-preview] button')?.textContent).toContain('생성 중지')
    })
    it('honors disabled request status while retaining the ordinary cancellation API', async () => {
        DBState.db.showRequestStatus = false
        vi.mocked(cancelObservedServerOperation).mockResolvedValue('cancelled')
        const { target, observer, component } = await render()
        observer.publishOperation!('A')
        await vi.waitFor(() => expect(createStreamPreviewObserver).toHaveBeenCalledTimes(1))
        expect(component.requestStopGeneration()).toBe(true)
        expect(get(requestStatuses).size).toBe(0)
        expect(target.querySelector('section')).toBeNull()
        expect(cancelObservedServerOperation).toHaveBeenCalledTimes(1)
    })
    it('does not consume native fallback without an observed operation and prevents duplicate circle cancellation', async () => {
        let resolve!: (value: 'cancelled') => void
        vi.mocked(cancelObservedServerOperation).mockReturnValue(new Promise(done => { resolve = done }))
        const onControl = vi.fn()
        const { observer, component } = await render(undefined, onControl)
        expect(component.requestStopGeneration()).toBe(false)
        observer.publishOperation!('A')
        await vi.waitFor(() => expect(onControl).toHaveBeenLastCalledWith(true))
        expect(component.requestStopGeneration()).toBe(true)
        expect(component.requestStopGeneration()).toBe(true)
        expect(cancelObservedServerOperation).toHaveBeenCalledTimes(1)
        resolve('cancelled')
        await vi.waitFor(() => expect(onControl).toHaveBeenLastCalledWith(false))
        expect(component.requestStopGeneration()).toBe(false)
        expect(cancelObservedServerOperation).toHaveBeenCalledTimes(1)
    })
    it('publishes circle readiness and relinquishes it for a canonical row', async () => {
        const onControl = vi.fn()
        const { observer, component } = await render({ message: [{ chatId: 'canonical' }] }, onControl)
        await vi.waitFor(() => expect(onControl).toHaveBeenLastCalledWith(false))
        observer.publishOperation!('A')
        await vi.waitFor(() => expect(onControl).toHaveBeenLastCalledWith(true))
        observer.publish({ preview: { operationId: 'A', rowChatId: 'canonical', revision: 1, text: 'done', oversized: false }, html: 'done' })
        await vi.waitFor(() => expect(onControl).toHaveBeenLastCalledWith(false))
        expect(component.requestStopGeneration()).toBe(false)
        expect(cancelObservedServerOperation).not.toHaveBeenCalled()
    })
})
