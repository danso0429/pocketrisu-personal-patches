<script lang="ts">
    import { onDestroy } from 'svelte'
    import { DBState } from 'src/ts/stores.svelte'
    import { personalCssStatus } from 'src/ts/personalSettings/cssToggleRuntime'
    import { appearanceRuntime, submitCssEdit, trialAppearanceActivation } from 'src/ts/personalSettings/appearanceEditor'
    import { CSS_LIMITS, cssEditBase, effectiveCssToggles, newPersonalId, rawAppearance, readCssToggles, storedCssBytes, utf8Bytes, type CssEdit, type EffectiveCssToggle } from 'src/ts/personalSettings/cssToggles'

    let filter = $state('')
    let draft = $state<EffectiveCssToggle | null>(null)
    let base: unknown
    let origin: HTMLElement | null = null
    let returnFocus = $state(false)
    let filterInput = $state<HTMLInputElement>()
    let error = $state('')
    let showRaw = $state(false)
    const read = $derived(readCssToggles(DBState.db))
    const items = $derived(effectiveCssToggles(DBState.db))
    const filtered = $derived(items.filter(item => `${item.name} ${item.description}`.toLocaleLowerCase().includes(filter.toLocaleLowerCase())))
    const busy = $derived($personalCssStatus.phase !== 'idle')
    const totalBytes = $derived(storedCssBytes(DBState.db))
    const recoveryUrl = typeof window === 'undefined' ? '' : (() => { const url = new URL(window.location.href); url.searchParams.set('safe-css', '1'); return url.href })()
    function close() { draft = null; error = ''; returnFocus = true }
    $effect(() => {
        if (returnFocus && !draft && !busy) {
            returnFocus = false
            if (origin?.isConnected && !origin.hasAttribute('disabled')) origin.focus()
            else filterInput?.focus()
        }
    })
    function open(item?: EffectiveCssToggle, event?: MouseEvent) {
        if (draft) { error = '열린 초안을 먼저 저장하거나 취소하세요.'; return }
        origin = event?.currentTarget as HTMLElement ?? null
        draft = item ? { ...item } : { id: newPersonalId(), name: '새 CSS', description: '', css: '', enabled: false, shipped: false, modified: false, newerDefault: false }
        base = cssEditBase(DBState.db, { kind: 'put', item: draft, shipped: draft.shipped })
    }
    async function run(edit: CssEdit, expected = cssEditBase(DBState.db, edit), saved = () => {}) {
        error = ''
        try { await submitCssEdit(edit, expected, saved) } catch (e) { error = e instanceof Error ? e.message : '설정을 변경할 수 없습니다.' }
    }
    function save() {
        if (!draft) return
        void run({ kind: 'put', item: { id: draft.id, name: draft.name, description: draft.description, css: draft.css, enabled: draft.enabled }, shipped: draft.shipped }, base, close)
    }
    async function activate() {
        try { await trialAppearanceActivation() } catch (e) { error = e instanceof Error ? e.message : '시험 적용을 시작할 수 없습니다.' }
    }
    onDestroy(() => { appearanceRuntime().cancel() })
</script>

<section class="space-y-3 mt-4" aria-label="CSS 토글 편집기">
    <div class="rounded border border-darkborderc p-3 text-sm space-y-2">
        <p>각 CSS는 전역 선택자·원격 URL·애니메이션을 포함할 수 있습니다. 시험 적용은 현재 로컬 규칙을 확인하며 원격 리소스의 이후 변경을 보장하지 않습니다.</p>
        <details><summary>화면이 가려졌을 때 복구</summary>
            <p>iPhone에서 홈화면 앱을 닫고 Safari로 아래 주소를 엽니다. 같은 서버의 개인 설정 → CSS 꾸미기에서 문제 항목을 수정해 끈 뒤, 전체 규칙 시험 적용을 확인합니다. 이후 홈화면 앱을 다시 엽니다. 복구 모드는 현재 탭에서 새로고침해도 유지됩니다.</p>
            <input class="w-full text-black" aria-label="복구 주소" readonly value={recoveryUrl} onclick={(e) => e.currentTarget.select()} />
        </details>
        {#if $personalCssStatus.recovery || $personalCssStatus.validation}
            <p role="status">CSS 적용이 중지되어 있습니다. 수정한 CSS는 끈 상태로 저장하세요. Safe Mode를 끄고 Standard 테마와 전체 사용을 켠 뒤 전체 규칙을 시험 적용할 수 있습니다.</p>
            <button class="action" disabled={busy} onclick={activate}>전체 규칙 시험 적용 · 복구 종료</button>
        {/if}
        <p role="status" aria-live="polite">{$personalCssStatus.message}</p>
        {#if $personalCssStatus.phase === 'trial' || $personalCssStatus.phase === 'preparing'}<button class="action" onclick={() => appearanceRuntime().cancel()}>시험 적용 취소</button>{/if}
        {#if $personalCssStatus.phase === 'unresolved'}<p>저장 여부가 미확정인 동안 추가 변경은 차단됩니다. 초안을 복사해 보관한 뒤 앱을 다시 불러와 저장된 값을 확인하세요.</p>{/if}
    </div>
    {#if error}<p role="alert" class="text-draculared">{error}</p>{/if}
    {#if !read.valid}
        <p role="alert">{read.error}</p>
        <button class="action" onclick={() => showRaw = true}>원본 보기 · 복사</button>
        {#if showRaw}
            <textarea class="w-full h-40 text-black font-mono" aria-label="CSS 설정 원본" readonly value={JSON.stringify(rawAppearance(DBState.db).cssToggles, null, 2)}></textarea>
            <button class="action" disabled={busy} onclick={() => { if (window.confirm('CSS 토글 하위 설정만 초기화할까요? 복사한 원본을 보관하세요.')) void run({ kind: 'reset-group' }) }}>CSS 하위 설정 초기화</button>
        {/if}
    {:else}
        <label class="block">이름·설명 검색 <input class="w-full rounded p-2 bg-darkbg" bind:this={filterInput} bind:value={filter} /></label>
        <div class="flex flex-wrap items-center gap-2">
            <button class="action" disabled={busy || !!draft} onclick={(e) => open(undefined, e)}>새 CSS 추가</button>
            <span class="text-xs">저장된 CSS {totalBytes.toLocaleString()} / {CSS_LIMITS.total.toLocaleString()} bytes · 사용자 항목 {read.value.custom?.length ?? 0} / {CSS_LIMITS.count}</span>
        </div>
        {#if totalBytes >= CSS_LIMITS.warningTotal || (read.value.custom?.length ?? 0) >= CSS_LIMITS.warningCount}<p role="status">저장된 CSS가 많습니다. 꺼진 항목도 저장·백업 비용에 포함됩니다.</p>{/if}
        {#if draft}
            <form class="rounded border border-primary p-3 space-y-3" onsubmit={(e) => { e.preventDefault(); save() }}>
                <label class="block">이름 <input class="w-full rounded p-2 bg-darkbg" readonly={busy} bind:value={draft.name} /></label>
                <p class="text-xs">{utf8Bytes(draft.name)} / {CSS_LIMITS.name} bytes</p>
                <label class="block">설명 <textarea class="w-full rounded p-2 bg-darkbg" readonly={busy} bind:value={draft.description}></textarea></label>
                <p class="text-xs">{utf8Bytes(draft.description)} / {CSS_LIMITS.description} bytes</p>
                <label class="block">CSS <textarea class="w-full h-64 rounded p-2 bg-darkbg font-mono text-sm" spellcheck="false" readonly={busy} bind:value={draft.css}></textarea></label>
                <p class="text-xs">{utf8Bytes(draft.css).toLocaleString()} / {CSS_LIMITS.item.toLocaleString()} bytes</p>
                {#if utf8Bytes(draft.css) >= CSS_LIMITS.warningItem}<p role="status">큰 CSS 규칙입니다. 실제 기기에서 스크롤·입력·복구 동작을 확인하세요.</p>{/if}
                <label class="flex items-center gap-2 min-h-11"><input type="checkbox" disabled={busy} bind:checked={draft.enabled} /> 저장 후 켜기 (적용이 중지된 동안 수정하면 끄세요)</label>
                <button class="action" type="submit" disabled={busy}>시험 적용 / 저장</button>
                <button class="action" type="button" disabled={busy} onclick={close}>취소</button>
            </form>
        {/if}
        {#each filtered as item (item.id)}
            <article class="rounded border border-darkborderc p-3" data-setting-id={item.settingId}>
                <label class="flex items-center gap-3 min-h-11">
                    <input type="checkbox" checked={item.enabled} aria-label={`${item.name} 켜기`} disabled={busy || !!draft} onchange={(e) => { const enabled = e.currentTarget.checked; e.currentTarget.checked = item.enabled; void run({ kind: 'put', item: { ...item, enabled }, shipped: item.shipped }) }} />
                    <strong class="min-w-0" style:overflow-wrap="anywhere">{item.name}</strong>
                    {#if item.modified}<span class="text-xs">수정됨{item.newerDefault ? ' · 새 기본값 있음' : ''}</span>{/if}
                </label>
                <p class="text-sm text-textcolor2 whitespace-pre-wrap break-words">{item.description}</p>
                <div class="flex flex-wrap gap-1 mt-2">
                    <button class="action" disabled={busy || !!draft} onclick={(e) => open(item, e)}>편집</button>
                    {#if item.shipped && item.modified}
                        <button class="action" disabled={busy || !!draft} onclick={() => void run({ kind: 'reset', id: item.id })}>현재 기본값으로 복원</button>
                    {:else if !item.shipped}
                        <button class="action" aria-label={`${item.name} 위로`} disabled={busy || !!draft} onclick={() => void run({ kind: 'move', id: item.id, direction: -1 })}>위로</button>
                        <button class="action" aria-label={`${item.name} 아래로`} disabled={busy || !!draft} onclick={() => void run({ kind: 'move', id: item.id, direction: 1 })}>아래로</button>
                        <button class="action" disabled={busy || !!draft} onclick={() => { if (window.confirm(`“${item.name}” CSS를 삭제할까요?`)) void run({ kind: 'delete', id: item.id }) }}>삭제</button>
                    {/if}
                </div>
            </article>
        {/each}
    {/if}
</section>

<style>
    .action { min-height: 44px; padding: 0.4rem 0.8rem; border: 1px solid currentColor; border-radius: 0.4rem; }
    .action:disabled { opacity: 0.45; }
</style>
