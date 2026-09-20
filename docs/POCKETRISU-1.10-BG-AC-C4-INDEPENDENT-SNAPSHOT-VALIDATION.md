# Archive Center C4 independent source-snapshot validation

Status: **historical resolver checkpoint; current H2 source authority is
`POCKETRISU-1.10-BG-AC-ARCHIVE-CENTER-SOURCE-SNAPSHOT.md` and restored AC
`docs/pocketrisu-host-context-h2-validation.md`**

- Validation date: 2026-09-20 KST
- Public base: `026dcbf3b45adcf69b254673d439b24e943115b3`
- Source candidate: `9e23861901f15cae46817158a21ea873bbde6fe1`
- Expected tree: `7806dd39f4acfa294ee67f9d7834bc6fed448730`
- Source snapshot patch SHA-256: `d70dac9ef7386464ef8bc5bf9fd0259b7b4c821af321325445abc92a5e6d574d`
- Archive Center baseline: 4.3.1
- Go toolchain: go1.26.6 linux/arm64
- Live Archive Center mutation: none

## 1. Scope and source reconstruction

The candidate source was reconstructed independently from the public base by
applying the tracked full-index patch with `git apply --index`. The staged diff
contained 28 paths and `git write-tree` returned
`7806dd39f4acfa294ee67f9d7834bc6fed448730`, exactly matching the local
candidate tree.

This validation therefore covers the source represented by `9e23861` without
depending on the original Archive Center worktree for file contents. The
original 15 local commit objects remain local provenance and are not embedded
in the sanitized source snapshot.

## 2. Resolver behavior reviewed

`pocketrisu_execution_context.v1` captures device and backend material before
resolution. `resolvePocketRisuExecutionContext()` then derives independent
request settings from that captured material only:

- complete device main/critic/source-search/embedding authority wins;
- a partial device authority does not receive backend credentials;
- supervisor follows the captured device main setting when device authority is
  present;
- backend runtime supplies main/supervisor/critic/source-search fallback;
- embedding falls back from device to captured runtime and then to captured
  config/environment material;
- retry budgets are created from the captured backend retry count;
- prepare budgets and preprocessing maps are cloned before return;
- source labels distinguish complete, partial, backend, fallback, and missing
  configurations.

The resolver does not read `Server`, current runtime config, environment, or
`memory-preprocessing.json`. Those sources are read during capture under
`RuntimeConfigMu` and encoded into the process-memory context before the
resolver runs.

## 3. Runtime audit v2

### 3.1 Phase 1 — flat discovery

- `NewServer` allocates an empty execution-context registry.
- Capture holds `RuntimeConfigMu.RLock` while cloning runtime config, reading
  preprocessing settings, and resolving the embedding config/environment
  fallback.
- Context identity covers host, character, chat, binding, operation, and claim
  epoch.
- Full material and secrets are JSON-encoded in process memory.
- Public digest excludes secret values while reflecting configured-state and
  non-secret settings.
- Exact identity/material replay reuses one context ID.
- Same identity with changed material conflicts.
- Load requires context ID and complete owner identity.
- Context capacity is 1 MiB per record, 64 entries, and 16 MiB aggregate with
  no eviction.
- Resolver normalizes device and backend material again before use.
- Device provider authority is selected from usable key, endpoint, or model;
  a provider name alone does not select device authority.
- Partial device authority remains partial rather than mixing backend secret
  fields.
- Supervisor derives from device main or captured supervisor runtime settings.
- Main, supervisor, critic, source-search, and embedding settings receive
  independent retry/config values.
- Prepare budget and preprocessing maps are copied.
- Resolver errors return without publishing a result.
- Capture and resolver have no production HTTP route or provider caller.
- Current prepare/complete/proxy/critic/embedding/search callers still use
  their existing accessors.
- Context release, terminal tombstone, and retention are absent.
- Prompt directory and prompt file contents are not captured.
- Full secret-bearing resolved configs could be exposed if a future caller
  logs them; no current production caller exists.

### 3.2 Phase 2 — external anchors

| Claim | Kind | Adversarial break case | Anchor and resolution |
| --- | --- | --- | --- |
| Snapshot reconstruction is exact | Empirical | patch omits or changes a candidate file | 28 staged paths and restored tree `7806dd39…` matched the source candidate |
| Resolver does not reread mutable globals | Structural | mutate runtime/env/file after capture | resolver accepts material only; mutation fixture keeps captured embedding values |
| Partial device config cannot inherit backend credentials | Structural | device supplies model only while backend has key/endpoint | focused test returns device partial source with empty backend credentials |
| Existing backend behavior is preserved | Structural | new fallback changes current accessor values | main/supervisor/critic/source/embedding parity fixture compares final configs |
| Returned maps are independent | Structural | mutate caller budget and preprocessing maps after resolve | copy fixture retains original resolved values |
| Capture is one-owner under concurrency | Empirical | sixteen identical concurrent captures allocate multiple IDs | focused race test passed with one owner |
| Capacity is bounded | Structural | add beyond entry/byte limit | capture returns explicit capacity status and performs no eviction |
| Secret material is not durable in this slice | Structural | search migrations/store writes for context material | candidate adds process-memory registry only; no context table or file writer exists |
| Production reachability is absent | Structural | route, prepare, complete, or provider calls resolver dynamically | exhaustive symbol search found resolver calls only in its definition and tests; capture calls only in tests |
| Full candidate compiles and remains race-clean in the test environment | Empirical | resolver introduces package or shared-state race | focused, full Go, full race, vet, JS syntax, and ARM64 build passed on restored source |

### 3.3 Phase 3 — triage

| Item | Triage | Result |
| --- | --- | --- |
| Resolver precedence/parity | Q1 | Verified by focused tests and existing-accessor comparison |
| Mutable reread | Q1 | Resolver itself is captured-only; future consumer wiring must preserve this property |
| Production caller absence | Q2 admission boundary | No product value claimed; C4 remains unmounted |
| Capture lock includes preprocessing file read | Q4 | No caller exists; measure contention when an authenticated route is introduced |
| Context release/retention | Q2 activation blocker | Must be defined before production route activation |
| Prompt-file snapshot | Q2 activation blocker | Audit every future consumer and capture any mutable prompt file it rereads |
| Secret-bearing future caller logging | Q2 security boundary | Pass config directly to provider accessors and add redaction tests before route exposure |

## 4. Verification receipt

| Gate | Observed result |
| --- | --- |
| Source restore | public base + tracked patch → 28 paths, exact tree ID |
| Focused context/resolver | passed |
| Focused context/resolver race | passed |
| Complete Go repository | passed |
| Complete Go repository race | passed; `internal/httpapi` completed in 232.160 seconds |
| `go vet ./...` | passed |
| `node --check "Archive Center.js"` | passed |
| Linux ARM64 build | 36,486,347 bytes, mode 0775 |
| Linux ARM64 SHA-256 | `fd70b2ca9b2ba998ce2cfa14942583a7eaedf7d6734e1c0bc87a9aaa15cae8a6` |

The ARM64 build used `CGO_ENABLED=0`, `GOOS=linux`, `GOARCH=arm64`, and
`-trimpath`. Go build metadata reports public base revision `026dcbf` with
`vcs.modified=true`, which is the expected representation of a staged source
patch rather than a checkout of the original local candidate commit.

The first restricted full test run failed only where `httptest` could not bind
loopback sockets. The same restored tree passed with local listeners allowed.
No disposable MariaDB/Chroma runtime was started for this independent replay;
the earlier C0 MariaDB integration evidence remains separate.

## 5. Remaining C4 gate

1. Define strict external DTO decoding, body limits, authentication, and
   capability advertisement.
2. Join captured context to `HostSessionExecutionStore` and
   `HostPrepareRegistryStore` under the same operation/claim identity.
3. Add context-aware prepare, complete, main, critic, embedding, and
   source-search accessors without mutable fallback.
4. Capture or explicitly exclude mutable prompt files read by those consumers.
5. Define terminal release, previous-turn/late-status retention, tombstones,
   startup running→unknown behavior, and compaction.
6. Add positive/negative prepare observation and complete source-acceptance v4
   handler tests while preserving v1–v3 behavior.

The restored source is independently testable and the resolver checkpoint now
has full race, vet, and ARM64 build evidence. It is still not a mounted product
integration.
