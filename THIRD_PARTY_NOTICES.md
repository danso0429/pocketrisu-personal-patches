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
