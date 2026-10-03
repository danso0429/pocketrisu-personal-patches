# G1.5a native admission and explicit client input recovery

Candidate: `0.2.4-experimental.17`, adapter `0.7.24`, implementation `8f6627b`. Implemented, pushed and delivered live on 2026-10-03 KST. Physical-device qualification is separate.

## Scope and user decisions

- Complete G1.5a native model selection, endpoint qualification and raw-input admission. G1.4 queue UI, G1.5b plugin host, G2 and r3 recovery/navigation redesign remain separate.
- On an unsupported server input operation, retain original text and the reason. Do not fabricate a dialog answer or automatically replay input effects.
- Explicit manual recovery performs input preparation in the app, then hands attachment and generation back to the server. The user selected this behavior after reviewing the alternative of editing settings/scripts before retrying.

## Implementation

The dispatcher and preflight share explicit-database model selection, fallback sentinel/index behavior and preset credential resolution. Preflight uses the adapter's endpoint resolver. Native preset adapters and qualified custom OpenAI/Anthropic/Gemini formats support HTTP and HTTPS, including local addresses. Dynamic browser-only providers and unsupported input host operations stop before attachment.

Local-address qualification preserves transport meaning: presets and classic OpenAI already request the explicit server local-network route. Classic custom Anthropic/Gemini local-network input retains client preparation because its existing direct/fallback transport can refer to a device-local service. This is an execution-location boundary, not an endpoint ban or a change to those existing requests.

Newly admitted combinations whose plugin participation or module MCP host behavior is unqualified retain their prior preparation path. This does not assert that every enabled plugin participates. Existing classic plugin execution limitations remain a G1.5b responsibility.

An input-scoped failure latch survives a script catching a host exception. Network rejection requires the exact operation's async context; unrelated server fetches continue. Cancellation takes priority. Known stops retain raw input in the existing input owner; persistence failure leaves an unknown, non-replayable transform.

Manual recovery uses a new explicitly marked client-prepared admission, a single-winner claim and the existing input attachment journal. Server drain waits for the app's attachment and then executes main without repeating input preparation. Browser preparation does not also publish/save the new user message. Claim tokens are checked at attachment, including after asynchronous staging. The current claim deadline reuses the existing 600-second operation budget; it is a failure boundary, not a minimum wait before normal execution. App-observed failures abandon the claim immediately while retaining the original.

Never-executed inputs blocked solely by the replaced predecessor are excluded from that replacement's predecessor search. Their original text and blocked state remain visible. This avoids a replacement depending on its own blocked descendants, without silently running those descendants.

## Validation evidence

- Generated bundle: 192 preset/custom/Lua request combinations passed with synthetic provider responses. Checks include selected endpoint, credentials, stream choice, response variables and one appended input. This includes actual request dispatcher and adapters, not live-provider qualification.
- Actual server fetch shim: 24 Vertex combinations and 18 loopback HTTP combinations passed. OAuth uses ephemeral synthetic signing keys and a synthetic token response; no real provider credentials or paid requests.
- Custom similarity input: document/query embedding requests and ranked output passed through the server shim.
- Unsupported Lua dialog/image calls, including swallowed failures followed by another LLM effect: typed stop, provider calls zero and appended input zero.
- Full frontend: 2,106 passed/4 skipped. Full server: 467 passed/12 skipped. Compatibility: 74 passed/5 skipped. Patcher: 51 passed. Type checks: zero errors and warnings. Later focused policy/publication checks: 56 passed; input-owner/context checks: 63 passed; pending UI/finished-result checks: 39 passed. No valid assertion was removed to close these checks.
- Frontend build, BG bundle build/load and help-key validation passed. Exact-1.10 composition/re-plan/revert compared all 1,022 original files by bytes and mode with zero mismatch and zero additional planned changes. The final delivery receipt records the exact installer hash.
- Real Chromium 149.0.7827.0, built application, fresh SQLite store and generated server bundle: unsupported server input → app dialog → server attachment → page closed before provider response → saved answer. Each run observed one provider call, one user input and one answer; the model received both the input text and the dialog-derived variable. No JavaScript page exception occurred.
- Browser saves were observed before attachment and deliberately delayed until after attachment. Both orderings retained the new input and variable without another model call. A separate UI run renamed the chat and immediately sent; the renamed chat and full recovery sequence were preserved.
- The browser probe denies external requests and substitutes only the exact installed Wasmoon binary plus a synthetic provider. Expected denied resources, pre-login authentication and projection revision negotiation were recorded separately from JavaScript page errors. These are not live-provider or iPhone tests.
- Opus review led to fixes for fetch isolation, MCP preservation, cancellation priority, stop-write handling, replacement-chain normalization, metadata-view consistency and post-attachment notices. The closeout review and the final local-origin/message delta review found no additional blocking defect in their reviewed scope. Code review did not substitute for the runtime checks.

Final installer: 5,881,410 bytes, SHA-256 `a267fa3b8b5a059b38e257da7ac64c713185ea695ddb8bb47e353b4d02ed3238`. Final graph: 42 packs, 1,256 units, 7 resolved collisions. Exact re-plan/revert evidence matches this installer.

## Important implementation boundaries

The real browser exercise exposed a pre-existing identity mismatch: semantic view fingerprints were compared and stored as if they were storage SHA-256 revisions. Admission, marker validation and adoption now keep the two identities separate. The base endpoint and claim share the metadata overlay helper and preserve typed values through the existing codec.

Input failure state is async-local. A regression test failed before the change because a delayed descendant continued after a known input stop; it now retains that stop. This does not claim synchronous-script preemption or automatic joining of arbitrary unawaited work.

Input marker v1 entries migrate to v2. Native command/claim records retain the existing storage owner; client preparation adds an explicit fingerprinted mode and claim metadata. A code-only rollback to an older owner is not a data rollback and must not discard newly created records. Retain the delivery backup and use a compatible owner or a forward fix for outstanding client-preparation records.

## Reproduction

`scripts/probe-bg-native-input.mjs` accepts a built target and synthetic route options; `--export-browser-fixture=<file>` emits the synthetic database used by the browser probe.

`scripts/probe-bg-client-recovery.mjs <target> <playwright-dependency-root> <chromium> <fixture>` runs the actual built application in a newly created temporary database directory. Optional modes are `save-before-attach`, `save-after-attach`, and `rename-before-send`. Playwright is a verification dependency, not an installed application dependency.

## Delivery and device boundary

Delivery checked zero active requests/model jobs/pending sends and zero input records without cancelling work. The stopped application/state/five-database archive is 3,139,655,733 bytes; all 1,614 regular files were verified by hash, size and mode. Existing backups were retained. Database bytes remained unchanged during source application and builds.

After apply/build/restart, all 447 managed files matched their expected hashes/modes and all 17 discovered script assets matched served/local bytes. Root HTTP returned 200, all five databases passed `quick_check`, external header settings were byte-identical, and PM2 was online with zero unstable restarts. Active/pending/input work remained zero and operation-state count was 117 before and after. Two new error-log lines were the existing retained-journal warning and recovery-stall category; no unclassified line was introduced.

No stable tag/release was created. No real-provider generation, user-record deletion or generation cancellation was performed for delivery. The implementation and delivery records are on the candidate branch; stable publication remains subject to the existing device/aggregate gates.

Device scenarios for the aggregate BG gate: send with a qualified native preset, return after leaving the app, and verify exactly one input/answer; for a chat with an input dialog, use the explicit recovery button, answer in the app, wait for server generation, then leave and return. The original text must remain available on interruption. Existing plugin combinations retain their preparation boundary until G1.5b.
