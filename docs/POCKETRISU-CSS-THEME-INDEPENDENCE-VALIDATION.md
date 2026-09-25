# Personal CSS theme independence

`0.2.3-experimental.7` makes Personal CSS, appearance tokens, and chat fonts
work with any PocketRisu theme, including Custom HTML. The chat font replaces
only the message body's base font.

## Findings that shaped the design

- Every theme renders message text through the same root:
  `.default-chat-screen .risu-chat[data-chat-index] .chattext`. Custom HTML's
  `<risutextbox>` uses the same text-box snippet. Only PocketRisu Standard adds
  `.nodeonly-standard` to the chat screen.
- A theme's CSS reaches the page in two ways. The global `#customcss` element
  is appended to `body` after the static `#app` root. Custom HTML can also
  render `<style>` inside a message, which places it within `#app`. Both come
  before the Personal CSS run. (An earlier revision of this record said that
  Custom HTML does not render `<style>`. That was wrong, and the ordering
  conclusion does not depend on it.)
- Upstream styles every element with `* { font-family: var(--risu-font-family) }`.
  Children therefore do not inherit a parent's `font-family`, but they do
  inherit the `--risu-font-family` variable. Themes that intend inheritance
  already set that variable, as the tested Custom HTML theme does on its root,
  headings, and quote marks.

## Design

- **Gates.** Only Safe Mode, the master switch, and unsupported appearance data
  suppress Personal CSS. The theme is no longer a gate.
- **Chat toggles.** Alignment, Korean word keeping, and code-block wrapping drop
  `.nodeonly-standard` and move to definition revision 2. Stored overrides of
  those items keep their authored CSS and show that a newer default exists. The
  minimal composer keeps its Standard scope because the composer structure it
  targets is Standard-only.
- **Order.** Personal style nodes form one contiguous run immediately after
  `#customcss`, or at the end of `head` when `#customcss` does not exist. A
  MutationObserver restores the run whenever `#customcss` is recreated.
  Equal-specificity conflicts therefore resolve to Personal CSS, whichever side
  changed last. This reverses the earlier plan (section 9.3), which placed
  global `customCSS` after Personal CSS.
- **Chat font, body only.** The rule sets `--risu-font-family` and
  `font-family` with `!important` on the text root only. Body text reaches the
  font through the upstream `*` rule. Any element whose font a theme, module, or
  character sets explicitly keeps that font. A zero-specificity monospace
  default covers code, and an explicit theme code font still wins.
- **Limit.** A theme rule that sets `font-family` directly on ordinary
  paragraphs (for example `.chattext p`) keeps its font. An enabled item in the
  Personal CSS editor can override it.

## Decision evidence

The upstream facts, the adopted rule, and the rejected alternatives are kept
as reproducible evidence in
[`docs/validation/personal-css-theme-independence-2026-09-25/`](validation/personal-css-theme-independence-2026-09-25/).

- `measure-cascade.cjs` checks the upstream anchors verbatim against a
  pristine source. It then measures computed font and alignment in Chromium
  for four cases (a `#customcss` theme, an in-message `<style>` theme,
  Standard, and an adversarial theme) under three rule variants.
- `results.json` is the observed output for the deployed CSS
  `index-CYOCyhvL.css` (SHA-256 `5570154813cf…d678`), Chromium 140.0.7339.16,
  and PocketRisu `v1.10.0` (`98e968339d1b3f91b9dac85bb3f2ebb5f90f9d14`).
  All 15 anchors matched.

### Upstream anchors (`v1.10.0`)

| Fact the design relies on | Location |
| --- | --- |
| Every element uses `font-family: var(--risu-font-family)` | [`src/styles.css:397-399`](https://github.com/PocketRisu/PocketRisu/blob/98e968339d1b3f91b9dac85bb3f2ebb5f90f9d14/src/styles.css#L397-L399) |
| The app font setting writes the same variable | [`src/ts/gui/colorscheme.ts:445`](https://github.com/PocketRisu/PocketRisu/blob/98e968339d1b3f91b9dac85bb3f2ebb5f90f9d14/src/ts/gui/colorscheme.ts#L445) |
| Global custom CSS feeds `#customcss`, and Safe Mode clears it | [`src/ts/gui/colorscheme.ts:450-455`](https://github.com/PocketRisu/PocketRisu/blob/98e968339d1b3f91b9dac85bb3f2ebb5f90f9d14/src/ts/gui/colorscheme.ts#L450-L455) |
| `#customcss` is appended to `body` | [`src/ts/stores.svelte.ts:120-133`](https://github.com/PocketRisu/PocketRisu/blob/98e968339d1b3f91b9dac85bb3f2ebb5f90f9d14/src/ts/stores.svelte.ts#L120-L133) |
| `#app` is static in `body` before it | [`index.html:20`](https://github.com/PocketRisu/PocketRisu/blob/98e968339d1b3f91b9dac85bb3f2ebb5f90f9d14/index.html#L20) |
| Themed messages share `.risu-chat[data-chat-index]` | [`src/lib/ChatScreens/Chat.svelte:1126-1127`](https://github.com/PocketRisu/PocketRisu/blob/98e968339d1b3f91b9dac85bb3f2ebb5f90f9d14/src/lib/ChatScreens/Chat.svelte#L1126-L1127) |
| Message text renders in `.chattext` | [`src/lib/ChatScreens/Chat.svelte:435`](https://github.com/PocketRisu/PocketRisu/blob/98e968339d1b3f91b9dac85bb3f2ebb5f90f9d14/src/lib/ChatScreens/Chat.svelte#L435) |
| Custom HTML `<risutextbox>` uses that text box | [`src/lib/ChatScreens/Chat.svelte:1089`](https://github.com/PocketRisu/PocketRisu/blob/98e968339d1b3f91b9dac85bb3f2ebb5f90f9d14/src/lib/ChatScreens/Chat.svelte#L1089) |
| Custom HTML renders in-message `<style>` | [`src/lib/ChatScreens/Chat.svelte:1097-1100`](https://github.com/PocketRisu/PocketRisu/blob/98e968339d1b3f91b9dac85bb3f2ebb5f90f9d14/src/lib/ChatScreens/Chat.svelte#L1097-L1100) |
| Only Standard adds `.nodeonly-standard` | [`src/lib/ChatScreens/DefaultChatScreen.svelte:1268`](https://github.com/PocketRisu/PocketRisu/blob/98e968339d1b3f91b9dac85bb3f2ebb5f90f9d14/src/lib/ChatScreens/DefaultChatScreen.svelte#L1268) |
| Standard is `''` and Custom HTML is `'customHTML'` | [`src/ts/setting/displaySettingsData.svelte.ts:22-27`](https://github.com/PocketRisu/PocketRisu/blob/98e968339d1b3f91b9dac85bb3f2ebb5f90f9d14/src/ts/setting/displaySettingsData.svelte.ts#L22-L27) |
| Safe Mode is the `toggleCSS` hotkey | [`src/ts/hotkey.ts:94-96`](https://github.com/PocketRisu/PocketRisu/blob/98e968339d1b3f91b9dac85bb3f2ebb5f90f9d14/src/ts/hotkey.ts#L94-L96) |

### Alternatives measured in `results.json`

| Variant | Theme-set dialogue marks, headings, and code | Plain body paragraphs | Decision |
| --- | --- | --- | --- |
| `chosen`: variable and font on the text root | Keep the theme fonts | Personal font | Adopted |
| `descendantWide`: former `:where(*)` rule with `!important` | Replaced by the personal font, including theme code fonts | Personal font | Rejected: erases theme typography |
| `containerFontOnly`: `font-family` on the root without the variable | Keep the theme fonts | Theme or app font, because of the upstream `*` rule | Rejected: does not reach body text |

Two further observations:

- **Order.** In the `#customcss` case, a Personal rule and a theme rule of
  equal specificity (`p.tie`) resolved to Personal when the Personal run
  followed the theme, and to the theme when it preceded it.
- **Adversarial theme.** A theme that set the font, the variable, and
  `text-align` on `.chattext` itself still yielded the personal font and
  centered text. A theme font on `p.lead` stayed, which is the documented limit.

Rejected without measurement: wrapping theme CSS in `@layer`. Unlayered app
styles would then beat every theme rule, and a top-level `@import` inside the
theme CSS would become invalid.

### When to revisit

Re-run `measure-cascade.cjs` and compare it with `results.json` when:

- a new upstream target is qualified;
- an anchor no longer matches;
- a theme reports that body text ignores the chat font or alignment; or
- Personal CSS appears to lose to theme CSS of equal specificity.

The design stops holding if upstream drops the `*` variable rule, renames the
`.chattext` or `.risu-chat[data-chat-index]` roots, or moves `#customcss`
after other theme style sources.

## Validation

Observed results:

- Measurement with the Chromium 1187 headless shell, using the candidate's
  compiled CSS, `index-D67cM-rY.css`:
  - **Tested Custom HTML theme:** body text, emphasis, list items, blockquote
    paragraphs, and table cells used the personal font and centered alignment.
    Lists, blockquotes, and tables stayed left. The theme's serif dialogue and
    thought marks, headings, and name kept the theme serif. Code stayed
    monospace.
  - **PocketRisu Standard:** every measured element matched the previous
    behavior.
  - **Adversarial theme:** a theme that sets the font, `--risu-font-family`, and
    `text-align` on `.chattext` itself still yielded the personal font and
    centered text. A theme font on `p.lead` stayed, as designed.
- WebKit could not be launched on this host because its system libraries are
  missing. Physical iPhone rendering remains an L3 check.
- `scripts/verify-personal-css.cjs` against the pristine `v1.10.0` export
  passed all five owner graphs. The complete graph has 42 packs, 985 units,
  366 paths, and 13 collisions. Each graph passed 93 tests, with zero-change
  reapply, compatibility UI rollback, reader preservation, and exact
  byte/mode revert.
- Candidate checks: Svelte diagnostics reported 0 errors and 0 warnings, and
  the production build transformed 7,990 modules.
- Patcher suite: 343/343 passed.
- Both installers are 8,132,290 bytes, mode 0755, SHA-256
  `82154db742d7413a15ad4519a346d688688d43cd8e1fcd9af6979b2632f3955b`.
  Repeated generation produced the same bytes.

## Live delivery

Before deployment, a read-only preflight observed:

- 0 active requests;
- 0 pending sends;
- no running model jobs; and
- 114 BG operation states, all `delivered`.

The server was stopped first. Apply changed 11 source files and the patch
state. Then these ran on the live source:

- frozen install;
- Personal tests: 93/93;
- Svelte diagnostics: 0 errors, 0 warnings;
- production build: 7,990 modules;
- BG bundle load check: `sendChat=function`;
- production prune; and
- restart.

Readback:

- PM2 online with 0 unstable restarts, and root HTTP 200.
- The served `index-DwQPAj_f.js` and `index-CYOCyhvL.css` match the local build.
  The served CSS contains the text-root font rule and no longer contains the
  descendant-wide font rule.
- All five SQLite databases passed `quick_check=ok`, and the database inode
  was unchanged.
- A new plan has 0 changes.
- The error log has no entries after the restart.

## Remaining gate

Check on iPhone with the Custom HTML theme:

- message alignment, the body font, and custom fonts apply;
- theme headings and dialogue marks keep the theme font; and
- the PocketRisu Standard appearance is unchanged.
