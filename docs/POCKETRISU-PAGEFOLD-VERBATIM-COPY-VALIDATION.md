# PageFold verbatim-copy validation receipt

> **Status:** V0/V1 and deterministic V5 surfaces observed; general support is
> unqualified; V2-V4 external provider research has not run
>
> **Date:** 2026-08-26 KST
>
> **Plan authority:**
> `docs/POCKETRISU-PAGEFOLD-VERBATIM-COPY-FOLLOWUP.md`

## Objective

Determine, under one frozen provider/model/PageFold profile, whether the
selected canonical message `content` is reproduced byte-for-byte as UTF-8, and
whether that result is preserved through PocketRisu parsing, streaming,
postprocessing, persistence, reload, and plain-text copy.

The frozen first profile is:

- Vertex global `gemini-3.7-flash`;
- PageFold low / maximum;
- streaming provider response;
- temperature `0`;
- thinking level `low` with thoughts excluded;
- no forced response MIME or schema;
- copied content up to 4,096 UTF-8 bytes;
- three observations per text/PDF cell;
- no retry, fallback, route/model/resolution switch, or prompt mutation; and
- cumulative rated-cost hard cap USD 1.00.

## Implemented evidence harness

- `research/pagefold-verbatim/manifest-v1.cjs` — frozen synthetic payloads,
  profile, required feature tags, and manifest hash.
- `research/pagefold-verbatim/qualification.cjs` — strict UTF-8 comparator,
  coverage, production render/PDF.js extraction, boundary placement, and
  62-call full qualification manifest.
- `research/pagefold-verbatim/paid-runner.cjs` — separately gated eight-call
  bounded research continuation, durable checkpoints, fail-fast result
  classification, and USD 1.00 hard cap.
- `research/pagefold-verbatim/target-path.test.ts` — production Gemini parser,
  stream pump, decoupled collector, BG journal, Risu save/reload, and copy sink
  differential checks.
- `test/pagefold-verbatim.test.cjs` — manifest, comparator, call-plan,
  paid-gate, checkpoint, request-shape, SSE, and cap controls.

Final manifest SHA-256:
`b2043f07299fd6227bf01ea0b2c23f32094483d6e3e91da9dd315de3f2d00864`.

Private sanitized offline evidence:
`.code-review/pagefold-verbatim-v1-offline.20260826.json`, mode `0600`,
29,160 bytes, SHA-256
`17d7a4e54d0caaf10cc98e8470fb65c3d9f74315bfd739b3b4dd9dc165246b6d`.

## V1 fixture and comparator observations

- 14 locked fixtures, ten provider-eligible fixtures, and all 20 required
  content/boundary tags were present.
- Exact equality plus seven deliberate mutation classes were detected:
  edge trim, line-ending conversion, normalization, fence/prefix,
  truncation, escape change, and other difference.
- A malformed surrogate was rejected before UTF-8 equality.
- The local 4,097-byte cell was rejected beyond the 4,096-byte profile limit.
- The full provider plan expanded deterministically to 62 calls
  (two controls plus ten fixtures × two carriers × three observations).

No credential, Service Account field, API/bearer key, PDF Base64,
`inlineData` body, or private content was retained in the offline evidence.

## Exact transport and physical placement

All ten transportable documents satisfied:

- canonical serializer round trip;
- production PDF renderer completion;
- independent PDF.js `ActualText` equality;
- expected page count; and
- exact target record placement.

| Fixture | Target sourceIndex | Pages | Placement observation |
| --- | ---: | ---: | --- |
| atomic A/B | 1 | 1 | 13 target spans on page 1 |
| wrap | 1 | 1 | 20 spans within page 1 |
| column | 355 | 2 | page 1 column 0 → column 1 |
| page | 1425 | 2 | page 1 → page 2 |
| position-start | 5 | 8 | page 1 |
| position-middle | 4998 | 8 | page 4 |
| position-end | 10190 | 8 | page 8 |
| minimum | 1 | 1 | one target span |
| 4,096-byte limit | 1 | 1 | 30 target spans |

Three required content cells failed before provider work:

| Fixture | Required content | Observed result |
| --- | --- | --- |
| `nnbsp-transport` | U+202F NARROW NO-BREAK SPACE | `PDF_GLYPH_UNSUPPORTED` |
| `rtl-transport` | Arabic and Hebrew samples | `PDF_GLYPH_UNSUPPORTED` |
| `combining-ring-transport` | decomposed A + U+030A | `PDF_GLYPH_UNSUPPORTED` |

These are `transport-fail` results under the frozen renderer/font profile. They
are not provider-copy failures, and they block general verbatim-copy admission
without changing the existing structural-context support decision.

## Production response and storage paths

An application-only copy of the exact live source used the existing dev
dependency graph and no user data. The focused Vitest result was 1 file / 8
tests passed.

For all ten transportable payloads:

- Gemini non-stream response parsing preserved visible non-thought parts;
- streaming delta parsing preserved every scalar;
- the live stream pump preserved the final cumulative text;
- the decoupled stream collector preserved the last cumulative snapshot;
- BG streaming and non-streaming journal decoders preserved exact text; and
- Risu save encode/decode preserved the stored message string.

## Product sink result

Current `src/ts/process/index.svelte.ts` applies `data.trim()` through
`reformatContent` before both streaming and non-streaming assistant storage.
Current `Chat.svelte` derives `msgDisplay` through `risuChatParser` and uses it
as the plain-text clipboard source.

The locked `atomic-a` payload observed:

- expected: 1,516 UTF-8 bytes,
  SHA-256
  `80ec67e2291691e4022d926201d076d317f86d4540d776f65ac0ed4c1e5b8dcf`;
- after the current postprocess: 1,512 bytes,
  SHA-256
  `049538a5a548f74a18c24908f43066a34ff5c8c2bb613fc586c2cf8b37a6cc4b`;
- first differing byte/scalar offset: 0; and
- classification: `edge-trim`.

Save/reload preserves the already-trimmed value. The clipboard path has no
retained edge-count metadata from which the four removed bytes can be
reconstructed. Therefore product-copy support is definitively **failed** for
leading/trailing whitespace in the current implementation.

Ordinary chat trimming was not changed or bypassed by this validation.

## Paid provider state

The bounded research continuation is fixed to:

1. one non-stream direct-literal minimum control;
2. one non-stream canonical-text minimum control; and
3. atomic-A text/PDF streaming pairs for repeats 1-3.

Maximum calls are eight; general support remains false even if all eight pass
because the required transport cells above already failed.

The external call was submitted with the explicit paid/research flags and USD
1.00 cap, but the runtime reviewer rejected it before process creation because
the user-visible conversation did not directly authorize use of the configured
private Service Account against Vertex and the potential charge. Therefore:

- provider calls: 0;
- rated cost: USD 0;
- OAuth/token exchange: 0;
- checkpoint/result files: absent; and
- provider-copy result: not yet observed.

The rejected action was not retried or routed through another mechanism.

## Current decision

- **General PageFold verbatim-copy support:** unqualified due three required
  transport failures.
- **Provider-copy for the transportable atomic payload:** not yet observed.
- **Production parser/stream/BG/save preservation:** exact for all ten
  transportable synthetic payloads.
- **Final product postprocess/save/reload/plain-copy preservation:** failed at
  unconditional edge trimming.
- **Existing PageFold structural/context support:** unchanged.
