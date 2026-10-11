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

사용자 승인으로 §9의 차단을 수정했다. 후보는 `0.2.4-experimental.36`, adapter `0.7.43`이며 기준 commit은 `8a530d8`이다. 현재 단계는 자동 검증 완료 및 OFF 전달 준비다. 실제 기기 L5·운영 readback은 아직 이 문단의 통과 증거가 아니다.

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

### 범위와 기기 gate

수정 범위는 입력 receipt가 있고 현재 채팅의 원문을 확인할 수 있는 anchored 무답변 최종 실패다. 실패 입력을 의도적으로 삭제한 경우에는 부활시키지 않으며 기존 서버 predecessor fence가 남는다. 미확정 저장·evicted snapshot·부분 답변·실행 불확정·receipt 없는 만료 결과는 임의 정산하지 않는다. 이 조건을 일반적인 모든 실패/삭제 복구 완료로 확대하지 않는다.

기기 시험은 정규 소스와 원본 플러그인·저장 권한 답을 사용하는 별도 합성 데이터 인스턴스에서 A/B/C로 수행한다. 유료 공급자를 호출하지 않으며, 해당 결과는 운영 사용자 DB나 실제 provider/hostON/stream/aggregate qualification과 구분한다. 실제 iPhone warm 복귀는 별도 사용자 관찰이며 홈 이동/잠금만으로 내부 OS suspension을 단정하지 않는다.

## 관련 문서

- [G1.8 구현 계획](POCKETRISU-G1-8-FAILURE-LIFECYCLE-PLAN.md)
- [G1.8 구현 및 qualification 정본](POCKETRISU-G1-8-FAILURE-LIFECYCLE-VALIDATION.md)
- [기존 최소 알림 기반 검증](POCKETRISU-G1-8-NOTIFICATION-FOUNDATION-VALIDATION.md)
