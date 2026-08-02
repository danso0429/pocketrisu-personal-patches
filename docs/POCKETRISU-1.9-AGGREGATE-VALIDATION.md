# PocketRisu 1.9 post-overlap aggregate validation

## Scope and boundary

This receipt requalifies the local PocketRisu patch catalog on exact official
PocketRisu 1.9.0, commit
`85a65f3137b45c8de4a8d21a9887be213b1ac3fc`, after the
overlap-equivalence-authorized follow-up implementation.

`pocketrisu-kei` 0.12.0 is a unit-free umbrella with ten hidden children: the
original K19, K13, K14, K16, K15, K11, and K12 children plus bounded K04-F01,
K17-F01, and K26-F02 children. K23-F01, K27-F01, K29-F05, and K22-F01 P04-P06
extend their existing selected owners rather than becoming parallel children.
K29-F02 G06 has a complete blocker/matrix receipt and no runtime unit.

The former aggregate commit `2991355` remains historical baseline evidence.
Its pack, unit, managed-path, installer, and test numbers are not reused as
post-overlap results.

`verified` here means exact-target source, graph, automated behavior, build,
and exact-revert qualification. It does not mean publication-qualified: the
consolidated feature-by-feature iPhone L3 remains. No live apply, live patch
state or user-data change, PocketRisu restart, push, tag, or release occurred.

That sentence records this receipt's implementation-time boundary. A later,
separately authorized live candidate admission and the still-pending physical
results are recorded in `docs/POCKETRISU-1.9-AGGREGATE-L3.md`.

## Provenance and preserved state

- The exact official source archive SHA-256 remains
  `cba5851498a398fbe5f416573712465d24eb4b90d9ed0a3d7708f03f330bda69`.
- All target work used disposable copies or the proved-pristine exact source.
  The live PocketRisu tree remained on its existing pristine 1.9.0 state.
- The preserved K12 worktree stayed at
  `081a32ba4ae27c8f25f1719ef90406504a490928`. Its index listing SHA-256 stayed
  `632b6d3285e85650be19efe5c4f6c70a3af56fdec683fc9a5a182505118704b3`
  and its cached binary diff SHA-256 stayed
  `916440ab240e0f7541844f0082ce53d1d5f516d08ea1bdfc79a55149d7ca66a9`.
- User-owned dirty STATUS/HANDOFF hunks were not staged into feature commits.

## Admitted follow-up outcomes

| Audit recommendation | Final authority and result |
| --- | --- |
| K04-F01 | Hidden exact-1.9 native-normalizer child. Non-null `.role2` wins; otherwise frozen typed `.role` is normalized one way for persona/description/author-note/memory. Lorebook is excluded. |
| K17-F01 | Hidden exact-1.9 native-theme child. Invalid load, preset-activation, and runtime CSS values become `standard`; the three official values and API validation remain native. |
| K23-F01 | `bg-preserve` keeps canonical `types[]`; disjoint directions merge while any overlapping direction starts another canonical row and preserves execution multiplicity. |
| K27-F01 | The BG server fetch bridge delivers the existing native request-log batch to `requestLogs.addRequestLogBatch`; native toggle, masking, caps, byte budget, content-free usage, and failure isolation remain authoritative. |
| K26-F02 | Hidden core plus exactly one standard/lazy adapter requires a verified fresh snapshot before three destructive restore paths. Failure stops; only a target-bound, five-minute, one-use, explicitly confirmed retry may proceed after another failed snapshot attempt. |
| K29-F05 | `bg-preserve` retains unconsumed terminal results for 48 hours under 128 rows and 256 MiB. Active/live-claimed work is protected; durable delivered state, exact-revision ACK, and idempotency remain authoritative. |
| K29-F02 G06 | No runtime change. The provider/request-class matrix proved the blocking reroll/continue caller's typed target, browser epilogue, cancel rollback, and exact-once mutation cannot be represented safely by the append-oriented BG contract. |
| K22-F01 P04-P06 | `persona-organizer` adds picker name/note search, Folder/Unfiled filters with canonical indices, and selected-folder create/import. Invalid folder scope falls back without dropping personas. P07 duplicate is excluded. |

Detailed purpose, trigger, state/result, preservation, revert, tests, and L2.5
evidence remain in each feature receipt and the implementation ledger.

## Resolved graphs

| Graph | Compatibility | Resolved packs | Units | Ordered collisions | Planned paths | Source paths |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `pocketrisu-kei,toolchain-hardening` | verified | 19 | 228 | 0 | 73 | 71 |
| `pocketrisu-kei,lazy-chat-sync,bg-preserve,toolchain-hardening` | verified | 22 | 447 | 3 | 180 | 178 |
| `--all` | verified | 28 | 537 | 5 | 219 | 217 |

The three composed collisions preserve the declared lazy-before-BG order on
`globalApi.svelte.ts`, `server.cjs`, and plugin chat access. The maximum graph
also contains:

- lazy server replacement before `persona-organizer`'s 1.9 gallery-asset
  extension; and
- `persona-organizer` folder-interface before its persona folder field.

All five are explicit ordered pairs. No unordered collision was accepted.
`startup-cache` is intentionally superseded by `lazy-chat-sync` in `--all`.
Base/BG, base/lazy, and standard/lazy K26 resolution selected exactly one
applicable adapter in each graph.

The catalog contained 37 packs, 11 of them user-selectable. The umbrella ETag
was `ed1063cd05724923139b556d20edc6791b729aee03022ace405f669a4e7113e2`.

## Exhaustive selection and round-trip gate

The complete exact-1.9 catalog produced this observed result:

```json
{
  "compatibility": "verified",
  "rawSelections": 2048,
  "verifiedSelections": 2048,
  "normalizedGraphs": 1024,
  "managedPaths": 222,
  "maximumResolvedUnits": 537,
  "roundTrips": "passed",
  "workers": 2
}
```

Every reachable selection completed first plan/apply, current status,
zero-change repeated plan, empty-selection revert, and managed byte/mode
snapshot comparison.

## Maximum-target automated gates

A fresh disposable exact-1.9 target received ordinary source-CLI `--all`.
Frozen dependency installation completed with pnpm 10.34.1, reusing all 485
resolved packages. The optional `msgpackr-extract` prebuilt probe failed under
Node 25, then its documented local native fallback compiled successfully;
installation exited 0.

Observed gates on the applied maximum graph:

- client tests: 128 files and 1,533 tests passed;
- server tests: 9 files and 163 tests passed;
- Svelte diagnostics: 0 errors and 0 warnings;
- production frontend build: 7,857 modules transformed, exit 0; and
- BG orchestration bundle: 8,200 KB, builder exit 0, `sendChat=function` load
  check passed.

The first combined server run inside the restricted sandbox exited 1: two
socket-owning files could not `listen` on `127.0.0.1` (`EPERM`) and timed out.
The server suite was rerun unchanged with localhost permission and produced the
9-file/163-test passing result above. The sandbox failure is recorded as an
environment restriction, not omitted or relabelled as a code pass.

Source patcher tests passed 38/38 after the final K22 payload. Feature receipts
add their focused adversarial counts and baseline reproductions; the aggregate
numbers above are the fresh maximum-graph observations.

## Status, idempotency, and exact revert

After maximum apply, status reported `current` for 28 packs and all 217
transaction-managed source paths. A repeated `--all` plan retained 537 units
and five collisions, changed zero paths, and skipped all 217. Reapply likewise
changed zero paths.

Empty-selection revert changed the 217 source paths plus patch state and
intent, and status returned `clean`. An independent post-revert SHA-256/mode
comparison across all 222 catalog-managed paths against the pristine exact
source reported zero mismatches. Dependency and frontend build output plus the
two BG bundle products were outside patch ownership and were not used to make
the exact-revert claim.

## Deterministic generated installers

Only `scripts/build-installers.cjs` through `npm run build` regenerated
`dist/`. Two consecutive builds produced identical sizes and SHA-256 values;
all four files passed `node --check`:

| Installer | Bytes | SHA-256 |
| --- | ---: | --- |
| `pocketrisu-patcher.cjs` | 5,083,789 | `b00001943284a4c8af6c288c2ca94d111ad61a06417fe5ecd5451ea19e6dbcbd` |
| `pocketrisu-features.cjs` | 5,083,795 | `a80914f806ae37299afaaedd4a4fca49ca18f7e6aae10c7c4b4252ce2be39b08` |
| `pocketrisu-hardening.cjs` | 5,083,796 | `bc0b358cfbf95e9e23c8c374b37b2927aba81ae4289c7aa614178039dafee631` |
| `pocketrisu-all.cjs` | 5,083,790 | `640c8f94faf832474f75c7c5cb10c1c99268a9ae3de584c74b09fa0b25e99dca` |

Source CLI `--all`, fixed-profile `pocketrisu-all.cjs`, and generic
`pocketrisu-patcher.cjs --all` each returned compatibility `verified`, 28
resolved packs, 537 units, five ordered collisions, 219 planned paths, and the
same umbrella version/ETag.

## L2.5 aggregate runtime audit

### Phase 1 — flat discovery

- target compatibility, hidden-child expansion, direct hidden selection, and
  future-version refusal;
- exact adapter exclusivity and the five ordered same-file compositions;
- initial apply, status, repeated plan/apply, revert, state/intent, bytes,
  modes, and generated-installer provenance;
- native `.role2` precedence and exclusion of lorebook role semantics;
- theme load/preset/runtime normalization without widening API validation;
- regex import multiplicity without new identity or grouping state;
- BG request-log toggle, credential masking, body caps, 256 MiB rotation,
  content-free usage, and generation failure isolation;
- fresh snapshot uniqueness, throttle bypass, three restore callers, lazy
  journal transaction, bounded retry tokens, original disk/size guards, and
  double confirmations;
- result TTL, rows, bytes, active/live-claim protection, browser marker,
  tombstone, durable delivered state, exact ACK, and cleanup ordering;
- provider override, custom/local/plugin endpoints, blocking reroll/continue,
  browser epilogue, swipe target, cancellation, and exact-once limits for G06;
- picker search, folder scope, Unfiled/orphan fallback, canonical indices,
  async import DB refresh, PersonaBind callback, save, normalization,
  referential cleanup, and asset cleanup;
- existing K19/K13/K14/K16/K15/K11/K12 child behavior and lazy/BG/storage
  composition;
- timers, listeners, controllers, sockets, requests, database rows, retained
  payloads, in-memory tokens, DOM rows, build output, and cleanup paths; and
- iOS swipe, VoiceOver, focus, keyboard, background/kill/reload, picker taps,
  restore dialogs, request-log visibility, and real persistence.

### Phase 2 — external-anchor resolution

- **Target and graph — measured.** Source and generated installers agreed on
  exact 1.9 verification and the 537-unit maximum graph. The exhaustive gate
  round-tripped all 2,048 raw selections and 1,024 normalized graphs.
- **Same-file ownership — plan plus target gates.** Only the five declared
  ordered collisions appeared. The maximum applied graph passed client/server
  tests, diagnostics, both builds, current status, idempotency, and exact
  managed-path comparison after revert.
- **K04/K17/K23 — focused tests plus native-owner read.** Native role/theme and
  canonical regex schemas remain the write authorities. Unsupported aliases,
  invalid themes, and overlapping import directions were tested at their
  actual normalization/import boundaries; excluded broad/lorebook/UI paths
  have no units.
- **K27 — native transaction and negative path tests.** BG delivery invokes the
  same already-open request-log owner. The native capture toggle remains
  before the POST; masking/caps/rotation and content-free usage remain in its
  single transaction; parse/write failure stays best effort. No second DB,
  platform badge, row-delete API, or independent policy was added.
- **K26 — adversarial route and transaction tests.** All three callers require
  a newly verified snapshot, target-bound token retries are capped at 128 and
  expire after five minutes, and lazy DB replacement/journal deletion share
  the native transaction. Existing disk/size guards and two confirmations
  remain ahead of destructive work.
- **K29 retention — measured policy and adversarial cleanup tests.** The
  selected 48-hour/128-row/256-MiB bounds were based on recorded live KV/event
  and result/journal sizes in the feature receipt. Active/live-claimed rows may
  temporarily exceed pressure targets and become evictable only after
  protection ends. ACK remains immediate. Browser marker and tombstone ledgers
  remain bounded at 128.
- **G06 — complete blocker matrix.** No hosted-provider subset was inferred
  safe from provider name alone. Continue can keep message count unchanged;
  reroll owns browser-local swipe/comment mutation; native job recovery does
  not reconstruct that epilogue; classic custom/local/plugin routes do not
  share one server-safe transport. No runtime change was admitted.
- **K22 — focused tests, independent review, and build.** Filtered entries keep
  canonical indices and share ordinary/PersonaBind selection. Independent
  review found and closed a stale-DB/index race across async asset work. The
  final picker adds no second identity/schema or broad database/plugin write.
- **Destructive and plugin boundaries — negative search.** The delta adds no
  `setDatabase({plugins})`, `setDatabaseLite({plugins})`, whole-plugin-array
  replacement, unconfirmed destructive restore, persona duplicate, or new
  privacy/usage policy.
- **Resources — bounded or trigger-local.** K26 tokens are five-minute/128;
  K29 rows, bytes, TTL, markers, and tombstones are bounded as above; K22
  filtering is a trigger-local array scan. No new background queue, recurring
  request, socket owner, or unbounded follow-up collection was admitted.
- **Environment — prepared, not inferred.** Automated gates establish the
  deterministic code paths. iOS suspension, VoiceOver/focus, real restore
  archive contents, provider timing, and overnight return remain observable
  surfaces rather than being called passed.

### Phase 3 — triage

- **Q3, fixed:** stale async persona import DB/index; lazy snapshot/journal
  non-atomicity; BG request-log in-process delivery; regex same-direction
  multiplicity; invalid theme/legacy role normalization; and result retention
  bounds.
- **Q3, deliberately blocked:** K29 G06 has no safe owner-local composition in
  the current request/result schema. Its exact callers and missing operation
  contract are recorded; the other approved features continued.
- **Q3, resolved by observed gates:** graph exclusivity, ordered composition,
  focused/complete tests, diagnostics, frontend/BG builds, current/reapply,
  exact revert, exhaustive combinations, and deterministic installers.
- **Q4, consolidated iPhone L3:** the concrete scenarios below remain. They
  block aggregate acceptance and publication, not these local commits.

## Future consolidated iPhone L3

The separately authorized aggregate-candidate session has now started. Record
its admission and each feature result independently in
`docs/POCKETRISU-1.9-AGGREGATE-L3.md`; the scenarios below remain the acceptance
authority until their observed rows close.

1. **K19 viewer swipe and VoiceOver.** Open a middle image, swipe once in each
   direction and verify exactly one image movement; at each boundary verify no
   drift. With VoiceOver, verify image/count, previous/next, and close labels,
   44-pixel controls, modal focus containment, and focus return to the opener.
2. **K29 bounded overnight ordinary result.** Start a paid ordinary BG
   generation, leave the PWA absent overnight without consuming the result,
   return to the same chat, and verify one completion, one materialization,
   and ACK cleanup with no duplicate or missing paid response.
3. **K29 existing G09 cold reroll.** Start the already qualified cold-reroll
   path, background then kill/reload the PWA, return to the same chat, and
   verify exactly one overwrite at the intended existing message/swipe target,
   with zero appended duplicate. This does not claim the blocked standard
   non-Gemini G06 path.
4. **K22 picker.** Search once by persona name and once by note; use Folder and
   Unfiled scopes; select through ordinary and PersonaBind callers; create and
   import disposable personas into a folder; cold-start and verify membership.
   Delete a disposable selected folder before a stale picker action and verify
   create/import falls back to Unfiled without hiding or reindexing personas.
5. **K26 restore safety.** On a disposable backup target only, walk local-file,
   server-file, and snapshot restore through both original confirmations and
   verify a newly timestamped snapshot exists before each destructive write.
   Force one snapshot failure, verify restore stops, then explicitly confirm
   the one-use same-target retry and verify wrong-target/replayed approval is
   refused. Do not use existing user backups as destructive fixtures.
6. **K27 BG native logging.** With request logging enabled, issue one
   disposable BG request and verify one masked native request row plus one
   content-free usage row. Disable the toggle, issue another request, and
   verify neither row is added while generation still completes.
7. **Existing children.** Execute the concrete K13 provider stream, K14
   background render/scroll, K16 hotkey/back gesture, K15 partial edit, K11
   Hypa manual summary, and K12 translation/cache cancellation scenarios from
   their individual 1.9 receipts. A combined session does not merge or omit
   their separate observations.

Wrong viewer movement/focus, missing or duplicate materialization, wrong
reroll target, lost persona/binding, restore without a fresh snapshot,
reusable/wrong-target bypass, unmasked content, log-toggle leakage, or any
original-child regression is the unsafe signal.

## Remaining gates

1. Run and record the consolidated iPhone L3 scenarios above and the individual
   child receipts without collapsing their results.
2. Resolve any finding in its owning feature/infrastructure commit and rerun
   the affected focused and aggregate gates.
3. Only after L3 and a separate authorization decide whether to push, tag,
   release, apply to live PocketRisu, or restart it.
