# PocketRisu 1.9 aggregate validation

## Scope and boundary

This receipt qualifies the current local PocketRisu patch catalog and the
seven-child `pocketrisu-kei` 0.9.0 umbrella on exact official PocketRisu
1.9.0, commit `85a65f3137b45c8de4a8d21a9887be213b1ac3fc`.

The admitted Kei children are K19, K13, K14, K16, K15, K11, and K12. The
keep/drop/defer decisions for the remaining catalog rows are recorded in
`docs/POCKETRISU-1.9-CATALOG-COMPLETION-DECISIONS.md`; this aggregate does not
silently add a preset-folder, backup, request-log, usage, regex, persona,
character, or second generation owner.

`verified` in this receipt means exact-target source and automated graph
qualification. It does not mean publication-qualified: review and the
consolidated feature-by-feature iPhone L3 remain. No live apply, PocketRisu
restart, push, tag, or release was performed.

## Provenance

- The immutable source archive was produced from the exact official commit.
  Its SHA-256 was
  `cba5851498a398fbe5f416573712465d24eb4b90d9ed0a3d7708f03f330bda69`.
- The extracted source measured 91,524 KiB, reported package
  `pocketrisu 1.9.0`, and contained no patch state.
- The existing staged K12 evidence worktree on
  `codex/pocketrisu-kei-integration` was not changed, unstaged, rebased, or
  used as the target root.
- All candidates in this receipt were separate temporary checkouts. The live
  PocketRisu tree remained pristine 1.9.0.

## Graphs observed

| Graph | Compatibility | Resolved packs | Units | Ordered collisions | Planned changed paths |
| --- | --- | ---: | ---: | ---: | ---: |
| `pocketrisu-kei,toolchain-hardening` | verified | 15 | 176 | 0 | 57 |
| `pocketrisu-kei,lazy-chat-sync,bg-preserve,toolchain-hardening` | verified | 18 | 387 | 3 | 160 |
| `--all` | verified | 24 | 475 | 4 | 201 |

The three composed collisions are explicit lazy-chat-before-BG orders on
`globalApi.svelte.ts`, `server.cjs`, and plugin chat access. The fourth
`--all` collision orders two units owned by `persona-organizer`. None was an
unresolved pair.

Adapter resolution selected exactly one host adapter for each Kei core:

- base versus BG for stream parsing, chat rendering, Hypa tools, partial
  editing, and translation tools;
- base versus lazy-chat for mobile navigation;
- the lazy/BG storage adapter only when both parent owners were present.

## Observed automated gates

Before the umbrella compatibility change, both the base and lazy/BG composed
candidates passed their maintainer staging pipelines. Each pipeline completed
the pinned pnpm check, frozen install, complete frontend and server target
tests, Svelte diagnostics, and production build. The composed candidate also
built the BG orchestration bundle.

The reviewing-target exhaustive run then observed:

- 11 discovered user-selectable packs;
- 2,048/2,048 raw selections;
- 1,024 normalized graphs;
- 204 managed paths;
- a maximum of 475 resolved units;
- exact apply, current status, zero-change repeated plan, and byte/mode
  round-trip for every selection.

After these results, `pocketrisu-kei` moved from 0.8.0 to 0.9.0 and explicitly
listed 1.8.1 and 1.9.0 as verified targets. No global default target boundary
was widened. Patcher tests then passed 31/31.

The ordinary, non-maintainer exact-1.9 gate repeated the entire discovered
domain and observed the same 2,048/2,048 raw selections, 1,024 normalized
graphs, 204 managed paths, maximum 475 units, and passing round trips with
compatibility `verified`.

The ordinary `--all` staging candidate then completed:

- pinned package-manager and frozen-install checks;
- complete frontend and server target tests;
- Svelte diagnostics;
- production build;
- BG orchestration bundle build.

Its status was current across 199 transaction-managed files. A repeated
`--all` plan retained 475 units and four ordered collisions while changing
zero files and skipping all 199 current files. Empty-selection revert changed
the managed graph back, removed patch state, produced CLI status `clean`, and
left the official tracked source diff at zero. The only remaining untracked
files in that temporary checkout were the two BG bundle build outputs.

## Deterministic installers

The four generated installers were rebuilt twice from the same source and
catalog. Both builds produced identical SHA-256 values:

| Installer | Bytes | SHA-256 |
| --- | ---: | --- |
| `pocketrisu-patcher.cjs` | 4,685,641 | `02c573aa09e16fd27a70fa0f8d5657f831cf7eb42e538633c64398ff64e23fb0` |
| `pocketrisu-features.cjs` | 4,685,647 | `6608219ae8538eee956e2ce306c7966fe4729894bf77d00e094c6d9b106fcb12` |
| `pocketrisu-hardening.cjs` | 4,685,648 | `898a669ec2b0bab2a1d4494b390ff1c43785be8a372006a51c89e89ebc20525e` |
| `pocketrisu-all.cjs` | 4,685,642 | `367eb505d355261999787a30f401c2c637280ac574094926dcac480bb44fdbca` |

Both the fixed-profile `pocketrisu-all.cjs` and generic
`pocketrisu-patcher.cjs --all` emitted the same verified 24-pack, 475-unit,
four-ordered-collision plan. Both embedded `pocketrisu-kei` 0.9.0 with ETag
`1efbbf7d1666dcc2c27bd7b05b6df85e7e55bc107473d5d9cb3cc66aa69f236c`.

## L2.5 runtime audit

### Phase 1 — flat discovery

- exact-target compatibility and rejection of unlisted PocketRisu versions;
- umbrella dependency expansion and hidden-child direct-selection rejection;
- base/BG and base/lazy adapter exclusivity;
- unit dependency ordering and the four explicit ordered collisions;
- transactional first apply, status, repeated plan, failed-apply rollback,
  empty-selection revert, intent, state, file bytes, modes, and owned files;
- K19 native AssetViewer ownership plus accessibility-only replacements;
- K13 OpenAI and Gemini SSE framing, replay, completion, tool-call, thought,
  malformed-frame, and BG stream interaction;
- K14 active-stream identity, reactive in-place update, viewport stability,
  auto-translation deferral, terminal render, and BG completion;
- K16 shortcut enablement, editable-target rules, character navigation,
  pointer navigation, listener initialization, lazy bootstrap, and mobile Back;
- K15 shared selection mapping, exact message/chat/cache identity, stale edit,
  streaming disablement, translation-cache CAS, and manager lifecycle;
- K11 manual frontier, contiguous selection, preview/reroll/cancel/apply,
  native search/bulk mode preservation, stale result, and BG request path;
- K12 translation task supersession, abort propagation, cache identity,
  scan, pagination, edit/delete CAS, explicit confirmation, and BG delivery;
- lazy-chat storage, BG generation/result ownership, startup cache
  supersession, and durable save interactions;
- character import/organizer, persona organizer, personal settings, parser
  hardening, preset integrity, and toolchain behavior in the maximum graph;
- timers, event listeners, rAF callbacks, mounted components, abort
  controllers, promises, sockets, storage writes, and build outputs;
- iOS touch, swipe, keyboard, rotation, suspension, resume, focus, safe-area,
  memory, and provider-specific behavior;
- cache and log growth, request content, translation-cache deletion, plugin
  array writes, malformed external input, and generated-installer provenance.

### Phase 2 — external-anchor resolution

- **Target boundary.** The manifest now lists only exact 1.8.1 and 1.9.0 as
  verified. Compatibility tests prove 1.9.0 is accepted while an unlisted
  1.9.1 remains rejected. Ordinary source and generated-installer plans both
  reported `verified`; the maintainer-only reviewing gate was not needed
  after promotion.
- **Dependency and adapter exclusivity.** The umbrella remains unit-free and
  requires exactly seven hidden cores. Each adapter manifest declares its
  parent requirements, opposite-adapter conflicts, and base/BG or base/lazy
  `autoWhen` predicate. The 2,048 raw-selection run is the external anchor
  that every reachable selection resolved, reapplied without changes, and
  reverted exactly; a direct-child request remains rejected by patcher tests.
- **Ordered collisions.** The maximum plan reported only the three existing
  lazy-before-BG pairs and one intra-persona pair. Their `before`/`after`
  directions were present in the composed order; no unordered collision was
  accepted. The complete target test/build and round-trip gates ran on the
  resulting order rather than merely inspecting the plan.
- **K13 with BG.** Applied `google.ts` and `openAI/requests.ts` each instantiate
  the shared replayable parser inside the BG adapter. The Google units are
  explicitly after the BG sub-key hooks. Provider integration tests passed in
  the complete target suite. Actual classic-provider chunking and iOS
  suspension remain empirical surfaces.
- **K14, K12, and K15 on chat hosts.** Applied `ChatBody.svelte` captures
  `streamingDisplay`, refuses auto/retranslation while it is true, begins one
  task, checks abort after async parse/translate boundaries, commits only the
  current task, and finishes it in `finally`. `Chats.svelte` keeps a stable
  active-stream hash and calls the mounted component's reactive update instead
  of remounting per chunk. `DefaultChatScreen.svelte` installs one shared
  partial-edit manager only when either feature setting is enabled and passes
  the same current chat identity alongside the K14 generation state. The K14,
  K15, and K12 focused tests plus both composed complete target suites are the
  behavioral anchors.
- **K16 with lazy-chat.** Applied `bootstrap.ts` invokes idempotent hotkey
  initialization only after the lazy bootstrap path has loaded the database.
  Applied `hotkey.ts` has one initialization guard, reads the current database
  per event, turns all configured actions off when the master setting is
  false, and rejects nonmatching/editable contexts before mutations. Focused
  tests and the composed target suite cover deterministic DOM/navigation
  behavior; iOS history and gesture arbitration remain empirical.
- **K11 native-owner preservation.** Applied `HypaV3Modal.svelte` makes manual
  mode mutually exclusive with search, bulk edit, category, and tag state,
  and wraps the native summary list, native search, footer, bulk reroll, and
  bulk edit UI in `!manualSummaryMode` rather than replacing those owners.
  K11 focused tests and the composed target suite anchor frontier and stale
  result behavior. The configured remote summary route remains an L3 surface.
- **K19 native-owner preservation.** Applied exact-1.9 source retains native
  search, keyboard, scroll-snap swipe, adjacent-slide mounting, rAF scroll
  guard, URL resolution, and character/module entry ownership. The K19 delta
  adds only modal/group semantics, accessible names, explicit button types,
  and 44-pixel close targets. Diagnostics and production build passed; iOS
  VoiceOver, focus return, and swipe physics remain empirical.
- **Destructive and plugin data paths.** K12 individual and cleanup deletion
  require UI confirmation and compare the exact storage key/key/value before
  removal; changed or missing rows are skipped. A fresh aggregate search found
  zero calls that pass a top-level `plugins` array to `setDatabase()` or
  `setDatabaseLite()`. This does not authorize deleting real cache fixtures in
  L3 or changing installed plugins.
- **Transaction and generated artifact integrity.** The ordinary exhaustive
  gate compares bytes and modes after every selection. The maximum candidate
  additionally observed current status, zero-change repeated plan, clean
  tracked revert, and absent state. Two installer builds produced identical
  hashes, and both embedded installers reproduced the source graph.
- **Resource and environment claims.** The source shows abort-controller,
  listener cleanup, idempotent initialization, current-task guards, rAF
  bounding, and adjacent-image mounting at the changed owners. Tests establish
  deterministic lifecycle outcomes. Actual iOS suspension, viewport/focus,
  provider timing, long-chat/cache memory, and network delivery cannot be
  concluded from detached Node tests, so they remain explicit surfaces rather
  than being called safe.

### Phase 3 — triage

- **Q3, resolved:** exact-target metadata, adapter exclusivity, ordered graph
  composition, current/replan/revert behavior, stale 1.9 installers, and the
  aggregate test/build gate are closed by the observations above.
- **Q3, no additional aggregate code fix:** the cross-feature code read found
  no second owner, unordered collision, unconditional destructive path, whole
  plugin-array write, or new unbounded collection introduced by the umbrella.
  This is bounded to the inspected exact-1.9 graph and is not a completeness
  claim about arbitrary future versions.
- **Q4, consolidated iPhone L3:** native AssetViewer/VoiceOver, K13 provider
  streams, K14 scrolling/background completion, K16 keyboard/gesture/history,
  K15 selection/edit/cache identity, K11 manual summary, and K12 cache and
  translation cancellation must each be observed in the concrete scenarios
  retained by the status and feature receipts.
- **Q4, unavailable routes:** DeepLX, Bergamot, classic OpenAI/Gemini variants,
  mouse/trackpad block-hover, and Realm/Chub marker behavior are recorded as
  not exercised when the configured environment cannot supply them; they are
  not silently marked passed.
- **Q4, policy packs:** K27 request-content policy and K28 usage retention are
  explicit future decisions. The aggregate preserves official 1.9 behavior
  and does not imply that those privacy/retention choices were made.

## Remaining gates

1. Review the aggregate diff and the receipt claims against the exact target.
2. Run the consolidated iPhone L3 while recording every child scenario
   separately.
3. Resolve any finding in the owning feature or infrastructure commit, then
   rerun the affected focused gate and the aggregate gates required by the
   change.
4. Only after review and L3 decide whether to commit the final generated
   artifacts for publication, push, tag, release, or authorize a separate
   live candidate apply/restart.
