# PocketRisu 1.9.0 rebase audit

> **Status:** Investigation and rebase plan; no target qualification claimed.
>
> **Date:** 2026-08-01 KST
>
> **Scope:** Official PocketRisu `v1.8.1..v1.9.0`, every current patch pack,
> and the implemented or staged PocketRisu Kei children.

## Outcome

PocketRisu 1.9.0 is a new integration baseline, not a compatible point
release for the current manifests. It changes 297 paths across 64 commits
(`22,962` insertions and `1,336` deletions) and introduces new generation,
recovery, request-log, usage, render, preset, backup, and asset-viewer state.

The safe rebase is therefore:

1. preserve the existing 1.8.1 candidate and its staged K12 work unchanged;
2. qualify 1.9.0 in a separate local branch and pristine target;
3. retain existing ownership and preservation contracts;
4. replace duplicated Kei UI/runtime implementations with focused deltas
   only where upstream now owns the same user outcome;
5. redesign, rather than stack, the two generation/recovery authorities;
6. keep request-log and usage policy unresolved until their new upstream
   defaults are accepted or adapted explicitly.

At the audit boundary, no candidate patch had been applied to a live
PocketRisu tree. No PocketRisu process was restarted, and no branch, tag,
release, or installer was published. A later operational revert of the old
live 1.8.1 patch graph is recorded separately below; it does not qualify or
apply the 1.9 candidate.

## Provenance

| Source | Revision |
| --- | --- |
| Official previous target | `v1.8.1` / `63832a138c14cc7f11364cf7efdcb61950e7894c` |
| Official new target | `v1.9.0` / `85a65f3137b45c8de4a8d21a9887be213b1ac3fc` |
| Kei comparison | `cc1d1b195babd887577ebf943d5e82f01f58135c` |
| 1.9 rebase branch point | `081a32b` |

The official release and full comparison are:

- <https://github.com/PocketRisu/PocketRisu/releases/tag/v1.9.0>
- <https://github.com/PocketRisu/PocketRisu/compare/v1.8.1...v1.9.0>

The 1.9.0 pristine candidate was checked at the exact tag. Structural plans
were read-only with respect to source files; private conflict reports were
written only under the disposable audit target's patcher report directory.

## Preserved branch boundary

The existing `codex/pocketrisu-kei-integration` checkout remains at
`081a32b` with K12 staged but uncommitted. Its index and worktree are the
1.8.1 K12 evidence source; they are not rebased in place.

The separate `codex/pocketrisu-1.9-rebase` branch starts at the same commit
without importing those uncommitted K12 bytes. K12 is ported only after its
1.9 translation anchors and ownership adapters are redesigned. This avoids
mixing a target upgrade into an unreviewed feature commit.

## Existing pack path intersection

An intersection means that official 1.9.0 changed a path managed by the pack.
It is a review surface, not proof of a semantic conflict.

| Pack | Managed paths | Paths changed by 1.9.0 | Structural result on pristine 1.9.0 |
| --- | ---: | ---: | --- |
| `bg-preserve` | 85 | 22 | Qualified with a target-scoped 1.9 authority adapter; ordinary eligible sends retain whole-pipeline BG ownership while native jobs remain available on client-owned paths |
| `bg-preserve-storage-base` | 1 | 1 | Qualified on exact 1.9.0 as an asset-only conditional adapter and parent dependency |
| `lazy-chat-sync` | 27 | 9 | Qualified with seven mutually exclusive 1.8/1.9 full replacements; native model-job, recovery, logging, lock, and backup behavior retained |
| `lazy-chat-bg-adapter` | 4 | 2 | Qualified with both parents active; strict chat save plus root DB flush is the BG ACK barrier |
| `startup-cache` | 6 | 4 | Qualified on exact 1.9.0; conditional startup-cache delta retained |
| `preset-integrity` | 3 | 1 | All six anchors exact; active `-1` preset policy conflicts with new ID helper |
| `persona-organizer` | 11 | 5 | Qualified with a target-scoped 1.9 server asset walker; native embedded-module and settings-only semantics preserved |
| `character-organizer` | 5 | 1 | Qualified on exact 1.9.0; native drag/file-drop and AssetViewer behavior preserved |
| `character-import-ux` | 10 | 2 | Qualified with a version-neutral backup guard and the target-qualified lazy save parent |
| `personal-settings` | 14 | 6 | Qualified on exact 1.9.0 with two 1.9-only native Settings Search units |
| `parser-hardening` | 9 | 1 | Qualified on exact 1.9.0; parser-only delta retained |
| `toolchain-hardening` | 3 | 1 | Qualified on exact 1.9.0; test setup and dependency-only delta retained |

The path counts were recomputed from every manifest unit's `file` field and
the complete official changed-path set. Owned new files were not mislabeled
as upstream collisions.

### Definite composition hotspots

- `lazy-chat-sync` uses exact-target full replacements for `server.cjs`,
  bootstrap, global API, API-v3, auto storage, chat storage, and node storage.
  The qualified 1.9 forms retain native model-job routes, boot recovery,
  request logging, session/writer locking, and new storage headers.
- Native job recovery calls `saveChatToServer(chaId, index, chatId, chat)`.
  The lazy owner defaults the omitted `ChatSaveIntent` to its existing
  fail-closed `update` intent on both targets. Recovery can persist an
  existing chat but cannot use the omission to recreate one.
- `startup-cache` does not textually consume the new job-recovery bootstrap
  call. The qualified lazy integration retains both startup initializers, and
  their cache, hydration, and native recovery tests pass in one target graph.
- The new `setActiveBotPresetById(undefined)` deliberately stores `-1`.
  `preset-integrity` normalizes negative selection to `0`; the two policies
  cannot be composed by anchor success alone.
- The all-pack graph also encounters an `App.svelte` ordering collision
  between the changed mobile file-drop region and character organization.

## Kei child semantic overlap

The classification below is based on user behavior and state ownership, not
only changed filenames.

| Child | 1.9.0 relationship | Rebase decision |
| --- | --- | --- |
| K19 fullscreen images | Upstream now supplies character/module asset grid, search, fullscreen arrows, keyboard navigation, and native scroll-snap swipe. It lacked K19's dialog/ARIA names and used 36px close controls. | Qualified: duplicate viewer/wiring retired on 1.9; eight native AssetViewer accessibility/touch hooks remain. Receipt: `docs/POCKETRISU-1.9-KEI-K19-VALIDATION.md`. |
| K13 stream parser | OpenAI still decodes an accumulated buffer with `toString().split('\n')`; Google still creates a decoder per chunk and accepts only one-line `data: `. | Qualified unchanged on exact 1.9: keep K13's pure replayable parser and mutually exclusive base/BG adapters. Request-log metadata is not an SSE framing fix. Receipt: `docs/POCKETRISU-1.9-KEI-K13-VALIDATION.md`. |
| K14 render stability | Upstream adds optional balanced/strong display coalescing, active-message mount reuse, raw strong-mode rendering, and edit suppression. | Qualified as a native-renderer delta: add live-generation validation, lifecycle/local-reload identity, reactive message/generation metadata, partial-translation deferral, and BG ordering without copying a second renderer. Receipt: `docs/POCKETRISU-1.9-KEI-K14-VALIDATION.md`. |
| K16 navigation/hotkeys | Upstream fixes adjacent-character bounds, model-preset shortcut handling, and a generic unload guard. | Qualified as a target-scoped extension: retain the native model shortcut and unload owner, reuse the corrected character host with K16 filtering, and keep the master switch, exact modifier/Meta matching, pointer cleanup, modal/control guards, and opt-in same-page Back behavior. Receipt: `docs/POCKETRISU-1.9-KEI-K16-VALIDATION.md`. |
| K15 partial edit | Upstream merely suppresses its existing per-message partial editor during optimized streaming. | Qualified as an exact-target delta: replace the per-message controller with the shared manager while preserving upstream/K14 optimized-stream suppression, native overscroll, exact target/DOM identity, stale cancellation, and translation-cache token/key/data guards. Receipt: `docs/POCKETRISU-1.9-KEI-K15-VALIDATION.md`. |
| K11 Hypa tools | Upstream fixes CBS-aware preview and filtered search and retains existing summary reroll/bulk-resummary UI. | Keep manual contiguous-prefix selection, generate/preview/reroll/cancel/apply, exact frontier rejection, and generation-owner adapters. Remove any now-duplicate preview/search correction. |
| K12 translation tools | Upstream fixes the original-text persistent-cache key. It does not add entry list/search/edit/delete, CAS, import/export management, unused-candidate review, progressive loading, or cancellation. | Port the staged K12 core after removing the duplicate cache-key fix and rebasing four changed runtime anchors. Preserve complete translation identity and explicit destructive actions. |

The current `pocketrisu-kei` graph does not plan on raw 1.9.0. K14's changed
`DefaultChatScreen` wiring invalidates K15's chained root-binding anchor before
later children can be evaluated as a combined graph. This is expected rebase
evidence, not a reason to loosen anchor counts.

## Native 1.9 generation versus `bg-preserve`

These implementations overlap but are not equivalent.

### Native 1.9 owner

- the server relays model-preset provider requests and journals response bytes;
- the client can reattach to a live job or replay an unclaimed terminal job;
- a pending-send tombstone reruns a send when the main request never started;
- recovery fills/appends a response and claims the job after a chat save;
- server-side requests are enabled by default.

### Existing `bg-preserve` owner

- the server runs the complete ax → main → post-processing pipeline;
- operation-keyed intermediate/terminal results have revision-specific claim
  and ACK behavior;
- cancellation covers the whole pipeline and prevents resurrection;
- merge, durable save, cold recovery, reconnect, and explicit-cache behavior
  are already part of its preservation contract.

Blind stacking would create two possible transport/recovery decisions for one
send. A native pending-send rerun can also race a bg-owned parked operation if
both consider an interrupted send theirs. The 1.9 rebase must first define a
single owner for each request class:

1. ordinary bg-eligible top-level send;
2. client-only epilogue or programmatic/blocking send;
3. ax/helper request;
4. provider stream transport;
5. terminal result persistence and claim;
6. cancel and boot recovery.

`lazy-chat-sync` is separately qualified as the chat storage/hydration owner;
it adds no competing top-level generation transport or recovery authority.
The table is implemented and `bg-preserve` is qualified with exactly one
owner per request class. The browser setting remains unchanged; only the
detached server clone disables nested native jobs. The lazy/BG adapter remains
the next combined-owner qualification boundary. Evidence is in
`docs/POCKETRISU-1.9-GENERATION-AUTHORITY.md`.

## Request-log and usage policy correction

The official 1.9 implementation is more bounded than the older catalog
description implied:

- request payload storage has a 256 MiB aggregate budget;
- at least the newest 50 rows survive rotation;
- request and response bodies are capped at 2 MiB each and headers at 16 KiB;
- rotation runs every 20 inserted rows and once at startup;
- list reads use an ID cursor with a 1–500 limit and omit bodies by default;
- credentials are pattern-masked before persistence.

Therefore it is no longer accurate to describe official 1.9 request-body
storage or its list endpoint as unbounded.

Two catalog conflicts remain:

- logging defaults on and still persists ordinary prompt/response content,
  while K27 requires metadata-only defaults and excludes full content by
  default;
- usage rows are content-free and failure-isolated, but are never rotated,
  have no TTL/cap/pagination, and are coupled to the body-log toggle, while
  K28 requires independent bounded retention and pagination.

No compatibility patch chooses a policy in this audit. The catalog must be
updated from the observed 1.9 behavior before either policy is qualified.

## Rebase sequence

Each executable step receives its own commit and receipt. A later step may
begin only after the earlier owner graph is structurally usable; consolidated
iPhone L3 remains a later release gate and does not merge child evidence.

1. **Baseline/provenance:** declare 1.9.0 as `reviewing`, add qualification
   fixtures, and prove that the exact target identity is rejected without the
   maintainer review flag. Do not mark it `verified` yet.
2. **Unaffected or localized packs:** requalify startup cache, character
   organizer, personal settings, parser hardening, toolchain hardening, and
   the standard bg storage adapter one at a time. Anchor success is followed
   by focused semantic tests.
3. **Storage/import owners:** rebase persona organizer and character import;
   then rebase lazy chat while retaining native session lock, request-log,
   model-job, boot-recovery, and settings-only-backup behavior.
4. **Generation authority:** write the request-class ownership table, adapt
   native jobs and bg orchestration to it, and only then restore the lazy/bg
   adapter. Preserve result/claim/ACK, cancellation, and no-resurrection.
5. **Existing Kei children:** adapt K19, K13, K14, K16, K15, and K11 as
   separate commits, removing only behavior proved upstream-equivalent.
6. **K12:** port the preserved staged implementation onto the qualified 1.9
   owners, remove duplicate cache-key correction, and repeat its CAS/cancel/
   cleanup gates.
7. **Future catalog rows:** re-evaluate K03/K04 and K26 before implementation.
   Prompt roles and settings-only export are now upstream baseline behavior;
   preset folders and snapshot/restore contracts are still distinct.
8. **Policy rows:** decide K27/K28 defaults and retention without making them
   hidden umbrella behavior.
9. **Qualification:** run patcher tests, focused apply/reapply/current/revert,
   target tests/check/build, existing-owner combinations, L2.5, and the full
   raw-selection combination gate from
   `docs/patch-combination-verification-instructions.md`.

Only observed results may move 1.9.0 from `reviewing` to `verified`.

### Progress

- Baseline/provenance boundary: implemented locally. Exact 1.9.0 is
  `reviewing`, ordinary apply still rejects it, and unlisted releases remain
  outside the maintainer gate. Evidence is in
  `docs/POCKETRISU-1.9-TARGET-BOUNDARY-VALIDATION.md`.
- `toolchain-hardening`: qualified for exact 1.9.0 without changing runtime
  source. Its single-pack stage, zero-change reapply, and exact revert evidence
  is in `docs/POCKETRISU-1.9-TOOLCHAIN-HARDENING-VALIDATION.md`.
- `startup-cache`: qualified for exact 1.9.0 as a cache-only delta. Its
  baseline comparison, focused and combined gates, zero-change reapply, and
  exact revert evidence is in
  `docs/POCKETRISU-1.9-STARTUP-CACHE-VALIDATION.md`.
- `parser-hardening`: qualified for exact 1.9.0. Its unchanged upstream
  parser defects, focused parser suite, full toolchain combination, and both
  exact round trips are recorded in
  `docs/POCKETRISU-1.9-PARSER-HARDENING-VALIDATION.md`.
- `character-organizer`: qualified for exact 1.9.0. Its retained organizer
  outcome, native drag/file-drop and AssetViewer preservation, focused target
  gates, and exact round trip are recorded in
  `docs/POCKETRISU-1.9-CHARACTER-ORGANIZER-VALIDATION.md`.
- `personal-settings`: qualified for exact 1.9.0 with a target-scoped native
  Settings Search manifest entry and exact-one-result tests. Exact 1.8.1
  planning excludes both 1.9-only paths. Its dual-target gates, exact round
  trips, exhaustive 1.8 combination result, and runtime audit are recorded in
  `docs/POCKETRISU-1.9-PERSONAL-SETTINGS-VALIDATION.md`.
- `bg-preserve-storage-base`: qualified for exact 1.9.0 as a conditional
  asset-only retry/error adapter. Native database/chat/model-job storage paths
  bypass its branch, and the qualified parent BG graph consumes it. Its exact
  target gates, round trip, and runtime audit are recorded in
  `docs/POCKETRISU-1.9-BG-PRESERVE-STORAGE-BASE-VALIDATION.md`.
- `bg-preserve`: qualified for exact 1.9.0 with target-scoped native busy,
  abort, cache, composer, tokenizer, and fetch adapters. Ordinary eligible
  sends redirect before native generation/pending registration; client-owned
  sends preserve native model jobs, and only the detached server clone
  disables nested jobs. Full/focused target gates, exact ordinary round trip,
  the 2,048/2,048 exact-1.8 exhaustive gate, and runtime audit are recorded in
  `docs/POCKETRISU-1.9-GENERATION-AUTHORITY.md`.
- `persona-organizer`: qualified for exact 1.9.0 with mutually exclusive 1.8
  and 1.9 server asset walkers. The 1.9 adapter keeps native embedded-module
  and settings-only export semantics while adding gallery/folder references.
  Dual-target planning, focused/full gates, exact round trips, the exhaustive
  1.8 combination result, and runtime audit are recorded in
  `docs/POCKETRISU-1.9-PERSONA-ORGANIZER-VALIDATION.md`.
- `lazy-chat-sync`: qualified for exact 1.9.0 with seven target-scoped full
  replacements. The three-way integrations preserve native model jobs,
  recovery, request logging, locks, settings backup, and storage behavior
  while retaining lazy hydration, CAS, journals, and save intent. Full and
  focused target gates, ordinary exact round trip, the exhaustive 1.8 gate,
  and runtime audit are recorded in
  `docs/POCKETRISU-1.9-LAZY-CHAT-SYNC-VALIDATION.md`.
- `lazy-chat-bg-adapter`: qualified for exact 1.9.0 with both parent owners
  active. It adds no third owner: BG ACK follows strict lazy chat save and root
  DB flush, while asset retry stays asset-scoped. Full/focused gates, exact
  round trip, runtime audit, and remaining L3 are recorded in
  `docs/POCKETRISU-1.9-LAZY-CHAT-BG-ADAPTER-VALIDATION.md`.
- `character-import-ux`: qualified for exact 1.9.0 with a version-neutral
  System Backup guard and the qualified lazy save parent. Its combined target
  gates, exact round trip, runtime audit, and remaining iPhone scenario are
  recorded in
  `docs/POCKETRISU-1.9-CHARACTER-IMPORT-UX-ADAPTER-VALIDATION.md`.
- K16 navigation/hotkeys: qualified for exact 1.9.0 with separate 37-unit
  1.8 and 35-unit 1.9 adapters. The 1.9 path preserves the native model
  shortcut and global unload owner while adding the remaining K16 behavior.
  Its dual-target plan, base/lazy+BG gates, exact round trips, runtime audit,
  and remaining iPhone scenarios are recorded in
  `docs/POCKETRISU-1.9-KEI-K16-VALIDATION.md`.
- K15 partial edit: qualified for exact 1.9.0 with separate 14-unit 1.8 and
  14-unit 1.9 adapters plus its four-unit core. The 1.9 path removes the
  native per-message controller only after K14, preserves optimized-stream
  suppression and native overscroll, and retains the shared manager and
  translation-cache identity guards. Its dual-target plan, base/lazy+BG
  gates, exact round trips, runtime audit, and remaining iPhone scenarios are
  recorded in `docs/POCKETRISU-1.9-KEI-K15-VALIDATION.md`.
- K11, K12, and aggregate qualification remain pending.

## Post-audit operational handoff

After the audit and the localized qualifications, the old live 1.8.1
patch graph was reverted with the patcher's normal revert path in preparation
for a base update. The observed round trip restored 54 baseline files, removed
98 patch-owned files, and found zero mismatches across 152 managed paths. The
patch state is absent and the remaining format-2 intent requests an empty
custom pack set.

An exact official 1.9 staging installation passed its recorded server tests,
check, production build, production-dependency load, and provenance checks.
It was not installed live. An attempted directory cutover was rolled back
when the accompanying PM2 restart lacked explicit approval. The still-running
old process recreated a save directory during the rename window, briefly
nesting the original save. The original database was restored by exact rename
using its unchanged inode; the race-created directory was quarantined.
After recovery, SQLite `quick_check` returned `ok`, the original backup
directory remained present, and no nested save directory remained.

That left an intermediate boundary in which on-disk source was reverted
PocketRisu 1.8.1 while the not-restarted process still ran the previously
loaded patched 1.8.1 runtime.

The user subsequently authorized the base update and restart in this session,
while reserving all patcher adaptation for another session. Active requests,
durable BG rows, and database integrity were rechecked; PM2 was stopped before
any rename; the original `save/` and `backups/` were moved into the exact 1.9
tree; and PM2 restarted on version 1.9.0. The live tracked source differs from
official tag `85a65f3137b45c8de4a8d21a9887be213b1ac3fc` by zero files. Root and
main-asset HTTP checks returned 200, the served main asset matched the local
build byte-for-byte, the error log did not grow, and the original database
inode and `quick_check: ok` result were preserved.

The current live base is pristine official PocketRisu 1.9.0 with patch state
absent and an empty custom intent. Every requalified pack and 1.9 Kei
candidate remains unapplied. Full observations, limitations, preserved
worktrees, and the exact next patcher step are in
`docs/POCKETRISU-1.9-SESSION-HANDOFF.md`.

## Review method and limitations

The official changed-path set and manifest intersections were checked
exhaustively. Collaborating agents were used only for bounded read-only
lookups. Their strict-schema results were rechecked against source: Kei
anchors/symbol absence, all existing-pack path counts, generation/storage
hotspots, and request-log/usage mechanisms. No agent edited files.

This audit does not claim runtime correctness, build success, mobile behavior,
or exact revert on 1.9.0. Those are later measured gates. It also does not
infer that a structurally successful plan is semantically compatible.
