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

The distributed candidate is `0.2.2-experimental.1`. The third-party plugin
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
- One in-memory recovery key permits one automatic retry for the same identity.
- A repeated rejection for the same identity remains a visible hard failure.
- Successful chat persistence clears the pending recovery key.
- The recovery key cannot grow with the number of historical failures.
- The all-or-nothing catalog gains one exact-1.10 root owner and one target
  test file.
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
identity cannot auto-retry twice; a successful chat save clears the key
(`globalApi.svelte.ts:887-895`). No error branch deletes a chat, edits a
payload, or marks the rejected metadata as confirmed.

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

The live migration will run only while PocketRisu is stopped, after an exact
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

Physical L3 remains open. No stable tag or release has been created.
