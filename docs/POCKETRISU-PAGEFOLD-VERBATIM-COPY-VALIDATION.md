# PageFold verbatim-copy validation receipt

> **Status:** validation complete with negative provider/product decisions;
> general verbatim-copy support is unqualified
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

The JSON test receipt is
`.code-review/pagefold-verbatim-target-path.20260826.json`, mode `0600`,
3 suites / 8 tests passed / 0 failed, SHA-256
`508f4576545507d4ec99641a1b7fbf7eeec622992995659cdd386ed59b95ddba`.

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

After direct user approval, the bounded research continuation used the unique
enabled PageFold maximum/global/`gemini-3.7-flash` preset's configured private
Service Account. No credential value or secret-derived identifier entered an
artifact.

### Response-control v1 — frozen harness failure

The first non-stream call returned `HTTP 200 / STOP`. Its expected payload was
the three UTF-8 bytes for `각`, while the 122-byte response was exactly the
target followed by the 119-byte second text-part instruction:

- expected SHA-256:
  `45ec909f30174e6585c67833638ece2b73752a2e17b142f2071d058792f16c89`;
- observed SHA-256:
  `42ecf5c81f74fefd49438229ec9acdd3183d4ed927eb4ef459e6e92243f18300`;
- target + instruction SHA-256: the same observed hash; and
- rated cost: USD 0.000144.

This froze a real failed v1 result but isolated a harness boundary: adjacent
Gemini text parts were perceived as one continuous copy source. It was not
promoted to a model-copy verdict.

### Response-control v2 — provider-copy failure

Protocol v2 retained v1 as prior evidence, used one text part with explicit
ASCII source markers, and counted the prior call/cost against the same approved
maximum of eight calls and USD 1.00 hard cap.

The next non-stream call returned `HTTP 200 / STOP`:

- expected: `각`, 3 UTF-8 bytes;
- observed: `각` followed by LF, 4 UTF-8 bytes;
- first differing byte/scalar offset: 3;
- classification: `fence/prefix`;
- expected SHA-256:
  `45ec909f30174e6585c67833638ece2b73752a2e17b142f2071d058792f16c89`;
- observed SHA-256:
  `e0a66ffafb57df6576fd5c0e089beb9a32437446bc696e5d4d122d2482629360`;
- prompt/output/thought/total tokens: 104 / 119 / 117 / 223; and
- call cost: USD 0.00052425.

This result contains neither marker nor instruction text. The provider response
generator added a trailing LF to the selected content, so the frozen profile's
direct literal control is not byte-exact. V2 fail-fast stopped canonical-text
and PDF calls; they remain not run rather than inferred.

Final external totals:

- calls: 2 / 8 maximum;
- cumulative rated cost: USD 0.00066825 / USD 1.00 hard cap;
- retry, fallback, alternate route/model/resolution, and automatic prompt
  mutation: zero; and
- canonical-text/PDF provider calls after V2 failure: zero.

Private mode-`0600` artifacts:

- v1 checkpoint/result SHA-256:
  `02923b3d9fe0f6ab3bed1d14d95eb19e9fb8dd14b61ebb62ded9e5eb16fb898d` /
  `90e42319700aec748feba8a08e0ff520eebaab6d2cca526ce85653f646331547`;
- v2 checkpoint/result SHA-256:
  `e88eb3a20de5eb920f61858c2fcd227a9778de82d0f81116c906f6aa2a908458` /
  `57ed5e8a1e6e49897686d4d6e9922c39102c8a3c75a095ffa4ba63282af3f985`.

All four artifacts had zero private-key, client-email, access-token,
authorization, PDF Base64/`inlineData`, or API-key-shape hits.

The target provider module also initialized `save/logs.db` relative to the
runner's then-current patcher working directory. Read-only inspection found the
`logs` and `sqlite_sequence` tables both at zero rows. The generated directory
was not deleted; it was moved recoverably to
`/tmp/pagefold-verbatim-runner-empty-save.20260826` and remained outside git.
The final runner now requires an explicit empty mode-`0700` runtime scratch cwd
before loading target provider modules, preventing future source-worktree
artifacts.

## Current decision

- **General PageFold verbatim-copy support:** unqualified due three required
  transport failures.
- **Provider-copy under the frozen profile:** failed at V2 because the provider
  added one trailing LF to a one-scalar source.
- **Production parser/stream/BG/save preservation:** exact for all ten
  transportable synthetic payloads.
- **Final product postprocess/save/reload/plain-copy preservation:** failed at
  unconditional edge trimming.
- **Canonical-text/PDF provider matrix:** correctly not run after the required
  response control failed; no claim is inferred from the skipped cells.
- **Existing PageFold structural/context support:** unchanged.

## Completion audit against the objective

| Required objective surface | Authoritative evidence | Decision |
| --- | --- | --- |
| frozen provider/model/PageFold identity | manifest/profile hash and paid body-shape records | observed |
| designated `content` UTF-8 authority | committed Base64 payload, byte count, scalar count, SHA-256 | observed |
| canonical serializer and PDF transport | ten exact PDF.js extractions plus three named transport failures | mixed; general support fails |
| provider response bytes | Vertex v2 `HTTP 200 / STOP`, expected/observed byte hashes and offset | failed: trailing LF |
| non-stream parser | exact-live-source Vitest corpus | exact for ten transportable payloads |
| streaming parser/pump/collector | exact-live-source Vitest corpus | exact for ten transportable payloads |
| BG streaming/non-stream journal | exact-live-source Vitest corpus | exact for ten transportable payloads |
| postprocessing | unconditional production `reformatContent.trim()` plus byte differential | failed: edge trim |
| persistence and reload | production Risu save encode/decode corpus | preserves its input exactly, including the already-trimmed value |
| plain-text copy | production `msgDisplay` → clipboard dataflow after irreversible trim | failed relative to original content |
| paid-call and cost boundary | two paired checkpoints/results, usage and rated-cost records | 2/8 calls, USD 0.00066825/1.00 |
| privacy | offline/paid/target receipts swept for credential and PDF payload shapes | zero hits |

The requested objective is therefore resolved as a **negative capability
decision**, not a successful support admission: under the frozen profile the
provider already fails the prerequisite literal-copy control, and the current
PocketRisu final sink independently removes edge whitespace. No unexecuted PDF
provider cell is used to strengthen or weaken those observed failures.
