# Third-party notices

This repository contains patch payloads for PocketRisu and therefore includes
modified PocketRisu source code.

- PocketRisu: https://github.com/PocketRisu/PocketRisu
- License: GNU General Public License v3.0
- Startup cache inspiration and adapted implementation:
  https://github.com/PocketRisu/PocketRisu/pull/49
- PR #49 author at the time of adaptation: `universebaby1020`
- Adapted source files:
  `src/ts/storage/startupDatabaseCache.ts` and its tests, plus a smaller
  integration into NodeStorage, AutoStorage, bootstrap, and the Node server.

The adapted version is scoped to startup caching. PR #49's separate lazy-chat,
conflict-rebase, and write-journal protocol is not imported because this
PocketRisu installation already has an independently maintained bg-preserve
hydration and conflict protocol.
