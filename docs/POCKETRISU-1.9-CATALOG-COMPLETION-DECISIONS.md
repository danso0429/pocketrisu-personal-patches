# PocketRisu 1.9 catalog completion decisions

Date: 2026-08-01 KST

## Result and scope

This record closes the PocketRisu 1.9 re-evaluation of Kei rows that had not
been admitted before the target pivot. It decides whether each row is part of
the current aggregate candidate; it does not claim that every possible Kei
feature has been implemented.

The current `pocketrisu-kei` aggregate remains the seven already-admitted
children K19, K13, K14, K16, K15, K11, and K12. No new runtime unit, storage
schema, provider, privacy policy, or destructive action is added by this
decision.

Evidence was read from frozen PocketRisu Kei revision
`cc1d1b195babd887577ebf943d5e82f01f58135c`, exact official PocketRisu 1.9.0
revision `85a65f3137b45c8de4a8d21a9887be213b1ac3fc`, and the qualified local pack
owners.

## Final 1.9 decisions

| Row | 1.9 decision | Reason and owner |
| --- | --- | --- |
| K03 preset folders | Defer as a future child; not in the current aggregate | Kei has a distinct `promptPresetFolders`/`folderId` schema and sortable `PresetPickerLayout`; exact 1.9 has no corresponding symbols. This is a new feature, not a target adaptation of an already-admitted child. A later admission must compose with `preset-integrity` and the organizer-owned picker schemas. |
| K04 prompt roles/preset behavior | Drop the direct port | Exact 1.9 already has `PromptRole`, import/database normalization, and role selection for prompt blocks. Its block role uses native `role2`; copying Kei's parallel `role` field would create a second schema. Active-index behavior remains in `preset-integrity`. |
| K20 character list/sidebar expansion | Defer missing search/recent/view controls to `character-organizer` | Folder and order authority is already qualified in `character-organizer`. No second Kei order schema enters the aggregate. A later independently specified UI delta may render the existing schema. |
| K22 persona picker/list expansion | Defer missing presentation controls to `persona-organizer` | `persona-organizer` remains the folder/order/normalization/import-export owner. No concrete missing outcome requires a new runtime unit for the current aggregate. |
| K23 regex/lorebook rewrite | Exclude the direct port | `bg-preserve` already depends on the multi-type `types[]` schema along generation paths. Kei's broad/single-type rewrite is not schema-equivalent and no independently specified missing outcome was found. |
| K26 backup tools | Drop the combined direct port; defer only distinct additions | Exact 1.9 creates bounded database snapshots on successful persistence, exposes count/byte limits and atomic server restore, provides full server and settings-only backup paths, and offers a boot-time full-backup prompt. Kei's manual schedule and selective missing-asset restore remain distinct, but must be split into future owner-local additions rather than duplicate the qualified storage/import system. |
| K27 request logs | Keep as a future explicit policy pack only | Exact 1.9 already bounds body storage to 256 MiB, caps individual fields, masks credential patterns, retains at least 50 recent rows, and cursor-paginates list reads. It nevertheless defaults to content capture. A future policy adapter may choose metadata-only defaults or expiry; it is not an umbrella child. |
| K28 usage insights | Keep as a future explicit policy pack only | Exact 1.9 already records content-free, failure-isolated LLM usage, but the rows are unbounded/unpaginated and writes are coupled to the body-log toggle. Retention, pagination, and decoupling require an explicit policy decision; they do not block the current umbrella. |
| K29 Revenant | Exclude the direct port | The qualified `bg-preserve` owner already supplies operation-keyed result/claim/ACK, whole-pipeline cancellation, reconnect, cold recovery, and no-resurrection. No measured missing result justifies a second server-generation authority. |

K05-K09 and K24-K25 remain separate opt-in provider/network/storage-policy
designs under the frozen catalog. K21 destructive retention and K30 broad
restore refactoring also remain outside the umbrella. None is a dependency of
the seven admitted children.

## Exact source anchors

### Presets

- Kei `src/lib/Setting/botpreset.svelte` reads and writes
  `promptPresetFolders` and per-preset `folderId`, and mounts
  `PresetPickerLayout` for search, folder assignment, and sorting.
- Exact 1.9 contains no `promptPresetFolders` or prompt-preset `folderId`.
- Both trees define prompt roles and normalize imported aliases. Exact 1.9's
  block items use `role2` in `database.svelte.ts`, `prompt.ts`, and
  `PromptDataItem.svelte`; that schema stays native.

### Backup and restore

- Exact 1.9 `server.cjs` creates `database/dbbackup-*` snapshots after
  successful persistence with a five-minute default cooldown, configurable
  count/byte bounds, and newest-snapshot retention.
- Its snapshot restore drains pending persistence, copies the snapshot to the
  live blob inside the storage-operation queue, invalidates caches, reruns the
  remote-block migration, rebuilds chat state, and refreshes the ETag.
- Its UI requires two confirmations for snapshot, local-file, and server-file
  restore; it also exposes server backups, settings-only export, limits, disk
  guards, and an optional boot backup prompt.
- Kei additionally has manual snapshot/schedule endpoints and selective
  missing-asset restore. Those are not treated as proof that its complete
  backup/restore owner should replace official 1.9.

### Logs and usage

- Exact 1.9 `request-logs.cjs` stores request bodies and usage rows in separate
  tables. Request rows rotate by byte budget; usage rows explicitly do not.
- `requestLogEnabled` defaults on and gates both content logging and usage.
  List reads omit bodies unless requested and support an ID cursor/limit.
- These observations correct the old shorthand that all 1.9 request logging
  is unbounded. They do not resolve the default-content or usage-retention
  policy choices.

## Aggregate and future boundary

The current aggregate may proceed because every required child and existing
owner now has an exact-1.9 qualification receipt, while the rows above are
either native-owned, excluded, deferred new features, or separate opt-in
policy packs. Deferral does not reclassify a feature as implemented.

A future row can be admitted only through its own purpose, target, owner,
tests, exact revert, L2.5, and interaction receipt. In particular, K03 or a
selective K26 asset tool must not be slipped into `pocketrisu-kei` as an
incidental aggregate fix.
