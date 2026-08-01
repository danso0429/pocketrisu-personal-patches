# PocketRisu 1.9 Kei K27 BG logging/usage validation

## Scope and authority

This receipt implements only K27-F01/L02/U03 from the overlap-equivalence
audit's technical reclassification recommendations. It connects
server-orchestrated BG requests to official PocketRisu 1.9's existing native
request-log and usage owner. It does not add a platform badge, per-row delete,
rich accounting, independent usage policy, retention policy, a new privacy
policy, or a second database/schema.

The existing owners remain authoritative:

- `src/ts/requestLog.ts` decides whether capture is enabled, wraps provider
  fetches, assembles response bodies, attaches normalized usage, and closes a
  scope exactly once;
- `server/node/request-logs.cjs` alone normalizes, masks, caps, stores, rotates,
  and queries request/usage rows in the existing `save/request-logs.db`;
- `bg-preserve` owns the detached server execution and now routes its bundled
  native logger POST to that already-open server owner.

The implementation versions `bg-preserve` from `v1.0.1-patcher.2` to
`v1.0.1-patcher.3`. Its exact-1.9 orchestrator and server-registration siblings
add the owner bridge; the existing 1.8.1 payload remains selected unchanged.
The imported `patches/bg-preserve.json` remains byte-identical at SHA-256
`06c482b32e3d3a7e045ce7b3e18b173e9af63205ac68a3dd34fef055cb29efa4`.

No live PocketRisu path, patch state, user data, preserved K12 index, process,
push, tag, release, or restart was changed.

## Feature contract and revert surface

- **Purpose:** preserve native request-log and content-free usage accounting
  when the browser is absent and the BG server owner performs the paid request.
- **Trigger:** an enabled native request-log scope inside the server bundle
  closes and issues its existing `POST /api/request-logs` JSON-array request.
- **State/result:** the BG fetch adapter accepts only the native logger shape,
  parses one batch, and calls the already-open
  `requestLogs.addRequestLogBatch()` once. The native transaction writes one
  request row and, for `llm`, one content-free usage row.
- **Preservation:** `requestLogEnabled` remains the only capture gate. Native
  inline-media stripping, credential masking, 2 MiB request/response field
  caps, 16 KiB header cap, batch cap, 256 MiB total request budget, minimum-row
  floor, pagination, usage schema, and failure isolation remain unchanged.
  Foreground, native-job, provider, custom/local endpoint, plugin, abort, and
  stream handling are not replaced.
- **Exact revert surface:** the exact-1.9 server registration and orchestrator
  siblings, one stateless bridge and its target test, the BG patcher version,
  focused patcher tests, and catalog/receipt updates. Revert removes both owned
  bridge files and restores official server/native-logger bytes.

The bridge additionally collision-hardens the internal route. It accepts only
`POST`, JSON content type, a nonempty `risu-auth` header, a string body, a
nonempty JSON array, and at most the native Express 100 MiB raw-body limit.
Wrong-shape GET, missing headers, scalar/malformed JSON, and oversized bodies do
not call the owner and fall through to the pre-patch relative-fetch behavior.
This shape check is not described as a cryptographic trust boundary.

## Provenance and resolved graphs

- Patcher pre-feature HEAD:
  `fbecfdfbc9daafa23259c533799c532666b4c31e`.
- Exact official PocketRisu target:
  `85a65f3137b45c8de4a8d21a9887be213b1ac3fc`, package `pocketrisu 1.9.0`.
- Qualified BG pack ETag:
  `a5007b16545c3c7e6f6a91d0c5b461956f0e39d91e87214b3d3349c0e5c10eca`.
- Applied exact-1.9 hashes:
  - `bgOrchestrator.cjs`:
    `243250efd67a7f241bb3c09d90fa7994b19f8167f6e23ee54cb58d40f3dd9350`;
  - `bgRequestLogBridge.cjs`:
    `a57f9d39aa89d4b8eb5cdce7500c4318610a35de89adaf3b522de77a4ddb7007`;
  - `bgRequestLogBridge.test.ts`:
    `7fcc8296682c360f6acd90b210ade7797ea778695b33573a7a51c0a43a58e0cd`.
- Unchanged official native-owner hashes before, during, and after apply:
  - `request-logs.cjs`:
    `1de034b7f61d1b26f863f72e0165d9c2998157741feb385714f7073809fc9d07`;
  - `requestLog.ts`:
    `c88d44ea96f5099cb08d5b7c2c7b1fd1f444f7526332240de458aff78d9a4143`.
- Preserved 1.8.1 BG payload SHA-256 assertions:
  - orchestrator `e51d91b18251534cab4dc077cc8b99feaf7060f5e3ff0b79d3380cef30100a2c`;
  - registration `2f6888a998a332a65681d8f7be8d66344fbc8e4d66917e6d2f2c602dc79fcc7d`.

Observed owner graphs:

| Selection | Native log owner | Active K27 correction | Compatibility | Collisions |
| --- | --- | ---: | --- | ---: |
| `toolchain-hardening` | absent from graph | 0 | verified | 0 |
| `bg-preserve` | official 1.9 owner plus BG adapter | registration + orchestrator + bridge + test | verified | 0 |

The owner-present graph resolved `bg-preserve` plus
`bg-preserve-storage-base`, 183 active units, and 90 transaction-managed files.
All four `runServerPreview` callers—detached paid execution, full diagnostic,
LLM diagnostic, and assemble diagnostic—pass the same existing owner. The 1.8.1
graph selects the prior orchestrator/registration payload and no K27 bridge.

## Observed automated gates

- Focused patcher graph/contract suite: 4/4 test files passed.
- Complete patcher suite: 35/35 test files passed.
- Exact-1.9 bridge Vitest: 4/4 tests passed. It used the real native SQLite
  owner to measure secret masking, field truncation, byte rotation,
  request/usage multiplicity, content-free usage, wrong-shape rejection, raw
  body bound, missing-owner handling, and DB failure isolation.
- Existing native client logger Vitest: 18/18 tests passed, including disabled
  toggle no-op, streamed body assembly, abort, usage attachment, body stripping,
  batching, and idempotent close.
- Existing native server logger Vitest: 35/35 tests passed, including masking,
  per-field truncation, byte rotation/restart sweep, request/usage transaction,
  usage scope, filters, pagination, auth, and routes. Its loopback route fixture
  was run with local bind permission after the sandboxed bind timed out.
- Independent read-only review first found that the four actual
  `runServerPreview` caller objects omitted the new owner; all four were fixed
  and a caller-count assertion was added. It then reproduced the broad-route
  problem with a GET/scalar payload (`written:1`) and guided the final
  native-shape guard. The final reproduction returned `parsed:null`, called the
  owner zero times, and the reviewer found no remaining actionable K27 defect.
- Svelte diagnostics: exit 0, 0 errors and 0 warnings.
- Production build: exit 0 after 7,818 transformed modules. Observed CSS
  highlight, browser externalization, dynamic-import, plugin timing, and
  large-chunk warnings were outside the K27 server bridge delta.
- First owner apply changed 92 paths. Status reported both resolved packs
  current across 90 managed files. Reapply changed zero and skipped all 90.
- Full revert changed 92 paths and reported clean. The exact-1.9 orchestrator,
  bridge, and target-test files were absent afterward; the official native
  hashes above and official `server.cjs` SHA-256
  `b10276f7651160902313d8cb7022d27b72f6e051281fa438ef52672c900f5e30`
  were restored, and tracked target diff was zero.
- Exhaustive combination verifier: exit 0; 2,048/2,048 raw selections,
  1,024 normalized graphs, 213 managed paths, maximum 490 resolved units,
  two workers, and all round trips passed.

No paid provider request was made. These gates prove owner wiring and bounded
storage semantics without mutating a real user log database.

## L2.5 runtime audit

### Phase 1 — flat discovery

- foreground and BG request-log scope creation and toggle-disabled no-op;
- scope wrap, stream tee/assembly, abort, close idempotency, and batch send;
- bundled auth creation and relative `/api/request-logs` fetch;
- exact detached, full, LLM, and assemble `runServerPreview` callers;
- lazy one-time bundle load and global fetch patch lifetime;
- POST/method, content-type, auth-header, body-type, array, parse, and raw-size
  boundaries;
- valid batch, empty/scalar/malformed/oversized input, missing owner, and owner
  exception;
- native entry filtering, batch cap, masking, truncation, size accounting,
  request insert, usage insert, and rotation;
- success/failure/abort/stream/token fields and `llm`-only usage scope;
- foreground/native-job/custom endpoint/provider/plugin paths and accidental
  relative-route collision;
- concurrent scopes, repeated close/start, duplicate row risk, and DB write
  failure;
- exact-1.9 activation, 1.8 payload preservation, apply/reapply/revert, owned
  file lifecycle, and composition.

### Phase 2 — external-anchor resolution

- **Capture gate — structural plus measured test.** The native gate remains
  `requestLogEnabled()` at `requestLog.ts:95-101`; single entries and scopes
  exit before sending at `159-161` and `357-359`. The existing disabled-toggle
  test observed zero POSTs. K27 does not read or copy the setting separately.
- **Native POST shape — structural plus adversarial test.** Native `send()`
  emits a JSON array with `POST`, `Content-Type`, and `risu-auth` at
  `requestLog.ts:142-155`. The bridge admits that exact shape, bounds the raw
  string at 100 MiB before parsing, and rejects GET, missing headers, scalar,
  malformed, empty, and oversized payloads without calling the owner. This
  preserves unrelated/custom relative fetch behavior instead of turning the
  path name into a general write capability.
- **Actual detached path — structural plus independent review.** Applied
  `bgOrchestrator.cjs:814-815` passes `requestLogs: deps.requestLogs` from the
  authenticated registered server owner into detached paid execution. The
  diagnostic callers at `893`, `902`, and `907` do the same. Lazy bundle load
  receives it at `374`; fetch patching receives it once at `165-176`; the route
  parses and delivers at `200-237`. A focused assertion found exactly four
  callers and required owner propagation on every one.
- **Single native owner — structural plus measured test.** Official
  `server.cjs` creates one `requestLogs` instance and the exact-1.9 registration
  passes that reference. The bridge calls only `addRequestLogBatch`; it contains
  no DB import, table, schema, cache, queue, retry, or persistence. The real-owner
  bridge test observed exactly one request row and one usage aggregate for one
  accepted batch.
- **Masking and field caps — unchanged source plus measured test.** Native
  normalization masks headers/body/response and URL, truncates at native bounds,
  and calculates stored bytes at `request-logs.cjs:100-153`. A secret in URL,
  Authorization, and a body exceeding 2 MiB was absent after persistence; the
  stored row reported truncation.
- **Whole-byte budget — unchanged source plus measured test.** Native newest-
  first rotation remains `request-logs.cjs:330-343`; batch insertion and periodic
  rotation remain `372-386`. With a reduced test budget, three bridged rows left
  only the newest request row while all three content-free usage rows remained.
- **Content-free usage — unchanged source plus measured test.** Request and
  usage inserts remain one native transaction at `request-logs.cjs:345-368`.
  The usage insert accepts only category/source/model/provider/success/streaming,
  duration, and token counts; no content column exists. The bridge test observed
  token totals and no request/response strings in usage output.
- **Failure isolation — structural plus measured test.** Native send catches
  auth/fetch delivery errors at `requestLog.ts:142-155`. Missing owner and owner
  exception return bounded 503/500 responses from the bridge without throwing;
  malformed and wrong-shape requests fall through to the same caught relative
  fetch failure. No retry or paid-request control flow is added.
- **Exact-once and abort — unchanged source plus measured test.** One scope
  collects entries and `close()` sets its guard before awaiting and sending at
  `requestLog.ts:517-530`; the existing repeated-close test observed one batch.
  Stream and abort handling at `426-492` remained byte-identical and passed its
  native tests. K27 neither creates nor retries provider work.
- **External path preservation — structural.** Provider/custom/local/plugin
  transports are unchanged; only a native-shaped relative logging POST inside
  the already-authenticated server orchestration is diverted. Wrong-shape path
  collisions fall through. No top-level plugin-array/database write is added.
- **Pack and revert — measured.** Owner-absent/present plans, target
  apply/status/reapply/revert, exact 1.8 payload hashes, official native hashes,
  owned-file removal, target diff, patcher tests, target tests, diagnostics, and
  build were observed as recorded above.

### Phase 3 — triage

- **Q3, fixed:** BG server-orchestrated requests now reach the native request-log
  and usage transaction when the native toggle is enabled.
- **Q3, fixed during review:** every actual `runServerPreview` caller now carries
  the owner; a registration-only bridge cannot silently degrade to 503.
- **Q3, fixed during adversarial review:** unrelated GET/scalar/malformed or
  oversized requests cannot poison native rows/usage through a path collision.
- **Q1, no new storage authority:** one official DB/schema and one native
  transaction remain. The new bridge is a stateless transport adapter.
- **Q4, bounded prepared surface:** the shape header is collision hardening, not
  a cryptographic same-process trust boundary. Current source review found no
  reachable untrusted server-bundle bypass; if a future plugin runtime gains
  arbitrary internal fetch plus access to the native shape, reassess with an
  explicit capability rather than adding a parallel logger.
- **No K27-specific L3:** the audit classified this as deterministic server
  owner wiring. Final aggregate K19 and K29 iPhone scenarios remain separate.

## Excluded outcomes and publication boundary

K27 platform metadata/per-row delete, rich accounting, independent usage,
retention/pagination policy, and a new privacy policy remain excluded. This
receipt qualifies a local patcher-owner version only. It does not authorize or
claim generated-installer publication, push, tag, release, live apply, or
restart. Final aggregate review and the consolidated iPhone L3 remain later
gates.
