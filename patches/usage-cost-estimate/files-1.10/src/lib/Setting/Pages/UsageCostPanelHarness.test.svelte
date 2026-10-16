<script lang="ts">
    import UsageCostPanel from './UsageCostPanel.svelte'
    import { untrack } from 'svelte'
    import type { UsageReport, UsageQuery } from 'src/ts/requestLog'
    let { initialReport, initialQuery }: { initialReport: UsageReport, initialQuery: UsageQuery } = $props()
    let report = $state(untrack(() => initialReport))
    let query = $state(untrack(() => initialQuery))
    export function update(nextReport: UsageReport, nextQuery: UsageQuery) { report = nextReport; query = nextQuery }
</script>
<UsageCostPanel {report} {query} />
