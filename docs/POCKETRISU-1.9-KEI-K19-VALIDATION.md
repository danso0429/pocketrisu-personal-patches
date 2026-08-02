# PocketRisu 1.9 Kei K19 fullscreen viewer validation

## Scope and decision

K19 is qualified on exact PocketRisu 1.9.0 as an accessibility-only delta to
the native `AssetViewer.svelte`.

Official 1.9 already provides the broader and better owner: character and
module asset entry points, image filtering, grid/search, keyboard navigation,
fullscreen arrows, native scroll-snap swipe, and adjacent-image-only mounting.
The 1.8 K19 viewer, navigation helper, and `CharConfig` wiring are therefore
target-scoped to 1.8.1 and are not emitted on 1.9.

The remaining K19 outcomes on 1.9 are:

- dialog and modal semantics for the native viewer;
- accessible names for search, thumbnails, zoom, close, previous, and next;
- explicit button types;
- 44-pixel close targets matching the already 44-pixel arrow controls.

No asset add/delete/exclude, database, character, module, URL resolution,
filtering, keyboard, swipe, or gallery-state owner is replaced.

## Target graphs

- Exact 1.8.1 activates the original seven units: three owned files and four
  focused `CharConfig.svelte` hooks.
- Exact 1.9.0 activates eight small replace units on only
  `src/lib/Others/AssetViewer.svelte`; it creates no owned file and touches no
  character/module editor.
- The focused 1.9 plan changed one source path with eight units and zero
  collisions. With toolchain hardening it resolved 15 units and four managed
  source/toolchain paths.

## Observed gates

- Patcher K19 contract tests and manifest syntax passed.
- The exact-1.9 K19/toolchain candidate passed 69 frontend test files / 1,040
  tests plus 3 skips and 4 server files / 99 tests. The first server run was
  blocked only by restricted-sandbox localhost `EPERM`; the same suite passed
  with local-listen permission.
- Svelte diagnostics reported 0 errors and the same four upstream
  `DefaultChatScreen.svelte` accessibility warnings already recorded on the
  pristine target. The K19-managed AssetViewer emitted no warning.
- Production build passed. Its upstream externalized-module, dynamic-import,
  plugin-timing, and large-chunk warnings were outside K19's one-file delta.
- Applied source retained native `ArrowLeft`/`ArrowRight`, scroll handler, and
  scroll-snap code. Legacy `FullscreenImageViewer.svelte` and
  `fullscreenImageNavigation.ts` were absent.
- Repeated plan changed zero source files, status reported every managed file
  current, and empty-selection revert restored zero tracked diff.

The final dual-target exhaustive catalog gate remains an aggregate gate after
all Kei children and K12 are rebased; no aggregate result is inferred here.

## L2.5 runtime audit

### Phase 1 — flat discovery

- App-level native AssetViewer mount and open/close store;
- character and module entry points;
- image extension filtering, URL resolution, search, sparse filtered list,
  thumbnail selection, current index, and boundaries;
- document keyboard listener lifecycle;
- native scroll-snap swipe, rAF scroll guard, adjacent slide mounting, and
  previous/next button convergence;
- dialog semantics, accessible names, close/arrow touch targets, and focus;
- asset add/delete/exclude and storage/database mutation;
- async URL completion after source changes and component teardown;
- iPhone tap, swipe, rotation, safe-area, and memory behavior.

### Phase 2 — external-anchor resolution

- **Native ownership — newly read and measured.** Official 1.9 owns all entry,
  filter, grid, keyboard, swipe, and memory-bounding behavior. Applied source
  retains those code paths byte-for-byte outside eight marked attribute/class
  replacements; legacy K19 owners are absent.
- **Accessibility delta — structural plus compile gate.** The outer viewer is
  one named modal dialog; zoom is a named group within it. Search, thumbnail,
  close, and navigation buttons have accessible names, and both close controls
  use `w-11 h-11`. Svelte diagnostics and production build pass.
- **Sparse/boundary behavior — upstream tested surface plus source read.** The
  native store filters non-images before rendering, filtered indexes are
  contiguous, and arrows are conditional on `canPrev`/`canNext`. Navigation
  buttons and keys call the same `go()`/`scrollToIndex()` owner as swipes.
- **Mutation preservation — structural.** The 1.9 delta contains no
  `additionalAssets` mutation, `setDatabase`, asset removal, `getFileSrc`, or
  store open/close implementation. Character/module edit owners remain native.
- **Resources — prepared upstream surface.** The document keyboard effect has
  explicit cleanup and scroll callbacks are rAF-bounded. Async `getFileSrc`
  completion and a pending one-frame rAF after teardown are upstream behavior,
  not changed or claimed bounded by K19.
- **Focus/mobile behavior — prepared surface.** Modal semantics improve screen
  reader ownership, but detached compilation does not prove browser focus
  trapping/restoration, iOS swipe physics, rotation layout, or safe-area
  reachability. These remain concrete L3 checks.

### Phase 3 — triage

- **Q3, fixed:** duplicate viewer/navigation/editor wiring is retired on 1.9;
  only the absent accessibility/touch outcomes remain.
- **Q3, resolved by measured behavior:** exact target plan/apply/replan/status/
  revert, full tests, diagnostics, and build pass.
- **Q4, upstream prepared surface:** async URL/rAF teardown behavior has no
  K19 regression signal and remains a review trigger only if stale thumbnails
  or teardown errors appear.
- **Q4, partially observed:** native swipe, arrow navigation, both boundaries,
  and rotation were reported normal during the session. VoiceOver was
  intentionally not exercised by user choice. Filtering/search, focus return,
  physical touch-target reachability, module viewer, and disposable asset
  mutation remain unobserved rather than inferred passed. Those exercised
  controls are native 1.9 behavior and the instructed marker was invalid, so
  the first observation alone did not identify the PWA bundle. A later K22
  search/folder-picker observation supplied a patch-only physical marker; it
  resolves bundle identity without changing the K19 result scope.

## Physical L3 observation status

The first aggregate iPhone report is a limited normal observation, not yet a
candidate L3 pass:

- observed normal: one-step swipe, arrow navigation, first/last boundaries,
  and portrait/landscape rotation;
- not exercised by user choice: VoiceOver labels; and
- still open: image-only filtering/search, focus containment/return, physical
  close-target reachability, module-viewer behavior, and unchanged disposable
  character-asset mutation.

VoiceOver remains an explicitly recorded residual risk. It is not silently
converted to a pass or repeatedly requested; a later publication decision can
accept the not-exercised status if the user does not choose to revisit it.

## Concrete iPhone L3 authority

1. From a character with image and non-image additional assets, open the
   native Asset Viewer. Confirm only images appear and search filters them.
   Only if the user later chooses to revisit VoiceOver, confirm it identifies
   the dialog, search, thumbnails, and close control.
2. The middle-image swipe, arrows, and both boundaries were reported normal.
   Still confirm the displayed name/count follows the same image
   without double-stepping; check the VoiceOver destination label only if that
   surface is revisited.
3. Rotation was reported normal. Test both close controls, focus return,
   and one-handed reachability of the 44-pixel targets.
4. Repeat from a module asset viewer, then add/delete/rename a disposable
   character asset and confirm the existing editor behavior is unchanged.

A duplicate step, non-image thumbnail, stale character/module gallery,
unlabeled control, unreachable close action, lost background focus after
close, or changed asset mutation is the unsafe signal.

The initial K19 qualification performed no live apply or restart. A later
authorized aggregate candidate was applied for L3 and produced the partial
physical observation above. The later K22 marker confirms the candidate bundle,
but the remaining unobserved K19 surfaces still prevent promoting K19 to a
pass. K19 itself received no L3 code change or installer rebuild. No push, tag,
release, or publication occurred.
