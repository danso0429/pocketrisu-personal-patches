# G1.1 anchored server chat commits

Date: 2026-09-30 KST (initial planning: 2026-09-28)
Starting point: `c9c4c9c`, delivered candidate `0.2.4-experimental.11`.
Status: implementation, automatic validation and scoped Opus review complete; candidate `0.2.4-experimental.12`. Delivery/device status is maintained in [the validation record](POCKETRISU-G1-1-ANCHOR-COMMIT-VALIDATION.md).

## Resume and collision check

The original WIP at `fa37ac4` is preserved. The intervening G1.12 delivery at `c9c4c9c` changes finished-operation handling in the same generated client, but its maintained source paths do not overlap the original WIP. Only the generated installer overlaps. A source-only application check against G1.12 passed; implementation resumed in a separate worktree based on that delivered commit. The unrelated home-navigation documents and their uncommitted changes remain untouched. Live readback found all 431 managed paths consistent with installed state and the inspected G1.12 sources.

The user chose to preserve user edits and notify when concurrent server-script edits cannot be applied. No conflict copy or automatic overwrite is introduced. Existing G1.12 finished-error closure and bounded committed-adoption refusal remain part of the candidate and regression tests.

## Required behavior

An earlier message edit saved while generation runs must remain in the original chat when the answer is saved. Locate the input by message ID in the latest canonical chat and insert the generated result after it. A deleted chat/input or an unknown message after the input must retain the result and explain the conflict without creating a conflict copy. Preserve operation identity, cancellation, atomic journaling, variable/statistic effect receipts and restart recovery.

G1.2 already protects the opposite ordering, where a server answer precedes a stale client save. This unit must test both orderings together. G1.3 settings freshness, G1.4 expanded admission, server plugin hosting and full G1 qualification remain separate goals.

## Observed current flow

1. The browser durably saves the input and delegates a canonical full chat.
2. `serverChatCommitOwner.captureBase` compares whole-chat JSON transport revisions.
3. The server executes the pipeline on an isolated chat and returns that whole chat.
4. `commitGenerationResult` derives input/assistant ownership and submits that result to `serverChatCommitter`.
5. The storage queue prepares a journal; a synchronous transaction checks the original full revision and writes chat, effects, receipt and operation state.
6. Browser return reads the canonical chat and execution projection; allowed local revisions currently derive from the delegation marker.

The full-revision comparison at step 5 rejects independent edits. Merely deleting it would overwrite those edits. Resolving before the queue would race ordinary saves. Re-resolving before replay detection could duplicate an answer or produce a different request fingerprint after a successful write. A saved local edit also changes the revision used by step 6, so server-only changes are insufficient.

## Implementation boundaries under review

- Capture the actual input identity and execution base before the pipeline can mutate them; do not infer the anchor again from the finished result.
- Resolve the latest chat inside the existing storage queue and retain a final CAS check across asynchronous encoding.
- Separate the immutable submitted-result identity from the resolved write identity. Preserve original input receipts and record the actual pre-write revision for recovery and browser adoption. Continue reading previous records.
- Preserve server chat effects as well as user edits; explicitly resolve the collision policy rather than silently dropping memory or script updates.
- Keep semantic conflict reporting distinct from storage failure, cancellation and corrupt identity records. Do not fall back to a client-created conflict chat for server-owned results.
- Verify existing reroll/continuation behavior before narrowing the anchored path. Do not silently disable normal modes to satisfy the new tests.

## Validation and delivery

Use actual codecs, SQLite and generated route/process callers for edit-before-answer, answer-before-edit, deletion, unknown suffix, queued concurrent writes, lost acknowledgement, duplicate invocation, transaction rollback and restart recovery. Include chat effect preservation, receipt validation, browser hydration and existing strict commit callers. Update tests only where the approved contract changes; retain explicit preservation assertions.

Then run applicable frontend/server/compatibility/patcher tests, type/help checks, production frontend/BG builds, composition/replan and exact revert. Record structural and runtime audits, obtain final scoped Opus review, commit/push, and deliver after read-only idle checks and verified backups. The device check will cover editing an earlier message during generation, leaving the app and returning to the same chat with both edit and answer present. Stable publication remains outside this unit.
