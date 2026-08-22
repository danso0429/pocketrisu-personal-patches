<script lang="ts">
    import type { Readable } from 'svelte/store'
    import { CircleCheckIcon, CircleXIcon, LoaderCircleIcon } from '@lucide/svelte'
    import type { ImportToastState } from 'src/ts/characterImportState'

    let { status }: { status: Readable<ImportToastState> } = $props()
</script>

<div
    class="ci-card"
    class:ci-loading={$status.phase === 'loading'}
    class:ci-success={$status.phase === 'success'}
    class:ci-error={$status.phase === 'error'}
>
    <div class="ci-icon" aria-hidden="true">
        {#if $status.phase === 'loading'}
            <LoaderCircleIcon size={18} class="ci-spin" />
        {:else if $status.phase === 'success'}
            <CircleCheckIcon size={18} />
        {:else}
            <CircleXIcon size={18} />
        {/if}
    </div>
    <div class="ci-content">
        <div class="ci-title">{$status.message}</div>
        {#if $status.description}
            <div class="ci-description">{$status.description}</div>
        {/if}
    </div>
</div>

<style>
    .ci-card {
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

    .ci-loading { border-left-color: var(--risu-theme-primary); }
    .ci-success { border-left-color: var(--risu-theme-success); }
    .ci-error { border-left-color: var(--risu-theme-draculared); }

    .ci-icon {
        display: flex;
        flex: 0 0 auto;
        color: var(--risu-theme-primary);
    }
    .ci-success .ci-icon { color: var(--risu-theme-success); }
    .ci-error .ci-icon { color: var(--risu-theme-draculared); }

    .ci-content { min-width: 0; flex: 1; }
    .ci-title {
        overflow-wrap: anywhere;
        font-weight: 600;
        line-height: 1.25;
    }
    .ci-description {
        margin-top: 2px;
        overflow-wrap: anywhere;
        color: var(--risu-theme-textcolor2);
        font-size: 0.75rem;
        line-height: 1.25;
    }

    :global(.ci-spin) {
        animation: ci-spin 1s linear infinite;
    }
    @keyframes ci-spin {
        to { transform: rotate(360deg); }
    }
</style>
