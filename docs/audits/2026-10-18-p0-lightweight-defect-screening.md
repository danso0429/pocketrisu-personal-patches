# 2026-10-18 — P0 lightweight defect screening (CB-02, 05, 09A, 10, 11, 15, 16, 18, 19)

Status: first-pass, breadth-first screening. No application source, manifest,
test, configuration or existing report was changed. This is **not** a
correctness certification: "no significant concern" below means only that the
screened paths did not show one.

Times are UTC. No chat content, names, identifiers or credentials are recorded.

## 0. Cohort and method

| Item | Value |
|---|---|
| Repository | `danso0429/pocketrisu-personal-patches` |
| Baseline | `3242c3076b02159ca164ead625e5723364be58ae` |
| Batch plan | `docs/audits/2026-10-18-defect-investigation-coverage-assessment.md` on `claude/defect-coverage-assessment-2026-10-18` |
| Prior findings not repeated | `docs/records/2026-10-18-proactive-defect-investigation.md` at `26dee75` (findings 1–6), the 2026-10-16/17/18 records |
| Target | PocketRisu `v1.10.0` `98e968339d1b3f91b9dac85bb3f2ebb5f90f9d14` |
| Composed tree | pristine clone + `node dist/pocketrisu-patcher.cjs apply --root <copy> --json`, then `pnpm install --frozen-lockfile` |

Method, per batch: read the batch definition (§7.2 of the plan), located entry
points and state transitions in the **composed** files, read the owning code
paths far enough to judge them, checked the existing tests for the state in
question, and traced cross-batch callers where a suspicion depended on them.
Reproductions were run as a throw-away script in the scratch directory and as
one temporary vitest file inside the scratch clone, deleted afterwards.

Line references point into the composed tree. Where the composed file is an
owned payload that is byte-identical to its source, the same lines apply to the
payload; this was verified for `serverChatInputOwner.cjs`,
`ServerPendingInputs.svelte`, `bgServerInputAdmission.ts` (all in
`patches/lazy-chat-bg-adapter/files-1.10/`) and `chatWriteJournal.cjs`
(`patches/lazy-chat-sync/files/`). `server.cjs` lines refer to the composed
output, not to any single pack payload.

## 1. Screening summary

Three new issues are worth a focused follow-up; one of them blocks a user
workflow.

| ID | Batch(es) | Finding | Severity | Classification |
|---|---|---|---|---|
| P0S-1 | CB-09A (× CB-09B, CB-11, model jobs) | A server restart while a server-prepared input is `attached` or `queued` leaves a non-terminal input that the UI cannot retry or cancel. Every new send in that chat is then refused, including legacy BG starts and server model jobs. | **High** (one chat cannot generate until someone cancels the input by hand) | Strongly supported suspicion. Reproduced at module level (server owner and client admission); the end-to-end UI path was read, not run. |
| P0S-2 | CB-19 (× CB-15, CB-10) | Backup import and server-backup restore are not serialized with the storage queue. Chat writes accepted during an import survive the journal reset, and at the end of the import their replay overrides the restored chat payloads. | Medium (a restore can be partly undone without notice) | Strongly supported suspicion (static trace; not reproduced against a live server) |
| P0S-3 | CB-15 | A journal record for a new chat whose stub never reaches `database.bin` is kept and replayed forever. After 128 such records, new chat creation fails with `CHAT_JOURNAL_CAPACITY`. | Low–medium | Confirmed at module level; the client trigger path is plausible but was not reproduced |
| P0S-4 | CB-10 (× CB-19) | Reset hooks delete input-owner records while a run can still be in flight. The commit gate checks the input receipt only when the input record exists, so a run that finishes after a reset can commit into the restored database. | Unknown | Needs further investigation |
| P0S-5 | CB-05 | Detached orchestration turns are serialized globally (one pipeline at a time across all chats). This widens the restart window of P0S-1 and adds cross-chat latency. | Design observation | Needs further investigation (may be intentional) |

Already known and not re-investigated: reference finding 1. A
restart-interrupted server-owned operation is parked for up to 49 hours. It
interacts with P0S-1 (see §5).

## 2. Coverage table

| Batch | Paths examined (screening depth) | Notable findings | Existing validation evidence used | Result |
|---|---|---|---|---|
| CB-02 Composition hotspots | Express middleware order in composed `server.cjs` (`:982-1023`: static → build fence → JSON/delta parser → PageFold/raw parser → proxy form parser → text); duplicate `app.<verb>(path)` across all composed server modules (none); route registration of `bgOrchestrator.cjs` before `expressErrorMiddleware` (`server.cjs:7820-7826`); `DefaultChatScreen.svelte` send gate order (`:515-590`); duplicate top-level localisation keys in `en.ts`/`ko.ts` (only upstream duplicates plus two type-parameter false positives) | One composition consequence, under P0S-1: three independent owners (`hasPendingGeneration`, the legacy start guard and the model-jobs main guard) share one predicate, so one stuck input blocks all three paths | Plan §3.3 hotspot map; CI apply/revert (mechanical only) | No new concern in the parts screened. `pnpm check` was not run. The 11-batch `DefaultChatScreen` gate table and the `anchorPolicy: 'first'` audit were **not** done |
| CB-05 BG orchestrator lifecycle | `bgOrchestrationRunRegistry.cjs` (start/cancel/finish/discard, capacity, tombstone retention); shared registry wiring (`server.cjs:7662-7663`, `bgOrchestrator.cjs:1073-1075`); `handleOrchestrateStart` start gate, durable `queued` write, detached run `finally` (`bgOrchestrator.cjs:1433-1510`, `:1740-1800`); retention sweep wiring (`:2523-2601`); head of `bgOrchestrationResultRetention.cjs` | P0S-5. Registry lifecycle is consistent: discard only for unstarted or retryable-no-provider runs, finish with a TTL tombstone, a hard capacity bound, and an operation-id identity check | `bgOrchestrationResultRetention.test.ts` passed (part of the 266-test server run below) | No defect found in the registry. Bundle input list (`bgOrchBundle.build.cjs`) **not** examined |
| CB-09A Server input admission and execution | `serverChatInputOwner.cjs` admission (`:895-1086`), volatile settings snapshot (`:472`, `:1009`), `beginTransform`, `loadExecution` (`:1442-1524`), `settleDurablySynchronously`, `pendingProjection` (`:1709-1762`), `recoverAll` (`:1764-1825`), `retireTerminal`, `discardRecovery`; `serverChatInputDrain.cjs`; cancel tombstone route (`bgOrchestrator.cjs:2166-2196`); status mapping (`:1948-2000`); startup reconcile (`server.cjs:7928`) | **P0S-1** | `serverChatInputOwner.test.ts` covers the restarted-queued case (`:860-883`) and treats it as an intended `blocked` state. No test covers the restarted-attached case or the client's way out | Defect lead with module reproduction |
| CB-10 Commit and publication | `serverChatCommitOwner.cjs` `commitGenerationResult`, `writeCanonicalState`, `publishCanonicalState`, `recoverBeforeWriteUnchecked` (`:953-1003`), `retireRecoveries`, `discardRecovery`; publication-write gates in `/api/patch`, chat-content delta and full write | P0S-4. The `recovered` comparison in `recoverBeforeWrite` is sound because publication always replaces the cached database object (`{ ...current }`) | `serverChatCommitOwner.test.ts`, `serverChatCommit.test.ts`, `bgServerChatCommitRoutes.test.ts` passed | The commit state machine table was not built; the replay-idempotency proof was not attempted |
| CB-11 Client recovery and terminal states | `bgServerCommitHydration.ts` disposition and terminal-evidence classifiers; parked-outcome writers in `bgOrchestrate.ts` (`unverified-parked`, `conflict-parked`, `ack-pending`); `reconcileServerPendingInputCommands`; `ServerPendingInputs.svelte`; `cancelObservedServerOperation` and `cancelServerOrchestratedChat` callers | No new defect in this batch. It is the client side of P0S-1: neither recovery nor UI gives a non-terminal server input any way out after a restart | `bgFinishedOperationFlow.test.ts` passed | The state × path table for every server state was **not** produced |
| CB-15 Server chat persistence | `chatWriteJournal.cjs` (all), `chatDelta.cjs` (all); composed `server.cjs` chat-content GET/patch/full write (`:5626-5900`), `/api/patch` (`:4396-4640`), persist and debounce path (`:860-940`), `initChatStore` and `ensureChatStore`, the four reset sites | **P0S-3**. Revision and 409 semantics: delta requires a base revision (400 otherwise); full write requires a base revision for an existing chat (428) or `If-None-Match: *` for a create (412). Both are serialized in `queueStorageOperation` and journal before memory publication | `chatWriteJournal.test.ts`, `chatDelta.test.ts`, `serverChatCommit.test.ts` passed; capacity refusal is tested only as a unit (`chatWriteJournal.test.ts:437-503`) | Crash-between-stages matrix **not** run |
| CB-16 Client save pipeline and asset retry | `persistTrackedChanges` and `triggerSave` in `globalApi.svelte.ts` (`:1098-1590`): chat payloads before root, failure and publication-block bookkeeping, rebase cap, durable save; `nodeStorage.saveChatContent` delta/full/409/412/lost-ACK confirmation (`:1500-1700`); `authFetch` 503 classification (`:372`); `assetUploadRetry.ts` (all) and its single caller (`nodeStorage.ts:496-505`) | None. Asset retry terminates after 3 attempts behind a 3-slot lane. A 503 with `BG_SAVE_ADMISSION_UNAVAILABLE` falls through to a full write that is gated by the same admission, so it cannot bypass recovery | `assetUploadRetry.test.ts` passed | `risuSave.ts` rebase internals, multi-tab and offline matrices **not** examined |
| CB-18 Haejeok persistence ordering | `haejeokPersistenceSafety.ts` (all); callers in `scriptings.ts:1189`, `DefaultChatScreen.svelte:766`, `plugins.svelte.ts:429`; `requestDurableChatPayloadSaveImpl` and `requestDurableSaveImpl` | None. A failed pre-generation save stops generation after the user message has been published locally and the draft cleared. The rejection reaches the global `unhandledrejection` alert (`bootstrap.ts:348-353`), and the message stays dirty for autosave | `haejeokPersistenceSafety.test.ts` passed | The concurrent BG case required by the plan was **not** reproduced |
| CB-19 Backup snapshot and restore safety | `backupSnapshot.cjs` (all); `capturePointInTimeBackupSource` (`server.cjs:1242-1281`); `/api/backup/server/save`; `importBackupFromSource` (`:2728-3031`) and both callers (`/api/backup/import`, `/api/backup/server/restore`); `/api/db/snapshots/restore` (`:6874-6970`) with `commitSnapshotRestore`; `restoreSafety.cjs` function map | **P0S-2**. Point-in-time capture is sound: it flushes in the queue, then pins a WAL read transaction on a separate read-only connection. Snapshot restore is queued and transactional | `backupSnapshot.test.ts`, `backupSource.test.ts`, `restoreSafety.test.ts` passed | The interrupted-restore matrix was **not** run; client restore UI not read |

Regression context: one run of 11 server test files
(`chatWriteJournal`, `chatDelta`, `serverChatCommit`, `serverChatInputOwner`,
`serverChatCommitOwner`, `bgServerChatCommitRoutes`, `backupSnapshot`,
`backupSource`, `restoreSafety`, `bgOrchestrationResultRetention`,
`serverChatInputDrain`): 266 passed. Three client files
(`haejeokPersistenceSafety`, `assetUploadRetry`, `bgFinishedOperationFlow`):
97 passed. The full suites were not re-run. The coverage assessment's baseline
counts stand.

## 3. Prioritized findings

### P0S-1 — A restart strands server-prepared inputs and blocks the chat

**Classification:** strongly supported suspicion. Module-level reproduction;
end-to-end UI not run.

**Mechanism.**

1. On admission, the input owner keeps the settings snapshot only in process
   memory (`settingsSnapshotMode: 'volatile'`,
   `serverChatInputOwner.cjs:1009`; `settingsSnapshots` map at `:472`). The
   drain says by design that it "never resumes paid work after a process
   restart" (`serverChatInputDrain.cjs:3-6`).
2. After a restart, `recoverAll()` handles two cases differently:
   - client-prepared queued inputs become a durable `blocked_edit` that can be
     retried (`:1791-1798`);
   - server-prepared inputs are left unchanged. A `queued` record is only
     reported as `blocked`/`settings_context_unavailable` (`:1808-1814`); an
     `attached` record is re-published and stays `attached` (`:1816-1822`).

   In both cases `inputState` stays non-terminal
   (`TERMINAL_INPUT_STATES`, `:32`).
3. `pendingProjection()` reports such records as:
   - `attached` → `state: 'execution_unknown'`, `cancelAllowed: false`,
     `retryAllowed: false` (`:1716-1724`, `:1742-1746`);
   - server-prepared `queued` → `state: 'blocked_edit'`,
     `retryAllowed: false`, because `retryAllowed` requires
     `inputState === 'blocked_edit'`.
4. The client admission refuses any new server-owned input while a pending
   input is `blocked_edit` or `execution_unknown`
   (`bgServerInputAdmission.ts:31-35` → `unresolved-server-input`).
   `DefaultChatScreen.svelte:536-568` returns with "서버 입력을 시작하지 않았어요"
   and does not fall back.
5. `ServerPendingInputs.svelte` offers only a retry button, gated on
   `retryAllowed` (`:21-27`, `:125-134`). It has no cancel control. The only
   other cancel entry points are `cancelServerOrchestratedChat` (the active
   operation) and `cancelObservedServerOperation`. The latter is driven by the
   in-memory stream preview, which is empty after a restart.
6. The same predicate `hasPendingGeneration()` (`:1698-1707`) also blocks:
   - legacy BG starts (`bgOrchestrator.cjs:1434-1437`,
     `chat-generation-active`);
   - server model jobs for that chat (`server.cjs:3615-3617` →
     `model-jobs.cjs:480-487`, HTTP 409 "A server generation is pending for
     this chat").

**Reproduction (temporary vitest in the scratch clone, harness from
`serverChatInputOwner.test.ts`).** Steps: admit → `beginTransform` →
`attachTransformed` → new owner instance (restart) → `recoverAll()` twice.

| Observation | Value |
|---|---|
| `recoverAll()` result, both passes | `[{status:'attached'}]` |
| Record after restart | `inputState: 'attached'`, `transformState: 'completed'` |
| `pendingProjection` | `[{state:'execution_unknown', cancelAllowed:false, retryAllowed:false}]` |
| `loadExecution` | `blocked` / `settings_context_unavailable` |
| `hasPendingGeneration('char-1','chat-1')` | `true` |
| `chooseServerInputBase({... pendingInputs: projection})` | `{ready:false, reason:'unresolved-server-input'}` |

Nothing in the owner, the drain, the retention sweep (`retireTerminal` retires
only terminal records) or startup recovery moves this record to a terminal
state. The DELETE route can do it: a not-active cancel writes a tombstone and
calls `settleSynchronously(...,'cancelled')` (`bgOrchestrator.cjs:2184-2196`).
But no UI path found in this screening issues that DELETE for a pending input
after a restart.

**Why the window is not small.** Detached turns run one at a time across all
chats (P0S-5), so an input can wait `attached` or `queued` behind another
chat's generation. Server restarts happen on every patch update or deployment.
The operation-notice source already classifies these inputs as irretryable
(`settingsLost`, `bgOrchestrator.cjs:2540-2547`), so the user gets a notice
but no way to act on it.

**Contradictory evidence checked.** `serverChatInputOwner.test.ts:860-883`
asserts the restarted-queued state as intended (`blocked`). That shows the
state is designed; it does not show an exit. No test covers the
restarted-attached case or the client's way out.

**Recommended focused follow-up (CB-09A/CB-09B joint).** Decide the intended
exit: a durable terminal `blocked_edit` for server-prepared inputs with lost
settings (the client-prepared branch already does this), a cancel action in
`ServerPendingInputs.svelte`, or both. Reproduce end to end in a browser:
restart the server while an input is attached behind another chat's run. Check
whether `execution_unknown` should keep `hasPendingGeneration()` true for
model jobs.

### P0S-2 — Backup import and restore race the storage queue

**Classification:** strongly supported suspicion (static trace).

**Mechanism.**

- `importBackupFromSource` runs outside `queueStorageOperation`. Its callers
  `/api/backup/import` (`server.cjs:5024-5125`) and
  `/api/backup/server/restore` (`:5363-5442`) gate only on `importInProgress`.
  That flag is checked by the other import/capture routes and **not** by the
  write routes (`/api/patch`, chat-content patch and full write, BG commit
  publication).
- The import opens a manual transaction (`BEGIN`, `:2811`) and commits every
  5,000 entries (`COMMIT`/`BEGIN`), awaiting the input stream in between.
  better-sqlite3 uses one connection, so a concurrent queued writer's KV
  writes become part of the import's open transaction and commit with it.
- The first batch deletes the chat journal and the commit/input recovery rows
  (`:2828-2832`). A chat-content write accepted after that point is checked
  against the **old** in-memory `fullChatStore`, because `invalidateDbCache()`
  runs only after the stream and the inlay swap (`:3004`). The write therefore
  succeeds and journals a pre-restore payload.
- When the import finishes, `initChatStore(dbObj)` (`:3016`) calls
  `chatWriteJournal.restoreInto()` (`:547`). For non-commit records this
  replaces the restored chat with the journaled payload when the IDs match
  (`chatWriteJournal.cjs:368-379`). Restoring an older backup of the same
  chats is the common case, so the IDs usually match. The next persist then
  writes the override into `database.bin`.
- A BG commit that completes during the import publishes into the old cache,
  schedules a persist, and leaves commit and operation records. Those records
  survive the reset and are recovered against the restored database (see
  P0S-4).
- Contrast: `/api/db/snapshots/restore` runs inside `queueStorageOperation`,
  and its comment calls out exactly this overwrite risk (`:6886-6888`).

**Upstream relation.** Pristine `v1.10.0` also runs `importBackupFromSource`
outside the queue (`pristine server.cjs:2155`). The pack set adds the durable
journal and the BG owners, which turn a transient race into a replay that
survives the restore.

**Likelihood.** Restores are rare, and only the active session can write
(`checkActiveSession`). Writers are the active tab's autosave loop, BG result
adoption, and server-owned commits of runs that are still in flight. A
moderately sized backup takes a long time to import, so the window is real.

**Recommended focused follow-up (CB-19 with CB-15).** Reproduce on a live
server with the backup-source test gate: start a server restore, issue one
chat-content write and let one BG commit land mid-import, then compare the
restored chat with the backup. If confirmed, serialize both import routes
through the storage queue (as snapshot restore does) or refuse writers while
`importInProgress`.

### P0S-3 — Orphaned "awaiting metadata" journal records never expire

**Classification:** confirmed at module level; trigger path plausible, not
reproduced.

**Mechanism.**

- A full write that creates a chat journals the payload with
  `awaitingMetadata: true` (`server.cjs` chat-content full write,
  `awaitingMetadata: !currentChat || wasAwaitingMetadata`).
- `clearAfterDatabasePersist()` deletes such a record only once the persisted
  stripped database contains the stub (`chatWriteJournal.cjs:381-400`). If
  the stub never arrives, nothing else deletes the record. The record is
  replayed into `fullChatStore` on every load and counts towards
  `DEFAULT_MAX_AWAITING_RECORDS = 128` (`:9`, `:202-226`).
- The stub can fail to arrive because the client saves chat payloads before
  the root patch (`globalApi.svelte.ts:1153-1176`, then the root patch). A root
  patch that keeps failing, a closed tab, or deleting the new chat or its
  character before the root patch succeeds all leave the payload without a
  stub.

**Reproduction** (script in the scratch directory, real module):

1. Stage 3 awaiting records with `maxAwaitingRecords: 3`.
2. Run 5 `clearAfterDatabasePersist` calls with a database lacking those
   stubs.
3. Construct a new journal (restart).

Results:

| Step | Outcome |
|---|---|
| After the persists | 3 awaiting records remain |
| After the restart | the same 3 load and replay into the chat store |
| A new create | refused with `CHAT_JOURNAL_CAPACITY` |

**Impact.** Unbounded retention of dead payloads. With the default limits, new
chat creation fails (HTTP 500 through `next(error)`) only after 128 such
orphans or 256 MiB. Hence the low–medium severity.

**Recommended follow-up (CB-15, small).** Decide an expiry or
reconciliation rule. Examples: retire an awaiting record whose character no
longer exists or which is older than N persists or days; or expose orphan
counts in `/api/db/stats`. Then reproduce the client trigger: create a chat,
force the root patch to fail, reload.

### P0S-4 — Reset hooks versus in-flight runs

**Classification:** requires further investigation.

The four reset hooks (backup import, `/api/remove` of `database.bin`,
save-folder import and snapshot restore) call
`serverChatInputOwner.discardRecovery()` and
`serverChatCommitOwner.discardRecovery()`. They do not cancel active registry
runs. In the committer's `writeCanonicalState`, the input receipt is checked
only when `serverChatInputOwner.read(operationId)` returns a record
(`serverChatCommitOwner.cjs:488-503`). A run that started before the reset and
finishes after it therefore commits without the input-owner guard, as long as
the restored chat's revision equals the run's base revision. That can happen
when the restored state is identical to the state the run started from.

The outcome may be acceptable: the answer belongs to the same chat state. But
it is unspecified, and P0S-2 shows the same records can also be re-created
during an import. This belongs to the plan's CB-10 completion item "trigger a
reset hook mid-operation".

### P0S-5 — Detached turns are serialized across all chats

**Classification:** requires further investigation (may be intentional).

`runDetachedTurn` chains every detached orchestration on one promise
(`bgOrchestrator.cjs:1081-1085`, used at `:1509`). The server input drain
enters through the same handler (`:1849-1860`). A long provider call in one
chat therefore delays every other chat's server-owned generation, which shows
as `progress: 'queued'`. This also lengthens the period during which inputs sit `attached` or
`queued` in memory-only form (P0S-1). The serialization may be required by
shared global state in the server bundle. If so, it should be documented. If
not, it is a throughput defect.

## 4. Evidence and confidence

| ID | Evidence type | Confidence | What would change the classification |
|---|---|---|---|
| P0S-1 | Code trace across server owner, status route, drain, client admission and UI. Module-level reproduction of server state and client decision | High that the state is reachable and blocks sends; medium that no other exit exists anywhere in the UI | Finding another cancel or resolve path for `execution_unknown` or server-prepared `blocked_edit` |
| P0S-2 | Code trace of import routes, transaction batching, reset ordering and journal replay; comparison with the queued snapshot-restore path and with upstream | Medium–high for the race; medium for user-visible frequency | A live reproduction, or a client-side guarantee that no writer runs during import |
| P0S-3 | Module reproduction, plus a trace of the save order showing that stub-less payloads are possible | High for retention; medium for the trigger frequency | A server path that reconciles awaiting records against characters or age (none found by grep) |
| P0S-4 | Code trace only | Low | A CB-10 test that resets mid-operation |
| P0S-5 | Code trace only | High that serialization exists; unknown whether it is intended | Design intent in BG-preserve documents |

## 5. Cross-batch observations

1. **P0S-1 × reference finding 1 (CB-11).** A stranded server input keeps
   reporting `input-execution-unknown` or `input-queued` from the status route
   (`bgOrchestrator.cjs:1961-1977`). Separately, an operation whose
   operation-state record stays `queued`/`running` after a restart is parked
   client-side by the finding-1 retention branch. Fixing finding 1 alone does
   not release the chat: the server-side input record keeps
   `hasPendingGeneration()` true.
2. **P0S-1 × model jobs.** The generation-busy predicate added for queueing is
   shared by three independent owners: server input admission, legacy BG
   start and the model-jobs main guard. One stuck record disables all of
   them for the chat.
3. **P0S-2 × CB-15 × CB-10.** Two contracts that hold everywhere else do not
   hold for the import paths, and only for them:
   - the journal replay rule "journal content is newer than database.bin";
   - the reset rule "a reset discards recovery rows".
4. **P0S-3 × CB-16.** The client classifies chat intent from
   `lastConfirmedServerDb`. A chat whose stub never landed is retried as
   `create`, and the server answers 412 for the orphaned payload. That path
   ends in `ChatConflictError` handling. It was not traced further.
5. **CB-02.** The only composition-level problem identified is the shared
   busy predicate in (2). Middleware order and route registration showed no
   shadowing.

## 6. Recommended focused follow-up investigations

| Priority | Session | Scope | Suggested completion evidence |
|---|---|---|---|
| 1 | CB-09A/09B joint: stranded inputs | P0S-1; exits for every non-terminal input state after a restart (`queued` server-prepared, `attached`, `transform unknown`); cancel UX; whether model jobs should honour `execution_unknown` | Browser reproduction with a server restart while an input waits behind another chat; a table of state → available user action |
| 2 | CB-19 + CB-15: import/restore serialization | P0S-2 and P0S-4; every write route during `importInProgress`; BG commit during import | Live reproduction with the backup-source test gate; the chat payload after restore compared with the backup |
| 3 | CB-15: journal lifecycle | P0S-3; the full journal state × crash matrix the plan asks for | Kill-between-append-and-apply reproduction; an orphan trigger from the client |
| 4 | CB-10: reset and replay | P0S-4; commit state machine; replay idempotency | Mid-operation reset test; a transition table |
| 5 | CB-05: detached-turn serialization intent | P0S-5; bundle input list | Design reference or throughput measurement |

## 7. Unexamined areas and limitations

- **Not examined at all in this pass:**
  - `bgOrchBundle.build.cjs` and the bundle output contract (CB-05);
  - `risuSave.ts`, `conflictRebase.ts`, `chatSaveRebase.ts`,
    `chatIdentityRepair.ts` (CB-16);
  - `bgReconciliation.ts`, `bgDurableSaveBarrier.ts`,
    `suggestionRequestOwner.ts`, and the 472-line
    `server-commit-client-hydration` unit (CB-11);
  - `serverChatInputTransform.cjs`, `serverChatSettingsContext.cjs`,
    `serverChatAssemblyContext.cjs`, `chatInputAttach.cjs`,
    `bgFailedInputSettlement.cjs`, and the child-process boundary
    `bgServerChatProcessClient/Preload.cjs` (CB-09A);
  - `chatAnchorCommit.cjs`, `serverChatExecutionProjection.cjs` (CB-10);
  - `restoreSafety.cjs` beyond its function map; `SystemBackup.svelte`,
    `ServerBackupList.svelte`, `backuplocal.ts` (CB-19);
  - `triggers.ts`, `command.ts`, `DevTool.svelte` units (CB-18);
  - `database.svelte.ts` defaults and migrations, `request.ts`,
    `index.svelte.ts`, `Chat.svelte`, `App.svelte` hotspot units (CB-02).
- **Not run:** `pnpm check`, the full embedded suites, browser probes,
  WebKit/iPhone, live-server reproductions, multi-tab or multi-device
  scenarios, and the crash/kill matrices the plan lists for CB-10, CB-15 and
  CB-19.
- **Reproductions are module-level.** P0S-1 and P0S-3 were reproduced against
  the real modules, with the existing test harness (P0S-1) or in-memory KV
  (P0S-3), not through HTTP or a browser.
- **Batch definitions of done:** none of the nine batches meets its
  "Completion" criteria in plan §7.2. This screening only selects where those
  sessions should start.
- **Prior findings:** reference findings 1–6 and the fixed root causes
  (`2bda466`, `a96becc`, `4ba4c68`, 2026-10-17 identity repair) were not
  re-examined.
