# 2026-10-18 — R1: restart-recovery and cancellation contract (C-01)

Status: focused investigation. No production code, test, manifest or
configuration was changed. Reproductions ran in a scratch composed tree and
in a temporary test file that was deleted afterwards. This document specifies
a correction and its regression tests; it does not implement them.

Times are UTC. No chat content, names, identifiers or credentials are
recorded.

## 0. Scope, sources and method

| Item | Value |
|---|---|
| Item under investigation | **C-01** of the consolidated correction plan (P0S-1 + PRO-1); plan steps W0-1 (partly) and W1-A; decisions D-1 and D-2 |
| Plan | `docs/audits/2026-10-18-consolidated-correction-plan.md` at `eb3e5d7` (`claude/unified-lightweight-defect-screening-2026-10-18`) |
| Evidence reused, not repeated | P0 screening at `cecb1ac` (P0S-1, §5.1–5.2); proactive investigation at `26dee75` (finding 1) |
| Baseline | `3242c3076b02159ca164ead625e5723364be58ae` |
| Target | PocketRisu `v1.10.0` (`98e9683`) |
| Composed tree | pristine clone + `node dist/pocketrisu-patcher.cjs apply --root <copy> --json`, then `pnpm install --frozen-lockfile` |

No separate written "R1 research instructions" file was found on any branch.
This investigation takes its scope from the plan: settle what happens to a
server input after a restart, find which exit is safe, answer D-1 and D-2,
and specify W1-A's regression tests. No repository-wide audit was run.

Method:

1. Static trace in the composed tree of the server input owner, the
   orchestrator routes, the notice source, and the client paths that read
   those routes: the projection parser, admission, `ServerPendingInputs`, the
   server-input marker loop, the legacy watch/boot loops, the stream-preview
   stop, and cancelled-input settlement.
2. A module-level reproduction (temporary vitest built on the
   `serverChatInputOwner.test.ts` harness, run under
   `vitest.config.server.ts`). It covers every restart point of a
   server-prepared input, then the DELETE route's not-active branch, then a
   fresh admission. It also calls the real client `chooseServerInputBase`
   and the real `stateEvents` notice classifier.
3. Regression context in the same tree: `serverChatInputOwner`,
   `bgServerChatCommitRoutes` and `serverChatInputDrain` (3 files, 98
   passed); `ServerPendingInputs`, `bgServerInputAdmission`,
   `bgServerPendingProjection`, `bgCancelledInputSettlement` and
   `bgFinishedOperationFlow` (5 files, 129 passed).

Line numbers refer to the composed tree. The following files are owned
payloads, byte-identical to `patches/lazy-chat-bg-adapter/files-1.10/<same
path>`, so the same lines apply to the payload:
`server/node/serverChatInputOwner.cjs`, `serverChatInputDrain.cjs`,
`bgOperationNotices.cjs`, `src/ts/bgServerPendingProjection.ts`,
`bgServerInputAdmission.ts`, `bgServerInputClient.ts`,
`bgCancelledInputSettlement.ts`, and
`src/lib/ChatScreens/ServerPendingInputs.svelte`. This was checked with
`cmp`. `bgOrchestrator.cjs`, `bgOrchestrate.ts` and
`DefaultChatScreen.svelte` are layered composites. Their lines move whenever
a pack changes.

Evidence labels follow the plan: **Confirmed** (reproduced, or settled by a
deterministic check), **Supported** (strong trace, end-to-end path not run),
**Unverified**.

## 1. Answers in brief

1. **Every restart point leaves the chat stuck, and today there is no
   user-reachable exit.** Confirmed at module level for all four points
   (§2). This widens P0S-1, which covered two of them. The client drops the
   server's existing `cancelAllowed: true` flag while parsing. The only stop
   control for a server input is driven by the in-memory stream preview,
   which is empty after a restart (§3.1).
2. **The existing DELETE route is a correct and sufficient exit.** Its
   not-active branch writes a tombstone and settles the input as
   `cancelled`. For all four restart points this clears
   `hasPendingGeneration`, empties the projection, makes the client
   admission decision `ready`, and lets a fresh admission run with no
   predecessor. Confirmed at module level (§3.2).
3. **D-1 must not choose `blocked_edit` for a non-retryable input.**
   `blocked_edit` is terminal for the owner, but the client still refuses
   every send while one is unresolved. A `blocked_edit` can be left only
   through a paid retry, and the cancel settle returns `false` for it.
   Confirmed (§3.3). A "durable `blocked_edit` with cancel only" (the plan's
   D-1 recommendation) cannot be built on the current transitions.
4. **Recommended contract:** no automatic terminal transition at recovery.
   A server-prepared input that can no longer run (an *orphan*, §5.1) stays
   non-terminal, is projected with `cancelAllowed: true`, and gets an
   explicit cancel button. The button reuses the DELETE route. The cancelled
   proof is extended so the client can clear its marker after cancelling an
   interrupted transform (§5).
5. **D-2: leave `hasPendingGeneration()` unchanged.** Once the cancel exit
   exists, one click releases all three blocked owners, and the shared
   predicate does not change (§3.7).
6. **PRO-1 and P0S-1 are independent code paths.** A server-input operation
   never reaches the PRO-1 retention branch, because the result route
   answers with `input-*` states while the input record exists. The two
   corrections can be separate commits, as the plan intends, and neither
   depends on the other (§3.9).
7. **New:** the same stuck state arises **without a restart**, when a server
   transform fails before attach. Confirmed (§3.8). The contract covers it
   because it keys on runnability, not on restart.

## 2. State inventory after a restart

A server-prepared input passes through four durable points before its
provider call ends. The table gives what each point looks like after a
restart (new owner instance, `recoverAll()` run twice, as the startup
reconciliation does). All values come from the module reproduction, except
the last column, which comes from the client trace in §3.1.

| Restart point | Durable record after `recoverAll` | Operation state → orphaned label | `loadExecution` | `hasPendingGeneration` | Projection (`state`, `cancelAllowed`, `retryAllowed`) | Client `chooseServerInputBase` | User action available today |
|---|---|---|---|---|---|---|---|
| **R-A** admitted, waiting (drain or detached chain) | `queued` / `not_run`, no receipt | `queued` → `start-retry-required` | blocked `settings_context_unavailable` | true | `blocked_edit`, **true**, false | `unresolved-server-input` | none |
| **R-B** transform running | `queued` / `unknown` (set by `recoverAll`), no receipt | `queued` → `start-retry-required` | blocked `transform_outcome_unknown` | true | `blocked_edit`, **true**, false | `unresolved-server-input` | none |
| **R-C** attached, provider not started | `attached` / `completed`, receipt; user row re-published | `queued` → `start-retry-required` | blocked `settings_context_unavailable` | true | `execution_unknown`, false, false | `unresolved-server-input` | none |
| **R-D** provider started | `attached` / `completed`, receipt; user row re-published | `running` → `interrupted-before-result` | blocked `settings_context_unavailable` | true | `execution_unknown`, false, false | `unresolved-server-input` | none |

Supporting code:

- Admission keeps the settings snapshot only in process memory
  (`serverChatInputOwner.cjs:1009`, map at `:472`). The drain says it never
  resumes paid work after a restart (`serverChatInputDrain.cjs:3-6`).
- `recoverAll()` (`:1764-1825`) converts only client-prepared queued records
  to `blocked_edit`. For a server-prepared `running` transform it sets
  `unknown`. It leaves other `queued` records as they are and re-publishes
  attached ones.
- `pendingProjection()` (`:1709-1762`): `cancelAllowed` is
  `inputState === 'queued'`. `retryAllowed` requires
  `inputState === 'blocked_edit'`.
- `hasPendingGeneration()` (`:1698-1707`) counts every `queued` and
  `attached` record. It feeds the legacy start guard
  (`bgOrchestrator.cjs:1435`), the model-jobs main guard (`server.cjs:3616`)
  and the activity route (`bgOrchestrator.cjs:2057`).
- A re-POST of the same operation cannot resume work. Admission is reused,
  `loadExecution` reports blocked, and the start handler answers 409
  (`bgOrchestrator.cjs:1277-1302`).

The existing test `serverChatInputOwner.test.ts:823-883` asserts the R-A
row as intended. Its neighbour at `:1502` asserts the R-C row
(`execution_unknown`). Both describe a state; neither tests an exit.

## 3. Resolved questions

### 3.1 Is there any existing exit? — No (confirmed for the server side, supported for the UI)

- **Retry.** `ServerPendingInputs.svelte:129` renders the retry button only
  when `retryAllowed`. That flag is false for all four rows.
- **Cancel flag.** The server already projects `cancelAllowed: true` for
  R-A and R-B. But `parseServerPendingInputs`
  (`bgServerPendingProjection.ts:22-87`) neither declares nor copies
  `cancelAllowed`, so the flag never reaches the UI. The component has no
  cancel control.
- **Composer stop, server-input path.** The stop for a server input is
  `ServerStreamPreview.requestStopGeneration()`, which calls
  `cancelObservedServerOperation` (`bgOrchestrate.ts:3172`). It is enabled
  only while `/api/bg-stream-preview` reports an owner. That owner is one
  in-memory slot (`bgStreamPreview.cjs:8-18`), filled only while a pipeline
  runs. After a restart it is empty. Even before a restart, an input that
  waits behind another chat's run has no preview owner, so it cannot be
  stopped either.
- **Composer stop, legacy path.** `cancelServerOrchestratedChat`
  (`bgOrchestrate.ts:3208`) acts on `activeOperationId`, which only
  `armWatch` sets (`:399`). The only caller of `armWatch` is the legacy
  delegated-chat path (`:3025`). Server inputs never arm a watch.
- **Send.** `DefaultChatScreen.svelte:522-575` reports
  "서버 입력을 시작하지 않았어요" for an `unresolved-server-input` refusal
  and returns without falling back.

The only remaining exits are a manual DELETE request or editing the
database.

### 3.2 Does the existing DELETE route settle every orphan correctly? — Yes (confirmed at module level)

For an operation with no live run, the not-active branch of
`DELETE /api/bg-orchestrate/:operationId` (`bgOrchestrator.cjs:2167-2196`)
does three things: it refuses only `delivered`, `result-ready` and
`delivery-failed` operation states; it writes the `cancelled` tombstone and
deletes the operation result; and it calls
`serverChatInputOwner.settleSynchronously(id, 'cancelled')`. The
reproduction performed those exact three steps.

| Restart point | settle | After cancel: `hasPendingGeneration` / projection / client decision | Cancelled proof | Fresh admission |
|---|---|---|---|---|
| R-A | true | false / `[]` / `ready` | `attachment: 'none'` | admitted, predecessor `null`, `transform-required` |
| R-B | true | false / `[]` / `ready` | **`null`** | same |
| R-C | true | false / `[]` / `ready` | `attachment: 'attached'` | same |
| R-D | true | false / `[]` / `ready` | `attachment: 'attached'` | same |

In R-C and R-D the user's message remains in the chat. This matches a
live cancel after attach. `requiresExecutionPredecessor` returns false for
a `cancelled` record whose owned row is present
(`serverChatInputOwner.cjs:611-614`), so the record does not hold back later
inputs.

The DELETE route cannot leave an attached input unsettled by refusing a
finished operation state. For server inputs, an operation reaches
`result-ready` or `delivery-failed` only after `markRunFailureSynchronously`
has settled the input (`bgOrchestrator.cjs:1663-1688`). The intermediate
`result-ready` write is disabled for server inputs (`allowIntermediate`,
`:1586`).

**Predecessor plus successor** (two inputs admitted before the restart,
successor waiting on an attached predecessor):

- Cancelling the predecessor leaves the successor as an orphan
  (`blocked_edit` display, `cancelAllowed: true`).
- Cancelling the successor releases the chat.

Each orphan needs its own cancel. No cascade is required, and none happens
by accident.

### 3.3 Can a `blocked_edit` input be cancelled? — No (confirmed)

`settleDurablySynchronously` returns `false` for any record already in
`TERMINAL_INPUT_STATES` (`serverChatInputOwner.cjs:1534-1537`), and that set
includes `blocked_edit` (`:32`). Yet the client refuses every new server
input while any `blocked_edit` row is projected
(`bgServerInputAdmission.ts:31-35`), and the projection keeps such a row
until `userResolvedAt` is set (`:1713-1714`). Only a replacement admission
sets `userResolvedAt` (validation `:929-944`, write `:1055-1059`).

Consequence for D-1: moving R-B, R-C or R-D to `blocked_edit` would replace
one dead end with another. Those rows cannot be retried, because the
transform is unknown or a receipt exists, and they could not be cancelled
either. Moving R-A to `blocked_edit` would make it retryable but no longer
cancellable.

### 3.4 Is cancel safe to offer? — Yes, when limited to orphans (supported)

- A DELETE for an operation that does have a live registry run takes the
  active branch. It aborts the run and settles the input. This is the same
  as the existing composer stop. Cancelling a live input is therefore not
  unsafe; limiting the button to orphans only avoids two stop controls for
  one operation.
- An orphan cannot have a live run. Settings snapshots are removed by every
  terminal settle (`:1615-1619`) and by the transform-failure path
  (`:1694`). They never survive a restart. Every runnable server-prepared
  row has one: `beginTransform` refuses without it (`:1132-1134`), and
  `loadExecution` blocks without it (`:1462-1468`, `:1508-1513`). The
  snapshot map is filled synchronously after the admission transaction,
  inside the same storage-queue callback (`:1081-1083`), so no other task
  can observe a fresh row without its snapshot.

### 3.5 What does the client do after the cancel? — R-A, R-C and R-D settle; R-B strands the marker (confirmed server side, supported client side)

- The marker loop sends a pending marker that is no longer projected to the
  status route. For `input-cancelled` it calls `settleCancelledServerInput`
  (`bgOrchestrate.ts:822-844`). That function clears the marker only on a
  valid proof (`bgCancelledInputSettlement.ts:21-80`).
- `readCancelledInputProof` (`serverChatInputOwner.cjs:491-513`) accepts
  only two cases: `transformState === 'completed'` with a receipt, or
  `not_run` with no receipt. For R-B (`unknown`) it returns `null`, which
  the existing test at `serverChatInputOwner.test.ts:197-206` asserts for a
  started transform.
- The submitting browser's marker therefore stays up to 49 h
  (`bgServerInputLedger.ts:20`). While it exists, `ServerPendingInputs`
  keeps 2-second polling (`ServerPendingInputs.svelte:84-89`,
  `hasServerOwnedInputMarker` at `bgOrchestrate.ts:762-767`). This is the
  same retention pattern as PRO-1, on a different ledger.
- A `'none'` proof is sound for R-B. `attachTransformed` writes the receipt,
  the journal stage and the `attached` state in one SQLite transaction
  (`:1326-1421`). An `unknown` transform with no receipt therefore never put
  a row into the canonical chat. The existing `matches.length === 0` check
  covers the remaining doubt.

### 3.6 How do notices interact with cancellation? — Cancellation suppresses the interruption notice (confirmed)

- `stateEvents` returns no event once `outcome.cancelled` is true
  (`bgOperationNotices.cjs:20`).
- Before a cancel, the startup source scan
  (`bgOrchestrator.cjs:2531-2560`, run at route registration) classifies all
  four restart points as `operation_interrupted` / `before_result`, through
  `settingsLost` or `transformState === 'unknown'`. The reproduction
  confirmed this classification with the real `stateEvents`. The intent is
  stored durably before dispatch, so a later user cancel does not withdraw a
  notice that was already captured.
- An automatic cancel inside `recoverAll()` would depend on the scan having
  run first. The code comment at `:2544-2546` relies on that order today. A
  later reordering would silently drop the notice. This is a further reason
  not to settle automatically (§4).
- The R-A notice text claims possible token cost, although R-A provably ran
  no transform or provider. It is inaccurate but not harmful. It is recorded
  here only; it is outside R1.

### 3.7 Should orphans block model jobs and legacy starts (D-2)? — Keep the predicate unchanged

- Excluding orphans from `hasPendingGeneration()` would be safe for
  concurrency, because an orphan can never run. But it changes a predicate
  shared by three owners and by the activity route that drives the client's
  busy state (P0 §5.2).
- New server inputs would stay blocked anyway. The client refuses them, and
  a server-side admission would wait forever on the orphan predecessor: a
  non-terminal predecessor yields `waiting` (`:789-795`) or
  `predecessor_outcome_unknown` (`:781-787`).
- The cancel is required in any case, and it releases all three owners at
  once (§3.2).

Recommendation: do not change `hasPendingGeneration()` in W1-A. Revisit only
if the W0-1 browser reproduction shows that users who are refused by a model
job or a legacy start cannot find the cancel control.

### 3.8 Does the state arise without a restart? — Yes (confirmed)

The reproduction ran admit → `beginTransform` →
`markRunFailureSynchronously(id, false)` in one process. This is the path of
a transform that throws a non-assembly error before the provider starts
(`bgOrchestrator.cjs:1738`, then `retryable-no-provider` → registry
`discard`). The result is the R-B row without any restart:
`queued`/`unknown`, `hasPendingGeneration` true, projection `blocked_edit`
with `cancelAllowed: true`, client decision `unresolved-server-input`. The
contract in §5 keys on runnability, so it covers this case too.

Not examined: attached + error before provider start without a restart. In
that path `markRunFailureSynchronously` leaves the record `attached` with
its snapshot (`:1686-1688`), and recovery depends on a client re-POST.

### 3.9 PRO-1 relation — Independent paths (supported)

- While an input record exists, the result route answers with an `input-*`
  operation state (`bgOrchestrator.cjs:2286-2305`), never with
  `orphanedOperationState`. The status route behaves the same way
  (`:1948-1975`). A server input therefore never reaches the PRO-1 retention
  branch.
- PRO-1 concerns legacy delegated operations that carry
  `serverChatCommitVersion: 1`: `bgOrchestrate.ts` watch at `:1838-1843`,
  boot at `:2356-2360`, default reason at `:1384`. PRO-1 parks a marker and
  shows a misleading notice. It does not set `hasPendingGeneration`.
- P0 §5.1 still holds in its stated direction: fixing PRO-1 alone does not
  release a chat that holds an orphan input.
- No additional ordering constraint was found between the two corrections.
  After the PRO-1 fix, watch `start-retry-required` reaches
  `triggerClientFallback` (`:453-491`). That is safe: no provider work began,
  and the restarted server cannot resume a legacy run, since only the client
  re-POSTs it.

## 4. D-1 options considered

| Option | Effect | Verdict |
|---|---|---|
| Settle every orphan as `cancelled` inside `recoverAll()` | Unblocks with no UI work | **Rejected.** It silently discards user input, against the D-1 rationale. It depends on the notice-scan order (§3.6). It misses the no-restart orphan (§3.8). It strands the R-B marker unless the proof also changes |
| Move orphans to `blocked_edit` (new reason such as `settings_context_lost`) | R-A becomes retryable | **Rejected for R-B, R-C and R-D**: no retry and no cancel (§3.3). **Not recommended for R-A** either: a retry costs a model call and is then the only exit; the user cannot just discard the input |
| New durable state (for example `settings_lost`) | Explicit vocabulary | **Rejected.** It needs new persistence, parser, status, notice, retention and proof handling, for the same user outcome as below |
| **Keep orphans non-terminal; explicit cancel through the existing DELETE** | One mechanism for all four points and the no-restart case; reuses the tombstone, settle, proof and marker-clear path | **Recommended** |

This refines the plan's D-1 recommendation ("durable non-runnable state with
an explicit cancel"). The non-runnable classification is *derived*, not
stored. The terminal state is the existing `cancelled`, entered only by a
user action.

## 5. Correction contract (normative for W1-A stages 1–2)

### 5.1 Definition

A record is an **orphan input** when all of the following hold:

- `recordVersion === 4`;
- `admission.inputPreparation !== 'client'`;
- `inputState` is `queued` or `attached`;
- either `transformState === 'unknown'`, or the in-process settings snapshot
  for the record is absent (`readSettingsSnapshotRecord(record) === null`).

Client-prepared records are excluded. Recovery and `loadExecution` already
move them to a retryable `blocked_edit`.

### 5.2 Invariants

- **I-1 No silent settlement.** Recovery never moves an orphan to a terminal
  state. Only an explicit user cancel, or a later exact execution path that
  already exists, may do so.
- **I-2 Exit exists.** Every projected orphan has `cancelAllowed: true`, and
  the UI offers a cancel for it.
- **I-3 Cancel is exact.** The cancel calls the existing
  `DELETE /api/bg-orchestrate/:operationId?charId&chatId`. Its outcome is
  the existing `cancelled` input state plus an operation tombstone. No new
  server state or route is added.
- **I-4 Release.** After the cancel: `hasPendingGeneration` is false for the
  chat (assuming no other non-terminal record), the projection no longer
  lists the record, `chooseServerInputBase` returns `ready`, and a fresh
  admission has no execution predecessor.
- **I-5 Marker settles.** After the cancel, the submitting browser's
  server-input marker is cleared by the existing cancelled-proof flow for
  every orphan class, R-B included. Polling then falls back to the idle
  rate.
- **I-6 No paid replay.** Nothing in the correction re-runs a transform or a
  provider call. Retry stays limited to rows that are `retryAllowed` today.
- **I-7 Unchanged elsewhere.** `hasPendingGeneration`, `recoverAll`
  transitions, retention eligibility, notice classification, and every
  live-run path behave as before.

### 5.3 Changes by component

| # | Component (pack → composed file) | Change |
|---|---|---|
| C1 | `lazy-chat-bg-adapter` → `serverChatInputOwner.cjs` `pendingProjection` | `cancelAllowed = inputState === 'queued' \|\| (inputState === 'attached' && orphan)`. `queued` keeps its current value; the second part is new |
| C2 | same file, `readCancelledInputProof` | Also treat a server-prepared record with `transformState === 'unknown'`, no receipt and `matches.length === 0` as `attachment: 'none'`. A `running` transform keeps returning `null`, because a live transform's attach is refused only by the operation tombstone, and the existing test asserts `null` for it |
| C3 | `files-1.10/src/ts/bgServerPendingProjection.ts` | Parse `cancelAllowed` as an optional boolean; reject other types, as for `retryAllowed`; copy it for `blocked_edit` and `execution_unknown` rows only |
| C4 | `files-1.10/src/ts/bgOrchestrate.ts` unit (next to `cancelObservedServerOperation`) | Export `cancelPendingServerInput({operationId, charId, chatId})`. It calls the DELETE route through `fetchOrchestrationControl` and maps the answers: `cancelled: true` → `'cancelled'`; `finished: true` → `'finished'`; anything else → `'unconfirmed'`. Afterwards it dispatches `bg-server-input-updated`. It never touches `activeOperationId` or the watch |
| C5 | `ServerPendingInputs.svelte` | New optional prop `onCancelPending`. For an actionable row with `cancelAllowed`, render a cancel button with a single-flight guard (the same pattern as `retryingId`) and a one-line warning: "이미 사용된 모델 호출이나 외부 작업은 되돌리지 않아요" for `execution_unknown`, and for `blocked_edit` with an unknown transform. Rows without `cancelAllowed` stay unchanged |
| C6 | `DefaultChatScreen.svelte` (server-pending-ui unit) | Pass `onCancelPending`, which calls C4. On `'unconfirmed'`, show a warning toast and keep the row |

Not changed: `recoverAll`, `hasPendingGeneration`, `TERMINAL_INPUT_STATES`,
the DELETE route, `bgOperationNotices`, retention, and the drain.

Optional, needs the owner's call (D-R1-2 below): for R-A and R-B rows, after
a confirmed cancel, put `rawText` into the composer draft if the draft is
empty. This gives a resend path without a new server state.

### 5.4 W1-A stage 3 (PRO-1) — carried unchanged from PRO §1

- Exclude `start-retry-required`, `interrupted-before-result`,
  `interrupted-after-main` and `delivery-failed` from the
  `server-owned-uncommitted` retention branch in watch and in boot.
- Replace the default reason `commit-receipt-invalid` with
  `no-commit-evidence`.
- Do not widen `isFinishedServerFailure()`.

This investigation found no interaction that changes that recommendation
(§3.9).

### 5.5 Decisions to confirm

| ID | Decision | Recommendation |
|---|---|---|
| D-1 (refined) | Terminal handling of orphan server inputs | Derived orphan classification + explicit cancel to the existing `cancelled` (§4) |
| D-2 | Orphans and `hasPendingGeneration` | Keep blocking until the user cancels (§3.7) |
| D-R1-1 | Extend the cancelled proof to `transformState: 'unknown'` | Yes (C2); otherwise I-5 fails for R-B |
| D-R1-2 | Restore `rawText` to the draft after cancelling R-A or R-B | Optional UX; not required for correctness |
| D-R1-3 | Fix the R-A notice text (no cost occurred) | Defer; outside R1 |

## 6. Targeted regression tests

All of these are new or deliberately updated cases in existing suites. "→"
gives the expected result.

### 6.1 Server owner — `serverChatInputOwner.test.ts`

| ID | Case | Expected |
|---|---|---|
| T-S1 | Restart at R-A, R-B, R-C, R-D (`it.each`); `recoverAll()` twice | Records as in §2; `hasPendingGeneration` true; projection `cancelAllowed: true` for all four |
| T-S2 | T-S1, then the DELETE not-active sequence (tombstone, delete result, `settleSynchronously(...,'cancelled')`) | `inputState: 'cancelled'`; `hasPendingGeneration` false (char-scoped and `null` char); projection `[]` |
| T-S3 | T-S2, then a fresh admission on the current revision | `admitted`, `executionPredecessorId: null`, `loadExecution` → `transform-required` |
| T-S4 | Cancelled proof per point after T-S2 | R-A `none`; **R-B `none`** (new); R-C and R-D `attached` with the receipt id |
| T-S5 | Live `running` transform cancelled in-process (existing `:197-206`) | Still `null`; keep this test unchanged |
| T-S6 | Live runnable rows (`queued` with snapshot, `attached` with snapshot and op `queued`/`running`) | `attached` rows `cancelAllowed: false`; `queued` rows unchanged (`true`) |
| T-S7 | Orphan without restart: admit → `beginTransform` → `markRunFailureSynchronously(id, false)` | Same projection as R-B; T-S2 to T-S4 hold |
| T-S8 | Predecessor and successor admitted, then restart | Both projected `cancelAllowed: true`; cancelling the predecessor alone keeps the chat blocked; cancelling both releases it |
| T-S9 | `blocked_edit` record plus `settleSynchronously('cancelled')` | Returns `false`; record unchanged. Pins the §3.3 constraint so that a later D-1 change cannot rely on it silently |
| T-S10 | Existing `:823-883` and `:1502` | Unchanged: the restart states stay as designed; only `cancelAllowed` assertions are added |

### 6.2 Routes — `bgServerChatCommitRoutes.test.ts` harness, with a real input owner and journal

| ID | Case | Expected |
|---|---|---|
| T-R1 | For R-A to R-D after a simulated restart: `DELETE /api/bg-orchestrate/:id?charId&chatId` with no registry run | 200 `{cancelled: true, state: 'cancelled-before-or-after-restart'}`; operation state `cancelled`; result key deleted |
| T-R2 | T-R1, then `GET /api/bg-orchestrate-status/:id` | `input-cancelled` with a non-null `cancelledInputProof` for all four |
| T-R3 | T-R1, then `GET /api/bg-chat-activity/:charId/:chatId` and `GET /api/bg-orchestrate-chat-state/...` | `busy: false`; `pendingInputCommands: []` |
| T-R4 | DELETE without `charId`/`chatId` for an orphan | 409 `not-active`; input unchanged (existing guard) |
| T-R5 | Model-jobs main guard via `isChatGenerationBusy` before and after the cancel | 409 before; allowed after |

### 6.3 Client

| ID | Suite | Case | Expected |
|---|---|---|---|
| T-C1 | `bgServerPendingProjection.test.ts` | Rows with `cancelAllowed` true, false, absent or non-boolean | Copied for `blocked_edit` and `execution_unknown`; non-boolean rejects the projection |
| T-C2 | `ServerPendingInputs.test.ts` | `execution_unknown` row with `cancelAllowed` | One cancel button; click calls `onCancelPending` once (single-flight); no retry button. Update the existing "does not offer paid retry when execution identity is unknown" case deliberately |
| T-C3 | same | `blocked_edit` with `retryAllowed: true` and no `cancelAllowed` | Retry button only (unchanged) |
| T-C4 | same | Active states (`queued`, `attached`, `generating`, `waiting_predecessor`) | Still no card and no cancel (existing `it.each` stays green) |
| T-C5 | `bgOrchestrate` unit (new or in `bgFinishedOperationFlow.test.ts`) | `cancelPendingServerInput` on 200 cancelled / 200 finished / 409 / network error | `'cancelled'` / `'finished'` / `'unconfirmed'` / `'unconfirmed'`; `bg-server-input-updated` dispatched; the watch state is untouched |
| T-C6 | `bgCancelledInputSettlement.test.ts` | `none` proof for an unknown-transform cancel; canonical and local chat both without the row | Marker cleared; `hasServerOwnedInputMarker` false; polling interval 5 s |
| T-C7 | `bgServerInputAdmission.test.ts` | Projection before and after the cancel | `unresolved-server-input` → `ready` |
| T-C8 | `bgFinishedOperationFlow.test.ts` (PRO-1) | The four orphaned states × {legacy, server-owned} × {watch, boot} | Marker cleared, exactly one notice, no peek after wake events; `chat-committed` hydration, `input-*` states and `anchoredCommitConflictNotice` unchanged |

### 6.4 End to end (W0-1, then re-run after the fix)

Run in a browser against a composed `v1.10.0` server:

1. Start a long generation in chat A.
2. Send a server input in chat B so that it queues behind A (R-A). Repeat
   with a slow input transform (R-B) and with a slow provider (R-D).
3. Restart the server and reload the page.

Before the fix, record: the pending card text, whether any control exists,
the send refusal, and the model-job refusal. After the fix, verify:

- one cancel per row;
- after the cancel, chat B can send, the marker is gone, and polling drops
  to 5 s;
- no notice is lost: the startup `operation_interrupted` notice is still
  delivered once.

## 7. Residual risks and limitations

- **Module level only.** The four restart points and the cancel were
  reproduced against the real owner modules, with the DELETE route's
  not-active branch performed by hand. Neither the HTTP route nor the
  browser ran (T-R1 and §6.4 close this). The client conclusions in §3.1 and
  §3.5 rest on a trace of the composed sources.
- **No owner-visible registry.** C1 uses snapshot absence as the "cannot
  run" proof (§3.4). If a future change keeps snapshots across a restart, or
  frees them during a live run, C1 must use an explicit registry query
  instead. T-S6 guards the current behaviour.
- **Notice ordering.** The contract avoids automatic settlement, so it does
  not depend on the startup scan order (§3.6). Any later proposal to settle
  automatically must capture the notice first.
- **Pre-restart gap.** A live input queued behind another chat cannot be
  stopped from the UI (§3.1). C5 renders cancel only for actionable rows,
  so this gap remains. It is noted for C-08 (W0-5), not fixed here.
- **Not examined:** the attached-with-snapshot no-restart path (§3.8 end);
  plugin-host child-process crash timing; multi-tab cancel races beyond the
  existing single-flight and the exact-proof checks.
- **Line numbers** are composed-tree positions. Re-locate them before
  editing layered files.
