# PocketRisu 1.9.0 Personal Settings validation

## Decision

`personal-settings` version `0.2.0` is qualified for the exact official
PocketRisu 1.9.0 tag, commit
`85a65f3137b45c8de4a8d21a9887be213b1ac3fc`. PocketRisu 1.8.1 remains
supported. This decision does not qualify another pack or a later 1.9.x
release.

The live PocketRisu installation and the preserved staged K12 worktree were
not used as patch targets. Qualification, verified staging, and round trips
used separate clones of the official source tags.

## Upstream overlap and version-aware design

PocketRisu 1.9 adds native Settings Search. Hardcoded settings pages must now
register a manual entry in `src/ts/setting/searchManifestData.ts`; otherwise
the page still renders from the sidebar but cannot be found through the new
search dialog. PocketRisu 1.8.1 has neither that manifest nor the search index
test file, so adding those paths to every target would break the existing
dual-target pack.

The pack keeps its 18 existing core/import-navigation units universal and
adds two units scoped exactly to PocketRisu 1.9.0
(`patches/personal-settings/settings/search/units.cjs:5-60`):

- `personal-settings:search-manifest-1.9` registers one
  `manual.page.personal` result with Korean label, Korean and English
  keywords, and `SettingsRoute.Personal`;
- `personal-settings:search-index-test-1.9` adds Korean and English query
  tests and requires exactly one matching result key routed to page 24.

The 1.9 manifest entry is ordered after the final native System Plugin
Storage entry. The first maintainer qualification failed safely before source
writes because the initial short `];` anchor also matched the
`keywords: string[];` interface field. The final unit uses the complete,
unique Plugin Storage object as its anchor. A fresh plan then observed 20
Personal Settings units, 14 source paths, and zero collisions.

On exact 1.8.1, the same pack planned only the 18 universal units and 12
source paths. Neither 1.9 search path entered its order, state, source reads,
or output. Apply reported `current`, repeated plan had no changes, and revert
returned `clean` with no tracked byte or mode difference.

## Retained Personal Settings behavior

The 1.9 qualification retains the existing user outcome:

- page 24 appears immediately after System and renders the same dedicated
  `개인 설정` page;
- the missing/false import override preserves PocketRisu's existing local and
  Realm post-import navigation;
- explicit true suppresses only post-import navigation after local card,
  character-package, and both Realm response forms; parsing, asset writes,
  character insertion, ordering, and import error handling remain upstream
  owned;
- scratch character creation still opens the new character;
- the toggle reads the latest database value after an asynchronous import;
- updating one personal field preserves other present/future fields in the
  optional `pocketRisuPersonalSettings` namespace;
- the pack does not install a plugin, call `setDatabase()` or
  `setDatabaseLite()`, or read/write `Database.plugins`.

Applied-source inspection also confirmed that native 1.9 search button/dialog
imports, `searchOpen` state, result rendering, route sorting/cap, and all
pre-existing route branches remained present. Selecting the Personal result
closes the dialog, calls native `openSettings(24)`, and renders the same page
24 branch as a direct sidebar tap.

## Automated qualification

Before compatibility promotion, a fresh exact-1.9 candidate with exactly
`personal-settings,toolchain-hardening` completed maintainer staging as
`review-passed`. After the result-key uniqueness guard and final verified
metadata changed the ETag, a second fresh exact-1.9 candidate completed the
ordinary downloader staging path as `ready-for-manual-cutover`:

- pnpm 10.34.1 and frozen dependency installation passed;
- frontend tests: 71 files, 1,046 passed and 3 skipped;
- server tests: 4 files and 99 tests passed;
- Svelte diagnostics: 0 errors and the four upstream warnings in
  `DefaultChatScreen.svelte`;
- production build: passed;
- final focused Settings Search test: 1 file and 7 tests passed, including
  both Personal queries and their exact-one-result assertions;
- the complete patcher suite passed all 28 test files.

`toolchain-hardening` is an independently qualified Node 25 test-environment
owner. It does not own Personal Settings behavior or Settings Search.

The final independent exact-1.9 downloader round trip observed 20 units, 14
source paths, zero collisions, `current` status with zero drifted paths, a
zero-change repeated plan, and repeated apply `{ changed: false, files: [] }`.
Revert removed/restored all managed content, returned patcher status to
`clean`, and left no tracked byte or mode difference from official 1.9.0.

## Exhaustive 1.8.1 regression gate

The current catalog, including both real 1.9-only search units, was run
against the separately proved-pristine official PocketRisu 1.8.1 source:

```json
{
  "target": {
    "packageName": "pocketrisu",
    "packageVersion": "1.8.1"
  },
  "compatibility": "verified",
  "rawSelections": 2048,
  "verifiedSelections": 2048,
  "normalizedGraphs": 1024,
  "managedPaths": 191,
  "maximumResolvedUnits": 425,
  "roundTrips": "passed",
  "workers": 2
}
```

`managedPaths` is the verifier's target-independent catalog snapshot list, so
it includes the two absent 1.9-only file names and increased from 189 to 191.
The verifier proved those paths remained absent across every 1.8.1 selection.
The active 1.8.1 Personal plan and maximum resolved-unit count did not include
the scoped units.

## L2.5 runtime audit

### Phase 1 — flat discovery

- Exact target identity can include or omit the two Settings Search units.
- A 1.9-only host file can be absent on PocketRisu 1.8.1.
- Search-manifest anchor selection can be missing, duplicated, or reordered.
- A Korean or English query can match the Personal label/keywords.
- The manual result ID can be absent, duplicated, or collide with upstream.
- The added result participates in native ranking, sorting, and the 30-result
  cap.
- Selecting the result closes the search dialog and navigates to route 24.
- Route 24 can collide with another settings page or fail to render.
- The Personal sidebar entry/render branch can disturb native search UI or
  existing settings pages.
- The fixed Korean result label can be queried from another UI locale.
- The Personal toggle mutates an optional database namespace.
- A missing/false/true toggle value changes local and Realm post-import
  navigation branches.
- The toggle can change while an asynchronous import is in progress.
- Local or Realm import can cancel, fail, return no character, or complete.
- Database persistence can be debounced, retried, or fail repeatedly.
- Other personal-setting fields can coexist with the import toggle.
- Plugin-array ownership can be reached accidentally through a broad database
  write.
- Every settings query does synchronous work over one additional manual
  entry.
- Search dialog focus, result tapping, narrow-screen navigation, PWA reload,
  and persistence are mobile/environment-visible behaviors.
- The new runtime entry creates no timer, request, socket, file handle,
  binary/encoding transform, HTML injection, credential read, dynamic code
  execution, or unbounded persistent collection. The existing import paths
  retain their upstream network/file effects.
- The second scoped unit changes test runtime only and is not imported by the
  production application graph.

### Phase 2 — external-anchor resolution

- **Target graph — structural and measured.** Both units declare only
  `pocketrisu: ['1.9.0']` and require the universal routing/manifest unit
  chain (`settings/search/units.cjs:5-60`). Exact 1.8 planning measured 18
  Personal units with both search paths absent; exact 1.9 planning measured 20
  units and 14 paths. The 2,048-selection 1.8 gate retained exact round trips.
- **Anchor ambiguity — structural and measured.** The short anchor produced
  `ANCHOR_COUNT` with two matches before writes. Fresh source inspection found
  the interface occurrence and array terminator. The complete final native
  Plugin Storage object appears once in official 1.9 and the fresh plan
  applied it without collision (`settings/search/units.cjs:15-31`).
- **Query and result identity — structural and measured.** Native
  `searchSettings()` lowercases and trims the query, ranks label before
  keywords/help, pushes the manual result, sorts, and slices to 30
  (`src/ts/setting/searchIndex.ts:184-248` in the exact applied candidate).
  The managed tests filter `manual.page.personal`, require length one, and
  require `SettingsRoute.Personal` for both Korean and English queries
  (`settings/search/units.cjs:39-56`). All seven search-index tests passed.
- **Navigation and render — structural.** Native result selection closes the
  dialog before `navigateToSearchResult()`. That function calls
  `openSettings(result.route)`; `openSettings()` sets `SettingsMenuIndex` and
  opens settings. The applied route object contains one Personal value 24,
  and `Settings.svelte` contains one menu state and one render branch for 24.
  A search result has no sub-tab or item anchor, so it creates no retry-scroll
  timer (`src/lib/Setting/SettingsSearch.svelte:31-43` and
  `src/ts/setting/searchIndex.ts:267-275` in the applied candidate).
- **Native 1.9 preservation — structural plus build.** Applied-source reads
  found the native Search icon/import, dialog component, open state, button,
  result list, and final dialog mount unchanged around the additive Personal
  imports/menu/render. Svelte diagnostics and production build passed. The
  breaking counterexample was a Personal insertion replacing or bypassing
  the native search trigger; exact diff inspection showed additive marked
  blocks only.
- **Toggle default and namespace — structural and measured.** The reader is
  true only for exact boolean true; missing and false both return false
  (`settings/import-navigation/files/src/ts/personalSettings/importNavigation.ts:6-18`).
  The writer spreads the current namespace before the change
  (`core/files/src/ts/personalSettings/core.ts:9-16`). Focused tests observed
  missing-state no-op behavior, exact true/false behavior, and preservation of
  a future field.
- **Persistence and failure path — structural.** The UI mutates
  `DBState.db.pocketRisuPersonalSettings`, a general root field. PocketRisu
  1.9's root effect deep-touches non-character/non-preset/non-module/non-plugin
  fields, marks root dirty, and schedules the existing 500 ms debounce
  (`src/ts/globalApi.svelte.ts:508-556` in official 1.9). The save loop calls
  tracked persistence; a failure requeues the snapshot and retries, and after
  repeated failures shows the existing alert
  (`src/ts/globalApi.svelte.ts:1080-1148`). Persistence is therefore subject
  to PocketRisu's existing save/retry contract, not a new silent writer.
- **Local import navigation — structural.** The navigation condition executes
  only after `alertAddCharacter()` and the selected scratch/import function
  return. Scratch creation remains eligible for `changeChar`; completed card
  and package imports suppress only that call when the latest toggle is true.
  Cancellation/default exits before the changed condition, and no-character
  completion fails the existing last-character guard
  (`settings/import-navigation/units.cjs:33-63`; applied
  `src/ts/characters.ts:737-775`).
- **Realm import navigation — structural.** Both native response branches
  still await import processing and ordering before re-reading the current
  database. The pack adds the same exact-true guard only to the two existing
  navigation conditions; fetch, content parsing, insertion, and the enclosing
  error handler remain upstream code
  (`settings/import-navigation/units.cjs:65-103`; applied
  `src/ts/characterCards.ts:1653-1710`).
- **Plugin-array absence — structural.** Fresh repository-wide inspection of
  all Personal owned/managed text found no `plugins`, `setDatabase(`, or
  `setDatabaseLite(` call, and the patcher contract test asserts the same
  (`test/personal-settings.test.cjs`). A counterexample through the shared
  namespace writer was traced to direct assignment of only
  `pocketRisuPersonalSettings`; it does not accept an arbitrary top-level key.
- **CPU, memory, resources, and security — structural plus measured.** The
  runtime delta is one fixed manual entry visited by the already bounded
  native search loop. It adds no recursive traversal, listener, handle,
  network call, persistent queue, or user-controlled executable/path content.
  Full target tests and build passed. No universal query-latency claim is made
  beyond this fixed one-entry delta.
- **Mobile/UI behavior — prepared surface.** Automated search tests prove
  result identity and route, while Svelte diagnostics/build prove composition.
  Actual iPhone focus, tap, narrow-screen transition, PWA reload, and the
  user's persisted database cannot be observed from this source-only
  candidate. The concrete gate is recorded below.

### Phase 3 — triage

- **Q3, fixed:** the duplicated short anchor was caught before writes and
  replaced with a unique native-object anchor.
- **Q3, fixed:** exact-one-result tests now catch a future duplicate manual
  key instead of accepting it through a weak existence assertion.
- **Q3, resolved by measured behavior:** target filtering, search queries,
  route selection, target tests, diagnostics, build, reapply, and exact revert
  passed on their declared targets.
- **Q3, resolved by preserved behavior:** optional namespace updates, default
  import navigation, true-only override, import ownership, save/retry, and
  plugin-array exclusion retain their existing contracts on 1.9.
- **Q4, pending user-visible gate:** iPhone focus/tap/navigation and actual
  persistence across a PWA restart require the consolidated L3 session. This
  does not block the local patcher commit, but it blocks aggregate publication
  and live candidate acceptance.

### Prepared surface and concrete iPhone L3

1. **Personal Settings Search and persistence.** The code/test/build chain is
   closed through one exact result key, route 24, page render, root dirty
   tracking, and save retry. The open link is the actual iPhone dialog focus,
   touch navigation, and persisted production database after PWA restart;
   those are environment/user-state observations unavailable in the detached
   candidate. In the future consolidated L3 candidate: open Settings, tap the
   native search field, type `개인 설정`, verify exactly one Personal result,
   tap it, and verify the `개인 설정` page with the import toggle. Repeat with
   `personal settings`. Turn the toggle on, close the Settings/PWA, reopen it,
   and verify it remains on. A missing/duplicate result, a tap that does not
   open page 24, keyboard/focus trapping, or a reverted toggle is the unsafe
   signal.
2. **Import navigation outcome.** Automated/runtime tracing closes parsing,
   insertion, and the final navigation condition, but cannot observe the
   actual iPhone screen transition with the user's import assets. With the
   toggle off, import a disposable local character card and verify the app
   follows the existing new-character navigation. Return to the source screen,
   turn the toggle on, import another disposable card/package, and verify the
   source screen remains while the new character appears in the character
   list. Repeat one disposable Realm import with the existing Realm redirect
   setting enabled and verify the Realm/source screen remains. Imported user
   data is not deleted as part of this gate; any cleanup needs separate
   approval. Navigation suppression without a saved character, or a character
   switch while the toggle is on, is the unsafe signal.

### Cross-piece integration check

The audit combined target-scoped filtering, route ownership, native search,
Personal page rendering, database mutation/save, and three import surfaces.
The interaction review found and fixed both the ambiguous native-manifest
anchor and the weak duplicate-key assertion. The final verified staging and
round trip used the combined Personal and native 1.9 graph; the 1.8 exhaustive
gate used the same catalog with the scoped units present but inactive.

## Remaining gates and publication state

The feature's concrete iPhone scenarios remain queued for the consolidated
L3 session chosen by the user. Later 1.9 packs, the aggregate graph, K12,
review, and final raw-selection gate remain separate work.

No push, tag, release, installer rebuild, live PocketRisu apply, data
migration, PocketRisu restart, or cutover was performed.
