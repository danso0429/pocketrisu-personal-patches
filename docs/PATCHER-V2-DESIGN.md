# PocketRisu Patcher v2 design

## Responsibility boundary

- Downloaders select user-facing capabilities. They never choose unit order or
  edit manifests to resolve a conflict.
- The resolver expands that intent into packs and hidden integration adapters.
- Planning, compatibility checks, and reports happen before target files are
  written.
- A conflict blocks the transition. The patcher does not guess a new anchor,
  silently omit a pack, weaken a feature, or expose a downloader-facing force
  option.
- Only the patch maintainer changes a pack and qualifies a new release.

## Persistent state

- `intent.json` records the user-requested capabilities and survives upstream
  replacement.
- `state.json` records the exact resolved units applied to one target baseline.
- A new upstream tree is always planned as a fresh baseline in staging; an old
  applied-state snapshot is never treated as if its managed blocks still exist.

## Upstream lifecycle

1. The current live root supplies only saved user intent.
2. A new upstream release is acquired in a fresh, non-overlapping candidate
   directory.
3. Structural planning and exact target qualification run before candidate
   source writes.
4. A verified graph is applied only to the candidate. Frozen install, target
   tests, diagnostics, production build, and the selected BG bundle build run
   there.
5. Failure creates a maintainer report and a non-ready staging receipt. It
   never changes live source or activates the candidate.
6. Success creates a private ready receipt. Cutover, data movement, and
   process restart remain separate, explicitly reviewed deployment actions.

The private source tree also contains a maintainer-only qualification entry
point. It accepts only target versions explicitly declared `reviewing` in
manifest metadata, still requires a separate fresh candidate, and runs the
same gates. The distributed installer does not expose that gate. After a
successful automated review it writes a non-cutover `review-passed` receipt.
Only after the maintainer verifies the intended behaviors and round trip do
they move the exact version to `verified`, rebuild the installer, and rerun
the downloader staging path.

## Compatibility states

- `verified`: the exact target release and resolved graph passed the required
  qualification gates.
- `review-required`: structural planning may succeed, but the target has not
  been qualified by the maintainer.
- `under-review`: a private maintainer checkout has explicitly admitted the
  exact target to the qualification pipeline; downloader artifacts still
  refuse it.
- `blocked`: a dependency, anchor, ownership, ordering, contract, check, or
  build failure prevents application.

Only `verified` targets may be applied by a downloader release.

## Update discovery

- The source repository remains private.
- A stable, public, read-only update feed may be published separately from the
  private source and release workflow.
- Update checks are notification-only, send no installation data, never
  execute downloaded code, and never block an otherwise valid local command
  when the network is unavailable.
- Publicly shared installers must contain the stable feed URL from their first
  release; already distributed binaries cannot gain an update checker later.

## Delivery shape

- One universal installer contains the catalog, resolver, planner, reporter,
  staging gates, and CLI.
- `--all` expands to every compatible user-facing capability; storage packs
  still normalize through supersede rules, so users never choose their order.
- Legacy profile artifacts remain compatibility wrappers around named presets.
- User-facing packs stay independently versioned even though delivery uses one
  artifact.

## Report accessibility

- A report is always retained as private Markdown and JSON first.
- The universal artifact can also print the latest report without requiring
  the operator to browse its directory.
- Optional RisuAI delivery uses one unified exact receiver name:
  `PocketRisu Patcher Report`.
- `auto` accepts exactly one matching persona, module, or non-group character.
  A type-specific option may be used when the operator intentionally created
  same-name receivers of different types. Zero or duplicate matches abort.
- Persona delivery changes only `personaPrompt`; character delivery changes
  only `desc`. Module delivery changes only the matching named lorebook's
  `content` when it has the patcher-managed inactive shape, or appends one
  inactive random-key report lorebook to a dedicated module that has no such
  lorebook. A same-name ordinary lorebook is not repurposed.
- The patcher does not create or delete RisuAI objects and does not write
  SQLite directly. It talks only to a credential-free loopback origin, signs a
  short-lived token with PocketRisu's local secret, reads the current stripped
  database, obtains a flush cookie without sending `x-session-id`, submits one
  hash-preconditioned JSON Patch, flushes through the server storage queue, and
  re-reads the exact result. Omitting `x-session-id` preserves the active
  RisuAI writer session.
- Delivery failure never changes conflict disposition: the source transition
  stays blocked and the filesystem report remains authoritative.
