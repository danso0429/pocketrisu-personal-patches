# G1.7 role, identity and argument-epoch evidence

2026-10-10 KST. Baseline `36d9e76`, experimental.29 / Personal settings 0.5.14 / BG adapter 0.7.36. This checkpoint changes maintained probes and documentation only. It characterizes current behavior rather than approving every observed behavior for M7. Production activation, actual providers and G1 device/aggregate qualification remain separate.

## Authorities and refresh window

The operation database and the latest canonical storage root are distinct authorities. `getDatabase()` reads the detached operation DB; argument/storage APIs use `storageOwner.getRoot()`. The new host fixtures opt into separate objects and explicitly swap the operation snapshot before refresh. Existing fixture defaults are preserved.

The generated orchestrator has one `refreshIdentity()` call, after raw input has been durably attached and `readAssemblyContext()` supplies the newer root/chat. The maintained insertion is `plugin-host-units.cjs`'s `host-refresh`, subsequently wrapped by the omission unit. This is an assembly boundary, not continuous identity monitoring. Client-prepared/no-input paths and changes after that boundary must not inherit an unmeasured immediate-revocation guarantee.

## Actual OS host and SQLite

The maintained host probe passes 71/71: the original 47 cases plus 24 added characterizations. These use real isolated workers and in-memory SQLite notification/permission storage; providers remain synthetic. The canonical root writer here is a fixture closure over a JavaScript object. Real storage argument/CAS/onWrite code executes, but this host-level fixture does not exercise the production canonical persistence/ETag queue or restart durability. Those are distinct from the actual Send/store evidence below.

| Condition | Observed result |
| --- | --- |
| Canonical-only script/name/version/disable/remove/reorder changes | Refresh still sees the old operation snapshot until it is swapped. |
| Script/name/version changes at the attached assembly boundary | The affected entry is disabled. Existing initialization effects remain; no old-hook network call or replacement initialization is executed. A same-position healthy following entry remains available. |
| Disable/remove/reorder at that boundary | Index comparison conservatively disables shifted entries too. This is current characterization, not an approved general equivalence or a name-based remapping policy. |
| Front/middle insertion | Shifted entries are disabled and the new entry receives an addition notice; new initialization is not executed. |
| Tail append | Existing callback stays available; the new plugin receives `plugin_set_changed` without executing its initialization. Repeated refresh uses stored notification receipt deduplication within the SQLite fixture. |
| Live argument change with unchanged script | Callback reads the latest canonical argument even while the operation snapshot is old. Conditional roles and callback state retain their original load epoch; a new operation uses the new registration condition. |
| Disabled duplicate with the same name | Canonical argument lookup refuses non-unique identity; no write or network effect occurs. Native v3 source instead returns the first matching name. Browser duplicate behavior is not measured; this combination remains outside native-equivalence qualification. |
| Two enabled entries with the same name from startup | Only the first initializes/registers, but its canonical argument lookup refuses ambiguity after that initialization effect. This is a static support difference, not only a mid-operation change. |
| Script replacement after refresh, network before argument read | One request is issued under the old operation context before canonical argument lookup rejects the replacement. No immediate revocation or rollback is claimed. |
| Identity-disabled selected provider | The registered provider throws `plugin_provider_failed`, remains owned until close, then unregisters. It is not silently converted into a successful default model. |
| Name-keyed and script-digest grants | Both provider grant forms use the operation's old script before the swap. Canonical argument identity can subsequently refuse the same entry; later provider calls fail. |
| External argument edit after read, followed by stale setter | CAS preserves the externally edited fixture root value; committed fixture writes stay zero. The conservative effect-intent latch is true, so the notice does not claim that all effects were absent. |
| Successful argument write, then swap/refresh | Fixture root and operation DB receive the per-key value; the one committed fixture write is preserved through refresh and the existing callback without a false identity failure. |

Identity notices are checked before and after initialization effects, as are registration cleanup, unaffected callback output and absence of initialization replay. A restricted-shell baseline failed worker creation (41 failed, one cancelled, five passed); the same unchanged 47-case baseline passed with the required OS namespace execution permission. That failed environment run is retained and excluded, not classified as an application regression.

## Byte-original MARP roles in native v3 and server

Original Lite 0.9.2 remains 64,022 bytes / SHA-256 `b1aa573048ea31ec036e21fd9df9f1a35d136435e247f15c3cdaa6026cd8e132`. The existing PDF runner's optional `roles` suite invokes the actual browser-v3 registered callback and the original script in the actual isolated server host with identical durable UI settings. The default PDF suite and default `model` role are retained.

All 18 role cases match. Ten cases issue three synthetic analyses each; eight issue none. Final URLs, bodies, configured headers and returned injection are compared. Loopback forwarding/host/content-length headers remain route-specific evidence rather than universal wire equivalence.

- Main, case-insensitive `MODEL`, omitted role and empty role execute analysis.
- Default main-only configuration bypasses submodel/auxiliary roles. Disabling main-only admits those roles.
- Memory/HypaMemory and translation bypass settings remain independent of main-only; each tested override behaves identically in both hosts.
- `lb-process` bypass and its override are tested with real input content.
- A role bypass returns before old-injection cleanup, preserving the incoming old block. A main analysis removes the old block and inserts one new block. The first run's contrary cleanup expectation failed despite matching browser/server outputs; source inspection corrected the expectation, and the complete run passed. The failed run is retained, not upgraded to a pass.

These are hook/final synthetic analysis transport observations. Both hooks receive the tested role explicitly (or omit it explicitly); this does not establish which strings every auxiliary server caller supplies or whether those request types execute server-side. They do not qualify every provider family, actual account or physical device. The existing OpenAI default PDF suite subsequently passes 24/24, preserving the helper's default `model` behavior.

## Actual Send, refresh and store

The maintained settings probe wraps and awaits the actual host's original bound `refreshIdentity()` method, forwarding its result and error. Real synthetic UI Send/strict root flush/start-ACK, browser closure and normal-chat/SQLite journal assertions remain active. Observation-only snapshot errors are separate runner failures and cannot skip the real method; notification observation forwards the original publication call. The final runs explicitly check zero host identity/failure notices for these unchanged-original scenarios.

| Scenario | Operations / completed refreshes | Analysis / main attempts | Stored answers |
| --- | --- | --- | --- |
| Save selection, then Send | 1 / 1 | 2 / 1 | 1 |
| N active, enqueue N+1 and save settings | 2 / 2 | 5 / 2 | 2 |
| Native main retry after saved settings change | 1 / 1 | 5 / 2 | 1 |

Each measured operation starts its host, performs one assembly refresh, then issues analysis. Native retry rereads settings and repeats legitimate analysis without reloading the host or repeating the assembly refresh. Host-level identity fault characterizations are not presented as full-Send identity-fault tests.

## Validation and remaining admission

Syntax/diff checks pass. Full patcher command passes; this environment's Node 25 reporter counts 52 test-file entries, with zero failed/cancelled/skipped entries. Installer build is byte-identical to delivered experimental.29: 7,136,747 bytes / SHA-256 `4883c4d7408e75612979d8f4292c0667803ef451e0e27b816945a007a40ed364`. Application/manifest/version/live payload is unchanged; prior runtime build, type, server/client and exact-revert results remain their documented baseline evidence, not newly executed counts.

Final direct runs pass host71, roles18, default PDF24 and actual selection/queue/retry. All four measured operations complete one refresh with zero host notices and zero observer errors. Probe snapshots are frozen by SHA-256: host `aeeb55c2edfe77917c9e68c6a128776436636b0639aaff6674af7af1a837775c`, PDF/roles `e9f55893d5ac6150653673ee14bbd5607f129eecdb53862486d2425ab3ab8603`, settings runner `065ebbbf5c20a880806f9c0c0110163426a5ae69d037af73e2cce16ebbc9137a`, PDF host helper `cb554acf6fbf3be76f4a6f7b60d9663b01ac0dba4baa49a695b7885f3f0c6883`, settings preload `7747272ef0e657c8a6315b46ebbe9ae90591245a60387e026ccc946792aec86b`.

Remaining M7 work must select and verify the supported context-transition contract before widening admission: index-shift omissions, duplicate names, live-root versus captured-operation identity, initialization-dependent role changes and handle-bearing oversized-call reuse are not silently promoted into native equivalence. Duplicate-name handling and non-attached-path identity authority are required design work before M7, rather than indefinite exclusions. Test actual generated caller failure/ownership paths at selected transition windows, including any client-prepared bypass, selected provider and effect/replay outcome. Current refresh notices use the preceding hook/load phase, not a dedicated assembly phase; that diagnostic limitation remains explicit. Grant-form divergence after a swap is not demonstrated as a reachable production risk: the generated caller immediately invokes refresh, which disables changed identities before provider execution. Production remains OFF; no additional user L5, runtime deployment, stable tag or release is implied by this evidence-only checkpoint. G1.8/G1.9, G1.10 and unchanged official Archive Center G2 remain separate.

Opus 5.5 planning and mid-implementation consultation led to the separate-authority fixture, additional insert/duplicate/successful-write cases and observer safeguards. Final consultation reread all five current scripts and this validation, identifying no blocker to publishing this evidence-only checkpoint and correcting the root-writer fidelity wording above. It inspected only an initial structural-audit match, did not read the runtime audit, and ran no tests or hash calculations. Codex's recorded executions and computed hashes are the test evidence. Wider auxiliary caller mapping and M7 transition decisions remain unresolved.

Product decision confirmed on2026-10-10: the user selected notice-plus-omission for a non-provider analysis entry that becomes unusable after an operation starts. Preserve the previous chain value, finish/store the answer and retain the mandatory omission/failure notice. Retain existing effects and prohibit automatic input/analysis replay; selected model-provider failure continues to reject. Apply this contract to the forthcoming context-boundary implementation. This choice does not declare production activation or full M7 qualification.
