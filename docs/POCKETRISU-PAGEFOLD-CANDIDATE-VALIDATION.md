# PocketRisu PageFold candidate validation receipt

> **Status:** experimental.23 L3 follow-up automatic gate passed; exact-1.10
> catalog remains `under-review` and the revision is safely live; physical
> iPhone L3 has resumed but is not complete
>
> **Date:** 2026-08-26 KST
>
> **Candidate:** `0.2.0-experimental.24`
>
> **Target:** exact official PocketRisu `1.10.0`

## 1. Admission boundary

This candidate implements PageFold as an opt-in ModelPreset transform, not as
a standalone provider. Existing presets remain off. An explicit eligible `on`
request uses PDF from its first request; main, sub, memory, translation,
emotion, and other-aux bindings retain independent `inherit/on/off` overrides.

The advertised and executable PageFold support set contains exactly one route:

- bundled profile `vertex-gemini-native:gemini-37-flash`, profile version 1;
- provider base `vertex-gemini-native`, base version 7;
- native Vertex Gemini endpoint, Google Service Account auth, `global`;
- wire model `gemini-3.7-flash`;
- per-part `MEDIA_RESOLUTION_LOW`, at most eight PDF pages;
- maximum and balanced hierarchy modes.

AI Studio, Vertex medium, OpenRouter, custom endpoints, changed
model/location/profile versions, images, tools, and PocketRisu explicit cache
are not advertised PageFold routes. They resolve a pre-render/pre-provider
blocked reason. Ordinary non-PageFold support for those providers and inputs is
not removed.

The two new packs remain exact-1.10 `reviewing`, so the ordinary generated
installer intentionally fails with `TARGET_REVIEW_REQUIRED`. Only the private
maintainer qualification gate can stage/apply this candidate for L3. This is
not stable verification, a tag, or a release.

## 2. Implementation receipts

The runtime work is split at the owner boundaries defined by the integration
authority:

| Work package | Commit | Result |
| --- | --- | --- |
| F1 route/resolver | `c997944` | one immutable v8 Vertex-low profile, conservative saved-state and role resolver |
| F2 render ports | `a08eb09` | shared binary port contract, authenticated HTTP route, in-process BG implementation |
| F3 final wire | `40ca437` | decoder plus one PDF user turn, PDF-first native Gemini part, final low/profile invariants |
| F4 budgets/retry | `45289ff` | separate source/wire authorities, opaque retry state, same-route retry with no classic fallback |
| F5 UI/persistence | `eb7ca1b` | explicit mode, preset card, six role overrides, effective badges, default/legacy normalization |
| F6 credential import | `afeb0ce` | independent Google Service Account JSON import with compute-then-commit precedence cleanup |
| F7 pricing/metrics/logs | `717b245` | versioned price evidence, signed estimate/actual delta, bounded generation info, SQLite redaction |
| F8 BG composition | `9440e0d` | injected in-process renderer before bundle load; existing operation/claim/ACK/cancel lifecycle retained |

F9 registers `pagefold-model-preset` and hidden `pagefold-bg-adapter`, sets
candidate metadata to `0.2.0-experimental.22`, folds in gate-exposed
type/redaction/a11y corrections and explicit off/persistence assertions,
regenerates the two installers, and records this receipt. It does not move
either pack to `verified`.

No PageFold plugin array is read or written, and no existing plugin secret or
statistics are migrated. The original PageFold `0.1.1` bundle remains a
behavioral reference with SHA-256
`8291b14f7330e8e4fa0438ea12d1e8f125073945d817fe74693fe9030891ef77`;
runtime code is independently implemented.

## 3. Complete graph and installer lifecycle

Observed complete candidate graph:

- 40 resolved packs/adapters;
- 929 ordered units;
- 339 managed paths;
- `pagefold-model-preset` and `pagefold-bg-adapter` are the only two
  `under-review` packs;
- immediate repeated plan: 0 units, 0 changed files, 339 skipped/current
  files.

Generated-installer behavior was exercised on a fresh exact-1.10 tree:

1. ordinary `apply` stopped with `TARGET_REVIEW_REQUIRED` and the conflict
   report recorded `live source files changed: false`;
2. maintainer qualification applied the complete 40-pack graph;
3. generated `status` reported `current` and the repeated generated plan
   reported zero changes;
4. generated `revert` returned to clean/empty intent;
5. all 1,426 official baseline files were hashed and mode-checked after
   revert: missing 0, byte mismatches 0, mode mismatches 0.

The final two consecutive installer builds were byte-identical. Both the
primary installer and `all` compatibility alias are mode 0755, 7,832,633
bytes, CJS syntax-valid, and SHA-256
`27e636134791232e1f9a0b108a98696e2f7cf2a9e22ab8ac9e37eef09a2f7f0b`.

A clean frozen offline dependency install previously resolved all 493
packages from the local store with zero downloads. The final target refresh
also completed with an unchanged lockfile, reusing 121 packages and
downloading zero.

## 4. Automatic test and build observations

| Gate | Observed result |
| --- | --- |
| Patcher source | 46/46 test files passed |
| PageFold client focused | 12 files, 95 tests passed, including the two final explicit lifecycle assertions |
| PageFold-off exact wire | 1 file, 3/3 tests passed; ordinary system/text/image body exact JSON bytes retained, no PDF/media-resolution fields |
| Persistence lifecycle | 1 file, 4/4 tests passed; save -> patch absence -> old 1.10 MessagePack load/save -> reapply retained config/roles |
| PageFold server focused | 9 files, 55 tests passed, 12 provider-call tests skipped by their explicit gate |
| Complete client | 151 files, 1,730 tests passed after the two final explicit lifecycle assertions |
| Complete server | 22 files, 232 tests passed, 12 skipped |
| Compatibility | 10 files passed and 1 file skipped; 74 tests passed, 5 environment-dependent tests skipped |
| Svelte diagnostics | 0 errors, 0 warnings |
| Production client | 7,940 modules transformed; build exit 0; no PageFold a11y warning |
| BG bundle | build/load passed, `sendChat=function`; 8,841,837 bytes; SHA-256 `2814043418e9ab111f5cf5623c5139dc3f45e1f12bd263e76521d35d54cb325f` |

The first non-escalated complete server run was not counted: the sandbox
rejected localhost `listen` with `EPERM`, causing timeouts in three suites.
The same unmodified complete command passed with normal localhost socket
permission and produced the 232/12 result above.

## 5. Content and secret persistence gate

The integrated tests created real temporary `request-logs.db` files through
PocketRisu's native SQLite owner.

- direct, model-job, preview, and error coverage wrote four rows;
- BG delivery wrote one row through the existing native BG request-log bridge;
- input/output usage, provider, model, status, and PDF MIME metadata remained;
- persisted hits were zero for PDF Base64, first/middle/last canonical
  markers, API-key markers, access-token/Bearer markers, private-key markers,
  and `BEGIN PRIVATE KEY`;
- PDF bodies were replaced by a bounded `bytes omitted` description;
- URL query credentials, headers, response/error text, and request bodies pass
  server-side defense-in-depth redaction even if the client copy is malformed.

The feasibility harness's zero-row result is not used as this evidence.

## 6. PageFold-off and ownership preservation

The ordinary route reaches PageFold code only when the pure resolver returns
`kind: on`. The off/blocked paths do not construct canonical bytes, call a
render port, replace the tokenizer, or carry a PageFold wire context. The
separate exact-body regression freezes an ordinary Gemini system/text/image
request as one exact JSON string and proves no `application/pdf` or
`mediaResolution` field appears.

When on, the canonical input is the final ordinary `AdapterChatMessage[]`
after replacer, request trigger, reformater, and ordinary conversion. The
timer is created before canonicalization/rendering, so PDF preparation is
included in elapsed request time. Retry state retains the exact source
messages, canonical/PDF result, config snapshot, and start time; every
PageFold failure policy sets `allowClassicFallback: false`.

`preset.maxContext` remains the source-plus-output assembly authority. The
known 1,048,576-token profile context is a separate wire authority, with the
v8-observed `266 * pageCount` media term plus exact decoder/user text and a
600-token conservative overhead. User-owned production output reserve,
response MIME/schema, streaming, headers, and generation parameters remain
outside the v8 harness constants.

## 7. L2.5 runtime audit

### Phase 1 — flat external-effect leaves

- ModelPreset and binding database writes;
- Google Service Account file read and credential/project update;
- source tokenizer and Hypa/source assembly accounting;
- canonical UTF-8 allocation;
- browser HTTP render request;
- server font download/cache read/write and integrity check;
- in-process PDF render allocation;
- PDF Base64 allocation only at the final Gemini adapter boundary;
- Vertex OAuth exchange and provider request;
- request preview and SQLite request-log writes;
- generation-info/chat persistence;
- same-route retry scheduling;
- request cancellation and abort propagation;
- BG operation/result/claim/ACK/cancel/recovery state;
- patch state/intent writes and managed source mutation;
- dependency installation and client/BG build artifacts;
- process restart and served-asset effects during live delivery.

### Phase 2 — anchors and adversarial resolution

| Leaf/claim | Current owner anchor | External anchor or break test | Resolution/limit |
| --- | --- | --- | --- |
| Final-message transform | `requestModelPreset` constructs ordinary messages, then `resolvePageFoldState`, source state, and `preparePageFoldWire` | serializer rejects malformed grammar and repeats byte-identically; fake records stay content | tools/cache/images and stale route snapshots block before render |
| Browser/BG render identity | `PageFoldRenderPort`, `getPageFoldRuntimeRenderPort`, HTTP route, `createPageFoldBgRenderPort` | focused differential hash/metadata and abort tests | browser uses authenticated binary HTTP; BG injects the in-process port before bundle import |
| Renderer integrity | `createPageFoldPdfService`, `pageFoldFontCache`, independent `pageFoldPdfReader` | exact extraction, first/middle/last columns/pages, corruption/abort/singleflight/resource tests | pinned font version/hash; in-memory PDF; eight-page and byte ceilings |
| Qualified provider wire | `resolvePageFoldQualifiedRoute`, `previewGoogleChatRequest`, final Gemini invariant | v8 L1-L4 support receipt; custom medium/cache/profile/model/location attacks | one native Vertex global low route only; no support inferred from price |
| Off-path preservation | `pageFoldState.kind === 'on'` caller branch and `toUserParts(..., pageFold)` | exact ordinary system/text/image JSON string; complete 1,730-test client suite | no PageFold tokenizer, canonical bytes, render, document, or fallback state while off |
| Budget/retry | `resolvePageFoldSourceBudget`, final canonical recount, `pageFoldFailurePolicy`, outer request loop | page/output/source/wire failures, live-preset mutation, exact-PDF retry tests | same-route retry only; classic fallback always false once PageFold state exists |
| Credential handling | `prepareServiceAccountImport` plus existing `parseServiceAccountJson` | wrong type/size/MIME/token URI/private key and compute-before-commit tests | 262,144-byte limit; direct mode clears stale pool/inline precedence; no plugin write |
| Redaction/logging | client structural redaction plus `normalizeEntry` defense in `request-logs.cjs` | actual five SQLite rows with deliberate PDF/canonical/key/token/private-key markers | usage metadata retained; content/credentials omitted from all covered routes |
| Saved-state lifecycle | `applyModelPresetDefaults`, role normalizer, generic 1.10 MessagePack codec | explicit old-runtime load/save regression plus full patcher revert comparison | absent stays off; malformed enabled intent remains blocked; old optional fields reconnect |
| BG lifecycle | existing `bgOrchestrator` injects the port, generated bundle reuses request owners | 172 BG client lifecycle tests in the complete suite, 28 focused BG server tests in server suite, bundle load | no second operation owner; existing claim/ACK/cancel/no-resurrection semantics retained |
| Patcher admission | catalog/resolver/manager transaction owners | ordinary fail-closed, maintainer apply, zero plan, generated revert, 1,426-file hash/mode comparison | candidate only; both PageFold packs remain `reviewing` |

Adversarial review found and corrected five candidate-local issues before this
receipt: owner anchors that depended on their own inserted markers, URL query
redaction that retained a generic sensitive value, an incomplete multiline
request-result type, an unassociated Svelte label, and the lack of a named
PageFold-off byte assertion. Re-run results above include those corrections.

### Phase 3 — triage

- **Q1/Q2:** no unresolved automatic-admission defect remained after the
  corrections and complete reruns above.
- **Q3 resolved:** the five issues named above were fixed and their focused or
  complete gates rerun.
- **Q4 prepared surfaces:** physical iPhone Files import, mobile binding UI,
  first integrated paid production response, natural long-context recall,
  iOS suspend/return before and after BG handoff, streaming display, blocked
  image/route UI, and live rollback with user-saved settings require the
  section 22.3 physical scenarios. They are not relabelled as automatic
  passes.

## 8. Live application receipt

### 8.1 Preflight and rollback boundary

Immediately before mutation, PM2 reported PocketRisu `1.10.0` online at
restart count 6, unstable restarts 0, and active HTTP requests 0. Native model
jobs were 48 done / 2 terminal-aborted with active 0; pending sends were 0.
All 132 durable BG operation states were `delivered`; operation, legacy, and
sub-result payloads were 0. One retired background-import row remained
`receiving`; it was preserved without resume, cancellation, or deletion.

Main, model-job, request-log, and import-job SQLite each returned
`quick_check=ok`. Their preflight inode/size pairs were:

| Database | Inode | Bytes |
| --- | ---: | ---: |
| main `risuai.db` | 786453 | 2,710,347,776 |
| `model-jobs.db` | 872636 | 94,208 |
| `request-logs.db` | 872639 | 279,552,000 |
| `import-jobs.db` | 875700 | 4,096 |

Three backup files retained 3,002,439,949 aggregate bytes. Nested `save/save`
and a patch transaction journal were absent. The existing 38-pack state was
769 units / 280 paths with rolling `all` intent. The PM2 error log was 139,796
bytes. Served/local `index-KSLKghfQ.js` matched at 2,037,436 bytes and SHA-256
`ca827add42ba4e420bcde31dd4c20efce45db746671d22104368d0a32cd19734`;
served/local build stamps matched at
`1.10.0-2f217022cef8b40cdf4907183f50854adf281cb7e7f93af0ab1bc3d19fab967d`.

The recoverable application-only rollback
`risuai-nodeonly-pre-pagefold.20260826-033209` contains 1,613 files /
326,632,958 bytes. It excludes `save/`, `backups/`, and `node_modules/`, and
retains separate mode-0600 copies of the old patch state and intent.
Representative live/rollback `server.cjs` and `package.json` hashes matched.

### 8.2 Process-first apply and stopped-tree gate

After a second active-work read returned the same zeros, PM2 was stopped before
source writes. Maintainer qualification transactionally changed 73 runtime/test
paths plus patch state and lockfile/package dependency paths, producing the
40-pack / 929-unit / 339-path review graph. State and intent remained mode
0600; no transaction journal remained. Frozen offline install added 115
packages, reused all 115, and downloaded zero.

The first stopped-tree Svelte check found one candidate-test typing defect:
the new ordinary-image regression omitted required `AdapterImagePart.kind`.
Commit `4f2853e` added `kind: image`, regenerated the installers/receipt, and was
pushed before restart. Reapplying changed only that test and patch state.

The corrected stopped live tree then observed:

- Svelte diagnostics 0 errors / 0 warnings;
- 151 client files / 1,730 tests passed;
- 22 server files / 232 tests passed with 12 explicit skips;
- 10 compatibility files passed and one skipped, with 74 tests passed / 5
  environment-dependent skips;
- 7,940-module production client build;
- BG bundle build/load with `sendChat=function`;
- production dependency prune followed by server syntax, `pdf-lib`,
  `@pdf-lib/fontkit`, and exact BG preload/load checks;
- current 40-pack / 339-path status and immediate zero-change generated plan.

The final live BG bundle is 8,841,657 bytes with SHA-256
`815fb1cb207fa892d391407d2e5d2dbb9b12bbf8b19b877678ee12d41705325d`.

No paid provider call was made during live application. A provider-free live
renderer prewarm downloaded/verified the four pinned font/license assets at
mode 0600 under a mode-0700 cache. Their SHA-256 values exactly matched the
manifest. A one-page 9,476-byte PDF with SHA-256
`51a969958f80ad3cf45c0250e7cca8eb756fcbc274c112ac2019b93cc27e0ed2`
then passed independent PDF.js exact extraction.

### 8.3 Restart readback

After restart, PM2 reported PocketRisu `1.10.0` online, restart count 6,
unstable restarts 0, and active requests 0. Root returned HTTP 200. The
unauthenticated BG cache route returned 401; the new PageFold render route and
native request-log route both returned the existing JSON
`{"error":"No auth header"}` at 400 before work.

Served/local artifacts matched exactly:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| main `index-wve4U1kR.js` | 2,050,340 | `350771d3b01fdb96f6b1c79511d3ff8afdf0e9d37f1bf46e7f108b9832cfee81` |
| PageFold runtime `database.svelte-CriJX37Y.js` | 2,445,558 | `8ca43f01ff3c22062d9412e7d09803dc91cf9d58f71b0028a0b34e4635b34362` |
| language `lang-Cblq1YJz.js` | 888,549 | `1c7803cbfa6bf3024914d5d5ecdfed641fff82263469788ea794aeeb2c9a0565` |

The runtime/language chunks contained the qualified route, fixed low enum,
and PageFold UI markers. Served/local build stamps matched at
`1.10.0-3a8997df6f72918b22203453b6bc171723d4b855acc808784ed1e091e0d4f9ae`.

All four SQLite databases again returned `quick_check=ok`. The four DB
inode/size pairs, three backup inodes/bytes, 132 delivered BG states, zero
native/pending/result work, preserved retired import row, and absence of nested
save/transaction journal matched preflight. The PM2 error log remained exactly
139,796 bytes for a zero-byte delta. The stdout delta contained only process
stop/start, localhost probes, and their expected no-auth messages.

The native request-log owner performs one byte-budget rotation at every
startup. It removed seven oldest request-body rows, from 3,916 to 3,909, while
max ID stayed 5,876, no post-preflight row was inserted, and all 5,234 usage
rows remained. The retained body sum is 268,381,853 bytes, just below the
existing 256 MiB limit. This is the unchanged native startup policy, not a
PageFold content write; it is disclosed rather than relabelled as an unchanged
row count.

Final live state:

- candidate catalog and live apply: `0.2.0-experimental.22`, current, 40
  packs / 929 units / 339 paths, PageFold packs still `under-review`;
- physical iPhone L3: pending;
- first integrated paid production request and natural recall: pending as L3,
  not run automatically;
- stable metadata/tag/GitHub release: prohibited until L3 and L4.

## 9. L3 feedback follow-up — experimental.23

The first physical settings review stopped before a provider call and produced
four design corrections. `728dba2` removes secondary preset-card copy and
reworks Service Account import. `dcd4ba0` makes the preset-selected Gemini
model authoritative. No paid request occurred while implementing or testing
this revision.

### 9.1 Revised behavior

- The PageFold card retains one definition, toggle, and `PDF로 보낼 내용`
  selector only. The choices are `시스템 메시지까지 모두` and `일반 대화만`.
- Route status, fixed 3.7 copy, evidence/fidelity disclosure, conflict copy,
  and manual-price controls are absent from the preset card.
- Service Account import is visible only in direct-entry mode, matches the
  secret input at full width / 42px height, and emits one generic top success
  toast. It renders no client email, project, or key ID success line.
- Vertex and Google AI Studio keep the active preset's selected Gemini model.
  The historical renderer profile ID remains a deterministic layout/cache
  protocol identifier and cannot replace the wire model.
- Gemini 3 places low media resolution on the PDF part. Earlier Gemini models
  use global low in `generationConfig`. Final invariants permit exactly one
  family-correct authority.
- Vertex 3.7 global keeps `v8-qualified` evidence. Other selected Gemini routes
  are marked as Google PDF transport and need their own observed L3 semantics.
  OpenRouter/non-Gemini adapters still have no PageFold document wire.
- Versioned price tables, not a manual preset value, own estimates. Unsupported
  provider/region/tier or tiered model prices remain unconfirmed rather than
  receiving an invented zero/default.

Google's current documentation states that Gemini processes inline PDF input,
that per-part media resolution is Gemini 3-only, and that global media
resolution is available to all multimodal models:

- <https://ai.google.dev/gemini-api/docs/document-processing?hl=en>
- <https://ai.google.dev/gemini-api/docs/generate-content/media-resolution?hl=en>
- <https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing?hl=en>

### 9.2 Automatic observations before live reapply

- patcher source: 46/46 files passed;
- focused PageFold: 12 files / 96 tests passed;
- selected-model regressions: Vertex 3.5 URL retained, Gemini 2.5 global-low,
  AI Studio 3.6 PDF-first, and same-timestamp retry model mutation rejected;
- complete client: 151 files / 1,731 tests passed;
- complete server: 22 files / 232 passed, 12 skipped;
- compatibility: 74 passed, 5 skipped;
- Svelte diagnostics: 0 errors / 0 warnings;
- production client: 7,940 modules transformed;
- BG bundle build/load: `sendChat=function`.

Two consecutive experimental.23 installer builds were byte-identical. The
primary and `all` alias are mode 0755, 7,844,116 bytes, CJS syntax-valid, and
SHA-256
`9a26882136bb17d3f6ef39684979a211a297ba7a64018df48ac34cd328a5a4dc`.

The complete graph remained 40 packs / 929 units / 339 managed paths. On a
fresh exact-1.10 tree, maintainer apply reached current, the generated plan
reported 0 changed files / 339 current files, and generated revert restored all
1,426 baseline files with missing 0, byte mismatches 0, and mode mismatches 0.

### 9.3 L2.5 follow-up delta

Phase 1 added four external-effect leaves: preset-selected model resolution,
model-family media placement, model-specific price lookup, and identifier-free
credential-import toast presentation.

Phase 2 traced and attacked them as follows:

- `resolvePageFoldRequestedModel` follows the ordinary body-model mapping and
  profile fallback; Vertex 3.5 and AI Studio 3.6 tests confirm final URLs retain
  those models and contain no substituted 3.7 slug.
- source budget, canonical metadata, retry identity, and adapter context all
  freeze the same selected model. Changing only the model before retry rejects
  the old state even when `updatedAt` is unchanged.
- Gemini 3 admits exactly one per-part low authority. Gemini 2.5 admits exactly
  one global low authority. Custom medium/duplicate authorities fail before
  provider work.
- versioned price lookup keys provider, selected model, location, tier, and
  effective dates. A deprecated manual value is ignored; missing/tiered tables
  remain unconfirmed.
- Service Account success calls the existing top `notifySuccess` owner with one
  generic localized string. The composed component contains no email/project/
  key-ID summary renderer.

Phase 3 found no unresolved Q1/Q2 automatic-admission defect. Q4 remains the
model-specific semantic boundary: only Vertex 3.7 global has frozen v8 evidence;
another Gemini model or AI Studio needs its own observed/approved paid L3 call
and may not inherit that label. OpenRouter/non-Gemini adapters still need an
independent PDF wire.

### 9.4 experimental.23 live reapply

Before mutation, PM2 was online at restart count 6, unstable restarts 0, and
active requests 0. Native active jobs, pending sends, and BG result payloads
were 0; all 132 BG states were delivered. The one retired background-import
row remained `receiving` and was not resumed, cancelled, or deleted. Request
logs were 3,910 rows / max ID 5,877 / 5,234 usage rows. The pre-existing error
log was 139,872 bytes; its last 76 bytes were an unrelated ChatJournal backlog
line and became the new pre-apply boundary.

The `.22` application-only rollback
`risuai-nodeonly-pre-pagefold-exp23.20260826-084101` contains 1,663 files /
328,037,302 bytes, excludes `save/`, `backups/`, and `node_modules/`, and keeps
mode-0600 copies of prior state/intent. PM2 was stopped only after a second
zero-work read. The transaction changed 20 owned/host paths plus patch state.

The stopped live tree passed:

- frozen offline install, 109 reused / 0 downloaded;
- focused PageFold 12 files / 96 tests;
- Svelte diagnostics 0 errors / 0 warnings;
- 7,940-module production build;
- BG bundle build/load and post-prune exact preload/load;
- 40-pack / 929-unit / 339-path current status and zero-change plan.

After restart, PM2 returned online with restart count 6, unstable restarts 0,
and active requests 0. Served/local artifacts matched:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| main `index-DCd-ZeME.js` | 2,047,228 | `b7980ce1b0a3f9a23a235cd54ea754386253826850da0b092808cca78aa11566` |
| PageFold runtime `database.svelte-OYI7US91.js` | 2,449,676 | `38302839748bc7d62520b3fb115d2c8667535506a72cc5926a37d312981e4c80` |
| language `lang-VU744FqG.js` | 885,892 | `1ffdc61248a1a76096f5c1b9d0de34be9385c3a9f94b02f0d535e4931fc6c566` |

Served/local build stamps matched at
`1.10.0-d071516541f2c938f1088757ec95f66dbffbee9eb502b3d77382149c56f5b762`.
The new four Korean UI strings each appeared once; the removed fidelity,
manual-price, and fixed-route copy appeared zero times. The live BG bundle is
8,844,609 bytes with SHA-256
`53cc24fd548f8a600ee2d50a605ba39e4df102246ef7c3915e35758d4bc0157f`.

All four SQLite databases again returned `quick_check=ok`. Main/model/request/
import DB inode-size pairs, 132 delivered BG states, zero active/pending/result
work, the inert import row, request rows/max ID/usage, and the 139,872-byte
error log matched preflight. No provider or paid call and no new request-log
row occurred during reapply. Post-restart patch status is current with a
zero-change 339-path plan.

experimental.23 is ready to restart physical L3. Stable metadata/tag/release
remain prohibited until the revised scenarios and L4 complete.

## 10. L3 credential action order follow-up — experimental.24

While the remaining physical L3 scenarios continued, the user requested one
narrow layout correction: in direct Service Account mode, `이 키 저장` must
appear immediately below `Service Account JSON 가져오기`.

The patch adds one exact Svelte owner that hides the original direct save
action only when `isServiceAccountField` is true. The PageFold import owner then
renders the unchanged save action below the full-width 42px import button when
`hasDirectKey` is true. Other credential types retain their original order.

Observed automatic results:

- PageFold compose/revert test passed;
- exact composed markup order was import then save;
- Svelte diagnostics 0 errors / 0 warnings;
- patcher source 46/46 files passed;
- complete graph current at 40 packs / 930 units / 339 paths with zero-change
  next plan;
- two deterministic mode-0755 installers, 7,845,294 bytes, SHA-256
  `f76678745fbfbffeb411795364e389d17c5721ad5ea2f36e55b0c052f0a1ad8b`.

No provider call was made. Commit/push and live apply remain, with restart
deferred while physical L3 activity may still be in progress.
