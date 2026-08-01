# PocketRisu 1.9.0 startup-cache validation

## Decision

`startup-cache` is qualified for the exact official PocketRisu 1.9.0 tag,
commit `85a65f3137b45c8de4a8d21a9887be213b1ac3fc`. This decision does not
qualify lazy chat, bg-preserve, another pack, or a later 1.9.x release.

The patch base and the report/selection reference were separate clean clones
of that same 1.9.0 commit. The preserved 1.8.1 K12 checkout was not used as a
patch base or source anchor.

## Upstream delta

Official 1.9.0 already computes an ETag for the stripped database response
and can answer a matching `If-None-Match` request with 304. It does not keep
the encoded stripped body in a server memory cache, its ordinary Node storage
startup path does not issue the conditional database probe, and it has no
durable raw/decoded startup cache or bounded decoded-patch journal.

The retained pack delta therefore adds only the missing cache behavior:

- a server memory cache paired with the authoritative database ETag;
- a conditional startup load with unconditional-read fallback;
- namespaced raw and decoded client caches;
- bounded patch replay and invalidation on mismatch, corruption, full write,
  quota failure, or operation timeout;
- cache-first decode with an authoritative refresh before backup fallback.

The namespace uses the runtime PocketRisu app and NodeOnly versions; it does
not hardcode 1.8.1 or 1.9.0 in production behavior. The bootstrap replacement
ends before the rest of 1.9 startup initialization. The new
`initModelJobRecovery()` call remains after database restoration, state setup,
and module initialization, so the pack does not take native model-job
transport or recovery ownership.

## Structural qualification

The two owned files and all 17 non-owned units planned against pristine 1.9.0
with exact anchors and no collision. Four of the six managed paths were in
the official 1.8.1-to-1.9.0 changed set, so exact anchor success was followed
by source review and target checks rather than treated as semantic proof.

## Automated checks and the upstream test baseline

The startup-cache-only maintainer stage applied successfully but its full
target-test step stopped on 83 Gemini cache failures. A pristine 1.9.0 clone
produced the same 83 failures in the same two files because the current Node
25.9.0 runtime exposes a `localStorage` object without `clear()`, while
upstream `vitest.setup.ts` does not replace that incomplete object. The added
startup-cache test file does not mutate `localStorage`.

The single-pack candidate then observed:

- startup database cache tests: 15 passed;
- PocketRisu server tests: 99 passed;
- Svelte diagnostics: 0 errors and the four pre-existing upstream warnings;
- production build: passed.

The independently qualified `toolchain-hardening` pack supplies the missing
test-environment guard. A fresh 1.9.0 candidate with exactly
`startup-cache,toolchain-hardening` passed frozen install, the full frontend
and server test command, Svelte diagnostics, and production build. Its
maintainer receipt was `review-passed` with `readyForManualCutover: false`.

The baseline-equivalent failure is recorded rather than reclassified as a
pass. Startup-cache qualification rests on its focused tests, server tests,
diagnostics/build, the unchanged pristine failure comparison, and the full
combined gate with the separately owned toolchain fix.

## Apply, reapply, status, combination, and revert

The first startup-cache-only apply changed its six managed source paths plus
private state and intent metadata. `status` reported `current`; all six
observed hashes and modes matched the recorded values.

A repeated plan reported no changed files, and a repeated apply returned
`changed: false` with an empty file list. Revert removed the two owned files,
restored the four upstream files, and returned patcher status to `clean`.
Git byte/mode comparison against exact 1.9.0 returned no diff. The same exact
result was observed after another apply/status/revert cycle.

The `startup-cache,toolchain-hardening` combination separately passed its
full target gates, zero-change reapply, `current` status, and exact revert.
This pair check does not replace the later exhaustive raw-selection gate.

## Remaining gates

Lazy-chat and bg-preserve still require their 1.9 storage and generation-owner
rebases before any wider cache combination can be qualified. No live
PocketRisu tree was changed, and no push, tag, release, restart, or cutover
was performed.
