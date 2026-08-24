# Haejeok RisuAI focused integration plan

> Planning target: official PocketRisu `v1.10.0` (`98e9683`)
>
> Haejeok source: `e9d035683cdf9f0207eed193ee36f9bdb117f658`
>
> Delivery rule: every admitted HJ change is a patcher payload in the one
> `all` graph. No HJ change is maintained as a direct PocketRisu source fork.

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
| HJ04 | Persist a new user turn before generation; persist script-mutated messages; persist plugin updates before runtime reload | Hidden `haejeok-persistence-safety-adapter`, composed only with `lazy-chat-sync` and `bg-preserve` | Implemented on the integration branch; qualification details below |
| HJ03 | Korean-aware character-name matching: ordinary substring plus choseong, partial Hangul, Korean/English keyboard, and romanized input | `character-organizer` search payload and canonical PocketRisu catalog hook | Next implementation |
| HJ01 | Personal chat maximum-width setting without changing the default layout | `personal-settings` appearance schema/runtime/CSS | Follows HJ03 |
| HJ02 | User-resizable text areas with mobile-safe bounds | Personal appearance/accessibility owner plus K15 composition review | Deferred until HJ01 establishes the layout token boundary |
| HJ05 | Bounded low-spec rendering, paging, and cache policy | `lazy-chat-sync` plus K14 chat-render adapter | Deferred pending DOM/memory measurements and active-stream tests |
| HJ06 | ZIP64/streaming output beyond the current 4-GiB archive boundary | CharX/backup archive owner selected per reproduced failing format | High-value deferred item; requires CRC round-trip and bounded-resource tests |
| HJ07 | Node token, lore, and vector computation with browser fallback | BG request snapshot, tokenizer, lore, and K11 Hypa owners | Deferred pending before/after CPU, memory, and latency measurements |
| HJ08 | Native log exporter and media pipeline | New internal feature owner if admitted | Deferred because its dependency and bundle cost would affect every install |

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

The implementation will live entirely in patcher payloads. The matcher will be
a side-effect-free owned module with table-driven tests. The existing character
catalog remains the rendering and ordering authority; HJ03 may decide whether a
row matches, but may not introduce a second character order, folder model, or
recent-session store.

Required query coverage:

- existing case-insensitive substring behavior;
- full choseong queries such as `ㅎㄱ`;
- incomplete final Hangul syllables and decomposed jamo;
- Korean text typed on an English keyboard and the reverse direction;
- romanized Korean names when the frozen Haejeok algorithm and dependency
  contract are verified; and
- negative cases that avoid broad false-positive matches.

The native list order must be unchanged for an empty query and for equal match
classes. If scoring is retained, it may only provide deterministic relevance
inside the current filtered result and must not alter canonical persistence.

### HJ01 — chat maximum width

HJ01 will extend the existing Personal appearance schema rather than add a raw
Haejeok database field. The default value preserves PocketRisu's current layout
byte-for-behavior. Named bounded values and a fluid value will be rendered by
the existing Personal runtime through one CSS token.

Qualification must cover desktop and mobile widths, long unbroken content,
K14 streaming updates, K15 partial editing, translated message fragments,
fullscreen composition, Safe Mode, import/export normalization, and old
Personal payloads with no width key. The setting must not change the composer,
sidebar, image viewer, or chat storage width.

## Later-cycle gates

HJ02/HJ05/HJ06/HJ07/HJ08 are not silently admitted after the first cycle.
Each requires a separate owner report, source/path list, implementation commit,
receipt, and complete-graph qualification. Destructive asset cleanup remains
server-authoritative and fail-closed throughout every later cycle.

## Publication and live application

Feature commits and receipts remain separate enough to isolate regressions,
but the generated delivery has only the complete installer. Before live apply:

1. regenerate both platform installers from the same complete graph and compare
   their embedded graph/hash metadata;
2. run source attribution and sensitive-information sweeps;
3. read active generation/import/restore state without changing it;
4. if work is active, wait without cancellation;
5. apply the complete patch transaction, build the client and server bundle,
   restart, and compare served/local artifacts; and
6. run feature-specific iPhone L3 scenarios before any stable tag or release.
