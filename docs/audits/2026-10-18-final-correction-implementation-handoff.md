# PocketRisu patcher — final correction and implementation handoff

**Date:** 2026-10-18  
**Status:** implementation *plan and evidence handoff only* — no application changes made  
**Repository:** `danso0429/pocketrisu-personal-patches`  
**Investigated patcher baseline:** `3242c3076b02159ca164ead625e5723364be58ae`  
**Composed target:** PocketRisu `v1.10.0` (`98e968339d1b3f91b9dac85bb3f2ebb5f90f9d14`)  
**Implementation owner:** a subsequent Claude Code session; work should be split into narrowly scoped, reviewable changes.

When this document was committed, `origin/main` was `c7945b9`, one commit after the baseline. That commit changes one file under `docs/records/` and no source, payload or manifest, so the baseline evidence still applies. Re-check `git log 3242c30..origin/main -- src patches scripts dist` before starting; any hit means the cited line numbers and states must be re-verified first.

## 0. Reconciliation log

This revision was checked against every source report listed in §1, read at the commits given there. No code was re-investigated and no test was run for this revision. Repository facts not found in the reports were read directly from Git: the branch commits in §1, the `origin/main` state above, and which pack owns `bgOrchestrationRunRegistry.cjs` and `session-lock.cjs` (§3, Phase B). The revision was then reviewed by a separate model family (Codex, read-only, against the report texts) and by a citation cross-check of every section, ID and number; the adopted findings are rows 14–24. Changes made relative to the first draft of this handoff:

| # | Topic | First draft | Corrected to | Evidence |
|---|---|---|---|---|
| 1 | D-3 basis | "old chats replay" | The replayed content is a write **accepted during the import** (cases B/D); case A overwrites the root DB and every chat with the pre-restore state | R2 §3.3 |
| 2 | D-3 scope | Barrier steps without operation-row deletion | Add deletion of every `bg-orch-state-op:` / `bg-orch-result-op:` row inside the reset transaction (K3), so legacy runs lose authority too | R2 §5.3 step 6, §5.4 K3 |
| 3 | D-4 / Phase B step 5 | "A mismatched/missing-authority operation cannot commit" | A **missing** `storageEpoch` counts as epoch 0 and commits as today while the current epoch is 0 (upgrade compatibility); only a **mismatched** epoch is refused | R2 §5.2 I-5, §7 M-4 |
| 4 | D-4 | No secondary guard | Keep K5: a commit request that carries `inputReceipt` while the input record is missing is refused `input_record_missing` | R2 §5.4 K5, §6, §7 M-3 |
| 5 | Decision register | D-R1-2 and D-R1-3 missing | Added | R1 §5.5 |
| 6 | Phase A | Generic steps | Mapped to R1 components C1–C6, tests T-S/T-R/T-C, and the PRO-1 rule "do not widen `isFinishedServerFailure()`" | R1 §5.3–5.4, §6; plan §5 |
| 7 | Phase A | — | Listed the consolidated-plan W1-A items that R1 supersedes (stage 1 transition, `:860-883` update, `hasPendingGeneration` false, rollback note) | R1 §1, §3.3, §3.7, §6.1 T-S10 |
| 8 | Phase B owners | No restore-safety pack; "related client route policy" | Added `kei-backup-restore-safety-lazy-adapter` (snapshot restore). `session-lock.cjs` is not owned by any pack at the baseline, so K7 needs a new unit. R2 expects **no** client save/retry code change | R2 §0, §5.4; `patches/bg-preserve/manifest.cjs:719` |
| 9 | Phase B | Generic acceptance | Mapped to R2 A-1–A-10, M-1–M-7, C-1–C-2 and the I-7 refusal contract | R2 §5.2, §7 |
| 10 | Phase C | — | Added: F-1 can ship alone; the plan's §5 rule is replaced by "F-3 only together with F-2"; a stale 426 on the server-input path keeps the draft **and clears the marker**; R3 test IDs | R3 §3, §5, §6 |
| 11 | Phase D order | C-11/C-12 (`src/`) ahead of C-14 | Restored the plan dependency: C-14 (bundler table + `dist` test) lands before any `src/` change; split into runtime and toolchain lanes | Plan §3, §4 W2 order |
| 12 | C-03 placement | Listed among small corrections | Plan places it in W1-C. It touches `chatWriteJournal.cjs` (owned by `lazy-chat-sync`), which Phase B's reset also changes; sequencing it after Phase B is this handoff's choice to avoid overlapping edits, not a plan dependency | Plan §2.1 C-03, §4 W1-C; R2 §0 |
| 13 | Handoff design checks | Phase B blockers without IDs | Given IDs H-1–H-6 so the implementation can record their resolution | §3 Phase B |
| 14 | C-07 | "Draft upsert fencing" | The upsert caller is `sendBeacon`, which cannot set headers; fencing it is a design decision that needs a caller-compatible mechanism. Draft purge on deletion is the plan's actual step | US-4 (§3); plan W3-3 |
| 15 | Phase B refusal scope | Route list without cancel | Non-queued writes (cancel DELETE, input settle, orchestration bookkeeping) need an explicit policy during reset; captured as H-6 | R2 §3.4, §3.5 item 4 |
| 16 | CI guards | Upgrade-path and per-root-pack closure checks dropped | Restored as explicit CI guards | Plan W4 items 3–4; ARCH §6 item 2 |
| 17 | Stale-build cancel | "gets 426 and reloads" | Reloads, or freezes the UI with a recovery banner when a draft is dirty | R3 §2 ("What a 426 does"), R3-7 |
| 18 | H-5 | Mapped untested scenarios to A-6/A-7/A-10/A-9/C-2 | Separated "proposed test exists" from "needs a new scenario" and "not examined" (inlay swap failure modes) | R2 §7, §8 |
| 19 | C-10 / C-14 order | C-10 before C-14 unconditionally | C4a (docs only) may precede C-14; C4b changes `src/catalog.cjs`/`src/manager.cjs` and must follow C-14 | Plan §3, W2; TOOL stage 0 |
| 20 | Phase E prerequisite | Implied parallel with the toolchain lane | Phase E starts only after Phases A–B and the toolchain corrections (plan W1–W2) | Plan §1, W5 |
| 21 | Remaining W1-B items | Not dispositioned | "Snapshot-restore path must stay unchanged" is superseded by R2's barrier; the module-header invariant documentation is carried forward | Plan W1-B stage 3, regression risks; R2 §5.1, K2 |
| 22 | Phase B step 3 | Validation before the slot presented as R2's | Marked as this handoff's addition; R2 specifies only spooling first | R2 §5.2 I-9, §5.3 steps 2–3 |
| 23 | Citations | PRO-1 lines attributed to the plan; `server.cjs` attributed to R1 §0; C-09 "speculative" | PRO-1 lines are PRO §1's; `server.cjs` as composite is from R2 §0/R3; C-09 is "requires investigation" / "unverified" | PRO §1; R1 §0; R2 §0; R3 header; US-5; plan §2.1 |
| 24 | H-4 wording | Marker "clears only on a valid cancelled proof" | Scoped to the `input-cancelled` settlement path; R3-6 adds marker clearing on definitive nonstart | R1 §3.5; R3-6 |

## 1. Authoritative evidence and how to read it

This handoff is **the implementation entry point**, but the original consolidated plan remains the full register of work. When recommendations conflict, the narrower and later reproduction takes precedence **for that specific finding**. All documents live on separate Git branches; a relative pathname is not proof the file exists on `main`.

| Precedence | Source | Branch → path (commit) | Purpose |
|---|---|---|---|
| 1 | **Final handoff (this document)** | `claude/final-correction-handoff-2026-10-18` → `docs/audits/2026-10-18-final-correction-implementation-handoff.md` | Overall priorities; reconciled decisions; release gates |
| 2 | **R1: restart recovery** | `claude/r1-restart-recovery-investigation-d1r7in` → `docs/audits/2026-10-18-r1-restart-recovery-contract.md` (`fc14767`) | C-01; D-1/D-2, D-R1-1–3; state transitions and tests |
| 2 | **R2: restore/write/reset** | **same branch** → `docs/audits/2026-10-18-r2-restore-write-reset-contract.md` (`594b91c`) | C-02/C-05; D-3/D-4; actual interleavings |
| 2 | **R3: build fence/session ownership** | **same branch** → `docs/audits/2026-10-18-r3-client-build-and-session-gates.md` (`8abe989`) | C-04/C-06; D-8; callers and headers |
| 3 | **Consolidated correction plan** | `claude/unified-lightweight-defect-screening-2026-10-18` → `docs/audits/2026-10-18-consolidated-correction-plan.md` (`eb3e5d7`) | C-01–C-20, M-1–M-6; W0–W5, D-1–D-9 |
| 4 | **P0 lightweight screening** | `claude/p0-defect-screening-0007jw` → `docs/audits/2026-10-18-p0-lightweight-defect-screening.md` (`cecb1ac`) | P0S-1–5 and evidence limitations |
| 4 | **Unified lightweight screening** | `claude/unified-lightweight-defect-screening-2026-10-18` → `docs/audits/2026-10-18-unified-lightweight-defect-screening.md` (`32aa615`) | US-1–5; broad but shallow coverage of 38 batches |
| 4 | **Original proactive investigation** | `claude/bug-investigation-iz2fgk` → `docs/records/2026-10-18-proactive-defect-investigation.md` (`26dee75`) | PRO findings 1–6 and direct reproductions |
| 5 | **Architecture analysis** | `docs/architecture-maintainability-analysis` → `docs/ARCHITECTURE-MAINTAINABILITY-ANALYSIS-2026-10-18.md` (`0761aea`) | F1–F8 structural background |
| 5 | **Toolchain refactor plan** | `docs/toolchain-refactoring-plan` → `docs/POCKETRISU-PATCHER-TOOLCHAIN-REFACTORING-PLAN.md` (`9043373`) | B1–B7, stages 0–6 |
| 5 | **Coverage assessment** | `claude/defect-coverage-assessment-2026-10-18` → `docs/audits/2026-10-18-defect-investigation-coverage-assessment.md` (`8d4ca6e`) | CB batch plan; unscreened areas; navigation only |

The ten source reports live on seven distinct branches, and all seven fork from the baseline `3242c30` (read from Git). R1, R2 and R3 each state that they used the same composed tree (pristine `v1.10.0` clone + `node dist/pocketrisu-patcher.cjs apply` from the baseline).

**Baseline warning:** source line numbers in these reports describe *composed* output and may change with pack edits. Before modifying a unit, locate its actual manifest/payload owner and inspect the fully composed output. Do not silently apply source-level edits against a different version. R1 §0 lists the files that are byte-identical owned payloads (same lines apply to the payload) and the layered composites `bgOrchestrator.cjs`, `bgOrchestrate.ts` and `DefaultChatScreen.svelte`, whose lines move; R2 §0 and R3 add `server.cjs` as a layered composite.

## 2. Executive decision register — evidence overrides old plan

| Decision | Final recommendation | Basis / override |
|---|---|---|
| **D-1 (C-01)** | Keep stranded server-prepared input records in their existing nonterminal states; derive an **orphan** classification, expose `cancelAllowed`, and offer explicit user cancellation through the existing DELETE route. **Do not** convert them to `blocked_edit` automatically, and do not add a new durable state. | R1 §§3.3, 4, 5 proves `blocked_edit` cannot be cancelled (`settleDurablySynchronously` returns `false` for terminal states) and nonretryable rows would stay stuck. Overrides consolidated W1-A stage 1 and the plan's D-1 recommendation. |
| **D-2 (C-01)** | **Do not change** `hasPendingGeneration()` simply to exclude orphans. A confirmed cancel clears the record and frees all guarded generation paths. | R1 §3.7. Overrides the plan's D-2 recommendation and W1-A stage 1 ("must stop returning true"). Revisit only if the browser run (R1 §6.4) shows users cannot find the cancel control. |
| **D-R1-1** | Extend cancelled proof for a server-prepared transform with `transformState: 'unknown'`, no attachment receipt and zero matching canonical rows. Preserve the live (`running`) transform case's `null` result. | R1 §§3.5, 5.3 C2, 6.1 T-S4/T-S5. Otherwise the client marker stays up to 49 hours after cancel. |
| **D-R1-2** | Optional: after a confirmed cancel of an R-A or R-B row, put `rawText` into the composer draft if the draft is empty. | R1 §5.3, §5.5. Owner decision; not required for correctness. Do not silently drop or silently restore text without the decision. |
| **D-R1-3** | Defer the R-A notice text correction (it claims possible token cost although none occurred). | R1 §3.6, §5.5. Outside C-01. |
| **D-3 (C-02)** | **Storage-reset barrier**, not HTTP 503 refusal alone: fast refusal of new writers, spool uploads before exclusive apply, hold a storage-queue slot for the destructive phase, cancel pre-reset persist timers before the first destructive write, delete all operation state/result rows in the reset transaction, and invalidate pre-reset writer sessions. | R2 §3.3 HTTP reproductions: a write accepted during import replays over the restored chat (cases B, D, the latter with the real export order), and a debounced persist inside the import rewrites the pre-restore root DB and chats while the route answers `ok:true` (case A). R2 §3.5: refusal misses timers, BG publication and already-admitted writers. **Overrides consolidated W1-B preferred minimal refusal**. |
| **D-4 (C-05)** | Persisted **storage epoch** captured by each run and verified by the commit operation gate; a missing epoch field counts as 0. Best-effort abort of all active runs is cost containment only. Keep the K5 secondary guard (`inputReceipt` present, input record missing → conflict). Never globally reject operations without an input record (legacy BG has none). | R2 §3.6 and §§5–6. Replaces the old either/or recommendation. |
| **D-8 (C-04)** | Fence all four HTTP routes, **but** fix the legacy BG start caller to send `x-client-build` in the same shipped release (same `dist`) as fencing `POST /api/bg-orchestrate`. Both start reconcilers must treat `426 CLIENT_UPGRADE_REQUIRED` as definitive nonstart. No permanent exemption; the in-process drain never crosses HTTP. | R3 §§1–3. Fencing the POST alone would block normal legacy BG generations (900 s retry, then `abandoned`, no fallback). Replaces plan §5 rule "do not add C-04 routes before W0-3" with "F-3 only together with F-2"; W0-3 is done (R3 §2). |
| **C-06 session policy** | Add client session headers **and** server active-session check for external-header PUT. Apply the header fix to the two comparable `SystemBackup` settings PUTs as well; handle HTTP 423 as deactivation. Id-less requests keep passing (legacy-compatible design) and a test pins it. | R3 §4; `checkActiveSession` with no `x-session-id` returns `{ok:true}` (evaluated). Severity stays low. |
| **D-5 (C-03)** | Orphan-journal expiry must conservatively distinguish a genuinely pending new chat from an unreachable orphan. Plan recommendation: a missing character, plus a conservative age. | Consolidated plan §4 W1-C, §6; not addressed by R1–R3. |
| **D-6 (C-10)** | Prefer truthful documentation (C4a) for `allDefault` unless pre-admission qualification is still practised. | Consolidated plan; TOOL stage 0; owner decision. |
| **D-7 (C-13)** | Repair or explicitly retire the broken CSS UI rollback script, with a clear operational replacement. **Do not simply repair its ordering cycle while retaining the destructive broad `editor-` prefix filter.** Plan recommendation: retire unless the legacy CSS UI still has users. | US-1/C-13 reproduced; plan §4 W2-E, §6; product decision remains. |
| **D-9 (C-20)** | Mark the old patch-verification governance repository superseded or update its contracts deliberately. | PRO-6, TOOL G.3; documentation/owner decision, not runtime blocker. |

Handoff design checks H-1–H-6 (Phase B) are open design items found while reconciling R1–R3. They are not new defect findings; each must be resolved and recorded before the related Phase B change is called complete.

## 3. Recommended execution sequence, with clear stopping gates

**Principle:** fix correctness and data integrity before cosmetic refactoring. Implement in isolated commits/branches; no monolithic 'fix every finding' change. Each unit gets targeted tests and an evidence-based pass/fail before moving on. Do not mix a runtime fix with refactoring in one commit (plan §5).

The plan defines two independent lanes that meet only at `dist` rebuilds and version bumps (plan §3): the **runtime pack lane** (`patches/*`; Phases A–C and the runtime part of D) and the **toolchain lane** (`src/`, `scripts/`, CI; the toolchain corrections and CI guards of Phase D). They may proceed in parallel. Phase E is not part of that parallelism: it starts only after the correctness work (plan W1–W2) is done.

### Phase A — C-01: restart/orphaned input recovery (highest user impact)

**Owner:** `lazy-chat-bg-adapter` (owned payloads `serverChatInputOwner.cjs`, `bgServerPendingProjection.ts`, `ServerPendingInputs.svelte`; units in `bgOrchestrate.ts` and `DefaultChatScreen.svelte`). PRO-1 retention lives in the adapter manifest's watch/boot branches (PRO §1 cites `manifest.cjs` `:1574-1578`, `:1688-1692`, default reason `:1509`; composed `bgOrchestrate.ts` `:1838-1843`, `:2356-2360`, `:1384` per R1 §3.9) and is a separate commit: R1 §3.9 found the two paths independent, with no ordering constraint.

1. Keep current `recoverAll()` persistence transitions, `TERMINAL_INPUT_STATES`, the DELETE route, notice classification, retention eligibility and the `hasPendingGeneration()` guard unchanged (R1 I-7) unless a direct test proves a specific revision necessary.
2. Orphan definition (R1 §5.1): `recordVersion === 4`, `admission.inputPreparation !== 'client'`, `inputState` is `queued` or `attached`, and either `transformState === 'unknown'` or no in-process settings snapshot. In `pendingProjection`, set `cancelAllowed = inputState === 'queued' || (inputState === 'attached' && orphan)` (C1). Live attached rows keep `cancelAllowed: false` (T-S6).
3. Client (C3–C6): parse `cancelAllowed` as an optional boolean in `bgServerPendingProjection.ts`, reject non-boolean values, copy it only for `blocked_edit` and `execution_unknown` rows. Add `cancelPendingServerInput({operationId, charId, chatId})` next to `cancelObservedServerOperation`, calling the existing `DELETE /api/bg-orchestrate/:id?charId&chatId` through `fetchOrchestrationControl` (results `cancelled` / `finished` / `unconfirmed`; dispatch `bg-server-input-updated`; never touch `activeOperationId` or the watch). `ServerPendingInputs.svelte` gets an optional `onCancelPending` prop and a single-flight cancel button for actionable rows with `cancelAllowed`, plus the irreversibility warning for `execution_unknown` and unknown-transform rows. `DefaultChatScreen.svelte` wires it and keeps the row with a warning toast on `unconfirmed`.
4. Extend cancelled-proof generation **only** for an unknown transform with zero canonical rows and no receipt (C2, D-R1-1), so R-B markers actually settle. Do not broaden this to a `running` transform.
5. PRO-1 (R1 §5.4, plan W1-A stage 3): in both watch and boot, exclude `start-retry-required`, `interrupted-before-result`, `interrupted-after-main` and `delivery-failed` from the `server-owned-uncommitted` retention branch; replace the default reason `commit-receipt-invalid` with `no-commit-evidence`. **Do not widen `isFinishedServerFailure()`** to `found:false` (plan §5). After the fix, watch `start-retry-required` reaches `triggerClientFallback`; R1 §3.9 judges that safe because no provider work began.
6. **Acceptance:** R1 §6.1 T-S1–T-S10 (four restart points R-A–R-D, the no-restart transform failure T-S7, predecessor/successor T-S8, `blocked_edit` non-cancellable pin T-S9, existing `:823-883` and `:1502` tests unchanged except added `cancelAllowed` assertions); §6.2 T-R1–T-R5 (HTTP DELETE, status proof, activity/busy, missing `charId`/`chatId` → 409, model-jobs guard 409 before / allowed after); §6.3 T-C1–T-C8 (parser, component, client helper, cancelled settlement with 5 s idle polling, admission `unresolved-server-input` → `ready`, PRO-1 matrix four states × {legacy, server-owned} × {watch, boot}); §6.4 browser run before and after the fix. No committed chat content is lost; in R-C/R-D the user message remains in the chat after cancel (R1 §3.2).

Consolidated-plan W1-A items superseded by R1, and therefore not to be implemented: the stage 1 transition of orphans to a durable terminal state; "`hasPendingGeneration` returns false" after recovery; "the existing `:860-883` expectation is updated deliberately"; the rollback note about records "already moved to terminal states".

**Stop gate:** no known orphan leaves a noncancellable, nonretryable pending card; no double generation; no marker remains after confirmed cancellation; the startup `operation_interrupted` notice is still delivered exactly once. The browser end-to-end part of R1 (§6.4) is still **unproven** until executed. R1 §7 residuals stay open: a live input queued behind another chat still cannot be stopped from the UI before a restart (noted for C-08), and the attached-with-snapshot no-restart path was not examined.

### Phase B — C-02 + C-05: storage restore/reset invariants (highest data-integrity risk)

**Owner (R2 §0, §5.4):** `lazy-chat-sync` (whole-file `server.cjs`, `chatWriteJournal.cjs`; K1, K2 save-folder), `kei-backup-restore-safety-lazy-adapter` (snapshot restore; K2), the `/api/remove` unit (K2), `lazy-chat-bg-adapter` reset units and `serverChatCommitOwner.cjs` (K3, K5), `bg-preserve` `serverChatCommit.cjs` `operationGate`, operation metadata and `bgOrchestrationRunRegistry.cjs` (K4, K6; the registry is owned by `bg-preserve`, `patches/bg-preserve/manifest.cjs:719`), and `session-lock.cjs` (K7). At the baseline no pack owns `session-lock.cjs` (only `lazy-chat-sync`'s `server.cjs` references it), so K7 needs a new unit with an owner decision. All storage-writer and BG write routes receive the fast refusal (K8). R2 §5.4 expects **no** change to client save or retry code; C-1/C-2 pin the existing client behaviour.

1. Build one shared reset critical section (`runStorageReset(fn)`, R2 §5.4 K2) for **backup import, server backup restore, save-folder upload/execute, snapshot restore, and `/api/remove` of `database/database.bin`** (R2 §5.1). No other queued storage mutation, deferred timer or BG publication may write against a partially restored state (I-1, I-3).
2. Fast refusal (I-7): while a reset is pending or active, one flag generalising `importInProgress`, checked synchronously at route entry, makes chat delta/full writes, `/api/patch`, `/api/write`, asset bulk write, draft upsert, and BG start/claim/attach/abandon answer `503` with `code: 'STORAGE_RESET_IN_PROGRESS'`, `retryable: true` and **no** `x-bg-save-blocked` header. It must not use 409, 412 or 404, which the client treats as conflicts (R2 §3.7). **HTTP refusal alone is not correctness**: the queue slot and timer cancellation cover non-HTTP publications and writers admitted before the flag (R2 §3.5).
3. For uploaded backups, spool the body to a temporary file in the save directory (headroom is already checked in `prepare`) **before** taking the exclusive storage-queue slot; the streaming apply then runs under that slot against the file (I-9). Reads stay available during the upload (A-8). Validating the spooled file before taking the slot is this handoff's addition, not part of R2; it may reject malformed input early but does not replace the mid-apply failure test (A-10).
4. Inside the slot and before the first destructive write: cancel every `saveTimers` entry (I-2) and call the new registry `cancelAll(reason)` (I-6, K6). Queued callbacks that already wait must see the changed generation and return (existing mechanism at composed `server.cjs:922-925`). Then run the existing preflight (`prepareFreshRestoreSnapshot` with `flushPendingDb`). Preserve existing rollback behaviour on import failure (A-10).
5. In the destructive transaction(s) (R2 §5.3 step 6): journal wipe, input and commit `discardRecovery`, deletion of every `bg-orch-state-op:` and `bg-orch-result-op:` row (K3), the restored rows, and the storage-epoch increment (I-4). Each run records the epoch at start in its operation state (`operationMeta.storageEpoch`); every operation-state rewrite carries the captured value; the committer's `operationGate` refuses `conflict` / `storage_epoch_changed` on a mismatch (I-5, K4). A missing field counts as epoch 0 (M-4). Abort is best-effort; the gate is authoritative. K5 adds `conflict` / `input_record_missing` for a request with `inputReceipt` and no input record.
6. After the restored caches are published: invalidate the session lock with a watermark (I-8, K7, e.g. `invalidateBefore(now)`) so every pre-restore tab gets 423 and reloads; old pending chat saves may be requeued normally but must not auto-rebase into the freshly restored state (R2 §3.7). Then release the slot and clear the flag.
7. **Acceptance:** R2 §7 compat A-1–A-10 (A-1 case D export order, A-2 case A root overwrite, A-3 control, A-4 writer admitted before the flag, A-5 `/api/patch`, A-6 server restore, A-7 save-folder upload, A-8 reads during spooling, A-9 session invalidation, A-10 failure mid-apply), module M-1–M-7 (legacy and server-input late commits refused, K5, epoch-0 upgrade compatibility, `cancelAll`, `invalidateBefore`, each of the five hooks bumps the epoch once and cancels timers first), client C-1–C-2. Restored DB and chat equal the backup after immediate read, after `SAVE_INTERVAL` + 1 s, and after a process restart. Re-run the suites R2 §7 lists (`backupSnapshot`, `backupSource`, `restoreSafety`, `chatWriteJournal`, `serverChatCommit*`, `bgServerChatCommitRoutes`, `serverChatInputOwner`, `session-lock`, `bgOrchestrationResultRetention`, `test/compat/backup-point-in-time`).
8. Carried forward from plan W1-B stage 3: document the invariants "journal content is newer than `database.bin`" and "a reset discards recovery rows" (now including operation rows and the epoch) in the journal and committer module headers.

Superseded plan W1-B items: stage 1 "writer refusal during import" as the whole fix (D-3), stage 2 either/or reset rule (D-4), and the regression rule "the snapshot-restore path must stay unchanged" (R2 §5.1 brings snapshot restore under the same barrier, epoch bump and session invalidation, K2).

**Handoff design checks requiring explicit design review, not an automatic new general audit:**

- **H-1 Transactional integrity.** R2 §2 itself records that `importBackupFromSource` commits in periodic `COMMIT`/`BEGIN` batches and then swaps the inlay directory, while R2 I-4 and §5.3 assume the epoch increment "rolls back with the transaction". A multi-transaction, filesystem-changing import is not atomic by that wording. Establish and test a precise failure/rollback contract (where the epoch increment sits, what the preflight snapshot restores, what A-10 must observe); if full atomicity is impossible without staging and swap, document that and choose the safe strategy before implementing an all-or-nothing claim.
- **H-2 Epoch monotonicity across restores.** R2 does not state whether the new epoch key could be inside a backup or snapshot payload. Keep the epoch outside any restorable payload (or re-derive it as `max(current, restored) + 1`) so an old snapshot cannot roll it back. Test successive restores and restarts, including legacy operations with no epoch field, and confirm no operation-state rewrite can attach a newly minted epoch to an old operation.
- **H-3 Session ownership across all writer surfaces.** R3 §4 records that the BG write routes (`/api/bg-orchestrate`, the input routes, `DELETE /api/bg-orchestrate/:id`) use `sessionAuthMiddleware` without `checkActiveSession`, and that R2's I-8 relies on the session lock for chat writes only. After a reset, a pre-reset tab of the **same** build passes the build fence and, on the legacy path, sends a client-supplied `currentChat` (R3 §2). Decide a policy for BG start/claim/attach/abandon and cancel that does not break id-less older clients, and prove a pre-reset tab cannot reintroduce stale canonical chat content after reset. The client-build fence distinguishes app builds only; neither control replaces the other.
- **H-4 Cross-report orphan settlement.** Reset deletes input records (`discardRecovery`) and, with K3, operation rows. R1's client marker ledger survives reloads for up to 49 h, and on the `input-cancelled` settlement path it clears only on a valid cancelled proof (R1 §3.5). Define and test what the status route reports for a marker whose input and operation rows were removed by a reset, so it reaches a terminal client state instead of polling until expiry. Not analysed by R1 or R2.
- **H-5 Reset path coverage.** R2 confirmed the backup-import path by HTTP and the commit gate by module (R2 §8). Separate the remaining paths by evidence:
  - *trace only, R2 proposes a test:* server restore (A-6), save-folder upload (A-7), failure mid-apply on a truncated stream (A-10), pre-restore session refused after completion (A-9, C-2; the client auto-rebase hazard itself was traced, not reproduced);
  - *trace only, no R2 test yet — write a new scenario:* BG commit during import with a stub provider (R2 §8 says an orchestration-level variant is needed), recovery re-publication of a commit record written during an import, and multi-device behaviour during a reset;
  - *not examined by R2:* the inlay directory swap's own failure modes. A-10 does not cover a failure inside the swap.
  None of these is fixed until its scenario runs.
- **H-6 Non-queued writes and response precedence during a reset.** R2 §3.4–3.5 lists non-queued KV writes (cancel DELETE, input settle, operation state/result rows) that execute inside the import's open transaction, while I-7's route list omits `DELETE /api/bg-orchestrate/:id`. Decide whether a cancel during a reset is refused (503) or serialized behind the slot, and test a cancel that arrives during the destructive apply. Also decide which answer wins when a stale-build request arrives during a reset — the fence's 426 (R3) or the reset's 503 (I-7) — since the start reconcilers treat them differently (Phase C F-4). This is an open composition question, not a reproduced defect.

**Stop gate:** every destructive reset has an explicit linearization barrier, old-generation persists and commits cannot mutate restored data, stale writers cannot reintroduce old state, failed resets do not claim success (I-10: a failing or partial apply must not report `ok:true`), and H-1–H-6 each have a recorded resolution.

### Phase C — C-04 and C-06: safe request and session gates

**C-04 — F-1 to F-4 from R3 §3:**

1. F-1: add `POST /api/bg-orchestrate-input/{claim,attach,abandon}` to `EXACT_WRITER_ROUTES` (`client-build-fence` pack). Every production caller already uses `clientBuildFetch`; F-1 may ship alone.
2. F-2: convert the **legacy** delegated `POST /api/bg-orchestrate` start closure (`bg-preserve` start unit, composed `bgOrchestrate.ts:3060-3066`) from bare `fetch` to `clientBuildFetch`.
3. F-3: in the **same `dist`**, fence `POST /api/bg-orchestrate`. Do not ship this fence before F-2: R3 traces a near-total outage of non-input generations with a 900 s retry loop and no fallback.
4. F-4: both reconcilers (`reconcileOrchestrationStart`, `reconcileServerInputStart`) treat a 426 with `CLIENT_UPGRADE_REQUIRED` as definitively not started: `rejected` after one attempt, no status polling, no client fallback, server-input draft kept and its marker cleared (R3-6).
5. Acceptance: R3-1–R3-8, including R3-8 with a real `dist/build-stamp.json`: one server-owned Send and one legacy regenerate both start with the fence enabled. A fenced test that uses `bgServerChatProcessClient.cjs` must supply the header (R3 §2).

**C-06 — S-1 to S-3 from R3 §4:** expose writer-session headers from `NodeStorage` and send them from the external-header PUT and, in the same change, from the `SystemBackup` backup-path and snapshot-limit PUTs (S-1); add `checkActiveSession` on the external-header route (S-2); dispatch `risu-session-deactivated` on 423 (S-3). Id-less requests keep passing by design. Acceptance: R3-9–R3-12. A server-only 423 test is not sufficient, because a server-only change has no effect on the real client.

**Stop gate:** current-build Send succeeds on both paths; old/missing build headers yield a clean 426 resolved in one attempt; old session headers receive 423 where intended; no 15-minute retry loop.

**Cross-dependencies:** Phase B's fast refusal (I-7) also covers BG start/claim/attach/abandon, so the reconcilers must keep treating `503 STORAGE_RESET_IN_PROGRESS` as retryable while F-4 makes 426 definitive. Phase B's reset-session guarantee must account for these BG routes (H-3). Build fences and session ownership are different controls; neither replaces the other. The DELETE route used by Phase A cancel is already fenced, so a stale-build tab gets 426 and either reloads or, when a draft is dirty, freezes with a recovery banner (R3 §2); the cancel is possible only after upgrade recovery. The R1 ↔ R3 matrix row includes the dirty-draft case.

### Phase D — Smaller confirmed corrections

**Runtime lane** (after Phase B, because C-03 and C-07 touch modules Phase B also changes):

| Ticket | Work | Evidence | Minimum acceptance |
|---|---|---|---|
| **C-03** | Conservative lifecycle for `awaitingMetadata` orphan journal records (D-5); expose the orphan count in `/api/db/stats` | P0S-3 module reproduction; plan W1-C | Orphans retire and capacity recovers; legitimate delayed chat creates survive; then reproduce the client trigger (root patch fails, reload) |
| **C-07** | Purge `bg-stream-draft:` keys on chat/character deletion (plan W3-3; optional long TTL). Fencing the upsert is a separate design decision: its caller is `sendBeacon`, which cannot set `x-client-build`, so simply adding the route to the fence would reject legitimate drafts | US-4, static | Deleted chat leaves no retained draft. If fencing is chosen, a caller-compatible mechanism is specified and a test shows current-build drafts still save; otherwise the stale-tab asymmetry is documented. The I-7 reset refusal of draft upsert must also tolerate `sendBeacon` (no response handling) |
| **C-08** | Determine intent of one-at-a-time detached turns | P0S-5 observation; R1 §7 pre-restart gap | Throughput contract decided; only implement concurrency change if warranted |
| **C-09** | `extractThoughts` scan optimization **only if** measured harmful | US-5 (requires investigation); plan: unverified | Parser semantics unchanged, crafted nested case bounded |

**Toolchain lane** (plan W2 order A → B → C/D/F → E → G; C-14 must land before any `src/` change because `dist` has no local protection). Settle D-6 first: the documentation-only C4a may land before C-14, but C4b changes `src/catalog.cjs` and `src/manager.cjs` (TOOL stage 0) and therefore lands after C-14.

| Ticket | Work | Evidence | Minimum acceptance |
|---|---|---|---|
| **C-10** | Resolve `allDefault` documentation/code inconsistency (D-6) | ARCH F3 / TOOL B4, stage 0 | C4a: docs describe the actual gate and mark `contracts` reserved. C4b: `list --json` ETags of current packs unchanged and an `allDefault:false` root pack is absent |
| **C-14** | Consolidate bundler input table; test committed `dist` | TOOL B2, stage 1 | `cmp` against committed `dist`; dist loads and passes a smoke plan; the test fails on a deliberately removed module |
| **C-11** | Fix staging tracked-change check truncating to first 100 paths | PRO-2, `src/staging.cjs` | PRO's 131-file reproduction raises `STAGING_SOURCE_DRIFT`; bound only the *display* list; existing staging tests pass |
| **C-12** | Make stale-root-lock reclaim safe against two patchers; a missing lock at release is an error | PRO-3, `src/manager.cjs` | Deterministic two-patcher interleaving admits exactly one; token ownership protected; all manager tests pass |
| **C-15** | Skip invalid `latest` report candidate with warning | PRO-4 | Valid latest report opens in presence of malformed neighbour |
| **C-13** | Repair or deliberately retire CSS UI rollback (D-7); **avoid removing non-CSS editor save guards**. It is a script, not `src/`, so it may run any time after D-7 | US-1 reproduced ordering cycle; current script drops 48 `editor-*` units | Real-catalog `plan` succeeds on composed `v1.10.0` and removes **only approved CSS units**, with no other pack's `after` pointing at a removed unit; or script is retired with a documented replacement |
| **C-16** | Re-run dependency/auto resolution after supersession to fixpoint | PRO-5, synthetic only | Synthetic repro passes; `resolveProfile('all')` unchanged for the real catalog; required before the first `supersedes` use |

**CI guards** (plan W4, ARCH §6 order; each shown to fail once on a deliberately broken scratch branch, then pass):

| Ticket | Work | Evidence | Minimum acceptance |
|---|---|---|---|
| **C-18** | Marker-induced ASI guard in CI | ARCH F7 | Intentionally broken composition fails marker audit |
| **C-19** | Portable plugin probe coverage in CI | ARCH F6 | Portable probes run; systemd/bwrap requirements clearly separated |
| **M-3 guard** | Upgrade-path check: previous release → current, compared with a fresh apply | Plan W4 item 3; ARCH §6 (F1) | CI fails when the upgraded tree differs from a fresh apply |
| **M-2 guard** | Plan each root pack's closure on its own | Plan W4 item 4; ARCH §6 (F4) | CI fails when any root pack's closure cannot plan alone |
| **C-17** | Precise package/build identity and version protocol | ARCH F5 | Each release content has identifiable hash/version and CI detects divergence |
| **C-13 guard** | If C-13 is repaired: add the real-catalog rollback plan to the repository tests | Plan W4 item 6 | The test fails on the current broken script and passes after the repair |

**Independent:** **C-20** — update or retire the obsolete governance repository (D-9; PRO-6, TOOL G.3). Documentation matches the all-or-nothing delivery design.

**Do not confuse status with priority:** C-04's fence classification is confirmed and R3 traced its impact, but no end-to-end run was executed; C-07/C-08/C-09 are low-confidence/design items. Do not invent fixes merely to exhaust an issue list.

### Phase E — Optional, behavior-preserving maintainability work

Start only after the correctness work (plan W1–W2) is complete (plan §1, W5). The M-2 and M-3 CI guards above are not optional refactoring and stay in Phase D. Preserve the consolidated plan's M-1–M-6 classification and the toolchain staged plan (TOOL §E/§F):

- M-1 path safety: characterization tests first (after C-14), extract only after parity tests.
- M-2 CLI flow: refactor only after phase tests protect behavior.
- M-3 expose composed-output inspection and carefully fold patches only with byte-identical results.
- M-4 replace whole-file vendor pinning at a deliberate upstream upgrade, not during incident fixes.
- M-5 composition performance: defer until measured.
- M-6 target identity/readers: deliberately leave unchanged.

Avoid introducing ESM/TypeScript migration, generic bundler migration, persisted-format or marker changes, `packEtag` input changes (except additively for C4b), size-based splitting of `manager.cjs`, or unrelated manifest/anchor rewrites into correctness PRs (plan §5).

## 4. Cross-issue regression matrix (required for review)

| Boundary | Must be tested together | Prohibited outcome |
|---|---|---|
| R1 ↔ R2 | Interrupted input, then restore/reset, then old pending card and cancellation or terminal resolution (H-4) | An input marker with no cancel/settle path, or pre-restore answer committed after reset |
| R2 ↔ R3 | Post-restore tab of *same build* issues legacy BG start, server-input attach, settings PUT and chat delta (H-3) | Stale tab mutates the newly restored canonical state despite session invalidation |
| R1 ↔ R3 | Orphan cancel through DELETE, current/stale build (stale with clean and with dirty draft); normal server-input Send | New fence prevents cleanup of old orphan after upgrade recovery, or current client cannot Send |
| Reset ↔ Cancel | Orphan or live cancel DELETE arriving during the destructive apply (H-6) | Cancel bookkeeping written into the restore transaction, or a cancel silently lost |
| Timer ↔ Restore | Debounced root/chat persists enqueued before or during import | Old `database.bin` or journal replay overrides restored content |
| Commit ↔ Epoch | Legacy and server-input operations straddle reset; operation state rewrites after reset; operations without an epoch field before the first reset | Any old-epoch answer/variables/statistics committed to restored chat; legacy commits refused before any reset |
| Restore ↔ Failure | Failure after first destructive mutation or partial filesystem swap (H-1) | API returns success, unusable DB, epoch/session status falsely updated |
| Reset refusal ↔ Start reconcilers | `503 STORAGE_RESET_IN_PROGRESS` and `426 CLIENT_UPGRADE_REQUIRED` on both start paths, including a stale-build request during a reset (H-6) | 503 treated as definitive, or 426 retried as ambiguous |
| Toolchain ↔ Payload | Change to manager/catalog/build against composed v1.10.0 and upgrade path | Different payload composition, broken installer or irreversible apply/revert |

## 5. Release qualification and review protocol

1. **Preflight:** confirm branch HEAD, upstream v1.10.0 identity, clean workspace, baseline known tests, and precise file ownership. Use a disposable clone; do not experiment on live PocketRisu installation or real backup.
2. **Red/green focused proof:** wherever feasible, add a regression that fails on the baseline then passes after the change; log test ID, observed result and ref.
3. **Composed semantics:** apply *all* patched units, inspect final output, test integration points and ensure one fix has not changed another pack's ordering or anchor selection.
4. **Main test gates for release (plan §4):** repository tests, apply on `v1.10.0`, embedded server/client tests relevant to changed modules, `pnpm check` and `pnpm build`, full patch apply/revert round trip, and installer/`dist` rebuild byte parity. Record environment-dependent skips and explain any warnings.
5. **Release identity:** bump the owning pack's version and the package version for each content change (C-17), add a CHANGELOG entry, update the build stamp as the project contracts require, and confirm `dist` is synchronized.
6. **Fail closed:** if restore atomicity, old-epoch commit refusal or current-client Send cannot be verified, do not describe the change as production-ready. Do not silently downgrade confirmed faults into advisory notes.
7. **Review separation:** implementation branch and commits for each phase, tests alongside each change, no unrelated refactoring, and an explicit review checklist. Never auto-merge or deploy.
8. **Documentation:** log deviations from this handoff with their evidence. Keep the source reports intact; add a dated addendum or update the canonical correction plan only when the owner chooses.

## 6. What is not proven

- R1 did **not** execute the full browser/HTTP path for orphan cancellation; four restart points, the no-restart transform failure and the cancel were reproduced at module level with the DELETE not-active branch performed by hand. Client conclusions rest on a trace of composed sources.
- R2 **did** reproduce chat replay (cases B, D) and root/chat overwrite (case A) via real HTTP with synthetic backups, and the late commit at module level; it did **not** prove every reset path, the live provider-start window, the client post-restore auto-rebase, or the proposed barrier's correctness. Cases A–C ran twice and D once, on one machine, with second-wide timing margins.
- R3 enumerated in-repository production call sites and evaluated `isWriterRoute()` and `createSessionLock()`; it re-ran no suite, and 426 retry behavior was traced but not executed end to end. Plugin/user scripts making direct calls were out of scope.
- The 38-batch unified screening was broad but shallow, and the consolidated plan lists seven batches as unscreened (CB-08, 23, 24, 25B, 30, 31, 33). Unscreened feature areas are not certified safe. Optional PageFold CB-31 credential/cost audit remains a future, separately justified task, **not a prerequisite to the confirmed correctness fixes**.
- This handoff is a reconciliation of the reports. It re-ran no test and re-investigated no code beyond the Git lookups noted in §0. Its own review (a separate-family document review and a citation cross-check) checked consistency with the report texts, not product behaviour.

**Overall handoff criterion:** the implementation agent should be able to pick a C-ID, identify the exact authoritative report, follow agreed state/data invariants, write targeted acceptance tests, and know when to stop or raise a design decision. The result must be a sequence of verifiable fixes—not another open-ended audit.
