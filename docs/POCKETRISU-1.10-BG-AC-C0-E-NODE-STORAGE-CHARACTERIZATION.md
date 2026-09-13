# PocketRisu 1.10 BG × Archive Center C0-E Node storage characterization

Date: 2026-09-13 KST

Status: **characterization complete; current owners cannot provide the proposed
server commit or pre-canonical input contract**

## Scope

This C0-E slice tests the exact 1.10 patch sources without changing a managed
unit, manifest, catalog, generated installer, target tree, or live process. It
records test commit `1fc03d7` and fixes the following source bytes:

| Source | SHA-256 |
| --- | --- |
| `patches/lazy-chat-sync/files/server/node/chatWriteJournal.cjs` | `fe00b59d621db3d8d9487e6d25a6796020ed7aded2914079e46a2f13d2991f29` |
| `patches/lazy-chat-sync/files-1.10/server/node/server.cjs` | `0a13b16cf055b8875451ba35943536a90ba6ef7859314b0a2794595bdd32ac75` |
| `patches/bg-preserve.json` | `06c482b32e3d3a7e045ce7b3e18b173e9af63205ac68a3dd34fef055cb29efa4` |
| C0-E test | `b82d43374acdfc790701a49fd78b9324fe44d782288397cb4cb6f328e64d6d5a` |

The fixture uses synthetic chat text and in-memory KV maps. It performs no
provider call, credential read, live write, build, restart, patch apply,
database mutation, or user-data deletion.

## Runtime audit Phase 1 — flat discovery

- The current chat journal owns one payload record per character/chat pair.
- `stage()` first awaits journal loading and encoding, then calls synchronous
  `kvSet`, then publishes the record to its in-memory map.
- The current full-chat HTTP route waits for `stage()` before publishing to
  `fullChatStore` and before returning success.
- That positive ordering prevents an acknowledged payload from existing only
  in process memory.
- A journal record contains character ID, chat ID, chat payload,
  awaiting-metadata state, update time, and version.
- It contains no operation, input receipt, commit receipt, host-change intent,
  owner projection, or effect receipt.
- `stage()` is async and has no prepare/synchronous-write/post-commit-publish
  split.
- Passing `stage()` directly to a synchronous `better-sqlite3` transaction
  callback returns a Promise; the callback transaction ends before `kvSet`.
- A separately written intent or owner receipt can therefore fail before or
  after the already-durable chat payload.
- Restart replays the payload but cannot infer which missing adjacent receipt
  was intended.
- A new-chat journal record with `awaitingMetadata=true` restores the full
  payload into `fullChatStore`.
- The same record does not create a chat stub in stripped `database.bin`.
- Without that stub, normal character/chat metadata lookup cannot discover the
  restored new chat.
- The journal deliberately retains that payload rather than deleting the only
  recoverable copy.
- Current `runServerOrchestratedChat()` begins after the user message already
  exists in browser memory.
- It strictly saves and reads that chat before allocating the server operation
  ID.
- The current path therefore has no pre-canonical queued input command or
  admission sequence.
- A second input cannot remain only in a server command queue under this path;
  it has already entered the browser chat/save flow before delegation.
- The current full-chat route has revision/create preconditions and durable
  payload-before-publish ordering.
- The current full-chat route has no combined server-generation commit
  envelope.
- Current BG completion parks a result for browser merge/save/ACK; it is not a
  normal server-owned chat commit.
- Current effect application and delivery receipts remain client-side owners.
- The test-only characterization does not alter any runtime behavior.

## Runtime audit Phase 2 — external anchors

### Async encode/write boundary

Type: structural and measured.

Breaking scenario: call async `stage()` inside `sqliteDb.transaction()` and
assume the chat payload joined the synchronous transaction. The harness marks
the exact lifetime of a synchronous transaction callback. The callback returns
the stage Promise, closes its transaction scope, and only then does the
journal's `kvSet` execute. The observed write flag is false.

Anchors:

- `patches/lazy-chat-sync/files/server/node/chatWriteJournal.cjs:96`
- `patches/lazy-chat-sync/files/server/node/chatWriteJournal.cjs:129`
- `patches/lazy-chat-sync/files/server/node/chatWriteJournal.cjs:173`
- `test/bg-ac-server-chat-save-c0.test.cjs:44`

This proves that C1 cannot solve atomic commit by merely wrapping the current
async call in `db.transaction(async () => ...)`.

### Payload and receipt split

Type: structural and measured.

Breaking scenario: durable chat staging succeeds, then host intent succeeds,
then owner receipt fails. The test preserves exactly that split state. A new
journal instance restores the chat payload, while the owner receipt remains
absent. Decoding the actual journal record shows only its six current fields.

Anchors:

- `patches/lazy-chat-sync/files/server/node/chatWriteJournal.cjs:133`
- `patches/lazy-chat-sync/files/server/node/chatWriteJournal.cjs:174`
- `test/bg-ac-server-chat-save-c0.test.cjs:72`

The current payload durability is valid and must be preserved; it is simply
insufficient as proof that chat, intent, effects, and owner committed together.

### New-chat metadata recovery

Type: structural and measured.

Breaking scenario: a server-generated conflict copy is acknowledged after
payload staging but before its metadata stub is durable, then the process
restarts. `restoreInto()` recovers the payload map, but `hasChatMetadata()` on
the unchanged stripped database remains false. Cleanup retains the journal
record, so the payload is not lost, yet normal listing still cannot find it.

Anchors:

- `patches/lazy-chat-sync/files/server/node/chatWriteJournal.cjs:15`
- `patches/lazy-chat-sync/files/server/node/chatWriteJournal.cjs:182`
- `patches/lazy-chat-sync/files/server/node/chatWriteJournal.cjs:194`
- `test/bg-ac-server-chat-save-c0.test.cjs:101`

This fixes the C1 completion boundary: a new server-created chat cannot be
called committed until both payload and discoverable metadata share the same
recovery unit.

### Input admission order

Type: structural.

Breaking scenario: treat current BG delegation as a pre-canonical command
queue. The test reads the owned `bgOrchestrate.ts` source directly, starts at
`runServerOrchestratedChat`, and verifies that `requestDurableSave()` precedes
`operationId = v4()`. The source itself states that the user's message already
exists in browser memory. Neither `QueuedInputCommand` nor
`next_server_input_accepted` exists in the function body.

Anchor:

- `test/bg-ac-server-chat-save-c0.test.cjs:120`

This is a source-order observation, not a claim that every send entry point has
already been catalogued. C1/C3 must intercept the supported send path before
input insertion, script transform, and autosave.

### Existing full-chat positive guarantees

Type: structural.

Breaking scenario: a new implementation discards the current payload-before-
publish rule while adding receipts. The test isolates the full-chat route and
verifies journal stage precedes `fullChatStore` publication, which precedes the
success response. It also confirms the route has no combined host commit
fields today.

Anchors:

- `patches/lazy-chat-sync/files-1.10/server/node/server.cjs:5086`
- `patches/lazy-chat-sync/files-1.10/server/node/server.cjs:5145`
- `patches/lazy-chat-sync/files-1.10/server/node/server.cjs:5153`
- `test/bg-ac-server-chat-save-c0.test.cjs:142`

C1 must extend this owner while preserving revision preconditions, journal
capacity behavior, publish ordering, and delayed full-database persistence.

## Runtime audit Phase 3 — triage

### Characterization findings

- Q2: the current journal cannot participate in one synchronous transaction
  with receipts because its async boundary escapes the callback.
- Q2: payload and adjacent intent/owner/effect writes can occupy contradictory
  durable states.
- Q2: new-chat payload recovery without metadata is recoverable but not
  discoverable, so it cannot satisfy a successful server commit.
- Q2: current BG delegation happens after canonical input save and cannot
  implement N+1 pre-canonical admission.
- Q2: the full-chat route has the correct payload-before-publish ordering but
  no operation-scoped commit envelope.

No production fix is made in C0-E. These are admission blockers for C1/C3, not
reasons to weaken the proposed contract.

### Required C1/C3 primitive shape

1. Split chat staging into async prepare/encode/validate, synchronous durable
   write, and post-commit memory publication without changing ordinary `stage`
   semantics.
2. Put canonical input/response, minimum metadata, host-change intent, input or
   commit receipt, owner projection, and required effect receipts in one
   SQLite transaction or one self-contained replay envelope.
3. Publish `fullChatStore`, cache/ETag, and success only after that transaction
   commits; recover publication from the durable envelope after a crash.
4. For a new chat, include the metadata stub in the same recovery unit or use a
   strict full database persist before success.
5. Add an operation-scoped immutable fingerprint and exact replay result;
   changed input/settings under the same command must conflict.
6. Decide cancel versus commit within the same operation transition; a late
   cancel cannot remove an already committed input, and a winning cancel cannot
   publish a result.
7. Store global/statics/script effects with per-effect applied/conflict state;
   never retry a blind increment.
8. Add pre-canonical input admission before the supported send entry point and
   keep N+1 out of canonical chat until predecessor lineage permits attach.
9. Exercise the split against a real disposable `better-sqlite3` database with
   failure after each synchronous write and after commit-before-publication.

### Prepared surfaces

- **Actual SQLite/chunk-store transaction:** the in-memory callback proves the
  async escape, but only a disposable exact target can prove DB blob chunking,
  WAL, nested transaction, and rollback behavior.
- **Effect inventory:** C0-E proves the envelope is absent; C1 must still map
  chat script state, globals, statics, metadata, owner, and AC intent to their
  final current callers.
- **All send entry points:** the ordinary BG path is fixed here; reroll,
  continue, multi-response, tool, and auxiliary paths retain their separate
  support gates.
- **Queue lineage and UI:** no command queue or pending projection exists yet;
  C3 must bind server admission to browser draft/pending presentation.
- **Retention and recovery:** an operation envelope cannot be retired by the
  current result TTL until chat/effects/intent/owner are all terminal.

## Cross-piece interaction check

- Journal plus full-chat route: payload write-before-publish remains a positive
  invariant to preserve.
- Journal plus SQLite transaction: the current async API cannot be nested as
  though it were synchronous.
- Payload plus metadata: payload recovery alone does not create a discoverable
  chat.
- Payload plus receipts: independent writes can disagree after one failure.
- Client BG plus server admission: the current strict save occurs before
  operation allocation, so it is not the planned command queue.
- C0-C/C0-D plus Node: Go now has durable change/prepare owners, but current
  Node storage cannot create the atomic intent/receipt inputs they require.

## Verification

- Direct execution reports five C0-E assertions passed.
- Full patcher `npm test` reports 48/48 test files passed.
- `node --check test/bg-ac-server-chat-save-c0.test.cjs` passes.
- Patcher implementation HEAD is
  `1fc03d7f26cd82e244a2587eab8080ff792d61a1`; its tree is
  `c123e57c2a4d9505693b77417773687f680230b6`.
- Managed unit, manifest, catalog, installer, target, and live diffs are zero;
  patch-combination and runtime product gates are therefore not claimed by
  this test-only slice.

## C0-E verdict

C0-E is complete as a **negative characterization**: the existing owners
cannot satisfy the proposed atomic server commit or pre-canonical N+1
admission. C1 must add the split server commit primitive, and C3 must add input
admission/projection before any BG manifest hook can be qualified.
