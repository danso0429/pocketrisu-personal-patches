# Toolchain-hardening G-to-L/B shadow pilot

## Status and authority

`toolchain-hardening` remains production class `G`. This pilot labels it only as a
`shadow B candidate`. Nothing in this route changes C0 admission, the default
`verify:combinations` or `verify:c0` commands, the stable-release policy, persisted
production state, certificate publication, or C1 authorization.

The independent canonical fallback remains the unchanged blocking command:

```bash
npm run verify:combinations -- --root /absolute/pristine/PocketRisu --jobs 1 --json
```

The one-worker restriction is a pilot cohort requirement: the candidate Global
projection uses the same ordered `0..4095` history as a canonical `--jobs 1` run.
It does not change the canonical checker's default or policy.

## Sealed candidate contract

The versioned declaration is
`contracts/toolchain-hardening-shadow-v1.json`. Its validator requires:

- the exact PocketRisu 1.9.0 target baseline and all three managed file hashes and modes;
- exactly one component, one visible pack, and seven declared units;
- declarative anchor/managed assets instead of executing the CommonJS candidate manifest;
- no product state keys and only the four isolated patch-manager transaction surfaces;
- exact symbol declarations for `localStorage`, `safeStructuredClone`, Vitest,
  happy-dom, KaTeX, Lightning CSS, and Vite/Tailwind consumers;
- four typed local-storage descriptor classes;
- explicit manager PID, transaction-token randomness, and transaction timestamp reads;
- deny-by-default rejection of every undeclared file, state, symbol, environment,
  time, randomness, module, subprocess, network, process-global mutation, and worker reuse.

The supported build boundary is exact Linux arm64/glibc, Node v25.9.0, and pnpm
10.34.1. A different package/lock baseline, build boundary, target tree, declaration,
or runtime capability falls back to Global Exhaustive and is not locally admitted.

## Local domain and isolation

The exact domain is:

```text
2 local visible masks
× 4 admissible localStorage descriptor boundary classes
= 8 fresh executions
```

Every execution receives a new projected target directory and a new Node process.
The process supplies a fresh module graph, empty calculation caches, and no unmanaged
history. Persistent local workers are forbidden. Each execution performs initial
plan, transactional apply, status, zero-change same-selection re-plan, empty-selection
revert, managed/state/artifact restoration, and boundary preservation. The receipt
rejects missing, duplicate, out-of-range, or reused coverage.

Run the material local half without changing the source target:

```bash
npm run pilot:toolchain:local -- \
  --root /absolute/pocketrisu-personal-patches \
  --target /absolute/pristine/PocketRisu \
  --receipt /absolute/evidence/toolchain-local.json \
  --material-shadow
```

## Mandatory Global comparison

A material pilot cohort has three separate executions and no substitution:

1. The eight-execution fresh local route above.
2. The independent 4,096-mask candidate projection route below.
3. The existing blocking Global Exhaustive route captured by the C0 evidence runner
   with `--jobs 1`.

Generate the candidate projection after the local receipt:

```bash
npm run pilot:toolchain:global-projection -- \
  --root /absolute/pocketrisu-personal-patches \
  --target /absolute/pristine/PocketRisu \
  --local-receipt /absolute/evidence/toolchain-local.json \
  --receipt /absolute/evidence/toolchain-global-projection.json
```

The projection executes all 4,096 raw masks using the full current catalog and
persistent one-worker history. It records 2,048 candidate-off and 2,048 candidate-on
projections, status, repeated plan, revert, restoration, source/target roots, and
resources. This is extra shadow work; it does not shorten or replace the canonical
Global run.

Capture the unchanged blocking Global route through the existing C0 evidence program:

```bash
npm run evidence:c0:run -- \
  --root /absolute/pristine/PocketRisu \
  --bundle /absolute/evidence/c0-bundle.json \
  --global-receipt /absolute/evidence/global-receipt.json \
  --store /absolute/evidence/store \
  --governance-commit 49d891b12a51745b9da91bf23105d78869cf8664 \
  --governance-status-version 12 \
  --cohort-class audit \
  --trial-id toolchain-shadow-001 \
  --materially-distinct \
  --jobs 1
```

Build the bound material pilot receipt only after all three inputs exist:

```bash
npm run pilot:toolchain:run -- \
  --material-shadow \
  --root /absolute/pocketrisu-personal-patches \
  --store /absolute/evidence/store \
  --receipt /absolute/evidence/toolchain-pilot.json \
  --governance-commit 49d891b12a51745b9da91bf23105d78869cf8664 \
  --trial-id toolchain-shadow-001 \
  --materially-distinct \
  --local-receipt /absolute/evidence/toolchain-local.json \
  --global-projection /absolute/evidence/toolchain-global-projection.json \
  --global-receipt /absolute/evidence/global-receipt.json \
  --c0-bundle /absolute/evidence/c0-bundle.json
```

The material builder rejects a missing or invalid C0 bundle, incomplete Global
coverage, any jobs count other than one, target mismatch, source/policy/cohort
mismatch, or synthetic input. A mismatch produces pilot correctness `failed`,
candidate admission `denied`, production classification unchanged `G`, and a
separate immutable incident. The accepted Global result remains referenced separately.

## Synthetic dry-run

This command exercises fresh local processes, all boundary classes, a 4,096-entry
known-answer projection, CAS publication, and receipt verification. It never runs the
canonical Global gate and is therefore always marked nonmaterial and ineligible as
production operating evidence:

```bash
npm run pilot:toolchain:dry-run -- \
  --root /absolute/pocketrisu-personal-patches \
  --store /tmp/toolchain-shadow-dry-run/store \
  --receipt /tmp/toolchain-shadow-dry-run/pilot.json \
  --governance-commit 49d891b12a51745b9da91bf23105d78869cf8664 \
  --trial-id synthetic-known-answer-001
```

Verify a passing receipt independently from its content-addressed references:

```bash
npm run pilot:toolchain:verify -- \
  --receipt /tmp/toolchain-shadow-dry-run/pilot.json \
  --store /tmp/toolchain-shadow-dry-run/store
```

A failed receipt additionally requires the immutable incident object's SHA-256 via
`--incident-object`; a retry is a new run/trial in the same exact cohort and cannot
erase or supersede the original negative evidence.

## Evidence, resources, and retention

Local receipts bind child-inclusive CPU, maximum RSS, wall time, projected temporary
peak, exact post-run residue, and logical receipt bytes. Global projection receipts
bind their wall, CPU, RSS, and temporary allocation. Material receipts preserve the
complete C0 wrapper/process-group measurement separately. Pilot publication reports
logical receipt bytes, referenced bytes, new physical bytes after CAS deduplication,
and complete wrapper totals.

All receipts are SHA-256-sealed and published as immutable content-addressed objects.
The C0 retention planner recognizes pilot local/projection/Global/C0 references and
incident-to-pilot links; it remains dry-run only. Synthetic mutations are diagnostics,
not production defect-yield cohorts.

## Tests, failure preservation, and rollback

Focused tests cover off/on masks, missing/duplicate/out-of-range mask and boundary
coverage, baseline drift, undeclared capabilities, package/lock mismatch, apply and
re-plan failure, revert corruption, target-integrity failure, Global mismatch,
interruption, corrupt receipts, and stable cohort identity across retries.

The first failed local/global mask retains its projection path and phase. Operators
must capture that path and receipt before retrying. Do not reset, clean, reschedule,
or delete failure artifacts first.

Rollback is commit-local and newest-first with `git revert`. Revert documentation and
package commands, mutation fixtures, comparison/receipt code, local runner, boundary
sealing, and contract/schema commits independently. Do not use rollback to delete
evidence objects or user data. The unchanged Global Exhaustive command remains the
fallback before, during, and after rollback.
