# PocketRisu patch combination verification instructions

> **Status:** Current maintainer procedure.
>
> **Scope:** The private `pocketrisu-personal-patches` repository. This is the
> operational authority for exhaustive pack-combination verification. It is
> not an implementation receipt and it is not the L2.5 runtime audit.

The measured scaling, exact command inventory, verification limits, and
not-yet-adopted policy alternatives are analyzed separately in
`docs/PATCH-COMBINATION-VERIFICATION-COST-REVIEW.md`. That decision aid does
not change this procedure.

## What this gate proves

The combination verifier checks patch composition and transaction integrity
against a separate pristine PocketRisu source root. For every raw selection
mask of the current user-selectable catalog, it performs:

1. an initial `planTransition()`;
2. transactional apply;
3. `current` or `clean` status, as appropriate;
4. a repeated plan with zero changes;
5. an empty-selection revert plan and transactional apply;
6. SHA-256 and POSIX-mode comparison of every catalog-managed path with the
   worker's initial snapshot.

Every worker uses an independent complete source copy. Aggregation fails
closed on an out-of-range, duplicate, or missing mask. `normalizedGraphs` is
diagnostic information only: it must never replace the raw-selection gate.

The canonical schedule is `stride-v1`: worker `w` of `N` processes masks
`w, w + N, w + 2N, ...` in that order. Each worker reuses one worker thread,
module graph, and calculation-cache set across all of its assigned masks. After
each mask, the verifier restores and checks catalog-managed bytes and POSIX
modes, but process state, module state, cache state, unmanaged filesystem
history, and execution-order history may persist inside that worker. This is
not fresh-per-mask isolation.

The effective worker count, schedule version, and each worker's ordered mask
sequence are semantic execution context and must be retained in the result.
Changing worker assignment, order, cache lifetime, retry order, shard boundary,
or resume behavior requires the qualification in the anti-reward-hacking
section. The canonical checker does not support resume; a retry starts a new
complete execution unless a separately approved policy says otherwise.

The verifier's exact-revert claim is limited to catalog-managed file bytes and
POSIX modes. A feature receipt that claims complete-tree identity must perform
and record its own broader comparison, including the treatment of private
`save` metadata and empty parent directories.

## This gate is not L2.5

These gates answer different questions and neither substitutes for the other:

| Gate | Question | Authority |
| --- | --- | --- |
| Patch combination verification | Do all selected pack graphs plan, apply, report current state, re-plan with zero changes, and revert managed bytes/modes exactly? | This document and `scripts/verify-all-combinations.cjs` |
| L2.5 runtime audit | Which runtime call paths and external effects can the changed code reach, and how are those surfaces resolved and triaged? | The workspace-level `docs/runtime-audit-instructions.md` named by the encompassing `AGENTS.md` |

A manifest, resolver, composition, manager, or managed-unit change normally
requires the combination gate. A runtime behavior change normally requires
L2.5. A feature child or existing-authority merge commonly requires both.

## When to run it

Run the exhaustive combination gate before review completion for any change
that affects:

- a pack manifest, visibility, dependency, conflict, supersession, or
  `autoWhen` relation;
- catalog membership, presets, resolver output, composition ordering, unit
  ownership, transaction behavior, state encoding, or revert behavior;
- a managed unit's anchor, content, file path, or POSIX mode;
- a PocketRisu Kei child admission or an existing-authority merge.

Documentation-only edits do not require another exhaustive run unless they
change a recorded claim about the executable gate.

## Preconditions

1. Use the active patcher checkout containing the change under review.
2. Use a separate, freshly extracted or otherwise proved-pristine PocketRisu
   target. Never point the verifier at the live installation.
3. Confirm the target has no `save/pocketrisu-patches/state.json`.
4. Record the patcher commit, PocketRisu version/revision, and source archive
   SHA-256 or equivalent provenance.
5. Run the patcher test suite first:

   ```bash
   npm test
   ```

6. Do not edit compatibility metadata merely to pass the gate. A target
   declared `reviewing` may use `--allow-reviewing`; an unknown target remains
   refused.

## Routine execution

The portable command uses the operating system temporary directory and the
verifier's bounded automatic worker count:

```bash
npm run verify:combinations -- \
  --root /path/to/separate/pristine/PocketRisu \
  --json
```

For an explicitly declared `reviewing` target:

```bash
npm run verify:combinations -- \
  --root /path/to/separate/pristine/PocketRisu \
  --allow-reviewing \
  --json
```

On Linux, tmpfs may reduce disposable worker-copy I/O without changing the
checks. First inspect both the source size and actual tmpfs capacity:

```bash
du -sk /path/to/separate/pristine/PocketRisu
df -Pk /dev/shm
```

Use tmpfs only when it has enough capacity for the selected number of complete
worker copies and runtime overhead:

```bash
TMPDIR=/dev/shm npm run verify:combinations -- \
  --root /path/to/separate/pristine/PocketRisu \
  --json
```

`--jobs N` may override the automatic count when the operator has measured
CPU and storage capacity. Do not encode one host's worker count as a universal
default. Record the effective `workers` value from the result.

## Phase 0 evidence wrapper

The opt-in evidence wrapper records the patcher source tree, Git commit/status
and diff hashes, policy, catalog, checker/core hashes, and the target
application tree both before and after the unchanged canonical command:

```bash
npm run verify:combinations:evidence -- \
  --root /path/to/separate/pristine/PocketRisu \
  --output /separate/evidence/combination-receipt.json
```

The output must be outside both frozen input roots and must not already exist.
Input roots and the output parent are resolved through symlinks before this
boundary is checked; the wrapper writes through that frozen canonical output
location rather than through a mutable path alias.

Keep both input roots quiescent for the execution. The recorded content trees
prove pre-run and post-run endpoint equality; they are not a continuous
filesystem monitor and do not prove that an external actor could not make and
then exactly revert a transient change between those snapshots.

The wrapper fails closed on source or target drift, spawn error, signal,
nonzero exit, empty or malformed output, nonempty stderr, incomplete raw-mask
coverage, or noncanonical worker history. This wrapper adds provenance; it
does not replace, reduce, resume, or alter the canonical Global Exhaustive
route.

The verifier subprocess writes stdout and stderr to private temporary file
descriptors which the wrapper reads only after process close. This is part of
the execution contract: a runtime that drops nested Node output on pipe-backed
stdio must not turn an empty-output, status-zero tuple into a pass. Temporary
capture files are removed after their bounded contents enter the receipt.

For a Git target, target identity binds the application tree separately from
commit, tracked/index status, staged and unstaged diff hashes, and the contents
of `HEAD`, index, packed refs, shallow marker, and resolved HEAD ref. Directory
and administrative-file mtimes under `.git` are recorded by neither identity
and cannot create application-content drift. This does not weaken VCS binding:
changing commit, index, relevant administrative contents, application paths,
contents, modes, symlinks, or hardlink topology still changes the target root.
Git identity commands remove inherited `GIT_*` repository/index overrides,
disable system and global Git configuration, retain repository-local config,
disable optional Git index writes, and record the observed Git version. The
bound administrative set includes repository/worktree config, info exclude,
object alternates, index, HEAD/ref, packed refs, and shallow state. An ambient
`GIT_DIR` therefore cannot redirect provenance and evidence capture itself
does not refresh the target index.

The routine gate continues to allow a proved-pristine extracted archive. The
evidence wrapper requires its independently obtained lowercase SHA-256:

```bash
--target-provenance sha256:0123456789abcdef...64-hex-characters-total...
```

The declared archive hash is bound into both pre-run and post-run roots. It is
not computed from, or substituted by, the mutable target directory itself.

Every execution receipt must use exactly one disposition: `current-active`,
`historical`, `incomplete`, `invalid`, `superseded`, `diagnostic-only`, or
`defect-reproduction`. Disposition describes evidence lifecycle and does not
turn a failed execution into a pass. Unknown values fail closed. The default is
`current-active`; use `--disposition VALUE` when another lifecycle state is
already known.

Because lifecycle classification can change after a sealed no-clobber receipt
is created, a registry may apply a hash-keyed classification document without
rewriting that receipt content. The override document has this exact shape:

```json
{
  "schema": "patch-verification-receipt-dispositions-v1",
  "entries": [{
    "receiptSha256": "64-lowercase-hex-digits",
    "disposition": "superseded",
    "reason": "A later source cohort replaced this run."
  }]
}
```

Build the sealed registry with:

```bash
npm run verify:combinations:receipt-registry -- \
  --output /separate/evidence/registry.json \
  --classifications /separate/evidence/dispositions.json \
  /separate/evidence/receipt-a.json /separate/evidence/receipt-b.json
```

Every override must match one registered receipt's exact file SHA-256. The
registry preserves both the receipt-recorded and effective dispositions, the
reason, and `executionAccepted`; reclassification can never turn a failed
execution into a pass.

Receipt and registry SHA-256 seals detect content changes and the writers
refuse to overwrite an existing output path. They are not signatures,
certificates, an immutable storage service, or authority to reuse a prior run
as a component certificate. Those later mechanisms remain outside Phase 0.

Before accepting a receipt, run the standalone integrity and execution check:

```bash
npm run verify:combinations:receipt -- --receipt /path/to/receipt.json
```

It independently recomputes output bytes/hashes, JSON parsing, raw-mask
coverage, worker history, content-tree roots, pre/post stability, exact child
command/options, and the receipt payload hash. A
valid negative receipt remains evidence but this command exits nonzero unless
the recorded execution also passed every acceptance predicate.

Runtime-envelope fields have explicit comparison classes:

| Field | Class | Acceptance meaning |
| --- | --- | --- |
| `umask`, `availableParallelism` | semantic | A difference fails closed because file modes or default worker history can change. |
| Node version, platform, architecture, target filesystem type, locale | compatibility-critical | A difference requires requalification and fails pre/post stability. |
| temporary directory and its filesystem type, `NODE_OPTIONS` | compatibility-critical | Worker-copy or inherited child-runtime context changed and requires requalification. |
| timezone, kernel, mount namespace ID | diagnostic | Differences are retained but an opaque identifier alone is not a semantic mismatch. |
| physical CPU count | informational | Effective worker count and ordered worker history remain authoritative. |

Unknown or missing fields fail closed. Diagnostic and informational fields are
not ignored: their differences remain in the receipt, but they cannot block an
otherwise identical run merely because an opaque namespace ID or host label
changed.

Runtime envelope v2 is current. The verifier retains the exact v1 field policy
only to validate already-sealed historical receipts; new receipts always bind
the v2 temporary-filesystem and child-runtime fields. A present field with an
invalid or unavailable value is not treated as evidence merely because the same
invalid value appears before and after the run.

## Acceptance and receipt

Do not predict the result. After a zero exit code, record the observed JSON
and confirm:

- `rawSelections` equals `verifiedSelections`;
- sorted unique `visiblePacks` mechanically implies exactly
  `rawSelections = 2 ^ visiblePacks.length`;
- `roundTrips` is `passed`;
- target identity and compatibility are the reviewed values;
- visible packs, managed path count, maximum resolved units, and effective
  worker count are present;
- `workerHistory.schema`, canonical schedule version, and every worker's
  ordered mask sequence are present and cover the raw domain exactly once;
- cache counters and phase timings, when emitted, are recorded as diagnostics
  rather than fixed acceptance constants.

The feature receipt must additionally record its focused:

- clean-target apply;
- zero-change repeated plan;
- applicable existing-owner composition flows;
- expected `current` or `clean` status and managed paths;
- exact revert boundary;
- target tests, diagnostics, build, provenance, and concrete mobile gate.

The exhaustive result does not by itself prove feature intent, runtime safety,
or UI behavior.

## Anti-reward-hacking rules

- Never deduplicate raw masks by resolved graph.
- Never skip a known slow or failing mask.
- Never reduce the all-managed-path snapshot to only paths changed by the
  current feature.
- Never hardcode a current pack count, mask count, graph count, cache count, or
  expected feature selection as the success answer.
- Never weaken target compatibility, ownership, preservation, status,
  reapply, or revert checks to improve elapsed time.
- Exact caches may reuse only identical calculation inputs. A mismatch or
  failed plan must take the normal path.
- Report measured values and explicit limitations; do not infer unmeasured
  serial speedups from a parallel run.

When cache, sharding, coverage aggregation, or verifier semantics themselves
change, ordinary feature receipts are insufficient. Run the adversarial
patcher tests and a full cached-versus-uncached differential audit for every
raw selection's initial, repeated, and revert plans. Record the reproducible
audit method and result in a dedicated validation receipt. When those
internals are unchanged, do not repeat that expensive differential audit;
the routine exhaustive command remains the gate.

The cache differential is an additional qualification command, never the
canonical gate. It has no alternate schedule option and always uses the same
`stride-v1` worker assignment and persistent worker-local cache history:

```bash
npm run verify:combinations:evidence -- \
  --verification cache-differential \
  --root /path/to/separate/pristine/PocketRisu \
  --output /separate/evidence/cache-differential-receipt.json
```

For every raw mask it compares complete typed cached and uncached initial,
repeated, and revert plans; literal embedded state strings; status; managed
post-apply endpoints; and final restoration. A mismatch, missing comparison,
non-stride worker history, source/target drift, or incomplete coverage fails
closed and leaves Global Exhaustive as the required fallback.

The two modes use independent complete target roots, but within each logical
worker every phase runs `uncached` then `cached` in one worker thread and thus
shares its module graph and process/global history. The result must state this
scope mechanically with `freshIsolated: false`; this differential is neither a
fresh-isolation proof nor permission to weaken the Global Exhaustive fallback.
Scope-enforced results use cache-differential schema v2. The standalone
verifier retains v1 validation only so already-sealed pre-scope receipts remain
historical evidence rather than being rewritten or discarded.

## Phase 1 observational effect inventory

Phase 1 adds an observational inventory command without changing selection,
planning, composition, apply, status, revert, persisted state, generated
installer behavior, or the canonical checker:

```bash
npm run inventory:effects -- \
  --governance-commit <40-hex-governance-commit> \
  --target-root /path/to/pristine/PocketRisu \
  --output /separate/evidence/effect-inventory.json \
  --markdown-output /separate/evidence/effect-inventory.md
```

Both outputs must be outside the source and target roots and must not already
exist. The command freezes source and target before and after compiling the
inventory, observes an `all` prospective plan without applying it, and emits:

- every loaded pack and unit definition, including exact definition hashes;
- file, anchored-region, whole-file ownership, declared ordering, pack
  relation, and higher-order `autoWhen` inventories;
- every declared target-version view;
- the complete patch source tree, embedded catalog comparison, and exact
  byte-for-byte regeneration comparison for every generated installer;
- explicit global patcher-state surfaces and undeclared state/symbol limits;
- conservative candidate L/B/G/U classifications;
- a non-canonical, read-only S0-P per-pack projection of the prospective global
  state; and
- source and target pre-run/post-run roots.

The current CommonJS manifests and inserted application code are not sealed by
a capability API. Therefore a valid current pack is classified as candidate
`G`, while an unknown field, unsupported value, invalid unit, missing source
input, generated-catalog mismatch, or stale generated-installer content fails
closed as `U` or an incomplete inventory. No Phase 1 result admits `L` or `B`, enforces a capability, changes
the global state contract, issues a certificate, skips a transaction, or
replaces Global Exhaustive. S0-P is a read-only observation and is never a
canonical state record.

## Phase 2 capability audit and action hypergraph

Phase 2 adds an explicit audit command. It is not the default checker and does
not change resolver, compose, manager, transaction, status, revert, persisted
state, or generated installer behavior:

```bash
npm run audit:capabilities -- \
  --governance-commit <40-hex-governance-commit> \
  --target-root /path/to/pristine/PocketRisu \
  --output /separate/evidence/capability-audit.json \
  --markdown-output /separate/evidence/capability-audit.md
```

The command first recompiles the Phase 1 inventory and freezes source and
target roots. It then emits:

- a schema-versioned capability contract for the target-compatible catalog and
  for the selected prospective plan;
- mechanically derived file, region, metadata, topology, state, module, and
  unsealed legacy-runtime capabilities;
- pack/unit/resource action nodes and typed edges;
- higher-order `autoWhen`, shared-file, typed-boundary, and global-fallback
  hyperedges without reducing them to pair-only evidence;
- deterministic local and fail-closed component derivations;
- a pre-mutation comparison of every prospective transition precondition,
  file/state write or delete, target-identity read, and transaction-runtime
  action against the compiled contract;
- an exact declared source read-set and a current legacy catalog-load access
  receipt; and
- independent hashes for the inventory, contracts, graphs, access records,
  and complete receipt.

The legacy loader runs in a separate Node process with filesystem reads limited
to the exact Phase 1 source-input files. Filesystem writes, child processes,
workers, native addons, global module search, and string code generation are
not granted. On runtimes that support network permissions, network access is
also not granted. Spawn errors, signals, nonzero exits, stderr, empty output,
invalid JSON, hash mismatch, incomplete catalog coverage, undeclared paths or
modules, and permission mismatches all fail closed.

The transition audit is also read-only. An undeclared target path, state path,
metadata/topology action, target-identity read, journal/lock action, process
observation, time input, or randomness input rejects the audit before
`applyTransition` is called. Its receipt records `mutationPerformed: false`.

The Node permission model is a defense against unintended access, not a proof
against malicious code. Existing file descriptors, environment and
process-global state, time, randomness, promises, streams, native/runtime
loopholes, opaque application code, and worker history therefore remain
unsealed legacy surfaces. Observation of the current load is not promoted to a
capability-completeness proof.

A typed boundary is admitted only when its schema, participants, resource,
input classes, validator, completeness, and fallback are explicit. A shared
resource without such a complete boundary unions its participants. Unknown or
incomplete boundaries, unknown capability fields, forged component hints, and
unsealed Local or Boundary-safe admissions are rejected before mutation.

For the current catalog every pack remains `G` (or would become `U` on an
invalid surface), and the global persisted selection/state and history
connectors union the selected catalog. The Phase 2 graph therefore authorizes
no mask reduction, component checker, certificate, transaction skip, state
migration, default-command change, or canonical-gate replacement. Global
Exhaustive remains the independent required fallback.

## Phase 3A fresh-isolated shadow verifier

Phase 3A adds a non-default shadow path only. An admitted local component is
enumerated over every local raw mask and every explicitly declared boundary
class. Each `(component, boundary class, local mask)` execution receives a new
projected target root and a new Node process, so its module graph, calculation
caches and unmanaged filesystem history are empty.

The worker observes the same transaction sequence as the current oracle:
initial plan, transactional apply, current/clean status, same-selection
zero-change re-plan, empty-selection revert plan, transactional revert and
exact byte/mode restoration. Coverage validation rejects missing, duplicate or
out-of-range masks and boundary classes, and rejects process or projection
reuse. The first failure retains its projection and records component,
boundary, mask and phase.

The current catalog is not locally admitted: its Phase 2 contract is
`L0/B0/G46/U0` and its action graph requires Global Exhaustive fallback.
Therefore `npm run audit:shadow -- ...` records `fallback-required` and executes
zero local masks. It never treats that result as a canonical skip. This command
does not issue certificates, write production state, change defaults or replace
the independent Global Exhaustive command.

## Phase 3B compositional theorem audit

Phase 3B encodes eleven required admission premises as an exact,
machine-readable set. Each premise names its source representation, runtime
enforcement, concrete evidence hash, independent validator and fail-closed
action. Missing, duplicate, unknown or unverified premises never admit a
component. A graph hash change invalidates the old split, and every typed
boundary input class must be linked to concrete boundary classes executed by
every participant component.

The independent theorem path validates capability, action-graph and fresh
shadow receipt hashes without sharing generator caches. It returns only one of
`component-admitted`, `global-fallback` or `admission-rejected`. A current graph
that already requires fallback returns `global-fallback` before any local
admission can be claimed.

The current catalog has no admitted local component and its theorem premises
remain unverified. `npm run audit:theorem -- ...` therefore records
`global-fallback`; it does not issue a certificate, skip a canonical mask,
migrate state, or change the default command.

## Phase 4 S1-D shadow state

Phase 4 keeps format-2 global state as the sole authority. The non-default
`audit:shadow-state` command creates component records only in a separate,
immutable evidence output from a prospective plan; it never writes the target
state path. Pack, unit and order positions plus file ownership are retained so
an independent reader can reconstruct the exact global semantic value.

Every component record binds the action-graph version and has its own ETag.
The aggregate receipt binds the complete global state and graph hashes.
Missing, duplicate, corrupt, stale or cross-component file records fail closed.
Shadow failure does not alter manager status, re-plan, revert, journal recovery
or the canonical global state path.

S1-D records are not canonical, are not migration inputs, do not authorize
transaction skipping and are not certificates. The current one-component
graph produces one shadow record and demonstrates no state locality benefit.

## Failure and cleanup

- A nonzero exit, incomplete coverage, changed repeated plan, unexpected
  status, or snapshot mismatch is a failed gate. Preserve the selection and
  error evidence and diagnose it; do not omit the selection.
- Normal completion and handled failures remove verifier-created temporary
  roots. An abrupt process termination may leave a directory named
  `pocketrisu-combinations-*` under the selected temporary parent.
- Before removing a leftover, resolve its exact path and confirm that it was
  created by this verifier. Never recursively remove a broad temporary,
  workspace, repository, or home-directory path.

## Baseline evidence

The implementation, rejected unsafe shortcuts, full cached-versus-uncached
audit, and measured two-worker results for the initial optimized verifier are
recorded in
`docs/COMBINATION-VERIFIER-OPTIMIZATION-VALIDATION.md`.
