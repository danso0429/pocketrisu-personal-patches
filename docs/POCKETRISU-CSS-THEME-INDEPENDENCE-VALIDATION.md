# Personal CSS theme independence

`0.2.3-experimental.7` makes Personal CSS, appearance tokens, and chat fonts
work with any PocketRisu theme, including Custom HTML. The chat font replaces
only the message body's base font.

## Findings that shaped the design

- Every theme renders message text through the same root:
  `.default-chat-screen .risu-chat[data-chat-index] .chattext`. Custom HTML's
  `<risutextbox>` uses the same text-box snippet. Only PocketRisu Standard adds
  `.nodeonly-standard` to the chat screen.
- Custom HTML does not render `<style>` elements from the Chat HTML. A theme's
  CSS reaches the page only through the global `#customcss` element, which is
  appended to `body`.
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
