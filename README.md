# PocketRisu Personal Patches

Private, composable patch delivery for PocketRisu NodeOnly. The current
stable release is `v0.1.4`, and its manifests target PocketRisu `v1.8.1`.

## Profiles

- `pocketrisu-features.cjs` manages `lazy-chat-sync` (including startup cache),
  `persona-organizer`, and `preset-integrity`.
  An existing bg-preserve installation remains an external layer.
- `pocketrisu-all.cjs` adds bg-preserve `v1.0.0` and the
  `lazy-chat-bg-adapter` durable-save barrier as one composition.

Both artifacts are generated from the same engine and manifests. They are not
separate implementations.

## Release history

| Release | What changed |
| --- | --- |
| `v0.1.0` | Promoted the composable patcher to stable with unified/features profiles, transactional apply/revert, pack ETags, stale-plan refusal, exact collision ordering, POSIX mode preservation, startup database caching, lazy chat synchronization, persona organization, preset safety, and optional bg-preserve composition. |
| `v0.1.1` | Moved Persona organization to Settings → Persona, replaced touch drag with paginated 4×4 membership and explicit one-slot Arrange controls, and added the independent prompt preset integrity pack. |
| `v0.1.2` | Added closable create/import UI and root/folder-scoped bulk persona deletion with reversible selection, grouped previews, a final confirmation gate, and protection for the last remaining persona. |
| `v0.1.3` | Added content-addressed custom folder images with replace/reset and deletion-preview support, then made the full CI gate compatible with its Node.js 22 runner. |
| `v0.1.4` | Fixed new-chat save failures by making stable chat IDs authoritative and classifying create versus update from the last server-confirmed database without weakening remote-deletion or concurrent-create safety. |

The current `v0.1.4` release has been validated against PocketRisu `v1.8.1`
with:

- 8/8 patcher tests and reproducible installer generation;
- a clean unified apply, embedded PocketRisu checks, production build, and
  exact byte-plus-mode revert in GitHub Actions;
- 1,197 PocketRisu tests passed, with three pre-existing parser specifications
  intentionally skipped;
- Svelte diagnostics at 0 errors and 0 warnings;
- BG orchestration bundle build/load and production health checks;
- iPhone validation of new and existing chat saves, reload persistence, and
  background-return behavior.

See [CHANGELOG.md](CHANGELOG.md) for experimental checkpoints and the complete
per-release change list. The `v0.1.4` incident analysis and safety boundaries
are in
[docs/NEW-CHAT-SAVE-REGRESSION-2026-07-26.md](docs/NEW-CHAT-SAVE-REGRESSION-2026-07-26.md).

## Feature packs

### Lazy chat synchronization and startup cache

This caches PocketRisu's startup database, not an LLM response or Gemini
context. The storage protocol is adapted from
[PocketRisu PR #49](https://github.com/PocketRisu/PocketRisu/pull/49):

- chat bodies remain outside the startup database payload and hydrate only
  when selected or requested by a plugin;
- chat writes use exact transport revisions, CAS preconditions, bounded JSON
  Patch deltas, and response-loss confirmation instead of unconditional full
  overwrites;
- stable chat IDs, rather than mutable array indices, are authoritative for
  reads whenever the client supplies an ID;
- the last server-confirmed database distinguishes creates from updates, so
  only a confirmed missing new ID may use create-only persistence while a
  remotely removed existing chat remains a conflict;
- a server write-ahead journal preserves acknowledged chat writes until their
  database metadata is durable;
- database conflicts use three-way reconciliation with explicit
  deletion-versus-edit handling;
- legacy metadata-only chat shells already present in an accepted database are
  grandfathered by stable character/chat identity, while new missing payloads
  remain blocked;
- selecting a legacy shell reports that its payload is unavailable, and a send
  attempt keeps the composer draft instead of clearing it;
- the authenticated `/api/read` response is revalidated with its database
  ETag before a browser cache is trusted;
- unchanged startup data can use a decoded IndexedDB baseline, avoiding the
  database transfer and decode;
- normal JSON-patch saves advance a bounded local patch journal;
- missing, corrupt, timed-out, or mismatched cache data falls back to an
  unconditional authoritative server read;
- the server keeps the encoded stubs-only payload paired with the exact ETag,
  so a warm `304` does not decode and re-encode the database.
- each startup records `decoded-hit`, `raw-hit`, network miss, or recovery
  fallback with probe/request/hydration timings in PocketRisu's System Logs.
- IndexedDB and CacheStorage metadata probes race independently, so one stalled
  iOS storage backend cannot delay a valid result from the other for the full
  1500 ms timeout.

An isolated production measurement with writes and writer-session changes
blocked confirmed a database `200` on the first load and `304` on the warm
reload. Two unprofiled runs reduced the loading screen from roughly
2.8–3.0 seconds to 1.7 seconds. The remaining time was outside the database
transfer/decode cache, mainly application initialization and state setup.
Applying or reverting this pack does not delete the
PocketRisu database, chats, assets, or backups.

The all profile keeps two revision domains deliberately separate:

- lazy-chat transport revisions hash the exact encoded chat for storage CAS;
- bg-preserve revisions detect semantic user edits for result merging.

BG result delivery waits for both the chat journal ACK and `/api/db/flush`
before acknowledging and deleting a parked orchestration result.

### Persona organizer

The thumbnail strip at the top of Settings → Persona gains:

- an explicit `New folder` action and single-level folder cards;
- persona thumbnails and folder images with the same 80×80 dimensions;
- click-to-open folder contents;
- an `Arrange` action that gives personas and folders explicit left/right
  one-slot movement controls;
- folder content arrangement by opening a folder while `Arrange` is active;
- custom folder images that can be selected, replaced, or reset from inside
  the folder;
- a folder `+` action with a paginated 4×4 all-persona selector for adding or
  removing folder members;
- a closable create/import dialog for the root `+` action;
- root and folder-scoped `Delete` selection modes with `Cancel`/`Done`,
  grouped image/name/alias previews, and a final Yes/No gate;
- folder selection that deletes the selected folder and its contained
  personas together, while always keeping at least one persona;
- folder rename, reorder, and removal (folder removal keeps every persona);
- normal page scrolling at all times, with no persona drag or touch-scroll
  interception.

`Database.personas` remains the canonical persona order, so existing
index-based callers keep working. Selection is restored by stable persona ID
after a reorder. The chat persona-selection popup is left as PocketRisu's
original UI, and the existing name, note, description, image, import/export,
and `+` create/import controls on the settings page remain available.

### Prompt preset integrity

The independent `preset-integrity` pack keeps the persisted active preset
index inside the current preset array:

- a one-past-end or otherwise invalid saved index is clamped to a surviving
  preset without deleting or rewriting the preset entries;
- an empty legacy array receives one valid fallback preset;
- database load, preset save/change, and the Prompt → Basic Info name binding
  each enforce or tolerate the invariant.

This pack is separate from persona organization so its ETag, apply, and revert
scope remain independent.

## Build and use

```bash
npm test
npm run build
```

Preview a unified install without writing:

```bash
node dist/pocketrisu-all.cjs plan --root /path/to/PocketRisu --json
```

Apply, inspect, or revert:

```bash
node dist/pocketrisu-all.cjs apply --root /path/to/PocketRisu
node dist/pocketrisu-all.cjs status --root /path/to/PocketRisu
node dist/pocketrisu-all.cjs revert --root /path/to/PocketRisu
```

Use `pocketrisu-features.cjs` for the profile that excludes bg-preserve.
After applying source changes, run PocketRisu's normal checks and production
build. The unified profile also changes code included by the bg orchestration
bundle, so rebuild it when that builder exists:

```bash
pnpm check
pnpm build
test ! -f server/node/bgOrchBundle.build.cjs || node server/node/bgOrchBundle.build.cjs
```

Restarting a running PocketRisu process is deliberately outside the patcher.

## Composition and collision rules

There is no global feature order. Units in different files are independent.
For unordered units in the same file, the engine dry-runs both orders against
the reconstructed baseline:

- same result: commutative, so no ordering edge is stored;
- only one valid result: that order is inferred;
- two different valid results: the manifest must declare the intended order;
- neither valid, or an ordering cycle: the plan is refused before any write.

When a newly selected pack collides with one existing unit, the engine removes
the currently managed blocks in memory, recomposes the desired graph, and
writes the final result once. Files whose final bytes did not change are
skipped. This permits a `B2 → A3` relationship without requiring `A1` or `A2`
to be removed or assigned an unrelated order.

Cross-file semantic requirements cannot be inferred from text transforms.
Those belong in explicit manifest `requires`/`before`/`after` contracts and
tests.

## State, ETags, and recovery

Runtime HTTP caching uses the database ETag. Patch management uses SHA-256
pack ETags and exact output hashes:

- unchanged pack ETags and current output hashes are skipped;
- one exclusive lock serializes recovery, planning, and writes for each target
  root; a stale plan or overlapping patcher exits before creating a journal;
- exact old unit snapshots are retained, so an updated pack can revert its
  previous representation before recomposition;
- existing POSIX file modes are preserved through apply, rollback, and revert;
  new owned files default to `0644` unless a unit declares another mode, while
  patch state and transaction metadata use `0600`;
- `save/pocketrisu-patches/state.json` records the active profile and graph;
- writes are journaled in
  `save/pocketrisu-patches/transaction.json`;
- a failed or interrupted transaction restores every touched file before the
  next operation.

New-chat payloads acknowledged before their first database stub remain in a
durable `awaitingMetadata` WAL quarantine. Only that orphan-prone subset has a
128-record/256 MiB pressure limit: existing payloads are never evicted, the
backlog is logged after restart, and a save that would exceed the limit is
rejected before ACK. Existing-chat WAL records are outside this pressure limit.

The `features` artifact refuses to take ownership of an `all` state, because
doing so could silently remove bg-preserve. The `all` artifact may safely
adopt a prior `features` state.

## Upstream updates

Run `plan` against the newly updated PocketRisu tree before building or
restarting. Missing anchors, drifted managed blocks, unknown owned-file
content, ambiguous order, and cycles stop the plan. A manifest should be
updated only after inspecting the new upstream code and rerunning the clean
apply/revert round trip.

## Attribution

PocketRisu and the storage synchronization code adapted from PR #49 are GPL-3.0
licensed. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and
[LICENSE](LICENSE).
