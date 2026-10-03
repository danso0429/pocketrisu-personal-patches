# G1.4 queue and generation controls

Candidate: `0.2.4-experimental.18`, lazy-chat BG adapter `0.7.25`, based on `34d9211`. Implementation and automated validation completed; live delivery and device results are recorded separately below.

## Behavior and scope

The existing raw-input owner already admits N+1 while N executes. This change exposes server activity to reroll, continue and empty resend controls, checks activity again before client-side replacement mutations, and excludes competing native main jobs and legacy whole-pipeline starts from the same chat. N+1 retains the existing delayed input transformation and latest assembly context. A full queue preserves the unsent draft.

The pending-input component reports unknown/active/idle availability scoped to the current character/chat. It polls only while visible (2 seconds for active inputs, 5 seconds otherwise) and refreshes on return, storage and input events. Unknown activity does not authorize a replacement generation. A shared reactive prop updates existing manually mounted message buttons; no extra remount or streaming-state change is required.

Server exclusion is two-sided and synchronous at each insertion boundary: input owner admission after canonical-state awaits, legacy orchestration registry insertion, and native main-job creation. Native auxiliary requests are unchanged. Busy or unreadable BG state returns 409 to old native job clients because their existing 409 handling does not fall back to a duplicate direct request. The browser's configured transport stays unchanged; only the server execution copy explicitly disables nested native jobs.

G1.12 linkage is limited to an already-finished cancellation response. Committed/results-ready/delivered work is reported as finished, not cancelled. The client keeps hydration and exact ACK in the existing recovery path. The broader r3 UI/navigation redesign is deferred.

## Evidence

- Real Chromium baseline on experimental.17 already admitted N+1, saved N before N+1 main, included N's answer in N+1's provider request, displayed N while N+1 ran, and saved both turns after page close. No baseline adoption conflict was reproduced; message-ID adoption was not expanded on a hypothesis.
- Baseline focused client: 51 passed. Candidate focused server: 70 passed; focused client: 37 passed.
- Full frontend: 2,109 passed / 4 skipped. Full server: 470 passed / 12 skipped. Compatibility: 74 passed / 5 skipped. Patcher: 51 passed.
- After final consultation, the bounded rejection/publication delta passed focused client 46/46 and server 73/73, type checks and rebuilt artifacts. The preceding full-suite counts are not represented as reruns of that delta.
- Svelte check: zero errors and warnings. Frontend build, BG bundle build/import and help-key validation passed.
- Exact-1.10 apply/re-plan/revert: 42 packs, 1,022 original files compared by bytes and mode, zero mismatch, zero additional changes on re-plan.
- Final installer: 5,968,163 bytes; SHA-256 `d3dd50017715d928bd9160904dd4075032c39ff690662ca4be22c493ec6462fc`.
- Extended real Chromium qualification confirmed an explicitly disabled reroll in another context without local input markers, Continue Response disabled after the existing writer-lock confirmation/reload and chat reentry, third-input draft preservation, old native main-job 409, N's answer in N+1, and both saved answers after page close. No script exception occurred; two provider calls produced two input/answer pairs, in addition to the seeded history.
- Initial socket-related EPERM results were environment failures. The same server/compatibility checks were rerun under permitted isolated socket execution; the original failures were not counted as passes.

Browser qualification uses `scripts/probe-bg-queue.mjs` with a generated target, Playwright dependency root, installed Chromium and the synthetic fixture exported by the native-input probe. `--check-guards` adds another browser context without local input markers and an old native main-job request without a build header. All provider responses are synthetic; no user save directory or paid provider is used.

## Runtime audit

### Phase 1 — discovery (without severity)

1. Raw admission, queue cap, draft identity and unknown responses.
2. Deferred input transformation, predecessor publication and latest assembly.
3. Activity reads, authentication, invalid coordinates and unavailable stores.
4. UI polling, chat switches, hidden pages and teardown.
5. Reactive manually mounted buttons, keyboard entry and empty resend.
6. Native main-job insertion, aux calls and callback failure.
7. Legacy insertion and input admission after asynchronous preparation.
8. Cancellation request while active versus after result publication.
9. Result hydration, exact ACK, N+1 attachment and local edits.
10. Server execution-copy transport and user endpoint preservation.
11. Patcher ownership, upgrade/re-plan/revert and generated artifacts.
12. Old direct browser providers, lookup/action races and physical devices.

### Phase 2 — anchors and adversarial checks

| Leaf | Counterexample / resolution |
|---|---|
| 1–2 | Third admission or premature N+1 effects: existing owner tests retain the two-command cap and predecessor checks; real browser observes no second attached input while N is held, then N's answer in the second request. |
| 3 | Store failure incorrectly means idle: activity endpoint responds 503; strict client response validation rejects. Native main-job callback failure yields 409 and zero upstream calls in the loopback test. |
| 4 | Late chat-A refresh unlocks chat B: component disposal ignores late results; parent compares exact character/chat before using availability. Timer/event cleanup remains in the effect teardown. Polling stops on hidden-page completion and resumes on visibility/focus. |
| 5 | A stale hint allows mutation: handler performs an authenticated read before mutation and rechecks selection/local busy state. Stable reactive lock object reaches manual mounts without adding it to the message hash. The lookup/action race is separately bounded below. |
| 6 | Old native reroll bypasses BG route: actual main-job creation checks the injected owner callback before insert. Aux remains allowed. Native main state is visible immediately after insertion and disappears after terminal completion. |
| 7 | A competing start occurs during canonical preparation: input-owner test changes external activity during the await and observes rejection with no input record. Legacy guard has no await between its check and `orchestrationRuns.start`. The registry retains running state through abort until execution settles. Final route tests exercise the legacy 409 and activity 400/503/busy responses; generated-client testing confirms that this exact authoritative rejection closes the watch without paid fallback, including the common handler used by auto-resume. |
| 8 | Treating a committed result as cancellation discards it: server returns `cancelled:false, finished:true`; client invokes its ordinary result poll, whose existing gate prevents concurrent foreground consumers. Test observes exact ACK, cleared marker and no client model replay for a terminal failure. |
| 9 | N+1 advances revision before N is displayed: real browser baseline and candidate observations display N while the second provider is held. Existing adoption/rebase suites are retained; no broad G1.12/r3 change is inferred. |
| 10 | Absent transport setting becomes true during normalization and creates nested jobs: both server copies set it false unconditionally. User source settings and custom endpoint/aux transports are not rewritten. |
| 11 | Hook interaction loses a pack or prevents revert: generated all-preset composition and complete original-file byte/mode comparison close this boundary. |
| 12 | A current or old browser sends directly to a provider after a stale availability observation: tools-enabled presets and direct transports bypass native main-job admission. The UI check is not a distributed lease; pre-main auxiliary work can also run before main admission. See explicit limits below. |

### Phase 3 — disposition and surfaces

The measured supported raw-input/native-main boundary is covered by the checks above. No broad message-adoption redesign is promoted. Remaining surfaces are: current and old direct/tools-provider calls outside main-job admission, pre-main auxiliary execution, the existing global two-snapshot capacity and restart/no-paid-replay policy, and physical-device scheduling. A direct-provider request after a stale UI check can still spend tokens; existing save/rebase and stale-build fences are persistence protections, not provider-call prevention. Preventing these races across all transports needs a separate browser-generation ownership contract; this change does not claim universal provider exclusion.

Final consultation found that the new legacy busy rejection initially reached the existing client fallback. The client now recognizes `chat-generation-active`, closes its rejected watch and warns without invoking fallback. The other correction aligns completed-input activity with the existing predecessor predicate: an exact canonical result revision resolves a missing publication marker, while genuinely unconfirmed publication remains conservative. A focused test observes busy before canonical publication and idle after publication without writing the marker. Auto-resume uses the same rejection handling; no extra local reflag/polling loop was added. These corrections do not expand r3 or transport ownership.

The publication-marker fallback applies only while the canonical result revision remains exact. If the marker write failed and the chat subsequently changes, the conservative busy state can return until startup reconciliation repairs the marker. This is a retained recovery limitation, not a claim that marker loss is permanently repaired. For a legacy client-prepared send refused as busy, the already-saved user message remains in the chat; the editor draft may already be cleared. Auto-resume also closes its attempted resume and requires a later manual resend rather than replaying paid work. Old clients retain their old fallback behavior; only the new client recognizes the new no-fallback reason.

The final follow-up consultation verified the bounded code corrections and identified no additional blocking defect in that reviewed delta. It retained the publication-marker and transport limits above. Review did not replace executed tests or physical-device confirmation.

For physical validation, send a native preset request, type/send a second message while it runs, and verify one ordered pair per input after leaving/returning. While processing, reroll and Continue Response must be unavailable. Try a third input while both slots are occupied and verify that its draft remains. In another tab, take control through the app's existing confirmation dialog and verify the same restrictions. Device results do not follow from Chromium automation.

## Delivery and release

Pending final consultation and safe live delivery. No stable release or tag is authorized by automated checks alone. G1.6/7, G1.5b, broader G1.8/9/10 and G2 remain separate work.
