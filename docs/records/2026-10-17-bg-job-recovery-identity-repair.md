# Native recovery identity and ordinary Send repair

Date: 2026-10-16–17 KST. Baseline: `89dcfa1`, experimental.54 /
lazy-chat-bg-adapter 0.7.58. Candidate: experimental.55 / adapter 0.7.59.
This record covers this implementation and its approved maintenance operation.
Earlier variable-read warning and additive asset restoration remain in the
[separate .54 record](2026-10-16-bg-variable-read-and-asset-compatibility.md).
Character/chat names, message content, identifiers and credentials are omitted.

## User report and diagnostic evidence

Ordinary Send failed with the generic server-input preparation error while
expanded-composer empty Send could start generation. The user also reported a
nonworking circular Stop control, including in an existing chat. Refresh after
restoring 22 missing old hashed assets did not solve the failure. The user
confirmed the newer usage date format, so an entirely stale old screen was
not assumed to explain the issue.

The separately approved .54 diagnostic recorded
`pending-inputs:Error` at the same time as a reported failure. This proves the
local revision and input-base read/import/decode completed, then pending-input
retrieval/parsing threw. It does not by itself distinguish its HTTP/parser
failure. Later read-only probes checked eight known chat coordinates: six
projection responses were 200, one was 503/`projection-invalid`, and one
input-base response was 404. A private user-supplied character name matched one
character; its saved current chat reproduced the same input-base 200 and
projection 503. No user names were placed in this record.

That chat had 18 messages and two duplicated message-ID groups, each with two
character messages. The duplicated IDs were absent from every relevant owner
candidate. Each group matched a native model job; both rows carried the same
generation ID, the earlier row lacked `promptInfo`, the later row had it, and
their time gaps were 114/123 ms. Their text differed, so deleting a row would
discard distinct content. The metadata is consistent with recovery followed by
normal completion; the historical scheduling order was not directly traced.

## Failure chain and design assumption

```text
ordinary nonempty Send
  -> server input preparation
  -> read canonical input base successfully
  -> request chat execution projection
  -> index every historical message by message ID
  -> duplicate historical ID throws
  -> server maps conflict to 503 projection-invalid
  -> client pending-input read throws
  -> canonical-chat-unavailable; no new generation starts
```

The BG projection guard was already present in this repository's
`1e6e974` integration on 2026-09-26. It was not added by the usage timestamp
change or .54 diagnostics. The pristine native 1.10 baseline also already
contained the producer-side stale lookup described below: it read
`existingIdx` before awaiting `readJobResult`.

The expanded composer closes and calls the same `send()` function. Empty
input skips the nonempty raw-input admission branch, so empty-action success
does not demonstrate ordinary typed admission success. The circular UI has a
disabled admission/busy state as well as an actual generation Stop state;
which state received the original tap was not observed.

## Rejected repair and read-only consultation

Initially, limiting projection indexing to referenced owner IDs appeared to
avoid blocking unrelated history. Opus identified two further uniqueness
checks: anchor capture/resolution in `chatAnchorCommit.cjs`, and full commit
validation in `serverChatCommit.cjs`. Changing only projection would move the
failure to attachment or commit. That approach was abandoned before applying
any production change. All three strict identity guards remain unchanged.

The user denied copy/import/branch actions. Investigation then found a native
producer race, reproduced using the real recovery function and controlled
journal streams. A stale pre-await index allowed normal completion to insert
a generation while recovery was waiting, then recovery added the same ID
again. The private regression expected one row and observed two. Another
control showed terminal recovery writing while a live generation already
owned the chat. Neither test called a provider or modified user data.

Opus's plan review required chat-level live guarding, preserving background
poll recovery, current proxied lookup after the awaited journal, and protection
against deleted targets. The implementation also uses a per-job promise Map:
concurrent callers join publication rather than letting a poll owner return
early while another recovery still saves. Cross-tab/device prevention is not
established by a single JavaScript context's registry.

## Implemented runtime correction

The patcher applies five exact replacement hooks to installed
`src/ts/process/request/jobRecovery.ts`, through
`patches/lazy-chat-bg-adapter/job-recovery-identity-units.cjs`.

1. `recoverTerminalJob` joins an existing in-flight promise for the same job.
   The entry is released in `finally`, including errors. Joiners wait through
   save/claim so a background poll does not release ownership prematurely.
2. Recovery defers when the chat has any `kind === 'live'` entry, before
   hydration and after each awaited boundary. Generation ID equality is not
   required, so a continuation or another live generation remains protected.
   A `background` entry proceeds normally.
3. After initial hydration and journal reading, the code synchronously finds
   the current proxied chat from the database. It does not reuse a detached
   pre-await object or start a second asynchronous hydration before mutation.
4. After journal reading it recomputes the matching index using both existing
   identity rules: `generationInfo.generationId` or message `chatId`.
5. A removed partial is claimed without reinsertion; a removed chat is not
   recreated; a newly unloaded/invalid message view is deferred unclaimed.
   An idle legacy job without generation ID keeps its existing UUID behavior.
6. The existing partial-fill length rule and save-failure retry behavior stay
   in place. Live deferral occurs before recovery request logging. Concurrent
   recovery logs/saves/claims once; historical usage rows are not rewritten.

There is no native provider writer, cancellation, permission, plugin script,
pricing formula, database schema or server identity-contract change.

## Test protection and observed results

The new maintained native suite was authored before the production correction:
13 cases failed on behavior and five passed. Its 18 cases cover the following.

| Area | Protected result |
|---|---|
| Live matching generation and continuation | No recovery stream, save, claim or request log |
| Background poll | Recovery still inserts and publishes |
| Normal completion during journal read | One existing row retained |
| Live writer begins during read | Recovery defers without writing/logging |
| Concurrent same job | One read/log/save/claim; joiner waits |
| Chat object replacement | Current object receives data, detached object stays unchanged |
| Placeholder or deleted chat | No partial-view write or resurrection |
| Deleted partial | No reinsert; claim only |
| Rows shift before target | Fill follows identity, preserving unrelated row |
| Edited partial | Existing length rule uses current content |
| Failed journal with arriving reply | No extra error bubble |
| Save refusal/retry | No early claim or duplicate row |
| Legacy and failed jobs | Existing idle behavior; live deferral |
| Writer appears during hydration | No subsequent recovery work |

Final observations:

- Full frontend: 206 files passed, one skipped; 2,511 tests passed, four skipped.
- Native recovery/proxy/identity suites: 65 passed.
- Final server-config run: 47 files passed; 652 tests passed, 12 skipped.
- Compatibility: 74 passed, five skipped.
- Type check: zero errors and warnings; help check passed. Production frontend
  and BG bundle builds exited zero.
- Patcher: 333 passed. Installer rebuild was byte-identical: 8,569,929 bytes,
  SHA-256 `449ac3a2741a40b72bc1b29c501db6794fd09fbaa11f675a9669ab536a9b65fb`.
- Isolated complete graph: 43 packs, 1,777 units, 526 written paths, nine
  composed collisions; re-plan had zero changes. Revert recovered all 1,022
  baseline paths/bytes/modes/symlinks, disabled delivery and emptied intent.

The first type check found 18 new test-fixture type errors. A typed
`ModelJobRecord` factory corrected them without casts, skips or weakened
assertions. One mixed frontend command excluded server files; its 65-test
summary was not proof that the added server control ran. The premature report
was corrected and the actual server-config run above includes that control.

The added actual-SQLite owner control builds three committed answers, then
introduces two unowned duplicate groups into an 18-row synthetic chat. Before
repair, projection conflicts and publication stays pending. After ID-only
repair, three already-applied records publish with one metadata persist;
repeat recovery is a no-op. Messages, statistics, globals, applied ledger and
retained commit bytes remain unchanged. The next synthetic answer commits
successfully, exercising the downstream commit validator too.

## Explicit historical repair contract

The user separately approved correcting the two later message IDs in the
identified current chat, together with source prevention and normal recovery
of three already-applied commits. The procedure preserves the first row's ID
in each group, message text/order/count and all generation metadata. It does
not delete a response or regenerate one.

An in-memory trial checked the actual target and already-applied ledger. Its
three records were exact receipt/sequence matches. Existing fingerprint rules
recognized two current owners: an initial assumption that three records imply
three valid current owners failed, and independent message fingerprints
confirmed two. The correction retains that strict filtering rather than
force-assigning an owner whose text already changed.

A 978,612,224-byte consistent SQLite copy passed `quick_check`. A positive
copy trial changed exactly two IDs and preserved unrelated state. The final
maintenance helper adds fail-closed checks for current target fingerprint,
exact duplicate positions/count, unowned identities, applied ledger, regular
DB path, stopped expected process, complete chunk storage and absence of an
ordinary pending chat journal. It changes only the canonical root and that
root's chunk manifest in a SQLite transaction; retained operation journals,
inputs, assets and commit records are outside its writes. No chunk GC occurs.

The exact final helper also runs against synthetic chunked SQLite with
checks for positive preservation, repeat refusal, pending-journal refusal and
atomic failure. Earlier harness attempts had a Buffer fingerprinting error and
an UPDATE fault that did not intercept the store's INSERT OR REPLACE; they were
retained as incomplete attempts. The final INSERT fault verified no partial
KV/chunk/manifest change. The helper is a private, scoped maintenance artifact;
installing the public patcher does not perform this repair automatically.

The repaired actual copy was then connected to the actual journal, input and
commit owners and the actual projection route body in an isolated loopback
harness. All three retained records returned `committed`/`published`; HTTP
projection returned 200, empty pending inputs and two fingerprint-qualified
owners. Anchor capture accepted the corrected history. Conversation, protected
root state and commit bytes remained unchanged; repeat recovery was idempotent.
The harness installed no provider routes and did not boot the full production
backend or qualify authentication. This directly checks the actual data shape
without invoking a real model or printing its content/identities.

The actual candidate build stamp differs from the current deployment. Existing
`clientBuildFence` middleware precedes chat handlers. Direct middleware checks
for full chat save, chat patch, root patch/write and model-job claim rejected
all five old-build and all five missing-build requests with 426; all five current
build requests were accepted. Thus pre-repair old pages cannot write their cached
IDs into the repaired deployment. Refresh remains necessary for new code.

## Delivery status and remaining qualification

Source commit `fcaf4c5` was pushed to main and its remote `patch-integrity` CI
completed successfully (run `38924619885`). Active owner work, running models,
pending sends, active HTTP requests and target-chat unclaimed terminal jobs
were all zero before delivery. The single expected process was PM2 id 1 at the
exact application cwd.

Delivery verified 459 application/state files before stopping. After stop it
created a fresh 978,612,224-byte SQLite backup with `quick_check=ok` and a
recorded hash/WAL-safe restore command, then repeated the exact repair target
verification before installer or data writes. The approved repair changed two
message IDs in the 18-row chat. Readback confirmed text/order/count, generation
metadata and every other field were preserved; no ordinary chat journal was
pending. The repaired database and final database both passed `quick_check`.

The installer moved managed source from 523 to 524 files and post-apply plan
reported zero changes. It retained 61 previously served immutable hashed
assets; 17 current entry/preload responses matched disk. Root HTTP returned
200. Both usage endpoints returned 200/no-store and all preexisting usage rows
through the delivery boundary retained their exact fingerprint. Host activation
and configured destination-header state were unchanged.

After restart the target input-base read succeeded, projection returned 200 and
pending inputs were empty. The entire expected repaired chat matched; protected
statistics, globals and applied ledger matched their pre-repair fingerprints.
The process was online at id 1 with zero unstable restarts and no new stderr
lines. No provider request, cancellation, automatic restore or historical
message deletion occurred.
The recorded restore uses SQLite's backup API with the process stopped to
handle destination WAL safely. No automatic restore/restart follows an
unexpected outcome. Old immutable hashed assets are retained and hash-checked.

Those automatic checks are now observed. The first refreshed device load must
still re-read the target chat fingerprint; old and missing build stamps are
server-rejected with 426, but device refresh is the observation that the new
bundle became active. A successful projection read does not claim a paid
production generation ran.

Physical ordinary Send, actual Stop and the earlier no-edit new-chat warnings
remain device gates. Cross-tab/device overlap and suspended journal sockets
remain explicit limits; the code adds no new recovery scheduler/deadline.
Deferred jobs use existing boot/visibility/online discovery. Other malformed
historical chats are not automatically rewritten. This is a G1 recovery
follow-up within existing ownership contracts, with no new G2/plugin sub-plan.
Stable remains v0.2.3; no stable tag/release is part of this operation.
