# PocketRisu 1.9.0 character-organizer validation

## Decision

`character-organizer` is qualified for the exact official PocketRisu 1.9.0
tag, commit `85a65f3137b45c8de4a8d21a9887be213b1ac3fc`. The existing PocketRisu
1.8.1 target remains supported. This decision does not qualify another pack
or a later 1.9.x release.

The patch candidate, report/selection reference, and exact-round-trip target
were separate clean clones of the official 1.9.0 commit. The live PocketRisu
installation and the preserved 1.8.1 K12 worktree were not used as patch
targets.

## Upstream delta and retained outcome

Official 1.9.0 does not add the organizer's user outcome. The pack remains the
single owner of its hamburger entry, four-by-four paginated root/folder view,
explicit one-step ordering controls, local empty-folder draft, and
non-destructive folder membership flow. It continues to write the existing
`characterOrder` schema and does not add a second order source, install a
plugin, replace the plugin array, or use drag and long-press behavior.

Four owned source files are absent from official 1.9.0. The only upstream file
managed by the pack is `src/App.svelte`, which official 1.9 changed for native
asset viewing and safer app/sidebar file-drop classification. The organizer's
focused imports are still inserted after `sendSound` and before the new drag
type import. Its overlay remains immediately before `AlertComp`, so name and
confirmation dialogs stay above the organizer.

The applied 1.9 source retained the complete native drag-type checks,
`ondragstart`/`ondragover`/`ondrop` handlers, AssetViewer imports, store, and
mount. The organizer component declares no draggable, drag, touch, or
long-press handler, so it does not mark or consume the new native drag
classes. The 1.9 exports and call shapes consumed by the owned files also
remain present: `additionalHamburgerMenu`, `DBState.db.characterOrder`, the
`character` and `folder` types, `getCharImage`, `requestImmediateSave`,
`alertInput`, and `alertConfirm`.

## Structural and semantic checks

All six units planned and applied against pristine 1.9.0 with no collision.
The resulting graph managed five source paths: four pack-owned files and the
focused `App.svelte` overlay. The applied source was inspected at the import,
main drop-handler, organizer/alert mount, and AssetViewer mount boundaries.

The existing patcher contract test continued to confirm that the capability
does not access `setDatabase`, `setDatabaseLite`, or `plugins`; uses one
normalized active-character snapshot; keeps an empty folder local until the
first member commit; preserves characters when a folder disappears; and has
no drag or destructive character/asset path.

## Automated qualification

Before changing compatibility metadata, a fresh exact-1.9 candidate with
exactly `character-organizer,toolchain-hardening` completed the maintainer
stage as `review-passed`, with `readyForManualCutover: false`:

- pnpm 10.34.1 and frozen dependency installation passed;
- frontend tests: 70 files, 1,052 passed and 3 skipped;
- server tests: 4 files and 99 tests passed;
- Svelte diagnostics: 0 errors and the four upstream warnings in
  `DefaultChatScreen.svelte`;
- production build: passed;
- focused organizer logic: 1 file and 12 tests passed.

`toolchain-hardening` is a separately qualified owner used to supply the Node
25 test-environment guard. It does not absorb organizer behavior. The patcher
suite after the exact-target declaration passed all 28 test files.

## Apply, reapply, status, and revert

An independent exact-1.9 clone then used the ordinary verified-target path
with only `character-organizer` selected. The first apply changed its five
source paths plus private state and intent metadata. `status` reported
`current`; all five hashes and modes matched their recorded values.

A repeated plan reported no changed files, and a repeated apply returned
`changed: false` with an empty file list. Revert restored `src/App.svelte`,
removed all four owned files, and returned patcher status to `clean`. Git
reported no tracked byte or mode difference from the exact 1.9.0 commit.

This focused round trip does not replace the later exhaustive raw-selection
combination gate. No runtime source bytes changed in the patch repository;
the change declares the observed exact-target compatibility of the existing
pack, so no new L2.5 runtime leaf was introduced.

## Remaining gates

The 1.9 Settings Search adapter for `personal-settings` is the next localized
pack. Storage/import owners, the generation-authority redesign, the Kei child
deltas, K12, aggregate raw-selection verification, review, and consolidated
per-feature iPhone L3 remain pending. No live apply, restart, push, tag,
release, installer rebuild, or cutover was performed.
