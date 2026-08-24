# PocketRisu + patcher vs Haejeok bounded runtime validation

> 상태: **bounded runtime follow-up 완료 / Haejeok product qualification 미완료**
>
> 검증일: 2026-08-24 KST
>
> Haejeok source: `e9d035683cdf9f0207eed193ee36f9bdb117f658`
> / exact tag `b6254`
>
> Current comparison source: patcher
> `076646605b344e5e18943270838859f11f7550dc`, official PocketRisu
> `98e968339d1b3f91b9dac85bb3f2ebb5f90f9d14`

이 문서는
[`POCKETRISU-HAEJEOK-FEATURE-COMPARISON-INDEPENDENT-REVIEW.md`](POCKETRISU-HAEJEOK-FEATURE-COMPARISON-INDEPENDENT-REVIEW.md)의
source/caller 판정을 runtime으로 보강하고 46개 비교 claim을 일곱 증거 축으로
분리해요. Haejeok을 production에 설치했다는 기록, 모든 backend/device를
qualification했다는 주장, 새 HJ pack admission 또는 stable release 승인이
아니에요.

## 1. Evidence labels

| Label | 의미 |
| --- | --- |
| `SF` | pinned source와 final caller를 직접 확인했어요. |
| `UT` | Haejeok unit/pure test 또는 disposable harness를 실행했어요. |
| `PG16` / `PG17` | 격리된 실제 PostgreSQL 16.15 / 17.11 ARM64 server에 연결했어요. |
| `CHR140` | Playwright Chromium 140에서 실제 browser DOM/runtime을 관찰했어요. |
| `L3-current` | current PocketRisu adaptation을 사용자가 실제 iPhone에서 확인한 기존 근거예요. |
| `mock` | Oracle/Azure/fake Docker처럼 실제 서비스가 아닌 mock/fake test예요. |
| `NR` | 이번 검증에서 실행하지 않았어요. 부재를 통과로 해석하지 않아요. |

`source-backed`, `test-passed`, `runtime-observed`, `user-valued`, `admitted`는
서로 바꿔 쓸 수 없는 상태예요.

## 2. Executed gates and exact observations

### 2.1 Haejeok repository gates

| Gate | 관찰 |
| --- | --- |
| Default `pnpm test` | exit 1. 68 files 중 11 failed / 56 passed / 1 skipped, 389 passed / 16 skipped tests. 실패한 11 suites는 모두 test body 전 `src/ts/hub.ts`의 `localStorage?.getItem is not a function` import error였어요. |
| Diagnostic test run | `NODE_OPTIONS=--no-experimental-webstorage pnpm test`: exit 0, 67 passed / 1 skipped files, 503 passed / 17 skipped tests. 이는 test body 실행 근거이지 default gate 통과가 아니에요. |
| `pnpm check` | exit 0, Svelte 0 errors / 0 warnings. |
| `pnpm build` | exit 0, Vite 8.0.3, 6,158 modules. `dist/` 245,933,370 bytes. Svelte-config 부재, CSS optimizer, browser externalization, ineffective dynamic import, large chunk, plugin timing 경고가 남았어요. |
| HJ exporter focused tests | diagnostic environment에서 3/3 passed. warm/cold render completion과 basic standalone HTML만 다뤄요. |
| Oracle/Azure/asset units | 5 files, 70/70 passed. 실제 Oracle/Azure endpoint가 아닌 mock/pure test예요. |
| SQL/backup/ZIP focused selection | 12 files, 88 passed / 14 skipped. 14 skipped는 DB URL이 없을 때의 PostgreSQL integration cases였고 아래 actual DB run으로 별도 실행했어요. |

Node 25.9.0은 Haejeok의 declared `>=22.12.0` 범위 안이에요. 따라서 default
test 실패는 이 호스트만의 unsupported-version 결과로 버리지 않고 test harness
compatibility finding으로 남겨요. Node 20/22와 upstream CI는 `NR`이에요.

### 2.2 Actual PostgreSQL 16/17

시스템 서비스를 설치하지 않고 official ARM64 packages를 `/tmp`에 풀어 격리
cluster와 test DB만 실행했어요. production DB·port·credential·user data는
사용하지 않았어요.

| Run | 관찰 |
| --- | --- |
| Shipped integration suite on PG16.15 | 10/14 passed, 4 failed. |
| Shipped integration suite on PG17.11 | 10/14 passed, 같은 4 failed. major-version 차이로 설명되지 않았어요. |
| Current-contract diagnostic fixture on PG16.15 | 14/14 passed. |
| Current-contract diagnostic fixture on PG17.11 | 14/14 passed. |

원본 4 failures는 다음 source/test drift로 재현됐어요.

1. 두 fixtures가 v3 계약 뒤에도 `root.botPresets`를 보내지만 validator는
   `presets` owner만 허용해요.
2. chat lore fixture가 실제 `Chat.localLore` 대신 `globalLore`를 써요.
3. prompt fixture가 실제 `promptInfo.promptText` 대신 `promptItems`를 써요.
4. legacy document-column assertion의 `AND column_name = 'data'` 괄호가
   character branch 전체에 적용되지 않아요.
5. 첫 test의 `loadDatabase().botPresets` assertion은 새 summary/detail lazy
   owner인 `listBotPresets()`/`loadBotPreset()`로 바뀌지 않았어요.

위 다섯 곳만 current contract에 맞춘 **별도 diagnostic worktree**는 양쪽 DB에서
14/14였어요. 이는 backend 주요 successful paths가 동작했다는 근거지만 shipped
test gate 자체는 여전히 10/14이고, 실제 app session·pool failover·migration·DR을
qualification하지 않아요.

### 2.3 SQL failure lifecycle

Backend `sync()`는 transaction failure를 rollback/rethrow하고 browser
`NodePostgresStorage.commit()`도 409/500을 throw해요. 반례의 경계는 domain
stores예요.

- 정상 debounce 뒤 Settings commit 실패: public `flush()`는 정상 resolve했고
  두 번째 flush는 commit을 재호출하지 않았어요.
- Character commit 실패: dirty payload를 commit 전에 비운 뒤 정상 resolve했고
  두 번째 flush는 재시도하지 않았어요.
- Message append/delete failure: in-memory state를 먼저 바꾸고 정상 resolve하며
  pending retry owner가 없었어요.
- Settings mutation 직후 reactive effect보다 먼저 강제 flush한 변형은 effect가
  뒤늦게 dirty를 한 번 재등록했지만 timing-dependent incidental retry였어요.

Disposable failure probes는 7/7, 더 작은 독립 재현은 Settings/Character/Message
3/3이었어요. HJ04 source에는 success-path ordering이 있지만 durable success
gate는 없다는 교정을 유지해요.

### 2.4 Audit privacy on actual PG17

합성 marker만 사용해 setting create → replace → delete를 Haejeok
`PostgresStorage.sync()`로 실행했어요.

- revisions: 1 → 2 → 3;
- live setting rows after delete: 0;
- audit rows: 7;
- old marker retained in `before_row`: true;
- replacement marker retained in `after_row`: true.

`system.custom_models.api_key`도 audited trigger set에 있고 revision-details API는
raw before/after rows를 반환해요. DB-history UI는 key-based mask 없이
`String`/`JSON.stringify`로 표시해요. non-test retention, redaction, prune,
revision-delete owner는 찾지 못했어요. 따라서 X04는 단순 at-rest 비용을 넘어
authenticated history UI·backup DB·pg_dump/restic 사본까지 포함하는 secret
lifecycle project예요.

### 2.5 ZIP writer and importer

| Probe | 관찰 |
| --- | --- |
| Actual `streamZip`, one 4 GiB+1 entry | entry 4,294,967,297 bytes, archive 4,294,967,561 bytes. sparse sink의 allocated bytes는 8,192였지만 writer는 전체 logical body를 순회해 CRC/records를 생성했어요. Info-ZIP 6.00 `unzip -t` exit 0. |
| Actual `streamZip`, 65,536 entries | archive 8,257,634 bytes. `zipinfo` 65,536 files, `unzip -tqq` exit 0. |
| HJ `CharXImporter`, corrupt STORE entry | original `[1,2,3,4]`의 first byte를 바꾼 archive를 정상 resolve하고 corrupted bytes를 asset-save caller에 전달했어요. 같은 archive는 Info-ZIP bad CRC, exit 2였어요. |
| Portable backup frame boundary | uint32 `0xffffffff` entry length accepted, `0x100000000` rejected. asset entry별 CRC/hash는 없어요. |

따라서 HJ writer의 true ZIP64 size/count와 한 external implementation의
interoperability는 이번 환경에서 관찰됐어요. HJ06은 importer CRC와 50 MiB
per-entry/round-trip policy, HTTP interruption, browser save, 다른 extractor가
남아 있어 계속 blocked예요.

### 2.6 Chromium exporter/runtime probes

HJ source modules를 temporary Vite harness에서 그대로 import하고 Chromium 140에
mount했어요.

- `ParseMarkdown(..., 'notrim')`은 active event attribute를 유지했어요.
- normal parser는 같은 attribute를 제거했어요.
- actual `MessageContent` final DOM은 `notrim` attribute를 유지했고 browser가
  그것을 처리했어요.
- `buildStandaloneHtmlDocument()`의 unvalidated `customStyles`는 Chromium
  DOMParser와 iframe 모두에서 `<style>` 밖의 별도 marker element를 만들었어요.
- CDN 차단 시 `getFFmpeg()`는 `Failed to fetch`, self-only CSP에서는
  `connect-src` 위반으로 실패했어요.
- source의 `dist/umd` core URL은 CDN JS/WASM 200 뒤
  `failed to import ffmpeg-core.js`로 실패했어요.
- 같은 version의 `dist/esm` 대조 harness는 두 CDN responses 200 뒤 2,861 ms에
  load됐어요. 이는 frozen source의 UMD/module 조합 문제를 분리한 diagnostic이며
  source를 수정한 결과가 아니에요.
- WebM conversion symbol은 caller 0이라 위 media load는 shipped user outcome이
  아닌 직접 diagnostic이에요.

Current PocketRisu native HTML export metadata도 같은 browser 기준으로 봤어요.
`.idat`에 JSON을 문자열 보간하고 `textContent`로 복원하는 source-equivalent
round trip에서 literal `&lt;`, `&amp;`, `&#x3c;`는 각각 다른 text로 바뀌었고
literal `&quot;`는 JSON parse error가 됐어요. Stage A를 current exporter에
추가한다면 이 기존 owner의 metadata encoding도 함께 닫아야 해요.

## 3. Seven-axis claim matrix

아래 `Runtime`은 가장 높은 실제 증거만 적어요. 값이 없으면 source 결과를
runtime으로 승격하지 않아요.

### 3.1 D01–D17

| ID | Source fact | Final caller | State lifecycle | Safety | Test/runtime | User value | Admission |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D01 | SQL backends are conditional alternatives; current also has filesystem/request-log stores | deployment-selected | competing primary authorities | migration/DR open | PG16/17 bounded; Oracle/Azure mock | scale value unmeasured | separate backend migration |
| D02 | HJ SQL shallow load avoids full DB decode | SQL startup | lazy domains and summaries | degraded startup exists; full app start NR | PG schema/load cases | startup value unmeasured | architecture alternative |
| D03 | 200/40 paging plus generation hydration barrier | SQL chat/generation | load errors are logged then resolved | partial-history generation possible | UT; device NR | memory value unmeasured | trigger-gated owner research |
| D04 | backend 409 reject exists | domain commits | dirty/message state can be lost after reject | in-memory/durable divergence | PG stale writer + failure probes | current auto-recovery is distinct | keep current strict owner |
| D05 | user/script/plugin ordering exists | live HJ callers | store failure is swallowed | generation/reload may continue | failure probes; current L3 | intended outcome already adapted | keep current HJ04 only |
| D06 | closest HJ path is volatile proxy job | proxy callers | no durable claim/ACK/restart pipeline | result loss on restart/reconnect | proxy UT only | no current gap for ordinary BG | no HJ admission |
| D07 | no equivalent HJ build fence found | none | stale writer not centrally fenced | authoritative stale write risk | SF; current receipts | current-specific requirement | keep current fence |
| D08 | HJ application transport is not one DB/asset epoch | backup caller | DB then asset listing | cross-epoch backup | UT only | current snapshot value known | keep current owner |
| D09 | quiesce/pg_dump/RustFS/restic scripts exist | operator script | no automated restore; default same-host | recoverability/off-host unknown | syntax + fake installer; real drill NR | deployment-specific | separate DR project |
| D10 | SQL revision restore works on rows | revision API/UI | asset payload epoch unchanged | secret history + missing asset refs | corrected PG17 revision cases | record history may be useful | privacy/asset project first |
| D11 | FS/S3/Azure breadth exists | selected asset backend | remote failure may fall back process-locally | split authority/failover unknown | asset units; real S3/Azure NR | scale value unmeasured | architecture alternative |
| D12 | wrong lazy-detail owner and browser candidate deletion | Storage Explorer → generic delete | server does no canonical re-walk | live referenced asset can be deleted | SF/caller counterexample; destructive run NR | read-only diagnostics only | reject delete/orphan authority |
| D13 | current import integrity; HJ streaming writer | actual CharX callers | export/import limits disagree | HJ importer accepts bad CRC | actual 4 GiB/count + corrupt import | large export need unmeasured | HJ06 blocked |
| D14 | HJ shows memory success before debounced durability | import/send callers | later commit failure is hidden | false terminal success | failure probes | current terminal result stronger | no HJ source admission |
| D15 | current masked request log; HJ raw 20 + SQL usage | separate callers | different retention models | HJ raw log/privacy not qualified | PG token aggregate case; UI NR | both outcomes distinct | no blanket superiority |
| D16 | PostgreSQL active+cold FTS; Oracle substring | backend-specific search | index tied to relational DB | query/privacy policy open | corrected PG16/17 FTS case | user demand unmeasured | X03 backend project |
| D17 | Node DB explorer/revision; Web/Tauri limited | Node-only UI/API | SQL-only restore | audit secret/asset gap | PG backend; UI NR | value unmeasured | X04 separate project |

### 3.2 U01–U15

| ID | Source fact | Final caller | State lifecycle | Safety | Test/runtime | User value | Admission |
| --- | --- | --- | --- | --- | --- | --- | --- |
| U01 | 2–6 columns/progressive thumbnail catalog exists | MainMenu | column-major visual/tab order | a11y/order open | build; dedicated UI NR | preference unknown | X01 hypothesis only |
| U02 | favorite/hidden/sort state exists | MainMenu | no dedupe/type/live-ID cleanup found | stale IDs/label ambiguity | source; UI NR | `high-value` unproven | split candidates, inactive |
| U03 | relevance applies only with query + default sort | MainMenu search | alternate ordering view | canonical order must remain | source; HJ UI NR | preference unknown | optional view hypothesis |
| U04 | recent session list cuts top 50 before search | RecentSessions | unloaded snippet empty | privacy/search completeness open | source; UI NR | value unknown | X02 metadata/privacy first |
| U05 | current organizer owns canonical folders/order | current caller | one owner | HJ stacking conflicts | current receipts | existing result | keep current |
| U06 | current persona gallery/folder/ref walker broader | current caller | canonical persona owner | reference deletion guarded | current receipts | existing result | keep current |
| U07 | current matcher adds reverse keyboard direction/bounds | current grid/mobile | preserves native order | false-positive bounds tested | focused tests + L3-current | admitted value observed | keep HJ03 adaptation |
| U08 | widths are rem nominal vs HJ literal px | current width owner | one setting across hosts | no second width authority | focused tests + L3-current | admitted value observed | keep HJ01 adaptation |
| U09 | global resize reaches 104 HJ / 105 current static tags | generic TextAreaInput | global geometry state | pointer/a11y/id/cleanup gaps | source; physical UI NR | named pain absent | HJ02 screen-trigger only |
| U10 | low-spec 4/6, retention 40 and cache slices exist | SQL/asset/render callers | aggregate spans multiple owners | partial-chat/cache identity risks | UT; device memory NR | one-click value unknown | HJ05 trigger-gated |
| U11 | current exact Personal controls are broader | current caller | existing owner | no HJ replacement need | current receipts | existing result | keep current |
| U12 | Realm native navigation + current stay override | import callers | current configurability superset | existing paths preserved | current tests/receipts | existing result | keep current |
| U13 | HJ exporter surface exists | preview/image/HTML callers vary | numeric range, edit/theme state diverge | active markup, restore schema, MIME defects | actual CHR140 + focused UT | safe/stable value not shown | reject frozen HJ08 |
| U14 | HJ explorer preview and current AssetViewer differ | separate callers | different owners | current focus/HJ arbitrary preview limits | source; UI NR | comparison not priority proof | keep separate |
| U15 | HJ inventory/inspector breadth exists | Storage Explorer | analysis can miss references | orphan/delete unsafe | source counterexample | read-only value unknown | X05 diagnostic slices only |

### 3.3 G01–G14

| ID | Source fact | Final caller | State lifecycle | Safety | Test/runtime | User value | Admission |
| --- | --- | --- | --- | --- | --- | --- | --- |
| G01 | HJ greedy Thoughts is generation scope; display parser is nested | parser callers | scope-specific | three skipped regressions remain | diagnostic suite | current regression value established | keep current parser |
| G02 | current legacy SSE parser stronger; HJ Responses parser separate | provider-specific | not one blanket path | framing failures provider-specific | UT | both capabilities matter | no blanket winner |
| G03 | current structural stream identity + BG lifecycle | current runtime | durable result owner | HJ proxy volatile | current receipts; HJ proxy UT | current ordinary path covered | no HJ replacement |
| G04 | HJ per-message controllers vs current one manager | edit callers | current stale/CAS identity | listener/stale risks | current tests; HJ UI NR | current result established | keep current K15 |
| G05 | HJ mutates saved defaults; both adjacent ends fail | hotkey caller | boundary bug | wrong navigation | source; current tests | current result established | keep current K16 |
| G06 | HJ gesture lacks equivalent cleanup/back guard | mobile caller | pointer lifecycle differs | touchcancel/ignored cleanup | source; HJ device NR | current result established | keep current K16 |
| G07 | current manual Hypa safety; HJ Node vector exists | different callers | vector process-memory index | server responsiveness unknown | vector UT; benchmark NR | Node value unmeasured | HJ07 measurement gate |
| G08 | ordinary current sends already server-side; exceptions remain | mixed generation paths | no abort/worker/queue in HJ endpoints | shared event-loop risk | UT only | client benefit unmeasured | HJ07 trigger-gated |
| G09 | current translation identity/cancel/tooling broader | current caller | expected-value state | HJ basic cache not replacement | current tests | existing result | keep current K12 |
| G10 | SQL preset ID owner is architecture-specific | SQL preset callers | list/detail lazy owner | shipped PG test drift exists | corrected PG16/17; shipped 10/14 | migration value unknown | no isolated port |
| G11 | HJ lacks legacy role→role2 fallback | prompt caller | compatibility normalization | old data mismatch | source/current tests | current narrow advantage | keep current guard |
| G12 | current theme normalization has independent owner/tests | current caller | DB/preset/runtime normalized | invalid state guarded | current tests | existing result | keep current guard |
| G13 | both use Vite 8/Tailwind 4/Svelte 5/Vitest 4 | build/test callers | target hardening differs | default Node25 test gate fails HJ | HJ build/check + tests | modernization is not delta | compare hardening/scope only |
| G14 | HJ deployment/Tauri/SQL breadth exists | deployment-specific | mutable images/manual restore | DR/runtime stability unknown | build; fake installer; real drill NR | separate product choice | X06 product project |

## 4. Limitation ledger after follow-up

| Original limitation | Current state |
| --- | --- |
| Haejeok Vitest/build | **Partially resolved.** Default test gate fails; diagnostic 503/17 passes; check/build complete. Node 20/22 CI remains NR. |
| PostgreSQL actual DB | **Partially resolved.** PG16.15/17.11 actual runs complete. Shipped suite 10/14, current-contract diagnostic 14/14. Full app/failover/scale remains NR. |
| Oracle/Azure actual DB | **Open.** 70/70 mock/pure tests only; no endpoint/credential. |
| Docker/RustFS/restic restore drill | **Open.** syntax/fake installer only. No restore automation or isolated-host recovery was executed. |
| Hostile markup actual browser | **Resolved for Chromium 140 paths tested.** `notrim` final DOM and style boundary counterexamples observed. WebKit/iPhone remains open. |
| ffmpeg CDN/offline/CSP | **Resolved for bounded Chromium diagnostic.** offline/CSP fail; frozen UMD URL fails after 200 responses; ESM control loads. WebM caller remains absent. |
| True >4 GiB single entry / external unzip | **Resolved for zero-pattern 4 GiB+1 and Info-ZIP 6.00.** Other data patterns, extractors, HTTP/browser delivery remain open. |
| Performance/scale | **Open by design.** Unit success and source bounds do not establish client benefit, shared-server responsiveness, or production scale. |
| DR | **Open.** Backup creation source/fake tests are not a restore drill. |
| UX value | **Open except current HJ01/03/04 L3.** Source gaps are hypotheses without user demand/frequency evidence. |
| Haejeok iPhone | **Open.** Linux Playwright WebKit could not start because host libraries were absent; even a successful Linux WebKit run would not equal physical iPhone L3. |

## 5. Reconciled admission result

1. HJ01/HJ03/HJ04 current adaptations and their existing L3 remain admitted.
2. No new active HJ implementation queue is created.
3. HJ02/HJ05 stay named-problem or measurement triggered.
4. HJ06 remains blocked by importer integrity and coherent round-trip policy even
   though the writer passed two true ZIP64 boundaries.
5. HJ07 remains measurement triggered; unit correctness is not net client value
   or server responsiveness evidence.
6. Frozen HJ08 is rejected more strongly: active input handling, restore schema,
   range identity, output wiring, MIME, and UMD core load all fail admission
   boundaries. A future current-owner Stage A starts with stable IDs and
   TXT/Markdown, not this renderer.
7. X01/X02/X05 remain value hypotheses or read-only slices, not priorities.
8. X03/X04/X06 and SQL/S3/revision/deployment remain separate product projects.
9. Current native exporter metadata encoding is a separate current-owner defect;
   finding it does not admit HJ08.

## 6. Still required before stronger claims

- actual Oracle and Azure SQL;
- actual RustFS/S3, Docker quiesce, restic check and isolated restore;
- audit privacy deletion across primary/backup/restic copies;
- SQL revision restore with an intentionally missing external asset;
- HTTP disconnect/browser save and writer→HJ importer round trip above 50 MiB;
- Node compute differential workload with event-loop, concurrency, abort and
  client end-to-end observations;
- physical iPhone/WebKit behavior;
- explicit user evidence for catalog, recent-session, low-spec, exporter or
  explorer value.

Until those gates run, their absence is an explicit `NR`, not an inferred pass
or fail.

## 7. Concrete protocols for the remaining gates

These protocols make the `NR` rows reproducible; they are not scheduled work
or predicted outcomes.

### 7.1 Oracle and Azure SQL

Use disposable databases and synthetic records only. Keep connection strings
out of tracked files and captured output.

1. Apply each pinned schema to an empty database and record exact engine and
   driver versions.
2. Run the same create/update/delete, stale-revision, cold-storage,
   active+cold search, token-usage, revision-preview and restore matrix used for
   PG17.
3. Inject connection loss before transaction begin, after one row mutation,
   before commit, and after server commit/before client ACK.
4. Verify live rows, revision counters, audit rows, client dirty state and the
   next retry independently; do not use UI success as durable evidence.
5. Put one synthetic provider-key marker in every backend-specific secret
   column, replace and delete it, then inspect primary history, backup mirror
   and revision UI projection for retention.
6. Record unsupported backend features separately. Oracle substring search and
   PostgreSQL FTS must not share one result label.

### 7.2 Docker, RustFS and restic recovery

Run on an isolated disposable host or VM, not the current production tree.

1. Seed one synthetic database with characters, chats, cold entries, two asset
   objects, one intentionally missing reference and one synthetic old secret in
   audit history.
2. Configure the restic repository off the application host and keep its
   password in a separate recovery channel.
3. Execute the shipped backup helper while recording app/RustFS quiesce and
   resume order, `pg_dump` result, restic snapshot ID and `restic check`.
4. Remove only the disposable stack and its fixture volumes, then rebuild on a
   second clean host from documented materials. This destructive step requires
   an explicit fixture-target confirmation at execution time.
5. Restore PostgreSQL, RustFS and `save/`; compare row counts, revision history,
   object hashes, reference resolution, cold data and application startup.
6. Repeat with an interrupted dump, a missing RustFS object, an invalid DB
   payload after asset staging, a lost restic password and loss of the original
   host. Record whether recovery is complete, partial, refused or manual for
   each case.
7. Run the privacy deletion procedure across the live DB, backup mirror,
   restic snapshots and restored copy; inability to delete or expire history is
   a policy result, not a hidden limitation.

### 7.3 Physical iPhone/WebKit

Do not expose the frozen visual exporter to real content before its input and
restore boundaries are redesigned. If a disposable fixed candidate is later
approved, use synthetic chats and name the exact visible interaction:

1. From the character grid, favorite, hide and sort synthetic characters;
   cold-close the home-screen app, reopen it and verify visible membership,
   default canonical order and deleted-character cleanup.
2. Create more than 50 synthetic sessions, search for an older session, and
   verify whether the result exists and whether unloaded snippets are empty or
   privacy-filtered.
3. Open a long synthetic chat, switch the visible initial/additional render
   controls, move between characters, background/foreground the app and record
   scroll position, missing messages, input responsiveness and reload state.
4. In a compacted chat, press “this message only” and “from here” on a message
   with a known stable ID; save TXT/Markdown, reopen the files in iOS Files and
   compare the first/last IDs and text to the tapped messages.
5. Disable connectivity before any optional media load and verify that the
   visible export remains cancellable, shows a bounded error and does not leave
   a permanent progress overlay or partial mislabeled file.
6. Repeat save/open after an app switch and after a cold relaunch. Record each
   scenario independently; one successful file does not qualify the others.

These are user-function scenarios, not a request to test HJ01/HJ03/HJ04 again;
their current adaptation L3 is already closed.

### 7.4 HJ07 performance and scale

1. Capture a synthetic or explicitly approved anonymized workload representing
   the actual client-only path; exclude ordinary BG sends from the benefit
   baseline.
2. For token, non-recursive lore, recursive lore and vector stages separately,
   compare browser-only and Node-assisted end-to-end observations with identical
   inputs and outputs.
3. Measure client responsiveness together with Node event-loop delay, concurrent
   generation latency, memory, warm/cold index cost and request-body size.
4. Abort at each stage and verify no late result, stale index, second snapshot
   owner or fallback divergence.
5. Repeat with unsupported tokenizer, custom/local provider, invalid regex,
   restart and index-revision change.
6. Admit one stage only if its user-visible path improves without moving the
   stall or availability cost to other sessions. A microbenchmark alone does
   not satisfy this gate.
