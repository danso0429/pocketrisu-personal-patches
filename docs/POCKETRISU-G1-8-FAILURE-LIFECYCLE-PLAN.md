# G1.8 failure, retry, notification and recovery lifecycle

2026-10-11 KST. Baseline85cd2f9 / experimental.34, BG adapter0.7.41 and lazy-chat-sync0.5.6. User requested G1.8 execution. Keep existing unrelated work, plugin originals, custom/local/native configuration and production hostOFF. No paid provider, generation cancellation, stable release or bulk user-data cleanup is part of qualification.

The user explicitly approved automatic retirement of NEW input/commit journal payloads after49hours once completion, exact receipt and remaining-reference checks pass, including when the original chat has been deleted. Existing legacy journal bytes remain protected. Notification TTL48h and recovery retirement49h are separate policies; the latter retains the existing recovery margin.

## Completion contract

- Exercise native retry/fallback through final callers; distinguish the original repeated analysis from host-created replay. A failed provider must remain failed after exhausted retries; caught nonprovider omissions preserve the previous chain value and visible effects.
- Qualify input/analysis/main worker/process loss, restart, partial and committed results. Retain raw input, known paid effects/results, exact commit identity and no automatic paid restart. The next healthy request must remain usable.
- Store host-observed final failure/restart/edit/conflict notices while the app is absent and deliver through the existing visible notification channel. Preserve primary terminal outcomes during outbox failures, with durable retry intent, fixed codes/no provider bodies, bounded retention and versioned reader compatibility.
- Distinguish a proven already-applied commit whose target is absent from metadata AND hydrated storage from hydration-only failure, unapplied publication, corrupt/missing journal and receipt/sequence mismatch. Preserve deliberate absence and do not replay model/global/stat effects. Genuine unknown states remain pending.
- Bound operation-journal payload lifetime in memory and future retained recovery material. Existing payload bytes are not swept merely to eliminate warnings. Preserve old recovery/source material and document legacy storage separately from new retention policy.
- Matching source/installer tests, L3/L4, source counsel, graph/re-plan/exact revert and safe OFF delivery/readback. Physical absence/return/notice/dismiss/next-send L5 remains a concrete user gate before stable/aggregate completion; automatic browser evidence is recorded separately.

## Source observations

The commit owner `publishCanonicalState` checks an existing applied receipt, but throws when its hydrated chat is absent even if canonical metadata is also absent. `pendingCommitRecovery` then treats the result as retryable indefinitely. The committer validates the stored record and journal before canonical publication; those checks must survive classification. Existing tests protect non-resurrection but do not prove terminal absence classification.

`chatWriteJournal.ensureLoaded` decodes and retains all operation journal chat objects. `restoreInto` and `clearAfterDatabasePersist` skip operation records. Commit retirement writes an exact compact receipt and removes recovery metadata after the shared horizon, but does not remove the owned operation journal. Ordinary journals, first-stub pressure, transaction rollback and new-chat recovery must remain intact.

The minimum notification producer covers unsupported input. Current plugin producers cover permission/API/hook/provider/limit/late-call/CAS/settlement observations. Final native generation/restart/commit-edit outcomes need direct caller-to-durable-outbox coverage; original network success is not semantic analysis success. Existing actual process probes already cover selected crash/restart/retry ownership and can be reused only where source/contract match.

## Implementation sequence

1. Recovery classification: add failing genuine-owner cases for complete absence, metadata-only/hydration-only absence, unapplied records, corrupt/missing journal and ledger/sequence mismatch. Add an explicit non-published terminal absence outcome only with validated durable ownership; improve startup classification instead of suppressing errors by counts.
2. Journal lifecycle: keep operation metadata without caching whole chat bodies at load, prepared publication and durable restore; on-demand validation must still read immutable payloads. Cover BOTH input-attachment and result-commit journals. Add transactional journal+recovery retirement for newly versioned retention-eligible records, preserving compact receipt and ordinary journal contracts. Legacy bytes remain protected; no automatic legacy backfill/delete. Verify rollback, missing/corrupt payload, age, active/result/input ownership and immediate memory publication boundaries.
3. Final failure notices: trace generated admission/result/state/restart consumers before selecting hooks. Use authoritative new-operation opt-in and durable source intent, no historical failure backfill. New fixed operation codes require a versioned namespace/reader path; do not disguise native failure as a plugin. Publication/storage failure cannot turn an existing failure into success or trigger effects again.
4. Maintained actual retry/fallback/failure and browser outbox matrix: configured retries0/1/multiple, fallback, final failure, input/analysis/main loss, committed-before-publication and competing edits; store/list/claim/ACK/lease/TTL/corruption/capacity and browser hidden/return/restart/lost ACK. Use synthetic endpoints with no production credentials; independently assert analysis/main/effect/commit counts and retained input/answer.
5. Broad structural/runtime audit, relevant full suites, source pairing/build/load, graph/exact revert, fresh Opus source consultation, privacy sweep and explicit-path commits/push. Idle/verified rollback-gated OFF delivery and independent readback close automatic work; device/activation/stable boundaries remain explicit.

## Decisions to resolve with source consultation

Use an additive terminal absence outcome rather than pretending chat publication succeeded. It must not grant current-context readiness or mark a missing chat as hydrated. Input finalization and effect lineage must recognize the exact outcome without replay.

Source consultation confirmed the published-ledger ownership and restore/reset coupling, but cache-only absence is not durable proof. Fresh recovery may return a nonpersistent absence disposition. A new input absence marker and retirement must recheck an immutable persisted-root snapshot and its unchanged bytes inside the transaction, plus current absence/receipt/sequence. Predecessor and retirement may accept the marker only while its target remains absent; reappearance restores ordinary readiness rules. Metadata-present/hydration-missing receives a distinct structured failure class; unapplied records continue normal validated publication recovery. Effects lineage remains intact.

Prefer metadata-only operation journal cache over a new generic cache abstraction. New retention eligibility should be explicit and backward-compatible, leaving legacy user payloads unchanged. The retention horizon reuses the existing shared recovery policy; no new arbitrary timing threshold or unbounded-memory assertion.

Prefer a small operation-notice owner at existing final-state boundaries with source retry after restart. Exact consumer hooks and compatibility will be settled after tracing, without moving existing pack ownership. Distinguish source failure durability from UI enqueue, human observation and external provider cancellation.

## G1.8 remaining implementation units — 2026-10-11

Baseline `0b48497`, experimental.36 / adapter0.7.43. User authorized investigation, implementation and revalidation of remaining G1.8 work. The ordered goals remain authority. G1.9 streaming is outside this implementation; actual-provider/hostON/aggregate/stable qualification stays separate. Earlier A/B/C observations retain the limitations in verification record §§11–12.

| Unit | Result and preservation contract | Verification |
|---|---|---|
| R1 Canonical statistics preconditions | Refuse invalid/noninteger/negative/overflowing canonical message counters before new server-owned input/model execution and before response commit/publication. Do not invent historical counts or weaken root-write validation. If state changes after execution, preserve the generated result and original input without a false applied receipt or model replay. | Genuine owner/SQLite cases for absent/object/array/null/string/fraction/negative/unsafe counters, delta0 and positive deltas, valid counters, queued context refresh, transaction rollback and repair/retry without duplicate effects. Trace raw and prepared callers, publication/recovery and normal custom/local routes. |
| R2 Deliberately removed settled failed input | Allow a new input after a user removes a previously ACK-settled no-answer failed raw input. Persist exact ACK authority bound to operation/chat/input receipt/message/attached revision in the owned V4 record and retain it in the compact V5 checksum. Expired operation state alone does not erase that proof. Any present mismatched/corrupt state, superseding result, unknown transformation or partial/generated answer refuses settlement. Preserve deletion and all earlier effects; no journal restoration or retry of the old request. | Genuine owner cases for removal after exact ACK, a queued successor, missing/mismatched ACK, newer results, atomic write errors, state/result expiration, V5 retirement, duplicate/wrong-role identity and client clear-only handling. Actual lost-ACK/native removal/next-Send UI control. No legacy record rewrite/backfill. |
| R3 Edit-warning device qualification | Exercise a controlled successful native request held after actual prompt assembly. A prior-message edit must persist alongside one answer and one not-reflected notice; open/scroll/no edit must not warn. Original input/answer identity, next Send, ACK and no replay remain intact. | Maintained original-UI positive and negative controls first. Then prepare fresh isolated iPhone edit/no-edit chats and observe user gestures plus canonical chat/notice/receipt evidence. Original A/B/C records and production user data remain unchanged. |

R1/R2 are independent small commits with appropriate automatic gates and matched installer rebuild. Source counsel precedes implementation and follows changed-path L1–L4. Graph/re-plan/exact revert, privacy sweep, idle/verified-backup OFF delivery and independent readback precede user device requests. R3 may require only test transport/setup changes if the existing edit-notice source satisfies its actual callers. Failed approaches and unqualified detection channels stay documented.

Before closing G1.8, reconcile the ordered-goals progress table, lifecycle plan/validation, latest verification record and JOURNAL waiting entries. State each completed automatic/device boundary and unresolved contract explicitly; do not turn broad G1.10/provider/stream gates into fabricated G1.8 passes. Stable/tag/host activation is not authorized by these synthetic controls.

### Earlier failure-retest plan

Current correction: the post-home provider-waiting0-call inspection and later generation/API save prove controlled generation after home, but deliberately delayed admission confirmation produced a~69s unknown notice. The subsequent natural-response Send exposed an uncertain marker left after a committed answer. Experimental.39 transfers only exact matured chat-committed markers to the existing accepted hydration/ACK owner. Source/browser reproduction and correction, counterexamples, automatic gates and pending natural-response device/delivery boundaries are recorded in verification record §18.

Follow-up closeout: verification record §17 observes the blocked-save notification on iPhone and accepted-request confirmation/return with one provider call, saved edit/one new answer and normal refresh. The earlier physical-display uncertainty is resolved. This is an admission-confirmation indicator trial, not the separate stage1 indicator or pre-admission background delivery; banked H1 provider-release credit prevents a sustained-after-home computation claim. Broader G1.10 absence/provider/aggregate qualification remains distinct.

Current R4 status: user-approved recover-before-write is implemented and delivered in experimental.38. Genuine HTTP/restart, browser and owner gates are recorded in verification record §16. The isolated iPhone test confirms retained refused edits, unrelated-chat publication, recovery/save and refresh preservation. One warning invocation is logged; physical visibility is unconfirmed. This closes the implemented publication-preservation defect's scoped retention/recovery gate, without treating remaining normal-generation absence/device coverage, provider/stream/aggregate or stable gates as passed. The earlier architecture-approval requirement is satisfied by the user's option1 decision.

상태: 계획 수립 단계. 아래 새 시험의 실행·통과, 시험 공급자 준비 또는 iPhone 시험 시작 가능 상태를 뜻하지 않는다. 이전 자동 검증과 시험용 v3 알림 표시/재실행 관찰은 해당 범위의 기존 증거로 보존한다.

현재 실행 상태 — 2026-10-11: 실제 UI 재검증에서 실패 후 다음 Send 차단을 발견하고 사용자 승인으로 수정했다. 원문이 보존된 확정 무답변 최종 실패에 대해 exact ACK와 현재 입력 proof로 표식을 정산한다. 전면·종료/복귀·ACK 응답 유실·N+1 접수의 실제 UI 자동 시험을 통과했다. 범위·미검증 기기 gate와 최신 전달 상태는 [검증 과정 및 결과 §10](POCKETRISU-G1-8-VERIFICATION-RECORD-2026-10-11.md#10-수정-후-재재검증--2026-10-11)을 따른다. §9의 차단은 수정 전 관찰 기록이다.

이 문서에서 **L테스트**는 L1~L6 전체 절차이며, 사용자가 직접 조작하는 iPhone 시험은 **L5**다. 사용자 안내는 UI 기능·이번 변경·확인 방법으로 구성한다. 자동으로 확인 가능한 경로는 먼저 운영자가 실측하고, 사용자는 실제 기기의 화면·조작·복귀 결과를 확인한다.

### 목적과 완료 판정

새 검증은 실제 서버 실패 producer → durable intent → outbox → 앱 조회/표시/ACK → 같은 채팅의 실제 Send 버튼 → 다음 정상 답변 저장을 한 흐름으로 연결한다. 특히 서버 API 직접 호출로는 확인하지 못한 앱의 생성 상태·Send 재사용과, 실제 iPhone의 background 복귀 및 종료 후 재실행을 확인한다.

- 실패 알림만 직접 기록하는 대조군을 실제 실패 검증으로 계산하지 않는다.
- 원문 보존은 메시지 개수뿐 아니라 입력 문구·메시지 identity·해당 채팅을 함께 대조한다.
- 서버 ACK, 화면 enqueue, 사용자의 표시 관찰, 알림 닫기를 별도 증거로 기록한다.
- 앱 홈 이동·잠금 조작은 사용자 관찰이다. 관찰 채널 없이 iOS 내부 process suspension이나 jetsam 발생을 단정하지 않는다.
- 전면·background 복귀·종료 후 재실행은 각각 결과를 기록한다. 시험용 알림 한 건의 이전 성공으로 새 시험을 대신하지 않는다.
- 이 재검증의 기기 항목은 이번 G1.8 L5에 둔다. G1.10은 최종 조합에서 재사용/재확인할 후속 종합 gate이며, 이번 미실행 항목을 통과 처리하거나 단순 이월하는 근거가 아니다.

### 사용자 시험 전 준비

1. 실제 candidate HEAD/installer와 live 버전·서빙 bundle을 재확인한다. `.35`는 출발점이며 현재 기기 로드 상태를 문서만으로 단정하지 않는다.
2. 전용 시험 캐릭터 `G1.8 재검증`과 분리된 `전면 테스트`, `복귀 테스트`, `종료 테스트` 채팅을 준비한다. 기존 사용자 채팅·전역 모델/권한/재시도/fallback 설정과 원본 플러그인은 보존한다.
3. 외부 유료 모델을 호출하지 않는 제어 공급자로 실제 native 요청을 받는다. 첫 전송의 모든 설정된 retry/fallback attempt는 실패 응답, 다음 전송은 정상 합성 답변으로 제어한다. 재시도 횟수를 임의로 바꾸거나 모든 환경에서 main 2회를 기대하지 않고, 실제 적용된 정책으로 기대 횟수와 역할을 먼저 확정한다.
4. 시험 채팅의 실제 binding·최종 모델·custom endpoint·retry/fallback 전체 목적지와 접수 판정을 확인한다. 설치된 조합에서 input/main이 의도한 서버 경로로 진행되는지 실제 UI로 확인한다. 격리 fixture의 `plugins: []` 조건을 사용자 환경에 그대로 적용하지 않는다.
5. 실제 iPhone에서 접근 가능한 인증된 시험 화면/전송 경로와 서버→제어 공급자 연결을 먼저 검증한다. 허용된 정상 경로로 구성할 수 없다면 준비 미완료로 기록한다. admission·보안 제한을 완화하거나 숨은 client fallback으로 시험을 성립시키지 않는다.
6. 응답을 보류/해제할 제어를 준비해 전송 진행 표시가 나온 뒤 사용자가 홈 이동·잠금 또는 앱 종료를 할 수 있게 한다. 해당 조작 이후 실패를 완결하고, 복귀 전에 normal-chat API·작업 상태·알림을 확인한다. 시험 지연을 제품 성능 기준이나 OS suspension 증거로 사용하지 않는다.
7. 사용자에게 캐릭터/채팅의 실제 이름, Send 버튼 위치, 두 입력 문구, 예상 실패 알림과 정상 합성 답변을 안내한다. 준비 완료를 확인하기 전에는 사용자에게 전송을 요청하지 않는다. Lua 입력 창, API key 교체, endpoint 수동 입력 또는 이전 철회 카드 설치를 요구하지 않는다.

접수 판정은 준비의 첫 선행 확인이다. `server-input`이면 서버 입력부터, `client-prepared`이면 앱 입력 준비가 끝나 서버 인수가 완료된 이후부터 시험한다. 후자도 실제 서버 최종 실패 producer를 시험할 수 있지만 서버 입력 처리 검증으로 확대하지 않는다. 어느 경로든 서버 인수 완료에 대응하는 **실제 화면 신호**를 L2에서 먼저 확인해 B/C 안내의 출발점으로 사용한다. Send 직후의 일반 진행 표시만으로 서버 인수 완료를 추정하지 않는다.

전역 설정을 보존한 채 시험 공급자로 고정할 수 없거나 fallback이 실제 유료 모델로 빠지는 경우 준비를 중단한다. 전역 변경이 필요한 대안, 별도 격리 시험환경과 각 증거 범위를 구체적으로 제시해 필요한 사용자 결정을 받은 뒤 실행한다. 제어 공급자의 hold는 홈 이동/종료 조작 여유를 위한 시험 장치로 구성하고, 사용자에게 공급자 해제용 별도 조작을 시키지 않는다. 완료 후 서버 증거를 확인해 복귀 안내를 한다. 조회 요청의 부재는 사용자 조작과 함께 보조 근거로만 쓰며 네트워크 장애나 OS 상태의 확정 증거로 삼지 않는다.

L2에서 foreground의 기존 오류 표시와 서버 토스트, host OFF의 플러그인 생략 안내를 각각 실측해 **예상 문구·위치·횟수 목록**을 L5 안내에 넣는다. 최종 실패 알림 한 건의 중복 억제와 다른 출처의 정상 안내를 구분하며, 전체 토스트 수를 임의로 한 건으로 제한하지 않는다.

제어 공급자 설치, 시험 데이터 생성, live 변경 및 실제 시험은 후속 실행 작업이다. 이번 계획 수립으로 수행됐다고 기록하지 않는다. 기존 production host OFF를 유지하며, 유료 요청·생성 취소·사용자 데이터/legacy journal 삭제·live process 강제 중단은 시험 수단으로 사용하지 않는다.

### L테스트 연결

| 단계 | 운영자가 수행할 검증 | 완료 증거 |
|---|---|---|
| L1 자동 | native probe의 fixture별 analysis/main 역할·호출 수를 assertion으로 고정한다. 원문 문구/identity를 확인하고, 새 context에서 v3 네 종류 모두의 재표시 부재와 알림 로그 증가 없음을 검사한다. 실제 UI 실패/다음 Send 시험을 보강한 변경의 syntax/type/lint·관련 suite·PocketRisu frontend/BG build/load를 실행한다. | 실행한 source/fixture와 결과, 기존 검증 재사용 범위. NAI 종료 앱의 build나 무관한 endpoint를 PocketRisu gate로 사용하지 않는다. |
| L2 자동 | 실제 브라우저 Send → 제어 공급자 실패 → 앱 부재 → 실패 완료 → 복귀 알림 → 같은 채팅의 UI Send 정상 답변을 시험한다. 복귀 전에 normal-chat API로 원문/답변 부재를 확인한다. warm return과 새 context를 구분하고 실제 capability·build fence·ACK 및 outbox 장애 재시도의 보존을 확인한다. | 실패 producer/intent/outbox identity 연결, 설정에 맞는 실패 attempt 수, 다음 정상 main 1회·답변 1개, 정확한 입력 2개, 추가 모델/효과 replay 없음. UI 조작을 API 직접 POST로 대신하지 않는다. |
| L3 자동 | 생성 caller와 시험 transport 경계, test-only branch의 격리, 잘못된 oracle·fixture 전용 성공·assertion 약화·새 skip·임의 cap 변경을 점검한다. | 구조 검수 파일과 실제 확인 근거. 결과에 맞춰 기대값을 낮추지 않는다. |
| L4 자동 | producer부터 UI Send/busy/ACK까지 leaf를 열거하고 코드·측정으로 연결한다. foreground 기존 오류 표시와 서버 토스트의 관계도 관찰하되 두 표시의 공존만으로 결함을 단정하지 않는다. discovery → anchor → triage 뒤 최종 Opus 자문을 수행한다. | 남은 위험/미확인 경로와 기기 준비 상태. 실행 전 통과를 예상하지 않는다. |
| L5 사용자 | 아래 A/B/C를 실제 iPhone에서 각각 수행한다. 운영자는 해당 operation의 서버 상태·호출 수·원문/답변·알림/ACK를 읽기 전용으로 대조한다. | 항목별 사용자 관찰 + 동일 작업의 서버 증거. 하나의 총괄 OK로 세 경로를 대체하지 않는다. |
| L6 자동 | 사용자 결과를 검증 과정/qualification 문서와 JOURNAL에 반영하고 이번 기기 gate의 완료/미완료를 명시한다. 관련 문서·버전·sweep·commit/push와 필요 시 readback을 정리한다. | G1.10에 구체 결과/미해결 항목 연결. G1.9·실제 공급자·전체 조합이 남아 있으므로 이번 L5 성공만으로 stable/tag/host ON을 진행하지 않는다. |

### L5 — 사용자가 수행할 조작

대상 UI 기능은 채팅의 **보내기(Send) 버튼**, 서버 실패 알림, 앱 복귀 시 채팅 복원이다. 이번 확인점은 실패 사실의 보관/전달, 원문 보존, 중복 알림 억제 및 실패 뒤 같은 화면에서 다시 보낼 수 있는지다. 아래 절차는 운영자가 준비 완료를 알린 뒤 수행한다.

| UI 기능 / 시험 | 이번 변경·확인 대상 | 손가락 조작과 확인 방법 |
|---|---|---|
| A. `전면 테스트` — 실패 후 보내기 재사용 | 실패 알림과 원문을 보존하고 Send가 다시 사용 가능한지 확인 | 시험 캐릭터의 `전면 테스트` 채팅에서 `G1.8 실패 확인`을 입력하고 Send를 한 번 누른다. 화면에 머물며 실패 완료 후 해당 캐릭터/채팅의 알림과 원문 1개, 답변 없음, Send 활성 상태를 확인한다. 알림을 닫고 같은 채팅에서 `G1.8 정상 확인`을 한 번 보낸다. 두 원문과 정상 합성 답변 1개가 남고 실패 알림이 추가되지 않는지 확인한다. 기존 오류창과 서버 토스트가 둘 다 보이면 각각 위치·문구·횟수를 보고한다. |
| B. `복귀 테스트` — 홈 이동·잠금 후 복귀 | 앱이 background에 있는 동안 실패한 작업의 복귀 전달과 다음 Send 확인 | `복귀 테스트` 채팅에서 실패 문구를 한 번 보낸다. 전송 진행 표시가 나타나면 홈으로 나가 화면을 잠근다. 운영자의 서버 실패 완료 확인 안내 후 PocketRisu로 복귀한다. 해당 채팅의 원문 1개·답변 없음과 실패 알림을 확인하고 닫는다. 같은 채팅에서 정상 문구를 한 번 보내 두 원문·답변 1개와 Send 정상 동작을 확인한다. OS가 실제 process를 suspend했는지는 이 조작만으로 판정하지 않는다. |
| C. `종료 테스트` — 앱 종료·재실행 | 앱 없이 실패가 완결되고 재실행 때 복구/알림/Send가 이어지는지 확인 | `종료 테스트` 채팅에서 실패 문구를 한 번 보낸다. 전송 진행 표시 후 iPhone 앱 전환기를 열고 PocketRisu를 위로 쓸어 종료한다. 서버 실패 완료 안내 후 다시 실행해 해당 채팅을 연다. 원문 1개·답변 없음과 실패 알림을 확인하고 닫은 뒤 정상 문구를 한 번 보낸다. 두 원문·답변 1개를 확인한다. 다시 앱을 종료·재실행해 같은 실패 알림이 재표시되지 않고 채팅이 유지되는지 확인한다. |

B/C의 ‘전송 진행 표시’는 준비 단계에서 확정한 서버 인수 완료 화면 신호를 의미한다. 아직 그 신호를 확정하지 않았으므로 이 표만으로 현재 앱에서 시험을 시작하지 않는다.

추가 범위 D — **생성 중 수정 미반영 알림**: 성공 응답을 보류하는 별도 시험 채팅에서, 서버가 프롬프트 조립을 마친 뒤 앞서 저장된 시험 메시지를 편집·저장하고 복귀한다. 편집 내용과 답변 1개가 모두 남으며 이번 생성에 수정이 반영되지 않았다는 알림이 나타나는지 확인한다. 조립 완료 경계와 실제 편집 버튼/저장 방법은 자동 시험으로 먼저 확인한다. A/B/C의 실패 복구와 별도 결과로 기록하며 기존 G1.3 기기 gate와 연결한다. 이번 기본 실패 재검증을 이유로 D를 통과 처리하거나 G1.8 모든 알림 유형의 기기 검증을 완료했다고 주장하지 않는다.

사용자 결과는 다음 형식으로 받는다. operation ID, ACK, 공급자 호출 수, DB 조회 또는 디버그 도구 조작은 운영자 책임이다.

```text
A / B / C:
- 실패 알림: 표시 여부, 캐릭터/채팅 위치, 같은 알림의 반복 여부
- 원문/답변: 실패 원문 보존 여부, 실패 단계의 답변 없음 여부
- 다음 Send: 버튼 사용 가능 여부, 정상 답변 1개 여부
- 재실행: C에서 실패 알림 재표시 여부와 채팅 보존 여부
- 예상 밖 화면: 입력 창, 오류 문구, 멈춘 단계가 있으면 그대로 보고
```

의도하지 않은 입력 창, 서버 접수 거절 또는 다른 모델 실행이 나타나면 해당 시험은 준비/경로 실패로 분류한다. 조작을 반복해 통과시키지 않고 operation 증거를 확인한다. 기존 정상 사용의 회귀가 확인되면 저장소의 회귀 보고·승인 절차를 적용한다. 서버에서 확인 가능한 장애를 사용자에게 디버깅하게 하지 않는다.

### 남는 범위

제어 공급자 성공은 실제 유료 공급자·원본 MARP의 최종 ON 조합 성공을 뜻하지 않는다. process-loss/새 journal retirement/absent-target은 이번 UI 시험이 대신하지 않으며 같은 source의 기존 자동 증거와 변경 영향 검증을 연결한다. 실제 공급자·G1.9 스트림·전체 G1 조합과 stable release는 G1.10의 별도 gate로 유지한다.
