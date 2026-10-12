# G1.9 server stream relay validation

2026-10-12 KST. Baseline c325ac8. Candidate0.2.4-experimental.40 / BG adapter0.7.47. Stable remains0.2.3. G1.10 actual-provider/MARP, aggregate activation and stable release remain separate.

## Result and source ownership

The selected chat shows a transient formatted server answer while the native full pipeline reads a streaming response. An authenticated no-store endpoint reads only the native displayed row, with operation/row identity and a monotonic display revision. It never creates a result claim, saves a provisional client message or acknowledges a result. Native canonical commit/recovery remains the sole answer owner. Nonstream and input/aux streams produce no answer preview.

The latest snapshot is limited to256KiB UTF8 display data. Oversized text is withheld, not sliced through thought/HTML boundaries; the generated/stored answer remains exact. Unchanged revisions omit text. Client reads and async formatting are serial and epoch/visibility guarded. Observation teardown never stops generation. The explicit **생성 중지** action targets only the observed operation, because raw server-owned generation did not expose the legacy composer's Stop.

The user selected native common Markdown/HTML/style sanitization and thought folding, explicitly excluding card/module editdisplay regex, Lua/plugin hooks and automatic translation during preview. Content hidden solely by those display hooks can appear in preview. Incomplete thought blocks are closed only for preview formatting; the completed canonical message retains its existing renderer, including malformed/unclosed-thought behavior. No generated string is rewritten by the preview.

## Source consultation and necessary repairs

Opus5.5 medium planning consultation replaced native-loop observer hooks with an exact locked reader of the bundle's current display. It identified actual message row identity as the continuation authority, rather than recursive generationId. Common formatted display and display-hook exclusions were decided explicitly with the user.

Actual native streaming exposed two preexisting support defects: balanced/strong display called an absent server requestAnimationFrame, and OpenAI pipeTo rejected separately after already propagating the source error to the reader. A real cancellable Node frame pair preserves native125ms coalescing and async-local context. Fixed metadata-only callback reporting and window Proxy forwarding preserve execution. Pipe promises are observed while their readable still rejects; terminal partial results keep the original failure.

Normal and partial completion both exposed first-next-Send settings-save-failed after the server changed the root and native persistence requested a retry. Only an explicit persistence retry is reattempted before admission, within the native shared five-attempt boundary. Unknown/noop, inactive writer, manual/publication refusal and exhausted retry remain failures. Reply/ACK callers retain rejection and parked results without positive save proof. No model/plugin retry is introduced by this persistence loop.

Confirmed cancellation also left an accepted raw marker behind. DELETE success was rejected as input-hydration authority. A read-only cancelled-input proof validates durable cancelled state and current canonical ownership, or a never-started non-client transform with no receipt/owned row. Existing reconciliation/pre-admission consumers adopt only an unchanged saved base, advance peer markers and recheck proof/context/marker identity before exact metadata cleanup. Current and legacy aliases are cleared together; durable raw input, effects and deliberate deletion are preserved. Unknown/in-progress unattached transforms and unavailable/deleted attached targets remain protected.

Independent implementation commits:12f1e46 settings persistence,3371119 native stream support,31cb01d cancellation proof/reconciliation. The preview/delivery implementation is the next reviewed unit.

## Observed automatic evidence

| Boundary | Observation |
|---|---|
| Full frontend |2,396 pass,4 existing skips. |
| Full server |641 pass,12 existing skips. |
| Patcher |52 outer entries passed before final documentation. Final graph/source pairing is rechecked before delivery. |
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
| HTTPS device preparation |Separate synthetic application and cookie namespace. Actual HTTPS browser observed body progression, Stop availability, unchanged production-control cookie, canonical answer before return, and no cancellation or page errors. |

The full suite's post-run localhost:3000 refusal messages are retained environmental diagnostics, not counted as extra assertion successes. The installed Chromium override was required because the browser tool's default version was absent; physical iPhone and current paid-provider behavior are not inferred from headless results.

## Failed or excluded evidence

Initial probe setup errors are retained: omitted native fallback arrays, incorrectly parsed byte request bodies, unavailable default browser path, missing built Lua modules/document masking, manual cancellation missing a paired build header and composer Stop absent on the raw path. Tests were corrected using the real handler and current prerequisites, not weakened assertions. A trial started before a build finished observed an earlier UI and was excluded. The save harness now injects the actual durable barrier/constants rather than leaving extracted source imports undefined; original scheduler/deferred assertions remain.

An earlier G1.8 original tree was removed by separately approved cleanup while this task was running. Its failed-reference comparison is excluded. A retained independent1,022-file inventory, matching applied baseline hashes and owned-path absences, supplies current revert comparisons. Original application/user data were never used as mutable test fixtures.

## Delivery and device boundaries

Final source consultation, privacy sweep, explicit-path commits/push, idle/verified-rollback hostOFF apply and independent source/asset/API readback are pending at this document checkpoint. Production activation, paid-provider calls, generation cancellation, user-data cleanup and stable release are not implied by automated qualification.

The separate HTTPS test contains synthetic data and a controlled provider only. Its remote outbound transport is denied. Required L5: formatted body progression, explicit Stop followed by one normal Send, one synthetic failure followed by a normal Send, home/lock/close and return with one preserved answer. Operator checks canonical storage separately from visible device reports. Internal OS suspension, requests before server reach, unknown transform outcomes, deliberate removal of a cancelled attachment, original-provider combinations and whole-G1 stable remain separate documented surfaces.
