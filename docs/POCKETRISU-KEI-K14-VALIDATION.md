# PocketRisu Kei K14 streaming chat render validation

Date: 2026-07-31 KST

## Scope and provenance

This receipt covers K14 from the PocketRisu Kei integration catalog:

- add a hidden, side-effect-free `kei-chat-render-core`;
- add mutually exclusive base and `bg-preserve` render adapters;
- keep the active final character message mounted while its stream text,
  model metadata, and per-message reload pointer change;
- update the mounted component through reactive props instead of recreating
  its DOM subtree for every stream chunk;
- retain remounts for structural message changes and both streaming lifecycle
  boundaries;
- preserve global GUI reloads while suppressing only active-stream
  per-message reload churn;
- defer translation work for partial streamed text until streaming ends.

The adaptation was audited against PocketRisu Kei revision
`cc1d1b195babd887577ebf943d5e82f01f58135c`. The focused render lineage is:

- `dbf0d888fed153fdd3f35d28a90332371912b09e`
  (`feat(generation): add recoverable server-side generation jobs`);
- `0426397df07e7cf95396ef3388140c96edabb8ac`
  (`refactor: converge application UI and retire legacy paths`);
- the pinned final forms of:
  - `src/lib/ChatScreens/Chats.svelte`;
  - `src/lib/ChatScreens/Chat.svelte`;
  - `src/lib/ChatScreens/ChatBody.svelte`;
  - `src/lib/ChatScreens/DefaultChatScreen.svelte`.

PocketRisu 1.8.1 already has a separate per-preset streaming switch. K14
therefore does not copy Kei's global `DBState.db.useStreaming` condition.
It uses the target chat's actual `isStreaming` state together with the active
generation store. This retains per-preset streaming even when the global
classic-provider switch is off and rejects a cold-start persisted
`isStreaming` value when no generation is active.

Source revision and GPL-3.0 attribution are recorded in
`THIRD_PARTY_NOTICES.md`.

## Ownership and preservation boundary

The pure core owns exactly two new target files:

- `src/lib/ChatScreens/keiChatRender.ts`;
- `src/lib/ChatScreens/keiChatRender.test.ts`.

Each hidden adapter owns 20 focused replacement units across:

- `src/lib/ChatScreens/Chats.svelte`;
- `src/lib/ChatScreens/Chat.svelte`;
- `src/lib/ChatScreens/ChatBody.svelte`;
- `src/lib/ChatScreens/DefaultChatScreen.svelte`.

The base adapter is selected only when `kei-chat-render-core` is present and
`bg-preserve` is absent. The bg adapter is selected only when both are
present. They conflict, so one resolved graph cannot install both. The bg
adapter declares ordering after every existing bg-owned `Chat.svelte` hook
and the 15 existing bg-owned `DefaultChatScreen.svelte` hooks.

K14 does not own request dispatch, stream transport, abort, database writes,
lazy hydration, background result claim, durable save, ACK, reconnect, or
recovery. Static contract tests reject those operations in its managed
payloads. No existing patch manifest, owned block, or preservation contract
was weakened.

The preservation audit caught one issue before the final gates: an
intermediate adapter copied `message.generationInfo` and refreshed it only
when the model string changed. PocketRisu replaces or mutates that object
after streaming with token and timing data, so the copy could disconnect the
mounted generation-details view from its reactive source. The final adapter
keeps the original reference and replaces the prop when that reference
changes. A static regression test rejects the discarded spread-copy form.
Every result below was obtained after this correction.

## Patcher checks and deterministic installers

`npm test` passed all 25 patcher tests.

All four generated installers passed `node --check`. Two consecutive builds
produced the same sizes and SHA-256 values:

| Installer | Bytes | SHA-256 |
| --- | ---: | --- |
| `pocketrisu-patcher.cjs` | 2,798,789 | `63069d4978322d5eadba3edda2f3e54d4b052057be1b2fdc77ef2459f3182347` |
| `pocketrisu-features.cjs` | 2,798,795 | `1019d3f513c0fa34ff607cf7940d3ca41180420398c53b8f0debb4cea1204b6d` |
| `pocketrisu-hardening.cjs` | 2,798,796 | `bf3397ee7890164e2dd3d88e9ae88970b8fbb813ac2e63574551e0a3e52ccdf8` |
| `pocketrisu-all.cjs` | 2,798,790 | `ed540ebca268f1322b70e6198e478bf8658a483bf8202b9e36ceb325fbbc7a5a` |

The final base and composed plans reported no K14 collision. The composed
graph retained three already declared bg-preserve/lazy-chat ordering
relationships in `globalApi.svelte.ts`, the server stream reader, and plugin
API-v3 `sendChat`; no K14 unit owns those anchors.

## PocketRisu 1.8.1 target checks

No live PocketRisu tree was modified or restarted.

The final focused run covered the K14 identity helper together with the
already admitted K19 and K13 tests. It passed five files and 26 tests in both
the base and bg-preserve target graphs.

The complete target results were:

| Target | Vitest suites | Tests |
| --- | --- | --- |
| `pocketrisu-kei` without toolchain hardening | 230 passed, 14 failed | 867 passed, 83 failed, 3 skipped |
| `pocketrisu-kei` + `toolchain-hardening` | 244 passed | 950 passed, 3 skipped |
| `pocketrisu-kei` + `bg-preserve` + `lazy-chat-sync` without toolchain hardening | 278 passed, 14 failed | 1,052 passed, 83 failed, 3 skipped |
| `pocketrisu-kei` + `bg-preserve` + `lazy-chat-sync` + `toolchain-hardening` | 318 passed | 1,235 passed, 3 skipped |

All 83 bare-target failures were the same 14
`googleGemini.test.ts` tests and 69 `geminiContextCache.test.ts` tests, with
the existing `localStorage.clear is not a function` cause. K14 did not
hardcode around those failures or copy the separately owned toolchain
polyfill.

The final diagnostics and production builds observed:

| Target | Diagnostics | Production build |
| --- | --- | --- |
| `pocketrisu-kei` + `toolchain-hardening` | 0 errors, 4 existing `DefaultChatScreen.svelte` accessibility warnings | Exit 0 |
| `pocketrisu-kei` + `bg-preserve` + `lazy-chat-sync` + `toolchain-hardening` | 0 errors, 0 warnings | Exit 0 |

Both builds retained the target's existing externalized-module,
dynamic-import, plugin-timing, and large-chunk warnings. The combined
bg-preserve bundle builder produced `server/node/bgOrchBundle.mjs`
(8,116 KB), and its load check exposed `sendChat` as a function. Its existing
KaTeX quirks warning remained.

## Apply, repeat, composition, and exact revert

Fresh disposable targets observed:

| Flow | Initial changed files | Current managed files | Reapply | Revert changed files |
| --- | ---: | ---: | --- | ---: |
| `pocketrisu-kei,toolchain-hardening` | 18 | 16 | `changedFiles: []` | 18 |
| `pocketrisu-kei,bg-preserve,lazy-chat-sync,toolchain-hardening` | 125 | 123 | `changedFiles: []` | 125 |

Both post-apply statuses reported every managed file `current`. Both
empty-selection reverts ended with status `clean`, no requested pack, and a
zero-change follow-up plan.

After excluding the patch manager's private intent/state metadata, an rsync
checksum comparison found no regular-file or symlink content, mode, or target
difference from pristine PocketRisu 1.8.1. The composed target retained only
an empty `src/ts/vendor/` parent directory. Empty directory cleanup is outside
the patch manager's exact-revert claim; it contained no file or symlink.

The final exhaustive combination verifier observed:

```json
{
  "rawSelections": 2048,
  "verifiedSelections": 2048,
  "normalizedGraphs": 1024,
  "managedPaths": 165,
  "maximumResolvedUnits": 342,
  "roundTrips": "passed",
  "workers": 2,
  "compositionCache": {
    "bypasses": 2050,
    "hits": 2047,
    "misses": 2047,
    "stores": 2047
  },
  "pairAnalysisCache": {
    "entries": 346,
    "hits": 117926,
    "misses": 346
  },
  "packEtagCache": {
    "hits": 34271,
    "misses": 33
  },
  "stateEncodingCache": {
    "hits": 2047,
    "misses": 2047
  }
}
```

For every raw selection it performed initial plan, apply, a zero-change
second plan, current-status inspection, empty-selection revert, and exact
managed byte/mode comparison. This is the optimized exhaustive composition
gate, not the L2.5 runtime audit below.

## L2.5 runtime audit

This section follows `docs/runtime-audit-instructions.md` v2. Discovery is
listed without severity before triage.

### Phase 1 — flat discovery

- P01. A main streamed reply creates or continues one final character
  message, marks its chat streaming, updates its text for chunks, and clears
  streaming in a `finally` block.
- P02. Classic and per-preset streaming settings reach the same chat state,
  while per-preset streaming is independent of the global classic switch.
- P03. Persisted or cross-chat `isStreaming` and the process-wide active
  generation store can disagree.
- P04. Active-stream identity excludes changing text, model, and
  per-message reload values.
- P05. Chat ID, index, portrait mode, disabled state, swipe identity/count,
  reroll-target state, and streaming lifecycle remain identity inputs.
- P06. Entering and leaving active streaming change identity and remount at
  each boundary.
- P07. A retained mount receives reactive message, streaming-display, and
  generation-info prop updates.
- P08. Retained mount entries are removed when their message hash leaves the
  rendered set and unmounted when `Chats` is destroyed.
- P09. A streamed `ChatBody` ignores its message reload pointer but retains
  the global GUI reload pointer.
- P10. Reactive message updates still run the existing chat parser and
  asynchronous Markdown pipeline for each displayed update.
- P11. Auto-translation and translated/retranslate display paths are skipped
  for partial stream text and become eligible after streaming ends.
- P12. More than one asynchronous Markdown parse can be in flight while
  chunks update a retained component.
- P13. Browser scroll anchoring and perceived flicker depend on the physical
  browser's DOM/layout behavior.
- P14. In a bg-preserve graph, the active generation value is the union of
  client and server generation leases.
- P15. Background restoration and conflict-copy paths clear `isStreaming`
  before displaying a completed recovered chat.
- P16. Background durable save, result claim, exact ACK, reconnect, and
  recovery remain in their pre-existing owners.
- P17. Graph resolution selects exactly one K14 adapter and leaves K14 absent
  when its core is not selected.
- P18. K14 adds no network, credential, storage, HTML sink, timer, listener,
  socket, or filesystem operation.
- P19. Anchors, ETags, transactional apply, status, update, and revert govern
  K14's installation lifecycle.
- P20. The host still converts the render identity to its inherited signed
  32-bit non-cryptographic hash.
- P21. K14 reduces component remounts; it does not cap provider chunk
  frequency or eliminate Markdown parsing work for updated text.

### Phase 2 — external-anchor resolution

#### Active stream selection and lifecycle (P01–P03)

Type: structural, with one cross-chat state surface.

Break scenario: K14 keys off `DBState.db.useStreaming`, so a per-preset stream
continues remounting; or it trusts a stale persisted `isStreaming` flag on
cold boot and suppresses ordinary message refreshes.

- Main generation acquires `doingChat` before request assembly:
  `process/index.svelte.ts:175-183`.
- The streaming branch appends the final character message, sets
  `isStreaming = true`, updates that exact message for each reader value, and
  clears `isStreaming` in `finally`:
  `process/index.svelte.ts:1431-1497`.
- Per-preset streaming is resolved from the preset's own capability and
  switch, independently of the global classic setting:
  `process/request/request.ts:628-638`.
- K14 classifies only a last-role-`char` message for which both the target
  chat and active generation are true:
  `keiChatRender.ts:23-33`.
- Focused tests make each of role, last-message, chat-streaming, and active
  generation false separately and verify that the optimization disengages:
  `keiChatRender.test.ts:32-46`.

The extra active-generation condition resolves the ordinary cold-boot stale
flag case. The active store is intentionally process-wide, not chat-keyed.
A selected chat with stale `isStreaming` while another chat owns the active
lease is surface S3.

#### Identity, reactive props, and mount lifetime (P04–P08, P20)

Type: structural.

Break scenario: making the identity stable also hides a swipe/edit/lifecycle
change, leaves visible text stale, loses completed token metadata, or retains
detached component instances.

- The pure helper removes only text, model, and the per-message reload value
  while active streaming. It retains the listed structural fields and the
  streaming boolean: `keiChatRender.ts:35-54`.
- Focused tests verify stable chunk/model/reload identity, non-stream content
  and reload changes, both lifecycle boundaries, and each retained structural
  field: `keiChatRender.test.ts:49-111`.
- The applied adapter mounts `Chat` with a Svelte `$state` props object and
  stores the instance and props together:
  `Chats.svelte:140-172`.
- On a stable identity it updates message text, streaming display, and the
  original generation-info reference:
  `Chats.svelte:181-195`.
- The host's existing `$effect` reads the messages and reload store before it
  calls `updateChatBody`, so those reactive mutations reach the update path:
  `Chats.svelte:255-278`.
- Hashes that leave `currentHashes` are unmounted and deleted; component
  destruction unmounts and clears every retained entry:
  `Chats.svelte:200-226`.

The audit's generation-info counterexample was a same-model object replacement
or later token/timing mutation. Keeping the source reference and comparing
reference identity closes that link; `test/kei-chat-render.test.cjs:100-124`
also rejects the earlier spread-copy form.

The host's inherited `hashCode()` remains a signed 32-bit
non-cryptographic reduction: `Chats.svelte:61-73`. K14 does not claim
collision freedom; surface S4 records that unchanged architectural boundary.

#### Reload, parsing, translation, CPU, and scroll (P09–P13, P21)

Type: structural plus browser and scheduling surfaces.

Break scenario: suppressing chunk remounts also suppresses an explicit global
GUI refresh, freezes message text, translates every partial response, or
silently promises lower parse CPU that the code does not provide.

- `getChatBodyReloadPointer()` always includes the global pointer and includes
  the message pointer only outside active streaming:
  `keiChatRender.ts:57-63`; its focused test is
  `keiChatRender.test.ts:114-118`.
- `Chat` still runs `displaya(message)` in `$effect.pre`, and the retained
  reactive `message` prop therefore refreshes `msgDisplay`:
  `Chat.svelte:179-203`.
- Only the keyed `ChatBody` boundary uses the adjusted pointer:
  `Chat.svelte:412-452`.
- `ChatBody` captures the streaming value for one asynchronous parse,
  suppresses both auto-translation selection and translated/retranslate work
  while true, and still runs `ParseMarkdown` for the un-translated display:
  `ChatBody.svelte:65-171`.
- Its `$derived` creates a parse promise from every reactive `msgDisplay`
  value and the await block shows the current result:
  `ChatBody.svelte:252-269`.

Translation/cache/network work can fail after streaming ends. The inherited
`markParsing` catch retries and eventually reports the parse error; K14 does
not claim translation success and does not alter that failure policy. During
active streaming, its branch prevents entry to those translation calls.

The code establishes fewer DOM remounts, not physical scroll position or
parse completion order. Actual Safari scroll anchoring is surface S1.
Overlapping asynchronous parses and their inherited `lastParsed` fallback are
surface S2. Provider chunk rate and Markdown cost remain visible rather than
being mislabeled as eliminated.

#### Bg-preserve composition and delivery (P14–P16)

Type: structural with an iOS reconnect observation.

Break scenario: K14 releases the busy state between client/server handoff,
modifies delivery/ACK, or leaves a recovered chat marked streaming.

- The bg coordinator exposes `doingChat` as `clientBusy || serverBusy`, and
  its server-to-client handoff acquires the client lease before releasing the
  server lease: `generationBusy.ts:12-47`.
- Server orchestration similarly acquires the server lease before releasing
  the client lease at delegation:
  `bgOrchestrate.ts:1357-1361`.
- Conflict copies and conflict updates set `isStreaming: false`:
  `bgOrchestrationMerge.ts:143-188`; stream-draft restoration sets
  `chat.isStreaming = false`: `bgStreamPreserve.svelte.ts:220-248`.
- Existing delivery persists the merged chat before exact result ACK and
  retains an unacknowledged revision/marker for retry:
  `bgOrchestrate.ts:468-496,609-670`.
- K14's managed payload contains no fetch, WebSocket, result claim, ACK,
  request-status, database, or local-storage operation. This is enforced by
  `test/kei-chat-render.test.cjs:56-77`.

The counterexample for the no-delivery-change claim was an indirect callback
or dynamic dispatch hidden behind the new prop. Direct inspection shows the
new data flow is store/boolean input into pure identity helpers and reactive
display props; it invokes no delivery callback. The combined full suite,
production build, and bg bundle load check ran after composition. A physical
iOS background/return remains part of surface S1 rather than a code-only
claim.

#### Graph, resources, privacy, and installation (P17–P19)

Type: structural plus measured artifacts.

Break scenario: both adapters install, an adapter appears without K14, a
bg-owned hook is overwritten, or revert restores content but not mode.

- Resolver conditions, conflicts, and the 15/4 bg hook ordering lists are in
  `adapter-manifest.cjs:9-59,307-335`.
- Absence, exactly-one-adapter resolution, touched paths, prohibited
  operations, ETag participation, and pinned attribution are tested in
  `test/kei-chat-render.test.cjs:19-172`.
- Fresh base/composed plan, apply, second plan, status, revert, checksum, and
  exhaustive-selection results are recorded above.

Break scenario: a new listener, timer, socket, hidden HTML sink, persisted
content, or credential flow exists outside the pure helper's obvious body.

- The core has no import and operates only on supplied primitive values.
- Direct inspection of all 20 adapter units found no new timer/listener/socket
  registration, I/O, renderer sink, or persistence call.
- The only retained registry is the host's existing map, whose removal and
  destruction paths are preserved and whose size follows the currently
  rendered hashes.
- Rendered text still enters the pre-existing `risuChatParser` and Markdown
  path; K14 adds no second HTML interpretation boundary.
- A dynamic-dispatch counterexample would require one of the new helpers or
  props to invoke a callback. Their signatures and applied call sites contain
  no such invocation.
- The tracked source and generated installer changes add no endpoint,
  credential literal, request/response log, content persistence, or telemetry.

This resolves the 0-new-resource and 0-new-security-boundary claims rather
than treating an empty grep as sufficient by itself.

### Phase 3 — triage

- Q1: no K14-created immediate data-loss, corruption, ordinary-action crash,
  or security finding remains after the final source checks.
- Q2: no K14-created design blocker remains. Request, translation,
  persistence, and bg delivery stay in their existing owners.
- Q3 fixed during this audit: generation-info props now retain their reactive
  source reference and update on object replacement, preserving completed
  token/timing details.
- Q3 fixed during implementation: active selection uses actual chat streaming
  plus the active generation lease, not the unrelated global streaming
  preference.
- Q4 prepared surfaces: S1 physical iPhone scroll/background behavior, S2
  overlapping asynchronous pending display, S3 process-wide busy combined
  with a stale cross-chat streaming flag, and S4 inherited 32-bit render-hash
  collisions.

### Prepared surfaces

#### S1 — physical iPhone scroll and background behavior

1. Claim: streamed chunks update one mounted message without repeatedly
   pulling a user who is reading earlier messages back to the bottom, and a
   bg-preserve completion still returns exactly one final result.
2. Resolved: identity, reactive props, auto-scroll conditions, bg lease,
   merge, durable save, ACK, reconnect code, focused/full suites, diagnostics,
   builds, and bundle load are anchored above.
3. Blocked link: Safari's actual scroll-anchor choice and suspension timing
   were not exercised in the disposable target.
4. Limitation: those are physical-device/browser observations outside the
   local automated environment.
5. Review method: during the consolidated L3, start a long streaming reply,
   scroll upward while chunks arrive, observe whether the viewport stays on
   the chosen history position, then background and return during a separate
   bg-preserve generation. Missing/duplicate final text, repeated viewport
   jumps, or a stuck streaming/busy state changes this surface to a defect.

#### S2 — overlapping asynchronous Markdown pending display

1. Claim: the latest parse promise supplies the completed visible text, while
   the inherited `lastParsed` value supplies content during a newer pending
   parse.
2. Resolved: each message update reaches `$derived`, and Svelte's await block
   is bound to the current promise. The `lastParsed` assignment occurs in each
   parse's `finally`.
3. Blocked link: no forced out-of-order `ParseMarkdown` completion was run in
   a real browser while rapid provider chunks updated one retained component.
4. Limitation: cancellation/serialization belongs to the broader translation
   render controller being evaluated under K12; adding it here would take
   ownership beyond K14.
5. Review method: watch a long Markdown-heavy stream for a temporary backward
   text flash while it grows. Final text remaining stale is a K14 defect;
   only a temporary pending fallback flash reopens sequencing jointly with
   K12.

#### S3 — process-wide busy with stale streaming on another chat

1. Claim: the active-generation guard eliminates ordinary cold-start stale
   streaming classification but is not chat-keyed.
2. Resolved: cold boot has no active lease; base and bg stores expose one
   process-wide busy value; the target chat contributes its own
   `isStreaming`.
3. Blocked link: source state does not prove whether a user can select a
   separately stale chat while another chat owns the active lease in every UI
   mode.
4. Limitation: that requires a pre-existing stale flag plus cross-chat
   navigation during another generation. K14 performs no data write in this
   state.
5. Review method: if such a stale flag is observed, switch chats during a
   generation and check whether only temporary render optimization occurs.
   A blocked edit, stale final display after busy clears, or wrong-chat data
   mutation reopens the classification design.

#### S4 — inherited 32-bit render hash

1. Claim: K14 preserves the host's 32-bit render hash and therefore does not
   guarantee collision-free component identity.
2. Resolved: the full identity retains structural fields, while the final
   host reduction is the existing `hashCode()` implementation.
3. Blocked link: no production collision-frequency measurement exists, and a
   collision is not constructively ruled out by a 32-bit hash.
4. Limitation: replacing the host key affects every chat message and DOM
   lookup, not only streamed messages.
5. Review method: an observed container showing another message's structural
   controls under the same `x-hashed` value is the reopening signal. A wider
   bounded key reduces collision probability; using raw message text as a DOM
   key avoids hashing but increases attribute size and selector-escaping
   exposure.

### Cross-piece interaction

The interaction requiring K14 with other admitted pieces was checked
separately:

- K13 provider chunks update the same chat message that K14 observes;
- K14 changes display identity only and does not frame or replay K13 bytes;
- the bg adapter follows existing bg UI hooks but does not touch K13
  transport or bg result delivery;
- lazy-chat composition retained its three existing ordered relationships,
  with no K14 collision;
- base and combined focused suites each passed 26 tests;
- clean full graphs passed 950 and 1,235 tests;
- both production builds and the bg bundle load check passed;
- all 2,048 public selections completed exact managed round trips.

The remaining cross-piece observation is S1's physical iPhone
scroll/background behavior. It is deferred by the user's explicit decision
to perform one consolidated L3 session after all planned local Kei
integrations.

## Consolidated L3 scenario for K14

The later aggregate iPhone session must record K14 separately:

1. Choose a model preset whose own streaming switch is on. If practical,
   leave the global classic-provider streaming switch off to exercise the
   per-preset path.
2. Start a reply long enough to keep streaming visibly active.
3. While text is still arriving, scroll several messages upward and stop
   touching the screen. Confirm that the viewport is not reset to the newest
   message for every chunk.
4. Return to the bottom and confirm that the same reply grows without
   duplicate/missing text or repeated whole-message flicker. A single
   lifecycle refresh when streaming finishes is distinct from per-chunk
   remounting.
5. With auto-translation enabled, confirm that partial text is not repeatedly
   translated and that completed text becomes eligible for the normal
   translation flow after streaming ends.
6. In a separate bg-preserve run, background the PWA while generating, return
   after completion, and confirm one final reply, no duplicate result/conflict
   caused by delivery, and cleared streaming/busy UI.

No K14 L3 result is claimed in this receipt.

## Remaining review and publication state

Automated gates and this audit do not substitute for the physical-device
surface above. The K14 mobile gate remains pending as one separately recorded
scenario inside the later consolidated L3 session.

The work remains local for review. No push, tag, release, production apply,
live PocketRisu modification, or PocketRisu restart was performed.
