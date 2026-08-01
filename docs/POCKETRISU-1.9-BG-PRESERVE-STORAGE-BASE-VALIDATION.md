# PocketRisu 1.9.0 BG preserve standard-storage validation

## Decision

`bg-preserve-storage-base` version `0.1.0` is qualified for the exact official
PocketRisu 1.9.0 tag, commit
`85a65f3137b45c8de4a8d21a9887be213b1ac3fc`. PocketRisu 1.8.1 remains
supported. This decision does not qualify `bg-preserve`,
`lazy-chat-bg-adapter`, `lazy-chat-sync`, native-generation composition, or a
later 1.9.x release.

This is an internal conditional adapter. It is automatically present only
when `bg-preserve` uses standard PocketRisu storage, requires that parent, and
is excluded when `lazy-chat-sync` selects its separate storage adapter. The
parent remains under 1.9 review, so the downloader still cannot apply the
combined BG graph to 1.9.

## Actual scope and official 1.9 overlap

Despite the pack name, its runtime delta is not a database writer or model-job
recovery implementation. Its three units touch only
`src/ts/storage/nodeStorage.ts`:

1. import the parent-owned `retryAssetUpload()` helper;
2. wrap the existing single-file `/api/write` request in a reusable upload
   closure and invoke the helper only when `key.startsWith('assets/')`;
3. expose HTTP status and the server's string `error` detail for a final asset
   failure.

Official 1.9 changed the same host file for user-gesture-aware writer headers,
stable per-tab session identity, writer-lock status, and settings-only backup.
It did not change the three exact anchors inside the import and `setItem()`
regions. Exact 1.8.1 and 1.9.0 source composition each found one occurrence of
every final marker, zero collisions, zero-change reapply output, and a byte-
exact reverse-order revert.

The parent still owns `src/ts/storage/assetUploadRetry.ts` and its Vitest file.
The helper keeps the original fast path at one attempt with no delay. Only a
network rejection or HTTP 408/425/429/5xx enters the failure lane; that lane
allows at most three concurrent retries, waits 300 ms and 900 ms, and performs
at most three total attempts. HTTP 423 and other ordinary 4xx responses are not
retried. The repeated request uses the same content-derived asset key and the
same bytes, preserving the existing idempotent retry boundary.

## Storage and recovery ordering

The 1.9 paths were followed from their call sites rather than inferred from
the shared filename:

- ordinary `saveAsset()` calls `AutoStorage.setItem()` and then this
  `NodeStorage.setItem()` path with an `assets/` key;
- `database/database.bin`, drafts, persistent KV, and other non-asset keys
  take the unchanged one-call branch;
- database ETag conflict handling remains after the upload and still parses
  HTTP 409 into `ConflictError` before the generic error branch;
- every attempt still calls native `authFetch()`, which owns authentication,
  the per-tab session header, the 1.9 user-gesture header, auth refresh, and
  423 deactivation signaling;
- bulk asset import/export uses `/api/assets/bulk-write` through `setItems()`
  and is outside these units;
- native model-job recovery calls `saveChatToServer()`, which delegates to
  `NodeStorage.saveChatContent()` and its `/api/chats/...` route. It does not
  call `setItem()`, `/api/write`, or the asset retry helper.

The adapter therefore does not reorder bootstrap recovery, claim a model job,
save a recovered chat, move the single-writer lock, or compete with the future
BG/native request-authority table. It remains useful to BG-owned post-
processing that saves generated/imported assets, but owns only the failed
asset-upload retry.

## Automated qualification

A detached clean clone of exact official 1.9.0 received only the two parent-
owned retry helper/test files, this adapter's three units, and the independently
qualified `toolchain-hardening` test-environment delta.

- manager apply changed the helper, helper test, `nodeStorage.ts`, and private
  qualification state; status was `current` with no drift;
- repeated plan had zero changes and repeated apply returned
  `{ changed: false, files: [] }`;
- focused retry helper test: 1 file and 5 tests passed;
- frontend tests: 70 files, 1,045 passed and 3 skipped;
- the sandboxed server run could not bind `127.0.0.1` and timed out; the same
  server suite rerun with loopback binding available passed 4 files and all 99
  tests;
- Svelte diagnostics: 0 errors and the four upstream warnings in
  `DefaultChatScreen.svelte`;
- production build: passed.

Revert restored the helper/test absence, `nodeStorage.ts`, toolchain files,
and private qualification state. Patcher status returned `clean`, and Git
reported no tracked byte or mode difference from official 1.9.0.

The patcher contract suite adds exact-target metadata, parent-helper ownership,
asset-only branching, non-ownership of database/model-job/plugin paths, and
apply/reapply/revert checks. The existing resolver gate continues to require
exactly one standard or lazy storage adapter for every BG selection.

## L2.5 runtime audit

### Phase 1 — flat discovery

- An asset upload can succeed, return a transient status, return an ordinary
  4xx/423, or reject before a response exists.
- The first attempt can have completed server-side even if its response was
  lost.
- Many first-wave asset uploads can fail together and enter the retry lane.
- A retry can cross the 15-second user-gesture window.
- HTTP 409, auth refresh, writer-lock deactivation, and final error parsing can
  interact with the wrapper.
- Database, chat, draft, KV, and bulk-asset writes share storage classes but
  should not inherit this retry policy.
- Native job recovery and BG post-processing can both persist data after a
  generation, but through different methods.
- Failed uploads allocate short timers and retry-lane waiters; the successful
  fast path allocates only its upload closure.
- Error detail reaches the importing/generation UI through the existing
  aggregate error chain.
- The delta adds no plugin, database-array replacement, socket, persistent
  retry queue, credential read, dynamic code, HTML insertion, or destructive
  user-data operation.

### Phase 2 — external-anchor resolution

- **Exact host structure — measured.** Official 1.8.1 and 1.9.0 each composed
  all three units with zero collisions, exact reapply, and exact revert. The
  1.9 manager transaction and target build used a separate detached clone.
- **Fast path and retry bound — structural plus measured.** The asset helper
  calls the upload once before acquiring its three-slot retry lane. Its tests
  observed no delay for success, recovery from a network reject and 502,
  exactly three attempts with 300/900 ms waits, non-retry of 423, and at most
  three active retries while eight first attempts remained concurrent.
- **Idempotency — structural.** Every retry closes over the same `key`,
  `value`, and `headers`. Assets use content-derived keys through
  `saveAsset()`, so an uncertain first write followed by the same-key/same-byte
  write does not create a second logical asset. This claim does not extend to
  arbitrary non-asset writes because they never enter the helper.
- **Auth and writer headers — structural.** Each attempt invokes 1.9
  `authFetch()` rather than raw `fetch()`. Authentication refresh and the
  stable session ID are retained. `x-user-active` is recalculated per attempt;
  a retry after the gesture window expires therefore cannot falsely extend
  writer activity. HTTP 423 is dispatched by `authFetch()` and returned
  without retry by the helper.
- **Conflict and final error — structural plus focused test.** HTTP 409 is not
  retryable and remains handled by the existing `ConflictError` branch. An
  asset's other final non-2xx response attempts to read only a cloned JSON
  body and appends a string `error`; non-JSON responses still expose status.
  Non-assets retain the old `setItem Error` contract.
- **Database/chat/job separation — structural.** `database/database.bin` does
  not start with `assets/`. Recovered chats bypass `setItem()` entirely through
  `saveChatContent()`. The units contain no model-job, pending-send, claim,
  chat-save, ETag-update, DB mutation, `setDatabase()`, `setDatabaseLite()`, or
  plugin-array code.
- **Bulk path — structural.** `setItems()` owns `/api/assets/bulk-write` after
  the changed method and remains byte-identical. This qualification makes no
  retry guarantee for that separate bulk protocol.
- **Resources and performance — structural plus measured.** Successful
  uploads retain upstream concurrency and add no delay. Failed uploads can
  enqueue a number of in-memory waiters proportional to the concurrently
  failed asset calls; each waiter is released and every operation has only two
  bounded waits. No universal memory bound is claimed beyond the calling
  import/process concurrency.
- **Security and user state — structural.** Retries reuse the authenticated
  same-origin storage route and do not broaden paths, origins, methods, or
  credentials. The adapter neither deletes data nor changes the plugin array.

### Phase 3 — triage

- **Q3, resolved:** exact target composition, helper behavior, complete target
  tests, diagnostics, build, reapply, and exact revert passed.
- **Q3, resolved by ownership separation:** native chat/job recovery and
  database/writer-lock behavior do not traverse the asset-only branch.
- **Q4, prepared limitation:** HTTP 507 is included by the existing `>= 500`
  retry rule even when disk exhaustion is persistent, causing two bounded
  extra attempts before the final detailed error. Revisit only if logs show
  this meaningfully delays diagnosis.
- **Q4, waiting signal:** the exact iPhone socket-abort condition from the
  original multi-asset CharX failure has not been reproduced with the same
  input. This remains a field-observation gate rather than a source blocker.

## Concrete iPhone observation

When the previously failing CharX or another identifiable multi-asset CharX
produces the same socket-abort condition, import that exact file once on the
iPhone. Normal first-wave asset concurrency must remain unchanged. If one or
more `/api/write` requests abort transiently, the import should recover within
the two bounded retries; otherwise the aggregate UI must include the first
actual `Asset upload failed (HTTP ...)` or final network cause. A silent missing
asset, duplicate logical asset, 423 retry/reload loop caused by this adapter,
or repeated attempts beyond three is the unsafe signal. Imported user data is
not deleted after the observation without separate approval.

## Remaining boundary

`bg-preserve` itself remains blocked on the native-1.9 request-class ownership
table and its changed generation/runtime anchors. Storage/import owners,
`lazy-chat-bg-adapter`, every Kei child, K12, aggregate combination review,
and consolidated per-feature iPhone L3 remain separate work.

No live apply, PocketRisu restart, push, tag, release, installer rebuild,
cutover, migration, or user-data cleanup was performed.
