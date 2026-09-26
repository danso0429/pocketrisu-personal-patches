# Root-only save character-diff plan

Status: **closed at D0 (2026-09-27)**. The device measurement showed the
character walk at about 7 ms of a 514.5 ms median strict save (1.4%), so S1
was not built. The measurement trace shipped in `0.2.4-experimental.2` and
`.3` and was removed in `0.2.4-experimental.4`. See "D0 result" below.

## Problem

A strict Personal appearance save changes only the database root. Since
`0.2.3-experimental.8`, it skips the unused encoder work. What remains on the
client is not yet broken down. Two costs are known to run on every strict
save:

- **`RisuSavePatcher.set()` character walk.** On every save the patcher walks
  every character, serializes each one with
  `JSON.stringify(withStubs(character))`, and compares the result with the
  last synced JSON. Only characters that differ go on to normalization,
  hashing, and diffing.
- **Baseline clone.** Before mutating, the strict appearance writer copies the
  patcher's entire synced baseline with
  `safeStructuredClone(patcher.lastSyncedDb)` so a failed save can re-seed the
  patcher. The earlier benchmark did not measure this copy.

Evidence (exact PocketRisu `v1.10.0` with the complete patch graph; line
numbers refer to the composed live source):

- **Character walk.** `src/ts/storage/risuSave.ts` near lines 1170–1181. The
  `JSON.stringify` compare runs for every character regardless of `toSave`.
- **Other blocks.** Presets and modules are processed only when `toSave`
  flags them (near lines 1063 and 1071). The root is compared per key.
- **Baseline clone.** `src/ts/globalApi.svelte.ts` near line 1606, inside the
  `personal-settings:editor-save-registration` unit.
- **Cost measured so far.** Host CPU median over 7 runs, on a real
  22-character, 17.5 MB snapshot read read-only: `patcher.set` 69.2 ms as a
  whole. `encoder.set` (44.4 ms) and `encode` (5.9 ms) were already removed
  for strict saves. Harness and result:
  `docs/validation/appearance-save-feedback-2026-09-25/`.
- **Earlier plan omission.** The editor plan's persistence analysis (section
  11.1) describes only the per-key root comparison. It omits this per-save
  character walk.

The host number does not show how much of an iPhone save it represents.
Network round trips, server patch application, the strict flush, and the
baseline clone may dominate.

## Constraints

- **Ownership.** `src/ts/storage/risuSave.ts` is fully replaced by the
  lazy-chat-sync pack (`lazy-chat-sync:replace:src:ts:storage:risuSave-ts:1.10`).
  Changes are Personal settings units ordered after that replacement, like the
  existing Personal units after the `globalApi` owners. The lazy-chat-sync
  file is not forked and its version does not change.
- **Server hash.** `server/node/server.cjs` (near lines 4401–4403) computes
  `calculateHash` of its current cached database *before* applying a patch.
  It rejects the patch unless that hash equals the client's `expectedHash`.
  The client computes `expectedHash` with `hash()` at the start of `set()`
  (near line 981), from the `hashBlocks` of its last synced baseline. The
  invariant that matters is therefore the post-save one: after the server
  applies the patch, its recomputed hash must equal the client's `hash()`,
  which becomes the next save's `expectedHash`.
- **Call site.** `patcher.set(db, toSave)` is called from
  `persistTrackedChanges` in `globalApi.svelte.ts` (near line 1160). The
  strict intent is already available there: the Personal unit
  `editor-defer-full-buffer` computes `personalPatchOnly` (near line 1140)
  before the call. Passing it needs one added argument.

## Stages

### S0 — Measure first

This stage decides whether the work is worth doing.

**S0a — Host breakdown (no live change).** Extend the host harness to time,
on the same read-only snapshot, the median of 7 runs of:

- the character walk inside `patcher.set`;
- the rest of `patcher.set` (root per-key loop and bookkeeping);
- `safeStructuredClone(patcher.lastSyncedDb)`; and
- `safeStructuredClone(toSave)`.

**S0a result (2026-09-26).** Composed complete graph (42 packs, 991 units,
370 paths; `risuSave.ts` and `globalApi.svelte.ts` byte-identical to the live
source), the live database read read-only: 26 characters, 409 root keys,
17,160,156 encoded bytes. Chats go through the real `chatToStub` from
placeholder chats, as in the client. Median of 7 runs, three runs:

| Step | Run 1 | Run 2 | Run 3 |
| --- | --- | --- | --- |
| Baseline clone (`structuredClone(lastSyncedDb)`) | 28.8 ms | 24.3 ms | 29.7 ms |
| Character walk (replicated) | 8.0 ms | 7.9 ms | 7.8 ms |
| Root per-key walk (replicated) | 34.2 ms | 32.9 ms | 33.7 ms |
| `patcher.set` total | 44.4 ms | 42.5 ms | 43.2 ms |
| `patcher.set` minus both walks | 2.2 ms | 1.7 ms | 1.7 ms |
| `toSave` clone | 0 ms | 0 ms | 0 ms |

The serialized root is 6,178,154 JSON characters, of which `plugins` is
4,854,053; the characters with chat stubs are 1,934,429. On the host, the
character walk that S1 would skip is about 8 ms of about 72 ms of client work
(baseline clone plus `patcher.set`). The root per-key walk, dominated by
`plugins`, and the baseline clone are larger. The replicated loops copy the
statements in `set()`; the per-loop split is not an instrumented measurement
of `set()` itself. Files: `docs/validation/root-only-save-2026-09-26/`.

**S0b — Device trace.** Ship an opt-in timing trace for strict appearance
saves only:

- A switch in Personal settings, off by default and stored on the device
  only, enables it.
- While it is on, the save completion toast appends a one-line summary. The
  line also proves that the traced bundle is the one loaded.
- Recorded spans: wait for a previous save, baseline clone, character walk,
  root per-key walk, write (`persistTrackedChanges`), patch request (until
  response headers), strict flush, and total time from the start of the save
  to acknowledgement. A traced result toast stays until the next notice or
  until the settings page closes.
- Collection (`0.2.4-experimental.3`): when the result notice is raised, the
  same spans are sent through the official client log (`addLog` →
  `/api/logs` → `logs.db`) as an `info` entry with source
  `personal-save-trace` and a JSON description (scope, outcome, spans in
  0.1 ms). The user does not transcribe toasts; the maintainer reads the
  entries read-only. No server code changes.
- Units: ordered Personal units on `risuSave.ts` (after the lazy-chat-sync
  replacement) for the two walks and on `nodeStorage.ts` (after the existing
  storage owners) for the request; the traced statements are identical in the
  official files, so every graph is traced. The writer, toast, and switch are
  edited in the Personal units that already own them.

**S0b validation (2026-09-26).** Patcher suite 332/332. Personal owner graphs
(standalone, lazy, BG-lazy, complete) 105/105 each, with zero-change reapply,
compatibility UI rollback, reader preservation, and exact byte/mode revert.
The complete graph has 42 packs, 1,001 units, 372 paths; its collision
records are identical to `main`. On the composed complete candidate: client
suite 162 files and 1,844 tests, Svelte 0 errors and 0 warnings, production
build 7,995 modules.

**Decision point D0.** Collect several CSS and font saves on the user's real
database on iPhone. Present each span's share of the total next to the host
numbers. Continue to S1 only if the user judges the saving worthwhile. If the
baseline clone dominates instead, stop and revise this plan before building
anything. If neither is worth it, record the numbers, remove the trace, and
close the candidate.

**D0 result (2026-09-27).** 30 traced saves (22 CSS, 8 font, all saved) from
one iPhone (Mobile Safari, iOS) on the live database, collected from
`logs.db` read-only. Safari reports `performance.now()` in whole
milliseconds. Medians:

| Span | iPhone median | Share | Host (S0a) |
| --- | --- | --- | --- |
| Total (start to acknowledgement) | 514.5 ms (459–1,111) | 100% | — |
| Wait for a previous save | 0 ms | 0% | — |
| Baseline clone | 31.5 ms | 6% | 24–30 ms |
| Character walk (S1 target) | 7 ms | 1.4% | 7.8–8.0 ms |
| Root per-key walk | 20 ms | 4% | 32.9–34.2 ms |
| Rest of the write on the client | 11 ms | 2% | — |
| Patch request (to response headers) | 194 ms | 38% | — |
| Flush | 221.5 ms | 43% | — |
| Rest of the save on the client | 17 ms | 3% | — |

CSS and font saves have the same profile (medians 514.5 ms and 504.5 ms). The
one 1,111 ms save was the first, with a 705 ms flush; without it the maximum
is 656 ms. Client computation totals about 90 ms (18%). The patch request and
the flush total about 415 ms (81%); how that splits between the network round
trip and server processing was not measured. Decision: the user closed the
candidate and asked for the trace to be removed. Per-save records (scope,
outcome, spans only): `docs/validation/root-only-save-2026-09-26/d0-iphone-traces.jsonl`.

### S1 — Narrow design (not built)

`RisuSavePatcher.set()` gains an optional third argument carrying the strict
intent. Skip the character walk only when all of these hold:

- the save is a strict appearance save (`personalPatchOnly`);
- `toSave.character` and `toSave.chat` are empty; and
- `structuralChange` is false. The id comparison that decides it is already
  computed before the walk, so an added, removed, or reordered character
  always takes the ordinary full path.

When skipped, the walk leaves the characters, their `hashBlocks`, and their
JSON baselines exactly as they were. The root per-key diff runs as usual.

Why this is safe, to be proven by tests:

- **Hash.** The skipped walk changes no character hash, so the client's
  post-save `hash()` equals the server's hash after it applies the root
  operations.
- **Server state.** The server applies only root operations, so its new state
  equals the client baseline plus those operations.
- **Deferred changes.** An untracked in-place character change made meanwhile
  still differs from the untouched baseline JSON. Every later ordinary save
  walks all characters and sends it. Ordinary autosaves keep the full walk, so
  the deferral is bounded by the next ordinary save.

### Rejected or deferred alternatives

- **Skip the walk for every root-only save.** Root-only ordinary autosaves are
  frequent, for example while typing into settings. Untracked character
  mutations, such as those made by plugins, could then be deferred for an
  unbounded time. Not recommended.
- **Defer structural character changes on strict saves.** Possible, but the
  structural check costs only an id comparison, and deferring additions or
  removals adds a case to prove without a measured benefit. Rejected.
- **Per-character dirty tracking.** This would replace the stringify compare
  with tracked flags. It changes tracking semantics across all savers, which
  is a larger lazy-chat-sync design change. Out of scope.

### S2 — Tests

- A root-only strict save produces only root operations. After applying them
  to a server-side copy, `calculateHash` of that copy equals the client's
  post-save `hash()`.
- A following ordinary save with an untracked in-place character edit emits
  that character's operations, and the server-side hash matches at each
  step.
- A strict save with an added or removed character takes the full path and
  produces the same patch as the current implementation.
- Ordinary, preset, module, and character saves produce patches identical to
  the current implementation.
- The existing `risuSavePatcher.test.ts` suite, the Personal owner graphs,
  and the complete graph (lazy, BG, and client-build-fence compositions) all
  pass.

### S3 — Delivery

- Runtime audit (L2.5) of the save call path, the patch transport, and the
  server hash check.
- The ordinary process-first live delivery: active work 0, stop, apply,
  build, prune, restart, and readback.
- iPhone L3:
  - with the timing switch on, confirm that the character-walk span dropped
    for CSS and font saves;
  - edit a character and confirm that it still saves;
  - reload and confirm that both changes persist; and
  - repeat with a character edit immediately after a CSS save.
- After L3, record the numbers and remove the trace units and the switch.

## Rollback

Each stage is a separate set of ordered units. Reverting the candidate
restores the full character walk without data migration. No stored format
changes; the trace switch lives only in device storage.

## Trigger to reopen

Reopen this plan only if device timing shows the character walk as a dominant
share of save time, for example after the character count grows by an order
of magnitude. If strict saves feel slow again, the measured dominant cost is
the patch request and the flush, which this plan does not address.

The same item is tracked in the maintainer's backlog.
