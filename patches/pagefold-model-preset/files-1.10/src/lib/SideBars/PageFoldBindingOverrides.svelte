<script lang="ts">
    import type { ModelBindingSet, PageFoldRoleOverride, ResolvedTask } from 'src/ts/preset/types';
    import { DBState } from 'src/ts/stores.svelte';
    import { language } from 'src/lang';
    import { normalizePageFoldRoleOverride, resolvePageFoldState } from 'src/ts/pagefold/resolve';
    import ShAccordion from 'src/lib/UI/GUI/ShAccordion.svelte';
    import SelectInput from 'src/lib/UI/GUI/SelectInput.svelte';
    import OptionInput from 'src/lib/UI/GUI/OptionInput.svelte';

    interface Props { binding: ModelBindingSet }
    let { binding }: Props = $props();

    const tasks: Array<{ task: ResolvedTask, label: string }> = $derived([
        { task: 'model', label: language.model },
        { task: 'submodel', label: language.submodel },
        { task: 'memory', label: language.axModelMemory },
        { task: 'translate', label: language.axModelTranslate },
        { task: 'emotion', label: language.axModelEmotion },
        { task: 'otherAx', label: language.axModelOther },
    ]);

    function override(task: ResolvedTask): PageFoldRoleOverride {
        return normalizePageFoldRoleOverride(binding.pageFold?.[task]);
    }

    function setOverride(task: ResolvedTask, value: string) {
        const normalized = normalizePageFoldRoleOverride(value);
        const next = { ...(binding.pageFold ?? {}) };
        if (normalized === 'inherit') delete next[task];
        else next[task] = normalized;
        binding.pageFold = Object.keys(next).length > 0 ? next : undefined;
    }

    function presetId(task: ResolvedTask): string | undefined {
        if (task === 'model') return binding.main;
        if (task === 'submodel') return binding.sub;
        if (binding.separateAux && binding.aux?.[task]) return binding.aux[task];
        return binding.sub;
    }

    function effective(task: ResolvedTask): 'on' | 'off' | 'blocked' {
        const preset = DBState.db.modelPresets?.find((item) => item.id === presetId(task));
        if (!preset) return 'blocked';
        const state = resolvePageFoldState({ preset, task, binding });
        return state.kind === 'on' ? 'on' : state.kind === 'off' ? 'off' : 'blocked';
    }

    function badge(value: 'on' | 'off' | 'blocked'): string {
        return value === 'on' ? language.pageFoldBadgeOn
            : value === 'off' ? language.pageFoldBadgeOff
            : language.pageFoldBadgeBlocked;
    }
</script>

<ShAccordion name={language.pageFoldRoleOverrides} variant="card" class="mt-2">
    <div class="flex flex-col gap-3 p-2">
        <p class="text-xs text-textcolor2">{language.pageFoldRoleOverridesHelp}</p>
        {#each tasks as item (item.task)}
            {@const state = effective(item.task)}
            <div class="flex items-center gap-2 min-h-10">
                <label id={`pagefold-role-${item.task}`} class="text-xs text-textcolor flex-1 min-w-0">
                    {item.label}
                </label>
                <span class="text-[10px] rounded px-1.5 py-0.5 {state === 'on' ? 'bg-success/20 text-success' : state === 'blocked' ? 'bg-draculared/20 text-red-400' : 'bg-darkbg text-textcolor2'}">
                    {badge(state)}
                </span>
                <div class="w-28 shrink-0">
                    <SelectInput
                        value={override(item.task)}
                        ariaLabelledby={`pagefold-role-${item.task}`}
                        onchange={(event) => setOverride(item.task, event.currentTarget.value)}
                    >
                        <OptionInput value="inherit">{language.pageFoldInherit}</OptionInput>
                        <OptionInput value="on">{language.pageFoldOn}</OptionInput>
                        <OptionInput value="off">{language.pageFoldOff}</OptionInput>
                    </SelectInput>
                </div>
            </div>
        {/each}
    </div>
</ShAccordion>
