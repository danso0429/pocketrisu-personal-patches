<script lang="ts">
    import { personalCssStatus } from 'src/ts/personalSettings/cssToggleRuntime'
    import { appearanceRuntime, trialAppearanceActivation } from 'src/ts/personalSettings/appearanceEditor'
    import { appearanceNotice } from 'src/ts/personalSettings/appearanceNotices'

    const busy = $derived($personalCssStatus.phase !== 'idle')
    const recoveryUrl = typeof window === 'undefined' ? '' : (() => { const url = new URL(window.location.href); url.searchParams.set('safe-css', '1'); return url.href })()
    async function activate() {
        try { await trialAppearanceActivation() } catch (e) { appearanceNotice('css', 'error', e instanceof Error ? e.message : '시험 적용을 시작할 수 없습니다.') }
    }
</script>

<p>각 CSS는 전역 선택자·원격 URL·애니메이션을 포함할 수 있습니다. 시험 적용은 현재 로컬 규칙을 확인하며 원격 리소스의 이후 변경을 보장하지 않습니다.</p>
<details><summary>화면이 가려졌을 때 복구</summary>
    <p>iPhone에서 홈화면 앱을 닫고 Safari로 아래 주소를 엽니다. 같은 서버의 개인 설정 → CSS 꾸미기에서 문제 항목을 수정해 끈 뒤, 전체 규칙 시험 적용을 확인합니다. 이후 홈화면 앱을 다시 엽니다. 복구 모드는 현재 탭에서 새로고침해도 유지됩니다.</p>
    <input class="w-full rounded border border-darkborderc bg-darkbg text-textcolor" aria-label="복구 주소" readonly value={recoveryUrl} onclick={(e) => e.currentTarget.select()} />
</details>
{#if $personalCssStatus.recovery || $personalCssStatus.validation}
    <p role="status">CSS 적용이 중지되어 있습니다. 수정한 CSS는 끈 상태로 저장하세요. Safe Mode를 끄고 전체 사용을 켠 뒤 전체 규칙을 시험 적용할 수 있습니다.</p>
    <button class="action" disabled={busy} onclick={activate}>전체 규칙 시험 적용 · 복구 종료</button>
{/if}
{#if $personalCssStatus.phase === 'trial' || $personalCssStatus.phase === 'preparing'}<button class="action" onclick={() => appearanceRuntime().cancel()}>시험 적용 취소</button>{/if}
{#if $personalCssStatus.phase === 'unresolved'}<p>저장 여부가 미확정인 동안 추가 변경은 차단됩니다. 초안을 복사해 보관한 뒤 앱을 다시 불러와 저장된 값을 확인하세요.</p>{/if}

<style>
    .action { min-height: 44px; padding: 0.4rem 0.8rem; border: 1px solid currentColor; border-radius: 0.4rem; font: inherit; }
    .action:disabled { opacity: 0.45; }
    input { font: inherit; }
</style>
