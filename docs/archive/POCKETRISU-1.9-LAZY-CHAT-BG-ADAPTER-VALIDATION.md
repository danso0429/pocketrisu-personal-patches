# PocketRisu 1.9 lazy-chat / BG adapter validation

## Scope and decision

`lazy-chat-bg-adapter` is qualified on exact PocketRisu 1.9.0. It remains an
internal pack that is selected only when both `bg-preserve` and
`lazy-chat-sync` are active.

The adapter does not create a third generation or storage owner. BG retains
operation result/claim/ACK authority, lazy chat retains payload CAS/journal
and root-database persistence, and the adapter supplies the one cross-owner
commit barrier: BG result ACK is withheld until both the strict chat save and
the lazy root database flush succeed.

## Preserved behavior

- A deferred or failed strict chat save rejects before root flush and leaves
  the BG result available for a later delivery attempt.
- A failed root DB flush propagates to the BG delivery loop, so the operation
  result is not acknowledged or deleted.
- Asset writes alone receive BG retry and explicit asset error detail. Chat,
  database, and other writes keep the 1.9 lazy/native request and error path.
- Lazy transport revisions (`ETag`, base revision, update/create intent), BG
  semantic revisions, and operation result IDs remain separate domains.
- The adapter is not user-selectable and cannot be installed without both
  parent owners.

## Observed gates

- Exact-1.9 maintainer stage resolved BG, lazy sync, the auto-added adapter,
  and toolchain hardening into 218 units over 114 files.
- Target tests passed with 98 frontend files / 1,301 tests plus 3 skips and 6
  server files / 123 tests. Svelte diagnostics reported 0 errors and 0
  warnings; production build and BG server bundle build/load passed.
- Focused barrier, BG delivery/order/start/merge/result, lazy CAS/identity/
  conflict/node-storage, and asset retry tests passed with 13 files / 160
  tests. Focused chat delta/journal/native model-job server tests passed with
  3 files / 46 tests.
- The promoted ordinary exact-1.9 graph resolved 211 units over 113 files,
  auto-added the adapter, and reported verified/current. Its three reported
  collisions were ordered full-replacement-before-hook relationships. Reapply
  changed zero files; revert restored zero tracked diff.
- The adapter unit bytes were already present in the exact-1.8 exhaustive
  catalog run performed with the BG authority qualification: 2,048/2,048 raw
  selections, 1,024 normalized graphs, 192 managed paths, maximum 425 units,
  and every exact round trip passed.

## L2.5 runtime audit

### Phase 1 — flat discovery

- strict BG durable save and operation ACK/delete;
- lazy chat payload CAS, journal append/commit, update/create intent, and root
  database flush;
- retry after chat-save or root-flush failure;
- navigation away from the result chat during delivery;
- asset upload retry/error parsing and non-asset storage writes;
- BG fallback/cancel/cold recovery and native model-job recovery;
- plugin chat access, hydration, startup cache, writer lock, request logs,
  credentials, and server resources;
- iOS suspension, cold start, duplicate delivery, and missing payload UI.

### Phase 2 — external-anchor resolution

- **Commit ordering — measured and newly read.** The composed source runs the
  BG strict `triggerSave`, observes its committed result, then awaits
  `forageStorage.flushDatabase()` through `completeBgDurableSave`. The focused
  barrier suite proves deferred save, flush rejection, and success ordering.
- **Retry/idempotency — structural plus tests.** A rejection propagates to the
  existing BG result delivery loop; result claim/heartbeat and revision ACK
  remain BG-owned. Lazy update intent, CAS, journal, identity, conflict, and
  node-storage tests pass, so retry does not weaken into unconditional create
  or delete.
- **Owner separation — measured.** The adapter requires exactly BG and lazy
  parents and is auto-added only for that pair. It introduces no transport,
  pending-send, model-job, result, or database implementation of its own.
- **Storage preservation — structural plus tests.** Asset retry is gated by
  `key.startsWith('assets/')`; non-assets use the original single upload and
  retain native `detail || error` parsing. Native model-job and lazy server
  journal suites pass in the composed graph.
- **Plugin/security/resources — structural plus full gates.** No plugin-array
  write, credential source, endpoint, polling loop, database, or listener is
  added. Existing plugin hydration, bounded logs, writer/session locks, and
  server process owners remain in the full tested source.
- **Mobile behavior — prepared surface.** Detached tests cannot observe iOS
  suspension/jetsam or production persistence timing. These remain aggregate
  L3 rather than inferred successes.

### Phase 3 — triage

- **Q3, resolved by measured behavior:** both parent graphs compose with seven
  adapter units, full/focused gates pass, ordinary reapply is a no-op, and
  exact revert restores official source.
- **Q3, preserved:** transport and semantic revision domains remain separate;
  the adapter adds only a boolean/flush commit barrier.
- **Q4, pending user-visible gate:** iPhone suspension during result delivery,
  flush retry after connectivity loss, cold recovery, and missing-payload UI
  remain for consolidated L3. They block publication/live acceptance, not the
  local adapter commit.

## Concrete iPhone L3

On the future consolidated candidate, use a disposable chat:

1. Start an ordinary BG generation, background through completion, return,
   then cold-start once more. Confirm one reply and retained persistence.
2. During another completed result's return/save window, briefly remove
   connectivity and restore it. Confirm the parked result is retried and
   delivered once rather than acknowledged before persistence.
3. Navigate to another chat while a result is being durably saved, return to
   the original chat, and confirm the exact reply is present once.
4. Save a disposable edit, cold-start, and confirm lazy hydration restores it;
   if a controlled missing-payload fixture exists, confirm the notice appears
   instead of an empty chat.

Early ACK, duplicate reply, recreated deleted chat, missing edit, permanent
busy state, or a non-asset write entering asset retry is the unsafe signal.

No live apply, restart, push, tag, release, or installer rebuild was performed.
