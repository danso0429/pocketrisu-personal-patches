# Haejeok RisuAI focused integration plan

> Planning target: official PocketRisu `v1.10.0` (`98e9683`)
>
> Haejeok source: `e9d035683cdf9f0207eed193ee36f9bdb117f658`
>
> Delivery rule: every admitted HJ change is a patcher payload in the one
> `all` graph. No HJ change is maintained as a direct PocketRisu source fork.
>
> Final admitted HJ scope after independent and bounded-runtime revalidation:
> HJ04, HJ03, and HJ01. There is no new active HJ queue; HJ02/HJ05/HJ07 are
> trigger-gated, HJ06 is blocked, and the frozen HJ08 implementation is rejected.
>
> Future execution authority:
> [`HAEJEOK-POST-VALIDATION-INTEGRATION-PLAN.md`](HAEJEOK-POST-VALIDATION-INTEGRATION-PLAN.md).
> This file remains the implementation and live-receipt authority for the
> three admitted adapters.

## Outcome and boundaries

The goal is not to turn PocketRisu into Haejeok RisuAI. It is to retain
specific Haejeok outcomes that fit PocketRisu 1.10 while keeping the patcher's
existing storage, background-generation, import, backup, persona, character,
and Kei authorities intact.

The published surface remains one all-or-nothing installer. Internal packs
and adapters are still retained because they provide ownership, ordering,
exact revert, and feature-level regression isolation; they are not exposed as
user-selectable combinations.

Every HJ admission must therefore satisfy all of these rules:

1. live PocketRisu source is changed only by the patcher transaction engine;
2. the exact Haejeok revision, commit, and source path are recorded;
3. a change is attached to an existing owner or a hidden composition adapter;
4. native PocketRisu behavior and local stronger behavior are checked before
   code is added;
5. the complete 1.10 graph must apply, replan with zero changes, revert to a
   clean official tree, and reapply;
6. target tests, static checks, build, server bundle, and owner-specific tests
   run on the composed tree; and
7. publication happens only through the single complete installer.

## Admission catalog

| ID | Outcome | Patcher owner | Status |
| --- | --- | --- | --- |
| HJ04 | Persist a new user turn before generation; persist script-mutated messages; persist plugin updates before runtime reload | Hidden `haejeok-persistence-safety-adapter`, composed only with `lazy-chat-sync` and `bg-preserve` | **Admitted and live-device qualified.** Qualification details below. |
| HJ03 | Korean-aware character matching: ordinary substring plus choseong, partial Hangul, Korean/English keyboard, and romanized input | Hidden `haejeok-korean-search-adapter` attached to `character-organizer` and the canonical PocketRisu catalog | **Admitted and live-device qualified.** Qualification details below. |
| HJ01 | Preserve native chat-width authority and add the missing Haejeok Small 600px outcome | Hidden `haejeok-chat-width-adapter` attached to `personal-settings` and PocketRisu's native Standard-width setting | **Admitted and live-device qualified.** Qualification details below. |
| HJ02 | User-resizable text areas | No current owner/pack; a future request must be screen-local or explicit opt-in | **Trigger-gated research.** Reject Haejeok's unbounded global handle across all 105 current instances; open only for a named screen problem. |
| HJ05 | Bounded low-spec rendering, paging, and cache policy | No current owner/pack; any measured future outcome must stay in its existing lazy/K14/asset owner | **Trigger-gated research.** The main compaction result depends on the excluded relational store; portable slices require an owner-specific measured failure. |
| HJ06 | ZIP64/streaming output | No current owner/pack; a future format project must join CharX export and import limits | **Blocked.** The writer passed actual 4 GiB+1 and 65,536-entry Info-ZIP probes, but the HJ importer accepted bad CRC and still caps one entry at 50 MiB. |
| HJ07 | Node token, lore, and vector computation | No current owner/pack; a future measured client-only stage must compose with BG/tokenizer/lore/K11 | **Trigger-gated research.** Unit correctness does not establish net client benefit or shared Node responsiveness. |
| HJ08 | Native log exporter and media pipeline | No current owner/pack; stable-ID text range and visual/media rendering are separate future decisions | **Frozen implementation rejected.** Chromium confirmed input/document-boundary defects, output wiring is incomplete, and its UMD ffmpeg core path failed while an ESM control loaded. |

The relational SQL/domain-store rewrite, S3/RustFS storage authority, browser-
decided destructive asset deletion, branding/onboarding, account removal, and
release plumbing remain excluded. They compete with current authorities or
describe a different product rather than a focused PocketRisu patch.

## First integration cycle

### HJ04 — persistence ordering

Source basis:

- `0fd90fcf`: persist each newly appended user message before generation;
- `23bb7437`: persist Lua/script message mutations, including an empty chat;
- `313ecdff`: do not classify same-value `setChat()` as a mutation;
- `3b5b3d39`: persist plugin updates before reloading plugin runtimes;
- `e78f9c91`: startup selection-reset race, reviewed for equivalence only.

The PocketRisu adaptation intentionally does not copy Haejeok's SQL
`MessageStore` or `SettingsStore`. It uses the existing lazy-chat strict save
authority instead:

- a newly appended UI user turn calls `requestDurableSave({chat})` before
  `sendChatMain()`;
- a mutating script merges only its cloned `message[]` into the identified live
  chat, then enters the same strict lazy-chat transaction, avoiding a parallel
  writer and an older-autosave overwrite race;
- read-only scripts, invalid identities, and the server orchestration bundle do
  not perform a browser save; and
- plugin import enlists only `changeTracker.plugins`, observes strict failure,
  and awaits `loadPlugins()` after the commit.

Bounded failure injection later confirmed why this adaptation must not be
described as HJ-equivalent durability. Haejeok's backend/client layers throw,
but Settings/Character/Message domain stores catch and normally resolve after
clearing pending state; user-message generation can continue. The current
adaptation is retained because its own strict save outcome and L3 were
qualified, not because the frozen SQL stores guarantee durable success.

No startup reset patch is needed in the composed target: `loadedStore.set(true)`
and `selectedCharID.set(-1)` occur in one JavaScript turn with no await between
them. No cache-revision patch is needed either: the composed target already
calls `resetScriptCache()` synchronously from `ReloadGUIPointer`.

Observed gates for commit `86b64ba`:

- patcher tests: 42/42 passed;
- focused target helper tests: 5/5 passed;
- composed target `svelte-check`: 0 errors and 0 warnings;
- complete graph: 13 requested roots, 12 effective roots, 36 resolved
  packs/adapters, 742 exact-target units, and 271 managed source paths;
- repeated apply after metadata reconciliation: no source changes; and
- complete revert: official Git tree clean with `git diff --exit-code`, followed
  by a successful complete reapply.

### HJ03 — Korean fuzzy character search

Source basis:

- `86ee613c`: Korean regex, choseong, jamo, QWERTY conversion, weighted
  name/creator/tag matching, tests, and `es-hangul` dependency; and
- `1e5f9eee`: Hangul romanization and phonetic normalization.

The implementation lives entirely in the hidden patcher adapter committed as
`b5b9803`. Its side-effect-free matcher is shared by PocketRisu 1.10's actual
`GridCatalog.svelte` and `MobileCharacters.svelte` surfaces. Haejeok's newer
`MainMenu` list, sort mode, hidden/favorite model, and score-based reorder are
not copied. Grid order and the mobile recent/name order stay in their native
owners; HJ03 only replaces the match predicate.

The Haejeok matcher is narrowed so only the final open Hangul syllable expands
to possible batchim forms. It also uses the official 2.4.0
`convertHangulToQwerty()` API for the reverse keyboard-layout mistake that was
not covered by the frozen Haejeok implementation. Conversion recursion is
explicitly bounded to one step.

Required query coverage:

- existing case-insensitive substring behavior;
- full choseong queries such as `ㅎㄱ`;
- incomplete final Hangul syllables and decomposed jamo;
- Korean text typed on an English keyboard and the reverse direction;
- romanized Korean names when the frozen Haejeok algorithm and dependency
  contract are verified; and
- negative cases that avoid broad false-positive matches.

Observed gates for commit `b5b9803`:

- matcher tests: 8/8 passed, including choseong, mixed/partial Hangul,
  bidirectional keyboard conversion, romanized names, creator/tags, regex
  escaping, a completed-syllable false-positive boundary, and stable order;
- patcher tests: 43/43 passed;
- composed target `svelte-check`: 0 errors and 0 warnings;
- production client build: 7,921 modules transformed and completed; inherited
  externalized-browser-module and large-chunk warnings remained warnings;
- exact dependency: `es-hangul` 2.4.0, SHA-512 integrity pinned, MIT license,
  30.4-kB package archive / 148.2-kB unpacked distribution;
- complete graph: 13 requested roots, 12 effective roots, 37 resolved
  packs/adapters, 753 exact-target units, and 275 managed source paths; and
- repeated apply changed zero files, complete revert left an exact clean Git
  tree, and complete reapply succeeded.

### HJ01 — chat maximum width

Source basis: Haejeok commit
`0243d0781fdbcca0768fa8ef2c0df6d365d8d27f`, principally
`Chat.svelte`, `setting/displaySettingsData.svelte.ts`, database normalization,
and English/Korean labels.

The original plan to add a Personal appearance width leaf was rejected after
reading the composed 1.10 target. PocketRisu already has
`nodeOnlyStandardChatWidth` with `Standard` (48rem), `Wide` (72rem), and
`Full`, and it applies one authority to the message card, creator note, and
composer. A second Personal value would let two settings compete for the same
layout.

Commit `459f784` therefore adds only Haejeok's distinct Small 600px outcome to
that existing setting. A pure helper normalizes `small | standard | wide |
full`, unknown and old values still normalize to `standard`, theme presets use
the same type, and no `chatLimitSize` field is introduced. The setting remains
PocketRisu Standard-only just like the native owner. English, Korean, and
Traditional Chinese labels are supplied.

Observed gates for commit `459f784`:

- width helper tests: 10/10 passed, covering all four values, unknown-value
  fallback, and exact native/custom class mapping;
- patcher tests: 44/44 passed;
- composed target `svelte-check`: 0 errors and 0 warnings;
- production client build: 7,922 modules transformed and completed with the
  same inherited warning classes;
- server orchestration bundle: 8,559 KB, load check observed
  `sendChat=function`;
- complete graph: 13 requested roots, 12 effective roots, 38 resolved
  packs/adapters, 769 exact-target units, and 280 managed source paths; and
- repeated apply changed zero files, generated test-only bundle artifacts were
  removed from the disposable target, complete revert left a clean Git tree,
  and complete reapply succeeded.

## Remaining-candidate boundary

HJ02/HJ05/HJ06/HJ07/HJ08 are not an active later-cycle queue. “No active
queue” does not erase the distinction between trigger-gated research, blocked
format work, and a rejected frozen implementation. Their source, exact owner
intersections, runtime counterexamples, narrower alternatives, and reopen
conditions are fixed in
[`HAEJEOK-REMAINING-CANDIDATE-DESIGN-AUDIT.md`](HAEJEOK-REMAINING-CANDIDATE-DESIGN-AUDIT.md).

Reopening one item requires a concrete trigger and a fresh owner report before
implementation. It still requires its own source/path list, feature commit,
receipt, focused composition, and complete-graph qualification. A future
Haejeok update or completion of another candidate does not reopen it
automatically. Destructive asset cleanup remains server-authoritative and
fail-closed in every case.

The bounded runtime and seven-axis evidence authority is
[`POCKETRISU-HAEJEOK-RUNTIME-VALIDATION.md`](POCKETRISU-HAEJEOK-RUNTIME-VALIDATION.md).
Actual HJ test/build, PostgreSQL 16/17, Chromium, ZIP writer/importer, and the
remaining `NR` gates must be read from that document rather than inferred from
this delivery plan.

The trigger, maximum scope, exclusion, one-feature-per-cycle rule, and shared
Gate 0–8 admission protocol are recorded in
[`HAEJEOK-POST-VALIDATION-INTEGRATION-PLAN.md`](HAEJEOK-POST-VALIDATION-INTEGRATION-PLAN.md).
Trigger-gated, blocked, rejected, and product-migration rows are disposition
decisions rather than pending implementation steps.

## Publication and live application

Feature commits and receipts remain separate enough to isolate regressions,
but the generated delivery has only the complete installer. Before live apply:

- current candidate: `0.2.0-experimental.21`;
- generated artifacts: `pocketrisu-patcher.cjs` and byte-identical `all` alias;
- each artifact: 7,277,675 bytes, mode 0700, CJS syntax-valid;
- SHA-256:
  `22a9a8af4a132de2f29755ad74cf77a203a4602f6304a0c0dcb041a0c4a4e34a`;
- embedded plan: all 38 resolved packs and zero changed files on the composed
  exact-1.10 qualification target.

1. regenerate both generated artifacts from the same complete graph and compare
   their embedded graph/hash metadata;
2. run source attribution and sensitive-information sweeps;
3. read active generation/import/restore state without changing it;
4. if work is active, wait without cancellation;
5. apply the complete patch transaction, build the client and server bundle,
   restart, and compare served/local artifacts; and
6. run feature-specific iPhone L3 scenarios before any stable tag or release.

### Live candidate receipt — 2026-08-24 KST

The `0.2.0-experimental.21` complete graph is live as a candidate. Immediately
before the process-first stop, two read-only preflights observed PM2 online,
unstable restarts 0, active HTTP requests 0, native running model jobs 0,
pending sends 0, BG operation/legacy results 0, and orchestration pending 0.
The retained BG lifecycle rows were 221 `delivered` and two `cancelled`.

Main, model-job, and retired-import SQLite each returned `quick_check=ok`.
The inert import row remained one `module / receiving` operation at exactly
11,534,336 / 31,705,288 source bytes. No generation or import was cancelled,
claimed, acknowledged, or deleted.

While stopped:

- the complete transaction changed only the 21 HJ/shared source paths plus
  private patch state and resolved 38 packs / 769 units / 280 paths;
- `pnpm install --frozen-lockfile` reused the existing store and admitted
  `es-hangul` 2.4.0;
- nine HJ, storage, BG, K14, and K15 test files passed 73/73 tests;
- Svelte diagnostics were 0 errors and 0 warnings, the help audit had no
  missing English/Korean key, and Lightning CSS resolved once at 1.33.0;
- the client transformed 7,922 modules and the BG bundle built to 8,763,553
  bytes with `sendChat=function` on load;
- production pruning retained `es-hangul`, `better-sqlite3`, Express, and a
  working msgpackr round trip; and
- generated status was `current` and the source re-plan changed zero files.

After restart, PM2 reported PocketRisu 1.10.0 online, restart count 6,
unstable restarts 0, and active requests 0. Root returned 3,587 bytes and named
`assets/index-KSLKghfQ.js`; served and local assets matched at 2,037,436 bytes
with SHA-256
`ca827add42ba4e420bcde31dd4c20efce45db746671d22104368d0a32cd19734`.
The build stamp is
`1.10.0-2f217022cef8b40cdf4907183f50854adf281cb7e7f93af0ab1bc3d19fab967d`.

All three database inode/size pairs, the three backups totalling 3,002,439,949
bytes, the partial source inode/bytes, and the 6,151,722-byte PM2 error log were
unchanged. SQLite remained `ok`, native/BG active work remained zero, the
retired diagnostics route remained 404, no nested save or transaction journal
appeared, and the 38-pack state remained `current`. At that receipt boundary,
physical feature L3 was the remaining HJ gate; its later passing result is
recorded immediately below.

### Physical feature L3 — passed 2026-08-24 KST

The user tested the six presented iPhone scenarios on the live candidate and
reported all six normal. This covers current-bundle entry, the existing
character-search surface with the new HJ03 matching behavior, Small-width
selection/persistence without mobile overflow, HJ04 send/stop/reopen message
persistence, and the available script/plugin persistence paths.

The search input itself is native PocketRisu 1.10 UI. HJ03 did not add that
field; it replaced the existing GridCatalog/MobileCharacters match predicate.
The earlier L3 wording that sounded like a newly added search screen was
incorrect and was clarified against the user's actual desktop-style iPhone
sidebar: list menu → grid icon → pre-existing Search field.

HJ04, HJ03, and HJ01 pass their physical feature L3. The later `v0.2.0`
aggregate decision promotes the resolved exact-1.10 graph to stable without
adding another Haejeok outcome. It accepts the separately recorded aggregate
device limitations without relabelling them as passes; the exact boundary is
in `docs/POCKETRISU-1.10-STABLE-RELEASE.md`.
