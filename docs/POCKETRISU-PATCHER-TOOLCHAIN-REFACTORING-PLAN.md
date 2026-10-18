# PocketRisu patcher toolchain refactoring analysis and plan

Status: analysis and plan only. Nothing in this document has been
implemented. No source, test, manifest, generated installer, or state format
was changed while producing it.

Date: 2026-10-18

## 0. Scope, cohort, and method

### 0.1 Evidence cohort

| Repository | Commit | Role |
| --- | --- | --- |
| `danso0429/pocketrisu-personal-patches` | `3242c3076b02159ca164ead625e5723364be58ae` (`main`) | Executable patcher toolchain, manifests, tests, generated installer |
| `danso0429/patch-verification-governance` | `49d891b12a51745b9da91bf23105d78869cf8664` (`main`) | Documentation-only governance for an external combination checker |
| `PocketRisu/PocketRisu` | tag `v1.10.0` (shallow clone, scratch only) | Real upstream target used for an end-to-end round trip |

Runtime: Node.js `v22.22.0`, Linux. Every line reference below is against
the commits above.

### 0.2 Scope decision

The request left the target scope open, so the scope was chosen from the code
that actually exists:

- **In scope:** the patcher toolchain in `src/*.cjs` (11 modules, about 4,957
  lines including `scripts/build-installers.cjs`, `scripts/qualify-target.cjs`
  and `scripts/audit-generated-markers.cjs`), the installer bundler, and how
  the toolchain consumes the patch manifests.
- **Examined, not refactoring targets:** the patch payloads under `patches/`
  (`files*/` and `anchors*/` are exact upstream baselines and managed
  replacements, so they are data, not toolchain design) and the 40+
  `scripts/probe-*.{cjs,mjs}` qualification probes.
- **Out of scope for code refactoring:** `patch-verification-governance`. It
  contains only Markdown, YAML, JSON schemas and one publish script. Its
  `TARGETS.yaml` marks the implementation repository as `unresolved` and
  expects `scripts/verify-all-combinations.cjs` and
  `docs/patch-combination-verification-instructions.md`. Neither file exists
  in this repository. The governance observations in section G are recorded
  for completeness only.

### 0.3 What was done to gather evidence

1. Read every toolchain module in full: `catalog`, `resolver`,
   `compatibility`, `update-channel`, `manager`, `compose`, `cli`, `staging`,
   `report`, plus the path-safety, codec and hashing parts of `risu-report`
   and `update-feed`.
2. Read `scripts/build-installers.cjs`, `scripts/qualify-target.cjs`,
   `scripts/audit-generated-markers.cjs` and the CI workflow
   `.github/workflows/*`.
3. Read the README sections "Build and use", "Composition and collision
   rules", "Adding or updating a patch pack" and "State, ETags, and recovery",
   plus `docs/PATCHER-V2-DESIGN.md`.
4. Ran the full test suite (baseline in A.4).
5. Rebuilt the installer and compared it with the committed `dist/` (A.4).
6. Ran the CI-equivalent `plan → apply → status → plan → revert` round trip
   with the committed installer against a fresh PocketRisu `v1.10.0` (A.4).
7. CPU-profiled `planTransition` on the full catalog against `v1.10.0`
   (B5).
8. Ran two scratch characterization probes (appendix H):
   - a path-validator matrix across the four duplicated validators;
   - a symlink-refusal probe across three metadata writers.
9. Checked documentation claims against code by searching for `allDefault`,
   `contracts` and `CONTRACT_FAILED`.

Git history could not be used to explain design intent: the whole toolchain
arrived in one commit (`d82488b feat(bg): show whole-request lifecycle
progress`, +4,765 lines across all 11 `src` files). Only `src/catalog.cjs`
changed after that.

---

## A. Current architecture

### A.1 Module responsibilities

| Module | Lines | Responsibility |
| --- | --- | --- |
| `src/catalog.cjs` | 138 | Explicit `require` of the 43 registered manifests (the publication gate); the single `all` profile; migration of retired `features`/`hardening`/`custom` state |
| `src/resolver.cjs` | 249 | Pack graph: `requires`, `conflicts`, `supersedes`, `autoWhen` expansion to a fixed point; cycle and conflict detection; deterministic sorted output |
| `src/compose.cjs` | 396 | Unit application (`insert`/`replace`/`owned`), exact revert, marker-drift detection, pairwise same-file dry-run order inference, topological sort |
| `src/manager.cjs` | 955 | Path safety, root lock, state/intent/journal formats, `planTransition`, stale-precondition validation, journaled `applyTransition`, `status` |
| `src/compatibility.cjs` | 116 | Target identity from `package.json` and per-pack `verified`/`reviewing` qualification gates |
| `src/staging.cjs` | 438 | Isolated candidate boundary and freshness checks, pnpm qualification checks, post-check drift detection, private receipt |
| `src/report.cjs` | 500 | Conflict report construction (unit inspection, closest-anchor hints, redaction) and private Markdown/JSON writing |
| `src/risu-report.cjs` | 840 | Delivery of a report into a RisuAI persona/module/character through the local PocketRisu server (JWT, session, hash precondition, read-back) |
| `src/update-feed.cjs` | 379 | Optional notification-only update feed with an allowlist, bounded fetch and private cache |
| `src/update-channel.cjs` | 13 | Disabled channel configuration (`url: null`) |
| `src/cli.cjs` | 742 | Argument parsing and command orchestration |
| `scripts/build-installers.cjs` | 78 | Hand-written bundler: embeds the 11 modules and the serialized catalog into `dist/pocketrisu-patcher.cjs` |

### A.2 Execution flows

```text
runCli (src/cli.cjs:232)
  parseArgs → loadCatalog (43 explicit requires) → resolveProfile('all')
  ├─ list                         print catalog summary
  ├─ report                       risu-report: load latest/selected report, print or deliver
  ├─ (all others)                 checkForPatcherUpdate (disabled channel → no network)
  ├─ stage --candidate PATH
  │    assertStagingBoundary (realpath, no overlap, pocketrisu package, fresh)
  │    withRootLock(candidate):
  │      assertFreshCandidate (re-check under lock)
  │      resolveSelection → planTransition (persistIntent)
  │      evaluateTargetCompatibility → targetGate
  │      applyTransition(lockHeld)
  │      gitTrackedChanges → buildQualificationChecks → runQualificationChecks (pnpm)
  │      assertPostCheckIntegrity (status current + tracked set unchanged)
  │      writeStagingReceipt
  └─ status | plan | apply | revert
       withRootLock(live root):
         restoreJournal
         status:  status() + intent + catalog ETag comparison + desired graph
         others:  validateProfileTransition / Selection
                  resolveSelection → planTransition (persistIntent)
                  evaluateTargetCompatibility
                  plan: print and stop
                  targetGate → applyTransition(lockHeld)
```

`planTransition` (`src/manager.cjs:643-772`) in detail:

1. Load the previous state.
2. Resolve and validate the packs.
3. Read the target identity.
4. Filter units by `targetVersions`.
5. Read every path touched now or previously, with its mode.
6. Strip the previously applied units in reverse order (`stripCurrentUnits`)
   to rebuild the baselines.
7. `compose`.
8. Diff the result against the current contents, then add the state file and
   intent file to the change set.
9. Return `changes` together with the full `preconditions`.

`applyTransitionUnlocked` (`:815-866`) then:

1. Re-validates every precondition, including target identity.
2. Writes a base64 journal of the originals.
3. Applies each change atomically.
4. On any error, restores from the journal.

### A.3 Dependency graph (runtime `require`)

```text
cli → manager, catalog, resolver, compatibility, report, risu-report,
      update-channel, update-feed, staging
manager → compose, resolver
staging → manager
risu-report → report
catalog, resolver, compose, compatibility, report, update-feed, update-channel → (node built-ins only)
```

The bundler wraps the modules in this order: compose, resolver,
compatibility, report, risu-report, update-feed, update-channel, manager,
staging, catalog, cli. Each wrapper runs as soon as it is defined.
`embeddedRequire` returns `xModule.exports` for a `const xModule` that must
already be initialized; otherwise the access is a temporal-dead-zone
`ReferenceError`. So the wrapper order is a hidden topological-order
constraint.

### A.4 Measured baseline

- `npm test`: 344 tests, 341 pass, 0 fail, 3 intentional skips (tests 102,
  103 and 104, which defer to browser runs and dedicated probes). Wall time
  about 8.5 s.
- `npm run build` reproduces the committed `dist/pocketrisu-patcher.cjs`
  (8,638,505 bytes) byte for byte; `git status --porcelain` is empty after
  the build. The serialized catalog alone is 8,428,361 bytes of JSON.
- Round trip with the committed installer on fresh PocketRisu `v1.10.0`:

| Command | Exit | Wall time | Result |
| --- | --- | --- | --- |
| `plan --json` | 0 | 4.21 s | 529 changed files, compatibility `verified`, 43 packs, 1,783 ordered units, 9 inferred collisions |
| `apply --json` | 0 | 4.37 s | 529 files written |
| `status --json` | 0 | 0.45 s | `current` |
| `plan --json` (second) | 0 | 4.53 s | 0 changed files |
| `revert --json` | 0 | 1.06 s | after deleting the two generated `bgOrchBundle.*` outputs, `git diff --quiet` succeeds and `git status --porcelain` is empty |

- Catalog load: about 107 ms. `planTransition` on the full catalog: about
  3,517 ms.

### A.5 Important design constraints

- Zero runtime dependencies. The distributed artifact is a single
  self-contained CommonJS file. `package.json` requires Node `>=22`.
- `dist/` is committed. CI rebuilds it twice, checks that the two builds
  match (`cmp`), checks mode `755`, checks that the rebuild leaves no diff in
  `dist`, and runs the built installer against real upstream.
- All metadata lives under `save/pocketrisu-patches/` in the target root:
  `state.json`, `intent.json`, `transaction.json`, `lock.json`,
  `staging.json`, `update-cache.json` and `reports/`.
- Users never choose subsets or order. The resolver and composer are fully
  deterministic: sorted ids, sorted ready queue, sorted outputs.
- The governance repository describes an external exhaustive-combination
  checker (historical identifier `nai-studio-2`) that cannot be seen from
  here. It may import these modules directly, so every current
  `module.exports` surface must be treated as public API.

### A.6 Behavior that must be preserved

1. **Persisted formats.**
   - State format 2 is written; format 1 must still be read
     (`src/manager.cjs:15-19, 301-313`).
   - Intent format 2 is written; the legacy format 1 must still be read
     (`:379-417`).
   - Journal format 1 (`:441-459`).
   - The `lock.json` owner shape (`:219-225`).
2. **Ownership migration.** `features` and `hardening` state is adopted;
   `custom` state is adopted only when every pack is known or listed in
   `RETIRED_OWNER_IDS` (`src/catalog.cjs:105-129`).
3. **Pack ETag input.** The exact field set hashed by `packEtag`
   (`src/manager.cjs:68-82`). Adding a field, even with a default value,
   changes every installed pack's ETag. `status` then reports
   `update-available` for every pack (`src/cli.cjs:535-545`).
4. **Marker text.** `/* POCKETRISU-PATCH:<id>:START */` and `...:END */`
   (`src/compose.cjs:70-76`). Installed targets contain these markers, and
   revert depends on exact block equality.
5. **File modes.**
   - Existing modes are preserved.
   - New files default to `0644` (`DEFAULT_NEW_FILE_MODE`).
   - All metadata uses `0600`.
   - Every atomic writer calls `chmodSync` after creating the temporary file,
     so umask cannot weaken the mode.
6. **Error contracts.**
   - Error `code` values are mapped to human causes in `src/report.cjs:11-56`.
   - Report `phase` strings (see B3).
   - CLI JSON output shapes (`summarizeTransition`, `summarizeResolution`,
     the stage result, the status object).
7. **Safety ordering.**
   - A stale plan is refused before any journal or source write.
   - A plan or apply that changes nothing creates no journal.
   - Any failure during apply restores every touched file.
8. **Implicit locking invariant.** `applyTransition({ lockHeld: true })`
   skips journal recovery (`src/manager.cjs:884-889`), so every lock-holding
   caller must recover first:
   - the live path does it at `src/cli.cjs:526`;
   - the stage path relies on `assertFreshCandidate`, which refuses any
     existing journal (`src/staging.cjs:85-103`), re-checked under the lock
     at `src/cli.cjs:341`.
9. **Build reproducibility.** Identical inputs produce an identical,
   byte-reproducible `dist`.

### A.7 Assessment of the core design

Several parts are sound and are not refactoring candidates:

- The pairwise same-file dry-run order inference.
- Exact snapshot-based revert.
- Precondition-checked journaled transactions.
- Fail-closed resolution.

Their apparent complexity matches the problem. Section F lists what should
explicitly be left alone.

---

## B. Validated refactoring opportunities

### B1. Duplicated, divergent filesystem-safety primitives

**Severity: high** (the code is security-relevant).
**Priority: recommended, after prerequisites.**

#### Evidence: four copies of the same three primitives

| Primitive | `manager.cjs` | `staging.cjs` | `report.cjs` | `update-feed.cjs` |
| --- | --- | --- | --- | --- |
| Safe relative path | `assertSafeRelative` `:84-98`, `resolveInside` `:100-108` | `safeReceiptPath` `:326-349` | `safeRelative` `:62-76` (returns `null`) | `safeCachePath` `:218-232` |
| Symlink component walk | `assertNoSymlinkPath` `:110-127` | `assertNoSymlinkPath` `:351-367` | `assertNoSymlinkParents` `:448-461`; reader variant inside `readTargetFile` `:78-104` | `assertNoSymlinkPath` `:234-248` |
| Atomic private write (`wx` temp, `chmod`, `rename`, cleanup) | `writeAtomic` `:156-179` | inside `writeStagingReceipt` `:369-396` | `writeAtomic` `:463-477` | inside `writeCache` `:275-299` |

A fifth, deliberately different model exists in `src/risu-report.cjs:41-68`
(`isInside` and `assertRegularFileInside`, which use realpath and
regular-file checks). It is not part of this duplication.

#### Measured divergence (probe H.1, current behavior)

| Input | `manager.resolveInside` | `staging.safeReceiptPath` | `report.safeRelative` | `updateFeed.safeCachePath` |
| --- | --- | --- | --- | --- |
| `a/b.json` | ok | ok | ok | ok |
| `.` | **ok (resolves to root)** | throw `UNSAFE_PATH` | **ok** | throw (no code) |
| `` (empty) | throw `UNSAFE_PATH` | throw `UNSAFE_PATH` | null | throw (no code) |
| `a/../b` | throw `UNSAFE_PATH` | throw `UNSAFE_PATH` | null | throw (no code) |
| `../x` | throw `UNSAFE_PATH` | throw `UNSAFE_PATH` | null | throw (no code) |
| `/abs` | throw `UNSAFE_PATH` | throw `UNSAFE_PATH` | null | throw (no code) |
| `a\b` | ok | ok | ok | ok |
| `a<NUL>b` | throw `UNSAFE_PATH` | throw `UNSAFE_PATH` | null | **ok** |
| `./a` | throw `UNSAFE_PATH` | throw `UNSAFE_PATH` | null | throw (no code) |
| `a//b` | throw `UNSAFE_PATH` | throw `UNSAFE_PATH` | null | throw (no code) |
| `a/` | ok | ok | ok | ok |

#### Other divergences

- **Post-`mkdir` symlink re-check.** `staging` (`:375` and `:377`) and
  `update-feed` (`:276` and `:278`) check symlinks before and after
  `mkdirSync`. `report.writeConflictReport` checks once, before `mkdir`
  (`:480-482`). `manager.writeAtomic` checks once, before `mkdir`
  (`:157-159`).
- **Error shapes.** `report` throws a plain `Error` with no `code` for a
  symlinked report directory (`:454`). `update-feed` throws plain `Error`s for
  both path and symlink refusals (`:225, :230, :241`). `manager` and
  `staging` use coded errors (`UNSAFE_PATH`, `SYMLINK_PATH`).
- **Root itself.** `manager` and `report` accept the root itself (`.`);
  `staging` and `update-feed` require a strict descendant.

#### Current symlink refusal (probe H.2)

The writers probed are the staging receipt, the conflict report and the
manager intent write. Each was tested with a symlinked `save/` and with a
symlinked `save/pocketrisu-patches/`. All of them refuse today and write
nothing outside the root. The refusals differ only in error form:
`SYMLINK_PATH` for staging and manager, an uncoded `Error` for report.

#### Practical consequences

- A safety correction applied to one copy does not reach the others. The
  post-`mkdir` re-check present in only two of four writers is exactly this
  kind of partial propagation.
- Test coverage is uneven:
  - `test/manager.test.cjs:794-812` covers path escape and symlink refusal.
  - `test/update-feed.test.cjs:172` covers a symlinked cache directory.
  - `test/report.test.cjs:121` covers symlink refusal only for report
    **inspection** (reading), not report writing.
  - Nothing covers `writeStagingReceipt` path or symlink handling.

#### Localized or systemic

Systemic within the toolchain: four modules, the same three concerns.

#### Could a smaller change do?

Partly. Adding the missing re-check to `report` would close the most visible
gap, but it would leave four copies to drift again. A shared module with thin
per-module wrappers is still small: three or four pure functions, and the
wrappers keep each module's exact contract.

#### Cost of leaving it unchanged

No known exploit today. The inputs reaching `staging` and `update-feed` are
internal constants (`DEFAULT_STAGING_RECEIPT_PATH`, `DEFAULT_CACHE_PATH`).
The inputs reaching `manager` come from manifests and from the target's own
`state.json` unit snapshots. The cost is future regression risk in exactly
the code that keeps the patcher inside the target root.

### B2. Bundler module table maintained three times; no local protection for `dist`

**Severity: high as an enabler.** It is a prerequisite for B1 and for any
module addition.
**Priority: essential before B1.**

#### Evidence

- `scripts/build-installers.cjs` lists the same 11 modules three times:
  - the file reads at `:15-25`;
  - the `embeddedRequire` branches at `:31-43`;
  - the wrapper emission order at `:44-54`.
- Wrapper order is an undocumented topological constraint (A.3). A module
  that requires a later-defined module fails with a TDZ `ReferenceError` at
  installer start.
- `embeddedRequire` falls through to the real `require(id)` for unknown ids
  (`:42`). A `./new-module.cjs` missing from the branch list is therefore
  resolved relative to `dist/` at runtime and throws `MODULE_NOT_FOUND` only
  in the distributed artifact.
- No test references `dist/` or the bundler; a search of `test/` returns
  nothing. `npm test` exercises `src/` only. Only CI notices a stale or
  broken `dist`, in two steps: "Rebuild installers reproducibly" and
  "Apply complete patch set".

#### Practical consequences

Adding a module, which B1 requires, takes three coordinated edits plus a
correct position, and the local test suite stays green when any of them is
wrong. The failure mode is "the published installer crashes while every
local test passes". CI would catch it, but only after a push.

#### Smaller alternative considered

A comment describing the constraint is cheaper, but it does not prevent the
failure. Deriving all three lists from one ordered array and adding a parity
test is still a small, mechanical change, and its output is
byte-identical, so it can be proven with `cmp`.

### B3. Duplicated plan/gate/apply orchestration in `runCli`; divergent failure accounting

**Severity: medium. Priority: recommended, after characterization tests.**

#### Evidence

- The live path (`src/cli.cjs:525-688`) and the stage path (`:298-523`) both
  implement:
  1. profile transition and selection validation (`:302-311` and
     `:596-607`);
  2. `resolveSelection` followed by `planTransition` (`:342-350` and
     `:612-620`);
  3. compatibility evaluation and `patcherUpdate` attachment (`:367-371` and
     `:638-642`);
  4. `targetGate` with failure recording (`:372-388` and `:648-661`);
  5. `applyTransition({ lockHeld: true })` with failure recording
     (`:391-411` and `:663-686`).
- `recordFailure({...})` is called 10 times. The calls are at `:321, 352,
  375, 398, 456, 489, 570, 627, 651, 671`. Each one repeats `reportRoot`,
  `inspectRoot`, `catalog`, `packIds`, `resolution` and `patcherVersion`.
- Each call passes one of these phase strings:

| Line | Phase |
| --- | --- |
| `:326` | `stage-preflight` |
| `:357` | `stage-plan` |
| `:380` | `qualification` |
| `:403` | `stage-apply` |
| `:461` | `stage-checks` |
| `:494` | `stage-receipt` |
| `:575` | `status-resolution` |
| `:632` | `plan`, `apply` or `revert` (the command name) |
| `:656` | `qualification` |
| `:676` | `plan-write`, `apply-write` or `revert-write` |

#### Divergence already present

- **`STALE_TRANSITION` accounting.** A live write failure records
  `liveSourceFilesChanged: false` for `STALE_TRANSITION`, which is raised
  before any write, and `'unknown-after-rollback-attempt'` otherwise
  (`:680-684`). The stage path records
  `stagingSourceFilesChanged: 'unknown-after-rollback-attempt'`
  unconditionally (`:407-409`). This is a small report-accuracy defect.
  Under the candidate lock a stale plan is unlikely but possible if another
  process edits the candidate without the lock.
- **Dead re-resolution.** `:622-626` re-runs `resolveSelection` in the catch
  block when `resolution` is still `null`. `resolution` is `null` only if
  `resolveSelection` itself threw, and it is deterministic, so the retry
  throws the same error and the catch swallows it. The block has no effect.
- **Vestigial guards.** `resolveOperationIntent` always returns a non-null
  `activePreset`, because `resolveProfile('all', …)` either returns or
  throws (`:176`). The `if (activePreset)` checks (`:308`, `:311`, `:602`,
  `:605`) and `activePreset?.id ?? 'custom'` (`:347`, `:617`) are leftovers
  from the removed multi-profile CLI. `parseArgs` explicitly rejects
  `--packs`, `--preset` and `--profile` (`:84-88`).
- **Duplicate resolution.** The CLI resolves the graph (`:342`, `:612`) and
  `planTransition` resolves it again internally (`src/manager.cjs:654`). The
  results are identical. `transition.resolution` lacks `packs`, which is why
  the CLI keeps its own copy for `evaluateTargetCompatibility` and staging.
- **Double state read in `status`.** `status()` loads the state
  (`src/manager.cjs:893`) and the CLI loads it again (`src/cli.cjs:549`)
  under the same lock. This is harmless.

#### Test coverage of failure phases

`test/cli.test.cjs` pins `report.phase` only for `apply` (`:447`),
`qualification` (`:555`), `stage-plan` (`:796`) and `stage-checks` (`:850`).
The phases `stage-preflight`, `stage-apply`, `stage-receipt`, `*-write`,
`status-resolution` and `revert` are not pinned.

#### Practical consequences

Any change to the gating sequence (a new gate, a new phase, a writeSafety
change) has to be made twice, and the existing divergence shows that this
has already gone wrong once. The vestigial branches suggest that a custom
profile still exists, which misleads readers.

#### Smaller alternative

Fixing only the `STALE_TRANSITION` accounting resolves the observable
defect, but not the duplication. Both are cheap once the characterization
tests exist.

### B4. Documentation describes admission and contract mechanisms the code does not implement

**Severity: high for correctness of the maintainer workflow.**
**Priority: essential to resolve, and it is a prerequisite.** Resolving it
is a decision or behavior question, not a refactor.

#### Evidence: `allDefault`

- `README.md:1262-1266` (step 3 of "Adding or updating a patch pack") says:
  "A root pack with `allDefault !== false` enters the complete set. Use
  `allDefault: false` only while a maintainer is qualifying a not-yet-admitted
  pack; distributed installers cannot select it."
- `docs/PATCHER-V2-DESIGN.md:38-46` states the same rule as part of the
  admission contract.
- `README.md:562` and `CHANGELOG.md:1180` describe packs that were kept
  outside rolling `all` by `allDefault: false`.
- The code never reads `allDefault`. A search of `src/` finds nothing.
  `resolveProfile` filters only on `userSelectable !== false`
  (`src/catalog.cjs:87`). `allDefault` is also absent from `packEtag`
  (`src/manager.cjs:68-82`).
- Today only `patches/pagefold-model-preset/manifest.cjs:40` sets
  `allDefault: true`, and `test/pagefold-model-preset.test.cjs:12` asserts
  that literal value. No registered pack sets `allDefault: false`, so the
  current delivered set is unaffected.

#### Consequence of the `allDefault` gap

A maintainer who follows the documented procedure, registering a pack in
`src/catalog.cjs` with `allDefault: false` to qualify it, would ship that
pack to every user of the complete installer. In practice the only effective
pre-admission gate is not registering the manifest. That is how
`docs/POCKETRISU-PAGEFOLD-PROTOTYPE-VALIDATION.md:50` describes PageFold's
prototype stage ("outside `src/catalog.cjs`").

#### Evidence: `contracts` and `CONTRACT_FAILED`

`contracts` is part of the ETag input (`src/manager.cjs:80`), and
`CONTRACT_FAILED` has a human cause (`src/report.cjs:47`) and a report test
fixture (`test/report.test.cjs:103`). However, no manifest declares
`contracts` and no code evaluates them. This is latent and harmless, but it
suggests a capability that does not exist.

#### Evidence: installer count

`README.md` step 6 says to "build the two compatibility-named installers
twice". The bundler produces exactly one installer and deletes the retired
names (`scripts/build-installers.cjs:67-69`), which matches
`docs/PATCHER-V2-DESIGN.md`.

#### Sequencing

Any refactor of `catalog.cjs` or `resolveProfile` must wait until the owner
decides what `allDefault` means (stage 0). Otherwise the refactor either
silently preserves a documented-but-missing gate or silently invents one.

### B5. Composition hot spots

**Severity: low. Priority: optional or deferred.**

#### Evidence: CPU profile of `planTransition`

Full catalog on PocketRisu `v1.10.0`; self time out of about 3.7 s sampled:

| Self time | Share | Function |
| --- | --- | --- |
| 999 ms | 26.7 % | `hasPath` (`src/compose.cjs:250`) |
| 958 ms | 25.6 % | `countOccurrences` (`:18`) |
| 463 ms | 12.4 % | `analyzePair` (`:217`) |
| 303 ms | 8.1 % | `assertNoMarkerDrift` (`:92`) |
| 240 ms | 6.4 % | garbage collector |
| 137 ms | 3.7 % | `encodeState` (`src/manager.cjs:639`) |

#### Analysis

- `buildPlan` checks every same-file unit pair. For each pair it runs
  `hasPath` twice, each time a fresh depth-first search with a new `seen` set
  (`:331`), and it repeats the search for every ambiguous collision (`:354`).
- `analyzePair` replays both orders from the baseline and calls
  `countOccurrences` across whole file contents.
- The cost is roughly quadratic in units per file.

#### Consequences

None for interactive use: a 4-second plan is acceptable. The cost would
become relevant only if the external exhaustive checker described by the
governance repository (4,096 raw masks) calls `planTransition` once per
mask. That checker cannot be observed from here.

#### Constraint on any future optimization

`order`, `collisions`, `edges` and `outputs` must stay identical. The
collision analysis depends on edge state that grows during the loop
(`addEdge` at `:337`), so caching reachability must be invalidated or kept
incremental as edges are added.

### B6. Target identity read five ways

**Validated as duplication. Not recommended for consolidation.**

| Reader | Location | Failure semantics |
| --- | --- | --- |
| `readTarget` | `src/compatibility.cjs:15-31` | Throws `INVALID_TARGET` on a missing or invalid file; no symlink check |
| `readTargetIdentity` | `src/manager.cjs:591-601` | Returns nulls when missing; symlink-guarded; throws `INVALID_JSON` |
| `targetIdentity` | `src/report.cjs:265-277` | Never throws (a report must still be producible on a broken target) |
| `readPackage` | `src/staging.cjs:28-50` | Throws `INVALID_STAGING_TARGET` and requires `name === 'pocketrisu'` |
| `assertPocketRisuRoot` | `src/cli.cjs:98-105` | Plain `Error`; existence and name check |

The duplicated part, mapping `pkg.name` and `pkg.version` to nullable
strings, is three lines. The parts that differ are intentional. Merging them
would require a policy parameter for every caller, which costs more than the
duplication.

### B7. Other duplication examined and rejected

- **Manifest helpers.** Eighteen manifests define the one-line
  `const owned = (relative) => fs.readFileSync(path.join(filesRoot, relative), 'utf8')`,
  and nine define a similar `read`. These are data-loading one-liners next to
  the data they load; sharing them would only add a cross-pack import.
- **`sha256`.** Duplicated in `compose.cjs:14-16` and `report.cjs:58-60`. Two
  lines each; `report.cjs` deliberately has no dependency on `compose.cjs`.
- **Hash and normalization helpers in `risu-report`.** `calculateHash` and
  `normalizeJSON` (`src/risu-report.cjs:429-521`) mirror PocketRisu's own
  database hash so the server's precondition check matches. Changing them
  would break delivery. They are cohesive and should stay as they are.
- **Failure printing in `qualify-target`.** `scripts/qualify-target.cjs:97-105`
  partly duplicates `handleCliFailure` without report delivery. This is a
  maintainer-only entry point and the difference is intentional.

---

## C. Alternative approaches

### C1. Filesystem safety (B1)

| Option | Benefit | Cost and risk | Verdict |
| --- | --- | --- | --- |
| C1a. Leave as is | Zero change | Continued drift in security code; uneven tests | Rejected |
| C1b. Patch only the gaps (add the `report` re-check, add codes) | Small | Still four copies; this is also an observable behavior change | Use only as the optional stage 5, after consolidation |
| C1c. Shared pure primitives plus thin per-module wrappers that keep every current code, message, return convention and root-acceptance rule | One implementation of the hard parts; no observable change; can be verified against pinned characterization tests | Requires B2 (a new embedded module) and new characterization tests | **Recommended** |
| C1d. Shared module that also normalizes error classes and rules | Simplest end state | Changes report output, CLI stderr and potentially the external checker; mixes refactor with behavior change | Rejected as one step; its parts can happen later as stage 5 |

### C2. Bundler (B2)

| Option | Benefit | Cost and risk | Verdict |
| --- | --- | --- | --- |
| C2a. One ordered array `[{ request, variable, file }]` drives reads, `embeddedRequire` and emission, plus tests for dist parity and require coverage | Byte-identical output provable with `cmp`; local tests catch a missing module | About 30 lines of change plus one test file; dist parity test adds a few hundred ms | **Recommended** |
| C2b. Automatic dependency discovery (parse `require('./…')` and sort topologically) | No manual ordering | Regex or AST parsing inside the bundler; more machinery than 11 modules justify | Rejected; a test can check the order instead |
| C2c. Third-party bundler (esbuild, rollup) | Standard tooling | Adds a dependency to a zero-dependency repository; changes dist layout and bytes; new supply-chain surface | Rejected |

### C3. CLI orchestration (B3)

| Option | Benefit | Cost and risk | Verdict |
| --- | --- | --- | --- |
| C3a. Fix only the `STALE_TRANSITION` accounting | Minimal | Leaves the duplication | Fold into stage 5 |
| C3b. A per-invocation failure-context closure plus one `planAndGate` helper; remove the dead branches | Single gate sequence; phase strings and writeSafety passed explicitly; about 100 fewer lines | Needs characterization tests for the six unpinned phases first | **Recommended** |
| C3c. Split commands into modules (`commands/stage.cjs`, …) | Smaller files | More bundler entries; no maintainability problem that C3b leaves unsolved | Rejected for now |

### C4. Admission semantics (B4)

| Option | Benefit | Cost and risk | Verdict |
| --- | --- | --- | --- |
| C4a. Align documentation with code: registration in `src/catalog.cjs` is the only admission gate, and `allDefault` is removed or documented as unused | No runtime change; matches how PageFold was actually staged | The documented "registered but not delivered" qualification workflow disappears | **Recommended default**, subject to the owner's decision |
| C4b. Implement `allDefault: false` in `resolveProfile` | Restores the documented workflow | Behavior change. The value must enter `packEtag` only when it is not `true`, so existing ETags stay unchanged. Reporting and status need care (a registered but undelivered pack) | Acceptable if the owner wants the workflow; plan it separately with tests |
| C4c. Leave the contradiction | None | A maintainer following the README can ship an unqualified pack | Rejected |

### C5. Performance (B5)

| Option | Verdict |
| --- | --- |
| Leave as is | **Recommended for now** |
| Per-file adjacency kept as an incrementally updated reachability set; memoized anchor counts per input string | Defer until there is a measured need (for example from the exhaustive checker) |

---

## D. Proposed target structure

### D.1 New module `src/fs-safety.cjs`

The module contains pure primitives with no error policy and imports only
`node:fs`, `node:path` and `node:crypto`:

```text
normalizeRelative(relative)            → normalized string | null
    rejects non-strings, empty, absolute, NUL, '..', non-canonical forms;
    returns the POSIX-normalized form (backslash mapped to '/')
resolveUnder(root, normalized, { allowRoot }) → absolute | null
firstSymlinkComponent(root, normalized) → offending absolute path | null
    stops at the first ENOENT, rethrows other errors
writePrivateAtomic(absolute, content, mode)
    'wx' temporary in the same directory, chmod, rename, unlink on failure,
    cleanup error attached as error.cleanupError
```

Per-module wrappers stay in their current files and keep:

- **manager.** `PatchManagerError` with `UNSAFE_PATH` and `SYMLINK_PATH`,
  the current messages (`Unsafe managed path: …`, `Managed path escapes
  root: …`, `Refusing to manage a symlinked path: …`), `allowRoot: true`, a
  single symlink check before `mkdir`, and the mode resolution order
  `mode ?? existing ?? 0644`.
- **staging.** `PatchStagingError` with the current codes and messages,
  `allowRoot: false`, the symlink check before and after `mkdir`, and mode
  `0600`.
- **report.** `safeRelative` keeps returning `null`; `readTargetFile` keeps
  its realpath and regular-file walk and keeps returning `null` on refusal;
  the writer keeps the plain uncoded `Error` and the single pre-`mkdir`
  check. These are changed only in the optional stage 5.
- **update-feed.** Plain `Error`s with the current messages,
  `allowRoot: false`, and the check before and after `mkdir`. The current
  acceptance of NUL must be decided explicitly:
  - pin it as observed (it is unreachable, since the path is a constant, and
    `fs` rejects NUL anyway);
  - or, preferably, record the rejection of NUL as an intentional change in
    stage 5.

`src/risu-report.cjs` stays unchanged.

### D.2 Bundler

`scripts/build-installers.cjs` gains one ordered array:

```js
const EMBEDDED_MODULES = [
    { request: './fs-safety.cjs', variable: 'fsSafetyModule', file: 'src/fs-safety.cjs' },
    { request: './compose.cjs', variable: 'composeModule', file: 'src/compose.cjs' },
    // ... existing order unchanged ...
    { request: './cli.cjs', variable: 'cliModule', file: 'src/cli.cjs' },
]
```

The file reads, the `embeddedRequire` branches and the emitted wrappers are
all generated from this array. The `cliModule.exports.runCli(...)` tail and
the retired-installer cleanup stay unchanged.

### D.3 CLI

`runCli` keeps the command dispatch. A per-invocation context captures
`reportRoot`, `catalog`, `packIds`, `patcherVersion`, `delivery` and the
mutable `resolution`, and exposes `fail(error, { phase, inspectRoot,
writeSafety, redactPaths })`. One helper performs:

```text
resolveSelection → planTransition → evaluateTargetCompatibility
  → attach patcherUpdate → (if not plan) targetGate → applyTransition(lockHeld)
```

The caller supplies the phase names (`stage-plan`/`<command>`,
`qualification`, `stage-apply`/`<command>-write`) and the writeSafety
factory. The status and stage-check/receipt paths keep their current shape.

### D.4 Dependency relationships after the change

```text
fs-safety ← manager, staging, report, update-feed
manager → compose, resolver, fs-safety
staging → manager, fs-safety
report → fs-safety
update-feed → fs-safety
(all other edges unchanged)
```

### D.5 Invariants to hold through every stage

1. Every behavior listed in A.6.
2. Every existing `module.exports` name and signature stays in place,
   including the internal-looking ones (`resolveInside`, `stableStringify`,
   `flattenUnits`, `unitMatchesTarget`, `analyzePair`, `insertionText`, …).
3. `npm test` passes, with the same 3 intentional skips.
4. `npm run build` stays deterministic: two builds are byte-identical, and
   `dist` is committed together with every source change that affects it.
5. The real-target round trip on `v1.10.0` keeps the same counts (529 files,
   43 packs, 1,783 units, 9 collisions), second plan 0, clean revert.

---

## E. Incremental refactoring plan

Each stage is meant to be its own reviewable commit, or a short series of
commits, with its own completion criteria.

### Stage 0: decide admission semantics (B4)

This is a prerequisite and involves no code.

- **Objective.** Remove the contradiction between the documented
  `allDefault` gate and the code before anyone touches catalog or profile
  code.
- **Decision required from the owner.** Choose C4a (documentation follows
  code) or C4b (implement the gate).
- **Files if C4a is chosen.**
  - `README.md`: step 3 at `:1262-1266`, the PageFold note at `:562`, and
    step 6 ("two compatibility-named installers") at `:1277`.
  - `docs/PATCHER-V2-DESIGN.md:38-46`.
  - Optionally drop `allDefault: true` from the PageFold manifest. That
    changes nothing in the ETag, because `allDefault` is not hashed, but it
    does require updating `test/pagefold-model-preset.test.cjs:12`.
  - Also document `contracts` as reserved and unevaluated, or remove the
    claim of contract enforcement.
- **Files if C4b is chosen.**
  - `src/catalog.cjs` `resolveProfile`.
  - `src/manager.cjs` `packEtag`: include the field only when
    `allDefault === false`, so existing ETags stay unchanged.
  - `src/cli.cjs` `list` and `status`: report registered but undelivered
    packs.
  - New tests.
  - This is a behavior change with its own changelog entry; it is not part
    of the refactor.
- **Verification.** Documentation review. For C4b, add tests showing that an
  `allDefault: false` root pack is absent from `resolveProfile('all')`, that
  its dependents behave correctly, and that the ETags of all current packs
  are unchanged. Compare `list --json` etags before and after.
- **Rollback.** Revert the documentation commit.

### Stage 1: single-source bundler table and dist protection (B2)

This is essential and has no prerequisites.

- **Objective.** Make adding an embedded module a one-line, test-protected
  change.
- **Files.**
  - `scripts/build-installers.cjs`.
  - New `test/build-installers.test.cjs`.
- **Structural changes.** Introduce `EMBEDDED_MODULES` (D.2) and generate
  the three current lists from it in exactly the current order and with
  exactly the current text.
- **New tests.**
  1. `build(loadCatalog())` is byte-identical to the committed
     `dist/pocketrisu-patcher.cjs`. This catches a stale `dist` locally and
     duplicates what CI checks.
  2. Every `require('./<name>.cjs')` found in any `src/*.cjs` module has an
     entry in `EMBEDDED_MODULES`.
  3. For every module, every relative module it requires appears earlier in
     `EMBEDDED_MODULES`.
  4. Optional: write the build output to a temporary directory and run
     `node <tmp>/pocketrisu-patcher.cjs list --json`, asserting exit 0 and
     43 entries. This exercises the bundle as an artifact.
- **Behavior constraints.** The generated `dist` must not change by a single
  byte.
- **Verification.**
  - Before and after the change, `npm run build` followed by `cmp` against
    the previous `dist` is identical, and `git status --porcelain -- dist`
    is empty.
  - `npm test` passes.
  - Mutation check: temporarily remove one array entry or swap two
    dependent entries; tests 2 and 3 must fail.
- **Failure modes.**
  - Line-ending or whitespace drift in the generated `embeddedRequire`
    block; the `cmp` check catches it.
  - Test 1 makes every source change also require a rebuilt `dist` before
    `npm test` passes. That is intentional and already required by CI, but
    it should be stated in README "Build and use".
- **Rollback.** Revert the commit. There are no persisted-state
  implications.

### Stage 2: characterization tests for filesystem safety (prerequisite for stage 3)

- **Objective.** Pin today's behavior so that stage 3 can be proven
  behavior-preserving.
- **Files.** `test/staging.test.cjs`, `test/report.test.cjs`,
  `test/update-feed.test.cjs`, `test/manager.test.cjs`.
- **Tests to add.** All of them describe current behavior; see appendix H
  for the observed values.
  1. `writeStagingReceipt` refuses a symlinked `save/` and a symlinked
     `save/pocketrisu-patches/` with `PatchStagingError` / `SYMLINK_PATH`,
     and writes nothing at the link target.
  2. `writeConflictReport` refuses the same two layouts and a symlinked
     `reports/`, throwing an `Error` whose `code` is `undefined` and whose
     message matches `/Refusing to write a report through symlinked path/`.
     It writes nothing at the link target.
  3. A path-validation matrix per module for `.`, ``, `a/../b`, `../x`,
     `/abs`, `./a` and `a//b`, with the exact outcome type and code.
     `staging` and `update-feed` validators are not exported; test them
     through the public writers with an explicit `receiptPath` or
     `cachePath` argument where the signature allows it, and otherwise test
     only the public entry points. Do not add exports just for tests.
  4. Written metadata files have mode `0600` regardless of a permissive
     umask, for receipt, report JSON and Markdown, update cache, intent and
     state.
  5. When the final rename fails, no temporary file remains. Simulate this,
     for example, by making the destination a directory.
- **Verification.** All new tests pass against the unchanged source.
- **Rollback.** Not applicable; this stage adds tests only.

### Stage 3: extract `src/fs-safety.cjs` (B1)

This is recommended and requires stages 1 and 2.

- **Objective.** One implementation of path normalization, root
  containment, symlink walking and private atomic writes.
- **Files.**
  - New `src/fs-safety.cjs`.
  - `src/update-feed.cjs`, `src/staging.cjs`, `src/report.cjs`,
    `src/manager.cjs`.
  - `scripts/build-installers.cjs`: one new array entry, placed first.
  - `dist/pocketrisu-patcher.cjs`: rebuilt.
  - New `test/fs-safety.test.cjs` for the primitives.
- **Sequence.** One module per commit, lowest risk first:
  1. **3a**: add `fs-safety` and its unit tests; register it in the bundler
     (dist bytes change because the module is embedded even though it is
     unused).
  2. **3b**: migrate `update-feed`.
  3. **3c**: migrate `staging`.
  4. **3d**: migrate `report`, both the writer and the `readTargetFile` path
     helper; the realpath walk stays local.
  5. **3e**: migrate `manager` last, because it guards every source write.
- **Behavior constraints.** D.1 wrapper rules. Every error class, code and
  message is unchanged. `manager` still accepts `.`. The re-check after
  `mkdir` stays exactly where it is today. The mode logic is unchanged.
- **Verification for each commit.**
  - Stage 2 tests and the full `npm test` pass.
  - `npm run build` twice gives identical bytes, and `dist` is committed.
  - `node --check dist/pocketrisu-patcher.cjs` succeeds.
  - On a fresh `v1.10.0`: `plan` (529), `apply`, `status` (`current`),
    second `plan` (0), `revert`, `git diff --quiet`.
  - After 3e, additionally run the manager journal and recovery tests and
    the mode-preservation tests (`test/manager.test.cjs:480-680`) in
    isolation.
- **Failure modes and regression risks.**
  - A wrapper message differs by one word. Stage 2 tests and report
    snapshot comparisons catch it.
  - `allowRoot` is inverted for one module. The matrix test catches it.
  - The symlink walk is changed from "stop at first ENOENT" to "walk all
    components", or the reverse. This affects how `mkdir` interacts with the
    walk; the symlinked-directory tests catch it.
  - `fs-safety` is placed after a dependent in the bundle. The stage 1
    order test catches it.
- **Rollback.** Revert the latest module commit. Each commit is independent
  after 3a. No persisted format changes, so installed targets need no
  migration.

### Stage 4: CLI orchestration consolidation (B3)

This is recommended. It requires stage 1 and the characterization tests
described below; it is independent of stage 3.

- **Objective.** A single gate sequence and a single failure-recording
  context, without vestigial branches.
- **Prerequisite tests** (add to `test/cli.test.cjs`). For each currently
  unpinned phase, assert `report.phase`, `report.writeSafety` and
  `error.code`:
  - `stage-preflight`: candidate overlaps the live root, giving
    `STAGING_PATH_OVERLAP`.
  - `stage-apply`: inject a write failure, for example a symlinked
    candidate file, to get `SYMLINK_PATH` at apply time, or use a stale
    candidate.
  - `stage-receipt`: make the receipt path unwritable.
  - `apply-write` and `revert-write`: write failure with
    `liveSourceFilesChanged: 'unknown-after-rollback-attempt'`, and a
    `STALE_TRANSITION` case with `false`.
  - `status-resolution`: a catalog whose complete graph conflicts.
  - `revert`: a planning failure during revert.
  - Also pin the complete JSON output shape of `plan`, `apply`, `status` and
    a successful `stage` against a small catalog.
- **Files.** `src/cli.cjs`; `dist/pocketrisu-patcher.cjs` (rebuilt).
- **Structural changes.**
  1. Introduce the failure context and `planAndGate` (D.3).
  2. Remove the `if (activePreset)` guards and `?? 'custom'` fallbacks. The
     validation calls run unconditionally, which they already do in
     practice.
  3. Remove the dead re-resolution at `:622-626`.
  4. Optional: let `planTransition` return the resolved `packs` so the CLI
     does not resolve twice. This adds a field to the transition object,
     which is internal and not printed.
- **Behavior constraints.**
  - Phase strings are unchanged.
  - writeSafety values are unchanged, including the stage-apply value for
    `STALE_TRANSITION`. Changing that value belongs to stage 5.
  - JSON output is unchanged.
  - `runCli`, `parseArgs`, `handleCliFailure`, `requestedPacksForIntent`,
    `resolveIntentPolicy` and `resolveOperationIntent` keep their exports
    and signatures. Note that `requestedPacksForIntent` and
    `resolveIntentPolicy` have an unused `catalog` parameter; keep it.
- **Verification.**
  - All CLI tests, old and new, pass.
  - `--json` output of `plan`, `status` and `apply` on a fresh `v1.10.0` is
    byte-identical to the output before the change, after removing
    run-specific fields (`outcome` timing and report incident ids).
  - The CI workflow passes.
- **Failure modes.**
  - A phase string is accidentally unified, for example both
    `qualification` call sites now receive the stage phase.
  - The `plan` command starts running the gate. Today it prints before
    gating (`:643-646`); this is pinned by
    `test/cli.test.cjs:559` ("plan previews ... without performing them").
  - `redactPaths` for stage-preflight (`:330`) is lost. The new
    stage-preflight test should assert that the candidate path is redacted
    in the report.
- **Rollback.** Revert the commit and rebuild `dist`.

### Stage 5: intentional hardening and accounting fixes

This is optional and is an explicit behavior change. Each item gets its own
commit and its own CHANGELOG entry.

1. `writeConflictReport` re-checks symlinks after `mkdir`, matching staging
   and update-feed. Its refusal carries `code: 'SYMLINK_PATH'`.
   - Observable change: conflict report output and stderr
     `[SYMLINK_PATH]`.
   - Update the stage 2 test deliberately.
2. `update-feed` path refusals carry codes (`UNSAFE_PATH`, `SYMLINK_PATH`)
   and reject NUL.
3. The stage-apply failure records `stagingSourceFilesChanged: false` for
   `STALE_TRANSITION`, matching the live path.
4. Optional: `manager.writeAtomic` re-checks symlinks after `mkdir`. This
   affects every source write. It is safe because a refusal happens before
   the temporary write, but it needs a performance check on 529-file
   applies.

- **Verification.** The updated tests express the new behavior; the full
  suite and the round trip pass.
- **Rollback.** Revert the individual commit.

### Stage 6: composition performance

This is deferred and should start only after a measured need appears.

- **Trigger.** Evidence that `planTransition` latency matters, for example
  from the exhaustive combination checker or CI duration.
- **Approach.**
  - Maintain per-file reachability incrementally as `addEdge` is called,
    instead of a fresh `hasPath` DFS for every pair.
  - Avoid recounting identical `(text, needle)` pairs.
- **Verification.** For the full catalog on `v1.10.0`, `order`,
  `collisions`, `edges` and every output hash are identical before and
  after. The same holds for the existing `test/compose.test.cjs` and
  `test/manager.test.cjs` scenarios. Measure the wall time.
- **Rollback.** Revert the commit. There is no format impact.

---

## F. Prioritization

| Item | Maintainability benefit | Correctness and reliability impact | Complexity | Regression risk | Scope | Depends on | Classification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Stage 0: admission semantics | Medium | **High** (an unqualified pack could ship if the README is followed) | Low (C4a) or medium (C4b) | Low (C4a) | Documentation, or catalog/manager | None | **Essential** |
| Stage 1: bundler table and dist tests | High | High (prevents installer-only breakage) | Low | Very low (byte-identical output) | One script, one test | None | **Essential** |
| Stage 2: filesystem-safety characterization | Medium | Medium (fills real test gaps) | Low | None (tests only) | Four test files | None | **Essential** (before stage 3) |
| Stage 3: `fs-safety` extraction | High | Medium (prevents future divergence in security code) | Medium | Medium, controlled by stages 1 and 2 and per-module commits | Four modules, bundler | Stages 1 and 2 | **Recommended** |
| Stage 4: CLI consolidation | Medium | Low to medium | Medium | Medium, controlled by new phase tests | `cli.cjs` | Stage 1 and new CLI tests | **Recommended** |
| Stage 5: hardening and accounting | Low | Low to medium | Low | Low (intentional, test-updated) | Three modules | Stage 3 (for items 1, 2 and 4) | **Optional** |
| Stage 6: compose performance | Low | None functionally | Medium to high | Medium (order equivalence must be proven) | `compose.cjs` | A measured need | **Deferred** |

### Why this order

- Stage 0 comes first because it is the only item that can currently cause
  a wrong delivery, and because it decides whether `catalog.cjs` and
  `packEtag` will change at all.
- Stage 1 comes next because every later source change ships through the
  bundler. It is also the cheapest stage to prove (`cmp`), and it turns
  "installer breaks while local tests pass" into a local test failure.
- Stage 2 must precede stage 3. A behavior-preserving consolidation can only
  be shown to preserve behavior that is pinned, and two of the four writers
  have no safety tests today.
- Stage 3 precedes stage 4 because it has the higher safety value and is
  mostly mechanical. Stage 4 is independent and could run in parallel by a
  different author once stage 1 has landed.
- Stages 5 and 6 change behavior or need new evidence. They are kept apart
  so that no commit mixes refactoring with semantic change.

### Changes that should not be undertaken

1. **Splitting `src/manager.cjs` (955 lines) by size.** Locking, state,
   intent, journal and transition code share private helpers and one
   transactional invariant. Splitting adds module boundaries, bundler
   entries and export surface without removing a demonstrated difficulty.
   Stage 3 already removes its generic filesystem code.
2. **Deduplicating the manifest `owned` and `read` one-liners** (B7). They
   are data loaders and do not justify a cross-pack import.
3. **Unifying the five target-identity readers** (B6). Their different
   failure semantics are deliberate.
4. **Changing `src/risu-report.cjs`.** Its hashing must stay
   byte-compatible with PocketRisu's database precondition. The module is
   cohesive.
5. **Changing any persisted format** (state, intent, journal, lock,
   receipt, report schema, update cache) or the marker text. Installed
   targets and recovery depend on them.
6. **Changing `packEtag` inputs**, unless stage 0 option C4b requires it,
   and then only additively and conditionally.
7. **Migrating to ESM or TypeScript, or adopting a third-party bundler.**
   The repository is deliberately dependency-free and ships one
   reproducible CommonJS file.
8. **Rewriting the composition algorithm for elegance.** Its pairwise
   dry-run semantics are the documented collision contract (README
   "Composition and collision rules").
9. **Touching the patch payloads (`patches/*/files*`, `anchors*`) as part of
   this work.** They are exact upstream baselines and managed replacements,
   not toolchain code.

---

## G. Open questions and limitations

### G.1 Unverified assumptions and missing evidence

1. **History of `allDefault`.** `CHANGELOG.md:1180` describes a registered
   `background-import` pack kept outside rolling `all` by
   `allDefault: false`. The current code has no such filter, and the
   truncated git history (the toolchain arrives whole in `d82488b`) cannot
   show whether the filter was implemented earlier and removed during the
   all-or-nothing simplification. `RETIRED_OWNER_IDS = ['background-import']`
   (`src/catalog.cjs:12`) shows that some installed states contain that
   pack, which is consistent with either history. **Owner decision
   required (stage 0).**
2. **External consumers.** The governance repository's checker (historical
   identifier `nai-studio-2`, `TARGETS.yaml` status `unresolved`) could not
   be opened. It is assumed that it may import `src/*.cjs` directly and
   depend on internal exports, so this plan keeps every export. If that
   checker is confirmed to use only the CLI, stage 4 could also remove
   unused exports. That is not proposed here.
3. **Stage path end to end.** The qualification checks (`pnpm install
   --frozen-lockfile`, `pnpm test`, `pnpm check`, `pnpm build`,
   `bgOrchBundle.build.cjs`) were not run in this analysis. Only `plan`,
   `apply`, `status`, the second `plan` and `revert` were exercised against
   real upstream. Stage 4 verification must include one real `stage` run or
   rely on the CI workflow's equivalent steps.
4. **Platforms.** Only Linux with Node `v22.22.0` was examined. Windows path
   behavior was not tested; for example, the backslash is accepted by all
   validators and mapped to `/`. The symlink, mode and `rename` semantics
   differ there. Any stage 3 change should keep the current POSIX-oriented
   behavior and not claim Windows support it does not have.
5. **Reachability of the path inputs.** The analysis assumes that
   `staging` and `update-feed` paths are always the module constants. This
   holds for every current caller (`src/cli.cjs` passes no override), but
   the functions accept overrides, and tests or external callers could pass
   other values.
6. **Performance relevance.** B5 is based on a single profile run. Whether
   it matters depends on how often `planTransition` is invoked by tools
   outside this repository.

### G.2 Environmental constraints

- PocketRisu `v1.10.0` was cloned shallowly into a scratch directory, and
  `bgOrchBundle.*` outputs were removed manually before the clean-tree check,
  exactly as the CI workflow does.
- No dependency installation was performed in the target.

### G.3 Governance repository observations

These are outside the refactoring scope and recorded for the owner. Per
that repository's own rules, nothing there was changed.

1. `README.md:6` still states "Phase 6 experimental completion approved,
   Phase 7 qualification-readiness audit authorized", while
   `CURRENT-STATUS.yaml` declares `statusVersion: 12`, `currentPhase: 9`
   (`C1-maturity-review`).
2. `REPOSITORY-FILE-MANIFEST.json` (`generatedAt: 2026-08-14`) lists every
   tracked file except itself. Its SHA-256 values no longer match four
   files: `CURRENT-STATUS.yaml`, `README.md`,
   `docs/current/CANONICAL-POLICY-POINTER.md` and
   `docs/runbooks/PATCH-VERIFICATION-OPERATOR-RUNBOOK.md`. No script
   regenerates it; `scripts/publish-with-gh.sh` only initializes and
   publishes the repository.
3. `TARGETS.yaml` expects `scripts/verify-all-combinations.cjs` and
   `docs/patch-combination-verification-instructions.md` in the
   implementation repository. Neither exists in
   `pocketrisu-personal-patches`, which supports the governance documents'
   own statement that this repository is not the resolved checker
   implementation.

A small manifest-regeneration script and a README status refresh would
address points 1 and 2. Whether to do that is the governance owner's
decision under that repository's approval rules.

### G.4 Decisions requiring further investigation

| Decision | Needed before | Owner input |
| --- | --- | --- |
| `allDefault`: documentation follows code (C4a) or implement the gate (C4b) | Stage 0 | Required |
| Pin or deliberately reject NUL in the `update-feed` path validator | Stage 2 or 3 | Preferred: reject as a stage 5 change |
| Whether the external checker imports `src` internals | Removing any export (not planned) | Required only if export cleanup is ever wanted |
| Whether stage 5 item 4 (manager post-`mkdir` re-check) is wanted | Stage 5 | Optional |
| Whether `planTransition` latency matters to external tooling | Stage 6 | Measurement |

If stage 0 is resolved by documentation alone and no new module is ever
needed, retaining the current implementation everywhere else remains a
defensible choice. The recommended stages reduce future risk; they do not
fix a known failure in the delivered patch set.

---

## H. Appendix: reproduction

All probes ran from a scratch directory outside both repositories. They
required no changes to the repository.

### H.1 Path-validator matrix probe

The probe compiles each module with its private validators appended to
`module.exports.__probe`, then calls them on the same inputs:

```js
// probe-paths.cjs <repo>/src
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), Module = require('node:module')
const src = process.argv[2]
function loadWith(file, extra) {
  const code = fs.readFileSync(path.join(src, file), 'utf8') + `\nmodule.exports.__probe = { ${extra} }\n`
  const m = new Module(path.join(src, file)); m.filename = path.join(src, file); m.paths = Module._nodeModulePaths(src)
  m._compile(code, m.filename); return m.exports.__probe
}
const mgr = loadWith('manager.cjs', 'assertSafeRelative, resolveInside')
const stg = loadWith('staging.cjs', 'safeReceiptPath')
const rep = loadWith('report.cjs', 'safeRelative')
const upd = loadWith('update-feed.cjs', 'safeCachePath')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-'))
const inputs = ['a/b.json', '.', '', 'a/../b', '../x', '/abs', 'a\\b', 'a\0b', './a', 'a//b', 'a/']
const show = (fn) => { try { const r = fn(); return r === null ? 'null' : 'ok' } catch (e) { return `throw:${e.code ?? 'Error'}` } }
for (const i of inputs) console.log([JSON.stringify(i), show(() => mgr.resolveInside(root, i)),
  show(() => stg.safeReceiptPath(root, i)), show(() => rep.safeRelative(i)), show(() => upd.safeCachePath(root, i))].join(' | '))
```

The results are the table in B1.

### H.2 Symlink-refusal probe for metadata writers

The probe calls `writeStagingReceipt`, `writeConflictReport` and
`saveIntent({ lockHeld: true })` on roots where either `save` or
`save/pocketrisu-patches` is a symlink to an empty outside directory:

```text
staging receipt [save-dir]:  refused SYMLINK_PATH; outside entries=[]
staging receipt [leaf-dir]:  refused SYMLINK_PATH; outside entries=[]
conflict report [save-dir]:  refused (no code) "Refusing to write a report through symlinked path ..."; outside entries=[]
conflict report [leaf-dir]:  refused (no code); outside entries=[]
intent (manager) [save-dir]: refused SYMLINK_PATH; outside entries=[]
intent (manager) [leaf-dir]: refused SYMLINK_PATH; outside entries=[]
```

### H.3 Real-target round trip

```bash
git clone --depth 1 --branch v1.10.0 https://github.com/PocketRisu/PocketRisu.git pocketrisu
P=<repo>/dist/pocketrisu-patcher.cjs
node "$P" plan   --root pocketrisu --json   # 529 changed, verified, 43 packs, 1783 units, 9 collisions
node "$P" apply  --root pocketrisu --json   # 529 files
node "$P" status --root pocketrisu --json   # current
node "$P" plan   --root pocketrisu --json   # 0 changed
node "$P" revert --root pocketrisu --json
rm -f pocketrisu/server/node/bgOrchBundle.css pocketrisu/server/node/bgOrchBundle.mjs
git -C pocketrisu diff --quiet && test -z "$(git -C pocketrisu status --porcelain)"
```

### H.4 Profiling

```bash
node --cpu-prof --cpu-prof-dir=prof -e "
const {loadCatalog,resolveProfile}=require('<repo>/src/catalog.cjs'); const cat=loadCatalog();
require('<repo>/src/manager.cjs').planTransition({root:'pocketrisu',catalog:cat,
  packIds:resolveProfile('all',cat).defaults,profile:'all'})"
```

Self time was aggregated per `callFrame.functionName` and source line from
the resulting `.cpuprofile`; the results are the table in B5.

### H.5 Baseline commands

```bash
npm test                                            # 344 tests: 341 pass, 3 skipped, 0 fail
npm run build && git status --porcelain             # empty: dist is reproducible and current
grep -rn "allDefault" src scripts test patches      # only the PageFold manifest and its test
grep -rln "dist/\|build-installers" test            # no results: no local dist coverage
```
