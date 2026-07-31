# PocketRisu Kei K11 HypaMemory tools validation

Date: 2026-07-31 KST

## Scope and provenance

This receipt covers K11 from the PocketRisu Kei integration catalog:

- preserve PocketRisu 1.8.1's existing HypaMemory search, category, tag,
  bulk-resummary, and automatic-memory behavior;
- add deterministic manual selection of one contiguous unsummarized prefix;
- generate, preview, reroll, cancel, and explicitly apply one manual summary;
- reject missing, duplicated, orphaned, ambiguous, or stale summary
  frontiers instead of silently skipping or restarting;
- apply CBS and the existing optional `editprocess` behavior consistently to
  the manual panel, summary-item reroll, and next-target preview;
- correct the completed/orphaned next-target behavior without creating a
  second generation or storage authority;
- keep base and bg-preserve composition separate. In a bg-preserve graph,
  existing bg-preserve request routing remains the generation owner; K11
  adds no Revenant path, request endpoint, result store, claim/ACK, or
  cancellation owner.

The adaptation was read against PocketRisu Kei revision
`cc1d1b195babd887577ebf943d5e82f01f58135c`. The focused source change is
`36843af785c4c2fb420690337c73d646c0bdb4b2`
(`feat(memory): expand HypaMemory management`), followed by the pinned
`cc1d1b195babd887577ebf943d5e82f01f58135c`
(`hotfix(hypav3): fix CBS display in modal`). The final pinned source and its
HypaMemory dependencies were read directly rather than treating the focused
commit title as evidence.

The target is pristine PocketRisu 1.8.1 revision
`63832a138c14cc7f11364cf7efdcb61950e7894c`. GPL-3.0 source attribution,
the pinned Kei revision, focused revision, and adapted paths are recorded in
`THIRD_PARTY_NOTICES.md`.

This is a focused adaptation, not a whole-modal replacement. PocketRisu
1.8.1 already has the admitted management/search surface, so K11 retains it
and adds only the missing manual workflow plus the frontier/CBS corrections
needed by that workflow. Translation-cache management remains K12.

## Ownership and preservation boundary

The meta pack resolves K11 through three hidden packs:

| Pack | Version | Units | Selection rule | SHA-256 ETag |
| --- | --- | ---: | --- | --- |
| `kei-hypa-tools-core` | `0.1.0` | 4 | required by `pocketrisu-kei` | `c0f419ccfbf3086ef54d2161e6a7430504f5ab436270f917030d25314bcd8972` |
| `kei-hypa-tools-base-adapter` | `0.1.0` | 20 | core present, `bg-preserve` absent | `2d87835fabfcf92ea022bf8cf09af4c3f0501f266abd50093a478b7c963bfb6b` |
| `kei-hypa-tools-bg-adapter` | `0.1.0` | 20 | core and `bg-preserve` present | `1450a99cde8132b311f2ca9f64b04ec7ca406c5fcdaaa7bbc6d73a6ce6d38a90` |

The adapters conflict, and the base adapter is incompatible with
`bg-preserve`, so a resolved graph installs exactly one. The umbrella
`pocketrisu-kei` pack is version `0.7.0`, has ETag
`9233b866d83acac00720a3a031bf8553e80d096e2f425b43606b2c58b1a8ac08`,
requires K19, K13, K14, K16, K11, and K15 cores, and continues to own zero
target files.

The core owns four isolated files:

- `src/lib/Others/HypaV3Modal/keiHypaManualSelection.ts`;
- `src/lib/Others/HypaV3Modal/keiHypaManualSelection.test.ts`;
- `src/lib/Others/HypaV3Modal/KeiHypaManualSummaryPanel.svelte`;
- `src/lib/Others/HypaV3Modal/KeiHypaManualSummaryPanel.test.ts`.

Each adapter touches seven existing hosts:

- `src/lib/Others/HypaV3Modal/utils.ts`;
- `src/lib/Others/HypaV3Modal/modal-footer.svelte`;
- `src/lib/Others/HypaV3Modal/modal-summary-item.svelte`;
- `src/lib/Others/HypaV3Modal.svelte`;
- `src/lib/Others/HypaV3Modal/modal-header.svelte`;
- `src/lang/en.ts`;
- `src/lang/ko.ts`.

The base and bg adapters use the same feature payload. The bg adapter differs
only in graph requirements, conflicts, automatic selection, and ordering
against the existing bg-preserve owner. K11 does not own:

- `src/ts/process/index.svelte.ts`, request transport, or provider adapters;
- bg operation IDs, result storage, claim, ACK, cancel, reconnect, or
  delivery;
- database replacement, lazy-chat hydration, plugin arrays, or preset
  validity;
- translation cache data or translation cancellation;
- the existing automatic HypaMemory scheduler or the existing reactive
  database-save implementation.

## Retained and expected behavior

### Manual-mode entry without management regression

The HypaMemory header receives one localized `ScrollText` toggle with
`aria-label` and `aria-pressed`. It is disabled while bulk resummary is
active. Entering or leaving manual mode clears the modal's transient search,
bulk-selection, category-manager, and tag-manager state so hidden controls
cannot remain active underneath the manual panel.

Manual mode receives the modal's flexible-height layout. Normal summary
search, category, tag, bulk-edit, bulk-resummary, and footer content remain
mounted through the existing branch when manual mode is off. Applying a
manual summary collapses the summary list by the same UI-state owner already
used by the modal.

### Deterministic summary frontier and prefix selection

The selection helper derives one frontier from the current first greeting,
chat messages, and last summary:

- with no summaries, an available selected greeting is position zero and the
  chat messages follow it;
- a prior greeting-only summary advances to the first chat message;
- a prior message summary advances to the message after the one unique final
  `chatMemo`;
- a last summary with no memos, malformed greeting memos, a missing final
  memo, or a duplicated final memo is rejected as orphaned or ambiguous;
- every chat message ID is counted across the whole current chat;
- the first missing or duplicated stable ID blocks that row and every later
  row, preventing a gap in the summary history.

Tapping an eligible row selects exactly positions zero through that row.
Tapping an already selected row truncates the selected prefix before that
row. Arbitrary sparse sets are rejected by the helper. Search filters only
which rows are visible; selecting a later visible row still includes every
eligible hidden predecessor.

### Context and stale-result boundary

Selection is bound to the current character/chat object and ID, page,
selected greeting and greeting index, summaries array and final memo array,
Hypa preset object/index/full JSON signature, process-regex setting, and
every message object/ID/role/data value.

Generation captures a second immutable snapshot of the selected prefix.
Before preprocessing, after every asynchronous preprocessing step, after the
summary request, before reroll, and before apply, K11 re-reads the live
character/chat/preset and recomputes the whole frontier. A changed chat,
greeting, summary frontier, preset, selected message, or a newly introduced
duplicate ID invalidates the operation. Appending a unique later message is
allowed because it neither changes the issued prefix nor makes its IDs
ambiguous.

The operation token and summary state are kept outside Svelte deep proxies.
The processing state is set before the first await, so repeated activation in
the same turn cannot run custom preprocessing twice. Disabling the panel or
destroying it invalidates late results. The underlying existing request is
not aborted by this UI token; that limitation is recorded as prepared
surface S1.

### CBS, optional scripts, and generation

Candidate display first applies the target's existing CBS parser with the
current character, chat index, role, `rmVar: true`, and the correct
`firstmsg` condition. Display failure falls back to raw text instead of
crashing the whole modal.

Generation processes selected messages sequentially. Each message first
receives the same CBS expansion and then, only when the current Hypa preset
enables it, the target's existing `editprocess` script path. Character-role
input becomes the `assistant` OpenAI role expected by the existing Hypa
summarizer. Summary-item reroll uses the same helper, including CBS even
when optional regex processing is off; this retains the pinned Kei CBS
hotfix.

K11 calls PocketRisu's existing `summarize(input)` function. That function
keeps the selected Hypa preset prompt/model behavior, the `memory` submodel
route, custom/reverse-proxy/local-network handling, or the configured local
completion route. K11 does not hardcode a provider or create an alternate
request body.

In a bg-preserve graph, the existing bg-preserve request hooks continue to
tag and preserve supported helper/Gemini requests and whole-pipeline server
work. K11 does not call Revenant or bypass those hooks. This is an ownership
claim, not a claim that every standalone provider request is physically
background-safe; route-specific behavior remains surfaces S1 and S6.

### Preview, reroll, explicit apply, and persistence

A successful request opens a read-only preview. Reroll reuses the exact
captured `OpenAIChat[]` object instead of recomputing CBS/scripts from changed
state. Cancel discards the preview without mutation. Errors remain in the
panel as escaped text.

Apply is enabled only for a nonempty, nonprocessing, current result. One
summary is appended with:

- the returned text;
- exactly the selected prefix's memo sequence;
- `isImportant: false`;
- no category;
- an empty tag list.

The first greeting's `undefined` memo follows the target's existing
serialization behavior and becomes an array `null` on JSON round trip.
Apply does not delete or rewrite an existing summary.

The push enters PocketRisu's existing deep-reactive active-chat save path.
K11 does not claim synchronous disk durability, await a database commit, or
add a competing writer. Existing save retry/requeue behavior and its
remaining failure boundary are recorded as surface S4.

### Next-target correction and existing automatic behavior

The footer and summary-item reroll share the same CBS/first-message helper.
A fully summarized chat now returns no next target instead of falling back to
the greeting. An orphaned or ambiguous last-summary frontier is shown as a
localized error instead of silently restarting at the beginning.

K11 does not replace automatic HypaMemory summarization, existing summary
editing, search, tag/category management, bulk resummary, or the target's
normal summary serialization.

## Audit fixes and harness corrections before the final gates

The adversarial review found and corrected these product issues before the
final results below:

1. the initial snapshot checked only selected messages, so an unselected
   later message could acquire a duplicate selected ID; apply now recomputes
   and validates the full frontier;
2. generation originally reused reactive derived state after entry; it now
   reads one fresh state/frontier before any side effect;
3. two same-turn activations could both enter custom preprocessing before
   `isProcessing` became authoritative; processing is now guarded and set
   synchronously before the first await;
4. selection identity initially omitted in-place mutation of the last
   summary's memo array; it now covers that array and every memo value;
5. an absent memo array was initially represented with a newly allocated
   empty array during comparison, falsely invalidating unchanged selection;
   the stable absent identity is now `null`;
6. close/destroy and reroll behavior lacked direct adversarial coverage;
   focused tests now prove that late results are ignored and reroll receives
   the exact captured input.

Two test-harness defects were also corrected without weakening product
checks:

- an early fixture selected a later body message while leaving the greeting
  unsummarized, contradicting the intended prefix invariant;
- the read-only `<textarea>` assertion inspected `textContent` instead of
  its `value`.

Earlier failing or pre-fix runs are not used as final evidence.

## Patcher checks and deterministic installers

`npm test` passed all 28 patcher test files after the final fixes.

All four generated installers passed `node --check`. Two consecutive builds
produced identical sizes and SHA-256 values:

| Installer | Bytes | SHA-256 |
| --- | ---: | --- |
| `pocketrisu-patcher.cjs` | 3,076,984 | `4a2bfc35c4a1d9c834362d30cb96a5921af63a7df6514bd1e848a657f6f7f2bc` |
| `pocketrisu-features.cjs` | 3,076,990 | `5bdfa7f7fd1c69f2f9057fcfa11aba51ef22d4b8d299436ebbfc3c04619006fb` |
| `pocketrisu-hardening.cjs` | 3,076,991 | `99eb369d9cc1018e16d471114517dafee88f8a897fd1d5d0646f7cbea1e4efb8` |
| `pocketrisu-all.cjs` | 3,076,985 | `84df4ff8805a4d0dd467ab87b4ad34922584c8dedc85d27dffe77674b976e7df` |

Resolver and static contract tests cover core absence, exactly one base/bg
adapter, conflicts, automatic graph selection, unit ownership, prohibited
Revenant/bg-authority changes, ETag participation, pinned attribution,
contiguous prefix rules, full-frontier duplicate checks, mode switching, and
the retained management surface.

## PocketRisu 1.8.1 target checks

No live PocketRisu tree was modified or restarted.

The final focused dynamic run observed:

| Target graph | Test files | Tests |
| --- | ---: | ---: |
| `pocketrisu-kei,toolchain-hardening` | 2 passed | 21 passed |
| `pocketrisu-kei,bg-preserve,lazy-chat-sync,toolchain-hardening` | 2 passed | 21 passed |

Those tests exercise greeting and post-summary frontiers, missing/duplicated
IDs, exact prefix selection, search-hidden predecessors, chat/message/preset
staleness, newly duplicated later IDs, CBS display, sequential processing,
exact-input reroll, same-turn duplicate activation, close/destroy late
results, errors, and one exact apply.

The final complete target suites observed:

| Target graph | Test files | Tests |
| --- | ---: | ---: |
| `pocketrisu-kei,toolchain-hardening` | 72 passed | 1,006 passed, 3 skipped |
| `pocketrisu-kei,bg-preserve,lazy-chat-sync,toolchain-hardening` | 103 passed | 1,291 passed, 3 skipped |

Final diagnostics and builds observed:

| Target graph | Diagnostics | Production build |
| --- | --- | --- |
| `pocketrisu-kei,toolchain-hardening` | 0 errors, 4 existing `DefaultChatScreen.svelte` accessibility warnings | Exit 0; 7,688 modules; 49.04 s |
| `pocketrisu-kei,bg-preserve,lazy-chat-sync,toolchain-hardening` | 0 errors, 0 warnings | Exit 0; 7,719 modules; 49.73 s |

Both builds retained the target's existing dynamic-import, plugin-timing,
large-chunk, and base accessibility warnings. The composed bg-preserve bundle
builder produced an 8,123 KB `server/node/bgOrchBundle.mjs`; its load check
observed `sendChat=function`. The existing KaTeX quirks warning remained.

## Apply, repeat, composition, and exact revert

Fresh disposable targets observed:

| Flow | Resolved packs | Resolved unit order | Managed status files | Second plan | Reapply | Revert transaction files |
| --- | ---: | ---: | ---: | --- | --- | ---: |
| `pocketrisu-kei,toolchain-hardening` | 13 | 127 | 47, all current | 0 changes | `changed: false` | 49 |
| `pocketrisu-kei,bg-preserve,lazy-chat-sync,toolchain-hardening` | 16 | 340 | 150, all current | 0 changes | `changed: false` | 152 |

The revert counts include the patch manager's state and intent files in
addition to the 47 and 150 managed target files. Both reverts ended with an
empty custom selection, clean status with zero managed files, and a
zero-change follow-up plan.

The composed plan retained the three pre-existing ordered collisions:

1. durable global-API save hooks after the lazy-chat global-API replacement;
2. server stream-reader import hooks after the lazy-chat server replacement;
3. no-orchestration plugin `sendChat` hooks after the lazy-chat API-v3
   replacement.

No K11 unit participates in those collisions.

After excluding `.git`, dependency/build outputs, patch-manager/save
artifacts, the generated bg bundle, and the empty generated vendor directory,
checksum/mode/symlink comparison examined 1,022 relevant entries in each
reverted target and found zero differences from pristine PocketRisu 1.8.1.
The exclusions were recorded rather than misreported as managed revert
drift.

The final exhaustive combination verifier observed:

```json
{
  "target": {
    "packageName": "pocketrisu",
    "packageVersion": "1.8.1"
  },
  "compatibility": "verified",
  "visiblePacks": [
    "bg-preserve",
    "character-import-ux",
    "character-organizer",
    "lazy-chat-sync",
    "parser-hardening",
    "persona-organizer",
    "personal-settings",
    "pocketrisu-kei",
    "preset-integrity",
    "startup-cache",
    "toolchain-hardening"
  ],
  "rawSelections": 2048,
  "verifiedSelections": 2048,
  "normalizedGraphs": 1024,
  "managedPaths": 189,
  "maximumResolvedUnits": 425,
  "roundTrips": "passed",
  "workers": 2,
  "compositionCache": {
    "bypasses": 2050,
    "hits": 2047,
    "misses": 2047,
    "stores": 2047
  },
  "pairAnalysisCache": {
    "entries": 951,
    "hits": 272457,
    "misses": 951
  },
  "packEtagCache": {
    "hits": 46545,
    "misses": 47
  },
  "stateEncodingCache": {
    "hits": 2047,
    "misses": 2047
  },
  "timingsMs": {
    "apply": 129608.7,
    "initialPlan": 157786.37,
    "repeatedPlan": 103463.26,
    "revertApply": 118237.3,
    "revertPlan": 70521,
    "snapshot": 16457.64,
    "status": 51804.3,
    "total": 647947.11
  }
}
```

That verifier exercises initial plan, transactional apply, zero-change
re-plan and reapply, current status, empty-selection revert, and exact
managed byte/mode restoration for every raw selection. It is the optimized
patch-combination gate, not the L2.5 runtime audit below.

## L2.5 runtime audit

This section follows `docs/runtime-audit-instructions.md` v2. Phase 1 is a
severity-free discovery list. Weight is assigned only after every leaf is
anchored in Phase 2.

### Phase 1 — flat discovery

- P01. Resolver selection includes the K11 core and exactly one base/bg
  adapter; graphs without the core include neither adapter.
- P02. Pack payloads, anchors, ETags, state, transaction boundaries, and
  revert determine what reaches the target.
- P03. Manual mode toggles inside the existing Hypa modal and is disabled
  during bulk resummary.
- P04. Switching manual mode affects existing search, bulk selection,
  category, tag, and normal-summary UI state.
- P05. Empty-summary modal height, panel scrolling, preview controls, and
  normal modal layout affect usability.
- P06. With no summary, the selected greeting and first chat messages form
  the initial frontier.
- P07. A greeting-only or message-backed last summary determines the next
  frontier position.
- P08. Empty/malformed/missing/duplicated frontier IDs and missing/duplicated
  candidate IDs affect whether any prefix is safe.
- P09. Taps, truncation, search filtering, and hidden predecessors determine
  the exact selected prefix.
- P10. Character, chat, greeting, summary, preset, message, and process-regex
  identity changes can invalidate selection.
- P11. Candidate display and request input run CBS with role, chat index,
  `rmVar`, and `firstmsg` context.
- P12. Optional `editprocess` scripts run sequentially and can include
  configured Lua/plugin/custom-regex behavior.
- P13. Repeated activation in one event turn could otherwise run
  preprocessing more than once.
- P14. Snapshot issuance and live frontier recomputation determine whether a
  result can be previewed, rerolled, or applied.
- P15. `summarize` selects prompt, model, custom endpoint/local routing,
  request shape, and response validation.
- P16. Bg composition must retain bg-preserve request/orchestration authority
  and must not introduce Revenant.
- P17. Processing, preview, reroll, cancel, error, stale, and apply states
  determine mutation.
- P18. Disabling/closing/destroying the panel invalidates UI ownership while
  an existing request can continue.
- P19. One direct summary-array push enters existing reactive persistence
  rather than an awaited K11 commit.
- P20. An `undefined` greeting memo and existing save serialization determine
  its durable array representation.
- P21. Footer next-target and existing summary-item reroll share frontier,
  CBS, and first-message behavior.
- P22. Existing automatic Hypa, search, categories, tags, bulk resummary,
  edit, and reset behavior remain callable.
- P23. Full-chat ID counting, candidate mapping/CBS display, context arrays,
  search, and preset serialization consume CPU and memory.
- P24. Selected input and configured prompts can be large and can incur
  provider request cost or limits.
- P25. Sequential preprocessing and the summary request cross asynchronous
  boundaries on the UI event flow.
- P26. Operation tokens, request closures, arrays, and component state affect
  resource lifetime.
- P27. Applied summaries are user data that grow over time; caches and K11
  transient state need bounded ownership.
- P28. User text, provider errors, localized strings, JSON, and first-message
  null conversion affect encoding and display.
- P29. iPhone scrolling, search, touch targets, keyboard, rotation, modal
  height, suspension, and return are physical runtime behavior.
- P30. Summary content and provider errors are private user text; HTML
  interpretation, logs, endpoints, credentials, and filesystem access affect
  the security boundary.
- P31. CBS/script/summarize/persistence failures and in-flight state changes
  determine failure and recovery behavior.
- P32. K19/K13/K14/K16/K15, bg-preserve, lazy-chat, existing Hypa, provider,
  and storage owners form the cross-piece composition.
- P33. Focused/full tests, diagnostics, builds, apply/reapply/status/revert,
  deterministic installers, and all combinations exercise the lifecycle.

### Phase 2 — external-anchor resolution

#### Graph and installation lifecycle (P01–P02, P32–P33)

Type: structural plus measured artifacts.

Break scenario: both adapters install, an adapter appears without the core,
the base adapter patches a bg graph, an owned-file payload does not affect
its ETag, or revert restores text but not a file mode.

- Core ownership is declared in
  `patches/kei-hypa-tools-core/manifest.cjs:9-43`.
- Shared adapter requirements, conflicts, and `autoWhen` conditions are in
  `patches/kei-hypa-tools-core/adapter-manifest.cjs:3-29`; the two adapter
  entry manifests pass only the base/bg graph difference.
- Catalog/resolver/static tests exercise absent, base, and bg graphs,
  exclusivity, ownership, prohibited authorities, ETags, and attribution.
- Installer hashes, both fresh target lifecycles, the 1,022-entry source
  comparisons, and the 2,048-selection verifier are measured above.

The dynamic-dispatch counterexample is a hidden adapter selected only by
`autoWhen`. Both conditions include the K11 core; the base condition also
requires `bg-preserve` to be absent, and the adapters conflict. Resolver
absence/exclusivity tests close that path.

#### Modal entry, coexistence, and layout (P03–P05, P22, P29)

Type: structural with physical browser leaves.

Break scenario: manual mode remains available during a bulk request; hidden
search/tag/category state mutates underneath it; an empty modal collapses the
panel; normal management controls disappear after leaving manual mode; or
the keyboard covers all action buttons.

- Mode state and switching reset are generated at
  `adapter-manifest.cjs:302-346`.
- Flexible-height and header props are generated at `:349-377`.
- The manual panel wraps only the existing normal scroll/bulk branch at
  `:379-423`.
- The localized pressed/disabled button is generated at `:425-500`.
- The panel uses one bounded flex column, wrapping controls, and its own
  overflow list in
  `KeiHypaManualSummaryPanel.svelte:435-590`.
- Static and component tests retain the existing management anchors and
  exercise manual-mode switching.

Svelte/DOM evidence does not establish Safari keyboard, viewport, or touch
behavior. Those links remain surface S5.

#### Frontier and prefix integrity (P06–P09, P20–P21)

Type: structural plus focused dynamic tests.

Break scenario: an orphaned summary silently restarts at the greeting; a
duplicate final memo chooses the first match; a missing ID is skipped; a
later duplicate appears after selection; or filtering lets a visible message
be summarized without hidden predecessors.

- Greeting and last-summary frontier derivation is in
  `keiHypaManualSelection.ts:42-108`.
- Whole-chat ID counting and the first blocked suffix are at `:110-174`.
- Exact prefix toggling and sparse-set rejection are at `:177-209`.
- Snapshot validation recomputes the complete current frontier and compares
  every issued prefix member at `:253-300`.
- The UI filters rendered candidates only after frontier positions are
  assigned and delegates taps back to prefix selection at
  `KeiHypaManualSummaryPanel.svelte:117-163,223-236`.
- Footer and summary-item integration use the shared helper at
  `adapter-manifest.cjs:31-285`.

Focused tests cover no-summary, greeting-only, prior-message, complete,
orphaned, ambiguous, missing, duplicated, sparse, hidden-prefix, and
later-duplicate cases. The counterexample found during audit—an unselected
later message duplicating a selected ID—is the reason current validation
derives the whole frontier instead of comparing selected rows alone.

#### Context, operation, and apply integrity (P10, P13–P14, P17–P18)

Type: structural plus focused dynamic tests.

Break scenario: a chat or preset changes after selection; the summaries array
or final memo mutates in place; a selected object is replaced with the same
text; two taps launch two script passes; a panel closes while the request is
pending; or a late result applies to the new context.

- Current state requires the exact active character/chat and the exact
  `hypaV3Data.summaries` array at
  `KeiHypaManualSummaryPanel.svelte:64-115`.
- Selection context covers references, IDs, full preset serialization,
  summaries/final memos, and every message reference/ID/role/data at
  `:153-205`.
- Snapshot capture and live validation are at `:238-270` and
  `keiHypaManualSelection.ts:211-300`.
- Processing is synchronously guarded before the first await at
  `KeiHypaManualSummaryPanel.svelte:307-340`.
- Every preprocessing await and summary result checks both the token and
  snapshot at `:278-367`; reroll/apply repeat validation at `:369-446`.
- Disabling, canceling, and destroy invalidate operation ownership at
  `:207-221,448-473`.

Tests replace messages, mutate content/frontiers/greetings/presets, append a
later duplicate, double-activate, destroy with a pending request, and verify
that only the exact current result can add one summary. Closing does not abort
the underlying existing request, so request lifetime remains S1 rather than
being described as cancellation.

#### CBS, configured scripts, and side effects (P11–P12, P21, P25, P31)

Type: structural, with user-configured callback effects.

Break scenario: first-message CBS renders as ordinary chat; summary reroll
skips CBS when regex is off; variable directives persist while only
previewing; scripts run in parallel/out of order; or a script mutates state
before a later stale check.

- `processMessageCBS` supplies character, index, role, `rmVar: true`, and
  `firstmsg`; `processHypaV3Message` then optionally awaits one existing
  `editprocess` call at `adapter-manifest.cjs:53-133`.
- Manual generation awaits that helper once per selected candidate in order
  at `KeiHypaManualSummaryPanel.svelte:278-304`.
- Candidate display uses CBS with raw-text fallback at `:125-142`.
- Summary-item reroll always calls the shared CBS helper at
  `adapter-manifest.cjs:256-285`.
- The target script owner dispatches Lua, plugin, CBS, and custom-script
  behavior in `src/ts/process/scripts.ts:99-220`; its cache is capped at
  1,000 entries at `:82-87`.
- The CBS variable owner honors `rmVar` for add/set/default persistent
  variables in `src/ts/cbs.ts:796-840`.

Sequential await and post-await identity checks stop a stale summary write,
but they cannot undo an intended configured script side effect that already
ran. Avoiding the existing `editprocess` contract would change behavior, so
that boundary remains S2.

#### Existing summarize route and bg ownership (P15–P16, P24, P31–P32)

Type: structural plus base/composed target tests and build artifacts.

Break scenario: K11 hardcodes a provider, bypasses custom/local routing,
introduces a Revenant call, starts a second bg operation, or claims
background preservation for a route that the existing owner does not
preserve.

- K11 imports and calls only the target's existing `summarize(input)` at
  `KeiHypaManualSummaryPanel.svelte:7-14,342-347,369-410`.
- The target function builds the configured prompt, routes a `memory`
  submodel through `requestChatData`, retains reverse-proxy/custom/local
  handling, or uses the configured completion model at
  `src/ts/process/memory/hypav3.ts:1684-1788`.
- The K11 manifests contain no Revenant, fetch, socket, endpoint, operation,
  claim, ACK, cancel, or result-store unit.
- The existing bg-preserve request adapter tags helper requests with no
  chat ID and retains supported Gemini subrequest/server-job behavior in its
  owned request/global-API units. K11's bg adapter changes graph composition
  and anchors only.
- Base and bg/lazy focused/full suites, production builds, and the composed
  bg bundle load are measured above.

The supported-route evidence establishes preservation ownership, not
universal standalone-background behavior across every configured provider.
That physical/provider link remains S6.

#### Request lifetime, CPU, memory, and growth (P18, P23–P27)

Type: structural with unmeasured user/device distributions.

Break scenario: a second click spawns duplicate preprocessing, a closed panel
retains a result forever, full-chat work becomes quadratic, a huge prompt
blocks the UI or exceeds provider limits, or summaries/caches grow without an
identified owner.

- One raw summary state and one operation token exist at a time at
  `KeiHypaManualSummaryPanel.svelte:58-62`.
- Context/frontier work traverses current summaries/messages and serializes
  the selected preset at `:76-195`; filtering traverses the candidate list at
  `:143-152`.
- Input preprocessing is sequential over only the selected prefix at
  `:278-304`.
- Disable/reset drops selections, context, summary state, and active-token
  ownership at `:207-221`; destroy invalidates late delivery at `:473`.
- K11 creates no timer, interval, listener, socket, fetch, global map, or
  persistent cache.
- The existing script cache has a 1,000-entry cap. Applied summaries are
  functional user data, one per explicit apply, and K11 does not delete or
  cap them.

The work is linear in the current chat/preset/input sizes, but actual iPhone
latency, configured prompt size, provider token limits/cost, and pending
request duration are not established by code. They remain S1 and S3.

#### Persistence, encoding, privacy, and failure (P19–P20, P28, P30–P31)

Type: structural with an existing external persistence owner.

Break scenario: preview mutates the database; apply adds more than one
summary; a stale or failed request is treated as success; user text is
rendered as HTML or logged by K11; an `undefined` memo is silently dropped
from the middle of the durable array; or the existing save permanently
fails.

- The only K11 database mutation is one guarded `summaries.push` at
  `KeiHypaManualSummaryPanel.svelte:412-446`.
- Preview uses a read-only textarea and error/result text uses ordinary
  escaped Svelte interpolation at `:475-590`.
- The target save decoder converts array `null` back to `undefined` in
  `src/ts/process/memory/hypav3.ts:1623-1646`.
- The base target deep-touches the active chat and schedules the existing
  save at `src/ts/globalApi.svelte.ts:607-640`; failed saves enter the
  existing requeue/retry path at `:643-659,1049-1087`.
- K11 adds no endpoint, filesystem operation, credential access, raw-HTML
  rendering, content log, or network transport.

The K11 panel neither awaits nor reports the existing database commit.
Therefore “one in-memory summary is appended to the active chat” is
supported; “the disk commit completed before the panel closed” is not.
Durability remains S4.

### Phase 3 — triage

- Q1 fixed during the audit: stale selection from an in-place memo mutation,
  a later duplicate ID missed by selected-only checks, fresh-state drift at
  generation entry, and duplicate same-turn preprocessing.
- Q2: no K11-created graph/ownership blocker remains in the measured base and
  bg/lazy compositions. Provider routing, bg operation/result/cancel,
  automatic Hypa, reactive database save, preset validity, translation
  caches, and plugins retain their existing owners.
- Q3 fixed during the audit: the unstable empty-memo identity, exact reroll
  and destroy-late-result coverage, and two inaccurate test fixtures. The
  existing target/build warnings remain recorded rather than attributed to
  K11.
- Q4 prepared surfaces: S1 non-aborted pending requests, S2 configured script
  side effects before stale detection, S3 long-chat/preset/input cost, S4
  non-awaited existing persistence, S5 physical iPhone modal/input behavior,
  and S6 provider-specific background preservation.

### Prepared surfaces

#### S1 — close/destroy does not abort an existing summary request

1. Claim: disabling or destroying the panel prevents a late result from
   mutating or reopening K11 state.
2. Resolved: operation-token invalidation and a pending-request destroy test
   prove that a late result is ignored.
3. Blocked link: PocketRisu's existing `summarize` API takes no K11-provided
   `AbortSignal`, so the underlying provider request can continue.
4. Limitation: request cost and its closure/resources remain until the
   existing request settles; K11 does not claim network cancellation.
5. Review method: in L3, start a manual summary, close manual mode, wait for
   the provider to finish, and reopen it. A late preview or applied summary
   reopens a K11 bug; provider billing despite closure confirms the recorded
   non-abort limitation.

#### S2 — configured `editprocess` side effects before stale detection

1. Claim: K11 validates identity after every configured script step and
   never applies a stale summary result.
2. Resolved: sequential processing and post-await snapshot checks are
   code-anchored and focused tests reject stale application.
3. Blocked link: an existing Lua/plugin/custom `editprocess` callback can
   intentionally mutate application state before the await returns.
4. Limitation: a later stale check cannot undo that callback side effect.
   Skipping the callback would violate the enabled Hypa preset's existing
   `processRegexScript` behavior.
5. Review method: if a preset uses a stateful `editprocess` rule, run one
   manual preview and inspect the configured variable/message effect even
   after cancel. Unexpected duplicate execution reopens K11; one intended
   execution is the retained script contract.

#### S3 — long-chat, preset serialization, prompt size, and provider cost

1. Claim: K11 bounds selection to one prefix and uses linear traversals, but
   it reads the full current chat and serializes the full selected preset for
   identity.
2. Resolved: the frontier, context, filter, and sequential-input loops are
   code-anchored; no nested whole-chat generation loop was found.
3. Blocked link: real chat length, preset size, input token count, provider
   price/limit, and iPhone CPU/memory are user/runtime data.
4. Limitation: a safe universal cap would change selectable content or
   summary quality and is not a same-effect rewrite without product design.
5. Review method: in L3, use the longest available chat, search and scroll,
   select a practical prefix, and observe responsiveness/provider rejection.
   A repeatable UI stall or limit error reopens measurement before redesign.

#### S4 — direct summary push relies on existing reactive persistence

1. Claim: explicit apply adds exactly one current summary and delegates save
   ownership to PocketRisu's existing reactive persistence path.
2. Resolved: the one guarded push, active-chat observation, and existing
   retry/requeue code are anchored; focused tests prove one in-memory
   mutation and no preview mutation.
3. Blocked link: K11 receives no promise for the eventual database commit and
   cannot prove immediate durable storage from the panel.
4. Limitation: a permanent existing storage failure can leave the in-memory
   summary unsaved even though K11 correctly avoided a competing writer.
5. Review method: after apply, wait for ordinary save activity, close/reopen
   the app, and verify the summary remains. Loss after reload reopens the
   existing persistence path; adding a K11 writer is not the default fix.

#### S5 — physical iPhone modal, touch, keyboard, and suspension behavior

1. Claim: the manual panel exposes touch-sized rows/buttons, a scrollable
   list, search, preview, reroll/cancel/apply, and stale-state messages.
2. Resolved: markup, accessibility state, flex/overflow layout, component
   tests, diagnostics, and production builds are anchored above.
3. Blocked link: Safari touch arbitration, virtual-keyboard resize, viewport
   rotation, modal portals, suspension, and return were not exercised by the
   local DOM.
4. Limitation: those are browser/OS behaviors outside the disposable Node
   process.
5. Review method: execute the consolidated iPhone L3 below. Covered buttons,
   lost selection, background-applied results, wrong-row taps, or unusable
   scrolling reopen this surface.

#### S6 — provider-specific standalone background preservation

1. Claim: K11 adds no Revenant or second bg authority and continues through
   the existing `summarize` and bg-preserve request hooks.
2. Resolved: manifests contain no generation authority; composed tests/build
   and bg bundle load pass; existing Gemini/helper routing is code-anchored.
3. Blocked link: not every configurable provider/local/custom route has the
   same server-job/background behavior, and no physical iPhone provider
   request was run locally.
4. Limitation: ownership preservation does not imply universal
   background-completion for every standalone manual summary route.
5. Review method: in L3, use the actually configured bg-supported/Gemini
   memory route, start a summary, background the PWA, and return. A duplicate
   request, Revenant/new chat insertion, or lost supported-route result
   reopens K11/bg composition; another provider needs its own measured claim.

## Consolidated iPhone L3 scenario — not yet passed

The user chose one consolidated L3 session after the remaining local Kei
integrations. K11's child gate remains separate inside that session:

1. Open a character chat with HypaMemory enabled, open the HypaMemory modal,
   and confirm existing search, category, tag, bulk-resummary, edit, and
   automatic-memory controls still appear in normal mode.
2. Tap the new `ScrollText` manual-summary button. Confirm bulk resummary
   cannot overlap the mode and the message list/search fit the modal.
3. In a chat whose greeting or early messages are unsummarized, tap a later
   eligible message. Confirm every earlier eligible row is selected and the
   count matches the prefix.
4. Search for a later message and select it while earlier rows are hidden.
   Confirm the earlier hidden prefix is still included.
5. Generate a summary. Confirm one processing state becomes one read-only
   preview. Reroll once and confirm the preview changes without rerunning
   visible CBS/script side effects; cancel once and confirm no summary is
   added.
6. Generate again and apply. Confirm exactly one summary is added for the
   selected prefix and the footer's next target advances to the following
   message. In a fully summarized chat, confirm it reports no next message
   instead of showing the greeting again.
7. If a test chat with a missing or duplicated message ID is safely
   available, confirm that row and its suffix cannot be selected. If the last
   summary points to a missing/duplicated ID, confirm a visible error rather
   than a restart from the beginning.
8. Start another preview, then change the chat, selected greeting, selected
   message, final summary frontier, or Hypa preset before the result returns.
   Confirm the result becomes stale and cannot apply to the new context.
9. With CBS variables and a first-message condition configured, confirm
   greeting/message display and the summary input reflect them. Preview
   alone must not persist add/set/default variables because `rmVar` is used.
   A user-configured `editprocess` script can retain its own intended side
   effects as described in S2.
10. In the longest available chat, exercise search, prefix taps, scrolling,
    virtual-keyboard open/close, rotation, and modal close/reopen.
11. In the bg-preserve composition with the actually configured supported
    Gemini/helper route, start one manual summary, background the iPhone PWA,
    and return. Confirm one result, no Revenant/new-chat insertion, and no
    duplicate request. Close manual mode during a separate request and
    confirm a late result does not preview or apply; the request itself may
    still finish as recorded in S1.

No L3 result is asserted in this receipt. Review, the consolidated physical
gate, and explicit publication authorization still block push, tag, release,
live apply, and PocketRisu restart.
