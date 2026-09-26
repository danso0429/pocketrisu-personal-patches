# PocketRisu 1.9.0 persona-organizer validation

## Decision

`persona-organizer` is qualified for the exact official PocketRisu 1.9.0
tag, commit `85a65f3137b45c8de4a8d21a9887be213b1ac3fc`. PocketRisu 1.8.1 remains
supported through a target-scoped server adapter. This decision does not
qualify another pack, a later 1.9.x release, or the aggregate candidate.

The review candidate and ordinary round-trip target were separate clean
clones of the official commit. The live PocketRisu installation and the
preserved 1.8.1 K12 worktree were not modified.

## Upstream overlap and ownership decision

The pack manages 11 unique source paths; official 1.9 changed five of them.
Twenty-three of the former 24 active units composed unchanged. The refused
unit was the server-side persona asset walker because official 1.9 expanded
the old one-line persona-icon walker into a block that also preserves a
persona's embedded-module assets and icon, with `includeModuleAssets`
controlling only the potentially large asset array.

The pack now has two mutually exclusive server units:

- PocketRisu 1.8.1 retains the existing icon/gallery/folder walker;
- PocketRisu 1.9.0 adds gallery and folder references to the new upstream
  block while retaining `embeddedModule.assets`, `embeddedModule.icon`, and
  the exact `includeModuleAssets` condition.

Official 1.9 did not add folders, ordering, bulk selection, the persona image
gallery, selected-image export, or the organizer UI. Its
`PersonaSettings.svelte` baseline is byte-identical to 1.8.1, so the existing
pack remains the single owner of that outcome. No parallel Kei persona model
or second ordering source was admitted.

## Structural and behavior checks

On exact 1.9 the plan resolved 24 units over 11 source paths. The only
collision was the existing explicit order between the database persona-field
and folder-interface insertions; there was no incompatible collision. The
applied server block kept each upstream embedded-module line and added only
the two organizer asset families.

The schema remains additive: `personas` stays the canonical ordered array;
optional `folderId` and `imageGallery` fields extend each persona; and
`personaFolders` stores folder identity, name, and optional image. Loading
normalizes duplicate or invalid folder IDs, moves dangling persona references
to the unfiled group, deduplicates gallery paths, and preserves the active
legacy `icon` field.

All client/server asset walkers were traced together:

- local cleanup retains active persona icons, gallery images, and folder
  images;
- resource replacement rewrites those three reference families;
- full/local backup names gallery and folder assets in its asset map;
- server orphan statistics and settings-only export retain the same paths;
- settings-only export with module assets disabled still retains persona
  icons, gallery images, folder images, and embedded-module icons, while only
  embedded-module asset arrays follow the native exclusion switch.

Gallery removal drops a persona reference and does not directly delete the
stored asset. Folder removal asks for confirmation and unfiles its personas.
Bulk persona deletion requires selection plus a preview/confirm dialog and is
refused when it would remove the final persona. The existing single-persona
delete button also retains its confirmation and final-persona guard.

Repository-wide owned/managed-text inspection and a patcher contract test
found no `setDatabase`, `setDatabaseLite`, database-plugin-array write, or
plugin replacement path. This preserves the plugin-array safety boundary.

## Automated qualification

Before compatibility metadata was promoted, a fresh exact-1.9 candidate with
`persona-organizer,toolchain-hardening` completed the maintainer stage as
`review-passed`:

- pnpm 10.34.1 and frozen dependency installation passed;
- frontend tests: 71 files, 1,054 passed and 3 skipped;
- server tests: 4 files and 99 tests passed;
- Svelte diagnostics: 0 errors and the four upstream warnings in
  `DefaultChatScreen.svelte`;
- production build: passed in the recorded target receipt;
- focused organizer/gallery tests: 2 files and 14 tests passed.

The frontend/server test command also emitted the established localhost:3000
connection-refused test noise, but completed with exit code 0 and the counts
above. It was recorded rather than relabeled as a test failure.

After target metadata was promoted, the patcher suite passed all 29 test
files. Contract coverage selects exactly one server adapter for each target,
requires the 1.9 adapter to keep the embedded-module gate, and rejects broad
database/plugin writes.

## Apply, reapply, status, and exact revert

An independent exact-1.9 clone used the ordinary verified-target path with
only `persona-organizer` selected. The first apply changed 11 source paths
plus private state and intent metadata. `status` reported `current`; every
recorded content hash and POSIX mode matched.

The repeated plan had `changedFiles: []`, and repeated apply returned
`changed: false` with no files. Revert restored or removed all 11 source
paths, returned patcher status to `clean`, and left no tracked byte, mode, or
index difference from the official commit.

## Exhaustive 1.8.1 regression gate

The current catalog, including the real 1.9-only server adapter, ran against
the separately proved-pristine official PocketRisu 1.8.1 source:

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

The new unit shares the already managed `server/node/server.cjs` path, so the
target-independent managed-path count stayed 191. Exact 1.8 planning selected
only the 1.8 server unit; exact 1.9 planning selected only the 1.9 unit.

## L2.5 runtime audit

### Phase 1 — flat discovery

- Target identity chooses one of two server asset walkers.
- The 1.9 anchor can omit, duplicate, or reorder native embedded-module
  preservation.
- Gallery/folder assets can be missed by client cleanup, replacement, local
  backup, server orphan statistics, or settings-only backup.
- Disabling module assets can incorrectly drop small persona/folder identity
  images or incorrectly retain the large embedded asset array.
- Load normalization can drop personas, reorder them, or leave dangling
  folder/gallery state.
- Folder removal can accidentally remove member personas.
- Bulk or single deletion can bypass confirmation or remove the final persona.
- Gallery removal can delete a shared stored asset instead of one reference.
- Selected-image export can mutate the active persona image.
- A broad database write can replace the plugin array.
- Organizer rendering and normalization scale with persona, folder, and
  gallery counts; the UI pages the visible grid at 16 items.
- Mobile touch, dialog stacking, image selection/export, Settings navigation,
  PWA persistence, and settings-only backup contents remain
  environment-visible surfaces.

### Phase 2 — external-anchor resolution

- **Target graph — measured.** Exact 1.8 and 1.9 plans each resolved 24 active
  units and selected only their declared server adapter. All 2,048 exact-1.8
  raw selections round-tripped, and exact-1.9 ordinary apply/reapply/revert
  returned to a clean official source.
- **Native 1.9 server behavior — structural and measured.** The final 1.9
  replacement includes every upstream persona icon, embedded asset, embedded
  icon, and `includeModuleAssets` line. The maintainer target tests and build
  passed. A prior replacement that consumed the trailing newline and joined
  `characterOrder` to the block was caught by applied-diff inspection and
  corrected before metadata promotion.
- **Asset preservation — structural.** `getUncleanables`,
  `replaceDbResources`, the local backup asset map, `buildUncleanableSet`, and
  the plugin type all cover gallery paths; folder images are covered by every
  applicable runtime walker. The server's settings-only consumers call the
  same set builder both with and without module assets, so shared small images
  remain in the non-module set.
- **Schema and ordering — structural plus focused tests.** Normalization is
  additive after the native persona default, preserves official 1.9 fields,
  and repairs only malformed folder/gallery references. Fourteen focused
  tests covered invalid references, ordering, cross-folder moves, deletion
  boundaries, legacy icon adoption, deduplication, selection, and reference
  removal.
- **Destructive boundaries — structural plus tests.** UI handlers open an
  explicit preview/confirm surface before bulk deletion, and core logic
  returns the original arrays for an empty selection or final-persona result.
  Folder removal retains personas. Gallery removal changes only the persona's
  reference array. No asset-delete API is called.
- **Persistence and plugin ownership — structural.** Organizer mutations use
  the existing database objects and existing save/immediate-save paths. The
  pack has no broad database setter or plugin-array access, and its contract
  test enforces that absence.
- **CPU, memory, and resources — structural.** The pack adds bounded array
  walks over stored personas, folders, and gallery references and a 16-item UI
  page. It creates no timer, socket, request loop, file handle, executable
  content, credential read, or second persistent queue. No universal latency
  claim is made for unusually large user libraries.
- **Mobile/UI behavior — prepared surface.** Source tests, diagnostics, and
  build close the data/control paths. Actual iPhone taps, dialog layers,
  image rendering/export, PWA persistence, and backup archive contents cannot
  be observed from the detached candidate and remain in consolidated L3.

### Phase 3 — triage

- **Q3, fixed:** the removed 1.8 server anchor was replaced with mutually
  exclusive target adapters that preserve the new 1.9 contract.
- **Q3, fixed:** applied-diff inspection caught and removed the newline join at
  the following `characterOrder` branch.
- **Q3, resolved by measured behavior:** focused/full tests, diagnostics,
  build, patcher tests, dual-target planning, ordinary 1.9 round trip, and the
  exhaustive 1.8 gate passed.
- **Q4, pending user-visible gate:** iPhone interaction, production database
  persistence, and real backup contents require the consolidated L3 session.
  They block aggregate publication and live candidate acceptance, not this
  local feature commit.

### Concrete iPhone L3

On the future consolidated candidate, open **Settings → Persona** and verify:

1. Create a disposable folder, assign and unassign disposable personas, move
   folder/persona order, reopen Settings, and confirm order/membership remain.
2. Add two disposable gallery images, switch the active image, remove one
   reference, and confirm the other image and active persona survive a PWA
   cold start.
3. Export each selected gallery image and confirm the exported image matches
   the choice without changing the active image.
4. Remove a disposable folder and confirm its personas remain unfiled. Enter
   bulk delete, cancel once, then confirm deletion of disposable personas;
   verify the final persona cannot be deleted.
5. Create a settings-only backup with module assets included and another with
   module assets excluded. On a disposable restore target, confirm persona
   icons, gallery images, and folder images exist in both; embedded-module
   bulk assets follow the chosen include/exclude option.

A lost/reordered persona, missing retained image, wrong export, confirmation
bypass, final-persona deletion, or module-option mismatch is the unsafe
signal. These scenarios identify disposable data; they do not authorize
deleting existing user personas or backups.

## Remaining gates

`character-import-ux` is the next storage/import owner, followed by
`lazy-chat-sync`. Generation-authority ownership, remaining Kei deltas, K12,
aggregate review, and consolidated per-feature iPhone L3 remain pending. No
live apply, restart, push, tag, release, installer rebuild, or cutover was
performed.
