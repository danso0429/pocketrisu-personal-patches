# G1.2 client chat-save rebase

Date: 2026-09-27 KST
Status: implemented, automatically verified, pushed and live-applied. Physical device observation remains open. Server anchor commits (G1.1), expanded N+1 admission and full G1 qualification remain open.

## Result and scope

When a server answer is committed before an older client edit arrives, NodeStorage can now read the newer revision and reapply independent client changes instead of failing every stale save. A subsequent save from the same old client view retains the unseen server answer. This does not yet handle the reverse ordering at the server: a client edit committed before generation finishes can still conflict with the existing server whole-chat commit gate.

Candidate `0.2.4-experimental.8` uses lazy-chat-sync `0.5.3` and lazy-chat-bg-adapter `0.7.15`. Personal settings and the enabled MARP header rule are not modified by this feature.

## Storage contract

- Existing per-chat serialization, create-only saves and server CAS remain authoritative. Automatic rebase requires a prior merge baseline and a fresh authoritative revision. There are at most two rebase retries; unchanged-revision conflicts are not retried.
- Independent object fields and message edits merge by stable chatId. Remote additions precede local additions at the same original gap. Known unchanged deletions remain deleted; edit/edit, delete/edit, identity and order conflicts are explicit failures. Legacy unkeyed messages have only a narrow unchanged-prefix compatibility path.
- A hidden last-submitted client snapshot is retained separately from the canonical server snapshot when they differ. Both count against the existing serialized-byte cache limits. Missing/evicted merge state refuses a write rather than treating unseen data as an intended deletion.
- A GET for export or prompt preparation is not a new client view. Existing baselines advance only on an acknowledged save or explicit adoption by the UI. Placeholder hydration applies a display copy before acknowledging the original server snapshot, so clearing transient stream flags does not change the snapshot's revision basis.
- Pending saves capture the current view token. Actual adoption or database replacement invalidates active/queued old-view saves; new saves can use the newly adopted view. A save may have reached the server before a view changes, so subsequent confirmation still uses the normal read/CAS path rather than an unconditional retry.
- Transport attempts return their exact acknowledgement revision. The wrapper does not attach a concurrent cache refresh's revision to an older payload. Private retry snapshots are not serialized with errors and are removed before propagation.
- Full binary saves support undefined key presence. JSON deltas are used only for JSON-safe snapshots. The actual storage codec is exercised separately from lightweight JSON fixtures.

## Observed verification

| Check | Result |
| --- | --- |
| Patcher | 51/51 |
| Focused client storage/hydration | 77/77 |
| Full frontend | 1,943 passed, three skipped conditional process tests |
| Full server | 388 passed, 12 existing skips |
| Compatibility | 74 passed, five existing skips |
| Svelte diagnostics | Zero errors and warnings |
| Builds | Frontend production build and BG bundle/load passed |
| Fresh all-pack graph | 42 packs, 1,147 units, seven collisions; zero-change replan |
| Exact revert | 1,021 baseline files restored with zero byte/mode mismatch |
| Installer | 5,428,905 bytes, mode 0755; SHA-256 `30f182a9392eef3b36e25b9d676e7ba18cbfe5c20564f1ec893ae23bd93c3a86` |

The third conditional frontend process test is new. It runs under the server process suite against an actual isolated PocketRisu/SQLite/HTTP server and actual NodeStorage/codec, with reactive UI scaffolding mocked. One storage instance appends an answer; another saves an earlier edit through a conflict and saves again from its old view. A fresh ordinary chat GET retains both edits and the answer, with zero provider calls. Existing blank-client adoption tests continue to run in their original mode. This is not a physical browser/PWA measurement.

An early candidate's read-only-fetch regression was reproduced before delivery: the next save removed the unseen answer. Read/adoption separation, explicit application points and in-flight/queued-view invalidation fixed that case. Tests also cover lost ACK, failed retries, a late cache refresh, intentional deletion after adoption, database replacement, budget eviction, absent acknowledgement metadata and unchanged-revision conflicts. No existing assertion was skipped or weakened to pass.

The full frontend/server/compatibility runs precede a diagnostic-wording-only change that removes an instruction to reload with an unsaved draft; the final wording passed all 77 focused tests and a new production build/BG load. No runtime logic changed after those full runs. Existing bundler warnings remain. There is no new dependency or external provider request.

## Delivery and limits

Implementation commit `99bb589` was pushed before delivery. Preflight confirmed 420 managed files without drift, zero active requests/pending sends/input records, and 45 operation-state records. Five consistent SQLite backups passed quick_check, and an application/state/intent archive was retained before a fresh idle check and stop/apply/build/restart. The installer changed the planned ten paths. The live frontend build transformed 8,008 modules; the BG bundle loaded sendChat.

Live root returned HTTP 200. Served `index-CXkvh6v2.js` matched the local 2,167,443-byte entry asset, SHA-256 `d1bdb3480ece45545c1dfcb5eb760bd298960e0cf00601beaa61503573993eb5`. The actual storage-code chunk `database.svelte-Buc3VRbG.js` also returned 200 and matched the local 2,488,322 bytes, SHA-256 `662b730f9c042f2aa2457f0c5f048ccd86f19bbbb76a502e7eadf45a364c053e`.

All 423 managed files matched recorded hash/mode; replan had zero changes and all five databases passed quick_check. PM2 was online with zero unstable restarts and active requests; operation-state count remained 45. The existing six-record/2,974-byte retained-journal warning repeated once. The MARP header-settings record was compared in memory before and after deployment and remained byte-identical; its secret/value was not recorded. No provider request or user-data cleanup was performed.

The candidate is delivered independently before changing server commit ownership. Source rollback must preserve user data and existing server settings; this feature introduces no durable database schema. No stable tag or release was created.

Physical iPhone save/adoption timing remains unobserved. Missing merge baselines, ambiguous legacy arrays and overlapping edits remain explicit save failures with the caller's draft untouched. Preserve local edits before any manual view replacement. The separate intermittent home-navigation report is not resolved by this work. Stable release and complete background-edit support are not claimed.
