# PocketRisu 0.2.2 maintenance fixes validation

Date: 2026-09-20 KST

## Scope

This candidate addresses four independently observed maintenance issues on the
exact PocketRisu 1.10 target:

- JPEG-wrapped CharX files whose filename ends in `.charx`;
- request-log storage statistics scanning body-heavy SQLite rows;
- a new empty chat publishing its metadata stub before its full payload;
- the installed `fast-character-import` 1.5.5 plugin losing the iOS user
  activation before it opens its file picker.

The distributed candidate is `0.2.2-experimental.2`. The third-party plugin
correction is a live data migration with an exact precondition and rollback
backup; it is not embedded in the distributed patch catalog. System Logs have
no server-side code change because their measured server path was not the
bottleneck. No stable tag or release is authorized before physical L3.

## Phase 1 — flat discovery

- Every CharX import reads two signature bytes before selecting its container.
- A JPEG signature routes through the bounded JPEG marker parser even when the
  filename-derived hint is `zip`.
- The JPEG parser must reach EOI, and the following bytes must be a ZIP local
  header before the sliced archive is returned.
- The sliced archive still uses strict directory, filename, local-header,
  CRC-32, overlap, count, metadata, entry-size, and selected-size checks.
- A low-level zip ambiguity reason is appended to the typed CharX error.
- The supplied failing file is parsed as JPEG-wrapped CCv3 with an embedded
  module and referenced assets.
- Request-log startup creates one additional SQLite index on `size_bytes`.
- Every request-log insert, rotation delete, and clear updates that index.
- Storage statistics can use the compact covering index instead of visiting
  rows containing request and response bodies.
- Index creation can perform one-time startup I/O on an existing database.
- Index creation failure prevents request-log initialization rather than
  silently returning incorrect statistics.
- Every database save scans current chat identities for full payloads absent
  from the last server-confirmed metadata snapshot.
- Placeholder and metadata-only chats are excluded from proactive payload
  upload.
- Existing server-confirmed chats retain update intent, including remotely
  deleted chats that must not be resurrected.
- A missing payload invariant now carries a typed character/chat identity.
- Full-write and patch rejection responses expose that identity only for the
  typed missing-payload error.
- The client validates both identity fields before exposing them to save logic.
- Recovery requires the exact current chat to contain a message array and not
  be a placeholder.
- The original tracked changes and the exact chat payload are re-enlisted
  before retry.
- One in-memory recovery key prevents the same pending identity from re-entering
  the dedicated typed-recovery branch.
- A repeated rejection for the same pending identity becomes an ordinary save
  failure; dirty-state preservation and delayed autosave remain in effect.
- A different identity replaces the slot, so A→B→A can use the dedicated
  branch three times. This is not a lifetime identity set.
- Successful metadata approval clears the pending recovery key. Payload upload
  success alone does not clear it.
- The recovery key cannot grow with the number of historical failures.
- The all-or-nothing catalog gains one exact-1.10 root owner and two target test
  files, including the final-composition save regression test.
- Pack ETAGs, state encoding, generated installers, apply, status, re-plan,
  revert, and clean re-apply all include the new owner.
- The FastImport button currently asks for clipboard text before constructing
  and clicking its file input.
- Awaiting the clipboard request consumes iOS transient user activation, so
  the later synthetic input click can be blocked.
- The live-only correction skips clipboard access on iOS while retaining the
  desktop Realm-URL clipboard path.
- The plugin correction changes one exact source occurrence and preserves the
  remaining plugin array and scripts byte-for-byte at the decoded-object
  boundary.
- System Logs default filtering reads a small response from a bounded table;
  remaining delay can occur in iOS navigation, JSON handling, or rendering.
- Native CharX commit, iOS picker presentation, empty-chat UI persistence, and
  perceived log-view latency remain physical-device observations.

## Phase 2 — external anchors

### CharX container selection and strictness

Break scenario: accepting arbitrary prepended bytes could hide a second archive
interpretation or bypass strict ZIP validation.

The byte signature only selects the existing JPEG parser
(`charxArchive.ts:177-205`). That parser bounds the prefix to 50 MiB, parses
JPEG markers through EOI, and the caller then requires a ZIP local signature.
The returned slice enters the unchanged strict ZipReader path. Unsafe names,
duplicates, local/central mismatches, CRC failures, overlaps, and size limits
remain covered by the existing suite. Ambiguity normalization now retains the
library-provided reason (`charxArchive.ts:221-233`).

The supplied 29,633,357-byte reproduction was a JPEG file despite its
`.charx` filename. The old strict call rejected it as `prepended data`. The
patched production source parsed 254 entries, 126 selected assets, 126
referenced assets, 29,381,754 selected bytes, `chara_card_v3`, and an embedded
module. Synthetic tests also cover a false ZIP signature inside JPEG metadata
and appended-data reason preservation.

Failure path: malformed JPEG structure, missing EOI, a prefix over the cap, or
no ZIP signature after EOI throws a typed error before any asset save. Reader
close remains in the existing import-session settlement path.

### Request-log statistics

Break scenario: a cached application counter could drift after rotation,
clear, transaction failure, or process exit.

The candidate instead adds a normal SQLite index in the same schema transaction
surface (`log-load-performance/manifest.cjs:21-38`; composed target
`request-logs.cjs:251-288`). SQLite maintains it with the existing request row
transaction and delete operations. `storageStats()` retains its canonical SQL
aggregate (`request-logs.cjs:527-535`), so there is no second counter authority.
The target test checks both index presence and `EXPLAIN QUERY PLAN` use of the
covering index.

A read-only production snapshot contained about 267 MiB of request-log storage.
The unindexed aggregate measured 97.412 ms on its first cloned run and roughly
86-94 ms warm; a separate cold production read measured 3,749.510 ms. After
index creation, the same result and row count measured 0.147-0.221 ms. Index
creation measured 93.305 ms on the clone and reused existing free pages, so
the main DB file size did not grow in that experiment.

Failure path: SQLite DDL failure propagates from `createRequestLogs`, matching
the existing required table/index initialization behavior. The server does not
continue with a partially initialized request-log owner.

### New-chat payload ordering

Break scenario: weakening the server invariant or manufacturing an empty chat
would hide missing user data and could resurrect a remotely deleted chat.

The client now derives only full, non-placeholder identities absent from the
last confirmed server metadata (`chatSaveIntent.ts:52-82`). The save planner
merges those identities with explicit dirty chats before encoding a new stub
(`globalApi.svelte.ts:836-871`). Server-confirmed identities still use the
existing create/update classifier (`chatSaveIntent.ts:26-44`), so an existing
chat deleted remotely remains an update conflict.

The server invariant is unchanged. Its missing-payload branch now throws a
typed error containing the exact identity (`chatDelta.cjs:133-140,236-238`).
The write and patch routes emit that identity only for this code
(`server.cjs:3743-3760,3972-3993`). The client accepts only two strings
(`nodeStorage.ts:627-651`) and then requires an exact full current chat
(`chatSaveIntent.ts:85-93`).

If the proactive planner loses a race, one pending key re-enlists the original
metadata changes and exact payload (`globalApi.svelte.ts:1283-1299`). The same
pending identity cannot re-enter that dedicated branch, but the resulting
ordinary error is requeued by `triggerSave` and remains subject to its existing
short burst and delayed autosave policy. Metadata approval clears the key
(`globalApi.svelte.ts:887-895`); payload upload alone does not. A different
identity replaces the slot, so A→B→A is admitted three times rather than being
treated as a lifetime per-chat limit. No error branch deletes a chat, edits a
payload, or marks rejected metadata as confirmed.

PATCH and full-write paths share proactive payload ordering but not typed
recovery. `patchItem` maps the structured missing identity into the dedicated
branch. A full-write invariant rejection remains a generic write error; the
outer handler requeues the original tracker, and the next attempt proactively
saves any newly observed full chat before retrying metadata. The final-source
test exercises both results and does not describe the full-write path as typed
recovery.

The observed production timeline anchors the scenario: the prior backup lacked
the new chat ID, ten invariant rejections occurred over about 45 seconds, the
first user message then made the full payload dirty, and the following backup
contained a normal two-message chat. The current database retains that chat.

The current live database has 34 characters and 73 chats. The pure planner
measured 0.537 ms for 100 chats, 11.284 ms for 10,000, and 70.152 ms for
100,000; the production-sized identity scan is below the measured 100-chat
case. This is an O(number of chats) metadata scan and does not traverse message
contents.

### FastImport iOS activation

Break scenario: globally disabling clipboard access or replacing the plugin
array could break desktop Realm imports or remove unrelated plugins.

The exact installed source contains one clipboard statement. The approved
live migration changes only that expression from an unconditional await to an
iOS conditional. Desktop still awaits clipboard text; iOS produces an empty
clipboard candidate without suspension and calls `selectFiles()` synchronously
inside the original click turn. A small execution harness observed
`picker-sync` before the async function returned. The original and patched
scripts are syntax-valid and have distinct recorded SHA-256 values.

The original live migration ran only while PocketRisu was stopped, after an exact
script-hash precondition and a verified database-blob backup. It will refuse
zero or multiple matching plugins or source occurrences. Post-write decoding
must preserve plugin count, plugin identities, every unrelated plugin script,
and all non-target database content; failure restores the backup before
restart. This avoids both `setDatabase({plugins})` and
`setDatabaseLite({plugins})` whole-array replacement paths.

### System Logs

The default production filter returned 46 rows and 21,842 response bytes. Its
SQLite page query measured 3.686 ms on the first run and about 1.2 ms warm;
authenticated loopback HTTP measured 72.847 ms first and 10.899 ms second.
These measurements do not support a server query or payload-size change.

Counterexample attempt: a hidden large table scan could still dominate despite
the small visible result. Direct query timing and the bounded 5,000-row table
reject that explanation for the measured state. The unobserved link is the
iPhone-side navigation/render path, not server selection.

## Phase 3 — triage

- Q3 fixed: extension-derived CharX container misclassification.
- Q3 fixed: discarded zip ambiguity reason.
- Q3 fixed: request-log statistics scanning body-heavy rows.
- Q3 fixed: dirty-tracker omission of a newly inserted full chat.
- Q3 fixed: structured one-retry recovery for the remaining metadata race.
- Q3 fixed during audit: potentially growing recovery-key Set replaced with a
  single serial pending key.
- Q3 live-only correction: FastImport iOS clipboard await before file input.
- Q2 retained: strict ZIP, CRC, overlap, remote-delete, concurrent-create, and
  malformed-response failure behavior.
- Q4 surface: physical iPhone outcomes listed below.

## Surface items

### Native CharX commit

- Claim: the supplied JPEG-wrapped `.charx` completes the user-visible import.
- Resolved: exact production parser opens the card/module/assets under strict
  validation without writing user storage.
- Missing link: browser asset saves and final character commit on the iPhone.
- Limitation: this requires the user's authenticated browser and mutates the
  character database, so the isolated parser harness cannot establish it.
- L3 signal: one import completes once; `Ambiguous archive` does not appear;
  the character and its referenced assets remain after reload.

### FastImport picker

- Claim: tapping FastImport opens the iOS file source chooser without the
  paste-only dead end.
- Resolved: the patched branch calls the input click synchronously and does not
  call clipboard read on iOS.
- Missing link: Mobile Safari's actual chooser presentation.
- Limitation: transient user activation is browser/OS state outside the server
  and automated Node harness.
- L3 signal: the first tap opens Files/photo sources directly; desktop Realm
  clipboard detection remains unchanged.

### Empty new chat

- Claim: creating an empty chat persists without repeated missing-payload
  alerts before the first message.
- Resolved: pure planning, protocol mapping, server invariant, focused tests,
  and the historical before/after production snapshot are closed.
- Missing link: the actual Svelte event/effect timing on the deployed iPhone.
- Limitation: reproducing that timing requires the physical UI scheduler and
  active authenticated database.
- L3 signal: create a new chat, wait without typing, navigate away/back, and
  reload; no invariant alert appears and the empty chat remains.

### Log-view latency

- Claim: Request Logs initial loading improves and System Logs behavior is not
  regressed.
- Resolved: request-stat SQL plan and timings are measured; System Logs server
  query and HTTP payload are measured.
- Missing link: iPhone render-to-visible latency for both screens.
- Limitation: the mobile render pipeline is unavailable to the server harness.
- L3 signal: open each screen from a cold settings visit; Request Logs should
  no longer pause on storage totals, while System Logs timing is reported
  separately if it remains slow.

## Cross-piece integration

- The complete exact-1.10 graph resolves 41 packs, 936 units, 341 managed
  paths, and 13 ordered collisions.
- Upgrade apply from the live-equivalent stable state, current status,
  zero-change re-plan, complete revert to clean/disabled, fresh apply, current
  status, and generated-installer zero-change plan all passed.
- CharX and FastImport share the user entry point but not parser authority:
  native import uses the strict indexed reader; FastImport retains its own
  parser and receives only the iOS activation correction.
- Request logs use a separate SQLite database from the character/plugin blob;
  index initialization and the plugin migration do not share a transaction.
- The live plugin migration is scheduled while the process is stopped so it
  cannot race with lazy-chat persistence or patcher source application.
- BG adapters compose after the updated lazy full replacements. The final BG
  bundle load check resolves `sendChat` as a function.

## Automated evidence

- Patcher: 48/48 test files passed.
- Focused client: 42/42 tests; post-audit storage rerun 27/27.
- Focused server: 52/52 tests.
- Full frontend: 151 files, 1,739 tests passed.
- Full server: 23 files, 233 passed, 12 provider-gated skips.
- Compatibility: 74 passed, five environment/provider skips.
- Svelte diagnostics: 0 errors, 0 warnings.
- Production build: 7,940 modules transformed.
- BG bundle: 8,641 KB, `sendChat=function` load check.
- Supplied exact sample: 254 entries, 126 selected/referenced assets,
  29,381,754 selected bytes, CCv3 card, embedded module.
- Generated installers: two consecutive byte-identical builds, 7,863,377
  bytes, mode 0755, CJS syntax-valid, SHA-256
  `c0a000f93cb2ce8aa6ae1c4275c90a3292338cd7f04d644ff43b58fa9e0f3d73`.

## Live candidate delivery

The first live preflight found native running/pending zero but one BG operation
running. It was not cancelled, claimed, or acknowledged by deployment. It
naturally reached delivered. A later preflight found a second operation at
`result-ready`; that also reached delivered before stop. The final boundary was
native active/pending zero, BG active/result zero, 375 delivered states, and
three historical cancelled states.

The generated installer plan was exact-1.10 `verified` and named 12 runtime/test
source files plus private patch state. PM2 was stopped before source writes.
The transaction applied those exact files, then stopped-tree checks passed:

- focused client 42/42;
- focused server 52/52;
- Svelte diagnostics 0/0;
- production build 7,940 modules;
- BG bundle 8,847,647 bytes with `sendChat=function`;
- production prune removed 109 development packages; and
- `express`, `better-sqlite3`, `msgpackr`, `compression`, and the BG bundle
  loaded after prune.

The FastImport migration first encountered an index-label bug in its local
verification harness. That invocation stopped before backup creation or DB
write. The original script hash and database `quick_check` were re-read before
the corrected fail-closed migration ran. The successful migration:

- matched exactly one plugin and one clipboard statement;
- created and byte-hash-verified one chunk-aware database backup, retained for
  rollback;
- changed the target script from SHA-256
  `203678e882cee9d2e2c66123820e26ede8d6cc085ac5feb0072ed2b5a2cee908`
  to
  `5777e74585a3dfc7993cd53fef58c7ad2e649d1d6d167aaf8457355eb1885e94`;
- preserved 12 plugin identities, every unrelated plugin script, and the
  non-target database canonical digest; and
- passed encoded round-trip, live readback, and `quick_check`.

After restart, PM2 reported PocketRisu 1.10.0 online at PID 105138, restart
count zero, unstable restarts zero, and active requests zero. Root, main asset,
and build stamp returned HTTP 200. Served and local
`index-4BjhmIo-.js` were both 2,047,743 bytes with SHA-256
`82d61e1cfefee13e117892e54b211ee4e8a5e7301173a302efc6030e83124d52`.
The served build stamp was
`1.10.0-24952ea5c604431d89a7a1dc642b2f8cebb10674c58b3c1292baad7deaaedaad`.

The live request-log DB contains `idx_requests_size_bytes`, and SQLite reports
`SCAN requests USING COVERING INDEX idx_requests_size_bytes`. Eight direct
aggregate samples measured 0.139-0.199 ms. Authenticated HTTP `/stats` measured
51.191 ms first and 7.788 ms warm. During the delivery window one new usage row
arrived and the normal 256 MiB body-retention rotation reduced request rows
from 3,237 to 3,223 while the maximum ID advanced by one; this is disclosed as
concurrent bounded-log activity rather than claimed as deployment immutability.

All four SQLite databases returned `quick_check=ok` after restart. The main DB
kept its inode and file size; the patch state changed as expected, while intent
kept its inode and 57-byte size. Final patch status was 41 packs and 341/341
managed paths current with drift zero; the next generated-installer plan had
936 units, 13 ordered collisions, and zero changed files. Native/BG active and
result work remained zero. The error log grew during the pre-stop user BG
operations, with no patch/version, missing-payload, ambiguous-archive, PageFold,
or credential terms; a five-second post-restart window added zero stderr and
zero stdout bytes.

Physical L3 remains open. No stable tag or release has been created.

## Follow-up qualification — experimental.2

### Follow-up L2.5 — discovery, anchors, and triage

Flat discovery added these leaves without severity: final-source AST loading,
required-node uniqueness, normal target dependency resolution, payload and
metadata await ordering, recovery-slot replacement/clear events, outer burst
and deferred timers, online/visibility wake-up, in-flight chaining, BG durable
failure delivery, exact-1.10 test ownership, complete-graph install/revert,
FastImport readonly inspection, script/hash admission, inspect/write race,
chunk-aware backup/write, reopen/readback, conditional rollback, and decoded
non-target preservation.

The save-recovery → outer-scheduler → BG-durable chain is structurally anchored
by executing the final composed declarations and exact scheduler statement.
Its failure leaves are empirically anchored by S01-S14 and both failing
mutants. The unexecuted browser/Svelte reactive cadence remains the existing
physical empty-chat L3 surface; the test executes the extracted wake callbacks
and scheduler but does not claim to run Mobile Safari's event loop.

The test-ownership → graph → installer/revert chain is structurally anchored by
the exact-1.10 target-scoped owned unit, 937-unit plan, current/zero-plan state,
and two byte/mode-exact 342-path reverts. A historical 1.8.1 or 1.9 target does
not receive this test. The installer does not acquire FastImport ownership.

The FastImport inspect → backup/write → readback chain is structurally anchored
by exact hashes, target/source multiplicity checks, a pre-write blob recheck,
one SQLite transaction, reopened decode, masked deep comparison, and
current-bytes precondition before rollback. Synthetic failure injection anchors
backup/write/post-write failures; live evidence is read-only
`already-applied`. Actual replay on the already-patched live database is
intentionally absent because it would add a needless user-data write.

Triage: the misleading one-retry claim, missing orchestration coverage, stale
string assertions, absent CI branch trigger, and missing reproducible plugin
tool are Q3 fixes. Existing PATCH/full-write asymmetry, CAS, remote deletion,
concurrent creation, outer autosave policy, and installer/plugin ownership split
are Q2 retained contracts. Mobile picker presentation, empty-chat reactive
timing, native CharX commit, and perceived log rendering remain Q4 physical L3
surfaces. No stable tag or release follows from these automatic gates.

### Retry contract and final-source coverage

The exact-1.10 owner now installs
`src/ts/storage/globalApi.savePersistence.test.ts`. The test reads the final
composed `globalApi.svelte.ts`, requires one `saveDb` and every expected nested
function, extracts those AST nodes with the target's normal TypeScript 5.9.3
dependency, and transpiles the current source. There is no fallback copy of an
older save routine. The same extraction requires the BG durable-save assignment
and the client visibility/online wake callbacks, so missing or duplicated
composition fails before a scenario runs.

The harness executes the real `RisuSaveEncoder`, `RisuSavePatcher`, chat-stub
conversion, `chatSaveIntent` helpers, composed `persistTrackedChanges`, composed
`triggerSave`, exact autosave `while` statement, and server
`validateStrippedDatabaseTransition`. Controlled boundaries are payload
storage, HTTP patch/full-write responses, notifications, `tick`, promises, and
time. Fake timers drive the production deferred timer; a controlled 200 ms
sleep advances the extracted scheduler rather than manually counting arbitrary
save calls.

Observed scenario mapping:

- S01-S08 execute payload ordering, mixed shapes, await races, same-identity
  suppression, A→B→A slot replacement, dirty preservation, confirmed-baseline
  advancement, and invalid-identity refusal.
- S09-S10 remain covered by `nodeStorage.chatDelta.test.ts` create-only/CAS and
  absent-stable-ID tests plus `conflictRebase.test.ts` remote-delete tests.
- S11 executes both an untracked full-write and a chat added during the payload
  await. The first metadata write is rejected, the tracker remains dirty, and
  the next outer retry saves the new payload before accepting metadata.
- S12 executes the production timer replacement, online/visible callbacks, and
  in-flight save chaining without concurrent transactions.
- S13 mutates another chat while a payload save is awaiting failure and observes
  both the original root tracker and the new chat tracker after requeue.
- S14 executes the final BG adapter's `rejectOnError`/`onResult` assignment and
  confirms a deferred metadata result cannot reach the flush/ACK boundary.

The final composed file passed all 15 tests. Removing the call that merges
`collectUnconfirmedChatPayloads` into the save loop made S01 fail with `retry`
instead of `saved`. Separately disabling the recovery-key admission made S03
throw the missing-payload error. Both disposable mutations were reverted and
15/15 passed again.

### FastImport maintenance tool

No original migration script was found in the repository, work records, or the
retained review evidence. `scripts/fastimport-ios-migration.cjs` is therefore a
new reconstruction, not a claim that the prior live command was preserved. It
uses the recorded original and patched full-script SHA-256 values, exact plugin
identity, and exact one-line replacement. The normal mode opens only the
explicit database path read-only. Apply additionally requires an explicit
target root, `--confirm-stopped`, and an unused `database/dbbackup-*` key.

The script reads raw or chunked values, decodes supported RisuSave formats with
the target's installed `msgpackr`/`fflate`, verifies one target and one source
occurrence, rechecks the inspected blob inside the write transaction, creates a
chunk-aware backup, writes through the target chunk store, reopens and decodes
the result, checks SQLite integrity, and compares the entire decoded database
with only the target script masked. Post-commit validation failure restores only
when the current blob still equals the planned patched bytes; an intervening
writer causes fail-closed refusal instead of an automatic overwrite. It never
calls `setDatabase({plugins})` or `setDatabaseLite({plugins})`.

Synthetic fixtures cover normal apply, already-applied no-op, unknown hash,
zero/multiple target plugins, backup failure, write failure, post-write
verification rollback, non-target preservation, iOS clipboard non-invocation
with synchronous picker call, and retained desktop clipboard behavior. A
read-only check of the installed database observed 12 plugins, the known
patched script SHA-256
`5777e74585a3dfc7993cd53fef58c7ad2e649d1d6d167aaf8457355eb1885e94`,
and database blob SHA-256
`4e83c97ee316ea44524e514dc1559804edff236f1a37640cabf2d2348f05131e`.
It returned `already-applied` and performed no write or backup. The tool remains
outside manifests, installers, postinstall, and server startup.

### Follow-up gates

- Patcher: 49/49 test files passed.
- Final-composition save: 15/15 passed; focused client storage/BG set 127/127.
- Focused server invariant/log set: 17/17 passed.
- Full frontend: 152 files, 1,754 tests passed.
- Full server: 23 files, 233 passed, 12 provider-gated skips. The initial
  sandbox run failed only on loopback `EPERM`; the exact suite passed with local
  listener permission.
- Compatibility: 74 passed, five provider/environment skips. The initial
  sandbox run failed only on loopback `EPERM`; the exact suite passed with local
  listener permission.
- Svelte diagnostics: 0 errors, 0 warnings; help keys 439/439 in both languages
  with no missing references.
- Production build: 7,940 modules transformed.
- BG bundle: 8,848,439 bytes; the builder's load check resolved
  `sendChat=function`.
- Complete graph: 41 packs, 937 units, 342 managed source paths, 13 ordered
  collisions, current status, drift zero, and zero-change re-plan.
- Fresh apply/revert and stable-v0.2.1 upgrade/revert each restored all 342
  managed source paths byte-for-byte with their original POSIX modes. Newly
  owned tests were absent after revert.
- Two normal installer builds produced byte-identical mode-0755 primary/all
  artifacts at 7,889,389 bytes with SHA-256
  `f11948e18726068022bafddd87440fcd6a4762b9288bba4622b32e9543f78a17`.
  Both passed `node --check`. The generated installer applied the same 41-pack,
  937-unit, 342-path graph, re-planned with zero changes, and reverted all 342
  source paths byte/mode-exactly.

The CI push trigger now includes `codex/pocketrisu-maintenance-fixes` while
retaining `pull_request`. GitHub Actions run `35520274256` passed for
source/artifact SHA
`9bb09710348d7ea19a45271aa18f2127c82f1e75`: patcher tests, reproducible
installer build, exact-1.10 apply, frozen dependency install, embedded target
checks/build/BG bundle, and byte/mode round trip all completed successfully.

### Follow-up live delivery

Immediately before delivery, read-only stores reported native model jobs
running zero, pending sends zero, BG active states zero, and BG operation result
keys zero. The generated installer plan was exact-1.10 `verified` and named
only three changes: clarification comments in `globalApi.svelte.ts`, the new
exact-1.10 save test, and patch state. It applied those same three paths.

Because the executable runtime behavior and built assets were unchanged, the
server was neither rebuilt nor restarted. PM2 remained PocketRisu 1.10.0 at PID
105138 with restart count zero, unstable restarts zero, and active requests
zero. Final patch status was current at 41 packs and 342/342 managed paths with
drift zero; the 937-unit, 13-collision next plan had zero changed files. The new
test file's installed bytes and mode matched its manifest owner.

The existing served and local main asset remained 2,047,743 bytes with SHA-256
`82d61e1cfefee13e117892e54b211ee4e8a5e7301173a302efc6030e83124d52`.
The unchanged served build stamp was
`1.10.0-24952ea5c604431d89a7a1dc642b2f8cebb10674c58b3c1292baad7deaaedaad`.
All five current SQLite databases returned `quick_check=ok`. A final read-only
work check again found native running/pending zero and BG active/result zero.
FastImport remained at the known patched script and database blob hashes; no
plugin or database migration write was repeated.

Physical L3 was still open at this automatic-qualification checkpoint.

## User L3 and stable admission

On 2026-09-24 KST, the user reported the previously presented iPhone L3
scenarios normal. The reported scope covers native JPEG-wrapped CharX import,
FastImport's first-tap file chooser, empty-chat persistence, and initial
Request/System Logs. The report does not supply per-screen latency numbers or
a separate desktop observation; those measurements are not inferred.

The subsequent `fastimport-ios-picker` exact-1.10 pack transforms only a known
original execution copy to the already observed corrected script hash. Focused
tests execute the final composed loader before API 2.1 execution and compare
iOS synchronous picker versus desktop clipboard behavior. The installed live
plugin already has the corrected script hash. The new loader path has not
received a separate physical iPhone run; this limit is carried into the stable
receipt instead of relabelling the prior report.
