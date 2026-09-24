# Collapsible font picker and readable sizes

Candidate: `0.2.3-experimental.4`, Personal settings `0.5.3`, PocketRisu 1.10.0.

Personal CSS and font counters now use one-decimal decimal KB/MB labels
(1 KB = 1,000 bytes). Exact byte counts, limits, signatures, and persisted
metadata are unchanged.

The chat-font selector is an initially collapsed inline list. Each visible
name previews its font. Custom names and rename/file-change/delete buttons
share one row. Built-in rows remain immutable choices. The separate font
search and duplicate management cards were removed. Adding a font opens the
list without selecting it; selection still uses the existing strict save.

## Preview ownership and runtime audit

Discovery: expand → mount rows → observe intersection → load metadata/asset
and face → display name → hide/collapse/teardown. Selection and the three
custom actions retain the existing persistence and asset ownership paths.

- Visible built-in previews reuse the existing stylesheet cache and named
  families. These optional stylesheet requests now also occur when that row
  is visibly previewed, rather than only after selection.
- A custom row owns a separate `CustomFontRuntime`. It reads the existing
  bounded local asset path and verifies bytes before loading. It never calls
  `activate`, changes the root family, or persists selection.
- Offscreen rows, collapsed lists, paused appearance, and component teardown
  release owned custom faces. Generation checks reject late reads/loads.
  Existing selected-face ownership is preserved independently.
- Built-in shared stylesheets remain cached for ordinary font selection;
  cleanup does not remove another consumer's stylesheets or selected face.

Svelte 5.55.3 is installed. Its effect cleanup and `details bind:open` behavior
were checked against [official Svelte documentation](https://svelte.dev/docs/svelte/$effect).
Visibility uses [Intersection Observer](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API)
with the viewport root, including ancestor clipping. Browsers without that API
fall back to mounted-row previews. Physical iPhone rendering remains a device
gate; viewport geometry does not substitute for it.

## Observed validation

- Patcher: 51 files passed. Complete Personal suite: 10 files / 86 tests.
- Svelte diagnostics: 0 errors / 0 warnings. Production build: 7,988 modules.
- Five owner graphs passed runtime tests, current/zero-change reapply,
  compatibility rollback/old-reader preservation, and exact byte/mode revert.
  Complete graph: 42 packs, 983 units, 365 paths, 13 ordered collisions.
- Real browser with isolated native SQLite at 320px and 390px: custom rows
  measured 46px high; action targets were at least 44×44px and stayed to the
  right of the name within the row. Search/select removal and KB/MB labels
  were checked in the rendered UI.
- Native browser flows passed font add without implicit selection, explicit
  selection, inline rename, selected-file replacement while retaining the old
  face until save, selected deletion/app fallback, and restoration of the
  original selection after acknowledged completion. No page errors occurred.
- Closing the list preserved the selected face. A deliberately delayed
  preview load completed after collapse without registering a stale face.
- Remote built-in stylesheet loading used a controlled font fixture. This
  verifies the loader/row contract, not external CDN availability or the
  visual appearance of every remote typeface.

Both installer aliases were reproduced byte-identically, 8,119,973 bytes,
mode 0755, SHA-256
`a7d594fc9d9c5b6b03cf516a07929c42cb55512fb49e48fa88e1b15bd996fa80`.
The original feature's recovery, persistence, and imported-font rollback
boundaries remain in `POCKETRISU-PERSONAL-CSS-TOGGLE-EDITOR-VALIDATION.md`.
