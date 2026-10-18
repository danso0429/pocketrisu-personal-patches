# Phase B (C-02 + C-05) — design decisions H-1 to H-6

Status: **approved by the owner on 2026-10-18** (all five recommendations below, unchanged). This document records the decisions before implementation; no code is changed by it. It refines the final handoff (`docs/audits/2026-10-18-final-correction-implementation-handoff.md`, branch `claude/final-correction-handoff-2026-10-18`) and resolves its Phase B design checks H-1 to H-6.

Context: Phase A (C-01 orphan input cancel, PRO-1) is committed on `claude/phase-a-c01-orphan-input` (`eec13a9`, `a50d20e`); this branch starts from it. Facts were read from a tree composed with patcher `a50d20e` on PocketRisu v1.10.0 (`98e9683`); line numbers are composed-tree positions (`server/node/server.cjs` and `bgOrchestrate.ts` are layered composites). Authority: handoff §3 Phase B (`feed29a`), R2 §5–§7.

## Facts this design depends on (checked in the composed tree)

| # | Fact | Location |
|---|---|---|
| F1 | Backup import opens `BEGIN` and runs the destructive deletes **before** its `try`; an exception there leaves the transaction open with `synchronous = OFF` | `server.cjs:2809-2838` |
| F2 | Import commits every 5,000 entries (`COMMIT`; `BEGIN`); on a later error only the open batch is rolled back, so earlier batches and the deletes stay committed. Nothing restores the pre-import state automatically | `server.cjs:2939-2943`, `:2977-2982` |
| F3 | The pre-import snapshot copies only the `database/database.bin` row; assets, coldstorage and inlay metadata are not captured | `restoreSafety.cjs:166-189` via `server.cjs:2739-2754` |
| F4 | The inlay directory swap and the decode/`initChatStore` run after the final `COMMIT`, outside the `try`; a failure there leaves the DB committed | `server.cjs:2985-3017` |
| F5 | Backups do not export or import `internal/*` or `bg-orch-*` keys; snapshot restore rewrites only the `database/database.bin` row; save-folder import `INSERT OR REPLACE`s every hex file in the folder (so an `internal/*` key present in the folder would be written) and `clearExistingData` does not clear `internal/` | `server.cjs:4861-4970`, `:2651-2698`; `restoreSafety.cjs:191-208`; `server.cjs:5895-5951` |
| F6 | The client-build fence is app-level middleware mounted before the body parsers; route handlers (where a reset 503 would live) run after it, so a stale build always gets 426 first | `server.cjs:992-1003` |
| F7 | BG client calls (`fetchOrchestrationControl`, both `POST /api/bg-orchestrate` starts, claim/attach/abandon, DELETE) send no `x-session-id`/`x-user-active`; `checkWrite('')` returns ok; no BG route calls `checkActiveSession`; only `NodeStorage.authFetch` dispatches `risu-session-deactivated` on 423 | `bgOrchestrate.ts:266`, `:1086`, `:3071`, `:1151-1190`; `session-lock.cjs:63-66`; `nodeStorage.ts:347-362` |
| F8 | After a reset, status for a wiped operation is `404 {accepted:false, state:'missing'}`; an `accepted` server-input marker with that status blocks every new submit in the chat (`prior-operation-unknown`) until the 49 h marker expiry; markers survive the post-restore reload | `bgOrchestrator.cjs:2046`; `bgServerInputClient.ts:141-146`; `bgServerInputLedger.ts:20`; `backuplocal.ts:371` |
| F9 | Chat save: `authFetch` throws only for `503 + x-bg-save-blocked`; any other non-2xx response is returned and later raised as a generic error that requeues the tracked changes (R2 §3.7) | `nodeStorage.ts:372-375` |

## H-1 Restore atomicity — recommendation: one apply transaction, inlay swap inside the commit boundary

Problem: F1–F4. A failure mid-import leaves a partially restored, partially deleted store and may still look successful to later readers.

Proposal:
1. Inside the exclusive storage slot (R2 I-1), read the **spooled** file and apply all entries in **one** transaction: move `BEGIN` and the deletes inside the `try`, remove the 5,000-entry batch commits.
2. Before `COMMIT`: decode the staged `database.bin` value and fail if it does not parse (moves the F4 decode failure before the commit).
3. Inlay swap ordering: rename `inlayDir → backup`, `staging → inlayDir`, then `COMMIT`; if `COMMIT` throws, rename back. After a successful commit remove the backup.
4. Any failure → `ROLLBACK`, restore `synchronous`, answer an error (never `ok:true`, R2 I-10), epoch and sessions unchanged (A-10).

Alternative rejected: keep batches and restore the pre-import snapshot on failure — F3 shows the snapshot does not cover assets/coldstorage/inlay metadata.

Risk to verify during implementation: transaction size and WAL growth for large backups (measure with a large synthetic backup; record time, peak WAL size and memory).

## H-2 Storage epoch persistence — recommendation: `internal/storage-epoch/v1`, monotonic by max+1

Proposal:
1. Key `internal/storage-epoch/v1` (absent = 0). F5: backups and snapshots never carry it; only a save folder could.
2. Every reset computes `next = max(epochReadBeforeReset, epochPresentAfterApply) + 1` **inside** the reset transaction, after the rows are applied, and writes it. A save folder that carries an old value therefore cannot roll it back.
3. Runs record the epoch at start in `operationMeta.storageEpoch`; every operation-state rewrite carries the captured value; `operationGate` refuses `storage_epoch_changed` on mismatch; a missing field counts as 0 (R2 I-5, M-4).
4. Together with K3 (delete all `bg-orch-state-op:` / `bg-orch-result-op:` rows in the reset transaction) no old operation keeps commit authority.

## H-3 Session ownership for BG writes — recommendation: send session headers from BG calls and gate BG writes

Problem: F7. After a reset, R2 I-8 makes pre-reset tabs stale for chat writes, but a same-build tab's BG start (legacy start carries a client-supplied `currentChat`), claim and attach still pass.

Proposal:
1. Shared client helper for writer-session headers (`x-session-id`, `x-user-active`) exposed from `NodeStorage` — this is R3's C-06 S-1, pulled forward into Phase B and reused by Phase C for the settings PUTs.
2. `fetchOrchestrationControl` and both start paths send those headers.
3. Server: `checkActiveSession` on `POST /api/bg-orchestrate`, `POST /api/bg-orchestrate-input/{claim,attach,abandon}`. `DELETE /api/bg-orchestrate/:id` is **not** gated, so a stale tab can still cancel (harmless after a reset: the operation no longer exists).
4. Client: a 423 on these calls dispatches `risu-session-deactivated` (existing reload path) and counts as a definitive non-start (no retry loop).
5. Id-less requests keep passing (legacy behaviour, R3-11). Current-build tabs always send the id after this change; older builds are refused by the fence.

Consequence for ordering: Phase B includes S-1 and the BG part of the session policy; Phase C keeps the fence work (F-1..F-4) and the settings PUT wiring (S-2, S-3).

## H-4 Markers whose server records a reset removed — recommendation: epoch-stamped markers

Problem: F8. After a restore the submitting browser (and other devices) can be blocked for up to 49 h.

Proposal:
1. The start response (both start routes) and the status response include the current `storageEpoch`.
2. New server-input and legacy pending markers store the epoch returned at start.
3. Client rule: status `missing` **and** response `storageEpoch` greater than the marker's epoch → clear the marker once with a notice ("백업 복원으로 이 입력은 처리되지 않았어요"); `missing` with the same epoch keeps today's behaviour. Markers without an epoch (written before this change) are cleared only by the same rule when the server epoch is > 0, i.e. a reset happened after upgrade.
Alternative rejected: clear all markers on the restoring tab's reload — other tabs and devices would stay blocked.

## H-5 Reset path coverage — tests to add beyond R2 §7

- BG commit during import with a stub provider (orchestration-level variant of A-1/A-2).
- Recovery re-publication of a commit record staged during an import.
- Two sessions (two devices): the non-restoring session gets 423 on chat write and on BG start/claim/attach after the reset; it can still cancel.
- Inlay swap failure injection (rename failure before commit, and commit failure after swap) — DB and inlay directory both return to the pre-import state.
- Save folder that contains `internal/storage-epoch/v1` with a lower value — epoch still increases.
- Marker epoch rule (H-4) for server-input and legacy markers, including pre-upgrade markers without an epoch.
- Large synthetic backup: single-transaction import time, WAL peak, memory (H-1 risk).

## H-6 Non-queued writes and response precedence — recommendation

1. Precedence: keep the natural order (F6): a stale build gets 426, reloads, and then sees the reset 503. No change to the fence.
2. `DELETE /api/bg-orchestrate/:id` during a reset answers `503 STORAGE_RESET_IN_PROGRESS`; the pending-card cancel maps it to `unconfirmed` and keeps the row (Phase A behaviour), so the user retries after the reset.
3. Non-queued KV writers (operation state/result rows, input settle) must not land inside the reset transaction. Preferred: no `await` inside the apply transaction (synchronous read and decode of the spooled file), so nothing can interleave on the single SQLite connection. If the backup decoder cannot run synchronously, fall back to a reset-flag guard in `writeOperationState`/result persistence/settle that refuses (and logs) writes while the flag is set. Which one applies is decided by reading the decoder at implementation start.

## Owner decisions (2026-10-18)

1. H-1 single transaction with swap-before-commit — approved.
2. H-2 epoch key and max+1 rule — approved.
3. H-3 gating BG start/claim/attach (DELETE ungated) and moving R3 S-1 into Phase B — approved.
4. H-4 epoch-stamped markers with the one-time notice text — approved.
5. H-6 DELETE refused during reset; synchronous apply preferred over write guards — approved.

## Backlog added: C-21 — chats created without `fmIndex` diverge from their local copy

Added to Phase D (runtime lane) by owner decision on 2026-10-18. Not part of Phase B.

- **Problem.** `orchestrationChatRevision` hashes `fmIndex` and drops an absent key, so "no key" and `-1` never compare equal (`src/ts/bgOrchestrationMerge.ts:66-94`). The new-character default chat (`src/ts/characterCards.ts:650-656`), ver2/html chat imports, chat-package import and the server cold-storage stub promotion create chats without `fmIndex`; `characterFormatUpdate` (`src/ts/characters.ts:617`) then fills `-1` on the local copy only. The server copy converges only when that chat is saved.
- **Why it matters.** Until that first save, local and canonical revisions differ. The cancelled-input settlement (`src/ts/bgCancelledInputSettlement.ts:46`) then never clears the marker of a cancelled input, and `chooseServerInputBase` reports `local-chat-changed`, so the chat can stay blocked up to the 49 h marker expiry. Observed in the Phase A browser run with a fixture lacking `fmIndex`; a fixture with `fmIndex: -1` passed.
- **Measured exposure.** A read-only count of one live installation found 8 of 82 canonical chats without the key, each the only chat of its character; 7 have no messages.
- **Effect of fixing.** New and imported chats carry `fmIndex: -1` from creation (client creation paths and the server stub), so the first send of a new character cannot hit the divergence. Changing the revision function itself is not proposed: it would change every revision comparison.
- **Trigger.** Implement in Phase D, or earlier if a stuck marker is reported on a chat without `fmIndex`.
