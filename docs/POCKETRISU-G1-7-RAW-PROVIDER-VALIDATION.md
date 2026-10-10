# G1.7 raw selected-provider admission qualification

2026-10-10 KST. Baseline `f735cef` / experimental.30. Candidate `0.2.4-experimental.31`, BG adapter `0.7.38`, Personal settings `0.5.14`. Production host remains OFF. This closes the demonstrated raw-provider preparation/context gap within the synthetic scope below; it does not complete M7/G1.5b activation, all G1.7 callers, actual providers or device/aggregate qualification.

## Problem and resulting behavior

The prepared route already dispatched a registered provider, but raw selected-plugin input stopped before host initialization: the provider policy unconditionally rejected `pluginmodel:::` regardless of host eligibility. Actual baseline HTTP had host/session/provider/main0 and retained input `blocked_edit`/`not_run` with `latest_settings_require_client`.

The shared policy now admits plugin provider candidates only when the actual server host is eligible. HostOFF/omission and no enabled plugin remain refused. Main/sub/auxiliary/static-fallback/module selection uses one generator shared by policy and required-name enumeration; a plugin route that exists only in an auxiliary/fallback still receives plugin-version/MCP checks. Unsupported adapters, endpoint rules, custom/hf/WebLLM and browser-local route protections are retained.

After host initialization and before raw input transformation, every statically selected provider must have a healthy installed owner in the actual registry. Missing, conflicted or failed registration stops through the existing unsupported-input owner, preserving raw text, `completed`/`blocked_edit`, a mandatory notice and `effectsMayHaveOccurred=true`. Host initialization may already have had effects; these are not rolled back or automatically replayed. OFF preclaim rejection remains `not_run` and starts no host.

Provider names registered by multiple entries, including a later entry that registered then failed during load, are unavailable. Raw input stops before provider/input effects; prepared/dynamic dispatch refuses before that provider callback/effect. Healthy independent providers remain available. This deliberately refuses ambiguity instead of native browser overwrite-last or the previous server first-owner continuation. No script/name hash allowlist or provider name inference is introduced.

Dynamic input calls admit only registered pluginmodel names. Unsupported/missing dynamic models use the existing async-local input failure latch even if the guest catches the error. Refusals of conflicted or failed names that remain registered are catchable provider errors, including dynamically named non-selected providers. Registered providers that fail after the precheck retain native catchable provider-error behavior: Lua may handle the error, input may attach, and a later selected-provider main failure remains failure. Native retry ordering is preserved; plugin-model failures return after their native retry limit rather than silently selecting a default model.

## Actual generated-server evidence

The maintained context probe uses authenticated HTTP, the generated server, canonical root writer, SQLite, normal-chat API and commit journal, isolated synthetic credentials/providers and the byte-original MARP Lite0.9.2. All agents are OFF in selected-provider controls; original source is unchanged. Provider transport counts below use the existing `analysis` observation channel but belong to `fixture-provider`, not MARP analysis. Native/default main calls are separately asserted0.

| Raw scenario | Provider calls / saved answers | Observed result |
| --- | --- | --- |
| Healthy selected provider | 1 / 1 | One user input and answer stored in the normal chat/journal; no notice. |
| Actual input `runLLM` trigger then main | 2 / 1 | The input variable and final answer both contain the selected provider output; one stored user input. |
| Provider catches nested unsupported model, then attempts fetch | 0 / 0 | Native input latch survives both catches; blocked input text retained, no partial user message, notice1. |
| Missing registration | 0 / 0 | Stops after load but before input transformation; notice1. |
| Host OFF | 0 / 0 | No host/session initialization, `not_run` blocked input, notice0. |
| Duplicate plugin names owning selected provider | 0 / 0 | Provider never initializes; ambiguity plus unsupported-input notices2. |
| Selected provider invalidated during its held call | 1 / 0 | Prior request remains observed; later dispatch/default success refused, notice1. |
| Different plugins register the same provider name | 0 / 0 | Ambiguous selected name refused before raw effects; notices2. |
| Registration followed by load failure | 0 / 0 | Known ambiguous name refused even without installation; notices2. |
| Provider selected only by first static fallback | 1 / 1 | Native nonempty-first-fallback semantics preserved; no unused primary request. |
| Missing fallback-only provider | 0 / 0 | Required-name check stops before input, notice1. |
| Valid provider failure then native retry | 2 / 1 | Same provider retries successfully, failure notice1, no default-model request. |

All twelve pass. Existing raw MARP script invalidation/value-copy/cache-eviction/nonselected-provider and prepared selected-invalid/duplicate controls also pass with their prior answer/effect contracts. Prepared seeded input is not interactive browser recovery evidence.

The session retained-stream test uses the actual input transformer and RPC session: consume a returned stream after its input scope has failed, observe the same parent failure, deny the fixture API effect, drain scopes0 and allow an independent next call. RPC normalizes the guest error to `plugin_execution_failed`; the parent retains `BG_INPUT_HOST_UNSUPPORTED`. This is session/ALS evidence. The actual HTTP nested-input test supplies the native dispatcher/fetch-latch evidence without a returned stream; a combined final Lua streaming consumer remains a separate G1.9 condition.

## Verification and limits

- Policy/actual selector59 across2 files; generated input context16; actual OS host94; session9; raw12 and preserved native/prepared6 pass.
- Full server516/12 existing skips/42 files; client2303/4 existing skips/193 files; compatibility74/5 existing skips/11 files; patcher52 file entries pass. Types0 errors/0 warnings, frontend8022 modules and BG build/load `sendChat=function` pass. Existing test warnings are not converted to new passes or skips.
- Complete graph42 packs/1528 units/7 collisions; re-plan0; exact1022 baseline-file byte/mode revert pass. Installer7,155,256 bytes, mode0755, SHA-256 `7fe91ec2338466f935880d8c08b63e9e3a970435b8aa2d3c540256803896a48b`.
- No assertions/caps/skips were weakened. The old collision-success test now checks the deliberate failure contract, effects0, notices and cleanup. Prototype failures from absent isolated ownership metadata, incomplete fallback fixture and RPC error normalization are retained separately.
- Exact native relative `/api/logs` and pending-cleanup calls remain refused without a Node origin; the observer separates them from external IO and does not fake persistence. Unknown external calls remain denied and asserted0. No paid/production provider request occurred.

Planning consultation added the pre-input registration check and required-route tracking. Mid consultation found the registered-then-load-failed ambiguity; it was corrected and tested. Async-local propagation and native fallback claims were checked directly rather than assumed from advice. Source consultation does not execute or replace these tests.

Remaining boundaries: an entry rejected before it registers exposes no provider name; do not infer which successful provider it might have overwritten natively. Missing selected names already fail closed; installed-combination qualification must compare registrations and failed-entry notices before activation. Wider auxiliary caller roles, oversized handle reuse, combined Lua-stream consumption, actual providers, G1.8/G1.9 remainder and G1.10 physical/aggregate remain open. The next planned work is the remaining caller/handle qualification, then final M7/G1.5b admission/activation. Official unchanged Archive Center G2 follows G1 completion.

## Final consultation and delivery

Final source consultation found no scoped hostOFF-delivery blocker and prompted the catchable-provider wording above. The consultant read current maintained source and validation, the runtime audit's triage/surface sections and structural-audit headings; it did not execute tests, verify hashes/counts or inspect the cited generated caller lines. Codex's measurements remain the evidence.

With hostOFF, newly recognized plugin candidates may perform the existing capability lookup once while tab support is unknown, then remain on client preparation; cached OFF support avoids a per-send host check. This is a client classification change, not production raw-provider activation. The actual synthetic OFF preclaim chooses `latest_settings_require_client`, retaining blocked/not_run input and no host/session/provider.

Safe hostOFF delivery is pending. No stable tag/release or production activation is included in this checkpoint. Live readback and rollback retention will be recorded only after execution.
