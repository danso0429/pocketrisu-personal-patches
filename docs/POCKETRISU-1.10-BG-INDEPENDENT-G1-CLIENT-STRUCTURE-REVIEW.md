# PocketRisu 1.10 BG Preserve G1 client-activation structure review

Date: 2026-09-24 KST

Status: **Approved operation-keyed N+1 design boundary. Candidate client
implementation is checkpointed separately; input capability remains 0 and
no product activation or live apply is authorized by this document.**

The control-flow and assumptions below describe the pre-implementation
review. The later candidate and its observed gates are recorded in
`POCKETRISU-1.10-BG-INDEPENDENT-G1-REBASE.md`.

## Observed control and data flow

```text
Legacy ordinary composer send
  -> browser input trigger / editinput / local message append
  -> strict browser chat save and canonical reread
  -> one `runServerOrchestratedChat` watch and local recovery marker
  -> server BG ax -> main -> post
  -> negotiated server response commit, or legacy browser result save
  -> one result poll / hydration / ACK

Internal server-owned input v1 (capability remains 0)
  -> immutable admission and same-process settings snapshot
  -> one queued command and execution predecessor per chat
  -> automatic server drain when predecessor becomes executable
  -> once-only server input transform / normal chat input attachment
  -> server BG generation and C1 chat/effect/receipt commit
  -> normal chat API and revision-bound owner/pending projection
```

The current chat-screen pending component reads the latter projection and
renders distinct queued, attached, generating, blocked-edit, and
execution-unknown states. It does not send an input command, adopt a changed
normal chat, or make the single-operation legacy watch multi-operation aware.

## Assumptions tested against the final callers

1. **A 202 waiting-input response can use the legacy start classifier.**
   False. The legacy classifier treats `started:false` as rejected and can
   trigger client fallback. Input v1 must accept the exact
   `accepted:true`/operation-ID response and never launch a second provider
   merely because the browser lost the first response.
2. **One in-memory watch represents N and N+1.** False. The legacy watch has
   one `watchKey`, active operation, and visible lease. Replacing N's watch
   with N+1 loses N's local result lifecycle even though both server commands
   can be durable. A v1 client needs per-operation reconciliation rather than
   pretending that the legacy single-watch state is a queue.
3. **The browser chat equals the server base while N is active.** False. The
   server attaches N's input before the browser necessarily hydrates it.
   Sending N+1 from a stale local chat is safe only when that local revision
   is the unchanged revision recorded for an exact still-pending N and the
   server base is read independently. An unrelated local edit must block
   rather than be overwritten or silently omitted from the prompt.
4. **A final server receipt permits adoption from any local intermediate.**
   False. Current adoption checks an explicit allowed local revision. A
   browser or cold boot may already hold the attached-input revision, which
   differs from the original pre-input revision. The exact server progression
   must be attested before expanding that allowed set.
5. **A root save before admission can be assumed harmless during N.** Not
   established. The normal root writer has an ETag/rebase path and C1-owned
   metadata preservation, but concurrent same-key scalar edits in the
   three-way merge prefer the local value. G1 must validate or block the
   local-settings/preceding-effect overlap before N+1 uses a newly captured
   settings context.
6. **A pending display proves chat adoption.** False. Projection is a read-only
   authority signal. The UI must separately read normal chat storage and
   perform a local-slot revision/placeholder CAS, without writing the server
   answer or replaying legacy effects.

## Proposed bounded architecture

- Retain the existing v0 single-watch and legacy result delivery unchanged.
  Do not turn it into a generic plugin or AC runtime.
- Make input v1 a separate, operation-keyed client path. The server remains
  the input/generation/chat/effect owner after admission. The client persists
  only operation IDs and admission uncertainty, not raw prompt text, and uses
  the exact start/status protocol. A 202 is accepted; an ambiguous start is
  never a reason for client model fallback.
- Before admission, durably flush relevant client settings, peek the canonical
  chat without advancing the client save baseline, and compare the local
  revision. Permit a stale local view for N+1 only when the exact previous
  operation is still pending and the local view has not changed. Conflict or
  unavailable evidence retains the user's draft and prevents paid work.
- On chat open/return, read owner/pending projection and the normal chat
  snapshot, then adopt through a revision/slot CAS. Track every accepted
  operation independently until a terminal or explicit unknown state. An
  attached input after a PocketRisu process restart remains recoverable chat
  data, not a promise to resume paid generation.
- Keep the advertised input capability at 0 until this flow, joined retention,
  real-browser exit, and actual model-bundle parity are verified. Keep the
  modified AC branches and AC source out of this G1 runtime.

## Impact and validation surface

The affected client owners are `DefaultChatScreen.svelte` (composer admission
and draft), `bgOrchestrate.ts` and `bgOrchestrationPending.ts` (per-operation
start/recovery), `chatStorage.ts` (read-only canonical peek and CAS adoption),
and `bgServerCommitHydration.ts` (receipt/projection admission). The existing
server input, commit, and projection owners remain the authority; only a
confirmed DTO/lifecycle gap should change them. The already-added pure
admission and start classifiers and read-only pending display are candidate
infrastructure, not activation.

Verification must include lost POST response, exact 202, N→N+1 while the
browser is gone, local message/settings edits, current/previous revision
adoption, restart with attached input, old-server capability 0, no duplicate
provider/client save/effects, actual normal chat API before browser reopen,
and a real browser/iPhone qualification. L2.5 and the complete-graph exact
revert gate remain separate from these runtime tests.

This review is the required design boundary before replacing the attempted
piecemeal client activation with an operation-keyed flow. It does not assert
that the proposed implementation or G1/G2/G3 completion has been verified.
