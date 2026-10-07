<script lang="ts">
    import { onDestroy, untrack } from 'svelte'
    import { DBState, SafeModeStore } from 'src/ts/stores.svelte'
    import { personalCssStatus } from 'src/ts/personalSettings/cssToggleRuntime'
    import { commitFont, FONT_TARGETS, fontEditBase, fontTargetLabel, persistImportedFont, readFontAsset, selectFont, setFontEnabled } from 'src/ts/personalSettings/appearanceEditor'
    import { CustomFontRuntime, customFontFamily, customFontIdentity } from 'src/ts/personalSettings/customFontRuntime'
    import { acquireFont, detectFontFormat, FONT_LIMITS, fontDigest, readCustomFonts, resetCustomFontAssignments, sanitizeFontFilename, writeFontEntry, type CustomFont } from 'src/ts/personalSettings/customFonts'
    import { newPersonalId, rawAppearance, utf8Bytes, writeAppearanceGroup } from 'src/ts/personalSettings/cssToggles'
    import { getPersonalFontFamily, readPersonalAppearance, type PersonalFont, type PersonalFontTarget } from 'src/ts/personalSettings/appearanceValues'
    import { displaySize } from 'src/ts/personalSettings/displaySize'
    import FontNamePreview from './FontNamePreview.svelte'
    import { appearanceNotice, dismissAppearanceNotice } from 'src/ts/personalSettings/appearanceNotices'

    const builtins = [['paperlogy', 'Paperlogy'], ['galmuri14', 'Galmuri14']] as const
    const sampleText = '가나다라마바사 ABC xyz 日本語の文章 简体中文 繁體中文 Français été cœur'
    const fonts = $derived(readCustomFonts(DBState.db))
    const appearance = $derived(readPersonalAppearance(DBState.db))
    const customSupported = typeof window !== 'undefined' && !!window.FontFace && !!document.fonts && !!globalThis.crypto?.subtle
    const findEntry = (font: string) => fonts.value.custom?.find(entry => `custom:${entry.id}` === font)
    const fontName = (font: PersonalFont) => builtins.find(([value]) => value === font)?.[1] ?? findEntry(font)?.name ?? '저장된 폰트를 찾을 수 없음'
    const storedBytes = $derived([...new Map((fonts.value.custom ?? []).map(f => [f.assetPath, f.byteLength])).values()].reduce((sum, bytes) => sum + bytes, 0))
    const busy = $derived($personalCssStatus.phase !== 'idle')
    const paused = $derived($SafeModeStore || !appearance.enabled || $personalCssStatus.recovery || $personalCssStatus.validation)
    let target = $state<PersonalFontTarget>('chat')
    const selected = $derived(appearance[target].font)
    let editing = $state(false)
    let replacing = $state<string | undefined>()
    let name = $state('')
    let mode = $state('file')
    let url = $state('')
    let file = $state<File | undefined>()
    let previewedSource: File | string | undefined
    let pending = $state(false)
    let bytesRead = $state(0)
    let candidate = $state<CustomFont | null>(null)
    let bytes: Uint8Array | undefined
    let base: unknown
    let controller: AbortController | undefined
    let previewOwner: CustomFontRuntime | undefined
    let showRaw = $state(false)
    let expanded = $state(false)
    let generation = 0
    let origin: HTMLElement | null = null
    let returnFocus = $state(false)
    let fontSummary = $state<HTMLElement>()
    let previewFamily = $state('inherit')
    const previewEntry = $derived(findEntry(selected))
    const previewKey = $derived(previewEntry ? customFontIdentity(previewEntry) : selected)
    function clearCandidate() {
        ++generation
        controller?.abort()
        previewOwner?.clear()
        previewOwner = undefined
        candidate = null; bytes = undefined; bytesRead = 0; previewedSource = undefined
    }
    function close(focus = true) {
        const saving = (pending && (!editing || !!candidate)) || ($personalCssStatus.scope === 'font' && $personalCssStatus.phase === 'saving')
        if (!saving) dismissAppearanceNotice('font')
        clearCandidate()
        editing = false; pending = false; file = undefined; url = ''
        returnFocus = focus
    }
    function open(entry?: CustomFont, event?: MouseEvent) {
        close(false)
        origin = event?.currentTarget as HTMLElement ?? null
        editing = true; replacing = entry?.id; name = entry?.name ?? ''; base = fontEditBase()
    }
    // Loads a picked file or a committed URL and shows it without saving.
    async function preview() {
        const source = mode === 'file' ? file : url.trim()
        if (!source || source === previewedSource) return
        clearCandidate()
        previewedSource = source
        pending = true
        appearanceNotice('font', 'loading', '폰트 미리보기를 준비하는 중…')
        const current = generation
        controller = new AbortController()
        previewOwner = new CustomFontRuntime(document)
        const owner = previewOwner
        try {
            const data = await acquireFont(source, controller.signal, size => bytesRead = size)
            const entry: CustomFont = { id: replacing ?? newPersonalId(), name: '', assetPath: '', originalFileName: typeof source === 'string' ? '' : sanitizeFontFilename(source.name), format: detectFontFormat(data), byteLength: data.length, sha256: await fontDigest(data) }
            if (current !== generation) return
            await owner.prepare(entry, data)
            if (current !== generation) return
            bytes = data; candidate = entry; appearanceNotice('font', 'info', '미리보기 준비 완료 · 아직 저장되지 않았습니다.')
        } catch (e) {
            if (current === generation) { previewedSource = undefined; appearanceNotice('font', 'error', e instanceof Error ? e.message : '미리보기 실패') }
        }
        finally { if (current === generation) pending = false }
    }
    async function save() {
        if (!candidate || !bytes) return
        if (!name.trim()) { appearanceNotice('font', 'error', '폰트 이름을 입력하세요.'); return }
        if (utf8Bytes(name.trim()) > FONT_LIMITS.name) { appearanceNotice('font', 'error', '폰트 이름이 길이 한도를 초과했습니다.'); return }
        pending = true; appearanceNotice('font', 'loading', '폰트 파일을 저장하고 확인하는 중…')
        try {
            await persistImportedFont({ ...candidate, name: name.trim() }, bytes, base, () => { close(); expanded = true })
        } catch (e) { appearanceNotice('font', 'error', e instanceof Error ? e.message : '폰트 저장 실패') }
        finally { pending = false }
    }
    async function choose(value: PersonalFont) {
        if (value === selected) return
        pending = true; appearanceNotice('font', 'loading', '폰트를 준비하는 중…')
        try { await selectFont(target, value, fontEditBase()) }
        catch (e) { appearanceNotice('font', 'error', e instanceof Error ? e.message : '폰트 선택 실패') }
        finally { pending = false }
    }
    async function toggle(next: PersonalFontTarget) {
        pending = true
        try { await setFontEnabled(next, !appearance[next].fontEnabled, fontEditBase()) }
        catch (e) { appearanceNotice('font', 'error', e instanceof Error ? e.message : '폰트 적용 설정 실패') }
        finally { pending = false }
    }
    async function remove(entry: CustomFont) {
        if (!window.confirm(`“${entry.name}” 폰트를 목록에서 제거할까요? 선택 중인 폰트라면 Galmuri14로 변경됩니다. 파일 자체는 삭제하지 않습니다.`)) return
        try { await commitFont(db => writeFontEntry(db, undefined, entry.id), fontEditBase(), () => {}) }
        catch (e) { appearanceNotice('font', 'error', e instanceof Error ? e.message : '제거 실패') }
    }
    async function rename(entry: CustomFont) {
        const value = window.prompt('폰트 이름', entry.name)
        if (value === null) return
        try { await commitFont(db => writeFontEntry(db, { ...entry, name: value }, entry.id), fontEditBase(), () => {}) }
        catch (e) { appearanceNotice('font', 'error', e instanceof Error ? e.message : '이름 저장 실패') }
    }
    async function reset() {
        if (!window.confirm('사용자 폰트 설정만 초기화할까요? 원본 복사는 폰트 파일의 백업이 아닙니다. 필요한 파일은 일반 백업으로 보관하세요.')) return
        try { await commitFont(db => {
            writeAppearanceGroup(db, 'fonts', undefined)
            resetCustomFontAssignments(db, font => font.startsWith('custom:'))
        }, fontEditBase(), () => { showRaw = false }) }
        catch (e) { appearanceNotice('font', 'error', e instanceof Error ? e.message : '초기화 실패') }
    }
    // Preview block: the font assigned to the selected target, loaded only while open.
    $effect(() => {
        previewKey
        previewFamily = 'inherit'
        if (!expanded) return
        const { font, entry, skip } = untrack(() => ({ font: selected, entry: previewEntry ? { ...previewEntry } : undefined, skip: paused || !customSupported }))
        const builtin = getPersonalFontFamily(font)
        if (builtin) { previewFamily = `"${builtin}", sans-serif`; return }
        if (!entry || skip) return
        let cancelled = false
        const owner = new CustomFontRuntime(document)
        void owner.load(entry, () => readFontAsset(entry.assetPath))
            .then(() => { if (!cancelled) previewFamily = `"${customFontFamily(entry)}", sans-serif` })
            .catch(() => {})
        return () => { cancelled = true; owner.clear() }
    })
    $effect(() => {
        if (paused) {
            if (editing) close(false)
        }
    })
    $effect(() => {
        if (returnFocus && !editing && !pending && !busy) {
            returnFocus = false
            if (origin?.isConnected && !origin.hasAttribute('disabled')) origin.focus()
            else fontSummary?.focus()
        }
    })
    onDestroy(() => close(false))
</script>

<section class="mt-3 space-y-3" aria-label="폰트 관리" data-setting-id="personal.appearance.fonts">
    <details class="font-picker rounded border border-darkborderc" bind:open={expanded}>
        <summary bind:this={fontSummary} class="font-summary" aria-label="폰트 목록">폰트 목록 · 채팅 {fontName(appearance.chat.font)} · UI {fontName(appearance.ui.font)}</summary>
        {#if expanded}
            <div class="font-panel">
                <div class="font-preview" aria-label={`${fontTargetLabel[target]} 미리보기`}>
                    <p class="personal-font-preview__sample text-sm leading-relaxed" style:--personal-preview-font-family={previewFamily}>
                        <span lang="ko">가나다라마바사</span>
                        <span lang="en">ABC xyz</span>
                        <span lang="ja">日本語の文章</span>
                        <span lang="zh-Hans">简体中文</span>
                        <span lang="zh-Hant">繁體中文</span>
                        <span lang="fr">Français été cœur</span>
                    </p>
                </div>
                <div class="target-switch" role="group" aria-label="폰트를 고를 대상">
                    {#each FONT_TARGETS as option}
                        <button type="button" aria-pressed={target === option} class:active={target === option} onclick={() => target = option}>{option === 'chat' ? '채팅' : 'UI'}</button>
                    {/each}
                </div>
                <div class="font-options" aria-label={`${fontTargetLabel[target]} 목록`}>
                    {#each builtins as [value, label]}
                        <div class="font-row" class:selected={selected === value}>
                            <button type="button" class="font-choice" aria-label={`${label}을 ${fontTargetLabel[target]}로 선택`} aria-pressed={selected === value} disabled={busy || pending || editing} onclick={() => void choose(value)}>
                                <FontNamePreview {value} {label} {paused} />
                            </button>
                            {@render badges(value)}
                            {#if selected === value}<span class="selected-mark" aria-hidden="true">✓</span>{/if}
                        </div>
                    {/each}
                    {#each fonts.value.custom ?? [] as entry (entry.id)}
                        <div class="font-row" class:selected={selected === `custom:${entry.id}`} data-custom-font-row={entry.id}>
                            <button type="button" class="font-choice" aria-label={`${entry.name}을 ${fontTargetLabel[target]}로 선택`} aria-pressed={selected === `custom:${entry.id}`} disabled={busy || pending || editing || !customSupported} onclick={() => void choose(`custom:${entry.id}`)}>
                                <FontNamePreview value={`custom:${entry.id}`} label={entry.name} {entry} paused={paused || !customSupported} />
                            </button>
                            {@render badges(`custom:${entry.id}`)}
                            {#if selected === `custom:${entry.id}`}<span class="selected-mark" aria-hidden="true">✓</span>{/if}
                            <div class="font-actions">
                                <button type="button" disabled={busy || pending || editing} aria-label={`${entry.name} 이름 변경`} onclick={() => void rename(entry)}>이름변경</button>
                                <button type="button" disabled={busy || pending || editing || paused || !customSupported} aria-label={`${entry.name} 파일 변경`} onclick={(event) => open(entry, event)}>파일변경</button>
                                <button type="button" disabled={busy || pending || editing} aria-label={`${entry.name} 삭제`} onclick={() => void remove(entry)}>삭제</button>
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        {/if}
    </details>
    <div class="font-toggles">
        {#each FONT_TARGETS as option}
            <button type="button" role="switch" class="font-toggle" aria-checked={appearance[option].fontEnabled} data-setting-id={`personal.appearance.${option}FontEnabled`} disabled={busy || pending || editing} onclick={() => void toggle(option)}>
                <span class="switch-track" class:on={appearance[option].fontEnabled} aria-hidden="true"><span class="switch-thumb"></span></span>
                <span>{fontTargetLabel[option]} 적용</span>
            </button>
        {/each}
    </div>
    {#if !customSupported}<p role="status">사용자 폰트 미리보기·선택을 사용할 수 없습니다. HTTPS 연결 또는 최신 브라우저를 사용하세요. 기본 폰트와 저장된 목록 관리는 계속 사용할 수 있습니다.</p>{/if}
    {#if !fonts.valid}
        <p role="alert">{fonts.error}</p>
        <button class="action" onclick={() => showRaw = true}>원본 보기 · 복사</button>
        {#if showRaw}
            <textarea class="w-full h-40 bg-darkbg" aria-label="폰트 설정 원본" readonly value={JSON.stringify(rawAppearance(DBState.db).fonts, null, 2)}></textarea>
            <p>이 원본에는 폰트 파일이 없습니다. 파일 보존에는 일반 백업을 사용하세요.</p>
            <button class="action" disabled={busy} onclick={reset}>폰트 하위 설정 초기화</button>
        {/if}
    {:else}
        <p class="text-xs">사용자 폰트 {fonts.value.custom?.length ?? 0} / {FONT_LIMITS.count} · 고유 파일 {displaySize(storedBytes)} / {displaySize(FONT_LIMITS.total)} · 파일당 {displaySize(FONT_LIMITS.file)}</p>
        {#if storedBytes >= FONT_LIMITS.warningTotal || (fonts.value.custom?.length ?? 0) >= FONT_LIMITS.warningCount}<p role="status">폰트가 많습니다. 백업 크기와 모바일 메모리 사용에 주의하세요.</p>{/if}
        <button class="action" disabled={busy || pending || editing || paused || !customSupported} onclick={(event) => open(undefined, event)}>사용자 폰트 추가</button>
        {#if paused}<p class="text-xs">사용자 폰트 미리보기는 전체 사용을 켜고 Safe Mode·복구 모드를 종료한 뒤 사용할 수 있습니다.</p>{/if}
        {#if editing}
            <form class="border border-primary rounded p-3 space-y-3" onsubmit={(e) => { e.preventDefault(); if (mode === 'url') void preview() }}>
                <label class="block">이름 <input class="w-full bg-darkbg p-2" bind:value={name} disabled={pending} /></label>
                <label class="block">가져올 위치 <select class="bg-darkbg p-2" bind:value={mode} disabled={pending} onchange={() => { clearCandidate(); file = undefined; url = '' }}><option value="file">로컬 폰트 파일</option><option value="url">직접 HTTPS 폰트 파일 주소</option></select></label>
                {#if mode === 'file'}
                    <input class="file-input" aria-label="폰트 파일" type="file" accept=".woff2,.woff,.ttf,.otf" disabled={pending} onchange={(e) => { file = e.currentTarget.files?.[0]; void preview() }} />
                {:else}
                    <input class="w-full bg-darkbg p-2" aria-label="직접 HTTPS 폰트 파일 주소" type="url" bind:value={url} disabled={pending} onblur={() => void preview()} />
                    <p class="text-xs">웹페이지·CSS 주소는 지원하지 않습니다. CORS가 차단되면 파일을 내려받아 업로드하세요. 주소는 저장하지 않으며 성공 후에는 저장된 파일만 읽습니다.</p>
                {/if}
                <p role="status">{displaySize(bytesRead)}</p>
                {#if bytesRead >= FONT_LIMITS.warningFile}<p role="status">큰 폰트입니다. 실제 기기에서 미리보기와 채팅 표시를 확인하세요.</p>{/if}
                {#if candidate}
                    <p class="text-sm leading-relaxed" style:font-family={customFontFamily(candidate)}>{sampleText}</p>
                {/if}
                <button type="button" class="action" disabled={pending || busy || !candidate} onclick={save}>적용</button>
                <button type="button" class="action" disabled={busy || (pending && !!candidate)} onclick={() => close()}>취소</button>
            </form>
        {/if}
    {/if}
</section>

{#snippet badges(value: string)}
    <span class="target-badges" aria-label={FONT_TARGETS.filter(option => appearance[option].font === value).map(option => `${fontTargetLabel[option]}에 배정됨`).join(', ')}>
        {#each FONT_TARGETS as option}
            {#if appearance[option].font === value}<span class="target-badge" aria-hidden="true">{option === 'chat' ? '채팅' : 'UI'}</span>{/if}
        {/each}
    </span>
{/snippet}

<style>
    .action { min-height: 44px; padding: 0.4rem 0.8rem; border: 1px solid currentColor; border-radius: 0.4rem; margin: 0.2rem; }
    .action:disabled { opacity: 0.45; }
    .font-summary { min-height: 44px; padding: 0.65rem; cursor: pointer; overflow-wrap: anywhere; }
    .font-panel { padding: 0 0.4rem 0.4rem; }
    .font-preview { margin-bottom: 0.5rem; padding: 0.5rem 0.6rem; border: 1px solid var(--risu-theme-borderc); border-radius: 0.35rem; background: var(--risu-theme-darkbg); }
    .target-switch { display: flex; gap: 0.25rem; margin-bottom: 0.4rem; }
    .target-switch button { flex: 1; min-height: 44px; border: 1px solid var(--risu-theme-darkborderc); border-radius: 0.35rem; }
    .target-switch button.active { border-color: var(--risu-theme-selected); background: var(--risu-theme-darkbg); font-weight: 600; }
    .font-options { max-height: 20rem; overflow-y: auto; }
    .font-row { display: flex; align-items: center; gap: 0.25rem; min-width: 0; border-radius: 0.35rem; border: 1px solid transparent; }
    .font-row.selected { border-color: var(--risu-theme-selected); background: var(--risu-theme-darkbg); }
    .font-choice { flex: 1; min-width: 0; min-height: 44px; padding: 0.4rem; text-align: left; }
    .selected-mark { flex: none; font-size: 0.75rem; }
    .target-badges { display: flex; flex: none; gap: 0.15rem; }
    .target-badge { padding: 0 0.3rem; font-size: 0.65rem; line-height: 1.4; border: 1px solid currentColor; border-radius: 0.25rem; opacity: 0.8; }
    .font-actions { display: flex; flex: none; gap: 0.15rem; }
    .font-actions button { min-width: 44px; min-height: 44px; padding: 0.25rem; font-size: 0.7rem; white-space: nowrap; border: 1px solid currentColor; border-radius: 0.3rem; }
    .font-choice:disabled, .font-actions button:disabled { opacity: 0.45; }
    .font-toggles { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .font-toggle { display: flex; flex: 1 1 8rem; align-items: center; gap: 0.5rem; min-height: 44px; padding: 0.25rem 0.5rem; border: 1px solid var(--risu-theme-darkborderc); border-radius: 0.35rem; text-align: left; }
    .font-toggle:disabled { opacity: 0.45; }
    .switch-track { position: relative; flex: none; width: 2.25rem; height: 1.25rem; border-radius: 9999px; background: var(--risu-theme-darkborderc); transition: background-color 0.15s; }
    .switch-track.on { background: var(--risu-theme-selected); }
    .switch-thumb { position: absolute; top: 0.125rem; left: 0.125rem; width: 1rem; height: 1rem; border-radius: 9999px; background: var(--risu-theme-textcolor); transition: transform 0.15s; }
    .switch-track.on .switch-thumb { transform: translateX(1rem); }
    .file-input { display: block; width: 100%; min-height: 44px; padding: 0.5rem; border: 1px solid var(--risu-theme-darkborderc); border-radius: 0.35rem; background: var(--risu-theme-darkbg); cursor: pointer; }
    .file-input:disabled { opacity: 0.45; }
</style>
