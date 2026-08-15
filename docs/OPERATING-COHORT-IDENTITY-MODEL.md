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
| `materialInputKey` | pre-execution semantic input | Canonical material declaration and classification authority; same-input classification, C0 ledger maturity and candidate sample ledger |
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

No post-execution field is an input to the v2 `cohortId`.

## Identity invalidation matrix

| Independent change | `materialInputKey` | `cohortId` |
| --- | --- | --- |
| subject identity | changes | changes |
| canonical material declaration bytes | changes | changes |
| policy or governance material authority | changes | changes |
| target identity named by the material declaration | changes | changes |
| candidate impact, contract or compiled declaration in the material declaration | changes | changes |
| semantic environment in the material declaration | changes | changes |
| accepted qualification registry/final-manifest identity only | unchanged | changes |
| route contract schema/decision only | unchanged | changes |
| local domain or isolation contract only | unchanged | changes |
| canonical schedule/history execution contract only | unchanged | changes |
| verification tooling/verifier semantics only | unchanged | changes |
| local/Global receipts, run IDs, actual worker history, resources or timestamps | unchanged | unchanged |
| separately authorized retry | unchanged | unchanged; only `executionAttemptId` changes |

The current material declaration itself contains fixed environment and Global
contract fields. Changing those declaration bytes is a material-input change;
changing only the execution contract outside an unchanged declaration affects
`cohortId` alone.

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
