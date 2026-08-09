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

## Personal appearance composition qualification

The first live-admission plan exposed a branch-composition hazard rather than
a client-fence defect. Production already ran `personal-settings 0.4.2` from
`codex/pocketrisu-appearance`, while the initial fence branch had diverged
from `personal-settings 0.2.0`. The pre-composition installer would therefore
have removed six appearance-owned files, restored ten appearance-hook targets
to the official baseline, and rewritten five composite targets without their
appearance units. All 21 live files exactly matched their recorded output
hashes, so this was not drift and the pre-composition installer was not
admitted.

The appearance branch, including its automatic gates, live preservation
receipts, and scoped iPhone L3, was merged into the fence branch as
`v0.2.0-experimental.14`. On 2026-08-09 KST, the combined candidate produced
the following observed results:

- patcher suite: 39/39 test files passed;
- exhaustive exact-1.9 gate: 4,096/4,096 raw selections, 2,048 normalized
  graphs, 253 catalog-managed paths, maximum 652 units, four workers, and
  exact apply/re-plan/status/revert byte-and-mode round trips passed;
- maximum graph: 32 resolved packs, 652 units, six explicitly ordered
  collisions, 250 transition files, and no skipped file on the pristine
  target;
- applied maximum graph: 132/132 client files with 1,564/1,564 tests and
  10/10 server files with 170/170 tests passed;
- `pnpm check`: 0 errors and 0 warnings;
- production build: 7,864 modules transformed and completed with the existing
  browser-externalization, dynamic-import, and large-chunk warnings;
- build identity: a safe 70-character stamp, identical artifact and server
  loader objects, and exactly one generated JavaScript chunk containing the
  stamp;
- appearance build retention: all seven chat-font tokens plus the Noto Sans
  KR and Noto Serif KR stylesheet import remained in the generated CSS;
- BG bundle: 8,422,561 bytes, SHA-256
  `9b7a7b0294951074e04220ef6f25be41bb0bf932717caee2c9de364c9d51f4ed`,
  with `sendChat=function` load check passed;
- immediate re-plan: zero changed files, all 32 packs current across 248
  active source paths, and no drift;
- source, generic-installer, and fixed-all plans agreed at 32 packs, 652
  units, six ordered collisions, and 250 transition files; and
- exact revert changed the same 250 transaction files, removed patch state,
  and restored the official tracked source. The retained custom intent and
  separately generated BG bundle outputs are outside the managed source
  transaction.

Two consecutive installer generations were byte-identical and passed
`node --check`:

- patcher: 5,249,789 bytes, SHA-256
  `4c8af7e63343e0c684cd118e972daee0725ba2fbd7edcb3117c2cc12da606b5d`;
- features: 5,249,795 bytes, SHA-256
  `caf59e7975ba4aafb4c3048961bfe6ee6fc80091a749f1d9307760b5e984cdb9`;
- hardening: 5,249,796 bytes, SHA-256
  `b6b6ec79f21b6146ef1780883ea03b375978505fd786e9b5860ca8ee85d99927`;
  and
- all: 5,249,790 bytes, SHA-256
  `b9db8debdaa0b2973c456150dc99b9a73cb8dff3c1c39a61cbbc80c9083673ab`.

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
   error-log delta, 32-pack/652-unit current status, and zero-change re-plan;
4. explicitly reload each already-open device tab once.

### First live automatic admission

At 2026-08-09 12:12 KST, the final `v0.2.0-experimental.14` installer and
merge commit `8fc81b7` were already pushed. The final live plan resolved 32
packs and 652 units with six ordered collisions. It changed exactly the 23
unique source paths owned by the selected fence core, BG, Kei, and lazy
adapters plus patch state. The 21 appearance-only paths from the rejected plan
were absent.

Immediately before stop, two consecutive read-only gates observed active
model jobs, deliverable unclaimed main jobs, pending sends, and both BG result
payload prefixes all at zero. Sixty-eight durable operation states were all
`delivered`, both SQLite `quick_check` results were `ok`, and no nested
`save/save` existed. PM2 was then stopped before applying source.

The stopped live tree produced these observations:

- frozen offline install restored 109/109 development packages with zero
  downloads;
- client suite: 132/132 files and 1,564/1,564 tests passed;
- server suite: 10/10 files and 170/170 tests passed;
- Svelte diagnostics: 0 errors and 0 warnings;
- production build: 7,864 modules transformed and exit 0;
- build identity: the artifact and server loader agreed on one safe
  70-character stamp and exactly one JavaScript chunk contained it;
- appearance retention: all seven font tokens and both Noto imports remained
  in generated CSS;
- BG bundle: 8,422,345 bytes, SHA-256
  `5a0e26fc15dce741303479b4e54053fc35359d5c6ffe18a7ac3c7f017ce87149`,
  with `sendChat=function` load check passed;
- patch status: `current`, 32 packs, 248 active managed source paths, no
  drift, and a zero-change re-plan; and
- production prune removed the 109 development packages while `express`,
  `better-sqlite3`, `msgpackr`, and `compression` remained resolvable.

After restart, PocketRisu 1.9.0 was online at PID 4157367 with restart count
6, zero unstable restarts, and zero active requests. Root, main asset, and
`build-stamp.json` returned HTTP 200. Served and local
`/assets/index-C-Ldqbkn.js` were both 2,015,104 bytes with SHA-256
`c840bf1a39b18966cfe7f245cc7138b36857240be19c763121e614317122eb9c`.
The authenticated BG status route retained its unauthenticated 401 response.
The PM2 error log retained its exact inode, zero-byte size, and modification
time.

A body-free, unauthenticated live write probe returned HTTP 426,
`CLIENT_UPGRADE_REQUIRED`, `not-committed`, and `Connection: close` for both
missing and stale build headers. The exact current stamp passed the fence and
reached the existing request validation, which returned HTTP 400. The main
database, model-job database, and backup-directory inode, size, and
modification time remained exact; both `quick_check` results remained `ok`;
active, unclaimed, pending, and result work remained zero. Retention reduced
the already-delivered operation tombstones from 68 to 58 during restart; all
58 remaining states were `delivered`.

The automatic live gate is complete. On 2026-08-09 the user explicitly
reloaded the already-open pre-fence client and reported the ordinary paths
normal. That completes the one-time first-deployment reload gate and admits
P2. It does not substitute for the clean/dirty cross-build scenarios below,
which require a later production build transition.

The P2 production build deployed at 2026-08-09 14:47 KST is now that next
transition. Automatic missing/stale/exact writer probes passed again, but they
do not prove browser dirty-state behavior. Any still-open pre-P2 tab can
exercise the cases below. If no dirty tab was prepared before deployment, that
case cannot be manufactured retroactively after the tab loads `.15` and remains
for the next prepared build transition.

The current or next prepared transition must exercise these concrete cases:

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
