# PocketRisu 1.10 BG × Archive Center C0-F output/owner characterization

Date: 2026-09-13 KST

Status: **characterization complete; current result and delivery contracts
cannot prove output-stage parity or authoritative message ownership**

## Scope

This C0-F slice reads the exact PocketRisu 1.10 units produced by
`patches/bg-preserve/manifest.cjs`. It changes no managed unit, manifest,
catalog, installer, target, runtime, or user data. Test commit `8cd6a47` fixes
these source bytes:

| Source | SHA-256 |
| --- | --- |
| `patches/bg-preserve.json` | `06c482b32e3d3a7e045ce7b3e18b173e9af63205ac68a3dd34fef055cb29efa4` |
| `patches/bg-preserve/manifest.cjs` | `223f853750e75fce8d761125402b7db600b21feee6b11f729513d98ce6ccc442` |
| `patches/lazy-chat-sync/files-1.10/server/node/server.cjs` | `0a13b16cf055b8875451ba35943536a90ba6ef7859314b0a2794595bdd32ac75` |
| C0-F test | `3cbd94362f7c5b206f804df8888ed16fc0b6aed9f1eb544e9b9022e250b3b3d5` |

The test selector prefers one explicit 1.10 owned unit and otherwise accepts
one universal owned unit. It does not accidentally inspect the 1.8.1 server
variant when a 1.10 adapter exists.

## Runtime audit Phase 1 — flat discovery

- The exact 1.10 server runs the full bundled `sendChat` pipeline and returns
  one final or intermediate chat object.
- The server result response exposes result/operation/publish identity, kind,
  outcome, final flag, chat, statics delta, global deltas, and errors.
- It does not expose provider raw output, native escape output, AC display
  sanitization, prefill seed/removal, later host replacement, canonical saved
  value, or AC persistence candidate.
- Two different transform histories that end in the same final chat are
  observationally identical through the current result projection.
- The result has no `bg_server_chat_commit.v1` receipt or stored chat/revision
  identity.
- The exact 1.10 client calls `mergeOrchestrationResult` on `data.chat`.
- The client then performs strict chat/root save and exact result ACK.
- There is no server-committed-result branch in the current client persistence
  function.
- Current output parity evidence covers the collapsed final chat, not each
  proposed transformation stage.
- Current delivery state stores one chat-level marker and a bounded root list.
- A durable delivery marker stores operation ID, result ID, publish sequence,
  delivery chat ID, expected chat revision, and conflict flag.
- It stores no message ID, source revision, source generation, authority, AC
  state, backfill exclusion, or authoritative coverage declaration.
- `findChatDelivery` and `readRootDelivery` both require a known operation ID.
- The root delivery list is capped at 128 entries.
- A chat marker is one field on the chat object, so a later operation replaces
  the prior chat-level marker.
- The delivery field is omitted from the semantic chat revision calculation.
- Existing operation-keyed status/result routes work only when operation ID is
  already known.
- No `/api/bg-orchestrate-chat-state/:charId/:chatId` route exists.
- No `bg_chat_execution_projection.v1` response exists.
- No char/chat/revision request can return authoritative message owner coverage.
- Exact 1.10 result retention may delete large operation result payloads after
  its bounded policy and leaves lifecycle tombstones according to the existing
  retention owner.
- The current durable chat/root delivery markers are separate from that result
  payload retention.
- A new browser with empty local markers and no operation ID has no supported
  owner lookup even if the normal chat body is available.
- Unknown ownership therefore cannot be distinguished from an authoritative
  empty owner set.
- User edit/reroll cannot be mapped to a new source generation through the
  current delivery marker alone.
- Conflict-copy delivery records the new chat ID but not an independent source
  ownership lineage.
- The test-only characterization adds no runtime CPU, memory, network, storage,
  timer, or security surface.

## Runtime audit Phase 2 — external anchors

### Output-stage collapse

Type: structural and measured.

Breaking scenario: provider raw A and raw B take different AC/prefill paths but
produce the same final chat; the current response is treated as proof that all
stages matched. The test extracts the exact adapted `orchResultResponse` field
accesses. It projects two synthetic histories that differ in provider raw and
prefill seed but share the current result fields; their observable projections
are equal. Required stage fields and the server commit contract are absent.

Anchor:

- `test/bg-ac-output-owner-c0.test.cjs:35`

This is not evidence that current final chat is wrong. It is evidence that the
wire format cannot prove the plan's stage-by-stage parity claim.

### Client merge/save/ACK ownership

Type: structural.

Breaking scenario: a current client result is relabelled as already committed
on the server. The exact 1.10 `persistMergedOrchestrationResult` still invokes
client merge, `requestDurableSave({chat, root:true})`, and result ACK. No stored
chat ID, commit receipt, or server-owned commit branch exists.

Anchor:

- `test/bg-ac-output-owner-c0.test.cjs:77`

C2/C3 must preserve this path for legacy results while adding a separately
versioned server-commit response that performs hydrate/readback instead of a
second merge.

### Delivery marker scope

Type: structural.

Breaking scenario: one operation-level marker is interpreted as authoritative
ownership for every message/source generation in a long chat. The test extracts
the exact `DurableOrchestrationDelivery` fields and observes only six
operation/chat-level properties. Message/source/AC coverage fields are absent,
and both lookup functions require the operation ID.

Anchor:

- `test/bg-ac-output-owner-c0.test.cjs:91`

The current marker remains valid result-delivery evidence. It cannot serve as
the proposed AC owner projection without adding message/source lifecycle.

### Missing chat-state endpoint

Type: structural.

Breaking scenario: a new browser is assumed to query ownership by char/chat and
the just-read revision. Exhaustive search of the exact 1.10 adapted orchestrator
and lazy server source finds neither the proposed route nor its contract or
revision-mismatch owner response.

Anchor:

- `test/bg-ac-output-owner-c0.test.cjs:114`

The counterexample of dynamic route construction was checked: current route
registration uses literal Express paths in these owners, and no helper builds
the missing path.

### Empty-local-state × result-retention case

Type: structural.

Breaking scenario: result payload/local marker cleanup completes, a fresh
browser knows only char/chat/revision, and absence of an operation-keyed result
is treated as no owner. The adapted server uses the existing bounded result
retention owner. The durable delivery module exposes only operation-ID lookup
and no exported chat-owner list/projection. It also has no authoritative
revision coverage shape.

Anchor:

- `test/bg-ac-output-owner-c0.test.cjs:131`

This fixes the P2-2 boundary: a missing result is not an empty authoritative
owner list. C6 needs a normal-chat-lifetime projection independent of payload
TTL and local markers.

## Runtime audit Phase 3 — triage

### Characterization findings

- Q2: the current result schema collapses distinct output transformation
  histories and cannot prove stage parity.
- Q2: current clients still own merge/save/ACK and cannot treat the response as
  a server chat commit.
- Q2: operation/chat delivery markers lack message/source/AC ownership and
  authoritative coverage.
- Q2: the proposed char/chat/revision owner endpoint is absent.
- Q2: empty local state after result cleanup has no operation-free authoritative
  lookup, so unknown cannot be promoted to empty ownership.

No production fix is made in C0-F. These are admission blockers for C2/C5/C6,
not reasons to discard the current delivery safeguards.

### Required C2/C5/C6 contract shape

1. Record each output boundary: provider raw, native escape, AC display
   sanitization, prefill removal with request seed, later host replacement,
   canonical saved output, and AC persistence candidate.
2. Share the AC pure transform helper between foreground and server adapter;
   do not rerun a stateful whole plugin callback on recovered output.
3. Return a versioned `bg_server_chat_commit.v1` result with stored chat ID,
   revision, operation/commit receipt, and transform disposition.
4. Keep the current client merge/save/ACK path only for explicit legacy result
   versions.
5. Store message ID, source revision, source generation, operation, authority,
   AC state, and automatic-backfill disposition in the normal chat commit
   recovery unit.
6. Add authenticated `GET /api/bg-orchestrate-chat-state/:charId/:chatId` with
   the requested chat revision, authoritative coverage, revision mismatch, and
   pending command projection.
7. Make owner/tombstone lifetime independent of large result payload TTL and
   localStorage; compaction must prove no source/reference can still arrive.
8. On hydrate, require body revision and projection revision to match before AC
   hook/backfill/drain activation.
9. Treat edit/reroll as a new source generation and do not let the old owner
   marker suppress it.

### Prepared surfaces

- **Actual AC transformation:** no server host adapter exists, so C5 must test
  real AC helper output rather than infer it from missing fields.
- **Foreground/server parity matrix:** prefill absent/exact/partial/newline,
  sanitization markers, non-main calls, replacement, and PageFold combinations
  remain unexecuted.
- **Owner lifetime:** current chat/root markers persist independently of result
  payload, but source lifetime, deletion tombstones, and >128 operation history
  require a new projection test.
- **Authentication and client-build fence:** the new route must reuse normal
  chat access and reject incompatible clients before exposing or accepting
  server-owned results.
- **Conflict lineage:** current conflict chat ID is delivery evidence, not AC
  branch/source ownership.

## Harness correction

The first direct run reported 3/5 because the selector required an explicit
1.10 target on every owned unit. `bgOrchestrationDelivery.ts` is one universal
unit and therefore has no `targetVersions`. The selector was corrected to use
an explicit 1.10 unit when present and otherwise require exactly one universal
unit. The same five tests then reported 5/5. No product claim was taken from
the partial run.

## Cross-piece interaction check

- Server result plus client persistence: final chat remains a delivery payload,
  not a server commit receipt.
- Output history plus result schema: distinct stage histories can collapse to
  the same observable response.
- Delivery marker plus source ownership: current operation-level evidence does
  not identify message/source generations.
- Result retention plus new browser: payload/tombstone retention does not add a
  char/chat/revision owner lookup.
- C0-E plus C0-F: current Node storage lacks both the atomic commit envelope and
  the message-level owner record that would feed the projection.
- C0-C/C0-D plus C0-F: Go has source/prepare tombstones, but no Node owner
  projection currently supplies their message-generation identities.

## Verification

- The corrected direct execution reports five C0-F assertions passed.
- Full patcher `npm test` reports 49/49 test files passed.
- `node --check test/bg-ac-output-owner-c0.test.cjs` passes.
- Patcher implementation HEAD is
  `8cd6a47b5ee638c0a2f740dc1378910d7becbb08`; its tree is
  `09b36e259de235fd11e3178be01ec7db1454091c`.
- Managed unit, manifest, catalog, installer, target, and live diffs are zero;
  patch-combination and runtime product gates are therefore not claimed by
  this test-only slice.

## C0-F verdict

C0-F is complete as a **negative characterization**: the current contracts
cannot prove AC output-stage parity or authoritative message/source ownership
after result/local-marker cleanup. C2/C5 must add the transform and server
commit contracts; C6 must add the normal-chat-lifetime owner projection.
