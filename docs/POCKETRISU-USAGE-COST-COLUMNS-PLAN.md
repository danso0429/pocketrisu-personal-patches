# PocketRisu Usage Cost and Cache Plan

Revision: r2, 2026-10-16. Implementation authorized after plan review.
Base: patcher `35c3270`, exact PocketRisu `1.10.0`.
Candidate: `0.2.4-experimental.51`; new pack `usage-cost-estimate` `0.1.0`.
Stable remains `v0.2.3`. This document defines behavior; observed gate results
belong in the validation record rather than being inferred from this plan.

## User result

Settings → System → Usage provides both model totals and individual request costs,
selected-period and cumulative estimates, cached tokens, token-weighted cache ratio,
reasoning tokens and gross cache savings. The user explicitly selected both model
and individual-request views, then requested one compact line per response.

The original model-only proposal is superseded. Existing retrospective observations
were retained privately; they are not treated as fresh measurements or billing proof.
Provider Manager 1.19.0 and Gemini Cache Keeper 2.10.8 are source references only,
not dependencies or bundled plugins. Cache Keeper prefers response serviceTier and
falls back to requested tier; its request-hit ratio differs from a token ratio.

## Execution contract

### Collection and storage

- Reuse the persistent native `usage` table. One list row is a logged LLM transport
  attempt, not one Send/generation; retries can produce multiple rows.
- Add a single nullable `cost_context TEXT` column in a transaction after native
  schema creation and before preparing INSERT statements. Never rewrite old rows.
- Construct metadata from original entry fields plus the normalized timestamp
  inside normalizeEntry, before usage INSERT coerces missing/invalid counts to zero.
- Preserve only normalized official product/region, served tier/source, field
  presence and validity, accounting version, UTC pricing day/date basis and state.
  No new URL, credential, content or arbitrary raw tier string is retained in this
  group key. Validity remains per-row so invalid data cannot hide in valid sums.
- Old rows and revert-gap rows retain NULL context and unknown cost. Source revert
  leaves the additive column; the original named-column writers remain compatible.
- Gemini completionTokens becomes candidatesTokenCount + thoughtsTokenCount once;
  reasoning stays a subset. Provider totalTokenCount remains unchanged. Copy served
  trafficType/serviceTier and accounting version through foreground, stream, recovery
  and BG log paths. Recovery message output metadata and status totals include thinking.
- If tool-use prompt tokens are unmodelled or the supplied total is inconsistent,
  preserve usage but mark accounting incomplete. Do not fabricate a complete bill.
- Preserve existing recorded timestamps/filter semantics. Recovered jobs provide
  job.createdAt separately as pricing timestamp; otherwise use the request timestamp.
  Price by UTC day. The provider's exact price-transition timezone is unconfirmed.

### Queries and retention

- Native total/daily/byModel/bySource/dimensions shapes and old-data values remain.
- Add `costVersion`, `costBuckets` for the selected query and cumulative buckets
  with the same model/source/category/success filters but without date bounds.
- Group by normalized context + model + provider; priceDay gives daily precision.
  Keep arbitrary response strings and per-request timestamps out of group keys.
- Add an authenticated, non-cacheable usage-entries GET endpoint sharing filters.
  Use `(timestamp DESC,id DESC)` keyset pagination; default 50, hard maximum 100.
  Reject malformed/incomplete cursors. The native usage row id is the list identity.
- Body rotation/clearing does not remove this list. Existing explicit usage clearing
  does, and remains guarded by its existing confirmation/session policy.
- A page is not the period total. Sum unrounded costs across the entire filtered
  dataset; visible page boundaries must not change the model or cumulative totals.
- Cumulative aggregation scans retained usage on refresh. Measure its cost and keep
  growth a documented runtime surface; do not add destructive retention or speculative
  caching/rollups merely to enforce a size target.

### Price records and evidence

Initial qualified prices are for exact `gemini-4-argon` only:

- Official Gemini Developer API: Standard, Flex and Priority, global endpoint.
- Official Vertex: Standard and Priority, global or recognized regional locations.
- Custom/reseller endpoints, unknown/multi-region locations and other models remain
  unpriced. Vertex Argon Flex is not assumed supported from Developer API pricing.

Official sources, checked 2026-10-15:

- [Developer API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Vertex pricing](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing)
- [Developer API usage fields](https://ai.google.dev/api/generate-content#UsageMetadata)
- [Vertex usage fields](https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/rest/v1/GenerateContentResponse)

Standard global input/cached-input/output USD per million tokens is 2/0.1/10
through 2026-11-30 and 4/0.2/20 from 2026-12-01. Priority is 1.8×; qualified
Developer API Flex is 0.5×; qualified Vertex regional pricing is 1.1× global.
Fourteen independent literal rate fixtures cover both periods and product routes.
Vertex's earlier figures are published promotional effective rates; actual account
credits are unverified. Do not transfer that credit condition to Developer API.

Normalize Vertex trafficType and Developer API serviceTier separately. The latter
documents lowercase unspecified/standard/flex/priority. Distinguish absent, unknown
and conflicting fields. Only new, complete accounting may assume Standard for a
missing tier, with an explicit assumption label.

All amounts in this implementation are usage/rate estimates in USD, not verified
invoice charges. A reported tier is not a reported dollar amount. No account/billing
API or reported monetary field is fabricated. Historical missing thinking is not
backfilled. An unknown cost is never displayed as confirmed zero.

This sums recorded usage, not a lossless charge ledger. Native log delivery is
best-effort and recovered logging precedes persist/claim, so lost log/claim paths
can leave omissions or repeated observations. Preserve native statistics and disclose
that limitation; durable attempt deduplication requires a separately qualified contract.

For valid I=input, C=cached, O=billable output:

    cost = ((I-C)*inputRate + C*cachedRate + O*outputRate) / 1e6
    grossSavings = C*(inputRate-cachedRate) / 1e6
    cacheRatio = C/I

Require valid nonnegative counts, C≤I, and reasoning≤output. Missing or inconsistent
accounting is excluded from priced totals. Cost + savings must equal the same-priced
no-cache baseline. Savings exclude storage, grounding and other non-token charges.
Use priced rows for priced-cache summaries; mark model token totals as all recorded
usage where their population differs. Sum before display rounding. Small positive
amounts use additional precision instead of becoming apparent zero.

### Screen and async ownership

- Keep native chart/token summaries/source table and clear controls.
- Add a model filter to the existing source/period filters. All views share it;
  cumulative cost removes only date bounds. Keep report and adopted query together.
- Replace the model-only block with a responsive cost panel: period and cumulative
  estimates, priced-cache savings/ratio, model totals and individual attempts.
  Preserve requests/input/output/cache/reasoning/duration information.
- Per the user's refinement, each attempt is one compact collapsed line: time,
  ellipsized model, estimated cost, compact cached tokens/ratio and savings. Avoid
  repeated labels. Tap/keyboard expansion reveals exact counts, full model/provider,
  state and pricing evidence. Small type must not hide data or force page overflow.
- Distinguish unpriced models, legacy metadata, incomplete usage and failed attempts
  without usage. None is labelled free. Existing positive legacy tokens remain visible.
- Older servers without the cost fields show unavailable, not zero. Guard all
  async pagination/refresh results by query generation and unmount lifetime. Prevent
  duplicate load-more requests; preserve the cursor after a retryable read failure.

## Ownership and implementation units

| Unit | Maintained owner | Scope |
|---|---|---|
| U1–U2 | client-units.cjs | Gemini parsing/types, log scope, foreground and recovery mappings, original usage expectation updates |
| U3 | server-units.cjs + usageCostStore.cjs | nullable migration, normalization, insert/query/route additions, auth/cursor/filter boundaries |
| U4–U7 | ui-units.cjs + usagePricing.ts + UsageCostPanel.svelte | pricing, confidence, native model filter, responsive model/attempt UI, ko/en strings |
| U8 | manifest/catalog/tests/docs/installer | complete delivery registration and generated artifact pairing |

No provider, chat commit, permission or cache execution policy is changed. Existing
PageFold redaction, request-log rotation and BG bridge observation policy remain.

## Verification and delivery

- Test old schema migration twice, unchanged old rows, old writers, reopen and
  retained column after source revert; inspect SQLite integrity.
- Test actual parser → collector → server context, stream/nonstream, served tiers,
  custom/redacted routes, unknowns, failed/missing/invalid usage and recovery dates.
- Test authenticated filters, maximum pages, tied timestamps, no duplicates,
  cumulative scope, body clearing versus explicit usage clearing and old servers.
- Test literal official rates, date/region/tier boundaries, savings invariants,
  mixed unknowns and small amounts; test UI stale callbacks, retry and unmount.
- Measure actual Chromium layout with synthetic SQLite/API data and production
  CSS, including compact row geometry and expansion. This is not physical iPhone L5.
- Run frontend/server/compatibility/type/help/build/BG checks, patcher tests,
  reproducible installer, complete graph/re-plan/exact byte/mode/path revert,
  scoped L3/L4 and privacy sweep. Keep observations and limitations explicit.
- Deliver reviewable commits through the repository's authorized commit/push and
  safe live apply path. Check active generation read-only; wait without cancellation.
  Stop before changes, preserve verified app/state and usage-database rollback,
  then build/apply/restart and independently read back service/assets/schema.
- No paid provider trial, stable tag or release is included. Physical iPhone L5
  remains the stable-release gate and will receive concrete UI scenarios.
