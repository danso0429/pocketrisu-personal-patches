'use strict';

// Exact PocketRisu 1.10 anchors; files remain managed by the complete graph.
module.exports = [
    {
        id: 'usage-cost-estimate:job-model-route:1.10',
        file: 'server/node/model-jobs.cjs', type: 'replace',
        anchor: '                adapterKind: req.body?.adapterKind,\n                kind: req.body?.kind,',
        content: '                adapterKind: req.body?.adapterKind,\n                model: req.body?.model,\n                kind: req.body?.kind,',
        targetVersions: { pocketrisu: ['1.10.0'] },
    },
    {
        id: 'usage-cost-estimate:job-model-test-input:1.10',
        file: 'server/node/model-jobs.test.ts', type: 'replace',
        anchor: "                adapterKind: 'openai',\n                streaming: true,",
        content: "                adapterKind: 'openai',\n                model: 'synthetic-model-for-log',\n                streaming: true,",
        targetVersions: { pocketrisu: ['1.10.0'] },
    },
    {
        id: 'usage-cost-estimate:job-model-test-readback:1.10',
        file: 'server/node/model-jobs.test.ts', type: 'replace',
        anchor: '        expect(meta.bytes).toBe(Buffer.byteLength(expected))',
        content: "        expect(meta.bytes).toBe(Buffer.byteLength(expected))\n        expect(meta.model).toBe('synthetic-model-for-log')",
        targetVersions: { pocketrisu: ['1.10.0'] },
    },
    {
        "id": "usage-cost-estimate:store-import:1.10",
        "file": "server/node/request-logs.cjs",
        "type": "replace",
        "anchor": "const fs = require('fs');\n",
        "content": "const fs = require('fs');\nconst { captureUsageCostContext, migrateUsageCosts, createUsageCostStore } = require('./usageCostStore.cjs');\n",
        "targetVersions": {
            "pocketrisu": [
                "1.10.0"
            ]
        }
    },
    {
        "id": "usage-cost-estimate:context-before-coercion:1.10",
        "file": "server/node/request-logs.cjs",
        "type": "replace",
        "anchor": "        timestamp,\n        category,\n",
        "content": "        costContext: captureUsageCostContext({ ...entry, timestamp }),\n        timestamp,\n        category,\n",
        "targetVersions": {
            "pocketrisu": [
                "1.10.0"
            ]
        }
    },
    {
        "id": "usage-cost-estimate:migration-before-statements:1.10",
        "file": "server/node/request-logs.cjs",
        "type": "replace",
        "anchor": "    const stmtInsertRequest = db.prepare(`\n",
        "content": "    migrateUsageCosts(db);\n    const usageCostStore = createUsageCostStore(db, buildUsageWhere, SUMS);\n\n    const stmtInsertRequest = db.prepare(`\n",
        "targetVersions": {
            "pocketrisu": [
                "1.10.0"
            ]
        }
    },
    {
        "id": "usage-cost-estimate:usage-insert-statement:1.10",
        "file": "server/node/request-logs.cjs",
        "type": "replace",
        "anchor": "    const stmtInsertUsage = db.prepare(`\n        INSERT INTO usage (\n            timestamp, day, category, source, model, provider, success, streaming, duration_ms,\n            input_tokens, output_tokens, cached_tokens, reasoning_tokens\n        ) VALUES (\n            @timestamp, @day, @category, @source, @model, @provider, @success, @streaming, @durationMs,\n            @inputTokens, @outputTokens, @cachedTokens, @reasoningTokens\n        )\n    `);\n\n",
        "content": "    const stmtInsertUsage = db.prepare(`\n        INSERT INTO usage (\n            timestamp, day, category, source, model, provider, success, streaming, duration_ms,\n            input_tokens, output_tokens, cached_tokens, reasoning_tokens, cost_context\n        ) VALUES (\n            @timestamp, @day, @category, @source, @model, @provider, @success, @streaming, @durationMs,\n            @inputTokens, @outputTokens, @cachedTokens, @reasoningTokens, @costContext\n        )\n    `);\n\n",
        "targetVersions": {
            "pocketrisu": [
                "1.10.0"
            ]
        }
    },
    {
        "id": "usage-cost-estimate:usage-insert-context:1.10",
        "file": "server/node/request-logs.cjs",
        "type": "replace",
        "anchor": "                reasoningTokens: toNonNegInt(row.reasoningTokens),\n",
        "content": "                reasoningTokens: toNonNegInt(row.reasoningTokens),\n                costContext: row.costContext,\n",
        "targetVersions": {
            "pocketrisu": [
                "1.10.0"
            ]
        }
    },
    {
        "id": "usage-cost-estimate:cost-buckets:1.10",
        "file": "server/node/request-logs.cjs",
        "type": "replace",
        "anchor": "        return { total, daily, byModel, bySource };",
        "content": "        const { since, until, ...cumulativeQuery } = query;\n        return { total, daily, byModel, bySource, costVersion: 1,\n            costBuckets: usageCostStore.queryBuckets(query),\n            cumulativeCostBuckets: usageCostStore.queryBuckets(cumulativeQuery) };",
        "targetVersions": {
            "pocketrisu": [
                "1.10.0"
            ]
        }
    },
    {
        "id": "usage-cost-estimate:entries-route:1.10",
        "file": "server/node/request-logs.cjs",
        "type": "replace",
        "anchor": "        app.get('/api/request-logs/usage', async (req, res, next) => {",
        "content": "        app.get('/api/request-logs/usage/entries', async (req, res, next) => {\n            if (!await guard(req, res)) return;\n            res.setHeader('Cache-Control', 'no-store');\n            try {\n                res.send({ success: true, ...usageCostStore.queryEntries({\n                    categories: parseCsv(req.query.categories), sources: parseCsv(req.query.sources),\n                    models: parseCsv(req.query.models), since: parseNum(req.query.since), until: parseNum(req.query.until),\n                    successOnly: req.query.success === '1', limit: parseNum(req.query.limit),\n                    beforeTimestamp: req.query.before_timestamp === undefined ? undefined : Number(String(req.query.before_timestamp).trim() || 'NaN'),\n                    beforeId: req.query.before_id === undefined ? undefined : Number(String(req.query.before_id).trim() || 'NaN'),\n                }) });\n            } catch (error) { next(error); }\n        });\n\n        app.get('/api/request-logs/usage', async (req, res, next) => {",
        "targetVersions": {
            "pocketrisu": [
                "1.10.0"
            ]
        }
    },
    {
        "id": "usage-cost-estimate:usage-no-store:1.10",
        "file": "server/node/request-logs.cjs",
        "type": "replace",
        "anchor": "        app.get('/api/request-logs/usage', async (req, res, next) => {\n            if (!await guard(req, res)) return;\n",
        "content": "        app.get('/api/request-logs/usage', async (req, res, next) => {\n            if (!await guard(req, res)) return;\n            res.setHeader('Cache-Control', 'no-store');\n",
        "targetVersions": {
            "pocketrisu": [
                "1.10.0"
            ]
        }
    },
    {
        "id": "usage-cost-estimate:entries-export:1.10",
        "file": "server/node/request-logs.cjs",
        "type": "replace",
        "anchor": "        queryUsage,\n        usageDimensions,\n",
        "content": "        queryUsageEntries: usageCostStore.queryEntries,\n        queryUsage,\n        usageDimensions,\n",
        "targetVersions": {
            "pocketrisu": [
                "1.10.0"
            ]
        }
    },
];
