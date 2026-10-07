# G1.12a terminal result decisions

2026-10-07 KST. Implementation starts from `0ce1086`, the BG continuation rebased on font-bearing `origin/main` at `9259550`. Personal settings remains at least `0.5.13`; server plugin execution stays OFF. The ordered BG goals and the user's decision to implement G1.12a authorize this work. Earlier deferred-plan approval wording does not create another approval gate.

## Outcome and scope

Recognize already-current saved answers, distinguish terminal execution from storage and local adoption, remove count-based waiting for unchanged evidence, retire deleted targets only with matching server and local absence, and stop interpreting device suspension as generation failure. Preserve local edits, paid results, exact delivery identity and existing server admission.

G1.12b separately changes generation-busy ownership and its consumers, including Suggestion. This unit must not introduce that readiness store or claim that navigation is unblocked for every parked or slow recovery. It does not activate plugins, change original MARP, modify Archive Center, regenerate answers, delete server records manually or cancel generation. The existing awaiting-metadata journal resurrection case is a separate known residual.

## Baseline defects and existing contracts

Cold hydration can already load the saved answer, but adoption only recognizes the pre-generation delegation view and anchored-base aliases. The old three-attempt path then refuses the current view and delays before a misleading reopen notice. A foreground save/rebase can similarly advance the current canonical revision beyond the old allowed view.

The classic foreground watch checks its 15-minute wall-clock deadline before querying the server. After suspension it can report generation timeout despite a committed answer. Raw input recovery uses a different poll and has no equivalent deadline. Control-fetch timeout currently ends at response headers; JSON body and chat snapshot reads remain unbounded.

Reuse the canonical projection's existing revision redirect, independent NodeStorage saved-view snapshots, unknown-ACK checks, conditional saves, native CAS/rebase and operation epochs. Snapshot absence is not proof of an edit. A commit receipt alone is not proof that server execution or postprocessing has ended.

## First delivery and measurement

Start with observation-only request timing before choosing new body/snapshot deadlines. The earlier recovery-timing draft contains server-side measurements only: chat handler work at most about5ms and current-revision projection about196ms on loopback. Neither measures device transfer or body completion. The draft's version/publication questions are superseded by the current base: use the next experimental candidate on this branch and normal verified delivery.

The temporary collector measures original result/projection/ACK body consumption and relevant snapshot reads, with boot/watch lifecycle milestones. Do not clone/tee a response, fetch it again or stringify a chat to measure size. Distinguish header latency, consumed-body time, decoding time where available, transferred/decoded size basis, fixed error class and visibility transitions. A missing or ambiguous resource timing entry means unknown size, not zero bytes.

Keep coordinates only in bounded process memory for correlation. Stored trace rows use a page-local trace ordinal and numeric measurements, not chat content, character names, URLs, authentication, revision strings or new durable content fingerprints. Write through the existing client logger with unique messages so its one-second deduplication cannot discard later descriptions. Logging failure must not change return values, throws, retries, notices, ACK or marker cleanup. Bound concurrent traces16 and total traces64 per page. Retain the first8 and most recent40 requests, counting omitted requests; this keeps post-suspension and terminal traffic after long generation. Limit UTF-8 JSON to9,500bytes, trimming middle samples with a separate count, below the server logger's10KiB truncation. Overflow discards measurement rather than application work.

A finish row alone cannot describe a body read that never finishes. Permit at most one hidden and one resumed checkpoint per trace, marked incomplete, in addition to the final row. This is an explicit extension of the earlier one-row draft, not proof that logging survives process death. Capture suspension in flight and completion/error on return; do not assume iOS automatically aborts the request. Record whether the existing control timeout fired so it is not misattributed to iOS. Both monotonic and wall-clock deltas are retained. Phase `headers` means the caller has not consumed the body (normal for some409/non-OK responses); `body` means a consumption call is pending. Outcomes `finished`/`deferred` describe existing cleanup branches, not new evidence of successful adoption.

ResourceTiming uses a bounded same-origin observer without resizing or clearing the browser's global buffer. Matching requires a unique same-URL entry inside the measured call span; `none` and `multiple` remain distinct unknown cases. A shared save-path fetch can otherwise be mistaken for the BG snapshot. Snapshot bytes come from the actual returned encoded snapshot. The existing logger may lose rows on offline transfer or process death; no diagnostic persistence ring is added. Missing abort rows do not prove that iOS did not abort, and64-trace early-session sampling cannot establish an all-day distribution.

Collect both cold recovery and foreground watch, relevant payload sizes, and at least one return after a long suspension. Report observed counts/range and missing cases instead of declaring a tail bound from a small fixed sample. Device measurements require user interaction after the measurement candidate is delivered. R0 and local R1 work can proceed while these observations arrive; final timeout selection remains conditional on the measurements.

The timing trace is always on in the measurement candidate; OFF refers only to the G1.6 plugin host. Each measured recovery can add up to three rows to the existing5,000-row log window and thus accelerates ordinary log rotation. Use normal conversations rather than generating extra paid requests solely for measurement. The original misleading timeout notice remains in this observation-only build: if it appears, do not resend in response to it. First inspect the chat/result; the answer may already be stored, and a resend may incur another generation charge.

## Execution and adoption decisions

Validate operation and chat coordinates and result revision/sequence before applying terminal rules. Intermediate, running, queued and postprocessing evidence stays active. Contradictory active/terminal evidence requires reobservation. Apply the same decisions at all five committed-hydration consumers: two foreground watch branches, two boot branches and raw-input recovery.

| Evidence and local state | Action | ACK |
| --- | --- | --- |
| Terminal, valid current storage proof, already-current local view | No-op adoption; existing idempotent completion bookkeeping | Exact matching delivery only |
| Terminal, valid storage, unchanged older local view | Existing guarded authoritative adoption | After adoption |
| Terminal, valid storage, newer local edits | Preserve edits and canonical answer; use supported save/rebase or park reconciliation | Only with verified matching storage/delivery; ACK does not retire unresolved reconciliation |
| Terminal, proof missing or read unavailable | Preserve view and marker; bounded transport recovery or event-triggered recheck | Not until required proof exists |
| Invalid receipt, projection or ownership | Park verification failure without a saved/adopted claim | Forbidden |
| Valid historical receipt, newer canonical snapshot without old owner, local equals that snapshot and no ambiguous save | Retire as superseded without restoring old content; once-only changed-conversation notice, no answer completion replay | Forbidden; keep potential last-copy server row |
| Server projection404 with currentRevision null, loaded local character has no matching chat or placeholder | Retire local marker without notice | Forbidden |
| Actual active execution or intermediate result | Existing progress/cancellation behavior | No terminal-completion ACK |

Already-current proof uses the remembered view at the current projected server revision, independently of the anchored base. Require a matching independent snapshot, no unknown save ACK and equality with the actual live view under the existing normalization. If unavailable, read canonical state and compare with rechecked coordinates/slot/epoch; do not overwrite a changed slot or widen the delegation allowlist indiscriminately.

Accepted saves can advance R0 to R1/R2. Reobserve the current projection rather than freezing the receipt revision. Owner absence alone is not proof of intentional deletion. Two consecutive revision races are retryable observation failure, not an invalid receipt or inferred edit.

For deleted targets, local character absence still defers; placeholders count as present. Server absence alone is insufficient because cache invalidation, stub-only storage or identity mismatch can produce it. Local deletion may precede server persistence by a save debounce. Tests must retain recovery until both agree. A new chat deleted before metadata publication can remain in the server journal; no journal cleanup is included here.

## Markers and retries

Use optional backward-compatible outcome/notice fields in existing markers, not another durable operation store or content hash. Older markers enter conservative verification. Preserve exact pending ACK identity; reload must revalidate its newly loaded view rather than treating historical adoption as present readiness.

Remove repeated permanent checks that only reach an attempt count. Recheck on accepted save, hydration/chat re-entry, reconnect/visibility return, explicit retry or new authoritative evidence; do not rescan on keystrokes or spin on unchanged conflict. Keep bounded transient network retry behavior. The existing marker expiry remains an expiry, not a successful-recovery claim.

G1.12a may finish/defer/park through the existing cleanup authority. Separating global recovery ownership and proving all busy-transition consumers safe belongs to G1.12b. Any discovered need to change that boundary must be explained before expanding scope.

## Deadline correction

The server is authoritative about execution. A resumed watch must query and classify the response rather than report generation timeout because wall-clock time elapsed. Running/queued evidence retains active behavior. Remove misleading resend advice from the device safety-net expiry.

Bound response consumption, not only headers, and bound the recovery snapshot path without changing every general storage request. Choose the final bound from measured device body/size observations and document its safety margin and limits. The legacy save path retains its existing safety net unless its unbounded work is separately resolved; an expiry reports inability to confirm on this device, not model failure.

Include G1.6's plugin_execution_context_unavailable and existing durable interrupted/delivery-failed states. Internal retryable-no-provider is not itself a public terminal-status contract; trace the actual response before mapping it.

## Verification and delivery

R0 preserves the real-store cold-current and real-busy navigation counterexamples. The former must pass after R1; the navigation ownership case remains explicitly a G1.12b baseline where unrelated to decision waiting. Add false deadline, both-source deletion, unknown ACK, missing/evicted snapshot, changed slot during read and revision advancement tests before their fixes.

R1 covers actual codec/hydration normalization and foreground accepted-save rebase. R2 covers all five consumers, found/non-found committed results, successful/failed/superseded ACK, invalid projection/receipt, no-op versus replacing adoption effects, parked-marker wakeup, and superseded retained results not blocking server N+1.

For the measurement candidate, compare trace-enabled/disabled outcomes, notices, ACKs and markers; exercise delayed/rejected bodies and visibility changes, bounded logging and actual Chromium log delivery. Existing deadlines/order remain unchanged in that candidate.

Run affected client/server/compatibility tests, types/help, frontend/BG builds, patcher graph/re-plan/exact revert and focused structural/runtime audits. Consult Opus on the current source and evidence before device handoff. Preserve existing font behavior and verify source/installer equality. Explicit-path commits, privacy sweep, push and idle/backup/apply/build/restart/readback follow the repository workflow; no stable tag before applicable device/aggregate gates.

Device verification uses an ordinary test chat: suspend beyond the old watch deadline then return to one saved answer without false timeout; separately force-quit before completion, delete the completed test chat from another client, then reopen and verify local marker closure without an ACK or misleading notice. Do not delete existing user chats as an automated test.

## Temporary artifact register

| Artifact | Role | Removal boundary |
| --- | --- | --- |
| `files-1.10/src/ts/bgRecoveryTiming.ts` and `.test.ts` under the BG adapter | Temporary collector and focused tests | Remove owned units/files after measurements |
| `recovery-timing-units.cjs` and its manifest registration | Original-body hooks and BG snapshot/lifecycle measurements | Remove all timing units, preserving later functional changes |
| `bgFinishedOperationFlow.test.ts` timing ON/OFF wrapper | Existing behavior equivalence | Remove wrapper; retain useful cancellation/body regression cases |
| `scripts/probe-bg-recovery-timing.mjs` | Actual Chromium and native log verification | Keep evidence/probe as historical test only if not registered in the installer |
| Generated client assets and `server/node/bgOrchBundle.mjs` | Bundled measurement code | Rebuild and verify no `bg-recovery-timing` remains in served client or server bundle |

Remove measurement behavior after required observations; keep aggregate evidence and this plan. Native logs are user data and are not purged as instrumentation cleanup. The historical cold-current real-store diagnostic was run against this candidate and reproduced `local-revision-conflict` despite an already-current local answer (one selected diagnostic passed; this confirms the defect, not its repair). Its temporary candidate copy was removed after execution; the preserved original remains available for R1. M2 has not yet been delivered at this checkpoint.

## M2 validation checkpoint

Focused collector/ON-OFF flow84passed; final frontend2,177passed/4skipped, server490passed/12skipped, compatibility74passed/5skipped, patcher51passed. Type diagnostics0errors/0warnings; frontend and BG bundle/load builds passed; help audit has no missing definitions. Complete graph42packs/1,366units/7collisions applied, re-planned with zero changes and reverted all1,022 baseline files by bytes/mode. Installer6,359,061bytes, SHA-256 `3f8b60328ecfc8532dde2a959e1726cb9d028dc48227c4a49207bf047a08a574`.

Actual Chromium cold recovery produced one native log trace with11requests (snapshot/result/projection/ACK),10network splits, zero provider replay and zero page errors. It exercises boot context only; watch context and hidden/resumed transitions are covered by controlled flow/unit tests, not a real-device observation. Missing visibility rows after a known device background/return require investigation, not an inference that the OS did not suspend. Opus reviewed the current measurement source, collector tests and probe and found no delivery blocker in that limited scope; it did not independently run tests or review the final audit document.
