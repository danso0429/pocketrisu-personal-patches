# BG G1 checkpoint history

This preserves the detailed BG text previously in README at `08a46e4`.
Documentation reorganization changes neither implementation nor qualification.
The [README](../README.md#bg-goals-and-current-scope) presents the large goals;
the [crosswalk](BG-G1-INTEGRATION-CROSSWALK.md) maps them to exact implementation
units and the pinned 191-commit history.

The first section records the source/qualification snapshot at that commit.
Current status is maintained in the README; this commit-pinned snapshot is not
updated to follow later candidates.
Later sections preserve earlier checkpoint statements, including their then-open
gates and intermediate recovery decisions. Those statements are historical
evidence, not instructions or the latest support status. In particular, .11's
count-based handling was superseded by .22/.24 and later repairs; early host-OFF
observations do not contradict later controlled activation. Read the crosswalk's
later-correction column before relying on an old checkpoint.

## Recorded source and qualification snapshot

The `0.2.4-experimental.50` candidate supports the unchanged original PageFold
provider's default font/emoji cache and statistics in the isolated host. Bounded
local string transport, allocation/progress ownership and separate API budgets
retain ordinary limits; caught local CAS refusals retain competing data and valid
answers after a mandatory warning. BG adapter0.7.57 / Lazy sync0.5.8 / Personal settings0.5.14;
controlled host activation has been exercised. See [M7 qualification](POCKETRISU-G1-7-M7-QUALIFICATION-VALIDATION.md)
for original-provider12, actual raw/prepared/admission and failure evidence,
operational composition, support/activation conditions and remaining goal gates.
The follow-up audit repairs phase/receipt ownership, saturated settlement replies,
refused resource cleanup, concurrent shared exports and teardown result admission.
Event-driven settlement preserves accepted bookkeeping without a busy wait.
Repaired M7 qualification and independently checked OFF candidate delivery are
closed at the documented scope. [G1.8 lifecycle qualification](POCKETRISU-G1-8-FAILURE-LIFECYCLE-VALIDATION.md)
adds proven absent-target classification, metadata-only journal caches, authorized
new-journal retirement after49h and durable v3 failure/interruption/edit/effect notices.
Legacy journal bytes remain protected. Broader physical-device and aggregate
qualification remain separate. Stable
remains `v0.2.3`.

External request headers remain owned by explicitly enabled destination rules.
Their conversation-session values and redirect scoping use the existing rule
owner. Original plugin scripts, explicit caller headers, provider accounts and
billing settings are unchanged. The automatic Go-header completion introduced
in experimental.47 was removed because it suppressed a configured rule.

The current G1.10 checkpoint has completed scoped closeout with recorded limits.
Successful server-owned input admission now waits for the cleared input to reach
the DOM before measuring composer height. Changed drafts and uncertain admission
retain their existing handling. The user confirmed both composer fixes as normal
on 2026-10-15, completing their scoped physical L5. Translated-input UI,
VoiceOver and broader device qualification remain separate.
Routine server input progress uses the upper lifecycle card. The composer keeps
only actionable recovery/preparation notices, with unchanged activity polling,
generation locks and explicit retry controls.
Isolated actual-provider analysis/main generation, canonical storage before
browser return and a healthy follow-up after a failed input were verified.
On a physical device, app closure was followed by observed server-side answer
storage; the user confirmed one answer, cleared processing status and a usable
composer after returning. The physical MARP run showed transport activity and
an HTTP response, but complete analysis/injection was not established. Its
timeout cleanup was reproduced locally; the cause of the increased latency is
unresolved. Further analysis trials are deferred. Additional physical checks
for app switching, screen locking, settings-save propagation, edit/queue,
Stop/recovery, controlled failure and module selection are explicitly unrecorded.
These limits are retained rather than treated as passes. This documentation
closeout changes no runtime, installer, account or billing setting and does not
publish a stable release.

Whole-server requests use one upper lifecycle card per operation: request,
admission confirmation, predecessor waiting, preparation, model processing,
postprocessing, canonical save, app adoption and completion. Captions follow
actual operation state; quick stages may not be observed. Model details and
PageFold badges appear under their operation's card. Its upper row shows phase
and elapsed time; request-kind chips appear only beside the actual model detail.
Local/unrelated
requests retain their own status. Display is presentation-only and does not
change execution, cancellation, data ownership or ACK policy. Completion can
precede a delayed cleanup ACK when the answer is already durably adopted.

Preparation and nonstream waits have no separate composer status box or text
Stop. The lifecycle card distinguishes their actual stages; the generic server
waiting fallback uses `서버 처리 중`. Local requests and ordinary recovery retain
their existing titles. A transient pending-input read failure no longer renders
a composer warning card; unknown activity remains fail-closed and real blocked
inputs/recovery controls remain visible. The ordinary composer
circle stops the observed server operation; raw queue drafts retain their Send
action. Explicit text Stop appears only with an actual stream preview. Waiting
fallback respects its display setting and yields to native/lifecycle progress
and the actual stream preview. The lifecycle card continues through canonical
save and app adoption. Removing a display never saves an answer or cancels
generation. Late
cancellation replies preserve the next operation's control. Synthetic original-MARP
queue/edit, cancellation and cold-return probes remain separate from actual
provider, physical-device, host activation and aggregate qualification gates.
The current UI's physical streaming check is not recorded at the user's choice;
automatic streaming evidence does not substitute for that device observation.

## Earlier candidate checkpoints

[G1.9 stream relay](POCKETRISU-G1-9-STREAM-RELAY-PLAN.md) adds a transient
formatted preview of server-owned streaming answers. Observation never saves a
provisional message, claims or acknowledges a result, or cancels generation.
Markdown/HTML/style sanitization and thought folding use the native parser;
card/module editdisplay regex, Lua/plugin hooks and automatic translation run
only through the completed message's existing display path. A display-only
256KiB UTF8 limit withholds oversized previews while retaining the exact full
answer. Preview observation starts only during selected-chat server activity.
Native OpenAI/Google/Vertex stream error ownership and exact current-operation
Stop preserve normal follow-up and durable failed-delivery ownership. Full
automatic qualification and independently checked hostOFF delivery are recorded
in the [G1.9 validation](POCKETRISU-G1-9-STREAM-RELAY-VALIDATION.md).
The instructed synthetic iPhone streaming, Stop/follow-up, failure/follow-up and
absence/return observations passed, with scoped L6 recorded. Actual-provider/MARP
and whole-G1 aggregate activation/stable remain G1.10 gates.

The .36 repair closes ordinary retained-input failures through canonical input
identity and an exact no-answer result ACK. A versioned receipt survives lost ACK
responses; partial/uncertain results and edited or deleted input views are not
silently discarded or overwritten. Actual browser Send failure-to-next-Send and
fast failure/ACK-loss controls pass. See the [re-verification record](POCKETRISU-G1-8-VERIFICATION-RECORD-2026-10-11.md)
for the earlier device observations and their limits.

The .37 remainder rejects invalid canonical counters before owned generation or
publication, without guessing history or replaying the model in the client.
Exact failed-input ACKs now survive operation-state expiry and compact retirement;
deliberately removed acknowledged raw inputs stay absent while the next Send
remains usable. Anchored prompt changes produce durable edit notices. Actual UI
positive/negative edit and lost-ACK/native-removal controls pass. The existing
immediate assembly warning and durable server warning are counted separately.
The scoped iPhone D/G1.3 edit-notice gate now passes positive edit/save,
both warning sources, reopen/no redisplay, following Send and the no-edit
warning control. The approved .38 remainder recovers a committed answer before
accepting an affected edit or deletion. Persistent refusal retains the current
view's dirty edit and explains that it is not saved across app closure. Other
chat/root writes retain their normal scope checks. Edits made during an
asynchronous hydration read return to the ordinary dirty queue using the live
chat array; known server publications are not echoed as user edits. See
sections15–18 of the same record for automated evidence and remaining device
and whole-G1.8 gates.

The .39 follow-up repairs a lost-admission-response case: a stored answer could
be visible while its client marker remained uncertain and blocked the next Send.
Only an exact validated committed receipt can transfer that marker to the existing
hydration/ACK owner after the original attempt grace. Active or unproven work
remains protected, and marker promotion alone never declares a result delivered.
Actual browser settlement/next Send and server duplicate refusal after ACK pass.
The scoped iPhone control also confirms visible blocked-save notice and normal
home/return after natural admission, with one server-generated answer saved
before return and exact delivery ACK. Synthetic Hub outbound-denial logs remain
separate from input/generation errors; broader provider/stream/aggregate gates
are not supplied by this controlled result.

The UI controls now initialize synthetic statistic counters and verify durable
root writes, preserved full chat content and another Send after reopening.
iPhone B/C observations correlate failure settlement and subsequent normal
answers with server receipts; C's green-stage close/return also has an explicit
no-reappearance observation. Earlier A's malformed fixture, C's extra request
origin, blue-stage and successful-generation absence remain limited or pending.
See sections11–12 of the same record; these are scoped failure controls, not
whole G1.8, activation or stable qualification.

The preceding `0.2.4-experimental.32` candidate restores unread stream/Response and callback/
signal resources after refused serialization, while preserving published handles,
original caps and fatal teardown. Actual v2/Lua auxiliary caller roles and original
MARP main-only settings are measured through HTTP and normal-chat storage.
BG adapter0.7.39 / Personal settings0.5.14; production stays hostOFF.
[Handle/caller validation](POCKETRISU-G1-7-HANDLE-CALLER-VALIDATION.md) records
wire30/worker11/session9/host96, original protocol/resource and actual caller evidence.
Final M7 installed-combination/admission/activation, actual providers and device/
aggregate remain separate. Final source consultation and scoped application delivery
are complete after rollback, source/configuration and database-preservation checks.
Detailed operational receipts are retained privately. Stable remains `v0.2.3`.

The M7 first-unit checkpoint adds maintained installed-original combination and
actual raw/prepared admission probes on the unchanged experimental.32 application.
Original-host10, HTTP8 and existing default controls2 pass with explicit omission,
provider, notice/receipt and canonical-storage assertions. The goal subplans connect
remaining checks to L1–L6 without limiting audit discovery. See
[installed-combination evidence](POCKETRISU-G1-7-INSTALLED-COMBINATION-VALIDATION.md).
Full M7 activation, failure/stream/device/aggregate and unchanged official AC remain
separate; no application version or production setting changes in this checkpoint.

The `0.2.4-experimental.31` checkpoint admits raw selected-plugin providers through
the eligible host and checks actual healthy registration before input effects.
Missing/ambiguous providers fail without an implicit default model; native retry
and input failure latches remain. BG adapter is0.7.38; Personal settings0.5.14
and hostOFF are retained. Actual raw12/host94/session9 and full automatic gates
are recorded in [raw provider validation](POCKETRISU-G1-7-RAW-PROVIDER-VALIDATION.md).
Remaining caller/handle, final M7/activation, actual-provider and device/aggregate
gates stay open. This experimental candidate is delivered with hostOFF:
484 managed files/175 served scripts/five database checks, unchanged headers,
operations103→103/removed0, active/model/pending0 and new error lines0.
Actual authenticated capabilities returnHTTP200/hostVersion0; stable remains `v0.2.3`.

The `0.2.4-experimental.30` checkpoint implements the selected analysis-context
contract: omit unusable non-provider hooks, retain prior effects and chain output,
finish/store the answer and await the failure notice. Duplicate identities are
refused before initialization; canonical identity checks use a hot cache peek
with safe cold recovery, preserve unaffected relative hook order and reject a
missing/invalid selected provider. BG adapter is0.7.37; Personal settings0.5.14
and production hostOFF are retained. See the
[context omission validation](POCKETRISU-G1-7-CONTEXT-OMISSION-VALIDATION.md)
for actual raw/prepared server, cache, provider, browser and gate evidence.
Raw selected-provider admission was still open at that checkpoint and is now
qualified within the experimental.31 scope above. Remaining M7/activation and
device/aggregate qualification stay open; this checkpoint is not a stable release.

Experimental.30 is delivered with hostOFF after verified application/state rollback:
484 managed files/175 served scripts/five database checks, header settings retained,
operations103→103/removed0, online/unstable0/new error lines0. It adds no active UI
behavior while OFF; the remaining activation/device/aggregate gates stay open.

The `0.2.4-experimental.29` candidate preserves URL-encoded form bytes on the
authenticated proxy aliases and reports worker-local RPC frame/value refusals
without losing later valid calls. Personal settings is0.5.14 and the BG adapter
is0.7.36; original MARP, limits and default hostOFF are retained.
[PDF/proxy qualification](POCKETRISU-G1-7-PDF-PROXY-VALIDATION.md) records
four-family native/server PDF comparisons, Worker controls, original large-input
and cancel boundaries, and the separate actual preset Send/store evidence.
Actual providers, residual M7/activation and device/aggregate remain open;
the stable release remains `v0.2.3`.

Experimental.29 is delivered:484 managed files/175 served scripts/five database
checks, header configuration preserved, operations99→99/removed0, hostOFF,
online/unstable0/new error lines0. The live proxy form echo matches its89byte
body/content type without an external provider call. The user reported the scoped
ordinary-use iPhone L5 as normal on2026-10-10. Its documentation closeout is complete;
the remaining activation/aggregate gates stay open.

The subsequent [role/identity/epoch checkpoint](POCKETRISU-G1-7-ROLE-IDENTITY-EPOCH-VALIDATION.md)
adds original native/server role comparisons and separate canonical-root/operation-DB
characterization, with actual Send/queue/retry refresh/store evidence. It changes
probes and documentation only. Its duplicate-name/non-attached design work is
implemented in the subsequent experimental.30 checkpoint within the documented
scope; full M7 and production activation remain open.

The `0.2.4-experimental.28` candidate adds visible API-limit refusals to the
generic server plugin host while preserving valid later calls and existing limits.
It retains the unavailable-host BG continuation/warnings from experimental.27.
Original MARP protocol/PDF/OAuth fixtures and the limit correction are recorded in
[the scoped validation](POCKETRISU-G1-7-PROTOCOL-BUDGET-VALIDATION.md).
The server plugin host remains OFF; actual providers, M7 activation and device/
aggregate qualification are still open. The stable release remains `v0.2.3`.
This correction is delivered with484 managed paths/175 served scripts and five
database checks; existing header settings and hostOFF are retained. See the
validation document for exact backup/readback evidence and remaining device gates.
The user reports normal ordinary requests, closing this candidate's scoped
preservation check. Connection-test success and missing preprocessing history
with hostOFF do not qualify server MARP execution.
[M4 settings evidence](POCKETRISU-G1-7-M4-SETTINGS-VALIDATION.md) adds eleven
synthetic UI/server/native-v3 scenarios for agent selection, overrides, prompts,
queued updates, retries, deadlines and concurrent reads without changing runtime.
The later experimental.29 checkpoint adds stated PDF/resource evidence; residual M7,
stable/activation/device aggregate remain open.

The earlier `0.2.4-experimental.24` candidate includes the CAP admission corrections and
G1.12b recovery ownership changes. Terminal reconciliation no longer owns the
generation busy lease; recommendation requests wait for current-chat proof and
reject stale target callbacks. Deferred draft scans retain readiness wakes.
The candidate is delivered with474 managed paths,175 served scripts and five
verified databases; the user reported normal G1.12b operation. The scoped
ordinary-use device check is closed, while exact recommendation/recovery routes,
G1 aggregate and stable qualification remain open. See the
[G1.12b validation and device closeout](POCKETRISU-G1-12B-RECOVERY-OWNERSHIP-VALIDATION.md).
The remaining server-plugin work follows the
[MARP host qualification plan](POCKETRISU-G1-7-MARP-HOST-QUALIFICATION-PLAN.md),
then G1.5b admission. It compares real callers, timeout/retry lifetime, settings
freshness and failure visibility; existing transport diagnostics do not classify
private plugin semantic success.
The stable release remains `v0.2.3`.

The `0.2.4-experimental.22` G1.12a candidate recognizes already-current server answers, bounds BG
control-body and snapshot reads, and queries server state after a long suspension
instead of declaring generation timeout. Conflicting local edits retain recovery
markers; verified deleted or superseded targets retire locally without deleting
their server delivery. Temporary measurement instrumentation is removed after
the user-approved collection closeout. See the
[G1.12a plan, evidence and delivery status](POCKETRISU-G1-12A-TERMINAL-RESULTS-PLAN.md).
The candidate is delivered after backup, build and readback of465 managed files,
17 served scripts and five databases. Device validation remains pending.
G1.12b navigation ownership is delivered by the later experimental.24 candidate;
MARP server execution remains separate work.
After updating, reload every open PocketRisu tab/PWA for the v3 input-marker
reader. Clearing browser storage is neither required nor recommended.

The `0.2.4-experimental.20` candidate adds the G1.6 generic server plugin host:
one isolated process per plugin per operation, scoped RPC, native hook/provider
adapters, guarded shared storage and versioned notifications. It does not select
providers by plugin name or script hash. Execution is internal opt-in and remains
off by default pending original-plugin qualification; installing this candidate
does not activate MARP or widen G1.5b admission. See the
[G1.6 implementation and limits](POCKETRISU-G1-6-PLUGIN-HOST-WIP.md).
The default-OFF foundation is delivered live, including the existing font-target
changes. Original MARP activation and device/aggregate qualification remain separate.

The `0.2.4-experimental.19` checkpoint stores new unsupported-input notifications
on the server and delivers them on app return, including the home screen. It preserves
the original input/recovery control when notification storage fails and suppresses
ordinary redelivery with leases and separate notification acknowledgements. The current
toast rules remain; notification expiry is 48 hours and ACK means UI enqueue, not read.
Plugin writers were not included in that checkpoint. See the [G1.8 foundation record](POCKETRISU-G1-8-NOTIFICATION-FOUNDATION-VALIDATION.md).
It is delivered live; iPhone and aggregate qualification remain pending.

The `0.2.4-experimental.18` checkpoint adds server-aware reroll, Continue Response
and empty-resend controls while retaining the existing N+1 input queue. It excludes
competing legacy/native main requests at server admission, preserves auxiliary calls,
and recognizes completed work when cancellation arrives late. See the
[G1.4 validation record](POCKETRISU-G1-4-QUEUE-VALIDATION.md) for evidence,
direct-provider limitations and delivery/device status.
It is delivered live; physical-device and aggregate BG qualification remain pending.

The `0.2.4-experimental.17` checkpoint adds qualified native preset/module/custom
server-input admission and explicit app preparation for unsupported input operations.
It separates semantic view fingerprints from server storage revisions and retains
original input when preparation stops. Plugin-host qualification and r3 remain separate.
See the [G1.5a implementation record](POCKETRISU-G1-NATIVE-ADMISSION-VALIDATION.md)
for current verification and delivery status.
It is delivered live; device/aggregate qualification remains pending.

The `0.2.4-experimental.16` checkpoint extends the existing operation cancellation,
conversation-header context and node execution environment to server input triggers
and editinput. Native model admission was not expanded at that checkpoint. See the
[native-input context validation](POCKETRISU-G1-NATIVE-INPUT-CONTEXT-VALIDATION.md).

The `0.2.4-experimental.15` candidate shares snapshot-based model selection
between actual dispatch and server-input checks, includes configured fallback
models, and rechecks settings after input attachment. Preset/module/custom raw
admission expansion was left for the following units. See the
[G1.5 validation record](POCKETRISU-G1-5-REQUEST-POLICY-VALIDATION.md).

The `0.2.4-experimental.14` follow-up moves saved-answer notices to the upper
notification bar. The user confirmed normal app-return behavior. See the
[validation and delivery record](POCKETRISU-BG-SAVED-ANSWER-NOTICE-VALIDATION.md).

The G1.3 candidate `0.2.4-experimental.13` uses assembly-time saved chat and settings,
preserves user edits and reports context changes after preparation. Automated validation
and live delivery are complete; device qualification remains pending. See the
[G1.3 validation record](POCKETRISU-G1-3-ASSEMBLY-CONTEXT-VALIDATION.md).

The BG candidate `0.2.4-experimental.6` repairs JSON-transport admission
of existing detached requests and preserves available recovered-answer metadata.
See the [G1.0 validation record](POCKETRISU-G1-0-ADMISSION-RECOVERY-2026-09-27.md)
for automated evidence and the completed G1.0 recovery check. Full G1 qualification
remains open; this candidate does not add server plugin hosting.

## Earlier save and header checkpoints

The BG candidate `0.2.4-experimental.12` saves generated answers after their
input message in the latest chat while preserving edits saved during generation.
Overlapping user edits take priority with a skipped-change notice. It includes
the G1.12 finished-operation fixes. The user reported the requested iPhone
edit-during-generation and app-return/save check normal. See [G1.1 validation](POCKETRISU-G1-1-ANCHOR-COMMIT-VALIDATION.md)
for verification, device status and commit-record downgrade limitations.

The BG candidate `0.2.4-experimental.11` closes server operations that have
already finished: a final error without an answer is reported once and
acknowledged, and a committed result that cannot be adopted stops re-polling
after three permanent refusals while the answer stays in the server chat. See
[G1.12 validation](POCKETRISU-G1-12-FINISHED-OPERATION-VALIDATION.md).

The BG candidate `0.2.4-experimental.9` repairs continued saving after rebase
and cache eviction, publishing merged messages while preserving later edits.
The user reported the requested chat round-trip/save, draft retention and
delete-confirmation checks normal. See [G1.2 repair validation](POCKETRISU-G1-2-SAVE-AVAILABILITY-REPAIR.md)
for evidence and limits. Server anchor work and full G1 qualification remain open.

The BG candidate `0.2.4-experimental.7` adds server-shared external request
header rules under Personal settings. Rules start disabled and affect only
server-routed requests. See [G1.11 validation](POCKETRISU-G1-11-EXTERNAL-HEADERS-VALIDATION.md)
for behavior, transport coverage and the remaining device/provider checks.

