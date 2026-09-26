# PocketRisu 1.9 Kei K17 text-theme normalization validation

## Scope and authority

This receipt implements only K17-F01 from the overlap-equivalence audit's
technical reclassification recommendations. The broad K17 styling refactor,
preset save/import normalization, color-scheme changes, and API-v3 changes
remain excluded.

The exact-1.9 native theme owner remains authoritative:

- `standard`, `highcontrast`, and `custom` are the only accepted values;
- database load, theme-preset activation, and runtime CSS refresh normalize
  every other value to `standard`;
- a preset with an absent or null `textTheme` retains the current valid value;
- API-v3 still validates built-in themes and all six custom-theme fields with
  its existing code.

The implementation is the hidden `kei-text-theme-normalization-core` 0.1.0
child, required by `pocketrisu-kei` 0.11.0. Its nine managed units are active
only on exact PocketRisu 1.9.0. PocketRisu 1.8.1 resolves the pack with zero
active units so the dual-target umbrella remains compatible.

No live PocketRisu path, patch state, user data, preserved K12 index, process,
push, tag, release, or restart was changed.

## Feature contract and revert surface

- **Purpose:** prevent a malformed, older, or plugin-written text-theme value
  from leaving stale font-color CSS variables active.
- **Trigger:** native `setDatabase()` load normalization, native
  `changeToThemePreset()` activation, or `updateTextThemeAndCSS()` runtime
  refresh.
- **State/result:** the pure normalizer returns each official value unchanged
  and returns `standard` for every other value. Load and activation persist
  that result in the existing `textTheme` field; runtime CSS uses a local
  normalized value and does not add state.
- **Preservation:** the existing theme schema, six custom fields, color scheme,
  font, custom CSS, lite-mode standard override, preset selection, API-v3
  validation, providers, custom/local endpoints, plugins, and storage owners
  remain unchanged.
- **Exact revert surface:** the hidden K17 manifest and four owned target
  files, two import units and three boundary units in
  `database.svelte.ts`/`colorscheme.ts`, the catalog entry, umbrella
  require/version, their patcher tests, and this catalog/receipt update.

The K17 pack ETag observed during the target apply was
`2c8058c51d6f6c123b9216055e27b019527ab20727f73d2643436a6d044bfac9`.

## Provenance and resolved graphs

- Patcher pre-feature HEAD:
  `2ad4b1f57f01a673183f80d5ac5334d8ff7abd37`.
- Exact official PocketRisu target:
  `85a65f3137b45c8de4a8d21a9887be213b1ac3fc`, package `pocketrisu 1.9.0`.
- Pristine database SHA-256:
  `9e95e5f74cae21579a6dfec2c19885a471945616882b7237f155dee7b097c750`.
- Pristine color-scheme SHA-256:
  `6a1b82d41a2ca9b5947d2f3492e6efca864d424d8dd6f2aa2bbc94da81ba32d0`.
- Native API-v3 SHA-256 before and after apply:
  `1cc3dda1986a88f2264167b3fb90231d7463bbf8d5f0e0b8674059f1a1d70ca6`.

Observed owner graphs:

| Selection | Resolved K17 owner | Active K17 units | Compatibility | Collisions |
| --- | --- | ---: | --- | ---: |
| `toolchain-hardening` | absent | 0 | verified | 0 |
| `pocketrisu-kei` | `kei-text-theme-normalization-core` | 9 | verified | 0 |

The owner-present graph resolved 16 packs. K17 order was normalizer → database
import/load → normalizer test → preset activation/database test → runtime
import/CSS/runtime test.

## Observed automated gates

- Focused patcher graph/contract suite: 6/6 test files passed.
- Complete patcher suite: 33/33 test files passed.
- Exact-1.9 target Vitest: three files passed 29/29 tests. The cases covered
  all official values, nullish and invalid load input, an invalid activated
  preset, a legacy preset with no value, invalid runtime state replacing all
  six stale variables, and native high-contrast/custom branches.
- Independent read-only review found no blocking semantic, graph, revert, or
  scope-expansion issue after checking all three approved boundaries.
- Svelte diagnostics: exit 0, 0 errors and four existing warnings in
  `DefaultChatScreen.svelte`; the K17-managed files emitted no diagnostic.
- Production build: exit 0 after 7,807 transformed modules. The observed CSS
  highlight, externalized browser module, dynamic-import, plugin timing, and
  large-chunk warnings were outside the K17 theme delta.
- First umbrella apply changed 60 paths. Status then reported all 16 resolved
  packs current across 58 transaction-managed files. A repeated apply changed
  zero paths and skipped all 58 current files.
- Full revert changed 60 paths and reported clean status. The four owned K17
  files were absent afterward. Database and color-scheme files returned to the
  SHA-256 values above, mode `0600`, and sizes 108,070 and 15,175 bytes. The
  API-v3 file remained at its recorded SHA, mode `0600`, and size 60,888
  bytes. Tracked target diff was zero.
- Exhaustive combination verifier: exit 0; 2,048/2,048 raw selections, 1,024
  normalized graphs, 210 managed paths, maximum 487 resolved units, two
  workers, and `roundTrips: passed`.

The graph and transaction gates do not by themselves prove browser feature
intent or publication qualification.

## L2.5 runtime audit

### Phase 1 — flat discovery

- database load normalization before `DBState.db` assignment;
- official and unsupported persisted values, including null and undefined;
- theme-preset activation with present, absent, null, and corrupt values;
- active preset ID and all adjacent preset field copies;
- runtime CSS refresh from settings, hotkeys, bootstrap, preset UI, and API;
- lite-mode standard override and missing document root;
- standard dark/light, high-contrast dark/light, and custom six-color writes;
- font and custom-CSS updates after the text-theme switch;
- API-v3 built-in validation and custom-theme field validation;
- helper import/reference graph and possible dynamic dispatch;
- repeated normalization and persisted-state growth;
- exceptions from database/theme property access and DOM style writes;
- timers, listeners, network, filesystem, browser storage, plugin arrays,
  credentials, providers, custom/local endpoints, and code execution;
- exact-target pack activation, composition, owned-test lifecycle, and revert.

### Phase 2 — external-anchor resolution

- **Load boundary — structural plus measured test.** The break scenario is a
  non-null unsupported persisted value passing the old nullish-only default
  and remaining in `DBState.db`. Newly read applied source calls the pure
  normalizer at `database.svelte.ts:244-245`, within `setDatabase()` before
  the existing `setDatabaseLite(data)` assignment at `796-803`. Target tests
  measured undefined, null, empty, mixed-case, numeric, and arbitrary string
  inputs as well as all three official values.
- **Preset activation — structural plus measured test.** The break scenario is
  a present corrupt preset value replacing a valid active value. Applied
  source normalizes `p.textTheme ?? db.textTheme` at
  `database.svelte.ts:2810-2826`. Thus a present corrupt value becomes
  `standard`, while an absent or null legacy field uses and preserves the
  current valid value. The existing preset-ID update, structured color copy,
  custom-theme copy, and all other field assignments remain in the same order.
  Target tests measured the corrupt case, all official values, and the omitted
  legacy field.
- **Runtime CSS — structural plus measured test.** The break scenario is an
  invalid in-memory value selecting no switch arm and leaving every old CSS
  variable stale. Applied source normalizes the lite override or database
  value at `colorscheme.ts:379-388`; the native standard branch then writes all
  six variables at `389-404`. Target DOM tests seeded all six with `stale` and
  observed their complete standard replacement, while separately measuring
  native high-contrast and custom branches.
- **Callers and missing root — structural.** A full source search found runtime
  calls from hotkeys, bootstrap, display settings, color-scheme changes,
  theme-preset UI, and API-v3, plus the focused test. The helper itself has
  exactly three non-test static consumers: load, activation, and runtime CSS;
  it is absent from event registries, plugin tables, string-key dispatch, and
  callback maps. The existing `:root` absence return remains before the
  runtime normalization/CSS writes, so no new DOM failure path is introduced.
- **Official values and API — structural plus hash anchor.** The pure helper's
  fixed tuple contains exactly `standard`, `highcontrast`, and `custom` and
  performs no coercion. API-v3 still rejects non-built-in names at
  `v3.svelte.ts:910-918`, validates all six custom fields at `919-936`, and
  reports the current value at `938-943`. That file was not a managed unit;
  its applied SHA-256 matched pristine bytes.
- **Idempotency and state — structural plus measured test.** Every official
  value is a fixed point and `standard` is the fixed point for every invalid
  value. Repeated load/activation cannot append fields or create a parallel
  schema. Runtime normalization is local and does not persist a second copy.
  The existing single `textTheme` string and `customTextTheme` object remain
  the only state.
- **Failures and resource bounds — structural.** The helper compares against a
  three-item frozen tuple, allocates no retained object, and has constant CPU
  and memory work. Property getters and DOM `setProperty()` can still throw
  under their existing contracts; K17 adds no catch, side effect, or retry
  before those operations and does not convert failure into partial success.
- **External effects — structural N/A with adversarial recheck.** The K17 pack
  has no fetch, socket, timer, listener, abort controller, filesystem/browser
  storage write, credential, provider, endpoint, eval, or dynamic-function
  surface. It adds no runtime `setDatabase()`/`setDatabaseLite()` call and no
  top-level `plugins` write, so it does not exercise the whole-plugin-array
  replacement hazard.
- **Pack and revert — measured.** Owner-absent and owner-present plans, target
  apply/status/reapply/revert, source hashes/modes, owned-file removal,
  complete patcher tests, target diagnostics, production build, and every one
  of the 2,048 raw catalog selections were observed as recorded above.

### Phase 3 — triage

- **Q3, fixed:** unsupported persisted, activated-preset, and live runtime
  values now converge on `standard` through the native owner.
- **Q3, resolved by observed gates:** exact-target semantics, compilation,
  build, owner graphs, idempotent apply, and exact revert passed the gates
  above.
- **Q1, no new runtime owner:** no timer, resource, I/O, provider, plugin,
  storage, or parallel-schema leaf remains from this K17 delta.
- **No K17-specific L3:** the audit classified the distinction as
  source-provable and required no DOM/browser L3. The final aggregate still
  retains the separately required K19 swipe/VoiceOver and K29 reroll
  cold-return scenarios; this change neither replaces nor expands them.

### Cross-piece integration check

K17 composes with the existing umbrella graph without a declared or
undeclared collision in the observed owner-present plan. The final aggregate
audit must still revisit semantic interaction with K22, K23, K26, K27, and
K29 after those independently admitted changes are implemented.

## Publication boundary

This receipt qualifies a local patcher child only. It does not authorize or
claim generated-installer publication, push, tag, release, live apply, or
restart. Final aggregate review and the consolidated iPhone L3 remain later
gates.
