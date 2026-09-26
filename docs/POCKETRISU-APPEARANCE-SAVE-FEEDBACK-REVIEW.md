# Appearance save and feedback review

`0.2.3-experimental.8` completes a paused candidate for faster Personal
appearance saves and top-toast save feedback. The candidate was reviewed item
by item, each decision was checked against measurements or source, and the
result was rebuilt on the current `main` (theme-independent Personal CSS).

## Origin

The candidate existed only as uncommitted changes on
`codex/pocketrisu-css-toggle-editor` at `c25954e`, dated 2026-09-24. Its own
changelog draft listed three goals:

1. skip whole-file buffer assembly for strict patch saves;
2. preload the patch dependency when appearance settings opens; and
3. move save, completion, and error feedback into the top toaster.

Its installers had been generated, but the owner-graph verification, commits,
validation record, and live delivery had not been done. It was never live.

The original working tree is kept unchanged. The code was carried over with a
three-way apply.

## Decisions

| Item | Decision | Evidence |
| --- | --- | --- |
| 1. Defer encoder work for strict patch saves | Kept as written | Measured benefit; safety argument checked in source |
| 2. Preload `fast-json-patch` | Dropped | No load remains for it to hide |
| 3. Top-toast feedback | Kept the goal; reimplemented the mechanism | The draft mechanism loses progress toasts in the real toaster |

### 1. Strict save encoder deferral

For a strict appearance save that uses patch sync, the database is sent as a
JSON patch. The full `database.bin` buffer is used only by the full-write
fallback, which strict saves already refuse. The candidate therefore skips the
following when only the root block is dirty:

- `encoder.set()`, which stringifies every character to detect changes and
  rebuilds the root; and
- `encoder.encode()`, which assembles the whole file.

A new guard throws before any full write would need the missing buffer.

The safety argument was checked in source:

- The encoder is private to the save module and is re-initialized from the
  full database.
- `set()` detects untracked character changes by comparing against its own
  last JSON.
- Root and stale blocks are rebuilt on the next ordinary save.
- Tracked character, chat, preset, module, and plugin flags still run
  `set()` before their dirty flags are consumed.

The plugin-array safety test gains one exception for the boolean
`toSave.plugins` dirty-flag read. It remains blocked for any other `plugins`
use.

Measured on a real 22-character, 17.5 MB snapshot, read read-only, as the
median of 7 runs on the host CPU (`strict-save-bench.test.ts`,
`strict-save-bench.json`):

| Step | Time |
| --- | --- |
| `encoder.set` | 44.4 ms (removed for root-only strict saves) |
| `encode` | 5.9 ms (removed) |
| `patcher.set` | 69.2 ms (kept) |

Not changed: `patcher.set` is the largest remaining client cost because it
still stringifies every character. Narrowing it for root-only saves would
change the upstream patch-protocol module, so it is recorded here as a measured
opportunity rather than admitted into this candidate. The follow-up plan is
[`POCKETRISU-ROOT-ONLY-SAVE-DIFF-PLAN.md`](POCKETRISU-ROOT-ONLY-SAVE-DIFF-PLAN.md).

### 2. Dependency preload (dropped)

- The `fast-json-patch` implementation chunk is statically imported by the
  database chunk and is `modulepreload`ed by `index.html`.
- The dynamic `import('fast-json-patch')` used by the patcher resolves to a
  71-byte re-export chunk, loaded once by the first save of the session.
- A preload would therefore save at most one tiny module request, and only
  when the session's first save is an appearance save. The added code has no
  measurable benefit.

### 3. Toast feedback (reimplemented)

The draft updated a `toast.loading(..., { id, duration: Infinity })` in place
for each save stage.

In `svelte-sonner` 1.1.0, `Toast.svelte` restarts its close timer on every
update, including infinite durations. `setTimeout(fn, Infinity)` fired after
1 ms in Chromium. The same failure was earlier observed on iPhone for character
import progress.

With the real `Toaster` (`sonner-live.test.ts`, `sonner-live.json`):

| Step | Draft (same-ID updates) | Adopted |
| --- | --- | --- |
| First progress toast | Visible at 100, 400, and 1500 ms | Visible at 100, 400, and 1500 ms |
| Progress update | **Gone at 100 ms** | Visible at 100, 400, and 1500 ms |
| Persistent ambiguous error | Visible, only because the earlier toast was already gone | Visible at 100, 400, and 1500 ms |

The adopted `appearanceNotices.ts` follows the proven character-import
pattern:

- **One toast per visible notice.** Each scope (CSS, font, font load) mounts
  one custom `AppearanceToast` with an infinite duration, then updates it
  through a store instead of calling sonner again.
- **Dismissal.** The module schedules dismissal itself: success and info after
  3.5 s, errors after 8 s. Persistent errors are never auto-dismissed.
- **Touch.** Only error toasts accept touch, so they can be swiped away.
  Progress and result toasts use `pointer-events: none` and never block
  controls.
- **Remount.** A swiped-away toast is forgotten through
  `onDismiss`/`onAutoClose` and remounted by the next notice.

The draft's other feedback work is kept:

- save-stage reporting (`appearanceSaveStage`: waiting, preparing, writing,
  flushing);
- CSS/font scopes and outcomes in the runtime status; and
- removal of transient inline status text from the CSS, font, and recovery
  panels.

## Validation

Observed results:

- Patcher suite: 343/343 passed.
- `scripts/verify-personal-css.cjs` against the pristine `v1.10.0` export
  passed all five owner graphs. The complete graph has 42 packs, 991 units,
  370 paths, and 13 collisions. Each graph passed 101 tests: the previous 93,
  the draft's 4 save-path tests, and 4 notice-controller tests. Each graph
  also passed zero-change reapply, compatibility UI rollback, reader
  preservation, and exact byte/mode revert.
- Candidate Svelte diagnostics: 0 errors, 0 warnings.
- The composed `globalApi.svelte.ts` places the missing-buffer guard inside
  the full-write branch, after the existing strict no-fallback refusal.

- The full frontend suite on an identical candidate passed 161 files and
  1,840 tests. The only failure was the local evidence harness itself, run
  without its output variable.
- Both installers are 8,153,451 bytes, mode 0755, SHA-256
  `68f233c6d961557ba4b702bc9ce44c4eb074b7403ddf7d26be2a18f0f69df520`.
  Repeated generation produced the same bytes.

## Live delivery

Before deployment, a read-only preflight observed:

- 0 active requests;
- 0 pending sends;
- no running model jobs; and
- 68 BG operation states, all `delivered`.

The server was stopped first. Apply changed 13 source files and the patch
state. Then these ran on the live source:

- frozen install;
- Personal tests: 11 files, 101 tests;
- Svelte diagnostics: 0 errors, 0 warnings;
- production build: 7,994 modules;
- BG bundle load check: `sendChat=function`;
- production prune; and
- restart.

Readback:

- PM2 online with 0 unstable restarts, and root HTTP 200.
- The served `index-BCliV-zm.js`, `index-CcL-tvwi.css`, and
  `database.svelte-DlKwrJVn.js` match the local build.
- The database chunk contains the deferred-encoder condition and the
  missing-buffer guard.
- All five SQLite databases passed `quick_check=ok`, and the database inode
  was unchanged.
- A new plan has 0 changes.
- The error log has no entries after the restart.

## Physical iPhone L3

Checked on iPhone that:

- toggling a CSS item and selecting a font show one top toast that moves
  through its stages and ends with a completion message;
- no progress toast flickers or disappears mid-save; and
- controls under a progress toast stay tappable.

The user reported on 2026-09-25 that all of these iPhone checks passed. No
separate per-step timings or screenshots were supplied.

This result covers only this change. Stable promotion of the `0.2.3` line
still needs the full 18-step device gate in the editor plan (section 15.5),
recorded by feature.
