# PageFold quality/cost Phase 0 runtime audit

> **Status:** Phase 0 offline implementation audited; paid transport remains
> intentionally absent
>
> **Method:** `docs/runtime-audit-instructions.md` v2, discovery → external
> anchor → triage
>
> **Date:** 2026-08-26 KST
>
> **Implementation receipt:**
> `docs/POCKETRISU-PAGEFOLD-QUALITY-COST-PHASE0-IMPLEMENTATION.md`

## Phase 1 — flat discovery

The following list was produced before severity or frequency was assigned.

- canonical JSON traversal, sorting, hashing, depth, node count, and large
  string retention;
- opaque condition ID generation, HMAC secret handling, collision handling,
  and blind-map disclosure;
- randomized deterministic order, block identity, repeat identity, and
  complete-block membership;
- calibration/locked case identity and accidental source reuse;
- source-record identity, effective-message index sequence, and current-user
  mapping;
- UTF-8 byte citation boundaries, citation ambiguity, source drift, and
  dossier dependency references;
- objective, interpretive, disputed, and global-unverified denominator
  separation;
- synthetic fixture/twin coverage and fixture-manifest drift;
- direct/PDF condition enumeration and one-factor pair enumeration;
- production media-resolution authority discovery and mutation;
- system/current-user message partition loss, duplication, and ordering;
- JSON request diff traversal, allowlist breadth, array structural changes,
  and body hashing;
- price-source identity, decimal parsing, rounding, missing rates, usage
  categories, and total cost cap;
- annotation/generation/judge call-plan ordering and phase sequence;
- judge identity, prompt/calibration identity, target self-judgment, and
  order-reversal contract;
- uncertainty, practical-difference, repeat ceiling, and semantic-inspection
  stopping rules;
- private run-root path resolution, repository overlap, parent symlinks,
  permissions, and pre-existing directories;
- JSON artifact serialization, exclusive naming, atomic publication, fsync,
  and partial-write behavior;
- JSONL start/response/complete ordering, append/fsync failure, torn lines,
  resume, and ambiguous calls;
- raw response Base64 expansion, disk growth, streaming inspection, and
  response-integrity hashing;
- private-artifact retention, later deletion, and lack of at-rest encryption;
- primary SQLite snapshot mode, WAL consistency, logical blob size, decode
  memory, and handle release;
- newer chat-write journal precedence, malformed journal data, and stable
  message IDs;
- model-job, pending-send, BG operation, result, and draft quiescence;
- malformed/unknown durable operation states and new lifecycle states;
- quiescence races before, during, and after source capture;
- production bundle/orchestrator anchor count and target version drift;
- instrumented runtime-file creation, module resolution, and scratch growth;
- production assembly execution against a cloned database and mutation of
  caller-owned chat objects;
- global console, fetch, HTTP, HTTPS, TCP, TLS, and UDP replacement/restoration;
- pre-main trigger, Hypa, Lua, tokenizer, asset, and other indirect external
  calls before the PageFold hook;
- local-storage, request-log, font-cache, PDF-render, OAuth, and provider
  side-effect boundaries;
- prompt-bearing console/debug output and error-message disclosure;
- preset credential fields, credential values under removed keys, marker
  strings, and provider-response credential reflection;
- raw/effective/static-source duplication and source-artifact size;
- timeout timers, AbortSignal propagation, transports that ignore abort, and
  post-timeout provider cost;
- model-version changes, HTTP/parser failures, `MAX_TOKENS`, usage overflow,
  and cost-reservation overflow;
- arbitrary callback substitution in fake simulation;
- concurrency, shared globals, multiple capture calls in one process, and
  event-loop blocking;
- process termination between start, response durability, completion, and
  directory fsync;
- repository tests, installer generation, distributed artifact bytes, and
  production/live state;
- interaction between source capture, message partition, dossier authority,
  activation manifest, cost ledger, checkpoint state, and sanitized receipt.

## Phase 2 — external-anchor resolution

### 2.1 Source quiescence and immutable input

**Claim:** capture does not knowingly overlap active generation or consume a
moving source.

- Kind: structural plus empirical.
- Break scenario: an operation begins while the selected chat is captured, a
  newer journal payload is ignored, or an unknown durable state is treated as
  inactive.
- Chain: `quiescence.cjs:36-94` parses every known BG state, selected result,
  legacy result, draft, model job, and pending send. Malformed or unknown
  records now fail closed rather than counting as inactive. Both SQLite handles
  use read-only transactions and close in `finally`
  (`quiescence.cjs:96-117`).
- Chain: `source-capture.cjs:368-447` reads a pinned KV snapshot, checks the
  logical database size before materializing it, applies the exact selected
  journal record when present, rejects placeholders/stubs/empty chats, and
  requires unique native message IDs.
- Chain: capture performs preflight, then hashes the database and selected
  journal; after production assembly it repeats quiescence and hashes both
  heads again before publishing source evidence
  (`source-capture.cjs:589-678`).
- Failure path: a read, decode, schema, journal, postflight, or identity failure
  throws before `source-snapshot.json` publication. The run root is created only
  after the first read-only preflight and source load.
- Measurement: the current real storage schemas were read with dummy case IDs;
  native active `0`, background active `0`, selected pending payloads `0`, and
  `quiescent=true`. The primary database blob measured 17,941,677 logical bytes
  and selected chat-journal rows measured zero at that observation.
- Limit: the dummy observation proves reader compatibility, not future selected
  case quiescence.

### 2.2 Exact production-path capture and external effects

**Claim:** the captured effective messages come from the production assembly
path, while live state, provider, renderer, and credential exchange remain
untouched.

- Kind: structural plus measured target compatibility.
- Break scenario: a copied formatter diverges from production, the hook lands
  after rendering/OAuth, a swallowed auxiliary network failure yields a
  degraded prompt, or the cloned run mutates the original chat object.
- Chain: exact-one replacements instrument the current production BG bundle and
  orchestrator; missing or duplicated anchors fail
  (`source-capture.cjs:124-235`). The hook reads `arg.formated` and
  `pageFoldRouteState.sourceMessages` immediately after the production route
  state exists, then throws the local stop sentinel before token recount,
  rendering, preview preparation, OAuth, or provider work.
- Chain: the primary database is JSON-cloned inside the existing server preview
  path, and the selected current chat is separately cloned before injection
  (`source-capture.cjs:624-631`). This closes the observed mutation risk from
  production `sendChat` assigning IDs/parsing variables in place.
- Chain: a private in-memory DB stub replaces bundle-local DB calls. Console is
  a silent proxy before target modules compile. Global fetch and Node
  HTTP/HTTPS/TCP/TLS/UDP entry points are replaced before compilation and
  restored in nested `finally` paths (`source-capture.cjs:72-108`,
  `source-capture.cjs:609-640`).
- Chain: every blocked network attempt increments a counter. Capture fails even
  if user code catches the network error and later reaches the PageFold hook.
- Failure path: target-version drift, dependency resolution, source anchor,
  runtime-file, module compilation, hook, blocked-network, source parity, or
  postflight failure leaves only the newly allocated private run directory; no
  code deletes or rewrites user data.
- Measurement: exact-live request source, production BG bundle, and orchestrator
  produced one instrumented hook; the private bundle imported with
  `sendChat=function`. The content-free identities are retained in the Phase 0
  implementation receipt.
- Remaining limit: selected-case Lua/module code can still have a non-network
  external behavior not represented by the known browser-storage/network
  owners. This is surfaced below and must be checked on the selected case.

### 2.3 Secret and content disclosure

**Claim:** credentials do not enter retained source or response artifacts, and
semantic content does not enter progress/error output.

- Kind: structural.
- Break scenario: a service-account field survives under a nested key, a full
  credential string survives after its key is removed, a provider response
  reflects an access credential, or production debug logging prints the prompt.
- Chain: preset traversal removes credential/header/schema authorities, rejects
  private-key/token markers, collects values found below credential keys, and
  proves none survive in the sanitized object
  (`source-capture.cjs:238-355`). The final snapshot runs a second forbidden-key
  scan before hashing (`protocol-v1.cjs:133-147`,
  `source-capture.cjs:507-534`).
- Chain: target console access is suppressed before target compilation and
  restored after execution. The CLI prints only fixed error codes on failure
  (`offline-runner.cjs:66-132`).
- Chain: simulation responses are scanned against the supplied in-memory secret
  set before persistence (`runner.cjs:107-115`, `runner.cjs:237-254`). A future
  paid adapter is required to supply that set; no paid adapter exists now.
- Failure path: a secret/marker match stops before source or response
  publication. Source JSON publication and response JSONL append are not
  attempted after the guard fails.
- Adversarial recheck of “no credential path”: an arbitrary credential hidden
  below an innocuous custom-body key cannot be identified by its key name.
  Known credential values are covered; unknown semantic secrets remain a
  selected-preset surface rather than a proved zero.

### 2.4 Private filesystem lifecycle

**Claim:** raw artifacts remain outside Git with bounded permissions and
recoverable partial-state semantics.

- Kind: structural.
- Break scenario: a symlink redirects the run root into the repository, an
  existing user directory is silently chmodded, JSON appears partially under
  its final name, checkpoint writes advance after fsync failure, or a resume
  follows an ambiguous provider start.
- Chain: prospective physical paths resolve existing parent symlinks before
  repository-overlap comparison. A new run requires a nonexistent path; resume
  requires an existing mode-`0700` path. Existing directories are never chmodded
  (`artifact-store.cjs:36-90`).
- Chain: final JSON is serialized first, written/fsynced to a private temporary
  file, hard-linked under an exclusive final name, and directory-fsynced before
  and after temporary removal (`artifact-store.cjs:91-135`).
- Chain: JSONL start/response/completion appends fsync each record. Resume first
  rejects symlinks/wrong modes. Streaming line inspection rejects torn JSON,
  invalid hashes, missing responses, duplicate responses, cost-sequence drift,
  and non-prefix ambiguous states (`runner-artifacts.cjs:19-109`).
- Failure path: write/fsync/link failure throws. A start without completion
  remains ambiguous, including when the raw response was durable, and automatic
  retry remains zero.
- Measurement: mode, exclusive-write, nested scratch, parent-symlink,
  start-before-call, response-before-completion, torn/ambiguous resume, and
  response-hash tests passed in the focused suite.
- Remaining limit: artifacts use Unix permissions but not encryption at rest;
  retention/deletion is an explicit user decision.

### 2.5 Evidence authority and controlled fixtures

**Claim:** objective scores cannot silently absorb unverified interpretation or
source-drifted cards.

- Kind: structural.
- Break scenario: a citation splits a UTF-8 scalar, a verified card lacks user
  acceptance, a global interpretation enters the objective denominator, a
  dependency names a missing card, or calibration and locked cases share the
  same source hash.
- Chain: source snapshots require sequential effective indexes and bounded
  canonical traversal (`protocol-v1.cjs:82-100`, `protocol-v1.cjs:292-323`).
  Dossiers require exact citations, type, subject/object, polarity, source
  role/speaker, last mention, co-obligations, allowed/prohibited uses,
  evaluation mode, distance axes, and reviewer state
  (`protocol-v1.cjs:327-441`).
- Chain: only deterministic/deterministic and verified/user-accepted cards
  increment the objective denominator. Interpretive and global-unverified cards
  retain coverage counts but not objective eligibility.
- Chain: case manifests reject calibration/locked hash reuse
  (`protocol-v1.cjs:266-291`).
- Measurement: twelve fixtures, six two-member counterfactual groups, thirteen
  required coverage tags, and manifest SHA-256
  `bb6591c20b0dd3e332207586e77e0eae18c9e6e6070b9c43c197646155985d35`
  passed. UTF-8 split, source reuse, unreviewed dossier, and dependency/schema
  failures are exercised by focused tests.
- Remaining limit: synthetic cases are English and controlled; they do not
  establish private Korean/character/plot coverage.

### 2.6 Condition isolation and request identity

**Claim:** low remains the unmodified production control, resolution variants
change one authority, and role/current-user partitions neither lose nor
duplicate a source message.

- Kind: structural.
- Break scenario: custom body introduces a second media-resolution owner,
  medium/high changes generation settings, last user is guessed from the wrong
  message, or native/PDF partitions duplicate an interleaved system message.
- Chain: resolution discovery requires exactly one production-low authority in
  either the PDF part or generation config. Medium/high clone the body, mutate
  that one JSON pointer, and re-diff the complete body
  (`request-matrix.cjs:25-92`).
- Chain: every partition carries source indexes and an exact cover/no-duplicate
  assertion (`request-matrix.cjs:103-197`). Capture also proves formatted and
  effective messages remain 1:1 and maps the raw latest user by its native
  message ID before source publication.
- Chain: activation receipts retain base/variant hashes, actual diff paths, and
  allowlist patterns; every observed path must match a frozen pattern
  (`activation.cjs:140-173`).
- Measurement: thirteen conditions, twenty-four one-factor PDF pairs, both
  Gemini resolution placements, unrelated generation drift rejection, and all
  source partitions passed.
- Remaining limit: partition success does not define the final native-current-
  user Gemini wire. That body shape remains an activation-blocking design item.

### 2.7 Call schedule, cost, and provider inactivity

**Claim:** Phase 0 freezes a complete bounded plan but cannot issue a provider
call.

- Kind: structural.
- Break scenario: a phase is skipped, a generation lacks a reservation, an
  annotation/judge call is outside order, a zero-token call bypasses cost, an
  arbitrary callback is labelled fake, or an activation-shaped object opens
  paid execution.
- Chain: phases must form a contiguous prefix from Phase A; every requested
  phase has a complete schedule. The full call plan contains every positive-
  token annotation/generation/judge reservation exactly once and preallocates
  no retry (`activation.cjs:26-38`, `activation.cjs:175-296`).
- Chain: price rates parse to integer picodollars, every nonzero category needs
  a price, per-category cost rounds upward at the declared unit, and the full
  ledger must fit USD 10.00 (`protocol-v1.cjs:507-599`).
- Chain: the runner accepts only a branded static fake-response/abort queue.
  Arbitrary callbacks fail validation. Every non-simulated invocation fails
  with `RUNNER_PAID_EXECUTION_NOT_IMPLEMENTED` before its callback can run
  (`runner.cjs:18-55`, `runner.cjs:164-169`).
- Chain: simulation still proves call-start before execution, complete-block
  reservation, actual-usage <= reservation, response byte/secret guards,
  response durability before completion, model-version split, timeout, and no
  semantic-dependent repetition (`runner.cjs:211-283`).
- Failure path: missing/insufficient cost, runtime, call-plan, judge, privacy,
  stopping, diff, or target identity stops manifest construction. The manifest
  remains `providerCallsAuthorized=false` with no activated phases.
- Measurement: hidden retry, empty/missing price, incomplete call plan,
  noncontiguous phase, target self-judge, arbitrary fake callback, timeout,
  oversized response, model split, and cap tests passed.
- Adversarial recheck of “provider calls zero”: there is no provider transport
  in the CLI, and the library rejects non-simulation. A caller can edit source
  code, but no runtime guard can protect against replacing the program itself;
  that is outside this artifact's claim.

### 2.8 Resource, handle, and environment behavior

**Claim:** Phase 0 has explicit ceilings and closes its owned handles; actual
selected-case resource behavior remains measurement-dependent.

- Kind: structural plus empirical surface.
- Chain: canonical traversal is limited to depth 256/two million nodes;
  database and chat-journal logical values are capped at 256 MiB; the source
  artifact at 128 MiB; activation at 10,000 calls, 64 MiB raw response per call,
  and 1 GiB total. JSONL inspection streams 64 KiB chunks rather than loading the
  whole response ledger.
- Chain: KV and model-job read transactions close in `finally`; temporary JSON
  descriptors close on every write path; checkpoint descriptors close through
  the sink; call timers clear in `finally`; capture globals restore in nested
  `finally` paths.
- Break scenario: a future transport ignores abort. The runner times out and
  leaves a durable ambiguous start, but cannot prove the external request stopped
  spending. Therefore activation requires `transportMustHonorAbort=true` and a
  future transport-specific test; current code makes no paid-call claim.
- Measurement: current database logical source was below the capture ceiling;
  focused timeout/abort, file-handle, large-line streaming, and mode tests passed.
- Remaining limit: full real-case decode/render/request memory and latency have
  not been measured because no case has been selected or captured.

### 2.9 Product and distributed patch preservation

**Claim:** Phase 0 does not alter the stable product graph.

- Kind: structural plus measured artifacts.
- Chain: changed paths are limited to research code, tests, and two PageFold
  documents. No patch manifest, catalog, composer, stable source payload,
  version, UI, or generated installer input changed.
- Measurement: repository tests passed 48/48 files. The current build produced
  `pocketrisu-patcher.cjs` and `pocketrisu-all.cjs` as byte-identical 7,847,429-
  byte files with stable `0.2.1` SHA-256
  `a406e48ad8ffded50a7a6bc4a18cbb4204c1bae23f305ebb0e625c93b2426a9c`.
- Adversarial recheck: research files are not referenced from catalog/build
  inputs; a text search and unchanged generated bytes independently anchor the
  N/A claim for live route/UI behavior.

## Phase 3 — triage

### Fixed during this audit

| Item | Severity / frequency | Triage | Resolution |
| --- | --- | --- | --- |
| pre-existing private directory could be chmodded | medium / configuration-dependent | Q3 fixed | new capture root must not exist; resume never changes mode |
| production assembly could mutate the retained raw chat object | high / every capture | Q3 fixed | inject a separate deep clone |
| malformed or future BG state could be treated as inactive | high / schema-drift-dependent | Q3 fixed | known-state enumeration and fail-closed parsing |
| swallowed auxiliary network failure could yield a degraded prompt | high / selected-case-dependent | Q3 fixed | count every denied attempt and reject capture even if caught |
| network denial covered only fetch | high / indirect-call-dependent | Q3 fixed | deny HTTP/HTTPS/TCP/TLS/UDP before target compilation |
| credential field removal did not prove removed values absent | high / preset-dependent | Q3 fixed | collect credential-key descendants and scan sanitized result |
| source/cost/response structures lacked several hard ceilings | medium / extreme-input-dependent | Q3 fixed | database, journal, artifact, traversal, call, response, timeout caps |
| final JSON could be visible under its final name before complete write | medium / crash or disk failure | Q3 fixed | fsynced temporary + exclusive hard-link publication |
| parent symlink could redirect a lexical outside path | high / hostile-local-path-dependent | Q3 fixed | prospective realpath overlap check |
| dossier omitted required obligation/distance/reviewer fields | high / every real evaluation | Q3 fixed | schema now enforces the complete recorded contract |
| phase/call plan could omit or reorder metered roles | high / manifest-dependent | Q3 fixed | contiguous phases and exact full call-plan coverage |
| fake label accepted an arbitrary callback | high / library-caller-dependent | Q3 fixed | branded static fake queue only |
| paid callback could run before a full call-plan orchestrator existed | critical / any attempted activation | Q3 fixed | all non-simulated runner execution disabled |
| target decoder import created cwd-relative `save/logs.db` | medium / every resolver process | Q3 fixed | exact `logs.cjs` import is replaced with a no-op logger and the loader is restored immediately |
| empty chats could be frozen as real evaluation cases | high / selection-dependent | Q3 fixed | exact selection now rejects a hydrated zero-message chat before capture config creation |

### Remaining surfaces

#### S1 — private case selection and capture

1. Item: calibration and untouched locked real cases are not selected.
2. Resolved: source/quiescence/capture/dossier machinery and exact target anchors
   are verified offline.
3. Blocked link: no user-selected character/chat coordinates exist, so no
   source snapshot or real dossier can be produced.
4. Limitation: only the user knows which conversations represent actual value
   and which may be opened for calibration.
5. Review signal: choose distinct calibration and locked chats; reuse of the
   same source hash will fail. Until then real quality evidence remains zero.

#### S2 — selected-case scripts and bounded authority coverage

1. Item: custom modules/Lua/triggers may affect production assembly.
2. Resolved: capture runs the production bundle on cloned state, blocks and
   counts all known network/socket access, and retains exact effective messages.
3. Blocked link: a selected case has not been inspected for non-network custom
   side effects or source authorities omitted from the explicit raw-source list.
4. Limitation: this depends on the selected user's case and dynamic scripts.
5. Review signal: capture must reach the hook with zero denied attempts; the
   dossier reviewer compares effective messages and cited raw/static sources.
   Any unexplained authority becomes an explicit coverage gap, not an objective
   pass.

#### S3 — native-current-user research wire

1. Item: the exact Gemini body for “PDF plus native current user” is not chosen.
2. Resolved: source partition and 1:1 current-user identity mapping are proved.
3. Blocked link: whether the current request is a later content turn, a PDF-adjacent
   text part, or another exact supported shape is a user-visible experimental
   design decision with different role semantics.
4. Limitation: code structure alone cannot choose which causal intervention the
   user intends to value.
5. Review signal: freeze one exact body and its allowlisted diff before any
   provider call; if more than the declared placement surface changes, reject it.

#### S4 — current model, price, and usage authority

1. Item: route availability, official prices, media accounting, and maximum
   reservations are not current-frozen.
2. Resolved: exact arithmetic and missing-price/cap rejection are implemented.
3. Blocked link: current official provider facts and the selected cases' prepared
   token/page/output maxima have not been measured.
4. Limitation: these are time-varying external facts and private-case sizes.
5. Review signal: revalidate official sources immediately before activation;
   if the complete call plan cannot reserve below USD 10.00, do not issue the
   first call—change scope or cap before outputs open.

#### S5 — independent judge and uncertainty/value rules

1. Item: judge identity/prompt/calibration and task-specific practical/uncertainty
   rules are unset.
2. Resolved: target self-judge cannot be sole judge; full-source, calibration,
   order-reversal, prompt-hash, maximum-block, and no-mid-block-inspection fields
   are mandatory.
3. Blocked link: the actual independent model/privacy route and user value
   thresholds are choices not derivable from code.
4. Limitation: judge qualification and acceptable quality loss are user/value
   judgments plus time-varying provider capability.
5. Review signal: freeze them in the activation manifest. Without them, the
   manifest remains offline-only and no aggregate/default may be produced.

#### S6 — private retention and encryption boundary

1. Item: private artifacts have permissions but no at-rest encryption or agreed
   deletion date/event.
2. Resolved: Git overlap/symlinks are blocked, directories/files are `0700`/
   `0600`, raw material is absent from sanitized receipts, and deletion is never
   automatic.
3. Blocked link: the user has not selected persistent location, retention event,
   or whether host-level permissions are sufficient.
4. Limitation: this is a privacy/usability trade and deletion is destructive.
5. Review signal: choose the private root and retention boundary before capture;
   later deletion occurs only on an exact explicit request.

#### S7 — actual provider transport and abort proof

1. Item: no paid transport/call-plan orchestrator exists.
2. Resolved: the offline manifest freezes the required order and the simulation
   runner proves durability/cost/operational state using static fake responses.
3. Blocked link: provider-specific request construction, usage mapping, full
   call-plan cursor, credential source, and abort behavior are unimplemented.
4. Limitation: implementing them before S1–S6 would create a callable paid path
   without its required authorities.
5. Review signal: only after a reviewed offline activation manifest exists,
   implement and audit the provider adapter; demonstrate that timeout aborts the
   underlying request and that resume derives cost/order from durable state.

All remaining items are Q4 activation/user-decision or future-implementation
surfaces. No selected real case, provider result, quality ordering, or Pareto
frontier exists yet.

## Cross-piece interaction check

- Source capture → message partition: capture now proves formatted/effective
  1:1 parity and maps the raw latest user before any condition is built.
- Quiescence → source publication: pre/post active-state checks plus database/
  journal hashes precede the atomic source JSON link.
- Secret sanitization → private persistence: both source and simulated response
  paths reject known credential values before their first durable content write.
- Activation → runner: the manifest freezes all calls, but non-simulated runner
  execution remains disabled until a full call-plan/provider owner is added.
- Checkpoint → resume: start, response, and completion order reconstructs
  ambiguous calls without retry; cost sequence and response hashes are
  revalidated from disk.
- Condition matrix → cost cap: every scheduled generation call must appear once
  in both the full call plan and positive-token cost ledger.
- Research → product: research modules have no catalog/build import, and current
  generated installer bytes remained unchanged.
