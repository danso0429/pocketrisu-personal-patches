# G1.1 anchored server chat commits

Date: 2026-09-30 KST
Candidate: `0.2.4-experimental.12` (lazy-chat-bg-adapter `0.7.19`, lazy-chat-sync `0.5.5`).
Status: implemented, automatically validated and reviewed; live delivery and device observation pending.

## Behavior

The server resolves a completed answer against the latest canonical chat inside the existing storage queue. It finds the submitted input by message ID, preserves independent edits saved during generation, and inserts generated messages immediately after that input. Deleting the input or chat, or inserting an unknown trailing message, prevents insertion without creating a conflict copy.

The user selected preservation of user edits when a script and user change the same field. Independent server message, memory and script-state changes are applied; overlapping changes keep the current value and set a durable receipt reason. Successful client adoption displays a notice when changes were skipped. Global variables and statistics keep their existing per-key/effect-ID application rules.

The actual execution base is captured before the pipeline mutates it. Legacy messages without IDs receive IDs on the isolated execution copy before capture, with their original values retained for correspondence. Only unique transport-equivalent legacy messages are aligned to the latest chat. Edited or ambiguous legacy history is preserved; it is not duplicated or silently identified by array index. Answer classification uses identities rather than a net increase in message count, so script deletion of earlier history does not hide a generated answer.

Root chat metadata is captured separately. Later name/folder/module changes are considered when resolving the chat; saved metadata is derived from the resolved result rather than the stale execution result.

## Persistence and client boundaries

- Replay is checked before resolving against the latest chat. Cancellation is checked before resolution and again in the transaction; CAS is retained across asynchronous encoding.
- Input receipts retain their original execution revision. The resolved pre-write revision and immutable submitted-result fingerprint are stored separately in version 2 commit records. The resolved material still has an integrity fingerprint. Effects, journal, operation state and receipt are committed atomically.
- Version 1 records remain readable. An old experimental.11 server cannot read version 2 records. Source-only downgrade after new commits is not qualified; retain a compatible reader or prepare a separate verified rollback plan. Exact source revert is not evidence of persisted-data downgrade compatibility.
- Server wire revisions and browser view fingerprints are different formats. A remembered acknowledged/adopted storage snapshot bridges the receipt's exact pre-write revision to the existing browser fingerprint. A mere GET does not establish that basis. Unsaved edits, edits during the read, unknown acknowledgements and unavailable cached bases do not gain permission to overwrite the local view.
- The existing G1.12 bounded-adoption refusal and finished-error cleanup remain. A semantic insertion conflict or deterministic invalid generated identity stops local retry and clears the local marker without acknowledging/deleting its server result. The notice states that the current UI cannot open that retained result; existing server retention still applies.
- A versioned server answer-presence field keeps client no-answer classification consistent when scripts add or remove other messages. Generic persistence failures retain their existing unconfirmed-result handling.

## Verification scope

Tests use actual SQLite, storage codecs, generated routes and child server/client processes. They cover edit-before-answer and answer-before-edit, exact replay and changed-source refusal, all synchronous transaction-write failures, cancellation before a missing-anchor decision, a competing write during journal encoding, deleted input/chat, unknown suffix, root metadata, legacy ID assignment, skipped script edits, real wire/view fingerprint conversion and delayed client edits. A generated-function test executes the actual `runServerPreview` body with synthetic provider leaves to check capture ordering. These do not establish real provider behavior or physical iPhone suspension.

The intervening G1.12 changes were retained by starting from delivered commit `c9c4c9c`. The original WIP and unrelated home-navigation changes were preserved. Only the generated installer overlapped the original WIP; maintained source applied cleanly to the new base.

Initial Opus review prompted investigation of result classification and invalid identities. Codex independently reproduced a wire/view fingerprint mismatch missed by that review, replaced the misleading synthetic equality test with actual fingerprint/storage/adopter checks, and added an HTTP save/adopt process case. Native history-ID backfill was also traced and covered explicitly. The remaining review concern about script-added ID-less messages was confirmed in the actual trigger/scripting APIs and fixed by assigning missing result IDs before computing owners. A malformed entry preserves the already-generated answer and becomes a retained identity failure. The final scoped review found no new defect; it did not execute tests. Ordinary `setChat` and trigger modification paths were additionally checked to modify values in place and preserve IDs.

| Check | Observed result |
| --- | --- |
| Full frontend | 2,044 passed / four conditional skips; the new conditional client case ran in the child-process harness |
| Full server | 415 passed / 12 existing skips, before the final missing-result-ID normalization |
| Final affected server/route/generated-body/process tests | 95/95 after normalization; final malformed-result route addition 15/15 |
| Final affected client tests | 64/64 |
| Compatibility | 74 passed / five existing skips |
| Patcher | 51/51 test groups |
| Svelte / help | Zero errors and warnings; Korean translation check passed |
| Production builds | Frontend 8,009 modules; BG 8,731 KB built and loaded |
| Composition | 42 packs / 1,180 units / seven declared collisions; replan zero |
| Exact revert | 1,022 baseline files; byte/mode mismatch zero |
| Managed candidate readback | 433 paths; hash/mode drift zero |
| Final installer | 5,628,641 bytes; mode 0755; SHA-256 `9a64928d274c4608f07590477cc58c9e7e19c3d91ed91fb2e9b64ec428920da8` |

The final test-only addition follows the last application-code review and verifies actual terminal result persistence, the typed identity reason and preserved answer. Existing bundler warnings remain. No provider generation request was used for these checks.

## Limits

Admission now allows earlier chat differences, but the prompt still uses the submitted execution context. G1.3 assembly-time freshness and its unreflected-context notification are not implemented here. Reroll and continuation retain their existing client-owned path; broader N+1 admission and server plugin hosting are separate goals.

An evicted saved snapshot or later unsaved edits can still prevent direct view adoption; G1.12 stops repeated permanent refusal. General message-ID merge adoption without a reliable local basis, a retained-result browser and the G1.8 notification center remain separate work. Existing legacy ambiguity, true overlapping client-save changes and opaque value limitations remain.

The previously reported startup recovery stall was investigated read-only. Existing records/journal hashes and applied receipts validated; a later snapshot found referenced chats absent from current chat metadata. No deleted chat was restored and no recovery/user record was removed. This does not prove that every historical stalled record had the same cause.

The required iPhone observation remains editing an earlier message while generation runs, leaving the app, then returning to the original chat and verifying that both the edit and answer remain and subsequent saving works. Full G1 qualification and stable publication remain open.
