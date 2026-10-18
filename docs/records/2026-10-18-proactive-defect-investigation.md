# 2026-10-18 — Proactive defect investigation

Status: investigation only; no code changed. Findings 1–5 are open.
Baseline: `3242c30`, package `0.2.4-experimental.63`, target PocketRisu
`v1.10.0`. Times are UTC. No chat content, names or credentials are recorded.

## Method

- Read the delivery tool (`src/`) in full and the BG recovery path of
  `bg-preserve` and `lazy-chat-bg-adapter`; other packs were sampled.
- `npm test`: 341 passed, 3 skipped.
- Applied the complete set to a pristine `v1.10.0` clone outside the
  repository (`compatibility: verified`, 529 changed paths), ran
  `pnpm install --frozen-lockfile` and `pnpm test`: client 2,550 passed /
  4 skipped, server 663 passed / 12 skipped.
- Reproductions used temporary directories and temporary test files in the
  clone only, built on the `bgFinishedOperationFlow.test.ts` harness. None
  were added to this repository.

## Summary

| # | Finding | Severity | Confidence |
|---|---|---|---|
| 1 | A restart-interrupted server-owned BG operation is parked and re-polled for up to 49 hours instead of reaching its terminal state | Medium | Confirmed (dynamic reproduction; matches the 2026-10-18 log) |
| 2 | The staging integrity check compares only the first 100 tracked changes | Medium–low | Confirmed (reproduction; the complete set produces 130) |
| 3 | Breaking a stale root lock can let two patchers into the critical section | Low | Confirmed (deterministic reproduction) |
| 4 | One invalid conflict report makes `report --report-id latest` fail | Low | Confirmed (reproduction) |
| 5 | The resolver does not re-evaluate `autoWhen` after a dependency-introduced supersession | Low, latent | Confirmed on a synthetic catalog; unreachable in the current catalog |
| 6 | Governance repository README and file manifest are stale | Documentation | Confirmed |

## 1. Restart-interrupted server-owned operations never terminate

This explains the open question in
[the interrupted-commit record](2026-10-18-bg-interrupted-commit-and-stuck-character-view.md)
(section 3: "why the receipt was judged invalid") and its 342 repeated lines.

### Execution flow

1. After a restart, a durable `running` record is read as
   `interrupted-before-result` by `orphanedOperationState()`
   (`server/node/bgOrchestrationOperationStore.cjs` in `patches/bg-preserve.json`).
   `queued`, `running-result-consumed` and `result-ready` map to
   `start-retry-required`, `interrupted-after-main` and `delivery-failed`.
2. Every v1 operation records `serverChatCommitVersion: 1` in its operation
   metadata (`patches/lazy-chat-bg-adapter/manifest.cjs:3226-3229`, persisted by
   `:2852-2860`).
3. The missing-result response therefore is
   `{ found: false, operationState, serverChatCommitVersion: 1, stage: 0 }`
   (`manifest.cjs:3730-3770`).
4. The client classifies it as `server-owned-uncommitted`
   (`files-1.10/src/ts/bgServerCommitHydration.ts:72-82`).

### Root cause

The adapter inserts a retention branch at the top of the watch and boot
missing-result branches (`manifest.cjs:1574-1578`, `:1688-1692`):
`server-owned-uncommitted` and not active → `retainUncommittedServerChat()`.
It runs before the bg-preserve terminal handling of `start-retry-required`,
`interrupted-before-result`, `interrupted-after-main` and `delivery-failed`,
so those branches are unreachable for server-owned operations.

`reason: 'commit-receipt-invalid'` in the log is a default string used when
`serverChatCommit.reason` is absent (`manifest.cjs:1509`). No receipt was
validated; none exists for an operation interrupted before its result.

### Why it repeats for hours

Retention marks the pending marker `recoveryOutcome: 'unverified-parked'`.
`wakeParkedRecoveries()` (`recovery-terminal-client.cjs:95-148`) requeues it
on `visibilitychange`, `online` and `bg-recovery-evidence` (dispatched on chat
re-entry). The marker age limit is 49 hours
(`patches/bg-preserve/manifest.cjs:585`), not the base 30 minutes.

### Evidence that this is a defect, not intended retention

- The same adapter's readiness classifier already treats
  `found: false`, `stage: 0`, `interrupted-before-result` as terminal
  (`recovery-readiness-client.cjs:62-64`).
- `bgFinishedOperation.ts:22-23` states that retaining a finished operation
  without an answer "would warn on every launch without progress", but
  `isFinishedServerFailure()` requires `final === true`, which a
  `found: false` response never has.
- No test covers these states with `serverChatCommitVersion: 1`; the existing
  `interrupted-after-main` flow test uses the legacy shape.

### Reproduction

| State | Legacy response | Server-owned response |
|---|---|---|
| `interrupted-before-result` | marker cleared, restart notice once, 1 peek | marker kept (`unverified-parked`), retention warning, 4 peeks after 3 wakes |
| `interrupted-after-main`, `delivery-failed`, `start-retry-required` | terminal as designed | same parked loop |

The foreground watch path behaves the same. After boot, the parked marker was
still present and re-polled at 10, 20, 29, 31 and 60 minutes. Each retention
logs `{ state: <operationState>, reason: 'commit-receipt-invalid' }`, the same
shape as the live log.

### Impact

No data loss and no ACK. The user sees a misleading "could not confirm the
chat save" warning and never the correct notice (possible token cost before
resending; for `start-retry-required`, that resending costs nothing). Up to
49 hours of redundant peeks and error logs per operation.

### Recommended correction

Exclude the four orphaned states from the retention branch in both watch and
boot so the existing terminal handling runs. `chat-committed` already takes
precedence when a commit exists. Replace the default reason with a truthful
label such as `no-commit-evidence`. Widening `isFinishedServerFailure()` to
`found: false` responses is an alternative with a broader blast radius.

### Verification

Tests for the four states × {legacy, server-owned} × {watch, boot}: marker
cleared, one notice, no peek after wake events. Regression checks:
`chat-committed` hydration, `input-*` states, `anchoredCommitConflictNotice`.

## 2. Staging drift check truncated at 100 lines

`gitTrackedChanges()` returns `.slice(0, 100)` (`src/staging.cjs:82`), and
`assertPostCheckIntegrity()` compares those truncated lists (`:224`). The
complete set on `v1.10.0` leaves 130 tracked modifications, so a check that
modifies or deletes an unmanaged tracked file sorting after
`src/ts/process/request/openAI/requests.ts` passes without
`STAGING_SOURCE_DRIFT`. Managed files remain covered by the hash `status()`.

Reproduction: a temporary repository with 131 tracked files, 130 modified;
modifying the 131st after the snapshot compared equal.

Correction: compare the complete list and truncate only for report output;
consider content hashes, since porcelain status does not show further edits
of an already-modified file.

## 3. Stale lock break race

`acquireRootLock()` (`src/manager.cjs:244-252`) unlinks the lock path after
reading a dead-PID owner, without confirming the file is still that owner.
If A breaks the stale lock and creates its own between B's read and B's
unlink, B deletes A's lock and enters too. Reproduction confirmed both inside
the critical section; release then saw `ENOENT` and returned silently, so the
overlap left no error.

Only reachable when two patchers run on one host right after a crash.
Correction: break by atomic rename and re-check the token, or re-read before
unlinking; treat a missing lock at release as an error.

## 4. One invalid report blocks `latest`

`loadConflictReport(root, 'latest')` validates every `conflict-*.json` and
throws on the first invalid one (`src/risu-report.cjs:129`). Reproduction: a
valid report next to an older `{}` file returns `RISU_REPORT_INVALID` instead
of the valid report. Correction: skip invalid candidates with a warning.

## 5. Latent resolver ordering gap

When a superseding pack enters through a dependency, the post-pass in
`src/resolver.cjs:178-206` removes the superseded pack but does not rerun
`autoWhen` or dependency expansion. Synthetic catalog results: an
`autoWhen.all: [old]` pack stays after `old` is removed; an
`autoWhen.none: [old]` pack is never added; an adapter requiring `old` raises
`SUPERSEDED_PACK_REQUIRED` although it would otherwise leave with `old`. No
current pack declares `supersedes`. Fix before the first use, by iterating
supersession together with auto/dependency expansion until a fixed point.

## 6. Governance repository drift

In `danso0429/patch-verification-governance`, `README.md` still states
Phase 6/7 while `CURRENT-STATUS.yaml` records `currentPhase: 9`, and
`REPOSITORY-FILE-MANIFEST.json` has not changed since the initial commit
(4 hash mismatches). Nothing references the manifest as a check; the effect is
confusion for readers.

## Checked and not defects

- LLM translation cache key: upstream keys the cache by the rewritten text;
  the translation pack already uses the original `cacheKey`.
- Compose/revert, transaction journal recovery and update-feed version
  comparison: no defect found. The update channel is disabled.
- Home-screen chat navigation record (`WAITING_SIGNAL`): no reproducible path;
  not attributed.

## Limitations

WebKit/iPhone was not run. About 130,000 lines of pack code exist; outside the
BG recovery path, server chat commit and UI packs were sampled, not audited.
