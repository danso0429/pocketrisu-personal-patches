# G1.12 hotfix plan: close finished server operations on the client

Date: 2026-09-29 KST
Status: implemented on branch `codex/pocketrisu-g1-12-finished-operation` as candidate `0.2.4-experimental.10` (lazy-chat-bg-adapter `0.7.17`). Not yet pushed or live-applied. The call-site list and the no-answer condition below were corrected against the code before implementation.
Scope: the two G1.12 items that stop the persistent spinner and repeated warnings. The remaining G1.12 items (finished-operation cancel responses, message-ID merge adoption) stay with G1.1 as planned in the public ordered-goals document.

## Problem

On iPhone the chat spinner keeps turning and every tap shows "서버가 취소 대상을 아직 확인하지 못했어요". Each app launch can also show "서버 소유 답변의 채팅 저장을 확인하지 못했어요". A 2026-09-28/29 read-only investigation found no running or queued server work. The client was holding two operations that had already finished on the server:

| Case | Server state | Client behavior | Cause in current code |
|---|---|---|---|
| A. Committed result that cannot be adopted | `chat-committed` with a valid commit receipt. The user later deleted that part of the chat on purpose. | `hydrateServerCommittedResult` returns `local-revision-conflict`; watch and boot recovery re-poll every `ORCH_POLL_MS` indefinitely; the boot deadline only defers the marker (`deferBootRecovery`) so the next launch restarts the loop. | `adoptServerCommittedChat` adopts only when the local chat revision equals the delegation base or an accepted alias. Once the chat has moved on, the condition can never become true, and no caller bounds the retries. |
| B. Terminal error without an answer | Main call aborted after the 600 s limit; final `terminal-error` result with `chat: null`; state stuck at `result-ready`. | Classified as `server-owned-uncommitted`; `retainUncommittedServerChat` warns, keeps the marker and repeats on every launch. | `serverChatDeliveryDisposition` treats every receipt-less result of a `serverChatCommitVersion=1` operation as an unconfirmed commit, including a final error that never produced an answer. |

Case B for operation `4fdc6469…` was cleared on 2026-09-29 by a user-approved one-row state change (`result-ready` → `delivered`, backup under the live tree's `backups/g1-12-op-state-fix-20260929-002109/`). Case A cannot be cleared on the server without deleting commit receipts, which is not acceptable. New occurrences of both cases remain possible until this hotfix ships.

## Changes

### 1. Terminal errors without an answer are closed once (case B)

Before any call to `retainUncommittedServerChat`, classify a result as a finished failure when all of these hold:

- `final === true`
- `kind === 'terminal-error'` (or `outcome === 'error'`)
- no valid commit receipt
- no answer: `chat` is null or absent, or its message count does not exceed the delegation baseline (`baselineMsgs`). The server also records `terminal-error` for a run that finished without a new message; that record carries the unchanged chat, so a null-only check would keep retaining it. This is the same main-reply test the legacy delivery path uses.

For a finished failure the client:

1. Shows one error notice containing the server error summary (for example the timeout), using the existing top-bar alert.
2. Acknowledges the result with the existing `acknowledgeResultRevision` so the server moves the operation to `delivered`.
3. Clears the pending marker (`stopWatch()` in the watch path, `finishBootRecovery()` in the boot path).

Results that carry an answer, carry a receipt, or are not final keep the current retain behavior.

### 2. Bounded adoption of committed results (case A)

Track consecutive non-hydrated attempts per operation in memory. Split hydration reasons:

| Reason | Treatment |
|---|---|
| `local-revision-conflict`, `projection-invalid`, `commit-receipt-invalid` | Permanent for the current adoption rule. After 3 consecutive attempts, stop. |
| `projection-unavailable`, `chat-readback-failed` | Possibly transient. Keep the existing polling and deadline behavior. |

When a committed result reaches the stop condition, the client:

1. Acknowledges the result so the server stops offering it. The answer stays in the server chat; the commit record is not touched.
2. Clears the pending marker and stops the spinner.
3. Shows one notice: "답변은 서버 채팅에 저장돼 있어요. 채팅을 다시 열면 보여요."

This is safe because the result is already durable in the server chat and the G1.2 client save rebase (`0.2.4-experimental.8`/`.9`) prevents a stale local copy from overwriting it.

### Code placement

- New owned file `src/ts/bgFinishedOperation.ts` holding the pure finished-failure classifier, its notice text and the adoption-attempt decision (reason × consecutive attempt count → `retry` | `stop`). A new owned test file `src/ts/bgFinishedOperation.test.ts` covers them, and `src/ts/bgFinishedOperationFlow.test.ts` drives the generated `bgOrchestrate.ts` boot and watch paths against a scripted server.
- Call sites, all in `patches/lazy-chat-bg-adapter/manifest.cjs` units that write `src/ts/bgOrchestrate.ts`. A found result is classified by the ownership fence before it reaches the found-result branch, so case B is closed at the two fences; case A is bounded wherever committed hydration runs:
  - Case B: `server-commit-client-ownership-fence` (watch) and `server-commit-boot-ownership-fence` (boot).
  - Case A with a result row: `server-commit-client-found-result` (watch) and `server-commit-boot-found-result` (boot).
  - Case A without a result row (`chat-committed`, `found: false`): `server-commit-client-missing-result` (watch) and `server-commit-boot-missing-result` (boot). No result row remains, so these clear the marker without an acknowledgement.
- When an acknowledgement is not confirmed (network failure, another consumer's claim), the notice is shown and the spinner stops, but the pending marker is kept so the next launch can retry the exact acknowledgement. A `superseded` response keeps polling, as elsewhere in the delivery code.
- Do not modify `bgServerCommitHydration.ts`, `chatStorage.ts`, `serverChatCommit*.cjs` or other files touched by the uncommitted G1.1 work.

## Branching and conflict handling

- Start a new branch and worktree from `origin/codex/pocketrisu-g1-current-main` at `fa37ac4`. Leave the existing G1 worktree and its uncommitted G1.1 changes untouched.
- The only expected overlap with the G1.1 work is the generated installer `dist/pocketrisu-patcher.cjs`, which is regenerated after rebasing either line.
- Bump the patcher candidate to the next `0.2.4-experimental.N` and the `lazy-chat-bg-adapter` pack version.

## Verification

1. Unit tests for the classifier and decision function: terminal error without answer → close; error with answer, receipt present, or non-final → retain; permanent reason 1–2 attempts → retry, 3rd → stop; transient reason → retry until the existing deadline.
2. Frontend tests around the three call sites: one notice per operation, acknowledgement sent, marker cleared, no further polling; unchanged behavior for normal committed adoption, legacy delivery and in-flight cancel.
3. Existing suites on the exact PocketRisu 1.10 target: patcher, server, frontend, compatibility, type check, production and BG builds, full composition re-plan 0 and exact revert.
4. Structural audit (L3) and runtime audit (L4) of the changed units and their callers.
5. Live delivery only after user confirmation: read-only check that no generation is active, then stop → apply → build → start, followed by served asset hash, managed-file and DB integrity checks.
6. Device check (L5) on iPhone:
   - Open the app. The spinner on the affected chat stops and the "saved in server chat" notice appears once.
   - Reopen the app. The notice and the spinner do not return.
   - Normal send and reply in any chat still complete and appear as before.

## Out of scope

- Finished-operation cancel responses on the server and message-ID merge adoption (G1.12 items 2 and 4 of the ordered-goals plan).
- G1.1 anchored server commits.
- Deleting or editing server operation, result or commit records.
