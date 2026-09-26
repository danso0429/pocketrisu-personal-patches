# PocketRisu 1.9 Kei K11 HypaMemory manual-tools validation

## Scope and ownership decision

K11 is qualified on exact PocketRisu 1.9.0 as a target-scoped extension of
the native HypaMemory modal and existing summary-generation/storage owners.

Official 1.9 now owns two outcomes that the 1.8.1 adaptation had to correct:

- `processMessageForPreview` always applies CBS and gates only optional
  `editprocess` scripts on the preset setting; summary-item reroll uses it;
- modal search invalidates on active-filter changes, excludes hidden
  summaries, and safely handles missing rendered targets.

The exact-1.9 adapter leaves that function, summary-item host, and filtered
search code unchanged. It adds only K11's missing manual workflow,
deterministic frontier, manual-panel CBS/generation helpers, corrected
complete/orphaned next-target handling, and localized UI wiring.

The original 1.8.1 behavior and deeper selection/persistence contract are
recorded in `docs/POCKETRISU-KEI-K11-VALIDATION.md`.

## Retained K11 outcomes

- a localized, pressed-state manual-mode button coexists with native search,
  category, tag, edit, bulk resummary, reset, and automatic Hypa behavior;
- one contiguous unsummarized prefix is derived from the selected greeting,
  current messages, and last summary; missing, duplicate, orphaned, or
  ambiguous IDs block unsafe selection rather than restarting at the start;
- filtered manual rows retain hidden predecessors in the selected prefix;
- selection and results are bound to exact character/chat/greeting, summary
  frontier, preset reference/signature, process-regex setting, and every
  relevant message reference/ID/role/data value;
- preprocessing is sequential, guards duplicate same-turn activation, uses
  the existing CBS/editprocess owners, and rechecks identity after every
  await;
- preview, exact-input reroll, cancel, stale refusal, and explicit apply add
  at most one current summary without rewriting prior summaries;
- the footer reports a complete frontier as no target and an
  orphaned/ambiguous frontier as an error. On 1.9 its preview delegates to
  native `processMessageForPreview`;
- K11 continues to call only the target's existing `summarize(input)` and
  reactive chat-save path. It adds no provider, request, Revenant, BG
  operation/result/claim/ACK/cancel, database, filesystem, or plugin-array
  owner.

## Dual-target graph

- The common core is version `0.2.0`, contains four isolated-file units, and
  verifies exact 1.8.1 and 1.9.0.
- Each base/BG adapter is version `0.2.1`. It contains 20 historical 1.8.1
  units and 18 exact-1.9 units; every adapter unit is scoped to exactly one
  target version.
- The two-unit 1.9 reduction removes K11's old summary-item import/call
  replacement because native summary reroll already uses the corrected
  preview owner.
- Exact 1.8.1 planning selected 24 resolved units across 11 source paths,
  zero collisions, and no unit whose ID ends in `:1.9`.

## Observed automated gates

- K11 patcher contracts passed for both verified targets, the 20/18 adapter
  split, exact target matching, exclusive base/BG adapters, native-preview
  reuse, absence of 1.9 summary-item replacement, manual/frontier ownership,
  prohibited generation/storage authorities, and ETag participation.
- The exact-1.9 base/toolchain focus graph resolved 29 units across 13
  managed source paths with zero collisions. Focused frontend tests passed 2
  files / 21 tests; the full frontend suite passed 71 files / 1,061 tests
  plus 3 skips.
- The exact-1.9 lazy+BG/toolchain focus graph resolved 240 units across 122
  managed source paths. Its three collisions were the already-declared
  ordered lazy/BG owners; no K11 unit participated. Focused tests passed 3
  files / 25 tests; the full frontend suite passed 100 files / 1,322 tests
  plus 3 skips.
- Base diagnostics reported 0 errors and the same four upstream
  `DefaultChatScreen.svelte` accessibility warnings. Lazy+BG diagnostics
  reported 0 errors and 0 warnings.
- Both production builds completed: 7,795 modules for base and 7,826 modules
  for lazy+BG.
- The first sandboxed server-suite run was not a product result: localhost
  `listen` returned `EPERM`, causing hook timeouts. With test localhost access
  allowed, the same server suite passed 6 files / 123 tests.
- The BG bundle rebuilt to 8,158 KB and loaded with `sendChat` exposed as a
  function.
- Both applied graphs reported `current`; repeated plans produced zero
  changes. Exact revert changed 13 source paths plus two private patcher files
  for base and 122 source paths plus two private patcher files for lazy+BG.
  Both then reported `clean` and zero tracked diff.
- The patcher suite passed all 30 test files. `node --check` passed for both
  manifests and the focused contract test, and `git diff --check` passed.

The exhaustive aggregate selection gate remains deferred until K12 is
rebased. No aggregate result is inferred from these focused graphs.

## Aggregate L3 marker finding and remediation

During the later aggregate iPhone session, K11 did not reach its manual-tools
behavioral checks. The modal rendered the adapter's `header-manual-button`
ownership start/end strings as visible text, and the user reported that the
same pattern was not isolated to one marker. Applied-source inspection found
that K11's `header-manual-button` and `modal-panel-close` units inserted Svelte
markup through generic JavaScript-style wrappers.

Commit `1d53f58` changes only those two adapter units to exact Svelte managed
blocks with HTML comments and advances the adapter to `0.2.1`. The manager now
rejects future likely-markup `.svelte` units that omit an exact managed block.
K11 selection, generation, persistence, provider, and storage ownership are
unchanged. The correction passed focused contracts, the 38-file patcher suite,
the 542-unit exhaustive verifier, disposable apply/replan/exact revert, full
live client/server tests, diagnostics, build, and a compiled production scan
with zero `POCKETRISU-PATCH:` strings. The canonical installer is in
`fd60890`; the complete receipt is
`docs/POCKETRISU-1.9-SVELTE-MARKER-SAFETY-VALIDATION.md`.

The correction is live. K11 remains physical re-L3 pending: client reload,
absence of visible ownership text, and the concrete manual Hypa workflow below
must still be observed. No K11 behavior is inferred from automated admission.

## L2.5 runtime audit

### Phase 1 — flat discovery

- native preview helper, summary-item reroll, filtered search, existing modal
  management surface, and K11 manual-mode coexistence;
- greeting/no-summary/message-summary frontiers, full-chat ID counts,
  complete/orphaned/ambiguous states, selectable prefix, hidden filtered
  predecessors, and next-target display;
- character/chat/greeting, summaries/final memos, preset reference/signature,
  process-regex state, message object/ID/role/data, selection, and result
  identity;
- synchronous activation guard, sequential CBS/editprocess preprocessing,
  summary request, exact-input reroll, close/destroy, stale results, cancel,
  and apply;
- native `summarize` provider/custom/local routing, BG request ownership,
  supported background delivery, and non-aborted provider lifetime;
- one summary-array push, reactive save observation, save retry, array null
  serialization, and reload durability;
- modal height, list/search scrolling, touch rows, virtual keyboard, rotation,
  background suspension, request cost, long chats, and preset serialization;
- target selection, ordered composition, transaction state, repeated plan,
  status, exact revert, tests, diagnostics, builds, and bundle load.

### Phase 2 — external-anchor resolution

- **Native 1.9 overlap — complete host diff plus applied-source inspection.**
  `processMessageForPreview` remains byte-owned by upstream and
  `modal-summary-item.svelte` still imports/calls it. The visible-summary
  search guard and safe optional DOM lookups remain in the applied modal.
  No exact-1.9 K11 unit targets the summary-item host or search functions.
- **Frontier and prefix — helper tests plus applied footer.** The helper
  recomputes the complete chat ID domain, distinguishes complete,
  orphaned, ambiguous, missing, and duplicate states, and exposes only one
  contiguous selectable prefix. Footer routing uses that frontier and native
  preview rather than falling back to the greeting.
- **Context and operation — adversarial component tests.** Exact reference,
  ID, content, preset signature, final-memo, and full-frontier checks run
  before work and after every await. A same-turn second activation is
  coalesced; disable/destroy invalidates late UI ownership; reroll receives
  the captured input rather than recomputing changed callbacks.
- **CBS and configured scripts — host/helper read plus focused tests.** The
  new manual panel keeps its synchronous display CBS helper and sequential
  generation helper with role/index/`rmVar`/`firstmsg` context. Existing
  native preview stays responsible for summary-item/footer rendering.
  Configured script side effects that occur before a later stale check remain
  an explicit external-owner limitation.
- **Generation and BG authority — call graph plus composed gates.** K11 calls
  only existing `summarize`; it contains no endpoint, fetch, socket,
  Revenant, BG operation/result/cancel, or provider unit. The lazy+BG focused
  generation-state test, full suites, server suite, production build, and
  bundle load retained the existing owner graph.
- **Mutation and persistence — component test plus existing owner read.**
  Preview and cancel do not mutate. One guarded apply pushes one summary and
  relies on the active chat's reactive save/retry path; K11 does not claim an
  immediate durable commit or introduce a second writer.
- **Composition and installation — observed target gates.** Base and
  lazy+BG graphs passed target tests, diagnostics, builds, current status,
  zero-change repeated plans, and exact tracked restoration. Exact 1.8
  planning selected only historical units.

### Phase 3 — triage

- **Q3, resolved:** the 1.9 duplicate preview correction is absent. Native
  filtered search and summary-item reroll remain while K11 adds only its
  manual/frontier delta.
- **Q3, resolved by observed gates:** dual-target selection, frontier and
  stale-state contracts, base/lazy+BG composition, diagnostics, builds,
  server/bundle checks, idempotence, and restoration passed.
- **Q4, prepared surface:** closing K11 invalidates late UI delivery but does
  not abort the existing `summarize` request. Revisit on a late preview/apply;
  provider cost after close remains the recorded non-abort limitation.
- **Q4, prepared surface:** configured `editprocess` callbacks can perform an
  intended side effect before a later stale check. Revisit on duplicate or
  misdirected effects; skipping configured processing is not a same-effect
  fix.
- **Q4, prepared surface:** full-chat frontier reads, preset serialization,
  long selected prefixes, provider limits, and summary growth depend on real
  data. Revisit with measured chat/input/cost rather than a fixed guessed cap.
- **Q4, prepared surface:** apply relies on the existing non-awaited reactive
  persistence owner. Revisit if an applied summary disappears after ordinary
  save and reload; adding a K11 writer is not the default repair.
- **Q4, prepared provider surface:** the preserved BG owner does not imply
  every custom/local/provider memory route completes in background. Each
  route needs its own observed claim.
- **Q4, pending device observation:** Safari touch selection, modal scroll,
  virtual keyboard, rotation, suspension/return, and supported-provider
  background completion remain for consolidated L3.

## Concrete iPhone L3

1. Open HypaMemory and confirm native search, category, tag, edit, bulk
   resummary, reset, and automatic-memory behavior in normal mode. Filter the
   list, search, and reroll one existing summary to confirm the native 1.9
   preview/search fixes remain.
2. Enter manual mode. Confirm bulk resummary cannot overlap it and the list,
   search, count, preview, and action controls fit and scroll in the modal.
3. Select a later eligible row and confirm all earlier eligible rows form the
   prefix. Search for a later row, select it while predecessors are hidden,
   and confirm those hidden predecessors remain included.
4. Generate one preview, reroll once, then cancel. Confirm no summary is
   added. Generate again and apply; confirm exactly one summary is added and
   the footer advances. A fully summarized chat must report no next target,
   while missing/duplicate/orphaned identity must block or show an error.
5. Start work, then change chat, greeting, selected message, final summary,
   duplicate ID, or Hypa preset. The result must become stale and refuse
   apply. Close manual mode during another request and confirm a late result
   does not reappear or apply, although the underlying request may finish.
6. With first-message CBS and configured `editprocess`, confirm displayed and
   generated input use the intended context without duplicate callbacks.
   Repeat in the longest available chat while scrolling, opening the virtual
   keyboard, rotating, and closing/reopening the modal.
7. With lazy+BG and the actually configured supported memory route, start
   one manual summary, background the PWA, and return. Confirm one result, no
   Revenant/new-chat insertion, and no duplicate request; do not generalize
   that result to an untested provider route.
8. After apply and ordinary save activity, reload PocketRisu and confirm the
   one new summary persists.

Sparse selection, silent restart from an orphaned frontier, stale apply,
duplicate preprocessing/request, native search/reroll regression, more than
one summary mutation, or a Revenant/new-chat result is the unsafe signal.

The original K11 qualification above did not perform a live mutation. The
later marker-safety correction was committed, pushed, rebuilt, safely
live-applied, and restarted as recorded in its separate receipt. No tag,
release, paid request, or physical K11 re-L3 was performed during that update.

The user later chose not to perform the full HypaMemory workflow because it is
not practical in their current use, preferring to report a concrete problem if
one appears during ordinary use. This is recorded as not exercised. It does
not confirm marker absence or convert the earlier interrupted attempts and
live corrections into a K11 pass.
