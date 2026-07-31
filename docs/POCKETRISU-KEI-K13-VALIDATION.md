# PocketRisu Kei K13 robust stream parser validation

Date: 2026-07-31 KST

## Scope and provenance

This receipt covers K13 from the PocketRisu Kei integration catalog:

- add a hidden, provider-free `kei-stream-parser-core`;
- add mutually exclusive base and `bg-preserve` adapters;
- replace only the legacy OpenAI-compatible and Google/Gemini stream
  transformers;
- retain cumulative text, reasoning, multi-choice, tool-call, usage,
  model-status, and signature behavior while framing split UTF-8 and SSE
  events once;
- leave fetch, abort, tool execution, storage, provider selection, and
  bg-preserve delivery in their existing owners.

The adaptation was audited against PocketRisu Kei revision
`cc1d1b195babd887577ebf943d5e82f01f58135c`:

- `src/ts/process/request/openAI/requests.ts`;
- `src/ts/process/request/openAI/requests.stream.test.ts`;
- `src/ts/process/request/google.ts`;
- `src/ts/process/request/google.test.ts`.

The exact PocketRisu 1.8.1 parser functions being replaced are retained under
`patches/kei-stream-parser-core/anchors/`. Source revision and GPL-3.0
attribution are recorded in `THIRD_PARTY_NOTICES.md`.

The frozen Kei diff also changes local-network routing, request logging,
stream-usage options, model runtime, and generation context in the same host
files. Those changes are not K13 dependencies and were not copied. The
Model Preset OpenAI and Google routes already use the separate preset SSE
adapter in PocketRisu 1.8.1 and remain byte-untouched.

## Ownership and preservation boundary

The pure core owns exactly four new target files:

- `src/ts/process/request/keiSseStream.ts`;
- `src/ts/process/request/keiSseStream.test.ts`;
- `src/ts/process/request/openAI/requests.stream.test.ts`;
- `src/ts/process/request/google.stream.test.ts`.

Each hidden adapter owns one import and one parser-function replacement in
each of:

- `src/ts/process/request/openAI/requests.ts`;
- `src/ts/process/request/google.ts`.

The base adapter is selected only when `kei-stream-parser-core` is present and
`bg-preserve` is absent. The bg adapter is selected only when both are
present, and its Google units are ordered after bg-preserve's existing stream
and non-stream `bgSubKey` delivery hooks. The two adapters conflict, so one
resolved graph cannot install both.

Static contract tests reject `fetchNative`, `abortSignal`, `bgSubKey`,
`pipeTo`, preset adapters, and proxy-job wiring in K13-managed snippets. They
also verify absence when the core is not selected, exactly-one-adapter
resolution, focused paths, ETag participation, and pinned provenance. No
existing pack manifest, owned block, or preservation contract was changed.

## Patcher checks and deterministic installers

`npm test` passed all 24 patcher test files. All four installers passed
`node --check`. Two consecutive builds produced the same sizes and SHA-256
values:

| Installer | Bytes | SHA-256 |
| --- | ---: | --- |
| `pocketrisu-patcher.cjs` | 2,754,758 | `25b5d947e44b8a4b0c81bfc1c8fb856111e90b30de153283bb2f4ceed5c4240e` |
| `pocketrisu-features.cjs` | 2,754,764 | `de5d28474bc962f45c83491a8c5144182dedd1075867f2a52b8128fb6ba270e7` |
| `pocketrisu-hardening.cjs` | 2,754,765 | `805ccda9229015170b0daebf15c459d9e8564be6d2398a717ee91f3c012a8093` |
| `pocketrisu-all.cjs` | 2,754,759 | `07a73dccb14d3bbfbae8ddfd0dce2ecfb38b9ba9ca5ed59beb0672fa32434799` |

The first real target plan exposed a marker-prefix collision between the
Google import and function units. Planning refused before writing. The
function markers were made unambiguous and the final clean plans reported
zero collisions; no target mutation from the refused plan had to be
recovered.

## PocketRisu 1.8.1 target checks

No live PocketRisu tree was modified or restarted.

Focused tests on the base graph passed 15 tests in three files. The
bg-preserve graph passed 38 tests in six files, combining the K13 parser and
provider tests with bg stream-reader, replay/recovery, and proxy-job framing
tests.

The complete target results from the final source were:

| Target | Files | Tests | Diagnostics | Production build |
| --- | --- | --- | --- | --- |
| K13 without toolchain hardening | 63 passed, 2 failed | 860 passed, 83 failed, 3 skipped | Not used as the clean-suite gate | Not used as the clean-suite gate |
| K13 + `toolchain-hardening` | 65 passed | 943 passed, 3 skipped | 0 errors, 4 existing warnings | Exit 0 |
| K13 + `bg-preserve` + `toolchain-hardening` | 87 passed | 1,128 passed, 3 skipped | 0 errors, 0 warnings | Exit 0 |

All 83 bare-target failures were in the same two pre-existing Gemini cache
test files and had the same `localStorage.clear is not a function` cause
measured on the pristine/K19 baseline. K13 did not hardcode around those
tests or copy the separately owned toolchain polyfill.

The four non-bg diagnostics warnings remain the existing click/keyboard-role
warnings in `DefaultChatScreen.svelte`. Production builds retained the
existing externalized-module, dynamic-import, plugin-timing, and large-chunk
warnings and exited zero.

## Apply, repeat, composition, and exact revert

Fresh base and bg-preserve target flows each observed:

- an initial plan with zero collisions;
- transactional apply;
- a second plan with `changedFiles: []`;
- status `current`, with every pack and managed file `current`;
- empty-selection revert;
- a post-revert plan with `changedFiles: []` and status `clean`.

The base graph resolved the base adapter. The bg-preserve graph resolved the
bg adapter and not the base adapter. Switching an already-applied target in
both directions also produced zero-collision transitions and zero-change
second plans.

For both fresh final flows, every non-private regular file's path, SHA-256,
and POSIX mode, and every symlink path and target, matched the pristine tree
after revert. Private `save/pocketrisu-patches` intent/state metadata was
excluded by contract. Empty parent-directory cleanup remains outside the
patch manager's exact-revert claim; no file or symlink was left inside those
parents.

The exhaustive combination verifier observed:

```json
{
  "rawSelections": 2048,
  "verifiedSelections": 2048,
  "normalizedGraphs": 1024,
  "managedPaths": 161,
  "maximumResolvedUnits": 320,
  "roundTrips": "passed",
  "workers": 2
}
```

For every raw selection it performed initial plan, apply, a zero-change
second plan, current-status inspection, empty-selection revert, and exact
managed byte/mode comparison. This is the patch-combination gate, not the
L2.5 runtime audit below.

## L2.5 runtime audit

This section follows `docs/runtime-audit-instructions.md` v2. Discovery is
listed without severity before any triage.

### Phase 1 — flat discovery

- P01. Network byte chunks enter an incremental UTF-8 decoder.
- P02. LF, CRLF, bare CR, and a CRLF split between chunks delimit lines.
- P03. SSE comments, BOM-prefixed lines, `data`, `event`, `id`, unknown
  fields, invalid NUL IDs, and multiline data are framed.
- P04. Blank lines dispatch events; EOF flushes one trailing event; repeated
  finish and push-after-finish have explicit outcomes.
- P05. Replaying the same byte sequence through fresh parser state produces
  the same ordered events.
- P06. An unfinished line and unfinished event remain buffered; scanning,
  slicing, and later collection determine their CPU and memory behavior.
- P07. Only legacy classic OpenAI-compatible/Mistral/NanoGPT streaming calls
  reach the OpenAI transformer.
- P08. OpenAI text remains cumulative, including the retained
  delta-versus-cumulative fragment rule.
- P09. OpenAI multi-choice indexes remain separate.
- P10. Structured reasoning and closing-tag reasoning become the existing
  `<Thoughts>` output shape.
- P11. Schema extraction and its existing console output remain in the emit
  path.
- P12. OpenAI tool-call IDs, names, and argument fragments accumulate before
  the existing tool-execution and follow-up-request wrapper.
- P13. Malformed JSON and responses without a choices array do not replay
  prior valid events and do not stop later valid events.
- P14. `[DONE]` emits the final cumulative snapshot and later stream bytes are
  ignored; multiple completed events in one network chunk coalesce into one
  cumulative UI emission.
- P15. Only legacy Google Cloud/Vertex streaming calls reach the Google
  transformer.
- P16. Google text, current/previous thought, and cumulative state survive
  chunk boundaries.
- P17. Google text and function signatures create inlay IDs and storage calls
  once per parsed provider event.
- P18. Gemini function calls, usage metadata, and model status remain in the
  cumulative stream state.
- P19. Fetch abort signals, main-reader cancellation, tool-follow-up abort,
  and cancellation cleanup remain outside the parser.
- P20. Existing source-body `pipeTo()` promises remain unobserved directly by
  the caller while destination stream errors propagate through the reader.
- P21. With bg-preserve selected, Gemini delegation, offset reconciliation,
  duplicate replay removal, gap recovery, final-byte completeness, and ACK
  remain in the existing delivery owner.
- P22. Graph resolution selects exactly one adapter, preserves absence when
  K13 is absent, and orders the bg Google adapter after delivery hooks.
- P23. The target runtime must supply `TextDecoder`, `TransformStream`, and
  private class fields.
- P24. K13 adds no endpoint, credential read, persisted request log, or
  content telemetry.
- P25. K13 creates no timer, listener, socket, filesystem handle, global
  registry, or retry loop; parser and provider state live for one stream.
- P26. Pack anchors, managed content, ETags, apply, update, status, and revert
  determine installation lifecycle.
- P27. One unterminated provider line/event and cumulative provider output
  have no K13-specific byte cap.
- P28. Invalid UTF-8 is decoded with the platform decoder's replacement
  behavior, and malformed complete provider JSON is dropped.
- P29. A signature storage rejection can occur after its placeholder is
  appended because the inherited save is fire-and-forget.
- P30. Model Preset OpenAI/Google streams continue through the already
  existing preset SSE adapter, not K13.

### Phase 2 — external-anchor resolution

#### Framing, replay, CPU, and memory (P01–P06, P27–P28)

Type: structural, with provider-size and runtime-frequency surfaces.

Break scenario: an emoji split inside its UTF-8 sequence or a CRLF split
between chunks is corrupted, duplicated, or parsed twice.

- The persistent decoder uses `decode(chunk, { stream: true })` and is flushed
  once at EOF: `keiSseStream.ts:69-86`.
- Line search retains a trailing CR for the next chunk, advances a scan
  cursor, slices consumed text once, and dispatches only on a blank line or
  EOF: `keiSseStream.ts:12-32,89-130`.
- The focused tests split an emoji and line boundary, mix all three newline
  forms, join multiline data, flush a trailing event, replay identical
  chunks, and fragment an 8 KiB line into seven-byte chunks:
  `keiSseStream.test.ts:12-104`.

The first audit implementation restarted line search at zero for every push.
That did not change output but could rescan an already-inspected long partial
line. The final implementation records `#scanOffset`, while retaining one
trailing CR for boundary disambiguation. The focused and complete suites
above ran after this correction.

Break scenario: state grows across completed streams or every event reparses
the complete prior response.

- Consumed line bytes are removed at `keiSseStream.ts:101-106`; dispatched
  event lines are cleared at `keiSseStream.ts:126-130`.
- Provider state is local to one `getTranStream()` call and no registry owns
  the parser afterward.
- The provider tests spy on `JSON.parse`: two completed data events are parsed
  twice, not once per historical buffer on every later chunk.

An unfinished single line/event is intentionally retained until its delimiter
or EOF, and cumulative output is intentionally response-sized. No production
provider-size distribution was measured; this becomes surface S1.

Invalid byte replacement is delegated to the standard non-fatal
`TextDecoder`. Malformed complete JSON is caught in each provider adapter,
updates no state, and permits the next framed event. Tests exercise malformed
then valid recovery. This is a recovery policy, not a claim that malformed
provider content can be reconstructed.

#### OpenAI route and state (P07–P14, P20)

Type: structural.

Break scenario: K13 changes a custom endpoint, Model Preset route, abort
signal, tool side effect, or output index while improving framing.

- The classic dispatcher reaches `requestOpenAI()` only for
  OpenAI-compatible, Mistral, and NanoGPT formats:
  `request.ts:391-465`.
- Model Preset OpenAI uses `streamChatRequest()` instead:
  `request.ts:514-536`.
- The existing classic request supplies URL, body, headers, abort signal,
  chat ID, local-network options, status, and content-type gate before it
  constructs the transformer: `openAI/requests.ts:557-608`.
- K13-managed snippets contain none of `fetchNative`, `abortSignal`,
  `bgSubKey`, or `pipeTo`; this is enforced by
  `test/kei-stream-parser.test.cjs:40-58`.
- The transformer updates cumulative indexed text, tool fragments, and
  structured/tag reasoning, then emits the existing schema/reasoning/plain
  output shapes: `openAI/requests.ts:1118-1269`.
- The existing wrapper continues to execute tools and makes abort-aware
  follow-up fetches through the same transformer:
  `openAI/requests.ts:1272-1422`.
- Provider tests cover two parse calls for two events, split UTF-8/JSON and
  multiline data, fragmented tools/reasoning, tagged reasoning,
  multi-choice, and malformed-event recovery.

If the source stream fails, `pipeTo()` aborts/errors its destination and the
main reader observes a non-cancellation read error. The returned `pipeTo`
promise itself is not caught at the call site. K13 neither creates nor
silences that transport failure path; it is retained as surface S3 rather
than hidden behind a parser-only claim.

#### Google route, cumulative state, and signature effects (P15–P18, P29)

Type: structural with a storage-failure surface.

Break scenario: a split or replayed event resets Google state or stores the
same signature more than once.

- The classic Google Cloud/Vertex streaming condition, request body, chat ID,
  bgSubKey hook, and abort signal run before the transformer:
  `google.ts:668-714`.
- The parser retains one cumulative thought/text/tool/usage/status state and
  invokes signature storage only while applying a newly dispatched event:
  `google.ts:998-1138`.
- Tests split a signed event across three writes and observe two distinct
  signature calls for its two signatures, then verify cumulative thought,
  placeholders, tool call, usage, and status. Other tests verify two events
  produce two JSON parses, split UTF-8/multiline data, and malformed recovery.
- Tool follow-up retains abort-aware backoff and fetch and reuses the same
  parser: `google.ts:1297-1337`.

`saveInlayedSignature()` awaits three storage writes through
`setInlayAsset()`, but the streaming caller intentionally does not await or
catch that promise and appends the placeholder immediately:
`inlays.ts:479-486,600-607`, `google.ts:1058-1089`. This behavior existed in
PocketRisu 1.8.1 and the pinned Kei source. K13 removes duplicate invocation
from buffer replay but does not make the inherited storage operation durable;
surface S2 records the exact remaining link.

#### Cancellation and bg-preserve completeness (P19, P21)

Type: structural with an iOS/environment measurement leaf.

Break scenario: returning from background replays raw bytes into the new
parser twice, loses an early chunk, or a cancel resurrects the request.

- Main generation passes `useStreaming`, a generation ID, and the abort
  signal: `process/index.svelte.ts:1475-1488`.
- Its reader abort handler cancels the body; abort read errors are treated as
  cancellation; `finally` removes the handler, clears streaming state, and
  cancels the reader: `process/index.svelte.ts:1512-1582`.
- The bg fetch gate delegates classic main/sub Gemini requests only when its
  existing conditions hold and otherwise retains the original path:
  `globalApi.svelte.ts:2185-2277`.
- Replay offsets drop full duplicates, append only unseen suffixes, and send
  gaps or incomplete final byte counts to the authoritative raw-response
  recovery path: `bgStreamRecovery.ts:7-57`,
  `bgStreamFetch.ts:402-474`.
- Explicit abort/cancel tears down listeners/socket and asks the server to
  delete the job; ordinary background socket close reconnects without that
  delete: `bgStreamFetch.ts:194-275,482-523`.
- Existing bg tests cover complete chunk delivery, abort, callback failure,
  exact/overlap/duplicate/gap reconciliation, missing bytes before done,
  evicted headers, terminal partial records, and proxy chunk decoding.
- The final combined focused suite passed 38 tests and the full bg graph
  passed 1,128 tests.

These anchors resolve byte completeness and cancellation structure. Actual
Safari suspension timing and a real provider round-trip are environmental and
remain the aggregate L3 surface S4.

#### Graph, installation, environment, privacy, and resources
(P22–P26, P30)

Type: structural plus measured artifacts.

Break scenario: both adapters install, K13 appears without selection, a bg
hook is overwritten, or revert restores only content but not mode.

- Resolver and contract tests prove absence, exactly one adapter, conflicts,
  and bg ordering: `adapter-manifest.cjs:13-94`,
  `test/kei-stream-parser.test.cjs:19-99`.
- Fresh base/bg plans, applies, repeat plans, statuses, and reverts produced
  the measured results above.
- The exhaustive verifier checked all 2,048 raw selections and all 161
  managed paths' bytes and modes.
- Adapter anchors and managed payloads participate in ETags:
  `test/kei-stream-parser.test.cjs:101-113`.

Break scenario: a browser-only primitive, hidden dynamic dispatch, network
call, secret, or persistent handle lies outside the obvious imports.

- The core has no imports and the contract test rejects provider, database,
  storage, fetch, signature, and tool-call terms:
  `test/kei-stream-parser.test.cjs:61-70`.
- Direct caller inspection found the classic switch and the distinct
  Model Preset dispatch; no event-name, lazy import, or string-selected
  alternate entry reaches `getTranStream()`.
- Each parser is constructed inside one transformer and owns only decoder,
  strings, arrays, booleans, and a numeric cursor. K13 contains no timer,
  listener, socket, I/O, retry, or global registration.
- Both final production builds resolved `TextDecoder`, `TransformStream`, and
  private fields successfully.
- The tracked change and generated installer sweep adds no endpoint,
  credential literal, request/response persistence, or content telemetry.

The counterexample for the 0-I/O claim was provider adapters indirectly
calling storage or fetch through dynamic dispatch. Direct request-switch,
tool-wrapper, and signature-call inspection reopened the real inherited
signature write as P29/S2; no such operation exists in the pure core.

### Phase 3 — triage

- Q1: no K13-created immediate data-loss, corruption, ordinary-action crash,
  or security finding remains after the final source checks.
- Q2: no K13-created design blocker remains. Transport, storage, and
  bg-preserve continue in their existing authorities rather than acquiring a
  second owner.
- Q3 fixed during this audit: the parser now retains a scan cursor so a long
  line fragmented across many chunks does not restart delimiter search from
  the beginning on every push. The final focused, full, build, and
  combination gates ran after this fix.
- Q3 fixed during planning: ambiguous prefix markers were separated; the
  initially refused plan wrote nothing, and all final graphs plan with zero
  collisions.
- Q4 prepared surfaces: S1 extreme unfinished-event size, S2 inherited
  signature-storage failure semantics, S3 inherited unobserved `pipeTo`
  promise, and S4 real iPhone/provider background behavior.

### Prepared surfaces

#### S1 — unbounded single SSE line or event

1. Claim: K13 does not impose a byte cap on one unfinished provider line,
   one event without a blank delimiter, or the intentional cumulative reply.
2. Resolved: consumed bytes and dispatched lines are released; scan cursor
   prevents repeated delimiter search; an 8 KiB line fragmented into
   seven-byte chunks passes.
3. Blocked link: the maximum real/custom-provider event size and a compatible
   universal cap were not measured.
4. Limitation: full traffic bodies are sensitive, custom endpoints are
   intentionally supported, and source code cannot establish their runtime
   size distribution.
5. Review method: if this boundary is to be tightened, first collect a
   content-free maximum event-byte metric. A lower cap bounds memory/main
   thread work but can reject valid large tool arguments; no cap preserves
   compatibility but leaves an adversarial/malformed endpoint able to grow
   one stream until abort.

#### S2 — inherited signature storage failure after placeholder emission

1. Claim: K13 invokes each signature save once, but does not guarantee that
   its three underlying storage writes succeed before the placeholder is
   emitted.
2. Resolved: one-time invocation is tested; the exact async
   `saveInlayedSignature()` → `setInlayAsset()` write chain was read.
3. Blocked link: there is no existing atomic/durable signature-write contract
   deciding whether a failed save should omit the placeholder, fail the
   stream, or retry.
4. Limitation: changing that policy inside K13 would take storage ownership
   and may add storage latency or a new stream-failure mode.
5. Review method: a forced storage rejection can distinguish the choices.
   Await-and-omit preserves chat output with no dangling marker;
   await-and-fail gives strict integrity but can lose the generation display;
   current fire-and-forget preserves latency but may leave a missing asset.

#### S3 — inherited `pipeTo()` promise handling

1. Claim: classic provider call sites start `source.pipeTo(transform.writable)`
   without retaining or catching its returned promise.
2. Resolved: destination errors reach the stream reader; abort and ordinary
   reader-error paths were traced. K13 does not change these call sites.
3. Blocked link: no observed runtime signal establishes whether a source or
   transform error also becomes an unhandled-rejection report in the target
   browser.
4. Limitation: that is browser/runtime behavior and the affected ownership is
   provider transport, not SSE framing.
5. Review method: inject a source error after headers and observe both
   `reader.read()` and `unhandledrejection`. Catching the `pipeTo` promise
   suppresses duplicate reporting; changing reader error semantics would be
   a separate transport decision.

#### S4 — real iPhone and provider behavior

1. Claim: a classic OpenAI-compatible stream and a classic Gemini stream
   remain cumulative without duplicate/missing text, and the bg-preserve
   Gemini path completes after iOS background/return.
2. Resolved: caller, abort, parser, replay, recovery, graph, focused suite,
   complete suite, diagnostics, and production builds are anchored above.
3. Blocked link: actual Safari suspension timing and real provider chunk
   boundaries were not exercised in the disposable target.
4. Limitation: those are physical-device/provider observations outside the
   local automated target.
5. Review method: in the consolidated L3 session, stream a visibly
   multi-paragraph/emoji response through a classic OpenAI-compatible model,
   then stream a classic Gemini response, background the PWA while text is
   arriving, return after completion, and compare the final visible response
   for missing/duplicated text and stuck streaming state.

### Cross-piece interaction

The interaction requiring both K13 and bg-preserve was checked separately
from each component:

- the bg adapter is ordered after both existing Google delivery hooks;
- its managed parser snippets contain no delivery fields;
- offset recovery supplies a contiguous raw byte sequence before K13 frames
  it;
- the combined focused suite passed 38 tests;
- the complete bg/toolchain graph passed 1,128 tests and built;
- the exhaustive verifier covered both adapter variants across all public
  selections and exact revert.

The remaining cross-piece observation is S4's physical iPhone/provider
round-trip. It is deferred by the user's explicit decision to perform one
consolidated L3 session after all planned local Kei integrations.

## Remaining review and publication state

Automated gates and this audit do not substitute for S4. The K13 mobile gate
is pending as one separately recorded scenario inside the later consolidated
L3 session.

The work remains local for review. No push, tag, release, production apply,
live PocketRisu modification, or PocketRisu restart was performed.
