# C0 evidence operating program

> **Status:** Additive, non-default Post-Phase-9 evidence infrastructure.
>
> **Canonical protection:** The current catalog remains global-only C0 and the
> blocking gate remains Global Exhaustive. This program does not admit an L/B
> pack, authorize C1, publish a certificate, skip a mask, migrate production
> state, or change a stable-release boundary.

## Purpose and authority

This program accumulates immutable operating evidence for a future read-only
Phase 9 maturity review. It does not decide that review and it cannot authorize
C1. Every run must pin the exact public governance commit and status version
observed immediately before the run. The public bootstrap entrypoint is:

```text
https://raw.githubusercontent.com/danso0429/patch-verification-governance/main/LLM-ENTRYPOINT.md
```

The evidence runner executes the unchanged
`scripts/verify-all-combinations.cjs` entrypoint. It does not call
`scripts/verify-c0.cjs`, reduce the raw domain, change the worker schedule, or
use prior evidence to skip execution. `npm run verify:combinations` remains the
independent canonical fallback and its package script is unchanged.

## Evidence object model

The seven versioned schemas are:

```text
patch-c0-evidence-bundle-v1
patch-c0-cohort-ledger-v1
patch-c0-stable-release-ledger-v1
patch-c0-incident-record-v1
patch-c0-defect-yield-summary-v1
patch-c0-retention-plan-v1
patch-c0-review-trigger-v1
```

A bundle binds all of these inputs and observations:

- governance repository, commit and status version;
- implementation origin, commit, branch, status hash, staged diff hash and
  unstaged diff hash;
- canonical policy path and SHA-256;
- complete catalog content root;
- sorted schema path/hash list and its root;
- target commit, Git identity, complete application-tree pre/post roots and
  complete target pre/post evidence hashes;
- semantic and compatibility-critical runtime identity, plus the complete
  before/after runtime envelopes in the referenced Global receipt;
- exact child argv, effective worker count, `stride-v1` schedule and every
  worker's ordered mask sequence hash;
- shared-per-worker cache, module and unmanaged-history modes;
- focused-gate, Global Exhaustive and product-gate results as three separate
  fields;
- output/spawn/signal, exact raw coverage, target integrity, receipt integrity
  and C0/Global agreement;
- canonical-protection constants: Global fallback retained, default unchanged,
  zero production certificates, zero skipped canonical masks, no production
  state migration and no C1 authorization.

Every document seal is computed over canonical JSON. The evidence store keeps
the document's exact compact JSON property order and writes those bytes to:

```text
STORE/objects/sha256/HH/REMAINING-62-HEX.json
```

Publication uses no-clobber linking. An existing path is accepted only when
its bytes exactly match its hash. Exact duplicate publication reports zero new
physical bytes; it does not rewrite the object. Store verification rejects a
symlink, non-regular file, hash mismatch, malformed JSON, or JSON that is not
the exact compact encoding represented by its parsed insertion order. This
order preservation is required because current tree/state evidence includes
order-sensitive exact-byte identities; the store must not normalize them.
Semantically equal documents with different property order therefore remain
different exact evidence objects. The seal and content address provide tamper
detection, not a signature or a component certificate.

## Cohort and trial identity

`cohortId`, `runId`, repeated trials and material cohorts are deliberately
different:

- `cohortId` hashes the semantic cohort identity: governance, implementation
  and dirty-state identity, policy, catalog, schema, target, runtime,
  command, worker history and cache/history mode.
- `runId` additionally binds the complete run bundle except its own value,
  including the trial ID, outcomes and resource observation.
- a repeated performance trial keeps the cohort identity but receives a new
  trial ID and run ID;
- a materially distinct cohort must change a bound semantic input and
  therefore receives a different cohort ID;
- production runs must be exactly one of a materially distinct cohort or a
  repeated performance trial;
- a synthetic known-answer is neither, is always `productionEligible: false`,
  and cannot enter production defect yield.

The five operating cohort classes are `stable-release`, `patch`, `relation`,
`core` and `audit`. Repeating the same source/target/policy/environment tuple
does not create another materially distinct cohort merely because its wall
time or trial ID changed.

## Run a production C0 cohort

Use a pristine, separate Git target and evidence/store locations outside both
the implementation and target roots. Pin the governance commit instead of
copying the example value:

```bash
npm run evidence:c0:run -- \
  --root /separate/pristine/PocketRisu \
  --store /separate/c0-evidence-store \
  --bundle /separate/exports/c0-bundle.json \
  --global-receipt /separate/exports/global-receipt.json \
  --governance-commit 40-lowercase-hex-characters \
  --governance-status-version 12 \
  --cohort-class patch \
  --trial-id patch-example-001 \
  --materially-distinct \
  --change-category catalog-loader
```

For a repeated resource trial, replace `--materially-distinct` with
`--repeated-performance-trial` and use a new trial ID. `--jobs N` is permitted
only as an explicitly recorded cohort input; it changes worker history and
must not be compared as if it were the same semantic cohort. Stable releases
must use both `--cohort-class stable-release` and `--stable-release`.

Focused and product gate lists are optional JSON arrays. Omitting one records
an explicit `not-run` entry rather than implying a pass. Each supplied entry
has exactly this shape:

```json
{
  "name": "focused-cache-regression",
  "result": "passed",
  "receiptObjectSha256": "64-lowercase-hex-digits-or-null",
  "detailsSha256": "64-lowercase-hex-digits-or-null"
}
```

Pass lists with `--focused-gates FILE.json` and `--product-gates FILE.json`.
Referenced objects must already exist in the same evidence store before a
retention plan can succeed.

The runner first captures a standard Global execution receipt, publishes it,
builds and independently validates the C0 bundle, then publishes the bundle.
The two requested JSON files are immutable operator exports and must not
already exist. The JSON result on stdout reports both object addresses and
their new physical bytes after deduplication.

## Resource boundary

The runner supervises a dedicated internal evidence wrapper with GNU
`/usr/bin/time`. The measured process group contains that complete wrapper,
the Global checker and all of its workers. The inner wrapper separately
records its own CPU usage; child-inclusive CPU is the measured process-group
total minus that wrapper observation. GNU time's group total remains the
authoritative child-inclusive CPU observation when its two-decimal sampling
resolution absorbs a small wrapper-tail difference.

Resource fields mean:

- `wallMs`: supervisor wall time from wrapper spawn through process-group
  close;
- `cpu.wrapperMs`, `cpu.childrenMs`, `cpu.totalMs`: wrapper, descendant and
  complete process-group CPU, with `total = wrapper + children`;
- `maximumRssKiB`: GNU time maximum RSS for the wrapper process group;
- `temporary.baselineBytes`: allocated bytes immediately after private
  capture files are created;
- `temporary.sampledPeakBytes`: maximum allocated bytes observed at the
  recorded 100 ms interval, including the final synchronous sample;
- `temporary.postRunResidueBytes`: allocated bytes after process-group close
  and before cleanup;
- `temporary.retained`: false after a passing run is cleaned; true when a
  failed run's private directory is retained for diagnosis;
- `evidenceStorage.receiptBytes`: canonical logical receipt bytes;
- `evidenceStorage.referencedObjectsNewPhysicalBytes`: newly allocated
  physical bytes for referenced objects after content-addressed deduplication.

The runner result separately reports the bundle object's physical allocation
and the total new physical bytes from the run. The bundle cannot include its
own post-publication allocation without a self-reference, so that publication
measurement remains in the run result rather than its hashed resource input.

## Independent verification

Verify exports directly:

```bash
npm run evidence:c0:verify -- \
  --bundle /separate/exports/c0-bundle.json \
  --global-receipt /separate/exports/global-receipt.json
```

Or load both objects independently from the content-addressed store:

```bash
npm run evidence:c0:verify -- \
  --store /separate/c0-evidence-store \
  --bundle-object 64-lowercase-bundle-object-hash
```

The verifier exits nonzero for corrupt content, a broken receipt, missing or
malformed output, spawn error, signal, nonzero status, incomplete coverage,
target drift, runtime drift, C0/Global mismatch or weakened canonical
protection. A structurally valid negative record remains evidence but is not
accepted operating evidence.

## Isolated known-answer dry run

`--synthetic-known-answer-result FILE.json` is an explicit diagnostic mode.
The result must itself satisfy the complete Global result contract, including
exact stride history. The runner executes it in a private script path named
`scripts/verify-all-combinations.cjs` so the standard receipt validator still
checks the exact command shape. The bundle is marked
`synthetic-known-answer`, `productionEligible: false` and
`materiallyDistinct: false`. It never counts as a production cohort or
production defect.

The independent verifier rejects it as production evidence unless the
operator explicitly adds `--allow-synthetic-known-answer`; that flag validates
the fixture only and does not alter its recorded ineligibility.

## Append-only ledgers and defect yield

Build a new immutable cohort-ledger snapshot by pairing every bundle with its
Global receipt in positional order:

```bash
npm run evidence:c0:ledgers -- \
  --store /separate/c0-evidence-store \
  --bundle /separate/exports/c0-bundle.json \
  --global-receipt /separate/exports/global-receipt.json \
  --cohort-ledger-out /separate/exports/cohort-ledger.json
```

Use `--base-cohort-ledger PRIOR.json` to append. The new snapshot preserves the
prior entry array byte-for-byte, records the prior ledger object's hash and
extends the per-entry hash chain. Duplicate bundle objects and run IDs are
rejected.

A stable-release input is a small mapping document:

```json
{
  "schema": "patch-c0-stable-release-input-v1",
  "releaseId": "stable-2026-01",
  "releaseTag": "v1.2.3",
  "productGateResult": "passed",
  "bundleObjectSha256": "64-lowercase-hex-digits"
}
```

Pass it with `--stable-release INPUT.json` and
`--stable-release-ledger-out OUTPUT.json`. The referenced loaded bundle must
be a stable-release cohort. `--base-stable-release-ledger` extends a prior
snapshot. Release IDs and tags are unique.

Incident records are created through the exported
`finalizeIncidentRecord()` API in `src/c0-ledgers.cjs`. It assigns the sequence,
binds the preceding incident object's exact hash, seals the record and forces
`productionDefectEligible: false` for synthetic mutations. The first record's
negative-evidence list must retain the failing bundle; a later fixed cohort
never replaces or deletes it. Supply the sealed chain in order with repeated
`--incident RECORD.json` arguments and `--defect-yield-out OUTPUT.json`.

Production defect yield includes only production-eligible implementation or
target defects. Synthetic mutations, environment diagnostics, harness
diagnostics and other nonproduction incidents are excluded. Global catches,
Global-unique catches, focused-gate catches, product-gate catches and unknown
earlier-gate outcomes remain separate counters.

## Dry-run, reference-aware retention

Generate a plan; this command has no delete operation:

```bash
npm run evidence:c0:gc-plan -- \
  --store /separate/c0-evidence-store \
  --root-object 64-lowercase-current-ledger-hash \
  --output /separate/exports/retention-plan.json
```

`--root-file LEDGER.json` extracts typed references from an exported root.
`--protect-object HASH` adds an explicit retention root. The planner validates
every object and every typed reference before classifying anything. Cohort and
stable-release ledgers, bundle gate references, incident predecessor/failure/
negative references and defect-summary references are followed transitively.

All incident records, stable-release ledgers and
`historical`/`incomplete`/`invalid`/`defect-reproduction` evidence are protected
automatically with their reference closure. An unreferenced object is only
`eligible-for-future-review`; the plan always records `deletedObjects: 0` and
`deletedBytes: 0`. The candidate hashes form a rollback manifest for a future,
separately approved retention action. This implementation never performs that
action.

## Pre-registered review trigger

The fixed v1 trigger thresholds are:

| Evidence | Minimum or maximum |
| --- | ---: |
| Passing stable releases | at least 3 |
| Materially distinct patch cohorts | at least 4 |
| Materially distinct relation cohorts | at least 3 |
| Materially distinct core cohorts | at least 2 |
| Materially distinct audit cohorts | at least 3 |
| Repeated trials for p95 consideration | at least 20 |
| Repeated trials for p99 consideration | at least 100 |
| Failed production cohort entries | at most 0 |
| Production-eligible harness-integrity incidents | at most 0 |
| Production defects missed by Global Exhaustive | at most 0 |
| Unresolved production defects | at most 0 |

Create a report from validated, store-backed ledgers:

```bash
npm run evidence:c0:review-status -- \
  --store /separate/c0-evidence-store \
  --cohort-ledger /separate/exports/cohort-ledger.json \
  --stable-release-ledger /separate/exports/stable-release-ledger.json \
  --output /separate/exports/review-trigger.json
```

Add incident records with repeated `--incident`. A fully satisfied report says
only `ready-for-read-only-phase-9-review`. Every report contains
`c1Authorized: false`. Neither recommendation changes governance, policy,
defaults, pack classifications or any Global Exhaustive boundary.

## Failure and incident handling

Do not retry, reschedule, clean or rewrite provenance before preserving the
first failure. The standard Global receipt retains stdout, stderr, first
reported failure details, requested command, worker history when available,
pre/post target integrity and runtime context. A failed run changes the default
`current-active` disposition to `defect-reproduction` and retains its private
temporary root. Preserve the bundle and receipt in the object store before any
reproduction.

Focused-gate, Global Exhaustive and product-gate outcomes must not be merged
into one boolean. An incident records whether the defect was caught, missed,
not run, not applicable or unknown at each layer. Unknown is never rewritten
as a catch and synthetic mutation results never enter production defect yield.

## Commit and rollback boundaries

The infrastructure is intentionally additive and separated into six rollback
units:

1. seven schemas;
2. independent validator and known-answer regressions;
3. non-default runner and resource capture;
4. ledgers, incidents, defect yield and review trigger;
5. content-addressed storage and dry-run retention;
6. this operating document and additive package scripts.

Rolling back the infrastructure means reverting those commits in reverse
order. It requires no evidence deletion, production state rollback, scheduler
change, policy change or default-command change. Existing evidence objects
remain historical records unless a separate, reviewed retention operation is
approved.
