# 2026-10-19 to 2026-10-20 — Phase B units B2 and B3 (session ownership, storage epoch, reset-orphaned markers, operations and results)

Status: working record of one session (2026-10-19 09:29 UTC to 2026-10-20 03:16 UTC). Phase B of the 2026-10-18 correction plan is complete on branch `claude/phase-b-storage-reset`: B1a and B1b were committed in the previous session; this session added B2 (four units in three commits) and B3 (four units in four commits). Nothing in this record has been pushed, merged to `main`, applied to a live installation or verified on a phone.

Times are UTC unless stated otherwise. No chat content, character names, identifiers or credentials are recorded. All validation used synthetic data.

## 0. Where everything is

| Item | Value |
|---|---|
| Branch | `claude/phase-b-storage-reset` |
| Base of this session | `7760965` (B1b-2, patcher `0.2.4-experimental.71`) |
| Head after this session | `0451de9` (patcher `0.2.4-experimental.78`) |
| Target | PocketRisu `v1.10.0` (`98e968339d1b3f91b9dac85bb3f2ebb5f90f9d14`) |
| Pushed | no |

Commits added (oldest first):

| Commit | Unit(s) | Patcher version | Pack versions after the commit |
|---|---|---|---|
| `4f9436d` fix(bg): send writer session headers on background writes | B2-1, B2-2 | `.72` | BG adapter 0.7.70, lazy chat sync 0.5.17 |
| `11c1821` fix(bg): gate background start, claim and attach on the writer session | B2-3 | `.73` | BG adapter 0.7.71 |
| `bd85ccd` fix(storage): make pre-reset sessions stale after a storage reset | B2-4 | `.74` | lazy chat sync 0.5.18, server backup snapshot core 0.1.6 |
| `3830144` feat(bg): report the storage epoch on start and status responses | B3-1 | `.75` | BG adapter 0.7.72 |
| `27b773a` fix(bg): clear input markers that a storage reset orphaned | B3-2 | `.76` | BG adapter 0.7.73 |
| `5cc1a41` fix(bg): report operations orphaned by a storage reset as missing | B3-3 | `.77` | BG adapter 0.7.74 |
| `0451de9` fix(bg): stop delivering results that a storage reset orphaned | B3-4 | `.78` | BG adapter 0.7.75, server backup snapshot core 0.1.7 |

Stable remains `v0.2.3`.

Authority used for the scope (all in this repository):

- Previous session record: `docs/records/2026-10-18-final-handoff-phase-a-and-phase-b-session.md` (branch `claude/session-record-2026-10-18`), §4.7, §6, §7.
- Approved design: `docs/audits/2026-10-18-phase-b-design-decisions.md` (this branch), H-3 and H-4.
- Final correction handoff: `docs/audits/2026-10-18-final-correction-implementation-handoff.md` (branch `claude/final-correction-handoff-2026-10-18`), §3 Phase B and Phase C (C-06, S-1).
- Evidence reports: R2 §5.2 I-8 (`docs/audits/2026-10-18-r2-restore-write-reset-contract.md`) and R3 §4 (`docs/audits/2026-10-18-r3-client-build-and-session-gates.md`), branch `claude/r1-restart-recovery-investigation-d1r7in`.

## 1. Requested scope

- **B2:** a writer-session header helper (R3 S-1); session checks on BG start, claim and attach (not on cancel); 423 handling on those BG calls; invalidation of tabs that were open before a restore (R2 I-8).
- **B3:** the storage epoch in start and status responses; the epoch recorded on client markers; after a restore, a marker whose operation is `missing` under a newer epoch is cleared once with a notice.
- Delivery: commits on the branch only.

Later in the session the owner extended B3 with two units (B3-3, B3-4) after browser validation and plan review found that B3-2 alone did not cover an operation that was running during a restore (section 6).

## 2. Method

### 2.1 Roles

The project's orchestration routing was followed:

| Role | Used for |
|---|---|
| Main session (Claude Opus) | interpretation, plans, decisions, reviewing every delegated result, gates, commits |
| `haiku-explorer` subagents | read-only exploration of the composed tree (server routes and session lock; client BG calls and markers) |
| Codex `gpt-6-astra` (read-only) | plan review: B2/B3 plan (one round), B3-3/B3-4 addendum (two rounds) |
| Gemini 4 Argon via the Antigravity CLI | test scenarios from the plan only (two requests, both `SUCCESS`: 31 scenarios for B2/B3, 15 for B3-3/B3-4) |
| Codex `gpt-5.6-sol` (workspace-write) | blind tests before implementation (two batches, five correction rounds in total) |
| `opus-implementer` subagents | implementation, a fresh agent per unit from a written brief file (seven agents) |
| Codex `gpt-6.1-sol` (read-only) | code review of every unit diff |
| `validation-runner` subagents | browser validation of B2 and B3 on built candidates (three runs) |

Implementation briefs were written to files and handed over by path. Follow-up corrections for a unit were sent to that unit's implementer; a new implementer was started for each new unit.

### 2.2 Test tree and gates

- Test tree: a clone of PocketRisu `v1.10.0` (`98e9683`) in a scratch directory, `node dist/pocketrisu-patcher.cjs apply --root <copy> --json`, `pnpm install --frozen-lockfile`, all runs with `NODE_OPTIONS=--no-experimental-webstorage`.
- Gates per commit, run by the orchestrator: installer built twice and compared with `cmp`; `node --test test/*.test.cjs`; `pnpm test` (client and server configurations); `pnpm test:compat`; `pnpm check`; `pnpm build`; `node server/node/bgOrchBundle.build.cjs`; apply then revert on a second fresh copy with an empty `git status --porcelain`.
- From the second commit on, these gates were run with a local candidate-gates script (outside this repository) that was improved during the session (section 8). Each commit's `dist` was checked to be byte-identical to the installer the gate pinned and tested.
- Baseline at `7760965`, reproduced at the start: client 2591 passed / 4 skipped, server 700 / 12, compat 113 / 5, `pnpm check` 0 errors / 0 warnings.
- Per commit: package version bumped, every changed pack's version bumped, CHANGELOG entry added, `dist` rebuilt, version assertions updated in `test/bg-independent-g1.test.cjs`, `test/g22a-capability.test.cjs` and `test/lazy-chat-sync.test.cjs` where the asserted pack changed.
- Tests of units not yet being committed were kept outside the worktree (with SHA-256 records) so that a commit's `dist` never contained another unit's tests.

### 2.3 Blind test conventions

- The plan's unit table was the closed label list: B2-1 Writer session header helper · B2-2 BG client session headers and 423 handling · B2-3 BG write route session gate · B2-4 Post-reset session invalidation · B3-1 Storage epoch in start and status responses · B3-2 Epoch-stamped markers and reset clearance · B3-3 Reset-orphaned operations report missing · B3-4 Reset-orphaned results are not delivered.
- Each unit's new tests sit in exactly one `describe('[<ID>] <title>', ...)` block per file. Labels were checked mechanically on receipt and before each commit; no label violations occurred.
- On receipt, every new test was run in a composed tree to confirm it failed only because the behaviour was missing (assertion failures, no import or syntax errors). Tests that already passed were regression guards of unchanged behaviour.
- Where a blind test turned out to contradict the plan or to be nondeterministic, it went back to the same Codex test-author session (section 5.3); the implementer never edited a fixed test.
- One file (`bgSessionEpochRoutes.phaseB.test.ts`) holds both the B2-3 and the B3-1 blocks. It was committed with only the B2-3 block in `11c1821` and completed with the unchanged B3-1 block in `3830144`.

## 3. Facts established before planning

Checked in the composed tree (PocketRisu 1.10.0 with patcher `7760965`):

- `server/node/session-lock.cjs` is upstream code, byte-identical to 1.10.0 and owned by no pack. API: `register(id)` records a boot time and adopts the lock only when none is active; `checkWrite(id, userActive)` passes the active id, adopts a free lock, lets a session that booted after the active session's last write take over (with a user gesture) or write passively, and refuses everything else; an empty id always passes; `peek(id)` returns `active | free | fresh | stale`. No invalidation existed.
- `checkActiveSession(req, res)` in `server.cjs` reads `x-session-id` and `x-user-active` and answers `423 {error:'Session deactivated'}`. Chat writes, `/api/write`, `/api/patch` and the backup and restore routes call it; no BG route did.
- BG routes: `POST /api/bg-orchestrate` (both start paths), `POST /api/bg-orchestrate-input/{claim,attach,abandon}`, `GET /api/bg-orchestrate-status/:operationId`, `DELETE /api/bg-orchestrate/:operationId`, all behind `sessionAuthMiddleware` only.
- Client: `NodeStorage.authFetch` set `x-session-id` (a per-tab id kept in `sessionStorage`) and `x-user-active: 1` after a pointer or key gesture within 15 s, and dispatched `risu-session-deactivated` on 423; the only listener shows the "active tab changed" alert and reloads. BG calls sent no session headers. The legacy delegated start used a plain `fetch`; on `rejected` it ran the browser fallback generation unless the reason was `server_statistics_invalid` or `chat-generation-active`.
- Server-input markers lived under `bg-server-input-v3:` with a strict field allowlist (unknown fields delete the entry); the prior-marker check before a send cleared `missing`+`uncertain` and blocked `missing`+`accepted` (`prior-operation-unknown`) for up to 49 h. Legacy pending markers (`bg-orch-pending:`) were parsed field by field and finished silently on `missing`.
- The storage epoch (`internal/storage-epoch/v1`, absent = 0) was readable through `serverChatCommitOwner.currentStorageEpoch()`; every reset runs through `runStorageReset(kind, {prepare, apply})`.

## 4. Owner decisions in this session

| # | Decision |
|---|---|
| D1 | `POST /api/bg-orchestrate-input/abandon` is not session-gated, like `DELETE`. Gated: both starts, claim, attach. |
| D2 | The session-lock invalidation is a new hunk unit set in the `lazy-chat-sync` pack on the upstream `session-lock.cjs`. |
| D3 | After B3 browser validation failed (section 6.1), a reset-cancelled operation is answered by the server as `404 missing` (option chosen over a server flag plus client rule, and over client-only epoch inference). |
| D4 | All findings of the B3-3 plan review, including the legacy result cleanup gap in B1b-2, are fixed inside Phase B (units B3-3 and B3-4). |
| D5 | Post-Phase-B order: Phase C, C-21 and the probe-script marker namespace are done as one bundle before BG work resumes; then Phase A, Phase B and the bundle are merged into `main`; then BG resumes at the G2.2 plan review. The remaining correction items were recorded as a follow-up step outside the BG goals (section 9). |

Decisions taken by the orchestrator within the approved scope:

- Two existing tests that hard-coded the v3 marker namespace were changed to the v4 namespace (`bgServerInputLedger.test.ts:40` and `bgServerInputClient.test.ts:123`; namespace only, same intent), because the plan's review finding required the namespace move.
- Rejected review findings are listed with reasons in section 5.

## 5. Plans and reviews

### 5.1 B2/B3 plan, Astra review (one round)

All six findings adopted:

1. A v3 reader in a still-open older tab deletes markers that carry new fields → new namespace `bg-server-input-v4:`, v3/v2/v1 migrated on read.
2. Deleting a marker does not guarantee a single notice when two readers race → one synchronous re-read-and-remove that reports whether it removed an entry; only that caller notifies.
3. Legacy markers already on result key version 1 skip the status probe and finish silently on the result route → read the exact status once before that silent finish.
4. The failed-input and cancelled-input settlement readers discard 404 bodies → apply clearance there too.
5. Accepted start bodies include several reuse branches and the queued `202 {accepted:true, started:false}`, and the start reconciler dropped response metadata → enumerate every accepted body and carry the epoch through the reconciler outcome.
6. With "unknown boot = stale", the 50-entry boot cap could make a legitimate post-reset active session stale → the active-id check keeps precedence; registration at exactly the watermark millisecond is stale (one extra reload, accepted).

### 5.2 B3-3/B3-4 addendum, Astra review (two rounds)

Round 1 (all adopted):

1. High: reset cleanup deleted `bg-orch-state-op:` and `bg-orch-result-op:` rows but not the legacy chat-keyed `bg-orch-result:` rows, and the legacy result GET served them without any reset check; a freshly loaded tab could merge a pre-reset `legacy-client-owned` result into the restored chat and save it (code path confirmed, not reproduced).
2. Medium: after the awaited server chat commit only a `cancelled` commit outcome stopped publication, so a reset during the await could still write result and operation-state rows.
3. Medium: the run registry's `cancelledByReset` flag is set before the reset applies and stays after a failed reset, so it is not proof that storage was replaced → decisions use the epoch only.
4. Medium: a `DELETE` before any operation row existed wrote a tombstone without an epoch → that writer records the current epoch.

Round 2 (both adopted):

1. High: server-input admission ran before the registry reuse check, so a same-id start after a reset recreated a current-epoch input record that masked the orphaned run in status → refuse such starts before any admission write.
2. High: the non-detached full-preview path published legacy results without registry registration or epoch → capture the epoch at request start and publish nothing when it changed.

Deployment assumption recorded with round 2: applying a patcher version restarts the server, so publishers in flight before an upgrade do not survive into a later reset.

### 5.3 Blind tests

| Batch | Units | Files (all registered in pack manifests) | Corrections by the test author |
|---|---|---|---|
| 1 | B2-1..B3-2 | `lazy-chat-sync/files-1.10/src/ts/storage/nodeStorage.sessionHeaders.phaseB.test.ts`, `lazy-chat-bg-adapter/files-1.10/src/ts/bgClientSession.phaseB.test.ts`, `lazy-chat-bg-adapter/files-1.10/server/node/bgSessionEpochRoutes.phaseB.test.ts`, `lazy-chat-sync/files-1.10/server/node/sessionLockReset.phaseB.test.ts`, `server-backup-snapshot-core/files/test/compat/session-reset-b2.test.ts`, `lazy-chat-bg-adapter/files-1.10/src/ts/bgEpochMarkers.phaseB.test.ts` (49 tests) | One: two rows of the B3-2 epoch matrix built their "pre-upgrade" marker by spreading `{}` over a helper that always included epoch fields, so they did not test a pre-upgrade marker; the rows now delete those fields. |
| 2 | B3-3, B3-4 | `lazy-chat-bg-adapter/files-1.10/server/node/bgResetOrphanStatus.phaseB.test.ts` (27), `lazy-chat-bg-adapter/files-1.10/server/node/bgResetOrphanResults.phaseB.test.ts` (14), `server-backup-snapshot-core/files/test/compat/reset-orphans-b3.test.ts` (7) | Two: (a) the route harness returned `kvGetUpdatedAt: () => Date.now()`, which raced the register-time retention sweep and made a "route does not write" assertion fail in about 6 of 8 isolated runs; the harness now uses a fixed timestamp and takes the write baseline after registration. (b) One row required a new 409 on the registry branch for a mismatched-coordinate orphaned run, which the plan does not define; it now asserts the existing fallthrough to `404 missing`. |

Some B2-2 and B3-2 tests check source text of `bgOrchestrate.ts` (helper usage, notice text, reader coverage) because the large client module has no behavioural harness for those paths; those parts were additionally covered by code review and browser validation.

## 6. Units

### 6.1 B2-1 and B2-2 — `4f9436d`

- New owned file `lazy-chat-sync/files-1.10/src/ts/storage/writerSession.ts`: the gesture-recency code (`isUserActive`), the per-tab writer id (same `sessionStorage` key, same minting), `writerSessionHeaders()` and `notifySessionDeactivated(response)`. The code was moved from `nodeStorage.ts` unchanged; `nodeStorage.ts` re-exports the two helpers and `authFetch` uses them with identical headers, conditions and 423 dispatch. The separate module was needed because importing `nodeStorage` from `bgOrchestrate.ts` loaded the storage module graph into an existing test's partial mocks (109 failures).
- New `lazy-chat-bg-adapter/session-gate-units.cjs` (hunks on `bgOrchestrate.ts`): the session headers on the server-input start, the legacy start (still a plain `fetch`; converting it is Phase C F-2), claim and attach; `notifySessionDeactivated` after each. Abandon, `DELETE` and GETs send no session headers.
- `bgServerInputStart.ts`: a 423 on the start resolves `rejected` with reason `session-deactivated` after one attempt, without status polling; the existing rejected path clears the marker and keeps the draft.
- Legacy start: a 423 sets `startRejectionReason = 'session-deactivated'` and resolves `rejected`; the fallback decision stops the watch without the browser fallback generation and without an extra notice.
- Code review: one finding adopted — the 423 must be decided on the status alone; reading the body first could turn a stalled body into an "ambiguous" outcome with status polling and a repeated POST. Both start paths now return before reading the body.
- Gates: client 2602 / 4, server 700 / 12, compat 113 / 5, check 0 / 0, repository tests 341 passed / 0 failed / 3 skipped.

### 6.2 B2-3 — `11c1821`

- In `session-gate-units.cjs`: `checkActiveSession` is passed into the `bgOrchestrator.cjs` dependencies (the registration line is written by the BG adapter's plugin-host unit, not by `lazy-chat-sync`, so no `lazy-chat-sync` change was needed), and a `sessionWriteGate` middleware is placed after `sessionAuthMiddleware` on `POST /api/bg-orchestrate`, `/claim` and `/attach`. Abandon, `DELETE`, GETs, result routes and the internal input-drain start (which calls the handler directly) are not gated. Without the dependency the routes behave as before.
- A 423 is answered before any input record, operation state, run or provider call. Id-less requests still pass; the active id passes; a fresh session with a gesture takes over. The fence (426) and the storage-reset refusal (503) are app-level middleware mounted earlier and still answer first.
- Code review: no findings.
- Gates: client 2602 / 4, server 710 / 12, compat 113 / 5, check 0 / 0.

### 6.3 B2-4 — `bd85ccd`

- Five hunk units `lazy-chat-sync:session-lock:{watermark,register,check-write,peek,invalidate-before}:1.10` on the upstream `session-lock.cjs`, declared inline in `patches/lazy-chat-sync/manifest.cjs`:
  - `invalidateBefore(timestamp)` clears the active session and raises a watermark (never lowers it).
  - After a watermark, a non-active id whose boot is `<=` the watermark or unknown is refused by `checkWrite` even while the lock is free, `peek` reports `stale`, and `register` of such an id does not adopt a free lock.
  - The active-id check keeps precedence. With no invalidation the lock behaves as upstream (upstream `session-lock.test.ts` unchanged and passing); revert restores the upstream file byte for byte.
- `lazy-chat-sync/files-1.10/server/node/server.cjs`, `runStorageReset`: after `await apply(...)` succeeds and inside the reset slot (before the reset flag clears), `sessionLock.invalidateBefore(Date.now())`. All five reset kinds pass through `runStorageReset`, including the epoch-only empty folder import; failed or refused resets do not call it.
- Effect: every tab open before the reset gets 423 on its next checked write (chat saves, `/api/write`, `/api/patch`, BG start/claim/attach), shows the deactivation alert and reloads; the reloaded tab registers again (same id, new boot time) and writes normally.
- Code review: no findings (same-millisecond registration, the restoring tab and multiple tabs recover through re-registration).
- Gates: client 2602 / 4, server 715 / 12, compat 116 / 5, check 0 / 0.

### 6.4 B3-1 — `3830144`

- New `lazy-chat-bg-adapter/storage-epoch-units.cjs` (15 units on `bgOrchestrator.cjs`): a helper `storageEpochField()` returns `{storageEpoch}` only for a non-negative safe integer from `currentStorageEpoch()` and `{}` otherwise. It is spread into six accepted start bodies (server-input run already active, queued 202, active run reuse, non-queued durable reuse, registry already running, new run) and eight status bodies (chat-committed, input command, run in this process, parked results v1 and v0, durable queued `404 missing`, orphaned durable state, final `404 missing`).
- Refusal and error bodies do not carry it. The read is one keyed KV lookup per response.
- Code review: no findings (client classifiers tolerate extra fields; no consumer hashes or compares these bodies exactly).
- Gates: client 2602 / 4, server 722 / 12, compat 116 / 5, check 0 / 0.

### 6.5 B3-2 — `27b773a`

- `bgServerInputLedger.ts`: prefix `bg-server-input-v4:`; v3, v2 and v1 are legacy prefixes read and migrated without epoch fields; markers accept `epochVersion: 1` and a non-negative integer `storageEpoch` (only together); 49 h expiry and 128-entry cap unchanged.
- `bgServerInputStart.ts`: the outcome carries `storageEpoch` from the start or status response that established acceptance (included only for `accepted` with an epoch).
- `bgServerInputClient.ts`: markers are written with `epochVersion: 1`; promotion to `accepted` persists the epoch; any accepted status with an epoch stamps a marker that lacks one (never overwriting); the prior-marker check applies reset clearance to both `uncertain` and `accepted` markers.
- New owned `bgStorageResetClearance.ts`: `isStorageResetMissing(marker, statusBody)` is true for a `missing` body with epoch E when the marker's recorded epoch M < E, or when the marker has no `epochVersion` and E > 0; `clearMarkerForStorageReset(storage, kind, operationId, statusBody?)` re-reads the stored marker, re-evaluates the rule against it, removes it and returns `true` only if it removed an entry.
- New `epoch-marker-units.cjs` (hunks on `bgOrchestrationPending.ts` and `bgOrchestrate.ts`): legacy pending markers carry `epochVersion`/`storageEpoch`; the notice `백업 복원으로 이 입력은 처리되지 않았어요` (via `notifyWarning`, source `bg-input`) is shown only by the caller that removed the marker; covered readers: `probeOperationResultKeyVersion`, the boot read for result key version 1 before its silent finish, `reconcileCommittedServerInputMarkers`, the accepted-marker loop, the failed-input and cancelled-input proof reads, and the prior-marker check before a send. `readServerOperationStatus` (cancellation proof) is unchanged.
- Code review round 1: adopted — acceptance seen without recording the epoch (uncertain promotion in non-committed states, the boot probe) left markers that could never be cleared; every accepted status now stamps. Rejected (1) — stamping migrated pre-upgrade markers with an observed acceptance epoch: intended by the plan, and a recorded acceptance epoch is better evidence than the E > 0 heuristic. Rejected (2) — the race between an accepted status read and the settlement proof read: accepted limitation (section 10).
- Code review round 2: adopted — removal decided on the marker captured before the asynchronous status read; the removal now re-evaluates the current stored marker.
- Gates: client 2615 / 4, server 722 / 12, compat 116 / 5, check 0 / 0.

### 6.6 Browser validation of B2

Built candidate of `bd85ccd`, headless Chromium with two independent contexts, local stub OpenAI-compatible endpoint, synthetic seed with `fmIndex: -1` on every chat, server bound to loopback.

| Scenario | Result |
|---|---|
| Normal send (server-input) carries `x-session-id` and `x-user-active`, 200, reply appears | pass |
| Legacy delegated start (empty-input send) carries the headers, 200 | pass |
| Stale tab: send refused (the UI send hit 423 on `/api/write` before the BG start), deactivation alert, reload, no browser generation, chat unchanged; direct `POST /api/bg-orchestrate` and `/claim` from the stale tab → 423 | pass |
| Backup import from tab A; tab B (not reloaded) refused with 423, reloads, then sends; A sends after its reload | pass |
| `DELETE` and `abandon` from a stale tab not refused with 423 | pass |
| Single tab: no 423, no deactivation, no related console errors | pass |

Not covered: the reroll path ran client-direct in this configuration, so its start request headers were not observed.

## 7. The B3 gap found by the browser, and units B3-3 and B3-4

### 7.1 First B3 browser run (candidate `27b773a`)

Scenarios 1 (epoch on start and status, v4 marker with `epochVersion:1, storageEpoch`), 3 (same-epoch `missing` keeps blocking without a notice), 4 (pre-upgrade v3 marker cleared with one notice) and 5 (one notice per cleared marker) passed. Scenario 2 failed: a server-input operation in progress during a backup import answered the status route with `200 {accepted:true, state:'cancelled', storageEpoch:<new>}` after the import, so the marker stayed and every new send in that chat was blocked.

Cause (traced in code): the status route fell through to the run registry after the input record was gone; `cancelAll` (B1b-2) keeps reset-cancelled runs as registry tombstones to protect operation identity, and the route reported the tombstone. Broken assumption: design H-4 relied on fact F8 ("a wiped operation answers `missing`"), which was measured before `cancelAll` existed.

### 7.2 B3-3 — `5cc1a41`

- New `lazy-chat-bg-adapter/reset-orphan-units.cjs`. Helper `resetOrphanedEpoch(recorded)` is true only when `recorded` is a non-negative safe integer older than a readable current epoch.
- Status route: answers `404 {accepted:false, operationId, state:'missing', storageEpoch}` when a retained registry run with matching coordinates, a durable operation row, or a parked result (operation-keyed or legacy) whose own, run or durable-row epoch is older than the current epoch. Each branch's existing coordinate-conflict check answers first; a run with mismatched coordinates falls through as before; committed and input-command branches are unchanged; the route does not write. The `cancelledByReset` flag is not used.
- Admission guard: a start that reuses the id of a retained older-epoch run is refused before any admission write — server-input requests with `409 {handled:false, started:false, operationId, reason:'input_command_identity_conflict'}` (an existing pre-admission reason, so the client resolves `rejected` and keeps the draft), legacy starts with `reason:'operation-reset'`. A mismatched-coordinate orphaned run on the server-input path answers `operation-coordinate-conflict` before admission.
- `DELETE` before any operation row exists records the current epoch on its tombstone.
- Code review round 1: adopted — the first implementation answered 409 for an orphaned registry run with mismatched coordinates (the fixed test required it, the plan did not); test and code were corrected to keep the fallthrough. Round 2: no findings.
- Gates: client 2615 / 4, server 749 / 12, compat 116 / 5, check 0 / 0; the B3-3 test file passed 27/27 in repeated isolated runs after the harness fix.

### 7.3 B3-4 — `0451de9`

- `storage-reset-units.cjs` (the B1b-2 recovery cleanup inside every reset transaction) also deletes every `bg-orch-result:` row; the compat test covers six reset entry points.
- In `reset-orphan-units.cjs` (13 more units):
  - Result records written by runs carry the run's `storageEpoch`.
  - The operation-keyed result GET answers its existing absent shape `200 {found:false, operationId, operationState:'missing', ...}` and the legacy result GET its existing `{found:false, stage, status}` for a reset-orphaned record, before any claim, lease, consume or acknowledgement write, without deleting it. Epochless records are served as before.
  - After the awaited server chat commit: if the epoch changed, the run publishes nothing and performs no owner settlement (their storage was replaced); if only a user cancel happened (epoch unchanged), the run publishes nothing but still performs the previous input settlement (`markRunFailureSynchronously` when the commit did not report `committed`).
  - The intermediate publisher skips publication when the epoch changed; the failure fallback marks the run cancelled when the epoch changed, so the existing "cancelled: no fallback/result" branch applies.
  - The non-detached full preview reads the epoch at request start, passes it to the intermediate publisher and skips its final publication when it changed; its records carry that epoch.
- Code review round 1: adopted — the first implementation skipped the input settlement for a user cancel during the commit (the reviewer reproduced the input staying `attached` instead of `failed`); fixed as described above.
- Gates: client 2615 / 4, server 763 / 12, compat 123 / 5, check 0 / 0.

### 7.4 Second B3 browser run (candidate `0451de9`)

| Scenario | Result |
|---|---|
| 1. Start and status carry `storageEpoch`; the v4 marker holds `epochVersion:1, storageEpoch` during the run and is cleared after completion | pass |
| 2. Send held by the stub; backup import from another context; status becomes `404 missing` with the new epoch; the sending tab gets 423 and reloads; the stale marker is cleared with the notice exactly once; the next send is admitted and completes | pass |
| 3. Same-epoch accepted v4 marker for a missing operation: send still blocked, no reset notice | pass |
| 4. Pre-upgrade v3 marker (no epoch fields), server epoch > 0: cleared with one notice, send admitted | pass |
| Extra: v4 marker with an older epoch: cleared with one notice, send admitted | pass |
| 5. One notice per cleared marker | pass |
| 6. After scenario 2, both result routes return no result for the old operation | pass (see limit 1) |
| 7. Same-id server-input start for the old operation from the page → `409 input_command_identity_conflict`; status stays `missing`; no new input | pass |

No external network request completed during this run (browser requests to external font/CSS hosts were blocked; the server showed no hub, stats or update traffic).

## 8. Candidate-gates script improvement (local tooling, not in this repository)

The local script that runs the gates above for a patcher checkout was improved from a reviewed improvement plan (implemented by a `sonnet-implementer`, reviewed by Codex `gpt-6.1-sol`, four review findings fixed):

- The output directory is never deleted; only a new or empty directory is accepted, and physical paths equal to, containing or inside the worktree or the pristine cache, `/` and the home directory are refused.
- Options are order-independent (`--tag` no longer erases `--commit`); missing, empty, multi-line or unknown option values exit 2; tag and commit values are validated as whole strings.
- One run per worktree (non-blocking `flock` on a lock file whose location does not depend on the environment).
- The built installer is pinned in the output directory and that copy is used for every apply and revert; its SHA-256 is recorded and compared with the worktree `dist` at the end.
- Dependent steps print `SKIP (<reason>)` after a prerequisite fails and force `FAIL`; preparation failures (including a pristine cache with ignored or untracked files, checked with `--untracked-files=all`, and an output directory that cannot be created) print `RESULT: FAIL` and exit 1.
- The round-trip tree keeps its `git status` and full diff in logs and is kept on any failure.
- `NODE_OPTIONS` is preserved with `--no-experimental-webstorage` appended once; a summary file records tool versions, SHAs, the pinned installer hash and a per-step PASS/FAIL/SKIP table.

Verified with a controlled failure harness (65/65; the same harness fails 9 cases on the pre-review version) and with a full run on a clean clone of `7760965` (19/19 steps, the baseline counts above). ShellCheck was not available.

## 9. Follow-up step outside the BG goals

In the planning repository's BG ordered-goals document, a section "13. 후속 step" was added after the BG goals (commit `4e19679` there, not pushed). It records that the remaining correction items are separate from the BG goals, lists them with start conditions (Phase D runtime items C-03, C-07, C-08, C-09; toolchain items C-10–C-16; CI guards; the C-13 decision; C-20; Phase E), and points to the Phase documents in this repository as the source to read when an item starts.

## 10. Remaining limits

1. **Result-route state name after a reset.** For an operation orphaned by a reset, the operation-keyed result GET answers `{found:false, operationState:'cancelled', ...}` (the registry tombstone's state) while the status route answers `404 {state:'missing'}`. No result is delivered (observed in browser scenario 6). Whether the boot recovery of a legacy marker that reads this field finishes silently instead of showing the reset notice was not traced. Making the result route report `missing` for reset-orphaned operations would align the two.
2. **Reset between an accepted status read and the settlement proof read (B3-2).** If a reset lands exactly between those two reads, the proof read clears the marker with the notice, but the caller still treats the settlement as unconfirmed: that one send is blocked with the existing notice (`prior-operation-needs-reconciliation`) and the watch, boot or accepted-loop path may also show its existing failure notice. The next send proceeds. Fixing it requires a distinct settlement result propagated to every caller.
3. **Pre-upgrade marker heuristic.** A marker written before epoch stamping (no `epochVersion`) whose operation is `missing` while the server epoch is above 0 is cleared with the reset notice even if no reset happened since that marker was written (approved H-4 heuristic). An accepted status observed later stamps such a marker and removes the heuristic for it.
4. **Notice uniqueness across tabs.** Within one tab the notice appears once per cleared marker; two tabs racing on the same marker may each show it once.
5. **Older open tabs.** A tab running a build from before B3-2 does not see v4 markers; after an upgrade such tabs are refused by the client-build fence on their next write and reload.
6. **Restoring tab for non-import resets.** For snapshot restore, save-folder import and database removal, the restoring tab itself is pre-reset; its next checked write gets 423 with the generic "active tab changed" alert and a reload.
7. **Same-millisecond registration.** A tab that registers in the same millisecond as the reset watermark is stale and reloads once more.
8. **Coverage limits.** The non-detached full-preview guard is covered by a source-structure test only; several client reader paths in `bgOrchestrate.ts` are covered by source-text tests plus code review and browser runs; the reroll path's session headers were not observed in the browser; server backup restore (as opposed to backup import) was not exercised in the browser; nothing was verified on iOS or a real phone.
9. **Deployment assumption.** B3-4 assumes that applying this patcher version restarts the server, so publishers from an older version cannot write after the first post-upgrade reset.
10. **Probe scripts.** `scripts/probe-bg-stream-preview.mjs`, `scripts/probe-bg-failure-ui.mjs` and `scripts/probe-bg-marp-lifecycle.mjs` still read and wait on the `bg-server-input-v3:` namespace; their "settled" waits would pass without seeing the real v4 marker. They are scheduled for the post-Phase-B bundle.

## 11. Usage

| Tool | 5 h window | Weekly | Notes |
|---|---|---|---|
| Claude Code | +221% (three window resets) | 62% → 92% | Subagents (completion notices): seven `opus-implementer` about 1.21 M tokens, three `validation-runner` about 0.42 M, two `haiku-explorer` about 0.30 M, one `sonnet-implementer` about 0.09 M. Work paused once for a 5 h reset. |
| Codex | +206% (three window resets) | 48% → 81% | Plan reviews (three), two test batches with corrections, about eleven code reviews; one call stopped on the 5 h usage limit after it had already written its file change, resumed after the reset. Account-wide figures include overlapping automatic reviews from other sessions. |
| Antigravity Argon | — | 2.36% → 5.01% | Two scenario requests, both `SUCCESS`. |

## 12. Next steps

1. Bundle before BG work (owner decision D5): Phase C (fence F-1–F-4: claim/attach/abandon in the writer-route list; the legacy start converted to `clientBuildFetch` and the start route fenced in the same `dist`; both start reconcilers treat `426 CLIENT_UPGRADE_REQUIRED` as a definitive non-start; settings PUT session headers and checks S-1–S-3 using `writerSessionHeaders()`), C-21 (create chats with `fmIndex: -1`; the owning pack for upstream creation paths needs an owner decision), and the probe-script namespace update (limit 10). Limit 1 can be considered in the same bundle.
2. Merge Phase A, Phase B and the bundle into `main` (owner approval needed for push and merge), then refresh the G2.2 plan's baseline and resume BG at the G2.2 plan review.
3. Push, live application and phone verification each need a separate owner decision.
