# Personal CSS editor and imported fonts — candidate validation

Date: 2026-09-24 KST

Current behavior amendment (`experimental.5`): individual CSS enable/disable
switches now save directly without trial confirmation. The historical trial
expectation for those switches below no longer applies. CSS text/order edits
and explicit recovery exit retain their trials. See the
[current follow-up](POCKETRISU-FONT-SAVE-SWITCH-VALIDATION.md).

## Scope and status

Candidate: `0.2.3-experimental.1`, Personal settings `0.5.0`, exact PocketRisu
1.10.0. The implementation follows
[the approved plan](POCKETRISU-PERSONAL-CSS-TOGGLE-EDITOR-PLAN.md).
Physical iPhone L3 is pending; this document does not promote the candidate to
a stable release. The live-delivery closeout is recorded separately below.

The working baseline was `8671312` / stable `v0.2.2`. The isolated source came
from the official `v1.10.0` archive, SHA-256
`3bf1a512b745e036ab2b0c72ba194efd72d1364ca60f89a36c535836167743d2`.
The all-or-nothing graph lifecycle in `PATCHER-V2-DESIGN.md` is the active
composition gate. The retired raw-mask command is not claimed as executed.

## Resulting behavior

- Ten shipped definitions use stable IDs, revisions, typed enable leaves,
  editable name/description/CSS overrides, and reset to current defaults.
  Eight extracted stylesheet blocks match the stable fixture exactly; the
  text-send and jailbreak effects use stable CSS-controlled DOM hooks.
- Custom definitions use stable IDs and stored array order. Drafts remain
  separate from both runtime and database. Every effective style-set/order
  change uses a complete candidate snapshot of root tokens and independent
  style nodes. Metadata-only edits do not require a visual trial.
- Trial rollback is scheduled before reconciliation. Confirmation transfers
  authority into a saving phase before expiry can fire. A closed global gate,
  page hide, or teardown prevents a late acknowledgement from restoring
  suppressed styles. Styles remain immediately before the native `#customcss`,
  which PocketRisu creates in `body` and can recreate.
- `?safe-css=1` is processed before Personal synchronization. Verified session
  storage permits query consumption; denied storage leaves the query intact.
  Recovery repairs remain disabled. Exit re-reads and trials the complete
  stored snapshot, preparing an available selected custom font so its loaded
  activation token is included. Cancellation releases only the trial's faces.
- Font imports accept a direct HTTPS binary or a local file. They validate
  bounded bytes, binary signature, SHA-256, and actual `FontFace.load()` before
  confirmation. Asset save and bounded read-back precede the database reference.
  Source URLs are not stored. Adding a font does not select it.
- Font selection/replacement preserves the prior active face until load and
  durable acknowledgement. Preview teardown cannot remove another runtime's
  active font. Missing/corrupt assets fall back without rewriting metadata.
  Removal changes references only; selected removal/reset also changes the
  selected font to the app font in one current-root mutation.

## Persistence and preservation boundaries

The editor's standalone writer is registered by `saveDb`; it does not rely on
the optional BG durable-save API. It waits for any existing save before the
target mutation, enlists root changes, calls the qualified persistence path
with an explicit strict option, awaits the authenticated flush, and verifies
the target again before reporting success. Strict patch rejection cannot fall
through to a full write or a rebase. A permitted non-patch full write requires
an existing ETag. Ordinary autosave retains its existing behavior.

A definite rejection invokes a target compare-and-swap undo while preserving
newer siblings. Ambiguous transport or flush outcomes keep the draft and an
unresolved state; they are not described as durable success or rollback. No
editor writer calls `setDatabase`, `setDatabaseLite`, or a plugin-array writer.

The passive client/server scanners walk the complete Personal namespace and
retain references from malformed/future data. Exact string replacement handles
restore remapping without rewriting CSS/name substrings. The native settings
backup retains the namespace, uses the same server reference authority, and
the native full backup includes asset bytes. Native restore preserves asset
names; the exported client remapper is separately fixture-tested, rather than
presented as the native restore caller.

## Automated observations

The durable receipts under `validation/personal-css-editor-2026-09-24/` record
the browser and native-server observations. The candidate has also been tested
through the repository's frontend/server suites, Svelte diagnostics, help-key
audit, production build, and BG bundle load check. Exact final counts and
artifact identities are recorded in the delivery closeout.

After a connection reset removed the initial temporary workspace, the final
source was rebuilt and retested in a persistent validation workspace. The
repeated run observed 51/51 patcher test files, 159 frontend files / 1,817
tests, 23 server files / 233 passes and 12 skips, Svelte diagnostics 0/0, and
a 7,954-module production build. Five owner graphs passed both compatibility
UI rollback/reapplication and exact source byte/mode revert. The complete graph
contains 42 packs, 979 units, 361 managed paths, and 13 ordered collisions.
The repeated native browser run additionally verified selected-font preview
cancellation and recovery-exit font tokens against the real SQLite APIs.

The final focus refinement passed 78 focused tests, Svelte diagnostics 0/0,
the production build, all five owner graphs, and the 51-file patcher suite.
A built-app browser check verified return to the CSS edit and font-add buttons,
read-only draft fields during trial, and preservation of both the draft and
the selected font after cancellation. It observed no page errors.

`scripts/verify-personal-css.cjs` runs five focused/complete owner graphs against
a separate pristine target. Each graph applies transactionally, reports current
state, re-plans without changes, runs embedded Personal tests, exercises the
compatibility UI rollback and reapplication, and verifies every managed path's
original bytes/mode after empty selection. Its receipt is generated from the
observed graph rather than a hardcoded success count.

Browser validation used Playwright 1.63.0 / Chromium 153 and actual Svelte
components. The lightweight harness mocked storage; a separate built-app run
used a synthetic existing database and the real Node/SQLite server APIs.
That run observed acknowledged `/api/patch`, `/api/write`, and `/api/db/flush`
responses, CSS and selected-font reload, settings/full backup inclusion with
font digest equality, zero deletion of the referenced font during isolated
orphan purge, and successful settings restore followed by runtime font load.
No provider generation or live user-data mutation was used for those tests.

The first empty synthetic root contained only `characters` and encountered
the existing save path's repeated hash mismatch before editor persistence.
The real-server proof therefore used a synthetic existing root containing the
normal root arrays. Fresh-empty installation initialization is not a claim of
this receipt, and that unrelated initialization path was not changed.

The sandbox initially refused server-test loopback sockets (`EPERM`). Those
tests were rerun with the normal approved socket-capable execution path.
The frontend suite emitted three loopback connection-refused diagnostics but
completed its assertions successfully; those diagnostics are not omitted from
the local execution log.

## Measured candidate limits

| Field | Warning | Hard limit |
| --- | ---: | ---: |
| Custom CSS items | 50 | 100 |
| CSS bytes per item | 50,000 | 100,000 |
| Total stored CSS bytes, enabled and disabled | 500,000 | 1,000,000 |
| CSS name / description UTF-8 bytes | UI byte counter | 256 / 2,048 |
| Custom fonts | 8 | 16 |
| Font file bytes | 12,000,000 | 24,000,000 |
| Unique referenced font bytes | 32,000,000 | 64,000,000 |
| Font name / original filename UTF-8 bytes | bounded input | 256 / 512 |

The trial interval is 15 seconds. These are candidate parameters pending
physical-device admission, not claims about arbitrary CSS complexity or browser
font-parser memory. Warning levels provide headroom below the hard bounds.

The 36-row desktop matrix covered 10/100/500 nodes, 100KB/1MB/5MB payloads, and
none/one/half/all enabled distributions. The raw runtime matrix intentionally
included points outside the admitted storage bounds. With at most 100 nodes
and 1MB, observed maxima were 7ms for the synthetic JSON/TextEncoder step,
4.8ms for reconciliation/layout, and 5.3ms for reordered reconciliation/layout.
The 500-node run reached 175.4ms for reorder/layout. Each synthetic item used
one simple rule plus padding; this does not measure arbitrary selector cost.

A 10,414,588-byte CJK TrueType face completed digest and verify/load steps in
13.5ms and 49.2ms in the first desktop run. The later HTTPS matrix loaded real
WOFF2, WOFF, TrueType, and OpenType fixtures, plus a valid CJK file padded to
23,000,000 bytes. Padding exercises acquisition/integrity size, not greater
native glyph complexity. CORS rejection, streaming overflow, and omitted
credential/referrer headers were also observed. Sampled process RSS and JS
heap include the harness/fixture transport and prior measurements; neither is
an isolated native font peak or a physical iPhone measurement.

The original raw timing harness logs were in the temporary workspace lost at
reconnection. Their previously observed aggregates are explicitly identified
as historical in `earlier-desktop-measurements.json`; they are not presented as
a newly repeated measurement of the final candidate. The owner-graph and real
browser/SQLite receipts were regenerated after reconnection.

## Runtime audit

### Discovery: reachable effects, without severity ranking

1. Nested schema reads, raw-value export/reset, typed enable leaves, IDs/order.
2. Draft copies, same-target conflict detection, application fingerprints.
3. Independent style parsing, node reuse/order, native custom-CSS recreation.
4. Recovery query/session/history access and full-snapshot exit.
5. Preparation, trial, timer, save, page-hide, gate-close, and teardown races.
6. Root persistence serialization, patch refusal, ETag, flush, and failure undo.
7. Local/URL byte acquisition, cancellation, buffering, signature and digest.
8. FontFace preparation, ownership, activation, replacement and stale reads.
9. Asset-first/reference-second ordering and orphaned bytes on root failure.
10. Client cleanup, server report/backup/purge, restore string replacement.
11. Shared-host ordering, earlier-target preservation, reapply and rollback.
12. Mobile controls, local search, original setting anchors, status/focus paths.

### External anchors and adversarial checks

| Break scenario | Resolution / boundary |
| --- | --- |
| A removed masking rule exposes a harmful earlier rule | Full candidate tokens/nodes/order are trialed, not only changed text. Runtime and browser cancel/reorder tests cover reconciliation. |
| A trial becomes stale or a target is edited in place | Frozen target bases and exact structural snapshot comparison reject the write. No digest collision assumption is used. |
| Expiry, hidden page, gate close/reopen or teardown races acknowledgement | Saving owns the candidate; interruption remains latched. Recovery exit cannot clear its sentinel after interruption. Tests exercise late completion and disposal. |
| Storage access fails during recovery | Initial query retention, guarded read-back and exit restoration keep the available recovery mechanism; in-memory suppression remains active. |
| The server refuses a patch or loses acknowledgement | Strict no-fallback/ETag boundaries and explicit definite/ambiguous outcomes are tested at the composed owner and real HTTP boundary. |
| A file is renamed, truncated, corrupt, oversized or loaded after cancellation | Signature, actual byte count, digest and FontFace validation precede activation. Streaming buffers do not retain unbounded tiny-chunk arrays. |
| Preview teardown removes an active or built-in face | Each runtime deletes only its owned objects and clears root properties only for its active face. Separate-owner and delayed-read tests cover this boundary. |
| Root save fails after an asset write | No reference is committed before asset read-back; no compensating physical asset deletion is issued. A possible orphan is retained. |
| A malformed/future registry loses a font during cleanup or backup | Shared expected-reference fixtures cover both scanners; native settings/full backup and isolated purge/restore verify the final caller path. |
| A full replacement erases a hook or a rollback discards future data | Standalone, startup, lazy, BG/lazy and complete graphs run independently. Compatibility rollback retains passive hooks and older-reader preservation is executed. |

### Triage and remaining surfaces

The automated candidate does not replace the physical iPhone gate. Remaining
device-specific surfaces are installed-PWA recovery entry, finger/focus behavior,
large-list/font responsiveness and memory, and actual send/resend/stop/jailbreak
interactions. The user confirmed that Safari and the installed PWA currently
show the same chats/settings; this establishes the starting recovery route,
not a completed cold-boot recovery test.

Remote CSS resources and arbitrary expensive/global selectors remain authored
presentation data. Exact local text does not certify later remote content or
responsiveness. The documented recovery path is therefore retained. The final
cross-piece review specifically joined CSS gate/saving state, custom font
ownership, recovery-exit preparation, persistence acknowledgement and passive
asset retention, rather than treating the module tests as independent proof.

## Recovery and physical iPhone L3

Open **Personal settings → CSS appearance** (`개인 설정 → CSS 꾸미기`).
Use the exact copyable recovery address in **화면이 가려졌을 때 복구**. Close the
installed app, open that address in Safari, repair and disable the offending
rule, confirm the complete exit trial, then reopen the installed app. Do not
clear site data. If session storage is denied, leave the recovery query in the
address until the guarded exit succeeds.

The full 18-step device gate is in plan §15.5. It includes shipped edit/cancel/
save/reload/reset; custom add/enable/disable/delete/reorder; masked harmful rules
and automatic rollback; cold recovery/reload/repair/exit; Safe Mode and master
gates; ordinary send/resend/stop and jailbreak value/focus; admitted scale;
local and direct-URL font preview/import/selection/reload; CORS failure;
selected replacement/removal; and referenced-font backup/restore preservation.
Results must be recorded by feature, not inferred from the desktop viewport.

## Rollback boundary

CSS/font data and asset bytes are additive and are not deleted by a UI rollback.
Older readers treat `custom:<id>` as the app font but preserve that stored value
on unrelated leaf writes. The retained-compatibility path is:

```text
node scripts/rollback-personal-css-ui.cjs plan POCKETRISU_ROOT
```

After the normal active-work check and stopped-server boundary, its `apply`
command restores the earlier Personal UI while retaining the client reference,
server reference, and exact restore-remap units. Rebuild/restart and verify the
result before use. Normal candidate apply can restore the full editor later.
Both directions are exercised by the owner-graph verifier.

Do not use the generic empty-selection/full-revert path on data containing
imported font references. Removing passive compatibility requires a separate
explicit validated migration or a proved zero-reference state. Fresh-source
byte/mode revert tests contain no user data and do not grant that authorization.

## Live delivery closeout

Implementation and initial artifacts were committed as `be7907a` and
`98b7d67`; the final focus refinement and rebuilt installers are `1f378ae`
and `22c01bb`. Main CI run `35979737880` passed at `22c01bb`, including exact
1.10 apply, embedded checks/builds, and full source byte/mode restoration.

Both final installer files are 8,105,504 bytes, mode 0755, SHA-256
`94d9e9ba07c3692ccb74218d5b8c9c84427766e9c509c58dfd335acf8069ecc9`.
Repeated generation and remote CI both verified installer parity.

Before deployment, the read-only preflight observed zero native/BG active
work, zero pending sends, and one already completed BG result awaiting
delivery. Its status endpoint reported `result-ready`, retention planned no
removal, and all non-Personal pack identities were unchanged. The server was
stopped before application, built from the live source, pruned to production
dependencies, and restarted. The pending result's core remained identical;
it was neither cancelled nor consumed by deployment.

Final readback observed PM2 online with zero restarts/unstable restarts,
root HTTP 200, matching served/local build stamp and main JS, five SQLite
`quick_check=ok` results, and successful BG load using production dependencies.
The main asset is `index-Bwk-Ntfs.js`, 2,098,975 bytes, SHA-256
`3659a438a9df6474a2083526c3de67e917159817aa2fc433b97d741bd4f25174`.
HTML is parsed and receives native runtime flags at the server route; raw
HTML byte identity is therefore not asserted. Patcher status is `current`
with 42 packs/361 managed paths and zero changes in the next plan. Structured
readback is in `validation/personal-css-editor-2026-09-24/live-delivery.json`.

The plan authorizes an experimental candidate after automated gates. Stable
promotion remains blocked on the physical iPhone scenarios above.
