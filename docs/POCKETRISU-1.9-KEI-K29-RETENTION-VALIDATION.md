# PocketRisu 1.9 Kei K29-F05 result-retention validation

Date: 2026-08-02 KST

## Scope and authority

This receipt implements only K29-F05 from the overlap-equivalence audit's
technical reclassification recommendations. Completed but unconsumed paid BG
responses are retained across an overnight mobile absence under a bounded
48-hour, 128-row, 256 MiB policy. It is not Revenant-style indefinite
retention and does not add live-token replay, reroll/continue admission,
translation/HypaMemory/Lua cold consumers, server-restart partial
materialization, a new database, schema, state machine, or privacy policy.

The existing `bg-preserve` owners remain canonical:

- the existing KV keys store result payloads and operation lifecycle state;
- the existing run registry identifies active work and exact operation IDs;
- the existing two-minute delivery claim and explicit ACK protect one durable
  consumer at a time;
- the existing operation-state store writes suppressive tombstones before a
  paid payload is deleted;
- the existing pending-marker and merge/ACK owners preserve cold recovery and
  idempotent materialization.

The implementation versions `bg-preserve` from `v1.0.1-patcher.3` to
`v1.0.1-patcher.4`. Four new owned helper/test files and exact-1.9 sibling
adapters extend those owners. The imported 1.8.1 payload remains byte-identical
at SHA-256
`06c482b32e3d3a7e045ce7b3e18b173e9af63205ac68a3dd34fef055cb29efa4`.

No live PocketRisu path, live patch state, user data, preserved K12 index,
process, push, tag, release, apply, restart, or paid provider request was
changed or performed.

## Measurements and selected bounds

Policy was chosen only after measuring the existing owners and retained
evidence:

| Input | Observed value |
| --- | ---: |
| Live `bg-orch-result:`, `bg-orch-result-op:`, and `bg-orch-state-op:` KV rows | 0 rows, 0 bytes |
| Retained `S4b detached done` event anchors | 3,882 distinct events |
| `S4a full` payload-size samples | 6 samples, 310,621 bytes total |
| Full-result sample distribution | mean 51,770.17; min 43,613; max 62,134 bytes |
| Native model-job journals | 32 files, 217,622 bytes total |
| Native journal distribution | mean 6,800.69; max 16,865 bytes |
| Existing run registry and browser marker caps | 128 entries each |
| Existing delivery lease | 2 minutes, refreshed at 15 seconds |
| Existing result cleanup | 30 minutes, no row/byte cap |

The selected result policy is 48 hours, 128 physical KV rows, and 256 MiB.
The browser marker is 49 hours: the completed-result horizon plus one bounded
hour from pre-request marker creation. Existing full-pipeline abort and browser
deadlines are 10 and 15 minutes, so the extra hour covers the measured contract
without making the marker indefinite.

At the largest observed full-result sample, all 128 rows occupy about 7.58
MiB, so row count binds normal observed sizes. The 256 MiB backstop holds 4,320
maximum-observed full results or 15,916 maximum-observed native journals, but
also bounds a future small-row/large-full-chat distribution. These ratios are
capacity context, not an assertion about future payload distribution.

## Feature contract and exact revert surface

- **Purpose:** keep a completed paid ordinary response recoverable after an
  overnight mobile absence while bounding orphaned storage.
- **Trigger:** one immediate server-start sweep and an unreferenced ten-minute
  interval inspect the two existing result prefixes and existing operation
  state prefix.
- **State/result:** results remain in the same KV rows. Unprotected rows expire
  only after the exact 48-hour boundary. Under pressure, malformed rows and
  explicit intermediate rows are removed before oldest terminal/unknown
  result rows. Unknown parsed schemas are protected at terminal priority rather
  than guessed disposable.
- **Active/claim preservation:** active operations, operation-keyed rows with a
  live bounded consumer claim, and rolling rows in their refreshed legacy lease
  window are not eviction candidates. If the active-run owner throws, the row
  fails closed and remains. Protected rows may temporarily exceed the target.
- **ACK/idempotency preservation:** a `result-expired` or `result-evicted`
  tombstone is written through the existing operation-state owner before exact
  payload deletion. Tombstone-write or delete failure keeps the paid payload
  for retry. Existing `delivered` and `cancelled` states are not overwritten.
  Old operation state is retained while its exact payload remains, preserving
  duplicate-POST suppression through a refreshed claim; state cleanup resumes
  only after payload absence.
- **Rolling delivery preservation:** exact-1.9 rolling GET obtains the same
  bounded consumer claim, its heartbeat uses the negotiated result-key version,
  and ACK validates claim ownership. A rolling client without consumer identity
  receives only the existing bounded `updatedAt` lease.
- **Clock preservation:** far-future claims cannot create an unbounded lease.
  Future KV timestamps and browser marker timestamps are normalized once by an
  owner write. Newly admitted browser operations cannot be evicted behind
  clock-skewed markers.
- **Recovery result:** live and cold clients surface explicit expired/evicted
  paid-result messages, stop that exact watcher, and do not regenerate or fall
  back into another paid call.
- **Exact revert surface:** the four owned retention/state helper and test
  files; exact-1.9 orchestrator, run-registry, pending-marker, and client sibling
  bytes; the BG version; focused patcher tests; and this receipt. Revert removes
  the four owned files and restores the official/BG pre-feature bytes. No DB or
  schema rollback exists because none was created.

The two scanned result prefixes are disjoint: `bg-orch-result:` does not match
`bg-orch-result-op:` because the latter has `-op` before its colon. Physical-key
deduplication is defensive for repeated or future caller scans, not a claim
that the current prefixes overlap.

## Provenance, hashes, and resolved graphs

- Pre-feature patcher HEAD: `a71fb9d`.
- Exact official target: PocketRisu `1.9.0`, commit
  `85a65f3137b45c8de4a8d21a9887be213b1ac3fc`.
- Qualified BG pack ETag:
  `2339436a11e9a7e9d30bf6df9a370bc9bfa2a9f4e28106a2a9d669e626758c21`.
- Applied exact-1.9 hashes:
  - `server/node/bgOrchestrator.cjs`:
    `55fc8d678d2b4b081b13eb46a70c77a4a79b9bfe416a33e9abf695f8a48e5f49`;
  - server retention helper:
    `898abb2ad73fede0b6c37507a597ae864e00f435dc702a9b0e08b90a6b0c92da`;
  - server retention test:
    `24e8535fe7c5aa026743dc192d3a6739d36dc41ffa3035a669abb556e4b31b95`;
  - `src/ts/bgOrchestrate.ts`:
    `c143ccbc71e4b3b4202b2274909610fcf289ca65ad0dba84223848c37a4b78a5`;
  - pending-marker owner:
    `c72e5b6f9393d1347dcddf63865a070ae67124df9fbed66e801d57f62fb1dc01`;
  - retention-state helper/test:
    `f5f5a140456d66bd4d09fda9ee5d3672b11bbcc9b1def65d53fa86cff8111cbd` /
    `707d84b1bb11835cb46430d99768b7475d3c971d181b0b14997a9123f6e531e5`;
  - run-registry test:
    `09eaffae396808cd4389762125a8780fa0c5dce6bcccc2d67a7fb8c6d36e02f3`.

Observed owner graphs:

| Selection | Retention owner | Packs | Units | Managed files | Collisions |
| --- | --- | ---: | ---: | ---: | ---: |
| `toolchain-hardening` | absent | 1 | 7 | 3 | 0 |
| `bg-preserve` | existing BG KV/run/claim/ACK owner extended | 2 | 187 | 94 | 0 |

The 1.8.1 target selects exactly one prior owned unit per affected file and no
retention/state helper. The exact-1.9 graph selects exactly one versioned unit
per file. No second result owner, schema, or state machine appears in either
graph.

## Observed automated gates

- Focused patcher retention/logging/BG suites: 3/3 files passed.
- Complete patcher suite: 37/37 files passed.
- Exact-1.9 server retention Vitest: 22/22 tests passed.
- Exact-1.9 client owner Vitest: 57/57 tests across five files passed.
- Svelte diagnostics: exit 0, 0 errors, 0 warnings.
- Production build: exit 0 after 7,819 modules transformed. Existing CSS
  highlight, browser externalization, plugin timing, dynamic-import, and
  large-chunk warnings remained visible.
- Full target test command reached 91 passing files and two failing files;
  1,153 tests passed, 83 failed, and three skipped. Every failure was the
  pre-existing `localStorage.clear is not a function` signature in
  `googleGemini.test.ts` and `geminiContextCache.test.ts`. Exact patch revert
  reproduced the same two files and 83 failures, so the broad command is
  recorded as baseline N/A rather than a passing K29 gate.
- Fresh apply changed 96 paths including state/intent and resolved 187 units
  across 94 managed files with zero collisions. Status was `current` for all
  94 files with zero drift. Reapply changed zero and skipped all 94. Revert
  changed 96 paths, removed all four owned files, restored official
  `server.cjs` SHA-256
  `b10276f7651160902313d8cb7022d27b72f6e051281fa438ef52672c900f5e30`,
  and left the tracked target diff/status clean.
- Exhaustive combination verifier: exit 0; 2,048/2,048 raw selections, 1,024
  normalized graphs, 221 managed paths, maximum 535 resolved units, two
  workers, and exact round trips passed.
- Independent read-only review found and closed two blockers before final
  qualification: operation state could expire while a claimed payload still
  suppressed duplicate work, and rolling heartbeat hardcoded the
  operation-keyed URL. The final re-review found no remaining actionable
  K29-F05 blocker.

## Focused adversarial coverage

- exact TTL boundary and one-millisecond expiration;
- row and byte pressure, malformed/intermediate priority, unknown schema
  retention, physical-key deduplication, and large byte accounting;
- active-run protection, active-owner failure, live/future/expired claims, and
  rolling legacy lease;
- malformed operation-keyed payload identity and invalid coordinates;
- tombstone-before-delete, failed tombstone, failed delete, delivered/cancelled
  state preservation, repeated sweep, and state/payload duplicate-POST barrier;
- state cleanup after exact payload absence;
- rolling claim conflict, heartbeat, consumer-owned ACK, and repeated ACK;
- result-key version 0 versus 1 heartbeat routing;
- future timestamp normalization and protected pending-marker cap admission;
- live/cold expired and evicted terminal handling without fallback.

## L2.5 runtime audit

### Phase 1 — flat discovery

- result publish, operation/rolling GET, claim refresh, heartbeat, ACK, cancel,
  state write, payload deletion, and duplicate start;
- startup/periodic sweep, physical rows/bytes, TTL/pressure ordering, active
  registry, claim clock skew, legacy rolling lease, unknown/malformed payload,
  KV read/write/delete failure, and state cleanup;
- live watcher, boot marker, durable save, merge, explicit ACK, fallback, and
  paid-call duplication;
- exact-1.8/exact-1.9 unit selection, owner-absent/present graph,
  apply/reapply/status/revert, and aggregate composition.

### Phase 2 — external-anchor resolution

- **Policy inputs — measured.** Live KV counts, 3,882 distinct completion
  anchors, six full-result byte anchors, and 32 model-job journal files supplied
  the recorded row/byte policy inputs.
- **One owner — structural plus graph.** The helper receives only existing
  `kvList/kvGet/kvSet/kvDel`, run status, claim, and operation-state functions.
  It imports no DB/schema authority. Exact target graphs select one owner per
  file and the exhaustive verifier closed every public selection.
- **Paid-result preservation — adversarial tests.** Active/claimed results
  bypass candidates; owner uncertainty and tombstone/delete failure fail
  closed; explicit ACK/cancel states remain stronger than retention cleanup.
- **Exact-once start barrier — adversarial test and independent review.** Old
  operation state remains while its operation-keyed payload exists, including
  after claim refresh. Only payload absence permits bounded state cleanup.
- **Rolling durable save — source assertion and route test.** Heartbeat uses the
  negotiated result-key version. Version 0 refreshes the char/chat claim and
  version 1 retains the operation-keyed route; ACK checks the same consumer.
- **Clock and capacity — adversarial tests.** Future claims are bounded to one
  lease; KV and browser timestamps normalize once; a new browser marker is
  protected during cap enforcement; active/claimed overage is reported rather
  than evicted.
- **No second paid call — client tests and source.** `result-expired` and
  `result-evicted` terminate only the exact live/boot watcher with an explicit
  message and no fallback call.
- **Revert/composition — measured.** Fresh lifecycle restored every managed
  byte/mode and removed owned files. All 2,048 public selections completed exact
  round trips.

### Phase 3 — triage

- **Q3, fixed:** completed unconsumed paid ordinary results now survive a
  bounded overnight absence instead of the previous 30-minute window.
- **Q1, no duplicate authority:** one existing KV/run/claim/ACK/state owner is
  extended; no second database, schema, or result state machine exists.
- **Q4, bounded exceptions:** active/live-claim rows may temporarily exceed the
  target, and storage/tombstone uncertainty retains payloads. This is explicit
  fail-closed behavior, not unbounded successful cleanup.
- **Excluded:** G03, G06-G08, G12-G15, G20, translation/Hypa/Lua cold
  consumers, live token replay, partial restart materialization, and all new
  accounting/privacy policies.
- **Aggregate-only L3:** overnight ordinary result recovery, exact ACK after a
  slow durable save, and K29 reroll cold-return remain documented for the final
  consolidated iPhone session. No user L3 is requested in this implementation
  session.

## Publication boundary

This receipt qualifies a local feature commit only. Generated installer
publication, push, tag, release, live apply, and restart remain unauthorized.
