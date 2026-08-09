# PocketRisu 1.9 point-in-time server backup validation

> Status date: 2026-08-09 KST
>
> Target: official PocketRisu `1.9.0` at
> `85a65f3137b45c8de4a8d21a9887be213b1ac3fc`
>
> Pack boundary: hidden `server-backup-snapshot-core 0.1.0` plus exactly one
> hidden standard/lazy storage adapter
>
> State: source, composition, exact-target automatic qualification,
> generated-installer qualification, and automatic live admission passed;
> device observations are recorded separately below

## Purpose and ownership

P2 makes each native download export and server-file backup read one fixed
database/WAL and asset epoch. The prior handlers planned names and sizes from
live storage, then read values later while ordinary writes could continue. A
large backup could therefore mix database, assets, cold storage, inlay
metadata, and filesystem inlays from different moments or emit framing whose
planned size no longer matched its payload.

This is not a wholesale port of the `serve` branch and does not introduce a
second storage authority. The implementation retains the existing standard or
`lazy-chat-sync` owner, native storage queue, SQLite database, backup format,
routes, settings-only trimming, server backup directory, and UI. It adds a
read-only source boundary shared by both storage variants.

P2 has no user-facing selection bit. Exact-1.9 `client-build-fence` is its
admission trigger, not its semantic owner:

- without P1, no P2 pack resolves;
- P1 without lazy storage resolves the core and standard adapter;
- P1 with lazy storage resolves the core and lazy adapter;
- the two adapters cannot resolve together.

This keeps twelve visible packs, 4,096 raw selections, and 2,048 normalized
graphs. A complete mask assertion observed P2 absent in 2,048 masks, standard
in 512, lazy in 1,536, and both adapters together in zero.

## Point-in-time source contract

Each request establishes its source in one storage-queue turn:

1. reject an import already inside its destructive phase;
2. flush pending database ownership through the selected standard/lazy owner;
3. open a separate read-only `better-sqlite3` connection, begin a transaction,
   and perform the first read that fixes its WAL epoch;
4. enumerate filesystem inlays and sidecars while in-process filesystem
   mutations remain queue-serialized;
5. copy those files into a private pin directory in 256 KiB pages, comparing
   inode/device/size/time metadata and SHA-256 before accepting each copy;
6. re-stat the complete filesystem plan after all copies, then release the
   storage queue.

Archive framing and transfer happen after the queue is released. Ordinary
writes can therefore continue while the request reads DB, chunk manifests,
chunks, `assets/`, `coldstorage/`, and `inlay_meta/` from the fixed SQLite
reader and filesystem inlays/sidecars from private pins. Cold-storage export
uses `migrateLegacy: false`, so a read-only snapshot never attempts live
migration.

The source is used by:

- `GET /api/backup/export` for NodeOnly and upstream-target downloads;
- `GET /api/backup/export?mode=settings`;
- `GET /api/backup/export/settings-estimate`, with its own coherent source;
- `POST /api/backup/server/save`.

The estimate and later user-confirmed export are intentionally separate
snapshots. UI think time does not retain a WAL reader, and each result is
internally coherent rather than guaranteed identical to the other request.

## Failure and resource boundaries

- A missing pinned `database/database.bin` fails all four routes with
  `BACKUP_DATABASE_MISSING`; a 200 asset-only archive is never emitted.
- Chunk-backed values are reconstructed through the snapshot's own manifest
  and chunk rows. A missing pinned chunk fails rather than falling back to live
  storage.
- Planned entry size and actual read length must match. Download
  `Content-Length` is the exact sum of archive framing; server save verifies
  the write-stream byte count and final file size.
- Server save uses an exclusive `.tmp` file and atomic rename. Error or client
  disconnect destroys and awaits the stream close before cleanup, including
  Windows' no-unlink-while-open behavior.
- A filesystem entry exceeding the archive's 32-bit name/data frame limit is
  rejected before it is copied. DB/KV entries are rejected before response
  headers or destination-file creation. Aggregate arithmetic must remain a
  JavaScript safe integer.
- At most two sources may be active. Filesystem pinning reserves its estimated
  payload plus five percent and 16 MiB against current free space. Every
  success, exception, and disconnect closes the SQLite reader, removes pins,
  releases reservation/capacity, and removes request listeners. Startup sweeps
  orphan pin directories left by process death.
- Inlay compression now mutates its payload, sidecar, and thumbnail key inside
  the storage queue so source capture cannot interleave with an internal
  filesystem mutation.
- `POST /api/db/optimize` and `POST /api/db/wal-checkpoint` check active sources
  inside their own storage-queue turns. They return retryable HTTP 409 with
  `BACKUP_SOURCE_MAINTENANCE_BUSY` instead of reporting a successful VACUUM or
  TRUNCATE that an active WAL reader prevented. Both retain prior behavior
  after the source closes.

## Exact revert and graph evidence

The core owns two server helpers, their tests, and one compat test. It adds the
read-only snapshot export to `db.cjs`. Each adapter owns the same semantic
units in `server.cjs`; one factory generates both manifests so standard and
lazy behavior cannot drift independently.

Pack ETags after qualification:

- core: `7ab95572ad18cd737d336bf05606d00b9d95073c3f4f02a9628bebe269551406`;
- standard adapter:
  `9d9c0321634fa9480d3a2246558b26526abbc975171c5eb32a5af90337878087`;
- lazy adapter:
  `1fe99d5d9d9d546b27c4d0db6286a0b6b6b849119fc13a4849943d8c881cfb08`.

Every unit payload was individually mutated in the focused ETag test and
changed its pack ETag. All P2 units match exact PocketRisu 1.9.0 and match zero
1.8.1 targets.

A disposable exact-1.9 target completed standard → lazy → standard → empty.
The repeated standard plan changed zero files. Final `server.cjs` and `db.cjs`
were byte-identical to official 1.9, both owned helpers were absent, and the
non-save tree differed on zero paths or modes after revert.

The maximum `all` plan resolves 34 packs, 669 units, six existing ordered
collisions, and 256 transition paths. P2 introduces no collision. Its immediate
post-apply plan changes zero files and status is current.

## Observed automatic gates

All observations below are from the final source candidate on 2026-08-09 KST:

- patcher suite: 40/40 test files passed;
- focused snapshot/pin server tests: 2/2 files and 6/6 tests passed;
- P2 endpoint compat on the maximum `all` graph: 1/1 file and 6/6 tests passed;
- standard P2 plus native backup regression: 3/3 files and 32/32 tests passed;
- lazy P2 plus native backup regression: 3/3 files and 32/32 tests passed;
- exhaustive selection gate: 4,096/4,096 raw selections, 2,048 normalized
  graphs, 259 catalog-managed paths, maximum 669 units, four workers, and
  byte/mode round-trip `passed` in 933.08 seconds wall time;
- maximum graph client suite: 132/132 files and 1,564/1,564 tests passed;
- maximum graph server suite: 12/12 files and 176/176 tests passed;
- `pnpm check`: 0 errors and 0 warnings;
- production build: 7,864 modules transformed and completed. Existing browser
  externalization, plugin timing, ineffective dynamic-import, and large-chunk
  warnings remained visible;
- build identity: artifact and server loader returned the same 70-character
  stamp, and exactly one generated JavaScript chunk contained it;
- BG bundle: 8,449,187 bytes, SHA-256
  `5501b5c7b293accb1f14cc05d6c050d219b687c50a0af5ce8941a8c86ecbb292`,
  with `sendChat=function` load check passed;
- maximum graph immediate re-plan: zero changed files.

The versioned `0.2.0-experimental.15` installers were generated twice from the
same source. Both runs produced the same sizes and SHA-256 values, and all four
artifacts passed `node --check`:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `pocketrisu-patcher.cjs` | 5,415,840 | `48469e33e3660e7d41e48800eed151fc503780783470aef5868de8e1925cf178` |
| `pocketrisu-features.cjs` | 5,415,846 | `8678a5222aa9dc5f851a56999c05b15e4285a4b4ff451e23704978d1f29a7e2d` |
| `pocketrisu-hardening.cjs` | 5,415,847 | `0ebff1a17e923ea5d98e28ce32ce08fc2f690eba79b0c1e1effc1b97e82b55b3` |
| `pocketrisu-all.cjs` | 5,415,841 | `9b13eebafe84082c863c127754b1ce51d4abff106b7c26d996128c07c0fa64f3` |

The generated universal installer was then applied independently to the
standard, lazy, and maximum `all` candidates. Their immediate re-plans changed
zero files. The maximum graph reported all 254 transaction-managed source
paths current; the standard and lazy graphs repeated the 32/32 native backup
regression observations above from the generated bytes. Generated `all`
revert then restored every tracked source byte and mode, with both P2-owned
server helpers absent.

The race tests hold a source after capture, then concurrently replace the DB
including chunk storage, asset, cold-storage value, inlay metadata, filesystem
inlay, and sidecar. Download, server save, and settings-only export each contain
only the old epoch; a later fresh export contains the new epoch. They also
verify exact framing/length, queue release before transfer, missing-DB failure,
disconnect cleanup and server survival, maintenance reject-then-success, and
absence of partial server backup files.

## Known limits and excluded work

- A download source remains open for network duration. Ordinary writes and
  imports continue by design and may grow the WAL until the slowest active
  source closes. The two-source cap bounds readers, not duration or WAL bytes.
  Request-independent spooling is P3's structural answer; P2 does not add it.
- The periodic best-effort checkpoint may remain busy during a long export.
  Manual optimize/checkpoint no longer claims success in that state, and the
  next periodic or manual checkpoint can reclaim the WAL after close.
- Internal filesystem writers are queue-serialized. Out-of-band changes during
  planning/copy are detected by metadata, hash, and final re-stat, but P2 does
  not make arbitrary external OS writers participate in one logical database
  transaction.
- The archive format still limits each entry to unsigned 32-bit length fields.
  P2 fails closed; it does not introduce a new backup format.
- No live user backup or destructive restore is created merely for automatic
  qualification. Native Windows behavior has source-level close-before-unlink
  protection but the production runtime qualification target is Oracle Linux.
- P2 does not externalize plugin storage, change `richPluginCodec`, create
  detached jobs, add retries across a process restart, change retention, or
  begin P3/P4/R1/R2 work.

## Live and device gate

Safe live admission must stop the process before source apply, preserve the
existing `save/` and `backups/` directories, run the full stopped-tree gates,
rebuild the client and BG bundle, restart only with active/durable work at zero,
and verify source status plus served/local asset identity. It must not create a
large server backup automatically.

### Observed automatic live admission

At 2026-08-09 14:47 KST, functional commit `607b393` and generated-candidate
commit `88d8822` were pushed before admission. Two consecutive read-only gates
observed zero running model jobs, zero unclaimed terminal main jobs, zero
pending sends, zero main/operation/aux result payloads, and 39 operation states
all `delivered`. PM2 reported zero active requests and unstable restarts, both
SQLite `quick_check` results were `ok`, and no nested `save/save` existed.

The generated live plan was exact PocketRisu 1.9.0 compatible and resolved 34
packs, 669 units, and six existing ordered collisions. It changed only the two
P2 server helpers, their two tests, the endpoint compatibility test,
`server.cjs`, `db.cjs`, and patch state. PM2 was stopped before those paths
were applied; `save/` and `backups/` were not moved or replaced.

The stopped live tree produced these observations:

- frozen offline install restored 109/109 development packages with zero
  downloads;
- client suite: 132/132 files and 1,564/1,564 tests passed;
- server suite: 12/12 files and 176/176 tests passed;
- live P2 endpoint suite: 1/1 file and 6/6 tests passed;
- `pnpm check`: 0 errors and 0 warnings;
- production build: 7,864 modules transformed and exit 0;
- build identity: artifact and server loader agreed on one 70-character stamp,
  held by exactly one generated JavaScript chunk;
- BG bundle: 8,422,345 bytes, SHA-256
  `5a0e26fc15dce741303479b4e54053fc35359d5c6ffe18a7ac3c7f017ce87149`,
  with `sendChat=function` load check passed;
- patch status: `current`, all 254 transaction-managed source paths current,
  and an immediate 34-pack re-plan with zero changed files; and
- production prune removed the 109 development packages while `express`,
  `better-sqlite3`, `msgpackr`, `compression`, and both P2 runtime modules
  remained resolvable.

After restart, PocketRisu 1.9.0 was online at PID 36564 with restart count 6,
zero unstable restarts, and zero active requests. Root, main asset, and
`build-stamp.json` returned HTTP 200. Served and local
`/assets/index-IvkdBju6.js` were both 2,015,104 bytes with SHA-256
`d3ae72290906519f92447c09cac7825592d57ffa0849b65f7a88fe66ef7c6e82`.
Missing and stale writer stamps returned HTTP 426, `not-committed`, and
`Connection: close`; the exact stamp reached existing request validation.

The main DB, model-job DB, backup directory, and existing backup aggregate
retained their exact pre-apply inode, size, and modification metadata. Both
`quick_check` results remained `ok`; active, unclaimed, pending, and result
work remained zero; all 39 operation states remained `delivered`; no nested
save or private pin remained; and the existing PM2 error log gained zero
bytes. An authenticated settings-estimate request returned HTTP 200 with the
expected numeric breakdown and released its source with zero pin entries. No
server backup file or restore was created for automatic admission.

### Device gate

After admission, the concrete user-visible checks are:

1. create one server backup from Settings → System → Backup and confirm it
   completes, appears in the server backup list, and can be downloaded;
2. while that operation is running, navigate away/background and return; the
   existing progress/result UI must remain usable without a mixed or truncated
   file;
3. exercise P1's first real cross-build boundary separately: a clean old tab
   reloads once, while a dirty composer/draft tab preserves its text in the
   recovery banner instead of writing or reloading.

No restore is required against the live user database for P2 L3.

## Publication boundary

Source, automatic qualification, deterministic installer generation, safe
live apply/restart, and automatic readback are complete. The device
observations above remain open. Stable tag/release remains behind the aggregate
feature review and combined iPhone L3.
