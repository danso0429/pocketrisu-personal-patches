<script lang="ts">
    import { language } from 'src/lang'
    import { fetchUsageEntries, type UsageReport, type UsageQuery } from 'src/ts/requestLog'
    import { estimateCost, summarizeCosts, parseCostContext, formatUsd, formatCacheRatio, formatUsageTime,
        PRICE_CHECKED_AT, type UsageCostEntry, type CostPage } from 'src/ts/usage/usagePricing'

    let { report, query }: { report: UsageReport, query: UsageQuery } = $props()
    let entries = $state<UsageCostEntry[]>([])
    let cursor = $state<CostPage['nextCursor']>(null)
    let loading = $state(false)
    let failed = $state(false)
    let generation = 0
    const period = $derived(summarizeCosts(report.costBuckets ?? []))
    const cumulative = $derived(summarizeCosts(report.cumulativeCostBuckets ?? []))
    const available = $derived(report.costVersion === 1)
    const number = (n: number) => n.toLocaleString()
    const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 })
    const recorded = (n: number, reported: boolean | undefined, legacy: boolean) => (reported || (legacy && n > 0)) ? number(n) : '—'
    const modelCosts = $derived.by(() => {
        const map = new Map<string, NonNullable<UsageReport['costBuckets']>>()
        for (const row of report.costBuckets ?? []) {
            const key = JSON.stringify([row.model, row.provider])
            if (!map.has(key)) map.set(key, [])
            map.get(key)!.push(row)
        }
        return new Map([...map].map(([key, rows]) => [key, summarizeCosts(rows)]))
    })

    async function loadEntries(q: UsageQuery, after: CostPage['nextCursor'], gen: number) {
        loading = true
        failed = false
        try {
            const page = await fetchUsageEntries(q, after)
            if (gen !== generation) return
            if (!page) throw new Error('usage unavailable')
            entries = after ? [...entries, ...page.entries] : page.entries
            cursor = page.nextCursor
        } catch {
            if (gen === generation) failed = true
        } finally {
            if (gen === generation) loading = false
        }
    }

    $effect(() => {
        const snapshot = report
        const q = query
        const gen = ++generation
        entries = []; cursor = null; failed = false
        if (snapshot.costVersion === 1) void loadEntries(q, null, gen)
        else loading = false
        return () => { generation++ }
    })
</script>

<section class="mb-4 w-full text-left text-textcolor" aria-label={language.usageCostTitle}>
    <h3 class="text-textcolor font-semibold mb-2">{language.usageCostTitle}</h3>
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
        <div class="border border-darkborderc rounded-md p-3 min-w-0">
            <div class="text-xs text-textcolor2">{language.usageCostPeriod}</div>
            <div class="text-xl tabular-nums">{formatUsd(available ? period.cost : null)}</div>
            <div class="text-xs text-textcolor2">{language.usageCostUnknown} {number(period.unknown)}</div>
            {#if period.unpriced}<div class="text-xs text-textcolor2">{language.usageCostUnpriced} {number(period.unpriced)}</div>{/if}
            {#if period.legacy}<div class="text-xs text-textcolor2">{language.usageCostLegacy} {number(period.legacy)}</div>{/if}
            {#if period.incomplete}<div class="text-xs text-textcolor2">{language.usageCostIncomplete} {number(period.incomplete)}</div>{/if}
            {#if period.failedUnreported}<div class="text-xs text-textcolor2">{language.usageCostFailedNoUsage} {number(period.failedUnreported)}</div>{/if}
        </div>
        <div class="border border-darkborderc rounded-md p-3 min-w-0">
            <div class="text-xs text-textcolor2">{language.usageCostCumulative}</div>
            <div class="text-xl tabular-nums">{formatUsd(available ? cumulative.cost : null)}</div>
            <div class="text-xs text-textcolor2">{language.usageCostUnknown} {number(cumulative.unknown)}</div>
            {#if cumulative.unpriced}<div class="text-xs text-textcolor2">{language.usageCostUnpriced} {number(cumulative.unpriced)}</div>{/if}
            {#if cumulative.legacy}<div class="text-xs text-textcolor2">{language.usageCostLegacy} {number(cumulative.legacy)}</div>{/if}
            {#if cumulative.incomplete}<div class="text-xs text-textcolor2">{language.usageCostIncomplete} {number(cumulative.incomplete)}</div>{/if}
            {#if cumulative.failedUnreported}<div class="text-xs text-textcolor2">{language.usageCostFailedNoUsage} {number(cumulative.failedUnreported)}</div>{/if}
        </div>
        <div class="border border-darkborderc rounded-md p-3 min-w-0">
            <div class="text-xs text-textcolor2">{language.usageCacheSavings}</div>
            <div class="text-xl tabular-nums">{formatUsd(available ? period.saved : null)}</div>
            <div class="text-xs text-textcolor2">{language.usageCostPricedOnly}</div>
        </div>
        <div class="border border-darkborderc rounded-md p-3 min-w-0">
            <div class="text-xs text-textcolor2">{language.usageCacheRatio}</div>
            <div class="text-xl tabular-nums">{formatCacheRatio(period.input, period.cached)}</div>
            <div class="text-xs text-textcolor2">{number(period.cached)} {language.usageCachedTokens} · {language.usageCostPricedOnly}</div>
        </div>
    </div>
    <p class="text-xs text-textcolor2 mb-2">{language.usageCostBasis} · {PRICE_CHECKED_AT}</p>
    <p class="text-xs text-textcolor2 mb-3">{language.usageCostCoverage}</p>
    {#if period.assumed || cumulative.assumed}<p class="text-xs text-textcolor2 mb-2">{language.usageCostTierAssumed}</p>{/if}
    {#if period.promotional || cumulative.promotional}<p class="text-xs text-textcolor2 mb-2">{language.usageCostPromotion}</p>{/if}
    {#if !available}<p role="status">{language.usageCostUnavailable}</p>{/if}

    <h4 class="font-semibold text-sm mb-2">{language.usageByModel}</h4>
    <div class="grid grid-cols-[minmax(0,1fr)_2rem_3.5rem_5.3rem_3.6rem] gap-1 px-2 text-[11px] text-textcolor2 mb-1" aria-hidden="true">
        <span>{language.usageCostModelFilter}</span><span class="text-right truncate" title={language.usageRequests}>{language.usageRequests}</span>
        <span class="text-right">{language.usageCostEstimateShort}</span>
        <span class="text-right">{language.usageCostCacheShort}</span><span class="text-right">{language.usageCostSavedShort}</span>
    </div>
    <div class="border border-darkborderc rounded-md overflow-hidden mb-4" data-usage-models>
        {#each report.byModel as row (JSON.stringify([row.model, row.provider]))}
            {@const value = modelCosts.get(JSON.stringify([row.model, row.provider]))}
            <article class="border-b border-darkborderc last:border-0 min-w-0">
                <details>
                    <summary class="grid grid-cols-[minmax(0,1fr)_2rem_3.5rem_5.3rem_3.6rem] gap-1 px-2 py-1.5 text-[11px] leading-4 whitespace-nowrap tabular-nums cursor-pointer list-none [&::-webkit-details-marker]:hidden"
                        aria-label={`${row.model ?? '—'} ${row.provider ?? ''} · ${language.usageRequests} ${number(row.requests)} · ${language.usageEstimatedCost} ${formatUsd(value?.cost ?? null)} · ${language.usageCachedTokens} ${number(row.cachedTokens)} · ${formatCacheRatio(row.inputTokens, row.cachedTokens)} · ${language.usageCacheSavings} ${formatUsd(value?.saved ?? null)}${value?.assumed ? ` · ${language.usageCostTierAssumed}` : ''}`}>
                        <span class="truncate min-w-0" title={`${row.model ?? '—'} ${row.provider ?? ''}`}>{row.model ?? '—'}</span>
                        <span class="text-right truncate" title={number(row.requests)}>{compact.format(row.requests)}</span>
                        <span class="text-right truncate" title={formatUsd(value?.cost ?? null)}>{value?.assumed ? '≈' : ''}{formatUsd(value?.cost ?? null)}</span>
                        <span class="text-right truncate" title={`${number(row.cachedTokens)} · ${formatCacheRatio(row.inputTokens, row.cachedTokens)}`}>{compact.format(row.cachedTokens)}·{formatCacheRatio(row.inputTokens, row.cachedTokens)}</span>
                        <span class="text-right truncate" title={formatUsd(value?.saved ?? null)}>{formatUsd(value?.saved ?? null)}</span>
                    </summary>
                    <div class="px-2 pb-2 text-xs text-textcolor2 whitespace-normal">
                    <div class="font-mono break-all">{row.model ?? '—'} {row.provider ? `(${row.provider})` : ''}</div>
                    <div>{language.usageEstimatedCost} {formatUsd(value?.cost ?? null)}</div>
                    <div class="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                    <span>{language.usageRequests} {number(row.requests)}</span>
                    <span>{language.usageInputTokens} {number(row.inputTokens)}</span>
                    <span>{language.usageOutputTokens} {number(row.outputTokens)}</span>
                    <span>{language.usageCachedTokens} {number(row.cachedTokens)} · {formatCacheRatio(row.inputTokens, row.cachedTokens)}</span>
                    <span>{language.usageReasoningTokens} {number(row.reasoningTokens)}</span>
                    <span>{language.usageCacheSavings} {formatUsd(value?.saved ?? null)}</span>
                </div>
                {#if value?.unknown}<div class="text-xs text-textcolor2 mt-1">{language.usageCostUnknown} {number(value.unknown)}</div>{/if}
                {#if value?.unpriced}<div class="text-xs text-textcolor2">{language.usageCostUnpriced} {number(value.unpriced)}</div>{/if}
                {#if value?.legacy}<div class="text-xs text-textcolor2">{language.usageCostLegacy} {number(value.legacy)}</div>{/if}
                {#if value?.incomplete}<div class="text-xs text-textcolor2">{language.usageCostIncomplete} {number(value.incomplete)}</div>{/if}
                {#if value?.failedUnreported}<div class="text-xs text-textcolor2">{language.usageCostFailedNoUsage} {number(value.failedUnreported)}</div>{/if}
                {#if value?.assumed}<div class="text-xs text-textcolor2">{language.usageCostTierAssumed}</div>{/if}
                    <div>{language.usageAvgDuration} {row.avgDurationMs === null ? '—' : `${number(row.avgDurationMs)}ms`}</div>
                    <div>{language.usageCostRecordedTokens}</div>
                    </div>
                </details>
            </article>
        {/each}
    </div>

    <h4 class="font-semibold text-sm mb-2">{language.usageCostRequests}</h4>
    <p class="text-xs text-textcolor2 mb-2">{language.usageCostAttemptBasis}</p>
    <div class="grid grid-cols-[2.8rem_minmax(0,1fr)_3.5rem_4.6rem_3.6rem] gap-1 px-2 text-[11px] text-textcolor2 mb-1" aria-hidden="true">
        <span>{language.usageCostTime}</span><span>{language.usageCostModelFilter}</span>
        <span class="text-right">{language.usageCostEstimateShort}</span>
        <span class="text-right">{language.usageCostCacheShort}</span><span class="text-right">{language.usageCostSavedShort}</span>
    </div>
    <div class="border border-darkborderc rounded-md overflow-hidden">
        {#each entries as row (row.id)}
            {@const value = estimateCost(row)}
            {@const context = parseCostContext(row.context)}
            {@const recordedTime = formatUsageTime(row.timestamp)}
            {@const state = context?.aborted ? language.usageCostAborted : row.success ? language.usageCostSuccess : language.usageCostFailed}
            {@const ratio = context?.valid || (!context && row.cachedTokens > 0) ? formatCacheRatio(row.inputTokens, row.cachedTokens) : '—'}
            <article class="border-b border-darkborderc last:border-0 min-w-0">
                <details>
                    <summary class="grid grid-cols-[2.8rem_minmax(0,1fr)_3.5rem_4.6rem_3.6rem] gap-1 px-2 py-1.5 text-[11px] leading-4 whitespace-nowrap tabular-nums cursor-pointer list-none [&::-webkit-details-marker]:hidden"
                        aria-label={`${recordedTime.full} · ${row.model ?? '—'} · ${state} · ${language.usageEstimatedCost} ${formatUsd(value.cost)} · ${language.usageCachedTokens} ${recorded(row.cachedTokens, context?.inputReported, !context)} · ${ratio}`}>
                        <span class="text-textcolor2" title={state}>
                            <span aria-hidden="true">{context?.aborted ? '■' : row.success ? '✓' : '!'}</span><time datetime={recordedTime.iso} title={recordedTime.full}>{recordedTime.short}</time>
                        </span>
                        <span class="truncate min-w-0" title={`${row.model ?? '—'} ${row.provider ?? ''}`}>{row.model ?? '—'}</span>
                        <span class="text-right truncate" title={formatUsd(value.cost)}>{value.assumed ? '≈' : ''}{formatUsd(value.cost)}</span>
                        <span class="text-right truncate" title={`${language.usageCachedTokens} ${recorded(row.cachedTokens, context?.inputReported, !context)} · ${ratio}`}>{context?.inputReported || (!context && row.cachedTokens > 0) ? compact.format(row.cachedTokens) : '—'}·{ratio}</span>
                        <span class="text-right truncate" title={`${language.usageCacheSavings} ${formatUsd(value.saved)}`}>{formatUsd(value.saved)}</span>
                    </summary>
                    <div class="px-2 pb-2 text-xs text-textcolor2 whitespace-normal">
                        <div class="font-mono break-all">{row.model ?? '—'} {row.provider ? `(${row.provider})` : ''} · {state}</div>
                        <div>{recordedTime.full} · {row.source} · #{row.id}</div>
                        <div>{language.usageInputTokens} {recorded(row.inputTokens, context?.inputReported, !context)} · {language.usageOutputTokens} {recorded(row.outputTokens, context?.outputReported, !context)}</div>
                        <div>{language.usageCachedTokens} {recorded(row.cachedTokens, context?.inputReported, !context)} · {ratio} · {language.usageReasoningTokens} {context?.accounting || row.reasoningTokens > 0 ? number(row.reasoningTokens) : '—'}</div>
                        <div>{value.cost === null ? language.usageCostUnknown : language.usageEstimatedCost} {formatUsd(value.cost)} · {language.usageCacheSavings} {formatUsd(value.saved)}</div>
                        {#if value.assumed}<div>{language.usageCostTierAssumed}</div>{/if}
                        {#if value.reason === 'failed'}<div>{language.usageCostFailedNoUsage}</div>{/if}
                        {#if value.reason === 'price'}<div>{language.usageCostUnpriced}</div>{/if}
                        {#if value.reason === 'legacy'}<div>{language.usageCostLegacy}</div>{/if}
                        {#if value.reason === 'usage'}<div>{language.usageCostIncomplete}</div>{/if}
                        <div>{context?.product ?? '—'} · {context?.region ?? '—'} · {context?.tier ?? '—'} · {context?.priceDay ?? '—'} UTC</div>
                        {#if value.promotional}<div>{language.usageCostPromotion}</div>{/if}
                    </div>
                </details>
            </article>
        {/each}
    </div>
    {#if loading}<p class="text-xs text-textcolor2 mt-2" role="status">{language.usageCostLoading}</p>{/if}
    {#if failed}<p class="text-xs mt-2" role="alert">{language.usageFailedLoad}</p>{/if}
    {#if available && !loading && (cursor || failed)}
        <button class="border border-darkborderc rounded px-3 py-2 mt-2 text-sm" onclick={() => { if (!loading) void loadEntries(query, cursor, generation) }}>{failed ? language.requestLogsRefresh : language.usageCostMore}</button>
    {/if}
    {#if available && !loading && !failed && entries.length === 0}<p class="text-xs text-textcolor2">{language.usageCostEmpty}</p>{/if}
</section>
