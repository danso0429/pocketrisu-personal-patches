# PocketRisu 1.10 CharX, module import, and aggregate validation

Date: 2026-08-22

## Scope and target

- Upstream target: PocketRisu `v1.10.0`, commit `98e968339d1b3f91b9dac85bb3f2ebb5f90f9d14`.
- Patcher branch: `codex/pocketrisu-1.10-audit`.
- CharX implementation authority:
  `docs/POCKETRISU-1.9-CHARX-ARCHIVE-INTEGRITY-IMPLEMENTATION-PLAN.md`.
- Module import UX authority:
  `docs/POCKETRISU-1.9-MODULE-IMPORT-UX-IMPLEMENTATION-PLAN.md`.
- This checkpoint is `v0.2.0-experimental.16`; it is not a stable tag or
  release.

The user explicitly waived the exhaustive raw-selection combination verifier
for this installation. No result below is presented as exhaustive subset
coverage. Focused compositions and the maximum rolling `all` graph were still
planned, applied, re-planned, status-checked, reverted, and run.

## CharX Phase 1 and exact-original boundary

The disposable independent ZIP writer/oracle compared `@zip.js/zip.js`
2.8.54 and 2.8.55. Both passed STORE/DEFLATE Data Descriptors with and without
signatures, false ZIP signatures inside payload/prefix bytes, forged
descriptor-like values, JPEG prefixes, CRC mutation, local/central mismatch,
overlap rejection, and slice-only large `File` access. Version 2.8.55 was
selected with workers disabled and explicit local-directory, CRC, and overlap
checks.

Measured sequential extraction retained approximately 21.0 MiB for 8×4 MiB,
42.0 MiB for 2×16 MiB, and 59.5 MiB for 1×48 MiB in the Node Blob/File spike.
The iPhone diagnostic passed 4 MiB, 16 MiB, and repeated 48 MiB archives
without reload or interruption. Safari did not expose its heap API.

The reported problematic original CharX was not available. The result is
therefore a synthetic mechanism qualification, not an exact-original
reproduction claim.

## CharX production gates

- Pinned dependency: `@zip.js/zip.js` 2.8.55.
- Reader: central-indexed, no workers, strict names/local headers, CRC checks,
  overlap preflight, explicit ZIP/JPEG container selection, slice-only `File`
  reader.
- Limits: 50 MiB per selected entry, 65,535 entries, 16 MiB aggregate
  metadata, 1 GiB selected payload, 50 MiB retained-entry budget.
- Storage: card-first plan, sequential extract/save, no archive-level retry,
  no partial receipt, close before terminal receipt.
- Independent target suites: 21/21 CharX archive/session tests.
- Patcher tests: 41/41 files passed.
- Standalone exact 1.10 round trip: apply current, zero-change re-plan, exact
  revert.
- Focused compositions: CharX alone; with character/module import UX; with
  toolchain hardening; with BG preserve; and with BG + lazy + import UX.
- Production build emitted no zip.js worker asset.

## Module import gates

One `character-import-ux` owner now reserves a silent character/module lease
before the native picker and promotes the same token to one reactive toast only
after selection. Cancellation releases silently. RisuM envelope preparation
is separate from asset materialization; structural/decode failures do not
retry or write storage. Low-level authorization remains modal and precedes
RisuM asset writes. Successful imports receive one fresh ID, commit once into
the current database, wait for `requestImportedModuleSave()`, and only then
transition the same toast to success.

Picker, drop, hash, service-worker share, URL/launch, JSON/lorebook/regex,
RisuM, and CharX-to-module paths use the central orchestrator. The service
worker now distinguishes share POST from cached share GET and resolves relative
cache keys against its origin.

Observed focused gates:

- PocketRisu 1.8.1: 27/27 import tests + 1/1 share transport, Svelte 0 errors / 4
  upstream warnings, 7,689-module build, zero-change re-plan, exact revert.
- PocketRisu 1.9.0: 27/27 import tests + 1/1 share transport, Svelte 0 errors / 4
  upstream warnings, 7,803-module build, zero-change re-plan, exact revert.
- PocketRisu 1.10.0 with CharX: 49/49 focused tests, Svelte 0 errors / 4
  upstream warnings, full frontend failure set unchanged at the pristine Node
  25 `localStorage` two-file 83 failures before toolchain hardening, and a
  7,855-module build.

## PocketRisu 1.10 aggregate rebase

The 1.9 target-specific adapters were admitted to exact 1.10 only after the
maximum graph planned successfully. Native 1.10 ownership was kept where it
changed:

- lazy full replacements retain native `structuredClone`, iterative large
  lorebook diffing, SQLite temporary-file spill, and orphan-reference guards;
- point-in-time maintenance has an exact 1.10 variant preserving the 2.2× disk
  gate, `temp_store = FILE` VACUUM, both checkpoints, and pinned-reader 409;
- the native orphan purge remains present and its server route plus dashboard
  caller are covered by the client-build fence;
- the server asset walker unions native persona icon/legacy image/embedded
  module references with organizer image galleries and folder icons;
- the native persona selection clamp and duplicate behavior are present in the
  exact 1.10 organizer UI;
- a pristine empty server may accept its first backup import without creating
  a nonexistent rollback snapshot; replacing an existing DB still requires the
  fresh verified snapshot or bounded one-use acknowledgement.

Maximum-graph observations:

- 35 resolved packs;
- 716 units;
- 267 managed paths;
- 12 deterministic ordering collisions;
- frozen dependency install passed;
- 41/41 patcher test files passed;
- frontend: 136/136 files, 1,609/1,609 tests;
- server: 13/13 files, 177/177 tests (local-socket suite run outside sandbox);
- compatibility: 74 tests passed, five environment-dependent tests skipped;
- Svelte diagnostics: 0 errors, 0 warnings;
- help audit: 439 English and 439 Korean keys, zero missing keys;
- production build: 7,918 modules;
- BG bundle: 8,555 KB and `sendChat=function` load check;
- current status and zero-change re-plan passed;
- exact aggregate revert returned the pristine Git diff and empty patch state.

Deterministic installer artifacts:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `pocketrisu-patcher.cjs` | 7,206,581 | `04facb34fe3ed3668d08ca3f838f57ddde048916d440a45be911e37f8b4897fc` |
| `pocketrisu-features.cjs` | 7,206,587 | `56197d83b6d0909397b41f03b487fa48b80667b4c5fa445cd0e196ff93a72126` |
| `pocketrisu-hardening.cjs` | 7,206,588 | `2c4e06adce035b33d34e83b935203b6158cf726aab6e6fd0b67d32faa238e95a` |
| `pocketrisu-all.cjs` | 7,206,582 | `5ae5d3e27cd1ec9fce25290e749b31d37d5f89330ff246ac9917794d3f262a85` |

All four passed `node --check`; consecutive builds were byte-identical.

## Remaining gates and limits

- Exact-original CharX validation remains unavailable.
- Exhaustive raw-selection combination verification was skipped by explicit
  user instruction; this is the principal composition residual risk.
- Physical module/CharX/persona/fence/BG iPhone L3 remains required before a
  stable tag or release.

## Live application receipt

Live admission used the committed maintainer source because every 1.10 pack
remains `reviewing` until device L3; the generated ordinary installer therefore
continues to fail closed instead of self-promoting its target status.

Before mutation, PM2 reported PocketRisu 1.10.0 online with unstable restarts
0 and active HTTP requests 0. Native active jobs and pending sends were 0, BG
result/operation payload rows were 0, and all 21 retained BG operation-state
rows were `delivered`. Two unclaimed native rows were already terminal-aborted;
they were left untouched. Both SQLite databases returned `quick_check=ok`.

The application-only rollback
`risuai-nodeonly-v1100-pristine-pre-all.20260822-230622` was created without
`save/`, `backups/`, or `node_modules/`; the existing empty format-2 intent was
copied separately. Its 1,430 files / 310,530,344 bytes and pristine entry-asset
hash were verified. PM2 was stopped before source writes. The transactional
transition applied 35 packs / 716 units / 268 writes, then the intent was
explicitly set to the rolling `all` preset. State and intent remained mode
0600, and no transaction journal remained.

The stopped live tree passed:

- frozen install (`@zip.js/zip.js` 2.8.55 added);
- Svelte 0 errors / 0 warnings;
- frontend 136 files / 1,609 tests;
- server 13 files / 177 tests;
- compatibility 10 files passed, one environment-dependent file skipped,
  74 tests passed and five skipped;
- help keys 439/439 with no missing keys;
- production build at 7,918 modules;
- BG bundle 8,555 KB with `sendChat=function` load check;
- production dependency prune; and
- current 35-pack status plus a zero-change 716-unit re-plan.

After restart, PM2 reported PocketRisu 1.10.0 online, unstable restarts 0, and
active requests 0. Root returned HTTP 200 and the unauthenticated BG cache
status returned 401. Served and local `index-DDofEbR0.js` were both 2,018,974
bytes with SHA-256
`928b253d13e018478864af4ae7d72fa7448c9d285c5f8cdf984fde18603a46cd`.
Served/local `build-stamp.json` also matched and advertised
`1.10.0-7c35ba8e83fc3ef4ce68a2cb7d4d781954c7daf7e30b617718da42e49a254a70`,
the exact stamp generated by the stopped build.

The main SQLite file remained 2,710,347,776 bytes at inode 786453 and the model
job SQLite file remained 94,208 bytes at inode 872636. Both `quick_check` calls
remained `ok`; the three existing backups retained their aggregate
3,002,439,949 bytes; nested `save/save` remained absent; BG payload and native
active/pending counts remained 0; and all 21 BG states remained delivered. The
PM2 error log remained byte-identical to its pre-apply size.

No live orphan-purge POST was issued: that endpoint is destructive if its
guards fail. Its server/caller fence is covered by the seven-case HTTP fence
suite, and real persona icon/gallery/folder preservation is covered by the
exact-1.10 purge/settings-export compatibility test.
