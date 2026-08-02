# PocketRisu 1.9 BG composer gate correction validation

## Scope and boundary

This receipt closes the local implementation and automated qualification of
the BG composer finding first observed during aggregate iPhone L3. The live
537-unit candidate rendered this source ownership marker beside the composer:

```text
/* BG-PRESERVE:START orch-composer */ || $orchestrating/* BG-PRESERVE:END */
```

The correction targets exact official PocketRisu 1.9.0, commit
`85a65f3137b45c8de4a8d21a9887be213b1ac3fc`. It extends the existing
`bg-preserve` owner; it adds no pack, unit, schema, state machine, database,
request, timer, or privacy policy. The pack version advances from
`v1.0.1-patcher.4` to `v1.0.1-patcher.5` so installed-state ETags cannot call
the changed managed bytes current.

No live source, live patch state, process, user data, paid request, or preserved
K12 index was changed during this correction. Live PocketRisu remains on the
pre-correction 537-unit candidate until a separately authorized aggregate
apply and restart.

## Purpose, trigger, state, and result

- **Purpose:** keep the chat composer stop/send affordance aligned with the
  existing BG server-orchestration owner without rendering patch source text.
- **Trigger:** render the composer while native chat generation, input
  translation, or `$orchestrating` owns the current operation.
- **State:** reuse the existing readonly `$orchestrating` store imported by the
  same BG owner. No second busy flag or persisted state is introduced.
- **Result:** the existing stop button branch is selected when any of the three
  terms is true; the existing send/reroll button branch remains the `{:else}`.

The native `currentChatGenerating` and `doingChatInputTranslate` terms remain
unchanged. The existing `abortChat` server-cancel branch, send/reroll/unreroll
guards, browser epilogue, result retention, ACK, request logging, and provider
paths are not rewritten by this correction.

## Root cause and owner-local correction

The imported 1.8 unit is an `insert` with `where: after`. Its anchor ends before
the Svelte directive closes, so the managed `|| $orchestrating` fragment lands
inside the expression. The former 1.9 adapter changed the anchor to include
the closing `}` while retaining `where: after`. Svelte therefore accepted the
managed fragment as a literal text node outside the condition, so checks and
builds did not fail.

The exact live failure was:

```svelte
{#if currentChatGenerating || doingChatInputTranslate}/* BG-PRESERVE:START orch-composer */ || $orchestrating/* BG-PRESERVE:END */
```

The corrected 1.9 adapter leaves `}` outside its anchor. Exact-target
composition now produces:

```svelte
{#if currentChatGenerating || doingChatInputTranslate/* BG-PRESERVE:START orch-composer */ || $orchestrating/* BG-PRESERVE:END */}
```

The imported 1.8 payload and its `anchorPolicy: first` behavior remain
unchanged. The exact target revert surface is the one managed fragment in
`src/lib/ChatScreens/DefaultChatScreen.svelte`; repository source changes are
limited to the adapter/version, its contract tests, this receipt, aggregate
receipts, and canonical generated installers.

## Focused adversarial tests

The 1.9 contract test now applies the actual anchor and managed fragment
together instead of asserting them separately. It breaks on:

- an anchor that again includes the closing brace;
- a final directive that places the ownership marker after `}`;
- loss of either native term or `$orchestrating`;
- non-idempotent repeated application;
- failure to exact-revert to the baseline;
- drift inside the managed fragment; and
- loss of inherited first-anchor behavior when the host contains a second
  matching expression.

The first five-file focused run exited 1 because the new test incorrectly
expected duplicate matching anchors to be refused even though this pre-existing
unit intentionally retains `anchorPolicy: first`. The test was corrected to
assert exactly one managed insertion and exact revert of the two-anchor
baseline. The unchanged implementation then produced five passing focused
files: the 1.9 adapter, G06 blocker matrix, K27 native logging, K29 retention,
and K23 regex multiplicity. The complete patcher suite subsequently passed all
38 test files.

## Exact-1.9 focused owner graph

The owner-absent exact target retains the official directive with the two
native terms and no `orch-composer` marker. Selecting `bg-preserve` resolves
the existing `bg-preserve-storage-base` child: two packs, 187 units, zero
collisions, and 94 transaction-managed source paths. No new unit or collision
was added.

On a fresh detached official target, the generated installer applied the
focused graph and produced the corrected directive. Observed gates were:

- initial unadjusted client test run: exit 1, with 14 Google adapter and 69
  cache tests failing because Node 25 exposed an incomplete global
  `localStorage` whose `.clear` was undefined;
- isolated cache rerun with Node's experimental webstorage disabled: 69/69
  passed;
- unchanged full target suite under the same process-only environment
  correction: client 93 files / 1,236 passed with three skipped, and server
  6 files / 125 passed;
- Svelte diagnostics: 0 errors and 0 warnings;
- production build: 7,819 modules transformed, exit 0;
- generated browser assets containing the literal `orch-composer` marker:
  zero;
- BG bundle: 8,090 KB, load check `sendChat=function`; and
- repeated apply: 187 units, zero collisions, zero changed paths, all 94
  managed source paths skipped.

The Node 25 flag changed only the test process environment; no target or
patcher file was modified to obtain the passing rerun. Empty-selection revert
changed the managed source paths plus patch state/intent. The target's tracked
diff returned to zero and the official two-term composer directive returned.
The two untracked BG bundle build products remained outside patch ownership and
were not used for the exact-source claim.

## Aggregate graph and combination gates

The complete exact-1.9 verifier observed:

```json
{
  "rawSelections": 2048,
  "verifiedSelections": 2048,
  "normalizedGraphs": 1024,
  "managedPaths": 222,
  "maximumResolvedUnits": 538,
  "roundTrips": "passed",
  "workers": 2
}
```

The measured verifier total was 863,449.79 ms. Cache observations were
composition bypasses 2,050, hits/misses/stores 2,047/2,047/2,047; pair-cache
entries 2,143 with 550,945 hits; pack-ETag hits/misses 58,819/61; and
state-encoding hits/misses 2,047/2,047.

A separate fresh official target received `--all`: compatibility `verified`,
28 packs, 538 units, five declared ordered collisions, 219 planned paths, and
217 transaction-managed source paths. Both the corrected composer directive
and the independent K16 narrow-screen Hotkey route were present. Observed
maximum gates were:

- client 128 files / 1,533 tests passed;
- server 9 files / 163 tests passed;
- Svelte diagnostics 0 errors / 0 warnings;
- production build 7,857 modules, exit 0;
- main asset `index-D8mk-Vj1.js`, 1,999,206 bytes, SHA-256
  `28c58db88c45497b2255eaa814accbaf8876d78ca977e73ff1d8ef9586808e2d`;
- generated browser assets containing the literal marker: zero;
- BG bundle 8,200 KB with `sendChat=function` load check;
- repeated apply: 538 units, five collisions, zero changed paths, all 217
  managed source paths skipped; and
- revert: all 219 changed paths restored and tracked target diff returned to
  zero, with only the two build-generated BG bundle products untracked.

The intermediate `ECONNREFUSED 127.0.0.1:3000` lines remained in the complete
client run, but both client and server summaries completed with the passing
counts above. Existing build warnings about externalized browser modules,
dynamic imports, plugin timing, chunk size, and CSS highlight syntax were also
retained rather than relabelled as extra passes.

## Deterministic installers

Only `npm run build` through `scripts/build-installers.cjs` regenerated
`dist/`. Two consecutive builds produced identical bytes, and all four files
passed `node --check`:

| Installer | Bytes | SHA-256 |
| --- | ---: | --- |
| `pocketrisu-patcher.cjs` | 5,085,150 | `7a97d24c3717040054c89ca80a4ca5b2019f69de3ab7ce555c4ab5326e8f64b2` |
| `pocketrisu-features.cjs` | 5,085,156 | `b3a16b2e9c8461dd9c7022ecc16dd113659958a42bbf57d9bb0eaec7f8ea9477` |
| `pocketrisu-hardening.cjs` | 5,085,157 | `6db33b756390f3f872e8d16fb8413f93cff1f79fb0426e6b8db3b87cb2f41d2f` |
| `pocketrisu-all.cjs` | 5,085,151 | `a6d6e675f904706b71cfbba7453260afb60cf1c70a623a0ff12527051eda2a3b` |

## L2.5 runtime audit

### Phase 1 — flat discovery

- 1.9 adapter anchor and inherited insert/first-anchor contract;
- imported 1.8 composer unit and target-version sibling selection;
- existing `$orchestrating` import/store owner;
- composer stop/send branch and `abortChat` server-cancel owner;
- separate send, reroll, unreroll, and entry guards;
- Svelte compiler output and generated browser asset text nodes;
- pack version/ETag, installer embedding, graph ordering, idempotency, and
  revert; and
- live attached generation, detached/cold return, stop tap, and literal-text
  visibility.

### Phase 2 — external-anchor resolution

- **Expression placement — applied target and compiled asset.** The exact
  composed line closes only after `$orchestrating`; the production asset
  contains no literal ownership marker.
- **Native and BG behavior — owner read.** The two native terms remain byte
  adjacent to the managed expression. The existing server-cancel function and
  other BG guards were not moved or rewritten, so the change is limited to the
  composer presentation branch.
- **Graph — source and generated installers.** Owner-absent, focused owner,
  maximum owner, all 2,048 selections, repeated apply, and empty-selection
  revert resolve without a new unit, collision, schema, or state machine.
- **Failure surfaces — adversarial tests.** Outside-brace placement, marker
  drift, idempotency, exact revert, and inherited first-anchor behavior are now
  exercised on the final composed output.
- **Runtime boundary — prepared, not inferred.** Build output establishes that
  no marker text node is compiled. Physical iPhone attached/cold stop-button
  state and cancellation still require the updated live bundle.

### Phase 3 — triage

- **Q3, fixed locally:** the 1.9 adapter had placed its managed expression
  after the Svelte directive. The owner-local correction and final-output test
  close that implementation defect.
- **Q3, test-environment observation:** Node 25's incomplete experimental
  global webstorage caused the first target test failure. Disabling only that
  process-global feature restored the target's happy-dom owner and all tests
  passed without source changes.
- **Q4, pending physical re-L3:** after a separately authorized aggregate live
  apply/restart, verify that no marker text appears, ordinary attached BG work
  keeps the stop button, cold/detached orchestration keeps the same stop state,
  and Stop cancels the owned operation without resurrection or duplicate
  materialization.

## Commits and remaining gate

- feature and focused tests: `838ac27`;
- canonical generated installers: `eda6eb9`.

This local correction is not a live pass. It joins the aggregate update
candidate and remains pending one physical BG composer re-L3 after explicit
live apply/restart authorization. Push, tag, release, and publication remain
out of scope.
