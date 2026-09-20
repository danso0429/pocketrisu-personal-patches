# PocketRisu 1.10 BG server chat save × Archive Center next-work plan

- Plan date: 2026-09-20 KST
- Starting implementation/evidence checkpoint: `df7fed77700a9695f0a78cb406ee8996c0920349`
- Product capability at start: `inputCommandVersion=0`
- Live application at start: none
- Stable-release authority: not granted by this plan

## 1. Outcome

The target outcome is a qualified integration in which a PocketRisu server can
own a user input, execute foreground or detached work once, apply the same
Archive Center preparation and output semantics, atomically persist canonical
chat/effect state, and allow a fresh client to adopt the result without
creating a competing writer.

This plan advances in dependency order. It deliberately places capability
activation after the C6 execution, change, prepare, effect, ownership, and
retention contracts. A passing source test, route test, or build never promotes
the next phase by itself.

## 2. Non-goals

The continuation does not add:

- a generic message broker;
- a second chat database;
- multi-input unbounded queues;
- cross-restart restoration of secret-bearing model settings;
- an AC plugin runner inside PocketRisu;
- unrelated PocketRisu or Archive Center features;
- a stable tag before browser/device qualification;
- cleanup of pre-existing live user data, conflict copies, backups, or
  unrelated workspace artifacts.

## 3. Dependency graph

```text
H0 checkpoint revalidation
  -> H1 AC-off composed process boundary
      -> H2 C4 production context transport and consumers
          -> H3 C5 host adapter and output parity
              -> H4 C6 unified lifecycle and retention
                  -> H5 C3 client activation and automatic drain
                      -> H6 C7 controlled live/browser/device qualification
                          -> H7 documentation and stable publication gate
```

H2 and H3 may use small independently reviewable commits, but their product
claims remain blocked until H4. H5 cannot begin capability promotion merely
because H1–H3 pass.

## 4. Cross-cutting invariants

Every slice must preserve these rules:

1. There is one execution owner per operation and claim epoch.
2. There is one server chat/effect commit owner per durable result.
3. Client persistence never becomes a fallback for a server-owned result.
4. Adjacent admission order and unresolved execution dependency remain
   separate identities.
5. Input transformation occurs exactly once before canonical append.
6. Stored inputs are recoverable even when execution settings are unavailable.
7. Exact secret-bearing settings remain memory-only.
8. AC final callers use captured context and do not reread mutable globals.
9. The canonical chat revision, commit receipt, owner projection, and effect
   receipts form one explainable lineage.
10. Retry is idempotent; stale workers and late responses cannot overwrite a
    newer owner.
11. Retention ends only after every consumer that can still reference an owner
    has crossed a defined boundary.
12. New and old clients/servers fail closed across the capability fence.

## 5. H0 — fresh checkpoint revalidation

### 5.1 Objective

Confirm that the new session starts from the documented source and has not
silently inherited branch drift, generated-artifact drift, live changes, or an
unverified AC tree.

### 5.2 Actions

1. Follow `POCKETRISU-1.10-BG-AC-FRESH-START-INSTRUCTIONS.md`.
2. Confirm the private patcher branch is clean and its upstream divergence is
   zero.
3. Confirm the public plan commit and SHA-256.
4. Confirm the AC source patch hash and, if AC work is imminent, restore it in
   a disposable checkout and verify the 28-path tree ID.
5. Read current live state only; do not mutate it.
6. Record any contradiction before changing source.

### 5.3 Exit gate

H0 passes when source, documents, generated artifacts, and stated deployment
boundaries are mutually consistent. If a mismatch exists, resolve the
authority conflict first; do not continue from a guessed state.

## 6. H1 — AC-off composed Node process boundary

### 6.1 Why this comes first

The current route fixture proves actual SQLite and loopback HTTP behavior but
runs around a composed handler fixture. It does not prove that the generated
PocketRisu `server.cjs`, startup recovery, normal chat API, or a separate client
process preserve the same ownership contract. Connecting AC before this
boundary would make Node ownership and AC behavior harder to distinguish.

### 6.2 Functional scenarios

Build a disposable exact-1.10 complete target and exercise these scenarios
with AC disabled/unbound:

1. **Start-response loss**
   - submit one server-owned input;
   - hold a deterministic provider gate;
   - observe the start ACK;
   - close the initiating request or client process;
   - release the provider gate;
   - require provider count 1 and server commit count 1;
   - require client save, result ACK, and fallback-provider counts 0.

2. **Normal-chat readback**
   - read the committed chat through the production normal-chat API;
   - verify message IDs, role/order, revision, and commit receipt;
   - verify projection and owner status identify the same operation.

3. **Blank-client adoption**
   - start a client with no local pending marker and no cached chat;
   - open the chat through actual `chatStorage` behavior;
   - require adoption of the server revision without a write-back save;
   - restart the client and require idempotent readback.

4. **Restart boundaries**
   - stop the child process only after the durable input record exists but
     before provider start;
   - stop after provider result durability but before canonical publication;
   - stop after commit durability but before publication-marker cleanup;
   - restart against the same disposable storage and require deterministic
     recovery without duplicate provider or commit.

5. **Commit failure**
   - inject a commit-sequence, chat, metadata, and effect failure separately;
   - require rollback of the full durable transaction;
   - require settings context retention when the transaction rolls back;
   - require server ownership to remain visible to clients;
   - require client save/ACK/provider fallback counts 0.

6. **Retention boundary**
   - expire or remove short-lived result and operation-state payloads in the
     disposable fixture;
   - require the durable input owner to preserve current-path ownership;
   - document the unsupported non-input C2 case rather than silently treating
     it as client-owned.

7. **Causal N+1 recovery**
   - admit input N, complete response N, and durably admit N+1;
   - stop at each boundary and restart;
   - require all durable user messages to reappear in order;
   - require N+1 execution to wait for the correct unresolved predecessor;
   - keep the third-nonterminal fail-closed behavior.

### 6.3 Harness requirements

The harness must:

- spawn the generated production Node entry point as a child process;
- use a disposable database and data root;
- bind only loopback on an ephemeral or explicitly isolated port;
- provide deterministic provider gating and counters without placing test
  secrets in tracked files;
- expose observable counters for provider calls, commits, client saves,
  result ACKs, and fallback execution;
- use the production normal-chat API and production storage adapter at the
  final readback boundary;
- stop the child process cleanly for normal cases and deliberately terminate
  it only in the named restart cases;
- never point at live PocketRisu data.

If test injection requires a production source hook, keep it inert unless a
test-only environment contract is explicitly present. Prefer existing owner
and provider injection surfaces before adding another abstraction.

### 6.4 Likely source and test surfaces

- `patches/lazy-chat-bg-adapter/manifest.cjs`
- `patches/lazy-chat-bg-adapter/files-1.10/server/node/bgServerChatCommitRoutes.test.ts`
- a narrowly scoped process-boundary test beside the server owner tests if the
  current route fixture cannot own child lifecycle;
- `patches/lazy-chat-sync/files-1.10/server/node/server.cjs`
- composed target `server/node/server.cjs` and normal chat routes;
- composed target `src/ts/storage/chatStorage.ts` and existing adoption helper.

Do not edit the composed target to make the test pass. Apply changes to pack
source or manifest ownership and regenerate.

### 6.5 Required evidence

- timestamped child start/stop and operation-state log;
- provider/commit/client-save/ACK/fallback counters;
- normal-chat API payload and revision assertions;
- database integrity after each failure/restart boundary;
- clean rerun proving idempotency;
- focused test receipt;
- if a manifest or managed source changes, regenerated installer and full
  complete-graph lifecycle receipt.

### 6.6 Exit gate

H1 passes only when one AC-off turn completes after the initiating client is
gone, a blank client adopts the canonical server result without writing it
again, restart boundaries recover without duplicate execution, and commit
failure never transfers ownership to the client.

Capability remains 0 after H1.

## 7. H2 — C4 production context transport and consumers

### 7.1 Objective

Mount the existing AC process-memory context and captured-only resolver behind
a strict authenticated contract, then make prepare/complete/provider callers
consume the immutable resolved context without mutable fallback.

### 7.2 Contract design

Define a versioned external DTO with:

- host, character, chat, binding, operation, and claim-epoch identity;
- explicit device context or explicit absence;
- backend context capture result;
- prepare and preprocessing snapshots;
- public secret-independent digest;
- request version, response version, typed result status, and typed error code;
- unknown-field rejection;
- bounded body size;
- authenticated caller identity;
- idempotency identity and replay semantics.

Do not serialize full secret-bearing resolved settings back to PocketRisu.

### 7.3 Store and lifecycle join

The capture owner must join:

- `HostSessionExecutionStore` operation and claim epoch;
- `HostPrepareRegistryStore` prepare identity/disposition;
- host-change ingested/safe boundaries;
- source-generation validity;
- terminal outcome and retention state.

Capture, claim, and prepare identities must reject cross-operation or stale
epoch reuse. A changed material snapshot under the same identity remains a
conflict.

### 7.4 Production accessors

Add context-aware accessors for:

- main generation;
- supervisor;
- critic;
- source search;
- embedding;
- prepare;
- complete.

For every final caller, trace the values to the captured context. Audit prompt
directories and prompt file contents: capture immutable content if a caller
would otherwise reread mutable files, or explicitly prove the file is outside
the operation contract.

### 7.5 Prepare and complete behavior

Implement and test:

- positive and negative host-prepare observation;
- assembled payload identity, not merely HTTP 200;
- one start authority;
- ready replay without paid work replay;
- running→unknown on process restart where continuation is not provable;
- explicit unavailable skip;
- complete source-acceptance v4;
- unchanged v1–v3 behavior and an explicit legacy bypass fence.

### 7.6 Context retention

Before exposing the route, define:

- release on terminal success/failure/cancel;
- retention while the current or next turn can still reference the owner;
- late status and complete retry window;
- tombstone representation;
- capacity accounting and compaction;
- startup handling for in-memory context loss;
- secret redaction in errors and logs.

The existing 64-entry/16 MiB fail-closed registry is not a production
retention policy.

### 7.7 Verification

Run:

- focused handler, store, resolver, and negative auth/DTO tests;
- focused and repository race tests;
- complete Go repository tests;
- `go vet ./...`;
- unchanged JS syntax checks;
- Linux ARM64 build;
- disposable MariaDB migration and restart tests when a durable schema or store
  changes;
- captured-value mutation tests at each final caller;
- log/output secret sweep.

### 7.8 Exit gate

H2 passes when a claimed operation can capture once, prepare/complete and all
provider roles resolve from that capture, stale/cross-owner calls fail closed,
restart loss has a typed outcome, and lifecycle release cannot invalidate a
still-referenced owner.

No PocketRisu client capability is raised at this gate.

## 8. H3 — C5 host adapter and output-stage parity

### 8.1 Objective

Provide the minimum JS/host bridge required for AC to observe and transform the
same logical request/result in foreground and server-owned BG execution.

### 8.2 Work items

1. Export the minimum AC JS device snapshot and host observation contract.
2. Add the PocketRisu API v3 host bridge with explicit capability/version
   negotiation.
3. Observe actual payload application, not just preparation success.
4. Extract a pure output sanitize/prefill helper from the current AC stage.
5. Apply the same helper to foreground and BG candidates before canonical
   commit.
6. Compare canonical result, displayed result, and AC candidate bytes/fields.
7. Remove or fence duplicate browser delivery/backfill hooks for server-owned
   results.
8. Preserve PageFold and memory-PDF behavior where applicable.

### 8.3 Parity matrix

Cover at minimum:

- streaming and non-streaming;
- AC off, AC on, and AC unavailable/degraded;
- device complete, device partial, backend-only, and missing settings;
- foreground and detached BG;
- current-turn and previous-turn completion;
- output injection on and off;
- prefill and sanitize enabled/disabled according to captured settings.

### 8.4 Exit gate

H3 passes when foreground and BG use the same pure transform contract and one
canonical commit path, while AC-off behavior remains byte/semantically
equivalent to the pre-integration path.

## 9. H4 — C6 unified lifecycle and retention

### 9.1 Objective

Close the contracts that determine whether capability activation is safe.

### 9.2 Execution and claim

- join the Node queue head to the AC execution claim;
- reject concurrent foreground/server ownership;
- fence route remap and claim-epoch changes;
- represent every terminal result: completed, failed, cancelled, skipped,
  unknown, and conflict;
- prevent late settle from an old worker.

### 9.3 Change and source lineage

- write durable host-change intent from PocketRisu;
- transport changes contiguously;
- keep ingested and safe watermarks distinct;
- aggregate required streams explicitly;
- invalidate derived sources transactionally;
- prevent stale vector/source writes;
- decide complete-time supersession behavior.

### 9.4 Prepare lifecycle

- implement prepared/skipped compare-and-set ownership;
- reconcile current and previous turns;
- use explicit unavailable skip rather than implicit success;
- preserve one paid start authority;
- define recovery for running, ready, unknown, and stale claims.

### 9.5 Effect provenance

Replace unrestricted current-root overlay with receipt-scoped transitions.
Each global/static/owner-root effect applied to N+1 must prove that it derives
from the admitted predecessor operation. Inject unrelated concurrent changes
and require conflict rather than silent adoption.

### 9.6 Response loss and adoption

- lose the start response, prepare response, complete response, and result ACK
  independently;
- recover from durable status without provider replay;
- allow an empty client to discover ownership and canonical result;
- prevent client save/ACK/fallback at every server-owned failure state.

### 9.7 Retention model

Define a joined retention table for:

- input owner;
- result payload;
- operation state;
- commit receipt;
- projection;
- settings/context owner;
- prepare owner/result;
- execution claim;
- change/source receipts;
- effect lineage receipts;
- terminal tombstone.

For each item specify creation, readers, terminalization, minimum lifetime,
late-reference behavior, compaction trigger, and recovery after partial cleanup.
Validate both the input-command path and the older non-input C2 path, or reject
the unsupported path during negotiation.

### 9.8 Conflict policy

Specify and test:

- edit before start;
- edit after predecessor publication;
- answer deletion;
- reroll;
- branch/fork;
- chat deletion;
- conflict-copy behavior;
- route remap;
- late result after a newer revision;
- user cancel racing commit.

No policy may overwrite unrelated user edits.

### 9.9 Exit gate

H4 passes only when P1-1 through P1-5 and the activation-critical ownership and
retention portion of P2-2 have integrated, restart-aware evidence. Passing H4
authorizes work on capability promotion; it does not itself activate clients.

## 10. H5 — client activation and automatic drain

### 10.1 Automatic drain architecture

Implement one operation-keyed, response-free coordinator that owns:

- pending-input polling;
- predecessor revalidation;
- execution scheduling;
- durable outcome transition;
- bounded retry/stall state;
- cancellation and conflict observation.

The coordinator must not retain an HTTP response object and must not attempt a
second response after a 202 admission response.

### 10.2 Early-send client branch

For a negotiated capable server:

1. capture raw input and immutable settings;
2. send admission before local append, scripts, or autosave;
3. receive a durable operation identity or retryable typed status;
4. render a pending owner projection;
5. reconcile ACK loss by exact idempotent retry;
6. never transform or append the input twice.

Legacy behavior remains unchanged when either client or server lacks the new
capability.

### 10.3 UI and chat-open reconciliation

- show a bounded pending state without presenting it as completed chat;
- reconcile on foreground return and chat open;
- distinguish waiting, running, publication pending, completed, failed,
  cancelled, unknown, and conflict;
- allow explicit recovery actions only where ownership makes them safe;
- never offer a browser-save fallback for a server-owned result.

### 10.4 Build-fence matrix

Test:

- old client/new server;
- new client/old server;
- new client/new server with capability disabled;
- new client/new server with capability enabled;
- unsupported record/DTO versions;
- AC off/on/degraded;
- rolling restart and cached client assets.

### 10.5 Capability promotion gate

Raise `inputCommandVersion` only after:

- H1 through H4 pass;
- v3 input-row preflight is zero or an explicit migration passes;
- retained-history scan cost is measured at the retention limit;
- the build-fence matrix passes;
- owner and retention status is discoverable from an empty client;
- rollback can disable new admission without discarding durable work.

## 11. H6 — C7 controlled live and device qualification

### 11.1 Pre-apply

- freeze exact source, installers, AC build, migration set, and hashes;
- run focused and complete automated gates;
- run runtime audit v2 and complete-graph lifecycle separately;
- read active/native/BG work without mutating it;
- wait for existing work to become safe; do not cancel it;
- take validated rollback backups appropriate to each data store;
- verify process-first restart order.

### 11.2 Controlled live scenarios

Run timestamped readbacks for:

- AC off/on/degraded;
- streaming/non-streaming;
- foreground/BG;
- current and previous turn;
- browser process exit after start ACK;
- browser process exit after provider result but before publication;
- new browser/empty local state adoption;
- server restart at named durable boundaries;
- cancel/commit race;
- edit/delete/reroll/branch conflict policy;
- result and owner retention boundaries;
- two device/provider-context combinations;
- PageFold/memory-PDF combined path where enabled.

### 11.3 iPhone L3

Provide feature-level screen, button, gesture, background/foreground, and
expected-result steps. Record each scenario separately even if executed in one
consolidated session. Automated gates do not replace device confirmation.

### 11.4 Exit gate

H6 passes when live source/runtime hashes match the frozen candidate, durable
readbacks demonstrate one owner across browser/process loss, existing features
remain usable, and the user completes the concrete L3 scenarios.

## 12. H7 — documentation and publication

After H6 and user L3 approval:

1. update the central ledger, phase receipts, progress/handoff status, and
   rollback instructions;
2. update relevant README, changelog, version, and compatibility material;
3. run a sensitive-information and stale-claim sweep;
4. confirm source commits, remote branches, tags, release assets, hashes, and
   latest-release pointers;
5. publish only the artifacts for which repository authority exists;
6. preserve the AC source snapshot until a reviewed remote source branch or
   mirror is demonstrably equivalent and retention is explicitly revisited.

## 13. Commit and review boundaries

Keep these independently reviewable where source changes exist:

1. process-boundary harness without product behavior changes;
2. any defect exposed by that harness;
3. AC DTO/auth transport;
4. AC context-aware accessors;
5. claim/prepare/context lifecycle join;
6. C5 pure output transform;
7. PocketRisu host adapter;
8. C6 claim/change/effect lineage;
9. C6 retention/tombstones;
10. automatic drain coordinator;
11. early-send client and UI;
12. capability promotion;
13. live/release documentation.

Each implementation commit includes focused tests. Generated installer changes
belong with the source/manifest slice that generates them, and two consecutive
builds must remain byte-identical.

## 14. Recurring verification gates

### 14.1 PocketRisu/patcher source changes

- run the focused changed-owner tests;
- run `npm test` in the patcher repository;
- regenerate installers with `npm run build` twice and compare them;
- syntax-check both standalone installers;
- apply to a fresh exact-1.10 disposable target;
- run affected frontend/server/compatibility tests;
- run Svelte diagnostics and production build when runtime code changes;
- rebuild/load-check the BG bundle when orchestration code changes;
- when manifests, ownership, or managed units change, run the current
  all-or-nothing complete-graph apply/current/zero-change-replan/exact-revert
  lifecycle from `PATCHER-V2-DESIGN.md`;
- run runtime audit v2 separately from composition verification.

### 14.2 Archive Center changes

- run focused package tests and negative contract tests;
- run focused race tests for changed concurrent owners;
- run complete Go repository tests;
- run complete repository race tests for concurrency/lifecycle changes;
- run `go vet ./...`;
- syntax-check unchanged/changed JS entry points as appropriate;
- build Linux ARM64 with reproducible flags;
- exercise disposable MariaDB migration/restart when schema/store changes;
- verify no secret-bearing context enters durable storage or logs.

### 14.3 Documentation-only changes

- verify every relative path exists;
- verify commit IDs and hashes from the current repositories;
- distinguish observed, inferred, and unverified claims;
- scan for personal paths, credentials, hostnames, user content, and stale live
  assertions;
- do not rerun unrelated runtime suites solely to justify a documentation edit.

## 15. Stop conditions

Stop the current slice and record the exact blocker when:

- source authority or branch provenance conflicts;
- a test would require live user data instead of a disposable copy;
- the only next action would cancel active work or discard user changes;
- a new design changes user-visible behavior outside the accepted plan;
- a security/authentication boundary cannot be defined from existing context;
- a second failure of the same design causes code growth without explaining
  the structure; produce a control/data-flow report before another patch;
- a capability promotion prerequisite remains unverified.

Do not stop merely because one phase or document is complete. Continue through
the current slice's exit gate while safe, in scope, and authorized.
