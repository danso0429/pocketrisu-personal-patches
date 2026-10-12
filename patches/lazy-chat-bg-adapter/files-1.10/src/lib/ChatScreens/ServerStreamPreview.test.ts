// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, unmount } from 'svelte'
import ServerStreamPreview from './ServerStreamPreview.svelte'
import { createStreamPreviewObserver } from 'src/ts/bgStreamPreview'
import { cancelObservedServerOperation } from 'src/ts/bgOrchestrate'
import { notifyWarning } from 'src/ts/alert'

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
})
async function render(chat = { message: [] as { chatId: string }[] }) {
    const target = document.createElement('div'); document.body.appendChild(target)
    const component = mount(ServerStreamPreview, { target, props: { charId: 'char', chatId: 'chat', chat, active: true } })
    mounted.push({ component, target })
    await vi.waitFor(() => expect(createStreamPreviewObserver).toHaveBeenCalledTimes(1))
    const observer = vi.mocked(createStreamPreviewObserver).mock.calls[0][0]
    return { target, observer }
}
describe('current server operation control', () => {
    it('retains an unconfirmed warning when observation clears during DELETE', async () => {
        let resolve!: (value: 'unconfirmed') => void
        vi.mocked(cancelObservedServerOperation).mockReturnValue(new Promise(done => { resolve = done }))
        const { target, observer } = await render()
        observer.publishOperation!('A'); await vi.waitFor(() => expect(target.querySelector('button')).not.toBeNull())
        target.querySelector('button')!.click()
        observer.publishOperation!(null); resolve('unconfirmed')
        await vi.waitFor(() => expect(notifyWarning).toHaveBeenCalledTimes(1))
        observer.publishOperation!('A')
        await vi.waitFor(() => expect(target.querySelector('button')?.disabled).toBe(false))
    })
    it('settles the confirmed operation when observation clears during DELETE', async () => {
        let resolve!: (value: 'cancelled') => void
        vi.mocked(cancelObservedServerOperation).mockReturnValue(new Promise(done => { resolve = done }))
        const { target, observer } = await render()
        observer.publishOperation!('A'); await vi.waitFor(() => expect(target.querySelector('button')).not.toBeNull())
        target.querySelector('button')!.click()
        observer.publishOperation!(null); resolve('cancelled')
        await vi.waitFor(() => expect(target.querySelector('section')).toBeNull())
        observer.publishOperation!('A')
        await vi.waitFor(() => expect(target.querySelector('button')).toBeNull())
        expect(notifyWarning).not.toHaveBeenCalled()
    })
    it('shows preparation control without a provisional row and suppresses the confirmed operation only', async () => {
        vi.mocked(cancelObservedServerOperation).mockResolvedValue('cancelled')
        const { target, observer } = await render()
        observer.publishOperation!('A')
        await vi.waitFor(() => expect(target.querySelector('button')?.textContent).toContain('생성 중지'))
        expect(target.querySelector('.chattext')).toBeNull()
        target.querySelector('button')!.click()
        await vi.waitFor(() => expect(cancelObservedServerOperation).toHaveBeenCalledWith({ operationId: 'A', charId: 'char', chatId: 'chat' }))
        observer.publishOperation!('A')
        await vi.waitFor(() => expect(target.querySelector('button')).toBeNull())
        observer.publishOperation!('B')
        await vi.waitFor(() => expect(target.querySelector('button')).not.toBeNull())
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
        observer.publishOperation!('A'); await vi.waitFor(() => expect(target.querySelector('button')).not.toBeNull())
        target.querySelector('button')!.click()
        observer.publishOperation!('B'); resolve('cancelled')
        await vi.waitFor(() => {
            expect(target.querySelector('button')?.disabled).toBe(false)
            expect(target.querySelector('button')?.textContent).toContain('생성 중지')
        })
        expect(cancelObservedServerOperation).toHaveBeenCalledTimes(1)
    })
})
