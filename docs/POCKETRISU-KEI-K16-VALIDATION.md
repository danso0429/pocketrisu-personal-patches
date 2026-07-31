# PocketRisu Kei K16 navigation and hotkey validation

Date: 2026-07-31 KST

## Scope and provenance

This receipt covers K16 from the PocketRisu Kei integration catalog:

- initialize configurable hotkeys only after the target database has loaded
  and normalized;
- add a user-facing hotkey master switch without deleting the saved bindings;
- retain existing shortcut actions and add the missing model-preset action;
- make modifier matching exact, case-insensitive, non-mutating, and
  Meta-aware;
- repair previous/next character boundaries while excluding trashed and
  reserved characters;
- keep the textarea and contenteditable popup-editor paths under the same
  hotkey gate;
- retain triple-touch quick menu and Ctrl-drag scroll behavior under that
  gate;
- harden horizontal mobile navigation around pointer cleanup, interactive
  controls, open modals, and the target's bounded mobile stack values;
- add an opt-in mobile back guard with same-page history state and a
  `beforeunload` fallback.

The adaptation was read against PocketRisu Kei revision
`cc1d1b195babd887577ebf943d5e82f01f58135c`. The focused source change is
`5cfa3c419e566f75554efb65f3fae3847fab53da`
(`feat(ui): improve chat navigation, hotkeys, and mobile back handling`), and
the audited final source paths are:

- `src/ts/hotkey.ts`;
- `src/ts/defaulthotkeys.ts`;
- `src/ts/mobileBackNavigation.ts` and its test;
- the focused `main.ts`, bootstrap, database, hotkey-settings,
  accessibility-settings, and English/Korean language wiring.

The target is pristine PocketRisu 1.8.1 revision
`63832a138c14cc7f11364cf7efdcb61950e7894c`. GPL-3.0 source attribution,
the pinned Kei revision, and the adapted paths are recorded in
`THIRD_PARTY_NOTICES.md`.

This is an adaptation, not a whole-file copy. In particular, the target's
existing storage, startup-cache, lazy-chat hydration, route stores,
generation, plugin, and background-delivery authorities remain in place.

## Ownership and preservation boundary

The meta pack now resolves K16 through three hidden packs:

| Pack | Version | Units | Selection rule | SHA-256 ETag |
| --- | --- | ---: | --- | --- |
| `kei-mobile-navigation-core` | `0.1.0` | 4 | required by `pocketrisu-kei` | `77df8dc09c7468b0f7552e782fb2ef63f5607479e049be30901985de5282dbf3` |
| `kei-mobile-navigation-base-adapter` | `0.1.0` | 37 | core present, `lazy-chat-sync` absent | `df9ee460530257a08f437acd1169e2f62133036d04679afc6268c2ccd7eddc03` |
| `kei-mobile-navigation-lazy-adapter` | `0.1.0` | 37 | core and `lazy-chat-sync` present | `ff26007df8b6c7a2965fba5b74c99390cfd4011528a7ca58a14cadb5059576c8` |

The two adapters conflict, so a resolved graph installs exactly one. The
base adapter is also incompatible with `lazy-chat-sync`; the lazy adapter
requires it. `pocketrisu-kei` is version `0.5.0` and requires the K19, K13,
K14, and K16 cores while continuing to own zero target files.

The core owns exactly four isolated target files:

- `src/ts/keiMobileNavigation.ts`;
- `src/ts/keiMobileNavigation.test.ts`;
- `src/ts/mobileBackNavigation.ts`;
- `src/ts/mobileBackNavigation.test.ts`.

Each adapter touches the same 11 focused hosts:

- `src/main.ts`;
- `src/ts/bootstrap.ts`;
- `src/ts/hotkey.ts`;
- `src/lib/UI/GUI/TextAreaInput.svelte`;
- `src/ts/storage/database.svelte.ts`;
- `src/lib/Setting/Pages/HotkeySettings.svelte`;
- `src/ts/setting/accessibilitySettingsData.ts`;
- `src/lang/en.ts`, `src/lang/ko.ts`;
- `src/lang/help.en.ts`, `src/lang/help.ko.ts`.

K16 does not own `routing.ts`, `DefaultChatScreen.svelte`, chat storage,
generation delivery, result claim/ACK, database replacement, or plugin
arrays. It adds no second character-order schema and does not modify the
target's existing `characterOrder`.

The final preservation review found and corrected these concrete problems
before the gates below:

1. previous/next navigation originally included trashed and reserved
   characters;
2. pointer starts inside nested editable, link, role, draggable, or dialog
   elements could move the screen behind the control;
3. the target's legacy `AlertComp` overlay has no dialog role, so its blank
   area needed an explicit active-alert guard;
4. Meta could accompany an otherwise matching shortcut;
5. the temporary `MobileGUIStack = 100` add-character sentinel could be
   changed by a swipe;
6. repeated initialization could add duplicate mobile gesture listeners;
7. the mobile-back singleton was initially constructible while its setting
   was off;
8. a `pushState` exception could escape, and a later intermediate form could
   retry the exception on every user input;
9. repeated disable calls could queue more than one history cleanup;
10. missing DOM targets could consume a configured action without doing
    anything.

The final code filters the character set, rejects interactive/modal pointer
starts, rejects Meta, bounds mobile indices, makes initialization
idempotent, constructs the back singleton only when needed, limits a
persistent `pushState` failure to one attempt per explicit enable cycle,
guards cleanup, and consumes a DOM shortcut only when its target exists.

## Retained and expected behavior

### Bootstrap and settings

`src/main.ts` still mounts the application and calls `loadData()`, but no
longer calls `initHotkey()` immediately after starting that asynchronous
load. The base bootstrap initializes K16 after database normalization at
`bootstrap.ts:138-159`. The lazy graph initializes it after stub conversion
and plugin loading at `bootstrap.ts:175-209`. The adapter ordering follows
the existing `startup-cache:bootstrap` unit in the base graph and the
`lazy-chat-sync` bootstrap replacement in the lazy graph.

`enableHotkeys` defaults to `true`; `disableMobileBackNavigation` defaults to
`false`. Their database fields are additive. The hotkey page exposes the
master switch and hides, rather than deletes, the binding editor while it is
off. The accessibility setting writes through the target's normal
`SettingCheck` → `setSettingValue` path and calls the back-guard synchronizer
after the actual user change. Existing root-change tracking remains
responsible for persistence and retry.

### Configurable shortcuts

Saved modifiers are read with `?? false` and never written during matching.
The key comparison is case-insensitive. Ctrl, Alt, and Shift must match
exactly, and any Meta modifier rejects the match. Unmodified shortcuts do not
run from an input, textarea, or contenteditable element.

When the master switch is off, configured actions, both popup-editor
listeners, triple-touch quick menu, and Ctrl-drag active-character scrolling
do not run. Outside editable elements, the target's non-configurable Escape
and Enter fallback remains after the configurable action loop. The early
editable-element guard remains unchanged, so those fallbacks are not claimed
inside an active editor.

The existing default bindings include:

- Ctrl+M for the target's already mounted model-preset selector;
- Ctrl+[ and Ctrl+] for previous/next character by display-name order;
- Ctrl+X for the popup editor.

Previous/next selection returns the original database index, stops at both
ends, and skips positive `trashTime`, `§temp`, and `§playground` entries.
For duplicate bindings the first successfully handled action wins. A missing
button or field returns `false`, so a later matching action is still
eligible.

### Mobile pointer navigation

The gesture is initialized once only in the target's existing beta-mobile or
lite path. It records one primary pointer, clears stale state when a new
primary pointer starts, deletes state on `pointerup` or `pointercancel`, and
requires horizontal movement strictly greater than 50 pixels and greater
than the vertical movement.

Pointer starts are rejected for native controls, links, editable and
draggable content, interactive roles, dialog descendants, any active legacy
alert, and an open document dialog. Home navigation is bounded to
`MobileGUIStack` 0–2; selected-character navigation is bounded to
`MobileSideBar` 0–3. Invalid values, including the target's temporary
add-character sentinel 100, are left unchanged.

### Mobile back guard

The setting has no effect on desktop. On mobile/iOS, enabling it creates one
singleton and installs bounded `popstate`, activation, and `beforeunload`
listeners. A same-page marker is armed only after user activation, merges
existing object-valued history state, and is restored after a back
navigation while enabled.

Disabling removes `beforeunload` immediately and walks back once only when
the guard marker is currently on top. `cleanupPending` prevents duplicate
walk-backs and prevents the resulting `popstate` from immediately restoring
a disabled guard. A failed `pushState` is caught, warns once, retains the
unload fallback, and does not retry until a deliberate disable/enable cycle.

Another target owner can place a history entry above the marker. In that
case disabling cannot safely remove the buried marker without also removing
the other owner's entry. The next Back can therefore stop once on the same
page before a second Back leaves. This is recorded as prepared surface S2
rather than being hidden behind a universal “exact cleanup” claim.

## Patcher checks and deterministic installers

`npm test` passed all 26 patcher tests after the final fixes.

All four generated installers passed `node --check`. Two consecutive builds
produced identical sizes and SHA-256 values:

| Installer | Bytes | SHA-256 |
| --- | ---: | --- |
| `pocketrisu-patcher.cjs` | 2,884,040 | `14cf596b6d7ab810a7c4c6336795442d54f46dbfba98ca51176a96cad9568466` |
| `pocketrisu-features.cjs` | 2,884,046 | `e4cf77e97731e2c2680b9018ece6a5d5071fc92df23568f4313c402781ae9834` |
| `pocketrisu-hardening.cjs` | 2,884,047 | `5f16eea1129aa4de65bbd3f04e91478bfd409ea92fedddadb97044dea0587cb9` |
| `pocketrisu-all.cjs` | 2,884,041 | `5865e04e385c6bee3f08b54e29e1c7cb919145151d8845467724d4c500d6708c` |

Resolver and static contract tests cover core absence, exactly one base/lazy
adapter, conflicts, unit ownership, prohibited authority changes, ETag
participation, and pinned attribution.

## PocketRisu 1.8.1 target checks

No live PocketRisu tree was modified or restarted.

The pristine bare target itself observed:

- 2 failed and 59 passed files;
- 83 failed, 841 passed, and 3 skipped tests;
- both failed files stopped in setup on
  `localStorage.clear is not a function`.

The two K16 target graphs observed:

| Target | Test files | Tests |
| --- | --- | --- |
| `pocketrisu-kei` without toolchain hardening | 2 failed, 66 passed | 83 failed, 884 passed, 3 skipped |
| `pocketrisu-kei` + `toolchain-hardening` | 68 passed | 967 passed, 3 skipped |
| `pocketrisu-kei` + `bg-preserve` + `lazy-chat-sync` without toolchain hardening | 2 failed, 97 passed | 83 failed, 1,169 passed, 3 skipped |
| `pocketrisu-kei` + `bg-preserve` + `lazy-chat-sync` + `toolchain-hardening` | 99 passed | 1,252 passed, 3 skipped |

The bare failures remained the same two
`googleGemini.test.ts`/`geminiContextCache.test.ts` setup failures and the
same 83 tests as pristine. K16 does not hardcode around them; the separately
selected `toolchain-hardening` pack supplies the target test-storage
polyfill.

A correctly scoped focused run covered the 17 K16 tests together with the
already admitted K19, K13, and K14 tests. It passed 7 files and 43 tests in
both target graphs.

Final diagnostics and builds observed:

| Target | Diagnostics | Production build |
| --- | --- | --- |
| `pocketrisu-kei` + `toolchain-hardening` | 0 errors, 4 existing `DefaultChatScreen.svelte` accessibility warnings | Exit 0 |
| `pocketrisu-kei` + `bg-preserve` + `lazy-chat-sync` + `toolchain-hardening` | 0 errors, 0 warnings | Exit 0 |

Both builds retained the target's existing dynamic-import, plugin-timing,
and large-chunk warnings. The composed bg-preserve bundle builder produced
`server/node/bgOrchBundle.mjs` at 8,119 KB, and its own load check observed
`sendChat=function`. The existing KaTeX quirks warning remained.

## Apply, repeat, composition, and exact revert

Fresh disposable targets observed:

| Flow | Initial changed files | Current managed files | Second plan | Reapply | Revert changed files |
| --- | ---: | ---: | --- | --- | ---: |
| `pocketrisu-kei,toolchain-hardening` | 35 | 34 | 0 changes | `changed: false` | 36 |
| `pocketrisu-kei,bg-preserve,lazy-chat-sync,toolchain-hardening` | 138 | 137 | 0 changes | `changed: false` | 139 |

The one extra revert change in each row is the empty custom-selection intent.
Both post-apply statuses reported every managed file `current`. Both reverts
ended with zero requested packs, zero managed status files, and a zero-change
follow-up plan.

After excluding the patch manager's private intent/state and build/dependency
directories, an rsync checksum/mode/target comparison found no difference
from pristine PocketRisu 1.8.1 in the base target. The composed target
retained only an empty `src/ts/vendor/` parent directory. It contained no
file or symlink.

The final exhaustive combination verifier observed:

```json
{
  "target": {
    "packageName": "pocketrisu",
    "packageVersion": "1.8.1"
  },
  "compatibility": "verified",
  "visiblePacks": [
    "bg-preserve",
    "character-import-ux",
    "character-organizer",
    "lazy-chat-sync",
    "parser-hardening",
    "persona-organizer",
    "personal-settings",
    "pocketrisu-kei",
    "preset-integrity",
    "startup-cache",
    "toolchain-hardening"
  ],
  "rawSelections": 2048,
  "verifiedSelections": 2048,
  "normalizedGraphs": 1024,
  "managedPaths": 176,
  "maximumResolvedUnits": 383,
  "roundTrips": "passed",
  "workers": 2,
  "compositionCache": {
    "bypasses": 2050,
    "hits": 2047,
    "misses": 2047,
    "stores": 2047
  },
  "pairAnalysisCache": {
    "entries": 818,
    "hits": 213710,
    "misses": 818
  },
  "packEtagCache": {
    "hits": 38361,
    "misses": 39
  },
  "stateEncodingCache": {
    "hits": 2047,
    "misses": 2047
  },
  "timingsMs": {
    "apply": 167656.48,
    "initialPlan": 153546.9,
    "repeatedPlan": 99092.48,
    "revertApply": 155809.91,
    "revertPlan": 68506.14,
    "snapshot": 15845.97,
    "status": 50882.97,
    "total": 711404.75
  }
}
```

That verifier exercises initial plan, transactional apply, zero-change
re-plan and reapply, current status, empty-selection revert, and exact
managed byte/mode restoration for every raw selection. It is the optimized
patch-combination gate, not the L2.5 runtime audit below.

## L2.5 runtime audit

This section follows `docs/runtime-audit-instructions.md` v2. Phase 1 is a
severity-free discovery list. Weight is assigned only after every leaf is
anchored in Phase 2.

### Phase 1 — flat discovery

- P01. Resolver selection includes the core and exactly one base/lazy
  adapter; graphs without the core include neither adapter.
- P02. Pack content, adapters, ETags, transaction state, and revert determine
  what reaches the target.
- P03. `main.ts` starts asynchronous data loading without immediate hotkey
  initialization.
- P04. Base and lazy bootstraps initialize only after their respective
  database/cache/hydration sequence.
- P05. A load failure before that point displays the existing fatal alert and
  does not initialize K16.
- P06. Hotkey and pointer initialization can be requested more than once.
- P07. `enableHotkeys` defaults, UI state, saved bindings, and action gates
  interact.
- P08. Outside editable elements, existing Escape and Enter fallback
  handling sits after the configurable loop.
- P09. Modifier defaults, exact matching, Meta, key casing, editable targets,
  and saved-object mutation affect dispatch.
- P10. Duplicate bindings and missing DOM targets affect which action
  consumes an event.
- P11. Ctrl+M opens the existing model-preset store and component.
- P12. Previous/next character navigation sorts names, filters candidates,
  applies boundaries, and writes the original index plus related view state.
- P13. Textarea and contenteditable popup-editor listeners dispatch through
  the same matcher.
- P14. Triple-touch and Ctrl-drag listeners are controlled by the master
  switch.
- P15. Mobile gesture initialization is conditional and can be called from
  more than one imported location.
- P16. Pointer eligibility includes primary/button state, nested interactive
  targets, active legacy alerts, and document dialogs.
- P17. Pointer state is added, cleared, consumed, and canceled around
  horizontal-direction classification.
- P18. Mobile stack writes must stay within actual UI values and ignore the
  add-character sentinel.
- P19. Database schema/defaults, English/Korean labels/help, wrapper writes,
  and existing save tracking carry both settings.
- P20. Mobile-back default-off and desktop paths can avoid constructing the
  singleton.
- P21. Enabling on mobile/iOS waits for user activation before `pushState`.
- P22. Guard state merges object-valued history state and uses a same-page
  URL.
- P23. `pushState` can fail; fallback, reporting, retry, and later input
  behavior follow that failure.
- P24. `popstate`, rearming, disable cleanup, repeated toggles, and destroy
  affect marker and listener lifetime.
- P25. Other target code can push a history entry above the guard marker.
- P26. Real browser Back/swipe and `beforeunload` policy are
  browser/environment behavior.
- P27. Once created, the singleton's activation and `popstate` listeners
  remain for the page lifetime unless `destroy()` is called.
- P28. K16 reaches existing DOM actions and stores but does not own routing,
  storage replacement, generation transport, result claim, or ACK.
- P29. Adjacent-character selection sorts on each explicit action; gesture
  maps and listener counts have fixed structural bounds.
- P30. K16 adds no network endpoint, credential flow, HTML sink, content log,
  socket, worker, or filesystem path.
- P31. Actual touch thresholds, Safari scroll/swipe arbitration, PWA history,
  and visible modal behavior require a physical browser.
- P32. Startup-cache reconstruction, lazy placeholders, plugins, pending
  root writes, and save retry stay in their existing owners.
- P33. Focused/full tests, diagnostics, builds, and the bg bundle exercise
  base and composed target graphs.
- P34. Fresh apply, zero-change plan/reapply, status, composition, revert,
  and checksum comparison exercise installation lifecycle.

### Phase 2 — external-anchor resolution

#### Graph and installation lifecycle (P01–P02, P33–P34)

Type: structural plus measured artifacts.

Break scenario: both adapters install, K16 appears without the core, a
lazy-chat replacement is patched by the base adapter, ETags ignore adapter
payloads, or revert restores text but not modes.

- The base/lazy `requires`, `autoWhen`, and conflict rules are generated from
  one adapter manifest; resolver tests exercise absent, standalone,
  startup-cache, and lazy-chat graphs.
- Core ownership is four isolated files; adapter host lists and prohibited
  authority patterns are asserted by `test/kei-mobile-navigation.test.cjs`.
- Pack ETags change when an adapter payload changes and remain stable when it
  does not.
- The measured installer hashes, target checks, focused lifecycle, and final
  all-selection result are recorded above.

The dynamic-dispatch counterexample was an internal adapter appearing through
`autoWhen` without the core. Its `all` condition includes the core, and the
absence test resolves `lazy-chat-sync` alone and observes no K16 pack.

#### Bootstrap, settings, and persistence (P03–P08, P19, P32)

Type: structural, with an existing-storage failure boundary.

Break scenario: listeners read the raw default object before a persisted
database loads; lazy-chat initializes before placeholder hydration/plugins;
turning the master switch off deletes bindings; or the accessibility toggle
changes runtime state but never reaches durable save tracking.

- `main.ts:6-22` removes the immediate `initHotkey` import/call while retaining
  `loadData()`.
- Base `bootstrap.ts:130-159` obtains the normalized database before K16
  initialization. Composed `bootstrap.ts:175-209` additionally converts
  stubs and awaits plugin loading first.
- Manifest ordering is after `startup-cache:bootstrap` or the lazy-chat
  bootstrap replacement, not before those existing owners.
- Database defaults/fields are additive at
  `database.svelte.ts:646-648,692-694,1311-1313,1366-1368`.
- The hotkey page binds only `enableHotkeys` and conditionally hides the
  existing editor: `HotkeySettings.svelte:13-25,94-95`.
- The accessibility wrapper changes local state only after an actual value
  difference, then `setSettingValue` writes the bound DB key before its
  `onChange`: `SettingCheck.svelte:24-32`;
  `setting/utils.ts:37-53`.
- The composed graph's existing root effect deep-touches ordinary DB keys,
  marks a root change, and schedules its existing save path:
  `globalApi.svelte.ts:646-660`.

If database loading throws before these lines, `loadData` catches it and
shows the existing alert at `bootstrap.ts:190-192`; K16 is not initialized.
That is surface S3. If the existing persistence owner later fails
permanently, the UI value may not survive reload; K16 adds no second writer
or false success signal. The full lazy/bg suites exercise the existing
pending-write and save owners after composition.

The non-configurable Escape/Enter claim is deliberately bounded: the
existing early editable guard at `hotkey.ts:28-39` returns before those
fallbacks. Outside that condition, the configurable list can be empty and
the fallback at `hotkey.ts:213-234` is still reached.

#### Hotkey matching and action dispatch (P09–P14)

Type: structural.

Break scenario: matching mutates saved defaults, an extra modifier triggers a
shortcut, Meta+Ctrl runs a destructive action, a missing button consumes a
duplicate binding, a disabled shortcut still opens the popup editor, or
previous/next selects a deleted/reserved character.

- `keiMobileNavigation.ts:51-79` reads modifier defaults, rejects Meta,
  requires exact Ctrl/Alt/Shift equality, compares lower-case keys, and
  rejects unmodified editable targets without assigning to the hotkey.
- `hotkey.ts:44-55` supplies an empty configured list while disabled and
  passes the active element into the pure matcher.
- DOM helpers return false when no element exists; the loop breaks only after
  `hotKeyRanThisTime` stays true:
  `hotkey.ts:49-96,200-209,319-333`.
- Ctrl+M writes the already existing `openModelPresetList` store, whose
  component is mounted by `App.svelte:222-223`.
- `keiMobileNavigation.ts:81-110` filters positive `trashTime`, `§temp`, and
  `§playground`, sorts names, validates current/next bounds, and returns the
  original index. The target's own order validator applies the same
  trash/reserved exclusion at `globalApi.svelte.ts:2033-2042`.
- The two popup-editor branches each check the master switch and the same
  matcher: `TextAreaInput.svelte:69-89,116-135`.
- Triple-touch and Ctrl-drag listeners return before their side effects while
  disabled: `hotkey.ts:241-258,266-284`.

The dynamic action-name counterexample is an unknown or duplicate saved
action. The `switch` default marks it unhandled; only a successful action
breaks the loop. Existing action bodies can still invoke their existing
generation or UI owners, but K16 neither adds a transport nor bypasses their
preconditions.

#### Pointer navigation and bounds (P15–P18, P29)

Type: structural, with physical input behavior deferred.

Break scenario: repeated bootstrap adds duplicate listeners; a second
pointer reuses stale coordinates; a canceled pointer still moves the view; a
drag beginning on modal blank space moves the screen behind it; or sentinel
100 is decremented into a real screen.

- `hotkey.ts:337-406` has a module idempotence flag, one primary/left-button
  start, map clear/set, per-pointer delete on up/cancel, and no write when the
  start or direction is absent.
- `keiMobileNavigation.ts:25-49,112-127` covers nested native, editable,
  draggable, link, role, and modal targets, plus active legacy-alert and
  open-dialog signals.
- `keiMobileNavigation.ts:129-156` rejects non-integer/out-of-range current
  values and short/vertical/diagonal movement.
- Target UI owners use home states 0–2 and selected-character states 0–3:
  `MobileFooter.svelte:11-24`; `MobileBody.svelte:17-53`.
- The add-character flow sets 100 before its modal and later restores a real
  state: `characters.ts:726-735`. The bounded helper rejects 100 rather than
  treating it as a screen.

The pointer map contains at most one entry because each accepted primary
start clears it first. Listener count is constant per module instance.
Adjacent-character work is one name sort on the explicit shortcut action,
not a render-loop operation. No latency claim for an extreme character count
is made.

Physical threshold and gesture arbitration remain surface S1.

#### Mobile back history and failure paths (P20–P27)

Type: structural plus browser behavior.

Break scenario: default-off boot adds global listeners; desktop creates a
guard; a pre-activation entry is skipped by mobile Back; `pushState` throws
on every tap; repeated disable walks back multiple times; disabling a buried
marker removes another owner's history; or a disabled handler re-arms.

- `mobileBackNavigation.ts:149-165` combines the setting with
  `isMobile || isIOS()` and returns before singleton construction when false.
- The singleton adds fixed `popstate` and three activation listeners only
  once: `mobileBackNavigation.ts:96-103,146-161`.
- Enabling installs `beforeunload`, then arms only after explicit or browser
  user activation: `mobileBackNavigation.ts:105-121`.
- The marker merges object-valued state and uses `window.location.href`:
  `mobileBackNavigation.ts:17-31,44-51`.
- `pushState` is caught. Its failure flag suppresses later attempts and logs
  during the same enable cycle while leaving `beforeunload` active; a new
  false→true cycle resets it:
  `mobileBackNavigation.ts:42-63,112-120`.
- `cleanupPending` permits one top-marker `back()` and consumes its
  `popstate`; the handler re-arms only if enabled:
  `mobileBackNavigation.ts:66-73,122-129`.
- Destruction removes every listener, but the production singleton does not
  currently call `destroy()`:
  `mobileBackNavigation.ts:131-142`.

The current target has no `history.state` reader and no router history owner.
Its other direct history writes are the two null-state URL cleanups in
`characterCards.ts:341-372`. This closes current object-state consumer
compatibility but exposes the buried-marker case rather than proving it
impossible; surface S2 carries that exact link.

`beforeunload`, iOS Back/swipe policy, and whether a PWA honors or presents a
confirmation are outside code-only observation and remain surface S1. The
page-lifetime dormant singleton listeners remain surface S4.

#### Authority, resources, security, and composition (P28, P30–P34)

Type: structural plus measured composition.

Break scenario: a helper hides network/storage through dynamic dispatch,
navigation replaces route restoration, a setting writes the entire database,
or bg/lazy composition loses a pending change or delivery hook.

- The pure core imports nothing. It receives event/state primitives and
  returns booleans, indices, or a direction.
- Direct inspection of all K16 adapter units found no `fetch`, WebSocket,
  storage replacement, plugin-array write, result claim, ACK, route-file
  edit, HTML interpretation, credential, or logging payload.
- Production caller enumeration found one bootstrap call to `initHotkey`,
  one to `initMobileGesture`, two calls to the back synchronizer, three
  production matcher calls, two adjacent-character calls, one direction
  call, one pointer-block call, and one guard-factory call.
- K16 leaves `routing.ts` and `DefaultChatScreen.svelte` untouched.
- The composed plan retains only the three pre-existing ordered
  bg-preserve/lazy-chat collisions in global API, server reader, and plugin
  `sendChat`; no K16 unit owns them.
- Base/composed focused and full tests, diagnostics, production builds, bg
  bundle load, fresh lifecycle, and exhaustive combinations ran after the
  final modal and failure-cycle fixes.

A dynamic-dispatch counterexample would require a new K16 helper to invoke a
callback or interpret a string as code/HTML. Its signatures and every
production call site do neither. Existing shortcut action bodies remain
existing owners; the new matcher changes eligibility but not those bodies.

### Phase 3 — triage

- Q1: no K16-created immediate data-loss, corruption, ordinary-action crash,
  or security finding remains after the final fixes and target runs.
- Q2: no K16-created ownership or composition blocker remains. Route,
  database-save, lazy hydration, plugin, generation, and bg delivery
  authorities stay in their existing packs.
- Q3 fixed during the audit: trashed/reserved character selection, nested
  interactive/modal pointer starts, legacy Alert overlay movement, Meta
  extras, sentinel movement, duplicate gesture initialization, default-off
  listener construction, repeated `pushState` exceptions, duplicate cleanup,
  and missing-DOM consumption.
- Q4 prepared surfaces: S1 physical iOS gestures/history/unload behavior, S2
  a guard marker buried under another same-page history owner, S3 K16
  remaining unavailable after an existing fatal boot failure, and S4
  page-lifetime dormant singleton listeners after first enable.

### Prepared surfaces

#### S1 — physical iPhone gesture and Back behavior

1. Claim: horizontal gestures move only the intended mobile view, controls
   and modals block them, and the opt-in Back guard prevents an accidental
   tab exit after activation.
2. Resolved: event eligibility, pointer cleanup, direction/bounds, modal
   state, platform gate, activation, marker, failure fallback, and unit/full
   tests are anchored above.
3. Blocked link: actual Safari/PWA gesture arbitration and
   `beforeunload`/history policy were not exercised by the disposable DOM.
4. Limitation: those are browser/OS input and navigation decisions outside
   this local process.
5. Review method: in the consolidated iPhone L3, swipe empty home/chat areas
   in both directions; repeat from inputs, buttons, links, and an open legacy
   alert; then enable mobile Back protection, tap once, and use the browser
   Back gesture. A view moving behind a control/modal or the tab leaving
   without its platform confirmation/protection reopens this surface.

#### S2 — marker buried by another history owner

1. Claim: disabling removes K16's marker exactly only when that marker is the
   current top entry.
2. Resolved: the current-state condition and cleanup race are code-anchored;
   the target's two other `pushState(null, ...)` owners are identified.
3. Blocked link: K16 has no shared history authority with those URL-cleanup
   calls and cannot remove a buried entry without also traversing their
   entry.
4. Limitation: after a Realm/Chub URL cleanup followed by disabling the
   guard, one later Back can remain on the same page before the next leaves.
   It does not rearm while disabled or mutate user data.
5. Review method: if a Realm/Chub query-entry path is available, enable the
   guard, enter that path so its URL is cleaned, disable the guard, and press
   Back twice. Record whether the first press is the bounded same-page stop;
   unexpected rearming, looping, or data mutation changes this into a
   defect. Removing the extra stop requires a later shared history owner.

#### S3 — existing fatal load failure before K16 initialization

1. Claim: K16 intentionally waits for a usable normalized database.
2. Resolved: both bootstrap variants initialize after database setup, and
   `loadData` catches earlier fatal errors with the existing alert.
3. Blocked link: no K16 listener is installed if the existing load path
   cannot produce a database.
4. Limitation: shortcuts cannot act as a recovery UI on that already
   non-operational boot path; moving them earlier would recreate the raw-data
   race K16 avoids.
5. Review method: treat a real boot alert or stuck data load as a storage
   incident first. If the application otherwise finishes loading but K16
   remains unavailable, that observation contradicts the bounded surface and
   is a K16 defect.

#### S4 — dormant singleton listener lifetime

1. Claim: initialization does not multiply listeners, but after mobile Back
   protection is enabled once, the singleton's `popstate` and activation
   listeners remain until page unload even when disabled.
2. Resolved: singleton/idempotence construction and enabled guards are
   code-anchored; repeated tests exercise enable/disable and destruction.
3. Blocked link: production has no teardown owner that calls `destroy()`.
4. Limitation: dormant handlers do constant enabled checks and
   `beforeunload` is removed, but complete listener removal would require
   defining recreation/HMR/page teardown ownership.
5. Review method: repeated setting toggles must not produce multiple Back
   responses or warnings. Duplicate responses reopen a leak/initialization
   defect; one dormant guarded singleton is the current bounded design.

### Cross-piece interaction

The interaction among all admitted pieces was checked separately:

- K16 initializes after base startup-cache reconstruction or lazy-chat
  placeholder/plugin setup;
- K16 does not modify K13 streaming bytes, K14 render identity, or K19
  fullscreen ownership;
- a fullscreen dialog and legacy Alert both block K16 pointer starts;
- K14/bg-preserve active generation and result claim/ACK remain outside K16;
- combined target tests passed 1,252 tests with 3 existing skips;
- combined diagnostics/build and the bg bundle load check completed;
- focused base/composed lifecycle restored managed bytes/modes exactly;
- the all-selection verifier result is recorded above separately from this
  runtime audit.

The remaining cross-piece observations are the physical iPhone behavior in
S1 and the explicit history-owner interaction in S2. The user's decision to
perform one consolidated L3 after all local Kei integrations is preserved.

## Consolidated L3 scenario for K16

The later aggregate iPhone session must record K16 separately:

1. Open Settings → Accessibility → Hotkeys. Confirm the new master switch is
   on by default. On the iPhone-sized layout, confirm the existing
   small-screen notice appears in place of the desktop binding table.
2. With a hardware keyboard if available, use Ctrl+M, Ctrl+[ / Ctrl+], and
   Ctrl+X. Confirm the model selector opens, character movement follows
   display-name order without entering Trash/reserved entries, and the popup
   editor opens from both an ordinary textarea and rich editable field.
3. Turn the master switch off. Repeat those keys, a three-finger quick-menu
   tap, and Ctrl-drag of a character. None should run. Outside an editor,
   Escape/Enter should retain their existing non-configurable behavior.
   Turn the switch back on and confirm the same bindings work again rather
   than being reset.
4. With the existing mobile GUI enabled, swipe left/right from empty space on
   the home screen and confirm movement only among RisuRealm, Characters, and
   Settings. Inside a selected character, repeat across Chat, chat list,
   character settings, and the wrench/developer view.
5. Start the same motion on a button, link, text input, editable field, and
   open legacy Alert/modal. The underlying mobile section must not change.
   Cancel one in-progress touch by letting the browser take it; the next tap
   must not reuse stale coordinates.
6. In Settings → Accessibility, enable “Disable Back Navigation on Mobile.”
   Tap once in the app, then use the iPhone Back gesture/browser Back. Record
   whether the app remains and whether Safari shows its normal confirmation.
   Disable the setting and verify it no longer rearms.
7. If a Realm/Chub query-entry path is available, run the S2 two-Back
   scenario and record the bounded same-page first stop separately from a
   loop or unexpected data mutation.

No K16 L3 result is claimed in this receipt.

## Remaining review and publication state

The physical-device surfaces remain pending as part of the user's one
consolidated L3 session. K16 and this receipt remain local for review.

No push, tag, release, production apply, live PocketRisu modification, or
PocketRisu restart was performed.
