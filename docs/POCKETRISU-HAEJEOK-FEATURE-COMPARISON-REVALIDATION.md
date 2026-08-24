# PocketRisu + patcher vs Haejeok feature comparison revalidation packet

> 상태: **외부 재검증 대기 / provisional**
>
> 작성 기준일: 2026-08-24 KST
>
> 목적: 현재 PocketRisu 1.10 + complete patcher와 Haejeok RisuAI를 기능
> owner 단위로 일대일 비교하고, 다른 검토자가 사실·누락·설계 판단을
> 독립적으로 재검증할 수 있게 근거와 질문을 한 파일에 고정해요.
>
> 이 문서는 구현 승인, stable release 승인, Haejeok runtime qualification,
> 또는 기존 계획 문서의 자동 대체가 아니에요. 외부 검증 결과를 받은 뒤
> 기존 Haejeok 계획·감사 문서와 모순을 해소해야 해요.

## 1. 이 파일을 검토하는 방법

외부 검토자는 이 문서의 결론을 전제로 삼지 말고 다음 순서로 확인해 주세요.

1. 아래 frozen revision을 정확히 checkout해요.
2. 각 claim ID의 현재/HJ source path와 최종 caller를 직접 읽어요.
3. path 교차를 기능 동등성으로 간주하지 않아요.
4. source에 존재하는 기능과 실제 runtime에서 qualified된 기능을 구분해요.
5. 잘못된 claim은 정확한 commit/path/line과 함께 교정해요.
6. 기능을 추천할 때 원본 이식과 결과의 owner-local 재구현을 구분해요.
7. 마지막의 응답 양식을 사용해 확인·교정·불명확을 표시해요.

## 2. Frozen comparison basis

| 항목 | 고정 기준 |
| --- | --- |
| Official PocketRisu target | `v1.10.0` / `98e968339d1b3f91b9dac85bb3f2ebb5f90f9d14` |
| Patcher checkpoint | `0.2.0-experimental.21` / `2671b73c0cf97b84b754a8c62a02cc5180dc5490` |
| Complete graph | 13 visible requested roots, 12 effective roots, 38 resolved packs/adapters, 769 exact-1.10 units, 280 managed paths |
| Haejeok RisuAI | [`nevaeh5379/HaejeokRisuai`](https://github.com/nevaeh5379/HaejeokRisuai) `e9d035683cdf9f0207eed193ee36f9bdb117f658` / tag `b6254` |
| Haejeok-specific comparison base | RisuAI `22ea4a64b7a2178ca10957dc53f14a0404e31587` |
| Haejeok delta | 173 commits, 547 final changed paths |
| Older PocketRisu/Haejeok ancestor | `b8b4de1d1d1072815d8f6ca957fec0a9e6a95dee` |
| Frozen PocketRisu Kei source used by patcher | `cc1d1b195babd887577ebf943d5e82f01f58135c` |

Haejeok은 PocketRisu의 개조판이 아니라 최신 RisuAI 계열에서 독립한 fork예요.
따라서 raw tree diff나 같은 filename은 곧바로 같은 기능을 뜻하지 않아요.

## 3. Evidence boundary

### 3.1 현재 PocketRisu + patcher

- 현재 complete graph는 실제 patcher apply/current/zero-change replan/exact
  revert/reapply와 client/server/compat tests, Svelte diagnostics, production
  build, BG bundle load를 거쳤어요.
- HJ01/HJ03/HJ04는 live candidate와 여섯 개 iPhone 시나리오에서 사용자가
  정상이라고 보고했어요.
- 이 근거는 모든 patch feature가 물리 L3를 통과했다는 뜻이 아니에요.
  개별 Kei/owner receipt의 실제 gate 상태를 유지해야 해요.

### 3.2 Haejeok

- 이 검수는 pinned `main`의 source, Git history, caller, README, server
  documentation, 관련 tests를 읽은 결과예요.
- Haejeok을 우리 Oracle/iPhone 환경에 설치하거나 runtime qualification하지
  않았어요.
- SQL/storage/compute/cache/ZIP에는 의미 있는 tests가 있지만, MainMenu,
  RecentSessions, global textarea resize는 전용 UI behavior tests가 없어요.
- LogExporter는 한 test file의 세 cases가 offscreen completion과 기본 HTML을
  확인하지만 image split/stitch, ffmpeg, WebM, range identity, hostile markup,
  offline/iPhone output을 확인하지 않아요.
- `feature/asset-manager` 같은 unmerged branch는 shipped `main` behavior로
  간주하지 않아요.

### 3.3 해석 규칙

- **현재 우위**: 현재 graph에 동등하거나 더 강한 결과와 근거가 있어요.
- **HJ 우위**: HJ에 현재 없는 실제 사용자 결과가 있어요. 자동 admission을
  뜻하지 않아요.
- **구조 대안**: 같은 문제를 서로 다른 data/authority architecture로 풀어요.
- **상호보완**: 좁은 결과는 결합 가능하지만 원본 전체를 쌓으면 충돌해요.
- **거의 동등**: 최종 behavior가 유사하고 차이는 주로 owner/test예요.

## 4. Current capability inventory

### 4.1 Visible roots

| Root | 현재 결과 |
| --- | --- |
| `bg-preserve` | ax/main/post 전체 generation의 durable server orchestration, cancel, cold recovery, result claim/ACK |
| `client-build-fence` | stale client authoritative-write refusal와 dirty-state recovery |
| `startup-cache` | ETag startup raw/decoded cache; complete graph에서는 `lazy-chat-sync`가 supersede해 같은 결과를 포함해요. |
| `lazy-chat-sync` | inactive chat stub, hydration, chat delta/CAS, journal, conflict rebase, stable identity |
| `persona-organizer` | persona folder/order/gallery/picker/bulk delete와 asset reference 보존 |
| `character-organizer` | canonical character folder/order를 drag 없이 명시적으로 편집 |
| `character-import-ux` | non-blocking character/module import와 terminal persistence reporting |
| `personal-settings` | import navigation과 structured appearance controls |
| `preset-integrity` | active prompt-preset index/empty/deletion guards |
| `parser-hardening` | ChatML/Thoughts/CBS regressions |
| `toolchain-hardening` | exact target의 Node 25 test storage와 Lightning CSS compatibility |
| `charx-archive-integrity` | indexed CharX validation, CRC/path/overlap/cap policy, terminal import receipt |
| `pocketrisu-kei` | stream parser/render, mobile navigation, Hypa manual tools, partial edit, translation cache tools, viewer, role/theme/restore guards |

### 4.2 Hidden functional owners

- point-in-time backup source and fresh pre-restore snapshot;
- lazy/BG/fence/Kei composition adapters;
- HJ04 persistence safety, HJ03 Korean search, HJ01 Small width;
- exact-1.10 native asset purge/VACUUM/request-log/storage-dashboard owners;
- K13 SSE, K14 render, K15 partial edit, K16 navigation, K11 Hypa, K12
  translation, K19/native AssetViewer a11y, prompt-role and text-theme guards.

## 5. Data, persistence, and operations comparison

| ID | 기능 | 현재 PocketRisu + patcher | Haejeok | provisional 판정 |
| --- | --- | --- | --- | --- |
| D01 | Primary storage | 단일 SQLite/KV, chunked large values, lazy chat. 외부 DB 없이 운영과 backup이 단순해요. | PostgreSQL/Oracle/Azure SQL/Web/Tauri SQLite, normalized rows, incremental commits, relational indexes예요. | **구조 대안.** HJ는 scale/query/revision, 현재는 단순 운영·호환·single-source recovery가 강해요. |
| D02 | Startup load | ETag raw/decoded startup cache를 authoritative probe로 재검증해요. | SQL mode는 필요한 record만 읽어 full `database.bin` decode 자체를 피워요. | **구조 대안.** 현 저장구조에는 현재 방식이 맞고, HJ SQL은 문제를 제거해요. |
| D03 | Lazy chat / message paging | inactive chat stub, selected-chat hydration, stable chat ID, full-chat/delta CAS, bounded sync snapshots가 있어요. | `MessageStore`가 row message를 page하고 active retention을 normal 200/low-spec 40으로 줄여요. | **구조 대안.** HJ는 true message paging, 현재는 PocketRisu protocol compatibility와 explicit conflict/hydration safety가 강해요. |
| D04 | Conflict behavior | lost ACK를 server snapshot으로 확인하고 safe delta/rebase/conflict 사본으로 복구해요. | SQL `baseRevision` mismatch는 저장을 거부하고 reload를 요구하며 audit revision을 남겨요. | 현재는 자동 회복, HJ는 transaction/history가 장점이에요. |
| D05 | HJ04 persistence ordering | user turn 선저장, script clone을 live lazy chat에 merge, plugin tracker만 commit, BG bundle에서 browser save 제외예요. | 원본 `MessageStore`/`SettingsStore`가 row 단위로 직접 flush해요. | 결과는 대응해요. 현재 adaptation이 BG와 plugin-array hazard까지 더 넓게 다뤄요. |
| D06 | Whole-pipeline background generation | operation-keyed ax/main/post, durable result, exact claim/ACK, cancel/no-resurrection, cold recovery가 있어요. | provider generation은 주로 client owner이고 Node proxy/compute는 request-lifetime이에요. | **현재 우위.** HJ에 동등한 durable whole-pipeline ledger가 없어요. |
| D07 | Stale client build fence | body parser 전 426, not-committed, clean reload 또는 dirty input freeze/recovery를 해요. | 동등한 `x-client-build` fence가 없어요. | **현재 우위.** |
| D08 | Live application backup | 한 SQLite/WAL과 filesystem asset epoch를 pin하고 transfer 중 ordinary writes를 허용해요. | request-lifetime application backup/restore와 SQL backend별 transport가 있어요. | current PocketRisu application snapshot은 현재가 강해요. |
| D09 | Infrastructure disaster recovery | application archive와 SQLite snapshots가 중심이에요. | Docker quiesce, PostgreSQL `pg_dump`, stopped RustFS, `save/`, encrypted restic을 묶어요. | **HJ 우위 at infrastructure layer.** 서로 다른 backup 계층이에요. |
| D10 | Restore/history | destructive restore 직전 fresh rollback snapshot, build fence, stream/HTTP failure classification을 해요. | `system.revisions`/`audit_log`, diff inspector, transactional revision restore가 있어요. | **상호보완.** 현재는 full app restore, HJ는 record history가 강해요. |
| D11 | Asset backend | local SQLite/KV/filesystem으로 한 application과 같이 관리해요. | S3/RustFS/Azure SQL, asset catalog, thumbnail, migration/rollback, keep-alive/concurrency tuning을 제공해요. | **구조 대안.** 대규모 asset scale은 HJ, 현 환경 단순성은 현재가 장점이에요. |
| D12 | Orphan-media deletion | server가 canonical DB와 persona icon/gallery/folder/module/inlay refs를 다시 걸어 보고 실패 시 삭제를 거부해요. | browser가 `Promise.allSettled` 후 후보 key를 계산하고 server generic delete가 받은 key를 삭제해요. | **현재 우위.** HJ delete authority는 fail-closed contract를 충족하지 않아요. |
| D13 | CharX import integrity | central/local directory, CRC, duplicate/path/overlap, entry/aggregate cap, cancellation, terminal receipt를 확인해요. | bulk asset save와 server-side streaming CharX ZIP/ZIP64 export가 있어요. | import integrity는 현재, large export streaming은 HJ가 장점이에요. 한쪽만 port하면 round trip이 깨져요. |
| D14 | Import UX | blocking modal 대신 progress toast, one source read, server-confirmed character/chats/assets 뒤 success예요. | RisuAI import flow에 SQL/bulk storage를 결합해요. | **현재 우위** for terminal UX/durability; HJ bulk transport는 참고 가치가 있어요. |
| D15 | Request logs/usage | masked and bounded server SQLite logs, filters/detail, token usage stats, BG bridge가 있어요. | client memory 최근 20 rows와 per-generation request view예요. | **현재 우위.** HJ의 SQL audit는 provider request logs와 다른 기능이에요. |
| D16 | Full-text message search | complete graph에 전역 message FTS가 없어요. | PostgreSQL FTS로 active/cold messages를 검색하고 exact chat position으로 이동해요. | **HJ 우위**, 단 PostgreSQL schema 의존이에요. |
| D17 | DB revision/table explorer | storage dashboard와 backup/snapshot state는 있지만 row/table explorer는 없어요. | read-only table explorer에서 revision history, audit inspector, diff modal, restore까지 확장돼요. | **HJ 우위**, 별도 backend-migration 범위예요. |

## 6. Character, persona, and presentation comparison

| ID | 기능 | 현재 PocketRisu + patcher | Haejeok | provisional 판정 |
| --- | --- | --- | --- | --- |
| U01 | Character catalog shell | Grid/List/Simple/Trash와 current canonical order를 유지해요. | responsive 2–6 column MainMenu, progressive paging, batched WebP thumbnails를 제공해요. | **HJ 우위** in browsing UX. MainMenu whole replacement보다 current catalog extension이 적합해요. |
| U02 | Favorites/hidden/sort | 별도 favorite/hidden view와 name/recent/favorite sort가 없어요. | `characterFavorites`/`characterHidden`, Favorites-only, Show Hidden, name/recent/favorites sort가 있어요. | **HJ 우위.** 다만 orphan ID normalization, localized labels, dedicated UI tests가 부족해요. |
| U03 | Search result ordering | HJ03 matcher만 사용하고 canonical/mobile recent order를 보존해요. | name/creator/tag score를 계산하고 query가 있으면 relevance sort해요. | current는 predictable order, HJ는 relevance가 장점이에요. optional sort 후보예요. |
| U04 | Recent activity | character-level `lastInteraction`을 최근순으로 보여 주고 10개씩 reveal해요. | 최근 session 최대 50개를 chat별로 name/folder/snippet/time과 함께 검색해요. | **HJ 우위.** lazy-safe metadata 없이 그대로 port하면 hydration/memory 문제가 생길 수 있어요. |
| U05 | Character organizer | 4×4 root/folder pages, explicit one-step arrange, local empty-folder draft, non-destructive folder removal이에요. | 기존 drag `characterOrder`와 new catalog views가 중심이에요. | **현재 우위** for canonical mobile-safe folder editing. HJ catalog와 상호보완돼요. |
| U06 | Persona organizer | folder/order/gallery/active image/picker scope/search/bulk delete와 모든 asset walker를 연결해요. | flat drag-order list와 one icon per persona가 중심이에요. | **현재 우위.** HJ SQL persistence만 구조상 장점이에요. |
| U07 | Korean matching | substring/choseong/partial Hangul/jamo, both keyboard-error directions, romanization, creator/tag; default order 유지예요. | 같은 기반과 score가 있지만 Hangul→QWERTY reverse conversion은 없고 phonetic expansion이 더 넓어요. | matcher는 current adaptation이 더 보수적이고 넓어요. HJ score UI만 남은 차이예요. |
| U08 | Chat width | Small 600, Standard 768, Wide 1152, Full을 message/card/creator-note/composer/theme-preset 한 authority로 맞추고 Standard theme에 한정해요. | 600/800/1200/Full을 `Chat.svelte` message wrapper에 직접 적용하고 theme 제한은 없어요. | 현재는 host consistency, HJ는 all-theme simplicity가 장점이에요. Current HJ01 adaptation을 유지해요. |
| U09 | Textarea resize/input tools | generic input action bar의 copy/reset/popup editor, K16 hotkey가 있고 drag resize는 없어요. | global switch가 105 generic textarea instances에 drag handle을 달아요. | HJ가 unique outcome을 갖지만 original은 unbounded geometry, duplicate ID, incomplete keyboard/pointer cleanup, no tests예요. screen-local redesign 후보예요. |
| U10 | Low-spec mode | user-controlled 30/15 render counts, lazy inactive chat, balanced render default, BG를 독립 owner로 제공해요. | one switch가 4/6 render, active 40 retention, thumbnail/cache caps, deferred loaders를 묶어요. | HJ가 one-click outcome은 우위예요. SQL message compaction을 제외한 preset/thumbnail/cache slices만 후보예요. |
| U11 | Personal appearance | eight chat fonts, alignment, Korean word break, code wrap, minimal composer, send icon, sidebar/settings density, jailbreak visibility, Safe Mode예요. | general RisuAI display/theme plus width/resize/low-spec가 중심이에요. | **현재 우위** for these exact personal controls. |
| U12 | Post-import navigation | opt-in으로 imported character를 저장하되 current import-start screen을 유지해요. | import 완료 뒤 imported character로 이동하는 flow예요. | **현재 우위.** |
| U13 | Chat/log export | JSON/TXT/HTML/HTML clipboard와 current-chat screenshot이 있어요. | range/single export, Markdown, themed HTML, image split/stitch, WebM→WebP를 추가해요. | **HJ 우위** in outcome. Range/Markdown/themed HTML과 ffmpeg media pipeline을 분리해야 해요. |
| U14 | Asset viewer | native character AssetViewer에 dialog/controls/labels a11y를 더해요. | Storage Explorer의 file preview와 bot/module inspector가 있어요. | 서로 다른 scope예요. character asset consumption은 current, server inventory browsing은 HJ가 강해요. |
| U15 | Storage UI | disk/SQLite/WAL/chunks/orphans/character/module/backup stats, optimize, safe purge예요. | full files explorer, sort/filter/thumbnail, backend config/migration, bot/module analysis예요. | current는 safe operations summary, HJ는 breadth/discovery가 우위예요. read-only slices는 후보예요. |

### U01–U04 HJ source observations

- Character management source:
  `f6040fa791688be13e4c4a49c8fee5e818f8cc16`.
- Recent sessions source:
  `383dbe395a2d4c3e71e698564b57d5211dce8888`.
- Inactive-session timestamp correction:
  `7fab66641bd7dc220d56413368158f01c62f90a0`.
- MainMenu has no dedicated filter/sort/context-menu component tests. Korean
  matcher and thumbnail loaders do have focused tests.
- Some MainMenu labels remain hard-coded English. Long-press cleanup observes
  `touchend` but not `touchcancel`.
- `characterFavorites`/`characterHidden` default to arrays, but no load-time
  dedupe/deleted-character cleanup or dedicated test was found.

## 7. Generation, parser, and interaction comparison

| ID | 기능 | 현재 PocketRisu + patcher | Haejeok | provisional 판정 |
| --- | --- | --- | --- | --- |
| G01 | ChatML/Thoughts/CBS parser | terminal assistant marker, multiple Thoughts extraction, CBS logical precedence regressions를 tests로 닫아요. | pinned tip에도 greedy Thoughts와 세 skipped specifications가 남아 있어요. | **현재 우위.** |
| G02 | OpenAI/Google SSE framing | one replayable pure parser가 split UTF-8, LF/CRLF/bare CR, multiline data, comments/BOM, malformed recovery, EOF를 처리해요. | provider별 decoder/line splitting을 유지해요. | **현재 우위.** |
| G03 | Streaming render | native Balanced/Strong owner에 live generation identity, metadata update, local/global reload distinction, translation deferral, BG handoff를 추가해요. | native modes와 low-spec coalescing을 사용하지만 durable BG lifecycle 결합은 없어요. | current correctness/BG가 강하고 HJ broader performance work는 참고 가치가 있어요. |
| G04 | Partial edit | one screen manager가 chat/message/data/DOM/swipe/translation-cache identity와 stale target을 검증해요. | message마다 `PartialEditController`를 mount해요. | **현재 우위** for listener count, stale edit, translated CAS. |
| G05 | Hotkeys | global enable, non-mutating exact matcher, bounded adjacent-character helper, idempotent listeners예요. | matcher가 saved object에 defaults를 쓰고, first sorted character에서 `nextChar`도 반환하는 boundary가 있어요. | **현재 우위.** |
| G06 | Mobile gesture/back | primary pointer tracking/cleanup과 opt-in same-page back guard가 있어요. | touch gesture는 있지만 equivalent back guard가 없어요. | **현재 우위.** |
| G07 | HypaMemory management | native search/category/tag/bulk/reroll에 contiguous-frontier manual summary, stale identity, preview/reroll/apply를 더해요. | 같은 broad native UI와 Node vector offload가 있어요. | manual workflow/BG safety는 current; Node compute는 HJ의 별도 장점이에요. |
| G08 | Node token/lore/vector compute | ordinary UI generation은 이미 complete BG server bundle 안에서 preprocessing을 수행해요. | browser client가 `/api/tokenize-count`, lore match/resolve, vector index/search를 호출해요. | HJ outcome은 존재하지만 ordinary path에서는 중복이에요. client-only bottleneck measurement가 reopen trigger예요. |
| G09 | Translation cache/tools | progressive list/search/copy/edit/delete, unused preview/confirmed cleanup, expected-value identity, cancellation, K15 CAS예요. | basic persistent cache search/set plus import/export/clear가 있어요. | **현재 우위.** |
| G10 | Prompt-preset integrity | index-based PocketRisu schema에서 missing/invalid/deletion index를 normalize해요. | SQL ID-based `PresetStore`가 default/create/save/reorder/delete/active ID를 transaction으로 처리해요. | 각 architecture에 맞는 방식이에요. HJ ID model은 더 강하지만 SQL migration 없이는 port 대상이 아니에요. |
| G11 | Prompt-role compatibility | `assistant/char→bot`, cache role, present `role2` priority를 normalize하고 test해요. | pinned HJ도 같은 role/cache normalizers를 갖고 있어요. | **거의 동등.** |
| G12 | Text-theme normalization | `standard/highcontrast/custom`만 허용하고 DB/preset/runtime을 tests로 고정해요. | theme defaults/UI는 있지만 same independent normalization/test owner는 없어요. | current가 좁게 우위예요. |
| G13 | Toolchain | exact PocketRisu target의 Node 25 incomplete `localStorage`와 Lightning CSS issue를 scope해요. | Vite 8/Tailwind 4/newer RisuAI/Tauri stack으로 이동해요. | target stability vs product modernization이에요. 직접 port 관계가 아니에요. |
| G14 | Deployment/onboarding | current NodeOnly operational model을 유지해요. | Docker+PostgreSQL+RustFS+restic, Tauri, onboarding/mascot, account removal policy가 있어요. | HJ product scope가 넓지만 current patch line 밖이에요. |

## 8. HJ01–HJ08 re-evaluation

| ID | Original HJ outcome | One-to-one comparison result | Provisional action |
| --- | --- | --- | --- |
| HJ01 | Adjustable chat width | Current adaptation adds only missing 600px to native one-owner width and is more internally consistent than HJ's message-only field. | **Keep admitted.** |
| HJ02 | Global textarea resize | Current lacks resize, so the outcome is not duplicate. HJ implementation quality is insufficient for 105 generic inputs. | **Reopen outcome, reject source design.** Screen-local/prop opt-in redesign only. |
| HJ03 | Korean character search | Matcher outcome is admitted and strengthened. HJ's relevance sorting and richer catalog shell remain unintegrated. | **Keep matcher admitted; split catalog/relevance into new candidate.** |
| HJ04 | Persistence ordering | Current lazy/BG adaptation preserves the intended result and broader authority. | **Keep admitted.** |
| HJ05 | Low-spec/paging/cache | Aggregate SQL message compaction conflicts, but one-click low-spec preset, thumbnail batching, and owner-specific cache caps are real missing outcomes. | **Reopen narrow slices; keep SQL compaction excluded.** |
| HJ06 | ZIP64 streaming | HJ export is useful, but current importer rejects selected payload above 1 GiB and backup is not ZIP. | **Blocked pending reproduced failure and coherent import/export policy.** |
| HJ07 | Node compute | Real HJ feature, but ordinary current sends already compute server-side inside BG. | **Measurement-triggered client-only candidate.** |
| HJ08 | Log exporter/media pipeline | Current exporter is materially less capable, so the whole outcome should not be closed. Full ffmpeg/CDN source remains too broad. | **Reopen as stages: range/single/Markdown → themed HTML → separately audited media pipeline.** |

The earlier “HJ02/HJ05/HJ06/HJ07/HJ08 all closed” planning conclusion is too
coarse after this paired comparison. The corrected distinction is:

- original source/design may be rejected;
- user outcome may still be valuable;
- owner-local redesign can remain a candidate;
- architecture migrations and trigger-dependent work stay separate.

This document does not edit the older plan yet. External review should decide
whether the revised classification is factually and architecturally justified.

## 9. HJ-only or HJ-stronger outcomes beyond HJ01–HJ08

| ID | Outcome | HJ source | Current gap | Provisional disposition |
| --- | --- | --- | --- | --- |
| X01 | Favorite/hidden/name/recent/favorite character views | `src/lib/UI/MainMenu.svelte`, commit `f6040fa791688be13e4c4a49c8fee5e818f8cc16` | Current catalog lacks these views. | **High-value selective candidate.** Preserve canonical folder/order default. |
| X02 | Session-level recent list with search/snippet/folder | `src/lib/SideBars/RecentSessionsList.svelte`, commits `383dbe395a2d4c3e71e698564b57d5211dce8888`, `7fab66641bd7dc220d56413368158f01c62f90a0` | Current recent list is character-level only. | **High-value candidate**, but must be lazy-safe without hydrating every chat. |
| X03 | PostgreSQL active/cold full-text message search | `src/lib/Others/MessageSearch.svelte`, `server/node/postgresStorage.cjs`, commit `12d6479cca68cacf749fc09bd716b689326b36d8` | No current global message FTS. | **Backend-project only** unless a safe SQLite index owner is designed. |
| X04 | DB revisions/audit/diff | `src/lib/Setting/Pages/DbExplorer/`, `server/node/*Storage.cjs`, commits `270f38c54dd4b8d7b1cee259c40f29bf9ebebcce`, `60489e18afccd3eb6b850e5112e593d7152ca0c8` | Current has backup snapshots, not row audit history. | **Backend-project only.** |
| X05 | Full Storage Explorer | `src/lib/Setting/Pages/StorageExplorer*`, `server/node/assetStorage.cjs`, commits `d606f11a1f00696f3f4e548ef791af80c2d6d0d3`, `96b56e08507ce4288b13ec0651c3686348c93416`, `58b980ca8d78ac70a9a57ad4644edd4a59e7d8fe`, `733fb0ec917d85924d120ef2ff2cb1e41d7ee8a3` | Current dashboard lacks file-level browser and backend migration UI. | **Read-only slices are candidates.** Generic delete/backend migration stay excluded or separate. |
| X06 | Docker multi-service deployment and restic | root/deploy scripts and README at pinned tip | Current targets existing NodeOnly deployment. | **Product/deployment project, not patch admission.** |

## 10. Revised candidate ordering for external review

This ordering is a hypothesis for revalidation, not an approved implementation
schedule.

1. **Catalog views:** X01 favorites/hidden/sort and optional relevance sort,
   rebuilt in the existing GridCatalog/MobileCharacters/character-organizer
   authority.
2. **Recent sessions:** X02 with lazy-safe chat metadata and no bulk hydration.
3. **Exporter stage A:** HJ08 range/single/Markdown on the existing exporter.
4. **Exporter stage B:** themed HTML using current render/parser owners, without
   ffmpeg/unpkg.
5. **Low-spec slices:** HJ05 preset, character thumbnails, measured
   owner-specific cache caps; no SQL MessageStore compaction.
6. **Screen-local resize:** HJ02 only after a specific editor need is named.
7. **Read-only storage exploration:** X05 only after comparison with the current
   SystemDashboard identifies a distinct missing view.
8. **Trigger-dependent:** HJ06 after actual archive failure; HJ07 after measured
   client-only preprocessing bottleneck.
9. **Separate migrations:** D01/D11/D16/D17/X03/X04/X06.

Explicitly exclude from the patch line:

- browser-selected generic asset deletion without canonical server re-walk;
- whole SQL/S3 authority stacked on current SQLite/lazy owners;
- branding/mascot/account removal/updater policy;
- whole HJ MainMenu or LogExporter copy without adapting ownership and tests.

## 11. Raw exact-1.10 pack/path intersection

The counts below intersect each resolved pack's exact-1.10 declared distinct
source paths with Haejeok's 547 final changed paths. They measure collision
surface only, not equivalent behavior.

| Resolved pack/adapter | HJ-intersecting / exact-1.10 declared paths |
| --- | ---: |
| `bg-preserve` | 19 / 93 |
| `character-import-ux` | 8 / 19 |
| `character-organizer` | 1 / 5 |
| `charx-archive-integrity` | 4 / 9 |
| `client-build-fence` | 6 / 20 |
| `client-build-fence-bg-adapter` | 0 / 3 |
| `client-build-fence-kei-adapter` | 0 / 1 |
| `client-build-fence-kei-lazy-storage-adapter` | 1 / 1 |
| `haejeok-chat-width-adapter` | 7 / 10 |
| `haejeok-korean-search-adapter` | 4 / 6 |
| `haejeok-persistence-safety-adapter` | 4 / 6 |
| `kei-backup-restore-safety-core` | 1 / 7 |
| `kei-backup-restore-safety-lazy-adapter` | 3 / 3 |
| `kei-chat-render-bg-adapter` | 4 / 4 |
| `kei-chat-render-core` | 0 / 2 |
| `kei-fullscreen-image-viewer-core` | 0 / 1 |
| `kei-hypa-tools-bg-adapter` | 5 / 6 |
| `kei-hypa-tools-core` | 0 / 4 |
| `kei-mobile-navigation-core` | 0 / 4 |
| `kei-mobile-navigation-lazy-adapter` | 10 / 12 |
| `kei-partial-edit-bg-adapter` | 4 / 4 |
| `kei-partial-edit-core` | 0 / 4 |
| `kei-prompt-role-compat-core` | 1 / 2 |
| `kei-stream-parser-bg-adapter` | 2 / 2 |
| `kei-stream-parser-core` | 0 / 4 |
| `kei-text-theme-normalization-core` | 2 / 6 |
| `kei-translation-tools-bg-adapter` | 4 / 5 |
| `kei-translation-tools-core` | 0 / 10 |
| `lazy-chat-bg-adapter` | 2 / 4 |
| `lazy-chat-sync` | 8 / 27 |
| `parser-hardening` | 5 / 9 |
| `persona-organizer` | 7 / 13 |
| `personal-settings` | 13 / 37 |
| `pocketrisu-kei` meta pack | 0 / 0 |
| `preset-integrity` | 1 / 3 |
| `server-backup-snapshot-core` | 0 / 6 |
| `server-backup-snapshot-lazy-adapter` | 1 / 1 |
| `toolchain-hardening` | 2 / 3 |

## 12. HJ01–HJ08 exact source commit ledger

### HJ01 — width

- `0243d0781fdbcca0768fa8ef2c0df6d365d8d27f`

### HJ02 — textarea resize

- `70ff40f2ba47becaa5d3371c7543faac3ea1dc5e`
- `97771e17df4687661cf392f10aaca51a847138fb`
- `13d5ec632a145349dd5ee31fddec667d732091e4`

### HJ03 — Korean search

- `86ee613c04e88f22bfcd0fb80267eb458a1a4408`
- `1e5f9eeed2fa5b881502affba9d5289dca625cdb`

### HJ04 — persistence ordering

- `0fd90fcfbfe9b7136eade9d9bc3320c3744626d2`
- `23bb743765ce6af5c8390d182cc3a7e08c8ce810`
- `313ecdff7c2c24d01611a7b735fd5435c4f0a65d`
- `3b5b3d39425a6297e8ea8a634e6d957e17c7b771`
- equivalence-only review: `e78f9c91fea5a059d38de271117f8dbfac5f45ef`

### HJ05 — low-spec/performance cluster

- `14be158420bc14ba9e1c2de4cad6275092ebdf1f`
- `9c5ef6051d3842d86e7986bf68dbcc1405aadedc`
- `9021c009b3c1ba6947d4de5cfd4c0bb1debdd73e`
- `0c6d67caa69861d2b637cccd66a77882d35cc987`
- `92770ab258a666323d7362afaec7f3e4b25b19ff`
- `4a3d55ada490ada6f0aef859b4daba1eecdcbbce`
- `c1067fcbf459a0fbf2cecd29100c31df2ea14fac`
- `6ef9592ed3954c6b18f387a9527b542a0a7f096d`
- `e48296e3ff5601366379e41ae491de41ba38b047`

### HJ06 — streaming CharX ZIP64

- `eed465f8d3db130a5655040c8c5f914227e7be26`
- `a7fa3ee2cced59429801dba19a8a1c5703a63ea0`

### HJ07 — Node compute

- `3be25916ba66ae82386979664094c064b7d8327c`
- `b54922a9af9936fc95c92e1cbc2ed0624af72d02`
- `570b4d09ddbf1469c0384c1ebe67152863a91ed8`
- `e2a3e96418f1a666b8f6e2a0b215ec0203b26591`

### HJ08 — LogExporter

- `7a7c7222424fd6afa68e068fc21b82aef838da4a`
- `05e6019e681f40cc7e80c34a4e2f79e92ec41226`
- `5db46bde57e6983a4f80d811aa0f4fd5339f8875`
- `904f6b77f7c6035c96e64030903356e20c69da60`
- `1038aa02f51ef6f28d2b121c5532174959ce7068`
- `f9a32cb7224bb50f18ad51e777011b60f618a2e1`

## 13. Open questions requiring independent revalidation

### Factual/source questions

1. Haejeok `e9d03568`에 current BG operation ledger와 동등한 숨은 경로가
   정말 없는가?
2. HJ SQL `MessageStore`의 active compaction과 generation full-history
   hydration 사이에 이 감사가 놓친 보존 barrier가 있는가?
3. `MainMenu` favorite/hidden arrays가 다른 store/normalizer에서 정리되는가?
4. `RecentSessionsList`가 unloaded SQL chat의 snippet/time을 실제로 얼마나
   보존하는가?
5. HJ LogExporter의 parsed HTML/custom CSS path에 이미 상위 sanitizer contract가
   있어 hostile markup 위험을 줄이는가?
6. HJ ZIP64 writer가 true >32-bit size/offset/count를 다른 test나 runtime에서
   검증했는가?
7. Node lore regex/vector endpoints가 worker/timeout/concurrency layer에서
   격리되는 다른 owner가 있는가?
8. HJ request log에 persistent/masked/usage-stat owner가 별도로 존재하는가?

### Comparative-design questions

9. X01 catalog views를 current GridCatalog에 추가할 때 canonical
   `characterOrder`/folder authority를 훼손하지 않는 최소 state는 무엇인가?
10. X02 recent sessions를 chat hydration 없이 제공할 metadata schema는
    무엇이어야 하는가?
11. HJ08 stage A가 existing JSON import round trip을 보존하려면 subset JSON을
    새 chat으로 정의해야 하는가, 아니면 text/Markdown/HTML만 range를 허용해야
    하는가?
12. HJ05 low-spec preset은 saved 30/15 값을 override해야 하는가, 별도 값을
    써야 하는가, 아니면 user-selected 30/15를 그대로 존중해야 하는가?
13. read-only Storage Explorer가 current SystemDashboard보다 실제로 추가하는
    user outcome은 file inventory/preview 중 어디까지인가?
14. current all-or-nothing delivery에서 HJ08 media dependency의 모든-user cost를
    정당화할 사용 빈도/요구가 있는가?

### Evidence questions

15. current capability 중 이 문서가 live/device-qualified로 과장한 항목이
    있는가?
16. Haejeok feature 중 source existence만으로 stable behavior를 과장한 항목이
    있는가?
17. direct-path intersection 표에서 target scope나 dynamically referenced file을
    빠뜨렸는가?
18. 각 provisional 판정에 반대되는 counterexample이 있는가?

## 14. External reviewer response format

각 검토자는 가능한 한 아래 표를 채워 주세요.

| Claim ID | 판정 | 근거 commit/path/line 또는 runtime observation | 교정 내용 | 통합 판단 영향 | confidence |
| --- | --- | --- | --- | --- | --- |
| 예: U02 | Confirm / Correct / Unclear | `e9d...:src/lib/UI/MainMenu.svelte` | orphan-ID cleanup이 다른 file에 있으면 명시 | X01 admission 상승/하락 | high/medium/low |

판정 정의:

- `Confirm`: claim과 provisional 비교가 source/runtime 근거로 지지돼요.
- `Correct`: 사실·범위·인과·판정을 고쳐야 해요.
- `Unclear`: source만으로 결정할 수 없고 실행 또는 사용자 선택이 필요해요.

검토 결과에는 다음도 함께 적어 주세요.

1. 누락된 current 기능;
2. 누락된 HJ 기능;
3. 잘못 묶인 기능 owner;
4. data-loss/security/privacy/performance counterexample;
5. 추천 candidate 순서;
6. 실행하지 못한 검증과 그 이유;
7. 검토한 exact revision.

## 15. Reconciliation gate after external review

외부 결과를 가져온 뒤 다음 순서로만 정본을 갱신해요.

1. claim별 Confirm/Correct/Unclear를 source에서 spot-check해요.
2. 서로 충돌하는 reviewer 결과는 근거 수준과 exact revision을 비교해요.
3. runtime이 필요한 claim은 disposable target 또는 현재 관측 채널로 직접
   재현해요.
4. 이 문서의 provisional 판정표를 수정해요.
5. 그 뒤에만 `HAEJEOK-REMAINING-CANDIDATE-DESIGN-AUDIT.md`,
   `HAEJEOK-INTEGRATION-PLAN.md`, overlap audit, provenance, notices,
   CHANGELOG의 결론을 한 번에 정합화해요.
6. 사용자 승인 전에는 새 HJ pack/adapter, dependency, generated installer,
   live source, stable tag/release를 만들지 않아요.

## 16. Current provisional summary

- 이미 통합된 HJ 결과: HJ01, HJ03, HJ04.
- 독립 검증 후 다시 열 가치가 큰 결과: X01 catalog views, X02 recent
  sessions, HJ08 staged export.
- 좁게 다시 설계할 결과: HJ05 low-spec slices, HJ02 screen-local resize,
  X05 read-only explorer.
- 재현/측정이 먼저인 결과: HJ06, HJ07.
- 별도 migration/product project: SQL/S3/message FTS/revision explorer,
  deployment/onboarding.
- 계속 제외할 원본 authority: browser-selected generic asset delete,
  whole-fork branding/account/updater policy.

이 요약은 외부 재검증 결과가 들어오기 전까지 확정 결론이 아니에요.
