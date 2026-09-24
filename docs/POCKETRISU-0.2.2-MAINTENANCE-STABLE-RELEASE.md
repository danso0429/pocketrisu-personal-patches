# PocketRisu maintenance stable `v0.2.2` release receipt

Date: 2026-09-24 KST

## Outcome

The stable all-or-nothing installer targets exact official PocketRisu 1.10.0.
The candidate fixes JPEG-wrapped CharX detection, request-log storage totals,
and empty-chat payload ordering. A final-composition storage test records the
missing-payload recovery and outer autosave behavior. The user reported the
presented iPhone L3 scenarios normal for native CharX import, FastImport's
first-tap picker, empty-chat persistence, and initial Request/System Logs.

The additional `fastimport-ios-picker` owner makes the observed iOS clipboard
correction reapplicable. At plugin load, it examines the execution copy of the
installed API 2.1 plugin. It changes one line only when name, display name,
and full original script SHA-256 match the admitted revision, then checks the
patched SHA-256. Already corrected scripts pass through unchanged. Unknown
revisions and hash failures retain the original script and emit a warning.
The owner does not write or replace the plugin database. The separately
reconstructed, guarded migration tool remains for explicit persistent repair
of a particular installation.

## Automatic qualification

| Boundary | Observed value |
| --- | ---: |
| Resolved packs/adapters | 42 |
| Ordered units | 941 |
| Managed source paths | 344 |
| Deterministic ordering collisions | 13 |
| Re-plan changes | 0 |

- Patcher tests: 50/50 files passed.
- Frontend: 153 files and 1,758 tests passed, including final composed
  FastImport load ordering and iOS/desktop script behavior.
- Server: 23 files, 233 passed and 12 provider-gated skips.
- Compatibility: 74 passed and five skips.
- Svelte diagnostics: zero errors and zero warnings.
- Help keys: 439 English and 439 Korean, zero missing references.
- Production client build: 7,941 modules transformed.
- BG bundle builder load check: `sendChat=function`.
- Exact-1.10 fresh apply/current/re-plan and previous-candidate upgrade/current/
  re-plan passed. Generated-installer revert restored all 344 managed source
  paths byte-for-byte and mode-for-mode; new owned files were absent.
- The primary and `all` installers were rebuilt twice, are byte-identical,
  mode 0755, 7,902,434 bytes, and pass CJS syntax checks. Both SHA-256 values
  are `88ae0e251694b705abcc9450c264ef2fa468edfb6ac8a287d550a07fe7b2ea66`.

## Runtime audit

Flat discovery for the new owner covers installed plugin enumeration, exact
identity and SHA admission, WebCrypto failure, source occurrence count,
patched-hash confirmation, plugin clone ordering, API 2.1 execution, desktop
clipboard behavior, reinstallation, unsupported source revisions, loader
errors, source ownership, and exact revert.

Structural anchors are the composed `loadPlugins` caller, the owned
`fastImportIOSPicker.ts` helper, the unchanged `loadV2Plugin` execution path,
the exact-1.10 manifest, and the 42-pack complete graph. The focused tests run
the composed caller and both iOS/desktop script branches. Mutation is confined
to one array entry in a cloned plugin list; the database and other plugin
entries are not assigned. A missing or duplicate exact target, unknown hash,
unexpected source shape, or hash failure returns the original list. The
existing installed patched hash returns unchanged.

Triage: reinstallation losing the persistent one-off correction is fixed by
the runtime owner. Unknown future plugin revisions remain a review surface:
they continue to run their original code, so the iOS issue could recur after
an update until that revision receives exact-source review. Physical browser
activation for this new loader was not separately measured; the admitted
script bytes and the prior iPhone observation are recorded independently.

## Runtime and release boundaries

The earlier live candidate already applied the CharX, request-log, chat-save,
and persistent FastImport correction. The new owner adds a runtime transform
for recognized original FastImport scripts, including after plugin replacement
or reinstallation. Its final caller runs before API 2.1 script execution. A
matching already corrected live script retains the same bytes.

The iPhone L3 report predates the additional loader owner. The tested resulting
script bytes are identical to the live corrected script; this receipt does not
claim a second physical iPhone test of the new loader revision. Unknown future
FastImport source revisions require a new exact-hash review.

## Live delivery

Immediately before source writes, read-only checks found native running jobs,
pending sends, BG active states, and BG result keys all at zero. The generated
installer plan named only `plugins.svelte.ts`, the new FastImport helper and
test, and patch state. PM2 was stopped first; the installer changed exactly
those four paths. The stopped tree passed the focused FastImport/save tests
19/19 and Svelte diagnostics 0/0. A production build transformed 7,941 modules.
The BG bundle builder's load check resolved `sendChat=function`, production
prune removed 109 development packages, and a post-prune module/BG load passed.

After restart, PM2 reported PocketRisu 1.10.0 online at PID 1493836 with
restart count zero and unstable restarts zero. Root, build stamp, and main
asset returned HTTP 200. Served and local `index-DfTVdTMg.js` were both
2,047,743 bytes with SHA-256
`a1a31ff03ae7e04e6f980713d1a5217c3f75c2d30df3e4f4a49615f695e4ec59`.
The served stamp was
`1.10.0-ed1190f38145e33960f1bf172b9ef623d6edd29a05820a595b626450b0c7b7b7`.
The live patch status was 42 packs and 344/344 paths current, drift zero; the
941-unit, 13-collision next plan changed zero files. All five SQLite databases
returned `quick_check=ok`, and final native/BG active and result work was zero.

Read-only FastImport inspection found 12 installed plugins and the known
corrected script SHA-256
`5777e74585a3dfc7993cd53fef58c7ad2e649d1d6d167aaf8457355eb1885e94`.
It returned `already-applied` without another database write. The pre-existing
chunk-aware rollback backup remains retained.

Final main CI, annotated tag, Latest Release, and downloaded asset readback
are recorded after publication.
