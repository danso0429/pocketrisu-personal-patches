# Target-scoped patch unit validation

Date: 2026-08-01 KST

## Scope and contract

This change adds exact-target scope to individual patch units without
changing the state format or the behavior of units that omit the new field.
A scoped unit uses this manifest shape:

```js
targetVersions: {
    pocketrisu: ['1.9.0'],
}
```

Every listed version must already belong to the enclosing pack's `verified`
or `reviewing` target declaration. The selected target comes from the source
root's `package.json`. Non-matching units do not enter the unit order,
collision graph, managed path reads, composition, or applied-state snapshot.
Snapshots from a previous target remain available long enough to strip and
restore their exact managed units during a target transition.

This receipt covers the manager infrastructure before its first real
version-scoped consumer. Personal Settings Search admission and its focused
PocketRisu 1.9.0 qualification are recorded separately with that feature.

## Automated validation

The focused manager tests observed:

- unscoped units planned, applied, and reverted on both PocketRisu 1.8.1 and
  1.9.0;
- a 1.9.0-scoped unit was absent from the 1.8.1 plan, state, path reads, and
  source output;
- the same unit applied on 1.9.0, reported `current`, produced a zero-change
  repeated plan, and reverted to the exact baseline;
- an undeclared version, an empty version list, and duplicate versions were
  refused as `INVALID_PACK`;
- changing the target after installation reported `drifted`, and replanning
  recomposed the new target's exact unit set;
- changing the target after planning raised `STALE_TRANSITION` before any
  patch source, state, or transaction journal was written.

`node --test test/manager.test.cjs` passed. The complete patcher suite passed
all 28 test files. `git diff --check` reported no errors.

The routine exhaustive gate used the separate pristine PocketRisu 1.8.1
source copy at official revision
`63832a138c14cc7f11364cf7efdcb61950e7894c`. Before the run, a
commit-to-work-tree comparison against the local official `v1.8.1` Git tag
exited zero with no tracked byte differences, and patch state was absent. Its
observed result was:

```json
{
  "target": {
    "packageName": "pocketrisu",
    "packageVersion": "1.8.1"
  },
  "compatibility": "verified",
  "rawSelections": 2048,
  "verifiedSelections": 2048,
  "normalizedGraphs": 1024,
  "managedPaths": 189,
  "maximumResolvedUnits": 425,
  "roundTrips": "passed",
  "workers": 2
}
```

The verifier exercised initial plan/apply, status, zero-change replan, empty
selection revert, and SHA-256/POSIX-mode identity for every catalog-managed
path in every raw selection. It did not modify the supplied pristine source.

## L2.5 runtime audit

### Phase 1 — flat discovery

- A manifest unit can be universal or restricted to exact package versions.
- Malformed, empty, duplicate, and pack-undeclared version scopes can reach
  pack validation.
- The target package name and version can select or omit each scoped unit.
- Filtering can change the unit order, collision inputs, managed file paths,
  composition outputs, state contents, and pack ETag.
- A scoped unit's host file can be absent on a target where that unit is
  omitted.
- An applied state from one target can be replanned against another target.
- The target can change after a transition is planned and before it is
  applied.
- Status can observe unchanged managed bytes after the target has changed.
- Missing or malformed `package.json` can affect target identity reads.
- Legacy format-1 state has no recorded target identity.
- CLI plan, apply, stage, status, and exhaustive combination verification all
  call the changed manager paths.
- Manifest size can affect synchronous validation and filtering work and the
  size of stored unit snapshots.
- The changed paths can encounter filesystem read and JSON parse failures.
- The change introduces no timer, promise, event handler, network request,
  binary transform, text encoding conversion, process handle, file
  descriptor, socket, mobile/OS branch, credential, executable input, or new
  filesystem path derived from target-version metadata.

### Phase 2 — external-anchor resolution

- **Scope validation — structural.** `validatePack()` invokes
  `validateUnitTargetVersions()` before flattening. The validator requires a
  non-empty object, non-empty unique string lists, and membership in the
  enclosing pack's declared target sets (`src/manager.cjs:502-565`). The
  adversarial malformed cases all raised `INVALID_PACK`
  (`test/manager.test.cjs:425-449`).
- **Exact selection — structural.** `planTransition()` reads one target
  identity and passes it to `flattenUnits()`. `unitMatchesTarget()` accepts all
  unscoped units and accepts a scoped unit only when both its package key and
  exact version match (`src/manager.cjs:573-585,619-629,694-712`). The 1.8.1
  and 1.9.0 focused tests observed the opposite scoped-unit plans from the
  same synthetic manifest (`test/manager.test.cjs:284-353`).
- **Inactive-path exclusion — structural.** The managed `paths` set is built
  from the already filtered desired units plus previous state units. A fresh
  1.8.1 plan therefore did not read or create the 1.9-only host path; its
  state contained only the universal unit. A previous-state path remains in
  the set, and `stripCurrentUnits()` reverses the stored order before the new
  target graph is composed, so target transitions do not strand old blocks
  (`src/manager.cjs:587-599,700-707`; `test/manager.test.cjs:284-311,355-396`).
- **Composition, ETag, and cache identity — structural.** Only filtered units
  reach `compose()` and `makeState()`. `packEtag()` serializes the complete
  manifest unit definitions, so adding or changing `targetVersions` changes
  pack identity. Exact caches compare the resulting unit arrays/state rather
  than assuming one graph across targets
  (`src/manager.cjs:96-120,631-665,694-731`). The 2,048-selection exhaustive
  run exercised these paths with cache reuse and exact reverts
  (`scripts/verify-all-combinations.cjs:202-270`).
- **Status target drift — structural.** A breaking scenario was reproduced by
  applying on 1.8.1 and changing only `package.json` to 1.9.0: managed bytes
  still matched, but the stored and current targets differed. `status()` now
  reads the current target and makes that mismatch top-level `drifted`; the
  test observed stored 1.8.1 and current 1.9.0 simultaneously. Legacy state
  without a target reports target status `unknown` and retains its previous
  file-hash status behavior (`src/manager.cjs:936-971`;
  `test/manager.test.cjs:355-396`).
- **Plan/apply race — structural.** A breaking scenario was reproduced by
  planning the 1.9.0 scoped unit and changing the target to 1.8.1 before
  apply. `validateTransitionPreconditions()` now compares the current target
  with the plan target before the zero-change return, original snapshots, or
  journal write. The test observed `STALE_TRANSITION`, unchanged source, no
  state, and no journal (`src/manager.cjs:780-866`;
  `test/manager.test.cjs:398-423`). Like the existing file preconditions, an
  unrelated external writer can still race after the validation read; the
  patcher lock serializes patcher writers but is not an operating-system lock
  on arbitrary external editors. No stronger cross-process atomicity is
  claimed.
- **Read and parse failures — structural.** Target identity is read during
  planning, status, and precondition validation. A missing `package.json`
  yields a null identity and therefore matches no scoped unit; malformed JSON
  throws before planning or applying writes. Filesystem read failures
  propagate through the same synchronous call chain and do not enter the
  transaction writer (`src/manager.cjs:619-629,694-712,818-866,936-942`).
- **Unknown target and CLI gates — structural.** Planning itself remains a
  read-only diagnostic and can omit all scoped units for an unknown target.
  Apply/stage callers evaluate exact compatibility and refuse an unsupported
  target before `applyTransition()`. The exhaustive verifier independently
  asserts verified/reviewing compatibility before processing masks
  (`src/cli.cjs:587-646,860-920`;
  `scripts/verify-all-combinations.cjs:120-147`).
- **Synchronous cost and state growth — structural plus measured.** The new
  validation/filtering is linear in maintainer-authored manifest units and
  exact-version entries and creates no persistent collection outside the
  existing state snapshot. The full 1.8.1 catalog run completed all 2,048 raw
  selections with maximum 425 resolved units and exact round trips
  (`src/manager.cjs:515-540,579-585` and the measured result above). This does
  not establish a universal performance bound for arbitrarily large private
  manifests.
- **Async, resource, environment, and security absence — structural.** Fresh
  inspection of the changed manager functions and repository-wide callers
  found only synchronous object/array work and existing filesystem reads.
  A counterexample through a dynamic callback, alias, or generated path was
  sought; the new metadata is consumed only by direct manager calls and never
  passed to I/O path resolution or execution (`src/manager.cjs:502-585` and
  the direct callers at `src/manager.cjs:694-712`). Those surfaces are
  therefore not applicable to this change.

### Phase 3 — triage

- **Q3, fixed:** malformed/undeclared scope admission, stale target status,
  and plan/apply target drift were all reproducible structural faults and are
  covered by manager tests.
- **Q3, resolved by preserved behavior:** inactive path access, previous-unit
  cleanup, exact reapply, state identity, and existing 1.8.1 graph regression
  are covered by focused tests and the exhaustive combination gate.
- **Q4, retained limitation:** an arbitrary non-patcher process can alter the
  target after the synchronous precondition read. Eliminating that final
  inter-process window would require a shared OS-level writer protocol across
  upstream replacement tools, not a local manager-only guard. The safety
  signal is `STALE_TRANSITION` when the change precedes validation; a target
  replacement concurrent with active patch application remains outside the
  supported operating procedure.
- **Q4, retained limitation:** linear work is measured only for the current
  maintainer catalog. Unbounded third-party manifest size is not a supported
  input contract.

### Prepared surfaces

1. **Concurrent external target replacement.** The chain is closed through
   target capture, patcher lock acquisition, and immediate pre-write target
   validation. The exact open link is an external writer changing
   `package.json` after validation while the patch transaction writes other
   files. The manager cannot coordinate a process that does not honor its
   lock. Review deployment tooling for a stop/replace/apply sequence; safety
   and risk divide at whether every source replacement is excluded during an
   active patch transaction.
2. **Arbitrarily large private manifests.** Validation and filtering are
   linear and current-catalog execution was measured. The exact open link is
   resource behavior for an unbounded number or size of maintainer-provided
   unit definitions. No representative third-party limit exists to measure.
   If external manifest loading is ever added, define and test explicit unit
   and serialized-size ceilings before treating that input as supported.

### Cross-piece integration check

Validation, target filtering, previous-state stripping, composition, ETag and
state encoding, status, and transaction preconditions were inspected as one
flow. The interaction audit first exposed the stale-status and stale-plan
faults; both were fixed before this receipt. The exhaustive 1.8.1 gate then
exercised the combined manager flow through all existing pack graphs. The
first real 1.9-only consumer must still prove that a scoped unit is omitted on
1.8.1 and applied, tested, and exactly reverted on 1.9.0.

## Publication state

The work is local for review. No installer build, push, tag, release, live
PocketRisu apply, data migration, or PocketRisu restart was performed.
