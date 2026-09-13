# PocketRisu 1.10 BG server chat save × Archive Center C3 settings context validation

Date: 2026-09-14 KST

Status: **same-process PocketRisu server-generation settings context is
immutable and server-owned; AC device/Go execution context, N+1 queue product
flow, client opt-in, live application, and release are not complete**

## Scope and result boundary

This slice follows the C3 foundation checkpoint at `7aa4529`. Implementation
commits `4ca430a`, `1f44f0a`, `9af40da`, and `dc6e20c`, with final installer
commit `d873e8c`, replace the client-supplied settings reference with a
server-captured execution context.

The snapshot is the exact encoded stripped database that the existing server
generation path would otherwise clone at execution time. It is captured while
the existing storage queue owns admission, held only in the input owner's
process-memory map, and decoded into the detached BG database before input
trigger/script or provider work. The durable command contains only an opaque
server-derived volatile reference, mode, and byte count; snapshot bytes and
their integrity hash are not written to KV, HTTP responses, logs, chat
metadata, or owner projection. The durable 64-hex context digest is random and
content-independent; it binds the operation without hashing a credential-
bearing database into the commit envelope.

This is deliberately not the Archive Center settings contract from plan §6.
AC initialization, device-local allowlisted options, provider overrides, Go
backend common settings, `executionContextId`, and a secret-free public digest
remain C4/C5 work. If the Node process loses the in-memory context, the command
returns `settings_context_unavailable`; it never recreates the operation from
the later current database.

The composed capability remains `inputCommandVersion: 0` and advances only
the diagnostic `inputCommandFoundationVersion` to 2. The current client still
sends no input or server-commit flag, and nothing in this slice was applied to
the live installation.

## Data and control flow

```text
authenticated input request
  → ignore client settingsSnapshotRef
  → ensure canonical fullChatStore + stripped dbCache
  → storage queue
    → encode current stripped database into an immutable Buffer
    → enforce 256 MiB/context and two-context aggregate ceiling
    → assign a random content-independent context digest
    → SQLite transaction writes command + sequence + operation state
    → only after transaction success, publish Buffer to closure Map
  → loadExecution verifies context and canonical base chat
  → route replaces client currentChat with that canonical chat
  → detached preview reads exact context Buffer
  → decode snapshot; no current-db fallback
  → input trigger/script → input journal/receipt → provider
  → terminal/reset removes the volatile context
```

An exact same-process retry reuses the original command record and closure
snapshot even if the current server database has since changed. A new owner
after restart can read the durable command but has no secret-bearing context,
so it blocks before an orchestration run is scheduled.

## Runtime audit v2

### Phase 1 — flat discovery

- admission encodes the current stripped database;
- encoded bytes can contain provider credentials and private host settings;
- the snapshot is held in a closure-level Map keyed by operation;
- the durable record stores reference, volatile mode, and byte count;
- request fingerprint includes the server-owned reference metadata;
- client-supplied `settingsSnapshotRef` remains present in the incoming body;
- same-operation replay reads the existing record before capturing new state;
- map publication occurs after the SQLite transaction returns;
- transaction failure can occur at command, sequence, or operation-state
  writes;
- a new owner after process restart has durable records but an empty map;
- detached preview still has access to the current dbCache fallback path;
- detached preview loads the BG bundle before reading the input context;
- canonical chat and settings database have separate sources;
- client `currentChat` remains present in the transport body;
- input trigger/script and provider run from the decoded snapshot clone;
- terminal, transform-unknown, blocked-edit, and database replacement paths
  can retain or release snapshot bytes differently;
- one snapshot has a byte ceiling;
- several chats can attempt admission concurrently;
- snapshot read returns a defensive Buffer copy and temporarily increases peak
  memory during decode/clone;
- legacy input-version 0 runs still read the existing current database path;
- no snapshot byte is intended for an HTTP response, log, normal chat, or
  durable owner record;
- pack version, manifest graph, installers, and exact target composition
  change.

### Phase 2 — external anchors

| Leaf | Break attempted | External anchor / observed result |
| --- | --- | --- |
| Secret-bearing settings persist under an operation key | Search every snapshot field and KV write, then restart the owner | full bytes and their integrity SHA live only in `settingsSnapshots`; durable metadata is ref/mode/size plus a random content-independent digest. A new owner returned `settings_context_unavailable`. |
| A client chooses another settings snapshot | Send a spoofed `settingsSnapshotRef` in the real route fixture | `normalizeCommand()` does not copy the field; admission creates a deterministic server reference, and the fixture observed a different ref plus the server database bytes. |
| A client pairs a valid base hash with forged chat content | Send canonical `baseChatRevision` beside a different `currentChat` | `loadExecution()` rereads and returns the canonical full-store chat; the route assigns that chat to `serverRunChat`. The result retained the canonical first message, not the spoof. |
| Same-operation retry silently uses later settings | Mutate dbCache after admission and repeat the exact command | admission reused the original request fingerprint and map entry; decoding returned the original snapshot without the later field. |
| Restart silently falls back to current settings | Construct a new owner over the same durable KV and retry load/begin/recovery | load and begin returned `settings_context_unavailable`; recovery reported the same blocked reason. The preview branch throws on missing/invalid context before its ordinary db fallback. |
| Failed admission leaves a usable memory-only context | Inject failure at each of three durable writes | map publication is after transaction success. All three WAL failures left no command row, and the same owner reported snapshot status missing. |
| Canonical base changes after admission | Change the full-store chat before `loadExecution()` | load checks the current server chat against the admitted SHA and returns `base_revision_changed`; client `currentChat` is not consulted. Attachment rechecks again inside the storage transaction. |
| Terminal contexts accumulate | Complete, fail, cancel, block edit, mark transform unknown, or replace the database | terminal settlement, blocked-edit return, transform-unknown marking, and `discardRecovery()` delete the operation context or clear the whole map. Focused stats assertions observed zero contexts after completion, conflict, and reset. |
| Many chats exhaust process memory | Admit distinct commands on three chats | one context is capped at 256 MiB, the map at two contexts/512 MiB logical bytes. The third fixture returned `settings_context_capacity` before a command record existed. |
| Legacy behavior changes without opt-in | Run input version 0 and inspect capability/current client | the snapshot branch requires exact input flag 1; capability remains input version 0 and the client start payload still omits the flag. Existing full suites passed. |
| Snapshot bytes or a secret-derived hash escape through observability | Put a synthetic secret in the snapshot, then search durable row, route response, projection, log, and commit shapes | the secret remained in the in-memory decode only. Input-v1 commit settings identity uses the random context digest; no full bytes or integrity hash leave the owner/preview callback. |
| Exact graph cannot revert | Apply, status, re-plan, and revert the final installer | the 40-pack/999-unit graph had zero changed files on re-plan; all 352 managed paths matched pristine existence, bytes, and mode after revert. |

### Collaborator verification processing

One read-only eight-claim batch followed the requested eight-line schema.
After the mandatory instruction/memory reread, all eight lines were checked
against current source and tests. Seven claims passed; the eighth correctly
reported that the initial implementation had only a per-context ceiling. The
primary turn added the two-context aggregate cap and its three-chat fixture.
Final accounting is 8 findings, 8 valid, 0 discarded, 0 stale. The
collaborator made no file changes.

### Phase 3 — triage

- **Q1 resolved in this slice:** secret-bearing bytes are process-only; client
  settings/chat spoofing cannot select execution state; process loss blocks
  rather than reading current settings; context publication follows durable
  admission; preview has no input-v1 fallback.
- **Q2/Q3 resolved:** immutable same-process retry, canonical-base reread,
  terminal/reset release, per-context and aggregate ceilings, diagnostic
  stats, record schema validation, and explicit foundation capability 2.
- **Q4 prepared surfaces:** a 256 MiB snapshot can temporarily exist as map,
  read copy, decoded object, and JSON clone; representative production memory
  and event-loop cost were not measured. Broader concurrency than one active
  plus one pending context is intentionally rejected.
- **Product blockers:** true N+1 predecessor execution/drain, pending UI and
  ordinary chat-open reconciliation, client opt-in, AC allowlisted device
  snapshot, durable Go execution context, and C6 retention remain open.

## Prepared surfaces

| Item / claim | Resolved through | Exact blocked link | Why this slice cannot close it | Required next observation |
| --- | --- | --- | --- | --- |
| AC device and Go settings | exact PocketRisu stripped DB is frozen in Node memory | initialized AC JS allowlist → typed transport → Go final context → complete/reprocessing reuse | no AC host/provider contract is connected | A/B device settings, `/config/update` during run, v4 prepare/complete, restart and credential-reference fixtures |
| Node restart continuity | durable command survives and fails closed | restore the same secret-bearing context without storing raw secrets | current credential/reprocessing owner has not been integrated | restart before trigger/provider; exact `settings_context_unavailable`, preserved input, no model call |
| Snapshot peak memory | 256 MiB each, two contexts, stats available | representative encode + returned copy + decode + clone peak and event-loop delay | no user content was copied into a benchmark and runtime size distribution is empirical | synthetic size ladder with RSS/heap/external/event-loop measurements; lower cap or projection if unsafe |
| True N+1 | aggregate capacity reserves room for N and N+1 | predecessor terminal receipt → base advance → automatic server drain | owner still rejects a second active command on one chat | N success/failure/cancel/edit crossed with N+1 admission, restart, autosave, and one-time attach |
| Client activation | capability distinguishes product 0/foundation 2 | early composer branch → admission ACK → pending UI → chat-open reconciliation | client intentionally sends no flag | new/old client-server matrix and cold browser recovery before capability 1 |
| Settings context retirement | current terminal/reset paths clear memory | AC awaiting-next-input and late complete references → final safe release | AC contexts do not exist yet and C6 owns joined lifetime | current/previous-turn settlement plus cancellation/reconciliation and bounded retention |

## Verification receipt

- Patcher source tests: **52/52 files passed**.
- Exact C1–C3 server focus: **6/6 files, 58/58 tests passed**.
- Complete target frontend: **153/153 files, 1,742/1,742 tests passed**.
- Complete target server: **27/27 files, 281 passed, 12 skipped**.
- Compatibility: **10 files passed, 1 skipped; 74 tests passed, 5 skipped**.
- Svelte diagnostics: **0 errors, 0 warnings**.
- Production client build: **7,941 modules transformed**.
- BG bundle: **8,861,860 bytes**, SHA-256
  `c62632f122e827c9c30cfbf15450ce22a764c2d56ad602cad68b0076b8db2b85`;
  load condition passed for `sendChat`, `runTrigger`, and `processScript`.
- Complete graph: **40 packs, 999 units, 352 managed paths, 13 ordered
  collisions**; status current, zero-change re-plan, then exact revert with
  **0 existence/byte/mode mismatches** across all 352 paths.
- Final composed-server smoke: root HTTP 200; unauthenticated capability,
  projection, and start HTTP 401; graceful SIGINT flush observed.
- Two installer builds were byte-identical. Both are mode 0755,
  **8,204,909 bytes**, syntax-valid, and SHA-256
  `557ed03db18d80c4391b361f6b3b1e152f9ad1320114c694e0e8544419fc7513`.
- No live apply, PM2 restart, user-data mutation, provider call, AC runtime
  mutation, tag, or release was performed.

## Verdict and next direction

The settings used by a same-process server-owned input are now immutable from
admission through provider start, and their secret-bearing bytes do not enter
durable or public storage. Process loss is an explicit unavailable context,
not permission to use later settings. This closes the PocketRisu-side settings
drift found by the C3 foundation audit without claiming the separate AC §6
contract.

The next PocketRisu step is the true N+1 predecessor state machine and server
drain/pending projection; the next independent AC step is C4's typed
device/backend execution context. Capability 1 and live application remain
behind both the client reconciliation path and the later C6 integration gate.
