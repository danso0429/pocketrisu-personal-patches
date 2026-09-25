# Personal CSS gate retention follow-up

`0.2.3-experimental.6` fixes Personal CSS remaining suppressed after an
ordinary theme or master-switch round trip.

## Defect

`PersonalCssRuntime.sync()` called `requireValidation()` on every
active-to-inactive transition. PocketRisu stores PocketRisu Standard as
`db.theme === ''` and Custom HTML as `'customHTML'`
(`src/ts/setting/displaySettingsData.svelte.ts`, official `v1.10.0`), and
Personal CSS applies only under Standard. Selecting Custom HTML therefore set
the tab-scoped validation sentinel. After returning to Standard:

- every Personal CSS node and root token, including built-in chat fonts, stayed
  removed;
- enabling a CSS item failed with the suppressed-state error;
- selecting a custom font failed with the suppressed-state error;
- the recovery notice remained visible; and
- turning the master switch off and on re-armed the same sentinel.

CSS disabled while suppressed also stored `cssToggles.needsValidation: true`,
which kept later sessions suppressed until the explicit recovery-exit trial.
That stored marker is intentional and unchanged.

The plan (section 5.4) requires revalidation only after suppressed-state writes;
closing a gate is an immediate removal. The implementation had generalized the
rule to every gate close.

## Change

- Theme and master-switch round trips reapply the confirmed stored snapshot.
- Leaving Safe Mode still requires the activation trial. Safe Mode is the
  upstream `toggleCSS` emergency hotkey, and the existing test for it is kept.
- A gate change during an in-flight save sets the interruption marker and
  requires validation explicitly, instead of relying on the removed general
  rule.
- Stored `needsValidation` repairs still block activation.

## Validation

Observed results:

- A standalone reproduction against the pre-fix live source showed empty tokens,
  zero style nodes, and `suppressed=true` after theme and master round trips.
  With the fix it shows the original tokens and one style node, with no session
  sentinel.
- `scripts/verify-personal-css.cjs` against a pristine `v1.10.0` export
  (`98e9683`) passed all five owner graphs (standalone, startup, lazy, bg-lazy,
  and complete: 42 packs, 984 units, 366 paths, and 13 collisions). Each graph
  passed 10 files and 93 tests, with zero-change reapply, compatibility UI
  rollback, reader preservation, and exact byte/mode revert.
- Patcher suite: 343/343 passed.
- Both installers are 8,129,407 bytes, mode 0755, SHA-256
  `528dbec1aae509b05d2b395294750bd2402d6908a2ba37c80af4c65cb512b84b`.
  Repeated generation produced the same bytes.

## Live delivery

Before deployment, a read-only preflight observed 0 active requests,
0 pending sends, 0 running model jobs, and 114 BG operation states, all
`delivered`. The only non-terminal import row had been unchanged for about
32 days. The server was stopped first. The live apply changed only
`cssToggleRuntime.ts`, its test, and the patch state. Then these ran on the
live source:

- frozen install;
- Personal tests: 93/93;
- Svelte diagnostics: 0 errors, 0 warnings;
- production build: 7,990 modules;
- BG bundle load check: `sendChat=function`;
- production prune; and
- restart.

Readback:

- PM2 online with 0 unstable restarts, and root HTTP 200.
- The served main asset `index-DNo0hORl.js` (2,154,975 bytes) matches the
  local build and contains the Safe Mode–guarded rule.
- All five SQLite databases passed `quick_check=ok`, and the database inode
  was unchanged.
- Patcher status is `current`, and a new plan has 0 changes.
- The error log has no entries after the restart.

## Physical iPhone L3

Checked on iPhone: switching the theme to Custom HTML and back, and turning the
master switch off and on, left Personal CSS, built-in fonts, and custom-font
selection working without the recovery notice.

A device that already has a stored `needsValidation` marker still needs one
"전체 규칙 시험 적용 · 복구 종료" confirmation.

The user reported on 2026-09-25 that all of these iPhone checks passed. No
separate per-step timings or screenshots were supplied.

This result covers only this change. Stable promotion of the `0.2.3` line
still needs the full 18-step device gate in the editor plan (section 15.5),
recorded by feature.
