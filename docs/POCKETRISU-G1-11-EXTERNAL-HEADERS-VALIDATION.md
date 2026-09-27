# G1.11 external request header rules

Date: 2026-09-27 KST
Status: implemented, automatically verified, pushed and live-applied. The user confirmed that the settings screen opens and explicitly authorized persistent activation and a deployed-proxy probe. One MARP destination rule is now enabled and read back through the settings API. Actual MARP analysis and the G1.6 server plugin host remain unqualified; G1 is not complete.

## User behavior and ownership

Personal settings → External requests provides server-shared destination rules. New rules are disabled. A rule has an ID/name, enabled state, HTTPS destination with path prefix, header name and the conversation-session value kind. Saving is explicit. A stale device save returns a conflict while retaining the draft; reload is explicit. No provider credential or generated header value is returned by this settings API.

Personal settings `0.5.12` owns configuration/UI, validation, transport and ordinary proxy hooks. Lazy chat BG adapter `0.7.14` connects the final composed BG proxy shim and conversation context. Patcher version is `0.2.4-experimental.7`.

Matching requires exact normalized origin (including nondefault port) and path-segment prefix. Authentication/cookie/transport/internal headers are forbidden. Existing same-name headers are preserved case-insensitively. The HMAC derives from a persistent server secret, rule ID and server conversation identity; requests without conversation context use a rule-specific fallback identity. No per-chat ID cache is stored.

One shared owner handles `/proxy2` GET and write methods, native HTTPS proxy/WebSocket jobs and the server bundle's `/proxy2` replacement. Existing local/private-only WebSocket destination restrictions are preserved. The future plugin host can call the same transport in G1.6; that caller is not present yet.

With no matching enabled rule, fetch receives the original init unchanged. With injected headers, redirects are followed manually with destination rematching, removal of injected headers outside scope, cross-origin credential stripping, standard POST/303 method conversion, abort propagation and a 20-hop limit. Caller-provided headers retain existing behavior. Browser-direct requests do not pass through these rules; the settings page states this limitation.

## Validation

| Check | Result |
| --- | --- |
| Patcher | 51/51 |
| Server | 387 passed, 12 existing skips |
| Frontend | 1,920 passed, two existing skips |
| Compatibility | 74 passed, five existing skips |
| Svelte diagnostics | Zero errors and warnings |
| Build | 8,007 modules; BG bundle load exposes sendChat |
| Full graph | 42 packs, 1,142 units, seven collisions, zero-change replan |
| Exact revert | 1,021 baseline files, zero byte/mode mismatches |
| Installer | 5,386,388 bytes, 0755, SHA-256 `27a91e27f00a011530cbeaaf9a77475fedf04b46a0c5719dece5b51f98d0e81d` |

New coverage includes absent/disabled rules, origin/port/path negatives, forbidden headers, same-name preservation, concurrent conversation isolation, stable restart values, CAS/storage failures, privacy, redirect stripping/body behavior, the composed BG shim, and an actual child server with a local HTTPS upstream and authenticated WebSocket client. The child process uses a generated test CA, not disabled TLS verification. The settings writer is covered by the client-build fence.

Node 25.9.0 documentation informed async context and redirect behavior. Svelte 5.55.3 was verified with official Svelte 5 documentation and the installed compiler. No dependency/version configuration changed. Existing build warnings remain.

## Delivery and open checks

Implementation commit `cf4eaea` was pushed to the existing candidate branch. Live preflight found 416 managed files with no drift, zero active requests/pending sends/input records, and 47 operation-state rows. Five SQLite backups passed quick_check; an application/state/intent archive was retained. A fresh idle check preceded stop/apply/build/restart. Only the planned nine source/test/state paths changed.

Live root returned HTTP 200. `/assets/index-BOS-ch8t.js` was 2,167,443 bytes and matched the local SHA-256 `915cf74a0dc1941cdab0dcef4198591a8a7274410809aedb3265a944f10ef4a6`. All 420 managed files matched hash/mode, replan had zero changes, and all five databases passed quick_check. PM2 was online with zero unstable restarts, active requests and pending sends; the operation-state count remained 47. Error-log growth was the existing retained-journal warning (six records, 2,974 bytes). No journal cleanup was performed.

A read-only check found zero external-header settings rows after deployment. The new unauthenticated settings GET returned PocketRisu's expected 400. No rule or HMAC secret was automatically created, and no destination was enabled. Physical settings interaction remains unobserved; no stable tag or release was created.

No live rule is enabled automatically. No MARP or AC script is changed. The initial current-provider request was rejected by automatic approval review; it was not executed or bypassed. The user subsequently authorized feature usage and the pending probe. A first attempt stopped locally because the saved provider label was OpenCode rather than the probe's expected OpenAI label. Installed MARP source confirmed the chat/completions route, and the probe was corrected to recognize that saved OpenAI-compatible configuration.

Exactly two requests then used the stored default provider configuration, a deliberately nonexistent model and an empty messages array through an isolated instance of the production header owner. OFF returned HTTP 400 with MissingSessionID; ON returned HTTP 400 without that session error. Neither returned a successful generation response. The remaining ON error was not classified as model-not-found by the probe, so no claim about its exact cause or billing is made. Credentials, destination, header values and response bodies were not recorded.

The user also confirmed that the settings page opens but had not configured it. Automatic approval review separately rejected persistent activation plus a deployed-proxy probe as insufficiently specifically authorized. The action was not executed or retried by another route at that point. The user then explicitly approved both actions, and the same prepared operation ran through normal local login/settings APIs.

The prior settings response was retained in a restricted local recovery file. Settings revision advanced from zero to one, with one enabled rule named MARP analysis session, using the saved MARP base URL and `x-opencode-session`. The settings GET readback matched the submitted rules, and an independent read-only database check confirmed one enabled rule. No MARP script, provider credential/model, chat or unrelated rule was changed; no build or restart was needed.

One further nonexistent-model/empty-message request through the actual deployed `/proxy2` returned HTTP 400 without MissingSessionID. The remaining response was not classified by the probe as model rejection or empty-message rejection, so its precise cause remains unverified. This closes the authorization/configuration step and establishes removal of the observed missing-session error, not successful paid analysis or MARP's three-analysis integration.

Usage: Personal settings → External requests now reads the configured rule from the server. Leave it enabled for the stored MARP destination. To pause it, uncheck Enabled and save to the server; no API key or generated session ID belongs in this form. The user observed page entry; direct physical form editing and save interactions remain unobserved. The full server-plugin-host route and actual MARP analysis are deferred to their integration step.

Rollback should disable/remove rules through this settings UI before reverting application source. Do not remove user databases or plugin data. Existing server-stored configuration/secret is retained by source revert and can be reused after reapplication.
