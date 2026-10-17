# Save sync: patcher baseline restructuring (C)

Status: approved for PocketRisu 1.10.0 on 2026-10-17. Pack: `lazy-chat-sync`,
file `files-1.10/src/ts/storage/risuSave.ts` (`RisuSavePatcher`). The
protocol-level alternative is kept separately in
`POCKETRISU-SAVE-SYNC-CONTENT-ETAG-REFERENCE.md`.

## 1. Problem

`POST /api/patch` is accepted only when the client's `RisuSavePatcher.hash()`
equals the server's `calculateHash()` of its stripped database. The patcher
keeps two independent pieces of state that must stay paired: the baseline
object (`lastSyncedDb`) and a per-key hash cache (`hashBlocks`). The 1.10 pack
file writes them directly at 22 places. Any write that changes one without the
other makes the client hash differ from the server hash, and the save is
rejected as a conflict.

## 2. Verified findings (2026-10-17)

Measured with a fuzz harness (20,000 random `init`/`set`/rollback sequences,
84,548 checked states) against the server's `utils.cjs`, plus browser runs of a
fresh save.

| Finding | Evidence |
|---|---|
| A new save never persists: every patch sends `expectedHash = "0"` | Browser run: 409 on every patch; pristine 1.10.0 recovers through a full write |
| `"0"` comes from a baseline key without a numeric hash block (`undefined + n = NaN`) | All 9,656 fuzz states with `"0"` had such a key |
| Source 1: the rollback snapshot in `set()` creates `modules: undefined` when the baseline has no modules | Pack-only code |
| Source 2: the baseline assembly at the end of `set()` always creates `botPresets` and `modules`, `undefined` when absent | Also present in upstream 1.10.0 and 1.14.0 |
| Characters without `chaId`, duplicate `chaId`s, and `toSave.modules` on a baseline without modules give a wrong non-zero hash | 2,504 states; a missing character block becomes 0 inside the characters fold |
| Root keys and `chaId`s share one map; deleting a character whose id equals a root key name removes that root block | Code reading |
| With unique, present `chaId`s and no `undefined` keys, client and server hashes are equal | 0 unexplained mismatches; 500/2,000/5,000-character synthetic databases |
| A baseline without `botPresets` plus `toSave.botPreset` emits `replace /botPresets`, which the server rejects with 500 `OPERATION_PATH_UNRESOLVABLE` | Harness reproduction; also seen once in a browser run |
| A real user database snapshot has no id anomalies, and its client and server hashes are equal | Read-only measurement on a stopped-state backup copy |
| A full deep normalize and hash of the baseline per save costs 2.4–4 times the current `set()` + `hash()` | 2,000 characters: 29 ms current vs 87 ms |

The patcher is also bundled into the server-side BG orchestrator bundle
(`server/node/bgOrchBundle.mjs`), so that bundle must be rebuilt with the
change.

## 3. Design

1. **Single baseline state.** Baseline, root-key hash memo, character hash memo
   and the cheap pre-check caches form one state object. Rollback restores the
   whole object at once.
2. **Single mutation points.** The baseline changes only through internal
   functions that set or remove a root key, replace the character list, or
   replace the whole baseline. Setting a root key to an absent value removes
   the key and its memo. The functions are shallow: values arriving from
   `set()` are already normalized, so no deep normalize of the whole baseline
   is added.
3. **Derived hash memo.** The memo is a cache of the baseline, never an
   independent source. `hash()` computes a missing entry from the baseline
   value instead of adding `undefined`.
4. **Position-based character hashing.** The server hashes the characters
   array in order, so the client folds per-position character hashes. `chaId`
   is used only for the cheap change pre-check. This removes the failures for
   missing or duplicate ids and the root-key/`chaId` name collision.
5. **Absent keys in patches.** When the baseline lacks `botPresets` or
   `modules`, the generated operation adds the key instead of replacing it.
6. **Compatibility.** `init`, `set`, the returned `rollback` and
   `baselineSnapshot` keep their signatures and meaning. A read-only
   `lastSyncedDb` accessor keeps the shape read by `globalApi.svelte.ts` and by
   the personal-settings strict save and its test fixture.

Must stay unchanged: the hash value for every state in which the old patcher
was already correct; the server protocol; the generated patch for those states;
per-save cost.

## 4. Acceptance

- Fuzz equivalence: 0 client/server hash mismatches, including missing and
  duplicate ids, absent keys and rollback.
- Every generated patch applies to the server-side document (0 apply errors).
- Differential check: for states the old patcher handled correctly, hash and
  patch equal the old implementation's.
- `set()` + `hash()` at 500/2,000/5,000 characters is not slower than the
  current figures (6.0 / 29.2 / 82.8 ms for one character and one root key).
- Browser: new save persists with no 409/500; existing save patches return
  200; a two-tab conflict rebases and keeps both changes; one BG generation
  completes with the rebuilt bundle.

## 5. Extension needed for PocketRisu 1.14

Upstream 1.14.0 `risuSave.ts` keeps the same `hash()` (lines 940–952) and the
same baseline assembly (1420–1425), so the source-2 defect remains upstream.
It also adds direct baseline and hash-cache writes that must be routed through
the mutation points of section 3 when the pack is rebased:

- `init` default for `pluginCustomStorage` (1064–1065);
- module owner update (1123–1133);
- character owner update (1144–1146);
- persona update (1165–1166);
- new readers that must use the new memo layout: `describeHashMismatch` (994),
  `baselineDb` (967), `baselineArchivedCharacterIds` (955),
  `changedCharacterIdsOfLastSet` (972), `estimatePayloadBytes` (982).

Upstream 1.14.0 `set()` returns no rollback; the pack's rollback must be kept
on top of the restructured state. Re-run the section 4 fuzz and differential
checks against the 1.14 server `calculateHash` after the rebase, and confirm
the 1.14 first-save flow, which was not verified here.
