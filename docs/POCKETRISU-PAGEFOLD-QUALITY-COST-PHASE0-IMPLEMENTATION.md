# PageFold quality/cost Phase 0 implementation receipt

> **Status:** offline harness implemented and automatically verified; private
> case capture and paid activation have not occurred
>
> **Date:** 2026-08-26 KST
>
> **Protocol authority:**
> `docs/POCKETRISU-PAGEFOLD-QUALITY-COST-EVALUATION-PLAN.md`
>
> **Runtime audit:**
> `docs/POCKETRISU-PAGEFOLD-QUALITY-COST-PHASE0-RUNTIME-AUDIT.md`
>
> **Base:** patcher `0.2.1`, exact PocketRisu `1.10.0`, plan commit `3e69349`

## 1. Outcome

Phase 0 now has an offline-only implementation that can freeze source evidence,
build blinded complete blocks, prove request-factor isolation, reserve all
metered roles under one exact cost ledger, and retain responses durably without
opening semantic content during a block.

The implementation does not contain a provider transport or a paid activation
record. The executable runner accepts fake simulation only and rejects every
non-simulated call. A future paid adapter must additionally bind the exact
manifest hash, complete call-plan cursor, activated phase, hard cap, and
user-decision record. The current activation draft has
`providerCallsAuthorized=false` and no activated phases.

No stable catalog, installer unit, PageFold UI, route profile, low-resolution
production invariant, or live source file changed. Medium/high resolution and
role/current-user placement remain research-only factors.

## 2. Implemented boundaries

### 2.1 Frozen protocol and controlled cases

- `protocol-v1.cjs` owns canonical JSON identities, opaque condition IDs,
  complete paired scheduling, calibration/locked source separation, exact
  UTF-8 citations, request diff allowlists, and integer picodollar cost
  arithmetic.
- `fixtures-v1.cjs` freezes twelve synthetic cases in six counterfactual twin
  groups. They cover attribution, negation, relationship direction, temporal
  and causal integration, resolved/unresolved hooks, current-user authority,
  system hierarchy, contradiction prevention, and spontaneous use.
- The synthetic manifest identity is
  `bb6591c20b0dd3e332207586e77e0eae18c9e6e6070b9c43c197646155985d35`.
- Synthetic placement metadata names source start/middle/end, role boundary,
  and page boundary. It does not assume a font size, density optimum, hot-turn
  count, or product default.

### 2.2 Private source and dossier lifecycle

- `quiescence.cjs` reads the primary KV SQLite and model-job SQLite in read-only
  transactions. It counts global/selected active work and selected pending
  result/draft payloads without printing chat or character identities.
- `source-capture.cjs` reads a pinned KV snapshot, applies a newer selected-chat
  journal record when present, and runs the exact production assembly bundle
  on a cloned in-memory database.
- The live target is not patched. A private copy of the current BG bundle is
  instrumented at the single `createPageFoldSourceRouteState` consumer to
  capture both post-reformatter messages and the final PageFold
  `sourceMessages`. It then throws a local sentinel before PDF rendering,
  credential exchange, or provider preparation.
- Global fetch plus Node HTTP, HTTPS, TCP, TLS, and UDP entry points are
  fail-closed during capture. Bundle console output is suppressed because
  production assembly contains prompt-bearing debug lines.
- Pre/post quiescence and database/journal identities must remain unchanged.
  Drift stops before `source-snapshot.json` is written.
- Credentials and service-account identifiers are removed in memory. A second
  artifact-key scan rejects them before the snapshot is serialized.
- `dossier.cjs` produces a content-free source inventory and an empty review
  template. Activation accepts only `reviewed-and-frozen` dossiers whose
  deterministic and verified cards cite exact UTF-8 byte spans and record
  obligation type, subject/object, polarity, source role/speaker, last mention,
  co-obligations, allowed/prohibited use, evaluation mode, distance axes, and
  reviewer decision. Interpretive and global-unverified cards stay outside
  objective denominators.

Private run roots must be outside the Git repository, mode `0700`; regular
files are mode `0600`; symlinks are rejected. Generated raw source, responses,
blind maps, and judgments are never eligible for tracked receipts.

### 2.3 Conditions, cost, and execution

- Phase C contains one direct control plus the complete
  `3 resolutions × 2 system placements × 2 current-user placements` matrix.
- Production low request bodies remain unchanged. A medium/high resolution
  variant can change only the one observed `mediaResolution` authority, whether
  the selected Gemini family places it on the PDF part or in generation config.
- System and current-user factors first partition the same effective message
  indexes exactly once. Their final research wire shape remains an activation
  decision and cannot be inferred from partition success.
- Cost arithmetic uses integer picodollars with an explicit per-call/category
  ceiling. Annotation, generation, judge, and any later retained retry share
  the same USD 10.00 cap. A missing price or an incomplete-block reservation
  stops before a call.
- `runner.cjs` persists `call-start`, then the private raw response, then
  `call-complete`. A crash after start remains ambiguous and cannot be retried
  automatically. `MAX_TOKENS` is retained as an observation and does not alter
  call order.
- Model-version drift splits the evidence set. HTTP/parser/usage/cost failures
  stop according to operational evidence without reading semantic content.
- The activation manifest freezes the complete annotation/generation/judge
  call order, call timeout, single-call concurrency, and per-call/total raw
  response byte ceilings. Provider transport must honor the supplied abort
  signal, and retained responses are scanned against the in-memory credential
  set before persistence.

## 3. Observed offline verification

The repository test command completed with 48/48 test files passing, including
the new quality/cost contracts. Focused coverage observed:

- twelve synthetic fixtures, six complete twin groups, and thirteen required
  coverage tags;
- thirteen core conditions and twenty-four one-factor comparison pairs;
- exact UTF-8 citation boundary rejection;
- calibration/locked source-reuse rejection;
- per-part and generation-level resolution isolation;
- integer cost cap and missing-price rejection;
- no hidden retry, target self-judge, or incomplete cost coverage;
- durable start/response/complete ordering and ambiguous resume behavior;
- mode `0700`/`0600`, exclusive files, nested private scratch validation, and
  symlink rejection; and
- credential-key/value rejection before source artifact creation.

The current exact-live target accepted the capture instrumentation anchors and
exported the research capture function. Recorded content-free identities were:

| Surface | SHA-256 |
| --- | --- |
| request source | `f9f0bb12c10070727a23c46ef11bd03b60bedef98748008827265a44e7cb2db7` |
| production BG bundle | `13e229bcbd6a2970d6979dcf8d4ce19792fd2053f7cbddeefc58936de270da77` |
| instrumented private bundle | `86bd67662ae53b2d7efc8b94a705cdf00ba27d0440094e7195bffbef9ac7ce1f` |
| BG orchestrator source | `67bcba4867dd57a96164cbdffbcd39ae8026a506127465e68c763f93fcea0a66` |

A content-free dummy-case read of the real SQLite schemas observed native
active `0`, background active `0`, pending payloads `0`, and `quiescent=true`.
This proves the inspector can read the current storage formats; it is not a
quiescence claim for a future selected case.

The two installer artifacts from the current build remained byte-identical to each other and to stable
`0.2.1`: 7,847,429 bytes, SHA-256
`a406e48ad8ffded50a7a6bc4a18cbb4204c1bae23f305ebb0e625c93b2426a9c`.

No provider call, credential exchange, private chat capture, semantic output,
live write, build/restart, route admission, or product setting change occurred.

## 4. Offline commands

The CLI is disabled by default in the sense that every operation requires an
explicit subcommand, and no subcommand implements provider transport:

~~~bash
node research/pagefold-quality-cost/offline-runner.cjs initialize-evaluation --repository-root /absolute/repository --target-root /absolute/target --database-path /absolute/main.db --model-jobs-path /absolute/jobs.db --private-root /absolute/private/run --calibration-character NAME --locked-character NAME
node research/pagefold-quality-cost/offline-runner.cjs verify-synthetic
node research/pagefold-quality-cost/offline-runner.cjs activation-draft
node research/pagefold-quality-cost/offline-runner.cjs inspect-quiescence --config /absolute/private/config.json
node research/pagefold-quality-cost/offline-runner.cjs capture-source --config /absolute/private/config.json
node research/pagefold-quality-cost/offline-runner.cjs create-dossier-template --config /absolute/private/config.json
node research/pagefold-quality-cost/offline-runner.cjs verify-dossier --config /absolute/private/config.json
~~~

The config itself must be outside the repository and mode `0600`. It records
absolute private paths and opaque case coordinates, so it is not a tracked
template. `capture-source` requires a dedicated process and performs two
read-only quiescence checks around one immutable source capture.

### 4.1 First private selection observation

The first user-selected pair resolved as two unique characters. Each character
had exactly one active chat, but both selected chats contained zero messages;
neither supplied string matched a chat title, and the selected characters had
no cold-storage chat or first-message payload. Phase 0 therefore stopped before
source capture instead of treating empty chats as long-distance evidence.

The private root retains the original selection manifest and a content-free
`blocked-empty-conversation` receipt. No character/chat name or ID was copied to
tracked files. Provider calls and live writes remained zero.

This observation also exposed a harness side effect: importing target
`utils.cjs` loaded its cwd-relative logger and created an empty local
`save/logs.db`. The database had `quick_check=ok`, `logs=0`, and
`sqlite_sequence=0`; it was moved intact to a recoverable temporary quarantine,
not deleted. The decoder loader now substitutes only the exact target
`logs.cjs` dependency with a no-op logger during import, restores the module
loader immediately, rejects empty selected chats, and no longer recreates a
worktree `save/` directory.

## 5. Remaining Phase 0 closure inputs

The offline implementation is present, but an executable activation manifest
cannot close until the following are supplied and observed:

1. user-selected calibration and untouched locked private case identities;
2. the private run-root retention boundary and later explicit deletion rule;
3. reviewed source-anchored obligation cards and declared coverage limits;
4. the exact native-current-user research wire shape and request diff receipts;
5. a current official price record and exact complete-block reservation;
6. an independent full-source judge identity, prompt, calibration cases, and
   order-reversal contract;
7. task-specific practical-difference, uncertainty, and maximum complete-block
   rules; and
8. a separately reviewed explicit activation decision naming only the intended
   phase or phases.

Until those items close, the correct state is offline implementation complete,
provider inactive, and quality/cost evidence unmeasured.
