# G1.8 failure, retry, notification and recovery lifecycle

2026-10-11 KST. Baseline85cd2f9 / experimental.34, BG adapter0.7.41 and lazy-chat-sync0.5.6. User requested G1.8 execution. Keep existing unrelated work, plugin originals, custom/local/native configuration and production hostOFF. No paid provider, generation cancellation, stable release or bulk user-data cleanup is part of qualification.

The user explicitly approved automatic retirement of NEW input/commit journal payloads after49hours once completion, exact receipt and remaining-reference checks pass, including when the original chat has been deleted. Existing legacy journal bytes remain protected. Notification TTL48h and recovery retirement49h are separate policies; the latter retains the existing recovery margin.

## Completion contract

- Exercise native retry/fallback through final callers; distinguish the original repeated analysis from host-created replay. A failed provider must remain failed after exhausted retries; caught nonprovider omissions preserve the previous chain value and visible effects.
- Qualify input/analysis/main worker/process loss, restart, partial and committed results. Retain raw input, known paid effects/results, exact commit identity and no automatic paid restart. The next healthy request must remain usable.
- Store host-observed final failure/restart/edit/conflict notices while the app is absent and deliver through the existing visible notification channel. Preserve primary terminal outcomes during outbox failures, with durable retry intent, fixed codes/no provider bodies, bounded retention and versioned reader compatibility.
- Distinguish a proven already-applied commit whose target is absent from metadata AND hydrated storage from hydration-only failure, unapplied publication, corrupt/missing journal and receipt/sequence mismatch. Preserve deliberate absence and do not replay model/global/stat effects. Genuine unknown states remain pending.
- Bound operation-journal payload lifetime in memory and future retained recovery material. Existing payload bytes are not swept merely to eliminate warnings. Preserve old recovery/source material and document legacy storage separately from new retention policy.
- Matching source/installer tests, L3/L4, source counsel, graph/re-plan/exact revert and safe OFF delivery/readback. Physical absence/return/notice/dismiss/next-send L5 remains a concrete user gate before stable/aggregate completion; automatic browser evidence is recorded separately.

## Source observations

The commit owner `publishCanonicalState` checks an existing applied receipt, but throws when its hydrated chat is absent even if canonical metadata is also absent. `pendingCommitRecovery` then treats the result as retryable indefinitely. The committer validates the stored record and journal before canonical publication; those checks must survive classification. Existing tests protect non-resurrection but do not prove terminal absence classification.

`chatWriteJournal.ensureLoaded` decodes and retains all operation journal chat objects. `restoreInto` and `clearAfterDatabasePersist` skip operation records. Commit retirement writes an exact compact receipt and removes recovery metadata after the shared horizon, but does not remove the owned operation journal. Ordinary journals, first-stub pressure, transaction rollback and new-chat recovery must remain intact.

The minimum notification producer covers unsupported input. Current plugin producers cover permission/API/hook/provider/limit/late-call/CAS/settlement observations. Final native generation/restart/commit-edit outcomes need direct caller-to-durable-outbox coverage; original network success is not semantic analysis success. Existing actual process probes already cover selected crash/restart/retry ownership and can be reused only where source/contract match.

## Implementation sequence

1. Recovery classification: add failing genuine-owner cases for complete absence, metadata-only/hydration-only absence, unapplied records, corrupt/missing journal and ledger/sequence mismatch. Add an explicit non-published terminal absence outcome only with validated durable ownership; improve startup classification instead of suppressing errors by counts.
2. Journal lifecycle: keep operation metadata without caching whole chat bodies at load, prepared publication and durable restore; on-demand validation must still read immutable payloads. Cover BOTH input-attachment and result-commit journals. Add transactional journal+recovery retirement for newly versioned retention-eligible records, preserving compact receipt and ordinary journal contracts. Legacy bytes remain protected; no automatic legacy backfill/delete. Verify rollback, missing/corrupt payload, age, active/result/input ownership and immediate memory publication boundaries.
3. Final failure notices: trace generated admission/result/state/restart consumers before selecting hooks. Use authoritative new-operation opt-in and durable source intent, no historical failure backfill. New fixed operation codes require a versioned namespace/reader path; do not disguise native failure as a plugin. Publication/storage failure cannot turn an existing failure into success or trigger effects again.
4. Maintained actual retry/fallback/failure and browser outbox matrix: configured retries0/1/multiple, fallback, final failure, input/analysis/main loss, committed-before-publication and competing edits; store/list/claim/ACK/lease/TTL/corruption/capacity and browser hidden/return/restart/lost ACK. Use synthetic endpoints with no production credentials; independently assert analysis/main/effect/commit counts and retained input/answer.
5. Broad structural/runtime audit, relevant full suites, source pairing/build/load, graph/exact revert, fresh Opus source consultation, privacy sweep and explicit-path commits/push. Idle/verified rollback-gated OFF delivery and independent readback close automatic work; device/activation/stable boundaries remain explicit.

## Decisions to resolve with source consultation

Use an additive terminal absence outcome rather than pretending chat publication succeeded. It must not grant current-context readiness or mark a missing chat as hydrated. Input finalization and effect lineage must recognize the exact outcome without replay.

Source consultation confirmed the published-ledger ownership and restore/reset coupling, but cache-only absence is not durable proof. Fresh recovery may return a nonpersistent absence disposition. A new input absence marker and retirement must recheck an immutable persisted-root snapshot and its unchanged bytes inside the transaction, plus current absence/receipt/sequence. Predecessor and retirement may accept the marker only while its target remains absent; reappearance restores ordinary readiness rules. Metadata-present/hydration-missing receives a distinct structured failure class; unapplied records continue normal validated publication recovery. Effects lineage remains intact.

Prefer metadata-only operation journal cache over a new generic cache abstraction. New retention eligibility should be explicit and backward-compatible, leaving legacy user payloads unchanged. The retention horizon reuses the existing shared recovery policy; no new arbitrary timing threshold or unbounded-memory assertion.

Prefer a small operation-notice owner at existing final-state boundaries with source retry after restart. Exact consumer hooks and compatibility will be settled after tracing, without moving existing pack ownership. Distinguish source failure durability from UI enqueue, human observation and external provider cancellation.
