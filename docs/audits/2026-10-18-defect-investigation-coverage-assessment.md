# 2026-10-18 — Defect investigation coverage assessment and batch plan

Status: assessment and planning only. No application source, manifest, test,
build configuration or existing report was changed. No new defect is claimed
here; every "gap" below is a place that has **not** been examined, not a place
that is known to be wrong.

Times are UTC. No chat content, names, identifiers or credentials are recorded.

## 0. Cohort

| Item | Value |
|---|---|
| Repository | `danso0429/pocketrisu-personal-patches` |
| Assessed revision | `main` = `origin/main` = `3242c3076b02159ca164ead625e5723364be58ae` |
| Original investigation baseline | `3242c3076b02159ca164ead625e5723364be58ae` (identical to the assessed revision) |
| Reference report | `docs/records/2026-10-18-proactive-defect-investigation.md` on `claude/bug-investigation-iz2fgk` at `26dee75dadc49a48e34602876bcf4159e6c71f58` (not on `main`) |
| Package | `0.2.4-experimental.63`; `version.json` stable `0.2.3` |
| Target | PocketRisu `v1.10.0` = `98e968339d1b3f91b9dac85bb3f2ebb5f90f9d14` (pristine clone, matches `docs/SOURCE-PROVENANCE.md`) |
| Related repository (read only) | `danso0429/patch-verification-governance` `main` = `49d891b12a51745b9da91bf23105d78869cf8664` |
| Tooling | Node `v22.22.0`, pnpm `10.34.1` (via `packageManager`) |

## 1. Method

All numbers in this report were measured on the cohort above. The commands are
in Appendix A so the inventory can be regenerated.

1. Fetched the reference branch and compared it with `main`
   (`git log main..origin/claude/bug-investigation-iz2fgk`,
   `git diff --stat`, `git merge-base`).
2. Ran `npm test` in this repository.
3. Applied the complete set with `dist/pocketrisu-patcher.cjs apply --json`
   to a copy of a pristine `v1.10.0` clone outside the repository, recorded
   the plan output, and measured the composed delta with
   `git add -A -N . && git diff --numstat` against the pristine tree.
4. Loaded the catalog through `src/catalog.cjs` and listed every unit
   (pack, id, file, type, body size). Mapped every changed path to its owning
   units, so composed files with several owners are visible.
5. Measured duplicated representations: anchor snapshots, whole-file
   replacement bodies (diffed against their anchors), the generated installer
   (rebuilt in a scratch copy and compared byte for byte), the imported
   `bg-preserve.json` payload, and payload pre-images that later units
   rewrite.
6. Mapped production files to embedded tests by static import analysis of all
   268 test files in the composed tree.
7. Ran the embedded suites in the patched tree:
   `pnpm install --frozen-lockfile` then
   `NODE_OPTIONS=--no-experimental-webstorage pnpm test`.
8. Read the reference report, the five records in `docs/records/`, the
   validation/plan documents in `docs/` and `docs/archive/` (by title and
   scope lines), the CI workflow and the test files, and classified prior
   coverage per subsystem.
9. Assigned every one of the 1,783 composed units to exactly one batch by the
   rule set in Appendix A (0 unassigned), then added the non-unit sources
   (delivery tool, scripts) and two cross-cutting batches.

### 1.1 Measurement definitions

- **Composed delta**: the difference between the patched `v1.10.0` tree and
  the pristine tree. This is what ships and what an investigator must read.
- **Effective lines**: added + deleted lines. For a whole-file replacement the
  body is diffed against its anchor, so 6,960 lines of `server.cjs` count as
  the 671 lines that actually differ.
- **Direct test import**: a test file in the composed tree imports, requires
  or names the production path. This is a weak proxy: an import does not prove
  that the patched behaviour is asserted.

### 1.2 Verification results

| Check | Result |
|---|---|
| `npm test` (this repository) | 341 passed, 3 skipped, 0 failed (matches the reference) |
| `apply --json` on pristine `v1.10.0` | `compatibility.status: verified`; 43 packs; 1,783 units in order; 9 ordered collisions; 529 changed paths, 0 skipped |
| Embedded client suite (`vitest run`) | 208 files passed, 1 skipped; 2,550 tests passed, 4 skipped (matches the reference) |
| Embedded server suite (`vitest.config.server.ts`) | 47 files passed; 663 tests passed, 12 skipped (matches the reference) |
| Installer reproducibility | `npm run build` in a scratch copy produced a byte-identical `dist/pocketrisu-patcher.cjs`; working tree stayed clean |

`pnpm install` reported one ignored build script (`sharp@0.34.5`); no suite
failed because of it. The client run prints an `ECONNREFUSED 127.0.0.1:3000`
error object; no test failed.

## 2. Revision differences from the investigation baseline

- `main` has not moved since the investigation: `main` = `origin/main` =
  baseline `3242c30`.
- The reference branch is exactly one commit ahead of the baseline
  (`26dee75 docs(records): add the proactive defect investigation`) and adds
  only the reference report (186 lines). The merge base is the baseline.
- Therefore every file and line reference in the reference report is valid for
  the assessed revision, and no code reviewed by it has changed since.
- The reference report is not present on `main`. Any batch that relies on its
  findings must read it from `26dee75`.

## 3. Repository inventory

### 3.1 Classification of tracked content

`git ls-files` lists 780 paths. They fall into these classes:

| Class | Location | Size | Role | Counted as reviewable source? |
|---|---|---|---|---|
| Delivery tool | `src/*.cjs` (11 files) | 4,766 lines | Resolver, composer, transactional manager, staging, CLI, reports, update feed | Yes |
| Maintainer/operator scripts | `scripts/*.cjs` without `probe-*` (7 files) | 919 lines | Build, import, qualification, migration and CSS rollback tools | Yes |
| Pack manifests and unit builders | `patches/*/manifest.cjs`, `adapter-manifest.cjs`, `*-units.cjs`, `settings/*/units.cjs` (86 files) | 24,108 lines | Generate units; many carry unit content inline as strings | Yes, through the composed output plus their conditional logic |
| Pack payloads | `patches/*/files*`, `core/files`, `settings/*/files`, `fragments`, `snippets` | (in the 137,665 lines of `patches/`) | Owned files, whole-file replacements, inserted fragments | Yes, but only as composed output (§3.4) |
| Upstream anchor snapshots | `patches/*/anchors*` (20 files) | 18,452 lines | Verbatim `v1.10.0` text used as replacement anchors | **No** — upstream copies (§3.4) |
| Imported first-party payload | `patches/bg-preserve.json` | 617,148 bytes, 179 units | Generated by `scripts/import-bg-preserve.cjs` from the private `risuai-bg-stream-preserve` `v1.0.1` installer | Yes, as shipped code; the generator source is not in this repository (§3.4) |
| Generated installer | `dist/pocketrisu-patcher.cjs` | 4,841 lines | `src/` + catalog bundled by `scripts/build-installers.cjs` | **No** — byte-reproducible duplicate |
| Repository tests | `test/*.test.cjs` (54 files) | 9,377 lines, 344 tests | Delivery-tool tests plus pack tests on manifests, payload text and synthetic composition | No (harness) |
| Qualification probes | `scripts/probe-*`, `scripts/probes/*`, `scripts/fixtures/*` (40 files) | 9,576 lines | Browser/process/systemd probes for BG, plugins, MARP, notifications | No (harness) |
| Research | `research/pagefold-verbatim/` (4 files) | 2,039 lines | PageFold verbatim profile research; used only by `test/pagefold-verbatim.test.cjs`, not by the catalog | No (excluded, §9) |
| Documentation | `docs/` (157 Markdown files before this report), `README.md`, `CHANGELOG.md`, notices | — | Plans, validations, records | No |
| CI | `.github/workflows/ci.yml` | 1 workflow | `npm test`, reproducible build, apply on `v1.10.0`, embedded suites, `pnpm check`, `pnpm build`, byte/mode revert round trip | Configuration (referenced, not a batch target) |

The raw `patches/` directory holds 481 files and 137,665 lines. The reference
report's "about 130,000 lines of pack code" counts this raw volume. After
removing anchors, test payloads and unchanged replacement text, the shipped
production delta is ≈59,400 lines (§3.3).

### 3.2 Patch catalog

`src/catalog.cjs` loads 43 packs. Delivery is all-or-nothing: the only profile
is `all`, and non-selectable packs enter through `autoWhen`/`requires`.
Subset combinations are not delivered, so the composed complete set is the
production artifact; the upgrade path from earlier installed states is the
other delivered behaviour (`validateProfileTransition`).

| Pack | Version | Units | Entry | Batch(es) |
|---|---|---|---|---|
| `bg-preserve` | `v1.0.1-patcher.9` | 187 | selectable | CB-04–CB-08, CB-16 |
| `client-build-fence` (+ `-bg-adapter`, `-kei-adapter`, `-kei-lazy-storage-adapter`) | 0.1.1 | 56 + 7 + 1 + 2 | selectable / auto | CB-20 |
| `server-backup-snapshot-core` / `-lazy-adapter` | 0.1.1 / 0.2.0 | 8 / 9 | auto | CB-19 |
| `lazy-chat-sync` | 0.5.10 | 35 | selectable | CB-15–CB-17 |
| `lazy-chat-bg-adapter` | 0.7.62 | 707 | auto (`bg-preserve` + `lazy-chat-sync`) | CB-09A–CB-14, CB-16, CB-26 |
| `haejeok-persistence-safety-adapter` | 0.1.1 | 53 | auto | CB-18 |
| `persona-organizer` | 0.11.3 | 27 | selectable | CB-23 |
| `character-organizer` / `haejeok-korean-search-adapter` | 0.1.1 / 0.1.0 | 6 / 11 | selectable / auto | CB-24 |
| `character-import-ux` | 0.2.1 | 44 | selectable | CB-21 |
| `personal-settings` / `haejeok-chat-width-adapter` | 0.5.14 / 0.1.0 | 129 / 16 | selectable / auto | CB-25A, CB-25B, CB-26 |
| `preset-integrity`, `parser-hardening`, `toolchain-hardening` | 0.2.2, 0.1.1, 0.1.4 | 8, 14, 7 | selectable | CB-35 |
| `charx-archive-integrity` | 0.1.1 | 18 | selectable | CB-21 |
| `log-load-performance`, `usage-cost-estimate` | 0.1.0, 0.1.3 | 2, 44 | selectable | CB-34 |
| `fastimport-ios-picker` | 0.1.0 | 4 | selectable | CB-22 |
| `kei-stream-parser-core` / `-bg-adapter` | 0.1.1 | 4 / 4 | via `pocketrisu-kei` / auto | CB-27 |
| `kei-chat-render-*`, `kei-partial-edit-*`, `kei-hypa-tools-*` | 0.2.1–0.3.1 | 2+16, 4+14, 4+18 | via `pocketrisu-kei` / auto | CB-28 |
| `kei-translation-tools-core` / `-bg-adapter` | 0.2.1 | 10 / 46 | via `pocketrisu-kei` / auto | CB-29 |
| `kei-mobile-navigation-*`, `kei-fullscreen-image-viewer-core`, `kei-text-theme-normalization-core`, `kei-prompt-role-compat-core` | 0.1.1–0.2.2 | 4+36, 8, 9, 3 | via `pocketrisu-kei` / auto | CB-30 |
| `kei-backup-restore-safety-core` / `-lazy-adapter` | 0.2.0 | 10 / 31 | via `pocketrisu-kei` / auto | CB-19 |
| `pocketrisu-kei` | 0.13.0 | 0 (meta pack: `requires` ten Kei cores) | selectable | CB-30 (meta), CB-01 (resolution) |
| `pagefold-model-preset` / `pagefold-bg-adapter` | 0.1.0 | 160 / 5 | selectable / auto | CB-31–CB-33 |

Unit types: 985 `replace`, 401 `insert`, 397 `owned`. No unit is skipped for
`v1.10.0`.

### 3.3 Composed delta

`apply` reports 529 changed paths: 527 target source paths plus the patcher's
own `save/pocketrisu-patches/intent.json` and `state.json`.

| Class of composed path | Paths | New / modified upstream | Changed lines (add + del) |
|---|---|---|---|
| Production (server, client, Svelte, CSS, HTML, config sources) | 320 | 208 / 112 | 59,427 |
| Tests (embedded vitest files, fixtures, harness includes, `vitest.setup.ts`) | 198 | 187 / 11 | 37,870 |
| Localisation (`src/lang/*.ts`) | 5 | 0 / 5 | 420 |
| Package manifest and lockfile | 2 | 0 / 2 | 172 |
| Vendored third-party code | 2 | 2 / 0 | 434 |

Of the 320 production files, 207 are imported or named by at least one test
in the composed tree; 113 are not (per batch in §5).

#### HTTP entry points added by the set

In `server/node/server.cjs`: `POST /api/chat-content/:chaId/:chatIndex/patch`,
`POST /api/bg-notifications/claim`, `POST /api/bg-notifications/ack`,
`GET /api/bg-plugin-diagnostics`, `/api/pagefold/render`, the
`clientBuildFence.middleware`, a proxy form-body parser on `/proxy2?`, and
changed bodies of the existing `/api/patch` handler (101 diff lines) and of
the proxy handlers (client close, response pipeline, external headers).

Registered by owned modules (mostly `bgOrchestrator.cjs`):
`POST /api/bg-orchestrate`, `DELETE /api/bg-orchestrate/:operationId`,
`GET /api/bg-orchestrate-capabilities`,
`GET /api/bg-orchestrate-status/:operationId`,
`GET|DELETE /api/bg-orchestrate-result/…` (by operation and by chat),
`GET /api/bg-orchestrate-chat-state/:charId/:chatId`,
`GET /api/bg-orchestrate-input-base/:charId/:chatId`,
`POST /api/bg-orchestrate-input/…`, `GET /api/bg-chat-activity/:charId/:chatId`,
`GET /api/bg-stream-preview/:charId/:chatId`, `POST /api/bg-stream-job`,
`GET|POST /api/bg-stream-draft`, `POST /api/bg-stream-draft/delete`,
`GET /api/bg-sub-result/:jobId` and `/ack`, `POST /api/bg-preserve-signal`,
`GET /api/bg-gemini-cache-status`, `GET|PUT /api/external-request-headers`,
`GET /api/request-logs/usage/entries` (in `request-logs.cjs`).

#### Composition hotspots

Files whose units belong to three or more batches. They are where
independently written packs interact and are the subject of CB-02.

| File | Batches touching it |
|---|---|
| `server/node/server.cjs` | 13 (CB-05, 06, 09A, 10, 12, 13, 15, 19, 20, 23, 25, 26, 32) |
| `src/ts/globalApi.svelte.ts` | 11 (CB-04, 07, 09B, 10, 11, 13, 16, 18, 20, 23, 25) |
| `src/lib/ChatScreens/DefaultChatScreen.svelte` | 11 (CB-04, 08, 09B, 11, 12, 13, 17, 18, 20, 25, 28) |
| `server/node/bgOrchestrator.cjs` | 8 (CB-05, 09A, 10, 11, 12, 13, 14, 32) |
| `src/ts/storage/database.svelte.ts`, `src/lang/en.ts`, `src/lang/ko.ts` | 7 each |
| `src/ts/storage/nodeStorage.ts`, `src/ts/process/request/request.ts`, `src/ts/process/index.svelte.ts`, `src/ts/bgOrchestrate.ts`, `src/lib/ChatScreens/Chat.svelte` | 6 each |
| `src/App.svelte`, `pnpm-lock.yaml` | 5 each |
| `bgOrchestrationOperationStore.cjs`, `bgOrchBundle.build.cjs`, `package.json` | 4 each |
| `chatStorage.ts`, `jobRecovery.ts`, `google.ts`, `generationState.ts`, `command.ts`, `preset/adapter/types.ts`, `googleGemini.ts`, `backuplocal.ts`, `bootstrap.ts`, `bgStreamPreserve.svelte.ts`, `SystemBackup.svelte`, `clientBuildFence.cjs` | 3 each |

The plan reports nine ordered collisions (two units anchored at the same
place and ordered by `after`): bg-preserve versus the lazy-chat-sync
whole-file replacements of `globalApi.svelte.ts`, `server.cjs` and
`v3.svelte.ts`; the bg-preserve result-retention owner versus the
lazy-chat-bg-adapter retention owner; asset-upload retry versus the
`nodeStorage.ts` replacement; PageFold's binary body limit and
personal-settings' bootstrap import versus the lazy-chat-sync replacements;
and two intra-pack orderings (`persona-organizer`, `usage-cost-estimate`).

### 3.4 Duplicated representations and how they are counted

| Representation | Size | Rule used here |
|---|---|---|
| `dist/pocketrisu-patcher.cjs` | 4,841 lines (catalog embedded as one JSON line) | Generated from `src/` and the catalog; rebuilt byte-identically. Not reviewed separately. |
| Anchor snapshots (`anchors/`, `anchors-1.10/`) | 20 files, 18,452 lines (4 of them are transformed before use, e.g. `kei-stream-parser-core/anchors/*.json`) | Verbatim upstream `v1.10.0`. Not counted. Their exactness is enforced by composition (`MISSING_FILE`, `MARKER_DRIFT`, anchor counts). |
| Whole-file replacement bodies | 24 large `replace` units; 23,228 body lines | Counted as their diff against the anchor: 8,452 changed lines. Example: `lazy-chat-sync` `server.cjs` 6,960 → +523/−148; `nodeStorage.ts` 1,645 → +833/−29; `globalApi.svelte.ts` 3,237 → +474/−70; `persona-organizer` `PersonaSettings.svelte` 1,704 → +1,680/−164 (a near-rewrite). |
| Payload pre-images rewritten by later units | e.g. `personal-settings` `editor-replace-appearance-*-1.9` replace content that the same pack's `owned` units wrote (`appearance.ts` loses 464 lines) | The payload file under `patches/` is **not** what ships. Review the composed file. |
| `patches/bg-preserve.json` | 179 imported units; owned files include `bgOrchestrator.cjs` (1,232 lines), `bgOrchestrate.ts` (1,487), `bgStreamJob.cjs` (458), `bgStreamFetch.ts` (539) | Generated from the private upstream installer, then adapted by `patches/bg-preserve/manifest.cjs` (`replaceExact` adaptations, e.g. native-job isolation, the 49-hour marker horizon) and by 3 excluded hook IDs / 1 excluded payload in `scripts/import-bg-preserve.cjs`. Counted once, as composed output. The upstream source cannot be read here, so regeneration cannot be verified (fail-closed: only structure and adaptations can be checked). |
| `bgOrchBundle.mjs` / `.css` | not committed | Built on the target by `server/node/bgOrchBundle.build.cjs` from client modules and executed by the server. A generated-code origin: the build script and its input list are reviewed in CB-05; the output is not tracked. |
| `files/` versus `files-1.10/` | 0 overlapping relative paths in any pack | `files/` holds version-independent units, not a stale 1.9 copy. |
| Test payloads | 198 composed test paths | Harness, not production. |

All payload files under `patches/` are referenced by at least one active unit
(directly or through a transforming manifest); no orphaned payload was found.

## 4. Sources of existing coverage

Coverage is graded by what was actually done, not by what exists:

| Grade | Meaning | Evidence that qualifies |
|---|---|---|
| **T** | Thorough defect investigation | Full read with adversarial intent and targeted reproductions (reference report level) |
| **P** | Partial defect investigation | Specific paths traced by the reference report or by a `docs/records/` investigation; the rest not |
| **V** | Validation only | Feature validation/plan documents, embedded tests, probes, CI; no independent defect hunt |
| **N** | Nothing beyond static pack tests | Only `test/*.test.cjs` text assertions or no evidence |

What each source contributes:

- **Reference report (`26dee75`)**: read `src/` in full (findings 2–5); traced
  the BG recovery path for server-owned operations (finding 1, dynamic
  reproduction on the `bgFinishedOperationFlow.test.ts` harness: four orphaned
  states × legacy/server-owned × watch/boot); checked the translation cache key,
  compose/revert, transaction journal recovery and update-feed version
  comparison (no defect); governance drift (finding 6). Other packs were
  "sampled, not audited". WebKit/iPhone was not run.
- **`docs/records/`**: 2026-10-16 variable-read warning (`getChatVar`
  `scriptstate` mutation → `promptInputsChanged`); 2026-10-17 native recovery
  identity and ordinary Send repair (pending-input projection 503 on duplicated
  message IDs); 2026-10-17 persona editor, usage counts and save-sync
  (`RisuSavePatcher` baseline, `2bda466`; first chat on a fresh install,
  `a96becc`; slash `getvar`, `4ba4c68`); 2026-10-18 interrupted commit and stuck
  character view (open prevention items); 2026-09-27 BG plan/G1 work record.
- **Validation/plan documents** (`docs/POCKETRISU-G1-*`, `*-VALIDATION.md`,
  `docs/archive/POCKETRISU-1.9-*`): feature qualification at the time of each
  change. Most 1.9 receipts predate the `v1.10.0` rebase.
- **Repository tests**: 344 tests. 98 exercise the delivery tool (cli,
  manager, compose, staging, resolver, report, risu-report, catalog,
  compatibility, update-feed). The 246 pack tests assert manifest structure and
  payload text, compose units against synthetic host files, and in four files
  load a single payload module; none runs the composed target.
- **Embedded tests**: 2,550 client and 663 server tests in the patched tree;
  behavioural, but scoped by their authors to the intended behaviour.
- **Probes**: real-browser/process probes for BG queue, admission, native
  input, notifications, stream preview, failure UI, recovery timing and the
  plugin host/MARP qualification; run manually, not in CI.
- **CI**: mechanical composition (`plan`/`apply`/`status`), embedded suites,
  `pnpm check`, `pnpm build`, bundle build, exact revert round trip.

Known open items carried into this plan (not re-investigated here):
findings 1–5 (open; fixing them is not part of this plan); 2026-10-18 record
§7 prevention candidates (regex input-length bound, tokenizer off the render
path, terminal state for interrupted operations with an invalid receipt,
operation records left `running`); 2026-10-17 record §8 (post-assembly warning
cause, post-delivery BG plugin diagnostics run, stuck-view prevention, 1.14
first-save flow); `4ba4c68` and `a96becc` not device-checked.

## 5. Coverage matrix

Eff. lines = effective production lines owned by the batch's units (shared
files counted only for the batch's own units). Tests = embedded test paths
owned by the batch. No-import = production files of the batch with no direct
test import (`*` = shared file).

| Batch | Subsystem | Pri. | Eff. lines | Units | Tests | No-import | Prior investigation | Validation evidence | Grade |
|---|---|---|---|---|---|---|---|---|---|
| CB-01 | Delivery tool lifecycle residuals | P2 | 4,766 (src) | — | repo 10 files | — | Reference: full read, F2–F5 | CI, repo tests | **T** (residual paths only) |
| CB-02 | Composition integrity of hotspots | P0 | (cross-cut) | — | `capability-return` | — | none | CI mechanical; 1.10 rebase audit; 1.9 Svelte-marker/target-boundary validations | **V** (mechanical only) |
| CB-03 | Maintainer and operator scripts | P2 | 424 | — | 3 repo files | — | none | CI reproducible build (re-verified here) | **N** |
| CB-04 | BG client orchestration core | P1 | 2,973 | 69 | 17 | 2 | Reference: recovery path only | 1.9 BG composer/direct-lifecycle validations | **V** |
| CB-05 | BG server orchestrator lifecycle | P0 | 2,250 | 12 | 2 | 1* | Reference: orphaned-state mapping, marker horizon | 1.9 storage-base validation; K29 retention | **P** |
| CB-06 | BG stream preservation and proxy stream lifecycle | P1 | 1,779 | 21 | 2 | 4 | none | 1.9 storage-base validation | **V** |
| CB-07 | Gemini context cache, cache telemetry, tokenizer fallback | P1 | 967 | 51 | 2 | 4 | none (tokenizer named as prevention lead, 10-18) | bg-preserve tests | **V** |
| CB-08 | bg-preserve auxiliary features (regex multi-direction, RisuControl touch, module cache, status relay, a11y) | P2 | 582 | 30 | 3 | 2 | none (regex named as prevention lead, 10-18) | K23 regex validation | **V** |
| CB-09A | Server-owned input admission and execution (server) | P0 | 3,270 | 71 | 10 | 3 | Records 10-16, 10-17 (specific paths) | G1-3, G1-4, native-input validations | **P** |
| CB-09B | Server-owned input admission, send and settlement (client) | P1 | 1,537 | 68 | 14 | 1* | Records 10-16, 10-17 (Send failure, `getvar`) | cap-admission, composer-admission validations | **P** |
| CB-10 | Server-owned chat commit and publication | P0 | 2,890 | 60 | 5 | 0 | Reference: missing-result response and operation meta (as F1 input) | G1-1, G1-12 validations | **P** |
| CB-11 | Client recovery, hydration and terminal states | P0 | 2,497 | 208 | 13 | 1 | Reference F1: missing-result branch, 4 states × 2 shapes × 2 paths | G1-12, G1-12A/B validations; recovery probes | **P** (deep on one branch) |
| CB-12 | BG plugin host, worker and sandbox | P1 | 2,758 | 77 | 3 | 12 | none | G1-6, G1-7 (MARP, PDF proxy, protocol budget, …); 13 probes | **V** |
| CB-13 | BG notifications, operation notices, request progress, stream preview | P2 | 2,197 | 175 | 15 | 5 | none | G1-8, G1-9, saved-answer notice validations; probes | **V** |
| CB-14 | Request policy, model binding, native job recovery identity | P1 | 349 | 45 | 3 | 4 | Record 10-17 (identity repair) | G1-5 validation | **P** |
| CB-15 | Server chat persistence (lazy-chat-sync server) | P0 | 2,769 | 7 | 3 | 0 | Record 10-17 §6.2 (server side of the 409 loop only) | 1.9 lazy-chat-sync, startup-cache validations | **V** |
| CB-16 | Client save pipeline and asset upload retry | P0 | 2,801 | 24 | 11 | 1* | Record 10-17 §6.2/§6.6 (`2bda466`, `a96becc`) | save-sync baseline, root-only diff, new-chat regression docs | **P** |
| CB-17 | Startup cache, bootstrap, plugin chat access | P1 | 1,477 | 9 | 3 | 2* | Record 10-17 §6.6 (fresh-install bootstrap) | fresh-save first-chat plan | **P** |
| CB-18 | Haejeok persistence-ordering adapter | P0 | 397 | 53 | 3 | 1* | none | Haejeok runtime/comparison validations | **V** |
| CB-19 | Server backup snapshot and restore safety | P0 | 2,283 | 58 | 5 | 5 | none | 1.9 backup snapshot, snapshot-restore atomicity, K26 restore validations | **V** |
| CB-20 | Client build fence and handshake | P1 | 729 | 66 | 3 | 7 | none | 1.9 client-build-fence validation | **V** |
| CB-21 | Character/module import and CharX archive | P1 | 2,294 | 62 | 7 | 11 | none | 1.10 CharX/module validation; 1.9 import-UX validation | **V** |
| CB-22 | FastImport iOS picker and migration script | P1 | 141 + 495 (script) | 4 | 1 | 0 | none | K22 picker validation; repo tests | **V** |
| CB-23 | Persona organizer | P2 | 2,505 | 27 | 3 | 5 | none (10-17 §3 was feature work) | 1.9 persona validation; 25 static repo tests | **V** |
| CB-24 | Character organizer and Korean search | P2 | 1,585 | 17 | 2 | 5 | none | 1.9 organizer validation; Haejeok validations | **V** |
| CB-25A | Personal appearance: CSS toggles, custom fonts, appearance editor | P2 | ≈3,100 | (part of 132) | 9 | 13 | none | CSS/font validation docs, `docs/validation/` receipts | **V** |
| CB-25B | Settings shell, wrappers, import navigation, settings search, chat width | P3 | ≈1,550 | (part of 132) | 4 | 16 | none | 1.9 personal-settings validation | **V** |
| CB-26 | External request headers | P1 | 289 | 13 | 2 | 2 | none | G1-11 validation | **V** |
| CB-27 | Kei SSE stream parser and provider stream adapters | P1 | 584 | 8 | 3 | 0 | none | Kei integration catalog | **V** |
| CB-28 | Kei chat render, partial edit, Hypa tools | P1 | 2,583 | 58 | 5 | 6 | none | Kei K-series validations | **V** |
| CB-29 | Kei translation tools | P2 | 1,992 | 56 | 4 | 5 | Reference: cache key only | Kei validations | **V** |
| CB-30 | Kei mobile navigation, viewer, text theme, prompt-role compat | P3 | 752 | 60 | 6 | 7 | Reference: home-navigation record not reproducible | Kei validations; home-navigation bug doc | **V** |
| CB-31 | PageFold client request path and credentials | P1 | 3,305 | 128 | 12 | 9 | none | PageFold candidate/prototype/structural validations | **V** |
| CB-32 | PageFold PDF render service and BG render port | P1 | 1,810 | 30 | 6 | 1 | none | PageFold verbatim-copy validations | **V** |
| CB-33 | PageFold offline qualification tooling | P3 | 3,278 | 7 | 3 | 1 | none | structural requalification doc | **V** |
| CB-34 | Usage cost estimate and request-log loading | P2 | 681 | 46 | 8 | 1 | Record 10-17 §4 (display format) | usage-cost validation | **V** |
| CB-35 | Parser, preset and toolchain hardening | P2 | 476 | 29 | 6 | 1 | none | 1.9 parser/preset/toolchain validations | **V** |
| CB-36 | Security sweep of patch-added HTTP routes | P1 | (cross-cut) | — | — | — | none | none | **N** |

Summary: one batch (CB-01) is thorough for its static scope; eight are
partial, and in each of them the investigated part is a few named paths; the
remaining 29 have validation evidence only or nothing. In effective lines,
≈17,100 of ≈59,400 composed production lines sit in batches graded P, and
inside those batches only the named paths were traced; the delivery tool
(CB-01, 4,766 lines) is outside that count.

## 6. Coverage gaps

### 6.1 Structural gaps

1. **No semantic review of composed hotspots.** CI proves that 1,783 units
   apply and revert exactly; nothing checks that, for example, the eleven
   batches editing `DefaultChatScreen.svelte` agree on the send/stop/reroll
   gating, or that the thirteen batches editing `server.cjs` agree on request
   ordering and middleware.
2. **Pack tests do not run the composed target.** 246 of the 344 repository
   tests live in pack test files (the other 98 exercise the delivery tool).
   They assert manifest structure and payload text, compose units against small
   synthetic host files, and in four files load one payload module directly
   (`clientBuildFence.cjs`, `bgPluginDiagnostics.cjs`, `restoreSafety.cjs`, and
   a `vm` sandbox in `toolchain-hardening`). A behavioural regression in the
   composed target is caught only by the embedded suites and probes.
3. **Untested production files.** 113 production files have no direct test
   import, including all of `bgPluginHost/Worker/Sandbox/Session/Storage.cjs`
   (≈2,000 lines that execute user plugin code on the server),
   `bgServerChatProcessClient/Preload.cjs` (the child-process boundary),
   `bgDraftRoutes.cjs`, `bgStreamFetch.ts`, `processzip.ts`, `characterCards.ts`,
   `db.cjs`, `modelBindingResolution.ts` and `modelCredentialResolution.ts`.
4. **1.9-era validations.** Most BG-preserve, backup, build-fence, organizer
   and Kei receipts in `docs/archive/` predate the `v1.10.0` rebase and the
   G1 server-owned paths that now wrap them.
5. **Imported payload provenance.** `bg-preserve.json` cannot be regenerated
   or diffed against its private source here.
6. **Platforms.** WebKit/iPhone, the live deployment host and multi-tab or
   multi-device use were not exercised by the reference investigation.

### 6.2 Execution paths and state interactions not yet examined

- Restart, crash and abort at every durable boundary of the G1 pipeline:
  queued input → drain → assembly → provider → result → commit → publication →
  client adoption → notification ACK. Only the "missing result after restart"
  branch was traced (finding 1).
- Concurrent writers to one chat: browser autosave (`/api/patch`, chat-content
  patch with `x-chat-base-revision`), server-owned commit, trigger/script
  writes (Haejeok ordering), partial edit, translation edits and backup
  restore.
- Server state reset hooks (`server-chat-commit-backup-reset`,
  `-database-remove-reset`, `-save-folder-reset`, `-snapshot-reset`) firing while
  an operation is active.
- Journal and retention capacity limits (`CHAT_JOURNAL_CAPACITY`,
  `DEFAULT_MAX_AWAITING_RECORDS = 128`, retention sweeps, 48-hour result
  horizon versus 49-hour marker horizon).
- Stale client builds writing after a deployment (client build fence) and the
  interaction with BG recovery after reload.
- Cache coherence: startup database cache versus server-side commits; Gemini
  context cache versus credential/preset changes; translation cache versus
  edited messages.
- Untrusted input handling: CharX/ZIP/risum/module archives, plugin code in
  the server sandbox, external request headers forwarded by the proxy and by
  `bgOrchestrator`, PDF rendering and font downloads, very long messages on
  the regex and tokenizer render paths.
- Authentication and parameter validation of every patch-added route.
- Upgrade from earlier installed patcher states and revert after the user has
  edited patched files.

## 7. Prioritized investigation batches

### 7.1 Common protocol for every batch

Unless a batch says otherwise:

- **Environment.** Clone PocketRisu `v1.10.0` (`98e9683`) outside the
  repository, copy it, apply with `node dist/pocketrisu-patcher.cjs apply
  --root <copy> --json` from the cohort commit, then `pnpm install
  --frozen-lockfile`. Run one file with `pnpm vitest run <path>` (client) or
  `pnpm vitest run --config vitest.config.server.ts <path>` (server). Baseline:
  client 2,550/4 skipped, server 663/12 skipped.
- **Read the composed output**, using `git diff` against the pristine tree for
  modified upstream files. Use the manifest only to understand conditional or
  ordering logic. Do not review anchor snapshots or payload pre-images.
- **Reproductions** live in temporary directories or temporary test files in
  the clone. Nothing is added to this repository by an investigation batch.
- **Boundaries.** A unit belongs to exactly one batch (Appendix A rules,
  Appendix B lists). When a flow crosses into a unit owned by another batch,
  treat that unit as a contract: record the assumption and hand it over (§8)
  instead of investigating it.
- **Do not repeat** completed work: findings 1–6 and the "checked and not
  defects" list of the reference report, and the root causes already fixed in
  `2bda466`, `a96becc`, `4ba4c68` and the 2026-10-17 identity repair. A batch
  may re-run their tests as regression context.
- **Output**: one record under `docs/records/` on the batch's own branch, in
  the format of §10.

Effort scale: **S** ≤ half a session; **M** one session; **L** one full
session at the context limit (split at the stated seam if it overruns).

### 7.2 P0 — data integrity, persistence and recovery

#### CB-15 — Server chat persistence

- **Scope**: lazy-chat-sync server side: chat delta, write journal, the
  server chat commit module, and the lazy-chat-sync delta of `server.cjs`.
- **Files**: `server/node/chatDelta.cjs`, `chatWriteJournal.cjs`,
  `serverChatCommit.cjs`; `server.cjs` replacement (+523/−148).
- **Entry points and flows**: `POST /api/chat-content/:chaId/:chatIndex/patch`;
  chat-content full write; `/api/patch` hash check and 409 path;
  `validateStrippedDatabaseTransition`; `CHAT_PAYLOAD_MISSING`;
  `promoteFailedColdStorageStub`/cold-storage restore; journal append →
  apply → acknowledge; startup journal recovery.
- **Interactions**: CB-10 (commit owner consumes `serverChatCommit.cjs`);
  CB-16 (client revision headers and intents); CB-19 (backup export and
  cold-storage splices into `server.cjs`); CB-26/CB-32 (other `server.cjs`
  units).
- **Existing coverage**: V. Record 10-17 §6.2 traced only the 409 loop, whose
  cause was client-side.
- **Tests and reproduction**: `chatDelta.test.ts`, `chatWriteJournal.test.ts`,
  `serverChatCommit.test.ts`; repo `lazy-chat-sync.test.cjs` (static). Kill the
  server between journal append and apply; fill the journal to capacity;
  interleave a patch and a full write for one chat.
- **Effort / risk**: M / data loss, silent divergence between metadata and
  payload.
- **Boundaries**: not the commit-owner modules (CB-10), not backup fragments
  (CB-19), not client code.
- **Completion**: every journal state and transition tabulated with its
  crash-recovery outcome; revision monotonicity and 409 semantics stated for
  each route; capacity-exhaustion behaviour reproduced.

#### CB-16 — Client save pipeline and asset upload retry

- **Scope**: lazy-chat-sync client save paths and the asset upload retry.
- **Files**: `nodeStorage.ts` (+833/−29 replacement and units),
  `risuSave.ts` (+256/−122), `chatStorage.ts`, `autoStorage.ts`,
  `globalApi.svelte.ts` save units, `conflictRebase.ts`, `chatSaveRebase.ts`,
  `chatSaveIntent.ts`, `chatIdentityRepair.ts`, `assetUploadRetry.ts`
  (bg-preserve) and the lazy-chat-bg-adapter `asset-upload-*` units.
- **Entry points and flows**: autosave → `RisuSavePatcher` → `/api/patch` →
  409 → rebase (`mergeThreeWayValue`) → retry/full write;
  `requestChatSaveImpl`, `requestImportedCharacterSaveImpl`,
  `requestImportedModuleSaveImpl`, `lastConfirmedServerDb`,
  `forageStorage.flushDatabase()`; chat save with `x-chat-base-revision` and
  `ChatSaveIntent`; identity repair for missing chat IDs; asset upload retry and
  adaptive backoff.
- **Interactions**: CB-15 (server contracts), CB-17 (startup baseline), CB-18
  (publication ordering), CB-11 (`serverCommittedChatAdoption` in
  `chatStorage.ts`), CB-19 (restore units in `nodeStorage.ts`/`autoStorage.ts`),
  CB-20 (fence units in `nodeStorage.ts`), CB-21 (imported character saves).
- **Existing coverage**: P. `2bda466` restructured the baseline state;
  `a96becc` fixed fresh-install classification; both have tests; `a96becc` is
  not device-checked. The strict statistics `count()` check was kept as an
  invariant (10-17 §8).
- **Tests and reproduction**: the 11 storage tests in Appendix B, including
  `risuSavePatcher.test.ts`, `nodeStorage.chatDelta.test.ts`,
  `globalApi.savePersistence.test.ts`; repo `bg-preserve-asset-upload-retry`.
  Two tabs on one save; offline then online; reload between database patch and
  chat save; rename during rebase.
- **Effort / risk**: L (seam: split `nodeStorage.ts`/`risuSave.ts` from the
  rebase modules) / data loss, permanent conflict loops.
- **Boundaries**: not server code (CB-15), not BG adoption logic (CB-11), not
  bootstrap (CB-17).
- **Completion**: each save route's conflict and retry behaviour tabulated;
  invariants of `RisuSavePatcher` after `2bda466` checked against concurrent
  writers; asset retry termination proven or a defect recorded.

#### CB-10 — Server-owned chat commit and publication

- **Scope**: G1 commit owner, anchor commit, execution projection and the
  publication-write path.
- **Files**: `serverChatCommitOwner.cjs` (1,250), `chatAnchorCommit.cjs`,
  `serverChatExecutionProjection.cjs`; `bgOrchestrator.cjs`
  `server-chat-commit-*` units (start gate, terminal, status, missing, durable,
  running, cancel, delivered); `server.cjs` commit-owner init, startup
  recovery, four reset hooks and owned-root full/patch writes;
  `publication-write` units in `globalApi.svelte.ts`, `chatStorage.ts`,
  `nodeStorage.ts`, `jobRecovery.ts`; `server-chat-snapshot-read`.
- **Entry points and flows**: result ready → commit gate → anchor commit
  (prompt-input change detection) → receipt → publication → client read;
  restart recovery; cancel; reset hooks while active.
- **Interactions**: CB-15 (persistence), CB-09A (input owner hand-off), CB-11
  (client consumes commit responses), CB-19 (backup reset), CB-13 (notices).
- **Existing coverage**: P. The reference read the missing-result response and
  operation metadata as inputs to finding 1. The record 10-18 open item asks
  whether operations left `running` and receipts judged invalid need a
  server-side terminal state; this batch owns that question.
- **Tests and reproduction**: `serverChatCommitOwner.test.ts` (1,511 lines),
  `bgServerChatCommitRoutes.test.ts`, `chatAnchorCommit.test.ts`,
  `serverChatExecutionProjection.test.ts`,
  `nodeStorage.publicationWrite.test.ts`; repo `bg-independent-g1.test.cjs`.
  Restart at each commit stage; trigger a reset hook mid-operation; replay a
  commit request.
- **Effort / risk**: L / duplicated or lost answers, misleading notices.
- **Boundaries**: client hydration and parked-marker handling are CB-11;
  `serverChatCommit.cjs` internals are CB-15.
- **Completion**: commit state machine with all transitions and restart
  outcomes; receipt creation/validation rules stated, including what produces
  `commit-receipt-invalid`; idempotency under replay shown.

#### CB-11 — Client recovery, hydration and terminal states

- **Scope**: everything the browser does to recover, adopt and terminate BG
  operations, except the branch covered by finding 1.
- **Files**: `bgOrchestrate.ts` (109 recovery units, incl. the 472-line
  `server-commit-client-hydration`), `bgServerCommitHydration.ts`,
  `recovery-terminal-client.cjs`/`recovery-readiness-client.cjs` output,
  `bgFinishedOperation.ts`, `bgReconciliation.ts`, `bgRecoveryRead.ts`,
  `bgDurableSaveBarrier.ts`, `bgClientInputRecovery.ts`,
  `bgOrchestrationPending.ts`, `generationBusy.ts`, `generationState.ts`,
  `bgStreamPreserve.svelte.ts` units, `suggestionRequestOwner.ts`,
  `Suggestion.svelte`, `chatStorage.ts` adoption units.
- **Entry points and flows**: watch and boot found-result branches; ownership
  fences; `server-chat-commit-client-negotiate` and replay ambiguity;
  `wakeParkedRecoveries` for states other than the four orphaned ones;
  suggestion request recovery; legacy save failure; multi-tab ownership.
- **Interactions**: CB-10 (response shapes), CB-04 (bg-preserve pending
  store), CB-13 (notices), CB-16 (adoption into the save pipeline).
- **Existing coverage**: P, deep on one branch. Do not repeat the finding-1
  matrix; its listed regression checks (`chat-committed`, `input-*`,
  `anchoredCommitConflictNotice`) are a starting point, not completed work.
- **Tests and reproduction**: 13 tests incl. `bgFinishedOperationFlow.test.ts`
  (1,560 lines) and `serverCommittedChatAdoption.test.ts`; probes
  `probe-bg-client-recovery.mjs`, `probe-bg-recovery-timing.mjs`,
  `probe-bg-failure-ui.mjs`.
- **Effort / risk**: L (seam: hydration/adoption vs. suggestion and input
  recovery) / duplicated messages, endless re-polling, wrong notices.
- **Boundaries**: server-side state is CB-10; notice text and delivery CB-13.
- **Completion**: a state × path table for every operation state the server
  can return, for legacy and server-owned shapes, watch and boot, with
  observed outcomes; each parked/retained state has a proven exit.

#### CB-09A — Server-owned input admission and execution (server)

- **Scope**: the server half of G1 input: admission, queue, drain, transform,
  settings and assembly context, child-process boundary, failed-input
  settlement.
- **Files**: `serverChatInputOwner.cjs` (1,998), `serverChatInputDrain.cjs`,
  `serverChatInputTransform.cjs`, `serverChatSettingsContext.cjs`,
  `serverChatAssemblyContext.cjs`, `chatInputAttach.cjs`,
  `bgFailedInputSettlement.cjs`, `bgServerChatProcessClient.cjs`,
  `bgServerChatProcessPreload.cjs`; `bgOrchestrator.cjs` `server-input-*`,
  queue, input-execution and assembly units; `model-jobs.cjs` and
  `bgOrchestrationRunRegistry.cjs` queue units.
- **Entry points and flows**: `POST /api/bg-orchestrate-input/…`,
  `GET /api/bg-orchestrate-input-base/…`, `GET /api/bg-orchestrate-chat-state/…`,
  `GET /api/bg-chat-activity/…`; admission → queue → drain → transform →
  assembly → provider start marker → terminal/retryable finish; cancel
  tombstone versus active cancel; retention sweep; capacity settle.
- **Interactions**: CB-09B (client contract), CB-10 (commit hand-off), CB-12
  (plugin admission inside assembly), CB-14 (request policy), CB-26 (external
  headers in the server fetch).
- **Existing coverage**: P. Record 10-16 (read-only variable access during
  assembly) and record 10-17 (projection 503 on duplicated message IDs).
- **Tests and reproduction**: 10 server tests incl.
  `serverChatInputOwner.test.ts` (1,845 lines) and
  `bgServerChatProcessBoundary.test.ts`; probes `probe-bg-queue.mjs`,
  `probe-bg-native-input.mjs`. Concurrent inputs to one chat; cancel during
  drain; child-process crash; restart while queued.
- **Effort / risk**: L (seam: owner/drain vs. process boundary) / lost or
  duplicated inputs, token cost.
- **Boundaries**: commit and publication are CB-10; client UI is CB-09B.
- **Completion**: queue and input state machine with crash outcomes; cancel
  races resolved; process-boundary failure modes listed with observed results.

#### CB-19 — Server backup snapshot and restore safety

- **Scope**: backup snapshot and source, export/save fragments spliced into
  `server.cjs`, maintenance gate, restore safety (server and client), backup UI.
- **Files**: `backupSnapshot.cjs`, `backupSource.cjs`, `db.cjs`,
  `restoreSafety.cjs`, `src/ts/storage/restoreSafety.ts`; 26 `server.cjs`
  units (settings/download export +132/−127, server-save export +172/−99,
  cold storage, maintenance gate); `SystemBackup.svelte`,
  `ServerBackupList.svelte`, `backuplocal.ts`, `autoStorage.ts` and
  `nodeStorage.ts` restore units.
- **Entry points and flows**: create snapshot → list → download/export →
  restore under maintenance gate → resume writes; local backup import.
- **Interactions**: CB-15 (journal and cold storage), CB-10 (commit-owner reset
  hooks), CB-16 (client writes during restore), CB-20 (pinned build source),
  CB-21/CB-23 (their backup UI units).
- **Existing coverage**: V (1.9 receipts).
- **Tests and reproduction**: `backupSnapshot.test.ts`, `backupSource.test.ts`,
  `restoreSafety.test.ts` (server and client),
  `test/compat/backup-point-in-time.test.ts`; repo
  `server-backup-snapshot.test.cjs`, `kei-backup-restore-safety.test.cjs`. Write
  during snapshot; restore while a BG operation runs; interrupted restore.
- **Effort / risk**: M / data loss on restore, inconsistent snapshots.
- **Boundaries**: not the persistence internals (CB-15).
- **Completion**: point-in-time consistency argued or refuted with a
  reproduction; every restore failure point leaves a recoverable state.

#### CB-05 — BG server orchestrator lifecycle

- **Scope**: the bg-preserve server base and its adaptations.
- **Files**: `bgOrchestrator.cjs` (bg-preserve owned body), result delivery,
  result retention (both owners), run registry, abort context, global
  variables, operation store (beyond the orphaned-state mapping),
  `bgRequestLogBridge.cjs`, `bgOrchBundle.build.cjs` (input list and output
  contract), `server.cjs` route registration; adaptations in
  `patches/bg-preserve/manifest.cjs`.
- **Entry points and flows**: `POST /api/bg-orchestrate`, status/result/delete
  routes, capabilities, `POST /api/bg-preserve-signal`, sub-result routes;
  cloned-database run (`nodeOnlyServerSideRequests = false`); bundle build and
  load.
- **Interactions**: every LCBG batch hooks this file (CB-09A, 10, 11, 12, 13,
  14), plus CB-32.
- **Existing coverage**: P (orphaned-state mapping and marker horizon).
- **Tests and reproduction**: `bgOrchestrationResultRetention.test.ts`,
  `bgRequestLogBridge.test.ts`, client-side bg-preserve tests under CB-04; repo
  `bg-preserve.test.cjs`, `kei-bg-result-retention.test.cjs`,
  `kei-bg-native-logging.test.cjs`, `kei-bg-g06-matrix.test.cjs`. CI builds the
  bundle; build it in the clone and diff its module list against the files it
  claims to bundle.
- **Effort / risk**: M / orphaned runs, retention leaks.
- **Boundaries**: LCBG units in the same files belong to their own batches.
- **Completion**: lifecycle of a run from POST to retention expiry with every
  terminal path; bundle inputs and Node/browser API assumptions listed.

#### CB-02 — Composition integrity of shared hotspots

- **Scope**: semantic interaction between units of different batches inside
  the hotspot files of §3.3; the nine ordered collisions; bg-preserve hooks
  applied with `anchorPolicy: 'first'`; localisation key collisions across
  nine packs; generated return semantics.
- **Files**: composed `server.cjs`, `globalApi.svelte.ts`,
  `DefaultChatScreen.svelte`, `bgOrchestrator.cjs`, `database.svelte.ts`,
  `en.ts`/`ko.ts`, `nodeStorage.ts`, `request.ts`, `index.svelte.ts`,
  `bgOrchestrate.ts`, `Chat.svelte`, `App.svelte`; `pnpm-lock.yaml`.
- **Entry points and flows**: Send, Stop, reroll, edit and autosave as seen
  through all gates in `DefaultChatScreen.svelte`; Express middleware order and
  route shadowing in `server.cjs`; database defaults and migrations in
  `database.svelte.ts`.
- **Interactions**: all batches; produces the hotspot map they reuse.
- **Existing coverage**: V, mechanical only.
- **Tests and reproduction**: repo `capability-return.test.cjs`,
  `compose.test.cjs`; `scripts/audit-generated-markers.cjs`; `pnpm check`
  output in the clone.
- **Effort / risk**: M / cross-pack regressions that no single pack test sees.
- **Boundaries**: reads each unit only as far as needed to establish the
  interaction; the unit's own correctness stays with its batch.
- **Completion**: for each hotspot, a table of gates/handlers in execution
  order with owning unit; every unit that relies on `anchorPolicy: 'first'`
  confirmed to hit the intended occurrence; duplicate localisation keys listed;
  `pnpm check` warnings triaged.

#### CB-18 — Haejeok persistence-ordering adapter

- **Scope**: message/plugin persistence ordering for script, trigger, command
  and plugin writes.
- **Files**: `chat-save-publication-units.cjs` output,
  `haejeokPersistenceSafety.ts`, units in `scriptings.ts`, `triggers.ts`,
  `command.ts`, `plugins.svelte.ts`, `DevTool.svelte`, `Chat.svelte`,
  `DefaultChatScreen.svelte`, `globalApi.svelte.ts`, `database.svelte.ts`.
- **Entry points and flows**: trigger or Lua script mutating messages or
  variables → publication through the strict save owner; plugin chat writes;
  DevTool edits.
- **Interactions**: CB-16 (save pipeline), CB-10 (server-owned commit while a
  browser trigger writes), CB-09B (`getvar`/`setvar`).
- **Existing coverage**: V.
- **Tests and reproduction**: `haejeokPersistenceSafety.test.ts`,
  `chatSaveCallerPublication.test.ts`, `triggerVariableCompatibility.test.ts`;
  repo `haejeok-persistence-safety.test.cjs`.
- **Effort / risk**: S / lost script state, ordering inversions.
- **Boundaries**: save-pipeline internals are CB-16.
- **Completion**: every caller that publishes chat changes listed with its
  ordering guarantee; at least one concurrent BG case reproduced.

### 7.3 P1 — generation correctness, security boundaries, data-mutating import

#### CB-09B — Server-owned input admission, send and settlement (client)

- **Scope**: client admission and send for server-owned inputs, pending-input
  UI, draft identity, failed-input settlement, read-only variable access.
- **Files**: `bgServerInputClient.ts`, `-Ledger`, `-Admission`, `-Adoption`,
  `-Start`, `-ProviderPolicy`, `bgServerPendingProjection.ts`,
  `ServerPendingInputs.svelte`, `bgDraftIdentity.ts`,
  `bgFailedInputSettlement.ts`, `chatVar.svelte.ts`; units in
  `DefaultChatScreen.svelte` (18), `bgOrchestrate.ts` (11), `Chat.svelte`,
  `Chats.svelte`, `chatDraft.ts`, `command.ts`, `globalApi.svelte.ts`.
- **Entry points and flows**: ordinary Send, expanded-composer Send, Stop,
  queue editing; provider policy choosing server-owned versus client-owned
  model jobs; draft persistence across reload.
- **Interactions**: CB-09A, CB-11, CB-13, CB-20 (fence on drafts).
- **Existing coverage**: P (records 10-16, 10-17). The 10-17 report of a
  non-working circular Stop control should be re-checked against the current
  revision; `4ba4c68` is not device-checked.
- **Tests and reproduction**: 14 tests incl. `bgCapabilityAdmissionFlow.test.ts`,
  `bgServerInputClient.test.ts`, `commandVariableRead.test.ts`; probes
  `probe-bg-cap-admission.mjs`, `probe-bg-native-input.mjs`,
  `probe-bg-failure-ui.mjs`.
- **Effort / risk**: M / unsendable chats, wrong path selection, token cost.
- **Boundaries**: server state is CB-09A; recovery after reload CB-11.
- **Completion**: Send/Stop/queue flows traced through every gate with the
  CB-02 hotspot map; provider-policy decision table verified.

#### CB-12 — BG plugin host, worker and sandbox

- **Scope**: server-side execution of user plugins for BG: host, worker,
  sandbox, session, storage, value marshalling, eligibility, unavailability,
  diagnostics; client bindings and capability.
- **Files**: `bgPluginHost.cjs` (711), `bgPluginWorker.cjs` (779),
  `bgPluginSandbox.cjs`, `bgPluginSession.cjs`, `bgPluginStorage.cjs`,
  `bgPluginValue.cjs`, `bgPluginMetadata.cjs`, `bgPluginEligibility.cjs`,
  `bgPluginUnavailable.cjs`, `bgPluginDiagnostics.cjs`,
  `BgPluginDiagnostics.svelte`, `bgPluginBindings.ts`,
  `bgServerPluginCapability.ts`, `apiV3/factory.ts`, plugin units in
  `bgOrchestrator.cjs` (37), `server.cjs`, `DefaultChatScreen.svelte`,
  `bgOrchestrate.ts`, `request.ts`, `pluginChatAccess.ts`, `RequestLogs.svelte`.
- **Entry points and flows**: plugin admission during assembly → session →
  worker spawn → local RPC → capability calls → settlement → teardown;
  `GET /api/bg-plugin-diagnostics`.
- **Interactions**: CB-09A (assembly), CB-17 (plugin chat access), CB-36
  (diagnostics route), CB-32 (PageFold render port used by plugins).
- **Existing coverage**: V. 12 of 22 production files have no embedded test.
- **Tests and reproduction**: `bgPluginEligibility.test.ts`,
  `bgPluginUnavailable.test.ts`, `bgServerPluginCapability.test.ts`; repo
  `g22a-capability.test.cjs`; 13 `probe-bg-plugin-*` scripts and
  `probe-bg-marp-*` (some need Linux/systemd or privately supplied plugin
  sources).
- **Effort / risk**: L (seam: host/session vs. worker/sandbox) / sandbox
  escape, resource exhaustion, hung settlements.
- **Boundaries**: the assembly that decides admission is CB-09A.
- **Completion**: trust boundary documented (what plugin code can reach);
  every RPC method's validation checked; timeout, crash and oversized-payload
  behaviour reproduced with the synthetic probes.

#### CB-36 — Security sweep of patch-added HTTP routes

- **Scope**: the guard layer of every route listed in §3.3: authentication
  middleware, path-parameter validation (IDs used to build storage keys or
  file paths), body-size limits, method/CSRF exposure, error leakage.
- **Files**: route registrations in `server.cjs`, `bgOrchestrator.cjs`,
  `serverChatInputOwner.cjs`, `bgDraftRoutes.cjs`, `bgGeminiCacheRoutes.cjs`,
  `externalRequestHeaders.cjs`, `pageFoldRenderRoute.cjs`, `request-logs.cjs`,
  `clientBuildFence.cjs`.
- **Entry points and flows**: every route in §3.3: a request without a
  session; a request with a session for another character or chat; malformed,
  encoded or traversal-shaped IDs reaching storage lookups; oversized and
  malformed bodies reaching the parsers.
- **Interactions**: every server batch; findings in a route's business logic
  are handed to the owning batch.
- **Existing coverage**: N.
- **Tests and reproduction**: route-level supertest-style requests in the clone
  without a session; oversized and malformed bodies.
- **Effort / risk**: M / unauthenticated access to chats or credentials.
- **Boundaries**: the business logic behind each route belongs to the owning batch.
- **Completion**: a route table (method, path, guard, validated params, body
  limit) with every row checked.

#### CB-17 — Startup cache, bootstrap and plugin chat access

- **Scope**: startup database cache, bootstrap replacement, lazy chat access
  for plugins, missing-payload notice.
- **Files**: `startupDatabaseCache.ts` (742), `bootstrap.ts` (+63/−10),
  `pluginChatAccess.ts`, `v3.svelte.ts` (+165/−50), `risuai.d.ts`,
  `DefaultChatScreen.svelte` missing-payload unit.
- **Entry points and flows**: cold start with cache hit, miss and stale cache;
  fresh install (the `a96becc` path); `getDatabase`/`getDatabaseMetadata` and
  `hydrateChat` from plugins; opening a chat whose payload is missing.
- **Interactions**: CB-16, CB-10 (server-side commits invalidating the cache),
  CB-12, CB-25B/CB-30 (their bootstrap units).
- **Existing coverage**: P (fresh-install bootstrap).
- **Tests and reproduction**: `startupDatabaseCache.test.ts`,
  `bootstrap.freshDatabase.test.ts`, `pluginChatAccess.test.ts`; repo
  `startup-cache-observability.test.cjs`.
- **Effort / risk**: M / stale chats shown, plugin writes to unhydrated chats.
- **Boundaries**: the save pipeline is CB-16; the plugin host CB-12.
- **Completion**: cache validity rules stated and tested against a server-side
  commit made while the browser was closed.

#### CB-04 — BG client orchestration core

- **Scope**: bg-preserve client orchestration other than recovery.
- **Files**: `bgOrchestrationStart/Merge/Ordering/Delivery/Result/Stats/
  Globals/Policy/Fallback/RetentionState.ts`, `bgResponseAck.ts`,
  bg-preserve units in `index.svelte.ts` (orchestrate redirect, preview LLM,
  generation context, unified busy guard, direct send lifecycle, no-orchestration
  recursion guards), `generationState.ts`, `globalApi.svelte.ts` durable-save
  API, `DefaultChatScreen.svelte` gates, `command.ts`/`multisend.ts`/`v3.svelte.ts`
  no-orchestration guards, `google.ts`/`request.ts` sub-key forwarding.
- **Entry points and flows**: Send → redirect → start → server POST →
  delivery → merge into chat with concurrent edits; reroll/unreroll during
  orchestration; auto-continue and resend recursion.
- **Interactions**: CB-05, CB-11, CB-09B, CB-02.
- **Existing coverage**: V.
- **Tests and reproduction**: 17 bg-preserve tests incl.
  `bgOrchestrationMerge.test.ts`, `bgOrchestrationDelivery.test.ts`,
  `directGenerationLifecycle.test.ts`.
- **Effort / risk**: M / merged answers overwriting edits, double generation.
- **Boundaries**: recovery and hydration are CB-11; Gemini units in `globalApi.svelte.ts` CB-07; the server side CB-05.
- **Completion**: merge rules tabulated for each concurrent-edit case; every
  gate's busy state shown to clear on all terminal paths.

#### CB-06 — BG stream preservation and proxy stream lifecycle

- **Scope**: bg-preserve stream preservation: server stream jobs and drafts, client stream fetch, preserve and recovery, and the proxy stream lifecycle in `server.cjs`.
- **Files**: `bgStreamJob.cjs`, `bgStreamReader.cjs`, `bgDraftRoutes.cjs`,
  `bgStreamFetch.ts`, `bgStreamPreserve.svelte.ts`, `bgStreamRecovery.ts`,
  `BgRestoreBanner.svelte`, `App.svelte` banner units, `proxyJobWs.ts`,
  `server.cjs` proxy client-close/response-pipeline/stream-cancel units.
- **Entry points and flows**: `POST /api/bg-stream-job`, draft routes,
  sub-result routes; browser closes mid-stream → server continues → draft saved
  → reopen → banner → restore; user cancel versus disconnect; WebSocket chunk
  offsets and done byte count.
- **Interactions**: CB-05, CB-11, CB-20 (fence units in `bgStreamFetch.ts`),
  CB-36.
- **Existing coverage**: V. `bgDraftRoutes.cjs` and `bgStreamFetch.ts` have no
  direct test.
- **Tests and reproduction**: `bgStreamReader.test.ts`, `bgStreamRecovery.test.ts`;
  repo `bg-preserve.test.cjs`.
- **Effort / risk**: M / lost partial answers, phantom streams.
- **Boundaries**: result merge into the chat is CB-04; lazy-chat-bg-adapter stream-preview units are CB-13; fence units in `bgStreamFetch.ts` are CB-20.
- **Completion**: disconnect/cancel matrix reproduced; draft lifecycle has a
  bounded cleanup.

#### CB-14 — Request policy, model binding and native job recovery identity

- **Scope**: how a request picks its preset, model, credentials and native job identity, on the direct and the server-owned path.
- **Files**: `modelBindingResolution.ts`, `modelCredentialResolution.ts`,
  `modelRequestSelection.ts`, `modelPresetBinding.ts` units,
  `bgServerInputExecution.ts`, `buildRequest.ts`, `stableDiff.ts`, `jobRecovery.ts`
  (13 units incl. recovered-message metadata/usage), `request.ts` (11 units),
  `scriptings.ts` units, `bgOrchestrator.cjs` native-input units.
- **Flows**: preset/model binding → credential selection → request build →
  native job → recovery identity on reload.
- **Interactions**: CB-09A/B, CB-31 (PageFold binding units in the same files),
  CB-34 (usage metadata), CB-20 (fence units in `jobRecovery.ts`).
- **Existing coverage**: P (record 10-17 identity repair).
- **Tests**: `jobRecovery.test.ts`, `jobRecoveryIdentity.test.ts`,
  `modelRequestSelection.test.ts`.
- **Effort / risk**: S / wrong credential or model used, duplicate recovery.
- **Boundaries**: PageFold units in the same files are CB-31; usage capture is CB-34; the server input pipeline is CB-09A.
- **Completion**: decision table for binding and credential resolution,
  including missing and conflicting bindings.

#### CB-20 — Client build fence and handshake

- **Scope**: the client/server build-identity fence that refuses writes from stale clients, and its three adapters.
- **Files**: `clientBuildFence.cjs` (middleware and writer fence),
  `clientBuildHandshake.ts`, `clientBuild.ts`, `vite.config.ts`,
  `vite-env.d.ts`, `jobFetch.ts`, `pendingSends.ts`; fence units in
  `generationState.ts`, `chatDraft.ts`, `nodeStorage.ts`, `globalApi.svelte.ts`,
  `jobRecovery.ts`, `bgOrchestrate.ts`, `bgStreamFetch.ts`,
  `bgStreamPreserve.svelte.ts`, `SystemBackup.svelte`, `SystemDashboard.svelte`,
  `InlayCompressButton.svelte`, `DefaultChatScreen.svelte`; the three adapter packs.
- **Flows**: build ID injection → handshake → writer fence on each write →
  stale tab after deployment → refusal and recovery.
- **Interactions**: CB-16, CB-06, CB-11, CB-19, CB-26 (writer fence unit),
  CB-13 (notification unit).
- **Existing coverage**: V (1.9).
- **Tests**: `clientBuildFence.test.ts`, `clientBuildHandshake.test.ts`,
  `chatDraftClientBuild.test.ts`; repo `client-build-fence.test.cjs`.
- **Effort / risk**: S / stale clients writing old shapes, or false lock-out.
- **Boundaries**: the write paths themselves belong to their batches; only the fence decision and its handling are here.
- **Completion**: every write path classified as fenced or intentionally
  unfenced; stale-tab reproduction recorded.

#### CB-21 — Character/module import and CharX archive integrity

- **Scope**: import of characters, modules and CharX/risum archives, and the archive integrity layer.
- **Files**: `characterCards.ts` (composed +286/−135 from the replacement and units of three packs),
  `characterImportState.ts`, `CharacterImportToast.svelte`, `moduleImport.ts`,
  `risumImport.ts`, `processzip.ts`, `modules.ts` units, `characterPackage.ts`,
  `charxArchive.ts`, `charxImportSession.ts`, `public/sw.js`, `update.ts`,
  `ModuleSettings.svelte`, `App.svelte`, backup UI units, dependency additions.
- **Flows**: file pick → archive parse → assets → character/module creation →
  save through `requestImportedCharacterSave`; module share service worker.
- **Interactions**: CB-16, CB-08 (regex import merge), CB-19, CB-35 (lockfile).
- **Existing coverage**: V.
- **Tests**: `charxArchive.test.ts`, `charxImportSession.test.ts`,
  `moduleImport.test.ts`, `risumImport.test.ts`, `characterImportState.test.ts`,
  `moduleShareServiceWorker.test.ts`; repo `character-import-ux`,
  `charx-archive-integrity`.
- **Effort / risk**: M / malformed or hostile archives, partial imports.
- **Boundaries**: save internals are CB-16; regex import merge is CB-08; backup semantics are CB-19.
- **Completion**: archive limits (entry count, size, nesting, names) stated and
  probed with crafted files; partial-failure cleanup verified.

#### CB-26 — External request headers

- **Scope**: user-configured extra headers for outbound provider requests: storage, editor, and application in proxied and server-side fetches.
- **Files**: `externalRequestHeaders.cjs`, `ExternalHeadersSetting.svelte`,
  `PersonalSettings.svelte` units, `server.cjs` units (init, proxy form body,
  proxy fetch write/get, local stream), `clientBuildFence.cjs` writer-fence unit,
  `bgOrchestrator.cjs` external-header units.
- **Flows**: `GET|PUT /api/external-request-headers` → stored rules → applied
  to proxied and server-side provider requests.
- **Interactions**: CB-05/CB-09A (server fetch), CB-36.
- **Existing coverage**: V (G1-11).
- **Tests**: `externalRequestHeaders.test.ts`,
  `externalRequestHeadersProcess.test.ts`.
- **Effort / risk**: S / credential leakage to unintended hosts, header
  injection, overriding authentication headers.
- **Boundaries**: the route guard layer is CB-36; the general proxy stream lifecycle is CB-06.
- **Completion**: host matching, header-name/value validation and precedence
  over provider headers verified.

#### CB-27 — Kei SSE stream parser and provider stream adapters

- **Scope**: SSE framing and the replaced OpenAI and Google stream parsers.
- **Files**: `keiSseStream.ts`; whole-function replacements of the OpenAI
  (+132/−134) and Google (+105/−74) stream parsers.
- **Flows**: provider SSE bytes → event framing → deltas → final message;
  split UTF-8 sequences, CRLF, comments, `[DONE]`, error events mid-stream.
- **Interactions**: CB-13 (stream-preview units in the same files), CB-07
  (Gemini units in `google.ts`), CB-04.
- **Existing coverage**: V.
- **Tests**: `keiSseStream.test.ts`, `google.stream.test.ts`,
  `requests.stream.test.ts`.
- **Effort / risk**: S / truncated or corrupted answers.
- **Boundaries**: stream-preview relay units are CB-13; Gemini cache units CB-07; BG sub-key forwarding CB-04.
- **Completion**: framing edge cases fuzzed; parity with the replaced upstream
  parsers documented.

#### CB-28 — Kei chat render, partial edit and Hypa tools

- **Scope**: message rendering helpers, partial message editing and the manual Hypa V3 summary tools, with their BG adapters.
- **Files**: `PartialEditManager.svelte` (973), `keiPartialEditIdentity.ts`,
  `keiChatRender.ts`, `ChatBody.svelte`/`Chats.svelte`/`Chat.svelte`/
  `DefaultChatScreen.svelte` units, `HypaV3Modal.svelte` and its parts,
  `KeiHypaManualSummaryPanel.svelte` (590), `keiHypaManualSelection.ts`.
- **Flows**: partial edit of a message (identity tracking across re-renders and
  BG updates); manual Hypa summary selection and write-back; render of long
  messages.
- **Interactions**: CB-16 (writes), CB-11/CB-13 (BG updates while editing),
  CB-29 (`ChatBody.svelte`), the 10-18 stuck-view record (render path).
- **Existing coverage**: V.
- **Tests**: `PartialEditManager.test.ts`, `keiPartialEditIdentity.test.ts`,
  `keiChatRender.test.ts`, `KeiHypaManualSummaryPanel.test.ts`,
  `keiHypaManualSelection.test.ts`.
- **Effort / risk**: M / edits applied to the wrong message, lost summaries.
- **Boundaries**: translation units in `ChatBody.svelte` are CB-29; save internals CB-16.
- **Completion**: edit identity proven stable under message insertion,
  deletion and BG commit; Hypa write-back conflicts reproduced or ruled out.

#### CB-31 — PageFold client request path and credentials

- **Scope**: the PageFold ModelPreset transform on the client: resolution, budget, transcript, Gemini wire format, failure policy, credentials and UI.
- **Files**: `src/ts/pagefold/*` (15 modules), `serviceAccount.ts`,
  `serviceAccountImport.ts`, `CredentialField.svelte`, PageFold units in
  `request.ts` (28), `index.svelte.ts` (9), `modelPresetBinding.ts`,
  `googleGemini.ts`, `types.ts`, `tokenizer.ts`, `requestLog.ts`,
  `database.svelte.ts`, `preset/types.ts`, `dbDefaults.ts`, settings and
  sidebar components.
- **Flows**: preset resolve → budget → canonical transcript → render port →
  qualified route → Gemini wire request → failure policy; service-account
  import and token use; redaction in logs.
- **Interactions**: CB-32, CB-14, CB-07, CB-34.
- **Existing coverage**: V.
- **Tests**: 12 PageFold tests.
- **Effort / risk**: M / credential exposure, cost overruns, wrong transcript.
- **Boundaries**: server rendering is CB-32; offline tooling CB-33; generic request policy CB-14.
- **Completion**: credential lifetime and redaction verified end to end;
  budget and failure-policy limits shown to bound cost.

#### CB-32 — PageFold PDF render service and BG render port

- **Scope**: server-side PDF rendering for PageFold, its fonts, request-log redaction and the BG render port.
- **Files**: `pageFoldRenderRoute.cjs`, `pageFoldPdfService.cjs`,
  `pageFoldPdfWorker.cjs`, `pageFoldPdfReader.cjs`, `pageFoldFontCache.cjs`,
  `pageFoldRequestLogRedaction.cjs`, `pageFoldBgRenderPort.cjs`; units in
  `server.cjs` (binary body limit), `request-logs.cjs`, `bgOrchestrator.cjs`;
  `pdf-lib`/fontkit dependency additions.
- **Flows**: `/api/pagefold/render` → worker → PDF → read-back check; font
  download and cache; BG render port.
- **Interactions**: CB-31, CB-05, CB-36, CB-35 (lockfile).
- **Existing coverage**: V.
- **Tests**: 6 server tests.
- **Effort / risk**: M / resource exhaustion on the self-hosted server, font
  cache poisoning.
- **Boundaries**: client transcript and request are CB-31; route guards CB-36.
- **Completion**: input size, page count, time and memory limits verified;
  font integrity (pinned hashes) enforced on every load path.

#### CB-22 — FastImport iOS picker and migration script

- **Scope**: the FastImport plugin picker on iOS and the operator migration script for its stored plugin data.
- **Files**: `fastImportIOSPicker.ts`, `plugins.svelte.ts` units,
  `scripts/fastimport-ios-migration.cjs` (read-only by default, writes a user
  SQLite database with `--apply`).
- **Entry points and flows**: picker → plugin storage; `node scripts/fastimport-ios-migration.cjs --database PATH --target-root PATH [--apply]`.
- **Interactions**: CB-21 (character import flow); CB-18 (its units share `plugins.svelte.ts`).
- **Existing coverage**: V.
- **Tests**: `fastImportIOSPicker.test.ts`; repo `fastimport-ios-migration`,
  `fastimport-ios-picker`.
- **Effort / risk**: S / corruption of a user database by `--apply`.
- **Boundaries**: general plugin loading is upstream; Haejeok units in `plugins.svelte.ts` are CB-18.
- **Completion**: `--apply` shown to be atomic and idempotent on a copy;
  refusal paths for unexpected schemas verified.

#### CB-07 — Gemini context cache, cache telemetry and tokenizer fallback

- **Scope**: bg-preserve's Gemini context-cache safety and telemetry, cache-source badges, and the tokenizer fallback.
- **Files**: `geminiContextCache.ts` (11 units), `geminiCacheWiring.ts`
  (18 units), `googleGemini.ts`/`types.ts`/`request.ts` cache units,
  `globalApi.svelte.ts` Gemini main branch, `bgGeminiCacheRoutes.cjs`,
  `GeminiCacheStatus.svelte`, `geminiCacheTelemetry.ts`, `tokenizer.ts` units,
  `tikFallback.ts`; provenance check of the vendored `jsTiktokenLite.js` and
  `base64-js.cjs`.
- **Flows**: cache create/extend/hit/reject; credential-scoped disable (403);
  bounded session state; tokenizer failure fallback.
- **Interactions**: CB-27, CB-31, CB-34, CB-05.
- **Existing coverage**: V. The tokenizer on the render path is an open
  prevention lead (10-18 §7).
- **Tests**: `bgGeminiCacheSafety.test.ts`, `bgGeminiCacheTelemetry.test.ts`.
- **Effort / risk**: S / paid cache reuse across credentials or chats.
- **Boundaries**: PageFold Gemini units are CB-31; usage accounting CB-34; stream parsing CB-27.
- **Completion**: cache key and scope rules stated; reuse after credential or
  preset change ruled out by reproduction; vendored files matched to a named
  upstream version.

### 7.4 P2 — feature logic

#### CB-13 — BG notifications, operation notices, request progress, stream preview

- **Scope**: what tells the user what a BG operation is doing or did: notifications, operation notices, progress, stream preview, browser message effects.
- **Files**: `bgNotifications.cjs/.ts`, `bgOperationNotices.cjs`,
  `BgNotificationDelivery.svelte`, `bgRequestProgress.ts`, `RequestStatusToast*`,
  `requestStatus.ts` units, `bgStreamPreview.cjs/.ts`, `bgStreamingScheduler.cjs`,
  `ServerStreamPreview.svelte`, `bgBrowserMessageEffects.ts`,
  `bgChatActivity.ts`, `bgCancelledInputSettlement.ts`,
  `bgOrchestrationStartDiagnostic.ts`, `bgServerInputSettingsSave.ts`,
  `publicationSaveNotice.ts`, `alert.ts`; 58 units in `bgOrchestrate.ts` and 23
  in `bgOrchestrator.cjs`.
- **Flows**: `POST /api/bg-notifications/claim|ack`; notice creation on each
  terminal state; progress relay; preview polling and scheduling.
- **Interactions**: CB-10/CB-11 (which notices fire), CB-20, CB-36.
- **Existing coverage**: V.
- **Tests**: 15 tests; probes notifications, stream preview, failure UI.
- **Effort / risk**: M / duplicate or missing notices, preview shown in the
  wrong chat.
- **Boundaries**: which terminal state is reached is decided in CB-10/CB-11; this batch checks the user-visible outcome.
- **Completion**: claim/ACK race across two tabs reproduced; notice table per
  terminal state cross-checked with CB-10/CB-11 tables.

#### CB-08 — bg-preserve auxiliary features

- **Scope**: features carried in the bg-preserve payload that are not BG orchestration.
- **Files**: regex multi-direction units (`database.svelte.ts` field,
  `RegexData.svelte`, `scripts.ts` mode helper/export split/import merge/cache
  key/execute mode, `translator.ts` regex units), `risuControlTouch.ts` and the
  `Chat.svelte` touch bridge, `moduleSelectionCache.ts` and `modules.ts`
  source-aware cache units, `requestStatus.ts` relay units,
  `DefaultChatScreen.svelte` accessibility and completion-sound units.
- **Entry points and flows**: regex script import/export and per-mode execution; RisuControl touch events; module selection cache lookup and refresh; request-status relay ticks.
- **Interactions**: CB-21 (module and regex import), CB-29 (translator), CB-02 (`Chat.svelte`, `DefaultChatScreen.svelte`).
- **Existing coverage**: V. The per-message regex on very long input is an
  open prevention lead (10-18 §7).
- **Tests**: `regexImportMultiplicity.test.ts`, `risuControlTouch.test.ts`,
  `moduleSelectionCache.test.ts`; repo `kei-regex-import-multiplicity`.
- **Effort / risk**: S / render freezes, regex import duplication.
- **Boundaries**: the upstream regex engine; Kei translator units are CB-29.
- **Completion**: regex execution cost on a 50k-character single line measured;
  module cache invalidation verified.

#### CB-23 — Persona organizer

- **Scope**: persona folders, gallery, editor layout and persona image handling.
- **Files**: `PersonaSettings.svelte` (near-rewrite), `listedPersona.svelte`,
  `persona.ts`, `personaOrganizer.ts`, `personaImages.ts`; units in
  `database.svelte.ts`, `globalApi.svelte.ts`, `server.cjs`, `risuai.d.ts`,
  `backuplocal.ts`.
- **Flows**: folder create/move/delete with members; persona image asset
  references through export, backup and restore; persona binding when a
  persona is moved or deleted.
- **Interactions**: CB-16 (save), CB-19 (backup and restore units), CB-17 (plugin API types).
- **Existing coverage**: V (10-17 §3 was feature work).
- **Tests**: `personaOrganizer.test.ts`, `personaImages.test.ts`,
  `test/compat/persona-assets-1.10.test.ts`; repo `persona-ui` (static).
- **Effort / risk**: M / orphaned personas or images.
- **Boundaries**: backup mechanics are CB-19; the save pipeline CB-16.
- **Completion**: folder and asset invariants stated and checked after each
  operation and after restore.

#### CB-24 — Character organizer and Korean search

- **Scope**: the character organizer (folders, grid, arrangement) and Korean-aware character search.
- **Files**: `CharacterOrganizer.svelte` (974), `characterOrganizer.ts`,
  `characterOrganizerState.svelte.ts`, `haejeokKoreanSearch.ts`,
  `GridCatalog.svelte`, `MobileCharacters.svelte`, `App.svelte` units.
- **Entry points and flows**: organise and move characters; search with Hangul syllables and initial consonants; mobile catalog.
- **Interactions**: CB-17 (lazy chat metadata), CB-35 and CB-02 (dependency additions in `package.json`/`pnpm-lock.yaml`).
- **Existing coverage**: V.
- **Tests**: `characterOrganizer.test.ts`, `haejeokKoreanSearch.test.ts`.
- **Effort / risk**: S / misplaced characters, search misses.
- **Boundaries**: character import is CB-21.
- **Completion**: organizer state persistence across lazy chat metadata and
  reload verified; Hangul matching edge cases checked.

#### CB-25A — Personal appearance: CSS toggles, custom fonts, appearance editor

- **Scope**: the appearance part of personal settings.
- **Files**: `personalSettings/appearance*.ts`, `css*.ts`, `customFont*.ts`,
  `fontBytes.ts`, `cssEditorText.ts`, `personal-appearance.css`,
  `PersonalAppearanceRuntime.svelte`, `Appearance*.svelte`, `Css*.svelte`,
  `CustomFontManager.svelte`, `FontNamePreview.svelte`,
  `personalAppearanceSettingsData.ts`; related units in `nodeStorage.ts`,
  `characterCards.ts`, `globalApi.svelte.ts`, `database.svelte.ts`.
- **Note**: the `editor-replace-appearance-*-1.9` units rewrite this pack's own
  payloads; review only the composed files.
- **Entry points and flows**: edit appearance → validate → strict save → runtime apply; font import → asset reference → render; CSS toggle enable and disable.
- **Interactions**: CB-16 (asset references in `nodeStorage.ts`), CB-21 (`characterCards.ts` units), CB-19 (restore of assets), CB-25B.
- **Existing coverage**: V (CSS/font validation receipts).
- **Tests**: 9 tests: `appearance`, `appearanceNotices`, `appearancePersistence`,
  `cssEditorText`, `cssToggleRuntime`, `cssToggles`, `customFontRuntime`,
  `customFonts`, `personalAssets`.
- **Effort / risk**: M / lost custom assets, broken UI after save.
- **Boundaries**: the settings shell is CB-25B; external headers CB-26.
- **Completion**: font asset lifecycle (import, reference, export, restore)
  verified; CSS toggle runtime isolation from themes checked.

#### CB-29 — Kei translation tools

- **Scope**: translation cache, chunked LLM translation tasks, the cache panel and the translator runtime replacement.
- **Files**: `translationCacheStore.ts`, `translationTask.ts`,
  `translationChunkBatch.ts`, `translationCacheUsage.ts`,
  `translationCacheRuntime.ts`, `TranslationCachePanel.svelte` (582),
  `translator.ts` (28 units and the LLM runtime replacement),
  `LanguageSettings.svelte`, `ChatBody.svelte` units.
- **Entry points and flows**: translate a message → chunk batch → LLM request → cache store → display; cache panel clear and export.
- **Interactions**: CB-28 (`ChatBody.svelte`), CB-08 (translator regex units), CB-34 (cost).
- **Existing coverage**: V (the cache key was checked by the reference).
- **Tests**: 4 translation tests.
- **Effort / risk**: M / stale translations, cost.
- **Boundaries**: generic request policy is CB-14.
- **Completion**: cache eviction/persistence and chunk boundary behaviour
  verified; cache invalidation on message edit checked.

#### CB-34 — Usage cost estimate and request-log loading

- **Scope**: per-request cost estimation, usage storage and the request-log usage views.
- **Files**: `usageCostStore.cjs`, `usagePricing.ts`, `UsageCostPanel.svelte`,
  `UsageStats.svelte`, `request-logs.cjs` units (usage entries route, no-store,
  log-load performance), `model-jobs.cjs` unit, `requestLog.ts`,
  usage units in `googleGemini.ts`, `types.ts`, `jobRecovery.ts`, `request.ts`.
- **Flows**: `GET /api/request-logs/usage`, `/usage/entries`, `/stats`; usage
  capture on direct, BG and recovered requests.
- **Interactions**: CB-07 (cache token fields), CB-14 (recovered messages), CB-31/CB-32 (PageFold log units).
- **Existing coverage**: V (10-17 §4 changed display only).
- **Tests**: 8 tests.
- **Effort / risk**: S / misleading cost figures.
- **Boundaries**: PageFold units in `request-logs.cjs` are CB-32.
- **Completion**: no double counting for recovered or retried requests; cached
  tokens accounted; the pricing table's source and date recorded (prices must be
  checked against current provider pages at investigation time).

#### CB-35 — Parser, preset and toolchain hardening

- **Scope**: parser hardening (ChatML, `when` expressions, thoughts), preset integrity on edit and import, and the toolchain lockfile and test-setup changes.
- **Files**: `chatML.ts`, `whenExpression.ts`, `thoughts.ts`,
  `parser.svelte.ts`, `index.svelte.ts` units; `PromptPresetBasicInfo.svelte`
  and `database.svelte.ts` preset-integrity units; `pnpm-lock.yaml`,
  `package.json`, `vitest.setup.ts`.
- **Entry points and flows**: prompt parsing on every request; preset edit and import validation; `pnpm install --frozen-lockfile`.
- **Interactions**: CB-21, CB-24, CB-31, CB-32 (their lockfile entries), CB-02.
- **Existing coverage**: V.
- **Tests**: parser tests, `botPresetIntegrity.test.ts`; repo
  `parser-hardening`, `preset-integrity`, `toolchain-hardening`.
- **Effort / risk**: S / parser hangs, supply-chain drift.
- **Boundaries**: other packs' dependency choices are reviewed by their batches; this batch checks lockfile integrity and resolution.
- **Completion**: worst-case parser inputs timed; every lockfile entry added by
  any pack matched to its registry integrity.

#### CB-01 — Delivery tool lifecycle residuals

- **Scope**: what the reference full read did not exercise dynamically.
- **Files**: `src/cli.cjs`, `manager.cjs`, `staging.cjs`, `compatibility.cjs`,
  `catalog.cjs`, `resolver.cjs`, `report.cjs`, `risu-report.cjs`,
  `update-feed.cjs`, `update-channel.cjs`; `package.json`/`version.json` as
  inputs to the reported patcher version.
- **Flows**: upgrade from every released installed state (tags `v0.1.0`
  through `v0.2.3`, `v0.2.3-experimental.1`–`.8`, and the untagged
  experimental builds up to `.63`, including states recorded against the
  PocketRisu 1.8.1 and 1.9.0 targets) including the retired
  `features`/`hardening`/`custom` profiles and `background-import` owner;
  revert after the user edited a patched file; apply interrupted by `ENOSPC`
  or permission errors; CRLF/BOM and file-mode targets; report CLI error paths.
- **Interactions**: CB-03 (scripts that call the CLI), CB-02 (composition).
- **Existing coverage**: T for static reading. Findings 2–5 are open and are
  **not** re-investigated here.
- **Tests**: repo `cli`, `manager`, `compose`, `staging`, `resolver`, `catalog`,
  `compatibility`, `report`, `risu-report`, `update-feed`.
- **Effort / risk**: M / failed upgrades on the live install.
- **Boundaries**: re-verifying or fixing findings 2–5; pack contents.
- **Completion**: an upgrade matrix from each historical state with observed
  results.

#### CB-03 — Maintainer and operator scripts

- **Scope**: tools maintainers and operators run outside the patched application.
- **Files**: `scripts/qualify-target.cjs`, `build-installers.cjs`,
  `import-bg-preserve.cjs` (exclusion sets versus lazy-chat-bg-adapter
  replacements), `audit-generated-markers.cjs`, `rollback-personal-css-ui.cjs`,
  `verify-personal-css.cjs`.
- **Entry points and flows**: `npm run qualify -- stage|apply|revert`; `npm run build`; `node scripts/import-bg-preserve.cjs <installer> <output>`; the CSS rollback and verification scripts.
- **Interactions**: CB-01 (CLI), CB-05 (the imported bg-preserve payload), CB-25A (CSS scripts).
- **Existing coverage**: N (build reproducibility confirmed by CI and here).
- **Tests**: repo `import-bg-preserve.test.cjs`, `toolchain-hardening`,
  `capability-return`.
- **Effort / risk**: S / a rollback or import that silently drops units.
- **Boundaries**: probes are excluded harnesses; the FastImport migration script is CB-22.
- **Completion**: each script run in a scratch copy; destructive modes
  confirmed to be explicit and reversible.

### 7.5 P3 — low-risk or non-runtime code

#### CB-25B — Settings shell, wrappers, import navigation, settings search, chat width

- **Scope**: the personal-settings shell and the smaller settings.
- **Files**: `PersonalSettings.svelte` (non-header units), `Settings.svelte`,
  `SettingCheck/RowLayout/Select.svelte`, `SelectInput/ShSelect/ShSwitch.svelte`,
  `Toggles.svelte`, `ImportNavigationSetting.svelte`, `importNavigation.ts`,
  `searchIndex.ts`, `searchManifestData.ts`, `routing.ts`, `stores.svelte.ts`,
  `index.html`, `core.ts`, `displaySize.ts`, `characters.ts`,
  `haejeokChatWidth.ts`, `nodeonly-standard.css`, `displaySettingsData.svelte.ts`,
  `bootstrap.ts` units, localisation units.
- **Entry points and flows**: open settings → change → persist → reload; settings search; navigation after a character import.
- **Interactions**: CB-17 and CB-30 (`bootstrap.ts`, `Settings.svelte`), CB-25A.
- **Existing coverage**: V (1.9 personal-settings validation).
- **Tests**: `importNavigation.test.ts`, `searchIndex.test.ts`,
  `haejeokChatWidth.test.ts`, `personalSettings.test.ts`.
- **Effort / risk**: S / settings that do not persist.
- **Boundaries**: appearance is CB-25A; external headers CB-26.
- **Completion**: each setting's default, persistence and migration checked.

#### CB-30 — Kei mobile navigation, image viewer, text theme, prompt-role compat

- **Scope**: the remaining Kei cores and their lazy-storage adapter.
- **Files**: `keiMobileNavigation.ts`, `mobileBackNavigation.ts`, `hotkey.ts`
  (+135/−96), `main.ts`, `TextAreaInput.svelte`, `HotkeySettings.svelte`,
  `accessibilitySettingsData.ts`, `AssetViewer.svelte`, `textTheme.ts`,
  `colorscheme.ts`, `database.svelte.ts` units, help localisation.
- **Entry points and flows**: back button and history navigation, hotkeys, fullscreen image open and close, text-theme normalisation and prompt-role mapping when the database loads.
- **Interactions**: CB-17 and CB-25B (`bootstrap.ts`, `Settings.svelte`), CB-02 (`database.svelte.ts`).
- **Existing coverage**: V. The home-screen navigation record
  (`POCKETRISU-HOME-CHAT-NAVIGATION-BUG.md`, `WAITING_SIGNAL`) is unattributed;
  try it again here.
- **Tests**: 6 tests.
- **Effort / risk**: S / navigation traps on mobile.
- **Boundaries**: chat rendering is CB-28.
- **Completion**: back-navigation state machine verified on a mobile viewport.

#### CB-33 — PageFold offline qualification tooling

- **Scope**: PageFold provider-feasibility and requalification tools that are copied into the target.
- **Files**: `pageFoldProviderFeasibility.cjs`, `pageFoldStructuralPaidRunner.cjs`,
  `pageFoldStructuralRequalification.cjs`, `pageFoldPrototypeMeasure.cjs`
  (shipped into the target, not required by any runtime module).
- **Entry points and flows**: manual invocation of the modules with credentials and a budget.
- **Interactions**: CB-32 (shared font cache).
- **Existing coverage**: V.
- **Tests**: 3 server tests.
- **Effort / risk**: S / unintended paid runs if invoked.
- **Boundaries**: the runtime render path is CB-32.
- **Completion**: confirm they cannot be reached from a route; confirm the paid
  runner refuses without explicit credentials and budget.

## 8. Cross-batch dependencies

Dependencies are contract dependencies: a batch can start without the other,
but must record what it assumed about the other's units and hand that over.

| Batch | Needs contracts from | Provides contracts to |
|---|---|---|
| CB-02 | — (reads composed files) | hotspot map to every batch |
| CB-15 | — | CB-10, CB-16, CB-19 |
| CB-16 | CB-15 | CB-11, CB-17, CB-18, CB-21, CB-23, CB-25A, CB-28 |
| CB-09A | CB-05 | CB-09B, CB-10, CB-12 |
| CB-05 | — | CB-04, CB-06, CB-09A, CB-10–CB-14, CB-32 |
| CB-19 | CB-15, CB-10 (reset hooks) | CB-21, CB-23 |
| CB-10 | CB-15, CB-09A | CB-11, CB-13 |
| CB-11 | CB-10, CB-04 | CB-13 |
| CB-18 | CB-16 | — |
| CB-09B | CB-09A, CB-02 | CB-11 |
| CB-12 | CB-09A, CB-17 | CB-32 |
| CB-17 | CB-16 | CB-12 |
| CB-36 | route lists from all server batches | findings to owning batches |
| CB-14, CB-31, CB-34, CB-07 | each other (shared `request.ts`, `googleGemini.ts`, `types.ts`) | — |

Suggested waves (parallel within a wave):

1. CB-02, CB-15, CB-05, CB-09A, CB-19
2. CB-16, CB-10, CB-09B, CB-18
3. CB-11, CB-17, CB-12, CB-36, CB-04, CB-06
4. CB-14, CB-20, CB-21, CB-22, CB-26, CB-27, CB-28, CB-31, CB-32, CB-07
5. CB-13, CB-08, CB-23, CB-24, CB-25A, CB-29, CB-34, CB-35, CB-01, CB-03
6. CB-25B, CB-30, CB-33, then a short CB-02 re-pass with the handoffs

## 9. Explicit exclusions

| Excluded | Justification | Where it is still touched |
|---|---|---|
| `dist/pocketrisu-patcher.cjs` | Generated; byte-reproducible from `src/` and the catalog (verified) | via CB-01 sources |
| Anchor snapshots (20 files, 18,452 lines) | Verbatim upstream text; exactness enforced by composition | CB-02 only if an anchor matches more than once |
| Unchanged text of whole-file replacements | Upstream code; only the diff ships as a change | — |
| Vendored `base64-js.cjs`, `jsTiktokenLite.js` | Third-party code | provenance check in CB-07 |
| Embedded and repository tests, probes, fixtures | Not production; used as harnesses | a test defect is reported only if it hides a production defect |
| `research/pagefold-verbatim/` | Not loaded by the catalog | — |
| `bgOrchBundle.mjs`/`.css` | Build output, not tracked | build script in CB-05 |
| `save/pocketrisu-patches/intent.json`, `state.json` | Runtime state written by the tool | producer in CB-01 |
| Upstream PocketRisu code not touched by any unit | Outside this repository | call contracts used by a unit stay with that unit's batch |
| Documentation (`docs/`, README, CHANGELOG, notices) | Not executable | doc drift noted only incidentally |
| `danso0429/patch-verification-governance` | Separate repository; documentation and one 26-line publish script; its drift is finding 6 | — |
| `.github/workflows/ci.yml` | Verification configuration, not shipped; changing it is out of scope | its blind spots (probes and WebKit not in CI) are listed in §6.1 |

Pack manifests and unit-builder modules are **not** excluded: they belong to
the batch of their pack.

## 10. Completion and handoff criteria

### 10.1 A batch is complete when its record contains

1. **Cohort**: repository commit, target commit, pristine clone hash, Node and
   pnpm versions.
2. **Coverage ledger**: every production file and unit of the batch
   (Appendix B) marked read, with the composed line ranges, and anything not
   read listed with a reason.
3. **Flow traces**: each entry point and flow listed for the batch, with a
   state/transition table where the batch says so.
4. **Candidate defects**, each with: execution flow, root cause, evidence,
   severity, and a status — **Confirmed** (dynamic reproduction in a temporary
   clone or test), **Plausible** (static trace only, with what would confirm
   it) or **Rejected** (with the reason). A plausible item is never reported as
   confirmed.
5. **Tests run**: the batch's embedded tests with pass/skip counts, and any
   probe run with its environment.
6. **Handoffs**: assumptions about other batches' contracts, and questions for
   them, by batch ID.
7. **Not examined**: an explicit list (platforms, paths, data shapes).

No code change, no committed reproduction test and no change to existing
records belong to an investigation batch. Fixes are separate, approved work.

### 10.2 Handoff protocol

- The handoff list of a finished batch is copied into the next session's
  prompt for each named batch.
- A receiving batch either confirms the assumption, refutes it with evidence,
  or records it as out of its scope.
- A finding that belongs to another batch's unit is filed as a handoff, not
  investigated in place.

### 10.3 The programme is complete when

- every batch in §7 has a record satisfying §10.1;
- every handoff has a recorded answer;
- CB-02 has re-read the hotspots with all batch tables;
- this coverage matrix is updated with the new grades.

Even then, the result is investigated coverage, not proof that the code is
free of defects: several paths depend on WebKit/iPhone, the live host, the
private bg-preserve source or private plugin sources that this environment
cannot exercise, and each batch's "not examined" list remains open.

## 11. Observations

- The governance repository's `TARGETS.yaml` still lists the implementation
  repository and canonical policy as unresolved, and expects
  `scripts/verify-all-combinations.cjs` and
  `docs/patch-combination-verification-instructions.md`. Neither exists in this
  repository. This plan does not depend on them; it is recorded so the two
  sources are not silently reconciled.
- The reference report's "about 130,000 lines" is the raw `patches/` volume;
  the de-duplicated production delta is ≈59,400 lines plus ≈37,900 test lines.
- All-or-nothing delivery means subset combinations are not a production
  surface; the governance repository's combination checker concerns a
  different verification question.

## Appendix A — Reproduction

```sh
# Cohort
git -C pocketrisu-personal-patches fetch origin claude/bug-investigation-iz2fgk main
git -C pocketrisu-personal-patches rev-parse origin/main          # 3242c30…
git -C pocketrisu-personal-patches diff --stat main origin/claude/bug-investigation-iz2fgk

# Repository tests and installer reproducibility (in a scratch copy)
npm test
cp -a pocketrisu-personal-patches /tmp/copy && (cd /tmp/copy && npm run -s build)
cmp /tmp/copy/dist/pocketrisu-patcher.cjs pocketrisu-personal-patches/dist/pocketrisu-patcher.cjs

# Composed tree
git clone --depth 1 --branch v1.10.0 https://github.com/PocketRisu/PocketRisu.git pristine
cp -a pristine applied
node pocketrisu-personal-patches/dist/pocketrisu-patcher.cjs apply --root applied --json > apply.json
(cd applied && git add -A -N . && git diff --numstat > ../numstat.txt && git reset -q)
(cd applied && pnpm install --frozen-lockfile && NODE_OPTIONS=--no-experimental-webstorage pnpm test)
```

Unit inventory (`units.cjs`, run as `node units.cjs <repo> > units.json`):

```js
'use strict'
const path = require('node:path')
const repo = process.argv[2]
const { loadCatalog } = require(path.join(repo, 'src/catalog.cjs'))
const rows = []
for (const pack of loadCatalog(repo)) {
  for (const u of pack.units || []) {
    const tv = u.targetVersions?.pocketrisu
    if (tv && !tv.includes('1.10.0')) continue
    const body = u.content ?? u.managed ?? ''
    rows.push({ pack: pack.id, id: u.id, file: u.file, type: u.type,
                lines: body.split('\n').length })
  }
}
console.log(JSON.stringify({ rows }))
```

Whole-file replacement deltas: for every `replace` unit whose anchor is longer
than 4,000 characters, write the anchor and the body to two files and run
`git diff --no-index --numstat`.

Batch assignment rules (first match wins; test paths match
`\.test\.(ts|js|cjs|mjs)$|\.test\.svelte$|/tests?/|\.inc$|vitest\.setup|TestFixtures|test/compat/`):

| Pack | Rule | Batch |
|---|---|---|
| any | path contains `vendor/` | excluded |
| `bg-preserve` | file `assetUploadRetry` | CB-16 |
| `bg-preserve` | id/file matches `gemini`, `tokenizer`, `tikFallback`, `cache-source`, `cache-status`, `request-cache`, `adapter-types-cache`, `cache-usage` | CB-07 |
| `bg-preserve` | id/file matches `regex`, `risu-control`, `risuControl`, `moduleSelectionCache`, `modules-source-aware`, `a11y`, `requeststatus`, `completion-sound` | CB-08 |
| `bg-preserve` | id/file matches `bgStream`, `bgDraft`, `BgRestore`, `proxy`, `stream-reader`, `stream-cancel`, `banner`, `server-cjs-(proxy\|cleanup\|mark\|explicit)` | CB-06 |
| `bg-preserve` | other `server/` files | CB-05 |
| `bg-preserve` | rest | CB-04 |
| `lazy-chat-bg-adapter` | id prefix `plugin-host`, `plugin-admission`, `plugin-unavailable`, or plugin files | CB-12 |
| `lazy-chat-bg-adapter` | prefix `notifications`, `operation-notice`, `request-progress`, `stream-preview`, `browser-stat*`, `legacy-browser*`, `start-diagnostic*`, `statistics-preflight`, or notice/progress/preview files | CB-13 |
| `lazy-chat-bg-adapter` | prefix `external-header` | CB-26 |
| `lazy-chat-bg-adapter` | prefix `request-policy`, `native-input`, `job-recovery-identity`, `recovered-message*`, or model binding/credential/selection, `buildRequest`, `stableDiff`, `jobRecovery` files | CB-14 |
| `lazy-chat-bg-adapter` | prefix `recovery-owner`, `recovery-read`, `client-input-recovery`, `barrier*`, `durable-flush`, `assembly-root-flush`, `server-committed-chat-adoption`, `server-commit-client*`, `server-commit-boot*`, `hydration-*`, `server-chat-commit-client*`, or recovery/hydration/suggestion files | CB-11 |
| `lazy-chat-bg-adapter` | prefix `server-chat-commit*`, `server-chat-owned-root*`, `server-chat-snapshot*`, `server-chat-execution*`, `publication-write`, or commit-owner files | CB-10 |
| `lazy-chat-bg-adapter` | prefix `asset-upload*`, `adaptive-asset-upload-retry` | CB-16 |
| `lazy-chat-bg-adapter` | rest: `server/` → CB-09A, other → CB-09B | CB-09A / CB-09B |
| `lazy-chat-sync` | `server/` → CB-15; startup cache, bootstrap, plugin API, `DefaultChatScreen` → CB-17; rest → CB-16 | |
| `haejeok-persistence-safety-adapter` | all | CB-18 |
| `server-backup-snapshot-*`, `kei-backup-restore-safety-*` | all | CB-19 |
| `client-build-fence*` | all | CB-20 |
| `character-import-ux`, `charx-archive-integrity` | all | CB-21 |
| `fastimport-ios-picker` | all | CB-22 |
| `persona-organizer` | all | CB-23 |
| `character-organizer`, `haejeok-korean-search-adapter` | all | CB-24 |
| `personal-settings` | id contains `external-headers` → CB-26; rest → CB-25 (split A/B by the file lists in §7) | |
| `haejeok-chat-width-adapter` | all | CB-25B |
| `kei-stream-parser-*` | all | CB-27 |
| `kei-partial-edit-*`, `kei-chat-render-*`, `kei-hypa-tools-*` | all | CB-28 |
| `kei-translation-tools-*` | all | CB-29 |
| `kei-mobile-navigation-*`, `kei-fullscreen-*`, `kei-text-theme-*`, `kei-prompt-role-*` | all | CB-30 |
| `pagefold-model-preset` | feasibility/paid-runner/requalification/prototype files → CB-33; other `server/` or PDF/font units → CB-32; rest → CB-31 | |
| `pagefold-bg-adapter` | all | CB-32 |
| `usage-cost-estimate`, `log-load-performance` | all | CB-34 |
| `parser-hardening`, `preset-integrity`, `toolchain-hardening` | all | CB-35 |

Result on the cohort: 1,783 units assigned, 0 unassigned.

## Appendix B — Generated file lists per batch

Generated from the assignment above. "(n units, shared)" marks a file whose
other units belong to other batches; only the listed batch's units are in its
scope. CB-25 is listed as one group; §7 splits it into CB-25A and CB-25B.
CB-01, CB-02, CB-03 and CB-36 have no units of their own (see §7).

#### B — CB-04

- Production: `src/lib/ChatScreens/DefaultChatScreen.svelte` (10 units, shared); `src/ts/bgOrchestrate.ts` (1 unit, shared); `src/ts/bgOrchestrationDelivery.ts`; `src/ts/bgOrchestrationFallback.ts`; `src/ts/bgOrchestrationGlobals.ts`; `src/ts/bgOrchestrationMerge.ts`; `src/ts/bgOrchestrationOrdering.ts`; `src/ts/bgOrchestrationPending.ts` (1 unit, shared); `src/ts/bgOrchestrationPolicy.ts`; `src/ts/bgOrchestrationResult.ts`; `src/ts/bgOrchestrationRetentionState.ts`; `src/ts/bgOrchestrationStart.ts`; `src/ts/bgOrchestrationStats.ts`; `src/ts/bgResponseAck.ts`; `src/ts/generationBusy.ts` (1 unit, shared); `src/ts/globalApi.svelte.ts` (6 units, shared); `src/ts/plugins/apiV3/v3.svelte.ts` (1 unit, shared); `src/ts/process/command.ts` (1 unit, shared); `src/ts/process/files/multisend.ts`; `src/ts/process/generationState.ts` (3 units, shared); `src/ts/process/index.svelte.ts` (12 units, shared); `src/ts/process/request/google.ts` (2 units, shared); `src/ts/process/request/request.ts` (2 units, shared)
- Embedded tests: `src/ts/bgOrchestrationAbortContext.test.ts`; `src/ts/bgOrchestrationDelivery.test.ts`; `src/ts/bgOrchestrationFallback.test.ts`; `src/ts/bgOrchestrationGlobals.test.ts`; `src/ts/bgOrchestrationMerge.test.ts`; `src/ts/bgOrchestrationOperationStore.test.ts`; `src/ts/bgOrchestrationOrdering.test.ts`; `src/ts/bgOrchestrationPending.test.ts`; `src/ts/bgOrchestrationPolicy.test.ts`; `src/ts/bgOrchestrationResult.test.ts`; `src/ts/bgOrchestrationRetentionState.test.ts`; `src/ts/bgOrchestrationRunRegistry.test.ts`; `src/ts/bgOrchestrationStart.test.ts`; `src/ts/bgOrchestrationStats.test.ts`; `src/ts/bgSubResultAck.test.ts`; `src/ts/generationBusy.test.ts`; `src/ts/process/directGenerationLifecycle.test.ts`

#### B — CB-05

- Production: `server/node/bgOrchBundle.build.cjs` (1 unit, shared); `server/node/bgOrchestrationAbortContext.cjs`; `server/node/bgOrchestrationGlobalVariables.cjs`; `server/node/bgOrchestrationOperationStore.cjs` (1 unit, shared); `server/node/bgOrchestrationResultDelivery.cjs`; `server/node/bgOrchestrationResultRetention.cjs` (1 unit, shared); `server/node/bgOrchestrationRunRegistry.cjs` (1 unit, shared); `server/node/bgOrchestrator.cjs` (1 unit, shared); `server/node/bgRequestLogBridge.cjs`; `server/node/server.cjs` (1 unit, shared)
- Embedded tests: `server/node/bgOrchestrationResultRetention.test.ts`; `server/node/bgRequestLogBridge.test.ts`

#### B — CB-06

- Production: `server/node/bgDraftRoutes.cjs`; `server/node/bgStreamJob.cjs`; `server/node/bgStreamReader.cjs`; `server/node/server.cjs` (8 units, shared); `src/App.svelte` (2 units, shared); `src/lib/Others/BgRestoreBanner.svelte`; `src/ts/bgStreamFetch.ts` (1 unit, shared); `src/ts/bgStreamPreserve.svelte.ts` (1 unit, shared); `src/ts/bgStreamRecovery.ts`; `src/ts/network/proxyJobWs.ts`
- Embedded tests: `src/ts/bgStreamReader.test.ts`; `src/ts/bgStreamRecovery.test.ts`

#### B — CB-07

- Production: `server/node/bgGeminiCacheRoutes.cjs`; `src/lang/en.ts` (1 unit, shared); `src/lang/ko.ts` (1 unit, shared); `src/lib/Setting/Pages/Model/GeminiCacheStatus.svelte`; `src/lib/Setting/Pages/Model/ModelPresetSettings.svelte` (2 units, shared); `src/ts/geminiCacheTelemetry.ts`; `src/ts/globalApi.svelte.ts` (1 unit, shared); `src/ts/preset/adapter/googleGemini.ts` (3 units, shared); `src/ts/preset/adapter/types.ts` (1 unit, shared); `src/ts/preset/cache/geminiCacheWiring.ts`; `src/ts/preset/cache/geminiContextCache.ts`; `src/ts/process/request/request.ts` (4 units, shared); `src/ts/tikFallback.ts`; `src/ts/tokenizer.ts` (3 units, shared)
- Embedded tests: `src/ts/bgGeminiCacheSafety.test.ts`; `src/ts/bgGeminiCacheTelemetry.test.ts`

#### B — CB-08

- Production: `src/lib/ChatScreens/Chat.svelte` (4 units, shared); `src/lib/ChatScreens/DefaultChatScreen.svelte` (3 units, shared); `src/lib/SideBars/Scripts/RegexData.svelte`; `src/ts/process/moduleSelectionCache.ts`; `src/ts/process/modules.ts` (4 units, shared); `src/ts/process/risuControlTouch.ts`; `src/ts/process/scripts.ts`; `src/ts/status/requestStatus.ts` (3 units, shared); `src/ts/storage/database.svelte.ts` (1 unit, shared); `src/ts/translator/translator.ts` (2 units, shared)
- Embedded tests: `src/ts/process/moduleSelectionCache.test.ts`; `src/ts/process/regexImportMultiplicity.test.ts`; `src/ts/process/risuControlTouch.test.ts`

#### B — CB-09A

- Production: `server/node/bgFailedInputSettlement.cjs`; `server/node/bgOrchBundle.build.cjs` (2 units, shared); `server/node/bgOrchestrationOperationStore.cjs` (3 units, shared); `server/node/bgOrchestrationRunRegistry.cjs` (1 unit, shared); `server/node/bgOrchestrator.cjs` (41 units, shared); `server/node/bgServerChatProcessClient.cjs`; `server/node/bgServerChatProcessPreload.cjs`; `server/node/chatInputAttach.cjs`; `server/node/model-jobs.cjs` (2 units, shared); `server/node/server.cjs` (3 units, shared); `server/node/serverChatAssemblyContext.cjs`; `server/node/serverChatInputDrain.cjs`; `server/node/serverChatInputOwner.cjs`; `server/node/serverChatInputTransform.cjs`; `server/node/serverChatSettingsContext.cjs`
- Embedded tests: `server/node/bgChatQueue.test.ts`; `server/node/bgFailedInputSettlement.test.ts`; `server/node/bgInputExecutionContext.test.ts`; `server/node/bgServerChatProcessBoundary.test.ts`; `server/node/chatInputAttach.test.ts`; `server/node/serverChatAssemblyContext.test.ts`; `server/node/serverChatInputDrain.test.ts`; `server/node/serverChatInputOwner.test.ts`; `server/node/serverChatInputTransform.test.ts`; `server/node/serverChatSettingsContext.test.ts`

#### B — CB-09B

- Production: `src/lib/ChatScreens/Chat.svelte` (5 units, shared); `src/lib/ChatScreens/Chats.svelte` (3 units, shared); `src/lib/ChatScreens/DefaultChatScreen.svelte` (18 units, shared); `src/lib/ChatScreens/ServerPendingInputs.svelte`; `src/ts/bgDraftIdentity.ts`; `src/ts/bgFailedInputSettlement.ts`; `src/ts/bgOrchestrate.ts` (11 units, shared); `src/ts/bgServerInputAdmission.ts`; `src/ts/bgServerInputAdoption.ts`; `src/ts/bgServerInputClient.ts`; `src/ts/bgServerInputLedger.ts`; `src/ts/bgServerInputProviderPolicy.ts`; `src/ts/bgServerInputStart.ts`; `src/ts/bgServerPendingProjection.ts`; `src/ts/globalApi.svelte.ts` (1 unit, shared); `src/ts/parser/chatVar.svelte.ts`; `src/ts/process/command.ts` (1 unit, shared); `src/ts/storage/chatDraft.ts` (3 units, shared)
- Embedded tests: `src/lib/ChatScreens/ServerPendingInputs.test.ts`; `src/ts/bgCapabilityAdmissionFlow.test.ts`; `src/ts/bgDraftIdentity.test.ts`; `src/ts/bgFailedInputSettlement.test.ts`; `src/ts/bgServerInputAdmission.test.ts`; `src/ts/bgServerInputAdoption.test.ts`; `src/ts/bgServerInputClient.test.ts`; `src/ts/bgServerInputLedger.test.ts`; `src/ts/bgServerInputProviderPolicy.test.ts`; `src/ts/bgServerInputStart.test.ts`; `src/ts/bgServerPendingProjection.test.ts`; `src/ts/parser/tests/chatVar.svelte.test.ts`; `src/ts/process/commandVariableRead.test.ts`; `src/ts/storage/chatDraft.test.ts`

#### B — CB-10

- Production: `server/node/bgOrchestrationOperationStore.cjs` (1 unit, shared); `server/node/bgOrchestrator.cjs` (21 units, shared); `server/node/chatAnchorCommit.cjs`; `server/node/server.cjs` (13 units, shared); `server/node/serverChatCommitOwner.cjs`; `server/node/serverChatExecutionProjection.cjs`; `src/ts/globalApi.svelte.ts` (9 units, shared); `src/ts/storage/chatStorage.ts` (2 units, shared); `src/ts/storage/nodeStorage.ts` (6 units, shared)
- Embedded tests: `server/node/bgServerChatCommitRoutes.test.ts`; `server/node/chatAnchorCommit.test.ts`; `server/node/serverChatCommitOwner.test.ts`; `server/node/serverChatExecutionProjection.test.ts`; `src/ts/storage/nodeStorage.publicationWrite.test.ts`

#### B — CB-11

- Production: `server/node/bgOrchestrator.cjs` (7 units, shared); `src/lib/ChatScreens/DefaultChatScreen.svelte` (15 units, shared); `src/lib/ChatScreens/Suggestion.svelte`; `src/ts/bgClientInputRecovery.ts`; `src/ts/bgDurableSaveBarrier.ts`; `src/ts/bgFinishedOperation.ts`; `src/ts/bgOrchestrate.ts` (109 units, shared); `src/ts/bgOrchestrationPending.ts` (4 units, shared); `src/ts/bgReconciliation.ts`; `src/ts/bgRecoveryRead.ts`; `src/ts/bgServerCommitHydration.ts`; `src/ts/bgStreamPreserve.svelte.ts` (11 units, shared); `src/ts/generationBusy.ts` (4 units, shared); `src/ts/globalApi.svelte.ts` (3 units, shared); `src/ts/process/generationState.ts` (10 units, shared); `src/ts/process/index.svelte.ts` (3 units, shared); `src/ts/storage/chatStorage.ts` (6 units, shared); `src/ts/storage/nodeStorage.ts` (4 units, shared); `src/ts/suggestionRequestOwner.ts`
- Embedded tests: `src/ts/bgDraftRecoveryOwnership.test.ts`; `src/ts/bgDurableSaveBarrier.test.ts`; `src/ts/bgFinishedOperation.test.ts`; `src/ts/bgFinishedOperationFlow.test.ts`; `src/ts/bgLegacySaveFailure.test.ts`; `src/ts/bgReconciliation.test.ts`; `src/ts/bgRecoveryOwnership.test.ts`; `src/ts/bgRecoveryRead.test.ts`; `src/ts/bgServerCommitHydration.test.ts`; `src/ts/storage/bgServerChatProcessAdoption.test.ts`; `src/ts/storage/serverCommittedChatAdoption.test.ts`; `src/ts/suggestionRecovery.test.ts`; `src/ts/suggestionRequestOwner.test.ts`

#### B — CB-12

- Production: `server/node/bgOrchBundle.build.cjs` (2 units, shared); `server/node/bgOrchestrator.cjs` (37 units, shared); `server/node/bgPluginDiagnostics.cjs`; `server/node/bgPluginEligibility.cjs`; `server/node/bgPluginHost.cjs`; `server/node/bgPluginMetadata.cjs`; `server/node/bgPluginSandbox.cjs`; `server/node/bgPluginSession.cjs`; `server/node/bgPluginStorage.cjs`; `server/node/bgPluginUnavailable.cjs`; `server/node/bgPluginValue.cjs`; `server/node/bgPluginWorker.cjs`; `server/node/server.cjs` (6 units, shared); `src/lib/ChatScreens/DefaultChatScreen.svelte` (3 units, shared); `src/lib/Others/BgPluginDiagnostics.svelte`; `src/lib/Setting/Pages/RequestLogs.svelte`; `src/ts/bgOrchestrate.ts` (6 units, shared); `src/ts/bgPluginBindings.ts`; `src/ts/bgServerPluginCapability.ts`; `src/ts/plugins/apiV3/factory.ts`; `src/ts/plugins/apiV3/pluginChatAccess.ts` (1 unit, shared); `src/ts/process/request/request.ts` (1 unit, shared)
- Embedded tests: `server/node/bgPluginEligibility.test.ts`; `server/node/bgPluginUnavailable.test.ts`; `src/ts/bgServerPluginCapability.test.ts`

#### B — CB-13

- Production: `server/node/bgNotifications.cjs`; `server/node/bgOperationNotices.cjs`; `server/node/bgOrchBundle.build.cjs` (2 units, shared); `server/node/bgOrchestrationOperationStore.cjs` (2 units, shared); `server/node/bgOrchestrationResultRetention.cjs` (1 unit, shared); `server/node/bgOrchestrator.cjs` (23 units, shared); `server/node/bgStreamPreview.cjs`; `server/node/bgStreamingScheduler.cjs`; `server/node/clientBuildFence.cjs` (1 unit, shared); `server/node/server.cjs` (5 units, shared); `src/App.svelte` (2 units, shared); `src/lib/ChatScreens/DefaultChatScreen.svelte` (9 units, shared); `src/lib/ChatScreens/ServerStreamPreview.svelte`; `src/lib/Others/BgNotificationDelivery.svelte`; `src/lib/UI/GUI/RequestStatusToast.svelte` (4 units, shared); `src/lib/UI/GUI/RequestStatusToaster.svelte`; `src/ts/alert.ts`; `src/ts/bgBrowserMessageEffects.ts`; `src/ts/bgCancelledInputSettlement.ts`; `src/ts/bgChatActivity.ts`; `src/ts/bgNotifications.ts`; `src/ts/bgOrchestrate.ts` (58 units, shared); `src/ts/bgOrchestrationStartDiagnostic.ts`; `src/ts/bgRequestProgress.ts`; `src/ts/bgServerInputSettingsSave.ts`; `src/ts/bgStreamPreview.ts`; `src/ts/globalApi.svelte.ts` (7 units, shared); `src/ts/process/index.svelte.ts` (2 units, shared); `src/ts/process/request/google.ts` (2 units, shared); `src/ts/process/request/openAI/requests.ts` (2 units, shared); `src/ts/status/requestStatus.ts` (8 units, shared); `src/ts/storage/publicationSaveNotice.ts`
- Embedded tests: `server/node/bgNotifications.test.ts`; `server/node/bgOperationNotices.test.ts`; `server/node/bgStreamPreview.test.ts`; `server/node/bgStreamingScheduler.test.ts`; `src/lib/ChatScreens/ServerStreamPreview.test.ts`; `src/lib/UI/GUI/RequestStatusToast.test.ts`; `src/lib/UI/GUI/RequestStatusToaster.test.ts`; `src/ts/bgBrowserMessageEffects.test.ts`; `src/ts/bgCancelledInputSettlement.test.ts`; `src/ts/bgNotifications.test.ts`; `src/ts/bgOrchestrationStartDiagnostic.test.ts`; `src/ts/bgRequestProgress.test.ts`; `src/ts/bgServerInputSettingsSave.test.ts`; `src/ts/bgStreamPreview.test.ts`; `src/ts/storage/publicationSaveNotice.test.ts`

#### B — CB-14

- Production: `server/node/bgOrchestrator.cjs` (3 units, shared); `src/ts/bgServerInputExecution.ts`; `src/ts/preset/adapter/buildRequest.ts`; `src/ts/process/request/jobRecovery.ts` (13 units, shared); `src/ts/process/request/modelBindingResolution.ts`; `src/ts/process/request/modelCredentialResolution.ts`; `src/ts/process/request/modelPresetBinding.ts` (4 units, shared); `src/ts/process/request/modelRequestSelection.ts`; `src/ts/process/request/request.ts` (11 units, shared); `src/ts/process/scriptings.ts` (4 units, shared); `src/ts/process/stableDiff.ts`
- Embedded tests: `src/ts/process/request/jobRecovery.test.ts`; `src/ts/process/request/jobRecoveryIdentity.test.ts`; `src/ts/process/request/modelRequestSelection.test.ts`

#### B — CB-15

- Production: `server/node/chatDelta.cjs`; `server/node/chatWriteJournal.cjs`; `server/node/server.cjs` (1 unit, shared); `server/node/serverChatCommit.cjs`
- Embedded tests: `server/node/chatDelta.test.ts`; `server/node/chatWriteJournal.test.ts`; `server/node/serverChatCommit.test.ts`

#### B — CB-16

- Production: `src/ts/globalApi.svelte.ts` (1 unit, shared); `src/ts/storage/assetUploadRetry.ts`; `src/ts/storage/autoStorage.ts` (1 unit, shared); `src/ts/storage/chatIdentityRepair.ts`; `src/ts/storage/chatSaveIntent.ts`; `src/ts/storage/chatSaveRebase.ts`; `src/ts/storage/chatStorage.ts` (1 unit, shared); `src/ts/storage/conflictRebase.ts`; `src/ts/storage/nodeStorage.ts` (4 units, shared); `src/ts/storage/risuSave.ts`
- Embedded tests: `src/ts/storage/assetUploadRetry.test.ts`; `src/ts/storage/chatIdentityRepair.test.ts`; `src/ts/storage/chatSaveIntent.test.ts`; `src/ts/storage/chatSaveRebase.test.ts`; `src/ts/storage/chatSaveView.svelte.test.ts`; `src/ts/storage/chatStorage.test.ts`; `src/ts/storage/conflictRebase.test.ts`; `src/ts/storage/globalApi.savePersistence.test.ts`; `src/ts/storage/nodeStorage.chatDelta.test.ts`; `src/ts/storage/nodeStorage.chatRebaseCodec.test.ts`; `src/ts/storage/risuSavePatcher.test.ts`

#### B — CB-17

- Production: `src/lib/ChatScreens/DefaultChatScreen.svelte` (1 unit, shared); `src/ts/bootstrap.ts` (1 unit, shared); `src/ts/plugins/apiV3/pluginChatAccess.ts` (1 unit, shared); `src/ts/plugins/apiV3/risuai.d.ts` (1 unit, shared); `src/ts/plugins/apiV3/v3.svelte.ts` (1 unit, shared); `src/ts/storage/startupDatabaseCache.ts`
- Embedded tests: `src/ts/bootstrap.freshDatabase.test.ts`; `src/ts/plugins/apiV3/pluginChatAccess.test.ts`; `src/ts/storage/startupDatabaseCache.test.ts`

#### B — CB-18

- Production: `src/lib/ChatScreens/Chat.svelte` (6 units, shared); `src/lib/ChatScreens/DefaultChatScreen.svelte` (15 units, shared); `src/lib/SideBars/DevTool.svelte`; `src/ts/globalApi.svelte.ts` (4 units, shared); `src/ts/haejeokPersistenceSafety.ts`; `src/ts/plugins/plugins.svelte.ts` (2 units, shared); `src/ts/process/command.ts` (2 units, shared); `src/ts/process/index.svelte.ts` (3 units, shared); `src/ts/process/scriptings.ts` (11 units, shared); `src/ts/process/triggers.ts`; `src/ts/storage/database.svelte.ts` (2 units, shared)
- Embedded tests: `src/ts/haejeokPersistenceSafety.test.ts`; `src/ts/storage/chatSaveCallerPublication.test.ts`; `src/ts/storage/triggerVariableCompatibility.test.ts`

#### B — CB-19

- Production: `server/node/backupSnapshot.cjs`; `server/node/backupSource.cjs`; `server/node/db.cjs`; `server/node/restoreSafety.cjs`; `server/node/server.cjs` (26 units, shared); `src/lib/Setting/Pages/SystemBackup.svelte` (2 units, shared); `src/lib/Setting/ServerBackupList.svelte` (2 units, shared); `src/ts/drive/backuplocal.ts` (2 units, shared); `src/ts/storage/autoStorage.ts` (3 units, shared); `src/ts/storage/nodeStorage.ts` (11 units, shared); `src/ts/storage/restoreSafety.ts`
- Embedded tests: `server/node/backupSnapshot.test.ts`; `server/node/backupSource.test.ts`; `server/node/restoreSafety.test.ts`; `src/ts/storage/restoreSafety.test.ts`; `test/compat/backup-point-in-time.test.ts`

#### B — CB-20

- Production: `server/node/clientBuildFence.cjs` (1 unit, shared); `server/node/server.cjs` (3 units, shared); `src/lib/ChatScreens/DefaultChatScreen.svelte` (2 units, shared); `src/lib/Setting/Pages/Advanced/InlayCompressButton.svelte`; `src/lib/Setting/Pages/SystemBackup.svelte` (6 units, shared); `src/lib/Setting/Pages/SystemDashboard.svelte`; `src/ts/bgOrchestrate.ts` (2 units, shared); `src/ts/bgStreamFetch.ts` (3 units, shared); `src/ts/bgStreamPreserve.svelte.ts` (2 units, shared); `src/ts/globalApi.svelte.ts` (5 units, shared); `src/ts/process/generationState.ts` (2 units, shared); `src/ts/process/request/jobFetch.ts`; `src/ts/process/request/jobRecovery.ts` (3 units, shared); `src/ts/process/request/pendingSends.ts`; `src/ts/storage/chatDraft.ts` (7 units, shared); `src/ts/storage/clientBuild.ts`; `src/ts/storage/clientBuildHandshake.ts`; `src/ts/storage/nodeStorage.ts` (8 units, shared); `src/vite-env.d.ts`; `vite.config.ts`
- Embedded tests: `server/node/clientBuildFence.test.ts`; `src/ts/storage/chatDraftClientBuild.test.ts`; `src/ts/storage/clientBuildHandshake.test.ts`

#### B — CB-21

- Production: `package.json` (1 unit, shared); `pnpm-lock.yaml` (3 units, shared); `public/sw.js`; `src/App.svelte` (2 units, shared); `src/lib/Others/CharacterImportToast.svelte`; `src/lib/Setting/Pages/Module/ModuleSettings.svelte`; `src/lib/Setting/Pages/SystemBackup.svelte` (2 units, shared); `src/lib/Setting/ServerBackupList.svelte` (2 units, shared); `src/ts/characterCards.ts` (16 units, shared); `src/ts/characterImportState.ts`; `src/ts/characterPackage.ts`; `src/ts/drive/backuplocal.ts` (4 units, shared); `src/ts/process/charxArchive.ts`; `src/ts/process/charxImportSession.ts`; `src/ts/process/moduleImport.ts`; `src/ts/process/modules.ts` (7 units, shared); `src/ts/process/processzip.ts`; `src/ts/process/risumImport.ts`; `src/ts/update.ts`
- Embedded tests: `server/node/moduleShareServiceWorker.test.ts`; `src/ts/characterImportState.test.ts`; `src/ts/process/charxArchive.test.ts`; `src/ts/process/charxImportSession.test.ts`; `src/ts/process/charxTestFixtures.ts`; `src/ts/process/moduleImport.test.ts`; `src/ts/process/risumImport.test.ts`

#### B — CB-22

- Production: `src/ts/plugins/fastImportIOSPicker.ts`; `src/ts/plugins/plugins.svelte.ts` (2 units, shared)
- Embedded tests: `src/ts/plugins/fastImportIOSPicker.test.ts`

#### B — CB-23

- Production: `server/node/server.cjs` (1 unit, shared); `src/lib/Setting/Pages/PersonaSettings.svelte`; `src/lib/Setting/listedPersona.svelte`; `src/ts/drive/backuplocal.ts` (1 unit, shared); `src/ts/globalApi.svelte.ts` (3 units, shared); `src/ts/persona.ts`; `src/ts/personaImages.ts`; `src/ts/personaOrganizer.ts`; `src/ts/plugins/apiV3/risuai.d.ts` (1 unit, shared); `src/ts/storage/database.svelte.ts` (6 units, shared)
- Embedded tests: `src/ts/personaImages.test.ts`; `src/ts/personaOrganizer.test.ts`; `test/compat/persona-assets-1.10.test.ts`

#### B — CB-24

- Production: `package.json` (1 unit, shared); `pnpm-lock.yaml` (3 units, shared); `src/App.svelte` (2 units, shared); `src/lib/Mobile/MobileCharacters.svelte`; `src/lib/Others/CharacterOrganizer.svelte`; `src/lib/Others/GridCatalog.svelte`; `src/ts/characterOrganizer.ts`; `src/ts/characterOrganizerState.svelte.ts`; `src/ts/haejeokKoreanSearch.ts`
- Embedded tests: `src/ts/characterOrganizer.test.ts`; `src/ts/haejeokKoreanSearch.test.ts`

#### B — CB-25

- Production: `index.html`; `server/node/server.cjs` (1 unit, shared); `src/App.svelte` (2 units, shared); `src/lang/en.ts` (2 units, shared); `src/lang/help.en.ts` (1 unit, shared); `src/lang/help.ko.ts` (1 unit, shared); `src/lang/ko.ts` (2 units, shared); `src/lang/zh-Hant.ts`; `src/lib/ChatScreens/Chat.svelte` (2 units, shared); `src/lib/ChatScreens/DefaultChatScreen.svelte` (7 units, shared); `src/lib/Others/PersonalAppearanceRuntime.svelte`; `src/lib/Setting/Pages/PersonalSettings.svelte` (3 units, shared); `src/lib/Setting/Pages/PersonalSettings/AppearanceNotifications.svelte`; `src/lib/Setting/Pages/PersonalSettings/AppearanceSettings.svelte`; `src/lib/Setting/Pages/PersonalSettings/AppearanceToast.svelte`; `src/lib/Setting/Pages/PersonalSettings/CssRecoveryNotice.svelte`; `src/lib/Setting/Pages/PersonalSettings/CssToggleManager.svelte`; `src/lib/Setting/Pages/PersonalSettings/CustomFontManager.svelte`; `src/lib/Setting/Pages/PersonalSettings/FontNamePreview.svelte`; `src/lib/Setting/Pages/PersonalSettings/ImportNavigationSetting.svelte`; `src/lib/Setting/Settings.svelte` (3 units, shared); `src/lib/Setting/Wrappers/SettingCheck.svelte`; `src/lib/Setting/Wrappers/SettingRowLayout.svelte`; `src/lib/Setting/Wrappers/SettingSelect.svelte`; `src/lib/SideBars/Toggles.svelte`; `src/lib/UI/GUI/SelectInput.svelte`; `src/lib/UI/GUI/ShSelect.svelte`; `src/lib/UI/GUI/ShSwitch.svelte`; `src/styles/nodeonly-standard.css`; `src/styles/personal-appearance.css`; `src/ts/bootstrap.ts` (2 units, shared); `src/ts/characterCards.ts` (3 units, shared); `src/ts/characters.ts`; `src/ts/globalApi.svelte.ts` (10 units, shared); `src/ts/haejeokChatWidth.ts`; `src/ts/personalSettings.ts`; `src/ts/personalSettings/appearance.ts`; `src/ts/personalSettings/appearanceEditor.ts`; `src/ts/personalSettings/appearanceNotices.ts`; `src/ts/personalSettings/appearancePersistence.ts`; `src/ts/personalSettings/appearanceValues.ts`; `src/ts/personalSettings/core.ts`; `src/ts/personalSettings/cssEditorText.ts`; `src/ts/personalSettings/cssToggleDefinitions.ts`; `src/ts/personalSettings/cssToggleRuntime.ts`; `src/ts/personalSettings/cssToggles.ts`; `src/ts/personalSettings/customFontRuntime.ts`; `src/ts/personalSettings/customFonts.ts`; `src/ts/personalSettings/displaySize.ts`; `src/ts/personalSettings/fontBytes.ts`; `src/ts/personalSettings/importNavigation.ts`; `src/ts/routing.ts`; `src/ts/setting/displaySettingsData.svelte.ts`; `src/ts/setting/personalAppearanceSettingsData.ts`; `src/ts/setting/searchIndex.ts`; `src/ts/setting/searchManifestData.ts`; `src/ts/storage/database.svelte.ts` (6 units, shared); `src/ts/storage/nodeStorage.ts` (2 units, shared); `src/ts/stores.svelte.ts`
- Embedded tests: `src/ts/haejeokChatWidth.test.ts`; `src/ts/personalSettings.test.ts`; `src/ts/personalSettings/appearance.test.ts`; `src/ts/personalSettings/appearanceNotices.test.ts`; `src/ts/personalSettings/appearancePersistence.test.ts`; `src/ts/personalSettings/cssEditorText.test.ts`; `src/ts/personalSettings/cssToggleRuntime.test.ts`; `src/ts/personalSettings/cssToggles.test.ts`; `src/ts/personalSettings/customFontRuntime.test.ts`; `src/ts/personalSettings/customFonts.test.ts`; `src/ts/personalSettings/importNavigation.test.ts`; `src/ts/personalSettings/personalAssets.test.ts`; `src/ts/setting/searchIndex.test.ts`

#### B — CB-26

- Production: `server/node/clientBuildFence.cjs` (1 unit, shared); `server/node/externalRequestHeaders.cjs`; `server/node/server.cjs` (5 units, shared); `src/lib/Setting/Pages/PersonalSettings.svelte` (3 units, shared); `src/lib/Setting/Pages/PersonalSettings/ExternalHeadersSetting.svelte`
- Embedded tests: `server/node/externalRequestHeaders.test.ts`; `server/node/externalRequestHeadersProcess.test.ts`

#### B — CB-27

- Production: `src/ts/process/request/google.ts` (2 units, shared); `src/ts/process/request/keiSseStream.ts`; `src/ts/process/request/openAI/requests.ts` (2 units, shared)
- Embedded tests: `src/ts/process/request/google.stream.test.ts`; `src/ts/process/request/keiSseStream.test.ts`; `src/ts/process/request/openAI/requests.stream.test.ts`

#### B — CB-28

- Production: `src/lang/en.ts` (2 units, shared); `src/lang/ko.ts` (2 units, shared); `src/lib/ChatScreens/Chat.svelte` (12 units, shared); `src/lib/ChatScreens/ChatBody.svelte` (5 units, shared); `src/lib/ChatScreens/Chats.svelte` (6 units, shared); `src/lib/ChatScreens/DefaultChatScreen.svelte` (5 units, shared); `src/lib/ChatScreens/PartialEditManager.svelte`; `src/lib/ChatScreens/keiChatRender.ts`; `src/lib/ChatScreens/keiPartialEditIdentity.ts`; `src/lib/Others/HypaV3Modal.svelte`; `src/lib/Others/HypaV3Modal/KeiHypaManualSummaryPanel.svelte`; `src/lib/Others/HypaV3Modal/keiHypaManualSelection.ts`; `src/lib/Others/HypaV3Modal/modal-footer.svelte`; `src/lib/Others/HypaV3Modal/modal-header.svelte`; `src/lib/Others/HypaV3Modal/utils.ts`
- Embedded tests: `src/lib/ChatScreens/PartialEditManager.test.ts`; `src/lib/ChatScreens/keiChatRender.test.ts`; `src/lib/ChatScreens/keiPartialEditIdentity.test.ts`; `src/lib/Others/HypaV3Modal/KeiHypaManualSummaryPanel.test.ts`; `src/lib/Others/HypaV3Modal/keiHypaManualSelection.test.ts`

#### B — CB-29

- Production: `src/lang/en.ts` (1 unit, shared); `src/lang/ko.ts` (1 unit, shared); `src/lib/ChatScreens/ChatBody.svelte` (14 units, shared); `src/lib/Setting/Pages/Language/TranslationCachePanel.svelte`; `src/lib/Setting/Pages/LanguageSettings.svelte`; `src/ts/translator/translationCacheRuntime.ts`; `src/ts/translator/translationCacheStore.ts`; `src/ts/translator/translationCacheUsage.ts`; `src/ts/translator/translationChunkBatch.ts`; `src/ts/translator/translationTask.ts`; `src/ts/translator/translator.ts` (28 units, shared)
- Embedded tests: `src/ts/translator/translationCacheStore.test.ts`; `src/ts/translator/translationCacheUsage.test.ts`; `src/ts/translator/translationChunkBatch.test.ts`; `src/ts/translator/translationTask.test.ts`

#### B — CB-30

- Production: `src/lang/en.ts` (2 units, shared); `src/lang/help.en.ts` (1 unit, shared); `src/lang/help.ko.ts` (1 unit, shared); `src/lang/ko.ts` (2 units, shared); `src/lib/Others/AssetViewer.svelte`; `src/lib/Setting/Pages/HotkeySettings.svelte`; `src/lib/Setting/Settings.svelte` (1 unit, shared); `src/lib/UI/GUI/TextAreaInput.svelte`; `src/main.ts`; `src/ts/bootstrap.ts` (2 units, shared); `src/ts/gui/colorscheme.ts`; `src/ts/gui/textTheme.ts`; `src/ts/hotkey.ts`; `src/ts/keiMobileNavigation.ts`; `src/ts/mobileBackNavigation.ts`; `src/ts/setting/accessibilitySettingsData.ts`; `src/ts/storage/database.svelte.ts` (9 units, shared)
- Embedded tests: `src/ts/gui/textTheme.test.ts`; `src/ts/gui/textThemeRuntime.test.ts`; `src/ts/keiMobileNavigation.test.ts`; `src/ts/mobileBackNavigation.test.ts`; `src/ts/storage/promptRoleCompatibility.test.ts`; `src/ts/storage/textThemeDatabase.test.ts`

#### B — CB-31

- Production: `pnpm-lock.yaml` (4 units, shared); `src/lang/en.ts` (1 unit, shared); `src/lang/ko.ts` (1 unit, shared); `src/lib/ChatScreens/Chat.svelte` (1 unit, shared); `src/lib/Others/AlertComp.svelte`; `src/lib/Others/PageFoldGenerationInfo.svelte`; `src/lib/Setting/Pages/Model/CredentialField.svelte`; `src/lib/Setting/Pages/Model/ModelPresetSettings.svelte` (2 units, shared); `src/lib/Setting/Pages/Model/PageFoldPresetSettings.svelte`; `src/lib/SideBars/ModelBind.svelte`; `src/lib/SideBars/PageFoldBindingOverrides.svelte`; `src/lib/UI/GUI/RequestStatusToast.svelte` (2 units, shared); `src/ts/pagefold/budget.ts`; `src/ts/pagefold/canonicalTranscript.ts`; `src/ts/pagefold/directives.ts`; `src/ts/pagefold/failurePolicy.ts`; `src/ts/pagefold/geminiWire.ts`; `src/ts/pagefold/httpRenderPort.ts`; `src/ts/pagefold/metrics.ts`; `src/ts/pagefold/prepare.ts`; `src/ts/pagefold/pricing.ts`; `src/ts/pagefold/qualifiedRoute.ts`; `src/ts/pagefold/redaction.ts`; `src/ts/pagefold/renderPort.ts`; `src/ts/pagefold/resolve.ts`; `src/ts/pagefold/runtimePort.ts`; `src/ts/pagefold/serviceAccountImport.ts`; `src/ts/preset/adapter/googleGemini.ts` (8 units, shared); `src/ts/preset/adapter/googleServiceAccount/serviceAccount.ts`; `src/ts/preset/adapter/types.ts` (3 units, shared); `src/ts/preset/dbDefaults.ts`; `src/ts/preset/types.ts`; `src/ts/process/index.svelte.ts` (9 units, shared); `src/ts/process/request/modelPresetBinding.ts` (8 units, shared); `src/ts/process/request/request.ts` (28 units, shared); `src/ts/requestLog.ts` (4 units, shared); `src/ts/storage/database.svelte.ts` (3 units, shared); `src/ts/tokenizer.ts` (5 units, shared)
- Embedded tests: `src/ts/pagefold/budget.test.ts`; `src/ts/pagefold/canonicalTranscript.test.ts`; `src/ts/pagefold/failurePolicy.test.ts`; `src/ts/pagefold/geminiWire.integration.test.ts`; `src/ts/pagefold/httpRenderPort.test.ts`; `src/ts/pagefold/metrics.test.ts`; `src/ts/pagefold/persistence.test.ts`; `src/ts/pagefold/prepare.test.ts`; `src/ts/pagefold/qualifiedRoute.test.ts`; `src/ts/pagefold/redaction.test.ts`; `src/ts/pagefold/resolve.test.ts`; `src/ts/pagefold/serviceAccountImport.test.ts`

#### B — CB-32

- Production: `package.json` (2 units, shared); `pnpm-lock.yaml` (6 units, shared); `server/node/bgOrchestrator.cjs` (3 units, shared); `server/node/pageFoldBgRenderPort.cjs`; `server/node/pageFoldFontCache.cjs`; `server/node/pageFoldPdfReader.cjs`; `server/node/pageFoldPdfService.cjs`; `server/node/pageFoldPdfWorker.cjs`; `server/node/pageFoldRenderRoute.cjs`; `server/node/pageFoldRequestLogRedaction.cjs`; `server/node/request-logs.cjs` (4 units, shared); `server/node/server.cjs` (2 units, shared)
- Embedded tests: `server/node/pageFoldBgRenderPort.test.ts`; `server/node/pageFoldFontCache.test.ts`; `server/node/pageFoldPdfService.test.ts`; `server/node/pageFoldRenderRoute.test.ts`; `server/node/pageFoldRequestLogRedaction.test.ts`; `server/node/pageFoldRequestLogs.integration.test.ts`

#### B — CB-33

- Production: `server/node/pageFoldPrototypeMeasure.cjs`; `server/node/pageFoldProviderFeasibility.cjs`; `server/node/pageFoldStructuralPaidRunner.cjs`; `server/node/pageFoldStructuralRequalification.cjs`
- Embedded tests: `server/node/pageFoldProviderFeasibility.test.ts`; `server/node/pageFoldStructuralPaidRunner.test.ts`; `server/node/pageFoldStructuralRequalification.test.ts`

#### B — CB-34

- Production: `server/node/model-jobs.cjs` (1 unit, shared); `server/node/request-logs.cjs` (10 units, shared); `server/node/usageCostStore.cjs`; `src/lang/en.ts` (1 unit, shared); `src/lang/ko.ts` (1 unit, shared); `src/lib/Setting/Pages/UsageCostPanel.svelte`; `src/lib/Setting/Pages/UsageStats.svelte`; `src/ts/preset/adapter/googleGemini.ts` (1 unit, shared); `src/ts/preset/adapter/types.ts` (1 unit, shared); `src/ts/process/request/jobRecovery.ts` (1 unit, shared); `src/ts/process/request/request.ts` (1 unit, shared); `src/ts/requestLog.ts` (6 units, shared); `src/ts/usage/usagePricing.ts`
- Embedded tests: `server/node/model-jobs.test.ts`; `server/node/requestLogStorageIndex.test.ts`; `server/node/usageCostStore.test.ts`; `src/lib/Setting/Pages/UsageCostPanel.test.ts`; `src/lib/Setting/Pages/UsageCostPanelHarness.test.svelte`; `src/ts/preset/adapter/googleGemini.test.ts`; `src/ts/usage/usageCostClient.test.ts`; `src/ts/usage/usagePricing.test.ts`

#### B — CB-35

- Production: `package.json` (1 unit, shared); `pnpm-lock.yaml` (5 units, shared); `src/lib/Setting/Pages/PromptPreset/PromptPresetBasicInfo.svelte`; `src/ts/parser/chatML.ts`; `src/ts/parser/parser.svelte.ts`; `src/ts/parser/thoughts.ts`; `src/ts/parser/whenExpression.ts`; `src/ts/process/index.svelte.ts` (2 units, shared); `src/ts/storage/database.svelte.ts` (4 units, shared)
- Embedded tests: `src/ts/parser/tests/cbs/conditionals.test.ts`; `src/ts/parser/tests/chatML.test.ts`; `src/ts/parser/tests/thoughts.test.ts`; `src/ts/parser/tests/whenExpression.test.ts`; `src/ts/storage/botPresetIntegrity.test.ts`; `vitest.setup.ts`

#### Excluded (vendored third-party code)

- Production: `src/ts/vendor/base64-js.cjs`; `src/ts/vendor/jsTiktokenLite.js`
- Embedded tests: none
