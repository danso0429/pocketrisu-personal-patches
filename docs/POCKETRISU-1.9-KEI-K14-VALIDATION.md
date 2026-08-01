# PocketRisu 1.9 Kei K14 streaming render validation

## Scope and decision

K14 is qualified on exact PocketRisu 1.9.0 as a focused extension of the
native streaming renderer, not as a copied renderer.

Official 1.9 now owns the larger and better implementation:

- `off`, `balanced`, and `strong` display modes;
- response coalescing in the generation path;
- stable mounting of the active final character message;
- imperative raw-text/mode updates on the mounted `Chat`;
- raw unparsed display in strong mode;
- edit and partial-edit suppression while optimized streaming is active.

The 1.9 K14 adapter keeps that owner and adds only the outcomes still absent:

- require a live generation in addition to persisted chat streaming state;
- make optimized-stream lifecycle and local reload suppression explicit in
  the native hash while retaining every structural identity field;
- pass changing message text and generation metadata through the native
  `updateStreamingDisplay()` API;
- keep global GUI reloads while suppressing only the active message's local
  reload key;
- defer auto-translation and translated/retranslate paths until optimized
  streaming ends.

The native `off` mode remains off: K14 does not force stable mounting or
translation deferral when the user disables upstream display optimization.

## Dual-target graph

- Exact 1.8.1 retains the original 20-unit base/BG adapters and the two-unit
  pure core. A fresh exact-1.8 plan selected 22 units, only 1.8 units, six
  source paths, and zero collisions.
- Exact 1.9.0 selects a new 16-unit adapter across the same four chat hosts
  plus the unchanged two-unit core. The 1.9 adapter contains no `mount(Chat)`,
  replacement mount-entry type, or second component registry.
- The core and both adapter manifests explicitly verify exact 1.8.1 and
  1.9.0. Unlisted targets remain rejected by the catalog boundary.

## Observed gates

- Patcher contract tests passed 30/30. Static assertions separate the 20
  exact-1.8 units from the 16 exact-1.9 units and reject a copied native mount
  owner in the latter.
- The exact-1.9 base/toolchain graph resolved 25 units across 9 managed files
  with zero collisions. Focused tests passed 1 file / 7 tests; the full
  frontend suite passed 70 files / 1,047 tests plus 3 skips.
- The exact-1.9 BG/toolchain graph resolved 205 units across 94 managed files
  with zero collisions. Focused render/BG tests passed 3 files / 28 tests;
  the full frontend suite passed 92 files / 1,232 tests plus 3 skips.
- The BG server suite's first restricted run failed only because localhost
  listen returned `EPERM`. The same suite with local-listen permission passed
  4 files / 99 tests.
- Base diagnostics reported 0 errors and the same four upstream
  `DefaultChatScreen.svelte` warnings. BG diagnostics reported 0 errors and
  0 warnings.
- The first base diagnostic found an invalid HTML marker between Svelte
  component attributes. Moving the marker after the component close removed
  the parse error; every reported result above is from the corrected source.
- Both production builds completed successfully. The BG orchestration bundle
  rebuilt to 8,088 KB and its load check exposed `sendChat` as a function.
- Both graphs produced zero-change repeated plans, status `current`, and no
  non-current managed file. Empty-selection revert changed 10 files for base
  and 95 for BG, including private patch state; both then reported `clean`
  and zero tracked diff.

The final exhaustive dual-target catalog gate remains deferred until all Kei
children and K12 are rebased. No aggregate result is inferred here.

## L2.5 runtime audit

### Phase 1 — flat discovery

- global/per-preset streaming choice, chat `isStreaming`, active display mode,
  live generation state, selected chat, last character message, and lifecycle
  entry/exit;
- native balanced/strong coalescing, raw display, mount registry, imperative
  update API, hash identity, component removal, and destroy cleanup;
- message text, generation model/token/timing reference, swipe/reroll state,
  portrait, disabled state, chat ID, index, and reload pointers;
- global GUI reload, per-message reload, reactive parsing, Markdown promise
  overlap, raw strong-mode display, translation/cache calls, and post-stream
  translation eligibility;
- BG client/server busy handoff, persisted streaming state, recovered chat,
  conflict copy, claim/ACK/reconnect/cancel, and no-resurrection behavior;
- `off` preference, cross-chat activity, stale persisted state, 32-bit hash
  collision, browser scroll anchoring, Safari layout, timers, listeners,
  storage, network, and installation lifecycle.

### Phase 2 — external-anchor resolution

- **Native rendering ownership — complete-host read plus static contract.**
  Official 1.9 retains its performance-mode calculation, coalesced generation
  writes, mount registry, exported update method, strong raw renderer, and
  cleanup. The 1.9 K14 units replace no `mount(Chat)` block and add no second
  registry or generation owner.
- **Live lifecycle identity — pure helper tests plus applied source.** K14
  combines the native mode/last-message selection with character role, chat
  streaming, and the active generation store. Its hash removes only changing
  text and the local reload value while active and includes the lifecycle
  boolean; chat ID, index, portrait, disabled, swipe, and reroll identity stay
  visible. The `off` mode never produces an active optimized message.
- **Reactive content and metadata — applied API path plus compile/full tests.**
  The existing `updateStreamingDisplay()` call now carries the original
  `generationInfo` reference. The mounted `Chat` updates raw text, bindable
  message text, mode, and that reference without copying it, so later token
  and timing metadata are not disconnected.
- **Reload/translation preservation — helper tests plus host read.** Global
  GUI reload remains in the ChatBody key; only the optimized message's local
  pointer becomes zero. Strong mode retains raw display. Balanced mode keeps
  Markdown parsing but does not enter auto-translation or translated/
  retranslate work for partial text; normal translation becomes eligible
  after lifecycle exit/remount.
- **BG composition — ordered graph plus focused/full BG gates.** The BG
  adapter remains ordered after existing `Chat` and `DefaultChatScreen`
  owners. Its combined busy store covers client/server handoff; result claim,
  exact ACK, durable save, recovery, and cancellation remain outside K14.
- **Resources and side effects — structural.** K14 adds no fetch, socket,
  credential, database write, storage call, timer, listener, filesystem
  handle, HTML sink, or retry loop. Native component unmount/destroy cleanup
  remains unchanged.
- **Installation — measured round trip.** Exact-1.9 base and BG graphs had
  zero collisions, zero-change replans, current status, and exact tracked
  restoration. Exact 1.8 selected only its historical units.

### Phase 3 — triage

- **Q3, resolved:** the 1.8 copied mount owner is excluded from 1.9; the
  adapter is a 16-unit delta over official rendering.
- **Q3, resolved by observed gates:** target selection, focused/full tests,
  diagnostics, production builds, BG bundle load, and both transactional
  round trips passed after the Svelte marker correction.
- **Q4, prepared surface:** the active generation store is process-wide. A
  selected chat with stale `isStreaming` while another chat owns the active
  lease could still satisfy the combined predicate; revisit on a cross-chat
  stale-render signal.
- **Q4, prepared surface:** native identity remains a signed 32-bit hash and
  balanced mode can have overlapping Markdown promises. K14 does not claim
  collision freedom, parse ordering, or lower parse CPU.
- **Q4, pending device observation:** physical Safari scroll anchoring,
  visible flicker, background handoff, and post-stream translation remain for
  consolidated iPhone L3.

## Concrete iPhone L3

1. Set streaming display optimization to Balanced. Start a long streamed
   reply, scroll several messages upward, stop touching the screen, and
   confirm the viewport is not reset for each chunk. Return to the bottom and
   confirm one message grows without duplicated/missing text or whole-message
   flicker.
2. Repeat with Strong and confirm raw partial text becomes the normal rendered
   final reply when streaming ends. Then set optimization Off and confirm the
   explicit upstream opt-out still behaves as before.
3. With auto-translation enabled, confirm partial balanced/strong text is not
   repeatedly translated and the completed reply returns to the configured
   translation flow with model/token metadata still visible.
4. During a separate BG-preserve generation, background the PWA and return
   after completion. Confirm one final reply, cleared streaming/busy UI, no
   duplicate mount/flicker, and normal reroll/swipe/edit behavior afterward.

A stuck raw view, missing generation metadata, repeated partial translation,
scroll reset per chunk, duplicate reply, or busy state that does not clear is
the unsafe signal.

No live apply, restart, push, tag, release, or installer rebuild was performed.
