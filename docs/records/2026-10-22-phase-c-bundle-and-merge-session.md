# 2026-10-20 to 2026-10-21 — Phase C bundle (client-build fence, settings session, fmIndex, probe namespace) and the merge into main

Status: working record of the second part of one session (2026-10-20 03:16 UTC to 2026-10-21 about 23:10 UTC), continuing directly from `docs/records/2026-10-20-phase-b-b2-b3-session.md`. In this period the Phase B record was committed, the post-Phase-B bundle (units C-1 to C-5: Phase C fence items F-1 to F-4, settings session items S-1 to S-3, backlog item C-21 and the probe-script marker namespace) was planned, reviewed, tested, implemented and committed, an iOS clipboard report was recorded, and Phase A, Phase B and the bundle were pushed to `main` as a fast-forward together with a README update. Nothing in this record was applied to a live installation or verified on a phone. No tag or release was created; stable remains `v0.2.3`.

Times are UTC unless stated otherwise. No chat content, character names, identifiers or credentials are recorded. All validation used synthetic data.

## 0. Where everything is

| Item | Value |
|---|---|
| Branch | `claude/phase-b-storage-reset` |
| Start of this period | `0451de9` (B3-4, patcher `0.2.4-experimental.78`), record not yet committed |
| Code head after the bundle | `83496a9` (patcher `0.2.4-experimental.82`) |
| Head after this period | `902148a` (README update) |
| `origin/main` before | `c7945b9` |
| `origin/main` after | `902148a` (pushed as two fast-forwards: `c7945b9..83496a9`, then `83496a9..902148a`) |
| Target | PocketRisu `v1.10.0` (`98e968339d1b3f91b9dac85bb3f2ebb5f90f9d14`) |
| Stable | `v0.2.3` (unchanged) |

Commits added in this period (oldest first):

| Commit | Content | Patcher version | Pack versions after the commit |
|---|---|---|---|
| `a0ecba2` docs(records): record the Phase B B2 and B3 session | Phase B record | `.78` | — |
| `6fcce9b` fix(fence): require the current client build for input recovery routes | C-1 | `.79` | client build fence 0.1.2 |
| `8282e99` docs(records): record the iOS copy-button URL-encoding report | report record | `.79` | — |
| `0696e4f` fix(fence): fence background starts and stop on a client upgrade answer | C-2 | `.80` | client build fence 0.1.3, client build fence BG adapter 0.1.2, BG adapter (`lazy-chat-bg-adapter`) 0.7.76 |
| `029ea09` fix(settings): check the writer session on settings writes | C-3 | `.81` | personal settings 0.5.15, `personal-settings-lazy-session-adapter` 0.1.0 (new), `client-build-fence-lazy-session-adapter` 0.1.0 (new) |
| `502dd28` fix(lazy-chat): create and import chats with fmIndex | C-4 | `.82` | BG adapter 0.7.77, lazy chat sync 0.5.19 |
| `83496a9` test(probes): wait on the v4 server-input marker namespace | C-5 | `.82` (scripts only) | — |
| `902148a` docs(readme): describe main through 0.2.4-experimental.82 | README | `.82` | — |

The push `c7945b9..83496a9` carried 24 commits: Phase A (`eec13a9`, `a50d20e`, from branch `claude/phase-a-c01-orphan-input`, already contained in this branch), Phase B (B1a, B1b, B2, B3 and their design documents and record) and the bundle.

Authority used for the scope (all in this repository unless stated):

- Phase B record: `docs/records/2026-10-20-phase-b-b2-b3-session.md`, §4 D5, §10 limit 10, §12.
- Final correction handoff §3 Phase C (F-1–F-4, S-1–S-3, acceptance R3-1–R3-12), branch `claude/final-correction-handoff-2026-10-18`.
- R3 evidence report §2–§5 (`docs/audits/2026-10-18-r3-client-build-and-session-gates.md`), branch `claude/r1-restart-recovery-investigation-d1r7in`.
- C-21 in `docs/audits/2026-10-18-phase-b-design-decisions.md`.
- The BG ordered-goals document, §13 (kept in a separate planning repository): the follow-up step that holds the remaining correction items.

## 1. Requested scope

In the order the owner gave it:

1. Record the Phase B session, with its remaining limits, in English under `docs/records`, from this session's work only, detailed enough for a reader who has not seen the session.
2. Explain backlog item C-21 in plain terms, then start the bundle: Phase C (fence F-1–F-4, settings session S-1–S-3), C-21 and the probe-script namespace, as one bundle before BG work resumes (decision D5 of the Phase B record). Investigation for all units first, then implementation.
3. Record a user report about the iOS copy button (no investigation).
4. Clean up the disk after the owner pointed out that it was almost full.
5. After the bundle: merge Phase A, Phase B and the bundle into `main` (push approved separately), then have Codex update the README from the records (push approved separately).
6. Record this period in `docs/records` with everything needed to continue (this file).

Late in the period the owner decided that BG G2.2 continues in a separate session, because this session's context had grown large. The G2.2 work (baseline refresh and plan review) was therefore not started here.

## 2. Method

### 2.1 Roles

| Role | Used for |
|---|---|
| Main session (Claude Opus) | interpretation, plan, risk classification, decisions, reviewing every delegated result, label checks, gates, commits, pushes after approval |
| `haiku-explorer` subagents (two) | read-only exploration of the composed tree: fence list, start callers, 426 handling and settings PUT owners; C-21 chat creation paths |
| Codex `gpt-6-astra` (read-only) | plan review of the bundle (one round) |
| Gemini 4 Argon via the Antigravity CLI | test scenarios from the plan only (one request, `SUCCESS`, 23 scenarios) |
| Codex `gpt-5.6-sol` (workspace-write) | blind tests for C-1–C-4 in one batch, plus one correction round through `codex exec resume` |
| `sonnet-implementer` | C-1 (classified normal: one route-list change) and C-5 (scripts only) |
| `opus-implementer` | C-2, C-3, C-4 (risky), a fresh agent per unit; the C-4 correction went to the same C-4 agent |
| Codex `gpt-6.1-sol` (read-only) | code review of every unit diff (five reviews) |
| `validation-runner` subagents (two) | browser and HTTP validation of C-2 (with C-1 rows) and of C-3 and C-4 on built candidates |
| Codex `gpt-6.1-sol` (workspace-write) | README update, at the owner's request |

Every implementation and validation brief was written to a file and handed over by path. No implementer was reused across units (owner instruction).

### 2.2 Test tree and gates

- Test tree: a clone of pristine PocketRisu `v1.10.0` (`98e9683`) copied into a scratch directory, `node dist/pocketrisu-patcher.cjs apply --root <copy> --json`, `pnpm install --frozen-lockfile`; tests run with `NODE_OPTIONS=--no-experimental-webstorage`. Browser candidates additionally ran `pnpm build` and `node server/node/bgOrchBundle.build.cjs` (section 10).
- Gates per commit, run by the orchestrator with the local candidate-gates script (outside this repository, described in the Phase B record §8): installer built twice and compared, mode 755, `node --check`; `node --test test/*.test.cjs`; composed `pnpm test` (client and server configurations), `pnpm test:compat`, `pnpm check`, `pnpm build`, the BG bundle build; apply then revert on a second fresh copy with empty diff and porcelain; the worktree `dist` compared with the pinned installer (identical in every run).
- Baseline at `0451de9`: client 2615 passed / 4 skipped, server 763 / 12, compat 123 / 5, `pnpm check` 0 errors / 0 warnings, repository tests 344 run / 341 passed / 0 failed / 3 skipped.
- Per commit: package version bumped, every changed pack's version bumped, CHANGELOG entry at the top, `dist` rebuilt, version assertions updated where the asserted pack changed (`test/bg-independent-g1.test.cjs`, `test/g22a-capability.test.cjs`, `test/lazy-chat-sync.test.cjs`, `test/personal-settings.test.cjs`).
- Composition variants were checked for every unit that touches optional packs: the profile without `lazy-chat-sync` (the resolver also drops `character-import-ux`; 35 packs, 350 changes, called NOLAZY below), without `personal-settings`, without `character-import-ux`, and the transition from the full composition to NOLAZY.

### 2.3 Blind tests, labels and parking

- The plan's unit table was the closed label list: C-1 Fence the client input recovery routes · C-2 Fence the start route with the legacy start on the build handshake · C-3 Writer session on settings writes · C-4 Chats created with fmIndex -1 · C-5 Probe scripts on the v4 marker namespace. C-5 had no blind tests (script check only).
- Each unit's tests sit in exactly one `describe('[<ID>] <title>', ...)` block per file. Labels were checked on receipt and before each commit; no violations occurred.
- The batch was written for all four units at once. Only the C-1 files and their registration stayed in the worktree; the other files (and the manifest registration lines, as diffs) were parked outside the worktree with SHA-256 records and restored at the start of their own unit. `test/phase-c-bundle.test.cjs` holds blocks for C-2, C-3 and C-4; it was committed with only the C-2 block in `0696e4f`, extended with the unchanged C-3 block in `029ea09` and with the C-4 block in `502dd28` (the committed prefix was compared with the parked file each time).
- Before each commit the fixed test files were compared with the parked copies (`cmp` or hash) to confirm the implementer had not modified them.

## 3. Timeline

| Time | Event |
|---|---|
| 10-20 03:16–03:24 | Phase B record written and committed (`a0ecba2`); two explorers investigated the bundle in parallel. |
| 03:24–03:27 | C-21 explained to the owner; quota situation reported (Claude weekly 93%, Codex weekly 81%). The owner chose to investigate everything first and continue immediately, stopping at a unit boundary if a limit is reached. |
| 03:27–03:37 | Ownership of S-1/S-3 resolved (new adapter packs); bundle plan written; Astra plan review (5 findings, all adopted). |
| 03:38–03:56 | Argon scenarios (23); Codex blind test batch (25 tests in 6 files). |
| 03:56–05:12 | C-1: implementation, code review, first gate run failed on `pnpm check` (type errors in a fixed test), test-author correction, gates passed, commit `6fcce9b`. |
| 05:13–05:54 | C-2: implementation, code review and gates ran; Claude weekly usage reached 99% at 05:47, so the result reading and the commit were deferred. A wait for the weekly reset was started with the local quota wait script. |
| 10-20 13:04 | The owner reported the iOS copy-button problem; a symptom-only analysis was given; the following requests hit the weekly limit. |
| 10-21 18:01 | Weekly reset; disk cleanup (36 GB of scratch removed). |
| 19:13 | iOS report recorded (`8282e99`). |
| 19:22 | C-2 gate and review results read; C-2 committed (`0696e4f`); C-2 browser validation started on that commit. |
| 19:49–20:17 | C-2 validation passed; C-3 implemented, reviewed, gated, committed (`029ea09`). |
| 20:17–21:57 | C-4 implemented, corrected once, reviewed (no findings), gated, committed (`502dd28`). The main session's context was compacted during this unit (about 21:29). |
| 21:58–22:30 | C-3 and C-4 browser validation (9/9 passed). |
| 22:30–22:33 | C-5 implemented, reviewed (no findings), committed (`83496a9`). |
| 22:35 | Push `c7945b9..83496a9` after owner approval; remote read back equal. |
| 22:37–23:01 | Claude 5-hour window at 99%; waited for the 23:00 reset with the local quota wait script. |
| 23:01–23:06 | README updated by Codex, reviewed, committed (`902148a`), pushed after owner approval; remote read back equal. |
| after 23:06 | Local default checkout fast-forwarded; planning repository swept, §13 updated and pushed (section 9.5); this record written. |

## 4. Facts established before planning

Checked by exploration in the composed tree of `0451de9` (line numbers are composed-tree positions):

- Fence: `server/node/clientBuildFence.cjs:11-45` `EXACT_WRITER_ROUTES` (file owned whole by `client-build-fence`; other packs add hunks to it). `isWriterRoute` (:64-85) covered `DELETE /api/bg-orchestrate/:id` but not `POST /api/bg-orchestrate` nor the input claim, attach and abandon routes. `sendUpgradeRequired` answers `426 {code:'CLIENT_UPGRADE_REQUIRED', commitOutcome:'not-committed', expectedBuild?}`; a missing build header counts as stale. The three settings PUTs (`/api/external-request-headers`, `/api/db/snapshots/limits`, `/api/backup/server/path`) were already fenced.
- The fence reads the build stamp from `process.cwd()/dist/build-stamp.json` (`client-build-fence/manifest.cjs:759`); without that file the fence is disabled.
- Legacy delegated start (`src/ts/bgOrchestrate.ts:3182-3198`): a plain `fetch('/api/bg-orchestrate')` with `writerSessionHeaders()` and the B2-2 423 branch (Phase B unit `lazy-chat-bg-adapter:session-gate:legacy-start:1.10`; the plain fetch text comes from the `bg-preserve` payload). `clientBuildFetch` was already imported into `bgOrchestrate.ts` by `client-build-fence-bg-adapter` (requires `client-build-fence` and `bg-preserve`). A 426 at that time: the legacy start threw "detached start ambiguous: HTTP 426", status reconciliation found `missing`, and the start was retried until the 900 s deadline (no fallback). The server-input start already used `clientBuildFetch`, so the handshake ran (reload, or a frozen state with a recovery banner when a draft is dirty), but `reconcileServerInputStart` treated the 426 as ambiguous.
- Claim, attach and abandon already went through `fetchOrchestrationControl` → `clientBuildFetch`.
- `bgServerChatProcessClient.cjs` (a test helper) posts the start without the build header; its runtime has no build stamp, so the fence is off there. The internal input drain calls the handler in-process (no HTTP).
- External headers: server `registerExternalHeaderRoutes(app, checkAuth, owner)` — GET and PUT called `checkAuth` only. The client page `ExternalHeadersSetting.svelte` used `clientBuildFetch` without session headers. SystemBackup's two PUTs (hunks owned by `client-build-fence`) used `clientBuildFetch` without session headers; their server routes already called `checkActiveSession`. `checkActiveSession` is upstream code in `server.cjs` (present without `lazy-chat-sync`); `writerSessionHeaders()` and `notifySessionDeactivated()` live in `lazy-chat-sync`'s `writerSession.ts` (Phase B).
- C-21: none of the creation paths set `fmIndex` uniformly — the character default chats in `characterCards.ts` (two sites, file managed by `character-import-ux`), `createBlankChar` and the `characterFormatUpdate` empty-chats default in `characters.ts` (upstream, no pack), the HTML chat import (`characters.ts`, `normalizeChat(json)` without `fmIndex ??= -1`; the jsonl and risu imports already set `-1`), the chat-package import (`characterPackage.ts`, `character-import-ux`), and the server's reset default chat in `storageResetPrepare.cjs` (`lazy-chat-sync`). `normalizeChat` sets no `fmIndex`. The new-chat buttons and the chat placeholder already used `-1`.
- `fmIndex` readers: strict `=== -1` checks treat an absent value as "greeting index"; `cbs.ts:415` (`{{firstmsgindex}}`) calls `chat.fmIndex.toString()` and throws on `undefined` (read in code, not executed at planning time). `characterFormatUpdate` fills `fmIndex ??= cha.firstMsgIndex ?? -1` on the local copy when a character is selected.
- Why C-21 matters: the BG revision function (`orchestrationChatRevision`) counts "absent" and `-1` as different values, so before the first save of a new character's first chat the local and server revisions differed. Effects named in the Phase B design: a send blocked with `local-chat-changed`, and a cancelled-input marker that could stay for up to 49 h. The Phase B design counted 8 of 82 chats in one installation in this state, all the single first chat of a character.
- Probe scripts: `scripts/probe-bg-stream-preview.mjs`, `scripts/probe-bg-failure-ui.mjs` and `scripts/probe-bg-marp-lifecycle.mjs` read or waited on `bg-server-input-v3:` (14 sites).

## 5. Owner decisions in this period

| # | Decision |
|---|---|
| E1 | The bundle comes before BG work resumes; then Phase A, Phase B and the bundle are merged into `main` (restating Phase B decision D5). |
| E2 | C-21 is owned by `lazy-chat-bg-adapter` (one new unit file with hunks on every client creation path, including upstream files no pack owns); the server's reset default chat is fixed in `lazy-chat-sync`, which owns `storageResetPrepare.cjs`. |
| E3 | The client side of S-1/S-3 lives in two new internal adapter packs that activate only when both of their packs are present (`userSelectable:false`, `requires` plus `autoWhen.all`): one for `personal-settings` × `lazy-chat-sync` (external headers page), one for `client-build-fence` × `lazy-chat-sync` (the two SystemBackup PUTs). S-2 (the server check on the external-headers PUT) goes into `personal-settings` itself. |
| E4 | Investigation for all units first, then implementation, starting immediately despite the weekly quota level; stop at a unit boundary if a limit is reached. |
| E5 | Remaining limits are recorded in English in `docs/records`. |
| E6 | Standing from Phase B (D1): `POST /api/bg-orchestrate-input/abandon` and `DELETE` (cancel) are not session-gated. |
| E7 | After the weekly reset: resume at C-2. A proposed memory entry for the scratch cleanup habit was not created. |
| E8 | Push `c7945b9..83496a9` approved; afterwards, Codex updates the README from the records; the README push `83496a9..902148a` approved. |
| E9 | BG G2.2 continues in a separate session; this session ends with the README and this record. |

Decisions taken by the orchestrator within the approved scope (each explained in section 7): C-1 classified normal; the server-input coded 426 keeps the existing generic rejected-input notice; the C-4 JSON v2 import unit kept; the C-4 format-update default changed to `cha.firstMsgIndex ?? -1`; coverage gaps from the C-2 and C-3 code reviews covered by browser validation instead of new automated tests.

## 6. Plan, plan review, scenarios and blind tests

### 6.1 Plan

Five units, one commit each, in table order. Risk: risky (multi-file, client and server, install/revert, new packs); C-1 and C-5 were later implemented as normal-risk units. Must stay unchanged for all units: Phase B behaviour (session headers, gate, invalidation, epoch, marker clearance, reset-orphaned status and results); id-less writes pass every session-checked route; fence order 426 → 503 → 423 and `503 STORAGE_RESET_IN_PROGRESS` retryable; DELETE cancel and abandon reachable; current-build Send works on both start paths; chat save, retry and rebase, the revision function and existing chats' data; packs installed without `lazy-chat-sync` keep working (no import of `writerSession.ts` from a pack that can be installed without it).

### 6.2 Astra plan review (one round, all adopted)

1. **C-4: `normalizeChat` is not a creation boundary.** It also runs on existing chats (server snapshots and save/rebase snapshots in `nodeStorage.ts`, publication in `database.svelte.ts`, plugin setters in `pluginChatAccess.ts`). A default there would change the revision of existing chats without `fmIndex` and preempt the `cha.firstMsgIndex` fill. → `normalizeChat` is not changed; `fmIndex` is set only at creation literals and at import boundaries (`??= -1` before `normalizeChat`).
2. **C-2: F-4 in `lazy-chat-bg-adapter` alone leaves a supported composition uncovered.** With `client-build-fence` + `bg-preserve` but without `lazy-chat-sync`, the lazy adapter is absent and the base payload would still treat a coded 426 on the legacy start as ambiguous (retry until the deadline). → the baseline legacy-start 426 handling goes into `client-build-fence-bg-adapter`; the server-input reconciler handling stays in `lazy-chat-bg-adapter`.
3. **C-2: ordering of F-2.** The Phase B unit `lazy-chat-bg-adapter:session-gate:legacy-start:1.10` matches a block that contains the plain `fetch`; replacing it first breaks that unit (`ANCHOR_COUNT`, reproduced in memory by the reviewer). → replace only the call line, require the fence adapter's orchestration import, and declare an optional `after` edge to the lazy unit (a required unit that is absent fails composition; an absent optional `after` id is ignored).
4. **C-2: `scripts/probe-bg-plugin-process.cjs` deliberately sends an old build stamp and expected 200 from the start.** → update its expectation to 426 within C-2.
5. **R3-8: the existing process fixture can pass with the fence disabled** (empty runtime `dist`). → put a real stamp in the runtime `dist`, assert stale and missing build → 426 and matching build → both start paths 200 `started:true`, and keep a browser-level assertion that the legacy start carries `x-client-build`.

Additions adopted with the review: register both new adapters in `src/catalog.cjs` and the explicit inventories in `test/catalog.test.cjs` and `test/resolver.test.cjs`; resolver tests for neither prerequisite, each alone, both, and direct selection of an internal pack rejected; removal of `lazy-chat-sync` from an installed composition; in all three settings writes, handle 423 (notify and return) before body parsing or generic-error handling (SystemBackup parsed the body first); pin 426 → 503 → 423 precedence on the start route and the uncoded/malformed 426 case.

### 6.3 Argon scenarios

One request (no code, no plan reasoning, no private details), status `SUCCESS`, 67 s, 13,668 tokens. 23 scenarios: C-1 5, C-2 7, C-3 5, C-4 6, with eight marked as most likely to catch a defect (zero side effects on fenced recovery routes, path normalization, claim 426 without an abandon dependency, server-input and legacy coded-426 termination, uncoded 426, the fence+BG composition without lazy storage, 423 before body parsing, adapter activation and lazy removal, the normalizer trap and missed creation sites). All 23 were passed to the test author unchanged.

### 6.4 Blind tests (one Codex batch)

| File (pack) | Unit | Tests | State on receipt |
|---|---|---|---|
| `client-build-fence/files/server/node/clientBuildFence.phaseC.test.ts` | C-1 | 9 | 3 pass, 6 fail |
| `client-build-fence/files/src/ts/storage/clientBuildHandshake.phaseC.test.ts` | C-1 | 2 | 2 pass (regression guards of the handshake: clean and dirty client on a claim 426, no abandon dependency) |
| `lazy-chat-bg-adapter/files-1.10/src/ts/bgServerInputStart.phaseC.test.ts` | C-2 | 4 | 3 pass, 1 fail |
| `personal-settings/settings/external-headers/files/server/node/externalRequestHeaders.phaseC.test.ts` | C-3 | 2 | 2 fail |
| `lazy-chat-sync/files-1.10/server/node/storageResetPrepare.phaseC.test.ts` | C-4 | 1 | 1 fail |
| `test/phase-c-bundle.test.cjs` (repository test) | C-2 (2), C-3 (2), C-4 (3) | 7 | 1 pass, 6 fail |

Total 25 tests; 9 passed and 16 failed only because the behaviour was missing. Registration-only edits were made in four manifests (`client-build-fence`, `lazy-chat-bg-adapter`, `lazy-chat-sync`, `personal-settings` external-headers units).

Scenarios the author reported as not automated: R3-8 with a populated runtime `dist` (no real-process compat test was added); legacy coded and malformed 426 through the browser closure (asserted structurally only); full HTTP precedence 426 → 503 → 423 on the start route and on the settings routes; the internal drain (relies on existing server tests); component-level behaviour of the settings pages (no standalone Svelte harness exists for the two future adapters, so `[C-3]` checks the adapter unit text); the first-send, macro and copy/branch scenarios of C-4 (no compact entry points without large application fixtures). These were covered by the browser validations in section 8 where noted.

Correction round (one, through `codex exec resume` in the same session): the first C-1 gate run failed on `pnpm check` with two TypeScript errors in `clientBuildHandshake.phaseC.test.ts:37` ("Object is possibly 'undefined'" and "Tuple type '[]' of length '0' has no element at index '1'", the `vi.fn` call tuple). The author typed the mock parameters and read the call through a guarded variable, typed the start/status mocks in the parked `bgServerInputStart.phaseC.test.ts` and the request type in the parked `externalRequestHeaders.phaseC.test.ts`; no assertion or label changed; `pnpm check` 0/0 afterwards. The parked hashes were updated to the corrected files. The author's own verification of the batch had not run `pnpm check`, which is why the error first surfaced in the gate.

## 7. Units

### 7.1 C-1 — `6fcce9b` (F-1)

- `patches/client-build-fence/files/server/node/clientBuildFence.cjs`: `POST /api/bg-orchestrate-input/claim`, `/attach` and `/abandon` added to `EXACT_WRITER_ROUTES` after `POST /api/bg-stream-draft/delete`. Matching uses the existing `isWriterRoute`, so trailing slash and case behave like the other rows. No other row and no other pack's hunk anchor changed; `POST /api/bg-orchestrate` stayed unfenced in this unit.
- Effect: a stale or unstamped client gets `426 CLIENT_UPGRADE_REQUIRED` before the handler runs, so no input record is claimed, attached or abandoned by an outdated client; a claim answered with 426 leaves the raw input on the server, and the handshake reloads or shows the frozen banner. Every production caller already sent the header.
- Versions: client build fence 0.1.1 → 0.1.2, package `.79`; no repository test asserted the fence version.
- Implementer: `sonnet-implementer` (classified normal). Fixed tests 9/9 and 2/2.
- Code review: no defects. Noted (not a defect of this change): the compat tests `storage-reset-b1a.test.ts` and `session-reset-b2.test.ts` post to these routes without `x-client-build`, which works only because their servers have no build stamp; they do not test reset or session behaviour behind an active fence (section 11).
- Gates: first run 18 pass / 1 fail (`pnpm check`, section 6.4); second run 19/19 — client 2617 / 4 (2615 + 2), server 772 / 12 (763 + 9), compat 123 / 5, check 0 / 0, repository tests 341 / 0 / 3.

### 7.2 C-2 — `0696e4f` (F-2, F-3, F-4)

- F-3, `client-build-fence`: `POST /api/bg-orchestrate` added to the writer routes, in the same `dist` as F-2. A stale or missing build header gets 426 before any input, operation or run exists. Version 0.1.3.
- F-2 and the baseline handling, `client-build-fence-bg-adapter` (version 0.1.2), four new units on `src/ts/bgOrchestrate.ts`:
  - `legacy-start-fetch:1.10` replaces only the call line `fetch('/api/bg-orchestrate', {` with `clientBuildFetch(...)`; requires `client-build-fence-bg-adapter:orchestration-import:1.9`; optional `after` edges to `client-build-fence-bg-adapter:orchestration-control:1.9`, `lazy-chat-bg-adapter:session-gate:legacy-start:1.10` and `lazy-chat-bg-adapter:session-gate:legacy-no-fallback:1.10` (no `requires` on the lazy units). Headers, body, signal and the B2-2 423 branch are unchanged.
  - `legacy-start-upgrade-state:1.10` declares `let startFenceRejection: 'client-upgrade-required' | null`.
  - `legacy-start-upgrade-required:1.10`: `if (res.status === 426 && data?.code === 'CLIENT_UPGRADE_REQUIRED')` sets it and returns `rejected` after this one attempt (no status polling, no retry).
  - `legacy-start-no-fallback:1.10`: when the resolution is `rejected` with that flag, logs, calls `stopWatch()` and returns — no browser fallback generation and no extra notice (the handshake shows reload or recovery). A separate variable was needed because `startRejectionReason` exists only with lazy storage.
- F-4, `lazy-chat-bg-adapter` (version 0.7.76):
  - `bgServerInputStart.ts`: a coded 426 resolves `rejected` with `rejectedReason = 'client-upgrade-required'` after one attempt; the existing rejected path clears the marker and keeps the draft. A 426 without that code stays ambiguous as before.
  - New unit `lazy-chat-bg-adapter:build-fence:legacy-start-progress:1.10` inserts `setRequestProgress(operationId, 'failed')` into the fence adapter's guard, so with lazy storage the request progress ends as failed. It is pushed right after the session-gate units so that later lazy units on the file are ordered after it.
  - `recovery-read-units.cjs` and `recovery-ownership-units.cjs` (not named in the brief): their `related` lists placed the whole lazy chain after every fence-adapter unit, which formed an `ORDER_CYCLE` with F-2 (F-2 runs after a session-gate unit). The lists now drop related units whose `after` names a `lazy-chat-bg-adapter:` unit not yet defined at that point; at this commit that matches only the new fence-adapter units.
- `scripts/probe-bg-plugin-process.cjs`, old-client mode: the stale start now expects 426 with `code:'CLIENT_UPGRADE_REQUIRED'` and `commitOutcome:'not-committed'`, then the same body is started with the current build and expects 200. The probe was checked with `node --check` only.
- Unchanged: 503 retryable, the 423 handling, 426 → 503 → 423 precedence, the internal input drain.
- Orchestrator decision: the server-input coded 426 still shows the existing generic notice for a rejected input. The plan required "no extra notice" only for the legacy path; the handshake reload or banner follows.
- Implementer checks (own gate run 19/19, repository tests 343 / 0 / 3): the full composition differed from the C-1 composed tree only in `clientBuildFence.cjs`, `bgOrchestrate.ts` and `bgServerInputStart.ts` (plus the new test file), so existing units' output was unchanged; NOLAZY applied and differed from the same profile at the previous head only in `clientBuildFence.cjs` and `bgOrchestrate.ts`; full → NOLAZY → full matched fresh trees; reverts were clean. `pnpm check` on NOLAZY reported 2 errors (`src/ts/drive/backuplocal.ts:348`, `src/lib/Setting/ServerBackupList.svelte:73`, "Expected 1-2 arguments, but got 3"), identical at the previous head (section 11).
- Code review (two P2 coverage gaps, no behaviour regression): (1) R3-8 still ran with the fence disabled in the process fixture; (2) the legacy browser flow was asserted structurally only. The reviewer accepted the related-list filter (it removes no pre-existing ordering edge; the existing order and output are unchanged), the separate rejection variable, the extra optional edges and the generic server-input notice. Handling: both gaps were covered by the browser validation of the committed candidate (section 8.1); no automated real-process R3-8 test was added (section 11).
- The code review and gates ran on 2026-10-20; the results were read and the unit committed on 2026-10-21 after the weekly reset.
- Gates: 19/19 — client 2621 / 4 (2617 + 4), server 772 / 12, compat 123 / 5, check 0 / 0, repository tests 343 / 0 / 3 (346 run).

### 7.3 C-3 — `029ea09` (S-1, S-2, S-3)

- S-2, `personal-settings` (version 0.5.15): `registerExternalHeaderRoutes(app, checkAuth, owner, checkActiveSession)`; the PUT calls `checkAuth`, then `await checkActiveSession(req, res)`. GET and the revision rules are unchanged; a PUT without a session id still passes. The `server.cjs` registration unit passes `checkActiveSession`.
- S-1/S-3 client, new pack `personal-settings-lazy-session-adapter` 0.1.0 (`userSelectable:false`, `requires` and `autoWhen.all` = `personal-settings`, `lazy-chat-sync`): `external-headers-import:1.10` imports the writer-session helpers (requires the owned page unit and `lazy-chat-sync:owned:src:ts:storage:writerSession-ts:1.10`); `external-headers-write:1.10` adds `...(save ? writerSessionHeaders() : {})` to the request and, on 423, calls `notifySessionDeactivated(response)` and returns before the existing `!response.ok` handling.
- S-1/S-3 client, new pack `client-build-fence-lazy-session-adapter` 0.1.0 (`client-build-fence`, `lazy-chat-sync`): an import unit on `SystemBackup.svelte` inserted after the upstream `forageStorage` import line (optional `after` on `client-build-fence-kei-adapter:snapshot-restore:1.9`, needed to avoid `INCOMPATIBLE_UNITS` in the pairwise analysis), and two write units (`snapshot-limits`, `backup-path`) that add `...writerSessionHeaders()` and handle 423 before `res.json()`. Each requires its `client-build-fence` fetch unit. Each 423 block carries a comment naming its route because the fixed test looks for the route text in the unit content and the request line itself belongs to the fence unit.
- Both adapters are registered in `src/catalog.cjs`; inventories in `test/catalog.test.cjs` and `test/resolver.test.cjs` and the version assertion in `test/personal-settings.test.cjs` were updated.
- Without `lazy-chat-sync` the adapters are inactive, `writerSession.ts` is absent and both pages send no session id (unchanged behaviour).
- Composition checks (`c3` variants): NOLAZY has no adapter markers and no `writerSession` import, the server registration still passes `checkActiveSession`, revert clean; without `personal-settings` and `bg-preserve` the fence adapter is active and the external-headers page is absent, revert clean; full apply followed by a re-apply without `lazy-chat-sync` removes the adapter hunks and `writerSession.ts`, then a full revert is clean; an installed `.80` composition upgrades to this candidate with 5 changes. The resolver matrix (neither, each alone, both, direct selection rejected with `INTERNAL_PACK_REQUESTED`) is covered by the `[C-3]` repository test.
- Pre-existing: the composition "all packs minus `personal-settings`" fails with `MISSING_DEPENDENCY` (`lazy-chat-bg-adapter:external-header-import:1.10` requires a `personal-settings` unit); the same failure was reproduced at `0696e4f`, so the no-personal-settings variant also excluded `bg-preserve`.
- Code review: one P2 acceptance gap, no functional regression — R3-12 component tests are missing; the fixed test matches combined manifest text, so one write could lose its header or 423 handling while another still satisfied the pattern. The reviewer also ran 30 in-memory request-function scenarios and 16 composition checks (passing; 8 reproduced identical pre-existing failures including "all minus personal-settings"). Handling: covered by browser scenarios that exercise each PUT separately (section 8.2); component tests were not added (section 11).
- Gates: 19/19 — client 2621 / 4, server 774 / 12 (772 + 2), compat 123 / 5, check 0 / 0, repository tests 345 / 0 / 3 (348 run).

### 7.4 C-4 — `502dd28` (backlog C-21)

- New `patches/lazy-chat-bg-adapter/chat-fmindex-units.cjs` (registered in the BG adapter manifest after the reset-orphan units). Every unit has optional `after` edges to every unit of `character-import-ux`, `personal-settings`, `charx-archive-integrity` and the adapter itself on the same file; anchors match both pristine files and files after `character-import-ux` applied. Units `lazy-chat-bg-adapter:chat-fmindex:<name>:1.10`:

  | Unit | File | Change |
  |---|---|---|
  | `png-character-default` | `src/ts/characterCards.ts` | `fmIndex: -1` in the default chat literal |
  | `card-character-default` | `src/ts/characterCards.ts` | `fmIndex: -1` in the default chat literal |
  | `format-update-default` | `src/ts/characters.ts` | `fmIndex: cha.firstMsgIndex ?? -1` in the `characterFormatUpdate` empty-chats default |
  | `blank-character-default` | `src/ts/characters.ts` | `fmIndex: -1` in `createBlankChar`'s default chat |
  | `json-v2-import` | `src/ts/characters.ts` | `chat.fmIndex ??= -1` after `chat.id = v4()` |
  | `html-import` | `src/ts/characters.ts` | `json.fmIndex ??= -1` before `normalizeChat` |
  | `package-import` | `src/ts/characterPackage.ts` | `chat.fmIndex ??= -1` in the per-chat loop (covers the append and replace paths) |

- `lazy-chat-sync` `storageResetPrepare.cjs:278`: the reset default chat gets `fmIndex: char.firstMsgIndex ?? -1`; the line before forces `char.firstMsgIndex = -1`, so the value is `-1`.
- Design reasons:
  - `normalizeChat` is not changed because it runs on existing chats (Astra finding 1); existing chats without `fmIndex` are not migrated and converge on their next save as before.
  - Behaviour must not change for the chat that `characterFormatUpdate` later filled with `cha.firstMsgIndex ?? -1`. Where a character variable is in scope (`format-update-default`), the same expression is used. Where the default chat sits inside the character's own object literal (`png-character-default`, `blank-character-default`) or inside the initializer of `let char = {...}` (`card-character-default`, where reading `char` would hit the temporal dead zone), a literal `-1` is used; each of those literals also sets `firstMsgIndex: -1`, and no other code writes `firstMsgIndex`, so the value equals what the later fill would give.
  - Imports use `??= -1` so an imported value (including `0` and positive values) is kept.
  - `orchestrationChatRevision`, readers of `fmIndex`, copies, branches and conflict copies are unchanged.
- First implementation round: the implementer found the JSON v2 import (`risuAllChats`/`risuChat` with `ver === 2`, calling `normalizeChat` without `fmIndex`), which the plan had missed, and covered it; the orchestrator kept it (an import boundary under E2). The first round used a literal `-1` at `format-update-default`; the orchestrator required the `firstMsgIndex` expression to keep the previous value for characters whose `firstMsgIndex` is not `-1` (possible through imported data). The same implementer applied it in a second round and changed the server line to the same expression form. Paths checked and left unchanged: the branch in `Chat.svelte`, the chat copies in `SideChatList`, `createConflictChat`, the server commit owner's metadata push, the trigger and plugin normalizations; the New Chat buttons, jsonl/v1 imports and `stubToPlaceholder` already set `-1`.
- Versions: BG adapter 0.7.77, lazy chat sync 0.5.19, package `.82`; version assertions in `test/bg-independent-g1.test.cjs`, `test/g22a-capability.test.cjs`, `test/lazy-chat-sync.test.cjs`.
- Tests: `[C-4]` repository block failed 2 of 3 before the change and passed 3 of 3 after; the server fixed test (with its neighbours) 10/10 in the composed tree. Variants: NOLAZY applies with no `fmIndex` hunk and reverts clean; with `lazy-chat-sync` but without `character-import-ux` all seven client hunks apply on the pristine `characterCards.ts` and revert clean.
- Orchestrator checks before the commit: both fixed files identical to the parked copies; labels match the table; `normalizeChat` absent from the diff.
- Code review: no findings (seven unique anchors, imports assign before `normalizeChat`, byte-identical apply/revert across checked compositions, no missed creation path; the server Vitest file was read, not run).
- Gates: 19/19 — client 2621 / 4, server 775 / 12 (774 + 1), compat 123 / 5, check 0 / 0, repository tests 348 / 0 / 3 (351 run). Implementer gate runs: first round 19/19, second round 19/19 with the same counts.

### 7.5 C-5 — `83496a9` (Phase B limit 10)

- 14 replacements of `bg-server-input-v3:` with `bg-server-input-v4:` (the current `SERVER_INPUT_MARKER_PREFIX` in `bgServerInputLedger.ts:24`): `probe-bg-stream-preview.mjs` lines 326, 363, 372; `probe-bg-failure-ui.mjs` 294, 354, 371; `probe-bg-marp-lifecycle.mjs` 78, 94, 159, 177, 209, 225, 252, 311. All sites were waits or asserts on live markers; no script seeds a v3 marker, so no v3 site was kept. `internal/bg-notifications/v3/` is a different namespace (notifications ledger) and was left as is. The scripts parse no marker fields; the "epoch" hits in the Marp probe are probe event epochs.
- No pack, `dist` or version change. Implementer: `sonnet-implementer`.
- Checks: `node --check` on all three; `grep -n "bg-server-input-v3" scripts/probe-bg-*.mjs` empty; repository tests 348 / 0 / 3. The probes were not run (they need a live candidate).
- Code review: no findings.

### 7.6 Gate summary

| State | Client | Server | Compat | Check | Repository tests (pass / fail / skip) | Steps |
|---|---|---|---|---|---|---|
| Baseline `0451de9` | 2615 / 4 | 763 / 12 | 123 / 5 | 0 / 0 | 341 / 0 / 3 | — |
| C-1 first run | 2617 / 4 | 772 / 12 | 123 / 5 | 2 errors | 341 / 0 / 3 | 18 pass, 1 fail |
| C-1 `6fcce9b` | 2617 / 4 | 772 / 12 | 123 / 5 | 0 / 0 | 341 / 0 / 3 | 19/19 |
| C-2 `0696e4f` | 2621 / 4 | 772 / 12 | 123 / 5 | 0 / 0 | 343 / 0 / 3 | 19/19 |
| C-3 `029ea09` | 2621 / 4 | 774 / 12 | 123 / 5 | 0 / 0 | 345 / 0 / 3 | 19/19 |
| C-4 `502dd28` | 2621 / 4 | 775 / 12 | 123 / 5 | 0 / 0 | 348 / 0 / 3 | 19/19 |
| C-5 `83496a9` | — | — | — | — | 348 / 0 / 3 | `node --check` |

Pinned installer SHA-256 prefixes: C-1 `b6570acd…`, C-2 `f8e4adba…`, C-3 `67b07469…`, C-4 `cc6265e4…`.

## 8. Browser and HTTP validation

Both runs used built candidates in a scratch directory (FULL = full composition; NOLAZY as above), `pnpm build` (which writes `dist/build-stamp.json`), the server started with a working directory whose `dist` holds that stamp (fence verified active: a fenced POST without the header answered 426), loopback binding, a stub OpenAI-compatible provider, a dead loopback update URL, Playwright Chromium with external hosts blocked, and synthetic seed data. All processes were recorded by PID and stopped; composed trees were deleted afterwards (about 2.4 GB each run).

### 8.1 C-2 and C-1 rows (candidate `0696e4f`)

| Scenario | Result |
|---|---|
| S1 (R3-8, R3-5): fence active; a server-input Send (typed text) → `POST /api/bg-orchestrate` 200 `started:true`, reply after about 4 s, v4 marker cleared, stub 1 request; a legacy delegated start ("resend" with empty input, body carrying `currentChat`) → 200 `started:true`, completed and acknowledged. The browser's request carried `x-client-build` equal to the candidate's `build-stamp.json`. | pass |
| S2 FULL server input, stale build: exactly one POST answered `426 CLIENT_UPGRADE_REQUIRED`; 0 status GETs and 0 result GETs afterwards; 0 browser requests to the stub; recovery banner shown (dirty draft), no navigation; the v4 marker was written and removed 37 ms later; the draft text was still in the input. | pass |
| S2 FULL legacy start, stale build: one 426; 0 status/result polling; 0 browser requests to the stub; the `bg-orch-pending:` marker was set and removed; the page reloaded cleanly (one navigation, no banner). | pass |
| S3 C-1 rows: claim, attach and abandon with a stale build → 426; with the current build → the handler's answer (`400 invalid-request` with a dummy body), not 426. | pass |
| S4 precedence on `POST /api/bg-orchestrate` (direct HTTP): (a) stale build + reset held + stale session → 426 (also with the active session, and on the claim route); (b) current build + reset held → `503 STORAGE_RESET_IN_PROGRESS retryable:true` (also with a stale session); (c) current build, no reset, stale session → `423 Session deactivated`. The reset was held with a real server restore and the test gate hooks (`NODE_ENV=test`, `POCKETRISU_TEST_STORAGE_RESET_GATE_DIR`). After the restore, the previously active session also answered 423, which is the B2-4 behaviour (sessions registered before a reset are stale). | pass |
| S5 uncoded 426 in the UI | skipped (not reachable from the UI; the uncoded case is covered by the `[C-2]` reconciler tests) |
| S6 NOLAZY: current build legacy start 200 `started:true`, completed (no `storageEpoch`/`inputCommandVersion` fields, as expected without lazy storage); stale build legacy start: one 426, 0 polling, 0 browser requests to the stub, recovery banner (the empty send had added a local message, which the runner inferred made the page dirty). | pass |

How the stale build was produced: the preferred method, swapping the server's stamp and restarting, made the idle page reload within 500 ms because a passive `POST /api/bg-notifications/claim` already got 426, before any Send could happen. The run therefore used a Playwright route that rewrote `x-client-build` to a different value on the start and the three recovery routes only, with the server stamp unchanged. A stale server-input Send with a swapped server stamp was not exercised.

Other observations: the first FULL server start hung a send as `input-queued` because the BG bundle (`bgOrchBundle.mjs`) had not been built; the runner built it, reseeded and reran. One error dialog ("durable save deferred; persistence retry required; result retained") appeared on state left by that failed first run and not on freshly seeded state (inferred residue, not investigated). External hosts (katex CSS on a CDN, web fonts) were requested by the page and aborted.

### 8.2 C-3 and C-4 (candidate `502dd28`)

| Scenario | Result |
|---|---|
| 1. External headers page save: `PUT /api/external-request-headers` carried `x-session-id` equal to the tab's writer session and `x-user-active: 1`; 200; persisted after reload. | pass |
| 2. Stale session: context B booted after A and saved (200); A's save → `423 {"error":"Session deactivated"}`; modal "Current tab is inactivated since other tab is active… Confirm", no error toast; stored value = B's; Confirm → one reload. `Response.json/text/arrayBuffer/blob` were instrumented: no 423 body was read. Minor: the status line stays "저장 중…" (saving) behind the modal until the reload. | pass |
| 3. System → Backups, snapshot limits and server backup path, each separately: active session 200 with `x-session-id` and the new value on GET; stale session 423, modal, no error text, value unchanged, one reload. | pass |
| 4. Direct HTTP: active 200; without `x-session-id` 200 and saved; stale id 423 (also with `x-user-active`, and with a wrong revision: 423 before 409); value unchanged; no auth header + stale id → 400 "No auth header". | pass |
| 5. NOLAZY: all three PUTs carry no `x-session-id`/`x-user-active` and answer 200; NOLAZY sources contain no `writerSession` reference. | pass |
| 6. Blank character via "Create from Scratch" (no fixture `fmIndex`): the first chat-content POST decoded to `{name "Chat 1", fmIndex -1, message []}`; `POST /api/bg-orchestrate` 200 `started:true`; reply after about 2 s; stub 1 request, browser→stub 0; only "Chat 1" in the list (no conflict copy); server chat has `fmIndex -1` and 2 messages. | pass |
| 7. Character imports `v2.png`, `off.png`, `v2.json`, `off.json` (card-default and off-spec-default branches): first write `fmIndex -1`; first message started and completed on the first try; stub 1 each, browser→stub 0, no conflict copy; server `fmIndex -1`. | pass |
| 8. `{{firstmsgindex}}` in a new chat → `index is -1 end`; the same text reached the stub; no page error. | pass |
| 9. Chat import: risuChat v2 with `fmIndex` 2 stays 2 (client and server); v2 without → -1; v1 with 2 stays 2; v1 without → -1. | pass |

Observed in scenario 6 and in a control send in a seeded existing chat: `POST /api/patch` answered `409 "Hash mismatch"` once per send, followed by a successful re-save, and `chat-state` GETs showed 409/404 hops (8 × 409 in the control). Because the control shows the same pattern, it is not attributed to C-4; it was not investigated (section 11).

Not exercised: no pre-fix control build, so the old revision conflict was not reproduced (only post-fix behaviour was observed); HTML and jsonl chat import and character package zip import were not driven. The runner's `/api/login` readback calls hit the login rate limit (10 per 30 s) and returned 500 once; reruns used a cached token. `reset.sh` of the harness did not stop the other variant's server, so the first NOLAZY start failed with `EADDRINUSE`; the recorded FULL PID was stopped and the run continued. The BG bundle build was again missing from the brief and was run by the runner. The runner could not write a report file into its output directory (the tool refused report files); its report was returned as its final message and is summarised here.

## 9. Other work in the period

### 9.1 Phase B record (`a0ecba2`)

`docs/records/2026-10-20-phase-b-b2-b3-session.md`, 295 lines, with §10 "Remaining limits" (ten items). Swept for personal identifiers and private paths before the commit.

### 9.2 iOS copy-button report (`8282e99`)

`docs/records/2026-10-21-ios-copy-button-url-encoding.md`: on iPhone, text copied with a text box's copy button and pasted inside PocketRisu arrives with a lower-cased URL scheme and percent-encoded text when it starts with an ASCII word followed by a colon; other apps and the system copy are unaffected. The cause stated there (the web clipboard write is stored with a URL representation) is an inference from the symptom; no code was read or changed. Workarounds and a start order for a later investigation are listed in that record.

### 9.3 Disk cleanup

On 2026-10-20 14:03 the owner pointed out that the disk was nearly full (141 of 145 GB used) and that finished scratch files had not been removed. After the weekly reset (2026-10-21 18:01):

- Measured: the session scratch directory held 36 GB. 42 targets were listed by exact relative name (composed trees, `node_modules` copies and run directories of earlier units, gates and validations, and the test authors' trees), totalling 36 GB.
- Checked that no process had a command line or working directory inside the scratch directory, then deleted the listed entries one by one (entries with absolute paths or `..` were skipped by the loop).
- Result: scratch 36 GB → 510 MB (plans, parked tests, review and gate logs and the pristine clone kept); disk 141 GB used / 3.7 GB free (98%) → 107 GB used / 39 GB free (74%). Larger remaining directories outside this session's scratch were not touched.
- Rule applied from then on: every implementer and runner brief ends with deleting the composed trees and `node_modules` copies it created (logs kept), and after every gate run the orchestrator removes `<out>/tree`. C-3, C-4 and both validation runs followed it.

### 9.4 Merge and README

- Before the push: `git fetch`; `origin/main` (`c7945b9`) was an ancestor of HEAD (fast-forward, 24 commits); the Phase A branch was already contained; the sensitive-information sweep of `origin/main..HEAD` found nothing and the `dist` contained no private paths. After approval: `git push origin claude/phase-b-storage-reset:main`; `origin/main` read back as `83496a9`.
- README (`902148a`): Codex `gpt-6.1-sol` (workspace-write, README only) updated it from the records of 2026-10-17 to 2026-10-21 and CHANGELOG `.57`–`.82`: usage and persona, BG scope and limits, lazy synchronization (including `fmIndex`), personal settings and the build fence (session checks, definitive upgrade rejection), state and recovery (atomic resets, epochs, stale sessions, markers, result suppression and known limits), limitations (render-stall prevention open; the iOS copy report as recorded and uninvestigated). It kept the convention that the release table lists no 0.2.4 experimental rows. Left out: private incident details, maintenance procedures, internal orchestration and rejected designs. The orchestrator read the full diff (+164 / −22 lines), compared claims with the source records, checked link targets and anchors and ran the sweep. After approval: `origin/main` read back as `902148a`.
- G2.2 baseline (checked read-only before the owner moved G2.2 to another session): the G2.2 execution plan was written against `58af7b2` (`.56`, BG adapter 0.7.60); between `58af7b2` and `83496a9`, `bgPluginHost.cjs` and `bgPluginWorker.cjs` are unchanged, and among plugin, request, lorebook, MCP and tool paths only the 426 expectation in `scripts/probe-bg-plugin-process.cjs` changed (C-2).

### 9.5 Aligning local checkouts and the planning repository

After the README push, with owner approval:

- The repository's local default checkout (on `main`, 278 commits behind `origin/main`, no tracked changes) held one untracked file, `docs/records/POCKETRISU-BG-PLAN-WORK-RECORD-2026-09-27.md`, byte-identical to the tracked file of the same path on `origin/main`; it would have blocked the fast-forward. After a second identity check it was removed and `git merge --ff-only origin/main` brought that checkout to `902148a`, equal to `origin/main`.
- The separate planning repository's `main` was 15 commits ahead of its `origin/main` (earlier BG planning documents and the §13 follow-up step). The standard sensitive-information sweep over those ten changed files found only links to this public repository (already present on that remote's `main`); a manual pass for personal paths, private repository names, tailnet details, mail addresses and token shapes found only a generic synthetic-test temporary directory prefix. §13 was then updated to record the merged bundle and the G2.2 baseline check, committed (one file, +2 / −1), and the 16 commits were pushed as a fast-forward; remote and local read back equal.

### 9.6 Quota waits

- 2026-10-20 05:47: Claude weekly usage at 99% (Codex weekly 90%). A wait for the weekly reset was started with the local quota wait script; C-2's review and gates finished in the background and their result files were read after the reset. Requests from the owner at 13:05 and 14:03 hit the weekly limit and were handled after the reset at 18:01 on 2026-10-21.
- 2026-10-21 22:37: Claude 5-hour window at 99%; the wait script woke at the 23:00 reset; the README task started at 23:01.
- The Codex weekly level was observed at 13% at 20:13 on 2026-10-21 (after a reset).

## 10. Orchestration lessons

1. **Validation briefs must build the BG bundle.** Both validation briefs omitted `node server/node/bgOrchBundle.build.cjs`. Without `bgOrchBundle.mjs` the server stops before the provider and a server-input send stays `input-queued`. The C-2 runner found and reported it; the C-3/C-4 brief still omitted it and its runner had to add it again.
2. **Blind-test authors must run `pnpm check`.** The type errors in a fixed test were caught only by the C-1 gate; the test author's verification had not included the type check.
3. **Select processes by recorded PID, never by pattern.** In the earlier part of this session (2026-10-19, before the previous record's end, not recorded there) a `pkill` pattern matched the orchestrator's own shell once (exit 144, no other effect).
4. **Exclude `dist` from review diffs.** Also on 2026-10-19, a 16.7 MB single-line `dist` diff entered a review diff and the review had to be rerun on a diff without `dist`; every code review in this period used a diff without `dist` (`git diff -- . ':(exclude)dist/**'` plus the new files for C-1 to C-4; a `scripts`-only diff for C-5).
5. **Delete composed trees at the end of every run** (section 9.3).
6. **Stale-build browser scenarios:** swapping the server stamp reloads idle pages through the fenced notifications claim before a scenario can act; rewriting the request header in the browser isolates the start path.

## 11. Remaining limits

1. **Result route state name after a reset (Phase B limit 1, unchanged).** For an operation orphaned by a reset, the operation-keyed result GET answers `{found:false, operationState:'cancelled', ...}` while the status route answers `404 {state:'missing'}`. No result is delivered. Whether the boot recovery of a legacy marker that reads this field finishes silently instead of showing the reset notice was not traced.
2. **Phase B limits 2–9** are unchanged by the bundle (see the Phase B record §10). Limit 10 (probe namespace) is resolved by C-5. For limit 5, older open tabs are now also refused with 426 on the start route.
3. **R3-8 has no automated real-process test.** The real build stamp, stale/missing → 426 and matching → both start paths 200 were observed in the browser run only; the process fixture still runs with the fence disabled.
4. **Compat tests behind a disabled fence.** `storage-reset-b1a.test.ts` and `session-reset-b2.test.ts` post to the recovery routes without the build header and pass only because their servers have no build stamp; they do not test reset or session behaviour behind an active fence.
5. **Legacy coded/malformed 426 is tested structurally.** The `[C-2]` repository tests check unit text; the coded case was observed in the browser; the uncoded/malformed 426 on the legacy path and in the UI was not exercised (the server-input reconciler's uncoded case is covered by behaviour tests).
6. **Stale server-input Send with a swapped server stamp** was not exercised (header rewrite used instead, section 8.1).
7. **R3-12 component tests are structural only.** The `[C-3]` repository test matches adapter unit text; each PUT's behaviour was observed separately in the browser run, but no component test exists.
8. **Generic notice on a server-input coded 426.** The server-input path shows the existing generic rejected-input notice (Korean UI text meaning "the server input was not started") before the handshake banner or reload; the legacy path shows none.
9. **External headers status text after 423.** The page's status line stays "saving" behind the deactivation modal until the reload.
10. **C-4 coverage.** The old revision conflict was not reproduced on a pre-fix control; HTML and jsonl chat import and character package zip import were not driven in the browser; the server reset default chat is covered by a unit test only. Existing chats without `fmIndex` are not migrated (by design). Synthetic test data that does not exercise creation still needs `fmIndex: -1`.
11. **`POST /api/patch` 409 "Hash mismatch" once per send**, followed by a successful re-save, observed in new and seeded existing chats; pre-existing, not investigated.
12. **Pre-existing composition limits.** "All packs minus `personal-settings`" fails with `MISSING_DEPENDENCY` (`lazy-chat-bg-adapter:external-header-import:1.10` requires a `personal-settings` unit), already failing before the bundle. `pnpm check` on NOLAZY reports two errors (`src/ts/drive/backuplocal.ts:348`, `src/lib/Setting/ServerBackupList.svelte:73`), identical before C-2.
13. **Related-list filter.** The filter added in `recovery-read-units.cjs` and `recovery-ownership-units.cjs` avoids the current ordering cycle; the reviewer noted it is not a general dependency-cycle solution, so future units in those files need composition checks.
14. **Probe scripts not run.** C-5 and the C-2 probe change were checked with `node --check` and review only.
15. **No phone or live verification.** Nothing was verified on iOS or a real phone; nothing was applied to a live installation.
16. **Planning repository state (resolved at the end of the period).** The BG ordered-goals document, §13, now records the bundle as done and merged, including the G2.2 baseline check of section 9.4; that commit and the 15 earlier unpushed planning commits were pushed after a sensitive-information sweep and owner approval (section 9.5).

## 12. Usage

Window 2026-10-20 03:16 to 2026-10-21 23:05 UTC. Figures are account-wide and include overlapping sessions.

| Tool | 5 h window | Weekly | Notes |
|---|---|---|---|
| Claude Code | +167% (three window resets) | +21% | Paused once for the weekly reset (2026-10-20 05:47 to 2026-10-21 18:01) and once for a 5 h reset (22:37–23:00). Levels at the end: 5 h 2%, weekly 13%. |
| Codex | +159% | +24% | One plan review, one test batch with one correction, five code reviews, one README task. Identified shares after the context compaction: C-4 review +2 / +1, C-5 review +1 / 0, README +4 / 0 (5 h / weekly points). |
| Antigravity Argon | — | +2.53% | One scenario request, `SUCCESS`, 13,668 tokens. |

Subagent token totals were not collected for this record.

## 13. Next steps

1. **BG G2.2, in a separate session (owner decision E9).** Refresh the G2.2 execution plan's baseline from `58af7b2` (`.56`, BG adapter 0.7.60) to the current `main` (`902148a`, `.82`, BG adapter 0.7.77); the checks in section 9.4 indicate that the plan's evidence on plugin host and worker paths still holds and only the probe's 426 expectation changed. Then run the Astra plan review of the G2.2 plan with its D1-a and D2 decisions.
2. **Follow-up correction step** (Phase D runtime items, toolchain items, CI guards and Phase E, as listed in the BG ordered-goals document, §13) waits until the BG goals are done.
3. **iOS copy button:** investigation open (start order in its record).
4. Live application and phone verification each need a separate owner decision.

## 14. Continuing from here

Read first: this record (sections 2, 10, 11, 14), the Phase B record §2 and §10, the BG ordered-goals document (§9.3 and §13) and the G2.2 execution plan. Work from a worktree created on `origin/main`. The repository's local default checkout of `main` was fast-forwarded to `origin/main` at the end of this period (section 9.5), but it is not updated by pushes made from worktrees, so check `git status -sb` for "behind" before using installers or documents from it.

Tips that carry over:

- **Composed test tree:** copy a pristine PocketRisu `v1.10.0` clone; `node dist/pocketrisu-patcher.cjs apply --root <copy> --json` (the `--all` flag no longer exists); `pnpm install --frozen-lockfile`; `pnpm build`; `node server/node/bgOrchBundle.build.cjs`; run every test with `NODE_OPTIONS=--no-experimental-webstorage`. Without the bundle build, server-input sends stay `input-queued`.
- **The fence is active only when the server's `process.cwd()/dist` holds `build-stamp.json`.** Start browser candidates from a directory whose `dist` is the built one, and verify with a fenced POST without the header (expect 426). Test servers without a stamp silently run with the fence off.
- **NOLAZY profile** (composition without `lazy-chat-sync`): the resolver also drops `character-import-ux` (35 packs, 350 changes). A NOLAZY `pnpm check` shows two pre-existing errors; "all minus `personal-settings`" does not compose.
- **Synthetic chats** need `fmIndex: -1` only where the test does not exercise creation; after C-4, chats created or imported through the UI get it automatically.
- **Stale-build scenarios in the browser:** rewrite `x-client-build` on the routes under test; swapping the server stamp reloads idle pages first.
- **Login rate limit:** `/api/login` allows 10 calls per 30 s; harnesses should cache the token.
- **Harness `reset.sh`** (from the earlier validation harness) does not stop the other variant's server; stop the recorded PID before switching variants.
- **`codex exec resume`** does not take `-s`/`--add-dir`; pass `-c sandbox_mode=...` and `-c sandbox_workspace_write.writable_roots=[...]` instead.
- **Per commit:** bump the package version and every changed pack's version, add the CHANGELOG entry at the top, rebuild `dist` (`node scripts/build-installers.cjs`), and update the version-assertion tests (`test/bg-independent-g1.test.cjs`, `test/g22a-capability.test.cjs`, `test/lazy-chat-sync.test.cjs`, `test/personal-settings.test.cjs` as applicable). Run the local candidate-gates script and compare counts with the last row of section 7.6.
- **Blind tests of later units** stay outside the repository (with hashes) until their own commit, so a commit's `dist` never contains another unit's tests; compare fixed tests with the parked copies before each commit. Ask test authors to run `pnpm check`.
- **Review diffs:** exclude `dist` (`git diff -- . ':(exclude)dist/**'`) and append new files.
- **Cleanup:** delete composed trees and `node_modules` copies at the end of every implementer, runner and gate run (gate runs: remove `<out>/tree`); keep logs. Select processes by recorded PID.
- **Validation briefs:** list the bundle build, the stamp/working-directory rule, ports, synthetic data, PID recording and the cleanup explicitly.
- **Baseline for the next unit:** client 2621 / 4, server 775 / 12, compat 123 / 5, `pnpm check` 0 / 0, repository tests 351 run / 348 passed / 0 failed / 3 skipped (`.82`).
