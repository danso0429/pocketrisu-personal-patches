# PocketRisu 1.10 BG server chat save × Archive Center C0 validation ledger

Date: 2026-09-14 KST

Status: **C0 contract experiments, C1 server commit primitive, and C2 opt-in
BG result commit complete; C3 projection/hydration/input, same-process settings,
and owner-level N+1 plus the C4 process-memory execution-context foundations
are implemented, but product C3–C7 integration, live application, and release
are not complete**

## Authority and frozen inputs

This ledger executes C0 from the public integration plan in
`nai-studio/docs/POCKETRISU-1.10-BG-PRESERVE-SERVER-CHAT-SAVE-ARCHIVE-CENTER-PLAN.md`.
It records observed experiments separately from the later C1–C7 product work.

| Source | Frozen revision | Observed state |
| --- | --- | --- |
| Personal patcher | `3e69349d3b0ca3bf8011b597e080880238e5fa0a` | matches fetched `origin/main` |
| Archive Center | `026dcbf3b45adcf69b254673d439b24e943115b3` | matches fetched upstream `main` |
| PocketRisu target | `v1.10.0` / `98e968339d1b3f91b9dac85bb3f2ebb5f90f9d14` | fixed target; no live mutation in C0 |

C0 uses synthetic text and fixed responses. It performs no paid provider call,
does not modify user data, does not apply to the live PocketRisu tree, and does
not claim browser-process-exit evidence.

## Direction

The implementation remains two coordinated ownership tracks with one later
compatibility cutover:

1. PocketRisu owns input admission, generation, chat/effect commit, mutation
   sequence, receipts, owner projection, and client reconciliation.
2. Archive Center Go owns route binding, execution claims, source watermarks,
   immutable execution context, durable prepare disposition, turn decisions,
   and raw/derived memory processing.
3. Archive Center JavaScript remains a narrow host adapter for device settings,
   official host observations, exact payload application, output conversion,
   and HUD projection.
4. C6 joins those tracks. C7 alone may qualify the combined package and actual
   Ubuntu/browser-exit behavior.

Existing v1–v3 Risu host facts must not be relabelled as PocketRisu server
facts. Existing result KV/ACK delivery also must not be relabelled as a normal
chat commit.

## C0 execution order

The order below refines the plan's five P1 bundles without changing its C0
exit criteria.

| Slice | Contract question | Primary evidence | State |
| --- | --- | --- | --- |
| C0-ENV | Can the fixed AC baseline and candidates run against disposable MariaDB/Chroma data without touching the future production install? | verified release staging, alternate loopback ports, readiness/schema smoke, process/readback receipt | **complete for the unmodified 4.3.1 baseline** |
| C0-A | Can existing prepare/complete source contracts honestly represent the server host? | positive/negative Go characterization probes | **complete: new typed contracts are required** |
| C0-B | Can one owner atomically claim a current route binding and can every terminal outcome release only its own epoch? | store-level concurrent acquire/status/settle tests plus route-remap fence | **store primitive complete; authenticated product route remains C4** |
| C0-C | Can ordered host mutations survive gaps, retries, restart, and stale workers? | durable intent/`ingestedSeq`/`safeSeq` state-machine tests | **store primitive complete; Node writer and product route remain C1/C4/C6** |
| C0-D | Can prepare registration prevent a second paid execution after response loss or restart, and can skip fence a late result? | durable prepare registry and timeout/ready CAS tests | **store primitive complete; HTTP/provider/startup integration remains C4/C6** |
| C0-E | Can N+1 remain outside canonical chat until its turn, and can Node commit a result with chat, metadata, effects, intent, and owner in one replay boundary? | queued-input and server-commit failure-injection harness | **complete: current owners fail; C1/C3 split primitives are required** |
| C0-F | Do output stages remain foreground/BG-equivalent, and can a blank browser discover ownership after result TTL cleanup? | stage parity fixture and revision-bound projection fixture | **complete: current result/projection are insufficient; C2/C5/C6 contracts required** |
| C1 | Can Node commit chat, metadata, effects, intent, owner, operation state, and receipt in one replay boundary? | split journal plus WAL-mode SQLite failure injection and recovery | **primitive implemented and called by the opted-in C2 server path; product lifecycle remains open** |
| C2 | Can an opted-in detached BG final result reach the C1 owner and normal chat storage without a browser save? | exact route-to-owner fixture, recovery/route failure cases, complete graph lifecycle and server smoke | **internal opt-in server path implemented; current client remains unopted and C3/C6 own hydration, projection, retention, and reconciliation** |
| C3 foundation | Can the server own pre-canonical input state, expose revision-bound message ownership, let a client adopt a committed normal chat without replaying legacy effects, and preserve one successor's exact predecessor lineage? | input/commit/projection owners, immutable same-process settings context, N+1 terminal/revision fixtures, foreground/cold-boot hydration fixtures, publication/slot race injection, complete target and graph gates | **foundation implemented; capability remains 0 until automatic drain, receipt-scoped dynamic effects, pending/chat-open reconciliation, client opt-in, and the separate C4 AC settings contract close** |
| C4 context foundation | Can AC freeze one explicit device/backend settings snapshot without persisting or publicly hashing secret values? | typed allowlist, process-memory owner, exact replay/conflict, configuration-lock, secret-independence, capacity/restart and full race fixtures | **capture owner implemented; no HTTP/HostPrepare/provider caller, resolver, release, or product capability exists** |

C0-B precedes the other AC write experiments because claim/binding epochs are
inputs to prepare, mutation, and settle identities. C0-E begins with a focused
Node harness before any BG manifest hook changes. C0-F does not broaden PDF,
browser epilogue, reroll, continue, or multi-response support without its own
fixture.

## Archive Center installation boundary

The parent plan includes an integrated AC JS/Go compatibility deployment and
real Ubuntu tests, but it does not define a fresh production installation as a
C0 prerequisite. This host currently has no standard Archive Center systemd
unit, install root, process, or listener on the documented default service
ports.

The source checkout's Linux preflight completed with no hard failures and a
`yellow/degraded` support level. It confirmed Linux arm64, a writable external
test-data parent, and an available Go toolchain. It also reported that the Go
backend binary is not built and that MariaDB and ChromaDB are not installed;
the managed installer must prepare those dependencies.

C0 therefore adds an isolated baseline installation with these rules:

1. Stage the checksum-verified 4.3.1 Linux arm64 release with
   `scripts/install-github-release.sh --install-dir <isolated-install-root>`;
   do not use the fresh-install wrapper that selects `/opt` and systemd.
2. Use a separate disposable data root and three alternate loopback ports for
   Go, MariaDB, and ChromaDB. Do not reuse future production data or ports.
3. Let the packaged managed launcher install/bootstrap its pinned runtime,
   schema, and vector service only after explicit authorization for system
   packages and long-lived local processes.
4. Verify the unmodified 4.3.1 `/version`, `/ready`, schema, source contracts,
   and restart recovery before substituting any candidate binary.
5. Keep `Archive Center.js` out of the live PocketRisu plugin list during C0;
   host behavior uses official-shape fixtures until the C5 adapter exists.
6. Reuse the isolated data only for migration/restart experiments. Production
   installation remains a C6/C7 compatibility cutover after the client,
   PocketRisu server, AC JS, and AC Go capabilities agree.

The release installer supports a custom non-systemd install root. Its POSIX
launcher owns MariaDB package installation, a managed ChromaDB 1.5.9 virtual
environment, data initialization, schema bootstrap, and process startup. C0
does not replace that path with an ad-hoc Docker stack or manually invented
runtime layout.

### C0-ENV observed receipt

- GitHub Latest resolved to non-draft, non-prerelease `v4.3.1`. The selected
  Linux arm64 asset was 16,193,522 bytes with SHA-256
  `fb439f6cc530e0a56eb4371a77d0b6e8d3d23de4b8cb7bead6c58499b038171e`;
  the checksum asset digest was
  `23cf99bcb963498c8b2ebe7fd36f44d8f9055d6656af5341ae2ae6e96515f39d`.
- The custom non-systemd install selected release `v4.3.1`, and every entry in
  the package's internal `SHA256SUMS.txt` verified successfully.
- The managed launcher installed the Ubuntu MariaDB 10.11.14 client/server
  packages and a private Python environment containing exactly ChromaDB
  1.5.9. The package install automatically enabled and started the distro
  MariaDB service on its default port; that unintended non-isolated service
  was stopped and disabled. No database files were deleted.
- The first managed start correctly used the alternate MariaDB and ChromaDB
  ports but inherited the package's all-interface backend bind default. It was
  stopped immediately, all three ports were observed closed, and the same data
  was restarted with an explicit loopback backend bind.
- Kernel listener readback then showed the Go backend on 28192, MariaDB on
  33192, and ChromaDB on 8192, each bound only to `127.0.0.1`.
- MariaDB initialization and the first schema run reported 142/142 statements,
  all thirteen migration files, managed-account verification, and the intended
  disposable data directory. Direct SQL readback reported 81 Archive Center
  tables and `CHECK TABLE session_route_bindings` returned `OK`.
- `/version` returned 4.3.1, while its packaged `commit` and `go_version`
  metadata remained `unknown`. Runtime provenance is therefore bound to the
  verified release asset and internal file checksums rather than those two
  endpoint fields. `/ready` returned `ready`, `store_ready`, `vector_ready`,
  and `reference_vector_ready` true, `degraded=false`, and the expected
  `full_local` / `mariadb_authority` / `local_native` owners. The ChromaDB v2
  heartbeat responded.
- A controlled stop closed all three C0 listeners. Restarting from the same
  isolated data repeated schema readback, returned the same 81-table count and
  route-table check, restored ChromaDB heartbeat, and returned full readiness.
- The restarted baseline remains in the dedicated `archive-center-c0` tmux
  session. It is not registered as a system service and its JavaScript plugin
  is not loaded into live PocketRisu.

This receipt qualifies only the unmodified 4.3.1 disposable runtime substrate.
It does not qualify the C0 claim, mutation, prepare, server-host, or chat-commit
contracts and does not count as the plan's browser-process-exit evidence.

## Started evidence

### Baselines

- Patcher `npm test`: 47/47 test files passed at the frozen revision.
- Archive Center focused baseline: 43 matching prepare-source,
  complete-source-acceptance, complete-idempotency, and range-decision tests
  were selected; the `internal/httpapi` package passed.
- After adding the two C0-A probes, the full Archive Center
  `internal/httpapi` package passed with loopback sockets enabled; the
  sandbox-only run stopped at an `httptest` loopback-listen permission error
  before exercising the package.
- Toolchain: official `go1.26.6.linux-arm64.tar.gz`; downloaded SHA-256 matched
  `d0507e9e9d7fe012aae570108cbd76c15de879e17130ab8cb90d4d7445cb1f2e`.

### C0-A characterization

The test-only Archive Center probe
`go-service/internal/httpapi/pocketrisu_server_contract_probe_test.go` records
two current-source observations:

Local Archive Center commit: `a932234` (`test(host): characterize PocketRisu
server contract gap`). No upstream remote write was attempted.

1. Honest prepare provenance using `pocketrisu_canonical_chat` at
   `server_input_committed` is rejected as
   `current_user_input_provenance_invalid`; memory reads and injection remain
   disabled.
2. `source_acceptance_observation.v1` has no typed server host, operation, or
   commit-receipt identity. Changing those unknown JSON fields from a trusted
   PocketRisu shape to unrelated values still produces acceptance and the same
   source revision.

The two characterization tests passed. This is evidence that the current
contracts cannot carry the proposed server semantics; it is not evidence that
the proposed `pocketrisu_prepare_host_observation.v1` or
`source_acceptance_observation.v4` has been implemented. C4 must replace these
baseline expectations with positive and adversarial tests for the new typed
contracts.

### C0-B durable execution claim primitive

Archive Center local implementation commit `2b16b56` adds an optional
`HostSessionExecutionStore` and additive migration 014 without mounting an HTTP
route. Validation/audit commit `3fad4ae` records the external anchors and
`486e599` records the final isolated-runtime readback. One canonical AC session
has one active slot; immutable terminal outcomes preserve operation/end-event
replay after the slot advances.

Observed boundaries:

- the existing route binding is reread under a serializable transaction and an
  opaque epoch changes with route revision;
- two different host bindings resolving to one canonical session produce one
  `acquired` and one `wait`;
- identical active acquire returns the same claim, while a changed binding or
  required host sequence cannot borrow it;
- settle inserts the terminal outcome and clears only the exact
  operation/claim epoch in one transaction;
- route change produces a fenced `binding_changed` terminal, and its late
  replay does not clear the newer owner;
- all ten admitted terminal reasons release the slot for a later claim;
- terminal replay still wins after a later route change or binding removal;
- MariaDB 1205/1213 retries are bounded to three immutable transaction
  attempts; the first real concurrent run exposed 1213 and the corrected run
  converged;
- the content session-migration contract remains v4; the two coordination
  tables are explicit metadata exclusions rather than copied story content;
  and
- no production Go caller, HTTP route, JS adapter, or capability advertises
  this primitive yet.

Verification observed sixteen focused tests, the full store package, the full
Go repository, `go vet ./...`, unchanged-JavaScript syntax, and the focused Go
race detector. The production schema loader applied the complete fourteen-file
inventory twice at 144/144 statements plus 103 compatibility statements.
Disposable MariaDB readback showed the expected slot/outcome schemas and unique
keys; post-test synthetic slot/outcome/route counts were 0/0/0.

The final Linux arm64 source build is 36,510,228 bytes with SHA-256
`a627ac978e561ede435ad71a18b92f34c2ba61fdbd8736bc662b39d38345b722`.
Because the store interface is deliberately uncalled, the production linker
retains zero host-execution contract/table strings. That is proof of current
non-reachability, not product support.

The detailed discovery → external-anchor → triage report is Archive Center
`docs/pocketrisu-host-session-execution-c0-validation.md`. It keeps the
following gates open for C0-C/C0-D/C4/C6: per-binding mutation watermarks,
authenticated/versioned host transport, nonterminal phases, receipt/context
references, terminal retention/compaction, admin-reset semantics, and actual
backend-process restart through the mounted route.
The report SHA-256 is
`cec933f48f50ac451bea0d0852512e168a2966dc8ee25d58ff704bc5b9195a01`.

### C0-C ordered host-change and source-safety primitive

Archive Center local commits `17fcdd1` and `d063b68` add an optional
`HostChangeStreamStore`, migration 015, exact binding-stream watermark checks,
and transactional mutation safety without mounting an HTTP route. Commit
`6866ccd` adds real durable vector-delete readback, and validation commit
`701f1ad` records the discovery → external-anchor → triage audit.

Observed boundaries:

- the exact `(host instance, character, chat, binding epoch)` stream owns
  independent durable `ingested_seq` and `safe_seq` values;
- immutable event receipts reject event-fingerprint and sequence collisions,
  return the first missing sequence, and replay exactly after store restart or
  route remap;
- concurrent sequence 3/4 delivery converges after the reported gap, while a
  new binding epoch begins at sequence 1 and cannot inherit the old stream;
- content-changing events enter pending, and individually safe
  `ac_skip`/`operation_end` events cannot leap over an earlier pending event;
- an edit/delete/reroll/branch is safe only after its stored identities match
  source history; an unobserved target remains pending;
- a matched edit invalidates source revisions from the earliest matched turn,
  rejects leased critic/vector work, durably queues vector deletes, removes
  stale raw/derived Archive Center tail projections, and advances only the
  contiguous safe prefix in one MariaDB transaction;
- a read-exclusion write failure rolls the transaction back before any safety
  receipt or watermark ACK;
- the same safety transaction records an immutable invalidated/deleted outcome
  and releases only the active execution claim, after which a new acquire at
  the new required sequence succeeds; and
- input/response safety, missing-source reconciliation, multi-stream session
  aggregation, retention, in-memory worker cancellation, and authenticated
  transport remain explicit later gates.

The real MariaDB fixtures covered gap/replay/restart/concurrency/binding epoch
and source invalidation across a store reconnect. The latter started with a
live source, leased reprocessing job, leased vector upsert, raw chat pair, and
aggregate memory. It ended with source `invalidated`, both workers
`stale_rejected`, at least one pending vector delete, zero stale raw/aggregate
readback, late vector completion rejected as `ErrSourceRevisionStale`, a
durable invalidated execution outcome, and a new claim at `safe_seq=1`.

Verification observed twenty-eight combined host-change/host-execution tests,
both disposable MariaDB tests, the full store package, focused race detector,
the full Go repository, `go vet ./...`, and unchanged-JavaScript syntax. The
production schema loader applied the complete fifteen-file inventory twice at
146/146 statements plus 103 compatibility statements. Final post-test readback
showed 85 tables, all four coordination tables `CHECK ... OK`, and zero stream,
event, slot, outcome, or `c0-*` source/job/vector/chat fixture rows.

The final Linux arm64 source build is 36,485,982 bytes with SHA-256
`4125df825f91687aeeabc3fa506e3d900bfd326916d850c17d297e39986b77e3`.
The isolated runtime deliberately remains the unmodified verified 4.3.1
package; it still reports full store/vector/reference readiness and
`degraded=false`, while the distro MariaDB service remains inactive/disabled.
No AC upstream write was attempted.

The detailed report is Archive Center
`docs/pocketrisu-host-change-stream-c0-validation.md`; its SHA-256 is
`6002b0c4f97ea0b89bbee5a31c9d7fd53e4570df46928159b632fb66620f6796`.

### C0-D durable prepare registry primitive

Archive Center local commit `31e3651` adds migration 016 and an optional
`HostPrepareRegistryStore` without mounting an HTTP route or invoking a
provider. Follow-up commits `d15acbd` and `043b587` close the pending
host-change watermark and fenced-claim release gaps. Validation commit
`7decdbb` records the discovery → external-anchor → triage audit.

Observed boundaries:

- `prepareKey` is fixed by host instance, binding epoch, operation, claim epoch,
  and main request; a separate fingerprint binds character/chat, execution
  context, settings, input receipt, source revision, semantic pre-injection
  payload hash, main request type, and protocol;
- two concurrent registrations and starts converge on one durable row/run
  epoch, and only the successful registered-to-running CAS returns
  `start_authorized=true`;
- a running replay never authorizes paid work, while a changed external
  operation, request fingerprint, result, or run epoch returns conflict;
- an at-most-1-MiB valid JSON ready result is compacted, hash-bound, recovered
  after store restart, and replayed without another start;
- running survives reconnect and can be explicitly marked `outcome_unknown`,
  which records unknown external-call disposition and refuses late ready;
- `failed_known` separately records retryability and whether the external call
  was known `started` or `not_started`, but no retry transition exists yet;
- skip clears ready bytes, preserves key/fingerprint/event/reason and a durable
  claim-release receipt, stores an immutable skip execution outcome, and fences
  late results;
- ready/timeout races converge to skipped after the authoritative skip, while
  stale skip after an already terminal operation cannot erase retained ready;
- prepare register/start/result transitions reread route, exact claim, and both
  required/ingested host-change boundaries; `ingested > safe` blocks them;
- source invalidation clears and fences ready/running prepare rows before it
  releases execution, while a late skip after that already-released fence does
  not create another outcome; and
- a binding-change fence with an unreleased old slot can still accept the skip
  tombstone and release only that exact claim.

The real MariaDB fixture covered ready response recovery, running restart,
unknown and known failures, skip ACK replay, concurrent register/start,
ready/timeout race, stale skip after terminal outcome, route-change late ready,
and fenced-claim release. The C0-C fixture additionally proved pending mutation
registration rejection and source-change fencing of a ready prepare.

Verification observed thirty-five combined host-prepare/change/execution tests
(seven prepare-specific), all three disposable MariaDB tests, the full store
package, focused race detector, the full Go repository, `go vet ./...`, and
unchanged-JavaScript syntax. The production schema loader applied sixteen files
twice at 147/147 statements plus 103 compatibility statements. Final readback
showed 86 tables, 33 prepare columns, four indexes, all three prepare CHECK
clauses, all five coordination tables `CHECK ... OK`, and zero prepare/change/
execution or `c0-*` fixture rows.

The final Linux arm64 source build is 36,486,406 bytes with SHA-256
`79d03f143998bd51ecf1fb6d771e06d98a659cbd88c6325012d02e671e652e84`.
The isolated runtime remains the unmodified verified 4.3.1 package and reports
full readiness with `degraded=false`; no AC upstream write was attempted.

The detailed report is Archive Center
`docs/pocketrisu-host-prepare-registry-c0-validation.md`; its SHA-256 is
`2b7cee91a743a70c6d74470cd070b030caecc9b59e9d772e7b492cb2240880f0`.

### C0-E Node storage and input-order characterization

Patcher test commit `1fc03d7` adds five test-only failure/source-order probes;
it changes no managed unit, manifest, catalog, installer, target, or live
process.

Observed boundaries:

- current `chatWriteJournal.stage()` is async; when passed to a synchronous
  SQLite transaction callback its `kvSet` executes after the callback scope;
- durable chat payload can survive while separately written host intent or
  owner/effect receipts are absent or contradictory;
- a new-chat payload replays into `fullChatStore`, but without a stripped DB
  stub normal metadata discovery remains false and the journal must stay;
- the full-chat route correctly stages before memory publication and success,
  but its durable record has no operation/intent/owner/effect envelope; and
- `runServerOrchestratedChat()` strictly saves the already-inserted browser
  message before allocating the operation ID, so it is not pre-canonical N+1
  admission.

Direct C0-E execution reports 5/5 assertions, full patcher `npm test` reports
48/48 files, and the new test passes `node --check`. These observations fix the
C1/C3 design boundary: split async prepare/encode from synchronous durable
write and post-commit publication; commit payload, minimum metadata, intent,
receipts, owner, and required effects in one SQLite recovery unit; and intercept
the supported send path before input insertion/script/autosave.

The detailed report is
`docs/POCKETRISU-1.10-BG-AC-C0-E-NODE-STORAGE-CHARACTERIZATION.md`; its SHA-256
is `a55470d3c4b96ed79ff51ded48d012a688ef5a4e2eb57273aa84aa5023a26ec4`.

### C0-F output-stage and owner-projection characterization

Patcher test commit `8cd6a47` adds five test-only probes against the exact
PocketRisu 1.10 units emitted by the BG manifest adapter. It changes no managed
unit, manifest, catalog, installer, target, or live process.

Observed boundaries:

- the current server result exposes final/intermediate chat, statics/global
  deltas, and errors but no provider→native→AC→prefill→replacement→canonical→
  AC-candidate stage trace; two distinct histories can produce the same current
  projection;
- the exact client still executes merge→strict chat/root save→result ACK and
  has no versioned server-chat-commit branch;
- durable delivery records are operation/chat-level six-field markers, not
  message/source-generation owner records with AC/backfill state;
- both durable marker lookups require a known operation ID and the root list is
  capped at 128;
- the proposed authenticated char/chat/revision chat-state endpoint and
  authoritative coverage contract are absent; and
- after result/local-marker cleanup, a new browser has no operation-free owner
  lookup, so missing cannot be treated as an empty authoritative owner set.

The first harness run was 3/5 because it incorrectly required explicit target
metadata on a universal owned unit. The selector now prefers explicit 1.10 and
otherwise requires one universal unit; the same five probes then passed 5/5.
Full patcher `npm test` reports 49/49 files and the test passes `node --check`.

This fixes the C2/C5/C6 design boundary: preserve the legacy client delivery
path, add a versioned server commit and stage trace, share a pure AC output
transform, and persist authoritative message/source ownership with normal chat
lifetime plus a revision-fenced companion endpoint.

The detailed report is
`docs/POCKETRISU-1.10-BG-AC-C0-F-OUTPUT-OWNER-CHARACTERIZATION.md`; its SHA-256
is `0df92f0ba7431ccbaab7241400b22771bd1e2e979698e50bcf6bdea3a5e4dd63`.

### C1 server commit primitive

Patcher commits `81b2236`, `0e93888`, and L2.5 hardening `268ec7a` split the existing journal into async
prepare, synchronous transaction write, and post-commit publication, then add
an exact-1.10 `bg_server_chat_commit.v1` primitive. Chat bytes, metadata,
input/commit receipt, ordered host intent, message/source owners, per-key
global outcomes, exact statics applied delta, operation `chat-committed` state,
and the immutable recovery envelope share one SQLite commit boundary.

The WAL-mode exact-target harness injected failure after each of nine
synchronous writes, exercised revision/fingerprint/cancellation conflicts,
preserved optional metadata key presence through the real Risu codec, and
recovered a post-commit publication failure without another commit. Focused
lazy and lazy+BG graphs, the full patcher suite, complete exact-1.10 target
tests/diagnostics/build/BG bundle, zero-change re-plan, and 342-path exact
revert all passed with the observations recorded in the detailed report.

At the C1 checkpoint the primitive deliberately had zero production callers.
The later C2 section records the versioned caller; this paragraph remains the
boundary of the C1-only receipt rather than a claim about current HEAD.

The detailed discovery → external-anchor → triage report is
`docs/POCKETRISU-1.10-BG-AC-C1-SERVER-COMMIT-VALIDATION.md`; its SHA-256 is
`de6292babda6502e6edd54b961ee2a1538981662434f81e8dfd7e84ef41cf4e1`.

### C2 opted-in BG result commit

Patcher commits `f59ceb1`, `d4928e3`, `d1c97df`, and `23d44cf` connect the
exact-1.10 detached terminal result to the C1 primitive behind
`serverChatCommitVersion=1`. They bind the canonical pre-run chat revision and
server settings digest, persist the negotiation in operation state, publish
chat metadata/globals/statics/fullChatStore state, and expose the same durable
receipt through status, cancel, and result-cleanup paths.

Operation-specific journal rows and a transaction-allocated sequence preserve
multiple unflushed commits in creation order. Recovery avoids eager database
load when no rows exist, refuses duplicate sequence identities, and skips a
previously applied envelope rather than rolling the current chat back.
Database replacement deletes each envelope's exact operation state/result and
the next sequence is seeded above the restored canonical ledger. Queued retry
negotiation and canonical-base drift are rejected before provider scheduling.

The exact detached route fixture uses a fixed no-provider result with the real
commit owner and journal codec. It observes the normal chat, metadata, statics,
operation state, and result receipt without a browser save. Patcher tests,
focused target tests, complete frontend/server suites, Svelte diagnostics,
production and BG bundle builds, maximum graph apply/re-plan/revert, and a
loopback server/auth smoke are recorded in the detailed report.

The current client intentionally sends no C2 flag, so existing browser
merge/save/ACK behavior remains active. The following C3 sections record the
input/projection/hydration, immutable settings, and owner-level N+1
foundations; client activation, automatic drain, receipt-scoped effect
lineage, conflict copy, AC transport, and bounded reconciliation/retention
remain C3–C6 work.

The detailed discovery → external-anchor → triage report is
`docs/POCKETRISU-1.10-BG-AC-C2-SERVER-RESULT-COMMIT-VALIDATION.md`; its SHA-256
is `0737e5ec0f90f90fba9fd176957991aad74fab55d86bdbd3239eda6d766a6892`.

### C3 projection, hydration, and input foundations

Patcher commits `99d681b`, `d10c62f`, and `87dcf54` add a revision-bound
message-owner projection, authenticated char/chat/revision lookup, receipt-
aware foreground/cold-boot hydration, and preservation of server-owned root
state through full and patch client writers. A committed result now adopts the
normal server chat and sync baseline, skips legacy merge/save effects, follows
one newer projection revision, and requires the exact operation owner before
acknowledging an older receipt.

Commits `d2012d8`, `5351932`, `a318c8c`, and `47a016b` add the pre-canonical
server input store and route foundation. They bind operation/input/message
identity, base revision, admission sequence, predecessor, transform lifecycle,
input receipt, global intent, and an operation journal. Exact operation replay
is idempotent, cross-operation command reuse conflicts, interrupted transform
becomes unknown, terminal attachments recover, descendants are not rolled
back, and global conflicts before or after the transaction prevent provider
work.

Commit `0203ea6` keeps the incomplete protocol unadvertised and permits
receipt hydration through an authoritative descendant. Commit `db72ec0`
separates local semantic revisions from server encoded-byte SHA revisions and
delays NodeStorage sync-baseline adoption until the local slot CAS succeeds.
Final installer commit `09ee8e0` contains the reproducible checkpoint.

The observed final gates are patcher 52/52 files; focused server 56/56 and
client 11/11 tests; frontend 153 files/1,742 tests; server 27 files with 279
passed and 12 skipped; compatibility 10 files passed and one skipped with 74
tests passed and five skipped; Svelte 0/0; 7,941-module production build; and
an 8,861,860-byte BG bundle whose load condition checks `sendChat`,
`runTrigger`, and `processScript`. The 40-pack/998-unit/352-path graph had 13
ordered collisions, current status, zero-change re-plan, and zero exact-revert
existence/byte/mode mismatches. Final installers are 8,187,942 bytes, mode
0755, and SHA-256
`8c8222c0a56f46cdb2ae319ff327961af36079c51bd1a3ad67e81aa7a706f1a3`.

This is not the C3 product exit. Capabilities report
`inputCommandVersion: 0` and `inputCommandFoundationVersion: 1`, while the
current client sends neither the input nor server-commit flag. The settings
reference is not an immutable snapshot, the owner admits only one active
command rather than true N+1 pending lineage, ordinary chat-open/blank-browser
pending reconciliation and UI are absent, and C6 still owns conflict and
retention policy. No live PocketRisu, PM2, user data, provider, or AC runtime
was changed.

The detailed discovery → external-anchor → triage report is
`docs/POCKETRISU-1.10-BG-AC-C3-FOUNDATION-VALIDATION.md`; its SHA-256 is
`720c7b88d12168ebb3eb65c2a1b9b25e19bd586109be1e90eeb4cf7f04443414`.

### C3 same-process immutable settings context

Patcher commits `4ca430a`, `1f44f0a`, `9af40da`, and `dc6e20c` replace the
arbitrary client settings reference with an exact server-captured stripped-
database snapshot. Secret-bearing bytes and their integrity hash remain only
in the input owner's process-memory map; the durable command carries a server-
derived volatile ref, mode, byte count, and random content-independent digest.
Exact retries reuse the first bytes, while a new owner after restart returns
`settings_context_unavailable` instead of reading the later current database.

The detached preview decodes that snapshot before input trigger/script or
provider work and has no flag-1 fallback to current dbCache. `loadExecution()`
also rereads the canonical full chat and replaces the transport's
`currentChat`, so a correct base hash paired with forged client content cannot
change the transform ancestor. Snapshot publication occurs only after the
admission transaction succeeds; completion, failure, cancellation,
blocked-edit, transform-unknown, and replacement cleanup release the volatile
context.

One context is capped at 256 MiB and the current N/N+1 scope admits at most two
volatile contexts, exposing a 512 MiB logical ceiling and read-only stats. A
third distinct-chat fixture was rejected before its command record existed.
This is a Node same-process execution context, not the plan §6 AC allowlist or
Go `executionContextId`; those device/provider/backend settings remain C4/C5.

The final observed gates are patcher 52/52 files; focused server 58/58;
frontend 153 files/1,742 tests; server 27 files with 281 passed and 12 skipped;
compatibility 10 files passed and one skipped with 74 tests passed and five
skipped; Svelte 0/0; and a 7,941-module build. The complete graph is 40 packs,
999 units, 352 paths, and 13 ordered collisions with zero-change re-plan and
zero exact-revert mismatch. Final installer commit `d873e8c` is 8,204,909
bytes, mode 0755, and SHA-256
`557ed03db18d80c4391b361f6b3b1e152f9ad1320114c694e0e8544419fc7513`.
Capability remains input 0/foundation 2, and no live or AC state changed.

The detailed discovery → external-anchor → triage report is
`docs/POCKETRISU-1.10-BG-AC-C3-SETTINGS-CONTEXT-VALIDATION.md`; its SHA-256 is
`4bb430698533b8bc540de7c4455846bfc53c3404a6f5db2cc87ea73a56d89546`.

### C3 owner-level N+1 predecessor foundation

Patcher commit `11460f3` admits one successor outside canonical chat storage,
assigns the exact previous operation and adjacent server sequence, and advances
the successor's effective base only after an observed predecessor terminal
lineage. An active predecessor returns a non-scheduling HTTP 202; completed
work waits for its result revision to become canonical, failed/cancelled work
retains the attached-input or zero-change base, and unknown/blocked/non-
adjacent predecessors fail closed. A third nonterminal command is refused.

Audit follow-up `bb39b36` corrected two over-broad settings behaviors. Dynamic
root overlay now runs only after predecessor resolution, so the head command
keeps its immutable admission context, and it no longer copies unrelated
selected-character chat metadata. Current globals/statics/ownership roots are
still not attested effect-by-effect to the predecessor; that remains an
explicit C6 activation blocker. Final installer commit `7c5b7c1` contains this
checkpoint.

Observed final gates are patcher 52/52 files; focused server 7 files/66 tests;
frontend 153 files/1,742 tests; server 28 files with 289 passed and 12 skipped;
compatibility 10 files passed and one skipped with 74 tests passed and five
skipped; Svelte 0/0; and a 7,941-module production build. The unchanged BG
bundle is 8,861,860 bytes and loads `sendChat`, `runTrigger`, and
`processScript`. The 40-pack/1,001-unit/354-path graph has 13 ordered
collisions, zero-change re-plan, and zero exact-revert existence/byte/mode
mismatches. Final installers are 8,228,941 bytes, mode 0755, and SHA-256
`7cfb3dd419915ac8b3fbce32dc08d4c7b14a48e1ca5b5d69d67c9c04aa2a9e0f`.
The N+1 checkpoint kept capability at input 0/foundation 3. Connection
hardening commit `3315e4d` advances only the diagnostic foundation to 4;
capability remains input 0. There is no automatic drain, ordinary
client opt-in/pending UI, AC execution, live apply, tag, or release.

The detailed discovery → external-anchor → triage report is
`docs/POCKETRISU-1.10-BG-AC-C3-NPLUS1-FOUNDATION-VALIDATION.md`; its SHA-256 is
`6e261c490a25fff62924b205dc4a6eb4e8c21a0270ca29903b57d4a848ef91f8`.

### C3 external-audit connection hardening

An independent audit against `3c27c4b` reproduced cancellation bypass,
completed/edit revision deadlock, interleaved input/response recovery omission,
and transaction-rollback settings loss, and identified a server-owned failure
fallthrough into legacy client persistence. Implementation commit `3315e4d`
addresses those R1–R5 findings without raising product capability.

The input record is now v4. It preserves exact adjacent admission identity and
a separate execution dependency, records completed-result publication, rejects
tampered dependency bypass, and treats current edited/deleted chat as a new
head only when no unresolved execution work remains. Startup performs bounded
input→commit causal passes; attached input publication precedes restart settings
loss. Commit transactions write only durable terminal state, while settings
release and publication marking occur afterward on the storage queue.

Server result/status records preserve `serverChatCommitVersion: 1` for the
candidate path. Foreground and boot clients classify server ownership before
result-order ACK or legacy persistence, retain unresolved results/markers, and
do not convert commit failure into client save. The route fixture now uses an
actual SQLite transaction and connects the resulting receipt/projection to the
client hydration helper.

Observed gates are patcher 52/52, focused frontend 39/39, focused owner/route
49/49, complete frontend 1,743/1,743, complete server 301 pass/12 skip,
compatibility 74 pass/5 skip, Svelte 0/0, 7,941-module build, 40 packs/1,003
units/354 paths/13 collisions, zero-change re-plan, and zero-mismatch exact
revert. The two 8,274,867-byte installers are byte-identical, mode 0755, with
SHA-256 `f750979d2bf1053d01f0c00a3e77f5eba77be3bfc8921765fdd7b4ec390a0215`.

The remaining activation gates are v3 zero-legacy or migration, automatic
drain, admission ACK/pending UI, effect-scoped lineage, actual browser/process
exit, joined retention, and AC lifecycle. Detailed runtime audit and evidence
are in
`docs/POCKETRISU-1.10-BG-AC-C3-CONNECTION-HARDENING-VALIDATION.md`.
Its SHA-256 is
`4126d519afae92433669c68a2eb95693f17d955c8d580600fc0505e1647a3c38`.

### C4 process-memory immutable execution context foundation

Archive Center commit `694c6e8` adds a typed, process-memory context owner that
binds host/character/chat/binding/operation/claim identity to the exact current
device allowlist, backend `RuntimeConfig`, and `memory-preprocessing.json`
snapshot. The 21 prepare settings and current main/critic/embedding/source-
search fields are explicit rather than accepting the whole plugin database.
Runtime and preprocessing are captured under their common configuration lock.

Exact concurrent capture creates one random context ID; an identical replay
reuses it, changed full material conflicts, and load requires the complete
owner identity. Secret-bearing API keys, endpoint values, extra JSON, and
private prompts remain only in the encoded process-memory material. The public
digest depends on non-secret settings and configured-state booleans, not those
private values. A new process returns `execution_context_unavailable` instead
of rebuilding from current global settings. One context is capped at 1 MiB,
with 64 entries and 16 MiB aggregate capacity and no eviction.

AC report commit `c6ec332` records six focused tests plus nine invalid-input
subtests, sixteen-way focused race, complete `internal/httpapi`, complete Go
repository and complete race repository, `go vet ./...`, unchanged JavaScript
syntax, and a clean Linux ARM64 build. The build is 36,486,259 bytes with
SHA-256
`ac9310927f69ebc50ba3b47551b053a4f644a94d975058b33f3c874ee672822c`.
The isolated 4.3.1 runtime remained ready/non-degraded and was not replaced.

Local AC commit `9e23861` subsequently added a captured-only effective settings
resolver with device→backend/config fallback and existing-accessor parity. This
is not C4 product completion. There is no external DTO decoder, authenticated
route, execution-claim/HostPrepare join, production provider/complete accessor,
prompt-file snapshot, startup scan, or terminal context release. Full-repository
race, ARM64 rebuild, and L2.5 after the resolver remain open. No upstream AC
push was attempted. The exact final source tree is additionally preserved as
the 428,942-byte full-index patch
`artifacts/archive-center/pocketrisu-bg-ac-026dcbf-to-9e23861.patch` with
SHA-256 `d70dac9ef7386464ef8bc5bf9fd0259b7b4c821af321325445abc92a5e6d574d`.
An isolated public-base restore staged 28 paths and reproduced candidate tree
`7806dd39f4acfa294ee67f9d7834bc6fed448730`.

The detailed discovery → external-anchor → triage report is AC
`docs/pocketrisu-execution-context-c4-validation.md`; its SHA-256 is
`a3ee48bccf949280bd942d3ba9828675535c4ecbd4966296463d3ce0dff34a05`.

## Existing owners to extend

| Need | Existing owner | Confirmed gap |
| --- | --- | --- |
| Node serialization | `queueStorageOperation`, `fullChatStore`, C1/C2 commit owner, and C3 input/settings owner | admission order and execution dependency are separated in record v4; automatic drain, receipt-scoped dynamic effects, client pending UI, and transport to the unmounted AC context owner are absent; C6 retention remains undefined |
| Chat payload WAL | split `chatWriteJournal` prepare/write/publish/recovery phases plus C2 commit and C3 input operation rows | bounded input↔response causal reconciliation and rollback-safe settings release are wired; actual process-kill timing, bounded retirement, and late-reference safety remain open |
| BG lifecycle/output | generated exact-1.10 `bgOrchestrator.cjs` and `bgOrchestrate.ts` | internal flag 1 can exercise input→commit→hydrate, but capability remains 0/current client unopted; pending UI and C5 output transform remain absent |
| BG delivery ownership | chat/root `bgOrchestrationDelivery` markers, bounded result retention, and `serverChatExecutionState` | char/chat/revision projection exists and reconciles exact owners; ordinary chat-open consumption, AC state, and owner/tombstone lifetime remain absent |
| AC route identity | `SessionRouteBindingStore`, `HostSessionExecutionStore`, and serializable route/claim transactions | store acquire/status/settle and exact-stream watermarks exist; authenticated route, nonterminal phases, and receipt/context links remain absent |
| AC source invalidation | durable source revisions, transactional invalidation/outbox fences, and the C0-C ordered host stream | store primitive is connected; Node durable writer, host transport, input/response completion, and multi-stream aggregation remain absent |
| AC prepare/complete idempotency | durable `HostPrepareRegistryStore`, in-process complete request ledger, durable source records, and C4 process-memory execution context | typed device/backend capture and captured-only effective resolver exist; authenticated HTTP, claim/prepare join, production provider accessors, startup recovery, typed result semantics, and server-host complete receipt remain absent |

No generated `bgOrchBundle.mjs` output will be edited directly. New storage is
additive and remains inside the existing SQLite/MariaDB owners; C0 does not add
a message broker, a second chat database, or a generic plugin runner.

## Commit and gate boundaries

Each slice keeps implementation and its focused receipt independently
revertible. A passing source test does not advance a later state automatically.

1. AC characterization probes (test-only).
2. AC durable binding claim and terminal settle primitive.
3. AC ordered host-change ingestion and source-generation fence.
4. AC durable prepare registry, immutable execution context, and explicit skip.
5. PocketRisu server chat/effect commit primitive (**C1 implementation slice;
   product lifecycle remains open**).
6. PocketRisu opted-in BG final-result/cancel/status connection (**C2 internal
   implementation slice; current client intentionally unopted**).
7. PocketRisu C3 projection/hydration/input foundation (**implemented through
   same-process settings, record-v4 lineage, causal recovery, and
   server-owned failure fences; capability 0 until
   automatic drain, receipt-scoped effects, chat-open UI, client opt-in, and
   C4 AC settings close**).
8. AC C4 typed execution-context resolver/transport, then C5 JS/PocketRisu
   host adapter and output-transform parity.
9. Integrated C6/C7 gates, runtime audit, controlled live candidate, and
   concrete device scenarios.

Before a manifest or managed unit changes, run the current all-or-nothing
focused owner graphs and complete-graph lifecycle from `PATCHER-V2-DESIGN.md`.
The retired subset-mask verifier is historical evidence, not the active
delivery gate. Runtime L2.5 remains separate.

## C0–C4 foundation verdict and product gate

The C0-A through C0-F contract experiments are now recorded. Their result is
not positive product qualification: C0-B/C/D supply store primitives, while
C0-A/E/F prove that new typed host, Node storage/input, output, and owner
contracts are required. C1 supplies the atomic Node commit primitive, C2
connects an explicitly negotiated detached result to it, and C3 now supplies
owner projection, receipt hydration, an unadvertised input foundation, a
same-process immutable PocketRisu settings context, and owner-level N+1
predecessor advancement. C4 now also has an unmounted process-memory owner for
one typed device/backend settings snapshot.
C3–C6 remain responsible for completing and integrating the following product
evidence:

- one fenced execution owner across concurrent foreground/server acquire,
  route remap, late settle, and every terminal outcome;
- contiguous durable host mutation ingestion and a separately established safe
  read boundary, including stale worker writes;
- canonical/payload prepare meaning checks, HTTP-200 suppression distinction,
  and v1–v3 complete regression coverage;
- durable prepare ready/running/unknown/skip behavior without automatic paid
  replay;
- effective resolution/transport/provider reuse of the captured AC
  device/backend context plus automatic pre-canonical N+1 drain,
  receipt-scoped dynamic-effect lineage, pending UI, one input transform, and
  explicit blocked-edit recovery;
- chat/metadata/effect/intent/owner commit recovery across injected process and
  persistence failures;
- output-stage parity and authoritative owner/pending projection from an empty
  browser after BG payload TTL;
- versioned request/response/error DTOs, migration location, entry-point support
  table, and an exact list of unverified combinations.

Until that product gate closes, live support, C7 qualification, stable release,
and browser-exit success all remain unclaimed.
