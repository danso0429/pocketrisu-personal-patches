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

No patch was applied to a live PocketRisu tree. No PocketRisu process was
restarted, and no branch, tag, release, or installer was published.

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
| `bg-preserve` | 85 | 22 | Refused: changed/multiple anchors and duplicate generation authority |
| `bg-preserve-storage-base` | 1 | 1 | All three anchors still exact; semantic review required |
| `lazy-chat-sync` | 27 | 9 | Refused: seven full-file replacement anchors changed |
| `lazy-chat-bg-adapter` | 4 | 2 | Four parent-dependent anchors unavailable until both owners are rebased |
| `startup-cache` | 6 | 4 | All 17 non-owned anchors exact; semantic review required |
| `preset-integrity` | 3 | 1 | All six anchors exact; active `-1` preset policy conflicts with new ID helper |
| `persona-organizer` | 11 | 5 | Refused at the server gallery-assets anchor |
| `character-organizer` | 5 | 1 | Planned structurally; semantic review required |
| `character-import-ux` | 10 | 2 | Refused at the snapshot/import guard anchor |
| `personal-settings` | 12 | 4 | Planned structurally; semantic review required |
| `parser-hardening` | 9 | 1 | Planned structurally; semantic review required |
| `toolchain-hardening` | 3 | 1 | Planned structurally; package/test contract review required |

The path counts were recomputed from every manifest unit's `file` field and
the complete official changed-path set. Owned new files were not mislabeled
as upstream collisions.

### Definite composition hotspots

- `lazy-chat-sync` currently replaces `server.cjs`, bootstrap, global API,
  API-v3, auto storage, chat storage, and node storage forms from 1.8.1. A
  rebase must retain native model-job routes, boot recovery, request logging,
  session/writer locking, and new storage headers.
- Native job recovery calls `saveChatToServer(chaId, index, chatId, chat)`.
  The lazy owner requires an additional `ChatSaveIntent`; recovered-message
  persistence therefore needs an explicit adapter rather than an omitted
  argument or a permissive default.
- `startup-cache` does not textually consume the new job-recovery bootstrap
  call, but its full startup flow still needs combined hydration/recovery
  ordering tests.
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
| K19 fullscreen images | Upstream now supplies character/module asset grid, search, fullscreen arrows, keyboard navigation, and native scroll-snap swipe. It lacks K19's complete dialog/ARIA contract and uses 36px close controls. | Retire the duplicate viewer/wiring and retain only an upstream AssetViewer accessibility/ownership delta. Re-test sparse assets and the newly available swipe path. |
| K13 stream parser | OpenAI still decodes an accumulated buffer with `toString().split('\n')`; Google still creates a decoder per chunk and accepts only one-line `data: `. | Keep K13's pure replayable parser and adapt both changed request hosts. Request-log metadata is not an SSE framing fix. |
| K14 render stability | Upstream adds optional balanced/strong display coalescing, active-message mount reuse, raw strong-mode rendering, and edit/translation suppression. | Reuse upstream rendering and retain only missing K14 guarantees: live-generation validation, stable lifecycle identity, per-message reload suppression, reactive message/generation metadata, and bg-owner composition. Do not copy a second renderer. |
| K16 navigation/hotkeys | Upstream fixes adjacent-character bounds, model-preset shortcut handling, and a generic unload guard. | Keep the remaining master switch, Meta matching, pointer cleanup, modal/control gesture guards, and opt-in same-page mobile Back behavior; rebase changed hotkey hosts. |
| K15 partial edit | Upstream merely suppresses its existing per-message partial editor during optimized streaming. | Keep the shared manager, exact target/DOM identity, stale cancellation, and translation-cache token/CAS guards; adapt to upstream's render lifecycle. |
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

Until that table is implemented and tested, `bg-preserve`, `lazy-chat-sync`,
and their adapter are blocked from 1.9 qualification. The catalog's existing
whole-pipeline bg ownership is not silently transferred to native model jobs.

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

## Review method and limitations

The official changed-path set and manifest intersections were checked
exhaustively. Collaborating agents were used only for bounded read-only
lookups. Their strict-schema results were rechecked against source: Kei
anchors/symbol absence, all existing-pack path counts, generation/storage
hotspots, and request-log/usage mechanisms. No agent edited files.

This audit does not claim runtime correctness, build success, mobile behavior,
or exact revert on 1.9.0. Those are later measured gates. It also does not
infer that a structurally successful plan is semantically compatible.
