import { writable } from 'svelte/store'

export type AppearanceSaveStage = 'idle' | 'waiting' | 'preparing' | 'writing' | 'flushing'
export const appearanceSaveStage = writable<AppearanceSaveStage>('idle')
export type AppearanceMutation = () => (() => void)
export type AppearanceWriter = (mutate: AppearanceMutation, verify: () => void, progress?: (stage: AppearanceSaveStage) => void) => Promise<void>
let writer: AppearanceWriter | undefined
export function registerAppearanceWriter(value: AppearanceWriter): void { writer = value }
export function saveAppearanceStrict(mutate: AppearanceMutation, verify: () => void): Promise<void> {
    if (!writer) return Promise.reject(new Error('저장 준비가 끝나지 않았습니다. 잠시 후 다시 시도하세요.'))
    appearanceSaveStage.set('preparing')
    return writer(mutate, verify, stage => appearanceSaveStage.set(stage)).finally(() => appearanceSaveStage.set('idle'))
}
export function appearanceSaveFailure(ambiguous: boolean): Error & { ambiguous: boolean } {
    return Object.assign(new Error(ambiguous
        ? '저장 응답을 확인할 수 없습니다. 저장 여부는 미확정입니다. 초안을 보존하고 다시 불러온 설정을 확인하세요.'
        : '서버가 저장을 거절했습니다. 초안은 보존됩니다. 현재 설정을 확인한 뒤 다시 시도하세요.'), { ambiguous })
}
