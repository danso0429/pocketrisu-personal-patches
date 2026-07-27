# PocketRisu Personal Patches

Private, composable patch delivery for PocketRisu NodeOnly. The current
stable release is `v0.1.5`, and its manifests target PocketRisu `v1.8.1`.
The current development checkpoint is `v0.1.6-experimental.2`.

## Profiles

- `pocketrisu-features.cjs` manages `lazy-chat-sync` (including startup cache),
  `persona-organizer`, and `preset-integrity`.
  An existing bg-preserve installation remains an external layer.
- `pocketrisu-hardening.cjs` manages `parser-hardening` and
  `toolchain-hardening`.
- `pocketrisu-all.cjs` combines the feature packs, parser and toolchain
  hardening,
  bg-preserve `v1.0.0`, and the `lazy-chat-bg-adapter` durable-save barrier.

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
| `v0.1.5` | Added a reusable multi-image gallery to every persona, active-image selection, non-destructive reference removal, and an export-time image picker while preserving legacy `icon` compatibility and all gallery/folder assets through cleanup and backup. |
| `v0.1.6-experimental.1` | Added an independent parser-hardening profile and included it in `all`, replacing three permanent parser skips with passing coverage for ChatML terminal generation markers, Thoughts extraction, and CBS logical precedence. |
| `v0.1.6-experimental.2` | Added independent toolchain hardening for Node.js 25's incomplete experimental `localStorage` and Lightning CSS `::highlight` support, while retaining actionable large lazy-chunk warnings. |

The current `v0.1.5` release has been validated against PocketRisu `v1.8.1`
with:

- 8/8 patcher tests and reproducible installer generation;
- a clean unified apply, embedded PocketRisu checks, production build, and
  exact byte-plus-mode revert in GitHub Actions;
- 1,206 PocketRisu tests passed, with three pre-existing parser specifications
  intentionally skipped;
- Svelte diagnostics at 0 errors and 0 warnings;
- BG orchestration bundle build/load and production health checks;
- iPhone validation of multi-image add/select/remove, export-time selection,
  the compact gallery layout, and existing persona editing behavior.

The `v0.1.6-experimental.2` hardening candidate has separately passed 10/10
patcher tests, a clean standalone hardening run with 63 files and 936 tests
passed with no skips under Node.js 25, a production build without
`::highlight` compatibility warnings, and exact standalone hardening
apply/re-plan/status/revert. Its clean unified run passed 94 files and 1,218
tests with no skips, Svelte diagnostics at 0 errors and 0 warnings, the
production build and BG bundle load check, current ETags with no drift, and
exact source revert.

See [CHANGELOG.md](CHANGELOG.md) for experimental checkpoints and the complete
per-release change list. The preceding `v0.1.4` incident analysis and safety boundaries
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
- a per-persona image gallery with multi-file add, explicit active-image
  selection, and non-destructive removal;
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

The existing `persona.icon` field remains the active image consumed by chat
rendering and external integrations. `imageGallery` stores the reusable set,
including that active image. Legacy single-image personas are adopted on load.
The gallery occupies the image area in the editor, and its `Active` badge is the
single active-image indicator. Standard persona PNG export opens a gallery
picker and embeds the selected image without changing the active image; the
full database and partial backup retain every gallery image. Removing an entry
from a persona or resetting a folder image never deletes the shared asset.

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

### Parser hardening

The independent `parser-hardening` pack resolves the three parser
specifications that PocketRisu v1.8.1 previously skipped:

- `parses ChatML without ending token`: a final empty assistant generation
  marker such as `<|im_start|>assistant` is a provider prompt boundary, not an
  empty chat message. It is dropped only when it is terminal, recognized,
  content-free, and lacks `<|im_end|>`; content-bearing unterminated messages
  and explicitly ended empty messages remain valid.
- `extracts multiple thoughts`: the greedy cross-block expression is replaced
  by a depth-aware scanner that extracts sibling `<Thoughts>` blocks in order,
  preserves nested markup inside one outer thought, removes empty blocks, and
  leaves unmatched opening markup visible.
- `Lower precedence than other operators`: CBS comparison operands are reduced
  before `and`/`or`, while the existing right-to-left behavior between logical
  operators and the legacy path for expressions without logical operators are
  preserved.

The Thoughts scanner is shared by ChatML parsing and the main response path, so
the two consumers cannot silently diverge. The pack owns focused regression
tests and has its own SHA-256 ETag; its managed content, apply state, status,
and revert scope remain independent from feature and bg-preserve packs.

### Toolchain hardening

The independent `toolchain-hardening` pack keeps test and build tooling
deterministic without changing PocketRisu runtime source:

- Vitest conditionally replaces an incomplete Node.js experimental
  `globalThis.localStorage` with `happy-dom`'s `Storage`. Browser-like
  environments that already expose a complete Storage API are left unchanged.
- `package.json` and the matching lockfile sections override Lightning CSS to
  1.33.0, so both Tailwind and Vite understand the standard `::highlight`
  selectors already used by PocketRisu.
- the override and every lockfile resolution are one reversible patch graph;
  frozen installs remain valid and revert restores the original bytes and
  modes.

After applying this pack, run `pnpm install --frozen-lockfile` before tests or
builds so an existing `node_modules` tree also adopts the locked version.

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

Use `pocketrisu-features.cjs` for feature packs without bg-preserve, or
`pocketrisu-hardening.cjs` for parser hardening alone.
After applying source changes, run PocketRisu's normal checks and production
build. The unified profile also changes code included by the bg orchestration
bundle, so rebuild it when that builder exists:

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm build
test ! -f server/node/bgOrchBundle.build.cjs || node server/node/bgOrchBundle.build.cjs
```

Restarting a running PocketRisu process is deliberately outside the patcher.

PocketRisu's production build can still report chunks above its 2,000 kB
warning threshold. The current over-limit outputs are already separate lazy
assets for model token data, Monaco, WebLLM, and web tokenizers. Do not raise
the threshold merely to hide them. Revisit chunking when an initial-load chunk
crosses the threshold, a formerly smaller chunk regresses, or a supported
upstream split can reduce transferred bytes without removing those features.

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

## Adding or updating a patch pack

1. Inspect the exact PocketRisu version and the complete normal call paths
   affected by the change. Store large exact replacement baselines under the
   pack's `anchors/` directory and managed replacements under `files/`.
2. Add a versioned manifest with a unique pack ID and unique unit IDs. Use
   `requires`, `before`, or `after` for semantic order that cannot be inferred
   from text collisions. Avoid owning unrelated files or broad sections.
3. Register the manifest in `src/catalog.cjs`, then add it only to profiles
   whose ownership boundary should include it. Update profile transition tests.
4. Do not hard-code an ETag. `packEtag()` calculates SHA-256 over the stable
   JSON representation of the pack's exact `{ id, version, units, contracts }`.
   Any managed text, anchor, ordering contract, mode, or version change
   therefore changes the ETag automatically. Never edit a target's
   `save/pocketrisu-patches/state.json` by hand.
5. Add a test that mutates one managed field and proves the ETag changes while
   the original remains stable. Also test the pack's profile inclusion and
   explicit file boundary.
6. Run `npm test` and build the installers twice; byte hashes must match. On a
   clean target, verify `plan`, `apply`, a second `plan` with no changed files,
   `status` with `catalogStatus: current`, and `revert` restoring exact content
   and POSIX modes.
7. For dependency changes, patch both the package manifest and lockfile, then
   prove `pnpm install --frozen-lockfile` succeeds and the resolved dependency
   graph contains the intended single version.
8. Bump the pack's semantic version whenever its behavior changes, even though
   content-addressed ETags would detect the change. Update the repository
   version, README release history, and CHANGELOG before publishing.

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

The `features` and `hardening` artifacts refuse to take ownership of another
profile's state, because doing so could silently remove managed packs. The
`all` artifact may safely adopt a prior `features` or `hardening` state.

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
