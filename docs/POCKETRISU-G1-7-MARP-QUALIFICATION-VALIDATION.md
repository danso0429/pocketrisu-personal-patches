# G1.7 MARP qualification evidence ledger

2026-10-09 KST. Foundation baseline `0f24c07` → `d2459fc`; current admission candidate `0.2.4-experimental.26` / adapter `0.7.33`. Apply the [post-implementation review criteria](POCKETRISU-MARP-BG-POST-IMPLEMENTATION-REVIEW.md). Scoped implementation and isolated experiments do not establish completed MARP BG, production activation, real-provider success, device qualification or a stable release.

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
| A6 | Unverified overall; scoped default-model Save→Send and queued-update passes | Actual original UI Save confirmation immediately followed by preset Send: both root model slots persist the new value; all3 server analyses use it. Queue N+1 while N world analysis waits; update default model through original UI and observe both durable root slots before release. N uses old model3times, N+1 uses updated model3times. Chrome exits; answers save before fresh-browser return. Agent/prompt/deadline/interleaving variants remain. |
| A7 | Unverified overall; scoped passes | Actual legacy and preset OpenCode/strict nativeFetch apply a synthetic per-chat HMAC rule to all3 original analysis calls; independent expectation matches and existing Authorization survives. Actual authenticated rule API. Real gateway success unverified. |
| A8 | Pass: isolated legacy/preset analysis and preset main-SSE browser-death conditions | Actual Send/ACK/input1;9Chrome processes stop. Analysis3/main1/block1/user1/answer1 before return, browseranalysis0. Combined OpenCode/strict/header/main-SSE also verifies committed receipt and decoded SQLite journal answer before fresh context. Device/real-provider variants remain. |
| A9 | Pass: isolated legacy and preset fresh-browser return conditions | Fresh context displays stored answer; analysis3/main1 unchanged, browser analysis0/replay0/page errors0. Additional ACK-loss/routes remain. |
| A10 | Unverified overall; scoped world/main cancel passes | Preset Send and Chrome exit after ACK: world cancel yields analysis1/main0/answer0; main cancel yields analysis3/main1/answer0. Release held transport afterward; no saved resurrection. Parallel/new-next/cold-return cases remain. |
| A11 | Unverified overall; scoped analysis/main server-loss passes | Original preset Send, Chrome exit, then isolated server SIGKILL/restart: input1/answer0, input-execution-unknown, new analysis/main calls0. Before restart world1/main0 or analysis3/main1. Worker-only/input-stage/notification UI remain. |
| A12 | Unverified overall; scoped original-MARP queue pass | Actual preset Send N, Enter N+1 and matched202 accepted; Chrome exits before N completes. Analysis6/main2/user2/answer2; N+1 final main contains N answer, one injection block per request, fresh return with replay0. Also passes queued model update. Edit/delete/anchor/two-tab/reroll variants remain; earlier generic evidence is not relabelled. |
| A13 | Unverified overall; scoped passes | Original expired saved grant refuses registration with durable notice. Actual server mixed original MARP+independent postprocessor completes/cleans up. Further mixed/cold/resource conditions remain. |
| A14 | Scoped checkpoint passes; aggregate open | Types0/0, fullfrontend2294/4existing skip, final fullserver500/12existing skip, compat74/5existing skip, patcher331. Late client fixes pass production build/47focused client/7unchanged caller seam cases; preclaim/capability subset18. Final42packs/1513units/7collisions/re-plan0/1022-file byte-mode exact revert. L3/L4 retain OFF/remaining surfaces; no delivery-ready/device verdict. |

All **D1–D8 unverified** for this candidate. CAP/G1.12b ordinary-use confirmations do not qualify MARP or a currently loaded device bundle. No real-provider call, user-generation cancellation, activation, tag or release was performed.

Browser-death controls stop the launched Chrome subtree; hiding/offline/API-only processes are not substituted. Earlier harness failures used incorrect ACK predicates; final controls follow the repository reconciler's started/accepted+operation identity contract. These harness corrections are not product regressions or passing evidence.

## Reproducibility and limitations

- `scripts/probe-bg-marp.cjs <target-root> <original-script> --native`: original real host/current nativeFetch/fake final transport/manual hook matrix; not outer retry/browser proof.
- `scripts/probe-bg-marp-bootstrap.cjs <target-root> <original-script>`: actual worker chain/deadline. Script bytes are not distributed.
- `scripts/probe-bg-plugin-host.cjs <target-root>`: actual OS-isolated host, SQLite notices, sync/async failures, late calls, cleanup, constructor effects and model cancellation.
- `scripts/probe-bg-plugin-diagnostics.cjs <target-root>`: actual SQLite cap/expiry/rollback/privacy and counter identity/abort behavior.

Native-wrapper, full normal-chat orchestration and browser death/return traces remain in the private local workspace. The native-wrapper fixture adds only an export to a separate test bundle and preserves imported bodies; it is not delivered. Its empty-request-trigger fixture logs an existing null/displayData condition while continuing; those logs are retained and not described as clean production runtime.

## Admission boundary and OFF continuation

The candidate waives only the native-v3 plugin exclusion when the remaining model/MCP/provider qualifications pass and live capability advertises valid bindings. No name/hash authority is introduced. Per-tab OFF makes0 extra admission reads; unknown/ON reads live capability before marker ownership. Second capability/configuration veto retains the draft with0 flush/start/marker writes. Claim and assembly independently check the eligible/bound host. Compatible server_host_unsupported / server_plugin_host projection uses effectsMayHaveOccurred=false and not_run/retryable before effects.

Fresh Opus5.5 review found two client gaps, corrected: an unknown hint reaches live verification on explicit server retry; changed selection during live capability read blocks before legacy fallback. Seven executions of the unchanged generated caller body cover OFF/ON/stale/read failure/selection changes. This seam harness does not qualify submit-owner or browser behavior by itself.

Actual hostOFF preset Send in both this candidate and preserved experimental.24 produced serveranalysis0/browseranalysis0/main1/injection0/page errors0. This is a reproduced pre-existing omission, not a candidate regression or proof of preserved browser participation. On2026-10-09 the user chose BG continuation with omitted-server-plugin name/version/reason warnings. Implement and verify that contract for full/legacy/classic/preset and explicit client-input recovery; do not change ON participation or silently drop a selected model provider. .26 alone has not implemented this decision.

Code review confirmed the shared binding/start predicate, operation-bound post-attach check and compatible pre-effect projection. The defensive post-claim assert does not establish a separate reachable safety boundary: initial assembly already rejects identical unsupported inputs. Constructor-wide failure conservatively remains execution-unknown/cancelable rather than automatic retry. Capability GET loads trusted bundle initialization only, not guest scripts; failure and recovery combinations remain to test.

## Remaining admission and delivery

The user's OFF choice is implemented in experimental.27/adapter0.7.34. See the [OFF continuation evidence](POCKETRISU-G1-7-OFF-CONTINUATION-VALIDATION.md) for original-script final caller/SQLite/return, legacy capability failure, explicit client-input recovery, warning-store failure and selected-provider failure/positive controls. .26 observations below remain historical; no overall A/D or activation pass is inferred.

Fresh Opus5.5 source review found no ON-path correctness defect in its inspected scope and identified missing maintained tests. Added actual generated preclaim cases (OFF, incomplete bindings, missing result ownership, ON), stopping before any fake successful claim, and actual capability callback cases (OFF, ON, missing bindings, load failure), asserting every unchanged field. Initial extraction included unrelated route code and omitted existing owner dependencies; corrected boundaries/dependencies and exact current fields without runtime changes or weakened assertions. Final fullserver500pass/12existing skip.

Factory exception injection preserves raw input, exposes input-transform-unknown, starts0analysis/0main, performs0automatic replay and is cancelable through existing coordinate-bearing DELETE. Notification visibility and every guest-crash variant remain unverified. Read-only current live metadata confirms six enabled plugins, all API3.0; their individual execution roles are not thereby qualified.

Installer:7,056,702 bytes, SHA-256 `10e494d9055dcb534de99c7917eee7356c10ff24b397e3aaf01aa0c1c84462b3`. Test-only native-caller export is absent from the production BG bundle. Original scripts and private fake-provider/browser traces are not shipped.

Production remains unchanged experimental.24/hostOFF. Candidate .26 admits qualified preset/plugin raw input only in controlled hostON tests. OFF behavior, complete queue/edit/delete/mixed-resource qualification, remaining failure/stream goals, final audits/review and safe delivery remain outstanding. Plugin-model/MCP and client output-only boundaries remain until separately qualified.

This ledger is updated with each observation; it is not an aggregate pass.
