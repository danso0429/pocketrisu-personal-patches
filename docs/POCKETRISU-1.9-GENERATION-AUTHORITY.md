# PocketRisu 1.9 generation-authority validation

## Decision boundary

PocketRisu 1.9 native model jobs and `bg-preserve` remain separate owners.
They are composed by request class, not stacked for one request and not
selected through a global replacement of the user's Server-Side Requests
setting.

The target-scoped 1.9 adapter is qualified. This validation does not apply a
candidate to the live service and does not qualify the later aggregate
candidate.

## Single-owner table

| Request class | Execution / transport owner | Terminal persistence and recovery owner | Cancel owner |
| --- | --- | --- | --- |
| Ordinary top-level send eligible for complete background orchestration | `bg-preserve` server orchestration owns ax → main → post. The redirect runs before PocketRisu registers a native pending send. The cloned server DB disables native model jobs only for this detached run. | Operation-keyed BG result, first-consumer claim/heartbeat, strict chat/root save, exact revision ACK, cold marker, and no-resurrection state. | Operation-ID BG AbortController and durable cancelled tombstone. |
| Top-level send requiring a browser-only epilogue, continue/reroll, or explicit `noBgOrch` | Original client `sendChat` pipeline. For model presets, native jobs follow the user's Server-Side Requests toggle. Classic Gemini retains BG stream-job delivery; unrelated direct providers remain unchanged. | Native model-job journal/claim for eligible preset requests; the normal client save path otherwise. No BG orchestration result is created. | Native per-chat AbortController; BG stream job cancellation only when that transport was selected. |
| Programmatic, plugin, multisend, or batch call that awaits a blocking result | Original blocking client path via the existing `noBgOrch` adapters. Provider transport follows the same native-preset/BG-classic split as the row above. | The blocking caller and normal client save path; native job claim when selected. | The caller's existing AbortSignal / per-chat controller. |
| Ax/helper request inside an ordinary BG-owned send | The already detached BG server pipeline; native aux jobs are disabled in that cloned DB because the process itself is the persistence boundary. | The enclosing BG operation result; no aux journal is exposed as a chat result. | Enclosing BG operation AbortSignal propagated through async context. |
| Ax/helper request in a client-owned send | Native aux job for eligible model presets; BG stream-sub job for classic Gemini; original direct path otherwise. | Inline caller continuation. Native aux jobs are relay-only and never inserted as chat messages. | The client request AbortSignal and selected provider transport. |
| Boot/return discovery | BG pending markers discover only BG operations. Native `jobRecovery` and pending-send discovery remain active for native jobs and records created before or outside BG orchestration. | Each protocol claims only its own operation/job identifier. | Each protocol cleans only its own identifier. |

## Control-flow invariants

1. An ordinary eligible call reaches the BG redirect immediately after the
   initial stage reset and before native `startGeneration()` or
   `registerPendingSend()`.
2. `runServerOrchestratedChat()` never mutates the browser's
   `nodeOnlyServerSideRequests` preference. The server clone alone sets that
   field false before `setDatabase()` so its internal `sendChat()` cannot
   create nested model jobs or native pending sends.
3. A synchronous BG start failure falls through to the client path. An
   asynchronous failed operation hands off to `bgOrchFallback`; both paths may
   use native jobs because the BG operation did not produce a main result.
4. Native `generationState.doingChat` owns only the client lease. On 1.9 it
   delegates writes into the existing BG coordinator, whose combined read side
   remains true while either the native client map or detached BG operation is
   active. Native cleanup cannot clear a server lease.
5. The 1.9 generation ID is minted before chat/token resolution. BG context is
   registered later, after stable chat coordinates and token metadata exist,
   and binds the exact native per-chat abort controller.
6. Native model-job routes, job journal recovery, request logs, pending-send
   discovery, per-chat generation state, and the user's setting remain in the
   installed source. The adapter narrows their runtime use only inside one
   detached BG clone.

## Upstream-equivalent removals

The 1.9 graph omits four old host hooks rather than reapplying duplicate
behavior:

- `App.svelte` already guards internal/sidebar drags and missing file lists;
- native per-chat abort registration replaces the screen-global BG abort hook;
- native per-chat generation state replaces the former global busy declaration;
- the old global `doingChat` guard no longer exists and the BG entry guard runs
  before the native per-chat guard.

Omission is target-scoped. PocketRisu 1.8.1 keeps the original hooks and
behavior.

## Unsafe counterexamples

- Allowing `nodeOnlyServerSideRequests=true` inside the detached server bundle
  can create a native main/aux job beneath one BG operation, leaving two
  terminal claim and boot-recovery records.
- Registering native pending-send state before the BG redirect can cause a
  later native auto-resend even though BG already parked or delivered a reply.
- Re-exporting native `doingChat` without the BG coordinator lets native
  cleanup make an active detached generation look idle.
- Reusing the early 1.9 `generationId` anchor reads `currentChar`, input tokens,
  and output tokens before initialization; its caught exception silently drops
  context and exact abort binding.
- Disabling the user setting in the browser would remove native preservation
  from client-only and programmatic paths and is therefore not equivalent.

## L2.5 runtime audit

### Phase 1 — flat discovery

- ordinary top-level BG redirect and synchronous/asynchronous fallback;
- native per-chat generation state, pending sends, model-job journal/recovery,
  and the browser Server-Side Requests setting;
- detached server DB clone, full-pipeline result/claim/ACK, cancel, boot
  recovery, and no-resurrection state;
- client-only epilogue, continue/reroll, plugin, multisend, batch, helper, and
  classic Gemini transport paths;
- generation context timing and exact native AbortController binding;
- cache housekeeping fetch authority, composer busy state, and tokenizer
  fallback;
- server bundle build/load, request logs, credentials, storage, and process
  resources;
- iOS background return, cold-start recovery, cancellation, and duplicate
  delivery behavior.

### Phase 2 — external-anchor resolution

- **Owner selection — measured and newly read.** Applied source places the BG
  redirect before native `startGeneration()` and `registerPendingSend()`.
  Client-only/programmatic exclusions remain in the original path, and both
  full and focused native/BG suites passed.
- **Persistence/cancel — measured and newly read.** BG owned result,
  first-consumer claim/heartbeat, revision ACK, durable cancelled tombstone,
  and cold marker implementations remain present. Native journal/recovery and
  pending-send tests also pass, while the server clone prevents the two
  protocols from nesting for one BG-owned run.
- **User setting and fallbacks — adversarial structural check.** No browser DB
  assignment to `nodeOnlyServerSideRequests` was added. Only the detached JSON
  clone changes it, and synchronous start failure or terminal-without-main
  fallback may enter the still-intact native path.
- **Busy/context/abort — measured and newly read.** Native writable state
  delegates client-lease writes into the combined coordinator; its cleanup
  cannot clear a detached server lease. Context registration follows token
  resolution and binds `abortGeneration(genKey)`.
- **Unrelated request classes — structural plus tests.** Browser epilogues,
  continue/reroll, explicit `noBgOrch`, helper, plugin, and batch callers keep
  their blocking semantics. Cache housekeeping retains native
  `makeProxiedFetch(arg.chatId)`, so it bypasses both terminal protocols.
- **Security/storage/resources — structural plus full gates.** The adapter
  adds no credential source, remote endpoint, plugin-array write, database, or
  polling loop. Existing bounded request-log and storage owners remain. Full
  diagnostics, production build, server bundle build/load, and target tests
  passed.
- **Mobile behavior — prepared surface.** Detached automation covers source
  ownership and recovery state machines but cannot observe iOS suspension,
  jetsam, touch state, or the production service. These remain consolidated
  L3 gates rather than inferred successes.

### Phase 3 — triage

- **Q3, fixed:** seven changed 1.9 anchors use mutually exclusive target
  variants; four upstream-equivalent/obsolete 1.8 host hooks are omitted only
  on 1.9.
- **Q3, fixed:** early generation-context registration was moved past stable
  token/chat resolution, eliminating the caught TDZ path that silently lost
  abort context.
- **Q3, fixed:** native busy cleanup now releases only its client lease, and
  the top-level guard reads the combined owner state.
- **Q3, resolved by measured behavior:** full/focused tests, diagnostics,
  build, server bundle, patcher tests, exact ordinary 1.9 round trip, and all
  exact-1.8 catalog selections passed.
- **Q4, next composition gate:** `lazy-chat-bg-adapter` must prove hydration,
  CAS, result delivery, and BG ownership together before any Kei child.
- **Q4, pending user-visible gate:** iPhone background return, cold recovery,
  stop/no-resurrection, client-only native recovery, and browser-only
  epilogues remain for consolidated L3. They block aggregate publication and
  live acceptance, not this local owner commit.

### Concrete iPhone L3

On the future consolidated candidate, use a disposable chat for each case:

1. Start an ordinary BG-eligible generation, background the PWA through ax,
   main, and post-processing, then return. Confirm one completed reply and one
   persisted result after a second cold start.
2. Start another ordinary generation, press Stop, background and return.
   Confirm no late reply, no resumed generation, and no persistent busy state.
3. With Server-Side Requests enabled, use a client-owned continue/reroll or a
   browser-only epilogue path, background or cold-start, and confirm one native
   recovered result without a BG duplicate.
4. Run one programmatic/plugin or batch path that awaits the result and confirm
   its promise resolves only after the reply exists; run a classic Gemini path
   and confirm its stream preservation still completes once.

Duplicate replies, a native pending resend beneath an existing BG result,
native cleanup making an active BG run look idle, post-cancel resurrection, or
a blocking caller resolving before its reply is the unsafe signal.

## Observed validation

- Fresh exact-1.9 maintainer staging resolved `bg-preserve`, its storage-base
  dependency, and toolchain hardening into 187 units over 90 managed paths.
- Target tests passed with 91 frontend files / 1,225 tests plus 3 skips and 4
  server files / 99 tests. Diagnostics, production build, and the generated BG
  server bundle build/load also passed.
- Focused native/BG generation tests passed with 16 frontend files / 185 tests
  and 4 server files / 99 tests. The server subset was rerun with local-listen
  permission after the restricted sandbox rejected `127.0.0.1` with `EPERM`.
- Source inspection confirmed the BG redirect precedes native
  `startGeneration()` and `registerPendingSend()`, context registration follows
  stable token resolution, and only the detached cloned DB disables native
  model jobs.
- The ordinary CLI reported every applied file current and reverted every
  tracked target file to the exact official 1.9 tree. Qualification-only
  untracked bundle and receipt artifacts were outside patch ownership.

- The promoted ordinary exact-1.9 graph resolved 180 units over 89 files with
  zero collisions. Status reported every file current, reapply changed zero
  files, and revert restored zero tracked diff.
- The exact-1.8 catalog gate passed 2,048/2,048 raw selections, 1,024
  normalized graphs, 192 managed paths, a maximum of 425 resolved units, and
  every exact apply/revert round trip.
- The patcher suite passed 30/30 tests.

The next composition boundary is `lazy-chat-bg-adapter`; it must be validated
with both owners active before any Kei child is admitted.
