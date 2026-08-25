# PageFold structural-oracle requalification

> **Status:** v1 L1 failed; v2 L1 passed and L2 qualified no resolution;
> result-driven v3 pending; no route qualified
>
> **Date:** 2026-08-25 KST
>
> **Previous paid evidence:** `docs/POCKETRISU-PAGEFOLD-PROVIDER-FEASIBILITY.md`
>
> **Deferred copy fidelity:** `docs/POCKETRISU-PAGEFOLD-VERBATIM-COPY-FOLLOWUP.md`

## Approved decisions

The user approved these planning boundaries:

1. Current route admission proves exact structural recognition rather than an
   identical response-string echo. Whitespace is represented as run lengths;
   ZWJ, variation-selector, and tag content is represented as ordered Unicode
   scalar values.
2. Vertex closes the mechanism first. AI Studio only replays a frozen
   successful matrix after its `429` quota/admission surface is resolved.
   OpenRouter remains outside scope.

The failed 2026-08-25 omnibus matrix remains failed evidence. It is not
reinterpreted as a pass by this revision.

## L0 harness boundary

`server/node/pageFoldStructuralRequalification.cjs` remains deliberately
incapable of provider work. Running it without
`PAGEFOLD_REQUAL_DRY_RUN=1` exits before font loading, credential access, or
network work. Separately approved provider execution lives in
`server/node/pageFoldStructuralPaidRunner.cjs` and requires its explicit paid
flag, a durable checkpoint destination, the `USD 0.25` ceiling, and a
Vertex-only credential selector.

The L0 harness defines:

- one text-only response-oracle control;
- paired low/medium one-page byte and grammar screens;
- a chosen-resolution 3/3 qualification sequence;
- a separate balanced hierarchy-mode sequence;
- normal compact output limit 512;
- at most two predeclared 1024-token truncation controls, no more than one per
  affected cell;
- no automatic retry or classic fallback;
- maximum 23 conditional calls; and
- Vertex rated-cost ceiling `USD 0.25`.

Calls are conditional rather than a full factorial batch. Text-oracle failure
stops all PDF work. Page expansion requires both byte and grammar screens on the
same resolution. If both resolutions pass, the run pauses and presents observed
usage/latency for a user choice. A later failure on the chosen resolution does
not automatically select the other one; a new paired control would require the
exact trigger specified in the integration authority.

## Structural oracle v1 — historical failed boundary

The byte-sensitive expectation is:

```json
{
  "words": ["ALPHA", "BETA"],
  "spaceRuns": [2, 3, 2],
  "zwjCodePoints": ["1F468", "200D", "1F469", "200D", "1F467", "200D", "1F466"],
  "variationCodePoints": ["2708", "FE0F"],
  "tagCodePoints": ["E0067"]
}
```

PDF byte cells contain identical labeled samples at `B_START`, `B_MIDDLE`, and
`B_END`. The answer must report all three in order. This proves recognition at
separated document positions without requiring the response generator to
reproduce invisible characters directly.

Grammar cells independently report:

- top-level header message count;
- `R_SYS`, `R_USER`, `R_ASSISTANT`, and `R_TOOL` role mapping;
- whether a complete fake message object inside `content` was counted; and
- the fenced code marker.

Page-marker cells return only three compact `Ldddddd` codes per physical page,
avoiding the previous omnibus response-size confound.

Observed synthetic answers in a paid run are retained only through the
declared schema, bounded depth/array/string limits, and field-level expected vs
observed differences. Unknown response fields are dropped. Credentials,
request bodies, PDF Base64, user content, and provider tokens remain prohibited.

## Structural oracle v2 — result-driven revision

The v1 L1 control combined response-schema behavior with raw whitespace,
invisible-character perception, and formatting-sensitive uppercase-hex output.
Because its field-level response was not retained, the observed failure cannot
identify which of those claims failed. The v2 change removes the confounds
without reinterpreting v1.

L1 now receives visible precomputed facts:

```text
PAGEFOLD_RESPONSE_ORACLE_V2
WORDS|ALPHA|BETA
SPACE_RUNS_DECIMAL|2|3|2
ZWJ_SCALARS_DECIMAL|128104|8205|128105|8205|128103|8205|128102
VARIATION_SCALARS_DECIMAL|9992|65039
TAG_SCALARS_DECIMAL|917607
ROLES|R_SYS:system|R_USER:user|R_ASSISTANT:assistant|R_TOOL:tool
```

Its only claim is that the model can map already-computed visible values into
the declared JSON schema. Actual source recognition begins in L2. PDF byte
cells report this deterministic expectation for each `B_START`, `B_MIDDLE`,
and `B_END` sample:

```json
{
  "words": ["ALPHA", "BETA"],
  "spaceRuns": [2, 3, 2],
  "zwjCodePoints": [128104, 8205, 128105, 8205, 128103, 8205, 128102],
  "variationCodePoints": [9992, 65039],
  "tagCodePoints": [917607]
}
```

Base-10 JSON integers remove hex-prefix, hex-case, and string-format variation
from the model-recognition verdict. They do not weaken order, whitespace-run,
or Unicode-scalar equality. Grammar, markers, hierarchy, fixture bytes,
resolution comparison, repeats, output controls, cost cap, no-retry, and
no-fallback rules remain unchanged.

## L0 fixture observations

All fixtures were independently extracted through PDF.js and matched their
canonical JSONL exactly.

| Mode | Pages | Source messages | Canonical bytes | PDF bytes | PDF SHA-256 | System retained outside PDF |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| maximum | 1 | 1,000 | 137,989 | 730,342 | `cc805de5659fdb3791087d7bd3f9ec248d6e5841ead2a707a1946008b181e2e3` | no |
| maximum | 2 | 1,428 | 197,695 | 1,042,064 | `1d278efc7c0feb7848c27f20e8a7ca4f35e4103346d4cf85b19d0cf71cb23839` | no |
| maximum | 8 | 9,996 | 1,392,931 | 7,307,692 | `cc76dfa72a7344ecfea474afecdb897115fc4fae49b9fe75d86eecff4fdee8a2` | no |
| balanced | 2 | 1,428 | 197,401 | 1,040,551 | `f1f87de5b85a5ca4204572a6656134ed5e4e47a16a5fc66f645f5dd35aeea3ca` | yes |

The maximum 8-page marker triples were fixed from the independent reader:

```text
L000000/L000711/L001422
L001423/L002137/L002850
L002851/L003565/L004278
L004279/L004992/L005705
L005706/L006420/L007133
L007134/L007848/L008561
L008562/L009276/L009989
L009990/L009993/L009995
```

Balanced mode removed both system rows from PDF order, retained their content
for provider-system composition, and began the first page marker sequence at
`L000001` without renumbering source indices.

## Automatic observations

- structural v1/v2 oracle focused test: 1 file / 9 tests passed;
- structural paid-runner and legacy provider focused tests after the L1
  preservation fix: 2 files / 20 tests passed;
- checkpoint write failure controls: failed start persistence caused zero
  fake-provider cells, and failed completion persistence allowed one completed
  cell but no second cell;
- paid-disabled CLI control: exited with code 2 before fixture/provider work;
- dry-run: four fixtures completed, paid execution remained false;
- canonical server validation: maximum and balanced forms accepted;
- output-control classification: 512 `MAX_TOKENS` -> one 1024 control;
  1024 `MAX_TOKENS` -> no further control;
- unknown synthetic answer fields: removed from retained observation;
- dry public output: no PDF bytes;
- patcher source suite: 45/45 files passed; and
- exact PocketRisu 1.10 focused owner lifecycle: 27 units, 17 managed paths,
  18 apply changes including private state, zero-change re-plan, `current`
  status with zero drift, and exact managed-byte/mode revert with state absent.

## Paid L1 v1 observation

The user approved the conditional Vertex sequence with at most 23 calls,
`USD 0.25` rated cost, no automatic retry, and no classic fallback. The paid
runner regenerated all four fixtures before provider work. Their PDF hashes
matched the L0 table above, and each independent PDF.js extraction remained
exact.

Only the L1 text-oracle cell ran:

| Provider | Model | Stage | Transport | HTTP | Finish | Prompt tokens | Rated output aggregate | Rated USD | Structural result |
| --- | --- | --- | --- | ---: | --- | ---: | ---: | ---: | --- |
| Vertex | `gemini-3.7-flash` | L1 | text | 200 | `STOP` | 431 | 464 | 0.002063250 | fail |

The failed text oracle triggered the predeclared stop. PDF calls, low/medium
screening, resolution selection, L3 qualification, and L4 hierarchy cells all
remained at zero calls. No output-cap control, retry, alternate resolution, AI
Studio call, OpenRouter call, or classic fallback ran.

### Partial-result preservation defect

The provider result reached the local structural evaluator and produced
`status=fail`. The then-current final-result guard subsequently mistook the
boolean credential check field named `vertexProjectId` for a prohibited project
id value. It rejected the summary before stdout, leaving the result file at
zero bytes. Consequently the bounded observed fields, field-level differences,
answer hash, and latency are unavailable and are not inferred here.

No credential value was printed or placed in the rejected summary. The defect
was local and post-call; it does not change the observed provider failure. The
call was not repeated because doing so would violate the approved no-retry
contract.

The follow-up fix:

- renamed existence checks to boolean-only `*Present` fields;
- rejects any non-boolean credential-check value;
- requires a newly created exclusive mode-`0600` checkpoint file before
  fixtures, credential access, or paid work;
- fsyncs a sanitized `call-start` marker before provider work;
- fsyncs a sanitized `call-complete` record before another provider call can
  begin; and
- fails closed before the next call if checkpoint persistence fails.

These controls were validated only with fake-provider observations after the
actual L1 stop. They do not recover or reinterpret the lost per-field L1 data.

The paid runner now records `oracleVersion=2` in start/completion checkpoints
and final summaries. Resume validation rejects a v1 or missing-version summary.
No provider call was made while implementing that revision.

## Paid structural oracle v2 observation

The user separately approved v2 under the same maximum 23 calls,
`USD 0.25`, no-retry, and no-fallback boundary. All four regenerated fixture
hashes again matched the L0 table and their independent extraction remained
exact. The conditional run made six physical calls: five planned logical cells
and one low-byte output-cap control.

| Call | Stage/claim | Resolution | Output cap | HTTP/finish | Prompt | Candidate | Thought | Latency ms | Rated USD | Result |
| ---: | --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | L1 text oracle | N/A | 512 | 200 / `STOP` | 515 | 119 | 0 | 2,554 | 0.000832500 | pass |
| 2 | L2 byte | low | 512 | 200 / `MAX_TOKENS` | 692 | 6 | 492 | 6,744 | 0.002386500 | inconclusive |
| 3 | L2 byte control | low | 1,024 | 200 / `MAX_TOKENS` | 692 | 59 | 950 | 8,782 | 0.004302750 | inconclusive |
| 4 | L2 byte | medium | 512 | 200 / `STOP` | 958 | 210 | 0 | 4,550 | 0.001506000 | fail |
| 5 | L2 grammar | low | 512 | 200 / `STOP` | 488 | 86 | 0 | 4,096 | 0.000688500 | fail |
| 6 | L2 grammar | medium | 512 | 200 / `STOP` | 754 | 54 | 0 | 3,874 | 0.000768000 | fail |

Total rated usage was `USD 0.010484250`. L1's complete retained observation
matched words, space-run lengths, decimal ZWJ/variation/tag scalars, and all
four role facts exactly. This establishes that the visible v2 response oracle,
structured response parser, evaluator, and checkpoint path worked for that
cell.

### L2 byte observations

Low produced only 6 candidate tokens after 492 thought tokens at the normal
cap. Its one predeclared control again ended at `MAX_TOKENS`, with 59 candidate
and 950 thought tokens. It is inconclusive rather than failed recall. No second
control or automatic medium fallback ran.

Medium returned one complete observation. All three start/middle/end samples
agreed with each other:

- words matched `ALPHA`, `BETA`;
- variation scalars matched `[9992, 65039]`;
- `spaceRuns` was `[1, 1, 1]` instead of `[2, 3, 2]`;
- `zwjCodePoints` was `[8205, 8205, 8205]` instead of the full emoji-plus-ZWJ
  sequence; and
- the tag scalar was `[917511]` instead of `[917607]`.

The first two mismatch shapes expose oracle wording confounds: “runs” can mean
the number of runs rather than each run's length, and “ZWJ code points” can
mean only the U+200D separators rather than every scalar in the labeled
sequence. The tag mismatch remains an actual unresolved scalar-recognition
observation. The frozen v2 cell remains failed; this diagnosis does not convert
it to a pass.

### L2 grammar observations

Both resolutions returned the correct header count `1000`, did not count the
fake embedded row, and recovered `CODE_OK_7F3A`.

Low returned the four correct role/marker facts but formatted each pair as
`role:marker` and ordered them by their actual PDF occurrence:
user, assistant, tool, system. Medium used the requested `marker:role` format
and the same occurrence order.

The frozen expected order was wrong for this fixture. `createStructuralMessages`
places `R_USER`, `R_ASSISTANT`, and `R_TOOL` at source indices 1-3 and the
`R_SYS` marker at source index 4; source index 0 contains the separate system
authority sentinel, not `R_SYS`. Medium therefore recovered the actual marker
order, while the oracle expected system first. v2 remains failed under its
frozen contract, but this ordering mismatch is an oracle defect rather than
provider evidence.

### v2 stop and persistence

Neither resolution passed both byte and grammar claims, so the declared
`no-resolution-passed-both-claims` stop fired. Resolution selection, all 13 L3
cells, all three L4 cells, AI Studio, OpenRouter, retry, and classic fallback
remained at zero.

The mode-`0600` checkpoint contained six matched `call-start`/`call-complete`
pairs, all with `oracleVersion=2`. The 17,505-byte summary and 10,177-byte
checkpoint contained zero PDF Base64 prefixes, canonical markers, API-key
shapes, bearer strings, or private-key markers. A new read-only
`request-logs.db` cutoff query again found zero new rows and zero PDF/Base64,
canonical, access-token, or private-key delta hits.

### Request-log observation

The paid harness used its direct HTTPS path and did not add a PocketRisu
`request-logs.db` row. A read-only query from a cutoff preceding the run found
zero new rows and therefore zero delta hits for PDF MIME/Base64 indicators,
the canonical transcript marker, API-key shapes, bearer/access-token shapes,
or private-key markers.

The whole existing database contained ten generic `AIza`-shape matches, all
predating the cutoff and all in model response bodies. A separate in-memory
exact comparison against every stored Google API key found zero matching keys
and zero matching rows. The generic response strings were not printed or
treated as credential evidence. Across the whole database, exact stored API
keys, PDF, canonical marker, bearer/access-token, and private-key hit counts
were zero at this observation point.

## L2.5 runtime audit

### Phase 1 — flat discovery

The changed path can perform these actions and outcomes:

- require an explicit paid flag and checkpoint owner;
- render four bounded synthetic fixtures through the font cache and worker;
- hold PDF bytes and their Base64 request representation transiently;
- independently extract and compare canonical bytes;
- open and decode a read-only PocketRisu database snapshot;
- select one credential by normalized-name hash and validate its shape;
- sign an RS256 OAuth assertion and exchange it for an access token;
- create text-only or PDF-first Vertex request bodies;
- select a versioned v1/v2 response and recognition oracle;
- issue timed OAuth and model HTTPS calls;
- parse HTTP, provider JSON, structured answer JSON, finish reason, and usage;
- rate usage and compare a pre-call reservation and post-call total to the cap;
- sanitize observed synthetic fields, differences, hashes, errors, and logs;
- fsync `call-start` and `call-complete` checkpoint records;
- stop, select one resolution, pause for a two-resolution decision, or resume;
- admit at most two output-cap controls without recall retry or fallback;
- write a final sanitized summary or a code-only stderr failure;
- close the checkpoint descriptor;
- install/revert 27 focused owner units on an exact-1.10 disposable target; and
- remain absent from the catalog, server bootstrap, candidate live tree, BG
  orchestration, plugin persistence, and stable distribution.

This flat pass also surfaced local render CPU/RSS, whole-save decode memory,
worker/file/HTTP handles, synchronous checkpoint I/O, timeout/error paths,
process interruption between lifecycle points, and pricing/version drift.

### Phase 2 — external anchors

- **Authority and sequencing:** paid/checkpoint gates precede fixtures and
  credentials; L1 failure returns before L2; two passing resolutions return a
  decision instead of choosing; later failure returns without alternate-route
  fallback (`pageFoldStructuralPaidRunner.cjs:61-163`). The fake-provider suite
  observed L1 stop, five-call decision pause, single-resolution 21-call close,
  resume without screening replay, and bounded output controls.
- **Call lifecycle:** the 23-call and rated-cost preflight precede OAuth/model
  work; sanitized `call-start` precedes the request and `call-complete`
  precedes any next cell (`pageFoldStructuralPaidRunner.cjs:195-332`). Injected
  start-write failure produced zero fake calls; injected completion-write
  failure produced one call and no second call.
- **Wire and errors:** the only model endpoint is global Vertex, with a
  five-minute timeout, PDF-first part ordering, per-part low/medium resolution,
  compact structured output, low thinking, and no tools or cache
  (`pageFoldStructuralPaidRunner.cjs:344-448`). Network, HTTP, provider-JSON,
  answer-JSON, usage, and finish paths are normalized without retaining raw
  bodies (`pageFoldStructuralPaidRunner.cjs:344-470`).
- **Oracle separation:** v1 hex/raw expectations remain addressable only by
  version 1. Version 2 supplies visible decimal L1 facts, requires integer
  scalar arrays, and uses those same integer expectations for PDF byte cells
  (`pageFoldStructuralRequalification.cjs:166-335`). The paid runner pins v2 in
  request, evaluation, checkpoint, summary, and resume validation. Focused
  tests observed v1 preservation, v2 pass/fail evaluation, integer schema,
  visible control text, and rejection of an unknown oracle version.
- **Credential lifecycle:** the database reader closes its read transaction in
  `finally`; selectors require exactly one hash match; the service-account
  token URI and PKCS8 shape are validated; OAuth is RS256 and time-bounded
  (`pageFoldProviderFeasibility.cjs:427-568`). The target snapshot reader opens
  SQLite read-only. The actual credential read and OAuth exchange succeeded;
  no credential value entered stdout, tracked files, or the request-log delta.
- **Fixture integrity/resources:** fixture generation is sequential and its
  renderer enforces the previously measured worker, queue, source, page, span,
  PDF-byte, and cache ceilings. Each paid-run fixture matched its frozen hash
  and exact PDF.js extraction (`pageFoldStructuralRequalification.cjs:337-388`).
- **Resume and result safety:** resume revalidates schema, model, fixture
  identity, call count, cost, controls, every observation, and the two-pass
  decision (`pageFoldStructuralPaidRunner.cjs:472-580`). Public records are
  schema-bounded; actual secret strings and prohibited value-bearing keys are
  rejected (`pageFoldStructuralPaidRunner.cjs:582-879`). The original boolean
  field-name false positive was observed, fixed, and retained as failed
  evidence rather than hidden.
- **Ownership and no-live claim:** catalog search found no PageFold entry;
  patcher tests assert that exclusion. Exact-target apply/re-plan/status/revert
  observed 27 units, 17 paths, zero collisions/drift, and no byte/mode mismatch.
  No server import or bootstrap caller exists, so the paid module runs only as
  its explicit maintainer CLI. A dynamic-dispatch counterexample would require
  a catalog/bootstrap import; the current catalog and target search contain
  none.
- **Privacy measurement:** the post-cutoff request-log delta had zero rows.
  Whole-database PDF/Base64, canonical, bearer/access-token, private-key, and
  exact stored Google-key counts were also zero. The ten generic `AIza` pattern
  matches were isolated to pre-existing response bodies and did not equal a
  stored key.

### Phase 3 — triage

- **Q1:** the actual v1 L1 gate failed; v2 has no provider observation, so
  support admission and every downstream runtime/live owner remain closed.
- **Q1:** no PageFold-created credential, PDF, canonical transcript, token, or
  private-key persistence finding remains in tracked output or request-log
  delta.
- **Q2:** no application runtime, BG, catalog, plugin-array, or live-state owner
  was added. The harness is an unregistered maintainer artifact.
- **Q3 fixed:** the boolean credential-check name no longer trips the value
  guard, and every check value must be boolean.
- **Q3 fixed:** start/completion checkpoints now fail closed around each model
  call, with a persisted start marker available even if completion is lost.
- **Q3 fixed:** L1 response plumbing no longer doubles as raw invisible-
  character recognition, and scalar formatting no longer affects L2 recall.
- **Q3 resolved by observed gates:** source tests, focused server tests,
  exact-target owner lifecycle, reference-line comparison, secret sweep,
  official price/model-limit check, and request-log queries are recorded above.
- **Q4 prepared surfaces:** S1 strict pre-call cost enforcement and S2
  response-to-completion process interruption remain below.

### Prepared surfaces

#### S1 — strict rated-cost ceiling

1. **Claim:** the run does not exceed `USD 0.25` rated usage.
2. **Resolved:** maximum calls/output tokens are structural, a conservative
   per-cell prompt reservation is checked before each call, actual usage is
   rated after each response, and this run stopped at `$0.002063250`.
3. **Blocked link:** Vertex supplies authoritative prompt usage only after a
   call; an unobserved future request could exceed the reservation before the
   post-call stop executes.
4. **Limitation:** this is provider-side billing information unavailable to the
   local caller before generation; code alone cannot prove the future usage
   value.
5. **Review method:** before any new paid approval, either establish a provider
   `countTokens`/billing-control preflight for the exact body or explicitly
   accept the reservation ceiling. A preflight above reserve changes this from
   prepared surface to a blocking defect.

#### S2 — response-to-completion interruption

1. **Claim:** a paid call is never silently replayed after local interruption.
2. **Resolved:** `call-start` is fsynced before network work and
   `call-complete` before any next call; restart/resume accepts only a complete,
   revalidated decision summary and never resumes an orphan start marker.
3. **Blocked link:** a process or host termination after the provider response
   but before completion fsync can still lose the response details.
4. **Limitation:** the provider does not expose a response-retrieval handle to
   this harness, and killing the process is outside its in-process catch path.
5. **Review method:** treat a start record without completion as an attempted
   paid call and stop without automatic retry. A future design may add a
   provider-supported idempotency/retrieval mechanism; absent that, replay
   requires a new explicit decision.

## Next gate

No Vertex resolution is support-qualified. Under the integration authority,
adapter/UI/BG composition, catalog admission, candidate live apply, and stable
release remain closed. The v2 design and automatic gates are complete, but
another provider call is a new experiment and requires separate explicit
paid-call approval. An approved v2 run starts again at its visible L1 response
control; the exhausted v1 approval and result cannot be resumed. Independent
PDF extraction cannot substitute for a model-recognition gate.
