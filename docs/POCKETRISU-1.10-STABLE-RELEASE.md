# PocketRisu 1.10 stable `v0.2.0` release receipt

> **Successor:** stable `v0.2.1` retains this accepted exact-1.10 base and adds
> the verified PageFold ModelPreset transform plus hidden BG adapter. This
> document remains the exact `v0.2.0` decision receipt; PageFold evidence is in
> `docs/POCKETRISU-PAGEFOLD-CANDIDATE-VALIDATION.md` and the final `v0.2.1`
> release receipt.

Date: 2026-08-24 KST

## Outcome

`v0.2.0` promotes one supported delivery surface: the complete
all-or-nothing graph on exact official PocketRisu `v1.10.0`
(`98e968339d1b3f91b9dac85bb3f2ebb5f90f9d14`). It does not publish partial
pack combinations and does not claim that every source feature from
PocketRisu Kei or Haejeok RisuAI was ported.

The stable graph resolves:

| Boundary | Observed value |
| --- | ---: |
| Requested roots | 13 |
| Effective roots | 12 |
| Resolved packs/adapters | 38 |
| Ordered units | 769 |
| Managed source paths | 280 |
| Deterministic ordering collisions | 12 |

The exact 38 resolved packs move from `reviewing` to `verified` for PocketRisu
1.10. The other 13 catalog entries remain unverified on 1.10: superseded
startup cache, legacy CharX ownership, standard-storage alternatives, and
non-BG/base adapter alternatives. The retired `background-import` source is
not in the catalog or generated installers and is not promoted.

## Stable delivery changes

- `package.json` and `version.json` identify `0.2.0` as stable and target
  PocketRisu `v1.10.0`.
- Each directly shipped manifest records exact-1.10 verification. Shared
  adapter factories accept a target-verification flag only from the active
  BG/lazy wrapper; their inactive base/standard siblings stay review-only.
- Compatibility coverage asserts `verified 38 / under-review 0 /
  review-required 0` for the resolved graph and proves that none of the 13
  inactive entries was accidentally verified.
- GitHub CI uses the ordinary generated installer for apply and revert. It no
  longer uses the source-only maintainer qualification bypass for exact 1.10,
  and it asserts current status plus a zero-change second plan.
- Installer generation explicitly sets mode `0755`, runs twice, and compares
  both the consecutive builds and the primary/`all` compatibility alias.
- The native 30,000-entry shifted-lorebook regression keeps the same workload
  and assertions but receives a test-local 15-second bound. It had passed in
  isolation in 3.87 seconds, while two full parallel runs exceeded Vitest's
  default five-second limit at 5.40 and 5.15 seconds. The final full run passed
  after the local bound; no runtime storage code changed.

## Automated qualification

### Patcher and artifact

- patcher source suite: 44/44 test files passed;
- two consecutive installer builds: byte-identical;
- primary artifact and `pocketrisu-all.cjs` alias: byte-identical;
- both artifacts: CJS syntax-valid, 7,277,704 bytes, mode `0755`;
- both SHA-256:
  `1b416a066894a0052005a4f3a1aaad3fc808b88302b0295dfd7b58d7d23db94c`.

### Ordinary exact-target lifecycle

The distributed `dist/pocketrisu-patcher.cjs`, without the maintainer wrapper,
performed the following on a clean local clone of the official tag:

1. first plan: compatibility `verified`, 38 packs, 769 units, 282 writes
   including patch state;
2. ordinary apply: passed;
3. status: `current`, 38 packs, 280/280 managed source paths current, drift 0;
4. second plan: zero changed files and 280 skipped source paths;
5. ordinary revert: 282 writes reverted; and
6. Git diff and status returned to the exact clean official checkout after
   generated BG bundle outputs were removed.

### Patched PocketRisu target

- frozen dependency install: lockfile unchanged, 487 packages reused, zero
  downloaded;
- frontend: 139/139 files and 1,635/1,635 tests passed;
- server: 13/13 files and 177/177 tests passed in the local-socket environment;
- compatibility: 10 files passed, one environment-dependent file skipped,
  74 tests passed and five skipped;
- sandbox control: the server and compatibility socket tests failed only with
  explicit `listen EPERM`; their unchanged reruns passed outside that socket
  restriction;
- Svelte diagnostics: 0 errors and 0 warnings;
- help audit: 439 English and 439 Korean keys, zero missing Korean keys, and
  37 existing unreferenced keys reported as warnings;
- production client: 7,922 modules transformed and build completed with the
  recorded externalization, chunk-size, dynamic-import, and plugin-timing
  warnings; and
- BG orchestration bundle: 8,559 KB with `sendChat=function` load check.

## Physical evidence and accepted limits

Stable publication preserves the scope of every physical observation. It
does not turn a skipped or unavailable scenario into a pass.

Observed physical results retained by this release include:

- HJ01/HJ03/HJ04: all six presented iPhone scenarios reported normal;
- real `.risum` and `.module.charx` picker/import/notification/reload flow:
  reported normal;
- K22 persona picker and K27 BG native logging: reported normal;
- K15 mobile batch, K19's available mobile image batch, and the corrected BG
  direct-generation/composer batch: reported normal only at their recorded
  limited scopes; and
- synthetic CharX 4/16/48 MiB device exercises and strict archive fixtures:
  passed without claiming reproduction of the unavailable original problem
  file.

The user explicitly chose stable publication with these disclosed residuals:

- K19 non-image filtering, VoiceOver, and separated focus/target/mutation
  observations were not exercised;
- Prompt Preset marker re-L3 remains open;
- K29-F05 overnight unconsumed-result retention and K29 G09 cold reroll were
  not exercised; blocked G06 still has no runtime unit;
- destructive K26 restore, actual server-file backup/background return, and
  clean/dirty cross-build fence flows were not exercised on disposable user
  data;
- K13 provider streaming, K14 streaming render/scroll/translation/background
  return, and the actual K11 Hypa workflow were not exercised;
- K12 built-in translation/cache UI was not exercised because another
  translation plugin owns the user's workflow;
- K16 remains a partial mobile route/master-switch observation, and K15
  desktop pointer/hover subcases remain unexercised;
- the reported exact-original CharX was unavailable, so archive admission is
  synthetic mechanism qualification rather than exact reproduction;
- the former raw subset-combination verifier was waived and later retired;
  stable support is the one complete graph, not subset coverage;
- no destructive live orphan purge was used as a probe; and
- the current native HTML export metadata literal-entity round-trip defect is
  a separately recorded current-owner problem, not an HJ08 admission.

HJ02, HJ05, and HJ07 remain trigger-gated; HJ06 remains blocked; the frozen
HJ08 implementation remains rejected. None is silently included by the stable
version.

## Live stable metadata application

The live PocketRisu already contained the same runtime source as the stable
graph. Immediately before stable application:

- PM2 reported PocketRisu 1.10 online, restart count 6, unstable restarts 0,
  and active HTTP requests 0;
- native active jobs and pending sends were 0; unclaimed rows were terminal
  only and were left untouched;
- BG result and live-run payload counts were 0; 287 delivered and two
  cancelled operation-state records were retained;
- one retired background-import row remained `receiving` as inert preserved
  audit/user state and was not resumed, cancelled, or deleted; and
- model-job and import-job SQLite checks returned `ok`.

The ordinary stable plan named exactly two writes:

1. `src/ts/storage/risuSavePatcher.test.ts`, containing only the test-local
   timeout bound; and
2. `save/pocketrisu-patches/state.json`, updating the target-qualification
   ETags.

Application completed without stopping, rebuilding, or restarting PocketRisu
because no runtime file changed. Immediate status returned 38 packs, 280/280
current paths, drift 0, and the next plan changed zero files. PM2 remained
online at restart count 6 and unstable restarts 0. The main, model-job, and
import-job database inode/size pairs, backup-directory inode/size, and PM2
error-log size were unchanged across the operation. No user operation or data
was cancelled, claimed, rewritten, or deleted.

## Release boundary

- Support is exact PocketRisu `1.10.0`; a later PocketRisu version starts
  fail-closed review again.
- The source-only qualification command remains for future `reviewing`
  targets; it is not required by the stable exact-1.10 installer.
- The update notification channel remains intentionally disabled. Stable
  publication is the private GitHub tag/release and its two attached installer
  artifacts, not a public auto-update feed.
- Provenance and license boundaries remain those in `docs/SOURCE-PROVENANCE.md`
  and `THIRD_PARTY_NOTICES.md`.

The annotated `v0.2.0` tag and non-prerelease GitHub Release close repository
publication after the release commit's `patch-integrity` workflow succeeds.
