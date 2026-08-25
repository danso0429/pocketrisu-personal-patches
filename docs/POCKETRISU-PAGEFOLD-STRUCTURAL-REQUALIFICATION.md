# PageFold structural-oracle requalification

> **Status:** L0 local gate complete; paid execution disabled
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

`server/node/pageFoldStructuralRequalification.cjs` is deliberately incapable
of provider work. Running it without `PAGEFOLD_REQUAL_DRY_RUN=1` exits before
font loading, credential access, or network work. The future paid runner must
be separately reviewed and enabled after approval.

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

Observed synthetic answers in a future paid run are retained only through the
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
- paid-disabled CLI control: exited with code 2 before fixture/provider work;
- dry-run: four fixtures completed, paid execution remained false;
- canonical server validation: maximum and balanced forms accepted;
- output-control classification: 512 `MAX_TOKENS` -> one 1024 control;
  1024 `MAX_TOKENS` -> no further control;
- unknown synthetic answer fields: removed from retained observation;
- dry public output: no PDF bytes.

## Next gate

No new provider call is authorized by L0. Before L1, the future paid runner must
reuse these frozen fixtures and oracles, pass the same focused tests and secret
sweep, and receive explicit approval for the conditional Vertex sequence with
the `USD 0.25` ceiling.
