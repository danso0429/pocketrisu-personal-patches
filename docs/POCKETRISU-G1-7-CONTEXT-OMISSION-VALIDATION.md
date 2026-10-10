# G1.7 context invalidation and omission contract

2026-10-10 KST. Baseline `78a16c1`; candidate `0.2.4-experimental.30` / BG adapter `0.7.37`, Personal settings `0.5.14`. The user confirmed omission plus notification for an unusable non-provider analysis context: retain the previous chain value, finish/store the answer and preserve prior effects without automatically replaying input, initialization or analysis. A selected model-provider failure remains a failure; it must not become an implicit default-model success.

This is a scoped pre-M7 correction and qualification unit. Production host activation, full request admission, actual providers and device/aggregate qualification remain separate.

## Runtime contract

- Source/name/version and registrations remain fixed for one operation. Argument values retain native per-key freshness; neither atomic settings epochs nor operation-wide argument freezing is introduced.
- All stored copies count toward name ambiguity, including disabled copies. Affected enabled names receive one existing `plugin_api_unsupported` / `plugin_identity_ambiguous` notice before any guest initialization. Suppressed scripts create no worker and issue no initialization request. This deliberately differs from native first-match behavior; rename duplicate copies before expecting their server hooks to participate.
- The shared comparator checks canonical enabled membership, exact source/version and the existing 16-slot bound. Surviving valid loaded contexts retain relative order: only inverted pairs are invalidated. An unrelated insertion, removal or toggle no longer disables every later hook. Already-failed entries do not constrain the surviving chain. A newly added name is omitted with one notice per operation and is never initialized in that operation. Pushing a loaded entry beyond the existing 16-slot bound still omits it.
- Checks run before/after a callback, before API dispatch, before/after effect intent, in the latest canonical-root mutator and in local KV transactions. Mandatory notices settle before a disabled hook passes its prior input through. Invalidated providers reject; existing registry ownership lasts until close. Permission hashes bind to the actual loaded code, while saved grants and expiry behavior remain unchanged.
- The detached operation DB remains an assembly snapshot. A committed per-key argument write mirrors only into a matching snapshot entry and does not recreate an absent entry or turn a completed canonical write into a false guest failure. No child supplies a replacement `plugins` array.

## Canonical authority and cold recovery

The internal owner supplies `peekRoot()` from the same canonical cache as `getRoot()`. Capability and start predicates require that identity binding. A hot check does not acquire the global storage queue. A missing cache is recoverable: async-safe callback/API/effect points use the existing canonical reader before validating. The latest root mutator receives its root directly; local KV performs a bounded cold retry outside its first rolled-back transaction, before any write, without repeating the effect-intent callback. A second cache eviction omits that entry with an awaited `plugin_identity_cache_unstable` notice instead of falsely declaring the whole canonical store unreadable. Scope/cancellation is rechecked after async recovery, before guest computation as well as API dispatch.

Genuine failed or malformed identity reads latch `plugin_identity_unavailable` once and abort the operation. All three generated abort boundaries retain that reason. Teardown skips new identity validation/publication. This is boundary validation, not instantaneous revocation, provider cancellation/refund or rollback of already applied effects. A returned provider stream without further API calls is not continuously revalidated.

The assembly refresh uses the same comparator against the assembly snapshot. Its existing phase label still reflects the preceding hook/load boundary; per-callback/API checks use the actual invocation phase. This does not add a notification schema or claim to reconstruct MARP's private browser history.

## Actual generated-server qualification

The maintained context probe uses the byte-original Lite0.9.2, synthetic credentials/providers, actual authenticated HTTP, canonical root writer, SQLite, normal-chat API and commit journal. It does not use production user data. Its prepared route seeds processed input and omits the raw input command; it is not a substitute for interactive browser recovery.

| Scenario | Analysis / main / answers | Observed result |
| --- | --- | --- |
| Script changes while first analysis is held, raw | 1 / 1 / 1 | Prior chain passes through; no new injection, one stored notice before main, one normal-chat/journal answer. |
| Same change, prepared route | 1 / 1 / 1 | Same outcome without an assembly refresh. |
| Unrelated plugin inserted before MARP | 3 / 1 / 1 | Existing analysis/injection retained; one addition notice, new initializer never runs. |
| Value-identical plugin objects replace the array | 3 / 1 / 1 | No false omission or notice. |
| Actual valid-hash failed `/api/patch` evicts the cache | 3 / 1 / 1 | One peek miss and recovery, no notice; queued root reads19 versus ordinary18. |
| Canonical reload genuinely fails mid-analysis | 1 / 0 / 0 | Input retained; durable terminal-error/final/error result with `plugin_identity_unavailable`, state `result-ready`, not cancellation. |
| Constructor canonical failure, raw | 0 / 0 / 0 | No guest initialization. Existing conservative queued/transform-unknown record retains raw input and prevents automatic replay; no fabricated final result. |
| Constructor canonical failure, prepared | 0 / 0 / 0 | No guest initialization; processed input retained and durable terminal error recorded. |
| Duplicate MARP names at start | 0 / 1 / 1 | No guest session or initialization; one ambiguity notice precedes main and stored answer. |
| Loaded selected provider invalidated, prepared | 1 / 0 / 0 | The held call is explicitly `fixture-provider`; later dispatch/answer is refused with one notice, without a default-model request. |
| Duplicate selected provider, prepared | 0 / 0 / 0 | Only the separate MARP session loads; provider never registers/initializes, missing-provider guard yields an error. |
| Non-selected provider invalidated | 3 / 1 / 1 | MARP analysis and answer storage remain, with one omitted-context notice. |

All twelve cases pass in the frozen run. Counts distinguish analysis from main, initialization and saved answers. Failed prototype assumptions are retained separately: an interactive trigger remained in the shared seed, patch concurrency uses `calculateHash` rather than HTTP ETag, full save can recache before a missing peek is observed, and raw constructor failure uses the existing transform-unknown record rather than a terminal-result record.

At this checkpoint, raw selected-plugin-model input was refused before provider execution by the preparation/context boundary. Loaded/missing selected-provider controls above therefore qualify the prepared route only; they do not widen raw provider admission or claim the selected raw caller works. The later [experimental.31 raw-provider checkpoint](POCKETRISU-G1-7-RAW-PROVIDER-VALIDATION.md) separately qualifies the stated raw admission/registration scope and retains its remaining activation gates.

## Other gates and evidence scope

- Actual OS host90 and session8 pass. Host tests use in-memory SQLite for permissions/notices and a fixture root writer; they qualify real storage/CAS/check logic, not the canonical persistence queue by themselves. The twelve HTTP cases supply the separate persisted caller evidence. The final extra case verifies two rolled-back cache-miss transactions, one recovery/intent, zero write and a healthy unrelated context.
- Real browser Save→Send, N/N+1 and native retry pass with analysis2/5/5, main1/2/2 and saved answers1/2/1. Original script bytes are unchanged; browser analysis is zero, and normal-chat/journal assertions remain after browser close.
- Original protocol35 and large/timeout/cancel/next-normal13 pass. Happy-path HTTP doubles do not establish TCP cancellation or provider refunds.
- Full server516/12 existing skip, full frontend2296/4 existing skip, compat74/5 existing skip, patcher52 test-file entries, Svelte check0 errors/0 warnings, frontend8022 modules, BG bundle build/load `sendChat=function` pass. No dedicated lint script exists; syntax and diff checks cover the changed CJS/probe files.
- Full graph42 packs/1527 units/7 collisions, re-plan0, exact1022 baseline-file byte/mode revert pass. Installer is7,144,132 bytes / SHA-256 `d9a2c6b6a62f92a3c76eb5e15072d06003dfff010f46bca9310f220274203088`.

Restricted execution produced loopback `listen EPERM` or `spawnSync EPERM` in server/compat/revert commands. The same commands pass with the required runtime execution permission; those restricted runs are not application regression evidence. No assertions, skips or runtime caps were weakened to obtain a pass.

Opus5.5 planning and mid-implementation consultation changed the initial mechanism from queued checks on every call to hot synchronous peek plus cold recovery, and from absolute-index cascade to relative-order checks. It identified normal cache eviction and write-point/teardown consistency gaps; these were corrected and measured before delivery. Final source consultation found no OFF-only delivery blocker and prompted the final cold-cancel and second-eviction omission corrections above. It read targeted source/validation sections, did not read the audits and executed no tests/hashes. Codex's runs are the evidence. A narrow follow-up and delivery are recorded below after completion.

## Remaining gates

Keep raw selected-provider admission/context capture, wider auxiliary caller mappings, oversized handle reuse, real provider conditions and full M7/G1.5b activation distinct. Initialization-dependent registration remains fixed until the next operation. Changes after the final plugin boundary do not imply a new failure notice when no further hook/effect is omitted. Cold fallback uses the existing storage queue; current callers enter it outside guest-held queue work, and synchronous mutator checks avoid reentry. Future APIs must preserve that ordering contract.

G1.8/G1.9 failure/stream remainder, G1.10 physical/aggregate and unchanged official Archive Center G2 remain open. Production stays OFF for this correction; no stable tag/release or broad MARP/device pass is implied.

## Final consultation and safe delivery

Final source consultation and a narrow follow-up inspected the two cold-cancel/repeated-eviction guards after correction, identifying no scoped OFF-delivery blocker. The consultant did not execute tests, calculate hashes or inspect the full audits. Final host90 and eight directly affected HTTP cases pass; the rebuilt installer and complete graph/revert were rechecked. Other full gates above retain their actual runs within the unchanged affected paths.

Runtime/package `7b2854e`, actual caller probes `807c5f9` and qualification documents `fff10fd` were pushed after206-path privacy sweep found no listed identifiers. No production host activation, actual provider test, stable tag or release was performed.

Readonly live idle/hostOFF preceded stop. The verified full-data recovery anchor was rehashed, then a stopped application/patcher-state rollback of91,646,644bytes/1,642files plus12 notification-namespace rows was independently verified. Only the eight planned server/helper/test/state paths changed. Frontend/BG build/load retained database bytes; restart/readback confirms484 managed hashes/modes,175 served JS assets, five database quick checks, unchanged header configuration, operation records103→103/removed0, input records0, active/model/pending0, online/unstable0 and new error lines0. Final state SHA-256 `70f28957901960299b9a0c8c90fe3697c04b105eb2d406150a898e12acf62bc1` identifies this deployment.

No generation was cancelled and no user database was deleted. The OFF-only host correction adds no active UI behavior requiring a new scoped iPhone check; original MARP activation/device and full G1 aggregate gates remain open. Temporary qualification audits remain while those context/admission gates are unresolved. Rollback retention is recorded separately; no `/tmp` or worktree cleanup is implied.

Under the standing work-backup retention rule, the superseded experimental.28 application/patcher/notification snapshot was removed after both archives'1,642file hashes/modes, adapter0.7.35→0.7.36 replacement and absent symlink/open-file references were verified. Recovered91,914,836bytes. The new verified experimental.29 rollback and full-data anchor remain. The older .28 snapshot is no longer available as that historical restore point; no user database, full-data archive, `/tmp` or worktree was deleted.
