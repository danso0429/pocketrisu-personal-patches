# PocketRisu 1.9 Kei K13 stream parser validation

## Scope and decision

K13 is qualified on exact PocketRisu 1.9.0 without changing its 1.8.1 patch
bytes. Official 1.9 still has the two framing defects K13 owns:

- the classic OpenAI-compatible transformer repeatedly decodes and splits an
  accumulated buffer rather than framing byte chunks once;
- the classic Google/Vertex transformer creates a decoder per chunk and
  accepts only a single `data: ` line.

The existing K13 import anchors and complete transformer anchors remain exact
on 1.9. Its pure replayable SSE core and mutually exclusive base/BG adapters
therefore remain the smaller ownership boundary. K13 does not copy 1.9 request
logs, native model jobs, endpoint selection, fetch, abort, tool execution,
storage, or BG delivery.

The core and both generated adapter manifests now explicitly verify exact
PocketRisu 1.8.1 and 1.9.0. No target variant was introduced because their
owned and managed bytes are identical on the two exact targets.

## Target graphs and observed gates

- The focused base plan resolved the four-unit core and four-unit base
  adapter with zero collisions. Adding toolchain hardening retained a
  zero-collision graph.
- The focused BG plan resolved the core, BG adapter, target-scoped BG owner,
  and storage base as 188 units with zero collisions; toolchain hardening made
  195 units across 95 managed source/toolchain paths.
- Base focused tests passed 3 files / 15 tests. The exact-1.9 full frontend
  suite passed 72 files / 1,055 tests plus 3 skips.
- BG focused parser/delivery tests passed 6 files / 42 tests. The exact-1.9
  full frontend suite passed 94 files / 1,240 tests plus 3 skips, and the
  server suite passed 4 files / 99 tests.
- Base diagnostics reported 0 errors and the same four upstream
  `DefaultChatScreen.svelte` warnings. BG diagnostics reported 0 errors and
  0 warnings. Both production builds completed successfully.
- The base and BG candidates each produced a zero-change repeated plan,
  status `current`, and no non-current managed files. Empty-selection revert
  changed 10 files for base and 96 for BG, including private patch state;
  both then reported status `clean` and zero tracked diff.
- The patcher contract suite passed after adding explicit dual-target
  assertions for the core and both adapters.

The final dual-target exhaustive catalog gate remains an aggregate gate after
all Kei children and K12 are rebased. No aggregate result is inferred here.

## L2.5 runtime audit

### Phase 1 — flat discovery

- byte chunks, incremental UTF-8 decoding, LF/CRLF/bare-CR boundaries,
  comments, BOM, multiline data, blank-line dispatch, EOF flush, and replay;
- incomplete-line/event retention, cumulative provider output, scan cost, and
  absence of a K13-specific byte cap;
- classic OpenAI-compatible routing, indexed text, reasoning, tool fragments,
  malformed JSON recovery, usage, completion, and follow-up requests;
- classic Google/Vertex routing, thought/text state, function calls,
  signatures, usage, model status, malformed JSON recovery, and follow-up;
- fetch and reader aborts, `pipeTo()` errors, custom endpoints, credentials,
  provider selection, and preset-model SSE routing;
- BG native-job exclusion, delegation, raw-byte replay, offset recovery,
  completion, ACK, cancellation, and no-resurrection behavior;
- parser and provider-state lifetime, storage calls, logs, sockets, timers,
  listeners, installation state, apply/reapply/status/revert, and target
  compatibility.

### Phase 2 — external-anchor resolution

- **Framing and replay — focused tests plus source read.** The pure core has
  no imports or side effects. One streaming `TextDecoder` owns split UTF-8,
  line boundaries, event dispatch, EOF, and replayable fresh state. Tests
  cover split emoji/CRLF, multiline events, mixed newlines, malformed-then-
  valid recovery, replay, and a fragmented long line.
- **Provider preservation — complete-host read plus full suites.** The two
  adapters replace only the parser transformer in the exact 1.9 OpenAI and
  Google hosts. Fetch parameters, custom endpoints, abort signals, tool
  follow-up, reasoning, usage, signatures, and provider routing remain in
  their original owners. Model Preset routes retain their separate SSE
  adapter.
- **BG composition — ordered graph plus focused delivery tests.** The BG
  Google units run after existing delivery hooks. Native model jobs remain
  excluded only inside the cloned server database, and BG continues to feed
  raw response bytes through the same K13 parser without acquiring a second
  transport or generation owner.
- **Storage side effect — preserved prepared surface.** Google signature
  placeholders still invoke the inherited fire-and-forget signature save.
  K13 prevents repeated parsing from duplicating the invocation but does not
  make that storage promise durable or change its failure policy.
- **Resources — bounded-owner read plus prepared surface.** K13 creates no
  timer, listener, socket, retry loop, filesystem handle, or global registry;
  parser state lives for one stream and consumed lines/events are released.
  One unterminated event and cumulative provider output remain response-sized
  with no new byte cap.
- **Installation — measured round trip.** Exact 1.9 plans had zero collisions,
  zero-change replans, current status, and exact tracked restoration for both
  base and BG graphs. Exact 1.8 units are unchanged; the later aggregate
  verifier remains responsible for the whole dual-target catalog.

### Phase 3 — triage

- **Q3, resolved:** exact 1.9 retains both framing defects and exact anchors;
  K13 remains a focused parser owner rather than duplicating request logs or
  native model-job behavior.
- **Q3, resolved by observed gates:** focused/full tests, diagnostics, builds,
  plan/apply/replan/status/revert, and tracked-tree comparison passed for base
  and BG graphs.
- **Q4, prepared surface:** an unterminated provider event has no K13-specific
  byte limit. Revisit only with a provider-size or memory signal.
- **Q4, prepared surface:** inherited signature-save rejection and source
  `pipeTo()` promise handling are not hidden by the parser qualification.
- **Q4, pending device/provider observation:** actual mobile network chunking,
  background completion, and provider-specific reasoning/tool/signature
  payloads remain for consolidated L3.

## Concrete iPhone L3

1. With classic OpenAI-compatible streaming enabled, generate a response that
   visibly contains multiple paragraphs, emoji, reasoning, and—when the
   selected model supports it—a tool call. Confirm the final text is complete,
   ordered, and neither duplicated nor truncated.
2. With classic Gemini/Vertex streaming enabled, generate text containing
   emoji and reasoning/tool content. Background the PWA while text is arriving,
   return after completion, and confirm one complete reply, cleared streaming/
   busy UI, and no duplicate or missing segment.
3. If the provider emits inlay signatures, reopen the completed reply and
   exercise the signed tool/function result. A missing placeholder, duplicate
   tool call, signature lookup failure, or replayed text is the unsafe signal.

Device testing cannot force exact byte-boundary splits, so the automated
fragmentation tests remain the boundary-specific evidence while L3 checks the
real provider and iOS lifecycle.

No live apply, restart, push, tag, release, or installer rebuild was performed.
