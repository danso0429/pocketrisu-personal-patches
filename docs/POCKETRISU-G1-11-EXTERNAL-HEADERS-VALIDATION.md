# G1.11 external request header rules

Date: 2026-09-27 KST
Status: implemented, automatically verified, pushed and live-applied with no configured rules. Current-provider and physical UI checks remain open. This does not implement the G1.6 server plugin host or complete G1.

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

No live rule is enabled automatically. No MARP or AC script is changed. Current-provider requests using stored credentials were rejected by automatic approval review pending explicit authorization; no rejected request was executed. Synthetic HTTPS results are not a substitute for the actual provider or MARP's three-analysis integration.

Physical UI check: open Personal settings → External requests, add a disabled rule with the intended HTTPS destination and header name, save, navigate away/back, then verify values persisted. Enable only the intended rule and verify provider behavior; pre-existing headers must remain intact. A separate paid MARP analysis requires user authorization. The full server-plugin-host route is deferred to G1.6.

Rollback should disable/remove rules through this settings UI before reverting application source. Do not remove user databases or plugin data. Existing server-stored configuration/secret is retained by source revert and can be reused after reapplication.
