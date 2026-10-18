# 2026-10-18 — R3: client-build fence and session ownership gates (C-04, C-06)

Status: focused investigation. No code, manifest, test or existing report was
changed. Revision and composed tree are the same as R1 and R2: baseline
`3242c30`, PocketRisu `v1.10.0` (`98e9683`). Sources: consolidated plan C-04,
C-06 and D-8; unified screening US-2 and US-3. Line numbers refer to the
composed tree (`bgOrchestrate.ts` and `server.cjs` are layered composites).

Evidence for this report:

- a static enumeration of every caller;
- `isWriterRoute()` evaluated in node on the real module;
- `createSessionLock()` evaluated with a fake clock.

No suite was re-run.

## 1. Answers in brief

1. Of the four routes, **three can be fenced without risk now**. `claim`,
   `attach` and `abandon` have one production caller each, and each goes
   through `clientBuildFetch`.
2. **`POST /api/bg-orchestrate` cannot be fenced as is.** It has two
   production callers. The server-input Send sends the header. The legacy
   delegated start uses a bare `fetch`, which sends **no** `x-client-build`.
   With the fence enabled, that call would answer 426 to every current
   client. This path serves every `sendChat` that is not a server-owned
   input, and its start loop would retry an ambiguous 426 until the 15-minute
   watch deadline, with no client fallback. That would be a near-total outage
   of non-input generations.
3. **D-8:** fence all four routes, but the start route only after its legacy
   caller switches to `clientBuildFetch`, in the same change. Both start
   loops should treat a 426 as a definitive non-start. No route needs a
   permanent exemption; the only exemption is the server's own in-process
   drain, which never crosses HTTP.
4. **C-06:** adding `checkActiveSession` to `PUT /api/external-request-headers`
   alone changes nothing. The settings page sends no `x-session-id`, and the
   session lock passes every request without an id (confirmed). The fix needs
   the client to send the session headers and to handle a 423. The two
   comparable settings writers have the same client gap (§4).

## 2. C-04 — call-site inventory

| Route | Server classification (`isWriterRoute`, evaluated) | Production caller | Sends `x-client-build` | Retries and fallbacks |
|---|---|---|---|---|
| `POST /api/bg-orchestrate` (server-owned input) | not fenced | `tryRunServerOwnedInput` → `deps.start` `bgOrchestrate.ts:1086` (`lazy-chat-bg-adapter` unit, `manifest.cjs:1332`) | **yes** (`clientBuildFetch`) | Every retry goes through the same `deps.start` (`reconcileServerInputStart`, `bgServerInputStart.ts:29-75`). Blocked-input retry and client-prepared recovery (`claimClientInputRecovery` → `tryRunServerOwnedInput`, `:1143-1146`) use the same function |
| `POST /api/bg-orchestrate` (legacy delegated chat) | not fenced | `runServerOrchestratedChat` start closure `bgOrchestrate.ts:3060-3066` (`bg-preserve` payload) | **no** (bare `fetch`) | `reconcileOrchestrationStart` (`bgOrchestrationStart.ts:145-178`). Its status and result probes (`:3098`, `:3111`) are also bare `fetch`, but they are GET requests and are not fenced |
| `POST /api/bg-orchestrate` (server re-entry) | — | input drain calls `handleOrchestrateStart` in process (`bgOrchestrator.cjs:1847-1862`) | n/a (no HTTP) | Intentionally outside the fence; it replays an envelope that was admitted earlier |
| `POST /api/bg-orchestrate-input/claim` | not fenced | `claimClientInputRecovery` `bgOrchestrate.ts:1151` | yes (`fetchOrchestrationControl` → `clientBuildFetch`, `:266-268`) | none |
| `POST /api/bg-orchestrate-input/attach` | not fenced | `attachClientInputRecovery` `:1190` | yes | none (an error is surfaced and not repeated) |
| `POST /api/bg-orchestrate-input/abandon` | not fenced | `abandonClientInputRecovery` `:1174` | yes | Best-effort; the claim expires server side |
| `DELETE /api/bg-orchestrate/:id` (reference) | **fenced** | `cancelServerOrchestratedChat`, `cancelObservedServerOperation` | yes | — |

Non-production caller: `server/node/bgServerChatProcessClient.cjs:29` posts
`/api/bg-orchestrate` without the header. It is a boundary-test helper, and
its runtime has no `dist/build-stamp.json`, so the fence is disabled there
(`clientBuildFence.cjs:99-112`). It needs no change, but a fenced test that
uses it must supply the header.

The legacy path is reached from `sendChat` (`process/index.svelte.ts:173-180`)
for every top-level generation that is not a server-owned input. That
includes regenerate, continue, slash-command sends, sends after server input
reports `unsupported`, and the blocked-retry fallthrough. Its request body
carries `currentChat`, which is a client-supplied chat, so the stale-tab
concern in US-2 applies to it as much as to `attach`.

### What a 426 does on each start path (traced)

- **Fence response.** `sendUpgradeRequired` (`clientBuildFence.cjs:87-97`)
  answers 426 with `code: CLIENT_UPGRADE_REQUIRED` and
  `commitOutcome: 'not-committed'`. A missing header is treated exactly like
  a stale one (`:106-110`).
- **Server-input start (header sent).** `clientBuildFetch` runs
  `handleClientBuildResponse`, which reloads the page, or freezes the UI with
  a recovery banner when a draft is dirty (`clientBuildHandshake.ts:241-260`).
  `reconcileServerInputStart` classifies the 426 as ambiguous. The draft and
  the `uncertain` marker are kept. This is safe, but slower than necessary.
- **Legacy start (no header).** No handshake runs. The closure throws
  `detached start ambiguous: HTTP 426`. Status then reports `missing`, the
  start is retried, and the next answer is 426 again. This repeats until
  `ORCH_DEADLINE_MS` (900 s, `bgOrchestrate.ts:174`), after which the result
  is `abandoned`, with no fallback (`:3156`). A **current** client would be
  locked out in the same way, because it never sends the header.

## 3. D-8 recommendation (fence order)

| Step | Change | Precondition | Effect if skipped |
|---|---|---|---|
| F-1 | Add `POST /api/bg-orchestrate-input/{claim,attach,abandon}` to `EXACT_WRITER_ROUTES` (`client-build-fence` pack) | none: every caller already sends the header | — |
| F-2 | Legacy start closure: `fetch` → `clientBuildFetch` (`bg-preserve` start unit; the adapter already wraps the other bgOrchestrate calls through `client-build-fence-bg-adapter:orchestration-control`) | — | F-3 becomes a send outage |
| F-3 | Add `POST /api/bg-orchestrate` to the fence | F-2 is in the same release (same `dist`) | — |
| F-4 | Both start reconcilers: a 426 whose body has `code: CLIENT_UPGRADE_REQUIRED` resolves as definitively not started (`rejected`, no fallback, draft kept). Today it counts as ambiguous | none | 15-minute spin (legacy path), or an `uncertain` marker (input path) on a stale tab |

The fence and its client callers ship in one `dist`. The only clients that
could lack F-2 after the release are stale tabs, and the fence is meant to
refuse them. No permanent exemption is needed: the in-process drain is not an
HTTP route. Update the plan's §5 rule ("do not add C-04 routes before W0-3")
to read: **F-3 only together with F-2.**

## 4. C-06 — session ownership for `PUT /api/external-request-headers`

- **Server.** `registerExternalHeaderRoutes` (`externalRequestHeaders.cjs:166-180`)
  calls `checkAuth` only. It is fenced, because `isWriterRoute` returns
  `true` for it. Its writes are guarded by a revision check (409).
- **Client.** `ExternalHeadersSetting.svelte:20-27` sends only `risu-auth`
  through `clientBuildFetch`. It sends **no** `x-session-id` and no
  `x-user-active`.
- **Session lock.** `checkActiveSession` (`server.cjs:2002-2015`) →
  `sessionLock.checkWrite(id)` returns `{ok:true}` for an empty id ("client
  without session support"). Evaluated with a fake clock:

  | Request | Result |
  |---|---|
  | new session takes over with a user-active write | `{ok:true, tookOver:true}` |
  | old session, sends its id | `{ok:false}` → 423 |
  | old session, sends no id (this settings page) | `{ok:true}` |

- **Same client gap elsewhere.** `PUT /api/db/snapshots/limits` and
  `PUT /api/backup/server/path` do call `checkActiveSession`, but their
  callers (`SystemBackup.svelte:242-245`, `:293-294`) also omit
  `x-session-id`. Their check is therefore just as ineffective from the app.
  Only `NodeStorage.authFetch` and the import XHR send the id
  (`nodeStorage.ts:351`, `:870`, `:959`).

Recommendation (low severity, unchanged):

| Step | Change |
|---|---|
| S-1 | Expose the writer-session headers from `NodeStorage` (for example `forageStorage.sessionHeaders()` returning `x-session-id` and, when applicable, `x-user-active`). Send them from the external-header PUT and, in the same change, from the two `SystemBackup` PUTs |
| S-2 | Call `checkActiveSession` in the PUT route |
| S-3 | On 423, dispatch `risu-session-deactivated` (the existing reload path) instead of a generic error |

An id-less request still passes after S-2; that behaviour is by design for
old clients. S-1 is what makes the gate effective.

Not in scope, noted only: the BG write routes (`/api/bg-orchestrate`, the
input routes, `DELETE /api/bg-orchestrate/:id`) use `sessionAuthMiddleware`
alone (`server.cjs:1956-1960`) and no `checkActiveSession`. R2's I-8 relies
on the session lock for chat writes only.

## 5. Regression tests

| ID | Suite | Client case | Accept when |
|---|---|---|---|
| R3-1 | `clientBuildFence.test.ts` | — | `isWriterRoute` is true for `POST /api/bg-orchestrate`, `POST /api/bg-orchestrate-input/claim`, `/attach`, `/abandon`; trailing slash and case variants as in the existing rows; GET status, base and result routes stay false |
| R3-2 | fence middleware (build stamp present) | normal | Each of the four routes with the matching `x-client-build` reaches the handler |
| R3-3 | same | stale | Mismatched stamp → 426 `CLIENT_UPGRADE_REQUIRED`, `commitOutcome: 'not-committed'`; handler not called; no input record or operation state written |
| R3-4 | same | missing header | No header → 426 (same as stale) |
| R3-5 | `bgOrchestrate` / `bgFinishedOperationFlow` harness | normal, legacy path | The legacy delegated start request carries `x-client-build` (assert on the mocked `fetch` init) |
| R3-6 | `bgOrchestrationStart` and `bgServerInputStart` tests | stale | A 426 with `CLIENT_UPGRADE_REQUIRED` resolves `rejected` after one attempt; no status polling loop; no client fallback; the server-input draft is kept and its marker cleared |
| R3-7 | client-input recovery (`DefaultChatScreen` retry flow) | stale | claim → 426: `abandonClientInputRecovery` is not required to succeed; the raw input stays on the server; a frozen or reload banner is shown |
| R3-8 | compat or route test with a real `dist/build-stamp.json` | normal Send end to end | One server-input Send and one regenerate (legacy path) both start (200, `started:true`) with the fence enabled |
| R3-9 | external-header route test | inactive session | PUT with a stale `x-session-id` → 423; rules unchanged |
| R3-10 | same | active session | PUT with the active id → 200; revision advances |
| R3-11 | same | missing session header | PUT without `x-session-id` → 200 (documented old-client behaviour); the test pins it |
| R3-12 | `ExternalHeadersSetting` and `SystemBackup` component tests | normal | PUT carries `x-session-id`; a 423 dispatches `risu-session-deactivated` |

## 6. Plan updates

- **C-04:** fence classification confirmed (evaluated). Impact is now
  understood: the legacy start lacks the header. Severity stays medium. The
  W0-3 action is **done**: callers are listed in §2.
- **W3-1:** replace it with steps F-1 to F-4. F-1 can ship alone; F-3 only
  with F-2.
- **D-8:** resolved as "fence all four routes" with the ordering above; no
  permanent exemption.
- **C-06 / W3-2:** extend to S-1 to S-3. The verification is R3-9 to R3-12,
  not a server-only 423 test, because a server-only change has no effect on
  the real client.

## 7. Limitations

- Static enumeration over `src/` and `server/node/` of the composed tree.
  Plugins or user scripts that call these routes directly were not
  considered.
- The 426 behaviour of both start loops was traced, not executed. R3-6 and
  R3-8 are the executable proof.
- No shape drift between client builds was examined: only whether a stale
  build can reach the routes, not what it would send.
