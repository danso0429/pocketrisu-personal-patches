# PocketRisu 1.10 BG server chat save × Archive Center fresh-start instructions

- Instruction date: 2026-09-20 KST
- Starting implementation/evidence checkpoint: `7ce4259`
- First implementation objective: H2 C4 production context transport and consumers
- Capability at start: disabled (`inputCommandVersion=0`)
- Live deployment at start: prohibited by the H2 source slice

## 1. Session objective

Reconstruct the current source and evidence state without relying on prior
conversation, accept the completed H1 process boundary unless source or
evidence contradicts it, then continue with the first incomplete dependency:
strict authenticated Archive Center context transport, claim/prepare/context
joining, captured-only production consumers, prompt snapshotting, and context
release/retention.

Do not begin by rerunning H1, redesigning the integration, applying to live, or
raising the capability version.

## 2. Initial repository discovery

Start from the repository where the session instructions are available. Read
those instructions before any mutation. Then list worktrees rather than
assuming an old absolute path:

```bash
git --no-pager worktree list --porcelain
```

Identify:

- the public NAI Studio checkout containing the immutable plan;
- the private patcher worktree on
  `codex/pocketrisu-bg-ac-server-chat-save`;
- the local Archive Center worktree on the same-named candidate branch, if it
  is still present;
- the live PocketRisu checkout, which is a read-only observation target during
  the first slice.

Do not move, remove, prune, reset, or clean a worktree during discovery.

## 3. Read-before-action order

Read these files in full:

1. current repository/session instructions;
2. the public plan at commit `e09a3b640e2a928f046b1145a6e8565c026f53fc`;
3. `docs/POCKETRISU-1.10-BG-AC-HANDOFF-INDEX.md`;
4. `docs/POCKETRISU-1.10-BG-AC-NEXT-WORK-PLAN.md`;
5. `docs/POCKETRISU-1.10-BG-AC-C0-VALIDATION.md`;
6. `docs/POCKETRISU-1.10-BG-AC-C3-CONNECTION-HARDENING-VALIDATION.md`;
7. `docs/POCKETRISU-1.10-BG-AC-H1-COMPOSED-PROCESS-VALIDATION.md`;
8. `docs/POCKETRISU-1.10-BG-AC-C4-INDEPENDENT-SNAPSHOT-VALIDATION.md`;
9. `docs/PATCHER-V2-DESIGN.md`.

Use the integration progress report as a detailed map when a file, commit, test
count, environment fact, or earlier decision must be traced. Do not reread all
historical receipts before the first task unless a contradiction requires it.

## 4. Read-only checkpoint verification

From the private patcher worktree, run:

```bash
git --no-pager status --short --branch
git --no-pager rev-parse HEAD
git --no-pager rev-parse '@{upstream}'
git --no-pager rev-list --left-right --count '@{upstream}...HEAD'
git --no-pager log --oneline --decorate -12
```

Expected starting properties:

- branch: `codex/pocketrisu-bg-ac-server-chat-save`;
- clean worktree;
- local/upstream divergence: `0 0`;
- H1 implementation/evidence checkpoint present: `7ce4259`;
- current tip may be a later documentation-only handoff commit.

If source commits appear after `7ce4259`, review them before continuing. Do not
reset them away to force the documented hash.

Verify the public plan from its public checkout:

```bash
git --no-pager rev-parse HEAD
sha256sum \
  docs/POCKETRISU-1.10-BG-PRESERVE-SERVER-CHAT-SAVE-ARCHIVE-CENTER-PLAN.md
```

Expected immutable values:

- commit: `e09a3b640e2a928f046b1145a6e8565c026f53fc`;
- SHA-256: `ef71282428589d3833a51c68130398bbdd8e6677d6b7bb00c4bc505981711ca6`.

A newer public checkout is not an error if the commit still exists. Read and
hash the commit-linked version before accepting changes from a newer plan.

## 5. Verify preserved Archive Center source

Always verify the tracked patch before using it:

```bash
sha256sum \
  artifacts/archive-center/pocketrisu-bg-ac-026dcbf-to-9e23861.patch
stat -c '%s %a %n' \
  artifacts/archive-center/pocketrisu-bg-ac-026dcbf-to-9e23861.patch
```

Expected values:

- SHA-256: `d70dac9ef7386464ef8bc5bf9fd0259b7b4c821af321325445abc92a5e6d574d`;
- size: 428,942 bytes;
- mode: 644.

When AC source work becomes necessary, create a new disposable checkout from
the public base. Do not overwrite the existing local candidate or any dirty
worktree. In the disposable checkout:

```bash
git switch --detach 026dcbf3b45adcf69b254673d439b24e943115b3
git apply --check /path/to/pocketrisu-bg-ac-026dcbf-to-9e23861.patch
git apply --index /path/to/pocketrisu-bg-ac-026dcbf-to-9e23861.patch
git diff --cached --name-only
git write-tree
```

Require 28 unique staged paths and tree
`7806dd39f4acfa294ee67f9d7834bc6fed448730`.

H2 changes Archive Center source, so reconstruct the candidate before editing
and require the exact path count and tree ID. Do not replace or reset the
existing local candidate to perform this check.

## 6. Establish the fact baseline

Before coding, write a short private scratch checklist or terminal note with
these facts:

- C0 means foundation experiments/store primitives, not seven product
  contracts;
- C1 and C2 are implemented internal owners;
- C3 foundations and R1–R5 fixes exist, but ordinary clients are unopted;
- C4 has an unmounted context owner/resolver only;
- H1 composed-process evidence is complete at `7ce4259`;
- C5 and C6 are not implemented;
- C7 has not been performed;
- `inputCommandVersion=0` and `inputCommandFoundationVersion=4`;
- the first task is H2 strict transport/context consumers;
- C6 gates precede capability promotion;
- live PocketRisu, PM2, user data, provider traffic, AC runtime, tags, and
  releases are outside the first slice.

If any inspected source contradicts this list, investigate and update the
handoff documents before implementation.

## 7. Closed H1 reference and H2 source surface

Sections 8, 9, and 12 below preserve the exact H1 procedure and report shape
as closed historical instructions. Do not repeat them at session start. Re-run
H1 only when relevant PocketRisu source changes, the environment is no longer
equivalent, or contradictory evidence appears.

For H2, inspect the restored Archive Center candidate and the current public
callers before editing:

```text
go-service/internal/httpapi/pocketrisu_execution_context.go
go-service/internal/httpapi/pocketrisu_execution_context_resolver.go
go-service/internal/httpapi/server.go
go-service/internal/httpapi/auth.go
go-service/internal/store/mariadb_session_execution.go
go-service/internal/store/mariadb_host_change.go
go-service/internal/store/mariadb_host_prepare.go
go-service/internal/httpapi/group_turn_prepare.go
go-service/internal/httpapi/group_turn_complete.go
go-service/internal/httpapi/prepare_turn_multi_agent.go
go-service/internal/httpapi/turn_extraction.go
go-service/internal/httpapi/turn_extraction_critic.go
go-service/internal/httpapi/runtime_config.go
```

Also inspect the H1 PocketRisu owners and generated target only to define the
future transport caller. Do not modify PocketRisu capability or client wiring
during the first H2 source slice.

### Closed H1 source list

Read the current source, not only validation prose:

```text
patches/lazy-chat-bg-adapter/files-1.10/server/node/serverChatInputOwner.cjs
patches/lazy-chat-bg-adapter/files-1.10/server/node/serverChatCommitOwner.cjs
patches/lazy-chat-bg-adapter/files-1.10/server/node/serverChatSettingsContext.cjs
patches/lazy-chat-bg-adapter/files-1.10/server/node/serverChatExecutionProjection.cjs
patches/lazy-chat-bg-adapter/files-1.10/server/node/bgServerChatCommitRoutes.test.ts
patches/lazy-chat-bg-adapter/files-1.10/src/ts/bgServerCommitHydration.ts
patches/lazy-chat-bg-adapter/files-1.10/src/ts/storage/serverCommittedChatAdoption.test.ts
patches/lazy-chat-bg-adapter/manifest.cjs
patches/lazy-chat-sync/files-1.10/server/node/server.cjs
patches/lazy-chat-sync/files-1.10/server/node/serverChatCommit.cjs
patches/lazy-chat-sync/files-1.10/src/ts/storage/chatStorage.ts
patches/lazy-chat-sync/manifest.cjs
```

Also inspect the generated exact-1.10 target versions of `server.cjs`, normal
chat routes, `chatStorage.ts`, and orchestration code after applying the
installer to a disposable target. Use the source/manifest files above for
edits.

## 8. Closed H1 implementation slice

### 8.1 Build the disposable candidate

Use a fresh exact PocketRisu 1.10.0 target at
`98e968339d1b3f91b9dac85bb3f2ebb5f90f9d14`. Snapshot tracked path
existence/bytes/modes before applying the installer. Never use live data as the
test database.

Regenerate the installers from the patcher source:

```bash
npm test
npm run build
sha256sum dist/pocketrisu-patcher.cjs dist/pocketrisu-all.cjs
cmp dist/pocketrisu-patcher.cjs dist/pocketrisu-all.cjs
```

Run `npm run build` a second time and require byte-identical outputs. If no
source or manifest has changed yet, the expected H1 installer is
8,327,213 bytes, mode 0755, with SHA-256
`b3eab53d687d0bda5f9d8cc82aa09493945f1a61af4d1f8f7d08f2b500162012`.

Apply the complete graph to the disposable target using the current patcher
CLI. Confirm status is current, an immediate plan changes zero files, and the
target is the expected exact-1.10 baseline. Do not use retired pack-selection
arguments.

### 8.2 Add the child-process boundary harness

Start with test code. The harness must:

1. spawn the generated production `server/node/server.cjs`;
2. use a temporary data root and actual SQLite;
3. bind loopback only;
4. wait for an explicit readiness signal;
5. inject or select a fixed provider gate through an existing test boundary;
6. submit one server-owned input through the real HTTP entry point;
7. close the initiating request/client after durable start ACK;
8. release the provider gate;
9. query the production normal-chat API;
10. exercise actual client storage adoption in a separate process or isolated
    storage context;
11. collect provider, commit, save, ACK, and fallback counters;
12. terminate and restart the child at named durable boundaries;
13. clean only its own temporary directory after assertions.

Do not approximate client loss by merely skipping a helper call in the same
process. The existing handler fixture already covers that level.

### 8.3 Minimum passing cases

- response/socket/client loss after start ACK;
- provider exactly once;
- commit exactly once;
- client save zero;
- result ACK zero;
- fallback provider zero;
- normal-chat API returns the committed revision and ordered message IDs;
- blank client adopts without write-back;
- second blank-client read is idempotent;
- restart after durable input, after result, and after commit;
- transaction failure retains settings and prevents partial chat/effect state;
- result/state expiry preserves current input-command ownership;
- input N → response N → input N+1 recovery restores all durable messages;
- AC is demonstrably unbound for every case.

### 8.4 Diagnose before patching production behavior

If a case fails:

1. identify the final caller and durable state at the failing boundary;
2. compare the composed target with its manifest/source owner;
3. determine whether the failure is a harness gap or a production defect;
4. add the smallest reproduction at the owner level;
5. patch source/manifest only when the production contract is wrong;
6. rerun the focused case and its adjacent ownership cases.

If the same defect survives two attempts or the solution expands the ownership
surface, stop patching and write a control/data-flow report with questioned
design assumptions before a third attempt.

## 9. Closed H1 verification procedure

### 9.1 If only tests/harness changed

- run the focused new process-boundary test repeatedly;
- run the complete server suite;
- run patcher source tests;
- regenerate installers if the test is embedded in a managed target path;
- verify installers are reproducible;
- apply the complete graph, confirm current status and zero-change re-plan;
- exact-revert the disposable target and compare path existence/bytes/modes;
- update the connection-hardening receipt and central ledger with observed
  results only.

### 9.2 If runtime or manifest changed

Additionally run:

- focused frontend ownership/hydration tests;
- complete frontend tests;
- compatibility tests;
- Svelte diagnostics;
- production build;
- BG bundle build and export load check;
- runtime audit v2;
- complete all-or-nothing graph lifecycle;
- two consecutive installer builds and byte comparison.

Record new counts and hashes from output. Do not copy old counts into a new
receipt without rerunning the corresponding gate.

### 9.3 Loopback restrictions

If a test fails only because the sandbox denies loopback `listen`, preserve the
failure output and rerun the exact test through the normal runtime approval
path that allows local listeners. Do not weaken the test into a helper-only
fixture merely to avoid the permission boundary.

## 10. Documentation and commit procedure

For each completed slice:

1. update the phase-specific validation receipt;
2. update `POCKETRISU-1.10-BG-AC-C0-VALIDATION.md` only where central status
   changed;
3. update the progress/handoff documents if current direction or evidence
   changed;
4. keep neutral, repository-appropriate prose in documents, code, comments,
   commit messages, and release material;
5. inspect `git diff --check` and the full staged diff;
6. stage only explicit paths;
7. commit implementation and test-only/documentation boundaries separately
   when that improves exact review/revert;
8. scan tracked changes for credentials, personal paths, private hostnames,
   user content, and unsupported claims;
9. push the private candidate branch;
10. verify local and upstream commit IDs and a clean worktree.

Do not create a stable tag or release during H2.

## 11. Actions prohibited in the H2 source slice

- do not modify or delete live user data;
- do not cancel queued or active generation;
- do not restart live PocketRisu or Archive Center;
- do not send a paid provider request;
- do not install the candidate on the live source tree;
- do not change the capability from 0;
- do not expose an unauthenticated or capability-advertised host route;
- do not persist full secret-bearing context material;
- do not let a context-aware final caller fall back to current mutable global
  runtime, environment, or prompt files;
- do not push the local AC candidate to an upstream without explicit authority;
- do not force-push, hard-reset, clean, or discard unrelated changes;
- do not remove existing worktrees, backups, ZIP files, or saved-data paths;
- do not edit generated bundle output directly;
- do not claim browser/device success from a Node helper test;
- do not treat the unavailable external evidence ZIP as verified.

## 12. Closed H1 completion report format

When H1 closes, record:

1. exact source and test commits;
2. exact target and installer hashes;
3. whether production source changed or the slice was test-only;
4. child-process topology and isolation method;
5. each start/stop boundary exercised;
6. provider, commit, client-save, ACK, and fallback counters;
7. normal-chat revision and message-order assertions;
8. blank-client first and repeated adoption results;
9. failure-injection and database-integrity results;
10. focused/full/build/composition/revert observations;
11. remaining browser-only and C4+ gates;
12. confirmation that live services, data, provider, tag, and release were not
    changed.

## 13. Continue with H2

H1 passed at `7ce4259`. Begin H2 in
`POCKETRISU-1.10-BG-AC-NEXT-WORK-PLAN.md` unless a real blocker or a new
user-visible design decision appears. The first H2 commit defines strict DTO,
body-size, unknown-field, mandatory-auth, version, and typed-error contracts
without advertising capability. Follow with claim/HostPrepare/context joining,
context lifecycle, then captured-only prepare/complete/provider consumers and
prompt snapshots. Preserve v1–v3 behavior and add the v4 server-host contracts
only behind their exact host/version fence.

The complete continuation order is:

```text
H1 composed AC-off process [complete]
  -> H2 C4 context transport/consumers [next]
  -> H3 C5 output parity
  -> H4 C6 lifecycle/retention
  -> H5 client activation
  -> H6 live/browser/iPhone qualification
  -> H7 publication
```

This order is the fresh-session default. Change it only when new evidence shows
that a dependency assumption is wrong, and document that evidence before
reordering the work.
