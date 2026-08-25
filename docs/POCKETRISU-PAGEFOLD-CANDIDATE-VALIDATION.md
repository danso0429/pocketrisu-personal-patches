# PocketRisu PageFold candidate validation receipt

> **Status:** automatic candidate gate passed; exact-1.10 catalog admitted as
> `under-review`; live apply and physical iPhone L3 remain separate
>
> **Date:** 2026-08-26 KST
>
> **Candidate:** `0.2.0-experimental.22`
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

## 8. Live and stable state

The automatic candidate gate permits a safe experimental live apply. Before
that mutation, the running native/BG work, database integrity/identity,
request logs, patch intent/state, build stamp, served asset, and error-log
boundary must be captured read-only. Active work is never cancelled; the
process is stopped first only after the work state is safe.

This receipt will record the observed live delta after apply. Until then:

- candidate catalog admission: automatic gate passed locally;
- candidate live state: not yet applied;
- physical iPhone L3: pending;
- stable metadata/tag/GitHub release: prohibited until L3 and L4.
