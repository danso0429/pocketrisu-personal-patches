# G1.8 minimum notification foundation

Candidate: `0.2.4-experimental.19`, adapter `0.7.26`, based on `c50e996`. Implementation and automatic qualification are complete; final review and delivery are recorded below when observed. This is the minimum foundation before the server plugin host, not completion of all G1.8 producers.

## User result and scope

A newly unsupported server-input operation retains its original text and manual recovery control. If the app is closed, its notification is stored separately and can be shown when the user returns to the home screen or another chat. The current loaded database supplies the character/chat label; a removed target uses a generic previous-chat label. The persistent in-chat banner remains independently available.

The existing upper toast placement, 3.5-second display and eight-visible-toast rules remain unchanged. Direct Sonner delivery avoids the ordinary `notify*` helper's side effect of clearing unrelated wait/progress dialogs. An entry is also written through the existing log helper, accessible in Settings → System Logs. Delivery ACK means enqueued to a visible UI, not that the user read it.

Only `input_host_unsupported` has a live producer in this unit. Permission-missing, unsupported plugin API, hook failure and provider failure have a typed internal publication contract for G1.6; no plugin is loaded or advertised as supported. Existing final model-failure dialogs, prompt-change notices, server-restart policy, streaming and r3 remain separate. No public endpoint publishes arbitrary notifications.

## Durable ownership and delivery contract

- The primary blocked input write includes `terminal.notificationVersion: 1`. It commits before notification dispatch. Failure to publish cannot remove the original reason, original text or retry permission.
- Dispatch inserts the notice and sets `notificationSettled` on the source record in a separate synchronous transaction on the same SQLite connection. Failure rolls back that dispatch only. The existing startup/10-minute sweep retries unsettled intents before and independently of result retention and canonical hydration. Corrupt input storage still fails closed. Already user-resolved inputs are not newly published.
- Only new version-marked stops are eligible. Old failures are not backfilled. The source timestamp determines expiry, so retries do not extend it. A durable settled marker prevents a pruned event from being recreated by subsequent source retries, including after a backward clock adjustment.
- The namespace is `internal/bg-notifications/v1/`. IDs derive from operation plus stable event key. Repeating the same payload is idempotent; conflicting payloads return a domain result and never overwrite the existing event. Future plugin keys must distinguish durable request role, attempt and hook invocation; a volatile counter is not a replay identity.
- Logical expiry is 48 hours, matching existing BG result retention. Expired notification rows are lazily removed on publication/claim. The store retains at most 1,024 unexpired rows including ACK tombstones and never evicts an unread, unexpired row to make room. Capacity/storage failures leave the source intent retryable; expiry remains an explicit delivery limit.
- The v1 TTL and field set are fixed independently of future changes to BG retention. New persisted fields require a versioned namespace/reader strategy; this reader normalizes v1 fields when rewriting rows. Malformed notification rows are retained and skipped during listing, but still count toward capacity. Actual storage I/O failure aborts the transaction. One fixed-code corruption warning is emitted per owner/process, not per row.
- Authenticated, build-fenced claim/ACK routes lease at most eight notices to a page-local consumer UUID for 30 seconds. Exact consumer/token checks prevent stale ACKs from acknowledging a replacement lease. ACK tombstones survive owner recreation until original expiry. Result ACK and notification ACK are different operations.
- Leases are clamped by event expiry. An expired but unreclaimed token can acknowledge a notice already enqueued; a replaced token cannot. The browser lease/visibility check is immediately before rendering, not a promise that ACK transport finishes before lease expiry.
- The browser checks visibility immediately before rendering and rejects responses beyond a conservative monotonic request-start deadline. Only one pump runs at a time. A bounded local receipt ledger and stable toast IDs suppress ordinary retries, including an ACK response loss. Hidden pages do not start requests, and teardown aborts in-flight work and removes timers/listeners.
- There is no exactly-once human-observation guarantee. A crash between enqueue and receipt recording or a lease handoff can repeat a notice; enqueue followed by immediate app closure can go unread. Failed local storage weakens cross-reload deduplication but preserves same-page and server-ACK behavior.

Payloads contain fixed codes, bounded identities/API names and, for future plugin notices, bounded plugin metadata. Arbitrary prompt text, raw input, provider error bodies and credentials are not copied into the outbox. Hook output rejection is distinct from external effects already performed; the notification protocol never claims those effects were rolled back. Provider failure is a different kind from a skipped hook or missing permission. Actual stream/after-hook execution ordering belongs to G1.6.

## Executed evidence

- Baseline input owner: 51 passed. Focused notification/input owner: 60 passed. Focused client delivery: 6 passed.
- Full frontend: 2,116 passed / 4 skipped. Full server: 482 passed / 12 skipped. Compatibility: 74 passed / 5 skipped. Patcher: 51 passed.
- After final consultation, corruption isolation, fixed v1 TTL, expiry-clamped leases and UUID compatibility passed focused server 62/client 6, types 0/0, rebuilt frontend/BG artifacts and another exact round trip. The full-suite counts above precede that bounded delta; they are not represented as full reruns of it.
- Svelte check: zero errors and warnings. Frontend and BG builds/load and help-key checks passed.
- Actual SQLite tests cover duplicate/conflicting events, lease exclusion/reclaim/stale ACK, partial-batch transaction rollback, expiry, capacity without unread eviction and distinct plugin invocation keys.
- Actual input-owner tests inject publication failure and source-receipt failure. The stop remains retryable; an event whose receipt write fails is rolled back; independent retry later publishes once without canonical-state access. Old stops and already-resolved input intents are not backfilled.
- Generated application in Chromium: close the first context before input processing, let the real unsupported-input path publish, restart the server, log into a fresh context on home, display one notice without opening the chat, drop the first ACK request, then observe two ACK attempts but one notification log. Another fresh context does not redisplay it. One durable notification remains; synthetic provider calls and page exceptions are zero. Outbound fetches are denied by the harness and observed separately from the synthetic model endpoint.
- HTTP checks in that browser harness observe 401 without authentication and 426 for a stale writer build. No real provider or live user save directory is used.
- A final browser run removes native `crypto.randomUUID` before application load. The existing UUID 9.0.1 library's `getRandomValues` path delivers the same home/restart/lost-ACK result without a page exception, preserving ordinary HTTP environments. The nine blocked non-model fetches were update checks, public statistics and Realm catalogue traffic, inspected separately from the synthetic model endpoint.
- An actual experimental.18 input owner reads the new record, preserves manual retry, runs recovery and retires a resolved record to v5 while retaining the added metadata and leaving the notification namespace untouched. This is an isolated cross-version fixture, not a live rollback.
- Exact apply/re-plan/revert: 42 packs, 1,298 units, seven resolved collisions, zero additional changes, and all 1,022 original files equal by bytes and mode. Final installer: 6,015,595 bytes; SHA-256 `3c0e86caf0a7dec6b808f10ce28ee428455fff32259036185c2ecd1a721be37e`.

Reproduction: `scripts/probe-bg-notifications.mjs <generated-target> <playwright-root> <chromium> <synthetic-fixture>`. Use the synthetic input-dialog fixture exported by the native-input probe. The preload holds the existing input transform until the page closes, then forwards to the original methods. It never substitutes the input-stop or notification implementation.

## Runtime audit

### Phase 1 — discovery

Input stop; settings-context release; source intent/receipt; notification row validation; deduplication/collision; SQLite rollback; expiry/cap; authenticated claim/ACK and build fencing; lease expiry/reclaim; visibility and teardown; local storage failure; toast/log side effects; target removal; startup/retry scheduling; old/reverted reader; backup/restore; future plugin writer boundaries.

### Phase 2 — anchors

The strongest primary-state counterexample is publication failing after input effects have already stopped. The original blocked write is outside the dispatch transaction; throwing publisher and third-write receipt-failure tests preserve retry permission and original text. The latter test leaves neither a half-dispatched notification nor a false source receipt. Retry does not call input transformation or model execution.

Competing consumers are tested through one real SQLite owner and a recreated owner. Claim/ACK batches have no awaits inside transactions; injected second-write failures roll back earlier batch mutations. A reclaimed token rejects an old ACK. The client validates the entire batch before rendering, checks visibility and lease age again, and does not acknowledge renderer failure. Stable local receipts prevent the injected lost-ACK scenario from displaying/logging twice.

The generated retry call precedes the retention try block and does not await canonical hydration. Dynamic factory wiring was cross-checked in the manifest and generated server because symbol references alone omit generated string hooks. The real browser exercises that wiring. No new timer is added on the server; the existing sweep is reused. Browser polling has one in-flight request and stops rescheduling while hidden; response arrival while hidden is independently tested.

Direct `toast.warning` updates only the toast state in installed Sonner 1.1.0; it does not invoke `clearTransitionalAlert`. Defaults are inherited from the current Toaster. Existing System Logs fetches `/api/logs`; absence of an import of the client log helper is not evidence that a viewer is absent. The initial consultation's viewer suspicion was refuted by that caller and withdrawn.

Older record parsers preserve additional terminal fields, and the real old-owner fixture exercises projection/recovery/retirement. Code revert does not delete notification or input records. New schema is additive inside existing KV storage; no chat schema migration or production backfill is performed.

### Phase 3 — limits and remaining work

This closes the measured minimum native-input notification path, not every BG failure. Future plugin writers must provide durable invocation identities and handle publication-domain failures without replaying effects. The global store is for the existing single-instance shared database, not a new multi-tenant permission model. Forty-eight-hour expiry and enqueue-not-read ACK semantics remain explicit limits. Broken storage can defer or prevent notifications; the original in-chat recovery surface remains.

Physical iPhone notification placement, app suspension/return and dismiss behavior remain part of aggregate qualification. The browser process tests do not establish iOS scheduling or human observation. Existing G1.4 transport/publication-marker limits and deferred r3 are unchanged.

An already-published stop can still be delivered as a historical notice after the user resolved it; only unresolved intents are newly dispatched. A malformed transport batch is rejected as a whole. Persistent renderer failure retries without ACK; earlier enqueued items in that batch rely on their seen receipts. Corruption between claim and ACK rejects that ACK batch, while the next claim skips the damaged row and can settle healthy notices. A store filled by retained invalid rows can still exhaust capacity. Investigate the private namespace read-only and preserve suspect bytes/backup before any explicitly authorized data repair; this feature does not delete or rewrite corrupt records automatically.

## Consultation and delivery

Plan consultation changed notification failure isolation: dispatch failure cannot downgrade the primary input stop. It also moved validation to home-screen return, added a durable source dispatch receipt and made retry independent of canonical/result-retention failures. The existing toast duration was retained; a suggested new duration was not adopted because it would change the established UI rule.

Final consultation identified whole-store blockage by one malformed notification and coupling to another module's TTL. Corruption is now isolated without deletion, and the v1 TTL is fixed. The follow-up review found no additional correctness defect in that delta and retained the explicit normalization/ACK-corruption/observability limits above. The agent independently found and corrected the native-UUID secure-context dependency. Review did not substitute the executed tests.

Final consultation, live readback and source commits will be recorded after completion. Preserve the previous verified full backup and create a new application/state plus targeted notification-namespace backup for the additive deployment. Do not delete old backups or data on code revert. Stable release remains gated on device/aggregate verification.
