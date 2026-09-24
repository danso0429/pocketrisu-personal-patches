<script lang="ts">
    import { onMount, untrack } from 'svelte'
    import { CustomFontRuntime, customFontFamily, customFontIdentity } from 'src/ts/personalSettings/customFontRuntime'
    import { readFontAsset } from 'src/ts/personalSettings/appearanceEditor'
    import { ensurePersonalChatFontStylesheet, getPersonalChatFontFamily, type PersonalChatFont } from 'src/ts/personalSettings/appearanceValues'
    import type { CustomFont } from 'src/ts/personalSettings/customFonts'

    let { value, label, entry, paused }: { value: PersonalChatFont; label: string; entry?: CustomFont; paused: boolean } = $props()
    let element: HTMLSpanElement
    let visible = $state(false)
    let family = $state('inherit')
    let loadStatus = $state('')
    const previewIdentity = $derived(entry ? customFontIdentity(entry) : value)

    onMount(() => {
        if (!window.IntersectionObserver) { visible = true; return }
        const observer = new IntersectionObserver(entries => {
            visible = entries[entries.length - 1]?.isIntersecting ?? false
        })
        observer.observe(element)
        return () => observer.disconnect()
    })
    $effect(() => {
        previewIdentity
        family = 'inherit'; loadStatus = ''
        if (!visible || paused) return
        const { font, builtinValue, sample } = untrack(() => ({ font: entry ? { ...entry } : undefined, builtinValue: value, sample: label }))
        if (builtinValue === 'app') return
        let cancelled = false
        const owner = new CustomFontRuntime(document)
        const builtin = getPersonalChatFontFamily(builtinValue)
        loadStatus = '폰트 미리보기 로딩 중'
        void (async () => {
            try {
                if (font) {
                    await owner.load(font, () => readFontAsset(font.assetPath))
                    if (!cancelled) family = `"${customFontFamily(font)}", sans-serif`
                } else if (builtin) {
                    const ready = await ensurePersonalChatFontStylesheet(builtinValue, document)
                    if (cancelled) return
                    const faces = ready && document.fonts ? await document.fonts.load(`400 1rem "${builtin}"`, sample) : []
                    if (!faces.length) throw new Error('폰트 미리보기를 불러올 수 없습니다.')
                    if (!cancelled) family = `"${builtin}", sans-serif`
                }
                if (!cancelled) loadStatus = ''
            } catch {
                if (!cancelled) loadStatus = '폰트 미리보기를 불러올 수 없음 · 기본 글꼴로 표시'
            }
        })()
        return () => { cancelled = true; owner.clear() }
    })
</script>

<span bind:this={element} class="font-name" style:font-family={family} title={loadStatus ? `${label} · ${loadStatus}` : label} data-font-preview={value} data-preview-status={family === 'inherit' ? 'inactive-or-unavailable' : 'ready'}>{label}</span>

<style>
    .font-name { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
