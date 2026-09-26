# PocketRisu 1.9 Kei K26-F02 restore-safety validation

## Scope and authority

This receipt qualifies only overlap-audit recommendation K26-F02 against exact
PocketRisu 1.9. It extends the native snapshot/import owner so each destructive
restore has a newly created, verified rollback snapshot even when the ordinary
five-minute snapshot throttle is active. It does not port Kei's boot choice,
manual or scheduled backup tools, selective missing-asset restore, or broad K30
restore refactor.

The implementation is a hidden exact-1.9 core plus exactly one standard or
`lazy-chat-sync` storage adapter. It creates no backup database, schema, restore
state machine, or second queue. No live PocketRisu path, patch state, user data,
preserved K12 index, process, push, tag, release, or restart was changed.

## Feature contract and exact revert surface

- **Purpose:** require a fresh rollback point immediately before local-file,
  server-file, and database-snapshot restore.
- **Trigger:** the existing restore action after native disk/size validation and
  both existing UI confirmations, but before import staging or the first live
  database replacement.
- **State/result:** pending owner state is flushed without its automatic
  snapshot; a force-new key is allocated above every existing timestamp,
  source/destination logical size is verified, and rotation protects both the
  selected source and new rollback point. Ordinary saves retain native throttle
  and failure ordering.
- **Failure/result:** snapshot creation, verification, lazy migration, journal
  reconciliation, or flush failure stops restore before destructive work. A
  snapshot failure issues a random target-bound token retained for five minutes
  in a 128-entry in-memory owner. A user-confirmed repeated request burns that
  token before its new snapshot attempt; only failure of that attempt permits
  snapshot-less continuation. Header-only, wrong-target, expired, and replayed
  requests cannot bypass the gate. Flush failures are never overridable.
- **Preservation:** native disk/size guards, snapshot count/byte caps, newest
  retention, storage queue/import lease, selected-source identity, remote-block
  migration, cache invalidation, double confirmation, and exact standard/lazy
  owners remain authoritative. Lazy snapshot DB replacement and journal
  deletion commit together; memory resets after commit and best-effort capacity
  trim runs outside the transaction.
- **Exact revert surface:** `kei-backup-restore-safety-core`, exactly one
  standard/lazy adapter, their focused patcher and owned target tests, the
  `pocketrisu-kei` child/resolver/catalog entries, this receipt, and the narrow
  K26 catalog/completion wording. Lazy transaction infrastructure is the
  preceding independently revertible commit recorded in
  `POCKETRISU-1.9-LAZY-SNAPSHOT-RESTORE-ATOMICITY-VALIDATION.md`.

## Provenance, hashes, and resolved graphs

- Pre-feature branch HEAD before the separated lazy-owner infrastructure:
  `f859700e3bd3656eef05d88e1ec46b521025433e`.
- Exact official target: PocketRisu `1.9.0`, commit
  `85a65f3137b45c8de4a8d21a9887be213b1ac3fc`.
- Official `server/node/server.cjs` SHA-256:
  `b10276f7651160902313d8cb7022d27b72f6e051281fa438ef52672c900f5e30`.
- Owned helper SHA-256:
  - server helper: `6702d1fc6d1d95e8b6cdedf2f7624014d2d80880309ccebff3e94352144e52fb`;
  - server test: `4b263787740c96bef3924d7dd23d01ceb69cb327eb0a11fd641b5cc4e8338b69`;
  - client helper: `4279016f6cbb035bdf556a2625ce992e2ede58fb8c0f87ee81d0d848af0e5a14`;
  - client test: `28fb4e172cea5cddc6b8db7f3de88520c08c61a14886673c067692b7abc32fe9`.
- Pack ETags:
  - core `39412e39918b4fcb005c690634a3f48c8f1500f21f7caf4900c78e057fd28130`;
  - standard adapter `ddd5c8ec60f83a15e578045c486f9a4e00ce2ce59b4b8f2e6c06e9c2be8f5cd8`;
  - lazy adapter `b4ae90e545ea0725cc7e4aadee70c34e57e00889086200fa4263d59f596f351c`;
  - umbrella `ed1063cd05724923139b556d20edc6791b729aee03022ace405f669a4e7113e2`.
- Applied standard `server.cjs` SHA-256:
  `55358b519c785af5c954cbe69d7a23a2a4028f3b21bcf068255ba94dace9c71a`.
- Applied lazy `server.cjs` SHA-256:
  `988a83bf0cc06b1fa48385df3ac999c66e1b20877944356429306e41217bf4e4`.

Observed owner graphs:

| Selection | Storage adapter | Packs | Units | Collisions |
| --- | --- | ---: | ---: | ---: |
| `toolchain-hardening` | absent | 1 | 7 | 0 |
| `pocketrisu-kei` | standard | 18 | 221 | 0 |
| `pocketrisu-kei,lazy-chat-sync` | lazy | 19 | 249 | 0 |
| `pocketrisu-kei,bg-preserve,lazy-chat-sync` | lazy + BG | 21 | 436 | 3 ordered |

The three full-graph collisions were the already qualified lazy/BG ordering on
`globalApi`, server stream-reader import, and plugin `sendChat`. K26 introduced
zero collision. Its lazy `nodeStorage` units were positions 423–433 directly
after `lazy-chat-bg-adapter:asset-upload-error-detail` at position 422.

## Observed automated gates

- Focused K26 plus lazy-owner patcher tests: 2/2 files passed.
- Complete patcher suite: 36/36 test files passed.
- Exact standard target: 13/13 server tests, 2/2 client tests, and server/helper
  syntax checks passed.
- Exact lazy target: 22/22 combined restore+journal server tests, 2/2 client
  tests, and `svelte-check` exit 0 with 0 errors and four existing accessibility
  warnings.
- Exact BG+lazy target: 26/26 restore, journal, and request-log server tests and
  four server-file syntax checks passed.
- Standard apply changed 69 paths including patch state; no-op reapply changed
  0 and skipped 68 managed files; status was current with 68/68 files and zero
  drift; revert changed 70 paths including state/intent and restored a clean
  tracked tree.
- Lazy apply changed 91 paths including patch state; no-op reapply changed 0 and
  skipped 90 managed files; status was current with zero drift; revert changed
  92 paths including state/intent and restored a clean tracked tree.
- Full BG+lazy apply resolved 171 managed files; no-op reapply changed 0 and
  skipped 171; status reported 171/171 current with zero drift; revert changed
  173 paths including state/intent and restored a clean tracked tree.
- Final combination verifier exited 0 with 2,048/2,048 raw selections, 1,024
  normalized graphs, 217 managed paths, maximum 531 resolved units, and
  round-trip `passed` using two workers.
- The standard graph production build exited 0 after 7,808 transformed modules.
  The final server-only token and transaction-order corrections did not modify
  frontend payloads. Svelte diagnostics remained 0 errors and four existing
  warnings.

## Focused adversarial coverage

- ordinary cooldown including copy/rotation failure timing versus forced
  destructive snapshot creation;
- missing source, size mismatch, failed rotation, future timestamp keys, and
  selected-source deletion while queued;
- immutable selected snapshot bytes across queue delay and deferred server
  stream construction/destruction;
- standard flush and lazy cold migration/journal reconciliation, including
  awaiting-metadata refusal and non-overridable flush failure;
- header-only bypass, wrong target, expiry, owner cap, one-use replay, successful
  retry consumption, and failed-retry continuation;
- database swap/journal-delete rollback, successful commit/reset, and
  post-commit snapshot trimming outside the SQLite transaction;
- all three UI retries preserving the exact selected file, backup, or snapshot.

## L2.5 runtime audit

### Phase 1 — flat discovery

- the three destructive UI callers and their existing confirmation closures;
- browser-to-server option/header forwarding through standard, lazy, and BG
  `nodeStorage` ownership;
- native snapshot key allocation, cooldown, copy, logical-size verification,
  count/byte rotation, import staging, storage queue, and cache/migration paths;
- lazy durable journal replay, awaiting-metadata state, transactional restore,
  memory reset, and post-commit cleanup;
- token issue/consume/expiry/cap, direct-header misuse, target mismatch, replay,
  concurrent source deletion, stream abort, and exact revert;
- owner-absent, standard, lazy, BG-standard, and BG+lazy resolved graphs.

### Phase 2 — external-anchor resolution

- **Freshness and rotation — executable tests and applied source.** Forced keys
  are monotonic above existing future keys; copy and logical size are verified
  before and after protected rotation; ordinary saves retain native throttle
  ordering.
- **Failure-before-destruction — adversarial tests.** Snapshot, flush,
  reconciliation, and verification failures occur before staging/copy. The
  server stream is lazy and destroyed on every iterator exit.
- **Bounded acknowledgement — executable tests.** A random token is target
  bound, one-use, five-minute, and capped at 128. Consumption precedes the
  repeated snapshot attempt, so both successful and failed attempts prevent
  replay. The UI can emit bypass headers only from the structured server error.
- **Lazy durability — actual SQLite and exact-source inspection.** Database
  replacement and journal deletion use the already open native transaction;
  failure restores both. Memory reset follows commit. Best-effort trim is after
  commit, closing the auto-rollback/autocommit journal-loss edge found by
  independent review.
- **Existing paths — source comparison.** Disk/size limits, two confirmations,
  remote migration, cache rebuild, custom/local/provider/plugin paths, and the
  native snapshot schema are preserved. No new generation, usage, privacy, or
  plugin-array owner is introduced.
- **Graph and revert — measured.** Exact plan/apply/reapply/status/revert passed
  for standard, lazy, and full BG+lazy graphs. The final 2,048-selection
  verifier closed all normalized graphs and round trips.

### Phase 3 — triage

- **Q3, fixed:** every destructive restore now attempts a fresh verified
  rollback snapshot outside the ordinary throttle, and lazy journal deletion
  cannot commit separately from a failed database swap.
- **Q1, no second authority:** native standard/lazy storage owners, one SQLite
  transaction, and the existing queue/schema remain canonical.
- **Q4, bounded exception:** only one explicit target-bound retry may continue
  without a fresh snapshot, and only after the server's repeated attempt fails.
- **Excluded:** boot snapshot choice, manual/scheduled/selective backup, K30
  refactor, live data migration, and any live apply/restart.
- **Aggregate-only L3:** final iPhone scenarios document restoring each source
  after a fresh snapshot and the explicit failure retry, but are not requested
  from the user in this session.

## Publication boundary

This receipt qualifies local feature/infrastructure commits only. Generated
installer publication, push, tag, release, live apply, and restart remain
unauthorized.

No disposable target was prepared for aggregate L3. Here, “disposable target”
means a separate throwaway PocketRisu installation containing only test data,
so local/server/snapshot restore and forced failures cannot affect the live
user database or backups. The live tree was not used and K26 remains not
exercised.
