# Root-only save character-diff plan

Status: **deferred candidate**, not scheduled. If admitted, it is delivered on
the `0.2.4-experimental.N` line. Nothing here is implemented.

## Problem

A strict Personal appearance save changes only the database root. Since
`0.2.3-experimental.8`, it skips the unused encoder work. The largest client
cost left is `RisuSavePatcher.set()`: on every save it walks every character,
serializes each one with `JSON.stringify(withStubs(character))`, and compares
the result with the last synced JSON. Only characters that differ go on to
normalization, hashing, and diffing.

Evidence (exact PocketRisu `v1.10.0` with the complete patch graph):

- **Character walk.** `src/ts/storage/risuSave.ts`, the per-character loop in
  `RisuSavePatcher.set()` near lines 1170–1181. The `JSON.stringify` compare
  runs for every character regardless of `toSave`.
- **Other blocks.** Presets and modules are processed only when `toSave`
  flags them, near line 1063.
- **Cost.** Host CPU median over 7 runs, on a real 22-character, 17.5 MB
  snapshot read read-only: `patcher.set` 69.2 ms. `encoder.set` (44.4 ms) and
  `encode` (5.9 ms) were already removed for strict saves. Harness and result:
  `docs/validation/appearance-save-feedback-2026-09-25/`.
- **Earlier plan omission.** The editor plan's persistence analysis (section
  11.1) describes only the per-key root comparison. It omits this per-save
  character walk.

The host number does not show how much of an iPhone save it represents.
Network round trips, server patch application, and the strict flush may
dominate.

## Constraints

- **Ownership.** `src/ts/storage/risuSave.ts` is fully replaced by the
  lazy-chat-sync pack (`lazy-chat-sync:replace:src:ts:storage:risuSave-ts:1.10`).
  Any change is either an ordered unit placed after that replacement, like the
  Personal settings units after the `globalApi` owners, or a decision made
  under lazy-chat-sync authority. It must not silently fork that file.
- **Server hash.** `server/node/server.cjs` (near lines 4401–4403) computes
  `calculateHash` of its current cached database *before* applying a patch.
  It rejects the patch unless that hash equals the client's `expectedHash`.
  The client derives `expectedHash` from `hashBlocks` of its last synced
  baseline, so any skipped work must leave that baseline and its hashes
  unchanged.
- **Call site.** `patcher.set(db, toSave)` is called from
  `persistTrackedChanges` in `globalApi.svelte.ts` (near line 1160). It
  currently receives no save options, so the save intent would have to be
  passed explicitly.

## Stages

### S0 — Measure on the device first

This stage decides whether the work is worth doing.

1. Add an opt-in timing trace for strict appearance saves only, enabled by a
   local flag and off by default. It records:
   - `patcher.set` duration, split into the character walk and the rest;
   - the patch request round trip;
   - the strict flush; and
   - total time from mutation to acknowledgement.
2. Surface the numbers where an iPhone user can read them without a console.
   For example, the completion toast can append a one-line summary while the
   flag is set.
3. Collect several saves on the user's real database on iPhone. Re-run the
   host harness for comparison.

**Decision point.** Present the measured share of the character walk against
total save time. Continue to S1 only if the user judges the saving worthwhile.
If not, record the numbers and close the candidate.

### S1 — Narrow design (recommended)

Skip the character walk only when all of these hold:

- the save is a strict appearance save, carried as an explicit intent from
  `persistTrackedChanges`;
- `toSave.character` and `toSave.chat` are empty; and
- no structural character change is tracked.

When skipped, the walk leaves the characters, their `hashBlocks`, and their
JSON baselines exactly as they were. The root per-key diff runs as usual.

Why this is safe, to be proven by tests:

- **Hash.** `expectedHash` is computed from an unchanged baseline, so it still
  equals the server's pre-patch hash.
- **Server state.** The server applies only root operations, so its new state
  equals the client baseline plus those operations.
- **Deferred changes.** An untracked character change made meanwhile still
  differs from the untouched baseline JSON. Every later ordinary save walks all
  characters and sends it. Ordinary autosaves keep the full walk, so the
  deferral is bounded by the next ordinary save.

### Rejected or deferred alternatives

- **Skip the walk for every root-only save.** Root-only ordinary autosaves are
  frequent, for example while typing into settings. Untracked character
  mutations, such as those made by plugins, could then be deferred for an
  unbounded time. Not recommended.
- **Per-character dirty tracking.** This would replace the stringify compare
  with tracked flags. It changes tracking semantics across all savers, which
  is a larger lazy-chat-sync design change. Out of scope.

### S2 — Tests

- A root-only strict save produces only root operations, and its
  `expectedHash` equals the pre-save `hash()`.
- A following ordinary save with an untracked character edit emits that
  character's operations, and the server-side hash, computed as the server
  does, matches at each step.
- An untracked structural character change (add or remove) is deferred by the
  strict save and delivered by the next ordinary save.
- Ordinary, preset, module, and character saves produce patches identical to
  the current implementation on the existing and new fixtures.
- The existing `risuSavePatcher.test.ts` suite, the Personal owner graphs,
  and the complete graph (lazy, BG, and client-build-fence compositions) all
  pass.

### S3 — Delivery

- Runtime audit (L2.5) of the save call path, the patch transport, and the
  server hash check.
- The ordinary process-first live delivery: active work 0, stop, apply,
  build, prune, restart, and readback.
- iPhone L3:
  - with the timing flag on, confirm that the character-walk share dropped
    for CSS and font saves;
  - edit a character and confirm that it still saves; and
  - reload and confirm that both changes persist.

## Rollback

The change is a single ordered unit. Reverting the candidate restores the
full character walk without data migration. No stored format changes.

## Trigger to reopen

Reopen this plan when either of these happens:

- appearance or settings saves feel slow again on iPhone; or
- device timing shows the character walk as a dominant share of save time.

The same item is tracked in the maintainer's backlog.
