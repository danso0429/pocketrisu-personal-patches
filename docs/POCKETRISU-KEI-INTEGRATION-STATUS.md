# PocketRisu Kei integration status and next plan

> **Status date:** 2026-08-02 KST
>
> **Planning authority:** `docs/POCKETRISU-KEI-INTEGRATION-CATALOG.md`
>
> **Frozen comparison:** PocketRisu 1.8.1
> `63832a138c14cc7f11364cf7efdcb61950e7894c`, PocketRisu Kei
> `cc1d1b195babd887577ebf943d5e82f01f58135c`, patcher base `77e23c0`.
>
> **New target overlay:** Official PocketRisu 1.9.0
> `85a65f3137b45c8de4a8d21a9887be213b1ac3fc`; see
> `docs/POCKETRISU-1.9-REBASE-AUDIT.md`.
>
> **Session handoff and exact resume point:**
> `docs/POCKETRISU-1.9-SESSION-HANDOFF.md`.
>
> **Post-overlap authority and result:**
> `docs/POCKETRISU-KEI-OVERLAP-AUDIT.md`,
> `docs/POCKETRISU-KEI-OVERLAP-IMPLEMENTATION-LEDGER.md`, and
> `docs/POCKETRISU-1.9-AGGREGATE-VALIDATION.md`.
>
> **Current gate:** consolidated feature-by-feature iPhone L3 is in progress.
> The first observation reported K19 swipe/arrows/boundaries/rotation normal,
> and VoiceOver was intentionally not exercised. The later K22 picker
> search/folder controls physically established the admitted patched bundle.
> Source inspection found a K16 mobile Hotkey route defect, and a later report
> found that the BG composer rendered its ownership marker literally.
> K16 and the BG composer are fixed, automatically requalified, and now
> admitted together with `toolchain-hardening` 0.1.3 in the live 542-unit
> candidate. The live install/restart gates passed; their physical re-L3 is
> still pending. K22 was later reported normal; K15's ordinary paragraph
> partial-edit affordance was normal; K14 was explicitly not exercised by user
> choice, and K27 was reported normal. K11 was interrupted by a distinct BG
> direct-generation lifecycle defect. After its retained gray indicator was
> fixed, the user still observed a pre-indicator delay and visible K11
> ownership wrappers. The keyed preparation and marker-safety corrections are
> automatically qualified at a 542-unit maximum graph, pushed, and
> live-admitted; their physical re-L3 is pending.
> Admission, findings, and per-feature observations are tracked in
> `docs/POCKETRISU-1.9-AGGREGATE-L3.md`.
> The user chose to keep remaining and corrected physical checks in a later
> consolidated affected-row re-L3 session rather than request them during the
> live update.

This file records progress against the catalog. It does not change a catalog
disposition or preservation contract.

## PocketRisu 1.9.0 pivot

PocketRisu 1.9.0 changes the generation, recovery, logging, usage, streaming
render, preset, backup, and asset-viewer baseline. The existing 1.8.1
candidate is preserved rather than mutated in place.

- `codex/pocketrisu-kei-integration` remains at `081a32b` with K12 staged but
  uncommitted against 1.8.1.
- `codex/pocketrisu-1.9-rebase` starts at `081a32b` without importing those
  uncommitted bytes.
- The 1.9 branch requalifies existing packs and admitted Kei children before
  any new catalog child is implemented.
- The active 1.9 functional/generated boundary is pushed at `fd60890`; neither candidate has been
  tagged or released, and the preserved K12 branch remains untouched. After
  the pristine official 1.9.0 base cutover, the requalified `all` candidate
  and later fixes were safely applied. The live tree now reports 28 current
  packs, 542 units, and 218 transaction-managed source paths. Its
  admission gates and first partial device observations are recorded in
  `docs/POCKETRISU-1.9-AGGREGATE-L3.md`.

The exact overlap, semantic classification, generation-authority conflict,
privacy-policy correction, and ordered rebase plan are in the 1.9 audit.
The original review-only target boundary is recorded in
`docs/POCKETRISU-1.9-TARGET-BOUNDARY-VALIDATION.md`. After every pack and Kei
child was qualified, the aggregate ordinary target gate promoted the current
exact-1.9 catalog to verified; the aggregate evidence is in
`docs/POCKETRISU-1.9-AGGREGATE-VALIDATION.md`. Unlisted later PocketRisu
versions remain rejected.

## Current branch boundary

The preserved 1.8.1 integration branch is
`codex/pocketrisu-kei-integration`; the active target-rebase branch is
`codex/pocketrisu-1.9-rebase`. Resolve either checkout with
`git worktree list`; do not encode one machine's worktree path into repository
history.

| Commit | Boundary | State |
| --- | --- | --- |
| `a1c23d5` | Empty `pocketrisu-kei` meta-pack foundation | Implemented and automatically validated |
| `2436606` | K19 fullscreen image viewer | Implemented and automatically validated; review and iPhone interaction gate remain |
| `85cfb43` | Exhaustive verifier optimization | Implemented and validated; infrastructure only, no Kei catalog feature progress |
| `6ffed92` | K13 robust OpenAI/Google SSE parsing | Implemented and automatically validated; review and consolidated iPhone/provider gate remain |
| `ee91f24` | K14 streaming chat render stability | Implemented and automatically validated; review and consolidated iPhone scroll/background gate remain |
| `038df10` | K16 navigation, hotkeys, pointer gestures, and opt-in mobile Back guard | Implemented and automatically validated; review and consolidated iPhone input/history gate remain |
| `f79c00f` | K15 shared partial-message editing and translation-cache identity guards | Implemented and automatically validated; review and consolidated iPhone selection/edit gate remain |
| `5090a81` | K11 HypaMemory manual summarization, frontier integrity, and CBS/next-target corrections | Implemented and automatically validated; review and consolidated iPhone HypaMemory gate remain |

The post-overlap implementation then added these local feature/infrastructure
boundaries on the active 1.9 branch:

| Commit | Boundary |
| --- | --- |
| `4275ea4` | Frozen overlap-equivalence instruction, master report, and eight receipts |
| `bc87789` | Feature/owner/pack/test/receipt/commit implementation ledger |
| `2ad4b1f` | K04-F01 frozen typed-role compatibility |
| `2280c9e` | K17-F01 invalid text-theme normalization |
| `fbecfdf` | K23-F01 regex import multiplicity |
| `f859700` | K27-F01 native BG request-log/usage delivery |
| `28d62d2` | Lazy snapshot-restore journal atomicity infrastructure |
| `a71fb9d` | K26-F02 fresh pre-restore snapshot safety |
| `6234617` | K29-F05 bounded overnight result retention |
| `7304adc` | K29-F02 G06 provider/request-class blocker; no runtime unit |
| `4e7578e` | K22-F01 P04-P06 folder-aware persona picker |
| `01b0492` | Post-overlap catalog, ledger, and aggregate requalification receipts |
| `a95af28` | Deterministic post-overlap generated installers |
| `11302c5` | Separately authorized live-candidate admission receipt and physical L3 ledger |
| `a043d98` | K16 1.9 top-level mobile Hotkey route correction and adversarial tests |
| `815673e` | Deterministic installers containing the K16 route correction |
| `838ac27` | BG composer 1.9 condition-placement correction and applied-output tests |
| `eda6eb9` | Deterministic installers containing both local L3 corrections |
| `7ef0e92` / `2049deb` | Node incomplete/throwing webstorage fallback and generated installers |
| `d9182db` / `f1d407e` | Descriptor-only probe correction and generated installers |
| `7fce915` / `53512ab` | Final getter-free test-storage install and canonical installers |
| `5d10edb` | BG direct-generation keyed lifecycle ownership and adversarial receipt |
| `ade082f` | Deterministic installers containing the direct lifecycle correction |
| `82d4878` | Pre-admission L3/status documentation; pushed branch boundary |
| `1d53f58` | Marker-safe exact Svelte managed blocks for K11/preset plus fail-closed manager guard |
| `dc82721` | BG keyed preparation lifecycle and exact owner-matched release |
| `fd60890` | Deterministic installers containing both independently owned corrections |

The catalog custody, verification procedure, and this status are kept in a
separate documentation commit. Its hash is read from history rather than
embedded in this file, which would create a self-referential commit hash.

The active candidate functional/generated boundary is pushed at `fd60890` but is not tagged or
released. The generated `all` candidate was first admitted at `11302c5`, then
advanced through the K16/BG/toolchain correction and the direct-lifecycle
correction. Live PocketRisu now reports 28 packs, 542 units, and 218 source
paths. This is not a publication or release qualification.

## Admission-order position

| Catalog admission step | Current state | Evidence / remaining boundary |
| --- | --- | --- |
| 1. Empty meta pack and resolver/catalog foundation | Candidate complete | `docs/POCKETRISU-KEI-FOUNDATION-VALIDATION.md`; review remains before publication |
| 2. Minimal K02 primitives required by K19, then K19 | Exact-1.9 implementation and aggregate automated gates complete | PocketRisu 1.8.1 already supplied the Svelte/icon primitives needed by the original focused port, so no K02 child was added. The 1.9 delta reuses native AssetViewer ownership and adds accessibility only. Evidence is in `docs/POCKETRISU-KEI-K19-VALIDATION.md` and `docs/POCKETRISU-1.9-KEI-K19-VALIDATION.md`. Review and the concrete iPhone gate remain, so this step is not publication-qualified. |
| Detour: exhaustive verifier performance | Complete as local infrastructure | `docs/COMBINATION-VERIFIER-OPTIMIZATION-VALIDATION.md`; this does not advance an admission step |
| 3. K13 stream parser, K14 render stability, K16 navigation/hotkeys | Exact-1.9 implementation and aggregate automated gates recorded; K16 L3 correction locally requalified | Each feature has an isolated core/adapters, 1.9 receipt, L2.5 audit, base/composed target tests and builds, dual-target planning, exact revert evidence, and coverage in the passing aggregate gate. K16's first device report prompted source inspection, which found the native outer route guard made its actual top-level Hotkey page unreachable on iPhone; `a043d98` removes only that guard and the 538-unit aggregate gates passed. See `docs/POCKETRISU-1.9-KEI-K13-VALIDATION.md`, `docs/POCKETRISU-1.9-KEI-K14-VALIDATION.md`, and `docs/POCKETRISU-1.9-KEI-K16-VALIDATION.md`. The corrected live rerun and remaining consolidated scenarios are not publication-qualified. |
| 4. K15 partial edit, K11 Hypa tools, K12 translation tools | All three exact-1.9 implementations and aggregate automated gates recorded | Exact-1.9 evidence is in `docs/POCKETRISU-1.9-KEI-K15-VALIDATION.md`, `docs/POCKETRISU-1.9-KEI-K11-VALIDATION.md`, and `docs/POCKETRISU-1.9-KEI-K12-VALIDATION.md`. Aggregate combination, target, L2.5, and deterministic-installer gates passed; review and L3 remain. |
| 5. K03/K04 preset behavior and K26 backup tools | Bounded K04-F01 and K26-F02 admitted and qualified | K04 adds only one-way frozen `.role` compatibility under native `.role2`; K26 requires a fresh pre-restore snapshot through exactly one standard/lazy owner adapter. Broad ports and K03 remain excluded/deferred. |
| 6. K20/K22/K23/K29 existing-authority merges | Bounded K22 P04-P06, K23-F01, and K29-F05 admitted and qualified | Existing persona, regex `types[]`, and BG result/claim/ACK authorities were extended without parallel schemas. K20, K22 P07, broad K23, and direct Revenant remain excluded/deferred; G06 is documented blocked with no runtime unit. |
| 7. K05–K09, K24/K25, K27, K28 policy packs | K27-F01 delivery only admitted; policy packs remain deferred | BG calls now reach the native request-log/usage owner. Provider/network/storage-policy packs, richer accounting, independent usage policy, and new privacy policy remain separate opt-in work. |

K19, K13, K14, K16, K15, K11, K12, K04-F01, K17-F01, K26-F02,
K23-F01, K27-F01, K29-F05, and K22-F01 P04-P06 are the bounded Kei outcomes
presently in the candidate. K29-F02 G06 has a blocker receipt and no runtime.
Excluded/deferred rows and policy-pack designs are catalog decisions, not
implemented progress.

## Current review and publication boundary

1. Keep feature/infrastructure commits separated for exact revert, then push
   and safely live-apply validated fixes in the same delivery flow. Before a
   PocketRisu restart, check active work read-only; if nonzero, wait without
   cancellation. Stable tag and release remain gated by consolidated L3.
2. During the remaining first-pass L3, stop and record an affected scenario
   when a finding appears, but continue unrelated rows. After the first pass,
   resolve all queued findings in separate owning feature or infrastructure
   commits and rerun their affected focused and aggregate gates as one
   integration cycle.
3. The user chose one consolidated iPhone L3 session after all planned local
   integrations. That session must still perform and record each feature's
   concrete scenario separately; batching the session does not merge child
   gates. K19 swipe, arrows, boundaries, and rotation were reported normal,
   and remain limited observations; VoiceOver is recorded not exercised by
   user choice. The later K22 picker controls established the patched bundle,
   while the BG composer marker is a separate queued re-L3 finding. K19's
   still-open scope
   includes:
   - open the native viewer from character and module assets, verify search
     and image filtering; inspect dialog/search/thumbnail labels with
     VoiceOver only if the user later chooses to revisit that not-exercised
     surface;
   - verify name/count alignment after navigation, both close controls, focus
     return, and physical reachability of the 44-pixel targets;
   - confirm existing add, delete, rename, and excluded-asset behavior is
     unchanged.
   For K13 it includes:
   - use a classic OpenAI-compatible model with streaming enabled and observe
     a visibly multi-paragraph/emoji response through completion;
   - use a classic Gemini model with streaming enabled, background the iPhone
     PWA while text is arriving, and return after completion;
   - confirm neither final response has missing/duplicated text and the Gemini
     chat is not left in a streaming state.
   For K14 it includes:
   - use a model preset whose own streaming switch is on and, if practical,
     leave the global classic-provider streaming switch off;
   - while a long response is visibly streaming, scroll several messages
     upward, stop touching the screen, and confirm the viewport is not reset
     for every chunk;
   - return to the bottom and confirm the same message grows without
     duplicate/missing text or repeated whole-message flicker;
   - with auto-translation enabled, confirm partial text is not repeatedly
     translated and completed text returns to the normal translation flow;
   - background and return during a separate bg-preserve generation, then
     confirm one final reply and cleared streaming/busy UI.
   For K16 it includes:
   - after admitting the corrected bundle, open the top-level Settings →
     Hotkey page (설정 → 단축키) and confirm the enabled master switch plus the
     existing iPhone small-screen notice;
   - with a hardware keyboard if available, exercise Ctrl+M, Ctrl+[ / Ctrl+],
     and Ctrl+X, then turn the master switch off and confirm configured
     shortcuts, triple-touch quick menu, popup editor, and Ctrl-drag no
     longer run; turn it on and confirm the bindings were retained;
   - with the existing mobile GUI enabled, swipe from empty space through the
     three home and four selected-character views, then start the same motion
     on controls, editors, links, and an open Alert/modal and confirm the
     underlying view does not move;
   - enable mobile Back protection, interact once, exercise iPhone Back,
     disable it, and confirm it does not rearm;
   - if a Realm/Chub query-entry path is available, record whether disabling
     a buried marker causes the documented single same-page Back stop rather
     than a loop or data mutation.
   For K15 it includes:
   - enable Drag Partial Edit in Settings → Accessibility, select text wholly
     inside one message, and verify Edit/Delete changes only the selected
     range in that message;
   - exercise duplicate text and an unmappable rendered selection, choosing
     the intended contextual match and observing the no-match dialog without
     a mutation;
   - leave an edit open while switching chat, changing/rerolling the message,
     or starting a stream, and confirm the stale target closes or refuses the
     save rather than editing the message now at that index;
   - edit a phrase in an LLM-translated view and confirm only its translation
     cache changes while the original message remains unchanged;
   - keep the setting enabled in the longest chat during a stream, then
     exercise selection, scrolling, rotation, and virtual-keyboard resize;
   - if a mouse/trackpad is available, exercise the separate block-hover
     entry point. A touch-only iPhone cannot mark that hover path passed.
   For K11 it includes:
   - open the existing HypaMemory modal and confirm its search, category, tag,
     edit, bulk-resummary, and automatic-memory controls remain available
     outside the new manual mode;
   - enter manual mode, select a later unsummarized message, and confirm all
     earlier eligible messages—including rows hidden by search—form one
     contiguous selected prefix;
   - generate, preview, reroll, cancel, generate again, and apply, then
     confirm exactly one summary was added and the next-target preview
     advanced without falling back to a completed greeting;
   - if a safe fixture exists, confirm missing/duplicated message IDs and an
     orphaned/ambiguous last-summary frontier block selection rather than
     skipping or restarting;
   - start a summary and change the chat, greeting, selected message, summary
     frontier, or Hypa preset before completion, then confirm the stale result
     cannot apply;
   - exercise the longest chat with search, scrolling, keyboard, rotation,
     modal close/reopen, CBS/first-message context, and the configured
     bg-supported Gemini/helper route. Closing manual mode must not apply a
     late result; the underlying request can still finish as recorded in the
     K11 receipt.
   For K12 it includes:
   - confirm existing Language import/export/clear plus the new cache panel;
   - search, reveal/copy, edit, and delete disposable exact entries, including
     stale-edit refusal and a cancelled delete confirmation;
   - scan and cancel unused-candidate review, inspect its warning and preview,
     and avoid real user cache as a destructive fixture;
   - supersede/leave a long translation, exercise K14 completion gating, and
     separately background/return on the configured BG-supported route;
   - exercise the largest cache with keyboard, scrolling, rotation,
     clipboard, cancellation, and explicit confirmations. Provider-specific
     DeepLX/Bergamot paths are recorded as not exercised when unavailable.
4. Record every observed L3 result at its actual scope. K19's native
   one-image scroll-snap swipe, arrows, boundaries, and rotation were reported
   normal but are not yet a marked candidate pass. Filtering/search, focus,
   touch-target reachability, module viewer, and disposable mutation remain
   open; VoiceOver remains not exercised unless the user chooses to revisit
   it. K16's separate whole-view swipe scenario remains a different
   interaction owner.

The source audit, approved implementation, corrected 542-unit automated
aggregate gates, and latest live apply/restart are complete. K16 and BG
composer are live-admitted but remain pending physical re-L3. Both BG
direct-generation lifecycle corrections and the cross-pack Svelte marker
safety correction are live-admitted at 542 units / 223 planned paths / 218
transaction-managed source paths. K27 was reported normal. Review and
unresolved or not-exercised L3 surfaces continue to block stable tag, release,
and publication, but not implementation push or safe live delivery.

## Next review and L3 sequence

The overlap-equivalence audit and its user-authorized implementation are
complete. The fresh exact-1.9 aggregate graph, L2.5, raw-selection,
maximum-target, exact-revert, and deterministic-installer gates are recorded
in `docs/POCKETRISU-1.9-AGGREGATE-VALIDATION.md`. Preserve the separate staged
K12 worktree and do not add deferred catalog children while closing the
current candidate.

1. Continue the already-defined first-pass iPhone session on the current live
   542-unit candidate while recording every feature scenario separately. Keep
   K19 VoiceOver and K14 streaming as not exercised unless the user chooses to
   revisit them. K22 is reported normal; K15's ordinary affordance is limited
   pass only. Keep the existing K29 G09 cold-reroll path separate and do not
   present blocked G06 as tested.
2. Run the K16 top-level Hotkey and BG composer attached/cold reruns with the
   later consolidated affected-row re-L3 batch, retaining individual results.
3. Reload the client, then verify two same-chat ordinary sends show immediate
   native preparation feedback and conclude without delayed fallback or a
   retained stage-zero circle. Open K11 and Prompt Preset and confirm no
   ownership marker text before resuming K11. The fixes are already live;
   these remain physical re-L3 observations, not inferred passes.
4. Queue any new finding with exact trigger/state/caller evidence. A later fix
   still requires feature-local commits and focused/aggregate gates.
5. Later validated fixes proceed through commit, push, safe live apply/build,
   restart, and runtime smoke in one flow. Active work is never cancelled;
   destructive user-data operations still require explicit authorization.
6. Only after L3 decide stable tag, release, or publication.

K12 remains a separate feature and keeps its complete translation identity,
cancellation, explicit destructive-action, storage-owner, and bg-delivery
contracts. Its staged 1.8.1 implementation is evidence, not a patch that may
be copied blindly onto 1.9.0.
