# G1.3 assembly-time context validation

Date: 2026-09-30 KST. Baseline: `a070a6b` (device-confirmed G1.1). Candidate: `0.2.4-experimental.13`, lazy-chat-bg-adapter `0.7.20`, lazy-chat-sync `0.5.6`.

Status: implemented, automatically verified and reviewed in an isolated candidate; live delivery awaits backup capacity. No stable release or device qualification is claimed.

## Behavior

Server-owned generation reads the latest saved root settings and full selected chat when its execution turn begins. Prepared inputs preserve effects already performed by the browser. Raw inputs claim their transformation with current settings, attach those effects once, then read current state again for main prompt preparation. Original admission/input receipt identity is retained; separate transform/attachment revisions protect publication.

Newer user message, chat-variable and global-variable edits take precedence over overlapping input/server script changes. Independent effects still apply. Skipped effects use the existing notice. Changes to prompt-relevant chat content after assembly produce a separate warning while the generated answer is retained. The comparison conservatively includes history that preparation can read before final prompt trimming, as explicitly selected by the user.

The ordinary client flushes root settings and the selected chat before admission. Server-owned execution does not overlay stale client globals. Settings identities are opaque random values, not hashes of credential-bearing roots. Volatile admission bytes remain only for process-continuity checks; they are not used as execution settings and are not persisted. A restart does not rerun uncertain input effects.

Detached serialization now includes terminal commit/publication/finish. A following chat therefore cannot capture its context between a predecessor's preview and commit. Legacy non-detached previews keep their existing client-supplied context and do not canonical-commit.

## Evidence

- Generated execution function: latest prepared root/body, raw input claim and main contexts, concurrent user history edits, already-attached zero replay, real eligibility policies and input attachment helpers.
- Full frontend: 2,050 pass / 4 existing conditional skips before the final strict-flush/terminal-conflict assertions; final affected client suites: 76/76. Final server conflict batch: 73/73; actual process regression: 28/28.
- Full server: 444 pass / 12 existing skips, including four temporary tests using the actual previous input owner. The maintained server suites account for 440 passing tests. Separate actual-old-owner compatibility/retirement proof: 6/6.
- Compatibility server suite: 74 pass / 5 existing skips. The first sandboxed attempt could not bind loopback; the authorized execution passed.
- Type/Svelte diagnostics: 0 errors / 0 warnings. Help-language check passed. Frontend build and BG bundle build/load passed; existing dependency/dynamic-import warnings remain.
- Patcher suites: 51/51. Composition: 42 packs, 1,191 units, 7 declared collisions. Re-plan after apply: zero changed files. Exact revert: 1,022 baseline files, zero byte/mode mismatches.
- Installer: 5,683,344 bytes, SHA-256 `fb92ea40d2ea321b1c1698b7cdbbaa7c44069313209c1c771d207423d91bcd88`.

L3 inspected maintained/generated boundaries, queue ownership, test assertions and transaction/replay coverage. L4 traced strict save, both preparation branches, atomic attachment, delayed publication, commit replay and client warning/ACK behavior. Synthetic providers and process harnesses do not establish real model quality or iPhone suspension behavior.

## Consultation and compatibility

The final Opus 5.5 review and targeted follow-ups found no confirmed delivery-blocking defect after the post-attachment failure fix and notice mapping. The final optional test suggestions were adopted: boot/watch distinguish no-provider notices from retained-result notices, and unit cases cover mapped reasons, unknown reasons and prototype keys. No application code changed after the final notice review. Device false-positive checking and the documented storage-failure/downgrade limits remain.

Opus consultation led to whole-turn serialization, separate transform/attachment bases, reuse of the G1.1 merge via a non-persisted sentinel, and preservation of newer globals during recovery. A proposed input record v6 was replaced before delivery with version 4 plus a validated `attachmentPolicy: latest-v1` marker, so the prior server can still parse records. Original v4 and retired v5 records remain readable.

Actual old/new owner tests confirmed queued/running/attached/blocked and retired records. A suggested rollback/re-upgrade parser relaxation was not adopted: the old process lacks the volatile settings context needed to claim a marked queued record. The reviewer withdrew that concern after the source trace and experiment. Strict marker validation remains.

Commit records with the new warning use v3. The previous server reports a conflict for such an individual receipt and retains it; it does not fail startup. Reverting application files does not downgrade these records. Restore/recovery must retain the new receipt reader or use the documented stopped backup; do not rewrite or delete records to make an old reader accept them.

## Remaining gates and limits

The final review raised a post-attachment preparation failure. Direct tracing confirmed that a semantic conflict could leave the raw input attached and pending after the run was discarded. The candidate now durably settles that input as failed, releases its volatile context, and publishes the specific conflict without provider work or input replay. If recording failure fails, it keeps the recoverable command. The generated runner and actual owner/route tests cover this; the final affected server batch passed 73/73. This also preserves specific prepared-path conflict reasons. The production cancel route synchronously aborts the controller, covering cancellation after a queued context read.

The corresponding terminal-error notice maps the known conflict reason to Korean and uses G1.12 acknowledgement/cleanup. A terminal-success/partial insertion conflict still retains its generated result. If recording the failed input itself fails, no terminal result is fabricated: the attached command remains recoverable and can remain pending until storage recovers or restart reports unknown execution. This is the deliberate fail-closed storage-error boundary.

Live application awaits sufficient space for a verified stopped backup. Existing backups and live user data remain untouched. After delivery, verify actual iPhone edit/save during a long generation, close/reopen, retained answer and edit, warning delivery and subsequent save. Stable qualification remains separate.

Also run a negative device check: open/scroll a long-running chat without editing, close/reopen, and confirm that no context-change warning appears. Placeholder hydration preserves metadata key presence and does not save its empty defaults; no concrete normalization writer causing a false warning was found, but the device case has not been observed.

Warnings use the existing toast and ordinary pending marker, not a general notification center. Raw-input-only recovery has page-local deduplication; after a failed ACK and reload it may warn again. Unsupported newly selected client-only input/output settings block before the corresponding provider work. Already completed input work is never replayed to use newer settings. Manual input translation already completed in the browser is not repeated.

The warning comparison concerns chat content. Later changes to root settings or global variables alone do not produce this warning. A user-initiated replacement of a blocked, unattached submission is a new submission and can run input effects again; the original operation is never automatically transformed again. Ambiguous duplicated legacy tail messages without IDs remain a conservative conflict.

A permanently stalled commit holds subsequent detached turns; the preview timeout does not release a still-running storage write. Worst-case root/chat-copy memory cost and real iOS suspension behavior are not measured by these tests. The unrelated home-navigation bug and G1.4 onward remain separate goals.
