# G1.7 M4 — original MARP settings consistency

2026-10-10 KST. Baseline `cccdf57`, experimental.28 / adapter0.7.35. This checkpoint adds maintained probes and evidence; application source, installer content, production settings and the default-OFF server plugin host are unchanged. The ordered BG goals remain execution authority.

## Settings lifetime established by source and measurement

MARP settings are not an operation-wide immutable snapshot. Main prompt assembly owns an assembly database, whereas `pluginStorage.getItem` and `getArgument` use the canonical root through the parent storage owner. The unchanged original `beforeRequest` resets its settings promise and reads the vault followed by argument aliases on every invocation. Each invocation's agents share the resolved configuration. A native main retry therefore rereads settings; it may legitimately use a newer confirmed configuration than its first attempt.

The UI saves the vault first, then argument aliases, and confirms completion after both local API steps. Its confirmation alone does not establish server durability. Send's strict root-save barrier and independent canonical SQLite decoding are separate evidence. Nonempty global arguments override vault defaults; nonempty per-agent overrides override the resulting common fields. Clearing an override restores inheritance/default prompts.

## Maintained experiments

`scripts/probe-bg-marp-settings.mjs` takes absolute paths for an exact generated application, original script, explicitly synthetic empty-chat database fixture, Playwright dependency root, Chromium executable, private output directory and a scenario. It asserts the original fixture hash because its argument shape/default prompt expectations are version-specific; this diagnostic input check is not a runtime allowlist. `scripts/probes/bg-marp-settings-preload.cjs` supplies synthetic transport and observes actual host/storage calls. No original source or database fixture is distributed.

The server scenarios use the actual built browser, original configuration UI, strict save, admission, isolated original-script host, native provider adapter, main retry and normal-chat HTTP/SQLite storage. Browser outbound requests outside the isolated origin are refused. The server transport returns synthetic responses or rejects; it never forwards to a paid provider. Original byte identity is recorded as evidence, not used for runtime admission.

| Scenario | Observation and boundary |
| --- | --- |
| `selection` | Confirm Save then immediately Send: world OFF; plot uses its override; character inherits the common model. Both new system/user templates reach analysis; placeholders resolve; one main injection and answer. |
| `override-clear` | Clear plot model/system/user overrides through the original UI. The next analysis inherits the common model and uses the original plot prompt. Two user inputs/two normal-chat answers. |
| `all-off` | Original UI disables all agents: analysis0, main1, injection0, answer1. |
| `queue` | Hold N's world analysis; admit N+1; confirm and independently observe both durable root slots after B. N keeps its resolved A configuration; N+1 reads B, selects two agents and saves its second answer. |
| `latest` | Hold N; save B; admit N+1; save C and observe both slots before release. N+1 reads C and invokes only its world agent. Admission's older settings do not establish MARP's hook configuration. |
| `flush-hold` | Hold the actual root patch containing the updated model. UI confirmation can complete locally; a500ms observation after Send has admission/effect0. Release the patch; the selected analyses and answer use B. The held patch is asserted to contain vault and argument paths together. The client source awaits strict root/chat save before admission: a source-structural anchor distinct from the finite observation. |
| `retry` | Hold the first native main response; save B; release a synthetic500. Native retry rereads B: analysis3(A)+2(B), main2, answer1, one injection per main attempt. |
| `request-deadline` | Save a0.4s agent limit. Held world transport aborts; lenient mode retains the other two notes. Restore4s/12s through the UI; the next request completes all3 analyses and saves its answer. |
| `analysis-deadline` | Save a0.4s overall limit. Held world transport aborts; first main has no injection. Restore4s/12s; next request completes all3 analyses and saves its answer. |
| `read-interleave` | Pause the server's completed old vault read before returning it; save B durably; release. Old agent configuration and fresh B arguments produce3 common-model analyses. Actual main/store still complete. |
| `native-read-interleave` | Invoke the original hook registered through the actual browser v3 factory with its native `model` role. Hold real argument dispatch after the old vault response; save through an already open original UI; independently verify no held argument response completed, then replay dispatch. Old vault/new B arguments likewise produce3 analyses and one returned injection. This comparator invokes a registered hook; it does not claim native Send/main/store qualification. |

## Concurrent read boundary

Vault and argument reads are separate APIs. A save between them can produce a mixed view even when each individual read is valid. The controlled browser comparator and actual server Send reproduce that boundary. This is evidence of original behavior, not a guarantee of atomic settings epochs and not a basis for silently adding an operation-wide freeze or rewriting MARP. Confirmed stable settings before a hook and concurrent saves during its reads are different claims.

The probes record per-key read digests, operation-linked canonical-root digests, assembly observations, UI/durable evidence, independently checked final analysis requests, exact current-attempt note contents inside main injection and normal-chat messages. Actual host/read intervention is asserted. An A-only world prompt establishes retained vault content in both interleave cases, excluding a missing-vault/default fallback. Digests and synthetic values stay in private diagnostic records; no production secret-derived hash is persisted by this checkpoint. Individual argument-to-argument interleaving and endpoint/credential epoch combinations are not measured by this vault/argument comparator and remain separate qualification conditions.

## Final validation

- Frozen maintained scripts: settings runner SHA-256 `fb925b04ab7e1d7439699914849c01d078836aa2c956b5b6291c09267167d9ce`; preload `8108648d58170a5ceb6a68cd46433329eb4a25365e796452900e745f2410fcfa`. Final eleven scenarios pass with unchanged hashes throughout the run. Maintained runner assertions check the final vault/argument model, enabled agents, overrides, templates and restored deadlines; a prior separate one-time readback is not substituted for these assertions.
- Node25.9.0 / Playwright1.63.0 / Chromium1228, unchanged generated experimental.28 application. Every final browser scenario has page errors0 as observed by the installed `pageerror` listener and registered service workers0. This does not establish visibility of every private/caught plugin error. The original script remains64022bytes / SHA-256 `b1aa573048ea31ec036e21fd9df9f1a35d136435e247f15c3cdaa6026cd8e132`.
- Actual observed transport aborts in the strengthened final matrix occur408.062ms after the held agent request and399.513ms after the held overall-analysis request. These are fixture observations, not a production latency promise or proof of provider cancellation/refunded charges.
- Repository `npm test`:331 pass /0 fail /0 skip. Installer build succeeds; its tracked bytes remain unchanged at7,130,387bytes / SHA-256 `e63043636fab72b35abcca93eff0af4d45a5598c261b747b7d008b4dec7fdb47`. Frontend/BG application source and generated application are unchanged, so their previous gates are reused rather than relabelled as new runs.
- Structural/runtime review is scoped to the new probes, their actual host/API/strict-save/final-caller dependencies and the evidence claims. Remaining activation/device/provider/aggregate conditions are retained.
- Read-only Opus planning identified the separate live-settings lifetime; direct source/measurement confirmed it. Final review prompted A-only vault provenance, exact analysis-note contents in each final main, maintained durable-settings assertions, actual host/read assertions, source-fixture precondition and narrower observation wording. The strengthened final matrix passes; no application freeze or original rewrite was introduced.

## Probe corrections and limits

Failed diagnostic runs remain excluded from passes. Corrections include the fixture's custom main endpoint, Playwright's service-worker block injection into opaque plugin frames, the native `model` role, RPC interception before actual handler dispatch, and a hold released prematurely by a10s analysis limit. Normal analysis holds now use60s/120s and assert no unintended abort; deliberate deadline rows retain0.4s. A module import initially created only a worktree `logs.db`; it was preserved in ignored diagnostic records, and imports now follow the isolated runtime `chdir`.

Application bootstrap may request update/hub resources; those requests are refused and recorded separately from model calls. Passing this fixture does not establish a clean external-service bootstrap or production frequency of the controlled interleave. Large payloads, browser PDF Worker parity, long host deadlines, plugin identity changes, all real configurations/providers and physical iPhone are separate conditions. This checkpoint does not close all M0–M6, M7/G1.5b activation or the G1 aggregate gate.
