# PocketRisu 1.9 Kei K29-F02 G06 provider/request matrix

Date: 2026-08-02 KST

## Decision and scope

G06 receives no runtime implementation in this cycle. The approved admission
rule allowed standard non-Gemini reroll/continue only if the existing BG owner
could preserve custom/local endpoints, provider override, the blocking caller,
browser epilogue, swipe target, cancel, and exact-once materialization. Exact
PocketRisu 1.9 source inspection found that the blocker is request semantics,
not a missing provider allowlist. No provider family supplies a safe subset of
the current contract.

This receipt does not generalize to G07, G08, G12, G13-G15, or G20. It does not
change live-token replay, translation, HypaMemory, Lua, server-restart partial
materialization, provider policy, endpoint policy, or the existing BG state
machine.

## Provider and request-class matrix

| Provider/request family | Ordinary send authority | Reroll/continue authority | Cold/suspend transport | G06 decision |
| --- | --- | --- | --- | --- |
| Classic hosted non-Gemini formats, including OpenAI-compatible/Responses, Anthropic, NovelAI, Mistral, Cohere, and Horde families | Existing BG clone can resolve the configured classic provider for an ordinary append | Browser `sendChatMain`; both paths intentionally pass `noBgOrch` | No generic typed non-Gemini reroll/continue result owner | Blocked on operation semantics |
| Classic reverse proxy and `xcustom` | Runtime URL, key, and format remain selected by the existing request owner | Same blocking browser caller | Custom route is caller-owned | Blocked; no endpoint allowlist |
| Classic local/browser/plugin paths, including Ooba, Kobold, Ollama, WebLLM, and plugin models | Local network, browser runtime, WebSocket, or plugin owner may be required; the BG bundle stubs WebLLM | Same blocking browser caller | Not uniformly server-capable | Excluded from composition; existing client owner preserved |
| ModelPreset `openai-compatible` and `anthropic-messages` | Native server jobs are conditional on settings, tools, and preview state; otherwise the browser calls directly | Same blocking browser caller | Native job recovery replays raw output by generation ID only | Blocked on typed target and epilogue |
| Custom/local ModelPreset profiles | Existing profile and endpoint owners remain authoritative | Same blocking browser caller | A native job may transport bytes but does not own the operation result | Blocked; no partial allowlist |
| ModelPreset/classic Gemini | Existing Gemini/native paths remain separate | Outside approved non-Gemini G06 | Existing owner retained | No new unit |
| Static model, preset-chain, and effective-provider override | The effective provider can be selected after the top-level BG gate | Still reaches the same reroll/continue caller | Top-level provider identity is not authoritative | Blocked; provider guessing is unsafe |

## Exact caller and contract blockers

1. **Blocking caller versus detached return.** Continue enters
   `DefaultChatScreen.svelte` through `sendChatMain` with `continue:true` and
   `noBgOrch:true`. Reroll truncates the chat and then awaits
   `sendChatMain(false, true)` before it restores trailing comments and builds
   the swipe array. `runServerOrchestratedChat()` starts a detached POST and
   returns `{ handled: true }` before the paid result. Removing only the gate
   would run reroll's browser epilogue too early.
2. **No typed operation request.** The current BG start body carries
   character/chat coordinates, the current chat snapshot, and a revision. It
   carries no append/continue/reroll kind, replace target, saved swipe list,
   trailing comments, or original rollback snapshot. The server always invokes
   ordinary `sendChat(-1, { signal })`.
3. **Continue is not append.** Continue replaces or extends the existing
   assistant row and may leave message count unchanged. Both the server
   terminal predicate and client result acceptance currently require message
   growth, so a correct continue can be classified as missing main output and
   fall back into a second paid call.
4. **Reroll epilogue is browser-local.** `savedSwipes`, `swipeId`, trailing
   comments, and the original rollback snapshot live in the reroll closure.
   Current BG full-chat merge/conflict-copy and operation ACK are exact-once for
   an append-oriented snapshot; they do not materialize this target-specific
   epilogue.
5. **Cancel lacks reroll rollback.** The existing cancel owner aborts the exact
   operation and suppresses later result publication. It does not restore a
   chat that reroll already truncated before delegation.
6. **Native job recovery is not a typed substitute.** ModelPreset recovery
   fills or inserts raw text using generation identity. It deliberately omits
   output edits, triggers, translation, TTS, and auto-continue and knows neither
   the continue prefix nor reroll swipe/comment placement.
7. **Provider allowlisting is downstream-incomplete.** Fallback chains and
   preset selection can change the effective provider after the top-level BG
   decision. Even a hosted-only allowlist would leave all six operation-level
   blockers above.

## Preservation result and future admission boundary

The existing `noBgOrch` reroll/continue gates remain unchanged. Custom/local
endpoints, provider override, browser blocking behavior, swipe/comment
materialization, cancel behavior, and current exact-once append recovery retain
their original owners. No runtime unit, schema, state, or provider policy was
added, so exact revert is the removal of this documentation-only receipt and
its ledger/catalog references.

A later admission would first need an operation-typed append/continue/reroll
contract inside the existing BG owner; a durable target, original snapshot,
saved swipes, and trailing comments; continue-aware success and merge;
blocking live completion plus a cold exact-once typed epilogue; and reroll
cancel rollback. That is a separate design surface and may not be inferred from
the current G06 approval.

## Validation and publication boundary

- Exact official target: PocketRisu `1.9.0`, commit
  `85a65f3137b45c8de4a8d21a9887be213b1ac3fc`.
- The matrix was checked across classic hosted, reverse-proxy/custom,
  local/browser/plugin, ModelPreset, native-job, override, cancel, merge, and
  browser-epilogue callers.
- The focused negative graph test contains three cases and passed. It locks the
  reroll/continue `noBgOrch` gates, ordinary-append start/materialization
  contract, message-growth predicate, and client-epilogue gate without adding a
  runtime unit.
- The complete patcher suite passed 38/38 test files after that negative test
  was added.
- Independent read-only review reached the same conclusion: no hosted-provider
  subset avoids the request-semantic blockers.
- G07, G08, G12, G13-G15, G20, and Gemini-specific paths were not generalized.
- No live target, patch state, user data, preserved K12 index, process, push,
  tag, release, apply, or restart was changed.

## L2.5 negative runtime audit

### Phase 1 — flat discovery

- continue and reroll UI entry, `sendChatMain`, pre-generation mutation,
  blocking return, failure rollback, swipe/comment epilogue, and cancel;
- top-level BG admission, provider/preset override, start payload, detached
  server call, terminal predicate, merge, ACK, fallback, and cold recovery;
- classic hosted, custom/reverse-proxy, local/browser/plugin, ModelPreset,
  native-job, and Gemini exclusion boundaries.

### Phase 2 — external-anchor resolution

- **Blocking caller — exact source.** Reroll still passes `false, true` and
  continue still derives `noBgOrch: noBgOrch || continued`; the BG redirect
  still requires `!arg.noBgOrch`.
- **Ordinary-only server — exact source and negative test.** The exact-1.9 start
  body has no typed operation/target/epilogue fields, the server calls
  `idx.sendChat(-1, { signal })`, and both terminal sides require message-count
  growth.
- **Provider matrix — complete caller inspection.** Runtime provider override
  and local/custom transports occur below or outside the top-level BG gate, so
  no static hosted-provider list establishes the requested contracts.
- **No graph mutation — manifest inspection.** G06 adds no unit, pack,
  dependency, collision, schema, or state owner. The focused negative test and
  complete patcher suite passed with the original runtime gates intact.

### Phase 3 — triage

- **Blocked, not deferred by provider:** typed continue/reroll operation state,
  blocking/cold materialization, reroll rollback, and browser epilogue are
  missing from the current BG contract.
- **Preserved:** custom/local/plugin/provider routes, blocking callers,
  browser epilogue, swipe target, cancel, and existing append exact-once owner.
- **Excluded:** G07, G08, G12, G13-G15, G20, and all broader provider or
  privacy-policy changes.
