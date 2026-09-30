# Saved-answer notifications

Date: 2026-09-30 KST. Baseline: `173b6a8`. Candidate: `0.2.4-experimental.14`, lazy-chat-bg-adapter `0.7.21`.

The user observed the G1.3 context-change notice, then requested that the saved-answer message shown after returning to the app use the upper notification bar as well. That observation is not recorded as completion of every G1.3 device scenario.

Two saved-answer messages now use the existing toast helpers: an informational notice when the answer remains saved on the server, and a warning when user edits were preserved instead of overlapping server script changes. Their text, guards, callers, repeat suppression and try/catch remain. Generation, storage, hydration, retry and acknowledgement behavior are unchanged. Other failure dialogs remain outside this change.

The affected client suites passed 76/76, including foreground/boot delivery, one-shot notices, no modal for these messages, failed/superseded acknowledgement and marker preservation. Patcher suites passed 51/51; Svelte diagnostics reported zero errors/warnings and frontend build passed. Full composition retains 42 packs, 1,191 units and seven declared collisions; apply/replan changed zero files and exact revert matched 1,022 baseline files and modes.

Installer: 5,683,882 bytes; SHA-256 `8e7f7913dc2e4e5860d9902650b9728f5febeb7452f8d1b2ec8a283e6558b6cb`. The live plan has three changed paths: the client orchestration file, its existing test file and patcher state. Managed-file drift was zero.

Final Opus 5.5 read-only review found no delivery blocker. It checked both generated call sites, retained guards/callers and the notification helpers; it did not rerun the tests. No application code changed after review. Commit `756f038` was pushed and delivered live. This UI-only delivery used an application/patcher-state backup; it did not convert database records or remove the previous full stopped backup. Device confirmation should repeat app exit during generation and return after completion: the saved-answer notice should appear at the top without a blocking dialog, and the answer should remain available.

Live delivery verified a 91,191,232-byte application/state archive against 1,600 source files before applying the three-path plan. Frontend and BG builds/load passed; re-plan showed no changes and all 437 managed files matched. The restarted process was online with zero unstable restarts, and the root plus 17 entry/import assets returned HTTP 200 with matching local hashes. Entry asset: `index-DBagB3Ze.js`, 2,168,729 bytes, SHA-256 `e2e79bc00c68c0dc5f28d03d338e44ca3d8944e6958fa7d33c13b0ee4ca5175d`. Post-readback active requests, pending sends and input-command records were zero; external-header settings were unchanged.

The first delivery helper stopped after successful restart/asset/header checks because the PM2 active-request metric was not yet available. A read-only follow-up waited for that metric and repeated the asset comparison. Its initial asset-name expression was corrected and required to discover the entry asset before the final 17-asset check. No second application deployment or database mutation was performed for these diagnostic corrections. Database integrity checks were not repeated for this presentation-only patch; the preceding G1.3 full-backup and database evidence remains separately recorded.
