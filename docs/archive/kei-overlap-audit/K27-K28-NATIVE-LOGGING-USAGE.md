# K27/K28 native logging/usage overlap-equivalence audit

## Metadata

- Frozen revisions: A `63832a1`, K `cc1d1b1`, U `85a65f3`.
- Final candidate: exact U plus aggregate patcher graph at `2991355`.
- Scope includes only exact-1.9 equivalence claims. The separately proposed privacy/retention redesign remains out of scope and is recorded only as an intentional difference.

## Kei capability inventory

| Atom | Trigger and result | State/effects | Kei source/callers/tests |
| --- | --- | --- | --- |
| K27-L01 | Foreground provider requests create one persistent request-log row with request/response outcome. | SQLite request row keyed by request ID/chat. | K `requestLogs.cjs`, request hooks |
| K27-L02 | A server-owned/background generation is logged even if the browser disappears. | Server execution owns the durable row. | K Revenant job creates/updates request log. |
| K27-L03 | Recovered native model jobs receive a reconstructed log row. | Records recovered result and timing/category metadata. | U/C `jobRecovery.ts` |
| K27-L04 | Log row captures core URL/body/header/response/status/success/chat/client metadata. | Persistent content and query fields. | K request-log schema |
| K27-L05 | Log records the client platform/device class. | `platform` field presented as badge. | K schema/UI |
| K27-L06 | User can delete one request-log row. | Individual persistent deletion. | K DELETE route/UI |
| K27-L07 | User can query the latest row for one chat. | Chat-scoped lookup. | K route/UI |
| K27-L08 | Credentials/media are masked before persistence. | Redacts secrets and bounds content exposure. | K masker; C request-log store |
| K27-L09 | Storage is bounded and list reads are paginated. | Byte cap/rotation/cursor/limit. | C native owner |
| K27-L10 | Frozen default records request/response content when logging is enabled. | Full-content persistence, subject to masks/caps. | K and C defaults |
| K27-L11 | Retention/default-content policy can later be made explicitly safer. | Proposed policy, not frozen equivalence. | Rebase/completion decision |
| K28-U01 | LLM usage stores content-free provider/model/input/output/total/cached/reasoning counts. | Usage table has no prompt/response body. | K `usageDb.cjs`; C request-log usage table |
| K28-U02 | Accounting failure never fails generation. | All usage writes are best-effort. | K/C callers |
| K28-U03 | Server-orchestrated/background requests contribute usage. | Durable accounting survives browser loss. | K server usage report path |
| K28-U04 | Cache-read/create, service tier, gateway cost, raw usage, and model price are reported. | Rich accounting/pricing dimensions. | K usage/pricing UI/server |
| K28-U05 | Usage retention/pagination and enable toggle are independently configurable. | Policy/query lifecycle independent of content logging. | K/future policy decision |
| K28-U06 | Usage rows can be grouped into total/daily/model/source reports. | Derived aggregate queries. | K/C report endpoints |

## Current authority and control flow

### Kei flow

```text
provider/Revenant request start
  -> mask/cap request fields -> request_logs row
  -> stream/status/response updates -> terminal row
  -> extract normalized usage -> content-free generation_usage row
  -> report/list/chat lookup/delete
```

### Official/local/composed flow

```text
foreground provider fetch with logCategory
  -> createRequestLogScope -> tee response -> POST /api/request-logs
  -> bounded SQLite request row + content-free usage row
  -> cursor/detail/filter/report UI

native model-job recovery -> recordRequestLog -> same route

server orchestration bundle
  -> provider wrappers create a client-style scope
  -> send() calls relative /api/request-logs
  -> bgOrchestrator patchFetch has no route for it
  -> Node relative fetch rejects and send() catches/drops it
```

### Schema and state crosswalk

C stores richer timing/category/source/route fields and bounds the database by bytes, but omits K's `platform` and individual deletion. Its usage table contains core normalized counts but no cache-creation/service-tier/gateway/raw/pricing dimensions. Request content logging and usage share `requestLogEnabled`; the future independent policy is not implemented.

## Equivalence matrix

| Atom | Kei evidence | Official 1.9 evidence | Local/final evidence | Disposition | Strength | Remaining observation |
| --- | --- | --- | --- | --- | --- | --- |
| K27-L01 | Persistent row per foreground request | Native scoped logger | Final provider callers tag LLM routes | `EQUIVALENT` | source-proved | Provider runtime smoke not required for owner presence. |
| K27-L02 | Revenant server job owns row | Native logger is client-posted | Orchestrator has no `/api/request-logs` server route adapter | `MISSING_OUTCOME` | source-proved | None |
| K27-L03 | Not a separate K mechanism | Native recovery logger | Final retains `jobRecovery.ts` call | `EQUIVALENT` | source-proved | Applies to native jobs, not BG orchestration. |
| K27-L04 | Core content/status/chat fields | Native schema has these plus timing/category/route | Final server schema retains them | `SUPERSET_PRESERVED` | source-proved | Platform split to L05. |
| K27-L05 | Platform persisted/displayed | Absent | Direct schema/UI negative search | `MISSING_OUTCOME` | source-proved | Client ID remains available. |
| K27-L06 | Individual delete | Clear-all only | No row DELETE route/action | `MISSING_OUTCOME` | source-proved | None |
| K27-L07 | Chat latest lookup | Chat filter + limit 1 | Final query supports it | `EQUIVALENT` | source-proved | None |
| K27-L08 | Secret masking | Native masks URL/header/body/response/error and inline media | Final is stricter | `SUPERSET_PRESERVED` | source-proved | Preserve custom endpoints while expanding masks. |
| K27-L09 | K is unbounded/all-at-once | Native 256 MiB budget, 2 MiB bodies, cursor 1-500 | Final retains bounds | `SUPERSET_PRESERVED` | source-proved | Rotation race remains native prepared surface. |
| K27-L10 | Full content default | Native enabled/default content | Final matches frozen effect | `EQUIVALENT` | source-proved | Not an endorsement of future privacy policy. |
| K27-L11 | Future safer policy | Not frozen K behavior | Explicitly deferred | `INTENTIONAL_DIFFERENCE` | source-proved | Needs separate policy decision. |
| K28-U01 | Core normalized usage | Native content-free usage table | Final retains counts/dimensions | `EQUIVALENT` | source-proved | Cache creation split is U04. |
| K28-U02 | Catch all accounting failures | Native logger drops failures | Final callers do not propagate | `EQUIVALENT` | source-proved | None |
| K28-U03 | Server job reports usage | Client-posted native path | Orchestrator drops request-log/usage POST | `MISSING_OUTCOME` | source-proved | None |
| K28-U04 | Rich accounting/pricing | Absent | Explicit future accounting scope | `INTENTIONAL_DIFFERENCE` | source-proved | User-visible reports are narrower. |
| K28-U05 | Independent policy/query | Coupled native toggle/unbounded usage | Explicit future work | `INTENTIONAL_DIFFERENCE` | source-proved | None |
| K28-U06 | Aggregate reports | Native total/daily/model/source | Final route/UI retains them | `EQUIVALENT` | source-proved | None |

## Adversarial checks

| Scenario | Classification it could break | Method | Observed result | Limitation |
| --- | --- | --- | --- | --- |
| Ordinary foreground streamed LLM | L01/L04/U01 | Complete provider caller -> scope -> server route/schema trace | One scope owns tee/body/timing and one batch inserts request plus usage. | No paid provider call was made. |
| Server-orchestrated LLM with browser absent | L02/U03 | Bundle build input, `requestLog.send`, `patchFetch`, and server routes read; negative search across final BG files | Relative `/api/request-logs` has no in-process interception; caught send failure drops both rows. | A live run would only reconfirm the deterministic missing route. |
| Very large/media request | L08/L09 superset | Cap/mask/rotation code comparison | Final strips inline media, caps fields and total bytes, paginates reads. | Resource peaks were not benchmarked. |
| One-row delete | L06 equivalence | Route/UI enumeration | Final exposes clear-all but no ID delete. | None |

## Findings

| ID | Atom | Current behavior | Kei behavior | Impact/trigger | Owner | Proposed next decision |
| --- | --- | --- | --- | --- | --- | --- |
| K27-F01 | L02/U03 | Server-orchestrated requests silently drop request log and usage delivery. | Revenant's server job persists both independent of the browser. | The default ordinary UI generation path can be absent from logs and usage reports. | Native log schema plus BG server execution owner | Recommend an owner-local correction: insert through the native server modules, honor the existing log toggle/masking/byte cap, keep usage content-free and failure-isolated, and create no second DB. |
| K27-F02 | L05/L06 | No platform badge or individual deletion. | Both are present. | Multi-device diagnosis is less explicit; removing one sensitive row requires clearing all. | Native request-log UI/server owner | Keep platform as a deferred diagnostic feature. Treat per-row deletion as a separate privacy/UX enhancement with confirmation and the native storage budget, not part of the BG accounting correction. |

## Conclusion

- 17 / 17 discovered atoms are mapped.
- Dispositions: 7 `EQUIVALENT`, 3 `SUPERSET_PRESERVED`, 4 `MISSING_OUTCOME`, 3 `INTENTIONAL_DIFFERENCE`.
- No L3-required distinction remains; no real user log database was read or changed.
- Exact-1.9 equivalence is confirmed for foreground/native-job logging and core usage, but corrected for the final server-orchestration path.
