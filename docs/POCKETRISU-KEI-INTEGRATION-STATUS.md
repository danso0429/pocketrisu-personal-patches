# PocketRisu Kei integration status and next plan

> **Status date:** 2026-07-31 KST
>
> **Planning authority:** `docs/POCKETRISU-KEI-INTEGRATION-CATALOG.md`
>
> **Frozen comparison:** PocketRisu 1.8.1
> `63832a138c14cc7f11364cf7efdcb61950e7894c`, PocketRisu Kei
> `cc1d1b195babd887577ebf943d5e82f01f58135c`, patcher base `77e23c0`.

This file records progress against the catalog. It does not change a catalog
disposition or preservation contract.

## Current branch boundary

The local integration branch is `codex/pocketrisu-kei-integration`. Resolve
its active checkout with `git worktree list`; do not encode one machine's
worktree path into repository history.

| Commit | Boundary | State |
| --- | --- | --- |
| `a1c23d5` | Empty `pocketrisu-kei` meta-pack foundation | Implemented and automatically validated |
| `2436606` | K19 fullscreen image viewer | Implemented and automatically validated; review and iPhone interaction gate remain |
| `85cfb43` | Exhaustive verifier optimization | Implemented and validated; infrastructure only, no Kei catalog feature progress |
| `6ffed92` | K13 robust OpenAI/Google SSE parsing | Implemented and automatically validated; review and consolidated iPhone/provider gate remain |
| `ee91f24` | K14 streaming chat render stability | Implemented and automatically validated; review and consolidated iPhone scroll/background gate remain |

The catalog custody, verification procedure, and this status are kept in a
separate documentation commit. Its hash is read from history rather than
embedded in this file, which would create a self-referential commit hash.

The branch has not been pushed, tagged, released, applied to the live
PocketRisu tree, or followed by a PocketRisu restart.

## Admission-order position

| Catalog admission step | Current state | Evidence / remaining boundary |
| --- | --- | --- |
| 1. Empty meta pack and resolver/catalog foundation | Candidate complete | `docs/POCKETRISU-KEI-FOUNDATION-VALIDATION.md`; review remains before publication |
| 2. Minimal K02 primitives required by K19, then K19 | Implementation and automated gates complete | PocketRisu 1.8.1 already supplied the Svelte/icon primitives needed by the focused K19 port, so no K02 child was added. K19 evidence is in `docs/POCKETRISU-KEI-K19-VALIDATION.md`. HQ review and the concrete iPhone gate remain, so this step is not publication-qualified. |
| Detour: exhaustive verifier performance | Complete as local infrastructure | `docs/COMBINATION-VERIFIER-OPTIMIZATION-VALIDATION.md`; this does not advance an admission step |
| 3. K13 stream parser, K14 render stability, K16 navigation/hotkeys | In progress | K13 and K14 each have separate pure cores, mutually exclusive base/bg adapters, receipts, L2.5 audits, complete target tests/builds, all 2,048 raw patch selections, and exact revert. Evidence is `docs/POCKETRISU-KEI-K13-VALIDATION.md` and `docs/POCKETRISU-KEI-K14-VALIDATION.md`. K16 is next and is not implemented. |
| 4. K15 partial edit, K11 Hypa tools, K12 translation tools | Not started | Must follow step 3 one feature at a time |
| 5. K03/K04 preset behavior and K26 backup tools | Not started | Existing-authority preservation contracts remain controlling |
| 6. K20/K22/K23/K29 existing-authority merges | Not started | No parallel order/schema/orchestration authority may be introduced |
| 7. K05–K09, K24/K25, K27, K28 policy packs | Not started | Separate explicit opt-in packs; none blocks the umbrella |

K19, K13, and K14 are the Kei feature implementations presently in the candidate.
Excluded/deferred rows and policy-pack designs are catalog decisions, not
implemented progress.

## Current review and publication boundary

1. Keep the foundation, K19, verifier, and documentation commits available
   for review without pushing, tagging, releasing, or modifying the live
   PocketRisu tree.
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
4. Record the observed L3 result. Do not claim swipe navigation: the current
   focused K19 adaptation provides touch-sized previous/next and close
   controls plus keyboard navigation.

The deferred K19 mobile gate does not block source audit or separately
committed local implementation of the next catalog child. Review and the
consolidated per-feature L3 results continue to block push, tag, release, and
publication of the aggregate candidate. Live/candidate apply and any
PocketRisu restart remain separate explicit-authorization boundaries.

## Next implementation sequence

Resume catalog admission step 3 in the local branch. Implement and commit each
capability separately while preserving the review and publication boundary
above.

### K16 — navigation and hotkeys

K13 and K14 automated boundaries are resolved. Implement the navigation core
and base/lazy adapters. Preserve
startup-cache reconstruction, lazy hydration ordering, pending local changes,
and route restoration. Keep its commit and receipt separate from K13/K14.

After K16, continue admission steps 4–7 in the catalog order. A later Kei
revision reopens only the affected rows under the catalog's re-evaluation
rule; it does not silently replace this frozen comparison.
