# PocketRisu Personal Font Targets Plan

Status: implemented as candidate `0.2.4-experimental.5` (feature `35ef255`, installer `48f53b5`); automated gates passed, iPhone L5 pending. Not pushed or applied live. See §9 for deviations and observed validation.
Base: patcher `origin/main` `d2bca03` (`package.json` `0.2.4-experimental.4`, `version.json` stable `0.2.3`).
Candidate: `0.2.4-experimental.5`.

## 1. Goal

Split the Personal settings font feature into two independent targets and simplify the font picker.

- Chat font: message bodies (`.default-chat-screen .risu-chat[data-chat-index] .chattext`).
- UI font: every other element.
- Each target has its own selected font and its own on/off toggle.

## 2. Agreed result

### 2.1 Font list (collapsible)

- Summary: `폰트 목록 · 채팅 {chat font name} · UI {UI font name}`.
- Expanded content, top to bottom:
  1. Preview block with its own border, sample `가나다라마바사 ABC xyz 日本語の文章 简体中文 繁體中文 Français été cœur`, size `text-sm` (0.875rem, 70% of the current `text-xl`). It renders the font assigned to the currently selected target.
  2. Target switch `[ 채팅 ] [ UI ]`.
  3. Font rows. Tapping a row assigns that font to the selected target. Each row shows a small `채팅` / `UI` badge where it is assigned. User fonts keep `이름변경 · 파일변경 · 삭제`.
- Built-in fonts: `Paperlogy`, `Galmuri14` only.
- Removed: `앱 폰트 사용` (`app`), Noto Sans KR, Noto Serif KR, IBM Plex Sans KR, Gowun Dodum, Gowun Batang, Hahmlet, and their Google Fonts / `@import` loading.

### 2.2 Toggles

- One row directly below the collapsible: `채팅 폰트 적용` and `UI 폰트 적용`.
- Chat toggle off: message bodies follow the UI font (current `app` behaviour).
- UI toggle off: the UI follows the native Display → Font setting (Default / Times New Roman / Custom).
- Turning a toggle off keeps the assigned font; turning it on again restores it.
- Default assignment for a target that has never been assigned: `Galmuri14`.

### 2.3 Add user font

- Bordered file picker so the tap target of `Choose file / No file selected` is visible.
- No separate `미리보기` step. A selected file, or a URL committed by blur/Enter, is fetched and previewed immediately at `text-sm`.
- Buttons: `적용` (adds the font to the list only, assigns nothing) and `취소`.
- Existing limits, format detection, SHA-256 verification and asset storage are unchanged.

## 3. Current structure (facts used by this plan)

- Effective installed copies: `editor-units.cjs` replaces four `units.cjs` owned files with full `editor-files/` content: `appearance.ts`, `personal-appearance.css`, `AppearanceSettings.svelte`, `PersonalAppearanceRuntime.svelte`. The `files/` copies of these four are replace anchors and must remain byte-identical; edits go to `editor-files/`.
- `editor-units.cjs` owns `files/` `appearanceValues.ts`, `customFonts.ts`, `customFontRuntime.ts`, `appearanceEditor.ts`, `CustomFontManager.svelte`, `FontNamePreview.svelte`.
- `personalAppearanceSettingsData.ts` and language/help strings are owned by `units.cjs`.
- Data: `db` personal appearance schema version 1. `chat.font` is `PersonalChatFont` (`app`, seven built-ins, `custom:<id>`); unknown values read as `app` and are rejected on write. `writeAppearanceGroup` hardcodes `version: 1`.
- Runtime: `syncPersonalAppearance` writes `html[data-pocketrisu-css]` tokens (`chat-font-<x>`, `chat-font-custom`). `CustomFontRuntime.activate` sets one `--personal-custom-font-family`. The CSS rule on `.chattext` sets `--risu-font-family` and `font-family` with `!important`.
- Native app font: `updateTextThemeAndCSS` sets `--risu-font-family` inline on `:root`; `* { font-family: var(--risu-font-family) }`.


## 4. Detailed implementation

Paths below are relative to `patches/personal-settings/settings/appearance/`. `files/` and `editor-files/` are named explicitly; the four `files/` replace anchors (§3) are never edited.

### P1. Data model — `files/src/ts/personalSettings/appearanceValues.ts`

Types:

- Replace `PersonalChatFont` with `PersonalFont = 'paperlogy' | 'galmuri14' | `custom:${string}``. All importers are updated in the same commit; no alias is kept.
- Add `PersonalFontTarget = 'chat' | 'ui'`.
- `NormalizedPersonalAppearance.chat` gains `fontEnabled: boolean`; add `ui: { font: PersonalFont; fontEnabled: boolean }`.
- `PersonalAppearanceLeafPath` gains `'chat.fontEnabled' | 'ui.font' | 'ui.fontEnabled'`.
- `groupNames` gains `'ui'`, so a non-record `ui` value makes the schema `unsupported` like other groups.

Read normalization (`readPersonalAppearance`), per target:

| raw `font` | raw `fontEnabled` | normalized `font` | normalized `fontEnabled` |
| --- | --- | --- | --- |
| `paperlogy` / `galmuri14` / valid `custom:<id>` | boolean | raw | raw |
| same | missing | raw | `true` for `chat`; `false` for `ui` |
| `app`, removed built-in, unknown, missing | boolean | `galmuri14` | raw |
| same | missing | `galmuri14` | `false` |

The `chat` + missing `fontEnabled` + valid font row keeps today's visible state for existing data. Defaults: both targets `galmuri14`, disabled.

Write (`validLeafValue`, `setPersonalAppearanceValue`, `getPersonalAppearanceValue`):

- `chat.font` / `ui.font` accept only `PersonalFont`; `app` and removed names are rejected.
- `chat.fontEnabled` / `ui.fontEnabled` accept booleans.
- A toggle write also writes the normalized font of the same target when the raw value is not a valid `PersonalFont`, so stored data never pairs `fontEnabled: true` with a legacy value. Implemented as a helper `setPersonalFontEnabled(db, target, enabled)` used by the UI and settings items.

Tokens:

- `featureOrder` gains `'ui.font'`. `chat.fontEnabled` and `ui.fontEnabled` are not token features.
- `resolveFeatureToken('chat.font' | 'ui.font')` returns `null` when the target is disabled, `<target>-font-custom` for custom fonts, otherwise `<target>-font-paperlogy | <target>-font-galmuri14`.
- The master `enabled` switch and Safe Mode still suppress every token (unchanged `resolvePersonalAppearanceTokens`).
- `PersonalAppearanceFeature` keeps excluding only `enabled`; `cssToggleDefinitions.ts` widens its `Exclude` to the four font leaves.

Font families and loading:

- `getPersonalChatFontFamily` → `getPersonalFontFamily(font)`: `Paperlogy`, `Galmuri14`, `null` for custom.
- Remove `chatFontStylesheetUrls`, `stylesheetLoads` and `ensurePersonalChatFontStylesheet`. Both built-ins come from `@font-face` in the personal stylesheet.

### P2. Snapshot and custom-font readiness — `files/src/ts/personalSettings/cssToggles.ts`, `cssToggleRuntime.ts`

- `cssSnapshot(db, safeMode, ready: { chat: string | null; ui: string | null })`.
  - `gates` include `chat.font`, `chat.fontEnabled`, `ui.font`, `ui.fontEnabled`.
  - `tokens` drop `<target>-font-custom` until `custom:${ready[target]}` equals that target's font.
  - `customFontId?: string` becomes `customFontIds: { chat?: string; ui?: string }`.
- Both callers (`cssToggleRuntime.ts:63`, `appearanceEditor.ts:22`) read `data-personal-chat-font-ready` and `data-personal-ui-font-ready` from `documentElement`.

### P3. Custom font runtime — `files/src/ts/personalSettings/customFontRuntime.ts`

- `new CustomFontRuntime(doc, target?: PersonalFontTarget)`. Preview instances omit `target`; `activate` throws without one.
- `activate` / `release` write and clear `--personal-<target>-custom-font-family` and `data-personal-<target>-font-ready` instead of the single global names.
- The `preparedFaces` / `faceOwners` pools are unchanged: when both targets use the same user font, each runtime claims the same loaded `FontFace`, and releasing one target keeps the face registered for the other.

### P4. Font editor orchestration — `files/src/ts/personalSettings/appearanceEditor.ts`, `customFonts.ts`

- `fontRuntime(doc, target)`: one owner per document and target.
- `fontEditBase()` / `commitFont` expected value: `{ fonts, chat: { font, fontEnabled }, ui: { font, fontEnabled } }` from raw appearance, so concurrent changes to either target are detected.
- `syncCustomFont()`: runs the existing per-selection logic once per target with independent generation and key. A target loads its user font only when that target is enabled and its font is `custom:<id>`. Status messages name the target (`채팅 폰트`, `UI 폰트`).
- `selectFont(target, value, base)`: replaces `selectCustomFont` and the built-in branch of `choose`. Writes `<target>.font`; for a custom font on an enabled target it pre-loads the face before commit and activates it after save (existing flash-free path).
- `setFontEnabled(target, enabled, base)`: writes through `setPersonalFontEnabled`; when enabling a target whose font is custom, it uses the same pre-load/activate path. Disabling releases that target's face after save.
- `trialAppearanceActivation()`: prepares the enabled custom font of each target before the trial and releases both on failure.
- `writeFontEntry(db, undefined, id)` (`customFonts.ts`): every target whose font is `custom:<id>` is reset to `galmuri14`; `fontEnabled` is kept. The `reset` action in the manager does the same for all custom assignments.

### P5. Runtime wiring and CSS — `editor-files/src/ts/personalSettings/appearance.ts`, `editor-files/src/styles/personal-appearance.css`

- `syncPersonalAppearance` drops the stylesheet loader call. `PersonalAppearanceRuntime.svelte` is unchanged (it already calls `syncPersonalAppearance` and `syncCustomFont`).
- CSS removals: the Noto `@import`; rules for `chat-font-noto-*`, `ibm-plex-sans-kr`, `gowun-*`, `hahmlet`; the old `chat-font-custom` rule on `--personal-custom-font-family`.
- CSS additions:

  ```css
  html[data-pocketrisu-css~="chat-font-galmuri14"] { --personal-chat-font-family: "Galmuri14", sans-serif; }
  html[data-pocketrisu-css~="chat-font-custom"] { --personal-chat-font-family: var(--personal-chat-custom-font-family, sans-serif); }
  html[data-pocketrisu-css~="ui-font-paperlogy"] { --personal-ui-font-family: "Paperlogy", sans-serif; }
  html[data-pocketrisu-css~="ui-font-galmuri14"] { --personal-ui-font-family: "Galmuri14", sans-serif; }
  html[data-pocketrisu-css~="ui-font-custom"] { --personal-ui-font-family: var(--personal-ui-custom-font-family, sans-serif); }
  html[data-pocketrisu-css*="ui-font-"] { --risu-font-family: var(--personal-ui-font-family) !important; }
  ```

  The native app sets `--risu-font-family` as a non-important inline declaration on `:root`; an important author declaration wins over it. With the chat toggle off, `.chattext` keeps using `var(--risu-font-family)` and therefore the UI font.
- The Galmuri14 `@font-face` comment is rewritten to describe it as a built-in choice.
- Preview sample: `.personal-font-preview__sample` and its descendants use `var(--personal-preview-font-family)` set inline by the preview block, replacing the rule tied to `chat-font-*`. Descendants need the explicit rule because `* { font-family: var(--risu-font-family) }` would otherwise override inheritance.
- Code-block monospace and the `.chattext` override keep their selectors.

### P6. Settings UI — `files/.../CustomFontManager.svelte`, `FontNamePreview.svelte`, `editor-files/.../AppearanceSettings.svelte`

`CustomFontManager.svelte`:

- `builtins = [['paperlogy', 'Paperlogy'], ['galmuri14', 'Galmuri14']]`.
- State `target: PersonalFontTarget = 'chat'` (view state only, not persisted).
- Summary: `폰트 목록 · 채팅 {chat name} · UI {UI name}`; an unresolvable custom id shows `Galmuri14`, matching normalization.
- Expanded content order: preview block → target switch → rows.
  - Preview block: separate border (`border-darkborderc`, inner padding), `text-sm`, sample with the existing `lang` spans, font = the assigned font of `target`. Custom fonts load through a preview-only `CustomFontRuntime` like `FontNamePreview`.
  - Target switch: two buttons with `aria-pressed`, min 44px height.
  - Rows: tap assigns to `target` via `selectFont`. The ✓ mark shows the assignment of `target`; small `채팅` / `UI` badges show both assignments. User-font actions unchanged.
- Toggle row after `</details>`: two `CheckInput`-style switches on one line (`flex`, each `flex-1`, wrapping only below 320px), labels `채팅 폰트 적용` / `UI 폰트 적용`, calling `setFontEnabled`. Each carries `data-setting-id` for search.
- Add form:
  - Inputs stay enabled after a preview so a different file or URL can be tried; only `pending` disables them.
  - File input: `on:change` → `preview()`; bordered (`border border-darkborderc rounded p-2 w-full min-h-[44px]`).
  - URL input: `preview()` on blur or Enter (form submit), not on each keystroke.
  - `preview()` no longer requires a name. `적용` requires a non-empty name within `FONT_LIMITS.name` and a ready candidate, then calls `persistImportedFont`; it never assigns the font to a target.
  - Candidate preview text: `text-sm`. Buttons: `적용`, `취소`.
  - Removal confirm text: `선택 중인 폰트라면 Galmuri14로 변경됩니다.`

`FontNamePreview.svelte`: drop the `app` early return and the stylesheet loader; built-ins resolve through `getPersonalFontFamily` and `document.fonts.load`.

`AppearanceSettings.svelte` (editor-files): remove `FontLoadStatus`, the status effect, the built-in preview `<section>` and their imports. The intro paragraph describes both targets: chat font changes message-body base text; UI font changes the rest of the app; theme-specified fonts are kept.

### P7. Settings data and strings — `files/src/ts/setting/personalAppearanceSettingsData.ts`, `units.cjs`

- Replace the `personal.appearance.chatFont` select with two `check` items, `personal.appearance.chatFontEnabled` and `personal.appearance.uiFontEnabled`, bound through `setPersonalFontEnabled`. Keywords: `font`, `폰트`, `paperlogy`, `페이퍼로지`, `galmuri`, `갈무리`, plus `채팅 폰트` / `UI 폰트`.
- The font list section keeps `data-setting-id="personal.appearance.chatFont"` renamed to `personal.appearance.fonts`; the search test in `units.cjs` moves to the new ids.
- Language (en/ko) via `units.cjs`: remove `personalAppearanceChatFont`, `personalAppearanceOptionAppFont`, `personalAppearanceOptionNotoSansKr`, `personalAppearanceOptionNotoSerifKr`, `personalAppearanceFontPreview`, `personalAppearanceFontStatus*`; add `personalAppearanceChatFontEnabled`, `personalAppearanceUiFontEnabled` and matching help entries (UI font = every element except message bodies).

### P8. Tests and verification scripts

- `files/src/ts/personalSettings/appearance.test.ts` (effective `appearanceValues` behaviour): normalization table above, legacy `app`/removed values, toggle write pairing, token emission per target, master/Safe Mode suppression, rejection of `app` writes.
- `cssToggleRuntime.test.ts`: per-target custom readiness filtering; both targets custom; same custom font on both targets.
- `customFontRuntime.test.ts`: target-specific variables/attributes; shared face survives release of one target.
- `customFonts.test.ts`: deletion resets both assigned targets to `galmuri14` and keeps `fontEnabled`.
- `appearanceNotices.test.ts`: update the `미리보기 준비 완료` message if the notice text changes.
- `test/personal-settings.test.cjs`: update assertions that read effective copies (select options, `!== 'app'`, Noto import, token rules, help strings) and add assertions for the new CSS rules and strings. Assertions that read the legacy `files/` anchors stay unchanged.
- `scripts/verify-personal-css.cjs`: legacy-module expectations stay; effective-module expectations follow P1.
- `test/fixtures/personal-appearance-v022.json`: historical, unchanged.

### P9. Docs, version, installer

- `README.md` font sections and the feature table; `THIRD_PARTY_NOTICES.md` keeps Paperlogy and Galmuri14 and drops Noto, IBM Plex, Gowun and Hahmlet (no longer loaded); `CHANGELOG.md` `0.2.4-experimental.5`; `package.json` version.
- Rebuild `dist/pocketrisu-patcher.cjs` with `npm run build`; check that a second build is byte-identical.

## 5. Commits

On branch `feat/personal-font-targets` from `origin/main` `d2bca03`. Other worktrees, including the BG worktrees, are not touched. Each commit keeps the patcher test suite green.

1. `feat(personal-settings): store chat and UI font targets` — P1, P2, P4 data parts, `customFonts.ts`, `cssToggleDefinitions.ts` + P8 unit tests.
2. `feat(personal-settings): apply per-target fonts at runtime` — P3, P4 runtime parts, P5 + tests.
3. `refactor(personal-settings): reduce built-in fonts to Paperlogy and Galmuri14` — remaining removals in P1/P5/P7 + `test/personal-settings.test.cjs`.
4. `feat(personal-settings): rework the font list and add flow` — P6, P7 strings and search items.
5. `docs: document font targets for 0.2.4-experimental.5` — P9 docs and version.
6. `build(patcher): generate font-target candidate 0.2.4-experimental.5` — P9 installer.

If commits 1 and 2 cannot be separated without a broken intermediate state (P1 token changes require P5 CSS), they are merged into one commit and the reason is recorded in the commit body.

## 6. Verification

Per commit: `npm test` in the patcher worktree.

Candidate (after commit 6):

1. Patcher: full `npm test`; complete graph plan; apply to a scratch exact `v1.10.0` checkout outside the project tree; zero-change reapply; exact byte/mode revert; second installer build identical.
2. Applied tree: Svelte diagnostics, the Personal settings vitest suite (`src/ts/personalSettings`), production build.
3. Browser on the applied tree with isolated storage at 320px and 390px:
   - chat on / UI off, chat off / UI on, both on with different fonts, both on with the same user font;
   - computed `font-family` of a message body, a button, the composer and the settings page for each case;
   - native Display font returns when the UI toggle is off;
   - user font add by file and by URL with immediate preview, `적용` adds without assigning, `취소` leaves no face registered;
   - delete of a font assigned to both targets;
   - legacy data seeds: `chat.font` = `app`, `noto-sans-kr`, `custom:<id>`, no `ui` group;
   - Safe Mode and master switch off remove all font tokens.
4. L3 structural audit and L4 runtime audit over the diff, with the report kept outside the repository.
5. L5 on iPhone with concrete finger scenarios written at that point.

Physical iPhone rendering and CDN availability of the two built-in fonts are not covered by steps 1–4.
## 7. Delivery boundary

- Commits proceed with the implementation.
- Push, live apply to the running PocketRisu installation and PM2 restart require confirmation of target and command. Before restart, active generation and BG work are checked read-only; restart waits rather than cancelling.
- Stable tag/release only after L5 and an explicit release decision.

## 8. Decisions

- D1: the UI target is stored in a new `ui` group (P1).
- D2: the default assignment is `Galmuri14` for both the chat and the UI target.
- D3: the native Display → Custom `Galmuri14` entry is unchanged. With the UI toggle on it is overridden; with the UI toggle off it remains the app font.

## 9. Implementation record

### 9.1 Deviations from §4–§5

- Compatibility rollback. `scripts/rollback-personal-css-ui.cjs` removes the editor units and keeps the legacy `files/` copies, so those copies must keep working. Consequences:
  - `personalAppearanceSettingsData.ts` and `appearance.test.ts` are not edited in `files/`; the editor overlay replaces them with `editor-files/` copies (`personal-settings:editor-replace-appearance-settings-data-1.9`, `…-appearance-logic-tests-1.9`). The two former partial replace units for `appearance.test.ts` are folded into the editor copy.
  - The search test hit moves to `personal.appearance.chatFontEnabled` through `personal-settings:editor-replace-appearance-search-font-hit`.
  - Legacy language keys (`personalAppearanceChatFont`, option and font-status keys) are kept; only the two toggle keys and their help entries are added. P7's key removal is not done.
- Commits. Data, runtime and UI depend on each other (removed exports, snapshot shape), so §5 commits 1–4 are one feature commit. README is not edited for an experimental candidate, following the existing release pattern; it is updated at the next stable release.
- Custom-font load status is kept per target (`customFontLoadStatus` is a record); the load-error notice lists only enabled targets with a user font.
- A custom assignment whose entry no longer exists shows `저장된 폰트를 찾을 수 없음` in the summary instead of `Galmuri14`, because the stored value stays `custom:<id>` and the runtime then shows the fallback font, not Galmuri14.

### 9.2 Observed validation (2026-10-04 KST)

- Patcher `npm test`: 327/327.
- Scratch exact PocketRisu `v1.10.0`, complete graph applied (42 packs, 992 units, 6 collisions): vitest `src/ts/personalSettings` + `searchIndex.test.ts` 12 files / 121 tests; svelte-check 0 errors / 0 warnings (6,009 files); production build 7,994 modules.
- Zero-change re-plan; exact revert restored every file's bytes and mode (four empty directories remain). Compatibility rollback applied: vitest 4 files / 28 tests, svelte-check 0 / 0 (5,963 files).
- Installer: two builds identical, 4,651,205 bytes, mode 0755, SHA-256 `08506ff8e14ab069ce6bd727b1e4bfeb991509d7a87cd32b80331c1c7772300f`; applying it gives the same tree as the source CLI.
- Headless Chromium against the scratch server (loopback only, fresh data), 390px:
  - UI on → UI and message body Galmuri14; chat on with Paperlogy → body Paperlogy, UI Galmuri14; UI off → UI returns to the Display font value (`Arial, sans-serif`), body keeps the chat font; state kept after reload.
  - Panel order preview → target switch → rows; preview 14px and follows the selected target; summary shows both assignments.
  - File picker bordered, 44px high; picking a TTF shows a 14px preview immediately; `적용` stays disabled until the preview is ready and requires a name; after `적용` the assignments are unchanged.
  - One user font on UI, then also on chat: both ready attributes set, one family; badges `채팅`, `UI`; deleting it returns both targets to Galmuri14 and clears both attributes.
  - URL source: no request while typing, one request on blur, CORS/network notice shown.
  - 320px and 390px: the two apply switches share one row at 44px height; no horizontal page overflow.
- Environment limitation: on a fresh empty scratch database every `/api/patch` after the first full write returned 409 with client `expectedHash=0`; the same sequence reproduced with the `origin/main` installer. The browser flows above used a scratch-only server edit that accepts `expectedHash === '0'`. The product server is unchanged.
- Not covered: physical iPhone rendering, Safe Mode toggling in the browser, CDN availability of the two built-in fonts, and an older installer reading the new data.
