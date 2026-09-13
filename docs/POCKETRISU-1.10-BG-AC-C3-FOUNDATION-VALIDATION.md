# PocketRisu 1.10 BG server chat save × Archive Center C3 foundation validation

Date: 2026-09-14 KST

Status: **revision-bound owner projection, server-commit receipt hydration,
and pre-canonical server input primitives implemented; C3 product activation,
C4–C7 integration, live application, and release are not complete**

## Scope and non-claims

This checkpoint starts from C2 commit `96cf484` and records the implementation
through installer commit `09ee8e0`. It changes only the private personal
patcher branch and a disposable exact PocketRisu 1.10 target.

The checkpoint does not enable the new input protocol. The composed server
advertises `inputCommandVersion: 0` and
`inputCommandFoundationVersion: 1`; the current client sends neither
`inputCommandVersion` nor `serverChatCommitVersion`. The internal flag-1 route
exists for focused composition tests, but it is not a supported or live
contract. No live PocketRisu tree, PM2 process, user database, paid provider,
Archive Center runtime, tag, or release was changed.

Accordingly, this report does not claim the plan's C3 exit condition. It
records three usable foundations and the exact blockers that must close before
the capability can be raised from zero.

## Implemented foundations

### Revision-bound chat execution projection

- `serverChatExecutionState` stores one normalized entry per char/chat and
  message-level owner records bound to message fingerprints.
- commit publication accumulates owners, while edited or deleted messages are
  excluded by exact ID plus source-revision reconciliation.
- the authenticated
  `GET /api/bg-orchestrate-chat-state/:charId/:chatId?revision=...` route
  returns `revision_mismatch`, `ownership-unknown`, or an authoritative
  projection rather than treating unknown as an empty owner set.
- pending-only input data is exposed with `coverage: unknown`; it is not
  mislabeled as authoritative ownership.
- full and patch database writers preserve the server-owned commit ledger,
  global-conflict ledger, execution projection, and statics applied ledger.

### Receipt-aware canonical chat hydration

- foreground polling and cold-boot recovery detect a valid
  `bg_server_chat_commit.v1` receipt and skip the legacy merge, browser save,
  and duplicate effect path.
- the client reads an authoritative projection before fetching the canonical
  chat, follows one `revision_mismatch` to the current revision, and accepts a
  descendant only when that projection still contains the exact operation
  owner.
- server SHA revisions validate projection and fetched bytes; operation-local
  semantic revisions independently fence unsaved local edits. They are no
  longer compared as though they were the same revision domain.
- canonical chat reading is now split into `peekChatContentSnapshot()` and
  `rememberChatContentSnapshot()`. The sync/ETag baseline advances only after
  the local slot survives the second identity/revision check and the fetched
  chat is adopted.
- hydration keeps the existing in-flight and just-applied guards, clears
  streaming-only display state, and updates the pending target to the semantic
  revision of the adopted chat.

### Pre-canonical server input foundation

- `bg_server_input_command.v1` persists operation, command, reserved message,
  char/chat, raw text hash, submitted base, settings reference, timestamp,
  admission sequence, and predecessor identity before canonical append.
- the owner admits one active command per chat, reuses an exact operation
  fingerprint, rejects a reused `inputCommandId` across operation IDs, and
  rejects a changed canonical base.
- transform state moves `not_run → running → completed`; restart while running
  becomes `unknown` and is never automatically rerun.
- the existing input trigger and `editinput` script run in the server BG
  bundle, then one reserved user message, exact global intent, input receipt,
  journal row, and operation metadata are attached through the existing
  storage queue and SQLite transaction.
- canonical/global changes detected before attachment become `blocked_edit`.
  A second global check at post-transaction publication prevents a later
  race from reaching provider work with a detached global state.
- terminal failed/cancelled/completed operations retain and recover a durable
  input attachment. Recovery preserves a newer live descendant containing the
  exact reserved input instead of restoring its older ancestor.
- backup import, database replacement, save-folder import, and snapshot
  restore clear the input and commit recovery namespaces together.

## Runtime audit v2

### Phase 1 — flat discovery

- input admission stores raw text and stable identities in SQLite KV;
- admission scans persisted commands for active-chat and command-ID conflicts;
- admission sequence and predecessor identity advance per chat;
- a submitted base revision is compared with the canonical full-chat store;
- input trigger and edit-input script execute before the user message is
  durably attached;
- transform state can become running, completed, unknown, or blocked;
- global-variable intent is derived from the detached transform database;
- journal preparation encodes a full input-attached chat before the sync
  transaction;
- journal row, input record, and operation state are written together;
- journal and cache/full-store publication occur after that transaction;
- publication can encounter a newer chat, a newer global value, cache failure,
  or process termination;
- terminal generation state and attachment durability have different
  lifetimes;
- startup scans input and commit records before listen;
- pending projection returns raw input text to an authenticated caller;
- commit publication stores message owners in the stripped root database;
- later client full/patch root writes can omit those server-owned fields;
- projection reads reconcile persisted owners against the current full chat;
- projection reads scan commit records and compute the current chat revision;
- projection HTTP lookup is authenticated and revision-fenced;
- result polling can observe a receipt before or after the result payload is
  cleaned up;
- receipt validation binds operation, result, publish sequence, coordinates,
  stored ID, disposition, effects, and stored revision;
- a projection can advance beyond an older result receipt;
- canonical chat fetch updates a client sync baseline used by later CAS saves;
- a local slot can change while canonical chat fetch is in flight;
- client semantic revision and server encoded-byte SHA revision are distinct;
- successful hydration skips legacy chat/global/statics persistence;
- failed hydration leaves the result or recovery marker available for retry;
- input and projection records have per-record limits but no count/lifetime
  compaction policy;
- direct database deletion resets its main key before later recovery cleanup;
- the current client does not negotiate the C2/C3 protocol;
- no AC capability, claim, prepare, transform, complete, or settle call is
  introduced;
- no new socket, subprocess, recurring timer, or unauthenticated endpoint is
  introduced;
- manifest content, pack ETag, installers, and complete graph change.

### Phase 2 — external anchors

| Leaf | Break attempted | External anchor / observed result |
| --- | --- | --- |
| Duplicate logical input appends twice | Reuse one `inputCommandId` under another operation after the first terminates | `serverChatInputOwner.cjs:284-323` scans all durable records inside the admission transaction and returns `input_command_identity_conflict`; the sequence fixture observed no second admission. |
| Transform reruns after process interruption | Restart after `beginTransform()` but before attachment | `recoverAll()` changes queued/running to `unknown`; focused tests observed `transform_outcome_unknown` from recovery and load rather than a second trigger/script call. |
| Base edit is overwritten | Change canonical chat between admission and attachment | `attachTransformed()` rereads the exact base inside the storage transaction and records `blocked_edit`; no journal write or full-store replacement is acknowledged. |
| Global edit is ignored before the transaction | Change a prompt-relevant global after transform but before attachment | Per-key expected outcomes are checked in the transaction; the fixture retained the newer value, returned `global_variables_changed`, and kept canonical chat unchanged. |
| Global edit races after the transaction | Change the same global while post-commit publication awaits canonical state | `applyGlobals()` now revalidates every committed outcome before any cache mutation. The publication fixture returned `pending_recovery`, retained the newer value and base chat, and `loadExecution()` remained blocked; provider control rejects pending publication. |
| Terminal input disappears after restart | Settle an attached operation failed or cancelled before the debounced root persist | recovery selects any valid receipt/journal attachment rather than only `inputState=attached`; both terminal fixtures restored the exact reserved user message and globals without rerunning transform. |
| Recovery overwrites a newer reply | Recover a completed input after a descendant assistant message exists | `publishAttached()` recognizes the exact reserved user-message fingerprint in the newer chat; the fixture retained the same descendant object and scheduled no extra persist. |
| Edited/deleted output remains server-owned | Change or remove an owned message while retaining the root projection | `reconcileOwners()` requires exact message ID and SHA-256 source revision; projection tests excluded the changed owner and preserved unaffected owners. |
| Unknown projection becomes an empty authoritative set | Query a current chat with no owner history but a pending input | the route returns pending data with `coverage: unknown`; without history or pending data it returns HTTP 404 `ownership-unknown`. |
| Old receipt cannot hydrate after N+1 | Request N's stored revision after a descendant commit | the client follows one 409 to the current revision, then `validProjection()` requires N's exact operation owner. The helper fixture adopted the descendant; a projection containing only another operation was refused. |
| Local edit is overwritten during fetch | Replace the local chat object while the server snapshot request is in flight | `adoptServerCommittedChat()` checks object identity again after fetch; the fixture retained the replacement and did not call `rememberChatContentSnapshot()`. |
| Refused adoption advances CAS baseline | Fetch a valid server snapshot, then fail the second local-slot check | the new peek/remember split leaves the sync baseline untouched until adoption; success calls remember once after slot replacement, while revision/slot refusal calls it zero times. |
| Different revision domains always conflict | Compare server SHA values with `orchestrationChatRevision()` | hydration now supplies semantic revisions from `mergeTargetByOperation` only to the local fence and supplies projection SHA only as the expected fetched revision. Unit assertions lock the separated arguments. |
| Later client save deletes server-owned root state | Submit a full or JSON-patch root lacking new fields | both exact-1.10 writers call `preserveDatabaseState()` before invariant checks. Full/patch tests retained all four server-owned ledgers and refused malformed state. |
| A malformed unrelated commit record yields false authority | Insert an invalid commit envelope before projection lookup | `readChatProjection()` returns conflict/unavailable rather than a partial authoritative projection. This is fail-closed availability and remains subject to C6 compaction. |
| Authentication is bypassed | Start the composed server and call changed routes without a session | root returned 200; capability, projection, and start returned 401 through the existing session middleware. |
| Replacement leaves stale input/result owners | Exercise each current database replacement owner | manifest and route tests cover backup, database removal, save-folder import, and snapshot restore calls to both discard owners. Direct database removal is not one atomic transaction and remains a surface. |
| Incomplete C3 becomes advertised | Read composed capabilities and current start payload | capability returned source contract version 0 with foundation version 1; root tests confirm the current client import/start payload has no input opt-in. The internal explicit flag path still exists and must not be deployed as supported before the blockers close. |
| Composition cannot return to pristine | Apply, status, zero-change plan, then revert the complete graph | the final graph was current at 40 packs, 998 units, 352 paths, and 13 ordered collisions; all 352 managed paths matched pristine existence, bytes, and POSIX mode after revert. |

### Collaborator verification processing

Three bounded read-only mapping batches returned 40 strict-schema rows:
client hydration 14/14 passed, projection 12/12 passed, and input mapping
13/14 passed with one stale line location. A separate five-finding audit was
exhaustively re-read; all five findings were real. Four were fixed here and
the immutable-settings finding remains the activation blocker below.

The post-fix five-line batch satisfied its schema. Local re-reading accepted
four classifications and rejected one `FIXED` classification as partial: it
checked the pre-transaction global fence but missed the publication window.
That window was reproduced and fixed by the primary implementation turn.
The batch therefore records 4 pass, 1 stale/partial, 0 discarded; no
collaborator edited a file.

### Phase 3 — triage

- **Q1 fixed in the dormant foundation:** terminal attachment recovery,
  cross-operation command deduplication, pre- and post-transaction global
  conflict fences, descendant receipt hydration, delayed sync-baseline
  adoption, and local/server revision-domain separation.
- **Q1 activation blocker:** `settingsSnapshotRef` is fingerprinted and stored
  but never resolves an immutable execution snapshot. The capability remains
  zero; raising it before this closes would allow a retried command to execute
  under later settings.
- **Q2/Q3 resolved in the implemented slices:** exact owner reconciliation,
  unknown-versus-authoritative projection semantics, full/patch root-state
  preservation, one-hop revision mismatch follow, operation-owner validation,
  input record byte ceilings, reset wiring, and authenticated route reuse.
- **Q4 prepared surfaces:** true N+1 admission, pending UI and blank-browser
  reconciliation, transform-side-effect recovery, conflict copy, AC C4/C5,
  retention/compaction, direct-delete atomicity, and actual provider/process/
  device behavior remain below. They are not admitted by this checkpoint.

## Prepared surfaces

| Item / claim | Resolved through | Exact blocked link | Why this checkpoint cannot close it | Required next observation |
| --- | --- | --- | --- | --- |
| Immutable request settings | Admission fingerprints `settingsSnapshotRef`; C2 hashes a server DB | admission → durable allowlisted settings bytes → retry uses those exact bytes | no snapshot owner or resolver exists; current run reloads current DB | device A/B setting divergence, `/config/update` during a run, restart, and digest/readback fixtures |
| N+1 command queue | per-chat monotonic sequence and predecessor are stored | N active → N+1 admitted outside canonical → predecessor terminal policy → attach once | owner currently returns `chat_input_busy` for every second active command | N success/failure/cancel/edit crossed with N+1 autosave, lost ACK, and one-time script/append |
| Pending UI and blank browser | authenticated projection can return pending records | ordinary chat-open hydrate → same-revision projection → render/cancel/reconcile pending | client calls projection only while recovering a known operation; no chat-open consumer exists | empty local state, no operation marker, delayed projection, cancel, and refresh tests |
| Transform side effects | running restart becomes unknown; chat/global attachment is journaled | trigger/script non-chat effects → durable outcome identity → safe resume or explicit block | only chat and global diff are owned; arbitrary trigger/script effects were not catalogued | instrumented trigger/script fixture proving every side effect or a fail-closed supported subset |
| Attached publication conflict UX | provider is blocked and input remains durable | `pending_recovery/attached_chat_changed` → explicit pending/blocked-edit state and user action | state is safe but not projected as a clear blocked command after this publication race | foreground and cold-boot UI fixture with newer global/chat and no provider call |
| Conflict copy | canonical revision conflicts preserve the server result | stable B ID → metadata/list visibility → independent owner/binding/AC disposition | storage branch and AC policy remain C6 | process exit around B metadata publication; A ownership never attached to B |
| Real Archive Center | C2/C3 mark AC disabled and preserve source owners | capability/settings → claim → durable prepare → payload/output transform → complete/settle | C4 typed Go transport and C5 host adapter are absent | isolated AC current/previous-turn, v1–v4, skip, response-loss, restart, and output parity tests |
| Record lifetime and startup cost | raw text is capped at 1 MiB; one input record at 2 MiB; result retention is separate | chat/source/late-ACK references → safe input/commit/projection compaction | input scans, commit scans, projection entries, and tombstones have no count/TTL policy | bounded high-count startup/projection measurements crossed with result TTL and late owner lookup |
| Direct database deletion | all known recovery namespaces are called from the route | database-key delete plus every linked cleanup as one atomic outcome | existing route deletes the DB key before additional cleanup calls | failure injection at every delete; transaction or explicitly accepted recovery semantics |
| Actual browser-exit support | focused route, full suites, bundle load, and graceful HTTP smoke pass | real provider stream/postprocess → kill browser process → normal chat read before browser restart | no paid provider or physical device was used; feature is unopted | C7 timestamped process-exit/API readback and concrete iPhone scenarios |

## Cross-piece interaction check

- C1's transaction remains the final response owner; C3 input attachment is a
  separate earlier journal record whose receipt and base are passed into C1.
- terminal input state no longer controls attachment recovery. A failed or
  cancelled provider operation can retain its already accepted user message
  without claiming a successful assistant result.
- C2 owner projection is reconciled against the latest normal chat, so an old
  result receipt can authorize transport ACK only while its exact owned output
  still exists in the descendant.
- client hydration adopts the normal chat and NodeStorage baseline once, then
  bypasses legacy globals/statics/chat save. Legacy results still enter the old
  merge/save/ACK branch.
- full and patch root writers preserve server-owned state, while the existing
  client build fence remains the rolling-deployment owner.
- result ACK/TTL does not delete chat, commit envelope, projection, or input
  ownership. C6 must define their joined retirement.
- PageFold stays in the same BG bundle. The final load condition checks
  `sendChat`, `runTrigger`, and `processScript`; no second generation engine or
  plugin runner was added.
- AC fields remain explicit disabled/unbound values. No browser v1–v3 host fact
  is relabeled as a PocketRisu server observation.

## Verification receipt

- Patcher source tests: **52/52 files passed**.
- Exact C1–C3 server focus: **6/6 files, 56/56 tests passed**.
- Exact C3 client focus: **2/2 files, 11/11 tests passed**.
- Complete target frontend: **153/153 files, 1,742/1,742 tests passed**.
- Complete target server: **27/27 files, 279 passed, 12 skipped**.
- Compatibility suite: the sandbox-only run stopped at loopback `listen
  EPERM`; the same complete suite with loopback enabled reported **10 files
  passed, 1 skipped; 74 tests passed, 5 skipped**.
- Svelte diagnostics: **0 errors, 0 warnings**.
- Production client build: **7,941 modules transformed**.
- BG bundle: **8,861,860 bytes**, SHA-256
  `c62632f122e827c9c30cfbf15450ce22a764c2d56ad602cad68b0076b8db2b85`;
  load condition passed for `sendChat`, `runTrigger`, and `processScript`.
- Complete graph: **40 packs, 998 units, 352 managed paths, 13 ordered
  collisions**; status current, zero-change re-plan, then exact revert with
  **0 existence/byte/mode mismatches** across all 352 paths.
- Final composed-server smoke: root HTTP 200; unauthenticated capability,
  projection, and start HTTP 401; graceful SIGINT flush observed.
- Two final installer builds were byte-identical. Both generated installers
  are mode 0755, **8,187,942 bytes**, syntax-valid, and SHA-256
  `8c8222c0a56f46cdb2ae319ff327961af36079c51bd1a3ad67e81aa7a706f1a3`.
- No provider call, live apply, PM2 restart, user-data mutation, AC runtime
  mutation, tag, or release was performed.

## Implementation commits

- `99d681b` — revision-bound chat owner projection.
- `d10c62f` — server-commit receipt hydration.
- `87dcf54` — server-owned root-state preservation.
- `d2012d8` — pre-canonical server input command primitive.
- `5351932` — pre-provider input recovery fence.
- `a318c8c` — durable terminal input ownership and command deduplication.
- `0203ea6` — descendant receipt hydration and capability-zero fence.
- `47a016b` — post-transaction input publication conflict fence.
- `db72ec0` — delayed sync-baseline adoption and revision-domain separation.
- `09ee8e0` — final reproducible installers for this checkpoint.

## Verdict and next direction

The C3 foundation now supplies the storage, projection, and hydration
primitives needed by the plan, but the product C3 gate is still open. The next
PocketRisu slice must first persist and resolve an immutable allowlisted
settings snapshot, then replace the one-active-command rejection with true
N+1 predecessor handling and connect pending/chat-open reconciliation. Only
after those paths and their UI are tested should the client advertise
`inputCommandVersion: 1` and request C2 server commit.

C4 and C5 can proceed in parallel from the already completed AC store
primitives, but no real AC execution should be connected to PocketRisu until
the immutable settings and input-order contracts above are usable. C6 then
joins claims, prepare/complete, mutation delivery, conflict/reconciliation,
and retention; C7 remains the only live/browser-exit qualification boundary.
