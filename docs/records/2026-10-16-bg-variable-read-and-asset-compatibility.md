# BG variable-read warning and static-asset compatibility follow-up

Date: 2026-10-16. Baseline: `9fe9e08` / experimental.53. Candidate:
experimental.54, lazy-chat-bg-adapter 0.7.58. This record covers only this
follow-up; it does not rewrite the earlier BG integration or usage-cost history.

## Reported behavior

The first ordinary request in a new chat produced two warnings even when the
user made no changes during generation: the saved response did not include
post-assembly edits, and the conversation changed after preparation.

During this investigation, ordinary Send also failed in existing chats with
the generic server-input preparation error. Expanded-composer Send could start
the default empty-input action, while the circular Stop control did not cancel.
These symptoms are investigated separately from the warning fix.

## Confirmed warning path

1. The native blank-chat factory omits `scriptstate`.
2. Native `getChatVar` previously executed `chat.scriptstate ??= {}` before
   reading a variable, including a read that only returns a default value.
3. The assembly anchor captures the earlier chat. If the mutated chat is saved
   before result commit, the latest canonical chat has an extra/different field.
4. `promptInputsChanged` compares own-field presence and canonical values. A
   missing/null state becoming `{}` therefore counts as a change.
5. The commit receipt's `promptInputsChanged` flag feeds both the operation
   notice and the foreground assembly-context warning. Two warnings do not
   establish two independent edits.

This is a reproduced source path, not a claim that every warning has this cause.

## Implemented correction

The exact-1.10 adapter replaces the getter's initialization/read with
`const state = chat.scriptstate?.['$' + key]`. The getter continues to return
character defaults before template defaults. `setChatVar` still creates state
and writes a value. The comparator, commit merge, receipt schema and warning
consumers are unchanged. No warning suppression, deduplication, normalization
of genuine edits, data migration or historical operation repair is introduced.

The patch is an explicit manifest replacement with an exact original anchor;
it is not a full-file replacement. Native variable tests receive three scoped
controls: undefined state, null state and a real setter. The first two assert
unchanged chat state and no comparator change; the setter asserts the opposite.
A commit-owner test uses the actual SQLite/outbox path to retain generated
variables and an answer without producing an edit warning. Existing positive
coverage for real post-assembly edits remains in place.

## Observed automated checks

- Before the getter correction, the maintained native variable suite failed
  its two read-only controls and passed seven other cases. These failures were
  state-mutation assertions, not syntax/import failures.
- After correction, native variable and finished-operation tests: 96 passed.
- Commit-owner controls: 78 passed, including the genuine-edit positive control.
- Full frontend: 205 files passed, one skipped; 2,488 tests passed, four skipped.
- Server: 47 files passed; 651 tests passed, 12 skipped.
- Compatibility: ten files passed, one skipped; 74 tests passed, five skipped.
- Svelte check: zero errors and zero warnings. Help-key check passed.
- Frontend production build and BG orchestration bundle build exited zero.
- Patcher: 333 passed. The first run found one stale adapter-version assertion;
  it was updated from 0.7.57 to 0.7.58 without removing or weakening checks.
- Installer rebuild was byte-identical: 8,535,079 bytes, SHA-256
  `1dfc0e79ed7cfe173f74776e9be14b289fbd504ce93b4eebe2387bc33f6a0dee`.
- Isolated full apply/re-plan/revert: 43 packs, 1,771 units, 525 written paths,
  nine composed collisions, zero remaining plan changes. Revert restored all
  1,022 baseline file paths/bytes/modes/symlinks, disabled delivery and emptied
  requested intent. No live user data or paid provider was used.

The initial full frontend attempt had no terminal receipt and is not counted.
The completed rerun printed nonfatal connection-refused diagnostics for the
absent local development service, followed by the passing test summary above.

## Read-only technical consultation

Opus 5.5 reviewed an immutable source snapshot. It found the getter correction
narrow and default/setter behavior preserved. Its test counts were supplied
by the implementer rather than independently executed by the consultant.

The consultation identified separate investigation boundaries: slash-command
`getvar` contains another initializing read; HypaV3 and actual script setters
can write during generation. Their reachability and warning ownership are not
qualified by this fix. They must not be hidden by weakening the comparator.
No such additional production path is changed here.

## Send/Stop investigation and approved asset restoration

The recorded failed ordinary admissions reported `canonical-chat-unavailable`.
That catch currently combines local revision reading, input-base retrieval and
decode, and pending-input projection parsing. It discards the underlying error;
the coarse reason alone cannot identify which stage failed.

Authenticated read-only probes for three recent chats returned HTTP 200 for
input-base and projection, and owner activity reported no busy work at the
probe time. This is a later server observation, not a trace of the device's
failed request. No operation cancellation or retained-record repair was run.

The previous deployment had replaced its asset directory, leaving 21 prior
hashed JS files and one CSS file absent. An old decoder and database chunk
returned 404. With explicit user approval, only those 22 absent files were
created. Each source hash was checked against both the verified prior backup
manifest and archive; exclusive creation prevented replacement. All current
files stayed unchanged, and every restored response matched its source hash.
There was no DB write, process restart or current-index replacement.

The user confirmed the new YYMMDD timestamp and absence of status checks, then
reported unchanged Send/Stop failure after refresh. Thus the current usage UI
is present, and the restored asset defect does not establish the cause of the
reported Send/Stop failure. The remaining issue is unresolved. Further
diagnostic instrumentation was proposed separately; it must not be reported as
implemented or as a fix before its own approval and evidence.

Future deployment staging must preserve verified previously served hashed
JS/CSS files without replacing a current same-name file. A hash collision with
different bytes must stop staging. Keep the newly built index authoritative;
verify both current and retained responses after delivery.

## Scope and remaining gates

This is a G1.3 follow-up within existing assembly-context behavior; it creates
no new G2/plugin sub-plan. No Archive Center/RCM code, settings, plugin list,
provider route, credentials, chat content or old operation records are changed.
Usage timestamp rendering has user confirmation; broader usage qualification
and aggregate release gates are independent.

Physical verification of the warning fix remains pending: on the next ordinary
new-chat request, leave the chat/settings untouched through completion and
check that neither false edit warning appears. Do not infer this device result
from automatic controls. Live delivery status is recorded separately when
executed; this document alone is not a delivery receipt. Stable remains v0.2.3.
