# PocketRisu Kei K19 fullscreen image viewer validation

Date: 2026-07-31 KST

## Scope and provenance

This receipt covers K19 from the PocketRisu Kei integration catalog:

- add a hidden `kei-fullscreen-image-viewer-core` pack;
- admit that child through the user-selectable `pocketrisu-kei` meta pack;
- add a reusable fullscreen viewer and pure sparse-gallery navigation helper;
- open character additional-image assets in that viewer without changing the
  existing asset add, delete, exclude, storage, or database flows.

The adaptation was audited against PocketRisu Kei revision
`cc1d1b195babd887577ebf943d5e82f01f58135c`:

- `src/lib/UI/GUI/FullscreenImageViewer.svelte`;
- the additional-image preview flow in
  `src/lib/SideBars/CharConfig.svelte`.

The source and GPL-3.0 attribution are recorded in
`THIRD_PARTY_NOTICES.md`. K02 did not need an admitted primitive: PocketRisu
1.8.1 already provides Svelte 5 and `@lucide/svelte`, the only framework and
icon dependencies used by this focused adaptation.

The base inlay gallery remains byte-untouched. PocketRisu 1.8.1 already has
its own fullscreen inlay viewer, and the Kei inlay caller retains arrow-key
handling alongside the shared viewer's arrow-key handling. Porting that
caller would broaden K19 into the K18 settings surface and could double-step
navigation. This change instead centralizes Escape and arrow handling once in
the new viewer and limits the host hook to character additional assets.

## Ownership and preservation boundary

The hidden child manages exactly four PocketRisu source paths:

- owned `src/ts/fullscreenImageNavigation.ts`;
- owned `src/ts/fullscreenImageNavigation.test.ts`;
- owned `src/lib/UI/GUI/FullscreenImageViewer.svelte`;
- focused managed blocks in `src/lib/SideBars/CharConfig.svelte`.

Static contract tests reject hooks into the inlay gallery, character/database
write APIs, or additional-asset mutation. They also verify the hidden-child
contract, exact owned and host paths, keyboard behavior, 44-pixel touch
targets, provenance text, and an ETag change when managed content changes.

Across every selection graph of the ten pre-existing user-facing packs,
selecting `pocketrisu-kei` added only the seven K19 child units. All prior
resolved unit IDs stayed in the same array and no prior pack manifest,
ownership declaration, or preservation contract changed.

## Patcher checks and deterministic installers

`npm test` passed all 22 patcher test files.

All four installers passed `node --check`. Two consecutive builds produced
the same sizes and SHA-256 values:

| Installer | Bytes | SHA-256 |
| --- | ---: | --- |
| `pocketrisu-patcher.cjs` | 2,673,230 | `920f1919e5d11de55033f3e2e6ed4b81b30b1c7827665ddfba41d0b2b91fffc0` |
| `pocketrisu-features.cjs` | 2,673,236 | `915949fc36f5f68ae260cce487943afb0af370668d59014a410dbce0171afd0c` |
| `pocketrisu-hardening.cjs` | 2,673,237 | `ef2852cc6478492267cdef82ba2cbcecfaadd27f2d2c43d0d31044bd785fbb4b` |
| `pocketrisu-all.cjs` | 2,673,231 | `6704b9d6e4ccac257f1e14158410631c3650180806b9c9493516c46a82bb2244` |

## PocketRisu 1.8.1 target checks

The disposable target was freshly extracted from the PocketRisu 1.8.1 source
archive with SHA-256
`3dd071eb9faac2e25e5bfd809ecf54bcb59657908e09243e49873f9ec3c55c12`.
No live PocketRisu tree was modified or restarted.

The focused target Vitest file passed four tests covering sparse indexes,
boundaries, Escape, and available/unavailable previous and next actions.

`svelte-check` on the K19-only target reported zero errors and four warnings
in `DefaultChatScreen.svelte`. A pristine 1.8.1 baseline reported the same
zero errors and the same four warnings at the same locations.

The full target test comparison was:

| Target | Files | Tests |
| --- | --- | --- |
| pristine 1.8.1 | 59 passed, 2 failed | 841 passed, 83 failed, 3 skipped |
| K19 only | 60 passed, 2 failed | 845 passed, 83 failed, 3 skipped |
| K19 + `toolchain-hardening` | 62 passed | 928 passed, 3 skipped |

The two K19-only and pristine failure files were the same Google Gemini cache
tests, all failing because the pristine test environment exposes
`localStorage.clear` as a non-function. K19 did not copy the existing
toolchain polyfill or hide those baseline failures. With the independently
owned `toolchain-hardening` pack composed, the complete target suite passed.

The K19 + `toolchain-hardening` production frontend build completed. It
reported the same four `DefaultChatScreen.svelte` warnings plus existing
externalized-module, dynamic-import, plugin-timing, and large-chunk warnings;
the build exit code was zero.

## Apply, repeat, composition, and exact revert

The explicit K19-only CLI flow observed:

- apply resolved `kei-fullscreen-image-viewer-core` and `pocketrisu-kei`;
- the four source paths above plus private state and intent changed;
- the second plan reported `changedFiles: []`;
- status was `current`, and all four managed source files matched their
  expected SHA-256 and POSIX mode;
- revert removed the three owned files, restored `CharConfig.svelte`, and
  ended with status `clean`.

A normalized tar of the complete source tree, including paths, content,
symlink targets, and modes while excluding private `save` metadata, had the
same SHA-256 before apply and after revert:
`bf2d690f576f4d62287d0a082f10b6e26cb0999f17d0f08728a53810446084a5`.

The explicit `pocketrisu-kei,toolchain-hardening` flow reported every K19 and
toolchain-managed file current, then produced a zero-change second plan.

The exhaustive combination verifier observed:

```json
{
  "rawSelections": 2048,
  "normalizedGraphs": 1024,
  "managedPaths": 156,
  "maximumResolvedUnits": 312,
  "roundTrips": "passed"
}
```

For every raw selection it performed plan, apply, a zero-change second plan,
status, and an empty-selection revert, then compared all 156 managed paths'
bytes and POSIX modes with the initial snapshot.

The established exact-revert boundary is unchanged. A directory comparison
against pristine 1.8.1 found no missing directories or mode changes and only
the five existing empty mode-`0700` parent directories created by patch
transactions or other owned packs:

- `save`;
- `save/pocketrisu-patches`;
- `src/lib/Setting/Pages/PersonalSettings`;
- `src/ts/personalSettings`;
- `src/ts/vendor`.

They contained no files or symlinks after the exhaustive run. K19 does not
change shared patch-manager directory cleanup policy.

## Remaining review and publication state

Automated checks do not substitute for an iPhone interaction check. The
remaining K19 UI gate is to open a character's additional image, tap the
previous and next controls between sparse image assets, use the close control,
and confirm that add, delete, and excluded assets still behave as before.
That L3 result is not claimed here.

The work remains local for review. No push, tag, release, production apply,
or PocketRisu restart was performed.
