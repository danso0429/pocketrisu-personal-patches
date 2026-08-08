# PocketRisu 1.9.0 Personal appearance validation

## Decision and boundary

The `personal-settings` pack adds a Personal → CSS appearance child page only
for exact PocketRisu 1.9.0. Its storage and runtime contract is:

```text
versioned personal settings
→ pure effective-feature resolver
→ one root token attribute
→ scoped static CSS and render conditions
```

PocketRisu 1.8.1 keeps its existing Personal Settings implementation and does
not receive an appearance adapter. PocketRisu Standard is the only qualified
theme. The user-owned `customCSS` value is not read, rewritten, or cleared by
the patch.

A read-only plan against the separately proved-pristine exact-1.8.1 base
resolved the same 18 existing Personal units. No unit ID or source path
containing `appearance` entered the order or changed-file set.

## Storage and activation contract

Appearance choices live below
`Database.pocketRisuPersonalSettings.appearance` with schema version 1. Reads
normalize missing or invalid known values only in memory. Leaf setters retain
unknown fields at the personal root, appearance root, and feature-group level.
An unknown future version or malformed known group is preserved and disables
the whole appearance feature instead of being rewritten.

The pure resolver emits a sorted, de-duplicated whitespace token list only
when all of these conditions hold:

- schema data is empty or supported;
- the master appearance switch is explicitly enabled;
- Safe Mode is inactive;
- the current theme is PocketRisu Standard.

No active feature means the `data-pocketrisu-css` attribute is absent rather
than present with default CSS variables. Bootstrap performs the first sync
before `loadedStore` becomes true; an app-root runtime reuses the same resolver
for database and Safe Mode changes and avoids redundant attribute writes.

## UI and feature ownership

The 1.9 native `SettingRenderer` owns the declarative rows. The Personal page
retains Import behavior as child tab 0 and adds CSS appearance as child tab 1.
Native Settings Search indexes the new array and sets the Personal submenu
store before navigation. Switch and select primitives receive the visible row
label and help-description IDs for accessible naming.

The features are deliberately split at behavior boundaries:

- Paperlogy, Noto Sans KR, or Noto Serif KR applies to the message root and
  descendants, while pre/code/kbd/samp preserve a monospace stack;
- centered prose leaves lists, quotes, code, and tables left aligned;
- Korean keep-all includes a long-token fallback and excludes code;
- narrow-screen wrapping targets `pre > code` without hiding overflow;
- minimal composer styling uses an explicit composer data hook and preserves
  sticky position, width, actions, and injected UI;
- the text triangle renders only for ordinary Send; resend and stop/loading
  retain their existing branches;
- compact sidebar spacing retains the original drop/touch hit region;
- avatar borders and panel dividers are independent controls;
- compact settings target only rows with `data-setting-id`;
- jailbreak hiding is a render condition that preserves the underlying value
  and reverses in Safe Mode.

The stylesheet is unlayered, linked after `nodeonly-standard.css`, and remains
before PocketRisu's runtime user custom-CSS element. Every consumer selector
is gated by an effective root token; no inactive default declaration enters
the cascade.

## Web-font boundary

The current text-only patch payload format cannot carry binary WOFF2 assets.
The stylesheet declares three Paperlogy weights and Galmuri14 from jsDelivr,
and imports Noto Sans KR plus Noto Serif KR from the official Google Fonts CSS
API. The combined mobile request returned HTTP 200, 191,659 bytes, 248
unicode-range variable WOFF2 declarations, and both expected family names on
2026-08-08. The font binaries remain external runtime dependencies; a
self-hosted variant requires a separately designed binary-aware payload path.

Paperlogy, Galmuri, and Noto CJK are documented under SIL OFL 1.1 in
`THIRD_PARTY_NOTICES.md`. Paperlogy is a new opt-in look because the previous
custom-CSS `@ font-face` spelling was invalid; it is not claimed as a visual
migration of the live computed style. Galmuri14 is declared so the current
app-level font name remains resolvable after a later custom-CSS migration.
The Noto KR instances cover the previewed CJK and Latin scripts but use Korean
forms for shared Han characters when the rendered chat has no language tag.

## Experimental.11 multilingual font extension

The font choice remains one typed enum leaf, not one boolean per face. The
resolver maps each non-app value to exactly one mutually exclusive root token:

```text
paperlogy      → chat-font-paperlogy
noto-sans-kr   → chat-font-noto-sans-kr
noto-serif-kr  → chat-font-noto-serif-kr
```

This extends schema version 1 without a migration. The getter recognizes the
new values, invalid future values normalize to `app` in memory, and the setter
still refuses invalid values without rewriting their stored bytes. Existing
`app` and `paperlogy` values retain their meanings.

The settings page renders Korean, English, Japanese, Simplified Chinese,
Traditional Chinese, and French samples with explicit `lang` attributes. It
uses `document.fonts.load()` to distinguish app font, temporarily inactive,
loading, loaded, failed fallback, and unsupported status rather than asking
the user to infer loading from subtle glyph differences.

The live custom CSS has an important `.risu-chat *` font declaration. A
font-family only on `.chattext` cannot override the explicit values on its
rendered paragraphs and inline descendants. The consumer therefore includes
`.chattext :where(*)`, then a later, more specific important rule restores
`pre`, `code`, `kbd`, and `samp` to the monospace stack. The custom-CSS source
itself remains unchanged and keeps final author override authority.

Automated evidence before live admission:

- patcher source tests: 38/38 files passed;
- exact-1.9 combination verifier: 2,048/2,048 raw selections, 1,024
  normalized graphs, 239 catalog-managed paths, maximum 587 resolved units,
  exact round trips passed with two workers;
- clean rolling-all staging client: 130 files and 1,549 tests passed;
- clean rolling-all staging server: 9 files and 163 tests passed;
- Svelte diagnostics: 0 errors and 0 warnings;
- production build: passed with the expected external Noto import and all
  three font tokens retained in the output CSS;
- BG bundle: 8,412,182 bytes, SHA-256
  `79bf8507271da12d0d54cedeb01112ec3a7a11b5771fa59cfbadd899fcff0021`,
  and `sendChat=function` load check passed; and
- generated installer re-plan: 28 resolved packs, six explicitly ordered
  overlaps, zero changed files, 234/234 active managed paths current.

Two discarded staging candidates exposed environment setup failures rather
than source failures. A symlinked dependency tree first refused non-TTY
replacement, and a copied tree retained stale absolute links that produced
four AWS/Smithy diagnostics. Neither candidate was admitted. The recorded
passing receipt comes from a fresh baseline whose frozen dependency tree was
reconstructed from the lockfile.

## Experimental.11 live admission

At 2026-08-08 19:36 KST, commits `07c20c7` and `5dd009e` were already pushed
on `codex/pocketrisu-appearance`. Immediately before stopping PocketRisu,
read-only checks observed:

- running model jobs 0, deliverable unclaimed main jobs 0, pending sends 0,
  and stored orchestration result payloads 0;
- 122 durable operation states, all `delivered`;
- both SQLite `quick_check` results `ok`;
- database revision `1786182442923`, logical database size 19,526,728 bytes,
  and storage fingerprint
  `988a59c9a328ed24b7fbba60b6bbcbff658e5321785cb6707814e1c50984429e`;
- `customCSS` 19,579 bytes with SHA-256
  `a167939818d387cf49c7ed239f591eaa60e4aa7abed697264a674610015a7948`;
  and
- an existing appearance object with canonical SHA-256
  `5054cc8f255eedac926c9b258448658cc144dbc9e37a4c2f70caea059264ab64`.

The zero-work check was repeated immediately before PM2 stop. Transactional
apply then changed the nine expected language, help, appearance logic/test,
settings-data, Svelte, and CSS source files plus patch state. It did not write
the user database or custom CSS. The stopped live tree observed:

- frozen install reused 109 packages and downloaded none;
- frontend: 130 files and 1,549 tests passed;
- server: 9 files and 163 tests passed;
- Svelte diagnostics: 0 errors and 0 warnings;
- production build: 7,862 modules transformed and exit 0;
- BG bundle: 8,411,822 bytes, SHA-256
  `dd08f08cef797f063a667888e5b0dac6b3bbef4595d6446c014789a7e3313396`,
  with `sendChat=function` load check;
- generated-installer re-plan: 28 resolved packs, six explicitly ordered
  overlaps, and zero changed files; and
- patch status: `current`, 28 packs, and 234 managed paths.

Production prune removed the 109 development packages while `express`,
`better-sqlite3`, and `msgpackr` remained resolvable. After restart,
PocketRisu 1.9.0 was online at PID 3970439 with zero unstable restarts and zero
active requests. Root HTTP returned 200. Served and local
`/assets/index-MZkyTypy.js` both measured 2,012,333 bytes with SHA-256
`6430e082f74a3d844ed91627ab4d08cc6204b9c8c28916cc48da0eccba1c2ec7`.
The served stylesheet retained the Google Fonts import and all three font
tokens, and the unauthenticated BG cache-status route returned 401.

The official Noto CSS request returned HTTP 200, 190,295 bytes, 248
`@font-face` declarations, and both requested family names in the live
environment. The PM2 error log retained its exact pre-stop inode, size, and
modification time. Post-restart database revision, logical size, storage
fingerprint, database and model-job DB inode/size, appearance hash, and
custom-CSS bytes/hash were unchanged. Both SQLite checks remained `ok`; active,
unclaimed, pending, and result work remained zero; and all 122 retained durable
states remained `delivered`.

No custom-CSS migration, font-choice write, paid request, physical device
action, stable tag, or release was part of this admission. Visual selection,
load-status display, mixed-script rendering, monospace preservation, and Safe
Mode restoration remain the physical L3 boundary.

## Automated evidence recorded before live admission

- focused patcher test: `test/personal-settings.test.cjs` passed;
- complete patcher suite: 38 test files passed;
- isolated exact-1.9 appearance candidate: 4 frontend files and 19 tests
  passed;
- isolated Svelte diagnostics: 0 errors and four pre-existing
  `DefaultChatScreen.svelte` warnings;
- isolated production build: 7,803 modules;
- exhaustive exact-1.9 catalog: 2,048 raw selections, 1,024 normalized graphs,
  two workers, exact round trips passed.

The first composition scan identified an ambiguous DefaultChatScreen import
anchor when bg-preserve was selected. The final unit is explicitly ordered
after the bg-preserve import owner, and the complete exhaustive run above is
the post-correction result.

Live admission, asset/readback smoke checks, and physical iPhone behavior are
recorded only after they are observed.

## Final rolling-all candidate

The post-documentation patcher suite passed all 38 test files. On a fresh copy
of the proved-pristine exact-1.9 base, the final `all` preset resolved 587
units over 234 managed paths. Six known cross-pack overlaps were explicitly
ordered and no unordered collision remained. The complete candidate observed:

- frontend: 130 files and 1,545 tests passed;
- server: 9 files and 163 tests passed;
- Svelte diagnostics: 0 errors and 0 warnings;
- production build: 7,862 modules transformed and exit 0;
- BG bundle: 8,464,290 bytes, SHA-256
  `0adafe08a926bc9810d3b1e339aa4c873c321abcdd5aed91a9a72654e3b2cde7`,
  with `sendChat=function` load check;
- built CSS and JavaScript assets contain the appearance token selectors and
  the Personal appearance UI/runtime strings;
- repeated plan and apply: zero changed files;
- revert: every tracked source byte returned to the exact base; only the two
  expected untracked BG build products remained.

The first restricted server run passed 7 of 9 files but could not bind
`127.0.0.1`; `model-jobs` and `request-logs` reported `listen EPERM` and hook
timeouts. The unchanged 9-file server command was rerun with local socket
permission and passed all 163 tests. This distinguishes the sandbox boundary
from an assertion failure.

The production build retained its existing CSS Highlight pseudo-element,
externalized browser module, plugin-timing, dynamic-import, and large-chunk
warnings. They did not stop the build. The appearance stylesheet introduced
no new diagnostic or build failure.

## Live admission

At 2026-08-08 17:14 KST, the pushed implementation boundary was commits
`000b06b`, `426e9ec`, and `a558d57`. Immediately before the stop, read-only
checks observed:

- PM2 online at PocketRisu 1.9.0, PID 3509259, zero unstable restarts, and zero
  active requests;
- queued/running model jobs 0, deliverable unclaimed main jobs 0, pending sends
  0, and result payloads 0;
- 138 durable operation states, all `delivered`;
- both SQLite `quick_check` results `ok`;
- database revision `1786174842182`;
- `customCSS` 19,579 bytes with SHA-256
  `a167939818d387cf49c7ed239f591eaa60e4aa7abed697264a674610015a7948`;
- Standard theme and app font `custom/Galmuri14`; and
- no existing personal appearance object.

The exact live plan reported 28 packs, 587 units, six ordered overlaps, 25
appearance-owned or appearance-hook source changes, and patch state. PM2 was
stopped before transactional apply. The stopped live tree then observed:

- frozen install: 109 packages reused, zero downloaded;
- frontend: 130 files and 1,545 tests passed;
- server: 9 files and 163 tests passed;
- Svelte diagnostics: 0 errors and 0 warnings;
- production build: 7,862 modules transformed;
- BG bundle: 8,409,224 bytes, SHA-256
  `48297fd2ba0b52c57bcda1c9ea37c4b5ff7a2c98c954447e9e3bce2917ffe43c`,
  with `sendChat=function` load check;
- production JavaScript contained no patch ownership marker and the built CSS
  and JavaScript contained the appearance token/UI payloads;
- repeated plan: 28 packs, 587 units, six ordered overlaps, zero changed
  files, and all 234 managed paths current; and
- production prune removed the 109 development packages while `express`,
  `better-sqlite3`, and `msgpackr` remained resolvable.

After restart, PocketRisu 1.9.0 was online at PID 3947658 with zero unstable
restarts and zero active requests. Root HTTP returned 200 with 3,512 bytes.
Served/local `/assets/index-DOiiECqw.js` both measured 2,009,698 bytes and
SHA-256
`b2400d73e977c091f95fa22eba61fe8ecf96e91281dbe52e299c54383b5e0e23`.
Both unauthenticated BG status routes returned 401. The PM2 error log retained
its exact pre-stop size and modification time.

Post-restart database revision, custom-CSS bytes/hash, theme, app-font fields,
DB inode/size, backup inode/size, and both `quick_check` results remained
unchanged. No appearance object was written. Active model jobs, pending sends,
deliverable unclaimed main jobs, and result payloads remained zero. Retention
reduced the already-delivered durable tombstones from 138 to 135 during
restart; every remaining state was still `delivered` and no result payload was
present. No paid request, physical device action, custom-CSS migration, stable
tag, or release was part of admission.

## User-data migration gate

The current live `customCSS` remains separate from this implementation. A
future migration requires a new explicit approval immediately before the
write, plus durable original bytes, SHA-256, byte length, app version, database
revision/CAS, pre-write recheck, post-write readback, and an exact restore
exercise. Galmuri availability must be confirmed before clearing any custom
font declaration. Existing `customHTML` stays out of scope.
