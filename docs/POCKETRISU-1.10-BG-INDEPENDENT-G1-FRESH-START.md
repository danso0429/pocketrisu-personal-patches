# PocketRisu 1.10 BG Preserve G1 fresh start

Date: 2026-09-24 KST

This is the current entry point for implementing the AC-independent G1
root-effect repair. The old `POCKETRISU-1.10-BG-AC-*` H0–H7 handoff and
fresh-start documents are historical. Do not resume their H2/H3 AC source
changes, raise capabilities, or change live PocketRisu from those instructions.

## First reading order

1. Current session/repository instructions and the public
   `docs/BG-PRESERVE-ORDERED-GOALS.md`, especially G1 and §8.
2. `docs/POCKETRISU-1.10-BG-INDEPENDENT-G1-ROOT-EFFECT-IMPLEMENTATION-PLAN.md`
   in the private patcher G1 worktree. It owns R0–R6 and the result matrix.
3. `docs/POCKETRISU-1.10-BG-INDEPENDENT-G1-REBASE.md` for pre-existing source,
   ownership, and validation receipts. Historical statements in its G1.2
   table are not the current activation state.
4. `docs/POCKETRISU-1.10-BG-INDEPENDENT-G1-CLIENT-STRUCTURE-REVIEW.md`
   when changing the operation-keyed client path.
5. `docs/PATCHER-V2-DESIGN.md`; if changing the manifest/graph, follow the
   current all-or-nothing graph gate, not the retired raw-mask verifier.

Read the exact source/functions touched by the first change after this
minimum set. The old AC H2/H3 source snapshots are reference material only.

## Read-only first commands

Find the actual worktree rather than assuming a path:

```bash
git --no-pager worktree list --porcelain
git --no-pager status --short --branch
git --no-pager rev-parse HEAD
git --no-pager rev-list --left-right --count HEAD...origin/codex/pocketrisu-bg-independent
git --no-pager log -5 --format='%h %s'
```

Run the branch/status/HEAD commands with the private G1 worktree as the
working directory. Its code checkpoint before these new diagnostic documents
was `8f768d8`; later plan-only commits are expected. Do not reset any later
commit or discard unrelated dirty state to match a document.

Identify the official PocketRisu 1.10 target by commit
`98e968339d1b3f91b9dac85bb3f2ebb5f90f9d14`. The expected pre-repair
generated installers are byte-identical, SHA-256
`6d38c205e74e4113f294175ee022186308f6d6d23a4bc6313746c505ea035e88`.
Verify the current files rather than treating these values as timeless.

## Reproduce before designing

Use a new disposable official 1.10 checkout; never apply the diagnostic
patch to live PocketRisu. From the private G1 worktree, generate the installer
if needed, apply it to the disposable target, and check the diagnostic patch:

```bash
G1_WORKTREE="$(pwd -P)"
CANDIDATE_PARENT="$(mktemp -d /tmp/pocketrisu-g1-root.XXXXXX)"
git clone --branch v1.10.0 --depth 1 \
  https://github.com/PocketRisu/PocketRisu.git "$CANDIDATE_PARENT/official"
CANDIDATE_ROOT="$CANDIDATE_PARENT/official"
git -C "$CANDIDATE_ROOT" rev-parse HEAD
sha256sum artifacts/pocketrisu-bg-root-race-exact-1.10-diagnostics.patch
node dist/pocketrisu-patcher.cjs apply --root "$CANDIDATE_ROOT" --json
sha256sum "$CANDIDATE_ROOT/server/node/bgServerChatProcessBoundary.test.ts"
git -C "$CANDIDATE_ROOT" apply --unidiff-zero --check \
  "$G1_WORKTREE/artifacts/pocketrisu-bg-root-race-exact-1.10-diagnostics.patch"
```

The network clone may need the normal runtime approval path. A verified local
pristine exact-1.10 clone may replace that network step. Confirm the commit
is the official SHA above before applying anything. The patch SHA-256 is
`82f7ab967b5f1fccd358269c59113f48aa4e1a187d80e0ce1209335da1bdbab8`.
The patch has zero context lines; the generated H1 test must first match
SHA-256 `642ff4fec39d27132ea46107741a05fab0dc625a0f4d676517422c4fca8642dc`.
Do not use `--unidiff-zero` against a different target or a drifted test file.
After the check, apply it only to that disposable target. Its five tests are
selected by `-t 'diagnostic only'` in
`server/node/bgServerChatProcessBoundary.test.ts` under the target's server
Vitest configuration. The spawned process needs permission to bind loopback;
if the sandbox returns `listen EPERM`, use the normal runtime approval path
for the isolated test rather than counting the denial as a code failure.
Install target dependencies from its lockfile in an independent target tree;
do not reuse a live `node_modules` symlink. The expected observed matrix and
its limits are in the implementation plan §2.

```bash
git -C "$CANDIDATE_ROOT" apply --unidiff-zero \
  "$G1_WORKTREE/artifacts/pocketrisu-bg-root-race-exact-1.10-diagnostics.patch"
cd "$CANDIDATE_ROOT"
pnpm install --offline --frozen-lockfile
pnpm exec vitest run --config vitest.config.server.ts \
  server/node/bgServerChatProcessBoundary.test.ts \
  -t 'diagnostic only' --reporter dot
```

## First implementation unit and stop conditions

Begin with R1 writer/intent mapping, then choose the R2 idempotent contract
before modifying production code. The diagnostic patch asserts the **current
bad observations** so that reproduction itself is green; it is not an
acceptance test for a fix. Convert its relevant cases into invariant tests
that fail on the current candidate before changing production code. From
base 10, browser +1 plus N +1 must finish at 12 through patch and conditional
full-write paths, while the lost browser-response case must also remain 12
after any retry. The no-ETag stale write must no longer regress a committed
effect, and legitimate fresh-database bootstrap must remain functional.

Do not solve only the N+1 Send caller: `serverChatCommitVersion=1` can be
negotiated while `inputCommandVersion=0`. Do not use AC JS/Go/schema changes,
disable all foreground sends, apply a generic numeric 3-way addition, or
clear user worktree/live data. If a correct contract requires a material
change to supported foreground/legacy/root-writer behavior, report the
structure, concrete alternatives, and affected normal paths before coding
that expansion.

Record tests only after running them. Commit and push small source-specific
changes in the private G1 branch; keep capability claims and live delivery
separate. G2 and G3 remain downstream goals, not shortcuts around R1–R6.
