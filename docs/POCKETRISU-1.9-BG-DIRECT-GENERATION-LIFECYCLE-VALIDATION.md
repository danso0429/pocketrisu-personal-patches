# PocketRisu 1.9 BG direct-generation lifecycle validation

## Result

PocketRisu 1.9 `bg-preserve` version `v1.0.1-patcher.7` now owns both sides of
the native per-chat lifecycle used by BG orchestration: version `.6` closes
every BG-owned direct `sendChat()` caller, while `.7` exposes the earlier
durable-save/server-start preparation interval through the same native keyed
generation owner. The two corrections are committed in `5d10edb` and
`dc82721`; canonical installers are in `fd60890`. They were pushed and
live-admitted in the 542-unit `all` graph. Physical re-L3 remains pending.

The user-visible finding was a completed response followed by a gray stage-0
generation indicator that never stopped. A later Send tap was blocked, and a
new indicator appeared only after a delay. This was not a provider latency or
paid-response-loss finding. Read-only runtime evidence showed one auxiliary
and one main provider request completed with HTTP 200, the response was present
in the canonical chat, and `pending_sends` was zero.

After `.6` was live, the user reported that the retained gray indicator was
gone but a Send tap still waited before any active indicator appeared. Source
inspection placed that remaining delay before server ownership: chat input
processing and the durable-save barrier ran before the browser had registered
any native generation entry. Version `.7` acquires that entry before the
durable save and hands it to the existing server-orchestration busy owner.

## Purpose, trigger, state/result, and preserved contract

| Surface | Contract |
| --- | --- |
| Purpose | End the exact PocketRisu 1.9 `generationStates` entry created by a direct BG-owned `sendChat()` call. |
| Trigger | Server full/LLM/assemble execution and the browser fallback after a server terminal result contains no new main reply. |
| State/result | An idle target chat is acquired before the direct call. Success, early terminal return, or rejection ends only that chat key, resets the shared stage to zero, and lets native busy state rederive from surviving entries. A pre-owned chat returns `false` without invoking the call or cleanup. |
| Preparation state/result | The operation ID owns the exact chat key and stage 1 before durable save. Save failure, abort, and unexpected failure release only that operation ID. On successful POST, server orchestration becomes observable before the preparation entry is released. |
| Browser cleanup | The existing `pendingSends` owner clears the exact chat tombstone. The server clone keeps native server-side jobs disabled and does not issue the browser-route cleanup. |
| Preservation | Other chats' live/background entries, BG operation/result/claim/ACK state, request-log/usage owners, provider selection, custom/local endpoints, blocking callers, cancellation signals, browser completion sound, swipe targets, and exact-once materialization remain in their existing owners. |
| Exclusions | No new database, identity schema, state machine, provider allowlist, G06 operation kind, G07/G08/G12 generalization, or server-restart partial materialization is added. |

## Root cause and corrected control flow

Before the correction:

1. `runServerPreview()` called bundled `idx.sendChat()` directly.
2. PocketRisu 1.9 `sendChat()` registered a real-chat key in
   `generationStates`.
3. `DefaultChatScreen.sendChatMain()` normally calls `endGeneration(genKey)`,
   but the server direct caller bypassed that screen wrapper.
4. Writing `idx.doingChat.set(false)` changed only the public compatibility
   store; it did not remove the map entry.
5. The next server call for that chat returned `false` at the native
   `isChatGenerating(genKey)` guard without provider work.
6. The client learned the no-new-message terminal only on a later poll and
   invoked browser fallback, explaining the delayed indicator.
7. Browser fallback also called `sendChat()` directly and its cleanup wrote
   only `doingChat=false` plus `chatProcessStage=0`. The response completed and
   saved, but the browser map entry remained, explaining the persistent gray
   stage-0 indicator and blocked Send button.

After the correction, `sendChatWithDirectLifecycle()` wraps both callers. Its
`runDirectGenerationLifecycle()` owner checks the exact chat key before the
call and runs keyed `endGeneration()` in `finally`. Server full, LLM preview,
and assemble preview use the wrapper. Browser fallback uses the same wrapper
and leaves `runClientFallbackLifecycle()` responsible only for error isolation
and the completion epilogue.

## Patch and revert surface

Four exact-1.9 units are added:

- keyed lifecycle helper in `src/ts/process/generationState.ts`;
- helper import and `sendChatWithDirectLifecycle()` wrapper in
  `src/ts/process/index.svelte.ts`;
- one owned adversarial test file; and
- ordered composition against the existing abort import.

The two existing exact-1.9 owned adapters change their generated content:

- `src/ts/bgOrchestrate.ts` uses the wrapper for browser fallback; and
- `server/node/bgOrchestrator.cjs` uses it for full, LLM-preview, and
  assemble-preview calls.

Exact pack revert removes the owned test and returns every tracked target byte
and mode to the pre-patch graph. The disposable aggregate target was clean
after revert; only builder-created `server/node/bgOrchBundle.{mjs,css}` remained
untracked.

## Focused adversarial evidence

The runtime test exercises three failure-oriented cases:

- a direct live entry ends while a different background entry survives;
- a rejected direct call still ends its entry and resets the stage; and
- a chat with an existing owner neither invokes the direct call nor runs
  cleanup or resets that owner's stage.

Patcher contracts also assert browser/server caller coverage, absence of the
former server store-only reset, G06's continued ordinary append-only boundary,
ordered composition, idempotent apply, and exact revert.

## Observed automatic gates

| Gate | Observation |
| --- | --- |
| Patcher suite | 38/38 test files passed. |
| Focused applied runtime | 3 files / 10 tests passed. |
| Client suite | 129 files / 1,536 tests passed. |
| Server suite in restricted sandbox | 7/9 files passed; 136 tests passed and 19 skipped. `model-jobs` and `request-logs` could not bind `127.0.0.1` (`listen EPERM`), causing hook timeouts rather than assertion failures. An unsandboxed rerun request was policy-rejected and was not bypassed. |
| Svelte diagnostics | 0 errors / 0 warnings. |
| Production build | 7,857 modules transformed; build completed. |
| BG bundle | 8,201 KB; normal load check reported `sendChat=function`, and a separate load check observed `sendChatWithDirectLifecycle=function`. |
| Aggregate apply/replan | Exact 1.9 aggregate apply completed; repeated plan reported zero changed files. |
| Exact revert | All tracked source returned clean; only generated BG bundle artifacts remained untracked. |
| Combination verifier | 2,048/2,048 raw selections, 1,024 normalized graphs, 223 managed paths, maximum 542 units, round trips passed with four workers. |

The first aggregate apply attempt failed closed before source writes with
`AMBIGUOUS_ORDER` because the new lifecycle import and the existing abort
import shared an anchor. The manifest now orders the lifecycle import after the
abort import; focused tests and the complete combination verifier observed the
resolved graph.

## Generated installers for the direct-caller correction

The canonical builder generated these local artifacts:

| Installer | Bytes | SHA-256 |
| --- | ---: | --- |
| `pocketrisu-patcher.cjs` | 5,091,578 | `ce67ce7d2d8a7150052b57fcb04043597ca8eb9896cbc615999723e1f8b6c097` |
| `pocketrisu-features.cjs` | 5,091,584 | `f3b2a66fb57ee64e8850d85fd0f6e87b4f55a64913622f3a0310ef8a21a28334` |
| `pocketrisu-hardening.cjs` | 5,091,585 | `8e709060e1a5c76fa5da6c884955dc4c18087bc17336e90d42450e76a32b221e` |
| `pocketrisu-all.cjs` | 5,091,579 | `128f3dd53095311df06da7ed223d821d22654916ed6dbd941ccfc41f22230e3a` |

## Live admission and runtime smoke

At 2026-08-02 18:32 KST, the pushed branch HEAD was `82d4878`. Immediately
before stop, PM2 reported active requests 0. Read-only database checks observed
main/aux running jobs 0, unclaimed terminal main jobs 0, `pending_sends` 0,
result payload rows 0, and seven operation-state rows, all already
`delivered`. SQLite `quick_check` was `ok`.

The new installer plan reported compatibility `verified`, 28 packs, 542 units,
five ordered collisions, and six changed paths. PM2 was stopped before apply.
The transactional apply exited 0. The stopped target then produced these
observations:

- frozen install: 109 packages reused, zero downloaded, exit 0;
- client tests: 129 files / 1,536 tests passed;
- server tests: 9 files / 163 tests passed;
- Svelte diagnostics: 0 errors / 0 warnings;
- production build: 7,857 modules transformed, exit 0;
- BG bundle: 8,397,297 bytes, SHA-256
  `c94f51deeddd4726e145fd0c1d1a696f22c0f42b5f91d371f3a0f1cd2039cd85`,
  with four `sendChatWithDirectLifecycle` markers and load check
  `sendChat=function`;
- production prune: exit 0, followed by successful `express`,
  `better-sqlite3`, and `msgpackr` resolution; and
- repeated plan: 28 packs / 542 units / five collisions, zero changed paths,
  and all 218 transaction-managed source paths skipped.

After restart, PM2 reported PocketRisu 1.9.0 online at PID 3485101, zero
unstable restarts, and zero active requests. Root and the rebuilt main asset
both returned HTTP 200. Served and local `index-D8034-nj.js` were each
1,999,173 bytes with SHA-256
`5e01dca445aa6bbdb3ae24e5b824d911321fae8d8a79de0d33108af97d388fb6`.
Both unauthenticated BG status routes returned 401. The PM2 error log remained
exactly 112,042,726 bytes.

Post-restart SQLite `quick_check` remained `ok`; active/unclaimed jobs and
pending sends remained zero; the same seven delivered operation states and
zero result payloads remained. `save/risuai.db`, `save/model-jobs.db`, and
`backups/` retained their observed inode/size values
`786453/2710347776`, `872636/4096`, and `788086/4096`. No nested `save/save`
appeared. The preserved K12 worktree remained at `081a32b` with index-listing
SHA-256 `632b6d3285e85650be19efe5c4f6c70a3af56fdec683fc9a5a182505118704b3`
and cached binary-diff SHA-256
`916440ab240e0f7541844f0082ce53d1d5f516d08ea1bdfc79a55149d7ca66a9`.
No paid request or physical L3 was performed during admission.

## Preparation-indicator follow-up and second live admission

The `.7` follow-up extends only `src/ts/bgOrchestrate.ts` and the native
`src/ts/process/generationState.ts` owner. `endGenerationIfOwned(chatKey,
generationId)` refuses to clear a replacement owner. The four release paths
are durable-save failure, inherited-signal abort, successful server-busy
handoff, and unexpected outer failure. It removes the preparation path's
store-only `doingChat` writes; direct callers remain on the `.6` wrapper.

Focused static/adversarial contracts and the applied runtime test passed, and
the patcher suite passed 38/38 files. A disposable aggregate target applied
542 units, replanned with zero changes, and compared equal to its baseline
after exact revert. The complete verifier passed 2,048/2,048 raw selections,
1,024 normalized graphs, 223 managed paths, maximum 542 units, and all round
trips with one worker.

Canonical installers were deterministic across two builder runs. The `all`
installer was 5,094,115 bytes with SHA-256
`32ae593398b17fbf69d013718c8a251be9b2b77e3439e16bb609d09250e77432`.
The other installer sizes and hashes are recorded in
`docs/POCKETRISU-1.9-SVELTE-MARKER-SAFETY-VALIDATION.md` because the same
generated commit contains both independently owned corrections.

At 2026-08-02 20:25 KST, preflight observed active/queued/unclaimed/pending
work and result payloads all zero, `quick_check=ok`, and nine durable operation
states all `delivered`. PM2 was stopped before the transactional six-source
plus one-state-path apply. Client 129 files / 1,537 tests and server 9 files /
163 tests passed; diagnostics were 0/0; the build transformed 7,857 modules;
the BG bundle load check exposed both direct lifecycle functions; production
prune and dependency resolution passed; and live replan had zero changes.

After restart, PocketRisu 1.9.0 was online at PID 3509259 with zero unstable
restarts and zero active requests. Root/main asset HTTP, served/local byte
identity, database/backup inode and size preservation, zero error-log growth,
zero active/result work, nine delivered states, `quick_check=ok`, and the
preserved K12 hashes all passed. No paid request or physical re-L3 was part of
the admission. The live/installer evidence is shared with the marker-safety
receipt cited above.

## L2.5 runtime audit

### Phase 1 — flat discovery

- server full, LLM-preview, and assemble-preview direct callers;
- browser no-main fallback direct caller and polling delay;
- native generation map, public busy compatibility store, stage store, and
  pending-send tombstone owner;
- DefaultChatScreen's normal wrapper and direct-call bypass;
- provider/custom/local selection, programmatic blocking callers, cancel
  signal, completion epilogue, result claim/ACK/materialization, and G06
  append-only boundary;
- target-scoped unit order, owner-present/absent graph, generated bundle
  export, idempotency, exact revert, and live admission boundary.

### Phase 2 — external-anchor resolution

- **Lifecycle identity — runtime tests and applied source.** The wrapper
  acquires only an idle real-chat key. Rejection cleans it; an existing owner
  and a different background owner survive unchanged.
- **Symptom mapping — production telemetry and source.** Consecutive same-chat
  server calls changed from one real generation to fast no-main terminals,
  while the browser fallback completed a real aux/main pair and left the UI
  busy. The two missing keyed concludes explain the delay and persistent
  stage-zero indicator without attributing either to provider latency.
- **Existing routes — call graph and contract tests.** All provider/model and
  request arguments still enter native `sendChat()`. Programmatic `noBgOrch`
  callers and G06 reroll/continue remain on their former blocking owner; the
  result schema and browser epilogues are unchanged.
- **Graph/revert — generated installer and exhaustive verifier.** Owner-absent
  selection adds no unit; owner-present exact 1.9 adds four units with one
  declared import order. Repeated plan is empty and every raw selection
  round-trips.
- **Build boundary — production and bundle load.** Browser compilation and
  server-bundle export load both completed. The earlier restricted-sandbox
  localhost block remains recorded, and the unchanged live-host suite later
  passed all 9 server files / 163 tests.

### Phase 3 — triage

- **Q3, fixed and live-admitted:** direct BG callers now close native keyed lifecycle
  state instead of writing only the public compatibility store.
- **Q1, no duplicate authority:** native generation state and pending sends
  remain the only owners; BG adds a wrapper, not a second map or schema.
- **Q3, preserved exclusions:** G06 remains append-only and blocked as
  documented; no provider-specific branch or excluded atom was generalized.
- **Q4, pending physical re-L3:** after a client reload, two consecutive ordinary generations in the
  same chat must show the native active indicator without the former
  pre-indicator durable-save gap or poll-delay fallback. Each terminal response
  must remove its circle and leave Send immediately available. Live admission
  does not infer this device result; no paid request, tag, or release was part
  of the admission.
