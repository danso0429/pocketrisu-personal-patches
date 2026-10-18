# Architecture and Maintainability Analysis (2026-10-18)

This record is an evidence-based review of the patcher engine, the patch
manifests, the test and CI layout, and the documentation of this repository.
Its goal is to identify problems that demonstrably make existing behavior
difficult to understand, verify, modify, or maintain. It is not a list of
generic best practices, and it does not change any application code.

Each finding states the exact files and lines, the current behavior, the
concrete consequence, what was verified and what remains a hypothesis, whether
the current design is a reasonable choice, and a recommendation with its
tradeoffs. Items that were investigated and judged acceptable are listed
separately so that the review is not read as a list of everything that could
be changed.

## Contents

1. [Scope and method](#1-scope-and-method)
2. [Architecture and execution flow](#2-architecture-and-execution-flow)
3. [Summary of findings](#3-summary-of-findings)
4. [Findings](#4-findings)
   - [F1. Layered patches hide the real content of the most-changed files](#f1-layered-patches-hide-the-real-content-of-the-most-changed-files)
   - [F2. Whole-file replacements pin large upstream files verbatim](#f2-whole-file-replacements-pin-large-upstream-files-verbatim)
   - [F3. The documented `allDefault: false` admission gate does not exist in code](#f3-the-documented-alldefault-false-admission-gate-does-not-exist-in-code)
   - [F4. Pack-level metadata diverges from unit-level reality; selection remnants stay on the main path](#f4-pack-level-metadata-diverges-from-unit-level-reality-selection-remnants-stay-on-the-main-path)
   - [F5. A version string does not identify one delivered build](#f5-a-version-string-does-not-identify-one-delivered-build)
   - [F6. Plugin-host verification lives outside CI](#f6-plugin-host-verification-lives-outside-ci)
   - [F7. Marker-induced ASI hazards are guarded only by a manual audit](#f7-marker-induced-asi-hazards-are-guarded-only-by-a-manual-audit)
   - [F8. Path-safety and atomic-write helpers are duplicated five times](#f8-path-safety-and-atomic-write-helpers-are-duplicated-five-times)
5. [Investigated and judged acceptable](#5-investigated-and-judged-acceptable)
6. [Recommended order of work](#6-recommended-order-of-work)
7. [Uncertainties and open questions](#7-uncertainties-and-open-questions)
8. [Appendix A: reproduction scripts](#appendix-a-reproduction-scripts)
9. [Appendix B: raw measurements](#appendix-b-raw-measurements)

## 1. Scope and method

### Repositories

- `pocketrisu-personal-patches` (this repository) is the subject of the
  review. The analysis was performed at commit `32c80e8`. The only later commit
  on `main` before this record (`3242c30`) changes one file under
  `docs/records/` and does not affect any finding.
- `patch-verification-governance` was surveyed for its relationship to this
  repository. It contains governance documents only; see
  [section 7](#7-uncertainties-and-open-questions).

The local clone was shallow (50 commits). Statements about history are limited
to that window.

### What was executed

All execution happened in a disposable scratch directory. No file in this
repository or in a live PocketRisu installation was modified by the analysis.

| Check | Result |
|---|---|
| `npm test` (Node 22.22.0) | 341 passed, 0 failed, 3 intentional skips, about 6 s |
| `dist/pocketrisu-patcher.cjs` freshness | A fresh `build()` output is byte-identical to the committed file (8,596,811 bytes) |
| Pristine upstream | `PocketRisu/PocketRisu` tag `v1.10.0`, shallow clone |
| `plan --json` on pristine upstream | `verified`, 529 changed files, 1,783 units in order, 9 inferred collisions, 3.9 s |
| `apply --json` | Success, 4.2 s; `state.json` is 9,280,718 bytes |
| `status --json` | `current`, 527 managed files, 0.4 s |
| `revert --json` | Every file byte-identical to pristine upstream; only empty directories remain (`src/ts/pagefold`, `src/ts/personalSettings`, `src/ts/usage`, `src/ts/vendor`, `src/lib/Setting/Pages/PersonalSettings`) |
| Upgrade path | Apply with the `0.2.4-experimental.46` installer (from commit `17cfa97`), then apply the current installer. Result is byte-identical, including `state.json`, to a fresh current apply on pristine upstream |
| Single root pack plans | Each user-selectable root pack planned alone against pristine upstream. 15 of 16 succeed; `personal-settings` fails (see F4) |
| Plugin probes | `pnpm install --frozen-lockfile` on the patched tree, then each `scripts/probe-bg-*.cjs` run against it (see F6) |
| Composition analysis | The complete graph replayed unit by unit to measure which anchors exist only in text produced by earlier units (see F1) |

The scripts used for the measurements are reproduced in
[Appendix A](#appendix-a-reproduction-scripts).

### What was not executed

- The full patched PocketRisu suite (`pnpm test`, `pnpm test:compat`,
  `pnpm check`, `pnpm build`, and the BG bundle build). The CI workflow runs
  these on every push and pull request; their current CI status was not
  checked.
- Device or browser scenarios.
- Probes that require external fixtures, such as original plugin sources or
  MARP inputs, that are not in the repository.

## 2. Architecture and execution flow

### Components

| Module | Lines | Responsibility |
|---|---|---|
| `src/cli.cjs` | 742 | Argument parsing, command dispatch, failure reporting |
| `src/manager.cjs` | 955 | State, intent, lock, journal, transition planning and application, status |
| `src/compose.cjs` | 396 | Unit application and revert, pairwise collision analysis, ordering, composition |
| `src/resolver.cjs` | 249 | Pack graph resolution: `requires`, `autoWhen`, `supersedes`, `conflicts` |
| `src/catalog.cjs` | 138 | Explicit pack registration, the single `all` profile, retired-state adoption |
| `src/compatibility.cjs` | 116 | Exact target-version qualification gate |
| `src/staging.cjs` | 438 | Isolated candidate staging, qualification checks, receipts |
| `src/report.cjs` | 500 | Conflict report construction and Markdown/JSON writing |
| `src/risu-report.cjs` | 840 | Delivery of a conflict report into the RisuAI database through the local server |
| `src/update-feed.cjs`, `src/update-channel.cjs` | 379 + 13 | Notification-only update feed (currently disabled) |
| `scripts/build-installers.cjs` | 78 | Bundles the engine and `JSON.stringify(catalog)` into one distributed file |

### Execution flow

```
cli.cjs runCli()
├─ list                  print the catalog
├─ report                load the latest report; optionally deliver it into RisuAI
├─ stage                 lock the candidate root
│    assertStagingBoundary / assertFreshCandidate
│    resolveSelection → planTransition → compatibility gate → applyTransition
│    runQualificationChecks (pnpm test/check/build, BG bundle build)
│    assertPostCheckIntegrity → staging receipt
└─ plan | apply | revert | status
     withRootLock(root)
       restoreJournal (recover an interrupted transaction first)
       resolveOperationIntent  → always the 'all' profile (revert: empty custom intent)
       resolver.resolveSelection → 43 packs
       manager.planTransition
         loadState → stripCurrentUnits (remove previously applied blocks using
                     the unit snapshots stored in state.json)
         compose.buildPlan
           declared edges: requires / before / after
           pairwise analysis of unordered units in the same file
           topological sort, then applyUnit in order
         changes + preconditions + next state + next intent
       compatibility.assertTargetVerified
       manager.applyTransition
         validate preconditions → write journal (originals, base64)
         atomic writes → remove journal; on failure restore from journal
```

### Catalog and manifests

- 43 packs: 16 user-selectable roots and 27 internal adapters
  (`userSelectable: false`).
- 1,783 units in 527 files, about 6 MB of unit text.
- Unit kinds: `owned` (the whole file belongs to the pack), `replace`
  (an anchor replaced by managed text), and `insert` (managed text inserted
  before or after an anchor).
- All 1,783 units are either unscoped (303) or scoped to
  `{ pocketrisu: ['1.10.0'] }` (1,480). The only declared target is `1.10.0`.
- Manifests are executable CommonJS modules. Several build their unit lists at
  load time by reading payload files, requiring other packs' manifests, and
  rewriting text (details in F1).

### Distribution and CI

`scripts/build-installers.cjs:14-61` embeds the engine sources and the
serialized catalog into `dist/pocketrisu-patcher.cjs`. CI
(`.github/workflows/ci.yml`) runs `npm test`, rebuilds twice and compares the
bytes, applies the complete set to PocketRisu `v1.10.0`, runs the embedded
PocketRisu checks, reverts, and requires a clean `git diff`.

## 3. Summary of findings

| ID | Priority | Finding | Fix cost |
|---|---|---|---|
| F1 | High | Layered patches hide the real content of the most-changed files | Medium (incremental) |
| F2 | Medium-high | Whole-file replacements pin 692 KB of upstream verbatim | Medium, best done at the next upstream upgrade |
| F3 | Medium | The documented `allDefault: false` admission gate does not exist in code | Low |
| F4 | Medium | Pack-level metadata diverges from unit-level reality; selection remnants stay on the main CLI path | Low to medium |
| F5 | Medium-low | A version string does not identify one delivered build | Low |
| F6 | Medium-low | Plugin-host verification lives outside CI | Low (portable probes), unknown (sandbox) |
| F7 | Low | Marker-induced ASI hazards are guarded only by a manual audit | Low |
| F8 | Low | Path-safety and atomic-write helpers are duplicated five times | Low to medium |

The engine (`src/`) itself is sound. Its transaction, lock, precondition,
revert and upgrade behavior was verified end to end, and its synthetic tests
are behavior-focused. The structural problems concentrate in the manifest
layer above the engine, in the tests of that layer, and in documentation that
has drifted from the code.

## 4. Findings

### F1. Layered patches hide the real content of the most-changed files

**Priority: high.** It affects the files that change most often, and it gets
worse with every change made in the current style.

#### Current behavior

The two BG orchestration files are owned by `bg-preserve`, yet their final
content is produced in three layers:

1. The base text in `patches/bg-preserve.json`, imported from the upstream
   bg-preserve project.
2. Load-time rewrites in `patches/bg-preserve/manifest.cjs`. That file defines
   `replaceExact` (line 16) and calls it 52 times. Examples are `adaptOwned`
   (lines 24-49), `adaptBgRequestLogging190` (lines 66 onward) and
   `adaptBgRetention190`. These rewrites run in plain JavaScript at catalog
   load time, outside the composition engine, and fail with an untyped
   `Error` rather than a unit-level conflict report.
3. Anchor units from other packs applied on top:

| File | Owner | Anchor units applied on top |
|---|---|---|
| `src/ts/bgOrchestrate.ts` | `bg-preserve` | `lazy-chat-bg-adapter` 184, `client-build-fence-bg-adapter` 2 |
| `server/node/bgOrchestrator.cjs` | `bg-preserve` | `lazy-chat-bg-adapter` 132, `pagefold-bg-adapter` 3 |
| `src/ts/bgStreamPreserve.svelte.ts` | `bg-preserve` | `lazy-chat-bg-adapter` 11, `client-build-fence-bg-adapter` 2 |

In total, 19 repository-owned files receive 373 anchor units afterward.

Replaying the complete graph in its composed order shows the extent of the
layering:

- 1,386 non-owned units exist. **233** of them use an anchor that does not
  exist in the pristine upstream file or in the original owned content. These
  anchors exist only in text produced by earlier units.
- Of those 233, **208** depend on their producer only through ordering
  (`after`) rather than an explicit `requires`.
- 65 of these layered dependencies cross pack boundaries.

| Files with the most layered units | Units | Layered |
|---|---|---|
| `src/ts/bgOrchestrate.ts` | 186 | 68 |
| `server/node/bgOrchestrator.cjs` | 135 | 49 |
| `src/lib/ChatScreens/DefaultChatScreen.svelte` | 88 | 27 |
| `server/node/server.cjs` | 75 | 18 |
| `src/ts/globalApi.svelte.ts` | 50 | 17 |
| `src/ts/storage/nodeStorage.ts` | 35 | 14 |

| Units whose output is the anchor source for the most later units | Dependents |
|---|---|
| `lazy-chat-bg-adapter:server-commit-client-hydration:1.10` | 39 |
| `lazy-chat-sync:replace:src:ts:storage:nodeStorage-ts:1.10` | 11 |
| `lazy-chat-sync:replace:server:node:server-cjs:1.10` | 8 |
| `lazy-chat-sync:replace:src:ts:globalApi-svelte-ts:1.10` | 8 |
| `lazy-chat-bg-adapter:server-input-transform:1.10` | 7 |

The most extreme case is
`lazy-chat-bg-adapter:server-commit-client-hydration:1.10`
(`patches/lazy-chat-bg-adapter/manifest.cjs:1070`). It inserts a 21,765-character
block into `bgOrchestrate.ts`, and 39 later units of the same pack rewrite
pieces of that block instead of the block being edited.

Ordering is expressed by hand-maintained lists that declare a unit to come
"after every earlier unit on the same file" in a set of related packs:

- `patches/lazy-chat-bg-adapter/notification-units.cjs:7-13`
- `patches/lazy-chat-bg-adapter/recovery-read-units.cjs:4-13`
- `patches/lazy-chat-bg-adapter/manifest.cjs:4100-4109` (`queueUiOwners`)
- `patches/usage-cost-estimate/manifest.cjs:15-22`

Across the catalog, 803 units declare a total of **29,824** `after` edges. By
contrast, the engine inferred only **9** orderings in the real plan.

The reason is visible in the engine. `analyzePair` (`src/compose.cjs:217-240`)
dry-runs a pair of unordered same-file units against the reconstructed
**baseline**. A unit whose anchor exists only after another unit fails in both
orders when it is paired with any third, unrelated unit. That pair is reported
as `INCOMPATIBLE_UNITS` (`src/compose.cjs:341-346`). Declaring a path between
the units skips the analysis (`src/compose.cjs:331-333`). The wholesale `after`
lists are therefore a workaround for the pairwise analysis rather than
semantic ordering. `docs/POCKETRISU-G1-7-PDF-PROXY-VALIDATION.md:13` records the
same observation: "Initial pairwise plan failures reflected child anchors
absent from the unpatched baseline."

Seven `after` references name units that no longer exist (for example
`lazy-chat-sync:replace:src:ts:globalApi-svelte-ts` and its `:1.9` variant,
referenced from `lazy-chat-bg-adapter:global-import`,
`:durable-flush`, `:asset-upload-retry-import` and
`:browser-stat-effect-rebase:1.10`). `buildPlan` silently ignores unknown
`after` and `before` IDs (`src/compose.cjs:317-322`). That is intentional for
units of unselected packs, but it also hides stale references.

#### Why this is a problem

- **Readability.** The final text of `bgOrchestrate.ts` and
  `bgOrchestrator.cjs` exists nowhere in the repository. Reviewing a change or
  reading the current behavior of a function requires running the composer.
- **Tests verify intermediate layers.** For example,
  `test/lazy-chat-sync.test.cjs:26-60` asserts regular expressions on
  `patches/lazy-chat-sync/files-1.10/src/ts/globalApi.svelte.ts`, while the
  delivered `globalApi.svelte.ts` contains 49 more units from other packs. A
  later unit that removes or rewrites an asserted line would not fail these
  tests. Of the 54 test files, most pack tests are regex or substring checks on
  payload files (for example `personal-settings.test.cjs` has 142 such
  assertions and `persona-ui.test.cjs` 173). The behavior of the composed
  application is verified only by the PocketRisu suite that CI runs after
  `apply`.
- **The style reinforces itself.** Editing the 21,765-character hydration
  block can invalidate the anchors of up to 39 later units. Adding one more
  replace unit is locally cheaper, so the layer count grows with each fix.

#### Change scenario

A bug is found in the client hydration path of `bgOrchestrate.ts`. To locate
the current code, the maintainer must compose the file, find which of 186
units produced the relevant lines, and decide whether to edit that unit, and
risk up to 39 dependent anchors, or to add another layer. Either way, the
existing payload tests continue to examine a version of the code that is not
the one delivered.

#### Is the current design reasonable?

Partly. The anchor-and-owner model is a sound way to patch upstream files. The
layering of the repository's **own** files is not required by the engine:

- `stripCurrentUnits` (`src/manager.cjs:559-571`) removes previously applied
  blocks using the unit snapshots stored in `state.json`, so a unit whose text
  is edited in place is reverted correctly on upgrade.
- An actual upgrade from `0.2.4-experimental.46` to the current build produced
  a tree and `state.json` byte-identical to a fresh apply.

Editing units in place is therefore supported. Whether an unwritten process
rule (for example, never editing an admitted unit) motivates the append-only
style could not be determined; see section 7.

#### Recommendations

1. **Low risk, do first: make the composed result readable and testable.**
   Add a source-only command such as `npm run materialize -- --root <pristine>`
   that writes the composed files into an ignored directory. Move the key
   content assertions of the pack tests to the composed output. CI already has
   a patched tree, so a CI step can run those composed-output assertions.
2. **Structural: fold layers into repository-owned files.** For files the
   repository owns, merge the subsequent repository units into the owned
   content one file at a time, starting with `bgOrchestrate.ts`. The safety net
   is mechanical: the composed output on pristine `v1.10.0` must be
   byte-identical before and after the fold.
3. **Add an upgrade-path CI step.** Apply the previous release's installer,
   apply the current installer, and compare with a fresh current apply. The
   check performed during this review takes about 10 seconds and would protect
   any restructuring.
4. Optionally, make unknown IDs in `after` and `before` a warning when they
   match neither a catalog unit nor a retired ID, to surface stale references.

#### Tradeoffs and regression risks

- Folding loses per-line attribution to the contributing pack. The
  crosswalk and records reference commits rather than unit IDs, so
  documentation links are not affected (`docs/BG-G1-INTEGRATION-CROSSWALK.md`
  contains no `lazy-chat-bg-adapter:` unit IDs).
- Focused-subset compositions that rely on pack boundaries
  (`test/kei-mobile-navigation.test.cjs:48-56`,
  `test/charx-archive-integrity.test.cjs:71`) need review.
- Pack ETags change, so existing installations take the upgrade path, which
  was verified to work and which recommendation 3 would keep under test.

### F2. Whole-file replacements pin large upstream files verbatim

**Priority: medium-high.** The cost is realized at the next upstream upgrade.

#### Current behavior

Fourteen `replace` units use an entire pristine upstream file as their anchor.
Together they pin **691,943 bytes** of upstream source verbatim:

| Pack | File | Upstream bytes | Managed bytes |
|---|---|---|---|
| `lazy-chat-sync` | `server/node/server.cjs` | 263,682 | 280,410 |
| `lazy-chat-sync` | `src/ts/globalApi.svelte.ts` | 102,565 | 121,692 |
| `character-import-ux` | `src/ts/characterCards.ts` | 67,651 | 71,776 |
| `lazy-chat-sync` | `src/ts/plugins/apiV3/v3.svelte.ts` | 60,882 | 66,474 |
| `lazy-chat-sync` | `src/ts/storage/risuSavePatcher.test.ts` | 53,768 | 80,640 |
| `lazy-chat-sync` | `src/ts/storage/risuSave.ts` | 53,517 | 59,584 |
| `lazy-chat-sync` | `src/ts/storage/nodeStorage.ts` | 33,403 | 67,391 |
| `lazy-chat-sync` | `src/ts/bootstrap.ts` | 24,567 | 27,563 |
| `lazy-chat-sync` | `src/ts/storage/chatStorage.test.ts` | 9,334 | 16,999 |
| `persona-organizer` | `src/lib/Setting/Pages/PersonaSettings.svelte` | 8,777 | 62,039 |
| `lazy-chat-sync` | `src/ts/storage/chatStorage.ts` | 7,722 | 11,152 |
| `lazy-chat-sync` | `src/ts/storage/autoStorage.ts` | 4,006 | 4,649 |
| `persona-organizer` | `src/lib/Setting/listedPersona.svelte` | 1,898 | 7,190 |
| `toolchain-hardening` | `vitest.setup.ts` | 171 | 632 |

The actual differences are much smaller than the pinned text:

| File | Upstream lines | Diff hunks | Changed lines |
|---|---|---|---|
| `server/node/server.cjs` | 6,584 | 86 | 671 |
| `src/ts/globalApi.svelte.ts` | 2,832 | 48 | 546 |
| `src/ts/storage/nodeStorage.ts` | 840 | 26 | 862 |
| `src/ts/storage/risuSave.ts` | 1,244 | 46 | 380 |
| `src/ts/plugins/apiV3/v3.svelte.ts` | 1,563 | 15 | 219 |
| `src/ts/bootstrap.ts` | 616 | 8 | 73 |

Other units anchor into the replacement text. `server/node/server.cjs`
carries 75 units from 9 packs, `globalApi.svelte.ts` 50 units from 7 packs,
`nodeStorage.ts` 35 units from 6 packs, and `characterCards.ts` 19 units from
3 packs.

Unit naming also obscures target scope. 307 unit IDs end in `:1.9`, yet every
one of them is active only on `1.10.0`, the only declared target. Examples are
`bg-preserve:hook:globalapi-fetch-impl-register:1.9`,
`client-build-fence:server-helper:1.9` and
`bg-preserve:hook:server-cjs-register-routes:1.9`.

#### Why this is a problem

A whole-file anchor fails on any upstream byte change anywhere in the file.
For `server.cjs`, roughly 90% of the pinned text is code the patch does not
change, yet a change to any of it blocks the upgrade.

#### Change scenario

PocketRisu 1.11 changes one route in `server.cjs`. `stage` refuses the
candidate, which is correct fail-closed behavior. The maintainer must then
three-way merge the 263 KB replacement by hand and re-anchor the 74 other
units on that file, many of which anchor into the replacement rather than into
upstream.

#### Is the current design reasonable?

It is a documented, deliberate choice. README "Adding or updating a patch
pack", step 1, says to store large exact replacement baselines under
`anchors/`. It maximizes exactness at the cost of upgrade effort. That
tradeoff is defensible while a single upstream version is supported, which is
the current situation.

#### Recommendations

- At the **next upstream upgrade**, not before, convert each whole-file
  replacement into hunk-level units derived mechanically from
  `diff anchors-1.10/<file> files-1.10/<file>`. Each hunk becomes a unit whose
  anchor is the changed region plus enough unique context.
- Consider dropping the stale `:1.9` suffix when units are next re-anchored.
  Renaming is not worth doing on its own, because IDs are referenced from many
  `requires` and `after` lists.

#### Tradeoffs and regression risks

- The number of units grows; `server.cjs` alone would gain about 86.
- Hunk anchors must be unique. `ANCHOR_COUNT` enforces this at plan time.
- Unchanged upstream regions no longer block upgrades, and failures point at
  specific lines through the existing `closestWindow` evidence in the conflict
  report (`src/report.cjs:148`).

### F3. The documented `allDefault: false` admission gate does not exist in code

**Priority: medium. Fix cost: low.**

#### Current behavior

The documentation describes a pre-admission state:

- `README.md:1263-1266`: "A root pack with `allDefault !== false` enters the
  complete set. Use `allDefault: false` only while a maintainer is qualifying a
  not-yet-admitted pack; distributed installers cannot select it."
- `docs/PATCHER-V2-DESIGN.md:39-46`: "Every registered root pack with
  `allDefault !== false` is included. `allDefault: false` is a maintainer-only
  pre-admission state."

No file under `src/` reads `allDefault`. `resolveProfile`
(`src/catalog.cjs:80-95`) includes every pack with `userSelectable !== false`
(lines 87-88). `packEtag` (`src/manager.cjs:68-82`) does not include the
field either.

The behavior was confirmed directly:

```js
resolveProfile('all', [
  { id: 'admitted', ... },
  { id: 'prequalified', allDefault: false, ... },
]).defaults
// → [ 'admitted', 'prequalified' ]
```

`test/pagefold-model-preset.test.cjs:12` asserts
`manifest.allDefault === true`, and `patches/pagefold-model-preset/manifest.cjs:40`
sets it. The test therefore protects a field that has no effect.

#### Consequence

A maintainer who follows the README to register a pack while it is still
being qualified gets one of two outcomes, neither of them the documented one:

- If the pack declares the target as `verified`, it ships immediately in the
  complete set.
- If the pack declares the target as `reviewing`, as the qualification
  procedure says, the compatibility status becomes `under-review` and the
  distributed installer refuses the **entire** apply with
  `TARGET_REVIEW_REQUIRED` (`src/compatibility.cjs:71-87`), because delivery is
  all-or-nothing.

#### Related documentation drift

- `README.md:1277` says to "build the two compatibility-named installers
  twice". `scripts/build-installers.cjs` now produces one installer and
  deletes the retired file names (lines 67-69).
- `README.md:43` calls `0.2.4-experimental.56` the current candidate installer,
  with BG adapter `0.7.60` and lazy sync `0.5.8`. The repository is at
  `package.json` `0.2.4-experimental.63`, `lazy-chat-bg-adapter` `0.7.62` and
  `lazy-chat-sync` `0.5.10`.

#### Recommendations

Choose one of the following:

- **Implement the gate.** Filter `pack.allDefault !== false` in
  `resolveProfile`, include `allDefault` in `packEtag`, and add a catalog test
  proving that a pre-admission pack is excluded from `defaults` while its
  internal adapters are not auto-added.
- **Remove the concept.** Delete the documentation paragraphs, the
  `allDefault: true` field, and the test assertion, and state that the target
  qualification status is the only pre-admission mechanism. Also state that
  registering a `reviewing` pack blocks the distributed installer.

Correct the two stale README statements in the same change.

#### Tradeoffs and regression risks

Implementing the gate changes the ETag of every pack that sets the field
(currently only `pagefold-model-preset`), which causes one ordinary
recomposition on the next apply. Removing the concept has no runtime effect.

### F4. Pack-level metadata diverges from unit-level reality; selection remnants stay on the main path

**Priority: medium. Fix cost: low to medium.**

#### Current behavior

**Pack boundaries do not match unit dependencies.**

- Planning `personal-settings` alone against pristine upstream fails with
  `MISSING_DEPENDENCY`:
  `personal-settings:external-headers:writer-fence: missing required unit client-build-fence:server-helper:1.9`.
  The unit is declared in
  `patches/personal-settings/settings/external-headers/units.cjs:33`, but the
  pack has no `requires: ['client-build-fence']`. All other 15 root packs plan
  successfully alone.
- The README states that a newly admitted root pack joins the complete set
  "only after its focused owners and maximum graph pass" and that "feature work
  exercises every relevant owner composition". The focused graph of
  `personal-settings` does not compose today, and no test detects that.
- For two adapters, `autoWhen.all` differs from `requires`:
  - `kei-partial-edit-bg-adapter` requires
    `kei-partial-edit-core`, `kei-chat-render-bg-adapter` and `bg-preserve`,
    but its `autoWhen.all` lists only `kei-partial-edit-core` and `bg-preserve`.
  - `kei-translation-tools-bg-adapter` has the same pattern.

**Unused resolver and manager features.**

- No pack uses `conflicts`, `supersedes`, or `contracts`. The supersede
  normalization (`src/resolver.cjs:113-123` and `172-216`) and conflict check
  (lines 218-229) are exercised only by synthetic tests.
- The `allowInternal` and `allowedIds` options of `resolveSelection`
  (`src/resolver.cjs:84-111`) are never passed by any caller.
- `selectPacks` (`src/manager.cjs:539-543`) is exported but unused.
- `saveIntent` (`src/manager.cjs:431-439`) is used only by tests.

**Remnants of user selection on the main CLI path.**

- `resolveOperationIntent` (`src/cli.cjs:172-187`) always resolves the `all`
  profile, so `activePreset` is always defined. The guards
  `if (activePreset)` (lines 308, 311 and 602) and the fallback
  `activePreset?.id ?? 'custom'` (lines 347 and 617) never take their
  alternative branch.
- `resolveIntentPolicy(intent, catalog)` (line 151) does not use `catalog`.
  It normalizes legacy, custom and preset intents only to collapse them into
  either `presetIntent('all')` or `customIntent([], 'all')`.
- `validateProfileSelection(activePreset, packIds)` compares the profile's
  default list with itself and always passes.
- The `stage` branch (from line 298) and the `plan/apply/revert` branch (from
  line 525) repeat the same sequence: resolve, plan, compatibility, gate,
  apply, and wrap failures in `recordFailure`. `resolveSelection` is computed
  in the CLI and again inside `planTransition` (`src/manager.cjs:654`), and the
  failure path may compute it a third time (`src/cli.cjs:623`).

#### Why this is a problem

None of these produces wrong behavior today, because only the complete set is
ever planned. They do, however:

- make readers reason about modes (presets, custom intents, supersedes,
  internal requests) that cannot occur in the current product;
- make pack-level `requires` untrustworthy, so the documented claim that pack
  boundaries are verification units does not hold;
- force any change to the operation flow to be made twice in `cli.cjs`.

#### Is the current design reasonable?

Keeping the **read** side of old formats is necessary. `loadIntent` must still
parse legacy intents, and `validateProfileTransition` must still adopt
`features`, `hardening` and known `custom` states, so that old installations
can upgrade. The generation side of selection, and the resolver features no
pack uses, are leftovers from the retired configurable delivery.

#### Recommendations

1. Add a CI step that plans each root pack's resolved closure against the
   pristine upstream checkout CI already has. This turns pack-level `requires`
   into an enforced contract. Then fix `personal-settings` by adding
   `requires: ['client-build-fence']`, and decide whether the two `autoWhen`
   differences are intentional.
2. Simplify the CLI to a single operation function used by both `stage` and
   `plan/apply/revert`, parameterized by the target root and the failure phase
   names. Remove the always-true guards.
3. Keep migration readers. Remove or explicitly mark the unused resolver
   options and `selectPacks` only if they get in the way. Their benefit is
   modest, so this ranks below F3.

#### Tradeoffs and regression risks

The intent and state formats must remain readable. `test/cli.test.cjs`
already covers historical intent migration (`every non-empty historical intent
migrates to enabled complete delivery`) and should be kept unchanged as the
guard. A per-root-pack plan step adds roughly 4 seconds per pack to CI.

### F5. A version string does not identify one delivered build

**Priority: medium-low. Fix cost: low.**

#### Current behavior

Three different installer builds carry the same version identity:

| Commit | `dist/pocketrisu-patcher.cjs` blob | `package.json` | `lazy-chat-bg-adapter` |
|---|---|---|---|
| `28a7eae` | `9e6509d` | `0.2.4-experimental.56` | `0.7.60` |
| `e4585b2` | `a980e6c` | `0.2.4-experimental.56` | `0.7.60` |
| `58af7b2` | `9961b54` | `0.2.4-experimental.56` | `0.7.60` |

The two later commits changed
`patches/lazy-chat-bg-adapter/files-1.10/server/node/bgPluginHost.cjs`, rebuilt
the distribution, and edited the existing `0.2.4-experimental.56` CHANGELOG
entry without bumping any version.

Tests pin pack versions in 19 places, for example
`test/g22a-capability.test.cjs:39` ("lazy-chat-bg-adapter version was not
advanced"). Those pins detect a bump that forgot to update the test, but not a
content change that forgot to bump the version.

#### Consequence

`patcherVersion` is what appears in conflict reports (`src/report.cjs:327`),
staging receipts (`src/staging.cjs:411`), and update-feed comparisons
(`src/update-feed.cjs`). None of these can tell the three builds apart. A
record that says "`.56` delivered" is ambiguous. Pack ETags in `state.json`
still distinguish the content, which limits the damage to diagnosis and
documentation.

#### Recommendations

- At build time, compute a content hash, for example SHA-256 over the
  serialized catalog plus the engine sources, embed it next to
  `patcherVersion`, and include it in reports, receipts and `--json` output.
- In CI, compare against the base branch. If
  `dist/pocketrisu-patcher.cjs` changes, require `package.json` `version` to
  change as well.

#### Tradeoffs

The build hash makes the bundle depend on its own inputs only, so
reproducibility is preserved. The CI rule adds one version bump per
content-changing commit, which matches README step 8 ("Bump the pack's
semantic version whenever its behavior changes").

### F6. Plugin-host verification lives outside CI

**Priority: medium-low.**

#### Current behavior

- `scripts/` contains about 9,000 lines of `node:test` probes
  (`probe-bg-*.cjs` and `probe-bg-*.mjs`). Neither `ci.yml` nor `npm test`
  runs any of them.
- `bgPluginHost.cjs`, `bgPluginSession.cjs`, `bgPluginWorker.cjs`,
  `bgPluginSandbox.cjs` and `bgPluginStorage.cjs` under
  `patches/lazy-chat-bg-adapter/files-1.10/server/node/` have no shipped
  `*.test.ts`. Only `bgPluginEligibility` and `bgPluginUnavailable` do. Their
  behavior is therefore not covered by the PocketRisu suite that CI runs.
- Commits `58af7b2` and `e4585b2` changed `bgPluginHost.cjs` together with
  probe updates only.

Results of running the probes against a patched, dependency-installed
`v1.10.0` tree in a Linux container without `/usr/bin/bwrap`:

| Probe | Result | Cause |
|---|---|---|
| `probe-bg-plugin-local-rpc.cjs` | 30 / 30 pass | Portable |
| `probe-bg-plugin-settlement.cjs` | 13 / 13 pass | Portable |
| `probe-bg-plugin-diagnostics.cjs` | 9 / 9 pass | Portable |
| `probe-bg-plugin-sandbox.cjs` | 0 / 15 | `plugin_sandbox_environment_unsupported` |
| `probe-bg-plugin-session.cjs` | 1 / 17 | `plugin_sandbox_environment_unsupported` |
| `probe-bg-plugin-worker.cjs` | 2 / 12 | `plugin_sandbox_environment_unsupported` |
| `probe-bg-plugin-large-local.cjs` | 20 / 25 | `plugin_sandbox_environment_unsupported` |
| `probe-bg-plugin-host.cjs` | 4 / 47 | Plugins never load without the sandbox, so later assertions cascade |
| `probe-bg-plugin-capability.cjs` | 3 / 11 | Same cascade |
| `probe-bg-plugin-combination.cjs`, `-pagefold`, `-process`, `probe-bg-marp*.cjs` | Not run | Require external fixtures (original plugin or MARP sources) passed as arguments |

The sandbox builds a `systemd-run` → `prlimit` → `bwrap` command
(`bgPluginSandbox.cjs:80-88`) and refuses when that environment is
unavailable (line 34). The failures above are therefore attributed to the
environment, **not** to a code regression. `probe-bg-plugin-sandbox.cjs:2`
labels itself "Explicit Linux/systemd integration probe, not part of portable
patcher tests."

#### Why this is a problem

The plugin host enforces permission, isolation and settlement guarantees. A
regression there is caught only if someone remembers to run the right probe
on a suitable host, and the commit history shows host changes landing with
probe updates only.

#### Recommendations

- Add the three portable probes to CI immediately after "Install patched
  PocketRisu dependencies":
  `node scripts/probe-bg-plugin-local-rpc.cjs .ci/pocketrisu`, and the same for
  `settlement` and `diagnostics`.
- Try installing `bubblewrap` on the runner and running the sandbox-dependent
  probes. Whether GitHub-hosted runners permit the required user namespaces
  and `systemd-run` scope is unknown and must be tested (see section 7).
- Longer term, convert the portable probe cases into shipped `*.test.ts`
  owned files so they run in the PocketRisu suite like the rest of the BG
  tests.

### F7. Marker-induced ASI hazards are guarded only by a manual audit

**Priority: low. Fix cost: low.**

#### Current behavior

For units declared with `content` (rather than exact `managed` text),
`markedBlock` (`src/compose.cjs:78-82`) emits
`/* POCKETRISU-PATCH:<id>:START */`, a newline, the body, and the end marker.
If a replace anchor begins right after a restricted production (`return`,
`throw`, `yield`, `break`, `continue`, or before `=>`), the inserted newline
triggers automatic semicolon insertion and silently changes the semantics,
while exact revert still succeeds.

- The repository documents the hazard with an executable test:
  `test/capability-return.test.cjs:23-33` ("a multiline expression marker can
  change a restricted return despite exact revert").
- It caused a real repair: `CHANGELOG.md:298`, `0.2.4-experimental.23`, "Repair
  the complete generated capability return".
- The guard is `scripts/audit-generated-markers.cjs`, a diagnostic that its own
  comment describes as "not a proof of all ASI hazards". It is not run in CI.

A scan of the current composed tree finds one marker directly after a
restricted keyword:

```ts
// src/ts/bgOrchestrate.ts:324 (composed)
if (!operationId || completionNotifiedOperations.has(operationId)) return/* POCKETRISU-PATCH:lazy-chat-bg-adapter:request-progress:completion:START */
```

This instance is **benign**. The original code also ends the statement with a
bare `return` followed by a newline, so the semantics are unchanged.

#### Recommendation

Run the audit in CI against the patched tree, where `typescript` is installed
after `pnpm install`, or add a simple regex check over composed files with an
explicit allowlist for reviewed bare returns. Either converts a past incident
class into a mechanical gate.

### F8. Path-safety and atomic-write helpers are duplicated five times

**Priority: low.**

#### Current behavior

Security-sensitive path validation, symlink refusal, and atomic writes are
implemented separately in five modules:

| Module | Helpers | Notable semantics |
|---|---|---|
| `src/manager.cjs:84-189` | `assertSafeRelative`, `resolveInside`, `assertNoSymlinkPath`, `writeAtomic`, `removeFile` | Throws `PatchManagerError`; root resolved with `path.resolve`; preserves the existing mode |
| `src/staging.cjs:326-396` | `safeReceiptPath`, `assertNoSymlinkPath`, inline atomic write | Throws `PatchStagingError`; fixed mode `0600` |
| `src/report.cjs:62-104`, `448-477` | `safeRelative`, `readTargetFile`, `assertNoSymlinkParents`, `writeAtomic` | Returns `null` instead of throwing; root resolved with `realpath`; checks file and directory types |
| `src/update-feed.cjs:218-299` | `safeCachePath`, `assertNoSymlinkPath`, inline atomic write | No type or NUL check before `replaceAll`; plain `Error` |
| `src/risu-report.cjs:41-68` | `isInside`, `assertRegularFileInside` | Uses `realpath` on both the root and the file |

No defect was found in any copy. The divergence means a fix to one copy, for
example for Windows separators, root symlinks, or a new error code, will not
propagate to the others. A plausible cause of the duplication is that adding
a shared module requires a new entry in the hand-written `embeddedRequire`
table of `scripts/build-installers.cjs:31-43`.

#### Recommendation

Extract a single `src/fs-safety.cjs` with explicit options (throw or
null, `resolve` or `realpath`, the mode policy), register it in
`build-installers.cjs`, and migrate one module at a time. The existing
symlink and path tests in `manager.test.cjs` serve as the regression guard.
This is worth doing opportunistically, not as a priority.

## 5. Investigated and judged acceptable

| Topic | Observation | Judgement |
|---|---|---|
| `state.json` is 9.3 MB | It stores every applied unit, including full owned content | Required for exact revert of an older representation (`stripCurrentUnits`, `src/manager.cjs:559-571`). Reasonable. |
| Journal, lock, preconditions, POSIX modes | Covered by 25 behavior-focused tests in `test/manager.test.cjs`; real apply, revert and upgrade round trips verified | Sound |
| Plan and apply performance | 3.9 s and 4.2 s for 1,783 units, including pairwise analysis | Acceptable at the current scale |
| Revert leaves empty directories | Five directories remain after revert | Cosmetic; Git ignores empty directories and CI's clean check passes |
| `version.json` (stable `0.2.3`) differs from `package.json` (experimental) | No code reads `version.json` | Intentional split between the stable channel and the candidate |
| `pnpm-lock.yaml` patched as text | 21 YAML units from 4 packs | Validated by `pnpm install --frozen-lockfile` in CI; the patcher cannot run `pnpm` itself |
| `risu-report.cjs:429` duplicates upstream `calculateHash` | Mirrors `server/node/utils.cjs:487`, which no pack modifies | The server verifies `expectedHash`, so a divergence fails closed with no corruption |
| Text-only managed content | No unit contains U+FFFD and all managed extensions are text | The UTF-8 string pipeline is safe for the current catalog |
| Lock refuses unreadable or foreign-host locks | Documented in `acquireRootLock` comments | Fail-closed by design; see section 7 for the container case |
| Pack test version pins | 19 hard-coded version assertions | Weak but intentional bump reminders; see F5 for the gap |

## 6. Recommended order of work

1. **F3.** A few lines of code or documentation, and it removes a trap in the
   admission procedure.
2. **CI additions, each a small step in `ci.yml`:**
   - the F7 marker audit on the patched tree;
   - the F6 portable plugin probes;
   - the F1 upgrade-path check (previous release, then current, compared with
     fresh);
   - the F4 per-root-pack closure plans.
3. **F5.** Embed a build content hash and enforce a version bump on `dist`
   changes.
4. **F1.** First the composed-output command and test migration, then folding
   repository-owned files one at a time with byte-identical composed output as
   the gate.
5. **F4.** Consolidate the CLI operation flow and drop always-true guards.
6. **F2.** Convert whole-file replacements to hunk units during the next
   upstream upgrade.
7. **F8.** Opportunistically.

## 7. Uncertainties and open questions

- **History depth.** The clone had 50 commits, so the growth trend of layered
  units, and whether the append-only style in F1 is a deliberate rule, could not
  be established. README notes that private workspace retrospectives remain
  local; such a rule could live there.
- **Full patched suite.** `pnpm test`, `pnpm check`, `pnpm build` and the BG
  bundle build were not run during this review, and the current CI status was
  not checked.
- **Sandbox probes.** Whether the sandbox-dependent probes pass on a host with
  `bwrap` and a working `systemd-run` scope was not verified, nor whether
  GitHub-hosted runners can provide that environment.
- **Stale locks across containers.** Automatic stale-lock recovery requires the
  same hostname (`src/manager.cjs:244-253`). If the patcher runs inside a
  container that is recreated (new hostname) after a crash, the lock in
  `save/pocketrisu-patches/lock.json` would never be reclaimed automatically.
  Whether the patcher is ever run that way is unknown.
- **The governance repository.** `patch-verification-governance` targets an
  implementation repository listed as `unresolved` in `TARGETS.yaml`, expects
  `scripts/verify-all-combinations.cjs` and
  `docs/patch-combination-verification-instructions.md` (neither exists here),
  and was last updated on 2026-08-14. Its premise of verifying combinations of
  pack subsets appears superseded by this repository's all-or-nothing delivery,
  under which only one combination is ever installed. Because its target is
  unresolved (it names a historical `nai-studio-2` identifier), this review
  does not conclude that it describes this repository.
- **Intent of the `autoWhen` differences** in F4 (two adapters) is unknown; they
  may be intentional.

## Appendix A: reproduction scripts

All scripts take the repository root and, where needed, a pristine
PocketRisu `v1.10.0` checkout. They only read; `planTransition` performs no
writes.

### A.1 Catalog statistics

```js
// node stats.cjs <repoRoot>
const path = require('path')
const root = process.argv[2]
const { loadCatalog } = require(path.join(root, 'src/catalog.cjs'))
const cat = loadCatalog(root)
const byFile = new Map()
let total = 0
for (const p of cat) for (const u of p.units) {
  total++
  if (!byFile.has(u.file)) byFile.set(u.file, [])
  byFile.get(u.file).push({ pack: p.id, type: u.type })
}
console.log('packs', cat.length, 'units', total, 'files', byFile.size)
for (const [file, units] of byFile) {
  const packs = new Set(units.map((u) => u.pack))
  if (packs.size > 1) console.log(units.length, packs.size, file)
}
```

### A.2 Plan each root pack alone

```js
// node single.cjs <repoRoot> <pristinePocketRisu>
const path = require('path')
const [root, target] = process.argv.slice(2)
const { loadCatalog } = require(path.join(root, 'src/catalog.cjs'))
const { planTransition } = require(path.join(root, 'src/manager.cjs'))
const cat = loadCatalog(root)
for (const pack of cat.filter((p) => p.userSelectable !== false)) {
  try {
    planTransition({ root: target, catalog: cat, packIds: [pack.id], profile: 'custom' })
    console.log('OK  ', pack.id)
  } catch (error) {
    console.log('FAIL', pack.id, error.code, error.message)
  }
}
```

### A.3 Layered-anchor and producer analysis

```js
// node layers.cjs <repoRoot> <pristinePocketRisu>
const fs = require('fs'), path = require('path')
const [root, target] = process.argv.slice(2)
const cat = require(path.join(root, 'src/catalog.cjs')).loadCatalog(root)
const { planTransition } = require(path.join(root, 'src/manager.cjs'))
const { applyUnit } = require(path.join(root, 'src/compose.cjs'))
const t = planTransition({
  root: target, catalog: cat, profile: 'all',
  packIds: cat.filter((p) => p.userSelectable !== false).map((p) => p.id),
})
const units = new Map()
for (const p of cat) for (const u of p.units) units.set(u.id, { ...u, pack: p.id })
const readUpstream = (file) => {
  try { return fs.readFileSync(path.join(target, file), 'utf8') } catch { return null }
}
const history = new Map() // file -> [{ id, text }]
for (const id of t.order) {
  const u = units.get(id)
  if (!history.has(u.file)) history.set(u.file, [{ id: '<upstream>', text: readUpstream(u.file) }])
  const steps = history.get(u.file)
  steps.push({ id, text: applyUnit(steps.at(-1).text, u) })
}
let layered = 0, implicit = 0
const fanOut = new Map()
for (const steps of history.values()) {
  const ownedBase = steps.find((s) => units.get(s.id)?.type === 'owned')
  for (let i = 1; i < steps.length; i++) {
    const u = units.get(steps[i].id)
    if (u.type === 'owned') continue
    const base = ownedBase ? units.get(ownedBase.id).content : steps[0].text
    if (base !== null && base.includes(u.anchor)) continue
    layered++
    let producer = null
    for (let j = 1; j < i; j++) {
      const has = steps[j].text?.includes(u.anchor)
      const had = steps[j - 1].text?.includes(u.anchor)
      if (has && !had) producer = steps[j].id
    }
    if (!producer || units.get(producer).type === 'owned') continue
    if (!(u.requires ?? []).includes(producer)) implicit++
    fanOut.set(producer, (fanOut.get(producer) ?? 0) + 1)
  }
}
console.log({ layered, implicitOnlyOrdering: implicit })
console.log([...fanOut].sort((a, b) => b[1] - a[1]).slice(0, 10))
```

### A.4 Whole-file replacement detection

```js
// node whole.cjs <repoRoot> <pristinePocketRisu>
const fs = require('fs'), path = require('path')
const [root, target] = process.argv.slice(2)
const cat = require(path.join(root, 'src/catalog.cjs')).loadCatalog(root)
for (const p of cat) for (const u of p.units) {
  if (u.type !== 'replace') continue
  let upstream
  try { upstream = fs.readFileSync(path.join(target, u.file), 'utf8') } catch { continue }
  if (u.anchor === upstream) console.log(p.id, u.file, upstream.length, (u.managed ?? u.content).length)
}
```

### A.5 Ordering edges and dangling references

```js
// node edges.cjs <repoRoot>
const path = require('path')
const root = process.argv[2]
const cat = require(path.join(root, 'src/catalog.cjs')).loadCatalog(root)
const ids = new Set(cat.flatMap((p) => p.units.map((u) => u.id)))
let withAfter = 0, afterEdges = 0
for (const p of cat) for (const u of p.units) {
  if (u.after?.length) { withAfter++; afterEdges += u.after.length }
  for (const key of ['after', 'before', 'requires']) {
    for (const ref of u[key] ?? []) if (!ids.has(ref)) console.log('dangling', u.id, key, ref)
  }
}
console.log({ withAfter, afterEdges })
```

### A.6 Lifecycle and upgrade round trip (shell)

```bash
UP=/path/to/pristine-v1.10.0
cp -r "$UP" fresh && cp -r "$UP" upgraded
git show 17cfa97:dist/pocketrisu-patcher.cjs > old-patcher.cjs

node dist/pocketrisu-patcher.cjs apply --root fresh --json
node old-patcher.cjs apply --root upgraded --json
node dist/pocketrisu-patcher.cjs apply --root upgraded --json

diff -rq -x save upgraded fresh
cmp upgraded/save/pocketrisu-patches/state.json fresh/save/pocketrisu-patches/state.json

node dist/pocketrisu-patcher.cjs revert --root fresh --json
diff -rq -x save "$UP" fresh   # only empty directories are reported
```

### A.7 `allDefault` check

```js
const { resolveProfile } = require('./src/catalog.cjs')
const target = { pocketrisu: { verified: ['1.10.0'], reviewing: [] } }
console.log(resolveProfile('all', [
  { id: 'admitted', version: '1', units: [], targets: target },
  { id: 'prequalified', allDefault: false, version: '1', units: [], targets: target },
]).defaults) // [ 'admitted', 'prequalified' ]
```

### A.8 Marker hazard scan on a composed tree

```bash
grep -rnP "(\breturn|\bthrow|\byield|=>|\bbreak|\bcontinue)[ \t]*/\* POCKETRISU-PATCH:[^*]+:START \*/[ \t]*$" \
  --include=*.ts --include=*.cjs --include=*.js --include=*.mjs --include=*.svelte <patched-root>
```

## Appendix B: raw measurements

### B.1 Pack inventory

| Pack | Version | Units | `requires` | `autoWhen.all` |
|---|---|---|---|---|
| bg-preserve | v1.0.1-patcher.9 | 187 | | |
| client-build-fence | 0.1.1 | 56 | | |
| client-build-fence-bg-adapter | 0.1.1 | 7 | client-build-fence, bg-preserve | same |
| client-build-fence-kei-adapter | 0.1.1 | 1 | client-build-fence, kei-backup-restore-safety-core | same |
| client-build-fence-kei-lazy-storage-adapter | 0.1.1 | 2 | client-build-fence, kei-backup-restore-safety-lazy-adapter | same |
| server-backup-snapshot-core | 0.1.1 | 8 | client-build-fence | same |
| server-backup-snapshot-lazy-adapter | 0.2.0 | 9 | server-backup-snapshot-core, lazy-chat-sync | same |
| lazy-chat-sync | 0.5.10 | 35 | | |
| lazy-chat-bg-adapter | 0.7.62 | 707 | bg-preserve, lazy-chat-sync | same |
| haejeok-persistence-safety-adapter | 0.1.1 | 53 | bg-preserve, lazy-chat-sync | same |
| persona-organizer | 0.11.3 | 27 | | |
| character-organizer | 0.1.1 | 6 | | |
| haejeok-korean-search-adapter | 0.1.0 | 11 | character-organizer | same |
| character-import-ux | 0.2.1 | 44 | lazy-chat-sync | |
| personal-settings | 0.5.14 | 129 | *(none, see F4)* | |
| haejeok-chat-width-adapter | 0.1.0 | 16 | personal-settings | same |
| preset-integrity | 0.2.2 | 8 | | |
| parser-hardening | 0.1.1 | 14 | | |
| toolchain-hardening | 0.1.4 | 7 | | |
| charx-archive-integrity | 0.1.1 | 18 | | |
| log-load-performance | 0.1.0 | 2 | | |
| usage-cost-estimate | 0.1.3 | 44 | | |
| fastimport-ios-picker | 0.1.0 | 4 | | |
| kei-stream-parser-core | 0.1.1 | 4 | | |
| kei-stream-parser-bg-adapter | 0.1.1 | 4 | kei-stream-parser-core, bg-preserve | same |
| kei-chat-render-core | 0.2.1 | 2 | | |
| kei-chat-render-bg-adapter | 0.2.1 | 16 | kei-chat-render-core, bg-preserve | same |
| kei-mobile-navigation-core | 0.2.1 | 4 | | |
| kei-mobile-navigation-lazy-adapter | 0.2.2 | 36 | kei-mobile-navigation-core, lazy-chat-sync | same |
| kei-hypa-tools-core | 0.2.1 | 4 | | |
| kei-hypa-tools-bg-adapter | 0.2.2 | 18 | kei-hypa-tools-core, bg-preserve | same |
| kei-partial-edit-core | 0.3.1 | 4 | | |
| kei-partial-edit-bg-adapter | 0.2.1 | 14 | kei-partial-edit-core, kei-chat-render-bg-adapter, bg-preserve | kei-partial-edit-core, bg-preserve |
| kei-translation-tools-core | 0.2.1 | 10 | | |
| kei-translation-tools-bg-adapter | 0.2.1 | 46 | kei-translation-tools-core, kei-chat-render-bg-adapter, bg-preserve | kei-translation-tools-core, bg-preserve |
| kei-fullscreen-image-viewer-core | 0.2.1 | 8 | | |
| kei-prompt-role-compat-core | 0.1.1 | 3 | | |
| kei-text-theme-normalization-core | 0.1.1 | 9 | | |
| kei-backup-restore-safety-core | 0.2.0 | 10 | | |
| kei-backup-restore-safety-lazy-adapter | 0.2.0 | 31 | kei-backup-restore-safety-core, lazy-chat-sync | same |
| pocketrisu-kei | 0.13.0 | 0 | 10 kei core packs | |
| pagefold-model-preset | 0.1.0 | 160 | | |
| pagefold-bg-adapter | 0.1.0 | 5 | pagefold-model-preset, bg-preserve | same |

### B.2 Files touched by the most packs

| Units | Packs | File |
|---|---|---|
| 187 | 3 | `src/ts/bgOrchestrate.ts` |
| 136 | 3 | `server/node/bgOrchestrator.cjs` |
| 88 | 9 | `src/lib/ChatScreens/DefaultChatScreen.svelte` |
| 75 | 9 | `server/node/server.cjs` |
| 50 | 7 | `src/ts/globalApi.svelte.ts` |
| 47 | 4 | `src/ts/process/request/request.ts` |
| 35 | 6 | `src/ts/storage/nodeStorage.ts` |
| 31 | 5 | `src/ts/process/index.svelte.ts` |
| 31 | 10 | `src/ts/storage/database.svelte.ts` |
| 30 | 7 | `src/lib/ChatScreens/Chat.svelte` |
| 21 | 4 | `pnpm-lock.yaml` |
| 10 | 9 | `src/lang/en.ts` and `src/lang/ko.ts` |

60 files are touched by more than one pack.

### B.3 Ordering declarations

| Measure | Value |
|---|---|
| Non-owned units | 1,386 |
| Units with `after` | 803 |
| `after` edges | 29,824 |
| Units with `requires` | 704 |
| Units with `before` | 4 |
| Dangling `after` references | 7 |
| Orderings inferred by the engine in the real plan | 9 |
