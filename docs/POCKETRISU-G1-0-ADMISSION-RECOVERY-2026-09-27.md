# G1.0: restore server delegation across JSON transport

Date: 2026-09-27 KST

Status: G1.0 recovery completed after server-side persistence readback and the user's confirmation that the answer arrived on return. This closes the existing-delegation regression unit, not full G1 qualification. G1 plugin hosting and G2 Archive Center are not implemented by this change.

## Change and compatibility

The G1 candidate negotiated server chat commits on the existing detached path. Admission compared the stored chat's msgpack hash with a JSON-transmitted chat's msgpack hash. Explicit undefined object fields disappeared in transit, so otherwise identical chats were rejected as stale.

`captureBase` now compares the JSON transport representation of both objects while returning the original canonical storage revision for the commit transaction. This is an admission-boundary repair, not a change to durable revision encoding or stale-write protection. Actual text changes, null versus absence, omitted defined fields, and array reordering still reject before provider work.

Client start-rejection diagnostics use a fixed allowlist; unknown response text is never echoed. Server missing-base and stale-base diagnostics contain only fixed reason codes. Existing start/status reconciliation, authentication handling and fallback decisions are unchanged.

Newly recovered model-job messages omit unavailable generation/model fields and preserve available parsed input/output usage, including zero. They do not infer a missing model from current settings or fabricate context/token values. Existing partial-message metadata is not rewritten.

Candidate: patcher `0.2.4-experimental.6`, adapter `0.7.13`; based on the existing `fbb08e2` G1 worktree. Other pack versions, including Personal settings `0.5.11` and lazy storage `0.5.2`, are retained. Official AC and MARP are unchanged.

## Observed validation

| Check | Observation |
| --- | --- |
| Regression before repair | New owner fixture failed with `matches: false`; 20 other owner cases passed |
| Patcher baseline and candidate | 51/51 each |
| Focused frontend | 66/66, including actual recovery parsers and diagnostic redaction |
| Full frontend | 174 files passed, one existing skipped file; 1,920 passed, two existing skipped tests |
| Full server | 32 files, 358 passed, 12 existing skipped tests; child-process/SQLite/HTTP coverage included |
| Compatibility | 74 passed, five existing skipped tests |
| Types | Svelte diagnostics: zero errors, zero warnings |
| Builds | Production frontend build and BG bundle build/load (`sendChat`) passed |
| Fresh graph | 42 packs, 1,127 units, seven collisions; zero-change replan |
| Exact revert | 1,021 pristine source files restored with zero byte/mode mismatch; owned additions absent |
| Installer reproducibility | Two builds: 5,343,018 bytes, mode 0755, SHA-256 `4c80689f0a6380d53fe33df582a2b44078386a67d747a25731ffcd4f8a961ca9` |
| Live preflight | 413 managed files matched their recorded hash/mode; candidate plan had ten changed paths |

The first full frontend attempt ended with signal 143 without a test result. A rerun with two workers completed; no assertions/configuration were weakened. The initial sandbox server run could not bind loopback; the full run with runtime permission passed. Vitest 4.1.4's installed CLI confirmed `--maxWorkers`; Context7's nearest available 4.1.6 documentation was supplementary. Builds retain existing chunk-size/plugin timing warnings.

Structural and runtime review covered normalized admission versus durable identity, save/claim ordering, diagnostic privacy, generated ownership and cross-piece behavior. Its findings and remaining limits are retained here; the temporary local structural report was removed at G1.0 closeout. This is not a whole-repository security audit.

## Delivery and device observation

Implementation commit `d405404` was pushed to `codex/pocketrisu-g1-current-main` before delivery. Five consistent SQLite backups passed `quick_check`, and an application/state/intent archive was retained in a restricted operator-only recovery directory. A fresh preflight confirmed no active model jobs or pending sends and no managed-file drift before stopping PM2. The installer applied the planned ten paths; the live build transformed 8,006 modules and the BG bundle loaded `sendChat` successfully.

After restart, HTTP root was 200. Served `/assets/index-DVlfDJHN.js` matched the local 2,163,936-byte file, SHA-256 `e4bc97e89573d3759f41fd281d7c4586eb85f609966af1e1cce10f6c8d12c394`. All 416 managed files matched recorded hash/mode; replan had zero changes. All five live databases returned `quick_check=ok`. PM2 was online, unstable restarts zero, active requests zero. Adapter `0.7.13`, lazy storage `0.5.2` and Personal settings `0.5.11` were read back.

The deployment script's immediate post-restart idle assertion observed a nonzero generic PM2 active-request metric and stopped its verification, after successful restart and HTTP/asset checks. A separate read-only verification observed zero, completed all remaining checks, and made no additional source or process change. Startup repeated the existing retained `awaiting-metadata` journal warning (six records, 2,974 bytes); no journal cleanup was attempted.

No agent-initiated paid provider request was issued during automated verification or deployment. The user subsequently sent one request for the device check recorded below.

Read-only comparison with the pre-application backup found 47 prior operation-state rows and 46 afterward: the single absent row was already `delivered`, no new row appeared, and all 46 retained rows were byte-identical. No manual result/operation cleanup was performed.

The user reported leaving after seeing the rotating green indicator. Before asking the user to reopen, read-only inspection found a new `terminal-success` result (`final=true`, serverChatCommitVersion=1), a `chat-committed` operation and an original-chat commit receipt. The durable chat journal contained 56 messages ending in a character answer of 1,760 characters; its encoded SHA-256 matched the receipt's storedRevision. Stats applied delta was one, and readyForNextTurn was true. Native model-job totals remained 48 done/two aborted, with zero pending sends. Client logs in the test window contained zero detached-start-rejection and zero delegate-not-started anchor rows.

The user then confirmed that the answer arrived successfully. This closes the G1.0 device recovery check. Persistence was checked through the durable database/journal, not an authenticated normal-chat HTTP GET. Full browser process termination was not independently established; duplicate count was not separately reported. These limits remain relevant to full G1 qualification.

An intermittent failure to open chats from the home screen was reported separately and is tracked in [the navigation bug record](POCKETRISU-HOME-CHAT-NAVIGATION-BUG.md). It was not independently reproduced or attributed to this change.

G1.11 is the next implementation unit. No stable tag or release was created at this closeout; the larger G1 remains incomplete. Rollback must preserve new chats, receipts, existing conflict copies and other user data; do not restore a pre-delivery database merely to revert source.
