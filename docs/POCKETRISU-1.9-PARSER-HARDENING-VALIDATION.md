# PocketRisu 1.9.0 parser-hardening validation

## Decision

`parser-hardening` is qualified for the exact official PocketRisu 1.9.0 tag,
commit `85a65f3137b45c8de4a8d21a9887be213b1ac3fc`. It does not qualify another
pack or a later 1.9.x release.

Both the patch candidate and the report/selection reference were separate
clean clones of that exact 1.9.0 commit. PocketRisu 1.8.1 was not the patch
base.

## Upstream delta

The eight managed files under `src/ts/parser/` are byte-identical between
official 1.8.1 and 1.9.0. Official 1.9.0 therefore still contains:

- the skipped terminal ChatML assistant-marker case;
- the skipped multiple-`<Thoughts>` extraction case;
- the skipped CBS comparison-before-logical-operator case;
- greedy thought extraction that joins multiple sibling blocks;
- right-to-left evaluation that can combine `and`/`or` before comparisons.

The pack keeps the missing parser behavior: a balanced thought extractor,
terminal generation-marker handling, and logical segmentation that evaluates
comparison atoms before the logical operators. Empty thought blocks are
removed without inventing a thought entry, while unmatched tags stay in
content instead of being silently discarded.

The ninth managed path, `src/ts/process/index.svelte.ts`, changed extensively
in 1.9 for prompt roles, per-chat generation state, and resumable pending-send
markers. The parser pack inserts one helper import and replaces only the
pre-existing thought-extraction block. It does not replace or take ownership
of the new prompt-role, model-job, pending-send, request, cancellation, or
terminal-persistence flows.

## Structural and semantic checks

All 14 units planned against pristine 1.9.0 with exact anchors and no
collision. Four helper and helper-test files are owned by the pack; all other
units compose into upstream files.

Source inspection confirmed that the new 1.9 prompt-role changes do not alter
ChatML parsing or CBS conditional evaluation. PocketRisu's existing display
parser also has a private thought/tool stripping routine, but that routine
does not populate ChatML or generated-message thought metadata and is not an
equivalent replacement for this pack.

## Automated qualification

The parser-only 1.9 candidate observed:

- parser test directory: 8 files and 82 tests passed;
- Svelte diagnostics: 0 errors and the four pre-existing upstream warnings;
- production build: passed.

A separate fresh 1.9 candidate with exactly
`parser-hardening,toolchain-hardening` passed the maintainer stage:

- pnpm 10.34.1 version check and frozen install;
- full PocketRisu frontend and server tests;
- Svelte diagnostics;
- production build.

The receipt was `review-passed` with `readyForManualCutover: false`. The
toolchain pack is a separately qualified test/dependency owner and does not
absorb parser behavior.

## Apply, reapply, status, combination, and revert

The parser-only apply changed nine managed paths plus private state and intent
metadata. `status` reported `current`; every observed file hash and mode
matched the recorded value. A repeated plan had no changed files, and a
repeated apply returned `changed: false` with an empty file list.

Revert restored all five upstream files, removed the four owned files, and
returned the tracked tree to exact 1.9.0 with a zero byte/mode diff. The
`parser-hardening,toolchain-hardening` candidate independently produced the
same zero-change reapply, `current` status, and exact revert result.

This pair check does not replace the later exhaustive raw-selection gate and
is distinct from L2.5 runtime audit.

## Remaining gates

Kei stream parsing and generation-owner adapters have not yet been rebased.
They must compose with this parser owner later without transferring its
ChatML/CBS contracts. No live PocketRisu tree was changed, and no push, tag,
release, restart, or cutover was performed.
