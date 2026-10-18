# 2026-10-18 — R2: restore, storage queue and active-operation reset contract (C-02, C-05)

Status: focused investigation. No production code, manifest, test or
existing report was changed. Every reproduction ran in a disposable composed
PocketRisu `v1.10.0` clone, against synthetic data, using temporary test files
that were deleted afterwards. No live installation or real database was used.
This document specifies a concurrency contract and its acceptance tests; it
does not implement them.

Times are UTC. No chat content, names, identifiers or credentials are
recorded.

## 0. Revision, sources and method

| Item | Value |
|---|---|
| Items | **C-02** (P0S-2) and **C-05** (P0S-4) of the consolidated plan; decisions **D-3** and **D-4** |
| Baseline | `3242c3076b02159ca164ead625e5723364be58ae` (package `dist/pocketrisu-patcher.cjs` from that commit) |
| Target | PocketRisu `v1.10.0` `98e968339d1b3f91b9dac85bb3f2ebb5f90f9d14` |
| Composed tree | pristine clone + `node dist/pocketrisu-patcher.cjs apply --root <copy> --json`, then `pnpm install --frozen-lockfile` |
| Plan | `docs/audits/2026-10-18-consolidated-correction-plan.md` at `eb3e5d7` (`claude/unified-lightweight-defect-screening-2026-10-18`) |
| P0 screening | `docs/audits/2026-10-18-p0-lightweight-defect-screening.md` at `cecb1ac` (`claude/p0-defect-screening-0007jw`) |

Scope: C-02 and C-05 only. P0's static trace is reused rather than repeated;
this report adds reproductions and the paths P0 did not follow (debounced
persist timers, reset hooks other than backup import, the commit operation
gate, and client retry and rebase behaviour).

Method:

1. Static trace in the composed tree of `importBackupFromSource`,
   `queueStorageOperation`, the debounced persist timers, `invalidateDbCache`,
   `initChatStore`, `chatWriteJournal.restoreInto`, the commit owner and
   committer gates, the five reset hooks, and the client save, retry and
   rebase paths.
2. **HTTP-level interleaving.** A temporary test in `test/compat/` used the
   existing `spawnServer` / `createClient` helpers: a real server process on a
   temporary save directory, with synthetic seed backups. The backup upload
   was streamed through `http.request` and held at a chosen byte offset, so
   concurrent writes landed at a deterministic point inside
   `importBackupFromSource`.
3. **Module-level interleaving for C-05.** A temporary test reused the
   `serverChatCommitOwner.test.ts` harness (real input owner, commit owner,
   journal, SQLite KV). A reset hook's calls were performed between a run's
   start and its commit.

Line numbers refer to the composed tree. `server/node/server.cjs` and
`bgOrchestrator.cjs` are layered composites; their lines move whenever a pack
changes. The pack owners are: `lazy-chat-sync` (whole-file `server.cjs`,
`chatWriteJournal.cjs`); `lazy-chat-bg-adapter` (reset-hook units in
`server.cjs`, `serverChatCommitOwner.cjs`, `serverChatInputOwner.cjs`,
`bgOrchestrator.cjs` units); `bg-preserve` (`serverChatCommit.cjs`,
`bgOrchestrationOperationStore.cjs`); `kei-backup-restore-safety-*`
(preflight, `restoreSafety.cjs`).

Labels: **Confirmed** = reproduced, or settled by a deterministic check.
**Supported** = strong static trace; the end-to-end path was not run.
**Unresolved** = plausible; not reproduced and not settled.

## 1. Answers in brief

1. **Backup import is not excluded from any storage writer.** Confirmed. The
   import never enters `queueStorageOperation`. Every queued writer, and
   every debounced persist (itself a queued operation), runs between the
   import's reset and its cache invalidation. Writes issued during the import
   were answered `200`.
2. **A write accepted during import replays over the restored chat.**
   Confirmed, including with the real export order (`database.risudat` last).
   After the import the restored chat showed the concurrent write instead of
   the backup's content, both immediately and after a further persist cycle.
3. **A debounced persist that fires during the import can overwrite the
   restored `database.bin` with the pre-restore database.** Confirmed when the
   database entry has already been applied (backup entry order with the
   database first). The import still answered `{ok:true}`. This failure mode
   is broader than P0S-2 described: the whole root database, not only one
   chat, was restored to its old state. With the current export order the
   window is narrower (§3.3).
4. **A refusal flag checked at HTTP admission is not sufficient.** The writes
   that land inside the import include debounced persist timers, BG commit
   publication, answer recovery and input publication, none of which pass
   through an HTTP admission point. Writers admitted earlier are also
   unaffected (§3.5).
5. **A run that started before a reset can commit afterwards.** Confirmed for
   two cases:
   - a legacy server-owned run, whose operation state is not removed by any
     reset hook;
   - a server-input run, if anything rewrites its operation state after the
     reset. The run's own provider-start marker does that.
   In both cases the answer was committed into the restored chat. The
   input-receipt check was skipped because the input record had been
   deleted.
6. **D-3:** neither plain refusal nor plain serialization. Adopt a
   **storage-reset barrier**: fast refusal of new writers, an exclusive
   storage-queue slot for the destructive phase (the upload is spooled to a
   file first), timer cancellation, and invalidation of every pre-restore
   client session (§5).
7. **D-4:** fail closed through a durable **storage epoch** checked by the
   commit's operation gate, plus best-effort abort of active runs. The plan's
   alternative ("fail closed when a server-owned operation has no input
   record") would refuse every legacy server-owned commit. It is kept only as
   a secondary guard for requests that carry an input receipt (§6).
8. **Client retention:** a retryable 5xx refusal keeps the user's changes. The
   tracker requeues them; no `ChatConflictError` is raised and no edit is
   discarded. But a retained pre-restore change that retries after the
   restore completes can be **auto-rebased onto the restored chat** before the
   page reloads. The barrier must therefore also invalidate pre-restore
   sessions (§3.7).

## 2. Investigated paths

| Path | Location (composed) | Role |
|---|---|---|
| `queueStorageOperation` | `server.cjs:162-167` | Single promise chain; the only storage mutual exclusion |
| `importBackupFromSource` | `server.cjs:2728-3031` | Preflight snapshot `:2735-2753`; `BEGIN` + resets `:2811-2838`; streaming loop with periodic `COMMIT`/`BEGIN` `:2840-2970` (batch commit `:2940`); final `COMMIT` `:2977`; inlay swap `:2987-3002`; `invalidateDbCache` `:3004`; decode + `initChatStore` `:3007-3017` |
| `/api/backup/import`, `/api/backup/server/restore` | `server.cjs:5024-5125`, `:5363-5442` | Set and clear `importInProgress`; call the function above; not queued |
| `importInProgress` readers | `server.cjs:1250`, `:4995`, `:5028`, `:5367`, `:6012`, `:6042` | Import, capture and save-folder routes only. No chat, root, asset or BG writer reads it |
| Debounced chat persist | `scheduleChatStorePersist` `server.cjs:919-945`, `persistCurrentChatStore` `:909-917`, `persistDbCacheWithChats` `:857-907` | Timer (5 s, `SAVE_INTERVAL` `:97`) enqueues a persist; reassembles from the in-memory cache; writes `database/database.bin`; clears journal; re-inits chat store |
| Debounced root persist (`/api/patch`) | `server.cjs:4568-4610` (`saveTimers[cacheKey]`) | Same reassemble-and-write path |
| `invalidateDbCache` | `server.cjs:386-394` | Bumps the chat-store generation, drops caches, clears the DB timer; runs only at the end of import |
| `initChatStore` → `chatWriteJournal.restoreInto` | `server.cjs:514-548` | Replays journal records over the decoded database |
| Chat writes | `server.cjs:5696-5770` (delta), `:5776-5860` (full) | Queued; CAS against the in-memory store; `journal.stage`, publish to the store, schedule persist |
| BG commit | `serverChatCommit.cjs:1196-1215` (`commit` → queued `commitQueued`), gate `:975-997`, transaction `:1055-1140`; owner publication `serverChatCommitOwner.cjs:522-609` | Queued; base-revision CAS against the in-memory store; journal stage; publish; schedule persist |
| Commit owner input check | `serverChatCommitOwner.cjs:488-499` | Checks the input receipt **only if** the input record exists |
| Reset hooks | backup import `server.cjs:2829-2832`; `/api/remove` `:4061-4066` (queued); save-folder `clearExistingData` `:5894-5913` via `importHexFilesFromDir`/`importHexEntries` `:5926-5985` (not queued); snapshot restore `:6886-6931` (queued) | Delete journal, input and commit recovery; reset journal memory; none cancels registry runs |
| Input/commit `discardRecovery` | `serverChatInputOwner.cjs:1946-1954`, `serverChatCommitOwner.cjs:1214-1224` | Delete operation state/result **only for operations that have an input or commit record** |
| Run registry | `bgOrchestrationRunRegistry.cjs` (start/cancel/discard/finish/get/size/hasChatRun) | In memory; no enumerate or cancel-all API |
| Session lock | `session-lock.cjs:40-107`, `checkActiveSession` `server.cjs:2002-2015` | Freshness rule: a session that booted before the active session's last write is stale (423) |
| Client save | `nodeStorage.ts:1540-1690` (delta/full), `:1425-1460` (conflict auto-rebase), `globalApi.svelte.ts:1149-1176`, `:1508-1600` | Retry and requeue behaviour (§3.7) |
| Client restore UX | `backuplocal.ts:330-372`, `SystemBackup.svelte:180-196` | Reload after a successful import |

## 3. Confirmed concurrency behaviour

### 3.1 No mutual exclusion between import and writers (confirmed)

- Every chat writer and every persist goes through `queueStorageOperation`.
- `importBackupFromSource` does not. Its loop awaits each request chunk
  (`for await (const chunk of dataSource)`), and every await lets a queued
  operation run.
- better-sqlite3 holds a single connection. A writer's `kvSet` or
  `sqliteDb.transaction(...)` therefore executes **inside the import's open
  `BEGIN`**, as a nested savepoint, and commits with the import's next
  `COMMIT`.
- Reads of the in-memory store still serve the pre-restore cache until
  `invalidateDbCache()` at `:3004` (observed: `GET /api/chat-content` returned
  the old message during the import).

### 3.2 Writes admitted before `importInProgress` (confirmed by construction)

- `importInProgress` is set synchronously at route entry (`:5032`, `:5371`).
  No writer reads it, so a writer admitted before the flag is not treated
  differently from one admitted after. Both execute during the import.
- The preflight's `flushPendingDb()` (`:2735-2753`, through
  `prepareFreshRestoreSnapshot`) is **not queued** either. It cancels a
  pending DB timer and persists, but it does not wait for queued writers.
- Between the preflight and `BEGIN` there are further awaits (`fs.rm`,
  `fs.mkdir`, `:2775-2777`), during which a new timer can be scheduled.

### 3.3 Reproduction results (HTTP, real server process)

Setup per case: a fresh server, seeded through `/api/backup/import` with
backup **OLD** (chat message `OLD-message`, `mainPrompt: OLD-prompt`). Then a
second import of backup **NEW** (`NEW-message`, `NEW-prompt`, same character
and chat IDs) was streamed and held at a fixed offset. During the hold, one
full chat write (`POST /api/chat-content/...`, correct base revision) was
issued. The import was then released. "Root DB" means the `mainPrompt` read
back from `database/database.bin` through `/api/read`.

| Case | Backup entry order | Interleaving | Write | Import | Chat after import | Root DB after import |
|---|---|---|---|---|---|---|
| C (control) | DB first | no concurrent write | — | 200 `ok:true` | `NEW-message` ✓ | `NEW-prompt` ✓ |
| B | DB first | write after DB entry; release before the 5 s persist | 200 | 200 `ok:true` | **`RACE-B`** (also after +6 s) | `NEW-prompt` |
| D | **DB last (export order)** | write before DB entry; release before the 5 s persist | 200 | 200 `ok:true` | **`RACE-D`** (also after +6 s) | `NEW-prompt` |
| A | DB first | write after DB entry; hold 6.5 s so the persist fires mid-import | 200 | 200 `ok:true` | **`RACE-A`** | **`OLD-prompt`** |

Cases A, B and C were run twice, with identical results. Case D was run once.

Interpretation:

- **B/D (journal replay; P0S-2 confirmed).** The import deleted the journal
  prefix at `BEGIN` (`:2829`). The concurrent write was then checked against
  the old in-memory store (CAS passed), journaled, and published. At the end,
  `initChatStore` → `restoreInto` replayed that record over the restored chat.
  The record also survives restarts until a persist retires it.
- **A (persist overwrite; new).** The debounced persist ran inside the import.
  `persistCurrentChatStore` used the still-cached **old** stripped database
  plus the old full chats. It wrote them to `database/database.bin` over the
  restored value, cleared the journal, and re-initialised the store from the
  old database. When the import later read `database.bin` (`:3007`), it
  decoded the old database. **The restore was undone for the root database and
  every chat, and the route still reported success.**
- **Window under the current export order.** The exporter sorts entries and
  appends `database.risudat` last (`server.cjs:4908-4946`). Case D shows that
  the replay still happens. The full overwrite (A) then needs the persist to
  fire after the last entry is parsed and before `invalidateDbCache()`, a span
  that includes the inlay directory swap (`:2987-3002`, several filesystem
  awaits). A write in roughly the last 5 s of an import reaches either the
  replay (B/D) or, if the timer falls inside that tail, the overwrite (A).
  Backups whose database entry is not last (other producers, older formats)
  are fully exposed to A. Writes earlier in the upload are persisted before
  the database entry is applied, and the backup's entry then overwrites them;
  that order is benign.

### 3.4 Other writers and other reset hooks

| Writer or hook | Behaviour during or after a reset | Status |
|---|---|---|
| `/api/patch` (root) | Queued; schedules its own debounced persist through the same reassemble-and-write path → same overwrite as A | Supported (shares the mechanism of A) |
| BG commit publication (detached run, not HTTP) | Queued; CAS against the old cache passes; journals with `commitOperationId`, publishes, schedules a persist → B/D and A mechanisms. Its commit record and `chat-committed` operation state are written **after** the reset's `discardRecovery`, so they survive into the restored database, where recovery can later re-publish them (`recoverBeforeWrite`, `recoverAll`) | Supported (static; same queue and timer paths as B/A) |
| Answer recovery, input attach and publish, input retirement sweep | Queued writers of the same caches; same exposure | Supported (static) |
| Non-queued KV writes (operation state and result rows from `persistOrchResult`, cancel DELETE, input settle) | Execute inside the import's open transaction; survive the reset | Supported (static) |
| `/api/backup/server/restore` | Same function as local import; same exposure | Supported (same code) |
| Save-folder `execute`/`upload` | Unqueued `flushPendingDb`, then `invalidateDbCache`, then one synchronous transaction. No await inside the critical section. But a queued writer that is suspended at an await (for example inside `chatWriteJournal.stage`) can resume after it and journal over the imported data | Supported (static); window smaller than for import |
| `/api/remove` (`database.bin`), `/api/db/snapshots/restore` | Run inside `queueStorageOperation`: queued writers are excluded (P0 already noted snapshot restore's deliberate drain). C-05 still applies to in-flight runs | Confirmed exclusion by code; C-05 below |

### 3.5 Is an HTTP 503 refusal sufficient? (confirmed: no)

A refusal flag checked when a route is entered covers only HTTP writers that
arrive after the flag is set. It does not cover:

1. writers already past their admission check: queued, or suspended at an
   await (§3.2);
2. **debounced persist timers**, which are queued operations created by
   earlier writes and carry no request (case A);
3. **BG commit publication**, input publication, answer recovery and the
   retention sweep, which are triggered by detached runs and intervals
   (§3.4);
4. non-queued KV writes from orchestration bookkeeping (§3.4).

Items 2 and 3 alone are enough to undo or partially undo a restore. A
refusal is useful as a fast fail for new client writes, but correctness
needs exclusion (§5).

### 3.6 In-flight runs versus reset hooks (C-05)

Module reproduction (commit owner harness). Each run was started, a reset
hook's actions were performed, the restored chat was installed, and then the
run's commit was called.

| Case | Reset actions | Restored chat | Commit outcome | Chat after |
|---|---|---|---|---|
| Server-input run, attached, op state `running` | journal wipe, input + commit `discardRecovery`, journal memory reset | equals the run's execution base | `conflict` / `operation_state_missing` | unchanged |
| same | same | differs | `conflict` / `operation_state_missing` | unchanged |
| **Server-input run; op state rewritten after the reset** (simulates the run's provider-start marker `bgOrchestrator.cjs:1576-1581`, which calls `writeOperationState(..., 'running')` unconditionally) | same | equals base | **`committed` / `published`**; commit record written; input record absent | **late answer appended** |
| **Legacy server-owned run** (no input record; op state `running`) | same | equals base | **`committed` / `published`** | **late answer appended** |

Mechanism:

- The committer's only reset-sensitive check is `operationGate`
  (`serverChatCommit.cjs:975-997`): the operation state must exist and be
  committable.
- The input owner's `discardRecovery` deletes operation state only for
  operations with an input record. The commit owner's does so only for
  operations with a commit record. **No reset hook deletes operation state for
  a legacy run**, so its gate passes.
- For a server-input run, the gate fails only until something rewrites the
  operation state. A reset that lands after attach and before provider start
  (prompt assembly, plugin preparation; `bgOrchestrator.cjs:733-750` →
  `:490`) is followed by exactly such a rewrite.
- The input-receipt check is skipped when the input record is missing
  (`serverChatCommitOwner.cjs:488-499`).
- The base-revision CAS passes whenever the restored chat's revision equals
  the run's base. Inside a backup import, the base is compared with the **old,
  not yet invalidated** cache, so it passes for every run that started from
  the live state (§3.4). After a queued restore (snapshot, remove), it passes
  when the restored chat equals the base.

The end-to-end reachability of the provider-start window was not run against
a live provider. The commit outcome itself is confirmed at module level.

Impact: an answer that belongs to a pre-restore execution is committed into
the restored database, with its statistics and global-variable effects. A
restore is a deliberate rollback, so the restored state must not receive
effects from executions that the rollback discarded. Whether the content
"belongs to the same chat state" does not change this: the reset contract
says recovery rows are discarded, and a late commit re-creates them.

### 3.7 Do retryable refusals preserve pending client changes? (confirmed for the refusal; supported for the post-restore hazard)

- A non-2xx response other than 409/412/404 on delta or full chat save raises
  a generic `Error` (`nodeStorage.ts:1625`, `:1684`). `triggerSave`
  catches it, calls `requeueTrackedChanges(toSave)`
  (`globalApi.svelte.ts:1557`), and retries: a short burst, then deferred
  30-second cycles, then 5-minute cycles. The dirty tracker is never dropped.
  The same holds for a 503 marked `BG_PUBLICATION_SAVE_BLOCKED`
  (`PublicationSaveBlockedError` path, `:1558-1575`), which also retains the
  draft.
- A refusal is therefore **not** silent loss, and it does **not** become a
  `ChatConflictError`, provided the new refusal code is not one of 409, 412 or
  404.
- **Hazard after completion.** Once the restore has finished, a retained
  pre-restore change that retries gets a 409, because its base is no longer
  current. `saveChatContent` then auto-rebases: a three-way merge of
  (old base, local, restored) at `nodeStorage.ts:1435-1460`, which publishes
  and writes the merge when it applies cleanly. Before the page reload that
  follows a successful import (`backuplocal.ts:372`,
  `SystemBackup.svelte:195`), this can **merge pre-restore edits into the
  restored chat**. The window is short on the success path. It is longer when
  the import ends with an alert that waits for the user
  (`backuplocal.ts:364`). Not reproduced; supported by the code path.
- **Edits made while the restore runs.** These are abandoned by the reload.
  This is the intended meaning of a restore, and the barrier keeps it so: the
  edits are refused (retained in memory) until the reload, never written into
  the restored data.

## 4. Design options (D-3)

| Option | Covers new HTTP writers | Covers admitted writers, timers, BG publication | Covers stale client after completion | Queue blocking | Verdict |
|---|---|---|---|---|---|
| R: writer refusal while `importInProgress` | yes | **no** (§3.5) | no | none | Insufficient alone |
| S: run the whole import inside `queueStorageOperation` (as snapshot restore does) | yes (they wait) | yes for queued work; timers are cancelled at invalidation | no; a waiting writer later CAS-fails and the client may auto-rebase (§3.7) | **for the entire upload**, including every queued `GET /api/chat-content` | Correct for the server, but blocks reads for the network upload and leaves the client hazard |
| **B: storage-reset barrier** (R + S on a spooled file + timer cancellation + session invalidation + storage epoch) | yes (fast 503) | yes | yes (423 → reload) | only for the local apply phase | **Recommended** |

## 5. Recommended synchronization contract

### 5.1 Scope

The contract applies to every **storage reset**:

- backup import (`/api/backup/import`);
- server backup restore (`/api/backup/server/restore`);
- save-folder `execute` and `upload`;
- snapshot restore (`/api/db/snapshots/restore`);
- `/api/remove` of `database/database.bin`.

### 5.2 Invariants

- **I-1 Exclusion.** From the first destructive write (journal or recovery
  deletion, or the first restored row) until the restored caches are
  published (`initChatStore` plus the stripped cache), no other storage
  operation runs. The storage queue is the only exclusion primitive; the reset
  holds it.
- **I-2 No pre-reset persist.** No debounced persist created before the reset
  can write after the reset begins. Every `saveTimers` entry is cancelled
  inside the exclusive slot **before** the first destructive write, not only
  at `invalidateDbCache`. A queued callback already waiting must see a changed
  generation and return; this mechanism exists already (`server.cjs:922-925`).
- **I-3 No post-reset journal from pre-reset state.** Every journal record
  present after the reset was staged against the restored state. With I-1,
  only the reset itself writes between the journal wipe and the cache
  publication.
- **I-4 Durable storage epoch.** Each reset increments a persisted counter
  (for example `internal/storage-epoch/v1`) **in the same SQLite transaction**
  as its destructive writes. Snapshot restore already has one transaction
  (`commitSnapshotRestore`); import uses its final `COMMIT`; remove and
  save-folder use their transactions.
- **I-5 Runs are epoch-bound.** A run records the epoch at start in its
  operation state (`operationMeta.storageEpoch`). The committer's
  `operationGate`, which runs inside the commit transaction, refuses
  `status: 'conflict', reason: 'storage_epoch_changed'` when the operation
  state's epoch differs from the current epoch. A missing field counts as
  epoch 0, so behaviour before the first reset after upgrade is unchanged.
  Every operation-state rewrite carries the captured value, so a rewrite
  cannot resurrect authority.
- **I-6 Abort is best-effort, the gate is authoritative.** The reset aborts
  every active registry run to stop provider cost. This needs a new registry
  method (for example `cancelAll(reason)`): set each run's cancelled flag and
  abort its controller, without waiting. I-5 alone guarantees that nothing
  commits.
- **I-7 Fast refusal.** While a reset is pending or active, a single flag
  generalising `importInProgress`, checked synchronously at route entry, makes
  all storage writers answer `503` with
  `code: 'STORAGE_RESET_IN_PROGRESS'`, `retryable: true`, and **no**
  `x-bg-save-blocked` header. That covers chat delta and full writes,
  `/api/patch`, `/api/write`, asset bulk write, draft upsert, and BG start,
  claim, attach and abandon. The client then retains and retries (§3.7). New
  BG starts are refused, so no run starts with the old epoch while a reset is
  pending.
- **I-8 Pre-restore sessions are stale.** On successful completion the reset
  invalidates the session lock (new method, for example
  `invalidateBefore(now)`): no active session, and every session that booted
  before the watermark is stale. `checkWrite` then answers 423 to any
  pre-restore tab, which deactivates and reloads. The reloaded tab
  re-registers with a newer boot time and is fresh. This prevents the
  auto-rebase hazard (§3.7) and stale BG adoption writes from other devices.
- **I-9 Bounded queue hold.** The exclusive slot covers only local work. For
  a network upload, the body is spooled first to a temporary file in the save
  directory. Disk headroom is already checked in `prepare` (`:4990-5021`).
  The streaming loop then runs inside the slot against the file. Server
  restore already reads a local file. Snapshot restore, remove and save-folder
  are already local.
- **I-10 Reporting.** A reset that ends with any invariant unproven (for
  example, the persisted root does not match the applied database) fails
  instead of answering `ok:true`.

### 5.3 Ordering inside the barrier

1. Synchronously: set the reset flag (I-7). If a reset or capture is already
   active, answer 409 (current behaviour).
2. Spool the upload, if any (I-9). No storage mutation yet.
3. Enter `queueStorageOperation` and hold it to step 9 (I-1).
4. Cancel every `saveTimers` entry (I-2). Call `orchestrationRuns.cancelAll`
   (I-6).
5. Run the existing preflight (`prepareFreshRestoreSnapshot` with
   `flushPendingDb`). This already works inside the slot: snapshot restore
   does it today, which also shows that no step re-enters the queue.
6. In one transaction (or in the import's `BEGIN`…`COMMIT` span): the journal
   wipe, input and commit `discardRecovery`, **deletion of every
   `bg-orch-state-op:` and `bg-orch-result-op:` row** so that legacy
   operations are covered too, the restored rows, and the epoch increment
   (I-4).
7. Reset journal memory; `invalidateDbCache()`.
8. Decode, then `initChatStore` and publish the stripped cache.
9. Invalidate the session lock (I-8). Release the slot. Clear the flag.

On failure after step 6, the existing rollback paths apply, and the epoch
increment rolls back with the transaction. Steps 4 and 7 are idempotent.

### 5.4 Component changes (for the implementation PR)

| # | Component (pack → composed file) | Change |
|---|---|---|
| K1 | `lazy-chat-sync` `server.cjs` (import and server-restore routes, `importBackupFromSource`) | Spool, then run steps 3–9 in one queue slot; move timer cancellation to the start |
| K2 | `lazy-chat-sync` `server.cjs` (save-folder routes) and `kei-backup-restore-safety-lazy-adapter` (snapshot restore), `/api/remove` unit | Same barrier helper (`runStorageReset(fn)`); epoch bump and session invalidation |
| K3 | `lazy-chat-bg-adapter` reset units | Delete operation state and result rows by prefix; call `cancelAll` |
| K4 | `bg-preserve` `serverChatCommit.cjs` `operationGate`; `bgOrchestrator.cjs` operation metadata | Epoch capture and check (I-5) |
| K5 | `lazy-chat-bg-adapter` `serverChatCommitOwner.cjs:488-499` | Secondary guard: a request with `inputReceipt` and no input record → `conflict` `input_record_missing` |
| K6 | `bgOrchestrationRunRegistry.cjs` | `cancelAll(reason)` |
| K7 | `session-lock.cjs` | `invalidateBefore(timestamp)` |
| K8 | All storage-writer routes and BG write routes | Fast refusal (I-7) |

Not changed: CAS semantics, journal format, the commit record format (the
epoch lives in the operation state), and client save or retry code.

## 6. Decisions

**D-3 — writer refusal or queue serialization?** Both, in the barrier form of
§5:

- Refusal alone is insufficient: confirmed in §3.5, and cases A, B and D are
  all triggered through non-admission paths or ordinary queued writes.
- Whole-upload serialization alone is correct for the server, but it blocks
  every queued read for the length of the network upload and does not stop
  the post-restore client rebase.
- Use refusal as the fast path, the queue slot (on a spooled source) as the
  correctness guarantee, and session invalidation for clients.

**D-4 — cancel active runs, or fail closed in the committer?** Fail closed,
through the storage epoch (I-4, I-5), with run cancellation as cost control
(I-6).

- Cancellation alone has a race: a commit already queued behind the reset
  still runs afterwards, and the registry cannot see work that left it.
- "Fail closed when a server-owned operation has no input record" cannot be
  the rule. Legacy server-owned runs (`serverChatCommitVersion: 1`,
  `inputCommandVersion: 0`) never have input records, so every legacy commit
  would be refused. It stays only as the secondary guard K5.

## 7. Regression acceptance tests

Server-process tests go in `test/compat/` with `spawnServer`. Holding an
upload at a byte offset proved deterministic and needs no production hook;
the existing `POCKETRISU_TEST_BACKUP_SOURCE_GATE_DIR` gate can hold a capture
inside the queue when a test needs an admitted-but-waiting writer.
Module tests use the existing owner and committer harnesses.

| ID | Level | Scenario | Accept when |
|---|---|---|---|
| A-1 | compat | Case D (export order): write while the upload is held before the DB entry; release | The write is answered 503 `STORAGE_RESET_IN_PROGRESS`; the restored chat equals the backup immediately, after +6 s, and after a server restart; no journal row exists for the chat |
| A-2 | compat | Case A (DB first): write after the DB entry; hold past `SAVE_INTERVAL` | Root `mainPrompt` and the chat equal the backup; no persist runs during the reset (persist counter or log) |
| A-3 | compat | Case C control | Unchanged |
| A-4 | compat | A writer admitted before the flag and still queued (hold the queue with the capture gate, enqueue a chat write, then start the import) | The write completes **before** the reset applies, or is refused; never after. The backup content wins |
| A-5 | compat | `/api/patch` root write during the reset | 503; root equals the backup |
| A-6 | compat | `/api/backup/server/restore` with a concurrent chat write | Same as A-1 |
| A-7 | compat | Save-folder upload with a concurrent chat write | Same as A-1 |
| A-8 | compat | Reads during the spooled phase | `GET /api/chat-content` is served (not blocked) while the upload streams; it is blocked only during apply |
| A-9 | compat | Session invalidation: a pre-restore session id writes after completion | 423; after the client re-registers (new boot) the write succeeds |
| A-10 | compat | Import fails mid-apply (truncated stream) | Epoch unchanged; timers and sessions not invalidated beyond the cancelled timer; pre-import data intact (existing rollback behaviour) |
| M-1 | committer | Legacy run started at epoch *n*; reset bumps to *n+1*; commit | `conflict` / `storage_epoch_changed`; no journal, record, ledger or statistics change |
| M-2 | committer | Server-input run; reset after attach; operation state rewritten with the captured epoch (provider start); commit | `conflict` / `storage_epoch_changed` |
| M-3 | owner | Request with `inputReceipt`, input record missing, epoch unchanged | `conflict` / `input_record_missing` (K5) |
| M-4 | committer | Operation state without `storageEpoch`, current epoch 0 | Commits as today (upgrade compatibility) |
| M-5 | registry | `cancelAll` with two running runs and one finished run | Both running runs are cancelled and aborted; the finished run is unchanged; `hasChatRun` is false afterwards |
| M-6 | session lock | `invalidateBefore(t)`; sessions booted before and after `t` | Before → `{ok:false}` (423); after → ok; the next user-active write takes over |
| M-7 | reset helper | Each of the five hooks | Bumps the epoch exactly once in its destructive transaction; deletes the operation state and result prefixes; cancels timers before the first destructive write |
| C-1 | client (`globalApi` / `nodeStorage`) | Chat delta and full save answered 503 `STORAGE_RESET_IN_PROGRESS` | No `ChatConflictError`; `requeueTrackedChanges` called; the tracker still dirty; retry scheduled; no publication-blocked notice |
| C-2 | client | 423 after the restore | `risu-session-deactivated` dispatched; no auto-rebase attempted |

Existing suites to re-run with the change: `backupSnapshot`, `backupSource`,
`restoreSafety`, `chatWriteJournal`, `serverChatCommit*`,
`bgServerChatCommitRoutes`, `serverChatInputOwner`, `session-lock`,
`bgOrchestrationResultRetention`, and `test/compat/backup-point-in-time`.

## 8. Remaining limitations and unresolved cases

- **BG commit during import** (§3.4) is supported by shared mechanisms. The
  persist timer and journal effects are confirmed, but no reproduction ran a
  detached orchestration with a provider during an import. A-1 and A-2 cover
  the shared path; an orchestration-level variant would need a stub provider.
- **Provider-start window for C-05.** The commit outcome is confirmed at
  module level. That the window is reached in a live run (reset during prompt
  assembly) is supported by the composed call order, not observed.
- **Client post-restore auto-rebase** (§3.7) is unresolved as an observed
  failure. It was traced, not reproduced in a browser.
- **Recovery re-publication** of a commit record written during an import
  (§3.4) is supported only by static trace.
- **Save-folder import window** (§3.4) is supported by static trace; not
  reproduced.
- **Queue hold duration.** Spooling bounds the hold to local apply time; it
  was not measured on a large real-size backup (synthetic data only).
- **Other devices** are expected to be read-only during a reset (session
  lock). Multi-device behaviour was not run.
- **Not examined:** model-job relays (the client writes their results, so
  they are covered by I-7 and I-8), cold-storage migration internals, and the
  inlay swap's own failure modes.
- **Repetitions.** Cases A, B and C ran twice and case D once, on one
  machine; timing margins were seconds wide (`SAVE_INTERVAL` 5 s).
