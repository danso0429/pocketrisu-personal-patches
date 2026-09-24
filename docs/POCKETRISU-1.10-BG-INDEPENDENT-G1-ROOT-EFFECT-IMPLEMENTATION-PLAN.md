# PocketRisu 1.10 BG Preserve G1 root-effect implementation plan

Date: 2026-09-24 KST

Status: diagnostic evidence and implementation gates. No product activation,
live application, Archive Center change, or release is established by this plan.

## 1. Authority and outcome

The public `docs/BG-PRESERVE-ORDERED-GOALS.md` controls G1 → G2 → G3. This
document is the current private G1 execution plan. The old BG×AC H0–H7
next-work/fresh-start documents are historical and must not drive G1 work.
The separate fresh-session entry point is
`POCKETRISU-1.10-BG-INDEPENDENT-G1-FRESH-START.md`.

The required user result is unchanged: after a supported BG request is
accepted, the server completes and commits chat and effects without a browser,
and a returning client adopts the normal chat without replaying generation or
effects. A foreground/client-owned send in another chat remains usable. Its
independent statistics effect must neither disappear nor be counted twice.

The current G1 candidate advertises `inputCommandVersion=0` but independently
advertises `serverChatCommitVersion=1`. The existing BG client can negotiate
commit v1 while input v1 remains disabled. Therefore **input capability 0 is
not a safety fence for the root-effect defect**. Neither version may be
considered delivery-qualified before the root contract and its tests close.

## 2. Exact evidence boundary

Source checkpoint before this plan: private patcher branch
`codex/pocketrisu-bg-independent`, commit `8f768d8`. Official PocketRisu
target: `98e968339d1b3f91b9dac85bb3f2ebb5f90f9d14` (`v1.10.0`). The
candidate installer and its byte-identical compatibility filename are
8,498,000 bytes, mode 0755, SHA-256
`6d38c205e74e4113f294175ee022186308f6d6d23a4bc6313746c505ea035e88`.
Recheck all of these rather than assuming that a later worktree still matches.

The replayable diagnostic patch is
`artifacts/pocketrisu-bg-root-race-exact-1.10-diagnostics.patch`, SHA-256
`82f7ab967b5f1fccd358269c59113f48aa4e1a187d80e0ce1209335da1bdbab8`.
It applies only to a disposable official 1.10 tree **after** the G1 installer.
It changes a generated test file, not production source. Its forward apply
check and actual five-test run with `--unidiff-zero` passed in a second fresh
exact-1.10 replay tree (5 pass, 12 filtered/skipped); its reverse check
passed in the original test tree. The patch has no context
lines, so verify the generated test file's pre-patch SHA-256
`642ff4fec39d27132ea46107741a05fab0dc625a0f4d676517422c4fca8642dc`
before applying it. The five diagnostic H1 tests passed together
(5 pass, 12 existing tests skipped by the filter). They use a spawned actual
`server.cjs`, SQLite, loopback HTTP, and a synthetic provider preload; they
are not actual browser, device, or paid-provider evidence.
They intentionally assert the observed pre-fix behavior; convert them into
red acceptance tests for the required results before implementing a fix.

| Deterministic order / protocol | Observed persisted `statics.messages` from base 10 | Required semantic result |
| --- | ---: | ---: |
| Browser +1 saved before N +1 commit | 12 | 12 |
| N commits first; stale browser +1 uses patch-sync 409/rebase | 11, BG ledger still records N | 12 |
| N commits first; stale browser +1 uses conditional full-write 409/rebase | 11, BG ledger still records N | 12 |
| N commits first; old full write omits ETag | 10, BG ledger still records N | Must reject or reconcile without regression |
| Browser +1 actually committed but its HTTP response was lost; N then commits; stale client retries | Remote was 12; current rebase persisted 11 | 12, without applying the browser +1 again |

After the patch-sync loss case, the same synthetic process admitted N+1 and
reached its provider gate from the incorrect count 11. A separate pure test
also showed that receipt/value overlay can accept that collapsed count. These
are evidence that a value-equivalent root does not prove that all independent
effects survived. They do **not** prove that every actual browser caller can
reach the same sequence; browser/device qualification remains required.

Relevant source facts:

- Browser `sendChat` increments `statics.messages`; existing legacy BG result
  merge can also apply an operation-keyed cumulative delta. Server commit C1
  applies its own delta and records `bgOrchestrationApplied`.
- `/api/patch` rejects an outdated root hash. The client then performs a
  three-way rebase whose equal changed scalar values collapse into one and
  whose different same-key scalar values prefer local.
- Both `/api/patch` and `/api/write` call `preserveDatabaseState`; it copies
  server-owned receipts/projection and the BG statics ledger but does not own
  `statics.messages` or all `globalChatVariables` values.
- The normal full-write caller sends `x-if-match` when its ETag is known. The
  server currently accepts a missing validator; fresh-database bootstrap has
  a no-ETag write path. Do not reject all such writes without caller analysis.
- The legacy client helper trims its in-memory/durable BG statics ledger view
  to 128 entries, while the current C1 server owner appends to its canonical
  ledger without that same cap. Root writes preserve the server ledger. The
  cross-version retention and replay boundary must be measured; a new design
  cannot assume either indefinite proof or a universal 128-entry limit.

The focused owner/context/projection server set passed 53/53; the focused
client conflict/input/statistics set passed 24/24. The earlier whole-server,
whole-frontend, patcher, build, and graph receipts in
`POCKETRISU-1.10-BG-INDEPENDENT-G1-REBASE.md` predate this diagnostic
artifact and must not be relabeled as tests of a future fix.

## 3. Structural cause and non-goals

```text
browser baseline count 10
  ├─ browser-owned send creates a local +1 intent -> local count 11
  └─ N server commit creates a different +1 intent -> server count 11 + N ledger
       -> stale browser root write gets 409
       -> ordinary scalar three-way rebase sees local == remote == 11
       -> one +1 disappears; root writer accepts 11 and retains only N ledger
       -> later N+1 can start from that state
```

The C1 transaction itself still commits its chat/effect record atomically.
The defect is the subsequent cross-owner root write. Do not rewrite AC,
replace the chat database, or treat a server commit receipt as proof that
later client writes preserve every effect.

Do not implement `remote + (local - base)` as a generic scalar rule. The lost
browser-response case proves that the local +1 may already be in remote;
blind addition would change a correct 12 to 13. Do not fix the issue by
blocking every other chat send during BG work, discarding local edits, copying
all server root fields over the client, or silently disabling legacy result
delivery. These change existing normal behavior.

## 4. Implementation sequence and exit gates

### R0 — Rebaseline and reproduce

Start from a clean private G1 branch, exact 1.10 target, matching installer,
and the diagnostic patch. Read the public ordered goals and this plan. Run the
five diagnostic cases and the focused owner/client tests. Preserve all
existing worktrees, live data, AC snapshots, and unrelated dirty state.
Exit: exact source and evidence identities recorded; the five result rows
above reproduced or each difference explained from newly read source.

### R1 — Close the writer and intent map before design selection

Trace all `statics.messages` and `globalChatVariables` writers, including
foreground/auxiliary/failed sends, legacy BG result merge, C1 commit,
startup/restore/import, plugins, and dynamic or version-skewed root writes.
Determine whether the counter represents attempts, completed generations,
or another existing invariant. Inspect all no-ETag `database.bin` writers,
lost HTTP responses, client patch baseline handling, same-device tabs and
cross-device writer-lock behavior. Identify the exact retention/retry window
for any operation identity used as deduplication evidence.
Exit: a caller/owner table states the trigger, root intent, durable identity,
accepted HTTP path, failure/ACK behavior, and existing normal use to preserve.
Unresolved dynamic callers remain explicit surfaces, not an assumed absence.

### R2 — Select the smallest idempotent effect contract

Evaluate a narrow operation-keyed browser statistic effect, using an existing
stable generation identity where valid, against any smaller protocol change.
The server must distinguish "browser +1 already committed, response lost"
from "browser +1 never committed, N committed" before adding a delta. Define
how the identity survives retry/restart, how the count and proof commit
atomically, how bounded retention fails closed, and how old clients behave.
Keep `globalChatVariables` set/delete conflict semantics separate from this
additive statistic. If a narrower rebase-only design cannot distinguish the
two histories above, reject it rather than assuming it is safe. Record the
chosen design, alternatives, affected callers, and rollback before coding.
If the only workable design changes the supported user result or broadens
normal writer authority materially, present that impact for a user decision.

### R3 — Implement the root writer contract

Change only the necessary BG/host/storage patch owners. Apply the statistic
effect once at a durable boundary; preserve the browser effect through
patch-sync 409, conditional full-write 409, lost responses, retries, and
process restarts. Reject or safely reconcile stale no-ETag writes against an
existing root without breaking the verified fresh-database path. Keep chat
body, metadata, global user edits, server receipts/projection, and old client
behavior within their existing owners. Do not make the generic three-way
merge additive for arbitrary numbers.
Exit: the phase R5 matrix passes at the actual normal root API, not just a
pure merge helper; no second provider call or duplicate statistic effect.

### R4 — Join BG admission and capability gates

After a strict root flush, input admission must either observe a reconciled
canonical root/effect state or block while preserving the draft. A pending
N+1 cannot use a predecessor value check as a substitute for the root writer
contract. Treat `serverChatCommitVersion` and `inputCommandVersion` as
independent rollout gates: commit v1 is not delivery-qualified merely because
input v1 remains 0. Keep both unqualified in live until R3/R5/R6 close.

### R5 — Adversarial regression matrix

Use actual generated `server.cjs`/SQLite/normal chat API and focused client
tests for at least: both save orders; patch and conditional full write;
missing ETag on existing versus new DB; lost response before/after commit;
same browser operation retried; different browser operations; two BG N/N+1
operations; failed/cancelled N; same-key and different-key global edits;
cross-tab/cross-device ownership; local chat edit/delete/reroll; old-client
capability negotiation; ledger retention edge and unknown identity; provider
call count, full chat readback, counter, ledger, and receipt consistency.
Expected independent browser +1 and N +1 from base 10 is 12 in either
commit order; a retry must leave it at 12. User edits must not be overwritten
to make a test pass. A genuinely unknown effect must block before a new paid
generation rather than silently guess.

### R6 — Qualification and delivery

Run patcher-focused tests, deterministic installer builds, complete all-or-
nothing graph apply/current/re-plan/revert, target type check, whole server
and frontend suites, build, and L2.5 runtime audit separately. Then check the
normal chat API **before** browser reopen, run actual browser exit/return and
the concrete iPhone scenarios, and only then safe live apply and final
qualification. No official AC source edit, AC runtime substitution, or G2/G3
implementation is part of this G1 repair. G2 starts after G1 completion;
G3 starts after G2 completion.

## 5. Reporting and preservation

Keep functionality/owner changes in small independently revertible commits;
keep test receipts and docs tied to the source they actually exercised.
Report source branch/HEAD, target SHA, installer SHA, all observed counts,
unverified browser/live paths, and the capability values separately. Do not
promote source existence, a passing unit test, or an AC simulation to product
qualification. Live PocketRisu, PM2, provider calls, user data, and official
AC are outside the diagnostic target until the explicit delivery gate.
