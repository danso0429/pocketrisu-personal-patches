<script lang="ts">
    import CssToggleManager from './CssToggleManager.svelte'
    import CustomFontManager from './CustomFontManager.svelte'
    import CssRecoveryNotice from './CssRecoveryNotice.svelte'
    import SettingRenderer from 'src/lib/Setting/SettingRenderer.svelte'
    import { language } from 'src/lang'
    import { DBState, SafeModeStore } from 'src/ts/stores.svelte'
    import {
        personalAppearanceFontSettingsItems,
    } from 'src/ts/setting/personalAppearanceSettingsData'
    import { readPersonalAppearance } from 'src/ts/personalSettings/appearance'

    let appearance = $derived(readPersonalAppearance(DBState.db))
</script>

<div class="mb-3 rounded-md border border-darkborderc/70 bg-darkbg/30 p-3 text-xs text-textcolor2 space-y-2" aria-label="꾸미기 안내 및 복구">
    <p>꾸미기는 모든 테마에 적용됩니다. 채팅 폰트는 메시지 본문의 기본 글꼴을, UI 폰트는 본문을 제외한 나머지 화면의 기본 글꼴을 바꾸며, 테마가 직접 지정한 제목·대사 등의 글꼴은 유지합니다. UI 폰트를 끄면 디스플레이 설정의 폰트를 사용합니다. 심플 입력창은 PocketRisu Standard 입력창에만 적용됩니다. Safe Mode에서는 저장값을 바꾸지 않고 모두 잠시 꺼집니다.</p>
    {#if appearance.schemaStatus !== 'unsupported'}<CssRecoveryNotice />{/if}
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

    <SettingRenderer items={personalAppearanceFontSettingsItems.slice(0, 1)} layout="row" />
    <CustomFontManager />

    <div class="mt-1">
        <CssToggleManager />
    </div>

    <p class="mt-3 text-xs text-textcolor2" aria-live="polite">
        {DBState.db.jailbreakToggle
            ? language.personalAppearanceJailbreakStatusOn
            : language.personalAppearanceJailbreakStatusOff}
    </p>
{/if}
