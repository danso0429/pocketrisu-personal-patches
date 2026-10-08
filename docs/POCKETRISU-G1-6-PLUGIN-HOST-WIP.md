# G1.6 server plugin host implementation

## Current boundary

2026-10-09 planning continuation: G1.12a/CAP/G1.12b have been delivered, with scoped ordinary-use device confirmations recorded separately. Next is G1.7/G1.11 behavioral qualification, then G1.5b admission. The [MARP host qualification plan](POCKETRISU-G1-7-MARP-HOST-QUALIFICATION-PLAN.md) supersedes older next-step wording below without promoting the historical G1.6 evidence. It adds actual bootstrap/adapter comparison, timeout and next-attempt behavior, dual-store settings freshness, private-history visibility and cold-start/init-effect experiments. Host remains OFF; no new test or activation is implied.

2026-10-07 KST. Candidate `0.2.4-experimental.20`, adapter `0.7.27`, started from `493fceb` and was delivered at `76bf8a2` after preserving the intervening font-target changes from main. G1.6's default-OFF foundation is implemented, automatically validated, committed, pushed and applied live. Original-plugin qualification and activation are not complete. No original plugin source, real-provider request, admission policy or stable release was changed. The ordered goals remain the execution authority; next are G1.12a/b, then G1.7/G1.11 qualification and G1.5b admission expansion.

The supervisor, original-script worker, invocation-scoped RPC, native hook/provider bindings, storage and notification writers are implemented in the manifest and installer. The host remains an internal server-only opt-in (`POCKETRISU_BG_PLUGIN_HOST_CANDIDATE=1`), OFF by default. No HTTP/client flag enables it. Existing admission is unchanged. Implementation presence is not original MARP qualification.

## Lifetime decision

The user chose one process per plugin per operation on 2026-10-03 KST. A process remains alive across that operation's input, ax, main and postprocessing, then terminates. In-memory caches are not carried to the next operation. The user also explicitly requires a generic host API extension rather than Vertex- or opencode-specific implementation. Original plugin code and optional provider behavior remain intact; no dedicated provider cache is added.

Original MARP Lite 0.9.2 inspection found that its before-request callback clears its configuration promise and reads current pluginStorage and arguments on every invocation. Startup registers onUnload, then beforeRequest, then UI settings/button callbacks. This observation does not qualify MARP execution or establish every plugin's lifetime requirements.

## Implemented process boundary

`bgPluginSandbox.cjs` starts a random, exact-name systemd user scope containing prlimit, bubblewrap and Node. It requires Linux and Node 25 or later, a reachable user manager, bubblewrap and the current Node executable's resolved dynamic libraries. Failure does not select an unrestricted fallback.

The namespace exposes only the Node binary, trusted self-contained bootstrap file, shared libraries, proc/dev and bounded temporary storage. The child has no inherited application environment. Namespace isolation, dropped capabilities and disabled nested user namespaces supplement the Node permission model; the Node model and JavaScript VM are not security boundaries against hostile code by themselves. No seccomp syscall filter is implemented.

Per-worker limits are 256 MiB memory, no swap, 24 tasks, one CPU equivalent, 128 descriptors, zero core dumps and a bounded runtime (600 seconds by default, at most 900 seconds). A dedicated shared slice bounds workers to 1 GiB, no swap, 256 tasks and one CPU equivalent; the host application is outside it. The main-thread launch and bubblewrap parent-death linkage are checked separately from normal cancellation.

RPC uses dedicated fd 3, not console stdout: 8 MiB frames, 16 MiB outgoing backlog, 16 MiB/s and 8,192 frames/s per peer, with parent aggregate 64 MiB/s backpressure. Raw diagnostics go to the null device. Intentional Risuai log/alert calls use notifications. Incremental parsing scans only new data, grows buffers geometrically and releases large capacity. Trusted-handler failures have distinct codes. Fixed-window rates permit boundary bursts. The dispatcher validates methods and live parent-issued invocation identities. Bounds include 64 pending calls, 256 function/signal handles, 64 streams, depth 64 and 100,000 nodes; callable own `then` is rejected before Promise resolution. Invocation chains stop at depth eight.

## Native API and lifecycle

Enabled plugins load in database order without rewriting scripts or adding a script allowlist. The browser-equivalent async wrapper must finish evaluation and reach two quiet causal-RPC event-loop checkpoints. Arbitrary delayed timer registration is unsupported; registrations freeze after ready. Script/version/order changes disable affected entries after input refresh; newly enabled plugins are reported rather than loaded midway.

The native detached bundle exposes before/after replacers, input/output/process/display script handlers, body interceptors and providers. Transform failures disable only the affected plugin and preserve the previous chain value. Ordinary provider failures preserve native retry policy; structural failures cannot fabricate success. Native streaming-provider behavior is preserved, including its lack of afterRequest invocation.

Each callback captures its input/main/header async context. Returned streams retain authority until drain/cancel; abandoned streams can retain bounded handles until operation close. Late timers cannot borrow another callback's authority and receive one late-call notice. onUnload has a one-second allowance without authority to start new effects, followed by OS teardown.

Network APIs delegate to native fetch/risuFetch and requestChatDataMain, preserve custom targets and native blacklist, propagate operation/invocation cancellation and G1.11 header identity. runLLMModel defaults to blocking nested plugins. No Vertex/opencode-specific cache is added.

Saved permission grants/denials and periodic expiry are read from the existing store; no confirmation or grant is fabricated. Native script-hash permission identity is not an execution allowlist. Allowed DB/character/chat/metadata reads use native projection and bounded snapshots. UI registration/container helpers are no-ops and getRootDocument returns null. Arbitrary IPC, sendChat, whole-database/character setters, storage clear, foreign arguments and foreign interceptor removal are explicitly unsupported.

Host budgets: first 16 enabled positions, 4 MiB retained arguments per plugin, 16/64 queued work slots per plugin/operation, 128 outbound calls, two queued storage writers, 64 writes/8 MiB per operation and 512 CAS keys. Reentrant outbound calls do not hold work slots needed by their callbacks. These bounds can reject legitimate large workloads.

Root storage writes use the canonical storage queue, per-key compare-and-swap and ownership metadata. Only the matching argument entry is copied; no child-supplied plugins array reaches a native database setter. Full chats/unrelated roots are preserved, durable encoding precedes cache/ETag publication, and publication failure invalidates cache. Local values and sidecars transact together. CAS receipts retain hashes only in memory. A later foreground same-key save can still win native rebase; browser localPluginStorage cache may stay stale until reload. These remain qualification surfaces.

Cold reads use bounded native decompression without migration or warming, captured full-chat references and native metadata merge. Cold characters/unavailable snapshots can refuse a read. The synthetic cold-chat test checks that its sentinel and lastDate survive.

Raw input startup effects use the claimed input lifecycle rather than a fabricated provider-start marker. Losing the per-operation plugin context after durable input attachment creates a terminal error instead of replaying startup/input. The volatile settings execution basis is revoked even if error persistence fails. Input publication may remain recovery-pending; UI wording must not claim visibility or invite blind resubmission. Restart loss does not resume an opaque plugin process.

## Notification persistence and limitations

Frozen v1 retains 48-hour TTL, at most 1,024 rows including corrupt entries, batches of eight and 30-second token leases. V2 adds messages, host limits and late calls; old readers do not claim v2. Only ACKed v2 rows are reclaimable early. Intentional messages have a 256-pending sub-cap and 32-plus-one-summary budget per plugin/operation. Message capacity alone does not abort generation; actual I/O failure or inability to persist a required failure notice does.

Recurring failures atomically store a separate 48-hour receipt keyed by script/API identity, failure kind/phase/API/reason and possible-effect flag, independent of operation/chat. The first occurrence is representative, even after ACK; identical failures in other chats are not individually notified during that interval. This reduces repeated failure pressure, not per-generation notification coverage. New identities/effect classifications remain distinct. Corrupt unrelated receipts are retained, skipped and counted; a corrupt matching receipt fails closed. Distinct failures/corrupt rows can still exhaust capacity. ACK means UI enqueue, not human reading; crash/lease/render boundaries are not exactly-once human delivery.

## Historical supervisor evidence (2026-10-03)

- Explicit Linux integration probe: 15/15, no skipped tests. Command: `node --test scripts/probe-bg-plugin-sandbox.cjs`.
- Read/write, child creation, worker creation and direct network attempts were denied. Child environment contained only PWD.
- Malformed/oversized frames, frame flooding, byte flooding, oversized outgoing frames and nonreading-child backpressure terminated the exact worker.
- Ordinary console output did not corrupt RPC. Trusted handler failure was classified separately.
- A synchronous loop was terminated by deadline and by AbortSignal. Killing the parent during a synchronous child loop left zero non-zombie PIDs from the recorded scope.
- The actual supervisor scope's memory.max was 268435456 bytes; its retained memory.events descriptor reported oom_kill greater than zero after native Buffer allocation.
- Existing patcher tests: 51/51. This does not qualify new runtime integration, which does not exist yet.
- Read-only host inspection found the user manager active with linger enabled. Reboot-without-login and actual PM2-context launch are still untested.

## Consultation and remaining work

Opus 5.5 reviewed the plan and supervisor source, followed by a delta review. Its findings drove dedicated RPC separation, linear parsing, byte budgets, asynchronous linkage discovery, handler error separation and stronger OOM/backpressure assertions. The suggested possibility of spawn error without a close event was contradicted by the Node 25.9.0 child_process documentation; undefined stdio on failed spawn was nevertheless accounted for. The last review additionally identified a cached-rejection recovery issue and minor diagnostics/error/buffer concerns. Those were addressed and the final 15-test probe passed afterward; the final small fixes were not presented as a new whole-product review. Rejected linkage discovery is no longer cached permanently, setup errors expose fixed codes, and absent pipes report startup failure.

The 2026-10-07 Opus 5.5 review identified corrupt-receipt isolation, refresh notice identity, recovery-pending wording and an error/tombstone retention boundary. The replacement-at-failed-position test reproduced a notice conflict before its fix. Registry tracing showed terminal entries can be evicted; revoking the volatile settings basis prevents later re-execution even when durable error publication fails. Final delta review remains pending.

Observed in the continuation before final review deltas: low-level sandbox/worker/session 31/31; host 21/21; eight generated HTTP/SQLite/process modes (normal, disabled, crash-input, crash-analysis, cold-read, provider, provider-stream, retry-after-attach) passed. Same-process retry reused its terminal result with startup effect one, input one, model zero. All requests were synthetic with outbound interception. Frontend 2,117/4 skipped; server 489/12 skipped; compatibility 74/5 skipped; patcher 51; type diagnostics 0 errors/0 warnings; frontend and BG bundle/load builds completed. The stale exact adapter version assertion was updated to 0.7.27 with contract checks preserved. Initial compatibility listen-permission failures passed under the approved runner.

Final delta checks: host22, notification/input23, client70. Post-attach crash, failed settlement with expired registry tombstone, and canonical-publication failure/restart all retained input and startup effect count one with model count zero. Actual Chromium delivered four notices (one v1, three v2 levels), logged four despite first ACK loss/two ACK attempts, displayed none in a new context, and kept markup as plain text with page errors zero. UUID fallback was included. Exact42-pack/1,331-unit/7-collision apply→re-plan0→revert restored1,022 source files with byte/mode mismatch0.

Opus's final delta review found no additional blocking implementation defect in the reviewed fixes; it did not independently execute tests or review the final audit document. Matching corrupt receipts can block that failure group indefinitely; unrelated corrupt receipts also retain capacity indefinitely. Recovery requires backing up the exact affected keys and diagnosing them before any explicit-authorized targeted repair. No automatic purge is provided.

Delivery preflight found that origin/main and live acquired font-target changes while this candidate was in progress. Merge `76bf8a2` preserves them and combines personal-settings versions as `0.5.13`. The final live plan contained only BG changes and patcher state, with no font/language/style rollback. The complete upstream changelog was retained. Opus's merge-specific review found no concrete behavioral loss in the inspected manifest/ownership interaction; it did not run the tests or inspect parent diffs.

## Final integrated validation and delivery

- Integrated frontend: 2,128 passed / 4 skipped. Final BG server: 490 passed / 12 skipped before the font-only merge; server source unchanged by that merge. Compatibility: 74 passed / 5 skipped. Patcher: 51 passed. Focused appearance persistence/assets: 18 passed. Type diagnostics: zero errors/warnings; help keys have no missing definitions and Korean coverage is complete (unused-key warnings retained).
- Integrated frontend and BG bundle/load builds passed. Normal and default-OFF synthetic HTTP modes passed again. Integrated Chromium v2 delivery repeated successfully: four notices/logs, two ACK requests after first loss, new-context repeat zero, markup treated as text, page errors zero, real provider calls zero.
- Final graph: 42 packs, 1,332 units, seven declared collisions, re-plan zero. Exact revert restored all 1,022 baseline files by bytes and mode. Installer: 6,251,741 bytes, mode0755, SHA-256 `1c53c6707e0532a833ee366489c3825d05079ce7306336e7113232ffcb551b0b`; regeneration after commit was unchanged.
- Privacy sweep covered149 changed paths with no new sensitive hits. Six existing synthetic redaction fixtures in the generated installer were checked against unchanged public sources. Candidate branch push does not run the repository's main/PR-only CI; no CI pass is claimed.
- Delivery verified the retained1,618-file full-backup anchor by hash, then created and verified a new91,347,305-byte app/patcher-state backup containing1,615 files and both notification namespaces (zero rows). Existing backups remain. No user records were deleted and no generation was cancelled.
- Apply/build occurred with the service stopped after active generation checks. Database bytes remained unchanged during source/build application. After restart:462 managed files matched,17 served JS assets matched local hashes, five DB quick_checks passed, header settings were unchanged, operation records118→118, input/pending/active0, notification rows0→0, PM2online/unstable restarts0, plugin hostOFF. Two new error-log lines were the retained journal warning/recovery-stall pair; they are not a newly resolved issue.

Implementation commits are `8313d40` (isolation/RPC), `ce48749` (native host/storage/notifications), `a01910e` (candidate packaging) and `76bf8a2` (delivered font preservation). The default-OFF delivery is not activation or MARP qualification. G1.7, G1.5b, real-provider checks and iPhone/aggregate gates remain separate; no stable tag was created. G1.12a is the next implementation unit.

## Rebased continuation line

Following the user's history-alignment request on 2026-10-07, BG commits were rebased onto `origin/main` at `9259550`, including font implementation `35ef255` and delivery documentation `4204ddd`. Continue from `codex/pocketrisu-g16-main-rebased`; the original delivered branch remains unchanged. Commit `985731d` retains personal-settings `0.5.13` and has exactly the same Git tree as the delivered documentation tip `0b8a225`, before this continuation note. Generated-installer conflicts were resolved by rebuilding from source, and both changelog histories were preserved. Patcher tests51/51 and live plan changedFiles0 passed; installer SHA-256 is unchanged. No force push, new deployment or service restart was performed for this rebase.
