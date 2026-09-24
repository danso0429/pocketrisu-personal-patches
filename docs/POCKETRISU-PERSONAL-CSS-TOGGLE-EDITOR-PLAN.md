# PocketRisu Personal CSS toggle editor and custom font plan

## Status

- Date: 2026-09-24 KST
- Repository baseline: `v0.2.2` (`8671312`)
- Target: exact PocketRisu 1.10.0 `personal-settings` appearance feature
- State: implementation candidate; physical iPhone L3 remains pending. Execution
  evidence and recovery instructions are recorded in
  `POCKETRISU-PERSONAL-CSS-TOGGLE-EDITOR-VALIDATION.md`.

## 1. Objective

Allow the Personal → CSS appearance page to manage CSS toggles and chat fonts
without editing PocketRisu source files directly.

The feature must support both categories below through one consistent editor:

1. existing Personal appearance toggles shipped by the patcher;
2. new CSS toggles created by the user.

For each toggle, the user must be able to manage its name, description, CSS,
and enabled state. Editing must provide explicit save and cancel behavior.
Shipped toggles must also provide a reset-to-current-default action.

The same page must also let the user add a chat font from either a direct font-
file URL or a local font file, preview it, save it as a PocketRisu asset, select
it through the existing chat-font control, and remove its registry entry. URL
imports are snapshots: PocketRisu stores the fetched bytes locally and does not
depend on the remote resource after a successful import.

The implementation must preserve existing appearance behavior, Safe Mode,
theme scoping, font loading, global `customCSS` precedence, database contents,
and patch composition guarantees.

## 2. Current architecture and constraints

The current appearance pipeline is:

```text
Database.pocketRisuPersonalSettings.appearance (schema version 1)
→ readPersonalAppearance()
→ resolvePersonalAppearanceTokens()
→ data-pocketrisu-css on <html>
→ personal-appearance.css selectors and two Svelte render conditions
```

Relevant current sources are:

- `patches/personal-settings/settings/appearance/files/src/ts/personalSettings/appearance.ts`
- `patches/personal-settings/settings/appearance/files/src/ts/setting/personalAppearanceSettingsData.ts`
- `patches/personal-settings/settings/appearance/files/src/lib/Setting/Pages/PersonalSettings/AppearanceSettings.svelte`
- `patches/personal-settings/settings/appearance/files/src/lib/Others/PersonalAppearanceRuntime.svelte`
- `patches/personal-settings/settings/appearance/files/src/styles/personal-appearance.css`
- `patches/personal-settings/settings/appearance/units.cjs`

The font asset path also depends on the exact-target forms and composed owners
of:

- `src/ts/globalApi.svelte.ts` (`saveAsset`, `loadAsset`, `getUncleanables`, and
  `replaceDbResources`);
- `src/ts/storage/nodeStorage.ts` (asset transport and durable read-back);
- `src/ts/util.ts` (local file selection); and
- `server/node/server.cjs` (`buildUncleanableSet`, settings backup, storage
  reporting, restore, and orphan purge).

### 2.1 Existing strengths

- Appearance data already has an isolated, versioned database namespace.
- Safe Mode, the master switch, and the Standard-theme gate converge at one
  token resolver.
- Appearance logic, page, runtime component, tests, and stylesheet are owned
  patch payloads rather than uncontrolled upstream fragments.
- Existing leaf writers preserve unknown fields at the personal root,
  appearance root, and feature-group levels.
- The appearance pack is already admitted on exact PocketRisu 1.10.0 and has
  passed complete graph and exact round-trip validation in earlier releases.

### 2.2 Existing limitations

- `appearance.ts` already combines schema handling, token resolution, font
  loading, and DOM synchronization. Adding CRUD, default definitions, and
  dynamic stylesheet management to the same file would create a broad owner.
- The current stylesheet is a monolith. It does not represent the exact CSS
  belonging to each toggle as data.
- Text send icon and jailbreak-toggle visibility use Svelte render conditions,
  so a CSS-only editor cannot truthfully replace their full effects yet.
- `DefaultChatScreen.svelte`, `Toggles.svelte`, `App.svelte`, `bootstrap.ts`,
  and `searchIndex.ts` are shared patch hosts. New shared-host edits increase
  graph collision and rebase risk.
- Settings Search indexes a static `SettingItem[]`; user-edited names and new
  custom toggles cannot enter that index without changing the shared search
  framework.
- PocketRisu persistence re-encodes the root database block on saves. Large
  stored CSS affects ordinary save CPU, memory, backup, restore, and full-write
  fallback costs even when most CSS toggles are disabled.
- Chat fonts are a closed string enum. Code-owned remote fonts load through
  fixed stylesheet URLs, and there is no schema, asset transaction, or runtime
  lifecycle for a user-provided binary.
- The existing client/server asset-reference walkers and restore replacer do not
  treat `pocketRisuPersonalSettings` as an asset-bearing namespace. Merely saving
  an uploaded path there would let automatic/manual orphan cleanup or settings-
  only backup lose a still-referenced font.
- Font import spans two persistence domains: asset bytes and root database
  metadata. They cannot be presented as one atomic write, and failure ordering
  must prefer an orphaned asset over a committed broken reference.

## 3. Design decisions

| Area | Decision | Reason |
| --- | --- | --- |
| Existing toggles | Treat shipped definitions as editable defaults with stored field-level overrides | Preserves a clean default while eliminating source-file editing |
| New toggles | Store complete user definitions in a versioned custom list | Provides stable IDs, ordering, and independent enable state |
| Appearance schema | Keep outer appearance schema version 1 and add an independently versioned `cssToggles` group | Older code preserves the additive unknown field instead of disabling all appearance features |
| Custom font schema | Add an independently versioned `fonts` group and represent a selected custom font as `custom:<stable-id>` in the existing `chat.font` leaf | Keeps built-in font values compatible while making custom identity independent from display names and asset paths |
| Font sources | Accept a direct HTTPS font-file URL or a local `.woff2`, `.woff`, `.ttf`, or `.otf` file; URL import downloads once and then follows the same asset path as upload | Gives both requested entry paths without retaining a mutable remote dependency |
| Remote stylesheets | Do not accept arbitrary stylesheet/page URLs in the font importer; the link mode is for a direct font binary | A stylesheet can contain arbitrary global CSS and would silently bypass the CSS editor's trial and recovery contract |
| Font binary storage | Save validated bytes through `saveAsset()` and store only bounded metadata, integrity data, and an `assets/...` reference in the database | Avoids Base64/database amplification while retaining existing asset backup and deduplication behavior |
| Font runtime | Build a code-named `FontFace` from the stored bytes, load it before activation, add/remove only owned faces through `document.fonts`, and keep built-in font loading unchanged | Prevents user names from becoming CSS syntax and gives explicit load failure and lifecycle handling |
| Asset deletion | Removing a font removes its registry reference only; physical deletion remains the existing orphan-cleanup authority | A content-addressed asset may be shared, and a failed database save must not destroy recoverable bytes |
| CSS runtime | Use one `<style>` element per effective toggle and reconcile trials as a complete candidate application snapshot | Isolates syntax failures while making style nodes, root activation tokens, and order identical to the proposed committed state |
| Cascade | Shipped definitions use fixed registry order; custom definitions follow stored array order | Gives deterministic defaults and user-controlled custom precedence |
| Global custom CSS | Insert Personal CSS styles before the existing `#customcss` element | Preserves source-order precedence when origin, layer, importance, and specificity are otherwise equal; it does not override normal cascade rules |
| Editing | Keep draft state outside the database and runtime until trial application | Cancel remains side-effect free and typing does not repeatedly parse or save CSS |
| Unsafe edits | Trial every applying-state operation that changes the effective application snapshot; suppressed-state repair may only produce a disabled result and requires full revalidation before activation | A previously masked harmful rule can become effective without changing its own CSS text |
| Trial equivalence | Give one runtime owner temporary authority over the exact proposed application snapshot, including root tokens and style nodes, then restore from persisted data on failure | The observed trial must match the post-commit selectors' activation context as well as stylesheet contents and order |
| Persistence | Treat database mutation, durable save acknowledgement, and UI success as separate states | A successful in-memory mutation does not prove that reload or another device will observe it |
| Recovery | In recovery mode, allow metadata-only writes and atomic repair-and-disable operations, then re-read and trial the complete stored application snapshot before clearing recovery | Disabling one rule can unmask another, and a concurrent repair can make an earlier exit trial stale |
| Concurrent edits | Compare the target's draft base and the trial snapshot against the latest database before commit | Re-reading by ID prevents wrong-target writes but does not by itself prevent stale overwrites |
| Search | Retain default global Settings Search entries and add effective-name local filtering inside the manager | Avoids expanding the shared search framework in the first implementation |
| Selector handling | Preserve CSS verbatim; do not auto-prefix selectors or wrap in cascade layers | Safe transformation of arbitrary at-rules and selector grammar requires a full CSS parser and changes user semantics |
| Limits | Choose count and byte limits from measured browser, iPhone, and persistence behavior | Count alone does not represent parsing or database cost |

## 4. Scope

### 4.1 Included

- Edit name, description, and CSS for every shipped CSS toggle definition.
- Save, cancel, modified-state indication, and reset to current shipped default.
- Add, edit, enable, disable, reorder, and delete custom CSS toggles.
- Preserve existing toggle enable states without migration.
- Convert behavior-backed appearance toggles to stable DOM hooks where needed
  so their visible effects have an editable CSS definition.
- Per-toggle runtime fault isolation and deterministic cascade ordering.
- Safe trial application and a boot-time/session recovery path.
- Conflict detection for same-item edits and effective-snapshot changes between
  trial and confirmation.
- Explicit persistence acknowledgement for confirmed edits, with visible
  saving and failure states.
- Local filtering by effective user-edited name and description.
- Storage validation, malformed-data preservation, explicit subsection reset,
  and scale guards.
- Add, preview, select, rename, replace, and remove custom chat-font entries.
- Import font bytes from a direct HTTPS font-file URL or a local file without
  retaining remote credentials, query text, or a live remote dependency.
- Preserve custom font assets across client cleanup, server orphan reporting and
  purge, settings backup, full backup, restore, and asset-path replacement.
- Exact-target patch composition, client, build, runtime, and physical iPhone
  validation.

### 4.2 Excluded

- Arbitrary remote CSS/Google Fonts page or stylesheet parsing in the font
  importer. A user may still author remote CSS explicitly in a CSS toggle,
  subject to that editor's warnings and recovery contract.
- Multi-file font families, manual weight/style/stretch/unicode-range
  descriptors, variable-font axis controls, subsetting, conversion, or editing.
- Immediate physical deletion of a removed font asset.
- Automatic CSS selector scoping, selector rewriting, minification, or
  namespacing of `@keyframes`, custom properties, or cascade layers.
- Online sharing or remote catalog discovery/download beyond the explicit
  direct-font import initiated by the user.
- A full CSS language server, formatter, or linter.
- Dynamic integration of custom toggle names into global Settings Search.
- Replacing or migrating the existing global `customCSS` field.

## 5. User-visible behavior

### 5.1 Toggle list

Each shipped or custom definition is shown as a card containing:

- enable switch;
- effective name and description;
- modified badge for shipped definitions with an override;
- edit action;
- reset-to-default action for modified shipped definitions;
- delete action for custom definitions;
- move-up and move-down actions for custom definitions.

Only one editor may be open at a time. Opening another editor with an active
draft requires resolving the current draft first.

In a normal session where Personal CSS can apply, an action that changes the
active CSS set, activation tokens, or order enters the same trial flow as a CSS
edit. This includes enabling a previously disabled shipped definition and
disabling or deleting an item that currently masks an earlier rule. Metadata-only
name and description changes do not require a visual trial. Recovery and other
globally suppressed states use the repair-and-disable rules in section 5.4.

### 5.2 Editor

The editor contains:

- name input;
- description input;
- fixed-height monospace CSS textarea;
- trial/save action;
- cancel action;
- reset action where applicable;
- current and aggregate UTF-8 byte indicators;
- a concise warning covering global selectors, remote URLs, animations, and
  the existing Safe Mode/recovery path.

Typing changes only local draft state. It does not mutate the database, create
style elements, or schedule autosave.

### 5.3 Trial and confirmation

Except for recovery repairs governed by section 5.4, every operation that
changes the effective active CSS snapshot follows this sequence:

```text
validate draft structure and byte budget
→ read the latest database and reject a conflicting target change
→ derive the complete proposed application snapshot
→ schedule rollback before applying any candidate style
→ give the trial owner authority over the proposed root tokens and style nodes
→ reconcile the Personal CSS collection to the exact sequence and anchor
→ show a code-owned confirmation surface outside the manager subtree
→ confirm: re-read the database and verify the trial fingerprint still matches
→ transition atomically from trial to saving and block competing manager writes
→ write the minimal target fields in one database mutation
→ request and await the qualified strict root-persistence acknowledgement
→ report success and reconcile from the durably acknowledged database
→ cancel/expiry/navigation/page-hide/reload: reconcile from persisted data
```

The trial replaces, rather than overlays, the affected permanent snapshot. The
trial owner temporarily supplies the proposed `data-pocketrisu-css` token set
as well as the proposed style nodes. Ordinary database-driven synchronization
must not overwrite either half until the trial resolves. Node order relative to
shipped items, custom items, and `#customcss` is the same order that a successful
commit will produce. A rule omitted by the candidate is absent during the trial,
so removal and disable semantics are also exercised.

The rollback timer is scheduled before candidate reconciliation and does not
depend on the confirmation surface remaining visible or interactive. The old
persisted value remains the durable authority throughout the trial. Reloading
the page therefore restores the last confirmed value. This reduces lockout risk
but cannot guarantee that arbitrary CSS will leave the document responsive;
the cold-boot recovery path remains mandatory.

At confirmation, the writer compares the current target value and the complete
application fingerprint with the draft base and the fingerprint that was
actually trialed. A same-target conflict aborts. An unrelated database change
may be retained only when applying the target mutation to the latest database
reproduces the trialed application fingerprint; otherwise a new trial is
required. The fingerprint represents the activation gates, exact ordered root
tokens, ordered node keys and CSS strings, and registry revision used for
shipped defaults. Comparison must be collision-safe, either by comparing that
canonical structure directly or by verifying exact structure equality after
any digest match.

Confirmation does not become a visible success merely because the in-memory
database mutation returned. The manager shows a saving state and waits for a
qualified strict root-persistence boundary to acknowledge the write and its
flush. The implementation must add or reuse that contract in the standalone
focused owner graph rather than depending accidentally on an optional BG
adapter. Once confirmation enters the saving state, the candidate application
snapshot remains under the same runtime authority until the acknowledgement is
resolved; the earlier trial-expiry timer cannot race a late successful save.
A definite rejection retains the draft and restores only the still-matching
target through a compare-and-swap path. An ambiguous transport result retains
the draft and displays an unresolved state; it must not claim either durable
success or durable rollback. No failure path may replace an unrelated current
root or silently fall back to a stale whole-object write.

### 5.4 Recovery

The bootstrap path must recognize a recovery query such as `?safe-css=1` before
the first Personal CSS synchronization. It records a tab-scoped
`sessionStorage` sentinel, verifies that the sentinel can be read back, removes
the query parameter with `history.replaceState`, and initializes the runtime
recovery store from that sentinel on every reload. Storage access is guarded
because policy or privacy settings may throw. If sentinel persistence fails,
the current page still enters recovery and retains the query parameter so a
reload cannot silently re-enable Personal CSS.
Recovery therefore remains active until an explicit Exit recovery action clears
the sentinel through the guarded exit flow below, or until the tab/PWA browsing
session ends. It disables Personal CSS throughout that interval while preserving
all stored definitions.

Ordinary per-item visual trial is intentionally unavailable while recovery is
suppressing Personal CSS. The manager permits only the following commits there:

- metadata-only name and description changes;
- disabling or deleting a custom item;
- an atomic repair-and-disable save for a custom item;
- reset-and-disable or edit-and-disable for a shipped item.

Enabling, reordering, or committing changed CSS in an enabled state is blocked.
The UI tells the user that repaired CSS remains disabled. An Exit recovery
action then performs this guarded sequence:

```text
validate the complete stored Personal CSS snapshot
→ keep the recovery sentinel active
→ schedule rollback before applying any style
→ temporarily reconcile its exact tokens and style nodes at the permanent anchor
→ serialize repair/delete/disable writes until the exit trial resolves
→ confirm: re-read storage and every activation gate
→ require exact equality with the application snapshot that was trialed
→ clear the sentinel and recovery store while retaining that snapshot
→ cancel/expiry/failure: remove all Personal CSS and remain in recovery
```

This exit trial covers rules unmasked by a repair, delete, or disable action.
If any stored target, ordering, registry revision, root token, Safe Mode, master,
or theme gate differs at confirmation, the sentinel remains set and a fresh
exit trial is required. Only after exit succeeds may the repaired item itself
be enabled through the normal per-operation trial.

Safe Mode, master-off, and non-Standard-theme sessions may retain drafts and
commit metadata-only changes. They may also save a CSS repair, reset, delete, or
disable only when the resulting affected item is disabled. Such a write marks
the stored snapshot as requiring revalidation; reorder and enable remain
blocked. Before any global gate later allows Personal CSS again, the runtime
keeps Personal CSS suppressed and runs the same complete-snapshot activation
trial. Closing a global gate remains an immediate safety action and never waits
for trial confirmation.

The product documentation and recovery notice must give an exact, copyable
recovery URL and concrete iPhone PWA entry procedure. Stage 0 must verify whether
opening that URL outside the installed PWA reaches the same origin storage and
bootstrap path. If it does not, implementation must provide and validate a
supported installed-app launch path before recovery can be accepted.

The existing Safe Mode behavior remains authoritative and continues to pause
both shipped and custom Personal CSS without changing stored values.

Recovery, Safe Mode, master-off, and non-Standard-theme suppression also remove
programmatically registered custom font faces and the custom-font root token.
They do not delete font metadata or asset bytes. Built-in font loading retains
its current behavior outside these existing gates.

### 5.5 Custom font manager

The current chat-font area gains a custom-font list and an Add font action. The
import dialog requires a user-visible name and one explicit source mode:

- direct HTTPS font-file URL; or
- local `.woff2`, `.woff`, `.ttf`, or `.otf` file.

The URL mode accepts a font binary, not a Google Fonts page, CSS stylesheet, or
arbitrary `@import` URL. It rejects embedded credentials and non-network schemes,
does not use a server-side proxy, and fetches with omitted credentials and a
no-referrer policy. Cross-origin imports therefore require the source server to
allow browser CORS. The interface explains that uploading the file is the
fallback when a remote host blocks CORS.

Both source modes converge before persistence:

```text
validate source metadata and current byte budget
→ acquire bytes with a hard streaming cap and abort on overflow
→ detect an admitted font signature independently from filename/MIME
→ compute the integrity digest
→ construct a candidate FontFace from an exact standalone ArrayBuffer
→ load it and render the multilingual preview under a code-owned family name
→ confirm: re-read the registry and aggregate asset budget
→ save bytes with saveAsset() using a code-owned canonical extension
→ read back the saved asset and verify its exact length and digest
→ add or replace only the target font metadata in the latest database
→ await the qualified strict root-persistence acknowledgement
→ expose the durably saved entry to the chat-font selector
```

The original filename is display metadata only. It is bounded and sanitized and
is never passed to `saveAsset()` as an extension authority. The URL, including
its path and query, is not persisted. Reopening or selecting the font reads the
saved `assets/...` bytes, verifies their recorded length and digest, creates the
same code-owned versioned family, and calls `FontFace.load()` before applying
the font.

An imported entry represents one normal face. Bold or italic text may use the
browser's ordinary synthesis or fallback behavior. Multiple files per family,
font descriptor editing, and variable-axis controls are deferred rather than
silently inferred from filenames.

Adding a font does not implicitly select it. Selecting a custom font keeps the
current font active until the stored face loads successfully, then writes the
`chat.font` selection and waits for durable acknowledgement. A load or save
failure leaves the previous selection active. Replacing the bytes of a selected
font follows the same load-before-commit rule. Removing the selected font
requires explicit confirmation and atomically changes `chat.font` to `app` while
removing that registry entry. Other removals change only the target registry
entry.

No UI path directly deletes `assets/...` bytes. A successful removal merely
makes the asset eligible for the existing orphan-cleanup flow after every live
reference is re-evaluated. A failed or ambiguous database save keeps the entry
and selection unresolved and never attempts compensating physical deletion.

## 6. Storage model

The additive storage shape is:

```ts
interface PersonalCssToggleOverride {
    baseRevision: number
    name?: string
    description?: string
    css?: string
}

interface PersonalCustomCssToggle {
    id: string
    name: string
    description: string
    css: string
    enabled: boolean
}

interface PersonalCssTogglesV1 {
    version: 1
    overrides?: Record<string, PersonalCssToggleOverride>
    custom?: PersonalCustomCssToggle[]
}

type PersonalFontFormat = 'woff2' | 'woff' | 'truetype' | 'opentype'

interface PersonalCustomFont {
    id: string
    name: string
    assetPath: string
    originalFileName: string
    format: PersonalFontFormat
    byteLength: number
    sha256: string
}

interface PersonalFontsV1 {
    version: 1
    custom?: PersonalCustomFont[]
}

interface PersonalAppearanceV1 {
    version: 1
    // Existing appearance fields remain unchanged.
    cssToggles?: PersonalCssTogglesV1
    fonts?: PersonalFontsV1
}
```

The existing `chat.font` leaf continues to store the current built-in string
values and additionally accepts `custom:<id>`. The custom font's runtime family
is derived only from its validated stable ID and recorded SHA-256. Renaming an
entry therefore retains its family, while replacing its bytes creates a distinct
family for an unambiguous preview and handoff. Neither the user-visible name nor
the original filename becomes a CSS family, selector, attribute, or DOM ID.

### 6.1 Shipped definition identity

Each shipped definition has a stable code-owned ID and monotonically advanced
definition revision. An override records the revision on which editing began.
When the code-owned revision later changes, the manager reports that a newer
default exists and offers the existing keep/reset choices. It does not merge
CSS automatically.

Overrides store only fields that differ from the current default. Reset removes
the override entry rather than copying the default into user data.

### 6.2 Custom identity and ordering

Custom IDs use `crypto.randomUUID()` with a bounded browser-compatible fallback.
IDs are used for identity and DOM bookkeeping only. They are not interpolated
into CSS selectors or user-visible HTML.

The custom array is the cascade order. Reordering creates a new array while
retaining the original item objects and IDs.

### 6.3 Custom font identity and asset ownership

Custom font IDs use the same bounded UUID strategy as custom toggle IDs. A font
entry is registry metadata, while `assetPath` points to the separately stored
binary. Content-addressed `saveAsset()` paths may therefore be shared by
duplicate imports or by another feature.

Import is an intentionally ordered two-resource transaction: persist and
read-back the asset first, then commit its database reference. A crash or root-
save failure may leave an unreferenced asset for later cleanup, but it must never
leave a committed reference to bytes that were not durably stored. The UI does
not claim atomic deletion or attempt to roll back the shared asset.

The new reference must be visible to every existing asset authority:

- client `getUncleanables()` and automatic cleanup;
- server `buildUncleanableSet()`, storage reporting, settings-only backup, and
  `POST /api/db/assets/purge-orphans`;
- full backup and restore;
- `replaceDbResources()` when restored asset paths are remapped.

The client and server scanners conservatively extract `assets/...` references
from the complete `pocketRisuPersonalSettings` value, including malformed or
future-version font metadata, so unsupported data is not made destructive by an
orphan sweep. Restore-time replacement walks that personal-settings value and
replaces exact string values only; it does not rewrite substrings inside CSS,
names, descriptions, or other user text. Client and server fixtures must use the
same reference corpus so their preservation sets cannot silently diverge.

### 6.4 Validation and preservation

Reads validate:

- exact nested schema version;
- record/array shape;
- unique, non-empty IDs;
- string name, description, and CSS fields;
- boolean custom enable state;
- known shipped definition IDs in `overrides`;
- metadata, per-item CSS, total CSS, and item-count limits.

Font reads additionally validate:

- exact nested `fonts` schema version;
- unique non-empty IDs and bounded display/original filenames;
- canonical `assets/...` paths with admitted font extensions;
- admitted `format`, non-negative `byteLength`, and canonical SHA-256 values;
- custom selection references that resolve to exactly one valid registry item;
- custom-font entry count, per-file bytes, and aggregate unique-asset bytes.

Actual asset length, digest, signature, and `FontFace.load()` success are checked
asynchronously before preview or activation. Metadata success alone never marks
a font ready. A missing, corrupt, unsupported, or unavailable selected asset
falls back to the app font without rewriting the stored selection or registry,
so recovery remains possible after a transient storage failure.

Malformed or future-version `cssToggles` data is preserved unchanged. Custom
CSS application and ordinary writes are disabled, while unrelated supported
appearance features remain available. The UI reports the invalid custom-CSS
subsection without rewriting it.

Malformed or future-version `fonts` data follows the same subsection-local
rule: custom font application and font-registry writes are disabled, the raw
value and referenced assets are preserved, and supported CSS toggles and built-
in fonts remain available. An unresolved `custom:<id>` selection renders as the
app font without silently changing the database.

The invalid state has one explicit escape hatch. The user may export or copy
the raw `cssToggles` value and then confirm a reset that removes only that
subsection. Reset never runs automatically and does not touch the existing
appearance enable fields or global `customCSS`. A future-version subsection is
never normalized or partially repaired by older code. Current-version duplicate
IDs, malformed records, unknown shipped IDs, and limit violations use the same
preserve/export/explicit-reset path rather than ambiguous index-based edits.

The `fonts` subsection has its own raw-copy and explicit reset action. If a
custom font is selected, reset atomically changes `chat.font` to `app` and
removes only `fonts`; it does not delete asset bytes. Raw JSON copy is metadata,
not a standalone font backup, so the UI points to the ordinary backup workflow
when the binary must be retained.

Writers read the latest database object at commit time and update only the
target override, custom CSS item, custom font item, or font selection. A shipped
repair-and-disable transaction may also update that definition's existing typed
enable leaf in the same mutation. Selected-font removal and font-subsection
reset may update `chat.font` to `app` in that same target mutation.
Writers do not replace the whole database, plugin array, personal-settings root,
or appearance object from an old draft.
Each draft records the target fields and relevant custom-ID order observed when
editing began. A commit fails with a conflict if those same fields or order have
changed. A trial also records a canonical effective-style fingerprint, which
must still describe the proposed committed result after rebasing the target
mutation onto the latest unrelated database state.

A font import or replacement also records the font-registry base and selected
font observed before preview. It re-reads both immediately before the asset
reference mutation. Same-entry, order, subsection-version, or selection changes
abort the commit and leave any already saved bytes as an unreferenced asset;
they never overwrite a newer entry or current selection.

## 7. Code ownership and module boundaries

### 7.1 New owned sources

| Source | Responsibility |
| --- | --- |
| `src/ts/personalSettings/cssToggleDefinitions.ts` | Stable shipped definitions, revisions, default CSS, and setting-path mapping |
| `src/ts/personalSettings/cssToggles.ts` | Schema validation, normalization, effective values, CRUD, reset, reorder, and size accounting |
| `src/ts/personalSettings/cssToggleRuntime.ts` | Per-toggle style-node reconciliation, order, trial nodes, Safe Mode, and recovery mode |
| `src/ts/personalSettings/cssToggles.test.ts` | Storage, compatibility, limits, ordering, malformed input, and CRUD tests |
| `src/ts/personalSettings/cssToggleRuntime.test.ts` | DOM reconciliation, isolation, order, trial rollback, and recovery tests |
| `src/ts/personalSettings/customFonts.ts` | Font schema, IDs, bounded import acquisition, signature/digest checks, asset metadata, CRUD, selection resolution, and size accounting |
| `src/ts/personalSettings/customFontRuntime.ts` | Asset read-back, integrity verification, code-owned family naming, `FontFace` lifecycle, preview, activation, and teardown |
| `src/ts/personalSettings/customFonts.test.ts` | Font schema, source validation, asset transaction, conflict, reset, missing/corrupt asset, and limit tests |
| `src/ts/personalSettings/customFontRuntime.test.ts` | Binary `FontFace`, selected-face swap, fallback, cancellation, and document ownership tests |
| `src/lib/Setting/Pages/PersonalSettings/CssToggleManager.svelte` | Cards, local filter, editor draft, validation display, and user actions |
| `src/lib/Setting/Pages/PersonalSettings/CustomFontManager.svelte` | Built-in/custom selector, URL/file import, preview, replace, remove, invalid-state recovery, and status UI |

### 7.2 Existing source changes

- `appearance.ts`: delegates CSS-toggle and custom-font normalization/runtime
  sync; retains outer appearance schema, token resolution, and the unchanged
  built-in-font loader.
- `AppearanceSettings.svelte`: retains the master state, mounts
  `CustomFontManager` in the current font area, and mounts `CssToggleManager`
  for editable definitions.
- `PersonalAppearanceRuntime.svelte`: reconciles token state and CSS style nodes
  through the separated runtime.
- `personalAppearanceSettingsData.ts`: retains stable static search metadata and
  built-in font/master definitions; user font names remain local to the dynamic
  manager.
- `personal-appearance.css`: retains code-owned font faces, the custom-font token
  consumer, font fallbacks, and non-editable shared foundation rules only.
- `globalApi.svelte.ts`: extends the existing asset-reference extraction and
  restore-path replacement authorities for `pocketRisuPersonalSettings` without
  changing save scheduling or plugin storage behavior.
- `server/node/server.cjs`: extends the existing asset-reference authority used
  by storage reports, settings backup, and orphan purge. It adds no font-fetch
  route or unauthenticated asset surface.
- `units.cjs`: adds owned files and ordered hooks for the existing
  `globalApi.svelte.ts` and `server.cjs` owners; it must not introduce another
  broad replacement where an existing adapter/hook suffices.

### 7.3 Shared host policy

The implementation reuses the existing appearance hooks in
`DefaultChatScreen.svelte` and `Toggles.svelte`. It does not add a second runtime
component or a second bootstrap call.

The asset-reference changes share `globalApi.svelte.ts` and `server.cjs` with
lazy storage, backup/restore, persona assets, and the client build fence. They
must be expressed as narrow ordered units against both standalone
`personal-settings` and every relevant replacement/adapter owner. The plan must
not infer safety from a standalone font test while a composed full replacement
can erase the reference hook.

Any change to these hooks must be tested in standalone `personal-settings`,
the relevant focused owner graphs, and the maximum complete graph. Existing
explicit ordering after BG-owned imports remains intact.

## 8. Shipped toggle migration

| Definition | Current mechanism | Planned editable boundary |
| --- | --- | --- |
| Center message text | Root token plus static CSS | Definition-owned CSS; underlying left/center setting remains typed |
| Keep Korean words together | Root token plus static CSS | Definition-owned CSS |
| Wrap block code | Root token plus static CSS | Definition-owned CSS |
| Minimal composer | DOM hook plus static CSS | Definition-owned CSS; existing hook retained |
| Text send icon | Svelte branch plus shared glyph CSS | Stable dual-icon hook; CSS controls visibility and glyph content |
| Compact sidebar spacing | Root token plus static CSS | Definition-owned CSS |
| Avatar border | Root token plus static CSS | Definition-owned CSS |
| Panel dividers | Root token plus static CSS | Definition-owned CSS |
| Compact setting rows | Root token plus static CSS | Definition-owned CSS |
| Hide jailbreak toggle | Svelte render suppression | Stable wrapper hook; CSS controls visibility |
| Chat font | Token, static CSS, and dynamic stylesheet loader | Remains outside editable CSS-toggle definitions; built-in values stay unchanged and a separately versioned custom-font registry supplies `custom:<id>` selections |

The text-send and jailbreak migrations must preserve ordinary send, resend,
generation stop/loading, jailbreak value, Safe Mode reversal, focusability, and
screen-reader behavior.

## 9. Runtime stylesheet management

### 9.1 Node model

Runtime style nodes use code-owned attributes:

```html
<style data-pocketrisu-personal-css="shipped:sidebar.compact"></style>
<style data-pocketrisu-personal-css="custom:550e8400-e29b-41d4-a716-446655440000"></style>
```

CSS is assigned through `textContent`. User-controlled names and descriptions
are never inserted into CSS comments, raw HTML, style IDs, or selectors.

### 9.2 Reconciliation

The runtime keeps a map of ID to the last effective CSS string and style node.
On a relevant state change it:

1. computes effective shipped definitions and active custom definitions;
2. removes nodes no longer effective;
3. creates missing nodes;
4. replaces `textContent` only when an item's CSS changed;
5. restores deterministic DOM order without recreating unchanged nodes;
6. places the complete collection at one code-owned anchor immediately before
   `#customcss`, moving it again if that element is later recreated.

Trial reconciliation uses the same algorithm and anchor with a complete
candidate application snapshot. It does not append a candidate node over the
persisted node, and it applies the candidate root tokens under the same temporary
runtime authority. Cancel, expiry, deactivation, and teardown release that
authority and call reconciliation again from the persisted database rather than
relying on a partial DOM undo log.

Master-off, Safe Mode, non-Standard theme, unsupported outer appearance data,
or recovery mode removes all Personal CSS nodes. Stored data remains unchanged.

### 9.3 CSS semantics

- Each item is parsed as an independent author stylesheet.
- A malformed item cannot consume following items.
- `@import` remains local to the item and must still obey browser ordering rules
  inside that item.
- `@keyframes`, custom properties, font faces, and global selectors retain
  document-global CSS semantics and can collide across items.
- Custom items follow shipped items so ordinary custom declarations can
  override shipped declarations when specificity and importance permit.
- Existing global `customCSS` remains after all Personal CSS nodes. This gives
  it later source order only when cascade origin, context, layer, importance,
  and specificity do not already decide the winner; the UI and documentation
  must not promise unconditional override authority.

Trial confirmation covers the exact local CSS text, activation tokens, node
identity, and cascade order observed during the confirmation interval. It does
not certify the availability, contents, timing, privacy, or future stability of
resources reached through `@import`, `url()`, or font loading. The UI must state
that boundary. The runtime does not fetch or inspect those resources to promote
them into trusted input, and it does not treat a style element's `load` event as
proof that all CSS declarations are valid. A late or changed remote response is
handled through ordinary rollback while the trial remains open and through the
documented recovery path after confirmation.

### 9.4 Custom font runtime

The custom-font runtime owns a `WeakMap<Document, ...>` of only the `FontFace`
objects it created. For each selected or previewed entry it:

1. reads the referenced asset bytes with the existing asset API;
2. enforces the actual byte limit and checks length, SHA-256, and signature;
3. copies the exact byte range into a standalone `ArrayBuffer`;
4. constructs `new FontFace(codeOwnedFamily, buffer)` with the v1 normal-face
   contract and awaits `load()`;
5. adds the loaded face to that document's `FontFaceSet`;
6. activates a fixed `chat-font-custom` token and a code-owned CSS custom
   property only after the face is ready; and
7. removes superseded preview or active faces with `document.fonts.delete()`
   without calling `clear()` or touching CSS-defined/built-in faces.

The family uses a fixed prefix plus the validated stable ID and SHA-256. This
keeps a selected replacement distinct from the still-active prior face until
handoff. User-provided names, filenames, URLs, and free-form metadata never
enter `FontFace.family`, CSS source strings, or style text. The existing built-in
stylesheet loader and built-in token/family maps remain separate and unchanged.

Generation counters and cancellation guards prevent a slow asset read or preview
from activating after the user selected another font, closed the dialog, entered
Safe Mode, or left the page. A candidate face is removed on cancel or failure.
The previous active face is retained until its replacement has loaded and the
selection write has been durably acknowledged, preventing an avoidable fallback
flash and preventing UI success from preceding persistence.

If `FontFace` or `document.fonts` is unavailable, built-in fonts remain usable
and custom-font preview/selection reports unavailable rather than generating an
`@font-face` string as a fallback. URL import is only byte acquisition before
asset persistence; runtime activation never contacts that URL.

## 10. Search and large-list behavior

The global Settings Search retains static code-owned labels and IDs for shipped
settings. Each shipped card preserves its current `data-setting-id`, so existing
search results continue to navigate and scroll correctly even when its visible
name is overridden.

The manager provides a local filter over effective names and descriptions.
Custom items are discoverable through this filter. Dynamic global indexing is
deferred because it would require changing the shared Settings Search source
contract and would expand cross-pack impact.

Custom font names are likewise discoverable only inside the font manager. They
do not become static global Settings Search entries. Font entries use a bounded
ordinary list under the separately measured custom-font count limit.

The initial implementation uses bounded list rendering under the measured item
cap. Virtualization is added only if the admitted item count still causes a
measured rendering problem.

## 11. Persistence and scale analysis

### 11.1 Current persistence behavior

`RisuSaveEncoder.set()` reconstructs and encodes the root block during saves.
`RisuSavePatcher.set()` separately stringifies and compares changed root keys.
Patch-sync transport can send only the changed CSS string, but encoding,
cloning, normalization, patch generation, backup, restore, and full-write
fallback still observe the complete stored CSS payload.

Disabled items avoid stylesheet parsing but do not avoid database costs.

Imported font bytes are deliberately different: they live under `assets/...`,
so ordinary root saves encode only bounded font metadata rather than the binary
or a Base64 expansion. The bytes still affect asset upload, disk use, WAL growth,
settings/full-backup size, restore time, orphan accounting, browser read-back,
integrity hashing, and the memory needed for `FontFace` loading. The asset write
and database reference save are separate durable boundaries and must be reported
as such.

### 11.2 Initial synthetic lower bound

A Node synthetic object containing one ASCII CSS string was stringified and
encoded 20 times per size on the repository host:

| CSS bytes | Encoded bytes | Average stringify + `TextEncoder` |
| ---: | ---: | ---: |
| 10,000 | 10,137 | 0.023 ms |
| 100,000 | 100,137 | 0.173 ms |
| 1,000,000 | 1,000,137 | 2.225 ms |
| 5,000,000 | 5,000,137 | 6.781 ms |
| 10,000,000 | 10,000,137 | 13.255 ms |

These are lower bounds. They exclude the rest of the live root, structured
clones, normalization, patch comparison, final database-buffer assembly,
browser CSS parsing, style recalculation, layout, and slower mobile hardware.

No browser CSS parser or headless browser is installed in the planning
environment, so stylesheet parse and recalculation costs remain unmeasured.

### 11.3 Measurement matrix before setting limits

The candidate must measure at least:

- item counts: 10, 100, and 500;
- stored CSS totals: 100 KB, 1 MB, and 5 MB;
- enabled distributions: none, one, half, and all;
- operations: cold boot, page entry, local filter, one toggle switch, reorder,
  edit trial, confirmed save, ordinary chat save, backup, and recovery boot;
- environments: desktop browser harness and physical iPhone PWA.

The font extension of the matrix must additionally cover:

- admitted formats: WOFF2, WOFF, TrueType, and OpenType;
- representative individual font sizes and aggregate stored sizes, including a
  large CJK font near the proposed hard limit;
- operations: local-file import, direct-URL import, preview cancel, confirmed
  import, selection, selected-font replacement, removal, cold boot, Safe Mode,
  settings backup, restore with path replacement, storage report, and orphan
  purge dry-run/readback;
- conditions: duplicate-byte import, absent or forged MIME/extension, missing
  asset, digest mismatch, CORS rejection, truncated/oversize response, aborted
  fetch, storage failure after preview, and root-save failure after asset write;
- environments: desktop browser harness and physical iPhone PWA, with actual
  peak browser memory or the closest available process-level observation noted
  rather than inferred from file size.

The admitted limits must separately cover:

- maximum custom item count;
- maximum UTF-8 bytes per name;
- maximum UTF-8 bytes per description;
- maximum UTF-8 CSS bytes per item;
- maximum UTF-8 CSS bytes across active and inactive items.

Font limits must separately cover:

- maximum custom-font entry count;
- maximum UTF-8 bytes for display and original filenames;
- maximum bytes per imported font;
- maximum aggregate bytes across unique referenced custom-font assets; and
- maximum bytes acquired from a URL before the fetch is aborted.

The UI reports bytes with `TextEncoder`, matching transport size more closely
than UTF-16 string length. Hard limits are enforced before trial application
and before database mutation.

## 12. Adversarial scenarios

| Scenario | Failure mode | Required response |
| --- | --- | --- |
| One item has an unmatched brace | Later rules in the same stylesheet can be consumed | Independent style node limits damage to that item |
| A token-gated shipped definition is enabled for the first time | Candidate style text exists but persisted root tokens leave it inactive during trial | Trial authority applies the proposed root token set and style sequence together |
| Two items target the same property | Specificity, importance, and source order decide the winner | Display deterministic order and provide custom reorder controls |
| Two items define the same `@keyframes` name | Later global definition can alter the earlier animation | Warn; preserve raw semantics; do not auto-rename |
| CSS hides the entire application | Editor and confirmation controls become inaccessible | Schedule rollback before exact-snapshot trial; retain cold-boot recovery because arbitrary CSS can still stall or obscure the document |
| Confirmed CSS breaks after an app update | Every normal boot reapplies the stored rule | Session recovery query disables Personal CSS before runtime application |
| Hundreds of large disabled items exist | Runtime parsing is low, but DB encode/backup/restore remain expensive | Enforce total stored-byte and item-count limits |
| A huge description bypasses CSS limits | Root persistence still becomes large | Bound all user-controlled string fields separately |
| Duplicate custom IDs arrive through restore or manual data edits | Edit/delete can target the wrong item | Fail closed, preserve/export raw data, and allow only an explicit whole-subsection reset |
| One item contains `</style>` | HTML-string injection could close a style element | Use DOM-created nodes and `textContent` only |
| One item uses many remote URLs or `@import` rules | Network traffic, font flicker, privacy, battery costs, and effects arriving after confirmation increase | Warn clearly; retain explicit user ownership; do not claim remote-content equivalence; Safe Mode removes active nodes |
| CSS contains infinite animations or expensive filters | Continuous paint and battery use can rise | Trial on the real device; warn; do not claim static validation can detect cost |
| CSS uses unscoped `*`, `html`, or `body` selectors | The setting page and unrelated app surfaces can change | Trial/rollback and recovery path; preserve raw intent |
| Two devices edit concurrently | A stale draft can overwrite newer data even when the ID is stable | Re-read current DB, compare target fields/order with the draft base, and abort on same-target conflict; retain existing writer-lock/409 behavior |
| Upstream DOM changes | A syntactically valid definition silently stops matching | Exact-target tests, selector anchors, build inspection, and physical L3 |
| A custom item is reordered while another item is edited | Index-based writes can modify the wrong record | Draft and commit by stable ID; derive the latest index at commit time |
| Disabling, deleting, or moving one item unmasks a harmful earlier rule | No CSS text changed in the harmful item, so a string-only trial is bypassed | Trial the complete proposed active sequence for every effective-set or order mutation |
| Unrelated DB state changes after trial | Committing against the latest DB can produce a CSS sequence different from the one observed | Recompute the proposed effective fingerprint at confirmation and require a new trial on mismatch |
| A repair lands while recovery exit is being confirmed | The sentinel can clear for a stored snapshot the user never trialed | Serialize recovery writes and re-read the complete snapshot and gates immediately before clearing the sentinel |
| Root persistence rejects or ambiguously loses the confirmed write | The UI can report success for a value that disappears on reload, or roll back a write the server accepted | Separate mutation from durable acknowledgement; report definite and ambiguous failures without whole-root replacement |
| Trial expiry races a confirmed save | The runtime can restore old CSS before a late save acknowledgement commits the new CSS | Atomically replace trial expiry with a serialized saving state that retains candidate authority until the result resolves |
| `sessionStorage` access is denied | Removing the recovery query can make the next reload apply harmful CSS | Keep recovery active in memory and retain the query unless sentinel write and readback succeed |
| Safe Mode is toggled during a trial | Candidate and permanent nodes can diverge | Safe Mode cancels the trial and removes every Personal CSS node |
| Navigation or page hide occurs during a trial | Temporary CSS can outlive its confirmation UI | Trial state is session-only and is removed on teardown/page-hide; persisted data stays old |
| A renamed non-font file has a `.woff2` extension | Filename acceptance reaches a browser font parser as trusted data | Check magic, bounded bytes, digest, and `FontFace.load()`; keep extension and MIME advisory only |
| A URL omits or lies about `Content-Length` and streams excessive bytes | Import exhausts mobile memory or storage before validation | Count streamed bytes, abort at the hard cap, and never depend on headers as the enforcement boundary |
| A remote URL requires cookies, blocks CORS, or changes later | Import leaks credentials, fails inconsistently, or produces a different font on reload | Omit credentials/referrer, require browser CORS, store no URL, and snapshot the successfully fetched bytes into the asset store |
| The app closes after the asset write but before the DB reference is acknowledged | A committed reference rollback cannot remove the already stored binary safely | Prefer an orphan over a broken reference; report unresolved state and leave reclamation to existing orphan cleanup |
| Asset cleanup or settings backup does not know the new font field | A live font is permanently deleted or absent after restore | Extend and cross-test client/server reference walkers, settings backup, purge, and exact restore-path replacement |
| Two font entries contain identical bytes | Deleting one entry can destroy the other entry's shared content-addressed asset | Remove only registry references; never physically delete from the font UI |
| The selected font is removed | `chat.font` points at a missing entry and behavior differs across devices | Confirm and atomically set `chat.font` to `app` with registry removal; on failure retain the old entry and selection |
| A slow font preview resolves after dialog close, selection change, or Safe Mode | A stale face can become active or remain resident | Bind reads/loads to a generation, delete owned stale faces, and re-check all gates before activation |
| A restored asset path is renamed but font metadata is not | The registry stays valid structurally but can never load | Include exact personal-settings string references in `replaceDbResources()` fixtures and verify post-restore read-back/load |

## 13. Security and preservation rules

- Treat CSS as user-authored executable presentation data with document-wide
  effects, not as trusted static configuration.
- New editor and runtime code must not use `innerHTML` for CSS, names,
  descriptions, notices, or identifiers.
- Do not interpolate names, descriptions, or unvalidated IDs into selectors.
- Do not call `setDatabase()`, `setDatabaseLite()`, or any plugin-array writer
  for a CSS-toggle or font edit.
- Preserve unknown personal, appearance, override, and custom-item fields where
  the current schema allows forward-compatible retention.
- Do not rewrite the existing global `customCSS` value.
- Do not fetch or inspect remote CSS on the user's behalf.
- Do not accept a remote stylesheet or HTML page as a font import, and do not
  add a server-side font proxy. URL import is a bounded credential-free browser
  fetch of one direct font binary.
- Do not store font bytes, Base64, data URLs, Blob URLs, or source URLs in the
  database. Store validated bytes through `saveAsset()` and retain only bounded
  metadata and the asset reference.
- Do not trust filename, extension, MIME type, response headers, or signature
  checks as proof that a font is safe or supported. The browser font parser is
  still a parser boundary, and `FontFace.load()` failure must remain recoverable.
- Do not derive CSS syntax or the runtime family from a user-visible font name,
  original filename, or URL.
- Do not call `document.fonts.clear()` or remove faces not created by the custom-
  font runtime.
- Do not physically delete a font asset from add, replace, remove, reset, failed-
  save, or rollback UI paths. Only the existing reference-aware orphan authority
  may reclaim it.
- Do not activate or report a custom font as saved until asset read-back,
  integrity/load validation, and strict root-persistence acknowledgement have
  completed for the relevant operation.
- Do not claim CSS syntax validation as a security or performance guarantee.
- Do not persist an enabled visual mutation unless its exact application
  snapshot, including activation tokens, was trialed and still matches at
  commit time.
- Do not report a confirmed edit as saved until the strict root-persistence
  boundary acknowledges it. An ambiguous response is not durable success.
- Do not partially normalize future or malformed `cssToggles` or `fonts` data.
  Explicit reset requires raw-data export/copy affordance and destructive
  confirmation.
- A delete action removes only the selected custom item after explicit UI
  confirmation. Shipped definitions are reset or disabled, not deleted. Font
  removal deletes only registry metadata and selection when applicable.

## 14. Implementation stages and gates

### Stage 0 — Baseline and equivalence fixture

1. Capture current default definition tokens, stylesheet rule text/order, and
   behavior-backed render branches.
2. Capture built-in font values, family/token mapping, on-demand stylesheet
   loading, preview states, Safe Mode behavior, and current iPhone observations.
3. Record the current in-memory mutation, autosave, strict root-save, rejection,
   ambiguous-response, and flush boundaries available to standalone
   `personal-settings` and to the maximum complete graph.
4. Record the client/server asset-reference, settings/full-backup, restore-path
   replacement, storage-report, and orphan-purge authorities in every relevant
   owner graph.
5. Verify the exact iPhone installed-PWA recovery entry path and whether a
   browser-opened recovery URL reaches the same storage and bootstrap path.
6. Add a deterministic fixture that describes the current shipped CSS effects.
7. Record standalone and relevant composed owner graphs before source changes.
8. Record the active patcher gate authority. The repository's raw-selection
   verifier is retired and absent; if an encompassing instruction still requires
   it, reconcile that instruction before claiming gate closure rather than
   inventing or silently skipping a command.

Gate: the baseline fixture reproduces every current shipped appearance effect
and font state without changing a target tree, and the implementation plan names
a usable standalone persistence acknowledgement boundary, a proved iPhone
recovery entry path, and every asset-preservation authority touched by fonts.

### Stage 1 — Definition extraction

1. Add the shipped definition registry.
2. Move editable default rules out of the monolithic stylesheet.
3. Retain font and non-editable shared foundation rules in the static sheet.
4. Generate the same effective CSS and token order as the baseline fixture.

Gate: focused logic tests, exact generated-rule comparison, Svelte diagnostics,
and an isolated production build pass with no user-visible behavior change.

### Stage 2 — Behavior-backed CSS hooks

1. Convert ordinary-send icon switching to a stable dual-icon hook.
2. Convert jailbreak visibility to a stable wrapper hook.
3. Preserve resend, stop/loading, value, focus, accessibility, and Safe Mode
   behavior.

Gate: focused component/runtime tests and base/BG/shared-owner graph tests pass.

### Stage 3 — Storage and effective definitions

1. Add nested schema validation and normalization.
2. Add field-level override, custom CRUD, reorder, reset, and byte accounting.
3. Add malformed/future data preservation and duplicate-ID rejection.
4. Add raw export and explicit whole-subsection reset for invalid data.
5. Add target-base and effective-snapshot conflict checks.
6. Add compare-and-swap handling for a definite persistence rejection and an
   explicit unresolved state for ambiguous acknowledgement failure.
7. Confirm outer appearance schema v1 and older-reader preservation.
8. Add the nested custom-font schema, custom selection resolution, import byte
   acquisition/signature/digest checks, CRUD, reset, and unique-asset accounting.
9. Add the asset-first/reference-second transaction with read-back and failure
   receipts; preserve possible orphan bytes rather than issuing compensating
   deletion.
10. Extend client/server asset reference and restore-path replacement owners,
    including conservative preservation for malformed/future personal settings.

Gate: pure storage tests pass for empty, supported, malformed, future,
rollback-reader, unknown-field, explicit-reset, same-target-conflict,
unrelated-change rebase, stale-trial, font source, font integrity, asset-first
failure, asset preservation, backup, purge, and restore-remap cases.

### Stage 4 — Runtime reconciliation

1. Add per-toggle nodes and complete application-snapshot trial reconciliation,
   including proposed root activation tokens.
2. Add deterministic ordering, one permanent anchor, and incremental reuse.
3. Give the trial owner temporary authority so ordinary database synchronization
   cannot restore persisted tokens or nodes over the candidate.
4. Integrate master, theme, Safe Mode, recovery, deferred revalidation, and
   global custom-CSS order.
5. Schedule rollback before candidate application and add teardown/page-hide
   reconciliation from persisted data.
6. Add custom-font asset read-back, integrity verification, code-owned family,
   `FontFace` load/add/delete ownership, load-before-activation, race cancellation,
   and suppression under all existing appearance gates.

Gate: DOM tests pass for syntax isolation, exact trial/commit equivalence,
first-enable token activation, removal/reorder trials, rollback, recovery,
`#customcss` recreation, unchanged-node reuse, all deactivation paths, custom-
font preview/selection/replacement, stale-load rejection, and built-in-font
non-interference.

### Stage 5 — Manager UI

1. Add shipped and custom cards.
2. Add edit draft, trial/save, cancel, reset, delete, reorder, and local filter.
3. Preserve `data-setting-id` anchors for shipped settings.
4. Add accessible labels, descriptions, status announcements, focus return, and
   mobile-size controls.
5. Add recovery-mode repair-and-disable actions and invalid-subsection raw
   export/reset confirmation.
6. Add saving, durably saved, definite rejection, and ambiguous-result states;
   preserve the draft whenever durable success is not established.
7. Add the custom-font list, source-mode import dialog, multilingual preview,
   load-before-select behavior, replace/remove confirmation, invalid-subsection
   recovery, and actionable CORS/file fallback messages.

Gate: component tests and Svelte diagnostics pass; cancel produces no DB or DOM
change; every destructive custom delete or subsection reset requires explicit
confirmation; visually active mutations cannot bypass trial through list actions.
Font UI tests must also prove that add does not select implicitly, failed import
does not create metadata, selected removal falls back atomically, and no font UI
path invokes physical asset deletion.

### Stage 6 — Scale limits and recovery

1. Run the storage/browser/device measurement matrix.
2. Set and test byte/count warning and hard-limit values from observations.
3. Verify the proved iPhone PWA recovery entry from a cold boot, including the
   storage-denied fallback that retains the query.
4. Verify query consumption, reload persistence, explicit recovery exit, and
   recovery repair-and-disable followed by a full stored-snapshot exit trial
   and a normal-session item trial.
5. Mutate an allowed recovery target during the exit interval and verify that
   stale confirmation cannot clear the sentinel.
6. Verify that limit rejection retains both current DB data and effective CSS.
7. Run the font format/source/size/failure matrix, set separate font limits, and
   verify that a saved local or URL-imported font survives cold boot, settings
   backup/restore with path remap, Safe Mode, and reference-aware orphan checks.

Gate: measured limits, observed results, and remaining device limitations are
recorded before live candidate delivery.

### Stage 7 — Patcher and release candidate delivery

1. Run focused `personal-settings` tests and the complete patcher suite.
2. Run the current all-or-nothing patcher's focused owner graphs and maximum
   complete graph lifecycle. The retired raw-selection verifier is not an
   executable gate for this baseline.
3. Verify standalone, focused composed, and maximum complete owner graphs,
   exact reapply, current status, empty-selection revert, byte/mode restoration,
   and generated installer parity.
4. Run the target frontend tests, server tests relevant to persistence,
   Svelte diagnostics, production build, and runtime audit.
5. Run composed client/server asset-reference, settings/full-backup, restore,
   storage-report, and purge tests against every relevant full-replacement owner.
6. Commit implementation units separately from generated installers and
   validation documentation.
7. Publish a `v0.2.3-experimental.N` candidate only after automated gates pass.

Stable release remains gated by the instructed physical L3 scenarios.

## 15. Validation matrix

### 15.1 Pure storage tests

- no appearance object;
- supported appearance without `cssToggles`;
- current toggles with no overrides;
- partial field overrides;
- reset removing only the target override;
- custom add/edit/enable/disable/reorder/delete;
- duplicate IDs;
- unknown shipped IDs;
- malformed groups and future nested version;
- raw export and explicit subsection reset without adjacent-field loss;
- unknown-field retention at every enclosing level;
- stale draft saved after unrelated current-DB changes;
- same-target edit and reorder conflicts;
- unrelated DB changes that preserve the trial fingerprint;
- post-trial changes that require a new trial;
- definite persistence rejection with target-only compare-and-swap restoration;
- ambiguous persistence acknowledgement without a false success or broad root rollback;
- trial-expiry and page-hide races after confirmation cannot produce a durable
  snapshot different from the runtime state reported to the user;
- UTF-8 count and aggregate limit boundaries.
- empty/supported/malformed/future custom-font groups and unresolved selections;
- duplicate font IDs, shared asset paths, invalid paths/formats/digests, and
  per-file/unique-aggregate byte boundaries;
- URL/file acquisition, signature detection independent of extension/MIME,
  bounded streaming abort, asset read-back, and URL non-persistence;
- asset-first success followed by root-save rejection or ambiguity leaves no
  broken committed reference and performs no physical deletion;
- selected-font removal and subsection reset change selection to `app` in the
  same target mutation;
- client/server personal-settings asset extraction and exact restore-path
  replacement preserve supported, malformed, and future values.

### 15.2 Runtime tests

- one style node per effective definition;
- unchanged node identity retained across unrelated DB mutations;
- one malformed stylesheet does not alter sibling node contents;
- deterministic shipped/custom source order;
- disable, delete, reset, and reorder trial the complete proposed sequence;
- first enable of a token-gated shipped definition is visibly active during the
  trial before any database mutation;
- trial and committed snapshots have identical gates, root tokens, IDs, text,
  anchor, and order;
- ordinary database-driven synchronization cannot overwrite a live candidate's
  root tokens or style nodes;
- `@import` remains at the start of its own stylesheet;
- remote imports are never represented as locally validated or fingerprinted
  content, and delayed arrival does not extend a completed trial guarantee;
- master off, non-Standard theme, Safe Mode, unsupported data, and recovery mode
  remove all nodes;
- global `#customcss` remains later in document source order, including after
  that element is recreated;
- trial confirm, cancel, expiry, navigation, page hide, and reload;
- recovery-exit trial keeps the sentinel until confirmation and returns to an
  empty Personal CSS runtime on cancel, expiry, or failure;
- a stored snapshot or activation-gate change during recovery exit invalidates
  the trial and leaves the sentinel set;
- denied `sessionStorage` access retains the recovery query and keeps the
  current load suppressed;
- text send and jailbreak hooks retain their non-CSS behavior contracts.
- selected custom font loads and verifies before its token/property activates;
- custom preview cancel, dialog close, navigation, Safe Mode, and stale async
  completion delete only runtime-owned candidate faces;
- selected replacement retains the previous face until durable success and
  falls back without rewriting data on missing/corrupt assets;
- code-owned family names are stable for the same ID and digest, change when
  bytes change, and remain independent of display name, original filename, and
  import URL;
- built-in stylesheet links and CSS-defined faces are never removed or replaced
  by custom-font teardown;
- unsupported `FontFace`/`document.fonts` disables only custom font operations.

### 15.3 UI tests

- effective default and overridden names/descriptions;
- edit draft does not mutate DB or runtime;
- cancel restores the exact prior form and effective CSS;
- reset removes overrides and adopts the current registry revision;
- local filter uses effective names/descriptions;
- custom reorder operates by stable ID;
- focus returns to the initiating control;
- live status messages are announced;
- delete confirmation targets only the selected custom item;
- recovery permits repair-and-disable but blocks enabled visual commits;
- master-off, Safe Mode, and non-Standard-theme sessions permit metadata and
  disabled-result repairs, mark revalidation as required, and block reorder or
  enable until an activation trial succeeds;
- confirmation reports saving separately from durable success and preserves the
  draft on definite or ambiguous persistence failure;
- recovery exit trials the complete stored snapshot before clearing the
  sentinel, including rules unmasked by the repair;
- when storage is available, the recovery query becomes a session sentinel,
  survives reload without the query, and clears only through explicit exit or
  session end; when storage is denied, the query remains present across reload;
- invalid current/future data remains byte-equivalent until explicit reset;
- subsection reset presents raw export/copy first and removes no adjacent data.
- font source mode is explicit and rejects stylesheet/page URLs with a direct-
  file explanation;
- local-file and direct-URL imports show byte progress/status, preview before
  confirmation, and do not add metadata on cancel or failure;
- adding a custom font does not implicitly select it;
- selection waits for load and durable save, and a failed selection leaves the
  previous font active;
- selected replace/remove and invalid-font reset target only the intended entry,
  with selected removal/reset falling back to the app font atomically;
- CORS, oversize, corrupt, storage, and ambiguous-save failures remain distinct
  and actionable without exposing or persisting the source URL;
- no font add/replace/remove/reset action calls physical asset deletion.

### 15.4 Integration and patch tests

- appearance owned-file and unit registration;
- static Settings Search entries and `data-setting-id` anchors;
- existing explicit unit order around BG imports;
- DefaultChatScreen and Toggles composition with relevant packs;
- exact 1.10 target compatibility;
- installer plan/apply/status/reapply/revert;
- focused owner graphs and the all-or-nothing maximum complete graph lifecycle;
- no new unordered path collision;
- global `customCSS`, font loader, plugin array, custom endpoints, storage modes,
  and unrelated personal settings preserved;
- the strict root-persistence acknowledgement path exists in the standalone
  focused owner graph as well as the maximum complete graph.
- custom-font paths are retained identically by client cleanup, server storage
  report/settings backup/orphan purge, full backup, and restore-path replacement;
- supported, malformed, and future personal-settings reference fixtures produce
  matching client/server live-asset sets;
- shared `globalApi.svelte.ts` and `server.cjs` replacement/adapter combinations
  retain the font reference units in standalone and maximum graphs;
- importing identical bytes deduplicates the stored path while removing one
  registry entry cannot make the remaining reference purgeable.

### 15.5 Physical iPhone L3

The physical gate must identify this feature and use explicit screen actions:

1. Open Personal → CSS appearance.
2. Edit a shipped CSS toggle, trial it, cancel it, and verify the old effect.
3. Edit again, confirm it, wait for the explicit durable-save success state,
   leave settings, reload, and verify persistence.
4. Reset the shipped toggle and verify the current default returns.
5. Add a custom toggle with name, description, and CSS; enable and disable it.
6. Reorder two conflicting custom toggles and verify the cascade result changes.
7. Reorder or disable a rule so that it would reveal a screen-hiding earlier
   rule, then verify that the complete candidate sequence rolls back.
8. Trial malformed CSS and verify it cannot consume sibling item styles; then
   trial screen-hiding CSS and verify timer rollback without claiming that
   browser parsing validates the malformed text.
9. Starting from a screen-hiding stored rule and a cold installed-PWA launch,
   follow the documented recovery URL/launch procedure, verify that no Personal
   CSS applies before the editor is usable, and verify that reload remains in
   recovery after the query has been consumed.
10. Repair-and-disable the stored enabled toggle, start the complete stored-
    snapshot exit trial, let it roll back once, repeat and confirm exit, then
    trial and re-enable the repaired item. Change the stored snapshot during one
    exit attempt and verify that stale confirmation cannot clear recovery.
11. With the master off or Safe Mode active, repair CSS into a disabled result,
    then reopen the gate and verify that the required full-snapshot activation
    trial occurs before Personal CSS returns.
12. Toggle Safe Mode and verify every Personal CSS effect pauses, remains
    suppressed until the activation trial is confirmed, and then returns.
13. Exercise the text send icon and jailbreak control in their affected states.
14. Exercise the admitted high-count/high-byte fixture and report visible input,
    scrolling, switching, navigation, reload, and save behavior separately.
15. Add a custom font from a local admitted font file, preview and cancel once,
    then add and confirm it; verify cancel created no entry and confirm reports
    durable success without changing the selected font.
16. Select the uploaded font, verify the multilingual preview and actual chat,
    leave settings, cold-reload the installed PWA, and verify that the same font
    loads from the stored asset. Toggle Safe Mode and verify clean app-font
    fallback and restoration without losing metadata.
17. Import a controlled direct HTTPS font-file URL, verify actionable failure for
    a CORS-blocked URL, and verify through controlled request evidence that a
    successful URL is fetched only for import and is not contacted on later
    selection or cold reload.
18. Replace the bytes of the selected custom font and verify that the old face
    remains until durable success. Then remove the selected font, verify the app
    font and `chat.font` fallback commit together, and confirm backup/restore and
    orphan reporting preserve every still-referenced shared font asset.

## 16. Acceptance criteria

Implementation is complete only when all conditions below hold:

- Existing appearance effects remain equivalent before user overrides.
- Every shipped CSS toggle can edit and reset its effective name, description,
  and CSS without source-file changes.
- Custom toggles support complete CRUD, enable state, and deterministic order.
- A user can import an admitted local font file or direct HTTPS font-file URL,
  preview it, save it as an asset, select it, replace it, and remove its registry
  entry without editing source files.
- URL import stores an immutable local snapshot and persists neither the URL nor
  remote credentials; runtime font activation performs no remote request.
- Font binary data never enters the root database. Supported metadata stores
  only bounded values, integrity data, and an `assets/...` reference.
- A custom font activates only after actual asset length/digest/signature and
  `FontFace.load()` succeed; failure preserves data and the previous active font.
- Selected font removal/reset changes `chat.font` to `app` in the same database
  mutation, and no font UI path physically deletes an asset.
- Client cleanup, server report/backup/purge, full backup, and restore remapping
  all recognize font references, including conservative preservation of
  malformed or future personal-settings values.
- Cancel and failed trial paths produce no persistent mutation.
- Every enabled effective-set or order change trials the exact proposed
  committed application snapshot, including activation tokens, disable, delete,
  reset, and reorder.
- A malformed toggle cannot invalidate sibling stylesheets.
- Safe Mode and recovery mode can disable all Personal CSS without data loss.
- Recovery can repair an offending item only into a disabled state before a
  full stored-snapshot exit trial, normal-session item trial, and re-enable.
- Recovery exit re-reads the complete stored snapshot and all activation gates;
  stale confirmation cannot clear the sentinel.
- The documented iPhone recovery entry reaches the intended data and suppresses
  Personal CSS before the first runtime synchronization. If `sessionStorage` is
  unavailable, retaining the query preserves suppression across reload.
- Existing global `customCSS` remains later in document source order without
  overstating its authority over importance, layers, or specificity.
- Stored CSS size is bounded by measured and documented limits.
- Unsupported or malformed data is preserved rather than silently rewritten.
- Same-target stale writes fail, and a confirmation cannot commit a stylesheet
  snapshot different from the one the user trialed.
- A confirmed mutation is reported as saved only after strict root persistence
  acknowledges it; definite and ambiguous failures preserve the draft and do
  not replace unrelated root state.
- Trial equivalence is limited honestly for remote CSS resources; local text
  equality is never presented as proof of remote content or future behavior.
- Shared patch hosts add no unordered collision and pass exact round trips.
- Automated repository gates and the explicit physical iPhone L3 pass.

## 17. Measurement-dependent decisions

The following values remain intentionally unset until Stage 6 observations:

- trial confirmation duration;
- item-count warning and hard limit;
- per-item CSS byte warning and hard limit;
- aggregate CSS byte warning and hard limit;
- name and description byte limits;
- whether the admitted item count requires list virtualization.
- custom-font count warning and hard limit;
- imported-font per-file and aggregate unique-asset byte limits;
- URL acquisition abort limit and progress cadence;
- custom-font display/original-filename byte limits.

These are implementation parameters, not unresolved product behavior. Their
selection must be recorded with the measurements that justify them.

## 18. Rollback

The feature is additive at the database level. Reverting the patch leaves the
unknown `cssToggles` and `fonts` groups preserved by the existing appearance
writers while older code ignores them. An older reader treats a `custom:<id>`
chat-font selection as the app font while preserving that unknown string on
unrelated leaf writes. Existing appearance enable values remain in their current
fields.

A code rollback therefore consists of reverting the CSS-toggle manager/runtime
and custom-font manager/runtime units and restoring the previous static
appearance CSS and render hooks. It must not delete `cssToggles`, `fonts`, or
font assets; rewrite global `customCSS`; or reset existing appearance selections.
The passive personal-settings asset-reference and restore-remap compatibility
units remain installed while any imported font reference may exist. They may be
removed only after a separate, explicit, validated data migration or a proved
zero-reference state; disabling the UI does not make destructive cleanup safe.
