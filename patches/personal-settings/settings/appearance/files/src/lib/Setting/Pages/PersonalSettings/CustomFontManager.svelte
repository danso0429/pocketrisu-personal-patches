<script lang="ts">
    import { onDestroy } from 'svelte'
    import { DBState, SafeModeStore } from 'src/ts/stores.svelte'
    import { personalCssStatus } from 'src/ts/personalSettings/cssToggleRuntime'
    import { appearanceRuntime, commitFont, fontEditBase, persistImportedFont, selectCustomFont } from 'src/ts/personalSettings/appearanceEditor'
    import { CustomFontRuntime, customFontFamily, customFontLoadStatus } from 'src/ts/personalSettings/customFontRuntime'
    import { acquireFont, detectFontFormat, FONT_LIMITS, fontDigest, readCustomFonts, sanitizeFontFilename, writeFontEntry, type CustomFont } from 'src/ts/personalSettings/customFonts'
    import { newPersonalId, rawAppearance, utf8Bytes, writeAppearanceGroup } from 'src/ts/personalSettings/cssToggles'
    import { readPersonalAppearance, setPersonalAppearanceValue } from 'src/ts/personalSettings/appearanceValues'

    const builtins = [['app', '앱 폰트 사용'], ['paperlogy', 'Paperlogy'], ['noto-sans-kr', 'Noto Sans KR'], ['noto-serif-kr', 'Noto Serif KR'], ['ibm-plex-sans-kr', 'IBM Plex Sans KR'], ['gowun-dodum', 'Gowun Dodum'], ['gowun-batang', 'Gowun Batang'], ['hahmlet', 'Hahmlet']]
    const fonts = $derived(readCustomFonts(DBState.db))
    const customSupported = typeof window !== 'undefined' && !!window.FontFace && !!document.fonts && !!globalThis.crypto?.subtle
    const selected = $derived(rawAppearance(DBState.db).chat?.font ?? 'app')
    const storedBytes = $derived([...new Map((fonts.value.custom ?? []).map(f => [f.assetPath, f.byteLength])).values()].reduce((sum, bytes) => sum + bytes, 0))
    const busy = $derived($personalCssStatus.phase !== 'idle')
    const paused = $derived($SafeModeStore || DBState.db.theme !== '' || !readPersonalAppearance(DBState.db).enabled || $personalCssStatus.recovery || $personalCssStatus.validation)
    let editing = $state(false)
    let replacing = $state<string | undefined>()
    let name = $state('')
    let mode = $state('file')
    let url = $state('')
    let file = $state<File | undefined>()
    let pending = $state(false)
    let bytesRead = $state(0)
    let status = $state('')
    let candidate = $state<CustomFont | null>(null)
    let bytes: Uint8Array | undefined
    let base: unknown
    let controller: AbortController | undefined
    let previewOwner: CustomFontRuntime | undefined
    let showRaw = $state(false)
    let filter = $state('')
    let generation = 0
    function close() {
        ++generation
        controller?.abort()
        previewOwner?.clear()
        previewOwner = undefined
        editing = false; pending = false; candidate = null; bytes = undefined; file = undefined; url = ''; bytesRead = 0
    }
    function open(entry?: CustomFont) {
        close()
        editing = true; replacing = entry?.id; name = entry?.name ?? ''; base = fontEditBase(); status = ''
    }
    async function preview() {
        status = ''; pending = true
        const current = ++generation
        controller?.abort()
        controller = new AbortController()
        previewOwner?.clear()
        previewOwner = new CustomFontRuntime(document)
        const owner = previewOwner
        try {
            if (!name.trim() || (mode === 'file' && !file)) throw new Error('이름과 폰트 파일을 선택하세요.')
            if (utf8Bytes(name.trim()) > FONT_LIMITS.name) throw new Error('폰트 이름이 길이 한도를 초과했습니다.')
            const data = await acquireFont(mode === 'file' ? file! : url, controller.signal, size => bytesRead = size)
            const entry: CustomFont = { id: replacing ?? newPersonalId(), name: name.trim(), assetPath: '', originalFileName: mode === 'file' ? sanitizeFontFilename(file!.name) : '', format: detectFontFormat(data), byteLength: data.length, sha256: await fontDigest(data) }
            if (current !== generation) return
            await owner.prepare(entry, data)
            if (current !== generation) return
            bytes = data; candidate = entry; status = '미리보기 준비 완료 · 아직 저장되지 않았습니다.'
        } catch (e) { if (current === generation) status = e instanceof Error ? e.message : '미리보기 실패' }
        finally { if (current === generation) pending = false }
    }
    async function save() {
        if (!candidate || !bytes) return
        pending = true; status = '폰트 자산 저장 및 무결성 확인 중…'
        try {
            await persistImportedFont({ ...candidate, name: name.trim() }, bytes, base, () => { close(); status = '폰트 저장 완료 · 채팅 폰트는 별도로 선택하세요.' })
        } catch (e) { status = e instanceof Error ? e.message : '폰트 저장 실패' }
        finally { pending = false }
    }
    async function choose(value: string) {
        status = ''; pending = true
        try {
            if (value.startsWith('custom:')) await selectCustomFont(value.slice(7), fontEditBase())
            else await commitFont(db => { if (!setPersonalAppearanceValue(db, 'chat.font', value)) throw new Error('폰트를 선택할 수 없습니다.') }, fontEditBase(), () => { status = '폰트 선택 저장 완료' })
        } catch (e) { status = e instanceof Error ? e.message : '폰트 선택 실패' }
        finally { pending = false }
    }
    async function remove(entry: CustomFont) {
        if (!window.confirm(`“${entry.name}” 폰트를 목록에서 제거할까요? 선택 중인 폰트라면 앱 폰트로 변경됩니다. 파일 자체는 삭제하지 않습니다.`)) return
        try { await commitFont(db => writeFontEntry(db, undefined, entry.id), fontEditBase(), () => { status = '목록에서 제거했습니다.' }) }
        catch (e) { status = e instanceof Error ? e.message : '제거 실패' }
    }
    async function rename(entry: CustomFont) {
        const value = window.prompt('폰트 이름', entry.name)
        if (value === null) return
        try { await commitFont(db => writeFontEntry(db, { ...entry, name: value }, entry.id), fontEditBase(), () => { status = '이름 저장 완료' }) }
        catch (e) { status = e instanceof Error ? e.message : '이름 저장 실패' }
    }
    async function reset() {
        if (!window.confirm('사용자 폰트 설정만 초기화할까요? 원본 복사는 폰트 파일의 백업이 아닙니다. 필요한 파일은 일반 백업으로 보관하세요.')) return
        try { await commitFont(db => {
            writeAppearanceGroup(db, 'fonts', undefined)
            if (String(rawAppearance(db).chat?.font).startsWith('custom:')) setPersonalAppearanceValue(db, 'chat.font', 'app')
        }, fontEditBase(), () => { showRaw = false; status = '폰트 하위 설정을 초기화했습니다.' }) }
        catch (e) { status = e instanceof Error ? e.message : '초기화 실패' }
    }
    $effect(() => {
        if (paused) {
            if (editing) close()
        }
    })
    onDestroy(close)
</script>

<section class="mt-3 space-y-3" aria-label="채팅 폰트 관리" data-setting-id="personal.appearance.chatFont">
    <label class="block">채팅 폰트
        <select aria-label="채팅 폰트" class="w-full min-h-11 p-2 bg-darkbg rounded" value={selected} disabled={busy || pending || editing} onchange={(e) => { const value = e.currentTarget.value; e.currentTarget.value = selected; void choose(value) }}>
            {#each builtins as [value, label]}<option {value}>{label}</option>{/each}
            {#each fonts.value.custom ?? [] as entry (entry.id)}<option value={`custom:${entry.id}`} disabled={!customSupported}>{entry.name}</option>{/each}
            {#if !builtins.some(([value]) => value === selected) && !(fonts.value.custom ?? []).some(f => `custom:${f.id}` === selected)}<option value={selected}>저장된 폰트를 확인할 수 없음 · 앱 폰트 사용</option>{/if}
        </select>
    </label>
    <p role="status" aria-live="polite">{status || $personalCssStatus.message}</p>
    {#if !customSupported}<p role="status">사용자 폰트 미리보기·선택을 사용할 수 없습니다. HTTPS 연결 또는 최신 브라우저를 사용하세요. 기본 폰트와 저장된 목록 관리는 계속 사용할 수 있습니다.</p>{/if}
    {#if String(selected).startsWith('custom:')}
        <p role="status" aria-live="polite">{$customFontLoadStatus}</p>
        <p class="personal-font-preview__sample text-xl">가나다라마바사 ABC xyz 日本語の文章 简体中文 繁體中文 Français été cœur</p>
    {/if}
    {#if !fonts.valid}
        <p role="alert">{fonts.error}</p>
        <button class="action" onclick={() => showRaw = true}>원본 보기 · 복사</button>
        {#if showRaw}
            <textarea class="w-full h-40 bg-darkbg" aria-label="폰트 설정 원본" readonly value={JSON.stringify(rawAppearance(DBState.db).fonts, null, 2)}></textarea>
            <p>이 원본에는 폰트 파일이 없습니다. 파일 보존에는 일반 백업을 사용하세요.</p>
            <button class="action" disabled={busy} onclick={reset}>폰트 하위 설정 초기화</button>
        {/if}
    {:else}
        <p class="text-xs">사용자 폰트 {fonts.value.custom?.length ?? 0} / {FONT_LIMITS.count} · 고유 파일 {storedBytes.toLocaleString()} / {FONT_LIMITS.total.toLocaleString()} bytes · 파일당 {FONT_LIMITS.file.toLocaleString()} bytes</p>
        {#if storedBytes >= FONT_LIMITS.warningTotal || (fonts.value.custom?.length ?? 0) >= FONT_LIMITS.warningCount}<p role="status">폰트가 많습니다. 백업 크기와 모바일 메모리 사용에 주의하세요.</p>{/if}
        <button class="action" disabled={busy || pending || editing || paused || !customSupported} onclick={() => open()}>사용자 폰트 추가</button>
        {#if paused}<p class="text-xs">사용자 폰트 미리보기는 Standard 테마에서 전체 사용을 켜고 Safe Mode·복구 모드를 종료한 뒤 사용할 수 있습니다.</p>{/if}
        {#if editing}
            <form class="border border-primary rounded p-3 space-y-3" onsubmit={(e) => { e.preventDefault(); void preview() }}>
                <label class="block">이름 <input class="w-full bg-darkbg p-2" bind:value={name} disabled={pending} /></label>
                <label class="block">가져올 위치 <select class="bg-darkbg p-2" bind:value={mode} disabled={pending || !!candidate}><option value="file">로컬 폰트 파일</option><option value="url">직접 HTTPS 폰트 파일 주소</option></select></label>
                {#if mode === 'file'}
                    <input aria-label="폰트 파일" type="file" accept=".woff2,.woff,.ttf,.otf" disabled={pending || !!candidate} onchange={(e) => file = e.currentTarget.files?.[0]} />
                {:else}
                    <input class="w-full bg-darkbg p-2" aria-label="직접 HTTPS 폰트 파일 주소" type="url" bind:value={url} disabled={pending || !!candidate} />
                    <p class="text-xs">웹페이지·CSS 주소는 지원하지 않습니다. CORS가 차단되면 파일을 내려받아 업로드하세요. 주소는 저장하지 않으며 성공 후에는 저장된 파일만 읽습니다.</p>
                {/if}
                <p role="status">{bytesRead.toLocaleString()} bytes</p>
                {#if bytesRead >= FONT_LIMITS.warningFile}<p role="status">큰 폰트입니다. 실제 기기에서 미리보기와 채팅 표시를 확인하세요.</p>{/if}
                {#if candidate}
                    <p class="text-xl" style:font-family={customFontFamily(candidate)}>가나다라마바사 ABC xyz 日本語の文章 简体中文 繁體中文 Français été cœur</p>
                    <button type="button" class="action" disabled={pending || busy} onclick={save}>폰트 저장</button>
                {:else}<button type="submit" class="action" disabled={pending || busy}>미리보기</button>{/if}
                <button type="button" class="action" disabled={busy || (pending && !!candidate)} onclick={close}>취소</button>
            </form>
        {/if}
        <label class="block">사용자 폰트 검색 <input class="w-full bg-darkbg p-2" bind:value={filter} /></label>
        {#each (fonts.value.custom ?? []).filter(f => f.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase())) as entry (entry.id)}
            <div class="rounded border border-darkborderc p-3">
                <p style:overflow-wrap="anywhere">{entry.name} · {entry.format} · {entry.byteLength.toLocaleString()} bytes</p>
                <button class="action" disabled={busy || pending || editing} onclick={() => void rename(entry)}>이름 변경</button>
                <button class="action" disabled={busy || pending || editing || paused || !customSupported} onclick={() => open(entry)}>파일 교체</button>
                <button class="action" disabled={busy || pending || editing} onclick={() => void remove(entry)}>제거</button>
            </div>
        {/each}
    {/if}
</section>

<style>
    .action { min-height: 44px; padding: 0.4rem 0.8rem; border: 1px solid currentColor; border-radius: 0.4rem; margin: 0.2rem; }
    .action:disabled { opacity: 0.45; }
</style>
