# PocketRisu 1.9 lazy snapshot restore atomicity validation

## Scope and authority

This receipt records an owner-local infrastructure correction discovered while
qualifying audit-admitted K26-F02. Exact PocketRisu 1.9's `lazy-chat-sync`
snapshot route used to delete the durable chat-write journal before replacing
`database/database.bin`. If a K26 explicitly acknowledged snapshot-less restore
then failed during the database swap, the route could report failure after
discarding acknowledged chat payloads.

The correction stays inside the existing `lazy-chat-sync` journal/storage
owner. It does not create a database, schema, restore state machine, backup
policy, or selectable pack. It changes neither the 1.8.1 server replacement nor
the standard-storage graph. No live PocketRisu path, patch state, user data,
preserved K12 index, process, push, tag, release, or restart was changed.

## Infrastructure contract and revert surface

- **Purpose:** make the lazy snapshot database swap and durable journal discard
  one failure-atomic storage transition.
- **Trigger:** exact-1.9 `POST /api/db/snapshots/restore` after its existing
  authentication, active-session, key, source-presence, and storage-queue
  checks.
- **State/result:** `commitSnapshotRestore()` runs the database replacement and
  journal-prefix deletion in one caller-supplied SQLite transaction. The
  in-memory journal owner resets only after that transaction commits.
- **Failure result:** a database-write or journal-delete exception rolls both
  persisted changes back. The in-memory journal is not reset, so acknowledged
  payloads remain available. Cache invalidation may have run, but the next read
  reloads the still-current database and is not a data mutation.
- **Preservation:** queue serialization, selected snapshot validation, cache
  rebuild, remote-block migration, pre-warm behavior, journal replay/capacity,
  other restore paths, and normal lazy persistence are unchanged.
- **Exact revert surface:** one helper/export and adversarial test in the
  existing `chatWriteJournal` owned files, the exact-1.9 lazy server replacement
  call site/import, and the focused patcher assertion. Revert restores official
  1.9 bytes and removes the owned helper/test with the rest of `lazy-chat-sync`.

The K26 adapter deliberately retains the official contiguous
`kvCopyValue(key, DB_BLOB_KEY)` / `invalidateDbCache()` anchor inside the lazy
owner's transaction callback. K26 replaces only that database-swap callback;
the owner continues to wrap the replaced callback and journal deletion in the
same transaction. This avoids a second K26-specific transaction authority.

## Provenance and resolved graphs

- Patcher pre-infrastructure HEAD:
  `f859700e3bd3656eef05d88e1ec46b521025433e`.
- Exact official PocketRisu target:
  `85a65f3137b45c8de4a8d21a9887be213b1ac3fc`, package `pocketrisu 1.9.0`.
- Official exact-1.9 `server/node/server.cjs` SHA-256:
  `b10276f7651160902313d8cb7022d27b72f6e051281fa438ef52672c900f5e30`.
- Prior exact-1.9 lazy server replacement SHA-256:
  `a94177d93f163e904402a7c05176a8942fb1b674a5281660a8f9ef2a13686653`.
- Qualified `lazy-chat-sync` pack ETag:
  `d784bf129533ce7b16cf03097822720775b722f5651de1d42d171452e7586108`.
- Applied exact-1.9 hashes:
  - lazy `server/node/server.cjs`:
    `2e5c62455c46f153567eac067ff2e46f57e5ed0f91117ff1df9e8431ee375fa8`;
  - `server/node/chatWriteJournal.cjs`:
    `fe00b59d621db3d8d9487e6d25a6796020ed7aded2914079e46a2f13d2991f29`;
  - `server/node/chatWriteJournal.test.ts`:
    `bc13b4cd327e8cd112458124798db891c71a2ea7cccbf732883b3a21ede6d145`.

Observed graphs:

| Selection | Lazy owner | Resolved packs | Units | Collisions |
| --- | ---: | ---: | ---: | ---: |
| `toolchain-hardening` | absent | 1 | 7 | 0 |
| `lazy-chat-sync` | present | 1 | 27 | 0 |

The K26 lazy aggregate graph was also applied after this owner correction. It
resolved 19 packs and 249 units with zero collisions; the final composed route
placed K26's selected-value verification inside `commitSnapshotRestore()` and
left the journal deletion in the same transaction. Best-effort snapshot-limit
trimming runs only after that transaction returns successfully.

## Observed automated gates

- Focused patcher tests for `lazy-chat-sync` and K26 composition: 2/2 files
  passed.
- Complete patcher suite: 36/36 test files passed.
- Exact-target journal Vitest: 9/9 tests passed. The new adversarial case
  injected a journal-delete failure after a database replacement, observed the
  old database and acknowledged journal both restored by the transaction, and
  observed zero in-memory resets. Its success branch observed the selected
  database, deleted journal, and one reset.
- Exact-target K26 server/client tests after composition: 22/22 server tests
  and 2/2 client tests passed.
- Exact-target server syntax check: exit 0.
- Svelte diagnostics on the lazy-only graph: exit 0 with 0 errors and four
  existing `DefaultChatScreen` accessibility warnings.
- Production build on the lazy-only graph: exit 0 after 7,798 transformed
  modules. Observed CSS highlight, browser externalization, plugin timing,
  ineffective dynamic-import, and large-chunk warnings were outside this
  server-only transition.
- First lazy-only apply changed 28 paths. Status reported one pack current
  across 27 managed files with zero drift. Reapply changed zero and skipped all
  27 files.
- Full revert changed 29 paths including patch state/intent, restored official
  `server.cjs` SHA-256
  `b10276f7651160902313d8cb7022d27b72f6e051281fa438ef52672c900f5e30`,
  removed the owned journal files, and left the target tracked diff/status
  clean.
- Final catalog combination verification completed with exit 0: 2,048/2,048
  raw selections, 1,024 normalized graphs, 217 managed paths, maximum 531
  resolved units, and round-trip `passed` with two workers.

## L2.5 runtime audit

### Phase 1 — flat discovery

- exact-1.9 snapshot auth, active session, key validation, selected blob read,
  and storage queue;
- pending lazy persist and durable journal replay before restore;
- database swap, cache invalidation, journal-prefix deletion, memory reset,
  remote marker deletion, decode/migration, and chat-store pre-warm;
- database-swap failure, journal-delete failure, transaction rollback,
  cache-invalidated rollback, and reset ordering;
- standard storage, local/server file import, normal patch saves, journal
  capacity/replay, 1.8.1 payload, owner-absent graph, owner-present graph,
  K26 composition, apply/reapply/status/revert, and owned-file lifecycle.

### Phase 2 — external-anchor resolution

- **Persisted failure atomicity — executable adversarial test.** The helper
  calls `restoreDatabase()` and `discardJournal()` inside one transaction and
  calls `resetJournalMemory()` only after it returns. An injected second-step
  failure restored both prior map entries and left reset count at zero; success
  committed both mutations and reset once.
- **Actual SQLite authority — applied source inspection.** The exact-1.9 route
  supplies `(operation) => sqliteDb.transaction(operation)()` from the already
  open native database owner. No connection, table, queue, or state registry is
  added.
- **K26 composition — applied source inspection and graph.** The common swap
  lines remain inside the `restoreDatabase` callback. The K26 adapter replaces
  them with selected immutable-value write/size verification and cache
  invalidation; `discardJournal` remains after that callback in the same
  transaction. Protected-limit trimming is deliberately after the successful
  transaction so a swallowed `SQLITE_FULL`/`SQLITE_IOERR` cannot let journal
  deletion escape into autocommit. The 19-pack graph applied with zero
  collisions.
- **Memory alignment — source and adversarial test.** `resetMemory()` remains a
  synchronous map/load-state reset. It runs only after transaction success; a
  rollback retains both persisted and in-memory journal ownership.
- **Cache-invalidated rollback — source reasoning.** Cache invalidation is not a
  persisted write. If later journal deletion rolls the transaction back, the
  next reader reloads the unchanged live database instead of observing a stale
  swapped cache.
- **Other paths — source comparison.** Local/server file import already owns its
  broader import transaction and is unchanged. The 1.8.1 replacement is
  unchanged. Standard storage contains no lazy journal. Provider, custom/local
  endpoint, plugin, request-log, and generation owners are not touched.
- **Graph and revert — measured.** Owner-absent/present plans, exact apply,
  focused target tests, diagnostics/build, no-op reapply, current status, full
  revert, owned-file removal, and official hash restoration were observed as
  recorded above.

### Phase 3 — triage

- **Q3, fixed:** a failed lazy snapshot restore can no longer delete
  acknowledged journal payloads while leaving the old database active.
- **Q1, no new authority:** the existing lazy journal owner and native SQLite
  transaction remain the only authorities.
- **Q4, bounded prepared surface:** post-commit cache rebuild/decode remains
  best-effort native behavior. It can report a warning after a successful
  durable transition, but cannot roll that transition back; K26 does not widen
  this existing boundary.
- **No standalone L3:** this is deterministic server storage ordering. The
  final aggregate iPhone scenarios remain separate and are not requested in
  this session.

## Publication boundary

This receipt qualifies a local infrastructure commit only. It does not
authorize generated-installer publication, push, tag, release, live apply, or
restart.
