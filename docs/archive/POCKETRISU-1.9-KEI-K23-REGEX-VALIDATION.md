# PocketRisu 1.9 Kei K23 regex-import multiplicity validation

## Scope and authority

This receipt implements only K23-F01/R04 from the overlap-equivalence audit's
technical reclassification recommendations. It does not port Kei's
single-type storage, multi-object grouping helper, regex search, lorebook
roles, quick activation, inline rename, or broad regex/lorebook UI.

The existing `bg-preserve` owner remains authoritative:

- one `customscript` object with `types[]` is one canonical multi-direction
  row;
- equal-key imported rows merge only when their complete direction sets are
  disjoint;
- if any direction overlaps, the imported record starts another canonical
  row so that direction executes again;
- vanilla export continues splitting every row back into single-type records;
- the existing single-row editor/delete/reorder effects R05-R07 are unchanged.

The implementation versions the existing `bg-preserve` pack from
`v1.0.1-patcher.1` to `v1.0.1-patcher.2`. It adds an exact-1.9 sibling for the
already imported `regex-import-merge` unit and one exact-1.9 owned target test;
the 1.8.1 unit retains its imported bytes. It creates no new pack, runtime state
machine, persisted identity, or schema. The imported
`patches/bg-preserve.json` remained byte-identical at SHA-256
`06c482b32e3d3a7e045ce7b3e18b173e9af63205ac68a3dd34fef055cb29efa4`.

No live PocketRisu path, patch state, user data, preserved K12 index, process,
push, tag, release, or restart was changed.

## Feature contract and revert surface

- **Purpose:** preserve the number of executions represented by equal-content,
  same-direction regex records during import.
- **Trigger:** any global, character, module, or regex-list import passes a
  vanilla regex file to the existing `importRegex()` owner.
- **State/result:** imported records are bucketed by the existing editable
  field key. The first bucket row with no direction in common receives the
  incoming directions. If every row overlaps, a shallow canonical copy is
  appended. Row order follows the first appearance of each required row.
- **Preservation:** `types[]`, `type` fallback, merge key, input target array,
  processing/translation consumers, cache key, editor binding, delete/reorder,
  export schema, error reporting, providers, plugins, and storage owners remain
  unchanged.
- **Exact revert surface:** one patcher-local exact-1.9 sibling for
  `bg-preserve:hook:regex-import-merge`, one exact-1.9 owned target test, the BG
  patcher-version token, focused patcher tests, and the catalog/receipt update.
  Revert restores the imported base unit; it does not rewrite
  `bg-preserve.json`.

The adapted BG pack ETag observed during qualification was
`8deb710d417d0e4e0db50c6f39574ef3d9f9d808859591b8bdd5ec0d8e6e1b44`.

## Provenance and resolved graphs

- Patcher pre-feature HEAD:
  `2280c9edc5208d6bcf9d64322d4a593abdbd7114`.
- Exact official PocketRisu target:
  `85a65f3137b45c8de4a8d21a9887be213b1ac3fc`, package `pocketrisu 1.9.0`.
- Pristine `src/ts/process/scripts.ts` SHA-256:
  `5e1cac8969474a8caeac2db313ba2e9d2668dbf1f897b1ced5690f142ee4a8e7`.
- Applied `src/ts/process/scripts.ts` SHA-256:
  `1986f29e2a247292094293e35d440a0072bb3655750ae9053cf0931f08637492`.

Observed owner graphs:

| Selection | Resolved regex owner | Active K23 correction | Compatibility | Collisions |
| --- | --- | ---: | --- | ---: |
| `toolchain-hardening` | absent | 0 | verified | 0 |
| `bg-preserve` | `bg-preserve` + standard storage adapter | import unit + owned test | verified | 0 |

The owner-present graph resolved two packs and 181 active units. Its existing
regex export unit precedes `regex-import-merge:1.9`, and the target test requires
that exact-target sibling. The 1.8.1 graph selects the original imported unit
and zero K23-F01 test units.

## Observed automated gates

- Focused patcher graph/contract suite: 4/4 test files passed.
- Complete patcher suite: 34/34 test files passed.
- Exact-1.9 target Vitest: one file passed 6/6 tests. It measured disjoint-mode
  merge, same-direction duplicate separation, partial-overlap separation,
  first-disjoint row choice, vanilla export multiplicity/order, input copy
  isolation, export/import round-trip, actual repeated execution,
  existing-target preservation, and different-key separation.
- Independent read-only review confirmed the authorized first-disjoint rule,
  ephemeral-only bucket state, unchanged R05-R07 units, and no new schema. It
  identified missing direct execution evidence and an initially universal
  activation surface. The final target fixture was expanded so two imported
  `a -> aa` rows execute once each and yield `aaaa`; the implementation was
  also split into an exact-1.9 sibling while the imported 1.8.1 unit retained
  its original bytes and selection boundary. The final patcher test compares
  that 1.8.1 unit payload to the imported manifest with strict structural
  equality, permitting only the target-version qualifier.
- Svelte diagnostics: exit 0, 0 errors and 0 warnings in the owner-present BG
  graph.
- Production build: exit 0 after 7,818 transformed modules. The observed CSS
  highlight, externalized browser module, dynamic-import, plugin timing, and
  large-chunk warnings were outside the K23 import delta.
- First owner apply changed 90 paths. Status then reported both resolved packs
  current across 88 transaction-managed files. A repeated apply changed zero
  paths and skipped all 88 current files.
- Full revert changed 90 paths and reported clean status. The owned K23 test
  was absent afterward. `scripts.ts` returned to the pristine SHA above, mode
  `0600`, and size 15,308 bytes; tracked target diff was zero.
- Exhaustive combination verifier: exit 0; 2,048/2,048 raw selections,
  1,024 normalized graphs, 211 managed paths, maximum 488 resolved units,
  two workers, and apply/reapply/revert round-trips passed.

The graph and transaction gates do not by themselves prove browser feature
intent or publication qualification.

## L2.5 runtime audit

### Phase 1 — flat discovery

- global, character, module, and regex-list import callers;
- JSON selection, decode, type guard, and existing target-array argument;
- existing editable-field merge key and nullish flag normalization;
- single and multi-mode imported records, duplicate values inside `types[]`;
- equal key with disjoint, same, and partially overlapping mode sets;
- first-disjoint row choice and canonical row order;
- shallow copy/input mutation isolation and pre-existing target rows;
- `type` fallback and `types[]` canonical state;
- vanilla export splitting, row order, and portable schema;
- process/cache/translation mode consumers and repeated row execution;
- keyed editor row, shared-field edit, delete, and Sortable reorder;
- parse/property/allocation failures and partial import behavior;
- CPU/memory growth for one key with many repeated directions;
- timers, listeners, network, filesystem, browser storage, plugin arrays,
  credentials, providers, custom/local endpoints, and code execution;
- exact-1.9 activation, preserved 1.8.1 sibling, composition, target-test
  lifecycle, and revert.

### Phase 2 — external-anchor resolution

- **Import boundary — structural plus measured test.** The break scenario is
  two equal-key `editinput` records reaching one old map value and losing one
  execution. Newly read applied source keeps a list of canonical candidates per
  existing key at `scripts.ts:81-96`, chooses only a row whose every mode is
  absent from the incoming set at `97-99`, and appends a copied row when none
  qualifies at `105-117`. The target test observed two rows for the duplicate.
- **Disjoint and partial overlap — structural plus measured test.** A disjoint
  `editinput`/`editoutput` pair merges into one `types[]` row at
  `scripts.ts:100-103`. An incoming set containing `editoutput` cannot enter a
  candidate already containing that mode even if its other mode is new. The
  target test observed two rows for `[input,output]` plus `[output,process]`.
  The first matching candidate is selected by `Array.find`, preserving the
  explicit first-disjoint policy.
- **Multiplicity invariant — structural plus measured test.** For any direction `m`, a candidate
  already containing `m` fails the disjoint predicate. Therefore two input
  records containing `m` can never occupy the same canonical row. Applied
  runtime source constructs its script list from canonical objects at
  `scripts.ts:199-201`, retains every object in `parsedScripts` at `365-399`,
  and calls `executeScript()` once per row at `401-410`. Its mode guard uses
  `scriptModes(script).includes(mode)` at `218-220`. The expanded target test
  imported two identical `a -> aa` input rows and observed `aaaa`, measuring
  one execution per retained row without a new identity field.
- **Canonical schema and export — structural plus measured test.** The schema
  remains `type:string` plus optional `types?:string[]` at
  `database.svelte.ts:1584-1598`. The import normalizes a copied row and keeps
  `type` equal to its first mode. Existing export iterates every canonical row,
  deletes `types`, and emits one copy per mode at `scripts.ts:40-65`. The target
  test imported input/input/output and observed exported
  input/output/input—two input executions and one output, all without
  `types[]` in the portable records. Re-importing that exact payload recreated
  the same two canonical rows.
- **Existing target and source isolation — structural plus measured test.** The
  candidate map begins empty for each import and tracks only newly imported
  rows, so a pre-existing target object is not merged or rewritten. Every new
  row is a shallow object copy before normalization. The target test retained
  the exact pre-existing object at index zero, appended different rows, and
  observed distinct imported object identities.
- **R05-R07 and downstream consumers — structural.** No RegexData/RegexList,
  cache, processing, or translator managed source payload or runtime behavior
  changed in K23-F01. The exact-1.9 sibling adds only an ordering reference to
  the existing cache unit. The applied keyed list still renders, edits, deletes,
  and reorders one object per canonical row (`RegexList.svelte:74-108`), while
  the existing editor binds all modes on that object
  (`RegexData.svelte:84-118`). Cache/process and translator continue reading
  `scriptModes()` (`scripts.ts:135-145`, `218-220`;
  `translator.ts:685-701`). This preserves the simpler canonical-row
  equivalence and does not reintroduce K's multi-object synchronization.
- **Failures and resource bounds — structural.** File selection and JSON/error
  handling are unchanged. A getter, allocation, or collection operation inside
  the existing try block reports through the native `alertError` catch. As
  before, rows appended before a later exceptional record are not rolled back.
  Candidate state is local to one import and only the canonical output rows are
  retained. First-disjoint scanning is worst-case quadratic for many equal-key
  repeated rows and mode comparisons add the size of each small mode list; no
  timer, retry, or background work is introduced.
- **External effects — structural N/A with adversarial recheck.** K23-F01 adds
  no fetch, socket, timer, listener, abort controller, filesystem/browser
  storage write, credential, provider, endpoint, plugin-array write, eval, or
  dynamic-function surface. Its only output is the existing in-memory target
  array and the existing import error channel.
- **Pack and revert — measured.** Owner-absent and owner-present plans, target
  apply/status/reapply/revert, source hash/mode, owned-test removal, complete
  patcher tests, target diagnostics, and production build were observed as
  recorded above.

### Phase 3 — triage

- **Q3, fixed:** equal-key records with an overlapping direction no longer
  collapse into one execution during import.
- **Q3, resolved by observed gates:** disjoint grouping, overlap separation,
  vanilla export, target compile/build, owner graph, idempotent apply, and exact
  revert passed the gates above.
- **Q1, no new runtime owner:** the existing `types[]` row remains the only
  schema and execution authority; no separate identity or group state exists.
- **Q4, bounded prepared surface:** first-disjoint scanning can be quadratic
  for an adversarial import containing many equal-key same-direction rows. No
  large-regex-import latency measurement was required by the audit or observed
  in this session. If a real import-latency signal appears, optimize the local
  candidate index without changing row placement or multiplicity semantics.
- **No K23-specific L3:** the audit classified presence and multiplicity from
  complete source paths and required no browser L3. Final aggregate K19 and
  K29 iPhone scenarios remain separate gates.

### Cross-piece integration check

K23 changes the existing BG owner's import result only. Its interaction with
the later K27 logging, K29 retention, and K26 restore work is structurally
disjoint; the exhaustive combination result and final aggregate audit remain
the composition authorities. K04/K17 add no regex state.

## Publication boundary

This receipt qualifies a local patcher-owner version only. It does not
authorize or claim generated-installer publication, push, tag, release, live
apply, or restart. Final aggregate review and the consolidated iPhone L3
remain later gates.
