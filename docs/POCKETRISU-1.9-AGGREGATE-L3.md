# PocketRisu 1.9 aggregate iPhone L3 — work in progress

> **Started:** 2026-08-02 KST
>
> **Admitted live candidate source:** `codex/pocketrisu-1.9-rebase` at
> `1fe0402b060b947c031abb7da6980dc1ac2795f2`
>
> **Corrected live update source:** `codex/pocketrisu-1.9-rebase` at
> `53512ab361892b932004c7580b916ecd009fa288`
>
> **Exact target:** official PocketRisu 1.9.0 / PocketRisu commit
> `85a65f3137b45c8de4a8d21a9887be213b1ac3fc`
>
> **State:** live aggregate candidate admitted; the first physical iPhone
> observations are recorded below. The patched K22 search/folder picker has
> now supplied a physical loaded-bundle marker. K19 retains limited normal
> observations and VoiceOver was intentionally not exercised. The K16 route
> and BG composer defects were fixed, automatically qualified, and then
> admitted together with the Node test-storage correction in the live 538-unit
> candidate. The live update/restart gates passed. K16 and BG composer physical
> re-L3 remain deferred to the user's later consolidated re-L3 batch. K22 was
> later reported normal, K15 has a limited ordinary-affordance pass, and K14
> was not exercised by user choice. K11 was interrupted by a separate BG
> direct-generation lifecycle defect. Its patcher correction is locally
> qualified at a 542-unit maximum graph but is not live-admitted.

## Authority and boundaries

The implementation and automated qualification authority is
`docs/POCKETRISU-1.9-AGGREGATE-VALIDATION.md`. This receipt records the later,
separately authorized live candidate admission and each physical L3 result.
It does not rewrite the earlier aggregate receipt's historical observation
that no live mutation occurred while that receipt was produced.

The user explicitly authorized the initial live candidate and later the
corrected aggregate apply plus required PocketRisu restart. Both operations
are recorded below. That authorization does not include a push, tag, release,
publication, another restart, or destructive use of existing user
backups/personas/cache as test fixtures.

K29-F02 G06 remains blocked and has no runtime unit. This L3 may exercise the
existing G09 cold-reroll path, but must not present standard non-Gemini G06,
G07, G08, G12, or G13-G15 as implemented. K04, K17, and K23 have no separate
device-only distinction after their automated owner-boundary tests.

## Live candidate admission

### Preflight

Immediately before stopping PocketRisu, the observed state was:

- PM2 active requests: 0;
- native model jobs in active state: 0;
- unclaimed terminal native model jobs: 0;
- `pending_sends`: 0;
- durable BG keys under `bg-orch-result:`, `bg-orch-result-op:`, and
  `bg-orch-state-op:`: 0; and
- patch state absent with the pre-existing empty custom intent.

The source installer plan on the live official 1.9 target reported exact
compatibility `verified`, 28 resolved packs, 537 units, five declared ordered
collisions, and 219 planned paths. PM2 was stopped before applying or changing
source files.

### Apply, state, and idempotency

The generated universal installer
`dist/pocketrisu-patcher.cjs` applied `--all` transactionally. The subsequent
observations were:

- state format 2, profile `all`, target PocketRisu 1.9.0;
- 28 current packs, 537 units, five ordered collisions, and 217 managed source
  paths;
- format-2 rolling intent `{ mode: "preset", preset: "all" }`; and
- a repeated live `--all` plan with zero changed paths and all 217 managed
  source paths skipped.

The state and intent are intentional patch-control data. No second plugin
array, database schema, or parallel feature state machine was installed.

### Live install and build gates

The following commands were run against the stopped live target, and these
are their observed results rather than forecasts:

- `pnpm install --frozen-lockfile`: exit 0, 113 packages reused and zero
  downloaded;
- `pnpm test`: client 128 files / 1,533 tests passed and server 9 files / 163
  tests passed;
- `pnpm check`: 0 errors and 0 warnings;
- `pnpm build`: exit 0 after 7,857 transformed modules;
- `node server/node/bgOrchBundle.build.cjs`: exit 0, generated bundle load
  check `sendChat=function`;
- `pnpm prune --prod`: exit 0; and
- post-prune runtime resolution found both `express` and `better-sqlite3`.

The test run emitted an intermediate localhost `ECONNREFUSED` line and Node 25
local-storage warnings, but both complete client and server suites finished
with the passing counts above. The frontend build retained its existing
chunk/dynamic-import/plugin-timing warnings. Neither stderr class was omitted
or relabelled as an extra pass.

The resulting main asset was `dist/assets/index-LGezkoIX.js`, 1,999,199 bytes,
SHA-256
`2f3d61a69035e85e04c08497d366483a40bb2d85807df6af79bb1d219a6b3df1`.
The generated BG bundle was 8,396,586 bytes.

### Restart and runtime smoke

`pm2 restart risuai-nodeonly` completed after the gates above. At the recorded
observation, PM2 reported PocketRisu 1.9.0 online, PID 3325945, zero unstable
restarts, and zero active requests. Root HTTP returned 200 with 3,502 bytes.
The served main asset returned 200 and was byte-identical to the local build at
the SHA-256 above.

The first unauthenticated smoke used the obsolete path `/api/bg-cache/status`
and returned 404. Source inspection identified the applied routes as
`/api/bg-gemini-cache-status` and
`/api/bg-orchestrate-status/:operationId`; unauthenticated requests to both
returned 401. The initial 404 is retained here as a stale smoke-path finding,
not reported as a runtime feature failure. The PM2 error log grew by zero
bytes and zero lines from its exact pre-restart offset.

### User-data and preserved-worktree boundary

After restart, the live `save/risuai.db` remained at inode 786453 and
2,710,347,776 bytes, and `backups/` remained at inode 788086 and 4,096 bytes.
These observations establish unchanged inode/size at this boundary; they are
not promoted to an unmeasured byte-for-byte database claim. The patch-control
state under `save/pocketrisu-patches/` intentionally changed from absent to
the current `all` state.

The preserved K12 worktree remained at
`081a32ba4ae27c8f25f1719ef90406504a490928`. Its index-listing SHA-256 remained
`632b6d3285e85650be19efe5c4f6c70a3af56fdec683fc9a5a182505118704b3`,
and its cached binary-diff SHA-256 remained
`916440ab240e0f7541844f0082ce53d1d5f516d08ea1bdfc79a55149d7ca66a9`.
It was not modified, unstaged, rebased, or amended.

## Corrected 538-unit live update

The user separately authorized combining the K16 route correction, BG composer
condition correction, and Node test-storage correction with live admission.
No push, tag, release, paid request, user-data cleanup, or physical L3 was part
of this operation.

### Preflight and semantic work boundary

Immediately before stop, PM2 reported PocketRisu 1.9.0 online, zero unstable
restarts, and zero active requests. Read-only database observations were:

- active main jobs: 0; active auxiliary jobs: 0;
- unclaimed terminal main jobs: 0;
- `pending_sends`: 1, linked to exactly one `done` + `claimed` main job;
- BG result payload rows: 0;
- BG operation-state rows: three, all `delivered`;
- SQLite `quick_check`: `ok`; and
- no nested `save/save` directory.

The nonzero rows were terminal/ACK records rather than active or unconsumed
paid work. They were not deleted, claimed, rewritten, or used as a reason to
infer an L3 pass; both databases remained the same durable owners across the
restart.

The final generated-installer plan reported compatibility `verified`, 28
packs, 538 units, five ordered collisions, and exactly four changed paths:
`DefaultChatScreen.svelte`, `Settings.svelte`, `vitest.setup.ts`, and patch
state. PM2 was stopped before the apply.

### Apply, automated gates, and idempotency

The universal installer applied those four paths transactionally. Live state
then reported format 2, profile `all`, PocketRisu 1.9.0, 28 packs, 538 units,
and 217 transaction-managed source paths. Source inspection observed the
composer expression inside the Svelte condition, the K16 Hotkey mobile route,
and the getter-free Vitest storage setup. The old malformed composer form was
absent.

Observed gates on the stopped live target were:

- frozen install: 109 packages reused, zero downloaded, exit 0;
- client tests: 128 files and 1,533 tests passed;
- server tests: 9 files and 163 tests passed;
- captured Node `localstorage-file` warnings: 0;
- Svelte diagnostics: 0 errors and 0 warnings;
- production build: 7,857 transformed modules, exit 0;
- BG bundle: 8,396,586 bytes, `sendChat=function` load check passed;
- production prune: exit 0; and
- post-prune `express` and `better-sqlite3` resolution: passed.

The existing localhost:3000 mock `ECONNREFUSED` reports and existing build
warnings remained visible; the complete commands exited 0. Executable browser
JavaScript contained no literal `orch-composer` marker. The sourcemap retained
the source ownership comment, which is not an executable UI text node.

A repeated live plan reported 28 packs, 538 units, five collisions, zero
changed paths, and all 217 source paths skipped.

### Restart, served bytes, and preservation

The rebuilt main asset was `index-IoCFPxUO.js`, 1,999,206 bytes, SHA-256
`767724bd240549434152f8235f8d7a57c89960e0e8ae4f45163a0d84069dd6b9`.
After restart, PM2 reported PocketRisu 1.9.0 online at PID 3423309, zero
unstable restarts, and zero active requests. Root HTTP returned 200 with 3,502
bytes. The served main asset returned 200 and was byte-identical to the local
build at that SHA-256. Both current unauthenticated BG status routes returned
401 as expected.

The PM2 error log remained exactly 112,033,886 bytes before and after restart.
`save/risuai.db` remained inode 786453 / 2,710,347,776 bytes,
`save/model-jobs.db` remained inode 872636 / 4,096 bytes, and `backups/`
remained inode 788086 / 4,096 bytes. Post-restart SQLite `quick_check` was
`ok`; active and unclaimed work remained zero; the same one done/claimed
pending marker and three delivered BG state rows remained preserved.

The preserved K12 worktree still matched HEAD
`081a32ba4ae27c8f25f1719ef90406504a490928`, index-listing SHA-256
`632b6d3285e85650be19efe5c4f6c70a3af56fdec683fc9a5a182505118704b3`,
and cached binary-diff SHA-256
`916440ab240e0f7541844f0082ce53d1d5f516d08ea1bdfc79a55149d7ca66a9`.

## First physical observation and K16 correction

The user reported that Hotkeys were not visible under Accessibility, chose not
to exercise VoiceOver because it is not part of their practical use, and
reported the remaining exercised viewer interactions as normal. The result is
recorded narrowly: swipe, arrow navigation, both image boundaries, and
rotation were observed normal. Asset filtering/search, module-viewer behavior,
disposable asset mutation, and VoiceOver/focus were not part of that
observation and are not inferred passed. The exercised swipe/arrow controls are
native 1.9 behavior, so they do not independently prove which patched PWA
bundle was loaded. A later observation did: the user opened the separate chat
Quick Menu → Persona picker and exercised its patched search and
Folder/Unfiled controls. Those controls are K22-owned and absent from official
1.9, so they establish that the iPhone had loaded the admitted aggregate
candidate. This resolves bootstrap identity without promoting the still-open
K19 surfaces.

Source inspection established two distinct K16 issues:

- the L3 instruction was wrong because Hotkey is a top-level Settings menu,
  not an Accessibility submenu; and
- official 1.9 routed that menu to index 15 but mounted `HotkeySettings` only
  when `window.innerWidth >= 768`, so K16's master switch and the native
  small-screen notice were unreachable on iPhone.

The local K16 correction is commit `a043d98`; generated installers were
refreshed separately in `815673e`. The 1.9-only unit removes only the outer
route guard. The component's inner `< 768` notice and desktop-only binding
table remain unchanged. Fresh observed gates include source patcher 38/38,
client 128 files / 1,533 tests, server 9 files / 163 tests, diagnostics 0/0,
production build at 7,857 modules, all 2,048 combination selections and 1,024
normalized graphs round-tripped, and source/fixed/generic maximum plans all at
28 packs, 538 units, five ordered collisions, and 219 planned paths. Exact
details and the L2.5 audit are in the K16 receipt.

This correction is now present in live PocketRisu. Its affected physical check
remains top-level Settings → Hotkey (설정 → 단축키) in the user's later
consolidated re-L3 batch. Admission and automated gates do not infer that the
iPhone has loaded or passed the corrected control.

## BG composer literal-marker finding and local correction

The user observed the following patch ownership marker as literal text beside
the chat composer controls:

```text
/* BG-PRESERVE:START orch-composer */ || $orchestrating/* BG-PRESERVE:END */
```

This is a real 1.9 adapter defect, not intentional UI, cached user text, or a
supported diagnostic mode. Read-only inspection found the exact live source
form:

```svelte
{#if currentChatGenerating || doingChatInputTranslate}/* BG-PRESERVE:START orch-composer */ || $orchestrating/* BG-PRESERVE:END */
```

The base unit inserts its managed expression `after` an anchor that ends before
the Svelte directive closes. The 1.9 adapter changed that anchor to include the
closing `}`, so the same managed fragment was inserted after the condition as a
valid literal text node. The production build therefore succeeded and compiled
that marker into `dist/assets/index-LGezkoIX.js` instead of rejecting the
source.

The directly established effects are that the marker is visible and
`$orchestrating` does not participate in the composer stop/send conditional.
The ordinary client generation and translation terms still participate. Other
BG send/reroll/abort guards remain separately present in their owners, so this
finding is not promoted to a claim that server generation or result retention
itself failed. The detached/cold composer presentation and its stop affordance
remain unqualified until correction and re-L3.

The former 1.9 adapter test checked only that the anchor contained the two
native terms and that the managed fragment contained `$orchestrating`. It did
not apply both fragments and assert the final Svelte directive shape or the
absence of a rendered marker text node.

The owner-local correction is now commit `838ac27`; canonical installers are
commit `eda6eb9`. The 1.9 anchor now ends before `}`, so the unchanged managed
fragment extends the condition. Its applied-output regression test covers
outside-brace placement, both native terms, `$orchestrating`, idempotency,
marker drift, inherited first-anchor behavior, and exact revert. The fresh
focused and maximum targets compiled zero browser assets containing the
literal marker. All 2,048 selections and 1,024 normalized graphs
round-tripped; the maximum graph remains 28 packs, 538 units, five ordered
collisions, and 217 transaction-managed source paths. Client 1,533, server
163, Svelte 0/0, production build, BG bundle load, repeated apply, exact
revert, deterministic installer, and L2.5 gates passed with the exact observed
details in `docs/POCKETRISU-1.9-BG-COMPOSER-VALIDATION.md`.

This correction is now present in the live 538-unit bundle. The earlier
literal-marker observation remains the historical physical finding; attached
and cold-return stop-state behavior plus cancellation still require the later
consolidated BG composer re-L3.

## K22-session chat-save interruption

While the user continued the K22 physical sequence, the client displayed
`Failed to save 1 chat` and retained the gray stage-zero generation indicator
after an already-rendered response. The affected K22 sequence stopped at that
point. This is not classified as a K22 persona-picker failure.

Read-only production evidence established the following boundary:

- the latest paid main response completed with upstream HTTP 200, was claimed
  exactly once, and its distinct active-chat payload is present in the
  canonical database;
- `pending_sends` was zero, the chat-write journal contained no new record for
  the incident, and SQLite `quick_check` returned `ok`;
- client telemetry identified two different, older chat identities as the
  failed save targets rather than the response chat;
- the served sourcemap maps the first failure site to
  `NodeStorage.saveChatContentSerialized()`'s unconfirmed full-write network
  path and the repeated dominant site to its HTTP 409/412 CAS-conflict path;
- one older target produced 50 failed-save events from 06:58:19 through
  07:36:24 UTC, while the second appeared three times; and
- no further `Failed to save ... chat` event was recorded after 07:36:24 UTC
  at the read-only observation boundary.

The paid response is therefore durably present, while the rejected local
snapshots remain deliberately uncommitted. The unresolved infrastructure
finding is that a deterministic chat CAS conflict remains in the ordinary
dirty tracker, repeatedly retries, obscures the actual conflict behind an
aggregate error, and can leave the per-chat stage-zero indicator visible.
The rejected request body is intentionally not logged, so this receipt does
not infer which earlier local mutation first diverged. The deferred fix must
preserve real remote edits, isolate a conflicted chat from unrelated saves,
retain an explicit local-data recovery surface, and clear generation UI on
every conclude path; it must not turn 409/412 into an unconditional overwrite.

## BG direct-generation lifecycle finding

The later stage-zero indicator and delayed next-send symptoms were separated
from the older-chat save conflict above. Read-only runtime evidence showed the
current response durably present after one successful auxiliary and one
successful main request, while the server had first produced a fast
no-new-message terminal for the same chat.

Source and consecutive-call telemetry established that both BG direct callers
bypassed `DefaultChatScreen.sendChatMain()` and therefore never invoked native
PocketRisu 1.9 keyed `endGeneration()`:

- the server bundle's first direct generation registered a per-chat entry;
- later calls for the same chat returned `false` at the native keyed guard and
  reached browser fallback only after a polling delay; and
- browser fallback generated and saved the reply but also retained its keyed
  entry, leaving the gray stage-zero indicator and blocking Send.

The owner-local patcher correction and automatic evidence are in
`docs/POCKETRISU-1.9-BG-DIRECT-GENERATION-LIFECYCLE-VALIDATION.md`. It is not
yet live-admitted; the current live 538-unit bundle still contains the finding.

## Deferred fix and re-L3 batch policy

The user chose the following workflow because the Kei candidate has many
independent L3 scenarios:

- continue the first-pass L3 ledger on the current live 538-unit candidate for
  scenarios that are not blocked by a known finding;
- when a new finding appears, stop only that affected scenario, preserve its
  exact observation and caller/state boundary, and queue it rather than
  interrupting the first pass for an immediate live update;
- after the first pass, implement queued findings in their owning feature or
  infrastructure boundaries. “One batch” means one integration cycle, not one
  mixed commit: feature-local commits, receipts, focused adversarial gates,
  owner-present/absent graphs, exact revert, and L2.5 remain separate;
- the earlier K16/BG-composer integration/deployment cycle is complete, while
  the new BG direct-generation lifecycle correction remains local-only; and
- run the queued K16 and BG composer re-L3 scenarios later with any other
  affected rows while retaining separate result records; and
- treat the K22-session chat-save interruption as a lazy-chat storage-owner
  fix/re-L3 item, not as evidence that K22 search/folder behavior failed.
- require a newly authorized live apply/restart before rerunning the blocked
  consecutive-generation/K11 path; local qualification does not clear the
  current browser's leaked keyed state.

A finding that indicates immediate user-data, paid-result, or active-work risk
still stops use of that affected path; batching does not authorize continuing
an unsafe scenario or mutating live data.

## Physical L3 result ledger

`PENDING` means no user observation has been supplied. Each row closes only
from the concrete screen/action/result evidence in its cited receipt; passing
one row does not imply another row passed.

| ID | User-visible scenario | Authority | Status | Observed result |
| --- | --- | --- | --- | --- |
| Bootstrap | Fully close and reopen the PocketRisu PWA; confirm a current-candidate screen such as top-level Settings → Hotkey or the Language translation-cache panel is present before attributing later behavior to this bundle. | This receipt | PASS — K22 PATCH MARKER OBSERVED | The former Accessibility → Hotkeys instruction was invalid, but the later chat Quick Menu → Persona picker showed and exercised K22-owned search plus Folder/Unfiled controls that do not exist in official 1.9. This physically identifies the loaded admitted candidate; it does not imply unrelated feature rows passed. |
| K19 | Native Asset Viewer image-only filtering, search, one-step swipe/arrows, boundaries, VoiceOver labels/focus return, rotation, touch targets, module viewer, and unchanged disposable asset mutation. | `docs/POCKETRISU-1.9-KEI-K19-VALIDATION.md` | LIMITED PASS / NON-IMAGE FIXTURE UNAVAILABLE / VOICEOVER NOT EXERCISED | The user reported the no-image state and image module normal. Swipe, arrows, both boundaries, and rotation were also reported normal. No character with a non-image asset was available, so non-image filtering could not be exercised; VoiceOver was intentionally skipped. Focus return, touch-target measurement, and disposable asset mutation remain unobserved. The K22 marker resolves bundle identity but does not infer those open K19 surfaces passed. |
| BG composer | While server orchestration owns the current chat, the composer shows the native stop state without rendering patch source text; the stop/send conditional follows `$orchestrating` across attached and cold return states. | `docs/POCKETRISU-1.9-BG-COMPOSER-VALIDATION.md` | LIVE CORRECTION ADMITTED / RE-L3 PENDING | The user observed the literal `orch-composer` marker in the earlier 537-unit bundle. The owner-local correction passed focused, maximum, exhaustive, generated-installer, exact-revert, L2.5, and live install/runtime gates and is now in the 538-unit bundle. Server generation/result failure is not inferred; corrected attached/cold stop state and cancellation remain pending physical re-L3. |
| K29-F05 | Leave one paid ordinary BG result unconsumed across an overnight mobile absence; return to one materialization and exact ACK cleanup without a duplicate or missing paid response. | `docs/POCKETRISU-1.9-KEI-K29-RETENTION-VALIDATION.md` | PENDING | — |
| K29 G09 | Background, kill/reload, and return during the existing qualified cold reroll; exactly one intended existing message/swipe is overwritten and no duplicate is appended. | `docs/POCKETRISU-1.9-AGGREGATE-VALIDATION.md` | PENDING | — |
| K22 | Persona picker name/note search, Folder/Unfiled filters, ordinary and PersonaBind identity, selected-folder disposable create/import, cold persistence, stale-folder fallback, cancel, and invalid-file behavior. | `docs/POCKETRISU-1.9-KEI-K22-PICKER-VALIDATION.md` | PASS — USER REPORTED BATCH NORMAL | After the earlier ordinary-picker observation and unrelated save interruption, the user resumed the consolidated batch and reported the K22 item normal. This closes the instructed K22 batch as observed; the separate BG lifecycle finding below does not relabel K22 as its owner. |
| K26 | On a separately prepared disposable backup target only, cover local-file, server-file, and snapshot restore, fresh timestamped snapshot, forced failure stop, one-use same-target retry, and wrong-target/replay refusal. | `docs/POCKETRISU-1.9-KEI-K26-RESTORE-VALIDATION.md` plus aggregate receipt | PENDING / DISPOSABLE TARGET REQUIRED | — |
| K27 | With native request logging enabled, one BG request produces one masked native request row and one content-free usage row; disabled logging produces neither while generation still completes. | `docs/POCKETRISU-1.9-KEI-K27-BG-LOGGING-VALIDATION.md` plus aggregate receipt | PENDING | — |
| K13 | Real classic OpenAI-compatible and Gemini/Vertex provider streams remain complete and ordered across emoji/reasoning/tool/signature content and background return. | `docs/POCKETRISU-1.9-KEI-K13-VALIDATION.md` | PENDING | — |
| K14 | Balanced/Strong/Off streaming display, scroll anchoring, final render, translation gating, metadata, and BG return. | `docs/POCKETRISU-1.9-KEI-K14-VALIDATION.md` | NOT EXERCISED — USER DOES NOT USE STREAMING | The user explicitly skipped this row because streaming is not used. This is not recorded as a pass. |
| K16 | Hotkey master/bindings, protected-start gesture exclusion and cancellation, character-list boundaries, and opt-in single mobile Back stop/removal. | `docs/POCKETRISU-1.9-KEI-K16-VALIDATION.md` | LIVE CORRECTION ADMITTED / RE-L3 PENDING | The instructed Accessibility path had no Hotkey item, and official 1.9's outer width guard made the actual top-level page unreachable on iPhone. The owner-local fix passed focused and aggregate gates and is now in the live 538-unit bundle. Top-level Hotkey and the remaining K16 scenarios still require physical observation. |
| K15 | Original and translated partial edit, exact/multiple/unmappable ranges, stale-identity refusal, active-swipe ownership, lifecycle/UI stress, and disable cleanup. | `docs/POCKETRISU-1.9-KEI-K15-VALIDATION.md` | LIMITED PASS — ORDINARY PARAGRAPH AFFORDANCE | The user reported the batch item normal and described tapping one paragraph, then seeing its edit button at that paragraph's upper-left. That is the ordinary K15 partial-edit affordance. Translated, multiple/unmappable, stale-identity, swipe-owner, and stress surfaces were not separately distinguished, so they are not inferred passed. |
| K11 | Native Hypa behavior plus manual prefix/frontier, preview/reroll/cancel/apply, stale refusal, CBS/editprocess, supported BG return, and persistence. | `docs/POCKETRISU-1.9-KEI-K11-VALIDATION.md` | INTERRUPTED — BG LIFECYCLE FINDING | The user reached this row after an earlier generation but the gray stage-zero circle remained, blocked the next request, and delayed later indicator appearance. K11 behavior was not exercised; the root cause belongs to BG direct-generation lifecycle and is locally corrected but not live-admitted. |
| K12 | Translation-cache panel search/reveal/copy/edit/CAS/delete, cancel and unused scan, late-result cancellation, configured BG route, K14 composition, and available-provider/UI stress. | `docs/POCKETRISU-1.9-KEI-K12-VALIDATION.md` | PENDING | — |

## Result recording rules

- Record the exact screen, action, and observed result, including any unsafe
  signal. Do not infer a pass from silence or from another row.
- Record unavailable providers, unavailable hardware, or intentionally skipped
  scenarios as not exercised, not passed. A later publication decision may
  explicitly accept that residual risk; silence does not convert it to a pass.
- Do not use existing user backups, existing user personas, or real cache
  entries as destructive fixtures. Disposable additions are named and
  removed only through normal UI after their own observation is captured.
- Do not run K26 destructive restore against this live user-data tree. Its
  row remains pending until a separate disposable target is prepared and
  verified.
- If a finding appears, stop that affected scenario and preserve the exact
  state needed to diagnose it. Queue the finding for the deferred fix batch;
  unrelated L3 rows may continue. Later fixes still use separate owning
  feature/infrastructure commits and rerun their affected focused and
  aggregate gates before the one batched live update.
- No push, tag, release, or publication decision occurs until every required
  row is resolved or explicitly recorded as not exercised/blocking.
