// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest'
import { flushSync, mount, unmount } from 'svelte'
import { get } from 'svelte/store'
import { language } from 'src/lang'
import { requestStatuses, startStatus, markPhase, ingestRelayedStatuses } from 'src/ts/status/requestStatus'
import RequestStatusToast from './RequestStatusToast.svelte'
import { beginRequestProgress, setRequestProgress } from 'src/ts/bgRequestProgress'

const mounted: Array<{ component: object; target: HTMLElement }> = []
afterEach(async () => {
    for (const { component, target } of mounted.splice(0)) {
        await unmount(component)
        target.remove()
    }
    requestStatuses.set(new Map())
})
function render(id: string) {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const component = mount(RequestStatusToast, { target, props: { id } })
    mounted.push({ component, target })
    flushSync()
    return target
}
it('renders server waiting as the primary title without a duplicate model detail', () => {
    startStatus('wait', { kind: 'main', label: '', phase: 'background', phaseLabel: '서버 처리 중', now: Date.now() })
    const target = render('wait')
    expect(target.querySelector('.rs-phase')?.textContent).toBe('서버 처리 중')
    expect(target.querySelector('.rs-detail')).toBeNull()
    expect(target.textContent?.split('서버 처리 중')).toHaveLength(2)
})
it('retains the ordinary background recovery title and model detail', () => {
    startStatus('recovery', { kind: 'main', label: 'Recovered model', phase: 'background', now: Date.now() })
    const target = render('recovery')
    expect(target.querySelector('.rs-phase')?.textContent).toBe(language.requestStatus?.background ?? 'In background…')
    expect(target.querySelector('.rs-detail')?.textContent).toBe('Recovered model')
})
it('uses the normal phase title after a background presentation changes phase', () => {
    startStatus('phase', { kind: 'main', label: 'Model', phase: 'background', phaseLabel: '서버 처리 중', now: Date.now() })
    const target = render('phase')
    expect(target.querySelector('.rs-phase')?.textContent).toBe('서버 처리 중')
    markPhase('phase', 'responding', Date.now())
    flushSync()
    expect(target.querySelector('.rs-phase')?.textContent).toBe(language.requestStatus?.responding ?? 'Responding…')
})
it('renders a real relayed waiting entry as server processing and preserves model and progress detail', () => {
    const entry = { id: 'relay', kind: 'main' as const, label: 'Preset', chatId: 'chat',
        phase: 'connecting' as const, startedAt: Date.now(), badges: [{ key: 'pagefold', text: 'PDF 1' }] }
    ingestRelayedStatuses([entry])
    const target = render('relay')
    expect(target.querySelector('.rs-phase')?.textContent).toBe('서버 처리 중')
    expect(target.querySelector('.rs-detail')?.textContent).toBe('Preset')
    expect(target.querySelector('.rs-row1 .rs-chip')?.textContent).toBe(language.requestStatus?.kindMain ?? 'Main')
    expect(target.querySelector('.rs-row1')?.textContent).toContain('PDF 1')
    ingestRelayedStatuses([{ ...entry, phase: 'responding' }])
    flushSync()
    expect(target.querySelector('.rs-phase')?.textContent).toBe(language.requestStatus?.responding ?? 'Responding…')
    ingestRelayedStatuses([{ ...entry, phase: 'retrying', retryAttempt: 2 }])
    flushSync()
    expect(target.querySelector('.rs-phase')?.textContent).toBe(language.requestStatus?.retrying ?? 'Retrying…')
    expect(target.querySelector('.rs-retry')?.textContent).toBe('#2')
})
it('labels server-relayed auxiliary waits without changing the local native request title', () => {
    ingestRelayedStatuses([{ id: 'aux', kind: 'memory', label: 'Memory model', phase: 'connecting', startedAt: Date.now() }])
    const relayed = render('aux')
    expect(relayed.querySelector('.rs-phase')?.textContent).toBe('서버 처리 중')
    expect(relayed.querySelector('.rs-detail')?.textContent).toBe('Memory model')
    startStatus('local', { kind: 'main', label: 'Local model', phase: 'connecting', now: Date.now() })
    const local = render('local')
    expect(local.querySelector('.rs-phase')?.textContent).toBe(language.requestStatus?.connecting ?? 'Connecting…')
})
it('shows lifecycle captions and preserves the actual model details underneath one parent card', () => {
    beginRequestProgress({ operationId: 'render-life', charId: 'char', chatId: 'chat' })
    const id = [...get(requestStatuses).values()].find(entry => entry.pipelineOwner === 'render-life' && entry.pipeline)!.id
    const target = render(id)
    expect(target.querySelector('.rs-phase')?.textContent).toBe('요청 중')
    ingestRelayedStatuses([{ id: 'render-model', kind: 'main', label: 'Actual preset', phase: 'responding',
        startedAt: Date.now(), thinkingTokens: 4, responseTokens: 12, tokPerSec: 3,
        badges: [{ key: 'pagefold', text: 'PDF pages 2', tone: 'info' }] }], 'render-life')
    setRequestProgress('render-life', 'processing'); flushSync()
    expect(target.querySelector('.rs-phase')?.textContent).toBe('서버 처리 중')
    expect(target.querySelector('.rs-row1 .rs-chip')).toBeNull()
    expect(target.querySelectorAll('[data-pipeline-model] .rs-chip')).toHaveLength(1)
    expect(target.querySelector('[data-pipeline-model] .rs-chip')?.textContent).toBe(language.requestStatus?.kindMain ?? 'Main')
    const detail = target.querySelector('[data-pipeline-model]')?.textContent
    expect(detail).toContain('Actual preset'); expect(detail).toContain('4'); expect(detail).toContain('12'); expect(detail).toContain('3')
    expect(target.textContent).toContain('PDF pages 2')
    setRequestProgress('render-life', 'saving'); flushSync()
    expect(target.querySelector('.rs-phase')?.textContent).toBe('답변 저장 중')
    setRequestProgress('render-life', 'loading'); flushSync()
    expect(target.querySelector('.rs-phase')?.textContent).toBe('답변 불러오는 중')
})
