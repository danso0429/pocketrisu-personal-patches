# PocketRisu 1.9 / Kei integration session handoff

> **Handoff date:** 2026-08-01 KST
>
> **Next patcher branch:** `codex/pocketrisu-1.9-rebase`
>
> **Exact target:** official PocketRisu `v1.9.0` /
> `85a65f3137b45c8de4a8d21a9887be213b1ac3fc`
>
> **Immediate next feature:** adapt K14 streaming render stability to native
> 1.9 rendering. The BG/lazy owner graph, K19 native AssetViewer delta, and
> K13 robust SSE parser are qualified; K12 remains last.

This document records the complete local work boundary from the beginning of
the Kei selection effort through the 1.9 pivot and live-update preparation.
It is a handoff, not a declaration that the aggregate patcher, Kei pack, or
live installation is qualified for PocketRisu 1.9.

## Non-negotiable target and review boundary

- PocketRisu 1.9.0 is the new base. Patcher packs may add only outcomes that
  are absent from, or deliberately different from, official 1.9.0. The 1.8.1
  source must not become the base of the 1.9 candidate.
- Preserve every existing pack's ownership and preservation contract unless
  the catalog authority explicitly changes it. Anchor success alone is not a
  semantic ownership decision.
- Keep implementation commits separated by feature or infrastructure
  concern. Do not combine a target upgrade, an ownership redesign, and a Kei
  child in one commit.
- Do not push, tag, release, apply a candidate live, or restart PocketRisu
  before review and the applicable gates.
- For every changed pack, retain observed evidence for first apply, current
  status, zero-change reapply, relevant combinations, and exact byte/mode/
  symlink revert.
- The raw-selection patch-combination verifier and L2.5 runtime audit are
  separate gates. Follow
  `docs/patch-combination-verification-instructions.md` for the former and do
  not claim that either gate substitutes for the other.
- Do not hardcode today's pack, graph, unit, or path counts as a success
  condition. Compare the verifier's discovered and verified domains.

## Work completed before the 1.9 pivot

The original planning authority is
`docs/POCKETRISU-KEI-INTEGRATION-CATALOG.md`. Work proceeded as child packs so
that each behavior, owner, receipt, and revert boundary remained reviewable.

| Commit | Work | Recorded boundary |
| --- | --- | --- |
| `a1c23d5` | Empty `pocketrisu-kei` meta-pack and resolver/catalog foundation | No Kei behavior was implied by the umbrella alone. |
| `2436606` | K19 fullscreen image viewer | Focused 1.8.1 candidate; iPhone/review gate remained. |
| `85cfb43` | Exhaustive combination-verifier optimization | Infrastructure-only detour; cached and uncached plans were differentially checked rather than reducing the raw mask domain. |
| `6ffed92` | K13 robust OpenAI/Google SSE parsing | Pure replayable parsing plus base/composed adapters. |
| `ee91f24` | K14 streamed-chat render stability | Existing rendering and bg owners were preserved; no second generation owner was added. |
| `038df10` | K16 navigation, hotkeys, pointer gestures, and opt-in mobile Back guard | Feature-local settings and cleanup boundaries. |
| `f79c00f` | K15 shared partial-message editing | Exact message/DOM/translation-cache identity and stale-write guards. |
| `5090a81` | K11 HypaMemory manual tools | Contiguous-prefix selection, exact frontier checks, explicit apply, and existing summary/bg owners. |
| `081a32b` | Status advanced to K12 | Last committed boundary shared by the two worktrees. |

The feature commits have matching validation documents. Their tests, builds,
L2.5 surfaces, raw-selection gates, and exact-revert receipts are observations
against PocketRisu 1.8.1 only. They are evidence for the rebase, not 1.9
qualification and not publication approval.

At the last committed 1.8.1 boundary, the observed full combination gate was
2,048/2,048 raw selections, 1,024 normalized graphs, 189 managed paths, a
maximum of 425 units, and a passing round trip. Those are historical observed
values, not constants for later verification.

### Preserved staged K12 work

`codex/pocketrisu-kei-integration` remains at `081a32b`. Its index contains
the complete uncommitted K12 translation-tools candidate and has no unstaged
changes. It includes the translation core, base/bg adapters, complete cache
identity and CAS handling, cancellation, import/export and cleanup tools,
focused tests, validation notes, catalog wiring, and generated installers.

Do not reset, unstage, amend, rebase, or clean that worktree. It is the
1.8.1 evidence source. K12 is ported only after the 1.9 owner graph is ready;
its bytes must not be merged wholesale into the 1.9 branch.

## Why the work pivoted to PocketRisu 1.9

Official 1.9.0 arrived during K12. The complete official comparison contains
64 commits, 297 changed paths, 22,962 insertions, and 1,336 deletions. It adds
or changes native model jobs and recovery, request logs and usage, streaming
rendering, presets, backups, settings search, and the asset viewer. Those
changes intersect both existing patch packs and Kei behavior.

The detailed path and semantic audit is
`docs/POCKETRISU-1.9-REBASE-AUDIT.md`. Its key decisions are:

- native model-job replay is not equivalent to the existing ax → main →
  post-processing `bg-preserve` owner;
- K19 and K14 must reuse upstream UI/rendering and retain only missing deltas;
- K13, K16, K15, K11, and K12 still have non-upstream outcomes, but their
  changed hosts must be adapted;
- K12 must drop the now-duplicate original-text persistent-cache key fix;
- request logs are bounded in 1.9, correcting the old "unbounded body log"
  description, but default-on content logging still conflicts with K27;
- usage rows remain unbounded and unpaginated, so K28 remains unresolved.

## 1.9 branch work completed

The separate `codex/pocketrisu-1.9-rebase` branch started at `081a32b` without
the staged K12 bytes.

| Commit | Result |
| --- | --- |
| `4e9b966` | Recorded the exact official overlap, semantic conflicts, generation-authority boundary, policy correction, and ordered rebase plan. |
| `b815d51` | Added the review-only exact-target compatibility boundary. Exact 1.9.0 is `reviewing`: ordinary application rejects it, a private maintainer qualifier can inspect it, and unlisted versions such as 1.9.1 remain rejected. |
| `270547f` | Qualified `toolchain-hardening` for exact 1.9.0 with isolated apply/reapply/revert evidence. |
| `ae70364` | Qualified `startup-cache` for exact 1.9.0 as a cache-only delta, including focused and combined evidence. |
| `88ddfe5` | Qualified `parser-hardening` for exact 1.9.0, including unchanged upstream parser defects, focused parsing tests, toolchain composition, and exact round trips. |
| `532547c` | Qualified `character-organizer` while preserving native 1.9 drag/file-drop and AssetViewer behavior. |
| `3406325` | Added exact-target-scoped units and stale-target preconditions, with exhaustive exact-1.8 combination evidence. |
| `eca26f0` | Added the 1.9-only native Settings Search adapter for `personal-settings` while preserving its 1.8 graph. |

The exact commit sequence through the current branch HEAD remains authoritative
in `git log`; do not resume from the historical `88ddfe5` boundary. The
conditional `bg-preserve-storage-base` adapter was subsequently qualified as
an asset-only 1.9 delta while its parent remained reviewing. Patcher tests
observed after that qualification were 29/29. Exact 1.9 remains `reviewing`,
not globally `verified`; later packs remain under review.

The generated `dist/` installers were last rebuilt in `b815d51`. They do not
yet contain the later source-manifest qualifications, target-scoped manager,
or 1.9 adapters. Do not use or publish the current generated installers as a
HEAD-equivalent 1.9 artifact. Rebuild them reproducibly and record
deterministic hashes before any installer or delivery claim.

## Live-installation operation performed in this session

This operational work is separate from the candidate branches.

1. The live 1.8.1 patch graph was inspected as the `all` preset: 10 resolved
   packs, 305 units, and 152 managed paths, all current at that observation.
2. The patcher's normal revert operation changed all 152 managed paths.
   Comparison with the saved pre-revert state found 54 baseline files at the
   expected hashes, 98 owned files absent, and zero mismatches. Patch state
   was removed and the format-2 intent now requests an empty custom pack set.
3. An exact official 1.9.0 staging installation was prepared independently.
   Frozen dependency installation completed; the initial prebuilt
   `msgpackr-extract` path did not support the active Node 25 environment, but
   its local native build completed and the install exited successfully.
4. On that staging tree, server tests observed 4 files / 99 tests passing,
   the check observed 0 errors and 4 upstream warnings in one file, and the
   production build completed after 7,793 modules. The build also emitted
   nine existing Lightning CSS `::highlight` warnings plus chunk/dynamic
   import warnings. Production dependencies were pruned and load-checked.
5. The full pristine frontend suite was not rerun as a successful gate on the
   final staging tree. An earlier exact-1.9 baseline run observed 83 failures
   caused by Node 25 exposing a present-but-incomplete `localStorage`; the
   qualified toolchain pack addresses that test-environment defect. Do not
   rewrite this as a pristine frontend pass.

### Interrupted cutover and recovery

An attempted directory cutover and PM2 restart were submitted together while
the old process was still running. The restart was rejected because explicit
restart approval had not been obtained. The directory cutover was rolled
back, but the still-running process created a new `save/` directory during
the rename window, and the original save directory was briefly observed as
`save/save`.

The original database was identified by its unchanged inode and moved back by
exact rename. The race-created save directory was quarantined; it contained
only new empty/log database files. Observations immediately after that
recovery were:

- source package and `.installed-version`: 1.8.1;
- patch state absent and empty custom intent present;
- no nested `save/save` directory;
- original database inode and backup directory preserved;
- SQLite `quick_check`: `ok`;
- `kv` row count: 10,878;
- no rows for `bg-orch-state-op`, `bg-orch-result-op`, or `bg-sub-result`;
- PM2 online with active requests 0 and process-reported version 1.8.1;
- no restart was performed.

At that intermediate boundary, the PM2 process predated the source revert and
had not loaded the reverted source. The runtime was therefore the previously
loaded patched 1.8.1 process while the on-disk source was reverted 1.8.1.

### Authorized exact-1.9 base cutover

The user then explicitly authorized the 1.9 base update and its PocketRisu
restart in this session, while keeping all patcher and Kei adaptation in a
different session.

The second cutover used the following observed sequence:

1. Rechecked active requests 0, durable BG rows 0, SQLite `quick_check: ok`,
   the preserved database inode, and absence of a nested save directory.
2. Compared every tracked staging file against the exact official
   `v1.9.0` checkout; the work-tree comparison reported no differences.
3. Verified the actual `msgpackr` pack/unpack path with native acceleration,
   `better-sqlite3`, and the production dependency graph. A direct
   `require('msgpackr-extract')` is not the package's application entry point
   after pruning and was not used as a false failure.
4. Stopped PM2 before any rename, moved the old application tree to a
   recoverable rollback location, moved exact 1.9 into the live path, and
   moved the original `save/` and `backups/` directories into it by rename.
5. Restarted PM2 and observed process version 1.9.0, PID `2963365`, unstable
   restarts 0, and active requests 0.
6. Observed root HTTP 200 and the main asset HTTP 200. The served main asset
   was byte-identical to the local build with SHA-256
   `c924e511a40d444c5631cdf85ee1013acdf17927a435c367678e08becf2db153`.
7. Rechecked the live source against exact tag
   `85a65f3137b45c8de4a8d21a9887be213b1ac3fc`: tracked differences 0.
   The PM2 error log size and mtime did not increase; the output-log delta
   contained the expected old-process SIGINT flush, new HTTP-server startup,
   and local smoke connections.
8. Rechecked the original database and backup directory after restart. Their
   inodes were unchanged, `quick_check` remained `ok`, the KV count remained
   10,878, durable BG rows remained 0, and no nested save directory appeared.

The current live base is therefore pristine official PocketRisu 1.9.0 with
no patcher candidate applied. Patch state is absent and the preserved intent
still requests an empty custom pack set. The old 1.8.1 application source is
retained as a local rollback tree without `save/` or `backups/`; user data
remains only in the live 1.9 tree.

The staging tree was consumed by the successful live rename. The rollback and
recovery snapshots are disposable local artifacts, not repository evidence.
They may disappear between sessions; reconstruct source from exact tags rather
than a floating branch if needed.

## Exact patcher resume point

Start at the `codex/pocketrisu-1.9-rebase` branch HEAD containing this handoff
and the feature-local qualification receipts. First re-read this handoff, the
integration status, the 1.9 audit, the catalog, and the combination-verification
instructions. Confirm all worktree heads and the preserved staged K12 index
before editing anything.

The exact-1.9 target boundary, `toolchain-hardening`, `startup-cache`,
`parser-hardening`, `character-organizer`, and the version-aware
`personal-settings` Search adaptation are locally qualified. The conditional
asset-only `bg-preserve-storage-base` adapter and its parent `bg-preserve`
graph are qualified with one owner per request class and no browser setting
override. `persona-organizer` is qualified with a
target-scoped 1.9 server asset walker that preserves native embedded-module
and settings-only export semantics. `lazy-chat-sync` and its dependent
`character-import-ux` graph are now qualified with target-scoped full
replacements, native 1.9 recovery/logging/lock/backup preservation, combined
target gates, ordinary exact round trip, L2.5, and the exhaustive exact-1.8
gate. Resume owner integration in this order:

1. Retain the qualified request-class table and combined BG/lazy adapter graph
   without weakening result/claim/ACK, cancellation, hydration, or
   no-resurrection contracts.
2. Rebase K19, K13, K14, K16, K15, and K11 as separate focused commits. Remove
   only behavior proven equivalent in official 1.9; preserve missing outcomes
   and each existing owner contract.
3. Port the preserved staged K12 last. Remove the duplicate cache-key fix,
   adapt its four changed runtime anchors, and repeat identity/CAS/cancel/
   import/export/cleanup gates.
4. Re-evaluate future and policy rows, including unresolved K27/K28, only
   after the owner graph is usable.

For every numbered implementation, keep a feature-local receipt and commit.
Run target-focused tests and exact round trips before advancing; run L2.5 for
runtime effects; and run the complete raw-selection combination gate before
any aggregate `verified` declaration. A consolidated future iPhone L3 session
still records each child's concrete scenario separately.

## Live candidate boundary after the base cutover

The official 1.9 base cutover is complete; do not repeat it merely because
patcher work resumes. Applying a requalified pack graph to this live base is a
separate explicit-authorization boundary. Recheck active requests and durable
BG work before any future apply/restart and keep `save/` and `backups/`
outside source replacement. Never directory-swap the installation while its
process can recreate paths.

## Files to preserve

- `codex/pocketrisu-kei-integration`: staged K12 evidence; no cleanup or
  in-place rebase.
- `codex/pocketrisu-1.9-rebase`: continuation branch containing this handoff
  and feature-local 1.9 qualification receipts.
- The original main checkout: it remains at the pre-integration release and
  contains an untracked catalog copy. Do not absorb, overwrite, or delete it
  as incidental cleanup.

No branch in this handoff has been pushed, tagged, released, or applied as a
1.9 patch candidate. No iPhone L3 has been performed for the aggregate.
