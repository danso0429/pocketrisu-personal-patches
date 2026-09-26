# PocketRisu 1.10 BG-independent G1 on current patcher main

Date: 2026-09-27 KST

Status: isolated automatic candidate. G1 is not complete; no live application,
real-browser/iPhone qualification, paid-provider test, tag or release is claimed.

## Source and ownership

- Base patcher: `d2bca03`, package `0.2.4-experimental.4`. This integration
  uses the current target-only 1.10 catalog and single-installer engine, with
  package candidate `0.2.4-experimental.5`.
- G1 source was carried from `codex/pocketrisu-bg-independent` through
  `a7e7a2e`: operation-keyed browser effects, shared draft identity, atomic
  normal-chat commit, N+1 input, bounded payload retirement with exact
  permanent identity receipts, blocked-draft explicit retry and guarded
  client capability 1. Archive Center source is unchanged and not required.
- Three pack versions change relative to read-only live state:
  `lazy-chat-bg-adapter` 0.2.1 → 0.7.12, `lazy-chat-sync` 0.3.2 → 0.5.2,
  `personal-settings` 0.5.10 → 0.5.11. The newer appearance editor is retained;
  its strict root-only save is tested with G1's browser-effect identity.
- The original G1 candidate and this current-engine composition had 413/413
  managed product paths with matching output SHA-256 and POSIX modes. The
  engine/catalog differ, but this comparison found no generated product-file
  difference. The older two-file installer alias is not reintroduced here.

## Observed automatic validation

| Gate | Result on exact official PocketRisu 1.10.0 `98e968339d1b3f91b9dac85bb3f2ebb5f90f9d14` |
| --- | --- |
| Patcher | 51/51 tests; generated single installer 5,330,374 bytes, SHA-256 `209e29118b8e99fed8bee7bd80bf4c3074c5a09a2eb2995bca251d4431ffb280`, two consecutive builds identical |
| Full graph | 42 effective packs, 1,117 ordered units, 7 declared collisions; 415 changed paths including state/intent; status current, re-plan 0; exact revert clean/disabled with tracked diff 0 |
| Target server | 350 passed, 12 skipped; spawned process/SQLite/normal chat HTTP and failure injection included |
| Target frontend | 1,910 passed, 2 skipped; shared draft, pending UI, save/rebase and newer appearance tests included |
| Target type/build | 0 errors, 0 warnings; production build passed; BG bundle built and loaded `sendChat` |
| Live baseline (read-only) | 370 managed paths matched installed hashes and modes, mismatch 0; installed pack versions above |

No live PocketRisu source, PM2 process, user database, provider or AC runtime
was changed by this validation. The previous branch's detailed owner/audit
evidence remains in its
`docs/POCKETRISU-1.10-BG-INDEPENDENT-G1-RUNTIME-AUDIT-2026-09-27.md`;
the exact generated-product parity is the bridge to this current-engine tree.

## Supported path and open gates

- Candidate input-v1 early admission supports ordinary classic cloud-model
  sends without browser-only generation epilogues. Browser-local
  proxy/custom/plugin models, preset/module bindings and media/TTS epilogues
  stay on the prior client-prepared path. This is a routing/safety boundary,
  not a claim that every dynamic provider URL was exercised.
- Before live delivery, recheck exact source/installer hash, live managed-file
  drift, active and durable generation state, current installed versions,
  available recovery copy and normal patcher plan. Never cancel active work,
  discard user data or change AC to make the test pass.
- After safe application, the actual browser must submit N, fully exit, and
  leave the server to commit. Read the normal chat API **before** reopening;
  then verify the answer, revision, variables/statistics once, empty-local
  adoption, two-tab same-draft behavior, blocked-edit retry and old cached
  client fence on iPhone. Paid-provider calls require a user decision.
- A source rollback is not automatically a data rollback. New normal-chat
  content and effect receipts may have been written after activation; preserve
  and inspect them before any rollback, and do not remove user-created
  conflict copies or recovery records as cleanup.
