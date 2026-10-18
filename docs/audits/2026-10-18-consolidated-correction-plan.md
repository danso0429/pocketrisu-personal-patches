# 2026-10-18 — Consolidated defect triage and correction plan

Status: planning document. It changes no production code, tests, manifests or
configuration. No new audit was run. Every classification below comes from
the source reports listed in §0. Where this plan relies on a fact that was
not reproduced, it says so.

## 0. Sources and cohort

| Short name | Document | Branch |
|---|---|---|
| ARCH | `docs/ARCHITECTURE-MAINTAINABILITY-ANALYSIS-2026-10-18.md` (F1–F8) | `docs/architecture-maintainability-analysis` |
| TOOL | `docs/POCKETRISU-PATCHER-TOOLCHAIN-REFACTORING-PLAN.md` (B1–B7, stages 0–6) | `docs/toolchain-refactoring-plan` |
| PRO | `docs/records/2026-10-18-proactive-defect-investigation.md` (findings 1–6) | `claude/bug-investigation-iz2fgk` |
| COV | `docs/audits/2026-10-18-defect-investigation-coverage-assessment.md` (CB batch plan) | `claude/defect-coverage-assessment-2026-10-18` |
| P0 | `docs/audits/2026-10-18-p0-lightweight-defect-screening.md` (P0S-1–5) | `claude/p0-defect-screening-0007jw` |
| US | `docs/audits/2026-10-18-unified-lightweight-defect-screening.md` (US-1–5) | this branch |

Baseline: `3242c3076b02159ca164ead625e5723364be58ae`. Target: PocketRisu
`v1.10.0` (`98e9683`).

Terms used below:

- **Confirmed**: reproduced, or settled by a deterministic static check such
  as a function evaluated on real inputs.
- **Supported**: a strong static or module-level trace, with the end-to-end
  path not run.
- **Unverified**: a plausible lead, or a question of design intent.

Code locations are those given by the source reports. Composed-tree line
numbers drift whenever a pack changes, so re-locate them before editing.

## 1. Executive summary

- The only item that makes a feature unusable is **C-01**: after a server
  restart, a chat can be stuck so that it cannot generate. It combines P0S-1
  (stranded server input) with PRO-1 (orphaned operation parked for 49 h).
  Fixing one without the other does not free the chat (P0 §5.1). It goes
  first, as one joint change.
- The main data-integrity risk is **C-02**: backup import and restore race
  the storage queue, and the journal replay can undo part of a restore. It is
  supported but not reproduced. One live reproduction is needed before the
  fix, and the fix shares a contract with **C-05** (reset hooks versus
  in-flight runs).
- The toolchain has a small set of **confirmed** defects: staging drift
  truncation, the stale-lock race, `latest` report loading, and the broken
  CSS rollback script. It also has one documentation/code contradiction that
  can lead to a wrong delivery (F3/B4). All are cheap. The bundler table and
  the `dist` test (TOOL stage 1) should land before any `src/` change.
- Optional refactoring (F1, F2, F8/B1, B3/F4, stage 6) comes after all
  correctness work. TOOL §F already marks most of it Recommended or Deferred,
  and this plan keeps that classification.

## 2. Consolidated finding register

The severity column reflects this plan's assessment after merging duplicates.
The "Status" column follows the terms in §0.

### 2.1 Runtime defects in the delivered patch set

| ID | Merged from | Problem | Components (pack → composed file) | Severity | Status |
|---|---|---|---|---|---|
| **C-01** | P0S-1, PRO-1, P0 §5.1–5.2 | After a restart, a server-prepared input that is `queued` or `attached` stays non-terminal. Its projection has neither retry nor cancel, and `hasPendingGeneration()` blocks new server inputs, legacy BG starts and server model jobs for that chat. Separately, the client parks the orphaned operation for up to 49 h and shows a misleading "save not confirmed" notice | `lazy-chat-bg-adapter` → `serverChatInputOwner.cjs` (`recoverAll`, `pendingProjection`, `hasPendingGeneration`), `bgOrchestrator.cjs` (DELETE tombstone route, status mapping), `ServerPendingInputs.svelte`, `bgServerInputAdmission.ts`, adapter `manifest.cjs` retention branches (watch `:1574-1578`, boot `:1688-1692`, default reason `:1509`) | **High** (one chat cannot generate until someone cancels the input by hand) | P0S-1: supported (module reproduction). PRO-1: **confirmed** (dynamic) |
| **C-02** | P0S-2 | `importBackupFromSource` runs outside `queueStorageOperation`. Writers accepted during an import are journaled against the old cache, survive the journal reset, and replay over the restored chats | `lazy-chat-sync` (whole-file `server.cjs`), `chatWriteJournal.cjs` `restoreInto`; `/api/backup/import`, `/api/backup/server/restore` | **Medium** (a restore can be partly undone without notice) | Supported (static) |
| **C-03** | P0S-3 | Journal records with `awaitingMetadata` never expire if their stub never reaches `database.bin`. They replay forever, and 128 of them block new chat creation (`CHAT_JOURNAL_CAPACITY`) | `lazy-chat-sync` → `chatWriteJournal.cjs` (`clearAfterDatabasePersist`, capacity), `server.cjs` full write | Low–medium | **Confirmed** at module level; client trigger not reproduced |
| **C-04** | US-2 | The client-build fence does not cover `POST /api/bg-orchestrate` or `POST /api/bg-orchestrate-input/{claim,attach,abandon}`. `attach` writes a client-supplied chat into canonical state | `client-build-fence` → `clientBuildFence.cjs` `isWriterRoute`; `lazy-chat-bg-adapter` routes | Medium | Fence classification **confirmed**; impact unverified |
| **C-05** | P0S-4, P0 §5.3 | Reset hooks discard input and commit recovery rows but do not cancel active runs. The commit gate checks the input receipt only when the input record exists, so a run that finishes after a reset can commit into the restored database | `serverChatCommitOwner.cjs` `writeCanonicalState` (`:488-503`), four reset hooks in `server.cjs` | Unknown | Unverified |
| **C-06** | US-3 | `PUT /api/external-request-headers` does not call `checkActiveSession`. Comparable settings writers do | `personal-settings` → `externalRequestHeaders.cjs` `registerExternalHeaderRoutes` | Low | **Confirmed** (static) |
| **C-07** | US-4 | Draft upsert is unfenced while draft delete is fenced. Drafts of deleted chats are never purged | `bg-preserve` → `bgDraftRoutes.cjs`; chat deletion paths | Low | Supported |
| **C-08** | P0S-5 | Detached turns are serialized across all chats. This widens the C-01 window and adds latency between chats | `bgOrchestrator.cjs` `runDetachedTurn` (`:1081-1085`) | Design question | Unverified (intent unknown) |
| **C-09** | US-5 | `extractThoughts` costs O(n·k) on deeply nested `<Thoughts>` input | `parser-hardening` → `thoughts.ts` | Low | Unverified |

### 2.2 Delivery-tool and repository defects

| ID | Merged from | Problem | Components | Severity | Status |
|---|---|---|---|---|---|
| **C-10** | ARCH F3, TOOL B4 / stage 0 | The README and design document describe an `allDefault: false` admission gate that no code reads. An unqualified pack would ship if the README procedure were followed | `README.md:1262-1277`, `docs/PATCHER-V2-DESIGN.md:38-46`, `src/catalog.cjs` `resolveProfile`, `src/manager.cjs` `packEtag` | Medium (process trap) | **Confirmed** |
| **C-11** | PRO-2 | The staging drift check compares only the first 100 tracked changes. The complete set produces 130 | `src/staging.cjs:82`, `:224` | Medium–low | **Confirmed** |
| **C-12** | PRO-3 | Breaking a stale root lock can let two patchers into the critical section. Release then ignores `ENOENT` silently | `src/manager.cjs:244-252` | Low | **Confirmed** |
| **C-13** | US-1 (× ARCH F1) | `scripts/rollback-personal-css-ui.cjs` fails with `Patch ordering cycle`. Its prefix filter also drops 48 `editor-*` units, including save-path guards. 40 references from other packs point at dropped units | `scripts/rollback-personal-css-ui.cjs:14-24`, `test/personal-settings.test.cjs:420` | Medium (the recovery tool is unusable; it fails closed) | **Confirmed** |
| **C-14** | TOOL B2 | The bundler module table is kept in three places, and `dist` has no local protection. An installer-only breakage can pass local tests | `scripts/build-installers.cjs`, `dist/`, tests | Medium (preventive) | Confirmed by TOOL |
| **C-15** | PRO-4 | One invalid `conflict-*.json` makes `report --report-id latest` fail | `src/risu-report.cjs:129` | Low | **Confirmed** |
| **C-16** | PRO-5 | The resolver does not re-run `autoWhen` or dependency expansion after a supersession that a dependency introduced | `src/resolver.cjs:178-206` | Low, latent (no pack declares `supersedes`) | **Confirmed** on a synthetic catalog |
| **C-17** | ARCH F5 | One version string covers several different builds | `package.json`, `CHANGELOG.md`, `dist`, CI | Medium–low | **Confirmed** |
| **C-18** | ARCH F7 | Marker-induced ASI hazards are guarded only by a manual audit | `src/compose.cjs:78-82`, `scripts/audit-generated-markers.cjs`, CI | Low (has caused one real repair) | **Confirmed** |
| **C-19** | ARCH F6 | Plugin-host verification lives outside CI | `scripts/probe-bg-plugin-*`, CI | Medium–low | Confirmed by ARCH |
| **C-20** | PRO-6, ARCH §7, TOOL G.3 | The governance repository README and manifest are stale, and its premise of verifying pack subsets is superseded by all-or-nothing delivery | `danso0429/patch-verification-governance` | Documentation | **Confirmed** |

### 2.3 Maintainability items (no known defect)

| ID | Merged from | Item | Classification (TOOL §F / ARCH §6) |
|---|---|---|---|
| **M-1** | ARCH F8, TOOL B1, stages 2–3, stage 5 items 1/2/4 | Five copies of the path-safety and atomic-write helpers have diverged | Characterization tests: essential. Extraction: recommended. Hardening: optional |
| **M-2** | ARCH F4, TOOL B3, stage 4 | Duplicated plan/gate/apply flow in `runCli`; always-true guards; pack metadata that no longer matches units | Recommended |
| **M-3** | ARCH F1 | Layered patches hide the real content of the most-changed files. Composed-output command, then folding with byte-identical gates | Recommended, incremental. Its upgrade-path CI check is in W4 |
| **M-4** | ARCH F2 | Whole-file replacements pin 692 KB of upstream text verbatim | Do at the next upstream upgrade |
| **M-5** | TOOL B5, stage 6 | Composition performance | Deferred until a need is measured |
| **M-6** | TOOL B6, B7 | Target-identity readers and loader one-liners | Do not change (TOOL §F) |

### 2.4 Duplicates and non-defects

- F3 and B4 describe one issue (C-10). F8 and B1 describe one issue (M-1).
  F4 and B3 overlap in the CLI flow (M-2).
- PRO-1 and P0S-1 are distinct defects with one user symptom (C-01).
- P0S-2 and P0S-4 share the reset contract. Their fixes must be designed
  together, but they are recorded separately because their confidence
  differs.
- US-1 is an instance of the fragility F1 describes: other packs order
  against layered `editor-*` units.
- Checked and not defects (no action): the translation cache key (PRO), the
  CB-14 credential order (same as upstream), CB-17 cache revalidation, CB-07
  credential scoping, the CB-12 sandbox launch, CB-21/32 limits, and the
  CB-22 migration script (US). The items ARCH §5 judged acceptable stay
  accepted.

## 3. Dependencies

```
Decisions D-1..D-9 (§6) ─┬─> W1-A (C-01) ──> W3 (C-04 fence on the same routes)
                         ├─> W1-B (C-02 + C-05, shared reset contract)
                         └─> W2-A (C-10 doc/code)
W0 verification ─> W1-B, W3 (C-04)
W2-B (C-14 bundler + dist test) ──> every later src/ change (C-11, C-12, C-15, C-16, M-1, M-2)
M-1 stage 2 (characterization) ──> M-1 stage 3 (extraction) ──> stage 5 hardening
C-17 rule (version bump per content change) applies to every wave that rebuilds dist
```

There are two independent lanes:

- the **runtime pack lane**: `patches/*` payloads and manifests (W1, W3);
- the **toolchain lane**: `src/`, `scripts/`, CI (W2, W4, W5).

The lanes can proceed in parallel. They meet only at `dist` rebuilds and
version bumps.

## 4. Correction plan

Every pack change in W1 and W3 follows the same delivery rules:

- bump the owning pack's version and the package version (C-17);
- add a CHANGELOG entry;
- rebuild `dist` and confirm it is byte-reproducible;
- pass CI: repository tests, apply on `v1.10.0`, the embedded suites,
  `pnpm check`, `pnpm build`, and the revert round trip.

### W0 — Cheap verification before fixing (no code change)

These checks turn "supported" into "confirmed" where the fix design depends
on it. Each runs in a scratch composed tree.

| Step | For | Action | Exit evidence |
|---|---|---|---|
| W0-1 | C-01 | Browser reproduction: queue a server input behind another chat's run, restart the server, reload | A table of state → available user action. Records whether any UI path issues the DELETE |
| W0-2 | C-02 | Live restore with the backup-source test gate. During the import, issue one chat-content write and let one BG commit land | Restored chat compared with the backup. Journal rows after the import |
| W0-3 | C-04 | Grep the client calls behind `/api/bg-orchestrate*` to check whether they all go through `clientBuildFetch` (or otherwise send `x-client-build`) | A list of call sites with header yes/no. This decides the regression risk of W3-1 |
| W0-4 | C-05 | One test: start a run, fire a reset hook, let the run finish | Whether the commit lands, and under which revision |
| W0-5 | C-08 | Find the design intent in the BG-preserve documents, or measure throughput with two chats | A documented reason, or a throughput defect to file |

### W1 — Runtime correctness and data integrity (highest priority)

#### W1-A — Stranded server inputs and orphaned operations (C-01)

- **Stages** (one PR; the parts are commits that can be reviewed separately):
  1. *Server-side terminal classification.* In `recoverAll()`, move
     server-prepared `queued` and `attached` records whose volatile settings
     are lost to a durable state with one documented exit. This mirrors the
     client-prepared branch, which already writes `blocked_edit`. The choice
     of state is decision D-1. Either way, `hasPendingGeneration()` must stop
     returning true once the record cannot run.
  2. *Projection and UI.* `pendingProjection()` exposes `cancelAllowed: true`
     for those records. `ServerPendingInputs.svelte` gains a cancel action
     that calls the existing DELETE route, which writes a tombstone and calls
     `settleSynchronously(...,'cancelled')`.
  3. *PRO-1 correction.* In both the watch and the boot branches of the
     adapter manifest, remove `start-retry-required`,
     `interrupted-before-result`, `interrupted-after-main` and
     `delivery-failed` from the `server-owned-uncommitted` retention branch.
     Replace the default reason `commit-receipt-invalid` with a truthful
     label such as `no-commit-evidence`.
- **Regression risks.**
  - Settling an input that could still have run. The drain says by design
    that it never resumes paid work after a restart, so the risk is low.
  - The UI must never offer cancel for a live attached input.
  - `chat-committed` hydration must keep precedence.
  - `anchoredCommitConflictNotice` and the `input-*` status mapping.
  - Model jobs are unblocked for that chat. This is the intent; confirm it
    with decision D-2.
- **Verification criteria.**
  - Extend `serverChatInputOwner.test.ts`. The restarted-`attached` and
    restarted-server-prepared-`queued` cases reach the chosen state;
    `hasPendingGeneration` returns false; the projection allows cancel.
    The existing `:860-883` expectation is updated deliberately.
  - Client tests for the four orphaned states × {legacy, server-owned} ×
    {watch, boot}: the marker is cleared, exactly one notice is shown, and
    no peek follows wake events.
  - `chooseServerInputBase` returns ready after a cancel.
  - Re-run the W0-1 reproduction: the chat can send again without manual
    server intervention.
- **Rollback.** Revert the pack version. Records already moved to terminal
  states stay terminal, which is safe because they were unrunnable.

#### W1-B — Import/restore serialization and the reset contract (C-02, then C-05)

- **Precondition.** W0-2. If it does not reproduce, downgrade C-02 and keep
  only the guard below as hardening.
- **Stages.**
  1. *Writer refusal during import (preferred minimal change).* While
     `importInProgress` is set, `/api/patch`, the chat-content patch and full
     write, and BG commit publication answer with a retryable refusal. They
     reuse the existing 503 admission semantics that the client already
     classifies (`BG_SAVE_ADMISSION_UNAVAILABLE`), so no client change is
     needed. The alternative is to run both import routes inside
     `queueStorageOperation`, as snapshot restore does. That blocks the
     queue for the whole import (decision D-3).
  2. *Reset contract (C-05), after W0-4.* At each reset hook, either cancel
     the active registry runs for the affected database, or make
     `writeCanonicalState` fail closed when a server-owned operation has no
     input record (decision D-4).
  3. Document the two invariants that P0 §5.3 found broken only on import:
     "journal content is newer than `database.bin`" and "a reset discards
     recovery rows". The best place is the journal and committer module
     headers.
- **Components.** The `lazy-chat-sync` whole-file `server.cjs` replacement
  (watch M-4: edit it as a hunk where possible), `serverChatCommitOwner.cjs`,
  and the reset hook units.
- **Regression risks.**
  - Autosave starts seeing refusals during long imports. They must stay
    retryable and must not become `ChatConflictError`.
  - Server restore's own writes must not be refused by the guard.
  - The snapshot-restore path must stay unchanged.
- **Verification criteria.**
  - The W0-2 reproduction now restores the backup exactly.
  - A route-level test shows that each writer returns the retryable refusal
    while `importInProgress` is set.
  - The W0-4 test shows the chosen outcome.
  - `backupSnapshot`, `backupSource`, `restoreSafety`, `chatWriteJournal`,
    `serverChatCommit*` and `bgServerChatCommitRoutes` tests still pass.

#### W1-C — Journal orphan expiry (C-03)

- **Stage.** Add a reconciliation rule to the journal (decision D-5). Retire
  an `awaitingMetadata` record when its character no longer exists, or after
  N persists or days without a stub. Expose the orphan count in
  `/api/db/stats`.
- **Regression risk.** Retiring a record whose root patch is merely delayed
  loses a new chat. The rule must be conservative: it should check that the
  character is missing, or use an age well above the client retry window.
- **Verification.** Extend the P0 module reproduction: orphans are retired
  after the rule fires, a real pending create survives, and capacity
  recovers. Then reproduce the client trigger: force the root patch to fail,
  then reload.

### W2 — Delivery-tool correctness (parallel lane)

| Step | Items | Change | Regression risk | Verification |
|---|---|---|---|---|
| W2-A | C-10 | Settle decision D-6 (C4a documentation versus C4b gate). For C4a, edit the README and the design document and mark `contracts` as reserved. For C4b, filter in `resolveProfile`, and include the field in `packEtag` only when it is `false` | C4a: none. C4b: catalog membership and ETags | C4b: the ETags of all current packs are unchanged (compare `list --json` before and after), and a new test shows an `allDefault:false` root pack is absent |
| W2-B | C-14 | Keep the bundler table in one place. Add a local test that the built `dist` loads and passes a smoke plan. This is TOOL stage 1 | Very low (byte-identical output) | `cmp` against the committed `dist`; the new test fails on a deliberately removed module |
| W2-C | C-11 | Compare the complete tracked-change list and truncate only in report output. Consider content hashes so that further edits of an already-modified file are visible | Low. A larger diff could flag new drift that was previously invisible, which is the intent | PRO's 131-file reproduction now raises `STAGING_SOURCE_DRIFT`; existing staging tests pass |
| W2-D | C-12 | Break a stale lock by atomic rename plus a token re-check, or re-read before unlinking. A missing lock at release is an error | Low; touches lock acquisition on every run | PRO's deterministic two-patcher reproduction admits exactly one; all 25 manager tests pass |
| W2-E | C-13 | Decision D-7: repair or retire. To repair, replace the `editor-` prefix filter with an explicit list of CSS-UI unit IDs, drop the blanket `after` augmentation (or add only edges that do not form cycles), and add a test that plans against the **real** catalog. To retire, delete the script and its documentation and say how to recover | Repair: the new list must not drop save-path units | `rollback-personal-css-ui.cjs plan` succeeds on a composed `v1.10.0` tree; the plan's removed units are exactly the CSS-UI list; no other pack's `after` points at a removed unit |
| W2-F | C-15 | Skip invalid `latest` candidates with a warning | Low | PRO-4 reproduction returns the valid report |
| W2-G | C-16 | Iterate supersession together with auto and dependency expansion until a fixed point. Required before the first `supersedes` use; may be scheduled late | Low today (no pack uses it); the resolution order must stay unchanged for the current catalog | PRO's synthetic catalogs; `resolveProfile('all')` output is identical for the real catalog |

The order inside W2 is A → B → C/D/F (any order) → E → G. E is a script,
not part of `src/`, so it can run at any time after its decision.

### W3 — Consistency gaps (low severity, after W1-A)

| Step | Item | Change | Regression risk | Verification |
|---|---|---|---|---|
| W3-1 | C-04 | Add the four routes to `isWriterRoute` and to the fence test, or document them as intentionally unfenced (decision D-8) | **False lock-out of Send** if a client caller lacks the header (W0-3 decides this) | Fence test rows for each route; a stale-tab reproduction gets 426 on start/attach; a current tab sends normally |
| W3-2 | C-06 | Call `checkActiveSession` in the PUT route | A deactivated tab can no longer save headers (intended) | A route test returns 423 for an inactive session |
| W3-3 | C-07 | Purge `bg-stream-draft:` keys when a chat or character is deleted. Optionally add a long TTL | Low | A deletion test leaves no draft key |
| W3-4 | C-09 | Only if a timing probe shows a cost: one forward scan with a depth counter | Very low | Existing parser tests; a nested-input timing probe |
| W3-5 | C-08 | Depends on W0-5: document the serialization, or open a separate design task | — | — |

### W4 — CI guards (prevents regressions of fixed classes)

The order follows ARCH §6. Each guard is a small `ci.yml` step.

1. C-18: run the marker audit on the patched tree.
2. C-19: run the portable plugin probes. Sandbox-dependent probes stay
   outside CI until a runner provides `bwrap` and a `systemd-run` scope.
3. M-3: add the upgrade-path check (previous release → current, compared
   with a fresh apply).
4. M-2/F4: plan each root pack's closure on its own.
5. C-17: embed a build content hash and fail CI when `dist` changes without
   a version bump.
6. C-13 (if repaired): add the real-catalog rollback plan to the repository
   tests.

Verification: each guard is shown to fail once on a deliberately broken
scratch branch, then pass on main.

### W5 — Optional refactoring (only after W1–W2)

This follows TOOL §E/§F unchanged.

| Order | Item | Precondition |
|---|---|---|
| 1 | M-1 stage 2: filesystem-safety characterization tests | W2-B |
| 2 | M-1 stage 3: extract `src/fs-safety.cjs`, one module per commit | Stage 2 |
| 3 | M-2: CLI consolidation | W2-B plus new phase tests |
| 4 | M-1 stage 5: hardening items, each with its own CHANGELOG entry | Stage 3 |
| 5 | M-3: composed-output command, then folding one file at a time | Byte-identical composed output gate |
| 6 | M-4: whole-file replacements to hunk units | Next upstream upgrade |
| 7 | M-5: composition performance | A measured need |

C-20 (governance repository): update its README and manifest, or mark the
repository superseded. It is independent of every wave and needs the
owner's call (decision D-9).

## 5. Do not do

All the TOOL §F "should not be undertaken" items stand. In particular:

- do not change persisted formats, marker text or the `packEtag` inputs,
  except additively for a C4b decision;
- do not split `manager.cjs` by size;
- do not migrate to ESM or TypeScript, or adopt a bundler;
- do not touch payloads or anchors as part of toolchain work.

This plan adds three rules:

- Do not mix a W1 runtime fix with any refactoring in the same commit. The
  layered-unit structure (M-3) makes review of mixed diffs unreliable.
- Do not widen `isFinishedServerFailure()` to `found:false` as the PRO-1
  fix. PRO rates that alternative as having a broader blast radius.
- Do not add C-04 routes to the fence before W0-3. A missing header would
  turn the fix into a total send outage.

## 6. Unresolved decisions

| ID | Decision | Needed before | Recommendation |
|---|---|---|---|
| D-1 | The terminal state for server-prepared inputs whose settings were lost on restart: a durable `blocked_edit` with cancel only, a new `settings_lost` state, or immediate `cancelled` | W1-A | A durable non-runnable state with an explicit cancel. It keeps the user informed and avoids silently discarding their input |
| D-2 | Whether `execution_unknown` should still block server model jobs for that chat | W1-A | No, once the record is known to be unrunnable |
| D-3 | Writer refusal during import, or serializing the import through the storage queue | W1-B | Refusal: a smaller change that reuses the existing retryable semantics |
| D-4 | Reset hooks cancel active runs, or the committer fails closed without an input record | W1-B stage 2 | Decide after W0-4. Failing closed is the safer default |
| D-5 | The orphan journal expiry rule (missing character, age, persist count) | W1-C | A missing character, plus a conservative age |
| D-6 | `allDefault`: C4a documentation or C4b gate | W2-A | C4a, unless pre-admission qualification is still practised |
| D-7 | Repair or retire the CSS rollback script | W2-E | Retire, unless the legacy CSS UI still has users. Its value has fallen as the catalog grew |
| D-8 | Fence or explicitly exempt the server input routes | W3-1 | Fence, if W0-3 shows every caller already sends the header |
| D-9 | Update or retire the governance repository | Any time | Mark it superseded. Its subset premise no longer applies |

## 7. Limitations

- This is a synthesis. No finding was re-tested for this document, and no
  test suite was re-run. The confidence of each item is inherited from its
  source.
- Seven coverage batches (CB-08, 23, 24, 25B, 30, 31, 33) remain unscreened,
  and several more were screened only lightly (US §2). Further defects may
  exist, especially in CB-31 (PageFold credentials and cost) and in the P0
  areas the P0 report §7 lists as unexamined.
- No browser, WebKit, multi-tab or live-server scenario backs any item
  except PRO-1.
- Line references come from the source reports. Composed-tree lines move
  whenever a pack changes.
