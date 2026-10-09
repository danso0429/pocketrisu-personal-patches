# G1.7 M6: mixed initialization evidence

2026-10-09 KST. Baseline `77012d6`, experimental.27 / adapter0.7.34. This checkpoint adds maintained probes and scoped evidence. Runtime source, installer, production activation and release version are unchanged.

The [qualification plan](POCKETRISU-G1-7-MARP-HOST-QUALIFICATION-PLAN.md) and ordered BG goals remain authority. M6 observations below do not close every M0–M7 condition, A1–A14, physical D1–D8 or G1.

## Original-source inventory and scope

A read-only canonical-storage extraction recorded six enabled API3 original scripts. Only script bytes and source metadata were retained in a private local inventory; actual arguments, credentials, configuration vaults and chats were not copied into the fixtures. Original source bytes were not rewritten. All execution used synthetic settings/storage/permissions and intercepted transports. Source hashes identify the evidence, not an execution allowlist.

Static AST discovery was cross-checked with actual browser/v3 RPC requests and successful responses, then actual OS-isolated server registration. Static call presence alone was not used to classify participation.

| Role in the inspected source set | Browser/v3 bootstrap | Server fixture | Boundary |
| --- | --- | --- | --- |
| UI plugin management | UI and unload registration | Load failure notice; no init network/write | Browser UI remains separate. This is not a supported server management API. |
| Periodic translation relay | UI registration and later character polling | Timer-driven call after load scope closes is blocked with `plugin_late_call` | No server relay qualification; no new ambient authority or duplicate translation worker. |
| Character-management UI | Settings registration | No request role/effect | UI callbacks are not invoked by the server. |
| Original MARP Lite0.9.2 | One beforeRequest hook and UI registrations | One beforeRequest hook; analysis3/main injection1 in stated fixtures | Synthetic settings, not current real-provider qualification. |
| PageFold | One provider and UI registration | Provider registered alongside MARP | Registration coexistence is not actual PageFold provider-execution qualification. |
| Display transform | One display handler | One display handler | A separate actual pipeline probe confirms display-only changes are not persisted or sent to the model. |

The browser baseline observes five setting and three button registrations. UI callbacks can contain request registration that never runs on the server: absence of such a registration cannot be inferred to be safe for arbitrary plugins. The maintained conditional-argument/root-storage probe checks two synthetic settings; it does not qualify all real settings or callbacks.

## Direct experiments

| Condition | Observed evidence |
| --- | --- |
| Each original separately, mixed six, and request/provider/display subset | Actual restricted child processes, original bytes; expected request/provider/display roles remain. Mixed six emits the two scoped load/late-call failures above; analysis3, one injection, init network0/root-local writes0 under the stated synthetic settings. |
| Expired saved grants | MARP and PageFold registration0, permission notices2, network/write0. Existing missing-permission checks also pass. No permission answer is fabricated. |
| Native classic and preset Send with mixed originals | Actual Chromium/v3 bootstrap, Send, inputCommandVersion1 and matching server ACK. Chrome is closed before held analysis is released. After release: analysis3/main1/injection1/user1/answer1. Original normal-chat HTTP returns stored answer and revision before browser return. |
| Different chats admitted concurrently | First analysis is held while second chat's real HTTP admission is acknowledged; a further2s observation remains analysis1/main0. After release analysis2/main2, one input/answer per chat and only two expected plugin-message notices. Each final main contains exactly its own chat-specific hook marker, not the other chat's hook. |
| Initialization effect before input-stage server loss | Actual server exit/restart: durable effect1, analysis/provider replay0 over a2s post-status observation, retry409/reason transform_outcome_unknown and status input-transform-unknown. |
| Initialization effect after input attachment, later failure/re-admission | Startup effect1, reused terminal result, provider replay0. |
| Display and process handlers through actual send/store path | Process marker reaches final model prompt but not persisted messages. Display marker reaches neither final model prompt nor persisted messages. |
| Partial initializer followed by healthy plugin | Network/root write remains committed; effectsMayHaveOccurred=true notice is awaited before following request. No rollback is fabricated. |
| UI callbacks, conditional roles, new operation and unload | UI callbacks issue no request/write. Synthetic argument changes alter registration. Initialization runs once in a host, again in a new operation. Unload writes are refused; prior load write remains. |

The per-server `_previewLock` is acquired before bundle/context/host setup and released after host close in the enclosing finally. The different-chat process experiment corroborates this source trace for the tested route; a finite observation window alone is not a proof of serialization. It does not qualify arbitrary alternate entry points or directly-created concurrent hosts sharing a registry.

## Cold-load/resource measurement

Five fresh mixed-host operations, after a sandbox positive control, used the same original identities and synthetic settings. Load includes serial spawn/bootstrap. Hook timing uses immediate fake-provider responses; it is not actual-provider latency.

| Measurement | Observed range |
| --- | --- |
| Mixed host load | 910.35–943.31ms |
| First request hook | 18.85–31.40ms |
| Close, including child teardown | 23.51–33.21ms |
| Loaded slice MemoryCurrent | 110,039,040–122,978,304bytes |
| Loaded slice TasksCurrent | 40, every sample |
| After close | TasksCurrent0, every sample; residual accounted memory3,260,416bytes or less |

MemoryCurrent is cgroup-accounted memory, not per-process RSS; TasksCurrent includes threads. Residual accounting is not described as zero memory. No cache, parallel loading, process lifetime or name-based filter was introduced from these measurements.

## Maintained protection and validation

- Host probes:33/33, including five new boundaries above.
- Session probes:5/5. The original fire-and-forget queued-write fixture could return its hook before the write reached the host and wait forever for a start signal. An independent log RPC now waits for the write-entered signal before hook return; the gate is released afterward. Existing writes0/failure-null assertions remain, timeout5s bounds the probe and cleanup releases the gate. This fixes fixture ordering, not production behavior.
- Sandbox probes:15/15, including loop/abort, Buffer memory, parent death, frame/queue limits and diagnostic containment.
- Patcher npm test:52/52 reported suites; no failures or skips in that run.
- Changed maintained scripts pass node syntax and git whitespace checks. Different-chat, display/process, crash-input and retry-after-attach actual process probes pass.
- Final Opus source review identified too-short process observation windows and unpinned crash-input outcomes. Different-chat observation now waits2s beyond ACK and checks expected notices. Crash-input asserts HTTP409, the exact reason and state, then observes2s before replay counts. The first new reason assertion confused the response reason with the status name; actual failure plus newly read owner source corrected it to transform_outcome_unknown without changing runtime or relaxing the assertion. Failed fixture artifacts are retained separately.
- Production patch units, frontend/backend source, installer and dependency versions are unchanged. Installer SHA-256 remains `9e2118219707a54d48c05fc3d807474c45e8e50753ab1cf73b45a70c82b95cf2`. No frontend rebuild, production apply/restart or new version is needed for this probe/document-only checkpoint.

The first restricted execution could not set the existing systemd sandbox budget; it was an environment failure before original-script execution, not plugin incompatibility evidence. The same existing OS sandbox succeeded through normal runtime escalation, without removing isolation. Those failed-environment artifacts remain separate.

Browser fixtures retain six SecurityError page events each and blocked external/bootstrap requests. Mixed classic records six denied server fetches and mixed preset records five through the interceptor. These runs establish the asserted role/send/store observations, not a clean production runtime or successful ancillary network activity. Private artifacts retain identities, source inventory, RPC observations, process runtimes and measurement results; original scripts and settings are not shipped.

## Remaining admission work

1. Close remaining M0–M5 route/PDF/format, OAuth/stream, setting-agent/prompt/deadline/interleaving, ACK-loss, cancel/new-next, worker/input-loss, edit/delete/two-tab and failure-display conditions according to the qualification ledger. Reuse same-source scoped passes instead of relabelling them as aggregate success.
2. Define support using observed API/permission/provider roles and effect lifetime. The current six-script synthetic mix does not qualify unknown plugins, UI-triggered registration, periodic relay execution, arbitrary real settings or PageFold model-provider execution.
3. M7/G1.5b admission code already exists. Revalidate its final caller and ON/OFF/provider boundaries against the qualified scope; do not recreate it or enable production merely because M6 mixed tests pass.
4. Actual provider, production activation, physical iPhone and aggregate/stable remain separate. G1.8/G1.9 → G1.10 → unchanged official AC/G2 order is retained.
