<script lang="ts">
    import SettingRenderer from 'src/lib/Setting/SettingRenderer.svelte'
    import { language } from 'src/lang'
    import { DBState, SafeModeStore } from 'src/ts/stores.svelte'
    import { personalAppearanceSettingsItems } from 'src/ts/setting/personalAppearanceSettingsData'
    import {
        getPersonalChatFontFamily,
        isPersonalAppearanceFeatureEffective,
        readPersonalAppearance,
    } from 'src/ts/personalSettings/appearance'

    type FontLoadStatus = 'app' | 'inactive' | 'loading' | 'ready' | 'failed' | 'unavailable'

    let appearance = $derived(readPersonalAppearance(DBState.db))
    let fontLoadStatus: FontLoadStatus = $state('app')
    let fontLoadGeneration = 0

    const fontPreviewText = '가나다라마바사 ABC xyz 日本語の文章 简体中文 繁體中文 Français été cœur'

    function fontStatusLabel(status: FontLoadStatus): string {
        switch (status) {
            case 'app': return language.personalAppearanceFontStatusApp
            case 'inactive': return language.personalAppearanceFontStatusInactive
            case 'loading': return language.personalAppearanceFontStatusLoading
            case 'ready': return language.personalAppearanceFontStatusReady
            case 'failed': return language.personalAppearanceFontStatusFailed
            case 'unavailable': return language.personalAppearanceFontStatusUnavailable
        }
    }

    $effect(() => {
        const font = appearance.chat.font
        const family = getPersonalChatFontFamily(font)
        const effective = isPersonalAppearanceFeatureEffective(
            DBState.db,
            $SafeModeStore,
            'chat.font',
        )
        const generation = ++fontLoadGeneration

        if (family === null) {
            fontLoadStatus = 'app'
            return
        }
        if (!effective) {
            fontLoadStatus = 'inactive'
            return
        }
        if (typeof document === 'undefined' || document.fonts === undefined) {
            fontLoadStatus = 'unavailable'
            return
        }

        fontLoadStatus = 'loading'
        void document.fonts
            .load(`400 1.25rem "${family}"`, fontPreviewText)
            .then((faces) => {
                if (generation === fontLoadGeneration) {
                    fontLoadStatus = faces.length > 0 ? 'ready' : 'failed'
                }
            })
            .catch(() => {
                if (generation === fontLoadGeneration) fontLoadStatus = 'failed'
            })
    })
</script>

<div class="mb-3 rounded-md border border-darkborderc/70 bg-darkbg/30 p-3 text-xs text-textcolor2">
    {language.personalAppearanceStandardOnly}
</div>

{#if appearance.schemaStatus === 'unsupported'}
    <div class="rounded-md border border-draculared/70 bg-draculared/10 p-3 text-sm text-textcolor" role="alert">
        {language.personalAppearanceSchemaUnsupported}
        {#if appearance.rawVersion !== undefined}
            <span class="ml-1">({String(appearance.rawVersion)})</span>
        {/if}
    </div>
{:else}
    {#if $SafeModeStore}
        <div class="mb-2 rounded-md border border-primary/50 bg-primary/10 p-2 text-xs text-textcolor" role="status">
            {language.personalAppearanceSafeModePaused}
        </div>
    {:else if !appearance.enabled}
        <div class="mb-2 rounded-md border border-darkborderc/70 p-2 text-xs text-textcolor2" role="status">
            {language.personalAppearanceMasterOff}
        </div>
    {/if}

    <SettingRenderer items={personalAppearanceSettingsItems} layout="row" />

    <section
        class="mt-3 rounded-md border border-darkborderc/70 bg-darkbg/20 p-3"
        aria-labelledby="personal-font-preview-label"
    >
        <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span id="personal-font-preview-label" class="font-semibold text-textcolor">
                {language.personalAppearanceFontPreview}
            </span>
            <span class="text-textcolor2" role="status" aria-live="polite">
                {fontStatusLabel(fontLoadStatus)}
            </span>
        </div>
        <p class="personal-font-preview__sample mt-2 text-xl leading-relaxed text-textcolor">
            <span lang="ko">가나다라마바사</span>
            <span lang="en">ABC xyz</span>
            <span lang="ja">日本語の文章</span>
            <span lang="zh-Hans">简体中文</span>
            <span lang="zh-Hant">繁體中文</span>
            <span lang="fr">Français été cœur</span>
        </p>
        <p class="mt-1 text-xs text-textcolor2">
            {language.personalAppearanceFontPreviewNote}
        </p>
    </section>

    <p class="mt-3 text-xs text-textcolor2" aria-live="polite">
        {DBState.db.jailbreakToggle
            ? language.personalAppearanceJailbreakStatusOn
            : language.personalAppearanceJailbreakStatusOff}
    </p>
{/if}
