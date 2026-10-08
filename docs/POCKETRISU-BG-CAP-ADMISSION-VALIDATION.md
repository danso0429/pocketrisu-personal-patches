# BG CAP admission correction validation

Date: 2026-10-09 KST. Candidate: `0.2.4-experimental.23`, BG adapter `0.7.30`, official target PocketRisu1.10.0. Runtime baseline: delivered `ab14579` / experimental.22. Personal settings remains0.5.13; plugin host stays OFF. See [the CAP plan](POCKETRISU-BG-CAPABILITY-ADMISSION-REPAIR-PLAN.md), especially its detailed execution section.

The user authorized full CAP execution after the planning review. Work proceeds on the separate `codex/pocketrisu-cap-admission` line; the original G1.12b dirty files/installer are preserved. This correction does not implement G1.12b, qualify MARP or Archive Center, change provider policy or waive physical-device/aggregate/stable gates.

## Resulting behavior

- Capability negotiation returns the consumed protocol body instead of a generated bare return. The existing occurrence ID remains and its full statement is replaced with an exact anchor.
- Eligible raw input reads its original base response within one30s observation spanning import, bytes, decode and validation. Timeout returns the existing blocked result, releases admission UI and retains the draft. A losing response cannot later admit the input.
- Prepared negotiation observes the registered native Stop signal during headers and body. Cancellation finishes without a model POST; normal negotiation still chooses v1. A non-aborted capability failure follows the existing legacy server-ownership path once.
- Existing-marker status observation has its own30s candidate bound before capability negotiation. Failed observation preserves the marker; timely exact missing can still retire an uncertain marker. The post-POST10s attempt/60s raw reconciliation contract is unchanged.
- Unsupported policy, strict save/CAS/rebase, draft/attachment identity, exact operation markers, queue and uncertain-admission handling remain authorities. No global busy lock, general persistence timeout or original plugin rewrite is added.

## Regression evidence

| Boundary | Observed evidence |
| --- | --- |
| Composer return | Maintained-unit red: undefined/body0. Corrected-unit green: supplied object/body1. Exact/idempotent apply/revert in both cases demonstrates why byte restoration alone did not detect the bug. |
| Compiler/generated output | Installed TS5.9.3 actual-arrow unreachable7027: baseline1/candidate0; full type check0 errors/0 warnings. Marker audit: bare return0, remaining known control JSON0. Positive/control cases detect the bare return and an added unwrapped JSON call while accepting whole-return/assignment compositions. |
| Generated admission | Valid/404/incompatible/500/malformed/stalled/downgraded capability; binary timeout and late response; queue; missing revision; prior-marker headers/body and timely missing; lost start body; ordinary exclusion versus explicit client preparation. Real codec/ledgers/native owner with controlled HTTP/storage/UI leaves. |
| Prepared lifecycle | Header/body/already-aborted Stop sends no POST and shows no resend/error notice; a new owner survives old response release. Header/body failure and normal negotiation preserve expected legacy/v1 payload semantics. |
| Shared storage/identity | Native adoption both arrival orders and intervening edit; actual NodeStorage in outer attach/refresh concurrency; valid current proof, one paid message, no client save/model replay/completion sound, marker closure and next no-op observation. Old classic cleanup preserves new raw identity on an already-current paid view. |
| Actual browser fault | A real partial input-base stream times out with retained draft and released spinner; prepared Stop closes its actual body connection. Initial admissions/providers0, late response release remains0, subsequent explicit send admissions/providers1. Both runs record page errors0. |
| Actual endpoint/browser queue | Two contexts, N+1 serialization, replacement guards and an old native main request; third draft retained. Two provider calls and ordered stored messages. |
| Actual explicit recovery | Normal, save-before-attach and save-after-attach each record provider1/input1/answer1, preserved input variable and page errors0. Save race modes each exercised one competing write. Existing unsupported-input terminal dialog is confirmed through its normal button before recovery; no force-click or hidden replacement. |

The combined native adoption fixture drives the existing50ms paint fallback with deterministic time and supplies later authoritative reads. Tests do not bypass slot/token/publication guards. Fixture import timing, malformed marker text, missing required fields and an incorrect route suffix were repaired without weakening assertions or increasing timeouts. Synthetic clocks are not device-latency measurements.

## Repository gates

- Full client:2251 passed /4 existing conditional skips. Final required marker-field correction is test-only; its affected case and type gate were repeated.
- Full server:490 passed /12 skips. The first run timed out in an unchanged notification-capacity case under concurrent build/client work; same source passed14/14 alone and the unchanged full rerun passed without a larger timeout.
- Compatibility:74 passed /5 existing conditional skips.
- Focused client/storage/read/owner set:90 passed before the final required marker-field correction, with affected recheck afterward.
- Type check:0 errors /0 warnings. Help audit:missing0, existing40 unreferenced definitions reported without removal.
- Frontend and BG bundle/build-load checks passed; existing plugin-timing and KaTeX warnings are retained as warnings, not new validation errors.
- Full patcher:331 passed /0 failed /0 skipped. The expected adapter version stays a literal checked value and was updated to0.7.30; it is not derived from the implementation under test.
- Graph:42 packs /1395 units /7 collisions, re-plan0. Fresh normal apply/revert restores all1022 baseline application files by bytes and mode.
- Actual .22 applied-state upgrade:466 managed files equal clean composition, re-plan0; normal revert restores managed originals/removes owned additions, leaving clean status, no packs and empty custom intent.

Structural/runtime review covers the changed generated callers, helper lifetimes, exact admission identity, native guards and their integration. It does not equate mock transport/adoption outcomes with real storage or device qualification. Read-only Opus discussion supplemented direct source tracing and measurements; the advisor did not execute tests.

Final read-only Opus review at `b55a49e` found no blocking defect within the files it read. It did not independently inspect the installer/probes/audit artifacts. Two concrete protection suggestions were adopted: pin the missing-base-header result to `server-chat-unavailable`, and assert native Stop's transport signal is aborted. All3 affected cases and the0-error/0-warning type check passed afterward; runtime code did not change. Existing unread error-body disposal and post-POST response association limits are recorded in the runtime surface; they are not newly qualified improvements. A hypothesized two-tab pre-registration marker race was left unverified and outside this correction, rather than changing the established missing-status policy without evidence.

## Preservation and remaining limits

The preserved G1.12b runtime/installer inventory has11 unchanged hashes. Live source/data/service changes remain behind final review and the normal idle/drift/backup delivery boundary until the closeout is recorded.

Raw hydration/strict root save still uses its existing observation policy. No timeout here cancels an underlying persistence operation. Synchronous decode and suspended JavaScript cannot be preempted by browser timers. A cold/stale codec import can block safely before admission but remains an upgrade/device observation surface. The generated-marker diagnostic covers script regions;85 template/style markers are outside that semantic check, so no universal ASI proof is claimed.

Current saved-policy exclusions are not proof of unsaved/open-device state or historical route usage. Do not change a user's model/plugin settings or force paid stalls merely to create a raw qualification result. Original MARP/host qualification and pre-admission app-exit behavior stay in their later G1 work.

After delivery, reload all open PocketRisu tabs/PWAs without clearing browser storage. Physical-device preservation checks: ordinary send with existing settings; tap Stop while preparation is visibly active if that phase is observed; send another ordinary input and confirm normal behavior. Retain saved input/drafts as appropriate to the actual route. Synthetic stalled-response coverage does not require manufacturing a phone hang. G1.12a long-background/cold/deletion scenarios remain separate unconfirmed observations; no stable tag is authorized by these automatic results.
