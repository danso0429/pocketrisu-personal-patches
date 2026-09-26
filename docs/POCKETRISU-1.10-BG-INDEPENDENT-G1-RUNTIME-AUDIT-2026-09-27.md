# PocketRisu 1.10 BG-independent G1 runtime audit

Date: 2026-09-27 KST

Status: automatic-source audit candidate; browser/device and live gates open.
This is not G1 qualification or a release receipt. Audit order follows the repository runtime
audit v2: flat discovery, external anchors, then triage.

## Phase 1 — flat discovery

The current candidate changes these observable paths. This list intentionally
has no severity or frequency labels.

1. A client-owned `sendChat` records a browser generation statistic by a stable
   invocation ID; the Node BG bundle retains its existing server-owned counter
   path.
2. Legacy client-owned BG result delivery records a positive statistic suffix
   by result ID where one is available; older no-ID delivery keeps its previous
   scalar path.
3. The ordinary root save rebase carries distinct browser effect IDs across a
   409 and does not add an effect whose ID is already on the server.
4. The server root writer validates submitted browser effect IDs/counts and
   preserves already accepted IDs together with BG commit receipts.
5. A validator-free full root write is refused after an accepted BG or browser
   effect; genuinely absent database creation remains a separate path.
6. Browser effect IDs age out of the root record after the recovery window;
   the cutoff rejects an expired identity and a row budget can block new work.
7. The composer stores a draft identity across tab switches and reloads; an
   older draft obtains a deterministic migration identity from its contents.
8. A newly edited draft gets a new identity, including programmatic composer
   and attachment changes; a second tab submitting the same stored draft uses
   the same input-command identity.
9. The server rejects duplicate input-command identities before allocating an
   N+1 successor, including when the second tab has a stale chat revision.
10. A duplicate-start response preserves the visible draft and avoids a
    60-second ambiguous-start wait.
11. A completed or invalid server-commit identity is fenced before another
    paid run; the client resolves committed-start ambiguity through exact
    status rather than client fallback.
12. Terminal input records retain admission/sequence identity but redact raw
    text, raw-text hash, input journal and effect intent after result/state
    release and the recovery horizon.
13. Queued/attached/blocked successors delay predecessor input retirement;
    a write failure leaves the original record in its transaction.
14. Commit recovery payloads can become compact exact receipts after the
    input reference or legacy recovery horizon and a successful publication
    recovery check.
15. Commit receipt write failure, malformed tombstones, deleted chats, and
    normal database replacement have separate outcomes.
16. The periodic result-retention sweep triggers input then commit retirement;
    its asynchronous failure path keeps durable records for retry.
17. Root commit/statistic ledgers and compact input/commit identity records
    remain durable after payload retirement; their total count can grow.
18. Root and input ownership touches normal chat edits, deletion, reroll,
    branching, full backup/restore, session fencing, old clients and plugin
    callers even when those paths do not directly mutate the new fields.
19. The client adopts a server-committed normal chat through revision and
    projection fences; empty-local, stale-local, and multi-tab return paths
    depend on the actual browser lifecycle.
20. The server's model/provider run and normal chat commit can continue after
    the request child exits; a browser process exit is a distinct boundary.
21. The patcher composes the changed hooks with the complete exact-1.10 graph;
    installer generation, apply, reapply and revert are separate effects.
22. G1 is AC-independent: these paths do not install, edit, start or simulate
    Archive Center and do not prove official AC compatibility.
23. A blocked, unattached input can be retried explicitly from the normal
    chat UI with its exact stored text and command identity; the old record and
    new admission change together, while two retry clicks cannot create two
    paid successors. Another tab's stale marker is cleared only after an exact
    server status reports the replacement operation.
24. Input-v1 capability is enabled in this isolated candidate; classic
    browser-local proxy, custom and plugin model IDs and preset-regime or
    module-bound requests stay on the previous client-prepared path.
25. The candidate carries the newer live personal-settings appearance editor
    pack. Its strict root-only save can defer full-buffer encoding, so its
    order and patch payload interact with G1's browser-effect proof.

## Phase 2 — external anchors and remaining links

Source paths below are relative to this private patcher checkout. The code
lines refer to the current candidate and must be refreshed if those files
change. Test counts refer to disposable exact-1.10 application, not live use.

| Phase 1 leaf | Anchor observed in this pass | Boundary still to resolve |
| --- | --- | --- |
| 1 | `bgBrowserMessageEffects.ts:55`, composed `process/index.svelte.ts` hook in `manifest.cjs:386`; server bundle build/load found `sendChat` callable. | Actual browser invocation/recursive-send timing. |
| 2 | `manifest.cjs:678` legacy result hook; focused legacy/statistic cases were included in the previously observed frontend suite. | Final legacy caller's same-result/different-revision schedule in a real browser. |
| 3 | `bgBrowserMessageEffects.ts:83`; process HTTP patch/conditional-full/lost-response cases in `bgServerChatProcessBoundary.test.ts` retained count 12 from base 10. | Browser save scheduling and a genuinely lost network response. |
| 4 | `serverChatExecutionProjection.cjs:242`; owner validation and spawned normal root API cases accepted each distinct ID once and kept BG receipts. | Version-skewed root writers that do not send the new identity. |
| 5 | `manifest.cjs` `server-chat-owned-root-full-write` hook and H1 validator-free creation/stale-write cases. | Actual older client bundle behavior after HTTP 428. |
| 6 | `serverChatExecutionProjection.cjs:12-14,297-313` fixes 14-day age, one-day future skew and 8,192 retained rows; unit cases prove cutoff and expiry rejection. | Actual daily operation volume and incorrect device clocks are not measurable from this isolated fixture. |
| 7 | `bgDraftIdentity.ts:1-19` and `chatDraft.ts` hooks; draft round-trip and legacy migration tests passed. | Cross-device draft write ordering in actual browsers. |
| 8 | `manifest.cjs` composer identity state/load/save hooks and two-tab pure schedule; same stored draft keeps one ID and a changed draft gets another. | Actual Svelte event scheduling on iPhone and simultaneous tabs. |
| 9 | `serverChatInputOwner.cjs:674-735` dedupes under one SQLite transaction; H1 shared-draft process case returned one 409 and one provider call. | Cross-device scheduling beyond the synthetic two-client process. |
| 10 | `bgServerInputStart.ts` pre-admission reason classification and `bgServerInputClient.ts:65-99`; duplicate-marker tests retained the draft and avoided ambiguous polling. | Toast visibility on device. |
| 11 | `serverChatCommitOwner.cjs:569-601,789-858`, start gate in `manifest.cjs`, and legacy client ambiguity hook; H1 rejected a second paid start, while input-client exact-status test accepted the prior result. | Actual old browser bundle response handling and network loss. |
| 12 | `serverChatInputOwner.cjs:1310` rewrites terminal v4 to checksum-verified v5 only after result/state absence and 49 hours; SQLite test removed raw text/hash. | Existing long-lived private databases have not been subjected to a real 49-hour sweep. |
| 13 | `serverChatInputOwner.cjs:433,1310` checks execution references and one transaction; failure injection left v4 intact, queued successor retained predecessor. | Large historical record scans and corrupt-record repair policy. |
| 14 | `serverChatCommitOwner.cjs:789-858` recovers publication before atomic compact receipt write/full-row delete; v0 and paired input-v1 tests passed. | Edited/deleted historical chats can keep full recovery indefinitely by design. |
| 15 | Commit-owner receipt write failure rolled back; a deleted chat was not republished; database replacement clears both recovery prefixes (`serverChatCommitOwner.cjs` `discardRecovery`). | External backup/restore UI and arbitrary manual KV corruption. |
| 16 | Generated `bgOrchestrator.cjs` result sweep invokes input then commit retirement; owner tests exercise each side independently. | The ten-minute timer and its catch/retry under production load. |
| 17 | Root applied ledgers and v5/receipt tombstones intentionally retain IDs so an arbitrarily late retry cannot be mistaken for new work. | Long-run row/byte growth and operational capacity; no safe finite deletion horizon has been established. |
| 18 | H1 normal chat HTTP edit, delete and separate-branch cases preserved user changes while N resolved. | Actual reroll UI, dormant internal-backup caller, and dynamic plugin paths. |
| 19 | `serverCommittedChatAdoption.test.ts` exercised full, changed, replaced and placeholder local slots without a client save; projection/receipt tests exercised exact ownership. | A fresh real browser profile and stale multi-tab return. |
| 20 | Spawned `server.cjs`/SQLite H1 exited the initiating request child and read normal chat before client recovery, with one provider and one commit. | Closing an actual browser process is a distinct unmeasured event. |
| 21 | Exact-1.10 complete graph with the newer live settings pack applied 42 packs/1,117 units with 13 declared collisions, re-plan changed 0, and revert left tracked diff 0; patcher tests passed 55/55. | Re-run after final source changes; live apply remains separate. |
| 22 | This candidate changes patcher-owned PocketRisu files only; commit owner sets AC disposition disabled. | Official AC compatibility belongs to G2, not an inferred G1 result. |
| 23 | `serverChatInputOwner.cjs:674,1225` resolves one blocked record with its replacement in a transaction; H1 restart/retry and duplicate-retry cases passed. Svelte mount test required an explicit button, hid it when `retryAllowed` was false, and observed no two-second timer for blocked-only state. `manifest.cjs` chat-open reconciliation clears another tab's marker only after exact `input-retried` status. | Real-device click, focus, toast and marker cleanup after a second tab retries. |
| 24 | `bgServerInputProviderPolicy.ts:10` pure cases covered classic cloud vs custom/proxy/plugin/preset/module modes; input-v1 is advertised only in the isolated candidate. | Dynamic script-selected provider URLs and actual custom/local endpoint parity. |
| 25 | Live state readback found `personal-settings` 0.5.10; the previous G1 installer carried 0.4.3. The current candidate ports that exact pack plus narrow G1 ordering edges and labels it 0.5.11. Its strict-save test passed a browser effect to patch-sync without full-buffer encoding; the exact 1.10 graph composed 42 packs/1,117 units, re-plan 0 and revert tracked diff 0. | Full combined frontend/server suite and actual appearance-editor UI after G1 delivery. |

The safety chains above use read code plus failure-injection tests where
available. A successful unit path does not prove a timer fires, a browser
survives iOS lifecycle events, or a local endpoint is reachable from Node.
These are residual surfaces rather than implicit pass claims.

## Phase 3 — current triage

- **Q1:** No directly reproduced canonical-chat overwrite, duplicate paid run,
  or partial root-effect write remains in the synthetic/process cases above.
  This statement is limited to those cases, not an assertion about live use.
- **Q2:** G1 release remains gated on actual browser process exit, normal-chat
  API readback before reopen, fresh-profile adoption, iPhone return and
  version-skew behavior. The capability-1 code is not live-applied.
- **Q3 fixed in this pass:** lost independent browser statistic effect;
  validator-free stale root write; two-tab same-draft double admission;
  terminal input/commit payload growth; post-retirement paid replay; an old
  client fallback on completed-start 409; blocked-edit input deadlock; and
  blocked-only mobile polling; and an otherwise unsafe downgrade of the
  already-live personal-settings pack.
- **Q4 prepared surfaces:** compact receipt growth, effect-window volume and
  device-clock skew, dynamic plugin/provider URLs, old client bundle behavior,
  and dormant internal-backup entry points remain bounded by the support and
  review conditions below. None is upgraded to a measured pass.

### Prepared surfaces

| Item | Resolved through | Missing link / why not established here | Review signal and decision |
| --- | --- | --- | --- |
| Permanent identity receipts | Result/state payloads expire; terminal input raw text/hash and full commit recovery compact after the joined horizon while exact IDs remain durable. | This fixture has no long-run production frequency; deleting IDs on an arbitrary finite timer can permit an old same-ID paid retry. | Measure actual receipt rows/bytes without reading content after a safe live interval. If growth is material, design server-issued expiry proof and old-client fence before deleting IDs; otherwise retain correctness proof. |
| Browser effect window | 14-day timestamp window, one-day future skew and 8,192-row cap are enforced by server and client. | Isolated tests cannot establish the user's send rate or device clock accuracy. | Observe a cap rejection or clock offset; then adjust a measured supported horizon without allowing a pruned ID to replay. |
| Custom/preset/plugin model dispatch | Classic custom/proxy/plugin IDs and preset/module regimes bypass new input-v1 preparation, keeping the prior client-prepared path. | Dynamic script-selected models and whether a browser-local endpoint is reachable by Node depend on runtime settings not present in synthetic H1. | If such a request enters input-v1, it is a support defect; qualify its final URL/caller or extend the conservative gate. Do not claim server completion merely from a configured profile. |
| Old client and internal backup | Root writer returns 428 for unversioned full writes after an effect; exact-tag database creation still succeeds. Static source has no direct caller of `loadInternalBackup`. | An actually cached old bundle and a dynamic invocation of that exported helper were not run. | Version-skew test must show a clear failed save and safe reload, not silent local success; if internal backup is reachable, give it a distinct explicit restore owner rather than bypassing the effect fence. |
| iPhone lifecycle | Spawned request-child exit/SQLite/normal API and Svelte mount tests cover different boundaries. | This environment has no real browser process or iPhone observation channel and no authority to infer iOS suspension behavior from Node. | After safe delivery, close the PWA after accepted Send; before reopening, read the normal chat API, then reopen and verify one answer, variables/statistics once, and no extra model call. |

## Cross-piece interaction check

- Browser count ID and C1 count receipt converge to 12 from base 10 in either
  save order; a lost response reuses its accepted ID instead of adding again.
- A shared draft's client ID is checked by the server transaction; a manually
  retried blocked draft reuses that ID, and a second retry cannot become N+2.
- Input v5 retains its exact `inputReceiptId` before full commit recovery is
  exchanged for a receipt tombstone. A mismatch or corrupt input retains the
  full commit record.
- An expired result/state is not a permission to regenerate: both full and
  compact commit identities are checked before provider work; legacy clients
  reconcile the 409 through exact status instead of client fallback.
- Edited/deleted attached input wins its normal chat revision conflict. A
  separate new chat branch survives the original chat's N commit.
- An AC source, backend, schema or runtime is not used by any of these G1
  qualification tests. G2 and G3 remain separate.
- The newer personal-settings strict save passes the current database root
  (including browser effect IDs) to patch-sync. Its refusal path does not
  silently full-write or rebase a rejected appearance-only save, while the
  ordinary root save retains G1's effect-aware rebase.

## Automatic validation receipt and delivery boundary

The combined candidate is applied only to a disposable official PocketRisu
1.10.0 tree (`98e968339d1b3f91b9dac85bb3f2ebb5f90f9d14`). Latest live
managed-file readback checked all 370 paths against the installed state hash
and mode with zero mismatches. Live selected pack versions differ from the
candidate only for `lazy-chat-bg-adapter` (0.2.1 → 0.7.12), `lazy-chat-sync`
(0.3.2 → 0.5.1), and `personal-settings` (0.5.10 → 0.5.11). This is version
comparison and drift checking, not live application.

- Patcher: 55/55 tests; two generated installer filenames are byte-identical,
  8,865,094 bytes, SHA-256
  `ec52d48209982c9509c5dee4e21b6ef28f98d8c32f2591fbd65d0e38aa3cdd2b`;
  two consecutive builds matched.
- Complete graph: 42 effective packs, 1,117 units, 13 declared collisions;
  initial apply changed 415 paths including patcher state/intent, re-plan
  changed 0, exact revert left the official target's tracked diff empty.
- Target type check: zero errors and zero warnings. Whole server suite:
  350 passed, 12 skipped. Whole frontend suite: 1,910 passed, 2 skipped.
  Production client build passed with 8,005 modules transformed. Rebuilt BG
  bundle loaded `sendChat` as a function.
- Focused cross-owner evidence: spawned HTTP edit/delete/branch and blocked
  retry; SQLite transaction and failure-injection owners; shared-draft client
  schedule; Svelte retry control; strict appearance root-only patch payload.

No live PocketRisu, PM2, user database, paid provider, AC runtime, tag or
release was changed by these tests. G1 remains open until the actual browser
process-exit/read-before-reopen/return and iPhone gates are observed, the
supported model combination is recorded, and safe live delivery is verified.
