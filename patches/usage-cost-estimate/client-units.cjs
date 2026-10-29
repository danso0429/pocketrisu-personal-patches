'use strict';

// Exact PocketRisu 1.16.1 anchors; files remain managed by the complete graph.
module.exports = [
    {
        "id": "usage-cost-estimate:gemini-usage:1.10",
        "file": "src/ts/preset/adapter/googleGemini.ts",
        "type": "replace",
        "anchor": "function parseGeminiUsage(raw: unknown): AdapterUsage | undefined {\n    if (!isPlainObject(raw)) return undefined\n    const usage: AdapterUsage = {}\n    if (typeof raw['promptTokenCount'] === 'number') {\n        usage.promptTokens = raw['promptTokenCount'] as number\n    }\n    if (typeof raw['candidatesTokenCount'] === 'number') {\n        usage.completionTokens = raw['candidatesTokenCount'] as number\n    }\n    if (typeof raw['totalTokenCount'] === 'number') {\n        usage.totalTokens = raw['totalTokenCount'] as number\n    }\n    if (typeof raw['cachedContentTokenCount'] === 'number') {\n        usage.cachedTokens = raw['cachedContentTokenCount'] as number\n    }\n    if (\n        usage.promptTokens === undefined\n        && usage.completionTokens === undefined\n        && usage.totalTokens === undefined\n        && usage.cachedTokens === undefined\n    ) {\n        return undefined\n    }\n    return usage\n}\n",
        "content": "function parseGeminiUsage(raw: unknown): AdapterUsage | undefined {\n    if (!isPlainObject(raw)) return undefined\n    const usage: AdapterUsage = {}\n    if (typeof raw['promptTokenCount'] === 'number') {\n        usage.promptTokens = raw['promptTokenCount'] as number\n    }\n    if (typeof raw['candidatesTokenCount'] === 'number') {\n        usage.completionTokens = raw['candidatesTokenCount'] as number\n    }\n    if (typeof raw['totalTokenCount'] === 'number') {\n        usage.totalTokens = raw['totalTokenCount'] as number\n    }\n    if (typeof raw['cachedContentTokenCount'] === 'number') {\n        usage.cachedTokens = raw['cachedContentTokenCount'] as number\n    }\n    if (typeof raw['thoughtsTokenCount'] === 'number') {\n        usage.reasoningTokens = raw['thoughtsTokenCount'] as number\n        usage.completionTokens = (usage.completionTokens ?? 0) + usage.reasoningTokens\n    }\n    if (typeof raw['trafficType'] === 'string' && raw['trafficType'].trim()) usage.trafficType = raw['trafficType'].trim()\n    if (typeof raw['serviceTier'] === 'string' && raw['serviceTier'].trim()) usage.serviceTier = raw['serviceTier'].trim()\n    if (\n        usage.promptTokens === undefined\n        && usage.completionTokens === undefined\n        && usage.totalTokens === undefined\n        && usage.cachedTokens === undefined\n        && usage.reasoningTokens === undefined\n    ) {\n        return undefined\n    }\n    const extraToolTokens = typeof raw['toolUsePromptTokenCount'] === 'number' && raw['toolUsePromptTokenCount'] !== 0\n    const inconsistentTotal = usage.totalTokens !== undefined && usage.promptTokens !== undefined\n        && usage.completionTokens !== undefined && usage.totalTokens !== usage.promptTokens + usage.completionTokens\n    usage.usageAccountingVersion = extraToolTokens || inconsistentTotal ? 0 : 1\n    return usage\n}\n"
    },
    {
        "id": "usage-cost-estimate:adapter-usage-fields:1.10",
        "file": "src/ts/preset/adapter/types.ts",
        "type": "replace",
        "anchor": "export interface AdapterUsage {\n",
        "content": "export interface AdapterUsage {\n    trafficType?: string\n    serviceTier?: string\n    usageAccountingVersion?: number\n"
    },
    {
        "id": "usage-cost-estimate:log-usage-fields:1.10",
        "file": "src/ts/requestLog.ts",
        "type": "replace",
        "anchor": "export interface RequestLogUsage {\n",
        "content": "export interface RequestLogUsage {\n    trafficType?: string\n    serviceTier?: string\n    usageAccountingVersion?: number\n"
    },
    {
        "id": "usage-cost-estimate:log-entry-fields:1.10",
        "file": "src/ts/requestLog.ts",
        "type": "replace",
        "anchor": "interface PendingEntry {\n",
        "content": "interface PendingEntry {\n    trafficType?: string\n    serviceTier?: string\n    usageAccountingVersion?: number\n    pricingTimestamp?: number\n"
    },
    {
        "id": "usage-cost-estimate:log-scope-usage:1.10",
        "file": "src/ts/requestLog.ts",
        "type": "replace",
        "anchor": "            last.reasoningTokens = usage.reasoningTokens\n",
        "content": "            last.reasoningTokens = usage.reasoningTokens\n            last.trafficType = usage.trafficType\n            last.serviceTier = usage.serviceTier\n            last.usageAccountingVersion = usage.usageAccountingVersion\n"
    },
    {
        "id": "usage-cost-estimate:request-usage:1.10",
        "file": "src/ts/process/request/request.ts",
        "type": "replace",
        "anchor": "        reasoningTokens: usage.reasoningTokens,\n",
        "content": "        reasoningTokens: usage.reasoningTokens,\n        trafficType: usage.trafficType,\n        serviceTier: usage.serviceTier,\n        usageAccountingVersion: usage.usageAccountingVersion,\n"
    },
    {
        "id": "usage-cost-estimate:recovery-usage:1.10",
        "file": "src/ts/process/request/jobRecovery.ts",
        "type": "replace",
        "anchor": "        reasoningTokens: result.ok === true ? result.usage?.reasoningTokens : undefined,\n",
        "content": "        reasoningTokens: result.ok === true ? result.usage?.reasoningTokens : undefined,\n        pricingTimestamp: job.createdAt,\n        trafficType: result.ok === true ? result.usage?.trafficType : undefined,\n        serviceTier: result.ok === true ? result.usage?.serviceTier : undefined,\n        usageAccountingVersion: result.ok === true ? result.usage?.usageAccountingVersion : undefined,\n"
    },
    {
        "id": "usage-cost-estimate:native-usage-assert-0:1.10",
        "file": "src/ts/preset/adapter/googleGemini.test.ts",
        "type": "replace",
        "anchor": "{ promptTokens: 10, completionTokens: 2, totalTokens: 12 }",
        "content": "{ promptTokens: 10, completionTokens: 2, totalTokens: 12, usageAccountingVersion: 1 }"
    },
    {
        "id": "usage-cost-estimate:native-usage-assert-1:1.10",
        "file": "src/ts/preset/adapter/googleGemini.test.ts",
        "type": "replace",
        "anchor": "{ promptTokens: 3, completionTokens: 1, totalTokens: 4 }",
        "content": "{ promptTokens: 3, completionTokens: 1, totalTokens: 4, usageAccountingVersion: 1 }"
    },
    {
        "id": "usage-cost-estimate:native-usage-assert-2:1.10",
        "file": "src/ts/preset/adapter/googleGemini.test.ts",
        "type": "replace",
        "anchor": "{ promptTokens: 10, completionTokens: 2, totalTokens: 12, cachedTokens: 7 }",
        "content": "{ promptTokens: 10, completionTokens: 2, totalTokens: 12, cachedTokens: 7, usageAccountingVersion: 1 }"
    },
];
