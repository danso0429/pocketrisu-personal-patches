# PocketRisu 1.10 BG server chat save × Archive Center handoff index

- Handoff date: 2026-09-20 KST
- PocketRisu implementation/evidence checkpoint: `7ce42595564258c598f5ecd4a04c9962e17521bd`
- Private patcher branch: `codex/pocketrisu-bg-ac-server-chat-save`
- Public plan commit: `e09a3b640e2a928f046b1145a6e8565c026f53fc`
- Official PocketRisu target: `98e968339d1b3f91b9dac85bb3f2ebb5f90f9d14` (`v1.10.0`)
- Archive Center public base: `026dcbf3b45adcf69b254673d439b24e943115b3` (`4.3.1`)
- Archive Center candidate source tip: `9e23861901f15cae46817158a21ea873bbde6fe1`
- Live application: not performed for this candidate
- Product activation: not approved

## 1. Purpose and authority boundary

This document is the entry point for continuing the integration in a fresh
session. It identifies the minimum authoritative document set, the facts that
must survive the session boundary, the exact source checkpoints, and the
claims that remain unverified.

This handoff does not replace the public design plan or the detailed validation
receipts. It defines how to read them without treating foundation work as
product qualification.

The authority order is:

1. current repository instructions and safety policy supplied to the session;
2. the immutable public integration plan;
3. this handoff index and the accompanying next-work plan;
4. the central C0–C4 ledger for phase status;
5. phase-specific validation receipts for observed implementation evidence;
6. current source and tests when a document and code disagree.

The implementation checkpoint predates the handoff-document commit. Resolve
the current handoff commit with:

```bash
git --no-pager log -1 --format='%H %s' -- \
  docs/POCKETRISU-1.10-BG-AC-HANDOFF-INDEX.md \
  docs/POCKETRISU-1.10-BG-AC-NEXT-WORK-PLAN.md \
  docs/POCKETRISU-1.10-BG-AC-FRESH-START-INSTRUCTIONS.md
```

## 2. Required reading set

### 2.1 Read before changing code

| Order | Document | Why it is required |
| --- | --- | --- |
| 1 | [Public integration plan](https://github.com/danso0429/nai-studio/blob/e09a3b640e2a928f046b1145a6e8565c026f53fc/docs/POCKETRISU-1.10-BG-PRESERVE-SERVER-CHAT-SAVE-ARCHIVE-CENTER-PLAN.md) | Defines P1/P2 contracts, C0–C7, T01–T28, ownership, and the original acceptance boundary. |
| 2 | `docs/POCKETRISU-1.10-BG-AC-HANDOFF-INDEX.md` | Defines the current checkpoint, evidence boundary, terminology, and source map. |
| 3 | `docs/POCKETRISU-1.10-BG-AC-NEXT-WORK-PLAN.md` | Defines the dependency-ordered continuation plan and exit gates. |
| 4 | `docs/POCKETRISU-1.10-BG-AC-FRESH-START-INSTRUCTIONS.md` | Defines the reproducible fresh-session startup and first task. |
| 5 | `docs/POCKETRISU-1.10-BG-AC-C0-VALIDATION.md` | Central execution ledger. Its latest sections supersede earlier phase shorthand. |
| 6 | `docs/POCKETRISU-1.10-BG-AC-C3-CONNECTION-HARDENING-VALIDATION.md` | Current PocketRisu owner, recovery, and R1–R5 boundary. |
| 7 | `docs/POCKETRISU-1.10-BG-AC-H1-COMPOSED-PROCESS-VALIDATION.md` | Generated Node process, restart, failure, retention, and blank-client evidence. |
| 8 | `docs/POCKETRISU-1.10-BG-AC-C4-INDEPENDENT-SNAPSHOT-VALIDATION.md` | Current Archive Center source/resolver evidence and remaining C4 gate. |
| 9 | `docs/PATCHER-V2-DESIGN.md` | Current all-or-nothing delivery and complete-graph rules. |

The public plan must match SHA-256
`ef71282428589d3833a51c68130398bbdd8e6677d6b7bb00c4bc505981711ca6`.
If the current public branch has moved, use the immutable commit-linked file,
not an unreviewed newer version.

### 2.2 Read when reconstructing prior work

| Subject | Document |
| --- | --- |
| Full environment, implementation history, file comparison, and commit index | `docs/POCKETRISU-1.10-BG-AC-INTEGRATION-PROGRESS-REPORT-2026-09-20.md` |
| Node storage and pre-canonical input characterization | `docs/POCKETRISU-1.10-BG-AC-C0-E-NODE-STORAGE-CHARACTERIZATION.md` |
| Output-stage and owner characterization | `docs/POCKETRISU-1.10-BG-AC-C0-F-OUTPUT-OWNER-CHARACTERIZATION.md` |
| Atomic server chat/effect commit | `docs/POCKETRISU-1.10-BG-AC-C1-SERVER-COMMIT-VALIDATION.md` |
| Opted-in BG result commit | `docs/POCKETRISU-1.10-BG-AC-C2-SERVER-RESULT-COMMIT-VALIDATION.md` |
| Initial projection, hydration, and input foundation | `docs/POCKETRISU-1.10-BG-AC-C3-FOUNDATION-VALIDATION.md` |
| PocketRisu immutable settings snapshot | `docs/POCKETRISU-1.10-BG-AC-C3-SETTINGS-CONTEXT-VALIDATION.md` |
| Owner-level N+1 predecessor foundation | `docs/POCKETRISU-1.10-BG-AC-C3-NPLUS1-FOUNDATION-VALIDATION.md` |
| AC-off generated process boundary | `docs/POCKETRISU-1.10-BG-AC-H1-COMPOSED-PROCESS-VALIDATION.md` |
| AC source snapshot provenance and restore procedure | `docs/POCKETRISU-1.10-BG-AC-ARCHIVE-CENTER-SOURCE-SNAPSHOT.md` |

These documents are evidence records, not a requirement to repeat already
closed tests at the beginning of every session. Re-run a completed gate when
the relevant source changes, its environment is no longer equivalent, or a
contradictory observation appears.

### 2.3 External audit disposition

An external audit supplied five findings, R1 through R5. The source audit file
was an input to the work but is not required for continuation. Its findings,
reproductions, fixes, and remaining limits are normalized into
`POCKETRISU-1.10-BG-AC-C3-CONNECTION-HARDENING-VALIDATION.md`.

The separately referenced audit-evidence ZIP was not available in this
workspace. Do not claim that ZIP was independently opened or verified. The
current regression fixtures and validation receipt are the reproducible local
evidence for the accepted findings.

## 3. Exact source checkpoints and preservation state

### 3.1 PocketRisu integration source

The authoritative implementation is the private patcher branch
`codex/pocketrisu-bg-ac-server-chat-save`. At H1 closure:

- implementation/test commit `7ce4259` contains the composed-process H1
  harness and generated artifacts;
- `df7fed7` contains the handler-level AC-off HTTP evidence and final updated receipts;
- `3315e4d` is the production-source R1–R5 hardening commit;
- `a286b96` changes the server test fixture only;
- H1 changes test/harness ownership, manifest version, and generated installers,
  but no production runtime unit;
- no candidate source was applied to the live PocketRisu checkout.

The exact worktree path is environment-local and must be discovered with
`git worktree list`; do not assume a stale absolute path from an older session.

### 3.2 Archive Center candidate source

The original Archive Center candidate remains a clean local branch at
`9e23861901f15cae46817158a21ea873bbde6fe1`. It is 15 local commits above the
public base and was not pushed upstream.

The exact final source tree is additionally preserved in this repository as:

`artifacts/archive-center/pocketrisu-bg-ac-026dcbf-to-9e23861.patch`

The snapshot contract is:

| Field | Required value |
| --- | --- |
| Patch format | Git full-index binary diff |
| Size | 428,942 bytes |
| Mode | 0644 |
| SHA-256 | `d70dac9ef7386464ef8bc5bf9fd0259b7b4c821af321325445abc92a5e6d574d` |
| Public base | `026dcbf3b45adcf69b254673d439b24e943115b3` |
| Applied path count | 28 unique paths |
| Restored tree | `7806dd39f4acfa294ee67f9d7834bc6fed448730` |

The patch preserves the final tree, not the 15 original commit objects. It
contains no commit author metadata. A restored tree matching the expected tree
is valid source reconstruction; it is not proof of test or runtime success in
the restoring environment.

### 3.3 Generated PocketRisu artifacts

At `7ce4259`, the two generated installers were byte-identical:

- `dist/pocketrisu-patcher.cjs`
- `dist/pocketrisu-all.cjs`

Observed artifact properties:

- size: 8,327,213 bytes;
- mode: 0755;
- SHA-256: `b3eab53d687d0bda5f9d8cc82aa09493945f1a61af4d1f8f7d08f2b500162012`.

The generated BG bundle in the exact candidate target was:

- size: 8,864,777 bytes;
- SHA-256: `665930741f404a1d1d451b5c49b99abd73e55f52632525cf1b017afc03f66afd`;
- load check: `sendChat`, `runTrigger`, and `processScript` exported.

Generated `server/node/bgOrchBundle.mjs` is not an authoritative source file
and must not be edited directly.

## 4. Phase terminology and current status

The phrase “C0 complete” has a narrow meaning: the C0 environment,
characterization probes, and store primitives were completed. It does not mean
that the five P1 and two P2 product contracts passed.

| Phase | Current meaning | Activation status |
| --- | --- | --- |
| C0 | ENV and A–F experiments/store primitives recorded | Foundation only |
| C1 | Atomic original-chat/effect commit primitive implemented and tested | Internal primitive |
| C2 | Explicitly opted-in BG final result reaches the C1 owner | Ordinary client unopted |
| C3 | Projection, hydration, input owner, immutable settings, N+1 lineage, causal recovery, and R1–R5 hardening implemented | `inputCommandVersion=0`; not active |
| H1 | Generated AC-off Node process, normal-chat readback, empty-client adoption, named restarts, and transaction failures verified | Evidence complete; capability remains 0 |
| C4 | AC process-memory context owner and captured-only settings resolver implemented | No production route or caller |
| C5 | Host adapter and output-stage parity | Not implemented |
| C6 | Unified claim/change/prepare/complete/effect/retention lifecycle | Not implemented |
| C7 | Combined live/browser/device qualification | Not performed |

The next implementation task is not capability activation. It is H2 Archive
Center production context transport and consumers described in the next-work
plan.

## 5. System ownership model that must be preserved

### 5.1 PocketRisu ownership

```text
client admission request
  -> durable input owner
  -> immutable admission sequence
  -> exact adjacent admission identity
  -> independently selected unresolved execution dependency
  -> fixed same-process settings context
  -> provider execution
  -> atomic server chat/effect commit
  -> canonical publication marker
  -> revision-bound projection
  -> client hydration/adoption without client save ownership
```

The important distinction is:

- `queuePredecessorId`: the exactly adjacent admission, used for sequence and
  tamper validation;
- `executionPredecessorId`: the earlier unresolved operation that must settle
  before provider work may begin.

Collapsing these identities recreates the cancellation-bypass defect.

Input record v4 records canonical publication as `pending` or `published`.
This distinguishes an unpublished durable response from a later user edit or
answer deletion. Record v3 is intentionally rejected, and production
activation requires either proof of zero v3 rows or an explicit migration.

### 5.2 Transaction and volatile-context boundary

```text
SQLite transaction
  -> durable input terminal settlement
  -> commit sequence and recovery rows
  -> chat, metadata, and effect persistence
COMMIT
  -> canonical publication retry surface
  -> serialized settings-context release
  -> serialized publication marker
```

Process-memory settings must not be deleted inside a SQL transaction. A SQL
rollback must leave the exact settings snapshot available. Successful durable
commit releases the snapshot after commit even if canonical publication still
requires recovery.

### 5.3 Server result ownership

New server-owned results carry `serverChatCommitVersion: 1`. Legacy records
omit the field. The client classification is:

- `legacy-client-owned`;
- `server-committed`;
- `server-owned-uncommitted`.

The server-owned-uncommitted fence must execute before order ACK, legacy client
save, or provider fallback. Server-owned intermediate result delivery is
disabled. Durable input ownership remains the minimum fallback after result
and operation-state removal for the current input-command path.

### 5.4 Startup recovery

Recovery alternates input-journal and response-journal passes until there is no
pending work, a pending-state signature repeats, or the record-derived pass
bound is reached. This permits input N → response N → input N+1 causal recovery
without an unbounded startup loop.

An already durable user input is republished before missing process-memory
settings is reported. Restart does not resume paid model execution from lost
settings, but it must not hide the stored user message.

### 5.5 Archive Center context

`pocketrisu_execution_context.v1` captures device allowlist material, backend
runtime settings, preprocessing configuration, and embedding fallback material
under the existing runtime lock. The resolver uses only captured material.

Current invariants:

- full secret-bearing material exists only in process memory;
- the public digest is secret-independent;
- exact identity/material replay reuses one owner;
- changed material under the same identity conflicts;
- partial device authority never inherits backend credentials;
- returned retry and preprocessing maps are independent copies;
- resolver code does not reread current server state, environment, or the
  preprocessing file.

Current omissions:

- no authenticated external DTO/route;
- no production prepare, complete, or provider caller;
- no HostSessionExecution/HostPrepare join;
- no prompt-file content snapshot;
- no release, tombstone, retention, or compaction policy.

## 6. R1–R5 audit findings and disposition

| ID | Original defect | Implemented disposition | Still not proven |
| --- | --- | --- | --- |
| R1 | Cancelling a waiting admission allowed a later command to bypass older active work | Adjacent admission and execution dependency are separate and both validated | Browser/UI path remains inactive |
| R2 | Editing/deleting after completion could bind new work to a historical completed revision | Publication state and current-head admission rules distinguish new head from pending publication | Integrated branch/reroll policy belongs to C6 |
| R3 | One input pass followed by one commit pass omitted a durable successor input | Bounded alternating causal recovery with actual SQLite fixture | Real child-process kill timing is pending |
| R4 | SQL rollback restored durable input but lost in-memory settings | Durable settlement is transactional; volatile release is post-commit and serialized | Cross-process restart still cannot restore secrets by design |
| R5 | Server commit failure fell through to browser save/ACK | Ownership classification and fences run before ACK/save; input owner retains the current-path identity | Actual browser exit and joined TTL retention remain pending |

Do not reopen these fixes merely because a new session lacks conversational
history. Reopen a finding only when the composed-process or later product test
contradicts the recorded behavior.

## 7. Authoritative implementation map

### 7.1 PocketRisu source owners

| Responsibility | Authoritative source |
| --- | --- |
| Durable chat delta and journal | `patches/lazy-chat-sync/files/server/node/chatDelta.cjs`, `chatWriteJournal.cjs` |
| Atomic server chat commit base | `patches/lazy-chat-sync/files-1.10/server/node/serverChatCommit.cjs` |
| Input record v4, lineage, projection state, settings identity | `patches/lazy-chat-bg-adapter/files-1.10/server/node/serverChatInputOwner.cjs` |
| Atomic response owner and startup reconciliation | `patches/lazy-chat-bg-adapter/files-1.10/server/node/serverChatCommitOwner.cjs` |
| Same-process PocketRisu settings | `patches/lazy-chat-bg-adapter/files-1.10/server/node/serverChatSettingsContext.cjs` |
| Revision-bound public projection | `patches/lazy-chat-bg-adapter/files-1.10/server/node/serverChatExecutionProjection.cjs` |
| Server/client result ownership classifier | `patches/lazy-chat-bg-adapter/files-1.10/src/ts/bgServerCommitHydration.ts` |
| Blank-client normal storage adoption | `patches/lazy-chat-bg-adapter/files-1.10/src/ts/storage/serverCommittedChatAdoption.test.ts` and composed target `src/ts/storage/chatStorage.ts` |
| Generated process and empty storage integration | `bgServerChatProcessBoundary.test.ts`, `bgServerChatProcessPreload.cjs`, `bgServerChatProcessClient.cjs`, and `bgServerChatProcessAdoption.test.ts` |
| Server route/startup and client wiring | `patches/lazy-chat-bg-adapter/manifest.cjs` |
| Base lazy storage/server replacements | `patches/lazy-chat-sync/manifest.cjs` and `patches/lazy-chat-sync/files-1.10/**` |

The manifest is authoritative for insertions into upstream or other pack-owned
files. A composed target file is a review output, not the only source of truth.

### 7.2 PocketRisu focused tests

| Boundary | Test source |
| --- | --- |
| Input owner, lineage, cancel/edit/delete, recovery | `serverChatInputOwner.test.ts` |
| Commit transaction, rollback, settings release, causal recovery | `serverChatCommitOwner.test.ts` |
| Route, actual SQLite, AC-off HTTP request boundary | `bgServerChatCommitRoutes.test.ts` |
| Generated process, restart, failure, retention, and blank client | `bgServerChatProcessBoundary.test.ts` and `bgServerChatProcessAdoption.test.ts` |
| Projection | `serverChatExecutionProjection.test.ts` |
| Client ownership and hydration | `bgServerCommitHydration.test.ts` |
| Patcher ownership and composition contracts | `test/bg-ac-chat-projection-c3.test.cjs`, `test/bg-ac-server-commit-c2.test.cjs`, and related `test/bg-ac-*.test.cjs` |

### 7.3 Archive Center source owners

The exact 28-path AC diff is listed in section 17.5 of the integration progress
report. The main responsibilities are:

- durable host execution claim and settle store;
- ordered host-change/source-generation store and invalidation fences;
- durable host prepare registry;
- process-memory PocketRisu execution-context registry;
- captured-only effective settings resolver;
- migrations, HTTP contract probes, and focused/full/race tests.

Use the restored tree or the original clean local candidate. Do not infer the
candidate from the public AC base alone.

## 8. Verified evidence at the handoff checkpoint

### 8.1 PocketRisu automated evidence

| Gate | Observed result |
| --- | --- |
| Patcher source | 52/52 files passed |
| Focused frontend | 2/2 files, 39/39 tests passed |
| Focused server owner/route/process | 4/4 files, 61/61 tests passed |
| Complete frontend | 153/153 files, 1,743/1,743 tests passed |
| Complete server | 29/29 files, 313 passed, 12 skipped |
| Compatibility | 10 files passed, 1 skipped; 74 passed, 5 skipped |
| Svelte diagnostics | 0 errors, 0 warnings |
| Production build | 7,941 modules transformed |
| Complete graph | 40 packs, 1,007 units, 358 managed paths, 13 ordered collisions |
| Immediate re-plan | 0 changed files |
| Exact revert | Target Git tree clean; delivery disabled; empty custom intent |
| Disposable target final state | clean, empty custom intent |
| H1 composed process | 11/11 passed twice; provider 1, commit 1, client save 0, ACK 0, fallback 0; six transaction failures and named restart/causal boundaries passed |

The AC-off HTTP fixture observed start ACK while a fixed provider gate remained
blocked. After the initiating request ended and the gate was released, it
observed provider count 1, commit count 1, result/projection/chat/hydration
completion, and client result ACK count 0.

H1 additionally spawns the generated production `server.cjs`, uses actual
SQLite and the normal-chat API, exits the initiating request process, restarts
the server at named durable boundaries, and runs actual NodeStorage/chatStorage
adoption in a separate blank-client process. It is not yet a real browser
process or device qualification.

### 8.2 Archive Center independent evidence

The public base plus tracked patch reconstructed the exact 28-path candidate
tree. On that independently restored tree:

- focused context/resolver tests passed;
- focused race tests passed;
- complete Go repository tests passed;
- complete repository race tests passed;
- `go vet ./...` passed;
- `node --check "Archive Center.js"` passed;
- a `CGO_ENABLED=0`, Linux ARM64, `-trimpath` build passed.

The ARM64 artifact was 36,486,347 bytes with SHA-256
`fd70b2ca9b2ba998ce2cfa14942583a7eaedf7d6734e1c0bc87a9aaa15cae8a6`.
No disposable MariaDB or Chroma runtime was started for that independent
replay; earlier C0 MariaDB evidence remains a separate receipt.

## 9. Explicitly unverified or inactive claims

The following must not be described as completed:

- ordinary PocketRisu client admission to the new input contract;
- automatic drain of one waiting input;
- early-send before client append/script/autosave;
- admission ACK-loss retry and pending composer/chat-open reconciliation;
- actual browser-process loss or browser restart;
- arbitrary in-flight model execution resumption across process loss, which is
  outside the selected settings-context contract;
- joined result/state/input/owner TTL behavior;
- non-input C2 ownership after all short-lived payloads expire;
- receipt-scoped predecessor effect lineage;
- AC authenticated transport, production route, or provider caller;
- AC context release, tombstone, retention, and compaction;
- C5 output-transform parity;
- complete C6 lifecycle and conflict policy;
- controlled live application;
- iPhone L3;
- stable tag or release.

## 10. Live and runtime preservation boundary

At the last direct readback:

- live PocketRisu was official 1.10.0 plus the pre-existing complete preset;
- it reported 40 packs and 340 managed files;
- its installed `lazy-chat-bg-adapter` was 0.2.1 and `lazy-chat-sync` was 0.3.0;
- the new adapter 0.7.1 and C1–C4 candidate owners were not live;
- PM2 was online with zero unstable restarts and no active request;
- the isolated Archive Center 4.3.1 runtime was preserved but its three
  loopback listeners were stopped;
- no user data, provider request, live schema, tag, or release was changed by
  the candidate work.

This state is a recorded observation, not a permanent assumption. Re-read
current state before any future live action. Never cancel active generation to
make deployment convenient.

## 11. Known traps and invalid shortcuts

1. Do not equate source existence, unit-test success, or C0 completion with
   product admission.
2. Do not raise `inputCommandVersion` before the C6 activation-critical gates
   and build-fence matrix pass.
3. Do not implement automatic drain by sending HTTP 202 and continuing the
   same response-writing Express handler. Use one operation-keyed,
   response-free coordinator.
4. Do not collapse adjacent admission identity into execution dependency.
5. Do not release secret-bearing settings inside a transaction that may roll
   back.
6. Do not let a server-owned failure fall through to client save, ACK, or
   provider rerun.
7. Do not treat current globals/statics as predecessor-derived without
   receipt-scoped effect provenance.
8. Do not connect the AC resolver and then allow a final caller to reread
   mutable global runtime, environment, or prompt files.
9. Do not expose a capture route before authentication, strict DTO decoding,
   request-size limits, lifecycle release, and secret-redaction tests exist.
10. Do not edit a generated BG bundle or composed target as the canonical
    source.
11. Do not replace the local AC candidate branch with the source patch, or
    describe the patch as preserving its original commit history.
12. Do not run the retired raw-selection verifier as the active complete-graph
    gate. Follow `PATCHER-V2-DESIGN.md`.
13. Do not touch unrelated root-workspace untracked worktrees, archives, or
    saved data.
14. Do not live-apply, restart, tag, or release merely to validate a source
    hypothesis.

## 12. Decision log carried into the next session

The following decisions are settled unless new evidence invalidates them:

- one waiting input is the current product limit; a third nonterminal command
  fails closed;
- process restart does not resume a paid generation whose exact secret-bearing
  settings existed only in memory;
- an already durable user input must still be restored after restart;
- server-owned chat/effect commit is one atomic recovery boundary;
- client hydration adopts the server owner and does not create a second writer;
- capability advertisement remains 0 while foundations are dormant;
- AC device settings have precedence only when a complete usable device
  authority exists; partial device authority remains isolated;
- C6 claim/change/prepare/effect/retention gates precede product activation;
- stable publication follows controlled C7 browser/device qualification, not
  merely automated foundation tests.

## 13. Handoff completion condition

A fresh session has correctly reconstructed the checkpoint when it can state,
with repository evidence:

1. which branch and commit contain the PocketRisu candidate;
2. how to reconstruct the AC candidate and verify its tree ID;
3. why C0 is not product completion;
4. why capability remains 0;
5. what R1–R5 changed and what remains unverified;
6. why H1 is closed and the next task is H2 context transport/consumers;
7. why C4/C5/C6 must precede activation;
8. which live systems and user data must remain untouched during the first
   continuation slice.

The accompanying fresh-start instructions turn these statements into a
reproducible startup procedure.
