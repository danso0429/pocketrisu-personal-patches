# PocketRisu Kei integration foundation validation

Date: 2026-07-31 KST

## Scope

This receipt covers only the first admission step for the PocketRisu Kei
integration:

- register the empty, user-selectable `pocketrisu-kei` meta pack;
- include it in the rolling `all` preset;
- omit it from the narrower `features` and `hardening` presets;
- prove that future hidden umbrella children expand through `requires` while
  remaining non-selectable;
- keep every existing resolved unit graph unchanged while the meta pack is
  empty.

No PocketRisu Kei source code is copied in this step. No existing patch
manifest, unit, owner path, provider policy, storage policy, or runtime
behavior changes. The meta pack has no admitted children and owns no target
files.

## Automated checks

`npm test` passed all 21 test files. The focused Kei contract additionally
enumerated all 1,024 selections of the ten pre-existing user-facing packs and
confirmed that adding the empty meta pack did not change their resolved unit
ID arrays.

All four installers passed `node --check`. Two consecutive builds produced
the same sizes and SHA-256 values:

| Installer | Bytes | SHA-256 |
| --- | ---: | --- |
| `pocketrisu-patcher.cjs` | 2,656,530 | `795c72ea5dc7c90757681e7746e72882603e232dc1714100c740a83406832a8c` |
| `pocketrisu-features.cjs` | 2,656,536 | `0dfba315742deb28b965e90fa0e5587a9f0c21ae821cc0f7a19fc0475fcaca7c` |
| `pocketrisu-hardening.cjs` | 2,656,537 | `e059bafd630b03956bcda0481060c4dae32b1703447326a1a77a219663b3a987` |
| `pocketrisu-all.cjs` | 2,656,531 | `6177d41c15b2b68c04ee8b73aa3cd5a20a5624c53c4d01cc58151bf522343f4c` |

## Clean-target round trips

The target was a fresh extraction of PocketRisu `1.8.1`. Its source archive
SHA-256 was
`3dd071eb9faac2e25e5bfd809ecf54bcb59657908e09243e49873f9ec3c55c12`.
The patcher compatibility result was `verified`.

The full combination verifier observed:

```json
{
  "rawSelections": 2048,
  "normalizedGraphs": 1024,
  "managedPaths": 152,
  "maximumResolvedUnits": 305,
  "roundTrips": "passed"
}
```

For every selection it performed plan, apply, a zero-change second plan,
status, and an empty-selection revert, then compared every managed file's
bytes and POSIX mode with the initial snapshot.

The explicit meta-only CLI flow observed:

- initial apply resolved only `pocketrisu-kei` and changed only
  `save/pocketrisu-patches/intent.json`;
- the second plan reported `changedFiles: []`;
- status was `clean` because an empty pack creates no source state, while the
  saved intent and desired selection both retained `pocketrisu-kei`.

The explicit `pocketrisu-kei,parser-hardening` flow observed:

- apply changed nine parser source/test files plus private state and intent;
- status was `current`; both packs had `catalogStatus: current`, and all nine
  managed files matched their expected SHA-256 and POSIX mode;
- the second plan reported `changedFiles: []`;
- revert restored the source tree to the fresh archive. A normalized tar over
  the source tree, including paths, content, symlink targets, and modes while
  excluding private `save` metadata, had the same SHA-256 on both sides:
  `ae794b98f1df0e7f821ac3a384a4ee1f6b1ab82978f7f9e185a2aa4504980424`;
- final status was `clean`. The CLI intentionally retained a mode-`0600`
  intent file containing an empty custom selection so a later plain apply
  cannot reinstall the prior selection.

## Exact-revert boundary

The established combination verifier's exact-revert claim covers managed
file bytes and POSIX modes. A full directory-tree comparison after the
exhaustive run also found five empty mode-`0700` directories created as
parents for state or owned files:

- `save`
- `save/pocketrisu-patches`
- `src/lib/Setting/Pages/PersonalSettings`
- `src/ts/personalSettings`
- `src/ts/vendor`

They contained no files or symlinks. This is existing patch-manager behavior,
not a Kei meta-pack effect. This foundation change does not broaden its scope
by adding shared directory-cleanup policy.

## Publication state

The work is local for review. No push, tag, release, production apply, or
PocketRisu restart was performed. Because this step copies no Kei code,
third-party provenance files are unchanged; the first admitted child must
record its exact Kei source paths, revision, and GPL-3.0 attribution.
