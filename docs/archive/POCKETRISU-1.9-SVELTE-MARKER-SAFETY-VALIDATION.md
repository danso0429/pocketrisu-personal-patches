# PocketRisu 1.9 Svelte marker-safety validation

Date: 2026-08-02 KST

## Result

The aggregate iPhone L3 exposed literal patch ownership text in K11's
HypaMemory UI. A full manifest audit found the same structural hazard in two
K11 adapter units and two `preset-integrity` units: each inserted Svelte
markup through a generic `content` block, so the patcher surrounded it with
JavaScript-style `/* ... */` ownership text. That syntax is not a Svelte
markup comment and can become a visible text node.

Commit `1d53f58` converts those four units to exact managed Svelte blocks and
adds a manager-level fail-closed rule. Commit `fd60890` contains the canonical
generated installers. Both were pushed before the live update. The corrected
542-unit candidate is live; K11 and preset interaction re-L3 remains pending.

## Purpose, trigger, state/result, and preserved contract

| Surface | Contract |
| --- | --- |
| Purpose | Keep patch ownership markers machine-detectable without making them UI text. |
| Trigger | A non-owned unit targets a `.svelte` file and its inserted content begins with Svelte markup such as an HTML comment, element, block directive, or render directive. |
| State/result | The unit must provide its exact `managed` block. K11 and preset units now use HTML comments inside that block; apply, status, repeated plan, and revert continue to use the existing marker needle and transaction owner. |
| Preservation | K11 manual-mode behavior, native Hypa search/reroll, preset `-1` sentinel handling, native preset controls, all provider/custom/local routes, storage owners, pack selection, and exact target gates remain unchanged. |
| Failure boundary | A future likely-markup `.svelte` `content` unit without `managed` is rejected while loading the catalog, before target source is written. Script-context Svelte insertions may continue using JavaScript comments. |
| Exclusions | No runtime marker parser, DOM cleanup, second state owner, new preset policy, or K11 feature behavior is introduced. |

## Exact patch and revert surface

The infrastructure/adapter commit changes only:

- `src/manager.cjs` and its contract tests;
- K11 adapter units `modal-panel-close` and `header-manual-button` plus their
  adapter version/test assertions; and
- `preset-integrity` units `prompt-body-start` and `prompt-body-end` plus its
  pack version/test assertions.

The feature-local exact revert is `git revert 1d53f58`, followed by the
canonical installer builder. The generated files are not hand-owned;
`fd60890` is regenerated from the two feature commits. In the live aggregate
graph the marker correction owns only
`src/lib/Others/HypaV3Modal.svelte`,
`src/lib/Others/HypaV3Modal/modal-header.svelte`, and
`src/lib/Setting/Pages/PromptPreset/PromptPresetBasicInfo.svelte`; patch state
remains in the existing transaction schema.

## Observed gates

| Gate | Observation |
| --- | --- |
| Focused patcher contracts | Manager, K11, and preset-integrity tests passed, including rejection of likely Svelte markup without an exact managed block. |
| Patcher suite | 38/38 test files passed. |
| Focused applied runtime | 5 files / 34 tests passed across direct lifecycle, generation busy, K11 selection/panel, and preset integrity. |
| Disposable aggregate apply | 28 packs / 542 units / 223 planned managed paths / five ordered collisions; repeated plan had zero changes. |
| Exact revert | Disposable target and its baseline compared equal after revert when builder-only artifacts were excluded. |
| Combination verifier | 2,048/2,048 raw selections, 1,024 normalized graphs, maximum 542 units, 223 managed paths, and round trips passed with one worker. |
| Live client/server | Client 129 files / 1,537 tests; server 9 files / 163 tests; all passed. |
| Live diagnostics/build | Svelte diagnostics 0 errors / 0 warnings; 7,857 modules transformed; production build exited 0. |
| Compiled marker scan | Zero production `.js` files contained `POCKETRISU-PATCH:`. The served main asset matched the local marker-free asset byte-for-byte. |

## Generated installers

The canonical builder was run twice over unchanged source; both runs produced
the same sizes and SHA-256 values:

| Installer | Bytes | SHA-256 |
| --- | ---: | --- |
| `pocketrisu-patcher.cjs` | 5,094,114 | `acb7df69759063e67e5731bb2b5f924fa28cbd71a99cb862ba901505e37b2144` |
| `pocketrisu-features.cjs` | 5,094,120 | `1ec2b57ae61ed7306e34736c09fecbbdb94267eed8de9e1f5aaa0e9762682aae` |
| `pocketrisu-hardening.cjs` | 5,094,121 | `b587046167e1b4db5cb7417447d11465111dfa0de1df2834f39a1fdd7abd4716` |
| `pocketrisu-all.cjs` | 5,094,115 | `32ae593398b17fbf69d013718c8a251be9b2b77e3439e16bb609d09250e77432` |

## Live admission

At 2026-08-02 20:25 KST, preflight observed PM2 active requests 0, model-job
running/queued 0, unclaimed terminal main jobs 0, pending sends 0, result
payload rows/bytes 0, and nine operation states, all `delivered`. SQLite
`quick_check` returned `ok`. The exact plan reported seven changed paths: six
source/test paths and the existing patch state.

PM2 was stopped before transactional apply. Frozen install reused 109 packages
and downloaded zero. After the gates above, the BG bundle was 8,397,997 bytes
with SHA-256
`6490c8526a99df829f90d90bc1b668f0d82c421970f0b8823f50f2282de78204`;
its load check exposed both `sendChat` and `sendChatWithDirectLifecycle` as
functions. Production prune completed and `express`, `better-sqlite3`, and
`msgpackr` resolved. Replan reported 28 packs / 542 units / five collisions,
zero changed paths, and 218 current transaction-managed source paths.

After restart, PocketRisu 1.9.0 was online at PID 3509259 with zero unstable
restarts and zero active requests. Root and main asset returned HTTP 200.
Served and local `index-Wn8GBpq6.js` were both 1,998,555 bytes with SHA-256
`eeb28d0b62bd2d149cd965e2adc9e867d3baa7a806cd5bbab7f715a016e5fe36`.
The BG status route rejected an unauthenticated request with 401. The PM2 error
log remained 112,100,553 bytes.

Post-restart running/queued/unclaimed/pending work and result payloads remained
zero, the same nine operation states remained delivered, and `quick_check`
remained `ok`. The main DB, model-jobs DB, and backups retained their observed
inode/size values `786453/2710347776`, `872636/4096`, and `788086/4096`; no
nested `save/save` appeared. The preserved K12 worktree remained at
`081a32b`, with index-listing SHA-256
`632b6d3285e85650be19efe5c4f6c70a3af56fdec683fc9a5a182505118704b3`
and cached binary-diff SHA-256
`916440ab240e0f7541844f0082ce53d1d5f516d08ea1bdfc79a55149d7ca66a9`.
No paid request, destructive user-data operation, tag, release, or physical
re-L3 was performed during admission.

## L2.5 runtime audit

### Phase 1 — flat discovery

- every exact-1.9 non-owned `.svelte` unit, its insertion context, wrapper,
  marker needle, apply/status/replan/revert behavior, and compiled output;
- K11 modal/header control flow and preset active-body control flow;
- owner-absent and owner-present graphs, all 2,048 raw selections, maximum
  composition, generated installers, live source, and served production bytes;
- provider/custom/local, generation, storage, plugin-array, and user-data
  owners that must not move with a presentation-marker fix.

### Phase 2 — external-anchor resolution

- **Visible finding — device text plus applied source.** The exact literal
  K11 strings corresponded to generic JavaScript comment wrappers placed in
  Svelte markup, not to HypaMemory-generated content.
- **Complete structural scope — catalog load plus full suite.** Four existing
  units required conversion. The manager rule makes the same likely-markup
  shape fail closed across future packs rather than relying on another visual
  report.
- **Runtime absence — compiled scan plus served hash.** The production build
  contained zero ownership marker strings in `.js`; the served main asset was
  the identical local byte sequence.
- **Composition and revert — exhaustive verifier plus disposable target.** All
  raw selections round-tripped, maximum replan was empty, and exact revert
  returned the disposable source to its baseline.
- **Owner preservation — source and graph.** Only Svelte insertion encoding
  changed. K11, preset, provider, storage, plugin-array, and BG state owners
  were neither duplicated nor rerouted.

### Phase 3 — triage

- **Q3 fixed and live-admitted:** the four known markup-context wrappers are
  HTML comments inside exact managed blocks.
- **Q3 fail-closed:** a new generic likely-markup `.svelte` insertion is now a
  manifest error before source mutation.
- **Q1 no duplicate authority:** transaction state and marker needles remain
  the sole patch ownership mechanism.
- **Q4 pending physical re-L3:** reload the client, open Prompt Preset and
  HypaMemory manual mode, and confirm normal controls with no visible
  `POCKETRISU-PATCH` text. Automated admission does not infer this device
  result.
