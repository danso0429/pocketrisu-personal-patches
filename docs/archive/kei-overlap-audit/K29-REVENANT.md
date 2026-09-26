# K29 Revenant overlap-equivalence audit

## Metadata

- Frozen revisions: A `63832a1`, K `cc1d1b1`, U `85a65f3`.
- Final candidate: exact U plus aggregate graph at patcher `2991355`.
- Prior claims: native jobs plus `bg-preserve` cover persistence, reconnect, cold recovery, operation result/claim/ACK, whole-pipeline cancel, and no-resurrection without a measured missing result.
- Already admitted BG functionality is not re-audited globally. This receipt compares only frozen Revenant effects used to justify omission.

## Kei capability inventory

| Atom | Trigger and result | State/effects | Kei source/callers/tests |
| --- | --- | --- | --- |
| K29-G01 | An ordinary top-level chat continues through auxiliary, main, and post stages after the browser disconnects. | Server owns provider work and terminal chat result. | K Revenant per-request jobs; C comparison target is whole orchestration. |
| K29-G02 | After page kill/cold boot, a completed ordinary main result can be attached without another provider call. | Durable job/result identity and one materialization. | K generation DB/recovery/materialize |
| K29-G03 | While connected or reattached, main provider tokens are replayed live rather than waiting for the full main response. | Raw byte stream/status/headers and parsed live display. | K `generationRoutes.cjs`, `stream.ts`, chat recovery |
| K29-G04 | Once the main reply finishes, it becomes visible before longer post-processing finishes. | Intermediate main result followed by terminal post result. | K live chat flow; C intermediate publish comparison |
| K29-G05 | A Gemini main request intentionally kept on the client survives suspend/disconnect and reconnects to the same provider job. | Covers continuation/reroll/programmatic/client-epilogue request classes. | C comparison; K uses generic Revenant job. |
| K29-G06 | A non-Gemini continuation/reroll kept on the client survives disconnect and remains recoverable. | Same request identity and continuation/reroll state. | K generation context/reroll snapshot |
| K29-G07 | A non-Gemini programmatic/loop `noBgOrch` main call survives disconnect without breaking its blocking contract. | Provider job continues; awaited caller receives one result. | K generic provider job path |
| K29-G08 | A non-Gemini main call retained for browser-only TTS/emotion/image epilogue survives disconnect. | Preserves provider result for client-only epilogue. | K generic provider job path |
| K29-G09 | Gemini continuation/reroll recovery applies the response to the existing target rather than appending a duplicate main message. | Generation ID dedupe and existing message/swipe state. | K snapshot materialization; C draft restore comparison |
| K29-G10 | Auxiliary requests inside an ordinary orchestrated chat survive the browser and allow the main/post pipeline to continue. | Whole server pipeline owns memory/emotion/otherAx/translation descendants. | K auxiliary jobs; C server bundle |
| K29-G11 | A standalone/client-owned Gemini auxiliary request survives suspend and returns one reconstructed response. | Raw result keyed by server job ID with ACK/TTL. | K auxiliary job; C bg-sub result |
| K29-G12 | A standalone/client-owned non-Gemini auxiliary request survives disconnect. | Durable provider attempt/result. | K generic auxiliary Revenant job |
| K29-G13 | A detached LLM translation is recovered by cache key/style decode and consumed once after cold boot. | Operation context routes raw result into translation cache. | K `translationRecovery.ts`, `auxiliary.ts`, chat recovery |
| K29-G14 | A detached HypaV3 summary is routed to its character/chat/memo operation and consumed once. | Operation-keyed summary recovery. | K Hypa auxiliary recovery |
| K29-G15 | A detached Lua LLM call is replayed to the exact execution/call anchor and consumed once. | Operation/execution/replay keys prevent duplicate side effects. | K `scriptings.ts`, auxiliary operation context |
| K29-G16 | Explicit user cancel aborts the exact provider request/whole pipeline and forbids later resurrection. | Server abort, result suppression, local watch invalidation. | K DELETE route; C orchestration/bg-stream cancel |
| K29-G17 | Multi-tab/retry/reconnect cannot launch or materialize the same operation twice. | Operation identity, local ownership, claim/ACK, idempotent consume. | K job IDs/materialized_at; C operation store/claim/ACK |
| K29-G18 | Response status, headers, and raw bytes rebuild the same `Response` after a reconnect. | Preserves streaming parser inputs and HTTP failure semantics. | K raw replay; C bg-stream raw record |
| K29-G19 | If post-processing fails after a main reply exists, the main reply remains recoverable and the post failure is explicit. | Terminal partial result rather than total loss. | K raw/materialization; C typed terminal partial |
| K29-G20 | If the Node process restarts after parsed tokens were checkpointed but before terminal result, those partial tokens can be materialized. | K marks active jobs interrupted and retains non-empty `raw_content`. | K `generationDb.cjs` startup/update/list |
| K29-G21 | An unconsumed completed ordinary result remains recoverable beyond 30 minutes. | K unmaterialized SQLite job has no TTL. | K generation DB/prune policy |
| K29-G22 | Materialized/consumed payload cleanup is bounded without deleting active work. | K prunes materialized payloads by bytes; C ACK/TTL cleans parked results. | K client prune/DB; C result stores |

## Current authority and control flow

### Kei flow

```text
main/aux request caller
  -> buildGenerationContext (mode, chat, reroll/continuation, operation context)
  -> fetchNative provider dispatch
  -> POST persistent Revenant job
  -> server fetch + SQLite headers/raw bytes/status
  -> WS live/replay + client parsed raw_content checkpoints
  -> main materialize or operation-specific auxiliary consumer
  -> materialized_at/consume and bounded payload prune
```

### Official/local/composed flow

```text
ordinary eligible top-level send
  -> operationId + canonical chat save/revision
  -> server-orchestration bundle runs ax -> main -> post
  -> intermediate main snapshot, then typed terminal result
  -> operation-keyed result claim -> client merge/save -> exact ACK

client-retained request
  -> fetchNative route selection
  -> Gemini generation endpoint only -> bg-stream server job
  -> WS reconnect or raw-KV reconstruction -> original client consumer
  -> main draft or auxiliary result ACK
  -> non-Gemini request -> native direct/proxy/job path without bg-preserve result owner
```

### Schema and state crosswalk

K persists one SQLite row per provider attempt with raw bytes, parsed content, request class, chat coordinates, reroll snapshot, and optional translation/Hypa/Lua operation context. C persists an operation-level final chat/result for ordinary sends and raw response records only for gated Gemini client requests. This is a legitimate owner split, but it is not a superset: request classes deliberately excluded from orchestration have provider-dependent coverage, and C has no operation-specific cold consumer for detached translation/Hypa/Lua jobs.

K startup changes queued/generating rows to `interrupted` and lists them when parsed `raw_content` is non-empty. C operation state reports `interrupted-before-result` after restart and does not materialize provider partials. C operation results expire after 30 minutes; K unmaterialized jobs do not.

## Equivalence matrix

| Atom | Kei evidence | Official 1.9 evidence | Local/final evidence | Disposition | Strength | Remaining observation |
| --- | --- | --- | --- | --- | --- | --- |
| K29-G01 | Per-request server jobs | Native jobs alone do not own whole pipeline | BG orchestration owns ordinary send end-to-end | `COMPOSED_COVERAGE` | measured | Existing ordinary-background L3 is the runtime anchor. |
| K29-G02 | Recoverable list/materialize | Native storage hydration | Operation marker/result/merge/ACK | `COMPOSED_COVERAGE` | measured | Existing cold-return qualification is reused. |
| K29-G03 | WS raw chunk replay for all eligible providers | No equivalent ordinary token channel | Orchestration publishes only after main completion | `MISSING_OUTCOME` | source-proved | L3 would measure UX, not presence. |
| K29-G04 | Live main remains while post runs | Native chat rendering | C publishes an ordered `intermediate` at stage 3 -> 4 | `EQUIVALENT` | source-proved | None |
| K29-G05 | Generic Revenant provider job | Native client path | Gemini bg-stream reconnect/raw recovery | `EQUIVALENT` | measured | Limited to Gemini by atom definition. |
| K29-G06 | Continuation/reroll context on every provider | Native client request only | Non-Gemini is outside bg-stream gate | `MISSING_OUTCOME` | source-proved | Concrete trigger: OpenAI/Anthropic continuation or reroll during disconnect. |
| K29-G07 | Generic auxiliary/main provider job | Native blocking client path | `noBgOrch` excludes orchestration; only Gemini gate remains | `MISSING_OUTCOME` | source-proved | Concrete trigger: awaited non-Gemini batch/program call. |
| K29-G08 | Generic provider job plus client epilogue | Native client path | epilogue policy excludes orchestration; only Gemini gate remains | `MISSING_OUTCOME` | source-proved | TTS/emotion/image flag plus non-Gemini provider. |
| K29-G09 | Snapshot-aware materialization | Native reroll/continue logic | Gemini response resumes original consumer; draft restore dedupes by generation ID | `UNVERIFIED` | L3-required | Full swipe/target state after jetsam needs the recorded iPhone scenario. |
| K29-G10 | Auxiliary jobs individually survive | Native helpers | Whole server bundle keeps descendants alive | `COMPOSED_COVERAGE` | measured | Ordinary orchestrated path only. |
| K29-G11 | Generic auxiliary job | Native helpers | Gemini bg-sub result/reconnect/ACK | `EQUIVALENT` | measured | Same-context return; cold semantic routing is G13-G15. |
| K29-G12 | Generic auxiliary job | Native request path | Non-Gemini has no BG result owner | `MISSING_OUTCOME` | source-proved | None |
| K29-G13 | Translation operation context/cache consumer | Native translator cache only | No cold operation-context scan/consumer | `MISSING_OUTCOME` | source-proved | Manual/auto translation killed after provider start. |
| K29-G14 | Hypa summary operation consumer | Native Hypa store | Only ordinary whole-pipeline ownership; no detached cold consumer | `MISSING_OUTCOME` | source-proved | Manual summary outside ordinary send. |
| K29-G15 | Lua execution/replay keys | Native script runtime | No detached Lua operation result queue | `MISSING_OUTCOME` | source-proved | Standalone Lua LLM call. |
| K29-G16 | Exact job DELETE | Native abort signals | Whole-pipeline abort context + bg job DELETE + no later publish | `SUPERSET_PRESERVED` | measured | Existing cancel/no-resurrection L3 is the runtime anchor. |
| K29-G17 | Job materialized flag/local ownership | Native job IDs | Operation IDs, coordinate checks, claim/ACK, durable delivery ledger | `COMPOSED_COVERAGE` | measured | Multi-PWA extremes remain prepared surface, not a failed atom. |
| K29-G18 | Stored status/headers/raw response | Native proxy job | Gemini raw KV stores status/content type/bytes and detects gaps | `EQUIVALENT` | measured | Non-Gemini split is G06-G08/G12. |
| K29-G19 | Non-empty raw content survives failed job | Native recovery | Typed `terminal-partial` preserves main and post error | `COMPOSED_COVERAGE` | source-proved | None |
| K29-G20 | Restart exposes checkpointed partial | Native jobs do not supply equivalent | C reports interruption without partial materialization | `MISSING_OUTCOME` | source-proved | Requires restart timing only to observe UX; state branch is explicit. |
| K29-G21 | No TTL before materialization | Native job DB persists | Ordinary result TTL is 30 minutes | `MISSING_OUTCOME` | source-proved | Concrete trigger: return after TTL with no prior merge. |
| K29-G22 | 100 MiB materialized prune | Native job cleanup | ACK and TTL remove only consumed/expired records | `COMPOSED_COVERAGE` | source-proved | Policies differ, but active/unconsumed safety is split into G21. |

## Adversarial checks

| Scenario | Classification it could break | Method | Observed result | Limitation |
| --- | --- | --- | --- | --- |
| Aggregate BG owner graph and storage adapter | G01/G02/G10/G16/G17 | `node --test test/bg-preserve-1.9.test.cjs test/bg-preserve-storage-base.test.cjs`, patcher `2991355`, exit 0 | 2 files passed. | Contract/source tests; existing qualified L3 supplies runtime ordinary-background/cancel evidence. |
| Non-Gemini reroll/continue/programmatic/epilogue | G06-G08 | Final `sendChat` eligibility plus complete `fetchNativeRaw` gate read | These callers bypass orchestration and the gate admits only Gemini generation endpoints/interceptors. | No paid provider call was made. |
| Server restart during provider stream | G20 | K startup SQL/list query versus C durable operation-state mapping | K lists interrupted non-empty checkpoint; C maps `running` to `interrupted-before-result` and alerts without result. | Runtime restart was prohibited. |
| Return after 31 minutes | G21 | Retention constants and cleanup callers | C operation result TTL is 30 minutes; K deletes only materialized jobs during payload pruning. | Wall-clock wait was unnecessary for the deterministic comparison. |
| Cold detached translation/Hypa/Lua | G13-G15 | Operation-context caller/consumer enumeration and final negative search | K has three typed recovery consumers; C has no equivalent operation-context store/scan. | Ordinary server-orchestrated descendants remain covered by G10. |
| Reroll draft after jetsam | G09 | Final draft capture/restore source trace | Target is matched by generation ID and existing message is overwritten, not appended. | Swipe-state presentation needs an actual L3 if this atom is selected for closure. |

## Findings

| ID | Atom | Current behavior | Kei behavior | Impact/trigger | Owner | Proposed next decision |
| --- | --- | --- | --- | --- | --- | --- |
| K29-F01 | G03 | Ordinary orchestration shows the main only after provider completion. | Connected/reconnected clients receive live token replay. | Ordinary streaming UX is reduced even though background completion is stronger. | BG orchestration result owner | Keep as a deferred, distinct streaming-UX feature; it is not an overlap-correctness fix. Any later work must extend the existing result protocol. |
| K29-F02 | G06-G08/G12 | Client-retained non-Gemini main/aux requests lack bg-preserve recovery. | Revenant covers eligible providers uniformly. | Reroll/continue, awaited loops, browser epilogues, and standalone helpers can fail on background disconnect. | Request-class selection + BG transport | First derive an exact provider/request-class matrix. Treat standard non-Gemini reroll/continue as the correction candidate; keep blocking, epilogue, custom/local, and helper callers client-owned until each preservation contract is proved. |
| K29-F03 | G13-G15 | No operation-specific cold consumer for translation, manual Hypa, or Lua LLM. | Typed contexts route each result exactly once. | A killed page can leave paid detached helper output unapplied. | Existing native feature owners plus BG result protocol | Keep deferred per operation; do not introduce a second generic generation DB. Admit only an operation-specific consumer with exact-once and cache/state tests. |
| K29-F04 | G20 | Server restart reports interruption and discards partial provider text. | Checkpointed partial text can be materialized. | Restart during generation can lose readable partial output. | BG operation state/result owner | Reclassify as an explicit safety difference: keep the interruption result rather than materializing potentially incomplete text unless product policy is later changed. |
| K29-F05 | G21 | Unconsumed ordinary result expires after 30 minutes. | It remains until materialized/explicitly pruned after materialization. | A long-away mobile client can lose a completed paid response. | BG result-retention owner | User policy selected 2026-08-02 KST: completed paid output must survive an overnight mobile absence under bounded retention. Derive exact TTL and byte/row caps during separate implementation design. |
| K29-F06 | G09 | Source maps generation-ID overwrite/dedupe, but swipe-state behavior after jetsam was not freshly observed. | Reroll snapshot materialization is explicit. | Only reroll/continue cold recovery presentation remains observationally uncertain. | BG draft restore UI | Add the concrete reroll-background-kill-return scenario to the already planned aggregate iPhone L3 before closing this subtraction claim. |

## Conclusion

- 22 / 22 discovered atoms are mapped.
- Dispositions: 4 `EQUIVALENT`, 6 `COMPOSED_COVERAGE`, 1 `SUPERSET_PRESERVED`, 10 `MISSING_OUTCOME`, 1 `UNVERIFIED`.
- K29-G09 has an L3-required presentation remainder; it is not reported as an observed pass.
- Whole-pipeline ordinary background ownership and cancel/no-resurrection remain supported, but the prior blanket no-missing-outcome claim is corrected at the request-class, live-stream, restart-partial, operation-context, and retention boundaries.
- The G21 product policy is resolved in favor of bounded overnight survival; no runtime implementation is authorized by this receipt.
