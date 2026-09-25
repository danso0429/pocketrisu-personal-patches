import { expect, test } from 'vitest'
import { flushSync, mount, unmount } from 'svelte'
import { Toaster, toast } from 'svelte-sonner'
import { appearanceNotice, dismissAppearanceNotice } from './appearanceNotices'

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const visible = () => [...document.querySelectorAll('[data-sonner-toast]')]
    .filter(node => node.getAttribute('data-removed') !== 'true')
    .map(node => node.textContent?.trim())
async function samples(step: () => void) {
    step(); flushSync()
    const result: Record<string, unknown> = {}
    let elapsed = 0
    for (const at of [100, 400, 1500]) { await wait(at - elapsed); elapsed = at; flushSync(); result[`${at}ms`] = visible() }
    return result
}

test('real svelte-sonner: WIP same-ID infinite updates vs mounted-once notices', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const app = mount(Toaster, { target: host })
    flushSync(); await wait(300)
    const out: Record<string, unknown> = {}
    out.wip1_loading = await samples(() => toast.loading('WIP 저장 중', { id: 'wip', duration: Number.POSITIVE_INFINITY }))
    out.wip2_loadingUpdate = await samples(() => toast.loading('WIP 서버 확인 중', { id: 'wip', duration: Number.POSITIVE_INFINITY }))
    out.wip3_persistentError = await samples(() => toast.error('WIP 불확실 오류', { id: 'wip', duration: Number.POSITIVE_INFINITY }))
    toast.dismiss(); flushSync(); await wait(600)
    out.new1_loading = await samples(() => appearanceNotice('css', 'loading', 'NEW 저장 중'))
    out.new2_loadingUpdate = await samples(() => appearanceNotice('css', 'loading', 'NEW 서버 확인 중'))
    out.new3_persistentError = await samples(() => appearanceNotice('css', 'error', 'NEW 불확실 오류', true))
    ;(await import('node:fs')).writeFileSync(process.env.SONNER_OUT!, JSON.stringify(out, null, 1))
    dismissAppearanceNotice('css')
    unmount(app)
    expect(true).toBe(true)
}, 60_000)
