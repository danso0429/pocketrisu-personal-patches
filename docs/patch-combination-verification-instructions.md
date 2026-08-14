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
The wrapper fails closed on source or target drift, spawn error, signal,
nonzero exit, empty or malformed output, incomplete raw-mask coverage, or
noncanonical worker history. This wrapper adds provenance; it does not replace,
reduce, resume, or alter the canonical Global Exhaustive route.

## Acceptance and receipt

Do not predict the result. After a zero exit code, record the observed JSON
and confirm:

- `rawSelections` equals `verifiedSelections`;
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
