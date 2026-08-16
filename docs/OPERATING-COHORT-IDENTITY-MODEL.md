# Operating cohort pre-execution identity model

## Defect and historical disposition

The blocked material attempt exposed an
`operating-evidence-preexecution-cohort-identity-defect`: the v1 C0 bundle
derived `cohortId` only after Global output existed. Its identity included the
Global command hash and an authority hash derived from actual worker history;
the combined linkage then treated that post-execution bundle `runId` as the
Global run ID. The local receipt and Global command nevertheless needed a
cohort identity before either execution. This was a circular dependency.

The blocked attempt ran zero local cases and zero Global executions. It is
retained as `preexecution-infrastructure-blocked`, non-material,
non-candidate-sample and `no-Global-executed`. No historical cohort ID is
fabricated for it, and it is not a production defect or maturity denominator.

## Dependency audit

| Field | Identity class | Producer and consumers after remediation |
| --- | --- | --- |
| `materialInputKey` | pre-execution semantic input | Versioned material-semantic projection: classification, frozen subject implementation, policy/governance authority, target and candidate impact; same-input classification, C0 ledger maturity and candidate sample ledger |
| `verificationInputKey` | pre-execution verification-contract input | Exact full declaration hash, route, accepted qualification, candidate contract/declaration, verifier/tooling, schedule/history, environment, isolation and local domain; cohort identity and frozen declaration |
| `sameInputCohortFound` | pre-execution semantic classification | Accepted v2 ledger lookup by `materialInputKey`; frozen declaration |
| `materiallyDistinct` | pre-execution semantic classification | Same-input classifier; frozen declaration and ledgers |
| `cohortId` | pre-execution execution-contract input | Material key plus exact route, authority, qualification, verification, schedule/history, jobs, isolation, environment and local domain; every attempt receipt and linkage |
| `executionAttemptId` | pre-execution attempt identity | Unique nonce, creation time/provenance and cohort ID; frozen declaration, gates, launch claim, receipts, linkage and ledgers |
| local run ID | post-execution observation | Local receipt; evidence bundle, linkage and candidate sample ledger |
| Global run ID | post-execution observation | Exact Global receipt; evidence bundle, linkage and ledgers |
| actual worker history | post-execution observation | Canonical Global result; Global receipt, bundle authority diagnostics and evidence bundle ID only |
| candidate linkage | post-execution evidence identity | Exact local/Global attempt match; candidate sample ledger and retention |
| `evidenceBundleId` | post-execution evidence identity | Attempt, gates, receipts, observed history, linkage/differential, integrity, resources and disposition; ledgers and retention |
| resource evidence key | post-execution resource observation | `evidenceBundleId`; never material or cohort identity |
| material cohort ledger key | post-execution evidence identity | `materialInputKey` for distinctness, plus cohort/attempt/bundle/local/Global identities for exact evidence |
| candidate sample key | post-execution evidence identity | Passing linkage object and its exact accepted material entry; unique `materialInputKey` |
| retention roots | post-execution evidence identity | Frozen declaration, gate evidence, launch claim, bundle, receipts, linkage and ledgers |
| review-trigger counts | post-execution evidence identity | Accepted materially-distinct `materialInputKey` values, not attempts, run IDs or timestamps |

The removed backward flows were:

- actual Global worker assignment/history → worker-schedule authority hash →
  v1 `cohortId`;
- generated local receipt → encoded same-Global command → command authority
  hash → v1 `cohortId`;
- completed Global receipt and resource results → v1 bundle `runId` →
  candidate linkage's alleged Global run ID.

No post-execution field is an input to the operating `cohortId`. New declarations
use material-input identity v2 and cohort identity v3. Historical material-input v1
and cohort v2 objects remain immutable and are validated under their original pair.

## Identity invalidation matrix

| Independent change | `materialInputKey` | `cohortId` |
| --- | --- | --- |
| subject identity | changes | changes |
| material classification/subject/target/candidate-impact semantics | changes | changes |
| policy or governance material authority | changes | changes |
| target identity named by the material declaration | changes | changes |
| qualification type/schema/tool commit only | unchanged | changes |
| candidate verification contract or compiled declaration only | unchanged | changes |
| subject/qualification/evidence schema graph only | unchanged | changes |
| semantic environment verification contract only | unchanged | changes |
| verification-time provisioning/admission semantics only | unchanged | changes |
| random task-scoped provisioning path or its receipt timestamp | unchanged | unchanged |
| accepted qualification registry/final-manifest identity only | unchanged | changes |
| route contract schema/decision only | unchanged | changes |
| local domain or isolation contract only | unchanged | changes |
| canonical schedule/history execution contract only | unchanged | changes |
| verification tooling/verifier semantics only | unchanged | changes |
| local/Global receipts, run IDs, actual worker history, resources or timestamps | unchanged | unchanged |
| separately authorized retry | unchanged | unchanged; only `executionAttemptId` changes |

The full material declaration remains exact verification evidence and is bound by
`verificationInputKey`, even when its qualification, environment or Global-contract
fields change. Those fields do not change the material patch-development input by
themselves. A declaration change that alters its projected subject, policy,
governance, target, classification or candidate-impact semantics changes both keys.

The admitted operating toolchain is provisioned before a retry is frozen. Its
exact temporary root, resolved executables, hashes, PATH-resolution hashes and
observation timestamp are attempt evidence and never feed `materialInputKey`
or `cohortId`. The provisioning method and build-boundary admission code are
verification semantics, so changing that code changes the verifier/tooling
identity in `cohortId`. A retry after such a change retains the same material
key, receives the newly derived cohort ID, and always receives a new attempt
ID.

## Lifecycle and failure rules

The frozen declaration is content-addressed and referenced by an append-only
attempt record before focused gates. Gate evidence is sealed to the same
attempt and validated before local or Global spawn. The Global owner publishes
one append-only launch claim before spawn. Once claimed, unknown process state
forbids automatic relaunch; an authorized retry uses a new attempt ID.

A local failure is sealed before the current C0 contract permits the attempt's
single independent Global run. A Global failure, local failure or differential
failure produces a failed evidence bundle with the frozen cohort and attempt
identities but cannot create an accepted material or candidate entry. Only a
passing combined bundle and exact v2 linkage can enter both ledgers.
Operating incident v2 records retain the material, cohort, attempt, bundle,
local-run and Global-run layers separately; historical incident v1 records are
not reinterpreted.

Before focused/local/Global execution, the attempt also has an append-only
`patch-operating-build-environment-binding-v1`. It references the durable
`patch-operating-build-environment-provisioning-v1` receipt and the frozen
declaration. The receipt records the exact requested and observed Node/pnpm,
resolved executable identities, platform/architecture/libc, safe PATH
resolution hashes, per-field boundary comparison and cleanup contract. The
task-scoped executable remains available through the material process tree and
is cleaned only after that attempt no longer needs it; its content-addressed
receipt remains.

Qualification-registry verification and current-host admission are separate
gates. A valid accepted qualification proves the registered evidence chain;
it does not prove the ambient or provisioned executable currently selected for
a material process. `safeToExecute` therefore requires both a fresh
qualification verification and a passed operating build-boundary verification.
A failed early admission publishes
`patch-operating-build-boundary-failure-v1`, retaining expected/observed field
diffs while recording zero local cases, no Global claim and zero Global
executions.

Qualification run accounting is derived first from retained local/Global receipts,
then from a durable state written before each launch. A success-only stdout report is
supplemental and is never the sole source for launch counts. Missing evidence is
reported as `unknown`; exact zero is reported only when the pre-launch execution
state proves zero. Thus a comparison failure after eight local cases and one Global
execution cannot be summarized as zero merely because the success report was never
emitted.

The first material attempt from tooling commit `8f3f522068c76bd81bbf9466e278512666aaaee4`
predates this receipt. It remains immutable: local coverage was 0/8 and its
single Global execution passed 4,096/4,096, but the exact historical pnpm,
libc, PATH and resolved executable were not retained. Current ambient-host
observations are supporting forensics only and are not retrofitted into that
attempt. Its Global receipt is historical evidence bound to its failed attempt
and cannot satisfy same-Global linkage for a new attempt.
