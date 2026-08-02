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

The first physical L3 report said Hotkeys were not visible at the documented
Accessibility path. The follow-up source inspection—not the physical
observation itself—found one additional 1.9 route boundary. Official 1.9 shows
Hotkey as a top-level Settings menu item and routes it to index 15, but its
render branch mounted `HotkeySettings` only at widths of at least 768 pixels.
K16's master switch and the native small-screen notice are inside that
component, so neither could mount on iPhone. The 1.9-only adapter now removes
only that outer width condition. The native page's inner `< 768` branch remains
the owner of the small-screen notice and continues to hide the desktop binding
table.

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
- Exact 1.9.0 selects the same four-unit core plus 36 target-scoped adapter
  units: 40 units across 16 source paths. Relative to 1.8.1, the native
  model-preset import/case remain removed, the upstream unload owner is
  delegated through configuration, and one 1.9-only unit exposes the native
  Hotkey route on narrow screens.
- The core and both base/lazy adapters verify exact 1.8.1 and 1.9.0. Each
  adapter unit is scoped to exactly one target version.

## Observed automated gates

### Initial 1.9 qualification

- Before the L3 route correction, K16 contract tests passed the historical
  37/35 adapter split, native model ownership, upstream unload delegation,
  deterministic matching and navigation, pointer cleanup, history cleanup,
  and adapter ETag coverage.
- The then-current exact-1.9 base/toolchain graph resolved 46 units across 18
  source paths with zero collisions. Focused tests passed 2 files / 18 tests;
  the full frontend suite passed 71 files / 1,058 tests plus 3 skips.
- The then-current exact-1.9 lazy+BG/toolchain graph resolved 257 units across
  125 source paths. Its three collisions were the already-declared ordered
  lazy/BG owners; K16 added none. Focused tests passed 3 files / 22 tests; the
  full frontend suite passed 100 files / 1,319 tests plus 3 skips.
- Base diagnostics reported 0 errors and the same four upstream
  `DefaultChatScreen.svelte` accessibility warnings. Lazy+BG diagnostics
  reported 0 errors and 0 warnings. Their production builds transformed
  7,795 and 7,826 modules respectively.
- The BG server suite passed 6 files / 123 tests when localhost listen was
  allowed. The BG bundle rebuilt to 8,157 KB and loaded with `sendChat`
  exposed as a function.
- Both graphs produced zero-change repeated plans, status `current`, and no
  non-current managed file. Exact revert changed 18 source paths for base and
  125 for lazy+BG; both then reported `clean` and zero tracked diff.

These measurements are retained as the initial qualification history and are
not reused as post-correction graph counts.

### Post-L3 route correction

- The K16 patcher test now checks the 37/36 adapter split, 11/12 host split,
  exact-one route anchor, idempotent apply, byte-exact revert, duplicate-anchor
  `ANCHOR_COUNT`, marker-drift `MARKER_DRIFT`, 1.8 exclusion, and preservation
  of the inner narrow-screen branch. The focused file exited 0, and the full
  source patcher suite passed 38/38 files.
- Fresh exact-1.9 graphs measured:
  - `pocketrisu-kei,toolchain-hardening`: 19 packs, 229 units, zero
    collisions, 74 planned paths, and 72 source paths;
  - `pocketrisu-kei,lazy-chat-sync,bg-preserve,toolchain-hardening`: 22 packs,
    448 units, three existing ordered collisions, 181 planned paths, and 179
    source paths; and
  - `--all`: 28 packs, 538 units, five existing ordered collisions, 219
    planned paths, and 217 source paths.
- Each graph applied successfully, produced a zero-change repeated plan and
  `current` standalone status, then reverted to `clean`, zero patch files, and
  zero tracked diff. An accidental same-target concurrent status attempt was
  refused with `PATCH_LOCKED`; the standalone status checks after each plan
  passed and are the recorded state observations.
- The exact `--all` target passed 2 focused files / 18 tests, the full client
  suite at 128 files / 1,533 tests, the localhost-enabled server suite at 9
  files / 163 tests, diagnostics at 0 errors / 0 warnings, and the production
  build at 7,857 transformed modules. The first restricted server run exited
  1 because socket-owning tests received `listen EPERM` on `127.0.0.1`; the
  unchanged permitted rerun is the passing server result.
- The first copied target inherited a stale `node_modules` symlink and
  produced sandbox `EROFS` and non-interactive purge failures. It was excluded
  from build evidence. A new tracked-only exact-1.9 clone with no dependency
  directory completed frozen installation, reusing 485 packages and
  downloading zero; `msgpackr-extract` fell back from its Node 25 prebuilt
  probe to a successful local native build.
- The exhaustive verifier passed all 2,048 raw selections and 1,024 normalized
  graphs, with 222 catalog-managed paths, maximum 538 units, and complete
  round trips in 873,623 ms with two workers. Source CLI `--all`, fixed-profile
  installer `--all`, and generic installer `--all` agreed on 28 packs, 538
  units, five collisions, and 219 planned paths.

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
- top-level Hotkey menu routing, settings-search routing, narrow-screen
  component mount, master toggle, native small-screen notice, and desktop
  binding-table exclusion;
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
- **Initial composition and installation — observed target gates.** The
  pre-correction base and lazy+BG graphs passed focused/full tests,
  diagnostics, builds, zero-change replans, current status, and exact tracked
  restoration. Post-correction owner-absent/present and maximum graphs are
  recorded above. Exact 1.8 selects only its historical units.
- **Hotkey route — complete native-owner read plus applied-source inspection.**
  The top-level button and Settings Search both select native route 15. On
  official 1.9 the outer render branch rejected narrow screens before
  `HotkeySettings` mounted. The 1.9-only unit removes that condition, while
  the applied page retains the existing `DBState.db.enableHotkeys` binding,
  the inner `< 768` notice, and the desktop-only binding table. It adds no
  timer, listener, request, plugin-array write, database schema, or alternate
  setting state.
- **Route composition — owner-absent/present graphs plus exhaustive verifier.**
  The route unit follows its K16 page-toggle prerequisite. With Personal
  Settings present, the same-file pair is commutative and the optional
  `personal-settings:settings-render` ordering adds no collision; without that
  owner, the edge is ignored. Base and lazy adapters remain mutually
  exclusive, and exact 1.8 selects no route unit.

### Phase 3 — triage

- **Q3, resolved:** the duplicate 1.9 model-preset import/case is absent, and
  one upstream unload owner plus one K16 same-page owner remain.
- **Q3, fixed after the first physical report and source inspection:** official
  1.9's outer width guard made the K16 master switch and native small-screen
  notice unreachable on iPhone. The owner-local 1.9 route unit removes only
  that outer guard; focused, composed, target, exhaustive,
  installer-equivalence, idempotency, and exact-revert gates passed.
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
- **Q4, queued for the aggregate corrected-bundle re-L3 batch:** the current
  live candidate is the pre-correction 537-unit build. The user chose to finish
  other first-pass L3 rows and collect findings before one later authorized
  aggregate apply/restart. On that candidate, iPhone must show the master
  switch and small-screen notice at the top-level Settings → Hotkey route. No
  physical pass is inferred from the local render/build gates.

## Concrete iPhone L3

1. Open the top-level Settings → Hotkey page (설정 → 단축키). Confirm the
   master switch and small-screen notice. With an external keyboard if
   available, exercise
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
4. Under Settings → Accessibility → Others, enable “Prevent Back Navigation
   on Mobile,” interact once, and use the Safari/PWA Back gesture. Confirm one
   same-page stop without a loop or data mutation. Disable it and confirm the
   K16 entry is removed and does not rearm, while PocketRisu's ordinary
   page-exit confirmation remains its native behavior.

Duplicate shortcut execution, navigation from a protected control/modal,
selection of a trashed/reserved character, more than one K16 Back stop, or a
guard that rearms after disable is the unsafe signal.

The initial qualification performed no live apply or restart. A later
authorized aggregate candidate was applied for L3. The user's missing-menu
report then triggered the source inspection that identified the route defect.
This correction rebuilt local installers but has not been applied to the live
PocketRisu tree and did not restart it. It is retained as the first item in the
user-selected aggregate fix/re-L3 batch. No push, tag, release, or publication
occurred.
