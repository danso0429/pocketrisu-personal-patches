# G1.7 MARP qualification evidence ledger

2026-10-09 KST. Work in progress against baseline `0f24c07`; candidate `0.2.4-experimental.25` / adapter `0.7.32`. Apply the [post-implementation review criteria](POCKETRISU-MARP-BG-POST-IMPLEMENTATION-REVIEW.md). This ledger records a scoped foundation and isolated experiments, not completed MARP BG, production activation, real-provider success, device qualification or a stable release.

## Source and changes

Read-only installed-source extraction confirmed Lite0.9.2: 64,022 bytes, SHA-256 `b1aa573048ea31ec036e21fd9df9f1a35d136435e247f15c3cdaa6026cd8e132`. Original bytes execute in the generic worker. Production has no MARP name/hash/marker branch; hashes identify evidence, not an execution allowlist.

- Already-issued request cleanup no longer becomes a false late-API notice. New calls arriving after expiry remain blocked and reported.
- Observation preserves synchronous binding throws, response/error identity and response bodies. The original disabled-entry boundary is retained.
- `runLLMModel` passes its operation/invocation signal to native `requestChatDataMain`'s actual third argument. The real transport remained un-aborted before the fix despite callback rejection; the same native experiment observes abort afterward. This is not provider-stop/refund evidence.
- One final parent-owned summary per network-using plugin entry is recorded on close or constructor cleanup. Counters cover nativeFetch/risuFetch/model API boundaries, not underlying proxy retries. HTTP status is a header fact; body completion, private history and semantic success are not inferred. Existing RPC erases guest abort reasons, so no fabricated timeout counter is shown.
- Separate namespace `internal/bg-plugin-transport/v1/`, 256-row cap, 48-hour retention, transactional writes and authenticated read-only/no-store endpoint. Diagnostic and warning-output failures cannot change generation outcomes. Backward-clock future rows are hidden but retained. Older adapters ignore this namespace; future incompatible formats require a new namespace.
- Collapsed panel: Settings → System → Request Logs → server plugin diagnostics. Existing notification schema, claim/ACK and toasts are unchanged. Process loss before close can lose summaries; pending means API/header return is unresolved at snapshot, not unfinished body count.

## Settings premise corrected

The actual v3 alias chain is `_getAliases.pluginStorage` → `_setPluginStorage` → oldApis.pluginStorage → root `pluginCustomStorage`. setArgument mutates the same root's `plugins[].realArg`. SafeLocalPluginStorage's awaited persistent KV belongs to getLocalPluginStorage, not MARP's pluginStorage.

Original “settings saved” confirms UI/API completion, not server durability. Actual browser confirmed Save→Send was observed first with the old persisted vault, then both new vault/model-argument values in SQLite. The caller's durable root-save barrier is traced, but operation capture/execution, interleaving and queued/retry timing require separate evidence. Closing before confirmation is not a confirmed update.

## A1–A14 ledger

Status applies only to the stated condition. A scoped pass does not close the full criterion.

| ID | Status | Observed evidence / remaining scope |
| --- | --- | --- |
| A1 | Unverified overall; scoped passes | Actual worker original chain: onUnload→beforeRequest→setting→button. Registration delay0/50/2,000ms completes;16,000ms exceeds the real15s load deadline. Actual native caller covers distinct overrides, one disabled agent and all OFF. |
| A2 | Unverified overall; scoped passes | Unchanged actual native loop and full legacy server fixture deliver distinct world/plot/character notes to final main with one block. Full route/PDF/format matrix remains. |
| A3 | Unverified overall; scoped passes | Actual wrapper normal analysis3/main1; retry6/main2; explicit native fallback6/main2, one block per main. Invalid initial empty-fallback fixture corrected against normalization without production fallback edits. |
| A4 | Unverified overall; scoped passes | Actual nativeFetch/host slow headers/body: no injection, next invocation still3 calls. False cleanup notice fixed; true late call blocked. Actual model API transport cancel fixed. OAuth/stream/resource extremes remain. |
| A5 | Unverified overall; scoped passes | Actual native final main: lenient partial notes, strict no-injection, allOFF,429/503 no-injection. Native/host boundary also covers400/refused/empty200. Empty200/body-timeout is not semantic success. PDF/malformed variants remain. |
| A6 | Unverified overall; scoped passes | Original browser settings opens; confirmed Save→Send updates both actual server root model slots. HostOFF in this settings fixture, so analysis with these settings and queued/interleaved capture remain. |
| A7 | Unverified overall; scoped pass | Actual full server legacy nativeFetch applies synthetic per-chat HMAC to all3 original analysis calls; independently derived expectation matches. Real gateway success remains unverified. |
| A8 | Pass: isolated legacy analysis-stage browser-death condition | Actual app Send, matched server started ACK, nine Chromium processes stopped; server analysis3/main1/normal-chat answer1 before browser return, browser analysis0. Main-stage/preset/device/provider conditions remain. |
| A9 | Pass: isolated legacy fresh-browser return condition | New browser context displays stored answer; analysis3/main1 unchanged, browser analysis0/replay0. Additional ACK-loss/routes remain. |
| A10 | Unverified overall | Generic cancellation and actual model transport are foundation evidence, not the original-MARP world/parallel/main/no-resurrection matrix. |
| A11 | Unverified overall | Constructor cleanup/earlier generic process tests do not replace exact original-MARP restart and worker-loss cases. |
| A12 | Unverified overall | Retain G1.4/CAP/G1.12 evidence without relabelling it MARP queue/edit/delete qualification. |
| A13 | Unverified overall; scoped passes | Original expired saved grant refuses registration with durable notice. Actual server mixed original MARP+independent postprocessor completes/cleans up. Further mixed/cold/resource conditions remain. |
| A14 | Work in progress | Type0/0, frontend2,288/4 existing skips, server490/12 existing skips, compatibility74/5 existing skips; later targeted checks/rebuilt UI recorded separately.42packs/1,492units/7collisions, re-plan0,1,022-file byte/mode exact revert. Final audits/review/delivery identity pending. |

All **D1–D8 unverified** for this candidate. CAP/G1.12b ordinary-use confirmations do not qualify MARP or a currently loaded device bundle. No real-provider call, user-generation cancellation, activation, tag or release was performed.

Browser-death controls stop the launched Chrome subtree; hiding/offline/API-only processes are not substituted. Earlier harness failures used incorrect ACK predicates; final controls follow the repository reconciler's started/accepted+operation identity contract. These harness corrections are not product regressions or passing evidence.

## Reproducibility and limitations

- `scripts/probe-bg-marp.cjs <target-root> <original-script> --native`: original real host/current nativeFetch/fake final transport/manual hook matrix; not outer retry/browser proof.
- `scripts/probe-bg-marp-bootstrap.cjs <target-root> <original-script>`: actual worker chain/deadline. Script bytes are not distributed.
- `scripts/probe-bg-plugin-host.cjs <target-root>`: actual OS-isolated host, SQLite notices, sync/async failures, late calls, cleanup, constructor effects and model cancellation.
- `scripts/probe-bg-plugin-diagnostics.cjs <target-root>`: actual SQLite cap/expiry/rollback/privacy and counter identity/abort behavior.

Native-wrapper, full normal-chat orchestration and browser death/return traces remain in the private local workspace. The native-wrapper fixture adds only an export to a separate test bundle and preserves imported bodies; it is not delivered. Its empty-request-trigger fixture logs an existing null/displayData condition while continuing; those logs are retained and not described as clean production runtime.

## Remaining admission

Production host remains OFF. Native preset/module/custom routes with enabled plugins retain client-prepared admission. G1.5b must establish live server capability, one executor per hook per attempt, settings capture, saved permissions/actual APIs/roles, single init and no client replay after effects. Unknown/stale script hashes cannot gate admission. Plugin-model/MCP and client output-only boundaries remain until separately qualified.

This ledger is updated with each observation; it is not an aggregate pass.
