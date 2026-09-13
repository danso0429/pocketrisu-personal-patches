# PocketRisu 1.10 BG server chat save × Archive Center C3 N+1 foundation validation

Date: 2026-09-14 KST

Status: **the dormant PocketRisu input owner can admit one successor, preserve
its exact queue predecessor, and advance its effective base only over an
observed terminal lineage; automatic drain, ordinary client opt-in/pending UI,
receipt-scoped dynamic-effect attestation, AC integration, live application,
and release are not complete**

## Scope and result boundary

Implementation commit `11460f3` extends the pre-canonical input owner from one
nonterminal command to one active command plus one successor. Audit follow-up
`bb39b36` limits the settings-state overlay to a command whose predecessor has
actually resolved and removes the unrelated selected-character chat-list
overlay. Installer commit `7c5b7c1` records the generated checkpoint.

The command record is version 3 and carries `effectiveBaseRevision` plus an
optional `predecessorResolution`. Admission allocates an increasing sequence
and the exact prior operation ID under the existing SQLite-backed storage
queue. A second command remains outside the canonical chat while its
predecessor is active. A third nonterminal command for that chat is rejected.

This is an owner and retry-route foundation, not the C3 product exit. The
server does not schedule the successor automatically. The existing client
does not send the input-v1 flag, does not render the new pending command, and
does not retry it from ordinary chat-open reconciliation. Capabilities remain
`inputCommandVersion: 0`; only the diagnostic foundation version advances to
3. No live PocketRisu tree, user database, provider, Archive Center runtime,
tag, or release was changed.

## Data and control flow

```text
N already admitted / attached / running
  → admit N+1 under the existing storage queue
    → verify canonical submitted base
    → reject duplicate input identity
    → enforce two nonterminal commands per chat
    → assign admissionSeq=N.seq+1 and queuePredecessorId=N.operationId
    → store N+1 settings snapshot and durable command
    → do not append N+1 to canonical chat
  → an explicit retry calls loadExecution(N+1)
    → predecessor missing / wrong coordinate / non-adjacent seq: block
    → predecessor active: wait; route returns HTTP 202 before run scheduling
    → predecessor outcome unknown / blocked edit: block
    → predecessor completed: require terminal result revision and wait until
      that exact revision is canonical
    → predecessor failed/cancelled: require its attached-input revision, or
      its submitted revision when no input attached
    → atomically store effective base + predecessor resolution + operation base
  → retry may run the existing one-time input transform and attach transaction
  → downstream server-commit metadata uses effectiveBaseRevision
```

The settings snapshot remains frozen for a head command. A resolved successor
may overlay only the current root fields that the existing server
input/result owners mutate (`globalChatVariables`, `statics`, and the four
server ownership ledgers). The normal preview code separately injects the
authoritative target `serverRunChat`; unrelated character chat lists are not
overlaid.

## State outcomes

| Predecessor observation | Successor result |
| --- | --- |
| same chat, exact `admissionSeq - 1`, nonterminal | `waiting / predecessor_active` |
| completed, but result revision not yet canonical | `waiting / predecessor_publication_pending` |
| completed and exact result revision canonical | advance to that result revision |
| failed/cancelled after input attachment | advance to predecessor `executionBaseRevision` |
| cancelled before input attachment | advance to predecessor submitted base |
| transform outcome unknown | block as `predecessor_outcome_unknown` |
| blocked edit | block as `predecessor_blocked_edit` |
| missing, other coordinate, or non-adjacent predecessor | block as `predecessor_identity_unavailable` |
| third nonterminal command | reject as `chat_input_queue_full` |

## Runtime audit v2

### Phase 1 — flat discovery

- the input record schema changes from version 2 to version 3;
- admission permits two nonterminal records on one chat;
- admission scans all input records for duplicate identity and capacity;
- the sequence counter supplies the predecessor operation ID;
- N+1 admission writes command, sequence, and operation-state rows;
- N+1 admission also occupies the second volatile settings-context slot;
- N+1 admission must not mutate the canonical chat or metadata;
- predecessor resolution reads durable command records and the canonical chat;
- predecessor identity includes operation ID, char/chat coordinate, and exact
  adjacent admission sequence;
- active, completed, failed, cancelled, blocked-edit, unknown, missing, and
  corrupt predecessor states have different outcomes;
- completed predecessor settlement occurs before asynchronous canonical
  publication can finish;
- successful advance rewrites both the input record and operation-state base;
- begin, load, attach, publication recovery, and server-commit metadata consume
  the effective rather than originally submitted base;
- the authenticated start route can return a nonterminal HTTP 202 response;
- an HTTP 202 response must precede run-registry scheduling and provider work;
- status projection exposes waiting state and predecessor identity;
- detached preview decodes an admission-time settings snapshot;
- a successor must see legitimate predecessor-owned globals/statics/ledgers;
- a head command must not silently adopt later current root state;
- copying the current selected-character chat list would expose unrelated chat
  changes to an admission-time context;
- current dynamic roots can contain changes not attested by the predecessor;
- there is no timer, event subscription, or worker that drains the successor;
- the current client remains unopted and has no pending-command UI;
- record/context retention remains coupled to existing terminal/reset paths;
- manifest ownership, graph units, installer bytes, and exact revert surface
  change.

### Phase 2 — external anchors

| Leaf | Break attempted | External anchor / observed result |
| --- | --- | --- |
| More than one successor enters the chat | Admit N, N+1, then N+2 while both earlier commands are nonterminal | `serverChatInputOwner.cjs:508-518` caps the set at two; the focused fixture observed `chat_input_queue_full` with both blocking IDs. |
| Admission pre-saves N+1 | Snapshot canonical chat before the second admission and compare immediately afterward | the admission transaction at `serverChatInputOwner.cjs:471-604` writes only KV/operation state and the process map; `serverChatInputOwner.test.ts:356-402` observed byte-equivalent canonical chat state. |
| A stale or forged predecessor skips an admitted command | Rewrite N+2 to point to N instead of adjacent N+1 | `serverChatInputOwner.cjs:386-395` requires identical coordinate and `predecessor.admissionSeq === record.admissionSeq - 1`; the tamper fixture at `serverChatInputOwner.test.ts:525-546` blocked before transform. |
| Active N starts N+1 provider work | Retry N+1 while N is nonterminal and count run-registry starts | owner lines 405-411 return `waiting`; the composed-route fixture at `bgServerChatCommitRoutes.test.ts:512-548` returned 202 and observed zero starts. |
| Completed N advances before its chat is published | Settle N with a result SHA while canonical remains the input-only chat | owner lines 421-443 compare the terminal revision to the canonical full-store revision; the fixture observed `predecessor_publication_pending`, then advanced only after installing that exact result chat. |
| Failure/cancellation discards an already attached input | Settle an attached N as failed and cancelled | owner lines 421-424 choose `executionBaseRevision`; both focused cases kept the input-only chat as the next base. A cancel-before-attach fixture used the submitted base. |
| Unknown outcome is treated as a harmless failure | Interrupt after transform ownership and retry N+1 | owner lines 397-403 block on `transformState: unknown`; focused projection preserved both commands as blocked rather than rerunning input script or provider work. |
| Effective base is only diagnostic | Advance N+1 and inspect attach, publication, operation state, and start metadata | owner lines 445-466, 644-680, 720-817, and 830-858 use the effective base; manifest lines 1354-1357 and 1458-1472 use it for the composed commit/start metadata. |
| First command loses immutable settings | Change current dynamic roots after a head command is admitted | audit found the initial overlay was unconditional. Commit `bb39b36` gates it on `settingsSnapshot.record?.predecessorResolution`; the structural test and final composed source contain that condition. |
| N+1 imports every current character chat | Change another chat in the selected character | audit removed the chat-list overlay. `serverChatSettingsContext.cjs:22-35` now copies only six root fields; its focused test confirms frozen character settings and chats remain unchanged. |
| Dynamic overlay is proven to contain only predecessor effects | Add an unrelated global/statics mutation after predecessor publication but before the explicit N+1 retry | **surface:** the owner proves predecessor identity and target-chat revision, but the six current root values are not yet reconstructed or checked against effect receipts. Capability remains 0; C6 must add receipt-scoped effect lineage before activation. |
| Waiting commands drain without a browser retry | Search owner, route, startup recovery, and client callers for a scheduler/subscription | no drain caller exists. The route only returns 202 and status projection; **surface:** automatic server drain plus chat-open retry remains C3 work. |
| Version-2 input rows migrate | Seed an older durable input row | parser lines 120-130 fail closed on anything but record version 3. The protocol has never been live or advertised, so no production migration was executed; **surface:** activation must either prove zero legacy rows or add an explicit migration. |
| Graph cannot reproduce or revert | Build, apply the all graph, report status, re-plan, and revert against pristine PocketRisu 1.10.0 | final graph reported 40 packs/1,001 units/354 managed paths/13 ordered collisions, 0 changed files on re-plan, and 0 existence/byte/mode mismatches after revert. |

### Collaborator verification processing

One read-only ten-claim batch used the required strict `N1..N10` schema and
made no file changes. Nine claims returned YES. N3 returned PARTIAL because
the first implementation checked only that the predecessor sequence was
smaller, not immediately adjacent. The primary turn reread the collaboration
instructions, checked all ten claims against source and the composed target,
changed the check to exact `N-1`, and added the non-adjacent tamper fixture.
Final accounting is 10 findings, 10 checked, 1 corrected, 0 discarded, and 0
stale.

### Phase 3 — triage

- **Q1 fixed:** exact adjacent predecessor identity, third-command refusal,
  no canonical N+1 mutation, publication-before-advance ordering, and 202
  before run scheduling.
- **Q2/Q3 fixed:** all downstream base consumers use
  `effectiveBaseRevision`; failed/cancelled/unknown paths are explicit;
  head-command settings remain immutable; unrelated selected-character chats
  no longer enter the overlay.
- **Q4 prepared surface:** the six dynamic root fields are copied from current
  state after predecessor resolution, but their per-effect provenance is not
  yet attested. This is an activation blocker rather than a supported safety
  claim.
- **Product blockers:** automatic server drain, normal client early-send
  branch, admission-response loss recovery, pending composer/chat-open UI,
  receipt-scoped effect lineage, AC next-input finalization, bounded joined
  retention, and controlled live/device evidence remain open.

## Prepared surfaces

| Item / claim | Resolved through | Exact blocked link | Why it remains open | Required next observation |
| --- | --- | --- | --- | --- |
| Automatic N+1 progress | owner wait/advance and route 202 are deterministic | predecessor terminal/publication event → one server-owned retry | no drain scheduler exists | N success/failure/cancel/edit crossed with automatic retry and duplicate trigger/provider counters |
| Pending client state | server projection returns order, predecessor, raw text, cancelability | early composer branch → admission ACK recovery → ordinary chat-open projection | client remains unopted | new/old client-server matrix, dropped admission response, refresh/blank browser, autosave exclusion |
| Dynamic effect provenance | exact predecessor and target-chat revision are checked | predecessor input/commit receipts → exact globals/statics/ledger transition → overlay | current root snapshot can include an unrelated mutation | inject unrelated global/statics edits before retry; require block while admitted predecessor effects still advance |
| Restart continuity | durable commands fail closed without volatile settings | restore the exact context and pending scheduler state | secret-bearing Node context is intentionally process-only | restart at admission/wait/publication boundaries; no fallback and no paid rerun |
| AC previous-turn finalization | next command can be durably admitted while N waits | admission receipt → Go `finalize_pending` with N context → next acquire | C4/C5 typed transport and claim owner are absent | previous/current mode, response loss, restart, v1-v4, explicit skip and claim tests |
| Lifetime | two nonterminal contexts are bounded and terminal paths release memory | input/commit/projection/tombstone compaction after all late references | C6 joined retention is undefined | high-count startup/projection, TTL/late ACK, exact owner lookup after payload expiry |
| Product/browser-exit claim | synthetic owner/route/full suites pass | real provider → browser process exit → normal chat read before browser restart | feature is capability 0 and was not live-applied | C7 timestamped Ubuntu and iPhone scenarios |

## Cross-piece interaction check

- C1/C2 completion settles an input command with the stored result revision;
  N+1 waits for the same revision to appear in canonical fullChatStore.
- Input-only failure/cancel retains the already attached user message and
  advances from that execution revision; queued cancellation remains
  zero-change.
- Settings snapshots remain process-only. N+1 consumes its own admitted
  snapshot, while only resolved-predecessor dynamic roots are overlaid.
- Result persistence/ACK does not delete input, commit, projection, or
  predecessor records; C6 still owns their joined retirement.
- PageFold remains in the same BG bundle; no second generation or plugin
  runner was introduced.
- Archive Center remains disabled/unbound. No browser hook fact was relabelled
  as a server observation.

## Verification receipt

- Patcher source tests: **52/52 files passed** after the audit fix.
- Exact C1-C3 server focus: **7/7 files, 66/66 tests passed**.
- Complete target frontend: **153/153 files, 1,742/1,742 tests passed**.
- Complete target server after the audit fix: **28/28 files, 289 passed, 12
  skipped**.
- The first restricted server run exposed only three loopback-binding files:
  25 files/260 tests passed and 31 tests skipped while ten tests timed out with
  `listen EPERM 127.0.0.1`; the full suite above passed with loopback enabled.
- Compatibility: **10 files passed, 1 skipped; 74 tests passed, 5 skipped**.
- Svelte diagnostics: **0 errors, 0 warnings**.
- Production client build: **7,941 modules transformed**. The final audit fix
  was server-only; focused and complete server suites were rerun afterward.
- BG bundle: **8,861,860 bytes**, SHA-256
  `c62632f122e827c9c30cfbf15450ce22a764c2d56ad602cad68b0076b8db2b85`;
  load condition passed for `sendChat`, `runTrigger`, and `processScript`.
- Complete graph: **40 packs, 1,001 units, 354 managed paths, 13 ordered
  collisions**; status current, zero-change re-plan, then exact revert with
  **0 existence/byte/mode mismatches** across all 354 paths. Final target
  patch status is clean with empty custom intent.
- Final composed-server smoke: root HTTP 200; unauthenticated capability,
  projection, and start HTTP 401; graceful SIGINT flush observed.
- Two final installer builds were byte-identical. Both are mode 0755,
  **8,228,941 bytes**, syntax-valid, and SHA-256
  `7cfb3dd419915ac8b3fbce32dc08d4c7b14a48e1ca5b5d69d67c9c04aa2a9e0f`.
- No live apply, PM2 restart, user-data mutation, provider call, AC runtime
  mutation, tag, or release was performed.

## Verdict and next direction

The owner-level N+1 deadlock foundation is now present: one successor can be
accepted outside canonical storage, cannot overtake its exact predecessor,
and advances only over an observed terminal chat lineage. The correction from
the audit also preserves the head command's immutable context and narrows the
successor overlay.

This does not yet make C3 usable from the ordinary PocketRisu composer. The
next PocketRisu slice is server-owned retry/drain plus the early-send client
branch and pending/chat-open reconciliation. Before advertising input version
1, C6 must bind the six dynamic root transitions to predecessor effect
receipts rather than treating current state as sufficient provenance. The
independent AC direction remains C4's typed device/backend context and claim
transport.
