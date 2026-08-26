# PageFold verbatim-copy follow-up

> **Status:** executed and closed for the frozen profile; provider-copy and
> product-copy failed, so verbatim copy is not supported
>
> **Date:** 2026-08-26 KST
>
> **Authority:** `docs/POCKETRISU-PAGEFOLD-INTEGRATION-PLAN.md`
>
> **Execution receipt:**
> `docs/POCKETRISU-PAGEFOLD-VERBATIM-COPY-VALIDATION.md`
>
> **Separate context-quality/cost evaluation:**
> `docs/POCKETRISU-PAGEFOLD-QUALITY-COST-EVALUATION-PLAN.md`

## 1. Verification objective and qualification boundary

The primary verification objective is:

> Under one frozen provider/model/PageFold profile, determine whether the
> selected canonical message `content` is reproduced byte-for-byte as UTF-8,
> and whether that result is preserved through PocketRisu parsing, streaming,
> postprocessing, persistence, reload, and any advertised plain-text copy
> action.

Completion requires separate observed decisions for provider-copy and
product-copy, plus the first exact boundary where a failure occurs. It does not
require either surface to pass, and a negative result is not repaired or
relabelled by normalization, majority success, or a narrower unannounced
fixture set.

Current provider admission proves that the model can **recognize** the exact
logical content carried by the PDF. It does not require the model to reproduce
that content byte-for-byte in a generated answer.

Byte-sensitive recognition uses structural answers:

- whitespace is reported as run lengths, positions, and code points;
- ZWJ/variation/tag content is reported as an ordered Unicode code-point list;
- role/order, fake-record isolation, and page markers use compact identifiers;
- PDF.js continues to prove exact canonical bytes independently of the model.

Verbatim copying remains a separate capability from PageFold context
understanding. The 2026-08-26 execution closed the frozen Vertex global
`gemini-3.7-flash` / low / maximum profile with negative decisions:

- three required content cells failed in the PDF renderer before provider
  work;
- the corrected provider response control returned `각` plus one trailing LF
  instead of the exact three-byte source; and
- the current PocketRisu final sink independently removed leading/trailing
  bytes through unconditional `trim()`.

The provider run stopped fail-fast after two total calls at cumulative rated
cost USD 0.00066825. No canonical-text/PDF provider result is inferred from the
cells that correctly remained unexecuted.

There are two separately named support surfaces:

1. **Provider-copy support** means the parsed non-thought candidate text from a
   frozen provider request is exact UTF-8 for the selected source payload.
2. **Product-copy support** means the final user-visible PocketRisu sink is
   exact after the production adapter, streaming or non-streaming assembly,
   reasoning separation, request loop, output processing, persistence, reload,
   and any advertised copy/export action.

Provider-copy support must not be presented as product-copy support. A product
claim requires both surfaces to pass under the same versioned support profile.
Both claims failed under the executed profile, so PageFold must not be
advertised or used as a byte-exact document copier.

## 2. Why it is separate

An exact echo combines two different claims:

1. the model perceived the source characters correctly; and
2. the model's response generator reproduced the same characters without
   trimming, Unicode normalization, formatting, or serializer changes.

The first claim is required for PageFold context understanding. The second may
be required for code, templates, signatures, structured payloads, or other
copy-exact workflows, but it is not equivalent to ordinary conversational
recall.

The 2026-08-25 paid run demonstrated this distinction: complete responses
reported the correct U+200D count while their returned ZWJ string differed, and
they recovered page markers, fake-row boundaries, and code markers while exact
whitespace echo differed. That result cannot identify whether perception or
output normalization changed the returned string without a structural control.

## 3. Current end-to-end blocker and preservation boundary

The current production chat path is not byte-preserving at its final sink:

- `src/ts/process/index.svelte.ts` applies `data.trim()` through
  `reformatContent` before both streaming and non-streaming assistant messages
  are stored;
- `src/ts/util.ts` trims message data again for a display-facing message form;
- `replacerafterRequest`, `risuEscape`, banned-character retry,
  `removeIncompleteResponse`, `processScriptFull(..., 'editoutput')`, output
  triggers, inlays, continuation prefixes, and reasoning formatting are
  additional conditional transforms; and
- decoupled streaming and BG journal recovery assemble the response through
  distinct callers even though they reuse the provider parsers.

The executed target-path differential confirmed this boundary: a locked 1,516-
byte payload became 1,512 bytes before save/reload/plain-copy, classified as
`edge-trim`. Save/reload preserved that already-modified value and the copy
path had no metadata from which to reconstruct the lost bytes.

No product-copy implementation was admitted. Any future proposal must use a
new versioned profile and either remain explicitly provider-only or define a
dedicated exact-data channel while preserving ordinary chat behavior.

Globally removing normal chat trimming or disabling user-owned output scripts
is not part of this plan. Any product implementation must isolate the new
operation and prove that PageFold-off and ordinary chat processing remain
unchanged.

## 4. Future reactivation triggers and required decision

The executed profile is closed and is not resumed or retried. A new versioned
follow-up becomes active only when at least one of these is true:

- a real workflow requires byte-identical copying from PageFold context;
- code, JSON, HTML, prompt templates, or preformatted text are observed to
  change when the model is asked to reproduce them;
- the product is going to claim exact source reproduction rather than exact
  transport plus context understanding;
- a provider/model/output API change offers a stronger constrained-copy mode;
- a physical L3 scenario exposes a user-visible copy-fidelity regression.

It does not activate merely because a normal answer paraphrases source text.

Future activation is a separate recorded decision. Before offline harness
implementation, it must freeze:

- the user-visible workflow and exact sink being claimed;
- how the target message/content span is selected;
- provider, endpoint kind/location, requested and resolved model identity;
- PageFold mode and media resolution;
- provider-direct, non-streaming, streaming, decoupled-streaming, BG-recovered,
  persisted-message, and clipboard/export surfaces that are in or out;
- response MIME/schema, thinking behavior, generation parameters, and output
  limit;
- a non-empty maximum target size in UTF-8 bytes;
- proposed fixture-manifest version, required content classes, boundary
  classes, and repeat contract;
- artifact location, retention, and privacy boundary; and
- the documentation label allowed by a pass.

After the offline harness expands and validates the locked manifest, a second
explicit paid activation record must freeze:

- the exact fixture/cell order and final manifest hash;
- fail-fast qualification versus bounded diagnostic continuation;
- exact physical call list and maximum call count;
- rated-cost source/effective date and user-approved cost ceiling;
- retry, fallback, resume, and inconclusive-result policy; and
- the approved provider stages, with later stages still inactive.

The first route considered should be the already structurally qualified Vertex
`gemini-3.7-flash` low route unless the activation decision explicitly opens a
different route. Medium, AI Studio, another model, and OpenRouter inherit
nothing from that route. Maximum and balanced modes are also separate evidence
cells; only a mode that runs the complete required matrix may be named in a
copy-support profile.

## 5. Exact payload and equality contract

### 5.1 Source payload

The primary copied object is the **decoded `content` string of one identified
canonical PageFold message record**, not the PDF file bytes and not the visible
JSON escape spelling in the PDF. The harness identifies the record by frozen
`sourceIndex`, role, fixture id, and canonical transcript hash. The copy
instruction is outside the carrier and asks for that content only.

This distinction is required for cases such as:

- an actual LF versus the two literal characters backslash + `n`;
- a quote or backslash escaped by PageFold JSONL;
- decomposed versus precomposed Unicode; and
- JSON, HTML, or code that exists as message content rather than top-level
  transcript grammar.

The first support profile covers non-empty, well-formed Unicode text encoded as
canonical UTF-8 only within the locked content matrix and byte limit. It is not
a binary-copy claim, a PDF-byte-copy claim, an invalid-UTF-8 claim, an unlisted
control-character claim, a glyph-shape claim, or an arbitrary-length claim.
Empty content may be a diagnostic cell, but it cannot qualify the first product
profile because an exact empty answer is indistinguishable from several blank
response and fallback states.

### 5.2 Exact equality

A pass requires both strings to be well-formed Unicode and byte equality after
encoding the expected and observed strings as UTF-8. An unpaired surrogate or
decode replacement is a failure before equality; it is never silently repaired.
The comparator performs no:

- trimming;
- line-ending conversion;
- Unicode normalization;
- HTML/entity decoding;
- Markdown/code-fence removal;
- JSON unescaping beyond the provider envelope's normal JSON parse;
- replacement-character repair; or
- prefix/suffix tolerance.

The comparator also records UTF-16 code-unit count, Unicode scalar sequence,
normalization form, whitespace runs, and first differing byte/scalar for
diagnosis. Those derived views never replace the byte verdict.

For a non-stream response, provider candidate text is the ordered concatenation
of all non-thought text parts in the first accepted candidate. For streaming,
it is the ordered concatenation of non-thought text deltas after independent
SSE/JSON decoding. Reasoning text, thought signatures, tool calls, and usage
metadata are not copied content. A profile that exposes formatted reasoning
inside the final assistant message must either disable that surface for the
verbatim operation or fail product qualification.

The first plain-copy candidate uses no test-forced JSON response schema or
response MIME. If the advertised workflow itself consumes a structured JSON
string, that response mode receives its own profile and matrix. A structural
diagnostic answer cannot qualify a plain-text copy surface.

### 5.3 Bounded support-profile identity

Every result is keyed by at least:

~~~text
provider + endpoint/auth kind + requested/resolved model/version
+ media resolution + PageFold mode
+ serializer/layout/font/directive/copy-directive versions
+ response MIME/schema + generation/thinking configuration
+ stream surface + adapter/parser/app build identity
+ fixture manifest + maximum copied UTF-8 bytes + repeat contract
~~~

A change to any identity field creates a new evidence set. A model-family,
provider, resolution, mode, streaming path, or product sink cannot inherit a
pass by similarity.

## 6. Evidence pipeline and failure taxonomy

The harness retains a hash/equality observation at every reachable boundary:

~~~text
synthetic payload bytes
  -> canonical JSONL bytes
  -> deterministic PDF bytes
  -> independent PDF.js ActualText bytes
  -> final redacted provider request identity
  -> raw response body or SSE events
  -> independently parsed non-thought candidate text
  -> production adapter text
  -> request-loop / stream-pump / BG-recovery text
  -> post-processed and persisted assistant message
  -> reload and advertised clipboard/export sink
~~~

The last two nodes apply only to product-copy qualification. The raw provider
request body, PDF Base64, credentials, and provider tokens are never written to
the retained summary.

Results use these non-overlapping statuses:

| Status | Meaning | Paid interpretation |
| --- | --- | --- |
| `invalid-fixture` | source bytes, manifest, canonical form, or expected values disagree | stop before credentials/network |
| `transport-fail` | canonical JSONL and independent PDF extraction differ | stop before provider work |
| `text-control-fail` | the same model/config cannot copy the canonical text carrier | provider output/common instruction not qualified; PDF cannot qualify |
| `pdf-copy-fail` | text control passes but the paired PDF candidate differs | PageFold carrier/model reading remains unqualified |
| `candidate-copy-pass` | independent parsed provider candidate equals expected bytes | provider surface only |
| `production-parser-fail` | independent candidate passes but production parser/stream assembly differs | deterministic downstream defect |
| `product-sink-fail` | provider and parser pass but stored/reloaded/exported bytes differ | user-facing support blocked |
| `inconclusive-output-cap` | truncation or output-budget finish before a complete candidate | budget/harness result, never copy pass/fail |
| `inconclusive-infrastructure` | auth, quota, timeout, network, checkpoint, or malformed envelope prevents a verdict | no automatic retry or alternate route |
| `blocked-content` | a benign locked fixture is refused or filtered | recorded separately; general support remains unqualified |

Paired results support bounded diagnosis, not mind-reading:

- text and PDF produce the same mutation: common instruction, response
  generation, or serialization is implicated;
- canonical text is exact while PDF differs: the carrier/visual-reading path is
  implicated;
- independent provider text is exact while production text differs: the
  parser or application path is directly isolated; and
- PDF.js differs before provider work: transport is directly isolated.

A structural code-point answer can be added for a failed micro fixture under a
preapproved diagnostic budget, but it is still generated output and does not
retroactively turn an exact-copy failure into a pass.

## 7. Frozen fixture and matrix contract

The executed qualification kept text-only and PDF inputs paired in its locked
manifest. A future version must retain that rule so source perception and
output serialization remain distinguishable.

### 7.1 Manifest and byte authority

Qualification uses a versioned, committed synthetic fixture manifest. The
manifest—not an editor-rendered Markdown sample—is the expected-byte authority.
Each cell records:

- stable fixture/counterfactual-twin ids and feature tags;
- exact synthetic payload bytes as Base64 or a versioned deterministic
  generator plus expected SHA-256;
- decoded UTF-8 byte, scalar, and UTF-16 code-unit counts;
- expected normalization form and whitespace-run metadata;
- target `sourceIndex`, role, transcript placement, PageFold mode, and page
  placement;
- canonical JSONL SHA-256 and expected independent extraction SHA-256; and
- size tier and the profile maximum copied-byte limit.

Manifest loading must reject malformed Base64, ill-formed UTF-8, a
decode/re-encode mismatch, a duplicate id, a missing feature/boundary tag, an
unexpected hash, or a payload larger than the frozen profile limit. Synthetic
Base64 is allowed in the fixture source; PDF Base64, credentials, and user
content are not.

### 7.2 Required content matrix

- leading, repeated, and trailing spaces;
- tabs, LF, CRLF, CR, literal `\n`, and literal `\\n`;
- NBSP and other non-breaking separators;
- Korean, Han, Hiragana, Katakana, Latin, and bounded RTL-script samples;
- NFC/NFD combining sequences;
- ZWJ emoji, variation selectors, tag characters, and bidi controls;
- JSON, HTML, code fences, escaping, long URLs, and no-whitespace strings;
- fake canonical header/message records inside content;
- short records and records crossing line, column, and page boundaries.

The locked manifest groups those obligations as follows:

| Group | Minimum locked obligation |
| --- | --- |
| `W-edge` | leading, internal repeated, and trailing ASCII spaces in one payload, plus twins differing by one space |
| `W-line` | tab, LF, CRLF, CR, literal `\n`, and literal `\\n` with independently located separators |
| `W-nonbreak` | NBSP, narrow no-break space, word joiner, and ordinary-space twins |
| `U-script` | Korean, Han, Hiragana, Katakana, Latin, and bounded Arabic/Hebrew samples |
| `U-normal` | visually similar NFC/NFD pairs and combining-mark sequences whose bytes differ |
| `U-format` | ZWJ emoji, variation selectors, tag characters, ZWNJ, and bounded bidi controls |
| `S-json` | nested JSON strings, quotes, backslashes, numeric-looking strings, and escaped controls |
| `S-html` | tags, entities, attributes, comments, and text that must not be decoded or sanitized |
| `S-code` | indentation, tabs, code fences, blank lines, trailing spaces, and language punctuation |
| `S-token` | long URL, long no-whitespace token, repeated delimiters, and case-sensitive identifiers |
| `G-record` | complete fake PageFold header/message objects inside `content` without grammar escape |
| `B-wrap` | a target crossing a visual line/wrap and more than one `ActualText` span |
| `B-column` | a target adjacent to and crossing a physical column transition |
| `B-page` | targets immediately before, across, and after a physical page transition |
| `B-position` | bounded targets at document start, middle, and end, including an eight-page locator fixture |
| `L-limit` | one-scalar minimum, ordinary block, profile-limit boundary, and local over-limit rejection |

The manifest may combine obligations into one payload, but a coverage report
must prove all rows and all source/boundary tags are represented. Adding a new
fixture after seeing provider output creates a new manifest version and cannot
repair or reinterpret the old result.

### 7.3 Paired carriers, modes, and counterfactuals

Every required paid cell has two carriers built from the same canonical JSONL:

1. **canonical-text control** — the PageFold JSONL is sent as text; and
2. **PDF condition** — the byte-identical JSONL is rendered by the production
   renderer and sent as the PageFold PDF.

The system decoder and copy instruction are identical inside a carrier pair.
The only allowed final-request differences are the carrier part itself and the
profile-owned PDF MIME/media-resolution fields. A redacted structural diff must
reject a model, prompt, response schema, output limit, generation parameter,
system instruction, or unrelated body/header difference.

A direct-literal micro control, where the already-decoded payload is visible as
plain text, runs before the canonical-text/PDF pair. It diagnoses whether the
model can emit the byte pattern at all; it is not a PageFold support cell.

Each mutation-sensitive fixture has a counterfactual twin that changes exactly
one relevant byte/scalar/run while keeping length and surrounding context as
close as possible. Returning the same generic or normalized answer for both
twins fails both cells.

For the current PageFold profile:

- one-page fixtures isolate content classes;
- two-page fixtures exercise line/column/page crossings; and
- an eight-page fixture places bounded targets at the first, middle, and last
  regions without requiring the model to echo the entire eight-page document.

Maximum and balanced run as separate matrices. A mode omitted from the paid
matrix stays unqualified. The same applies to non-streaming versus streaming
provider responses.

### 7.4 Evidence per cell

- text-only control bytes;
- PDF control bytes;
- complete response and finish reason;
- UTF-8 byte equality after response parsing;
- source and response code-point sequences;
- Unicode normalization form before and after;
- whitespace-run comparison;
- first differing byte/code-point offset and bounded surrounding context;
- provider usage, resolution, page count, and repeated-run identity.

The cell also retains:

- manifest, canonical, PDF, extraction, copy-directive, request-profile, and
  application-build identities;
- final request structural-diff result and a bounded redacted request-shape
  fingerprint computed only after content and secrets are removed;
- HTTP status, finish reason, candidate/part count, latency, and actual usage;
- raw-envelope hash, independent candidate-text hash, production-parser hash,
  stream/BG assembly hash, persisted-message hash, reload hash, and
  clipboard/export hash for every in-scope boundary;
- byte counts and equality booleans between adjacent boundaries;
- exact mutation classification when mechanically identifiable
  (`leading-trim`, `trailing-trim`, `line-ending`, `normalization`,
  `fence/prefix`, `escape-change`, `truncation`, or `other`); and
- call-start/call-complete sequence numbers and checkpoint durability state.

Synthetic copied text may be retained in a private test artifact because it is
the evidence under test. Credentials, user content, PDF Base64, and provider
tokens remain prohibited from that artifact.

## 8. Offline harness and deterministic gates

No credential lookup or provider work is reachable until all offline gates
pass.

### 8.1 Comparator negative controls

The exact comparator is tested with one true-equality case and deliberate
single mutations for:

- leading/trailing deletion and insertion;
- one changed repeated-space count;
- LF/CRLF/CR conversion;
- literal escape versus decoded control;
- NFC/NFD conversion and combining-mark reordering;
- dropped ZWJ, variation selector, tag, ZWNJ, or bidi control;
- added Markdown fence, language label, quote, or explanatory prefix/suffix;
- JSON/HTML escape or entity conversion;
- mid-scalar UTF-8 truncation and ordinary suffix truncation; and
- duplicate, omitted, or reordered response parts.

Every mutation must produce the expected first byte/scalar offset and bounded
context. Diagnostic classification may be unknown, but exact inequality may
never be unknown.

### 8.2 Source, renderer, and coverage gates

For every locked fixture and mode:

1. decode and verify manifest bytes;
2. encode the production canonical PageFold JSONL;
3. render with the production serializer/layout/font identities;
4. independently extract every `ActualText` span through PDF.js;
5. prove extraction equals canonical JSONL bytes;
6. locate the exact target content and page/span boundaries independently; and
7. emit a complete coverage report for all manifest obligations.

First/middle/last hashes, counts, and coverage are checked across the complete
fixture list; a partial dry-run cannot authorize paid work.

### 8.3 Response-path differential gates

Fake-provider fixtures exercise the reference decoder and every production
consumer before paid work:

- non-stream JSON with one and multiple candidate text parts;
- thought parts interleaved with visible text;
- SSE events split at every relevant JSON, escape, CRLF, and multibyte UTF-8
  boundary;
- live stream pump, decoupled-stream collector, and trailing flush;
- BG streaming-journal and non-streaming-journal recovery;
- request after-replacers, escape option, banned-character/blank handling,
  incomplete-response trimming, edit-output scripts, triggers, inlays, and
  continuation behavior; and
- persistence, reload, and any advertised raw copy/export sink.

The full locked synthetic response corpus is replayed through every in-scope
deterministic consumer. Network chunking must not change assembled text.

The current unconditional `trim()` observation keeps the product-copy gate
closed for edge-whitespace fixtures. A later dedicated copy operation must
first make this offline gate pass without changing ordinary chat snapshots. No
provider rerun is used to diagnose a deterministic application mutation.

### 8.4 Paid-runner safety gate

The paid runner remains unreachable by default. Tests prove:

- an explicit paid flag, exact profile/manifest identity, durable checkpoint,
  and approved cost ceiling are all mandatory;
- missing or mismatched activation data fails before fixture materialization,
  credentials, or network;
- a mode-`0600` exclusive checkpoint is created and fsynced before fixture
  materialization or credential access;
- `call-start` is fsynced before each physical call and `call-complete` before
  another call;
- failed start persistence causes zero calls and failed completion persistence
  permits no next call;
- no automatic retry, fallback, resolution/model switch, or prompt mutation is
  possible; and
- fake responses containing credentials, PDF bytes, or prohibited result keys
  are rejected before summary persistence.

## 9. Staged provider and product execution

Stages are named `V0–V6` so they are not confused with structural-oracle
`L0–L4` or release gates.

| Stage | Work | Exit |
| --- | --- | --- |
| `V0 scope freeze` | record the no-call scope choices in section 4 and authorize only offline harness work | the bounded workflow/profile/fixture/privacy contract is fixed |
| `V1 offline` | run section 8 in a materialized exact target and expand the exact cell/call/cost manifest with no provider access | all offline gates pass and the paid activation record is ready for a separate decision |
| `V2 response control` | after paid activation, run direct-literal micro controls and one canonical-text harness sentinel | the response generator/reference decoder can emit and compare the locked byte classes |
| `V3 paired screen` | through the selected admission caller, interleave canonical-text and PDF repeat 1 for every required cell | all paired first observations are exact under one profile |
| `V4 repeat qualification` | through the same caller, add fresh interleaved observations until every cell reaches the approved repeat count | every text/PDF cell passes every repeat; no majority rule |
| `V5 integrated surface` | resolve all remaining parser/stream/BG/persistence/export boundaries from the qualified records, complete corpus replays, and bounded real wiring cells | provider and each claimed product sink are separately resolved |
| `V6 physical/product gate` | validate the explicit user workflow on iPhone and mechanically read back the persisted/exported bytes where possible | user-visible trigger works and automatic byte evidence still passes |

### 9.1 Execution ordering

- Cell order is deterministically randomized from the manifest hash and recorded
  before outputs are visible.
- Text and PDF partners stay close enough to limit model/version drift but
  alternate which carrier runs first across counterfactual twins.
- A request-profile change or provider-resolved model change stops the block
  and starts a new evidence identity; results are never pooled.
- Qualification mode stops on the first definitive required-cell failure.
- A separately approved research mode may continue only through its frozen
  diagnostic cell budget; it can explain a failure but cannot produce support.
- A failed/inconclusive result never automatically selects medium, AI Studio,
  another model, a larger output budget, a different response schema, or a
  revised prompt.

### 9.2 Production-call authority

Provider-only research may select a direct paid runner as the `V3–V4` caller.
Product qualification must select the production adapter/final-request builder
as that caller so a direct-harness pass cannot bypass ModelPreset
configuration, streaming, or parser behavior. `V5` does not duplicate a
qualified matrix merely to rename it; it closes downstream deterministic sinks
from the captured records and adds real calls only where the paid activation
lists a distinct provider response mode or bounded wiring cell.

Provider response modes are separate:

- a non-stream support profile runs the full matrix non-streaming;
- a stream support profile runs the full matrix through the provider streaming
  endpoint; and
- decoupled streaming, live stream display, and BG recovery replay the complete
  captured synthetic stream corpus offline, then receive at least one real
  bounded end-to-end wiring cell and their physical scenario before being
  named as product sinks.

The offline replay proves deterministic chunk/consumer fidelity; it does not
replace the provider stream matrix.

## 10. Repeats, stopping, cost, and resume

### 10.1 Repeat contract

The first qualification proposal uses three total observations per required
text/PDF cell, with the screening observation counting as repeat 1. Every cell
must be 3/3. This is a bounded qualification observation, not a guarantee of
future model determinism.

If the intended product wording implies a stronger reliability target, `V0`
must instead predeclare the target success probability, confidence rule, and
resulting repeat count. A higher repeat count cannot be selected after viewing
failures, and aggregate success across easy cells cannot substitute for a
required cell's repeats.

### 10.2 Stop classification

- Any exact mismatch is a definitive failure for that profile.
- `MAX_TOKENS` or an equivalent truncation finish is
  `inconclusive-output-cap`, not a failed or successful copy.
- HTTP/auth/quota/network/checkpoint failure is
  `inconclusive-infrastructure` and receives no automatic retry.
- A benign fixture safety block keeps general support unqualified.
- A revised prompt, payload limit, output budget, response mode, or comparator
  creates a new version; it never rewrites the prior result.
- Historical failed and inconclusive artifacts remain frozen.

### 10.3 Call and cost bound

Before `V0` approval, the runner emits the exact expanded call list and checks:

~~~text
maximum calls
  = fixed literal/response controls
  + sum over claimed profiles(
      required locked cells * 2 carriers * approved repeats
    )
  + separately approved diagnostic cells
~~~

The cost reserve rates every remaining call using the selected provider/model/
billing authority and the frozen input/output reserve. It reports the source
and effective date rather than inheriting the structural-v8 price. The runner
refuses a missing, stale, or user-unapproved ceiling and checks remaining rated
cost before each call.

### 10.4 Resume

Resume requires an exact match on profile, manifest, copy directive, request
configuration, comparator, application build, planned cell order, call count,
and cost authority. Completed records are restored without replay. An unmatched
`call-start` without a durable `call-complete` stops for manual classification;
it is never silently retried. A checkpoint from another oracle/profile version
cannot resume.

## 11. Durable evidence and privacy

Each physical call has one bounded record containing:

- logical/physical cell id, carrier, mode, surface, repeat, and sequence;
- all non-secret identity fields from section 5.3;
- expected/canonical/PDF/extraction hashes and page/span metadata;
- start/completion lifecycle, HTTP/finish, latency, usage, rated cost, and
  cumulative cost;
- expected, independent-candidate, production-parser, assembled, persisted,
  reload, and export byte counts/hashes/equality;
- source/response normalization and whitespace summaries;
- first differing byte/scalar and bounded Base64/code-point context; and
- stop status and mechanically derived failure class.

Private mode-`0600` artifacts may retain complete synthetic source/response
bytes and sanitized raw envelopes because those bytes are the evidence under
test. The committed receipt retains fixture ids, hashes, bounded differences,
coverage, counts, and aggregate observations only.

No artifact or stdout/stderr output may retain:

- provider credentials, service-account fields, API/bearer tokens, or
  secret-derived hashes;
- private user/chat content or identifiers;
- provider request bodies, PDF Base64, font bytes, or raw authorization/query
  values; or
- unrelated request-log rows.

Temporary request-log integration uses a temporary database. It proves PDF and
credential redaction while retaining content-free model/usage metadata. A live
physical scenario does not automatically delete its chat or logs; user-data
cleanup remains a separate explicit decision.

Coverage validation checks the first, middle, and last record, total counts,
manifest/result hashes, every required feature/boundary/profile/repeat key, and
duplicate/missing cells. A truncated summary or sampled subset cannot support
admission.

## 12. Admission rule and allowed claims

- A provider/resolution/mode may claim **verbatim copy support** only when every
  required cell passes all repeats byte-for-byte.
- Majority success is not sufficient.
- A truncation is an output-budget/harness result, not a copy-fidelity result.
- A structural-recognition pass cannot be promoted to verbatim-copy support.
- A verbatim-copy failure does not retroactively invalidate contextual PageFold
  support unless the advertised workflow requires exact reproduction.

Provider-copy admission additionally requires:

- exact direct-literal and canonical-text controls;
- exact PDF candidates for the same locked cells;
- complete finish, request-profile parity, usage, checkpoint, and coverage
  evidence;
- a named provider/model/endpoint/resolution/mode/response profile and copied
  byte limit; and
- no unclassified or inconclusive required cell.

Product-copy admission additionally requires:

- provider-copy admission for the same provider response mode;
- exact production parser and request-loop/stream assembly;
- exact persisted and reloaded message bytes;
- exact clipboard/export bytes if that action is advertised;
- all in-scope deterministic consumers to pass the complete offline corpus;
- ordinary PageFold-off/chat/output-script behavior to remain unchanged; and
- the concrete physical L3 workflow to pass after automatic byte evidence.

Partial diagnostic success may be reported factually by cell, but it cannot be
shortened into a general support badge. A narrower future claim, such as an
ASCII-only or internal provider-only profile, requires its own explicit product
scope and complete matrix; it is not inferred from failures in this plan.

## 13. Executed implementation and delivery sequence

1. The frozen manifest, comparator, coverage checker, and offline negative
   controls were committed without runtime PageFold changes.
2. Exact-live-source parser, live/decoupled stream, BG journal, persistence,
   reload, and copy-path differentials ran against the locked corpus.
3. The paid profile, call count, USD 1.00 hard cap, privacy boundary, and
   fail-fast policy were frozen before credential access.
4. The gated runner's disabled, checkpoint, secret-exclusion, and cumulative
   cost controls passed fake-provider tests.
5. Response-control v1 froze its same-turn part-boundary failure. Protocol v2
   removed that harness ambiguity and observed a genuine trailing-LF copy
   failure. Fail-fast correctly left later text/PDF provider cells unexecuted.
6. Product support was not chosen: the existing final sink independently failed
   exact edge preservation, and no runtime bypass was introduced.
7. Patcher 47/47, exact-live-source target-path 8/8, remote ref readback, and
   GitHub `patch-integrity` run `32940566589` passed.
8. The sanitized receipt records offline/provider/product evidence, call/cost
   totals, artifact hashes, privacy sweeps, and the final negative decisions.
9. No product implementation candidate existed, so no device L3 or stable
   release/version change was claimed.
10. README disclosure now states that PageFold supports context understanding,
    not byte-exact code/whitespace/Unicode reproduction.

## 14. Product disclosure after negative qualification

PageFold may be used for its admitted PDF-based context-understanding and cost-
reduction workflow. **Verbatim copy is not supported.** Users must not rely on
model output for byte-exact code, whitespace, line endings, Unicode sequences,
or source-document reproduction. The negative verbatim result does not weaken
the separate structural/context support evidence.

A future exact-copy proposal must use a new versioned profile and pass every
required gate. Reference-based application insertion may be investigated as a
separate design, but full extracted text must not be re-injected into the model
in a way that defeats PageFold's cost-reduction purpose.
