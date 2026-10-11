# G1.8 검증 과정 및 결과

기록일: 2026-10-11 KST. 대상은 `0.2.4-experimental.35`, BG adapter `0.7.42`, lazy-chat-sync `0.5.7`이다. 구현 기준은 `85cd2f9`이며, 기기 관찰을 반영한 검증 문서 commit은 `ff40e23`이다. 이 문서는 기존 구현 검증 문서와 별도로 검증 목적, 수행 과정, 실패한 시험, 관찰 결과 및 미검증 범위를 정리한다.

## 1. 검증 목적과 기능

G1.8의 사용자 기능은 서버 작업의 최종 실패·중단·편집 또는 효과 충돌을 기록하고, 앱 복귀 시 해당 채팅과 함께 알리는 것이다. 알림 발행이나 ACK 실패가 원문·이미 저장된 답변을 훼손하거나 모델 실행을 반복하지 않도록 하는 것도 검증 대상이다. 알림은 PocketRisu 앱 내부 표시이며, iOS 시스템 푸시 알림이 아니다.

복구 저장소에서는 이미 적용됐지만 대상 채팅이 삭제된 작업을 실제 대기 작업과 구분한다. 새 journal은 사용자 승인에 따라 완료·정확한 receipt·참조·영속 상태 검증과 49시간 경과 조건을 만족할 때 정리한다. 기존 legacy journal은 이 정책에서 제외한다. 이 49시간 정책과 기존 알림의 48시간 보관 정책은 별개다.

## 2. 검증 순서와 환경

1. 변경된 owner, 호출 경로, 상태·receipt·journal·알림 저장소의 연결을 검토했다. Opus 읽기 전용 자문에서 제기된 문제는 코드와 직접 재현으로 확인하고 수정했다.
2. 생성된 실제 서버 코드, SQLite 및 원본 MARP의 native 호출 경로를 사용하는 격리 시험으로 재시도·실패·중단·복구·다음 전송을 확인했다. 공급자 통신은 합성 transport로 대체했으며 실제 유료 공급자 호출의 증거로 사용하지 않는다.
3. 실제 Chromium과 격리 서버로 브라우저 종료·서버 재시작·홈 복귀·첫 ACK 유실·새 브라우저 재접속을 시험했다.
4. 소스 gate, 구조/runtime 검수, installer 조합·재계획·정확한 revert를 확인하고 OFF 후보를 라이브에 전달했다. 이후 라이브 파일·응답·DB와 설치된 복구 owner를 독립 확인했다.
5. 사용자의 즉시 검증 요청에 따라 브라우저·라이브·읽기 전용 복구 검증을 다시 실행했다.
6. 실제 iPhone 시험을 시도했다. 처음 카드 시험은 의도한 경로와 달라 철회했고, 이후 공개된 시험용 알림 한 건으로 기기 표시·재접속 중복 방지를 확인했다.

라이브 서버 플러그인 호스트는 OFF로 유지했다. 시험을 위해 활성 생성 취소, 실제 공급자 호출 또는 사용자 원본·기존 journal 삭제를 수행하지 않았다.

## 3. 자동 검증 및 서버 관찰 결과

| 검증 대상 | 관찰 결과 |
| --- | --- |
| 최종 소스 gate | 서버 555 pass / 기존 12 skip, patcher 331/331, client 9/9. Svelte 검사 0 errors / 0 warnings. frontend와 BG 빌드·load 확인 통과. |
| 원본 native 재시도 | retry 0/1/2에서 main 호출 1/2/3, 원본 analysis 호출 3/6/9. 설정된 fallback 순서도 유지됐다. |
| 최종 실패 후 다음 전송 | 실패 요청은 답변 없이 실패 알림 한 건을 남겼다. 다음 정상 요청에서는 입력 두 건 보존, 답변 한 건 저장, main 추가 호출 한 건을 확인했다. |
| 알림 저장 실패 | 실제 실패 producer가 독립 발행 의도를 보존했다. outbox 장애만 해제하면 추가 모델 호출 없이 알림 한 건이 발행됐다. |
| 서버 프로세스 중단 | input·analysis·main 및 queued 경계의 실제 격리 프로세스 종료·재시작에서 알려진 영속 효과와 중단 알림을 확인했다. 자동 provider/analysis 재실행은 없었다. |
| 부분 답변·commit 장애 | 저장된 부분 답변의 실패 사실과 알림 identity를 보존했다. commit 및 최종 state 쓰기 장애 뒤 재시작에서도 저장된 결과를 보존하고 commit 실패 알림을 복원했다. |
| 실제 owner/SQLite | 동시 편집·효과 충돌, 영속/미영속 삭제 구분, 채팅 재등장, 다음 접수, 새 journal의 나이·참조·legacy 보호와 transaction rollback을 확인했다. |
| 격리 브라우저 재검증 | 서버 launch 2회, 알림 5건·기록 5건, 첫 ACK 유실 후 요청 2회. 새 context 재접속에서 재표시 없음. provider 호출 0, page error 0. |
| installer 조합 | 42 packs, 1,542 units, 486 managed paths, 8 qualified collisions. re-plan 0, 1,022개 파일의 byte/mode exact revert 및 patcher state 부재 확인. |
| 라이브 독립 재확인 | 관리 소스 486개와 제공 JS 175개 일치, DB 5개 무결성 통과, 인증된 capabilities HTTP 200. online, active 0, unstable restarts 0, host OFF. |
| 설치된 복구 owner 재검증 | 읽기 전용 실행에서 1 pass, commit record 106개, 이미 적용됐지만 대상이 없는 작업 13개/대상 4개. pending input/commit 0, 영속 쓰기 시도 0, 메모리 persist 예약 0. |
| 기존 복구 자료 보존 | legacy operation journal 152행의 배포 전후 byte hash가 유지됐다. 재관측 시에도 152행/10,812,211 bytes가 남아 있었다. |

위 시험 그룹은 서로 겹칠 수 있으므로 별도 focused pass 수를 합산해 전체 시험 수로 만들지 않는다. 브라우저 5건은 기존 unsupported-input producer 한 건과 직접 durable writer로 보관한 v3 대조군 네 건이다. 모든 실패 producer를 그 브라우저 실행에서 재현했다는 의미는 아니다.

과거 body 100개를 캐시에서 유지하던 대조군과 새 캐시의 body 참조 0개를 비교했고, durable row 100개는 그대로 보존됐다. 설치된 owner 재검증에서도 resident chat body 0을 확인했다. 이는 참조 측정이며 RSS·최대 decode 메모리·전체 저장소 크기의 상한을 입증하지 않는다.

## 4. 검수에서 수정한 사항

검수와 직접 재현으로 복구 순서·영속 삭제 증명, 잘못된 journal 후보의 격리, 반복 root decode, archive checksum/호환 경계, 불필요한 legacy outcome 읽기, 재시도 가능한 queued 작업의 잘못된 중단 알림, 부분 답변 실패 알림 누락 및 sweep 결합을 확인하고 수정했다.

최종 자문에서 제기된 committed-partial 상태/commit의 알림 identity 충돌도 확인 후 수정했다. result payload가 사라져도 실패 근거를 잃지 않도록 상태에 고정된 source를 보존했다. 첫 관찰의 KV retention 시각 갱신과 반복 retry·만료 후 쓰기를 구분해 검증했다.

구조 검수에서는 fixture 전용 분기, assertion 약화, 실제 동작을 우회하는 mock, 오류를 삼켜 통과시키는 처리와 보존 계약을 점검했다. qualification을 위해 cap 증가, assertion 약화 또는 새 skip을 사용하지 않았다. 고정된 알림 보관 정책과 once-per-process 경고의 관측 한계는 그대로 기록했다. 자문 동의 자체를 테스트 통과나 런타임 안전의 증거로 사용하지 않는다.

## 5. 첫 iPhone 카드 시험: 철회 및 제외

### 의도

별도 캐릭터 `G1.8 iPhone Check`의 입력 Lua가 8초 기다린 뒤 `alertInput()`을 호출하게 했다. 서버 입력 처리에서 이 대화형 UI 호출이 거부되면 다음 기존 알림을 만들고, 앱 복귀 전달을 확인하려는 시험이었다.

> 서버에서 처리할 수 없는 입력 동작으로 멈췄어요. 원문은 해당 채팅에 보존했어요.

서버 입력 처리에는 질문을 앱에 표시하고 사용자 답을 받아 재개하는 왕복 기능이 없으므로, 해당 경로에서는 이 호출을 중단 사유로 처리한다. 일반 채팅 입력 칸을 거절한다는 뜻은 아니다. 앱에서 실행하는 스크립트는 입력 창을 표시할 수 있다.

### 실제 관찰과 문제

iPhone에서는 `G1.8 notification check`라는 입력 창이 열렸다. 이는 의도한 서버 거부 경로 대신 앱에서 대화형 호출이 실행된 증거다. 이 관찰만으로 어떤 설정이 경로를 결정했는지까지 확정하지 않았다.

격리 시험의 실행 조건을 실제 설치 조합에도 그대로 적용한 안내가 잘못됐다. 시험 목적과 정확한 알림 문구를 충분히 설명하지 않았고, 일반 사용에서 반드시 만나지 않는 스크립트 호출을 기기 시험의 대표 경로처럼 안내했다. 사용자의 조작 오류로 분류하지 않는다.

이 시험은 철회하고 통과 증거에서 제외했다. 철회한 다운로드 파일은 제거했지만, 사용자가 가져온 캐릭터·채팅은 삭제하지 않았다.

## 6. 대체 iPhone 알림 전달 시험: 통과

### 목적과 준비

실제 생성 실패를 만들지 않고, 앱 부재 중 서버에 보관한 알림이 iPhone 복귀 시 표시되고 재접속 때 중복되지 않는지 확인했다. 처음부터 실제 실패가 아닌 시험용 알림이라고 설명했다.

기존 설치된 outbox writer로 테스트 캐릭터를 대상으로 v3 `operation_failed / generation_failed` 알림 한 건을 보관했다. 생성 작업은 제출하지 않았고 provider 호출도 없었다. 보관 직후에는 미전달·미claim 상태임을 확인했다. 표시하도록 준비한 문구는 다음과 같다.

> 서버 요청이 실패했어요. 저장된 원문이나 결과가 있다면 확인해 주세요.

알림의 위치 설명에는 `G1.8 iPhone Check`가 표시되도록 했다. 사용자에게 앱 열기 → 알림 확인 → 앱 종료·재실행 → 동일 알림 재표시 여부 확인을 안내했다. 카드 재전송이나 추가 스크립트 조작은 요구하지 않았다.

### 결과와 해석

- 사용자가 처음 앱을 열었을 때 알림이 표시됐다고 확인했다.
- 앱을 종료하고 다시 열었을 때 같은 알림이 표시되지 않았다고 확인했다.
- 동일한 durable outbox 행을 읽기 전용으로 대조해 v3, 정확한 시험 identity 및 `deliveredAt` ACK를 확인했다.
- 기존 ACK 구현은 claim을 지우지 않고 `deliveredAt`을 기록한다. 남아 있는 claim 필드를 ACK 누락으로 해석하지 않는다.

사용자의 표시 관찰과 서버 ACK는 서로 다른 증거다. ACK만으로 사람이 읽었다고 단정하지 않았으며, 사용자 관찰을 별도로 기록했다.

이 결과는 **실제 iPhone의 앱 복귀 알림 표시와 종료·재실행 후 중복 방지**를 확인한다. 실제 생성 실패, 실패 시 원문 보존, 같은 채팅의 다음 정상 전송 또는 생성 중 iOS suspend를 재현한 시험은 아니다.

## 7. 실패 또는 제외된 자동 실행

처음 카드 시험 외에도 잘못된 cwd/config, 변경 전 UI 문구를 사용한 browser assertion, 이미 사용자 메시지가 있는 fixture를 메시지 0건으로 예상한 실행은 통과 증거에서 제외했다. cwd/config·기대 문구·fixture 구성에 맞춰 수정한 실행 결과만 사용했다. 특히 legacy prepared fixture의 사용자 메시지는 한 건이며, 수정된 assertion도 그 한 건의 보존을 확인한다.

실패한 실행을 최종 성공 수에 섞거나, assertion·알림 수·호출 수를 줄여 성공시키지 않았다. 원본 로그와 영수증은 비공개 운영 기록으로 보관한다.

## 8. 완료 범위 및 남은 검증

G1.8 구현·자동 qualification·구조/runtime 검수·OFF 후보 전달과 이번 iPhone 알림 전달/중복 방지 확인을 종결했다. 이 기기 시험 결과를 전체 실패 경로 검증으로 확대하지 않는다.

실제 유료 공급자, 실제 실패부터 원문 보존·같은 채팅 다음 정상 전송까지 이어지는 기기 경로, 생성 중 OS suspend, G1.9 스트림 소비 경로, G1.10 종합 활성화 및 stable release는 별도 검증 범위다. 라이브 서버 플러그인 호스트는 OFF이며 stable tag/release는 발행하지 않았다.

새 recovery 형식이 생성된 뒤에는 임의의 이전 owner 실행을 검증된 rollback으로 간주하지 않는다. 현재 복구 owner를 보존하거나 저장 상태와의 호환을 따로 검증해야 하며, 코드 rollback을 위해 최신 사용자 데이터를 이전 백업으로 덮어쓰지 않는다.

## 9. 실제 UI Send 재검증 — 2026-10-11

사용자 요청으로 [재검증 계획](POCKETRISU-G1-8-FAILURE-LIFECYCLE-PLAN.md#g18-재검증-계획--2026-10-11)의 자동 선행 검증을 실행했다. **이 시점의 결론은 실제 UI의 실패 후 다음 Send 미통과이며 L5 준비 미완료였다.** 수정 후 현재 결과는 §10을 따른다. §8의 종결은 이전 자동/API 및 시험용 알림 전달 범위의 역사적 결과다.

### 새 검증 방식

유료 공급자를 호출하지 않는 별도 서버/SQLite와 실제 Chromium을 사용했다. 앱의 원래 Send 버튼으로 요청하고, 원래 native main caller의 공급자 transport만 제어했다. 입력 owner, busy flag, 복구 표식, 알림 producer/조회/ACK는 대체하거나 강제로 해제하지 않았다. 제어는 시험 전용 환경·cwd에서만 활성화되며 기존 HTTP/TCP/WS 경계도 외부 요청을 차단한다.

실제 활성 플러그인 6개의 원본 hash가 보관된 시험 원본과 같은 것을 읽기 전용으로 확인하고, 실제 저장된 권한 답을 격리 fixture에 사용했다. 시험 DB의 모델·retry·binding은 명시적인 합성 설정이며 운영 설정을 바꾸지 않았다. 후보 source 486개는 현재 설치 owner와 일치하지만 이전 후보의 제공 asset 19개가 현재와 달랐다. 따라서 동일 현상을 현재 운영 소스와 현재 서빙 dist를 읽어 별도 synthetic cwd/save에서 재현해 오래된 bundle 가설을 배제했다. 운영 앱이나 사용자 DB에서 생성 실패를 유발한 시험은 아니다.

### 관찰 결과

| 경계 | 실제 결과 |
|---|---|
| 새 assertion의 native retry 0/1/2 | analysis 3/6/9, main 1/2/3. agent별 횟수·원문 문구/identity도 검사했다. |
| fallback / prepared 최종 실패 | fallback 모델 순서와 analysis6/main2를 확인했다. prepared 실패는 저장된 사용자 입력1·답변0·실패 알림1이다. |
| 실제 실패 producer와 outbox 장애 / API 다음 전송 | durable intent 보존과 추가 실패 main 없이 알림 발행을 확인했다. API 직접 다음 요청은 원문2·답변1·추가 main1을 통과했다. 이 결과를 UI Send로 확대하지 않는다. |
| 강화된 기존 브라우저 outbox 시험 | notices5/logged5/ACK2/provider0/pageErrors0. 새 context에서 v3 네 종류 모두의 재표시 부재와 로그 증가 없음을 검사했다. 기존 producer1·직접 durable control4라는 범위는 그대로다. |
| 실제 UI 실패 producer | retry1 fixture의 native 실패 main2, 원문1의 정확한 내용/identity, 답변0, v3 operation_failed/generation_failed 1개, intent published와 delivery ACK를 확인했다. |
| 실패 뒤 같은 채팅의 UI Send | **실패.** 버튼이 사용 가능해 보여도 정상 문구의 다음 요청은 접수되지 않았다. 정상 main/답변0, 새 문구는 초안에 남았다. |
| 현재 source/JS와 foreground·closed context 대조 | 같은 차단을 재현했다. 이전 후보의 asset 차이만으로 설명되지 않는다. |
| headless warm visibility 대조 | 다른 탭을 활성화해도 원래 document가 visible이었다. hidden assertion이 실패했고 warm return 통과 증거에서 제외했다. |
| 관련 gate / live readback | syntax·diff check, patcher 외부 test entry52/0fail. 읽기 전용 live source486·asset175·DB5·capability200·hostOFF·active0을 확인했다. 새 UI 실패로 전체 L1~L4 완료를 선언하지 않는다. |

### 확인된 차단과 미확인 원인 범위

실패 알림이 표시된 뒤 기존 앱 오류창의 Confirm을 누르고 같은 채팅의 Send로 정상 문구를 보냈다. 화면에는 `서버 입력을 시작하지 않았어요`와 `채팅이나 설정 상태를 확인한 뒤 다시 보내 주세요. 초안은 남겼어요.`가 나타났다. 클라이언트에는 이전 작업의 accepted 입력 표식이 recoveryOutcome `unverified-parked`로 남았다. SQLite에는 inputState failed / transformState completed, operation result-ready, published 실패 intent와 ACK된 v3 알림이 있었다.

호출 구조는 최종 실패에 response commit receipt가 없으면 복구 표식을 보존/park하고, 다음 접수가 이전 accepted 표식의 비활성 상태를 만나 거절하는 경로다. 이전 서버 API 직접 다음 요청은 이 클라이언트 표식 검사를 거치지 않았다. 이 관찰만으로 운영 중 사용자에게 같은 문제가 발생했다고 단정하거나 experimental.35가 새로 만든 회귀라고 분류하지 않는다. 어느 구체 proof로 실패 입력의 정상 채팅 채택을 확인하고 접수 fence만 해제할지는 별도 설계·검증 대상이다.

foreground에는 기존 오류 dialog, v3 실패 toast, host OFF의 플러그인 생략 안내6개가 함께 관찰됐다. 서로 다른 producer이며 전체 toast를 실패 중복으로 세지 않는다. notification ACK와 실패 결과의 복구 권한도 구분한다.

### 제외된 실행과 다음 gate

격리 재현의 실제 저장 result에는 final terminal-error / anchorResultVersion1 / hasGeneratedAnswer false가 있지만 inputReceiptId·attachedRevision·userMessageId는 없었다. 별도 서버 입력 record에는 inputReceipt와 admission.userMessageId가 보존돼 있었다. 따라서 원문 proof의 서버 소유 위치는 확인했으나 실패 status/API가 이를 어떻게 클라이언트에 제공할지와 현재 채팅 채택 확인 방법은 후속 검토 사항이다. 과거 adoptedRevision stamp만으로 이 빈 연결을 대신하지 않는다.

Opus 5.5는 표식의 최종 실패 종결 경로 누락과 다음 Send 차단을 소스와 진단 기록으로 확인했다. 첫 해제안의 `adoptedRevision` 존재만으로 원문 보존을 증명한다는 조건은 후속 대조에서 철회했다. 이 값은 과거 채택 기록이며 현재 로컬/영속 채팅이나 이후 편집·삭제의 보존을 증명하지 않는다. 실패 projection의 입력 receipt/메시지 identity 제공 여부와 현재 채팅 proof를 먼저 확정해야 한다. 기존 v1 result ACK의 exact operation/resultId·consumer claim·delivered 영속쓰기 후 payload 정리 순서는 코드를 확인했으나 새 실패 종결 ACK의 실제 재현은 수행하지 않았다. 자문만으로 수정 안전성이나 새 gate 통과를 주장하지 않는다.

현재 환경의 브라우저 실행 파일 차이, 권한 fixture 준비, ordinary chat 조회의 JWT 인증·chat identity 누락으로 실패한 초기 실행은 통과에서 제외했다. BG 세션과 ordinary-chat reader 인증을 코드대로 분리한 최종 실행 결과를 사용했다. 초기 helper import의 작업용 logs DB는 open reference 부재를 확인한 뒤 비공개 기록 위치에 이동·보존했다. fixture 기대값·native 호출 수·UI Send assertion을 줄이거나 localStorage 표식을 지워 통과시키지 않았다.

L5는 현재 시작하지 않는다. 입력이 확실히 저장/채택된 최종 실패에 대해 새 접수를 허용할 proof를 검토하고, running/unknown/partial/commit-failed 상태의 원문·결과·효과 보존과 no-replay를 함께 확인해야 한다. 실제 warm iPhone, 수정 미반영 D/G1.3, 실제 공급자·stream·최종 조합·stable gate는 미통과로 유지한다. 운영 코드·데이터·PM2·프록시·host 설정·tag/release는 변경하지 않았다.

## 10. 수정 후 재재검증 — 2026-10-11

사용자 승인으로 §9의 차단을 수정했다. 후보는 `0.2.4-experimental.36`, adapter `0.7.43`이며 기준 commit은 `8a530d8`, 구현은 `abdd81f`, 시험/문서 후속은 `a52fbdd`다. 자동 검증과 OFF 전달·독립 readback을 마쳤다. 실제 iPhone L5는 사용자 결과 대기다. **이 절의 이전 UI 성공은 다음 Send/답변 범위였으며, 이후 root 저장 오류를 놓친 것을 §11에서 정정했다. 최신 시험 준비/저장 검증은 §11을 따른다.**

### 수정한 동작

서버는 실패 입력이 현재 canonical 채팅에 속하는지 기존 입력 owner와 같은 규칙으로 확인하고, 원문/설정을 노출하지 않는 식별 proof를 제공한다. 클라이언트는 확정된 무답변 최종 실패만 정산한다. 정확한 result ACK가 삭제한 payload와 입력 receipt를 바탕으로 버전 있는 ACK 기록을 남겨, 응답 유실이나 표식 삭제 저장 오류 뒤에도 확인할 수 있다. 새 결과가 같은 operation에 발행되면 이전 기록을 먼저 무효화한다. 단순 `acked:true / absent`, 과거 adoptedRevision, 부분/불확정/commit-fault 결과는 표식 해제 권한이 아니다.

이미 있는 입력의 최신 편집은 덮어쓰지 않는다. 입력이 로컬에 없으면 현재 화면과 기억된 정상 저장 snapshot이 모두 원래 접수 기준과 같고 미확정 쓰기가 없을 때만 기존 guarded adoption을 사용한다. 채택 뒤 같은 기준의 N+1 표식도 기존 전진 함수로 갱신한다. Send 직전 정산은 `input-failed` 한 작업으로 한정해 성공 결과의 claim을 다른 기기에서 가져오지 않는다.

### 실제 자동 관찰

| 경로 | 결과 |
|---|---|
| 실제 UI 전면 실패→다음 Send | 실패 main2, 원문 보존, 정확한 ACK, 정상 main1, 원문2·답변1. |
| UI 전송 뒤 브라우저 종료·복귀 | 같은 저장/알림/다음 Send 결과, 재실행 알림 중복0·pageErrors0. |
| 즉시 실패 + 실제 ACK 처리 후 응답만 유실 | durable ACK 확인으로 복구, 추가 provider replay 없이 정상 다음 답변. failed-ui에 없던 원문이 다음 Send 전에 채택돼 빠른 실패 경로도 실행됐다. |
| 실패 중 실제 UI로 N+1 접수 + polling 응답 지연 | backend에서 다음 답변을 먼저 저장한 뒤 UI 복귀를 검증했다. 원문2/답변1, 실패·완료 raw 표식 모두0, pageErrors0. |
| 기존 원본 MARP native 경로 | retry2 analysis9/main3; outbox 장애와 최종 실패/API 다음 정상 요청의 호출 수·보존 검증 통과. |
| 관련 회귀/구조 | 서버570 pass/기존 skip12, 주요 client flow139 pass와 후기 변경분123 pass(중복 합산하지 않음), patcher 외부 entry52 pass. 타입/Svelte0 errors/0 warnings. |
| 전체 frontend | 첫 실행은2313 pass/기존 skip4와 jobRecovery import timeout4. 해당 파일은 수정 전·후 독립 실행 모두45 pass. Node25 시험 webstorage를 끈 재실행은2317 pass/기존 skip4이며 assertions·제품 timeout/cap·skip은 바꾸지 않았다. 원인 단정 대신 실행 환경 차이를 기록했다. |
| 빌드/패처 조합 | frontend/BG build·sendChat load 확인, source490 pair drift0. 42packs/1562units/490managed/8기존 qualified collisions·re-plan0·원본1022파일 byte/mode exact revert를 확인했다. |

Opus 5.5 source 검수에서 ACK 권한·원자성·늦은 발행 무효화·편집 보존의 출고 차단 요소는 발견되지 않았다. 제기된 N+1 기준 전진 누락, 전체 reconcile 호출 범위, 저장 오류 catch와 성공 result claim 부작용은 반영·재검증했다. 자문 자체를 실행 통과로 계산하지 않는다.

### OFF 전달 및 기기 시험 준비

후보 branch에 commit/push 후 활성 요청·native 생성·pending send0을 확인했다. 검증된 전체 복구 사본과 변경 전 앱/패처 상태를 보존했고, 새 앱 보관본1644파일의 내용·권한을 대조했다. 적용·frontend/BG build 동안 사용자 DB bytes와 설정이 바뀌지 않았음을 검사한 뒤 재시작했다. source490·JS175·DB5 무결성·online/unstable0·hostOFF·active0, operation105건 보존/삭제0, 기존 journal163행 보존, 오류 로그 증가0을 확인했다. 독립 readback은 source/mode·서빙 JS·idle·인증 capability200/hostVersion0을 새로 확인했고 DB 무결성은 직후 완료된 전달 검사의5개 결과를 재사용했다.

운영 소스와 dist를 읽는 별도 합성 시험 서버에 원본 플러그인6개·저장 권한 답·시험 채팅3개를 준비했다. 별도 HTTPS 경로의 실제 Chromium 로그인/채팅 화면/capability200/hostOFF/pageErrors0과 운영 로그인 쿠키 보존을 확인했다. 생성·실패 알림은 준비 단계에서0이다. 시험 인증 쿠키만 분리하며 운영 HTTPS 경로는 보존했고 외부 공개를 활성화하지 않았다. 인증정보·주소·보관 경로는 비공개 기록에만 둔다. 실제 iPhone A/B/C 결과는 아직 없으며 stable tag/release도 수행하지 않았다.

### 사용자 A 관찰과 시험 서버 유지 보정

사용자가 지연된 오류창과 뒤이은 정상 답변 표시를 보고했다. 합성 시험 DB에는 실패/완료 입력2개·답변 commit1개·exact 실패 정산 ACK 기록을 확인했다. 실패 알림2개는 서로 다른 operation이며, 사용자가 정상 문구 전 추가 재생성/빈 입력 전송1회를 했다고 확인했다. 같은 작업의 중복 알림으로 분류하지 않는다. 화면의 정확한 원문/알림 개수·재표시 부재와 B/C는 별도 관찰로 남긴다. GPT-3.5 표시는 fixture 모델명이며 실제 유료 호출은 아니다. 실패 응답을 시도마다15초 보류한 시험 장치와 제품 지연도 구분한다.

이후 새로고침 뒤 접근 실패를 보고받았다. 임시 시험 서버 PID 부재·loopback 연결 거절·HTTPS 경로 불변·운영 HTTP200을 확인했다. 원래 실행 세션을 회수할 수 없어 정확한 종료 원인과 상단 알림 문구는 미확인이다. 새로고침이 서버 종료를 유발했다고 단정하지 않는다. 모든 기존 입력/작업이 terminal인 것을 확인한 뒤 같은 합성 DB·로그인·소스·hostOFF·쿠키 경계를 유지하여 시험 서버만 독립 PM2 프로세스로 복구했다. 운영 PID/상태/restart 횟수는 그대로이며 DB 재생성·생성취소·운영 재시작·PM2 save는 하지 않았다. 같은 HTTPS의 실제 로그인/채팅/capability200/host0/pageErrors0/쿠키 보존을 다시 통과했고 시험 프로세스 restart0을 확인했다. 외부 요청 차단으로 발생한 update/hub 경고는 접근 장애와 구분했다. 이 보정은 시험 서버 유지이며 제품의 restart 복구 qualification은 아니다.

### 범위와 기기 gate

수정 범위는 입력 receipt가 있고 현재 채팅의 원문을 확인할 수 있는 anchored 무답변 최종 실패다. 실패 입력을 의도적으로 삭제한 경우에는 부활시키지 않으며 기존 서버 predecessor fence가 남는다. 미확정 저장·evicted snapshot·부분 답변·실행 불확정·receipt 없는 만료 결과는 임의 정산하지 않는다. 이 조건을 일반적인 모든 실패/삭제 복구 완료로 확대하지 않는다.

기기 시험은 정규 소스와 원본 플러그인·저장 권한 답을 사용하는 별도 합성 데이터 인스턴스에서 A/B/C로 수행한다. 유료 공급자를 호출하지 않으며, 해당 결과는 운영 사용자 DB나 실제 provider/hostON/stream/aggregate qualification과 구분한다. 실제 iPhone warm 복귀는 별도 사용자 관찰이며 홈 이동/잠금만으로 내부 OS suspension을 단정하지 않는다.

## 11. 시험 통계 초기화 결함과 root 저장 검증 보강

사용자가 B 준비 중 `Server rejected an invalid database update: server statistic count is invalid`와 전송 차단을 보고했다. 격리 DB의 root는 `statics:{}`이고 서버 답변 적용 ledger가1개였다. 실제 `copyServerOwnedRootState(current,current)`를 읽기 전용으로 실행해 같은 거절을 재현했다. 입력/답변 owner는 정상 원문·답변을 보존했지만 화면 설정/채팅 선택의 root 저장은 막힌 상태였다.

### 원인 및 이전 claim 정정

시험 seed의 `statics:{}`가 native `statics ??= {messages:0, imports:0}` 초기화를 건너뛰었다. A 답변 receipt의 stats는 `skipped`/delta0이었고 원문/답변 저장 성공은 정상 숫자 통계나 이후 browser root 쓰기를 검증하지 않았다. 이전 자동 UI 로그에도 동일 invalid-db 오류가 있었다. `pageErrors0`와 정상 답변만으로 시험 준비를 완료한 판단은 철회한다. §10의 source/ACK 정산, 빌드·suite·graph·OFF 전달 관찰은 각 실행 범위로 보존하되 root 저장 정상으로 확대하지 않는다. SQLite 파일 무결성과 애플리케이션 root 필드 유효성도 별개다.

### 수정과 새 관찰

제품 저장 검사는 변경하지 않았다. 유지 UI probe는 합성 seed의 누락된 통계 필드만 native 기본값으로 채우고 이미 존재하는 잘못된 값은 거절한다. 이 처리는 fixture 보정이며 native 하위 필드 migration을 흉내 낸다는 주장이 아니다. 자동 전용 `--invalid-stats-control`은 기존 불완전한 seed를 보존해 새 검사가 실패하는지 확인한다.

검사는 console/DOM 오류·native dialog·DB 쓰기 non-2xx body를 수집한다. 답변 commit 뒤 실제 UI 채팅 전환/복귀로 root bytes와 선택 metadata가 저장되는 것을 확인하고, lazy root의 부분 메시지 대신 full canonical chat API로 원문/답변 보존을 대조한다. 재실행 뒤 실제 Send를 추가해 원문3·답변2·정상 main2·실패 main2·실패 알림1·표식0과 두 stats commit 각각 delta1/최종 count2를 검사한다. 비동기 영속 반영을 기존 bounded wait로 관찰하며 즉시 읽은 값으로 단정하지 않는다.

| 새 시험 | 관찰 |
|---|---|
| 정상 seed / 전면 실제 Send | root 저장·재실행·추가 Send·원문3/답변2·stats2 통과 |
| 정상 seed / 종료·재실행·쿠키 격리 | root 저장·추가 Send·원문3/답변2·stats2 통과 |
| 즉시 실패 / 실제 result ACK 응답만 유실 | 동일 저장·추가 전송·통계 검증 통과 |
| N+1 실제 UI 접수 / polling 지연 | 동일 저장·추가 전송·통계 검증 통과 |
| 기존 `statics:{}` negative control | `canonical statistic count must remain valid after server answer commit` assertion으로 실패; skip/약화 없이 잘못된 seed를 검출 |
| 같은 사용자 시험 HTTPS | 실제 로그인/capability200/host0/쿠키 보존·UI 채팅 전환 root 저장/복귀·A canonical 메시지 보존 통과 |

기존 격리 DB는 terminal 입력/작업·ACK 완료·stats delta0/no effect를 확인하고 exact root bytes와 전체 합성 SQLite 사본을 보관했다. 시험 프로세스만 정지한 뒤 누락 `messages/imports` 두 필드에0을 넣었다. codec 왕복에서 두 필드 외 deep equality, 옛 bytes를 조건으로 한 UPDATE1행, 나머지 kv key/value/timestamp hash 불변을 검증했다. 이0은 기록된 계약과 일치하는 최소 기본값이며 실제 사용량 복원이나 A 통계 검증이 아니다. A 기록/로그인은 보존하고 운영 데이터·프로세스·저장 guard·tag는 바꾸지 않았다. 기존 시험 탭은 이전 메모리 상태를 버리도록 새로고침해야 한다.

Opus 계획 검수에서 commit owner의 malformed 통계 허용과 이후 projection 거절의 비대칭도 source surface로 확인했다. 운영 root의 숫자 형식은 chunk-aware read-only 조회에서 정상 safe nonnegative integer였다; 값/사용자 콘텐츠는 출력하지 않았다. 잘못된 통계 root의 publication precondition은 별도 미해결 계약으로 남기며 이번 fixture 보정을 제품 수리로 주장하지 않는다. 실제 iPhone B/C·새 통계 경로는 사용자 결과 대기이고 hostON/실제 provider/aggregate/stable은 여전히 미통과다.

Opus 최종 source 검수는 한정된 B 재개 차단 요소를 발견하지 않았다. 이후 unexpected native dialog 부재와 모든 관찰된 rejected-save body 수집 완료를 assertion으로 보강하고 전면·closed·lost ACK·queued 네 경로를 다시 통과했다. 정상 hash-conflict409 뒤 실제 durable root 저장 성공을 확인하며 통계 거절과 구분했다. Negative control은 UI 저장 전에 canonical count assertion으로 실패하므로 console/dialog/body/DOM 검출 채널 자체의 negative qualification은 아니다. 그 채널은 보조 수단이고 긍정 근거는 실제 영속 metadata와 full chat/API·추가 Send·stats receipt다. 기기 모드에서는 자동 browser assertion이 돌지 않으므로 사용자 문구와 시험 로그·root/receipt를 별도로 대조한다. 이전 A의 제한은 유지한다.

## 12. iPhone 실패 복구 관찰 — B/C 후속

통계 fixture 보정 뒤 사용자가 B 완료를 보고했다. 저장된 B 원문2·답변1, failed-input exact ACK 정산, 정상 stats committed/delta1, root chatPage 선택 저장과 self-write 허용을 확인했다. 서로 다른 B 실패 작업3개는 사용자가 추가 재생성/빈 입력 전송2회를 확인해 추가 요청과 대응한다. 한 작업의 중복 알림으로 계산하지 않는다. 홈/잠금 조작은 사용자 보고이며 내부 iOS suspension의 측정은 아니다.

C에서 사용자는 초록 원이 돌 때 강제 종료한 뒤 복귀하여 오류창을 확인했다고 보고했다. 저장 기록은 C 실패 입력 정산·원문2·정상 답변1·stats committed/delta1, 모든 C operation delivered와 실패 알림 delivery ACK를 확인했다. 이어 사용자가 추가 재접속 때 같은 실패 알림이 나타나지 않았다고 명시했다. **C의 같은 알림 재표시 방지 항목은 사용자 관찰과 서버 ACK를 연결해 통과했다.** C 실패 알림2개는 서로 다른 작업이며 추가 작업의 조작 출처는 아직 미확인이다; 단일 동작 호출 수/알림 수까지 통과했다고 적지 않는다.

현재 시험 instance의 입력6개는 failed/completed 각3개이며 operation10개는 모두 delivered, 실패 알림7개는 모두 ACK 상태다. A의 초기 malformed fixture·stats skipped/delta0 제한은 유지한다. 보정 후 B/C는 raw-input 실패 정산→다음 정상 Send/저장, C는 명시적인 cold return/재표시 부재를 확인한 범위다. 파란 원 단계, 정상 생성의 부재 중 완주, 실제 provider·hostON·stream·전체 조합·stable은 이 강제 실패 시험으로 검증되지 않았다. G1.8 전체 달성이나 release-ready 판정으로 확대하지 않는다.

관찰·범위 정정·README/CHANGELOG와 version 영향 검토를 closeout에 반영했다. 제품 소스/version/installer는 .36/.43에서 그대로이고 추가 stable tag/release는 없다. Fixture/root-write 수정의 L3 보고서는 기기 보정 결과까지 정리한 뒤 L6에서 제거했고, 별도 제품/aggregate gate에 필요한 기존 검수 자료는 보존했다. 합성 시험 프로세스와 복구 자료는 남은 기기 gate에 필요해 보존한다.

## 13. Remaining G1.8 implementation and revalidation

The user authorized concrete investigation and implementation of remaining G1.8 work. Source changes are isolated as `3603204` (statistics preconditions), `c434654` (durable failed-input ACK), and `7508972` (anchored edit notices and actual UI probes). Each source checkpoint includes its matching generated installer. The aggregate candidate is experimental.37 / BG adapter0.7.44; this is not a stable release.

### Changes and evidence

| Change | Observed result and preservation |
|---|---|
| Canonical statistics | Raw/prepared admission, fresh assembly, response transaction and first publication reject malformed or overflowing counters. The known refusal does not fall back to a client model call. Ordinary root writes also reject malformed incoming counters before the first BG ledger exists. No historical counts are invented. Valid counters, entirely absent initial-root statics, explicit valid repair and already-applied recovery retain their separate contracts. |
| Failed input deliberately removed after exact ACK | Compact ACK authority is written with checked delivered state in one SQLite transaction and retained in V5 with its checksum. Expired state alone does not erase it. Missing input is clear-only: no adoption, raw restoration or repeated ACK. Unknown/pending local writes, wrong-role/duplicate IDs, mismatched state/result, partial/generated/unknown outcomes refuse the path. Existing legacy records are not rewritten. |
| Queued successor | A successor admitted before the failure resolves against the current chat after exact failure ACK and deliberate removal. The old request is not executed again. Genuine owner assertions cover its effective base and execution predecessor. |
| Actual lost-ACK/remove UI | The server accepts the exact failure ACK while the browser loses the response and status transport is unavailable. The actual native message-only removal confirmation deletes and saves the raw input. After status transport returns, the following Send, root save, reopened context and another Send succeed; deleted input stays absent, with two healthy answers and two durable statistic effects. Three admitted inputs and two retained inputs are distinct counts. |
| Anchored edit producer | A held actual native request consumes the old prior message. Actual UI edit/save preserves the new prior text alongside one answer. The immutable receipt reports `promptInputsChanged:true`; the obsolete merge-reason predicate previously produced no durable edit notice. The corrected producer uses that flag, retaining the old reason only when the flag is absent. Explicit false produces no edit notice. |
| Edit UI positive/negative | Positive: one existing immediate assembly warning **and** one durable server edit notice, separately observed in rendered toast elements; both absent in a newly opened context. Negative: opening/scrolling without editing produces neither warning. Both retain usable following Send, correct answer counts and durable statistics. “One notice” in earlier probes counted only the server outbox row, not total visible warnings. |

The two edit texts are intentionally retained: the existing page-local warning preserves immediate G1.3 feedback, and the new durable notice covers absence/recovery. This candidate does not unify their delivery identities. D instructions must name both texts and distinguish two notices from repeat delivery of the same notice.

The same observed arrays also contain six existing hostOFF plugin-skipped notices in both positive and negative controls. These are separate source events, not edit warnings or a failed synthetic provider. Positive initial UI therefore has six skipped-plugin notices plus two edit texts; negative has six skipped-plugin notices and no edit text. The reopened-context observations contain none of these previous-operation notices. A later new Send may correctly produce its own new skipped-plugin notices.

Automatic observations: server612 pass/12 existing skips; frontend2325 pass/4 existing skips; type0 errors/0 warnings; patcher52 outer test entries. Frontend build completed and the BG bundle loaded `sendChat=function`. The later server-only candidate reused artifacts only after all1,163 client/public file hashes and build-input bytes matched. Graph42 packs/1,569 units/490 managed paths/8 collisions, re-plan0, and original1,022 files/modes restored after exact revert. The R1-only generated checkpoint separately passed156 owner/projection/route tests. Real generated `db.cjs` rollback probes confirm that the checked state-writer failure and publication failure share the same exported SQLite handle as their record writes. There is no lint command in the official target manifest; type/build diagnostics are recorded without inventing a lint result.

Failed runs remain excluded: the first edit trial lacked a built BG bundle and stopped before provider execution; the next reproduced the missing durable producer. Two removed-input harness attempts mishandled the native modal/action order. The maintained probe now checks bundle readiness and uses the actual visible message-only confirmation without forced clicks. No test assertion was removed, skipped or relaxed to obtain the final observations.

### Source counsel and unresolved boundaries

Opus reviewed the R1 plan and source, R2 durability/retirement/compatibility design, and the frozen final candidate. It found no verified R1/R2 blocker, identified the same-handle transaction premise, the two independent edit texts and the need for a live counter-only readback. The handle premise was traced and measured; the live counter was a valid safe nonnegative integer; both rendered edit texts are now separately asserted. Its inspection is source evidence, not a substitute for automated or device execution.

A proposed historical-cache-revision publication guard failed four genuine process recovery/queue controls and was withdrawn before delivery. A narrower target-chat write fence while committed publication is unresolved is a **user-approval-pending design alternative**. It is not implemented by this candidate and prevents a whole-G1.8 completion claim. Ordinary model-time editing remains supported by the positive D probe.

Other limitations remain explicit: old state-only ACK expires without backfill; an unacknowledged expired result does not gain authority; a new publication after a fresh client proof or an older-runtime rollback is not covered by an atomic client-clear guarantee. Physical iPhone D/G1.3, successful blue/green absence, real provider/MARP/hostON, G1.9 streaming and G1.10 aggregate/stable remain separate gates. A/B/C observations in §§11–12 keep their original limitations.

### D / L5 remaining device procedure

The isolated trial uses synthetic prior messages, the original installed plugin sources with existing permission fixtures, hostOFF and a synthetic provider. Operator readiness includes actual login, exact served bundle, capability and preserved production/previous-trial cookies. Private connection/password details belong in the operator channel, not this document.

| UI function | Change under test | Device actions and expected observations |
|---|---|---|
| `수정 알림 테스트`: Send, prior-message pencil/save | Durable edit notice derived from actual prompt assembly | Send `G1.8 정상 확인 D`. Wait for the operator to confirm the actual prompt is held. Edit the earlier `G1.8 편집 전 문장` to `G1.8 편집 후 문장` with the pencil button, then press the pencil again to save. The operator verifies durable edit before releasing the synthetic answer. Confirm saved edit and one answer coexist. |
| Immediate and server edit notices | Preserve existing feedback and add durable delivery | The existing text begins `생성 준비가 시작된 뒤 대화가 수정됐어요`; the durable text begins `응답은 저장했지만, 조립 이후 수정한 내용은`. In the foreground each may appear once; report each separately. After reopening, neither should repeat for this operation. |
| `수정 없는 대조`: Send/open/scroll | No warning without an edit | Send `G1.8 정상 확인 D` in the second trial chat. Open/scroll without changing messages. After the operator releases the held response, confirm one answer and no edit warning. |
| Reopen and following Send | Preserve edit, answer and usable chat | Reopen the first trial chat, verify edited text and answer, then send `G1.8 정상 확인 저장 후`. Confirm a new normal synthetic answer and no repeated edit warning. Operator independently checks records, counts, ACK and saved state. |

Physical D is pending. No stable tag, activation or G1.9 work is implied.

### OFF delivery and independent readback

The aggregate candidate was pushed and applied only after active request/model/pending-send and nonterminal-input checks. The verified full recovery anchor and stopped application/patcher backup were checked before source changes:1,648 files with matching bytes/modes, archive91,770,904 bytes. The18 planned paths were applied; frontend and BG build/load completed. Database file bytes were unchanged during stopped source/build application. After restart, five database integrity checks passed;490 managed source paths and175 served JavaScript assets matched the installed source/artifacts; external-header settings and167 existing journal rows retained their bytes. The process is online, active0, unstable restarts0, hostOFF, with authenticated capability HTTP200/input1/commit1/host0 and new error lines0. Independent readback rechecked source/modes, served assets, process/idleness and capability; it reused the immediately preceding post-restart five-database integrity result without an unnecessary repeated scan.

Lifecycle state rows changed88→83. The five removed rows were already `delivered` and exceeded48hours at process start; the unchanged existing retention caller requires inactive operation, absent result payload, TTL expiry and notice-retirement eligibility. This is normal lifecycle metadata expiry, not agent cancellation or deletion of chat/user payloads. Removed identities, old states and timestamps are recorded privately. No terminal-state-count equality was used as a qualification gate.

The current/previous rollback material and still-required device/recovery evidence remain protected. No temporary-directory or worktree cleanup was performed. The ordered-goals document is committed locally in its separate repository; its main-branch publication was rejected by automatic approval review and awaits the user's separate publication decision. PocketRisu source/results are published on the existing candidate branch. Physical D and the publication-fence design decision remain open.

## 14. iPhone D/G1.3 positive edit observation

On the isolated experimental.37 / adapter0.7.44 candidate, the user sent the D text and reported the input-area server-generation indicator. The operator confirmed actual prompt assembly with the old prior text, one provider call, attached input and no answer. After the user edited and saved the prior message through the pencil control, a canonical read confirmed the new prior text while the request was still held. The operator released that existing synthetic response without another request or cancellation.

The user supplied Mobile Safari/iOS records for both immediate `bg-assembly-context` and durable `bg-notification` warning texts and explicitly confirmed both appeared. The same edit outbox event subsequently had delivery ACK true. On reopening, the user explicitly reported no repeat notice and successful preservation of the edited text/answer. The following normal Send also answered.

Server readback: two completed inputs, two provider calls, edited prior text retained, one D answer and one following healthy answer, canonical message statistic2 and two stats committed/delta1 receipts. The D receipt has `promptInputsChanged:true`; the following receipt false. Exactly one edit outbox event remains, ACK true. Human observations and server evidence therefore close the **positive edit/reopen/next-Send device scope**. They do not establish OS suspension or actual-provider behavior.

The second-chat no-edit control subsequently completed: actual assembly used the unchanged prior text; the held synthetic response was released after canonical verification. Server readback confirmed one target answer, stats committed/delta1, `promptInputsChanged:false` and no target edit outbox event. Aggregate trial counts are three provider calls, three completed inputs and canonical message statistic3; the first chat's sole edit notice remains ACKed. The user explicitly reported no edit warning. Negative-chat unchanged text/answer visibility was not separately restated by the user, so those details remain canonical persistence evidence rather than an additional visual claim.

The **scoped D/G1.3 edit-notice device gate is closed**: positive after-assembly edit/save, both warning sources observed, reported reopen without redisplay, positive edit/answer preservation and following Send, and negative-warning absence. L6 records the results, reviews README/version/docs, publishes the observation closeout and removes the completed remainder L3 working report. Product source/version and activation remain unchanged. Entire G1.8, the pending-publication design question, G1.9/G1.10/hostON/stable and the separate ordered-goals publication decision remain open; D is not promoted to those outcomes.

The user also reported update and Hub server errors caused by the isolated runtime refusing other outbound requests. Hub traffic is deliberately outside the synthetic-provider boundary. The update suppression configuration was incorrect: the launch set `UPDATE_CHECK_DISABLED=1`, but official PocketRisu source reads `RISU_UPDATE_CHECK=false`. The automatic launch and private device-launch helper were corrected without altering the network boundary or production source. A fresh actual no-edit UI control passed with update-failure events0 and two Hub-refusal events, counted by their unique log anchors. After fresh checks of no active request/model/pending-send/nonterminal-input, only the isolated device process was restarted with the correct flag. Readback preserved both completed inputs, provider calls2, the edited prior text, both answers, canonical statistics2 and the ACKed edit notice. Earlier statements of no page errors/invalid saves do not mean the isolated server had no ancillary errors; update/Hub refusals are classified explicitly. The existing log entries were not erased, and a generation/commit error would still need separate diagnosis.

## 15. Remaining pending-publication preservation defect and reviewable plan

After the scoped D notice gate, the remaining publication question was tested rather than implemented from an unverified concern. A genuine owner/SQLite control with raw-input and prepared anchored paths reproduces loss of a later successfully persisted edit only when canonical publication remains pending. A post-recovery flush also persists the old text. Already-published controls preserve the edit.

The minimum actual-server experiment uses generated `server.cjs`, genuine owners/journals/SQLite and real HTTP routes, the existing controlled H1 provider, paired built dist and valid build headers. Publication is deliberately failed after the commit transaction. Full-chat saving with a valid canonical base returns200 and the late edit is observed in `database.bin`. A fault-free restart followed by the actual debounced flush loses the edit in both old-view and answer-inclusive payloads. Already-published controls retain it. All four retain byte-identical commit receipts, one answer, statistic11 and one provider call. The preservation assertion correctly fails; this is a defect reproduction, not a passed qualification gate.

A paired root-write/deletion control also fails preservation: deletion of an agent-created synthetic chat returns200 and GET404 before restart. The already-published control stays absent; the pending-publication control restores metadata/content and returns200 with one answer after restart. Statistic11, exact receipt and provider1 remain. No real user data was deleted, no live fault was injected and no provider was called externally.

Opus confirmed the source counterexample and reviewed the actual HTTP observations. Reachability is limited to an in-process publication failure that leaves the server serving, or a startup recovery stall that still proceeds to listen. Ordinary crash recovery completes before listen and is not evidence of this loss window. The fault replaces publication before cache mutation, matching the state left by real first-applied throw sites; a natural trigger, live frequency and the persistent-startup case remain unmeasured. The first HTTP attempt read the durable statistic before its debounce and failed10vs11; it was retained and excluded, and synchronization was corrected without reducing the expected count.

### Revised architecture proposal — approval pending

Recover before accepting an affected write. For an exact target with a validated non-retired receipt missing from the current applied ledger, complete publication and input finalization inside the existing storage queue slot without recursively enqueueing recovery. Successful recovery then uses the ordinary current-revision/CAS path, preserving conflict-free local edits plus the server answer. Genuine overlapping edits retain existing explicit conflict handling. If recovery is still blocked, return a distinct non-conflict blocked-save condition, retain local dirty edits in the current view and show the reason without promising quick recovery or silently declaring save success. This retention is not server acceptance or guaranteed durability after closing the app; a new durable deferred-edit store is not part of the approved scope.

Full/delta chat writes and root full/patch writes need the same entry protection for affected content/metadata, including target rename/deletion and parent-character deletion. Root ETag changes must preserve unrelated dirty settings through the root rebase path; valid counter repairs and other-chat/unrelated settings writes remain possible. The normal model-running edit path is preserved. Existing global-effect expected-base checks and once-only statistic/application receipts must not be weakened. The plan uses current receipt/application identity rather than the withdrawn historical revision comparison. No new index is chosen before lookup-cost measurement.

Required tests: pending/published actual write/restart controls, raw/prepared and old-view/answer-inclusive variants, exactly one answer after rebase, delta/root/target/parent deletion and rename, root CAS/unrelated settings and counter repair, persistent recovery failure with retained drafts and explicit save state, no false conflict copy, no model/effect replay or deleted-data resurrection, real browser save/recovery and D regressions, L1–L4/source counsel and matching installer/graph/exact revert/idle OFF delivery. Existing chat codec/delta suites pass43, which is supporting coverage rather than qualification of this unimplemented change.

The previous comparison-guard attempts failed real cold recovery controls and were withdrawn. The repository bug-fix protocol requires a structural flow/impact review and explicit user approval before the alternative architecture. This proposal is concrete and reviewable but **not implemented or deployed**. D remains closed at its observed scope; whole G1.8/stable/hostON remains open.

## 16. Approved recover-before-write implementation (.38)

The user selected option1 after the structural flow and impact review: recover the existing committed answer before an affected save, and retain a visibly unsaved current-view draft when recovery remains blocked. Section15 records the preceding unimplemented proposal; this section supersedes that status. The candidate is experimental.38, BG adapter0.7.45/lazy0.5.8. Device and live delivery observations are separate gates, not inferred from source or test success.

### Contract and implementation

- An exact validated non-retired commit lacking its matching current applied identity is recovered within the existing storage slot, without recursively queueing recovery. Input finalization is included. Full/delta chat and root full/patch writers then use current CAS; immutable receipts and once-only effects remain unchanged.
- Known persistent publication failure returns `BG_PUBLICATION_SAVE_BLOCKED`; an unclassified canonical lookup failure returns `BG_SAVE_ADMISSION_UNAVAILABLE` and follows ordinary unavailable-server handling. Neither is a successful write or a user conflict. Coarse server diagnostics do not copy user content.
- The client retains its acknowledged basis and current-view dirty tracker. A partial batch can save unrelated chats and root settings; an explicit durable caller only qualifies its own named scope when that root actually succeeded. A root body containing protected metadata/global changes remains refused as a whole. This is not durable deferred-edit storage, and app closure may lose an unsaved draft.
- Hydration reads formerly suppressed an edit's dirty effect while a plain Set was held, with no reactive wake on release. Finalization now re-enlists changed live views through the ordinary queue, preserves streaming checkpoint cadence and resolves the actual current chat array. Known owned/ordinary publications are compared against their observed publication fingerprint to avoid echoing them; foreign full replacements are conservatively compared against the initial full view and can cause an extra guarded write.
- Derived owner summaries are bounded256 and rechecked against exact current record bytes on every lookup. Current ledger/input/retired proof is fresh; recovery revalidates the full record. This does not restore the withdrawn cache/base revision guard. Normal chat opening computes no additional publication fingerprint unless another reader overlaps.

### Evidence observed before device/delivery closeout

- Paired-build real generated server/SQLite/restart controls:22 cases covering full/delta, old-view/answer-inclusive edit, target/parent deletion and rename through root full/patch, unrelated settings while publication is blocked, valid pre-publication statistic repair and rejection of an unproven post-publication counter increase. Affected saves are503 while blocked, then current CAS409/rebase and200; edits/deletions remain after restart, provider/effects are not replayed and receipt bytes are unchanged.
- Actual no-pending canonical lookup fault: four routes503 with the distinct unavailable explanation, zero mutation, then saving resumes after release. The patch/full fallback status distinction is preserved.
- Actual browser native Send/pencil/save trial: one blocked warning, retained local edit and unchanged server text while blocked; another chat of the same character starts generation and reaches an actual result ACK200 while the first is blocked; release produces normal CAS/rebase and one saved answer per chat/statistic12, without dialogues or page errors. This is a controlled provider/publication-fault trial, not a paid-provider or iOS observation.
- A detached-array hypothesis was reproduced on the preceding code with two failed actual-adoption assertions. Maintained controls now cover live slice/clone replacement, failed/stale reads, streaming/non-streaming edits, concurrent known publication without echo and subsequent edit. Test-only malformed startup seeds, missing browser executable and held-read fixture errors were retained and excluded; assertions and production validators were not weakened.
- Earlier full server630pass/12existing skips is reused for the last client-only changes only after all108 generated server source/test files match. Full client/type/build and focused results for the final frozen candidate, plus installer re-plan/exact revert, are completed in their own receipts before delivery; no pending run is labeled passed.
- Owner lookup measurement on ARM:50 rows warm median about2.5ms;200 rows about13–15ms, versus about23–31ms and105–109ms without summary reuse. Cold validation remains about26–33ms/107–109ms; larger-than256 working sets may lose reuse.

### Scope and remaining gates

Final automatic checkpoint: full frontend2341pass/4existing skips; the normal-open cost guard additionally passes82focused/4existing skips, including a no-fingerprint ordinary open. Type0errors/0warnings, frontend build and BG bundle load succeed. Installer roundtrip observes42packs/1596units/495managed paths/8collisions, re-plan0, exact1022original file bytes/modes restored, clean disabled delivery and empty requested intent. Final actual native-Send/pencil two-chat controls preserve the refused draft, observe one notice and X's ACK200 before releasing Y, then normal CAS/save. Positive/no-edit compiled-provider controls preserve edits, distinguish the two warning sources and pass reopen/following-Send. Physical R4 and production delivery remain separate observations below.

Opus source counsel identified and helped refine typed-error preservation, strict-save scope, absence handling, hydration dirty tracking, live-array resolution and normal-open fingerprint cost. Codex verified findings with source and execution; agreement alone did not qualify them. Natural failure frequency, first-paint interaction, mobile suspension, arbitrary storage corruption and host-on direct plugin writes are not inferred. Permanently unrecoverable affected data remains refused under approved option1, with no cancellation/deletion escape added.

Delivery checkpoint: implementation/installer/documentation commit `a646988` was pushed to the candidate branch. A chunk-aware read-only preflight observed73valid commits, invalid0/unapplied0 and valid statistics before restart. Idle checks observed active requests0/pending sends0/nonterminal inputs0; no work was cancelled. The stopped application/state backup verified1648files/91,786,946bytes against a protected full recovery anchor. Live apply/build/restart kept database bytes unchanged while stopped. Subsequent checks observed493managed files/175served JS assets/5database integrity results,167existing journal rows and header settings preserved, operation-state removal0, online/unstable restarts0/hostOFF and new error lines0. Independent readback confirmed source/modes/assets/idleness and capabilityHTTP200/input1/commit1/host0, reusing the immediately completed integrity scan rather than repeating it.

The isolated physical test server is prepared with synthetic data/provider and a distinct session-cookie namespace. Browser preflight verified HTTPS200, matched loaded assets, preserved both production and prior-test cookies, page errors0 and hostOFF capabilities. This is readiness evidence; it is not an iPhone result. The physical R4 gate must cover the real edit/save warning, repeated save without alert flood, another chat's normal request while the first draft remains blocked, recovery and visible saved edit/answer. L5 uses the UI-function/change/finger-scenario table; L6 follows that scoped response. This section does not declare whole G1.8, G1.9, host activation or stable release complete.

### Physical R4 intermediate observation

The iPhone user reported that the edited text remained after returning to the blocked chat. Read-only server inspection confirmed two committed operations: the first remained pending canonical publication with the original prior text and no published answer, while the other chat had its applied receipt and one published answer. Mobile Safari logs contained one publication-save-blocked notification record, alongside repeated refused-save diagnostics. The user did not clearly observe the transient notification and may have missed it while not watching the top of the screen; notification invocation is observed, physical visibility is not qualified. This is an intermediate result, not an L5 pass.

After this observation the isolated test publication fault was released through its existing control. Recovery, another edit/save and reopen verification remain pending. No production fault, restart, cancellation or user-data deletion was performed for this step.

### Physical R4 recovery and reopen closeout

The release event was observed once. The user saved a third prior-message edit and reported no new apparent error. Read-only inspection then confirmed the exact third edit in the durable database, one answer in each chat and both matching applied commit identities. After the user refreshed the same test page, they reported unchanged normal behavior. A second read-only inspection confirmed the same saved edit, answer counts and applied identities; the publication-blocked notification still had one record with count1. No additional provider-finished or commit-result events appeared: each remained two for the two test requests.

The scoped R4 device result closes current-view draft retention, unrelated-chat answer publication, recovery followed by edit/save, and refresh preservation. The transient warning's invocation and lack of repeated records are observed; its physical visibility remains unconfirmed and is not promoted to a passed display assertion. A permanently refused draft's durability after app closure is not claimed. Earlier D, A/B/C and automatic observations retain their individual limits.

L6 reconciles this result with the lifecycle qualification, plan, README/version and changelog, publishes the documentation closeout and removes the completed R4 L3 working report. Runtime source, installer version and hostOFF stay at the delivered experimental.38 checkpoint. Remaining normal-generation absence/device coverage, actual-provider/MARP, stream, aggregate activation and stable gates are not qualified by this scoped result.

## 관련 문서

- [G1.8 구현 계획](POCKETRISU-G1-8-FAILURE-LIFECYCLE-PLAN.md)
- [G1.8 구현 및 qualification 정본](POCKETRISU-G1-8-FAILURE-LIFECYCLE-VALIDATION.md)
- [기존 최소 알림 기반 검증](POCKETRISU-G1-8-NOTIFICATION-FOUNDATION-VALIDATION.md)
