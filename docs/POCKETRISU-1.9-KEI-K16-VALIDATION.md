# PocketRisu 1.9 Kei K16 mobile navigation validation

## Scope and ownership decision

K16 is qualified on exact PocketRisu 1.9.0 as a target-scoped extension of
the native hotkey and navigation owners.

Official 1.9 now supplies three outcomes that the original 1.8.1 adapter also
patched:

- adjacent-character navigation stops at both sorted-list boundaries;
- the model-preset shortcut imports and toggles `openModelPresetList`;
- `preload.ts` installs the application-wide `beforeunload` confirmation.

The exact-1.9 adapter therefore drops its duplicate store import and
`modelSelect` case, keeps the native adjacent-character block as the host,
and replaces only that block with the existing K16 helper so trashed and
reserved characters remain excluded. It configures the K16 history guard with
`ownsBeforeUnload: false`; the upstream page-exit owner remains installed
once, while K16 owns only its opt-in same-page history entry.

The 1.9 setting text now describes that narrower behavior as “Prevent Back
Navigation on Mobile” and explicitly says that PocketRisu's built-in page-exit
confirmation remains unchanged. Exact 1.8.1 retains its original wording,
37-unit adapter, and K16-owned unload fallback.

## Retained K16 outcomes

- one master switch covers configurable keyboard shortcuts and related
  shortcut gestures without erasing saved bindings;
- shortcut matching is non-mutating, requires exact Ctrl/Alt/Shift state, and
  rejects Meta; missing DOM targets fall through without consuming the event;
- native model-preset behavior is retained rather than copied on 1.9;
- previous/next character navigation filters trash and the temporary Realm
  and Playground sentinels while retaining upstream boundary behavior;
- text inputs, textareas, contenteditable regions, controls, links, draggable
  targets, legacy alerts, and document dialogs block whole-view gestures;
- pointer down/up/cancel and multi-pointer cleanup are initialized once and
  remain bounded to the declared mobile navigation ranges;
- the opt-in Back guard waits for user activation, creates at most one
  same-page entry, reports one failed arm per enable cycle, and removes only
  its own entry when disabled;
- base/startup-cache and lazy-chat bootstrap adapters initialize K16 only
  after their respective storage owner is ready.

## Dual-target graph

- Exact 1.8.1 selects the unchanged four-unit core plus 37 historical adapter
  units: 41 units across 15 source paths, no 1.9 unit, and zero collisions.
- Exact 1.9.0 selects the same four-unit core plus 35 target-scoped adapter
  units. The two-unit reduction is the native model-preset import/case; the
  upstream unload owner is delegated through configuration rather than
  duplicated.
- The core and both base/lazy adapters verify exact 1.8.1 and 1.9.0. Each
  adapter unit is scoped to exactly one target version.

## Observed automated gates

- K16 contract tests passed, including the 37/35 unit split, native model
  ownership, upstream unload delegation, deterministic matching and
  navigation, pointer cleanup, history cleanup, and adapter ETag coverage.
- The exact-1.9 base/toolchain graph resolved 46 units across 18 source paths
  with zero collisions. Focused tests passed 2 files / 18 tests; the full
  frontend suite passed 71 files / 1,058 tests plus 3 skips.
- The exact-1.9 lazy+BG/toolchain graph resolved 257 units across 125 source
  paths. Its three collisions were the already-declared ordered lazy/BG
  owners; K16 added none. Focused tests passed 3 files / 22 tests; the full
  frontend suite passed 100 files / 1,319 tests plus 3 skips.
- Base diagnostics reported 0 errors and the same four upstream
  `DefaultChatScreen.svelte` accessibility warnings. Lazy+BG diagnostics
  reported 0 errors and 0 warnings.
- Both production builds completed: 7,795 modules for base and 7,826 modules
  for lazy+BG.
- The BG server suite passed 6 files / 123 tests when localhost listen was
  allowed. The BG bundle rebuilt to 8,157 KB and loaded with `sendChat`
  exposed as a function.
- Both graphs produced zero-change repeated plans, status `current`, and no
  non-current managed file. Exact revert changed 18 source paths for base and
  125 for lazy+BG; both then reported `clean` and zero tracked diff.

The final exhaustive aggregate selection gate remains deferred until K15,
K11, and K12 are rebased. No aggregate result is inferred from these focused
graphs.

## L2.5 runtime audit

### Phase 1 — flat discovery

- base and lazy bootstrap/hydration order, idempotent initialization, hotkey
  master state, stored bindings, exact modifier matching, Meta, editable
  targets, missing DOM targets, and duplicate bindings;
- native model-preset import/case, previous/next character sorting, trash and
  sentinel filtering, empty selection, and both boundaries;
- textarea popup editing, contenteditable, Ctrl-drag, triple-touch, pointer
  down/up/cancel, multi-pointer state, swipe distance/direction, navigation
  ranges, native controls, links, draggable targets, alerts, and dialogs;
- mobile/desktop platform detection, user activation, `pushState`,
  `popstate`, failed arm, disable cleanup, destroy cleanup, and application
  `beforeunload`;
- settings persistence, base/startup-cache ordering, lazy hydration, combined
  lazy/BG owners, listener lifetime, browser history policy, and installation
  round trip.

### Phase 2 — external-anchor resolution

- **Upstream ownership — complete host read plus applied-source inspection.**
  Official 1.9's `openModelPresetList` import/case and corrected
  adjacent-character boundaries remain present. K16 adds no marked duplicate
  model case. Official `preload.ts` remains the only generic unload owner,
  and the exact-1.9 bootstrap configures the K16 guard not to register one.
- **Initialization and storage — ordered graph plus focused/full gates.**
  K16 initializes after the selected base or lazy bootstrap and is
  idempotent. It adds no database replacement, network call, plugin-array
  write, or storage owner.
- **Shortcut and character behavior — pure helper tests plus applied host.**
  Matching does not mutate saved objects, rejects Meta, and consumes a
  shortcut only when its action succeeds. Character navigation keeps native
  bounds while filtering trash and reserved entries.
- **Pointer behavior — deterministic helper tests plus listener inspection.**
  One initialized listener set tracks pointers, clears on cancel, and ignores
  controls/editors/links/draggable targets and open modal states. Navigation
  is limited to declared view ranges.
- **History behavior — focused guard tests plus ownership configuration.**
  The guard waits for activation, creates one same-page state, retries a
  failed arm only after a new enable cycle, removes only its own state, and
  never calls `location.assign`, `location.replace`, or `history.go`.
  The common core defaults to K16-owned unload handling for 1.8.1; 1.9
  delegates that effect to the upstream owner.
- **Composition and installation — observed target gates.** Base and lazy+BG
  graphs passed focused/full tests, diagnostics, builds, zero-change replans,
  current status, and exact tracked restoration. Exact 1.8 planning selected
  only its historical units.

### Phase 3 — triage

- **Q3, resolved:** the duplicate 1.9 model-preset import/case is absent, and
  one upstream unload owner plus one K16 same-page owner remain.
- **Q3, resolved by observed gates:** exact target selection, both composed
  graphs, diagnostics, builds, idempotence, and transactional restoration
  passed.
- **Q4, prepared surface:** another same-page history owner can bury the K16
  marker. Revisit if disabling the setting causes more than one Back stop or
  a loop.
- **Q4, prepared surface:** Safari user-activation and `pushState` policy can
  refuse or skip an entry. K16 logs one failure per enable cycle and retains
  upstream page-exit confirmation, but does not claim universal Back
  interception.
- **Q4, prepared surface:** listeners are application-global for the page
  lifetime. Revisit on duplicate gesture execution after hot reload or
  bootstrap re-entry.
- **Q4, pending device observation:** physical iPhone/PWA Back gestures,
  Safari controls, pointer cancellation, virtual keyboard interaction, and
  hardware-keyboard shortcuts remain for consolidated L3.

## Concrete iPhone L3

1. Open Settings → Accessibility → Hotkeys. Confirm the master switch and
   small-screen notice. With an external keyboard if available, exercise
   Ctrl+M, Ctrl+[ / Ctrl+], and Ctrl+X. Confirm Meta or extra modifiers do not
   match; disable the master switch and confirm the actions stop without
   erasing their bindings, then re-enable it.
2. With mobile GUI enabled, swipe from empty space through the declared home
   and selected-character views. Repeat from text fields, contenteditable
   text, buttons, links, draggable items, and an open Alert/dialog; none of
   those starts should move the underlying view. Interrupt a swipe, add a
   second pointer, and confirm no delayed navigation occurs.
3. Use previous/next character shortcuts at both ends of the sorted list and
   around trashed or reserved characters. Confirm no wrap, sentinel selection,
   or accidental Realm/Playground transition.
4. Enable “Prevent Back Navigation on Mobile,” interact once, and use the
   Safari/PWA Back gesture. Confirm one same-page stop without a loop or data
   mutation. Disable it and confirm the K16 entry is removed and does not
   rearm, while PocketRisu's ordinary page-exit confirmation remains its
   native behavior.

Duplicate shortcut execution, navigation from a protected control/modal,
selection of a trashed/reserved character, more than one K16 Back stop, or a
guard that rearms after disable is the unsafe signal.

No live apply, restart, push, tag, release, or installer rebuild was performed.
