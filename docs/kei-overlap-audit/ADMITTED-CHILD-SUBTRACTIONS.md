# Admitted-child subtraction overlap-equivalence audit

## Metadata

- Frozen revisions: A `63832a1`, K `cc1d1b1`, U `85a65f3`.
- Final candidate: exact U plus the aggregate graph at patcher `2991355`.
- Scope is only the K19/K14/K16/K11/K12/K15/K13 atoms removed as upstream-equivalent, consumed, or delegated. Newly retained child deltas are deliberately not re-audited.
- Evidence also uses each exact-1.9 child receipt and final generated host bytes.

## Kei capability inventory

| Atom | Trigger and result | State/effects | Kei source/callers/tests |
| --- | --- | --- | --- |
| K19-A01 | Open/close the image viewer from the character/asset host. | Native viewer store and modal mount. | K19 frozen viewer wiring |
| K19-A02 | Viewer filters images and searches visible assets. | Derived filtered identity list. | K19 viewer/store |
| K19-A03 | Previous/next buttons obey sparse-list boundaries. | Changes active filtered index only. | K19 navigation helper |
| K19-A04 | Arrow keys navigate and Escape closes. | Document listener lifecycle. | K19 viewer |
| K19-A05 | Horizontal touch swipe converges on one adjacent image. | Scroll-snap/rAF index update. | K19 mobile viewer |
| K19-A06 | Only current/adjacent image slides are mounted. | Bounds mobile memory and URL work. | K19 viewer |
| K19-A07 | Dialog labeling/focus/touch targets remain usable on iPhone/VoiceOver. | Accessibility/focus side effects. | K19 viewer semantics |
| K14-R01 | `off`, balanced, and strong display-optimization modes keep native semantics. | User setting selects renderer behavior. | K14 copied/native renderer comparison |
| K14-R02 | Stable component identity/mount registry preserves chat scroll/component state while streaming. | Identity includes message/chat/character dimensions. | K14 render host |
| K14-R03 | Streamed text updates are coalesced without losing the latest text. | Scheduled render invalidation. | K14 renderer/helper |
| K14-R04 | Raw display mode bypasses formatted presentation as configured. | Native mode selection. | K14/native renderer |
| K14-R05 | Editing/translation presentation is suppressed/deferred under the native optimized-stream conditions. | Prevents competing owners during stream. | K14/native host |
| K16-N01 | Previous/next character navigation respects first/last and filtered bounds. | Selection changes only to an adjacent valid character. | K16 hotkey host |
| K16-N02 | Model-preset hotkey imports/opens native preset selection. | Native action/case owns modal state. | K16 1.8 adapter; U hotkey |
| K16-N03 | Page exit uses one upstream `beforeunload` confirmation owner. | No duplicate confirmation listeners. | K16 history guard config; U preload |
| K11-H01 | Summary preview uses CBS-correct `processMessageForPreview`. | Preview text matches generation preprocessing. | K11 Hypa helper |
| K11-H02 | Existing summary reroll targets the selected summary item. | Replaces the correct summary record. | K11/U Hypa modal |
| K11-H03 | Search refreshes when active filters change. | Derived list invalidation. | K11 modal search |
| K11-H04 | Hidden summaries stay excluded from filtered results. | Search does not resurrect hidden rows. | K11 modal search |
| K11-H05 | Search/reroll chooses only a safe, unambiguous summary target. | Rejects orphan/ambiguous selection. | K11 helper/native modal |
| K12-T01 | LLM translation persistent cache key is based on original input text. | Cache identity survives formatting/replacement. | K12/U translator |
| K12-T02 | DeepL request retains request-log category/source fields while gaining abort. | Logger routing metadata. | K12 provider adapter |
| K12-T03 | DeepLX request retains request-log category/source fields while gaining abort. | Same. | K12 provider adapter |
| K12-T04 | Google translation request retains request-log category/source fields while gaining abort. | Same. | K12 provider adapter |
| K15-E01 | Partial editor remains disabled while native/K14 optimized-stream display owns the message. | Avoids dual mutation/listeners. | K15/K14 host |
| K15-E02 | Native screen overscroll class remains on the chat root. | Mobile scrolling presentation. | K15 `DefaultChatScreen` host |
| K13-S01 | Provider endpoint/custom URL selection remains owned by native provider hosts. | Preserves provider/config branches. | K13 provider adapters |
| K13-S02 | Actual fetch/transport remains native rather than parser-owned. | Request headers/body/route unaffected. | K13 hosts |
| K13-S03 | Abort remains connected through provider and BG transport owners. | Exact request cancellation. | K13 host/BG adapter |
| K13-S04 | Tool execution remains native after parsed tool-call events. | Parser only emits events; host owns tools. | K13 OpenAI host |
| K13-S05 | Usage and Google signature persistence remain native host side effects. | Accounting/signature state survives parser replacement. | K13 hosts |
| K13-S06 | BG raw-byte/reconnect delivery feeds the parser once without becoming a second parser owner. | Ordered replay and one consumer. | K13 BG adapter |

## Current authority and control flow

### Kei flow

```text
feature trigger
  -> Kei child UI/helper
  -> copied or modified 1.8 host behavior
  -> retained child delta
  -> native storage/request/render side effects
```

### Official/local/composed flow

```text
feature trigger
  -> exact-1.9 native viewer/renderer/hotkey/Hypa/translator/editor/provider host
  -> small target-scoped child adapter for only the new Kei delta
  -> optional BG/lazy owner selected by resolved graph
  -> one final host implementation
```

### Schema and state crosswalk

The exact-1.9 adapters remove copied 1.8 host units rather than introducing parallel stores. Final host bytes retain native asset-viewer state, render identity/modes, hotkey/preload ownership, Hypa preview/search/reroll, translation cache key/log metadata, optimized-stream gate, and provider transport/tool/usage/signature effects. K13's BG delivery is a composed boundary; it is not parser state.

## Equivalence matrix

| Atom | Kei evidence | Official 1.9 evidence | Local/final evidence | Disposition | Strength | Remaining observation |
| --- | --- | --- | --- | --- | --- | --- |
| K19-A01 | K viewer/store | Native AssetViewer mount/store | Final uses native only | `EQUIVALENT` | source-proved | None |
| K19-A02 | K filter/search | Native image filter/search | Final retained | `EQUIVALENT` | source-proved | None |
| K19-A03 | K navigation helper | Native filtered-index arrows | Final retained | `EQUIVALENT` | source-proved | None |
| K19-A04 | K key listener | Native key effect | Final retained | `EQUIVALENT` | source-proved | None |
| K19-A05 | K pointer swipe | Native scroll-snap/rAF swipe | Final retained | `UNVERIFIED` | L3-required | Actual iPhone swipe convergence. |
| K19-A06 | K adjacent mount | Native adjacent slide window | Final retained | `EQUIVALENT` | source-proved | Async URL teardown is a prepared native surface. |
| K19-A07 | K dialog/focus intent | Native dialog/labels | Final retained | `UNVERIFIED` | L3-required | VoiceOver labels, focus return, tap targets. |
| K14-R01 | K mode behavior | Native mode selector | Adapter retains native owner | `EQUIVALENT` | measured | None |
| K14-R02 | K stable mount | Native identity/mount registry | Final passes K-specific identity inputs into native host | `COMPOSED_COVERAGE` | measured | None |
| K14-R03 | K coalescing | Native coalescer | Final retains latest-text inputs | `EQUIVALENT` | measured | None |
| K14-R04 | K raw mode | Native raw mode | Final retains it | `EQUIVALENT` | source-proved | None |
| K14-R05 | K suppression | Native/K14 shared state | Final one-owner composition | `COMPOSED_COVERAGE` | measured | None |
| K16-N01 | K boundary patch | Native adjacent block | Final retains native | `EQUIVALENT` | measured | None |
| K16-N02 | K import/case | Native import/case | 1.9 duplicate units absent | `EQUIVALENT` | measured | None |
| K16-N03 | K fallback listener | Native preload listener | K16 config delegates owner | `EQUIVALENT` | measured | None |
| K11-H01 | K preview correction | Native corrected helper | Final adapter calls native | `EQUIVALENT` | measured | None |
| K11-H02 | K reroll replacement | Native corrected reroll | Duplicate 1.9 unit absent | `EQUIVALENT` | measured | None |
| K11-H03 | K search invalidation | Native filtered search | Final retained | `EQUIVALENT` | measured | None |
| K11-H04 | K hidden exclusion | Native filtered search | Final retained | `EQUIVALENT` | measured | None |
| K11-H05 | K safe target | Native target logic plus K manual frontier | Final one owner | `COMPOSED_COVERAGE` | measured | None |
| K12-T01 | K original key | U contains correction | Final retained | `EQUIVALENT` | source-proved | None |
| K12-T02 | K logging + abort | U log fields | K12 adds signal without removing fields | `COMPOSED_COVERAGE` | measured | BG server-log delivery is separately K27-F01. |
| K12-T03 | Same | Same | Same | `COMPOSED_COVERAGE` | measured | Same cross-cluster limit. |
| K12-T04 | Same | Same | Same | `COMPOSED_COVERAGE` | measured | Same cross-cluster limit. |
| K15-E01 | K optimized-stream gate | Native/K14 gate | Shared manager reads final state | `COMPOSED_COVERAGE` | measured | None |
| K15-E02 | K overscroll | Native class | Final retains it | `EQUIVALENT` | source-proved | None |
| K13-S01 | K provider host | U provider selection | Parser adapters leave it byte-owned | `EQUIVALENT` | measured | None |
| K13-S02 | K fetch host | U transport | Final parser receives host stream | `EQUIVALENT` | measured | None |
| K13-S03 | K abort host | U signal + BG adapter | Final cancellation composition | `COMPOSED_COVERAGE` | measured | None |
| K13-S04 | K tool host | U tool executor | Final retained | `EQUIVALENT` | measured | None |
| K13-S05 | K usage/signature side effects | U host effects | Final retained | `EQUIVALENT` | measured | K27-F01 limits BG log persistence, not parser usage extraction. |
| K13-S06 | K raw delivery | U parser seam | BG adapter supplies replay and exact parser owner | `COMPOSED_COVERAGE` | measured | None |

## Adversarial checks

| Scenario | Classification it could break | Method | Observed result | Limitation |
| --- | --- | --- | --- | --- |
| Copied 1.8 owner accidentally retained on exact 1.9 | All duplicate-authority claims | Fresh `node --test` on seven child contract files, patcher `2991355`, exit 0 | 7 files passed, 0 failed, duration 893.67 ms; contracts reject copied native owners and check target-scoped units. | Contract tests are structural/fixture-backed, not UI L3. |
| Native viewer filter/boundaries/adjacent mount | K19-A02/A03/A06 | Final full component/store read plus K19 contract | One native owner; filtered index and adjacent mount are present. | A05/A07 remain L3-required. |
| Renderer `off` mode | K14-R01/R05 | Final host and child contract | Adapter does not force stable/deferred behavior when native optimization is off. | None |
| One unload owner | K16-N03 | Final listener enumeration plus contract | One upstream page-exit owner and one separate same-page history owner remain; no duplicate `beforeunload`. | Browser prompt wording is upstream. |
| Provider custom endpoints/local branches | K13-S01-S03 | Full host/adapter anchors and contracts | Parser units do not select endpoint, fetch route, or abort owner. | Live provider availability was not required. |

Fresh command: `node --test test/kei-fullscreen-image-viewer.test.cjs test/kei-chat-render.test.cjs test/kei-mobile-navigation.test.cjs test/kei-hypa-tools.test.cjs test/kei-translation-tools.test.cjs test/kei-partial-edit.test.cjs test/kei-stream-parser.test.cjs`.

A second attempt to run final-candidate Vitest source files via `npx vitest run ...` exited 1 because no local Vitest executable existed and registry lookup failed with `EAI_AGAIN`; it is recorded as unavailable evidence, not a product failure or pass. Existing exact-1.9 receipts contain their earlier full-suite observations, but this audit does not relabel those as a fresh run.

## Findings

| ID | Atom | Current behavior | Kei behavior | Impact/trigger | Owner | Proposed next decision |
| --- | --- | --- | --- | --- | --- | --- |
| CHILD-F01 | K19-A05/A07 | Source contains native swipe/dialog/accessibility behavior, but this audit has no fresh iPhone/VoiceOver observation. | Frozen K supplied its own viewer implementation. | Only tactile/focus equivalence remains observationally open. | Native AssetViewer | Keep the subtraction source-qualified and add the K19 receipt's exact swipe and VoiceOver/focus scenarios to the already planned aggregate iPhone L3 before final closure. |

## Conclusion

- 32 / 32 discovered subtraction atoms are mapped.
- Dispositions: 21 `EQUIVALENT`, 9 `COMPOSED_COVERAGE`, 2 `UNVERIFIED`.
- Two K19 atoms are L3-required and are not reported as passes.
- The source/contract evidence confirms the other upstream-equivalent and composed subtractions without reopening any retained Kei child feature.
