# PocketRisu 1.10 durable background import implementation plan

> **Status:** implemented experimental candidate — automatic qualification
> passed; live apply and device L3 recorded separately
>
> **Recorded:** 2026-08-23 KST
>
> **Target:** exact official PocketRisu 1.10.0 and the personal patcher
> `codex/pocketrisu-1.10-audit` line
>
> **Proposed visible pack:** `background-import`
>
> **Primary decision:** resumable foreground upload followed by a durable,
> server-owned preparation and append-only import commit
>
> **Implementation receipt:**
> `docs/POCKETRISU-1.10-BACKGROUND-IMPORT-VALIDATION.md`

This document is the implementation plan for allowing ordinary character and
module imports to continue after an iPhone tab or Home Screen PWA moves to the
background. It extends, but does not replace, the existing CharX integrity and
terminal module/character import contracts.

No application source, patch manifest, generated installer, live source,
database, asset, job state, or user file was changed while creating this plan.
Implementation requires a later explicit user instruction.

## 0. Authority and resume boundary

### 0.1 Required reading order

1. Read the workspace `AGENTS.md` and apply its current branch, dirty-tree,
   destructive-action, active-generation, validation, and delivery rules.
2. Read this document completely.
3. Read the two existing import authorities completely:
   - `docs/POCKETRISU-1.9-CHARX-ARCHIVE-INTEGRITY-IMPLEMENTATION-PLAN.md`
     from the preserved 1.9 worktree;
   - `docs/POCKETRISU-1.9-MODULE-IMPORT-UX-IMPLEMENTATION-PLAN.md`
     from the preserved 1.9 worktree.
4. Read the current 1.10 receipt:
   - `docs/POCKETRISU-1.10-CHARX-MODULE-ALL-VALIDATION.md`.
5. Read only the current BG orchestration sections needed for operation ID,
   durable state, result claim/ACK, cancellation, and hydration lessons. The
   generation implementation is precedent, not the import owner.
6. Revalidate current code, branch, pack graph, and live state before editing.
   Counts and paths below are observed starting points, not acceptance
   constants.

### 0.2 Existing authorities that must survive

- `charx-archive-integrity` remains the archive structure, CRC, overlap,
  selected-entry, and resource-limit authority.
- `character-import-ux` remains the single character/module selection lease,
  top notification, low-level confirmation boundary, one-commit rule, and
  terminal persistence feedback authority.
- `lazy-chat-sync` remains the browser/server database serialization,
  canonical chat, ETag, persistence, and conflict owner.
- `client-build-fence` remains the stale-client writer gate.
- `bg-preserve` remains generation orchestration only. Its protocol patterns
  may be reused, but import work must not share its run registry, result keys,
  cancellation keys, or retention budget.
- Native PocketRisu 1.10 orphan-reference and persona asset walkers remain
  authoritative after an imported entity is committed.

### 0.3 Implementation authorization prompt

A later implementation session should be explicitly authorized with a prompt
equivalent to:

> Read `docs/POCKETRISU-1.10-BACKGROUND-IMPORT-IMPLEMENTATION-PLAN.md` as the
> authority. Revalidate the current branch, exact 1.10 source, live state, and
> pack ownership. Start only with the disposable upload, parser-reuse, and
> append-only commit spikes. Continue phase by phase only after each gate
> passes. Keep exhaustive raw patch-combination verification skipped as
> previously instructed, but run every focused owner composition and the
> maximum `all` graph. Preserve dirty files, user data, and active generation;
> commit and push small boundaries before a process-first safe live apply.

That prompt does not authorize deleting user data, cancelling generation,
force push, discarding dirty changes, or publishing a stable release.

### 0.4 Observed starting point

At plan creation:

- `codex/pocketrisu-1.10-audit` was clean at `8cb6609`, with local/origin 0/0;
- live PocketRisu 1.10.0 used rolling `all` with 35 packs, 716 units, and 267
  managed paths;
- `character-import-ux` 0.2.1 and `charx-archive-integrity` 0.1.0 were current
  in live patch state;
- the user had passed the iPhone `.risum`/`.module.charx` picker, top-notice,
  import, and reload-persistence follow-up;
- ordinary character CharX, persona, cross-build fence, and BG aggregate L3
  remained separate;
- the reported original problematic CharX was still unavailable, so existing
  integrity evidence remained synthetic mechanism qualification;
- exhaustive raw-selection combination verification remained skipped by the
  user's explicit instruction.

Revalidate every fact that an implementation decision depends on. None of
these counts or revisions is a future acceptance constant.

## 1. Feasibility conclusion and hard platform boundary

### 1.1 What is feasible

Once the complete source bytes and an accepted authorization decision are
durably acknowledged by NodeOnly, the server can continue archive validation,
asset extraction, staging, database commit, and result recording while every
browser tab is suspended or gone. A restarted server can resume deterministic
import work from the durable source and checkpoints.

### 1.2 What cannot be guaranteed in a PWA

At file-selection time, the only copy may still be the browser `File`. iOS can
completely suspend an inactive tab, and a Service Worker is short-lived and
may be terminated by the user agent. Therefore the product cannot truthfully
promise that a local file keeps uploading immediately after the user leaves.

The hard UX boundary is:

```text
selected, not fully uploaded
  = resumable but not background-safe

complete source + authorization durably acknowledged by NodeOnly
  = background-safe
```

The client must show those as different phases. It must never display
“continuing in background” before the server verifies the complete upload.

Primary platform references:

- <https://webkit.org/blog/8970/how-web-content-can-affect-power-usage/>
- <https://www.w3.org/TR/service-workers/#service-worker-lifetime>
- <https://bugs.webkit.org/show_bug.cgi?id=182565>

### 1.3 Why the current flow stops

The current page owns the real work, not only its progress UI:

- CharX reads the browser `File` by slices, validates it, extracts one selected
  entry at a time, and awaits `saveAsset()` for every entry.
- RisuM reads the browser bytes, decodes each asset record, and awaits one
  `saveAsset()` per record.
- ordinary character JSON/PNG, module JSON/lorebook/regex, module CharX, Realm,
  share, launch, and package paths ultimately execute in a page-owned Promise
  chain;
- character/module success then waits for browser-owned database tracking and
  server confirmation.

When iOS suspends the page, the next extraction, upload, progress callback,
and final commit are not scheduled. One already-issued HTTP request may finish,
but the sequential loop still cannot advance until the page runs again.

## 2. Product outcome

### 2.1 Final user-visible contract

For a supported import, the top notification moves through one durable job:

```text
Selecting file
  -> Uploading to server (resumable; stay until handed off)
  -> Inspecting format
  -> Confirmation required, if applicable
  -> Handed to server (safe to leave)
  -> Validating
  -> Preparing assets
  -> Committing import
  -> Imported / Failed / Cancelled / Needs reconciliation
```

While the page is suspended, the toast does not animate. The server progress
record continues. On visibility return or cold boot, the client reads the
latest durable state and updates the same logical job rather than creating a
duplicate toast or import.

Before the background-safe boundary, the existing before-unload protection
remains because closing the page can interrupt source transfer or a required
authorization. After the durable handoff, remove that page-lifetime warning:
the user may close or navigate away, while the server-side one-import lease and
recovery listing remain authoritative.

### 2.2 Final completion promise

“Imported” means all of these are true:

1. the complete source was verified;
2. structure, semantic shape, limits, and required assets passed;
3. low-level access was accepted when required;
4. staged assets needed by the imported entity are durable;
5. exactly one fresh character or module was appended to the latest canonical
   database without replacing unrelated state;
6. imported character chat IDs and payloads are durable;
7. the server recorded the exact committed database revision and imported ID;
8. the returning client reconciled or reloaded that revision before showing
   terminal success;
9. the result was ACKed without deleting the imported user data.

### 2.3 First-delivery scope

The first complete delivery targets creation of a new entity from:

**Modules**

- `.risum`;
- module `.charx`;
- native module JSON;
- Risu lorebook JSON;
- external lorebook JSON;
- regex JSON;
- Module settings picker, main-window drop, share/hash, launch, and fetched
  payload adapters after source bytes are available.

**Characters**

- character JSON and compatible off-spec JSON;
- PNG character cards;
- `.charx`;
- JPEG-prefixed CharX;
- local picker/drop, share/hash/launch, Realm payload, and URL payload adapters
  after source bytes are available.

### 2.4 Separately gated extensions

These are planned, but cannot ride the first ordinary-new-entity commit gate:

- new-character package import, because it also creates personas, chats, and
  inlays under a package-owned progress and confirmation contract;
- known allowlisted Realm server-fetch, because arbitrary server URL fetching
  would create an SSRF surface;
- package-to-existing-character, because it mutates existing user data and
  requires a true three-way merge rather than append-only admission.

The first implementation must leave those paths on their current foreground
behavior until their own phase passes. It must label that fallback honestly.

### 2.5 Explicit non-goals

- MCP module import;
- backup restore or save-folder import;
- module enable/apply/edit/delete/export;
- automatic server fetch of arbitrary URLs;
- keeping iOS JavaScript alive with audio, timers, Wake Lock, or a Service
  Worker loop;
- deleting content-addressed assets after a failed import;
- changing CharX exporter format;
- changing RisuM format or claiming integrity it does not encode;
- background mutation of an existing character in the first delivery;
- stable release before the remaining aggregate review and L3 gates.

## 3. Current ownership and proposed pack boundary

### 3.1 Observed 1.10 intersections

At planning time, the following current paths have multiple owners:

- `server/node/server.cjs`: BG, build fence, snapshot adapters, startup/lazy
  storage, persona, and Kei restore adapters;
- `src/ts/storage/nodeStorage.ts`: asset retry, build fence, startup/lazy
  storage, BG/lazy, and restore adapters;
- `src/ts/globalApi.svelte.ts`: BG, build fence, lazy storage, BG/lazy, and
  persona units;
- `src/ts/characterCards.ts`: character import UX, CharX integrity, and
  Personal navigation units;
- `src/ts/process/modules.ts`: character import UX and BG module-cache units;
- `src/App.svelte`: BG, character organizer, import UX, and Personal units.

The implementation must not add another whole-file owner for those paths.

### 3.2 Proposed visible pack

Create a new visible `background-import` pack rather than silently expanding
generation BG or making rollback of ordinary import UX dependent on the new
server subsystem.

Proposed policy:

- `userSelectable: true`;
- exact PocketRisu 1.10 target starts as `reviewing`;
- no preset default during disposable/staging qualification;
- after focused qualification and explicit admission, add `features` as its
  preset default, which also admits it to rolling `all`;
- require `character-import-ux`, `charx-archive-integrity`, `lazy-chat-sync`,
  and `client-build-fence` for the complete all-format contract;
- do not require `bg-preserve`;
- add a conditional BG adapter only for source-list/bundle freshness and any
  exact host ordering needed when BG is present.

If dependency expansion from `features` into integrity/build-fence hardening is
judged too surprising at review, keep the pack explicitly selectable and add
it only to `all`. Do not weaken the safety dependencies to preserve a label.

### 3.3 Proposed owned target modules

Prefer new files with small host hooks:

| Target path | Responsibility |
| --- | --- |
| `src/ts/process/backgroundImport.ts` | client admission, upload, recovery, reconciliation |
| `src/ts/process/backgroundImportProtocol.ts` | shared states, error/result schemas, validation |
| `src/ts/process/backgroundImport.test.ts` | lifecycle, multi-tab, stale-state, UX tests |
| `server/node/importJobStore.cjs` | durable state machine, idempotency, retention metadata |
| `server/node/importUpload.cjs` | resumable spool, offsets, hashes, capacity, fsync boundary |
| `server/node/importPrepare.cjs` | format dispatch, metadata inspection, staged result |
| `server/node/importCommit.cjs` | append-only canonical commit and idempotent recovery |
| `server/node/importRoutes.cjs` | authenticated/fenced HTTP API only |
| `server/node/import*.test.ts` | upload, restart, authorization, commit, fault injection |

A disposable spike must decide whether existing pure TypeScript parsers can be
bundled once for Node, or whether a smaller shared core is required. Do not
copy CharX/RisuM algorithms into unrelated browser and server implementations.

### 3.4 Existing-host changes

- `characterImportState.ts`: synthesize the one-import lease from a durable
  operation and expose a reconnecting reporter; keep one toast component.
- `moduleImport.ts` and `modules.ts`: choose background execution after source
  selection; preserve the existing foreground orchestrator as fallback and
  differential oracle.
- `characterCards.ts`: choose background execution for supported new-character
  sources; preserve parent package/Realm semantics until separately admitted.
- `globalApi.svelte.ts` or an owner-local storage module: add a strict
  authoritative database refresh/merge acknowledgement, not a second save
  loop.
- `nodeStorage.ts`: add narrow import-job API methods through the existing
  authenticated and build-fenced fetch authority.
- `server.cjs`: register the new route owner and pass canonical storage
  dependencies through small hooks after the active lazy replacement.
- `clientBuildFence.cjs`: fence every import writer/cancel/ACK route that can
  create durable source, authorization, commit, or cleanup state.

## 4. Durable operation model

### 4.1 Identity

The client creates a cryptographically strong operation ID before the first
upload request and stores a bounded local marker before sending bytes. The
server treats the operation ID plus phase-appropriate write-once coordinates
as the idempotency key.

Coordinates fixed at creation include:

- protocol/schema version;
- import kind (`character` or `module`);
- normalized declared format;
- source byte length;
- sanitized origin class, never a personal filename.

Later phases add write-once coordinates only when they become knowable:

- full-source SHA-256 at verified upload completion;
- prepared semantic digest plus entity/chat IDs at preparation completion;
- committed database revision at commit completion.

The admission build stamp is retained for diagnosis and every writer request
is fenced against the currently served build, but the old stamp is not an
immutable operation coordinate. A new compatible build must be able to resume
an old upload through an explicit protocol-version gate.

A repeated request must match every coordinate already fixed for its current
phase. A conflicting value never replaces the earlier operation.

### 4.2 State machine

```text
created
  -> receiving
  -> uploaded
  -> inspecting
  -> awaiting-authorization (optional)
  -> queued
  -> preparing
  -> prepared
  -> committing
  -> completed
  -> client-reconciled
  -> delivered

terminal alternatives:
  failed | cancelled | incompatible-after-upgrade

recoverable alternative:
  reconcile-required
```

`completed` is server-terminal: the entity and result are durable, but it is
not yet a user-visible success on a returning client. `client-reconciled` and
`delivered` close the normal UI path; `failed`, `cancelled`, and an explicitly
reported incompatible upgrade close their own UI paths. `awaiting-authorization`
is parked without asset materialization. `prepared` survives a database
conflict or restart without re-upload.

### 4.3 Durable record

Use a dedicated `save/import-jobs.db` or equivalently isolated import tables;
do not overload `model-jobs.db`, request logs, BG KV prefixes, or the main
RisuAI database blob for job metadata.

Persist only bounded metadata:

- operation ID and schema version;
- kind/format/source size/source hash;
- state and progress counters;
- authorization requirement/decision, not prompt contents;
- staged entity ID and chat IDs;
- base/committed database revision;
- typed terminal error code and bounded sanitized detail;
- timestamps, claim, ACK, and cleanup status.

Do not persist raw card/module/user text in the job metadata table or logs.
The private source spool and staged payload are separate files with private
permissions.

### 4.4 Progress authority

The server record, not an SSE connection or toast, is progress authority.
Progress is monotonic within named phases:

- received bytes / source bytes;
- inspected metadata count;
- selected assets completed / total;
- selected bytes completed / total;
- commit step and terminal revision.

Visible clients may poll or use SSE while foregrounded, but every event is
derived from the durable record. `visibilitychange`, app boot, and manual
Module/Character page entry trigger an immediate status refresh.

## 5. Resumable upload and spool

### 5.1 API sketch

The exact route names may change, but the ownership should resemble:

```text
POST   /api/import-jobs
PUT    /api/import-jobs/:operationId/source
POST   /api/import-jobs/:operationId/source/complete
POST   /api/import-jobs/:operationId/authorize
GET    /api/import-jobs/:operationId
GET    /api/import-jobs?recoverable=1
GET    /api/import-jobs/:operationId/result
POST   /api/import-jobs/:operationId/ack
DELETE /api/import-jobs/:operationId
```

The upload request carries an exact byte range and chunk SHA-256. The server
accepts only the next offset or an exact replay of an already acknowledged
range. It returns the durable next offset. Completion verifies total length
and full SHA before changing `receiving` to `uploaded`.

Creation, source writes, upload completion, authorization, cancellation, and
ACK are authenticated and build-fenced. Admission/source writes also use the
current active-session authority. Read-only status/result recovery is
authenticated but must be reachable from a newly booted PWA before it becomes
the active database writer. The detached server processor holds no browser
session lease after admission.

### 5.2 Upload behavior

- read one bounded `File.slice()` at a time;
- choose chunk size and concurrency from a disposable iPhone/Node measurement,
  not an arbitrary constant;
- do not hold the whole file in browser memory;
- keep at most the explicitly measured in-flight byte budget;
- on suspend, retain the last server-acknowledged offset;
- on return/cold boot, require the user to reselect the same file if the
  browser no longer retains a usable `File`, verify size/hash coordinates, and
  resume rather than restart;
- never claim the source is server-owned until completion fsync and full hash
  verification succeed.

Browser File handles cannot be assumed durable across iOS cold boot. The plan
must test whether an IndexedDB-stored Blob is safe for the admitted size range;
if not, re-selection is the honest recovery contract.

### 5.3 Server spool

- store source files under a private import-spool directory, not the web root;
- derive paths solely from validated operation IDs;
- ignore user filenames for filesystem paths;
- use exclusive creation, no symlink following, and private modes;
- preflight disk capacity before accepting a new source;
- fsync the source and parent directory before returning background-safe;
- enforce source, job-count, aggregate spool, age, and filename-metadata limits;
- freeze numeric policies only after normal-corpus and device measurements;
- never store the full source as a single SQLite BLOB.

### 5.4 Cancellation and cleanup

Cancellation is explicit user action against an exact operation ID.

- `receiving` through `prepared`: stop new work, settle/close open readers,
  mark cancelled, then remove only import-owned spool/staging;
- `committing`: return a definite outcome; do not claim cancellation until the
  commit transaction is known not to have completed;
- `completed` or later: return already committed and never delete the imported
  module/character or its assets;
- a page disappearing is not cancellation;
- automatic retention cleanup may remove only copies in the documented import
  spool after its bounded retention policy, never original files or committed
  user data.

## 6. Server preparation engines

### 6.1 Shared parser authority

The server must consume the same pure format contracts as the foreground path:

- CharX: existing central-indexed `charxArchive` rules, CRC, local/central
  consistency, overlap, exact names, and current resource limits;
- RisuM: existing staged envelope/cardinality/record limits and typed errors;
- module JSON/lorebook/regex: existing centralized `moduleFromJson` semantics;
- character JSON/off-spec JSON: extracted pure conversion/validation from the
  current character importer;
- PNG: pure PngChunk metadata and embedded-asset extraction with bounded
  streaming behavior;
- JPEG-prefixed CharX: explicit prefix/container mode, never signature search.

The Node spike must prove exact output equivalence against the foreground
engine on a generated corpus before any server result can commit.

### 6.2 File-backed extraction

CharX and package paths must use a seekable file-backed reader. Do not convert
the entire source to `Uint8Array`. Each selected entry is validated and written
to an import-owned staging file or bounded buffer before the next entry exceeds
the retained-byte budget.

RisuM currently keeps encoded records in memory. The server spike must either
prove the current 1 GiB aggregate policy fits a bounded streaming record cursor
or refactor the pure reader to index record offsets and decode one record at a
time. Do not move the same whole-archive retention from Safari to Node and call
it solved.

### 6.3 Semantic preparation result

Preparation yields an immutable, schema-versioned result:

```text
PreparedImport
  kind
  format
  entity with stable fresh IDs
  full chat payloads with stable IDs, for characters
  asset promotions: staged path -> content-addressed asset key
  authorization facts
  selected counts and byte inventory
  semantic digest
```

No database or final asset namespace is mutated while the result is only
`prepared`.

### 6.4 Typed error families

Preserve existing CharX/RisuM codes and add stable transport/job/commit codes,
for example:

```text
IMPORT_SOURCE_MISMATCH
IMPORT_UPLOAD_INCOMPLETE
IMPORT_CAPACITY_EXCEEDED
IMPORT_UNSUPPORTED_FORMAT
IMPORT_AUTHORIZATION_REQUIRED
IMPORT_AUTHORIZATION_DECLINED
IMPORT_PREPARATION_FAILED
IMPORT_COMMIT_CONFLICT
IMPORT_COMMIT_FAILED
IMPORT_CANCELLED
IMPORT_PROTOCOL_INCOMPATIBLE
IMPORT_RECONCILIATION_REQUIRED
```

Do not retry deterministic parser, structure, authorization, or limit errors.
Retry only explicitly classified transient I/O at its owning layer.

## 7. Low-level authorization

Low-level authorization remains a foreground security decision.

1. upload completes;
2. server performs metadata-only inspection without saving module assets;
3. if low-level access is absent, queue preparation;
4. if present, park `awaiting-authorization` and return the requirement;
5. the client shows the existing modal once;
6. decline marks the exact job cancelled with zero asset promotion/entity
   commit;
7. accept is durably recorded before processing begins;
8. only then may the notification say background-safe.

An embedded RisuM or CharX-to-module path must not create a second confirmation
or toast owner. Package parents retain their own confirmation until that phase
is explicitly migrated.

## 8. Asset staging and promotion

### 8.1 Staging rule

Do not expose partially prepared assets as a completed import. Preferred
first design:

- extract and hash into an import-owned private staging directory;
- deduplicate by SHA within the job;
- verify every expected first/middle/last payload and total inventory;
- only the commit phase promotes content to `assets/<hash>.<ext>`;
- an existing identical asset key is reused after byte equality confirmation.

### 8.2 Transaction boundary

The disposable commit spike must test whether asset KV writes, chunked
`database.bin`, the import commit marker, and chat state can safely participate
in one SQLite transaction under the current chunk-store implementation.

If one transaction is not valid, use the narrower proven boundary:

1. promote content-addressed assets first;
2. atomically persist database metadata plus exact import commit marker;
3. report completion only after both are durable.

A crash between steps may leave an unreferenced content-addressed asset, but
must never expose a character/module referencing missing content or overwrite
existing data. Do not auto-delete such assets; native explicit orphan purge is
the existing cleanup authority.

## 9. Append-only canonical commit

### 9.1 Why exact base-revision refusal alone is insufficient

Imports can process while another PWA edits unrelated settings or chats. An
exact base-revision precondition would park many harmless conflicts. Blindly
writing the submission-time database would lose those edits.

The allowed server mutation is therefore an append-only merge into the latest
canonical database under the existing storage queue.

### 9.2 Module commit

Under one storage-queue turn:

1. drain or supersede pending save timers through an owner-local strict helper;
2. load the latest canonical full database and server chat store;
3. if the operation marker or module ID already exists with the same digest,
   classify it as an idempotent completed retry;
4. reject an ID collision with different content;
5. append exactly one module without enabling or applying it;
6. preserve every existing module and all unrelated root fields;
7. persist immediately, update cache/ETag, and write the commit marker;
8. record the committed revision and module ID.

### 9.3 Character commit

Under the same authority:

1. use a fresh character ID and fresh stable chat IDs fixed in preparation;
2. append exactly one new character to the latest character array;
3. append/order it according to the existing normal-import default without
   moving or rewriting existing characters/folders;
4. increment the committed-import statistic exactly once;
5. persist full chat payloads and metadata without creating lazy shells that
   lack bodies;
6. preserve selected character, current chat, persona, settings, and every
   unrelated root field;
7. update canonical caches/chat store/ETag only after durable success;
8. record the committed revision and character/chat IDs.

Server commit must not perform client navigation. On return, the existing
Personal import-navigation policy decides whether to open the imported entity
or stay on the current screen.

### 9.4 Pending saves and restart

The server helper must make delayed `/api/patch` and chat-save timers unable to
overwrite a completed import with an older cache snapshot. Required spike and
tests:

- pending patch timer before import commit;
- chat timer before import commit;
- timer callback queued behind commit;
- process exit before and after database write;
- commit marker present but client result absent;
- entity present but marker write interrupted;
- exact operation retry after every boundary.

No job reaches `completed` until the canonical database, chat store, cache,
ETag, and marker agree.

## 10. Client reconciliation and multi-PWA behavior

### 10.1 Returning initiating client

On foreground/cold boot:

- discover the operation from the local marker and bounded server recoverable
  listing;
- claim one result consumer using operation identity;
- if the local database is clean, reload the committed server revision;
- if local state is dirty, merge the prepared append-only entity by exact ID
  into the live database and run the existing strict persistence path;
- if the same ID/content is already present, treat it as idempotent;
- if the same ID differs or safe merge cannot be proven, freeze import
  reconciliation and expose a recoverable conflict instead of replacing data;
- show success only after the local view contains the entity and matches a
  server-confirmed revision;
- ACK the result after that confirmation.

The result response carries bounded canonical entity data, imported IDs,
semantic digest, and committed revision needed for reconciliation. It does not
return source archive bytes or asset payloads. Raw entity/chat data is read
from the private prepared result or the committed canonical database and is
never copied into ordinary job metadata or logs.

### 10.2 Other active clients

Every client with an older database revision must be unable to overwrite the
server-appended entity. The existing ETag/build-fence/conflict paths must be
tested with the new append. If they do not preserve an unknown server-added
module/character, add an explicit imported-entity rebase rule before admission.

### 10.3 Claims and ACK

Reuse the proven semantics, not the generation keys:

- non-destructive result GET;
- short first-consumer claim with heartbeat while reconciliation runs;
- exact ACK after confirmed local visibility;
- claim expiry permits another PWA to recover;
- ACK loss is retryable and never duplicates the import;
- result cleanup never deletes committed entity/assets.

## 11. Cross-feature exclusion and server guards

### 11.1 One active import

Preserve the existing one-import-at-a-time product contract across tabs and
process restarts. The server rejects a second active import and returns the
existing operation summary. The UI opens/reconnects to it instead of creating
a second picker or toast.

### 11.2 Replacement, maintenance, and read-only operations

The server must mirror the current client import guard after the initiating
page disappears:

- any active/resumable import blocks database replacement, backup restore,
  save-folder migration/import, snapshot restore, destructive cleanup, and
  application update with a retryable no-mutation result;
- an explicit import cancellation must reach its terminal cleanup before one
  of those operations can proceed;
- read-only backup/export/estimate may proceed during receiving/preparation and
  observes a pinned source through its existing owner;
- orphan purge and optimize/VACUUM may proceed during receiving/preparation
  only if the spike proves staging is outside every final asset/reference
  namespace; they are blocked while promotion/commit is active;
- ordinary database/chat writes may continue during receiving/preparation; the
  append-only commit consumes their latest durable result;
- the short final commit serializes through the storage queue.

The first release should block application update rather than assume a new
server can resume an old protocol. Cross-version migration can relax that only
after an explicit compatibility test.

### 11.3 Generation

Ordinary generation and BG generation may continue during upload/preparation.
The short final commit serializes through storage but does not cancel or own
generation. If a generated chat save overlaps commit, both must persist
without a lost update.

## 12. Restart, recovery, retention, and capacity

### 12.1 Restart semantics

- `receiving`: retain verified offset; wait for client resume;
- `uploaded`/`inspecting`/`queued`: restart deterministically from the verified
  source;
- `awaiting-authorization`: remain parked;
- `preparing`: discard only temporary derived buffers, retain source, and
  restart deterministic preparation or a proven checkpoint;
- `prepared`: retain exact prepared digest/staging;
- `committing`: reconcile marker/entity/digest before retry;
- `completed`: retain result until reconciliation ACK/retention;
- `cancelled`/`failed`: never auto-restart work.

### 12.2 Capacity

Define measured bounds for:

- simultaneous active jobs;
- total receiving/prepared jobs;
- source file bytes;
- aggregate spool bytes;
- selected uncompressed bytes and entry counts;
- per-entry and retained memory;
- prepared-result metadata;
- terminal result rows and retention age.

When capacity is full, refuse a new job without deleting or evicting active,
prepared, unacknowledged, or committed work. Terminal cleanup selection must be
deterministic and exclude anything with a live claim.

### 12.3 Observability

Log only operation prefix/hash, kind, phase, counts, bytes, state, duration,
and typed errors. Do not log filenames, card/module names, prompts, asset
contents, URLs with tokens, or raw serialized database values.

Expose a read-only diagnostic summary for:

- state counts;
- active operation and phase;
- spool bytes;
- oldest recoverable/terminal age;
- last typed failure;
- commit/reconciliation/ACK state.

### 12.4 Backup and restore boundary

- import source/spool/staging files and `import-jobs.db` are operational state,
  not module/character content, and are excluded from user full/settings
  export formats;
- application-only rollback and ordinary source update preserve them only when
  the running code understands their schema;
- database restore is refused while any job can still commit or reconcile;
- terminal committed modules/characters are ordinary user data and follow the
  existing database/asset backup path;
- restoring an older user backup never auto-replays a historical completed
  import result into that restored database;
- server/manual filesystem backup may copy the private operational directory,
  but restore admission must validate protocol version and terminal state
  before using it.

## 13. Implementation phases and gates

### Phase 0 — frozen current baseline

**Actions**

- revalidate branch/HEAD/remote/status/worktrees and live 1.10 state;
- enumerate every current character/module entry point and exact owner again;
- record foreground outputs for generated valid fixtures in every admitted
  format;
- record current suspend behavior without using user content;
- freeze current DB/asset/notification/navigation effects as differential
  oracles;
- confirm original problem CharX availability separately from synthetic
  mechanism fixtures.

**Exit gate**

- complete input/owner/effect matrix exists;
- no source/live mutation occurred;
- every future semantic comparison has a normalized expected result.

### Phase 1 — three disposable feasibility spikes

This phase creates no production pack.

**A. Upload/resume spike**

- private temporary endpoint and disposable spool;
- sliced upload, exact offset replay, chunk/full SHA, fsync;
- iPhone tab switch during upload and after complete handoff;
- cold return requiring same-file re-selection;
- measure memory, throughput, abort shape, and retained server bytes.

**B. Parser reuse spike**

- bundle or refactor current CharX, RisuM, JSON, PNG, and conversion cores for
  Node without UI/database owners;
- run the independent CharX oracle and existing module fixtures;
- compare normalized foreground/server entities and asset SHA inventories;
- prove file-backed memory bounds.

**C. Canonical append spike**

- use a copied disposable database and storage queue;
- append one module and one character with chats/assets;
- inject unrelated concurrent edits, pending timers, crashes, and exact retry;
- prove no old cache/timer can remove the import;
- determine the actual SQLite transaction boundary.

**Admission gate**

All three must pass. If parser reuse or canonical append cannot be proven, the
plan stops at background preparation plus foreground commit; it must not claim
full background completion.

### Phase 2 — pure protocol and job store

- implement schema validators and state-transition table;
- implement operation identity/idempotency;
- implement durable job store, claims, ACK, cancellation tombstones, retention
  planning, and read-only diagnostics;
- fault-inject every state write and process restart;
- add no target import hooks yet.

### Phase 3 — resumable source handoff

- implement fenced authenticated create/upload/complete/status/cancel routes;
- implement private spool and disk/capacity policy;
- add client upload/resume marker and truthful background-safe boundary;
- preserve current foreground importer after upload for this phase;
- verify suspend/cold return never duplicates or silently restarts bytes.

### Phase 4 — server preparation, no final DB mutation

- integrate pure parser adapters and metadata-only authorization inspection;
- stage assets and immutable prepared results;
- keep final commit foreground-only behind an experimental diagnostic gate;
- compare every prepared result with current foreground output;
- run archive/resource/corruption and low-level decline gates.

This phase is a required safety checkpoint, not the final feature claim.

### Phase 5 — append-only server commit

- implement strict storage-queue helper and timer/cache reconciliation;
- implement module append and character/chat append;
- add idempotent commit marker and exact revision result;
- inject first/middle/last asset, DB, marker, cache, backup, and process failure;
- prove unrelated concurrent edits survive;
- prove completed jobs survive server restart without duplicates.

### Phase 6 — client reconciliation and durable UI

- reconnect shared import lease/toast to server status;
- implement clean reload and dirty append-only merge paths;
- implement multi-PWA claim/heartbeat/ACK;
- fence stale client writers and test lost start/result/ACK responses;
- preserve existing low-level modal, picker cancel, route navigation, and one
  terminal notification.

### Phase 7 — entry-point integration

Admit one path only after its differential tests pass:

1. Module settings `.risum`;
2. module `.charx`;
3. module JSON/lorebook/regex;
4. local character CharX/JPEG;
5. PNG and character JSON;
6. drop/share/hash/launch;
7. Realm/client-fetched payloads;
8. new-character package as a separately reviewed child.

Package-to-existing-character remains deferred until a three-way merge plan is
approved.

### Phase 8 — patcher ownership and adapters

- add the visible pack and owned files;
- add minimal exact-1.10 hooks after current full replacements;
- add explicit ordering/adapters for character UX, CharX integrity, lazy
  storage, build fence, BG, Personal navigation, organizer, restore/snapshot,
  and toolchain owners where paths intersect;
- run plan/apply/current/reapply/exact revert for focused graphs;
- generate installers twice and compare byte-for-byte;
- keep target `reviewing` and preset default absent until admission.

### Phase 9 — automatic qualification and L2.5

Run in this order:

1. protocol/state transition and fault-injection tests;
2. upload offset/hash/reselection/restart tests;
3. parser differential and independent fixture oracle;
4. resource, bomb, disk-capacity, and retained-memory tests;
5. low-level authorization matrix;
6. append-only commit/concurrency/crash tests;
7. client clean/dirty/multi-PWA recovery tests;
8. every admitted origin/format equivalence test;
9. patcher full tests and deterministic installers;
10. focused owner compositions and maximum rolling `all`;
11. exact target frontend/server/compat suites;
12. Svelte diagnostics, production frontend, parser/server bundle, and BG
    bundle build/load where present;
13. exact revert including modes/symlinks/state/intent;
14. runtime L2.5 audit and sensitive-information sweep.

Per the user's standing instruction, do not run the exhaustive raw-selection
combination verifier. Record that residual risk explicitly. Focused owner
graphs and the maximum `all` graph remain mandatory and do not become a claim
of exhaustive subset coverage.

### Phase 10 — commits, push, safe live apply, and L3

Suggested small commit boundaries:

1. `test(import): add durable operation and upload fixtures`
2. `feat(import): add resumable source handoff`
3. `feat(import): add server preparation engines`
4. `feat(import): add append-only canonical commit`
5. `feat(import): add client recovery and reconciliation`
6. `feat(import): route admitted character and module sources`
7. `build(patcher): add background import pack and adapters`
8. `docs(import): record qualification and rollback boundaries`

Before live mutation:

- preserve dirty/untracked work and stage explicit owned paths only;
- commit and push the private branch;
- qualify a disposable exact-1.10 target;
- record live patch state/intent/dependencies/build identity;
- create a persistent application-only rollback excluding user data;
- read native/BG/import active and parked work without cancellation;
- wait for a safe point and stop PM2 before source writes.

Live sequence:

```text
PM2 stop
  -> transactional patch transition
  -> frozen dependency install
  -> stopped-tree focused/full gates
  -> frontend + import parser/server bundle + BG bundle builds
  -> production prune
  -> zero-change plan/current status
  -> PM2 start
  -> HTTP and served/local identities
  -> DB/backup/job-state/log readback
  -> concrete iPhone L3
```

## 14. Automated test matrix

### 14.1 Upload and source

- zero, one, many chunks;
- first/middle/last disconnect;
- exact acknowledged replay;
- overlap, gap, out-of-order, changed replay, wrong chunk hash;
- wrong total size/full hash;
- page suspend and return;
- page kill with same-file re-selection;
- server restart at every acknowledged offset;
- disk full/permission/fsync/rename failure;
- source/job/spool capacity exact boundaries;
- cancellation before, during, and after complete upload.

### 14.2 State and idempotency

- every legal transition;
- every illegal/skipped transition refused;
- same operation/same coordinates reused;
- same operation/different coordinates conflict;
- lost create/upload-complete/authorize/commit/result/ACK response;
- duplicated POST from two PWAs;
- restart in every state;
- claim expiry and second consumer;
- no terminal state resurrects processing.

### 14.3 Format differential

For every admitted format, compare foreground and server preparation after
normalizing IDs/origin metadata:

- entity fields;
- chat fields/messages/order;
- module lorebook/regex/triggers/assets;
- asset names, bytes, SHA, and references;
- import statistic effect;
- low-level decision;
- navigation result;
- typed failure class.

Use generated/property-varied fixtures. Do not hardcode personal filenames,
asset counts, failure offsets, or one archive layout.

### 14.4 Commit and conflict

- unrelated root edit during preparation;
- module addition/deletion by another client;
- character/order/folder edit by another client;
- new chat save and BG generation result during commit;
- pending database/chat timers;
- same imported ID already present with same/different digest;
- first/middle/last asset promotion failure;
- DB write, marker, cache, chat-store, ETag, backup failure;
- process exit at every commit boundary;
- stale client next write cannot remove imported entity;
- dirty initiating client merge preserves both local edit and import;
- failed reconciliation retains result and exposes recovery.

### 14.5 UI and security

- one shared lease across foreground/background character/module imports;
- second tab/import refused and reconnects to existing job;
- one toast across upload, background preparation, commit, and terminal state;
- no false success while page is hidden;
- low-level modal exactly once for every capable origin;
- decline causes zero commit/promotion;
- unsupported/corrupt files fail with one terminal outcome;
- no import enables module code;
- build-stale writers receive a definite not-committed result;
- logs/reports contain no filename/content/token/private path.

## 15. L2.5 audit surfaces

- iOS may suspend during the last chunk or upload-complete response;
- IndexedDB Blob retention may be evicted or duplicate large source bytes;
- Node zip.js file adapter and worker/CSP behavior;
- RisuM record indexing versus whole-file retention;
- server parser bundle staleness after client source changes;
- storage queue starvation during large preparation versus short commit;
- SQLite transaction nesting with chunk store;
- delayed save timers and stale dbCache/fullChatStore;
- native orphan purge while staging exists;
- server update/restart while protocol version changes;
- low-level authorization parked across cold boot;
- active import versus restore/update/VACUUM/purge;
- multi-PWA claims and stale local markers;
- missing local marker but recoverable server job;
- dirty client reconciliation and conflict UI;
- package parent ownership and existing-character merge;
- retention cleanup of private copies without touching committed data;
- capacity pressure with all jobs non-evictable;
- error reporting without personal content.

## 16. Concrete iPhone L3

Automate server/DB/hash evidence first. Ask the user only for physical behavior:

1. **Upload-boundary truthfulness**
   - Select a large disposable RisuM.
   - Background during upload, return, and confirm it resumes from the last
     acknowledged point without duplicate work.
   - Keep the app visible until “handed to server” appears.
2. **Background-safe processing**
   - After handoff, switch apps long enough for server progress to advance.
   - Return and confirm the same single job advances/completes.
3. **Cold boot**
   - After handoff, fully terminate the PWA and reopen.
   - Confirm the job is rediscovered and the result appears once.
4. **Module matrix**
   - Repeat for `.risum` and `.module.charx`.
   - Confirm one module, no duplicate character, one terminal notification,
     and persistence after reload.
5. **Character matrix**
   - Repeat for normal CharX and PNG/JSON.
   - Confirm one character, representative first/middle/last assets, and chats
     persist after reload.
6. **Low-level authorization**
   - Decline once: no asset promotion/entity/success and the next import works.
   - Accept once, then background after the safe boundary and confirm success.
7. **Concurrent edit**
   - Edit an unrelated setting or chat from another PWA during preparation.
   - Confirm both the edit and imported entity remain.
8. **Explicit cancel**
   - Cancel a pre-commit job and confirm no imported entity or resurrection.
   - Do not use a committed real module/character as the cancellation fixture.

The user is not asked to inspect hashes, corrupt personal files, invoke raw
endpoints, or delete test artifacts automatically.

## 17. Rollback boundary

Code rollback is application and dependency state only:

```text
wait for active import/generation safe state
  -> PM2 stop
  -> exact patch graph transition or verified application-only snapshot
  -> frozen previous dependencies
  -> rebuild frontend/import/BG bundles
  -> production prune
  -> PM2 start
  -> served identity, DB, jobs, logs, and active-work checks
```

Rollback must not:

- delete modules/characters/assets imported while the feature was active;
- replace `save/` or `backups/`;
- cancel generation or import automatically;
- remove unacknowledged prepared/committed results without a migration plan;
- restore an old database and discard post-deployment user work;
- revert source while leaving an incompatible parser bundle/job schema loaded.

If old code cannot understand a new active job schema, first stop admission and
let or migrate every nonterminal job to a version-neutral terminal/prepared
state. Do not strand a source silently.

## 18. Rejected shortcuts

- moving the current Promise chain to a Service Worker;
- claiming Page Visibility polling is background execution;
- showing a frozen toast while work is actually suspended;
- uploading the complete File with one unresumable request;
- keeping the entire CharX/RisuM in browser or Node memory;
- duplicating CharX/RisuM parser logic server-side;
- reusing generation BG keys/registry/cancellation for imports;
- writing a submission-time full database over the latest server state;
- relying on ETag 409 alone without testing imported-entity preservation;
- committing assets/entity before low-level authorization;
- treating user cancellation as corruption or page disappearance as cancel;
- deleting possible shared assets after failure;
- server-fetching arbitrary imported URLs;
- allowing delayed save timers to overwrite a commit;
- calling `prepared` or in-memory presence terminal success;
- hiding the pack or weakening dependencies to reduce combinations;
- treating focused/max-graph verification as exhaustive after the user's
  explicit combination-verifier waiver;
- implementing package-to-existing-character as append-only.

## 19. Review decisions before implementation

The recommended defaults are recorded so implementation can make progress,
but review should explicitly accept or revise these decisions:

1. **Pack admission:** visible optional pack first; add to `features/all` only
   after focused qualification and L3.
2. **Safety dependencies:** require import UX, CharX integrity, lazy storage,
   and build fence rather than duplicating their authority.
3. **Upload contract:** resumable before handoff, background-safe only after
   full source fsync/hash and authorization.
4. **Commit model:** append-only merge into latest canonical DB, not exact-base
   refusal and not full replacement.
5. **Partial atomicity:** content-addressed asset promotion may precede the
   atomic DB/commit marker if the one-transaction spike fails; orphan-safe but
   never missing-reference success.
6. **Scope:** new entity import first; package-to-existing-character remains a
   separate three-way-merge project.
7. **Combination gate:** exhaustive raw-selection verification remains skipped
   by standing user instruction; focused owners and maximum `all` remain.

## 20. Definition of done

The feature is not complete until:

- the UI distinguishes resumable upload from server background safety;
- source upload resumes after suspend/cold return without duplication;
- server preparation uses the existing format authorities and bounded I/O;
- low-level input never processes before foreground authorization;
- one durable import identity survives tabs and server restart;
- server commit appends exactly one entity to the latest canonical database;
- unrelated concurrent edits, chats, settings, folders, and modules survive;
- stale/delayed client and server writes cannot remove the import;
- returning clean and dirty clients reconcile before success and exact ACK;
- cancellation and rollback never delete committed user data;
- every admitted format and origin matches the foreground semantic oracle;
- focused owner graphs and maximum `all` apply/current/reapply/revert exactly;
- target tests, diagnostics, frontend/import/BG bundles, runtime audit, and
  sensitive sweep pass;
- functional/generated/receipt commits are small and pushed;
- live apply follows the process-first active-work-safe sequence;
- concrete iPhone upload/background/cold-boot/conflict/cancel L3 is recorded;
- exact-original CharX and deferred package/existing-character limits remain
  stated without inflation;
- stable release remains behind the broader aggregate gate.

## 21. Applied project principles

- `#3 feedback-no-autonomous-destructive-user-data`: no automatic committed
  import, asset, job, queue, or rollback deletion.
- `#5 bundled-patches-regression-isolation`: upload, parser, commit,
  reconciliation, pack, and delivery retain separate gates and commits.
- `#8 feedback-no-guess-from-partial-output`: complete source hashes, asset
  inventories, state transitions, and first/middle/last fault points are
  checked rather than inferred from progress.
- `#10 feedback-verify-external-lib-recommendations`: WebKit/Service Worker and
  parser behavior is measured in the actual PWA/Node targets.
- `#12 feedback-l3-test-instructions`: each L3 names screen/action/change/result.
- `#23 first-measure-yourself`: upload, memory, parser, DB, restart, and
  concurrency are automated before device-only requests.
- `#31 feedback-no-code-completeness-assertion`: explicit deferred paths and
  unresolved spike gates remain visible.
- `#33 feedback-plan-before-coding`: this authority precedes implementation.
- `#35 feedback-incremental-design-skepticism`: full background commit is
  admitted only after upload/parser/transaction spikes independently pass.
- `#37 feedback-verify-user-state-before-asserting`: suspended upload and
  exact-original behavior are not claimed without direct observation.
- `#38 feedback-fix-preserve-existing-function`: foreground fallback, import
  formats, low-level confirmation, navigation, storage, and BG generation are
  explicit preservation gates.
- `#40 feedback-fix-delivery-one-flow`: after implementation authorization,
  source, tests, commits, push, safe live apply, direct verification, and L3
  close in one flow while active work is preserved.
