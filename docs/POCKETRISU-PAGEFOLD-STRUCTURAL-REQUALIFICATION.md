# PageFold structural-oracle requalification

> **Status:** L1 stopped on failed text oracle; L2-L4 not run; no route qualified
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

## Structural oracle

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

- structural L0 focused test: 1 file / 8 tests passed;
- structural paid-runner and legacy provider focused tests after the L1
  preservation fix: 2 files / 19 tests passed;
- checkpoint write failure control: one fake-provider cell completed and a
  second cell was not started;
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

## Paid L1 observation

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
- fsyncs one sanitized record before another provider call can begin; and
- fails closed before the next call if checkpoint persistence fails.

These controls were validated only with fake-provider observations after the
actual L1 stop. They do not recover or reinterpret the lost per-field L1 data.

### Request-log observation

The paid harness used its direct HTTPS path and did not add a PocketRisu
`request-logs.db` row. A read-only query from a cutoff preceding the run found
zero new rows and therefore zero delta hits for PDF MIME/Base64 indicators,
the canonical transcript marker, API-key shapes, bearer/access-token shapes,
or private-key markers.

The whole existing database was not globally clean for every historical
secret shape: it contained ten API-key-shape hits, all predating the cutoff.
They were pre-existing and were neither deleted nor attributed to PageFold.
Across the whole database, PDF, canonical marker, bearer/access-token, and
private-key hit counts were zero at this observation point.

## Next gate

No Vertex resolution is support-qualified. Under the integration authority,
adapter/UI/BG composition, catalog admission, candidate live apply, and stable
release remain closed. Another provider call would be a new experiment: it
requires a revised diagnostic design that accounts for the missing L1
field-level evidence and separate explicit paid-call approval. Independent PDF
extraction cannot substitute for the failed model-recognition gate.
