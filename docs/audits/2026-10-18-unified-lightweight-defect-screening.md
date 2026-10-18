# 2026-10-18 — Unified lightweight defect screening (all 38 batches)

Status: one breadth-first screening pass. No application source, manifest,
test, build configuration or existing report was changed. This is **not** a
correctness certification. "No concern found" means only that the few paths
screened did not show one.

## 0. Cohort and method

| Item | Value |
|---|---|
| Repository | `danso0429/pocketrisu-personal-patches` |
| Baseline | `3242c3076b02159ca164ead625e5723364be58ae` |
| Batch plan | `docs/audits/2026-10-18-defect-investigation-coverage-assessment.md` on `claude/defect-coverage-assessment-2026-10-18` |
| P0 batches | Already screened in `docs/audits/2026-10-18-p0-lightweight-defect-screening.md` on `claude/p0-defect-screening-0007jw` (findings P0S-1 to P0S-5). Not re-screened here; summarized in §2 for completeness |
| Known findings not repeated | `docs/records/2026-10-18-proactive-defect-investigation.md` on `claude/bug-investigation-iz2fgk` (findings 1–6) |
| Target | PocketRisu `v1.10.0` `98e968339d1b3f91b9dac85bb3f2ebb5f90f9d14` |
| Composed tree | Pristine shallow clone plus `node dist/pocketrisu-patcher.cjs apply --root <copy> --json`, run in a scratch directory. No `pnpm install` was run |

Method: for each P1–P3 batch, read its §7 definition, then read a few
high-signal locations in the **composed** files: route guards, state
transitions, limits, persistence and identity checks. Targeted mechanical
checks were run where they were cheap:

- an awk scan of every `app.<verb>(` registration in the composed
  `server/node/*.cjs` for an auth guard;
- `isWriterRoute()` from the composed `clientBuildFence.cjs`, evaluated on the
  patch-added write routes;
- `scripts/rollback-personal-css-ui.cjs plan` against the composed tree;
- a catalog scan for `after` references to units that the CSS rollback removes.

No vitest or `npm test` run was repeated. The plan's baseline results (344
repository tests and the composed suites) and the P0 report's 363 targeted
tests stand as the regression context.

Line numbers refer to the composed tree unless a repository path is given.

## 1. Screening summary

| ID | Batch(es) | Finding | Severity | Classification |
|---|---|---|---|---|
| US-1 | CB-03 (× CB-25A, CB-01) | `scripts/rollback-personal-css-ui.cjs` cannot plan on the current catalog: composition fails with `Patch ordering cycle`. Its unit filter also drops 48 `personal-settings:editor-*` units, not only CSS ones,, including save-pipeline guards that other packs order against | Medium (the operator recovery path is unusable; it fails closed, so no data is harmed) | **Confirmed** (reproduced) |
| US-2 | CB-20 × CB-09A/B, CB-36 | The client-build fence does not cover the server-owned input writers. `POST /api/bg-orchestrate` and `POST /api/bg-orchestrate-input/{claim,attach,abandon}` are unfenced. `attach` writes a client-supplied chat object into canonical server state, while every other chat writer is fenced | Medium (a stale tab can still commit chat content after a deployment) | Fence classification **confirmed**. Real-world impact is strongly suspected, not reproduced |
| US-3 | CB-26 × CB-36 | `PUT /api/external-request-headers` checks auth and the build fence but not `checkActiveSession`. Comparable settings writers (`PUT /api/backup/server/path`, `PUT /api/db/snapshots/limits`) check it | Low | **Confirmed** (static) |
| US-4 | CB-06 | Draft upsert (`POST /api/bg-stream-draft`) is unfenced, but its delete is fenced. Drafts have no TTL and are not removed when a chat is deleted | Low | Strongly suspected (static) |
| US-5 | CB-35 | `extractThoughts` rescans for the next open tag on each close tag. Deeply nested `<Thoughts>` input costs O(n·k) | Low (needs a crafted response) | Requires investigation |

The P0 findings stay as they were reported: P0S-1 (High), P0S-2 (Medium),
P0S-3 (Low–medium), P0S-4 (Unknown) and P0S-5 (design observation).

## 2. Coverage table (38 batches)

"Screened" lists only what was read or run. A blank concern means none was found in that sample.

| Batch | Pri | Screened | Concern | Result |
|---|---|---|---|---|
| CB-02 | P0 | See P0 report | Part of P0S-1 (shared send predicate) | P0 report |
| CB-05 | P0 | See P0 report | P0S-5 | P0 report |
| CB-09A | P0 | See P0 report | **P0S-1** | P0 report |
| CB-10 | P0 | See P0 report | P0S-4 | P0 report |
| CB-11 | P0 | See P0 report | Client side of P0S-1 | P0 report |
| CB-15 | P0 | See P0 report | P0S-3 | P0 report |
| CB-16 | P0 | See P0 report | — | P0 report |
| CB-18 | P0 | See P0 report | — | P0 report |
| CB-19 | P0 | See P0 report | P0S-2 | P0 report |
| CB-04 | P1 | Not opened beyond the plan; relies on its 17 existing tests | — | Not screened in depth |
| CB-06 | P1 | `bgDraftRoutes.cjs` (all), `bgStreamJob.cjs` routes and persistence (`:176-216`, `:300-458`), draft client path map (`bgStreamPreserve.svelte.ts`) | US-4. `persistDraft` respects client cancel and skips sub-calls. Sub-results have TTL purge and an exact ACK with UUID validation | Minor concern |
| CB-07 | P1 | Cache entry scope in `geminiContextCache.ts` (`credentialFp` stored and compared at `:353`, disable scoped per credential at `:243`) | — | No concern in the sample |
| CB-09B | P1 | Only the server end of client-prepared input (`bgOrchestrator.cjs:1880-1918`) | Shares US-2. The 10-17 circular-Stop re-check was **not** done | Partial |
| CB-12 | P1 | `bgPluginSandbox.cjs` launch (`:40-135`): systemd scope with memory, task and CPU caps, `prlimit`, `bwrap --unshare-all --cap-drop ALL --clearenv`, `node --permission` with read access limited to the worker; worker `vm` context and RPC timeouts | — | No concern in the sample. RPC method validation per call was **not** checked |
| CB-14 | P1 | `modelCredentialResolution.ts` (all) compared with upstream `modelPresetBinding.ts:290-303` | Same resolution order as upstream; a dangling `apiKeyRef` falls through to the inline credential as upstream does | No concern |
| CB-17 | P1 | Startup cache revalidation (`startupDatabaseCache.ts`) and the server `x-db-etag` source (`server.cjs:129-184`, content hash of the encoded database) | — | No concern in the sample |
| CB-20 | P1 | `clientBuildFence.cjs` (all); `isWriterRoute` run on 12 patch-added write routes | **US-2** | Concern |
| CB-21 | P1 | `charxArchive.ts` limit and name checks (entry count, per-entry and aggregate bytes, JPEG prefix bound, `.`/`..`/empty segment refusal, size-versus-directory check) | — | No concern in the sample. Crafted-archive probes **not** run |
| CB-22 | P1 | `scripts/fastimport-ios-migration.cjs` apply path: `--confirm-stopped`, explicit backup key, compare inside the transaction, backup readback, `quick_check`, reopen verification, verified rollback | — | No concern |
| CB-26 | P1 | `externalRequestHeaders.cjs` (all): https-only destinations, forbidden header set, HMAC values, per-hop rule matching on redirects, cross-origin credential stripping | US-3 | Minor concern |
| CB-27 | P1 | `keiSseStream.ts` (all); OpenAI consumer `requests.ts:1240-1275` | Lenient behaviour: it dispatches the last unterminated event at EOF and strips a BOM on every line. Malformed data is dropped by the consumer's `try/catch` | No defect |
| CB-28 | P1 | `keiPartialEditIdentity.ts` key check only | — | Not screened in depth |
| CB-31 | P1 | Not opened | — | Not screened |
| CB-32 | P1 | `pageFoldFontCache.cjs` (pinned SHA-256, atomic install, verified re-read); `pageFoldPdfService.cjs` limits (2 MiB source, 8 pages, 1 concurrent, bounded queue, worker heap and time limits); route guard (`checkAuth` + `checkActiveSession`) | — | No concern in the sample |
| CB-36 | P1 | Guard scan of every route in the composed server modules; `request-logs.cjs` guard wiring (`server.cjs:4172`); PageFold and external-header routes | All patch-added routes reach `sessionAuthMiddleware` or `checkAuth`. US-2 and US-3 relate here. Parameter-traversal and oversized-body probes **not** run | Partial |
| CB-01 | P2 | Not re-read; known findings 2–5 stand | — | Known findings only |
| CB-03 | P2 | All 7 non-probe scripts listed; `rollback-personal-css-ui.cjs` read and run (`plan`); `import-bg-preserve.cjs` write path | **US-1** | Concern |
| CB-08 | P2 | Not opened | — | Not screened |
| CB-13 | P2 | Notification claim/ack routes (`server.cjs:7727-7740`) and the lease/token/TTL/capacity logic in `bgNotifications.cjs` | — | No concern in the sample |
| CB-23 | P2 | Not opened | — | Not screened |
| CB-24 | P2 | Not opened | — | Not screened |
| CB-25A | P2 | Only the unit-dependency side, through US-1 | Touched by US-1 | Not screened in depth |
| CB-29 | P2 | `translationCacheStore.ts` key comparison only | — | Not screened in depth |
| CB-34 | P2 | `usagePricing.ts` cost formula and guards; Gemini usage mapping (`googleGemini.ts:603-638`; thoughts are added to output, and inconsistent totals are flagged) | — | No concern |
| CB-35 | P2 | `thoughts.ts` (all); size of `whenExpression.ts` and `chatML.ts` only | US-5 | Minor lead |
| CB-25B | P3 | Not opened | — | Not screened |
| CB-30 | P3 | Not opened | — | Not screened |
| CB-33 | P3 | Not opened | — | Not screened |

## 3. Findings

### US-1 — CSS UI compatibility rollback cannot run (confirmed)

**Evidence.**

```
node scripts/rollback-personal-css-ui.cjs plan <composed tree>
→ PatchCompositionError: Patch ordering cycle: lazy-chat-bg-adapter:notifications:owner:1.10, …,
  personal-settings:editor-asset-references-client, personal-settings:editor-asset-references-server,
  personal-settings:editor-asset-remap, …
```

**Root cause.** `compatibilityCatalog()` (`scripts/rollback-personal-css-ui.cjs:14-24`)
adds every other unit on the same file to the `after` list of the three
retained units. Other packs' units already order themselves after those
retained units. For example, `lazy-chat-bg-adapter:notifications:owner:1.10`
in `server/node/server.cjs` lists `personal-settings:editor-asset-references-server`
in its `after`. The two edges form a cycle.

**Secondary issue.** The filter `unit.id.startsWith('personal-settings:editor-')`
drops 48 units (51 match the prefix and 3 are retained). The removed units include save-path
units that have nothing to do with the CSS UI: `editor-save-import`,
`editor-patch-refusal`, `editor-no-full-fallback`, `editor-full-buffer-required`,
`editor-no-conflict-rebase`, `editor-full-write-etag` and `editor-flush`. A
catalog scan found 63 `after` references to dropped units. 40 of them come
from other packs: `lazy-chat-bg-adapter` (`recovery-read:*`, `queue:*`,
`notifications:*`) and `haejeok-persistence-safety-adapter`. If the cycle were fixed alone, the rollback could still
strip persistence safeguards or break anchors.

**Why tests miss it.** `test/personal-settings.test.cjs:420` checks only
`rollbackSummary` formatting on a synthetic transition. No test plans the
rollback against the real catalog.

**Impact.** The rollback is documented as the operator recovery path. Today it
fails before any write, so it fails closed.

### US-2 — Server-owned input writers sit outside the build fence (confirmed classification)

**Evidence.** `isWriterRoute()` returns false for `POST /api/bg-orchestrate`
and for `POST /api/bg-orchestrate-input/claim|attach|abandon`. It returns true
for `POST /api/chat-content/*`, `POST /api/patch` and
`DELETE /api/bg-orchestrate/:id`. No handler checks `x-client-build` itself:
grepping `bgOrchestrator.cjs`, `serverChatInputOwner.cjs` and
`bgStreamJob.cjs` finds no match.

`attachTransformed` (`serverChatInputOwner.cjs:1254-1310`) clones
`req.body.chat` and validates only its id, that `message` is an array, and
that exactly one user message carries the admitted ID. The chat then becomes
the attachment base for canonical commit.

**Why it matters.** The plan's completion criterion for CB-20 asks that every
write path be classified as fenced or *intentionally* unfenced. These routes
are neither in the fence nor documented as exempt. A tab that predates a
deployment can still start a server-owned operation and attach a chat with
the old shape. Every other path is refused with 426.

**Not verified.** Whether the client always sends `x-client-build` on these
calls (which would make adding them to the fence cheap). Whether any shape
drift exists between recent builds. Whether `latest-v1` attachment
resolution (`resolveInputAttachment`) would catch a malformed chat.

### US-3 — External header save bypasses the session write lock (confirmed, low)

`registerExternalHeaderRoutes` (`externalRequestHeaders.cjs:166-180`) calls
only `checkAuth`. Comparable settings writers also call `checkActiveSession`.
A deactivated tab could therefore overwrite header rules. The revision check
(409) limits the damage to a tab that holds the current revision.

### US-4 — Draft lifecycle asymmetry (strongly suspected, low)

`POST /api/bg-stream-draft` is not a fenced writer, because `sendBeacon`
cannot set headers. `POST /api/bg-stream-draft/delete` is fenced. A stale tab
can create drafts but cannot dismiss them until it reloads. The route's own
comment says drafts are bounded by chat count, but `server.cjs` never removes
`bg-stream-draft:` keys on chat deletion. Drafts of deleted chats stay until
a client dismisses them.

### US-5 — `extractThoughts` complexity (requires investigation)

`thoughts.ts:27-44` calls `indexOf` for both tags on each step. With many
nested opens before the first close, each step rescans the input. The cost is
quadratic only for crafted, deeply nested output. A timing probe was not run.

## 4. Highest-value candidates for deeper investigation

1. **P0S-1** (from the P0 report): still the only High item. A stuck
   non-terminal input blocks the chat.
2. **US-2**: decide intent. Then either add the four routes to
   `isWriterRoute` and pin them with a fence test, or document them as exempt.
   Check the client headers first.
3. **US-1**: rebuild the rollback filter on an explicit unit list and add a
   test that plans against the real catalog. Until then, record that the
   rollback is unavailable.
4. **P0S-2 / P0S-4**: restore versus concurrent writes, and reset hooks
   versus in-flight runs.
5. **CB-36 probes not run**: traversal-shaped `charId`/`chatId`/`operationId`
   values against the routes that build kv keys from them, and oversized
   bodies on `/api/bg-stream-job` (`bodyBase64` is bounded only by the global
   100 MB JSON parser, `server.cjs:997`).
6. **Batches not screened** (CB-08, 23, 24, 25B, 30, 31, 33) and those with
   only a token look (CB-04, 28, 29). CB-31 (credentials, cost) comes first.

## 5. Limitations and skipped verification

- Breadth pass only. Most batches got 1–3 locations; 7 batches were not
  opened, and 3 got only a token look.
- No vitest, `pnpm check`, `pnpm build` or `npm test` was run, and
  dependencies were not installed. No browser, device or systemd probe was run.
- US-2 and US-4 are static traces. Their runtime impact was not reproduced.
- The auth scan is heuristic: a 40-line window after each registration. It
  confirms that a guard is present, not that the guard is correct.
- `bg-preserve.json` provenance (private upstream) cannot be verified here,
  as the plan notes.
- P0 rows restate the P0 report. They were not re-verified.

## 6. Overall risk assessment

The security boundaries that were screened are sound for a single-owner
self-hosted server: route authentication, the plugin sandbox, external
headers, archive limits, PDF and font handling, and the migration script.
Across the repository, the main risk is still the persistence and recovery
core covered by the P0 report: P0S-1 can leave a chat unable to generate.

This pass adds two medium-risk consistency gaps. The operator CSS rollback is
broken by catalog growth (US-1, confirmed). The build fence omits the
server-owned input writers (US-2). Both are cheap to fix and test. The
remaining items are low severity.

Large client-side areas (orchestration merge, PageFold client, organizers,
Kei UI) were not screened in depth. The repository should not be considered
free of defects.
