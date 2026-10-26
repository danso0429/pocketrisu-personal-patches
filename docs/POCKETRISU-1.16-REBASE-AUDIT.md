# PocketRisu 1.16.1 rebase audit

**Status (2026-10-26 KST):** audit and ordered plan only, after one plan review (see "Plan review"). No pack is
qualified on 1.16.1, no source has changed, and live is unchanged
(official PocketRisu 1.10.0 with the 40-pack `all` graph, Node 24.22.1).

**Scope:** official PocketRisu `v1.10.0` (`98e9683`) to `v1.16.1`
(`5da95f7`, 2026-10-24), and all 45 patch packs/adapters in this repository
at `01eb595` (0.2.4-experimental.88).

**Why:** the background-preserve plugin host mirrors the foreground plugin
API, and later BG stages (G2.3 onward) measure the real memory plugin on top
of it. Upstream changed that API after 1.10.0, so those stages need the
1.16.1 target first. The move is the whole patcher, not BG alone.

## Decisions

| Date (KST) | Decision |
| --- | --- |
| 2026-10-26 | Live stays on 1.10.0 with the current patches until a complete 1.16.1 candidate has passed the automatic gates, L4 and L5. The cutover is then one step. This differs from the 1.10 move, which first cut live to pristine 1.10 and left it without patches. |
| 2026-10-26 | E2 moves the existing packs, including the Kei children already admitted. The Kei re-comparison (Kei has moved 432 commits past the frozen comparison SHA `cc1d1b1` to Kei 2.2.1, 2026-10-25, and has diverged from PocketRisu 1.16.1) is a separate step after E2. |

## Upstream size

Measured with `git diff` on a fresh clone of the official repository:

| Item | Value |
| --- | --- |
| Commits `v1.10.0..v1.16.1` | 392 (334 non-merge) |
| Changed files | 507 (242 added, 261 modified, 4 deleted) |
| Lines | +57,161 / −7,960 |
| `server/node/server.cjs` | 6,584 → 9,425 lines; write routes (`app.post/put/delete/patch`) 47 → 60 |
| Runtime | `package.json` 1.16.1; `Dockerfile` `node:24-slim` (Node 24 is already live since E1) |

## Method

1. List every unit of every `manifest.cjs` and `adapter-manifest.cjs`
   (1,957 units: 1,116 `replace`, 416 `insert`, 425 `owned`).
2. For each `insert`/`replace` unit, count its anchor in the pristine 1.10.0
   file and in the pristine 1.16.1 file. For each `owned` unit, check whether
   the path exists upstream in either tag.
3. Three read-only explorers read the upstream diff of the 90 changed files
   that some pack manages, plus the release notes, and mapped changes to
   packs. Their readings are marked "reviewer reading" below; the orchestrator
   confirmed the items marked "confirmed".

Adapter factories are counted through the concrete manifests that
instantiate them, and `bg-preserve.json` through `bg-preserve/manifest.cjs`,
so the 1,957 units are the effective set.

Limits of the anchor check: it compares each anchor with the pristine file,
so it does not model units that anchor on text inserted or replaced by an
earlier unit (the 114 "absent in both" units below), it does not evaluate
`anchorPolicy` (`src/compose.cjs:145` allows several matches for `first`),
and an anchor that is still found is not evidence that the pack still
behaves correctly. Each unit plan follows this pristine triage with a
dependency-ordered composition. A drifted anchor is a fail-closed apply
error, not silent loss.

The first count of this audit classified anchors absent from both tags as
found (934); the plan review found the error and the table below is the
corrected count.

## Anchor results

| Result | Units |
| --- | ---: |
| Anchor found with the same positive count in 1.16.1 | 820 |
| Anchor absent from both pristine files (anchors on text another unit adds) | 114 |
| Anchor present in 1.10.0, absent in 1.16.1 (drift) | 132 |
| Anchor count changed (0→1 twice, 2→1 once) | 3 |
| Unit in a file the pack itself adds (not upstream) | 458 |
| Unit in a file upstream deleted | 5 |
| `owned` file new in both tags | 425 |
| `owned` file that upstream also added or changed | 0 |

21 packs have at least one drifted unit. `haejeok-korean-search-adapter`
also edits `src/lib/Mobile/MobileCharacters.svelte` and
`src/lib/Others/GridCatalog.svelte`, which upstream deleted in 1.12.0
(replaced by the native character manager).

Per pack. `Owned` counts units of type `owned`; `In own files` counts units
inside files the pack or a parent pack adds.

| Pack | Units | Found | Absent in both | Owned | In own files | Drift | Drift files |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `bg-preserve` | 187 | 105 | 1 | 66 | 0 | 15 | 7 |
| `character-import-ux` | 44 | 26 | 5 | 8 | 0 | 5 | 4 |
| `character-organizer` | 6 | 1 | 0 | 4 | 0 | 1 | 1 |
| `charx-archive-integrity` | 18 | 13 | 0 | 5 | 0 | 0 | 0 |
| `client-build-fence-bg-adapter` | 11 | 0 | 0 | 0 | 11 | 0 | 0 |
| `client-build-fence-kei-adapter` | 1 | 0 | 1 | 0 | 0 | 0 | 0 |
| `client-build-fence-kei-lazy-storage-adapter` | 2 | 0 | 2 | 0 | 0 | 0 | 0 |
| `client-build-fence-lazy-session-adapter` | 3 | 3 | 0 | 0 | 0 | 0 | 0 |
| `client-build-fence` | 58 | 46 | 0 | 8 | 0 | 4 | 2 |
| `fastimport-ios-picker` | 4 | 2 | 0 | 2 | 0 | 0 | 0 |
| `haejeok-chat-width-adapter` | 16 | 11 | 2 | 2 | 0 | 1 | 1 |
| `haejeok-korean-search-adapter` | 11 | 4 | 0 | 2 | 0 | 0 (5 in deleted files) | 0 |
| `haejeok-persistence-safety-adapter` | 53 | 41 | 6 | 4 | 0 | 2 | 2 |
| `kei-backup-restore-safety-core` | 10 | 4 | 0 | 4 | 0 | 2 | 2 |
| `kei-backup-restore-safety-lazy-adapter` | 31 | 19 | 0 | 0 | 0 | 12 | 3 |
| `kei-chat-render-bg-adapter` | 16 | 11 | 0 | 0 | 0 | 5 | 2 |
| `kei-chat-render-core` | 2 | 0 | 0 | 2 | 0 | 0 | 0 |
| `kei-fullscreen-image-viewer-core` | 8 | 8 | 0 | 0 | 0 | 0 | 0 |
| `kei-hypa-tools-bg-adapter` | 18 | 18 | 0 | 0 | 0 | 0 | 0 |
| `kei-hypa-tools-core` | 4 | 0 | 0 | 4 | 0 | 0 | 0 |
| `kei-mobile-navigation-core` | 4 | 0 | 0 | 4 | 0 | 0 | 0 |
| `kei-mobile-navigation-lazy-adapter` | 36 | 27 | 0 | 0 | 0 | 9 | 4 |
| `kei-partial-edit-bg-adapter` | 14 | 9 | 2 | 0 | 0 | 3 | 1 |
| `kei-partial-edit-core` | 4 | 0 | 0 | 4 | 0 | 0 | 0 |
| `kei-prompt-role-compat-core` | 3 | 2 | 0 | 1 | 0 | 0 | 0 |
| `kei-stream-parser-bg-adapter` | 4 | 4 | 0 | 0 | 0 | 0 | 0 |
| `kei-stream-parser-core` | 4 | 0 | 0 | 4 | 0 | 0 | 0 |
| `kei-text-theme-normalization-core` | 9 | 5 | 0 | 4 | 0 | 0 | 0 |
| `kei-translation-tools-bg-adapter` | 46 | 38 | 1 | 0 | 0 | 7 | 3 |
| `kei-translation-tools-core` | 10 | 0 | 0 | 10 | 0 | 0 | 0 |
| `lazy-chat-bg-adapter` | 854 | 176 | 90 | 136 | 430 | 22 | 12 |
| `lazy-chat-sync` | 47 | 7 | 0 | 30 | 0 | 10 | 10 |
| `log-load-performance` | 2 | 1 | 0 | 1 | 0 | 0 | 0 |
| `pagefold-bg-adapter` | 5 | 0 | 0 | 2 | 3 | 0 | 0 |
| `pagefold-model-preset` | 160 | 94 | 0 | 48 | 0 | 18 | 4 |
| `parser-hardening` | 14 | 10 | 0 | 4 | 0 | 0 | 0 |
| `persona-organizer` | 27 | 16 | 0 | 5 | 0 | 6 | 4 |
| `personal-settings-lazy-session-adapter` | 2 | 0 | 0 | 0 | 2 | 0 | 0 |
| `personal-settings` | 130 | 66 | 4 | 44 | 12 | 4 | 2 |
| `preset-integrity` | 8 | 4 | 0 | 1 | 0 | 3 | 2 |
| `server-backup-snapshot-core` | 11 | 3 | 0 | 8 | 0 | 0 | 0 |
| `server-backup-snapshot-lazy-adapter` | 9 | 7 | 0 | 0 | 0 | 2 | 1 |
| `toolchain-hardening` | 7 | 4 | 0 | 0 | 0 | 3 | 1 |
| `usage-cost-estimate` | 44 | 35 | 0 | 8 | 0 | 1 | 1 |

`pocketrisu-kei` is the meta pack and has no units. Files with the most
drifted units: `server/node/server.cjs` 14, `src/lib/ChatScreens/Chat.svelte`
10, `src/ts/process/request/request.ts` 9, `src/ts/globalApi.svelte.ts` 9,
`src/ts/storage/nodeStorage.ts` 8, `src/ts/process/index.svelte.ts` 6.

## Critical incompatibilities

### R1 — lazy full replacements would erase most new storage and server features

`lazy-chat-sync` replaces nine whole files with 1.10-based copies
(`patches/lazy-chat-sync/manifest.cjs:14-24`, confirmed): `server.cjs`,
`bootstrap.ts`, `globalApi.svelte.ts`, `plugins/apiV3/v3.svelte.ts`,
`autoStorage.ts`, `chatStorage.ts`, `nodeStorage.ts`, `risuSave.ts`,
`risuSavePatcher.test.ts`. All nine changed upstream, so all ten
whole-file anchors (including `session-lock.cjs`) drift and apply stops.
Regenerating them from 1.16.1 must keep, among others (reviewer reading
unless marked):

- server-side plugin storage in kv and its migration (1.11.0;
  `server.cjs:600-616`);
- lazy asset manifests (1.11.0, 1.15.0; `server.cjs:5071-5130`, chat strip
  and hydrate around `server.cjs:835-843`);
- native chat delta sync (1.13.0; `src/ts/storage/chatDeltaSync.ts`,
  confirmed added) with its 409 base-mismatch fallback;
- client auto-sweep (1.13.0; route `server.cjs:8303`, confirmed; callers in
  `bootstrap.ts`);
- character archive routes (1.13.0; `server.cjs:7314-7503`, confirmed);
- RisuAI account import that replaces all data (1.16.0;
  `server.cjs:5798-5844`, confirmed);
- case-sensitive kv prefix ranges (1.15.0 #102; `db.cjs:118-192`) and
  session-lock `revokeAll` (`session-lock.cjs:93-121`).

Open question for this unit: native delta sync (1.13) and `lazy-chat-sync`
both reduce chat transfer. Whether the native mechanism covers part of the
pack's purpose must be compared on separate axes (source, caller, state
lifecycle, safety, tests, user value) before either is kept or reduced. The
comparison result is a user decision.

### R2 — new destructive and write routes are outside the client build fence

The fence route list (`patches/client-build-fence/files/server/node/clientBuildFence.cjs:15-41`,
confirmed) has none of these 1.16.1 routes (confirmed in `server.cjs`):
`POST /api/risu-account/{prepare,download,cancel,apply}` (5798-5836),
`POST /api/characters/:chaId/archive` (7314),
`POST /api/characters/archive-batch` (7345),
`POST /api/db/archive/purge-orphans` (7482),
`DELETE /api/characters/:chaId/archive` (7503),
`POST /api/db/assets/auto-sweep` (8303). All 13 new write routes need a
fence decision, and the full-data account import needs a snapshot decision
(the backup-snapshot packs force a rollback snapshot before restores).

### R3 — the BG plugin host lacks 1.11–1.16 plugin API changes

Confirmed by name search in `patches/lazy-chat-bg-adapter/files-1.10/server/node/`:
no `parseRisuChat` (added 1.13.0), no `setChatToIndex`, no
`addRisuChatListener`/`removeRisuChatListener` (1.11.0), no `setDatabaseLite`,
no `safeLocalStorage`. Reviewer reading adds: `getChatFromIndex` and
`setChatToIndex` became async with placeholder fetch (1.14.0); plugin storage
moved to the server kv and `getItem` keeps `0`/`false`/`''` (`?? null`,
1.16.0) while the host uses `|| null` and the DB field; `setDatabaseLite`
now drops `plugins`; `getCharacter`/`getDatabase` carry lazy asset manifests
and a per-plugin full-storage switch (1.11.1). Parity with the 1.16.1
foreground API is the BG acceptance basis.

### R4 — request identity and recovery changed under BG and model-preset owners

Reviewer reading: 1.14.0 removed the model mode and added a per-slot legacy
model (`@legacy`, `classicModelIdFor`, `modelPresetBinding.ts:137-155`);
the BG request-policy anchor on the old `targ.aiModel = ...` block drifts.
1.11.0 added `logSource` per request mode; 1.12.0–1.13.0 changed job
reattach, recovered message metadata and the stop grace period
(`STOP_GRACE_MS`). `pagefold-model-preset` has 18 drifted units in
`request.ts`, `index.svelte.ts`, `tokenizer.ts` and `ModelBind.svelte`.

### R5 — native organizer features overlap existing packs

Release notes and reviewer reading: persona folders and inline edit
(1.11.0–1.11.1) overlap `persona-organizer`, which anchors on whole
`listedPersona.svelte`/`PersonaSettings.svelte` (both drift); the character
manager (1.12.0, folder grid grouping 1.16.0) replaced the grid catalog and
mobile list that `haejeok-korean-search-adapter` edits and overlaps
`character-organizer`. Each needs an owner decision (keep, merge into
native, or retire) based on the same multi-axis comparison as R1.

### R6 — smaller drifts

UI hosts (`Chat.svelte`, `ChatBody.svelte`, `Chats.svelte`, `hotkey.ts`,
`main.ts`, `TextAreaInput.svelte`, `persona.ts`, `App.svelte`), backup and
restore hosts (`ServerBackupList.svelte`, `backuplocal.ts`), translator,
`model-jobs.cjs` and `pnpm-lock.yaml` (`toolchain-hardening`). These are
anchor re-targeting with native-change preservation.

## Pack versus native 1.16.1

Anchor drift says where apply stops. It does not say whether a pack is still
worth carrying. Four read-only explorers compared every pack with native
1.16.1 on four axes: purpose over 1.10.0, whether 1.11–1.16.1 now provides
it, conflicts with native owners of the same state, route or lifecycle, and
native improvements the pack must not erase. Verdicts:
`NATIVE-SUPERSET` (native does everything the pack does: the pack is behind),
`PACK-SUPERSET` (the pack still adds something native lacks), `PARTIAL`
(each has something the other lacks), `NONE` (no native counterpart).

Rows marked **confirmed** were checked by the orchestrator in the 1.16.1
tree or the pack; all other rows are reviewer readings to confirm in the
unit's own plan. Dispositions are proposals. Retiring or merging a pack
removes or changes a delivered feature and is a user decision.

### Storage, fence and backup

| Pack | Verdict | Conflict or gap (evidence) | Proposed disposition |
| --- | --- | --- | --- |
| `lazy-chat-sync` | PARTIAL | Native 1.13 delta sync is a transport optimization: on a base mismatch it answers 409 `CHAT_DELTA_BASE_MISMATCH` and the client sends the full chat (`chatDeltaSync.ts:11`). It is not the pack's conflict merge: native `rebaseMerge.ts:31` merges tracked database changes, while the pack also merges derived chat views and keeps retained message references (`chatSaveRebase.ts:29,106`). Both patch the same chat-content path. Native `peek()` returns `unknown` for an id without a recorded boot (`session-lock.cjs:106-119`) where the pack's watermark treats it as stale. Pack-only: write journal (replayed at startup, cleared only after persistence), startup DB cache, `getDatabaseMetadata`, pinned snapshot reads. | Rebuild on native; never reapply the 1.10 whole files (R1). Decide per contract (bandwidth, chat conflict merge, message identity, reset invalidation, journal durability), not by the shared word "delta". |
| `client-build-fence` + 4 adapters | NONE | No build fence natively (**confirmed** absent route entries, R2). | Keep and rebase; extend the route list with the 13 new write routes. |
| `server-backup-snapshot-core` | PACK-SUPERSET | Native has no pinned point-in-time reader. The pack's `LIKE ... ESCAPE` prefix reads differ from native case-sensitive key ranges (`db.cjs:118-203`). | Keep; move the reader onto the native range API. |
| `server-backup-snapshot-lazy-adapter` | — | 2 drifted units; depends on `lazy-chat-sync`. | Follows the `lazy-chat-sync` decision. |
| `kei-backup-restore-safety-core` | PARTIAL | Native forces a snapshot before backup import (`server.cjs:3027-3031`) but its key is rounded to a 100 ms tick (`:326`) and it does not return or verify a surviving snapshot after rotation (`:335`); native snapshot restore (`server.cjs:8498`) takes no fresh snapshot first (**confirmed**) but restores plugin rows atomically with the blob (`:8531`). The pack adds unique keys, size verification before and after rotation, and confirmation on snapshot failure (`restoreSafety.cjs:105,166,256`). | Keep. Compare guarantee by guarantee before any shrink, and keep native's atomic plugin-row restore. |
| `kei-backup-restore-safety-lazy-adapter` | PARTIAL | 12 drifted units; some outcomes are native (protected restoring snapshot), the guarantees listed for the core are not. | Rebase with the core; shrink only units whose guarantee native provides. |
| `haejeok-persistence-safety-adapter` | PACK-SUPERSET | Native still does not persist the appended user message before generation. 2 drifted units near native plugin-update and Lua `setFullChat` fixes. | Keep and rebase. |
| `charx-archive-integrity` | PACK-SUPERSET | Native CharX import (fflate) has a per-asset size limit but no CRC check; the pack adds a second zip library. | Keep and rebase; decide on one zip library. |
| `log-load-performance` | PACK-SUPERSET | Native stats query unchanged, index still absent. | Keep and rebase. |

### BG, generation and model

| Pack | Verdict | Conflict or gap (evidence) | Proposed disposition |
| --- | --- | --- | --- |
| `bg-preserve` | PARTIAL | Native moved toward background survival: server model jobs journal provider bytes while the browser is away, and the browser slots the result into the chat on the next boot or tab return (**confirmed**, `jobRecovery.ts:20-34`; the job store is its own `model-jobs.db`, `model-jobs.cjs:156`). Native does not run post-processing or commit the chat on the server. Native owners next to BG: `/proxy2` aborts upstream on client close, also before the first byte (`server.cjs:2262`); the 8 s stop grace release applies only to `kind === 'live'`, background jobs stay with their polling loop (`generationState.ts:129`); pending-send evaluation recognizes live generations, recovered generation ids and native jobs (`jobRecovery.ts:687`). The pack already disables nested native jobs inside detached BG runs (`bg-preserve/manifest.cjs:25`). | Keep and rebase, preserving and extending the existing split with an owner matrix per request kind (foreground proxy, native job, detached BG, pre-request resumable send). Keep native busy-response ids where native reattachment applies; do not invent native job ids for BG-owned work. |
| `lazy-chat-bg-adapter` | PARTIAL | Already edits native `jobRecovery.ts` and `model-jobs.cjs`; its busy 409 lacks the `jobId`/`generationId` that the native client needs to reattach; plugin host API gap (R3). | Keep and rebase after the `bg-preserve` decisions. |
| `pagefold-model-preset` | PACK-SUPERSET | Native 1.14 per-slot legacy binding has no PDF page folding or per-task override; the pack wraps the resolver that 1.14 changed. | Keep and rebase on the 1.14 binding. |
| `pagefold-bg-adapter` | NONE | Anchors only pack-owned BG files. | Keep after its parents. |
| `usage-cost-estimate` | PARTIAL | Native logs tokens (cached, reasoning) and the job model, but no price or cost. One pack unit duplicates the native job-model field. Double logging by native recovery and the BG bridge is unverified. | Keep, drop the duplicate unit. |
| `parser-hardening` | NONE | Native thought extraction is still the greedy regex; `#when` precedence not yet compared. | Keep and rebase. |
| `kei-stream-parser-core` + BG adapter | PARTIAL | The native preset-adapter SSE parser (`preset/adapter/sse.ts`) now handles streaming UTF-8, multi-line data and CR/CRLF; the classic `getTranStream` path is unchanged. The pack must not replace `parseSseStream`, which native job recovery uses. | Keep for the classic path; consider merging into `sse.ts`. |
| `kei-prompt-role-compat-core` | NONE | Native role2 branch still has no role fallback. | Keep and rebase. |
| `preset-integrity` | PARTIAL | Native saves current settings as a new preset when the selected index has no entry (**confirmed**, `database.svelte.ts:2801-2805`, 1.15 #100) and guards a missing `changeToPreset` target (`:2829`). The pack clamps an invalid index to an existing entry before saving (`preset-integrity/manifest.cjs:17,45`), which would replace native recovery with overwriting the last valid preset. | Keep native recovery first; evaluate the pack's load and UI guards separately. |

### Organizers, settings and import

| Pack | Verdict | Conflict or gap (evidence) | Proposed disposition |
| --- | --- | --- | --- |
| `character-organizer` | NATIVE-SUPERSET | Native 1.12 character manager covers ordering, folders, search, sort, filter, deactivation and trash on the same `characterOrder` schema. The pack's `normalizeCharacterOrder` keeps only ids of live characters and drops empty folders (**confirmed**, `characterOrganizer.ts:62-103`), while native keeps deactivated stubs and empty folders (**confirmed**, `database.svelte.ts:1936-1955`): the pack's first write would remove deactivated characters' slots and empty folders. | Retire. |
| `persona-organizer` | PARTIAL | Native 1.11 persona folders use the same `personaFolders` key; the pack inserts `folderId` and `personaFolders` declarations that native already has (**confirmed**, `database.svelte.ts:1079,1284`) and replaces the persona page with a second folder UI. Pack-only: folder icons (`RisuPersonaFolder.icon`, `manifest.cjs:145`), per-persona image gallery, and cleanup protection for both (`manifest.cjs:331`); native `PromptPresetFolder` has only `id`/`name` (`database.svelte.ts:1089`) and the native uncleanable walker covers neither (`globalApi.svelte.ts:2081`). | Merge into native: drop the folder layer and page replacement; decide explicitly whether folder icons stay; keep gallery and icon references in the cleanup contract. |
| `character-import-ux` | PACK-SUPERSET | Native import still blocks; the pack replaces the whole `characterCards.ts`, which would drop native onboarding and import redirects; depends on `lazy-chat-sync`. | Keep, replace the whole-file unit with targeted inserts. |
| `fastimport-ios-picker` | NONE | No native overlap; target script hash unverified. | Keep and rebase. |
| `personal-settings` | PARTIAL | The pack's route `Personal: 24` collides with native `LongTermMemory: 24` (**confirmed**, `routing.ts:44`). Native now has settings search, a route table and an accessibility tab; import navigation is native (`goCharacterOnImport`). Pack-only: Personal page, CSS/font editor, external request headers. Editor save units touch the save path native now owns with ETag and rebase. | Merge into native and shrink; renumber the route. |
| `personal-settings-lazy-session-adapter` | NONE | Depends on `lazy-chat-sync`. | Follows that decision. |
| `toolchain-hardening` | NONE | Native lock already contains lightningcss 1.33.0; 3 lock units drift; original reason for the pin not re-checked. | Re-derive on the 1.16.1 lock or retire. |
| `haejeok-chat-width-adapter` | PACK-SUPERSET | Adds `small`. Native load normalization coerces anything but standard/wide/full to `standard` (**confirmed**, `database.svelte.ts:171-173`), so the pack must own that normalizer. | Keep and rebase. |
| `haejeok-korean-search-adapter` | PACK-SUPERSET | Native search is space-stripped substring; two units edit files deleted in 1.12. | Rebuild on the native character manager search. |

### Kei UI children

| Pack | Verdict | Conflict or gap (evidence) | Proposed disposition |
| --- | --- | --- | --- |
| `kei-chat-render-core` + BG adapter | PARTIAL | Native 1.11/1.13 streaming render fixes; the adapter has 5 drifted units and does not use native `isStreaming`. | Rebuild on native; keep reload-pointer handling only if streaming remounts reappear. |
| `kei-partial-edit-core` + BG adapter | PARTIAL | Native `PartialEditController` resolves targets and carries translation context, but saves from the captured `sourceData` without checking that the message still matches (**confirmed**, `PartialEditController.svelte:355-361`); the pack checks chat/message identity, index, id, original text, translation issuance and expected cache data (`keiPartialEditIdentity.ts:29`). | Keep the stale-write guarantees (port them onto the native controller or keep the manager); the 3 drifted adapter units follow. |
| `kei-mobile-navigation-core` + lazy adapter | PARTIAL | Native hotkeys cover adjacent characters, the quick menu and `isTypingTarget`; pack-only: Android back guard and hotkey toggle; 9 drifted adapter units. | Keep only the back guard and toggle, rebuilt on native hotkeys. |
| `kei-hypa-tools-core` + BG adapter | PARTIAL | The manual summary panel reads the legacy global preset mirror (`hypaV3PresetId`) that 1.11 per-chat memory presets no longer read. | Keep and rebase; read the preset through the per-chat resolver. |
| `kei-translation-tools-core` + BG adapter | PARTIAL | Native has a persistent LLM translation cache with export, import and clear but no cache panel; 7 drifted adapter units. | Keep the panel; route clear/import/export through native functions. |
| `kei-fullscreen-image-viewer-core` | PACK-SUPERSET | Native viewer has keyboard and swipe but no dialog/ARIA attributes. | Keep and rebase. |
| `kei-text-theme-normalization-core` | PACK-SUPERSET | Native still only defaults a nullish text theme. | Keep and rebase. |
| `pocketrisu-kei` | meta | — | Update after the child decisions. |

### What this changes

- Two packs would damage data or break the build if rebased as written:
  `character-organizer` (deactivated slots, empty folders) and
  `persona-organizer` (duplicate declarations, second folder UI).
- One route collision (`personal-settings`) breaks the Long-term memory
  settings page.
- Native now covers part of BG (server-side stream journaling with browser
  slot-in on return). BG still alone finishes the whole pipeline and commits
  on the server, but the two now share request, stop and recovery lifecycles.
- Candidate to retire: `character-organizer` (its retained search
  dependent `haejeok-korean-search-adapter` requires and auto-selects it,
  `manifest.cjs:35`, so the graph changes with it).
- Candidates to shrink into native, each per guarantee rather than per
  feature name: `lazy-chat-sync`, `persona-organizer`, `personal-settings`,
  `preset-integrity`, `kei-chat-render-*`, `kei-mobile-navigation-*`,
  `toolchain-hardening`. `kei-partial-edit-*` and
  `kei-backup-restore-safety-*` were first proposed for retirement or
  shrinking; the plan review showed native lacks some of their guarantees,
  so they stay.

## Ordered plan

Each unit gets its own plan with a test contract when it starts. All are
risky under the project's routing rules (multi-file, persistence,
install/revert).

| ID | Unit | Content |
| --- | --- | --- |
| E2-0 | Target declaration | Add 1.16.1 as `reviewing`, keep ordinary apply fail-closed, fetch and hash the pristine tag for the candidate gate, and record the pristine 1.16.1 baseline (`pnpm test`, `test:compat`, `check`, `build`) on Node 24. |
| E2-0b | Owner decisions and graph | Confirm the reviewer-reading rows that a disposition depends on, present the retire and shrink candidates with evidence for user decisions, and produce the revised dependency graph (`requires`, `after`, `autoWhen`, meta-pack children) that those decisions imply. |
| E2-1 | Independent packs | Only packs and helpers with no unrebased parent: `charx-archive-integrity`, `parser-hardening`, `fastimport-ios-picker`, `log-load-performance`, `kei-prompt-role-compat-core`, `kei-text-theme-normalization-core`, `kei-fullscreen-image-viewer-core`, and the owned helpers of the Kei cores. Adapters wait for their actual parents (fence adapters need the fence and BG/lazy/restore owners; stream and hypa BG adapters need BG). |
| E2-2 | Destructive storage boundary | Fence and snapshot decisions for the 13 new write routes (R2); one orphan-reference walker that includes 1.16 asset manifests and archives. |
| E2-3 | Lazy storage and startup | Regenerate the nine full replacements from 1.16.1 (R1) after the native delta-sync comparison and the user's decision on it. |
| E2-4 | Persona, character, import and settings owners | Apply the E2-0b decisions to `persona-organizer`, `character-organizer`, `character-import-ux`, `haejeok-korean-search-adapter`; then `personal-settings` (route renumbering) before its width and session dependents. |
| E2-5 | Model preset and request identity | `pagefold-model-preset` and `usage-cost-estimate` on the 1.14 binding model (R4). |
| E2-6 | Fence, backup and restore | `client-build-fence`, `server-backup-snapshot-*`, `kei-backup-restore-safety-*` on the new storage hosts. |
| E2-7 | BG | `bg-preserve`, `lazy-chat-bg-adapter` and BG adapters: plugin API parity with 1.16.1 (R3), request identity and recovery (R4), and the existing BG contracts (result/claim/ACK, cancellation, no-resurrection, D2/D3 behavior). |
| E2-8 | Dependent adapters | Kei, Haejeok, fence and BG adapters child by child against their rebased parents. |
| E2-9 | Aggregate and cutover rehearsal | Complete graph apply/current/reapply/exact revert, target gates, L4, deterministic installers, L5. BG verifications done on 1.10.0 (including D2/D3 with the real memory plugin) are repeated on 1.16.1. Then a migration rehearsal on a copy of the patched 1.10 live data: quiesce writers and jobs, reconcile the lazy chat journal, take a consistent pre-cutover backup, run native 1.16 migrations (plugin storage moves out of the database blob in 1.11, and the 1.11 notes warn that going back to 1.10 binaries leaves migrated plugin data unavailable), check data written by retired packs, and test a data-plus-code rollback with a stated rule for writes accepted after the cutover. The one-step live cutover follows under its own plan. |

## Plan review

One Codex plan review (gpt-6-astra, read-only, 2026-10-26) raised nine
findings. The orchestrator checked each against the code and adopted all
nine:

| # | Finding | Change in this audit |
| --- | --- | --- |
| 1 | Native partial edit saves from captured data without a stale-target check | `kei-partial-edit-*` from NATIVE-SUPERSET to PARTIAL; not retired |
| 2 | Native pre-import snapshot lacks unique keys and survival verification | `kei-backup-restore-safety-*` kept; shrink only per guarantee |
| 3 | Exact source revert is not a data rollback (lazy journal, 1.11 plugin-storage migration) | E2-9 gains a migration and data-plus-code rollback rehearsal |
| 4 | 114 anchors absent from both tags were counted as found | Count corrected to 820 found, 114 absent in both |
| 5 | E2-1 included adapters whose parents are not rebased; retirement changes `requires`/`autoWhen` | E2-1 limited to independent packs; E2-0b produces the graph; `personal-settings` slot named |
| 6 | Persona shrink omitted folder icons and their cleanup references | Row and disposition updated |
| 7 | Preset clamping would replace native recovery with overwriting a valid preset | Row and disposition updated |
| 8 | BG/native stop and close ownership was described too broadly | Row rewritten with the per-request owner matrix |
| 9 | Native delta transport is not the pack's conflict merge | Row rewritten; decision per contract |

## Inputs not yet confirmed

- The reviewer readings above that are not marked confirmed.
- `docs/audits/2026-10-18-rebase-revisit-kv-index-and-composer-resize.md`
  on the unpushed `claude/rebase-revisit-notes` branch: a reviewer reading
  says its kv-index premise no longer holds on 1.16.1 (prefix reads use key
  ranges, 1.15.0 #102) and its composer-resize description does not match
  the 1.15.0 code. Re-check in E2-1 before using it.
- The isolated memory-plugin backend has only been installed on Node 25
  (ABI 141). It is installed per measurement, so its first Node 24 install
  happens when the BG re-measurement needs it.

## Boundary

This audit changes no pack, target, live file, or user data, and qualifies
nothing on 1.16.1.
