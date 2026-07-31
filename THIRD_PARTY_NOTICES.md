# Third-party notices

This repository contains patch payloads for PocketRisu and therefore includes
modified PocketRisu source code.

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

## PocketRisu Kei

The optional fullscreen image viewer, robust OpenAI and Google SSE stream
parsing, streaming chat render identity, and navigation/hotkey behavior adapt
focused capabilities from PocketRisu Kei:

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
