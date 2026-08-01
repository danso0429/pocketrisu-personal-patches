# PocketRisu 1.9 Kei K12 translation-tools validation

Date: 2026-08-01 KST

## Result and boundary

K12 is qualified as an exact-target adaptation for PocketRisu 1.9.0. The
1.8.1 implementation and behavior receipt remain intact in the preserved
worktree; this port adds target-scoped 1.9 units instead of changing the
historical graph.

The retained K12 outcomes are:

- progressive LLM translation-cache list/search/copy/edit/delete;
- explicit preview and a separate confirmed deletion for possible unused
  entries;
- complete persisted-entry identity (`storageKey + key + observed value`)
  for mutation;
- same-tab mutation serialization, volatile generated-value precedence,
  null-prototype export, and cancellation through cache, batching, provider,
  and ChatBody paths;
- K15 translated-partial-edit CAS, including a conditional compensating
  restore that cannot overwrite a newer value;
- one base or BG adapter while existing provider, storage, lazy hydration,
  generation, BG result/claim/ACK, and plugin-array owners remain unchanged.

The detailed behavior, counterexamples, destructive-action boundary, and
prepared surfaces are recorded in the historical
`docs/POCKETRISU-KEI-K12-VALIDATION.md` receipt in the preserved 1.8.1
worktree. This receipt records what changed and what was revalidated on 1.9.

No live tree was modified, no process was restarted, no provider request or
user cache was used, and no push, tag, release, or installer rebuild was
performed.

## Official 1.9 overlap and adaptation

Official 1.9 changed five K12 host anchors:

1. DeepL, DeepLX, and experimental Google requests gained
   `logCategory: 'translate'` and `logSource: 'translate'`;
2. `translateLLM` gained the original-text `cacheKey` correction;
3. K14's exact-1.9 ChatBody render owner uses
   `isOptimizedStreamingMessage` and target-scoped markers.

The 1.9 graph therefore has five exact replacement units. It preserves all
three logging pairs while adding the K12 abort signal, consumes K14's exact
1.9 completion boundary, and retains exactly one `const cacheKey = text` in
the composed LLM runtime. The cache-key correction remains an upstream 1.9
outcome; K12 does not add a second correction or claim it as a Kei delta.

The first diagnostic run found one adaptation defect: the exact-1.9
ChatBody unit called the zero-argument task-controller `begin` method with
`sourceData`. The unit was corrected to `begin()`, a regression assertion was
added, and both target diagnostics were rerun.

## Pack and target graph

| Pack | Version | Unit graph | SHA-256 ETag |
| --- | --- | ---: | --- |
| `kei-translation-tools-core` | `0.2.0` | 10 owned units, verified on 1.8.1 and 1.9.0 | `ee2dc8abb800585b721d83462bc0e9488910c931b89de8323fe4a3efdc897016` |
| `kei-translation-tools-base-adapter` | `0.2.0` | 46 exact-1.8 + 46 exact-1.9 units | `0f75690cfc8926b44739725f2647d4115be3ab22fb9d495e65e505b4086eab61` |
| `kei-translation-tools-bg-adapter` | `0.2.0` | 46 exact-1.8 + 46 exact-1.9 units | `0c3a365bea4db132aed97350c79ee1b7bfd66ad2ede65d1bf13c6f4fa4546a8a` |
| `kei-partial-edit-core` | `0.3.0` | four owned units with expected-value CAS | `f0589935184c58b6c4987b027c16477dde714ec367d12c719fba284d667c2cb7` |

Every adapter unit targets exactly one PocketRisu version. Dependencies
between exact-1.9 K12 units and K14 ChatBody units are also target-scoped.
An exact-1.8.1 plan selected 78 units across 20 source paths, selected no unit
whose ID ends in `:1.9`, and reported zero collisions.

## Observed exact-1.9 gates

The focused base graph resolved K12, K14, and toolchain packs into 81 units
and 23 managed source paths with zero collisions. The focused lazy+BG graph
resolved 292 units across 129 managed source paths. Its three collisions were
the previously declared and ordered lazy/BG owners; no K12 unit participated.

| Gate | Base | Lazy + BG |
| --- | --- | --- |
| K12/K14 focused frontend | 5 files / 42 tests passed | 5 files / 42 tests passed |
| Full frontend | 74 files / 1,082 passed / 3 skipped | 103 files / 1,343 passed / 3 skipped |
| Svelte diagnostics after the fix | 0 errors / 4 upstream `DefaultChatScreen` warnings | 0 errors / 0 warnings |
| Production build | 7,800 modules; completed | 7,831 modules; completed |
| Applied status | `current`, 0 non-current files | `current`, 0 non-current files |
| Repeated plan | 0 changed files | 0 changed files |
| Exact revert | 24 transaction files; `clean`; tracked diff 0 | 130 transaction files; `clean`; tracked diff 0 |

The complete server suite passed 6 files / 123 tests. The initial sandboxed
run was not a product result: localhost `listen` returned `EPERM`; the same
suite passed when localhost test access was allowed. The BG bundle rebuilt to
8,176 KB and its load check observed `sendChat=function`; the existing KaTeX
quirks warning remained.

The patcher suite passed 31/31 test files. Manifest syntax checks, the K12
contract assertions, target logging/cache/render inspection, and exact
revert checks passed. Generated `dist/` installers are still older than the
current source graph and are not a deliverable until the final aggregate
rebuild.

## L2.5 runtime audit

### Phase 1 — flat discovery

- target selection, adapter exclusivity, anchors, ordering, state, ETags,
  repeated plan, and revert;
- existing prefix/hash/payload compatibility, official cache-key behavior,
  generated/management/K15 writers, CAS, failure ordering, import/export,
  clear, and notifications;
- progressive list/search, exact edit/delete, saved-source hydration,
  preview-only candidate scan, explicit destructive action, cancellation,
  partial progress, and stale panel ownership;
- task replacement, delays, cache/storage waits, DeepL, DeepLX, Google,
  Bergamot, LLM requests, batching, ChatBody retry/render, and unmount;
- K14 optimized-stream completion, K15 message/cache identity, lazy-chat
  hydration, persistent KV, provider/custom endpoint behavior, and BG
  request/result/cancel ownership;
- request logging fields, private text, full-cache/chat/import scale,
  cross-tab state, iPhone suspension, keyboard, scrolling, rotation,
  clipboard, and destructive confirmations.

### Phase 2 — external anchors

- **Graph lifecycle:** exact target metadata and the 46/46 unit split are
  asserted in `test/kei-translation-tools.test.cjs`. Fresh plans, current
  status, zero-change replans, and exact tracked restoration were observed
  for base and lazy+BG targets.
- **Official 1.9 preservation:** the three changed provider units assert and
  retain both request-log fields. The exact LLM anchor contains upstream's
  original-text key correction, while the managed runtime contains one cache
  key. The ChatBody unit depends on K14's exact-1.9 translation gate and uses
  `isOptimizedStreamingMessage`.
- **Identity and failure behavior:** focused cache-store and K15 identity
  tests cover changed/missing entries, storage-key mismatch, mutation order,
  volatile persistence failure, clear failure, special object keys, stale
  rollback, and a later generated value. K12 supplies expected-value CAS but
  does not replace K15's message/DOM identity owner.
- **Management and deletion:** the panel separates scan, preview, delete,
  and confirmation; exact identity is reread before every mutation. Lazy
  placeholders fail closed, and cancellation retains partial progress.
- **Cancellation and providers:** focused task/batch tests cover arbitrary
  abort reasons, queued rejection, marker-count fallback, and resolver
  bounds. Applied-source inspection and successful diagnostics/builds anchor
  the caller chain through the changed providers and ChatBody.
- **Authority preservation:** K12 contains no second provider selector,
  custom endpoint, local LLM, database replacement, lazy hydration owner,
  BG operation/result/claim/ACK store, Revenant path, or plugin-array write.
  The composed BG bundle and ordered graph retain the established owners.

### Phase 3 — triage

- Q1 fixed in this port: exact-1.9 anchors now preserve request logging,
  upstream cache-key behavior, and K14's optimized-stream state; the invalid
  task-controller argument found by diagnostics was removed.
- Q2: no K12 graph, identity, storage, or BG-authority blocker remains in the
  measured exact-1.9 base and lazy+BG graphs.
- Q3: target-contract tests now break on lost logging fields, a duplicated
  cache key, non-exact K14 dependency, old streaming state, or a nonzero
  `begin` argument.
- Q4 prepared surfaces remain the historical K12 boundaries: raw-text cache
  namespace; nontransactional prefix clear; incomplete unused-source
  knowledge and non-atomic scan/delete; underlying lazy/Bergamot continuation;
  provider-specific background lifetime; full-cache/import scale;
  cross-tab/device TOCTOU; physical iPhone UI; DeepLX marker ambiguity; and
  memory-only generated values after persistence failure.

These prepared surfaces are limitations, not unobserved claims silently
promoted to success. K12 adds no raw-content logging; official 1.9's bounded
request-log owner and the separate K27 privacy-policy question remain outside
this feature.

## Consolidated iPhone L3 boundary

K12 is not L3-passed. The consolidated session must still exercise its own
scenario:

1. With the existing LLM translator, confirm import/export/clear remain and
   the cache panel appears below them.
2. Search original and translated text; reveal/copy/edit one entry; confirm
   the exact translated chat refreshes without changing the original.
3. Attempt a stale edit after producing a newer value for the same raw key;
   it must refuse rather than overwrite.
4. Delete one disposable entry, cancel a second confirmation, and confirm
   only the explicitly confirmed entry changed.
5. Run and cancel the unused-candidate scan, rerun it, inspect the warning and
   preview, and do not use real user cache as a destructive fixture.
6. Supersede or leave a long translation and confirm its late result does not
   replace the current view. Separately background and return on the
   configured BG-supported Gemini/helper route and observe one final result
   with cleared busy state.
7. Stream with auto translation and confirm K14 waits for completion rather
   than translating partial chunks repeatedly.
8. If configured, record DeepLX and Bergamot behavior separately; an absent
   provider is not exercised, not passed.
9. Exercise the largest real cache with keyboard, scrolling, rotation,
   clipboard, cancellation, and destructive confirmations.

Review, the aggregate raw-selection gate, deterministic installer rebuild,
and the consolidated feature-specific L3 observations remain separate
publication gates.
