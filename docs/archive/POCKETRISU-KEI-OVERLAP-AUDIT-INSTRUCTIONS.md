# PocketRisu Kei overlap-equivalence audit instructions

> **Status:** Fresh-session audit authority.
>
> **Instruction date:** 2026-08-02 KST.
>
> **Repository:** Private `pocketrisu-personal-patches`.
>
> **Purpose:** Re-audit Kei behavior omitted from the exact-PocketRisu-1.9
> candidate because official 1.9 or an existing patch owner was believed to
> provide the same outcome, a compatible superset, or the only safe authority.
>
> **Boundary:** This document authorizes a read-only audit and audit-document
> edits. It does not authorize implementation, manifest changes, publication,
> live application, user-data mutation, or a PocketRisu restart.

## 1. Why this audit exists

The existing catalog is a planning authority, not a per-capability parity
receipt. Its `V` evidence label proves that an implementation and relevant
callers or tests were inspected; it does not prove that every behavior inside
one catalog row was decomposed and experimentally compared with the final
resolved PocketRisu 1.9 candidate.

That distinction matters for decisions expressed as:

- official 1.9 already supplies the behavior;
- an existing local pack is already the canonical owner;
- the local owner is a compatible superset;
- a direct port would create a second schema, writer, generation authority,
  or recovery protocol;
- no concrete or measured missing outcome was found;
- upstream-equivalent behavior was removed from an admitted Kei child.

Those decisions can be structurally correct while still hiding a smaller
Kei-only outcome. The audit therefore tests the claims at capability level.
It does not assume that similar architecture means equivalent behavior, and
it does not assume that a broader local architecture preserves every smaller
effect.

The audit has two independent goals:

1. confirm that every omitted Kei capability is supplied by the official,
   local-patch, or composed final owner with the required effect; and
2. identify distinct Kei outcomes that were intentionally excluded, deferred,
   or missed, without immediately turning them into implementation work.

## 2. Frozen comparison universe

Begin with these exact revisions:

| Source | Revision | Role |
| --- | --- | --- |
| PocketRisu 1.8.1 | `63832a138c14cc7f11364cf7efdcb61950e7894c` | Common base used to isolate the frozen Kei delta |
| PocketRisu Kei | `cc1d1b195babd887577ebf943d5e82f01f58135c` | Frozen Kei behavior under audit |
| Official PocketRisu 1.9.0 | `85a65f3137b45c8de4a8d21a9887be213b1ac3fc` | Current upstream target |
| Local patcher | Resolve and record the fresh-session branch HEAD | Catalog, manifests, adapters, and receipts |
| Final candidate tree | Generate from the recorded patcher HEAD on exact 1.9.0 | Actual composed runtime target |

Do not silently substitute a later Kei commit, PocketRisu release, floating
branch, live installation, stale staging tree, or generated installer from a
different HEAD. A later revision is a separate audit scope.

Use this four-tree model:

```text
A = exact PocketRisu 1.8.1 common base
K = frozen PocketRisu Kei
U = exact official PocketRisu 1.9.0
C = final candidate resolved from U + the selected local pack graph

Kei behavior under audit = K - A
Upstream replacement evidence = U - A
Local/composed replacement evidence = C - U, evaluated in final C
```

The audit question is never merely “does C contain a similarly named symbol?”
It is “where does each user-visible or stateful capability atom from `K - A`
live in `U` or `C`, and does the final effect preserve its complete contract?”

## 3. Scope

### 3.1 In scope

Derive the final in-scope ledger from source and decision documents. Include
every capability atom omitted from the candidate for at least one of these
reasons:

1. **Native/upstream equivalence:** official 1.9 was said to implement it.
2. **Existing-patch equivalence or superset:** an existing pack was said to
   implement it, implement more, or own the required schema/state machine.
3. **Composed equivalence:** official 1.9 plus one or more local packs were
   said to provide the complete outcome only when combined.
4. **Duplicate-authority exclusion:** the Kei implementation was omitted to
   avoid a second writer, schema, transport, recovery protocol, or lifecycle
   owner.
5. **Upstream-equivalent subtraction inside an admitted child:** a Kei child
   was ported, but some of its behavior was removed or delegated to official
   1.9 because it was believed equivalent.
6. **“No missing outcome” reasoning:** a direct port was excluded because no
   independent result was found.

The initial cluster list is a discovery aid, not a hardcoded completeness
answer:

| Cluster | Starting audit question |
| --- | --- |
| K29 Revenant | Which request-job, stream, recovery, materialization, auxiliary, continuation/reroll, cancellation, retention, and multi-client outcomes are supplied by `bg-preserve`, native 1.9 jobs, or their request-class composition? |
| K26 and K30 backup/restore | Which snapshot, schedule, restore, missing-asset, confirmation, atomicity, migration, and failure-reporting outcomes are native, locally owned, distinct, or absent? |
| K23 regex/lorebook | Which schema, grouping, editing, import/export, generation, display, and translation outcomes survive the local `types[]` authority, and which Kei single-type or UI outcomes are intentionally incompatible or missing? |
| K04 prompt roles/preset behavior | Does native `role2` plus `preset-integrity` preserve every Kei role normalization, import/export, selection, picker, and runtime-prompt effect, or only the schema core? |
| K20 and K22 organizers | Which Kei search, recent, list/grid, picker, presentation, folder, order, normalization, and import/export outcomes are covered by the current organizer owners? |
| K27 and K28 native logging/usage overlap | For only the atoms said to exist in exact 1.9, compare capture triggers, fields, redaction, failure isolation, pagination, bounds, retention, toggle coupling, and accounting results. Keep the separately proposed privacy/retention policy redesign out of this audit. |
| Admitted-child subtractions | For K19, K14, K16, K11, K12, and any other admitted child, enumerate only the Kei atoms removed as upstream-equivalent or delegated to an existing owner. Do not re-audit the new retained child delta. |
| Structural exclusions | Inspect K01, K02, K10, K17, K18, and K31 only where their exclusion relied on an existing equivalent user outcome. Pure refactor, deletion, layout churn, or branding with no independent outcome stays out of scope. |

Expand this list if the decision-claim inventory finds another overlap-based
omission. Do not close the audit merely because the starting rows were covered.

### 3.2 Out of scope

Do not re-audit these as part of this dedicated overlap audit:

- the newly retained deltas already implemented and receipted for K19, K13,
  K14, K16, K15, K11, and K12;
- K03 as a distinct deferred preset-folder feature;
- K05-K09 provider/model-runtime work;
- K21 destructive retention;
- K24-K25 multi-device policy;
- the new privacy/retention policy design proposed for K27-K28, except for
  Kei atoms already omitted because exact 1.9 was said to supply them;
- a new comparison against a later Kei or PocketRisu revision;
- pure code movement, deleted legacy code, branding, or UI consolidation that
  has no independent trigger, state change, or user outcome;
- publication review, consolidated iPhone acceptance of the retained children,
  or general code-quality review unrelated to an overlap claim.

An out-of-scope item may be referenced when it is a caller, dependency, or
preservation boundary. That does not bring its full feature into scope.

## 4. Required fresh-session opening protocol

Before auditing any behavior:

1. Apply the session-injected workspace `AGENTS.md` instructions and read this
   file completely. This patcher worktree does not contain a separate
   `AGENTS.md`; do not infer or invent one inside it.
2. Read the PocketRisu-related current-state entries in the workspace-root
   `JOURNAL.md`, then read:
   - `docs/POCKETRISU-KEI-INTEGRATION-CATALOG.md`;
   - `docs/POCKETRISU-KEI-INTEGRATION-STATUS.md`;
   - `docs/POCKETRISU-1.9-SESSION-HANDOFF.md`;
   - `docs/POCKETRISU-1.9-REBASE-AUDIT.md`;
   - `docs/POCKETRISU-1.9-CATALOG-COMPLETION-DECISIONS.md`;
   - `docs/POCKETRISU-1.9-AGGREGATE-VALIDATION.md`.
3. Resolve the active checkout with `git worktree list`. Record the actual
   branch, HEAD, remotes, and status. Do not assume a historical path or HEAD.
4. Confirm that the preserved 1.8.1 K12 worktree remains staged and untouched.
   Do not reset, clean, unstage, amend, or rebase it.
5. Resolve or reconstruct all frozen source trees from exact revisions. Treat
   `/tmp` copies as disposable lookup aids, never as provenance.
6. Record source-tree dirty state and exact revision before reading results.
7. Do not modify runtime code, manifests, generated installers, the live tree,
   user data, or patch state during the audit.

If a frozen source cannot be read, mark the affected claim `UNVERIFIED`. Do
not replace source evidence with README wording, recollection, or a nearby
revision.

## 5. Build the decision-claim inventory first

Do not begin with a favored cluster or with implementation ideas. First create
an inventory of every overlap claim.

Search the catalog, rebase audit, completion decisions, aggregate receipt, and
individual child receipts for language such as:

- `native`, `already`, `equivalent`, `upstream-equivalent`;
- `preserve`, `retain`, `reuse`, `consume`;
- `merge`, `drop`, `exclude`, `defer`;
- `second owner`, `parallel schema`, `duplicate`;
- `no missing outcome`, `no concrete outcome`, `superset`.

For each claim, record:

| Field | Required content |
| --- | --- |
| Claim ID | Stable audit-local identifier, such as `K29-C03` |
| Catalog row / child | K number and feature name |
| Original decision text | Exact document and line or commit anchor |
| Omitted Kei surface | Source paths and symbols believed covered elsewhere |
| Claimed replacement owner | Official 1.9, named local pack, or composed graph |
| Decision kind | Native equivalence, local superset, composed coverage, duplicate-authority exclusion, or no-missing-outcome |
| Audit receipt | Per-cluster receipt that will resolve the claim |
| State | `pending`, `in_progress`, `resolved`, or `blocked` |

The number of claims is discovered evidence. Do not hardcode an expected count
before inventory completion.

## 6. Decompose each claim into capability atoms

A catalog row is too coarse to prove equivalence. Decompose the frozen Kei
delta into atoms small enough that each can receive exactly one disposition.

For each atom, record:

- trigger and preconditions;
- user-visible result;
- inputs, configuration, provider/environment branches, and defaults;
- state read and state written;
- schema and identity keys;
- asynchronous handoffs and ordering requirements;
- output, UI, notification, and other external side effects;
- cancellation, retry, timeout, reconnect, and fallback behavior;
- persistence, cold-start, server-restart, and recovery behavior;
- concurrency, multi-tab/PWA, deduplication, and idempotency behavior;
- error propagation and partial-result behavior;
- privacy, credential, logging, retention, and resource effects;
- callers, callees, dynamic dispatch, and tests.

An atom must describe an effect, not a file edit. “Adds
`generationRoutes.cjs`” is not an atom. “A provider request continues after the
browser socket closes and can be reattached without a second provider call” is
an atom.

Where one Kei atom has multiple modes, split it. For example, main versus
auxiliary generation, foreground reconnect versus cold recovery, continuation
versus reroll, and live stream versus terminal materialization must not share
one row if their owners or results differ.

## 7. Trace actual control and data flow

For every cluster, produce a concise text flow for Kei and the final candidate.
Include every authority boundary.

Example shape:

```text
trigger
  -> client preprocessing
  -> request owner
  -> server/provider execution
  -> persisted state
  -> recovery/consumer selection
  -> semantic postprocessing
  -> durable chat/root commit
  -> acknowledgement/cleanup
```

Trace dynamic dispatch and indirect callers. A symbol search is discovery, not
proof that a path is live or dead. Read the implementation, relevant callers,
dispatch selection, and tests. When output is large, verify counts and sample
first/middle/last regions or hashes rather than inferring omitted content from
a truncated view.

Audit the actual final generated candidate `C`, not only source manifests or
standalone pack payloads. Composition may replace a host file, select an
adapter, suppress a base unit, or change the effective owner.

## 8. Equivalence dispositions

Assign every capability atom exactly one primary disposition:

| Disposition | Meaning | Required proof |
| --- | --- | --- |
| `EQUIVALENT` | The final owner preserves the Kei trigger, result, state effects, and relevant failure behavior. | Direct source/caller mapping plus focused test or runtime evidence where observable |
| `SUPERSET_PRESERVED` | The final owner does more while preserving every Kei effect. | All Kei effects mapped; added behavior does not remove, narrow, or alter required modes |
| `COMPOSED_COVERAGE` | No single owner is equivalent, but the final request-class or pack composition covers the full atom without gaps or duplicate authority. | Final resolved control flow, owner-selection proof, and adversarial overlap test |
| `MISSING_OUTCOME` | A distinct Kei effect is absent from the final candidate. | Direct negative search plus caller/state comparison and a concrete reachable scenario |
| `INTENTIONAL_DIFFERENCE` | The effect is absent or different by an explicit accepted policy, safety, schema, or product decision. | Exact decision authority and documented user-visible consequence |
| `INCOMPATIBLE` | Importing the Kei effect as written would violate a current schema, owner, or preservation contract. | Concrete conflicting state/effect and affected callers; similarity alone is insufficient |
| `UNVERIFIED` | Available evidence cannot decide the atom. | Exact missing observation and the test, fixture, device, or source needed to resolve it |

`SUPERSET_PRESERVED` is not shorthand for “broader architecture.” It is valid
only when all Kei effects survive. A similar result with lost functionality is
not a superset.

Record evidence strength separately:

- `measured`: focused test, round trip, mock, log, or runtime observation;
- `source-proved`: complete code/caller/state path supports the claim but no
  runtime observation is available;
- `L3-required`: the remaining distinction is observable only on the actual
  mobile/UI/provider path;
- `blocked`: required source, fixture, authority, or environment is absent.

Do not convert `source-proved`, `L3-required`, or `blocked` into an observed
pass.

## 9. Adversarial comparison procedure

For each atom provisionally classified as equivalent, superset, or composed,
first write a scenario that would break that classification. Test the
differences, not only the happy path.

At minimum consider the applicable cases below:

- configuration override, custom endpoint, local model, Vertex/environment,
  plugin, and provider-specific branches;
- stream and non-stream responses, split frames, malformed frames, partial
  terminal responses, and tool/reasoning metadata;
- browser suspend, browser kill/cold boot, network loss, and server restart;
- stop/cancel before start, during auxiliary work, during main, during
  postprocessing, after an intermediate result, and during durable save;
- duplicate tabs or home-screen PWAs, stale consumers, reordered revisions,
  lost ACKs, and retry after uncertain start;
- continue, reroll, automatic resend, programmatic/blocking, plugin, multisend,
  and batch callers;
- lazy placeholder hydration, target deletion, target reordering, concurrent
  edit, CAS/ETag failure, and storage write failure;
- import/export, legacy schema, normalization, empty state, malformed state,
  and restore from older data;
- bounded retention, cleanup, orphan records, logging content, credentials,
  and resource caps;
- existing owner absent, existing owner present alone, and full aggregate
  composition.

Use existing upstream, Kei, and local tests when they measure the exact atom.
Add throwaway read-only harnesses or mocks when practical. Do not patch product
code merely to make an audit claim observable. If production instrumentation
or a live mutation would be required, write a prepared L3/runtime scenario and
leave the atom `UNVERIFIED` pending explicit authorization.

## 10. Cluster-specific minimum surfaces

These are minimum surfaces, not replacements for source-derived atoms.

### 10.1 K29 Revenant versus native jobs and `bg-preserve`

Separate and compare:

- creation and authentication of persistent main and auxiliary jobs;
- provider URL/header/body transport and supported providers;
- raw-byte journal, parsed-content checkpoints, live token display, WS
  disconnect, reattach, and replay;
- main, translation, Hypa, Lua, and other auxiliary operation contexts;
- whether an auxiliary completion advances the enclosing ax -> main -> post
  pipeline while the browser is suspended or killed;
- continue and reroll identity/snapshot behavior;
- foreground materialization and cold-recovery postprocessing;
- direct server chat write versus client merge, canonical-base comparison,
  conflict preservation, strict save, and ACK;
- per-job cancellation versus whole-operation cancellation and durable
  no-resurrection;
- first-consumer/multi-PWA selection, idempotency, ordering, lost ACK, and
  result replacement;
- server restart with an active upstream socket and partial persisted result;
- retention/pruning, request/usage logs, resource limits, and cleanup;
- request classes intentionally kept on native/client ownership in exact 1.9.

Do not ask whether `bg-preserve` is “better” globally. Resolve each atom to the
appropriate native, BG, or composed owner.

### 10.2 K26/K30 backup, restore, and missing assets

Separate database snapshots, full server backup, settings-only backup, manual
schedule, boot prompt, local/server-file restore, snapshot restore, migration,
selective missing-asset detection and recovery, retention, disk guards,
pre-restore backup, confirmations, atomic storage queueing, cache/ETag refresh,
failure visibility, and legacy formats. Do not treat “has backups” as feature
equivalence.

### 10.3 K23 regex/lorebook

Map the Kei schema and local `types[]` schema field by field. Test creation,
editing, grouping, enable/disable state, import, export to vanilla-compatible
forms, round trip, generation modes, display modes, and translation modes.
Classify UI organization separately from runtime schema expressiveness.

### 10.4 K04 presets and prompt roles

Map `role`, `role2`, aliases, normalization, defaulting, import/export,
creation, deletion, active selection, empty-list behavior, picker rendering,
and actual request prompt roles. A native enum or field name alone is not
equivalence.

### 10.5 K20/K22 organizer and presentation behavior

Separate canonical folder/order schema from search, recent items, list/grid,
picker presentation, navigation, normalization, import/export, deletion, and
multi-device visibility policy. Existing organizer authority can prohibit a
parallel schema without proving that every presentation outcome exists.

### 10.6 K27/K28 native request-log and usage overlap

Audit only the replacement claims assigned to exact 1.9. Map capture triggers,
stored fields, content and credential handling, row/field/byte bounds,
pagination, retention and cleanup, failure isolation, body-log toggle coupling,
token/cache/reasoning/service-tier accounting, gateway cost, and price lookup.
Separate a genuinely equivalent Kei result from an explicit safer or different
policy. Do not turn this comparison into design or admission of the future
policy packs.

### 10.7 Admitted-child upstream-equivalent subtractions

Read the frozen Kei child implementation, its 1.8 receipt, the 1.9 rebase
receipt, and final generated target. Inventory only the atoms removed,
delegated, or rewritten because 1.9 supplied them. At minimum revisit:

- K19 native viewer/wiring retired in favor of 1.9 AssetViewer;
- K14 native renderer behavior reused rather than copied;
- K16 native model shortcut, bounds, unload, and navigation ownership;
- K11 native preview, summary-item reroll, filtered search, and bulk behavior;
- K12 native original-text cache-key correction and request-log ownership;
- any K13 or K15 atom that their receipts call native, preserved, consumed,
  equivalent, or removed.

Do not rerun a general quality review of the retained new delta unless an
overlap finding reaches it through a real caller or state conflict.

## 11. Audit phases and gates

### Phase 0 - provenance and claim inventory

- Record all exact revisions, worktrees, dirty states, and generated-target
  provenance.
- Build the decision-claim inventory.
- Derive the cluster list and capability atom counts from source.
- Stop if a frozen source or final candidate cannot be reproduced.

### Phase 1 - source and authority mapping

- Read each Kei implementation, relevant caller, dispatch path, and test.
- Read official 1.9 and every claimed local owner.
- Inspect the resolved final target.
- Produce Kei and candidate flow descriptions and schema/state crosswalks.
- Assign only provisional dispositions.

### Phase 2 - focused equivalence checks

- Write adversarial break scenarios before running checks.
- Reuse exact upstream/Kei/local tests where applicable.
- Run focused mocks, tests, or round trips for observable differences.
- Record command, target, exit status, observed counts, and limitations.
- Do not predict results or rewrite a failed observation as expected behavior.

### Phase 3 - composed-owner audit

- Resolve the exact candidate graph on a separate pristine 1.9 target.
- Inspect selected/suppressed adapters and final host bytes.
- Verify one owner per state machine/request class where duplicate authority
  was the exclusion reason.
- Check owner-absent, owner-present, and aggregate graphs as applicable.
- Use the existing combination verifier only when executable catalog or
  managed-unit changes are later approved; the read-only audit itself does
  not require a new exhaustive run.

### Phase 4 - triage without implementation

For every non-covered atom, distinguish:

1. a missed outcome in the prior integration decision;
2. an already documented distinct future feature;
3. an explicit policy/safety exclusion;
4. an incompatibility requiring a new owner or schema decision; or
5. an observation gap requiring a concrete L3/runtime fixture.

Record impact, trigger, current result, Kei result, owner, affected paths,
preservation constraints, and the smallest follow-up decision. Do not edit
product code or silently change the catalog disposition.

### Phase 5 - audit closeout

The audit may close only when:

- every discovered overlap claim has a receipt;
- every Kei capability atom in those receipts is mapped exactly once;
- every `EQUIVALENT`, `SUPERSET_PRESERVED`, or `COMPOSED_COVERAGE` claim has
  direct evidence and an adversarial check;
- the final resolved candidate, not merely source manifests, was inspected;
- all `MISSING_OUTCOME`, `INTENTIONAL_DIFFERENCE`, `INCOMPATIBLE`, and
  `UNVERIFIED` atoms are visible in the master report;
- no L3-only behavior is reported as passed without observation;
- the user has reviewed any decision that would change scope, ownership,
  policy, or implementation.

Do not use “complete,” “no omissions,” or “superset” when any derived atom is
unmapped or unverified.

## 12. Required audit artifacts

Create these during the fresh audit session, not during preparation of this
instruction:

1. **Master report**
   `docs/POCKETRISU-KEI-OVERLAP-AUDIT.md`
2. **Per-cluster receipts**
   `docs/kei-overlap-audit/<cluster>.md`

Suggested receipt names include `K29-REVENANT.md`,
`K26-K30-BACKUP-RESTORE.md`, `K23-REGEX-LOREBOOK.md`,
`K04-PROMPT-ROLES.md`, `K20-K22-ORGANIZERS.md`,
`K27-K28-NATIVE-LOGGING-USAGE.md`, and `ADMITTED-CHILD-SUBTRACTIONS.md`.
Derive additional receipts from the claim inventory rather than forcing
unrelated claims into these files.

### 12.1 Master report structure

```markdown
# PocketRisu Kei overlap-equivalence audit

## Metadata and frozen revisions
## Scope and exclusions
## Decision-claim inventory
| Claim | Cluster | Prior decision | Receipt | State |

## Coverage summary
| Cluster | Claims | Atoms | Dispositions | Evidence limits | Result |

## Cross-cluster owner map
## Findings requiring user decision
## L3/runtime observations still required
## Catalog/status/receipt corrections proposed
## Final boundary and remaining limitations
```

The coverage summary records discovered counts after inventory. It must not
use an expected fixed count as the success condition.

### 12.2 Per-cluster receipt structure

```markdown
# <cluster> overlap-equivalence audit

## Metadata
- Frozen revisions
- Patcher HEAD and final candidate provenance
- Prior decision claims

## Kei capability inventory
| Atom | Trigger and result | State/effects | Kei source/callers/tests |

## Current authority and control flow
### Kei flow
### Official/local/composed flow
### Schema and state crosswalk

## Equivalence matrix
| Atom | Kei evidence | Official 1.9 evidence | Local/final evidence | Disposition | Strength | Remaining observation |

## Adversarial checks
| Scenario | Classification it could break | Method | Observed result | Limitation |

## Findings
| ID | Atom | Current behavior | Kei behavior | Impact/trigger | Owner | Proposed next decision |

## Conclusion
- mapped atoms / discovered atoms
- dispositions observed
- unresolved or L3-required atoms
- prior decision confirmed, narrowed, corrected, or left open
```

Each command-backed observation must include the actual command or a precise
reproduction pointer, target revision, exit status, and observed result. Large
outputs need counts and first/middle/last or hash cross-checks.

## 13. Finding handling and implementation boundary

Finding a missing atom does not automatically mean it should be ported.
Evaluate separately:

- user value and reachable trigger;
- whether it is already an explicit future/policy feature;
- privacy, credential, provider, storage, and destructive-action policy;
- canonical owner and composition graph;
- compatibility with custom endpoints, local models, plugins, Vertex, lazy
  storage, existing backups, and BG generation;
- regression and exact-revert surfaces;
- whether a smaller existing-owner addition preserves the same effect.

At the end of the audit, present proposed catalog corrections and follow-up
options to the user. Wait for approval before implementation. An approved fix
or new feature starts a separate implementation flow with its own purpose,
owner, commit, focused tests, resolved-owner graph, exact revert, L2.5, build,
and concrete L3 gate. Do not bundle audit documentation and unrelated runtime
fixes into one commit.

## 14. Required guardrails

- Apply `#2 feedback-optimization-same-effect-rewrites`: a simpler or broader
  implementation is equivalent only when it preserves every required effect.
- Apply `#8 feedback-no-guess-from-partial-output`: verify complete domains;
  cross-check large output with counts, samples, and hashes.
- Apply `#19 catalog-readthrough-hallucination`: source, callers, dispatch, and
  tests outrank catalog shorthand; state uncertainty and dead-path limits.
- Apply `#23 first-measure-yourself`: run available source, mock, round-trip,
  and timing checks before assigning a mobile observation to the user.
- Apply `#31 feedback-no-code-completeness-assertion`: report mapped scope and
  limitations instead of claiming total completeness.
- Apply `#38 feedback-fix-preserve-existing-function`: every equivalence or
  follow-up decision must preserve supported overrides, providers, plugins,
  storage modes, custom endpoints, and local-model paths.

Do not push, tag, release, apply to the live PocketRisu tree, restart the live
PocketRisu process, delete user data, clear caches, resolve old conflict chats,
or alter the preserved K12 index during this audit.
