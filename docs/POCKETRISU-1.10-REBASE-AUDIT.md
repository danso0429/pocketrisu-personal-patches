# PocketRisu 1.10.0 rebase and live-cutover audit

> **2026-08-26 stable overlay:** `v0.2.1` retains the `v0.2.0` exact-1.10
> delivery and verifies PageFold plus its BG adapter after candidate automatic
> gates and physical L3. The complete graph is 40 packs / 934 units / 340
> managed paths. Route-specific PageFold limitations remain disclosed rather
> than rewritten as universal model evidence. See
> `docs/POCKETRISU-0.2.1-PAGEFOLD-STABLE-RELEASE.md`.

> **2026-08-24 stable overlay:** `v0.2.0` promotes the later
> `0.2.0-experimental.21` complete graph: 38 packs / 769 units / 280 managed
> paths on exact official PocketRisu 1.10.0. Ordinary generated-installer
> apply is verified for those 38 packs only. The 13 inactive catalog
> alternatives and retired background importer are not promoted. Remaining
> unavailable or not-exercised aggregate device rows are accepted as
> disclosed limitations, not rewritten as passes. The release authority is
> `docs/POCKETRISU-1.10-STABLE-RELEASE.md`.

> **2026-08-24 policy overlay:** the exact-1.10 runtime graph subsequently
> admitted durable background import and its WebKit resume follow-up.
> `0.2.0-experimental.20` retires public combinations and delivers the same 14
> root capabilities as one complete set. The cutover-time diagnosis and its
> waived raw-selection result below remain historical evidence.

> **Cutover-time status (historical):** Official 1.10.0 plus the
> `v0.2.0-experimental.17` rolling `all`
> graph is live. Exact-target adaptation, automatic qualification, commit/push,
> the iOS proprietary-module picker correction, and process-first live apply are
> complete. The picker follow-up passed iPhone L3; the remaining aggregate
> device L3 and stable release remain.
>
> **Date:** 2026-08-22 KST
>
> **Scope:** Official PocketRisu `v1.9.0..v1.10.0`, all 46 registered patch
> packs/adapters, the latest live 1.9 `all` state, and the operational cutover
> to pristine 1.10.0.

## Qualification addendum

The initial audit below is preserved as the cutover-time diagnosis. It has now
been acted on by `v0.2.0-experimental.16`:

- CharX archive integrity and shared module-import UX were implemented and
  pushed in separate commits;
- exact 1.10 lazy replacements retain the native structured clone, iterative
  large-lorebook diff, SQLite disk-spill, orphan purge, and reference guards;
- purge is fenced at its server writer and dashboard caller;
- native persona duplicate/clamp behavior is integrated with organizer
  galleries/folders, including the server purge/settings-backup walker;
- point-in-time maintenance has an exact 1.10 variant preserving the 2.2× disk
  gate, temporary-file VACUUM, checkpoints, and pinned-reader conflict;
- empty-server first import no longer asks for an impossible rollback snapshot,
  while replacement restores keep the fresh-snapshot/one-use acknowledgement
  contract; and
- the maximum graph passes 35 packs / 716 units / 267 managed paths, 1,609
  frontend tests, 177 server tests, 74 compatibility tests, Svelte 0/0,
  7,918-module build, BG bundle load, zero-change re-plan, and exact revert.

The user explicitly waived the exhaustive raw-selection combination verifier.
That step in the ordered plan is therefore a recorded residual risk, not a
claimed pass. See
`docs/POCKETRISU-1.10-CHARX-MODULE-ALL-VALIDATION.md` for the detailed receipt.

## Initial cutover outcome

PocketRisu 1.10.0 is now the live base. The former 1.9 aggregate candidate was
transactionally reverted before the source upgrade. The live patch state is
absent and its format-2 intent is an empty custom selection, so the old rolling
`all` policy cannot silently reapply.

The current patch catalog is **not compatible with 1.10.0**:

- official 1.10.0 changes 46 paths across 20 commits, with 1,316 insertions
  and 224 deletions;
- 19 of those changed paths were managed by the latest live graph, directly
  intersecting 19 of its 34 resolved packs;
- across the complete 46-pack catalog, 30 packs/adapters have at least one
  exact-1.9 unit on a changed official path;
- an ordinary 1.10 apply is fail-closed with `TARGET_REVIEW_REQUIRED`; and
- the current `all` plan also reaches a structural failure before the target
  gate because the 1.9 persona-normalization anchor no longer exists.

No implemented patch is wholly replaced by 1.10.0. One previously deferred
catalog outcome, K22 P07 persona duplication, is now native. Several other
1.10 changes are adjacent fixes that must be preserved during adaptation,
not reasons to remove the owning patch.

Do not reapply any 1.9 installer to the live 1.10 tree. A pack that happens to
find its old anchors is still unqualified, and exact-target filtering can make
a plan omit its 1.9-only units rather than prove compatibility.

## Provenance

| Source | Revision |
| --- | --- |
| Official previous target | `v1.9.0` / `85a65f3137b45c8de4a8d21a9887be213b1ac3fc` |
| Official new target | `v1.10.0` / `98e968339d1b3f91b9dac85bb3f2ebb5f90f9d14` |
| Patcher audit branch point | `17b1bb8d714531cbc68d62a0df0c65d17dc239d7` |
| Last live 1.9 patcher version | `0.2.0-experimental.15` |

Primary upstream sources:

- <https://github.com/PocketRisu/PocketRisu/releases/tag/v1.10.0>
- <https://github.com/PocketRisu/PocketRisu/compare/v1.9.0...v1.10.0>

The release was published at `2026-08-22T06:46:44Z`. The exact tag was fetched
from the official repository and compared locally without relying on the
release-note summary alone.

## Live cutover receipt

### Preflight and revert

Immediately before stop/revert, the observed live state was:

- PocketRisu 1.9.0, PM2 online, active HTTP requests 0;
- 34 resolved packs, 669 units, 254 managed paths, and source drift 0;
- native main/aux running jobs 0, unclaimed terminal main jobs 0, and
  `pending_sends` 0;
- BG result payload rows 0 and 21 operation-state rows, all `delivered`;
- SQLite `quick_check=ok`; and
- no transaction journal or nested `save/save` path.

PM2 was stopped before source mutation. The canonical generated patcher then
performed its normal transactional revert. The saved pre-revert state proved:

| Revert check | Observed |
| --- | ---: |
| Managed paths checked | 254 |
| Baseline files at exact content/mode | 94 |
| Patch-owned files absent | 160 |
| Mismatches | 0 |

The state file was removed, the transaction journal was absent, and intent
became `custom` with `requestedPacks: []` while retaining `preset: all` only as
historical context.

### Pristine 1.10 candidate gates

The candidate was built from an archive of the exact official tag, not from a
floating branch. It contained no `.git`, `save/`, or `backups/` directory.

| Gate | Observed result |
| --- | --- |
| Frozen dependency install | 485 packages; ARM64/Node 25 `msgpackr-extract` local native build completed |
| Server suite | 4 files / 99 tests passed outside the loopback-restricted sandbox |
| New storage and registry focus | 2 files / 74 tests passed |
| Svelte diagnostics | 0 errors / 4 existing warnings in one file |
| Production build | 7,799 modules transformed |
| Production prune/load | `msgpackr` native acceleration on; pack/unpack, `better-sqlite3`, and Express loaded |
| Full pristine frontend suite | 67/69 files, 959 passed, 3 skipped; 83 failures in two Gemini-cache files from Node 25's present-but-incomplete `localStorage` |

The 83 frontend failures match the already isolated Node 25 test-environment
defect. They are not recorded as product regressions or as passes. They also
show that `toolchain-hardening` remains useful on 1.10.

### Stopped-process cutover and runtime verification

The reverted 1.9 application tree was renamed to the recoverable local
rollback basename `risuai-nodeonly-v190-reverted.20260822-194214`. The exact
1.10 candidate was then moved into the live path, and the original `save/`
and `backups/` directories were moved by exact rename before PM2 restarted.
The rollback application tree contains no user-data directory.

Post-cutover observations:

- live tracked source versus official `v1.10.0`: differences 0;
- package and `.installed-version`: `1.10.0` / `v1.10.0`;
- PM2 online at observed PID `2918785`, restart counter 6, unstable restarts
  0, active requests 0;
- root HTTP 200 with 3,328 bytes;
- root references `assets/index-0sHEgXFB.js`;
- served/local main asset: 1,912,701 bytes and SHA-256
  `1377706b1ced4871fd1d12bcb355ac8b6843b57adfff177af7dd0cd673cea435`;
- PM2 error-log growth: 0 bytes; output-log delta contained stop/start and
  local smoke traffic;
- original `save/`, `backups/`, `risuai.db`, and `model-jobs.db` inodes
  remained `786441`, `788086`, `786453`, and `872636` respectively;
- `quick_check=ok`, native running jobs 0, pending sends 0, BG result payloads
  0, and the same 21 delivered operation states; and
- patch state absent, empty custom intent present, and nested save absent.

No user asset, chat, queue item, patch report recipient, tag, release, or
remote patch feed was deleted or changed by this cutover.

## Official 1.10 changes versus ownership

| Official change | Current relationship | Required adaptation |
| --- | --- | --- |
| Manual orphan-media scan/purge; boot auto-purge now off by default | Intersects lazy full replacements, persona gallery/folder references, dashboard fencing, backup snapshot maintenance, startup bootstrap, and database-host adapters | Preserve all new native reference classes and fail-closed scan guards; extend them with persona gallery/folder references; fence and snapshot-coordinate the new destructive route |
| Image-gen, legacy persona, GPT-SoVITS, and plugin-storage asset-reference fixes | `persona-organizer` already adds different live references; neither side is a superset alone | Compose one client/server walker containing every native 1.10 reference plus gallery/folder references; add loss-prevention tests |
| VACUUM temp spill and 2.2x disk-space gate | Directly intersects `server-backup-snapshot-*` and `client-build-fence` dashboard/server hosts | Rebuild the maintenance fragment from 1.10; do not copy its 1.9 1.2x/MEMORY version |
| `structuredClone` server patch snapshot and detailed patch errors | `lazy-chat-sync` replaces `server.cjs` and `nodeStorage.ts` | Base new full replacements on exact 1.10 so large-DB patching and diagnostics survive |
| Iterative large-character lorebook diff | `lazy-chat-sync` replaces `risuSave.ts` and its test | Consume the native loop and both new regression tests before restoring lazy deltas |
| Native persona duplicate, selected-index clamp, and empty-array recovery | `persona-organizer` replaces the page and inserts after the old normalization block | Retain native duplicate/clamp/recovery. K22 P07 moves from deferred to native; test deep-copy identity plus gallery/folder/reference behavior |
| Wire model ID in logs/jobs and recovered message model | Intersects `bg-preserve` request hooks and `client-build-fence` job-recovery hooks | Preserve `resolveWireModelId`, the recorded job model, and live/recovered formatting across browser, native-job, and BG-owned paths |
| Model-settings deep-link correction | Intersects `personal-settings` routing and the composed K16 graph | Preserve `ModelPresetTab` and the fourth `openSettings` argument while adding Personal routes |
| Undefined legacy regex-flag guards | Directly intersects BG regex UI/processing hosts | Retain all nullish flag guards while preserving canonical multi-direction behavior |
| NodeOnly Standard branch-comment rendering | Directly intersects K14 chat-render and K15 partial-edit adapters plus BG touch hooks | Preserve the native `isComment` branch and verify branch delete/render under base and BG graphs |
| File-picker null result and unsupported-type notice | No direct manifest path intersection; persona/import features consume the helper | Keep the native helper/caller guards. Existing character-import concurrency guards remain distinct |
| Plugin iframe `screen-wake-lock` permission | No patch intersection | Keep native. It complements plugin streaming but does not replace whole-pipeline BG persistence |
| NovelAI Diffusion V5 choices | No patch intersection | Keep native; no text-generation owner change |
| Samsung PWA `share_target` removal | No patch intersection | Keep native manifest |
| Bundled model-registry refresh, including Gemini 3.7 profiles | No direct managed registry paths | Keep native snapshots and re-run BG/cache/provider-shape tests before qualification |

## Critical incompatibilities

### F1 — lazy full replacements would erase 1.10 data-integrity fixes

The live 1.9 lazy replacement still contained
`JSON.parse(JSON.stringify(dbCache[...]))` and `patch.push(...charPatch)`.
Official 1.10 replaces them with `structuredClone` and iterative push. It also
adds the orphan purge/reference guards and VACUUM changes inside the replaced
server host. Reusing any 1.9 replacement is therefore a data-integrity
regression, even if a surrounding anchor can be made to match.

### F2 — the new destructive purge route is outside the client build fence

`clientBuildFence.cjs` does not list
`POST /api/db/assets/purge-orphans`, and the new dashboard caller uses raw
`fetch` rather than `clientBuildFetch`. A naive rebase would leave exactly the
new destructive write callable by a stale served client while older writes
remain fenced. The route and caller must be added as one owner-local change.

### F3 — point-in-time maintenance would regress VACUUM and miss purge

The 1.9 snapshot adapter replaces the complete optimize/WAL section. Its
managed fragment uses the old 1.2x disk threshold and direct `VACUUM`, so
applying it to 1.10 would remove the new on-disk temp spill and 2.2x gate.
The new purge route also performs a `TRUNCATE` checkpoint after deletion; that
checkpoint needs an explicit point-in-time backup conflict decision rather
than sitting outside the existing maintenance boundary.

### F4 — persona cleanup needs a union, not either implementation alone

Official 1.10 protects settings image-generation references, legacy persona
`image`, GPT-SoVITS audio, and plugin-stored assets. The persona pack protects
inactive `imageGallery` entries and folder icons. Dropping either set can make
the new manual purge delete a live user asset. The server stats, character
stats, purge execution, client boot sweep, settings-only export, and backup
walker must use an equivalent union.

The pack's full Persona Settings replacement would also remove the native
duplicate action and selected-index clamp. Its database insert anchor is gone
because official 1.10 changed `personas ??=` into an array/non-empty recovery
block.

### F5 — request and recovery metadata changed under BG/fence owners

`request.ts` now resolves the actual wire model once and uses it for request
logs, server jobs, failures, and returned model identity. `jobRecovery.ts`
formats that stored model onto recovered messages. BG request hooks and the
client-build recovery hooks must compose around those values; preset display
names must not replace the wire ID again.

### F6 — UI guards sit inside active patch hosts

The regex null guard and Standard-theme branch comment are not broad feature
replacements. They are small upstream fixes inside hosts owned by BG/K14/K15
adapters. They must be present in the final composed output and have focused
tests; anchor success elsewhere does not prove that.

## Exhaustive 46-pack path classification

`Paths/units` counts exact-1.9 units whose `file` is one of the 46 official
changed paths. Zero means no direct path overlap, not automatic compatibility.

| Pack / adapter | Paths/units | Classification and next action |
| --- | ---: | --- |
| `bg-preserve` | 9/37 | High-risk rebase: request model identity, regex guards, chat comment render, global/server asset walkers, and new registry profiles |
| `bg-preserve-storage-base` | 1/3 | Rebase `nodeStorage` asset retry around native patch-error reporting |
| `client-build-fence` | 5/20 | High-risk rebase: add purge writer/caller; preserve recovery metadata and dashboard VACUUM UI |
| `client-build-fence-bg-adapter` | 0/0 | No own path hit; requalify after both changed parents |
| `client-build-fence-standard-adapter` | 1/2 | Rebase backup XHR host in `nodeStorage` |
| `client-build-fence-kei-adapter` | 0/0 | No own path hit; requalify parent composition |
| `client-build-fence-kei-standard-storage-adapter` | 1/2 | Rebase standard backup XHR host |
| `client-build-fence-kei-lazy-storage-adapter` | 1/2 | Rebase lazy backup XHR host |
| `server-backup-snapshot-core` | 1/3 | High-risk DB helper rebase; preserve `SQLITE_TMPDIR` and snapshot semantics |
| `server-backup-snapshot-standard-adapter` | 1/9 | High-risk server rebase; rebuild purge/optimize/WAL maintenance from 1.10 |
| `server-backup-snapshot-lazy-adapter` | 1/9 | Same maintenance rebase after exact-1.10 lazy owner |
| `startup-cache` | 3/16 | Structurally probes cleanly but must preserve boot orphan/plugin scans and server changes; requalify |
| `lazy-chat-sync` | 6/6 | Blocking full-replacement rebase; preserve every 1.10 storage/server fix |
| `lazy-chat-bg-adapter` | 2/5 | Rebase global/node storage and requalify both parent owners |
| `persona-organizer` | 4/11 | Blocking/high-risk: native duplicate/clamp/recovery plus unioned asset references |
| `character-organizer` | 0/0 | No observed 1.10 outcome overlap; target requalification only |
| `character-import-ux` | 0/0 | Native picker guard is complementary; blocked transitively on lazy rebase |
| `personal-settings` | 5/7 | Rebase routing/bootstrap/database/language; preserve ModelPreset tab and orphan-auto setting |
| `preset-integrity` | 1/4 | Requalify database composition; no duplicate 1.10 preset outcome found |
| `parser-hardening` | 0/0 | No changed host or equivalent parser fix; early requalification candidate |
| `toolchain-hardening` | 1/1 | Still useful; retarget package/lock and rerun Node 25/full-build gates |
| `kei-stream-parser-core` | 0/0 | Pure core unchanged; requalify |
| `kei-stream-parser-base-adapter` | 0/0 | No direct hit; requalify base provider composition |
| `kei-stream-parser-bg-adapter` | 0/0 | No direct hit; requalify after BG request changes |
| `kei-chat-render-core` | 0/0 | Pure core unchanged; requalify |
| `kei-chat-render-base-adapter` | 1/4 | Preserve native branch-comment render in `Chat.svelte` |
| `kei-chat-render-bg-adapter` | 1/4 | Same, plus BG ordering/reload composition |
| `kei-mobile-navigation-core` | 0/0 | Core unchanged; requalify |
| `kei-mobile-navigation-base-adapter` | 4/10 | Rebase bootstrap/database/language and preserve new routing/defaults |
| `kei-mobile-navigation-lazy-adapter` | 4/10 | Same after exact-1.10 lazy replacement |
| `kei-hypa-tools-core` | 0/0 | No native Hypa change in 1.10; requalify |
| `kei-hypa-tools-base-adapter` | 2/2 | Language host rebase only, then focused tests |
| `kei-hypa-tools-bg-adapter` | 2/2 | Language host rebase plus BG composition |
| `kei-partial-edit-core` | 0/0 | Core unchanged; requalify |
| `kei-partial-edit-base-adapter` | 3/10 | Preserve native branch comments and new language additions |
| `kei-partial-edit-bg-adapter` | 3/10 | Same under BG/K14 ownership |
| `kei-translation-tools-core` | 0/0 | Core unchanged; requalify |
| `kei-translation-tools-base-adapter` | 2/2 | Language host rebase; retest model/registry paths |
| `kei-translation-tools-bg-adapter` | 2/2 | Same plus BG cancellation/cache composition |
| `kei-fullscreen-image-viewer-core` | 0/0 | No viewer change in 1.10; requalify |
| `kei-prompt-role-compat-core` | 1/2 | Rebase database host; no native typed-role replacement found |
| `kei-text-theme-normalization-core` | 1/3 | Rebase database host; no native invalid-theme normalization found |
| `kei-backup-restore-safety-core` | 0/0 | Core safety outcome unchanged; requalify |
| `kei-backup-restore-safety-standard-adapter` | 2/27 | High host overlap in server/node storage; compose with purge/fence/snapshot owners |
| `kei-backup-restore-safety-lazy-adapter` | 2/28 | Same after exact-1.10 lazy owner |
| `pocketrisu-kei` | 0/0 | Meta-pack has no units; remains blocked until every required child/adapter is qualified |

## Structural probes and their limits

Two separate probes were used:

1. **Real 1.10 identity:** `plan` reports target compatibility as
   `review-required`, and `apply` stops with `TARGET_REVIEW_REQUIRED` before
   source writes. The current `all` plan additionally stops on the missing
   persona normalization anchor.
2. **Diagnostic version spoof:** a disposable exact-1.10 source copy had only
   its package version changed to 1.9.0 so the old exact-1.9 units would be
   exercised. This is not a qualification target. Of 15 top-level/preset
   cases, seven structurally blocked: `client-build-fence`, `lazy-chat-sync`,
   `persona-organizer`, `character-import-ux`, and the `features`, `hardening`,
   and `all` presets. The first failures were snapshot-maintenance drift,
   full-server replacement drift, persona normalization drift, or composed
   full-replacement drift.

The other eight cases finding anchors does not establish semantic
compatibility. For example, an actual 1.10 plan can contain zero units for a
pack whose implementation is entirely target-scoped to 1.9, and BG can find
many version-neutral anchors while still needing all preservation checks
listed above.

## Ordered rebase plan

1. **Freeze and declare the target.** Keep live 1.10 pristine. Add 1.10 only
   as `reviewing`, retain fail-closed ordinary apply, and create exact-tag
   fixtures. Preserve both 1.8.1 and 1.9 branches unchanged.
2. **Requalify low-overlap packs.** Start with parser hardening, character
   organizer, toolchain hardening, then localized personal settings and preset
   integrity. A successful anchor probe is followed by focused behavior tests.
3. **Define the destructive storage boundary.** Before broader composition,
   unite all orphan-asset references, add purge to the stale-client fence,
   and decide point-in-time backup behavior for purge's checkpoint. Add
   negative tests that prove every custom/native live reference survives.
4. **Rebase startup and lazy storage.** Generate all exact-target full
   replacements from official 1.10 and retain its structured clone, iterative
   diff, VACUUM, orphan purge, plugin storage, writer lock, model jobs, logs,
   and backup behavior.
5. **Rebase persona/import owners.** Consume native duplicate/clamp/empty-array
   recovery, retain organizer gallery/folder/search behavior, and qualify
   import concurrency against the new picker helper.
6. **Rebase fence, point-in-time backup, and restore safety.** Use the new
   storage hosts, one writer route list, one maintenance decision, and exact
   standard/lazy adapters.
7. **Rebase BG generation.** Preserve wire-model identity, native jobs on
   client-owned paths, regex guards, branch comments, cache/provider shapes,
   result/claim/ACK, cancellation, and no-resurrection.
8. **Rebase Kei adapters child by child.** Core files with no path hit still
   require target evidence; changed Chat/bootstrap/database/language adapters
   retain the native fixes explicitly.
9. **Close aggregate gates.** Run first apply/current/reapply/exact revert,
   target tests/check/build, all owner combinations, L2.5, deterministic
   installer generation, and the discovered raw-selection domain before any
   live patch apply. Stable tag/release remains behind review and consolidated
   device L3.

## Final boundary

The requested base upgrade is complete and verified at the server/runtime
level. Patch adaptation is deliberately not bundled into the base cutover.
The old 1.9 candidate remains recoverable in source control and in the local
application-only rollback tree, but the live 1.10 installation contains no
patch state and no patch-owned runtime code.

This audit authorizes no deletion of the rollback tree, old patch branches,
user data, delivered BG state, or historical reports. It also does not claim
that any 1.10 patch pack is qualified merely because its current anchors can
be found.
