# PocketRisu 1.10 BG × Archive Center C3 connection hardening validation

- Validation date: 2026-09-20 KST
- Reviewed checkpoint: `3c27c4bc5a9caf270ad3ed594543913be72aaf17`
- Implementation commit: `3315e4d`
- Target: PocketRisu 1.10.0 (`98e968339d1b3f91b9dac85bb3f2ebb5f90f9d14`)
- Adapter: `lazy-chat-bg-adapter` 0.7.0
- Client capability: `inputCommandVersion: 0`
- Diagnostic foundation: `inputCommandFoundationVersion: 4`
- Archive Center mode in these tests: disabled/unbound
- Live application: not performed

## 1. Scope and verdict

An independent audit reproduced four runtime defects and identified one static
client-control-flow defect in the C3 candidate. This change fixes those five
connection defects before extending Archive Center integration:

| ID | Defect | Result at this checkpoint |
| --- | --- | --- |
| R1 | Cancelling a waiting admission could let a later command bypass an older active command | Fixed and regression-tested |
| R2 | A new command submitted from the current edited chat could remain bound to an already completed historical revision | Fixed and regression-tested, including answer deletion back to the input-only revision |
| R3 | One input-recovery pass followed by one commit-recovery pass could omit the next durable input | Fixed with bounded causal reconciliation and actual SQLite integration coverage |
| R4 | A later transaction failure rolled back SQL input state but could not restore an already deleted in-memory settings context | Fixed by separating durable settlement from post-commit context release |
| R5 | A server-owned commit failure could fall through to legacy browser save and ACK behavior | Fixed for the input-command/server-commit candidate path by preserving server ownership before result ordering, ACK, or client persistence |

The implementation remains a dormant foundation. It does not activate the
ordinary PocketRisu composer, install Archive Center integration, or qualify a
release. G1 through G4 now have automated foundation evidence; browser-process
exit, result/owner retention, effect provenance, AC lifecycle, and device
qualification remain open.

## 2. Phase terminology correction

`C0 complete` means that the planned environment, characterization probes, and
store primitives were completed. It does not mean that the original five P1
and two P2 product contracts were closed. The current phase labels are:

| Phase | Precise status |
| --- | --- |
| C0 | Foundation experiments and store primitives recorded; original seven product contracts remain open |
| C1 | Atomic original-chat/effect commit primitive implemented and tested |
| C2 | Internal opt-in BG final-result connection implemented; ordinary client remains unopted |
| C3 | Input, projection, recovery, settings, and ownership foundation implemented; product activation remains blocked |
| C4 | Archive Center local context owner/resolver exists outside this implementation commit; production callers remain absent |
| C5–C7 | Not implemented or not qualified |

## 3. Updated control and data flow

### 3.1 Admission and execution dependency

```text
canonical revision check
  -> immutable admission sequence
  -> immediate previous-admission identity
  -> independently selected latest unresolved execution dependency
  -> provider gate waits for that dependency
  -> completed dependency advances only from its stored result revision
  -> current edited chat with no unresolved execution work becomes a new head
```

`queuePredecessorId` remains the exact adjacent admission identity.
`executionPredecessorId` is the operation that must finish before provider work
can start. Keeping these identities separate fixes cancelled-admission skips
without weakening the adjacent-sequence tamper check.

The v4 record also persists a completed result publication state:

- `pending`: the response commit is durable but canonical publication is not
  yet confirmed;
- `published`: canonical publication succeeded at least once.

This distinguishes a genuinely pending response from a later user edit or
deletion that happens to produce a different or earlier revision.

### 3.2 Commit transaction and settings context

```text
SQLite transaction
  -> durable input terminal state
  -> commit sequence, journal, operation state, commit recovery row
COMMIT
  -> canonical publication
  -> serialized volatile settings release
  -> serialized published-result marker
```

The transaction no longer mutates the process-memory settings map. A rollback
therefore restores the durable input row while leaving the exact settings
snapshot available. A successful durable commit releases the snapshot even
when canonical publication needs recovery. Publication-marker failure does not
invalidate the durable response; recovery retries that marker.

### 3.3 Startup recovery

```text
pass 1: input journals in character/chat/admission order
     -> response journals in commit-sequence order
pass N: repeat while the pending identity/status signature changes
stop: no pending work, repeated pending signature, or record-count bound
listen: only after reconciliation returns and any stalled state is logged
```

The pass limit is derived from the number of observed input and commit recovery
records. A repeated pending signature stops the loop. This permits
input N → response N → input N+1 causal recovery without an unbounded retry.

An attached input is republished before settings availability is checked.
Losing process-memory settings after restart still blocks model resumption, but
it no longer prevents an already durable user message from returning to normal
chat storage.

### 3.4 Server result ownership

Server-owned result records now carry `serverChatCommitVersion: 1`. Legacy
records omit the field instead of receiving a new zero-valued field. The client
classifies each result as one of:

- `legacy-client-owned`;
- `server-committed`;
- `server-owned-uncommitted`.

The uncommitted server-owned state is checked before result-order ACK and before
`persistMergedOrchestrationResult()`. Foreground watch and boot recovery both
retain the pending marker and avoid client save, client ACK, or provider
fallback. Server-owned intermediate result delivery is disabled. If the result
payload and operation-state tombstone are gone, the durable input owner still
advertises server ownership for this candidate path.

## 4. Implementation map

| Responsibility | Authoritative file |
| --- | --- |
| v4 input record, admission/order split, publication state, recovery ordering | `patches/lazy-chat-bg-adapter/files-1.10/server/node/serverChatInputOwner.cjs` |
| Atomic response owner, post-commit cleanup, bounded startup reconciliation | `patches/lazy-chat-bg-adapter/files-1.10/server/node/serverChatCommitOwner.cjs` |
| Client result ownership classification | `patches/lazy-chat-bg-adapter/files-1.10/src/ts/bgServerCommitHydration.ts` |
| Server result fields, startup wiring, foreground/boot ownership fences | `patches/lazy-chat-bg-adapter/manifest.cjs` |
| Actual SQLite owner and route integration coverage | `patches/lazy-chat-bg-adapter/files-1.10/server/node/serverChatCommitOwner.test.ts`, `serverChatInputOwner.test.ts`, `bgServerChatCommitRoutes.test.ts` |
| Client classifier tests | `patches/lazy-chat-bg-adapter/files-1.10/src/ts/bgServerCommitHydration.test.ts` |
| Manifest ownership/order contracts | `test/bg-ac-chat-projection-c3.test.cjs`, `test/bg-ac-server-commit-c2.test.cjs` |

## 5. Runtime audit v2

### 5.1 Phase 1 — flat discovery

- v3 durable input records are rejected by the v4 parser.
- Admission still allocates a random, content-independent settings digest and
  retains secret-bearing bytes only in process memory.
- Admission reads all durable input records to enforce command identity,
  capacity, and execution dependency.
- Immediate admission order and execution dependency are persisted separately.
- Provider admission validates the exact adjacent admission record.
- Provider admission rechecks the latest unresolved earlier command and rejects
  a tampered dependency.
- A completed response records pending/published canonical state.
- New-head admission uses the submitted current revision when no unresolved
  execution dependency exists.
- A queued successor treats only the predecessor's input-only revision as a
  real publication wait; other mismatches are conflicts.
- Pending projection and status expose the execution dependency rather than a
  cancelled adjacent admission.
- Attached input publication runs before missing settings context is reported.
- Input recovery is sorted by character, chat, admission sequence, and
  operation ID.
- Startup recovery alternates input and response owners until resolved or
  stalled.
- Durable input settlement happens inside the commit transaction.
- Settings release and publication marking happen after the transaction on the
  storage queue.
- Server result rows preserve the admission-time server ownership version.
- Legacy result response shapes do not gain `serverChatCommitVersion: 0`.
- Server-owned operations do not emit client-deliverable intermediate results.
- Foreground and boot paths classify ownership before order ACK or legacy save.
- Server-owned unresolved results retain the local pending marker and stop the
  visible recovery attempt.
- Missing-result status derives terminal input states and preserves ownership
  after result/operation-state removal while the input owner remains.
- Capability remains input version 0 and no ordinary client sends the new
  contract.
- Installer composition adds two managed units but no new managed path.
- No Archive Center source, provider call, live process, or user data is touched.

### 5.2 Phase 2 — external anchors

| Claim | Kind | Adversarial break case | Anchor and observed resolution |
| --- | --- | --- | --- |
| Cancelled admission cannot bypass older active work | Structural | N active → N+1 cancelled → N+2 | `serverChatInputOwner.cjs:361,434,571`; actual owner test waits on N and blocks tampered execution predecessor |
| Completed historical work does not bind a new edited head | Structural | publish N → edit/delete answer → submit exact current revision | v4 publication marker and new-head tests; edited and deletion cases start from current revision |
| Waiting input still conflicts with a later edit | Structural | admit N+1 behind active N → publish N → edit before N+1 starts | predecessor mismatch returns `predecessor_revision_changed`, not an endless publication wait |
| Durable input survives interleaved restart recovery | Structural | input N → response N → input N+1 → reset runtime caches | `serverChatCommitOwner.cjs:324`; actual SQLite fixture requires at least two causal passes and restores all message IDs in order |
| Reconciliation is bounded | Structural | permanently blocked settings context | repeated pending signature test stops at pass 2 with `stalled: true` |
| Rollback preserves settings | Structural | fail commit-sequence write after durable input settle | actual SQLite rollback restores `attached` input and leaves one ready settings context |
| Successful commit releases settings | Structural | completed route commit with a live snapshot | actual SQLite route test observes terminal `published` and zero settings contexts |
| Publication-marker failure cannot undo a durable commit | Structural | marker KV write fails after canonical commit | marker write is post-commit and caught; commit receipt remains authoritative and startup recovery retries publication state |
| Server-owned failure does not enter legacy client save | Structural | commit throws, conflicts, or yields invalid receipt | classifier unit tests plus composed manifest order place the ownership fence before ACK and `persistMergedOrchestrationResult()` |
| Generated result remains available after commit failure | Structural | injected server commit exception | actual SQLite route persists result chat with `serverChatCommitVersion: 1`, `status: failed`, and `result-ready` state |
| Result/status cleanup does not immediately erase input-path ownership | Structural | delete result and operation-state fixture rows | result route returns `input-failed` and `serverChatCommitVersion: 1` from durable input owner |
| Legacy result behavior is preserved | Structural | queued legacy result with no server owner | complete frontend suite caught the added zero field; conditional emission fixed it and the complete suite then passed |
| Source/manifest/installers are consistent | Empirical | stale generated installer | two consecutive builds and both standalone files are byte-identical |
| Full target remains composable and reversible | Empirical | new units collide or revert incompletely | complete graph applies, reports current, replans with zero changed files, and reverts 354 path existence/bytes/modes with zero mismatch |

### 5.3 Phase 3 — triage

| Item | Triage | Outcome |
| --- | --- | --- |
| R1 cancellation bypass | Q1 | Fixed |
| R2 completed/edit revision deadlock | Q1 | Fixed |
| R3 interleaved recovery omission | Q1 | Fixed |
| R4 rollback/context divergence | Q1 | Fixed |
| R5 client ownership fallback | Q1 for the input-command candidate | Fixed through result/status/input-owner retention boundary; browser and joined TTL evidence remains a surface |
| v3→v4 durable record transition | Q2 activation gate | Fail-closed test added; require zero legacy rows or an explicit migration before capability activation |
| Historical input scan cost | Q4 | Retention/compaction and large-history measurement remain open |
| Stalled startup reconciliation still permits listen | Q4 | Explicit error state is logged; product admission remains disabled until status/UI policy is defined |

## 6. Remaining prepared surfaces

### 6.1 Record v4 activation

- Item: compatibility with any persisted record v3 input command.
- Resolved: v3 is rejected deterministically and capability remains 0.
- Blocked link: production preflight proving zero v3 rows or an explicit
  migration/disposition.
- Limitation: the candidate has not been live-applied, so production rows were
  not mutated or enumerated by this change.
- Required observation: before activation, count records by version under the
  input-command prefix; proceed only with zero v3 rows or a reviewed migration.

### 6.2 Historical input-record scan cost

- Item: admission and predecessor revalidation scan retained input records.
- Resolved: ordering and correctness are bounded by stored record count; no
  unbounded loop is introduced.
- Blocked link: measured latency and memory for long-lived, large-chat history.
- Limitation: synthetic fixtures do not model production record cardinality.
- Required observation: measure admission/revalidation latency at retention
  limits, then add compaction or an index only if the measured cost requires it.

### 6.3 Browser and retention ownership

- Item: no client save/ACK/provider rerun after server commit failure through
  browser restart and payload TTL.
- Resolved: result schema, status fallback, classifier, and composed branch
  ordering preserve server ownership; the route/helper cross-piece fixture
  accepts the same receipt and projection.
- Blocked link: actual browser process exit, real local marker lifecycle, and
  joined result/state/input/owner retention.
- Limitation: the current evidence uses a fixed provider fixture and helper-level
  client adoption rather than a browser process.
- Required observation: terminate the browser after provider completion but
  before commit recovery, verify client save/ACK/provider counters stay zero,
  then repeat after result payload expiry.

### 6.4 Non-input server-commit retention

- Item: a server-commit-v1 operation without the input-command owner after both
  result and operation-state expiry.
- Resolved: current input-command candidate retains ownership through its
  durable input record.
- Blocked link: a small long-lived ownership tombstone for non-input C2 opt-in.
- Limitation: ordinary client remains unopted and C6 retention policy is not
  defined.
- Required observation: define the supported non-input mode before activation;
  either retain a minimal owner tombstone or reject that negotiation.

### 6.5 Effect provenance

- Item: proving that successor globals/statics derive only from the admitted
  predecessor's receipts.
- Resolved: command identity, input/result revision, and publication ordering are
  now enforced.
- Blocked link: per-effect receipt attestation for the dynamic root overlay.
- Limitation: current overlay can still include unrelated current-root changes.
- Required observation: inject unrelated global/statics changes and require a
  conflict while admitted predecessor effects continue to advance.

## 7. Verification receipt

| Gate | Observed result |
| --- | --- |
| Patcher source tests | 52/52 files passed |
| Focused frontend | 2/2 files, 39/39 tests passed |
| Focused owner/route | 3/3 files, 49/49 tests passed |
| Complete frontend | 153/153 files, 1,743/1,743 tests passed |
| Complete server | 28/28 files, 301 passed, 12 skipped |
| Restricted server control | listener-dependent tests failed with `listen EPERM`; the same target passed with loopback allowed |
| Compatibility | 10 files passed, 1 skipped; 74 passed, 5 skipped |
| Svelte diagnostics | 0 errors, 0 warnings |
| Production build | 7,941 modules transformed |
| BG bundle | 8,864,777 bytes; SHA-256 `665930741f404a1d1d451b5c49b99abd73e55f52632525cf1b017afc03f66afd`; load check passed for `sendChat`, `runTrigger`, and `processScript` |
| Complete graph | 40 packs, 1,003 units, 354 managed paths, 13 ordered collisions |
| Re-plan | 0 changed files |
| Exact revert | 354 path existence/bytes/modes, 0 mismatches |
| Final disposable target | clean, empty custom intent |
| Installers | both files byte-identical, 8,274,867 bytes, mode 0755, SHA-256 `f750979d2bf1053d01f0c00a3e77f5eba77be3bfc8921765fdd7b4ec390a0215` |

The complete frontend run preceded a test-only route-fixture refinement; that
refinement changed only a server test source. The exact final installer then
passed the focused route test, complete server suite, compatibility suite,
diagnostics, production build, composition lifecycle, and exact revert.

## 8. Next dependency order

1. Keep capability 0 and preserve the implementation checkpoint.
2. Run the actual browserless AC-off one-turn process boundary: early admission,
   fixed provider, server commit, normal chat API readback, blank-client
   adoption, commit failure, and response loss.
3. Make the Archive Center candidate independently reproducible before relying
   on its 28 local source files as review evidence.
4. Connect C4 immutable context to actual prepare/complete/provider consumers
   and strict authenticated transport.
5. Implement C5 output-stage parity.
6. Close the activation-critical C6 subset: claim, change sequence, prepare/skip,
   effect lineage, stale-worker fences, conflict policy, and joined retention.
7. Implement automatic drain and early-send/pending UI, then raise client and
   server admission capability only after the C6 gates pass.
8. Perform C7 Ubuntu browser-process-exit and iPhone qualification before any
   stable tag or release.

No live PocketRisu source, PM2 process, user data, provider, Archive Center
runtime, tag, or release was changed by this checkpoint.
