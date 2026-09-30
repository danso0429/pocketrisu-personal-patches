# Native input execution context

Date: 2026-09-30 KST. Baseline: d48190e / experimental.15.
Candidate: 0.2.4-experimental.16, lazy-chat-bg-adapter 0.7.23.
Status: implemented, automatically verified, reviewed and delivered live. Broader
native-input admission and aggregate BG/device qualification remain open.

## Scope

This is the first native-input qualification correction before widening G1.5a model
admission. The user directed BG implementation to proceed before the separate r3
terminal-recovery/navigation redesign. That redesign is not included here.

Input trigger and editinput execution previously occurred before the wrapper used
by main generation. As a result, they lacked the operation's inherited cancellation
signal and external-header conversation context, and the bundle's document/location
stubs were still present. The wrapper is now defined earlier and reused for input.
It restores the caller's global property descriptors on success/failure. An aborted
operation cannot attach a new transformed input even when a script handles the
provider abort as an ordinary return value. Existing main/preview paths and public
cancellation/deadline error messages are retained.

The model eligibility policy, raw-input capability, preset/module/custom endpoint
support, frontend recovery and retention policy are unchanged. This correction does
not establish full native-input, MARP or G1 qualification.

## Evidence

- Baseline generated-runner regression: three failures / one preservation pass.
  Input lacked the inherited signal; operation cancellation and deadline did not
  propagate to the input provider. This does not mean individual providers had no
  timeout: the defect concerned the operation controller's scope.
- Final execution-context suite: 7/7. It uses the generated runServerPreview,
  actual abort/context/header owners and an actual Lua engine. It verifies input /
  editinput / main signal and conversation identity, environment restoration,
  abort-before-attachment, swallowed-abort handling, unrelated context isolation
  and acquisition by a subsequent prepared turn.
- Final full server: 451 passed / 12 existing skips. Compatibility: 74 passed / five skips.
- Patcher: 51/51. Type/Svelte diagnostics and help checks passed; frontend and BG
  builds passed, and the BG bundle loaded sendChat.
- Maintained frontend paths: all 353 hashes match the .15 candidate. No frontend
  runtime source changed. The prior 2,090-pass/four-skip frontend result is reused
  for that unchanged source; it was not rerun as a new full frontend measurement.
- Composition: 42 packs, 1,204 units, seven declared collisions; re-plan zero.
  Exact revert compared 1,022 baseline files with zero byte/mode mismatch.
- Installer: 5,728,813 bytes; SHA-256
  `d0d27fd64e517b5e4864b3b7fc75c26c32d2c08da89bf5aa1810027793286c0d`.

The reproducible `scripts/probe-bg-native-input.mjs` loads a built bundle into a
fresh synthetic working directory and rejects fetch requests except its synthetic
provider and local Lua asset/auth/log stubs. It uses no live credentials or user
data. This fetch interception is not an OS-level network sandbox for arbitrary
node:http/https callers. The exercised adapters use the intercepted fetch path.
The actual v2RunLLM input trigger selected its preset, made one synthetic
request and stored the response variable. A synthetic provider 500 instead produced
the existing script value `null`; this ordinary failure was not converted into a
run-wide poison condition. In separate cold processes, Lua input under the bundle's
browser stubs failed with `TypeError: Invalid URL`; masking document/location allowed
the input handler to set its expected variable. The probe's --mask option reproduces
the environment, not the complete server route. The generated-runner/actual-Lua
suite separately verifies that the production wrapper supplies that environment.

The final probe also drives the actual serverChatInputTransform helper, real bundle
input trigger and real processScript/editinput before appending the input. Lua
onInput set the expected variable and its editInput listener followed by regex
produced `regex input [lua]`; the native preset plus regex produced `regex input`.
Provider 500 preserved the script's `null` variable and appended the original input.
These are real transformation functions with synthetic transport, not a full HTTP
server run. Final review requested this editinput coverage and exact cancellation/
deadline message assertions; application runtime source was unchanged afterward.
The final probe asserts the appended input identity/text and zero provider calls
in its Lua-only case. Final Opus review found no delivery blocker in the scoped
runtime change; its follow-up checked the strengthened tests and real editinput
probe without rerunning them.

## Consultation and limits

Opus identified the wrapper ordering gap and suggested qualifying it before enabling
more native routes. The cancellation/header gap was reproduced before editing; the
cold Lua issue was treated as a hypothesis until the separate-process experiment.
The review also identified the following existing boundaries, which remain explicit:

- A deadline during an unattached input transform follows the existing unknown
  transformation-outcome path. It does not automatically replay potentially paid
  effects; dependent inputs remain blocked by predecessor_outcome_unknown. Explicit
  user cancellation continues through the existing cancelled settlement route.
  The single existing 600-second operation budget is shared by input and main;
  time spent in input therefore reduces the budget remaining for later stages.
- Abort propagation covers cooperating fetch/requestChatData descendants. It cannot
  force arbitrary non-cooperating script work to stop. Interactive alert/wait APIs
  in a headless input/main script are not qualified by this change; support/rejection
  belongs to the next input-host eligibility unit. Do not advertise universal input
  deadlines or release the shared lock while abandoned scripts could still mutate it.
- UI/preset/module/custom-provider admission is not broadened. Plugin hooks absent
  from the server bundle, endpoint reachability and browser/server transport parity
  remain the next qualification work. Do not impose a public-only endpoint rule from
  a single transport path; preserve supported local/custom endpoint behavior.
- Existing SQLite/input record formats are unchanged. No migration or result cleanup
  is required. Existing build/dependency warnings remain.

## Live delivery

Implementation commit `7581aee` was pushed before delivery. The live plan contained
only bgOrchestrator, the new test file and patcher state. Preflight verified 440
managed files without drift and zero active requests, pending sends or input records.
After the idle check the process was stopped and an application/patcher-state backup
of 91,206,643 bytes was created. All 1,603 regular files were read back and matched
source hashes, lengths and modes. This archive does not include database payloads;
the existing full database backups were preserved, and no record/schema migration
or user-data cleanup was performed.

Apply, frontend/BG build and bundle load completed; re-plan was empty. After restart,
all 441 managed files matched their hashes/modes and root HTTP plus 17 script assets
returned 200 with matching local hashes. All five databases passed quick_check;
external-header settings were byte-identical. PM2 was online with zero unstable
restarts. Active requests, pending sends and input records were zero; operation
records remained 130 before and after delivery. The readiness helper waited until
the post-restart idle/metric condition was satisfied, without cancelling work.

Two new error-log lines were the existing retained-journal and recovery-stall
categories. No retained result, input or chat was manually deleted or restored.
No stable tag/release was made. This delivery does not resolve the deferred r3
navigation/terminal-adoption issue or qualify the next preset/module admission unit.
