# BG capability and pre-admission correction plan

2026-10-09 KST. Status: **CAP automatic implementation, validation and live delivery complete; physical-device/aggregate gates remain open**. Baseline is delivered experimental.22 (`ab14579`, documentation checkpoint `8240f77`). The user subsequently requested executing the full CAP plan, including normal verification and safe delivery. Preserve the uncommitted G1.12b candidate without shipping its generated installer. Earlier planning-only boundaries below record the preceding stage; this authorization covers CAP, not G1.12b implementation, paid probes, plugin-host activation or stable release. See [the execution and delivery record](POCKETRISU-BG-CAP-ADMISSION-VALIDATION.md).

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

## 7. Persistent local workspace

On2026-10-08, the user requested relocating ongoing task artifacts out of temporary storage and deleting only completed roundtrip copies. The operator repository now groups gitignored artifacts under `.code-review/workspaces/`: BG candidates, dependencies, investigations and probe runtimes are separate from Personal settings and preloader work.

Use `bg/candidates/g112a-candidate` for the generated integration environment and `bg/investigations/capability-audit` for this plan's exact-live/virtual-return comparison. Shared dependencies are exposed through `bg/dependencies/node_modules` and `bg/dependencies/browser-probes`. The exact operator root and relocation receipt are recorded in the private handoff; these paths are not relative to the patcher worktree.

Old temporary directory names remain compatibility symlinks for historical scripts, caches and virtual-environment launchers;89 absolute internal links were updated. New commands must use the canonical workspace. Do not remove compatibility links by an age-based sweep. The workspace is preserved task state, not an L3 report slated for cleanup.

Fifteen original-equivalent roundtrip trees were removed after comparison, with13 differing intent records retained separately. Logs and scripts were not removed. This maintenance neither deploys the dirty G1.12b candidate nor resumes BG implementation.

## 8. Detailed execution plan
 and direction review (2026-10-08 KST)

The user requested further planning, not implementation. Keep the CAP checkpoint and the existing behavior contracts in sections1–5. This section refines source ownership, tests, commit boundaries and conditional work. No runtime fix, live change, provider call, plugin-host activation or stable release is authorized by this planning update.

### 8.1 Direction and evidence

Treat the generated return, raw input-base read, and prepared negotiation cancellation as three separate defects. Fix their maintained owners and test the resulting composition. Keep policy, native persistence/CAS/rebase, current base/projection checks, marker-before-start and exact POST/status reconciliation intact. Preserve raw failure as blocked and prepared negotiation failure as legacy server ownership unless cancelled. Legacy negotiation is not permission for a second browser model call after uncertain admission.

Do not merge the broad G1.12b ownership/readiness change into CAP. Shared interleavings are regression gates; add shared protection only for a reproduced failure. A stalled strict save remains a conditional follow-up, so CAP completion must not claim every pre-admission wait has become bounded.

New direct check: the maintained composer's actual `applyUnit`/`revertUnit` was executed on an isolated async return fixture. An expression-only replacement consumed the body zero times and returned undefined; a whole-return replacement consumed it once and returned the supplied object. Both applied idempotently and reverted exactly. This establishes that correct apply/revert does not establish generated-code behavior; it is not a full-target or browser pass.

Additional source inspection found a pre-capability observation gap: `submitServerInputCommand` queries existing markers with a fresh signal that has no owner to abort it. Its `status` wrapper uses `clientBuildFetch` directly; that helper has no timer. This is distinct from post-POST reconciliation, whose existing per-attempt controller aborts after10s and whose raw overall budget is60s. Reproduce the prior-marker gap at the actual caller before adding the conditional unit in8.4.

Client capacity checks span awaits, but the server checks its two-nonterminal-input limit inside `queueStorageOperation` and a SQLite transaction. Concurrent client entry is a test surface, not established server over-admission. Validate server outcomes and subsequent reconciliation before proposing a client lock.

### 8.2 CAP-0: isolate the implementation baseline

1. On later implementation authorization, create a separate worktree from delivered runtime `ab14579` with the current CAP documentation. The present branch's documentation HEAD is `055abfe`; its dirty G1.12b manifest, owned files and installer are not a CAP starting artifact. Preserve their hashes and paths.
2. Record the exact official1.10.0 target, selected packs, source/dependency versions and generated-source hashes. Use the canonical investigation workspace described in section7; do not rebuild or mutate the preserved exact/virtual comparison to masquerade as a fixed candidate.
3. Preserve archive comparisons and previous diagnostics with their original source/environment limits. Distinguish an expected reproduction pass from a repaired behavior pass. No repeated live-configuration survey or paid probe is required merely to prepare the isolated candidate.
4. Capture baseline diagnostics and an existing .22 applied-state copy for upgrade validation. Retain normal/error/cancellation behavior and the current draft, attachment, marker and queue contracts as explicit expectations.

### 8.3 CAP-1: repair generated semantics without changing marker format

- Owner: `patches/lazy-chat-bg-adapter/recovery-read-units.cjs`. The delivered generated `body-response-2` is the bare-return site; the other six `response` replacements are assignment-expression sites. Prefer retaining that unit ID and replacing its whole return. Confirm occurrence counts and location at the actual pre-unit composition stage before relying on the loop index. Do not shift other IDs or add a broad `first` policy to conceal an anchor mismatch.
- Add actual-caller and real-composer failing cases before the correction. Unit-level mocked capability results are insufficient. Verify valid response consumption/return,404/incompatible contract,500, malformed/stalled body, prior marker and capability downgrade through the exported caller.
- Add a small marker-boundary diagnostic over the supported generated TS/JS and Svelte script regions. Token hazards identify candidates; targeted AST/runtime checks determine whether semantics changed. Inventory Svelte script/template/style regions separately and record excluded coverage. Validate positive and ordinary-expression controls before promoting a diagnostic to a gate.
- An AST comparison that flattens marker newlines is an experiment, not a universal proof: comment and legitimate statement boundaries can change meaning. Likewise, lexical lists of `return`, `async`, postfix operators or TypeScript contextual tokens do not by themselves prove a defect. Keep targeted unreachable-code diagnostics as a cross-check against baseline; do not predict finding counts or broaden compiler policy without inspecting existing errors.
- Commit the return correction with its passing tests. Preserve red evidence without presenting a knowingly failing test-only checkpoint as a successful runtime candidate. Validate .22 applied-state upgrade in addition to clean composition.

### 8.4 CAP-2: separate read and cancellation changes

| Unit | Maintained owner | Planned change | Required preservation |
| --- | --- | --- | --- |
| CAP-2a raw base | `client-input-recovery-units.cjs`, existing `snapshot-view-revision` content; owned `files-1.10/src/ts/bgRecoveryRead.ts` | One original response consumption and one30s candidate budget covering codec import, binary body, decode and base validation | Same codec/defaults and base identity/revision checks; no clone, tee, second fetch or general storage timeout |
| CAP-2b prepared | Existing `server-chat-commit-client-negotiate` content in `manifest.cjs` | Pass `arg.signal` into the capability control request; consume the original body with `readRecoveryJson` | Normal v1; non-aborted failure's existing legacy server ownership; handled Stop with no POST or resend notice |
| CAP-2c prior-status observation, conditional | Owned `files-1.10/src/ts/bgServerInputClient.ts`, prior-marker loop only | If caller-level stalls reproduce, wrap that observation in existing `boundedRecoveryRead` using its signal | Existing `prior-operation-unavailable`, unchanged marker on unavailable observation, and unchanged post-POST10s/60s reconciliation |

Use a small response-consumption companion in `bgRecoveryRead` that reuses the response's controller/parent association and cleans it in `finally`. The winning read returns the validated observation; only the outer caller may authorize publication after existing current-selection/revision checks. Do not duplicate those checks inside a read-only decoder or change the shared JSON reader's behavior without need. This helper is owned by the BG adapter; verify unit dependencies and graph composition when adding its caller.

The raw budget begins before the import/body/decode await chain; do not stack independent30s budgets for each step. The timeout winner cannot later write a marker, POST, clear a draft or alter a newer attempt. Decode/import can finish later, and synchronous decode or page suspension can delay a timer; this is a continuation boundary, not hard wall-clock preemption. Preserve existing codec fallback formats and error handling.

Prepared cancellation must work before headers, between headers and body, and during body consumption. Existing post-catch signal handling remains responsible for the exact preparation owner. Test an aborted old owner followed by a new owner, then release the old response: old work must not clear the new stage or busy state. An un-aborted body timeout follows legacy negotiation once; compare it to the existing HTTP/header failure payload, excluding only unavoidable generated identity/time values.

CAP-2c first gets an actual exported-caller header/body stall reproduction. Prefer the prior-marker call-site wrapper rather than changing the shared start/status transport. Propose reusing existing `RECOVERY_BODY_TIMEOUT_MS`30s as an initial whole-observation candidate; this is not measured prior-status device latency. Check timely success and cancellation/late-response behavior before selecting it for implementation. Signal-respecting and signal-ignoring fixtures must distinguish bounded caller settlement from actual connection closure. If this needs a broader post-POST contract change, report that separately before expanding the unit.

### 8.5 CAP-3: test matrix and evidence

These IDs track scenarios, not a required test count. Use real generated callers, native owner/storage and endpoint implementations for the contract being tested, with controlled transport/provider leaves explicitly identified.

| ID | Scenario | Required outcome |
| --- | --- | --- |
| RET-1 | Actual composer and whole-return unit | Body consumed once, supplied value returned, expected AST; exact/idempotent apply/revert |
| RET-2 | Supported generated compositions and baseline diagnostics | Investigated marker-boundary candidates; no unexplained new diagnostics; Svelte/other exclusions recorded |
| NEG-1 | Valid capability/base;404; incompatible fields; active-marker downgrade | Existing accepted/unsupported/blocked distinctions; no policy/schema bypass |
| NEG-2 | HTTP failure, malformed JSON, stalled capability body | capability-unavailable; no new marker/POST or silent preparation fallback |
| RAW-1 | Timely headers, stalled binary/import/async decode | canonical-chat-unavailable; spinner released; draft/translation/attachments preserved |
| RAW-2 | Late success/rejection after timeout and a later attempt | No stale marker/POST/publication, no unhandled rejection or newer-owner cleanup |
| RAW-3 | Wrong/missing base or changed selection/slot/view | Existing identity/base/CAS protection; no forced adoption |
| PRE-1 | Already aborted; Stop before headers/between phases/during body | Handled cancellation without waiting for budget; exact owner/stage release; POST0 and no resend/error notice |
| PRE-2 | Body timeout without Stop versus HTTP/header failure; normal success | Legacy start once with equivalent semantics; normal v1 start once |
| OWN-1 | New owner after old Stop, then old response finishes | New busy/stage/marker unaffected |
| PRI-1 | Existing marker status headers/body stall, both abort cooperation cases | Reproduction first; bounded prior-operation-unavailable if corrected; retained marker/draft; no new POST; post-POST contract unchanged |
| ADM-1 | Two commands then third; simultaneous entry; same draft in two views | Server capacity/identity enforced; conservative rejection/unknown reconciles without lost draft or paid replay |
| ADM-2 | Lost start response, delayed/missing/unknown status | Exact operation retained; no second generation on ambiguity; reconcile controller's actual abort checked |
| REC-1 | Explicit recovery eligibility, admission, claim, client preparation, attach/abandon | Original input preserved, qualification checked separately; ambiguous claim/attach never permits automatic replay |
| INT-1 | Raw admission during older classic boot probe | New input and old paid result remain recoverable |
| INT-2 | Raw/boot adoption both orders, local edit and save-in-flight | Real guards preserve content; late refusal reobserved on valid subsequent evidence |
| INT-3 | Attach and mounted pending-input refresh concurrently | Exact delivery identity; no duplicate provider/completion effects; idempotent repeated reads/ACK allowed |
| RES-1 | Reader success/error/timeout/abort and late rejection | Timers/listeners and response association cleaned; original controller behavior checked; no clone/tee/double-fetch |
| UP-1 | Actual .22 applied-state upgrade, re-plan and revert | Stored unit-snapshot migration, graph and byte/mode restoration; no manual edits or drift-check weakening |

Use deterministic clocks for deadline ordering and actual Response/stream/loopback evidence for transport cancellation. Neither establishes iOS suspend/kill behavior. A stale dynamic codec chunk is an upgrade surface: trace the build fence and test preserved blocked handling; do not repair generic chunk loading or turn it into unsupported fallback without evidence.

### 8.6 Commits, gates and delivery boundary

Keep return, raw-read and prepared-cancellation corrections in separate commits with their focused tests. CAP-2c is a separate commit only if its caller reproduction justifies it. Build the deliverable installer from the composed CAP line after integration validation; never use the dirty G1.12b installer. Source commit boundaries do not create intermediate live releases.

For the final composition, run affected full client/server/compatibility tests, types/help, frontend and BG bundle build/load, graph, re-plan0, exact byte/mode revert and .22 upgrade checks, followed by L3/L4, privacy sweep and final read-only consultation. Record source/environment/commands/observed results and reuse unchanged prior evidence only within its contract. Follow the established BG target build workflow; do not substitute the NAI application's build for the isolated PocketRisu target.

After later implementation authorization and gates, check ordinary generation and raw pending work plus process-local settings contexts, drift and verified recovery points. Use the appropriate minimal backup, then safe apply/build/restart and direct source/served-assets/DB/settings readback. Preserve current font/settings and plugin-host OFF. Do not cancel generation or delete user data.

Device preservation checks use ordinary prepared send, Stop while preparation is visibly active, and subsequent send, with route evidence. Do not manufacture phone hangs, alter model/plugin settings or issue paid fault injection to reach a test. Unreachable eligible raw cases remain unqualified. Outstanding G1.12a device scenarios and G1/aggregate/stable gates remain open.

Report a new regression under the repository workflow before repatching. A reproduced related shared failure needs its trigger, damaged contract and smallest protection documented; a conservative refusal alone is not corruption. Failure to reconcile after valid later evidence is a liveness issue. Unexpected marker diagnostics, upgrade drift, dependency changes or intended changes to post-POST timing require investigation before extending scope, not weakened assertions or a blanket owner lock.

### 8.7 Planning consultation

Two read-only Opus5.5 turns reviewed the frozen plan, source snapshots and proposed refinements. Codex directly confirmed the prior-marker timeout gap, response unit mapping, native prepared cleanup, stored-unit snapshot reversal and server transactional capacity guard. The discussion added conditional prior-status observation and applied-state upgrade gates, narrowed the return change toward an existing ID, and placed prepared/raw edits in their maintained owner content.

The proposed AST-newline normalization and lexical scanner were retained as diagnostic candidates rather than asserted universal safety gates. The initial concurrent-entry concern was narrowed using the server's transactional limit; no client mutex was selected. Prior-status budget qualification, full composed caller interleavings and device routes remain implementation evidence to obtain. The advisor did not run tests; only the isolated composer mechanism check was newly executed during this planning review. Runtime implementation remains paused.
