# PocketRisu BG Preserve 계획과 G1 작업 기록

작성일: 2026-10-12 KST

기록 범위: 이 대화에서 2026년 9월 20~27일에 다룬 PocketRisu BG Preserve × Archive Center 계획 변경, G1 구현·검증, live 시험과 그에 따른 계획 교정. 2026년 9월 27일의 공개 계획 commit `4d8c858`과 patcher G1 기록 commit `fbb08e2`를 종료 기준으로 삼는다. 그 뒤의 변경이나 현재 설치 상태는 이 기록의 완료 근거에 포함하지 않는다.

핵심 결과는 **AC 없는 BG 서버 완주(G1) → 수정하지 않은 공식 AC와의 호환(G2) → 공식 AC API를 이용한 서버 완주(G3)**로 목표를 재정렬하고, G1의 격리 자동검증 후보를 live에 적용했다는 것이다. 다만 실제 iPhone 전송은 preset·module·plugin 설정 때문에 기존 client-owned model-job 경로로 갔고, 서버 소유 input/commit을 관찰하지 못했다. 따라서 이 대화가 끝날 때 G1 제품 완료, 공식 AC 호환, stable release는 어느 것도 성립하지 않았다.

이 기록은 작업 결과와 판단의 출처를 남기는 회고 문서다. 이후 작업 계획의 정본을 대체하지 않는다. 사용자 채팅 내용·식별자, 플러그인 스크립트, 모델 인증값, endpoint 원문, 운영 백업의 정확한 경로는 싣지 않는다.

## 시작 자료와 계획의 권한

대화 시작 시점에는 Handoff Index, Next Work Plan, Fresh Start Instructions와 C0 validation ledger가 이어서 읽을 진입점으로 제공돼 있었다. 당시 실행안은 H0~H7을 AC-off 실제 process → AC 관련 C4/C5 → C6 → client activation → C7의 묶음으로 다뤘다. H1 프로세스 시험, C1 원자 저장, C2 결과 연결, C3 입력·설정·projection 기반, 그리고 AC H2의 실험 구현·source snapshot은 재사용 가능한 출발 자료였지만, 그것만으로 브라우저 종료 후 제품 동작이나 공식 AC 호환을 주장할 수 없었다.

AC 구현을 다루던 중 사용자는 `archive-center.js`를 임의 수정한 결과를 제품 해법으로 삼아서는 안 된다고 명확히 했다. 수정된 AC로 통합을 *simulate*하는 것은 조사 자료가 될 수 있으나, 해소 방향은 BG·저장·호스트·연결 patcher의 수정이어야 했다. 당시의 AC 수정·시뮬레이션과 원본 AC 호환 증거를 분리하고, AC JS·Go·schema를 바꾸지 않는 경로를 기본값으로 다시 잡았다. 보존된 AC 후보와 snapshot을 폐기하거나 정본 원본 AC로 둔갑시키지 않았다.

사용자가 제공한 ordered-goals 계획을 실행 순서의 정본으로 삼아 기존 H0~H7 일괄 순서를 역사 자료로 내렸다. G1은 AC를 설치하거나 실행하지 않아도 서버가 인수한 **지원 대상** 요청의 생성·후처리·일반 채팅 저장을 완료해야 한다. G2는 수정하지 않은 공식 AC를 설치했을 때 두 소유권이 충돌하지 않는 조합을 검증한다. G3는 공식 AC의 기존 API를 이용해 기억 준비부터 완료까지 서버가 이어 가는 조합을 목표로 한다. G2/G3의 출발점은 별도 연결 패치와 기존 패치의 필요한 좁은 수정이며, 새 AC API나 변형판을 기본 전제로 두지 않는다. G1의 실제 결함이 드러나면 뒤 목표의 진행 여부와 무관하게 다시 고친다.

사용자는 N에서 멈추지 않고 **N+1 입력과 후속 효과까지 patcher가 소유**하는 방향을 승인했다. PocketRisu를 이후 버전으로 올려도 상류와 겹치는 지점을 patcher가 다시 조정해 원하는 동작을 유지하는 것이 목적이었다. 그렇다고 새 버전에 patch가 적용되기만 하면 이전 동작이 보존된다고 보지 않았다. 버전별 최종 caller·설정·충돌 경로와 회귀를 다시 확인하는 조건을 계획에 남겼다. 또한 G1의 소유권 설계와 필요한 회귀 실험을 모호하게 다음 세션으로 넘기지 않고 이 대화에서 직접 진행하기로 했다.

| 자료 또는 작업선 | 이 대화에서 부여한 지위 |
| --- | --- |
| 기존 Handoff Index·Next Work Plan·Fresh Start Instructions·C0 ledger | 시작 상태, commit·hash·소유권·금지 동작을 확인하는 역사 자료. 새 목표 순서와 충돌하는 실행 지시는 그대로 재사용하지 않음 |
| AC H2 수정 후보·source snapshot·AC JS 시뮬레이션 | 비교·재현·복구 자료. 수정하지 않은 공식 AC의 호환 증거 또는 G1 필수 의존성으로 계산하지 않음 |
| BG G1 독립 후보와 C1/C2/C3 기반 | AC 없는 서버 입력·생성·저장 구현과 시험의 출발점. capability 값이나 합성 시험 통과만으로 제품 완료라고 하지 않음 |
| 공개 순차 목표 계획 `docs/BG-PRESERVE-ORDERED-GOALS.md` | G1→G2→G3의 목표·순서·완료 조건 정본. 이 대화에서 `09b4fff`부터 `4d8c858`까지 단계별 관찰을 반영 |

## 계획 변경과 조사 순서

다음은 같은 목표를 여러 차례 다시 판단한 과정이다. 앞선 값은 그 시점의 후보와 시험을 뜻하며 뒤 후보의 통과 결과로 승격하지 않는다.

| 순서와 기록 | 확인하거나 바꾼 내용 | 남긴 경계 |
| --- | --- | --- |
| `09b4fff` | AC를 포함한 일괄 실행에서 G1·G2·G3 독립 목표로 순서를 변경 | G1은 AC-free, G2는 공식 AC 무변경 호환, G3는 공식 API 서버 완주. H0~H7은 이전 계획 |
| `1fb394b` | G1 독립 작업선과 실행·저장 소유권 표를 기록하고 일반 입력·pending·보관 수명을 다음 과제로 지정 | 당시 서버 자동 drain과 chat commit은 후보 구현이지 live 기능 아님 |
| `4a895c8` | early-send, chat-open/pending 조회, ACK 유실 복구, N+1을 G1.4/G1.5에 연결하고 시험/미시험 경계를 표로 구분 | 당시 `inputCommandVersion=0`; 일부 전체 시험은 ACK 복구 후속 변경 전 소스의 결과 |
| `f4e454d` | 서버 효과와 브라우저 root 저장의 순서를 바꿔 통계 누락을 실제 SQLite·HTTP에서 재현 | predecessor 값 대조나 기존 BG ledger만으로 독립 브라우저 효과를 보존하지 못함 |
| `d5c232c` | 통계 경합 외에 ACK·짧은 state 소멸 후 잔류 기록, 두 탭 동일 초안의 중복 유료 접수, 편집·삭제 경계를 구현 전 시험으로 확대 | 같은 문장이라는 이유로 의도적인 N+1을 금지할 수 없음 |
| `5b3f16e` | operation-keyed root 효과, 초안 정체성, 입력·commit 보관 수명, 명시적 blocked retry를 반영한 격리 후보의 검증 결과를 정리 | 실제 브라우저·live와 custom/preset/plugin 최종 caller는 별도 미검증 |
| `2b3f2a5` | 최신 단일-installer patcher 본체에 G1 후보를 조합하고 관리 제품 파일의 byte/mode 동등성을 확인 | 패처 엔진·catalog가 달라진 결과를 이전 graph/test 숫자와 혼합하지 않음 |
| `4d8c858` | live·iPhone 관측과 preset/module/MARP 호출 경로를 계획에 반영 | 사용자 실제 조합을 classic-only 시험으로 완료 처리하지 않으며, MARP 서버 인수 시점은 미결 |

## G2와 G3에 남긴 구체적 계획

G1과 동시에 AC 기능을 완성하려던 이전 계획을 목표별로 분리했지만, G2·G3의 요구를 삭제한 것은 아니다. 기존 상세 통합 계획의 P1/P2 및 T01~T28은 기술 참고 자료로 남기고, 그 문서의 H0~H7 일괄 활성화 순서는 실행 정본에서 제외했다.

**G2**는 수정하지 않은 공식 AC의 버전·JS·backend·migration·hash를 기준선으로 고정하는 것부터 시작한다. 그 위에서 기존 충돌을 실제 hook·caller·요청 payload·저장 시점으로 재현하고, 단순히 브라우저 기능이 서버에 없다는 사실과 두 기능이 서로 손상시키는 충돌을 구별한다. 연결 책임은 별도 patcher가 우선 맡되, BG·저장·플러그인 호스트의 수정이 필요하면 확인된 경계만 좁게 바꾼다. AC 미설치, 설치 후 비활성, 활성, 초기화 중, 연결 장애, 버전 불일치를 각각 분리해 표시한다. foreground/BG, streaming/non-streaming, 현재/이전 턴 확정과 지원을 주장하는 PageFold·PDF 등의 결합을 검증한다. AC가 기억 없이 돌아가거나 조용히 꺼진 결과는 호환 성공이 아니다. G2가 약속한 조합을 원본 AC로 제공하지 못하면 제약과 대안을 먼저 결정하며, G3가 아직 미구현이라는 사실을 G2의 가짜 통과나 자동 실패로 취급하지 않는다.

**G3**의 기본 실험은 원본 AC의 기존 API로 설정·기억 준비를 얻고, 실제 주 모델 요청에 반영된 payload를 확인한 뒤, 브라우저가 사라진 상태에서 출력 처리·정상 채팅 commit·AC 완료·다음 턴 반영까지 따라가는 것이다. 먼저 고정 모델 응답·격리 데이터로 호출자와 저장 순서를 검증하고, 이후 실제 브라우저 종료와 사용 설정으로 넓힌다. AC 요청과 BG operation의 ID 대응, 인증·버전 협상, claim/prepare/complete 재조회, 이전 턴 backfill, 취소·편집·삭제·재시작·보관 수명은 연결 패치와 기존 소유자 사이에 명시해야 한다. 응답 유실이 유료 provider 호출이나 채팅/effect/기억의 중복을 만들어서는 안 된다. AC 설정·provider·출력·확정 정책을 추측해 별도 구현하지 않고 기존 AC가 해석한 값을 사용한다.

원본 AC가 어떤 필수 사실을 표현할 수 없다는 positive/negative 왕복 실험, 기존 host/API와 연결 패치 대안이 막힌 정확한 지점, 최소 수정 범위·업데이트·되돌리기 책임이 모이기 전에는 AC JS·Go·schema 변경 예외를 선택하지 않는다. 수정 후보에서만 성공한 결과는 원본 AC 성공과 별도 표기한다. 이 대화에서는 이 계획의 목표·검증 순서를 정했으며, G2의 공식 AC 조합 qualification이나 G3의 서버 완주를 완료하지 않았다.

## G1의 데이터와 실행 소유권

### 서버 인수와 정상 채팅 저장

G1의 목표는 브라우저 결과함에 완성 답변을 보관했다가 복귀한 클라이언트가 다시 쓰는 방식이 아니다. 서버가 요청을 인수한 뒤에는 ax·main·후처리를 이어서 수행하고, 채팅 본문·metadata·변수·통계 효과를 **일반 채팅 저장소**에 확정해야 한다. 복귀한 브라우저는 그 저장본을 읽어 채택한다. result ACK, 복구 버튼, 화면 focus가 서버 저장을 시작하는 조건이 되어서는 안 된다.

초기 H1은 생성 요청 자식 프로세스를 시작 ACK 뒤 종료한 다음 실제 `server.cjs`·SQLite·일반 chat API에서 결과를 읽는 형태로 이 경계의 일부를 확인했다. 합성 provider 1회, 서버 commit 1회, client save 0회, 결과 ACK 0회, fallback 0회가 관찰됐다. transaction failure와 input/result/commit marker 재시작 경계에서는 부분 commit과 유료 실행 재생이 없어야 하는 조건을 시험했다. 이는 **요청 프로세스**의 종료 증거이며 실제 iPhone PWA 프로세스 종료 증거는 아니었다. H1·C1/C2/C3를 G1 제품 통과로 승격하지 않은 이유다.

이 기반 단계에서 C3의 `inputCommandFoundationVersion=4`가 있다는 것과 제품의 `inputCommandVersion=1`을 여는 것은 구분됐다. 당시 capability는 input 0이었고 일반 client는 새 서버 입력 flag를 보내지 않았다. 별도로 `serverChatCommitVersion=1`의 내부 후보가 있어도 일반 전송의 입력 소유권·root 효과·pending 화면·구형 client 보호를 끝내기 전에는 활성화하지 않았다. 후속 G1 후보에서 input 1을 광고한 뒤에도 최종 caller와 실제 browser/device 결과를 따로 검증하도록 한 근거다.

C3 기반에서는 입력 admission 시 PocketRisu 설정을 exact stripped-DB Buffer로 고정하되 secret byte와 그 내용 의존 hash를 durable 기록에 노출하지 않았다. 실행에 필요한 설정은 같은 프로세스 메모리에만 두고, durable commit 정체성은 내용과 무관한 임의 digest를 사용했다. 서버 재시작으로 이 컨텍스트가 사라지면 불명 상태를 모델 재실행으로 덮지 않고 차단하되, 이미 durable한 첨부 입력은 먼저 일반 채팅으로 복구하는 순서를 유지했다. record v4는 바로 인접한 입력 admission과 별도의 실행 predecessor, 완료 결과의 publication을 나눠 cancelled admission 건너뛰기와 편집·삭제 뒤 교착을 다뤘다.

외부 검수 R1~R5 뒤의 C3 연결 보강은 AC-off HTTP start/continue/readback 경계를 추가했다. 시작 ACK가 provider 종료보다 먼저 돌아오더라도 입력·결과·commit의 causal 상태를 보존하고, startup은 pending signature가 진전되는 동안 input→commit 복구를 bounded 반복하도록 했다. foreground·boot 복귀 클라이언트가 서버 소유 미확정 결과를 ACK하거나 옛 방식으로 먼저 채팅에 저장하지 않도록 marker/result를 유지했다. 이 조치는 일반 client 활성화 이전의 안전 기반이었다. 당시 predecessor가 동적으로 바꾼 root가 실제로 그 predecessor의 효과에서만 왔는지를 receipt로 입증하는 문제는 별도 검증 과제로 남겼으며, 뒤의 통계 +1 시험은 그중 실제 깨지는 root 순서를 구체화한 것이다.

### N과 브라우저 root 효과의 경합

사용자와 함께 의심한 첫 가정은 “N의 predecessor 효과가 현재 root와 같은 값이면 같은 writer가 남긴 값으로 봐도 되는가”였다. 같은 숫자 자체는 writer 증거가 아니지만, 이를 곧바로 필수 ledger 설계로 확대하지 않고 실제 저장 순서와 결과부터 재현했다.

기준 생성 통계 10에서 브라우저의 독립적인 +1과 서버 작업 N의 +1이 모두 보존되면 12가 필요하다. 브라우저 저장이 먼저 완료되면 12가 남았다. 반면 N이 먼저 commit된 뒤 오래된 브라우저 root 저장이 patch-sync 또는 조건부 full-write의 충돌 재시도를 통과하면 브라우저의 +1이 빠져 11이 남았다. validator 없는 오래된 full-write는 10까지 되돌릴 수 있었다. 반대편에서는 브라우저의 +1이 서버에 저장됐으나 응답만 유실된 뒤 N이 commit되면 원격의 12가 이미 정답이었다. 이때 무조건 `remote + (local - base)`로 합치면 13으로 중복된다. 따라서 서버 receipt만 보존하거나 숫자를 비교하는 수정은 두 반례를 동시에 해결하지 못했다.

이 관찰 뒤 브라우저 통계 효과에도 안정적인 호출 ID를 부여하고, 서버 root writer와 클라이언트 재시도가 이미 수용된 ID를 다시 가산하지 않도록 연결했다. 서버의 N 효과 receipt와 브라우저 효과 ID가 어느 순서로 저장돼도 두 +1이 한 번씩만 반영되는 격리 시험을 수행했다. 이 가산 효과는 전역 변수 set/delete 충돌 정책과 섞지 않았다. 브라우저 효과 ID는 14일 회복 창과 하루의 미래 시계 오차, 8,192건 보관 상한을 갖고, 오래된 정체성이나 상한 초과는 재가산 대신 fail-closed한다. 실제 사용량·기기 시계·장기 ledger 비용은 이 격리 시험으로 측정되지 않았다.

### 동일 초안, N+1과 실패 뒤 재시도

초기 두 탭 시험에서는 같은 초안이 각각 별도 ID로 접수돼 서버가 N과 N+1로 취급하고 합성 provider를 두 번 실행했다. 문장 내용으로 dedupe하면 사용자가 같은 문장을 의도적으로 다시 쓴 N+1까지 막는다. 수정한 후보는 초안 생성·수정·첨부 변경·탭 간 저장에 공유되는 draft ID를 사용하고, 서버는 그 입력 정체성을 새 successor를 만들기 전에 같은 SQLite transaction에서 확인한다. 기존 초안을 두 탭에서 동시에 보낸 경우 한쪽의 중복 접수를 거부하되, 사용자가 새로 쓴 같은 문장은 새 ID를 얻도록 했다.

접수 성공 응답이 유실되면 같은 ID의 정확한 status를 조회해 이미 진행 중인 서버 작업을 찾는다. 완료·무효 commit 정체성으로 두 번째 유료 실행을 허용하지 않고, 오래된 브라우저 번들의 fallback도 이전 성공을 새 생성으로 바꾸지 않도록 fence했다. `blocked_edit` 상태는 원문과 명시적 “새로 생성” 조작을 보여주되, 원래 입력 ID와 replacement가 한 transaction에서 연결되고 두 번 눌러도 두 개의 유료 successor가 생기지 않아야 한다. blocked-only 상태에서 불필요한 2초 polling을 하지 않는 UI 시험도 수행했다.

### 입력·결과 보관 수명

결과나 짧은 operation state의 삭제는 동일 입력을 새 요청으로 취급할 권한이 아니다. terminal input은 결과/state와 연결 참조가 없고 회복 기간이 지난 뒤에만 원문·원문 hash·입력 journal·effect intent를 지우는 v5 형태로 compact한다. commit recovery 본문 역시 publication 복구를 확인하고 참조 수명을 지난 뒤 exact compact receipt로 교체한다. 후보의 payload 정리 문턱은 49시간이며, 재시도가 임의로 늦게 도착해도 같은 ID를 다시 유료 실행하지 않도록 작은 identity receipt는 남긴다. 따라서 원문 payload 증가와 영구 ID 증가를 구분했다. 영구 receipt의 장기 개수·바이트 비용과 역사 DB에서의 실제 정리 동작은 아직 측정되지 않았다.

### AC와 분리한 구현 책임

G1 후보의 신규 owner는 patcher가 관리하는 PocketRisu 소스에 있다. G1의 테스트와 live 적용에는 AC 소스·backend·schema·runtime이 필요하지 않았고, AC disposition은 disabled였다. 공식 AC 원본의 prepare/complete 동작이나 브라우저 훅 동등성을 G1 자동시험에서 확인한 것으로 주장하지 않았다. 공식 AC가 미설치·비활성·활성·초기화 중·연결 장애일 때의 소유권 비교는 G2로, AC가 실제로 기억 작업까지 브라우저 없이 수행하는 경로는 G3로 남겼다.

당시 G1 후보에서 경계를 찾아볼 주요 소스 이름은 다음과 같다. 이들은 최신 checkout의 동일 파일이 아니라 위에서 고정한 당시 후보 commit의 파일을 가리킨다.

| 당시 소스 | 검토할 책임 |
| --- | --- |
| `bgOrchestrator.cjs`, `serverChatInputTransform.cjs`, `serverChatInputDrain.cjs` | server input admission 뒤 전체 생성 호출, 입력 1회 변환, N+1 순서와 실행 전 차단 |
| `serverChatInputOwner.cjs` | 입력·초안 정체성, predecessor, blocked retry, terminal input 수명 |
| `serverChatCommitOwner.cjs`, `serverChatCommit.cjs`, `chatWriteJournal.cjs` | 정상 채팅·효과 원자 commit, publication/recovery, rollback·receipt |
| `serverChatExecutionProjection.cjs`, `bgBrowserMessageEffects.ts` | root 효과 ID·수용 판정과 브라우저 독립 통계 효과 |
| `bgDraftIdentity.ts`, `bgServerInputClient.ts`, `bgServerPendingProjection.ts`, `ServerPendingInputs.svelte` | 공유 초안 ID, early-send/status, pending 표시, 명시적 retry와 복귀 |
| `nodeStorage.ts`, `chatStorage.ts`, `serverCommittedChatAdoption` 시험 | revision/ETag 저장, 빈·오래된 로컬 채팅의 서버 결과 채택, 중복 client save 방지 |

## 후보 구성과 자동검증

### 독립 G1 후보

AC 작업선과 분리한 G1 후보에는 operation-keyed 브라우저 통계 효과, 공유 draft ID, 서버의 일반 채팅·효과 원자 commit, N+1 입력, terminal payload 정리와 exact receipt, blocked 입력의 명시적 재시도, client capability 1이 포함됐다. 기존 `personal-settings` 기능을 오래된 pack으로 되돌리지 않도록 당시 live의 0.5.10 설정 pack을 0.5.11 후보로 보존하고 G1 root 효과와 strict root-only save의 순서를 검증했다. AC의 JS·Go·schema를 이 후보에 넣지 않았다.

격리 공식 PocketRisu 1.10.0 대상에서 수행한 마지막 독립 후보의 전수 결과는 patcher 55/55, server 350 통과·12 건너뜀, frontend 1,910 통과·2 건너뜀, 타입 오류·경고 0이었다. 생산 빌드는 8,005개 모듈을 변환했고 BG bundle은 `sendChat` 함수를 로드했다. 42 packs·1,117 units·13 declared collisions의 조합은 재계획 변경 0, exact revert 뒤 tracked diff 0을 남겼다. 두 installer 파일은 서로 byte-identical한 8,865,094 bytes였고 SHA-256은 `ec52d48209982c9509c5dee4e21b6ef28f98d8c32f2591fbd65d0e38aa3cdd2b`였다. 이 수치들은 **격리 대상**의 결과이며 당시 live 적용 또는 iPhone 검증 결과가 아니다.

당시 runtime audit에서 실제로 깨지는 순서를 먼저 확인한 뒤 다음 경계를 후보 소스와 시험에 반영했다. 표의 “처리”는 적힌 자동·process 시험의 범위이며 모바일 사용 결과의 보증이 아니다.

| 재현·검토한 반례 | 후보에서 처리한 경계 | 남은 외부 확인 |
| --- | --- | --- |
| N이 먼저 통계를 반영하면 오래된 브라우저 root 재시도가 독립 +1을 누락 | 브라우저 호출 ID와 서버 효과 receipt를 함께 보존하고 재저장 시 같은 ID를 재가산하지 않음 | 실제 iPhone 저장 스케줄, 유실 응답과 구형 클라이언트 |
| 효과가 수용된 뒤 ETag 없는 오래된 full root 쓰기가 값을 되돌림 | 이미 효과가 있는 DB의 validator 없는 full-write는 거부하고, 정말 없는 DB의 최초 생성은 별도 허용 | 실제 구형 bundle의 저장 실패 안내와 사용자 데이터 보존 |
| 같은 초안을 두 탭이 별도 ID로 접수해 모델을 두 번 호출 | 저장된 draft ID 공유와 admission transaction의 중복 판정 | 실제 두 탭·기기 사이 초안 저장 순서 |
| 결과/state 정리 뒤 input 원문·hash와 commit recovery 본문이 계속 쌓임 | 참조·기간 조건 뒤 terminal input을 v5로 redact하고 commit 본문을 compact receipt로 교체 | 장기 DB 기록의 정리 timer와 비용·비정상 기록 |
| full payload가 없어졌다는 이유로 오래된 동일 ID 요청이 재실행됨 | 작은 exact input/commit 정체성은 남기고 provider 작업 전에 완료·무효 ID를 fence | 임의로 늦은 구형 client 재시도와 보관 상한 |
| 완료된 start의 409를 구형 클라이언트가 새 생성으로 fallback | exact status로 기존 commit을 확인하고 ambiguity를 새 유료 실행으로 바꾸지 않음 | 실제 캐시된 과거 bundle과 network loss |
| 편집된 입력의 `blocked_edit`가 교착되거나 두 번의 retry가 두 successor를 생성 | 원래 입력과 replacement를 한 transaction에서 연결하고 UI에서 명시적 한 번의 retry만 허용; blocked-only polling 중지 | iPhone 버튼·focus·다른 탭 marker 정리 |
| G1 후보 조합이 이미 live인 설정 pack을 오래된 판으로 교체 | 기존 꾸미기·strict root-only save pack을 보존하고 root 효과 ID와의 저장 경합을 시험 | 실제 꾸미기 화면과 나머지 정상 설정 경로 |

### 당시 최신 patcher 본체와의 조합

이후 최신 1.10 전용 단일-installer patcher 본체 `d2bca03`(`0.2.4-experimental.4`)에 G1 제품 소스를 옮겨 `2732df2` 구현 commit과 `06c5c72` 검증 문서 commit으로 후보를 구성했다. 후보 package는 `0.2.4-experimental.5`였다. 이전 독립 G1 작업선과 새 본체가 생성한 **413개 관리 제품 파일 모두** SHA-256과 POSIX mode가 일치했다. 따라서 이 비교에서 제품 파일 byte 차이는 관찰되지 않았지만, patcher 엔진·catalog가 같다는 뜻은 아니다.

새 본체에서 installer는 `dist/pocketrisu-patcher.cjs` 하나다. 두 번 연속 생성한 결과가 같았고 크기 5,330,374 bytes, SHA-256 `209e29118b8e99fed8bee7bd80bf4c3074c5a09a2eb2995bca251d4431ffb280`였다. 공식 1.10.0 격리 대상의 전체 graph는 42 packs·1,117 units·7 declared collisions였다. apply는 patcher state/intent를 포함한 415 경로를 변경했고, status `current`, 재계획 변경 0, empty-selection revert 뒤 tracked diff 0을 확인했다. patcher 자체 시험은 51/51, 대상 server 350 통과·12 건너뜀, frontend 1,910 통과·2 건너뜀, 타입 오류·경고 0과 생산 빌드 및 BG bundle load를 확인했다. 이전 작업선의 55/55·13 collisions·두 installer 수치를 이 본체의 결과로 바꾸어 쓰지 않았다.

| 증거 층위 | 이번 대화에서 확인한 내용 | 그 결과만으로 확인되지 않은 것 |
| --- | --- | --- |
| 소스·owner 시험 | root effect ID, input/commit transaction, 실패 주입, ACK 유실, N+1, 명시적 retry, payload retirement | 실제 모바일 브라우저의 종료·캐시·설정·플러그인 등록 시점 |
| 생성된 공식 1.10.0 격리 대상 | 전체 server/frontend/patcher 시험, 타입·생산 빌드, graph apply/re-plan/revert | live 사용자 설정으로의 최종 provider dispatch와 유료 호출 |
| spawned process·SQLite·loopback HTTP | 서버 commit과 일반 chat API, 요청 자식 프로세스 종료, 편집·삭제·branch·재시작 | 실제 PWA 프로세스 종료와 복귀 전 완성 여부 |
| live 기본 적용 검사 | 관리 파일 상태, 배포 자산, capability, HTTP와 DB 무결성 | G1 지원 대상 모델 조합의 브라우저 없는 생성·후처리·저장 |
| iPhone 실제 전송 | 기존 model-job 경로의 완료·복귀와 사용자 화면 상태 | input-v1 서버 접수, G1 commit, MARP 훅의 이번 호출 실행 |

## Live 후보 적용과 직접 확인

사용자가 실제 기기·유료 provider 시험을 승인한 뒤, live 변경 전에 당시 관리 파일 370개의 hash·mode를 전수 확인해 mismatch 0을 관찰했다. BG operation state 52건은 모두 `delivered`, 결과 row 0, model job은 `done` 48·`aborted` 2·`running` 0, pending send는 0이었다. 일관된 SQLite 복구본, prior patcher state/intent와 PocketRisu 소스 압축본을 operator-only로 보존했고 백업 DB의 `quick_check=ok`를 확인했다. 완료된 기록을 포함한 백업을 확보한 뒤 PocketRisu 프로세스를 먼저 멈췄다. 진행 중 생성이나 큐를 취소하지 않았다.

현재 본체 installer의 사전 plan은 공식 1.10.0 target에서 verified, 42 packs, 7 collisions, 변경 예정 58 경로였고 AC 경로는 없었다. 프로세스 정지 뒤 정확히 그 58 경로를 apply했다. 첫 BG bundle build는 live `node_modules`에 개발 의존성 링크가 없어 `svelte`를 resolve하지 못했다. package/lockfile을 바꾸지 않는 offline frozen install로 캐시된 109개 의존성을 복구한 후 bundle을 다시 빌드·로드했고, 프런트엔드 생산 빌드는 8,005개 모듈 변환으로 완료됐다. 적용 후 patcher status는 42 packs·관리 파일 413/413 `current`, 재계획 변경 0이었다.

PM2 재시작 뒤 불안정 재시작 0, HTTP root 200, 실제 제공 JS와 로컬 빌드 파일의 SHA-256 일치를 확인했다. 인증된 capability 응답은 `inputCommandVersion=1`, `inputCommandFoundationVersion=4`, `serverChatCommitVersion=1`, `chatExecutionProjectionVersion=1`이었다. live DB `quick_check=ok`, PM2 error log 증가는 없었다. 재시작 뒤 줄어든 BG state 5건은 적용 전 복구본과 대조해 모두 과거 `delivered` 기록임을 확인했다. 이 적용은 **후보의 live 전달과 기본 서비스 확인**이며 실제 G1 생성 완주의 증거가 아니다. AC runtime·원본 소스·provider 설정·사용자 채팅을 시험을 위해 수정하지 않았다.

## iPhone 전송과 저장 관찰

실제 기기 시험은 먼저 앱의 일반 모델 전송을 서버에 접수한 뒤 PWA를 완전히 닫고, 다시 열기 전에 일반 채팅 API에서 답변·revision을 확인하는 순서로 설계했다. 브라우저와 별개로 API를 읽는 인증 방식은 처음에 보안 심사에서 거절됐다. 사용자가 메모리 안에서만 짧게 유효한 읽기용 인증을 만들어 **정상 채팅 GET에만** 쓰도록 명시 승인한 뒤, 존재하지 않는 채팅의 404와 대상 채팅의 200·revision header를 확인했다. 토큰·비밀키·본문을 출력하거나 저장하지 않았다. 반면 저장된 세션 쿠키로 별도 G1 상태 API를 조회하려는 요청은 승인 범위가 달라 거절됐고 우회하지 않았다. 따라서 상태 API의 정확한 HTTP 실패 원인은 미확인으로 남았다.

| 순서 | 기기·서버 관찰 | 판정과 한계 |
| --- | --- | --- |
| 첫 전송 | 사용자는 “서버에 접수된 입력” 표시를 확인하지 못했다. 새 G1 input/commit/operation 기록은 0이었다. Google Gemini main model job 1건이 `done`으로 남고, 재진입 전 정상 채팅 API에는 기존 사용자 메시지만 있었다. | 새 G1 경로가 아니라 기존 client-prepared/model-job 경로였다. 사용자의 완전한 PWA 종료 시점이 확인되지 않아 G1 브라우저 종료 시험으로 계산하지 않는다. |
| 첫 복귀 | model job이 `claimed=1`, pending send 0이 됐고 일반 채팅은 55→56개 메시지로 늘어 index 55에 답변이 저장됐다. UI는 `Model: Unknown`, 입력·출력·최대 컨텍스트 토큰 `?`를 보였다. | 답변 복귀는 확인됐다. 별도 `Tokens 1577`은 답변 텍스트의 로컬 tokenization이지 provider 사용량이 아니다. 복귀 코드의 모델·토큰 metadata 누락은 G1 서버 commit의 결과가 아니다. |
| 두 번째 전송 | 새로고침 뒤 “백그라운드 진행 중…” 상단 상태가 나타났다. 이는 기존 model-job 복귀 표시이며 G1 pending 표시가 아니었다. 두 번째 job은 완료됐고 처음에는 미수령이었다. 채팅 수는 앞서 56에서 55로 보였다. | 사용자가 **이전 메시지를 직접 삭제한 뒤** 새로 보냈다고 확인했다. 이 count 변화만으로 자동 덮어쓰기나 데이터 손실을 주장하지 않는다. 복구용 DB와 원시 응답 journal을 별도로 보존하고 DB 네 개의 `quick_check=ok`를 확인했다. |
| 이후 전송·상태 문구 | 보내기 조작 뒤 “서버 입력 상태를 확인할 수 없음”이 표시됐고, 또 하나의 Gemini main job은 서버에서 `done`으로 관측됐다. 마지막 읽기에서는 결과가 미수령이고 pending send가 1이었다. G1 input/commit 기록은 여전히 0이었다. | `ServerPendingInputs`가 G1 비적격 채팅에도 mount되고 상태 조회 예외를 위 문구로 바꾸는 코드 경로를 확인했다. 실제 조회 실패가 auth·revision·network·server 중 어디에서 발생했는지는 확정하지 못했다. 중복 유료 전송을 막기 위해 추가 Send·취소를 안내하지 않았다. |

첫 복귀 답변의 `generationInfo`에는 generation ID만 있고 모델과 입력·출력·context 토큰 값은 없었다. 직전 답변들에는 그 값들이 있었다. `jobRecovery.ts`는 복구 메시지의 model을 model-job row에서 읽고 토큰 필드를 채우지 않는다. 당시 job row의 `model`은 null이었고, 조회한 Google Gemini main job 50건도 모두 model null이었다. 이 경로에 관여하는 `jobRecovery.ts`·`jobFetch.ts`·`request.ts`·`model-jobs.cjs`·`bgStreamPreserve.svelte.ts`는 적용 전 소스 복구본과 hash가 같았다. 따라서 관측된 표시 문제는 **기존 model-job 복귀 경로의 metadata 경계**로 분류했다. 다만 브라우저가 model 값을 job 생성 시 전달하지 않은 원인이나 구형 캐시 bundle의 관여는 입증하지 못했다.

실제 전송 당시 live 설정은 preset 모드, module binding 활성, plugin-model ID 보유였다. G1의 현행 전역 policy는 각 조건에서 조기 입력을 제외하므로, iPhone에서 유료 모델 응답이 보였어도 서버 소유 G1 input/commit은 만들어지지 않았다. 서버의 detached start rejection 및 `delegate-not-started` fallback 기록도 기존 경로로 내려간 사실과 일치했다. 테스트된 것은 기존 복귀 동작과 UI 경계이며 **서버가 인수한 N의 완주가 아니다**.

## 실제 모델 caller와 MARP 전처리 조사

전역 DB에 plugin-model ID가 저장돼 있다는 사실은 그 ID가 이번 주 모델 호출의 최종 caller였다는 뜻이 아니다. `requestChatDataMain`은 classic `aiModel`·`subModel`을 읽기 전에 채팅·module의 유효 preset binding을 해석한다. 실제 main model job의 adapter kind는 Google Gemini였다. module binding의 master switch가 켜져 있었어도 요청별 `moduleId`와 유효 override를 확인하지 않고 이번 main에 module preset이 사용됐다고 말할 수 없다. 전역 플래그만 보는 `requiresClientOwnedInputPreparation`은 안전 가드로서는 보수적이지만 실제 caller의 지원 가능성을 판정하기에는 넓었다.

사용자가 MARP를 지목한 뒤 live에 설치된 플러그인 스크립트와 저장 설정을 **읽기 전용**으로 조사했다. 스크립트는 PocketRisu v3 플러그인 호스트에서 `beforeRequest` replacer를 등록한다. 일반 요청 코드에서 이 replacer는 주 모델 어댑터 호출 전에 형식화된 메시지를 받아 변환할 수 있다. 조사한 설치 설정은 플러그인 활성, replacer 권한 승인, 주 모델 요청에만 적용하는 선택, 세 분석 단계 활성 상태였다. MARP의 분석 함수는 `worldbuilding` 호출을 먼저 기다리고, 이어 `plot`·`character`를 병렬 호출한 뒤 결과가 있으면 시스템 메시지를 요청에 삽입한다. 따라서 실제로 훅이 실행되는 정상 경로에서는 주 모델 이전에 **최대 세 개의 별도 보조 모델 호출**이 발생할 수 있다. 별도 HTTPS endpoint·인증·취소·timeout·오류 정책을 가진 `nativeFetch` 경로이며, 플러그인에는 조건부 PDF 요청과 text 재시도 분기도 있었다. endpoint·key·prompt 값 자체는 검증 기록에 복사하지 않았다.

설치·활성·권한 승인과 최근 세 iPhone 전송에서 MARP 훅이 실제로 실행됐다는 증거는 별개다. 서버에 durable하게 남은 MARP 마지막 실행 기록은 이 시험보다 오래됐고 실패 상태였다. 요청 로그에서 MARP endpoint와 일치하는 항목도 확인하지 못했지만 해당 로거가 플러그인의 모든 `nativeFetch`를 기록한다고 입증하지 않았으므로, 이것만으로 훅이 실행되지 않았다고 결론내리지 않았다. 브라우저의 현재 플러그인 등록·실행 시각·세 단계 결과와 실제 주 모델 입력을 연결하는 관측이 남았다.

서버 BG bundle이 `sendChat`와 preset binding 코드를 포함한다는 사실도 MARP 함수 등록을 뜻하지 않는다. MARP 훅은 브라우저 플러그인 호스트의 permission·함수 Map에 등록된다. preset 차단 조건만 제거하고 서버 실행을 켜면 MARP가 넣었어야 할 시스템 메시지가 누락된 다른 prompt를 생성할 위험이 있다. 반대로 plugin-model ID가 현재 main에서 쓰이지 않았다는 이유만으로 다른 ax·module·plugin provider 경로까지 서버 지원이라고 승격할 수 없다.

## 계획에 반영한 설계 선택과 남은 결정

2026년 9월 27일의 마지막 계획 변경 `4d8c858`은 전역 모델 토글 대신 **요청별 단계 그래프**를 G1.2·G1.5의 다음 판단 단위로 올렸다. ax·main·후처리별 최종 binding, 실제 `moduleId` override, preset 어댑터, plugin provider, `beforeRequest`/`afterRequest` 훅, 브라우저 전용 epilogue를 구분하고, 단계마다 실행 소유권·서버 지원 근거·중복 방지 ID를 기록하도록 했다. PocketRisu나 plugin 버전이 바뀌어 patcher anchor가 다시 맞는다는 사실은 provider/hook 의미가 유지됐다는 증명이 아니므로 재qualification을 요구했다.

MARP에는 서로 다른 두 인수 계약을 남겼다.

1. **MARP 완료 후 서버 인수:** 기존 브라우저 플러그인이 보조 호출과 prompt 삽입을 끝낸 뒤 변환된 요청을 한 번만 서버에 넘긴다. 사용자는 “서버 접수” ACK까지 앱을 유지해야 하지만, ACK 뒤에는 서버가 main·후처리·정상 채팅 commit을 브라우저 없이 마친다. 응답 유실이나 다시 누르기 때 이미 지불한 MARP 보조 호출을 반복하지 않고, 서버가 삽입 결과를 재실행하지 않는 시험이 필요하다.
2. **MARP 실행까지 서버 인수:** 보내기 직후 앱을 종료할 수 있으려면 MARP의 세 호출 순서, permission, 설정·secret 취급, endpoint 안전성, 취소·실패·재시작과 결과 삽입을 서버의 좁은 버전 고정 연결로 수행해야 한다. 임의의 plugin JS를 권한 검사 없이 Node에서 실행하는 범용 host를 자동 해법으로 두지 않는다.

두 방식은 브라우저를 닫아도 되는 시점과 장애·보관 계약이 다르다. 사용자는 이 대화에서 둘 중 어느 종료 시점을 제품 결과로 택할지 결정하지 않았다. MARP 한 플러그인의 처리만으로 임의의 제3자 plugin provider를 지원한다고 할 수 없으며, 다른 최종 caller는 별도 qualification이 필요하다. 비지원 조합은 서버가 인수했다고 표시하거나 그 결과를 G1 성공으로 계산해서는 안 된다.

실제 사용 조합에 대한 G1 완료 조건도 바뀌었다. classic cloud-model의 격리 통과만으로 preset 주 모델·실제로 적용되는 module binding·MARP 전처리·plugin provider를 지원한다고 하지 않는다. 지원을 약속한 경로는 실제 브라우저 종료 **뒤, 재진입 전** 정상 채팅 API에서 답변·revision·변수·통계가 확정됐는지 확인해야 한다. 일반 Send, pending, 상단 상태 표시는 서버 인수와 기존 model-job 복귀를 구별하고 상태 조회 장애가 중복 유료 전송을 유도하지 않도록 검증해야 한다. 당시의 “서버 입력 상태를 확인할 수 없음” 문구는 조회 실패의 표시임을 확인했지만 원인은 확정하지 못했다.

## 이 대화 종료 시점의 상태와 검토 과제

| 항목 | 2026년 9월 27일 종료 시점의 판정 | 다음 검토에 필요한 근거 |
| --- | --- | --- |
| G1 기본 서버 저장·input·효과 owner | 격리 공식 1.10 후보의 자동·process·HTTP 시험을 통과하고 live 후보가 적용됨 | 실제 지원 조합에서 서버 인수 뒤 PWA 종료와 재진입 전 일반 채팅 readback |
| G1 실제 preset·module·MARP 조합 | 현재 전역 가드가 조기 입력을 제외함. iPhone 유료 호출은 기존 model-job으로 흘렀고 G1 input/commit 0 | 최종 caller와 MARP 실제 훅 실행 증거, 선택한 인수 시점, server/client prompt·효과 parity |
| G1 브라우저 효과·보관 수명 | ID 기반 경합·49시간 payload 정리·compact receipt를 격리 시험함 | 장기 운영량, 실제 timer/오래된 기록, 구형 client·다른 기기와의 충돌 |
| G1 UI·복귀 | model-job 복귀와 답변 저장은 관찰됨. G1 pending 패널의 generic 조회 오류는 원인 미확인 | 상태 API의 승인된 진단, 서버 소유/기존 복귀 표시 구분, 중복 Send 방지 |
| G2 공식 AC 호환 | 목표와 책임만 재정렬됨. 이 G1 후보의 AC-free 시험은 공식 AC 호환 증거가 아님 | 수정하지 않은 공식 AC에서 충돌 재현·기존 API·owner/host 연결 검증 |
| G3 AC 서버 완주 | 공식 API 우선 원칙과 실험·완료 조건만 확정됨 | G2의 지원 조합 위에서 prepare·실제 payload·출력·complete·다음 턴 효과를 브라우저 없이 관측 |

검토 시 금지하기로 한 지름길은 다음과 같다.

- 수정한 AC나 시뮬레이션용 AC JS의 성공을 공식 AC 호환으로 승격하지 않는다.
- G1 capability 값, 서버 bundle load, 합성 H1 process 종료를 실제 iPhone 브라우저 종료 뒤 서버 chat commit으로 승격하지 않는다.
- preset/module/plugin의 전역 설정값을 최종 caller·훅 실행 증거로 대체하지 않고, MARP 함수를 건너뛴 prompt를 동등한 생성으로 취급하지 않는다.
- 원격 통계 숫자가 같다는 이유로 writer를 추정하거나, 모든 충돌에서 delta를 무조건 다시 더하지 않는다.
- 기존 model-job이 복귀 후 답변을 저장한 결과를 서버가 브라우저 없이 채팅을 commit한 것으로 계산하지 않는다.
- 사용자가 삭제한 메시지의 수 변화를 자동 데이터 손실로 단정하거나, 사용자 채팅·큐·복구본을 정리 명목으로 수정·삭제하지 않는다.
- ACK 이후 지원되지 않는 브라우저 콜백을 조용히 생략하거나, 인수 실패 뒤 유료 fallback을 중복 실행하지 않는다.
- 새 PocketRisu·preset·플러그인 버전에 patcher가 적용된다는 이유만으로 과거 지원 결과를 자동 승격하지 않는다.

## 당시 기록을 재확인하는 방법

이 문서의 공개 계획 기준선은 `nai-studio` 저장소의 `4d8c858:docs/BG-PRESERVE-ORDERED-GOALS.md`다. 세부 G1 제품 후보와 live/iPhone 기록은 `pocketrisu-personal-patches` 저장소의 `fbb08e2:docs/POCKETRISU-G1-CURRENT-MAIN-INTEGRATION-2026-09-27.md`, 이전 독립 작업선의 runtime audit은 `a7e7a2e:docs/POCKETRISU-1.10-BG-INDEPENDENT-G1-RUNTIME-AUDIT-2026-09-27.md`를 기준으로 읽는다. 여기서 적은 commit은 **당시 자료를 고정하기 위한 식별자**다. 더 늦은 branch·문서·live 상태는 이 대화의 작업 결과로 합쳐 해석하지 않는다.

공개 계획은 `09b4fff`→`1fb394b`→`4a895c8`→`f4e454d`→`d5c232c`→`5b3f16e`→`2b3f2a5`→`4d8c858` 순서로 이 대화의 목표·시험·미검증 경계를 반영했다. patcher 최신 본체 G1 후보는 `2732df2` 구현, `06c5c72` 자동 qualification 기록, `d90b7f1` live 적용 기록, `ff15d9b` 첫 비적격 기기 전송, `f017a29` 첫 복귀 metadata, `c6d8f11` 두 번째 기기 전송 보존, `fbb08e2` 수동 삭제 판정 교정 순서로 남겼다. 각 단계의 commit이나 문서가 다음 단계의 남은 사용자 검증을 대신하지 않는다.
