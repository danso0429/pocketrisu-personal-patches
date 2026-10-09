# MARP protocol checkpoint and host-limit correction

2026-10-09 KST. Baseline94694ec; candidate0.2.4-experimental.28 / adapter0.7.35. This is scoped M0–M5 evidence and a generic host correction, not completed M7, production activation, actual-provider success or G1/device/stable qualification.

## Reproduced defect and behavior

An actual OS-isolated synthetic plugin caught the refusal of a4MiB nativeFetch payload. The host started0 external calls/effects, emitted0 notices, and a later small call succeeded. `measurePluginValue` can throw plugin_value_limit before byte charging; aggregate pending bytes, write/network quotas can throw plugin_budget_exceeded. The latter was deliberately excluded from entry disable, while pre-measure errors were outside that catch. A plugin could absorb both and leave the host-observed limitation invisible.

The host now reports these two API-limit error codes using the existing plugin_host_limit/operation_budget contract, then preserves the original rejection. It retains a recoverable plugin and permits later valid calls; caps, permission/binding checks, effects and retry/fallback are unchanged. Charged bytes and work slots are released before awaiting publication. Concurrent refusals in one entry/phase await the same notice promise. Its immutable event key is distinct from a later terminal entry failure. API refusals also use a separate receipt identity domain, while every existing terminal failure group key is retained; a warning cannot consume the terminal resource-failure receipt.

The existing event key distinguishes API-refusal wording from a terminal plugin-stop message. No enum, schema or new namespace was added. Existing v2 clients still parse the event but can retain previous wording until reload; v1-only consumers retain their existing exclusion of v2 host-limit events.

Publication remains mandatory: exceptions, invalid responses or capacity cause the existing notification-unavailable operation failure. This deliberately makes a formerly silent refusal visible or fails safely instead of silently continuing without a notice. Input/effects remain protected by the existing owner. Same-entry/phase coalescing is supplemented by the existing48-hour cross-operation failure receipts; it is not a promise of one toast for every refusal. Effects metadata describes the first reported refusal, not all later activity.

## Protocol matrix

`scripts/probe-bg-marp-protocol.cjs <target-root> <byte-original-script> [case-index]` runs the original script through the actual OS-isolated host and current nativeFetch adapter. Target dependencies provide PDF.js4.10.38; no production dependency or original plugin is changed. Synthetic credential/model/storage and a fake final fetch cover every outbound request. Validation faults are collected independently so the original plugin swallowing an assertion cannot turn an error row into a pass.

Observed35 rows contain216 validated analysis endpoint records and5 synthetic OAuth calls. Deliberately failed direct attempts used to force proxy are separate from those records; native direct/proxy retries are not described as extra analysis invocations. All finish with a second normal invocation, verified agent notes and exactly one injection block when applicable.

| Axis | Conditions and predicates |
| --- | --- |
| Body families | OpenAI-compatible, Anthropic, Gemini and Vertex × off/quality/standard/max; OpenCode max alias. Exact URL, POST, content type, provider headers, body/MIME family, selected agent and text input preservation are asserted. |
| PDF | PDF must actually be present for enabled modes. Independent PDF.js validates the document and extracts the synthetic input marker; magic, xref/EOF and MIME are also checked. No-PDF fallback cannot masquerade as PDF success. |
| Proxy | Four max-PDF family rows deliberately fail the direct transport to exercise native /proxy2 fallback. Decoded forwarding headers and binary body match the failed direct request exactly. Merely disabling usePlainFetch does not force proxy: source and failed fixture observations established native direct-first behavior. |
| Legitimate PDF text retry | Only plot receives PDF-unsupported400/415/422. Its retry contains no PDF, other agents retain PDF, and invocation calls are3+1. This is original-plugin retry, not host-added replay. |
| Negative retry controls |401/429/500 and transport refusal do not trigger PDF-to-text retry. A transport refusal still uses native direct→proxy; those wire attempts are counted separately from API-level diagnostics. |
| Reply failures | Invalid JSON, unrelated200 schema, empty200 and an errored200 body stream produce no first-attempt note; partial400 retains other notes in lenient mode and suppresses all notes in strict mode. Next invocation succeeds. Body-stream error is synthetic, not proof of real TCP Content-Length truncation. |
| OAuth | Throwaway RSA keys exercise the original Vertex signing/cache path. The fake endpoint verifies the RS256 signature and iss/aud/scope/expiry interval. With one shared account and a3600s token, two three-agent invocations assert one token call, matching the inspected original cache path. This fixture invariant is not a general provider or browser-cache equivalence claim. Keys/assertions/tokens are not emitted. |
| Reserved extra body | Extra messages cannot replace the synthetic input; original PDF downgrade semantics are recorded rather than overridden. |

The server worker uses the original inline PDF fallback; actual browser Worker/PDF equivalence, large-document CPU/frame limits and real-provider behavior remain unqualified. Provider HTTP or private semantic failure does not imply host disable: the original can absorb it. Header-class diagnostics do not prove usable analysis or body completion. The synthetic corpus does not qualify every prompt/PDF corpus, endpoint, agent setting or provider variant.

An ancillary asynchronous /api/logs flush initially looked like an analysis request. Source tracing identified it as the application console collector; the fake endpoint now handles explicit log/control routes separately. An initial proxy premise and negative-network count were corrected against native source without weakening PDF/content assertions. Failed fixture logs remain private.

## Verification

- Actual host40/40: caught value limits, aggregate pending-byte concurrency, one stored notice, preserved small calls, distinct warning/terminal events including the same resource code/phase/effects, write quota/load phase, publication exception/capacity and existing permission/cleanup/provider protections.
- Actual process budget-api: input1/answer1, main1/analysis1, two expected notices; limit notice phase=input/effectsfalse. This exercises real HTTP/SQLite/normal-chat storage, not an in-memory successful receipt.
- Actual Chromium sees the new limit wording through normal notification delivery, provider calls0/page errors0, using synthetic storage and no enabled plugin.
- Session5/5; patcher npm test52/52; frontend2296/4existing skip; server515/12existing skip; compatibility74/5existing skip; type errors0/warnings0; frontend and BG bundle build/load pass. Focused storage15 and client7 pass.
- Graph42packs/1526units/7collisions, re-plan0; pristine1022-file byte/mode exact revert. Native .27→.28 plan contains only the host, notification formatter and patcher-state paths. No activation flag is changed.

The first full build/check was interrupted by an execution-environment restart; its partial logs are not passes. Both were rerun to completion. The ephemeral input fixture disappeared, so the process probe resumed from the retained synthetic fixture. A first parallel-budget test released its held request too early; an explicit refusal-completion barrier fixed the fixture while preserving issued/refused assertions. A version assertion was updated exactly to0.7.35, not removed. Final review exposed receipt coalescing between a warning and terminal resource failure, reproduced as one notice instead of two. The identity-domain correction and preserved legacy key are tested. An initial test used a v1-only consumer for v2 events; it now asserts that exclusion and separately verifies the v2 consumer. A concurrent full run overlapped test updates and its existing capacity test exceeded30s; frozen full server subsequently passes and isolated storage15 completes. Follow-up review confirmed the correction; notice suffixes are compared as a set rather than millisecond order, and the probe now pins fixture OAuth reuse and exact proxy counts. Host40/protocol35 reruns pass. Existing KaTeX/build and frontend loopback connection warnings remain recorded; clean runtime is not inferred.

## Remaining work

M0–M5 settings-agent/prompt/deadline/interleaving, original browser PDF Worker parity, large-content/resource/cancel timing and any remaining caller conditions must be closed according to the ledger. M7 must qualify final admission/activation conditions against that support scope. Actual provider, iPhone D1–D8 and G1 aggregate/stable are separate. G1.8/G1.9→G1.10→unchanged official AC/G2 order remains.

Delivery is pending final source review at this checkpoint. Production remains hostOFF; no activation is implied.
