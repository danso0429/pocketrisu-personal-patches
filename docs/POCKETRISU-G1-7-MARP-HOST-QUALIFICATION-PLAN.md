# G1.7 MARP host qualification and G1.5b admission plan

Post-implementation handoff: [MARP BG verification and review criteria](POCKETRISU-MARP-BG-POST-IMPLEMENTATION-REVIEW.md) defines evidence requirements, automated scenarios and iPhone checks for the completed implementation. It supplements this plan without changing the ordered goals or recording a qualification pass.

2026-10-09 KST. Initial planning baseline4bce464 / experimental.24 / adapter0.7.31. Current scoped implementation and isolated evidence are recorded in the [qualification ledger](POCKETRISU-G1-7-MARP-QUALIFICATION-VALIDATION.md); that ledger does not declare full MARP BG or production activation. The ordered BG goals remain execution authority.

## Direction and existing foundation

Run the unchanged MARP Lite script in the generic isolated server host. Preserve one process per plugin per operation through input, analysis/ax, main and postprocessing. Keep configuration UI in the browser, parent-owned API/RPC/network/storage and saved permissions, and existing custom/provider/model behavior. Do not replace Lite with Full or reimplement MARP as a dedicated backend.

G1.6's default-OFF host and G1.11 header infrastructure are implemented. Native adapter/header-context source wiring is present; original-script behavior through the final caller is not qualified. Browser /proxy2 already uses enabled destination rules with a fallback session identity; server execution adds per-chat HMAC context and whole-pipeline ownership. Header error removal does not prove successful analysis. Existing individual-request and prepared-main preservation is not described as absent merely because raw plugin input remains unqualified.

Source evidence includes a preserved Lite0.9.2 script of64022bytes, SHA-256b1aa573048ea31ec036e21fd9df9f1a35d136435e247f15c3cdaa6026cd8e132. This is historical source identity, not a current installed-hash check or execution allowlist. Earlier browser/prototype comparisons and synthetic host tests are starting evidence, not qualification of the current source/caller/device.

## Qualification sequence

The sequence below remains the execution plan. Initial consultation performed no experiments; subsequent scoped results and remaining conditions are recorded separately in the qualification ledger. Use synthetic credentials/providers and isolated application storage while production remains OFF.

| Stage | Experiment | Required evidence |
| --- | --- | --- |
| M0 | Record current original source and reachable API/global/role paths | Preserve original bytes, version and identity; follow aliases/dynamic registration. Distinguish request hooks, UI-only paths and original fallback behavior. Unknown properties are callable in both native and server Proxies, so typeof checks alone are not support proof. |
| M1 | Byte-original bootstrap in the current host | Exact hook/unload registration, awaited/causal initialization completion, quiet-boundary behavior and late calls. Original top-level initialization is not awaited; do not infer readiness from evaluation alone. |
| M2 | Actual browser host versus current server bindings and final transport | Main/sub, retry and fallback with synthetic analysis providers. Compare final requests, injection and configured agent selection. A fixture enabling all three agents expects three analysis calls on a normal attempt and native-equal calls on retry, with a single injection block. Keep main, analysis and OAuth/network counts distinct. |
| M3 | Slow headers, slow body/stream, plugin timeout and operation cancellation | Actual native error shape, notifications, scope/handle cleanup, entry.failed and next retry/fallback behavior. Returned streams can retain authority until drain/cancel/close. Demonstrated loss of a later normal attempt must be corrected before admission expansion. Transport abort is not proof of provider cancellation or refunded charges. |
| M4 | Immediate settings save/send and queued updates | Follow actual v3 aliases: MARP pluginStorage mutates root pluginCustomStorage; arguments mutate the same root's plugins[].realArg. getLocalPluginStorage is a different KV path. Trace UI completion, both mutations, send/strict root flush, admission capture and execution. Fresh reads or the original saved confirmation alone do not prove durability/coherence; test queued/retry capture separately. |
| M5 | HTTP400, refused connection, empty-success and partial-success | Separate host failures, transport outcomes, swallowed plugin-private failures and loss of private diagnostic history. Record user-visible differences before deciding diagnostics scope. |
| M6 | Expired saved grants, mixed enabled plugins, initialization effects and cold start | Refusal/notification without fabricated permission; UI-only and multiple-plugin behavior, actual registration/participation, resource costs and effect ownership. Measure launch/load and response-start latency before changing lifetime, caches or filtering. |
| M7 | Request-specific admission and delivery | Use qualified API/permissions, actual binding/provider/roles and effect/replay boundaries. Retain normal custom/local routes and native retry. Revalidate composition, tests, audits and safe delivery; real-provider/device/aggregate gates remain separate. |

## Behavior contracts to preserve

- Native request retries/fallback invoke beforeRequest according to native semantics. MARP can repeat analysis and remove its previous injection block. Prevent extra host-induced execution rather than suppressing legitimate native retries.
- Current source observation found no Risuai.log/alert calls in the inspected MARP request path, and setters are in UI/preset/connect paths. Do not implement log/CAS fixes based solely on generic-host possibilities. Verify any new version or demonstrated difference independently.
- UI DOM and guarded PDF Worker/Blob code are not automatically hook requirements. Extend only evidenced APIs/globals; preserve legitimate original fallbacks instead of adding blanket browser emulation.
- The server loads once for an operation and observes actual APIs, permissions and registered roles. Client participation summaries may be optional warning hints after measured need, not authority. Unknown/stale hash alone must not reject a request or become an allowlist.
- Track script/context changes under the existing operation identity/effect lifetime; do not mix incompatible contexts or repeat initialization. Load-before-main does not imply load-before-paid-effects: arbitrary scripts can call nativeFetch or storage during initialization. Qualify the pre-effect/admission boundary and prevent rejection followed by client replay after effects.
- Transformation failure preserves the prior chain value and reports a host-observed failure. A plugin that supplies the model cannot simply be dropped while pretending the request succeeded; retain native model failure/retry/fallback handling.

## Failure visibility and diagnostics decision

The original MARP hook can catch analysis errors and return cleaned messages. Its history/lastRun are private memory; a completed callback therefore does not prove successful analysis. With per-operation processes, those server-side records are not automatically transferred to the existing browser MARP diagnostic panel. Configuration UI preservation is a different promise.

1. **Host-observed failures:** load/crash, permission, unsupported API, resource limits, disabled entry and provider-role failures use the existing notification contract.
2. **Transport facts:** status class, network failure, abort and duration can be observed independently of business success.
3. **Plugin-private semantics:** empty/refused/partial analysis, intended injection and swallowed errors cannot be reliably inferred by a generic host without cooperation.

Reject an all-failed-fetch plus unchanged-output success/failure heuristic: valid probes may fail, HTTP200 may contain unusable output, and MARP can remove an earlier block even when analysis fails. Do not add plugin-name or marker-specific exceptions, rewrite scripts, or claim semantic completeness from a transport summary.

After M5, decide whether a generic parent-owned per-operation RPC outcome summary provides sufficient user value. Candidate fields are registered roles, completed hooks, API call counts, status class, fixed network/abort classification and duration. Exclude URLs, bodies, argument values, credentials, conversation keys and secret-derived hashes. Define retention, bounds, access and display only if the feature is selected. An optional diagnostics view is a proposal; this planning update neither implements it nor authorizes a claim that it reconstructs MARP's private history or catches every semantic failure. Document the remaining visibility limit and resolve necessary user-result choices before G1.5b.

## Gate boundaries and remaining work

Terminology clarification (2026-10-09): use “서버 플러그인 실행기” in user-facing explanations for the server plugin host. This does not rename internal identifiers. Current startup attempts all enabled plugins that meet loader conditions, rather than selecting only MARP or proving each plugin requires server execution. Before production activation, M6/M7 must resolve initialization side effects, UI-only plugins and duplicate browser/server participation. MARP-only selection was discussed as a possible direction, not adopted as an execution allowlist or a confirmed implementation decision.

Current host implementation, source inspection and reviewer agreement do not permit production activation or unqualified admission. Keep real-provider analysis separate from fake-provider qualification and use the established authorization boundary for the actual paid analysis run. Physical iPhone, process-death/return, queue/edit/notification and G1 aggregate/stable remain independent evidence.

G2 later evaluates unchanged official Archive Center and its listener/state/backend requirements. Prior prototype loading is not current-host compatibility; do not add AC scope or restore old modified-AC assumptions during G1.7.

The next action is M0→M6 qualification and correction of demonstrated gaps, then M7/G1.5b. Cold-start costs and private diagnostic loss are measured/recorded tradeoffs, not grounds for an unmeasured process-lifetime redesign.

## Next scoped experiment after experimental.28

2026-10-09: protocol35, mixed initialization and the API-limit correction have scoped evidence; the user reports ordinary requests as normal. Reuse those stated passes. The proposed first remaining unit is M4 settings freshness, followed by remaining M2 browser/PDF and M3 large-content/cancel conditions, then M7. This prioritization does not change the user-visible contract or authorize production activation.

1. Reuse the original UI default-model Save→Send and queued-model-update passes. Add agent enable/disable, per-agent overrides, system/user prompt templates and request/analysis deadlines using synthetic providers.
2. Trace UI completion→pluginCustomStorage vault and plugins[].realArg→strict root flush→admission/assembly→actual analysis/model input. Assert the intended precedence and coherent captured settings, not merely a fresh read or the original saved toast.
3. Hold N, save changed settings and enqueue N+1; record the main assembly view separately from MARP's live per-hook vault/argument reads. Include writes interleaved with save/send and native retry; do not infer an operation-wide MARP settings freeze from the assembly snapshot or change timing based on an assumed mismatch.
4. Deliver a settings/evidence table linking each operation, captured settings, selected agent calls, final injection and normal-chat storage. Correct only reproduced generic-host/caller defects, preserving original plugin bytes, custom/local endpoints, permissions and native retry.
5. Keep browser Worker versus server inline PDF, large-payload CPU/frame/cancel behavior and remaining caller/ACK/edit/delete conditions explicit. M7 then qualifies the implemented admission/final caller and activation conditions against the demonstrated scope. Actual provider and physical device are separate gates.

2026-10-10 scoped checkpoint: [M4 settings evidence](POCKETRISU-G1-7-M4-SETTINGS-VALIDATION.md) adds eleven maintained synthetic scenarios through the unchanged original UI/server Send and an actual native-v3 hook comparator. Agent selection/cleared overrides/templates, Save→Send/strict flush, queued latest settings, native retry rereads and small configured deadlines/next-normal pass. A controlled concurrent read yields old vault/new arguments in both hosts; this preserves original per-key behavior and does not establish atomic settings epochs. Runtime remains experimental.28/hostOFF. The next isolated unit is remaining M2 browser Worker/PDF parity and M3 large-payload/cancel behavior, then remaining caller/identity and M7 conditions; this is not full M0–M6 or activation completion.

Later2026-10-10: [PDF/proxy checkpoint](POCKETRISU-G1-7-PDF-PROXY-VALIDATION.md) establishes the stated native-v3/server PDF scope and original large/cancel/refusal cases. Actual Chromium product CSP selects inline fallback; a separate permissive Worker control is not product qualification. Generic form forwarding and local RPC refusal gaps are corrected without original rewrite, cap changes or host activation. Continue with remaining role/identity/argument-epoch/caller admission conditions before M7/G1.5b activation; other failure/stream and provider/device/aggregate gates remain distinct.
