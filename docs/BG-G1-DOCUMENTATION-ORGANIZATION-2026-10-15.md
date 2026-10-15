# BG documentation organization record

Date: 2026-10-15. Source baseline: `08a46e4`. Scope: documentation only.

## Problem and requested structure

The README led with chronological candidate checkpoints. That made large G1
goals harder to follow and mixed user-facing overview with investigation detail.
The requested structure is README by canonical goal, a separate implementation
crosswalk, and process records as evidence.

## Changes and preservation contract

- [README](../README.md#bg-goals-and-current-scope): G1.0–G1.12 goal order,
  current candidate and explicit qualification limits.
- [Crosswalk](BG-G1-INTEGRATION-CROSSWALK.md): goal-to-unit navigation plus
  the retained chronological 47-unit / 191-commit ledger. Related links identify
  shared work; they do not double-count implementations.
- [Checkpoint history](BG-G1-CHECKPOINT-HISTORY.md): prior detailed README
  text, preserving its source/qualification snapshot and older checkpoint limits.
  Relative links are rebased for the new file location.
- Existing private retrospective records remain local. This public record does
  not reproduce private deployment details or user content.

No source, generated installer, package version, runtime or stable release is
changed. This reorganization neither reopens completed scoped checks nor
promotes deferred scenarios into passes. The .47 reversal, .48 limited closeout
and .49/.50 scoped user L5 remain explicit.

## Verification

- All three moved blocks (347 original lines) match their source text exactly
  after relative-link rebasing. A new Personal CSS section heading was added;
  its paragraph text and the remaining installer/README body are byte-identical
  to the baseline.
- All 47 units have exactly one primary goal entry; related entries are separate.
  The exhaustive 191-commit ledger is byte-identical to the prior crosswalk.
- All 246 local links and fragments in the four public documents and two local
  record/index documents resolve to existing files and explicit or heading anchors.
  This checks Markdown targets; no GitHub/browser rendering test was performed.
- The ten existing retrospective records retain their recorded hashes.
- Source, installer and version changes: zero. No model, live-runtime, application
  regression or new physical-device test was run for this documentation-only work.
- Read-only technical review found no blocking document issue. Its suggestions
  were checked and applied: M7 evidence/scope is explicit and the added Personal
  CSS heading is distinguished from preserved paragraph bytes.
