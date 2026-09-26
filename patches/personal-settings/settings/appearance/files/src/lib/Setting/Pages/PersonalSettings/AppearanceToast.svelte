<script lang="ts">
    import type { Readable } from 'svelte/store'
    import { CircleCheckIcon, CircleXIcon, InfoIcon, LoaderCircleIcon } from '@lucide/svelte'
    import type { AppearanceNoticeState } from 'src/ts/personalSettings/appearanceNotices'

    let { status }: { status: Readable<AppearanceNoticeState> } = $props()
</script>

<div class="pa-card pa-{$status.kind}" role={$status.kind === 'error' ? 'alert' : 'status'}>
    <div class="pa-icon" aria-hidden="true">
        {#if $status.kind === 'loading'}
            <LoaderCircleIcon size={18} class="pa-spin" />
        {:else if $status.kind === 'success'}
            <CircleCheckIcon size={18} />
        {:else if $status.kind === 'error'}
            <CircleXIcon size={18} />
        {:else}
            <InfoIcon size={18} />
        {/if}
    </div>
    <div class="pa-message">{$status.message}</div>
</div>

<style>
    .pa-card {
        display: flex;
        width: 100%;
        align-items: center;
        gap: 10px;
        padding: 10px 13px;
        overflow: hidden;
        color: var(--risu-theme-textcolor);
        background: var(--risu-theme-darkbg);
        border: 1px solid var(--risu-theme-darkborderc);
        border-left-width: 4px;
        border-radius: 0.5rem;
        font-size: 0.875rem;
    }
    .pa-loading, .pa-info { border-left-color: var(--risu-theme-primary); }
    .pa-success { border-left-color: var(--risu-theme-success); }
    .pa-error { border-left-color: var(--risu-theme-draculared); }
    .pa-icon { display: flex; flex: 0 0 auto; color: var(--risu-theme-primary); }
    .pa-success .pa-icon { color: var(--risu-theme-success); }
    .pa-error .pa-icon { color: var(--risu-theme-draculared); }
    .pa-message { min-width: 0; flex: 1; overflow-wrap: anywhere; line-height: 1.3; }
    :global(.pa-spin) { animation: pa-spin 1s linear infinite; }
    @keyframes pa-spin { to { transform: rotate(360deg); } }
</style>
