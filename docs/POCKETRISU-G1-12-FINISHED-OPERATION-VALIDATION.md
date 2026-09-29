# G1.12 finished-operation hotfix validation

Date: 2026-09-29 KST
Candidate: `0.2.4-experimental.11` (lazy-chat-bg-adapter `0.7.18`); first delivered as `0.2.4-experimental.10` (`0.7.17`)
Status: implemented, automatically validated, audited, pushed and live-applied. The user reported the requested device checks normal. Plan: [G1.12 hotfix plan](POCKETRISU-G1-12-FINISHED-OPERATION-HOTFIX-PLAN.md).

## Behavior

- A server-owned result that is final, a terminal error, has no commit receipt and has no answer (`chat` absent, or no message beyond the delegation baseline) is closed at the watch and boot ownership fences. The client shows one notice with a code-point-truncated server error summary (at most 200 code points), acknowledges the result and clears the pending marker.
- A committed result whose hydration fails for a permanent reason (`local-revision-conflict`, `projection-invalid`, `commit-receipt-invalid`) three consecutive times stops polling. With a result row, the client acknowledges it; without one (`chat-committed`, `found: false`), no acknowledgement is sent. In both cases the marker is cleared and one notice states that the answer is kept in the server chat. Other hydration reasons keep the existing polling and deadline.
- An unconfirmed or failed acknowledgement stops the spinner and shows the notice but keeps the marker for an exact retry on the next launch. A `superseded` acknowledgement keeps polling; for committed results the attempt count restarts.
- After a committed result is acknowledged the server reports `found: false`, `operationState: 'chat-committed'` with its receipt, so a marker that survives a crash between acknowledgement and marker removal closes on the next launch through the no-row path.

Unchanged: legacy client-owned delivery and client fallback, answers retained as unconfirmed commits, normal committed adoption, in-flight cancellation. Out of scope: finished-operation cancel responses, message-ID merge adoption, the server-input marker path (`reconcileServerPendingInputCommands`), and deleting or editing server records.

## Verification

| Check | Observed result |
| --- | --- |
| Unit and flow tests (`bgFinishedOperation*.test.ts`) | 37/37 |
| Red check (experimental.10) | Pre-change generated `bgOrchestrate.ts`: 8 of 13 flow tests failed (all new behaviors); 5 preservation cases passed on both |
| Mutation check (experimental.11) | Forcing the acknowledgement to `acked` failed the four superseded/throw flow cases; UTF-16 slicing failed the surrogate test |
| Full frontend | 2,031 passed; three conditional skips (experimental.11 before the bounded-prefix change) |
| Full server / compatibility | 388 passed, 12 skips / 74 passed, five skips (experimental.10; server and compatibility sources unchanged since) |
| Patcher | 328/328 |
| Svelte diagnostics | Zero errors and warnings |
| Builds | 8,009-module frontend build; BG bundle built and loaded with `sendChat` |
| Composition | 42 packs, 1,178 units, seven declared collisions; replan zero |
| Exact revert | 431 managed paths: 117 baseline hashes matched, 314 owned paths absent, zero mismatch |
| Installer | 5,570,993 bytes; SHA-256 `0ef4a4f8324e07c3f57d4a45040e88a232501892019c2346166f833280f4379c`; rebuild reproduced the hash |

Flow tests drive the generated `bgOrchestrate.ts` boot recovery and foreground watch against a scripted server with fake timers. Storage adoption, UI alert, sound, generation lease and transport are replaced; `adoptServerCommittedChat` returns a scripted refusal, and its real refusal logic remains covered by the existing adoption tests. These are not physical browser tests.

Structural (L3) and runtime (L4) audits found no defect in the change. Accepted findings: a foreground send that starts while the boot path awaits the acknowledgement skips that operation's notice (state stays consistent); a committed result shows the spinner for about three poll intervals before it closes; a persistently failing acknowledgement repeats the notice on each launch. The error dialog renders the notice as text.

## Live delivery

Both candidates were applied after an idle preflight (zero active requests, pending sends and input records; no managed-file drift), with the application stopped, five SQLite backups passing `quick_check` and an application/state/intent archive retained. Two older pre-deployment database backups were deleted with the user's approval to provide space for these backups. No generation was cancelled and no server operation, result or commit record was edited.

| Candidate | Changed paths | Served asset check |
| --- | --- | --- |
| experimental.10 | `bgOrchestrate.ts`, three new owned files, state | `database.svelte-DgZan-9i.js` served/local SHA-256 match |
| experimental.11 | `bgFinishedOperation.ts`, two tests, state | `database.svelte-BotF9Ps2.js` served/local SHA-256 match |

After each restart: HTTP 200, replan zero, all databases `quick_check=ok`, PM2 online with zero unstable restarts, external-header settings byte-identical. Each restart logged the existing retained-journal warning and `[ServerChatRecovery] Recovery stalled after 2 pass(es): 0 input(s), 15 commit(s)`. The second line first appeared at the experimental.10 restart; server code was unchanged by this hotfix and the acknowledgement handler does not touch the commit journal. Its cause has not been investigated.

## Device check

The user reported normal on 2026-09-29 KST after reopening the app, sending with the app backgrounded and in the foreground. The pre-existing stuck committed result (`7293828b…`) was not re-polled by the reloaded page, so the device apparently no longer held its marker and the new stop path did not run on the device; its server result row remains and is not offered to any client. No new finished-failure notice was observed, because no operation ended with an error during the check. The closure paths are covered by the automated flow tests only.
