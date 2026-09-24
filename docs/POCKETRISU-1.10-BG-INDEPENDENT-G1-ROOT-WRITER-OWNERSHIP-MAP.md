# PocketRisu 1.10 G1 root writer and effect ownership map

Date: 2026-09-24 KST

Scope: source/caller map on the exact-1.10 generated candidate, plus isolated
process evidence. This is not a claim that every installed plugin or actual
browser/device path has been exercised. The implementation and fresh-start
order are in `POCKETRISU-1.10-BG-INDEPENDENT-G1-ROOT-EFFECT-IMPLEMENTATION-PLAN.md`.

## 1. Statistic-producing callers

| Caller | Trigger and durable intent | Identity / boundary |
| --- | --- | --- |
| Browser `sendChat` in `src/ts/process/index.svelte.ts` | A top-level eligible BG request can return from the server-orchestration redirect **before** the local increment. A client-owned invocation passes the per-chat guard, creates `generationId`, then increments `DBState.db.statics.messages` before the placeholder check and before the model outcome. Client-only continue/reroll, programmatic/loop calls, fallback, and recursion can enter this path. | `generationId` exists per invocation, but the current statistic write is a scalar root mutation, not a durable operation-keyed effect. Auto-continue/resend recursively call `sendChat` and create another invocation. A pending-send tombstone may record the old generation ID, but the recovery caller claims the chat then invokes `sendChat` with a newly minted ID. Do not equate one user Send button, one provider call, one recovery attempt, and one statistic increment without testing the exact caller. |
| Legacy BG result merge in `src/ts/bgOrchestrate.ts` | A client-owned result applies the unapplied suffix of `staticsMessagesDelta` to local `statics.messages` and saves the result. | Uses `operationId` and `bgOrchestrationApplied`; the client helper slices its view to 128 entries. This is not the C1 server-commit path. |
| C1 `serverChatCommitOwner.cjs` | Server result commit applies the recorded positive statistic delta to the canonical database and writes the same operation's cumulative value to `bgOrchestrationApplied`. | Its commit/receipt and canonical write are transactional; the server owner appends to the current statics ledger without the client's 128-entry slice. Canonical publication refreshes the stripped DB cache/ETag. A later root write can still change the numeric counter. |
| `serverChatSettingsContext.cjs` | Reconstructs a predecessor-derived statistic in a cloned prompt/settings snapshot for N+1. | Value comparison and overlay, **not** a canonical statistic writer. It can accept a root count that already lost a separate browser +1 because the resulting value equals the predecessor-only expectation. |

Static source search found these direct `statics.messages` mutations in the
supported source. This is not a dead-code or plugin-completeness claim:
whole-database replacement, dynamic scripts, and caller/version variants
must still be tested at their final runtime boundaries.

## 2. Global values and whole-root writers

| Caller / boundary | Observed ownership |
| --- | --- |
| Browser toggles and dynamic trigger/script paths | Toggle UI bindings and `applyToggleValues` directly change `globalChatVariables`; dynamic trigger/script effects need final-caller verification. `serverChatInputOwner` checks input-transform global intent against canonical values before attach; C1 records per-key response conflicts and preserves a newer canonical value rather than blindly replaying a result. |
| Ordinary `globalApi.svelte.ts` save | Tracks root changes; sends patch-sync first when supported. A server hash 409 reads the latest root and calls `mergeThreeWayValue(base, local, remote)`. Equal changed scalars collapse; different same-key scalars prefer local. If patch is not saved, a full write uses `x-if-match` only when the client has a DB ETag. A strict `requestDurableSave({ root: true })` waits for completion/flush or rejects before input-v1 start. |
| Server `/api/patch` and `/api/write` | Both serialize through the storage queue and call `preserveDatabaseState`. It preserves `serverChatCommitApplied`, global-conflict records, execution projection, and the current `statics.bgOrchestrationApplied` ledger. It does **not** preserve `statics.messages` or arbitrary `globalChatVariables`. `/api/patch` requires a matching root hash. `/api/write` rejects a mismatched supplied ETag but currently accepts a missing ETag, even with existing BG effects. |
| Fresh DB bootstrap | `bootstrap.ts` calls `setItem('database/database.bin', ...)` without an ETag only when both startup bytes and decoded cache are absent. That legitimate creation path must survive any missing-ETag fence; the synthetic test of a stale write against an **existing** DB is a different case. |
| Whole DB replacement/import/restore | `setDatabase` is called by bootstrap recovery, backup restore, character/command paths, and conflict rebase. These are root-state owners or hazards even when they do not increment the statistic directly. Inventory their persistence route before making a universal validator requirement. |
| Plugin database subset API | `plugins.svelte.ts` filters `setDatabase`/`setDatabaseLite` through `allowedDbKeys`, which does not include `statics` or `globalChatVariables`. Plugins can still trigger supported generation or affect other allowed data; this static key filter is not proof that every dynamic plugin path is harmless. |
| Session writer lock | `checkActiveSession` calls `session-lock.cjs` for client writes. The same active session passes; a stale different session gets 423; a freshly booted passive session may write without taking over. Calls without `x-session-id` pass for legacy compatibility. C1's own server commit is not a client `checkWrite` call, so this lock does not serialize the C1 effect with an already active browser root save. Patch hash/ETag and effect ownership still need to resolve that race. |

## 3. Reproduced causal boundaries

The diagnostic patch in `artifacts/` is an **observational** five-case suite.
It passed on two independent exact-1.10 generated candidates. From base 10,
browser-first then N stored 12; N-first then browser patch/full-write rebase
stored 11; missing-ETag stale full-write stored 10; an already committed
browser +1 with lost HTTP response followed by N reached remote 12 before
the stale retry regressed it to 11. N+1 could start after the collapsed patch
case. The tests use actual spawned server/SQLite/HTTP and a synthetic provider,
not an actual browser.

An additional no-ETag invariant patch,
`artifacts/pocketrisu-bg-root-race-no-etag-acceptance.patch`, applies **after**
the observational patch and changes only the stale no-ETag case to require
that an existing committed effect not regress. It was intentionally red on
the current candidate: received 10 when the minimum retained count was 11.
This invariant allows either refusal (409/428) or a safe 200 reconciliation;
it does not select the eventual protocol.
Focused existing session-lock tests passed 13/13, and pending-send/statistics
tests passed 15/15 on the disposable candidate. These verify their current
rules, not the missing cross-owner count contract.

## 4. What is settled and what is not

Settled for planning: the cross-owner count loss is real at the normal root
API; a scalar three-way rebase and BG-only ledger preservation do not repair
it; blind addition is unsafe after a browser write with a lost response;
`inputCommandVersion=0` does not disable separately negotiated C1 commit v1.

Still requiring implementation-linked proof: the exact persisted identity of
each browser statistic effect, including recursive and recovered sends;
deduplication after an uncertain browser save; old-client/backup/restore
behavior under a narrowed no-ETag fence; mixed legacy/C1 ledger retention;
actual browser and cross-tab interleavings. The static plugin subset filter
reduces a direct-write path but does not close dynamic registration or
programmatic generation. These are explicit R2/R5 gates, not permission to
assume a convenient writer model.
