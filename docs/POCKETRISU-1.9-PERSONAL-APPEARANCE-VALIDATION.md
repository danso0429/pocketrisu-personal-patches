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

- Paperlogy applies to message prose, while pre/code/kbd/samp preserve a
  monospace stack;
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
This checkpoint therefore declares three Paperlogy weights and Galmuri14 from
jsDelivr. All four exact URLs returned HTTP 206 with `font/woff2` during the
2026-08-08 check. This adds a runtime network dependency; a self-hosted variant
requires a separately designed binary-aware payload path.

Paperlogy and Galmuri are documented under SIL OFL 1.1 in
`THIRD_PARTY_NOTICES.md`. Paperlogy is a new opt-in look because the previous
custom-CSS `@ font-face` spelling was invalid; it is not claimed as a visual
migration of the live computed style. Galmuri14 is declared so the current
app-level font name remains resolvable after a later custom-CSS migration.

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

## User-data migration gate

The current live `customCSS` remains separate from this implementation. A
future migration requires a new explicit approval immediately before the
write, plus durable original bytes, SHA-256, byte length, app version, database
revision/CAS, pre-write recheck, post-write readback, and an exact restore
exercise. Galmuri availability must be confirmed before clearing any custom
font declaration. Existing `customHTML` stays out of scope.
