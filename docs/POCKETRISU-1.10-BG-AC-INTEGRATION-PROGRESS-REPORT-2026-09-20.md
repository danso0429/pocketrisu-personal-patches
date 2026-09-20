# PocketRisu 1.10 BG 서버 채팅 저장 × Archive Center 통합 구현 경과 보고서

- 기준일: 2026-09-20 KST
- 계획 정본: `POCKETRISU-1.10-BG-PRESERVE-SERVER-CHAT-SAVE-ARCHIVE-CENTER-PLAN.md` r2
- 계획 문서: 945행
- 계획 문서 SHA-256: `ef71282428589d3833a51c68130398bbdd8e6677d6b7bb00c4bc505981711ca6`
- PocketRisu 대상: 공식 v1.10.0 (`98e968339d1b3f91b9dac85bb3f2ebb5f90f9d14`)
- Archive Center 기준: v4.3.1 (`026dcbf3b45adcf69b254673d439b24e943115b3`)
- 개인 패처 기준: v0.2.1 (`3e69349d3b0ca3bf8011b597e080880238e5fa0a`)
- 후속 연결부 hardening: `3315e4d`, 외부 검수 R1~R5 반영
- 보고 범위: 통합 계획, C0 기반 실험, C1~C4 구현 경과, R1~R5 연결부 수정, 검증, 배포·보존 상태, 미완료 게이트

## 1. 요약

이 프로젝트의 목표는 브라우저 프로세스가 종료되어도 PocketRisu 서버가 생성, 후처리, 정상 채팅 저장, Archive Center 연계를 계속 수행하고, 이후 새 브라우저가 일반 채팅 조회만으로 동일한 결과와 소유권 상태를 복원하도록 만드는 것이다.

현재 상태는 다음과 같다.

| 단계 | 현재 상태 | 제품 사용 가능 여부 |
| --- | --- | --- |
| C0 | 기반 실험과 store primitive 기록 완료 | 원래 P1 5건·P2 2건의 제품 계약은 미종료 |
| C1 | 서버 채팅/effect commit primitive 구현 | original-chat/AC-disabled 범위의 내부 primitive |
| C2 | BG 최종 결과의 opt-in 서버 commit 경로 구현 | 현행 클라이언트는 opt-in하지 않음 |
| C3 | projection, hydration, pre-canonical input, 설정, 실행 의존성, 인과 복구, 소유권 fence 구현 | capability 0, 자동 drain·일반 client UI 없음 |
| C4 | AC process-memory execution-context owner와 effective resolver 구현 | 외부 DTO·route·HostPrepare/provider caller 없음 |
| C5 | 미구현 | 사용 불가 |
| C6 | 미구현 | 사용 불가 |
| C7 | 미구현 | live qualification·release 없음 |

C0의 환경·characterization·store primitive, C1의 atomic primitive, C2의 internal opt-in 연결은 각각 계획된 구현 slice를 마쳤다. 이는 원래 일곱 제품 계약의 종료를 뜻하지 않는다. C3~C4는 부분 구현이고 C5~C7은 미착수이며, 새 통합 기능은 아직 제품 admission gate 이전이다. PocketRisu capability는 `inputCommandVersion: 0`이고, Archive Center의 새 context도 production route나 provider가 사용하지 않는다.

이번 구현은 다음 두 축을 병렬로 진행했다.

1. PocketRisu 축: 입력 접수, 생성, 채팅/effect commit, owner projection, client hydration.
2. Archive Center 축: session claim, host-change ordering, durable prepare registry, 요청별 device/backend execution context.

두 축은 C6에서 하나의 lifecycle로 결합하고 C7에서만 실제 Ubuntu·브라우저 종료·iPhone 시나리오를 qualification하도록 설계되어 있다.

## 2. 계획의 핵심 요구사항

### 2.1 P1 계약

| ID | 요구사항 | 핵심 안전 조건 |
| --- | --- | --- |
| P1-1 | 실행권 | Go binding 재검증, 원자적 claim, claim epoch fence, 모든 terminal settle |
| P1-2 | 변경 전달 순서 | Node durable intent, hostChangeSeq, Go ingestedSeq/safeSeq, stale worker 차단 |
| P1-3 | prepare 관측 | canonical input receipt와 실제 assembled payload를 분리 관측하고 의미를 검증 |
| P1-4 | prepare 응답 유실 | 유료 실행 전 durable prepare key/fingerprint, 상태 조회, 명시적 skip |
| P1-5 | 대기 입력 | canonical 저장 전 command admission, queue 순번, predecessor lineage, 입력 1회 연결 |

### 2.2 P2 계약

| ID | 요구사항 | 핵심 안전 조건 |
| --- | --- | --- |
| P2-1 | 출력 변환 | provider 원문부터 canonical/AC 저장 후보까지 단계별 parity, 요청별 prefill seed |
| P2-2 | 소유권 발견 | 일반 채팅과 같은 revision의 message/source owner projection, 결과 TTL과 owner 수명 분리 |

### 2.3 최종 성공 조건

최종 완료는 다음 조건을 모두 만족해야 한다.

1. 서버가 작업을 인수한 뒤 브라우저 프로세스를 종료해도 최종 본문이 정상 채팅 저장소에 기록된다.
2. 브라우저를 다시 열기 전에 서버 API 또는 저장 자료로 본문과 revision을 확인한다.
3. 로컬 캐시가 없는 브라우저가 일반 세션을 열어 같은 답변을 확인한다.
4. AC 활성·지원 조합에서는 실제 주 모델 payload의 기억 주입과 실제 저장 본문에 대한 AC 완료를 확인한다.
5. prepare/complete/result ACK 유실과 재조회가 본문, globals, statics, AC raw/derived 데이터를 중복 반영하지 않는다.
6. AC 장애 시 정상 완료와 구분되는 명시적 skip을 남기고, 늦은 ready·complete·backfill을 차단한다.

### 2.4 범위 밖

다음은 첫 통합의 보장 범위가 아니다.

- PocketRisu 서버 프로세스 자체가 생성 중 종료된 경우의 임의 지점 실행 재개
- 범용 외부 플러그인 서버 실행기
- 별도 채팅 데이터베이스
- 상주 브라우저
- 별도 복구 전용 화면
- 검증되지 않은 TTS/emotion/imggen/PDF/외부 플러그인 조합의 자동 서버 완주

## 3. 소유권 및 목표 구조

| 책임 | 소유자 | 현재 구현 상태 |
| --- | --- | --- |
| 입력 command admission·생성·취소·채팅/effect commit | PocketRisu Node | C1~C3 기반 구현 |
| 정상 채팅 본문·metadata·fullChatStore·journal | PocketRisu 기존 저장 owner | C1/C2 연결 완료 |
| message/source owner projection·client hydration | PocketRisu Node/client | C3 기반 구현, product activation 전 |
| route binding·session claim·claim epoch | AC Go/MariaDB | C0-B store primitive 구현 |
| host-change ordering·source invalidation | AC Go/MariaDB | C0-C store primitive 구현 |
| prepare key/start/ready/unknown/skip | AC Go/MariaDB | C0-D store primitive 구현 |
| device/backend immutable execution context | AC Go process memory | C4 owner와 resolver 구현 |
| host 설정/관측 export·payload 적용·출력 변환·HUD | AC JavaScript + PocketRisu adapter | C5 미구현 |
| 양쪽 lifecycle 통합·reconciliation·retention | Node + AC Go | C6 미구현 |

PocketRisu와 Archive Center는 데이터베이스를 공유하지 않는다. 분산 transaction을 가정하지 않으며, 각 시스템이 자신의 durable receipt와 상태 전이를 소유한다. 통합은 operation, claim, binding, source sequence, prepare key, context ID, commit receipt를 연결하는 방식으로 이루어진다.

## 4. 사용 및 실행 환경

### 4.1 현재 서버 환경

2026-09-20 readback 기준 환경은 다음과 같다.

| 항목 | 관찰값 |
| --- | --- |
| 호스팅 | Oracle Cloud ARM Ampere A1 계열 |
| OS | Ubuntu 24.04.4 LTS |
| Kernel | Linux 6.17.0-1020-oracle, aarch64 |
| CPU | Neoverse-N1, 2 vCPU, 1 thread/core |
| RAM | 11 GiB, readback 시 available 약 7.3 GiB |
| Root filesystem | 96 GiB 중 61 GiB 사용, 35 GiB 여유 |
| Node.js | v25.9.0 |
| npm | 11.12.1 |
| pnpm | 10.33.0 |
| Python | 3.12.3 |
| Go 검증 toolchain | go1.26.6 linux/arm64, 작업용 고정 binary 사용; 현재 기본 shell PATH에는 없음 |
| MariaDB client/server 계열 | 10.11.14 |

개인 네트워크 주소, tailnet 식별자, 장치 식별자와 사용자 데이터 경로는 이 보고서에 포함하지 않는다.

### 4.2 live PocketRisu

| 항목 | 현재 readback |
| --- | --- |
| PocketRisu | 1.10.0 |
| 프로세스 관리 | PM2 `risuai-nodeonly` |
| 프로세스 상태 | online |
| restart count | 0 |
| active request | 0 |
| patch intent | format 2, preset `all` |
| resolved packs | 40 |
| managed files | 340 |
| live `lazy-chat-bg-adapter` | 0.2.1 |
| live `lazy-chat-sync` | 0.3.0 |

live PocketRisu는 현재 pristine이 아니라 기존 all-preset patch graph가 적용된 상태이다. 그러나 이번 통합 후보의 `lazy-chat-bg-adapter` 0.7.0과 C1~C3 신규 owner 파일은 live에 없다. 따라서 아래 구현 결과는 live 배포 상태가 아니다.

### 4.3 PocketRisu 통합 후보

| 항목 | C3 connection-hardening checkpoint |
| --- | --- |
| implementation commit | `3315e4d` |
| AC-off HTTP boundary test | `a286b96` |
| adapter | `lazy-chat-bg-adapter` 0.7.0 |
| capability | input 0, diagnostic foundation 4 |
| complete graph | 40 packs, 1,003 units, 354 managed paths, 13 ordered collisions |
| installer | 8,281,994 bytes, mode 0755 |
| installer SHA-256 | `146a892fde7b8a3bb9fe01926093d3a9e275660aaf00aae5e24d57dbc03b47e6` |
| disposable target final state | clean, empty custom intent |

### 4.4 격리 Archive Center 설치

통합 작업은 live PocketRisu와 분리된 비-systemd Archive Center baseline을 사용했다.

| 항목 | 검증값 |
| --- | --- |
| Archive Center | v4.3.1 |
| release asset | Linux arm64, checksum 및 package 내부 파일 검증 완료 |
| AC backend | loopback-only alternate port |
| MariaDB | 10.11.14, 별도 disposable data/port |
| ChromaDB | 1.5.9, private Python environment, 별도 loopback port |
| 마지막 controlled-run readiness | ready/store/vector/reference-vector true, degraded false |
| `/version` metadata | version 4.3.1, commit/go_version은 package 응답에서 unknown |
| service 등록 | systemd 미등록, 격리 실행 세션 사용 |
| PocketRisu plugin 연결 | C5 전이므로 연결하지 않음 |
| 2026-09-20 현재 listener | Go 28192, MariaDB 33192, ChromaDB 8192 모두 중지 상태 |

격리 포트는 Go 28192, MariaDB 33192, ChromaDB 8192이며 실행할 때 모두 loopback에만 바인딩한다. 마지막 controlled start/restart에서 readiness와 동일 data 복원을 확인했으며, 보고서 최종 readback 시에는 세 listener가 모두 중지되어 있었다. 패키지 설치 중 자동 활성화된 distro 기본 MariaDB 서비스는 데이터 삭제 없이 중지·비활성화했다.

## 5. 구현 및 검증 방법

전체 작업은 다음 원칙을 유지했다.

1. 고정 source revision과 exact PocketRisu 1.10 target을 사용했다.
2. characterization test로 현재 구조의 실패를 먼저 재현한 뒤 production owner를 추가했다.
3. chat 저장, operation state, owner, effect, AC coordination의 authority를 분리했다.
4. 비동기 encode/prepare와 동기 SQLite transaction write를 분리했다.
5. 변경별 작은 commit과 별도 validation 문서를 유지했다.
6. patcher source test, focused target test, full frontend/server/compatibility, Svelte diagnostics, production build, BG bundle load, complete graph apply/re-plan/revert를 구분했다.
7. AC는 focused test, package test, 전체 Go test, race detector, `go vet`, ARM64 build, disposable MariaDB integration을 구분했다.
8. synthetic fixture, isolated runtime, live readback, 실제 device L3를 같은 증거로 취급하지 않았다.
9. capability가 닫힌 기반 코드를 제품 지원으로 승격하지 않았다.
10. live apply, user-data mutation, paid provider call, stable tag/release는 수행하지 않았다.

## 6. C0 상세 경과

### 6.1 C0-ENV: 격리 AC 4.3.1 실행 기반

목적은 통합 코드를 넣기 전에 unmodified AC 4.3.1 package가 Ubuntu ARM 환경에서 MariaDB·ChromaDB와 함께 재현 가능하게 실행되는지 확인하는 것이었다.

수행 내용:

- GitHub Latest 4.3.1 Linux arm64 asset과 checksum asset 검증
- package 내부 `SHA256SUMS.txt` 전수 검증
- custom non-systemd install root와 별도 data root 사용
- MariaDB·ChromaDB·Go backend의 alternate loopback port 사용
- schema bootstrap, direct SQL table count, `CHECK TABLE` 검증
- controlled stop 후 동일 data restart
- `/version`, `/ready`, Chroma heartbeat 재확인

관찰 결과:

- 최초 schema: 13 migrations, 142/142 statements, 81 tables
- store/vector/reference-vector ready, degraded false
- stop 시 세 listener 종료, restart 후 같은 data와 readiness 복원
- AC JS는 live PocketRisu에 설치하지 않음

### 6.2 C0-A: 기존 AC prepare/complete 계약의 의미 한계

기존 v1~v3 계약을 서버 host에 그대로 사용할 수 있는지 test-only probe로 확인했다.

관찰 결과:

- 정직한 `pocketrisu_canonical_chat` / `server_input_committed` prepare provenance는 현재 validator에서 거부되었다.
- `source_acceptance_observation.v1`은 typed server host, operation, commit receipt를 소유하지 않는다.
- unknown JSON 필드를 trusted-looking 값에서 무관한 값으로 바꾸어도 같은 acceptance/revision이 나왔다.

결론:

- 기존 browser hook 사실을 서버 commit 사실로 위장해서는 안 된다.
- prepare host variant와 complete source acceptance v4가 필요하다.
- C0-A는 새 계약 필요성을 입증했지만 새 계약 자체는 구현하지 않았다.

주요 AC commit: `a932234`.

### 6.3 C0-B: durable session execution claim

목적은 하나의 canonical AC session에 동시에 하나의 execution owner만 존재하도록 만드는 것이었다.

구현:

- migration 014
- `HostSessionExecutionStore`
- route binding epoch
- acquire/status/settle
- canonical-session 단일 active slot
- operation/end-event immutable terminal outcome
- claim epoch CAS
- MariaDB 1205/1213 bounded retry

주요 안전성:

- 서로 다른 두 host binding이 같은 canonical session을 가리켜도 one acquired/one wait
- identical active acquire는 같은 claim 재사용
- route revision 변경 시 old claim은 `binding_changed`
- late settle은 새로운 owner를 해제하지 않음
- terminal insert와 exact slot release는 같은 transaction
- ten admitted terminal reasons 뒤 새 claim 가능

실제 MariaDB 첫 경쟁 실행에서 deadlock 1213을 재현했고, 동일 immutable transaction의 3회 bounded retry로 수정했다.

주요 commit: `2b16b56`, `3fad4ae`, `486e599`.

### 6.4 C0-C: ordered host-change stream과 source safety

목적은 edit/delete/reroll/branch가 AC의 오래된 raw/derived memory 및 worker 결과보다 뒤처지지 않도록 durable 순서를 만드는 것이었다.

구현:

- migration 015
- binding별 `host_change_streams`와 immutable events
- `ingestedSeq`와 `safeSeq` 분리
- sequence gap과 exact replay
- source generation invalidation
- leased critic/vector worker stale rejection
- durable vector-delete intent
- stale raw chat/aggregate memory read exclusion
- active claim invalidated/deleted outcome

핵심 판정:

- `ingestedSeq`는 연속 사건 수용 경계이고 `safeSeq`는 모든 read exclusion/fence가 durable하게 반영된 경계이다.
- content mutation은 source identity가 실제로 확인되지 않으면 pending을 유지한다.
- audit 저장이나 exclusion write가 실패하면 transaction 전체가 rollback되고 safe ACK를 내지 않는다.
- vector 삭제가 늦더라도 source generation fence로 stale vector selection/write를 차단한다.

주요 commit: `17fcdd1`, `d063b68`, `6866ccd`, `701f1ad`.

### 6.5 C0-D: durable prepare registry

목적은 prepare ready 응답 유실이나 AC restart가 같은 유료 준비를 재실행하지 않도록 하는 것이었다.

구현:

- migration 016
- `HostPrepareRegistryStore`
- stable prepare key와 semantic fingerprint
- register/start/ready/failed-known/outcome-unknown/skip/status
- one registered→running CAS만 `start_authorized=true`
- 1 MiB bounded ready JSON과 hash
- exact route/claim/watermark fence
- skip tombstone과 exact claim release

핵심 판정:

- running replay는 유료 호출 권한이 아니다.
- running restart는 명시적 `outcome_unknown`이며 자동 재실행하지 않는다.
- ready response는 store reconnect 후 같은 JSON/hash로 회수된다.
- ready/timeout race에서 authoritative skip이 승리하면 늦은 ready는 publish되지 않는다.
- source invalidation은 ready/running prepare를 먼저 clear/fence한 뒤 claim을 해제한다.

주요 commit: `31e3651`, `d15acbd`, `043b587`, `7decdbb`.

### 6.6 C0-E: Node storage와 pre-canonical input characterization

test-only failure injection으로 기존 Node 저장 구조를 조사했다.

발견:

- async `chatWriteJournal.stage()`를 synchronous SQLite transaction callback에 넣으면 `await` 이후 KV write가 transaction 밖으로 탈출한다.
- chat payload만 durable하고 intent/owner/effect receipt가 없는 split state가 가능하다.
- 새 chat payload가 복구되어도 metadata stub이 없으면 일반 목록에서 발견되지 않는다.
- 기존 BG는 브라우저가 user message를 삽입·저장한 뒤 operation을 생성하므로 pre-canonical admission이 아니다.

결론:

- C1은 async prepare/encode → synchronous durable write → post-commit publish 구조가 필요하다.
- C3는 input script/append/autosave보다 앞선 command admission이 필요하다.

주요 commit: `1fc03d7`.

### 6.7 C0-F: output stage와 owner projection characterization

test-only exact-1.10 unit probe로 현재 BG 결과와 client merge를 조사했다.

발견:

- server result는 provider→native→AC→prefill→replacement→canonical 단계 trace를 잃는다.
- client가 merge→strict save→ACK를 계속 소유한다.
- delivery marker는 operation/chat 수준이며 message/source-generation owner가 아니다.
- operation ID를 모르는 새 브라우저는 result/local marker 정리 뒤 owner를 찾을 수 없다.
- missing lookup을 authoritative empty owner set으로 해석할 수 없다.

결론:

- C2에는 versioned server commit이 필요하다.
- C5에는 순수 AC output transform 공유가 필요하다.
- C6에는 chat revision과 함께 사는 message/source owner projection이 필요하다.

주요 commit: `8cd6a47`.

## 7. C1: 원자적 서버 채팅/effect commit

### 7.1 구현 목적

서버 생성 결과를 browser merge 없이 정상 chat storage에 commit하고, process interruption이나 retry에서도 model/provider를 다시 실행하지 않는 저장 primitive를 만드는 것이었다.

### 7.2 구현 방식

- journal을 async prepare, synchronous transaction write, post-commit publication으로 분리
- `bg_server_chat_commit.v1`
- chat payload와 metadata stub
- input/commit receipt
- message/source owner
- ordered host intent
- per-key global outcome
- exact statics applied delta
- operation `chat-committed` state
- bounded immutable recovery envelope

global effect를 하나의 성공/실패 상태로 접지 않고 key별 outcome으로 보존했다. statics는 blind increment가 아니라 실제 applied delta를 receipt에 기록했다.

### 7.3 실패 주입

- WAL-mode SQLite의 9개 synchronous write 각각 실패
- revision/fingerprint/cancellation conflict
- optional metadata key presence
- post-commit publication failure와 replay recovery
- depth/record-size guard

### 7.4 결과

C1 primitive 자체는 완료되었으나 최초 C1 checkpoint에서는 production caller가 0이었다. C2가 이후 versioned caller를 연결했다.

주요 commit: `81b2236`, `0e93888`, `268ec7a`.

## 8. C2: BG 최종 결과의 opt-in 서버 commit

### 8.1 구현

- `serverChatCommitVersion=1` 협상
- canonical pre-run base revision capture
- server settings digest
- operation-state negotiation persistence
- final/partial result를 C1 owner로 전달
- normal chat metadata/globals/statics/fullChatStore publication
- status/cancel/result cleanup에서 동일 commit receipt 노출

### 8.2 recovery 및 hardening

- operation-specific journal과 transaction commit sequence
- 여러 unflushed commit의 creation-order recovery
- applied envelope replay 시 최신 chat rollback 방지
- database replacement 시 연결된 operation state/result cleanup
- restored canonical ledger의 max sequence 이후 재개
- queued retry의 protocol/base mismatch를 provider scheduling 전에 거부

### 8.3 결과와 한계

브라우저 없이 실제 commit owner가 normal chat, metadata, statics, operation state와 result receipt를 만들 수 있음을 고정 fixture로 검증했다. 그러나 현행 client는 C2 flag를 보내지 않으므로 기존 browser merge/save/ACK 경로가 유지된다.

주요 commit: `f59ceb1`, `d4928e3`, `d1c97df`, `23d44cf`.

## 9. C3: projection, hydration, pre-canonical input

### 9.1 message/source owner projection

구현:

- `serverChatExecutionState`
- authenticated char/chat/revision projection
- message fingerprint 기반 owner
- exact operation receipt 검증
- one-newer-revision descendant hydration
- server-owned root state의 full/patch writer 보존

client는 server commit receipt가 유효하면 legacy result merge/save effect를 반복하지 않고 normal server chat을 읽어 baseline을 갱신한다.

주요 commit: `99d681b`, `d10c62f`, `87dcf54`.

### 9.2 pre-canonical input owner

구현:

- `bg_server_input_command.v1`
- operation/input/message identity
- canonical submitted base revision
- admission sequence와 predecessor
- transform `not_run/running/completed/unknown`
- input receipt와 journal
- global intent/outcome
- exact replay와 cross-operation input identity conflict
- interrupted transform의 unknown fence

입력 trigger와 `editinput` script 결과는 한 번만 attach하고, provider 전후 base/global race를 transaction 및 publication에서 다시 검사한다.

주요 commit: `d2012d8`, `5351932`, `a318c8c`, `47a016b`.

### 9.3 hydration 및 revision domain hardening

- old receipt가 authoritative descendant를 hydrate할 수 있도록 하되 exact owner를 요구
- server encoded-byte SHA와 client semantic edit fingerprint를 다른 revision domain으로 분리
- fetch 완료 뒤 local slot CAS 성공 시에만 NodeStorage sync baseline 전진
- incomplete protocol은 capability 0으로 유지

주요 commit: `0203ea6`, `db72ec0`.

### 9.4 same-process immutable settings context

문제:

- client가 임의 settings ref를 지정할 수 있었다.
- admission 이후 current DB가 바뀌면 동일 operation이 다른 설정으로 실행될 수 있었다.

구현:

- admission 시 exact stripped DB를 encoded Buffer로 capture
- secret-bearing bytes와 integrity hash는 process-memory map에만 보존
- durable command에는 server-derived volatile ref, mode, byte count, random content-independent digest만 기록
- exact retry는 최초 bytes 재사용
- restart로 context가 사라지면 `settings_context_unavailable`
- current dbCache fallback 금지
- canonical full chat을 재조회하여 client `currentChat` spoof 차단
- 256 MiB/context, 2 contexts/512 MiB logical cap

주요 commit: `4ca430a`, `1f44f0a`, `9af40da`, `dc6e20c`.

### 9.5 N+1 predecessor foundation

구현:

- 한 채팅의 nonterminal N과 N+1 두 command 허용
- 세 번째 command는 `chat_input_queue_full`
- exact previous operation과 `admissionSeq - 1` 검증
- N active 시 `predecessor_active`
- completed result가 아직 canonical이 아니면 `predecessor_publication_pending`
- completed result revision이 canonical이면 effective base 전진
- failed/cancelled after input attach는 input-only revision 유지
- cancel-before-attach는 submitted base 유지
- unknown/blocked/non-adjacent predecessor는 fail-closed
- waiting route는 provider scheduling 전 HTTP 202

audit에서 predecessor sequence를 단순히 더 작은 값으로만 검사하던 결함을 찾아 exact adjacent sequence로 수정했다. 또 모든 head input에 current dynamic roots를 overlay하던 결함과 다른 chat metadata를 덮던 범위를 제거했다.

현재 limitation:

- automatic server drain 없음
- current client가 input/server-commit flag를 보내지 않음
- pending composer/chat-open UI 없음
- current globals/statics가 predecessor effect receipt에서만 왔다는 증명 없음
- record v4 activation 전 v3 zero-legacy 또는 명시 migration 판정 필요
- non-input C2 opt-in의 result/state TTL 뒤 최소 owner tombstone 미정

주요 commit: `11460f3`, `bb39b36`, installer `7c5b7c1`.

### 9.6 외부 검수 R1~R5 연결부 hardening

구현 commit `3315e4d`는 다음 연결 결함을 수정했다.

- admission 인접 순번과 실제 실행 의존성을 분리한 record v4
- waiting command 취소 뒤 가장 최근의 미해소 실행 의존성 재검증
- 완료 후 현재 채팅 편집·답변 삭제를 새 head와 기존 waiting conflict로 구분
- input→response를 교차 반복하는 bounded startup reconciliation
- attached input 재게시를 process-memory settings 검사보다 먼저 수행
- transaction 내부 durable terminal write와 commit 뒤 settings release 분리
- canonical response publication marker와 recovery 시 marker 보강
- admission-time server ownership을 result/status에 보존
- foreground/boot에서 order ACK와 legacy client save 전에 server-owned failure 차단
- 실제 SQLite route 결과와 authoritative projection을 client hydration helper에 연결한 AC-off fixture
- HTTP start ACK 뒤 fixed provider gate를 유지하고 client 추가 동작 없이 server provider 1회·commit 1회·ACK 0으로 result/projection/chat/hydration을 완성한 boundary fixture

상세한 재현, 코드 경계, runtime audit와 잔여 surface는
`docs/POCKETRISU-1.10-BG-AC-C3-CONNECTION-HARDENING-VALIDATION.md`에 있다.

### 9.7 최종 C3 검증

| Gate | 관찰값 |
| --- | --- |
| patcher source tests | 52/52 files |
| focused frontend | 2 files, 39/39 tests |
| focused owner/route | 3 files, 50/50 tests |
| frontend | 153 files, 1,743/1,743 tests |
| server | 28 files, 302 passed, 12 skipped |
| compatibility | 10 passed files, 1 skipped file; 74 passed, 5 skipped tests |
| Svelte | 0 errors, 0 warnings |
| production build | 7,941 modules |
| BG bundle | 8,864,777 bytes, `sendChat`/`runTrigger`/`processScript` load |
| patch graph | 40 packs, 1,003 units, 354 paths, 13 collisions |
| re-plan | 0 changed files |
| exact revert | 354-path existence/bytes/mode mismatch 0 |
| HTTP smoke | prior N+1 checkpoint에서 root 200·미인증 capability/projection/start 401·graceful SIGINT; `3315e4d` 뒤 process smoke는 미재실행 |

## 10. C4: Archive Center execution context

### 10.1 process-memory capture owner

commit `694c6e8`은 다음 material을 하나의 owner-bound context로 고정한다.

- host instance
- stable character/chat
- binding epoch
- operation ID
- claim epoch
- current `/prepare-turn` builder의 21개 explicit setting
- narrative support/publisher/hierarchy setting
- main/critic/embedding/source-search device setting
- backend `RuntimeConfig`
- `memory-preprocessing.json`
- captured embedding config/env fallback

특성:

- exact identity + exact full material은 같은 random context ID 재사용
- 같은 identity + 다른 material은 fingerprint conflict
- load는 context ID와 complete owner identity를 모두 요구
- full secret material은 process-memory JSON bytes로만 보존
- public digest는 API key, endpoint value, extra JSON, shared/role prompt 값 및 그 hash를 포함하지 않음
- public digest는 비민감 설정과 private-value configured-state를 반영
- caller가 원본 map/pointer를 변경해도 context material은 변하지 않음
- 새 process는 기존 context ID를 찾지 못하고 `execution_context_unavailable`
- 1 MiB/context, 64 entries, 16 MiB aggregate cap; eviction 없음

### 10.2 effective settings resolver

local commit `9e23861`은 captured material만 사용하여 다음 최종 config를 만든다.

- main
- supervisor
- critic
- embedding
- source search
- prepare budgets/modes
- preprocessing role settings

해석 규칙:

1. complete device provider 설정은 captured backend보다 우선한다.
2. device 핵심 authority field가 비어 있을 때만 captured runtime fallback을 사용한다.
3. model 등 일부 field만 있는 partial device 설정에는 backend credential을 섞지 않는다.
4. supervisor는 현재 JS 동작과 같이 device main 설정에서 파생한다.
5. embedding은 device → captured runtime → captured config/environment fallback 순서를 사용한다.
6. retry budget은 captured backend policy에서 가져온다.
7. resolver는 현재 `Server`, runtime config, env, preprocessing file을 다시 읽지 않는다.
8. backend fallback은 기존 main/supervisor/critic/source/embedding accessor와 값 동등성을 검사한다.

최초 parity fixture에서 새 resolver가 backend main/supervisor/source의 `MaxCompletionTokens`까지 채워 기존 accessor의 0과 달라지는 회귀를 발견했다. 새 resolver를 기존 final-caller 동작에 맞춘 뒤 parity가 통과했다.

### 10.3 C4 현재 검증

| Gate | 현재 상태 |
| --- | --- |
| focused capture/resolver | 12 top-level tests + 9 invalid-input subtests passed |
| focused race | passed, 16 concurrent capture 포함 |
| full `internal/httpapi` | passed |
| full Go repository after resolver | passed |
| `go vet ./...` after resolver | passed |
| full repository race after capture owner | passed |
| full repository race after resolver | independent source snapshot에서 passed |
| ARM64 build after capture owner | 36,486,259 bytes, SHA-256 `ac9310927f69ebc50ba3b47551b053a4f644a94d975058b33f3c874ee672822c` |
| ARM64 build after resolver | 36,486,347 bytes, SHA-256 `fd70b2ca9b2ba998ce2cfa14942583a7eaedf7d6734e1c0bc87a9aaa15cae8a6` |
| resolver L2.5/update report | independent snapshot validation 완료 |

### 10.4 C4 현재 limitation

- external strict DTO decoder 없음
- authenticated host route/capability 없음
- execution claim과 HostPrepare registry join 없음
- prepare/complete/provider production caller 없음
- prompt directory/file content snapshot 없음
- provider result/prepare result typed semantic validation 미연결
- startup running→unknown scan 미연결
- context release, terminal tombstone, TTL, compaction 없음
- context-aware accessors가 production caller에 주입되지 않음

주요 commit: `694c6e8`, validation `c6ec332`, resolver `9e23861`.

## 11. P1/P2 현재 충족도

| 계약 | 완료된 기반 | 남은 제품 게이트 |
| --- | --- | --- |
| P1-1 실행권 | MariaDB claim/settle store, claim epoch, route fence | authenticated route, nonterminal phase, Node caller, restart/late settle E2E |
| P1-2 변경 전달 | host stream, ingested/safe, source invalidation, stale worker/vector fence | Node durable intent writer, transport, multi-stream aggregation, complete-time supersession |
| P1-3 prepare 관측 | current contract gap characterization | typed server prepare observation, assembled payload verification, positive/negative handler integration |
| P1-4 prepare 유실 | durable registry, one start authority, ready replay, unknown/skip | HTTP/provider/startup owner, Node prepared/skipped CAS, retention/status join |
| P1-5 대기 입력 | pre-canonical owner, record v4 admission/execution lineage, 취소·편집·인과 복구 fixture | early-send client, automatic drain, admission ACK loss, pending UI, effect lineage |
| P2-1 출력 변환 | 현재 stage gap characterization | AC pure transform export, server stage integration, foreground/BG parity |
| P2-2 소유권 발견 | revision-bound projection/hydration, server-owned failure client fence | 실제 blank-browser chat-open, non-input mode와 joined TTL/tombstone retention, backfill policy |

## 12. C0~C7 현재 상태

| 단계 | 구현 완료 범위 | 미완료 범위 |
| --- | --- | --- |
| C0 | ENV, A~F 기반 실험과 store primitive | 원래 일곱 제품 계약의 route/caller/lifecycle은 후속 단계 소유 |
| C1 | atomic chat/effect commit primitive와 rollback-safe settings release | C6 retention·joined reconciliation |
| C2 | internal opt-in BG result commit과 server-owned failure 보존 | current client activation과 non-input TTL owner 없음 |
| C3 | projection/hydration/input/settings/record-v4 lineage/causal recovery | auto drain, early-send, ACK recovery, UI, effect provenance, activation |
| C4 | context capture + resolver | production accessors, DTO/route, claim/prepare join, v4 complete, v1~v3 regression |
| C5 | 없음 | JS host export, PocketRisu adapter, injection/prefill/output parity |
| C6 | 없음 | full lifecycle, next-input finalization, skip, conflict, response-loss, retention |
| C7 | 없음 | combined package, live apply, browser-exit evidence, iPhone L3, release |

## 13. T01~T28 검증 현황

아래 상태는 product scenario의 최종 통과가 아니라 현재 automated foundation coverage를 나타낸다.

| ID | 현재 상태 | 현재 증거와 남은 차이 |
| --- | --- | --- |
| T01 | 미실행 | capability 0, live early admission 없음 |
| T02 | 미실행 | AC transport/prepare caller 없음 |
| T03 | 부분 기반 | 기존 BG stream은 검증되어 있으나 새 commit+AC 조합 미실행 |
| T04 | characterization만 완료 | stage gap 확인, AC pure output transform 미구현 |
| T05 | 부분 기반 | durable prepare registry 검증, 실제 provider fallback/response drop 미연결 |
| T06 | 부분 자동화 | actual SQLite input→response→input causal recovery fixture, 실제 process kill timing 미실행 |
| T07 | 부분 자동화 | metadata/recovery boundary fixture, 실제 kill/list readback 미실행 |
| T08 | 부분 자동화 | per-key effect failure와 commit rollback/settings 생존 fixture, integrated AC effect 재처리 미실행 |
| T09 | 부분 자동화 | cancel/commit owner race fixture, combined Node+AC claim race 미실행 |
| T10 | 부분 자동화 | 완료 후 edit/delete 새 head와 waiting conflict fixture, branch AC routing 미구현 |
| T11 | AC store 기반 완료 | reverse/gap/restart/source invalidation fixture, Node transport 미구현 |
| T12 | 부분 기반 | result/commit replay와 uncommitted server-owner ACK/client-save 차단, AC raw 포함 ACK loss 미실행 |
| T13 | 부분 기반 | actual route receipt/projection→client helper hydration, blank live browser + TTL 교차 미실행 |
| T14 | 기존 BG 기반 | publish ordering tests 존재, 새 combined path 미실행 |
| T15 | 부분 자동화 | C4 device/backend context unit coverage, 두 실제 기기/provider call 미실행 |
| T16 | 부분 자동화 | captured config/global mutation 불변 fixture, actual prepare/complete consumers 미연결 |
| T17 | gap characterization | prepare server variant와 complete v4 미구현 |
| T18 | 미실행 | actual payload application observation adapter 미구현 |
| T19 | owner 기반 부분 완료 | 취소 skip·편집·삭제·tamper·인과 복구 fixture, autosave/ACK/UI/auto drain 미실행 |
| T20 | store/owner 기반 일부 | current/previous Node recovery는 보강, AC finalization integrated path 미구현 |
| T21 | AC store 기반 완료 | concurrent claim store fixture, authenticated foreground/server route 미구현 |
| T22 | AC store 기반 부분 완료 | prepare/change/skip replay, actual HTTP/provider/startup path 미구현 |
| T23 | 부분 기반 | raw/derived distinction은 기존 AC에 있으나 new server complete path 미구현 |
| T24 | 미실행 | 네 설정 조합과 explicit skip integrated fixture 없음 |
| T25 | 미실행 | PageFold adapter는 존재하나 AC memory PDF combined path 미검증 |
| T26 | 미실행 | capability/build-fence compatibility matrix 미완성 |
| T27 | 부분 기반 | input-owner 기반 result/state 제거 후 소유권 fixture, non-input TTL·blank browser 미실행 |
| T28 | store 기반 부분 완료 | terminal release primitives 존재, integrated lock/queue timing 미실행 |

## 14. 저장소와 GitHub 보존 상태

### 14.1 공개 계획

통합 계획 r2는 공개 NAI Studio 저장소에 보존되어 있다. 이 보고서는 개인 환경·private implementation 상세를 포함하므로 공개 계획 저장소가 아니라 private patcher 작업선에 보존한다.

### 14.2 private patcher

- branch: `codex/pocketrisu-bg-ac-server-chat-save`
- 최초 종합 보고서 commit: `3c27c4b`
- 현재 PocketRisu 구현 checkpoint: `3315e4d`
- 포함 범위: C0 ledger, C1~C3 source/installer/docs, R1~R5 hardening, C4 capture-owner ledger
- 미포함: AC resolver commit `9e23861`의 최신 상태

이 보고서는 같은 private GitHub branch에 보존한다. 최초 보고서 이후 구현 변경과 검증은 별도 commit으로 분리한다.

### 14.3 Archive Center source

- local branch HEAD: `9e23861`
- upstream `main` 대비: 15 local commits ahead
- worktree: clean
- upstream push: 수행하지 않음
- 사용자 소유 private mirror/fork: 아직 없음
- full-index source patch: `artifacts/archive-center/pocketrisu-bg-ac-026dcbf-to-9e23861.patch`
- patch: 428,942 bytes, SHA-256 `d70dac9ef7386464ef8bc5bf9fd0259b7b4c821af321325445abc92a5e6d574d`
- isolated restore: public base `026dcbf` + patch → 28 staged paths, candidate tree `7806dd39f4acfa294ee67f9d7834bc6fed448730` 일치

AC upstream에는 candidate commit이 없지만 exact final source tree는 private patcher 작업선의 full-index patch로도 보존된다. 이는 original 15 commit object나 일반 AC fork를 대체하지 않으며, base commit·patch hash·restored tree를 함께 검증해야 한다.

### 14.4 live 및 disposable target

- live PocketRisu: 기존 40-pack/340-file all graph, 이번 C1~C4 후보 미적용
- isolated AC: unmodified 4.3.1 package와 data 보존, C0~C4 candidate binary 미적용, 현재 listener 중지
- disposable PocketRisu target: clean, empty custom intent
- root workspace의 기존 untracked worktree/ZIP/save 항목은 변경하지 않음

## 15. 현재 주요 위험과 미완료 설계

### 15.1 C3 automatic drain 구조

N+1 waiting 요청에서 HTTP 202를 보낸 뒤 같은 Express handler를 계속 실행하는 방식은 사용할 수 없다. 202 이후 경로에는 conflict, durable state, capacity, queued write failure, final start response와 outer catch 등 다수의 response write가 존재한다. 하나의 operation-keyed response-free coordinator가 poll, revalidation, scheduling, durable outcome을 소유해야 한다.

### 15.2 predecessor effect provenance

현재 N+1은 exact predecessor와 target chat revision을 검증하지만, resolved 이후 overlay하는 globals/statics/owner roots가 predecessor effect만으로 만들어졌다는 per-effect receipt 증명이 없다. capability 1 이전에 C6의 receipt-scoped transition으로 교체해야 한다.

### 15.3 C4 context lifecycle

context owner는 fail-closed capacity를 제공하지만 release/tombstone/retention이 없다. production route를 열면 64개 이후 정상 작업이 계속 capacity에 걸린다. terminal, previous-turn wait, late status, HostPrepare result retention과 함께 exact release 정책을 정해야 한다.

### 15.4 C4 context 범위

현재 context는 device allowlist, RuntimeConfig, preprocessing file, embedding config/env fallback을 고정한다. 관련 prompt directory/file content는 아직 snapshot하지 않는다. 실제 prepare/complete/provider consumer가 mutable prompt 파일을 다시 읽지 않는지도 C4 후속 audit에서 닫아야 한다.

### 15.5 remote persistence

AC local commits는 upstream 권한을 추정하여 push하지 않았다. Exact final source tree는 author metadata가 없는 private full-index patch로 추가 보존했지만, original commit history와 일반적인 review·branch navigation을 위해서는 장기적으로 사용자 소유 private fork/mirror가 더 적합하다.

### 15.6 live baseline 문서 불일치

이전 작업 컨텍스트에는 live PocketRisu가 pristine이라고 기록되어 있었으나 2026-09-20 direct state readback은 기존 all preset 40 packs/340 managed files를 확인했다. 앞으로 current-state 문서는 이 readback을 기준으로 수정해야 한다.

### 15.7 record v4 activation과 history 비용

record v4는 v3를 fail-closed한다. 후보가 live에 없으므로 현재 사용자 데이터를 migration하지 않았으며, capability 활성화 전 input-command prefix의 v3 row가 0인지 확인하거나 명시 migration을 설계해야 한다. admission과 dependency 재검증은 retained input record를 스캔하므로 장기 history의 latency·heap은 retention 한도에서 별도 측정해야 한다.

### 15.8 server-owned failure의 browser/TTL 경계

합성 client에서 server-owned uncommitted 결과는 ACK와 legacy save 전에 차단되고 input owner가 남아 있으면 result/state 제거 뒤에도 소유권을 표시한다. 실제 브라우저 프로세스 종료, local marker 재부팅, non-input C2 mode, joined result/state/input/owner TTL은 아직 검증되지 않았다.

## 16. 다음 권장 실행 순서

### 16.1 AC-off composed Node process boundary

1. composed `server.cjs` child process에서 internal admission과 fixed provider 주입
2. production normal chat API로 commit 본문/revision readback
3. 실제 client process 종료 또는 socket loss 뒤 provider 1회·client save/ACK 0회
4. 빈 local state client의 실제 chatStorage adoption
5. input→response→input durable boundary별 child process restart
6. commit failure와 result/status TTL 뒤 최소 owner readback

현재 actual SQLite+HTTP handler fixture는 start ACK 이후 server 지속 실행과 result/projection/chat/helper hydration을 증명했다. 위 단계는 이를 composed process와 production normal-chat/client storage 경계로 올리는 작업이며 capability를 일반 사용자에게 공개하는 단계가 아니다.

### 16.2 C4 product 연결

1. context-aware prepare/complete/provider accessor 연결
2. current global runtime 재조회가 없는지 final caller별 검증
3. strict external DTO와 unknown-field/body-size/auth fence
4. HostSessionExecution claim과 HostPrepare registry join
5. running/ready/unknown/skip/startup reconciliation
6. complete source acceptance v4와 prepare host observation variant
7. v1~v3 회귀 및 legacy bypass fence

### 16.3 C5 host adapter

1. AC JS device snapshot/host observation 최소 export
2. PocketRisu API v3 host bridge
3. payload application observation
4. pure output sanitize/prefill helper 공유
5. foreground/BG canonical·display·AC candidate parity
6. browser hook/backfill/delivery 중복 제거

### 16.4 C6 activation-critical lifecycle

1. Node queue head와 AC claim 결합
2. durable hostChange intent writer와 transport
3. prepare disposition CAS
4. current/previous-turn finalization
5. explicit unavailable skip
6. effect lineage·source invalidation·late worker fence
7. response loss/status reconciliation
8. context/prepare/owner/result/tombstone retention
9. conflict copy, delete, edit, reroll, branch policy

### 16.5 C3 product activation

1. operation-keyed response-free automatic drain coordinator
2. input append/script/autosave 이전 early-send branch
3. admission ACK loss와 exact retry
4. pending composer와 chat-open reconciliation
5. build-fence new/old client-server matrix
6. C6 필수 gate 통과 뒤 capability 1 승격

### 16.6 C7 qualification

1. complete patch graph lifecycle와 exact revert
2. AC JS/Go/PocketRisu build manifest 고정
3. controlled live apply와 process-first restart
4. 브라우저 프로세스 종료 전후 timestamped API readback
5. 새 브라우저/빈 캐시 readback
6. current/previous-turn, AC off/on/degraded, streaming/non-streaming 검증
7. 구체적 iPhone L3
8. 문서·version·release·rollback 검증

## 17. GitHub 및 실제 파일 대조표

### 17.1 저장소, revision, 원격 보존 여부

| 구분 | 저장소와 기준 revision | 대조 대상 | GitHub 상태 |
| --- | --- | --- | --- |
| 통합 계획 | public NAI Studio `e09a3b640e2a928f046b1145a6e8565c026f53fc` | [`docs/POCKETRISU-1.10-BG-PRESERVE-SERVER-CHAT-SAVE-ARCHIVE-CENTER-PLAN.md`](https://github.com/danso0429/nai-studio/blob/e09a3b640e2a928f046b1145a6e8565c026f53fc/docs/POCKETRISU-1.10-BG-PRESERVE-SERVER-CHAT-SAVE-ARCHIVE-CENTER-PLAN.md) | public GitHub에 보존됨 |
| PocketRisu 구현 정본 | 이 보고서와 같은 private patcher 저장소, branch `codex/pocketrisu-bg-ac-server-chat-save`, 현재 구현 checkpoint `3315e4d` | 아래 34개 초기 implementation/evidence 파일, 이 보고서, connection-hardening validation | 구현 checkpoint는 원격 branch에 보존됨 |
| 공식 PocketRisu 기준선 | [`PocketRisu/PocketRisu` `98e968339d1b3f91b9dac85bb3f2ebb5f90f9d14`](https://github.com/PocketRisu/PocketRisu/tree/98e968339d1b3f91b9dac85bb3f2ebb5f90f9d14) | installer 적용 전 v1.10.0 source | public GitHub에 보존됨. 이 프로젝트는 공식 저장소를 직접 수정하지 않음 |
| Archive Center 기준선 | [`Flazer31/archive-center` `026dcbf3b45adcf69b254673d439b24e943115b3`](https://github.com/Flazer31/archive-center/tree/026dcbf3b45adcf69b254673d439b24e943115b3) | AC 4.3.1 source | public GitHub에 보존됨 |
| Archive Center 후보 | local branch `codex/pocketrisu-bg-ac-server-chat-save`, `9e23861901f15cae46817158a21ea873bbde6fe1` | 아래 28개 local diff 파일과 full-index source patch | upstream branch에는 없음. Exact final tree patch는 private patcher 작업선에 보존됨 |
| 생성·실행 대상 | disposable PocketRisu target, isolated AC runtime, live PocketRisu | installer 합성 결과와 runtime readback | source authority가 아니며 별도 GitHub 저장소로 취급하지 않음 |

private patcher 파일 링크는 이 보고서에서 같은 저장소의 상대 경로로 작성했다. GitHub에서 이 branch의 보고서를 열면 해당 branch의 파일로 이동한다. 최초 N+1 구현은 `265b8e9`, 외부 검수 연결부 수정은 `3315e4d`를 checkout해 비교한다.

Archive Center `9e23861`의 파일에는 현재 클릭 가능한 upstream GitHub blob URL이 없다. 아래 경로를 upstream `main`에서 찾지 못하거나 내용이 다르더라도 누락으로 판정하면 안 된다. upstream은 `026dcbf`, 후보는 그 위의 15 commits이며 exact final tree는 별도 patch에서 복원한다.

### 17.2 정본 소스와 설치 후 파일의 관계

PocketRisu 쪽은 다음 세 층을 구분해야 한다.

1. `patches/*/files*`: installer가 그대로 소유하는 파일의 정본이다.
2. `patches/*/manifest.cjs`: 공식 PocketRisu 또는 다른 pack의 파일에 insert/replace를 합성하는 정본이다.
3. installer 적용 후 target의 `server/node/*`, `src/ts/*`: 여러 pack이 순서대로 합성된 결과이다.

따라서 target의 `server/node/bgOrchestrator.cjs`만 읽으면 어떤 부분이 이번 통합 소유인지 분리하기 어렵다. 먼저 manifest unit과 `files-1.10` owned source를 확인하고, 그다음 disposable target의 합성 결과를 비교해야 한다. `server/node/bgOrchBundle.mjs`는 `bgOrchBundle.build.cjs`에서 생성되는 산출물이므로 직접 수정하거나 정본으로 검토하지 않는다.

Archive Center 쪽은 별도 installer 합성 구조가 아니다. `026dcbf..9e23861`의 28개 파일이 local 후보의 직접 source diff이며, migration·store·HTTP owner와 test가 같은 Git history에 있다.

### 17.3 private patcher의 exact branch-diff 파일 34개

아래 목록은 patcher v0.2.1 기준 commit `3e69349d3b0ca3bf8011b597e080880238e5fa0a`부터 최초 구현 checkpoint `265b8e9b65fc37493f5af670b6127edbadc812a3`까지 `git diff --name-only`로 전수 산출한 결과이다. 후속 `3315e4d`는 이 목록 안의 source/test/manifest/dist 12개 경로를 수정했으며 새 runtime target path를 추가하지 않았다. 이 보고서와 connection-hardening validation 문서는 34개에 포함되지 않는다.

#### C0~C3 검증 문서 8개

- [`docs/POCKETRISU-1.10-BG-AC-C0-VALIDATION.md`](./POCKETRISU-1.10-BG-AC-C0-VALIDATION.md)
- [`docs/POCKETRISU-1.10-BG-AC-C0-E-NODE-STORAGE-CHARACTERIZATION.md`](./POCKETRISU-1.10-BG-AC-C0-E-NODE-STORAGE-CHARACTERIZATION.md)
- [`docs/POCKETRISU-1.10-BG-AC-C0-F-OUTPUT-OWNER-CHARACTERIZATION.md`](./POCKETRISU-1.10-BG-AC-C0-F-OUTPUT-OWNER-CHARACTERIZATION.md)
- [`docs/POCKETRISU-1.10-BG-AC-C1-SERVER-COMMIT-VALIDATION.md`](./POCKETRISU-1.10-BG-AC-C1-SERVER-COMMIT-VALIDATION.md)
- [`docs/POCKETRISU-1.10-BG-AC-C2-SERVER-RESULT-COMMIT-VALIDATION.md`](./POCKETRISU-1.10-BG-AC-C2-SERVER-RESULT-COMMIT-VALIDATION.md)
- [`docs/POCKETRISU-1.10-BG-AC-C3-FOUNDATION-VALIDATION.md`](./POCKETRISU-1.10-BG-AC-C3-FOUNDATION-VALIDATION.md)
- [`docs/POCKETRISU-1.10-BG-AC-C3-SETTINGS-CONTEXT-VALIDATION.md`](./POCKETRISU-1.10-BG-AC-C3-SETTINGS-CONTEXT-VALIDATION.md)
- [`docs/POCKETRISU-1.10-BG-AC-C3-NPLUS1-FOUNDATION-VALIDATION.md`](./POCKETRISU-1.10-BG-AC-C3-NPLUS1-FOUNDATION-VALIDATION.md)

#### C1 lazy-chat-sync 정본 5개

- [`patches/lazy-chat-sync/manifest.cjs`](../patches/lazy-chat-sync/manifest.cjs)
- [`patches/lazy-chat-sync/files/server/node/chatWriteJournal.cjs`](../patches/lazy-chat-sync/files/server/node/chatWriteJournal.cjs)
- [`patches/lazy-chat-sync/files/server/node/chatWriteJournal.test.ts`](../patches/lazy-chat-sync/files/server/node/chatWriteJournal.test.ts)
- [`patches/lazy-chat-sync/files-1.10/server/node/serverChatCommit.cjs`](../patches/lazy-chat-sync/files-1.10/server/node/serverChatCommit.cjs)
- [`patches/lazy-chat-sync/files-1.10/server/node/serverChatCommit.test.ts`](../patches/lazy-chat-sync/files-1.10/server/node/serverChatCommit.test.ts)

#### C2~C3 lazy-chat-bg-adapter 정본 13개

- [`patches/lazy-chat-bg-adapter/manifest.cjs`](../patches/lazy-chat-bg-adapter/manifest.cjs)
- [`patches/lazy-chat-bg-adapter/files-1.10/server/node/serverChatCommitOwner.cjs`](../patches/lazy-chat-bg-adapter/files-1.10/server/node/serverChatCommitOwner.cjs)
- [`patches/lazy-chat-bg-adapter/files-1.10/server/node/serverChatCommitOwner.test.ts`](../patches/lazy-chat-bg-adapter/files-1.10/server/node/serverChatCommitOwner.test.ts)
- [`patches/lazy-chat-bg-adapter/files-1.10/server/node/bgServerChatCommitRoutes.test.ts`](../patches/lazy-chat-bg-adapter/files-1.10/server/node/bgServerChatCommitRoutes.test.ts)
- [`patches/lazy-chat-bg-adapter/files-1.10/server/node/serverChatExecutionProjection.cjs`](../patches/lazy-chat-bg-adapter/files-1.10/server/node/serverChatExecutionProjection.cjs)
- [`patches/lazy-chat-bg-adapter/files-1.10/server/node/serverChatExecutionProjection.test.ts`](../patches/lazy-chat-bg-adapter/files-1.10/server/node/serverChatExecutionProjection.test.ts)
- [`patches/lazy-chat-bg-adapter/files-1.10/server/node/serverChatInputOwner.cjs`](../patches/lazy-chat-bg-adapter/files-1.10/server/node/serverChatInputOwner.cjs)
- [`patches/lazy-chat-bg-adapter/files-1.10/server/node/serverChatInputOwner.test.ts`](../patches/lazy-chat-bg-adapter/files-1.10/server/node/serverChatInputOwner.test.ts)
- [`patches/lazy-chat-bg-adapter/files-1.10/server/node/serverChatSettingsContext.cjs`](../patches/lazy-chat-bg-adapter/files-1.10/server/node/serverChatSettingsContext.cjs)
- [`patches/lazy-chat-bg-adapter/files-1.10/server/node/serverChatSettingsContext.test.ts`](../patches/lazy-chat-bg-adapter/files-1.10/server/node/serverChatSettingsContext.test.ts)
- [`patches/lazy-chat-bg-adapter/files-1.10/src/ts/bgServerCommitHydration.ts`](../patches/lazy-chat-bg-adapter/files-1.10/src/ts/bgServerCommitHydration.ts)
- [`patches/lazy-chat-bg-adapter/files-1.10/src/ts/bgServerCommitHydration.test.ts`](../patches/lazy-chat-bg-adapter/files-1.10/src/ts/bgServerCommitHydration.test.ts)
- [`patches/lazy-chat-bg-adapter/files-1.10/src/ts/storage/serverCommittedChatAdoption.test.ts`](../patches/lazy-chat-bg-adapter/files-1.10/src/ts/storage/serverCommittedChatAdoption.test.ts)

#### root characterization·contract test 6개

- [`test/bg-ac-server-chat-save-c0.test.cjs`](../test/bg-ac-server-chat-save-c0.test.cjs)
- [`test/bg-ac-output-owner-c0.test.cjs`](../test/bg-ac-output-owner-c0.test.cjs)
- [`test/bg-ac-server-commit-c1.test.cjs`](../test/bg-ac-server-commit-c1.test.cjs)
- [`test/bg-ac-server-commit-c2.test.cjs`](../test/bg-ac-server-commit-c2.test.cjs)
- [`test/bg-ac-chat-projection-c3.test.cjs`](../test/bg-ac-chat-projection-c3.test.cjs)
- [`test/lazy-chat-sync.test.cjs`](../test/lazy-chat-sync.test.cjs)

#### 생성 installer 2개

- [`dist/pocketrisu-patcher.cjs`](../dist/pocketrisu-patcher.cjs)
- [`dist/pocketrisu-all.cjs`](../dist/pocketrisu-all.cjs)

두 `dist` 파일은 source·manifest에서 재생성한 전달물이다. 코드 검토는 source와 manifest를 우선하고, `dist`는 reproducibility·byte identity·설치 동작을 대조하는 용도로 사용한다.

### 17.4 단계별 PocketRisu 설치 대상 경로

| 단계 | 정본 source | installer 적용 후 직접 확인할 target 경로 |
| --- | --- | --- |
| C0-E | `test/bg-ac-server-chat-save-c0.test.cjs` | production target 변경 없음. 기존 `server/node/server.cjs`, `chatWriteJournal.cjs`, `src/ts/bgOrchestrate.ts`를 characterization fixture가 읽음 |
| C0-F | `test/bg-ac-output-owner-c0.test.cjs` | production target 변경 없음. 기존 `server/node/bgOrchestrator.cjs`, `src/ts/bgOrchestrate.ts`와 delivery unit을 fixture가 읽음 |
| C1 | `lazy-chat-sync`의 `chatWriteJournal.cjs`, `serverChatCommit.cjs`, manifest | `server/node/chatWriteJournal.cjs`, `server/node/chatWriteJournal.test.ts`, `server/node/serverChatCommit.cjs`, `server/node/serverChatCommit.test.ts` |
| C2 | `serverChatCommitOwner.cjs`, route/owner tests, bg-adapter manifest | `server/node/serverChatCommitOwner.cjs`, `server/node/serverChatCommitOwner.test.ts`, `server/node/bgServerChatCommitRoutes.test.ts`, `server/node/server.cjs`, `server/node/bgOrchestrationOperationStore.cjs`, `server/node/bgOrchestrator.cjs` |
| C3 client | `bgServerCommitHydration.ts`, adoption test, bg-adapter manifest | `src/ts/storage/nodeStorage.ts`, `src/ts/storage/chatStorage.ts`, `src/ts/bgServerCommitHydration.ts`, `src/ts/bgServerCommitHydration.test.ts`, `src/ts/storage/serverCommittedChatAdoption.test.ts`, `src/ts/bgOrchestrate.ts` |
| C3 server | input/settings/projection owned source와 bg-adapter manifest | `server/node/serverChatInputOwner.cjs`, `server/node/serverChatInputOwner.test.ts`, `server/node/serverChatSettingsContext.cjs`, `server/node/serverChatSettingsContext.test.ts`, `server/node/serverChatExecutionProjection.cjs`, `server/node/serverChatExecutionProjection.test.ts`, `server/node/server.cjs`, `server/node/bgOrchBundle.build.cjs`, `server/node/bgOrchestrator.cjs` |

현재 `lazy-chat-bg-adapter` 0.7.0의 exact-1.10 전체 target surface는 22개이다. 여기에는 이번 branch에서 처음 추가한 파일뿐 아니라 기존 adapter unit이 계속 관리하는 파일도 포함된다.

```text
server/node/bgOrchBundle.build.cjs
server/node/bgOrchestrationOperationStore.cjs
server/node/bgOrchestrator.cjs
server/node/bgServerChatCommitRoutes.test.ts
server/node/server.cjs
server/node/serverChatCommitOwner.cjs
server/node/serverChatCommitOwner.test.ts
server/node/serverChatExecutionProjection.cjs
server/node/serverChatExecutionProjection.test.ts
server/node/serverChatInputOwner.cjs
server/node/serverChatInputOwner.test.ts
server/node/serverChatSettingsContext.cjs
server/node/serverChatSettingsContext.test.ts
src/ts/bgDurableSaveBarrier.test.ts
src/ts/bgDurableSaveBarrier.ts
src/ts/bgOrchestrate.ts
src/ts/bgServerCommitHydration.test.ts
src/ts/bgServerCommitHydration.ts
src/ts/globalApi.svelte.ts
src/ts/storage/chatStorage.ts
src/ts/storage/nodeStorage.ts
src/ts/storage/serverCommittedChatAdoption.test.ts
```

이 22개 목록은 current manifest의 1.10 적용 unit에서 file path를 전수 deduplicate한 값이다. branch에서 실제로 변경된 정본 파일은 17.3의 34개 목록으로 판단하고, target 충돌·합성 영향면은 이 22개 목록으로 판단한다.

### 17.5 Archive Center local 후보의 exact diff 파일 28개

아래 목록은 public 4.3.1 기준 `026dcbf3b45adcf69b254673d439b24e943115b3`부터 local 후보 `9e23861901f15cae46817158a21ea873bbde6fe1`까지 `git diff --name-only`로 전수 산출했다. 이 28개 파일의 **후보 내용은 아직 GitHub에 없다.**

#### C0-A contract probe

```text
go-service/internal/httpapi/pocketrisu_server_contract_probe_test.go
```

#### C0-B session execution claim

```text
migrations/014_host_session_execution.sql
go-service/internal/store/mariadb_session_execution.go
go-service/internal/store/mariadb_session_execution_test.go
go-service/internal/store/mariadb_session_execution_integration_test.go
go-service/internal/store/mariadb_session_execution_schema_test.go
docs/pocketrisu-host-session-execution-c0-validation.md
```

#### C0-C ordered host-change stream

```text
migrations/015_host_change_stream.sql
go-service/internal/store/mariadb_host_change.go
go-service/internal/store/mariadb_host_change_test.go
go-service/internal/store/mariadb_host_change_integration_test.go
go-service/internal/store/mariadb_host_change_schema_test.go
docs/pocketrisu-host-change-stream-c0-validation.md
```

`mariadb_session_execution.go`와 해당 unit test도 C0-C에서 source invalidation/claim settle 연결 때문에 다시 변경되었다.

#### C0-D durable prepare registry

```text
migrations/016_host_prepare_registry.sql
go-service/internal/store/mariadb_host_prepare.go
go-service/internal/store/mariadb_host_prepare_test.go
go-service/internal/store/mariadb_host_prepare_integration_test.go
go-service/internal/store/mariadb_host_prepare_schema_test.go
docs/pocketrisu-host-prepare-registry-c0-validation.md
```

`mariadb_host_change.go`와 해당 integration test도 C0-D에서 pending prepare fence와 claim release 연결 때문에 다시 변경되었다.

#### C0-B~D 공통 migration registry

```text
migrations/README.md
go-service/internal/store/session_migration_manifest.go
go-service/internal/store/session_migration_manifest_test.go
```

#### C4 execution context와 resolver

```text
go-service/internal/httpapi/pocketrisu_execution_context.go
go-service/internal/httpapi/pocketrisu_execution_context_test.go
go-service/internal/httpapi/pocketrisu_execution_context_resolver.go
go-service/internal/httpapi/pocketrisu_execution_context_resolver_test.go
go-service/internal/httpapi/server.go
docs/pocketrisu-execution-context-c4-validation.md
```

위 단계별 목록에서 재변경 파일을 한 번만 세면 전체 unique path는 정확히 28개이다.

### 17.6 Archive Center public 기준선에서 함께 대조할 기존 파일

다음 파일은 `026dcbf` public 기준선에서 C0/C4 계약과 precedence를 조사할 때 읽은 기존 owner/caller이다. local 후보의 28-file diff 목록과 달리, 이 표는 기존 동작의 비교 기준이다.

| 책임 | public 4.3.1 기준 파일 |
| --- | --- |
| JS plugin 설정·prepare builder | [`Archive Center.js`](https://github.com/Flazer31/archive-center/blob/026dcbf3b45adcf69b254673d439b24e943115b3/Archive%20Center.js) |
| backend runtime config | [`go-service/internal/httpapi/runtime_config.go`](https://github.com/Flazer31/archive-center/blob/026dcbf3b45adcf69b254673d439b24e943115b3/go-service/internal/httpapi/runtime_config.go) |
| prepare caller와 turn extraction | [`prepare_turn_multi_agent.go`](https://github.com/Flazer31/archive-center/blob/026dcbf3b45adcf69b254673d439b24e943115b3/go-service/internal/httpapi/prepare_turn_multi_agent.go), [`turn_extraction.go`](https://github.com/Flazer31/archive-center/blob/026dcbf3b45adcf69b254673d439b24e943115b3/go-service/internal/httpapi/turn_extraction.go) |
| group prepare/complete | [`group_turn_prepare.go`](https://github.com/Flazer31/archive-center/blob/026dcbf3b45adcf69b254673d439b24e943115b3/go-service/internal/httpapi/group_turn_prepare.go), [`group_turn_complete.go`](https://github.com/Flazer31/archive-center/blob/026dcbf3b45adcf69b254673d439b24e943115b3/go-service/internal/httpapi/group_turn_complete.go) |
| complete provenance/idempotency | [`complete_turn_source_acceptance.go`](https://github.com/Flazer31/archive-center/blob/026dcbf3b45adcf69b254673d439b24e943115b3/go-service/internal/httpapi/complete_turn_source_acceptance.go), [`complete_turn_idempotency.go`](https://github.com/Flazer31/archive-center/blob/026dcbf3b45adcf69b254673d439b24e943115b3/go-service/internal/httpapi/complete_turn_idempotency.go) |
| range/finalization decision | [`group_turn_range_decision.go`](https://github.com/Flazer31/archive-center/blob/026dcbf3b45adcf69b254673d439b24e943115b3/go-service/internal/httpapi/group_turn_range_decision.go) |
| DTO와 prepare source contract | [`types_gen.go`](https://github.com/Flazer31/archive-center/blob/026dcbf3b45adcf69b254673d439b24e943115b3/go-service/internal/dto/types_gen.go), [`prepare_source_contract.go`](https://github.com/Flazer31/archive-center/blob/026dcbf3b45adcf69b254673d439b24e943115b3/go-service/internal/dto/prepare_source_contract.go) |

현재 C4 context/resolver는 이 기존 caller를 아직 교체하거나 주입받지 않는다. 따라서 새 resolver 파일의 존재와 실제 prepare/complete/provider 사용은 별개이며, production caller 연결은 10.4와 16.2의 미완료 항목으로 남는다.

### 17.7 재현 가능한 대조 순서

1. 공개 계획은 `e09a3b`의 계획 파일과 SHA-256을 대조한다.
2. private patcher는 최초 구현 `265b8e9`와 connection hardening `3315e4d`를 나누어 확인한다.
3. `manifest.cjs`의 unit을 읽고 exact PocketRisu `98e9683` disposable target에 installer를 적용한다.
4. 17.4의 target 경로를 정본 source/manifest와 비교하고, `dist` 자체보다 합성 결과·re-plan 0·exact revert를 확인한다.
5. Archive Center는 public `026dcbf`를 먼저 확보하고 verified full-index patch를 index에 적용해 28개 경로와 expected tree를 대조한다. GitHub upstream 파일만 보고 후보를 검증했다고 기록하지 않는다.
6. C4는 context/resolver unit test와 실제 caller 연결을 구분한다. 현재 후자는 존재하지 않는다.
7. live PocketRisu와 isolated AC는 이번 후보가 배포되지 않았으므로 source diff와 live 기능을 동일시하지 않는다.

## 18. 주요 commit 인덱스

### 18.1 Archive Center

| 영역 | 주요 commit |
| --- | --- |
| C0-A contract characterization | `a932234` |
| C0-B execution claim | `2b16b56`, `3fad4ae`, `486e599` |
| C0-C host change/source fence | `17fcdd1`, `d063b68`, `6866ccd`, `701f1ad` |
| C0-D prepare registry | `31e3651`, `d15acbd`, `043b587`, `7decdbb` |
| C4 context owner | `694c6e8` |
| C4 first validation | `c6ec332` |
| C4 effective resolver | `9e23861` |

### 18.2 private patcher

| 영역 | 주요 commit |
| --- | --- |
| C0-E characterization | `1fc03d7` |
| C0-F characterization | `8cd6a47` |
| C1 journal/commit/effect hardening | `81b2236`, `0e93888`, `268ec7a` |
| C2 result commit wiring | `f59ceb1`, `d4928e3`, `d1c97df`, `23d44cf` |
| C3 projection/hydration | `99d681b`, `d10c62f`, `87dcf54` |
| C3 input owner | `d2012d8`, `5351932`, `a318c8c`, `47a016b` |
| C3 descendant/revision hardening | `0203ea6`, `db72ec0` |
| C3 immutable settings | `4ca430a`, `1f44f0a`, `9af40da`, `dc6e20c` |
| C3 N+1 lineage | `11460f3`, `bb39b36` |
| C3 final installer/docs | `7c5b7c1`, `25d6a76` |
| C4 central ledger | `265b8e9` |
| C3 external-audit connection hardening | `3315e4d` |
| C3 AC-off HTTP boundary fixture | `a286b96` |

## 19. 상세 증거 문서

- `docs/POCKETRISU-1.10-BG-AC-C0-VALIDATION.md`
- `docs/POCKETRISU-1.10-BG-AC-C0-E-NODE-STORAGE-CHARACTERIZATION.md`
- `docs/POCKETRISU-1.10-BG-AC-C0-F-OUTPUT-OWNER-CHARACTERIZATION.md`
- `docs/POCKETRISU-1.10-BG-AC-C1-SERVER-COMMIT-VALIDATION.md`
- `docs/POCKETRISU-1.10-BG-AC-C2-SERVER-RESULT-COMMIT-VALIDATION.md`
- `docs/POCKETRISU-1.10-BG-AC-C3-FOUNDATION-VALIDATION.md`
- `docs/POCKETRISU-1.10-BG-AC-C3-SETTINGS-CONTEXT-VALIDATION.md`
- `docs/POCKETRISU-1.10-BG-AC-C3-NPLUS1-FOUNDATION-VALIDATION.md`
- `docs/POCKETRISU-1.10-BG-AC-C3-CONNECTION-HARDENING-VALIDATION.md`
- `docs/POCKETRISU-1.10-BG-AC-ARCHIVE-CENTER-SOURCE-SNAPSHOT.md`
- `docs/POCKETRISU-1.10-BG-AC-C4-INDEPENDENT-SNAPSHOT-VALIDATION.md`
- `artifacts/archive-center/pocketrisu-bg-ac-026dcbf-to-9e23861.patch`
- AC `docs/pocketrisu-host-session-execution-c0-validation.md`
- AC `docs/pocketrisu-host-change-stream-c0-validation.md`
- AC `docs/pocketrisu-host-prepare-registry-c0-validation.md`
- AC `docs/pocketrisu-execution-context-c4-validation.md`

## 20. 최종 판정

현재 구현은 다음을 입증했다.

- PocketRisu 서버가 chat/effect/owner를 원자적 recovery boundary에 기록할 수 있다.
- opted-in BG result가 browser save 없이 normal chat owner로 들어갈 수 있다.
- client가 server commit receipt와 revision-bound projection으로 normal chat을 hydrate할 수 있다.
- raw input을 canonical append 전에 서버 owner가 접수하고 한 번만 transform할 수 있다.
- 취소된 admission을 건너뛰어도 successor가 더 오래된 active 실행 의존성을 우회하지 않는다.
- 완료 후 현재 답변 edit/delete로 만들어진 새 head와 이미 waiting인 successor conflict를 구분한다.
- input→response→input 저널을 실제 SQLite에서 인과 순서로 복구하고, 반복 pending은 bounded하게 중지한다.
- response transaction rollback은 durable input 상태와 volatile settings context를 함께 기존 상태로 유지한다.
- server-owned commit failure는 합성 foreground/boot 경로에서 legacy client save·ACK보다 먼저 차단된다.
- actual SQLite route의 server receipt/projection이 client hydration helper 계약과 연결된다.
- HTTP start ACK가 끝난 뒤에도 fixed provider 작업이 server에서 한 번만 계속되어 commit/result/projection/chat/hydration을 완성한다.
- AC가 session claim, ordered host change, durable prepare state를 MariaDB에 보존할 수 있다.
- AC가 device/backend settings와 private provider material을 process-memory context로 고정하고, mutable global을 다시 읽지 않는 resolver를 만들 수 있다.

현재 구현은 다음을 아직 입증하지 않았다.

- 실제 client가 새 input contract를 사용한다.
- waiting successor가 브라우저 없이 자동 시작된다.
- 실제 browser process에서 server-owned failure 뒤 client save·ACK·provider 재호출이 0회다.
- record v3 production row가 0이거나 v4로 안전하게 migration된다.
- 긴 input history에서 admission/dependency scan 비용이 허용 범위다.
- PocketRisu와 AC가 authenticated host transport로 연결된다.
- actual prepare/complete/provider가 captured context를 사용한다.
- AC output transform과 server canonical output이 foreground와 동일하다.
- 양쪽 lifecycle이 response loss, restart, skip, conflict, retention에서 하나로 수렴한다.
- 실제 browser process exit 뒤 새 브라우저에서 통합 결과가 복원된다.

따라서 현재 결과는 C1~C3와 C4 owner/resolver의 명시된 자동검증 범위 안 기반 구현이며, 배포 가능한 최종 통합 제품이나 release-qualified 상태가 아니다.
