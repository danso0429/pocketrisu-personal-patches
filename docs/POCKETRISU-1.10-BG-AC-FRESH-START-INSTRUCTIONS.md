# PocketRisu 1.10 BG server chat save × Archive Center fresh-start instructions

> Historical H0–H7 entry point. For current AC-independent G1 implementation,
> start at `POCKETRISU-1.10-BG-INDEPENDENT-G1-FRESH-START.md` and the public
> ordered goals. Do not execute this document's first H1 task as new work.

- Instruction date: 2026-09-20 KST
- Starting implementation/evidence checkpoint: `df7fed77700a9695f0a78cb406ee8996c0920349`
- First implementation objective: AC-off composed Node process boundary
- Capability at start: disabled (`inputCommandVersion=0`)
- Live deployment at start: prohibited by the first slice

## 1. Session objective

Reconstruct the current source and evidence state without relying on prior
conversation, then continue with the first incomplete dependency: one
server-owned AC-off turn across a spawned composed PocketRisu server process,
client/request loss, normal-chat readback, blank-client adoption, restart, and
commit-failure boundaries.

Do not begin by redesigning the integration, reconnecting Archive Center, or
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
7. `docs/POCKETRISU-1.10-BG-AC-C4-INDEPENDENT-SNAPSHOT-VALIDATION.md`;
8. `docs/PATCHER-V2-DESIGN.md`.

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
- implementation/evidence parent checkpoint present: `df7fed7`;
- current tip may be a later documentation-only handoff commit.

If source commits appear after `df7fed7`, review them before continuing. Do not
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

For the first H1 slice, AC remains disabled, so source reconstruction may be
deferred after hash verification unless a contradiction in AC provenance is
found.

## 6. Establish the fact baseline

Before coding, write a short private scratch checklist or terminal note with
these facts:

- C0 means foundation experiments/store primitives, not seven product
  contracts;
- C1 and C2 are implemented internal owners;
- C3 foundations and R1–R5 fixes exist, but ordinary clients are unopted;
- C4 has an unmounted context owner/resolver only;
- C5 and C6 are not implemented;
- C7 has not been performed;
- `inputCommandVersion=0` and `inputCommandFoundationVersion=4`;
- the first task is H1 AC-off composed process evidence;
- C6 gates precede capability promotion;
- live PocketRisu, PM2, user data, provider traffic, AC runtime, tags, and
  releases are outside the first slice.

If any inspected source contradicts this list, investigate and update the
handoff documents before implementation.

## 7. Inspect the first-task source surface

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

## 8. First implementation slice

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
source or manifest has changed yet, the expected starting installer is
8,281,994 bytes, mode 0755, with SHA-256
`146a892fde7b8a3bb9fe01926093d3a9e275660aaf00aae5e24d57dbc03b47e6`.

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

## 9. Verification after the first slice

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

Do not create a stable tag or release during H1.

## 11. Actions prohibited in the first slice

- do not modify or delete live user data;
- do not cancel queued or active generation;
- do not restart live PocketRisu or Archive Center;
- do not send a paid provider request;
- do not install the candidate on the live source tree;
- do not change the capability from 0;
- do not wire AC production callers;
- do not push the local AC candidate to an upstream without explicit authority;
- do not force-push, hard-reset, clean, or discard unrelated changes;
- do not remove existing worktrees, backups, ZIP files, or saved-data paths;
- do not edit generated bundle output directly;
- do not claim browser/device success from a Node helper test;
- do not treat the unavailable external evidence ZIP as verified.

## 12. H1 completion report format

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

## 13. Continue after H1

After H1 passes and its evidence is committed and pushed, continue directly to
H2 in `POCKETRISU-1.10-BG-AC-NEXT-WORK-PLAN.md` unless a real blocker or a
new user-visible design decision appears. H2 begins with strict AC DTO/auth and
immutable production consumers; it does not begin with capability promotion.

The complete continuation order is:

```text
H1 composed AC-off process
  -> H2 C4 context transport/consumers
  -> H3 C5 output parity
  -> H4 C6 lifecycle/retention
  -> H5 client activation
  -> H6 live/browser/iPhone qualification
  -> H7 publication
```

This order is the fresh-session default. Change it only when new evidence shows
that a dependency assumption is wrong, and document that evidence before
reordering the work.
