# G1.7 rejected-handle reuse and auxiliary caller qualification

2026-10-10 KST. Baseline `b52bc9c` / experimental.31; candidate `0.2.4-experimental.32`, BG adapter `0.7.39`, Personal settings `0.5.14`. Production remains hostOFF. This is a scoped pre-M7 runtime correction and caller evidence unit, not production activation or aggregate qualification.

## Rejected serialization contract

The baseline eagerly installed function/signal/stream handles while packing. A caught oversized frame left its stream locked despite pending0/peer-open, and later type/value/getter failures could retain partial handles. The unchanged original MARP's measured ordinary arguments are plain data; generic handle-bearing reuse was explicitly unqualified.

Serialization now encodes payload getters/iterators before acquiring resources, records local placeholder slots and de-duplicates objects. Native materialization rechecks committed IDs and caps; a nested call that published during encoding owns its handles independently. A locked stream fails before its identity is installed. Only newly acquired resources are rolled back on materialization failure or a known worker pre-write oversized frame/return: delete their identities/maps, detach new listeners and release unread reader locks. No read/cancel, handle-ID reuse, guest/API effect rollback or automatic replay is introduced. Previously published handles remain owned.

Signal state is read with the native getter during materialization. Pre-aborted/shared signals and aborts during encoding retain ordered native behavior. Closed and pending guards are rechecked after encoding, including the tiny refusal-report fallback. Method/context types are checked before packing against the existing receiving contract. Unmarked transport/backpressure failures retain fatal teardown and cancellation; parent overcap remains fatal. The original cap values, one pending ID/context/timer and wire tag schema stay unchanged. Once admitted to a pending slot, recoverable frame/value refusal still awaits its mandatory phase notice. An already saturated call that cannot acquire a slot fails locally without that report; uncaught failure may still produce the existing terminal host notice.

Response metadata is validated as primitive scalars/header pairs; URL/type/redirected and null/error bodies are preserved. Native instance operations are captured so own getReader/listener/aborted overrides cannot fake resource ownership. Private frames use a non-enumerable native JSON renderer that copies their wire tree without inherited formatters. A separate prototype-toJSON counterexample had reordered nested calls2→1 and caused protocol failure; the renderer prevents those formatters from executing on private frames while preserving ordinary in-memory frame fields and serialized v1 data.

This is codec-level cleanup for supported values and untampered codec intrinsics, with explicit instance/inherited-JSON controls. It is not VM/host-realm isolation: other prototype tampering can still corrupt a guest's codec. The existing OS subprocess and parent validation remain the isolation boundary. Finished/consumed/cancelled stream re-export still has the existing stale-ID limitation; this checkpoint qualifies rejected, unread resources, not arbitrary completed-stream reuse.

Node25.9 reference: [official webstreams documentation](https://github.com/nodejs/node/blob/v25.9.0/doc/api/webstreams.md). Context7 fetched the installed version's lock/release/cancel definitions. Actual reuse, bodyUsed, first bytes and cancel-spy assertions establish application behavior; source wording alone is not the result.

## Actual caller inventory and role evidence

Current generated exact-1.10 source has21 literal call/declaration/test matches:17 external call sites, one outer→Main dispatcher call, two declarations and one test text. Broader non-import reference search finds26 names, with the extra matches accounted for by five comments and the bundle binding. No aliased assignment was found in that source search. The separate CJS server binding delegates to Main dynamically and is included below. This is an inventory of current native code, not arbitrary user/plugin code.

| Source caller | Role passed to native request | Boundary |
| --- | --- | --- |
| Generation `index.svelte.ts:1617` | `model` | Main outer request/hook path. |
| Generation auxiliary `index.svelte.ts:1965` | `emotion` | Conditional generation branch; source role evidence. |
| Emotion inference `index.svelte.ts:2162` | `emotion` | Conditional generation branch; source role evidence. |
| HypaV3 `memory/hypav3.ts:1727` | `memory` | Source mapping; full memory feature not executed here. |
| Translator `translator.ts:573` | `translate` | Source mapping; full translator feature not executed here. |
| Prompt helper `stableDiff.ts:34` | `submodel` | Source mapping. |
| Lua `scriptings.ts:593,640` | `model` | Main LLM helpers. |
| Lua `scriptings.ts:955` | `otherAx` | Actual axLLM input caller measured below. |
| Input trigger `triggers.ts:1473` | `model` | Actual caller already measured in raw-provider checkpoint. |
| v2 trigger `triggers.ts:1902` | `effect.model` | Native type permits `model`/`submodel`; both measured. |
| MCP `mcp/aiaccess.ts:62` | `otherAx` for lite, otherwise `model` | Source mapping; MCP admission restrictions retained. |
| Suggestion UI `Suggestion.svelte:82` | `submodel` | Separate UI/owner, not a server-completion claim. |
| Subtitle UI `PlaygroundSubtitle.svelte:80,299` | `model` | Client playground paths. |
| Image translation UI `PlaygroundImageTrans.svelte:162` | `translate` | Client playground path. |
| Native v3 `v3.svelte.ts:1499` | `options.mode` | Direct Main; does not enter the outer beforeRequest loop. |
| CJS host `runLLMModel`→bundle Main binding | `options.mode` | Matches that native API boundary; other adapters/interceptors remain. |

The outer dispatcher actually invokes `replacer(arg.formated, model)`. Existing explicit role18 controls characterize the unchanged original script but do not execute all these native features. No static direct call in this inventory supplies `lb-process`; its explicit hook control is not promoted to native caller qualification. Dynamic API values remain separate.

The maintained authenticated raw HTTP probe now executes actual low-level v2 input triggers and Lua axLLM, then actual main, canonical attachment and normal-chat/journal storage. Original Lite0.9.2 bytes are unchanged. A fixture-only Set.add/delete observer forwards callbacks and preserves original deletion identity; it reports actual dispatcher arguments rather than injecting roles. Credentials/transports are synthetic.

| Scenario | Observed roles | MARP analysis / native requests / saved answers |
| --- | --- | --- |
| v2 default main-only | model, submodel, model | 6 / 3 / 1; injection true,false,true. |
| v2 main-only disabled | model, submodel, model | 9 / 3 / 1; injection true,true,true. |
| Lua axLLM default | otherAx, model | 3 / 2 / 1; injection false,true. |
| Lua axLLM main-only disabled | otherAx, model | 6 / 2 / 1; injection true,true. |

All four pass with actual input-variable values, one stored user input/answer, commit journal and no host/observer/unknown-network failure. These establish role mapping through those callers; they do not claim all Hypa/emotion/translation/MCP/playground paths, real providers, iPhone or combined late-failure Lua-stream consumption.

## Verification

- Local wire30 pass: mixed stream/Response/function/signal refusal and reuse, type/value/getter and locked-reader failure, nested publication in both directions,63/64 stream cap and260 refused callback allocations, signal ordering/duplication, native instance overrides, Response error/null/multiple-header metadata, byte streams, failed returns, parent packing failure, unchanged fatal cancellation, closed/tiny-control/pending guards and inherited formatter exclusion.
- Actual OS worker11, session9, host96 pass. Two new guest frame/value cases assert rejected API/effects0, one immutable notice, same-object second-call transfer/read/callback/signal, exactly one valid effect and hook cleanup. Host storage/transport fixtures are not normal-chat persistence evidence; raw HTTP supplies that separate axis.
- Byte-original protocol35/M3 resource13 and reviewed actual auxiliary4 plus healthy provider/nested input latch/canonical cache recovery3 pass. Caps, assertions and existing skips are not weakened.
- Full server516/12 existing skips/42 files and patcher52 file entries pass. Client2303/4 skips, compat74/5 skips, types0/0, frontend8022 and BG build/load retain the experimental.31 runs on unchanged frontend/bundle inputs; they are not newly executed counts for this codec-only delta. Delivery build/load is recorded after execution.
- Complete graph42/1528/7, replan0 and exact1022 source byte/mode revert pass. Final installer7,160,536bytes/0755, SHA-256 `42d14ccdc7cf29f3f72d3a0052fb010e6d5234909082bee28288223303fca7bc`; reproducible rebuild matches. The local pair delivers in-memory frame objects while measuring JSON bytes; actual OS worker/session/host execution supplies separate byte roundtrip evidence. The formatter test models host-realm prototype access in a single realm; it is not an executed VM escape test.

Planning consultation replaced a provisional/published tracking proposal with staged encoding/materialization. Mid consultation identified the closed fallback/pending edges and the distinction between codec cleanup and VM isolation. Codex reproduced the inherited-formatter late-call counterexample, disproving the consultant's earlier no-JSON-hook inference, and added private wire rendering. Direct tests and actual caller observations are Codex measurements, not consultant runs. The initial null-context fixture assertion and restricted worker budget-unavailable run are separate failed diagnostics, corrected without weakening runtime assertions. Final consultation reread the whole worker/validation and selected local probe sections, finding no scoped OFF-delivery blocker and refining notice scope above. It did not read other probes/caller bodies/audits or execute tests/hashes. Current AGENTS and the continuing user authorization govern one-flow candidate delivery.

## Remaining gates and delivery

Next is final M7/G1.5b installed-combination qualification, request-specific admission and activation conditions, carrying source-only feature/unknown registration intent limits above. G1.8/G1.9 failure/stream remainder, actual providers and G1.10 physical/aggregate remain separate; unchanged official Archive Center G2 follows G1 completion. Production hostOFF, original scripts, permissions and process lifetime are retained. Final consultation and safe delivery readback are pending; no stable tag/release or broad device pass is implied.
