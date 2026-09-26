# Patcher all-or-nothing delivery design

## User contract

- `pocketrisu-patcher.cjs` has one enabled state: the complete admitted patch
  set.
- `plan`, `apply`, and `stage` always resolve that complete set.
- `revert` removes every managed patch and records delivery as disabled.
- `status` reports the installed graph and the binary enabled/disabled policy.
- `configure`, `--all`, `--packs`, `--preset`, and `--profile` are rejected.
- `pocketrisu-all.cjs`, `pocketrisu-features.cjs`, and
  `pocketrisu-hardening.cjs` are retired installer filenames.

## Internal graph

All-or-nothing delivery does not flatten implementation ownership. The catalog
retains root packs, required capability packs, automatic adapters, exact
ordering, and target-scoped units. The resolver still supports supersede and
conflict relations, but the catalog carries only the adapters of the delivered
graph: the base, standard-storage, legacy CharX, and startup-cache variants for
graphs without bg-preserve or lazy chat storage were removed after `v0.2.3`.

```text
one complete intent
  -> admitted root packs
  -> dependency expansion
  -> exactly matching owner adapters
  -> deterministic unit order and collision validation
  -> one transactional plan/apply/revert
```

This internal graph keeps feature-level tests and exact revert boundaries
without exposing downloader-selectable combinations. `userSelectable` remains
an internal catalog distinction between root packs and hidden adapters; it no
longer promises a public selector.

## Admission

- Every registered root pack with `allDefault !== false` is included.
- `allDefault: false` is a maintainer-only pre-admission state. It cannot be
  selected by a distributed installer.
- This checkpoint removes `background-import` from registration after device
  use found its upload path slower and less convenient. Its source/tests were
  later removed from the tree; tag `v0.2.3` keeps the last copy.
- A new feature must pass its focused owner graphs and the maximum complete
  graph before `allDefault: false` is removed.
- Focused internal compositions remain normal feature gates when an adapter
  has multiple authorities.

## Intent migration

Format-2 storage is retained for compatibility:

- `{ mode: 'preset', preset: 'all' }` means enabled;
- `{ mode: 'custom', requestedPacks: [] }` means disabled.

Every non-empty legacy, custom, `features`, or `hardening` intent migrates to
enabled complete delivery. The next successful apply stores rolling `all`.
An empty custom intent remains disabled. A plain explicit `plan` or `apply`
still previews or enables the full graph; automatic update tooling can inspect
`status.delivery.enabled` before deciding whether to invoke it.

The complete profile may adopt old `features`, `hardening`, or known custom
state. It refuses a state containing a pack unknown to the active catalog, so
a foreign/future owner cannot be silently erased.

## Transaction and conflict contract

- Planning composes from pristine old unit snapshots rather than editing
  already-managed bytes in place.
- A conflict, missing anchor, stale plan, unknown target, or failed check stops
  before live source writes whenever that phase permits.
- Apply and revert keep one exclusive root lock, private transaction journal,
  exact byte/mode snapshots, stale-plan revalidation, and rollback on failure.
- Files already at the final bytes and POSIX mode are skipped.
- Conflict reports identify the internal pack/unit even though users cannot
  omit that pack. Resolution belongs in a new qualified complete installer.

## Upstream qualification

`stage --root CURRENT --candidate FRESH` carries the complete intent into a
separate pristine target, applies it transactionally, runs declared target
checks, detects managed-source drift after checks, and emits a private receipt.

The source-only maintainer command may accept a target whose manifests say
`reviewing`, but it still stages the complete graph. A `review-passed` receipt
does not mark the version verified or allow cutover by itself.

## Distribution

- `scripts/build-installers.cjs` generates only
  `dist/pocketrisu-patcher.cjs` and the compatibility
  `dist/pocketrisu-all.cjs`.
- Both artifacts embed the same catalog and fixed `all` profile.
- Two consecutive builds must be byte-identical.
- CI runs patcher tests, reproducible generation, syntax checks, the complete
  graph lifecycle on exact PocketRisu 1.10, target tests/check/build, and exact
  tracked-source revert. Stable `v0.2.2` verifies the complete
  exact-1.10 graph, including PageFold and the FastImport iOS owner, so its generated
  installer performs ordinary apply/revert
  without the source-only maintainer gate. Inactive adapter alternatives and
  future PocketRisu versions remain fail-closed and use the `reviewing`
  qualification path first.
