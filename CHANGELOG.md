# Changelog

## 0.1.6-experimental.1

- Add an independent `hardening` profile containing `parser-hardening`, and
  include the same pack in the unified `all` profile.
- Drop only a terminal, empty, unterminated ChatML assistant generation marker
  while preserving content-bearing unterminated messages and explicitly ended
  empty messages.
- Replace greedy Thoughts extraction with one shared depth-aware scanner for
  ChatML and the main response path, covering sibling, empty, nested, and
  unmatched blocks.
- Evaluate CBS comparison operands before `and`/`or` while preserving
  right-to-left logical evaluation and the legacy path without logical
  operators.
- Replace all three pre-existing parser skips with passing regression
  specifications.
- Keep hardening apply, status, revert, and SHA-256 pack ETag independent; test
  that any managed-content change produces a different ETag.
- Pass 9/9 patcher tests, a clean PocketRisu v1.8.1 suite with 94 files and
  1,218 tests passed with no skips, Svelte diagnostics at 0 errors and 0
  warnings, production build, and exact hardening/unified round trips.

## 0.1.5

- Add a multi-image gallery to each persona while retaining `icon` as the
  selected compatibility image used by chats, plugins, and persona PNG export.
- Replace the duplicate large active-image preview with the gallery in the
  editor image area, with multi-file import, thumbnail activation, and
  non-destructive gallery removal.
- Let Persona PNG export choose one gallery image without changing the active
  persona image, while preserving the existing default-image fallback.
- Adopt every legacy single image into its persona gallery without moving or
  deleting asset data.
- Preserve persona gallery and persona-folder images across asset cleanup,
  resource replacement, and partial backup.
- Pass 8/8 patcher tests, the clean PocketRisu v1.8.1 suite with 1,206 tests
  passed and 3 intentionally skipped parser specifications, Svelte diagnostics,
  production build, exact installer regeneration, production health checks, and
  iPhone gallery/export L3.

## 0.1.4

- Fix new-chat saves when PocketRisu inserts the new chat at index zero before
  its database metadata reaches the server.
- Resolve chat reads by stable ID whenever `x-chat-id` is present, retaining
  path-index lookup only for legacy callers without the header.
- Classify create versus update from the last server-confirmed database. Only
  an authoritative missing new ID enables `If-None-Match: *`; remote deletion
  and concurrent ID collision remain explicit conflicts.
- Preserve lost-ack confirmation for successful creates and keep the composer
  draft on blocked saves.
- Pass the clean PocketRisu v1.8.1 suite with 1,197 tests passed and 3
  intentionally skipped parser specifications, Svelte diagnostics, BG bundle
  load check, production build, exact apply/revert round trip, and iPhone L3.

## 0.1.3

- Add custom folder images to the Persona organizer using PocketRisu's existing
  content-addressed asset storage.
- Let an opened folder choose, replace, or reset its image through a closable
  dialog while retaining the existing folder icon as the default.
- Render custom folder images on folder cards and grouped deletion previews
  without deleting shared asset data when a folder image is reset or removed.

## 0.1.2

- Replace the Persona page's non-closable create/import selector with a local
  dialog that has both an `X` and an explicit `Close` action.
- Add root and folder-scoped bulk deletion modes with reversible selection,
  `Cancel`/`Done` controls, and locked folder navigation while selecting.
- Preview every selected persona with image, name, and alias before deletion;
  selected folders are shown separately with all contained personas.
- Apply deletion only after the final Yes action and refuse any selection that
  would leave PocketRisu without a persona.

## 0.1.1

- Move the persona organizer to the actual Settings → Persona editor while
  leaving the chat persona-selection popup unchanged.
- Replace persona drag-and-drop with paginated 4×4 cards, explicit folder
  creation and membership selection, and one-slot `Arrange` controls.
- Add the independent prompt preset integrity pack and keep startup, lazy-chat,
  and bg-preserve composition current through per-pack ETags.
- Pass PocketRisu v1.8.1 clean-copy and production validation, including the
  live iPhone persona and prompt workflows.

## 0.1.1-experimental.3

- Remove persona drag-and-drop and every touch/scroll interception path.
- Make `Arrange` expose explicit left/right controls that move a persona one
  slot within its current area or move a folder one slot among folders.
- Keep `Arrange` active when opening a folder so its personas receive the same
  one-slot controls.
- Add a folder `+` action that opens a paginated 4×4 persona grid; tapping a
  thumbnail selects or deselects that persona's folder membership.

## 0.1.1-experimental.2

- Replace iPhone's mid-gesture long-press scroll cancellation with an explicit
  `Arrange` mode that locks the real `.rs-setting-cont-4` settings scroller
  before the next touch begins, then restores its exact scroll state on
  `Done`.
- Add the independent `preset-integrity` pack. It preserves every prompt
  preset while clamping an invalid persisted active index at load/save/change
  boundaries and guarding the Prompt → Basic Info name binding.
- Add the new pack to both default profiles with its own manifest ETag and
  embedded PocketRisu invariant tests.

## 0.1.1-experimental.1

- Move the persona organizer from the chat persona-selection popup to the
  actual Settings → Persona editor identified by its name, note, and
  description fields.
- Restore the selection popup to PocketRisu's original implementation during
  patch recomposition.
- Keep the settings page's existing `+` create/import menu and editor actions,
  while adding a separate visible `New folder` control and 80×80 folder cards.
- Paginate the root organizer and every folder as animated 4×4, sixteen-card
  pages with arrows, dots, and held-edge drag navigation.
- Lock iOS page scrolling only after long-press drag activation, preview
  reordering with animated card reflow, and persist the order only on drop.

## 0.1.0

- Promote the composable NodeOnly patcher to stable after PocketRisu v1.8.1
  clean-copy and production validation.
- Ship the unified and features-only profiles with startup database caching,
  lazy chat synchronization, persona folders/reordering, and optional
  bg-preserve v1.0.0 composition.
- Preserve chat and patch state through CAS, WAL, exact collision ordering,
  stale-plan refusal, transactional rollback, and POSIX mode round trips.
- Pass the live 89-file PocketRisu suite (1,179 tests, 3 skipped), Svelte
  diagnostics, BG bundle load check, production build, restart health checks,
  and iPhone functional validation.

## 0.1.0-experimental.7

- Serialize each target root with an exclusive owner lock and reject a stale
  plan before creating a transaction journal or touching any managed file.
- Preserve existing POSIX modes through apply, failure recovery, and revert;
  new owned files default to `0644` and private patch state to `0600`.
- Bound only new-chat `awaitingMetadata` WAL quarantine by record and byte
  capacity. Existing recoverable payloads are never evicted; the server logs
  retained backlog and rejects an unsafe new ACK once capacity is reached.
- Clean up persona touch drag state on component unmount and make the tested
  260 ms long-press contract explicit.
- Mark fixed-profile pack availability in `list` and add a CI gate for
  reproducible installers, PocketRisu v1.8.1 apply/check/build/revert, and
  byte-plus-mode round trips.

## 0.1.0-experimental.6

- Validate stripped-database transitions instead of rejecting every save when
  an accepted legacy database already contains a metadata-only chat shell.
- Grandfather only the same character/chat identities; newly introduced
  missing payloads, malformed stubs, and cross-character moves remain blocked.
- Return an explicit missing-payload response for legacy shells and keep the
  composer draft when the user attempts to send from one.

## 0.1.0-experimental.5

- Add lazy chat hydration, incremental CAS chat saves, durable chat WAL,
  three-way database conflict reconciliation, and a BG durable-save adapter.
- Combine decoded startup caching with the lazy database shape and race the
  two iOS browser-cache metadata probes independently.

## 0.1.0-experimental.4

- Replace drag-to-create folders with an explicit `New folder` action.
- Render persona thumbnails and folder cards with matching 80×80 images;
  clicking a folder opens its contents as a distinct drop zone.
- Move personas into an opened folder or folder card, back to the unfiled
  area, or before another persona without overlapping drop actions.
- Record startup-cache outcome and probe/request/hydration timings in
  PocketRisu System Logs.
- Reopen cache validation after isolated cold/warm measurement confirmed a
  database 200→304 path but found substantial non-cache startup work.

## 0.1.0-experimental.3

- Separate persona drop targets visually and behaviorally: a highlighted row
  creates or joins a folder, while a highlighted gap only reorders.
- Execute the last displayed iPhone drop target instead of resolving the
  finger position again at touchend, preventing an adjacent reorder gap from
  replacing a visible folder action.

## 0.1.0-experimental.2

- Keep persona HTML drag desktop-only so PocketRisu's iOS drag polyfill cannot
  preempt the popup's 260 ms long-press reorder controller.

## 0.1.0-experimental.1

- Add one composable patch engine with `features` and `all` artifacts.
- Import bg-preserve v1.0.0 as 116 exact hooks and 55 owned files.
- Add authenticated ETag-validated PocketRisu startup database caching adapted
  from PocketRisu PR #49.
- Add persona folders, desktop/touch drag-to-move, and drag-to-reorder.
- Add SHA-256 pack ETags, collision-only ordering, partial file recomposition,
  transactional writes, interrupted-write recovery, drift refusal, and exact
  apply/revert round-trip tests.
