# PocketRisu 1.10 BG × Archive Center C1 server commit validation

Date: 2026-09-14 KST

Status: **C1 server commit primitive complete; C2 product wiring, live
application, and release are not complete**

## Scope and authority

This slice follows C0-E/C0-F and the public integration plan's C1 boundary. It
adds the transaction and recovery primitive that a later BG result owner can
call. It does not connect that primitive to `bgOrchestrator.cjs`, mount a new
HTTP route, modify the live PocketRisu tree, call a provider, or claim browser
process-exit behavior.

| Input | Revision / boundary |
| --- | --- |
| Patcher branch before C1 | `8f289fca0192ccf063e14e46e80ad59b80318b3e` |
| Journal split | `81b223668c8364ba5d8d9e1080135387f2ddc97a` |
| Commit primitive | `0e9388822403dc3c147f68e7f1bbea71d0badcbf` |
| L2.5 sparse-input hardening | `268ec7a71ee773dec44f4278a23947c89e06f9c9` |
| Target | exact PocketRisu `1.10.0` |
| Archive Center runtime | isolated unmodified 4.3.1 baseline; no C1 coupling |

The new commit module and its target test are exact-1.10 managed units. The
journal API extension remains shared because its existing `stage()` behavior
is preserved and all existing target server callers continue to use that same
method.

## Implemented boundary

### Split journal phases

`chatWriteJournal.cjs` now separates:

1. asynchronous load, validation, and encoding in `prepareStage()`;
2. synchronous `kvSet` in `writePreparedStage()`, suitable for an existing
   `better-sqlite3` transaction callback;
3. I/O-free in-memory publication in `publishPreparedStage()` after commit;
4. exact-row recovery through `restoreDurableStage()` with a synchronous
   receipt validator before memory publication.

Prepared stages are identity tokens held in a `WeakSet`. An unwritten,
already-published, reset, or superseded stage is rejected. Repeating the same
prepared write before publication is permitted so a caller can retry after a
surrounding SQLite rollback. Ordinary `stage()` remains
`prepare → write → publish` and retains its async API.

Snapshot restore accepts an optional `discardCommitRecovery` callback in the
same transaction as database swap and journal discard. Existing callers omit
it without behavior change; C2/C6 must connect the new commit namespace and
any later owner/effect namespaces before the primitive is reachable.

### Immutable server commit envelope

`serverChatCommit.cjs` defines `bg_server_chat_commit.v1` and stores one
operation-keyed recovery envelope under
`internal/server-chat-commit/v1/<operation>`. The request fingerprint binds:

- operation, result, and publish sequence;
- requested/stored chat coordinates and base/stored revisions;
- device settings digest, execution context, AC correlation, prepare key, and
  prepare fingerprint;
- input receipt and host-change sequence/intent;
- message/source-generation owners and automatic-backfill disposition;
- global expected-value delta and statics message delta;
- AC owner/state, readiness, metadata presence, and first commit timestamp;
- the exact target chat revision produced by the existing chat encoder.

The current C1 contract accepts only `storageDisposition=original` semantics:
`storedChatId` must equal `requestedChatId`. A changed body, setting snapshot,
context, receipt, sequence, or effect intent under the same operation
fingerprint conflicts. Conflict-copy allocation remains a C2 policy and is not
silently approximated here.

The recovery record carries minimum chat metadata, including explicit
presence for optional `lastDate`, `folderId`, and `modules` keys. This preserves
the existing null/undefined key-presence contract across JSON envelope storage,
while the full chat stays in the existing Risu-encoded journal. Input nesting
is capped at 128 and the recovery envelope at 1 MiB; cyclic, non-plain,
non-finite, sparse effect, or unsupported contract data is rejected before
acknowledgement.

### Transaction and publication order

`commit()` clones and validates its request, calculates the existing canonical
chat revision, and enters the injected `queueStorageOperation`. Inside one
synchronous SQLite transaction it:

1. rechecks immutable replay/conflict;
2. reads the operation state and lets an already durable cancellation win;
3. rechecks the current chat revision;
4. writes the prepared chat journal bytes;
5. invokes the synchronous canonical metadata/intent/owner/effect writer;
6. validates per-key global outcomes and the actually-applied statics delta;
7. writes a `chat-committed` operation state carrying claim/context/receipt
   identity; and
8. writes the immutable commit envelope.

Any throw or Promise-valued transaction dependency aborts without publishing
memory. Only after the transaction returns does the primitive publish the
journal and canonical memory. A failure there returns a committed receipt with
`publication=pending_recovery`; it does not turn a durable commit into a
provider retry.

Global effects retain one outcome per exact changed/deleted key. Their
aggregate status must agree with those rows. The statics receipt stores the
actually-applied delta and permits the requested delta only when its status is
`committed`. This leaves enough durable information to reconcile unfinished
effects without a blind increment.

`status()`, `recover()`, `recoverAll()`, and internal `readRecovery()` reject a
malformed envelope. Recovery validates the journal chat against the stored
revision before publishing it. If the journal has already been retired after a
full database persist, the current canonical revision must equal the receipt.

## Failure-injection observations

The exact-target test uses a disposable WAL-mode `better-sqlite3` database and
the target's real `encodeRisuSaveLegacy` / `decodeRisuSave` codec. Commit and
journal keys take the ordinary direct `kv` row path; exact-1.10 `db.cjs` routes
only `database/database.bin` through the chunk store and sends every other key
to the synchronous prepared statement.

Observed cases:

- success writes journal, metadata, revision, intent, input receipt, owners,
  effect intent, operation state, and envelope before publication;
- failure injected after each of the nine synchronous writes rolls every C1
  row back, leaves journal memory empty, and permits a clean retry;
- exact replay returns the same receipt without invoking the writer again;
- changed chat content or settings digest under the same operation conflicts;
- changed canonical base revision returns conflict before a commit write;
- cancellation already durable before the transaction wins without journal or
  envelope publication;
- a committed envelope remains authoritative to the modeled late-cancel path;
- a non-prompt statics failure and per-key global conflict remain in the
  committed recovery record;
- an inconsistent global aggregate/per-key outcome aborts and rolls back;
- a post-commit publication failure recovers the exact chat and a new-chat
  metadata stub without another commit/provider call;
- explicit undefined metadata key presence survives the real Risu codec and
  envelope restart path;
- malformed envelopes, asynchronous transaction writers, stale prepared
  journal stages, and over-depth inputs fail closed.

These observations prove the standalone C1 primitive and its injected
dependencies. They do not prove that current BG cancellation, result delivery,
full-chat publication, or AC transport already calls it.

## Runtime audit v2

### Phase 1 — flat discovery

- request cloning and structural validation traverse the full supplied chat
  and effect intent;
- canonical revision calculation hashes the supplied final chat;
- request fingerprints bind settings, AC context, prepare identity, receipts,
  owners, effects, and metadata presence;
- the storage queue remains held across async journal preparation;
- duplicate/malformed commit rows select conflict rather than overwrite;
- operation coordinate, claim, cancellation, and lifecycle state are read in
  the transaction;
- base chat revision is reread in the transaction;
- journal bytes are written in the transaction but published afterward;
- the injected canonical writer can write metadata, intent, receipt, owner,
  and effect state in the same transaction;
- global keys and statics applied delta are validated against effect intent;
- `chat-committed` operation state and the recovery envelope are written in
  the same transaction;
- transaction failure is returned as `not_committed` and retains the cause
  only internally;
- post-commit publication failure is sanitized and remains recoverable;
- status reads and exact replay do not call the provider or canonical writer;
- single-operation and prefix-scan recovery can decode and publish durable
  records;
- journal recovery validates before changing its memory map;
- optional metadata key presence survives envelope serialization;
- record bytes and recursive input depth have fixed ceilings;
- prepared-stage identity is in-memory and invalidated by reset/publication;
- snapshot restore can include commit-recovery deletion atomically;
- the commit-envelope count and `recoverAll()` scan length have no C1
  retention cap;
- the exact-1.10 module has no production caller in this slice;
- no new socket, subprocess, timer, file descriptor, authentication route, or
  external service call is introduced by C1;
- manifest, pack ETag, generated installers, focused graphs, and complete graph
  all change when the managed primitive changes.

### Phase 2 — external anchors

| Leaf | Break attempted | External anchor / observed result |
| --- | --- | --- |
| Async journal escapes SQLite | Call old async `stage()` inside a synchronous transaction | `prepareStage` performs async work first; `writePreparedStage` is synchronous. The real WAL failure loop leaves both prefixes empty after every injected failure. |
| Partial commit survives | Fail after journal, each canonical row, operation state, or envelope write | Nine failure positions all returned `not_committed`; journal/canonical/envelope rows and in-memory journal size were zero. |
| Changed retry overwrites first result | Reuse operation with changed chat or settings | Immutable fingerprint returned `operation_fingerprint_conflict`; original receipt bytes remained the status result. |
| Cancel and commit both win | Persist cancel before commit, then attempt cancel after envelope | Pre-commit cancel produced no writes. Successful transaction wrote `chat-committed` plus envelope together. The actual BG cancel caller is not yet connected and remains a surface below. |
| Post-commit failure triggers model retry | Throw during canonical memory publication | Result remained `status=committed`, `publication=pending_recovery`; `recover()` restored body/metadata without `commit()` rerun. |
| New chat body becomes undiscoverable | Fail before metadata publication and restart | Recovery callback received the exact stub plus full journal chat; explicit undefined `folderId` presence survived. |
| Mixed globals lose which keys applied | Return category conflict with per-key mixed outcome | C1 now stores sorted key outcomes and rejects an aggregate that does not match them. The injected mismatch rolled SQLite back. |
| Stat retry double-increments | Mark stats failed/committed with a contradictory applied delta | Non-committed status permits only zero applied delta; committed permits exactly the requested delta and stores an operation-derived effect ID. |
| Old/corrupt journal is published | Point recovery at a different revision or malformed envelope | `restoreDurableStage` validates before `records.set`; recovery also requires journal or canonical revision equality. |
| Deep/cyclic input exhausts recursion | Supply 140 nested effect levels | The 128-depth guard rejected before entering the storage queue; cyclic/non-plain inputs share the same pre-write validation. |
| Large recovery row expands without bound | Supply large metadata/effect recovery content | One envelope is capped at 1 MiB and awaiting-new-chat journal bytes retain the existing 256 MiB cap. Count/lifetime remain unbounded until C6. |
| Existing full-chat writes regress | Keep using `chatWriteJournal.stage()` from current routes | Repo-wide callers remain on the same async method; its implementation still executes prepare→write→publish. Existing C0 and target journal tests passed. |
| Chunk-store behavior differs | Route C1 keys through exact `db.cjs` | Exact source shows only the DB blob enters chunk storage; C1 prefixes use the direct synchronous `kv` prepared statement exercised by the WAL fixture. |
| Network/auth side effect exists | Search module production callers and boundary APIs | Production callers are zero; only tests, manifest loading, and module exports reference the committer. No route or network call exists. A dynamic caller was challenged by checking imports, manifest hooks, and composed source; none exists. |
| Unit collision or cross-version leak exists | Resolve the catalog and target-filter the new files | 53 packs / 1,472 source units had zero duplicate IDs at audit time. Both commit units selected on exact 1.10 and not 1.9; complete composition passed. |

The read-only collaborator batch returned the six requested claims in the
strict six-line schema. First, middle, last, production-DEAD, target-scope, and
duplicate-ID claims were re-read/re-grepped locally: 6/6 passed, 0 discarded,
0 stale. It made no file changes.

### Phase 3 — triage

- **Q1/Q2 within the unattached primitive:** no unresolved transaction,
  revision, receipt, or rollback defect remained after the fixes and tests
  above.
- **Q3 resolved:** split the async journal write; reject stale prepared tokens;
  validate before journal memory restore; preserve null/undefined metadata key
  presence; bind settings/context/prepare identity; sanitize public publication
  errors; cap recursive depth; retain per-key global outcomes and exact statics
  applied delta; add the snapshot restore callback boundary.
- **Q4 prepared surfaces:** production attachment, real canonical writer,
  cancellation-route cooperation, recovery retention/compaction, snapshot and
  import cleanup wiring, conflict-copy policy, large real-chat cost, AC-disabled
  semantics, and C3 input/projection remain below. They are not admitted by the
  passing C1 tests.

## Prepared surfaces

| Item / claim | Resolved through | Exact blocked link | Why C1 cannot close it | Required next observation |
| --- | --- | --- | --- | --- |
| C2 production reachability | Exact module, target unit, transaction tests | `bgOrchestrator` final result → `commitGenerationResult` dependency and current cancel route → commit-aware CAS | Those callers are deliberately unchanged in C1 | C2 browserless result commit; cancel-before/after race through the real route; no legacy result write after receipt |
| Real canonical writer | Writer contract, per-key/global/stat receipts, rollback | final BG merge → fullChatStore/dbCache metadata, globals, stats, intent, owner rows | The final merge/output owner belongs to C2 | Failure after each real writer sub-effect; readback after process restart; no blind stat increment |
| Recovery count and lifetime | 1 MiB per row, revision-fenced recovery | terminal owner/intent/AC references → safe compaction | C6 defines terminal and source/tombstone lifetime | Result TTL cleanup crossed with new-browser owner read; bounded scan/compaction without losing late references |
| Snapshot/import reset | Optional atomic discard callback and rollback test | every database replacement caller → all commit/owner/effect namespaces | Namespace set is not final until C2/C6 | Snapshot restore/import after real commits; no stale owner or effect replay; exact rollback on discard failure |
| Conflict copy | Explicit fail-closed same-ID rule | revision conflict → one stable B ID, metadata, owner, binding disposition | Conflict policy and AC branch admission belong to C2/C6 | Process-exit test before metadata flush; A never completed into B without verified branch binding |
| Input receipt and pending projection | Strict input-receipt identity accepted by envelope | pre-canonical command admission → durable receipt and char/chat/revision projection | C3 owns the earlier send boundary and UI | duplicate/lost admission response; N+1 outside canonical chat; blank browser hydrate+projection |
| Large-chat CPU/memory cost | 128 depth, 1 MiB recovery cap, existing orphan byte cap | representative full chat → clone, canonical revision, journal encoding cost | No production caller exists from which to measure representative runtime | C2 mock/real non-provider timing and peak memory at observed chat sizes; event-loop delay signal |
| AC-disabled and skipped paths | Nullable prepare/context IDs and explicit owner/backfill values are stored | capability snapshot → exact disabled/skipped request construction | C4/C5 capability and skip contracts are not mounted | AC absent/off and prepare-loss fixtures; no fake AC provenance and no permanent backfill exclusion when disabled |

## Cross-piece interaction check

- Existing full-chat routes keep the journal's payload-before-publication
  ordering and do not see the new commit module.
- Exact-1.10 `db.cjs` gives journal and envelope rows the same synchronous
  SQLite owner; neither key is the chunked DB blob.
- The transaction writes the future `chat-committed` operation state, but the
  current BG cancel/status/result owners do not understand it yet. C2 must
  change both sides as one compatibility unit.
- Journal cleanup after full database persist is safe only if the envelope's
  metadata/intent/owner/effect recovery remains durable; C2's writer and C6's
  retention policy own that proof.
- Snapshot restore can now include commit recovery in the same transaction,
  but the exact-1.10 server caller intentionally remains unwired until those
  namespaces are fixed.
- Generated installers include the new exact-target units; no live target or
  installed patch state was changed during C1.

## Verification receipt

- Patcher source tests: **50/50 files passed**.
- Root C1 harness: **8/8 tests passed**.
- Exact-1.10 C1 target focus: **21/21 tests passed** using WAL-mode
  `better-sqlite3` and the real Risu codec.
- Lazy + BG owner focus before complete graph: **42/42 tests passed**.
- Complete target frontend: **151/151 files, 1,731/1,731 tests passed**.
  Subsequent audit edits were server-only and the final server suite was rerun.
- Final complete target server: **23/23 files, 244 passed, 12 skipped**.
- Final Svelte diagnostics: **0 errors, 0 warnings**.
- Final production client build: **7,940 modules transformed**.
- BG bundle: **8,637 KiB**, load check `sendChat=function`.
- Complete graph: **40 packs, 936 units, 342 managed paths**; status current,
  zero-change re-plan, then exact revert with **0 existence/byte/mode
  mismatches** across all 342 paths.
- Two final installer builds were byte-identical. Both compatibility names are
  mode 0755, 7,937,252 bytes, syntax-valid, and SHA-256
  `86ffc4b22b6ca3946497cf720446b87478943e7476c6483500f657084a7ebfc7`.
- The first sandbox-only full-server run stopped at loopback `listen EPERM`;
  the same suite passed with loopback enabled. The first complete frontend run
  began from dependencies installed for the smaller focused graph and stopped
  on missing complete-graph packages; frozen install from the complete
  lockfile followed by the same command produced the 151-file pass above.
- Live PocketRisu source, PM2, user data, active generation state, and the
  isolated Archive Center process were not mutated by C1.
- Post-C1 isolated AC readback remained 4.3.1 with ready/store/vector/reference
  true and degraded false on loopback-only ports; the distro MariaDB service
  remained inactive and disabled. Live PocketRisu retained its pre-C1
  40-pack/934-unit/340-path state and database inode.

## C1 verdict

C1 is complete only as the exact-1.10 **server commit primitive**: it supplies
the synchronous transaction boundary, immutable replay receipt, cancellation
and revision gates, per-effect recovery state, post-commit publication
recovery, and managed delivery units. The next implementation slice is C2,
which must connect the final BG result and existing operation/cancel owners to
this primitive before any live or browser-process-exit claim is possible.
