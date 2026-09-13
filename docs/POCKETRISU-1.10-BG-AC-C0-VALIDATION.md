# PocketRisu 1.10 BG server chat save × Archive Center C0 validation ledger

Date: 2026-09-13 KST

Status: **C0 started; product integration, live application, and release are not complete**

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
| C0-A | Can existing prepare/complete source contracts honestly represent the server host? | positive/negative Go characterization probes | **started: current contracts are insufficient** |
| C0-B | Can one owner atomically claim a current route binding and can every terminal outcome release only its own epoch? | store-level concurrent acquire/status/settle tests plus route-remap fence | pending |
| C0-C | Can ordered host mutations survive gaps, retries, restart, and stale workers? | durable intent/`ingestedSeq`/`safeSeq` state-machine tests | pending |
| C0-D | Can prepare registration prevent a second paid execution after response loss or restart, and can skip fence a late result? | durable prepare registry and timeout/ready CAS tests | pending |
| C0-E | Can N+1 remain outside canonical chat until its turn, and can Node commit a result with chat, metadata, effects, intent, and owner in one replay boundary? | queued-input and server-commit failure-injection harness | pending |
| C0-F | Do output stages remain foreground/BG-equivalent, and can a blank browser discover ownership after result TTL cleanup? | stage parity fixture and revision-bound projection fixture | pending |

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
- `/version` returned 4.3.1. `/ready` returned `ready`, `store_ready`,
  `vector_ready`, and `reference_vector_ready` true, `degraded=false`, and the
  expected `full_local` / `mariadb_authority` / `local_native` owners. The
  ChromaDB v2 heartbeat responded.
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

## Existing owners to extend

| Need | Existing owner | Confirmed gap |
| --- | --- | --- |
| Node serialization | `queueStorageOperation` and `fullChatStore` in the exact-1.10 lazy server owner | no server-level generation commit primitive or focused cross-boundary test |
| Chat payload WAL | `chatWriteJournal` | restores payload but does not create missing chat metadata or carry effect/intent/owner receipts |
| BG lifecycle | generated `bgOrchestrator.cjs` source owned by `patches/bg-preserve.json` | terminal result is parked in KV for a browser consumer; it is not a normal chat commit |
| AC route identity | `SessionRouteBindingStore` and serializable `BindSessionRoute` transaction | no acquire/status/settle, claim epoch, terminal outcome, or source watermarks |
| AC source invalidation | durable source revisions and transactional invalidation/outbox fences | not connected to an ordered PocketRisu host mutation stream |
| AC complete idempotency | in-process complete request ledger plus durable source records | no durable prepare registry and no server-host receipt contract |

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
5. PocketRisu server chat/effect commit primitive.
6. PocketRisu pre-canonical input admission and owner projection.
7. AC JS/PocketRisu host adapter and output-transform parity.
8. Integrated C6/C7 gates, runtime audit, controlled live candidate, and
   concrete device scenarios.

Before a manifest or managed unit changes, run the current all-or-nothing
focused owner graphs and complete-graph lifecycle from `PATCHER-V2-DESIGN.md`.
The retired subset-mask verifier is historical evidence, not the active
delivery gate. Runtime L2.5 remains separate.

## C0 exit gate

C0 remains open until all of the following are recorded with failure-injection
evidence:

- one fenced execution owner across concurrent foreground/server acquire,
  route remap, late settle, and every terminal outcome;
- contiguous durable host mutation ingestion and a separately established safe
  read boundary, including stale worker writes;
- canonical/payload prepare meaning checks, HTTP-200 suppression distinction,
  and v1–v3 complete regression coverage;
- durable prepare ready/running/unknown/skip behavior without automatic paid
  replay;
- pre-canonical N+1 admission, predecessor lineage, one input transform, and
  explicit blocked-edit behavior;
- chat/metadata/effect/intent/owner commit recovery across injected process and
  persistence failures;
- output-stage parity and authoritative owner projection after BG payload TTL;
- versioned request/response/error DTOs, migration location, entry-point support
  table, and an exact list of unverified combinations.

Until that gate closes, C1–C7, live support, stable release, and browser-exit
success all remain unclaimed.
