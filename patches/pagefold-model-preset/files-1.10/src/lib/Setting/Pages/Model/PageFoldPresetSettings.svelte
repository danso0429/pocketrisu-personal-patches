<script lang="ts">
    import type { ModelPreset, PageFoldMode } from 'src/ts/preset/types';
    import { language } from 'src/lang';
    import { resolvePageFoldQualifiedRoute, PAGEFOLD_QUALIFIED_ROUTE } from 'src/ts/pagefold/qualifiedRoute';
    import { resolvePageFoldPrice } from 'src/ts/pagefold/pricing';
    import ShSwitch from 'src/lib/UI/GUI/ShSwitch.svelte';
    import SelectInput from 'src/lib/UI/GUI/SelectInput.svelte';
    import OptionInput from 'src/lib/UI/GUI/OptionInput.svelte';
    import NumberInput from 'src/lib/UI/GUI/NumberInput.svelte';

    interface Props { preset: ModelPreset }
    let { preset }: Props = $props();

    const route = $derived(resolvePageFoldQualifiedRoute(preset));
    const mode = $derived(preset.pageFold?.mode ?? '');
    const enabled = $derived(preset.pageFold?.enabled === true);
    const modeReady = $derived(mode === 'maximum' || mode === 'balanced');
    const conflict = $derived(
        preset.toolUse === true
        || preset.promptCaching?.enabled === true
        || preset.imageInput === true
    );
    const price = $derived(resolvePageFoldPrice(preset));

    function setMode(value: string) {
        if (value !== 'maximum' && value !== 'balanced') {
            preset.pageFold = { enabled: false };
            return;
        }
        preset.pageFold = {
            ...(preset.pageFold ?? { enabled: false }),
            mode: value as PageFoldMode,
        };
    }

    function setEnabled(value: boolean) {
        if (value && !modeReady) return;
        preset.pageFold = {
            ...(preset.pageFold ?? {}),
            enabled: value,
            ...(modeReady ? { mode: mode as PageFoldMode } : {}),
        };
    }

    function setManualPrice(event: Event & { currentTarget: HTMLInputElement }) {
        const value = event.currentTarget.valueAsNumber;
        if (!Number.isFinite(value) || value <= 0) {
            if (preset.pageFold?.inputPriceOverride) {
                const { inputPriceOverride: _removed, ...rest } = preset.pageFold;
                preset.pageFold = rest;
            }
            return;
        }
        preset.pageFold = {
            ...(preset.pageFold ?? { enabled: false }),
            inputPriceOverride: { usdPerMillion: value, updatedAt: Date.now() },
        };
    }
</script>

<section class="flex flex-col gap-3 mb-6 rounded-md border border-darkborderc p-3" aria-labelledby="pagefold-title">
    <div class="flex items-start justify-between gap-3">
        <div class="flex flex-col gap-0.5 min-w-0">
            <h3 id="pagefold-title" class="text-sm font-semibold text-textcolor">{language.pageFoldTitle}</h3>
            <span class="text-xs text-textcolor2">{language.pageFoldHelp}</span>
        </div>
        <ShSwitch
            checked={enabled}
            disabled={!modeReady}
            ariaLabelledby="pagefold-title"
            ariaDescribedby="pagefold-mode-help"
            onCheckedChange={setEnabled}
        />
    </div>

    <div class="flex flex-col gap-1">
        <span id="pagefold-mode-label" class="text-sm text-textcolor">{language.pageFoldMode}</span>
        <SelectInput
            value={mode}
            onchange={(event) => setMode(event.currentTarget.value)}
            ariaLabelledby="pagefold-mode-label"
            ariaDescribedby="pagefold-mode-help"
        >
            <OptionInput value="">{language.pageFoldModeRequired}</OptionInput>
            <OptionInput value="maximum">{language.pageFoldModeMaximum}</OptionInput>
            <OptionInput value="balanced">{language.pageFoldModeBalanced}</OptionInput>
        </SelectInput>
        <span id="pagefold-mode-help" class="text-xs text-textcolor2">{language.pageFoldModeHelp}</span>
    </div>

    <div class="rounded-md bg-darkbg p-2 text-xs flex flex-col gap-1">
        <span class={route.ok ? 'text-success' : 'text-red-400'}>
            {route.ok ? language.pageFoldQualified : language.pageFoldBlocked.replace('{reason}', route.reason)}
        </span>
        <span class="text-textcolor2">
            {language.pageFoldQualifiedRoute
                .replace('{model}', PAGEFOLD_QUALIFIED_ROUTE.requestedModel)
                .replace('{pages}', String(PAGEFOLD_QUALIFIED_ROUTE.maxPdfPages))}
        </span>
        <span class="text-textcolor2">{language.pageFoldNoResolutionPicker}</span>
        <span class="text-textcolor2">
            {price.state === 'confirmed'
                ? language.pageFoldPriceConfirmed
                    .replace('{input}', String(price.record.inputUsdPerMillion))
                    .replace('{output}', String(price.record.outputUsdPerMillion))
                : language.pageFoldPriceUnconfirmed}
        </span>
    </div>

    <div class="flex items-center justify-between gap-3">
        <div class="flex flex-col gap-0.5 min-w-0">
            <span class="text-sm text-textcolor">{language.pageFoldManualInputPrice}</span>
            <span class="text-xs text-textcolor2">{language.pageFoldManualInputPriceHelp}</span>
        </div>
        <NumberInput
            value={preset.pageFold?.inputPriceOverride?.usdPerMillion as number}
            placeholder="0.75"
            min={0.000001}
            className="w-28 shrink-0"
            onChange={setManualPrice}
        />
    </div>

    {#if conflict}
        <p class="text-xs text-amber-400">{language.pageFoldConflictWarning}</p>
    {/if}

    <details class="text-xs text-textcolor2">
        <summary class="cursor-pointer text-textcolor">{language.pageFoldFidelityTitle}</summary>
        <ul class="list-disc pl-5 pt-2 flex flex-col gap-1">
            <li>{language.pageFoldFidelityExact}</li>
            <li>{language.pageFoldFidelitySemantic}</li>
            <li>{language.pageFoldFidelityDeferred}</li>
        </ul>
    </details>
</section>
