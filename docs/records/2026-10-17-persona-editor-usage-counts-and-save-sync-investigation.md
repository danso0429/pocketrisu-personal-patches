# 2026-10-17 — Persona editor, usage counts and save-sync investigation

Scope: this record covers only the work done in one working session on
2026-10-17 (KST). It lists what was changed, delivered, measured, rejected and
left open, in order. Times are UTC unless stated.

## 1. Summary

| Item | Result |
|---|---|
| Persona editor layout, Korean labels, create/import inside folders | Committed `5dbef89`, pushed, delivered to the live installation |
| Persona gallery fixed card size, add-persona dialog labels | Committed `9de0274`, pushed, delivered |
| Usage cost panel compact counts with K/M suffixes | Committed `4f61ac5`, pushed, delivered |
| Content-etag reference document (alternative "D-1") | Committed `900fbb6`, pushed |
| New-save persistence failure | Root cause found; a first fix based on a wrong premise was reverted; the restructuring ("C") was committed `2bda466`, pushed, delivered and device-checked (`0.2.4-experimental.60`, lazy-chat-sync 0.5.9) |
| Post-assembly edit warning on a new chat | Cause not determined from data; field-name diagnostic committed `fb0251b`, pushed, delivered (`.61`, lazy-chat-bg-adapter 0.7.61) |
| Patcher baseline restructuring design document | Committed with the C implementation |
| Device check (L5) | Reported normal by the user for all delivered changes; see sections 3.5 and 6.2.7 |

Package versions: `0.2.4-experimental.57` (`5dbef89`), `.58` (`9de0274`),
`.59` (`4f61ac5`). Stable remains `v0.2.3`.

## 2. Request

1. Persona settings: the "Persona images" area should sit at the top of the
   persona box, with name, note and description below it; when the
   PocketRisu UI width shrinks, these fields shrink with it.
2. Translate the English labels added in the persona images area to Korean.
3. Inside a persona folder, keep the round "+" (create/import) button that
   exists at the root; a persona created or imported from inside a folder
   must be stored in that folder.
4. Plan first; no Codex orchestration (Codex quota exhausted); Claude
   subagents and Argon allowed.

Later requests in the same session: a fixed gallery card size, translation of
the add-persona dialog, K/M suffixes on usage cache counts, investigation of
two errors seen during validation, a fix for the new-save failure, and this
record.

## 3. Persona editor (`persona-organizer`)

### 3.1 Cause of the narrow fields

`patches/persona-organizer/files-1.10/src/lib/Setting/Pages/PersonaSettings.svelte`
laid out `.persona-editor-panel` as a two-column grid
(`minmax(13rem, 18rem) minmax(0, 1fr)`) and collapsed it to one column only
under `@media (max-width: 720px)`, a viewport query. Narrowing the PocketRisu
UI on a wide screen kept two columns, and the fixed gallery column squeezed
the description field.

### 3.2 Decisions taken with the user

| Question | Decision |
|---|---|
| Layout | Plain vertical stack (gallery above fields, page scroll); no sticky gallery or separate field scroller |
| Translation scope | Gallery and the export-image dialog |
| Folder toolbar had two "+" buttons after the change | Change the existing member-selection "+" to an icon |
| Duplicate from inside a folder | Store the copy in the open folder |

### 3.3 Change `5dbef89` (persona-organizer 0.11.2, `.57`)

- `.persona-editor-panel` is always one column (`minmax(0, 1fr)`); the 720px
  media query was removed.
- The round create/import button became a snippet `addPersonaButton` rendered
  in both the root toolbar and the folder toolbar.
- The folder member-selection button shows `UsersIcon` instead of "+".
- `duplicatePersona()` sets `folderId: activeFolderId ?? clone.folderId`.
  Create and import already passed `activeFolderId`.
- Korean labels: 페르소나 이미지, description sentence, 이미지 추가 / 추가 중...,
  첫 페르소나 이미지 추가, 사용 중, 이 페르소나에서 제거, image aria labels;
  export dialog: 엑스포트 이미지 선택, description, default-image notice,
  선택됨, 취소, 엑스포트 중..., 기본 이미지로 엑스포트, 선택한 이미지로 엑스포트.
- Tests: `test/persona-ui.test.cjs` updated (Korean strings, layout rule,
  folder toolbar button, duplicate folder) and a new untranslated-label check.
  `test/g22a-capability.test.cjs` pinned the package version exactly to
  `.56`; it was relaxed to "experimental number ≥ 56" so version bumps do not
  break it.

Checks: patcher `npm test` 343 tests, 340 pass, 3 skipped, 0 fail. On an
isolated copy of the installed application with the new installer applied:
`svelte-check --threshold error` 0 errors, production build 8,031 modules.

Browser validation (isolated server, headless Chromium):

| Case | Gallery bottom / fields top (px) | Textarea / panel inner width (px) |
|---|---|---|
| 1400×900 | 495.7 / 511.7 | 599.2 / 601.2 |
| 390×844 | 491.7 / 507.7 | 322 / 324 |
| 1400 wide, ancestor limited to 420px | 486.2 / 502.2 | 384 / 386 |

No horizontal overflow. Korean labels present; folder "+" opens the
create/import/duplicate dialog; create and duplicate inside a folder stored
the persona in that folder; duplicating an unfiled persona at the root kept it
at the root.

### 3.4 Change `9de0274` (persona-organizer 0.11.3, `.58`)

User report: gallery cards grew and shrank while resizing. Cause:
`.persona-image-grid` used `repeat(auto-fill, minmax(4.4rem, 1fr))`; with the
full-width gallery the flexible columns resized the cards. Changed to
`repeat(auto-fill, 5rem)`. The add-persona dialog title and its close button
became 페르소나 추가 and 닫기. Tests updated. `npm test` 343/340 pass/3
skipped; `svelte-check` 0 errors.

### 3.5 Device check (L5) status

Reported by the user before `9de0274`: the gallery size change while
resizing (fixed in `9de0274`), the untranslated "Add persona" title (fixed in
`9de0274`), and the BG plugin diagnostics screen opening normally. The
diagnostics entry shown was dated 2026-10-15, before this delivery, so the new
absent-API record of `.56` was not yet observed. The later device check of
`9de0274`, `4f61ac5` and folder create/duplicate/import persistence is in
section 6.2.7.

## 4. Usage compact counts (`usage-cost-estimate`)

Request: show cache counts as `000k` instead of Korean `만` units.
`patches/usage-cost-estimate/files-1.10/src/lib/Setting/Pages/UsageCostPanel.svelte`
used `new Intl.NumberFormat(undefined, { notation: 'compact' })`, which follows
the browser locale. Change `4f61ac5` (usage-cost-estimate 0.1.3, `.59`) fixes
the locale to `en-US` (`123.5K`, `1.2M`). The same formatter serves request
counts, so they also use K/M. Tooltips keep full locale-grouped numbers.
A patcher test asserts the formatter and two sample outputs. Checks: `npm test`
344/341 pass/3 skipped; the pack's panel vitest 9/9; `svelte-check` 0 errors.

## 5. Delivery to the live installation

The user approved delivering `main` including the earlier
`0.2.4-experimental.56` change (plugin capability exposure, G2.2a), which had
been pushed earlier but never applied to the live installation. Delivery is
all-or-nothing, so it could not be separated.

Procedure used for both deliveries: push → wait for the `patch-integrity` CI
run to succeed → read-only idle check (no running model job, no pending send
in the model-jobs database) → copy application source, `dist/` and patcher
state into a dated directory under the application's `backups/` → PM2 stop →
copy the five SQLite databases (with WAL/SHM) while stopped → installer
`apply` → `plan` reports 0 changes → `pnpm build` → copy back previously served
hashed assets that the new build no longer contains (no overwrite) → rebuild
`server/node/bgOrchBundle.mjs` and check `sendChat=function` → PM2 start →
readback.

| Delivery | Window (UTC) | Content | Readback |
|---|---|---|---|
| 1 | 10:15:29–10:17:40 | `.56` + `5dbef89` | root 200, PM2 online, unstable 0, served entry hash matched disk, 5 DB `quick_check` ok, status current 43 packs (persona-organizer 0.11.2, lazy-chat-bg-adapter 0.7.60), 347 old assets retained, only the existing ChatJournal backlog warning in the error log |
| 2 | 11:03:08–11:04:25 | `9de0274`, `4f61ac5` | same checks ok; persona-organizer 0.11.3, usage-cost-estimate 0.1.3; 380 old assets retained |

Before delivery 1 a user generation was running; the delivery waited for it
without cancelling. Thirteen same-name `.map` files differed between old and
new builds; the new versions were kept. Backups:
`backups/20261017-pre-persona-exp57` and `backups/20261017-pre-exp59`.

## 6. Two errors observed during validation

### 6.1 Narrow panel after an in-page resize

Resizing one page from 1400 to 390px left the settings container at 161px and
the persona panel at 129px; a fresh load at 390px was normal. The live code
before this session and the candidate gave identical numbers, so this is
pre-existing PocketRisu layout behavior, not caused by these changes. No change
was made.

### 6.2 New-save persistence failure

Symptom on a fresh instance with a new save: every `POST /api/patch` returned
409 "Hash mismatch", the console showed "rebasing tracked changes" followed by
`browser statistic count is invalid` (`bgBrowserMessageEffects.ts:50`), and no
change persisted. The local JOURNAL already listed this as an open item from an
earlier isolated test.

Reproduction comparison (fresh save, rename persona, reload):

| Tree | Patch statuses | Statistic errors | Rename kept |
|---|---|---|---|
| Pristine PocketRisu 1.10.0 | 409 once, then full write 200 | 0 | yes |
| Live code before this session | 409 ×8 | 8 | no |
| Candidate with this session's changes | 409 ×8 | 8 | no |

#### 6.2.1 First fix attempt (shelved and reverted)

A code-reading trace attributed the loop to three lazy-chat-sync sites: the
server caching `{}` as a database on a 409, the client classifying every plain
409 as a rebase-able conflict, and the rebase merge requiring statistics.
Planned fix: the server marks a 409 against an empty copy with
`emptyDatabase: true`, the client then falls through to the full write. Argon
proposed scenarios, a Sonnet subagent wrote tests first, an Opus subagent
implemented it (lazy-chat-sync 0.5.9, `.60`). All unit and target suites
passed (server 656 pass, frontend 2,518 pass, patcher 341 pass).

The browser run still failed: eight 409s with `expected=0, server=7a5af0c2`.
The server copy was not empty (hash `11` would mean `{}`); the client sent hash
`0`. The trace had flagged `expected=0` as unexplained, and the plan had not
resolved that before building on the empty-server assumption. The uncommitted
change was saved as a patch file in temporary storage and the ten touched
files were reverted to `HEAD`; the new test file was removed. Nothing of it was
committed, pushed or delivered. The saved patch file was later lost when the
host rebooted and cleared temporary storage (section 7).

#### 6.2.2 Diagnosis by measurement

An isolated copy was built unminified with temporary logging in
`RisuSavePatcher.init()` and `hash()`:

- the baseline was initialized once with `{}`;
- `hash()` produced `NaN` with keys `["characters","modules"]` and
  `missingKeyBlocks: ["modules"]`.

Cause: `set()` in the pack (`files-1.10/src/ts/storage/risuSave.ts`, rollback
snapshot) built `modules: this.lastSyncedDb?.modules` when the baseline had no
modules, creating an `undefined`-valued key without a hash block; `hash()` added
`undefined`, giving `NaN`, sent as `"0"`. Introduced with the pack on
2026-07-26 (`906d4c6`) and carried into the 1.10 adapter (`1a9e6b3`); pristine
`set()` has no such snapshot.

Experiment in the isolated copy (one-line change to omit the key): the first
patch returned 200 and both test edits persisted, but a later patch again sent
`expected=0` (missing blocks `botPresets`, `modules`), then a rebase, a 500
`OPERATION_PATH_UNRESOLVABLE` and a full-write recovery. Second source: the
baseline assembly at the end of `set()` always creates `botPresets` and
`modules`, `undefined` when absent. This assembly is upstream code, also in
pristine 1.10.0 and upstream 1.14.0; pristine hides it because its first patch
meets an empty server and the full write re-initializes the baseline.

#### 6.2.3 Options considered

| Option | Description | Outcome |
|---|---|---|
| A | `hash()` ignores `undefined`-valued keys | Rejected by the user as not a root fix |
| B | Fix the two creating sites | Rejected by the user as not a root fix |
| C | Restructure the patcher so baseline and hash cache cannot diverge | Chosen |
| D-1 | Server-issued content etag for patches | Recorded as reference (`900fbb6`) |
| D-2 | Revision counter | Rejected: a writer that misses the increment allows a lost update |

The user asked whether upgrading PocketRisu would fix it. Upstream 1.14.0
`risuSave.ts` (1,503 lines) was compared with 1.10.0: `hash()` and the baseline
assembly are unchanged, and 1.14 adds more direct baseline/hash-cache writes
(module owner, character owner, personas). An upgrade does not fix it; C must be
extended during a 1.14 rebase.

#### 6.2.4 Independent verification of the plan's claims

At the user's request, ten claims (K1–K10) were checked by separate agents, one
by execution and one by code reading, instructed to refute them.

| Claim | Verdict |
|---|---|
| K1 `"0"` iff a key lacks a numeric block | Partly refuted: 20,000 random sequences (84,548 states) gave 9,656 `"0"` results, all with a missing block; but 2,504 states with a missing character block gave a wrong non-zero hash |
| K2 the two sites are the only sources | Refuted: characters without `chaId`, duplicate `chaId`s, `toSave.modules` on a baseline without modules, and a shared map for root keys and `chaId`s (deleting a character whose id equals a root key removes that root block) |
| K3 well-formed states hash equal on client and server | Confirmed with preconditions; 0 unexplained mismatches; equal on 500/2,000/5,000-character synthetic databases |
| K4 live saves unaffected | Not determinable from logs: 301 hash-mismatch lines over the retained logs, none with `expected=0` |
| K5 patcher is client-only | Refuted: it is bundled in `server/node/bgOrchBundle.mjs` together with `globalApi`; runtime use on the server not determined |
| K6 external readers of patcher internals | Partly refuted: `lastSyncedDb` read in `globalApi.svelte.ts` (three places), personal-settings strict save, and a personal-settings test fixture |
| K7 cause of the first-run write difference | Refuted as stated; pristine also writes an empty database at boot; the 7a5af0c2/11 difference is unexplained |
| K8 upstream hides source 2 via full write | Confirmed for 1.10.0; 1.14.0 first-save flow not verified |
| K9 the 500 is a by-product of the false 409 | Partly refuted: a baseline without `botPresets` plus `toSave.botPreset` emits `replace /botPresets`, which the server rejects, independent of the hash |
| K10 deep normalize per save is expensive | Confirmed, 2.4–4×: 2,000 characters, current `set()`+`hash()` 29.2 ms vs normalize+hash 87.4 ms |

A read-only measurement on a copy of the stopped-state database backup (copy
deleted afterwards; only counts kept) found no missing or duplicate `chaId`s,
`botPresets` and `modules` present, and client and server hashes equal
(`e5b4dd8`), including a simulated one-key save. The 301 live mismatches are
therefore most likely genuine concurrent writes (inference).

#### 6.2.5 Approved plan C

Design in `docs/POCKETRISU-SAVE-SYNC-BASELINE-RESTRUCTURE.md` (uncommitted at
the time of this record): one state object restored by rollback as a unit;
shallow single mutation points that never store `undefined`; a derived hash
memo; per-position character hashing; `add` instead of `replace` for absent
`botPresets`/`modules`; a read-only `lastSyncedDb` accessor; acceptance by fuzz
equivalence, patch-apply, differential and performance checks plus browser
runs; a section listing the 1.14 extension points. Risk: risky. Flow: Argon
scenarios → tests first by a Sonnet subagent → implementation by an Opus
subagent → review and browser validation.

Argon returned scenarios; two performance scenarios were reworded to "not
slower than before" because the current implementation already serializes
characters for its pre-check, and one expectation was changed to "same patch as
the current implementation".

#### 6.2.6 Implementation of C

Tests first (Sonnet subagent), appended to the pack's
`files-1.10/src/ts/storage/risuSavePatcher.test.ts` (+573 lines, no existing
line changed). A server copy is modelled with the server's own `applyPatch`
flags and `utils.cjs` `calculateHash`. Groups: A absent keys, B character
identity edge cases, C absent `botPresets`/`modules`, D rollback, E external
readers, F 2,000 seeded random sequences. Two scenarios (A2, A3) first
expected a `remove` for a root key whose data value is `undefined`; the current
behavior (normalized to `null`, consistent on both sides) falls under "must
stay unchanged", so they were rewritten as guards. Against the old class: 12
failed (A1b, A3b, B1, B2, B3×3, C1×3, C3, F1), 82 passed, all pre-existing tests
passed.

Implementation (Opus subagent), class `RisuSavePatcher` only:

- one `state` object (`db`, `rootHashes`, per-position `charHashes`, the
  pre-check caches; `lastCharJsons` became per-position); rollback restores it
  with one assignment;
- four mutation points: `replaceBaseline`, `writeRootKey` (an `undefined` value
  removes the key and its memo), `writeCharacters`, `writeCharacterAt`; the old
  end-of-`set()` baseline assembly was removed;
- `hash()` folds characters by position and computes a missing memo entry from
  the baseline;
- absent `botPresets`/`modules` produce `add`; a present non-array value is
  replaced whole;
- the `fast-json-patch` import is awaited before the state swap, so no other
  call can observe a half-built state;
- `lastSyncedDb` is a read-only getter; no outside code assigns it.

Intended behavior changes, limited to states the old class already handled
incorrectly: no `undefined`-valued keys; `add` for absent keys; edits to
characters without a `chaId` are now diffed by position and sent (before, they
were not sent); a duplicated `chaId` can no longer match another character's
cached JSON.

Results:

| Check | Old class | New class |
|---|---|---|
| Fixed test file | 12 fail / 82 pass | 94 pass |
| Installed-tree frontend suite | 12 fail (the fixed file) / 2,522 pass | 2,534 pass |
| Installed-tree server suite | 652 pass / 12 skipped | 652 pass / 12 skipped |
| `svelte-check --threshold error` | — | 0 errors |
| Patcher `npm test` | — | 341 pass / 0 fail / 3 skipped |
| Installer apply then plan | — | 0 changes; installed file equals pack file |

Reported by the implementer and not re-run by the reviewer: a differential run
of old and new on well-formed data (3,000 seeded sequences plus the
500/2,000/5,000-character databases, 13,603 states) with 0 differences in hash,
expected hash and patch; median `set()`+`hash()` times old → new: 500
characters 5.87 → 5.38 ms and 4.62 → 4.03 ms, 2,000 characters 23.23 → 19.38 ms
and 22.97 → 21.05 ms, 5,000 characters 80.61 → 71.66 ms and 63.43 → 53.72 ms
(one character plus one root key, and one root key).

Reviewer checks: fixed-test hash unchanged; full diff read; the fixed tests
plus `globalApi.savePersistence.test.ts` on the applied tree 111/111; patcher
`npm test` 341/0/3; frontend build 8,031 modules; rebuilt BG bundle loads
(`sendChat=function`) and contains the new class. Structural audit (L3): no
input-fitted branches, no weakened or skipped assertions, no new error
swallowing, no outside writes to the patcher's internals.

Browser runs on the applied build (fresh database):

| Case | Result |
|---|---|
| New save | Patches 200 from first-run setup on, no 409/500, no statistics error, rename kept after reload |
| Normal saves | Note and name edits: patch 200, kept after reload |
| Two-tab conflict | Not exercisable: the app deactivates the second tab ("other tab is active") and reloads it on confirmation, so no conflict is produced |
| Server log | No bundle errors, no hash mismatch |

Not verified: the real conflict/rebase path in a browser (blocked by the tab
guard; covered by unit tests D1/D3 and the unchanged `globalApi` rebase code);
a server-side use of the bundled patcher during BG generation (needs a real
model call). Observation: a native `beforeunload` prompt appeared on reloads
about six seconds after an edit (resolved in section 6.3).

#### 6.2.7 Delivery and device check of C

Commits `2bda466` (implementation, tests, design document) and `ce639a6`
(this record) were pushed; CI succeeded. Delivered with the procedure of
section 5 in 14:56:30–14:57:55 UTC; readback: root 200, PM2 online with 0
unstable restarts, served entry matched disk, installed `risuSave.ts` equal
to the pack file and present in the rebuilt BG bundle, 5 database
`quick_check` ok, status current with lazy-chat-sync 0.5.9, 412 old assets
retained, no new error-log lines after start. Backup:
`backups/20261017-pre-exp60`.

The user reported on the device: a BG generation completed and remained after
reload; persona memo saves, gallery card size, folder create/duplicate/import
persistence, Korean labels and K/M usage counts were all normal.

### 6.3 Reload confirmation prompt

The browser's "changes may not be saved" prompt on reload comes from
`src/preload.ts`, which registers an unconditional `beforeunload` handler. The
file is identical to pristine PocketRisu 1.10.0, so the prompt is upstream
behavior; browsers show it only after user interaction with the page. No
change was made.

### 6.4 Post-assembly edit warnings on a new chat's first answer

After C was delivered, the user saw two warnings on a new chat's first BG
answer: the response was saved without post-assembly edits, and the
conversation changed after preparation. A record from 2026-10-16 describes the
same symptom; one cause (native `getChatVar` initializing `scriptstate` on
read) was fixed in `0.2.4-experimental.54`, and other paths were listed as not
covered.

Code reading (no data opened):

- `promptInputsChanged` (lazy-chat-bg-adapter `serverChatAssemblyContext.cjs`)
  compares 14 chat fields and 7 message fields between the assembly snapshot
  and the latest canonical chat and returns one boolean; only that boolean is
  persisted, and the assembly snapshot is not stored, so the changed fields
  cannot be recovered from data.
- Remaining paths that can change compared fields on a new chat: slash
  `getvar` initializes `scriptstate` on read (`command.ts`), variable writes
  and triggers create `scriptstate`, lore writes change `localLore`, and
  database normalizers add empty `note`/`localLore`. Which one ran was not
  determined.
- The client patch built by `RisuSavePatcher` carries chat stubs (id, name,
  date, folder, `modules`); `modules` is the only compared field it can touch.
  For well-formed data C's patches were identical to the old ones, so C is
  unlikely to be the cause (inference).

Change `fb0251b` (lazy-chat-bg-adapter 0.7.61, `.61`): the flag is derived
from a comparison that also returns change descriptors, and the commit owner
logs one line `[bg-assembly] prompt inputs changed op=<id> changes=…` (field
names, change kind, message indexes and count; no values; at most 32 entries).
The flag, receipts, notices and commit ordering are unchanged; equivalence
with the old function was tested over 6,004 cases. Server suite 663 pass / 12
skipped (652 before plus 11 new); patcher `npm test` 341/0/3. Delivered
15:29:41–15:30:42 UTC with the same procedure and readback (adapter 0.7.61,
444 old assets retained). Backup: `backups/20261017-pre-exp61`. The cause is to
be read from that log line the next time the warning appears.

### 6.5 Follow-up on the open items

The user asked to close the remaining items. Results:

| Item | Result |
|---|---|
| Slash `getvar` initializes `scriptstate` on read | Fixed in `4ba4c68` (lazy-chat-bg-adapter 0.7.62, `.62`) after a written plan (`docs/POCKETRISU-SLASH-GETVAR-READ-ONLY-PLAN.md`) and an adversarial review. Runs only for `/` input and trigger `command`/`v2Command` effects. Tests fail on the old code for the mutation (2 of 4) and pass after; frontend suite 2,538 pass (baseline 2,534 plus 4 new), `svelte-check` 0 errors, patcher 341/0/3. Whether it caused the observed warning is still unknown |
| Normalizers adding empty `note`/`localLore` | Not a defect for this warning: a new chat already has both fields, and the assembly snapshot is cloned before normalization (ordering partly inferred). No change |
| Real conflict/rebase of C in a browser | Verified. The tab guard is a server-side session lock; a second browser context wrote without a session header (request header removed by the harness only). The first page's next patch got 409 (`expected=1645706d, server=7f02515`), logged "rebasing", re-read and patched 200; a fresh load showed both changes; no statistics error |
| K5: server use of the bundled patcher | Not used during a BG generation. A synthetic-provider BG run completed with temporary entry logs in the isolated bundle's `RisuSavePatcher.init`/`set` and `saveDb`: 0 lines. Statically, the orchestrator uses only the bundle's database get/set; nothing calls `saveDb`. Limit: no positive control for `console.warn` from the bundle |
| K7: first-run hash difference | Both builds write an empty database (14 bytes) at first run. Pristine drops its cache after the write and re-reads `{}` (hash `11`), so its first patch gets 409 and a full write. The patched server canonicalizes the written database, adding `characters: []`, and caches it (hash `7a5af0c2`, equal to the client baseline), so its first patch succeeds |

New observation, not investigated: on a fresh isolated install of the patched
build, a chat created with "Create from Scratch" failed to save its content
(`GET /api/chat-content/…` 404, client `ChatConflictError: Chat was removed on
the server`, retried about every 1.5 s); pristine saved it. Whether this
affects existing saves is unknown.

## 7. Incidents

- A diagnostic copy was made without excluding the application's `backups/`
  directory; the disk reached 98% (2.7 GB free). The copy was deleted
  immediately; the live process stayed online with no out-of-space errors.
  Three superseded scratch copies were then removed by exact path.
- An earlier statement that the patcher is not used by the server was wrong
  (see K5); it was found by the verification step.
- The host rebooted at 12:47 UTC while the C implementation was running. All
  temporary trees, harnesses, the saved patch of the first fix and earlier
  validation evidence in temporary storage were lost. The live application was
  restarted by PM2 (online, 0 unstable restarts, root 200). The repository
  worktree survived; the fixed test file was confirmed unchanged by hash, the
  run trees were rebuilt from the live code, and the old class for comparison
  was taken from `git show HEAD:…`.
- After the reboot the live error log showed one new "Restore safety" refusal
  (a pre-restore snapshot was refused because one acknowledged lazy chat write
  still awaits database metadata, the same pending record reported by the
  ChatJournal warning). The regular-expression and tokenizer messages in the
  same log occur at similar rates in the logs before this session.

## 8. Open items

- Cause of the post-assembly edit warning: read the `[bg-assembly]` log line
  at its next occurrence (section 6.4).
- A post-delivery BG plugin run on the diagnostics screen (absent-API record
  of `.56`).
- Delivery of `4ba4c68` to the live installation.
- New-chat content save failure seen on a fresh isolated install (section
  6.5).
- 1.14.0 first-save flow (at upgrade time).
- The rebase merge's strict statistics check (`count()`) was left unchanged as
  an intended invariant.
