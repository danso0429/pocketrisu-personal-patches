# Save sync: content-etag conflict detection (reference)

Status: reference only, not planned. Recorded on 2026-10-17 while fixing a
database save failure on a new save. The chosen direction is a client-side
restructuring of `RisuSavePatcher` so that its baseline and hash cache cannot
diverge ("C"); this document keeps the protocol-level alternative ("D-1") for
later evaluation.

## 1. Current protocol

PocketRisu saves the main database (`database/database.bin`) in two ways.

| Path | Conflict check |
|---|---|
| `POST /api/patch` (incremental) | The client sends `expectedHash`, computed by `RisuSavePatcher.hash()` over its last-synced baseline. The server computes `calculateHash()` over its in-memory copy and answers 409 on a mismatch. |
| `POST /api/write` (full write) | The client sends the server-issued revision in `If-Match`; the server compares it with `dbEtag`, which is derived from the encoded stripped database (`computeBufferEtag`). |

The hash algorithm and the JSON normalization therefore exist twice: in the
client (`src/ts/storage/risuSave.ts`) and in the server (`server/node/utils.cjs`).
Every client-side baseline mutation must keep a per-key hash cache
(`hashBlocks`) consistent with the baseline object.

## 2. Failure that motivated this note

On a brand-new save, `RisuSavePatcher` produced baseline keys whose value was
`undefined` (`modules` in the rollback snapshot of `set()`, and `botPresets` /
`modules` in the baseline assembly at the end of `set()`). Those keys had no
hash block, `hash()` summed `undefined`, and the result was `NaN`, sent as
`expectedHash = "0"`. Every patch was rejected with 409, and the patched
conflict path rebased onto the server copy until it failed.

The baseline assembly is upstream code and is unchanged in PocketRisu 1.14.0.
Upstream hides it on a new save because its first patch meets an empty server
and falls through to a full write, which re-initializes the baseline.

## 3. D-1: server-issued content etag for patches

Replace `expectedHash` on `/api/patch` with the revision the client last
received from the server:

```text
POST /api/patch  { key, patch, baseRevision }
server: baseRevision === current content etag
          ? apply, recompute the content etag, return it
          : 409 { currentEtag }
client: stores the returned etag as its baseline revision; it never computes
        a server-equivalent hash.
```

The etag stays content-derived (the same `computeBufferEtag` over the encoded
stripped database already used for full writes).

### What it removes

- Any divergence between the client and server representations of the
  database (normalization rules, hash algorithm, missing or stale client hash
  cache) can no longer produce a false conflict, because only the server
  evaluates the database.
- The client hash cache becomes unnecessary for conflict detection.

### Why content-derived (D-1) rather than a revision counter (D-2)

A counter must be incremented by every server-side writer: client patches and
full writes, server-side chat commits from background generation, plugin
storage writes, restore and import paths. A missed increment lets a stale
client patch apply over another writer's change (a lost update). A content
etag changes whenever the content changes, so a missed code path still fails
closed with a 409, which matches the safety property of the current hash check.

### Open costs and unknowns (to measure before adopting)

- **Per-patch encoding cost.** Recomputing the content etag after each patch
  requires encoding the stripped database. This has not been measured on large
  databases; it may require incremental etag maintenance, which reintroduces a
  cache that must stay consistent.
- **Protocol divergence from upstream.** Upstream PocketRisu (through 1.14.0)
  uses the hash protocol. Every upstream upgrade would have to re-apply the
  protocol change on the server and client.
- **Affected areas.** `server.cjs` patch and write routes and every server-side
  database writer; client `nodeStorage.ts`, `globalApi.svelte.ts` and
  `risuSave.ts`; the BG adapter save barrier; the client build fence, which must
  reject or translate patches from already-open old pages.
- **Migration.** Clients loaded before the change still send `expectedHash`.
  The server must keep accepting them until the build fence forces a reload.

## 4. When to revisit

- A false 409 is observed whose cause is a client/server representation
  difference that the client baseline restructuring cannot prevent (for
  example a normalization mismatch between `risuSave.ts` and `utils.cjs`).
- Upstream PocketRisu changes its save protocol.
- Per-patch hash cost on the client becomes a measured performance problem.

Before adopting D-1, measure the per-patch content-etag cost on a database of
realistic size and enumerate every server-side database writer.
