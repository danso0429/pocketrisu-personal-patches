'use strict';

// Exact PocketRisu 1.10 anchors; files remain managed by the complete graph.
module.exports = [
    {
        "id": "usage-cost-estimate:cost-client-types-import:1.10",
        "file": "src/ts/requestLog.ts",
        "type": "replace",
        "anchor": "export type RequestLogCategory =",
        "content": "import type { CostBucket, CostPage } from './usage/usagePricing'\n\nexport type RequestLogCategory =",
        "targetVersions": {
            "pocketrisu": [
                "1.10.0"
            ]
        }
    },
    {
        "id": "usage-cost-estimate:cost-report-fields:1.10",
        "file": "src/ts/requestLog.ts",
        "type": "replace",
        "anchor": "export interface UsageReport {\n",
        "content": "export interface UsageReport {\n    costVersion?: number\n    costBuckets?: CostBucket[]\n    cumulativeCostBuckets?: CostBucket[]\n",
        "targetVersions": {
            "pocketrisu": [
                "1.10.0"
            ]
        }
    },
    {
        "id": "usage-cost-estimate:entries-client:1.10",
        "file": "src/ts/requestLog.ts",
        "type": "replace",
        "anchor": "export interface RequestLogStorageStats {",
        "content": "export async function fetchUsageEntries(query: UsageQuery = {}, cursor?: CostPage['nextCursor']): Promise<CostPage | null> {\n    const params = new URLSearchParams()\n    if (query.categories?.length) params.set('categories', query.categories.join(','))\n    if (query.sources?.length) params.set('sources', query.sources.join(','))\n    if (query.models?.length) params.set('models', query.models.join(','))\n    if (query.since !== undefined) params.set('since', String(query.since))\n    if (query.until !== undefined) params.set('until', String(query.until))\n    if (query.successOnly) params.set('success', '1')\n    if (cursor) { params.set('before_timestamp', String(cursor.timestamp)); params.set('before_id', String(cursor.id)) }\n    params.set('limit', '50')\n    try {\n        const res = await fetch(`/api/request-logs/usage/entries?${params}`, { headers: await authHeaders() })\n        if (!res.ok) return null\n        const result = await res.json()\n        return result.costVersion === 1 && Array.isArray(result.entries) ? result as CostPage : null\n    } catch { return null }\n}\n\nexport interface RequestLogStorageStats {",
        "targetVersions": {
            "pocketrisu": [
                "1.10.0"
            ]
        }
    },
    {
        "id": "usage-cost-estimate:panel-import:1.10",
        "file": "src/lib/Setting/Pages/UsageStats.svelte",
        "type": "replace",
        "anchor": "    import ShButton from 'src/lib/UI/GUI/ShButton.svelte'\n",
        "content": "    import UsageCostPanel from './UsageCostPanel.svelte'\n    import ShButton from 'src/lib/UI/GUI/ShButton.svelte'\n",
        "targetVersions": {
            "pocketrisu": [
                "1.10.0"
            ]
        }
    },
    {
        "id": "usage-cost-estimate:query-type:1.10",
        "file": "src/lib/Setting/Pages/UsageStats.svelte",
        "type": "replace",
        "anchor": "        type UsageReport, type RequestLogSource,\n",
        "content": "        type UsageReport, type RequestLogSource, type UsageQuery,\n",
        "targetVersions": {
            "pocketrisu": [
                "1.10.0"
            ]
        }
    },
    {
        "id": "usage-cost-estimate:query-snapshot:1.10",
        "file": "src/lib/Setting/Pages/UsageStats.svelte",
        "type": "replace",
        "anchor": "    let report = $state<UsageReport | null>(null)\n",
        "content": "    let report = $state<UsageReport | null>(null)\n    let reportQuery = $state<UsageQuery>({})\n    let selectedModel = $state('')\n",
        "targetVersions": {
            "pocketrisu": [
                "1.10.0"
            ]
        }
    },
    {
        "id": "usage-cost-estimate:model-filter-count:1.10",
        "file": "src/lib/Setting/Pages/UsageStats.svelte",
        "type": "replace",
        "anchor": "    const activeFilterCount = $derived(selectedSources.size > 0 ? 1 : 0)",
        "content": "    const activeFilterCount = $derived((selectedSources.size > 0 ? 1 : 0) + (selectedModel ? 1 : 0))",
        "targetVersions": {
            "pocketrisu": [
                "1.10.0"
            ]
        }
    },
    {
        "id": "usage-cost-estimate:model-query:1.10",
        "file": "src/lib/Setting/Pages/UsageStats.svelte",
        "type": "replace",
        "anchor": "        sources: Array.from(selectedSources),\n",
        "content": "        sources: Array.from(selectedSources),\n        models: selectedModel ? [selectedModel] : undefined,\n",
        "targetVersions": {
            "pocketrisu": [
                "1.10.0"
            ]
        }
    },
    {
        "id": "usage-cost-estimate:adopt-query-snapshot:1.10",
        "file": "src/lib/Setting/Pages/UsageStats.svelte",
        "type": "replace",
        "anchor": "            report = data\n",
        "content": "            report = data\n            reportQuery = q\n",
        "targetVersions": {
            "pocketrisu": [
                "1.10.0"
            ]
        }
    },
    {
        "id": "usage-cost-estimate:model-filter:1.10",
        "file": "src/lib/Setting/Pages/UsageStats.svelte",
        "type": "replace",
        "anchor": "        <Collapsible.Content>\n",
        "managed": "        <Collapsible.Content>\n            <label class=\"flex flex-wrap gap-2 text-sm my-2\">\n                {language.usageCostModelFilter}\n                <select class=\"bg-darkbg border border-darkborderc rounded px-2 py-1 max-w-full\" bind:value={selectedModel}>\n                    <option value=\"\">{language.usageCostAllModels}</option>\n                    {#each Array.from(new Set([...(report?.dimensions.models ?? []), ...(selectedModel ? [selectedModel] : [])])) as model}\n                        <option value={model}>{model}</option>\n                    {/each}\n                </select>\n            </label>\n",
        "targetVersions": {
            "pocketrisu": [
                "1.10.0"
            ]
        }
    },
    {
        "id": "usage-cost-estimate:cost-model-panel:1.10",
        "file": "src/lib/Setting/Pages/UsageStats.svelte",
        "type": "replace",
        "anchor": "    <!-- Per-model breakdown -->\n    {#if report.byModel.length > 0}\n        <div class=\"border border-darkborderc rounded-md bg-darkbg/30 mb-4 overflow-hidden\">\n            <div class=\"px-3 py-2 border-b border-darkborderc/50 text-textcolor text-sm font-semibold\">\n                {language.usageByModel}\n            </div>\n            <div class=\"overflow-x-auto\">\n                <table class=\"w-full text-xs\">\n                    <thead class=\"text-textcolor2\">\n                        <tr class=\"border-b border-darkborderc/50\">\n                            <th class=\"text-left font-normal px-3 py-2\">{language.usageModel}</th>\n                            <th class=\"text-right font-normal px-3 py-2\">{language.usageRequests}</th>\n                            <th class=\"text-right font-normal px-3 py-2\">{language.usageInputTokens}</th>\n                            <th class=\"text-right font-normal px-3 py-2\">{language.usageOutputTokens}</th>\n                            <th class=\"text-right font-normal px-3 py-2 hidden sm:table-cell\">{language.usageCachedTokens}</th>\n                            <th class=\"text-right font-normal px-3 py-2 hidden md:table-cell\">{language.usageAvgDuration}</th>\n                        </tr>\n                    </thead>\n                    <tbody class=\"text-textcolor\">\n                        {#each report.byModel as row (`${row.model}-${row.provider}`)}\n                            <tr class=\"border-b border-darkborderc/30 last:border-0\">\n                                <td class=\"px-3 py-2 font-mono\">\n                                    {row.model ?? '—'}\n                                    {#if row.provider}\n                                        <span class=\"text-textcolor2 ml-1\">({row.provider})</span>\n                                    {/if}\n                                </td>\n                                <td class=\"px-3 py-2 text-right tabular-nums\">{formatTokens(row.requests)}</td>\n                                <td class=\"px-3 py-2 text-right tabular-nums\">{formatTokens(row.inputTokens)}</td>\n                                <td class=\"px-3 py-2 text-right tabular-nums\">{formatTokens(row.outputTokens)}</td>\n                                <td class=\"px-3 py-2 text-right tabular-nums hidden sm:table-cell\">{formatTokens(row.cachedTokens)}</td>\n                                <td class=\"px-3 py-2 text-right tabular-nums hidden md:table-cell\">{formatDuration(row.avgDurationMs)}</td>\n                            </tr>\n                        {/each}\n                    </tbody>\n                </table>\n            </div>\n        </div>\n    {/if}\n\n",
        "managed": "    <UsageCostPanel {report} query={reportQuery} />\n\n",
        "targetVersions": {
            "pocketrisu": [
                "1.10.0"
            ]
        }
    },
    {
        "id": "usage-cost-estimate:cost-empty-period:1.10",
        "file": "src/lib/Setting/Pages/UsageStats.svelte",
        "type": "replace",
        "anchor": "        <div class=\"text-textcolor2 text-sm\">{language.usageEmptyDesc}</div>\n",
        "managed": "        <div class=\"text-textcolor2 text-sm\">{language.usageEmptyDesc}</div>\n        <UsageCostPanel {report} query={reportQuery} />\n",
        "targetVersions": {
            "pocketrisu": [
                "1.10.0"
            ]
        }
    },
    {
        "id": "usage-cost-estimate:strings-ko:1.10",
        "file": "src/lang/ko.ts",
        "type": "replace",
        "anchor": "  usageCachedTokens: \"캐시 토큰\",\n",
        "content": "  usageCachedTokens: \"캐시 토큰\",\n    usageCostTitle: \"사용 비용과 캐시\",\n    usageCostTime: \"일시\",\n    usageCostModelMissing: \"모델 미기록\",\n    usageCostProviderMissing: \"제공자 미기록\",\n    usageCostModelMissingHint: \"요청 당시 모델 정보가 기록되지 않아 비용을 계산할 수 없습니다.\",\n    usageCostEstimateShort: \"추정 비용\",\n    usageCostCacheShort: \"캐시\",\n    usageCostSavedShort: \"절약\",\n    usageCostPeriod: \"선택 기간 추정 비용\",\n    usageCostCumulative: \"누적 추정 비용 · 현재 필터\",\n    usageCostUnknown: \"미확인\",\n    usageCostUnpriced: \"단가 미등록\",\n    usageCostLegacy: \"이전 기록 · 비용 근거 미확인\",\n    usageCostIncomplete: \"사용량 미확인\",\n    usageCostFailedNoUsage: \"실패 · 사용량 미보고\",\n    usageCacheSavings: \"캐시 절약액 · 기간\",\n    usageCostPricedOnly: \"계산 가능한 사용량 기준\",\n    usageCacheRatio: \"캐시 토큰 비율\",\n    usageReasoningTokens: \"추론 토큰\",\n    usageEstimatedCost: \"추정 비용\",\n    usageCostBasis: \"USD · 공개 요율로 계산한 추정액 · 단가 확인\",\n    usageCostCoverage: \"현재 Argon 공식 경로 지원. 과거·미보고·미등록 금액은 제외됩니다. 기록 누락·중복 복구 가능성이 있어 청구서 금액과 다를 수 있습니다.\",\n    usageCostTierAssumed: \"티어 미보고: Standard로 추정한 금액 포함\",\n    usageCostPromotion: \"Vertex 공개 프로모션 요율 기준 · 실제 크레딧 적용 미확인\",\n    usageCostUnavailable: \"이 서버에서는 상세 비용 정보를 제공하지 않습니다.\",\n    usageCostDetails: \"상세\",\n    usageCostRecordedTokens: \"토큰은 기록 전체, 비용·절약액은 계산 가능한 분량 기준입니다. 캐시 보관료 등은 포함하지 않습니다.\",\n    usageCostRequests: \"개별 요청 비용\",\n    usageCostAttemptBasis: \"시도별 한 줄 · 행을 누르면 상세 · 재시도는 별도 행\",\n    usageCostAborted: \"중지\",\n    usageCostSuccess: \"성공\",\n    usageCostFailed: \"실패\",\n    usageCostLoading: \"요청 내역을 불러오는 중\",\n    usageCostMore: \"더 보기\",\n    usageCostEmpty: \"해당 기간의 요청 내역이 없습니다.\",\n    usageCostModelFilter: \"모델\",\n    usageCostAllModels: \"모든 모델\",\n",
        "targetVersions": {
            "pocketrisu": [
                "1.10.0"
            ]
        }
    },
    {
        "id": "usage-cost-estimate:strings-en:1.10",
        "file": "src/lang/en.ts",
        "type": "replace",
        "anchor": "    usageCachedTokens: \"Cached tokens\",\n",
        "content": "    usageCachedTokens: \"Cached tokens\",\n    usageCostTitle: \"Cost and cache\",\n    usageCostTime: \"Date/time\",\n    usageCostModelMissing: \"Model not recorded\",\n    usageCostProviderMissing: \"Provider not recorded\",\n    usageCostModelMissingHint: \"The model was not recorded for this request, so its cost cannot be calculated.\",\n    usageCostEstimateShort: \"Estimate\",\n    usageCostCacheShort: \"Cache\",\n    usageCostSavedShort: \"Saved\",\n    usageCostPeriod: \"Period estimate\",\n    usageCostCumulative: \"Cumulative estimate · current filters\",\n    usageCostUnknown: \"Unknown\",\n    usageCostUnpriced: \"Price unavailable\",\n    usageCostLegacy: \"Legacy record · cost basis unknown\",\n    usageCostIncomplete: \"Usage incomplete\",\n    usageCostFailedNoUsage: \"Failed · usage unreported\",\n    usageCacheSavings: \"Cache savings · period\",\n    usageCostPricedOnly: \"Priced usage only\",\n    usageCacheRatio: \"Cached token ratio\",\n    usageReasoningTokens: \"Reasoning tokens\",\n    usageEstimatedCost: \"Estimated cost\",\n    usageCostBasis: \"USD · estimated from public rates · prices checked\",\n    usageCostCoverage: \"Official Argon routes supported. Legacy, unreported and unpriced amounts are excluded. Missing or repeated recovery logs can differ from bills.\",\n    usageCostTierAssumed: \"Includes Standard assumptions for unreported tiers\",\n    usageCostPromotion: \"Vertex public promotional rates · actual credits unverified\",\n    usageCostUnavailable: \"Detailed cost data is unavailable on this server.\",\n    usageCostDetails: \"Details\",\n    usageCostRecordedTokens: \"Tokens cover recorded usage; costs and savings cover priced usage only. Cache storage and other charges are excluded.\",\n    usageCostRequests: \"Individual request costs\",\n    usageCostAttemptBasis: \"One line per attempt · tap for details · retries are separate\",\n    usageCostAborted: \"Aborted\",\n    usageCostSuccess: \"Success\",\n    usageCostFailed: \"Failed\",\n    usageCostLoading: \"Loading request costs\",\n    usageCostMore: \"Load more\",\n    usageCostEmpty: \"No requests in this period.\",\n    usageCostModelFilter: \"Model\",\n    usageCostAllModels: \"All models\",\n",
        "targetVersions": {
            "pocketrisu": [
                "1.10.0"
            ]
        }
    }
];
