# PocketRisu 1.10 BG × Archive Center C2 server result commit validation

Date: 2026-09-14 KST

Status: **C2 opt-in server result commit complete; C3 client opt-in/input and
projection, C4/C5 Archive Center integration, C6 retention/reconciliation,
live application, and release are not complete**

## Scope and authority

This slice follows the public integration plan's C2 boundary and connects the
C1 transaction primitive to the exact-1.10 detached BG final-result path. It
does not opt the current browser client into the new request contract, move
input admission before canonical save, add the chat owner-projection endpoint,
call Archive Center, apply to the live PocketRisu tree, or make a stable
release.

| Input | Revision / boundary |
| --- | --- |
| Patcher branch before C2 | `b93aa64e92233386f504a2d774f32c3dc16e2a67` |
| Ordered recovery foundation | `f59ceb1ed710752625a39e8b82395bf5695303c2` |
| BG result connection | `d4928e3675ed8ca53446d7a418f7da6b1de6f53c` |
| Recovery and retry hardening | `d1c97df95d6ca35e973ae4aa76f77badaf7977ad` |
| Real-owner route integration test | `23d44cf1e39a5d34829723bae9d820ed1318e34a` |
| Final installer build | `ce05baf98397d88746cb4adc01fc3f5f18575001` |
| Target | exact PocketRisu `1.10.0` |
| Archive Center | isolated unmodified 4.3.1 baseline; no C2 transport |

The new server owner and route test are exact-1.10 managed files. The shared
journal keeps ordinary pair-key rows unchanged while operation-scoped commit
rows use a separate key shape and recovery lifecycle.

## Implemented boundary

### Versioned route admission

The existing `POST /api/bg-orchestrate` detached path recognizes
`serverChatCommitVersion=1` only when operation-keyed results are also enabled
and the server commit owner exists. Before provider work it reads the current
canonical chat and compares the submitted chat with that exact revision. A
missing or stale base is rejected rather than treated as a server-owned run.

The version and canonical base revision are copied into the durable operation
record and in-memory run. A restartable `queued` operation may resume only
when the repeated request keeps operation-keyed delivery, the same server
commit version, and the same canonical server base. Version or base drift
returns `operation-protocol-conflict` before scheduling provider work.

The current client does not send `serverChatCommitVersion`; its ordinary BG
path therefore keeps the existing result delivery and browser merge/save/ACK
behavior. Settings hashing and server chat commit work are also skipped for
that path.

### Detached final-result owner

For an opted-in terminal success or terminal partial result, the route:

1. allocates one `resultId`, `publishSeq`, and commit timestamp;
2. passes the canonical base, original message count, actual server settings
   digest, final chat, globals delta, and statics delta to the C1 primitive;
3. persists the ordinary operation-keyed result with the returned commit
   receipt for compatibility and later reconciliation;
4. leaves the operation in `chat-committed` instead of overwriting it with
   `result-ready`; and
5. preserves a legacy result when the commit conflicts or fails, while a
   durable cancellation suppresses the terminal result.

The production function still defaults to the existing `runServerPreview`.
An injected `runServerPreview` dependency exists only as a test seam, allowing
the actual detached handler and actual server commit owner to be exercised
with a fixed result and no provider call.

### Canonical publication and recovery

`serverChatCommitOwner.cjs` binds the C1 primitive to the existing owners:

- `queueStorageOperation` and one `better-sqlite3` transaction serialize the
  durable journal, metadata/effect decision, operation state, and envelope;
- `fullChatStore` supplies the canonical base and receives the committed chat;
- the stripped database cache receives chat metadata, expected-value global
  outcomes, statics delta, and the operation-applied ledger;
- existing cache/ETag publication and `scheduleChatStorePersist()` publish and
  schedule the normal database save after the durable transaction;
- post-commit publication failure remains a committed, recoverable operation
  and never requests another provider run.

Commit journals are keyed by `(charId, chatId, operationId)`. Ordinary lazy
startup restore and database-persist cleanup skip those rows, so multiple
unflushed commits cannot replace each other or disappear before the commit
owner replays them. Recovery sorts envelopes by a transaction-allocated
`commitSequence` and rejects duplicate sequence identities.

The sequence allocator uses both its SQLite counter and the highest sequence
inside a restored canonical applied ledger. Database replacement can remove
the counter without causing the next commit to reuse a restored sequence.

### Route precedence and database replacement

Status and result lookup rediscover a durable commit receipt even after the
ordinary result payload has been delivered or removed. Cancel checks the
commit envelope before touching the in-memory run and returns
`already-committed`; a cancellation durable before the commit transaction
continues to win.

All four current lazy-journal replacement owners call commit cleanup:

- backup import;
- direct database deletion;
- save-folder import; and
- point-in-time snapshot restore.

Cleanup removes commit envelopes, the sequence counter, and the exact
operation state/result rows linked by those envelopes. It does not delete
unrelated operation rows. The normal restore/import transactions cover three
of these owners; direct database deletion retains its pre-existing non-atomic
reset boundary and remains recorded below.

## Failure and integration observations

Observed exact-target cases include:

- a fixed detached terminal result traversed the real route, real journal
  codec, and real commit owner and updated the normal full-chat store,
  metadata, statics, `chat-committed` state, and result receipt without a
  browser save;
- stale submitted chat was rejected before provider work;
- queued v1→v0 and v0→v1 negotiation changes, and same-version canonical-base
  drift, were rejected before run scheduling;
- ordinary startup with zero commit rows did not decode the database or call
  the canonical-state loader;
- cache publication failure left a durable receipt and recovered the exact
  chat without a second commit or stat increment;
- two unflushed commits for one chat recovered in commit-sequence order;
- replay of already-applied envelopes did not roll the current chat back;
- a restored applied ledger ending at sequence 7 caused the next commit to use
  sequence 8 even when the separate counter was absent;
- database replacement removed only the linked operation state/result and
  retained an unrelated operation fixture;
- per-key global conflict preserved the newer canonical value;
- revision conflict and durable cancellation produced no commit envelope;
- status, cancel, result-cleanup, and committed receipt precedence remained
  stable in route tests.

These are synthetic/no-provider observations. They prove the opted-in server
route and storage owner composition, not actual device closure, actual model
transport, Archive Center behavior, or the C3 client branch.

## Runtime audit v2

### Phase 1 — flat discovery

- the start request parses a new server-commit negotiation flag;
- flag 1 requires operation-keyed result delivery and an installed owner;
- canonical server state is loaded before an opted-in provider run;
- submitted chat revision is compared with the canonical server revision;
- settings digest hashes the server database and selected coordinates only for
  opted-in runs;
- operation records persist server-commit version and canonical base;
- active and durable repeated operation IDs can reuse prior lifecycle state;
- queued retries can reach provider scheduling after a process restart;
- an internal preview dependency selects the existing production function or
  a test-only injected function;
- terminal success and partial results call the server commit owner;
- terminal error continues through the existing result-only path;
- commit conflict/failure keeps an operation-keyed result for reconciliation;
- cancellation after a durable commit is rejected;
- cancellation before the transaction prevents commit and result publication;
- status can return a commit receipt before or after result payload cleanup;
- the same result ID and publish sequence bind the receipt and result record;
- the owner reads and hashes the full final chat;
- final chat bytes are encoded into an operation-scoped journal row;
- metadata, globals, statics, operation state, sequence, and envelope are
  written in the same SQLite transaction;
- globals use per-key expected-value outcomes and preserve newer values;
- statics use an operation ledger to avoid a repeated increment;
- full-chat and stripped-database caches publish after the transaction;
- cache publication schedules the existing debounced database persist;
- publication failure leaves durable recovery rows and a public sanitized
  error;
- startup scans commit rows before listen only when the prefix is nonempty;
- recovery decodes journals and replays envelopes in commit-sequence order;
- duplicate or malformed recovery identities fail closed;
- an already-applied envelope does not publish an older full chat again;
- restore/import cleanup scans envelope keys and deletes linked operation
  state/result rows;
- sequence allocation consults the restored applied ledger as a floor;
- operation journal, envelope, statics ledger, and root applied ledger counts
  do not yet have the C6 lifetime/compaction policy;
- direct database deletion performs its existing reset outside the other
  restore transactions;
- the current client sends no opt-in flag;
- no Archive Center request, host capability, prepare, output transform, or
  complete call is introduced;
- no new HTTP route, authentication bypass, socket, subprocess, timer, or file
  descriptor owner is introduced;
- manifest order, pack ETag, installers, focused owners, and the complete graph
  change with this C2 payload.

### Phase 2 — external anchors

| Leaf | Break attempted | External anchor / observed result |
| --- | --- | --- |
| Legacy client accidentally commits on the server | Run the current client payload without the new flag | The client managed unit contains no `serverChatCommitVersion`; root contract tests lock that absence, and all commit/settings branches require exact flag 1. |
| Stale browser snapshot overwrites canonical chat | Submit a different chat while opting in | `captureBase()` hashes canonical and submitted chats before detached work; the route fixture returned `server-chat-commit-input-stale` and never scheduled a run. |
| Queued retry changes its contract | Retry stored v1 as v0, stored v0 as v1, or change the stored canonical base | Durable metadata is compared before `orchestrationRuns.start`; all three fixtures returned `operation-protocol-conflict` with zero start calls. |
| Route calls a mock but not the real owner | Inject a fixed preview into the detached handler | The final route fixture uses the actual owner and journal codec; normal chat, metadata, statics, lifecycle state, and result receipt all changed in one browserless scenario. The owner's SQLite rollback properties remain separately anchored by its WAL fixture. |
| Commit and result use different identities | Delay the terminal branch between allocations | One local `resultId`/`publishSeq` pair is passed to both commit and `persistOrchResult`; the route fixture compared the persisted receipt. |
| Commit publication failure triggers paid retry | Throw while replacing the stripped database cache | The transaction returned committed with `pending_recovery`; recovery published chat/globals/statics once, and provider/commit was not called again. |
| Two pending commits recover lexically and reverse the chat | Commit two operations whose IDs sort opposite their creation order | Operation-scoped journals survived together; envelopes sorted by durable `commitSequence` and restored the second chat last. |
| A replay rolls the chat back | Replay applied envelopes after newer cache state exists | `serverChatCommitApplied` receipt identity returns before chat publication; the fixture retained the current full store and did not schedule another persist. |
| Restore resets the counter and reuses an old sequence | Restore an applied ledger with sequence 7 and no counter | Allocation used the canonical ledger floor and wrote sequence 8. Invalid/duplicate ledgers fail before the commit transaction acknowledges success. |
| Restore leaves a committed lifecycle pointing at old data | Put state/result rows beside a commit envelope, then discard recovery | Envelope-key decoding removed those two exact rows and retained unrelated operation rows. All four current journal reset owners invoke this cleanup. |
| Cancel and commit both report success | Cancel before commit, then cancel after a durable envelope | The transaction gate let the early cancel win with no envelope; the route checked the envelope before registry cancellation and returned `already-committed` afterward. |
| Result cleanup makes a saved answer undiscoverable | Remove/consume the result payload and poll status/result | Both paths read the immutable commit envelope and returned `chat-committed` plus the receipt. C3 does not yet know how to hydrate that receipt. |
| Empty startup defeats lazy chat loading | Start with no commit-prefix rows | `recoverAll()` returned before `ensureCanonicalState`; the focused test observed zero canonical loads, and final server smoke reached HTTP without a recovery warning. |
| Settings hashing burdens every generation | Exercise the unopted client path | The digest expression is guarded by full mode plus exact flag 1. Representative opted-in real-database CPU/memory cost is not measured and remains a surface. |
| AC-disabled commits fabricate AC provenance | Inspect the constructed envelope and attempt an AC call | The owner uses null context/prepare/correlation, `acOwner/acState=disabled`, and an unbound host intent; the changed call graph has no AC transport. C4/C5 must replace this only after capability proof. |
| Authentication is bypassed | Start the composed server and call root and changed routes without credentials | Root returned 200; both status and start returned 401 through the existing middleware. No route registration or middleware order changed. |
| Composition cannot return to the exact target | Apply, re-plan, then revert the complete graph | The graph was current with zero-change re-plan; all 345 managed paths matched the pristine snapshot in existence, bytes, and POSIX mode after revert. |

The earlier two read-only mapping batches returned 16 strict-schema rows.
All 16 were re-read or re-grepped against the composed source: 16/16 passed,
0 were discarded, and 0 were stale. A final read-only diff batch returned
three strict-schema findings. All three were exhaustively checked locally and
were valid: restored sequence reuse, stale operation/result rows on database
replacement, and queued negotiation drift. The fixes and tests were written by
the primary implementation turn. No collaborator edited a file.

### Phase 3 — triage

- **Q1/Q2 in the admitted C2 server path:** no unresolved route-to-owner,
  cancellation precedence, ordered recovery, restore-sequence, or queued
  negotiation defect remained after the observed fixes and reruns.
- **Q3 resolved:** operation-scoped journals; commit sequence and ordered
  replay; `running-result-consumed` admission; canonical pre-run base check;
  actual route-to-owner test; applied-envelope rollback guard; lazy row-zero
  startup; exact restore cleanup; restored-ledger sequence floor; queued
  protocol/base binding; commit-aware status/cancel/result precedence.
- **Q4 prepared surfaces:** C3 input admission and receipt hydration, conflict
  copy, C4/C5 real AC contracts, C6 reconciliation/retention, representative
  large-database cost, real provider/process-kill/device tests, and direct DB
  deletion atomicity remain below. They are not admitted by the C2 receipt.

## Prepared surfaces

| Item / claim | Resolved through | Exact blocked link | Why C2 cannot close it | Required next observation |
| --- | --- | --- | --- | --- |
| C3 client opt-in and receipt hydration | Versioned start/status/result responses and durable receipt | send/input boundary → flag 1 → server chat read/revision adoption → skip legacy merge/save/ACK | Current client deliberately sends no flag and still owns the input/save path | Pre-canonical command fixture; receipt branch loads `storedChatId`, validates revision, refreshes ETag/dirty base, ACKs only transport payload |
| Pre-canonical input admission | Commit accepts a strict synthetic input receipt | UI send command before append/autosave → durable admission/order → one canonical input connection | C2 begins after currentChat already contains the input | N/N+1, lost ACK, autosave, cancel, edit-lineage, and one-time script/append tests |
| Conflict copy | Same-ID revision conflicts fail closed and preserve the result payload | conflict → stable B ID → metadata/owner/binding publication | Storage and AC branch policy are a C3/C6 decision | Process-exit conflict fixture proving B discoverability and that AC A is never silently attached to B |
| Real Archive Center execution | Disabled/null AC fields make non-integration explicit | capability/settings snapshot → acquire/prepare/payload transform/complete/settle | C4/C5 contracts and host adapter are not present | Typed capability mismatch, current/previous-turn, output parity, skip, response-loss, and restart fixtures against isolated AC |
| C6 lifetime and compaction | Per-record byte caps and operation identities exist | journal/envelope/root/statics owner references → safe retirement and tombstone lifetime | Counts are intentionally unbounded until reference lifetimes are defined | TTL cleanup crossed with blank-browser owner lookup, late ACK/complete, deletion/edit invalidation, and bounded startup scan |
| Failed commit/result reconciliation | Commit failure preserves the exact operation-keyed result | client/server reconciliation → retry commit or conflict-copy without provider rerun | C3/C6 choose the consumer and terminal policy | Inject every writer failure through result polling; prove one chat/stat effect and no second model call |
| Root applied ledger through later client saves | C2 stores operation receipt in the canonical root | C3 hydrate/save and ordinary old-client database writes → preservation of unknown root field | Those client writers are unchanged | Exact new-client save, stale-client fence rejection, backup/restore, and cold-start readback |
| Opted-in settings digest cost | Hashing is skipped for flag 0 and produces a stable SHA-256 for flag 1 | representative production-sized decoded database → CPU, allocation, event-loop delay | Runtime size/frequency is empirical and no user database was copied into this test | Non-content metrics on a representative disposable database; unsafe signal is long event-loop delay or allocation pressure |
| Real process/provider/device behavior | Synthetic detached route and graceful server smoke pass | provider stream/postprocess → kill browser process → server commit before browser restart | No paid provider or device was used and arbitrary server-process generation resume is out of scope | C7 timestamped process-exit test, ordinary chat API readback, restart/recovery injection, and iPhone scenario |
| Direct database deletion reset | Cleanup covers its exact linked rows | database key deletion + all reset rows as one atomic action | Existing delete route removes the DB key before the additional reset calls | Failure injection at each reset write; either transactionalize this path or record accepted recovery semantics before live admission |
| Receipt before result epilogue | Status can expose durable `chat-committed` immediately after the transaction | C3 poller interpretation when result record/terminal epilogue is not yet present | This window is inherent to commit-before-result ordering | Poll between commit and result persistence; hydrate canonical chat once and continue polling only for transport/AC terminal data |

## Cross-piece interaction check

- C1 validates and commits; C2 supplies the exact full-chat/cache/global/stat
  closures and the detached terminal caller. Both use the same storage queue.
- Intermediate result ACK can leave `running-result-consumed`; the C1 gate now
  accepts that state so a later final commit remains possible.
- Operation-scoped journal rows are skipped by ordinary lazy restore/cleanup;
  only the commit owner replays or database replacement discards them.
- Result TTL/ACK cannot delete the commit envelope or normal chat. C6 still
  owns the eventual envelope/owner retirement policy.
- PageFold remains in the same `runServerPreview` call and BG bundle. C2 does
  not add a second generation lifecycle or output transformation.
- Backup/save-folder/snapshot owners clean C2 recovery within their existing
  transaction boundaries. Direct database deletion remains separately noted.
- Client-build-fence remains the rolling-deployment owner. The current client
  is unopted, so C2 cannot be enabled live in isolation.
- Archive Center stays disabled/unbound in C2 receipts; no v1–v3 browser fact
  is relabelled as a server-host observation.

## Verification receipt

- Patcher source tests: **51/51 files passed**.
- Exact-1.10 C1+C2 focus: **4/4 files, 37/37 tests passed**.
- Complete target frontend: **151/151 files, 1,731/1,731 tests passed**.
  Final C2 changes after that run were server/test-only; server and diagnostics
  were rerun.
- Final complete target server: **25/25 files, 260 passed, 12 skipped**.
- Final Svelte diagnostics: **0 errors, 0 warnings**.
- Production client build: **7,940 modules transformed**.
- BG bundle: **8,637 KiB**, load check `sendChat=function`.
- Complete graph: **40 packs, 967 units, 345 managed paths, 13 recorded
  ordered collisions**; status current, zero-change re-plan, then exact revert
  with **0 existence/byte/mode mismatches** across all 345 managed paths.
- Final composed-server smoke: root HTTP 200, unauthenticated changed status
  and start routes HTTP 401, graceful SIGINT flush path observed.
- The first sandbox-only full-server run produced loopback `listen EPERM`
  timeouts in three files; the same complete suite passed with loopback enabled.
- Two final installer builds were byte-identical. Both compatibility names are
  mode 0755, 8,039,351 bytes, syntax-valid, and SHA-256
  `961714564a2ccd1d0c05ba0bdbf247d74ef8b5263b0bf47448b8cf751bd4a055`.
- No paid provider call, AC mutation, live PocketRisu patch application, PM2
  restart, user-data write, tag, or release was performed by C2.

## C2 verdict

C2 is complete as an exact-1.10 **opt-in server result-to-chat connection**.
The detached final-result route can hand one result to the C1 owner, durably
publish it into the normal chat/effect owners, recover ordered commits, and
report a receipt without relying on a browser save. The current client remains
unopted by design. C3 must move input admission before canonical append, add
receipt-aware hydrate/ACK and revision-bound owner projection, and prove that
later browser saves preserve the server-owned root state before any live
candidate can be considered.
