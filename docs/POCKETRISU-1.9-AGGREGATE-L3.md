# PocketRisu 1.9 aggregate iPhone L3 — work in progress

> **Started:** 2026-08-02 KST
>
> **Admitted live candidate source:** `codex/pocketrisu-1.9-rebase` at
> `1fe0402b060b947c031abb7da6980dc1ac2795f2`
>
> **Exact target:** official PocketRisu 1.9.0 / PocketRisu commit
> `85a65f3137b45c8de4a8d21a9887be213b1ac3fc`
>
> **State:** live aggregate candidate admitted; the first physical iPhone
> observations are recorded below. K19 has limited normal observations while
> its physical bundle marker remains unresolved; VoiceOver was intentionally
> not exercised. The K16 route defect identified by source inspection is fixed
> and qualified only in the local 538-unit candidate. The live tree remains on
> the pre-correction 537-unit candidate. The user chose to finish the remaining
> first-pass L3 observations before batching fixes, one live update/restart,
> and all affected re-L3 scenarios.

## Authority and boundaries

The implementation and automated qualification authority is
`docs/POCKETRISU-1.9-AGGREGATE-VALIDATION.md`. This receipt records the later,
separately authorized live candidate admission and each physical L3 result.
It does not rewrite the earlier aggregate receipt's historical observation
that no live mutation occurred while that receipt was produced.

The user explicitly authorized the live candidate apply and the required
PocketRisu restart for this L3 session. That authorization does not include a
push, tag, release, publication, another restart, or destructive use of
existing user backups/personas/cache as test fixtures.

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

## First physical observation and K16 correction

The user reported that Hotkeys were not visible under Accessibility, chose not
to exercise VoiceOver because it is not part of their practical use, and
reported the remaining exercised viewer interactions as normal. The result is
recorded narrowly: swipe, arrow navigation, both image boundaries, and
rotation were observed normal. Asset filtering/search, module-viewer behavior,
disposable asset mutation, and VoiceOver/focus were not part of that
observation and are not inferred passed. The exercised swipe/arrow controls are
native 1.9 behavior, so they do not independently prove which patched PWA
bundle was loaded.

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

This correction has not been applied to live PocketRisu. It is the first item
in the deferred aggregate fix/re-L3 batch rather than an immediate restart
request. When that later batch candidate is admitted, its affected K16 check
is top-level Settings → Hotkey (설정 → 단축키). The missing live control is not
attributed to cache or user error. A post-correction read-only inspection still
found live state format 2 with profile `all`, 28 packs, 537 units, and 217
managed files; live `Settings.svelte` still contains the official
`window.innerWidth >= 768` route guard and no K16 route marker.

## Deferred fix and re-L3 batch policy

The user chose the following workflow because the Kei candidate has many
independent L3 scenarios:

- continue the first-pass L3 ledger on the current live 537-unit candidate for
  scenarios that are not blocked by a known finding;
- when a new finding appears, stop only that affected scenario, preserve its
  exact observation and caller/state boundary, and queue it rather than
  interrupting the first pass for an immediate live update;
- after the first pass, implement queued findings in their owning feature or
  infrastructure boundaries. “One batch” means one integration cycle, not one
  mixed commit: feature-local commits, receipts, focused adversarial gates,
  owner-present/absent graphs, exact revert, and L2.5 remain separate;
- after all queued fixes pass their affected gates, regenerate installers once
  through the canonical builder, run the aggregate combination/target gates,
  and request one explicit live apply/restart authorization; and
- on that single updated candidate, run all queued re-L3 scenarios together
  while retaining separate result rows.

A finding that indicates immediate user-data, paid-result, or active-work risk
still stops use of that affected path; batching does not authorize continuing
an unsafe scenario or mutating live data.

## Physical L3 result ledger

`PENDING` means no user observation has been supplied. Each row closes only
from the concrete screen/action/result evidence in its cited receipt; passing
one row does not imply another row passed.

| ID | User-visible scenario | Authority | Status | Observed result |
| --- | --- | --- | --- | --- |
| Bootstrap | Fully close and reopen the PocketRisu PWA; confirm a current-candidate screen such as top-level Settings → Hotkey or the Language translation-cache panel is present before attributing later behavior to this bundle. | This receipt | PENDING / INSTRUCTION CORRECTED | The former Accessibility → Hotkeys marker was invalid, and the exercised viewer controls are native 1.9 behavior rather than a bundle marker. The server served the admitted asset, but the physical loaded-bundle marker remains unresolved until the corrected candidate is admitted and observed. |
| K19 | Native Asset Viewer image-only filtering, search, one-step swipe/arrows, boundaries, VoiceOver labels/focus return, rotation, touch targets, module viewer, and unchanged disposable asset mutation. | `docs/POCKETRISU-1.9-KEI-K19-VALIDATION.md` | LIMITED NORMAL OBSERVATION / BOOTSTRAP PENDING / VOICEOVER NOT EXERCISED | Swipe, arrows, both boundaries, and rotation were reported normal. VoiceOver was intentionally skipped by user choice. Filtering/search, focus, touch-target measurement, module viewer, and disposable asset mutation remain unobserved; the native controls alone do not identify the loaded patch bundle. |
| K29-F05 | Leave one paid ordinary BG result unconsumed across an overnight mobile absence; return to one materialization and exact ACK cleanup without a duplicate or missing paid response. | `docs/POCKETRISU-1.9-KEI-K29-RETENTION-VALIDATION.md` | PENDING | — |
| K29 G09 | Background, kill/reload, and return during the existing qualified cold reroll; exactly one intended existing message/swipe is overwritten and no duplicate is appended. | `docs/POCKETRISU-1.9-AGGREGATE-VALIDATION.md` | PENDING | — |
| K22 | Persona picker name/note search, Folder/Unfiled filters, ordinary and PersonaBind identity, selected-folder disposable create/import, cold persistence, stale-folder fallback, cancel, and invalid-file behavior. | `docs/POCKETRISU-1.9-KEI-K22-PICKER-VALIDATION.md` | PENDING | — |
| K26 | On a separately prepared disposable backup target only, cover local-file, server-file, and snapshot restore, fresh timestamped snapshot, forced failure stop, one-use same-target retry, and wrong-target/replay refusal. | `docs/POCKETRISU-1.9-KEI-K26-RESTORE-VALIDATION.md` plus aggregate receipt | PENDING / DISPOSABLE TARGET REQUIRED | — |
| K27 | With native request logging enabled, one BG request produces one masked native request row and one content-free usage row; disabled logging produces neither while generation still completes. | `docs/POCKETRISU-1.9-KEI-K27-BG-LOGGING-VALIDATION.md` plus aggregate receipt | PENDING | — |
| K13 | Real classic OpenAI-compatible and Gemini/Vertex provider streams remain complete and ordered across emoji/reasoning/tool/signature content and background return. | `docs/POCKETRISU-1.9-KEI-K13-VALIDATION.md` | PENDING | — |
| K14 | Balanced/Strong/Off streaming display, scroll anchoring, final render, translation gating, metadata, and BG return. | `docs/POCKETRISU-1.9-KEI-K14-VALIDATION.md` | PENDING | — |
| K16 | Hotkey master/bindings, protected-start gesture exclusion and cancellation, character-list boundaries, and opt-in single mobile Back stop/removal. | `docs/POCKETRISU-1.9-KEI-K16-VALIDATION.md` | FINDING FIXED LOCALLY / QUEUED FOR AGGREGATE RE-L3 BATCH | The instructed Accessibility path had no Hotkey item, and official 1.9's outer width guard made the actual top-level page unreachable on iPhone. The owner-local fix passed automated gates but is not in the live bundle. No other K16 sub-scenario is inferred passed from this finding report. |
| K15 | Original and translated partial edit, exact/multiple/unmappable ranges, stale-identity refusal, active-swipe ownership, lifecycle/UI stress, and disable cleanup. | `docs/POCKETRISU-1.9-KEI-K15-VALIDATION.md` | PENDING | — |
| K11 | Native Hypa behavior plus manual prefix/frontier, preview/reroll/cancel/apply, stale refusal, CBS/editprocess, supported BG return, and persistence. | `docs/POCKETRISU-1.9-KEI-K11-VALIDATION.md` | PENDING | — |
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
