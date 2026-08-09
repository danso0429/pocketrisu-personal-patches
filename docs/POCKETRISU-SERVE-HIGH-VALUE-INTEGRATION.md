# PocketRisu `serve` high-value integration track

> Status date: 2026-08-09 KST
>
> Target: official PocketRisu 1.9.0 plus the existing Oracle-hosted
> `pocketrisu-personal-patches` rolling `all` graph
>
> Delivery boundary: every retained feature is a composable patcher pack. No
> direct, untracked live-source fork is admitted.

This track re-evaluates high-value ideas from the `serve` branch of
`rhplus0831/PocketRisu` against the user's actual PocketRisu 1.9.0, Oracle
server, bg-preserve, lazy-chat, and Kei composition. It does not treat the
source fork as a patch set to cherry-pick. Each idea is reduced to the smallest
owner-safe behavior, checked against the current upstream and existing packs,
and qualified independently before the next item starts.

## Ordered admission queue

| Order | Candidate | Current decision | Why this order and value |
| --- | --- | --- | --- |
| P1 | Client/server build write fence | Automatically qualified; live admission pending | A rolling Oracle deployment can leave an old PWA tab writing with stale codecs or recovery rules. Rejecting that write before body handling protects every later storage feature and therefore comes first. |
| P2 | Point-in-time server backup source | Pending | Large SQLite-backed backups must be assembled from one pinned database/WAL and asset view. Without this, faster or detached backup execution can produce a logically mixed archive. |
| P3 | Detached server backup job | Pending after P2 | Moving archive work out of the request lifetime improves reliability on mobile and lets Oracle disk/network throughput dominate, but only after the source snapshot is consistent. |
| P4 | Server chat-history preservation | Pending after P3 | History can recover destructive edits and complements full backups, but it introduces retention and ownership rules; it should build on the already-qualified write and backup boundaries. |
| R1 | Plugin-storage repository externalization | Re-evaluate after P4 | The current 1.9 graph already has plugin-storage, lazy storage, BG, and migration owners. Externalization is valuable only if it reduces a measured boundary without adding a second source of truth or weakening whole-database backup/restore. |
| R2 | `richPluginCodec` | Re-evaluate with R1 | Codec changes touch compatibility, undefined/binary values, import/export, and recovery. They are admitted only if current plugin data and upstream/plugin API contracts round-trip losslessly under the existing owner graph. |

## P1 decision boundary

P1 is implemented as the exact-1.9 user pack `client-build-fence`, plus hidden
adapters selected from the actual storage/Kei/BG graph. It intentionally keeps
ordinary reads, generation starts, proxy calls, and database flushes available
while fencing authoritative writes and destructive recovery transitions.

The implementation is not a wholesale port of source commit `3e65d76e`.
PocketRisu 1.9.0 and this patcher have additional model-job, pending-send,
bg-preserve, lazy-storage, and Kei ownership boundaries. The local pack stamps
those existing owners rather than replacing them, tracks unsaved state from
their real queues, and fails closed in the browser when dirty-state inspection
cannot be trusted.

Automatic evidence and the exact live/device gate are recorded in
`docs/POCKETRISU-1.9-CLIENT-BUILD-FENCE-VALIDATION.md`.

## Progress rule

P2 does not start until P1 has a small functional commit, generated installer
commit, safe live admission, and first-deployment reload confirmation. The
next production build created by P2 is also the first real opportunity to
exercise P1's clean-versus-dirty cross-build transition, so that observation
is retained as a P1 gate rather than silently counted as a P2 result.

R1 and R2 remain review items, not implementation commitments. Their final
classification may be high, medium, low, duplicate, or unnecessary after the
storage and backup graph has changed.

If either is admitted, every new plugin mutation, staging, finalize, abort,
custom XHR, or streaming transport must also join P1's build-admission graph
and preserve the HTTP 426 `not-committed` contract. A codec or external store
cannot create an unfenced second writer merely because its transport bypasses
`NodeStorage.authFetch`.
