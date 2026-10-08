# BG capability and pre-admission correction plan

2026-10-08 KST. Status: **planning only; BG implementation paused by the user**. Baseline is delivered experimental.22 (`ab14579`, documentation checkpoint `8240f77`). Preserve the uncommitted G1.12b candidate without shipping its generated installer. This plan adds a correction checkpoint after G1.12a and before G1.12b; it does not authorize immediate implementation, provider probes, live application or plugin-host activation.

## 1. Outcome and boundaries

Restore truthful capability negotiation and the existing eligible raw-input admission/explicit recovery paths. Preserve unsupported-route fallback, current provider/preset/module/plugin/MCP restrictions, user drafts and attachments, native strict-save/CAS protection, queue capacity and exact operation/draft identity. A successful capability response is not admission, and admission is not completed generation.

Do not claim that this alone makes client-prepared plugins finish after app termination. The inspected persisted configuration remains excluded by existing policy; this is not proof of the open browser's unsaved configuration. Plugin host remains OFF. Original plugin qualification and the pre-admission app-exit boundary remain in G1.7/G1.11/G1.5b. Recovery/navigation/Suggestion ownership remains G1.12b except for a narrowly reproduced dependency.

## 2. Established evidence

### Generated-code regression

The measurement candidate replaced an await expression with a multiline marked span after a return keyword. Automatic semicolon insertion returns undefined before consuming the body. Actual archived pre-measurement source consumed the body once; archived measurement source and current .22 consumed it zero times and returned undefined. This confirms introduction in .21 and persistence in .22, rather than inferring it solely from the manifest.

The current source is syntactically valid. A targeted TypeScript unreachable-code diagnostic detects the defect when explicitly enabled. A restricted-production scan found one matching return/marker/newline candidate across602 production TS/Svelte files; this scan does not exclude all other possible marker-boundary hazards.

### Controlled execution comparison

The actual .22 `tryRunServerOwnedInput`, admission/start reconcilers, ledgers and client binary codec were tested in an isolated copy. The comparison variant changes only the return expression in memory; it does not include G1.12b. HTTP, durable-save, hydration and UI leaves are controlled, and no provider is called. Fourteen selected cases passed on each variant; the final harness uses actual native generation-state ownership:

| Condition | Existing .22 | Return-only comparison |
| --- | --- | --- |
| Valid supported response and matching base | unsupported, no body/save/start | body consumed; strict save/base/projection/start reach accepted |
|404/incompatible contract | unsupported | unchanged |
|HTTP500 | capability-unavailable | unchanged |
|Successful response with invalid JSON | body not consumed; unsupported | capability-unavailable |
|Successful response with stalled body | body not consumed | bounded failure; late response does not start |
|Input-base body stalled | not reached | pending at120s simulated time; no start until released |
|Strict root save stalled | not reached | pending at120s simulated time; a changed selection prevents start after late completion |
|Two commands, then a third | unsupported | two accepted; third blocked by existing capacity |
|Start response lost | not reached | status confirms acceptance without a second POST |
|Concurrent raw reconciliation callers | separately reachable | repeated exact ACK is possible; not duplicate provider/completion work |
|Prepared capability body stalled, then native Stop | pending and native busy remains true at120s; POST0; releasing body finally releases owner without start | unchanged by return-only correction |
|Ordinary plugin-model input | excluded before capability | unchanged policy exclusion |
|Explicit client-preparation input | unsupported at capability | capability/admission reachable; claim/attach/provider completion not tested by this fixture |

The120s observation is controlled fake time, not network latency, frequency or a proposed timeout. Current raw start reconciliation's60s budget begins after preparation; it does not bound earlier save/input-base waits.

Prepared capability negotiation uses `capabilityResponse.json()` outside the existing bounded body helper and does not pass `arg.signal` into its control request. Its stop action aborts the native registered controller, but the body await does not observe that signal; cleanup runs only after the body settles. This was reproduced with actual native generation-state ownership, not a simulated busy boolean. The raw composer already displays a disabled admission spinner; the defect is an unbounded wait, not absence of all status feedback.

Three native NodeStorage/adoption interleavings also passed: newer-first preserves the newer view; older-first refuses a late adoption against a changed slot and needs reobservation; an intervening local edit preserves the edited object and refuses both reads. These tests establish storage-guard behavior, not full outer boot/raw/attach scheduling liveness.

The existing actual server route/owner tests for durable N+1, predecessor publication followed by edits and an unknown predecessor passed3 selected cases. Their server source hashes matched live. Test selection skips are not waived assertions.

### What the evidence does not show

- There is no proof that raw admission never ran historically or that .21/.22 device use qualified it. Retained state and current markers cannot establish that history.
- Classic cleanup clears classic statics/order/flight/heartbeat structures. Raw reconciliation does not produce those structures; global-clear plus two raw commands alone is not an established failure.
- Strict save and canonical reading also exist in the prepared path. No measured evidence establishes that raw is necessarily slower. Old unrelated save timings are not a baseline.
- A current persisted-policy exclusion does not prove every future configuration is excluded. Explicit client-input recovery has a separate capability-qualified caller.
- Local source/controlled tests do not establish iOS termination behavior or current loaded bundle state.

## 3. Control and preservation model

```text
policy gate
  unsupported -> existing preparation/delegation path
  eligible -> capability -> strict save -> input-base read -> projection
    preparation verified -> recovery marker -> POST/status reconciliation
      accepted -> server owns input; clear only the unchanged original draft
      rejected -> existing explicit rejection handling
      unknown -> retain identity/draft; never fall through to a second generation
```

The pending-input UI intentionally allows nonempty new input through its raw path before the replacement-generation guard. Preserve two-command queue semantics; do not replace them with a global recovery lock.

Before a POST can occur, a failed observation must leave no delayed path to model admission. After a POST may have occurred, failure is not evidence of non-admission: retain the exact operation and query status. An observer timeout cannot cancel a native persistence operation; it can only invalidate its later continuation. Navigation must not cancel already server-owned work.

## 4. Ordered correction units

### CAP-0 — evidence and baseline lock

- Freeze delivered source and keep the G1.12b WIP separate.
- Preserve archive-based before/after evidence and the isolated reproduction recipe.
- Keep confirmed benefits, normal preserved cases, refuted hypotheses and unverified boundaries distinct.
- Read-only configuration classification must use complete persisted chat settings, not just stubs, and state the browser/cache limitation.

### CAP-1 — repair the whole return and test generated behavior

- Change the maintained `recovery-read-units.cjs` anchor to encompass the return statement, adjusting exact occurrence counts/dependencies as required. Do not hand-edit the installer or live generated source.
- Exercise the actual exported caller with transport-level responses, not a mocked `readCapability` result. Cover valid accepted flow,404, incompatible response, HTTP failures, malformed/slow body, old marker and capability downgrade.
- Check the generated return AST and unreachable-code diagnostic; compare pre-existing full-tree diagnostics before extending a gate. The composer `markedBlock` adds a newline after START, so add a composer-level regression test and generated-output check for restricted productions/expression joins in supported compositions. Do not globally rewrite marker formatting without evidence of equivalent apply/revert behavior.
- Failure versus unsupported classification already exists in the client. Preserve it with assertions rather than adding a new policy layer. Successful malformed/stalled bodies become blocked relative to .22 because they are now read; HTTP/header failures already block.
- Never synthesize a hard-coded supporting capability, relax schema checks or convert read failure to unsupported to make tests pass.

### CAP-2 — bound response bodies and connect prepared cancellation

- Keep existing15s control-header and30s capability-body budgets. Use the existing abortable read mechanism for the original input-base binary body; do not clone/tee or double-fetch it. A30s binary-body limit is an initial validation candidate, not a proven device percentile.
- Include decode and post-read validation in the continuation boundary. JavaScript timers cannot preempt synchronous work or a suspended page; timed-out body completion must not later write an admission marker or POST. This intentionally changes the observed delayed-base behavior (late bytes currently resume admission).
- In prepared negotiation, connect the existing `arg.signal` to control headers and original body consumption, and use the existing bounded JSON reader. Stop during headers/body must release the exact preparation owner and reach no model POST.
- Preserve the different caller contracts: raw capability read failure remains blocked; prepared rolling/unavailable capability retains its existing legacy-ownership fallback unless the caller was aborted. Do not unify these policies or make timeout imply that a model generation failed.
- Explicit compatibility change: an un-aborted prepared body timeout will continue through legacy ownership after the bound, whereas .22 waits indefinitely and may eventually negotiate v1. Compare that start payload with the existing header-failure/HTTP500 fallback, excluding newly generated identities. Do not silently turn the prepared timeout into a raw-style block.
- On raw body timeout, the existing caller finally must release admission busy and use its existing blocked notification while preserving drafts/attachments. On prepared abort, preserve cancellation handling without an erroneous resend/failure notice.
- **Conditional follow-up, not a required new timeout:** shared hydration/strict-save observation. Stalled-save behavior is confirmed, but a new global or per-save timeout policy is not justified by this experiment alone. Further investigation must measure the actual save path, preserve native serialization/CAS, and fence any late observer before proposing such a change. Do not claim that a timed-out observer cancels persistence.

Keep raw binary-body and prepared capability/cancellation changes in separate implementation commits for exact revert. Required targeted gates:

1. Prepared Stop before headers and during body releases the exact native preparation owner/stage without waiting for the15s/30s budget, returns handled cancellation and sends no POST. Releasing a late response has no effect.
2. Prepared body timeout without caller abort takes the existing legacy negotiation-failure path once. Normal capability still negotiates v1 once.
3. Raw binary-body timeout returns canonical-chat-unavailable, releases the caller's admission busy and preserves the draft. Late bytes cannot start or mutate a new attempt.
4. No broad generation/Suggestion busy change is necessary unless the shared-path regression gates reproduce a dependency.

### CAP-3 — regression gates, not additional feature implementation

- Keep existing operation/draft IDs, marker-before-start, status reconciliation and queue limit.
- Test lost start responses, late status, duplicate same-draft attempts, accepted/blocked/unknown outcomes and selection/slot replacement.
- After uncertain POST, no classic fallback, automatic resend or replacement operation without authoritative non-admission evidence.
- Verify explicit client-preparation recovery separately from ordinary provider eligibility. Do not bypass provider or host rules merely because the protocol capability is present.

#### Shared-path interleaving gates

- Run raw admission during an older classic boot probe; verify new input and old paid result remain recoverable.
- Run raw and boot adoption against the same target, both completion orders, with local edit and save-in-flight cases.
- Run explicit attach recovery and mounted pending-input refresh concurrently for the same marker.
- Assert preserved content, eventual valid reconciliation, exact delivery identity, no provider replay and no duplicate completion effects. Repeated idempotent reads/ACKs are allowed; request-count1 is not a general correctness condition.
- If a defect is reproduced, include only the necessary shared protection. Otherwise keep broad busy/navigation/Suggestion work in G1.12b; do not assume either blanket independence or mandatory aggregation.

#### Qualification and later delivery

- Actual generated call/endpoint tests, focused and affected full client/server/compatibility tests, type/help/build/load, patcher graph/re-plan0/exact revert, privacy sweep, L3/L4 and read-only Opus review.
- Before any later live restart, inspect both ordinary active work and raw pending input; preserve process-local settings contexts by waiting for a safe state. Back up and verify source/state, then read back served assets, DB integrity and preserved settings.
- Device checks must identify which route was actually exercised. Normal answer display does not prove raw admission or cold recovery. Do not force changes to a user's model/plugin settings or paid fault injection solely to satisfy coverage; report unreachable device cases and retain their qualification boundary.
- With existing settings, prepared ordinary send/Stop/subsequent send can be checked for preservation. Synthetic controlled stalls cover the fault itself; do not ask the user to manufacture a hanging response on the phone. Raw device qualification remains unclaimed without an eligible configuration and explicit authority for any paid test.
- Stable/aggregate gates remain unchanged. Implementation and delivery wait for a subsequent user direction; completion of this plan is not that authorization.

## 5. Entry/exit and overall order

Current activity ends with an evidence-reviewed plan, preserved diagnostics and coherent ordered-goals/handoff records. G1.12b implementation stays paused. On later implementation authorization:

**G1.12a delivered → capability/input-admission correction CAP-0…CAP-3 → G1.12b → G1.7 + G1.11 → G1.5b → remaining G1.8/G1.9 → G1.10 → G2.**

The correction stage can be internally split into small commits for regression isolation. Whether a shared ownership change is included is decided by the CAP-3 interleaving evidence, not by file proximity or the apparent size of a syntax fix. Unconfirmed G1.12a device scenarios remain recorded and are not promoted to passes.

## 6. Planning review

Read-only Opus5.5 review was reconciled with direct code and controlled execution. The revised plan adds composer-level recurrence checks and the independently reproduced prepared-body cancellation gap; it removes a mandatory shared-save timeout and treats interleavings as regression gates rather than new feature work. The raw blocked/prepared legacy asymmetry and timeout-induced legacy negotiation are explicit. The advisor did not run tests; consultation does not substitute for implementation or release gates.
