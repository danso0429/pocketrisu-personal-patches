import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { get, type Readable } from 'svelte/store'

const sonner = vi.hoisted(() => ({ custom: vi.fn(), dismiss: vi.fn() }))
vi.mock('svelte-sonner', () => ({ toast: sonner }))
vi.mock('src/lib/Setting/Pages/PersonalSettings/AppearanceToast.svelte', () => ({ default: {} }))

const { appearanceNotice, appearanceNoticeRetentionMs, dismissAppearanceNotice } = await import('./appearanceNotices')
type Mounted = { id: string; duration: number; style?: string; componentProps: { status: Readable<{ kind: string; message: string }> }; onDismiss: () => void }
const mounted = (index: number) => sonner.custom.mock.calls[index][1] as Mounted

beforeEach(() => { vi.useFakeTimers(); sonner.custom.mockClear(); sonner.dismiss.mockClear() })
afterEach(() => { for (const scope of ['css', 'font', 'font-load'] as const) dismissAppearanceNotice(scope); vi.useRealTimers() })

test('progress updates reuse one mounted toast instead of updating an infinite sonner toast', () => {
    appearanceNotice('css', 'loading', '저장 중…')
    appearanceNotice('css', 'loading', '서버 저장을 확인하는 중…')
    appearanceNotice('css', 'success', 'CSS 설정 저장 완료')
    expect(sonner.custom).toHaveBeenCalledTimes(1)
    expect(mounted(0).duration).toBe(Number.POSITIVE_INFINITY)
    expect(mounted(0).style).toBe('pointer-events: none;')
    expect(get(mounted(0).componentProps.status)).toEqual({ kind: 'success', message: 'CSS 설정 저장 완료' })
    vi.advanceTimersByTime(appearanceNoticeRetentionMs.success - 1)
    expect(sonner.dismiss).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(sonner.dismiss).toHaveBeenCalledWith(mounted(0).id)
})
test('loading stays until a result replaces it, and a new result restarts only the module timer', () => {
    appearanceNotice('font', 'loading', '폰트를 준비하는 중…')
    vi.advanceTimersByTime(60_000)
    expect(sonner.dismiss).not.toHaveBeenCalled()
    appearanceNotice('font', 'info', '미리보기 준비 완료')
    vi.advanceTimersByTime(appearanceNoticeRetentionMs.info - 10)
    appearanceNotice('font', 'loading', '폰트 파일을 저장하고 확인하는 중…')
    vi.advanceTimersByTime(60_000)
    expect(sonner.dismiss).not.toHaveBeenCalled()
    expect(sonner.custom).toHaveBeenCalledTimes(1)
})
test('errors remount once as a touchable toast, and persistent errors are never auto-dismissed', () => {
    appearanceNotice('css', 'loading', '저장 중…')
    appearanceNotice('css', 'error', '저장 여부를 확인할 수 없습니다.', true)
    expect(sonner.dismiss).toHaveBeenCalledWith(mounted(0).id)
    expect(sonner.custom).toHaveBeenCalledTimes(2)
    expect(mounted(1).style).toBeUndefined()
    vi.advanceTimersByTime(600_000)
    expect(sonner.dismiss).toHaveBeenCalledTimes(1)
    appearanceNotice('css', 'error', '다시 실패했습니다.')
    expect(sonner.custom).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(appearanceNoticeRetentionMs.error)
    expect(sonner.dismiss).toHaveBeenLastCalledWith(mounted(1).id)
})
test('a toast the user swiped away is remounted by the next notice, and scopes stay independent', () => {
    appearanceNotice('css', 'error', '실패')
    mounted(0).onDismiss()
    appearanceNotice('css', 'error', '다시 실패')
    appearanceNotice('font-load', 'error', '폰트를 불러올 수 없습니다.')
    expect(sonner.custom).toHaveBeenCalledTimes(3)
    expect(new Set([mounted(0).id, mounted(1).id, mounted(2).id]).size).toBe(3)
    dismissAppearanceNotice('font-load')
    expect(sonner.dismiss).toHaveBeenCalledWith(mounted(2).id)
    expect(get(mounted(1).componentProps.status).message).toBe('다시 실패')
})
