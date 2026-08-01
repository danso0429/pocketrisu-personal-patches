# PocketRisu 1.9.0 character-import-ux local adapter validation

## Decision boundary

The PocketRisu 1.9 `SystemBackup.svelte` import overlap is adapted locally,
but `character-import-ux` is not yet qualified for 1.9.0. The pack requires
`lazy-chat-sync`, and the first complete-plan failure after this fix is the
parent's obsolete full-file `server/node/server.cjs` replacement. Compatibility
therefore remains `reviewing` until the parent is rebased and combined target
tests, diagnostics, build, ordinary round trip, L2.5, and the exhaustive gate
pass.

No live installation, preserved K12 worktree, release, or installer artifact
was modified.

## Exact overlap and adapter

The pack manages 10 unique paths. Official PocketRisu 1.9 changed two:

- `src/lib/Setting/Pages/SystemBackup.svelte` added the settings-only backup
  button and `SaveSettingsOnlyBackup` import;
- `src/ts/drive/backuplocal.ts` added the corresponding estimate, module-asset
  choice, and streaming download implementation.

Every existing backuplocal function anchor remains exact. The refused unit
had anchored its new character-import guard import to the former three-name
backuplocal import. Rather than duplicate the guard for each target, its
anchor now uses the unchanged adjacent `language` import. This inserts the
same `allowDuringCharacterImport` binding on both versions without replacing,
reordering, or omitting the new settings-only backup binding.

The pack version advances from `0.1.1` to `0.1.2`; target compatibility does
not advance.

## Local structural checks

A focused contract applies both snapshot units to minimal exact 1.8 and 1.9
import lists. Each result contains one import binding and one restore guard;
reverse-order revert restores the original string exactly. The test also
rejects an anchor coupled to either the old or new backuplocal import list.

For additional structural coverage, all 16 pack-local units were composed
against complete exact 1.8.1 and 1.9.0 source baselines while only the external
lazy-chat unit edge was excluded from this diagnostic graph. Both runs managed
10 paths with no collision and reverse-order exact content round trips. This
proves the local anchors; it does not prove the unavailable parent API or a
production build.

The focused test and the complete patcher suite passed; the latter observed
29/29 test files.

## Preserved behavior and limitations

The adapter retains the existing import-lease boundary:

- ordinary character import remains non-blocking and owns one reactive toast;
- a second import, database-replacing restore, migrated-file cleanup, and
  application update are refused while the lease is active;
- backup creation and the new settings-only backup remain allowed because
  they do not replace the database or interrupt the asset writer;
- snapshot restore still checks the lease before mutation;
- the `beforeunload` listener remains scoped to the active import and is
  detached at terminal completion/failure.

No database, plugin array, character, backup, or asset is deleted by this
adapter. It changes only the source location of an import declaration.

The owned `characterCards.ts` still consumes
`requestImportedCharacterSave()` from `lazy-chat-sync`. Structural composition
without that external edge cannot establish save acknowledgement, failure
reporting, server restart safety, or runtime import completion. Those claims
remain deliberately open.

## Next gate

Rebase `lazy-chat-sync` on exact 1.9.0 while preserving native model jobs,
boot recovery, request logging, session/writer locks, storage headers, and
settings-only backup. Then return to `character-import-ux` and run its combined
maintainer stage, focused import tests, diagnostics, build, ordinary verified
apply/reapply/status/revert, L2.5, and consolidated iPhone L3 scenario. The
partial local receipt must not be used to publish or apply this pack live.
