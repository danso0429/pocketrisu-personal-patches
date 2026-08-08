# PocketRisu Personal Patches

Private, composable patch delivery for PocketRisu NodeOnly. The current
stable release is `v0.1.7`, and its manifests target PocketRisu `v1.8.1`.
The current development checkpoint is `v0.2.0-experimental.13`.

## Universal installer and compatibility presets

`pocketrisu-patcher.cjs` is the primary artifact. Users select capabilities;
the resolver decides pack order, dependencies, superseded packs, and hidden
integration adapters. `configure` may be used interactively or with
`--packs`; its first prompt offers all, customize, or none. Choosing all, or
using `--all`, stores a rolling preset policy: a newer qualified patcher
automatically includes every newly published user-facing pack in that preset.
Customize and `--packs` store a pinned capability list, while `none` stores
an empty pinned list. Because lazy chat synchronization contains startup
caching, the all graph resolves to lazy storage instead of installing both
storage implementations. A newly included pack still passes normal planning,
compatibility, and staging gates; a conflict blocks before source writes.

The older named artifacts remain preset wrappers:

- `pocketrisu-features.cjs` manages `lazy-chat-sync` (including startup cache),
  `persona-organizer`, `character-organizer`, `character-import-ux`,
  `personal-settings`, and `preset-integrity`.
  An existing bg-preserve installation remains an external layer.
- `pocketrisu-hardening.cjs` manages `parser-hardening` and
  `toolchain-hardening`.
- `pocketrisu-all.cjs` combines the feature packs, parser and toolchain
  hardening,
  bg-preserve `v1.0.1`, and the `lazy-chat-bg-adapter` durable-save barrier.

All four artifacts are generated from the same engine and manifests. They are
not separate implementations.

## Release history

| Release | What changed |
| --- | --- |
| `v0.2.0-experimental.13` | Adds IBM Plex Sans KR, Gowun Dodum, Gowun Batang, and Hahmlet as on-demand chat-font choices. The preview is now named Font preview, stays hidden for the app-font selection, and appears immediately below Chat font for any other choice. |
| `v0.2.0-experimental.12` | Applies the selected chat font to each multilingual-preview child so PocketRisu's global element font cannot mask it, and removes product-specific examples from the font help and preview note. Actual chat typography and monospace preservation remain unchanged. |
| `v0.2.0-experimental.11` | Extends the 1.9 Personal appearance font selector with Noto Sans KR and Noto Serif KR, adds a multilingual preview with real font-load status, and applies selected fonts through message descendants so the existing broad user-CSS font rule cannot mask them. Code keeps its monospace stack and user custom CSS remains untouched. |
| `v0.2.0-experimental.10` | Adds PocketRisu 1.9-only Personal → CSS appearance controls backed by a versioned, unknown-field-preserving settings schema, one Safe-Mode-aware root token attribute, scoped static CSS, render-time send/jailbreak behavior, searchable sub-tab routing, and accessible declarative setting rows. Existing custom CSS remains user-owned and is not migrated automatically. |
| `v0.2.0-experimental.9` | Imports bg-preserve v1.0.1 so iOS-rendered module controls dispatch directly and server module selection follows each installed database snapshot, while the composition importer excludes three standalone storage hooks already owned by the lazy/standard adapters. |
| `v0.2.0-experimental.8` | Splits Personal settings into a small composition manifest, shared core, and setting-owned modules so future toggles can be added independently while retaining the existing public entry point, patch unit IDs, storage contract, and import behavior. |
| `v0.2.0-experimental.7` | Adds a built-in Personal settings page directly after System and a persisted opt-in toggle that keeps the import-start screen after local card, character-package, and Realm imports without changing import durability or the default navigation behavior. |
| `v0.2.0-experimental.6` | Replaces ordinary character import's blocking reading/progress modal with one non-blocking progress toast, reads embedded PNG data once, and reports success only after the new character and every stable chat ID are confirmed by the server and flushed locally. |
| `v0.2.0-experimental.5` | Repairs a missing initial chat ID only for a fully hydrated character proven new by the last server-confirmed database, while existing identities, lazy placeholders, and missing baselines continue to fail closed. |
| `v0.2.0-experimental.4` | Makes all and named presets rolling catalog policies while keeping customized selections pinned, derives universal inclusion and selector availability from one registered manifest, and conservatively migrates legacy intent. |
| `v0.2.0-experimental.3` | Adds a hamburger-menu Character organizer with paginated 4×4 folder membership and explicit Arrange controls, including a local-only folder draft that cannot persist empty. |
| `v0.2.0-experimental.2` | Adds an explicit install-all path and optional conflict-report delivery into one exact-name RisuAI persona description, module lorebook, or character description through PocketRisu's loopback authenticated database API. |
| `v0.2.0-experimental.1` | Adds capability selection, deterministic pack/adaptor resolution, intent/state separation, detailed no-auto-fix conflict reports, exact-version qualification, isolated candidate staging, and an optional public update-notification channel while retaining private source. |
| `v0.1.0` | Promoted the composable patcher to stable with unified/features profiles, transactional apply/revert, pack ETags, stale-plan refusal, exact collision ordering, POSIX mode preservation, startup database caching, lazy chat synchronization, persona organization, preset safety, and optional bg-preserve composition. |
| `v0.1.1` | Moved Persona organization to Settings → Persona, replaced touch drag with paginated 4×4 membership and explicit one-slot Arrange controls, and added the independent prompt preset integrity pack. |
| `v0.1.2` | Added closable create/import UI and root/folder-scoped bulk persona deletion with reversible selection, grouped previews, a final confirmation gate, and protection for the last remaining persona. |
| `v0.1.3` | Added content-addressed custom folder images with replace/reset and deletion-preview support, then made the full CI gate compatible with its Node.js 22 runner. |
| `v0.1.4` | Fixed new-chat save failures by making stable chat IDs authoritative and classifying create versus update from the last server-confirmed database without weakening remote-deletion or concurrent-create safety. |
| `v0.1.5` | Added a reusable multi-image gallery to every persona, active-image selection, non-destructive reference removal, and an export-time image picker while preserving legacy `icon` compatibility and all gallery/folder assets through cleanup and backup. |
| `v0.1.6-experimental.1` | Added an independent parser-hardening profile and included it in `all`, replacing three permanent parser skips with passing coverage for ChatML terminal generation markers, Thoughts extraction, and CBS logical precedence. |
| `v0.1.6-experimental.2` | Added independent toolchain hardening for Node.js 25's incomplete experimental `localStorage` and Lightning CSS `::highlight` support, while retaining actionable large lazy-chunk warnings. |
| `v0.1.7` | Promoted parser and toolchain hardening together: the three parser specifications now run and pass, Node.js 25 receives a scoped test-storage polyfill, and Lightning CSS resolves consistently through the manifest and frozen lockfile. |

The current `v0.1.7` release has passed 10/10 patcher test files with 56 tests,
a clean standalone hardening run with 63 files and 936 tests passed with no
skips under Node.js 25, a production build without `::highlight` compatibility
warnings, and exact standalone hardening apply/re-plan/status/revert. Its
fresh unified run passed 94 files and 1,218 tests with no skips, Svelte
diagnostics at 0 errors and 0 warnings, the production build and BG bundle
load check, current ETags with no drift, and exact source revert.

The live PocketRisu upgrade applied only the nine parser files, three toolchain
files, and patch state that differed from `v0.1.5`. Frozen install resolved one
Lightning CSS 1.33.0, the same 1,218 tests and Svelte 0/0 diagnostics passed,
the frontend and server bundle rebuilt, and restart smoke checks returned the
expected root, authenticated-status, and hashed-asset responses. A final
unified plan reported no changed files.

The `v0.2.0-experimental.4` checkpoint passes all 126 patcher tests in 17
files. The same 256 raw selections still normalize to 192 graphs and pass
apply, zero-change re-plan, and exact byte/mode revert across 126 managed paths
with up to 257 units. All four installers pass CJS syntax checks and two
consecutive builds produce byte-identical artifacts. The generated installer
was then applied to the live experimental.3 `all` installation: it interpreted
the legacy intent as rolling, skipped all 126 managed source paths, and wrote
only `state.json` ETag metadata plus format-2 `intent.json`. The immediate
re-plan reported no changed files and the stored intent was
`{ format: 2, mode: 'preset', preset: 'all' }`.

The unchanged live source passed 95 PocketRisu test files and 1,232 tests,
Svelte diagnostics at 0 errors and 0 warnings, a 7,716-module production
frontend build, and an 8,094 KB BG bundle build/load check. PocketRisu was
restarted only with active requests and durable operations/results at zero;
root HTTP, the unauthenticated BG cache-status 401 gate, exact served/local
main-asset SHA-256, no stale BG bundle warning, and zero new stderr bytes were
confirmed. No new iPhone L3 was required because this checkpoint changed only
patcher policy and live patch metadata, not any managed PocketRisu source or UI
behavior; those CLI and migration paths are covered by the automated and live
zero-change checks above.

The `v0.2.0-experimental.8` candidate passes 19 patcher test files with 141
top-level declarations. All 1,024 raw selections of the ten user-facing packs
normalize to 512 graphs and pass apply, zero-change re-plan, and exact
byte/file-mode revert across 146 managed paths with up to 293 resolved units.
All four installers pass CJS syntax checks and two consecutive builds produce
byte-identical artifacts. The clean unified PocketRisu candidate passes 99
frontend files and 1,249 tests, Svelte diagnostics at 0 errors and 0 warnings,
and a 7,725-module production build.

The live rolling-all upgrade changed only the Personal pack's seven owned
source files and patch state. Its focused 4/4 tests, Svelte 0/0 diagnostics,
7,725-module frontend build, 8,101 KB BG bundle build/load check, 146 current
managed paths, and zero-change re-plan passed without restarting PocketRisu.
The running server returns root 200 and unauthenticated BG cache-status 401,
and its served main asset is byte-identical to the local build and contains the
Personal and import-navigation labels. The error log size and modification time
did not change. The user passed the iPhone L3 for the Personal menu, persisted
toggle, and import-screen retention after the modular split.

The `v0.2.0-experimental.9` checkpoint imports bg-preserve `v1.0.1` through
the existing composition boundary. Its importer excludes only the three
standalone `nodeStorage.ts` asset-retry hooks because the standard and
lazy-chat adapters already own those exact storage paths; the remaining
bg-preserve delta adds four owned files, eight host hooks, and one updated
server-orchestrator file without removing an earlier bg unit.

The candidate passes 20 patcher test files with 142 top-level declarations.
All 1,024 raw selections of the ten user-facing packs normalize to 512 graphs
and pass apply, zero-change re-plan, and exact byte/file-mode revert across
152 managed paths with up to 305 resolved units. All four installers pass CJS
syntax checks and two consecutive builds produce byte-identical artifacts.

The live rolling-all composition reports all 152 managed paths current and an
immediate zero-change plan. PocketRisu was restarted only after active
requests, durable operations, and parked results were all zero. Root and
hashed-asset HTTP checks, exact served/local asset SHA-256, unauthenticated BG
cache-status 401, BG bundle freshness/load, and the post-restart error-log
window passed. The user then passed the iPhone L3 for one-tap GigaTrans
request status without scroll activation and for automatic translation
surviving background/return. Provider 429 policy remains unchanged.

The `v0.2.0-experimental.11` checkpoint keeps that storage and activation
contract while extending the chat-font enum with Noto Sans KR and Noto Serif
KR. Both Noto choices cover the Korean, Japanese, Chinese, Latin, and extended
Latin scripts represented in the settings preview. Chat messages do not carry
per-language tags, so shared Han characters use Korean glyph forms by default.
The preview uses explicit language tags for its samples and reports whether
the selected face was actually found by `document.fonts`.

Font consumers now include message descendants before restoring
`pre`/`code`/`kbd`/`samp` to the monospace stack. This is required because the
existing user CSS explicitly assigns an important font to every `.risu-chat`
descendant; changing only the `.chattext` parent would leave most rendered
prose on that older explicit value. The existing custom-CSS bytes remain
user-owned and are not rewritten.

The `v0.2.0-experimental.12` follow-up applies the selected family to the
preview's language spans as well as its outer sample element. PocketRisu's
global `*` rule gives each span an explicit app font, so changing only the
parent could not affect the rendered sample through inheritance. The same
follow-up removes product-specific examples from the setting help and removes
the font-specific note under the preview; selectable option labels and
font-load status remain.

The follow-up passes all 38 patcher tests and the complete 2,048-selection
exact-1.9 graph. Its clean 1.9 candidate passes the focused appearance tests,
Svelte 0/0 diagnostics, and production build. The same seven-path transition
was then admitted to the stopped live target, whose full 130/1,549 client and
9/163 server suites, build, zero-change re-plan, HTTP asset readback, and
database/custom-CSS/settings preservation checks passed.

The `v0.2.0-experimental.13` checkpoint adds four visually distinct Korean
families: IBM Plex Sans KR and Gowun Dodum as sans-serif choices, plus Gowun
Batang and Hahmlet as serif choices. These values extend the existing typed
enum, so only one chat font can be selected and no new boolean collection is
created. Their Google Fonts stylesheets are inserted once per browser document
only when selected; Noto Sans KR or Noto Serif KR remains later in each stack
for Japanese, Chinese, French, and other unsupported glyphs.

The same checkpoint moves the preview between the Chat font row and the
remaining appearance settings. It is omitted when `Use app font` is selected
and shown for every non-app choice, including while the master switch or Safe
Mode temporarily pauses the saved font. The preview title is the generic
`Font preview` / `폰트 미리보기`; the multilingual sample text and explicit
language tags remain available for visual comparison.

The source patcher passes all 38 test files. The exact-1.9 verifier passes all
2,048 raw selections as 1,024 normalized graphs across 239 catalog-managed
paths with a maximum of 587 resolved units and exact round trips. A clean
rolling-all staging candidate passes 130 frontend files with 1,549 tests, 9
server files with 163 tests, Svelte diagnostics at 0/0, the production build,
and the BG bundle build/load check. The generated installer then reports the
same 28-pack candidate current across its 234 active managed paths with no
changed file.

The user passed the instructed iPhone appearance L3: app font hides the
preview, every non-app selection shows `폰트 미리보기` directly below Chat
font, the selected face is visible in both preview and chat, and code remains
monospace. A detached-head test double also keeps optional stylesheet-loader
coverage from starting a real font request during Vitest teardown. This is an
experimental.13 appearance checkpoint result; unrelated aggregate 1.9 L3 and
risk decisions remain separate and still block stable `v0.2.0` publication.

The `v0.2.0-experimental.10` checkpoint adds a PocketRisu 1.9-only Personal
appearance child tab without adding a 1.8 adapter. It stores typed choices in
a version-1, unknown-field-preserving personal namespace and resolves their
effective state through one root token attribute. Safe Mode and non-Standard
themes remove the attribute without changing saved values. Static unlayered
CSS remains before the runtime user custom-CSS element, while Send and
jailbreak visibility use the same effective resolver at render time.

All 38 patcher test files pass. The exact-1.9 exhaustive verifier passes 2,048
raw selections as 1,024 normalized graphs. The final 587-unit, 234-path
rolling-all candidate passes 130 frontend files with 1,545 tests, 9 server
files with 163 tests, Svelte diagnostics at 0/0, a 7,862-module production
build, and an 8,464,290-byte BG bundle load check. Its repeated apply changes
no file, and exact revert restores all tracked bytes. A restricted run first
blocked two localhost-binding server files with `listen EPERM`; the unchanged
server suite passed with local socket permission. The build retains existing
CSS Highlight, large-chunk, and dynamic-import warnings.

The four jsDelivr WOFF2 endpoints used for the optional Paperlogy/Galmuri
declarations returned HTTP 206 with `font/woff2`. This is a documented runtime
network dependency; the text-only patch payload does not redistribute the font
binaries. Existing user `customCSS` is not migrated or cleared by this
checkpoint.

The live rolling-all target was stopped only after active requests, queued or
running model jobs, pending sends, deliverable unclaimed main jobs, and result
payloads measured zero. The 587-unit apply changed 25 appearance-owned or
appearance-hook source paths plus patch state. Frozen install reused 109
packages with zero downloads; the full tests, diagnostics, production build,
BG bundle load, production prune, runtime dependency resolution, and 234-path
zero-change re-plan passed again on the live tree.

After restart PocketRisu 1.9.0 is online with zero unstable restarts and active
requests. Root and main asset return 200; served/local
`index-DOiiECqw.js` are both 2,009,698 bytes with SHA-256
`b2400d73e977c091f95fa22eba61fe8ecf96e91281dbe52e299c54383b5e0e23`.
Both unauthenticated BG status routes retain their 401 gate and the error log
did not grow. The database revision, original 19,579-byte custom-CSS SHA-256,
Standard theme, and `custom/Galmuri14` font choice remained exact; no
appearance value was written on the user's behalf.

The `v0.2.0-experimental.3` checkpoint passes 17 patcher test files containing
118 top-level test declarations. All 256 raw selections of the eight
user-facing packs resolve to 192 graphs and pass apply, current-state re-plan,
and exact byte/mode revert across 126 managed paths, with up to 257 resolved
units. The standalone Character organizer applies cleanly to an unmodified
PocketRisu v1.8.1 tree; its 12 focused helper tests pass, Svelte diagnostics
report 0 errors and only the four pre-existing warnings outside its managed
paths, the production frontend builds, and exact re-plan and source revert
checks pass. Report delivery tests cover exact persona/character fields,
inactive module lore, missing and duplicate receivers, loopback URL
restrictions, concurrent hash refusal, durable flush confirmation, and exact
read-back using PocketRisu's actual msgpack dependency without touching live
data. They also require the flush session cookie to be issued without an
`x-session-id`, so report delivery cannot replace RisuAI's active writer
session. All four generated artifacts pass syntax checks and consecutive
generation produces byte-identical files.

The live `--all` transition wrote only the Character organizer's five source
files plus patch state and intent metadata, while 121 already-current managed
paths were not rewritten. The live PocketRisu tree then passed 95 test files
and 1,232 tests, Svelte diagnostics at 0 errors and 0 warnings, the production
frontend build, and the 8,094 KB BG bundle build/load check. RisuAI was
restarted only after active requests and durable operations/results reached
zero; root and authenticated-status smoke checks, the served main-asset byte
match, unchanged stderr, all eight resolved packs and 126 managed paths
current, and a zero-change `--all` re-plan were confirmed. iPhone L3 passed
hamburger-menu coexistence, 4×4 root/folder arrangement and scrolling, local
draft discard through Back and Close, first-member persistence across a cold
PWA reopen, and last-member folder removal without character loss or an empty
folder orphan.

See [CHANGELOG.md](CHANGELOG.md) for experimental checkpoints and the complete
per-release change list. The preceding `v0.1.4` incident analysis and safety boundaries
are in
[docs/NEW-CHAT-SAVE-REGRESSION-2026-07-26.md](docs/NEW-CHAT-SAVE-REGRESSION-2026-07-26.md).

## Feature packs

### Lazy chat synchronization and startup cache

This caches PocketRisu's startup database, not an LLM response or Gemini
context. The storage protocol is adapted from
[PocketRisu PR #49](https://github.com/PocketRisu/PocketRisu/pull/49):

- chat bodies remain outside the startup database payload and hydrate only
  when selected or requested by a plugin;
- chat writes use exact transport revisions, CAS preconditions, bounded JSON
  Patch deltas, and response-loss confirmation instead of unconditional full
  overwrites;
- stable chat IDs, rather than mutable array indices, are authoritative for
  reads whenever the client supplies an ID;
- the last server-confirmed database distinguishes creates from updates, so
  only a confirmed missing new ID may use create-only persistence while a
  remotely removed existing chat remains a conflict;
- a server write-ahead journal preserves acknowledged chat writes until their
  database metadata is durable;
- database conflicts use three-way reconciliation with explicit
  deletion-versus-edit handling;
- legacy metadata-only chat shells already present in an accepted database are
  grandfathered by stable character/chat identity, while new missing payloads
  remain blocked;
- selecting a legacy shell reports that its payload is unavailable, and a send
  attempt keeps the composer draft instead of clearing it;
- the authenticated `/api/read` response is revalidated with its database
  ETag before a browser cache is trusted;
- unchanged startup data can use a decoded IndexedDB baseline, avoiding the
  database transfer and decode;
- normal JSON-patch saves advance a bounded local patch journal;
- missing, corrupt, timed-out, or mismatched cache data falls back to an
  unconditional authoritative server read;
- the server keeps the encoded stubs-only payload paired with the exact ETag,
  so a warm `304` does not decode and re-encode the database.
- IndexedDB and CacheStorage metadata probes race independently, so one stalled
  iOS storage backend cannot delay a valid result from the other for the full
  1500 ms timeout.

An isolated production measurement with writes and writer-session changes
blocked confirmed a database `200` on the first load and `304` on the warm
reload. Two unprofiled runs reduced the loading screen from roughly
2.8–3.0 seconds to 1.7 seconds. The remaining time was outside the database
transfer/decode cache, mainly application initialization and state setup.
Applying or reverting this pack does not delete the
PocketRisu database, chats, assets, or backups.

The all profile keeps two revision domains deliberately separate:

- lazy-chat transport revisions hash the exact encoded chat for storage CAS;
- bg-preserve revisions detect semantic user edits for result merging.

BG result delivery waits for both the chat journal ACK and `/api/db/flush`
before acknowledging and deleting a parked orchestration result.

### Persona organizer

The thumbnail strip at the top of Settings → Persona gains:

- an explicit `New folder` action and single-level folder cards;
- persona thumbnails and folder images with the same 80×80 dimensions;
- a per-persona image gallery with multi-file add, explicit active-image
  selection, and non-destructive removal;
- click-to-open folder contents;
- an `Arrange` action that gives personas and folders explicit left/right
  one-slot movement controls;
- folder content arrangement by opening a folder while `Arrange` is active;
- custom folder images that can be selected, replaced, or reset from inside
  the folder;
- a folder `+` action with a paginated 4×4 all-persona selector for adding or
  removing folder members;
- a closable create/import dialog for the root `+` action;
- root and folder-scoped `Delete` selection modes with `Cancel`/`Done`,
  grouped image/name/alias previews, and a final Yes/No gate;
- folder selection that deletes the selected folder and its contained
  personas together, while always keeping at least one persona;
- folder rename, reorder, and removal (folder removal keeps every persona);
- normal page scrolling at all times, with no persona drag or touch-scroll
  interception.

`Database.personas` remains the canonical persona order, so existing
index-based callers keep working. Selection is restored by stable persona ID
after a reorder. The chat persona-selection popup is left as PocketRisu's
original UI, and the existing name, note, description, image, import/export,
and `+` create/import controls on the settings page remain available.

The existing `persona.icon` field remains the active image consumed by chat
rendering and external integrations. `imageGallery` stores the reusable set,
including that active image. Legacy single-image personas are adopted on load.
The gallery occupies the image area in the editor, and its `Active` badge is the
single active-image indicator. Standard persona PNG export opens a gallery
picker and embeds the selected image without changing the active image; the
full database and partial backup retain every gallery image. Removing an entry
from a persona or resetting a folder image never deletes the shared asset.

### Character organizer

The independent `character-organizer` pack adds a built-in entry alongside
plugin-provided icons in PocketRisu's hamburger menu. It does not install a
plugin, replace `Database.plugins`, or depend on Persona organization.

- The root character order is shown as paginated 4×4 character and folder
  cards, preserving the exact interleaving already stored in
  `characterOrder`.
- `Arrange` adds explicit left/right one-slot buttons. Opening a folder keeps
  the same controls within that folder's membership order.
- `New folder` asks for a name and opens a local draft. The draft is not added
  to the database, does not own an asset, and is discarded when the screen is
  closed or backed out.
- The folder `+` opens the same 4×4 all-character selector. Selecting the
  draft's first member creates a complete non-empty folder and moves the
  character in one array assignment; there is no saved empty-folder interval.
- Existing folders can be renamed, removed while keeping their characters,
  and populated from loose characters or other folders. Moving the final
  member out of a folder requires an explicit confirmation because PocketRisu
  removes empty character folders.
- No character records or assets are deleted. Existing folder color and image
  metadata are copied unchanged, and PocketRisu's original desktop/mobile
  sidebar behavior and drag setting remain available outside this organizer.

All persisted operations replace `Database.characterOrder` once and request an
immediate save. The organizer contains no draggable elements, long-press
handler, touch event handler, or scroll interception.

### Personal settings

The independent `personal-settings` pack adds a built-in `개인 설정` entry
directly after System in PocketRisu's Settings menu. It is a dedicated home
for personal toggles and does not install a plugin or replace
`Database.plugins`.

The pack's root manifest is only a composition boundary. Shared namespace
storage, the stable public `personalSettings.ts` entry point, and the Personal
page shell live under `core/`; each optional feature owns its patch units,
logic, tests, and Svelte section under `settings/<feature>/`. Adding a setting
therefore extends the composition list without growing one monolithic manifest
or page. Version `0.2.0` retains all previously published unit IDs and hook
payloads, and adds two PocketRisu 1.9-only units that register and test the
page in native Settings Search. PocketRisu 1.8.1 keeps the same Personal
Settings graph without reading or creating the 1.9-only search files.

Its first toggle, `캐릭터 임포트 후 현재 화면 유지`, is opt-in:

- when absent or off, local card and character-package imports keep their
  existing automatic navigation, and Realm continues to follow PocketRisu's
  existing `임포트 시 캐릭터로 이동` setting or an explicit forced redirect;
- when on, a completed local card, character-package, or Realm import leaves
  the UI on the screen where that import began while the imported character
  remains saved and available in the character list;
- creating a character from scratch still opens the new character;
- the navigation decision reads the latest toggle value when import finishes,
  so changing it during a non-blocking import affects only the final
  navigation decision, not parsing or persistence.

The setting is stored in the optional
`Database.pocketRisuPersonalSettings` namespace. Reading a missing namespace
does not initialize or rewrite the database, and updates preserve any future
personal-setting fields in that namespace.

### Non-blocking character import

The independent `character-import-ux` pack changes ordinary JSON, PNG, JPEG,
CharX, shared-file, and Realm character imports from a full-screen
`Loading... (Reading)` / asset-progress modal to one persistent Sonner toast:

- reading, archive extraction, and asset-save progress update one stable toast
  without locking the chat, navigation, or ordinary settings;
- the toast component is created once per import and subscribes to a reactive
  status store, so rapid progress changes replace only its visible text rather
  than reissuing Sonner toasts and restarting enter/exit transitions;
- asset stages show a fixed-width counter in the title. Formats with known
  totals use `(001/014)`; one-pass PNG streams use `(001/???)` so progress stays
  visible without restoring the preliminary count pass that slowed imports;
- a second character import is refused while the first owns the import lease;
- page unload, application self-update, backup/snapshot restore, save-folder
  replacement, and migrated-file cleanup are refused until the lease ends;
- package and module conversion imports retain their parent operation's
  existing progress and atomic save contract;
- PNG metadata and embedded assets are consumed by one streaming pass rather
  than a preliminary count pass followed by the real import;
- the two core character constructors assign the initial chat ID before the
  character enters the database;
- success appears only after lazy-chat synchronization confirms the imported
  character and every full chat ID in the server baseline, then flushes the
  local database write. A refused or failed confirmation never emits a false
  success toast.

The guard is intentionally narrow: sending messages, editing existing
characters, switching screens, and changing settings that do not replace the
database remain available during asset import. Closing the progress toast does
not cancel or roll back an in-flight import. The browser `beforeunload` guard
is best effort; an iOS force-close, process kill, or OS eviction cannot be
prevented by application code.

### Prompt preset integrity

The independent `preset-integrity` pack keeps the persisted active preset
index inside the current preset array:

- a one-past-end or otherwise invalid saved index is clamped to a surviving
  preset without deleting or rewriting the preset entries;
- an empty legacy array receives one valid fallback preset;
- database load, preset save/change, and the Prompt → Basic Info name binding
  each enforce or tolerate the invariant.

This pack is separate from persona organization so its ETag, apply, and revert
scope remain independent.

### Parser hardening

The independent `parser-hardening` pack resolves the three parser
specifications that PocketRisu v1.8.1 previously skipped:

- `parses ChatML without ending token`: a final empty assistant generation
  marker such as `<|im_start|>assistant` is a provider prompt boundary, not an
  empty chat message. It is dropped only when it is terminal, recognized,
  content-free, and lacks `<|im_end|>`; content-bearing unterminated messages
  and explicitly ended empty messages remain valid.
- `extracts multiple thoughts`: the greedy cross-block expression is replaced
  by a depth-aware scanner that extracts sibling `<Thoughts>` blocks in order,
  preserves nested markup inside one outer thought, removes empty blocks, and
  leaves unmatched opening markup visible.
- `Lower precedence than other operators`: CBS comparison operands are reduced
  before `and`/`or`, while the existing right-to-left behavior between logical
  operators and the legacy path for expressions without logical operators are
  preserved.

The Thoughts scanner is shared by ChatML parsing and the main response path, so
the two consumers cannot silently diverge. The pack owns focused regression
tests and has its own SHA-256 ETag; its managed content, apply state, status,
and revert scope remain independent from feature and bg-preserve packs.

### Toolchain hardening

The independent `toolchain-hardening` pack keeps test and build tooling
deterministic without changing PocketRisu runtime source:

- Vitest conditionally replaces an incomplete Node.js experimental
  `globalThis.localStorage` with `happy-dom`'s `Storage`. Browser-like
  environments that already expose a complete Storage API are left unchanged.
- `package.json` and the matching lockfile sections override Lightning CSS to
  1.33.0, so both Tailwind and Vite understand the standard `::highlight`
  selectors already used by PocketRisu.
- the override and every lockfile resolution are one reversible patch graph;
  frozen installs remain valid and revert restores the original bytes and
  modes.

After applying this pack, run `pnpm install --frozen-lockfile` before tests or
builds so an existing `node_modules` tree also adopts the locked version.

## Build and use

```bash
npm test
npm run build
```

Preview a unified install without writing:

```bash
node dist/pocketrisu-patcher.cjs list
node dist/pocketrisu-patcher.cjs configure \
  --root /path/to/PocketRisu \
  --packs bg-preserve,lazy-chat-sync,persona-organizer
node dist/pocketrisu-patcher.cjs plan --root /path/to/PocketRisu --json
```

Apply every compatible capability, apply a saved custom selection, inspect, or
revert:

```bash
node dist/pocketrisu-patcher.cjs apply \
  --root /path/to/PocketRisu \
  --all
node dist/pocketrisu-patcher.cjs apply --root /path/to/PocketRisu
node dist/pocketrisu-patcher.cjs status --root /path/to/PocketRisu
node dist/pocketrisu-patcher.cjs revert --root /path/to/PocketRisu
```

The first command stores rolling `all` intent. The second reuses whichever
policy was saved: rolling presets are recalculated from that installer's
catalog, while customized selections remain pinned until configured again.
`revert` records an empty custom selection, so a later plain `apply` does
not silently reinstall the former preset.

Use `pocketrisu-features.cjs` for feature packs without bg-preserve, or
`pocketrisu-hardening.cjs` for parser hardening alone.

For an upstream upgrade, keep the current installation as `--root` and place
the pristine new upstream in a separate `--candidate` directory:

```bash
node dist/pocketrisu-patcher.cjs stage \
  --root /path/to/current/PocketRisu \
  --candidate /path/to/fresh/new/PocketRisu \
  --json
```

`stage` reuses the saved user intent, proves the candidate is separate and
fresh, plans every selected pack, requires exact target qualification, applies
only to the candidate, then verifies the declared pnpm version and runs frozen
dependency installation, target tests, Svelte diagnostics, the production
build, and the BG orchestration bundle builder when selected. A successful
private receipt says only that the
candidate is ready for a separately reviewed manual cutover. Cutover,
user-data movement, and restarting a running PocketRisu process are
deliberately outside the patcher.

PocketRisu's production build can still report chunks above its 2,000 kB
warning threshold. The current over-limit outputs are already separate lazy
assets for model token data, Monaco, WebLLM, and web tokenizers. Do not raise
the threshold merely to hide them. Revisit chunking when an initial-load chunk
crosses the threshold, a formerly smaller chunk regresses, or a supported
upstream split can reduce transferred bytes without removing those features.

## Composition and collision rules

Users never choose a patch order. Pack-level `requires`, `conflicts`,
`supersedes`, and conditional hidden adapters are resolved deterministically
from the selected capabilities. There is no global unit order: units in
different files are independent.
For unordered units in the same file, the engine dry-runs both orders against
the reconstructed baseline:

- same result: commutative, so no ordering edge is stored;
- only one valid result: that order is inferred;
- two different valid results: the manifest must declare the intended order;
- neither valid, or an ordering cycle: the plan is refused before any write.

When a newly selected pack collides with one existing unit, the engine removes
the currently managed blocks in memory, recomposes the desired graph, and
writes the final result once. Files whose final bytes did not change are
skipped. This permits a `B2 → A3` relationship without requiring `A1` or `A2`
to be removed or assigned an unrelated order.

Cross-file semantic requirements cannot be inferred from text transforms.
Those belong in explicit manifest `requires`/`before`/`after` contracts and
tests.

Units shared by every declared target omit `targetVersions`. A unit that is
valid only on exact upstream releases declares a package-to-version mapping,
for example `targetVersions: { pocketrisu: ['1.9.0'] }`. Every scoped version
must already be listed under that pack's `verified` or `reviewing` targets.
The manager removes non-matching units before collision analysis, path reads,
composition, and state encoding; a target change makes existing status
`drifted`, and a target change between plan and apply refuses the transaction
before a journal or patch file is written.

## Conflict reports inside RisuAI

Every refused transition still writes private Markdown and JSON reports under
`save/pocketrisu-patches/reports`. When the operator cannot browse that
directory, the same universal artifact can copy a report into RisuAI through
the running PocketRisu server.

First create exactly one dedicated persona, module, or character with this
exact name:

```text
PocketRisu Patcher Report
```

Do not use that receiver for normal chats or enable its module: persona and
character descriptions are prompt-bearing fields, and module lore can be
activated by its keys. The patcher never creates a persona, module, or
character. It also never chooses between duplicate receivers.

Ask a failing command to deliver its new report automatically:

```bash
node dist/pocketrisu-patcher.cjs apply \
  --root /path/to/PocketRisu \
  --report-to auto
```

Or print/deliver the latest saved report later:

```bash
# Print the complete report to the terminal.
node dist/pocketrisu-patcher.cjs report --root /path/to/PocketRisu

# Require one unique match across all three RisuAI object types.
node dist/pocketrisu-patcher.cjs report \
  --root /path/to/PocketRisu \
  --report-to auto

# Resolve an intentional same-name object in another type.
node dist/pocketrisu-patcher.cjs report \
  --root /path/to/PocketRisu \
  --report-to module \
  --report-id 20260729123456-abcdef1234
```

`persona` replaces only the matching persona's `personaPrompt`; `character`
replaces only the matching character's `desc`. `module` replaces the content
of its single patcher-created lorebook named `PocketRisu Patcher Report`, or
appends that inactive, random-key lorebook when the dedicated module has none.
A same-name lorebook with ordinary activation settings is refused instead of
being repurposed. Every operation requires an exact unique name, uses
PocketRisu's current database hash as a concurrency precondition, calls the
authenticated loopback `/api/patch` and `/api/db/flush` paths, then reads the
database back and checks the exact report text. Because the flush path uses a
session cookie, the patcher obtains one through `/api/session` without sending
`x-session-id`; this does not replace the currently active RisuAI writer
session. It never edits `risuai.db` directly.

The local server must be running. The default is PocketRisu's own loopback
port; a different loopback origin can be supplied with `--risu-url`. Remote
hosts, embedded credentials, redirects, and non-root URL paths are refused.
If delivery is unavailable or ambiguous, the original conflict remains
blocked and its report remains available through the `report` command.

## Adding or updating a patch pack

1. Inspect the exact PocketRisu version and the complete normal call paths
   affected by the change. Store large exact replacement baselines under the
   pack's `anchors/` directory and managed replacements under `files/`.
2. Add a versioned manifest with a unique pack ID and unique unit IDs. Use
   `requires`, `before`, or `after` for semantic order that cannot be inferred
   from text collisions. Avoid owning unrelated files or broad sections.
3. Register the manifest once in `src/catalog.cjs`; this explicit line is the
   publication gate. Every registered user-facing pack automatically appears
   in the universal selector and rolling `all` preset. Add
   `presetDefaults: ['features']` or `['hardening']` in the manifest only
   when the corresponding narrow wrapper should own it. Omit that metadata for
   universal-only packs. Internal adapters use `userSelectable: false` and
   cannot be preset defaults.
4. Do not hard-code an ETag. `packEtag()` calculates SHA-256 over the stable
   JSON representation of the pack's identity, visibility, preset metadata,
   graph relations, targets, units, and contracts. Any managed text, anchor,
   ordering contract, mode, profile ownership, or version change therefore
   changes the ETag automatically. Never edit a target's
   `save/pocketrisu-patches/state.json` by hand.
5. Add a test that mutates one managed field and proves the ETag changes while
   the original remains stable. Also test the pack's narrow-profile metadata,
   automatic `all` inclusion, selector visibility, and explicit file boundary.
6. Run `npm test` and build the installers twice; byte hashes must match. On a
   clean target, verify `plan`, `apply`, a second `plan` with no changed files,
   `status` with `catalogStatus: current`, and `revert` restoring exact content
   and POSIX modes.
7. For dependency changes, patch both the package manifest and lockfile, then
   prove `pnpm install --frozen-lockfile` succeeds and the resolved dependency
   graph contains the intended single version.
8. Bump the pack's semantic version whenever its behavior changes, even though
   content-addressed ETags would detect the change. Update the repository
   version, README release history, and CHANGELOG before publishing.

## State, ETags, and recovery

Runtime HTTP caching uses the database ETag. Patch management uses SHA-256
pack ETags and exact output hashes:

- every selected pack still participates in the in-memory graph and collision
  check, but files whose final bytes and POSIX mode are already current are not
  rewritten; a fully identical apply creates no transaction journal;
- one exclusive lock serializes recovery, planning, and writes for each target
  root; a stale plan or overlapping patcher exits before creating a journal;
- exact old unit snapshots are retained, so an updated pack can revert its
  previous representation before recomposition;
- existing POSIX file modes are preserved through apply, rollback, and revert;
  new owned files default to `0644` unless a unit declares another mode, while
  patch state and transaction metadata use `0600`;
- `save/pocketrisu-patches/state.json` records the active profile and graph;
- `save/pocketrisu-patches/intent.json` separately records either a rolling
  preset policy or a pinned custom capability list, so a fresh upstream
  candidate never mistakes an old applied-state snapshot for blocks present
  in new source;
- writes are journaled in
  `save/pocketrisu-patches/transaction.json`;
- a failed or interrupted transaction restores every touched file before the
  next operation;
- conflict reports, update-check cache data, and staging receipts are private
  `0600` metadata.

New-chat payloads acknowledged before their first database stub remain in a
durable `awaitingMetadata` WAL quarantine. Only that orphan-prone subset has a
128-record/256 MiB pressure limit: existing payloads are never evicted, the
backlog is logged after restart, and a save that would exceed the limit is
rejected before ACK. Existing-chat WAL records are outside this pressure limit.

The `features` and `hardening` artifacts refuse to take ownership of another
profile's state, because doing so could silently remove managed packs. The
`all` artifact may safely adopt a prior `features` or `hardening` state.
Legacy format-1 intent is read conservatively: an exact match for the current
effective preset defaults becomes rolling, while any partial or older list
stays pinned. The next successful intent-writing transition stores format 2.

## Upstream updates

Do not overwrite the live tree and then hope that the patches still apply.
Use this lifecycle:

1. Keep the old live installation and its `intent.json` unchanged.
2. Acquire a pristine new upstream tree in a non-overlapping candidate path.
3. Run `stage` from the latest patcher. Structural planning and exact-version
   qualification happen before candidate source writes.
4. If an anchor, dependency, ownership, order, qualification, check, or build
   gate fails, do not edit the manifest locally. Send the generated Markdown
   or JSON report to the patch maintainer. It identifies the pack, unit,
   relative file, expected anchor, target candidate lines, and refusal cause
   when that evidence is available. Operators without filesystem access may
   print it or deliver it to the dedicated RisuAI receiver described above.
5. The maintainer preserves the pack's intended behavior, updates and
   requalifies it against pristine upstream, and publishes a new patcher.
6. Recreate or cleanly reacquire the candidate, rerun `stage`, and perform a
   separately reviewed manual cutover only when its receipt is `ready`.

The patcher does not fuzzy-reanchor, silently skip a pack, weaken a feature, or
offer a downloader-facing force option. A failed staging check may leave the
disposable candidate patched for maintainer diagnosis, but marks it
`readyForManualCutover: false`; it must not replace the live installation.

Maintainers do not mark an unknown version verified merely to get past this
gate. In the private source tree, declare that exact version as `reviewing`
for every affected pack and run:

```bash
npm run qualify -- stage \
  --root /path/to/current/PocketRisu \
  --candidate /path/to/pristine/review/PocketRisu \
  --packs pack-a,pack-b

npm run verify:combinations -- \
  --root /path/to/separate/pristine/review/PocketRisu \
  --allow-reviewing \
  --json
```

The canonical maintainer procedure, acceptance fields, anti-reward-hacking
rules, and distinction from L2.5 runtime audit are in
[`docs/patch-combination-verification-instructions.md`](docs/patch-combination-verification-instructions.md).

The verifier does not deduplicate raw selections. It runs plan, apply,
zero-change re-plan, status, and exact byte/mode revert for every mask, sharded
across isolated target copies. Automatic worker count follows available CPU
parallelism with a four-worker resource cap; use `--jobs N` to override it.
The result fails closed unless every mask is reported exactly once.

On Linux, a sufficiently sized memory filesystem can reduce disposable-worker
I/O without changing the source root or the checks:

```bash
TMPDIR=/dev/shm npm run verify:combinations -- \
  --root /path/to/separate/pristine/review/PocketRisu \
  --jobs 2 \
  --json
```

Check tmpfs capacity first. Worker copies and caches are temporary and are
removed on normal completion or a handled failure; abrupt process termination
can leave the verifier-named temporary directory. The supplied pristine root
is only read.

This source-only entry point accepts `reviewing` targets but retains the same
isolation, planning, and full check gates. It is not embedded in distributed
installers. Its automated receipt is `review-passed` with
`readyForManualCutover: false`; it cannot qualify its own behavioral intent.
Move the version from `reviewing` to `verified` only after the maintainer also
confirms the intended behaviors and round trip, then rebuild and retest the
downloader artifact.

## Update notification channel

Distributed installers can poll a small public HTTPS JSON feed even while this
source repository and release workflow remain private. The check is
notification-only: it sends no installed version, follows no redirects,
allowlists both feed and release-link hosts, caches privately, never executes
downloaded code, and does not block local patch commands when offline.

The channel is intentionally disabled in `src/update-channel.cjs` until a
stable public endpoint is chosen. Before the first public installer release,
publish a feed matching `docs/update-feed.example.json`, set the exact
allowlisted hosts, and rebuild the artifact. An already distributed installer
that contains no checker cannot learn about later versions retroactively.

## Attribution

PocketRisu and the storage synchronization code adapted from PR #49 are GPL-3.0
licensed. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and
[LICENSE](LICENSE).
