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

That sentence records this receipt's implementation-time boundary. Later,
separately authorized live admissions, physical findings, their K16/BG
corrections, and the final 538-unit live update are recorded in
`docs/POCKETRISU-1.9-AGGREGATE-L3.md`. The current local and live graph now
contains both corrections plus `toolchain-hardening` 0.1.3. The BG focused
receipt is `docs/POCKETRISU-1.9-BG-COMPOSER-VALIDATION.md`; the Node warning
correction is `docs/POCKETRISU-1.9-TOOLCHAIN-HARDENING-VALIDATION.md`.

## Provenance and preserved state

- The exact official source archive SHA-256 remains
  `cba5851498a398fbe5f416573712465d24eb4b90d9ed0a3d7708f03f330bda69`.
- During the original aggregate qualification recorded by this provenance
  section, all target work used disposable copies or the proved-pristine exact
  source, and the live PocketRisu tree remained on pristine 1.9.0. The later
  authorized live candidate is recorded separately in the L3 receipt.
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
| `pocketrisu-kei,toolchain-hardening` | verified | 19 | 229 | 0 | 74 | 72 |
| `pocketrisu-kei,lazy-chat-sync,bg-preserve,toolchain-hardening` | verified | 22 | 448 | 3 | 181 | 179 |
| `--all` | verified | 28 | 538 | 5 | 219 | 217 |

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
  "maximumResolvedUnits": 538,
  "roundTrips": "passed",
  "workers": 2
}
```

Every reachable selection completed first plan/apply, current status,
zero-change repeated plan, empty-selection revert, and managed byte/mode
snapshot comparison.

The final post-toolchain-correction run completed in 880,039.29 ms with two
workers. Recorded
cache diagnostics were composition bypasses 2,050, hits 2,047, misses/stores
2,047; pair-cache entries 2,143, hits 550,945, misses 2,143; pack-ETag hits
58,819, misses 61; and state-encoding hits/misses 2,047/2,047.

## Maximum-target automated gates

A fresh disposable exact-1.9 target received ordinary source-CLI `--all`.
Frozen dependency installation completed with pnpm 10.34.1, reusing all 485
resolved packages. The optional `msgpackr-extract` prebuilt probe failed under
Node 25, then its documented local native fallback compiled successfully;
installation exited 0.

Observed gates on the applied maximum graph:

- client tests: 128 files and 1,533 tests passed;
- server tests: 9 files and 163 tests passed;
- `localstorage-file` warnings in the captured test stderr: 0;
- Svelte diagnostics: 0 errors and 0 warnings;
- production frontend build: 7,857 modules transformed, exit 0; and
- BG orchestration bundle: 8,200 KB with exit 0 and
  `sendChat=function` load check.

The generated main asset was `index-D8mk-Vj1.js`, 1,999,206 bytes, SHA-256
`28c58db88c45497b2255eaa814accbaf8876d78ca977e73ff1d8ef9586808e2d`.
No generated browser JavaScript asset contained the literal `orch-composer`
ownership marker.

The first combined server run inside the restricted sandbox exited 1: two
socket-owning files could not `listen` on `127.0.0.1` (`EPERM`) and timed out.
The server suite was rerun unchanged with localhost permission and produced the
9-file/163-test passing result above. The sandbox failure is recorded as an
environment restriction, not omitted or relabelled as a code pass.

Source patcher tests passed 38/38 after the K16 route correction. Feature
receipts add their focused adversarial counts and baseline reproductions; the
aggregate numbers above are the fresh maximum-graph observations.

## Status, idempotency, and exact revert

After maximum apply, status reported `current` for 28 packs and all 217
transaction-managed source paths. A repeated `--all` plan retained 538 units
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
| `pocketrisu-patcher.cjs` | 5,085,479 | `1354bf1421dbcee72699689e9f008f7a3cb67df9f6e3208b8e5bc2d2766f1c9f` |
| `pocketrisu-features.cjs` | 5,085,485 | `6e510ab64319fb596bcb148b55079e61ce0bda2355b755e4e39983c0d57a6a2d` |
| `pocketrisu-hardening.cjs` | 5,085,486 | `c4ad2185c3369fe1e5856d0eb48d1d01be0dc508b7309c5037fe0829c76f0a42` |
| `pocketrisu-all.cjs` | 5,085,480 | `bf32c893a2dd2695a0c17a7d557d4a44aeab69fa02c2d8eafdfa37da4ae1547b` |

Source CLI `--all`, fixed-profile `pocketrisu-all.cjs`, and generic
`pocketrisu-patcher.cjs --all` each returned compatibility `verified`, 28
resolved packs, 538 units, five ordered collisions, 219 planned paths, and the
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
- K16 top-level Hotkey route, settings-search route 15, narrow-screen component
  mount, persisted master toggle, inner small-screen notice, desktop binding
  table, exact anchor/marker, and Personal Settings same-file composition;
- BG composer native generation/translation terms, `$orchestrating` placement,
  stop/send branch, server-cancel owner, compiled text nodes, first-anchor
  behavior, pack ETag, and exact revert;
- existing K19/K13/K14/K16/K15/K11/K12 child behavior and lazy/BG/storage
  composition;
- timers, listeners, controllers, sockets, requests, database rows, retained
  payloads, in-memory tokens, DOM rows, build output, and cleanup paths; and
- iOS swipe, VoiceOver, focus, keyboard, background/kill/reload, picker taps,
  restore dialogs, request-log visibility, and real persistence.

### Phase 2 — external-anchor resolution

- **Target and graph — measured.** Source and generated installers agreed on
  exact 1.9 verification and the 538-unit maximum graph. The exhaustive gate
  round-tripped all 2,048 raw selections and 1,024 normalized graphs.
- **Same-file ownership — plan plus target gates.** Only the five declared
  ordered collisions appeared. The maximum applied graph passed client/server
  tests, diagnostics, the post-correction frontend build, current status,
  idempotency, exact managed-path comparison after revert, and a fresh BG
  bundle build/load check.
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
- **K16 route — native owner read, applied target, and break tests.** Official
  1.9 exposes Hotkey as top-level route 15 but formerly gated its component at
  768 pixels, making K16's inner toggle unreachable on iPhone. The 1.9-only
  unit removes only that outer condition. The persisted native toggle, inner
  narrow-screen notice, desktop table guard, 1.8 exclusion, base/lazy adapter
  exclusivity, and Personal Settings composition remain. Duplicate anchors and
  marker drift fail closed; no new state, listener, timer, request, or schema
  was added.
- **BG composer — applied output, compiler, and break tests.** The former 1.9
  anchor included the closing Svelte brace, so its `after` insertion became a
  literal text node. The corrected anchor closes only after `$orchestrating`.
  Applied-output tests cover outside-brace placement, the two native terms,
  idempotency, first-anchor behavior, marker drift, and exact revert; fresh
  focused and maximum builds compiled zero assets containing the literal
  marker. No BG state/result/cancel owner was duplicated.
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
- **Q3, fixed after the first physical report and source inspection:** K16's
  top-level Hotkey page was unreachable on narrow screens because the native
  route guard prevented the component from mounting. The local owner-scoped
  correction passed focused, maximum, exhaustive, generated-installer,
  idempotency, and exact-revert gates.
- **Q3, fixed after the later physical report and source inspection:** the
  exact-1.9 BG composer adapter placed `$orchestrating` after the directive
  brace. The owner-local correction passed applied-output, focused, maximum,
  exhaustive, generated-installer, compiled-asset, idempotency, exact-revert,
  and L2.5 gates.
- **Q3, deliberately blocked:** K29 G06 has no safe owner-local composition in
  the current request/result schema. Its exact callers and missing operation
  contract are recorded; the other approved features continued.
- **Q3, resolved by observed gates:** graph exclusivity, ordered composition,
  focused/complete tests, diagnostics, the post-correction frontend build,
  fresh BG builder load, current/reapply, exact revert, exhaustive
  combinations, and deterministic installers.
- **Q4, consolidated iPhone L3:** the concrete scenarios below remain. K19
  swipe/arrows/boundaries/rotation were reported normal and VoiceOver is
  recorded not exercised by user choice. The later K22 picker search/folder
  controls physically identified the admitted candidate. K16 and the BG
  composer corrections are now admitted in the live 538-unit bundle and
  require their corrected physical reruns in the user's consolidated re-L3
  batch. These physical gaps block aggregate acceptance and publication, not
  the local or live installation gates.

## Future consolidated iPhone L3

The separately authorized aggregate-candidate session has now started. Record
its admission and each feature result independently in
`docs/POCKETRISU-1.9-AGGREGATE-L3.md`; the scenarios below remain the acceptance
authority until their observed rows close.

The first observation reported K19 swipe, arrows, both boundaries, and
rotation normal. VoiceOver was intentionally not exercised; filtering/search,
focus, touch-target measurement, module viewer, and disposable asset mutation
remain open. The later K22 picker search/folder controls physically established
the admitted patched bundle. Source inspection then found K16's narrow-screen
route defect, and a later physical report found the BG composer literal-marker
defect. Both fixes are now present in the separately authorized live 538-unit
bundle. Their physical acceptance is still deferred to the user's consolidated
re-L3 batch, including top-level Settings → Hotkey and the attached/cold BG
composer stop state.

1. **K19 remaining viewer and optional VoiceOver residual.** Swipe, arrows,
   boundaries, and rotation were reported normal but are not yet a marked
   candidate pass. Still verify
   image-only filtering/search, name/count alignment, both close targets,
   module-viewer behavior, modal focus containment/return, and unchanged
   disposable asset mutation. Only if the user later chooses to revisit
   VoiceOver, verify image/count, previous/next, and close labels; otherwise
   retain the explicit not-exercised status.
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

1. Continue and record unresolved first-pass iPhone L3 scenarios on the
   current live 538-unit candidate without collapsing normal observations,
   findings, not-exercised paths, or passes.
2. Run the already-queued K16 top-level Hotkey and BG composer attached/cold
   reruns in the user's later consolidated re-L3 batch; the live update itself
   is complete and does not imply either physical result.
3. Any later finding still requires separate owning feature/infrastructure
   commits, focused graph, exact revert, L2.5, and aggregate gates before a
   further live authorization is considered.
4. Only after the remaining L3 decisions and a separate authorization decide
   whether to push, tag, release, publish, or perform any later live update.
