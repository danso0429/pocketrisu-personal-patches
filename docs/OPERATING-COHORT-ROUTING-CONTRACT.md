# Operating cohort routing contract

## Historical provenance finding

The historical report
`toolchain-shadow-qualification-registration-and-cohort-preflight-v1` was
compared with the exact JSON emitted by `scripts/preflight-operating-cohort.cjs`
at tooling commit `f62708858c7f54a973e3cc9f433e926239eca9ea` and every repository
consumer of that script. The script directly serialized
`preflightOperatingCohort()`; there was no production wrapper that added route
fields.

| Historical field | Provenance | Machine authority at that commit |
| --- | --- | --- |
| `instruction: 6A` | `inferred-for-report` | no |
| `candidateAffected: true` | `inferred-for-report` | no |
| `candidateExecutionReason` | `inferred-for-report` | no |
| `localMasksExpected: 2` | `derived-by-task-orchestrator` | no |
| `boundaryClassesExpected: 4` | `derived-by-task-orchestrator` | no |
| `totalLocalCasesExpected: 8` | `derived-by-task-orchestrator` | no |

The actual machine fields were the store/registry descriptors, qualification
compatibility result, frozen subject, operating count protections, canonical
protections and read-only result. The historical route fields are therefore
classified `historical-operating-route-fields-nonauthoritative`. This reporting
error does not alter the separately registered accepted qualification.

## Route IDs and candidate impact

Operating evidence has exactly two routes:

- `material-c0-global` executes one canonical blocking Global Exhaustive and no
  local candidate domain.
- `material-c0-global-plus-toolchain-shadow` executes the qualified local
  2-mask by 4-boundary domain once and one canonical blocking Global Exhaustive
  for the same frozen cohort.

The canonical policy's certificate generation and verification operations
described by its own section identifiers retain their existing meanings and
are not aliases for either route.

`decideOperatingCohortRoute()` is the only route selector. Both the preflight
and material runner call it. Candidate impact is the explicit `candidateImpact`
object in `contracts/first-material-c0-toolchain-hardening-v1.json`; that
versioned, self-hashed declaration is part of C0 cohort identity. The decision
also binds the accepted qualification subject, policy, candidate contract,
compiled declaration, target commit/tree, compatibility hashes, exact build
environment and mechanically derived local domain.

An affected but incompatible candidate fails closed to `material-c0-global`
with `candidateExecutionSkipped: true`, no candidate operating sample, and an
exact skip reason. A compatible candidate requires a fresh independent
qualification verification in the current execution environment before the
combined route is safe to execute.

## Pre-execution identity and one-Global execution

`materialInputKey` classifies exact material inputs. `cohortId` adds the exact
verification contract and is frozen before any gate or execution.
`executionAttemptId` distinguishes an authorized attempt; completed or failed
observations receive a post-execution `evidenceBundleId`. Receipt results,
actual worker history, run IDs, resource observations and timestamps never
feed backward into `cohortId`.

The material runner owns one Global launch per execution attempt. Before spawn
it durably writes a `claimed-before-spawn` record. A second claim is rejected;
if a crash makes the first outcome unknown, the attempt fails closed and a
separately authorized retry must use a new attempt ID for the same cohort. The
combined route encodes the local reference into the same canonical Global
command. Global workers collect the supplemental candidate projection between
same-selection re-plan and revert; they do not change selection coverage,
worker scheduling, canonical status, restoration or failure handling.

The candidate linkage binds:

- material input key, cohort ID, execution attempt ID, frozen declaration
  hash, local run ID, Global run ID and evidence bundle ID;
- qualified subject and material tooling commits;
- policy SHA-256;
- target commit and application-tree SHA-256;
- worker schedule/history and runtime semantic hashes;
- material declaration and route decision hashes;
- local and Global immutable evidence objects.

Another cohort, another attempt, another Global run ID or any other exact
anchor mismatch is a failure. A local failure is preserved before the current
contract permits the single independent C0 Global run; neither material nor
candidate evidence is accepted. A Global failure fails the material cohort. A comparison mismatch is
preserved as a failed candidate linkage and does not change canonical
production routing.

Accepted cohort entries reference all four identity layers and exact local and
Global run IDs. Maturity distinctness uses `materialInputKey`. Candidate
operating samples require a passing v2 linkage to the same accepted,
materially-distinct entry, so a repeat/performance attempt cannot inflate
distinct-input counts.

## Managed execution policy

The accepted qualification registry state and a fresh verifier run are
reported independently. A managed command sandbox that rejects the verifier's
nested Node derivation with `EPERM` is classified as an
`execution-environment limitation`. The verifier contract is unchanged; the
qualification is not revoked. The combined material route remains blocked in
that environment and requires a fresh pass from the approved normal host path.
