# Qualification Evidence Durability

This additive subsystem preserves and validates qualification evidence. It does
not change patch planning, Global Exhaustive, C0 routing, production pack
classification, production state, certificates, release gates, or C1 policy.

## Store initialization

An accepted store has no implicit path and is never created by verification or
registration. Initialize it explicitly:

```sh
npm run qualification:store:init -- \
  --store /home/ubuntu/.local/share/pocketrisu-patcher/evidence \
  --subject-root /absolute/qualified-subject-worktree \
  --target-root /absolute/audited-target \
  --quarantine-root /home/ubuntu/.local/share/pocketrisu-patcher/evidence-quarantine
```

The root must be an absolute, non-symlinked, owner-only directory outside
`/tmp`, `/var/tmp`, implementation worktrees, targets, and quarantine. The
initializer requires the effective UID and mode `0700`, then writes a canonical
read-only `STORE-IDENTITY.json`. The initial durability class is
`server-local`: this means the bytes survive the current shell and Codex
session. It does not mean replicated or backed up.

The new namespace is independent of legacy C0 compact-JSON objects:

```text
STORE/v2/payloads/sha256/HH/REMAINING
STORE/v2/descriptors/sha256/HH/REMAINING.json
STORE/v2/registries/
STORE/v2/refs/
STORE/v2/tmp/
```

Existing `STORE/objects/sha256/*.json` objects are neither migrated nor
reinterpreted.

## Object model and publication

The store accepts canonical JSON and exact raw blobs. Canonical JSON rejects
duplicate keys, trailing tokens, BOMs, non-finite values, unsupported values,
and unknown schemas. Exact blobs retain every byte and bind a declared media
type, role, size, and SHA-256. Exact JSON child receipts bind both the raw-byte
hash and parsed canonical semantic hash; raw bytes remain authoritative.

Publication writes a unique `0600` temporary file, flushes and rereads it,
publishes without clobbering an existing path, fsyncs the directory, and repeats
the process for the descriptor. Final payloads and descriptors are read-only.
An existing path is idempotent only when exact bytes match. Object, descriptor,
and batch size limits fail before registry or current-ref mutation.

## Subject commit and tool commit

Qualification evidence binds two separate commits:

- `subjectImplementationCommit` is the already-qualified candidate source.
- `qualificationToolCommit` is the commit containing this evidence tooling.

The latter is not a substitute for the former. Merging tooling into the subject
branch does not make an earlier closure compatible with the merged subject.

## Machine closure authority

Build the machine support record and closure receipt from exact frozen inputs:

```sh
npm run qualification:closure:support -- [reviewed explicit arguments]
```

The support builder validates authority, source and target identities, route
and schema hashes, exact build environment, focused-test process results, raw
local and Global synthetic receipts, and pre/post integrity. The fixture
declaration and synthetic target are deterministically re-derived from the
frozen candidate declaration. Prefix hashes are rejected.

The canonical JSON `toolchain-shadow-pilot-closure-receipt-v1` is the machine
authority for the qualification result. A Markdown/YAML closure report and its
source event are optional supporting raw blobs. They cannot provide a missing
machine field. The Global child is explicitly a synthetic projection, not a
material canonical Global Exhaustive execution.

## Registration lifecycle

Registration is always explicit and occurs only after the store and machine
objects have been prepared:

```sh
npm run qualification:register:toolchain-shadow -- \
  --store /absolute/accepted/store \
  --support /absolute/support.json \
  --closure /absolute/closure.json \
  --local-receipt /absolute/local.json \
  --global-synthetic-receipt /absolute/global.json \
  --subject-root /absolute/frozen-subject-worktree \
  --reason "reviewed qualification registration"
```

Optional `--closure-narrative`, `--source-event`, and
`--environment-narrative` files are stored as exact blobs. Registration
publishes all children, a content manifest, an independent validation result,
and a final manifest before appending the dedicated qualification registry.
The registry is separate from Global execution receipts and operating ledgers.

Registry snapshots are immutable, content-addressed, append-only, and
hash-chained. A stable `registryId` binds the store identity, dedicated
registry namespace, registry schema, and qualification purpose. Each snapshot
has a zero-based `snapshotSequence`; `baseRegistryDescriptorSha256` is the
predecessor-snapshot field. Immutable snapshot-index records are published at:

```text
STORE/v2/registries/qualification/REGISTRY_ID/snapshots/DESCRIPTOR_SHA256.json
```

The mutable current ref binds the same store and registry identities, snapshot
schema, descriptor hash, sequence, and entry-root hash. Exact duplicate
subject/manifest acceptance is idempotent.
Conflicting acceptance requires an explicit `supersede` entry. Invalidated
evidence receives an append-only `revoke` entry. Historical snapshots and
objects remain available. Source, policy, contract, declaration, route, schema,
target, or environment changes make evidence stale at preflight; history is not
rewritten.

Accepted pilot-closure evidence is accepted only as a prerequisite for
material shadow-cohort collection. It counts as none of: material operating
cohort, stable release, production defect yield, or candidate operating sample.
It does not authorize production admission or C1.

## Independent verification

Run the verifier in its own process with an explicit store, expected subject,
and one exact content/final/registry descriptor:

```sh
npm run qualification:verify -- \
  --store /absolute/accepted/store \
  --registry SHA256 \
  --subject /absolute/expected-subject.json \
  --subject-root /absolute/frozen-subject-worktree \
  --require-current-ref
```

The verifier does not trust publisher success or publisher caches. It starts a
fresh derivation process, reads and hashes the frozen recipe, derives the
fixture again, and compares the full input, recipe, declaration, and target
hashes. It validates
store identity, raw and canonical bytes, descriptors, schemas, receipt
semantics, fixture derivation, manifest references, registry ancestry and
current ref, authority compatibility, count isolation, and production
protections. Missing, corrupt, truncated, unknown, stale, revoked, superseded,
or quarantine-only evidence fails closed.

Registry head verification enumerates every immutable snapshot-index record for
the store's qualification registry, validates the complete predecessor graph,
requires one genesis and one maximal head, and then requires the mutable current
ref to identify that head with the exact sequence. A later published descendant,
a fork, an orphan, an invalid trailing snapshot, or a rolled-back current ref is
not resolved by timestamp, directory order, or current-ref preference. The
registrar runs this same verification before append and after current-ref
publication; the verifier, preflight, and retention planner share it.

This detects rollback while a later immutable snapshot, descendant, fork, or
integrity trace remains in the accepted store. It does not detect an attacker
who deletes every later immutable snapshot and every independent checkpoint or
backup. This subsystem is not a transparency log and has no external monotonic
witness, signed checkpoint, or cross-host rollback resistance.

## Read-only operating preflight

The expectation document is the versioned material declaration with schema
`patch-operating-cohort-material-declaration-v1`. It binds candidate impact,
the exact subject, policy, contract, compiled candidate declaration, target,
environment, local/Global route compatibility hashes and one-Global contract.

```sh
npm run qualification:preflight -- \
  --store /absolute/accepted/store \
  --expectation /absolute/preflight-expectation.json \
  --subject-root /absolute/frozen-subject-worktree
```

The output itself contains `route`, `cohort`, `candidate`, `blockers` and the
complete sealed machine route decision. `toolchainPilotClosurePassed: true`
requires a durable accepted current registry entry, production-path independent
verification (including fresh fixture derivation), and exact compatibility. A caller-supplied verifier result is not
an accepted input to the production command. A quarantine manifest
alone produces `quarantine-only-evidence`. The command reads and hashes the
store before and after verification and does not mutate evidence, ledgers,
source, target, policy, classification, or state. It never authorizes C1.

Durable registry acceptance and a fresh verifier run are reported separately.
If managed execution policy denies nested child spawning with `EPERM`, fresh
verification is `environment-unavailable`; durable acceptance is not revoked,
but a combined material route is not safe to execute until the unchanged
verifier passes from an approved normal host path.

## Retention and backup

Retention is planning-only:

```sh
npm run qualification:gc:plan -- \
  --store /absolute/accepted/store \
  --quarantine-root /absolute/evidence-quarantine
```

The planner traverses current and historical qualification registry snapshots,
manifests, validations, descriptors, and payloads. Referenced accepted,
negative, revoked, and superseded history is retained. It reports unreachable
v2 objects in a hash-bound proposal but implements no deletion operation.
Quarantine and legacy C0 objects are never deletion candidates. Actual deletion
requires a separate reviewed implementation and approval.

Server-local storage still needs an independently operated backup. Backup must
preserve modes, `STORE-IDENTITY.json`, v2 payloads and descriptors, registry
snapshots, and refs. Restore into the same logical store requires full hash and
registry verification before preflight. Copying a quarantine into the accepted
root is not registration.

## V1 and v2 qualification coexistence

The registry snapshot chain accepts both the historical
`toolchain-hardening-shadow-pilot-closure` type and the independently generated
`patch-toolchain-shadow-real-global-qualification-v2` type. Subject lookup includes
the qualification type, so a historical v1 acceptance cannot satisfy v2 operating
admission. A v2 content manifest binds the provisioning receipt, eight-case local
receipt, one canonical 4,096-mask Global execution receipt, and the sealed real-Global
qualification record. A fresh independent verifier revalidates every object hash,
receipt, projection mapping, comparison and production-protection field before the
final manifest or registry entry is accepted.

Appending v2 creates a new registry snapshot and preserves the complete v1 ancestry.
It does not rewrite the v1 manifest, fixture derivation, receipts, or any failed
material evidence. Qualification objects remain outside all operating-count ledgers.

## Rollback

The implementation commits are independently revertible in reverse order.
Reverting tooling does not remove durable evidence. Do not delete a store or
registry as rollback. Preserve it, stop new registration, append a revocation
with the reviewed tool when appropriate, and retain all negative evidence.
