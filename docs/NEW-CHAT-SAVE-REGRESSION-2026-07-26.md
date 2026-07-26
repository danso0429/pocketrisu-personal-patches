# New-chat save regression — 2026-07-26

## Symptom and scope

PocketRisu v1.8.1 on iOS could report `Failed to save 1 chat` immediately
after a new chat was created. The composer request did not proceed because
the preflight chat save failed.

The regression was introduced by the lazy-chat synchronization pack. Existing
chat saves, startup caching, bg-preserve delivery, persona organization, and
preset integrity were kept in scope for regression checks but were not the
cause.

## Root cause

PocketRisu inserts a new chat at array index zero before its database metadata
save. The chat-content GET route accepted a stable `x-chat-id`, but its disk
fallback first selected the chat at the path index and then compared IDs.
When index zero still referred to an older server chat, the route returned a
false conflict instead of the authoritative 404 needed for a create.

Using every 404 as permission to create would have introduced a second data
integrity failure: a remotely deleted existing chat could be silently
resurrected. The client therefore also needed an explicit create/update
intent independent of the mutable live array.

## Resolution

- The server resolves by stable chat ID whenever `x-chat-id` is present. Array
  index lookup remains only for legacy callers without that header.
- The client classifies each save against the last server-confirmed database:
  an absent ID is a create, while a confirmed ID is an update.
- Missing or malformed confirmed baseline state fails closed to update.
- Only create plus an authoritative 404 sends `If-None-Match: *`.
- Update plus 404 reports remote deletion; create plus an existing ID reports
  a collision.
- Lost create acknowledgements are confirmed by re-reading and comparing the
  exact desired snapshot.

This preserves stable-ID reorder behavior, legacy metadata-only shell
reporting, CAS updates, concurrent-create collision handling, and
deletion-versus-edit safety.

## Verification

- Focused stable-ID and save-intent regression suite: 37/37 passed.
- Clean PocketRisu v1.8.1 full suite: 91 files, 1,197 passed, 3 intentionally
  skipped parser specifications.
- Svelte diagnostics: 0 errors, 0 warnings.
- Production build and BG orchestration bundle build/load check succeeded.
- Generated patcher tests: 8/8 passed.
- Clean apply/status/revert reproduced exact bytes and POSIX modes.
- Production served the new collision and remote-deletion paths after restart.
- iPhone L3 passed new-chat send, persistence/reload, existing-chat save, and
  background-return scenarios.

The three skipped parser specifications predate this change and fail when
temporarily enabled; they are not hidden lazy-chat failures.
