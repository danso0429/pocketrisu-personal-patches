# Personal CSS stable `v0.2.3` release receipt

## Outcome

`v0.2.3` promotes the Personal CSS editor and imported chat fonts, candidates
`0.2.3-experimental.1` through `.8`, to stable. It targets exact PocketRisu
`v1.10.0`.

Everything on `main` since `v0.2.2` belongs to this Personal settings work:

- the Personal settings pack, its tests, and its validation documents;
- the two scripts `verify-personal-css.cjs` and
  `rollback-personal-css-ui.cjs`;
- the CI branch entry for the editor branch; and
- one `v0.2.2` publication-readback document.

No other pack changed.

| Candidate | Validation record |
| --- | --- |
| experimental.1 | [Editor and fonts](POCKETRISU-PERSONAL-CSS-TOGGLE-EDITOR-VALIDATION.md) |
| experimental.2–3 | [Editor text](POCKETRISU-CSS-EDITOR-TEXT-VALIDATION.md) |
| experimental.4 | [Font picker](POCKETRISU-FONT-PICKER-VALIDATION.md) |
| experimental.5 | [Font save and direct switches](POCKETRISU-FONT-SAVE-SWITCH-VALIDATION.md) |
| experimental.6 | [Theme/master switch retention](POCKETRISU-CSS-GATE-RETENTION-VALIDATION.md) |
| experimental.7 | [Theme independence and body-only font](POCKETRISU-CSS-THEME-INDEPENDENCE-VALIDATION.md) |
| experimental.8 | [Save and feedback review](POCKETRISU-APPEARANCE-SAVE-FEEDBACK-REVIEW.md) |

## Physical gate and promotion decision

- **Recorded device checks.** The user reported the experimental.6, .7, and .8
  iPhone checks normal on 2026-09-25:
  - theme and master-switch round trips;
  - Custom HTML alignment and body-only fonts; and
  - stable save toasts with tappable controls underneath.

  The user has also been using the editor and fonts on the live instance
  throughout the candidate line.
- **Gate not run.** The editor plan's full 18-step device gate (section 15.5)
  was not recorded feature by feature. It covers:
  - trial and rollback, the cold recovery URL, and admitted scale;
  - CORS failure; and
  - font replacement with backup/restore preservation.
- **Decision.** The user explicitly decided to promote `v0.2.3` without that
  gate. It is recorded here as not run, not as passed. If a device problem
  appears in one of those areas, section 15.5 remains the checklist.

## Automatic qualification

The following are observed results on release content (`package.json`
`0.2.3`, Personal settings pack `0.5.7`).

- **Patcher suite:** 343/343 passed.
- **Owner graphs.** `scripts/verify-personal-css.cjs` passed all five graphs
  against a pristine `v1.10.0` export (`98e968339d1b3f91b9dac85bb3f2ebb5f90f9d14`).
  Each graph passed 101 tests, with zero-change reapply, compatibility UI
  rollback, reader preservation, and exact byte/mode revert.

  | Graph | Packs | Units | Paths | Collisions |
  | --- | --- | --- | --- | --- |
  | standalone | 1 | 115 | 66 | 0 |
  | startup | 2 | 134 | 69 | 0 |
  | lazy | 2 | 143 | 89 | 1 |
  | bg-lazy | 4 | 337 | 176 | 5 |
  | complete | 42 | 991 | 370 | 13 |

- **Fresh candidate** (pristine source plus the release installer):
  - status `current` with 42 packs;
  - client suite: 161 files, 1,840 tests;
  - server suite: 23 files, 233 passed, 12 skipped;
  - compatibility suite: 10 files passed, 1 skipped (74 tests passed, 5
    skipped);
  - Svelte diagnostics: 0 errors, 0 warnings;
  - production build: 7,994 modules; and
  - BG bundle load check: `sendChat=function`.
- **Upgrade and revert.**
  - From an exact `v0.2.2` install, the release changed 37 files, reached
    `current`, and re-planned to 0 changes.
  - From the live `experimental.8` content, the plan was empty.
  - Revert returned status `clean`. Every file's bytes and mode matched the
    pristine source. Four emptied directories remained: `PersonalSettings`,
    `personalSettings`, `pagefold`, and `vendor`. This is existing patcher
    behavior, and those directories contain no files.
- **Installers.** Both are byte-identical, mode 0755, 8,153,436 bytes,
  SHA-256 `2bd666826023d34bfbd7a9cc13da22d5b56665b00cebe9286a76110b78ec67a3`.

## Live delivery

Live already runs the experimental.8 content, and a release plan against live
reports no source change. No apply, rebuild, or restart was needed.

After publication, live readback showed:

- status `current` with 42 packs;
- a next plan with 0 changes; and
- PM2 online with 0 unstable restarts, and root HTTP 200.

## Publication readback

- Release commit `f8f795c` passed GitHub Actions `patch-integrity` run
  `36216743626` on `main`.
- Annotated tag `v0.2.3` peels to `f8f795c`.
- The GitHub Release `v0.2.3` is non-draft, non-prerelease, and Latest.
- Both attached installers were downloaded again into a new directory. Each is
  8,153,436 bytes with SHA-256
  `2bd666826023d34bfbd7a9cc13da22d5b56665b00cebe9286a76110b78ec67a3`, and
  each is byte-identical to the local build.
