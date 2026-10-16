'use strict';

// Metadata only: no URL, credential, prompt or response is retained here.
function captureUsageCostContext(entry) {
    let product = 'unknown', region = 'unknown';
    try {
        if (typeof entry.url !== 'string' || entry.url.length > 2048) throw new Error('Unqualified endpoint');
        const url = new URL(entry.url);
        const direct = url.protocol === 'https:' && !url.port && !url.username && !url.password;
        if (direct && url.hostname === 'generativelanguage.googleapis.com' && /\/models\/[^/]+:/.test(url.pathname)) {
            product = 'gemini'; region = 'global';
        } else if (direct && /^(?:[a-z0-9-]+-)?aiplatform\.googleapis\.com$/.test(url.hostname)) {
            const location = /\/locations\/([^/]+)\//.exec(url.pathname)?.[1];
            if (location && /\/publishers\/google\/models\//.test(url.pathname)) {
                product = 'vertex';
                region = location === 'global' ? 'global' : /^[a-z]+(?:-[a-z]+)+\d+$/.test(location) ? 'regional' : 'unknown';
            }
        }
    } catch { /* Missing/custom endpoints have no qualified price. */ }
    const text = value => typeof value === 'string' && value.trim() ? value.trim().slice(0, 64) : null;
    const traffic = text(entry.trafficType), service = text(entry.serviceTier);
    const vertexTiers = { ON_DEMAND: 'standard', ON_DEMAND_PRIORITY: 'priority', ON_DEMAND_FLEX: 'flex' };
    const geminiTiers = { standard: 'standard', priority: 'priority', flex: 'flex' };
    const vt = traffic ? vertexTiers[traffic.toUpperCase()] ?? null : null;
    const gt = service && Object.hasOwn(geminiTiers, service.toLowerCase()) ? geminiTiers[service.toLowerCase()] : null;
    const absent = !traffic && (!service || service.toLowerCase() === 'unspecified');
    const conflict = !!traffic && !!service && (vt === null || gt === null || vt !== gt);
    const tier = conflict ? null : absent ? 'standard' : product === 'vertex' ? vt : product === 'gemini' ? gt : null;
    const tierSource = conflict ? 'conflict' : absent ? 'assumed' : tier ? 'reported' : 'unknown';
    const count = n => Number.isSafeInteger(n) && n >= 0;
    const inputReported = count(entry.inputTokens), outputReported = count(entry.outputTokens);
    const cached = entry.cachedTokens ?? 0, reasoning = entry.reasoningTokens ?? 0;
    const valid = inputReported && outputReported && count(cached) && count(reasoning)
        && cached <= entry.inputTokens && reasoning <= entry.outputTokens;
    const pricingTimestamp = entry.pricingTimestamp ?? entry.timestamp;
    const date = typeof pricingTimestamp === 'number' && Number.isFinite(pricingTimestamp) ? new Date(pricingTimestamp) : null;
    const priceDay = date && Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
    // Fixed keys, no unique timestamp: equal daily contexts remain aggregatable.
    // Arbitrary raw tier strings must not create one cumulative group per row.
    return JSON.stringify({ v: 1, product, region, tier, tierSource,
        inputReported, outputReported, valid, accounting: entry.usageAccountingVersion === 1,
        priceDay, dateBasis: entry.pricingTimestamp != null ? 'job-start' : 'request',
        aborted: entry.aborted === true, successful: entry.success === true });
}

function migrateUsageCosts(db) {
    db.transaction(() => {
        if (!db.pragma('table_info(usage)').some(column => column.name === 'cost_context')) {
            db.exec('ALTER TABLE usage ADD COLUMN cost_context TEXT');
        }
    })();
}

function createUsageCostStore(db, buildWhere, sums) {
    function queryBuckets(query) {
        const { conditions, params } = buildWhere(query);
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        return db.prepare(`SELECT model, provider, cost_context AS context, ${sums}
            FROM usage ${where} GROUP BY model, provider, cost_context`).all(...params);
    }
    function queryEntries(query = {}) {
        const { conditions, params } = buildWhere(query);
        const hasCursor = query.beforeTimestamp != null || query.beforeId != null;
        if (hasCursor && (typeof query.beforeTimestamp !== 'number' || !Number.isFinite(query.beforeTimestamp)
            || !Number.isSafeInteger(query.beforeId) || query.beforeId <= 0)) {
            const error = new Error('Invalid usage cursor'); error.status = 400; throw error;
        }
        if (hasCursor) {
            conditions.push('(timestamp, id) < (?, ?)'); params.push(query.beforeTimestamp, query.beforeId);
        }
        const limit = Number.isSafeInteger(query.limit) ? Math.max(1, Math.min(100, query.limit)) : 50;
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const rows = db.prepare(`SELECT id, timestamp, model, provider, source, success,
            input_tokens AS inputTokens, output_tokens AS outputTokens,
            cached_tokens AS cachedTokens, reasoning_tokens AS reasoningTokens,
            cost_context AS context FROM usage ${where} ORDER BY timestamp DESC, id DESC LIMIT ?`)
            .all(...params, limit + 1);
        const more = rows.length > limit;
        const entries = rows.slice(0, limit);
        const last = entries.at(-1);
        return { costVersion: 1, entries, nextCursor: more && last ? { timestamp: last.timestamp, id: last.id } : null };
    }
    return { queryBuckets, queryEntries };
}

module.exports = { captureUsageCostContext, migrateUsageCosts, createUsageCostStore };
