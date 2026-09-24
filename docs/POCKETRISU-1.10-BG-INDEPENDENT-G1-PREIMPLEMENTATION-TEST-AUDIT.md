# PocketRisu 1.10 G1 pre-implementation test audit

Date: 2026-09-24 KST

Authority: public `docs/BG-PRESERVE-ORDERED-GOALS.md` for G1→G2→G3;
private `POCKETRISU-1.10-BG-INDEPENDENT-G1-ROOT-EFFECT-IMPLEMENTATION-PLAN.md`
for the next implementation sequence. This is an evidence and gap audit, not
product qualification. Candidate source before these diagnostic artifacts is
private patcher commit `8279d81` on `codex/pocketrisu-bg-independent`, applied
to official PocketRisu `98e968339d1b3f91b9dac85bb3f2ebb5f90f9d14`.

## 1. New disposable diagnostics

The original root-race patch (SHA-256
`82f7ab967b5f1fccd358269c59113f48aa4e1a187d80e0ce1209335da1bdbab8`)
contains five observational H1 cases. Apply the supplemental
`artifacts/pocketrisu-bg-g1-extra-exact-1.10-diagnostics.patch` (SHA-256
`db477e197ea58fe32b85aae47706907ceaabd4e7b513edc49b9db4f672ed0373`)
after it. The supplemental patch changes only the generated H1 test and a
test-only preview preload fault seam. The combined ten H1 diagnostic cases
passed together on two disposable exact-1.10 installer trees: 10 pass, 12
original H1 cases skipped by the filter. They use an actual spawned
`server.cjs`, SQLite, loopback HTTP, and a synthetic provider; no paid
provider, live process, or real browser was used.

Apply `artifacts/pocketrisu-bg-g1-cross-tab-client-diagnostic.patch`
(SHA-256
`de87149ea555cf6581fe4c8d3b555639c7867d871b45fef77584bae2d2e57e44`)
to the generated frontend test file. Its one focused test passed in both
disposable trees. The separate no-ETag acceptance patch (SHA-256
`fe461fa0a596d633ab1099b15ff618342f408dbb6fdabd3de45cbcec22668edf`)
is intentionally red on the current source; apply it after the observational
H1 patch only when running its one selected invariant case, never as part of
the green diagnostic batch.

| G1 surface | Current direct evidence | Meaning and limit |
| --- | --- | --- |
| Root statistic arbitration | Browser-first stored 12; N-first patch and conditional full-write retries stored 11; stale no-ETag full-write stored 10 while N's ledger remained; lost browser response followed by N first reached correct remote 12, then stale retry regressed to 11. | Confirmed C1/root writer integration defect in the explicit opt-in candidate. The no-ETag case also has a red invariant test. Actual browser caller timing is not proven. |
| N+1 after bad root | N+1 entered the provider gate after the N-first patch case had persisted count 11. | A successful predecessor receipt/value check does not by itself prove that independent browser effects survived. |
| Exact duplicate draft admission | A pure shared-storage two-tab schedule let both client calls pass the pre-marker check and issue two starts. A test-only pre-attach pause then let the server admit two distinct operation IDs with identical raw text as N and N+1; the synthetic provider ran twice. | Same text is a valid deliberate N+1 input, so the server must not deduplicate by prompt text. The client/host needs an exact submission identity or admission claim across tabs. This is not an actual two-PWA browser test. |
| Attached-input edit/delete | Normal chat HTTP full writes modified or removed N's attached input during provider wait. The late N result conflicted; the user's edit/deletion remained in normal chat and provider ran once. | Supports the revision fence for these two concrete normal API paths. It does not prove UI reroll, branch creation, or every metadata writer. |
| Joined retention | After terminal result ACK, then removal of short-lived result/state and process restart, input-command and commit-recovery KV rows remained and exact status still reported `chat-committed`. | Their current lifetime is not joined to result/state expiry. Do not label this automatic data loss or safe cleanup: successor lineage and duplicate suppression may still need these records. The test does not simulate a real 48-hour wall clock. |

Focused existing tests were not rebuilt as new evidence. The prior candidate
already covered C1 transaction rollback, post-commit restart, start-ACK loss,
input transform once, N→N+1 drain, cancelled/blocked predecessors, global
conflicts, hydration CAS, capability 0 fallback, and storage failures at
unit/process level. The current source's relevant owner/context/projection
and client conflict/input/statistics sets were rerun earlier in this audit
(53/53 and 24/24). Session-lock tests passed 13/13 and pending-send/statistics
tests passed 15/15. The preceding full server/frontend/build/patcher/graph
receipts apply only to the source and environment documented in the G1
rebaseline; these diagnostic patches are test-only and do not requalify a
future production fix.

## 2. G1 goal-by-goal boundary

| Goal | Reusable evidence | Remaining test or contract |
| --- | --- | --- |
| G1.3 server commit/failure | H1 spawned process, SQLite transaction fault seams, canonical chat readback, provider/commit replay counts. | Cross-owner root writes can later change an already committed effect. Preserve the C1 atomic receipt claim but do not call end-to-end effect preservation complete. Recheck after the root fix. |
| G1.4 input, order, conflict, lifetime | Automatic drain, N+1/cancel/edit unit cases; new HTTP edit/delete and root-race/retention diagnostics. | Root effect once-only protocol; joined input/result/commit/context retention and its expiry/reference test; UI reroll/branch and settings conflicts; deliberate versus accidental identical drafts. |
| G1.5 general client | Pure admission/start/marker and adoption tests; candidate composer hook; new two-tab pure scheduling test. | Cross-tab exact admission owner, browser settings/root save race, empty-local and stale-local adoption, old-client fence, client-only path preservation. `inputCommandVersion=0` does not fence separately negotiated `serverChatCommitVersion=1`. |
| G1.6 qualification/delivery | Earlier complete automatic suites, build, graph and revert receipts on their exact checkpoint. | Post-fix final suites and L2.5; production bundle parity; actual browser process exit with normal chat API read **before reopen**; iPhone scenarios; safe live apply and direct check. None are established by these diagnostics. |

## 3. What cannot be honestly completed before choosing/implementing the contract

The saved five root-race cases intentionally assert the current bad outputs.
Only the old no-ETag write has a contract-independent red acceptance test.
Patch/full-write retries must be changed to call the eventual browser-effect
identity protocol; changing their expected final number while retaining the
old manual scalar merge would test the wrong implementation. Convert them to
red invariant tests **at the actual new caller** before production changes,
then make them green without increasing provider calls.

Actual browser/PWA return, same-device two-tab scheduling, iPhone lifecycle,
custom plugin behavior, and full model-bundle ax→main→post parity cannot be
promoted from the synthetic preload. Run them against the post-fix candidate
at G1.5/G1.6. Until then, keep both server-commit and input activation claims
unqualified. No AC source change or G2/G3 implementation is required to
close any diagnostic in this audit.
