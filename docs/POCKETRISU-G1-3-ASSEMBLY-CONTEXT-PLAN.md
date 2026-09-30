# G1.3 assembly-time chat and settings

Date: 2026-09-30 KST
Baseline: `a070a6b` (G1.1 device-confirmed; experimental.12).
Status: user policy choices confirmed; implementation, automatic gates and final review complete in an isolated candidate. Backup-capacity resolution precedes live application.

## Required outcome

Use the latest saved chat, character, lorebooks, preset and modules when prompt preparation actually starts. Freeze that context for the pipeline. If relevant chat input changes afterward, preserve the user's edit, save the generated answer and issue an unreflected-change notice without generating again. Keep credentials and credential-derived fingerprints out of durable execution metadata.

Preserve G1.1 identity-based commit, G1.2 client rebase and G1.12 finished-operation cleanup. Expanded input admission and the general notification center remain separately tracked goals; their existing safety contracts must not be silently weakened.

## Current source findings

- `runServerPreview` waits for `_previewLock` and bundle loading before reading the root database. It then injects the request's old `currentChat`, and may override current globals with the client's older snapshot. Root and chat therefore have different effective sampling times.
- Input-command version 1 instead loads admission-time secret-bearing bytes from a volatile settings owner. The actual current capability is input version 1/foundation 4; the client selects this path for eligible classic requests and uses the prepared path for preset/module/custom-provider combinations. An initial inactive-path assumption was stale and has been withdrawn. The owner rejects changed effective/execution chat revisions before transform or attachment. A latest-context transition must cover both active paths and retain original input receipt identity, restart-loss handling and transform ownership.
- The ordinary path currently derives a durable settings digest from the full execution database. Replace this with a content-independent context identity rather than persisting a fingerprint of secret-bearing settings.
- Final prompt messages carry source message IDs in `memo`, but final IDs alone do not describe every input: history is read before token trimming, lore matching and memory preparation, and start/editRequest scripts can alter the prompt. `makeMs` also excludes disabled messages and supports an all-before boundary. Dependency tracking must account for these paths and avoid treating display metadata as prompt edits.
- Existing `notifyWarning` already renders the application's standard warning toast. Request-status entries are transient generation metrics, not a durable notification store. A narrow durable warning attached to the existing commit/result plus the pending-marker delivery lifecycle can support this goal without pretending the full G1.8 center exists.

## Implementation

1. Capture canonical root and selected full chat together inside the storage queue, after obtaining the execution lock and loading the bundle. Resolve the original input by ID and reject deleted/unknown-tail targets before provider work.
2. Supply that owned in-process snapshot to the execution bundle and remove stale client overlays for the new path. Preserve selection by character/chat identity, not mutable indexes. Recheck cancellation and current execution eligibility before starting paid work.
3. Separate original admission/input-receipt identity from assembly context. Retain restart fail-closed behavior. For raw-input commands, resolve capture/claim/transform/attachment ordering explicitly rather than treating admission settings bytes as latest or advancing a CAS revision against an older transformed payload.
4. Record the prompt input dependency boundary in process and compare it with canonical state at commit. Store only the resulting warning metadata, not a second settings/prompt archive or credential hash. Do not reinterpret the server's own pipeline edits as later user edits.
5. Deliver the warning through the existing upperbar/toast route, including return from a closed app and failed local adoption. Keep warning delivery separate from completion sound/ACK, and bound deduplication through the existing marker lifecycle.

## Validation

Exercise actual generated execution code with a paused execution lock: save different chat/character/lore/preset/module/global values while waiting, release, and inspect the context actually consumed. Cover edits before versus after capture, disabled/trimmed history, memory/trigger consumers, deletion, cancellation, custom endpoints and unsupported latest settings. Verify that credential changes leave no credential-derived durable digest.

Use real codec/SQLite/HTTP and process boundaries for receipt identity, old-record compatibility, restart loss, answer retention, warnings and G1.1/G1.2/G1.12 interaction. Perform applicable full tests, type/help checks, builds, composition/replan/exact revert, L3/L4 and final Opus review before delivery. The existing low free disk space must be resolved through a concrete non-destructive backup plan before live application; no old backup deletion is authorized by this plan.

## Current checkpoint and confirmed choices

- Connected `readAssemblyContext` to both prepared and raw-input execution. It samples canonical root/body/metadata in one storage-queue turn, returns an independently owned graph and a random context identity. Raw input captures again after durable input attachment.
- Wrapped the detached execution closure in a promise chain through terminal commit/publication/finish, preserving the inner preview lock. Actual route tests hold the first commit and verify that a second chat cannot capture before publication, reads the committed statics afterward, and also proceeds after first-commit failure.
- Full server, frontend, compatibility, type/help, build/load, patcher and exact-revert results are recorded in [the validation record](POCKETRISU-G1-3-ASSEMBLY-CONTEXT-VALIDATION.md). The candidate has not replaced the delivered experimental.12.
- User confirmed both recommended choices: the notice conservatively includes earlier history potentially read by preparation features, and unexecuted input translation/triggers use turn-time latest settings. Already executed input effects must not be replayed. The prior user decision to preserve newer user edits on script overlap remains in force, with a skipped-effect notice rather than silent loss.
- Source constraints confirmed after consultation: input1 is active; `effectiveBaseRevision` is tied to admission/predecessor identity by the parser and cannot be redefined as transform-time revision. A fresh transform basis must remain separate, and attachment/recovery need coordinated treatment. Global variables use expected-value outcomes. Input transformation may have external effects, so any attachment rebase must reuse the completed transform rather than rerun it.
- The detached strict save now explicitly enlists root and chat before admission. Server-owned execution ignores stale client globals; legacy execution retains them. The actual save implementation enlists root changes before strict flush, and flow tests assert scope before POST.
- Input record version 4 is retained with a validated `latest-v1` marker. New transform/attachment revisions do not replace admission identity. Actual prior-version read/recovery and retirement tests pass. Commit record v3 carries the warning; its operation-specific downgrade limit is documented in the validation record.
