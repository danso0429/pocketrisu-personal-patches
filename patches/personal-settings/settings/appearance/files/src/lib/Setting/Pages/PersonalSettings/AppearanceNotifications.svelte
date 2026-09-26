<script lang="ts">
    import { onMount } from 'svelte'
    import { get } from 'svelte/store'
    import { DBState } from 'src/ts/stores.svelte'
    import { personalCssStatus } from 'src/ts/personalSettings/cssToggleRuntime'
    import { customFontLoadStatus } from 'src/ts/personalSettings/customFontRuntime'
    import { rawAppearance } from 'src/ts/personalSettings/cssToggles'
    import { appearanceNotice, dismissAppearanceNotice } from 'src/ts/personalSettings/appearanceNotices'
    import { appearanceSaveStage } from 'src/ts/personalSettings/appearancePersistence'
    import { takeSaveTrace } from 'src/ts/personalSettings/saveTrace'
    import { addLog } from 'src/ts/log'

    onMount(() => {
        let previous = '', previousPhase = ''
        let current = get(personalCssStatus), stage = get(appearanceSaveStage), loadingKey = ''
        const savingNotice = () => {
            const key = `${current.scope}:${stage}`
            if (key === loadingKey) return
            loadingKey = key
            const label = current.scope === 'font' ? '폰트 설정' : 'CSS 설정'
            const message = { idle: '저장 중…', waiting: '이전 변경 저장을 기다리는 중…', preparing: '변경 사항을 준비하는 중…', writing: '저장 중…', flushing: '서버 저장을 확인하는 중…' }[stage]
            appearanceNotice(current.scope, 'loading', `${label} · ${message}`)
        }
        const stop = personalCssStatus.subscribe(state => {
            current = state
            const identity = JSON.stringify([state.scope, state.phase, state.outcome, state.message])
            if (identity === previous) return
            const initial = !previous, wasSaving = previousPhase === 'saving'
            previous = identity; previousPhase = state.phase
            if (!state.message) return
            if (state.phase === 'saving') savingNotice()
            else if (state.phase === 'preparing') appearanceNotice(state.scope, 'loading', state.message)
            else if (state.phase === 'unresolved') appearanceNotice(state.scope, 'error', state.message, true)
            else if (wasSaving) {
                loadingKey = ''
                // A traced save shows its stage times until the next notice or leaving the page,
                // and the same times go to the server log (logs.db) for collection.
                const trace = takeSaveTrace()
                if (trace) addLog({
                    level: 'info', source: 'personal-save-trace',
                    message: `personal-save-trace ${state.scope} ${state.outcome} ${trace.summary}`,
                    description: JSON.stringify({ version: 1, scope: state.scope, outcome: state.outcome, spans: trace.spans }),
                })
                const done = state.scope === 'font' ? '폰트 설정 저장 완료' : 'CSS 설정 저장 완료'
                if (state.outcome === 'saved') appearanceNotice(state.scope, 'success', trace ? `${done} · ${trace.summary}` : done, !!trace)
                else appearanceNotice(state.scope, 'error', state.message)
            }
            else if (!initial && state.phase === 'trial') appearanceNotice(state.scope, 'info', state.message)
            else if (!initial && state.phase === 'idle') appearanceNotice(state.scope, 'info', state.message)
        })
        const stopStage = appearanceSaveStage.subscribe(value => { stage = value; if (current.phase === 'saving' && stage !== 'idle') savingNotice() })
        const stopFont = customFontLoadStatus.subscribe(message => {
            const custom = String(rawAppearance(DBState.db).chat?.font ?? '').startsWith('custom:')
            if (custom && /불러올 수 없|찾을 수 없/.test(message)) appearanceNotice('font-load', 'error', message)
            else dismissAppearanceNotice('font-load')
        })
        return () => {
            stop(); stopStage(); stopFont()
            dismissAppearanceNotice('css'); dismissAppearanceNotice('font'); dismissAppearanceNotice('font-load')
        }
    })
</script>
