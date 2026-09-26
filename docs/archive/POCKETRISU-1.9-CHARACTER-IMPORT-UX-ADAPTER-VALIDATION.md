# PocketRisu 1.9.0 character-import-ux validation

## Decision

`character-import-ux` version `0.1.2` is qualified for the exact official
PocketRisu 1.9.0 tag, commit
`85a65f3137b45c8de4a8d21a9887be213b1ac3fc`. Its required
`lazy-chat-sync` parent is qualified at the same exact target boundary.
PocketRisu 1.8.1 remains supported. This does not qualify another 1.9.x
release, `bg-preserve`, or the aggregate candidate.

No live installation, preserved K12 worktree, release, or generated installer
was modified.

## Exact overlap and adapter

The pack manages 10 unique paths. Official PocketRisu 1.9 changed two:

- `src/lib/Setting/Pages/SystemBackup.svelte` added the settings-only backup
  button and `SaveSettingsOnlyBackup` import;
- `src/ts/drive/backuplocal.ts` added the corresponding estimate,
  module-asset choice, and streaming download implementation.

Every existing backuplocal function anchor remains exact. The refused unit
had anchored its character-import guard to the former three-name backuplocal
import. Its target-independent anchor now uses the unchanged adjacent
`language` import. This inserts the same `allowDuringCharacterImport` binding
on both versions without replacing, reordering, or omitting the native
settings-only backup binding.

The owned `characterCards.ts` path consumes
`requestImportedCharacterSave()` from `lazy-chat-sync`. The pack retains its
pack-level dependency while unit ordering accepts either exact 1.8 or exact
1.9 global-API replacement ID. It does not loosen ownership or make the
parent optional.

## Preserved behavior

The adapter retains the import-lease boundary:

- ordinary character import remains non-blocking and owns one reactive toast;
- a second import, database-replacing restore, migrated-file cleanup, and
  application update are refused while the lease is active;
- backup creation and native settings-only backup remain allowed because
  they do not replace the database or interrupt the asset writer;
- snapshot restore checks the lease before mutation;
- the `beforeunload` listener is scoped to the active import and detached at
  terminal completion or failure;
- terminal import success waits for the lazy server-confirmed character save
  path instead of reporting only an in-memory insertion.

No database, plugin array, character, backup, or asset is deleted. The pack
does not call `setDatabase()` or `setDatabaseLite({plugins})` and adds no
parallel plugin owner.

## Automated and round-trip evidence

The combined exact-1.9 maintainer stage with
`character-import-ux,lazy-chat-sync,toolchain-hardening` passed after the
parent's native-recovery signature was corrected:

- frontend tests: 76 files, 1,119 passed and 3 skipped;
- server tests: 6 files and 123 tests passed;
- Svelte diagnostics: 0 errors and four upstream warnings;
- production build passed;
- focused frontend tests: 10 files and 210 tests passed;
- focused server delta/journal tests: 2 files and 24 tests passed;
- complete patcher suite: 29/29 test files passed.

The ordinary exact-1.9 path selected `character-import-ux`, dependency-added
`lazy-chat-sync`, and resolved 43 units over 37 source paths with no
collisions. Status was `current`; repeated plan and apply changed zero files;
revert returned `clean` and left no tracked byte, mode, or index difference.

The complete current catalog also passed all 2,048/2,048 raw exact-1.8.1
selections, 1,024 normalized graphs, 191 managed paths, a maximum of 425
resolved units, and exact round trips. The separately inspected target had no
Git difference after completion.

## L2.5 runtime audit

### Phase 1 — flat discovery

- The backup-guard import can omit or shadow native settings-only backup.
- Import lease acquisition can permit two simultaneous imports.
- Restore, update, cleanup, or snapshot mutation can bypass the active lease.
- Backup creation can be blocked even though it is read-only with respect to
  the active database.
- Progress state can duplicate, complete early, or remain stuck on failure.
- Toast close can cancel work accidentally or leak its subscription.
- Asset writing can finish before server-confirmed character persistence.
- Save failure can be relabeled as success.
- `beforeunload` can remain installed after terminal state.
- A broad database write can replace the plugin array.
- PWA suspension, large package parsing, toast layering, and real asset
  persistence remain environment-visible surfaces.

### Phase 2 — external-anchor resolution

- **Target composition — measured.** The exact 1.8/1.9 snapshot contract
  applies one import and one guard, rejects version-coupled anchors, and
  reverses to the exact input. Full exact-1.9 parent composition passed its
  tests, diagnostics, build, ordinary reapply, and exact revert.
- **Native backup preservation — structural plus build.** The applied 1.9
  source retains the settings-only import, button, size estimate,
  module-assets choice, and streaming download path. The new guard is anchored
  to an unchanged neighboring import and does not wrap backup creation.
- **Lease and mutation boundaries — structural plus focused tests.** One
  state owner gates second import, restore/update, migrated cleanup, and
  snapshots while leaving backups available. Terminal paths release state and
  listener ownership.
- **Persistence acknowledgement — structural plus measured.** The character
  path calls the qualified lazy save helper; combined target tests include
  import state, save intent, storage, journal, and recovery behavior. Failure
  is propagated rather than converted to a terminal success toast.
- **Plugin/data ownership — structural.** The pack contains no plugin-array
  setter or broad top-level database replacement and performs no deletion.
- **Resources — structural.** It adds one active-import state object, one
  reactive toast surface, and a scoped `beforeunload` listener. It adds no
  socket, polling loop, persistent queue, credential read, or executable
  input. Parsing and asset I/O remain the existing import owner's work.
- **Mobile/runtime behavior — prepared surface.** Source gates cannot observe
  iPhone toast layering, PWA suspension, large real package progress, or the
  user's persisted assets; those remain consolidated L3 surfaces.

### Phase 3 — triage

- **Q3, fixed:** the version-coupled System Backup import anchor now composes
  without weakening native behavior.
- **Q3, resolved by measured behavior:** the required lazy parent is now
  target-qualified, and the combined full/focused tests, build, round trip,
  and exact-1.8 exhaustive gate passed.
- **Q4, pending user-visible gate:** real iPhone import progress, suspension,
  toast interaction, and persistence remain for consolidated L3. They block
  aggregate publication and live candidate acceptance, not this local commit.

### Concrete iPhone L3

1. Import an ordinary disposable character and a larger disposable package.
   Confirm one progress toast, one terminal outcome, and persistence after a
   PWA cold start.
2. Close the toast during one import and confirm work continues. During
   another active import, try restore and application update and confirm they
   are refused without cancelling the import; create a settings-only backup
   and confirm that read-only action remains available.
3. Background the PWA during a large import, return, and confirm progress or
   the single terminal state resumes without duplicate characters or toasts.
4. If an import fails safely, confirm the error remains visible and the next
   import can start; do not corrupt a real package or delete imported user
   data merely to manufacture this branch.

A success toast before persistence, duplicate imported character, stuck
lease, restore/update mutation during import, or settings-only backup
regression is the unsafe signal.

## Remaining gates

Request-class generation authority, BG composition, remaining Kei deltas,
K12, aggregate review, and consolidated per-feature iPhone L3 remain pending.
No live apply, restart, push, tag, release, installer rebuild, or cutover was
performed.
