# PocketRisu Kei overlap-equivalence audit

## Metadata and frozen revisions

- Audit opened: 2026-08-02 KST.
- Phase 5 user review: 2026-08-02 KST. The user accepted bounded overnight completed-result survival and the fresh-snapshot destructive-restore safeguard. This records policy only; it does not authorize implementation.
- Audit authority: `docs/POCKETRISU-KEI-OVERLAP-AUDIT-INSTRUCTIONS.md` (597 lines, read completely before source work).
- Patcher checkout: `codex/pocketrisu-1.9-rebase` at `2991355734cf56df91466f96873213dba6b9442d`.
- Patcher remote: `origin=https://github.com/danso0429/pocketrisu-personal-patches.git`.
- Patcher opening status: user-owned modifications in `docs/POCKETRISU-1.9-SESSION-HANDOFF.md` and `docs/POCKETRISU-KEI-INTEGRATION-STATUS.md`, plus the untracked audit instruction. No runtime, manifest, patch payload, or generated-installer change was present.
- A, official PocketRisu 1.8.1: commit `63832a138c14cc7f11364cf7efdcb61950e7894c`, tree `5298d6f83bfd8131744adb65a46e6fe8f3feea8b`.
- K, frozen PocketRisu Kei: commit `cc1d1b195babd887577ebf943d5e82f01f58135c`, tree `e3e848052757f86a33e6a083b28e477a8f8afabb`.
- U, official PocketRisu 1.9.0: commit `85a65f3137b45c8de4a8d21a9887be213b1ac3fc`, tree `7cf334278e578210881c6b34be32964b40bf3ad4`.
- Frozen source remotes: official A/U objects came from `https://github.com/PocketRisu/PocketRisu.git`; K came from `https://github.com/seto-sama/PocketRisu-Kei.git`. Disposable `/tmp` checkouts are lookup aids, not revision authority.
- Complete changed-path domains: `K-A` has 582 paths and SHA-256 `246dedeeb8bc5b7838ea50e57877a7861dd09623873b1cc8430cea65b2691c2c`; `U-A` has 297 paths and SHA-256 `422541878036db9a9073e6694f8488c55fbc5e2b42f11a6f3296e50b57159d2c`.
- Preserved K12 worktree: `codex/pocketrisu-kei-integration` at `081a32ba4ae27c8f25f1719ef90406504a490928`; 31 staged paths, +4,696/-15, unstaged paths 0. Index listing SHA-256 is `632b6d3285e85650be19efe5c4f6c70a3af56fdec683fc9a5a182505118704b3`; cached binary diff SHA-256 is `916440ab240e0f7541844f0082ce53d1d5f516d08ea1bdfc79a55149d7ca66a9`. It was not reset, unstaged, amended, rebased, or edited.
- C was freshly reproduced in a disposable clone of U by running `node src/cli.cjs apply --root <candidate> --all --json` from patcher HEAD `2991355`. Exit status was 0. A complete zero-change re-plan parsed successfully with JSON SHA-256 `158f23f8e13218208996932c065efb9cf48376981746d04b1d6eb32fab229b00`: 11 requested packs, 24 resolved packs, 475 units, four ordered collisions, compatibility `verified`, zero changed files, and 199 skipped/current transaction files.
- C's post-apply Git domain contains 73 modified tracked paths and 126 untracked owned paths. The complete status domain has 196 porcelain entries because Git collapses some untracked directories; its SHA-256 is `eb51375015373c83777db9a1257e27ced9c3688d8ef54f59fd5423632f669963`.
- Phase 3 owner-absent plan: `pocketrisu-kei,toolchain-hardening,preset-integrity,character-organizer,persona-organizer` on pristine U resolved 214 units/74 changed paths. It selected every `*-base-adapter`, no BG/lazy adapter, and one declared persona-organizer internal ordered collision.
- Phase 3 owner-present plan: adding `bg-preserve,lazy-chat-sync` resolved 425 units/173 changed paths. It selected every applicable `*-bg-adapter`, the lazy K16 adapter and `lazy-chat-bg-adapter`, selected no corresponding base adapter, and reported only the three declared lazy/BG ordered collisions plus the persona-organizer internal collision. Both plan commands exited 0 and reported no superseded pack.
- Selected final-host SHA-256 anchors in C: `process/index.svelte.ts` `aeb56952dd72ff3862a59c96672b58d5943288f5337bf197e6065c740ba579cf`; `globalApi.svelte.ts` `d1025bb55d674d47bf1000703ea7bdbb263f5adfdc1d420b69a5b8ca7da3ffcc`; `server.cjs` `8e482e1877ed3a7baff71f324a1071a776e346e3ff5971644949117ca3562454`; `bgOrchestrator.cjs` `e51d91b18251534cab4dc077cc8b99feaf7060f5e3ff0b79d3380cef30100a2`; native `AssetViewer.svelte` `290be633e9d3327980e66af6c4ce008805bf8856082e5caa483e864dcfc5d2df`; native prompt UI `51b2c50d0b37811fe68d1b1b79a0ab9a143d1a2a93c2a667cb30ac42097d7e77`; final persona picker `2def9cca96bc2053169a273fbc70f1287f067b9f2db665ce4336b2474cf13cb3`; final GridCatalog `82b7de1d9dbd86bc382d75ef9cda9f799a18aaa723837f7970fe6cc56677a0d8`.

## Scope and exclusions

This audit covers only frozen Kei capability atoms omitted, delegated, or narrowed because official 1.9, an existing local pack, or their final composition was claimed to provide the same result or the only compatible authority. It also records distinct outcomes embedded in those decisions so that deferral is not mistaken for equivalence.

The retained new deltas of K19, K13, K14, K16, K15, K11, and K12 are not re-audited. K03, K05-K09, K21, K24-K25, later privacy-policy design, later upstream revisions, and pure refactor/layout/branding/deletion are outside this audit. Structural K17 remains in scope only because the catalog explicitly claims existing text-theme behavior.

## Decision-claim inventory

The 30 claims below were discovered before cluster analysis. Source surfaces are frozen `K-A` paths or exact child-host paths; they are not assertions that every file is live.

| Claim | Cluster | Prior decision and anchor | Omitted Kei surface | Claimed replacement | Kind | Receipt | State |
| --- | --- | --- | --- | --- | --- | --- | --- |
| K04-C01 | Prompt roles | Direct port dropped because exact 1.9 owns normalization and UI (`CATALOG:162`; `COMPLETION:27,43-51`) | `botpreset.svelte`, `PromptDataItem.svelte`, `prompt.ts`, `database.svelte.ts`; `role` aliases/defaults/picker/request roles | Official 1.9 `PromptRole`/`role2` | Native equivalence | `K04-PROMPT-ROLES.md` | corrected: native data only |
| K04-C02 | Prompt roles | Create/delete/import/restore/active-index invariants merge into the existing owner (`CATALOG:125,162`) | preset creation/deletion/import/restore/selection/empty-list effects | `preset-integrity` plus native preset UI | Composed coverage / duplicate authority | `K04-PROMPT-ROLES.md` | confirmed |
| K17-C01 | Text theme | PocketRisu and API-v3 already expose text-theme behavior (`CATALOG:138`) | `textTheme.ts`, display settings, chat/parser application, plugin API | Official 1.9 plus API-v3 | Native/composed equivalence | `K17-TEXT-THEME.md` | corrected: normalization missing |
| K20-C01 | Character organizer | Existing folder/order authority forbids a second Kei schema (`CATALOG:141`; `COMPLETION:28`) | `MobileCharacters.svelte`, `GridCatalog.svelte`, character order/folder state | `character-organizer` | Local superset / duplicate authority | `K20-K22-ORGANIZERS.md` | confirmed; surface corrected |
| K20-C02 | Character organizer | Missing search/recent/view controls deferred to the existing owner (`COMPLETION:28`) | search, recent, list/grid and picker presentation atoms | Future owner-local delta; absent from current C unless native | No-missing-outcome / intentional deferral | `K20-K22-ORGANIZERS.md` | corrected: native + two missing views |
| K22-C01 | Persona organizer | Existing folder/order/normalization/import-export owner remains canonical (`CATALOG:143`; `COMPLETION:29`) | `listedPersona.svelte`, `PersonaSettings.svelte`, `PersonaBind.svelte`, persona order/folder state | `persona-organizer` | Local superset / duplicate authority | `K20-K22-ORGANIZERS.md` | confirmed |
| K22-C02 | Persona organizer | No concrete missing presentation outcome required a current unit (`COMPLETION:29`) | persona search/list/grid/picker presentation atoms | Future owner-local delta; absent from current C unless native | No-missing-outcome / intentional deferral | `K20-K22-ORGANIZERS.md` | corrected: six missing atoms |
| K23-C01 | Regex/lorebook | Multi-type `types[]` generation schema is canonical and Kei's single-type rewrite is not equivalent (`CATALOG:144,164`; `COMPLETION:30`) | `RegexData.svelte`, regex grouping/list helpers, `scripts.ts`, translator and generation dispatch | `bg-preserve` multi-type schema/paths | Local superset / incompatibility | `K23-REGEX-LOREBOOK.md` | narrowed: schema confirmed, superset rejected |
| K23-C02 | Regex/lorebook | No independently specified missing outcome was found (`COMPLETION:30`) | grouping/editing/import/export/display/translation UI effects | Current C / none claimed separately | No-missing-outcome | `K23-REGEX-LOREBOOK.md` | corrected: five missing atoms; grouped edit/delete/reorder equivalent |
| K26-C01 | Backup/restore | Combined port dropped because 1.9 owns snapshots, restore, full/settings backup and boot prompt (`CATALOG:165`; `COMPLETION:31,53-66`) | `dataRestore/*`, `BootBackupPrompt.svelte`, `SystemBackup.svelte`, server backup UI | Official 1.9 backup/restore owner | Native equivalence | `K26-K30-BACKUP-RESTORE.md` | narrowed: boot snapshot choice missing |
| K26-C02 | Backup/restore | A second complete backup owner would duplicate qualified storage/import authority (`COMPLETION:31`) | flush/queue/cache/ETag/migration/lease/failure paths | Official 1.9 plus lazy/import/storage packs | Composed coverage / duplicate authority | `K26-K30-BACKUP-RESTORE.md` | confirmed |
| K26-C03 | Backup/restore | Manual schedule and selective missing-asset restore are distinct future additions (`CATALOG:165`; `COMPLETION:31,64-66`) | manual snapshot/schedule endpoints and selective missing-asset recovery | No current replacement claimed | Intentional difference | `K26-K30-BACKUP-RESTORE.md` | confirmed |
| K30-C01 | Restore refactor | Broad/legacy restore refactor excluded; helper reuse allowed only through compatible K26 (`CATALOG:151`; `COMPLETION:36-39`) | `dataRestore/index.cjs`, `legacyRestore.cjs`, migration/legacy formats | Official/local restore owners where outcomes exist | Structural exclusion / no-missing-outcome | `K26-K30-BACKUP-RESTORE.md` | confirmed; backup wording narrowed |
| K27-C01 | Request logs | Exact 1.9 claimed to replace bounded storage, caps, masking, retention floor and cursor reads (`REBASE:169-182`; `COMPLETION:32,68-76`) | `requestLogs.cjs`, `RequestLogsPanel.svelte`, request-log store/format and capture hooks | Official 1.9 request-log owner | Native equivalence | `K27-K28-NATIVE-LOGGING-USAGE.md` | corrected: BG path and two UI fields missing |
| K27-C02 | Request logs | Default content capture and expiry policy remain future explicit policy (`REBASE:184-188`; `COMPLETION:32`) | default toggle, content/redaction and age/row policy | Intentional native policy retained | Intentional difference | `K27-K28-NATIVE-LOGGING-USAGE.md` | confirmed |
| K28-C01 | Usage | Exact 1.9 claimed to supply content-free, failure-isolated LLM usage (`REBASE:189-191`; `COMPLETION:33`) | `usageDb.cjs`, `UsagePanel.svelte`, pricing/accounting fields and request hooks | Official 1.9 usage owner | Native equivalence | `K27-K28-NATIVE-LOGGING-USAGE.md` | corrected: BG path missing |
| K28-C02 | Usage | Retention, pagination, toggle decoupling and policy remain future (`COMPLETION:33,68-76`) | retention/query/toggle plus gateway cost/price outcomes | No current replacement for distinct policy atoms | Intentional difference | `K27-K28-NATIVE-LOGGING-USAGE.md` | confirmed |
| K29-C01 | Revenant | `bg-preserve` claimed operation result/claim/ACK, whole-pipeline cancel, reconnect, cold recovery and no-resurrection; no measured missing result (`CATALOG:150,164`; `COMPLETION:34`) | `server/node/revenant/*`, `revenantGeneration/*`, client recovery/materialization/cancel/retention | `bg-preserve` | Local superset / no-missing-outcome | `K29-REVENANT.md` | corrected: ten missing atoms |
| K29-C02 | Revenant | Native jobs and BG are composed by request class with one owner (`REBASE:128-167`) | main/auxiliary transport, recovery, persistence/claim, cancel and boot ownership | Official 1.9 jobs + BG + lazy storage | Composed coverage / duplicate authority | `K29-REVENANT.md` | narrowed by provider/request class |
| K19-C01 | Admitted subtraction | Native AssetViewer claimed grid/search/filter/keyboard/arrows/swipe/adjacent mounting; duplicate viewer retired (`REBASE:115`; K19 receipt `8-21`) | `FullscreenImageViewer.svelte`, navigation helper, `CharConfig` wiring | Official 1.9 AssetViewer | Native superset | `ADMITTED-CHILD-SUBTRACTIONS.md` | source confirmed; two L3 atoms open |
| K14-C01 | Admitted subtraction | Native renderer claimed modes/coalescing/stable mount/raw mode/edit suppression; copied renderer removed (`REBASE:117`; K14 receipt `5-29`) | K14 1.8 mount registry/render host replacements | Official 1.9 renderer plus focused K14 delta | Native/composed coverage | `ADMITTED-CHILD-SUBTRACTIONS.md` | confirmed |
| K16-C01 | Admitted subtraction | Adjacent-character bounds are native (`REBASE:118`; K16 receipt `5-18`) | character navigation boundary patch | Official 1.9 hotkey host | Native equivalence | `ADMITTED-CHILD-SUBTRACTIONS.md` | confirmed |
| K16-C02 | Admitted subtraction | Model-preset import/case is native and dropped (`K16 receipt:8-13,52-59`) | `openModelPresetList` import and `modelSelect` case | Official 1.9 hotkey host | Native equivalence | `ADMITTED-CHILD-SUBTRACTIONS.md` | confirmed |
| K16-C03 | Admitted subtraction | Generic unload confirmation delegated upstream (`K16 receipt:10-18,132-137`) | K16-owned `beforeunload` fallback | Official 1.9 `preload.ts` | Native equivalence / duplicate authority | `ADMITTED-CHILD-SUBTRACTIONS.md` | confirmed |
| K11-C01 | Admitted subtraction | CBS-correct preview and summary-item reroll remain native (`REBASE:120`; K11 receipt `5-18,121-139`) | `processMessageForPreview` correction and summary-item call replacement | Official 1.9 Hypa owner | Native equivalence | `ADMITTED-CHILD-SUBTRACTIONS.md` | confirmed |
| K11-C02 | Admitted subtraction | Filtered search remains native (`K11 receipt:8-18,121-129`) | modal search invalidation/hidden-summary/safe-target fixes | Official 1.9 Hypa modal | Native equivalence | `ADMITTED-CHILD-SUBTRACTIONS.md` | confirmed |
| K12-C01 | Admitted subtraction | Original-text persistent cache key correction consumed from upstream (`REBASE:121`; K12 receipt `31-47`) | `translateLLM` cache-key correction | Official 1.9 translator | Native equivalence | `ADMITTED-CHILD-SUBTRACTIONS.md` | confirmed |
| K12-C02 | Admitted subtraction | Provider request-log fields retained while K12 adds abort (`K12 receipt:31-47,139-143`) | DeepL/DeepLX/Google translation request logging | Official 1.9 logging + K12 request adapter | Composed coverage | `ADMITTED-CHILD-SUBTRACTIONS.md` | confirmed; K27 BG limitation separate |
| K15-C01 | Admitted subtraction | Optimized-stream partial-edit suppression stays native/K14-owned (`REBASE:119`; K15 receipt `5-20,127-135`) | per-message optimized-stream disabled gate | Official 1.9 partial editor + K14 + shared K15 manager | Composed coverage | `ADMITTED-CHILD-SUBTRACTIONS.md` | confirmed |
| K15-C02 | Admitted subtraction | Native screen overscroll class retained (`K15 receipt:17-20,127-133`) | `DefaultChatScreen` overscroll behavior | Official 1.9 screen root | Native equivalence | `ADMITTED-CHILD-SUBTRACTIONS.md` | confirmed |
| K13-C01 | Admitted subtraction | Parser replacement delegates fetch/endpoints/abort/tools/usage/signatures and BG delivery to existing owners (`K13 receipt:5-17,76-90`) | surrounding OpenAI/Google host effects not owned by pure K13 parser | Official provider hosts + BG adapter | Composed preservation | `ADMITTED-CHILD-SUBTRACTIONS.md` | confirmed |

## Coverage summary

The 30 decision claims decompose into 132 capability atoms across eight receipts. Every atom has one primary disposition; two mobile viewer atoms remain observationally unverified.

| Cluster | Claims | Atoms | Dispositions | Evidence limits | Result |
| --- | ---: | ---: | --- | --- | --- |
| K29 Revenant | 2 | 22 | E4 / S1 / C6 / M10 / U1 | reroll/swipe cold presentation remains L3-required | retention policy resolved; other atoms reclassified below |
| K26/K30 backup/restore | 4 | 18 | E7 / S5 / C2 / M1 / D3 | destructive restore/crash injection not run | wording correction proposed; safety policy resolved |
| K23 regex/lorebook | 2 | 12 | E7 / M5 | canonical-row effects and remaining negative paths source-proved | technical reclassification recorded below |
| K04 prompt roles | 2 | 10 | E4 / S4 / M1 / I1 | preset integrity measured; provider call not needed | compatibility correction recommended; lorebook feature deferred |
| K20/K22 organizers | 4 | 16 | E5 / S5 / M6 | pointer drag not re-run | schema-safe enhancement/defer split recorded below |
| K27/K28 logging/usage | 4 | 17 | E7 / S3 / M4 / D3 | no paid provider or user-log mutation | native-owner correction recommended; distinct UI/policy deferred |
| Admitted-child subtractions | 11 | 32 | E21 / C9 / U2 | K19 swipe/accessibility L3 required | aggregate L3 scenarios retained |
| K17 text theme | 1 | 5 | E2 / M3 | K helper measured; DOM path source-proved | compatibility correction recommended |
| **Total** | **30** | **132** | **E57 / S18 / C17 / M30 / D6 / I1 / U3** | final C and all claimed owners inspected | Phase 5 review gate satisfied; L3 limits remain explicit |

Legend: E=`EQUIVALENT`, S=`SUPERSET_PRESERVED`, C=`COMPOSED_COVERAGE`, M=`MISSING_OUTCOME`, D=`INTENTIONAL_DIFFERENCE`, I=`INCOMPATIBLE`, U=`UNVERIFIED`.

## Cross-cluster owner map

- Official 1.9: prompt roles, native backup/restore, request logs/usage, AssetViewer, streaming renderer, selected hotkey/unload/Hypa/translation/partial-edit effects.
- `bg-preserve`: regex `types[]`, ordinary eligible generation orchestration, result/claim/ACK/cancel/recovery.
- Native jobs + `bg-preserve` + lazy storage: request-class composition and durable chat/result boundaries.
- `preset-integrity`: active preset validity; `character-organizer` and `persona-organizer`: canonical folder/order schemas.
- Native request-log schema remains the only logging/usage database owner; the final BG server path currently has no insert adapter.
- Native backup/import remains the only destructive restore owner; missing manual/schedule/selective features do not justify copying K's complete restore service.

## Technical reclassification recommendations

This Phase 5a reclassification separates evidence-backed corrections from optional Kei features. It does not authorize implementation. Any later runtime change still requires user approval and a separate owner-scoped implementation flow.

| Finding / atoms | Reclassification | Recommendation | Preservation boundary | User input needed for classification |
| --- | --- | --- | --- | --- |
| K29-F01 / G03 live token replay | `DEFER_DISTINCT_FEATURE` | Keep completion-only publication; consider live replay only as a later streaming-UX feature. | Extend the BG result protocol; do not copy Revenant transport/state. | No |
| K29-F02 / G06 non-Gemini reroll/continue | `OWNER_LOCAL_CORRECTION_CANDIDATE` | Build the exact provider/request-class matrix, then qualify ordinary reroll/continue through the existing BG owner where the current consumer can be preserved. | Preserve custom/local endpoints, provider overrides, swipe target, cancel, and exact-once materialization. | No; the matrix determines technical scope. |
| K29-F02 / G07-G08/G12 blocking, epilogue, and auxiliary callers | `DEFER_UNTIL_OPERATION_OWNER` | Keep client ownership unless each caller gains an operation-specific completion/epilogue contract. | Do not turn awaited loops or browser-only effects into fire-and-forget work. | No |
| K29-F03 / G13-G15 translation, Hypa, Lua cold consumers | `DEFER_DISTINCT_FEATURE` | Admit separately, if ever, through typed exact-once consumers. | Reuse the BG result protocol; no second generic generation database. | No |
| K29-F04 / G20 restart partial | `KEEP_EXPLICIT_SAFETY_DIFFERENCE` | Keep interruption/error materialization and do not publish incomplete provider text by default. | A partial must never be presented as a completed assistant result. | No; this is the recommended default. |
| K29-F05 / G21 30-minute expiry | `POLICY_DECISION_RESOLVED` | Selected policy: an unconsumed completed paid response must survive an overnight mobile absence. Derive a bounded TTL and byte/row cap during the separate implementation design; do not copy unbounded retention. | Never evict active/claimed work; preserve ACK/idempotency and bounded storage. | Resolved 2026-08-02 KST |
| K29-F06 / G09 reroll cold presentation | `AGGREGATE_L3_GATE` | Add the exact reroll-background-kill-return scenario to the planned final iPhone L3. | Verify overwrite/dedupe and swipe target; do not reimplement from source uncertainty. | No |
| K27-F01 / L02 and U03 BG log/usage delivery | `OWNER_LOCAL_CORRECTION_RECOMMENDED` | Insert server-orchestrated outcomes through native request-log and usage modules. | Honor request-log enablement, masking and byte cap; keep usage content-free/failure-isolated; no second DB. | No; later implementation still needs approval. |
| K27-F02 / L05 platform | `DEFER_DISTINCT_FEATURE` | Keep deferred; client ID already supports correlation and a platform field adds stored metadata. | Avoid unnecessary device fingerprinting. | No |
| K27-F02 / L06 row delete | `OWNER_LOCAL_ENHANCEMENT` | Consider separately as a privacy/UX action, not as part of BG accounting. | Confirm destructive row deletion and retain native bounds/clear-all behavior. | No |
| K04-F01 / P05 frozen typed `.role` | `OWNER_LOCAL_CORRECTION_RECOMMENDED` | Add one-way read/import compatibility for persona, description, author-note, and memory: native `.role2` wins; otherwise normalize K `.role` into `.role2`. | Do not overwrite native data or conflate lorebook semantics. | No |
| K04-F02 / P06 and K23-F03 / L01 lorebook roles | `DEFER_DISTINCT_FEATURE` | Keep block/entry role authoring separate from K-schema compatibility. | If admitted later, define block default versus entry override once in the native lorebook owner. | No |
| K17-F01 / T03-T05 invalid text theme | `OWNER_LOCAL_CORRECTION_RECOMMENDED` | Normalize unsupported values to `standard` at load, preset activation, and runtime CSS boundaries. | Preserve all three official values and API validation; do not reopen broad K17. | No |
| K20-F01 / C06-C07 character presentation | `DEFER_DISTINCT_FEATURE` | Keep deferred; name/selection image tiles and combined recent-note view are presentation variants. | Preserve native views and organizer folder/order state. | No |
| K22-F01 / P04-P06 persona picker coherence | `OWNER_LOCAL_ENHANCEMENT_RECOMMENDED` | Reuse the organizer's existing folder/order state for picker search/filter and selected-folder create/import. | Preserve normalization, referential cleanup, asset cleanup, and unfiled fallback. | No |
| K22-F01 / P07 persona duplicate | `DEFER_DISTINCT_FEATURE` | Keep as a separate convenience feature. | Any later copy must allocate identity and assets without aliasing references. | No |
| K23-F01 / R04 regex same-direction multiplicity | `OWNER_LOCAL_CORRECTION_RECOMMENDED` | During import, merge only into a same-key bucket with disjoint modes; an overlapping mode starts another canonical row. | Keep `types[]` canonical, vanilla export round-trip, order, and repeated execution; add no identity schema. | No |
| K23-F02 / R08 regex search | `DEFER_DISTINCT_FEATURE` | Keep as an optional list filter. R05-R07 are already equivalent through the canonical single row. | Search must remain presentation-only. | No |
| K23-F03 / L02-L03 lorebook quick activation/name edit | `DEFER_DISTINCT_FEATURE` | Keep deferred as authoring shortcuts. | Reuse native activation/name state if later admitted. | No |
| K26-F01 / B05 boot snapshot choice | `DEFER_DISTINCT_FEATURE` | Keep native full/skip; a third snapshot choice is optional. | Reuse the native snapshot owner and disk checks if later admitted. | No |
| K26-F02 / B09 documentation claim | `DOCUMENTATION_CORRECTION_REQUIRED` | Replace “fresh pre-restore backup” with “invokes the five-minute-throttled snapshot helper.” | Do not imply a snapshot was created when throttling suppressed it. | No |
| K26-F02 / B09 restore snapshot guarantee | `POLICY_DECISION_RESOLVED` | Selected policy: destructive restore must obtain a new snapshot. If creation fails, stop and require explicit acknowledgement for that restore before proceeding without it. | Account for disk failure; do not silently treat a throttled/recent snapshot as newly created. | Resolved 2026-08-02 KST |
| K26 B02/B03/B15 and K27 L11/K28 U04-U05 | `KEEP_DOCUMENTED_FUTURE_DIFFERENCE` | Leave manual/scheduled/selective backup, safer log policy, rich accounting, and independent usage policy in their existing future scopes. | Do not use them to reopen current overlap owners. | No |
| CHILD-F01 / K19-A05/A07 | `AGGREGATE_L3_GATE` | Retain the subtraction as source-qualified and run the exact iPhone swipe plus VoiceOver/focus scenarios at final aggregate L3. | No native viewer duplication based only on missing tactile observation. | No |

## Findings requiring user decision

No policy decision remains pending. On 2026-08-02 KST, the user accepted both recommendations:

1. **Completed-result survival:** an unconsumed, completed paid response is expected to survive an overnight mobile absence. Retention must remain bounded; exact TTL and byte/row limits require measurement in a separate implementation design.
2. **Destructive-restore safeguard:** destructive restore must obtain a newly created snapshot. If creation fails, the restore stops unless the user explicitly acknowledges proceeding without that new safeguard for that restore.

All other rows have a technical recommendation above. These policy selections and recommended corrections/enhancements do not authorize implementation; any runtime change starts only after separate user approval.

## L3/runtime observations still required

- K19 native AssetViewer: on an actual iPhone, verify one horizontal swipe advances exactly one image and boundary swipes do not drift; with VoiceOver, verify labels, focus return, and close/arrow touch targets.
- K29 reroll/continue cold presentation: at the planned aggregate L3, start a reroll, background/kill before completion, return, and verify the existing swipe/message target is updated without an appended duplicate.

## Catalog/status/receipt corrections proposed

- K04: limit native prompt-role equivalence to C-native `.role2` data; record missing frozen `.role` migration and lorebook block role.
- K17: keep the broad structural exclusion but split out invalid-value normalization as a concrete missing compatibility behavior.
- K20: remove `SideChatList.svelte` from the character-organizer overlap surface; record that search/recent/view modes are already native, while two presentation combinations are not.
- K22/K23/K29: replace “no concrete/measured missing outcome” language with the exact receipt findings; for K23, also record that canonical `types[]` makes grouped row/edit/delete/reorder equivalent without K's multi-object helper.
- K26/K30: change “pre-restore backup” to “invokes the five-minute-rate-limited snapshot helper”; keep manual schedule/selective restore as future differences.
- K27/K28: restrict exact-1.9 equivalence to foreground/native-job paths and core fields; the server-orchestration path currently drops request-log/usage delivery.
- Admitted-child receipts: retain their subtraction decisions, but do not call K19 swipe/accessibility observed until the listed L3 is performed.

## Final boundary and remaining limitations

Phases 0-4, Phase 5a technical reclassification, and the Phase 5b user review are recorded. The audit closeout gate is satisfied for the mapped scope: 30 `MISSING_OUTCOME`, 1 `INCOMPATIBLE`, 6 accepted/future `INTENTIONAL_DIFFERENCE`, and 3 `UNVERIFIED` atoms remain visible rather than being reported as covered. The two policy questions are resolved above; the three observation atoms remain assigned to aggregate L3.

Fresh measured checks were limited to non-mutating harnesses and contracts: preset integrity (1 file), organizer contracts (2 files), BG contracts (2 files), admitted-child contracts (7 files), K regex grouping harness, and K text-theme normalization harness all exited 0. A candidate Vitest attempt exited 1 only because no local Vitest executable existed and registry DNS failed with `EAI_AGAIN`; no product result is inferred from it.

No runtime code, manifest, generated installer, live tree, patch state, preserved K12 index, user data, push, tag, release, live apply, or restart was changed. Only this master report and the eight receipt files were created by the audit; the opening user-owned documentation changes and audit instruction remain untouched.
