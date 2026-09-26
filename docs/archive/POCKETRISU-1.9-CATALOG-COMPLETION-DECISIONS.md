# PocketRisu 1.9 catalog completion decisions

Date: 2026-08-02 KST

## Result and scope

This record closes the PocketRisu 1.9 re-evaluation of Kei rows that had not
been admitted before the target pivot. It decides whether each row is part of
the current aggregate candidate; it does not claim that every possible Kei
feature has been implemented.

The original `pocketrisu-kei` aggregate contained the seven admitted children
K19, K13, K14, K16, K15, K11, and K12. The later overlap-equivalence audit
admitted narrowly bounded K04-F01, K17-F01, K23-F01, K27-F01, K26-F02,
K29-F05, and K22-F01 P04-P06 corrections. K29-F02 G06 was fully matrixed but
received no runtime unit because the current caller and append-oriented BG
owner cannot preserve its operation semantics. The admitted changes reuse
native schemas and owners; none adds a provider, a new privacy policy, or a
second storage authority.

Evidence was read from frozen PocketRisu Kei revision
`cc1d1b195babd887577ebf943d5e82f01f58135c`, exact official PocketRisu 1.9.0
revision `85a65f3137b45c8de4a8d21a9887be213b1ac3fc`, and the qualified local pack
owners.

## Final 1.9 decisions

| Row | 1.9 decision | Reason and owner |
| --- | --- | --- |
| K03 preset folders | Defer as a future child; not in the current aggregate | Kei has a distinct `promptPresetFolders`/`folderId` schema and sortable `PresetPickerLayout`; exact 1.9 has no corresponding symbols. This is a new feature, not a target adaptation of an already-admitted child. A later admission must compose with `preset-integrity` and the organizer-owned picker schemas. |
| K04 prompt roles/preset behavior | Keep only audited K04-F01 compatibility; drop the broad direct port | Exact 1.9 keeps native `role2` authoritative, but frozen Kei typed blocks can persist only `.role`. The hidden exact-1.9 compatibility child passes `.role` through the native normalizer only when `.role2` is nullish. It excludes lorebook and adds no second schema. Active-index behavior remains in `preset-integrity`. |
| K17 text-theme normalization | Keep only audited K17-F01 compatibility; drop the broad refactor | Exact 1.9 has the same three official theme modes and API-v3 validation, but unsupported persisted or preset values can survive and leave stale CSS. The hidden exact-1.9 child normalizes load, preset activation, and runtime CSS to `standard` while preserving `standard`, `highcontrast`, and `custom`. |
| K20 character list/sidebar expansion | Defer missing search/recent/view controls to `character-organizer` | Folder and order authority is already qualified in `character-organizer`. No second Kei order schema enters the aggregate. A later independently specified UI delta may render the existing schema. |
| K22 persona picker/list expansion | Keep audited P04-P06 in `persona-organizer`; defer P07 duplicate | The same folder/order/normalization/import owner now provides case-insensitive name/note search, Folder and Unfiled picker scopes, and create/import into a still-valid selected folder. Filtered rows retain canonical persona indices; invalid/deleted scope falls back without dropping personas. Existing referential and asset cleanup remain authoritative, and no parallel identity/schema or duplicate action is added. |
| K23 regex/lorebook rewrite | Keep only audited K23-F01 in `bg-preserve`; exclude the direct port | The canonical `types[]` row already provides grouped edit/delete/reorder, but the old import bucket collapsed equal same-direction records and lost an execution. K23-F01 merges only disjoint mode sets and starts a separate canonical row on any overlap. It adds no identity or multi-object grouping schema; regex search and lorebook features remain deferred. |
| K26 backup tools | Keep only audited K26-F02 in the native owner; drop the combined direct port | Exact 1.9 already owns bounded snapshots and all three destructive restore paths, but its five-minute helper could skip the rollback point immediately before restore. K26-F02 force-creates and verifies a unique fresh snapshot, reconciles the selected standard/lazy owner, and stops on failure. A failed preflight issues a five-minute, one-use token bound to that exact restore target; the repeated request burns it whether its new snapshot attempt succeeds or fails, and may continue snapshot-less only after that repeated attempt fails. Manual schedules, selective missing-asset restore, and other broad Kei tools remain deferred owner-local additions. |
| K27 request logs | Keep only audited K27-F01 in `bg-preserve`; defer policy/UI differences | Exact 1.9 already bounds body storage to 256 MiB, caps individual fields, masks credential patterns, retains at least 50 recent rows, and cursor-paginates list reads. K27-F01 connects the BG server bundle's native log POST to that same owner. Platform metadata, per-row deletion, metadata-only defaults, and expiry remain separate explicit decisions. |
| K28 usage insights | Close only BG delivery U03 through K27-F01; defer rich/independent policy | The same native transaction records content-free, failure-isolated LLM usage for BG calls after K27-F01. Usage rows remain unbounded/unpaginated and coupled to the body-log toggle. Rich dimensions, retention, pagination, and decoupling remain explicit future policy and do not enter this correction. |
| K29 Revenant | Keep only bounded K29-F05 in `bg-preserve`; keep G06 blocked; exclude the direct port | Completed but unconsumed results now use a 48-hour TTL, 128-row cap, and 256 MiB payload budget. Active or live-claimed work is not evicted; durable delivered state, exact-revision ACK, and idempotency remain authoritative. The G06 matrix found no safe standard non-Gemini reroll/continue composition that preserves custom/local/provider overrides, typed targets, browser epilogues, cancel rollback, and exact-once materialization, so it adds no runtime unit. |

K05-K09 and K24-K25 remain separate opt-in provider/network/storage-policy
designs under the frozen catalog. K21 destructive retention and K30 broad
restore refactoring also remain outside the umbrella. None is a dependency of
the original children or the bounded audit corrections above.

## Exact source anchors

### Presets

- Kei `src/lib/Setting/botpreset.svelte` reads and writes
  `promptPresetFolders` and per-preset `folderId`, and mounts
  `PresetPickerLayout` for search, folder assignment, and sorting.
- Exact 1.9 contains no `promptPresetFolders` or prompt-preset `folderId`.
- Both trees define prompt roles and normalize imported aliases. Exact 1.9's
  block items use `role2` in `database.svelte.ts`, `prompt.ts`, and
  `PromptDataItem.svelte`; that schema stays native. The overlap audit found a
  one-way frozen-data gap: typed Kei `.role` was otherwise retained but not
  consumed. K04-F01 closes only that gap at the native normalizer, with
  non-null `.role2` precedence and no lorebook role behavior.

### Text theme

- Exact 1.9 and frozen Kei expose the same `standard`, `highcontrast`, and
  `custom` runtime branches and the same API-v3 validation surface.
- Exact 1.9 previously defaulted only nullish database values, copied a raw
  preset value on activation, and switched on a raw runtime value without a
  default branch.
- K17-F01 keeps that native owner and schema, but admits only the three native
  values at load, preset activation, and runtime CSS. Unsupported values become
  `standard`; preset save/import expansion and broad styling remain excluded.

### Regex import multiplicity

- `bg-preserve` remains the only owner of the local `customscript.types[]`
  extension. Its runtime, translator, editor, delete, reorder, import, and
  vanilla-export paths all consume the same canonical row objects.
- The prior import map kept only one row per editable-field key, so a second
  record with an already present direction was deduplicated into the same
  `types[]` set and one execution disappeared.
- K23-F01 keeps the key and schema but stores multiple candidate rows per key.
  It merges into the first row whose modes are disjoint; any overlap appends a
  new canonical row. Vanilla export still emits one single-type record for each
  direction on every row.

### Backup and restore

- Exact 1.9 `server.cjs` creates `database/dbbackup-*` snapshots after
  successful persistence with a five-minute default cooldown, configurable
  count/byte bounds, and newest-snapshot retention.
- Its snapshot restore drains pending persistence, copies the snapshot to the
  live blob inside the storage-operation queue, invalidates caches, reruns the
  remote-block migration, rebuilds chat state, and refreshes the ETag.
- Its UI requires two confirmations for snapshot, local-file, and server-file
  restore; it also exposes server backups, settings-only export, limits, disk
  guards, and an optional boot backup prompt.
- K26-F02 keeps that owner but splits ordinary and destructive behavior. Normal
  saves retain the native five-minute throttle and failure-path timing. Restore
  preflight bypasses the throttle, allocates above the newest snapshot key,
  verifies source/destination size before and after protected rotation, and
  starts import staging or live replacement only after success.
- The lazy adapter initializes migration and replays its durable chat journal
  before canonical persistence. Existing-chat journal writes enter the fresh
  database snapshot; an acknowledged new chat still awaiting its metadata stub
  makes the snapshot incomplete and therefore takes the same structured
  failure/explicit-retry path instead of being silently discarded.
- Snapshot restore holds the already validated selected snapshot bytes across
  the storage-queue wait, so concurrent key deletion cannot turn native
  `kvCopyValue`'s missing-source no-op into false success. Server-file streams
  are opened only when import begins and are destroyed on every iterator exit.
- Snapshot creation and verification failure returns
  `fresh_snapshot_required` before destructive work. The client repeats the
  exact selected file, server backup, or snapshot only after an additional
  confirmation and sends the server-issued target-bound token. The server
  retains at most 128 tokens for five minutes, consumes a token on its one
  repeated request regardless of snapshot success or failure, and still
  attempts a new snapshot before permitting snapshot-less continuation.
- Lazy snapshot restore commits the selected database replacement and durable
  journal deletion in one native SQLite transaction, resets journal memory only
  after commit, and performs best-effort snapshot-limit trimming afterward.
  This prevents an auto-rollback-class SQLite failure from leaving the old
  database with its acknowledged journal deleted.
- Kei additionally has manual snapshot/schedule endpoints and selective
  missing-asset restore. Those are not treated as proof that its complete
  backup/restore owner should replace official 1.9.

### Logs and usage

- Exact 1.9 `request-logs.cjs` stores request bodies and usage rows in separate
  tables. Request rows rotate by byte budget; usage rows explicitly do not.
- `requestLogEnabled` defaults on and gates both content logging and usage.
  List reads omit bodies unless requested and support an ID cursor/limit.
- K27-F01 does not add another logger. In exact 1.9, `bg-preserve` intercepts
  only the server bundle's otherwise-unroutable relative `/api/request-logs`
  POST and hands its unchanged batch to the already-open native
  `requestLogs.addRequestLogBatch` owner. The native toggle still prevents the
  POST at its source; native normalization and the single request/usage
  transaction remain authoritative.
- These observations correct the old shorthand that all 1.9 request logging
  is unbounded. They do not resolve the default-content or usage-retention
  policy choices.

### Persona picker coherence

- `persona-organizer` remains the canonical `personaFolders`/`folderId`,
  ordered-persona, normalization, import/export, referential-cleanup, and
  asset-cleanup owner.
- K22-F01 P04-P06 replaces only the native flat picker and extends the existing
  settings actions. Search and folder filters return the original persona-array
  index; Unfiled includes absent and orphaned references; invalid/deleted scope
  falls back to All.
- Create/import resolves the selected folder against the current database.
  Import completes asset storage before re-reading that database, then returns
  the actual `push(...) - 1` index for ordinary selection or PersonaBind.
- P07 duplicate and a second persona identity or folder schema remain excluded.

### BG result retention and G06

- K29-F05 stays inside the existing `bg-preserve` operation/result/claim/ACK
  owner. Its 48-hour TTL, 128-row limit, and 256 MiB payload budget evict only
  oldest unclaimed terminal payloads; active operations and live claims remain
  protected. Browser pending markers retain 49 hours to cover up to one hour
  before server result persistence, while the paid-operation tombstone retains
  48 hours; both client ledgers remain capped at 128.
- Exact revision ACK remains immediate cleanup, and a durable delivered state
  still precedes payload deletion.
- G06 received a complete provider/request-class matrix, not a partial
  provider allowlist. The existing browser blocking reroll/continue caller owns
  typed mutation targets, swipe/comment epilogues, and cancellation rollback
  that the append-oriented BG request/result schema does not carry. No runtime
  unit was admitted.

## Explicit exclusions

- K29 G03 live token replay; G07/G08/G12; translation/Hypa/Lua cold consumers
  G13-G15; and server-restart partial materialization G20.
- K27 platform badge and per-row delete; rich accounting, independent usage
  policy, and any new privacy policy.
- K04/K23 lorebook roles; K23 quick activation, inline rename, and regex
  search.
- K20 character presentation variants and K22 persona duplicate P07.
- K26 boot-snapshot third choice and manual, scheduled, or selective backup.
- K19 viewer reimplementation. Its existing swipe/VoiceOver/focus behavior and
  the qualified K29 G09 cold-reroll presentation path remain aggregate iPhone
  L3 observations only; neither widens the blocked G06 scope.

## Aggregate and future boundary

The post-audit aggregate requalification passed through the feature receipts:
2,048/2,048 raw selections, 1,024 normalized graphs, 222 managed paths, a
538-unit maximum graph, complete target tests/builds, exact revert, and
deterministic generated installers. The current observations are recorded in
`docs/POCKETRISU-1.9-AGGREGATE-VALIDATION.md`. The older `2991355` aggregate
receipt is baseline evidence, not proof for these later corrections. Rows
above are native-owned, narrowly admitted, excluded, deferred new features,
or separate opt-in policy packs. Deferral does not reclassify a feature as
implemented.

A future row can be admitted only through its own purpose, target, owner,
tests, exact revert, L2.5, and interaction receipt. In particular, K03 or a
selective K26 asset tool must not be slipped into `pocketrisu-kei` as an
incidental aggregate fix.
