# Changelog

## Unreleased

## 0.2.0-experimental.17

- Leave the module import picker's `accept` hint unset so iOS Files does not
  disable the proprietary `.risum` and `.charx` extensions. Keep exact
  `.json` / `.lorebook` / `.risum` / `.charx` validation in the central
  importer after selection, so broad picker visibility does not broaden the
  accepted or persisted formats.
- Add DOM regressions for selectable `.risum` and compound `.module.charx`, a
  successful compound-CharX conversion/commit path, and the existing silent
  picker-cancel contract. The exact-1.10 disposable target passes 13 module
  lifecycle tests, 26 adjacent RisuM/CharX/shared-owner tests, Svelte 0/0, and
  the 7,918-module production build.

## 0.2.0-experimental.16

- Rebase the rolling aggregate onto exact PocketRisu 1.10.0 while retaining
  native structured-clone storage, iterative large-lorebook diffing, SQLite
  disk-spill VACUUM, orphan purge, and reference safety.
- Add the independent `charx-archive-integrity` hardening pack with pinned
  zip.js 2.8.55, central-directory/local/CRC/overlap validation, explicit
  ZIP/JPEG handling, resource bounds, terminal receipts, and synthetic
  adversarial fixtures. Record that the reported exact original was not
  available.
- Expand `character-import-ux` into one shared character/module import lease.
  Centralize picker/drop/hash/share/launch module inputs, stage RisuM parsing
  before asset writes, preserve low-level confirmation, commit one fresh ID,
  and wait for confirmed module persistence before the single toast succeeds.
- Repair service-worker module share GET, prevent false CharX/RisuM success,
  and keep post-commit persistence failures visible without deleting the
  in-memory module or shared content-addressed assets.
- Preserve the native 1.10 persona selection clamp and duplicate action in the
  organizer. Union persona galleries and folder icons into the server orphan
  purge/settings-backup walker and cover it with an exact-target compat test.
- Fence the native purge writer and caller. Add an exact-1.10 point-in-time
  maintenance variant that retains the 2.2× disk gate, temporary-file VACUUM,
  both checkpoints, and pinned-reader conflict. Allow only a truly empty
  server's first import to skip a nonexistent rollback snapshot.
- Pass 41/41 patcher test files, 1,609 frontend tests, 177 server tests, 74
  compatibility tests, Svelte 0/0 diagnostics, a 7,918-module build, and an
  8,555 KB BG bundle load check. The maximum graph is 35 packs / 716 units /
  267 managed paths with a zero-change re-plan and exact revert.
- Skip the exhaustive raw-selection combination verifier by explicit user
  instruction. Do not interpret the maximum-graph and focused-composition
  passes as exhaustive subset coverage.

## 0.2.0-experimental.15

- Add the hidden exact-PocketRisu-1.9 `server-backup-snapshot-core` plus exactly
  one standard/lazy adapter without adding a user-facing selection bit or a
  second storage authority.
- Pin one read-only SQLite/WAL epoch and verified private filesystem copies for
  full backup download, settings-only download and estimate, and server-file
  backup. Release the storage queue after capture so archive transfer does not
  block ordinary writes.
- Reconstruct chunked values from the pinned reader and fail closed on a
  missing database or chunk, source drift, frame/size mismatch, unsafe
  aggregate size, capacity exhaustion, or disconnect. Clean every source and
  partial server file on all completion paths.
- Serialize inlay compression with source capture and return retryable HTTP 409
  from manual optimize/checkpoint while an active reader prevents the requested
  maintenance. Preserve their prior behavior after the source closes.
- Keep the existing native archive format, routes, UI, standard/lazy storage
  ownership, and live write availability. Leave detached spooling, restart
  retry, retention, and long-reader WAL-duration control to P3.
- Pass all 40 patcher test files and all 4,096 raw selections as 2,048
  normalized graphs across 259 catalog-managed paths with up to 669 units,
  including exact byte/mode round trips. Pass the maximum graph with 132 client
  files / 1,564 tests, 12 server files / 176 tests, Svelte 0/0 diagnostics, a
  7,864-module production build, build-stamp/BG-bundle checks, and a zero-change
  re-plan.
- Generate all four syntax-valid installers twice with identical byte sizes and
  SHA-256 values.
- Admit the generated `all` installer after two zero-work preflight reads and a
  process-first stop. Repeat 132/1,564 client, 12/176 server, 6/6 live P2
  endpoint, Svelte 0/0, production-build, build-identity, BG-bundle,
  production-prune, 254-path current-status, zero-change re-plan, HTTP
  served/local identity, SQLite-integrity, user-data preservation, and
  pin-cleanup gates. Keep actual server-file backup and device background/
  cross-build behavior as separate L3 observations.

## 0.2.0-experimental.14

- Compose the already-live and scoped-L3-qualified `personal-settings 0.4.2`
  appearance branch with the client build fence. Refuse the earlier installer
  plan that would have removed or rewound 21 exact-current appearance paths.
- Add the exact-PocketRisu-1.9 `client-build-fence 0.1.0` pack. Each
  production build emits a fresh random stamp into the client bundle and
  `dist/build-stamp.json`; authoritative storage mutations require the same
  `x-client-build` value before body handling.
- Return HTTP 426 with an explicit `not-committed` outcome for missing or stale
  writer stamps. Keep reads, generation starts, proxy requests, and the
  payload-free database flush available across rolling deployments so active
  work can finish without allowing stale destructive recovery transitions.
  Validate artifact fields as bounded header-safe tokens and emit one startup
  warning when the missing/invalid artifact disables the fence.
- Reload a clean stale client once with a session loop guard. Freeze a client
  with dirty database, composer, draft, or generation state, block document
  and portal mutation surfaces including IME and pointer completion, and
  expose only unsent composer/draft text in the bilingual recovery banner.
  Reconcile the build advertised by the bootstrap session before the first
  write instead of waiting for an HTTP 426.
- Add hidden composition adapters for standard and lazy storage, Kei snapshot
  restore safety, and bg-preserve acknowledgements, cancellation, result and
  draft cleanup. Preserve one existing storage/generation owner in every
  selection.
- Pass all 39 patcher test files and all 4,096 raw selections as 2,048
  normalized graphs across 237 managed paths with up to 607 units, including
  zero-change re-plans and exact round trips. Pass the maximum PocketRisu graph
  with 131 client files / 1,547 tests, 10 server files / 170 tests, Svelte
  diagnostics at 0 errors and 0 warnings, and a 7,859-module production build.
  Confirm one identical 70-character stamp in the artifact, client chunk, and
  server loader.
- Before appearance composition, generate all four syntax-valid installers
  twice with identical sizes and SHA-256 values. Confirm source,
  generic-installer, and fixed-all plans agree at 32 packs, 607 units, five
  ordered collisions, and 233 planned paths.
- Pass the combined 4,096/4,096 selection gate as 2,048 normalized graphs
  across 253 catalog paths and up to 652 units. Pass the applied maximum graph
  with 132 client files / 1,564 tests, 10 server files / 170 tests, Svelte 0/0,
  a 7,864-module build, retained appearance CSS tokens/imports, and the BG
  bundle build/load check. Confirm a zero-change 32-pack re-plan and exact
  source revert.
- Admit only the 23 fence-owned source paths plus patch state to the stopped
  live target. Repeat the full tests, Svelte 0/0, production build, BG bundle,
  production prune, zero-change re-plan, HTTP asset/build-stamp readback, and
  database-preservation checks. Confirm missing/stale live writes return 426
  and `not-committed`, while the exact stamp passes through to the existing
  request validation. Keep the PM2 error log at zero bytes.
- Keep live admission and cross-build device behavior as separate gates. Tabs
  opened before the first fence deployment require one explicit reload because
  those old bundles do not yet contain the HTTP 426 recovery handler. Keep
  operational log ingestion/deletion outside the authoritative user-data
  fence.
## 0.2.0-experimental.13

- Add IBM Plex Sans KR, Gowun Dodum, Gowun Batang, and Hahmlet as four
  additional chat-font choices without changing the version-1 appearance
  storage shape or turning fonts into separate booleans.
- Load each newly added Google Fonts stylesheet only after that face becomes
  the effective selection. Repeated runtime synchronization reuses one
  document-scoped request, failed links are removable/retryable, and Noto
  remains the CJK/Latin fallback for glyphs absent from a selected face.
- Keep the multilingual sample text but rename its heading to `Font preview` /
  `폰트 미리보기`. Hide the preview for the app-font choice and render it
  immediately below the Chat font row for every non-app selection.
- Preserve Safe Mode, Standard-theme scoping, code monospace, user custom CSS,
  and unknown-field-preserving settings writes.
- Isolate the optional stylesheet-loader unit test with real detached link
  elements and an in-memory `Document.head` double. The browser production
  loader remains unchanged, while Vitest no longer starts and aborts a real
  Google Fonts request during teardown.
- Pass all 38 patcher test files, 2,048 exact-1.9 raw selections as 1,024
  normalized graphs, 130 client files/1,554 tests, 9 server files/163 tests,
  Svelte 0/0 diagnostics, and the 7,862-module production build. Two installer
  builds produce identical hashes and the applied candidate re-plans with zero
  changed files.
- Pass the instructed user-visible appearance L3: app font hides the preview,
  a non-app font shows `폰트 미리보기` immediately below Chat font, the
  selected face reaches preview and chat, and code stays monospace. This scoped
  result does not promote unrelated aggregate PocketRisu 1.9 L3 rows.

## 0.2.0-experimental.12

- Apply the selected chat font to every multilingual-preview child instead of
  only its parent. PocketRisu's global `*` font declaration otherwise assigns
  the app font directly to each language span and prevents inheritance.
- Remove font-product examples from the chat-font help text and remove the
  font-specific note below the multilingual preview. Font names remain only
  where they are required as selectable option labels.
- Keep actual chat typography, font-load status, Safe Mode behavior, and the
  code/keyboard monospace reset unchanged.
- Pass all 38 patcher tests, 2,048/2,048 exact-1.9 selections as 1,024 graphs,
  focused 10/10 appearance tests, Svelte 0/0 diagnostics, and the 7,862-module
  production build. The stopped live tree repeats its full 130/1,549 client
  and 9/163 server tests, restarts with the corrected served CSS, and preserves
  the observed database, empty custom CSS, and appearance settings exactly.

## 0.2.0-experimental.11

- Add `Noto Sans KR` and `Noto Serif KR` to the PocketRisu 1.9 chat-font enum
  while keeping app font and Paperlogy values backward compatible inside the
  existing appearance schema version 1.
- Add a multilingual settings preview with Korean, English, Japanese,
  Simplified Chinese, Traditional Chinese, and French samples. Report app,
  paused, loading, loaded, failed-fallback, and unavailable states from the
  browser Font Loading API.
- Resolve one token per selected font rather than modeling font choices as
  booleans. Safe Mode, the master switch, unknown future schemas, and
  non-Standard themes continue removing every effective font token without
  rewriting saved values.
- Apply the selected font to message descendants as well as the `.chattext`
  root, then restore code-related elements to the monospace stack. This keeps
  the existing broad important user-CSS font declaration from masking most of
  the selected chat face without changing the user-owned CSS itself.
- Load Noto as variable, unicode-range WOFF2 subsets through the official
  Google Fonts CSS endpoint. Document the SIL OFL 1.1 source, Korean default
  Han glyph forms, runtime availability/privacy dependency, and the reason a
  self-hosted binary pack remains a separate patcher-format change.
- Pass all 38 patcher test files and all 2,048 exact-1.9 raw selections as
  1,024 normalized graphs across 239 catalog paths with exact round trips. A
  clean rolling-all staging candidate passes 130 frontend files/1,549 tests,
  9 server files/163 tests, Svelte 0/0 diagnostics, production build, and BG
  bundle build/load. The generated installer re-plan changes no file across
  the 234 active managed paths.

## 0.2.0-experimental.10

- Add a PocketRisu 1.9-only `Personal → CSS appearance` sub-tab with a master
  switch and typed controls for chat typography, composer presentation,
  sidebar decoration, declarative setting-row spacing, and jailbreak-control
  visibility. The existing import-navigation setting remains the first tab.
- Store choices in version-1 structured personal settings. Read normalization
  is non-mutating; leaf writes preserve unknown personal-root,
  appearance-root, and feature-group fields; malformed or future schemas are
  preserved and fail closed.
- Resolve active features to one stable whitespace-tokenized
  `data-pocketrisu-css` root attribute. Bootstrap applies the initial state
  before the loaded screen, the app runtime keeps it synchronized, and Safe
  Mode removes all effective tokens while retaining saved choices.
- Add unlayered, PocketRisu Standard-scoped static CSS after the base Standard
  sheet and before user custom CSS. Paperlogy affects message prose only,
  code keeps monospace behavior, Korean prose gains long-token fallback, and
  block-code wrapping never hides overflow.
- Render the normal Send action and jailbreak-toggle visibility from the same
  effective resolver. Resend, active-generation stop/loading behavior, and
  the stored jailbreak value remain unchanged.
- Register the appearance sub-tab with native 1.9 Settings Search and connect
  setting-row labels/help to switch and select controls with stable accessible
  identifiers.
- Keep every appearance patch unit scoped exactly to PocketRisu 1.9.0. The
  existing 1.8.1 Personal Settings pack receives no appearance adapter or
  appearance source path.
- Leave the live/user `customCSS` value untouched. Replacing it remains a
  separate, explicitly approved migration with byte/hash/revision backup and
  exact restore verification.
- Pass all 38 patcher test files and exact-1.9 exhaustive verification across
  2,048 raw selections and 1,024 normalized graphs. The final rolling-all
  candidate resolves 587 units and 234 managed paths, passes 130 frontend
  files/1,545 tests, 9 server files/163 tests, Svelte 0/0 diagnostics, a
  7,862-module production build, and an 8,464,290-byte BG bundle load check.
  Repeated apply changes no file and revert restores every tracked byte.
- Admit the 587-unit graph to the stopped live PocketRisu 1.9 target after
  active, pending, deliverable, and result work all measured zero. The live
  tree repeats the 130/1,545 client, 9/163 server, Svelte 0/0, 7,862-module,
  and BG load gates; restarts online with an exact served/local main-asset
  hash; and retains the original 19,579-byte `customCSS` at the same database
  revision and SHA-256.
## 0.2.0-experimental.9

- Import bg-preserve `v1.0.1`, including direct iOS touch-end dispatch for
  rendered module controls and source-aware module selection after the server
  installs a new database snapshot.
- Preserve the existing manual-trigger/Lua dispatch, scroll and multi-touch
  rejection, keyboard/programmatic click path, output-trigger orchestration,
  and provider rate-limit behavior.
- Exclude exactly three standalone `nodeStorage.ts` asset-retry hooks during
  bg-preserve import because the hidden standard/lazy adapters already own
  those storage paths. Add importer coverage that rejects any broader or
  missing exclusion.
- Import 179 bg units: 58 owned files plus 121 host hooks. Relative to the
  previous manifest, add four owned files and eight hooks, update the existing
  server orchestrator, and remove no prior unit.
- Pass 20 patcher test files with 142 top-level declarations. Verify all 1,024
  raw selections as 512 normalized graphs across 152 managed paths and up to
  305 units, including zero-change re-plans and exact byte/file-mode reverts;
  generate all four syntax-valid installers twice with identical bytes.
- Reconcile the live rolling-all installation to 152 current paths and a
  zero-change plan, restart only with active/durable/parked work at zero, and
  pass root, asset-hash, cache-status, bundle-freshness, and error-log smoke
  checks.
- Pass the iPhone L3 for one-tap GigaTrans request status without scroll
  activation and for automatic translation surviving background/return.
  Provider 429 handling remains out of scope.

## 0.2.0-experimental.8

- Split `personal-settings 0.1.1` from one 181-line manifest and three
  combined source files into a small root composition manifest, shared
  manifest helpers, `core/`, and the independently owned
  `settings/import-navigation/` feature.
- Keep the stable public `personalSettings.ts` entry point, all 14 previously
  published unit IDs, local and Realm hook payloads, optional database
  namespace, and import-navigation behavior. Add four internal units for
  shared storage plus the extracted setting logic, tests, and Svelte section.
- Pass 19 patcher test files with 141 top-level declarations. Verify all 1,024
  raw selections as 512 normalized graphs across 146 managed paths and up to
  293 units, including zero-change re-plans and exact byte/file-mode reverts;
  generate all four syntax-valid installers twice with identical bytes.
- Pass the clean unified PocketRisu candidate with 99 frontend files and 1,249
  tests, Svelte diagnostics with no findings, and a 7,725-module production
  build.
- Apply only seven Personal-owned source files and patch state to the live
  rolling-all installation. Pass focused 4/4 tests, Svelte 0/0, a
  7,725-module frontend build, an 8,101 KB BG bundle build/load check, 146
  current managed paths, exact served/local main-asset SHA-256, root 200,
  unauthenticated BG cache-status 401, unchanged error-log size/mtime, and a
  zero-change re-plan without restarting PocketRisu.
- Pass the iPhone L3 for the Personal menu, persisted toggle, and
  import-screen retention after the modular split.

## 0.2.0-experimental.7

- Add the independent `personal-settings 0.1.0` pack to the rolling
  `features` and `all` presets. It places a built-in `개인 설정` page directly
  after System without installing a plugin or writing `Database.plugins`.
- Add the opt-in `캐릭터 임포트 후 현재 화면 유지` toggle. When enabled,
  completed local card, character-package, and Realm imports remain on their
  import-start screen while the imported character stays saved in the
  character list; creating a character from scratch still opens it.
- Keep existing behavior when the setting is absent or disabled. Realm still
  follows PocketRisu's existing `임포트 시 캐릭터로 이동` setting or a forced
  redirect unless the personal override is enabled.
- Store the toggle under the optional
  `Database.pocketRisuPersonalSettings` namespace and preserve future fields
  when updating it. The navigation decision reads the latest toggle value at
  import completion without changing the import parse, confirmation, or save
  contracts.
- Pass 19 patcher test files with 140 top-level declarations. Verify all 1,024
  raw selections of the ten user-facing packs as 512 normalized graphs across
  142 managed paths and up to 289 units, including zero-change re-plans and
  exact byte/file-mode reverts on PocketRisu v1.8.1.
- Pass the final clean unified candidate with 98 frontend files and 1,248
  tests, 53/53 server tests, 53 compatibility tests with 5 skipped, Svelte
  diagnostics with no findings, the production frontend build, and the BG
  bundle build/load check.
- Apply only the eight new Personal source paths and patch state to the live
  rolling-all installation while retaining 134 current paths. Pass focused
  3/3 tests, Svelte 0/0, a 7,722-module frontend build, an 8,101 KB BG bundle
  build/load check, exact served/local main-asset SHA-256, root 200,
  unauthenticated BG cache-status 401, and a zero-change re-plan without
  restarting PocketRisu.
- Pass the iPhone L3 for the Personal menu, toggle behavior, import-screen
  retention, and cold-reopen persistence. Realm's separate branch remains
  covered by automated predicate and build gates; no separate Realm hands-on
  result was reported.

## 0.2.0-experimental.6

- Add the independent `character-import-ux 0.1.1` pack to the rolling
  `features` and `all` presets. Ordinary JSON, PNG, JPEG, CharX, shared-file,
  Chub, and Realm character imports use one non-blocking Sonner progress toast
  instead of the full-screen reading/asset-progress modal.
- Create that progress toast component once and update only its subscribed
  status store. This avoids `svelte-sonner 1.1.0` rearming an updated
  infinite-duration toast and repeatedly removing/recreating it during fast
  asset progress. Put stable-width counters in the same title: known totals
  render like `(001/014)` and one-pass PNG streams render like `(001/???)`.
- Release the import lease and `beforeunload` listener if the custom progress
  toast itself cannot mount, so that a presentation failure cannot leave
  imports and guarded storage actions disabled until reload.
- Keep messages, navigation, character editing, and unrelated settings usable
  during import. Refuse only a second import, page unload, self-update,
  database/backup/snapshot replacement, save-folder import, and migrated-file
  cleanup until the active import reaches a terminal state.
- Read PNG character chunks and embedded assets in one streaming pass and give
  both core imported-character constructors a stable initial chat ID before
  insertion. Package import and CharX-to-module conversion keep their parent
  blocking/atomic progress contracts.
- Do not emit import success merely because parsing returned. Enlist the new
  character and every full chat in lazy-chat tracking, wait until their stable
  IDs appear in the last server-confirmed database, flush the local database
  write, and report confirmation failures through the same toast.
- Normalize superseding relations after dependency expansion as well as at the
  raw-selection boundary. Selecting `character-import-ux` together with the
  narrower startup cache now adds lazy-chat and then removes startup-cache
  instead of attempting to compose both storage implementations.
- Pass 18 patcher test files with 134 top-level declarations, 97 frontend
  files with 1,245 tests, 53/53 server tests, 53 compat tests with 5 skipped,
  Svelte diagnostics with no findings, the production frontend build, and the
  BG bundle build/load check on a clean PocketRisu v1.8.1 candidate. Verify
  all 512 raw selections as 256 normalized graphs across 136 managed paths and
  up to 275 units with zero-change re-plans and exact byte/file-mode reverts;
  generate all four syntax-valid installers twice with identical hashes.
- Pass the follow-up iPhone gate with one continuously visible import toast,
  in-place stage/counter updates, non-blocking navigation and messaging, and a
  successful durable import after cold PWA reopen.

## 0.2.0-experimental.5

- Repair missing initial chat IDs at the lazy-chat write boundary only when
  the last confirmed database proves the character is new and the chat payload
  is fully hydrated. Existing-character identity loss, placeholders, stubs,
  and missing baselines continue to fail closed.
- Apply the same bounded repair before API v3 database validation so import
  plugins cannot insert a new character whose initial chat has no stable ID.
  Keep API v2 direct mutations covered by the ordinary save boundary.
- Give the safe blank chat created after a failed server cold-storage restore
  its stable ID at construction time.
- Add focused identity tests for new-character repair, existing-character and
  lazy-payload refusal, missing-baseline refusal, atomic failure, and generated
  ID collision retry. Verify the pack on clean PocketRisu v1.8.1 with 1,021
  frontend tests passed and 3 skipped, 53/53 server tests, 53 compat tests
  passed and 5 skipped, Svelte diagnostics with no findings, a production
  build, zero-change re-plan/current status, and exact source/mode revert.

## 0.2.0-experimental.4

- Store format-2 intent as either a rolling preset or a pinned custom
  capability list. Interactive all and `--all` follow newly published packs;
  customize, `--packs`, and revert remain explicit and stable.
- Derive rolling `all`, selector availability, and narrow profile defaults
  from the active catalog and validated per-manifest `presetDefaults`
  metadata. Adding a pack now requires one catalog registration and optional
  narrow-preset metadata rather than edits to duplicated profile arrays.
- Read legacy format-1 intent conservatively: only an exact current effective
  preset match becomes rolling, while partial or older selections stay pinned.
- Cover future-pack inclusion, custom pinning, empty revert persistence,
  legacy migration, metadata ETags, and catalog invariants in the patcher
  suite. Pass 126/126 tests, all 256 user-pack selections with exact byte/mode
  round trips, reproducible generation and syntax checks for all four
  installers, and a live migration that skips all 126 managed source paths,
  writes only state/intent metadata, and immediately re-plans to zero changes.
- Pass the unchanged live PocketRisu source through 95 test files and 1,232
  tests, Svelte 0/0 diagnostics, a 7,716-module production build, and an 8,094
  KB BG bundle load check. Restart with active/durable work at zero, then
  confirm root HTTP, the BG cache-status 401 gate, exact served/local asset
  hash, no stale bundle warning, and zero new stderr bytes. No new UI L3 is
  needed because this checkpoint changes patcher policy and live metadata only.

## 0.2.0-experimental.3

- Add an independent `character-organizer` pack to the feature, all, and
  universal capability catalogs. It registers a built-in hamburger-menu
  entry without modifying the persisted plugin array.
- Arrange root characters, character folders, and opened-folder contents in
  paginated 4×4 grids with explicit one-slot left/right controls and no drag,
  long-press, or touch-scroll interception.
- Keep a newly named folder as component-local draft state until its first
  character is selected, then commit the move and complete non-empty folder
  in one `characterOrder` assignment. Closing, backing out, or discarding
  before that selection writes nothing.
- Add explicit folder membership selection and folder rename/removal while
  keeping characters, folder images/colors, and the original sidebar drag
  implementation. Any move that would empty and remove a persisted folder
  requires confirmation.
- Pass 17 patcher test files, every selection of the eight public packs,
  exact byte/mode round trips, reproducible installer generation, the live
  PocketRisu suite with 95 files and 1,232 tests, Svelte 0/0 diagnostics,
  frontend and BG bundle builds, restart smoke checks, and iPhone L3 for menu
  coexistence, 4×4 arrangement, draft discard, first-member persistence, and
  last-member character preservation.

## 0.2.0-experimental.2

- Add an explicit interactive and non-interactive install-all choice while
  retaining resolver-controlled storage superseding, dependencies, and order.
- Let the same universal artifact print a saved conflict report or optionally
  deliver it into one exact-name RisuAI persona description, module lorebook,
  or character description through PocketRisu's authenticated loopback API.
- Refuse missing or duplicate report receivers, direct SQLite writes, remote
  delivery hosts, concurrent database drift, and unverified delivery; flush
  through PocketRisu with a local session cookie that does not claim the active
  writer session, then re-read the exact report before reporting success.

## 0.2.0-experimental.1

- Remove the startup database cache's per-boot System Log telemetry after
  production validation, while preserving ETag revalidation, decoded/raw cache
  hits, authoritative network fallback, and cache invalidation behavior.
- Add one universal installer whose users select capabilities while a
  deterministic resolver handles dependencies, superseded packs, conflicts,
  and hidden BG/storage adapters.
- Separate durable user intent from the exact applied-state snapshot, with
  transactional migration from format 1 state and compatibility preset
  wrappers for the three existing artifacts.
- Refuse unknown upstream targets before application and generate private
  Markdown/JSON reports with pack, unit, relative file, verified anchor,
  candidate line, and exact refusal evidence when available.
- Add an isolated `stage` lifecycle that never overlaps the live tree, applies
  only a fresh verified candidate, runs frozen install/test/check/build and
  the BG bundle builder, then writes an explicit ready-or-failed receipt
  without performing cutover or restart.
- Add a source-only maintainer qualification gate for exact versions declared
  `reviewing`; downloader artifacts continue to accept only `verified`
  targets.
- Add a disabled-by-default, notification-only HTTPS update feed with host
  allowlists, no installed-version transmission, private caching, and
  fail-open network behavior.

## 0.1.7

- Promote the parser and toolchain hardening checkpoints together as the next
  stable release for PocketRisu `v1.8.1`.
- Replace the three former parser skips with passing regression coverage for
  ChatML terminal markers, depth-aware Thoughts extraction, and CBS logical
  precedence.
- Add independently versioned test and build hardening for Node.js 25
  `localStorage` behavior and Lightning CSS 1.33.0 resolution.
- Preserve feature-only ownership while including both hardening packs in the
  dedicated `hardening` and unified `all` profiles.
- Retain automatic content-addressed ETags, reproducible installers, frozen
  dependency installation, and exact byte-plus-mode revert boundaries.
- Pass all 56 patcher tests and fresh/live PocketRisu runs with 94 files,
  1,218 tests, no skips, Svelte 0/0 diagnostics, production builds, and BG
  bundle load checks.
- Deploy the unified profile with one Lightning CSS 1.33.0 resolution, restart
  only after active and parked orchestration counts reach zero, pass HTTP
  smoke checks, and finish with a zero-change patch plan.

## 0.1.6-experimental.2

- Add an independent `toolchain-hardening` pack to the `hardening` and `all`
  profiles without adding it to the feature-only profile.
- Replace Node.js 25's incomplete experimental global `localStorage` with
  `happy-dom` Storage only when the required API is missing, retaining normal
  browser-like and CI environments.
- Override Lightning CSS to 1.33.0 across Tailwind, Vite, and the frozen
  lockfile, removing false `::highlight` compatibility warnings.
- Keep the real 2,000 kB lazy-chunk warning visible and document the current
  model-data, Monaco, WebLLM, and tokenizer sources plus re-evaluation triggers.
- Document the complete new-pack workflow: profile boundaries, automatic
  content-addressed ETags, semantic version bumps, reproducible installers,
  current-state re-plans, frozen dependency resolution, and exact revert.
- Pass 10/10 patcher tests; 63 standalone hardening files with 936 tests; and
  94 unified files with 1,218 tests, all without skips under Node.js 25.
  Complete Svelte 0/0 diagnostics, production build, BG bundle load check,
  current ETags with no drift, and exact source revert.

## 0.1.6-experimental.1

- Add an independent `hardening` profile containing `parser-hardening`, and
  include the same pack in the unified `all` profile.
- Drop only a terminal, empty, unterminated ChatML assistant generation marker
  while preserving content-bearing unterminated messages and explicitly ended
  empty messages.
- Replace greedy Thoughts extraction with one shared depth-aware scanner for
  ChatML and the main response path, covering sibling, empty, nested, and
  unmatched blocks.
- Evaluate CBS comparison operands before `and`/`or` while preserving
  right-to-left logical evaluation and the legacy path without logical
  operators.
- Replace all three pre-existing parser skips with passing regression
  specifications.
- Keep hardening apply, status, revert, and SHA-256 pack ETag independent; test
  that any managed-content change produces a different ETag.
- Pass 9/9 patcher tests, a clean PocketRisu v1.8.1 suite with 94 files and
  1,218 tests passed with no skips, Svelte diagnostics at 0 errors and 0
  warnings, production build, and exact hardening/unified round trips.

## 0.1.5

- Add a multi-image gallery to each persona while retaining `icon` as the
  selected compatibility image used by chats, plugins, and persona PNG export.
- Replace the duplicate large active-image preview with the gallery in the
  editor image area, with multi-file import, thumbnail activation, and
  non-destructive gallery removal.
- Let Persona PNG export choose one gallery image without changing the active
  persona image, while preserving the existing default-image fallback.
- Adopt every legacy single image into its persona gallery without moving or
  deleting asset data.
- Preserve persona gallery and persona-folder images across asset cleanup,
  resource replacement, and partial backup.
- Pass 8/8 patcher tests, the clean PocketRisu v1.8.1 suite with 1,206 tests
  passed and 3 intentionally skipped parser specifications, Svelte diagnostics,
  production build, exact installer regeneration, production health checks, and
  iPhone gallery/export L3.

## 0.1.4

- Fix new-chat saves when PocketRisu inserts the new chat at index zero before
  its database metadata reaches the server.
- Resolve chat reads by stable ID whenever `x-chat-id` is present, retaining
  path-index lookup only for legacy callers without the header.
- Classify create versus update from the last server-confirmed database. Only
  an authoritative missing new ID enables `If-None-Match: *`; remote deletion
  and concurrent ID collision remain explicit conflicts.
- Preserve lost-ack confirmation for successful creates and keep the composer
  draft on blocked saves.
- Pass the clean PocketRisu v1.8.1 suite with 1,197 tests passed and 3
  intentionally skipped parser specifications, Svelte diagnostics, BG bundle
  load check, production build, exact apply/revert round trip, and iPhone L3.

## 0.1.3

- Add custom folder images to the Persona organizer using PocketRisu's existing
  content-addressed asset storage.
- Let an opened folder choose, replace, or reset its image through a closable
  dialog while retaining the existing folder icon as the default.
- Render custom folder images on folder cards and grouped deletion previews
  without deleting shared asset data when a folder image is reset or removed.

## 0.1.2

- Replace the Persona page's non-closable create/import selector with a local
  dialog that has both an `X` and an explicit `Close` action.
- Add root and folder-scoped bulk deletion modes with reversible selection,
  `Cancel`/`Done` controls, and locked folder navigation while selecting.
- Preview every selected persona with image, name, and alias before deletion;
  selected folders are shown separately with all contained personas.
- Apply deletion only after the final Yes action and refuse any selection that
  would leave PocketRisu without a persona.

## 0.1.1

- Move the persona organizer to the actual Settings → Persona editor while
  leaving the chat persona-selection popup unchanged.
- Replace persona drag-and-drop with paginated 4×4 cards, explicit folder
  creation and membership selection, and one-slot `Arrange` controls.
- Add the independent prompt preset integrity pack and keep startup, lazy-chat,
  and bg-preserve composition current through per-pack ETags.
- Pass PocketRisu v1.8.1 clean-copy and production validation, including the
  live iPhone persona and prompt workflows.

## 0.1.1-experimental.3

- Remove persona drag-and-drop and every touch/scroll interception path.
- Make `Arrange` expose explicit left/right controls that move a persona one
  slot within its current area or move a folder one slot among folders.
- Keep `Arrange` active when opening a folder so its personas receive the same
  one-slot controls.
- Add a folder `+` action that opens a paginated 4×4 persona grid; tapping a
  thumbnail selects or deselects that persona's folder membership.

## 0.1.1-experimental.2

- Replace iPhone's mid-gesture long-press scroll cancellation with an explicit
  `Arrange` mode that locks the real `.rs-setting-cont-4` settings scroller
  before the next touch begins, then restores its exact scroll state on
  `Done`.
- Add the independent `preset-integrity` pack. It preserves every prompt
  preset while clamping an invalid persisted active index at load/save/change
  boundaries and guarding the Prompt → Basic Info name binding.
- Add the new pack to both default profiles with its own manifest ETag and
  embedded PocketRisu invariant tests.

## 0.1.1-experimental.1

- Move the persona organizer from the chat persona-selection popup to the
  actual Settings → Persona editor identified by its name, note, and
  description fields.
- Restore the selection popup to PocketRisu's original implementation during
  patch recomposition.
- Keep the settings page's existing `+` create/import menu and editor actions,
  while adding a separate visible `New folder` control and 80×80 folder cards.
- Paginate the root organizer and every folder as animated 4×4, sixteen-card
  pages with arrows, dots, and held-edge drag navigation.
- Lock iOS page scrolling only after long-press drag activation, preview
  reordering with animated card reflow, and persist the order only on drop.

## 0.1.0

- Promote the composable NodeOnly patcher to stable after PocketRisu v1.8.1
  clean-copy and production validation.
- Ship the unified and features-only profiles with startup database caching,
  lazy chat synchronization, persona folders/reordering, and optional
  bg-preserve v1.0.0 composition.
- Preserve chat and patch state through CAS, WAL, exact collision ordering,
  stale-plan refusal, transactional rollback, and POSIX mode round trips.
- Pass the live 89-file PocketRisu suite (1,179 tests, 3 skipped), Svelte
  diagnostics, BG bundle load check, production build, restart health checks,
  and iPhone functional validation.

## 0.1.0-experimental.7

- Serialize each target root with an exclusive owner lock and reject a stale
  plan before creating a transaction journal or touching any managed file.
- Preserve existing POSIX modes through apply, failure recovery, and revert;
  new owned files default to `0644` and private patch state to `0600`.
- Bound only new-chat `awaitingMetadata` WAL quarantine by record and byte
  capacity. Existing recoverable payloads are never evicted; the server logs
  retained backlog and rejects an unsafe new ACK once capacity is reached.
- Clean up persona touch drag state on component unmount and make the tested
  260 ms long-press contract explicit.
- Mark fixed-profile pack availability in `list` and add a CI gate for
  reproducible installers, PocketRisu v1.8.1 apply/check/build/revert, and
  byte-plus-mode round trips.

## 0.1.0-experimental.6

- Validate stripped-database transitions instead of rejecting every save when
  an accepted legacy database already contains a metadata-only chat shell.
- Grandfather only the same character/chat identities; newly introduced
  missing payloads, malformed stubs, and cross-character moves remain blocked.
- Return an explicit missing-payload response for legacy shells and keep the
  composer draft when the user attempts to send from one.

## 0.1.0-experimental.5

- Add lazy chat hydration, incremental CAS chat saves, durable chat WAL,
  three-way database conflict reconciliation, and a BG durable-save adapter.
- Combine decoded startup caching with the lazy database shape and race the
  two iOS browser-cache metadata probes independently.

## 0.1.0-experimental.4

- Replace drag-to-create folders with an explicit `New folder` action.
- Render persona thumbnails and folder cards with matching 80×80 images;
  clicking a folder opens its contents as a distinct drop zone.
- Move personas into an opened folder or folder card, back to the unfiled
  area, or before another persona without overlapping drop actions.
- Record startup-cache outcome and probe/request/hydration timings in
  PocketRisu System Logs.
- Reopen cache validation after isolated cold/warm measurement confirmed a
  database 200→304 path but found substantial non-cache startup work.

## 0.1.0-experimental.3

- Separate persona drop targets visually and behaviorally: a highlighted row
  creates or joins a folder, while a highlighted gap only reorders.
- Execute the last displayed iPhone drop target instead of resolving the
  finger position again at touchend, preventing an adjacent reorder gap from
  replacing a visible folder action.

## 0.1.0-experimental.2

- Keep persona HTML drag desktop-only so PocketRisu's iOS drag polyfill cannot
  preempt the popup's 260 ms long-press reorder controller.

## 0.1.0-experimental.1

- Add one composable patch engine with `features` and `all` artifacts.
- Import bg-preserve v1.0.0 as 116 exact hooks and 55 owned files.
- Add authenticated ETag-validated PocketRisu startup database caching adapted
  from PocketRisu PR #49.
- Add persona folders, desktop/touch drag-to-move, and drag-to-reorder.
- Add SHA-256 pack ETags, collision-only ordering, partial file recomposition,
  transactional writes, interrupted-write recovery, drift refusal, and exact
  apply/revert round-trip tests.
