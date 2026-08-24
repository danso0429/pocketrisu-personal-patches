# Third-party notices

This repository contains patch payloads for PocketRisu and therefore includes
modified PocketRisu source code.

The broader code-versus-idea ledger, including sources that were reviewed but
not copied, is in [`docs/SOURCE-PROVENANCE.md`](docs/SOURCE-PROVENANCE.md).

- RisuAI ancestry: https://github.com/kwaroran/RisuAI
- PocketRisu: https://github.com/PocketRisu/PocketRisu
- License: GNU General Public License v3.0
- Lazy chat synchronization and startup cache adapted implementation:
  https://github.com/PocketRisu/PocketRisu/pull/49
- PR #49 author at the time of adaptation: `universebaby1020`
- Adapted source includes the PR's startup cache, chat delta/CAS, write
  journal, hydration boundary, plugin access boundary, and database conflict
  reconciliation files and tests.

Local changes add iOS-independent cache probing, startup observability, and a
bg-preserve durable-save adapter. BG semantic merge revisions remain separate
from the PR's exact transport revisions.

## PocketRisu `serve` reference

The client/server build-admission and point-in-time backup-source designs were
re-evaluated from the GPL-3.0 `serve` branch of:

- Source: https://github.com/rhplus0831/PocketRisu
- Build-admission reference: `3e65d76e4768b87156ba4dd93b2c954fe34cc784`
- Point-in-time reference line:
  `f3efd3b1b03a9773a9121802ed3f95e8088d3353` through
  `3e758f9a4c95e9c18d4a9d428c85ded148cbf7ba`
- License: GNU General Public License v3.0

The local build fence and backup source are not wholesale copies. They were
adapted around PocketRisu 1.9/1.10, lazy storage, bg-preserve, Kei, orphan
purge, and restore-safety owners. Detailed local contracts and exclusions are
recorded in `docs/POCKETRISU-SERVE-HIGH-VALUE-INTEGRATION.md`.

## Optional web fonts

The PocketRisu 1.9 Personal appearance feature declares optional web-font
faces. Paperlogy and Galmuri14 load from jsDelivr. Noto Sans KR and Noto Serif
KR load as unicode-range WOFF2 subsets through the official Google Fonts CSS
API and `fonts.gstatic.com`. IBM Plex Sans KR, Gowun Dodum, Gowun Batang, and
Hahmlet use the same Google Fonts service, but their stylesheet links are
created only after the user selects that face. No font binary is copied into
or redistributed by this repository.

- Paperlogy: https://www.sandollcloud.com/free-font/21071/Paperlogy
  (SIL Open Font License 1.1; the appearance switch uses regular, semibold,
  and bold weights only).
- Galmuri14: https://quiple.dev/font/galmuri
  (SIL Open Font License 1.1; declared so an existing app-level custom-font
  choice can continue resolving after a separately approved custom-CSS
  migration).
- Noto Sans CJK and Noto Serif CJK:
  https://github.com/notofonts/noto-cjk
  (SIL Open Font License 1.1; the selectable KR instances cover CJK and Latin
  scripts while using Korean glyph forms by default when text has no language
  tag).
- IBM Plex Sans KR: https://github.com/google/fonts/tree/main/ofl/ibmplexsanskr
  (SIL Open Font License 1.1; the selector requests regular, semibold, and bold
  weights).
- Gowun Dodum: https://github.com/google/fonts/tree/main/ofl/gowundodum
  (SIL Open Font License 1.1; the selector requests its regular face).
- Gowun Batang: https://github.com/google/fonts/tree/main/ofl/gowunbatang
  (SIL Open Font License 1.1; the selector requests regular and bold faces).
- Hahmlet: https://github.com/google/fonts/tree/main/ofl/hahmlet
  (SIL Open Font License 1.1; the selector requests its variable weight
  range).

The runtime CDNs are external availability and privacy dependencies. The four
configured jsDelivr WOFF2 URLs returned partial-content responses with the
expected `font/woff2` type during the 2026-08-08 qualification. The combined
Google Fonts request returned mobile unicode-range WOFF2 CSS for both Noto
families. The four additional families were also checked through their
official Google Fonts CSS responses; keeping them on demand avoids adding all
of those rules to the initial stylesheet. A later self-hosted font bundle
would require a binary-aware patch payload format and is not part of this
checkpoint.

## PocketRisu Kei

The optional fullscreen image viewer, robust OpenAI and Google SSE stream
parsing, streaming chat render identity, navigation/hotkey behavior, shared
partial-message editing, HypaMemory manual tools, and translation cache
management/cancellation adapt focused capabilities from PocketRisu Kei:

- Source: https://github.com/seto-sama/PocketRisu-Kei
- Revision: `cc1d1b195babd887577ebf943d5e82f01f58135c`
- License: GNU General Public License v3.0
- Adapted source paths:
  `src/lib/UI/GUI/FullscreenImageViewer.svelte` and the additional-image
  preview flow in `src/lib/SideBars/CharConfig.svelte`;
  `src/ts/process/request/openAI/requests.ts`,
  `src/ts/process/request/openAI/requests.stream.test.ts`,
  `src/ts/process/request/google.ts`, and
  `src/ts/process/request/google.test.ts`;
  `src/lib/ChatScreens/Chats.svelte`,
  `src/lib/ChatScreens/Chat.svelte`, and
  `src/lib/ChatScreens/ChatBody.svelte`, with the active-generation signal
  supplied by `src/lib/ChatScreens/DefaultChatScreen.svelte`;
  `src/lib/ChatScreens/PartialEditManager.svelte`,
  `src/lib/ChatScreens/keiPartialEditIdentity.ts`, and focused partial-edit
  wiring in `src/lib/ChatScreens/DefaultChatScreen.svelte` and
  `src/lib/ChatScreens/Chat.svelte`;
  `src/lib/Others/HypaV3Modal/manual-summary-panel.svelte`,
  `src/lib/Others/HypaV3Modal/utils.ts`, and focused HypaV3 modal, header,
  connected-message, next-target, and language wiring;
  `src/ts/translator/translator.ts`,
  `src/lib/Setting/Pages/Language/TranslationCachePanel.svelte`,
  `src/lib/Setting/Pages/Language/translationCacheEntries.ts`,
  `src/lib/Setting/Pages/LanguageSettings.svelte`,
  `src/lib/ChatScreens/ChatBody.svelte`, and focused translator-preset and
  language wiring;
  `src/ts/hotkey.ts`, `src/ts/defaulthotkeys.ts`,
  `src/ts/mobileBackNavigation.ts`, and the focused bootstrap, database,
  hotkey-settings, accessibility-settings, and language wiring.

The local adaptation keeps PocketRisu's existing inlay gallery and character
asset management paths, centralizes Escape/arrow handling in the viewer, and
adds pure sparse-gallery navigation tests. Its stream adaptation keeps
provider delivery, cancellation, tool execution, and bg-preserve routing in
their existing owners while moving incremental UTF-8/SSE framing into a
replayable side-effect-free core.
The render adaptation keeps the active streaming message mounted, updates its
reactive content prop, preserves global reload behavior, and defers automatic
translation until the stream completes. It does not replace request delivery,
background result claim/ACK, reconnect, or storage behavior.
The navigation adaptation adds non-mutating hotkey matching, safe adjacent
character boundaries, pointer gesture cleanup, an enable switch, model-preset
selection, and an opt-in mobile back guard. Its bootstrap adapters preserve
the existing startup-cache and lazy-chat replacement order and do not take
ownership of route restoration, chat hydration, pending local writes, or
generation delivery.
The partial-edit adaptation replaces per-message listener sets with one
screen manager, binds an edit to captured chat, message, and DOM identities,
and requires an issued translation-cache token before a translated fragment
can be saved. It does not take ownership of generation delivery,
bg-preserve result claim/ACK, cancellation, or chat storage.
The HypaMemory adaptation preserves PocketRisu's existing search, category,
tag, bulk-edit, and next-target UI while adding contiguous-frontier manual
summarization and corrected CBS display processing. It calls the existing
HypaV3 summarizer and does not add Revenant, a second generation transport,
or a parallel result/ACK authority.
The translation adaptation preserves PocketRisu's existing persistent cache
prefix, raw source-text lookup key, import/export/clear controls, provider
selection, and bg-preserve request ownership. It adds progressive cache
management, exact observed-entry mutation guards, preview-before-delete
unused cleanup, cancellation propagation, and focused batch/race tests. It
does not introduce Revenant, a second provider route, or a new cache schema;
the inherited raw-key language/preset/provider collision boundary remains
documented in the K12 validation receipt.

## Haejeok RisuAI focused adaptations and research reference

The Haejeok RisuAI comparison is pinned to:

- Source: https://github.com/nevaeh5379/HaejeokRisuai
- Revision: `e9d035683cdf9f0207eed193ee36f9bdb117f658`
- License: GNU General Public License v3.0

The HJ04 persistence-safety adapter uses the behavior and focused structure of:

- `0fd90fcfbfe9b7136eade9d9bc3320c3744626d2`,
  `src/lib/ChatScreens/DefaultChatScreen.svelte`;
- `23bb743765ce6af5c8390d182cc3a7e08c8ce810` and
  `313ecdff7c2c24d01611a7b735fd5435c4f0a65d`,
  `src/ts/process/scriptings.ts`; and
- `3b5b3d39425a6297e8ea8a634e6d957e17c7b771`,
  `src/ts/plugins/plugins.svelte.ts`.

The redistributed local implementation is contained in
`patches/haejeok-persistence-safety-adapter/` and applies focused hooks to the
same PocketRisu paths plus `src/ts/globalApi.svelte.ts`. It does not copy
Haejeok's relational `MessageStore`, `SettingsStore`, SQL schema, or storage
backend. Script messages are merged into the existing PocketRisu lazy-chat
owner and committed through its BG strict-save barrier; plugins use the same
tracker without replacing the database's complete plugin array.

Haejeok commit `e78f9c91fea5a059d38de271117f8dbfac5f45ef`
(`src/ts/bootstrap.ts`) and the cache-revision portion of `313ecdff` were
reviewed but not adapted because the composed target already has equivalent
synchronous ordering.

The HJ03 Korean-search adapter uses the behavior and focused structure of:

- `86ee613c04e88f22bfcd0fb80267eb458a1a4408`;
- `1e5f9eeed2fa5b881502affba9d5289dca625cdb`;
- Haejeok paths `src/ts/util/koreanSearch.ts`,
  `src/ts/util/koreanSearch.test.ts`, `src/lib/UI/MainMenu.svelte`,
  `package.json`, and `pnpm-lock.yaml`.

The local implementation is contained in
`patches/haejeok-korean-search-adapter/`. It applies the matcher to
PocketRisu's `src/lib/Others/GridCatalog.svelte` and
`src/lib/Mobile/MobileCharacters.svelte`, retains their existing order, limits
in-progress batchim expansion to the final syllable, and adds bounded reverse
keyboard conversion. It does not copy Haejeok's `MainMenu` sort, recent,
favorite, hidden-character, or character-order model.

HJ03 adds the following exact runtime dependency:

- `es-hangul` 2.4.0: https://github.com/toss/es-hangul
- Package release: https://github.com/toss/es-hangul/releases/tag/es-hangul%402.4.0
- Copyright © 2024 Viva Republica, Inc.
- License: MIT
- Integrity:
  `sha512-9ouVct+rsUw7d5+JeyEV+Lf4PAytSK4cWnLGHM4FJDyG9BS5d3iSPnEmH/rVgmSyxyps5cWZ+NeDAlJyq8eKaw==`

The HJ01 Small chat-width adapter uses the focused 600px outcome from:

- `0243d0781fdbcca0768fa8ef2c0df6d365d8d27f`;
- Haejeok paths `src/lib/ChatScreens/Chat.svelte`,
  `src/ts/setting/displaySettingsData.svelte.ts`,
  `src/ts/storage/database.svelte.ts`, `src/lang/en.ts`, and `src/lang/ko.ts`.

The local implementation is contained in
`patches/haejeok-chat-width-adapter/`. PocketRisu 1.10 already provides
`Standard`, `Wide`, and `Full` values and synchronizes message cards, creator
notes, composers, and theme presets. The adapter adds only `Small (600px)` to
that owner. It does not copy Haejeok's `chatLimitSize` database field, does not
change the native default or existing widths, and does not apply a second
Personal appearance width.

The remaining SQL/domain storage, object storage, and product/deployment work
is excluded in `docs/HAEJEOK-RISUAI-OVERLAP-AUDIT.md`. HJ02 resize, HJ05
low-spec/paging, HJ06 ZIP64, HJ07 Node compute, and HJ08 log export are reviewed
as research references and closed as current implementation work in
`docs/HAEJEOK-REMAINING-CANDIDATE-DESIGN-AUDIT.md`; no code or dependency from
those five clusters is redistributed by this checkpoint. A future focused
adaptation must record its exact source commits and paths here before the
complete installer is published.
