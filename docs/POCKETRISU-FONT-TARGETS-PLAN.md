# PocketRisu Personal Font Targets Plan

Status: plan approved; implementation not started. No code, installer or live state has been changed.
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

## 4. Design

### 4.1 Data model (schema stays v1, additive)

- `chat.font`: assigned chat font, `'paperlogy' | 'galmuri14' | custom:<id>`.
- `chat.fontEnabled`: boolean (new).
- `ui.font`, `ui.fontEnabled`: new `ui` group with the same value set.
- Read normalization:
  - `chat.font === 'app'` or missing → `fontEnabled: false`, `font: 'galmuri14'`.
  - Any other legacy value (Noto, IBM Plex, Gowun, Hahmlet) or unknown value → `fontEnabled: false`, `font: 'galmuri14'`. The user confirmed these are unused.
  - `fontEnabled` missing with a valid non-`app` `chat.font` → `true` (preserves current visible state).
  - Missing `ui` group → `fontEnabled: false`, `font: 'galmuri14'`.
- Deleting a user font resets every target assigned to it to `galmuri14` and keeps that target's toggle state.
- Rollback note: an older installer reads `galmuri14` as `app`; this is acceptable for rollback.

Decision D1: the UI target uses a new `ui` group rather than leaves inside `chat`, because `writeAppearanceGroup` already writes whole groups and the target names map one-to-one.

### 4.2 Runtime and CSS

- Tokens: `chat-font-paperlogy | chat-font-galmuri14 | chat-font-custom` and `ui-font-paperlogy | ui-font-galmuri14 | ui-font-custom`, emitted only when the target toggle is on.
- CSS:
  - Keep Paperlogy and Galmuri14 `@font-face`; remove the Noto `@import` and the removed token rules.
  - UI: `html[data-pocketrisu-css*="ui-font-"] { --risu-font-family: var(--personal-ui-font-family) !important; }`. The stylesheet `!important` declaration overrides the native inline non-important value.
  - Chat: existing `.chattext` rule keyed on `chat-font-` with `--personal-chat-font-family`. With the chat toggle off, `.chattext` inherits the UI value through `var(--risu-font-family)`.
  - Custom fonts: separate variables `--personal-chat-custom-font-family` and `--personal-ui-custom-font-family`.
- `CustomFontRuntime`: one runtime instance per target, each with a target-specific variable name and ready attribute, so chat and UI can use different user fonts at the same time. Shared `FontFace` reuse (existing `preparedFaces` pool) covers the case where both targets use the same user font.
- `cssToggles.ts`: hold back `chat-font-custom` / `ui-font-custom` per target until that target's font is ready.

### 4.3 Settings UI

- `CustomFontManager.svelte`: summary, preview block, target switch, badges, built-in list, add flow (§2.3).
- `AppearanceSettings.svelte` (editor-files): remove the separate built-in preview section and `FontLoadStatus 'app'`; render the toggle row below `CustomFontManager`.
- `FontNamePreview.svelte`: drop the `app` early return.
- `personalAppearanceSettingsData.ts`: replace the 8-option `chat.font` select (search-only) with entries for the two toggles and the font list; update keywords.
- Language/help strings in `units.cjs`: remove `personalAppearanceOptionAppFont`, Noto option labels and `…FontStatusApp`; add toggle labels and help (UI font = all UI except message bodies).

## 5. Change units and commits

Each step is a separate commit on branch `feat/personal-font-targets`, branched from `origin/main` `d2bca03`. Other worktrees, including the BG worktrees, are not touched.

1. Data model: `appearanceValues.ts`, `cssToggles.ts`, `customFonts.ts`, `appearanceEditor.ts` + their tests.
2. Runtime/CSS: `appearance.ts` (editor-files), `PersonalAppearanceRuntime.svelte` (editor-files), `customFontRuntime.ts`, `personal-appearance.css` (editor-files) + tests.
3. Built-in reduction: remove font maps, stylesheet URLs, CSS rules, strings; update `test/personal-settings.test.cjs`, `appearance.test.ts`, `cssToggleRuntime.test.ts`, `scripts/verify-personal-css.cjs` expectations where they cover the effective copies. Legacy `files/` copies and `test/fixtures/personal-appearance-v022.json` stay as replace anchors / historical fixtures.
4. Settings UI: `CustomFontManager.svelte`, `FontNamePreview.svelte`, `AppearanceSettings.svelte` (editor-files), `personalAppearanceSettingsData.ts`, strings.
5. Docs: README font sections, `THIRD_PARTY_NOTICES.md` (remove notices for fonts no longer loaded), CHANGELOG `0.2.4-experimental.5`, `package.json` version.
6. Generated installer: rebuild `dist/pocketrisu-patcher.cjs`.

## 6. Verification

- Patcher unit and integration tests; complete graph plan; apply/revert round trip on an exact 1.10.0 tree; installer reproducibility.
- PocketRisu side on the applied tree: type check, focused vitest for the touched modules, production build.
- L3 structural audit and L4 runtime audit over the diff (font targets, migration, custom font lifecycle with two targets, delete-while-assigned).
- L5 on iPhone (scenarios written at L5 time): toggles on/off per target, different fonts per target, user font add via file and URL with immediate preview, delete of an assigned font, Galmuri14 default, native Display font when UI toggle is off.

## 7. Delivery boundary

- Commits proceed with the implementation.
- Push, live apply to the running PocketRisu installation and PM2 restart require confirmation of target and command. Before restart, active generation and BG work are checked read-only; restart waits rather than cancelling.
- Stable tag/release only after L5 and an explicit release decision.

## 8. Decisions

- D1: the UI target is stored in a new `ui` group (§4.1).
- D2: the default assignment is `Galmuri14` for both the chat and the UI target.
- D3: the native Display → Custom `Galmuri14` entry is unchanged. With the UI toggle on it is overridden; with the UI toggle off it remains the app font.
