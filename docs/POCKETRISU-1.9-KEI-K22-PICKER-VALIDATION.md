# PocketRisu 1.9.0 Kei K22 persona-picker validation

## Decision and boundary

K22-F01 P04-P06 is implemented as version `0.11.0` of the existing
`persona-organizer` pack. The pack remains the only persona folder, order,
normalization, import/export, reference-cleanup, and asset-cleanup owner. No
parallel schema, identity layer, state machine, or pack was added.

The admitted outcome is limited to:

- case-insensitive persona-name and note search in the native picker;
- all-folder, unfiled, and current-folder picker scopes;
- create and import actions that assign a new persona to the currently valid
  selected folder; and
- canonical source-array indices through filtering, selection, and
  `PersonaBind` callbacks.

K22-P07 persona duplication is not present. Character presentation variants,
whole-database setters, plugin-array writes, and a second import or asset
owner remain outside this change.

## Purpose, trigger, state, and result

- **Purpose:** preserve organizer context at the point where a persona is
  selected or created.
- **Trigger:** open the existing persona picker, enter a name/note query,
  choose a folder scope, or use create/import from either the picker or an
  open folder in Persona Settings.
- **State:** query and picker scope are component-local. Folder membership is
  read from the existing `personaFolders` and persona `folderId` fields.
  Filter results carry the original `DBState.db.personas` index rather than a
  new identity.
- **Result:** selection and binding receive the canonical index; absent and
  orphaned folder references appear under Unfiled; a deleted or otherwise
  invalid scope falls back to All without dropping a persona; create/import
  assigns only a folder that still exists at the final write boundary.

The folder picker scope uses tagged values (`folder:<id>`) so a legitimate
folder ID cannot collide with the All or Unfiled sentinels.

## Preservation contracts

- Native `onSelect(index)` versus `changeUserPersona(index)` behavior and the
  existing close/callback cleanup path are shared by filtered and unfiltered
  selections.
- Create saves the current persona before appending and uses the existing
  immediate-save owner after selection.
- Import cancel, invalid PNG data, and caught errors return without selecting
  or closing the picker.
- Image re-encoding and storage finish before the current database is read.
  The import then revalidates the folder against that current database and
  returns `db.personas.push(...) - 1`. This prevents a database-array change
  during the asynchronous asset boundary from producing a stale write or a
  wrong `PersonaBind` index.
- Existing normalization continues to repair invalid folder references;
  existing deletion plans continue to unfile or remove only selected
  references; and existing local/server asset walkers continue to own icon,
  gallery, and folder-image cleanup.
- Repository and applied-source inspection found no `setDatabase()`,
  `setDatabaseLite()`, top-level `plugins` write, persona duplication helper,
  timer, socket, request, executable-content path, or second persistent
  store in the K22 delta.

## Owner graphs and compatibility

On exact official PocketRisu 1.9.0 (`85a65f3137b45c8de4a8d21a9887be213b1ac3fc`):

- owner-absent `toolchain-hardening` resolved 7 units, 3 managed source
  paths, and zero collisions;
- owner-present `persona-organizer` resolved 26 units, 12 managed source
  paths, and one already declared internal ordered collision between
  `persona-folder-field` and `folder-interface`;
- no other pack owns `listedPersona.svelte`, `PersonaSettings.svelte`, or
  `persona.ts`; and
- the final pack ETag was
  `a949472a46eeaf112ba37fcad35fc551c4d4bb15209286a795fc7614600899a0`.

The exact 1.8.1 and 1.9.0 originals of `persona.ts`,
`PersonaSettings.svelte`, and `listedPersona.svelte` are byte-identical. Both
versions planned `persona-organizer` as verified and selected the same picker
and import units, while retaining their mutually exclusive existing server
asset adapter.

Because K22 added managed units and paths, the complete exact-1.9 catalog was
then reverified:

```json
{
  "compatibility": "verified",
  "rawSelections": 2048,
  "verifiedSelections": 2048,
  "normalizedGraphs": 1024,
  "managedPaths": 222,
  "maximumResolvedUnits": 537,
  "roundTrips": "passed",
  "workers": 2
}
```

Every reachable selection completed first plan/apply, current status,
zero-change repeated plan, empty-selection revert, and managed byte/mode
snapshot comparison.

## Focused and adversarial verification

Observed final-payload results:

- `node --test test/persona-ui.test.cjs`: exit 0;
- complete patcher suite: 38 files passed, 0 failed;
- applied target `personaOrganizer.test.ts` plus `personaImages.test.ts`: 2
  files and 19 tests passed;
- Svelte diagnostics: exit 0, 0 errors, and the four existing
  `DefaultChatScreen.svelte` accessibility warnings;
- production build: exit 0, 7,796 modules transformed; and
- independent read-only review: the asynchronous stale-DB/import-index issue
  described above was found, corrected, re-tested, and the final review found
  no remaining actionable blocker.

The adversarial helper cases cover trimmed case-insensitive name/note search,
original-index preservation, disjoint current folders, absent/orphaned
Unfiled membership, invalid/deleted-scope fallback without data loss,
sentinel-shaped folder IDs, and current-folder-only assignment. Contract
tests also hold import cancel/error behavior, current-DB lookup after asset
await, actual push-index return, the shared picker selection path, and the
absence of P07 or a parallel identity schema.

The applied full frontend command reached 69 passing files, 976 passing
tests, and 3 skipped tests, but exited 1 because the two pre-existing Gemini
cache files failed 83 tests at `localStorage.clear is not a function`. After
exact K22 revert, running those same two files on the official source
reproduced all 83 failures with the same exception (and 28 other assertions
passed). Because the package test script joins client and server runs with
`&&`, that failed client baseline did not invoke the server suite in this
command. The focused K22 tests, diagnostics, and production build above are
the positive target gates; the baseline failure is recorded rather than
relabelled as a K22 pass.

## Apply, idempotency, and exact revert

On a disposable exact-1.9 target, fresh apply changed 12 source paths plus
private state and intent. `status` reported all 12 managed paths current. A
repeated apply changed zero files and skipped all 12 source paths. Revert
restored or removed the 12 source paths plus state and intent, returned
patcher status to `clean`, and left zero tracked diff across every owned
official path. The three replaced official anchors restored to:

- `src/ts/persona.ts`:
  `d36908e692f4911bc5a007495e69b5d3525f0e4a2076663feb19784bae893c9d`;
- `src/lib/Setting/listedPersona.svelte`:
  `2def9cca96bc2053169a273fbc70f1287f067b9f2db665ce4336b2474cf13cb3`;
- `src/lib/Setting/Pages/PersonaSettings.svelte`:
  `9428124b1b0c7bb61b446a5c688f8e2bdcddd333a9abfd3d82868b04f8e4d794`.

The exact-1.8.1 disposable source independently completed fresh apply over
the same 12 source paths, zero-change reapply, revert, and clean patcher
status. The preserved K12 worktree and index were not used for either
lifecycle.

Exact feature revert surface:

- `patches/persona-organizer/anchors/listedPersona.svelte`;
- `patches/persona-organizer/files/src/lib/Setting/listedPersona.svelte`;
- the selected-folder create/import additions in the managed
  `PersonaSettings.svelte`;
- picker helpers and tests in `personaOrganizer.ts` and
  `personaOrganizer.test.ts`;
- `persona-organizer:import-folder-preservation` and
  `persona-organizer:picker-page` in the manifest; and
- the K22 assertions in `test/persona-ui.test.cjs`.

Removing those surfaces and restoring the prior manifest version/requirements
returns the pack to the pre-K22 picker behavior without changing the
canonical folder/order schema.

## L2.5 runtime audit

### Phase 1 — flat discovery

- A filtered row can pass a filtered index instead of the canonical persona
  index.
- A folder can be deleted while the picker is open, leaving create/import
  with a dangling `folderId`.
- Asset awaits can make import write to a stale database array or return a
  stale index.
- Search or folder scope can hide orphaned personas or an invalid scope can
  make all personas unreachable.
- The `PersonaBind` callback path can diverge from ordinary selection or fail
  to close and clear its callback store.
- Create/import can bypass the existing save owner.
- A second identity/schema or broad database/plugin write can conflict with
  normalization, cleanup, plugin installation, or storage owners.
- Large persona arrays add query-time lowercase scans and visible-row DOM;
  mobile focus, keyboard, tap size, and dialog layering remain environment
  surfaces.

### Phase 2 — external-anchor resolution

- **Identity/index — focused tests and source review.** Filter entries retain
  their original array index; both ordinary selection and PersonaBind receive
  that index through one function before close.
- **Folder validity — focused tests and write-boundary review.** Tagged scope
  values avoid sentinel collision. Invalid scopes show All, absent/orphaned
  membership shows Unfiled, and create/import use only a currently resolved
  folder.
- **Async import race — adversarial review and corrected source.** Independent
  review found the first implementation held a database reference across
  asset awaits. The final implementation awaits assets first, then reads the
  current DB, resolves its current folders, pushes once, and returns the
  actual inserted index.
- **Persistence and cleanup — owner trace.** The delta calls the native
  persona save and existing immediate-save route and leaves organizer
  normalization, referential deletion, and every asset walker unchanged.
- **No parallel authority — negative search and manifest graph.** There is no
  new pack, schema, identity, database setter, plugin-array write, timer,
  socket, or request. The only collision is the organizer's pre-existing
  declared internal order.
- **Compatibility/revert — measured.** Exact 1.8.1 and 1.9.0 both accepted the
  anchors and completed apply/reapply/revert; exact 1.9 returned to official
  hashes and zero owned-path diff. The 2,048-selection exact-1.9 verifier
  independently round-tripped all 1,024 normalized graphs.
- **Compile/runtime reachability — measured.** The final helper tests,
  complete patcher suite, Svelte diagnostics, and production build completed
  with the observations above. The official-source Gemini test-environment
  failure was reproduced separately.
- **Resources — structural.** Filtering is a bounded array scan driven by
  local query/scope changes. The picker adds no background loop or retained
  result; no universal latency claim is made for unusually large persona
  libraries.

### Phase 3 — triage

- **Q3, fixed:** stale database/index across asynchronous import asset work.
- **Q3, resolved by tests and exact lifecycle:** canonical indices, invalid
  scope/folder fallback, selected-folder assignment, callback preservation,
  dual-version anchors, idempotency, and exact revert.
- **Q4, aggregate L3 only:** real iPhone search focus, folder-select taps,
  PersonaBind selection, and create/import persistence remain user-visible
  surfaces. They block aggregate acceptance/publication, not this local
  feature commit.

## Future aggregate iPhone L3

Do not run this during the implementation session. On the future aggregate
candidate:

1. Open the persona picker from ordinary persona selection. Search once by
   name and once by note; verify the same persona is selected and the picker
   closes.
2. Open a PersonaBind field, filter to a folder, select a persona, and verify
   the bound field receives that persona rather than the filtered row number.
3. Select a disposable folder, create one persona and import one disposable
   persona PNG, cold-start the PWA, and verify both remain in that folder.
4. Delete a disposable folder while another picker instance has that scope,
   then create/import from the stale picker; verify the new persona is
   unfiled and all personas remain reachable through All.
5. Cancel one import and try one invalid file; verify selection, binding,
   persona count, and picker visibility do not change.

Wrong binding, a missing/reordered persona, a dangling folder, import-driven
selection after cancel/error, or lost persistence is the unsafe signal. These
steps use disposable records and do not authorize changes to existing user
personas or live PocketRisu during this session.

### Aggregate observation recorded 2026-08-02 KST

On the admitted live 537-unit aggregate candidate, the user first opened the
full Settings → Persona organizer and correctly found no picker search there.
After the route was clarified as chat composer menu → Quick Menu → Persona,
the separate picker was located. The user then reported the instructed
ordinary-picker sequence normal: the search and folder controls were present,
name and note search worked, Folder/Unfiled filtering worked, selecting the
target closed the picker, and reopening reflected the selected row.

This closes only item 1 above. PersonaBind identity, disposable selected-folder
create/import and cold persistence, stale-folder fallback, import cancellation,
and invalid-file behavior remain unobserved and are not inferred passed.

No live apply, live patch-state change, user-data change, restart, push, tag,
release, or preserved-K12 index mutation was performed.
