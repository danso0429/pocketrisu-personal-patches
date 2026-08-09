# PocketRisu patch 조합 검수의 동작, 비용, 필수성 재검토

> **상태:** 검수 정책을 결정하기 위한 분석 자료예요. 아직 운용 정책을
> 변경하지 않았어요.
>
> **현재 운용 정본:**
> [`patch-combination-verification-instructions.md`](patch-combination-verification-instructions.md)
>
> **측정 기준일:** 2026-08-09 KST

## 결론 요약

1. patch가 하나 늘 때 항상 검수 수가 두 배가 되는 것은 아니에요.
   `userSelectable !== false`인 **사용자 선택 가능 pack**이 하나 늘 때만
   raw selection 수가 `2^N`에서 `2^(N+1)`로 두 배가 돼요. 현재 catalog는
   총 43 packs이지만 이 차원을 만드는 것은 visible 12 packs이고, hidden
   child/adapter/dependency는 31 packs이에요.
2. 현재 4,096개 전수 검수는 각 조합에서 UI test나 production build를
   실행하는 검수가 아니에요. patch graph의 plan/apply/status/zero-change
   re-plan/revert와 catalog-managed 파일의 byte/mode 복원을 전수 조사해요.
   target test·Svelte check·build는 최대 `all` graph에서 별도로 한 번
   실행해요.
3. 현재 정본의 4,096-selection run을 실제로 재측정한 결과는 4 workers,
   tmpfs에서 **15분 44.49초 wall time**, 최대 RSS **1,764,164 KiB**였어요.
   같은 결과의 `timingsMs.total` 3,199,155.54 ms는 worker 합산 시간이므로
   wall time으로 읽으면 안 돼요.
4. 이 gate는 arbitrary custom selection 전부를 지원한다는 계약에는 강한
   가치가 있어요. 그러나 주 사용 경로인 rolling `all`의 기능·런타임
   안전성을 직접 증명하지는 않으며, 매 unit-only child마다 전수 검수를
   반복해야만 그 경로가 검증되는 것도 아니에요.
5. 현재 근거로는 다음 계층화가 가장 타당해 보여요.
   - 독립 토글이 필요 없는 기능은 existing visible pack의 hidden
     child/adapter로 모델링해 public 상태공간을 불필요하게 늘리지 않아요.
   - 일반 managed-unit 변경은 changed pack 단독, 관계·shared-path 영향
     조합, rolling `all`, target test/check/build, exact revert를 즉시
     검수하고, full exhaustive는 aggregate/release 경계에서 실행해요.
   - resolver/compose/manager/state/transaction/verifier 또는 pack relation
     변경은 full exhaustive를 즉시 유지해요.
6. 위 계층화는 아직 제안일 뿐이에요. 현재 운용 정본은 managed unit이나
   manifest가 바뀌면 full exhaustive를 요구하고, raw mask deduplication을
   금지해요. 실제 정책 변경은 별도의 승인과 정본 수정이 필요해요.

## 전체 검수 흐름에서 전수 조합 gate의 위치

| Gate | 조사하는 질문 | 반복 단위 | 현재 대표 명령 |
| --- | --- | --- | --- |
| Patcher 자체 test | resolver, manager, compose, catalog, CLI와 pack별 fixture가 정해진 계약대로 동작하는가? | test file 39개 | `npm test` |
| Raw-selection exhaustive | 모든 public selection이 plan/apply/status/re-plan/revert와 managed byte/mode round trip을 통과하는가? | visible packs의 `2^N` masks | `npm run verify:combinations` |
| Maximum graph qualification | 실제 rolling `all` 후보가 target test, diagnostics, build를 통과하는가? | 최대 graph 한 번 | `stage` 또는 아래 pnpm 명령 집합 |
| L2.5 runtime audit | 변경 코드가 어떤 runtime path와 외부 효과에 도달하는가? | 변경 surface | 별도 runtime-audit 절차 |
| L3 | 실제 iPhone/브라우저에서 의도한 기능과 회귀가 관찰되는가? | 기능 시나리오 | 수동 기능 gate |

따라서 `rawSelections: 4096`은 1,564개 client test와 170개 server test를
각각 4,096번 실행한다는 뜻이 아니에요. 지수적으로 증가하는 것은 patch
transaction의 구조 검수이고, target test/check/build는 최대 조합에서 한
번 실행되는 별도 gate예요.

## 전수 조합 검수가 실제로 하는 일

### 시작 전 검사

1. target의 `package.json`이 `pocketrisu`인지 확인해요.
2. target에 기존 `save/pocketrisu-patches/state.json`이 없음을 확인해요.
3. 현재 catalog를 불러와 deep-freeze하고 target compatibility가
   `verified`인지 확인해요. `--allow-reviewing`은 명시된 `reviewing`
   target만 허용하며 unknown target을 우회하지 않아요.
4. visible pack ID를 정렬하고 raw mask bit 순서를 정해요.
5. visible/hidden 여부와 관계없이 catalog의 모든 unit이 관리하는 파일
   경로 합집합을 만들어요.
6. 모든 managed path의 최초 존재 여부, SHA-256, POSIX mode를 snapshot해요.
7. worker마다 target 전체를 별도 임시 디렉터리로 복사하고, 복사본의
   managed snapshot이 원본과 같은지 확인해요.

### 각 raw mask에서 실행하는 순서

1. mask bit를 visible pack 선택 목록으로 바꿔 `planTransition()`을
   실행해요.
2. resolver가 dependency, `autoWhen`, supersession과 conflict를 해소하고,
   compose가 unit order, anchor, ownership과 collision을 계산해요.
3. `applyTransition()`으로 transition을 적용해요.
4. `status()`가 비어 있는 selection이면 `clean`, 아니면 `current`인지
   확인해요.
5. 같은 raw selection으로 `planTransition()`을 다시 실행하고
   `changes.length === 0`인지 확인해요. 두 번째 `applyTransition()`을
   실행하는 것은 아니에요.
6. 빈 selection으로 revert plan을 만들고 `applyTransition()`해요.
7. 모든 catalog-managed path의 존재 여부, SHA-256, POSIX mode가 worker
   최초 snapshot과 같은지 확인해요.
8. 모든 단계가 끝난 mask만 processed 목록에 넣어요.

### 마지막 coverage 검사

worker 결과를 합칠 때 out-of-range, duplicate, missing mask가 하나라도
있으면 `INCOMPLETE_COMBINATION_COVERAGE`로 실패해요. 성공한 run은 모든
raw mask가 정확히 한 번씩 위 순서를 완료했다는 뜻이에요.

현재 12 visible packs, 253 managed paths에서 한 번의 run이 호출하는 핵심
연산 수는 다음과 같아요.

| 연산 | mask당 | 현재 4,096 masks |
| --- | ---: | ---: |
| initial/repeated/revert `planTransition()` | 3 | 12,288 |
| initial/revert `applyTransition()` | 2 | 8,192 |
| `status()` | 1 | 4,096 |
| post-revert managed snapshot | 1 | 4,096 |
| post-revert path fingerprint 시도 | 253 | 1,036,288 |

이 표에는 worker copy 전후의 추가 snapshot과 main setup/aggregation/
cleanup은 포함하지 않았어요.

## 무엇을 잡고, 무엇을 잡지 못하는가

### 이 gate가 직접 잡는 것

- public raw selection의 누락·중복 없는 resolver 도달 가능성
- `requires`, `conflicts`, `supersedes`, `autoWhen` 해소 실패
- unit ID·path ownership·ordering·anchor·marker·collision 문제
- official baseline에서의 transition plan과 transactional apply 실패
- apply 직후 patch state/ETag/file drift에 따른 `status` 불일치
- 같은 선택의 즉시 재계획이 다시 파일을 바꾸는 비멱등성
- 빈 선택 revert 뒤 catalog-managed file의 생성/삭제, byte, POSIX mode
  불일치
- visible selection으로 자동 도달하는 hidden dependency/adapter graph

### 이 gate만으로는 알 수 없는 것

- 각 조합의 기능 의도, UI 동작, mobile/iOS 동작
- 각 조합의 client/server test, Svelte diagnostics, production build 결과
- 네트워크, provider, 동시 generation, 실제 DB와 사용자 데이터 동작
- runtime 성능·메모리·발열 회귀
- transaction 중간 장애 주입, process crash recovery, concurrent external
  writer와의 경쟁
- arbitrary selection A에서 B로 직접 전환하는 모든 조합. 검수 경로는
  pristine → selection → empty예요.
- CLI의 persisted custom/preset intent. combination profile은
  `persistIntent`를 사용하지 않아요.
- hidden pack의 임의 독립 subset. visible graph가 실제로 자동 선택하는
  hidden pack만 도달해요.
- 전체 source tree identity. unmanaged files, directory 존재·mode,
  UID/GID, mtime, xattr, ACL, private save metadata는 exact-revert 비교 범위가
  아니에요.
- revert 후 `status() === clean`인지를 직접 다시 호출해 확인하는 것.
  현재 코드는 managed snapshot을 비교해요.

즉 이 gate의 `roundTrips: "passed"`는 **catalog-managed regular-file의
byte/mode round trip**이에요. complete-tree 또는 기능 round trip으로
확장해서 해석하면 안 돼요.

## 왜 두 배가 되는가

visible pack 수를 `N`이라고 하면 raw mask 수는 정확히 `2^N`이에요.

| Visible packs | Raw selections |
| ---: | ---: |
| 11 | 2,048 |
| 12, 현재 | 4,096 |
| 13 | 8,192 |
| 14 | 16,384 |
| 15 | 32,768 |
| 16 | 65,536 |

새 hidden child/adapter/dependency는 이 표의 `N`을 늘리지 않아요. 다만
각 mask에서 resolve되는 units와 managed paths가 늘 수 있으므로 mask당
비용은 증가할 수 있어요.

visible pack을 여러 개 추가하는 동안 매번 full gate를 실행하지 않고
마지막에 한 번만 실행하는 batching은 중간 반복을 줄이지만 지수 자체를
없애지 못해요. 예를 들어 현재 12개에서 visible pack 네 개를 차례로
추가할 때 매번 실행하면 raw masks 합계는
`8,192 + 16,384 + 32,768 + 65,536 = 122,880`이고, 마지막에 한 번만
실행해도 65,536개예요.

## `normalizedGraphs`를 곧바로 중복 제거에 쓸 수 없는 이유

현재 4,096 raw selections의 resolver-only signature를 전수 집계하면 다음과
같아요.

| Signature | Distinct count |
| --- | ---: |
| Raw requested masks | 4,096 |
| Full resolution metadata | 4,096 |
| Persisted `state.selection` tuple | 2,560 |
| `resolvedIds`만 비교한 graph | 2,048 |

여기서 persisted tuple은 `effectiveRequested`, `resolvedIds`, `autoAdded`,
`dependencyAdded`를 포함해요. full resolution은 여기에 raw `requested`와
`superseded`도 포함해요.

현재 `normalizedGraphs: 2048`은 오직 최초 transition의
`resolution.resolvedIds` 배열이 같은 mask를 묶은 진단값이에요.
`character-import-ux`가 `lazy-chat-sync`를 dependency로 추가한 경우와
사용자가 `lazy-chat-sync`를 명시 선택한 경우는 resolved pack 집합이 같아도
persisted selection 의미가 달라요. `startup-cache`가 supersede된 raw
요청 차이도 `resolvedIds`에는 남지 않아요.

따라서 2,048 graph만 round-trip하는 단순 deduplication은 다음 보증을
잃어요.

- explicit/dependency/auto/superseded 요청 차이
- persisted selection state variant
- 모든 raw request가 실제 transaction을 통과했다는 coverage

중복 제거를 검토한다면 `resolvedIds`가 아니라 complete transition state,
changes, preconditions와 output이 같은지를 먼저 계산해야 해요. 현재
full-transition equivalence class 수와 실제 절감량은 측정하지 않았어요.

## 현재 비용 실측

### 2026-08-09 current combined catalog

측정 조건은 다음과 같아요.

| 항목 | 값 |
| --- | --- |
| Patcher commit | `985c4f2239eac0afdf6047de58f2425c31255e99` |
| PocketRisu target | `1.9.0`, commit `85a65f3137b45c8de4a8d21a9887be213b1ac3fc` |
| Catalog | 43 total / 12 visible / 31 hidden packs |
| Exhaustive surface | 4,096 raw / 2,048 resolved-ID graphs / 253 managed paths / maximum 652 units |
| Pristine target size | 177,004 KiB |
| Host | `nproc=2`, `os.availableParallelism()=2` |
| Worker setup | explicit `--jobs 4`; 자동 기본값은 이 호스트에서 2예요 |
| Worker filesystem | `/dev/shm`, 측정 전 6,106,836 KiB available |

실행한 명령은 다음과 같아요.

```bash
/usr/bin/time -v env TMPDIR=/dev/shm \
  npm run verify:combinations -- \
  --root /tmp/pocketrisu-v190-audit \
  --jobs 4 \
  --json
```

관찰 결과는 다음과 같아요.

| Metric | Observed |
| --- | ---: |
| Exit / coverage | 0 / 4,096 of 4,096 |
| Wall time | 15:44.49 |
| User CPU | 1,223.12 s |
| System CPU | 502.10 s |
| Reported CPU utilization | 182% |
| Maximum RSS | 1,764,164 KiB |
| Worker aggregate selection time | 3,199,155.54 ms (53:19.16) |

이 run은 실제 작업 세션에서 관찰한 값이며 격리된 성능 benchmark는
아니에요. 짧은 read-only 분석과 patcher test가 일부 구간에 겹쳤어요.
다른 worker 수·filesystem·catalog·target에서 이 시간을 그대로 예측값으로
사용하면 안 돼요.

worker aggregate phase time은 다음과 같아요. 네 worker가 겹쳐 실행되므로
이 값들을 더한 결과나 worker 수로 단순히 나눈 값을 wall time이라고
부르면 안 돼요. 최초 worker copy, main setup/aggregation, cleanup도 이
phase 합계 밖이에요.

| Phase | Aggregate seconds | Aggregate share |
| --- | ---: | ---: |
| Initial plan | 862.26 | 26.95% |
| Initial apply | 580.67 | 18.15% |
| Status | 233.92 | 7.31% |
| Repeated zero-change plan | 526.52 | 16.46% |
| Revert plan | 373.80 | 11.68% |
| Revert apply | 547.25 | 17.11% |
| Managed snapshot | 74.49 | 2.33% |

같은 유휴 상태에서 patcher 자체 test도 별도로 재측정했어요.

```bash
/usr/bin/time -v npm test
```

39/39 test files가 통과했고 wall time은 5.45초, 최대 RSS는 90,816 KiB였어요.

### 2026-07-31 initial optimization baseline

11 visible packs, 2,048 masks, two workers, PocketRisu 1.8.1에서 보존된
실측은 다음과 같아요. 서로 다른 catalog인 현재 run의 예측식으로 쓰는
표가 아니라, 이미 적용된 최적화의 효과와 한계를 보여주는 표예요.

| Candidate | Worker filesystem | Wall time | Max RSS |
| --- | --- | ---: | ---: |
| Parallel, no calculation cache | ext4 | 585.51 s | 788,692 KiB |
| Exact composition/pair cache | ext4 | 452.89 s | 764,576 KiB |
| Same cache | tmpfs | 405.83 s | 774,792 KiB |
| Final exact caches | tmpfs | 358.13 s | 727,192 KiB |

캐시와 tmpfs를 함께 사용한 마지막 run은 첫 run보다 227.38초, 38.8%
짧았어요. 이 최적화는 raw masks를 줄이지 않고 동일 입력의 순수 계산만
재사용했어요. 더 많은 worker, cache, tmpfs는 상수 비용을 줄일 수 있지만
`2^N` 상태공간은 그대로예요.

### Maximum graph gate의 최근 duration receipt

현재 combined client-fence receipt는 pass count는 보존하지만 command별
duration은 보존하지 않았어요. 가장 최근에 남은 duration receipt는
2026-08-08의 client-build-fence 이전 appearance maximum candidate
`0.2.0-experimental.11-maintainer`예요. 현재 후보의 시간으로 외삽하지
않고, 별도 gate의 규모를 보여주는 관찰값으로 기록해요.

| Command | Observed duration |
| --- | ---: |
| `pnpm --version` | 0.692 s |
| `pnpm install --frozen-lockfile` | 16.185 s |
| `pnpm test` | 182.599 s |
| `pnpm check` | 40.304 s |
| `pnpm build` | 36.553 s |
| `node server/node/bgOrchBundle.build.cjs` | 1.410 s |
| Sum of recorded checks | 277.743 s |

이 합계는 전수 combination gate와 별개이고, 현재 4,096 masks에 곱하지
않아요.

## 실행 명령 정리

### Patcher와 target preflight

```bash
git --no-pager status --short --branch
git --no-pager -C /path/to/pristine/PocketRisu rev-parse HEAD
git --no-pager -C /path/to/pristine/PocketRisu status --short
test ! -e /path/to/pristine/PocketRisu/save/pocketrisu-patches/state.json
du -sk /path/to/pristine/PocketRisu
df -Pk /dev/shm
npm test
```

### Routine exhaustive gate

```bash
npm run verify:combinations -- \
  --root /path/to/separate/pristine/PocketRisu \
  --json
```

`package.json`을 펼치면 실제 entry point는 다음이에요.

```bash
node scripts/verify-all-combinations.cjs \
  --root /path/to/separate/pristine/PocketRisu \
  --json
```

Linux tmpfs와 명시 worker 수를 사용할 때는 먼저 용량을 확인한 뒤 다음처럼
실행해요.

```bash
TMPDIR=/dev/shm npm run verify:combinations -- \
  --root /path/to/separate/pristine/PocketRisu \
  --jobs N \
  --json
```

`reviewing`으로 명시된 exact target만 다음 옵션을 사용할 수 있어요.

```bash
npm run verify:combinations -- \
  --root /path/to/separate/pristine/PocketRisu \
  --allow-reviewing \
  --json
```

mask마다 별도의 shell command나 CLI process를 띄우지는 않아요. 하나의
Node process가 worker threads를 만들고, 각 worker가 `planTransition()`,
`applyTransition()`, `status()`, filesystem snapshot 함수를 직접 호출해요.

### Maximum graph의 patch lifecycle

```bash
npm run build

node dist/pocketrisu-all.cjs plan \
  --root /path/to/pristine/PocketRisu \
  --json
node dist/pocketrisu-all.cjs apply \
  --root /path/to/pristine/PocketRisu \
  --all \
  --json
node dist/pocketrisu-all.cjs status \
  --root /path/to/pristine/PocketRisu \
  --json
node dist/pocketrisu-all.cjs plan \
  --root /path/to/pristine/PocketRisu \
  --json
node dist/pocketrisu-all.cjs revert \
  --root /path/to/pristine/PocketRisu \
  --json
```

Upstream staging wrapper를 사용하면 다음 명령이 candidate에서 순서대로
실행돼요.

```bash
node dist/pocketrisu-patcher.cjs stage \
  --root /path/to/current/PocketRisu \
  --candidate /path/to/fresh/new/PocketRisu \
  --json

# stage 내부 qualification checks
pnpm --version
pnpm install --frozen-lockfile
pnpm test
pnpm check
pnpm build
node server/node/bgOrchBundle.build.cjs  # bg-preserve 선택 시
```

PocketRisu 1.9.0의 `pnpm test`는 다음 두 suite로 펼쳐져요.

```bash
vitest run && vitest run --config vitest.config.server.ts
```

Generated installer는 별도로 다음을 확인해요.

```bash
npm run build
node --check dist/pocketrisu-patcher.cjs
node --check dist/pocketrisu-features.cjs
node --check dist/pocketrisu-hardening.cjs
node --check dist/pocketrisu-all.cjs
```

## 필수성 판단

### 현재 gate를 계속 유지할 근거

- Patcher가 arbitrary custom selections를 공식 지원하는 동안, every raw
  public selection을 실제 transaction으로 통과시킨다는 가장 직접적인
  증거예요.
- unit들이 많은 공통 파일을 공유하고 dependency, auto-adapter,
  supersession과 ordered collision이 있으므로 maximum graph 하나만으로
  모든 중간 조합을 논리적으로 대표한다고 아직 증명하지 않았어요.
- exact apply/revert를 모든 selection에서 실행하므로 patch manager의
  상태·ownership·revert 회귀를 넓게 잡아요.
- resolver/compose/manager/transaction 같은 공통 엔진이 바뀌면 영향 범위가
  모든 selection이므로 전수 gate의 가치가 특히 높아요.

### 매 feature patch마다 반복할 가치가 약해지는 근거

- 실제 라이브 주 경로는 rolling `all`이고, arbitrary custom subset은 주
  사용 경로가 아니에요. maximum `all` test/check/build와 실제 L3가 그
  환경의 기능 안전성에 더 직접적인 증거예요.
- 변경과 무관한 visible bits까지 모두 off/on으로 반복하고, disjoint한
  pack의 기존 조합도 다시 transaction해요. 현재 verifier는 영향면의
  독립성을 이용하지 않아요.
- 4,096 structural round trips가 target test, runtime audit, UI behavior를
  대체하지 않으므로 비용이 커져도 기능 검증 범위가 같이 넓어지는 것은
  아니에요.
- 조사한 validation 기록 범위에서는 maximum/focused gate가 잡지 못한
  특정 non-maximum raw mask 결함을 exhaustive gate만이 발견했다고 명시한
  사례를 찾지 못했어요. 이는 결함이 없다는 증명이 아니라, 현재 유지
  근거가 실측 defect yield보다 지원 계약과 보증 강도에 있다는 뜻이에요.

### 변경 종류별 제안

아래는 현재 정본을 대체한 정책이 아니라 검토안이에요.

| 변경 종류 | 즉시 권장 gate | Full exhaustive 제안 | 이유 |
| --- | --- | --- | --- |
| 문서만 변경 | 문서·명령 검증 | 불필요 | executable catalog와 transaction이 변하지 않아요. 현재 정본도 예외로 둬요. |
| 기존 pack의 unit content/anchor/path 변경 | patcher test, standalone, shared-path/relation 영향 조합, rolling `all`, target gates, exact revert | aggregate/release에서 | 일반적으로 영향면이 pack과 owner graph에 한정되지만 최종 public-selection 증거는 보존해요. |
| 독립 토글이 필요 없는 integration child | hidden child/adapter의 activation branches, rolling `all` | aggregate/release에서 | public bit를 추가하지 않고 실제 activation 조건을 검수해요. |
| 새 visible pack | standalone, relation/shared-path closure, rolling `all` | admission 또는 aggregate 경계에서 | public 지원 상태공간 자체가 두 배가 돼요. 독립 토글 필요성을 먼저 확인해야 해요. |
| `requires`/`conflicts`/`supersedes`/`autoWhen`/visibility 변경 | focused relation tests와 full exhaustive | 즉시 | raw mask의 해석과 도달 graph가 바뀌어요. |
| resolver/compose/catalog/manager/state/transaction/revert/verifier 변경 | adversarial unit tests와 differential audit, full exhaustive | 즉시 | 모든 pack에 공통인 검수 엔진·상태 계약이 바뀌어요. |
| Stable aggregate release | maximum target gates, L2.5, 기능별 L3, full exhaustive | 필수 유지 제안 | arbitrary selection 지원을 계속 표방하는 최종 publication 경계예요. |

## 비용 축소 선택지와 잃는 보증

### 1. Hidden child/adapter로 모델링

독립 사용자 선택권이 실제로 필요하지 않은 기능에 가장 먼저 검토할
구조예요.

- 보존: 모든 public raw selection exhaustive 계약
- 잃음: 그 child만 독립적으로 켜고 끄는 사용자 선택권
- 한계: mask 수는 그대로지만 unit/path 수가 늘어 mask당 비용은 늘 수
  있어요.

검수 수를 줄이기 위해 의미상 독립인 기능을 숨기는 것은 안 돼요. 제품
선택 의미가 실제로 umbrella와 함께 움직일 때만 적용해야 해요.

### 2. Child마다 focused gate, full gate는 aggregate/release에서 실행

- 보존: 최종 release의 every-public-selection 증거
- 잃음: 각 중간 commit이 모든 public selection에서 안전하다는 즉시 증거
- 위험: 실패 발견 시 원인 commit과의 거리가 늘어날 수 있어요.

기능별 작은 commit, changed-owner tests, standalone·all exact revert를
중간마다 남겨 회귀 격리 약화를 보완해야 해요. Batching은 반복량을 줄일
뿐 최종 `2^N`을 해결하지는 못해요.

### 3. 모든 raw mask는 resolve/initial-plan하고, exact-equivalent 대표만
transaction

- 보존 가능: 모든 raw request의 resolver와 initial plan/anchor/collision
  failure
- 잃음: 모든 raw mask가 실제 apply/status/re-plan/revert를 통과했다는
  문자 그대로의 보증
- 필수 선행: complete state/change/precondition/output equivalence 정의와
  full-vs-dedup differential audit

현재 `normalizedGraphs` 2,048을 그대로 대표로 쓰면 안 돼요. persisted
selection tuple만 해도 2,560개이고, full transition equivalence 수는 아직
모르기 때문이에요.

### 4. Changed-pack impact closure만 검수

변경 pack, dependency/supersede/autoWhen closure, shared-file owners와
연결된 masks만 선택해요.

- 보존: impact analyzer가 정확하다는 전제의 직접 관계 조합
- 잃음: analyzer가 놓친 global state/transaction interaction과 관계없다고
  분류된 custom selection의 즉시 증거
- 부적합: resolver, compose, manager, transaction, catalog loader 변경

이를 채택하려면 impact analyzer 자체의 fail-closed test와 owner graph
receipt가 필요해요.

### 5. Pairwise 또는 t-wise covering array

- 보존: 선택한 강도까지 모든 visible pack pair 또는 tuple의 동시 on/off
- 잃음: 그보다 높은 차수에서만 발생하는 `autoWhen`, dependency,
  supersession, ordering, state interaction

현재 hidden adapter 조건에는 여러 visible pack의 `all`/`none` 조합이
있으므로 pairwise만으로 충분하다는 근거는 없어요. 보조 gate로는 쓸 수
있지만 현재 full gate의 동등 대체라고 할 수 없어요.

### 6. Standalone + rolling `all` + owner-present graph만 지원

- 보존: 실제 운영 후보와 feature 단독 경로
- 잃음: 임의의 중간 custom selection

이 검수 범위를 영구 정책으로 삼으려면 patcher도 arbitrary custom
selection을 계속 지원한다고 표방하면 안 돼요. 지원 계약을 presets/rolling
`all`로 줄이는 제품 결정이 함께 필요해요.

### 7. Worker/cache/tmpfs만 더 조정

- 보존: 현재 full exhaustive 계약 전체
- 잃음: 없음
- 한계: 상수 비용만 줄이고 `2^N`은 그대로예요. worker마다 전체 source
  copy와 cache를 보유하며, 현재 호스트는 CPU 2개이므로 worker 증가가
  항상 빨라진다고 가정할 수 없어요.

## 권고 검토 순서

1. 새 기능마다 독립 토글이 정말 필요한지 먼저 결정해요. 아니라면 hidden
   child/adapter로 기존 visible contract에 포함해요.
2. unit-only feature admission은 standalone + relation/shared-path closure +
   rolling `all` + target gates로 즉시 닫고, full exhaustive는 aggregate
   checkpoint로 묶는 정책안을 검토해요.
3. resolver/compose/manager/state/transaction/verifier와 pack relation 변경은
   full exhaustive를 계속 즉시 실행해요.
4. raw mask의 initial plan은 전수 유지하되 transaction만 exact-equivalent
   대표로 줄일 수 있는지 read-only prototype으로 class 수와 실제 시간을
   먼저 측정해요. `resolvedIds` dedup은 후보가 아니에요.
5. 장기적으로 65,536개 이상의 raw state를 계속 지원할 의사가 있는지,
   아니면 공식 지원 조합을 presets/rolling `all`로 줄일지 결정해요.
6. 정책이 합의되기 전에는 현재 운용 정본과 anti-reward-hacking 규칙을
   그대로 적용해요.

## 남은 판단 질문

- Patcher의 제품 계약에 arbitrary custom selection이 실제로 필요한가요,
  아니면 현재 사용 환경처럼 rolling `all`과 일부 presets이면 충분한가요?
- raw `requested`/supersession metadata 차이까지 실제 transaction 보증이
  필요한가요, 아니면 모든 raw request의 plan과 persisted state equivalence
  검증이면 충분한가요?
- Full exhaustive를 매 child, visible-pack admission, aggregate checkpoint,
  stable release 중 어느 경계에서 요구할까요?
- Full gate의 wall time·RSS가 어떤 실측 한도를 넘으면 지원 상태공간 축소나
  equivalence-based verifier를 채택할까요?
- 향후 validation receipt에 `/usr/bin/time`과 stage `durationMs`를 항상
  보존해 실제 defect yield와 비용을 함께 판단할까요?

## 근거 문서와 코드

- 운용 정본:
  [`patch-combination-verification-instructions.md`](patch-combination-verification-instructions.md)
- 기존 verifier 최적화와 2026-07-31 측정:
  [`COMBINATION-VERIFIER-OPTIMIZATION-VALIDATION.md`](COMBINATION-VERIFIER-OPTIMIZATION-VALIDATION.md)
- 현재 combined catalog receipt:
  [`POCKETRISU-1.9-CLIENT-BUILD-FENCE-VALIDATION.md`](POCKETRISU-1.9-CLIENT-BUILD-FENCE-VALIDATION.md)
- Verifier 구현: `scripts/verify-all-combinations.cjs`
- Coverage 단위 test: `test/combination-verifier.test.cjs`
- Target qualification 명령 구현: `src/staging.cjs`
- Resolution metadata 구현: `src/resolver.cjs`, `src/manager.cjs`
