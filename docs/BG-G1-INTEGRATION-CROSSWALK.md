# G1 integration crosswalk

Integration input is pinned to `9259550..1feca1d`: **191 commits, 47 ordered units**. This is a documentation/review index, not a new implementation, test pass or stable release.

## Reading rules

- Order follows the current canonical commit ancestry, not G1 numbering, retrospective filename dates or candidate version alone. This is commit/integration order; work may have started earlier on another branch, as with G1.12b before CAP delivery. The pinned range has no merges. Source edits preceding a packaging bump belong to their actual implementation unit.
- Units distinguish current behavior from repaired/reverted intermediate behavior. Historical hostOFF and incomplete checkpoints remain historical; later observations do not rewrite their original results.
- Implementation, synthetic execution, actual-provider execution, user phone observation, delivery and admission are distinct evidence. A linked source/test is not a new runtime pass.
- The private workspace records were used as process references. Raw records, personal deployment details, credentials and runtime evidence are not republished here. Public rows link existing sanitized validation documents. Early units with only baseline mentions were checked against canonical commits and their own validation documents.
- README keeps its existing detailed checkpoint narrative; this index supplies order and current interpretation. Stable remains v0.2.3. The candidate remains experimental.50; no runtime/installer changes are part of this integration documentation.

The ledger ends at `1feca1d`. Documentation-only follow-up `478969b` records the user's scoped L5 completion for .49/.50; subsequent documentation commits are outside the 191-commit feature-history snapshot.

Candidate checkpoint numbers below abbreviate `0.2.4-experimental.N`. Commit ranges are **inclusive first-to-last**, not Git revision-selection syntax.

## Ordered implementation units

| Unit | Goal / candidate checkpoint | Canonical commit range / count | Implementation and retained behavior | Later correction or remaining scope | Public evidence |
|---|---|---|---|---|---|
| U00 | G1 foundation/rebase / 5 lineage | `1e6e974..a69f616` / 7 | Guarded server-owned input on the current patcher; retain current-main font/settings work. | Baseline carried into later admission repairs. | [validation](POCKETRISU-G1-CURRENT-MAIN-INTEGRATION-2026-09-27.md) |
| U01 | G1.0 / 6 | `904aea9..2de90c6` / 3 | Repair existing JSON detached admission and retain recovered-answer metadata. | Current baseline; distinct from later plugin support. | [validation](POCKETRISU-G1-0-ADMISSION-RECOVERY-2026-09-27.md) |
| U02 | G1.11 / 7 | `58909ff..874e64d` / 4 | Add opt-in destination-scoped external request header rules. | Retained; .47 automatic completion is removed by .48. | [validation](POCKETRISU-G1-11-EXTERNAL-HEADERS-VALIDATION.md) |
| U03 | G1.2 / 8 | `4bbc135..c193ead` / 2 | Rebase stale chat saves without consuming client views. | Continued-save repair follows in .9. | [validation](POCKETRISU-G1-2-CHAT-SAVE-REBASE-VALIDATION.md) |
| U04 | G1.2 repair / 9 | `a4ae61a..387a427` / 3 | Keep rebased chat views saveable after cache eviction. | Retained; later publication barriers are separate. | [validation](POCKETRISU-G1-2-SAVE-AVAILABILITY-REPAIR.md) |
| U05 | G1.12 initial / 10 | `0d49cd8..0147caf` / 2 | Plan and close finished server operations rather than polling forever. | Failure notices/ACK repaired in .11; broader evidence-led recovery in .22/.24. | [validation](POCKETRISU-G1-12-FINISHED-OPERATION-VALIDATION.md) |
| U06 | G1.12 repair / 11 | `da8f31f..1b29ab5` / 2 | Retain finished-failure notices and qualify ACK outcomes. | Superseded recovery decisions are identified by .22/.24/.36/.39; retained behavior is not replay permission. | [validation](POCKETRISU-G1-12-FINISHED-OPERATION-VALIDATION.md) |
| U07 | G1.1 / 12 | `38f19d3..df0fcc0` / 3 | Append generated answers into the latest chat using anchors and preserve user edits. | Retained; .37 edit notices and .38 publication protection extend it. | [validation](POCKETRISU-G1-1-ANCHOR-COMMIT-VALIDATION.md) |
| U08 | G1.3 / 13 | `11dffcf..6d06524` / 2 | Capture saved chat/settings when generation assembly starts. | Retained; no automatic regeneration after later edits. | [validation](POCKETRISU-G1-3-ASSEMBLY-CONTEXT-VALIDATION.md) |
| U09 | Saved-answer UI / 14 | `43f19f6..a4ae2ab` / 3 | Move saved-answer feedback to upper notifications. | Retained; separate from later request-progress cards. | [validation](POCKETRISU-BG-SAVED-ANSWER-NOTICE-VALIDATION.md) |
| U10 | G1.5a selection / 15 | `b820d1d..6001c46` / 2 | Share actual model/binding/fallback selection with input preflight and recheck attached input settings. | Preserve custom endpoints, static overrides and native retry/fallback semantics. | [validation](POCKETRISU-G1-5-REQUEST-POLICY-VALIDATION.md) |
| U11 | G1.5a context / 16 | `72e0ce4..e872d3b` / 2 | Give input trigger/editinput the same operation abort, header identity and Node context as main. | Retained; this alone does not widen native admission. | [validation](POCKETRISU-G1-NATIVE-INPUT-CONTEXT-VALIDATION.md) |
| U12 | G1.5a admission / 17 | `d5ee993..ca3473b` / 2 | Qualify native preset/module/custom input and explicit app preparation for unsupported operations. | Keep typed stop/raw-input preservation, revision-kind separation and explicit paid retry notice. | [validation](POCKETRISU-G1-NATIVE-ADMISSION-VALIDATION.md) |
| U13 | G1.4 / 18 | `5f58802..ee00096` / 2 | Gate queued Send, reroll/continue and cancellation by actual server activity. | Retained; Stop remains scoped to one operation. | [validation](POCKETRISU-G1-4-QUEUE-VALIDATION.md) |
| U14 | G1.8 foundation / 19 | `f66fac1..4c6fb4a` / 2 | Persist/deliver unsupported-input failure notices and their acknowledgements. | Extended to v3 request-failure/interruption/edit notices in .35. | [validation](POCKETRISU-G1-8-NOTIFICATION-FOUNDATION-VALIDATION.md) |
| U15 | G1.6 / 20 | `5f39da8..0ce1086` / 6 | Add per-plugin per-operation OS-isolated sessions, generic APIs, storage and mandatory failure handling. | Initially default-OFF; original-plugin qualification and later controlled ON are separate. | [WIP record](POCKETRISU-G1-6-PLUGIN-HOST-WIP.md) |
| U16 | G1.12a measurement / 21 | `e3ddeb7..e0bece4` / 3 | Temporarily observe bounded recovery timing without changing decisions. | Instrumentation removed in .22; capability return regression discovered later and repaired in CAP. | [plan / measured results](POCKETRISU-G1-12A-TERMINAL-RESULTS-PLAN.md) |
| U17 | G1.12a / 22 | `ab14579..055abfe` / 4 | Reconcile actual terminal/current-view/strict-save evidence after suspension; bound control body/snapshot reads. | Old count-based permanent-conflict handling replaced; CAP return fix still needed at this checkpoint. | [plan / measured results](POCKETRISU-G1-12A-TERMINAL-RESULTS-PLAN.md) |
| U18 | CAP / 23 | `3a44a22..7047115` / 9 | Repair return-expression composition and bound/cancel capability, original body and prior-marker reads. | Separate from G2 optional-API typeof discovery; ordinary-use check is scoped. | [validation](POCKETRISU-BG-CAP-ADMISSION-VALIDATION.md) |
| U19 | G1.12b / 24 | `4d7bec8..4bce464` / 7 | Separate terminal recovery from generation busy; gate suggestions on current-chat proof; drain deferred scans. | Preserve old WIP history; latest implementation includes post-review ownership repairs. | [validation](POCKETRISU-G1-12B-RECOVERY-OWNERSHIP-VALIDATION.md) |
| U20 | G1.7 lifecycle/diagnostics / 25 | `0f24c07..d2459fc` / 2 | Qualify original MARP lifecycle with synthetic providers and generic transport diagnostics; pass abort to actual native model transport. | Diagnostics do not establish private analysis quality; this record has no standalone .25 delivery/ON observation. | [validation](POCKETRISU-G1-7-MARP-QUALIFICATION-VALIDATION.md); [qualification plan](POCKETRISU-G1-7-MARP-HOST-QUALIFICATION-PLAN.md) |
| U21 | G1.7 admission / 26 | `a2a3dc6` / 1 | Use actual live host capability before widening plugin input eligibility. | Candidate delivered with .27; no standalone .26 delivery/ON claim. Unknown/stale hints and draft-preserving veto remain. | [validation](POCKETRISU-G1-7-MARP-QUALIFICATION-VALIDATION.md) |
| U22 | G1.7 unavailable host / 27 | `0985716..94694ec` / 6 | Continue supported BG without omitted plugin effects and issue required plugin/version/reason notices. | Delivered with host OFF, not MARP activation. Missing selected plugin providers fail rather than selecting an implicit native provider. | [validation](POCKETRISU-G1-7-OFF-CONTINUATION-VALIDATION.md); [mixed initialization](POCKETRISU-G1-7-M6-MIXED-INITIALIZATION-VALIDATION.md) |
| U23 | G1.7 limits/settings / 28 | `f93c7ff..2f19437` / 7 | Expose recoverable API limit refusals; test original protocol/PDF/OAuth and saved settings. | Keep existing caps, fatal failures and ordinary calls; scoped OFF preservation is not MARP ON qualification. | [validation](POCKETRISU-G1-7-PROTOCOL-BUDGET-VALIDATION.md); [settings](POCKETRISU-G1-7-M4-SETTINGS-VALIDATION.md) |
| U24 | G1.7 proxy/PDF/identity / 29 | `63e783b..78a16c1` / 10 | Preserve form bytes, report worker-local RPC refusal and characterize actual PDF/role/root identity boundaries. | Raw/provider identity work continues in .30/.31; source census is not full feature execution. | [validation](POCKETRISU-G1-7-PDF-PROXY-VALIDATION.md); [role / identity epochs](POCKETRISU-G1-7-ROLE-IDENTITY-EPOCH-VALIDATION.md) |
| U25 | G1.7 context omission / 30 | `7b2854e..f735cef` / 4 | Omit invalid non-provider contexts with canonical identity checks and safe cache recovery. | Preserve earlier effects; selected-provider/identity failures still stop. Raw selected-provider admission follows in .31. | [validation](POCKETRISU-G1-7-CONTEXT-OMISSION-VALIDATION.md) |
| U26 | G1.7 raw provider / 31 | `0b75e5d..b52bc9c` / 4 | Require actual healthy registration/ownership before raw selected-provider execution. | No implicit default model; ambiguous/failed providers rejected. | [validation](POCKETRISU-G1-7-RAW-PROVIDER-VALIDATION.md) |
| U27 | G1.7 handles/callers / 32 | `0d2e882..690bca0` / 4 | Restore unpublished refused RPC resources and verify actual v2/Lua auxiliary caller roles/storage. | No whole-realm or consumed-stream reuse claim; detailed rejected operational publication stays private. | [validation](POCKETRISU-G1-7-HANDLE-CALLER-VALIDATION.md) |
| U28 | M7 preparation / 32 unchanged | `ae2ece9..ac24278` / 4 | Connect goal subplans and verify unchanged installed-original combinations through actual HTTP admission. | Probe/docs-only checkpoint; no new runtime or general plugin admission. | [validation](POCKETRISU-G1-7-INSTALLED-COMBINATION-VALIDATION.md) |
| U29 | M7/G1.5b / 33 | `f64d0ec..1bf28c5` / 2 | Support original provider font/cache/bookkeeping and accepted callback-RPC settlement under measured resource contracts. | Later .34 fixes lifecycle edges; startup recovery warning remains open until G1.8 work. | [validation](POCKETRISU-G1-7-M7-QUALIFICATION-VALIDATION.md) |
| U30 | M7 post-review repairs / 34 | `58e7462..85cd2f9` / 13 | Repair settlement warning, large-transfer cleanup, legacy receipts, shared exports and teardown admission. | Retain accepted RPC-chain semantics, not arbitrary future timer completion. | [validation](POCKETRISU-G1-7-M7-QUALIFICATION-VALIDATION.md) |
| U31 | G1.8 lifecycle / 35 | `b95b946..d0f0501` / 10 | Preserve operation metadata, validate conditional new-journal retirement and deliver v3 failures/interruption/edit notices. | Only qualified new journal entries use approved 49h retirement; old journal bytes remain protected. | [validation](POCKETRISU-G1-8-FAILURE-LIFECYCLE-VALIDATION.md) |
| U32 | G1.8 failed input / 36 | `7dc00bd..0b48497` / 9 | Reproduce blocked next Send, settle exact failed input after no-answer ACK and repair malformed test-statistics evidence. | Current proof/ACK required; partial/unknown/edited/deleted cases are not blindly cleared. | [validation](POCKETRISU-G1-8-VERIFICATION-RECORD-2026-10-11.md) |
| U33 | G1.8 statistics/ACK/edit / 37 | `3603204..e2156a8` / 10 | Validate canonical counters, preserve exact failed ACK through retirement and publish anchored edit notices. | Revision-only publication guard was rejected; pending-publication edit/delete loss still needs .38. | [validation](POCKETRISU-G1-8-VERIFICATION-RECORD-2026-10-11.md) |
| U34 | G1.8 publication repair / 38 | `a646988..f33a0d2` / 3 | Recover committed publication before affected writes; retain dirty edits and show blocked-save when recovery fails. | Current-screen dirty retention is not save across app closure; unrelated writers keep scope. | [validation](POCKETRISU-G1-8-VERIFICATION-RECORD-2026-10-11.md) |
| U35 | G1.8 uncertain input / 39 | `1df5fe1..c325ac8` / 3 | Promote only proven committed uncertain markers into existing hydration/ACK ownership after the original grace. | No new model replay or unconditional marker removal; R7 natural admission phone evidence is scoped. | [validation](POCKETRISU-G1-8-VERIFICATION-RECORD-2026-10-11.md) |
| U36 | G1.9 / 40 | `12f1e46..3740c66` / 9 | Add formatted server-owned stream preview/Stop; fix Node frame scheduling, piping errors, durable-save retry and cancelled input settlement. | Common formatting only; no editdisplay hooks; display teardown does not cancel generation. | [validation](POCKETRISU-G1-9-STREAM-RELAY-VALIDATION.md) |
| U37 | G1.10 combination/Stop / 41 | `6498e32..81529be` / 6 | Qualify original MARP edit/queue/module/restart/provider warnings and expose current Stop during preparation/nonstream generation. | Synthetic integrated evidence, actual-provider/device qualification remains separate. | [validation](POCKETRISU-MARP-BG-POST-IMPLEMENTATION-REVIEW.md) |
| U38 | Wait/Stop UI / 42 | `00e5f8a` / 1 | Move normal preparation/nonstream waiting to the upper status surface and preserve ordinary circle Stop/queue Send. | Yielding to preview and primary title finish in .43. | [current UI / history](../README.md) |
| U39 | Wait title/preview / 43 | `73beb80..49522f6` / 2 | Yield generic waiting to actual stream preview and use server-processing as the primary wait title. | Higher-priority relayed cards need .44; no broader device pass inferred. | [current UI / history](../README.md) |
| U40 | Relayed wait follow-up / 44 | `2aa7ba2` / 1 | Fix the actual relayed connecting card title and remove transient composer read-status warnings. | Keep unknown activity conservative and preserve real recovery controls. | [current UI / history](../README.md) |
| U41 | Whole-request progress / 45 | `d82488b..0291eb9` / 2 | Observe request/admission/queue/preparation/model/postprocess/save/adoption/completion in one lifecycle card. | Memory-only presentation; never replaces provider, commit, ACK, recovery or Stop authority. | [current UI / history](../README.md) |
| U42 | Lifecycle kind chip / 46 | `17cfa97..0aa1db1` / 2 | Remove only duplicate parent kind; retain real model details/kind/usage/badges. | Scoped physical confirmation recorded; whole G1.10 remains separate. | [current UI / history](../README.md) |
| U43 | Automatic header experiment / 47 | `834dcc0` / 1 | Add automatic Go conversation-header completion after an incomplete isolated fixture. | REVERTED by .48 because it suppressed configured rules/redirect scoping; not current functionality. | [validation](POCKETRISU-G1-11-EXTERNAL-HEADERS-VALIDATION.md) |
| U44 | Header ownership/G1.10 closeout / 48 | `8adb75f..0729f2f` / 2 | Restore configured header-rule ownership; record isolated actual-provider and phone app-close/save/return observations. | Phone full MARP analysis/injection and latency root cause remain unconfirmed; additional device checks deferred. | [validation](POCKETRISU-G1-11-EXTERNAL-HEADERS-VALIDATION.md); [G1.10 observations](../README.md) / [closeout](../CHANGELOG.md#024-experimental48-restore-external-header-rule-ownership) |
| U45 | Composer height / 49 | `cc0a490` / 1 | Wait for cleared DOM after successful unchanged-draft ACK before measuring height. | Preserve uncertain/rejected/changed drafts; scoped user L5 confirmed on 2026-10-15 in documentation follow-up 478969b. | [validation](POCKETRISU-COMPOSER-ADMISSION-UI-VALIDATION.md) |
| U46 | Composer notices / 50 | `498537d..1feca1d` / 2 | Render only actionable pending notices with a persistent empty live region and full activity/polling. | Scoped user L5 confirmed with height fix; VoiceOver/translated-input UI and separate control gestures unmeasured. | [validation](POCKETRISU-COMPOSER-ADMISSION-UI-VALIDATION.md) |

## Corrections that must not disappear

- Experimental.21 introduced a return-expression composition regression. The .22 recovery work did not fix that return; CAP/.23 did. The temporary measurement code itself was removed, while measured limits and exclusions remain in its plan.
- Experimental.25/.26/.27 are real separate implementation checkpoints. Their earlier absence as standalone changelog headings did not mean they were one .28 implementation.
- Original-provider/RPC tests do not qualify every auxiliary UI feature or all plugins. M7 post-review fixes are a separate unit from its original-provider foundation.
- G1.8 notification-display controls are not failure-producer/next-Send tests. The later .36/.37/.38/.39 units close different failed-input, counter, edit/publication and uncertain-admission boundaries; unknown and partial results retain their fences.
- G1.9 includes supporting Node stream/error/save/cancel fixes, not only a preview component. Preview cap and common-formatting scope do not truncate canonical answers or run arbitrary display hooks.
- Experimental.47 automatic Go headers are removed by .48. Configured destination rules, caller overrides and redirect scoping remain the authority. Do not advertise automatic completion as a current feature.
- The .48 closeout records actual app-close canonical storage and user return separately from incomplete full MARP analysis/injection, unresolved latency cause and deferred physical scenarios. The .49/.50 UI changes do not convert those boundaries into passes.

## Exhaustive canonical commit ledger

Every input commit is assigned exactly once below. Documentation/test/build commits are retained rather than squashed into one feature claim.

| Order | Commit | Unit | Original subject |
|---|---|---|---|
| 1 | `1e6e974` | U00 | feat(bg): integrate guarded server chat input on current patcher |
| 2 | `181bf4e` | U00 | docs(bg): record current-engine G1 qualification boundary |
| 3 | `887f95e` | U00 | docs(g1): record controlled live application and open device gate |
| 4 | `879cac5` | U00 | docs(g1): record nonqualifying preset-mode device send |
| 5 | `59e396d` | U00 | docs(g1): record recovered answer metadata boundary |
| 6 | `dab9602` | U00 | docs(g1): preserve second device send evidence |
| 7 | `a69f616` | U00 | docs(g1): classify manual chat deletion before second send |
| 8 | `904aea9` | U01 | fix(bg): restore JSON transport admission and recovery metadata |
| 9 | `3caed7c` | U01 | docs(bg): record G1.0 live delivery and device gate |
| 10 | `2de90c6` | U01 | docs(bg): close G1.0 recovery and record home navigation issue |
| 11 | `58909ff` | U02 | feat(settings): add destination-scoped external request headers |
| 12 | `c6ed029` | U02 | docs(settings): record external header rules live delivery |
| 13 | `81ef11e` | U02 | docs(settings): record authorized provider probes and activation gate |
| 14 | `874e64d` | U02 | docs(settings): record authorized MARP rule activation |
| 15 | `4bbc135` | U03 | feat(storage): rebase stale chat saves without consuming client views |
| 16 | `c193ead` | U03 | docs(storage): record G1.2 live delivery and remaining anchor work |
| 17 | `a4ae61a` | U04 | fix(storage): keep rebased chat views saveable |
| 18 | `f1a1508` | U04 | docs(storage): record save repair live verification |
| 19 | `387a427` | U04 | docs(bg): record G1.2 device confirmation |
| 20 | `0d49cd8` | U05 | docs(bg): plan client closure of finished server operations |
| 21 | `0147caf` | U05 | fix(bg): close finished server operations on the client |
| 22 | `da8f31f` | U06 | fix(bg): keep finished-failure notices intact and cover ACK outcomes |
| 23 | `1b29ab5` | U06 | docs(bg): record G1.12 delivery and device check |
| 24 | `38f19d3` | U07 | feat(bg): append completed answers to the latest chat |
| 25 | `c197c8a` | U07 | docs(bg): record anchored commit live delivery |
| 26 | `df0fcc0` | U07 | docs(bg): record G1.1 device confirmation |
| 27 | `11dffcf` | U08 | feat(bg): capture current context when generation starts |
| 28 | `6d06524` | U08 | docs(bg): record G1.3 live delivery and pending device checks |
| 29 | `43f19f6` | U09 | fix(bg): show saved-answer feedback as toast notifications |
| 30 | `0e2cb4b` | U09 | docs(bg): record saved-answer toast live delivery |
| 31 | `a4ae2ab` | U09 | docs(bg): close saved-answer notification device check |
| 32 | `b820d1d` | U10 | fix(bg): share model selection and recheck input eligibility |
| 33 | `6001c46` | U10 | docs(bg): record request-policy candidate live delivery |
| 34 | `72e0ce4` | U11 | fix(bg): inherit execution context during input preparation |
| 35 | `e872d3b` | U11 | docs(bg): record native input context live delivery |
| 36 | `d5ee993` | U12 | feat(bg): qualify native input and recover preparation in the app |
| 37 | `ca3473b` | U12 | docs(bg): record native admission live delivery |
| 38 | `5f58802` | U13 | feat(bg): enforce server-aware queued generation controls |
| 39 | `ee00096` | U13 | docs(bg): record queue delivery and browser qualification |
| 40 | `f66fac1` | U14 | feat(bg): persist and deliver input failure notifications |
| 41 | `4c6fb4a` | U14 | docs(bg): record notification foundation live delivery |
| 42 | `5f39da8` | U15 | feat(bg): add per-operation isolated plugin sessions |
| 43 | `914e595` | U15 | feat(bg): connect generic plugin APIs and durable failure handling |
| 44 | `b790e17` | U15 | build(bg): package experimental.20 plugin-host candidate |
| 45 | `b00e878` | U15 | docs(bg): close out plugin-host validation and live delivery |
| 46 | `985731d` | U15 | build(patcher): retain personal-settings 0.5.13 after main rebase |
| 47 | `0ce1086` | U15 | docs(bg): identify the rebased continuation branch |
| 48 | `e3ddeb7` | U16 | feat(bg): observe recovery request timing without changing decisions |
| 49 | `67cdfe1` | U16 | build(bg): package experimental.21 recovery timing candidate |
| 50 | `e0bece4` | U16 | docs(bg): record recovery timing delivery and sampling limits |
| 51 | `ab14579` | U17 | fix(bg): reconcile terminal recovery after suspension |
| 52 | `8240f77` | U17 | docs(bg): record terminal recovery delivery and device gate |
| 53 | `38862da` | U17 | docs(bg): integrate evidence-led capability repair plan |
| 54 | `055abfe` | U17 | docs(bg): retain workspace and compatibility-link handoff |
| 55 | `3a44a22` | U18 | fix(bg): preserve capability return through patch composition |
| 56 | `588046c` | U18 | fix(bg): bound original input-base reads and decoding |
| 57 | `b496872` | U18 | fix(bg): cancel prepared capability negotiation with its owner |
| 58 | `0f0e327` | U18 | fix(bg): bound existing input status before admission |
| 59 | `b55a49e` | U18 | test(bg): qualify CAP admission and native recovery interleavings |
| 60 | `c872a9f` | U18 | test(bg): pin base rejection and Stop transport ownership |
| 61 | `dff28c5` | U18 | chore(bg): package verified CAP correction as experimental.23 |
| 62 | `649eb7c` | U18 | docs(bg): record CAP live delivery and remaining device gates |
| 63 | `7047115` | U18 | docs(bg): close ordinary-use CAP device confirmation |
| 64 | `4d7bec8` | U19 | fix(bg): scope recovery ownership and gate suggestions on current chat proof |
| 65 | `a67a22d` | U19 | build(bg): package recovery ownership as experimental.24 |
| 66 | `08356e6` | U19 | docs(bg): record recovery ownership gates and device checks |
| 67 | `1c59ba1` | U19 | fix(bg): preserve readiness proof and drain deferred draft scans |
| 68 | `73af78a` | U19 | docs(bg): close post-review ownership validation |
| 69 | `e7ada22` | U19 | docs(bg): record safe recovery ownership delivery |
| 70 | `4bce464` | U19 | docs(bg): close G1.12b ordinary-use device validation |
| 71 | `0f24c07` | U20 | docs(bg): define MARP host qualification and observability boundaries |
| 72 | `d2459fc` | U20 | fix(bg): qualify MARP host lifecycle and record transport diagnostics |
| 73 | `a2a3dc6` | U21 | feat(bg): gate plugin input by live host capability |
| 74 | `0985716` | U22 | fix(bg): warn on skipped server plugins without changing model providers |
| 75 | `7745b39` | U22 | docs(bg): record unavailable-host delivery and scoped UI checks |
| 76 | `77012d6` | U22 | docs(bg): record scoped device confirmation and activation limits |
| 77 | `b7568a6` | U22 | test(bg): synchronize queued write authority probe |
| 78 | `7577ac2` | U22 | test(bg): cover mixed plugin initialization boundaries |
| 79 | `94694ec` | U22 | docs(bg): record scoped M6 mixed-host evidence |
| 80 | `f93c7ff` | U23 | fix(bg): report recoverable API limits without hiding terminal failures |
| 81 | `2546b4a` | U23 | test(bg): qualify MARP protocol PDF and OAuth boundaries |
| 82 | `8575f73` | U23 | docs(bg): package experimental 28 and record scoped validation |
| 83 | `440766b` | U23 | docs(bg): record experimental 28 live delivery |
| 84 | `cccdf57` | U23 | docs(bg): close scoped ordinary-use confirmation and outline next checks |
| 85 | `b91cfa2` | U23 | test(bg): qualify original MARP settings across saves and retries |
| 86 | `2f19437` | U23 | docs(bg): record scoped M4 settings evidence and remaining gates |
| 87 | `63e783b` | U24 | fix(proxy): preserve form bytes on authenticated proxy aliases |
| 88 | `1964338` | U24 | fix(bg): report worker-local RPC refusals without losing later calls |
| 89 | `d7b0a35` | U24 | test(bg): compare original native and server PDF boundaries |
| 90 | `dde7b88` | U24 | docs(bg): package experimental29 and record scoped PDF qualification |
| 91 | `c525404` | U24 | docs(bg): record experimental29 live delivery and pending device check |
| 92 | `36d9e76` | U24 | docs(bg): close experimental29 ordinary-use iPhone gate |
| 93 | `a203ee9` | U24 | test(bg): characterize separate root and plugin identity epochs |
| 94 | `43f2c30` | U24 | test(bg): compare original native and server role predicates |
| 95 | `657a6e8` | U24 | test(bg): observe actual assembly identity refresh and store |
| 96 | `78a16c1` | U24 | docs(bg): record pre-M7 context boundaries and pending outcome choice |
| 97 | `7b2854e` | U25 | fix(bg): omit invalid contexts with canonical identity and safe cache recovery |
| 98 | `807c5f9` | U25 | test(bg): verify actual context omission and provider ownership |
| 99 | `fff10fd` | U25 | docs(bg): record experimental30 context contract and remaining admission |
| 100 | `f735cef` | U25 | docs(bg): record experimental30 live readback and rollback retention |
| 101 | `0b75e5d` | U26 | fix(bg): admit raw providers with healthy registration ownership |
| 102 | `5b3f1c0` | U26 | test(bg): verify raw provider admission through actual callers |
| 103 | `d204812` | U26 | docs(bg): record raw provider qualification and remaining gates |
| 104 | `b52bc9c` | U26 | docs(bg): record verified raw provider live delivery |
| 105 | `0d2e882` | U27 | fix(bg): restore rejected RPC handles before later calls |
| 106 | `855ece3` | U27 | test(bg): verify actual auxiliary caller roles and storage |
| 107 | `b6588c2` | U27 | docs(bg): record handle reuse and caller qualification |
| 108 | `690bca0` | U27 | docs(bg): record delivery status without operational details |
| 109 | `ae2ece9` | U28 | docs(bg): schedule verification within goal subplans |
| 110 | `70f9c17` | U28 | test(bg): qualify installed original plugin combinations |
| 111 | `debf786` | U28 | docs(bg): record scoped installed combination evidence |
| 112 | `ac24278` | U28 | test(bg): verify observations after result and host closure |
| 113 | `f64d0ec` | U29 | feat(bg): qualify original provider cache and bookkeeping ownership |
| 114 | `1bf28c5` | U29 | docs(bg): close M7 qualification and recovery handoff |
| 115 | `58e7462` | U30 | fix(bg): isolate settlement warning ownership |
| 116 | `d2e15db` | U30 | fix(bg): release refused large transfer ownership |
| 117 | `721d141` | U30 | fix(bg): report settlement through callback replies |
| 118 | `856e236` | U30 | fix(bg): verify legacy terminal receipt roles |
| 119 | `c355ee4` | U30 | fix(bg): await plugin lifecycle activity without polling |
| 120 | `bf81eaf` | U30 | fix(bg): retain proven legacy receipt ownership |
| 121 | `67671d8` | U30 | fix(bg): restore exports refused before decoding |
| 122 | `bf8b06e` | U30 | fix(bg): reject results during host teardown |
| 123 | `6c0479a` | U30 | chore(bg): package M7 lifecycle repairs candidate |
| 124 | `b7d0984` | U30 | test(bg): verify receipt backfill rollback |
| 125 | `0265ddf` | U30 | fix(bg): preserve shared exports across refused publications |
| 126 | `ed7fd5f` | U30 | docs(bg): record M7 lifecycle repairs and broad audit evidence |
| 127 | `85cd2f9` | U30 | docs(bg): close repaired M7 OFF delivery and readback |
| 128 | `b95b946` | U31 | fix(journal): retain operation metadata and validate transactional retirement |
| 129 | `6a75a2d` | U31 | fix(bg): preserve failure notice authority and settle recovery lifecycle |
| 130 | `48b6dd6` | U31 | fix(bg): retain notice facts through result loss and partial settlement |
| 131 | `1288e36` | U31 | test(bg): exercise native failure and durable notice recovery callers |
| 132 | `c811914` | U31 | test(bg): verify qualified failure notice wording exactly |
| 133 | `6bb21a6` | U31 | docs(bg): record G1.8 lifecycle qualification and retention boundaries |
| 134 | `54a2a64` | U31 | docs(bg): close G1.8 OFF delivery and legacy preservation evidence |
| 135 | `483688d` | U31 | docs(bg): record immediate G1.8 closure verification |
| 136 | `ff40e23` | U31 | docs(bg): record iPhone notification delivery verification |
| 137 | `d0f0501` | U31 | docs(bg): preserve G1.8 verification process and results |
| 138 | `7dc00bd` | U32 | test(bg): expose blocked next Send after terminal failure |
| 139 | `8a530d8` | U32 | docs(bg): clarify failed-input proof boundary in retest |
| 140 | `abdd81f` | U32 | fix(bg): settle retained input after exact failed result ACK |
| 141 | `a52fbdd` | U32 | test(bg): isolate device session cookies and record repair gates |
| 142 | `fc525ab` | U32 | docs(bg): record verified OFF repair delivery and device readiness |
| 143 | `919bdd4` | U32 | docs(bg): distinguish device A observation and test-service recovery |
| 144 | `8c33976` | U32 | test(bg): initialize synthetic statistics and verify durable UI saves |
| 145 | `04a3559` | U32 | docs(bg): correlate iPhone B and C failure recovery observations |
| 146 | `0b48497` | U32 | docs(bg): close scoped device failure verification records |
| 147 | `3603204` | U33 | fix(bg): validate canonical statistics before owned execution |
| 148 | `c434654` | U33 | fix(bg): retain exact failed input acknowledgements through retirement |
| 149 | `7508972` | U33 | fix(bg): publish anchored edit notices and verify actual UI flows |
| 150 | `b4ecd01` | U33 | docs(bg): record remaining G1.8 evidence and device gates |
| 151 | `d5b72e9` | U33 | docs(bg): close scoped OFF delivery and distinguish visible notices |
| 152 | `78a429f` | U33 | docs(bg): record iPhone edit notice and reopen observations |
| 153 | `32dcac8` | U33 | fix(test): use the supported isolated update-check setting |
| 154 | `407bbc2` | U33 | docs(bg): close scoped iPhone edit notice gate |
| 155 | `83bd4c2` | U33 | docs(bg): document pending publication loss and recovery admission plan |
| 156 | `e2156a8` | U33 | docs(bg): clarify blocked save and local draft limits |
| 157 | `a646988` | U34 | fix(bg): preserve edits while committed answers recover |
| 158 | `5711ddb` | U34 | docs(bg): record publication recovery OFF delivery |
| 159 | `f33a0d2` | U34 | docs(bg): record scoped publication recovery device results |
| 160 | `1df5fe1` | U35 | fix(bg): settle committed inputs after admission uncertainty |
| 161 | `572606d` | U35 | docs(bg): record uncertain-input recovery delivery |
| 162 | `c325ac8` | U35 | docs(bg): close scoped G1.8 background device validation |
| 163 | `12f1e46` | U36 | fix(bg): finish requested settings persistence before admission |
| 164 | `3371119` | U36 | fix(bg): preserve native stream scheduling and error ownership |
| 165 | `31cb01d` | U36 | fix(bg): reconcile cancelled inputs through ownership proof |
| 166 | `f731a6d` | U36 | feat(bg): relay server-owned streaming replies with explicit stop |
| 167 | `a2a84f8` | U36 | fix(bg): preserve native Google stream error ownership |
| 168 | `31e2986` | U36 | fix(bg): bound preview activity and retain finished delivery ownership |
| 169 | `afc5346` | U36 | test(bg): qualify Gemini and Vertex stream relay failures |
| 170 | `956a273` | U36 | docs(bg): record G1.9 host-off delivery and device gates |
| 171 | `3740c66` | U36 | docs(bg): close scoped G1.9 iPhone verification |
| 172 | `6498e32` | U37 | test(bg): qualify original MARP edit queue and stop lifecycle |
| 173 | `86a9ebb` | U37 | fix(bg): expose current operation stop during preparation |
| 174 | `4cc4b71` | U37 | test(bg): force delayed stop reply and nonstream control cases |
| 175 | `9bdb7ce` | U37 | docs(bg): describe preparation stop candidate behavior |
| 176 | `60b14b6` | U37 | test(bg): connect module restart and original provider warnings |
| 177 | `81529be` | U37 | test(bg): require complete PDF note removal for input proof |
| 178 | `00e5f8a` | U38 | fix(bg): move server waiting status to request toast |
| 179 | `73beb80` | U39 | fix(bg): yield upper wait status to stream preview |
| 180 | `49522f6` | U39 | fix(bg): show server waiting as the primary status title |
| 181 | `2aa7ba2` | U40 | fix(bg): label relayed waits and quiet transient read status |
| 182 | `d82488b` | U41 | feat(bg): show whole-request lifecycle progress |
| 183 | `0291eb9` | U41 | docs(bg): describe lifecycle status and validation boundaries |
| 184 | `17cfa97` | U42 | fix(bg): remove redundant lifecycle kind chip |
| 185 | `0aa1db1` | U42 | docs(bg): record scoped kind display confirmation |
| 186 | `834dcc0` | U43 | fix(bg): preserve Go conversation identity in plugin requests |
| 187 | `8adb75f` | U44 | fix(bg): restore configured external-header ownership |
| 188 | `0729f2f` | U44 | docs(bg): close scoped G1.10 verification with recorded limits |
| 189 | `cc0a490` | U45 | fix(bg): measure cleared composer after DOM update |
| 190 | `498537d` | U46 | fix(bg): show only actionable composer input notices |
| 191 | `1feca1d` | U46 | docs(bg): record composer UI delivery and verification |
