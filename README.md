# PocketRisu Personal Patches

Private, composable patch delivery for PocketRisu NodeOnly. The current
manifests target PocketRisu `v1.8.1`.

## Profiles

- `pocketrisu-features.cjs` manages `startup-cache` and `persona-organizer`.
  An existing bg-preserve installation remains an external layer.
- `pocketrisu-all.cjs` manages bg-preserve `v1.0.0` plus both feature packs as
  one composition.

Both artifacts are generated from the same engine and manifests. They are not
separate implementations.

## Feature packs

### Startup cache

This caches PocketRisu's startup database, not an LLM response or Gemini
context. It is adapted from
[PocketRisu PR #49](https://github.com/PocketRisu/PocketRisu/pull/49):

- the authenticated `/api/read` response is revalidated with its database
  ETag before a browser cache is trusted;
- unchanged startup data can use a decoded IndexedDB baseline, avoiding the
  database transfer and decode;
- normal JSON-patch saves advance a bounded local patch journal;
- missing, corrupt, timed-out, or mismatched cache data falls back to an
  unconditional authoritative server read;
- the server keeps the encoded stubs-only payload paired with the exact ETag,
  so a warm `304` does not decode and re-encode the database.

The cache is optional. Applying or reverting this pack does not delete the
PocketRisu database, chats, assets, or backups.

### Persona organizer

The existing persona selection popup gains:

- single-level folders;
- drag-to-reorder within or between folders;
- drop-on-persona folder creation;
- folder rename, reorder, and removal (folder removal keeps every persona);
- desktop drag and iPhone long-press drag with move threshold and click
  suppression.

`Database.personas` remains the canonical persona order, so existing
index-based callers keep working. Selection is restored by stable persona ID
after a reorder.

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
- exact old unit snapshots are retained, so an updated pack can revert its
  previous representation before recomposition;
- `save/pocketrisu-patches/state.json` records the active profile and graph;
- writes are journaled in
  `save/pocketrisu-patches/transaction.json`;
- a failed or interrupted transaction restores every touched file before the
  next operation.

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

PocketRisu and the startup-cache code adapted from PR #49 are GPL-3.0
licensed. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and
[LICENSE](LICENSE).
