<script lang="ts">
    import SettingRenderer from 'src/lib/Setting/SettingRenderer.svelte'
    import { language } from 'src/lang'
    import { DBState, SafeModeStore } from 'src/ts/stores.svelte'
    import { personalAppearanceSettingsItems } from 'src/ts/setting/personalAppearanceSettingsData'
    import { readPersonalAppearance } from 'src/ts/personalSettings/appearance'

    let appearance = $derived(readPersonalAppearance(DBState.db))
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

    <p class="mt-3 text-xs text-textcolor2" aria-live="polite">
        {DBState.db.jailbreakToggle
            ? language.personalAppearanceJailbreakStatusOn
            : language.personalAppearanceJailbreakStatusOff}
    </p>
{/if}
