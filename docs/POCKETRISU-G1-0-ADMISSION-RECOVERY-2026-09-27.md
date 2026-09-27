# G1.0: restore server delegation across JSON transport

Date: 2026-09-27 KST

Status: candidate implemented, pushed and live-applied; physical-device qualification remains open. G1.0 product completion requires the existing preset send to finish through server delegation. G1 plugin hosting and G2 Archive Center are not implemented by this change.

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

Structural and runtime review covered normalized admission versus durable identity, save/claim ordering, diagnostic privacy, generated ownership and cross-piece behavior. The local structural report is retained until the device gate closes. This is not a whole-repository security audit.

## Delivery and remaining gate

Implementation commit `d405404` was pushed to `codex/pocketrisu-g1-current-main` before delivery. Five consistent SQLite backups passed `quick_check`, and an application/state/intent archive was retained in a restricted operator-only recovery directory. A fresh preflight confirmed no active model jobs or pending sends and no managed-file drift before stopping PM2. The installer applied the planned ten paths; the live build transformed 8,006 modules and the BG bundle loaded `sendChat` successfully.

After restart, HTTP root was 200. Served `/assets/index-DVlfDJHN.js` matched the local 2,163,936-byte file, SHA-256 `e4bc97e89573d3759f41fd281d7c4586eb85f609966af1e1cce10f6c8d12c394`. All 416 managed files matched recorded hash/mode; replan had zero changes. All five live databases returned `quick_check=ok`. PM2 was online, unstable restarts zero, active requests zero. Adapter `0.7.13`, lazy storage `0.5.2` and Personal settings `0.5.11` were read back.

The deployment script's immediate post-restart idle assertion observed a nonzero generic PM2 active-request metric and stopped its verification, after successful restart and HTTP/asset checks. A separate read-only verification observed zero, completed all remaining checks, and made no additional source or process change. Startup repeated the existing retained `awaiting-metadata` journal warning (six records, 2,974 bytes); no journal cleanup was attempted.

No paid provider request was issued for this work. Unit/route/provider-fixture results are not evidence that the user's actual preset configuration completed while the browser was absent.

Read-only comparison with the pre-application backup found 47 prior operation-state rows and 46 afterward: the single absent row was already `delivered`, no new row appeared, and all 46 retained rows were byte-identical. No manual result/operation cleanup was performed.

After safe application, reload the iPhone app to load the new bundle, send once in the existing preset chat, and leave the app while generation is running. Verify server delegation and normal-chat persistence before reopening, then verify one answer on return. A detached-start rejection/client fallback or an answer first saved by model-job recovery does not qualify as G1.0 completion.

G1.11 and the larger G1 implementation follow the G1.0 completion gate. No stable tag or release is authorized by automatic tests alone. Rollback must preserve new chats, receipts, existing conflict copies and other user data; do not restore a pre-delivery database merely to revert source.
