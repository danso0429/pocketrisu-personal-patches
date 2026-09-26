# PocketRisu 1.9.0 lazy-chat-sync validation

## Decision

`lazy-chat-sync` version `0.2.0` is qualified for the exact official
PocketRisu 1.9.0 tag, commit
`85a65f3137b45c8de4a8d21a9887be213b1ac3fc`. PocketRisu 1.8.1 remains
supported by the original target-scoped replacements. This decision qualifies
the lazy chat storage/hydration owner; it does not qualify `bg-preserve`, the
lazy/BG adapter, another 1.9.x release, or the aggregate candidate.

The review candidate, ordinary verified round-trip target, and exhaustive
1.8.1 target were disposable clones of the official commits. The live
PocketRisu installation and the preserved staged K12 worktree were not
modified.

## Upstream overlap and rebase design

The pack manages 27 unique source paths. Official PocketRisu 1.9 changed nine
of them. Two inline units still composed against their unchanged local
anchors; seven full-file replacements refused their former 1.8.1 baselines:

- `server/node/server.cjs`;
- `src/ts/bootstrap.ts`;
- `src/ts/globalApi.svelte.ts`;
- `src/ts/plugins/apiV3/v3.svelte.ts`;
- `src/ts/storage/autoStorage.ts`;
- `src/ts/storage/chatStorage.ts`;
- `src/ts/storage/nodeStorage.ts`.

Each changed full replacement now has mutually exclusive 1.8.1 and 1.9.0
units, official-target anchors, and managed outputs. Three unchanged full
replacements remain target-independent. Exact 1.9 planning selects seven
`*:1.9` units and excludes all seven 1.8.1 forms; exact 1.8.1 planning does
the inverse.

The 1.9 outputs were built as three-way integrations: official 1.8.1 as the
base, the existing lazy owner as ours, and official 1.9.0 as theirs. Five
textual conflicts were resolved deliberately:

- server imports keep both native forwarded-header normalization and lazy
  chat delta/journal helpers;
- server reset keeps both native cold-storage cleanup and lazy chat-WAL
  cleanup;
- global API imports keep both native request logging and lazy conflict
  rebasing;
- API-v3 imports keep both native generation cleanup and lazy hydration;
- API-v3 provider/chat access keeps the native provider signature while
  retaining stable lazy chat access wrappers.

An exact added-line comparison found every unique upstream 1.9 addition in
the seven integrated outputs: 222/222 in the server, 12/12 in bootstrap,
144/144 in the global API, 29/29 in API-v3, 9/9 in auto storage, 5/5 in chat
storage, and 72/72 in node storage.

## Preserved 1.9 behavior and lazy ownership

The integrated files retain the following native 1.9 outcomes:

- forwarded request headers, request/response logs, model-job routes,
  settings-only backup, writer/session locking, user-gesture state, and
  cold-storage cleanup;
- dynamic viewport handling plus model-job recovery initialization at boot;
- request-log and return-from-background handling in the global API;
- plugin unload/listener cleanup, inlay reads, `endAllGenerations`, and the
  provider stream signature in API-v3;
- settings-backup and writer-lock handling in auto/node storage;
- clearing stale streaming flags when native model-job recovery saves a
  completed response.

The lazy owner continues to provide server-confirmed chat delta writes,
write-ahead journaling, conflict rebasing, stable chat identity, startup
database caching, on-demand payload hydration, missing-payload handling, and
save-intent validation. Native `jobRecovery.ts` calls `saveChatToServer` with
four arguments. The shared function now defaults the omitted fifth argument
to the existing fail-closed `update` intent on both targets. This matches
NodeStorage's safe default, permits recovery of an existing chat, and refuses
accidental chat recreation instead of treating an absent intent as create.

This compatibility point does not transfer generation authority to the lazy
pack. It adds no top-level send transport, ax/helper request owner, provider
job owner, result claim/ACK owner, cancel owner, or boot replay policy beyond
the native and already-existing lazy storage paths. Those request classes must
be assigned before `bg-preserve` is composed.

`character-import-ux` remains the only additional consumer qualified in this
step. Its owned character-card path calls
`requestImportedCharacterSave()` and keeps the lazy pack as a pack-level
dependency; unit ordering now accepts either target-scoped global-API owner
without hard-coding the 1.8.1 unit ID. The same optional dual-ID ordering was
applied to the still-unqualified lazy/BG and mobile-navigation adapters so
their future plans cannot require a unit absent on one target. Their
pack-level owner dependencies remain intact.

## Automated qualification

Before compatibility metadata was promoted, a fresh exact-1.9 candidate with
`character-import-ux,lazy-chat-sync,toolchain-hardening` completed the
maintainer stage after one caught integration defect. The first diagnostic
run reported native `jobRecovery.ts` passing four arguments to a five-argument
lazy signature. After the safe `update` default was added to both targets, a
fresh stage observed:

- pnpm 10.34.1 and frozen dependency installation passed;
- frontend tests: 76 files, 1,119 passed and 3 skipped;
- server tests: 6 files and 123 tests passed;
- Svelte diagnostics: 0 errors and the four upstream warnings in
  `DefaultChatScreen.svelte`;
- production build passed;
- 40 source/toolchain paths plus private state/intent were staged;
- no cutover was performed.

The focused candidate run passed 10 frontend files and 210 tests covering
character-import state, chat storage, identity repair, save intents, conflict
rebasing, node-storage deltas, startup caching, plugin chat access, save
patching, and native model-job recovery. Two server files and 24 tests passed
for chat deltas and the write journal. The complete patcher suite then passed
all 29 test files after metadata promotion.

## Apply, reapply, status, and exact revert

An independent exact-1.9 clone used the ordinary verified-target path with
only `character-import-ux` selected; dependency resolution added
`lazy-chat-sync`. The plan resolved 43 units over 37 source paths with no
collisions. First apply changed those 37 paths plus private state and intent;
status reported `current` and every recorded hash and POSIX mode matched.

Repeated plan returned `changedFiles: []`. Repeated apply returned
`changed: false` with no files. Revert restored or removed all 37 managed
source paths, returned patcher status to `clean`, and left no tracked byte,
mode, or index difference from official 1.9.0.

The lazy-only exact-1.9 structural plan selected 27 active units and reported
no collisions. Composition with Personal Settings and Persona Organizer
resolved 71 units; its five reported overlaps were declared order edges on
shared server/global insertion hosts, not incompatible ownership collisions.

## Exhaustive 1.8.1 regression gate

The final dual-target catalog ran against a separately proved-pristine
official PocketRisu 1.8.1 source:

```json
{
  "target": {
    "packageName": "pocketrisu",
    "packageVersion": "1.8.1"
  },
  "compatibility": "verified",
  "rawSelections": 2048,
  "verifiedSelections": 2048,
  "normalizedGraphs": 1024,
  "managedPaths": 191,
  "maximumResolvedUnits": 425,
  "roundTrips": "passed",
  "workers": 2
}
```

The verifier's target-independent path snapshot includes the 1.9 anchor and
managed-file directories only through manifest ownership; exact 1.8.1 plans
selected none of the seven 1.9 replacement units. After the verifier exited,
the target had no tracked byte, mode, or index difference from official
1.8.1.

## L2.5 runtime audit

### Phase 1 — flat discovery

- Exact target identity can select both or neither full replacement form.
- A full replacement can omit or duplicate an upstream 1.9 addition.
- Server request headers, request logs, model jobs, backup, lock, cold-storage,
  chat-delta, or journal routes can shadow one another.
- Boot ordering can start native recovery before storage or lazy hydration is
  ready, or initialize either owner twice.
- Return-from-background handling can race tracked persistence or conflict
  rebasing.
- Plugin API chat reads can expose a placeholder, stale index, or unhydrated
  payload; unload can leak listeners or live generations.
- Save intent can be absent, wrong, or widened from update to create.
- Chat delta CAS can overwrite a newer revision, recreate a deleted chat, or
  acknowledge a write before journal persistence.
- A failed write can leave a journal, retry loop, stale streaming flag, or
  unrecoverable placeholder.
- Character import can finish its asset writer before or after the chat save
  acknowledgement and can expose duplicate progress/terminal state.
- Native model-job replay and future BG replay can both claim one send.
- Reset, restore, cleanup, or settings-only backup can omit one new storage
  family or delete unrelated user data.
- A broad database write can replace the plugin array.
- Request payload/log data can bypass native masking, caps, or retention.
- Timers, listeners, locks, sockets, journals, and startup caches can survive
  terminal cleanup.
- Large chats and concurrent devices can increase hydration, delta, conflict,
  and writer-lock costs; no universal latency bound is assumed.
- PWA suspension, process loss, multi-device writes, toast behavior, and real
  database recovery remain environment-visible surfaces.

### Phase 2 — external-anchor resolution

- **Target graph — measured.** Exact 1.8 and 1.9 plans selected exactly one
  replacement family. The complete exact-1.8 catalog round-tripped all 2,048
  selections, and the ordinary exact-1.9 combined graph applied, reapplied
  without changes, reported current, and reverted to a clean official source.
- **Upstream preservation — structural plus measured.** Three-way integration
  retained every unique upstream-added line across all seven changed outputs.
  Fresh target tests, diagnostics, and production build passed. The omitted
  native recovery argument was caught by diagnostics before promotion and
  resolved in the shared storage contract.
- **Server and security paths — structural plus tests.** Native forwarded
  headers, bounded masked request logging, model-job routes, session/writer
  locks, backup/cold-storage branches, and lazy delta/journal routes remain
  separate named handlers. The server delta/journal suites passed 24 tests.
  No new credential source, log body, remote endpoint, or executable payload
  is introduced by this rebase.
- **Boot and global persistence — structural plus tests.** Bootstrap retains
  one native model-job recovery initializer and the existing lazy startup
  cache/hydration sequence. Global API retains native request-log/background
  behavior and lazy conflict/write handling. Startup-cache, save-patcher,
  conflict, identity, and recovery tests were included in the 210 focused
  frontend tests.
- **Plugin lifecycle — structural plus tests.** API-v3 retains native unload,
  listener cleanup, inlay reads, generation termination, and provider stream
  parameters. Lazy chat access hydrates before returning payload data. Plugin
  chat-access tests passed, and no second plugin installation or plugin-array
  mutation was added.
- **Intent, CAS, and no recreation — structural plus tests.** The default is
  exact `update`, not a permissive create fallback. Chat-save intent,
  node-storage delta, chat-storage, journal, and native recovery tests cover
  save failure, idempotency, claim-after-save, stale identity, and update-only
  behavior. No delete or force-recreate operation was introduced.
- **Import ownership — structural plus measured.** Character import keeps a
  single lease/toast state and awaits the lazy server-confirmed save helper.
  Its full source tests ran in the combined stage; ordinary application
  resolved the dependency graph without a hard versioned-unit edge.
- **Resources and performance — structural.** Added persistent resources are
  bounded chat journals/caches already owned by the lazy pack; native request
  logs retain upstream caps. Terminal/unload paths retain listener and
  generation cleanup. The rebase adds no polling loop, unbounded in-memory
  queue, new socket, or separate database. Large-chat/multi-device cost is a
  prepared runtime surface rather than an asserted bound.
- **Generation authority — prepared surface.** Native model jobs remain
  enabled and their persistence tests pass, but this pack owns storage rather
  than the complete generation pipeline. The six request classes have not yet
  been assigned between native jobs and `bg-preserve`; therefore BG and its
  lazy adapter remain under review.
- **Mobile/runtime behavior — prepared surface.** Automated tests and build
  close the source contracts. Actual iPhone suspension, cold start, toast
  layering, long-chat hydration, and production writer-lock behavior cannot
  be observed from detached clones and remain in consolidated L3.

### Phase 3 — triage

- **Q3, fixed:** seven obsolete full-file anchors were replaced by exact
  target-scoped families rather than weakened anchors.
- **Q3, fixed:** five three-way conflicts preserve both official 1.9 behavior
  and the lazy owner; upstream added-line comparison guards against silent
  omission.
- **Q3, fixed:** the native recovery signature mismatch was caught by Svelte
  diagnostics and resolved with the existing fail-closed update default on
  both supported targets.
- **Q3, resolved by measured behavior:** full/focused target tests,
  diagnostics, build, patcher tests, ordinary apply/reapply/status/revert, and
  exhaustive exact-1.8 selection verification passed.
- **Q4, next design gate:** request-class generation authority must be decided
  and tested before `bg-preserve` or `lazy-chat-bg-adapter` can be promoted.
- **Q4, pending user-visible gate:** iPhone import, hydration, native recovery,
  suspension, and production persistence remain for consolidated L3. They
  block aggregate publication and live candidate acceptance, not this local
  feature commit.

### Concrete iPhone L3

On the future consolidated candidate:

1. Import an ordinary disposable character and a larger character package.
   Confirm one progress toast, one terminal result, and a saved character;
   close the toast during one import and confirm the import itself continues.
   While another import is active, confirm restore/update actions are refused
   without interrupting it. Do not delete imported user data as part of this
   gate.
2. Open a long existing chat, switch away and back, and confirm payload text
   hydrates once without duplicate/missing messages. Edit and save one
   disposable message, cold-start the PWA, and confirm the edit persists. If a
   deliberately unavailable payload fixture exists, confirm the missing-data
   notice appears instead of silently showing an empty chat.
3. Start a native model-job generation, background or allow the PWA to be
   killed, then return after completion. Confirm one recovered response, no
   duplicate placeholder, cleared streaming state, and persistence after a
   second cold start.
4. If a safe second-device session is available, edit the same disposable
   chat from both sessions and confirm writer-lock/conflict UI prevents silent
   last-writer data loss. Do not force or delete either copy to satisfy the
   test.

A duplicate response, recreated deleted chat, missing edit, permanently
unhydrated placeholder, import that reports completion before persistence, or
silent concurrent overwrite is the unsafe signal.

## Remaining gates and publication state

The request-class generation-authority table, `bg-preserve`, and the lazy/BG
adapter are now qualified in their own receipts. All Kei children on 1.9,
K12, aggregate review, and consolidated per-feature iPhone L3 remain pending.

No push, tag, release, installer rebuild, live PocketRisu apply, data
migration, PocketRisu restart, or cutover was performed.
