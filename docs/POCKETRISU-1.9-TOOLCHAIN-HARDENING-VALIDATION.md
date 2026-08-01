# PocketRisu 1.9.0 toolchain-hardening validation

## Decision

`toolchain-hardening` is qualified for the exact official PocketRisu 1.9.0
tag, commit `85a65f3137b45c8de4a8d21a9887be213b1ac3fc`. This decision does not
qualify another pack or any later 1.9.x release.

The qualification base and the report/selection reference were separate
clean clones of that same 1.9.0 commit. PocketRisu 1.8.1 was not used as the
patch base.

## Upstream delta

Official 1.9.0 still has the original `vitest.setup.ts` without a fallback
for a present-but-incomplete `globalThis.localStorage`. Under the current
Node 25.9.0 validation runtime, the upstream object has no `clear()` method.
The two upstream Gemini cache test files therefore produced 83 failures on a
pristine 1.9.0 clone. The pack adds a `happy-dom` `Storage` instance only when
`localStorage.clear` is not a function.

Official 1.9.0 also retains lightningcss 1.32.0 in the relevant lockfile
edges and has no package override. The pack keeps its exact 1.33.0 override
and lockfile representation. It owns only:

- `vitest.setup.ts`;
- `package.json`;
- `pnpm-lock.yaml`.

It does not change PocketRisu runtime source, storage, generation, logs, or
user data. These behaviors are absent from the 1.9.0 base rather than copies
of new 1.9 features.

## Structural and automated qualification

All seven units planned against pristine 1.9.0 with no collision. The
source-only maintainer stage admitted the exact reviewing target and recorded
`review-passed`, with `readyForManualCutover: false`.

The single-pack candidate observed:

- pnpm version check: passed with 10.34.1;
- frozen install: passed;
- full PocketRisu frontend and server tests: passed;
- Svelte diagnostics: passed;
- production build: passed.

This is a target qualification result, not an L2.5 runtime audit and not a
release or cutover approval.

## Apply, reapply, status, and revert

The first apply changed the three owned upstream files plus private patch
state and intent metadata. `status` then reported `current`; every managed
file's observed hash and mode matched its recorded output hash and mode.

A repeated plan reported no changed files, and a repeated apply returned
`changed: false` with an empty file list.

Revert restored the three upstream files and removed the managed state. A
Git byte/mode comparison against the exact 1.9.0 HEAD returned no diff, and
patcher status returned `clean`. The same exact revert result was observed
after a second apply/status cycle.

## Remaining gates

The exhaustive raw-selection combination verifier remains a later repository
gate after the other packs are rebased. No live PocketRisu tree was changed,
and no push, tag, release, restart, or cutover was performed.
