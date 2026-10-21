# 2026-10-22 — G2.2 plan baseline refresh, Astra review, and G2.2b plan and blind tests

Status: working record of one session (2026-10-21 23:16 UTC to 2026-10-22 KST morning). This session refreshed the G2.2 plan baseline in the planning repository, ran the Astra plan review of the G2.2 plan, and prepared unit G2.2b (BG `getCurrentLorebookEntries` parity) up to blind tests. No implementation code was written. Nothing was pushed, merged, applied to a live installation or verified on a phone.

Times are UTC unless stated otherwise. No chat content, character names, identifiers or credentials are recorded. All checks used synthetic data or official release files.

## 0. Where everything is

| Item | Value |
|---|---|
| Patcher base | `origin/main` `2adc8a5` (code identical to `902148a`, `0.2.4-experimental.82`, lazy-chat-bg-adapter 0.7.77) |
| Patcher branch | `claude/g22b-lorebook-parity` (created from `2adc8a5`; this record is its only commit; not pushed) |
| Uncommitted on the branch | G2.2b blind tests and their registration (section 5), kept as fixed tests for the implementation |
| Planning repository | BG ordered-goals §13, G2.2 execution plan r2, new G2.2b plan (`docs/BG-G2-2B-LOREBOOK-PARITY-PLAN.md`); local commits, not pushed |
| Target | PocketRisu `v1.10.0` (`98e9683`); upstream latest is 1.15.2, the catalog target stays 1.10.0 |
| RCM | re-pinned from 1.0.13 to 1.0.21 (owner decision), commit `50c76fe`, plugin JS SHA-256 `08705f3b…`, API revision 98 |

## 1. Requested scope

1. Read the BG ordered-goals document (§9.3, §13), the G2.2 execution plan, the Phase C record (§2, §10, §11, §14) and the Phase B record (§2, §10).
2. Refresh the G2.2 plan baseline and run the Astra plan review.
3. On "go", continue with G2.2b; later, stop after the blind tests, update the documents and write the start instructions for the next session.

## 2. Baseline refresh

- `58af7b2..902148a` (43 commits): `bgPluginHost.cjs` and `bgPluginWorker.cjs` unchanged; the plan's cited lines still hold. Plugin-related behaviour change: the probe's old-client start now expects 426; `test/g22a-capability.test.cjs` changed only its version assertions. Harness-relevant: BG start/claim/attach are session-gated and fenced (426), storage epoch and commit refusal across a reset were added; the assembly-context change is diagnostic only.
- RCM 1.0.13 → 1.0.21: the plugin adds `alert`, `getTranslationCache`, `searchTranslationCache` and `parseRisuChat` (UI paths, all feature-checked). **The memory-preparation context now calls `getCurrentLorebookEntries?.()`**, so under BG its absence no longer fails the hook; memory preparation silently runs without lorebooks. Unchanged: `MemoryInjectionBlockedError`, the 30 s / 180 s choice, the 1500 ms output fallback, backend `engine:"risu"` / plugin `extractionEngine:"server"` defaults, `registerMCP` awaited without a check, 15 s / 45 s constants. Backend routes 144 → 154; still no job-status-by-id route; new `PUT /v1/chats/:id/work` (per-chat pause) is a D4 input. Installation of 1.0.21 has not been checked yet (G2.2c step 0).

## 3. Astra review of the G2.2 plan (one round, all ten findings adopted)

1. G2.2b module order is `db.modules` array order with id/namespace matching and id de-duplication, not activation-source order; an embedded persona module object absent from `db.modules` adds nothing.
2. Use the captured assembly projection (metadata `modules` overlaid); no-chat does not mean no-character.
3. "No other-chat hydration" applies to the new API only; RCM's `getDatabase([... "characters"])` hydrates all characters through the existing handler.
4. D1-a must target the real beforeRequest replacer contract, not only one line of the shared wrapper (the same kind is used for body interceptors); keep cancellation classification.
5. D1-a changes three probe expectations (capability 383, host 454 and 1234); MARP and PageFold probes do not rely on host fail-open.
6. D1-a "model not called, input preserved" needs end-to-end checks before and after backend effects, with no automatic replay.
7. **D2 discovery order:** `requestChatData` reads tools before beforeRequest; RCM's tool list depends on preparation done in beforeRequest, so a fresh per-request BG host can expose zero tools to the first model request even when registration succeeds. Any change of native ordering needs an owner decision.
8. D2 needs lifecycle ownership of both MCP registries and every tool caller (ModelPreset, OpenAI, Google, Anthropic paths).
9. D2 deadlines: host-wide 128 network calls, 600 s session, RCM recall up to 920 s; do not derive deadlines from heartbeat/lease constants or raise budgets silently.
10. D3: moving host close after commit is not enough; invocation scopes end and later calls are rejected, so the 1500 ms timer cannot use host APIs.

## 4. G2.2b plan

Plan, review record and acceptance criteria: planning repository `docs/BG-G2-2B-LOREBOOK-PARITY-PLAN.md`. Design summary: expose the bundle's own `getModuleLorebooks()` as a required `moduleLorebooks` binding; add a `getCurrentLorebookEntries` root handler that reads the selected assembled chat without hydration, fails with `plugin_chat_snapshot_unavailable` on stub/placeholder/cold selected chats, and returns a `clonePluginValue` copy within existing limits. Correctness relies on `_previewLock`, which serializes the whole server preview (host lifetime included) because the bundle's database and selection are process-global.

Astra review of the G2.2b plan (one round, six findings adopted): lock and selection paths confirmed (non-attached preview is not host-eligible); stub/cold defence; persona and patched-cache cases; stale-bundle eligibility keeps the existing warned plugin-free path; value limits; test registration, fixtures, real worker and real bundle checks.

## 5. Scenarios and blind tests

- Argon (`gemini-4-argon-medium`): 12 scenarios, `SUCCESS`, 10,251 tokens. Excluded: the concurrent-operation part of scenario 11 (operations are serialized) and the MARP/provider regression part of scenario 12 (existing suites).
- Codex `gpt-5.6-sol` (one batch, no correction round), session `01a160d5-c38b-7571-bf10-a7663feec725`:
  - `patches/lazy-chat-bg-adapter/files-1.10/server/node/bgCurrentLorebookEntries.test.ts` (new; one `[G2.2b-1]` block, 11 tests, 14 collected), SHA-256 `4195fe1e…c739c`.
  - Registration line in `patches/lazy-chat-bg-adapter/plugin-host-units.cjs` (`84d332fa…71ff`), fixture updates in `bgPluginEligibility.test.ts` (`8f70f33b…33e0`) and `bgInputExecutionContext.test.ts` (`4e25d1d4…84f0`).
  - Observed: new suite 13 failed / 1 passed (11 missing handler, 1 missing from the method list, 1 eligibility not requiring the binding; the teardown case passes through the existing close gate); touched fixtures 22/22; `pnpm check` 0/0; repository tests 55 files passed. Label check: no violations. The module resolver under test is the real `modules.ts` (database, util and unrelated imports are test doubles).
  - Limit: the worker sandbox could not start in the test author's environment (`plugin_sandbox_budget_unavailable`), so worker-level checks are assigned to the validation run after implementation.

## 6. Orchestration notes

1. **Start sessions in the planning workspace.** This session was started from a directory without the planning repository's instruction file, so those instructions and the planning memory index were not loaded at start and were read manually partway through. Several file edits were made with scripts instead of the editor tools the instructions require; all were single exact replacements and the diffs were reviewed before commit.
2. A user-level session-start hook (local tooling, not in this repository) now injects the conversational tone section of the planning instruction file into every session.
3. Re-check upstream releases when refreshing a baseline: RCM moved eight versions in six days and changed the failure mode the plan relied on.

## 7. Remaining limits

1. RCM 1.0.21 installation, ARM native modules and API revision 98 are not yet observed.
2. G2.2b worker-level behaviour (capability discovery, absent diagnostics, counters) is only tested at handler/proxy-contract level so far.
3. D2 tool discovery order needs a decision when the D2 implementation plan is written; D3/D4 remain open until G2.2c.
4. Nothing was verified on a phone or applied live.

## 8. Usage

Window 2026-10-21 23:16 UTC to the end of this session; account-wide figures.

| Tool | 5 h window | Weekly | Notes |
|---|---|---|---|
| Claude Code | +23% | +3% | Two `haiku-explorer` subagents (~41k and ~83k tokens). |
| Codex | +78% (13 → 91) | +13% | Two Astra plan reviews and one blind-test batch. The 5 h window was at 91% at the end. |
| Antigravity Argon | — | +0.29% | One scenario request, `SUCCESS`. |

## 9. Continuing from here

Read first: this record, the planning repository's `docs/BG-G2-2B-LOREBOOK-PARITY-PLAN.md`, `docs/BG-G2-2-EXECUTION-PLAN.md` (r2, §3 and §7) and `docs/BG-PRESERVE-ORDERED-GOALS.md` §9.3 and §13. The Phase C record §14 tips still apply (composed tree, bundle build, fence stamp rule, NOLAZY profile, review diffs without `dist`, cleanup, baseline counts).

Next steps, in order:

1. In the G2.2b worktree on branch `claude/g22b-lorebook-parity`, confirm the four fixed test files match the SHA-256 values in section 5 before handing them to the implementer.
2. Implement G2.2b-1 with `opus-implementer` from a written brief (plan "설계", "수정 파일", "합격 기준"); fixed tests as above; release identity `.83` / adapter 0.7.78.
3. Run the candidate gates; compare with client 2621/4, server 775/12, compat 123/5, check 0/0, repository 351/348/0/3 plus the new tests.
4. Codex code review (`gpt-6.1-sol`) on a diff without `dist`. Check the Codex 5 h window first; it ended this session at 91%.
5. Validation run (acceptance criteria 6 and 8): real worker discovery and counters; original RCM 1.0.21 in a composed tree with a fake RCM backend capturing `/v1/turn/prepare`; stale build/session start with zero effects. The brief must include the bundle build and the stamp/working-directory rule.
6. Commit per unit; push, merge, live application and phone verification each need a separate owner decision.
7. Then G2.2c (starting with the RCM 1.0.21 install check), then the D2 implementation plan with the discovery-order decision.
