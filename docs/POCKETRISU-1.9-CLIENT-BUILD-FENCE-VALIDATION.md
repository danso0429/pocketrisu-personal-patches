# PocketRisu 1.9 client build fence validation

> Status date: 2026-08-09 KST
>
> Target: official PocketRisu `1.9.0` at
> `85a65f3137b45c8de4a8d21a9887be213b1ac3fc`
>
> Pack boundary: `client-build-fence 0.1.0` and five hidden composition
> adapters
>
> State: source/composition automatically qualified; generated installer,
> live admission, and cross-build device gates are recorded separately below

## Purpose

The fence prevents a browser tab that still runs an older production bundle
from performing an authoritative write against a newly deployed server. It is
a serialization/recovery compatibility gate, not authentication. The existing
Risu authentication, session, storage, generation, BG, and Kei owners remain
authoritative.

Every production build generates a random 32-byte hexadecimal value and
combines it with PocketRisu's version. Vite embeds that value as
`__CLIENT_BUILD_STAMP__` and emits the same value in
`dist/build-stamp.json`. The server loads the artifact once at process start.

## Admission behavior

Matching clients add `x-client-build` to the central authenticated storage
transport, streaming backup/migration XHRs, direct settings mutations, and
destructive native/BG recovery operations. A classified request with a missing
or stale stamp receives:

- HTTP 426 and `Connection: close`;
- `code: CLIENT_UPGRADE_REQUIRED`;
- the expected version/stamp;
- `commitOutcome: not-committed` and
  `commitOutcomeUnknown: false`.

The middleware is placed after static asset serving and before body parsers.
The rejection therefore does not admit, spool, decode, or mutate the request
body.

The unfenced bootstrap session returns the expected build object. A client
compares that advertisement immediately: a match clears a previous reload-loop
guard, while a mismatch enters the same clean-reload or dirty-recovery path
before the client attempts an authoritative write. A missing advertisement is
ignored because it represents the server's deliberate missing-artifact
fail-open mode.

The classified set contains database and chat writes/removal, asset bulk
writes, backup import/save/restore/delete and backup settings, save-folder
migrations, database optimization/checkpoint/snapshot mutation, inlay
compression, model-job and pending-send claim/delete, BG result ACK/delete,
orchestration cancel/result delete, native stream-job delete, and BG draft
delete. The detached backup-job create/delete paths are reserved now so P3
cannot add an accidentally unfenced writer.

The following remain deliberately unfenced:

- reads and session establishment;
- generation, model-job, pending-send, and orchestration creation;
- ordinary proxy requests;
- `POST /api/db/flush`, because it carries no new payload and only advances
  data already staged by an admitted writer;
- operational `/api/logs` and `/api/request-logs` ingestion/deletion, because
  they are diagnostics rather than authoritative user database state.

This split lets cost-bearing work finish across a rolling deployment while a
stale client cannot claim, acknowledge, cancel, or delete its durable recovery
state.

## Client recovery behavior

A 426 response checks four unsafe-state owners:

1. database change tracker, active save, or dirty database state;
2. composer message, translation, or attached file references;
3. queued, debounced, in-flight, or per-chat failed draft persistence;
4. active generation state.

When all four are clean, the client stores a session-scoped client/server pair
and reloads once. If the same stale pair survives that reload, it freezes
instead of looping.

When any owner is unsafe, or its probe throws, the client does not reload. It
sets existing text inputs and contenteditable regions read-only, observes new
body/portal content, and captures keyboard, IME, pointer, touch, form, paste,
cut, drag, and drop mutation events outside the recovery banner. The banner
contains only deduplicated unsent composer and draft text plus an explicit
Reload button. It does not scrape other inputs or stored DOM content.

Draft failures are keyed. A successful write for chat B cannot clear a failed
chat A, while a later successful write for chat A clears only A's recovery
entry.

## Composition ownership

The user-visible core contains 55 units. The hidden adapters contain 15 units
in total, but the resolver admits only the adapters matching the selected
graph:

- standard storage without Kei: standard backup XHR and snapshot restore;
- Kei plus standard storage: Kei snapshot UI plus standard Kei XHR markers;
- Kei plus lazy storage: Kei snapshot UI plus lazy Kei XHR markers;
- bg-preserve: raw-result ACK, native stream delete, orchestration control,
  and draft delete.

The rolling `all` graph resolves 32 packs and 607 units. Its client fence delta
is the 55-unit core, seven-unit BG adapter, one-unit Kei UI adapter, and
two-unit Kei lazy-storage adapter. No second storage, backup, or generation
implementation is introduced.

## Observed automatic gates

On 2026-08-09 KST:

- patcher suite: 39/39 test files passed;
- exhaustive selection gate: 4,096/4,096 raw selections, 2,048 normalized
  graphs, 237 managed paths, maximum 607 units, four workers, every apply,
  repeated plan, status, revert, and pristine snapshot round trip passed;
- maximum apply: compatibility `verified`, 32 resolved packs, 607 units, five
  previously ordered collisions, and zero changed files on immediate re-plan;
- PocketRisu client suite: 131/131 files and 1,547/1,547 tests passed;
- PocketRisu server suite: 10/10 files and 170/170 tests passed outside the
  filesystem/network sandbox so localhost listener tests could run. The new
  HTTP integration case verified session advertisement, stale/missing 426,
  matching write, read admission, missing-artifact fail-open, and rejection of
  a headers-only 16 MiB `Content-Length` before the JSON parser consumed a
  body;
- `pnpm check`: 0 errors and 0 warnings;
- production build: 7,859 modules transformed and completed. Existing
  `::highlight`, browser externalization, dynamic-import, and large-chunk
  warnings remained visible;
- build identity: `dist/build-stamp.json` contained a 70-character stamp,
  exactly one generated JavaScript chunk contained it, and the server loader
  returned the identical object;
- generated installers: patcher 5,169,851 bytes, features 5,169,857 bytes,
  hardening 5,169,858 bytes, and all 5,169,852 bytes. All four passed
  `node --check`, and two consecutive builds produced these same SHA-256
  values:
  - patcher: `14930ca35f847ea5fbe18c88b332881c26c3e04c026cad6e6af87a8e969484d9`;
  - features: `11c01df89c856136b85ba26e833204f03a75e072eb21cd384bff9735c44e6980`;
  - hardening: `8d518a9623d665ab55c8a316875d5ba740b8e19cf366077138637aa906584d78`;
  - all: `e7761abc5d1d8087033596270a25a7fa85c7374ff2b269b0eba866c166711798`;
- source, generic-installer, and fixed-all plans independently agreed at
  compatibility `verified`, 32 resolved packs, 607 units, five ordered
  collisions, and 233 planned paths on the pristine target;
- exact candidate revert: 234 transaction paths reverted, no patch state
  remained, and the official tracked tree was pristine. The ignored empty
  custom intent and diagnostic reports contain no installed source state.

The exhaustive gate's exact receipt was:

```json
{
  "target": { "packageName": "pocketrisu", "packageVersion": "1.9.0" },
  "compatibility": "verified",
  "rawSelections": 4096,
  "verifiedSelections": 4096,
  "normalizedGraphs": 2048,
  "managedPaths": 237,
  "maximumResolvedUnits": 607,
  "roundTrips": "passed",
  "workers": 4
}
```

## Known limits

- A tab opened before the first live installation does not contain the 426
  handler. The server still rejects its stale write, but that tab cannot show
  the new banner or auto-reload. The first deployment therefore requires one
  explicit client reload.
- The server deliberately fails open when `build-stamp.json` is missing or
  invalid so a broken/recovery build cannot lock every storage writer out, and
  emits one startup warning. Version and stamp fields must be 1-128
  header-safe ASCII token characters. Production admission must still verify
  the artifact before restart.
- The middleware is global and runs before authentication/body parsing, so a
  classified stale request may receive compatibility HTTP 426 before it would
  receive an authentication error. The publicly served stamp grants no access;
  matching requests still pass through the existing authentication/session
  gates.
- The expected build is read once at server start. Replacing `dist/` without
  restarting the server is not a supported deployment boundary.
- Operational log writes and deletion are a deliberate narrower scope than
  source commit `3e65d76e`. They can cross a build transition because they do
  not mutate canonical user data or recovery ownership.
- Existing BG draft restoration can still remove its recovery copy after an
  ordinary same-build network persistence failure without a separate durable
  confirmation. This pack prevents the cross-build draft deletion but does
  not claim to repair that pre-existing same-build failure path.
- HTTP 426 tells a client that this request was not committed. It makes no
  claim about a separate earlier request whose response was lost.

## Live and device gates

The first live admission must:

1. confirm active generation, unclaimed model jobs, pending sends, parked BG
   results, and result payloads read-only and wait without cancellation if any
   are active;
2. build the generated patcher candidate, stop the process before source
   application, preserve `save/` and `backups/`, rebuild client and BG bundle,
   restart, and confirm the emitted artifact before accepting writes;
3. verify root/asset HTTP, served/local asset hash, process restart count,
   error-log delta, 32-pack/607-unit current status, and zero-change re-plan;
4. explicitly reload each already-open device tab once.

The next production build transition must then exercise these concrete cases:

- clean tab: after the server changes build, the next storage mutation reloads
  exactly once and the new tab continues saving;
- dirty composer/draft: type unsent Korean text and keep an attachment or
  queued draft, change the server build, attempt a write, observe the recovery
  banner without auto-reload, copy the exact unsent text, then reload;
- active generation: let work finish across the build change without
  cancellation; a stale destructive ACK/claim/delete is rejected and the new
  client recovers the retained result;
- ordinary send/stop, local and server backup/restore XHR, snapshot restore,
  and migration paths continue to behave normally from the matching build.

These are feature gates, not a request to delete user data or manufacture a
live restore. Restore checks use a disposable or already-authorized fixture.
