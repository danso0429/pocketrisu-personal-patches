# PocketRisu 1.9 Kei K04 typed prompt-role compatibility validation

## Scope and authority

This receipt implements only K04-F01 from the overlap-equivalence audit's
technical reclassification recommendations. It does not revive broad K04.

The exact-1.9 native prompt schema remains authoritative:

- `persona`, `description`, `authornote`, and `memory` use `.role2`;
- a non-null `.role2` is always normalized and retained as the authority;
- only an absent or null `.role2` permits a frozen Kei `.role` value to pass
  through the existing native `normalizePromptRole()` and populate `.role2`;
- lorebook role behavior, preset selection, and the native prompt item schema
  are not extended.

The implementation is the hidden `kei-prompt-role-compat-core` 0.1.0 child,
required by `pocketrisu-kei` 0.10.0. Its three managed units are active only
on exact PocketRisu 1.9.0; PocketRisu 1.8.1 resolves the pack with zero active
units so the dual-target umbrella remains compatible.

No live PocketRisu path, patch state, user data, preserved K12 index, process,
push, tag, release, or restart was changed.

## Feature contract and revert surface

- **Purpose:** recover frozen Kei typed prompt roles without adding Kei's
  parallel prompt-role schema.
- **Trigger:** database load, bot-preset load/save, preset activation, or
  preset import reaches the native `normalizePromptTemplate()` with one of
  the four approved typed blocks.
- **State/result:** normalization operates on the native structured clone and
  writes at most one native `.role2` property. Repeated normalization is
  idempotent because the first result becomes the authoritative `.role2`.
- **Preservation:** native `.role2`, official role aliases, invalid-role
  fallback to `system`, plain/jailbreak/CoT roles, cache roles, lorebook,
  active preset selection, providers, custom/local endpoints, plugins, and
  storage owners remain unchanged.
- **Exact revert surface:** one function export token and one managed switch
  branch in `src/ts/storage/database.svelte.ts`, the owned
  `src/ts/storage/promptRoleCompatibility.test.ts`, the hidden manifest,
  catalog entry, umbrella require/version, and their patcher tests/docs.

The K04 pack ETag observed after the final test expansion was
`37dc9e1a2ad610920286426a8e564bbc354d2591839d416cef754146fe897b5e`.

## Provenance and resolved graphs

- Patcher pre-feature HEAD:
  `bc877895ab9de6966a0d4d153370291fa833ec18`.
- Exact official PocketRisu target:
  `85a65f3137b45c8de4a8d21a9887be213b1ac3fc`, package `pocketrisu 1.9.0`.
- Pristine target `package.json` SHA-256:
  `b51113c4eb494438dcaa7acd0220d0a03d63ba4d671ec2c1addee0a65c5dd797`.
- Pristine target `pnpm-lock.yaml` SHA-256:
  `92e8cc33d73f508f6c90710c9b15c766dd54c24cd770dcf67f10b06cdee3d36f`.

Observed owner graphs:

| Selection | Resolved K04 owner | Active K04 units | Compatibility | Collisions |
| --- | --- | ---: | --- | ---: |
| `toolchain-hardening` | absent | 0 | verified | 0 |
| `pocketrisu-kei` | `kei-prompt-role-compat-core` | 3 | verified | 0 |

The umbrella graph resolved 15 packs and planned 55 changed paths. Its K04
order was export → typed fallback → owned test.

## Observed automated gates

- Focused patcher graph/contract suite: five test files passed.
- Complete patcher suite: 32/32 test files passed after the final target-test
  expansion.
- Exact-1.9 target Vitest:
  `promptRoleCompatibility.test.ts` passed 15/15 tests. It exercised native
  precedence for all four typed blocks, absent and null `.role2` fallback for
  all four, native `assistant`/`char` aliases, invalid values, structured-clone
  isolation, and lorebook exclusion.
- Svelte diagnostics: exit 0, 0 errors and four existing warnings in
  `DefaultChatScreen.svelte`; the K04-managed database/test files emitted no
  diagnostic.
- Production build: exit 0 after 7,806 transformed modules. The observed CSS
  highlight, externalized browser module, dynamic-import, plugin timing, and
  large-chunk warnings were outside the K04 database/test delta.
- First umbrella apply changed 55 paths. Status then reported all 15 resolved
  packs current. A repeated apply changed zero paths and skipped the 53
  transaction-managed source paths.
- Empty-selection revert changed the managed graph back and reported clean
  status. The owned target test was absent afterward. The database file
  returned to SHA-256
  `9e95e5f74cae21579a6dfec2c19885a471945616882b7237f155dee7b097c750`,
  mode `0600`, and size 108,070 bytes, matching the recorded baseline; tracked
  source diff was zero.
- Exhaustive combination verifier: exit 0; 2,048/2,048 raw selections, 1,024
  normalized graphs, 205 managed paths, maximum 478 resolved units, two
  workers, and `roundTrips: passed`.

The verifier result is composition and transaction evidence, not browser
feature intent or publication qualification.

## L2.5 runtime audit

### Phase 1 — flat discovery

- database-level prompt-template normalization on load;
- bot-preset prompt-template normalization on load;
- prompt-template normalization when saving the current preset;
- prompt-template normalization during preset activation;
- JSON/Risu/ST preset import normalization;
- native structured cloning and source-object mutation isolation;
- the four approved typed block discriminants;
- native `.role2` precedence over a conflicting frozen `.role`;
- invalid but present `.role2` normalization;
- absent and null `.role2` fallback from frozen `.role`;
- native `assistant` and `char` aliases and invalid-role `system` fallback;
- repeated normalization and persisted-property growth;
- runtime persona, description, author-note, and memory role application;
- lorebook, plain/jailbreak/CoT, cache, and missing-role behavior;
- the newly exported normalizer symbol and all static consumers;
- exception propagation from structured cloning and property access;
- CPU and memory work per normalized prompt item;
- timers, listeners, network, filesystem, browser storage, plugin arrays,
  credentials, provider selection, custom/local endpoints, and code execution;
- exact-target pack activation, composition, owned-test lifecycle, and revert.

### Phase 2 — external-anchor resolution

- **Entry boundaries — structural.** Newly read applied source calls the same
  normalizer for top-level load (`database.svelte.ts:213-215`), each loaded bot
  preset (`548-552`), current-preset save (`2542`), activation
  (`2614-2623`, `2660`), direct preset import (`2993-3021`), and converted ST
  import (`3148`). Load/import conditions were resolved at their array or
  presence guards; activation deliberately passes the candidate value and the
  native normalizer returns null for a non-array. A full source reference
  search found only these native calls, the function itself, and the owned
  test. The adversarial alternative—an unnormalized static caller—was not
  found. Dynamic dispatch was rechecked: the export is not registered in an
  event, plugin, string-key, or callback table.
- **Native precedence — structural plus measured test.** The break scenario is
  `{role2:'user', role:'assistant'}` being overwritten by legacy `.role`.
  Applied source tests non-null `.role2` first and normalizes it at
  `database.svelte.ts:3203-3205`; the fallback is an `else if` at `3206-3208`,
  so it cannot run for that item. All four typed discriminants share this
  branch at `3198-3201`. Target tests measured all four. An invalid but present
  `.role2` also remains authoritative and becomes `system`, rather than
  falling through to a valid legacy value.
- **Frozen fallback — structural plus measured test.** The break scenario is a
  frozen typed item with `.role:'assistant'` and no `.role2` remaining ignored
  by runtime generation. The nullish `.role2` path passes that exact legacy
  value to the native normalizer (`3206-3208`); native aliases map
  `assistant`/`char` to `bot` and unknown values to null (`3162-3169`), after
  which the existing `system` fallback applies. Target tests measured absent
  and null `.role2` for every approved type and the alias/invalid cases.
- **Clone, mutation, and idempotency — structural plus measured test.** The
  normalizer rejects non-arrays, then uses `safeStructuredClone()` before the
  loop (`3182-3187`). The target test observed a distinct output item and an
  unchanged input. After one fallback, the result has `.role2`; a second pass
  follows the native-precedence arm and writes the same normalized value.
  Therefore repeated load/save does not append state or add another schema.
  The cloning operation can throw, but that was already the first operation
  in this native owner; K04 adds no catch that could swallow failure and no
  side effect before the successful clone within this function.
- **Runtime consumption — structural.** Applied runtime source maps native
  `bot` to provider-facing `assistant` in `applyPromptBlockRole()` and returns
  only when `.role2` is absent (`index.svelte.ts:593-607`). Persona,
  description, author-note, and memory paths pass `card.role2` at
  `635`, `646`, `658`, and `1317` (with parallel prompt-info paths at
  `1164`, `1179`, and `1195`). This closes the legacy-loss scenario after
  normalization without changing downstream tokenizer, provider, request, or
  error paths. Those downstream operations may fail under their existing
  contracts; K04 neither catches nor continues past such failures.
- **Excluded roles and schemas — structural.** The managed switch names only
  persona, description, author-note, and memory. The adjacent native plain,
  jailbreak, CoT, and cache arms remain byte-identical (`3192-3197`,
  `3212-3214`). Lorebook has no normalizer arm and runtime handles it in a
  separate branch without role application (`index.svelte.ts:668-670` and
  `1209-1210`). `PromptItem` continues to declare only native `.role2` for
  typed items (`prompt.ts:36-48`); no identity, database, or plugin schema was
  added.
- **Resources and external effects — structural N/A with adversarial
  recheck.** The runtime delta is one conditional property read/write inside
  an existing finite template loop. A search of the K04 pack found no fetch,
  timer, listener, socket, abort controller, filesystem/browser-storage write,
  `setDatabase`, plugin array, eval, or dynamic-function surface. The
  counterexample of an indirect effect through the new export was rechecked
  against all references and found only the owned test. Per-call work remains
  linear in the existing template length; one existing item property is
  overwritten, not accumulated or retained separately.
- **Pack and revert — measured.** Owner-absent and owner-present plans, target
  apply/status/reapply/revert, exact database bytes/mode, owned-file removal,
  complete patcher tests, target diagnostics/build, and all 2,048 raw catalog
  selections were observed as recorded above.

### Phase 3 — triage

- **Q3, fixed:** frozen Kei typed `.role` data now reaches the native `.role2`
  owner at every native normalization boundary.
- **Q3, fixed:** the first focused test covered fallback on only two typed
  variants; independent review surfaced the gap, and the final target test now
  executes absent/null fallback for all four.
- **Q3, resolved by observed gates:** exact-target semantics, compile/build,
  owner graphs, idempotent apply, and exact revert passed the gates above.
- **Q1, no new runtime owner:** no timer, resource, I/O, provider, plugin,
  storage, or parallel-schema leaf remains from this K04 delta.
- **Q4, prepared aggregate surface:** a real browser prompt preview/generation
  has not yet demonstrated the visible role of an imported frozen preset.
  This is retained as an aggregate L3 item rather than inferred from detached
  compilation.

### Prepared surface

1. **Claim:** a frozen imported typed role is visible in a real prompt while a
   conflicting native `.role2` still wins.
2. **Resolved:** every normalization boundary, role mapping, all four typed
   branches, focused Vitest, diagnostics, and build are closed above.
3. **Missing link:** no browser/provider prompt-preview observation was made in
   this session.
4. **Why unavailable here:** the authorized scope excludes live apply and the
   final consolidated iPhone L3 is intentionally deferred.
5. **Aggregate check:** import a disposable preset containing all four typed
   legacy roles, including one conflicting native `.role2`, activate it, and
   inspect the prompt preview/generated request. Legacy-only items must use
   the normalized role, the conflict must use `.role2`, and lorebook must not
   gain role behavior. Reversal of any of those signals is unsafe.

### Cross-piece integration check

K04 currently composes with every existing catalog owner through the observed
2,048-selection gate, including `preset-integrity`; no collision was added.
That proves graph and transaction composition, not future semantic interaction
with K17/K22/K23/K26/K27/K29. The final aggregate audit must revisit those
cross-piece interactions after their isolated commits.

## Aggregate-only L3 status

The prepared K04 scenario above is documentation only. It was not requested
from the user and no L3 result is recorded in this receipt.
