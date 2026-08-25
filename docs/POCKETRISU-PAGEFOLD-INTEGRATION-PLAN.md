# PocketRisu PageFold ModelPreset integration plan

> **Status:** review-revised implementation authority; prototype and exact
> extraction are validated; structural v8 qualified Vertex
> `gemini-3.7-flash` low through L1-L4; downstream runtime/UI/BG/catalog/live
> owners are not yet implemented or admitted
>
> **Date:** 2026-08-25 KST
>
> **Target:** exact official PocketRisu `1.10.0` plus patcher stable `v0.2.0` (`de1fa40`)
>
> **Source under review:** PageFold plugin `0.1.1`, SHA-256 `8291b14f7330e8e4fa0438ea12d1e8f125073945d817fe74693fe9030891ef77`
>
> **Prototype receipt:** `docs/POCKETRISU-PAGEFOLD-PROTOTYPE-VALIDATION.md`
>
> **Provider feasibility receipt:** `docs/POCKETRISU-PAGEFOLD-PROVIDER-FEASIBILITY.md`
>
> **Deferred verbatim-copy authority:** `docs/POCKETRISU-PAGEFOLD-VERBATIM-COPY-FOLLOWUP.md`
>
> **Structural requalification:** `docs/POCKETRISU-PAGEFOLD-STRUCTURAL-REQUALIFICATION.md`

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
- PageFold requests containing native image attachments;
- automatic migration of secrets or statistics from the installed PageFold
  plugin;
- automatic enable/disable/removal of any database plugin entry;
- silent ordinary-model fallback after PageFold preparation;
- byte-identical model reproduction of source strings; exact transport and
  structural recognition remain required, while verbatim copying follows
  `docs/POCKETRISU-PAGEFOLD-VERBATIM-COPY-FOLLOWUP.md` when activated;
- stable release before automatic gates and physical iPhone validation.

The original plugin may remain installed during qualification. The patcher
must not replace `Database.plugins` or use `setDatabase({ plugins })` /
`setDatabaseLite({ plugins })`.

### 2.3 Review disposition

The implementation-blocking review was accepted and resolved in this revision.
The following are now specification decisions rather than implementation-time
questions:

- the transform consumes final ordinary `AdapterChatMessage[]`, after plugin
  before-replacers, request triggers, ModelPreset reformating, and message
  conversion;
- retrying the same route and allowing classic fallback are independent failure
  policies;
- `preset.maxContext` retains its current source-plus-output assembly meaning
  under PageFold, while provider wire context is a separate required limit;
- canonical transcript syntax is deterministic JSONL, not free-form role
  headers;
- PDF-reader exact extraction and paid model recall are separate gates;
- image-bearing requests are blocked in the first admission;
- OpenRouter support evidence and pricing evidence have separate states;
- candidate experimental catalog admission precedes L3, while stable
  distributed admission follows physical L3 and L4;
- browser HTTP and BG in-process rendering implement one injected
  `PageFoldRenderPort` interface;
- model recognition of byte-sensitive content is tested through whitespace
  runs, positions, and Unicode code-point sequences rather than by requiring
  the response generator to echo an identical string;
- verbatim-copy behavior is a deferred, separately disclosed capability and
  cannot be inferred from structural-recognition success; and
- Vertex closes the revised mechanism first; AI Studio replays the frozen
  matrix only after its quota/admission issue is resolved, and OpenRouter
  remains outside the current user-approved scope.

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

| PDF pages | Google/Vertex low estimate | OpenRouter estimate | Illustrative input cost at `$0.75/M` (Google / OpenRouter) |
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

The `$0.75/M` column is arithmetic for the user-supplied comparison rate, not a
generic Gemini price claim. As of the audit date it corresponds, for example,
to the promotional Gemini 3.7 Flash Standard rate through 2026-12-31; Gemini
3.5 Flash Standard is `$1.50/M`. Runtime price records must name model,
provider, billing tier, source, and effective dates.

## 6. Target runtime flow

```text
resolve chat/module ModelPreset for logical task
  -> resolve preset PageFold default + task override
  -> assemble source prompt with source budget
  -> plugin before-replacer
  -> request trigger
  -> ModelPreset reformater
  -> ordinary AdapterChatMessage[] conversion
  -> resolve final immutable PageFold transform context
  -> cheap local validation
  -> deterministic JSONL canonical serializer
  -> server PageFold renderer
  -> PDF document + page/byte metadata
  -> existing ModelPreset adapter merges body/header/auth
  -> reassert final PDF/tools/cache/provider invariants
  -> existing streaming / logging / server-job transport
  -> response usage updates wire-token and cost metadata
```

### 6.1 PageFold state resolution

```text
role override = on/off
  -> use override only when the preset has a valid PageFold config and mode
role override = inherit/missing
  -> use selected preset's PageFold default
role override = on with missing/invalid config
  -> block and direct the user to configure that preset
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
- unknown/missing mode -> invalid config and off; never infer a hierarchy mode;
- unknown role override -> `inherit`;
- role `on` with no valid preset config -> blocked, not an implicit mode;
- invalid price override -> ignored and shown as invalid, never coerced to zero.

## 8. User experience

### 8.1 ModelPreset editor

Add a PageFold card under model abilities:

- `PageFold` on/off;
- an explicit mode choice before the first enable:
  - `PDF role emulation — system messages leave provider system hierarchy`;
  - `Keep system messages in provider system hierarchy`;
- support result and reason;
- selected price, source, effective date, and manual override;
- warning when explicit tools or explicit context caching conflict;
- test output showing applied/bypassed/blocked state, PDF pages/bytes, source
  tokens, predicted wire tokens, and actual provider tokens when present.

Existing presets default off. Enabling PageFold does not itself consent to
moving system messages out of provider hierarchy. The UI requires a mode
selection and shows the role-hierarchy consequence before saving. Internal
values may remain `maximum`/`balanced` for compatibility, but those labels are
not the user-facing explanation.

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

The transform boundary is final ordinary `AdapterChatMessage[]`. It runs after
plugin before-replacers, request triggers, ModelPreset `reformater`, and
ordinary message conversion, and immediately before provider adapter request
construction. The transform must not read an earlier `OpenAIChat[]` snapshot.

The immutable transform input is:

```ts
interface PageFoldTransformInput {
    version: 1
    task: ResolvedTask
    binding: {
        source: 'chat' | 'global-lock-default' | 'module'
        moduleId?: string
    }
    preset: {
        id: string
        updatedAt: number
        profileId: string
        profileVersion: number
        providerBaseVersion: number
        wireModel: string
    }
    config: {
        mode: PageFoldMode
        serializerVersion: 1
        layoutVersion: 1
        fontVersion: string
    }
    messages: AdapterChatMessage[]
}
```

Secrets, credentials, custom headers, and unrelated database state are not
part of the transform/cache identity. The cache key is SHA-256 over fixed-order
non-secret transform metadata plus canonical message bytes. A preset/config,
task, module binding, wire model, serializer/layout/font version, or final
message change invalidates reuse.

### 9.1 Deterministic JSONL grammar

The PDF logical text is UTF-8 JSONL. There are no free-form role delimiters.
Each physical JSON object occupies one logical line; content cannot escape into
the surrounding grammar.

Line 1, fixed property order:

```json
{"type":"pagefold-transcript","version":1,"sourceMessageCount":2,"messageCount":2,"task":"model","mode":"maximum"}
```

One line per message, fixed property order:

```json
{"type":"message","index":0,"sourceIndex":0,"role":"system","name":null,"toolCallId":null,"content":"Follow the rules.","attachments":[]}
{"type":"message","index":1,"sourceIndex":1,"role":"user","name":null,"toolCallId":null,"content":"literal \\n stays content","attachments":[]}
```

Grammar rules:

- header must be first and unique;
- version must be exactly supported;
- source-message count equals final ordinary input length;
- message count equals the number of following PDF message rows;
- `index` is zero-based, contiguous, and matches physical PDF row order;
- `sourceIndex` is the original final-adapter-message index, is strictly
  increasing, and may contain gaps only when provider-system-preserving mode
  removes system rows from the PDF;
- roles use the final adapter enum `system|user|assistant|tool`;
- `name`, `toolCallId`, and `content` always exist with the shown nullable/string
  types;
- `attachments` is an array and must be empty in the first admission because
  image-bearing requests are blocked;
- object property order is fixed by a dedicated encoder, never caller object
  enumeration;
- JSON string escaping covers quote, backslash, U+0000..U+001F, CR/LF/tab,
  U+2028/U+2029, bidi controls, ZWJ, variation selectors, tag characters, and
  lone UTF-16 surrogates;
- lone surrogates and selected format/control code points use uppercase
  `\uXXXX` escape sequences so UTF-8 encoding is deterministic;
- valid non-control Unicode scalar values remain UTF-8;
- there is exactly one LF byte between records and one final LF;
- malformed/non-round-trippable canonical bytes are rejected before render.

Mode projection is deterministic:

- `maximum` / user-facing PDF role emulation: every final adapter message is a
  JSONL row and the provider system contains only the decoder/next-assistant
  directive;
- `balanced` / user-facing provider-system preservation: final system-message
  content is combined by the same ordinary adapter rule and retained in the
  provider system together with the decoder directive; JSONL contains only
  non-system rows with original `sourceIndex` values.

The complete final message array, including provider-system-preserved rows, is
part of transform/cache identity in both modes.

The provider system directive defines this grammar, tells the model to parse
only top-level JSON properties, and states that delimiter-like text inside
`content` is data. It instructs the model not to invent missing rows or recover
a malformed document. The application validates the document itself before
provider work; the directive is not treated as a security validator.

### 9.2 Visible text and ActualText

The renderer receives canonical JSONL bytes. Visual wrapping may reposition
glyphs, but each marked-content `ActualText` span must include every canonical
character in order. Whitespace used as a wrap boundary cannot disappear from
logical text.

Acceptance separately proves:

- visible glyph order matches logical JSONL order;
- independent PDF extraction equals canonical bytes after UTF-8 decoding;
- fake JSON/role records inside escaped content do not create messages;
- single-column, four-column, and multi-page reading order;
- low/medium provider recall is not inferred from independent extraction.

## 10. Server renderer

### 10.1 Runtime port and import direction

Shared request code depends only on a runtime-neutral interface:

```ts
export interface PageFoldRenderPort {
    render(
        request: PageFoldRenderRequest,
        signal?: AbortSignal,
    ): Promise<PageFoldRenderResult>
}
```

Two implementations satisfy the same contract:

- browser runtime: authenticated HTTP port returning binary PDF bytes;
- BG runtime: in-process port injected by `bgOrchestrator.cjs` from the native
  CJS renderer service.

`src/ts/pagefold/*`, `request.ts`, and the BG ESM bundle never import a Node CJS
renderer directly. The browser composition root installs the HTTP port. The BG
composition root receives the native renderer through orchestrator dependencies
and exposes only the interface implementation to the bundled send graph. A
missing port is an explicit pre-render failure.

Browser/BG differential tests feed the same request into both ports and compare
metadata and PDF SHA-256. This preserves the current ESM bundle direction and
prevents Node-only dependencies from leaking into the client graph.

### 10.2 Ownership

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

### 10.3 Render route

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

### 10.4 Rendering algorithm

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

### 10.5 Font handling

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

The exact transform location in `requestModelPreset` is:

```text
plugin before-replacer and request trigger (outer request loop)
  -> ModelPreset reformater
  -> expandAdapterMessages/toAdapterMessage
  -> immutable final AdapterChatMessage[]
  -> PageFold compatibility checks and canonical transform
  -> provider adapter request builder
```

Canonical bytes, image rejection, and PDF cache identity are computed only from
this final array and the immutable transform context in section 9. No earlier
prompt-assembly count, `OpenAIChat[]`, or preview snapshot is accepted as the
provider-equivalent transcript.

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
part. Ordinary messages remain byte-identical. First-admission PageFold
messages have no native image documents/parts because image-bearing requests
are blocked before rendering.

### 11.3 Google / Vertex

- PageFold support is initially limited to Gemini 3 profiles;
- PDF is the first user part;
- use per-part low or feasibility-qualified medium media resolution;
- preserve ModelPreset generationConfig, headers, service-account credential,
  streaming, request logs, reasoning parsing, and response usage;
- use actual `usageMetadata.promptTokenCount` when present;
- runtime blocks stale PageFold config after a profile swap to an unsupported
  model.

### 11.4 OpenRouter

- profile must use the OpenRouter provider base;
- first admission accepts fixed model slugs only; floating/latest aliases are
  support-unknown and blocked;
- selected model must have recent confirmed native `file` support evidence;
- PDF uses `type: file` with a local Base64 data URL;
- if no file-parser exists, add `file-parser/native` while preserving unrelated
  OpenRouter plugins;
- if exactly one existing file-parser is already `native`, preserve it;
- a non-native, malformed, or duplicate existing file-parser is an explicit
  configuration conflict and is not overwritten;
- preserve ModelPreset streaming and all supported parameters;
- use response usage/cost as the authority;
- model/alias/base-URL change invalidates support evidence immediately.

Support and pricing are separate state machines:

```text
support = confirmed | unsupported | unknown
price   = confirmed | unconfirmed
```

- `support=unknown` because metadata is missing/stale/unavailable -> fail closed;
- `support=unsupported` -> fail closed;
- `support=confirmed, price=unconfirmed` -> request may run with cost labelled
  unconfirmed;
- support cache identity includes base URL, requested model, resolved canonical
  slug/provider modality evidence, and observation time;
- support evidence is server-memory-only, is not trusted across process restart,
  and expires at the smaller of the response cache lifetime and one hour
  (one hour when no cache lifetime is supplied);
- an alias/canonical resolution change invalidates both support and price cache
  entries.

### 11.5 Images

The first admission blocks PageFold when any final `AdapterChatMessage` contains
an image. The UI/runtime explains that per-message image ordering is not yet
qualified, and the provider is not called. PageFold-off preserves the existing
ordinary image path unchanged.

A later image admission must define a 1:1 message-index/image-index mapping,
preserve each image after its owning user text, support multiple images across
multiple turns, and add independent adapter and physical L3 evidence. Flattening
all images beside one synthetic PDF message is forbidden.

### 11.6 Tools and explicit cache

First admission behavior:

- PageFold + `toolUse=true` -> block before render/provider work;
- PageFold + PocketRisu explicit Gemini caching enabled -> block or require the
  user to disable one; never mutate the saved preset silently;
- implicit provider caching may still occur but is not claimed as
  PocketRisu-managed cache reuse.

These are explicit compatibility gates, not automatic PageFold-off fallbacks.

### 11.7 Final prepared-request invariants

ModelPreset's shared builder applies defaults, schema user values, custom body,
custom headers, additional parameters, endpoint assembly, and auth before the
adapter reasserts wire-owned fields. PageFold checks the final prepared request
after those merges and immediately before preview/send.

Required invariants:

- exactly one PDF part with expected MIME, filename, byte count, and cache
  identity;
- messages/contents and model are adapter-owned final values;
- no tools/tool choice/tool config;
- no PocketRisu explicit cached-content reference or cache-creation surface;
- Google PDF resolution equals the feasibility-qualified value;
- OpenRouter support evidence still matches the final base URL/model and its
  file-parser is exactly native;
- auth headers/query are present only through the existing auth builder;
- custom body/header/additional parameters cannot replace PDF/messages or
  reintroduce blocked tools/cache;
- preview and live send run the same invariant function.

Invariant failure is non-retryable and forbids classic fallback.

## 12. Source and wire token budgets

Current `maxContextTokens` serves prompt assembly, Hypa behavior, final
rechecking, output reservation, and generation display. PageFold requires the
following explicit authorities.

### 12.1 PageFold-off preservation

PageFold-off does not change tokenizer selection, `ChatTokenizer`, Hypa input,
`maxContextTokens`, removable-message trimming, final clamp, fallback, or
generation info. Regression tests compare the PageFold-off graph against the
pre-feature bytes and observed request behavior.

### 12.2 Source assembly budget

Under PageFold-on, `preset.maxContext` retains PocketRisu's current total-budget
meaning: source prompt input plus reserved output. It does not become a provider
wire limit.

```text
assemblyTotalBudget = positive preset.maxContext, else existing 65,000 default
outputReserve       = resolvePresetMaxOutputTokens(preset), else db.maxResponse
sourceInputBudget   = max(0, assemblyTotalBudget - outputReserve)
```

Unlike the current ordinary path, PageFold-on does not clamp
`assemblyTotalBudget` to the profile wire context window; doing so would
collapse source and compressed-wire authorities again. The independent wire
formula in section 12.4 and renderer hard ceilings enforce provider/runtime
safety. PageFold-off retains the current clamp unchanged.

Prompt assembly starts `currentTokens` with `outputReserve`, exactly as current
code does. Hypa receives `assemblyTotalBudget` and the same current-token shape;
its existing subtraction of `resolveChatMaxResponseTokens(room)` remains the
single correction. Hypa's memory ratios, summarization trigger, and
removable-message trim therefore operate against the PageFold source-history
budget, not the compressed provider wire budget.

After plugin replacers, request triggers, reformating, and final adapter-message
conversion, PageFold recomputes the canonical source token estimate. If
`canonicalSourceTokenEstimate > sourceInputBudget`, it fails explicitly rather
than silently trimming final system/trigger output.

Renderer source-byte/page hard ceilings are independent safety bounds. They do
not rewrite `preset.maxContext` or Hypa settings.

### 12.3 Tokenizer authority and terminology

The current main prompt counter uses classic global model/tokenizer state and
does not consume `ModelPreset.tokenizerOverride` or profile
`recommendedTokenizer`. Its value cannot be labelled the final PageFold source
authority.

PageFold-on resolves one tokenizer ID in this order:

1. `preset.tokenizerOverride`;
2. `preset.profileSnapshot.recommendedTokenizer`;
3. a valid `db.customTokenizer`;
4. adapter default (`gemma` for Google Gemini, `tik` for generic
   OpenAI-compatible; other adapters are not first-admission PageFold routes).

Prompt assembly uses a `ChatTokenizer` with an injected encoder based on
`encodeWithTokenizer`; the existing constructor/default encoder remains
unchanged for PageFold-off. The same resolved tokenizer counts the final
ordinary `AdapterChatMessage[]` content after transforms.

`canonicalSourceTokenEstimate` means the estimated ordinary-model input
represented by that final message array; it does not count JSONL escaping as
ordinary source. JSONL/PDF overhead belongs to predicted/actual wire input.
This separation makes the signed delta compare the ordinary final prompt with
the PageFold wire rather than compare two serialized PageFold forms.

These counts are operational tokenizer estimates, not provider billing truth.
Fields and UI use the names:

- `assemblySourceTokenEstimate`;
- `canonicalSourceTokenEstimate`;
- `sourceTokenizer`.

Only provider response usage is labelled `actualWireInputTokens`.

The final estimate pass is an additional local PageFold-on process required to
prove that replacer/trigger/reformater output matches the canonical PDF input.
It does not call a provider count-token API or incur a separate model charge.
Auxiliary PageFold requests use the same one-pass final counter. PageFold-off
performs none of this work.

### 12.4 Wire budget

```text
wireContextLimit = positive profileSnapshot.limits.contextWindowTokens
wireInputBudget  = wireContextLimit - outputReserve
predictedWireInputTokens
  = PDF media tokens at qualified resolution
  + raw provider-system/directive estimate
```

An unknown/non-positive wire context limit blocks PageFold in the first
admission. It does not assume the source cap or an arbitrary large context.
Before provider work:

```text
predictedWireInputTokens <= wireInputBudget
outputReserve > 0
wireInputBudget >= 0
```

Actual provider usage replaces the prediction only for post-response reporting;
it does not retroactively validate an oversized request.

Generation info keeps existing fields compatible and adds a PageFold object
rather than silently changing the meaning of `inputTokens`:

```ts
interface PageFoldGenerationInfo {
    task: ResolvedTask
    mode: PageFoldMode
    assemblySourceTokenEstimate: number
    canonicalSourceTokenEstimate: number
    sourceTokenizer: RegistryTokenizer
    assemblyTotalBudget: number
    sourceInputBudget: number
    pdfPages: number
    pdfBytes: number
    predictedWireInputTokens: number
    actualWireInputTokens?: number
    wireContextLimit: number
    signedTokenDelta?: number
    inputPriceUsdPerMillion?: number
    pricingSource?: string
}
```

No transcript/hash/credential is persisted in message generation info.

## 13. Retry, fallback, and cancellation

Current outer control has only `noRetry`; it cannot express same-route retry
while independently forbidding classic `staticModel` fallback. PageFold adds an
explicit failure policy carried from renderer/adapter to the outer loop:

```ts
interface RequestFailurePolicy {
    kind:
        | AdapterErrorKind
        | 'renderer'
        | 'support-evidence'
        | 'prepared-invariant'
        | 'blank-response'
        | 'banned-charset'
    retrySameRoute: boolean
    allowClassicFallback: boolean
    retryAfterMs?: number
}
```

`ModelPresetAdapterError.kind/status/retryable/fallbackEligible` is preserved in
the response instead of being reduced to a log string. Existing ordinary routes
keep their current fallback behavior. For every PageFold route,
`allowClassicFallback` is false.

The first attempt also returns an opaque, runtime-only `PageFoldRouteState`
containing final transform identity, final adapter messages, render metadata,
and PDF bytes/reference. It is never serialized into chat/database/BG result
data. A same-route retry requires this state.

### 13.1 Policy matrix

| Outcome | retry same PageFold route | classic fallback |
| --- | --- | --- |
| network/timeout/5xx/parse with adapter `retryable=true` | bounded by existing request retry setting | forbidden |
| 429/rate-limit | bounded same-route retry with adapter delay/backoff metadata | forbidden |
| auth/invalid/not-found/unsupported | no | forbidden |
| OAuth network/server error marked retryable | bounded same-route retry | forbidden |
| malformed credential/OAuth invalid grant | no | forbidden |
| renderer transient font download/read error | bounded only when renderer marks transient | forbidden |
| canonical/support/prepared-invariant failure | no | forbidden |
| blank response with `fallbackWhenBlankResponse` | bounded same-route retry; then explicit blank failure | forbidden |
| banned charset | bounded same-route retry; then explicit charset failure | forbidden |
| abort | no | forbidden |

Blank/charset retry counters share the outer configured request bound and
cannot loop indefinitely. Tools are blocked before PageFold, so these retries
cannot replay a tool side effect.

### 13.2 PDF reuse during retry

- the first attempt runs replacers/triggers/reformater/message conversion once,
  then freezes final transform input and one operation-scoped PDF;
- `retrySameRoute=true` makes the outer loop call the same ModelPreset route
  with its opaque `PageFoldRouteState`; it skips before-replacer, request
  trigger, reformater, message conversion, canonicalization, and rendering;
- blank-response and banned-charset same-route retries also reuse that exact
  route state/PDF;
- the retry entry revalidates live preset ID/update/profile/wire-model and
  PageFold config identity; any change rejects the retry rather than silently
  rebuilding under the same operation;
- a new user request starts a new attempt and may produce new
  replacer/trigger/reformater output and a new PDF;
- provider retry does not re-download/re-parse fonts;
- a reused PDF is accepted only when task, binding source, preset/profile/wire
  model, PageFold mode, serializer/layout/font versions, and canonical bytes all
  match;
- abort invalidates the active render/send but does not delete user data.

### 13.3 Fallback

Classic fallback is unsafe after a PageFold-expanded source prompt. It can
receive more source text than its ordinary context or billing assumptions.

First admission:

- outer control checks `retrySameRoute` separately from
  `allowClassicFallback`;
- every PageFold result has `allowClassicFallback=false` even after its retry
  budget is exhausted;
- `staticModel` is never populated for a PageFold-expanded source prompt;
- PageFold render/provider/blank/charset failure returns an explicit failure;
- the user may switch the role override off and retry ordinarily;
- a future PageFold-compatible ModelPreset fallback chain requires a separate
  design and tests.

### 13.4 Cancellation

Cancellation is non-destructive and follows existing generation ownership.
The implementation must not cancel a different chat/task or delete any parked
BG result. Renderer cache eviction is internal memory cleanup, not user-data
deletion.

## 14. Service Account JSON import

This is a generic Vertex ModelPreset improvement, not PageFold-only storage.

### 14.1 UI behavior

- file picker accepts `.json`, `application/json`, and iOS Files entries whose
  MIME type is empty but filename ends in `.json`;
- select -> size/type validation -> parse -> safe summary;
- switch the credential editor to direct mode;
- clear both higher-precedence credential sources, `preset.apiKeyRef` and
  `preset.inlineCredential`, before committing the direct value;
- set the full JSON into the existing service-account credential field;
- extract `project_id` into the Project ID field;
- show client email/private-key ID only as a non-secret confirmation;
- leave location at the profile/default value (`global` when blank);
- leave model ID owned by the selected profile/preset;
- do not automatically save the JSON into the API key pool.

### 14.2 Validation

- reuse and extend the existing `parseServiceAccountJson` authority rather than
  add a second JSON/private-key/token-URI parser;
- object type must be `service_account`;
- `client_email` required;
- PKCS#8 private key required;
- Project ID required for automatic fill or explicit project override;
- standard Google OAuth token URI allowlist;
- no file content/private key in toast, console, request log, error body, or
  validation snapshot;
- explicit Project ID precedence remains supported after manual editing.

Tests prove `buildModelPresetCredential` resolves the newly imported direct
value, not a stale pool or inline credential, because current precedence is
`apiKeyRef -> inlineCredential -> schema auth userValue`.

The existing server-side OAuth exchange, cache, endpoint assembly, and SSRF
guard remain the runtime authority.

## 15. Pricing and cost reporting

### 15.1 Resolution order

1. explicit per-preset PageFold price override;
2. current OpenRouter model metadata and response cost;
3. versioned Google/Vertex price table with tier/effective dates;
4. `unconfirmed`, never implicit zero.

The price record must include source URL, checked/effective dates, model ID,
provider, billing tier, and currency. Promotional rates need an expiry date. A
model/profile/alias/provider/tier change invalidates a stale resolved price.
Support evidence is never inferred from price availability, and price failure
does not erase already-confirmed support.

### 15.2 Estimate versus actual

- predicted delta uses canonical source token estimate, page estimate, and
  resolved input price;
- actual provider prompt tokens/cost override predictions when supplied;
- output cost is shown separately and is not treated as guaranteed unchanged;
- a failed request records stage, pages already generated, and latency but does
  not fabricate optimized tokens or zero-dollar cost.

`signedTokenDelta = canonicalSourceTokenEstimate - wireInputTokens` is signed.
Short requests may display a negative value/overhead; it is never clamped to
zero or relabelled as savings. Monetary delta is also signed and carries the
same model/provider/tier/effective-date provenance.

Any illustrative `$0.75/M` arithmetic in this document is labelled as such.
Runtime data must not apply Gemini 3.7 promotional Standard pricing to Gemini
3.5 Flash Standard or to a different Vertex/OpenRouter billing tier.

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

Unit mocks are insufficient. Focused integration tests execute direct,
model-job, BG in-process, preview, and error paths, then query the actual
temporary `request-logs.db` `requests.request_body`, headers, response, URL, and
error columns. The following must have zero hits in every persisted path:

- known first/middle/last canonical markers;
- PDF Base64 fragments and `inlineData.data` payloads;
- Service Account private key markers and imported JSON fields;
- provider API keys/access tokens.

The test also verifies that content-free usage rows retain expected model/token
metadata after request-body redaction. Direct and BG delivery both pass through
the server request-log normalizer, but they are exercised separately.

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

### 16.4 Behavioral-reference provenance

The supplied PageFold header identifies name, API version, and plugin version,
but no author, source repository, or license. The implementation therefore uses
the bundle only as a behavioral reference and does not copy PageFold-owned
source text.

Before candidate publication, `docs/SOURCE-PROVENANCE.md` and
`THIRD_PARTY_NOTICES.md` record:

- supplied artifact version and SHA-256;
- `behavioral reference / independent implementation` classification;
- absence of an identified upstream author/repository/license;
- independently selected dependency/font sources and their licenses;
- no claim of upstream endorsement or source-code incorporation.

If an authoritative upstream/license is later supplied, provenance may be
amended in a separate reviewed commit; it is not inferred from filename or
function similarity.

## 17. Patcher ownership and pack design

The current exact-1.10 complete graph is all-or-nothing. A new visible root
would enter distributed delivery as soon as it is registered. Development
therefore keeps the manifest outside `src/catalog.cjs` until prototype,
feasibility, focused owner, and complete candidate gates pass.

Proposed packs:

- `pagefold-model-preset` — visible root with core UI/runtime ownership;
- `pagefold-bg-adapter` — hidden adapter requiring PageFold + bg-preserve.

No distributed subset selector is added.

Two admission boundaries are distinct:

- **candidate catalog admission:** after prototype feasibility and automatic
  gates, register the root on the experimental feature branch, generate a
  complete experimental installer, and permit transactional L3 live apply;
- **stable distributed admission:** only after physical L3 and L4, promote
  verification/release metadata and merge/publish the stable complete graph.

Candidate admission does not change the existing stable `v0.2.0` graph. Stable
support is never inferred from an experimental catalog entry or live apply.

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

1. `docs(pagefold): resolve pre-implementation review gates`
   - transform contract, JSONL grammar, budget/Hypa formulas, failure policy,
     dual admission, and behavioral-reference provenance.
2. `feat(pagefold): add deterministic canonical transcript`
   - pure final-message serializer/types/tests; no runtime call site.
3. `feat(pagefold): add server renderer prototype`
   - candidate dependencies/font cache/renderer and independent reader tests;
     no UI, BG, catalog, or live apply.
4. `test(pagefold): record provider feasibility`
   - separately approved paid calls for 1/2/8-page recall, low/medium, and each
     proposed route; persist a feasibility receipt and narrow the support matrix.
5. `feat(pagefold): add render ports and final adapter wire`
   - HTTP/in-process interface, adapter document type, route-qualified request
     shapes, final prepared invariants, redaction, focused direct/model-job/error
     tests.
6. `feat(pagefold): add retry and source/wire budget policy`
   - tokenizer injection for PageFold-on, Hypa/current-token preservation,
     canonical estimate, failure-policy propagation, no classic fallback.
7. `feat(pagefold): add preset defaults and role overrides`
   - resolver, required mode choice, ModelPreset editor, binding accordion,
     defaults, load normalization, persistence lifecycle.
8. `feat(model-preset): import Google service-account JSON`
   - shared parser, direct credential precedence cleanup, iOS file behavior,
     no PageFold runtime dependency.
9. `feat(pagefold): add qualified pricing and metrics`
   - separate support/price states, signed delta, usage/status/request-info,
     actual SQLite redaction checks.
10. `feat(pagefold): compose bg-preserve execution`
    - injected in-process port, cancellation, status, recovery, stale-source
      list, owner-focused tests.
11. `build(patcher): admit PageFold candidate graph`
    - register manifest only after feasibility/focused/complete automatic gates;
      generate deterministic experimental installer and validation receipt.
12. experimental commit/push/safe live apply and physical L3.
13. L4/stable admission commits
    - final evidence, verified metadata, README/CHANGELOG/version/provenance,
      stable tag/release only after user acceptance.

Implementation commits are pushed before device L3. Live apply uses only the
candidate-admitted experimental graph. Stable graph/release remains behind L3
and L4.

## 19. Automated verification

### 19.1 Canonical serializer

- final `AdapterChatMessage[]` after replacer/trigger/reformater conversion;
- transform metadata: logical task, chat/default/module binding, preset/profile,
  wire model, PageFold mode, serializer/layout/font versions;
- system/user/assistant/tool roles;
- original indices and interleaved system messages;
- fixed JSONL property order, header/count/index validation, final LF;
- empty content;
- LF, CRLF, CR, literal `\n`, literal `\\n`;
- tab, non-breaking space, consecutive and edge whitespace;
- Korean, Han, Hiragana, Katakana, Latin, combining marks;
- ZWJ emoji, variation selectors, tag characters;
- bidi/control characters;
- code fences, JSON, HTML, long URLs, no-whitespace strings, and content that
  contains complete fake header/message JSON records;
- malformed header/count/index/type/trailing-record rejection;
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

### 19.3 Paid provider feasibility

- separate user approval before paid calls;
- a text-only control validates only response-schema/evaluator behavior before
  PDF calls by supplying visible, already-computed facts;
- 1/2/8 pages with start/middle/end markers on every page;
- whitespace uses run lengths/positions and ZWJ/variation/tag content uses
  ordered base-10 JSON integer code points, so perception is not conflated with
  response trimming, hex-prefix/case notation, normalization, or emoji
  rendering;
- verbatim output remains separately deferred and disclosed;
- JSON, code, fake role/message records, and interleaved roles use compact,
  independently expected identifiers;
- low versus medium is compared on the same one-page fixtures before either is
  expanded; a failed resolution is not an automatic fallback trigger, and if
  both pass the user chooses from observed cost/latency rather than an automatic
  preference;
- the chosen Vertex resolution expands to 2/8 pages only after its one-page
  structural and grammar claims pass;
- every final qualification cell must pass three total observations (screening
  plus two fresh repeats); majority success is insufficient;
- current v4 uses `maxOutputTokens=2048` on the first and only attempt for every
  cell, with zero output-control calls. Historical v1-v3 512/1024/2048 control
  behavior remains recorded but is not resumed into v4;
- actual synthetic answer fields and bounded first-difference metrics are
  retained for diagnosis, while credentials, request bodies, PDF Base64, and
  provider tokens remain prohibited;
- a sanitized `call-start` marker is fsynced before provider work and a
  sanitized `call-complete` record is fsynced before another call;
- Vertex is qualified first; AI Studio receives the identical frozen matrix
  only after a separate non-recall quota/admission gate succeeds;
- OpenRouter is not part of the current requalification scope; native-default
  qualification, without an invented resolution control, may be designed later
  only if the user adds it to scope;
- actual usage, finish reason, exact marker recovery, role/order questions, and
  repeated-run variation;
- route is support-qualified only by its own pass;
- independent PDF extraction remains a separate prerequisite and is not
  accepted as model recall evidence.

### 19.4 Resolver and UI

- preset off/on x role inherit/on/off;
- main, sub, all four aux tasks;
- aux fallback to sub while retaining logical task override;
- global preset lock and per-chat regime;
- module binding behavior;
- new-chat default cloning;
- preset duplicate/profile replace/profile update;
- dangling preset and later reconnection;
- legacy absent/invalid config;
- role `on` disabled/blocked when preset config or mode is missing;
- explicit hierarchy-mode consent and warning;
- mobile-sized controls and keyboard accessibility.

### 19.5 Adapter wire

- Google PDF-first part and per-part low resolution;
- Vertex endpoint/auth/model preservation;
- OpenRouter native file part and plugin merge;
- separate support confirmed/unknown/unsupported and price
  confirmed/unconfirmed states;
- metadata failure, alias/base/model invalidation, and non-native file-parser
  conflict;
- streaming/non-streaming;
- image-bearing final messages blocked before render/provider work;
- complete parameter/custom body/custom header preservation;
- final invariant reassertion after all shared/custom merges;
- provider response usage/cost;
- unsupported adapter/model/profile swap blocked pre-render;
- tools/cache conflict blocked pre-render;
- request preview and log redaction.

### 19.6 Token, retry, and fallback

- PageFold-off tokenizer/budget/request bytes unchanged;
- PageFold-on assembly uses resolved preset tokenizer injection;
- current-token/output-reserve/Hypa formula preserved against
  `assemblyTotalBudget`;
- final post-transform canonical source estimate is recomputed and labelled an
  estimate with tokenizer ID;
- known wire context required and wire formula enforced;
- page/byte/context safety limits;
- identical retry reuses PDF;
- same-route retry skips replacer/trigger/reformater and reuses opaque route
  state; a new request with changed output creates a new identity/PDF;
- live preset/config/profile mutation invalidates opaque retry state;
- adapter error metadata survives to outer policy;
- network/rate-limit/OAuth/renderer/blank/charset policy-matrix coverage;
- same-route retry and classic fallback controlled independently;
- no classic fallback after PageFold source expansion;
- cancellation stops every layer;
- failure metadata never claims success/savings.

### 19.7 Service Account import

- valid Google service-account JSON;
- Project ID extraction;
- explicit-project precedence after editing;
- wrong type, missing field, malformed private key, hostile token URI;
- file size/type/empty-iOS-MIME/cancel/read error;
- direct-mode transition and stale `apiKeyRef` plus `inlineCredential` removal;
- existing parser reused as the only service-account validator;
- secret absence from logs/toasts/snapshots.

### 19.8 BG integration

- direct browser and server-orchestrated canonical/PDF parity;
- HTTP and in-process `PageFoldRenderPort` differential identity;
- main and auxiliary role routing;
- pre-handoff and post-handoff abort;
- iOS-style suspend/return and cold recovery;
- status relay with PageFold metadata;
- no duplicate provider call after lost response;
- no result resurrection after cancellation;
- renderer cache not confused with user-data/result retention.

### 19.9 Persistent log and rollback lifecycle

- direct/model-job/BG/preview/error requests write to a temporary real
  `request-logs.db`;
- PDF Base64, canonical markers, API keys, access tokens, and private-key
  markers produce zero persisted hits while usage metadata remains;
- `apply -> save PageFold preset/role config -> revert -> old-version load/save
  -> reapply` preserves unknown optional fields and reconnects the same config;
- exact tracked byte/mode revert and PageFold-owned-file absence;
- no plugin array, chat, credential, log, or BG result deletion.

## 20. Patcher and target gates

### 20.1 Prototype gate — no catalog/runtime UI/live apply

1. behavioral-reference provenance and exact source hash;
2. transform boundary and JSONL grammar tests;
3. pure serializer browser/server differential;
4. renderer independent-reader exact extraction;
5. renderer abort/integrity/concurrency/resource observations;
6. separately approved paid 1/2/8-page route feasibility;
7. feasibility receipt naming every route/resolution/result/limit.

A failed route is removed from the first support matrix before adapter/UI/BG
work proceeds. Provider feasibility is not deferred to aggregate L3.

#### 20.1.1 Structural-oracle requalification sequence

The 2026-08-25 omnibus run remains failed evidence; it is not rewritten as a
pass. Requalification changes the experiment so each call establishes one
claim and each transition has an external stop condition.

1. **L0 local harness gate — no provider work.** Add structural whitespace and
   Unicode/semantic oracles, compact schemas, sanitized observed fields/diffs,
   the current one-shot 2048 output budget with historical controls retained,
   dry-run fixture identity, focused tests, and secret sweep.
2. **L1 text oracle control — one Vertex call.** The byte-sensitive and role
   facts are supplied as visible, already-computed ordinary text. The model
   only maps those facts into the declared response schema; raw whitespace or
   invisible Unicode perception belongs to L2. Failure stops all PDF calls and
   returns to the evaluator; it is not a renderer verdict.
3. **L2 one-page paired screening — four Vertex calls.** Low and medium each
   receive one byte-sensitive fixture and one grammar/role/fake-record fixture.
   At least one resolution must pass both claims before page expansion. If both
   pass, pause and present usage/latency for user selection.
4. **L3 selected-resolution qualification — at most thirteen Vertex calls.**
   Add two fresh repeats of the selected one-page claims, then screen and repeat
   a compact 2-page grammar/order cell, an 8-page marker cell, and an 8-page
   byte-sentinel cell. Each final cell must be 3/3.
5. **L4 hierarchy-mode qualification — at most three Vertex calls.** Qualify
   provider-system preservation independently of PDF role emulation without
   changing the chosen provider/resolution/page ceiling.
6. **AI Studio replication — separately gated.** Resolve the current `429`
   quota/admission surface first, then replay the frozen successful matrix. No
   new exploratory cells or provider-specific success inference are allowed.

The Vertex structural requalification has a separate rated-cost ceiling of
`USD 0.25`, no automatic retry, and no classic fallback. Paid calls require a
new approval after L0 is implemented, tested, and reviewed.

The first structural oracle (`v1`) incorrectly combined three claims in L1:
response-schema behavior, raw invisible-character perception, and exact
uppercase-hex notation. Its one approved L1 call returned `HTTP 200 / STOP` but
failed the evaluator, and a local post-call result-guard defect prevented
field-level retention. That result remains failed evidence and was not retried.

The result-driven `v2` revision changes only the oracle boundary:

- L1 uses visible precomputed decimal facts and therefore isolates the response
  schema/evaluator;
- L2 PDF cells remain responsible for whitespace and Unicode recognition;
- Unicode scalar answers use base-10 JSON integers rather than formatting-
  sensitive hex strings;
- result/checkpoint metadata carries `oracleVersion=2`, and a v1 resume receipt
  cannot enter the v2 sequence; and
- fixture bytes, low/medium comparison, repeats, page expansion, cost cap,
  output-cap controls, no-retry rule, and no-fallback rule remain unchanged.

Implementing and locally testing v2 does not authorize another provider call.
The exhausted v1 approval cannot be reused; v2 requires a separate explicit
paid-call approval after its automatic gates and receipt are complete.

The separately approved v2 run then observed L1 pass and L2 failure to qualify
either resolution. It made six physical calls including one low-byte output
control and stopped before L3/L4 at `USD 0.010484250`. The frozen result remains
no support route. Its retained evidence also identified three harness surfaces
that must not be misclassified as provider failures: the grammar expected order
did not match the fixture's actual marker order; `spaceRuns` did not distinguish
run count from run length; and `zwjCodePoints` did not distinguish U+200D-only
values from the full labeled sequence. The low byte cell additionally exhausted
both 512 and 1,024 output caps through thought usage, while medium retained an
unresolved tag-scalar mismatch. The exact observations are in the structural
receipt; no v2 cell is retroactively promoted to pass.

The result-driven `v3` revision is limited to those retained observations:

- `spaceRuns` becomes `spaceRunLengths`, explicitly the number of U+0020 code
  points inside each of the three runs;
- `zwjCodePoints` becomes `zwjSequenceCodePoints`, explicitly every scalar in
  the labeled sequence, including emoji scalars and U+200D separators;
- variation/tag fields use the same `*SequenceCodePoints` naming, but the tag
  expected value remains unchanged and unresolved;
- role mappings become `{marker,role}` objects instead of orientation-sensitive
  colon strings;
- grammar role order follows actual top-level marker occurrence in the frozen
  fixture: user, assistant, tool, system;
- the single per-cell output control becomes 2048 because v2 low used 950
  thought tokens before exhausting 1024; and
- checkpoint/summary metadata carries `oracleVersion=3`, so v2 cannot resume
  into v3.

v3 does not change fixture bytes, call count, repeats, resolutions, page
expansion, cost cap, no-retry rule, or no-fallback rule. Its local implementation
and automatic gates do not authorize another provider call; a v3 run requires
another explicit paid-call approval.

The explicitly approved v3 run then observed L1 pass, medium grammar pass, low
grammar output-cap inconclusive, and identical low/medium byte failures after
their 2048 controls. Both byte cells recovered words, variation, and the exact
tag scalar, located all three whitespace runs, and counted all three U+200D
separators. Neither visually decomposed emoji glyph members into scalar numbers
or distinguished repeated-space length beyond presence. Seven calls cost
`USD 0.012216000` and stopped before L3/L4 with no route. This is frozen v3
evidence, not a pass.

The v3 agreement establishes that exact PDF transport and conversational model
understanding must remain separate in both directions: PDF.js exact extraction
continues to own whitespace/codepoint byte fidelity, while provider admission
must test whether the model retrieves the positions and semantic content it
will actually use. Requiring a vision model to count typographic spaces or
name the scalar decomposition of a rendered emoji duplicates the exact-reader
gate and does not measure conversational recall. A subsequent revision may
replace those two fields only with position/semantic obligations while keeping
word, variation, tag, grammar, marker, hierarchy, cost, and exact-extraction
requirements intact. It must also remove the observed 512/1024 truncation
confound by budgeting PDF cells adequately on their first and only attempt.

The result-driven `v4` performs exactly that separation:

- PDF.js remains the sole exact-byte authority for `[2,3,2]` whitespace-run
  lengths and complete Unicode scalar sequences;
- model byte cells require the three run positions `leading`, `between`, and
  `trailing`, semantic family members `man`, `woman`, `girl`, `boy`, U+200D
  joiner count `3`, words, variation scalars, and tag scalar;
- grammar role objects/order, page markers, hierarchy, fixtures, resolutions,
  repeats, and 3/3 final-cell requirements remain unchanged;
- every paid cell uses one first-shot 2048 output budget, output controls are
  removed, and maximum physical calls fall from 23 to 21;
- result/checkpoint metadata carries `oracleVersion=4`, so v3 cannot resume;
  and
- the rated-cost ceiling remains `USD 0.25`, with no retry or fallback.

This is not a relaxation of exact transport: exact extraction still fails on
any source-byte difference. It prevents that exact-reader result from being
counted a second time as a visual conversational-recall obligation. v4 local
gates do not themselves qualify a route; only its explicitly approved paid
matrix can do so.

The approved v4 run then passed L1, both grammar cells, and low byte screening,
selecting low as the only L2 resolution. Medium byte and low L3 byte repeat 2
failed only because `zwjSemanticMembers` was empty; low screening alone listed
all four members. Every observation recovered run positions, joiner count `3`,
words, variation, and tag. Six calls cost `USD 0.008766750`; the strict 3/3
rule stopped before remaining L3/L4 cells. v4 remains failed evidence.

This repeated pattern moves individual member enumeration back to the exact
reader: it is still unstable visual decomposition, not stable conversational
meaning. The result-driven `v5` requires `zwjSemanticKind="family"` plus joiner
count `3`, while exact member order/codepoints remain mandatory in PDF.js
extraction. All other v4 obligations and the one-shot 2048/21-call budget remain
unchanged. Checkpoint/summary metadata carries `oracleVersion=5`, so v4 cannot
resume. v5 must independently pass its own 3/3 cells; v4's single low screening
pass cannot be carried forward. Local gates do not qualify a route without the
approved v5 paid matrix.

The approved v5 run passed both L2 resolutions. Based on equal recall, 532
fewer prompt tokens, and 11,055 ms lower L2 latency, the user selected low; its
one-run rated total was higher only because of stochastic thought usage. Low
then passed one-page byte 3/3, one-page grammar 3/3, and two-page grammar 3/3.
The first eight-page marker cell recovered exact first/last markers and page
order but used the lower center on five large even-sized pages while the oracle
expected the upper center. Thirteen calls cost `USD 0.033129000`; strict 3/3
stopped before later marker/byte/L4 cells. v5 remains failed evidence.

The result-driven `v6` removes only this even-set convention:

- each physical page returns exact `first`, exact `last`, and `centers`;
- odd-sized pages have one center;
- even-sized pages have both lower and upper centers in order;
- the independent reader derives that exact center window from the same page
  spans, without changing PDF bytes; and
- all v5 semantic byte, grammar, hierarchy, repeat, low-resolution choice,
  one-shot 2048, 21-call, cost, no-retry, and no-fallback boundaries remain.

v6 must independently rerun screening and every 3/3 cell; v5 results cannot be
resumed across the oracle-version boundary. Its local implementation passed 32
focused tests, the 45-file patcher suite, exact v5-to-v6 update, zero-change
re-plan, and zero-drift status; these gates do not replace the approved paid
matrix.

The approved v6 run passed both L2 resolutions and low one-page byte 3/3. Low
grammar repeat 2 recovered every fact and order but preserved the source-literal
`ROLE:` prefix in each marker, while the frozen expected value omitted it.
Eight calls cost `USD 0.016596750`; strict 3/3 stopped before the new page-marker
cell or L4. v6 remains failed evidence.

The result-driven `v7` canonicalizes exactly one leading `ROLE:` in role-marker
objects before comparison. It does not accept another prefix, marker, role, or
order, and does not affect raw observed evidence retained in the historical v6
receipt. All v6 semantic, center-window, hierarchy, one-shot, cost, and safety
boundaries remain unchanged. v7 must rerun every cell independently. Its local
implementation passed 33 focused tests, the 45-file patcher suite, exact
v6-to-v7 update, zero-change re-plan, and zero-drift status; these gates do not
replace the approved paid matrix.

The approved v7 run passed both L2 resolutions, low one-page byte/grammar 3/3,
and low two-page grammar 3/3. Its first eight-page marker call recovered all
first/last markers, page order, and required centers, but added one adjacent
upper center on a page whose exact reader count was odd. Thirteen calls cost
`USD 0.034548750`; strict 3/3 stopped before later marker/byte/L4. v7 remains
failed evidence.

The result-driven `v8` removes centers from page-marker responses. Each of all
eight physical pages must still return exact `first` and exact `last` in order.
Interior eight-page content remains independently covered by the three 8-page
byte-sentinel cells, while PDF.js still owns every exact page span and center.
All v7 semantic, role, hierarchy, one-shot, cost, safety, and 3/3 boundaries
remain unchanged. v8 must rerun every cell independently. Its local
implementation passed 34 focused tests, the 45-file patcher suite, exact
v7-to-v8 update, zero-change re-plan, and zero-drift status; these gates do not
replace the approved paid matrix.

The approved v8 matrix then completed:

- L1 response oracle pass;
- low and medium L2 byte/grammar pass;
- user-selected low one-page byte 3/3;
- low one-page grammar 3/3;
- low two-page grammar 3/3;
- low eight-page physical boundaries 3/3;
- low eight-page semantic byte 3/3; and
- low balanced hierarchy L4 3/3.

All 21 calls returned `HTTP 200 / STOP / pass` with zero field differences,
zero controls, retry, or fallback. Rated v8 usage was `USD 0.050253000`; exact
fixture extraction and hashes remained frozen. Final flags were
`complete=true`, `supportQualified=true`, and selected resolution `low`.

The first support matrix therefore contains only Vertex
`gemini-3.7-flash` low. Vertex medium is screening-only and unqualified, AI
Studio remains unqualified behind its observed `429` replication gate, and
OpenRouter remains user-excluded. Downstream adapter/UI/BG/catalog/live work may
now proceed only for the qualified Vertex-low route and remains separately
subject to sections 20.2-24.

### 20.2 Candidate catalog admission — experimental only

After the prototype gate:

1. patcher source suite;
2. focused root and PageFold+BG owner compositions;
3. exact PocketRisu 1.10 clean-target apply;
4. current status and zero-change repeated plan;
5. exact tracked byte/mode revert;
6. frozen dependency install with unchanged lockfile;
7. focused PageFold, retry/fallback, support/price, persistence, and SQLite
   redaction tests;
8. complete PocketRisu frontend/server/compatibility tests;
9. Svelte diagnostics;
10. production frontend build;
11. BG orchestration bundle build/load check;
12. source-drift and stale-bundle checks;
13. deterministic experimental installer generation and CJS syntax;
14. complete experimental all-or-nothing graph ordinary
    apply/current/re-plan/revert;
15. L2.5 runtime audit;
16. sensitive-information sweep;
17. candidate validation receipt and experimental version metadata.

Passing this gate permits catalog registration on the feature branch and an
experimental live apply for physical L3. It does not promote stable
verification or release metadata.

### 20.3 Stable distributed admission

After physical L3:

1. record each scenario as pass/fail/unavailable without promotion by
   implication;
2. resolve any PageFold-caused failure and rerun affected automatic gates;
3. execute the rollback lifecycle with saved PageFold config and reapply;
4. complete L4 README/CHANGELOG/version/provenance/receipt updates;
5. final full graph lifecycle, deterministic artifacts, CI, and sweep;
6. only then promote verified/stable catalog and tag/release metadata.

The retired raw-selection combination verifier is not revived. Distributed
selection no longer exists. Follow `docs/PATCHER-V2-DESIGN.md`: focused owner
graphs plus the complete graph lifecycle.

## 21. Runtime-audit surfaces

L2.5 discovery must explicitly trace:

- assembled prompt -> plugin replacer -> request trigger -> reformater -> final
  ordinary `AdapterChatMessage[]` -> immutable transform context -> canonical
  JSONL -> render port -> PDF -> final prepared provider body;
- browser HTTP render port and BG in-process render port import/ownership
  direction;
- font download/cache/integrity and disk writes;
- service-account file -> database credential -> server OAuth exchange;
- PDF Base64 -> request preview/log redaction;
- PageFold role override -> model resolver -> source budget -> adapter;
- provider retry/fallback/cancellation;
- BG start/result/status/cancel/recovery;
- pricing metadata fetch and credential headers;
- OpenRouter support evidence separately from price evidence and alias
  invalidation;
- adapter error metadata -> same-route retry -> classic fallback prohibition;
- source assembly/Hypa tokenizer/budget -> canonical estimate -> wire context;
- message generation metadata persistence;
- plugin coexistence without plugin-array writes.

Safety claims must be attacked with:

- stale profile after enabling PageFold;
- role override `on` with missing/disabled preset config;
- unsupported OpenRouter model whose metadata fetch fails;
- service account with hostile token URI;
- PDF hash collision attempt;
- two simultaneous roles with the same transcript but different configs;
- abort after render but before provider call;
- request log containing raw Gemini inline Base64;
- direct/model-job/BG/preview/error SQLite rows containing canonical or secret
  markers;
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

- candidate-admitted experimental transactional patcher apply;
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
   - use the feasibility-qualified route/resolution on a disposable realistic
     roleplay prompt spanning multiple pages;
   - request start/middle/end and role-order recovery;
   - record actual provider usage without replacing the earlier route matrix.
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
9. **Blocked image request**
   - attach one image to a PageFold-on request;
   - confirm message/index-aware image support is explicitly unavailable and no
     render/provider request occurs;
   - turn PageFold off and confirm the existing ordinary image path still works.
10. **Explicit off/retry**
   - turn a role off;
   - resend and confirm ordinary context budgeting and request shape.

The first paid matrix is preserved in
`docs/POCKETRISU-PAGEFOLD-PROVIDER-FEASIBILITY.md`; it is not rewritten as a
pass. No structural-oracle paid call is performed while revising the plan and
harness. A new paid run requires separate approval after L0. L3 then validates
the integrated product and physical iPhone lifecycle rather than discovering
basic PDF/model feasibility.

## 23. Rollback

- implementation commits stay feature/adapter/docs separated;
- packer revert restores every managed byte/mode and removes PageFold-owned
  files;
- rollback does not delete user presets, role overrides, credentials, request
  logs, chats, BG results, or legacy plugin data;
- older code must tolerate unknown optional PageFold fields in saved data;
- qualification executes `apply -> save PageFold preset config and role
  overrides -> revert -> load and save once with the old runtime -> reapply`;
- after reapply, the same preset config, explicit mode, role overrides, dangling
  references, and new-chat default must reconnect without silent normalization
  or credential precedence changes;
- if source rollback requires replacing a live application tree, preserve the
  existing process-first, same-user-data-inode workflow;
- no `reset --hard`, force push, plugin-array replacement, or user-data cleanup.

## 24. Admission criteria

PageFold may enter the **stable distributed complete graph** only when all of
the following are true. Candidate experimental admission follows section 20.2
and intentionally occurs earlier for L3 live apply.

- canonical serializer is deterministic and cross-runtime equal;
- canonical input is proven to be the final post-replacer/trigger/reformater
  ordinary adapter message array;
- independent PDF extraction is exact for the qualified character/control
  matrix and multi-page order;
- every advertised provider route/resolution passes the pre-candidate paid
  feasibility matrix;
- renderer limits are based on observed target memory/latency;
- Google/Vertex/OpenRouter supported routes preserve ModelPreset parameters,
  streaming, credentials, logs, and cancellation;
- image-bearing PageFold routes block before render/provider work while the
  ordinary image route remains unchanged;
- raw PDF content is absent from persistent logs/previews;
- tools/cache/unsupported routes fail before provider work;
- classic fallback cannot receive a PageFold-expanded prompt;
- same-route retry and classic fallback are independently controlled for every
  failure kind;
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
- Role `on` requires an existing valid preset PageFold config and explicit
  hierarchy mode.
- PDF generation is server-owned.
- Browser and BG rendering use injected implementations of one
  `PageFoldRenderPort`; shared request code imports no Node CJS renderer.
- Original renderer code is not copied verbatim.
- The supplied plugin is a behavioral reference with independent
  implementation provenance.
- Canonical input is final `AdapterChatMessage[]` and deterministic JSONL.
- Canonical text extraction must be exact before paid model qualification.
- Structural recognition, not byte-identical response echo, is the current
  model-recall admission oracle; whitespace and Unicode controls are answered
  through independently checkable structure.
- Verbatim copying is deferred to
  `docs/POCKETRISU-PAGEFOLD-VERBATIM-COPY-FOLLOWUP.md` and must be disclosed as
  unqualified until that separate gate is activated and passed.
- Paid 1/2/8-page route feasibility occurs before adapter/UI/BG completion and
  candidate catalog admission.
- Revised qualification closes one fixed Vertex route/resolution/mode/page
  ceiling first. AI Studio only replicates the frozen matrix after quota
  admission, and OpenRouter is outside the current user-approved scope.
- Tools and PocketRisu explicit cache are blocked in the first admission.
- Image-bearing PageFold requests are blocked in the first admission;
  PageFold-off preserves ordinary images.
- ModelPreset streaming is preserved.
- Runtime failure does not silently fall back to ordinary generation.
- Same-route retry and classic fallback use separate explicit policy fields.
- `preset.maxContext` remains source-plus-output assembly authority; known
  profile wire context is a separate required authority.
- OpenRouter support and price evidence are separate states.
- Token/cost delta is signed and may show PageFold overhead.
- Legacy PageFold secrets/statistics/plugins are not mutated or migrated.
- Candidate experimental admission precedes live L3; stable admission/release
  remains behind physical L3 and L4.

## 26. Review resolution matrix

| Review item | Resolution authority |
| --- | --- |
| Final transcript boundary | Sections 6, 9, and 11.1: final post-replacer/trigger/reformater `AdapterChatMessage[]` |
| Same-route retry versus classic fallback | Section 13: explicit failure policy plus opaque exact-PDF route state |
| Source/wire tokens and Hypa | Section 12: total source assembly formula, preset tokenizer estimate, required known wire context, off-path preservation |
| PDF extraction versus model understanding | Sections 9.2, 19.2, 19.3, and 20.1: independent gates and pre-candidate paid feasibility |
| Exact canonical grammar | Section 9.1: fixed-order UTF-8 JSONL and malformed-document rejection |
| Image ordering | Sections 11.5 and 22.3: first-admission pre-provider block and ordinary-path preservation |
| OpenRouter support versus price | Sections 11.4 and 15: separate evidence states, fixed slugs, native-plugin conflict policy |
| Candidate versus stable admission | Sections 17, 20, and 24: experimental candidate graph before L3; stable graph after L3/L4 |
| Persistent request-log leakage | Sections 16.1 and 19.9: real SQLite checks for direct/job/BG/preview/error paths |
| Rollback state lifecycle | Sections 19.9 and 23: apply/save/revert/old-load-save/reapply |
| Service Account import precedence/iOS | Section 14: shared parser, empty MIME, pool+inline cleanup |
| Role on with missing config | Sections 6.1, 7, 8.1, and 19.4: explicit mode/config required |
| Signed overhead and price provenance | Sections 5 and 15: signed delta and model/provider/tier/effective dates |
| Behavioral reference provenance | Section 16.4 and commit sequence step 1 |
| Browser/BG import direction | Section 10.1: injected `PageFoldRenderPort` implementations |

## 27. References

- `docs/PATCHER-V2-DESIGN.md`
- `docs/POCKETRISU-1.10-STABLE-RELEASE.md`
- `docs/POCKETRISU-1.10-REBASE-AUDIT.md`
- `docs/SOURCE-PROVENANCE.md`
- `docs/POCKETRISU-PAGEFOLD-VERBATIM-COPY-FOLLOWUP.md`
- `docs/POCKETRISU-PAGEFOLD-STRUCTURAL-REQUALIFICATION.md`
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
