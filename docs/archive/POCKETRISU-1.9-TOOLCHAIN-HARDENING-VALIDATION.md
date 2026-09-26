# PocketRisu 1.9.0 toolchain-hardening validation

## Decision and exact boundary

`toolchain-hardening` 0.1.3 is qualified for exact official PocketRisu 1.9.0,
commit `85a65f3137b45c8de4a8d21a9887be213b1ac3fc`. It does not qualify another
pack or a later 1.9.x target.

The pack owns seven units in exactly three test/build files:

- `vitest.setup.ts`;
- `package.json`; and
- `pnpm-lock.yaml`.

It changes no PocketRisu runtime source, browser storage policy, database,
plugin array, generation path, request log, or user data. The exact runtime
revert surface of this correction is the existing `vitest.setup.ts` replace
unit; the lightningcss override units are unchanged.

## Observed Node failure and structural correction

The validation runtime was Node 25.9.0. Its global `localStorage` is an own
accessor when no valid `--localstorage-file` is supplied. Reading it emits
`--localstorage-file was provided without a valid path` and yields an object
without `clear()`. A future-safe test setup must also tolerate a native getter
that throws rather than returns an incomplete object.

Three implementations were measured rather than treated as equivalent:

1. Version 0.1.1 wrapped `globalThis.localStorage?.clear` in `try/catch`. Tests
   passed, but the value read still emitted the warning in each worker.
2. Version 0.1.2 inspected the property descriptor without invoking the
   getter. Vitest's `vi.stubGlobal` then read the original value internally,
   reducing but not eliminating the warning: the focused receipt observed one.
3. Version 0.1.3 uses `Object.getOwnPropertyDescriptor` and, only when the own
   property is not a usable data property, installs happy-dom `Storage` with
   `Object.defineProperty`. Neither step invokes the native accessor. A usable
   pre-existing data-property storage owner is preserved.

The final flow is therefore:

```text
worker bootstrap
  -> inspect own localStorage descriptor without a value read
  -> usable data property with clear(): preserve it
  -> missing, incomplete, or accessor property: define happy-dom Storage
  -> run tests with no Node native getter access
```

`--localstorage-file` is deliberately not used: a process-global persistence
file would introduce cross-worker state and would not represent the existing
happy-dom test owner. `NODE_OPTIONS=--no-experimental-webstorage` was useful
only as an earlier diagnostic control and is not required by the final pack.

## Adversarial patcher tests

The patcher test executes the actual managed setup after removing module
imports, the unrelated KaTeX mock line, and the TypeScript annotation needed
by `node:vm`. It verifies:

- Node 25-style incomplete `{}` storage is replaced;
- a Node 26-style throwing accessor is replaced without invoking its getter;
- an already usable data-property storage owner is not replaced;
- the setup never delegates localStorage installation to `vi.stubGlobal`; and
- apply followed by revert returns the exact official setup bytes.

The focused file passed, and the complete patcher suite subsequently passed
38/38 files. The managed file list remains exactly the three paths above.

## Exact-1.9 focused target

A fresh detached official 1.9.0 clone selected only
`toolchain-hardening` 0.1.3. The maintainer staging pipeline recorded
compatibility `verified` and `ready-for-manual-cutover` after:

- pnpm 10.34.1 version check: exit 0;
- frozen install: exit 0;
- client tests: 69 files, 1,040 passed and 3 skipped;
- server tests: 4 files and 99 tests passed;
- Svelte diagnostics: 0 errors and 0 warnings; and
- production build: exit 0.

The test command ran without `NODE_OPTIONS`. Its complete captured stderr had
zero `localstorage-file` warnings. The two existing localhost:3000 mock
`ECONNREFUSED` reports remained visible and the complete suites exited 0.

## Maximum graph, combinations, and revert

A separate fresh official target received the final `--all` graph:
compatibility `verified`, 28 packs, 538 units, five declared ordered
collisions, 219 planned paths, and 217 transaction-managed source paths.
Observed gates were:

- client tests: 128 files and 1,533 tests passed;
- server tests: 9 files and 163 tests passed;
- captured `localstorage-file` warnings: 0;
- Svelte diagnostics: 0 errors and 0 warnings;
- production build: exit 0; and
- BG bundle: 8,200 KB with `sendChat=function` load check.

A repeated plan returned zero changed paths and all 217 source paths skipped.
Empty-selection revert changed the 219 planned paths, and the target's tracked
source diff returned to zero.

The final exact-target combination verifier observed:

```json
{
  "rawSelections": 2048,
  "verifiedSelections": 2048,
  "normalizedGraphs": 1024,
  "managedPaths": 222,
  "maximumResolvedUnits": 538,
  "roundTrips": "passed",
  "workers": 2,
  "totalMs": 880039.29
}
```

Cache observations were composition bypasses 2,050; composition
hits/misses/stores 2,047/2,047/2,047; pair-cache entries 2,143 with 550,945
hits; pack-ETag hits/misses 58,819/61; and state-encoding hits/misses
2,047/2,047.

## Deterministic installers

`scripts/build-installers.cjs` was the only `dist/` writer. Two consecutive
final builds produced identical bytes, and all four files passed `node --check`:

| Installer | Bytes | SHA-256 |
| --- | ---: | --- |
| `pocketrisu-patcher.cjs` | 5,085,479 | `1354bf1421dbcee72699689e9f008f7a3cb67df9f6e3208b8e5bc2d2766f1c9f` |
| `pocketrisu-features.cjs` | 5,085,485 | `6e510ab64319fb596bcb148b55079e61ce0bda2355b755e4e39983c0d57a6a2d` |
| `pocketrisu-hardening.cjs` | 5,085,486 | `c4ad2185c3369fe1e5856d0eb48d1d01be0dc508b7309c5037fe0829c76f0a42` |
| `pocketrisu-all.cjs` | 5,085,480 | `bf32c893a2dd2695a0c17a7d557d4a44aeab69fa02c2d8eafdfa37da4ae1547b` |

## Live admission observation

Under the user's separate live apply/restart authorization, the final
universal installer upgraded the existing aggregate live graph. The live plan
changed only the BG composer source, K16 Settings route, `vitest.setup.ts`, and
patch state. After PM2 was stopped, the live target observed:

- state format 2 / profile `all` / 28 packs / 538 units / 217 source paths;
- frozen install: 109 packages reused, zero downloaded, exit 0;
- client 128/1,533 and server 9/163 tests passed with zero
  `localstorage-file` warnings;
- diagnostics 0/0, production build exit 0 after 7,857 modules, BG load check
  passed, production prune exit 0, and runtime dependencies resolved;
- repeated plan: zero changed paths and 217 skipped; and
- post-restart PocketRisu 1.9.0 online with zero active requests and zero PM2
  error-log byte growth.

The live database and backup inode/size observations were unchanged across the
operation, post-restart SQLite `quick_check` was `ok`, and no user-data row was
deleted or rewritten by this toolchain correction. Exact live observations are
also recorded in `docs/POCKETRISU-1.9-AGGREGATE-L3.md`.

## L2.5 resolution and remaining boundary

- **Runtime leaf:** none. The modified setup is loaded only by Vitest.
- **Owner-present/absent graph:** exact official setup is owner-absent; the
  focused pack and maximum graph are owner-present and both passed without a
  process flag.
- **Normal-owner preservation:** usable own data-property storage is preserved;
  only missing, incomplete, or accessor-backed Node globals are replaced.
- **Revert:** the managed setup replace is byte-exact, and the complete maximum
  graph returned tracked source to official bytes.
- **External effects:** no timer, socket, request, database, plugin, browser
  storage, or server state is added.

No physical iPhone distinction is required for a Vitest-only setup. The K16
and BG composer rows carried by the same live graph remain separately pending
their consolidated physical re-L3. Push, tag, release, and publication remain
out of scope.

## Commits

The measured corrections were retained as separate local infrastructure and
generated-installer commits:

- `7ef0e92` / `2049deb`: incomplete/throwing-value fallback and installer;
- `d9182db` / `f1d407e`: descriptor probe and installer; and
- `7fce915` / `53512ab`: final getter-free install and canonical installer.

The final effective boundary is `toolchain-hardening` 0.1.3 at `53512ab` plus
the later receipt commit. No commit was pushed, tagged, or released.
