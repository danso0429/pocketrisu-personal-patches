# PocketRisu 1.9 preset-integrity validation

Date: 2026-08-01 KST

## Result and boundary

`preset-integrity` is qualified as a dual-target pack for exact PocketRisu
1.8.1 and 1.9.0. The 1.8.1 graph and its behavior are unchanged. PocketRisu
1.9 uses a separate eight-unit graph that preserves the new official
`botPresetsId === -1` no-active sentinel while continuing to repair malformed
persisted indices and empty preset arrays.

No live tree was modified, no PocketRisu process was restarted, and no user
preset or database was used as a fixture. No push, tag, release, or installer
rebuild was performed.

## Official 1.9 conflict and adaptation

PocketRisu 1.9 introduced stable string IDs and these helpers:

- `getActiveBotPreset()` returns `null` for a negative or out-of-range index;
- `setActiveBotPresetById(undefined)` deliberately stores `-1`;
- `saveCurrentPreset()` returns without writing when the active index is
  `-1`;
- `withStableActivePreset()` preserves the active string ID across reorder
  and delete operations.

The historical `preset-integrity` normalizer clamped every negative value to
zero. Its anchors still matched 1.9, but applying it unchanged would erase the
official no-active state. The exact-1.9 adapter instead applies these rules:

1. an empty or missing preset array receives one generated fallback preset;
2. `-1` remains `-1`;
3. a non-integer or value below `-1` becomes zero;
4. a nonnegative value beyond the end clamps to the last preset;
5. an invalid explicit `changeToPreset(id)` uses the repaired active index,
   or zero when the database is deliberately in the no-active state;
6. the active-preset-only basic-info body is not rendered while there is no
   active preset. The containing settings page still exposes its Manage
   control so a user can select a preset.

The 1.8.1 adapter retains its historical negative-to-zero rule and focused
name-field guard. No 1.9 unit is eligible for an exact-1.8.1 plan.

## Pack and target graph

| Pack | Version | Exact target units | Managed source paths | SHA-256 ETag |
| --- | --- | ---: | ---: | --- |
| `preset-integrity` | `0.2.0` | 1.8.1: 7; 1.9.0: 8 | 3 | `5cb47c412c02dccfbc2e748ee16332435a809af360aaaf635ed70454b05404a2` |

The exact-1.9 focused plan selected `preset-integrity` and
`toolchain-hardening`, reported verified compatibility, selected 15 units in
total, and reported zero collisions. The exact-1.8.1 focused plan selected
the historical seven preset units and no unit whose ID ends in `:1.9`.

## Observed exact-1.9 gates

| Gate | Observed result |
| --- | --- |
| Patcher focused test | `test/preset-integrity.test.cjs` passed |
| Patcher full suite | 31/31 test files passed |
| Focused target tests | 2 files / 18 tests passed: official `botPresetId.test.ts` plus the managed integrity test |
| Full frontend | 70 files / 1,045 passed / 3 skipped |
| Svelte diagnostics | 0 errors / 4 existing `DefaultChatScreen` accessibility warnings |
| Production build | 7,793 modules transformed; completed |
| Server suite | 4 files / 99 tests passed with localhost test binding allowed |
| Applied status | `current`; all six transaction files matched expected hashes and modes |
| Repeated plan | 0 changed files; six managed files skipped as already current |
| Exact revert | Official tracked source diff 0 after reverting six transaction files |

The first sandboxed server run was not counted as a product result. The test
servers could not bind `127.0.0.1` and reported `EPERM`; the same suite passed
when localhost binding was allowed.

The server, toolchain lock, and test-setup files are selected by the existing
`toolchain-hardening` qualification. `preset-integrity` itself changes two
runtime source files and owns one focused test file.

## L2.5 runtime audit

### Phase 1 — flat discovery

- target metadata, mutually exclusive units, dependencies, anchors, order,
  ETag, collision set, apply, current status, repeated plan, and revert;
- database load, empty-array fallback, stable string IDs, valid index,
  deliberate `-1`, values below `-1`, non-integers, upper-bound clamp, save,
  explicit preset change, and reorder/delete preservation;
- prompt-settings header, Manage control, active name/icon, duplicate, export,
  import, delete, and no-active render;
- existing settings, model-preset binding, preset chain, database ownership,
  plugin writes, backup compatibility, and live user data.

### Phase 2 — external anchors

- **Official policy:** the upstream `botPresetId.test.ts` assertion for
  `setActiveBotPresetById(undefined) -> -1` passed in the applied target.
  The managed test separately observed that the normalizer returns and keeps
  `-1`.
- **Malformed-state repair:** the managed test observed valid selection
  preservation, one-past-end clamping without removing entries, values below
  the sentinel and `NaN` repairing to zero, and one generated fallback only
  for an empty list.
- **Change boundary:** source inspection shows `changeToPreset()` normalizes
  the database before indexing. An invalid requested index selects a valid
  repaired active index, or slot zero when the active state is deliberately
  `-1`; `setPreset()` therefore does not receive `undefined` from that path.
- **UI boundary:** the exact-1.9 basic-info component derives one
  `activePreset` and renders every control that dereferences `activeIndex`
  only while it exists. The containing page's optional active name and Manage
  control remain outside this guard. The production Svelte build compiled
  this path.
- **Ownership preservation:** the pack adds no parallel preset ID, reorder
  owner, database replacement, backup format, model-binding owner, generation
  route, storage transport, or top-level plugin-array write.
- **Lifecycle:** the applied state matched every expected hash and mode, a
  repeated plan had zero changed files, and exact revert restored the
  official tracked target. The exact-1.8 plan remained historical-only.

### Phase 3 — triage

- Q1 fixed in this adapter: exact 1.9 no longer uses the historical
  negative-to-zero policy, and active-only settings controls cannot
  dereference the official no-active sentinel.
- Q2: no preset-integrity blocker remains in the measured exact-1.9 focused
  graph.
- Q3: patcher assertions now break on lost dual-target separation, removal of
  sentinel preservation, invalid-change fallback drift, missing UI guards, or
  target metadata regression. The official and managed target tests exercise
  the two sentinel contracts together.
- Q4 prepared surfaces are physical iPhone settings interaction, a real
  legacy database with corruption beyond the measured index/list cases, and
  third-party code that directly writes `botPresetsId` while settings are
  open. Those are not silently treated as passed.

## Remaining interaction and publication boundary

The consolidated iPhone session should still select and switch presets,
open Settings → Prompt Preset, rename the active preset, exercise duplicate,
export, import, and delete with disposable data, and confirm the Manage
control can recover the screen after no active preset is shown through a safe
test fixture. A real user database must not be corrupted merely to create the
fixture.

Aggregate graph qualification, the full raw-selection verifier,
deterministic installer rebuild, review, and the applicable per-feature L3
observations remain separate publication gates.
