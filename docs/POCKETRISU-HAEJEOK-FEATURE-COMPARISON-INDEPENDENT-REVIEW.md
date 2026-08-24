# PocketRisu + patcher vs Haejeok independent critical revalidation

> 검토 상태: **독립 source/caller 재검증 완료 / bounded runtime 후속 완료 /
> Haejeok product qualification 미완료**
>
> 검토 시각: 2026-08-24 KST
>
> 검토 대상 문서: `POCKETRISU-HAEJEOK-FEATURE-COMPARISON-REVALIDATION.md`
> commit `076646605b344e5e18943270838859f11f7550dc`, SHA-256
> `b1691e20b5ab6caf5e5c34033e4ee15a279726cc1d59b26f4d0e312fd9b09488`
>
> 이 보고서는 독립 source-level reviewer 결과를 보존해요. 후속 runtime 관찰과
> 일곱 증거 축 reconciliation은
> [`POCKETRISU-HAEJEOK-RUNTIME-VALIDATION.md`](POCKETRISU-HAEJEOK-RUNTIME-VALIDATION.md)에
> 기록해요. 어느 쪽도 Haejeok의 Oracle/iPhone product qualification이나 새 pack
> admission 승인이 아니에요.

## 1. 결론

원문의 **frozen basis, 비교 방향, architecture migration 분리, provisional
표시, raw intersection 산식**은 강해요. 반면 **source existence, final caller,
persisted-state lifecycle, 안전성, runtime evidence, 사용자 가치, admission**을
한 verdict에 섞어서 여러 항목의 확실성을 실제보다 높게 표현했어요.

46개 source-fact 행을 같은 기준으로 다시 판정한 결과는 다음과 같아요.

| 영역 | Confirm | Correct | 합계 |
| --- | ---: | ---: | ---: |
| D01–D17 | 4 | 13 | 17 |
| U01–U15 | 8 | 7 | 15 |
| G01–G14 | 8 | 6 | 14 |
| **합계** | **20** | **26** | **46** |

`Correct`는 오류의 크기가 같다는 뜻이 아니에요. nominal px 표현이나 범위
한정 같은 작은 보정부터 HJ orphan deletion·LogExporter sanitizer bypass·SQL
dirty-write loss 같은 높은 위험의 반례까지 포함해요. 따라서 이 숫자를 단순
정확도 백분율로 환산하면 안 돼요.

현재 결론은 다음과 같아요.

- HJ01, HJ03, HJ04의 current adaptation과 기존 L3 결론은 유지해요.
- HJ02와 HJ05는 source에 distinct slice가 있다는 이유만으로 active reopen하지
  말고, named user problem 또는 owner-specific measurement trigger를 유지해야 해요.
- HJ06 writer는 actual 4 GiB+1·65,536-entry Info-ZIP 경계를 통과했지만 importer
  CRC와 50 MiB entry/round-trip policy가 불일치하므로 blocked가 맞아요.
- HJ07은 client-only bottleneck뿐 아니라 Node event-loop isolation 측정이 먼저예요.
- HJ08은 기존 stage ordering을 그대로 쓰면 안 돼요. actual Chromium에서도
  `notrim` final DOM과 custom-style document boundary 문제가 관찰됐고 frozen UMD
  ffmpeg core load는 실패했어요. sanitizer/restore schema와 stable message
  identity가 먼저이며 WebM/ffmpeg source는 admission 근거가 아니에요.
- X01/X02/X05의 source gap은 확인되지만 `high-value`는 source에서 증명되지
  않았어요. user demand·privacy·runtime cost를 별도 gate로 둬야 해요.
- X04는 단순 backend migration이 아니라 audit retention/redaction/privacy
  deletion/asset consistency project예요.

## 2. 재현된 정본과 산식

### 2.1 Frozen revisions

| 항목 | 독립 관찰 |
| --- | --- |
| Official PocketRisu | `98e968339d1b3f91b9dac85bb3f2ebb5f90f9d14`, exact tag `v1.10.0` |
| Patcher checkpoint | `2671b73c0cf97b84b754a8c62a02cc5180dc5490`; 이후 `0766466`까지 graph/source diff 없이 원문 한 파일만 추가 |
| Haejeok | clean `e9d035683cdf9f0207eed193ee36f9bdb117f658`, tag `b6254` |
| HJ/RisuAI merge base | `22ea4a64b7a2178ca10957dc53f14a0404e31587` |
| PocketRisu/HJ merge base | `b8b4de1d1d1072815d8f6ca957fec0a9e6a95dee` |
| HJ delta | 173 commits, 547 final changed paths |
| Raw PocketRisu/HJ tree diff | 1,243 paths |

### 2.2 Current complete graph

`plan --all --json`을 applied exact-1.10 target에서 다시 실행했어요.

- 13 visible requested roots;
- 12 effective roots (`startup-cache`가 `lazy-chat-sync`에 superseded);
- 38 resolved packs/adapters;
- 769 exact-1.10 units;
- 280 managed paths;
- changed files 0;
- compatibility `under-review`.

원문의 38개 pack/path intersection 행을 manifest의 exact-1.10 unit path와
HJ 547-path set에서 재계산했어요. **38/38 모두 일치**했어요. 추가로 unique
union은 64/280 paths, intersection이 하나 이상인 pack은 27/38이고, pack별
intersection 합 129는 shared path 중복 때문에 더할 수 있는 총계가 아니에요.

이 표가 증명하는 것은 raw collision surface뿐이에요.

- HJ-specific 547-path delta이지 HJ product 전체와 current 전체의 차이가 아니에요.
- 같은 data/authority를 다른 filename에서 건드리는 semantic overlap을 놓쳐요.
- dynamic import, generated caller, package/dependency, runtime state owner를
  자동으로 포함하지 않아요.
- 같은 path가 있다는 이유로 기능 동등성이나 conflict를 증명하지 않아요.

### 2.3 Commit ledger

HJ01–HJ08 ledger의 32개 SHA는 모두 존재하고, 모두 `22ea4a64..e9d03568`
delta 안의 ancestor예요. 그러나 이는 **substantive origin commit ledger**로는
정확하지만 **final behavior exact ledger**로는 부족해요.

예를 들면 다음 final modifiers가 결론에 실질적으로 관여해요.

- paging/generation metadata barrier: `dc016def`;
- U01 thumbnail/final layout: `7fce3d5a`, `4808ae53`, `92770ab2`;
- X02 domain-store/timestamp behavior: `9874993a`, `18d78be3`, `7fab6664`;
- X05 orphan/missing-ref/final UI: `e46c9f29`, `1e4342cc`와 후속 explorer commits;
- Web/Tauri transaction hardening: `9a52998d`;
- PostgreSQL schema recreation recovery: `10ca76cb`;
- SQL outage recovery UI/diagnostics: `77e778d3`;
- legacy encrypted backup fail-closed behavior: `1c8f6491`.

섹션 이름을 `substantive source commits`로 바꾸거나, claim별 final caller
history를 별도 generated ledger로 두는 편이 정확해요.

## 3. 방법론 비판

### 3.1 잘한 점

- exact revision과 tag를 고정했어요.
- Haejeok을 PocketRisu의 작은 downstream patch로 오해하지 않았어요.
- path overlap과 기능 동등성을 분리했어요.
- source 존재와 runtime qualification의 차이를 명시했어요.
- 원본 이식과 owner-local 재구현을 분리했어요.
- architecture migration, deployment product, focused patch를 구분했어요.
- provisional 상태와 reconciliation gate를 명시했어요.

### 3.2 핵심 약점

1. §3.3의 `HJ 우위 = 실제 사용자 결과`는 §3.2의 `HJ를 설치·runtime
   qualification하지 않음`과 모순돼요. 현 증거로 말할 수 있는 것은
   `source-backed capability` 또는 `reachable source surface`예요.
2. 한 행의 verdict가 source fact, implementation quality, test level, UX 선호,
   integration fit, priority를 섞어요. 이 여섯 항목은 분리해야 해요.
3. current 쪽 exact-1.10 graph는 여전히 `under-review`인데, 표만 읽으면 모든
   current capability가 device-qualified된 것처럼 보일 수 있어요. HJ01/03/04
   외에는 receipt별 evidence level을 붙여야 해요.
4. final caller와 persisted-state failure lifecycle을 충분히 따라가지 않았어요.
   HJ dirty-set loss, dead WebM caller, paged range identity가 대표적이에요.
5. 외부 질문 중 Q2·Q3·Q4·Q5·Q8은 frozen source만 더 따라가도 상당 부분
   답할 수 있었어요. reviewer에게 넘기기 전에 내부 source question을 먼저
   닫는 편이 좋아요.
6. `high-value`와 candidate ordering은 source에서 증명할 수 없어요. 사용자
   요구, 실제 catalog/chat 규모, privacy preference, 사용 빈도, 측정된 문제를
   별도 근거로 요구해야 해요.
7. HJ만 적대적으로 보지 않고 current도 같은 기준으로 봐야 해요. current
   exporter metadata escaping과 screenshot failure state가 그 반례예요.

### 3.3 권장 evidence schema

각 claim을 다음 일곱 축으로 분리해야 해요.

| 축 | 기록할 내용 |
| --- | --- |
| Source fact | symbol과 data shape가 존재하는가 |
| Final caller | pinned tip에서 실제 user path가 호출하는가 |
| State lifecycle | load/mutate/commit/conflict/retry/reload/delete가 보존되는가 |
| Safety | data-loss, secret, hostile input, resource/cancel boundary가 있는가 |
| Test/runtime | unit, integration, disposable runtime, physical device 중 어디까지인가 |
| User value | 실제 요구·빈도·측정 문제인가, 단순 feature gap인가 |
| Admission | current owner와 composition 가능한가, 별도 product project인가 |

숫자에는 단위와 산출 명령을 붙여야 해요. 예를 들어 `105`는 current target의
runtime instance가 아니라 `<TextAreaInput` static tag 105개/32 files이고, HJ
tip은 104개/29 files예요. current의 600/768/1152는 root font가 기본일 때의
`37.5rem/48rem/72rem` nominal px예요.

## 4. 높은 위험의 교정 사항

### 4.1 HJ SQL ordering은 durable success가 아니에요

HJ domain stores는 pending/dirty state를 commit 전에 비운 뒤, SQL conflict나
network failure를 catch하여 로그만 남기고 정상 resolve해요.

- `src/ts/stores/domain/settingsStore.svelte.ts:147-185`;
- `src/ts/stores/domain/characterStore.svelte.ts:360-382`;
- `src/ts/stores/domain/messageStore.svelte.ts:35-75,78-118`;
- `src/ts/storage/sqlStorageFactory.ts:17-30`;
- `src/ts/storage/nodePostgresStorage.ts:1540-1569`.

같은 page의 commit은 serialize하지만 cross-client 409를 retry/rebase/reload하지
않아요. user turn append가 409를 만나도 generation이 계속되고 reload 뒤 turn이
사라질 수 있어요. 따라서 D04/D05의 HJ 쪽은 `success-path ordering`이고,
current HJ04는 HJ와 동등해서가 아니라 자체 strict lazy/BG save 때문에 더
강해요.

### 4.2 HJ orphan analysis에는 구체적인 live-reference deletion 경로가 있어요

`StorageExplorer/utils.ts:129-136`은 실제
`characterStore.ensureCharacterDetails()` 대신 존재하지 않는
`settingsStore.state.ensureCharacterDetails`를 찾아요. shallow character detail,
deferred module/background, plugin-owned references가 빠진 채 browser가 orphan을
계산하고, `server/node/server.cjs:4988-5002`는 canonical re-walk 없이 받은 key를
삭제해요.

이는 추상적인 fail-open contract 차이만이 아니라 additional/emotion/cc asset,
module/background/plugin asset을 실제 참조 중인데 지울 수 있는 반례예요. X05의
read-only slice도 `orphan`을 확정값이 아닌 `diagnostic candidate`로 표시해야
하고, HJ analysis/delete source는 참고 구현으로 쓰면 안 돼요.

### 4.3 HJ LogExporter는 preview/image에서 sanitizer를 우회해요

`chatData.svelte.ts:224-236`은 `ParseMarkdown(..., 'notrim')`을 호출하고,
`parser.svelte.ts:910-917`의 `notrim`은 DOMPurify 직전에 반환해요. 기본 renderer는
`script, button`만 제거한 뒤 `MessageContent.svelte:92-101`에서 `innerHTML`로
주입해요. exporter backup JSON도 message schema/HTML을 검증하지 않고 복원해요.

따라서 model/card/script 또는 조작된 `risuLogExporter` JSON의 event handler,
iframe/object류가 preview/image DOM에 들어갈 수 있어요. native `Chats`를 다시
거치는 standalone HTML path는 normal sanitizer를 사용하므로 모든 경로가 같은
위험은 아니지만, HJ08을 stable/safe outcome으로 볼 수는 없어요.

추가 final-caller 문제도 있어요.

- compacted chat의 numeric index를 full hydration 뒤 그대로 재사용해 range/single이
  다른 message를 고를 수 있어요.
- WebM→WebP 함수는 caller가 0이라 shipped outcome이 아니에요.
- `message split`은 message boundary가 아니라 fixed-height chunks예요.
- WebP + message split은 PNG blob을 `.webp` 이름으로 저장해요.
- edit UI는 callback이 연결되지 않아 export data를 바꾸지 않아요.
- HTML export는 selected exporter theme가 아니라 native `Chats`를 렌더해요.

HJ08은 `sanitizer/restore schema → stable message ID range/Markdown → 별도 visual
HTML` 순서로만 다시 볼 수 있어요. ffmpeg/WebM은 별도 product decision이에요.

### 4.4 HJ SQL audit는 privacy와 asset consistency 비용이 있어요

PostgreSQL `system.audit_log`는 settings, messages와 relation row의 before/after를
JSONB로 남겨요. redaction, retention, prune owner를 찾지 못했어요. provider API
key도 SQL setting relation에 있으므로 교체·삭제 전 값이 audit history에 남을
수 있어요.

revision restore는 SQL row만 되돌리고 FS/S3 asset payload를 되돌리지 않아요.
옛 asset reference만 복원되고 실제 payload가 없을 수 있어요. X04/D10에는
retention, secret redaction, privacy deletion, asset consistency gate가 필요해요.

### 4.5 HJ backup/CharX 경계는 source surface보다 좁아요

- application backup은 SQL snapshot 후 asset을 별도 list/read하므로 DB와 asset의
  한 epoch가 아니에요.
- `.risubackup` entry length는 uint32이고 full DB를 object→msgpack→deflate로 한
  번에 buffer해요.
- restore는 asset write 후 DB decode/replace를 수행해 later failure 시 partial
  asset mutation이 남을 수 있고 fresh pre-restore snapshot이 없어요.
- HJ streaming `fflate.Unzip` importer는 CRC를 별도 검증하지 않아요. pinned
  `fflate 0.8.2` STORE payload 한 byte를 바꾼 probe에서 `errors=[]`, corrupted
  bytes `[254,2,3,4]`를 관찰했어요.
- HJ importer도 per-entry 50 MiB 경계가 있어 large ZIP writer와 자체 round trip이
  일치하지 않아요.

ZIP64 writer는 synthetic `initialOffset > 4 GiB`에서 central offset extra,
ZIP64 EOCD/locator를 올바르게 썼고, 65,536 zero-size entries에서도 ZIP64 count와
classic 65,535 sentinel을 올바르게 썼어요. 그러나 true >4 GiB single entry,
external unzip interoperability, interrupted HTTP/browser download는 미검증이에요.

### 4.6 Node compute와 proxy의 실제 경계

HJ `/proxy-stream-jobs`는 create HTTP request와 분리된 process-memory job이고,
WS가 없을 때 bounded events를 잠시 보존해요. 따라서 단순 `request-lifetime`보다
강하지만 disk persistence, restart recovery, replay cursor, claim/ACK, client
reconnect, ax/main/post/chat commit은 없어요.

token/lore/vector endpoints는 auth와 input/memory cap은 있지만 worker, operation
timeout, concurrency queue가 없어요. user regex는 Node main thread에서 실행되고,
vector search query count도 별도 cap이 없어요. HJ07 측정에는 browser win뿐 아니라
server event-loop latency, regex worst case, concurrent generation, abort/fallback
parity가 포함돼야 해요.

## 5. D01–D17 claim revalidation

| ID | 판정 | 교정 또는 유지 결론 |
| --- | --- | --- |
| D01 | Correct | HJ backends는 환경별 conditional primary이고 동시에 쓰는 하나의 primary가 아니에요. Current도 SQLite/KV 외 filesystem asset과 별도 request-log DB가 있어 `single-source`는 한 application backup owner/단순 local deployment로 좁혀야 해요. scale 우위는 benchmark가 없어 Unclear예요. |
| D02 | Confirm | HJ SQL shallow load는 full `database.bin` decode를 피하고, current cache는 authoritative probe 뒤 채택해요. 구조 대안 판정이 맞아요. |
| D03 | Correct | 200/40 paging과 generation 전 full-history hydration barrier는 실제예요. 다만 load exception을 log 후 resolve하여 partial history generation이 가능하므로 success-path paging으로 한정해야 해요. |
| D04 | Correct | HJ 409 reject는 맞지만 자동 reload/retry나 rejected-write audit가 없고 dirty payload가 소실될 수 있어요. transaction/history 장점은 successful commits에만 적용돼요. |
| D05 | Correct | HJ user/script/plugin ordering은 존재하지만 store가 failure를 삼켜 durability는 보장하지 않아요. Current strict adaptation 우위는 유지해요. |
| D06 | Correct | current whole-pipeline durable ledger 우위는 유지해요. HJ near-match는 volatile in-memory proxy job이라고 명시해야 해요. |
| D07 | Confirm | HJ에서 동등한 `x-client-build`/426 authoritative-write fence를 찾지 못했어요. |
| D08 | Correct | current point-in-time application snapshot 우위는 맞아요. HJ는 한 epoch snapshot이 아니라 streaming application transport로 낮춰 표현해야 해요. |
| D09 | Correct | HJ quiesce/pg_dump/RustFS/restic tooling은 실제지만 default same-host restic과 manual restore예요. infrastructure tooling 우위이지 qualified DR 우위가 아니에요. |
| D10 | Correct | SQL revision restore와 current full-app restore는 상호보완이에요. HJ는 SQL rows only이며 audit privacy/asset gap을 명시해야 해요. |
| D11 | Correct | FS/S3/Azure asset source breadth는 실제지만 remote failure 시 process-lifetime local FS fallback이 있어요. scale/failover 우위는 runtime benchmark 없이는 Unclear예요. |
| D12 | Confirm | current fail-closed 우위는 맞고, HJ에는 wrong hydration owner와 missing refs 때문에 구체적인 live-asset deletion 반례가 있어요. |
| D13 | Correct | current import integrity와 HJ streaming export 구분은 맞아요. current per-entry 50 MiB/total 1 GiB, HJ CRC/50 MiB/true ZIP64 한계를 추가해야 해요. |
| D14 | Correct | HJ는 memory push 직후 success를 보이고 later debounced SQL failure를 관찰하지 않아요. current terminal durability 우위는 유지해요. |
| D15 | Correct | current는 persistent masked per-request log가 강해요. HJ도 active+cold persistent SQL token-usage aggregate가 있어 `usage 전체` current 우위는 아니에요. HJ browser request log는 raw body/header 최근 20개예요. |
| D16 | Confirm | PostgreSQL active+cold FTS와 exact navigation은 실제예요. Oracle은 substring search이고 backend behavior를 일반화하면 안 돼요. |
| D17 | Correct | Node SQL explorer/revision source는 실제지만 Web/Tauri methods는 stub/limited이고 UI도 NodeStorage에 hard-gate돼요. 모든 HJ environment 기능으로 일반화하면 안 돼요. |

## 6. U01–U15 claim revalidation

| ID | 판정 | 교정 또는 유지 결론 |
| --- | --- | --- |
| U01 | Correct | 2–6 columns/progressive/batched thumbnail source는 실제예요. final behavior는 후속 commits를 포함하고, column-major DOM 때문에 visual/tab order가 달라요. `HJ browsing UX 우위`는 runtime/user preference 없이 Unclear예요. |
| U02 | Confirm | favorites/hidden/sorts는 있어요. dedupe/type/live-ID cleanup과 UI tests가 없고 Show Hidden label이 state/action과 반대로 보여요. capability gap은 Confirm, high-value는 Unclear예요. |
| U03 | Correct | relevance sort는 query가 있을 때도 `sortMode=default`에서만 적용돼요. optional view 후보는 가능하지만 user value는 Unclear예요. |
| U04 | Correct | 최대 50개를 search 전에 자르므로 오래된 session은 검색하지 못해요. unloaded SQL chat은 name/folder/time은 보존하지만 snippet은 비어요. HJ 무조건 우위가 아니에요. |
| U05 | Confirm | current canonical mobile-safe organizer 우위를 유지해요. |
| U06 | Confirm | current persona folder/gallery/picker/ref walker exact feature 우위를 유지해요. |
| U07 | Confirm | current는 HJ matcher에 없는 Hangul→QWERTY 방향과 bounded expansion을 갖고 default order를 유지해요. |
| U08 | Correct | current 값은 rem의 nominal px이고 HJ는 literal px예요. current one-owner adaptation 유지 결론은 Confirm이에요. |
| U09 | Correct | 105는 current static tags 105/32 files이고 HJ tip은 104/29예요. global source design reject는 맞지만 named-screen need 전 active reopen은 Unclear예요. |
| U10 | Confirm | 30/15, 4/6, 200/40과 derived override는 맞아요. one-click convenience만으로 HJ 우위/reopen을 정당화하지 못해요. |
| U11 | Confirm | 명시한 exact personal controls에 한정한 current 우위는 맞아요. |
| U12 | Correct | HJ만 import 뒤 이동하는 것이 아니며 Realm은 native `goCharacterOnImport`를 존중해요. Current는 local/package/Realm에 explicit stay override를 더한 configurability superset이에요. |
| U13 | Correct | broader source surface는 있지만 sanitizer, range identity, dead WebM, fake message split, selected-theme/edit wiring 결함이 있어 stable/safe HJ 우위가 아니에요. |
| U14 | Confirm | scope가 다르다는 결론이 맞아요. HJ preview는 사실상 image preview이며 current AssetViewer에도 focus lifecycle 한계가 있어요. |
| U15 | Confirm | source breadth는 실제예요. read-only slice는 key inventory/ref mapping/missing refs/raw image diagnostic으로 한정하고 orphan/delete/migration과 분리해야 해요. |

## 7. G01–G14 claim revalidation

| ID | 판정 | 교정 또는 유지 결론 |
| --- | --- | --- |
| G01 | Correct | HJ greedy Thoughts는 ChatML/generation extraction에 해당하고 display parser는 nested scanner예요. 세 unconditional skipped specs는 정확하며 해당 scope에서는 current 우위예요. |
| G02 | Correct | legacy Chat Completions/Google framing은 current pure parser가 강해요. HJ에는 별도 OpenAI Responses streaming/tool/reasoning parser와 split/EOF tests가 있어 blanket current 우위가 아니에요. |
| G03 | Confirm | current structural streaming identity/BG lifecycle 결합이 강해요. HJ in-memory proxy near-match는 별도 D06 설명에 추가해요. |
| G04 | Confirm | HJ per-message controller와 current screen manager 차이 및 current identity/CAS 우위를 유지해요. |
| G05 | Correct | HJ saved object mutation은 맞고 adjacent-character bug는 first→next뿐 아니라 last→prev도 막는 양끝 대칭 문제예요. current 우위는 유지해요. |
| G06 | Confirm | current pointer cleanup/mobile-back guard 우위를 유지해요. HJ touchcancel/ignored-target cleanup 한계가 있어요. |
| G07 | Confirm | current manual workflow safety와 HJ Node vector outcome을 분리한 방향이 맞아요. Node performance 우위는 benchmark 없이 Unclear예요. |
| G08 | Correct | ordinary current BG preprocessing 중복 가설은 타당하지만 current TTS/emotion/image client paths와 HJ volatile proxy/vector scope를 분리하고 server event-loop risk를 gate에 넣어야 해요. |
| G09 | Confirm | current translation cache identity/cancellation/tooling 우위를 유지해요. |
| G10 | Confirm | architecture별 model이라는 결론은 맞아요. `HJ ID model이 더 강함`은 direct focused/runtime qualification 없이 Unclear예요. |
| G11 | Correct | HJ에는 typed item `role2` 부재 시 legacy `role→role2` fallback이 없어요. `거의 동등`이 아니라 current가 좁게 실질 우위예요. |
| G12 | Confirm | current independent normalization/test owner의 좁은 우위를 유지해요. |
| G13 | Correct | 양쪽 모두 Vite 8/Tailwind 4/Svelte 5/Vitest 4예요. shared modern stack + current test/CSS hardening 대 HJ Tauri/SQL breadth로 다시 써야 해요. |
| G14 | Confirm | HJ product/deployment breadth source는 실제이고 별도 product project 판정이 맞아요. mutable image/source와 runtime drill 부재로 stability는 Unclear예요. |

## 8. HJ01–HJ08 action revalidation

| ID | 판정 | 교정 action |
| --- | --- | --- |
| HJ01 | Confirm | Keep admitted. current native width authority와 Small 결합, focused tests, 기존 L3를 유지해요. |
| HJ02 | Correct | Global source design reject는 유지해요. `Reopen outcome` 대신 named screen/user pain이 생길 때만 screen-local research로 열어요. |
| HJ03 | Confirm | Matcher keep admitted. relevance/catalog는 별도 product candidate이며 자동 reopen하지 않아요. |
| HJ04 | Correct rationale | Keep admitted. HJ와 단순 동등해서가 아니라 current strict lazy/BG save가 의도한 outcome을 더 강하게 구현하고 L3를 통과했기 때문이에요. |
| HJ05 | Correct | Narrow inventory는 기록하되 measured owner problem 또는 explicit preset request 전까지 trigger-gated research로 유지해요. |
| HJ06 | Confirm blocked | actual failure + coherent import/export policy 전까지 blocked. CRC, per-entry/total, external unzip, browser interruption을 gate에 추가해요. |
| HJ07 | Confirm triggered | client-only bottleneck과 Node event-loop/concurrency/fallback parity 측정 뒤에만 열어요. |
| HJ08 | Correct high | Stage A 이전에 sanitizer/restore schema와 stable ID를 닫아요. 그 뒤 TXT/Markdown range, 별도 visual HTML 순서예요. ffmpeg/WebM은 현 source를 admission 근거로 쓰지 않아요. |

## 9. X01–X06 revalidation과 누락 outcome

| ID | 판정 | 교정 disposition |
| --- | --- | --- |
| X01 | Correct priority | favorites, optional sort, hidden을 분리해요. stable `chaId` dedupe/live-ID cleanup, canonical default order 보존이 먼저예요. `high-value`는 Unclear예요. |
| X02 | Correct | top-50 pre-search와 unloaded empty snippet을 명시해요. stable metadata schema와 snippet privacy/hide policy가 먼저예요. |
| X03 | Confirm scope | PostgreSQL FTS backend project예요. Oracle/Web/Tauri behavior를 같은 FTS로 일반화하지 않아요. |
| X04 | Correct high | backend + retention + redaction + privacy deletion + asset consistency project로 확대해요. |
| X05 | Correct | read-only diagnostic만 후보예요. HJ bot/module/orphan analysis와 generic delete는 제외하고 arbitrary preview 범위도 과장하지 않아요. |
| X06 | Confirm scope | 별도 deployment product project예요. source 존재를 reproducible/qualified DR로 과장하지 않아요. |

원문에서 빠졌거나 과소평가된 source-backed outcome도 있어요.

- SQL outage degraded startup, secret-safe diagnostics, authenticated recovery UI,
  atomic config validation/swap (`77e778d3`);
- Web/Tauri transaction/revision/pagination hardening (`9a52998d`);
- PostgreSQL schema recreation recovery (`10ca76cb`);
- legacy encrypted backup fail-closed restore (`1c8f6491`);
- separate SQL backup DB mirroring/retry/snapshot/lag/restore-to-main;
- persistent active+cold token usage aggregation;
- OpenAI Responses streaming/tool/reasoning path;
- volatile in-memory proxy stream job.

이들은 HJ가 더 넓은 source surface를 가진다는 근거지만, 대부분 SQL/deployment
architecture에 묶여 있어 current patch admission을 자동으로 의미하지 않아요.

## 10. 공개 질문 18개 답변

1. **동등한 BG ledger는 없어요.** Closest path는 in-memory proxy stream job이지만
   durable claim/ACK, full pipeline, reconnect/restart recovery가 없어요.
2. **full-history barrier는 있어요.** Generation 전에 full hydration하고 compaction
   guard도 있어요. 다만 load error를 삼켜 partial retained history로 진행할 수
   있어 fail-open이에요.
3. **favorite/hidden cleanup owner는 찾지 못했어요.** `??=[]` 외 dedupe/type/live-ID
   filtering이 없어요.
4. **unloaded session은 name/folder/time은 보존하고 snippet은 보존하지 않아요.**
   search도 top 50으로 자른 뒤 수행해요.
5. **LogExporter 전체를 보호하는 상위 sanitizer는 없어요.** Preview/image와
   restored exporter JSON path는 `notrim`으로 DOMPurify를 우회해요.
6. **repository의 true ZIP64 boundary test는 없어요.** 이번 synthetic offset와
   65,536-entry branches는 통과했지만 true >4 GiB entry/external unzip/browser
   interruption은 미검증이에요.
7. **Node lore/vector의 worker/operation-timeout/concurrency owner는 없어요.**
   auth/rate/input/memory cap만 있어요.
8. **persistent masked provider request-log owner는 없어요.** Browser raw log 20개와
   별도의 persistent SQL token-usage aggregate가 있어요.
9. **X01 최소 persistent state는 deduped stable `chaId` favorite/hidden sets예요.**
   sort/filter/showHidden은 우선 view-local이고 canonical order를 쓰지 않아야 해요.
10. **X02는 stable summary schema가 필요해요.** `characterId`, `chatId`, name,
    folder, last activity, bounded plain-text snippet, last message ID/role, count를
    message commit과 transactionally 갱신해야 해요.
11. **기존 `risuChat v2` JSON은 full-chat round trip에만 유지해요.** Range는 먼저
    TXT/Markdown/HTML만 허용하고, JSON excerpt가 필요하면 새 type/version과
    새-chat import semantics를 정의해요.
12. **saved 30/15를 바꾸지 않아요.** `manual | low-spec` derived effective override로
    4/6을 적용하고 해제 시 manual 값을 그대로 복원해요.
13. **distinct read-only outcome은 key inventory, owner/reference mapping, missing refs,
    raw image diagnostic이에요.** 이미 current AssetViewer가 담당하는 consumption
    preview와 arbitrary file/audio를 과장하지 않아요.
14. **ffmpeg all-user cost를 정당화할 근거가 없어요.** Dynamic load라 initial bytes는
    줄지만 dependency/lock/build, CDN/offline/CSP failure surface는 남고 WebM caller도
    없어요.
15. **current 과장은 evidence label에 있어요.** Graph는 applied reviewing candidate이고
    HJ01/03/04만 이 비교의 physical L3 근거가 있어요.
16. **HJ source-existence 과장이 확인됐어요.** WebM conversion, message split,
    editable exporter, selected-theme HTML, ZIP64 stability, Node performance, DR
    stability, unloaded snippet이 대표적이에요.
17. **38-row direct intersection arithmetic은 정확해요.** 다만 semantic/dynamic/
    renamed owner와 HJ product 전체를 포함하지 않으므로 candidate commit graph와
    runtime import graph를 별도로 만들어야 해요.
18. **반대 counterexample이 다수 있어요.** Dirty-write loss, live orphan deletion,
    audit secret retention, exporter sanitizer/range bugs, dead WebM, shared toolchain,
    missing role fallback, in-memory proxy near-match가 주요 반례예요.

## 11. 교정된 검토·후보 순서

이 순서는 구현 schedule이 아니라 admission gate 순서예요.

1. HJ01/HJ03/HJ04의 current adaptation과 L3는 유지해요.
2. 새 active HJ queue는 만들지 않아요. source gap만으로 reopen하지 않아요.
3. X01을 검토한다면 favorites → optional sort → hidden 순으로 독립시켜요.
4. X02는 stable summary metadata와 privacy policy를 먼저 설계해요.
5. Exporter Stage A는 current owner에서 stable message ID 기반 TXT/Markdown range로
   새로 구현하고, current metadata escaping도 함께 닫아요.
6. Sanitizer/restore schema가 닫힌 뒤에만 visual HTML을 별도 평가해요.
7. HJ02/HJ05/X05는 named user problem 또는 measurement signal 전 active ordering에서
   제외해요.
8. HJ07은 client win과 server responsiveness를 함께 측정해요.
9. HJ06은 actual archive failure와 coherent round trip 뒤에만 열어요.
10. SQL/S3/FTS/revision/deployment는 별도 product migration으로 유지해요.

## 12. 직접 실행한 검증과 남은 한계

초기 독립 review에서 실행한 source/graph 검증은 유지해요.

- patcher 44/44, current HJ01/HJ03/HJ04 focused 23/23;
- current graph 13/12/38/769/280와 zero-change plan;
- 38/38 raw path table, ledger 32/32;
- HJ synthetic ZIP64 offset/count와 corrupt `fflate` probe.

후속 실행은
[`POCKETRISU-HAEJEOK-RUNTIME-VALIDATION.md`](POCKETRISU-HAEJEOK-RUNTIME-VALIDATION.md)에
원출력 범위와 함께 고정했어요. 핵심 관찰은 다음과 같아요.

- HJ default test는 Node 25 localStorage import conflict로 실패했고 diagnostic
  environment는 503 passed / 17 skipped였어요. check는 0/0, build는 6,158
  modules로 완료됐어요.
- actual PG16.15/17.11에서 shipped integration suite는 동일하게 10/14였고,
  current-contract fixture만 교정한 diagnostic run은 양쪽 14/14였어요.
- store failure propagation, actual PG17 audit secret retention, actual Chromium
  exporter paths, actual 4 GiB+1/65,536-entry writer와 corrupt importer를 관찰했어요.
- Oracle/Azure real DB, Docker/RustFS/restic restore, physical iPhone/WebKit,
  production performance/scale/DR/UX value는 여전히 `NR`이에요.

따라서 source/caller confidence와 일부 bounded runtime confidence는 올라갔지만
Haejeok product qualification confidence로 합치지 않아요.

## 13. Reconciliation 상태

독립 review의 정합화 순서를 이번 후속에서 다음처럼 적용했어요.

1. 높은 위험 `Correct` 행을 pinned source와 disposable runtime에서 다시
   spot-check했어요.
2. 46개 claim을 source fact, final caller, state lifecycle, safety,
   test/runtime, user value, admission의 일곱 축으로 분리했어요.
3. HJ08/X04/X05와 current exporter metadata counterexample을 우선 반영했어요.
4. `high-value`와 candidate ordering을 user evidence 없는 hypothesis로 낮췄어요.
5. remaining-candidate audit, integration plan, overlap audit와 CHANGELOG의 문구를
   같은 admission 결과로 맞춰요.
6. provenance와 third-party notice는 새 HJ code/assets/dependency가 없으므로
   기존 attribution 경계를 유지해요.
7. 새 HJ pack/adapter/dependency/generated installer/live source/stable
   tag/release는 만들지 않아요.
