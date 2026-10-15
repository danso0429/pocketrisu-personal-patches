# Composer admission UI validation

2026-10-15. Candidate: `0.2.4-experimental.50`, BG adapter `0.7.57`, exact PocketRisu `1.10.0`. Stable remains `v0.2.3`.

## Changes

1. Successful server-owned admission waits for Svelte to apply a cleared draft before the existing textarea size measurement. The accepted/clearDraft/draftUnchanged guards, rejection/uncertainty handling and ordinary send path remain unchanged. Height-only checkpoint: `cc0a490`, experimental.49 / adapter0.7.56.
2. Composer input cards render only blocked/unknown execution, client preparation and existing reason-bearing notices. Full pending state still controls polling/activity, and existing retry controls keep their operation/input identifiers and raw text. An empty polite live region remains mounted before later actionable content.

No server/provider/permission/settings owner is changed. The generated installer and maintained version assertions were updated with each functional checkpoint.

## Automatic observations

| Check | Result |
|---|---|
| Focused component/activity/projection | 30 passed |
| Full frontend | 2,444 passed; 4 existing skips; 202 files passed / 1 skipped |
| Full server | 644 passed; 12 existing skips; 46 files passed |
| Patcher | 52 passed |
| Svelte check | 0 errors / 0 warnings |
| Production frontend build | Passed using the existing PocketRisu build script without output-directory overrides |
| Complete graph | 42 packs / 1,725 units / 8 collisions / 512 paths |
| Re-plan / exact revert | 0 changed paths; 1,022-file bytes/modes/links/paths restored; clean disabled state and empty intent |

The focused tests retain the original failure/retry protections and add normal-state fast polling, busy reporting, mixed-state retry coordinates, persistent live-region identity and preparation/reason notices. Retry assertions compare content including identifiers, not JavaScript reference identity. Renderer changes do not alter the component's polling effect or parent mount.

## Browser evidence

Chromium used a separate synthetic database, the actual UI Send caller, server-owned input admission and canonical chat storage. Model responses were synthetic; no real provider or embedding calls were made.

| Observation | Before | Height-only | Final |
|---|---|---|---|
| Empty textarea | 36px | 36px | 36px |
| Expanded multiline input | 204px | 204px | 204px |
| Empty textarea after successful ACK | 204px | 36px | 36px |
| Duplicate generating input card | 1 | 1 | 0 |
| Upper progress and canonical answer | Observed | Observed | Observed |
| Page errors | 0 | 0 | 0 |

This is desktop Chromium layout evidence. It does not establish actual iPhone geometry, translated-input UI behavior or VoiceOver speech. The persistent live-region DOM transition is tested; screen-reader output remains unmeasured.

Excluded setup attempts: a relative output path did not satisfy the existing harness's absolute-runtime requirement; resizing that harness into mobile layout caused its settings overlay to intercept Send; a first graph subprocess was denied by the restricted sandbox. Those attempts are retained separately and are not passes. Final browser runs use the supported desktop harness; the permitted graph round trip uses a fresh isolated copy.

## Review and delivery boundary

Scoped structural and runtime review traced the successful-clear branch, stale/changed drafts, display filtering, polling/activity/generation locks, retry identity, lifecycle cleanup and combined behavior. Read-only technical review found no blocking issue in the current implementation. No assertion was weakened to hide a functional failure.

The live plan changes only DefaultChatScreen, ServerPendingInputs, its test and patcher state. Existing host configuration must be preserved. Before delivery, current owner activity must be checked; historical `running` records alone do not prove active generation. Application/state rollback material, safe patcher apply and independent served-asset/source readback are required. Delivery confirmation and physical L5 are separate observations; no stable tag is created by these automatic results.
