# G1.5 request-policy foundation

Date: 2026-09-30 KST. Baseline: `027c1f8` (experimental.14).
Candidate: `0.2.4-experimental.15`, lazy-chat-bg-adapter `0.7.22`.
Status: implemented, automatically validated, reviewed and delivered live. Device
confirmation and full G1.5a qualification remain open; no stable release is claimed.

## Scope and behavior

The ordered goals now place the native-model portion of request eligibility before
the N+1 queue UI. This first implementation unit shares explicit-database model
resolution between actual dispatch and server-input preflight. It preserves the
existing preset/module/custom-provider preparation boundary. Opening those routes
to server-owned raw inputs remains the next qualification unit, not an outcome of
this checkpoint.

The binding resolver is extracted without a runtime database import. Its browser
wrapper still reads the current database; preflight supplies its owned snapshot
before the server execution singleton is installed. Actual request dispatch uses
the same selection for chat/global-lock/module presets and classic main/sub/aux
models. A forced static model still bypasses preset/module/aux selection. Existing
transport, credential, endpoint, retry, PageFold context and streaming paths remain.

Server-input preflight now includes configured fallback models. Previously a
classic main model with a reverse-proxy, custom or plugin fallback passed the raw
input gate. Such requests now retain client preparation and the existing prepared
delegation path. This does not disable their model endpoint or remove fallback
settings. After durable input attachment, and when resuming already-attached
input, the current model settings are checked again. An unsupported change ends
preparation before main dispatch with `latest_settings_require_client`; attached
input is retained and is not transformed again.

## Verification boundaries

Tests exercise real binding resolution with a different database singleton,
generated request dispatch with synthetic transport callbacks, all six request
modes, forced fallbacks, module overrides and custom URL/key preservation.
Generated orchestration tests cover fresh and attached inputs, settings changes
after attachment, no provider dispatch on refusal, and unchanged prepared runs.
These tests do not establish remote endpoint reachability, local-model latency,
real plugin execution or iPhone suspension behavior.

Observed gates:

- Focused selection/binding/dispatch: 70/70; generated runner/owner/routes: 38/38.
- Full frontend: 2,090 passed / four existing conditional skips. The first full
  run had one SSE recovery timeout; baseline and changed standalone suites both
  passed 45/45. Repeating the full suite after build/type work ended passed without
  increasing test timeouts or changing the recovery test.
- Full server: 444 passed / 12 existing skips; compatibility: 74 passed / five skips.
- Patcher: 51/51; Svelte/type diagnostics: zero errors/warnings; help-key check passed.
- Frontend and BG bundle builds passed; bundle load exposed sendChat successfully.
- Composition: 42 packs, 1,200 units, seven declared collisions. Re-plan: zero
  changed files. Exact revert: 1,022 baseline files with zero byte/mode mismatches.
- Installer: 5,710,968 bytes; SHA-256
  `ee5c89f4a0069e68671b58ade8161dfb3cc7a486f6b2ee500b854c1a36b15ce9`.

Initial loopback tests required the configured sandbox escalation. Build warnings
about dependency bundling and plugin time remain. Tests use synthetic data and no
paid provider calls. L3/L4 reviewed snapshot ownership, actual dispatch, refusal
settlement/publication, caller preservation and test/assertion quality.

## Consultation and remaining work

Plan consultation identified the missing fallback check and the post-attachment
recheck; both were confirmed in source and included. The proposed run-wide poison
guard is not adopted in this checkpoint: it needs a separate proof of how already
generated answers, input effects and partial results are retained. No new
per-call failure mechanism or raw admission expansion is claimed.

Final review found no blocking runtime defect. Its test-quality finding was
addressed by replacing a wrapper-to-resolver comparison with explicit expected
preset and binding-context assertions; the final focused batch passed 70/70.
Application code did not change after review. The extraction's exact source
anchor and the existing binding suite provide additional preservation evidence.

A setting rejection before transformation uses the existing G1.3 `blocked_edit`
record and pending-input UI, not a fabricated final reply. The SQLite owner test
covers the blocked predecessor/successor projection and release of volatile
settings. The UI preserves the raw input with an explicit retry action; its
generic conflict label does not distinguish a setting change from a chat edit.
Reason-specific notification remains part of G1.8. The post-attachment check is
deliberately conservative until input/main route qualification is split in the
next unit; prepared delegation remains outside that input-policy gate.

The next unit must qualify the input-phase preset/module/custom endpoint path,
dynamic calls, forced fallbacks and operation failure semantics. Plugin hosting,
plugin participation policy, N+1 UI, G1.12 remaining adoption/cancel behavior,
general durable notifications and full G1 qualification remain separate.

## Live delivery

Implementation commit `2848750` was pushed before live application. Preflight found
437 managed files without byte/mode drift and zero active requests, pending sends
or input commands. The process was stopped after the idle check. All five database
checkpoints and integrity checks passed. The new stopped application/database
archive is 3,025,442,093 bytes; all 1,605 regular files were read back and matched
against source hashes, lengths and modes. Existing backups were retained.

The ten-path plan was applied, frontend and BG bundle builds/load passed, and
re-plan returned zero changes. After restart, all 440 managed files matched their
recorded hashes/modes. Root HTTP and 17 entry/import/storage script assets returned
200 and matched local build hashes. All five databases passed quick_check; external
header settings were byte-identical. PM2 was online with zero unstable restarts.
Active requests, pending sends and input commands were zero; operation-state
records remained 148 before and after delivery.

Two new error-log lines belonged to the existing retained-journal and commit
recovery-stall categories. No retained record or user chat was deleted/restored.
The backlog remains separately tracked; this delivery is not its resolution.

Device preservation check: in an existing preset chat, send one ordinary message
without editing, close and reopen the app, and confirm one saved answer, a cleared
progress indicator and no context-change warning. This does not qualify newly
server-owned preset input, module/plugin execution or all earlier G1.3 scenarios.
