# G1.9 streaming relay

2026-10-12 KST. Baseline c325ac8 / experimental.39 / BG adapter0.7.46. The ordered BG goals remain authority. G1.8 scoped closeout is preserved. G1.10 real-provider/aggregate/activation/stable and unchanged official AC G2 remain separate.

## Outcome and ownership

Show the running server-owned answer with Markdown and folded thoughts in a transient slot beside the newest chat messages. The user selected formatted display. No provisional message enters the client database, save tracker, result store or ACK protocol. Closing a preview observation never cancels generation. Existing canonical commit and result recovery own the completed answer.

## Source consultation and implementation

Opus5.5 medium planning consultation recommended pulling the native bundle's current display row rather than adding hooks to the native streaming loop. The actual bundle/live-DB equivalence must be measured. Use the displayed message's chatId rather than the recursive generationId: auto-continue extends an existing row; resend adds a new row. Length can decrease, so order follows a revision, not text length.

1. Register one display reader only for the existing locked full operation with ordered-result/server-commit authority. Verify character/chat identity on every read. Release before the shared lock is released. Nonstream and input/aux streams do not create answer previews.
2. Provide an authenticated no-store GET with no durable writes, delivery claim, ACK or cancellation. Relay only operation/row identity, display text, revision and display flags. Unchanged revisions omit text. A 256KiB UTF8 display budget withholds oversized text instead of slicing thought/HTML boundaries; it never changes the generated answer.
3. Poll only the visible selected chat, with a single bounded header/body observation, teardown abort and stale epoch/revision guards. Hide a preview once the actual row is canonical or the stream stops. Missing observations do not authorize failure, fallback or marker settlement.
4. Reuse `ParseMarkdown(text, null, 'normal')` for native Markdown/HTML/thought/style/sanitization, closing incomplete thought markup only for display. Full Chat/ChatBody include index-dependent writes, translation and display-trigger effects and are not provisional-message owners. The user explicitly selected common formatting without card/module editdisplay regex/Lua/plugin hooks: text hidden solely by those hooks may appear in the preview. The completed canonical message keeps all native display rules. No full display-hook equivalence is asserted.
5. Actual native balanced SSE exposed an absent requestAnimationFrame in the server bundle and an uncaught process exit. Install a cancellable Node immediate-frame pair in the server banner, preserving native125ms coalescing and existing valid overrides. Verify real execution/cancellation and native stream completion/failure cleanup; browser source is unchanged. Node25.9.0 timer documentation confirms setImmediate/clearImmediate handle semantics.

## Implemented follow-up boundaries

The actual source-stream failure also exposed an unhandled OpenAI pipeTo promise; its readable remains the native failure authority while the separate promise is now handled. First-next-Send root rebases are distinguished from unknown/deferred failures and retried before input admission within the native shared policy. Cancellation cleanup uses current canonical ownership/unchanged-base adoption proof rather than DELETE alone. The preview includes an explicit operation-scoped Stop action because raw generation did not display the legacy composer control. These changes and the observed/failed validation boundaries are recorded in [G1.9 validation](POCKETRISU-G1-9-STREAM-RELAY-VALIDATION.md).

## Validation and delivery

- Genuine generated server/bundle/native Send with synthetic SSE: observe partial text before provider completion; compare native displayed text; prove canonical answer absent before commit, and exact normal-chat answer after completion.
- Test shrinking text, auto-continue/resend row identity, nonstream, final/error/cancel/restart, late Lua stream failure/input scope, provider stream/cleanup and subsequent healthy requests.
- Actual browser foreground, hidden/closed/reopen, navigation, two observers, queued N+1 and lost reads. Prove preview observations do not save or invoke cancel/fallback/ACK.
- L1/L2 plus scoped structural L3 and discovery/anchor/triage L4, fresh final Opus source consultation, complete patch graph/re-plan/exact revert, matching installer, privacy sweep and small commits/push.
- Safe hostOFF candidate delivery follows read-only idleness and verified rollback checks; fresh source/asset/API readback precedes concrete iPhone L5 scenarios. Stable release waits for the required device/aggregate gates.

These are planned checks, not passing results. Production host activation, paid calls, user-data deletion and unrelated source changes are outside this unit.
