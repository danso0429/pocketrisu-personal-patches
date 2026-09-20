# PocketRisu 1.10 BG × Archive Center H1 composed-process validation

- Validation date: 2026-09-20 KST
- Implementation/test commit: `7ce42595564258c598f5ecd4a04c9962e17521bd`
- Exact PocketRisu target: `98e968339d1b3f91b9dac85bb3f2ebb5f90f9d14`
- Adapter: `lazy-chat-bg-adapter` 0.7.1
- Product capability: `inputCommandVersion=0`
- Diagnostic foundation: `inputCommandFoundationVersion=4`
- Archive Center mode: disabled/unbound
- Live application: not performed

## 1. Scope and verdict

H1 raises the prior in-process route fixture to a generated production-process
boundary without changing product runtime behavior. The test launches the
complete exact-1.10 target's `server/node/server.cjs` as a child process, uses
the production SQLite database and normal chat API, terminates and restarts the
child at named durable boundaries, and exercises blank-client adoption through
the actual `NodeStorage` and `chatStorage` implementations.

The observed H1 scenarios pass. One AC-off input-command turn continues after
the initiating request process exits, commits exactly once, remains discoverable
after short-lived result/state removal, and is adopted from two empty client
storage contexts both before and after that removal without a client write-back.
Transaction failures preserve server ownership and roll back the complete
durable commit. Post-commit process crashes recover without provider or commit
replay.

H1 does not activate the ordinary client. Capability remains 0. It does not
connect Archive Center, perform a paid provider request, mutate live PocketRisu,
or qualify browser/device behavior.

## 2. Test topology and isolation

```text
disposable request child
  -> production POST /api/bg-orchestrate
  -> receives start ACK and exits

generated server.cjs child
  -> temporary cwd and save/risuai.db
  -> loopback-only listener
  -> actual bgOrchestrator routes
  -> actual input/commit/projection owners
  -> deterministic test-only preview injection

observer
  -> production result/status/projection routes
  -> production GET /api/chat-content/:chaId/:chatIndex

blank client process
  -> actual NodeStorage
  -> actual adoptServerCommittedChat
  -> empty sync maps and placeholder chat
```

Each scenario creates its own temporary runtime root. The production entry
point and installed modules remain in the exact target, while `process.cwd()`
points at the isolated runtime root so password, session, SQLite, backup, and
other writable paths cannot reach live data.

The preload is an owned test file that is loaded only when
`POCKETRISU_H1_PROCESS_TEST=1`. It forces the test listener to loopback, injects
a fixed preview through the existing `runServerPreview` dependency seam,
records counters over child-process IPC, and exposes named failure/crash points.
No production source imports the preload.

## 3. Success and ownership observations

The primary process case observed:

| Counter | Observed value |
| --- | ---: |
| Start requests | 1 |
| Provider calls | 1 |
| Server commit calls | 1 |
| Client chat saves | 0 |
| Result ACKs | 0 |
| Fallback provider calls | 0 |

Additional assertions:

- the request child exited after a successful start ACK and before the provider
  gate was released;
- capability remained input 0/foundation 4;
- the commit receipt recorded `acOwner=disabled` and `acState=disabled`;
- the normal chat API returned the committed binary chat and its exact
  `x-chat-revision`;
- message order was base user → owned input → owned assistant;
- the revision-bound authoritative projection identified the same operation;
- two fresh client storage contexts adopted the exact revision through actual
  `NodeStorage`/`chatStorage` and created no write-back save;
- deleting the short-lived operation result and operation-state rows returned
  `found=false` with `operationState=input-completed`, the durable server commit
  receipt, and the same authoritative projection;
- blank storage adoption was repeated successfully after those short-lived
  rows were removed, with client save and ACK counters still 0.

## 4. Transaction failure matrix

The composed child injected six failures:

| Failure point | Observed result |
| --- | --- |
| Chat journal write | Full transaction rollback |
| Commit-sequence write | Full transaction rollback |
| Canonical metadata state | Full transaction rollback |
| Prompt-effect resolution | Full transaction rollback |
| Committed operation-state write | Full transaction rollback |
| Commit recovery-record write | Full transaction rollback |

For every case, the provider and commit counters were each 1; client save,
result ACK, and fallback provider counters were 0. At the commit failure
boundary, the exact volatile settings context count remained 1. The normal
chat contained the durable input but no assistant response, and the retained
result remained classified as server-owned with a failed server commit.

## 5. Restart boundaries

### 5.1 Attached input before provider completion

The child was killed after input attachment while the deterministic provider
gate remained closed. On restart, the normal chat contained the durable user
input, status was `input-attached`, and provider/commit counters remained 0.
This confirms input recovery without claiming model execution resumption from
lost process-memory settings.

### 5.2 Commit transaction before publication

The child was killed at the first post-transaction publication call. On
restart, startup recovery returned `chat-committed`, restored the canonical
assistant message, and invoked neither provider nor commit again.

### 5.3 Canonical publication before result marker

The child was killed immediately before the input owner's published-result
marker. Restart reconciliation preserved the committed chat and completed the
marker path without provider or commit replay.

### 5.4 Causal N+1

While N waited at the provider gate, N+1 was admitted with the current
input-only revision and returned `input-waiting-predecessor`. A third
nonterminal command was rejected. N then committed, N+1 advanced from the
published predecessor and attached its input, and the child was killed before
the N+1 provider call. Restart restored base input, response N, and input N+1
in order; N+1 remained `input-attached`, with provider and commit counters 0.

This is the intended capability-0 restart boundary. It does not claim that
secret-bearing settings or paid generation resume across process loss.

## 6. Source and artifact changes

H1 adds test-only owned files:

- `server/node/bgServerChatProcessPreload.cjs`
- `server/node/bgServerChatProcessClient.cjs`
- `server/node/bgServerChatProcessBoundary.test.ts`
- `src/ts/storage/bgServerChatProcessAdoption.test.ts`

The adapter version changes from 0.7.0 to 0.7.1. No production implementation
unit changed. The generated installers remain byte-identical to each other:

- size: 8,327,213 bytes;
- mode: 0755;
- SHA-256: `b3eab53d687d0bda5f9d8cc82aa09493945f1a61af4d1f8f7d08f2b500162012`.

## 7. Verification receipt

| Gate | Observed result |
| --- | --- |
| H1 process suite | 1 file, 11/11 tests passed; clean repeat passed |
| Focused owner/route/process | 4 files, 61/61 tests passed |
| Complete server | 29/29 files; 313 passed, 12 skipped |
| Patcher source | 52/52 files passed |
| Installer reproducibility | Two consecutive builds byte-identical |
| Complete graph | 40 packs, 1,007 units, 358 managed paths, 13 ordered collisions |
| Immediate re-plan | 0 changed files |
| Exact revert | Target Git tree clean; delivery disabled; empty custom intent |
| Final disposable target | clean official source with no enabled patch intent |

The first restricted route run retained the expected `listen EPERM` output.
The same exact target and test passed through the approved loopback runtime.

## 8. Remaining boundary

H1 closes the AC-off composed Node process dependency. It does not close:

- actual browser-process exit or browser restart;
- ordinary composer opt-in, automatic drain, or pending UI;
- receipt-scoped predecessor effect provenance;
- joined owner/result/input/context retention;
- Archive Center transport, context consumers, output parity, or lifecycle;
- controlled live apply, iPhone L3, tag, or release.

The next dependency is H2: strict authenticated Archive Center context
transport, claim/prepare/context joining, captured-only production consumers,
prompt snapshotting, and context release/retention.
