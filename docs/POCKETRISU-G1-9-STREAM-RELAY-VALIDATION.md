# G1.9 server stream relay validation

2026-10-12 KST. Baseline c325ac8. Candidate0.2.4-experimental.40 / BG adapter0.7.47. Stable remains0.2.3. G1.10 actual-provider/MARP, aggregate activation and stable release remain separate.

Status: G1.9 implementation, automatic qualification, hostOFF delivery and scoped iPhone L5/L6 are closed. Next ordered goal is G1.10; this is not whole-G1 activation or stable release.

## Result and source ownership

The selected chat shows a transient formatted server answer while the native full pipeline reads a streaming response. An authenticated no-store endpoint reads only the native displayed row, with operation/row identity and a monotonic display revision. It never creates a result claim, saves a provisional client message or acknowledges a result. Native canonical commit/recovery remains the sole answer owner. Nonstream and input/aux streams produce no answer preview.

The latest snapshot is limited to256KiB UTF8 display data. Oversized text is withheld, not sliced through thought/HTML boundaries; the generated/stored answer remains exact. Unchanged revisions omit text. Client reads and async formatting are serial and epoch/visibility guarded. Observation teardown never stops generation. The explicit **생성 중지** action targets only the observed operation, because raw server-owned generation did not expose the legacy composer's Stop.

The user selected native common Markdown/HTML/style sanitization and thought folding, explicitly excluding card/module editdisplay regex, Lua/plugin hooks and automatic translation during preview. Content hidden solely by those display hooks can appear in preview. Incomplete thought blocks are closed only for preview formatting; the completed canonical message retains its existing renderer, including malformed/unclosed-thought behavior. No generated string is rewritten by the preview.

## Source consultation and necessary repairs

Opus5.5 medium planning consultation replaced native-loop observer hooks with an exact locked reader of the bundle's current display. It identified actual message row identity as the continuation authority, rather than recursive generationId. Common formatted display and display-hook exclusions were decided explicitly with the user.

Actual native streaming exposed two preexisting support defects: balanced/strong display called an absent server requestAnimationFrame, and OpenAI pipeTo rejected separately after already propagating the source error to the reader. A real cancellable Node frame pair preserves native125ms coalescing and async-local context. Fixed metadata-only callback reporting and window Proxy forwarding preserve execution. Pipe promises are observed while their readable still rejects; terminal partial results keep the original failure.

Normal and partial completion both exposed first-next-Send settings-save-failed after the server changed the root and native persistence requested a retry. Only an explicit persistence retry is reattempted before admission, within the native shared five-attempt boundary. Unknown/noop, inactive writer, manual/publication refusal and exhausted retry remain failures. Reply/ACK callers retain rejection and parked results without positive save proof. No model/plugin retry is introduced by this persistence loop.

Confirmed cancellation also left an accepted raw marker behind. DELETE success was rejected as input-hydration authority. A read-only cancelled-input proof validates durable cancelled state and current canonical ownership, or a never-started non-client transform with no receipt/owned row. Existing reconciliation/pre-admission consumers adopt only an unchanged saved base, advance peer markers and recheck proof/context/marker identity before exact metadata cleanup. Current and legacy aliases are cleared together; durable raw input, effects and deliberate deletion are preserved. Unknown/in-progress unattached transforms and unavailable/deleted attached targets remain protected.

Independent implementation commits:12f1e46 settings persistence,3371119 native stream support,31cb01d cancellation proof/reconciliation,f731a6d preview/delivery,a2a84f8 Google stream support and31e2986 active observation/late Stop. Native Gemini and Vertex failure/Stop trials use the actual browser/server/SQLite path with controlled SSE and denied external transport. Each trial permits one next Send and observes exactly two provider calls; only Stop requests one cancellation. Idle preview GET count is zero. hostOFF restricts plugin execution, not native Gemini/Vertex reachability. The adviser's contrary initial premise was corrected before delivery. Late-Stop regression covers both retained-result and missing-result failures, including no cancelled input settlement.

Final Opus5.5 delta review found no new blocker in the reviewed source. Its low-effort assertion was withdrawn as unsupported: configured model-specific effort is medium, while actual runtime effort is absent from bridge metadata. Review did not independently rerun probes. Temporary preview gaps after activity-read failure/hydration, and preexisting terminal paths without a durable delivery-failed record, remain prepared surfaces.

## Observed automatic evidence

| Boundary | Observation |
|---|---|
| Full frontend |2,396 pass,4 existing skips. |
| Full server |643 pass,12 existing skips on the final source, including both late-Stop result/ownership cases. |
| Patcher |52 outer entries passed. Final afc5346 graph re-plan0, exact1,022-file byte/mode inventory, extra/missing0 and patcher state absent after revert. |
| Settings/ownership contracts |43 focused persistence/cancellation/settings contracts; cancellation/client51; genuine input owner66. |
| Source checks |Frontend and BG build/load passed; latest scoped Svelte check0 errors/0 warnings. |
| Native foreground |Formatted partial text and folded thoughts appear before provider completion. Canonical assistant row absent before commit. Preview polling after input-adoption readiness enlists no save. |
| Normal/partial/Stop follow-up |Actual single next Send reaches exactly one new provider and stores its answer. Stop invokes one explicit DELETE/abort; observation never invokes cancellation. |
| Absence/navigation |Browser context close or navigation leaves the server running; normal-chat API proves one answer before reopening. |
| Queue |N+1 admitted through actual Send, not a fixture-dependent Enter setting; two provider calls and correct sequential canonical storage. |
| Continuation |Actual native auto-continue uses two calls but one displayed/canonical assistant row with stable rowChatId. |
| Rendering modes |balanced, strong and off native display modes passed. Common thought/Markdown assertions are captured atomically because reactive hydration can replace DOM nodes between locator calls. |
| Provider stream |Synthetic isolated hostON provider returns a retained stream into the native display loop and canonical storage. This does not qualify original paid providers/MARP or activate production. |
| Lua caller |Actual Lua LLM late body failure and retained input latch each preserve the failure boundary, then permit one healthy call; corrected probes report two calls. |
| Read-only observers |Concurrent authenticated preview GETs return the same current operation/row; no claim or durable write. Full multi-tab writer interaction remains aggregate scope. |
| Graph/revert |Maintained full-set graph re-plan0 and exact1,022-file byte/mode revert to absent patcher state. Latest final graph is repeated after documentation/source consultation if code changes. |
| HTTPS device preparation |Separate synthetic application and cookie namespace, reloaded on the latest paired source. Actual HTTPS browser observed body progression, Stop availability, unchanged production-control cookie, exactly one new canonical answer before return, and no cancellation or page errors. Older synthetic answers are retained. |

The full suite's post-run localhost:3000 refusal messages are retained environmental diagnostics, not counted as extra assertion successes. The installed Chromium override was required because the browser tool's default version was absent; physical iPhone and current paid-provider behavior are not inferred from headless results.

## Failed or excluded evidence

Initial probe setup errors are retained: omitted native fallback arrays, incorrectly parsed byte request bodies, unavailable default browser path, missing built Lua modules/document masking, manual cancellation missing a paired build header and composer Stop absent on the raw path. Tests were corrected using the real handler and current prerequisites, not weakened assertions. A trial started before a build finished observed an earlier UI and was excluded. The save harness now injects the actual durable barrier/constants rather than leaving extracted source imports undefined; original scheduler/deferred assertions remain.

An earlier G1.8 original tree was removed by separately approved cleanup while this task was running. Its failed-reference comparison is excluded. A retained independent1,022-file inventory, matching applied baseline hashes and owned-path absences, supplies current revert comparisons. Original application/user data were never used as mutable test fixtures.

A full-suite repetition in the restricted sandbox could not complete its HTTP-based environment and was terminated as excluded evidence; the repository suites are rerun with loopback binding available. A repeated HTTPS smoke initially matched two old/new completion labels; the corrected assertion identifies the unique input and new canonical row, preserving older synthetic answers.

## Delivery and device boundaries

Final source consultation, privacy sweep and explicit-path candidate push are complete at afc5346. Observed hostOFF delivery: managed source504, served JS175, DB5 quick_check=ok, online/unstable restarts0, active/model/pending0, authenticated capability200 with input/commit1 and plugin host0, inactive preview200/no-store. Independent source/asset/authentication readback passes; it reuses the immediately completed post-restart DB checks rather than repeating their full scan. Existing header settings,203 legacy journal rows and103 operation states are preserved; removed operations0/new error lines0. Source/build apply left stopped DB bytes unchanged.

Verified app/state rollback is91,831,116bytes with1,651 byte/size/mode-checked files plus19 notification namespace rows, linked to the existing verified full-data anchor. Previously retained rollback/reference sets remain protected; no backup/user-data deletion or active-generation cancellation was performed. Runtime production plugin-host activation, paid-provider calls, physical iPhone and stable release are not implied by this candidate delivery. Additional final documentation does not change source or installer. The independent inactive-response probe's initial wrong streaming:false expectation is excluded; actual owner contract active:false is now asserted exactly.

The separate HTTPS test contains synthetic data and a controlled provider only. Its remote outbound transport is denied. Required L5: formatted body progression, explicit Stop followed by one normal Send, one synthetic failure followed by a normal Send, home/lock/close and return with one preserved answer. Operator checks canonical storage separately from visible device reports. Internal OS suspension, requests before server reach, unknown transform outcomes, deliberate removal of a cancelled attachment, original-provider combinations and whole-G1 stable remain separate documented surfaces.

| L5 screen/action | Change | Device check |
|---|---|---|
| Synthetic chat / Send | Read-only formatted partial answer | Send a normal short input. Observe sequential body pieces, bold text and initially folded thoughts before completion. Final answer appears once and input remains once. |
| Preview / 생성 중지 | Exact current-operation cancellation | While pieces are growing, tap Stop once. Partial preview disappears without being saved as a completed answer. Send a new normal input once and verify completion. Stop does not cancel an already queued successor. |
| Synthetic chat / failure input | Original stream error remains visible | Include 실패 in a test input. After controlled stream failure, observe retained partial/error behavior; then Send a normal input once and verify completion. |
| Home, lock, close, return | Server execution survives observer teardown | Send a normal input and leave while pieces are growing. Wait for server completion, then return/reopen. Observe one final answer, no stale generating preview, and one successful next Send. This validates observable survival, not internal iOS suspension state. |

## iPhone L5 and L6 closeout — 2026-10-12

After the four-row instructions above, the user reported all looked normal. This closes the instructed formatted progression/thought folding, Stop-to-next-Send, controlled failure-to-next-Send and absence/return observation at the synthetic device scope. The report is a user observation, not a per-gesture timestamp trace; internal OS suspension and actual paid-provider/MARP behavior remain unmeasured here.

Read-only post-report normal-chat API returns200 with unique message row IDs; the combined synthetic history has7 user rows/7 character rows, including earlier automatic checks and the fixture greeting. Operation aggregates are3 chat-committed/4 delivered/1 cancelled; input aggregates are6 completed/1 cancelled. No nonterminal operation/input remains and the actual preview endpoint returns exactly active:false. These aggregates are not attributed as one trial per device instruction. No new generation or cancellation was used for this readback. Initial verification-script errors (missing normal-chat JWT and missing await for the actual asynchronous codec) are excluded; the corrected verifier preserves the identity/unique-row/terminal assertions.

L6 updates validation/README/CHANGELOG and the ordered-goals/JOURNAL checkpoint, records the retained audit conclusions, removes the completed structural working report and pushes documentation after the full tracked-range privacy sweep. Source/installer/version remain unchanged; experimental.40 and hostOFF are retained. Existing backups and the synthetic runtime remain protected; no test service/data removal is performed by this closeout. Stable/tag/aggregate qualification are separate.
