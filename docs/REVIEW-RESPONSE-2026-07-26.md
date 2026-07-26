# PR #1 review response — 2026-07-26

This response maps the actionable findings from the full review of head
`1911a76` to the `0.1.0-experimental.7` changes.

## Resolved findings

### M1 — stale or overlapping patch transitions

- A target-root owner lock now covers interrupted-transaction recovery,
  planning, preflight, and writes in the CLI.
- The library apply path acquires the same lock.
- Every path read by a plan, including skipped managed files and patch state,
  is compared by content and POSIX mode before a journal is created.
- A stale transition exits with `STALE_TRANSITION` and zero writes.
- Same-host locks whose owner PID no longer exists are recoverable; live,
  foreign-host, and unreadable locks fail closed.

Regression tests cover an external edit after planning, two valid plans from
one baseline, an overlapping owner, stale-lock recovery, and absence of a
transaction journal on refusal.

### M2 — unbounded new-chat WAL orphans

- Existing payloads are not expired or deleted.
- Only `awaitingMetadata` records are quarantined behind a 128-record and
  256 MiB pressure limit. Existing-chat WAL records are exempt.
- A write that would exceed either limit is rejected before KV persistence,
  memory publication, or success ACK with `CHAT_JOURNAL_CAPACITY`.
- Restart backlog and capacity pressure are logged without chat content.

Tests cover record capacity, byte capacity, payload retention across restart,
backlog observability, and the existing-chat exemption.

### M3 — POSIX mode drift

- Atomic replacement preserves the existing mode.
- Journals retain original modes for failure and interrupted recovery.
- New owned files default to `0644` unless a unit declares a mode.
- Patch state, lock, and transaction journal files use `0600`.
- Status reports mode drift as well as byte drift.

Tests cover `0755`/`0664` apply, injected failure, revert, private state mode,
new owned-file mode, and mode-only drift.

### L1 — persona long-press contract and unmount cleanup

- The tested behavior is named `PERSONA_LONG_PRESS_MS = 260`.
- `onDestroy(finishDrag)` clears timers, ghost DOM, drag state, and highlight.
- Changelog wording now matches the implementation.

### L2 — fixed-profile list output

`list` now reports `selectable`, `default`, and `required` for every pack in a
fixed artifact, so catalog visibility is not confused with profile ownership.

### L3 — missing automated gate

The new GitHub Actions workflow checks:

- patch repository tests;
- reproducible generated installers and CJS syntax;
- a clean PocketRisu v1.8.1 unified apply and current status;
- embedded PocketRisu tests, Svelte check, and production build;
- revert with tracked byte and mode equality.

The standalone `bgPreserveInstaller.test.ts` payload is no longer imported:
it requires the legacy root installer that the composable patcher deliberately
does not deliver. Compose/manager transformation and round-trip tests cover
the delivered patch engine.

## Verification

- patch repository: 33/33 tests;
- clean unified PocketRisu v1.8.1: 89 files passed, 1,179 tests passed,
  3 skipped;
- focused combined surface: 30 files, 342 tests passed; final full suite
  includes the added byte-capacity test, and the WAL file passes 8/8;
- Svelte check: 0 errors, 0 warnings;
- BG bundle load check: `sendChat=function`;
- production build: succeeded;
- final clean-copy revert: tracked content and mode diff 0;
- CommonJS graph: 15 files, runtime cycle 0.

## Still prepared, not changed

The review's Q4 surfaces remain documented rather than silently reclassified:
power-loss ordering beyond process recovery, future upstream duplicate
anchors, old startup cache namespaces, plugin all-chat hydration ceilings,
and deeper decoded-cache schema validation.
