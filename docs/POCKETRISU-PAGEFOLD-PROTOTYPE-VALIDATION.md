# PageFold ModelPreset prototype validation receipt

> **Status:** renderer prototype gate complete through independent PDF extraction;
> paid provider feasibility not run and not approved yet
>
> **Date:** 2026-08-25 KST
>
> **Target:** exact PocketRisu `1.10.0`; patcher base `v0.2.0` (`de1fa40`)
>
> **Feature branch:** `codex/pocketrisu-pagefold-integration`

## Boundary

This receipt covers only the pre-provider prototype required by
`docs/POCKETRISU-PAGEFOLD-INTEGRATION-PLAN.md` sections 19.1, 19.2, and 20.1:

1. behavioral-reference provenance;
2. deterministic canonical JSONL;
3. immutable font cache;
4. server-owned tagged-PDF rendering;
5. independent PDF.js extraction; and
6. target memory/latency observations used to set renderer ceilings.

No paid model request, adapter PDF wire, preset/UI change, Service Account
import, BG composition, catalog registration, installer generation, live apply,
tag, or release was performed. AI Studio, Vertex, and OpenRouter support remain
unqualified until the separately approved feasibility matrix is recorded.

## Source and provenance

The supplied PageFold artifact was re-hashed before implementation:

- version: `0.1.1`;
- SHA-256:
  `8291b14f7330e8e4fa0438ea12d1e8f125073945d817fe74693fe9030891ef77`;
- classification: behavioral reference / independent implementation;
- identified upstream author/repository/license: none in the supplied header;
- redistributed artifact, PageFold-owned source text, or bundled vendor source:
  none.

`docs/SOURCE-PROVENANCE.md` and `THIRD_PARTY_NOTICES.md` record the boundary and
the independently selected package/font sources. An exact-line comparison of
the new serializer against the supplied artifact found zero identical source
lines of 60 or more characters. This is a narrow source-text check, not a claim
that similarity analysis can prove authorship.

## Prototype ownership

The manifest exists at `patches/pagefold-model-preset/manifest.cjs` but remains
outside `src/catalog.cjs` with `allDefault: false`, target state `reviewing`, and
no distributed selector. It currently owns 21 exact-1.10 units over 11 outputs:

- `src/ts/pagefold/canonicalTranscript.ts` and its focused test;
- `server/node/pageFoldFontCache.cjs` and its focused test;
- `server/node/pageFoldPdfWorker.cjs`;
- `server/node/pageFoldPdfService.cjs`;
- `server/node/pageFoldPdfReader.cjs`;
- the renderer focused test and measurement harness; and
- exact package/lock units for `pdf-lib 1.17.1` and
  `@pdf-lib/fontkit 1.1.1`.

The dependency graph composes against the current exact target with 21 units,
11 outputs, and zero collisions. Its `package.json` and `pnpm-lock.yaml` outputs
are byte-identical to an isolated `pnpm add --save-exact --lockfile-only` result.
A frozen install reused the exact target lockfile, installed the six added
package nodes, and left the lockfile unchanged.

Because the prototype manifest is not in `src/catalog.cjs`, rebuilding the two
stable installers retained their existing 7,277,704-byte content and SHA-256
`1b416a066894a0052005a4f3a1aaad3fc808b88302b0295dfd7b58d7d23db94c`.
The build restored both filesystem modes to the tracked `0755`; no dist path is
dirty and no PageFold unit is embedded in either artifact.

## Canonical JSONL

The serializer consumes only the final `AdapterChatMessage[]` transform input.
It does not read database state, credentials, `OpenAIChat[]`, or an earlier
prompt snapshot. Fixed-order encoders and a strict re-parser enforce:

- exact header/message property order;
- contiguous output indices and original source indices;
- maximum versus balanced projection;
- one LF between records and one final LF;
- distinct LF/CRLF/CR and literal backslash sequences;
- uppercase escapes for lone surrogates and selected controls/formats;
- exact UTF-8 without BOM variants;
- empty attachment arrays; and
- explicit rejection of image, tool-call, reasoning, and provider-echo metadata
  that version 1 cannot encode losslessly.

Balanced mode returns retained system rows with their source indices. It does
not combine them itself; the later provider adapter must apply its existing
system-message rule. An inactive `cachePoint` marker does not become transcript
content; the later compatibility gate independently blocks enabled explicit
caching and the transform cache identity includes the complete final messages.

Observed focused results:

| Runtime | Test files | Tests | Result |
| --- | ---: | ---: | --- |
| happy-dom/browser condition | 1 | 18 | passed |
| Node condition | 1 | 18 | passed |

The matrix included system/user/assistant/tool, interleaved systems, empty
content, whitespace, Korean/Han/Hiragana/Katakana/Latin/combining marks, ZWJ,
variation selectors, tag characters, bidi/control characters, lone surrogates,
fake complete JSONL records inside content, invalid counts/indices/types,
invalid UTF-8/BOM, 64 repeated deterministic encodes, and a 200,000-character
no-whitespace record.

## Font cache

The renderer does not use the artifact's mutable jsDelivr URLs. It pins one
Google Fonts revision and verifies decoded bytes before atomic installation:

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| Noto Sans KR variable TTF | 10,414,588 | `194018e6b2b293a7964f037b25c0249ce1418bc9ab3c971060a03aa57861e252` |
| Noto Sans KR OFL | 4,388 | `1c05c68c34f9708415aada51f17e1b0092d2cea709bf4a94cd38114f9e73d7d9` |
| Noto Emoji variable TTF | 1,982,596 | `de6c18832938afc99caf132b39d6a30a19bac7f2e812e28db2535b4608d27551` |
| Noto Emoji OFL | 4,330 | `500bb1ccf43df7bbb522112f9133a52b16e1c35e809632f5d8609b179152de5b` |

The first real empty-cache download exposed that a compressed HTTP response's
wire `Content-Length` differs from fetch's decoded bytes. The implementation
now pre-compares length only for identity encoding and always applies exact
decoded length, format magic, and SHA-256 checks before rename.

Observed font-cache focused results: 1 file / 8 tests passed. They covered
singleflight, disk reuse, mode `0600`, corruption repair, same-length hash
substitution, identity length rejection, compressed-length handling,
interrupted streams, temporary-file cleanup, shared/lone abort, and hostile
spec paths/URLs. A separate production-spec empty-cache run downloaded and
verified all four assets with their exact expected sizes and retained both OFL
texts.

The originally observed Noto CJK OTF was not selected: an isolated pdf-lib
subset produced a PDF.js font-subtype warning. The pinned Noto Sans KR TTF has
the required Latin, Korean, Han, Hiragana, Katakana, and combining-mark coverage
and produced zero PDF.js warnings. Noto Emoji supplies the separately missing
emoji/symbol code points. Unsupported graphemes fail explicitly; there is no
system-font fallback.

## Tagged PDF and independent extraction

Rendering runs in a worker thread. The main service owns validation,
singleflight, concurrency/queue bounds, TTL/byte-bounded PDF cache, timeout, and
abort. Terminating the worker stops layout or pdf-lib save work, so an aborted
caller cannot leave a PDF cache success behind.

The worker uses deterministic metadata, fixed font/resource names, fixed layout,
and one tagged `Span` per visual line. Every span carries:

- an `MCID` in the page marked-content stream;
- the exact logical chunk in `/ActualText`; and
- a matching structure-tree element and parent-tree entry.

This matters because ordinary PDF.js `getTextContent()` drops leading/trailing
spaces. The independent reader instead validates structure/MCID order and reads
the structure tree's `ActualText`, while separately checking the visible glyph
order with whitespace removed. It never accepts visual text heuristics as the
canonical extraction result.

Observed renderer focused results with the production pinned fonts:

| Suite | Test files | Tests | Result |
| --- | ---: | ---: | --- |
| canonical server differential + tagged renderer | 1 | 16 | passed |

Coverage included exact extraction of the full character/control matrix,
header-only empty input, whitespace across visual wraps, separate-worker byte
determinism, single-column/four-column multi-page order,
singleflight/TTL/cache bounds, abort before fonts and during worker layout/save,
balanced source-index gaps, one-worker/no-queue overload admission, explicit
unsupported-glyph failure, and source/page/span/PDF-byte ceiling enforcement.

## Exact-target renderer observations

The fixed four-column layout yielded 357 lines per column and 1,428 lines per
page. Each case used first/middle/last checks for all four columns on the full
one-page case, exact whole-document extraction for every case, and separate
visible-order checks. PDF.js warnings were captured as failures; observed count
was zero in every case.

| Pages | Canonical messages | Source bytes | PDF bytes | Spans | Render ms | Worker sampled RSS high | Worker sampled heap high | Worker sampled external high | PDF SHA-256 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 1,427 | 179,841 | 958,035 | 1,428 | 17,928.811 | 297,373,696 | 104,969,976 | 30,130,075 | `a91372ab732bb1f0b2025d78153b62bd7d6c311fa66ce6ce3425240660fcbb2f` |
| 2 | 1,428 | 179,971 | 959,529 | 1,429 | 18,052.639 | 359,006,208 | 93,841,584 | 30,416,718 | `00e7f1ad376189cdb4b876379802ce297734a5ff0834bbceeee69f41eef66650` |
| 4 | 4,284 | 544,111 | 2,901,742 | 4,285 | 52,113.732 | 438,153,216 | 155,269,848 | 39,839,160 | `ce384acc15c9c41731f397191d9bac66c268570088304e4921d9aa56fe4266c7` |
| 8 | 9,996 | 1,272,391 | 6,781,118 | 9,997 | 107,578.481 | 580,354,048 | 243,401,400 | 47,202,156 | `300773d7d0f786b42ef2ccee90f8a64f934a9099f28ca66bf212727bb52bac5f` |

Worker memory was sampled after font read, font embed, layout, and save. These
are phase-sampled high-water observations, not a continuous profiler's exact
process peak.

These are observed synthetic record-heavy cases on the target server, not
provider latency forecasts. Based on them, first admission is bounded to:

- source bytes: 2 MiB;
- pages: 8;
- PDF bytes: 16 MiB;
- tagged spans: 12,000;
- concurrent render workers: 1;
- queued renders: 2;
- worker old-generation limit: 512 MiB;
- render timeout: 180,000 ms; and
- in-memory PDF cache: 2 entries / 16 MiB / 5 minutes.

The limit is a renderer/runtime safety authority. It does not rewrite
`preset.maxContext`, the source assembly budget, or the later provider wire
context limit.

## Verification caveat retained

A standalone `tsc` invocation against one new file but without PocketRisu's
normal global declarations/assets traversed existing target modules and failed
on their missing harness globals/assets. That command is not recorded as a
pass or as a new-code failure.

The ambiguity was then closed on a user-data-free application copy of the
current exact-1.10 stable graph. The prototype's 21 units applied with zero
collisions. Frozen install resolved 493 packages, and `package.json` plus
`pnpm-lock.yaml` retained SHA-256
`7f8eacf06bb478337cbd13f52747daac61b8f1e135ce32f70e19d3aedf3addd8`
and `e619a3963e58420a9223e08200099e6743d40cc1aaf31656eed50af70ea272fa`
before and after install.

Observed exact-target controls:

- patcher source suite: 45/45 files passed;
- Svelte diagnostics: 0 errors / 0 warnings;
- frontend: 140/140 files and 1,653/1,653 tests passed; and
- server with normal local-socket permission: 15/15 files and 201/201 tests
  passed.

The first disposable install intentionally used `--ignore-scripts`, so one
existing SQLite-backed frontend suite failed before tests because its native
`better-sqlite3` binding was absent. A normal native rebuild made that original
suite pass 17/17 before the full rerun. The sandboxed server run separately
showed only explicit `listen EPERM` failures in three existing socket suites;
the unchanged normal-permission rerun above passed all 201 tests. Neither
diagnostic success nor sandbox failure is rewritten as the other result.

Production build remains a candidate-catalog gate after paid feasibility and
runtime integration; this prototype has no browser call site or catalog entry.

## Gate now reached

The next authorized step is a separately approved paid feasibility matrix:

- AI Studio Gemini 3 at low and medium resolution;
- Vertex Gemini 3 at low and medium resolution; and
- OpenRouter fixed native-PDF route with its native default;
- each at 1, 2, and 8 pages with repeated recall/order probes.

Only routes that pass their own model-recall matrix may proceed into adapter
wire, UI, BG, catalog, or live work. Independent PDF extraction above is a
prerequisite and is not treated as model recall evidence.
