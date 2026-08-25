# PocketRisu PageFold ModelPreset integration plan

> **Status:** detailed implementation plan; no runtime code has been changed yet
>
> **Date:** 2026-08-25 KST
>
> **Target:** exact official PocketRisu `1.10.0` plus patcher stable `v0.2.0` (`de1fa40`)
>
> **Source under review:** PageFold plugin `0.1.1`, SHA-256 `8291b14f7330e8e4fa0438ea12d1e8f125073945d817fe74693fe9030891ef77`

## 1. Outcome

PageFold will not remain a standalone plugin provider that chooses and calls its
own model. It will become an opt-in ModelPreset transform in the PocketRisu
patcher.

The user-visible contract is:

- existing presets and chats remain PageFold-off by default;
- turning PageFold on for a ModelPreset means every eligible request through
  that preset uses PageFold from the first request;
- there is no token-count threshold that silently switches a conversation
  between ordinary and PDF wire formats;
- main, sub, memory, translation, emotion, and other-aux tasks can override the
  preset default with `inherit`, `on`, or `off`;
- role-specific model selection remains owned by the existing ModelPreset
  binding system;
- PocketRisu's existing credentials, generation parameters, streaming,
  request logging, server orchestration, and response processing remain the
  authority around the PDF attachment;
- unsupported or unsafe combinations stop before provider work instead of
  silently falling back to an ordinary request.

This feature targets NodeOnly PocketRisu. PDF generation will be server-owned,
so an iPhone does not parse large fonts or build the dense PDF locally.

## 2. Scope and non-goals

### 2.1 Included

- lossless, versioned canonical transcript serialization;
- dense multi-column PDF rendering on the NodeOnly server;
- Google AI Studio Gemini 3 native-PDF requests;
- Vertex AI Gemini 3 native-PDF requests through ModelPreset credentials;
- OpenRouter Gemini 3 requests when the selected model exposes native `file`
  input;
- preset-level PageFold configuration;
- per-chat, per-role PageFold overrides and new-chat defaults;
- source-token and wire-token budget separation;
- Service Account JSON file import with Project ID extraction;
- price-source metadata, manual price override, and provider usage recording;
- PDF/request-body redaction in previews and request logs;
- bg-preserve execution, cancellation, recovery, and status integration;
- patcher-focused owner composition and the complete all-or-nothing graph.

### 2.2 Explicitly excluded from the first admission

- arbitrary OpenAI-compatible PDF endpoints;
- Anthropic PDF as a PageFold-equivalent compression path;
- Gemini 2.5 until its media-resolution and native-text behavior is measured
  against the new renderer;
- PageFold with ModelPreset tool use;
- PageFold with PocketRisu-managed explicit Gemini context caching;
- automatic migration of secrets or statistics from the installed PageFold
  plugin;
- automatic enable/disable/removal of any database plugin entry;
- silent ordinary-model fallback after PageFold preparation;
- stable release before automatic gates and physical iPhone validation.

The original plugin may remain installed during qualification. The patcher
must not replace `Database.plugins` or use `setDatabase({ plugins })` /
`setDatabaseLite({ plugins })`.

## 3. Audited PageFold 0.1.1 behavior

### 3.1 Bundle inventory

| Boundary | Observed value |
| --- | ---: |
| Total source | 53,170 lines / 2,347,930 bytes |
| Module boundary comments | 167 |
| `src/core.js` | 224 lines |
| `src/pdf.js` | 294 lines |
| `src/index.js` | 535 lines |
| Whole-file syntax | valid |
| AST dynamic imports | 0 |

Bundled packages:

| Package | Version |
| --- | --- |
| `pako` | `1.0.11` |
| `@pdf-lib/fontkit` | `1.1.1` |
| `pdf-lib` | `1.17.1` |
| `@pdf-lib/standard-fonts` | `1.0.0` |
| `@pdf-lib/upng` | `1.0.1` |
| `tslib` | `1.14.1` |

The PageFold-owned sections were read as contiguous source. Embedded vendor
sections were catalogued by package/module boundary and scanned for executable
surfaces. There is no actual `eval()` or `new Function()` call. The apparent
`%eval%` occurrence is an intrinsic-table reference inside bundled font code.

### 3.2 Runtime API and network surface

PageFold uses only:

- `getLocalPluginStorage` / `pluginStorage`;
- `nativeFetch`;
- `registerSetting`;
- `addProvider`;
- `showContainer` / `hideContainer`.

Observed external endpoints are limited to:

- mutable jsDelivr Noto CJK and Noto Emoji `@main` URLs;
- Google Gemini API;
- Google OAuth token endpoint;
- Vertex AI publisher model endpoint;
- OpenRouter chat completions and model listing endpoints.

There is no unknown telemetry, WebSocket, IndexedDB, localStorage, or
cross-plugin message channel.

### 3.3 Current control flow

```text
PocketRisu prompt_chat
  -> PageFold plugin provider
  -> serialize role/content text
  -> build 2pt, four-column PDF
  -> select provider/model from PageFold plugin storage
  -> call Google / Vertex / OpenRouter directly
  -> return only response text to PocketRisu
```

This bypass is why the plugin cannot use a chat's ModelPreset bundle.
PocketRisu cannot decide separate main/sub/memory/translation/emotion models
once the standalone PageFold provider takes ownership.

### 3.4 Layout constants

| Constant | Value |
| --- | ---: |
| Page size | `595.28 x 841.89` |
| Margin | `10` |
| Column gap | `5` |
| Columns | `4` |
| Font size | `2` |
| Line height | `2.3` |
| Column width | `140.07` |
| Lines per column | `357` |
| Lines per page | `1,428` |

### 3.5 Packaging semantics

`maximum`:

- puts every system/user/assistant/function message into the PDF;
- replaces the real wire system prompt with a directive that tells the model
  to treat role-labelled PDF sections as the conversation;
- therefore does not preserve provider-level system hierarchy.

`balanced`:

- removes every system message from the PDF;
- concatenates all system text into one real wire system instruction;
- puts the remaining messages into the PDF;
- preserves system authority better, but hoists interleaved system messages and
  renumbers the remaining sections.

The integration keeps both modes and documents this semantic distinction. It
does not claim that the two modes are equivalent.

### 3.6 Request parameters currently lost

The original plugin forwards only:

- maximum output tokens;
- temperature;
- top-p;
- top-k.

It does not forward the full ModelPreset parameter/header/body surface,
reasoning configuration, tool configuration, prompt cache configuration, image
attachments, or streaming. OpenRouter is hard-coded to non-streaming.

`top_p=0`, `top_k=0`, and `max_tokens=0` are also rewritten by `||` fallback to
`0.95`, `40`, and `4096`. The new integration must attach a PDF to the existing
adapter request rather than rebuild the provider request from PageFold's reduced
parameter set.

## 4. Dynamic findings that must be corrected

### 4.1 Original PDF is valid but not text-lossless

The original renderer was executed in a restricted VM with the same current
Noto font URLs and read back through PocketRisu's `pdfjs-dist 4.10.38`.

Observed losses:

- whitespace selected as a wrap point is dropped;
- leading/trailing line whitespace is dropped;
- ZWJ emoji loses U+200D joiners;
- actual newline and the literal two-character sequence `\n` collapse to the
  same extracted string;
- CRLF and CR normalize to LF.

Example:

```text
expected:  ===== ASSISTANT 3 =====
extracted: ===== ASSISTANT 3=====

expected:  👨‍👩‍👧‍👦
extracted: 👨👩👧👦
```

Synthetic extraction observations:

| Input | Pages / PDF bytes | Renderer observation | Heap delta | Characters absent from extracted text |
| --- | ---: | ---: | ---: | ---: |
| English 10,000 chars | 1 / 5,328 | 1,532 ms | 47,481,840 B | 77 |
| Korean 10,000 chars | 1 / 80,850 | 1,700 ms | 49,884,376 B | 118 |
| Mixed 81,250 chars | 1 / 89,668 | 10,616 ms | 82,646,072 B | 711 |

These are isolated observations on the current server, not forecasts for the
new renderer. They prove that the current per-grapheme object-array design is
not the implementation target for very large source prompts.

### 4.2 Validation happens after expensive work

With a missing Google API key, the original provider still:

1. fetched the 16,433,112-byte CJK font;
2. stored its Base64 form in plugin storage;
3. built the PDF;
4. only then reported the missing API key.

The new path validates credentials, model support, role compatibility, tools,
cache mode, request limits, and abort state before rendering.

### 4.3 Font and cache observations

At the audit date, the mutable URLs returned:

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| Noto Sans CJK KR Regular | 16,433,112 | `6bcb2a0703aa137e874fc2dffa85f6c21ba9a67fa329e81b8c801663af7e992a` |
| Noto Emoji variable | 1,982,596 | `de6c18832938afc99caf132b39d6a30a19bac7f2e812e28db2535b4608d27551` |

Their combined Base64 payload is approximately 24,554,280 characters before
storage overhead. The new renderer will use immutable source revisions,
integrity verification, and a server font cache that is separate from user
database/plugin storage.

The original single-PDF memory cache uses a 32-bit FNV-style hash of transcript
text only. The new cache uses SHA-256 plus serializer, layout, and font version.

## 5. Cost and page-boundary observations

The following is a dry-layout observation using the original font widths and
wrap rules. Token counts are PageFold's own estimator and vary with real model
tokenizers and content shape.

| Repeated input shape | Estimated source tokens per page | 85,000 source tokens | Four-page range starts above |
| --- | ---: | ---: | ---: |
| English `word ` | 46,410 | 2 pages | 139,230 |
| Korean `가나다라 ` | 108,029 | 1 page | 324,087 |

The earlier conversational example `85,000 tokens -> 3 pages` was not a
measurement and is superseded by this content-dependent result.

The original maximum-mode directive is approximately 65 tokens under the same
estimator.

| PDF pages | Google/Vertex low estimate | OpenRouter estimate | Input cost at `$0.75/M` (Google / OpenRouter) |
| ---: | ---: | ---: | ---: |
| 1 | 345 | 625 | `$0.00025875` / `$0.00046875` |
| 2 | 625 | 1,185 | `$0.00046875` / `$0.00088875` |
| 4 | 1,185 | 2,305 | `$0.00088875` / `$0.00172875` |
| 8 | 2,305 | 4,545 | `$0.00172875` / `$0.00340875` |

Input cost alone does not justify a dynamic ordinary/PageFold threshold for the
target use case. Explicit PageFold `on` therefore means always use PageFold for
every eligible request from the first request. There is no savings-rate
auto-bypass.

Automatic decisions are limited to hard compatibility and safety gates.

## 6. Target runtime flow

```text
resolve chat/module ModelPreset for logical task
  -> resolve preset PageFold default + task override
  -> cheap local validation
  -> assemble source prompt with source budget
  -> canonical transcript serializer
  -> server PageFold renderer
  -> PDF document + page/byte metadata
  -> existing ModelPreset adapter adds provider-specific PDF part
  -> existing streaming / logging / server-job transport
  -> response usage updates wire-token and cost metadata
```

### 6.1 PageFold state resolution

```text
role override = on/off
  -> use override
role override = inherit/missing
  -> use selected preset's PageFold default
unsupported or unsafe live route
  -> fail before renderer/provider work
```

If memory falls back to the sub preset, model selection uses the sub preset but
PageFold uses the logical `memory` role override. This lets the same sub preset
be PageFold-on for memory and PageFold-off for translation.

Module-specific ModelPreset bindings inherit the selected preset's PageFold
default in the first admission. They do not consume chat role overrides.

## 7. Data model

Proposed types:

```ts
export type PageFoldMode = 'maximum' | 'balanced'
export type PageFoldRoleOverride = 'inherit' | 'on' | 'off'

export interface ModelPresetPageFoldConfig {
    enabled: boolean
    mode: PageFoldMode
    inputPriceOverride?: {
        usdPerMillion: number
        note?: string
        updatedAt: number
    }
}

export type PageFoldRoleOverrides = Partial<Record<
    'model' | 'submodel' | 'memory' |
    'translate' | 'emotion' | 'otherAx',
    PageFoldRoleOverride
>>

export interface ModelBindingSet {
    main?: string
    sub?: string
    separateAux: boolean
    aux: {
        memory?: string
        emotion?: string
        translate?: string
        otherAx?: string
    }
    pageFold?: PageFoldRoleOverrides
}
```

There are no PageFold minimum/maximum source-token fields in the normal UI.
Existing ModelPreset context configuration remains the optional user-facing
history budget. Provider page/byte limits and measured renderer ceilings remain
internal hard safety limits and are shown read-only when relevant.

Legacy/malformed values normalize conservatively:

- missing config -> off;
- unknown mode -> `maximum` only for an explicitly enabled config, otherwise
  off;
- unknown role override -> `inherit`;
- invalid price override -> ignored and shown as invalid, never coerced to zero.

## 8. User experience

### 8.1 ModelPreset editor

Add a PageFold card under model abilities:

- `PageFold` on/off;
- `Maximum savings` / `Stable system hierarchy` mode;
- support result and reason;
- selected price, source, effective date, and manual override;
- warning when explicit tools or explicit context caching conflict;
- test output showing applied/bypassed/blocked state, PDF pages/bytes, source
  tokens, predicted wire tokens, and actual provider tokens when present.

Existing presets default off. The PageFold mode may default to `maximum` only
when the user explicitly enables the feature, matching PageFold 0.1.1's default.

### 8.2 Chat model binding panel

Keep all existing model selectors. Add a PageFold accordion below them:

| Task | Override control |
| --- | --- |
| Main | inherit / on / off |
| Sub | inherit / on / off |
| Long-term memory | inherit / on / off |
| Translation | inherit / on / off |
| Emotion | inherit / on / off |
| Other auxiliary | inherit / on / off |

Each model row shows the effective `PF ON` or `PF OFF` state. The existing
"save current configuration as new-chat default" action clones role overrides
with the rest of `ModelBindingSet`.

### 8.3 Persistence behavior

| Operation | PageFold preset config | Role overrides |
| --- | --- | --- |
| Database save/reload | preserved | preserved |
| Preset duplicate | preserved by deep clone | N/A |
| Source profile update/replace | preserved | preserved |
| New-chat default snapshot | N/A | preserved |
| Deleted/dangling preset | retained but blocked | retained for reconnection |

Current "profile export" exports a provider profile fragment, not a complete
ModelPreset. It does not automatically include PageFold config. A versioned,
credential-free preset-settings export is a separate follow-up surface and is
not required for the first runtime admission.

## 9. Canonical transcript contract

The serializer is pure and versioned. It must not depend on PDF layout.

Required properties:

- preserves original message order and original index;
- preserves role and optional name/tool metadata;
- distinguishes LF, CRLF, CR, literal `\n`, tab, and repeated whitespace;
- represents format-control code points such as ZWJ and variation selectors
  with unambiguous ASCII Unicode escapes;
- preserves JSON/code backslashes and quotation marks;
- adds deterministic markers for separately attached images;
- never includes image Base64, credentials, cache keys, or unrelated message
  metadata;
- produces the same canonical bytes in browser and server bundles;
- has explicit upgrade handling for future format versions.

The PDF renderer receives canonical text. Visual wrapping may omit or reposition
glyphs, but each marked-content `ActualText` span must include every canonical
character in order. Whitespace used as a wrap boundary cannot disappear from
logical text.

Acceptance requires exact canonical extraction through an independent PDF
reader for single-column boundaries, all four columns, and multiple pages.

## 10. Server renderer

### 10.1 Ownership

New server-owned modules are expected to include:

- `server/node/pageFoldPdfService.cjs`;
- `server/node/pageFoldFontCache.cjs`;
- focused Node tests;
- a narrow authenticated render route registered from `server.cjs`;
- an in-process entry made available to the bg-preserve bundle.

Client-side modules are expected to include:

- `src/ts/pagefold/canonicalTranscript.ts`;
- `src/ts/pagefold/resolve.ts`;
- `src/ts/pagefold/client.ts`;
- `src/ts/pagefold/pricing.ts`;
- pure focused tests.

### 10.2 Render route

The route accepts canonical UTF-8 text and versioned layout options. It returns
PDF bytes, not JSON Base64. Metadata is returned through bounded headers or a
small side envelope:

- serializer/layout/font version;
- source characters;
- page count;
- PDF bytes;
- SHA-256 cache identity.

The route uses existing NodeOnly session authentication, request body limits,
and request abort/connection-close handling. It stores no user PDF or canonical
transcript on disk.

The server orchestration bundle uses the same renderer in process rather than
looping through a browser-only API.

### 10.3 Rendering algorithm

- iterate grapheme segments without materializing an object per source
  character;
- retain only the current line/page working set;
- cache font selection and glyph widths;
- preserve logical whitespace separately from visible glyph placement;
- check abort cooperatively during canonical scan, layout, font subsetting, and
  page emission;
- use deterministic PDF metadata;
- bound page count, PDF bytes, source bytes, concurrent renders, cache bytes,
  and cache TTL;
- use request-scoped/singleflight cache reuse for retries;
- never treat a hash match without serializer/layout/font versions as reusable.

Concurrency and hard ceilings will be chosen from observed renderer memory and
latency on the target server. They will not be hard-coded from the old
per-grapheme implementation.

### 10.4 Font handling

- immutable upstream revisions;
- expected SHA-256 and byte bounds;
- license files retained;
- one server cache authority outside database/plugin storage;
- atomic temporary download -> hash/format validation -> rename;
- corruption causes re-fetch or explicit failure;
- no user-provided font URL in the first admission;
- no automatic fallback to a system font with incomplete CJK coverage.

The current dependency candidates are `pdf-lib 1.17.1` and
`@pdf-lib/fontkit 1.1.1`, matching PageFold 0.1.1. Their exact install/audit and
Node 25 behavior must be verified before they are admitted to the lockfile.

## 11. ModelPreset integration

### 11.1 Single resolution authority

`resolveChatModelBinding` remains the authority for selecting main/sub/aux
presets. A PageFold resolver consumes its result and the logical task. The
request path and prompt-budget path must call the same resolver rather than
reimplementing role logic.

### 11.2 Adapter document type

Add an internal document attachment shape, separate from legacy
`OpenAIChat.multimodals`:

```ts
export interface AdapterDocumentPart {
    kind: 'document'
    mime: 'application/pdf'
    filename: string
    base64: string
    pageCount: number
    byteLength: number
}
```

Only synthetic user messages created by the PageFold transform receive this
part. Ordinary messages remain byte-identical.

### 11.3 Google / Vertex

- PageFold support is initially limited to Gemini 3 profiles;
- PDF is the first user part;
- use per-part low media resolution so separately attached images do not
  inherit PDF resolution;
- preserve ModelPreset generationConfig, headers, service-account credential,
  streaming, request logs, reasoning parsing, and response usage;
- use actual `usageMetadata.promptTokenCount` when present;
- runtime blocks stale PageFold config after a profile swap to an unsupported
  model.

### 11.4 OpenRouter

- profile must use the OpenRouter provider base;
- selected model must resolve to native `file` input in current model metadata;
- PDF uses `type: file` with a local Base64 data URL;
- add/replace only `file-parser/native` while preserving unrelated OpenRouter
  plugins;
- preserve ModelPreset streaming and all supported parameters;
- use response usage/cost as the authority;
- model-list failure is `support/price unconfirmed`, never zero-price success.

### 11.5 Images

PageFold canonical text carries deterministic image markers. Existing eligible
user images are sent as additional native image parts alongside the PDF. The
integration must not silently discard images that the selected ModelPreset
would ordinarily send.

### 11.6 Tools and explicit cache

First admission behavior:

- PageFold + `toolUse=true` -> block before render/provider work;
- PageFold + PocketRisu explicit Gemini caching enabled -> block or require the
  user to disable one; never mutate the saved preset silently;
- implicit provider caching may still occur but is not claimed as
  PocketRisu-managed cache reuse.

These are explicit compatibility gates, not automatic PageFold-off fallbacks.

## 12. Source and wire token budgets

Current `maxContextTokens` serves prompt assembly, Hypa behavior, final
rechecking, output reservation, and generation display. PageFold requires the
following values to be distinct:

- source input tokens;
- source context limit;
- predicted PDF wire input tokens;
- actual provider wire input tokens;
- wire context limit;
- output reservation.

For a main chat, PocketRisu already calculates final source tokens during prompt
assembly. Pass this value into the request path; do not run another tokenizer or
external count-token request.

For an auxiliary request, PageFold-on may perform one canonical scan to obtain
source count and layout. PageFold-off performs no PageFold work.

The renderer returns page count. The request path validates:

```text
predicted PDF media tokens
+ raw system/directive tokens
+ reserved output tokens
<= selected preset's effective wire context
```

Actual provider usage replaces the prediction for reporting after success.

Generation info keeps existing fields compatible and adds a PageFold object
rather than silently changing the meaning of `inputTokens`:

```ts
interface PageFoldGenerationInfo {
    task: ResolvedTask
    mode: PageFoldMode
    sourceTokens: number
    sourceContext: number
    pdfPages: number
    pdfBytes: number
    predictedWireTokens: number
    actualWireTokens?: number
    wireContext: number
    savedTokens?: number
    inputPriceUsdPerMillion?: number
    pricingSource?: string
}
```

No transcript/hash/credential is persisted in message generation info.

## 13. Retry, fallback, and cancellation

### 13.1 Retry

- identical canonical bytes + config versions reuse the same operation-scoped
  PDF;
- trigger/replacer output changes produce a new hash and PDF;
- provider retry does not re-download/re-parse fonts;
- abort closes renderer, OAuth, fetch, stream, request status, and BG operation
  consistently;
- no completed tool side effect can be replayed, although tools are blocked in
  the first PageFold admission.

### 13.2 Fallback

Classic fallback is unsafe after a PageFold-expanded source prompt. It can
receive more source text than its ordinary context or billing assumptions.

First admission:

- PageFold render/provider failure returns an explicit failure;
- no silent classic fallback;
- the user may switch the role override off and retry ordinarily;
- a future PageFold-compatible ModelPreset fallback chain requires a separate
  design and tests.

### 13.3 Cancellation

Cancellation is non-destructive and follows existing generation ownership.
The implementation must not cancel a different chat/task or delete any parked
BG result. Renderer cache eviction is internal memory cleanup, not user-data
deletion.

## 14. Service Account JSON import

This is a generic Vertex ModelPreset improvement, not PageFold-only storage.

### 14.1 UI behavior

- file picker accepts `.json` and `application/json`;
- select -> size/type validation -> parse -> safe summary;
- switch the credential editor to direct mode;
- set the full JSON into the existing service-account credential field;
- extract `project_id` into the Project ID field;
- show client email/private-key ID only as a non-secret confirmation;
- leave location at the profile/default value (`global` when blank);
- leave model ID owned by the selected profile/preset;
- do not automatically save the JSON into the API key pool.

### 14.2 Validation

- object type must be `service_account`;
- `client_email` required;
- PKCS#8 private key required;
- Project ID required for automatic fill or explicit project override;
- standard Google OAuth token URI allowlist;
- no file content/private key in toast, console, request log, error body, or
  validation snapshot;
- explicit Project ID precedence remains supported after manual editing.

The existing server-side OAuth exchange, cache, endpoint assembly, and SSRF
guard remain the runtime authority.

## 15. Pricing and cost reporting

### 15.1 Resolution order

1. explicit per-preset PageFold price override;
2. current OpenRouter model metadata and response cost;
3. versioned Google/Vertex price table with tier/effective dates;
4. `unconfirmed`, never implicit zero.

The price record must include source URL, checked/effective dates, model ID,
provider, and tier. Promotional rates need an expiry date. A model/profile swap
invalidates a stale resolved price.

### 15.2 Estimate versus actual

- predicted savings use source tokens, page estimate, and resolved input price;
- actual provider prompt tokens/cost override predictions when supplied;
- output cost is shown separately and is not treated as guaranteed unchanged;
- a failed request records stage, pages already generated, and latency but does
  not fabricate optimized tokens or zero-dollar cost.

## 16. Logging, previews, statistics, and privacy

### 16.1 PDF redaction

Current request-log redaction catches Base64 data URLs but not Gemini raw
`inlineData.data`. Create one pure media-redaction helper shared by:

- request logs;
- ModelPreset request preview;
- debug/error presentation;
- focused tests.

Stored output may include:

- MIME;
- byte count;
- bounded non-secret identifier if needed for same-request correlation.

It may not include PDF Base64, canonical transcript, font bytes, credentials,
or full content hash.

### 16.2 Statistics

The original plugin stores lifetime totals, unbounded day/route maps, and 100
recent events. The first native integration will use existing request-log and
message-generation metadata as the evidence source rather than create a second
unbounded user-data store.

A later aggregate dashboard may derive bounded statistics from those records.
It must define retention, prune, backup, and privacy deletion before admission.

### 16.3 Legacy PageFold data

Do not automatically read or copy:

- PageFold API keys;
- access tokens;
- service-account private keys;
- font cache strings;
- PageFold statistics.

The user can configure an existing ModelPreset or use the Service Account JSON
import. Legacy plugin data remains untouched until the user independently
decides to remove it.

## 17. Patcher ownership and pack design

The current exact-1.10 complete graph is all-or-nothing. A new visible root
would enter distributed delivery as soon as it is registered. Development
therefore keeps the manifest outside `src/catalog.cjs` until admission gates
pass.

Proposed packs:

- `pagefold-model-preset` — visible root with core UI/runtime ownership;
- `pagefold-bg-adapter` — hidden adapter requiring PageFold + bg-preserve.

No distributed subset selector is added.

### 17.1 Current overlapping owners

| File/surface | Existing owner impact |
| --- | --- |
| `src/ts/process/request/request.ts` | six bg-preserve hooks |
| `src/ts/process/index.svelte.ts` | bg-preserve + parser-hardening |
| `src/ts/preset/adapter/types.ts` | bg-preserve cache usage hook |
| `src/ts/preset/adapter/googleGemini.ts` | three bg-preserve cache hooks |
| ModelPreset settings page | two bg-preserve cache-status hooks |
| `server/node/server.cjs` | lazy/startup/fence/persona owners + BG route hook |
| `server/node/bgOrchBundle.build.cjs` | BG-owned full file |
| `src/lang/en.ts`, `src/lang/ko.ts` | Haejeok adapter + BG hooks |
| `package.json`, `pnpm-lock.yaml` | toolchain, CharX, Korean-search dependency units |

The PageFold BG adapter composes after exact owner unit IDs. Package/lock units
join the existing deterministic dependency-owner order. New source modules are
PageFold-owned files with exact revert-to-absent behavior.

### 17.2 Expected managed paths

New paths are expected under:

- `src/ts/pagefold/`;
- `server/node/pageFold*.cjs`;
- focused client/server tests;
- `patches/pagefold-model-preset/`;
- `patches/pagefold-bg-adapter/`.

Expected modified PocketRisu paths include:

- `src/ts/preset/types.ts`;
- `src/ts/preset/dbDefaults.ts`;
- `src/ts/process/request/modelPresetBinding.ts`;
- `src/ts/process/request/request.ts`;
- `src/ts/process/index.svelte.ts`;
- `src/ts/process/request/modelPresetMessages.ts`;
- `src/ts/preset/adapter/types.ts`;
- `src/ts/preset/adapter/googleGemini.ts`;
- `src/ts/preset/adapter/openaiCompatible.ts`;
- `src/ts/requestLog.ts`;
- ModelPreset and model-binding UI components;
- Service Account credential/parser components;
- request-info UI and generation-info type;
- English/Korean language files;
- `server/node/server.cjs` and BG bundle builder;
- `package.json` and `pnpm-lock.yaml`.

This is an impact inventory, not a license to replace whole hosts. Actual units
must use the narrowest stable anchors and explicit owner ordering.

## 18. Implementation commit sequence

Each commit must be independently reviewable and preserve exact revert
boundaries.

1. `docs(pagefold): record audited behavior and target contract`
   - this document and source/provenance evidence only.
2. `feat(pagefold): add lossless canonical transcript`
   - pure serializer/types/tests; no runtime call site.
3. `feat(pagefold): add server PDF renderer`
   - dependencies, font cache, renderer, independent reader tests, server route;
     still no ModelPreset activation.
4. `feat(pagefold): add ModelPreset PDF document wire`
   - adapter document type, Google/Vertex/OpenRouter request shapes, media
     redaction, focused mocks.
5. `feat(pagefold): add preset defaults and role overrides`
   - resolver, ModelPreset editor, binding accordion, defaults, load
     normalization.
6. `feat(pagefold): split source and wire token budgets`
   - prompt assembly, Hypa boundary decision, generation info, context guards,
     retry/fallback behavior.
7. `feat(model-preset): import Google service-account JSON`
   - generic credential UI/parser/tests, no PageFold runtime dependency.
8. `feat(pagefold): add pricing and request metrics`
   - price sources, overrides, usage/status/request-info display.
9. `feat(pagefold): compose bg-preserve execution`
   - in-process renderer, cancellation, status, recovery, stale-source list,
     owner-focused tests.
10. `build(patcher): admit PageFold into the complete graph`
    - manifest registration only after focused and complete lifecycle evidence.
11. receipt/version/docs commits
    - deterministic installers, validation report, experimental version, L3
      instructions, later L4 stable release work.

Implementation commits are pushed and safely applied before device L3 under the
project delivery policy. Stable tag/release remains behind L3 and L4.

## 19. Automated verification

### 19.1 Canonical serializer

- system/user/assistant/function/tool roles;
- original indices and interleaved system messages;
- empty content;
- LF, CRLF, CR, literal `\n`, literal `\\n`;
- tab, non-breaking space, consecutive and edge whitespace;
- Korean, Han, Hiragana, Katakana, Latin, combining marks;
- ZWJ emoji, variation selectors, tag characters;
- bidi/control characters;
- code fences, JSON, HTML, long URLs, no-whitespace strings;
- deterministic byte identity;
- browser/server differential equality.

### 19.2 PDF renderer

- independent pdfjs exact canonical extraction;
- first/middle/last on every column;
- first/middle/last on 1, 2, 4, and 8 pages;
- page count and reading order;
- no dropped wrap whitespace;
- empty transcript behavior;
- format-control representation;
- font hash/corruption/download interruption;
- deterministic bytes;
- abort before font, during layout, during save;
- concurrency/singleflight/TTL/byte-bound behavior;
- memory and latency observations across increasing source sizes;
- external parser warnings treated as failures or explicitly resolved.

### 19.3 Resolver and UI

- preset off/on x role inherit/on/off;
- main, sub, all four aux tasks;
- aux fallback to sub while retaining logical task override;
- global preset lock and per-chat regime;
- module binding behavior;
- new-chat default cloning;
- preset duplicate/profile replace/profile update;
- dangling preset and later reconnection;
- legacy absent/invalid config;
- mobile-sized controls and keyboard accessibility.

### 19.4 Adapter wire

- Google PDF-first part and per-part low resolution;
- Vertex endpoint/auth/model preservation;
- OpenRouter native file part and plugin merge;
- streaming/non-streaming;
- images preserved;
- complete parameter/custom body/custom header preservation;
- provider response usage/cost;
- unsupported adapter/model/profile swap blocked pre-render;
- tools/cache conflict blocked pre-render;
- request preview and log redaction.

### 19.5 Token, retry, and fallback

- existing main source-token count reused without re-tokenization;
- source/wire/output budget separation;
- page/byte/context safety limits;
- identical retry reuses PDF;
- changed trigger/replacer output invalidates reuse;
- no classic fallback after PageFold source expansion;
- cancellation stops every layer;
- failure metadata never claims success/savings.

### 19.6 Service Account import

- valid Google service-account JSON;
- Project ID extraction;
- explicit-project precedence after editing;
- wrong type, missing field, malformed private key, hostile token URI;
- file size/type/cancel/read error;
- direct-mode transition and stale pool-ref removal;
- secret absence from logs/toasts/snapshots.

### 19.7 BG integration

- direct browser and server-orchestrated canonical/PDF parity;
- main and auxiliary role routing;
- pre-handoff and post-handoff abort;
- iOS-style suspend/return and cold recovery;
- status relay with PageFold metadata;
- no duplicate provider call after lost response;
- no result resurrection after cancellation;
- renderer cache not confused with user-data/result retention.

## 20. Patcher and target gates

Before catalog admission:

1. patcher source suite;
2. focused root and PageFold+BG owner compositions;
3. exact PocketRisu 1.10 clean-target apply;
4. current status and zero-change repeated plan;
5. exact tracked byte/mode revert;
6. frozen dependency install with unchanged lockfile;
7. focused PageFold tests;
8. complete PocketRisu frontend/server/compatibility tests;
9. Svelte diagnostics;
10. production frontend build;
11. BG orchestration bundle build/load check;
12. source-drift and stale-bundle checks;
13. deterministic installer generation and CJS syntax;
14. complete all-or-nothing graph ordinary apply/current/re-plan/revert;
15. L2.5 runtime audit;
16. sensitive-information sweep.

The retired raw-selection combination verifier is not revived. Distributed
selection no longer exists. Follow `docs/PATCHER-V2-DESIGN.md`: focused owner
graphs plus the complete graph lifecycle.

## 21. Runtime-audit surfaces

L2.5 discovery must explicitly trace:

- user prompt text -> canonical text -> authenticated server route -> in-memory
  PDF -> provider body;
- font download/cache/integrity and disk writes;
- service-account file -> database credential -> server OAuth exchange;
- PDF Base64 -> request preview/log redaction;
- PageFold role override -> model resolver -> source budget -> adapter;
- provider retry/fallback/cancellation;
- BG start/result/status/cancel/recovery;
- pricing metadata fetch and credential headers;
- message generation metadata persistence;
- plugin coexistence without plugin-array writes.

Safety claims must be attacked with:

- stale profile after enabling PageFold;
- unsupported OpenRouter model whose metadata fetch fails;
- service account with hostile token URI;
- PDF hash collision attempt;
- two simultaneous roles with the same transcript but different configs;
- abort after render but before provider call;
- request log containing raw Gemini inline Base64;
- server restart with in-flight or cached PageFold work;
- classic fallback receiving a PageFold-expanded prompt;
- another PWA claiming a BG result.

## 22. Live delivery and L3

### 22.1 Preflight

- exact branch/HEAD/status;
- active native/BG requests read-only check;
- no transaction journal;
- database integrity checks used by the current deployment flow;
- patch plan and managed-path review;
- no plugin-array mutation;
- recoverable application-only rollback boundary with user data excluded.

### 22.2 Apply

- transactional patcher apply;
- dependency install;
- target tests/check/build and BG bundle build;
- process-first restart only after active work is safe;
- served/local asset and build-stamp match;
- HTTP and request-log smoke checks;
- current status and zero-change next plan;
- database/backup/BG state preservation observations;
- no new error-log growth from PageFold initialization.

### 22.3 Physical iPhone scenarios

1. **Service Account JSON**
   - open a Vertex ModelPreset;
   - choose one JSON file in Files;
   - confirm masked credential and extracted Project ID;
   - save/reopen and run the preset test.
2. **Role binding persistence**
   - main preset PageFold on;
   - sub preset PageFold off;
   - memory override on using sub fallback;
   - translation override off;
   - save as new-chat default, create a chat, and reopen the app.
3. **First response always PageFold**
   - send the first user message in a prompt-heavy character/chat;
   - verify `PF ON`, pages, source tokens, and wire usage immediately.
4. **Long-context recall**
   - 1/2/4/8-page synthetic or disposable prompt with unique start/middle/end
     markers;
   - request exact marker/role recovery;
   - record actual provider usage.
5. **Background preservation**
   - send a long PageFold main request;
   - leave to Home before handoff and after handoff in separate runs;
   - return and confirm one completed reply with no duplicate/resurrection.
6. **Role-specific ordinary path**
   - force translation/emotion off;
   - confirm ordinary ModelPreset request and no PageFold render metadata.
7. **Streaming**
   - use a streaming PageFold preset;
   - confirm incremental display, background return, and final usage.
8. **Blocked route**
   - select an unsupported OpenRouter profile or enable tools;
   - confirm a pre-provider explanation and no charged generation.
9. **Explicit off/retry**
   - turn a role off;
   - resend and confirm ordinary context budgeting and request shape.

Actual paid model calls are not performed during planning. Their source/page
recall and usage rows remain an explicit L3 gate rather than a predicted pass.

## 23. Rollback

- implementation commits stay feature/adapter/docs separated;
- packer revert restores every managed byte/mode and removes PageFold-owned
  files;
- rollback does not delete user presets, role overrides, credentials, request
  logs, chats, BG results, or legacy plugin data;
- older code must tolerate unknown optional PageFold fields in saved data;
- if source rollback requires replacing a live application tree, preserve the
  existing process-first, same-user-data-inode workflow;
- no `reset --hard`, force push, plugin-array replacement, or user-data cleanup.

## 24. Admission criteria

PageFold may enter the distributed complete graph only when all of the following
are true:

- canonical serializer is deterministic and cross-runtime equal;
- independent PDF extraction is exact for the qualified character/control
  matrix and multi-page order;
- renderer limits are based on observed target memory/latency;
- Google/Vertex/OpenRouter supported routes preserve ModelPreset parameters,
  images, streaming, credentials, logs, and cancellation;
- raw PDF content is absent from persistent logs/previews;
- tools/cache/unsupported routes fail before provider work;
- classic fallback cannot receive a PageFold-expanded prompt;
- Service Account JSON import passes security and persistence tests;
- focused owner graphs and complete lifecycle pass;
- target tests, diagnostics, builds, BG load, L2.5, and sweep pass;
- implementation has been committed, pushed, and safely applied;
- the user completes the concrete iPhone L3 scenarios;
- L4 docs/version/release work discloses every unexercised route.

## 25. Closed decisions

- PageFold is a ModelPreset transform, not a provider selector.
- Existing presets default off.
- Explicit PageFold on means always PDF from the first eligible request.
- There is no user-supplied minimum/maximum PageFold token threshold.
- Role overrides are `inherit/on/off` and persist with chat/default bindings.
- PDF generation is server-owned.
- Original renderer code is not copied verbatim.
- Canonical text extraction must be exact before provider qualification.
- First support is Gemini 3 native PDF on AI Studio, Vertex, and qualified
  OpenRouter routes.
- Tools and PocketRisu explicit cache are blocked in the first admission.
- Images and ModelPreset streaming are preserved.
- Runtime failure does not silently fall back to ordinary generation.
- Legacy PageFold secrets/statistics/plugins are not mutated or migrated.
- Stable release remains behind automatic gates and physical L3.

## 26. References

- `docs/PATCHER-V2-DESIGN.md`
- `docs/POCKETRISU-1.10-STABLE-RELEASE.md`
- `docs/POCKETRISU-1.10-REBASE-AUDIT.md`
- `docs/SOURCE-PROVENANCE.md`
- `THIRD_PARTY_NOTICES.md`
- Google Gemini pricing: <https://ai.google.dev/gemini-api/docs/pricing>
- Gemini media resolution: <https://ai.google.dev/gemini-api/docs/generate-content/media-resolution>
- Gemini document processing: <https://ai.google.dev/gemini-api/docs/document-processing>
- OpenRouter PDF inputs: <https://openrouter.ai/docs/guides/overview/multimodal/pdfs>
- OpenRouter model metadata: <https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties>
- pdf-lib license: <https://github.com/Hopding/pdf-lib/blob/master/LICENSE.md>
- fontkit: <https://github.com/foliojs/fontkit>
- pako: <https://github.com/nodeca/pako>
- Noto CJK license: <https://github.com/notofonts/noto-cjk/blob/main/Sans/README-third_party.md>
- Noto Emoji license: <https://github.com/google/fonts/blob/main/ofl/notoemoji/OFL.txt>
