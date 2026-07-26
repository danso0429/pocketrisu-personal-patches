# Changelog

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
