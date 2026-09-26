# PocketRisu 1.9 Kei K15 partial-edit validation

## Scope and ownership decision

K15 is qualified on exact PocketRisu 1.9.0 as a target-scoped extension of
the native partial-edit and K14 streaming-render owners.

Official 1.9 adds one relevant behavior to its existing per-message
`PartialEditController`: the controller is not mounted while
`isOptimizedStreamingMessage` is true. It does not add K15's screen-level
manager, exact chat/message/data/DOM identity, stale-target cancellation, or
translation-cache issue-token/key/data validation.

The exact-1.9 adapter therefore preserves the native optimized-stream gate
through every K15 disabled/context/save path and removes the per-message
controller only after K14 has supplied that reactive state. K15 remains one
screen-level manager. It also retains official 1.9's
`overscroll-y-contain` class on the `DefaultChatScreen` root instead of
replacing the native root binding.

The original 1.8.1 adapter remains unchanged. The older behavior, audit, and
full identity/cache contract are recorded in
`docs/POCKETRISU-KEI-K15-VALIDATION.md`.

## Retained K15 outcomes

- `enableBlockPartialEdit` and `enableDragPartialEdit` remain default-off and
  gate the manager and translation bridge listeners;
- the manager captures selected character/page, chat ID and object, message
  index/ID/object/data, active swipe, chat/body DOM, and translated state as
  one target;
- chat switch, reorder, object replacement, data change, disconnected or
  reused DOM, edit/translation transition, and active optimized streaming
  invalidate the target instead of redirecting an edit;
- block hover and selected-text flows retain bounded matching, explicit
  candidate choice, delete confirmation, keyboard handling, scroll/reset,
  and symmetric listener/observer cleanup;
- original-message save mutates only the issued object and active swipe,
  then uses the existing `ReloadChatPointer` and root save owner;
- translated editing never falls back to the original message. It requires
  the exact issued token, cache key, prior cache data, current identity, and
  translated state before and after asynchronous reads;
- cache persistence failure retains the editor input and attempts the
  existing best-effort in-memory rollback without claiming an atomic
  cross-tab compare-and-swap;
- base and BG adapters change only ordered host anchors. K15 adds no request,
  generation, result/claim/ACK, cancellation, database, lazy-hydration,
  filesystem, or plugin-array owner.

## Dual-target graph

- The common core is version `0.2.0`, contains four isolated-file units, and
  verifies exact 1.8.1 and 1.9.0.
- Each base/BG adapter is version `0.2.0` and contains 14 historical 1.8.1
  units plus 14 exact-1.9 units. Every adapter unit is scoped to exactly one
  target version.
- Both targets retain the K14 dependency. On 1.9, the K15 root and streaming
  anchors are ordered after `kei-chat-render`'s exact-1.9 reactive metadata
  units.
- Exact 1.8.1 planning selected 40 resolved units across 12 source paths,
  zero collisions, and no unit whose ID ends in `:1.9`.

## Observed automated gates

- K15 patcher contracts passed for both verified targets, the 14/14 adapter
  split, exclusive target matching, native optimized-stream reuse, retained
  overscroll, K14 ordering, base/BG ownership, translation bridge behavior,
  and adapter ETag coverage.
- The exact-1.9 base/toolchain focus graph resolved 43 units across 15
  managed source paths with zero collisions. Focused frontend tests passed 3
  files / 25 tests; the full frontend suite passed 72 files / 1,065 tests
  plus 3 skips.
- The exact-1.9 lazy+BG/toolchain focus graph resolved 254 units across 122
  managed source paths. Its three collisions were the already-declared
  ordered lazy/BG owners; no K15 unit participated. Focused tests passed 4
  files / 29 tests; the full frontend suite passed 101 files / 1,326 tests
  plus 3 skips.
- Base diagnostics reported 0 errors and the same four upstream
  `DefaultChatScreen.svelte` accessibility warnings. Lazy+BG diagnostics
  reported 0 errors and 0 warnings.
- Both production builds completed: 7,795 modules for base and 7,826 modules
  for lazy+BG.
- The first base full-suite attempt omitted `toolchain-hardening` and exposed
  Node 25's present-but-incomplete global `localStorage`, causing 83 existing
  Gemini-cache test failures. A direct focused replay reproduced that harness
  defect. Adding the already-qualified toolchain pack supplied the target's
  test setup and the recorded full suite passed; no K15 product assertion was
  weakened.
- Both applied graphs reported `current`; repeated plans produced zero
  changes. Exact revert changed 15 source paths plus two private patcher files
  for base and 122 source paths plus two private patcher files for lazy+BG.
  Both then reported `clean` and zero tracked diff. The lazy+BG build left two
  untracked generated bundle artifacts outside patch ownership; they are not
  reported as revert drift.
- The patcher suite passed all 30 test files. `node --check` passed for both
  manifests and the focused contract test, and `git diff --check` passed.

The exhaustive aggregate selection gate remains deferred until K11 and K12
are rebased. No aggregate result is inferred from these focused graphs.

## L2.5 runtime audit

### Phase 1 — flat discovery

- screen root, selected chat/page, current messages, conditional manager
  mount, settings, and base/lazy/BG bootstrap ordering;
- per-message root/body identity, data attributes, native controller removal,
  K14 reactive metadata, optimized-stream transitions, and local reload;
- document mouse movement, animation-frame hover hit testing, selection
  debounce, range endpoints, scroll, resize, outside mouse-down, dialogs,
  keyboard handling, and body-level controls;
- message/chat/index/ID/object/data/DOM identity, active swipe, translated
  state, mutation observation, and stale-target reset;
- bounded Markdown match candidates, original mutation, render revision,
  existing root save observation, and lazy/BG root owners;
- translation context issuance, display-derived cache key, cache reads,
  token/key/data/identity validation, persistent write, rejection, rollback,
  and rerender;
- display parsing and callbacks used by the existing translation key path;
- listener, observer, timer, copied-string, range, DOM-reference, and
  screen-lifetime resource bounds;
- target selection, ordered composition, transaction state, repeated plan,
  status, and exact revert.

### Phase 2 — external-anchor resolution

- **Native partial-edit ownership — complete host read plus applied-source
  inspection.** Official 1.9's only K15-overlapping addition is
  `!isOptimizedStreamingMessage` around its per-message controller. The
  applied exact-1.9 graph removes that controller and carries the same K14
  state through the shared-manager disabled flag and translation bridge.
  The native screen overscroll class remains present.
- **K14 lifecycle — exact ordered mapping plus focused/full gates.** K15's
  root, generation-state, and chat-body units follow K14's exact-1.9 reactive
  metadata units. Optimized streaming disables a current target and
  invalidates issued translation context; when optimization is inactive,
  ordinary upstream edit availability remains unchanged.
- **Manager and settings — component tests plus applied host.** One
  screen-level manager replaces per-message controllers. Its document
  listener set is conditional, setting defaults stay off, effect cleanup is
  symmetric, and no second manager is introduced by the BG graph.
- **Identity and mutation — adversarial component tests.** Object, data, and
  connected DOM identity are all required; an equal index or equal text is
  insufficient. Stale chat/message/render transitions cancel rather than
  mutating the newly current object. Original saves still flow through the
  target's existing render and durable-save owners.
- **Translation cache — issued-context tests plus existing cache-owner read.**
  Save accepts only the exact issued token/key/data and current
  chat/message/DOM/render identity. It recomputes and rereads before writing,
  never falls back to the original message, and handles forward and rollback
  rejection without an unhandled rejection. The existing cache writer stays
  the storage owner.
- **Authority preservation — graph and prohibited-path contracts.** K15
  touches no generation/request/BG result, database replacement, lazy
  hydration, filesystem, logging, credential, or plugin-array path. The
  three composed collisions remain the previously qualified lazy/BG ordered
  owners.
- **Composition and installation — observed target gates.** Base and
  lazy+BG focus graphs passed tests, diagnostics, builds, current status,
  zero-change repeated plans, and exact tracked restoration. Exact 1.8
  planning selected only historical units.

### Phase 3 — triage

- **Q3, resolved:** the native per-message controller is absent after K15,
  the shared screen manager remains, and optimized-stream suppression is
  preserved through the K14-owned state.
- **Q3, resolved by observed gates:** dual-target matching, K14 ordering,
  base/lazy+BG composition, diagnostics, builds, idempotence, and tracked
  restoration passed.
- **Q4, prepared surface:** translation cache checking is not an atomic CAS
  across concurrent tabs or writers. Revisit on a stale translated edit that
  overwrites a newer cache value despite all issued key/data checks.
- **Q4, prepared surface:** `setLLMCache` mutates memory before durable
  persistence and rollback is best effort. Revisit on forward or rollback
  failure that leaves memory and persistent cache observably divergent.
- **Q4, prepared surface:** display-derived key computation can execute the
  target's parsing, Lua/display triggers, plugin callbacks, and regex work.
  Revisit on duplicate side effects during translated partial editing.
- **Q4, prepared surface:** long unmatched Markdown, many rendered messages,
  or high-frequency subtree mutations can increase iOS main-thread work.
  Revisit with measured input/observer frequency rather than interaction
  impressions alone.
- **Q4, pending device observation:** Safari selection handles, virtual
  keyboard and viewport movement, dialogs, scrolling, and physical pointer
  hover remain for consolidated L3.

## Concrete iPhone L3

1. In Settings, leave both partial-edit settings off and confirm ordinary
   full-message edit and translated display still behave normally. Enable
   block partial edit, then drag partial edit separately and together.
2. On an original response, use block controls and a selected range to edit
   and delete. Exercise one exact match, multiple matches with explicit
   choice, and unmappable text. Confirm only the chosen message and its active
   swipe change.
3. Open an edit, then switch chat, reorder or reroll the message, change its
   text externally, begin optimized streaming, and toggle translated/original
   display. Each stale interaction must close or refuse save without changing
   the newly current message.
4. With LLM translation active, edit translated text and confirm only that
   cache entry changes. Missing context or a stale key/data pair must not fall
   back to original-message mutation. Repeat while lazy chat and BG streaming
   are active and after returning from background.
5. Repeat in a long chat while streaming, scrolling, rotating, opening the
   virtual keyboard, and dismissing dialogs. If a pointer is available,
   confirm hover controls do not multiply. Disable both settings and confirm
   controls/listeners stop while ordinary edit remains usable.

A stale edit reaching another message/cache entry, original mutation from a
translated edit, controls that survive disable/chat switch, duplicated
manager actions, or loss of native optimized-stream suppression is the unsafe
signal.

## Partial physical observation

The user later reported the instructed mobile section normal as one batch and
does not use a computer. Desktop pointer-hover behavior is therefore not
exercised. Because the report did not separately identify translated,
multiple/unmappable, stale-identity, active-stream, and stress subcases, this
receipt records a scoped mobile batch observation rather than expanding each
subcase to an independent pass.

The aggregate candidate containing K15 was previously committed, pushed, and
safely live-admitted as recorded in the aggregate receipt. No K15 code change,
tag, release, or publication followed this physical observation.
