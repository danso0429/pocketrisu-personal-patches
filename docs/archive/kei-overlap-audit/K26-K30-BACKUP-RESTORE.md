# K26/K30 backup/restore overlap-equivalence audit

## Metadata

- Frozen revisions: A `63832a1`, K `cc1d1b1`, U `85a65f3`.
- Final candidate: exact U plus aggregate graph at patcher `2991355`.
- Prior claims: official 1.9 owns snapshots, local/server full and settings backups, restore, boot prompt, storage queueing, cache refresh, migration, and failures; K manual scheduling and selective missing-asset restore are future features.

## Kei capability inventory

| Atom | Trigger and result | State/effects | Kei source/callers/tests |
| --- | --- | --- | --- |
| K26-B01 | Ordinary database writes create bounded automatic snapshots. | Rotated `database/dbbackup-*` copies. | K/U server snapshot code |
| K26-B02 | User can list, create, delete, and restore persistent snapshots manually. | Explicit snapshot file/KV lifecycle. | K snapshot routes/UI |
| K26-B03 | User configures automatic full-backup and snapshot schedules. | Persists schedule days; background trigger writes backups. | K backup settings/server |
| K26-B04 | Boot prompt can skip or create a full backup before proceeding. | Blocks boot choice until user decision. | K/C `BootBackupPrompt.svelte` |
| K26-B05 | Boot prompt can choose a lightweight snapshot instead of a full backup. | Creates database snapshot and continues. | K boot prompt |
| K26-B06 | Export/import a complete local backup. | Database, cold storage, inlays/assets, transactional replacement. | K restore service; C server import/export |
| K26-B07 | Export/import settings-only backup. | Excludes character/chat bulk while retaining settings assets. | K/C settings backup paths |
| K26-B08 | Save/list/download/delete/restore full backups on the server. | File backup lifecycle under configured directory. | K/C server routes/UI |
| K26-B09 | Destructive full restore invokes a pre-restore snapshot helper. | Current DB is copied before replacement, subject to helper policy. | K/C import path |
| K26-B10 | Restore requires explicit confirmation, including a second destructive confirmation. | No write before user confirms. | K/C restore UI |
| K26-B11 | Pending database writes are flushed and restore runs through the storage/import authority. | Orders flush, queue/lease, replacement, and release. | K restore service; C import/storage composition |
| K26-B12 | Successful restore invalidates caches/ETags and runs required migration/hydration refresh. | Makes restored bytes authoritative to later readers. | K service; C native + lazy/storage packs |
| K26-B13 | Progress and exact failure are surfaced without claiming success. | UI progress/error state; server rollback/failure response. | K/C restore UI/server |
| K26-B14 | Snapshot restore clears stale journals/cache and reinitializes normalized state. | Prevents old incremental writes from replaying over restored DB. | C snapshot route and lazy/storage composition |
| K26-B15 | Selective restore scans a backup and inserts only missing assets after hash validation. | Never overwrites existing assets; transactionally adds missing ones. | K missing-asset restore service/UI |
| K26-B16 | Backup destination can be configured without moving/deleting existing backups. | Persists path marker/config for future files. | K/C server settings |
| K26-B17 | Legacy backup forms are decoded/migrated into the current storage representation. | Normalizes old keys, cold storage, and inlay formats. | K legacy restore; C import parser/migrations |
| K26-B18 | Backup save/import performs size and free-disk guards before large writes. | Rejects unsafe operations without partial success. | K/C server restore paths |

## Current authority and control flow

### Kei flow

```text
UI/boot/schedule/manual trigger
  -> inspect/confirm backup source and destination
  -> flush pending database writes
  -> optional rate-limited snapshot
  -> storage queue + transactional decode/stage/replace
  -> cache/migration/init refresh
  -> progress/success or rollback/error
```

### Official/local/composed flow

```text
native boot/local/server/snapshot trigger
  -> confirmation + estimate/disk guard
  -> flushPendingDb + createBackupAndRotate
  -> import queue/lease + stream parser + inlay staging + DB transaction
  -> cache/journal invalidation + migrations/hydration refresh
  -> NDJSON progress and exact terminal status
```

Manual snapshot control, scheduling, and selective missing-asset recovery have no final route/UI owner.

### Schema and state crosswalk

Both implementations use the current database payload plus namespaced cold-storage/inlay/assets. C additionally owns chat journals, import lease/queue, cache invalidation, remote-block migration, and sidecars. `createBackupAndRotate()` is rate-limited to once per five minutes in both relevant full-import flows; therefore “always creates a fresh pre-restore backup” is too strong. The equivalent atom is that restore invokes the rate-limited helper.

## Equivalence matrix

| Atom | Kei evidence | Official 1.9 evidence | Local/final evidence | Disposition | Strength | Remaining observation |
| --- | --- | --- | --- | --- | --- | --- |
| K26-B01 | Automatic bounded snapshots | Same owner | C preserves limits/config | `EQUIVALENT` | source-proved | None |
| K26-B02 | Manual snapshot lifecycle | Absent | No local owner | `INTENTIONAL_DIFFERENCE` | source-proved | Explicit future decision already recorded. |
| K26-B03 | Scheduled backup/snapshot | Absent | No local owner | `INTENTIONAL_DIFFERENCE` | source-proved | Explicit future decision already recorded. |
| K26-B04 | Full/skip boot choice | Full/skip choice | C retains it | `EQUIVALENT` | source-proved | UI wording not material. |
| K26-B05 | Snapshot/full/skip | Full/skip only | Direct negative final-host comparison | `MISSING_OUTCOME` | source-proved | None |
| K26-B06 | Full local backup/restore | Native full format | C extends storage formats and transactional staging | `SUPERSET_PRESERVED` | source-proved | Large-file ZIP limits are outside this PocketRisu format. |
| K26-B07 | Settings-only backup | Native | Final enumeration preserves settings assets | `EQUIVALENT` | source-proved | None |
| K26-B08 | Server backup lifecycle | Native | Final adds estimates/disk checks/config path | `SUPERSET_PRESERVED` | source-proved | None |
| K26-B09 | Invoke snapshot helper | Same call | Same five-minute throttle | `EQUIVALENT` | source-proved | Prior wording must be narrowed. |
| K26-B10 | Double confirmation | Native UI | Present in final UI | `EQUIVALENT` | source-proved | Touch confirmation is ordinary UI behavior. |
| K26-B11 | Flush/queue/atomic replacement | Partial native | Native import plus storage/lazy owners | `COMPOSED_COVERAGE` | source-proved | None |
| K26-B12 | Cache/ETag/migration refresh | Native refresh | Lazy/storage/import adapters extend it | `COMPOSED_COVERAGE` | source-proved | None |
| K26-B13 | Progress/failure | Native streams/errors | Final retains exact terminal errors | `EQUIVALENT` | source-proved | None |
| K26-B14 | Snapshot restore reinit | Native snapshot copy | Final clears journal/cache and migrates | `SUPERSET_PRESERVED` | source-proved | None |
| K26-B15 | Missing-only asset restore | Absent | No final route/UI | `INTENTIONAL_DIFFERENCE` | source-proved | Explicit future feature. |
| K26-B16 | Configurable path | Native | Final marker/config preserves old files | `EQUIVALENT` | source-proved | None |
| K26-B17 | Legacy formats | Native parsers | Final handles legacy cold/inlay forms | `SUPERSET_PRESERVED` | source-proved | Unknown third-party formats remain outside scope. |
| K26-B18 | Size/disk guards | Partial K checks | Final estimate + free-space checks | `SUPERSET_PRESERVED` | source-proved | Filesystem race after the check remains a prepared surface. |

## Adversarial checks

| Scenario | Classification it could break | Method | Observed result | Limitation |
| --- | --- | --- | --- | --- |
| Restore within five minutes of prior snapshot | B09 equivalence | Complete helper/caller read | Both calls can be throttled; neither guarantees a new snapshot. | No destructive restore was run under read-only authority. |
| Import fails after inlay staging | B06/B11/B13 coverage | Complete try/catch/rename/transaction path comparison | Final code restores staged inlay directory and reports failure; DB transaction does not publish partial success. | Disk/power loss was not injected. |
| Restore while writes are pending | B11/B12 coverage | Caller and storage-owner trace | Final path flushes pending DB state and executes through import queue/lease before invalidation/migration. | No live user database was touched. |
| Boot user wants snapshot only | B05 equivalence | Full component comparison | K exposes three choices; final component exposes only proceed-full/skip. | Deterministic presence check. |
| Selective asset restore must not overwrite | B15 | Route/UI negative search and K transaction read | K uses missing-only/hash-validated inserts; final has no selective action. | Already classified as explicit future behavior. |

## Findings

| ID | Atom | Current behavior | Kei behavior | Impact/trigger | Owner | Proposed next decision |
| --- | --- | --- | --- | --- | --- | --- |
| K26-F01 | B05 | Boot backup prompt offers full backup or skip. | It also offers a lightweight snapshot. | A user with insufficient time/disk for a full backup cannot take the smaller boot-time safeguard. | Native backup UI/server owner | Keep as a deferred third-choice backup feature; current full/skip behavior remains valid. |
| K26-F02 | B09 | Prior docs imply a fresh pre-restore backup. | Both implementations merely call a five-minute-throttled helper. | A recent snapshot can suppress the restore-adjacent copy. | Native snapshot owner | Correct catalog/completion wording. User policy selected 2026-08-02 KST: require a newly created snapshot; on creation failure, stop unless the user explicitly acknowledges that restore proceeding without it. |

## Conclusion

- 18 / 18 discovered atoms are mapped.
- Dispositions: 7 `EQUIVALENT`, 5 `SUPERSET_PRESERVED`, 2 `COMPOSED_COVERAGE`, 3 `INTENTIONAL_DIFFERENCE`, 1 `MISSING_OUTCOME`.
- Destructive runtime restore was correctly not run; atomicity claims are source-proved, not observed under crash injection.
- The duplicate-owner exclusion is confirmed, with the boot snapshot choice missing and the pre-restore-backup wording narrowed.
- The B09 safety policy is resolved in favor of a fresh snapshot with an explicit per-restore failure override; no runtime implementation is authorized by this receipt.
