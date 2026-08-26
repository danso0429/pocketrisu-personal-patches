# PageFold context-quality and cost evaluation plan

> **Status:** deferred research plan; no provider calls, implementation changes,
> route admission, catalog publication, or live work are authorized by this file
>
> **Date:** 2026-08-26 KST
>
> **Integration authority:** `docs/POCKETRISU-PAGEFOLD-INTEGRATION-PLAN.md`
>
> **Structural-recognition evidence:**
> `docs/POCKETRISU-PAGEFOLD-STRUCTURAL-REQUALIFICATION.md`
>
> **Separate byte-copy follow-up:**
> `docs/POCKETRISU-PAGEFOLD-VERBATIM-COPY-FOLLOWUP.md`
>
> **Recorded but not activated execution constraints:** target generation uses
> Vertex AI global, requested model `gemini-3.7-flash`, and explicit low
> thinking; all metered provider-research roles share a total undiscounted rated
> cap of `USD 10.00`. These constraints do not authorize a provider call.

## 1. Purpose and boundary

This plan evaluates whether PageFold can preserve enough conversational quality
to justify its input-cost reduction. It does not assume that a particular font
size, column count, hot-context length, page density, repeat count, or media
resolution is correct and then test only that preset. It separates causal
surfaces, measures response curves, and retains unresolved trade-offs rather
than forcing a single quality score.

The plan is independent of the current PocketRisu PageFold integration and
route-admission sequence. Existing structural qualification proves transport
and model recognition under its own contract. It does not prove character
interpretation, plot development, long-distance memory use, or a
quality-versus-cost optimum. Conversely, a narrative-quality result does not
replace structural recognition or verbatim-copy qualification.

In this document, **long-distance conversational memory** means model behavior
as relevant source material becomes more remote in the supplied conversation.
It is not the PocketRisu `memory` auxiliary task, HypaMemory, a persisted memory
store, or a fixed number of previous turns.

Real-conversation evaluation is bounded evidence, not an automatic complete
reconstruction of every character, motive, relationship, event, and plot hook.
Synthetic fixtures may have exhaustive ground truth because they are authored
for that purpose. A private real conversation supports an objective claim only
for deterministic facts or source-anchored obligations that have been verified
before outputs are opened. Unverified global interpretation remains visible as
a coverage limitation or a subjective comparison axis; it is never silently
counted as correct.

No test in this plan begins merely because the document exists. Activation,
paid-call scope, provider credentials, retained evidence, implementation, and
any effect on integration authority require a separate explicit decision.

## 2. Method principles

1. A sampled parameter value is an observation point, not an assumed answer.
2. Provider-supported categorical choices are compared as choices; continuous
   layout and context-boundary parameters are measured as response curves.
3. Direct-text run-to-run variation is measured before a PageFold difference is
   called meaningful.
4. Input integrity, retrieval, attribution, causal use, spontaneous narrative
   use, contradiction, character quality, plot quality, cost, and latency remain
   separate axes.
5. A weighted aggregate is prohibited until the user explicitly supplies the
   value trade-offs represented by its weights.
6. Test obligations and scoring rules are recorded before condition outputs are
   inspected.
7. Calibration cases and locked evaluation cases remain separate.
8. A single exact-count, echo, or needle test cannot stand in for conversational
   quality.
9. Model/provider/version results are not generalized to another route without
   new evidence.
10. Result language distinguishes observed source facts, final request shape,
    state lifecycle, safety, runtime evidence, user value, and admission.
11. A model may propose evidence, but it does not create ground truth merely by
    summarizing a private chat. Every objective real-case obligation has exact
    source anchors and an explicit authority class.
12. One frozen source and obligation dossier is compiled once per case and
    reused across every condition and repeat. Source drift invalidates reuse.
13. A deterministic runner, not the user or an output-reading LLM, owns the
    frozen call schedule. The runner never appends experimental output to the
    selected PocketRisu chat.
14. Locked semantic outputs are not inspected while a comparison block is in
    progress. Only request identity, HTTP, model version, usage, cost, parser,
    finish, privacy, and checkpoint invariants are examined immediately.
15. The target model cannot be the sole authority for both obligation
    compilation and final subjective judgment. Judge identity, calibration,
    order stability, and disagreement remain part of the evidence.
16. Annotation, target generation, judge, and retry calls are separately
    identified in one cost ledger. No hidden heuristic cost or fixed phase
    percentage substitutes for actual usage and a frozen price basis.
17. The final deliverable exposes per-setting strengths, losses, uncertainty,
    evidence coverage, cost, and runtime. It does not collapse the frontier to
    one recommendation or silently choose a product default.

## 3. Falsifiable hypotheses

### H1 — PDF representation or reading order damages source integrity

The model receives missing, reordered, or structurally ambiguous content at
line, role, column, PDF, or page boundaries.

Expected observations if supported:

- failures cluster at those boundaries;
- independent extraction and model-reported order diverge at identifiable
  locations;
- a layout/structure change improves the affected probes while model,
  generation parameters, prompt placement, and media resolution stay fixed.

Evidence against H1:

- canonical extraction, role attribution, and boundary order remain exact;
- targeted model probes show no boundary-correlated degradation; and
- layout/structure variants stay within direct-text baseline variability.

### H2 — Flattened role hierarchy or lost recency reduces behavior quality

System instructions, the last user request, or recent alternating turns lose
authority or salience when they exist only inside the PDF.

Expected observations if supported:

- native system placement improves instruction/character adherence without a
  PDF layout or resolution change;
- placing the current user request natively after the PDF improves task intent
  and plot continuation; or
- moving complete recent turns back to native `user`/`model` messages restores
  behavior while the older PDF remains unchanged.

Evidence against H2:

- equivalent role-placement variants show no effect beyond baseline variation;
- improvements follow layout or resolution instead of role placement; and
- system conflicts and last-turn obligations are handled equally in every
  packaging condition.

### H3 — Media resolution has a density-dependent quality effect

`low` may supply insufficient visual detail only after the PDF crosses some
content/layout density, while `medium` or `high` may supply enough additional
information to change model behavior.

Expected observations if supported:

- one or more `low`/`medium`/`high` gaps increase along a measured density
  curve;
- the gap concentrates in visual-order, boundary, or small-detail probes; and
- the effect appears with byte-identical PDFs and request bodies that differ
  only in media resolution.

Evidence against H3:

- `low`, `medium`, and `high` remain equivalent across the tested feasible
  density interval;
- any difference is explained by request drift, output truncation, or route
  variation; or
- resolution changes visual probes but not the conversational-quality axes for
  which an improvement is claimed.

### H4 — Content is available but long-context utilization degrades

The model can retrieve an isolated remote fact but cannot reliably combine
multiple remote facts, use them without a direct cue, or preserve their causal
effect in the next narrative turn.

Expected observations if supported:

- direct retrieval remains stronger than multi-item integration;
- spontaneous use and contradiction prevention decay with source distance;
- PDF conditions add degradation beyond the direct-text distance curve; or
- performance depends on semantic scene distance even when raw token distance
  is similar.

Evidence against H4:

- retrieval, attribution, causal integration, and spontaneous use share the
  direct-text curve; and
- PageFold introduces no additional distance-dependent effect.

### H5 — Request mismatch or stochastic variation explains the perceived gap

The compared paths differ in provider routing, resolved model version,
generation parameters, thinking configuration, output limits, safety settings,
or ordinary output variance rather than PDF context quality.

Expected observations if supported:

- locking and recording the final request surfaces materially shrinks the gap;
- condition-blind paired judgments do not separate outputs beyond direct-text
  self-variation; or
- the effect follows a provider/model version or generation setting rather than
  a PageFold factor.

Evidence against H5:

- a stable PageFold effect remains after request parity, interleaved execution,
  condition blinding, and uncertainty-aware repetition.

## 4. Long-distance memory contract

### 4.1 Memory-obligation record

Each test case identifies its memory obligations before outputs are generated.
An obligation records:

- immutable source-snapshot identity, exact message IDs, and bounded source
  spans;
- source role and speaker/entity;
- explicit fact, inferred relationship, commitment, prohibition, causal event,
  resolved hook, unresolved hook, or voice/behavior class;
- last source mention;
- the other obligations required for a multi-item inference;
- acceptable uses, prohibited contradictions, and unsupported additions;
- whether the evaluation is direct retrieval, cued use, or spontaneous use;
- authority class and verification state; and
- the reviewer decision for any interpretation that is not mechanically
  derivable from the source.

The expected output is not one hard-coded sentence. Multiple narrative
continuations may pass if they satisfy the pre-recorded obligations.

An obligation proposed by an LLM but not verified from its cited source is
`global-unverified`. It may guide later human review, but it is excluded from
objective success, failure, and contradiction denominators while remaining a
separate coverage gap. A resolved or unresolved plot-hook label is objective
only when the source says so unambiguously or the user verifies that
interpretation.

### 4.2 Distance remains continuous

No fixed `N` turns defines long-term memory. Each obligation records:

- source-token distance from the final request;
- message/turn distance;
- distance since last mention;
- count of completed scene or topic transitions; and
- number of remote obligations needed for the answer or continuation.

Results are plotted as retention/use curves over these distances. If a later
product decision needs a hot-context boundary, that boundary is selected from
an observed cost-quality curve aligned to complete message/scene boundaries,
not assumed in advance.

### 4.3 Separate capabilities

The evaluation reports these independently:

1. **Transport presence** — the obligation exists in canonical/PDF extraction.
2. **Direct retrieval** — an explicit question recovers the obligation.
3. **Attribution** — speaker, entity, polarity, and time are correct.
4. **Causal integration** — multiple obligations yield a compatible conclusion.
5. **Spontaneous use** — a natural continuation uses a relevant obligation
   without a retrieval cue.
6. **Contradiction prevention** — the response does not reverse an established
   fact, promise, relationship, or completed event.
7. **Narrative use** — prior motives and unresolved hooks influence the next
   action without merely repeating the history.

## 5. Test-case design

### 5.1 Controlled fixtures

Controlled cases provide known ground truth for:

- first/middle/last source positions;
- line, role, column, PDF, and page boundaries;
- exact speaker and temporal order;
- negation, name swaps, and relationship direction;
- one-obligation retrieval and multi-obligation causal inference;
- resolved versus unresolved hooks; and
- system/current-user conflicts that test instruction hierarchy.

Counterfactual twins swap harmless names, order, polarity, ownership, or
commitments. A model that returns the same common-sense answer for both twins
has not demonstrated source-grounded memory.

### 5.2 Real conversational cases

Real cases evaluate surfaces that synthetic recall cannot represent:

- character values and motives;
- relationship-specific behavior and voice;
- consistency under a new situation;
- causal continuation of existing events;
- use of unresolved plot material;
- avoidance of reopening resolved events without a cause;
- forward movement versus history repetition; and
- unsupported character, relationship, or plot invention.

The user selects the private source snapshots that represent actual value. A
model cannot infer from length or token count alone which character,
relationship, or story matters to the user. Each selected case is compiled
once, then reused across all conditions and repeats.

Private chat text is not committed. Raw source, effective adapter messages,
obligation dossiers, responses, blind maps, and judgments remain in private
mode-`0600` artifacts. A retained repository receipt may include synthetic
fixtures, bounded redacted obligation metadata, content hashes, request-shape
metadata, coverage counts, and aggregate results. It must not contain
credentials, provider tokens, service-account fields, PDF Base64, or
identifiable private content.

### 5.3 Calibration and locked evaluation

- Calibration cases may refine probes, schemas, and scoring instructions.
- Locked cases are not inspected condition-by-condition while parameters are
  being adjusted.
- A final comparison reports calibration and locked results separately.
- A condition that improves only the calibration set is not promoted as a
  general quality improvement.
- Calibration adjustments use complete comparison blocks, never a favorable or
  unfavorable single output. The adjusted request matrix, scorer, case set,
  order seed, and stopping contract are hashed before locked generation.
- If a locked result exposes a protocol defect, that run closes as unresolved.
  A corrected protocol requires a new untouched holdout; the opened result is
  not relabelled as calibration evidence.

### 5.4 Real-case evidence authority

Real-case evidence has four explicit classes:

1. **Deterministic source fact** — role, order, exact source span, most recent
   request, static character/system/lore text, and other values mechanically
   derivable from the frozen source.
2. **Verified source-anchored obligation** — a fact, relationship, commitment,
   prohibition, causal event, or plot state whose exact cited spans and bounded
   interpretation the user has confirmed.
3. **Interpretive axis** — motive, voice, natural hook use, forward movement,
   and other qualities without one source-determined answer. These receive
   blind comparative reasons, not objective pass/fail labels.
4. **Global-unverified candidate** — an LLM-proposed whole-conversation
   interpretation without sufficient verified authority. It remains outside
   objective scoring.

The obligation compiler may read the complete direct-text snapshot once to
propose cards. Every proposed card contains an ID, class, subject/object,
polarity, source message IDs and spans, acceptable uses, prohibited
contradictions, required co-obligations, and verification state. A deterministic
checker proves that cited spans exist byte-for-byte. The user reviews the card
and cited spans rather than rereading every output or accepting an unsourced
summary. The compiler is a retrieval and organization aid, not an oracle.

Coverage is reported by evidence class, obligation type, source position,
distance, entity, and scene/topic interval. The evaluation never infers that
unannotated text was remembered, forgotten, or contradiction-free. A claim of
exhaustive real-chat plot coverage would require an independently trusted full
reading and is outside this plan unless separately authorized and evidenced.

This boundary reflects two known failure surfaces: whole-narrative reasoning
can remain difficult even when needle retrieval succeeds, and model-generated
explanations can be wrong even for correct labels
([NoCha](https://arxiv.org/abs/2406.16264)); evidence-grounded contradiction
checking is useful only when each verdict remains linked to explicit source
text
([ConStory-Bench](https://aclanthology.org/2026.findings-acl.410/)).

## 6. Execution architecture and evidence lifecycle

### 6.1 Frozen PocketRisu source capture

The main experiment does not ask the user to press Send repeatedly and does not
let the live PocketRisu UI own experimental state. A case compiler opens a
read-only PocketRisu KV snapshot and captures only the selected case's required
authorities:

- raw selected chat and stable message identities;
- effective character, persona, system, lore, module/binding, and preset state;
- the exact formatted `AdapterChatMessage[]` immediately before PageFold
  transformation; and
- the source streaming mode and final generation settings that the selected
  production preset would use.

The effective adapter-message list is the experiment's request source of truth;
raw visible chat alone is insufficient because it omits resolved prompt
authorities. Credentials are loaded separately from the read-only snapshot and
remain in memory. They are never copied into the case artifact. If the selected
chat has active native or background generation, capture waits without
cancelling it. Every raw, effective, preset, and dossier artifact is immutable,
mode `0600`, content-hashed, and outside tracked Git paths.

### 6.2 Deterministic production-path runner

A dedicated runner on a disposable exact-live target owns provider calls. The
user selects cases and later reviews evidence; an LLM may compile or judge, but
neither can react to one output by choosing the next call. Before any generation
the runner freezes:

- case and dossier hashes;
- opaque condition IDs and a separately protected condition map;
- complete paired blocks, repeat/order seed, and request mode;
- final generation configuration and output authority;
- allowed request differences for each causal factor;
- price record, pre-call reservations, and total-cost invariant;
- checkpoint/result destinations; and
- immediate stop versus retained-inconclusive outcomes.

The direct-text control uses the ordinary PageFold-off production adapter. The
current low/maximum and low/balanced conditions use production
`preparePageFoldWire` and the final Google Gemini adapter unchanged. Experimental
`medium`, `high`, role-placement, hot-context, and layout conditions remain
research-only. They derive from the production-prepared request and may change
only predeclared paths. For example, a resolution-only variant keeps source,
canonical/PDF bytes, URL, model, directives, role placement, generation
configuration, and output cap identical while changing only the PDF part's
`mediaResolution.level`. A structural diff outside the condition allowlist
stops before provider work.

No structural qualification constant such as the historical `2048` compact
oracle output cap becomes a narrative default. The actual frozen production
preset remains generation authority. Fields absent from that final request
remain absent; the runner does not fill provider defaults or add a deterministic
seed merely for convenience.

### 6.3 Response collection and inspection timing

Every condition starts independently from the same frozen source. Experimental
responses are collected through the selected production stream or non-stream
parser, but are never appended to or fed back into the real chat. A private run
bundle contains:

```text
case-manifest.json
source-snapshot.json
obligation-dossier.json
calls.jsonl
responses.jsonl
blind-map.json
judgments.jsonl
sanitized-receipt.json
```

Each call records source, adapter-message, canonical, PDF, and final-body
identities; opaque condition; HTTP and finish state; requested and response
model versions; usage, latency, rated cost, and parser result; and the completed
raw response in the private artifact.

During a locked block, immediate inspection is content-free and limited to:

- source/request identity and allowlisted diff;
- HTTP, credential, parser, privacy, and checkpoint invariants;
- response model version and route identity;
- finish reason, usage, cost, and the hard-cap invariant; and
- exact transport/extraction checks whose expected values were frozen before
  generation.

Semantic content is not displayed in progress output and does not affect call
order, repetition, retry, or stopping. `MAX_TOKENS` remains an observed
truncation outcome rather than triggering a hidden retry. Calibration content
may be opened only after its complete block closes. Locked content is opened
only after all calls in its block close or the block is preserved as incomplete.

### 6.4 Objective scoring, blind judgment, and user review

Objective scorers use only deterministic facts and verified obligation cards.
Interpretive character/plot evaluation occurs after collection at the unit of
one case and one complete comparison block, not while each output streams. The
judge receives the frozen direct-text authority and anonymized outputs without
PageFold labels, cost, latency, or condition order. A complete-source judge pass
is costed as such; if it cannot fit the frozen context/cost contract, the case is
not silently downgraded to retrieval snippets or an unqualified summary.

The target `gemini-3.7-flash` may provide a self-judgment diagnostic, but it is
not the sole subjective judge. The independent judge identity and prompt are
frozen before locked generation. Known injected contradictions and
counterfactual twins calibrate the judge. Output-order reversal measures
position consistency; inconsistent verdicts remain disagreements instead of
being majority-averaged away. This guard is required because position bias
varies by judge and task and is not random noise
([systematic study](https://aclanthology.org/2025.ijcnlp-long.18/)).

The user does not score every response. The user verifies source-anchored cards,
reviews judge disagreements and the final non-dominated frontier, and makes the
value choice among observed trade-offs. An unblinded user impression may be
reported separately but does not rewrite locked objective or blind evidence.

### 6.5 Live PocketRisu boundary

The live UI is not the main evidence generator. After the runner closes, the
ordinary request preview and current supported direct/low condition are used to
prove sanitized final-request parity, streaming/parser behavior, and UI/storage
smoke behavior. A live smoke output is reported separately and is not mixed into
the blinded quality sample. Research-only resolution, role, layout, or
hot-context variants do not become live product options without their own
implementation, regression, admission, and user gates.

## 7. Measurement axes

### 7.1 Transport and model recognition

- canonical bytes and SHA-256;
- PDF bytes, layout identity, page count, and SHA-256;
- independent extracted bytes and first differing offset;
- role/message count and order;
- boundary-specific marker recovery;
- source versus model-reported code point/order data; and
- visual/native-text channel preference in a controlled mismatch probe.

The mismatch probe uses harmless paired markers and swaps them in a twin case.
It is a diagnostic of channel preference, not a production PDF format.

### 7.2 Conversational behavior

- direct retrieval;
- attribution and temporal order;
- multi-obligation causal integration;
- spontaneous relevant memory use;
- contradiction and unsupported-fact counts;
- character-value and relationship consistency;
- plot causality, unresolved-hook use, and forward movement; and
- condition-blind paired preference with reasons.

### 7.3 Cost and runtime

- resolved provider and model version;
- media resolution and page count;
- actual usage metadata by available modality;
- input, output, thinking, cached, and tool-use tokens where present;
- provider-reported/rated cost with its pricing basis;
- latency and finish reason;
- truncation/output-budget classification; and
- local render time, peak memory, PDF size, and cache identity.

Cost records also identify the call purpose as `annotation`, `generation`,
`judge`, or an explicitly retained retry. The `USD 10.00` hard cap covers every
metered provider-research call across those roles. It is applied to
undiscounted list-price rated usage; promotional credits do not expand the cap.
No fixed percentage is reserved for a phase. Before the first paid generation,
the exact minimum complete matrix is token-counted and reserved so calibration
cannot consume the budget needed to close a locked block.

The current price record is revalidated immediately before execution. Cost
arithmetic uses exact integer/decimal units rather than accumulated binary
floating point. Before each request, the exact prepared prompt and final output
authority provide a maximum reservation; after a successful response, actual
provider `usageMetadata` replaces that reservation. The runner issues no call
when cumulative actual usage plus the next reservation would exceed the cap.

Plugin heuristics, local PageFold token predictions, documented media-token
examples, and historical per-page constants cannot substitute for current
provider usage or billing evidence.

### 7.4 Evidence coverage and judge reliability

- objective obligations by deterministic, verified, and global-unverified
  authority;
- annotated versus unannotated source positions, entities, scenes, and
  obligation types;
- exact source citations accepted, rejected, or disputed by the user;
- judge calibration outcomes on known counterfactual and contradiction cases;
- judge repetition stability, position consistency, and disagreement reasons;
  and
- user-reviewed frontier items versus automatically scored items.

Coverage is a reported axis, not a multiplier that inflates quality scores.
Missing or unverified evidence narrows the claim; it does not become a pass.

## 8. Planned experiment sequence

### Phase 0 — Frozen source, dossier, request parity, and manifest

No creative provider comparison begins until all offline and content-free
preconditions close:

- select a case and capture a read-only raw/effective source snapshot;
- prove stable message, preset, binding, and adapter-message identities;
- compile, source-check, and user-verify the bounded obligation dossier;
- generate direct and PageFold requests through the production path on a
  disposable exact-live target;
- prove every experimental condition's final-body allowlisted diff;
- freeze calibration/locked cases, opaque IDs, order seed, scorer, judge,
  artifacts, and immediate stop contract;
- revalidate route/model/price identity and calculate the exact complete-matrix
  reservations; and
- prove private artifact permissions, content-free progress, checkpoint resume,
  and secret/redaction invariants without a provider generation.

If a full-source judge block or the minimum paired generation matrix does not
fit the frozen context or `USD 10.00` cost boundary, scope is revised before any
paid generation. It is not silently replaced by retrieval snippets, heuristic
summaries, fewer required cells, or an incomplete unpaired matrix.

### Phase A — Request parity and baseline variability

Before comparing PageFold quality:

- capture provider, requested model, resolved model version, route, and final
  generation/request configuration;
- prove source snapshot identity;
- record output limits, finish reason, and thinking usage;
- interleave condition order to reduce time/version drift; and
- repeat direct structured-text controls until their self-variation can bound
  later comparisons.

No fixed repeat count is assumed. Repetition follows the uncertainty rule in
section 10.

### Phase B — Transport and channel isolation

Creative quality is not evaluated yet.

- prove canonical-to-PDF-to-independent-extraction integrity;
- probe order at every layout boundary class;
- compare source roles with model-reported roles/order;
- use swapped visual/native marker twins to identify channel preference; and
- classify failures as transport, provider recognition, response generation,
  or harness/output-budget results.

### Phase C — Core categorical-factor matrix

Hold source, model route, generation configuration, and PDF layout fixed while
comparing the complete combinations of:

- provider-supported explicit `low`, `medium`, and `high` media resolution;
- system instructions represented inside the PDF versus native system
  instruction; and
- the current user request represented inside the PDF versus natively after
  the PDF.

A fully structured direct-text condition remains the external baseline. Main
effects and interactions are reported; for example, a resolution improvement
that disappears after restoring the native current-user request is not called
a general PDF-resolution improvement.

The explicit three-level resolution set follows the current Gemini 3 PDF
document contract; documented token examples remain planning context, while
actual response usage remains cost authority
([Google document-understanding reference](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/document-understanding)).

### Phase D — Layout and density response curves

Layout is evaluated only after the core request/role factors are understood.

Density is recorded as continuous measured values, including:

- source characters/tokens per page;
- messages/turns per page;
- source tokens per billed visual token; and
- average visual separation between semantic boundaries.

Sampling begins across the feasible interval and is refined where outcomes
change. Sample values locate the response curve; they are not candidate defaults
whose correctness is presumed.

Two complementary regimes are required:

1. **Equal-page/equal-cost regime:** use source lengths that keep all compared
   layouts at the same page count, isolating recognition/quality.
2. **Equal-source regime:** keep the complete transcript fixed and observe the
   real page-count, cost, latency, and quality trade-off.

Layout factors remain separate from density where possible:

- column count and gap;
- literal `\n` rendering versus semantic hard breaks;
- atomic role/message boundaries versus splittable headers;
- line-level versus logical-message-level `ActualText` grouping;
- explicit tagged reading order where supported; and
- one long document versus scene/message-boundary-aligned documents.

Provider-supported resolution is crossed with the measured density curve only
after the isolated `low`/`medium`/`high` result exists. This tests H3 without
assuming that any resolution is globally superior. An omitted/default
resolution is request-authority evidence, not a fourth stable quality level;
the research matrix uses explicit values.

### Phase E — Native hot-context boundary curve

Do not choose a fixed number of recent turns. Starting from a PDF-only history,
move the native/PDF boundary backward over actual complete message and scene
boundaries. At every observed boundary, report:

- actual cost and usage;
- distance-conditioned retrieval and integration;
- spontaneous memory use and contradiction;
- character and plot axes; and
- blind paired preference.

The resulting curve shows whether a hot/cold hybrid has a useful Pareto region
and where quality changes. It does not automatically establish a global
default; model, provider, conversation type, and source composition remain part
of the result identity.

### Phase F — Real conversation blind evaluation

- the real chat is already frozen and compiled under Phase 0; the live UI does
  not send the comparison calls;
- the deterministic runner sends the complete randomized block and collects
  outputs without appending them to the chat or displaying semantic progress;
- deterministic and verified obligations are scored mechanically from the
  locked dossier;
- an independent qualified judge receives the complete direct source and one
  anonymized output block without condition, cost, latency, or PageFold labels;
- order-reversed judgment measures position stability, and target-model
  self-judgment remains diagnostic only;
- the user reviews obligation citations, judge disagreements, and frontier
  candidates rather than every generated response;
- disagreements retain both reasons instead of being averaged away;
- condition labels are revealed only after locked objective and subjective
  judgments are durable; and
- unblinded impressions and later live UI smoke observations remain qualitative
  evidence and cannot override the locked results.

## 9. Character and plot scoring contract

### 9.1 Character interpretation

Report separately:

- explicit trait/value compliance;
- relationship-specific behavior and voice;
- motive consistency between prior and current choices;
- preservation of core values under an adverse/new situation;
- unsupported trait or relationship invention; and
- style similarity where a bounded reference set exists.

### 9.2 Plot behavior

Report separately:

- prior cause reflected in the new outcome;
- resolved events not reopened without a new cause;
- relevant unresolved hooks used when appropriate;
- new developments compatible with existing state;
- forward movement versus history restatement; and
- unsupported twists, facts, or relationship changes.

No test requires one predetermined plot direction. It requires compatibility
with the locked obligations and distinguishes novelty from continuity.

Every reported item names its authority. Explicit trait compliance and factual
contradiction may be objective when mechanically sourced or user-verified.
Motive quality, voice, natural hook use, novelty, and forward movement remain
interpretive unless a bounded source contract says otherwise. A judge may
prefer one continuation, but that preference cannot create a missing character
fact, mark a plot hook resolved, or expand evidence coverage retroactively.

## 10. Repetition, uncertainty, and stopping

No fixed repeat count is declared in this plan.

1. Measure direct-text self-variation for each task class.
2. Randomize and interleave complete paired condition blocks from the frozen
   manifest.
3. Maintain uncertainty intervals or paired-rank stability for each separate
   metric.
4. Continue while plausible outcomes still cross the direct-baseline variation
   band or reverse the condition ordering.
5. Stop a comparison only when it supports a practically distinguishable
   difference, practical equivalence, or an explicit unresolved result under a
   later user-selected uncertainty requirement.

No semantic output is inspected to decide whether another run occurs inside a
locked block. Operational failures are checkpointed without automatic retry.
Any later retry retains its original failed observation, reason, identity, cost,
and new randomized position. Exhausting the `USD 10.00` cap can close evidence
as unresolved; it cannot justify reducing uncertainty, coverage, or required
conditions after outputs have been opened.

The practical-difference rule is derived from baseline variability and the
user-visible consequence of the metric. It is not a hidden hard-coded score.

Model-version or provider-route changes split the evidence set. They do not
increase the repeat count of the old set.

## 11. Decision rule

Results remain a vector, not one intelligence score:

- transport integrity;
- direct retrieval;
- long-distance integration;
- spontaneous memory use;
- contradiction/unsupported invention;
- character consistency;
- plot causality and movement;
- actual cost; and
- latency/runtime cost.

A condition that costs more and is no better on every relevant quality axis is
dominated and can be removed. Non-dominated conditions form a quality-cost
Pareto frontier. Selection from that frontier requires an explicit later user
choice about which quality losses and costs are acceptable.

The final result is a configuration ledger, not one selected value. Every
configuration row reports:

- exact condition and evidence identity;
- actual input, candidate, thinking, annotation, judge, and total rated cost;
- transport, memory, contradiction, character, and plot observations;
- latency, truncation, and runtime cost;
- evidence coverage and unverified surfaces;
- uncertainty and judge/user disagreements; and
- observed strengths, losses, applicability, and limitations.

Only a condition that is more costly and no better on all relevant observed
axes under the stated uncertainty and coverage can be labelled dominated. A
condition is not removed merely because one weighted sum ranks it lower.
Frontier options may be described after observation as cost-oriented,
quality-oriented, or an observed knee, but those labels are not assigned in
advance and do not select a default. Non-concave narrative trade-offs are
possible; no positive weighted aggregate is assumed to recover every useful
choice ([WSE-bench](https://arxiv.org/abs/2608.15654)).

No outcome from this plan automatically:

- changes the structural-recognition or verbatim-copy contract;
- admits a provider/resolution/model;
- establishes a product default;
- authorizes a hot-context cutoff;
- updates the PageFold integration implementation; or
- authorizes paid calls, publication, or live deployment.

## 12. Activation checklist

The following constraints are now recorded:

- provider route: Vertex AI global standard/shared request path;
- requested model: `gemini-3.7-flash`, with response `modelVersion`,
  `responseId`, and `createTime` retained for every call;
- thinking: explicit low, `includeThoughts=false`;
- target tools, grounding, explicit cache, and other media: absent;
- other generation fields: exact frozen production-preset final request, with no
  invented defaults or added seed;
- research resolutions: explicit low/medium/high, with low as the unchanged
  production control and medium/high remaining research-only;
- automatic retry: none;
- total metered provider-research cap: undiscounted rated `USD 10.00`, including
  annotation, generation, judge, and any separately retained retry calls; and
- request control: deterministic runner, read-only source, private artifacts,
  complete paired blocks, content-free progress, and post-collection semantic
  judgment.

These recorded constraints still do not activate a call. Before execution, a
separate activation decision must freeze or confirm:

- selected private case identities and source quiescence;
- test-corpus privacy, retention, and deletion boundary;
- exact price record and maximum reservation arithmetic after current official
  revalidation;
- calibration and locked case identities;
- verified obligation dossier and declared coverage limits;
- final direct/production/research condition manifest and allowed request diffs;
- complete call order, checkpoint/resume contract, and minimum-block cost proof;
- independent judge identity, prompt, known-error calibration, order reversal,
  and user-review boundary;
- available usage/billing and model-version evidence;
- user-visible practical-difference and uncertainty requirements; and
- which phase is activated without implicitly activating later phases.

Until then this file is a durable plan only.
