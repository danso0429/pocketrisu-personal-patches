# PocketRisu Kei K15 partial message editing validation

Date: 2026-07-31 KST

## Scope and provenance

This receipt covers K15 from the PocketRisu Kei integration catalog:

- replace one partial-edit controller per rendered message with one
  screen-level interaction manager;
- retain block-hover and selected-text edit/delete entry points;
- resolve the intended chat, message, source text, and DOM root before an
  edit starts;
- cancel an interaction when that identity, rendering mode, or DOM ownership
  becomes stale;
- edit the original message and its active swipe without taking over the
  target's existing database-save authority;
- edit an LLM translation cache entry without falling back to the original
  message or crossing into another message/cache key;
- keep base and bg-preserve composition separate, without changing
  generation, cancellation, result claim/ACK, or delivery ownership.

The adaptation was read against PocketRisu Kei revision
`cc1d1b195babd887577ebf943d5e82f01f58135c`. The focused source change is
`441d0c3f8bebec98c8fa89b76f785d363189f74a`
(`feat(chat): replace partial editing workflow`). The final pinned Kei source
was also read directly in:

- `src/lib/ChatScreens/PartialEditManager.svelte`;
- `src/lib/ChatScreens/Chat.svelte`;
- `src/lib/ChatScreens/DefaultChatScreen.svelte`;
- the partial-edit parser, settings, storage, translation-cache, dialog, and
  editor dependencies reached by those files.

The target is pristine PocketRisu 1.8.1 revision
`63832a138c14cc7f11364cf7efdcb61950e7894c`. GPL-3.0 source attribution,
the pinned Kei revision, and the adapted paths are recorded in
`THIRD_PARTY_NOTICES.md`.

This is an adaptation rather than a whole-file copy. It keeps PocketRisu
1.8.1's existing partial-edit settings and matching parser, replaces the
per-message controller call sites, and adds identity/cache guards that are
not sufficient in the frozen Kei implementation.

## Ownership and preservation boundary

The meta pack resolves K15 through three hidden packs:

| Pack | Version | Units | Selection rule | SHA-256 ETag |
| --- | --- | ---: | --- | --- |
| `kei-partial-edit-core` | `0.1.0` | 4 | required by `pocketrisu-kei` | `33eb9cb06a2b27e069035211dd2e7092c10b1f5f4eae36aa4142014fa961781d` |
| `kei-partial-edit-base-adapter` | `0.1.0` | 14 | core present, `bg-preserve` absent | `231306e5719953ae64580e2be5fe83b1834db6c2c9c7ba9c77651a72746e8013` |
| `kei-partial-edit-bg-adapter` | `0.1.0` | 14 | core and `bg-preserve` present | `ed460a2c2b2377e40083d959fd08332ef0f45b0121041f2110fe74930dce2328` |

The adapters conflict, and the base adapter is incompatible with
`bg-preserve`, so a resolved graph installs exactly one. `pocketrisu-kei` is
version `0.6.0`, requires the previously admitted K19, K13, K14, and K16
cores plus K15, and continues to own zero target files.

The core owns four isolated files:

- `src/lib/ChatScreens/keiPartialEditIdentity.ts`;
- `src/lib/ChatScreens/keiPartialEditIdentity.test.ts`;
- `src/lib/ChatScreens/PartialEditManager.svelte`;
- `src/lib/ChatScreens/PartialEditManager.test.ts`.

Each adapter touches four existing hosts:

- `src/lib/ChatScreens/DefaultChatScreen.svelte`;
- `src/lib/ChatScreens/Chat.svelte`;
- `src/lang/en.ts`;
- `src/lang/ko.ts`.

The bg adapter differs only in graph requirements, ordering, and anchors
around the existing bg-preserve chat roots. K15 does not own:

- `src/ts/process/index.svelte.ts` or request transport;
- bg operation IDs, result storage, claim, ACK, cancel, or delivery;
- database replacement, lazy-chat hydration, or plugin arrays;
- the translation-cache storage implementation;
- the existing partial-edit matching parser or setting schema.

The old `PartialEditController.svelte` source is not deleted. Its import,
state, save handler, and component call are removed from the patched
`Chat.svelte`, while the shared manager becomes the only mounted partial-edit
interaction owner.

## Retained and expected behavior

### Conditional screen-level manager

The manager mounts once under `DefaultChatScreen` only while either
`enableBlockPartialEdit` or `enableDragPartialEdit` is enabled. Both settings
still default to `false` and remain in the target's existing Accessibility
settings and database schema.

The manager receives the selected character index, active chat page and ID,
the active message array, the screen root, and the two feature switches. A
per-message chat root exposes only focused identity/render state through:

- `data-chat-index`;
- `data-chat-id`;
- `data-partial-edit-disabled`;
- `data-partial-edit-translated`.

Partial editing is disabled while the message is in original-edit mode,
translation-edit mode, translation/retranslation work, streamed display, or
a translated view backed by a non-LLM translator.

Block mode uses one document `mousemove` listener and one animation-frame
hit test to place Edit/Delete controls above a matching rendered block. Drag
mode debounces `selectionchange` by 150 ms, requires at least two selected
characters, and requires both selection endpoints to remain inside the same
message body. Scroll, outside mouse-down, screen leave, setting changes, and
component cleanup remove controls or cancel the interaction as applicable.

### Target identity and stale cancellation

Resolution captures all of the following together:

- selected character and chat page;
- chat ID and chat object identity;
- message index, optional message ID, message object identity, and original
  message data;
- chat root and body root;
- translated/original rendering state.

Before matching, before opening an editor/delete confirmation, after every
await in the translation path, and before mutation, the manager checks the
captured identity against the current database, message array, and connected
DOM. A chat switch, reorder, message replacement, external content edit,
render-state change, stream/edit transition, disconnected root, or changed
DOM identity cancels the interaction instead of redirecting it to a new
index.

A screen-wide `MutationObserver` watches child and focused identity
attribute changes while the feature is enabled. Its callback performs the
identity check only when a target is active. Screen identity changes also
reset dialogs, timers, controls, selected ranges, and translation context.

### Original-message edit and delete

The existing parser maps the rendered block or selected text back to at most
10 candidate ranges in the captured original Markdown. One match opens the
edit/delete flow directly. Multiple candidates show their context and
confidence for explicit selection. No match opens the existing localized
failure dialog.

Saving original text mutates only the captured message object. If it has an
active swipe, the same new data is written to that active swipe. The target's
existing `ReloadChatPointer` entry for that index is incremented so the
render updates. The existing root-change/debounced save owner remains
responsible for durable database persistence and retry.

### Translation-cache edit

A translated partial edit never falls back to original-message mutation.
The message root must respond with a valid LLM translation context, or the
interaction closes without opening an editor.

Context issuance captures:

- an opaque token created for that issuance;
- the exact translation cache key and cached data;
- the same chat/message identity used by the manager.

The token is kept in a plain, non-reactive variable. A Svelte deep-state
proxy previously wrapped the token object and broke strict token identity;
the focused success test exposed that defect, and the final implementation
does not pass the token through `$state`.

On save, `Chat.svelte` validates the token, key, expected old cache data,
current chat/message identity, current DOM identity, and translated render
state. It then recomputes the target's existing translation cache key,
rereads the issued cache entry, and repeats identity checks after both
awaits. A mismatch returns `false` without a cache write.

The cache writer returns success only after `setLLMCache` resolves. Because
the target cache mutates its in-memory map before its persistent write, a
rejection triggers a best-effort write of the issued previous value. Both a
successful rollback and a rollback that also rejects return `false` without
leaking an unhandled rejection. The manager keeps the editor/delete dialog
open, retains the user's edited text, and displays a localized save-failure
message.

On a successful cache write, the message itself is not mutated.
`ReloadChatPointer` is incremented only if the same message and translated
state are still current.

Translation context/save listeners are attached per rendered `Chat` only
while at least one partial-edit setting is on, and are removed by the Svelte
effect cleanup. The opaque token is an integrity/staleness token, not a
security boundary against arbitrary same-page code.

## Audit fixes made before the final gates

The runtime audit and adversarial tests found and corrected these concrete
issues before the final results below:

1. a translated selection could fall back to editing the original message
   when translation context was missing;
2. message indexes could be reused after reorder, chat replacement, or an
   external edit;
3. a translation save could target a stale key/data pair after asynchronous
   work;
4. translated save failure closed the editor and could leave an unhandled
   rejection;
5. `setLLMCache` could change memory before persistent storage rejected, so
   failure needed a best-effort previous-value restoration;
6. translation bridge listeners remained on every rendered message even
   while both feature settings were off;
7. the opaque issue token was accidentally proxied by Svelte deep state,
   causing a valid save to fail strict identity;
8. initial component-test harnesses omitted target mocks/listener timing and
   retained a UI timer; the harness was corrected rather than weakening the
   product assertions.

The final focused run passed after these corrections. No gate result below
uses the earlier failing intermediate runs.

## Patcher checks and deterministic installers

`npm test` passed all 27 patcher test files after the final fixes.

All four generated installers passed `node --check`. Two consecutive builds
produced identical sizes and SHA-256 values:

| Installer | Bytes | SHA-256 |
| --- | ---: | --- |
| `pocketrisu-patcher.cjs` | 2,983,972 | `351701cb11a913d2947163b7ee5995a1629b4b54f380e1b5fb80a3a4811ac21c` |
| `pocketrisu-features.cjs` | 2,983,978 | `ff0c0559dd9e8f3815698322f4462f42751755ef8c768716df129212aae6c0bb` |
| `pocketrisu-hardening.cjs` | 2,983,979 | `0d53e55ee5410c1b7e11ca2102a6766ed8dea43aa15c4d66a6a75b2f23740dc8` |
| `pocketrisu-all.cjs` | 2,983,973 | `ada66e3ca909bc127bd0ad06ef4a3be6bfe1c6c0fcf48f8648af49e8dc3471e0` |

Resolver and static contract tests cover core absence, exactly one
base/bg adapter, conflicts, unit ownership, prohibited bg authority changes,
ETag participation, default-off mounting/listener gates, issued-token/data
checks, failure handling, and pinned attribution.

## PocketRisu 1.8.1 target checks

No live PocketRisu tree was modified or restarted.

The final focused dynamic run observed:

| Target graph | Test files | Tests |
| --- | ---: | ---: |
| `pocketrisu-kei,toolchain-hardening` | 2 passed | 18 passed |
| `pocketrisu-kei,bg-preserve,lazy-chat-sync,toolchain-hardening` | 2 passed | 18 passed |

Those tests exercise message/chat/DOM staleness, original edit and active
swipe behavior, translation context absence, issued-token/key/data
validation, successful translated save, persistent-write rejection,
successful rollback, double failure, retained editor text, and cleanup.

The final complete target suites observed:

| Target graph | Test files | Tests |
| --- | ---: | ---: |
| `pocketrisu-kei,toolchain-hardening` | 70 passed | 985 passed, 3 skipped |
| `pocketrisu-kei,bg-preserve,lazy-chat-sync,toolchain-hardening` | 101 passed | 1,270 passed, 3 skipped |

Final diagnostics and builds observed:

| Target graph | Diagnostics | Production build |
| --- | --- | --- |
| `pocketrisu-kei,toolchain-hardening` | 0 errors, 4 existing `DefaultChatScreen.svelte` accessibility warnings | Exit 0; 50.19 s |
| `pocketrisu-kei,bg-preserve,lazy-chat-sync,toolchain-hardening` | 0 errors, 0 warnings | Exit 0; 49.43 s |

Both builds retained the target's existing dynamic-import, plugin-timing,
and large-chunk warnings. The composed bg-preserve bundle builder produced
`server/node/bgOrchBundle.mjs` at 8,119 KB, and its load check observed
`sendChat=function`. The existing KaTeX quirks warning remained.

## Apply, repeat, composition, and exact revert

Fresh disposable targets observed:

| Flow | Resolved unit order | Initial changed files | Current status files | Second plan | Reapply | Revert changed files |
| --- | ---: | ---: | ---: | --- | --- | ---: |
| `pocketrisu-kei,toolchain-hardening` | 103 | 40 | 38, all current | 0 changes | `changed: false` | 40 |
| `pocketrisu-kei,bg-preserve,lazy-chat-sync,toolchain-hardening` | 316 | 143 | 141, all current | 0 changes | `changed: false` | 143 |

Both reverts ended with zero requested packs, zero managed status files, and
a zero-change follow-up plan.

The composed plan retained three pre-existing ordered collisions:

1. durable global-API save hooks after the lazy-chat global-API replacement;
2. server stream-reader import hooks after the lazy-chat server replacement;
3. no-orchestration plugin `sendChat` hooks after the lazy-chat API-v3
   replacement.

No K15 unit participates in those collisions.

After excluding the patch manager's private intent/state and
build/dependency outputs, checksum/mode/symlink comparison found zero
relevant differences from pristine PocketRisu 1.8.1 in both targets.

The composed disposable tree retained test/build artifacts outside patch
ownership: SQLite save databases and WAL/SHM files,
`server/node/bgOrchBundle.css`, and an empty `src/ts/vendor/` directory.
They were recorded rather than misreported as managed revert drift.

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
  "managedPaths": 180,
  "maximumResolvedUnits": 401,
  "roundTrips": "passed",
  "workers": 2,
  "compositionCache": {
    "bypasses": 2050,
    "hits": 2047,
    "misses": 2047,
    "stores": 2047
  },
  "pairAnalysisCache": {
    "entries": 929,
    "hits": 265311,
    "misses": 929
  },
  "packEtagCache": {
    "hits": 42453,
    "misses": 43
  },
  "stateEncodingCache": {
    "hits": 2047,
    "misses": 2047
  },
  "timingsMs": {
    "apply": 129437.96,
    "initialPlan": 160187.65,
    "repeatedPlan": 104566.82,
    "revertApply": 117897.6,
    "revertPlan": 71049.68,
    "snapshot": 16252.94,
    "status": 51620.86,
    "total": 651087.36
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

- P01. Resolver selection includes the core and exactly one base/bg adapter;
  graphs without the core include neither adapter.
- P02. Pack content, adapter anchors, ETags, transaction state, and revert
  determine what reaches the target.
- P03. The shared manager mounts conditionally and replaces the per-message
  controller without deleting its source file.
- P04. Document and screen listeners are installed according to the two
  settings and removed on effect cleanup.
- P05. Per-message translation context/save listeners are installed only
  while either setting is enabled and removed with their chat root.
- P06. Block hover schedules one animation-frame DOM hit test and creates
  fixed-position body-level Edit/Delete controls.
- P07. Selection editing debounces selection changes and validates length,
  range geometry, endpoints, body ownership, and target identity.
- P08. Chat, message, index, ID, data, object, DOM, translated state, and
  disabled state jointly determine one target.
- P09. Reorder, chat switch, message replacement/edit, stream/edit state,
  translated-state change, and DOM mutation can invalidate that target.
- P10. Block/selection text enters exact, anchored, fuzzy, and bigram matching
  with result/context bounds and match-selection dialogs.
- P11. Original edit/delete mutates message data, active swipe data, render
  revision, and then the target's existing durable-save observation path.
- P12. Translation context computes the existing display-derived cache key,
  reads cache data, and issues an opaque token bound to message identity.
- P13. Translation save validates issue fields, recomputes the key, rereads
  data, writes the cache, handles rejection, and requests rerender.
- P14. A failed translation write can occur after the target cache has
  already changed its in-memory map.
- P15. Another writer or tab can change translation cache state between the
  final read and write.
- P16. Display-derived key computation parses assets and executes display
  Lua triggers, display triggers, plugin callbacks, and custom regex actions.
- P17. Missing/rejected translation context and failed saves affect dialog
  closure, retained input, reporting, and fallback behavior.
- P18. Escape, Ctrl/Meta+Enter, dialog close, focus timers, selection timers,
  and button events affect interaction lifetime.
- P19. Controls, listeners, observer, copied source strings, DOM references,
  candidate ranges, and global render-pointer entries affect memory/resource
  lifetime.
- P20. Mouse movement, selection changes, full-subtree mutation observation,
  and matching affect main-thread CPU.
- P21. Block hover is pointer-dependent; iOS selection handles, portals,
  virtual keyboard, viewport movement, and scrolling are browser behavior.
- P22. Fixed body-level controls use theme colors, a fixed cell size, z-index,
  and screen-relative geometry.
- P23. Dialog buttons, labels, confidence text, save-failure text, focus, and
  keyboard behavior affect accessibility.
- P24. Custom events and an opaque object token provide stale-request
  integrity but are not an authorization boundary against same-page code.
- P25. K15 adds no endpoint, socket, credential path, filesystem path, HTML
  interpretation of user edits, or content logging.
- P26. The target parser normalizes/copies input and can scan long unmatched
  text before returning at most 10 ranges.
- P27. The mutation observer receives subtree changes while enabled even
  when no target is active; its callback then performs only the active-target
  check.
- P28. Translation event listeners scale with rendered messages while
  enabled; the interaction manager and document listener set stay singular.
- P29. Bg composition changes root anchors/order only and must not alter
  operation, cancellation, claim/ACK, or result-delivery behavior.
- P30. Existing full-message edit, manual translation edit, settings,
  storage, lazy hydration, plugins, and generation remain callable.
- P31. Defaults are dormant, so existing users do not install runtime
  listeners until they enable a partial-edit setting.
- P32. Focused/full tests, diagnostics, builds, and the bg bundle exercise
  base and composed target graphs.
- P33. Fresh apply, zero-change plan/reapply, current status, exact revert,
  checksum comparison, and all combinations exercise installation lifecycle.

### Phase 2 — external-anchor resolution

#### Graph and installation lifecycle (P01–P02, P29, P32–P33)

Type: structural plus measured artifacts.

Break scenario: both adapters install, a K15 adapter appears without the
core, the base adapter patches a bg-owned root, adapter payload changes do
not alter ETags, or revert restores text but not target modes.

- Core ownership and adapter requirements/conflicts are defined in
  `patches/kei-partial-edit-core/manifest.cjs:9-39` and
  `adapter-manifest.cjs:98-129`.
- Both adapters are generated from the same unit list; the bg variant adds
  only bg requirements and root-anchor ordering at
  `adapter-manifest.cjs:12-96`.
- Resolver/static tests exercise absent, base, and bg graphs, adapter
  exclusivity, ETag changes, prohibited authorities, and manifest ownership.
- Installer hashes, fresh lifecycle, source comparisons, and the final
  2,048-selection verifier are measured above.

The dynamic-dispatch counterexample was an internal adapter selected only by
`autoWhen`. Its `all` condition includes the K15 core, and the base adapter's
`none` condition excludes `bg-preserve`; resolver absence tests close that
path.

#### Mount, listeners, controls, and cleanup (P03–P07, P18–P23, P27–P28, P31)

Type: structural with physical input/performance leaves.

Break scenario: every message mounts a manager; settings off still leave
listeners; effect reruns multiply document handlers; stale body controls
remain after unmount; a selection crosses messages; a scroll leaves controls
over unrelated content; or observer callbacks perform matching on every
stream mutation.

- Conditional single-manager mounting is generated at
  `adapter-manifest.cjs:131-190`.
- Per-message translation listeners have the two-setting gate and symmetric
  cleanup at `adapter-manifest.cjs:405-439`.
- Block/drag listener installation and symmetric removal are in
  `PartialEditManager.svelte:719-740`; reset removes body controls and timers
  at `:337-378`.
- Hover is coalesced through one `requestAnimationFrame` and one
  `elementFromPoint` lookup at `:618-654`.
- Selection is delayed 150 ms, requires two characters, checks both
  endpoints and nonzero geometry, and stays within one resolved body at
  `:656-710`.
- Scroll, mouse-down, and screen-leave behavior is explicit at `:712-740`.
- The observer watches only the screen subtree/four identity attributes and
  runs validation only with an active target at `:747-765`.
- `onDestroy` performs the same full reset at `:767`.

The listener-multiplication counterexample is a setting toggle causing a new
effect run before cleanup. Svelte effect cleanup runs before rerun, and the
dynamic component tests count add/remove calls across toggles/unmount.

Actual rendered-message count, subtree mutation frequency during a real
stream, body-control placement under iOS viewport changes, and touch
selection behavior are not code facts. They remain prepared surfaces S4 and
S5.

#### Identity and mutation boundary (P08–P09, P11, P17, P19)

Type: structural, with existing durable I/O failure retained as an external
owner.

Break scenario: a message moves to the captured index; an object is replaced
with the same text; an external edit keeps the object but changes its text;
the selected chat changes while a dialog is open; the DOM is recycled for
another message; or a save mutates the active index instead of the issued
object.

- The pure identity comparison requires chat/message object identity, index,
  ID, and data at `keiPartialEditIdentity.ts:24-37`.
- DOM resolution and database identity are captured at
  `PartialEditManager.svelte:190-229`.
- Current-message and DOM validation repeat every identity dimension at
  `:231-279`.
- Await boundaries validate the captured target before matching and save at
  `:380-443,500-564`.
- Screen identity changes and relevant DOM mutations reset the interaction at
  `:742-765`.
- Original save writes the message object already recovered from the
  captured target, mirrors its active swipe, and increments only that index's
  render pointer at `:539-559`.

The same-index/same-text replacement counterexample fails object identity.
The same-object external edit counterexample fails `messageData`. The
disconnected/recycled DOM counterexample fails connectivity, containment,
dataset, or translated-state checks.

Durable save remains conditional on the target's existing observer and I/O.
The base target deep-touches the active chat at
`src/ts/globalApi.svelte.ts:607-638` and enters its existing debounced
`triggerSave` path at `:1049-1090`. The lazy-chat owner performs the
corresponding active-chat observation and retry at
`patches/lazy-chat-sync/files/src/ts/globalApi.svelte.ts:703-739,1279-1294`.
If that existing owner permanently fails, K15 does not report a false
durable-save success or introduce a parallel database writer; persistence
remains an existing storage incident.

`ReloadChatPointer` is copied with one numeric property increment. The
target's existing GUI-reset owner replaces the map, so K15 does not append a
separate unbounded collection. Real edit frequency is user behavior rather
than a code-derived rate.

#### Matching and main-thread work (P10, P20, P26)

Type: structural plus measured synthetic CPU data.

Break scenario: matching retains unbounded candidates, scans indefinitely,
or a long unmatched selection blocks the browser main thread despite the
result cap.

- The existing parser sets `MAX_RESULTS = 10`, context 200 characters,
  fuzzy input 500, line extension 5,000, and bigram input 2,000 at
  `src/ts/parser/partialEdit.ts:326-344`.
- Exact, anchored, fuzzy, and bigram paths all return a deduplicated slice at
  or below that result cap at `:384-618`.
- The manager retains only the returned candidates plus one captured source
  string and chosen range.

The result cap does not cap time spent scanning a long original string.
Synthetic measurements of the existing parser on this host observed:

| Original size/scenario | Result | Elapsed |
| --- | ---: | ---: |
| 2,000 characters, exact | 10 | 2.458 ms |
| 2,000 characters, no match | 0 | 19.840 ms |
| 10,000 characters, exact | 10 | 3.753 ms |
| 10,000 characters, no match | 0 | 52.197 ms |
| 50,000 characters, no match | 0 | 268.514 ms |
| 100,000 characters, no match | 0 | 505.869 ms |

This is synthetic current-host evidence, not a universal device latency
claim. The rare long-unmatched mobile case remains prepared surface S3.

#### Translation issuance, write, and failure (P12–P17, P24–P25)

Type: structural, with storage atomicity and concurrent-writer leaves.

Break scenario: a translated view silently edits original Markdown; a stale
manager fabricates a key; a token is replayed for another message; key/data
changes during awaits; a persistent write rejects after changing memory; or
same-page code forges a custom event.

- Missing translated context cancels instead of selecting original data at
  `PartialEditManager.svelte:380-443`.
- The issued token is held outside deep reactive state at `:100`; the manager
  returns the exact token/key/data on save at `:500-538`.
- Identity, token, key, and expected data comparisons are pure and strict at
  `keiPartialEditIdentity.ts:39-50`.
- The message-side bridge checks translated availability and
  chat/message/DOM identity before issue and after each await at
  `adapter-manifest.cjs:281-397`.
- Save recomputes the existing key and rereads issued data before the one
  write at `adapter-manifest.cjs:365-397`.
- The rollback helper catches both the forward rejection and a rollback
  rejection and returns `false` at
  `keiPartialEditIdentity.ts:52-72`.
- The manager catches a missing/rejected response, leaves the dialog open,
  retains text, and renders localized failure guidance at
  `PartialEditManager.svelte:500-538,840-905`.
- K15 introduces no fetch/socket/filesystem/credential/logging operation.
  Static tests search every K15 unit for the prohibited bg and network
  authorities.

The forged-event counterexample is possible for arbitrary same-page code;
the token is not described as authorization. Such code already executes in
the application's origin and can reach broader application/plugin
capabilities. K15's token prevents accidental stale/replayed manager writes,
not hostile in-origin code.

`setLLMCache` updates `llmTranslateCache` before awaiting persistent storage
at `src/ts/translator/translator.ts:605-633`;
`writePersistentJson` awaits the existing storage API at
`src/ts/storage/persistentKv.ts:32-44`. The rollback closes ordinary
single-instance memory divergence when its second write succeeds, and tests
exercise both rejection branches. The storage API exposes no transaction or
compare-and-swap, so exact persistent state after a partially completed
write/rollback and concurrent writers remains surfaces S1 and S2.

#### Display-derived cache-key side effects (P16, P30)

Type: structural, with user-configured callback effects.

Break scenario: treating cache-key computation as a pure string function
misses a Lua trigger, display trigger, plugin callback, or custom regex action
that runs before a later identity check.

- The existing key function returns raw `msgDisplay` only for
  `translateBeforeHTMLFormatting`; otherwise it awaits `ParseMarkdown` at
  `src/lib/ChatScreens/Chat.svelte:150-158`.
- `ParseMarkdown` parses additional assets and calls `processScriptFull` in
  `editdisplay` mode at
  `src/ts/parser/parser.svelte.ts:910-930`.
- `processScriptFull` invokes Lua edit triggers, display triggers, plugin-v2
  callbacks, and custom regex actions at
  `src/ts/process/scripts.ts:99-220`. An `@@inject` editdisplay action with a
  real chat index can mutate message data at `:207-211`.
- K15 validates identity after each awaited key computation, so such a
  mutation prevents the later cache write. It cannot undo a callback side
  effect that already occurred.
- The target's existing full translation edit uses the same key function for
  load and save at `Chat.svelte:160-170`; K15 preserves that key semantic
  rather than inventing a second cache namespace.

The claim is therefore bounded to “no stale cache write after a changed
identity,” not “cache-key calculation is pure.” Avoiding those callbacks
would require a new pure translation-key authority and compatibility rules
for existing translated entries. That trade remains prepared surface S6.

### Phase 3 — triage

- Q1 fixed during the audit: translated-to-original fallback, stale
  chat/message/index writes, stale translation token/key/data writes, and
  unhandled cache-save rejection.
- Q2: no K15-created graph/ownership blocker remains in the measured base and
  bg/lazy compositions. Database persistence, translation-cache storage,
  plugin execution, generation, cancel, claim/ACK, and delivery retain their
  existing owners.
- Q3 fixed during the audit: off-state translation listeners, proxied opaque
  token identity, failure-dialog closure, and best-effort in-memory cache
  restoration.
- Q4 prepared surfaces: S1 non-atomic concurrent cache writers, S2 persistent
  state after a partially completed forward/rollback pair, S3 rare long
  unmatched parser work, S4 physical iOS selection/dialog behavior, S5
  enabled-screen listener/observer scaling, and S6 side effects in the
  existing display-derived cache-key path.

### Prepared surfaces

#### S1 — non-atomic translation cache compare/write

1. Claim: K15 rereads the issued key immediately before writing, but the read
   and write are not one atomic compare-and-swap.
2. Resolved: token/key/data/message/DOM validation and the immediate reread
   are code-anchored; stale and changed-cache tests reject the write.
3. Blocked link: another writer can change the same cache entry after the
   final read and before `setLLMCache`.
4. Limitation: the target cache API has no lock, version, or CAS operation;
   cross-tab persistent changes can also be masked by a tab's populated
   in-memory map.
5. Review method: if simultaneous translation editing or cache-management
   across two tabs is used, change the same translated message in both and
   compare the final cache. A silent last-writer overwrite confirms the
   remaining race; preventing it requires a shared version/CAS owner.

#### S2 — persistent outcome after write and rollback failures

1. Claim: a rejected forward cache write causes one best-effort previous-value
   write and never closes the editor as if save succeeded.
2. Resolved: success, forward failure with successful rollback, and both
   writes failing are covered by focused tests; the manager retains edited
   text and displays failure.
3. Blocked link: the storage API does not report whether a rejected operation
   made a partial durable change before rejection, nor does it offer a
   transaction for the forward/rollback pair.
4. Limitation: after both writes reject, the exact persisted value requires a
   later storage read/reload; K15 deliberately does not claim exact rollback
   of an opaque failed I/O operation.
5. Review method: if a real storage error appears, keep the displayed edit
   text, reload, and inspect that translation. New data despite failure means
   the forward write partly persisted; old data means rollback/no-write won.
   A transactional cache API would be required for a stronger guarantee.

#### S3 — rare long unmatched partial-edit parsing

1. Claim: candidates are bounded to 10, but elapsed work for an unmatched
   selection still grows with the original message.
2. Resolved: parser caps and current-host synthetic measurements through
   100,000 characters are recorded above.
3. Blocked link: iPhone main-thread latency and real user message lengths were
   not measured by the local Node process.
4. Limitation: moving work to a worker, yielding, or imposing an original-text
   cap can change matching results and therefore is not a same-effect rewrite
   without further design.
5. Review method: in L3, select an uncommon phrase in the longest available
   message. A visible UI stall before the match dialog reopens this surface;
   ordinary-sized responsiveness does not prove the 100k extreme absent.

#### S4 — physical iPhone selection, keyboard, dialog, and viewport behavior

1. Claim: selected-text edit/delete stays on one message, retains text on
   save failure, and closes/cancels through its explicit controls.
2. Resolved: DOM range checks, identity validation, dialog state, keyboard
   handling, and component tests are anchored above.
3. Blocked link: Safari selection handles, virtual-keyboard resize, portal
   layering, scroll movement, and touch event arbitration were not exercised
   by the disposable DOM.
4. Limitation: these are browser/OS input and layout decisions outside the
   local process.
5. Review method: use the consolidated iPhone L3 steps below. A control
   attaching to another message, a dialog hidden by the keyboard, lost edit
   text, underlying-chat scroll/action, or a stale save reopens this surface.

#### S5 — listener and observer scaling while enabled

1. Claim: there is one manager/document listener set, while two translation
   listeners exist per rendered message and one observer receives chat-screen
   subtree mutations.
2. Resolved: setting gates, add/remove symmetry, singular manager mounting,
   and the observer's no-active-target fast path are code-anchored.
3. Blocked link: rendered message count and mutation frequency during a real
   long stream are runtime data not measured by the focused DOM.
4. Limitation: default-off prevents dormant cost for existing users, but it
   does not establish enabled-mode latency on a very large rendered chat.
5. Review method: enable drag partial edit, open the longest chat, stream one
   response, and scroll/select text. Increasing lag tied specifically to
   enabling the setting reopens this surface; delegation or virtualization
   would then need measurement before redesign.

#### S6 — existing display-derived cache-key callbacks

1. Claim: K15 preserves the target's existing translation cache key and
   revalidates identity after computing it.
2. Resolved: the key/parse/script chain and the post-await validation are
   code-anchored above.
3. Blocked link: user-defined Lua/display/plugin/regex callbacks can have
   side effects before that validation; K15 cannot roll those effects back.
4. Limitation: bypassing the callbacks risks selecting a different cache key
   from existing full translation edit and previously stored translations.
5. Review method: users with `editdisplay` callbacks should open and save one
   translated partial edit while observing the callback's normal counters or
   message effects. Unexpected duplicate effects make this a design defect;
   the remedy is a separately reviewed pure-key API, not hardcoded callback
   suppression.

### Cross-piece interaction

The interaction among all admitted pieces was checked separately:

- K15 mounts after the K14 base or bg chat-render adapter has established its
  generation/streaming state;
- active K14 streaming sets the message root disabled and invalidates an
  existing K15 target;
- K15 does not change K13 stream parsing or K14 operation/result ownership;
- bg chat-root touch hooks remain around K15's bound root, with no change to
  cancel, claim, ACK, or delivery paths;
- K16 modal/interactive pointer guards and K19 fullscreen dialog remain
  outside K15's document selection/hover ownership;
- base/composed focused and full suites, diagnostics, production builds, bg
  bundle load, fresh lifecycle, and exhaustive combinations ran after the
  final token and cache-failure fixes.

The remaining cross-piece observations are the physical iPhone behavior in
S4, enabled long-chat/stream behavior in S5, and user-configured
display-callback behavior in S6. The user's decision to perform one
consolidated L3 after all local Kei integrations is preserved.

## Consolidated L3 scenario for K15

The later aggregate device session must record K15 separately:

1. Open Settings → Accessibility. Confirm both partial-edit settings are off
   initially, then enable “Drag Partial Edit.” Return to a chat with several
   messages and at least one message with multiple paragraphs.
2. On iPhone, select a phrase wholly inside one message. Tap Edit, change only
   that phrase, save, and confirm the surrounding text and other messages are
   unchanged. Repeat with Delete and confirm only the selected range is
   removed, with excessive blank lines normalized.
3. Select a phrase that appears more than once. Confirm the match-choice
   dialog shows contextual candidates/confidence, choose the intended one,
   and verify that occurrence alone changes. Select rendered text that cannot
   be mapped and confirm the localized no-match dialog appears without a
   mutation.
4. Open a partial-edit dialog, then cause the message identity to change
   before saving: switch chat and return, reroll/change the same message, or
   begin streaming that message. The stale dialog must close or refuse the
   save; it must not change whatever message now occupies that index.
5. Enable LLM translation and show a translated message. Select and edit a
   translated phrase. Confirm the translated display changes while the
   original message text remains unchanged. Switch chat or translation state
   while a translated editor is open and confirm a stale cache save is
   refused.
6. With drag partial edit still enabled, stream one response and interact
   with the longest available chat. Record selection/scroll responsiveness
   and confirm no Edit/Delete control attaches to partial streamed text.
7. Rotate the iPhone or let the virtual keyboard resize the viewport while
   the edit dialog is open. Confirm the edited text, Save/Cancel controls, and
   chosen target remain visible and that tapping the dialog does not act on
   the chat behind it.
8. If a mouse/trackpad is available, enable “Block Partial Edit,” hover one
   paragraph, and verify its Edit/Delete buttons target that paragraph only.
   On a touch-only iPhone this hover-only entry point is not observable and
   must be recorded as such rather than reported as passed.
9. Disable both settings. Confirm selection no longer creates partial-edit
   controls and ordinary full-message editing/translation editing still
   works.

No K15 L3 result is claimed in this receipt.

## Remaining review and publication state

The physical-device and user-configured-callback surfaces remain pending as
part of the user's one consolidated L3 session. K15 and this receipt remain
local for review.

No push, tag, release, production apply, live PocketRisu modification, or
PocketRisu restart was performed.
