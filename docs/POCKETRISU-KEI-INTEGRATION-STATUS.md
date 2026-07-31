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
| 3. K13 stream parser, K14 render stability, K16 navigation/hotkeys | Not started | Catalog-level source classification exists; no implementation child, adapter, or feature receipt exists |
| 4. K15 partial edit, K11 Hypa tools, K12 translation tools | Not started | Must follow step 3 one feature at a time |
| 5. K03/K04 preset behavior and K26 backup tools | Not started | Existing-authority preservation contracts remain controlling |
| 6. K20/K22/K23/K29 existing-authority merges | Not started | No parallel order/schema/orchestration authority may be introduced |
| 7. K05–K09, K24/K25, K27, K28 policy packs | Not started | Separate explicit opt-in packs; none blocks the umbrella |

K19 is the only Kei feature implementation presently in the candidate.
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

### K13 — stream parser

1. Re-open the pinned Kei paths and caller chain for OpenAI and Google SSE
   parsing; record exact retained behavior and base anchors.
2. Keep protocol-stream parsing separate from `parser-hardening`'s chat-text
   parsing responsibility.
3. Define `kei-stream-parser-core`, a base OpenAI adapter, and the exact
   `bg-preserve` Google-delivery adapter. Do not create a broad bg adapter.
4. Test split UTF-8, multiline events, split JSON, tool calls, reasoning,
   multi-choice output, one-time signatures, cancellation, replay, and bg
   stream completeness.
5. Run focused target tests, applicable base/bg graphs, L2.5 runtime audit,
   the patch combination gate, diagnostics/build, exact revert, and a concrete
   mobile/background scenario.

### K14 — render stability

Only after K13's boundary is resolved, implement the render core and base/bg
adapters. Preserve the active chat component, scroll state, bg completion,
result claim, ACK, and reconnect behavior. Keep its commit and receipt
separate from K13.

### K16 — navigation and hotkeys

Only after K14, implement the navigation core and base/lazy adapters. Preserve
startup-cache reconstruction, lazy hydration ordering, pending local changes,
and route restoration. Keep its commit and receipt separate from K13/K14.

After K16, continue admission steps 4–7 in the catalog order. A later Kei
revision reopens only the affected rows under the catalog's re-evaluation
rule; it does not silently replace this frozen comparison.
