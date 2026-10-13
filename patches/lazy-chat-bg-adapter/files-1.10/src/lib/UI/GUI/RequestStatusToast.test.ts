// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest'
import { flushSync, mount, unmount } from 'svelte'
import { language } from 'src/lang'
import { requestStatuses, startStatus, markPhase } from 'src/ts/status/requestStatus'
import RequestStatusToast from './RequestStatusToast.svelte'

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
