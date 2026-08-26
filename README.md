# PocketRisu Personal Patches

Private, all-or-nothing patch delivery for PocketRisu NodeOnly. The current
stable release is `v0.2.0`, and its complete manifest graph targets exact
PocketRisu `v1.10.0`. The newer `0.2.0-experimental.26` PageFold graph is an
exact-target candidate, not a stable replacement.

## Complete installer

`pocketrisu-patcher.cjs` applies one complete admitted set or reverts it in
full. `plan`, `apply`, and `stage` always resolve bg-preserve, lazy storage,
organizers, import UX, Personal settings, parser/toolchain hardening, CharX
integrity, the admitted Kei capabilities, and all matching integration
adapters. The complete graph also includes the admitted Haejeok persistence,
Korean-search, and Small-width adapters. `configure`, `--packs`, `--preset`, and the
features/hardening installers are retired. `--all` and
`pocketrisu-all.cjs` remain compatibility aliases for one transition.

The internal resolver is retained for dependency, supersede, adapter,
collision, target, and exact-revert ownership. Those pack boundaries are
implementation and verification units, not downloader choices. A newly
admitted root pack joins the complete set only after its focused owners and
maximum graph pass; a conflict blocks before source writes.

The experimental `background-import` source and tests remain as an audit
artifact, but it is absent from the catalog and both generated installers.
Character and module imports therefore use the existing foreground flow.

See the [delivery design](docs/PATCHER-V2-DESIGN.md),
[stable release receipt](docs/POCKETRISU-1.10-STABLE-RELEASE.md),
[source provenance ledger](docs/SOURCE-PROVENANCE.md), and
[Haejeok comparison](docs/HAEJEOK-RISUAI-OVERLAP-AUDIT.md).

## PageFold candidate status

`0.2.0-experimental.26` adds PageFold as an opt-in ModelPreset transform. It is
not a standalone provider and does not alter old presets until the user
explicitly selects maximum or balanced mode and enables it. Main, sub,
memory, translation, emotion, and other-aux bindings expose independent
`inherit/on/off` overrides.

The active Vertex or Google AI Studio ModelPreset remains the model authority:
PageFold uses its selected Gemini model and never replaces it with the frozen
3.7 evidence model. Gemini 3 uses per-part low media resolution; earlier Gemini
uses global low. OpenRouter, custom Vertex endpoints, images, tools, and
explicit Gemini cache remain outside this PageFold wire while PageFold-off
keeps the ordinary request path.

The preset card is intentionally compact: one definition, the toggle, and a
choice between including system messages or conversation only. Route/evidence/
fidelity/manual-price copy is absent. Service Account import appears only in
direct-entry mode as a full-width input-sized button and reports a generic top
toast without displaying email, project, or key ID.

Request progress shows `PF ON 1p` immediately after elapsed time using the
same neutral text color. The chat model badge remains compact, while generation
details expose PageFold metadata in a dedicated conditional tab beside Log and
Prompt rather than inside Tokens.

The PageFold detail tab labels the signed source-minus-wire delta as Saved
tokens (`절약 토큰`), omits the redundant positive `+`, and does not render the
internal pricing-evidence identifier. Negative values remain negative.

Both PageFold packs remain exact-1.10 `reviewing`; ordinary generated-installer
apply therefore fails closed. The private qualification path is used only for
candidate L3 delivery. The candidate graph is 40 packs / 934 units / 340
managed paths and is currently live after its stopped-tree automatic gates;
this does not promote it to stable. The
[candidate validation receipt](docs/POCKETRISU-PAGEFOLD-CANDIDATE-VALIDATION.md)
records the complete graph, deterministic artifact, automatic tests, SQLite
redaction, L2.5 audit, live state, and remaining physical iPhone surfaces.
Stable verification, tag, and release remain behind physical L3 and L4.

## Haejeok integration status

The admitted Haejeok scope is HJ01 Small chat width, HJ03 Korean character
matching, and HJ04 persistence ordering. All three are hidden internal
adapters in the same complete installer and have passed their focused gates
and existing physical iPhone L3.

There is no new active HJ implementation queue. HJ02 textarea resize, HJ05
low-spec slices, and HJ07 Node compute are trigger-gated; HJ06 remains blocked
despite a valid ZIP64 writer because its importer accepted bad CRC and does not
share one size/integrity policy; the frozen HJ08 LogExporter is rejected after
source and Chromium counterexamples. SQL/S3/FTS/revision/deployment work stays
outside this patch line as separate product migrations.

The [post-validation execution plan](docs/HAEJEOK-POST-VALIDATION-INTEGRATION-PLAN.md)
records exactly what can reopen each item, the maximum allowed integration
scope, the excluded source/authority, and the one-feature admission gates. The
[bounded runtime validation](docs/POCKETRISU-HAEJEOK-RUNTIME-VALIDATION.md) is
the evidence authority; the
[remaining-candidate audit](docs/HAEJEOK-REMAINING-CANDIDATE-DESIGN-AUDIT.md)
retains the detailed source and path review.

## Release history

| Release | What changed |
| --- | --- |
| `v0.2.0-experimental.26` | Renames the PageFold signed token delta to Saved tokens / `절약 토큰`, removes the redundant positive `+`, and removes the pricing-evidence row while preserving cost and negative values. |
| `v0.2.0-experimental.25` | Places neutral `PF ON 1p` progress beside elapsed seconds, keeps the chat model badge, and moves detailed PageFold metadata from Tokens into its own conditional generation-info tab beside Log and Prompt. |
| `v0.2.0-experimental.24` | Keeps the experimental.23 PageFold behavior and moves `이 키 저장` directly below the full-width Service Account JSON import button, without moving it for any other credential type. |
| `v0.2.0-experimental.23` | Applies L3 feedback: compact PageFold UI, input-sized direct Service Account import with identifier-free toast, no manual price UI, and preset-authoritative Gemini models across native Vertex and AI Studio. Gemini 3 uses part-low and earlier Gemini uses global-low; 3.7/v8 remains evidence rather than a model override. |
| `v0.2.0-experimental.22` | Adds the exact-1.10 PageFold ModelPreset candidate for one v8-qualified native Vertex global `gemini-3.7-flash` low route, server-owned deterministic PDF rendering, role overrides, explicit mode/persistence UI, Service Account import, budgets/retry/redaction/metrics, and BG composition. The 40-pack / 929-unit / 339-path graph remains review-only for candidate L3. |
| `v0.2.0` | Promotes the exact PocketRisu 1.10 all-or-nothing graph: 38 resolved packs, 769 units, and 280 managed paths. Ordinary generated-installer apply is enabled only for that complete graph; retired and alternative adapters stay outside stable qualification. The release preserves the recorded physical passes and explicitly accepts, without relabelling, the remaining unavailable or not-exercised device surfaces. |
| `v0.2.0-experimental.21` | Adapts Haejeok's persistence ordering, Korean-aware character search, and distinct Small 600px chat width into PocketRisu 1.10's existing lazy/BG, catalog, and native width owners. Later source/runtime revalidation keeps HJ02/HJ05/HJ07 trigger-gated, HJ06 blocked, and the frozen HJ08 implementation rejected; no additional HJ code enters this checkpoint. |
| `v0.2.0-experimental.20` | Makes delivery all-or-nothing, retires background import after the device UX finding, removes public combinations/raw-mask verification, restores foreground import payloads, and records the source-provenance audits. |
| `v0.2.0-experimental.19` | Keeps one durable import operation alive across iOS/WebKit `AbortError`, `NetworkError`, and `Load failed` suspend/resume failures instead of showing a false terminal import error. |
| `v0.2.0-experimental.18` | Adds review-only resumable character/module upload, server-owned preparation and append-only commit, canonical client reconciliation, restart recovery, bounded retention, and truthful post-handoff background status for exact PocketRisu 1.10. |
| `v0.2.0-experimental.17` | Keeps the 1.10 aggregate unchanged while removing the iOS Files `accept` hint that disabled proprietary `.risum` and `.module.charx` files; exact post-selection type validation and terminal persistence remain in force. |
| `v0.2.0-experimental.16` | Rebases the rolling aggregate onto PocketRisu 1.10.0, adds central-indexed CharX integrity and one terminal module-import toast/persistence flow, preserves native purge/VACUUM/persona-duplicate behavior, and requalifies the maximum graph without publishing a stable release. |
| `v0.2.0-experimental.15` | Adds a hidden exact-1.9 point-in-time backup source that pins one SQLite/WAL and verified filesystem epoch for native downloads, settings export/estimate, and server-file backup while retaining the selected standard or lazy storage owner. |
| `v0.2.0-experimental.14` | Adds an exact-1.9 client/server build-stamp fence that refuses stale authoritative writes before body handling, reloads only clean tabs, and freezes dirty composer, draft, database, and generation state with recoverable unsent text. It retains the experimental.13 Personal appearance graph. |
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

The historical `v0.1.7` release passed 10/10 patcher test files with 56 tests,
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

The current `v0.2.0` release supports one exact PocketRisu `1.10.0` surface:
the complete 38-pack / 769-unit / 280-path graph. Its ordinary distributed
installer no longer needs the maintainer review gate, while the 13 inactive
legacy, base, standard-storage, or superseded catalog packs remain
unqualified for 1.10. The release decision does not convert unexercised Kei,
backup, fence, or accessibility scenarios into physical passes. Their exact
accepted limits and the complete automated gate are recorded in the
[stable release receipt](docs/POCKETRISU-1.10-STABLE-RELEASE.md).
The final gate passes 44/44 patcher files, 1,635/1,635 frontend tests,
177/177 server tests, and 74 compatibility tests with five environment skips,
plus Svelte 0/0, the 7,922-module build, and BG bundle load. The two
byte-identical mode-0755 installers are 7,277,704 bytes with SHA-256
`1b416a066894a0052005a4f3a1aaad3fc808b88302b0295dfd7b58d7d23db94c`.

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

The `v0.2.0-experimental.14` candidate adds the exact-1.9
`client-build-fence` pack and composition adapters for standard storage,
Kei restore safety, lazy storage, and bg-preserve recovery. Every production
build emits one random build stamp into both the client bundle and
`dist/build-stamp.json`; authoritative server mutations require the matching
`x-client-build` value before request-body handling. A clean stale tab reloads
once. A tab with unsaved database, composer, draft, or generation state freezes
all mutation surfaces and exposes only the unsent composer/draft text in a
recovery banner.

The patcher passes 39/39 test files. All 4,096 raw selections of the twelve
user-facing packs normalize to 2,048 graphs and pass apply, zero-change
re-plan, and exact round-trip recovery across 237 managed paths with up to 607
resolved units. The applied maximum graph passes 131 client files / 1,547
tests, 10 server files / 170 tests, Svelte diagnostics at 0 errors and 0
warnings, and a 7,859-module production build. The emitted artifact, the one
matching JavaScript chunk, and the server loader hold the same 70-character
stamp. Two patcher builds produce byte-identical, syntax-valid installers, and
source, generic, and fixed-all plans agree at 32 packs / 607 units / five
ordered collisions / 233 planned paths before composition with the already
qualified Personal appearance branch. Live admission and the first
cross-build device transition remain separate gates.

The retained experimental.14 candidate merges that appearance branch rather
than admitting the stale pre-composition installer. The combined exact-1.9
gate passes all 4,096 raw selections as 2,048 graphs across 253 catalog paths
with up to 652 units. Its maximum graph passes 132 client files / 1,564 tests,
10 server files / 170 tests, Svelte 0/0 diagnostics, a 7,864-module production
build, the build-stamp and BG-bundle checks, a zero-change re-plan, and exact
source revert. All appearance font tokens and Noto imports remain in the
generated CSS.

The same combined installer is live. It changed only the 23 fence-owned
source paths plus patch state, repeated the full stopped-tree gates, re-planned
with zero changes, and restarted with exact served/local asset bytes, an
unchanged zero-byte error log, and unchanged database and backup metadata.
Body-free live probes confirm that missing/stale writes stop at HTTP 426 with
`not-committed`, while the exact current stamp reaches the existing request
validation. Tabs opened before this first deployment still require one
explicit reload because their old client bundle has no 426 recovery handler.

The `v0.2.0-experimental.15` candidate adds the hidden exact-1.9
`server-backup-snapshot-core` and selects exactly one standard/lazy adapter
from the existing storage graph. Native full and settings downloads, settings
size estimation, and server-file backup now read one pinned SQLite/WAL epoch
and verified private filesystem copies. Capture holds the selected storage
queue only while it flushes and fixes that source; archive transfer then runs
outside the queue so ordinary writes retain their prior availability.

The patcher passes 40/40 test files. All 4,096 raw selections of the twelve
user-facing packs normalize to 2,048 graphs and pass exact byte/mode recovery
across 259 catalog-managed paths with up to 669 units. The maximum graph passes
132 client files / 1,564 tests, 12 server files / 176 tests, Svelte 0/0
diagnostics, a 7,864-module production build, the build-stamp and BG-bundle
checks, and an immediate zero-change re-plan. Missing databases or chunks,
source drift, framing mismatches, capacity limits, disconnect cleanup, and
maintenance during an active source fail closed. Detached backup jobs and the
long-reader WAL-duration problem remain P3 work. All four generated `.15`
installers are syntax-valid, and two consecutive builds produced identical
sizes and SHA-256 values.

The same `.15` installer is live after two zero-work preflight reads and a
process-first stop. The stopped target repeated the 132/1,564 client,
12/176 server, 6/6 P2 endpoint, Svelte 0/0, production-build, build-identity,
BG-bundle, production-prune, 254-path current-status, and zero-change re-plan
gates. Restart readback matched served/local main-asset bytes, retained exact
database and backup metadata with both SQLite checks `ok`, left no private
pin, and added no PM2 error-log bytes. A non-writing authenticated settings
estimate returned 200 and released its source. Actual server-file backup,
background/return, and P1 clean/dirty cross-build behavior remain device L3.

The `v0.2.0-experimental.16` candidate targets pristine PocketRisu `1.10.0`.
Its rolling `all` graph resolves 35 packs into 716 units across 267 managed
paths with 12 deterministic ordering collisions. Exact apply, current status,
zero-change re-plan, and byte/mode revert pass. The user explicitly waived the
raw-selection combination verifier for this installation, so this checkpoint
does not claim exhaustive subset coverage; the maximum aggregate and focused
CharX/module/BG/toolchain compositions were still exercised directly.

The aggregate candidate passes 41/41 patcher test files, 136 frontend files
with 1,609 tests, 13 server files with 177 tests, and 74 compatibility tests
with five environment-dependent skips. Svelte diagnostics are 0 errors and 0
warnings, the production frontend transforms 7,918 modules, the BG
orchestration bundle builds to 8,555 KB and loads `sendChat`, and the help-key
audit reports no missing English/Korean keys. Four generated installers are
syntax-valid and byte-identical across consecutive builds.

CharX integrity uses pinned `@zip.js/zip.js` 2.8.55 without workers, strict
central/local/CRC/overlap checks, bounded metadata and one-entry-at-a-time
storage. Independent synthetic fixtures and the iPhone 4/16/48 MiB spike pass;
the unavailable reported problem original remains explicitly unverified.
Module import now reserves the shared character/module lease before the file
picker, routes picker/drop/hash/share/launch inputs through one orchestrator,
keeps low-level authorization modal, commits once with a fresh ID, and reports
success only after the lazy storage owner confirms and flushes that module.

The 1.10 rebase retains native `structuredClone`, large-lorebook iteration,
SQLite disk-spill VACUUM, orphan purge, client-build fencing of the purge
caller, and the native persona duplicate/clamp. The server asset walker unions
native persona fields with organizer galleries and folder icons. Empty-server
first import skips a meaningless pre-restore snapshot, while replacement of an
existing database still requires the fresh verified snapshot or the existing
bounded one-use acknowledgement. Stable tag/release and device L3 remain
separate gates.

The same `.16` graph is now live after an active-work-zero preflight,
application-only rollback, process-first stop, transactional 35-pack apply,
and rolling-all intent update. The stopped tree repeated the 1,609 frontend,
177 server, 74 compatibility, Svelte 0/0, build, BG bundle, production-prune,
current-status, and zero-change gates. Restart readback matched served/local
main asset and build-stamp bytes, kept both SQLite inode/size pairs and three
backup files unchanged with `quick_check=ok`, retained 21 delivered BG states
with no active payload, and added no PM2 error-log bytes. No destructive live
orphan purge was used as a probe.

The `v0.2.0-experimental.17` follow-up is live and keeps that graph while
changing only the module picker's platform hint. The picker intentionally
leaves `accept` unset because iOS Files disables proprietary extensions that
have no registered system document type. The central importer still rejects every
extension outside exact `.json`, `.lorebook`, `.risum`, and `.charx` before
reading or committing it. DOM tests select both `.risum` and compound
`.module.charx`, while a separate compound-CharX test reaches character
conversion, one fresh-ID commit, confirmed persistence, and one success.
The stopped live tree passed those 39 focused tests, Svelte 0/0, the
7,918-module build, BG bundle/load, production prune, and a zero-change
generated-installer plan. Restart readback matched the served/local main asset
and build stamp, kept both databases and three backups unchanged, retained 21
delivered BG states with no payload, and added no bytes to the newly rotated
PM2 error log.
The user then confirmed on iPhone that real `.risum` and `.module.charx` files
were selectable, imported with the top notification, and remained after
reload. This closes the picker follow-up L3 only; the other aggregate device
rows still gated a stable release at that checkpoint.

The `v0.2.0-experimental.18` candidate adds the visible but review-only
`background-import` pack. A browser hashes and uploads one bounded slice at a
time; upload is resumable, while the notification says background-safe only
after the server has fsynced and verified the complete source and durably
recorded any low-level authorization. NodeOnly then parses from a stable
descriptor, stages private content-addressed assets, appends one entity to the
latest canonical database, and retains the result until a client performs a
fresh three-way rebase, character-chat hydration, reconciliation, and ACK.
Package children, module-to-character children, and non-seekable Realm PNG
streams retain their foreground owners.

Automatic qualification observed 42/42 patcher test files. The maximum
`all + background-import` graph resolves 36 packs / 791 units / 303 managed
paths, has a zero-change re-plan, and reverts 304 changed paths byte/mode
exactly. Its exact target passes 1,639 frontend tests, 237 server tests, and 74
compatibility tests with five existing environment skips; Svelte diagnostics
are 0/0 and the production frontend transforms 7,922 modules. The parser
bundle is 308,904 bytes, and the 8,617 KB BG bundle loads `sendChat=function`.
Synthetic HTTP smoke also passed canonical module/character commits, restart
of a receiving offset, 413 chunk bounding before mutation, 426 stale-build
fencing, terminal cleanup, diagnostics redaction, and root 200.

The reported exact-original CharX remains unavailable, so that claim is not
upgraded beyond synthetic mechanism evidence. The user-requested exhaustive
raw-selection combination verifier remains skipped. iPhone handoff/suspend,
cold source re-selection, clean/dirty reconciliation, multi-PWA claim recovery,
and the admitted character/module entry points remain the concrete L3 gate;
the pack therefore stays `reviewing`, `allDefault: false`, and outside a stable
tag or release.

The `.18` custom maximum graph is now live after a maintainer-staged,
process-first cutover. It preserves the previous 35-pack all graph, adds only
the review-only background-import capability and its owned paths, retains one
pre-existing completed BG result awaiting client ACK, and keeps both database
inodes, three backup files, served/local build identity, and a zero-byte PM2
error-log delta. Device L3 remains pending.

The `v0.2.0-experimental.19` follow-up addresses the first physical iPhone
resume observation. Repeated app switches resumed the server's exact 5 MiB
offset, but WebKit surfaced the interrupted request as `AbortError`,
`NetworkError`, or `Load failed`; the client had treated only JavaScript
`TypeError` as transient and therefore showed a false `Import failed` while
the server job remained healthy. Create/list/chunk/status/complete,
authorization, claim, reconciliation, and ACK now recover those WebKit
transport shapes through the same durable operation. Protocol/validation
errors remain terminal and unchanged.

The `.19` follow-up is live. Its process-first transition changed only four
client payloads, private patch state, and the qualified frontend build. The
existing 31,705,288-byte CharX job retained its exact 5,242,880-byte durable
offset and null typed error across stop/restart; served/local identity matched
and PM2 added no error-log bytes.

The `v0.2.0-experimental.21` candidate keeps all-or-nothing delivery and admits
three focused Haejeok outcomes as hidden patcher adapters. HJ04 persists newly
appended user turns before generation, commits script-mutated message payloads
through the existing lazy-chat strict-save owner, and waits for plugin storage
before runtime reload. The startup selection and immediate script-cache
refresh changes were not copied because the composed target already has
equivalent synchronous ordering.

HJ03 adds one shared Korean matcher to PocketRisu 1.10's actual grid and mobile
catalogs without changing either list's order. It covers choseong, mixed and
in-progress Hangul, both keyboard-layout mistake directions, romanized English
names, creators, and tags. `es-hangul` 2.4.0 is exact and integrity-pinned under
its MIT license. HJ01 does not add Haejeok's competing `chatLimitSize` field:
PocketRisu already owns Standard/Wide/Full widths across message cards, creator
notes, composers, and theme presets, so the adapter adds only the missing
Small 600px value and leaves Standard as the default.

The complete exact-1.10 graph resolves 38 packs / 769 units / 280 managed
paths. Patcher tests pass 44/44 files. The composed target passes 139 frontend
files / 1,635 tests, 13 server files / 177 tests, and 74 compatibility tests
with five environment-dependent skips. Svelte diagnostics are 0/0, the help
audit has no missing English/Korean keys, one Lightning CSS 1.33.0 resolves,
the production client transforms 7,922 modules, and the 8,559-KB BG bundle
loads `sendChat`. A zero-change re-plan and exact clean-tree revert/reapply
also pass. Two consecutive installer builds produce only the primary artifact
and its byte-identical `all` compatibility alias. Each is 7,277,675 bytes,
mode 0700, CJS syntax-valid, and SHA-256
`22a9a8af4a132de2f29755ad74cf77a203a4602f6304a0c0dcb041a0c4a4e34a`.
The generated artifact reports all 38 resolved packs and a zero-change plan on
the composed target. At that source-qualification boundary, stable tag/release
and feature-level device L3 remained gated; the later live receipt below
records the HJ device result.

The same `.21` candidate is live after two zero-work preflight reads and a
process-first stop. The stopped target repeated 73 focused HJ/storage/K14/K15
tests, Svelte 0/0, help/lock checks, the 7,922-module client build, BG bundle
load check, production prune/load, 280-path current status, and zero-change
re-plan. Restart readback matches served/local `index-KSLKghfQ.js` at
2,037,436 bytes with SHA-256
`ca827add42ba4e420bcde31dd4c20efce45db746671d22104368d0a32cd19734`.
PM2 is online with unstable restarts and active requests at zero; all database,
backup, parked BG state, and inert partial-import identities remain unchanged,
all SQLite checks remain `ok`, and the error-log delta is zero bytes. No user
operation or data was cancelled or deleted. HJ04/HJ03/HJ01 physical UI L3
passed after the user reported all six presented iPhone scenarios normal. The
character Search field was pre-existing PocketRisu UI; HJ03 changes only its
matching predicate. The checkpoint remains experimental and receives no stable
tag or GitHub Release because broader exact-1.10 promotion is still separate.

The subsequent `v0.2.0` release closes that separate promotion decision. It
moves only the actually shipped 38-pack graph from `reviewing` to `verified`;
inactive adapter alternatives and the retired background importer remain
outside the stable support surface.

The `v0.2.0-experimental.20` delivery remains all-or-nothing but retires the
background-import experiment. Before rollback, the same job was still healthy
but had reached only 11,534,336 of
31,705,288 bytes, and the user judged the upload slower and less convenient
than the foreground path. PM2 was stopped with native active/pending 0/0,
221 delivered and two cancelled BG states, no BG result payload, and all three
SQLite checks `ok`. The exact pre-background application tree replaced the
experimental tree by same-filesystem rename; databases, three backups, and the
partial import DB/source retained their inodes and bytes.

The restarted live target reports the pre-background 35 packs / 716 units /
267 managed paths, with all paths current and no background owner. Root and the
served/local `index-HzofH5Bv.js` return 200 and match at 2,018,974 bytes with
SHA-256
`4452ce04a4f0620d8f81ad4aeccaaf7a2982064a60c2625ca823127a0f274fb0`;
the background diagnostics route returns 404 and the PM2 error log has a
zero-byte delta. The incomplete source and receiving row remain inert and
recoverable rather than being cancelled or deleted.

The retired catalog passes 41/41 patcher test files. Its exact-1.10 disposable
all graph resolves 35 packs / 716 units / 267 source paths, re-plans with zero
changes, and reverts every tracked byte and mode. Two consecutive builds
produced only the patcher and fixed-all artifacts; both are 7,197,744 bytes,
mode 0700, syntax-valid, and SHA-256
`a985c4080cca8582e87730fa7ee40511ecb40aa5841658a068196bc6c59c3530`.
The exhaustive patch-combination verifier remains skipped by user instruction.

A disposable copy of the exact installed `.19` custom state also transitioned
from 36 packs / 791 units / 303 paths to 35 / 716 / 267, removed all 36
background-owned files, restored the foreground payloads, re-planned with zero
changes, and matched all 267 live foreground outputs by hash and mode.

The frozen Haejeok audit also establishes that Haejeok RisuAI is a separate
RisuAI fork rather than a PocketRisu downstream. SQL/domain storage and object
storage are alternative architectures. HJ02/HJ05/HJ07 are trigger-gated,
HJ06 is blocked by its importer/round-trip boundary, and frozen HJ08 is
rejected; none is an active implementation queue. Only the three focused
adapters above are redistributed by this checkpoint.

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
risk decisions remained separate and blocked the then-unpublished stable
`v0.2.0`.

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

### Client build write fence

The exact-PocketRisu-1.9 `client-build-fence` pack prevents an already-open
client bundle from mutating a newly deployed server with stale serialization
or recovery code:

- every production build receives a fresh 256-bit random stamp, embedded in
  the client bundle and emitted as `dist/build-stamp.json` for the server;
- authoritative database, chat, asset, migration, backup, snapshot, and
  recovery-finalization mutations send `x-client-build`; a missing or stale
  value receives HTTP 426 with a definite `not-committed` outcome before body
  parsing;
- the bootstrap session advertises the server build, so an already-stale tab
  enters the same clean-reload or dirty-recovery path before its first write;
- reads, generation starts, proxy requests, and `/api/db/flush` remain
  available across a rolling deployment. Existing work can finish, while its
  destructive claim, acknowledgement, cancellation, or deletion is retained
  until a matching client takes ownership;
- a clean client reloads once, guarded against a stale-cache reload loop. A
  dirty client freezes document and portal mutation surfaces, including IME,
  keyboard, pointer, paste, drop, and form events, and shows a bilingual
  recovery banner;
- recovery text is limited to unsent composer and draft content. Stored form,
  profile, credential, and plugin fields are not copied into the banner;
- hidden adapters place the same fence around standard/Kei backup XHR paths,
  lazy storage, bg-preserve result acknowledgements, draft deletion, and
  orchestration cleanup without creating a second storage or generation owner.

The build stamp is a compatibility token, not an authentication secret. If the
server artifact is missing or invalid, the fence deliberately fails open so a
recovery deployment cannot brick storage access and emits one startup warning.
Operational `/api/logs` and `/api/request-logs` writes/deletes are deliberately
outside the authoritative user-data fence. A tab opened before the first
installation of this pack has no 426 handler and therefore requires one
explicit reload after that first deployment; automatic clean/dirty transition
behavior becomes observable from the next production build onward.

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

Inspect components and preview the complete install without writing:

```bash
node dist/pocketrisu-patcher.cjs list
node dist/pocketrisu-patcher.cjs plan --root /path/to/PocketRisu --json
```

Apply the complete set, inspect it, or revert it in full:

```bash
node dist/pocketrisu-patcher.cjs apply --root /path/to/PocketRisu
node dist/pocketrisu-patcher.cjs status --root /path/to/PocketRisu
node dist/pocketrisu-patcher.cjs revert --root /path/to/PocketRisu
```

`apply` stores enabled rolling `all` intent. `revert` records an empty custom
intent as the disabled state. Because these commands are explicit, a later
plain `plan` previews and a later plain `apply` enables the complete set.
Automatic update tooling should inspect `status.delivery.enabled` before
invoking an install.

For an upstream upgrade, keep the current installation as `--root` and place
the pristine new upstream in a separate `--candidate` directory:

```bash
node dist/pocketrisu-patcher.cjs stage \
  --root /path/to/current/PocketRisu \
  --candidate /path/to/fresh/new/PocketRisu \
  --json
```

`stage` proves the candidate is separate and fresh, plans the complete set,
requires exact target qualification, applies only to the candidate, then
verifies the declared pnpm version and runs frozen
dependency installation, target tests, Svelte diagnostics, the production
build, and the BG orchestration bundle builder. A successful private receipt
says only that the
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

Users choose neither a subset nor a patch order. Pack-level `requires`,
`conflicts`, `supersedes`, and conditional hidden adapters are resolved
deterministically from the complete admitted roots. There is no global unit
order: units in different files are independent.
For unordered units in the same file, the engine dry-runs both orders against
the reconstructed baseline:

- same result: commutative, so no ordering edge is stored;
- only one valid result: that order is inferred;
- two different valid results: the manifest must declare the intended order;
- neither valid, or an ordering cycle: the plan is refused before any write.

When a newly admitted pack collides with one existing unit, the engine removes
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
   publication gate. A root pack with `allDefault !== false` enters the
   complete set. Use `allDefault: false` only while a maintainer is qualifying
   a not-yet-admitted pack; distributed installers cannot select it. Internal
   adapters use `userSelectable: false` and enter only through dependency or
   `autoWhen` ownership.
4. Do not hard-code an ETag. `packEtag()` calculates SHA-256 over the stable
   JSON representation of the pack's identity, visibility, admission metadata,
   graph relations, targets, units, and contracts. Any managed text, anchor,
   ordering contract, mode, admission, or version change therefore
   changes the ETag automatically. Never edit a target's
   `save/pocketrisu-patches/state.json` by hand.
5. Add a test that mutates one managed field and proves the ETag changes while
   the original remains stable. Also test complete-set admission, internal
   adapter expansion, focused owner graphs, and the explicit file boundary.
6. Run `npm test` and build the two compatibility-named installers twice; byte
   hashes must match. On a clean target, verify complete `plan`, `apply`, a
   second `plan` with no changed files, `status` with `catalogStatus: current`,
   and `revert` restoring exact content and POSIX modes.
7. For dependency changes, patch both the package manifest and lockfile, then
   prove `pnpm install --frozen-lockfile` succeeds and the resolved dependency
   graph contains the intended single version.
8. Bump the pack's semantic version whenever its behavior changes, even though
   content-addressed ETags would detect the change. Update the repository
   version, README release history, and CHANGELOG before publishing.

## State, ETags, and recovery

Runtime HTTP caching uses the database ETag. Patch management uses SHA-256
pack ETags and exact output hashes:

- every admitted pack still participates in the in-memory graph and collision
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
- `save/pocketrisu-patches/intent.json` records enabled rolling `all` or an
  empty custom disabled state, so a fresh upstream candidate never mistakes
  an old applied-state snapshot for blocks present in new source;
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

The complete artifact may adopt prior `features`, `hardening`, or known custom
state. Every non-empty historical intent becomes enabled complete delivery;
an empty custom intent stays disabled. A state containing a pack unknown to
the active catalog is refused so a foreign or future owner cannot be silently
removed. The next successful apply stores format-2 rolling `all`.

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
  --candidate /path/to/pristine/review/PocketRisu
```

This source-only entry point accepts `reviewing` targets but stages the same
complete graph with the same isolation, planning, full-target checks,
zero-change re-plan, and exact revert gates. It is not embedded in distributed
installers. Its automated receipt is `review-passed` with
`readyForManualCutover: false`; it cannot qualify its own behavioral intent.
Move the version from `reviewing` to `verified` only after the maintainer also
confirms the intended behaviors and round trip, then rebuild and retest the
downloader artifact.

The retired raw-selection procedure remains in
[`docs/patch-combination-verification-instructions.md`](docs/patch-combination-verification-instructions.md)
as historical evidence. It is not an active gate after all-or-nothing
delivery. Feature work still exercises every relevant owner composition and
the maximum complete graph.

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

PocketRisu, PocketRisu PR #49, PocketRisu Kei, Haejeok RisuAI, and the reviewed
GPL forks keep their original attribution boundaries. Focused Haejeok code and
behavior are adapted only where the exact paths and local owner differences are
listed in the notices. See the
[source provenance ledger](docs/SOURCE-PROVENANCE.md),
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), and [LICENSE](LICENSE).
