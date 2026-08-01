# PocketRisu Kei integration status and next plan

> **Status date:** 2026-08-01 KST
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
- Neither candidate branch has been pushed, tagged, released, or applied
  live. Separately, the old live 1.8.1 patch graph was reverted and the live
  base was upgraded and restarted on pristine official 1.9.0 after explicit
  authorization. No requalified pack or Kei candidate is installed. The
  interrupted first attempt, recovery, and successful stopped-process cutover
  are recorded in the session handoff.

The exact overlap, semantic classification, generation-authority conflict,
privacy-policy correction, and ordered rebase plan are in the 1.9 audit.
The exact review-only target boundary is implemented and recorded in
`docs/POCKETRISU-1.9-TARGET-BOUNDARY-VALIDATION.md`; no pack is thereby
qualified on 1.9.0.

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

The catalog custody, verification procedure, and this status are kept in a
separate documentation commit. Its hash is read from history rather than
embedded in this file, which would create a self-referential commit hash.

The candidate branch has not been pushed, tagged, released, or applied to the
live PocketRisu tree. The live process restart installed only the pristine
official 1.9 base and is not a candidate publication or patch qualification.

## Admission-order position

| Catalog admission step | Current state | Evidence / remaining boundary |
| --- | --- | --- |
| 1. Empty meta pack and resolver/catalog foundation | Candidate complete | `docs/POCKETRISU-KEI-FOUNDATION-VALIDATION.md`; review remains before publication |
| 2. Minimal K02 primitives required by K19, then K19 | Implementation and automated gates complete | PocketRisu 1.8.1 already supplied the Svelte/icon primitives needed by the focused K19 port, so no K02 child was added. K19 evidence is in `docs/POCKETRISU-KEI-K19-VALIDATION.md`. HQ review and the concrete iPhone gate remain, so this step is not publication-qualified. |
| Detour: exhaustive verifier performance | Complete as local infrastructure | `docs/COMBINATION-VERIFIER-OPTIMIZATION-VALIDATION.md`; this does not advance an admission step |
| 3. K13 stream parser, K14 render stability, K16 navigation/hotkeys | Implementation and automated gates recorded | Each feature has an isolated core/adapters, receipt, L2.5 audit, base/composed target tests and builds, all 2,048 raw patch selections, and exact revert evidence. See `docs/POCKETRISU-KEI-K13-VALIDATION.md`, `docs/POCKETRISU-KEI-K14-VALIDATION.md`, and `docs/POCKETRISU-KEI-K16-VALIDATION.md`. HQ review and each consolidated L3 scenario remain, so this step is not publication-qualified. |
| 4. K15 partial edit, K11 Hypa tools, K12 translation tools | K15 and K11 automated 1.8.1 gates complete; K12 is staged only on the preserved 1.8.1 branch | Evidence is in `docs/POCKETRISU-KEI-K15-VALIDATION.md` and `docs/POCKETRISU-KEI-K11-VALIDATION.md`. Rebase all three onto 1.9 owners before claiming target qualification. |
| 5. K03/K04 preset behavior and K26 backup tools | Not started | Existing-authority preservation contracts remain controlling |
| 6. K20/K22/K23/K29 existing-authority merges | Not started | No parallel order/schema/orchestration authority may be introduced |
| 7. K05–K09, K24/K25, K27, K28 policy packs | Not started | Separate explicit opt-in packs; none blocks the umbrella |

K19, K13, K14, K16, K15, and K11 are the Kei feature implementations presently in the candidate.
Excluded/deferred rows and policy-pack designs are catalog decisions, not
implemented progress.

## Current review and publication boundary

1. Keep the foundation, K19, verifier, K13, K14, K16, K15, K11, and documentation
   commits available for review without pushing, tagging, releasing, or
   modifying the live PocketRisu tree.
2. Resolve any review finding in its own feature or infrastructure commit.
3. The user chose one consolidated iPhone L3 session after all planned local
   integrations. That session must still perform and record each feature's
   concrete scenario separately; batching the session does not merge or waive
   child gates. For K19 it includes:
   - open a character's additional image;
   - navigate previous and next across sparse available assets;
   - close the viewer;
   - confirm existing add, delete, and excluded-asset behavior is unchanged.
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
   - open Settings → Accessibility → Hotkeys and confirm the enabled master
     switch plus the existing iPhone small-screen notice;
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
4. Record the observed L3 result. For K19, do not claim swipe navigation: its
   focused viewer provides touch-sized previous/next and close controls plus
   keyboard navigation. K16's separate whole-view swipe scenario is the one
   listed above.

The deferred K19 mobile gate does not block source audit or separately
committed local implementation of the next catalog child. Review and the
consolidated per-feature L3 results continue to block push, tag, release, and
publication of the aggregate candidate. A future live candidate apply and
any restart it needs remain separate explicit-authorization boundaries; the
already completed pristine 1.9 base restart does not authorize either.

## Next implementation sequence

Pause new catalog admission while the official 1.9 target is requalified.
Start from the `codex/pocketrisu-1.9-rebase` branch HEAD containing the
session handoff and feature-local qualification receipts. Preserve the
separate staged K12 worktree. `lazy-chat-sync` and combined
`character-import-ux` qualification are complete. The request-class authority
table, target-scoped `bg-preserve`, and combined lazy/BG adapter qualification
and the K19 native AssetViewer accessibility delta are also complete. K13's
unchanged replayable SSE core and dual graph adapters are qualified on exact
1.9.0, and K14 is qualified as a focused delta over native streaming render
optimization. The exact next executable work is K16 navigation/hotkeys.
Follow
`docs/POCKETRISU-1.9-SESSION-HANDOFF.md` and
`docs/POCKETRISU-1.9-REBASE-AUDIT.md` in this order:

1. use the completed review-only exact 1.9 target boundary;
2. retain the completed localized qualifications for `toolchain-hardening`,
   `startup-cache`, `parser-hardening`, `character-organizer`, and the
   version-aware `personal-settings`, plus the conditional asset-only
   `bg-preserve-storage-base` adapter and the target-scoped
   `persona-organizer` server adapter;
3. retain the completed dual-target `lazy-chat-sync` and
   `character-import-ux` qualification and its full/focused/round-trip/audit
   receipts;
4. retain the qualified native-job/BG authority split and combined lazy/BG
   adapter without adding a second request-class owner;
5. adapt K19, K13, K14, K16, K15, and K11 as separate deltas;
6. port the preserved staged K12 implementation;
7. re-evaluate future and policy catalog rows against the new baseline;
8. run focused target gates, L2.5, and exhaustive raw-selection combination
   verification before any `verified` declaration.

K12 remains a separate feature and keeps its complete translation identity,
cancellation, explicit destructive-action, storage-owner, and bg-delivery
contracts. Its staged 1.8.1 implementation is evidence, not a patch that may
be copied blindly onto 1.9.0.
