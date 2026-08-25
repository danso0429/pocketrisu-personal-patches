<script lang="ts">
    import type { ModelPreset, PageFoldMode } from 'src/ts/preset/types';
    import { language } from 'src/lang';
    import ShSwitch from 'src/lib/UI/GUI/ShSwitch.svelte';
    import SelectInput from 'src/lib/UI/GUI/SelectInput.svelte';
    import OptionInput from 'src/lib/UI/GUI/OptionInput.svelte';

    interface Props { preset: ModelPreset }
    let { preset }: Props = $props();

    const mode = $derived(preset.pageFold?.mode ?? '');
    const enabled = $derived(preset.pageFold?.enabled === true);
    const modeReady = $derived(mode === 'maximum' || mode === 'balanced');

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
            onCheckedChange={setEnabled}
        />
    </div>

    <div class="flex flex-col gap-1">
        <span id="pagefold-mode-label" class="text-sm text-textcolor">{language.pageFoldMode}</span>
        <SelectInput
            value={mode}
            onchange={(event) => setMode(event.currentTarget.value)}
            ariaLabelledby="pagefold-mode-label"
        >
            <OptionInput value="">{language.pageFoldModeRequired}</OptionInput>
            <OptionInput value="maximum">{language.pageFoldModeMaximum}</OptionInput>
            <OptionInput value="balanced">{language.pageFoldModeBalanced}</OptionInput>
        </SelectInput>
    </div>
</section>
