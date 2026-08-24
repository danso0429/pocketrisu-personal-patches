# PocketRisu 1.10 background import validation

> **Status:** automatic qualification and safe live apply passed; device L3
> remains a separate gate
>
> **Recorded:** 2026-08-24 KST
>
> **Target:** exact PocketRisu 1.10.0 (`98e9683`)
>
> **Pack:** `background-import` 0.3.2
>
> **Patcher checkpoint:** `v0.2.0-experimental.18`

## 1. Authority and scope

The implementation follows
`docs/POCKETRISU-1.10-BACKGROUND-IMPORT-IMPLEMENTATION-PLAN.md`.
It adds resumable browser-to-NodeOnly handoff, server-owned preparation and
append-only commit, and client result reconciliation for ordinary new module
and character imports.

The first admitted paths are:

- module `.risum`, `.charx`, `.json`, `.lorebook`, and regex JSON from picker,
  drop, hash, share, URL, and launch sources;
- seekable character `.json`, `.charx`, `.jpg`/`.jpeg`, and `.png` from local
  picker, drop, share, URL, launch, and seekable Realm CharX sources.

The following remain with their existing foreground owners:

- character-package children and package-to-existing-character merge;
- module `.charx`'s `returnCharacter` child;
- encrypted RCC PNG after the server returns `IMPORT_PASSWORD_REQUIRED`;
- non-seekable Realm PNG streams;
- direct Realm card payloads that do not pass through the file importer.

## 2. Durable boundary

The browser does not claim background safety while only holding a local
`File`. It first computes incremental SHA-256 and uploads 1 MiB slices. The
server fsyncs each accepted chunk, verifies the exact full-source digest, and
performs metadata-only low-level inspection. Only a no-authorization job or an
accepted durable authorization may change the toast to “continues on the
server” and remove the unload guard.

The operation then moves through private source, prepared, canonical commit,
result claim, client reconciliation, and exact ACK owners. Source and prepared
copies are removed after ACK. Failed/cancelled/delivered operational rows are
age-cleaned only after source/staging cleanup; active, completed-unACKed,
claimed, and reconcile-required work is not evicted.

## 3. Phase 1 disposable spikes

### 3.1 Upload and resume

- 4, 16, and 48 MiB synthetic source uploads completed with exact bytes.
- A 48 MiB source used 1 MiB chunks and observed about 13.7 MiB peak
  `arrayBuffers` delta in the disposable Node measurement.
- Exact replay, gap, crossing overlap, changed replay, truncated unacknowledged
  tails, lost completion response, owner recreation, and final digest mismatch
  were fault-injected.
- Browser `performance.memory` was unavailable in the iPhone spike; the log
  therefore recorded “heap API unavailable” instead of inventing a heap
  measurement.

### 3.2 Parser reuse

- CharX bytes, `File`, `Blob`, and non-Blob seekable descriptors share the
  central/local/CRC/overlap authority.
- RisuM uses an indexed seekable record cursor instead of retaining the whole
  archive.
- JSON, lorebook, character V2/V3/off-spec, PNG, and character-to-module cores
  were extracted into UI/database-free functions and compared against the
  foreground outputs on generated fixtures.
- The production parser bundle builds to **308,904 bytes** and loads
  `inspectImport`, `prepareImport`, and `preparedDigestFor` as functions.

### 3.3 Canonical append

- A copied exact-1.10 database appended one module and one character with
  assets/chats while preserving unrelated settings and module enablement.
- Unrelated concurrent edits, stale save timers, asset failure, transaction
  failure, lost post-commit response, and fresh-process retry were injected.
- Content-addressed assets may precede the atomic database+commit-marker
  transaction; an interrupted attempt may leave an orphan, but not a visible
  entity with missing assets. Existing native orphan purge remains the cleanup
  authority.

## 4. Security and failure-boundary corrections

Read-only audit and disposable reproducers found and closed these issues before
pack admission:

1. concurrent create requests could admit two operations;
2. a completed source could be replaced by same-sized bytes before parsing;
3. a staging-directory symlink could redirect writes and chmod;
4. V8 JSON errors could persist a fragment of user input;
5. prepared character output could differ from canonical chat defaults;
6. cancellation became terminal before parser settlement and cleanup;
7. result claim mutated state through an unfenced GET;
8. upload bodies inherited the global 2 GiB raw-parser limit;
9. body-parser's 413 was rewritten to 500 by the final error handler;
10. terminal source/staging/rows had no bounded cleanup or redacted summary.

The resulting gates include serialized admission, stable no-follow descriptors
with pre/post SHA, prepared-root ownership, code-only durable failures,
canonical fresh-read reconciliation, a durable cancelling state, fenced POST
claim, early auth/build fence, a 1 MiB body parser, preserved 4xx status,
free-disk/staging quotas, and deterministic retention.

## 5. Automatic results

### 5.1 Patcher

- patcher tests: **42/42 files passed**;
- background-only focused graph: 7 packs / 237 units / 110 managed paths;
- background + BG: 10 / 438 / 198;
- background + Kei: 27 / 463 / 171;
- background + BG + Kei: 30 / 664 / 253;
- maximum rolling `all` plus explicit background: **36 packs / 791 units /
  303 managed paths**;
- every graph: apply current, zero-change re-plan, and exact byte/mode revert;
- maximum exact revert covered 304 changed paths;
- observed ordered-collision counts were 3, 6, 7, 10, and 12 respectively.

These are focused and maximum-graph results. They are not exhaustive subset
coverage. The raw-selection combination verifier was skipped by the user's
explicit instruction.

### 5.2 Exact target

Maximum `all + background-import` candidate:

- frontend: **144 files / 1,639 tests passed**;
- server: **21 files / 237 tests passed**;
- compatibility: **10 files passed, one skipped / 74 tests passed, five
  existing environment skips**;
- Svelte diagnostics: **0 errors / 0 warnings**;
- production build: **7,922 modules transformed**;
- parser bundle: **308,904 bytes**, load check passed;
- BG orchestration bundle: **8,617 KB**, `sendChat=function` load check passed.

The background-only candidate intentionally does not select toolchain
hardening. Its full frontend run observed the pristine 1.10 Node 25 baseline:
1,121 passed, three skipped, and 83 `localStorage.clear` failures confined to
the same two Gemini cache test files. Its focused new tests, Svelte diagnostics,
production build, 198 server tests, and 73 compatibility tests passed. The
maximum graph's toolchain owner removes that environment-only baseline.

### 5.3 Synthetic HTTP mechanism smoke

A disposable empty-save server on a separate port observed:

- one module and one character reached canonical commit and `delivered`;
- the module stayed disabled and unrelated sentinel state survived;
- the character full-chat endpoint carried the latest model defaults;
- a receiving operation restarted at exact offset `0`;
- a 1 MiB + 1 byte chunk returned 413 and left offset `0`;
- a stale build returned 426 before the body owner;
- synthetic cancellation removed source and prepared bytes;
- diagnostics contained only counts/bytes/state/code and no imported names;
- final rows were delivered 2 / cancelled 1, operational bytes were 0, and
  root HTTP returned 200.

This is synthetic mechanism evidence. The reported exact-original problematic
CharX was unavailable and is not claimed as verified.

### 5.4 Deterministic installers

Two consecutive `0.2.0-experimental.18` builds produced identical executable
modes, byte sizes, and SHA-256 values. All four passed `node --check`.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `pocketrisu-patcher.cjs` | 7,592,421 | `b5993930fcd3e1de28e5d248f848eeda6e1f60344a5fcb94c744f748ac9693e0` |
| `pocketrisu-features.cjs` | 7,592,427 | `a30345d036abc3c9bd1cf8586e4ad468f2a0ef39a4164a7e1a223566cf595616` |
| `pocketrisu-hardening.cjs` | 7,592,428 | `1d28f81638f1a4d276f656035876956e4e23fc0b9600f444f73be04e0f9dcbc6` |
| `pocketrisu-all.cjs` | 7,592,422 | `32c0e99e5521759393289a47ed86bf1be7428780e6d516341cf98f18ba30e245` |

## 6. Admission and remaining L3

The pack remains:

- `reviewing: ['1.10.0']`;
- `userSelectable: true`;
- `presetDefaults: []`;
- `allDefault: false`.

It is not a stable release and does not silently join rolling `all`. Safe live
apply may use a pinned custom selection that preserves the existing rolling-all
packs and adds `background-import`; rolling admission may be restored only
after device L3 and a separate review decision.

Concrete iPhone L3 scenarios still required:

1. Start a large local module import, switch tabs before upload completion,
   return, and confirm the same operation resumes without duplicate bytes.
2. Switch away only after the toast says the server continues, let the page be
   suspended or killed, return, and confirm one imported module plus one
   terminal success notification.
3. Repeat the post-handoff suspend/return path for local character CharX and
   PNG/JSON, confirming representative assets and full chats after reload.
4. Kill the page during receiving, reopen, choose the same file, and verify
   exact source re-selection resumes; choosing a different same-sized file
   must be refused.
5. Accept and decline low-level access once each; decline must create no
   entity/assets/success and the next import must work.
6. With an unrelated unsaved setting/chat edit, recover a completed import and
   confirm both the local edit and imported entity survive strict save/reload.
7. Open two PWAs during result recovery and confirm one claim owner, expiry
   recovery if the first disappears, one entity, and one ACK cleanup.
8. Confirm package-to-existing-character and non-seekable Realm PNG retain
   their existing foreground behavior.

Stable tag/release and `allDefault` admission remain behind those observations.

## 7. Live receipt

The live tree was already the `v0.2.0-experimental.17` exact-1.10 rolling
`all` installation: 35 packs / 716 units / 267 managed paths with format-2
`preset: all` intent. Because `background-import` intentionally remains
`allDefault: false`, the new live intent is a pinned custom selection that
contains the same 12 visible all packs plus `background-import`; no prior
feature pack was removed.

### 7.1 Maintainer staging

A fresh candidate and a separate pristine review root ran the committed
`0.2.0-experimental.18-maintainer` stage flow. The first attempt against the
live rolling-all root refused before candidate writes because the `all`
profile cannot own a review-only non-default pack. The separate pristine
review-root run then completed with status
`maintainer-automated-review-passed`:

- 13 requested / 36 resolved packs;
- frozen install and exact package-manager check;
- parser bundle build before target tests;
- full target tests, Svelte diagnostics, production build, and BG bundle;
- receipt `review-passed`, source status current, 791-unit re-plan 0;
- state and intent mode 0600.

The candidate was production-pruned after staging. Server syntax and parser
bundle load checks still passed. The stage receipt remains private operational
metadata under live `save/pocketrisu-patches/`.

### 7.2 Preflight and rollback

Immediately before source mutation:

- PM2 1.10.0 was online with unstable restarts 0 and active requests 0;
- native active model jobs and pending sends were 0 / 0;
- both SQLite databases returned `quick_check=ok`;
- BG had no running generation, but one approximately 15-hour-old completed
  `result-ready` operation and one result payload were awaiting client ACK;
- 220 BG states were delivered and two were cancelled;
- main/model database inode+size were `786453` / 2,710,347,776 and `872636` /
  94,208 bytes;
- three server backups totalled 3,002,439,949 bytes;
- nested `save/save` was absent.

The parked result was not cancelled or deleted. The candidate retains the same
BG owner/version and received the live `save/` by same-filesystem rename, so
that completed result remained durable across restart.

The application-only rollback
`risuai-nodeonly-v1100-all-pre-background.20260824-123228` contains 1,607 files
/ 326,362,742 bytes. It excludes `save/`, `backups/`, and `node_modules/`, and
includes separate mode-0600 copies of the prior state and intent. Representative
`server.cjs` and `package.json` hashes matched live before cutover. The renamed
old application tree remains recoverable at
`risuai-nodeonly-cutover-old.20260824-123455`; it contains no live `save/` or
`backups/` after those directories moved into the candidate.

### 7.3 Process-first cutover

PM2 was stopped before filesystem mutation. The candidate's test-created dummy
`save/` was quarantined instead of merged. Live `save/` and `backups/` moved by
rename into the production-pruned candidate, after which the staged state,
custom intent, and staging receipt were installed at mode 0600. The old live
application directory was renamed before the candidate took the stable live
root path.

While stopped, the live target reported:

- 36 packs / 791 units / 303 managed paths current;
- zero-change re-plan;
- parser exports present and server syntax valid;
- no transition journal or nested save;
- unchanged DB/backup inode+size and `quick_check=ok`;
- native active/pending 0 / 0 and the exact parked BG result/payload preserved.

### 7.4 Restart readback

After PM2 restart:

- PocketRisu 1.10.0 was online with unstable restarts 0 and active requests 0;
- root returned HTTP 200;
- served/local `index-DLuYBwAb.js` matched at 2,018,972 bytes and SHA-256
  `99c9c0b9b6be1e3abe8b9c9b389374b1450ba089bda7457ea118a6a1562149a4`;
- served/local build stamps matched at
  `1.10.0-30a9514d4a83094dfe0be7579ee043683ffb31845fb01dc53a75c148a1ed2b78`;
- unauthenticated import diagnostics were rejected with 400 and the exact BG
  cache-status route was rejected with 401;
- main/model DB inode+size, three backup files/bytes, both `quick_check=ok`,
  native 0/0, and the parked BG result/payload remained unchanged;
- the PM2 error log stayed at its exact pre-cutover byte size, for a 0-byte
  error delta.

No destructive orphan purge, user-data deletion, generation cancellation,
force push, or stable tag/release occurred.

## 8. Current handoff

The experimental pack is installed and available for device L3. It remains a
pinned custom-selection addition and is not admitted to rolling `all`. Run the
eight concrete scenarios in §6 before changing `reviewing`, `allDefault`, or
stable release state.
